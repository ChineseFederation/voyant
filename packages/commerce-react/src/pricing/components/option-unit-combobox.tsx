import {
  type OptionUnitRecord,
  useOptionUnit,
  useOptionUnits,
} from "@voyant-travel/inventory-react"
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

type Props = {
  optionId?: string | null
  value: string | null | undefined
  onChange: (value: string | null) => void
  placeholder?: string
  disabled?: boolean
  requireOption?: boolean
}

const PAGE_SIZE = 100

export function OptionUnitCombobox({
  optionId,
  value,
  onChange,
  placeholder,
  disabled,
  requireOption = true,
}: Props) {
  const messages = usePricingUiMessagesOrDefault()
  const [search, setSearch] = React.useState("")
  const listQuery = useOptionUnits({
    optionId: optionId || undefined,
    limit: PAGE_SIZE,
    enabled: !requireOption || !!optionId,
  })
  const selectedQuery = useOptionUnit(value ?? undefined, { enabled: !!value })

  const items = React.useMemo(() => {
    const map = new Map<string, OptionUnitRecord>()
    for (const item of listQuery.data?.data ?? []) {
      if (!search || item.name.toLowerCase().includes(search.toLowerCase())) map.set(item.id, item)
    }
    if (selectedQuery.data) map.set(selectedQuery.data.id, selectedQuery.data)
    return Array.from(map.values())
  }, [listQuery.data?.data, search, selectedQuery.data])

  const itemMap = React.useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const selected = value ? itemMap.get(value) : undefined
  const selectedLabel = selected ? selected.name : ""
  const [inputValue, setInputValue] = React.useState(selectedLabel)

  React.useEffect(() => {
    if (selectedLabel) setInputValue(selectedLabel)
  }, [selectedLabel])

  return (
    <Combobox
      items={items.map((item) => item.id)}
      value={value ?? null}
      inputValue={inputValue}
      autoHighlight
      disabled={disabled || (requireOption && !optionId)}
      itemToStringLabel={(id) => itemMap.get(id as string)?.name ?? ""}
      itemToStringValue={(id) => itemMap.get(id as string)?.name ?? ""}
      onInputValueChange={(next) => {
        setInputValue(next)
        setSearch(next)
        if (!next) onChange(null)
      }}
      onValueChange={(next) => {
        const id = (next as string | null) ?? null
        onChange(id)
        setInputValue(id ? (itemMap.get(id)?.name ?? "") : "")
      }}
    >
      <ComboboxInput
        placeholder={placeholder ?? messages.comboboxes.optionUnit.placeholder}
        showClear={!!value}
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {listQuery.isPending || selectedQuery.isPending
            ? messages.common.loading
            : optionId || !requireOption
              ? messages.comboboxes.optionUnit.empty
              : messages.comboboxes.optionUnit.missingParent}
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
                    <span className="truncate text-xs text-muted-foreground">
                      {[item.code, item.unitType].filter(Boolean).join(" / ")}
                    </span>
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
