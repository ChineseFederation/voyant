"use client"

import type {
  CabinClass,
  FareCalendarDay,
  PassengerCounts,
} from "@voyant-travel/flights/contract/types"
import { DatePicker } from "@voyant-travel/ui/components/date-picker"
import type { ReactNode } from "react"
import { useMemo, useState } from "react"
import { useFareCalendar } from "../hooks/use-fare-calendar.js"
import { useFlightsUiI18nOrDefault } from "../i18n/index.js"

export interface FlightDatePickerProps {
  /** Selected ISO date, or null. */
  value: string | null
  onChange: (next: string | null) => void
  /** Route being priced. The calendar stays dormant until both are set. */
  origin: string | null
  destination: string | null
  passengers: PassengerCounts
  cabin?: CabinClass
  /**
   * Earliest selectable date, ISO. Defaults to today; a return picker passes
   * the outbound date so a return can't precede its own outbound.
   */
  minDate?: string | null
  placeholder?: ReactNode
  disabled?: boolean
  className?: string
}

/**
 * Departure-date picker that shows where availability actually is.
 *
 * Each day carries the cheapest indicative price for the leg being picked,
 * banded cheap / mid / expensive against the rest of the visible window, and
 * days the provider doesn't fly are struck out and unselectable.
 *
 * The decoration is strictly an enhancement. A connector that doesn't declare
 * `flight/fare-calendar` — or a calendar still in flight — leaves a plain
 * working calendar behind, never an error or a blocked form.
 */
export function FlightDatePicker({
  value,
  onChange,
  origin,
  destination,
  passengers,
  cabin,
  minDate,
  placeholder,
  disabled,
  className,
}: FlightDatePickerProps) {
  const i18n = useFlightsUiI18nOrDefault()
  const [month, setMonth] = useState(() => startOfMonth(parseIsoDate(value) ?? new Date()))

  // Quote the visible month plus the next, so paging forward one month is
  // already answered and the common "look a few weeks out" move never waits.
  const earliest = latestOf(startOfDay(new Date()), parseIsoDate(minDate))
  const windowFrom = latestOf(month, earliest) ?? month
  const windowTo = endOfMonth(addMonths(month, 1))
  // Paging back past `earliest` inverts the window. There is nothing to quote
  // behind today, so stay quiet rather than ask for a range that can't exist.
  // A disabled picker never quotes either — the return leg of a one-way trip
  // would otherwise spend a supplier call on a date nobody can pick.
  const quotable = Boolean(origin && destination) && !disabled && windowFrom <= windowTo

  const calendar = useFareCalendar(
    {
      origin: origin ?? "",
      destination: destination ?? "",
      from: toIsoDate(windowFrom),
      to: toIsoDate(windowTo),
      passengers,
      cabin,
    },
    { enabled: quotable },
  )

  const days = calendar.data?.days
  const quotes = useMemo(() => indexByDate(days), [days])
  const bands = useMemo(() => priceBands(days), [days])

  const dayModifiers = useMemo(() => bandModifiers(days, bands), [days, bands])

  return (
    <DatePicker
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      // Annotated cells need more room than the 2rem default. Sized on intent
      // rather than on arrival of the data, so the grid doesn't jump under the
      // cursor when the quote lands.
      contentClassName={
        quotable && !calendar.isCapabilityMissing ? "[--cell-size:--spacing(12)]" : undefined
      }
      dateDisabled={(date) => {
        if (earliest && startOfDay(date) < earliest) return true
        // Only a quoted day may be ruled out. An unquoted day is unknown, and
        // unknown must stay selectable or a missing calendar becomes a
        // calendar that says "nothing is available".
        return quotes.get(toIsoDate(date))?.available === false
      }}
      dayAnnotation={(date) => {
        const quote = quotes.get(toIsoDate(date))
        if (!quote?.cheapestPrice) return null
        return formatFare(quote.cheapestPrice, i18n)
      }}
      modifiers={dayModifiers}
      modifiersClassNames={BAND_CLASS_NAMES}
      month={month}
      onMonthChange={setMonth}
    />
  )
}

