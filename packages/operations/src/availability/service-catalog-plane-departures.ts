/**
 * Projection extension that aggregates `availability_slots` rows into the
 * departure-facet fields declared by `productDeparturesCatalogPolicy`
 * (in `@voyant-travel/inventory/catalog-policy-departures`).
 *
 * Lives in `@voyant-travel/operations` because:
 *   - The data lives here.
 *   - `availability` already depends on `products` for the `productsRef`
 *     schema; importing the `ProductProjectionExtension` contract type
 *     from products is the same direction. The reverse (products
 *     querying availability_slots) would introduce a circular dep.
 *
 * Wire via `createProductDocumentBuilder({ extensions: [departuresExtension] })`
 * after composing `productDeparturesCatalogPolicy` into the registry.
 *
 * Filtering decisions:
 *   - Only `status = 'open'` slots count. Sold-out / closed / cancelled
 *     are excluded — storefront filters never surface unavailable
 *     departures, and a "show sold-out" UX is a query-time concern.
 *   - Only future departures (`startsAt > now()`).
 *   - Capped at 24 months forward — operators rarely publish further
 *     out, and unbounded windows would let a single misconfigured slot
 *     30 years in the future blow up the document.
 *
 * Document-size discipline:
 *   - `departureDates[]` capped at the next 180 days of distinct local
 *     dates. Daily-slot products with a year of inventory would
 *     otherwise emit ~365 strings per slice; 180 covers the use case
 *     (storefront date-picker + "this weekend / next month" filters).
 *   - `departureMonths[]` is naturally bounded by the 24-month window.
 *
 * `bookingMode` gating: products with `bookingMode = 'open'` (anytime /
 * no fixed slots — e.g. private city tours) emit empty arrays / nulls.
 * Without this gate the projection would issue a slot scan that always
 * returns zero rows for these products. Cheaper to short-circuit on the
 * already-fetched product row.
 *
 * Time frames, stated (#4116): the document carries fields in two frames
 * and names which is which rather than leaving a consumer to guess.
 *   - Instants, suffixed `At`: `nextDepartureAt`, `nextDepartureEndsAt`.
 *   - Local calendar dates in the departure's own zone, suffixed `Date`
 *     (plus the `departureDates[]` / `departureMonths[]` facets):
 *     `nextDepartureDate`, `nextDepartureEndDate`.
 *   - `departureTimezone` is the IANA zone those local fields are in, so
 *     a consumer can render either frame correctly without out-of-band
 *     knowledge. It is the *next* departure's zone; a product whose slots
 *     span zones gets the zone of the departure the card is about.
 *
 * The end of the next departure (`nextDepartureEndsAt` /
 * `nextDepartureEndDate`) is projected because the last `departureDates[]`
 * entry is a departure *start* — a multi-day departure's end could
 * otherwise only be guessed at from `durationDays`.
 */

import type { IndexerSlice } from "@voyant-travel/catalog"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { and, asc, eq, gt, lt } from "drizzle-orm"
import { availabilitySlots } from "./schema.js"

import { instantToSlotLocal } from "./slot-timezone.js"

export interface ProductProjectionExtension {
  readonly name: string
  project(
    db: AnyDrizzleDb,
    productId: string,
    slice: IndexerSlice,
  ): Promise<ReadonlyMap<string, unknown>>
}

// Window the aggregation looks at. Tunable via the factory; defaults
// chosen so a daily-slot product produces ~180 dates / ~24 months.
export interface DepartureProjectionOptions {
  /**
   * How many days of distinct calendar dates land in `departureDates[]`.
   * Defaults to 180 (≈ 6 months).
   */
  datesWindowDays?: number
  /**
   * How many months of distinct `YYYY-MM` tokens land in `departureMonths[]`.
   * Defaults to 24.
   */
  monthsWindowCount?: number
  /**
   * Override `now()` for testing. Defaults to wall-clock time at projection.
   */
  now?: () => Date
  /**
   * Resolve the product's `bookingMode` so anytime products short-circuit
   * to an empty projection. Starters inject this — keeping the loader
   * pluggable lets tests stub a product with a specific mode without
   * needing the full products schema in the test DB.
   *
   * Returns `null` when the product doesn't exist (the upstream
   * builder will see `null` from its own row fetch first, but defensive
   * here keeps the projection failure-isolated).
   */
  loadBookingMode?: (db: AnyDrizzleDb, productId: string) => Promise<string | null>
}

