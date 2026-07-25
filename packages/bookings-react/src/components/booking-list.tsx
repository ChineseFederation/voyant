// agent-quality: file-size exception -- owner: bookings-react; existing UI surface stays co-located until a dedicated split preserves behavior and tests.
"use client"

import { Input } from "@voyant-travel/ui/components/input"
import { Label } from "@voyant-travel/ui/components/label"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@voyant-travel/ui/components/pagination"
import { Skeleton } from "@voyant-travel/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components/table"
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react"
import * as React from "react"
import { BOOKING_STATUS_ALL } from "../booking-list-constants.js"
import {
  formatMessage,
  useBookingsUiI18nOrDefault,
  useBookingsUiMessagesOrDefault,
} from "../i18n/provider.js"
import {
  type BookingRecord,
  type BookingsListSortDir,
  type BookingsListSortField,
  useBookings,
} from "../index.js"
import { BookingDialog } from "./booking-dialog.js"
import { BookingListFiltersPopover } from "./booking-list-filters.js"
import { StatusBadge } from "./status-badge.js"

/**
 * Serializable snapshot of the booking-list filter / sort / paging
 * state. Hosts that want shareable URLs (operator starter) read this
 * from the URL on mount via `initialFilters` and push changes via
 * `onFiltersChange`.
 */
export interface BookingListFiltersState {
  search: string
  /** `BOOKING_STATUS_ALL` ("all statuses") or any booking status value. */
  status: string
  productId: string | null
  optionId: string | null
  supplierId: string | null
  productCategoryId: string | null
  personId: string | null
  organizationId: string | null
  availabilitySlotId: string | null
  dateFrom: string | null
  dateTo: string | null
  paxMin: string
  paxMax: string
  sortBy: BookingsListSortField
  sortDir: BookingsListSortDir
  offset: number
}

function stripUndefined<T extends object>(input: T): Partial<T> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) result[key] = value
  }
  return result as Partial<T>
}

const DEFAULT_FILTERS: BookingListFiltersState = {
  search: "",
  status: BOOKING_STATUS_ALL,
  productId: null,
  optionId: null,
  supplierId: null,
  productCategoryId: null,
  personId: null,
  organizationId: null,
  availabilitySlotId: null,
  dateFrom: null,
  dateTo: null,
  paxMin: "",
  paxMax: "",
  sortBy: "createdAt",
  sortDir: "desc",
  offset: 0,
}

export interface BookingListProps {
  pageSize?: number
  onSelectBooking?: (booking: BookingRecord) => void
  /**
   * Extra action(s) rendered next to the primary "New booking" button in
   * the filter bar. Templates use this to surface adjacent flows such as
   * the trips without forking the component.
   */
  headerActions?: React.ReactNode
  /**
   * Initial filter / sort / paging state, typically parsed from the URL.
   * Only specified keys override the defaults — partial input is fine.
   */
  initialFilters?: Partial<BookingListFiltersState>
  /**
   * Fires when any filter, sort, or paging value changes. Hosts push
   * the snapshot into the URL so refresh / share preserves the view.
   */
  onFiltersChange?: (filters: BookingListFiltersState) => void
}

type SortableField = BookingsListSortField

const SORTABLE_COLUMNS = {
  bookingNumber: "bookingNumber",
  status: "status",
  sellAmount: "sellAmount",
  pax: "pax",
  startDate: "startDate",
  endDate: "endDate",
  createdAt: "createdAt",
} as const satisfies Record<SortableField, SortableField>

const SKELETON_ROW_COUNT = 6
const TABLE_COLUMN_COUNT = 8