/**
 * Band colours are applied to the annotation line only — the day number keeps
 * its normal contrast, so the price is what carries the signal and selection
 * state stays legible on top of it.
 */
const BAND_CLASS_NAMES = {
  fareCheap:
    "[&_[data-slot=day-annotation]]:text-emerald-600 [&_[data-slot=day-annotation]]:opacity-100 dark:[&_[data-slot=day-annotation]]:text-emerald-400",
  fareMid:
    "[&_[data-slot=day-annotation]]:text-amber-600 [&_[data-slot=day-annotation]]:opacity-100 dark:[&_[data-slot=day-annotation]]:text-amber-400",
  fareHigh:
    "[&_[data-slot=day-annotation]]:text-rose-600 [&_[data-slot=day-annotation]]:opacity-100 dark:[&_[data-slot=day-annotation]]:text-rose-400",
  fareUnavailable: "[&_button]:line-through",
}

type PriceBands = { cheapUpTo: number; midUpTo: number } | null

/**
 * Terciles over the quoted window. Bands are relative to what is on screen —
 * "cheap for this route in this window", which is the only comparison a
 * traveller can act on. Fewer than three distinct prices means there is no
 * meaningful spread to band, so nothing is coloured.
 */
function priceBands(days: FareCalendarDay[] | undefined): PriceBands {
  const amounts = (days ?? [])
    .map((day) => Number(day.cheapestPrice?.amount))
    .filter((amount) => Number.isFinite(amount))
    .sort((a, b) => a - b)

  if (new Set(amounts).size < 3) return null

  const cheapUpTo = amounts[Math.floor(amounts.length / 3)]
  const midUpTo = amounts[Math.floor((amounts.length * 2) / 3)]
  if (cheapUpTo == null || midUpTo == null) return null
  return { cheapUpTo, midUpTo }
}

function bandModifiers(days: FareCalendarDay[] | undefined, bands: PriceBands) {
  const fareCheap: Date[] = []
  const fareMid: Date[] = []
  const fareHigh: Date[] = []
  const fareUnavailable: Date[] = []

  for (const day of days ?? []) {
    const date = parseIsoDate(day.date)
    if (!date) continue
    if (!day.available) {
      fareUnavailable.push(date)
      continue
    }
    const amount = Number(day.cheapestPrice?.amount)
    if (!bands || !Number.isFinite(amount)) continue
    if (amount <= bands.cheapUpTo) fareCheap.push(date)
    else if (amount <= bands.midUpTo) fareMid.push(date)
    else fareHigh.push(date)
  }

  return { fareCheap, fareMid, fareHigh, fareUnavailable }
}

function indexByDate(days: FareCalendarDay[] | undefined): Map<string, FareCalendarDay> {
  return new Map((days ?? []).map((day) => [day.date, day]))
}

/**
 * Above this, an exact fare stops fitting in a calendar cell — a long-haul
 * business quote is five or six digits — so it switches to compact notation.
 * Below it the exact figure is both readable and more useful.
 */
const COMPACT_FARE_THRESHOLD = 1000

function formatFare(
  price: { amount: string; currency: string },
  i18n: ReturnType<typeof useFlightsUiI18nOrDefault>,
): string {
  const amount = Number(price.amount)
  if (!Number.isFinite(amount)) return `${price.amount} ${price.currency}`
  if (amount >= COMPACT_FARE_THRESHOLD) {
    return i18n.formatCurrency(amount, price.currency, {
      notation: "compact",
      maximumFractionDigits: 1,
    })
  }
  return i18n.formatCurrency(amount, price.currency, { maximumFractionDigits: 0 })
}

// ── Local-time date helpers ──────────────────────────────────────────────────
// react-day-picker works in local time. Parsing `2026-08-16` with `new Date()`
// would land on UTC midnight, which is the previous day west of Greenwich — so
// every price would sit one cell off for half the world. These stay local.

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [, year, month, day] = match
  return new Date(Number(year), Number(month) - 1, Number(day))
}

function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

function latestOf(...dates: Array<Date | null>): Date | null {
  return dates.reduce<Date | null>(
    (latest, date) => (date && (!latest || date > latest) ? date : latest),
    null,
  )
}