/** Modes for which we project departures. Other modes (e.g. `"open"` for
 *  anytime products) short-circuit to empty. */
const SCHEDULED_BOOKING_MODES = new Set(["date", "date_time", "stay", "itinerary"])

interface SlotAggregateRow {
  startsAt: Date
  endsAt: Date | null
  dateLocal: string // YYYY-MM-DD in slot's local timezone
  timezone: string // IANA zone `dateLocal` is expressed in
  remainingPax: number | null
  unlimited: boolean
}

interface DepartureAggregate {
  nextDepartureAt: string | null // ISO 8601 instant
  nextDepartureDate: string | null // YYYY-MM-DD (slot's local)
  nextDepartureEndsAt: string | null // ISO 8601 instant
  nextDepartureEndDate: string | null // YYYY-MM-DD (slot's local)
  departureTimezone: string | null // IANA zone of the local fields
  hasUpcomingDeparture: boolean
  upcomingDepartureCount: number
  departureDates: string[]
  departureMonths: string[]
  availableUnitsTotal: number | null
}

const EMPTY_AGGREGATE: DepartureAggregate = {
  nextDepartureAt: null,
  nextDepartureDate: null,
  nextDepartureEndsAt: null,
  nextDepartureEndDate: null,
  departureTimezone: null,
  hasUpcomingDeparture: false,
  upcomingDepartureCount: 0,
  departureDates: [],
  departureMonths: [],
  availableUnitsTotal: 0,
}

/**
 * Pure aggregation kernel — given a list of upcoming open slots, produce
 * the projection fields. Exposed via `__test__` for unit coverage that
 * doesn't need a real DB.
 */
function aggregateDepartures(
  slots: ReadonlyArray<SlotAggregateRow>,
  now: Date,
  datesWindowDays: number,
  monthsWindowCount: number,
): DepartureAggregate {
  if (slots.length === 0) return { ...EMPTY_AGGREGATE }

  // Slots arrive ordered by startsAt asc from the SQL query; the first
  // row is the earliest. Re-establish ordering defensively in case a
  // future caller passes them unordered — the cost is one O(n log n)
  // sort, the benefit is the helper stays pure.
  const ordered = [...slots].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
  const earliest = ordered[0]
  if (!earliest) return { ...EMPTY_AGGREGATE }

  const dateCutoff = new Date(now.getTime() + datesWindowDays * 24 * 60 * 60 * 1000)
  const monthCutoff = addMonths(now, monthsWindowCount)

  const dateSet = new Set<string>()
  const monthSet = new Set<string>()
  let anyUnlimited = false
  let paxSum = 0

  for (const slot of ordered) {
    if (slot.startsAt < monthCutoff) {
      // Month is the first 7 chars of YYYY-MM-DD (already in local TZ).
      monthSet.add(slot.dateLocal.slice(0, 7))
    }
    if (slot.startsAt < dateCutoff) {
      dateSet.add(slot.dateLocal)
    }
    if (slot.unlimited) {
      anyUnlimited = true
    } else if (slot.remainingPax !== null) {
      paxSum += slot.remainingPax
    }
  }

  // Sort outputs deterministically — Set insertion order would otherwise
  // depend on slot-row ordering and make doc snapshots brittle.
  const departureDates = Array.from(dateSet).sort()
  const departureMonths = Array.from(monthSet).sort()

  return {
    nextDepartureAt: earliest.startsAt.toISOString(),
    nextDepartureDate: earliest.dateLocal,
    nextDepartureEndsAt: earliest.endsAt?.toISOString() ?? null,
    nextDepartureEndDate: localDateOf(earliest.endsAt, earliest.timezone),
    departureTimezone: earliest.timezone,
    hasUpcomingDeparture: true,
    upcomingDepartureCount: ordered.length,
    departureDates,
    departureMonths,
    // `null` when any counted slot is unlimited — emitting a partial sum
    // would mislead the storefront ("3 seats left" when one slot is
    // actually unlimited).
    availableUnitsTotal: anyUnlimited ? null : paxSum,
  }
}

/**
 * Local calendar date of an instant in the slot's own zone, matching how
 * `date_local` was derived from `starts_at` at materialization time.
 *
 * Returns `null` rather than throwing on a zone Intl rejects: a single
 * unparseable row must not fail the whole product's projection, and a
 * missing end date degrades a card to "start only" instead of removing
 * the product from the index.
 */
