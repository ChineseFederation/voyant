"use client"

import { AsyncCombobox } from "@voyant-travel/ui/components/async-combobox"
import * as React from "react"
import { useProductsUiMessagesOrDefault } from "../i18n/provider.js"
import { type ProductSummaryRecord, useProduct, useProductSummaries } from "../index.js"

export interface ProductComboboxProps {
  value: string | null | undefined
  onChange: (value: string | null) => void
  placeholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
  triggerClassName?: string
  clearable?: boolean
  limit?: number
}

const DEFAULT_LIMIT = 20

function compact(parts: Array<string | null | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean) as string[]
}

function formatProductSecondary(product: ProductSummaryRecord) {
  return compact([product.status, product.bookingMode, product.sellCurrency]).join(" - ")
}

export function ProductCombobox({
  value,
  onChange,
  placeholder,
  emptyText,
  disabled,
  className,
  triggerClassName,
  clearable = true,
  limit = DEFAULT_LIMIT,
}: ProductComboboxProps) {
  const messages = useProductsUiMessagesOrDefault()
  const comboboxMessages = messages.comboboxes.product
  const [search, setSearch] = React.useState("")
  const listQuery = useProductSummaries({ search: search || undefined, limit })
  const selectedQuery = useProduct(value ?? undefined, { enabled: Boolean(value) })

  return (
    <AsyncCombobox<ProductSummaryRecord>
      value={value ?? null}
      onChange={onChange}
      items={listQuery.data?.data ?? []}
      selectedItem={selectedQuery.data ?? null}
      getKey={(product) => product.id}
      getLabel={(product) => product.name}
      getSecondary={formatProductSecondary}
      onSearchChange={setSearch}
      placeholder={placeholder ?? comboboxMessages.placeholder}
      emptyText={
        listQuery.isPending || selectedQuery.isPending
          ? messages.common.loading
          : (emptyText ?? comboboxMessages.empty)
      }
      disabled={disabled}
      className={className}
      triggerClassName={triggerClassName}
      clearable={clearable}
    />
  )
}
