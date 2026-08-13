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

import { usePricingUiMessagesOrDefault } from "../i18n/provider.js"
import { fetchWithValidation, useVoyantPricingContext } from "../index.js"

type Props = {
  value: string | null | undefined
  onChange: (value: string | null) => void
  placeholder?: string
  disabled?: boolean
}

const PAGE_SIZE = 25

const productExtraRecordSchema = z
  .object({
    id: z.string(),
    productId: z.string().nullable().optional(),
    code: z.string().nullable().optional(),
    name: z.string(),
    active: z.boolean().nullable().optional(),
  })
  .passthrough()

type ProductExtraRecord = z.infer<typeof productExtraRecordSchema>

const productExtraListResponse = z.object({
  data: z.array(productExtraRecordSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
})

const productExtraSingleResponse = z.object({ data: productExtraRecordSchema })

function useProductExtraOptions(search: string) {
  const { baseUrl, fetcher } = useVoyantPricingContext()

  return useQuery({
    queryKey: ["voyant", "pricing-ui", "product-extra-combobox", "list", { search }] as const,
    queryFn: () => {
      const params = new URLSearchParams()
      params.set("limit", String(PAGE_SIZE))
      params.set("active", "true")
      if (search) params.set("search", search)
      return fetchWithValidation(
        `/v1/admin/extras/product-extras?${params}`,
        productExtraListResponse,
        { baseUrl, fetcher },
      )
    },
  })
}

function useSelectedProductExtra(id: string | null | undefined) {
  const { baseUrl, fetcher } = useVoyantPricingContext()

  return useQuery({
    queryKey: ["voyant", "pricing-ui", "product-extra-combobox", "detail", id] as const,
    queryFn: async () => {
      if (!id) throw new Error("useSelectedProductExtra requires an id")
      const { data } = await fetchWithValidation(
        `/v1/admin/extras/product-extras/${id}`,
        productExtraSingleResponse,
        { baseUrl, fetcher },
      )
      return data
    },
    enabled: Boolean(id),
  })
}

export function ProductExtraCombobox({ value, onChange, placeholder, disabled }: Props) {
  const messages = usePricingUiMessagesOrDefault()
  const [search, setSearch] = React.useState("")
  const listQuery = useProductExtraOptions(search)
  const selectedQuery = useSelectedProductExtra(value)

  const items = React.useMemo(() => {
    const map = new Map<string, ProductExtraRecord>()
    for (const item of listQuery.data?.data ?? []) map.set(item.id, item)
    if (selectedQuery.data) map.set(selectedQuery.data.id, selectedQuery.data)
    return Array.from(map.values())
  }, [listQuery.data?.data, selectedQuery.data])

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
        placeholder={placeholder ?? messages.comboboxes.productExtra.placeholder}
        showClear={!!value}
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {listQuery.isPending || selectedQuery.isPending
            ? messages.common.loading
            : messages.comboboxes.productExtra.empty}
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