export function BookingList({
  pageSize = 25,
  onSelectBooking,
  headerActions,
  initialFilters,
  onFiltersChange,
}: BookingListProps = {}) {
  // Single bag of filter / sort / paging state so we can hand the host
  // a snapshot whenever anything changes. We seed once from
  // `initialFilters` and don't re-seed if the prop later mutates —
  // hosts that want to drive controlled changes can just remount.
  //
  // Strip `undefined` keys before merging: a host passing
  // `{ status: undefined }` would otherwise clobber the
  // `BOOKING_STATUS_ALL` default and show "2" active filters on an
  // empty URL.
  const [filters, setFilters] = React.useState<BookingListFiltersState>(() => ({
    ...DEFAULT_FILTERS,
    ...stripUndefined(initialFilters ?? {}),
  }))

  const onFiltersChangeRef = React.useRef(onFiltersChange)
  React.useEffect(() => {
    onFiltersChangeRef.current = onFiltersChange
  })
  // Notify the host on every state change. Skip the initial render
  // because the URL already reflects whatever was passed in via
  // `initialFilters`.
  const isFirstRender = React.useRef(true)
  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    onFiltersChangeRef.current?.(filters)
  }, [filters])

  const updateFilters = React.useCallback(
    (patch: Partial<BookingListFiltersState>) => setFilters((prev) => ({ ...prev, ...patch })),
    [],
  )

  const {
    search,
    status,
    productId,
    optionId,
    supplierId,
    productCategoryId,
    personId,
    organizationId,
    availabilitySlotId,
    dateFrom,
    dateTo,
    paxMin,
    paxMax,
    sortBy,
    sortDir,
    offset,
  } = filters
  const dateRange = dateFrom != null || dateTo != null ? { from: dateFrom, to: dateTo } : null

  const [filterPopoverOpen, setFilterPopoverOpen] = React.useState(false)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<BookingRecord | undefined>(undefined)
  const { formatDate, formatDateTime, formatNumber, locale } = useBookingsUiI18nOrDefault()
  const messages = useBookingsUiMessagesOrDefault()

  const paxMinNumber = paxMin === "" ? undefined : Number.parseInt(paxMin, 10)
  const paxMaxNumber = paxMax === "" ? undefined : Number.parseInt(paxMax, 10)

  // "All" hides drafts + expired by default — they're rarely actionable
  // and crowd the operator's queue. Explicit selection of either status
  // (or any other) opts back in.
  const excludeStatuses = status === BOOKING_STATUS_ALL ? ["draft", "expired"] : undefined

  const { data, isPending, isFetching, isError } = useBookings({
    search: search || undefined,
    status: status === BOOKING_STATUS_ALL ? undefined : status,
    excludeStatuses,
    productId: productId ?? undefined,
    optionId: optionId ?? undefined,
    availabilitySlotId: availabilitySlotId ?? undefined,
    supplierId: supplierId ?? undefined,
    productCategoryId: productCategoryId ?? undefined,
    personId: personId ?? undefined,
    organizationId: organizationId ?? undefined,
    dateFrom: dateRange?.from ?? undefined,
    dateTo: dateRange?.to ?? undefined,
    paxMin: Number.isFinite(paxMinNumber) ? paxMinNumber : undefined,
    paxMax: Number.isFinite(paxMaxNumber) ? paxMaxNumber : undefined,
    sortBy,
    sortDir,
    limit: pageSize,
    offset,
  })

  const bookings = data?.data ?? []
  const total = data?.total ?? 0
  const page = Math.floor(offset / pageSize) + 1
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const showSkeleton = isPending || (isFetching && bookings.length === 0)

  const handleSelect = (booking: BookingRecord) => {
    if (onSelectBooking) {
      onSelectBooking(booking)
      return
    }
    setEditing(booking)
    setDialogOpen(true)
  }

  const resetOffset = () => updateFilters({ offset: 0 })

  const handleSort = (field: SortableField) => {
    if (sortBy !== field) {
      updateFilters({ offset: 0, sortBy: field, sortDir: "asc" })
      return
    }
    if (sortDir === "asc") {
      updateFilters({ offset: 0, sortDir: "desc" })
      return
    }
    updateFilters({ offset: 0, sortBy: "createdAt", sortDir: "desc" })
  }

  const activeFilterCount =
    (status !== BOOKING_STATUS_ALL ? 1 : 0) +
    (productId !== null ? 1 : 0) +
    (optionId !== null ? 1 : 0) +
    (availabilitySlotId !== null ? 1 : 0) +
    (supplierId !== null ? 1 : 0) +
    (productCategoryId !== null ? 1 : 0) +
    (personId !== null ? 1 : 0) +
    (organizationId !== null ? 1 : 0) +
    (dateRange?.from || dateRange?.to ? 1 : 0) +
    (paxMin !== "" || paxMax !== "" ? 1 : 0)
  const hasActiveFilters = activeFilterCount > 0 || search !== ""

  const clearFilters = () => {
    updateFilters({
      search: "",
      status: BOOKING_STATUS_ALL,
      productId: null,
      optionId: null,
      availabilitySlotId: null,
      supplierId: null,
      productCategoryId: null,
      personId: null,
      organizationId: null,
      dateFrom: null,
      dateTo: null,
      paxMin: "",
      paxMax: "",
      offset: 0,
    })
  }

  const columnMessages = messages.bookingList.columns
  const statusLabels = messages.common.bookingStatusLabels

  return (
    <div data-slot="booking-list" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Label htmlFor="bookings-search" className="sr-only">
            {messages.bookingList.searchPlaceholder}
          </Label>
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="bookings-search"
            placeholder={messages.bookingList.searchPlaceholder}
            value={search}
            onChange={(event) => updateFilters({ search: event.target.value, offset: 0 })}
            className="pl-9"
          />
        </div>

        <BookingListFiltersPopover
          open={filterPopoverOpen}
          onOpenChange={setFilterPopoverOpen}
          activeFilterCount={activeFilterCount}
          status={status}
          onStatusChange={(next) => updateFilters({ status: next })}
          productId={productId}
          onProductIdChange={(next) =>
            // Slot picker is product-scoped; clear when the product changes.
            updateFilters({ productId: next, availabilitySlotId: null })
          }
          optionId={optionId}
          onOptionIdChange={(next) => updateFilters({ optionId: next })}
          availabilitySlotId={availabilitySlotId}
          onAvailabilitySlotIdChange={(next) => updateFilters({ availabilitySlotId: next })}
          supplierId={supplierId}
          onSupplierIdChange={(next) => updateFilters({ supplierId: next })}
          productCategoryId={productCategoryId}
          onProductCategoryIdChange={(next) => updateFilters({ productCategoryId: next })}
          personId={personId}
          onPersonIdChange={(next) => updateFilters({ personId: next })}
          organizationId={organizationId}
          onOrganizationIdChange={(next) => updateFilters({ organizationId: next })}
          dateRange={dateRange}
          onDateRangeChange={(next) =>
            updateFilters({ dateFrom: next?.from ?? null, dateTo: next?.to ?? null })
          }
          paxMin={paxMin}
          onPaxMinChange={(next) => updateFilters({ paxMin: next })}
          paxMax={paxMax}
          onPaxMaxChange={(next) => updateFilters({ paxMax: next })}
          onFiltersChanged={resetOffset}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearFilters}
        />

        <div className="ml-auto flex items-center gap-2">{headerActions}</div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortHeader
                  label={columnMessages.bookingNumber}
                  field={SORTABLE_COLUMNS.bookingNumber}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </TableHead>
              <TableHead>
                <SortHeader
                  label={columnMessages.createdAt}
                  field={SORTABLE_COLUMNS.createdAt}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </TableHead>
              <TableHead>{columnMessages.lead}</TableHead>
              <TableHead>{columnMessages.whatBooked}</TableHead>
              <TableHead>
                <SortHeader
                  label={columnMessages.status}
                  field={SORTABLE_COLUMNS.status}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </TableHead>
              <TableHead>
                <SortHeader
                  label={columnMessages.sellAmount}
                  field={SORTABLE_COLUMNS.sellAmount}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </TableHead>
              <TableHead>
                <SortHeader
                  label={columnMessages.pax}
                  field={SORTABLE_COLUMNS.pax}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </TableHead>
              <TableHead>
                <SortHeader
                  label={columnMessages.startDate}
                  field={SORTABLE_COLUMNS.startDate}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {showSkeleton ? (
              <BookingTableSkeleton rows={SKELETON_ROW_COUNT} />
            ) : isError ? (
              <TableRow>
                <TableCell
                  colSpan={TABLE_COLUMN_COUNT}
                  className="h-24 text-center text-sm text-destructive"
                >
                  {messages.bookingList.loadingError}
                </TableCell>
              </TableRow>
            ) : bookings.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={TABLE_COLUMN_COUNT}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  {messages.bookingList.empty}
                </TableCell>
              </TableRow>
            ) : (
              bookings.map((booking) => (
                <TableRow
                  key={booking.id}
                  onClick={() => handleSelect(booking)}
                  className="cursor-pointer"
                >
                  <TableCell className="font-medium">{booking.bookingNumber}</TableCell>
                  <TableCell>{formatBookingDateTime(booking.createdAt, formatDateTime)}</TableCell>
                  <TableCell>{formatLead(booking)}</TableCell>
                  <TableCell>
                    {formatBookingItems(
                      booking,
                      messages.bookingList.itemsMore,
                      messages.bookingList.itemDays,
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={booking.status}>
                      {statusLabels[booking.status]}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    {booking.sellAmountCents == null
                      ? "—"
                      : `${formatNumber(booking.sellAmountCents / 100, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })} ${booking.sellCurrency}`}
                  </TableCell>
                  <TableCell>{booking.pax ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatBookingDateRange(
                      booking.startsAt ?? booking.startDate,
                      booking.endsAt ?? booking.endDate,
                      formatDate,
                      locale,
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          {formatMessage(messages.bookingList.showingSummary, {
            count: bookings.length,
            total,
          })}
        </span>
        {pageCount > 1 ? (
          <BookingListPagination
            page={page}
            pageCount={pageCount}
            previousLabel={messages.bookingList.previousPage}
            nextLabel={messages.bookingList.nextPage}
            onPageChange={(nextPage) => updateFilters({ offset: (nextPage - 1) * pageSize })}
          />
        ) : null}
      </div>

      {editing ? (
        <BookingDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          booking={editing}
          onSuccess={(booking) => {
            onSelectBooking?.(booking)
          }}
        />
      ) : null}
    </div>
  )
}

interface SortHeaderProps {
  label: string
  field: SortableField
  sortBy: BookingsListSortField
  sortDir: BookingsListSortDir
  onSort: (field: SortableField) => void
}

function BookingListPagination({
  page,
  pageCount,
  previousLabel,
  nextLabel,
  onPageChange,
}: {
  page: number
  pageCount: number
  previousLabel: string
  nextLabel: string
  onPageChange: (page: number) => void
}) {
  const canPrev = page > 1
  const canNext = page < pageCount
  const pages = computePageWindow(page, pageCount)
  return (
    <Pagination className="mx-0 w-auto justify-end">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            text={previousLabel}
            size="default"
            aria-disabled={!canPrev}
            tabIndex={canPrev ? 0 : -1}
            className={canPrev ? undefined : "pointer-events-none opacity-50"}
            onClick={(event) => {
              event.preventDefault()
              if (canPrev) onPageChange(page - 1)
            }}
          />
        </PaginationItem>
        {pages.map((entry, idx) => (
          <PaginationItem
            // biome-ignore lint/suspicious/noArrayIndexKey: ellipsis sentinels collide on value alone -- owner: bookings-react; existing suppression is intentional pending typed cleanup.
            key={`${entry}-${idx}`}
          >
            {entry === "…" ? (
              <span className="px-2 text-muted-foreground" aria-hidden>
                …
              </span>
            ) : (
              <PaginationLink
                href="#"
                size="icon"
                isActive={entry === page}
                onClick={(event) => {
                  event.preventDefault()
                  if (entry !== page) onPageChange(entry)
                }}
              >
                {entry}
              </PaginationLink>
            )}
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext
            href="#"
            text={nextLabel}
            size="default"
            aria-disabled={!canNext}
            tabIndex={canNext ? 0 : -1}
            className={canNext ? undefined : "pointer-events-none opacity-50"}
            onClick={(event) => {
              event.preventDefault()
              if (canNext) onPageChange(page + 1)
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}

/** Build a 1-indexed page list with ellipses for tables with many
 * pages. Always shows first, last, current, and one neighbour on
 * either side. */
function computePageWindow(page: number, pageCount: number): Array<number | "…"> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1)
  }
  const out: Array<number | "…"> = [1]
  const start = Math.max(2, page - 1)
  const end = Math.min(pageCount - 1, page + 1)
  if (start > 2) out.push("…")
  for (let i = start; i <= end; i += 1) out.push(i)
  if (end < pageCount - 1) out.push("…")
  out.push(pageCount)
  return out
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

function BookingTableSkeleton({ rows }: { rows: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, idx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: because skeleton placeholders are stable
        <TableRow key={`skeleton-${idx}`}>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-48" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-20 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-8" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-32" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-32" />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}

function formatBookingItems(
  booking: BookingRecord,
  moreTemplate: string,
  daysTemplate: string,
): React.ReactNode {
  const items = booking.items ?? []
  if (items.length === 0) return <span className="text-muted-foreground">—</span>
  const [first, ...rest] = items
  if (!first) return <span className="text-muted-foreground">—</span>
  const label = first.productName ?? first.title
  const days = computeItemDays(first.startsAt, first.endsAt)
  const daysSuffix = days > 0 ? ` ${formatMessage(daysTemplate, { count: days })}` : ""
  const moreSuffix =
    rest.length === 0 ? "" : ` ${formatMessage(moreTemplate, { count: rest.length })}`
  return (
    <div className="max-w-[320px] truncate" title={`${label}${daysSuffix}${moreSuffix}`}>
      {label}
      {days > 0 ? (
        <span className="ml-1 text-xs text-muted-foreground">
          {formatMessage(daysTemplate, { count: days })}
        </span>
      ) : null}
      {rest.length > 0 ? (
        <span className="ml-1 text-xs text-muted-foreground">
          {formatMessage(moreTemplate, { count: rest.length })}
        </span>
      ) : null}
    </div>
  )
}

/** Inclusive day-count between two ISO timestamps, rounded up so a
 * trip spanning two calendar days reads "2 days". Returns 0 when
 * either bound is missing so the caller can drop the tag entirely. */
function computeItemDays(
  startValue: string | null | undefined,
  endValue: string | null | undefined,
): number {
  const start = toDate(startValue)
  const end = toDate(endValue)
  if (!start || !end) return 0
  const ms = end.getTime() - start.getTime()
  if (!Number.isFinite(ms) || ms < 0) return 0
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24))
  return Math.max(1, days)
}

function formatBookingDateTime(
  value: string | null | undefined,
  formatDateTime: (value: Date | string | number) => string,
) {
  if (!value) return "—"
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatDateTime(`${value}T00:00:00`)
  }
  return formatDateTime(value)
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Compact date-range formatter for the bookings table — collapses
 * shared month/year so a 3-day trip reads "Jun 15 – 20, 2026" in
 * English and "15 – 20 iun., 2026" in Romanian. Output respects the
 * locale's day/month order.
 *
 * NOTE: `Intl.DateTimeFormat` produces nonsense (e.g.
 * `"2026 (day: 20)"`) for incomplete combinations like `{ day, year }`
 * without a month. We build the compact range from named parts
 * instead of asking Intl to skip the month.
 */
function formatBookingDateRange(
  startValue: string | null | undefined,
  endValue: string | null | undefined,
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string,
  locale: string,
): string {
  const start = toDate(startValue)
  const end = toDate(endValue)
  if (!start && !end) return "—"
  if (start && !end) return formatDate(start, { month: "short", day: "numeric", year: "numeric" })
  if (!start || !end)
    return formatDate(end as Date, { month: "short", day: "numeric", year: "numeric" })
  const s = start
  const e = end
  const sameDay =
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth() &&
    s.getDate() === e.getDate()
  if (sameDay) return formatDate(s, { month: "short", day: "numeric", year: "numeric" })
  const sameYear = s.getFullYear() === e.getFullYear()
  const sameMonth = sameYear && s.getMonth() === e.getMonth()

  // For collapsed ranges we need to know whether the locale puts the
  // month before or after the day (en-US: "Jun 15", ro-RO: "15 iun.")
  // so the result reads naturally.
  const dayFirst = isLocaleDayFirst(locale)
  const monthShortStart = formatDate(s, { month: "short" })
  const monthShortEnd = formatDate(e, { month: "short" })
  const startDay = formatDate(s, { day: "numeric" })
  const endDay = formatDate(e, { day: "numeric" })

  if (sameMonth) {
    const body = dayFirst
      ? `${startDay} – ${endDay} ${monthShortStart}`
      : `${monthShortStart} ${startDay} – ${endDay}`
    return `${body}, ${e.getFullYear()}`
  }
  if (sameYear) {
    const body = dayFirst
      ? `${startDay} ${monthShortStart} – ${endDay} ${monthShortEnd}`
      : `${monthShortStart} ${startDay} – ${monthShortEnd} ${endDay}`
    return `${body}, ${e.getFullYear()}`
  }
  return `${formatDate(s, { month: "short", day: "numeric", year: "numeric" })} – ${formatDate(e, { month: "short", day: "numeric", year: "numeric" })}`
}

/** Detect whether the locale renders the day before the month in a
 * short date format (e.g. ro-RO: "15 iun." vs en-US: "Jun 15"). */
function isLocaleDayFirst(locale: string): boolean {
  const parts = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  }).formatToParts(new Date(2026, 0, 15))
  const dayIndex = parts.findIndex((p) => p.type === "day")
  const monthIndex = parts.findIndex((p) => p.type === "month")
  if (dayIndex === -1 || monthIndex === -1) return false
  return dayIndex < monthIndex
}

function formatLead(booking: BookingRecord): string {
  const name = [booking.contactFirstName, booking.contactLastName].filter(Boolean).join(" ").trim()
  if (name) return name
  return booking.contactEmail ?? "—"
}
