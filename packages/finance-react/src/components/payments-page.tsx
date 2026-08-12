import {
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components"
import { AsyncCombobox } from "@voyant-travel/ui/components/async-combobox"
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
import { cn } from "@voyant-travel/ui/lib/utils"
import { ListFilter, Plus, Search, X } from "lucide-react"
import type { ReactNode } from "react"
import { useState } from "react"
import { useFinanceUiMessagesOrDefault } from "../i18n/index.js"
import { paymentMethods, supplierPaymentStatuses } from "../i18n/messages.js"
import {
  type FinanceAllPaymentsListSortDir,
  type FinanceAllPaymentsListSortField,
  type FinancePaymentKind,
  useAllPayments,
} from "../index.js"

const PAGE_SIZE = 25
const KIND_ALL = "__all__"
const STATUS_ALL = "__all__"
const METHOD_ALL = "__all__"

const PAYMENT_KINDS: FinancePaymentKind[] = ["customer", "supplier"]

type PaymentSortableField = Exclude<FinanceAllPaymentsListSortField, "createdAt">

export interface PaymentSupplierOption {
  id: string
  name: string
}

export interface RecordPaymentDialogRenderProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultKind: FinancePaymentKind
}

export interface PaymentsPageProps {
  className?: string
  onOpenPayment?: (paymentId: string) => void
  supplierOptions?: PaymentSupplierOption[]
  onSupplierSearchChange?: (search: string) => void
  renderRecordPaymentDialog?: (props: RecordPaymentDialogRenderProps) => ReactNode
}

const paymentStatusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  completed: "default",
  failed: "destructive",
  refunded: "secondary",
}

