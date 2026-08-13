"use client"

import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@voyant-travel/ui/components/combobox"
import { useEffect, useMemo, useState } from "react"

/**
 * Widest page `/v1/admin/distribution/channels` accepts. The channel pickers
 * filter client-side because the endpoint exposes no `search`, so they ask for
 * the cap; anything above it is rejected as `too_big` and the picker is empty.
 */
export const CHANNEL_PAGE_LIMIT = 200

/** A searchable-select option: stable id + label, optional secondary line. */
export interface ComboboxOption {
  value: string
  label: string
  description?: string
}

/**
 * Merge option groups by value, later groups winning. Used to splice the
 * currently-selected record (fetched by id) into the searched list page so
 * the selection keeps its label even when it falls outside the page.
 */
export function mergeUniqueOptions(
  ...groups: Array<ComboboxOption[] | undefined>
): ComboboxOption[] {
  const map = new Map<string, ComboboxOption>()
  for (const group of groups) {
    for (const option of group ?? []) {
      map.set(option.value, option)
    }
  }
  return Array.from(map.values())
}

/**
 * Server-search-backed combobox shared by the legal admin dialogs: the
 * option list comes from a domain list hook (re-queried via
 * `onSearchChange`), the selected record's label from a matching detail
 * hook merged in via {@link mergeUniqueOptions}.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  loadingLabel,
  loading,
  disabled,
  onSearchChange,
}: {
  value: string | null | undefined
  onChange: (value: string | null) => void
  options: ComboboxOption[]
  placeholder: string
  searchPlaceholder?: string
  emptyLabel: string
  loadingLabel: string
  loading?: boolean
  disabled?: boolean
  onSearchChange?: (value: string) => void
}) {
  const optionMap = useMemo(
    () => new Map(options.map((option) => [option.value, option])),
    [options],
  )
  const selected = value ? optionMap.get(value) : undefined
  const selectedLabel = selected?.label ?? ""
  const [inputValue, setInputValue] = useState(selectedLabel)

  useEffect(() => {
    setInputValue(selectedLabel)
  }, [selectedLabel])

  return (
    <Combobox
      items={options.map((option) => option.value)}
      value={value ?? null}
      inputValue={inputValue}
      autoHighlight
      disabled={disabled}
      // base-ui matches the typed query against the item's *label* string, and
      // filters everything out when it is left to stringify the raw id.
      itemToStringLabel={(id) => optionMap.get(id as string)?.label ?? ""}
      itemToStringValue={(id) => optionMap.get(id as string)?.label ?? ""}
      onInputValueChange={(next) => {
        setInputValue(next)
        onSearchChange?.(next)
        if (!next) onChange(null)
      }}
      onValueChange={(next) => {
        const resolved = (next as string | null) ?? null
        onChange(resolved)
        setInputValue(resolved ? (optionMap.get(resolved)?.label ?? "") : "")
      }}
    >
      <ComboboxInput
        placeholder={searchPlaceholder ?? placeholder}
        showClear={!!value}
        disabled={disabled}
      />
      <ComboboxContent>
        <ComboboxEmpty>{loading ? loadingLabel : emptyLabel}</ComboboxEmpty>
        <ComboboxList>
          <ComboboxCollection>
            {(id) => {
              const option = optionMap.get(id as string)
              if (!option) return null
              return (
                <ComboboxItem key={option.value} value={option.value}>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{option.label}</span>
                    {option.description ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    ) : null}
                  </div>
                </ComboboxItem>
              )
            }}
          </ComboboxCollection>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
