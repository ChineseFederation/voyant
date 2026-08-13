import {
  type ProductOptionRecord,
  useProductOption,
  useProductOptions,
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

import { useSellabilityUiMessagesOrDefault } from "../i18n/index.js"

type Props = {
  productId?: string | null
  value: string | null | undefined
  onChange: (value: string | null) => void
  placeholder?: string
  disabled?: boolean
}

const PAGE_SIZE = 100

export function ProductOptionCombobox({
  productId,
  value,
  onChange,
  placeholder,
  disabled,
}: Props) {
  const messages = useSellabilityUiMessagesOrDefault()
  const [search, setSearch] = React.useState("")
  const listQuery = useProductOptions({
    productId: productId || undefined,
    limit: PAGE_SIZE,
    enabled: !!productId,
  })
  const selectedQuery = useProductOption(value, { enabled: !!value })

  const items = React.useMemo(() => {
    const map = new Map<string, ProductOptionRecord>()
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
      disabled={disabled || !productId}
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
        placeholder={placeholder ?? messages.productOptionCombobox.placeholder}
        showClear={!!value}
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {listQuery.isPending || selectedQuery.isPending
            ? messages.common.loading
            : productId
              ? messages.productOptionCombobox.empty
              : messages.productOptionCombobox.selectProductFirst}
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
