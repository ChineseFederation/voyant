"use client"

import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import { Input } from "@voyant-travel/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components/select"
import { cn } from "@voyant-travel/ui/lib/utils"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, X } from "lucide-react"
import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react"

import type { CatalogUiMessages } from "../i18n/messages.js"
import { useCatalogUiI18nOrDefault } from "../i18n/provider.js"
import type {
  CatalogDeparturePricingRow,
  CatalogDetailEnrichment,
  CatalogSearchHit,
} from "../index.js"
import { formatPriceCents } from "./catalog-detail-parts.js"

type DepartureEntry = NonNullable<CatalogDetailEnrichment["departures"]>[number]
type DepartureOption = NonNullable<CatalogDetailEnrichment["options"]>[number]

type SortColumn = "date" | "status" | "availability" | "priceFrom"
type SortDirection = "asc" | "desc"

interface MonthOption {
  value: string // "YYYY-MM"
  label: string
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function collectMonthOptions(
  departures: ReadonlyArray<DepartureEntry>,
  locale: string,
): MonthOption[] {
  const formatter = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" })
  const map = new Map<string, MonthOption>()
  for (const d of departures) {
    const date = new Date(d.startsAt)
    if (Number.isNaN(date.getTime())) continue
    const key = monthKey(date)
    if (!map.has(key)) map.set(key, { value: key, label: formatter.format(date) })
  }
  // i18n-literal-ok: numeric sort comparator return value
  return Array.from(map.values()).sort((a, b) => (a.value < b.value ? -1 : 1))
}

function normaliseStatus(d: DepartureEntry): string {
  if (d.status) return d.status
  return "open"
}

function collectStatusOptions(departures: ReadonlyArray<DepartureEntry>): string[] {
  const set = new Set<string>()
  for (const d of departures) set.add(normaliseStatus(d))
  return Array.from(set).sort()
}

function isDepartureBookable(d: DepartureEntry): boolean {
  if (d.status === "sold_out" || d.status === "closed" || d.status === "cancelled") return false
  if (typeof d.remaining === "number" && d.remaining <= 0) return false
  return new Date(d.startsAt).getTime() > Date.now()
}

const ALL_FILTER_VALUE = "__all__"

/**
 * Flat departures table with sortable columns and filter controls
 * (month/year, status, min-availability). Sold-out / closed / past
 * rows render dimmed and are not clickable. Bookable rows expand to
 * reveal a per-option row with its own remaining capacity and Book
 * button.
 */
export function DeparturesTable({
  hit,
  vertical,
  departures,
  options,
  productSellAmountCents,
  productSellCurrency,
  onBookDeparture,
  onBookOption,
  onLoadDeparturePricing,
  messages,
}: {
  hit: CatalogSearchHit | null
  vertical?: string
  departures: ReadonlyArray<DepartureEntry>
  options: NonNullable<CatalogDetailEnrichment["options"]>
  productSellAmountCents: number | null
  productSellCurrency: string | null
  onBookDeparture?: (hit: CatalogSearchHit, departure: DepartureEntry) => void
  onBookOption?: (hit: CatalogSearchHit, departure: DepartureEntry, option: DepartureOption) => void
  onLoadDeparturePricing?: (
    hit: CatalogSearchHit,
    sailingRef: string,
  ) => Promise<CatalogDeparturePricingRow[] | null>
  messages: CatalogUiMessages["catalogPage"]["detail"]
}) {
  const { locale } = useCatalogUiI18nOrDefault()
  const tableMessages = messages.departuresTable
  // Cruises call a scheduled departure a "sailing" — pick the cruise wording.
  const isCruise = vertical === "cruises"
  const noUpcomingLabel = isCruise ? messages.noUpcomingSailings : messages.noUpcomingDepartures
  const noResultsLabel = isCruise ? tableMessages.noResultsSailings : tableMessages.noResults
  const monthOptions = useMemo(() => collectMonthOptions(departures, locale), [departures, locale])
  const statusOptions = useMemo(() => collectStatusOptions(departures), [departures])

  const [monthFilter, setMonthFilter] = useState<string>(ALL_FILTER_VALUE)
  const [statusFilter, setStatusFilter] = useState<string>(ALL_FILTER_VALUE)
  const [minAvailability, setMinAvailability] = useState<string>("")
  const [sort, setSort] = useState<{ column: SortColumn; direction: SortDirection }>({
    column: "date",
    direction: "asc",
  })
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    [locale],
  )

