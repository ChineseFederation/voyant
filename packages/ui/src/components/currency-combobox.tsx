"use client"

import * as React from "react"

import { currencies } from "../data/geography.generated.js"
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "./combobox.js"

type CurrencyRecord = (typeof currencies)[keyof typeof currencies]
type CurrencyCode = keyof typeof currencies

const ALL_CURRENCIES: CurrencyRecord[] = Object.values(currencies)

function triggerLabel(record: CurrencyRecord | undefined): string {
  if (!record) return ""
  return `${record.code} (${record.symbol})`
}

function matchesSearch(record: CurrencyRecord, q: string): boolean {
  const needle = q.toLowerCase()
  return (
    record.code.toLowerCase().includes(needle) ||
    record.name.toLowerCase().includes(needle) ||
    record.symbol.toLowerCase().includes(needle)
  )
}

export interface CurrencyComboboxProps {
  value: string | null | undefined
  onChange: (value: string | null) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Forwarded to the input so a `<Label htmlFor>` can associate with it. */
  id?: string
  /** Message shown when no currencies match the search. */
  emptyLabel?: string
}

/** Resolve typed text to a canonical currency code, or `null` if it is not one. */
function resolveTypedCurrencyCode(text: string): CurrencyCode | null {
  const code = text.trim().toUpperCase()
  if (code.length === 3 && Object.hasOwn(currencies, code)) {
    return code as CurrencyCode
  }
  return null
}

/**
 * Currency picker backed by the generated UI projection of the canonical
 * currency list. Trigger displays `CODE (symbol)`; items display `CODE — Name
 * (symbol)`. Searchable across code, name, and symbol.
 *
 * Typing a full ISO code (e.g. `EUR`, case-insensitive) commits it even if the
 * user never picks the matching row from the list, so a typed value is never
 * silently dropped on submit.
 */
export function CurrencyCombobox({
  value,
  onChange,
  placeholder = "Select currency…",
  disabled,
  className,
  id,
  emptyLabel = "No currencies found.",
}: CurrencyComboboxProps) {
  const selected = value ? currencies[value as CurrencyCode] : undefined
  const selectedLabel = triggerLabel(selected)
  const [inputValue, setInputValue] = React.useState(selectedLabel)

  // Keep the input in sync when the selected value changes from the outside.
  React.useEffect(() => {
    setInputValue(selectedLabel)
  }, [selectedLabel])

  // Treat the input as an active search only when it differs from the selected
  // value's display label. When it equals that label — right after a commit, or
  // when opened with an existing value — show the full list rather than
  // filtering by the label (e.g. "EUR (€)"), which matches no item and would
  // leave the dropdown empty.
  const query = inputValue.trim() === selectedLabel.trim() ? "" : inputValue.trim()
  const filtered = React.useMemo(() => {
    if (!query) return ALL_CURRENCIES
    return ALL_CURRENCIES.filter((c) => matchesSearch(c, query))
  }, [query])

  return (
    <Combobox
      items={filtered.map((c) => c.code)}
      value={value ?? null}
      inputValue={inputValue}
      autoHighlight
      disabled={disabled}
      // We filter `items` ourselves (see `query`); disable Base UI's built-in
      // filtering so it doesn't re-filter by the input label and empty the list.
      filter={null}
      itemToStringValue={(code) => triggerLabel(currencies[code as CurrencyCode])}
      onInputValueChange={(next) => {
        setInputValue(next)
        if (!next.trim()) {
          onChange(null)
          return
        }
        // Commit a fully-typed ISO code even when the user never selects the
        // matching row from the list, so typed input is not silently dropped.
        const typedCode = resolveTypedCurrencyCode(next)
        if (typedCode && typedCode !== value) onChange(typedCode)
      }}
      onValueChange={(next) => {
        const code = (next as string | null) ?? null
        onChange(code)
        setInputValue(code ? triggerLabel(currencies[code as CurrencyCode]) : "")
      }}
    >
      <ComboboxInput
        id={id}
        className={className ?? "w-full"}
        placeholder={placeholder}
        disabled={disabled}
        showClear={Boolean(value) && !disabled}
      />
      <ComboboxContent>
        <ComboboxEmpty>{emptyLabel}</ComboboxEmpty>
        <ComboboxList>
          <ComboboxCollection>
            {(code) => {
              const record = currencies[code as CurrencyCode]
              if (!record) return null
              return (
                <ComboboxItem key={record.code} value={record.code}>
                  <span className="truncate">
                    <span className="font-medium">{record.code}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      — {record.name} ({record.symbol})
                    </span>
                  </span>
                </ComboboxItem>
              )
            }}
          </ComboboxCollection>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
