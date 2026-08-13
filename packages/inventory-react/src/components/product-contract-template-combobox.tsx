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

const contractTemplateRecordSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    scope: z.string(),
    language: z.string(),
    active: z.boolean(),
    isDefault: z.boolean().optional(),
  })
  .passthrough()

type ContractTemplateRecord = z.infer<typeof contractTemplateRecordSchema>

const contractTemplateListResponse = z.object({
  data: z.array(contractTemplateRecordSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
})

const contractTemplateSingleResponse = z.object({ data: contractTemplateRecordSchema })

function useContractTemplateOptions(search: string) {
  const { baseUrl, fetcher } = useVoyantProductsContext()

  return useQuery({
    queryKey: ["voyant", "products-ui", "contract-template-combobox", "list", search] as const,
    queryFn: () => {
      const params = new URLSearchParams()
      params.set("limit", String(PAGE_SIZE))
      params.set("scope", "customer")
      params.set("active", "true")
      if (search.trim()) params.set("search", search.trim())
      return fetchWithValidation(
        `/v1/admin/legal/contracts/templates?${params}`,
        contractTemplateListResponse,
        { baseUrl, fetcher },
      )
    },
  })
}

function useSelectedContractTemplate(id: string | null | undefined) {
  const { baseUrl, fetcher } = useVoyantProductsContext()

  return useQuery({
    queryKey: ["voyant", "products-ui", "contract-template-combobox", "detail", id] as const,
    queryFn: async () => {
      if (!id) throw new Error("useSelectedContractTemplate requires an id")
      const { data } = await fetchWithValidation(
        `/v1/admin/legal/contracts/templates/${id}`,
        contractTemplateSingleResponse,
        { baseUrl, fetcher },
      )
      return data
    },
    enabled: Boolean(id),
  })
}

export function ProductContractTemplateCombobox({ value, onChange, placeholder, disabled }: Props) {
  const messages = useProductsUiMessagesOrDefault()
  const [search, setSearch] = React.useState("")
  const listQuery = useContractTemplateOptions(search)
  const selectedQuery = useSelectedContractTemplate(value)

  const items = React.useMemo(() => {
    const map = new Map<string, ContractTemplateRecord>()
    for (const item of listQuery.data?.data ?? []) map.set(item.id, item)
    if (selectedQuery.data) map.set(selectedQuery.data.id, selectedQuery.data)
    return Array.from(map.values())
  }, [listQuery.data?.data, selectedQuery.data])

  const itemMap = React.useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const selected = value ? itemMap.get(value) : selectedQuery.data
  const selectedLabel = selected ? `${selected.name} · ${selected.language}` : ""
  const [inputValue, setInputValue] = React.useState(selectedLabel)

  React.useEffect(() => {
    setInputValue(selectedLabel)
  }, [selectedLabel])

  const itemLabel = (id: unknown) => {
    const item = itemMap.get(id as string)
    return item ? `${item.name} · ${item.language}` : ""
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
        setInputValue(item ? `${item.name} · ${item.language}` : "")
      }}
    >
      <ComboboxInput
        placeholder={placeholder ?? messages.comboboxes.contractTemplate.placeholder}
        showClear={!!value}
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {listQuery.isPending || selectedQuery.isPending
            ? messages.common.loading
            : messages.comboboxes.contractTemplate.empty}
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
                      {item.slug} · {item.language}
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
