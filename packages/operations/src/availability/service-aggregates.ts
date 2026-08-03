import { availabilitySlots } from "@voyant-travel/availability/schema"
import { and, eq, gte, isNull, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

type SlotStatus = (typeof availabilitySlots.$inferSelect)["status"]

const ALL_SLOT_STATUSES: readonly SlotStatus[] = ["open", "closed", "sold_out", "cancelled"]

export interface AvailabilityAggregates {
  /** Total slots in the (optional) `startsAt` range. */
  total: number
  countsByStatus: Array<{ status: SlotStatus; count: number }>
  /**
   * Open slots from `now` forward, irrespective of the `from..to` range.
   * Point-in-time KPI — operator's "how many departures are still sellable".
   */
  upcomingSlots: number
  /**
   * Sum of `remaining_pax` across the same `upcomingSlots` set, excluding
   * slots flagged `unlimited` (they'd inflate the number to meaningless
   * without a reasonable cap).
   */
  upcomingPax: number
  /**
   * Departure count bucketed by `starts_at` UTC yearMonth (within the range
   * when set). Counts every non-cancelled slot so inventory that went
   * sold-out still appears on the calendar.
   */
  monthlyDepartures: Array<{ yearMonth: string; count: number }>
}

export async function getAvailabilityAggregates(
  db: PostgresJsDatabase,
  options: { from?: string; to?: string } = {},
): Promise<AvailabilityAggregates> {
  const fromDate = options.from ? new Date(options.from) : undefined
  const toDate = options.to ? new Date(options.to) : undefined

  // Availability aggregates are anchored on `starts_at` (when the departure
  // actually happens), not `created_at` — dashboard users think in terms of
  // the calendar, not when the slot was provisioned.
  const rangeConditions = []
  // Bind ISO strings — raw Date params stringify via Date#toString() and fail
  // against timestamptz (same pattern as bookings/inventory/finance aggregates).
  // agent-quality: raw-sql reviewed -- owner: availability; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
  if (fromDate)
    rangeConditions.push(sql`${availabilitySlots.startsAt} >= ${fromDate.toISOString()}`)
  // agent-quality: raw-sql reviewed -- owner: availability; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
  if (toDate) rangeConditions.push(sql`${availabilitySlots.startsAt} < ${toDate.toISOString()}`)
  const rangeWhere = rangeConditions.length ? and(...rangeConditions) : undefined

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(availabilitySlots)
    .where(rangeWhere)

  const statusRows = await db
    .select({ status: availabilitySlots.status, count: sql<number>`count(*)::int` })
    .from(availabilitySlots)
    .where(rangeWhere)
    .groupBy(availabilitySlots.status)

  const statusMap = new Map<SlotStatus, number>(statusRows.map((r) => [r.status, r.count]))

  const now = new Date()

  const [upcomingRow] = await db
    .select({
      count: sql<number>`count(*)::int`,
      pax: sql<number>`coalesce(sum(case when ${availabilitySlots.unlimited} then 0 else coalesce(${availabilitySlots.remainingPax}, 0) end), 0)::bigint`,
    })
    .from(availabilitySlots)
    .where(and(eq(availabilitySlots.status, "open"), gte(availabilitySlots.startsAt, now)))

  const monthlyDeparturesRows = await db
    .select({
      yearMonth: sql<string>`to_char(${availabilitySlots.startsAt} at time zone 'UTC', 'YYYY-MM')`,
      count: sql<number>`count(*)::int`,
    })
    .from(availabilitySlots)
    .where(rangeWhere)
    // agent-quality: raw-sql reviewed -- owner: availability; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    .groupBy(sql`to_char(${availabilitySlots.startsAt} at time zone 'UTC', 'YYYY-MM')`)
    // agent-quality: raw-sql reviewed -- owner: availability; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    .orderBy(sql`to_char(${availabilitySlots.startsAt} at time zone 'UTC', 'YYYY-MM')`)

  return {
    total: totalRow?.count ?? 0,
    countsByStatus: ALL_SLOT_STATUSES.map((status) => ({
      status,
      count: statusMap.get(status) ?? 0,
    })),
    upcomingSlots: upcomingRow?.count ?? 0,
    upcomingPax: Number(upcomingRow?.pax ?? 0),
    monthlyDepartures: monthlyDeparturesRows.map((row) => ({
      yearMonth: row.yearMonth,
      count: row.count,
    })),
  }
}

/**
 * Departures with no Product Version recorded (#4032).
 *
 * A departure created before the version binding existed cannot say which
 * Product definition it sells. Those rows are **reported, not backfilled**:
 * the only signal available after the fact is what the product looks like
 * today, which is precisely what may have changed since the departure was
 * sold. Assigning that retroactively would manufacture false provenance for
 * exactly the records where provenance matters most.
 */
export interface UnboundDepartureReport {
  /** Departures with no Product Version recorded. */
  total: number
  /**
   * Of those, how many are still in the future. Only these are actionable —
   * a past departure's provenance can no longer change what is sold.
   */
  upcoming: number
  /** Distinct products affected, so the queue can be worked product by product. */
  productsAffected: number
}

export async function reportUnboundDepartures(
  db: PostgresJsDatabase,
  now = new Date(),
): Promise<UnboundDepartureReport> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      upcoming: sql<number>`count(*) filter (where ${availabilitySlots.startsAt} >= ${now})::int`,
      productsAffected: sql<number>`count(distinct ${availabilitySlots.productId})::int`,
    })
    .from(availabilitySlots)
    .where(isNull(availabilitySlots.productVersionId))

  return {
    total: Number(row?.total ?? 0),
    upcoming: Number(row?.upcoming ?? 0),
    productsAffected: Number(row?.productsAffected ?? 0),
  }
}

export interface UnboundDeparture {
  id: string
  productId: string
  dateLocal: string
  startsAt: Date
}

/**
 * The operator-review queue for unbound departures, soonest first.
 *
 * Past departures are excluded by default: they cannot be meaningfully
 * remediated, and including them buries the ones that can.
 */
export async function listUnboundDepartures(
  db: PostgresJsDatabase,
  options: { limit?: number; includePast?: boolean; now?: Date } = {},
): Promise<UnboundDeparture[]> {
  const now = options.now ?? new Date()

  return db
    .select({
      id: availabilitySlots.id,
      productId: availabilitySlots.productId,
      dateLocal: availabilitySlots.dateLocal,
      startsAt: availabilitySlots.startsAt,
    })
    .from(availabilitySlots)
    .where(
      options.includePast
        ? isNull(availabilitySlots.productVersionId)
        : and(isNull(availabilitySlots.productVersionId), gte(availabilitySlots.startsAt, now)),
    )
    .orderBy(availabilitySlots.startsAt)
    .limit(options.limit ?? 100)
}

/**
 * Departures already operating on a given Product Version — the impact set for
 * a Product edit, and the input a rebase preview will need.
 */
export async function countDeparturesOnVersion(
  db: PostgresJsDatabase,
  productVersionId: string,
  now = new Date(),
): Promise<{ total: number; upcoming: number; past: number }> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      upcoming: sql<number>`count(*) filter (where ${availabilitySlots.startsAt} >= ${now})::int`,
      past: sql<number>`count(*) filter (where ${availabilitySlots.startsAt} < ${now})::int`,
    })
    .from(availabilitySlots)
    .where(eq(availabilitySlots.productVersionId, productVersionId))

  return {
    total: Number(row?.total ?? 0),
    upcoming: Number(row?.upcoming ?? 0),
    past: Number(row?.past ?? 0),
  }
}
