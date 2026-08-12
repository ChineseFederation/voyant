// agent-quality: file-size exception -- owner: inventory-react; existing UI surface stays co-located until a dedicated split preserves behavior and tests.
"use client"

import { formatMessage } from "@voyant-travel/i18n"
import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import { DateRangePicker } from "@voyant-travel/ui/components/date-picker"
import { Input } from "@voyant-travel/ui/components/input"
import { Label } from "@voyant-travel/ui/components/label"
import { Popover, PopoverContent, PopoverTrigger } from "@voyant-travel/ui/components/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components/select"
import { Skeleton } from "@voyant-travel/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components/table"
import { SECONDARY_COLUMN_CLASS } from "@voyant-travel/ui/lib/responsive"
import { ArrowDown, ArrowUp, ArrowUpDown, ListFilter, Plus, Search, X } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"
import { useProductsUiI18nOrDefault } from "../i18n/index.js"
import {
  type ProductRecord,
  type ProductSummaryRecord,
  type ProductsListSortDir,
  type ProductsListSortField,
  useProductMutation,
  useProductSummaries,
  useProducts,
  useProductTypes,
} from "../index.js"
import { DEFAULT_PRODUCTS_LIST_FILTERS } from "../query-options.js"
import { formatProductSubtype } from "./product-detail/product-detail-shared.js"
import { ProductDialog } from "./product-dialog.js"
import { ProductQuickStartDialog } from "./product-quick-start-dialog.js"
import type { ProductQuickStart } from "./product-quick-starts.js"

export interface ProductListProps {
  pageSize?: number
  onSelectProduct?: (product: ProductRecord) => void
  /**
   * ID-only navigation lets the list use the compact summary endpoint. The
   * existing full-record callback remains available for standalone editors.
   */
  onSelectProductId?: (productId: string) => void
}

const STATUS_ALL = "__all__"
const FILTER_ALL = "__all__"

const PRODUCT_STATUSES = ["draft", "active", "archived"] as const
// Ordered most-common-first, matching the product editor's booking-mode picker.
const PRODUCT_BOOKING_MODES = [
  "itinerary",
  "stay",
  "date",
  "date_time",
  "transfer",
  "open",
  "other",
] as const
type SortableField = Extract<ProductsListSortField, "name" | "status" | "sellAmount">

const SORTABLE_COLUMNS = {
  name: "name",
  status: "status",
  sellAmount: "sellAmount",
} as const satisfies Record<SortableField, SortableField>

const SKELETON_ROW_COUNT = 6
const TABLE_COLUMN_COUNT = 8

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  active: "default",
  archived: "secondary",
}

function formatAmount(
  cents: number | null,
  currency: string,
  fallback: string,
  locale: string,
): string {
  if (cents == null) return fallback
  const amount = cents / 100
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount)
  } catch {
    // Unknown/invalid ISO currency — fall back to a plain amount + code.
    return `${amount.toFixed(2)} ${currency}`
  }
}

function formatDepartureDate(
  value: string | null | undefined,
  fallback: string,
  locale: string,
): string {
  if (!value) return fallback
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return fallback
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(parsed)
}

/**
 * Compact duration for the list: explicit minutes ("60 min"), itinerary-derived
 * days ("3 d"), or an em-dash when unresolved. Reads the resolved classification
 * so it matches detail and the catalog exactly, and never guesses from booking
 * mode.
 */
function formatListDuration(
  product: ProductSummaryRecord,
  messages: ReturnType<typeof useProductsUiI18nOrDefault>["messages"]["productList"],
): string {
  const c = product.classification
  if (c?.durationProvenance === "explicit" && c.durationMinutes != null) {
    return `${c.durationMinutes} min` // i18n-literal-ok short unit
  }
  if (c?.durationProvenance === "itinerary-derived" && c.durationDays != null) {
    return `${c.durationDays} d` // i18n-literal-ok short unit
  }
  if (product.durationMinutes != null) {
    return `${product.durationMinutes} min` // i18n-literal-ok short unit
  }
  return messages.durationUnset
}

