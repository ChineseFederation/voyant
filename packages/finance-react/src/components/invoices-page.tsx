import {
  Badge,
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components"
import { CurrencyCombobox } from "@voyant-travel/ui/components/currency-combobox"
import { DateRangePicker } from "@voyant-travel/ui/components/date-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@voyant-travel/ui/components/popover"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components/table"
import { SECONDARY_COLUMN_CLASS, TOUCH_CHECKBOX_CLASS } from "@voyant-travel/ui/lib/responsive"
import { cn } from "@voyant-travel/ui/lib/utils"
import { ListFilter, Plus, Search, X } from "lucide-react"
import { useEffect, useState } from "react"
import { useFinanceUiMessagesOrDefault } from "../i18n/index.js"
import { invoiceStatuses } from "../i18n/messages.js"
import {
  type FinanceInvoiceListSortDir,
  type FinanceInvoiceListSortField,
  type InvoiceBulkStatusResult,
  type InvoiceRecord,
  useInvoiceBulkStatusMutation,
  useInvoices,
} from "../index.js"
import { InvoiceBulkActions } from "./invoice-bulk-actions.js"
import { InvoiceDialog } from "./invoice-dialog.js"
import {
  formatInvoiceAmount,
  InvoiceRowSkeleton,
  invoiceStatusVariant,
  invoiceTypeVariant,
  PaginationBar,
  SortHeader,
} from "./invoice-table-parts.js"

const PAGE_SIZE = 25
const STATUS_ALL = "__all__"

type InvoiceSortableField = Exclude<FinanceInvoiceListSortField, "createdAt">

export interface InvoicesPageProps {
  className?: string
  onOpenInvoice?: (invoiceId: string) => void
}

export function InvoicesPage({ className, onOpenInvoice }: InvoicesPageProps = {}) {
  const messages = useFinanceUiMessagesOrDefault()
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false)

  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<string>(STATUS_ALL)
  const [currency, setCurrency] = useState<string | null>(null)
  const [dueDateRange, setDueDateRange] = useState<{
    from: string | null
    to: string | null
  } | null>(null)
  const [sortBy, setSortBy] = useState<FinanceInvoiceListSortField>("createdAt")
  const [sortDir, setSortDir] = useState<FinanceInvoiceListSortDir>("desc")
  const [pageIndex, setPageIndex] = useState(0)
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false)
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(() => new Set())
  const [bulkResult, setBulkResult] = useState<InvoiceBulkStatusResult | null>(null)
  const bulkStatusMutation = useInvoiceBulkStatusMutation()

  const { data, isPending, isFetching, isError } = useInvoices({
    search: search || undefined,
    status: status === STATUS_ALL ? undefined : status,
    currency: currency ?? undefined,
    dueDateFrom: dueDateRange?.from ?? undefined,
    dueDateTo: dueDateRange?.to ?? undefined,
    sortBy,
    sortDir,
    limit: PAGE_SIZE,
    offset: pageIndex * PAGE_SIZE,
  })

  const invoices = data?.data ?? []
  const total = data?.total ?? 0
  const page = pageIndex + 1
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const showSkeleton = isPending || (isFetching && invoices.length === 0)
  const selectedInvoices = invoices.filter((invoice) => selectedInvoiceIds.has(invoice.id))
  const selectedCount = selectedInvoices.length
  const allPageInvoicesSelected =
    invoices.length > 0 && invoices.every((invoice) => selectedInvoiceIds.has(invoice.id))
  const somePageInvoicesSelected =
    invoices.some((invoice) => selectedInvoiceIds.has(invoice.id)) && !allPageInvoicesSelected

  useEffect(() => {
    const visibleInvoiceIds = new Set(invoices.map((invoice) => invoice.id))
    setSelectedInvoiceIds((previous) => {
      const next = new Set([...previous].filter((id) => visibleInvoiceIds.has(id)))
      return next.size === previous.size ? previous : next
    })
  }, [invoices])

  const clearInvoiceSelection = () => setSelectedInvoiceIds(new Set())

  const resetPage = () => {
    setPageIndex(0)
    clearInvoiceSelection()
  }

  const setInvoiceSelected = (invoiceId: string, selected: boolean) => {
    setBulkResult(null)
    setSelectedInvoiceIds((previous) => {
      const next = new Set(previous)
      if (selected) next.add(invoiceId)
      else next.delete(invoiceId)
      return next
    })
  }

  const setAllPageInvoicesSelected = (selected: boolean) => {
    setBulkResult(null)
    setSelectedInvoiceIds((previous) => {
      const next = new Set(previous)
      for (const invoice of invoices) {
        if (selected) next.add(invoice.id)
        else next.delete(invoice.id)
      }
      return next
    })
  }

  const markSelectedInvoicesPaid = async () => {
    const result = await bulkStatusMutation.mutateAsync({
      invoices: selectedInvoices,
      status: "paid",
    })
    setBulkResult(result)
    if (result.failed.length === 0) {
      clearInvoiceSelection()
      return
    }
    setSelectedInvoiceIds(new Set(result.failed.map((failure) => failure.id)))
  }

  const handleSort = (field: InvoiceSortableField) => {
    resetPage()
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
    (currency !== null ? 1 : 0) +
    (dueDateRange?.from || dueDateRange?.to ? 1 : 0)
  const hasActiveFilters = activeFilterCount > 0 || search !== ""

  const clearFilters = () => {
    setSearch("")
    setStatus(STATUS_ALL)
    setCurrency(null)
    setDueDateRange(null)
    resetPage()
  }

  const f = messages.invoicesPage

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{f.title}</h1>
          <p className="text-sm text-muted-foreground">{f.description}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <Label htmlFor="invoices-search" className="sr-only">
              {f.searchPlaceholder}
            </Label>
            <Search
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="invoices-search"
              placeholder={f.searchPlaceholder}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                resetPage()
              }}
              className="pl-9"
            />
          </div>

          <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
            <PopoverTrigger
              render={
                <Button variant="outline" size="default">
                  <ListFilter className="mr-2 size-4" aria-hidden="true" />
                  {f.filters.button}
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
              className="max-h-[75vh] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto p-4"
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="invoices-filter-status">{f.filters.statusLabel}</Label>
                  <Select
                    value={status}
                    onValueChange={(value) => {
                      setStatus(value ?? STATUS_ALL)
                      resetPage()
                    }}
                  >
                    <SelectTrigger id="invoices-filter-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={STATUS_ALL}>{f.filters.statusAll}</SelectItem>
                      {invoiceStatuses.map((value) => (
                        <SelectItem key={value} value={value}>
                          {messages.common.invoiceStatusLabels[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>{f.filters.currencyLabel}</Label>
                  <CurrencyCombobox
                    value={currency}
                    onChange={(value) => {
                      setCurrency(value)
                      resetPage()
                    }}
                    placeholder={f.filters.currencyAny}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>{f.filters.dueDateLabel}</Label>
                  <DateRangePicker
                    value={dueDateRange}
                    onChange={(value) => {
                      setDueDateRange(value)
                      resetPage()
                    }}
                    placeholder={f.filters.dateAny}
                    clearable
                    className="w-full"
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="mr-1 size-4" aria-hidden="true" />
              {f.filters.clear}
            </Button>
          )}

          <div className="ml-auto">
            <Button onClick={() => setInvoiceDialogOpen(true)}>
              <Plus className="mr-2 size-4" aria-hidden="true" />
              {f.actions.newInvoice}
            </Button>
          </div>
        </div>

        <InvoiceBulkActions
          selectedCount={selectedCount}
          result={bulkResult}
          pending={bulkStatusMutation.isPending}
          onClear={clearInvoiceSelection}
          onMarkPaid={markSelectedInvoicesPaid}
        />

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    className={TOUCH_CHECKBOX_CLASS}
                    aria-label={f.bulkActions.selectAllOnPage}
                    checked={allPageInvoicesSelected}
                    indeterminate={somePageInvoicesSelected}
                    disabled={showSkeleton || invoices.length === 0}
                    onClickCapture={(event) => event.stopPropagation()}
                    onCheckedChange={(checked) => setAllPageInvoicesSelected(Boolean(checked))}
                  />
                </TableHead>
                <TableHead>
                  <SortHeader
                    label={f.columns.invoiceNumber}
                    field="invoiceNumber"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead>
                  <SortHeader
                    label={f.columns.status}
                    field="status"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead className={SECONDARY_COLUMN_CLASS}>
                  <SortHeader
                    label={f.columns.total}
                    field="totalCents"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead className={SECONDARY_COLUMN_CLASS}>
                  <SortHeader
                    label={f.columns.paid}
                    field="paidCents"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead>
                  <SortHeader
                    label={f.columns.balanceDue}
                    field="balanceDueCents"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead>
                  <SortHeader
                    label={f.columns.dueDate}
                    field="dueDate"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {showSkeleton ? (
                <InvoiceRowSkeleton rows={6} />
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-sm text-destructive">
                    {f.loadFailed}
                  </TableCell>
                </TableRow>
              ) : invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                    {f.empty}
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((row: InvoiceRecord) => (
                  <TableRow
                    key={row.id}
                    onClick={() => onOpenInvoice?.(row.id)}
                    className={cn(onOpenInvoice && "cursor-pointer")}
                  >
                    <TableCell>
                      <Checkbox
                        className={TOUCH_CHECKBOX_CLASS}
                        aria-label={f.bulkActions.selectInvoice}
                        checked={selectedInvoiceIds.has(row.id)}
                        onClickCapture={(event) => event.stopPropagation()}
                        onCheckedChange={(checked) => setInvoiceSelected(row.id, Boolean(checked))}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        {row.invoiceNumber}
                        {row.invoiceType && row.invoiceType !== "invoice" ? (
                          <Badge
                            data-slot="invoice-type-badge"
                            data-invoice-type={row.invoiceType}
                            variant={invoiceTypeVariant[row.invoiceType] ?? "secondary"}
                          >
                            {messages.invoiceDetailPage.invoiceTypeLabels[row.invoiceType]}
                          </Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={invoiceStatusVariant[row.status] ?? "secondary"}
                        className="capitalize"
                      >
                        {messages.common.invoiceStatusLabels[row.status] ?? row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className={cn("font-mono", SECONDARY_COLUMN_CLASS)}>
                      {formatInvoiceAmount(row.totalCents, row.currency)}
                    </TableCell>
                    <TableCell className={cn("font-mono", SECONDARY_COLUMN_CLASS)}>
                      {formatInvoiceAmount(row.paidCents, row.currency)}
                    </TableCell>
                    <TableCell className="font-mono">
                      {formatInvoiceAmount(row.balanceDueCents, row.currency)}
                    </TableCell>
                    <TableCell>{row.dueDate}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <PaginationBar
          shown={invoices.length}
          total={total}
          page={page}
          pageCount={pageCount}
          onPrevious={() => {
            clearInvoiceSelection()
            setPageIndex((prev) => Math.max(0, prev - 1))
          }}
          onNext={() => {
            clearInvoiceSelection()
            setPageIndex((prev) => prev + 1)
          }}
          canGoBack={pageIndex > 0}
          canGoForward={(pageIndex + 1) * PAGE_SIZE < total}
        />
      </div>

      <InvoiceDialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen} />
    </div>
  )
}
