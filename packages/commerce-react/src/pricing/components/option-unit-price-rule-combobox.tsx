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
  type OptionUnitPriceRuleRecord,
  useOptionUnitPriceRule,
  useOptionUnitPriceRules,
} from "../index.js"

type Props = {
  value: string | null | undefined
  onChange: (value: string | null) => void
  placeholder?: string
  disabled?: boolean
}

const PAGE_SIZE = 100

function formatOptionUnitPriceRuleLabel(
  item: Pick<OptionUnitPriceRuleRecord, "optionId" | "unitId">,
) {
  return `${item.optionId} / ${item.unitId}` // i18n-literal-ok: joins stable identifiers.
}

export function OptionUnitPriceRuleCombobox({ value, onChange, placeholder, disabled }: Props) {
  const messages = usePricingUiMessagesOrDefault()
  const [search, setSearch] = React.useState("")
  const listQuery = useOptionUnitPriceRules({ limit: PAGE_SIZE })
  const selectedQuery = useOptionUnitPriceRule(value, { enabled: !!value })

  const items = React.useMemo(() => {
    const map = new Map<string, OptionUnitPriceRuleRecord>()
    for (const item of listQuery.data?.data ?? []) {
      const searchableText = formatOptionUnitPriceRuleLabel(item)
      if (!search || searchableText.toLowerCase().includes(search.toLowerCase())) {
        map.set(item.id, item)
      }
    }
    if (selectedQuery.data) map.set(selectedQuery.data.id, selectedQuery.data)
    return Array.from(map.values())
  }, [listQuery.data?.data, search, selectedQuery.data])

  const itemMap = React.useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const selected = value ? itemMap.get(value) : undefined
  const selectedLabel = selected ? formatOptionUnitPriceRuleLabel(selected) : ""
  const [inputValue, setInputValue] = React.useState(selectedLabel)

  React.useEffect(() => {
    if (selectedLabel) setInputValue(selectedLabel)
  }, [selectedLabel])

  const itemLabel = (id: unknown) => {
    const item = itemMap.get(id as string)
    return item ? formatOptionUnitPriceRuleLabel(item) : ""
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
        const item = id ? itemMap.get(id) : undefined
        setInputValue(item ? formatOptionUnitPriceRuleLabel(item) : "")
      }}
    >
      <ComboboxInput
        placeholder={placeholder ?? messages.comboboxes.optionUnitPriceRule.placeholder}
        showClear={!!value}
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {listQuery.isPending || selectedQuery.isPending
            ? messages.common.loading
            : messages.comboboxes.optionUnitPriceRule.empty}
        </ComboboxEmpty>
        <ComboboxList>
          <ComboboxCollection>
            {(id) => {
              const item = itemMap.get(id as string)
              if (!item) return null
              return (
                <ComboboxItem key={item.id} value={item.id}>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">
                      {item.optionId} / {item.unitId}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {item.pricingMode}
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
