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
import {
  type CancellationPolicyRecord,
  useCancellationPolicies,
  useCancellationPolicy,
} from "../index.js"

type Props = {
  value: string | null | undefined
  onChange: (value: string | null) => void
  placeholder?: string
  disabled?: boolean
}

const PAGE_SIZE = 25

export function CancellationPolicyCombobox({ value, onChange, placeholder, disabled }: Props) {
  const messages = usePricingUiMessagesOrDefault()
  const [search, setSearch] = React.useState("")
  const listQuery = useCancellationPolicies({ search: search || undefined, limit: PAGE_SIZE })
  const selectedQuery = useCancellationPolicy(value, { enabled: !!value })

  const items = React.useMemo(() => {
    const map = new Map<string, CancellationPolicyRecord>()
    for (const item of listQuery.data?.data ?? []) map.set(item.id, item)
    if (selectedQuery.data) map.set(selectedQuery.data.id, selectedQuery.data)
    return Array.from(map.values())
  }, [listQuery.data?.data, selectedQuery.data])

  const itemMap = React.useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const selected = value ? itemMap.get(value) : undefined
  const selectedLabel = selected
    ? `${selected.name}${selected.code ? ` · ${selected.code}` : ""}`
    : ""
  const [inputValue, setInputValue] = React.useState(selectedLabel)

  React.useEffect(() => {
    if (selectedLabel) setInputValue(selectedLabel)
  }, [selectedLabel])

  const itemLabel = (id: unknown) => {
    const item = itemMap.get(id as string)
    return item ? `${item.name}${item.code ? ` · ${item.code}` : ""}` : ""
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
        const item = id ? itemMap.get(id) : null
        setInputValue(item ? `${item.name}${item.code ? ` · ${item.code}` : ""}` : "")
      }}
    >
      <ComboboxInput
        placeholder={placeholder ?? messages.comboboxes.cancellationPolicy.placeholder}
        showClear={!!value}
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {listQuery.isPending || selectedQuery.isPending
            ? messages.common.loading
            : messages.comboboxes.cancellationPolicy.empty}
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
