import * as React from "react"
import { countries } from "../data/geography.generated.js"
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "./combobox.js"

type Country = (typeof countries)[number]

const COUNTRY_LIST: readonly Country[] = countries
  .slice()
  .sort((a, b) => a.name.localeCompare(b.name))

const COUNTRY_BY_CODE = new Map<string, Country>()
for (const c of COUNTRY_LIST) COUNTRY_BY_CODE.set(c.code, c)

export type CountryComboboxProps = {
  value: string | null | undefined
  onChange: (code: string | null) => void
  placeholder?: string
  emptyText?: string
  disabled?: boolean
}

export function CountryCombobox({
  value,
  onChange,
  placeholder = "Search countries…",
  emptyText = "No countries found.",
  disabled,
}: CountryComboboxProps) {
  const normalized = value ? value.toUpperCase() : null
  const selectedLabel = React.useMemo(() => {
    if (!normalized) return ""
    const match = COUNTRY_BY_CODE.get(normalized)
    return match ? `${match.name} (${match.code})` : normalized
  }, [normalized])

  const [inputValue, setInputValue] = React.useState(selectedLabel)
  React.useEffect(() => {
    setInputValue(selectedLabel)
  }, [selectedLabel])

  const itemCodes = React.useMemo(() => COUNTRY_LIST.map((c) => c.code), [])

  // base-ui filters and displays via `itemToStringLabel`; the
  // `itemToStringValue` prop is for form submission only. We want
  // searches like "rom" to match Romania, so the label string includes
  // the country name.
  const itemToStringLabel = React.useCallback((code: unknown) => {
    const match = COUNTRY_BY_CODE.get(code as string)
    return match ? `${match.name} (${match.code})` : (code as string)
  }, [])

  return (
    <Combobox
      items={itemCodes}
      value={normalized}
      inputValue={inputValue}
      autoHighlight
      disabled={disabled}
      itemToStringLabel={itemToStringLabel}
      itemToStringValue={(code) => code as string}
      onInputValueChange={(next) => {
        setInputValue(next)
        if (!next) onChange(null)
      }}
      onValueChange={(next) => {
        const code = (next as string | null) ?? null
        onChange(code)
        if (code) {
          const match = COUNTRY_BY_CODE.get(code)
          setInputValue(match ? `${match.name} (${match.code})` : code)
        } else {
          setInputValue("")
        }
      }}
    >
      <ComboboxInput placeholder={placeholder} showClear={!!normalized} />
      <ComboboxContent>
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>
          <ComboboxCollection>
            {(code) => {
              const country = COUNTRY_BY_CODE.get(code as string)
              if (!country) return null
              return (
                <ComboboxItem key={country.code} value={country.code}>
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                    <span className="truncate">{country.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{country.code}</span>
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
