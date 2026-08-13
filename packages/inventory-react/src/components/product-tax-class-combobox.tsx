"use client"

import { useQuery } from "@tanstack/react-query"
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
import { z } from "zod"
import { useProductsUiMessagesOrDefault } from "../i18n/provider.js"
import { fetchWithValidation, useVoyantProductsContext } from "../index.js"

type Props = {
  value: string | null | undefined
  onChange: (value: string | null) => void
  placeholder?: string
  disabled?: boolean
}

const PAGE_SIZE = 100

const taxClassRecordSchema = z
  .object({
    id: z.string(),
    code: z.string(),
    label: z.string(),
    description: z.string().nullable().optional(),
    active: z.boolean(),
  })
  .passthrough()

type TaxClassRecord = z.infer<typeof taxClassRecordSchema>

const taxClassListResponse = z.object({
  data: z.array(taxClassRecordSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
})

const taxClassSingleResponse = z.object({ data: taxClassRecordSchema })

function useTaxClassOptions() {
  const { baseUrl, fetcher } = useVoyantProductsContext()

  return useQuery({
    queryKey: ["voyant", "products-ui", "tax-class-combobox", "list"] as const,
    queryFn: () => {
      const params = new URLSearchParams()
      params.set("limit", String(PAGE_SIZE))
      params.set("active", "true")
      return fetchWithValidation(`/v1/admin/finance/tax-classes?${params}`, taxClassListResponse, {
        baseUrl,
        fetcher,
      })
    },
  })
}

function useSelectedTaxClass(id: string | null | undefined) {
  const { baseUrl, fetcher } = useVoyantProductsContext()

  return useQuery({
    queryKey: ["voyant", "products-ui", "tax-class-combobox", "detail", id] as const,
    queryFn: async () => {
      if (!id) throw new Error("useSelectedTaxClass requires an id")
      const { data } = await fetchWithValidation(
        `/v1/admin/finance/tax-classes/${id}`,
        taxClassSingleResponse,
        { baseUrl, fetcher },
      )
      return data
    },
    enabled: Boolean(id),
  })
}

export function ProductTaxClassCombobox({ value, onChange, placeholder, disabled }: Props) {
  const messages = useProductsUiMessagesOrDefault()
  const [search, setSearch] = React.useState("")
  const listQuery = useTaxClassOptions()
  const selectedQuery = useSelectedTaxClass(value)

  const items = React.useMemo(() => {
    const map = new Map<string, TaxClassRecord>()
    for (const item of listQuery.data?.data ?? []) map.set(item.id, item)
    if (selectedQuery.data) map.set(selectedQuery.data.id, selectedQuery.data)
    const normalizedSearch = search.trim().toLowerCase()
    const values = Array.from(map.values())
    if (!normalizedSearch) return values
    return values.filter(
      (item) =>
        item.label.toLowerCase().includes(normalizedSearch) ||
        item.code.toLowerCase().includes(normalizedSearch),
    )
  }, [listQuery.data?.data, search, selectedQuery.data])

  const itemMap = React.useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const selected = value ? itemMap.get(value) : selectedQuery.data
  const selectedLabel = selected ? `${selected.label} · ${selected.code}` : ""
  const [inputValue, setInputValue] = React.useState(selectedLabel)

  React.useEffect(() => {
    setInputValue(selectedLabel)
  }, [selectedLabel])

  const itemLabel = (id: unknown) => {
    const item = itemMap.get(id as string)
    return item ? `${item.label} · ${item.code}` : ""
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
        setInputValue(item ? `${item.label} · ${item.code}` : "")
      }}
    >
      <ComboboxInput
        placeholder={placeholder ?? messages.comboboxes.taxClass.placeholder}
        showClear={!!value}
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {listQuery.isPending || selectedQuery.isPending
            ? messages.common.loading
            : messages.comboboxes.taxClass.empty}
        </ComboboxEmpty>
        <ComboboxList>
          <ComboboxCollection>
            {(id) => {
              const item = itemMap.get(id as string)
              if (!item) return null
              return (
                <ComboboxItem key={item.id} value={item.id}>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{item.label}</span>
                    <span className="truncate text-xs text-muted-foreground">{item.code}</span>
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