  const filtersActive =
    monthFilter !== ALL_FILTER_VALUE || statusFilter !== ALL_FILTER_VALUE || minAvailability !== ""

  const filtered = useMemo(() => {
    const minAvail = minAvailability ? Number(minAvailability) : null
    return departures.filter((d) => {
      const date = new Date(d.startsAt)
      if (monthFilter !== ALL_FILTER_VALUE) {
        if (Number.isNaN(date.getTime())) return false
        if (monthKey(date) !== monthFilter) return false
      }
      if (statusFilter !== ALL_FILTER_VALUE && normaliseStatus(d) !== statusFilter) {
        return false
      }
      if (minAvail != null && Number.isFinite(minAvail)) {
        const remaining = typeof d.remaining === "number" ? d.remaining : null
        if (remaining == null) return false
        if (remaining < minAvail) return false
      }
      return true
    })
  }, [departures, monthFilter, statusFilter, minAvailability])

  const sorted = useMemo(() => {
    const list = [...filtered]
    const dir = sort.direction === "asc" ? 1 : -1
    list.sort((a, b) => {
      switch (sort.column) {
        case "date":
          return (new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()) * dir
        case "status":
          return normaliseStatus(a).localeCompare(normaliseStatus(b)) * dir
        case "availability": {
          const av = typeof a.remaining === "number" ? a.remaining : -1
          const bv = typeof b.remaining === "number" ? b.remaining : -1
          return (av - bv) * dir
        }
        case "priceFrom": {
          const av = a.lowestPriceCents ?? productSellAmountCents ?? -1
          const bv = b.lowestPriceCents ?? productSellAmountCents ?? -1
          return (av - bv) * dir
        }
        default:
          return 0
      }
    })
    return list
  }, [filtered, sort, productSellAmountCents])

  const toggleSort = (column: SortColumn) => {
    setSort((current) =>
      current.column === column
        ? { column, direction: current.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "asc" },
    )
  }

