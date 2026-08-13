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

const PAGE_SIZE = 25

const facilityRecordSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    kind: z.string().nullable().optional(),
    code: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
  })
  .passthrough()

type FacilityRecord = z.infer<typeof facilityRecordSchema>

const facilityListResponse = z.object({
  data: z.array(facilityRecordSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
})

const facilitySingleResponse = z.object({ data: facilityRecordSchema })

function useFacilityOptions(search: string) {
  const { baseUrl, fetcher } = useVoyantProductsContext()

  return useQuery({
    queryKey: ["voyant", "products-ui", "facility-combobox", "list", { search }] as const,
    queryFn: () => {
      const params = new URLSearchParams()
      params.set("limit", String(PAGE_SIZE))
      params.set("status", "active")
      if (search) params.set("search", search)
      return fetchWithValidation(
        `/v1/admin/operations/facilities?${params}`,
        facilityListResponse,
        {
          baseUrl,
          fetcher,
        },
      )
    },
  })
}

function useSelectedFacility(id: string | null | undefined) {
  const { baseUrl, fetcher } = useVoyantProductsContext()

  return useQuery({
    queryKey: ["voyant", "products-ui", "facility-combobox", "detail", id] as const,
    queryFn: async () => {
      if (!id) throw new Error("useSelectedFacility requires an id")
      const { data } = await fetchWithValidation(
        `/v1/admin/operations/facilities/${id}`,
        facilitySingleResponse,
        { baseUrl, fetcher },
      )
      return data
    },
    enabled: Boolean(id),
  })
}

export function ProductFacilityCombobox({ value, onChange, placeholder, disabled }: Props) {
  const messages = useProductsUiMessagesOrDefault()
  const [search, setSearch] = React.useState("")
  const listQuery = useFacilityOptions(search)
  const selectedQuery = useSelectedFacility(value)

  const items = React.useMemo(() => {
    const map = new Map<string, FacilityRecord>()
    for (const item of listQuery.data?.data ?? []) map.set(item.id, item)
    if (selectedQuery.data) map.set(selectedQuery.data.id, selectedQuery.data)
    return Array.from(map.values())
  }, [listQuery.data?.data, selectedQuery.data])

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
        placeholder={placeholder ?? messages.comboboxes.facility.placeholder}
        showClear={!!value}
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {listQuery.isPending || selectedQuery.isPending
            ? messages.common.loading
            : messages.comboboxes.facility.empty}
        </ComboboxEmpty>
        <ComboboxList>
          <ComboboxCollection>
            {(id) => {
              const item = itemMap.get(id as string)
              if (!item) return null
              const subtitle = [item.kind, item.code, item.country].filter(Boolean).join(" · ")
              return (
                <ComboboxItem key={item.id} value={item.id}>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{item.name}</span>
                    {subtitle ? (
                      <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
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
