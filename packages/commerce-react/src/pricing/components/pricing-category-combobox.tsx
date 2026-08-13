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
import * as React from "react"
import { usePricingUiMessagesOrDefault } from "../i18n/provider.js"
import { type PricingCategoryRecord, usePricingCategories } from "../index.js"

type PricingCategoryComboboxProps = {
  value: string | null | undefined
  onChange: (value: string | null) => void
  placeholder?: string
  disabled?: boolean
}

const PAGE_SIZE = 25

export function PricingCategoryCombobox({
  value,
  onChange,
  placeholder,
  disabled,
}: PricingCategoryComboboxProps) {
  const messages = usePricingUiMessagesOrDefault()
  const [search, setSearch] = React.useState("")
  const { data, isPending } = usePricingCategories({
    search: search || undefined,
    limit: PAGE_SIZE,
    active: undefined,
  })

  const items = data?.data ?? []
  const itemMap = React.useMemo(() => {
    const map = new Map<string, PricingCategoryRecord>()
    for (const item of items) map.set(item.id, item)
    return map
  }, [items])
  const selected = value ? itemMap.get(value) : undefined
  const selectedLabel = selected
    ? `${selected.name}${selected.code ? ` (${selected.code})` : ""}`
    : ""
  const [inputValue, setInputValue] = React.useState(selectedLabel)

  React.useEffect(() => {
    if (selectedLabel) setInputValue(selectedLabel)
  }, [selectedLabel])

  const itemLabel = (id: unknown) => {
    const item = itemMap.get(id as string)
    return item ? `${item.name}${item.code ? ` (${item.code})` : ""}` : ""
  }

  return (
    <Combobox
      items={items.map((item) => item.id)}
      value={value ?? null}
      inputValue={inputValue}
      autoHighlight
      disabled={disabled}
      itemToStringLabel={itemLabel}
      itemToStringValue={itemLabel}
      onInputValueChange={(next) => {
        setInputValue(next)
        setSearch(next)
        if (!next) onChange(null)
      }}
      onValueChange={(next) => {
        const id = (next as string | null) ?? null
        onChange(id)
        if (!id) {
          setInputValue("")
          return
        }
        const item = itemMap.get(id)
        const label = item ? `${item.name}${item.code ? ` (${item.code})` : ""}` : ""
        setInputValue(label)
      }}
    >
      <ComboboxInput
        placeholder={placeholder ?? messages.comboboxes.pricingCategory.placeholder}
        showClear={!!value}
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {isPending ? messages.common.loading : messages.comboboxes.pricingCategory.empty}
        </ComboboxEmpty>
        <ComboboxList>
          <ComboboxCollection>
            {(id) => {
              const item = itemMap.get(id as string)
              if (!item) return null
              return (
                <ComboboxItem key={item.id} value={item.id}>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{item.name}</span>
                    {item.code ? (
                      <span className="truncate text-xs text-muted-foreground">{item.code}</span>
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