  const clearFilters = () => {
    setMonthFilter(ALL_FILTER_VALUE)
    setStatusFilter(ALL_FILTER_VALUE)
    setMinAvailability("")
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Select value={monthFilter} onValueChange={(v) => setMonthFilter(v ?? ALL_FILTER_VALUE)}>
            <SelectTrigger className="h-9 w-[180px] text-sm">
              <SelectValue placeholder={tableMessages.anyMonth} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>{tableMessages.anyMonth}</SelectItem>
              {monthOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v ?? ALL_FILTER_VALUE)}
          >
            <SelectTrigger className="h-9 w-[160px] text-sm">
              <SelectValue placeholder={tableMessages.anyStatus} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>{tableMessages.anyStatus}</SelectItem>
              {statusOptions.map((status) => (
                <SelectItem key={status} value={status}>
                  {statusLabelFor(status, tableMessages)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Input
            type="number"
            min={0}
            value={minAvailability}
            onChange={(event) => setMinAvailability(event.target.value)}
            placeholder={tableMessages.minAvailability}
            className="h-9 w-[140px] text-sm"
          />
        </div>
        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto">
            <X className="mr-1 h-3.5 w-3.5" />
            {tableMessages.clearFilters}
          </Button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-md border bg-muted/10 px-3 py-6 text-center text-sm text-muted-foreground">
          {filtersActive ? noResultsLabel : noUpcomingLabel}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <tr>
                <SortableHeader
                  className="text-left"
                  column="date"
                  sort={sort}
                  onToggle={toggleSort}
                >
                  {tableMessages.date}
                </SortableHeader>
                <SortableHeader
                  className="text-left"
                  column="status"
                  sort={sort}
                  onToggle={toggleSort}
                >
                  {tableMessages.status}
                </SortableHeader>
                <SortableHeader
                  className="text-right"
                  column="availability"
                  sort={sort}
                  onToggle={toggleSort}
                >
                  {tableMessages.availability}
                </SortableHeader>
                <SortableHeader
                  className="text-right"
                  column="priceFrom"
                  sort={sort}
                  onToggle={toggleSort}
                >
                  {tableMessages.priceFrom}
                </SortableHeader>
                <th className="w-[36px] px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((d) => {
                const bookable = isDepartureBookable(d)
                const isExpanded = expandedId === d.id
                const date = new Date(d.startsAt)
                const statusKey = normaliseStatus(d)
                const remaining = typeof d.remaining === "number" ? d.remaining : null
                const priceCents = d.lowestPriceCents ?? productSellAmountCents
                const priceCurrency = d.currency ?? productSellCurrency ?? undefined
                return (
                  <Fragment key={d.id}>
                    <tr
                      className={cn(
                        "border-b last:border-b-0 transition-colors",
                        bookable ? "cursor-pointer hover:bg-muted/40" : "cursor-default opacity-50",
                      )}
                      onClick={() => {
                        if (!bookable) return
                        setExpandedId((current) => (current === d.id ? null : d.id))
                      }}
                    >
                      <td className="px-3 py-2 font-medium">{dateTimeFormatter.format(date)}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={bookable ? "outline" : "secondary"}
                          className="w-fit font-normal capitalize"
                        >
                          {statusLabelFor(statusKey, tableMessages)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {remaining != null ? remaining : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {priceCents != null
                          ? formatPriceCents(priceCents, priceCurrency, locale)
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {bookable ? (
                          isExpanded ? (
                            <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                          )
                        ) : null}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b last:border-b-0 bg-muted/20">
                        <td colSpan={5} className="px-3 py-3">
                          <DepartureDetailPanel
                            hit={hit}
                            departure={d}
                            options={options}
                            productSellAmountCents={productSellAmountCents}
                            productSellCurrency={productSellCurrency}
                            onBookDeparture={onBookDeparture}
                            onBookOption={onBookOption}
                            onLoadDeparturePricing={onLoadDeparturePricing}
                            messages={messages}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SortableHeader({
  column,
  sort,
  onToggle,
  children,
  className,
}: {
  column: SortColumn
  sort: { column: SortColumn; direction: SortDirection }
  onToggle: (column: SortColumn) => void
  children: ReactNode
  className?: string
}) {
  const active = sort.column === column
  const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown
  return (
    <th className={cn("px-3 py-2", className)}>
      <button
        type="button"
        onClick={() => onToggle(column)}
        className={cn(
          "inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          // i18n-literal-ok: tailwind utilities, not user copy
          className?.includes("text-right") ? "ml-auto flex-row-reverse" : null,
        )}
      >
        <Icon className="h-3 w-3" />
        {children}
      </button>
    </th>
  )
}

function statusLabelFor(
  status: string,
  tableMessages: CatalogUiMessages["catalogPage"]["detail"]["departuresTable"],
): string {
  switch (status) {
    case "sold_out":
      return tableMessages.soldOut
    case "closed":
      return tableMessages.closed
    case "cancelled":
      return tableMessages.cancelled
    case "open":
      return tableMessages.open
    default:
      return status.replace(/_/g, " ")
  }
}

/**
 * Per-departure expansion panel. Lists the bookable options with their
 * own remaining capacity, "from" price, and Book button. Today the
 * seeded availability_slots track capacity at the product level (not
 * per option), so per-option remaining mirrors the departure total —
 * once `availability_slots.option_id` is populated, the per-option
 * number will diverge automatically.
 */
function DepartureDetailPanel({
  hit,
  departure,
  options,
  productSellAmountCents,
  productSellCurrency,
  onBookDeparture,
  onBookOption,
  onLoadDeparturePricing,
  messages,
}: {
  hit: CatalogSearchHit | null
  departure: DepartureEntry
  options: NonNullable<CatalogDetailEnrichment["options"]>
  productSellAmountCents: number | null
  productSellCurrency: string | null
  onBookDeparture?: (hit: CatalogSearchHit, departure: DepartureEntry) => void
  onBookOption?: (hit: CatalogSearchHit, departure: DepartureEntry, option: DepartureOption) => void
  onLoadDeparturePricing?: (
    hit: CatalogSearchHit,
    sailingRef: string,
  ) => Promise<CatalogDeparturePricingRow[] | null>
  messages: CatalogUiMessages["catalogPage"]["detail"]
}) {
  const { locale } = useCatalogUiI18nOrDefault()
  const tableMessages = messages.departuresTable
  const currency = departure.currency ?? productSellCurrency ?? undefined
  const departurePriceCents = departure.lowestPriceCents ?? productSellAmountCents
  const departureRemaining = typeof departure.remaining === "number" ? departure.remaining : null

  // Live per-cabin pricing (cruises). This panel only mounts when its departure
  // row is expanded, so fetch lazily here — pricing is volatile-live, never
  // baked into the cached content.
  const [livePricing, setLivePricing] = useState<CatalogDeparturePricingRow[] | null>(null)
  const sailingRef = departure.sourceRef ?? null
  useEffect(() => {
    if (!hit || !onLoadDeparturePricing || !sailingRef) return
    let cancelled = false
    onLoadDeparturePricing(hit, sailingRef).then(
      (rows) => {
        if (!cancelled) setLivePricing(rows)
      },
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [hit, onLoadDeparturePricing, sailingRef])

  // Index the cheapest live price per cabin code. The upstream cabin ref is
  // `<shipId>_<code>`, so the code is the trailing segment — matched against the
  // option's `code`.
  const livePriceByCode = useMemo(() => {
    const byCode = new Map<string, { cents: number; currency: string; availability: string }>()
    for (const row of livePricing ?? []) {
      const code = row.cabinExternalId.slice(row.cabinExternalId.lastIndexOf("_") + 1)
      const cents = Math.round(Number(row.pricePerPerson) * 100)
      if (!Number.isFinite(cents)) continue
      const existing = byCode.get(code)
      if (!existing || cents < existing.cents) {
        byCode.set(code, { cents, currency: row.currency, availability: row.availability })
      }
    }
    return byCode
  }, [livePricing])

  const handleBook = (option: DepartureOption) => {
    if (!hit) return
    if (onBookOption) {
      onBookOption(hit, departure, option)
    } else if (onBookDeparture) {
      onBookDeparture(hit, departure)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {tableMessages.optionsHeading}
      </div>
      {options.length === 0 ? (
        <div className="text-xs text-muted-foreground">{tableMessages.noOptions}</div>
      ) : (
        <ul className="divide-y rounded-md border bg-background">
          {options.map((option) => {
            const canBook =
              isDepartureBookable(departure) &&
              hit != null &&
              (onBookOption != null || onBookDeparture != null)
            const livePrice = option.code ? livePriceByCode.get(option.code) : undefined
            return (
              <li
                key={option.id}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">{option.name}</span>
                  {option.description && (
                    <span className="text-xs text-muted-foreground">{option.description}</span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  {livePrice ? (
                    <>
                      <span className="text-right text-xs capitalize text-muted-foreground">
                        {livePrice.availability.replace(/_/g, " ")}
                      </span>
                      <div className="text-right text-xs text-muted-foreground">
                        {tableMessages.priceFrom}{" "}
                        <span className="font-medium text-foreground tabular-nums">
                          {formatPriceCents(livePrice.cents, livePrice.currency, locale)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-right text-xs text-muted-foreground">
                        {departureRemaining != null ? (
                          <span className="tabular-nums">
                            <span className="font-medium text-foreground">
                              {departureRemaining}
                            </span>{" "}
                            {tableMessages.remainingLabel}
                          </span>
                        ) : (
                          "—"
                        )}
                      </div>
                      {departurePriceCents != null && (
                        <div className="text-right text-xs text-muted-foreground">
                          {tableMessages.priceFrom}{" "}
                          <span className="font-medium text-foreground tabular-nums">
                            {formatPriceCents(departurePriceCents, currency, locale)}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  {canBook && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleBook(option)
                      }}
                    >
                      {messages.book}
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
