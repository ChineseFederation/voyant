"use client"

import {
  Badge,
  Button,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components"
import { CurrencyCombobox } from "@voyant-travel/ui/components/currency-combobox"
import { SECONDARY_COLUMN_CLASS } from "@voyant-travel/ui/lib/responsive"
import { cn } from "@voyant-travel/ui/lib/utils"
import { ArrowDown, ArrowUp, ListFilter, Plus, Search, X } from "lucide-react"
import * as React from "react"
import { useSuppliersUiMessagesOrDefault } from "../i18n/index.js"
import {
  SUPPLIER_STATUSES,
  SUPPLIER_TYPES,
  type Supplier,
  type SuppliersListSortDir,
  type SuppliersListSortField,
  statusVariant,
  useSuppliers,
} from "../index.js"
import { formatMessage } from "./message-format.js"
import { SupplierDialog } from "./supplier-dialog.js"

const ALL = "__all__"

/** Zero-based indexes of the columns hidden below `md`: Country and Currency. */
const SECONDARY_SUPPLIER_COLUMNS = [3, 4] as const

export type SuppliersPageProps = {
  pageSize?: number
  onSupplierOpen?: (supplier: Supplier) => void
  onSupplierCreated?: (supplier: Supplier) => void
  initialSearch?: string
  className?: string
}

export function SuppliersPage({
  pageSize = 25,
  onSupplierOpen,
  onSupplierCreated,
  initialSearch = "",
  className,
}: SuppliersPageProps = {}) {
  const messages = useSuppliersUiMessagesOrDefault()
  const [search, setSearch] = React.useState(initialSearch)
  const [type, setType] = React.useState(ALL)
  const [status, setStatus] = React.useState(ALL)
  const [country, setCountry] = React.useState("")
  const [currency, setCurrency] = React.useState("")
  const [sortBy, setSortBy] = React.useState<SuppliersListSortField>("name")
  const [sortDir, setSortDir] = React.useState<SuppliersListSortDir>("asc")
  const [pageIndex, setPageIndex] = React.useState(0)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [filtersOpen, setFiltersOpen] = React.useState(false)

  const activeFilterCount =
    (type !== ALL ? 1 : 0) +
    (status !== ALL ? 1 : 0) +
    (country !== "" ? 1 : 0) +
    (currency !== "" ? 1 : 0)
  const hasActiveFilters = activeFilterCount > 0 || search !== ""

  const query = useSuppliers({
    limit: pageSize,
    offset: pageIndex * pageSize,
    search: search || undefined,
    type: type === ALL ? undefined : type,
    status: status === ALL ? undefined : status,
    country: country || undefined,
    defaultCurrency: currency || undefined,
    sortBy,
    sortDir,
  })

  const rows = query.data?.data ?? []
  const total = query.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  function toggleSort(field: SuppliersListSortField) {
    if (sortBy === field) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"))
      setPageIndex(0)
      return
    }
    setSortBy(field)
    setSortDir("asc")
    setPageIndex(0)
  }

  function clearFilters() {
    setSearch("")
    setType(ALL)
    setStatus(ALL)
    setCountry("")
    setCurrency("")
  }

  return (
    <div data-slot="suppliers-page" className={cn("flex flex-col gap-6", className)}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{messages.suppliersPage.title}</h1>
        <p className="text-sm text-muted-foreground">{messages.suppliersPage.description}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Label htmlFor="suppliers-search" className="sr-only">
            {messages.suppliersPage.searchPlaceholder}
          </Label>
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="suppliers-search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPageIndex(0)
            }}
            placeholder={messages.suppliersPage.searchPlaceholder}
            className="pl-9"
          />
        </div>

        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger
            render={
              <Button variant="outline" size="default">
                <ListFilter className="mr-2 size-4" />
                {messages.suppliersPage.filters}
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-2 px-1.5">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            }
          />
          <PopoverContent
            align="start"
            className="max-h-[75vh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto p-4"
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="suppliers-filter-type">
                  {messages.suppliersPage.filterTypeLabel}
                </Label>
                <Select
                  value={type}
                  onValueChange={(value) => {
                    setType(value ?? ALL)
                    setPageIndex(0)
                  }}
                >
                  <SelectTrigger id="suppliers-filter-type" className="w-full">
                    <SelectValue>
                      {(value) =>
                        value === ALL
                          ? messages.suppliersPage.allTypes
                          : messages.common.supplierTypeLabels[
                              value as keyof typeof messages.common.supplierTypeLabels
                            ]
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{messages.suppliersPage.allTypes}</SelectItem>
                    {SUPPLIER_TYPES.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {messages.common.supplierTypeLabels[item.value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="suppliers-filter-status">
                  {messages.suppliersPage.filterStatusLabel}
                </Label>
                <Select
                  value={status}
                  onValueChange={(value) => {
                    setStatus(value ?? ALL)
                    setPageIndex(0)
                  }}
                >
                  <SelectTrigger id="suppliers-filter-status" className="w-full">
                    <SelectValue>
                      {(value) =>
                        value === ALL
                          ? messages.suppliersPage.allStatuses
                          : messages.common.supplierStatusLabels[
                              value as keyof typeof messages.common.supplierStatusLabels
                            ]
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{messages.suppliersPage.allStatuses}</SelectItem>
                    {SUPPLIER_STATUSES.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {messages.common.supplierStatusLabels[item.value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="suppliers-filter-country">
                  {messages.suppliersPage.filterCountryLabel}
                </Label>
                <Input
                  id="suppliers-filter-country"
                  value={country}
                  onChange={(event) => {
                    setCountry(event.target.value.toUpperCase())
                    setPageIndex(0)
                  }}
                  placeholder={messages.suppliersPage.countryPlaceholder}
                  maxLength={2}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="suppliers-filter-currency">
                  {messages.suppliersPage.filterCurrencyLabel}
                </Label>
                <CurrencyCombobox
                  value={currency || null}
                  onChange={(next) => {
                    setCurrency(next ?? "")
                    setPageIndex(0)
                  }}
                  placeholder={messages.suppliersPage.currencyPlaceholder}
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 size-4" />
            {messages.suppliersPage.clearFilters}
          </Button>
        )}

        <div className="ml-auto">
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1 size-4" />
            {messages.suppliersPage.create}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-muted-foreground">
            <tr>
              <SortableHeader
                label={messages.suppliersPage.columns.name}
                field="name"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortableHeader
                label={messages.suppliersPage.columns.type}
                field="type"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortableHeader
                label={messages.suppliersPage.columns.status}
                field="status"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <th className={cn("px-4 py-3 font-medium", SECONDARY_COLUMN_CLASS)}>
                {messages.suppliersPage.columns.country}
              </th>
              <SortableHeader
                label={messages.suppliersPage.columns.currency}
                field="defaultCurrency"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={toggleSort}
                className={SECONDARY_COLUMN_CLASS}
              />
            </tr>
          </thead>
          <tbody>
            {query.isPending ? (
              <LoadingRows columns={5} rows={8} secondaryColumns={SECONDARY_SUPPLIER_COLUMNS} />
            ) : query.isError ? (
              <MessageRow columns={5}>{messages.suppliersPage.loadFailed}</MessageRow>
            ) : rows.length === 0 ? (
              <MessageRow columns={5}>{messages.suppliersPage.empty}</MessageRow>
            ) : (
              rows.map((supplier) => (
                <tr
                  key={supplier.id}
                  className="border-t transition-colors hover:bg-muted/40"
                  onClick={() => onSupplierOpen?.(supplier)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{supplier.name}</div>
                    {supplier.city && (
                      <div className="text-xs text-muted-foreground">{supplier.city}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">{messages.common.supplierTypeLabels[supplier.type]}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant[supplier.status]}>
                      {messages.common.supplierStatusLabels[supplier.status]}
                    </Badge>
                  </td>
                  <td className={cn("px-4 py-3", SECONDARY_COLUMN_CLASS)}>
                    {supplier.country ?? messages.common.none}
                  </td>
                  <td className={cn("px-4 py-3", SECONDARY_COLUMN_CLASS)}>
                    {supplier.defaultCurrency ?? messages.common.none}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div>{formatMessage(messages.suppliersPage.summary, { shown: rows.length, total })}</div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pageIndex === 0 || query.isPending}
            onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
          >
            {messages.suppliersPage.previous}
          </Button>
          <span>
            {formatMessage(messages.suppliersPage.page, {
              page: pageIndex + 1,
              pageCount,
            })}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pageIndex + 1 >= pageCount || query.isPending}
            onClick={() => setPageIndex((current) => current + 1)}
          >
            {messages.suppliersPage.next}
          </Button>
        </div>
      </div>

      <SupplierDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={onSupplierCreated}
      />
    </div>
  )
}

function SortableHeader({
  label,
  field,
  sortBy,
  sortDir,
  onSort,
  className,
}: {
  label: string
  field: SuppliersListSortField
  sortBy: SuppliersListSortField
  sortDir: SuppliersListSortDir
  onSort: (field: SuppliersListSortField) => void
  className?: string
}) {
  return (
    <th className={cn("px-4 py-3 font-medium", className)}>
      <Button type="button" variant="ghost" size="sm" onClick={() => onSort(field)}>
        {label}
        {sortBy === field &&
          (sortDir === "asc" ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />)}
      </Button>
    </th>
  )
}

/**
 * `secondaryColumns` names the zero-based indexes that the real table drops
 * below `md`. They have to be mirrored here: otherwise the pending state is two
 * columns wider than the table it stands in for, keeping exactly the horizontal
 * width the responsive columns exist to remove, and the list reflows once the
 * query resolves.
 */
function LoadingRows({
  rows,
  columns,
  secondaryColumns = [],
}: {
  rows: number
  columns: number
  secondaryColumns?: readonly number[]
}) {
  return Array.from({ length: rows }, (_, rowIndex) => `row-${rowIndex}`).map((rowKey) => (
    <tr key={rowKey} className="border-t">
      {Array.from({ length: columns }, (__, columnIndex) => columnIndex).map((columnIndex) => (
        <td
          key={`${rowKey}-cell-${columnIndex}`}
          className={cn(
            "px-4 py-3",
            secondaryColumns.includes(columnIndex) && SECONDARY_COLUMN_CLASS,
          )}
        >
          <div className="h-4 w-full max-w-32 animate-pulse rounded bg-muted" />
        </td>
      ))}
    </tr>
  ))
}

function MessageRow({ columns, children }: { columns: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={columns} className="px-4 py-10 text-center text-muted-foreground">
        {children}
      </td>
    </tr>
  )
}
