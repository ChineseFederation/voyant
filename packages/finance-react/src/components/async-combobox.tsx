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
import { Plus } from "lucide-react"
import { useEffect, useRef, useState } from "react"

export interface AsyncComboboxOption {
  value: string
  label: string
}

/** Client-side typeahead over already-loaded options (no server round-trip). */
export const localOptionSearch =
  (options: AsyncComboboxOption[]) =>
  (query: string): Promise<AsyncComboboxOption[]> => {
    const q = query.trim().toLowerCase()
    return Promise.resolve(q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options)
  }

export interface AsyncComboboxProps {
  value: string | null | undefined
  onChange: (value: string | null) => void
  /** Resolve options for a query (debounced). */
  search: (query: string) => Promise<AsyncComboboxOption[]>
  /**
   * Opaque key for whatever else {@link search} depends on — a dependent
   * picker's parent selection, say. `search` is re-run whenever it changes, so
   * the list is not left holding results resolved against the previous value.
   * Callers who pass a plain `search` do not need it.
   */
  searchKey?: string
  /**
   * When set, an inline "create" row appears for the current query (unless it
   * exactly matches an existing option). Returns the new option to select, or
   * null to cancel.
   */
  onCreate?: (query: string) => Promise<AsyncComboboxOption | null>
  /** Label for the inline create row; receives the trimmed query. */
  createLabel?: (query: string) => string
  placeholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
}

const CREATE_SENTINEL = "__async_combobox_create__"

/**
 * A generic search-as-you-type combobox backed by an async resolver. Keeps a
 * label cache so a previously-selected value still renders a friendly label
 * (falls back to the raw value when unknown). Used for picking departures /
 * products / bookings by search rather than typing a raw id.
 */
export function AsyncCombobox({
  value,
  onChange,
  search,
  searchKey,
  onCreate,
  createLabel,
  placeholder = "Search…", // i18n-literal-ok (generic fallback; callers pass localized copy)
  emptyText = "No results.",
  disabled,
  className,
}: AsyncComboboxProps) {
  const [query, setQuery] = useState("")
  const [options, setOptions] = useState<AsyncComboboxOption[]>([])
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [inputValue, setInputValue] = useState("")
  const [creating, setCreating] = useState(false)

  // Options on screen were resolved against the previous `searchKey`; drop them
  // as soon as it changes rather than offering them until the next resolve lands.
  const [resolvedFor, setResolvedFor] = useState(searchKey)
  if (resolvedFor !== searchKey) {
    setResolvedFor(searchKey)
    setOptions([])
  }

  const onCreateRef = useRef(onCreate)
  onCreateRef.current = onCreate

  // Latest search fn via ref so the debounce effect re-runs on the query and on
  // `searchKey` only — callers pass an inline arrow, whose identity changes every
  // render.
  const searchRef = useRef(search)
  searchRef.current = search

  // biome-ignore lint/correctness/useExhaustiveDependencies: searchKey is the meaningful-change signal; the resolver it keys is read off searchRef so the effect doesn't re-fire on every render -- owner: finance-react
  useEffect(() => {
    let active = true
    const handle = setTimeout(() => {
      searchRef
        .current(query)
        .then((results) => {
          if (!active) return
          setOptions(results)
          setLabels((prev) => {
            const next = { ...prev }
            for (const o of results) next[o.value] = o.label
            return next
          })
        })
        .catch(() => {
          if (active) setOptions([])
        })
    }, 200)
    return () => {
      active = false
      clearTimeout(handle)
    }
  }, [query, searchKey])

  // Reflect the selected value's label (or raw id) in the input.
  useEffect(() => {
    setInputValue(value ? (labels[value] ?? value) : "")
  }, [value, labels])

  const trimmed = query.trim()
  const hasExactMatch = options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase())
  const showCreate = Boolean(onCreate) && trimmed.length > 0 && !hasExactMatch && !creating
  const createRowLabel = (createLabel ?? ((q) => `Create "${q}"`))(trimmed)

  const items = showCreate
    ? [...options.map((o) => o.value), CREATE_SENTINEL]
    : options.map((o) => o.value)

  const create = () => {
    const fn = onCreateRef.current
    if (!fn) return
    const name = query.trim()
    if (!name) return
    setCreating(true)
    fn(name)
      .then((opt) => {
        if (!opt) return
        setLabels((prev) => ({ ...prev, [opt.value]: opt.label }))
        onChange(opt.value)
        setInputValue(opt.label)
        setQuery("")
      })
      .finally(() => setCreating(false))
  }

  const itemLabel = (v: unknown) =>
    v === CREATE_SENTINEL ? createRowLabel : (labels[v as string] ?? (v as string))

  return (
    <Combobox
      items={items}
      value={value ?? null}
      inputValue={inputValue}
      autoHighlight
      disabled={disabled || creating}
      itemToStringLabel={itemLabel}
      itemToStringValue={itemLabel}
      onInputValueChange={(next) => {
        setInputValue(next)
        setQuery(next)
        if (!next) onChange(null)
      }}
      onValueChange={(next) => {
        const v = (next as string | null) ?? null
        if (v === CREATE_SENTINEL) {
          create()
          return
        }
        onChange(v)
        setInputValue(v ? (labels[v] ?? v) : "")
      }}
    >
      <ComboboxInput
        className={className ?? "w-full"}
        placeholder={placeholder}
        disabled={disabled || creating}
        showClear={Boolean(value) && !disabled && !creating}
      />
      <ComboboxContent>
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>
          <ComboboxCollection>
            {(v) =>
              v === CREATE_SENTINEL ? (
                <ComboboxItem key={CREATE_SENTINEL} value={CREATE_SENTINEL}>
                  <Plus className="size-4 shrink-0" />
                  <span className="truncate">{createRowLabel}</span>
                </ComboboxItem>
              ) : (
                <ComboboxItem key={v as string} value={v as string}>
                  <span className="truncate">{labels[v as string] ?? (v as string)}</span>
                </ComboboxItem>
              )
            }
          </ComboboxCollection>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
