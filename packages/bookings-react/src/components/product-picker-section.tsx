"use client"

import { useCatalogSearch } from "@voyant-travel/catalog-react"
import {
  type ProductRecord,
  useProduct,
  useProductOptions,
  useProducts,
} from "@voyant-travel/inventory-react"
import {
  Badge,
  Label,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components"
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
import { useBookingsUiI18nOrDefault, useBookingsUiMessagesOrDefault } from "../i18n/provider.js"
import {
  catalogProductPickerRecordFromHit,
  type ProductPickerSearchRecord,
  productMatchesPickerSearch,
} from "./booking-create-utils.js"

const OPTION_NONE = "__none__"

export interface ProductPickerValue {
  productId: string
  /** `null` means "no specific option" — the product has options but none was picked. */
  optionId: string | null
  sourceKind?: string
  sourceConnectionId?: string
  sourceRef?: string
  productName?: string
  supplierName?: string
  sellCurrency?: string
  sellAmountCents?: number | null
}

export interface ProductPickerSectionProps {
  value: ProductPickerValue
  onChange: (value: ProductPickerValue) => void
  /** When true, skip data fetches (dialog closed / parent gated). */
  enabled?: boolean
  /** When true, hide the product picker and fix the productId (e.g., launched from a product page). */
  lockProduct?: boolean
  /** When false, product options are selected downstream as quantities instead of a single global choice. */
  showOptionPicker?: boolean
  labels?: {
    product?: string
    productSearchPlaceholder?: string
    productSelectPlaceholder?: string
    option?: string
    optionNone?: string
  }
}

/**
 * Controlled product + option picker. Splits `value` + `onChange` so apps can
 * replace the whole section (e.g., with a typeahead against a custom catalog)
 * without reimplementing the cascade logic, or keep this one and swap labels.
 */
export function ProductPickerSection({
  value,
  onChange,
  enabled = true,
  lockProduct = false,
  showOptionPicker = true,
  labels,
}: ProductPickerSectionProps) {
  const [productSearch, setProductSearch] = React.useState("")
  const [debouncedProductSearch, setDebouncedProductSearch] = React.useState("")
  const cachedProductsRef = React.useRef(
    new Map<string, ProductPickerSearchRecord & { id: string }>(),
  )
  const { formatCurrency } = useBookingsUiI18nOrDefault()
  const messages = useBookingsUiMessagesOrDefault()
  const merged = { ...messages.productPickerSection.labels, ...labels }

  React.useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedProductSearch(productSearch.trim()), 250)
    return () => window.clearTimeout(timeout)
  }, [productSearch])

  const productsQuery = useCatalogSearch({
    vertical: "products",
    query: debouncedProductSearch,
    mode: "keyword",
    projection: "raw",
    pagination: { limit: 30 },
    surface: "admin",
    enabled: enabled && !lockProduct,
  })
  // The catalog index is an optional deployment provider. Manual booking must
  // still be able to select products owned by Inventory when search is absent
  // or rebuilding, so keep a direct, bounded Inventory query in the picker.
  const ownedProductsQuery = useProducts({
    search: debouncedProductSearch || undefined,
    status: "active",
    limit: 30,
    enabled: enabled && !lockProduct,
  })
  const selectedProductQuery = useProduct(value.productId || undefined, {
    enabled:
      enabled && Boolean(value.productId) && (!value.sourceKind || value.sourceKind === "owned"),
  })

  const products = React.useMemo(() => {
    const map = new Map(cachedProductsRef.current)
    const catalogProducts = (productsQuery.data?.hits ?? []).map(catalogProductPickerRecordFromHit)
    const ownedProducts = (ownedProductsQuery.data?.data ?? []).map(ownedProductToPickerRecord)
    for (const product of mergeProductPickerRecords(catalogProducts, ownedProducts)) {
      map.set(product.id, product)
    }
    if (selectedProductQuery.data) {
      map.set(selectedProductQuery.data.id, ownedProductToPickerRecord(selectedProductQuery.data))
    }
    if (value.productId && value.productName) {
      map.set(value.productId, {
        id: value.productId,
        name: value.productName,
        sellCurrency: value.sellCurrency,
        sellAmountCents: value.sellAmountCents,
        supplierName: value.supplierName,
        sourceKind: value.sourceKind ?? "owned",
        sourceConnectionId: value.sourceConnectionId,
        sourceRef: value.sourceRef,
      })
    }
    cachedProductsRef.current = map
    return Array.from(map.values())
  }, [productsQuery.data?.hits, ownedProductsQuery.data?.data, selectedProductQuery.data, value])

  const productMap = React.useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  )
  const resolveProductLabel = React.useCallback(
    (productId: string) =>
      productMap.get(productId)?.name ?? cachedProductsRef.current.get(productId)?.name ?? "",
    [productMap],
  )
  const selectedProductLabel = value.productId ? resolveProductLabel(value.productId) : ""
  const [productInputValue, setProductInputValue] = React.useState(selectedProductLabel)

  React.useEffect(() => {
    if (selectedProductLabel) setProductInputValue(selectedProductLabel)
  }, [selectedProductLabel])

  const { data: optionsData } = useProductOptions({
    productId: value.productId || undefined,
    limit: 50,
    enabled: enabled && showOptionPicker && Boolean(value.productId),
  })
  const options = optionsData?.data ?? []

  return (
    <>
      {!lockProduct && (
        <div className="flex flex-col gap-2">
          <Label>
            {merged.product} <span className="text-destructive">*</span>
          </Label>
          <Combobox
            items={products.map((product) => product.id)}
            value={value.productId || null}
            inputValue={productInputValue}
            autoHighlight
            disabled={!enabled}
            filter={(id, query) => productMatchesPickerSearch(productMap.get(id as string), query)}
            itemToStringLabel={(id) => resolveProductLabel(id as string) || (id as string)}
            itemToStringValue={(id) => id as string}
            onInputValueChange={(next) => {
              setProductInputValue(next)
              setProductSearch(next)
              if (!next) onChange({ productId: "", optionId: null })
            }}
            onValueChange={(next) => {
              const productId = (next as string | null) ?? ""
              const selected = productId ? productMap.get(productId) : null
              onChange({
                productId,
                optionId: null,
                ...(selected
                  ? {
                      sourceKind: selected.sourceKind ?? "owned",
                      ...(selected.sourceConnectionId
                        ? { sourceConnectionId: selected.sourceConnectionId }
                        : {}),
                      ...(selected.sourceRef ? { sourceRef: selected.sourceRef } : {}),
                      productName: selected.name,
                      ...(selected.supplierName ? { supplierName: selected.supplierName } : {}),
                      ...(selected.sellCurrency ? { sellCurrency: selected.sellCurrency } : {}),
                      sellAmountCents: selected.sellAmountCents ?? null,
                    }
                  : {}),
              })
              setProductInputValue(productId ? resolveProductLabel(productId) : "")
            }}
          >
            <ComboboxInput
              placeholder={merged.productSearchPlaceholder}
              showClear={!!value.productId}
            />
            <ComboboxContent>
              <ComboboxEmpty>{merged.productEmpty}</ComboboxEmpty>
              <ComboboxList>
                <ComboboxCollection>
                  {(id) => {
                    const product = productMap.get(id as string)
                    if (!product) return null
                    return (
                      <ComboboxItem key={product.id} value={product.id}>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-medium">{product.name}</span>
                            <Badge variant="secondary">
                              {product.sourceKind && product.sourceKind !== "owned"
                                ? merged.supplier
                                : merged.owned}
                            </Badge>
                          </div>
                          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                            {product.supplierName ? (
                              <span className="truncate">{product.supplierName}</span>
                            ) : null}
                            {product.sellCurrency ? (
                              <span>
                                {product.sellAmountCents != null
                                  ? formatCurrency(
                                      product.sellAmountCents / 100,
                                      product.sellCurrency,
                                    )
                                  : product.sellCurrency}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </ComboboxItem>
                    )
                  }}
                </ComboboxCollection>
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>
      )}

      {showOptionPicker && value.productId && options.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>{merged.option}</Label>
          <Select
            items={[
              { label: merged.optionNone, value: OPTION_NONE },
              ...options.map((o) => ({ label: o.name, value: o.id })),
            ]}
            value={value.optionId ?? OPTION_NONE}
            onValueChange={(v) =>
              onChange({
                productId: value.productId,
                optionId: v === OPTION_NONE ? null : (v ?? null),
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={OPTION_NONE}>{merged.optionNone}</SelectItem>
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  )
}

export function mergeProductPickerRecords(
  ...sources: ReadonlyArray<ReadonlyArray<ProductPickerSearchRecord & { id: string }>>
): Array<ProductPickerSearchRecord & { id: string }> {
  const records = new Map<string, ProductPickerSearchRecord & { id: string }>()
  for (const source of sources) {
    for (const product of source) records.set(product.id, product)
  }
  return Array.from(records.values())
}

function ownedProductToPickerRecord(
  product: ProductRecord,
): ProductPickerSearchRecord & { id: string } {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    sellCurrency: product.sellCurrency,
    sellAmountCents: product.sellAmountCents,
    sourceKind: "owned",
  }
}