export function ProductList({
  pageSize = DEFAULT_PRODUCTS_LIST_FILTERS.limit,
  onSelectProduct,
  onSelectProductId,
}: ProductListProps = {}) {
  const { locale, messages } = useProductsUiI18nOrDefault()
  const productMessages = messages.productList
  const { create } = useProductMutation()
  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState<string>(STATUS_ALL)
  const [productTypeId, setProductTypeId] = React.useState<string>(FILTER_ALL)
  const [bookingMode, setBookingMode] = React.useState<string>(FILTER_ALL)
  const [tag, setTag] = React.useState<string>("")
  const [dateRange, setDateRange] = React.useState<{
    from: string | null
    to: string | null
  } | null>(null)
  const [departureRange, setDepartureRange] = React.useState<{
    from: string | null
    to: string | null
  } | null>(null)
  const [paxMin, setPaxMin] = React.useState<string>("")
  const [paxMax, setPaxMax] = React.useState<string>("")
  const [sellAmountMin, setSellAmountMin] = React.useState<string>("")
  const [sellAmountMax, setSellAmountMax] = React.useState<string>("")
  const [sortBy, setSortBy] = React.useState<ProductsListSortField>(
    DEFAULT_PRODUCTS_LIST_FILTERS.sortBy,
  )
  const [sortDir, setSortDir] = React.useState<ProductsListSortDir>(
    DEFAULT_PRODUCTS_LIST_FILTERS.sortDir,
  )
  const [offset, setOffset] = React.useState<number>(DEFAULT_PRODUCTS_LIST_FILTERS.offset)
  const [filterPopoverOpen, setFilterPopoverOpen] = React.useState(false)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<ProductRecord | undefined>(undefined)
  const [quickStartOpen, setQuickStartOpen] = React.useState(false)

  const paxMinNumber = paxMin === "" ? undefined : Number.parseInt(paxMin, 10)
  const paxMaxNumber = paxMax === "" ? undefined : Number.parseInt(paxMax, 10)
  const sellAmountMinCents =
    sellAmountMin === "" ? undefined : Math.round(Number.parseFloat(sellAmountMin) * 100)
  const sellAmountMaxCents =
    sellAmountMax === "" ? undefined : Math.round(Number.parseFloat(sellAmountMax) * 100)

  const { data: productTypesData, isPending: productTypesPending } = useProductTypes({ limit: 100 })
  const productTypes = productTypesData?.data ?? []

  const filters = {
    search: search || undefined,
    status: status === STATUS_ALL ? undefined : status,
    productTypeId: productTypeId === FILTER_ALL ? undefined : productTypeId,
    bookingMode: bookingMode === FILTER_ALL ? undefined : bookingMode,
    tag: tag.trim() || undefined,
    dateFrom: dateRange?.from ?? undefined,
    dateTo: dateRange?.to ?? undefined,
    departureFrom: departureRange?.from ?? undefined,
    departureTo: departureRange?.to ?? undefined,
    paxMin: Number.isFinite(paxMinNumber) ? paxMinNumber : undefined,
    paxMax: Number.isFinite(paxMaxNumber) ? paxMaxNumber : undefined,
    sellAmountMin: Number.isFinite(sellAmountMinCents) ? sellAmountMinCents : undefined,
    sellAmountMax: Number.isFinite(sellAmountMaxCents) ? sellAmountMaxCents : undefined,
    sortBy,
    sortDir,
    limit: pageSize,
    offset,
  }
  const useCompactRows = Boolean(onSelectProductId)
  const fullQuery = useProducts({ ...filters, enabled: !useCompactRows })
  const summaryQuery = useProductSummaries({ ...filters, enabled: useCompactRows })
  const activeQuery = useCompactRows ? summaryQuery : fullQuery
  const { data, isPending, isFetching, isError } = activeQuery

  const products = data?.data ?? []
  const total = data?.total ?? 0
  const page = Math.floor(offset / pageSize) + 1
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const showSkeleton = isPending || (isFetching && products.length === 0)

  const resetOffset = () => setOffset(0)

  const handleSort = (field: SortableField) => {
    setOffset(0)
    if (sortBy !== field) {
      setSortBy(field)
      setSortDir("asc")
      return
    }
    if (sortDir === "asc") {
      setSortDir("desc")
      return
    }
    setSortBy("createdAt")
    setSortDir("desc")
  }

  const activeFilterCount =
    (status !== STATUS_ALL ? 1 : 0) +
    (productTypeId !== FILTER_ALL ? 1 : 0) +
    (bookingMode !== FILTER_ALL ? 1 : 0) +
    (tag.trim() !== "" ? 1 : 0) +
    (dateRange?.from || dateRange?.to ? 1 : 0) +
    (departureRange?.from || departureRange?.to ? 1 : 0) +
    (paxMin !== "" || paxMax !== "" ? 1 : 0) +
    (sellAmountMin !== "" || sellAmountMax !== "" ? 1 : 0)
  const hasActiveFilters = activeFilterCount > 0 || search !== ""

  const clearFilters = () => {
    setSearch("")
    setStatus(STATUS_ALL)
    setProductTypeId(FILTER_ALL)
    setBookingMode(FILTER_ALL)
    setTag("")
    setDateRange(null)
    setDepartureRange(null)
    setPaxMin("")
    setPaxMax("")
    setSellAmountMin("")
    setSellAmountMax("")
    resetOffset()
  }

  const handleEdit = (product: ProductSummaryRecord) => {
    if (onSelectProductId) {
      onSelectProductId(product.id)
      return
    }
    const fullProduct = fullQuery.data?.data.find((candidate) => candidate.id === product.id)
    if (!fullProduct) return
    if (onSelectProduct) {
      onSelectProduct(fullProduct)
      return
    }
    setEditing(fullProduct)
    setDialogOpen(true)
  }

  const handleCreate = () => {
    // Standalone usage (no navigation host): keep the inline create dialog.
    if (!onSelectProduct) {
      setEditing(undefined)
      setDialogOpen(true)
      return
    }
    // With a host wired, open the family / quick-start chooser first.
    setQuickStartOpen(true)
  }

  // Every quick start (and "start blank") creates the SAME generic draft; a
  // preset only prefills editable field defaults. `familyCode` resolves to the
  // seeded product_types id. Then we navigate to the canonical detail page.
  const handleQuickStart = async (quickStart: ProductQuickStart | null) => {
    if (!onSelectProduct) return
    try {
      const familyId = quickStart
        ? (productTypes.find((type) => type.active && type.code === quickStart.familyCode)?.id ??
          null)
        : null
      if (quickStart && !familyId) {
        toast.error(productMessages.familyUnavailable)
        return
      }
      const created = await create.mutateAsync({
        name: messages.catalogCard.untitled,
        status: "draft",
        sellCurrency: "EUR", // i18n-literal-ok ISO default currency
        ...(quickStart
          ? {
              productTypeId: familyId,
              ...quickStart.defaults,
            }
          : {}),
      })
      setQuickStartOpen(false)
      onSelectProduct(created)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : productMessages.createFailed)
    }
  }

  const handleFamilyStart = async (familyCode: string) => {
    if (!onSelectProduct) return
    const familyId = productTypes.find((type) => type.active && type.code === familyCode)?.id
    if (!familyId) {
      toast.error(productMessages.familyUnavailable)
      return
    }
    try {
      const created = await create.mutateAsync({
        name: messages.catalogCard.untitled,
        status: "draft",
        sellCurrency: "EUR", // i18n-literal-ok ISO default currency
        productTypeId: familyId,
      })
      setQuickStartOpen(false)
      onSelectProduct(created)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : productMessages.createFailed)
    }
  }

  return (
    <div data-slot="product-list" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Label htmlFor="products-search" className="sr-only">
            {productMessages.searchPlaceholder}
          </Label>
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="products-search"
            placeholder={productMessages.searchPlaceholder}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              resetOffset()
            }}
            className="pl-9"
          />
        </div>

        <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
          <PopoverTrigger
            render={
              <Button variant="outline" size="default">
                <ListFilter className="mr-2 size-4" aria-hidden="true" />
                {productMessages.filters.button}
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-2 px-1.5">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            }
          />
          <PopoverContent align="start" className="max-h-[75vh] w-[22rem] overflow-y-auto p-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="products-filter-status">
                  {productMessages.filters.statusLabel}
                </Label>
                <Select
                  value={status}
                  onValueChange={(value) => {
                    setStatus(value ?? STATUS_ALL)
                    resetOffset()
                  }}
                >
                  <SelectTrigger id="products-filter-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={STATUS_ALL}>{productMessages.filters.statusAll}</SelectItem>
                    {PRODUCT_STATUSES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {messages.common.productStatusLabels[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="products-filter-type">{productMessages.filters.typeLabel}</Label>
                <Select
                  value={productTypeId}
                  onValueChange={(value) => {
                    setProductTypeId(value ?? FILTER_ALL)
                    resetOffset()
                  }}
                >
                  <SelectTrigger id="products-filter-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FILTER_ALL}>{productMessages.filters.typeAll}</SelectItem>
                    {productTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="products-filter-booking-mode">
                  {productMessages.filters.bookingModeLabel}
                </Label>
                <Select
                  value={bookingMode}
                  onValueChange={(value) => {
                    setBookingMode(value ?? FILTER_ALL)
                    resetOffset()
                  }}
                >
                  <SelectTrigger id="products-filter-booking-mode" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FILTER_ALL}>
                      {productMessages.filters.bookingModeAll}
                    </SelectItem>
                    {PRODUCT_BOOKING_MODES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {messages.common.productBookingModeLabels[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="products-filter-tag">{productMessages.filters.tagLabel}</Label>
                <Input
                  id="products-filter-tag"
                  placeholder={productMessages.filters.tagPlaceholder}
                  value={tag}
                  onChange={(event) => {
                    setTag(event.target.value)
                    resetOffset()
                  }}
                  className="w-full"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>{productMessages.filters.dateLabel}</Label>
                <DateRangePicker
                  value={dateRange}
                  onChange={(value) => {
                    setDateRange(value)
                    resetOffset()
                  }}
                  placeholder={productMessages.filters.datePlaceholder}
                  clearable
                  className="w-full"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>{productMessages.filters.departureLabel}</Label>
                <DateRangePicker
                  value={departureRange}
                  onChange={(value) => {
                    setDepartureRange(value)
                    resetOffset()
                  }}
                  placeholder={productMessages.filters.departurePlaceholder}
                  clearable
                  className="w-full"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>{productMessages.filters.paxLabel}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    placeholder={productMessages.filters.min}
                    value={paxMin}
                    onChange={(event) => {
                      setPaxMin(event.target.value)
                      resetOffset()
                    }}
                    className="w-full"
                    aria-label={`${productMessages.filters.paxLabel} ${productMessages.filters.min}`}
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="number"
                    min={0}
                    placeholder={productMessages.filters.max}
                    value={paxMax}
                    onChange={(event) => {
                      setPaxMax(event.target.value)
                      resetOffset()
                    }}
                    className="w-full"
                    aria-label={`${productMessages.filters.paxLabel} ${productMessages.filters.max}`}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>{productMessages.filters.sellAmountLabel}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder={productMessages.filters.min}
                    value={sellAmountMin}
                    onChange={(event) => {
                      setSellAmountMin(event.target.value)
                      resetOffset()
                    }}
                    className="w-full"
                    aria-label={`${productMessages.filters.sellAmountLabel} ${productMessages.filters.min}`}
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder={productMessages.filters.max}
                    value={sellAmountMax}
                    onChange={(event) => {
                      setSellAmountMax(event.target.value)
                      resetOffset()
                    }}
                    className="w-full"
                    aria-label={`${productMessages.filters.sellAmountLabel} ${productMessages.filters.max}`}
                  />
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 size-4" aria-hidden="true" />
            {productMessages.filters.clear}
          </Button>
        )}

        <div className="ml-auto">
          <Button
            onClick={handleCreate}
            disabled={create.isPending}
            data-slot="product-list-create"
          >
            <Plus className="mr-2 size-4" aria-hidden="true" />
            {productMessages.newProduct}
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortHeader
                  label={productMessages.columns.name}
                  field={SORTABLE_COLUMNS.name}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </TableHead>
              <TableHead>
                <SortHeader
                  label={productMessages.columns.status}
                  field={SORTABLE_COLUMNS.status}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </TableHead>
              <TableHead>
                <SortHeader
                  label={productMessages.columns.sellAmount}
                  field={SORTABLE_COLUMNS.sellAmount}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </TableHead>
              <TableHead className={SECONDARY_COLUMN_CLASS}>
                {productMessages.columns.family}
              </TableHead>
              <TableHead className={SECONDARY_COLUMN_CLASS}>
                {productMessages.columns.subtype}
              </TableHead>
              <TableHead className={SECONDARY_COLUMN_CLASS}>
                {productMessages.columns.duration}
              </TableHead>
              <TableHead className={SECONDARY_COLUMN_CLASS}>
                {productMessages.columns.bookingMode}
              </TableHead>
              <TableHead>{productMessages.columns.nextDeparture}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {showSkeleton ? (
              <ProductTableSkeleton rows={SKELETON_ROW_COUNT} />
            ) : isError ? (
              <TableRow>
                <TableCell
                  colSpan={TABLE_COLUMN_COUNT}
                  className="h-24 text-center text-sm text-destructive"
                >
                  {productMessages.loadFailed}
                </TableCell>
              </TableRow>
            ) : products.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={TABLE_COLUMN_COUNT}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  {productMessages.empty}
                </TableCell>
              </TableRow>
            ) : (
              products.map((product) => (
                <TableRow
                  key={product.id}
                  onClick={() => handleEdit(product)}
                  className="cursor-pointer"
                >
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[product.status] ?? "secondary"}>
                      {messages.common.productStatusLabels[product.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {formatAmount(
                      product.sellAmountCents,
                      product.sellCurrency,
                      productMessages.noValue,
                      locale,
                    )}
                  </TableCell>
                  <TableCell className={SECONDARY_COLUMN_CLASS}>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span>
                          {product.classification?.familyName ??
                            product.productTypeName ??
                            productMessages.noValue}
                        </span>
                        {product.classification?.reviewRequired ? (
                          <Badge
                            variant="outline"
                            className="border-amber-400 text-amber-700 text-xs dark:text-amber-300"
                            title={product.classification.reviewReasons
                              .map((reason) =>
                                reason === "missing_family"
                                  ? productMessages.reviewMissingFamily
                                  : productMessages.reviewMissingDuration,
                              )
                              .join("; ")}
                          >
                            {productMessages.reviewBadge}
                          </Badge>
                        ) : null}
                      </div>
                      {product.classification?.scheduleTerm ? (
                        <span className="text-muted-foreground text-xs">
                          {
                            messages.common.scheduleTermLabels[product.classification.scheduleTerm]
                              .plural
                          }
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className={SECONDARY_COLUMN_CLASS}>
                    {product.classification?.subtypeCode ? (
                      <Badge variant="secondary" className="text-xs">
                        {formatProductSubtype(product.classification.subtypeCode)}
                      </Badge>
                    ) : (
                      productMessages.noValue
                    )}
                  </TableCell>
                  <TableCell className={SECONDARY_COLUMN_CLASS}>
                    {formatListDuration(product, productMessages)}
                  </TableCell>
                  <TableCell className={SECONDARY_COLUMN_CLASS}>
                    {messages.common.productBookingModeLabels[product.bookingMode]}
                  </TableCell>
                  <TableCell>
                    {formatDepartureDate(product.nextDeparture, productMessages.noValue, locale)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {formatMessage(productMessages.paginationShowing, { count: products.length, total })}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset((prev) => Math.max(0, prev - pageSize))}
          >
            {productMessages.paginationPrevious}
          </Button>
          <span>{formatMessage(productMessages.paginationPage, { page, pageCount })}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + pageSize >= total}
            onClick={() => setOffset((prev) => prev + pageSize)}
          >
            {productMessages.paginationNext}
          </Button>
        </div>
      </div>

      <ProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={editing}
        onSuccess={(product) => {
          if (onSelectProduct) {
            onSelectProduct(product)
          }
        }}
      />

      <ProductQuickStartDialog
        open={quickStartOpen}
        onOpenChange={setQuickStartOpen}
        onChoose={handleQuickStart}
        onChooseFamily={handleFamilyStart}
        families={productTypes
          .filter((type) => type.active)
          .map(({ code, name }) => ({ code, name }))}
        loadingFamilies={productTypesPending}
        creating={create.isPending}
      />
    </div>
  )
}

interface SortHeaderProps {
  label: string
  field: SortableField
  sortBy: ProductsListSortField
  sortDir: ProductsListSortDir
  onSort: (field: SortableField) => void
}

function SortHeader({ label, field, sortBy, sortDir, onSort }: SortHeaderProps) {
  const active = sortBy === field
  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className="-ml-2 inline-flex h-8 items-center gap-1 rounded-sm px-2 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span>{label}</span>
      <Icon
        className={`size-3.5 ${active ? "text-foreground" : "text-muted-foreground/60"}`}
        aria-hidden
      />
    </button>
  )
}

function ProductTableSkeleton({ rows }: { rows: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, idx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders are stable -- owner: inventory-react; existing suppression is intentional pending typed cleanup.
        <TableRow key={`skeleton-${idx}`}>
          <TableCell>
            <Skeleton className="h-4 w-48" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-16 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          {/* Family/subtype/duration/booking-mode drop out below `md`; mirror
              that here or the skeleton misaligns with the header while loading. */}
          <TableCell className={SECONDARY_COLUMN_CLASS}>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell className={SECONDARY_COLUMN_CLASS}>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell className={SECONDARY_COLUMN_CLASS}>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell className={SECONDARY_COLUMN_CLASS}>
            <Skeleton className="h-4 w-16" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}