function localDateOf(instant: Date | null, timezone: string): string | null {
  if (!instant) return null
  try {
    return instantToSlotLocal(instant, timezone).date
  } catch {
    return null
  }
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d)
  out.setMonth(out.getMonth() + months)
  return out
}

/**
 * Construct the departures projection extension.
 *
 * Pass `loadBookingMode` so anytime products short-circuit; in production
 * that reads the products table, in tests it can return a fixed mode.
 */
export function createProductDeparturesProjectionExtension(
  options: DepartureProjectionOptions = {},
): ProductProjectionExtension {
  const datesWindowDays = options.datesWindowDays ?? 180
  const monthsWindowCount = options.monthsWindowCount ?? 24
  const nowFn = options.now ?? (() => new Date())
  const loadBookingMode = options.loadBookingMode ?? defaultLoadBookingMode

  return {
    name: "products:departures",
    async project(db, productId, _slice: IndexerSlice) {
      const bookingMode = await loadBookingMode(db, productId)
      if (bookingMode !== null && !SCHEDULED_BOOKING_MODES.has(bookingMode)) {
        return emptyProjection()
      }

      const now = nowFn()
      const monthCutoff = addMonths(now, monthsWindowCount)

      // Single SQL pass: open future slots within the 24-month window.
      // The `(productId, startsAt)` index makes this a range scan.
      const rows = await db
        .select({
          startsAt: availabilitySlots.startsAt,
          endsAt: availabilitySlots.endsAt,
          dateLocal: availabilitySlots.dateLocal,
          timezone: availabilitySlots.timezone,
          remainingPax: availabilitySlots.remainingPax,
          unlimited: availabilitySlots.unlimited,
        })
        .from(availabilitySlots)
        .where(
          and(
            eq(availabilitySlots.productId, productId),
            eq(availabilitySlots.status, "open"),
            gt(availabilitySlots.startsAt, now),
            lt(availabilitySlots.startsAt, monthCutoff),
          ),
        )
        .orderBy(asc(availabilitySlots.startsAt))

      const aggregate = aggregateDepartures(rows, now, datesWindowDays, monthsWindowCount)
      return toProjectionMap(aggregate)
    },
  }
}

function emptyProjection(): ReadonlyMap<string, unknown> {
  return toProjectionMap({ ...EMPTY_AGGREGATE })
}

function toProjectionMap(a: DepartureAggregate): ReadonlyMap<string, unknown> {
  return new Map<string, unknown>([
    ["nextDepartureAt", a.nextDepartureAt],
    ["nextDepartureDate", a.nextDepartureDate],
    ["nextDepartureEndsAt", a.nextDepartureEndsAt],
    ["nextDepartureEndDate", a.nextDepartureEndDate],
    ["departureTimezone", a.departureTimezone],
    ["hasUpcomingDeparture", a.hasUpcomingDeparture],
    ["upcomingDepartureCount", a.upcomingDepartureCount],
    ["departureDates[]", a.departureDates],
    ["departureMonths[]", a.departureMonths],
    ["availableUnitsTotal", a.availableUnitsTotal],
  ])
}

/**
 * Default `loadBookingMode` reads from the products table via raw SQL so
 * we don't pull the products schema into this file (would create a
 * heavier coupling with the products package). The column shape is
 * stable enough — `bookingMode` has been on the products table since
 * v0.1 and a schema rename would break far more than this.
 */
async function defaultLoadBookingMode(db: AnyDrizzleDb, productId: string): Promise<string | null> {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle's typed sql is overkill for a single-column read -- owner: availability; existing suppression is intentional pending typed cleanup.
  const dbAny = db as any
  const { sql } = await import("drizzle-orm")
  const result = await dbAny.execute(
    // agent-quality: raw-sql reviewed -- owner: availability; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    sql`SELECT booking_mode FROM products WHERE id = ${productId} LIMIT 1`,
  )
  // postgres-js returns rows as an array-like with `.[0]?.booking_mode`;
  // node-postgres returns `{ rows: [...] }`. Handle both.
  const rows = Array.isArray(result) ? result : (result?.rows ?? [])
  const first = rows[0] as { booking_mode?: string } | undefined
  return first?.booking_mode ?? null
}

// Internal exports for unit tests — kept off the public surface.
export const __test__ = {
  aggregateDepartures,
  EMPTY_AGGREGATE,
  SCHEDULED_BOOKING_MODES,
}