function formatAmount(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`
}

export function PaymentsPage({
  className,
  onOpenPayment,
  supplierOptions = [],
  onSupplierSearchChange,
  renderRecordPaymentDialog,
}: PaymentsPageProps = {}) {
  const messages = useFinanceUiMessagesOrDefault()
  const [recordDialogOpen, setRecordDialogOpen] = useState(false)

  const [search, setSearch] = useState("")
  const [kind, setKind] = useState<string>(KIND_ALL)
  const [status, setStatus] = useState<string>(STATUS_ALL)
  const [method, setMethod] = useState<string>(METHOD_ALL)
  const [currency, setCurrency] = useState<string | null>(null)
  const [supplierId, setSupplierId] = useState<string | null>(null)
  const [selectedSupplier, setSelectedSupplier] = useState<PaymentSupplierOption | null>(null)
  const [paymentDateRange, setPaymentDateRange] = useState<{
    from: string | null
    to: string | null
  } | null>(null)
  const [sortBy, setSortBy] = useState<FinanceAllPaymentsListSortField>("createdAt")
  const [sortDir, setSortDir] = useState<FinanceAllPaymentsListSortDir>("desc")
  const [pageIndex, setPageIndex] = useState(0)
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false)

  const { data, isPending, isFetching, isError } = useAllPayments({
    search: search || undefined,
    kind: kind === KIND_ALL ? undefined : (kind as FinancePaymentKind),
    status: status === STATUS_ALL ? undefined : status,
    paymentMethod: method === METHOD_ALL ? undefined : method,
    currency: currency ?? undefined,
    supplierId: supplierId ?? undefined,
    paymentDateFrom: paymentDateRange?.from ?? undefined,
    paymentDateTo: paymentDateRange?.to ?? undefined,
    sortBy,
    sortDir,
    limit: PAGE_SIZE,
    offset: pageIndex * PAGE_SIZE,
  })

  const payments = data?.data ?? []
  const total = data?.total ?? 0
  const page = pageIndex + 1
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const showSkeleton = isPending || (isFetching && payments.length === 0)

  const resetPage = () => setPageIndex(0)

  const handleSort = (field: PaymentSortableField) => {
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
    (kind !== KIND_ALL ? 1 : 0) +
    (status !== STATUS_ALL ? 1 : 0) +
    (method !== METHOD_ALL ? 1 : 0) +
    (currency !== null ? 1 : 0) +
    (supplierId !== null ? 1 : 0) +
    (paymentDateRange?.from || paymentDateRange?.to ? 1 : 0)
  const hasActiveFilters = activeFilterCount > 0 || search !== ""

  const clearFilters = () => {
    setSearch("")
    setKind(KIND_ALL)
    setStatus(STATUS_ALL)
    setMethod(METHOD_ALL)
    setCurrency(null)
    setSupplierId(null)
    setSelectedSupplier(null)
    setPaymentDateRange(null)
    onSupplierSearchChange?.("")
    resetPage()
  }

  const f = messages.paymentsPage

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
            <Label htmlFor="payments-search" className="sr-only">
              {f.searchPlaceholder}
            </Label>
            <Search
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="payments-search"
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
                  <Label htmlFor="payments-filter-kind">{f.filters.kindLabel}</Label>
                  <Select
                    value={kind}
                    onValueChange={(value) => {
                      setKind(value ?? KIND_ALL)
                      resetPage()
                    }}
                  >
                    <SelectTrigger id="payments-filter-kind" className="w-full">
                      <SelectValue>
                        {(value) =>
                          value === KIND_ALL
                            ? f.filters.kindAll
                            : (f.kindLabels[value as keyof typeof f.kindLabels] ?? value)
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={KIND_ALL}>{f.filters.kindAll}</SelectItem>
                      {PAYMENT_KINDS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {f.kindLabels[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="payments-filter-status">{f.filters.statusLabel}</Label>
                  <Select
                    value={status}
                    onValueChange={(value) => {
                      setStatus(value ?? STATUS_ALL)
                      resetPage()
                    }}
                  >
                    <SelectTrigger id="payments-filter-status" className="w-full">
                      <SelectValue>
                        {(value) =>
                          value === STATUS_ALL
                            ? f.filters.statusAll
                            : (messages.common.supplierPaymentStatusLabels[
                                value as keyof typeof messages.common.supplierPaymentStatusLabels
                              ] ?? value)
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={STATUS_ALL}>{f.filters.statusAll}</SelectItem>
                      {supplierPaymentStatuses.map((value) => (
                        <SelectItem key={value} value={value}>
                          {messages.common.supplierPaymentStatusLabels[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="payments-filter-method">{f.filters.methodLabel}</Label>
                  <Select
                    value={method}
                    onValueChange={(value) => {
                      setMethod(value ?? METHOD_ALL)
                      resetPage()
                    }}
                  >
                    <SelectTrigger id="payments-filter-method" className="w-full">
                      <SelectValue>
                        {(value) =>
                          value === METHOD_ALL
                            ? f.filters.methodAll
                            : (messages.common.paymentMethodLabels[
                                value as keyof typeof messages.common.paymentMethodLabels
                              ] ?? value)
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={METHOD_ALL}>{f.filters.methodAll}</SelectItem>
                      {paymentMethods.map((value) => (
                        <SelectItem key={value} value={value}>
                          {messages.common.paymentMethodLabels[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>{f.filters.supplierLabel}</Label>
                  <AsyncCombobox<PaymentSupplierOption>
                    value={supplierId}
                    onChange={(value) => {
                      setSupplierId(value)
                      if (!value) setSelectedSupplier(null)
                      else {
                        const match = supplierOptions.find((supplier) => supplier.id === value)
                        if (match) setSelectedSupplier(match)
                      }
                      resetPage()
                    }}
                    items={supplierOptions}
                    selectedItem={selectedSupplier}
                    getKey={(supplier) => supplier.id}
                    getLabel={(supplier) => supplier.name}
                    onSearchChange={onSupplierSearchChange}
                    placeholder={f.filters.supplierAny}
                    emptyText={f.filters.supplierEmpty}
                  />
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
                  <Label>{f.filters.paymentDateLabel}</Label>
                  <DateRangePicker
                    value={paymentDateRange}
                    onChange={(value) => {
                      setPaymentDateRange(value)
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

          {renderRecordPaymentDialog ? (
            <div className="ml-auto">
              <Button onClick={() => setRecordDialogOpen(true)}>
                <Plus className="mr-2 size-4" aria-hidden="true" />
                {f.actions.recordPayment}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{f.columns.kind}</TableHead>
                <TableHead>{f.columns.reference}</TableHead>
                <TableHead>{f.columns.party}</TableHead>
                <TableHead>
                  <SortHeader
                    label={f.columns.amount}
                    field="amountCents"
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
                <TableHead>
                  <SortHeader
                    label={f.columns.date}
                    field="paymentDate"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead>{f.columns.method}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {showSkeleton ? (
                <PaymentRowSkeleton rows={6} />
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-sm text-destructive">
                    {f.loadFailed}
                  </TableCell>
                </TableRow>
              ) : payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                    {f.empty}
                  </TableCell>
                </TableRow>
              ) : (
                payments.map((row) => {
                  const reference = row.kind === "customer" ? row.invoiceNumber : row.bookingNumber
                  const party =
                    row.kind === "supplier"
                      ? (row.supplierName ?? f.noValue)
                      : (row.personName ?? row.organizationName ?? f.noValue)
                  return (
                    <TableRow
                      key={`${row.kind}-${row.id}`}
                      onClick={() => onOpenPayment?.(row.id)}
                      className={cn(onOpenPayment && "cursor-pointer")}
                    >
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {f.kindLabels[row.kind]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{reference ?? f.noValue}</span>
                          {row.referenceNumber ? (
                            <span className="text-xs text-muted-foreground">
                              {row.referenceNumber}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{party}</TableCell>
                      <TableCell className="font-mono">
                        {formatAmount(row.amountCents, row.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={paymentStatusVariant[row.status] ?? "secondary"}
                          className="capitalize"
                        >
                          {messages.common.supplierPaymentStatusLabels[row.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.paymentDate}</TableCell>
                      <TableCell className="capitalize">
                        {messages.common.paymentMethodLabels[
                          row.paymentMethod as keyof typeof messages.common.paymentMethodLabels
                        ] ?? row.paymentMethod}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        <PaginationBar
          shown={payments.length}
          total={total}
          page={page}
          pageCount={pageCount}
          onPrevious={() => setPageIndex((prev) => Math.max(0, prev - 1))}
          onNext={() => setPageIndex((prev) => prev + 1)}
          canGoBack={pageIndex > 0}
          canGoForward={(pageIndex + 1) * PAGE_SIZE < total}
        />
      </div>

      {renderRecordPaymentDialog?.({
        open: recordDialogOpen,
        onOpenChange: setRecordDialogOpen,
        defaultKind: kind === KIND_ALL ? "customer" : (kind as FinancePaymentKind),
      })}
    </div>
  )
}

import { PaginationBar, PaymentRowSkeleton, SortHeader } from "./payments-page/controls.js"
