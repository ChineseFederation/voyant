import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components/table"
import { cn } from "@voyant-travel/ui/lib/utils"
import { Plus, Search } from "lucide-react"
import { useState } from "react"
import { useFinanceUiMessagesOrDefault } from "../i18n/index.js"
import {
  type FinanceSupplierInvoiceListSortDir,
  type FinanceSupplierInvoiceListSortField,
  type SupplierInvoiceStatus,
  useSupplierInvoices,
} from "../index.js"
import type { AsyncComboboxOption } from "./async-combobox.js"
import {
  formatInvoiceAmount,
  InvoiceRowSkeleton,
  PaginationBar,
  SortHeader,
} from "./invoice-table-parts.js"
import {
  type SupplierInvoiceExtraction,
  SupplierInvoiceFormDialog,
} from "./supplier-invoice-form-dialog.js"

const PAGE_SIZE = 25
const STATUS_ALL = "__all__"

const STATUS_ORDER: SupplierInvoiceStatus[] = [
  "draft",
  "received",
  "approved",
  "partially_paid",
  "paid",
  "disputed",
  "void",
]

const STATUS_VARIANT: Record<
  SupplierInvoiceStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "outline",
  received: "secondary",
  approved: "secondary",
  partially_paid: "default",
  paid: "default",
  disputed: "destructive",
  void: "outline",
}

export interface SupplierInvoicesPageProps {
  className?: string
  onOpenSupplierInvoice?: (id: string) => void
  /** Optional invoice-extraction extension point for the create dialog. */
  extractFromFile?: (file: File) => Promise<SupplierInvoiceExtraction>
  /** Search suppliers for the create dialog's supplier picker. */
  searchSuppliers?: (query: string) => Promise<AsyncComboboxOption[]>
  /** Create a supplier inline from the create dialog's supplier picker. */
  createSupplier?: (name: string) => Promise<AsyncComboboxOption | null>
  /** Search products for the create dialog's product/departure attribution. */
  searchProducts?: (query: string) => Promise<AsyncComboboxOption[]>
  /** List a product's departures for the create dialog's two-step picker. */
  listDeparturesForProduct?: (productId: string, query: string) => Promise<AsyncComboboxOption[]>
}

type SortableField = Exclude<FinanceSupplierInvoiceListSortField, "createdAt">

export function SupplierInvoicesPage({
  className,
  onOpenSupplierInvoice,
  extractFromFile,
  searchSuppliers,
  createSupplier,
  searchProducts,
  listDeparturesForProduct,
}: SupplierInvoicesPageProps = {}) {
  const t = useFinanceUiMessagesOrDefault().supplierInvoicesPage

  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<string>(STATUS_ALL)
  const [sortBy, setSortBy] = useState<FinanceSupplierInvoiceListSortField>("createdAt")
  const [sortDir, setSortDir] = useState<FinanceSupplierInvoiceListSortDir>("desc")
  const [pageIndex, setPageIndex] = useState(0)

  const { data, isPending, isFetching, isError } = useSupplierInvoices({
    search: search || undefined,
    status: status === STATUS_ALL ? undefined : status,
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

  const onSort = (field: SortableField) => {
    if (sortBy === field) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))
    } else {
      setSortBy(field)
      setSortDir("desc")
    }
    setPageIndex(0)
  }

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
          <p className="text-sm text-muted-foreground">{t.description}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          {t.recordInvoice}
        </Button>
      </div>

      <SupplierInvoiceFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={(id) => onOpenSupplierInvoice?.(id)}
        extractFromFile={extractFromFile}
        searchSuppliers={searchSuppliers}
        createSupplier={createSupplier}
        searchProducts={searchProducts}
        listDeparturesForProduct={listDeparturesForProduct}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPageIndex(0)
            }}
          />
        </div>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value ?? STATUS_ALL)
            setPageIndex(0)
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={STATUS_ALL}>{t.statusAll}</SelectItem>
            {STATUS_ORDER.map((value) => (
              <SelectItem key={value} value={value}>
                {t.statusLabels[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.columns.invoiceNo}</TableHead>
              <TableHead>{t.columns.supplier}</TableHead>
              <TableHead>{t.columns.status}</TableHead>
              <TableHead className="text-right">
                <SortHeader
                  label={t.columns.total}
                  field="totalCents"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead className="text-right">
                <SortHeader
                  label={t.columns.balanceDue}
                  field="balanceDueCents"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead>
                <SortHeader
                  label={t.columns.dueDate}
                  field="dueDate"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={onSort}
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {showSkeleton ? (
              <InvoiceRowSkeleton rows={6} />
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-destructive">
                  {t.loadFailed}
                </TableCell>
              </TableRow>
            ) : invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {t.empty}
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((invoice) => (
                <TableRow
                  key={invoice.id}
                  className={onOpenSupplierInvoice ? "cursor-pointer" : undefined}
                  onClick={
                    onOpenSupplierInvoice ? () => onOpenSupplierInvoice(invoice.id) : undefined
                  }
                >
                  <TableCell className="font-medium">{invoice.supplierInvoiceNo}</TableCell>
                  <TableCell className="text-muted-foreground" title={invoice.supplierId}>
                    {invoice.supplierName ?? invoice.supplierId}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[invoice.status]}>
                      {t.statusLabels[invoice.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatInvoiceAmount(invoice.totalCents, invoice.currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatInvoiceAmount(invoice.balanceDueCents, invoice.currency)}
                  </TableCell>
                  <TableCell>{invoice.dueDate ?? t.noDueDate}</TableCell>
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
        onPrevious={() => setPageIndex((index) => Math.max(0, index - 1))}
        onNext={() => setPageIndex((index) => Math.min(pageCount - 1, index + 1))}
        canGoBack={page > 1}
        canGoForward={page < pageCount}
      />
    </div>
  )
}
