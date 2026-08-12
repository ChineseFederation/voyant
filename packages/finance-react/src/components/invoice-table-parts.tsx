import { formatMessage } from "@voyant-travel/i18n"
import { Button } from "@voyant-travel/ui/components/button"
import { Skeleton } from "@voyant-travel/ui/components/skeleton"
import { TableCell, TableRow } from "@voyant-travel/ui/components/table"
import { SECONDARY_COLUMN_CLASS } from "@voyant-travel/ui/lib/responsive"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"

import { useFinanceUiMessagesOrDefault } from "../i18n/index.js"

export const invoiceStatusVariant: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "outline",
  pending_external_allocation: "outline",
  issued: "secondary",
  partially_paid: "secondary",
  paid: "default",
  overdue: "destructive",
  void: "destructive",
}

export const invoiceTypeVariant: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  invoice: "default",
  proforma: "outline",
  credit_note: "destructive",
}

export function formatInvoiceAmount(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`
}

interface SortHeaderProps<TField extends string> {
  label: string
  field: TField
  sortBy: string
  sortDir: "asc" | "desc"
  onSort: (field: TField) => void
}

export function SortHeader<TField extends string>({
  label,
  field,
  sortBy,
  sortDir,
  onSort,
}: SortHeaderProps<TField>) {
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

export function PaginationBar({
  shown,
  total,
  page,
  pageCount,
  onPrevious,
  onNext,
  canGoBack,
  canGoForward,
}: {
  shown: number
  total: number
  page: number
  pageCount: number
  onPrevious: () => void
  onNext: () => void
  canGoBack: boolean
  canGoForward: boolean
}) {
  const messages = useFinanceUiMessagesOrDefault()
  const f = messages.invoicesPage.pagination
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>{formatMessage(f.showing, { count: shown, total })}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={!canGoBack} onClick={onPrevious}>
          {f.previous}
        </Button>
        <span>{formatMessage(f.page, { page, pageCount })}</span>
        <Button variant="outline" size="sm" disabled={!canGoForward} onClick={onNext}>
          {f.next}
        </Button>
      </div>
    </div>
  )
}

export function InvoiceRowSkeleton({ rows }: { rows: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, idx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: because skeleton placeholders are stable
        <TableRow key={`skeleton-${idx}`}>
          <TableCell>
            <Skeleton className="size-4" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-32" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-20 rounded-full" />
          </TableCell>
          {/* Total and Paid drop out below `md`; mirror that here or the
              skeleton columns misalign with the header while loading. */}
          <TableCell className={SECONDARY_COLUMN_CLASS}>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell className={SECONDARY_COLUMN_CLASS}>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}
