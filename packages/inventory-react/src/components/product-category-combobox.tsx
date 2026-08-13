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
import { useProductsUiMessagesOrDefault } from "../i18n/provider.js"
import { type ProductCategoryRecord, useProductCategories, useProductCategory } from "../index.js"

type Props = {
  value: string | null | undefined
  onChange: (value: string | null) => void
  placeholder?: string
  disabled?: boolean
  excludeId?: string | null
}

const PAGE_SIZE = 25

export function ProductCategoryCombobox({
  value,
  onChange,
  placeholder,
  disabled,
  excludeId,
}: Props) {
  const messages = useProductsUiMessagesOrDefault()
  const [search, setSearch] = React.useState("")
  const listQuery = useProductCategories({ search: search || undefined, limit: PAGE_SIZE })
  const selectedQuery = useProductCategory(value, { enabled: !!value })

  const items = React.useMemo(() => {
    const map = new Map<string, ProductCategoryRecord>()
    for (const item of listQuery.data?.data ?? []) {
      if (item.id !== excludeId) map.set(item.id, item)
    }
    if (selectedQuery.data && selectedQuery.data.id !== excludeId) {
      map.set(selectedQuery.data.id, selectedQuery.data)
    }
    return Array.from(map.values())
  }, [excludeId, listQuery.data?.data, selectedQuery.data])

  const itemMap = React.useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const selected = value ? itemMap.get(value) : undefined
  const selectedLabel = selected ? selected.name : ""
  const [inputValue, setInputValue] = React.useState(selectedLabel)

  React.useEffect(() => {
    setInputValue(selectedLabel)
  }, [selectedLabel])

  return (
    <Combobox
      items={items.map((item) => item.id)}
      value={value ?? null}
      inputValue={inputValue}
      autoHighlight
      disabled={disabled}
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
        placeholder={placeholder ?? messages.comboboxes.productCategory.placeholder}
        showClear={!!value}
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {listQuery.isPending || selectedQuery.isPending
            ? messages.common.loading
            : messages.comboboxes.productCategory.empty}
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
                    <span className="truncate text-xs text-muted-foreground">{item.slug}</span>
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
