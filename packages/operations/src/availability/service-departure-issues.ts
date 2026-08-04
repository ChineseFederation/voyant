/**
 * Departure attention issues — the typed vocabulary for "something about this
 * departure disagrees with itself".
 *
 * Modelled on `@voyant-travel/inventory`'s product readiness evaluator: the
 * rules are pure over facts a loader has already gathered, so they stay cheap
 * to unit-test and identical across every transport, and every issue carries a
 * **stable machine code** the UI translates. Never rename a code — the
 * operator UI, the Tool transport, and anything that stores an issue key off
 * these. Add a new code instead.
 *
 * Two severities:
 *
 *   - `critical` — the departure's capacity is wrong in a way that lets it
 *     oversell or physically overfill. Someone has to intervene before it
 *     runs.
 *   - `warning` — the departure will operate, but a reconciliation the
 *     operator owns is outstanding (names missing, seats unassigned, a stale
 *     hold nobody released).
 *
 * Deliberately no `href`. Navigation is the UI's, and the same issue is
 * rendered from three different places in the workspace.
 *
 * Detection only. Nothing here repairs anything — in particular, stale
 * `booking_allocations` are reported, never released; that is issue #4067's
 * territory.
 */

import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { activeBookingAllocationStatusesSql } from "./booking-statuses.js"
import { executeRows } from "./service-allocation-sql.js"
import {
  type DepartureCapacityCounters,
  getDepartureCapacityCounters,
} from "./service-departure-capacity.js"

export type DepartureIssueSeverity = "critical" | "warning"

/**
 * Stable departure issue codes. Never rename one; add a new code instead.
 */
export type DepartureIssueCode =
  /** `booking_allocations` still `held` whose `hold_expires_at` has passed. */
  | "stale_held_allocation"
  /** A live allocation on this slot whose booking is cancelled. */
  | "allocation_on_cancelled_booking"
  /** `availability_holds` past `expires_at` that were never released. */
  | "expired_hold_not_released"
  /** Fewer traveler records entered than `Σ bookings.pax`. */
  | "travelers_missing_for_booked_pax"
  /** More traveler records entered than `Σ bookings.pax`. */
  | "travelers_exceed_booked_pax"
  /** Stored `remaining_pax` disagrees with derived consumption. */
  | "remaining_pax_drift"
  /** Derived consumption exceeds the authored capacity. */
  | "capacity_oversold"
  /** A resource holds more travelers than its capacity. */
  | "resource_over_capacity"
  /** Travelers with no resource assignment on a departure that has resources. */
  | "travelers_unassigned"
  /** Travelers to seat, but no `allocation_resources` laid out. */
  | "allocation_resources_missing"
  /** The slot was never bound to an immutable Product Version. */
  | "departure_not_version_bound"

export type DepartureIssueSubjectType =
  | "departure"
  | "booking"
  | "booking_allocation"
  | "availability_hold"
  | "allocation_resource"

export interface DepartureIssue {
  code: DepartureIssueCode
  severity: DepartureIssueSeverity
  subjectType: DepartureIssueSubjectType
  /** Id of the row the issue is about; the slot id for departure-level issues. */
  subjectId: string
  /** How many rows of `subjectType` this issue covers. */
  count: number
  /** English fallback for consumers with no message catalogue. */
  message: string
}

/** How many individually-identified subjects one code will name before it rolls up. */
const SUBJECT_SAMPLE_LIMIT = 50

/** The facts the evaluator needs. Assembled by `loadDepartureIssueSubjects`. */
export interface DepartureIssueInput {
  slotId: string
  /** `availability_slots.product_version_id`; null on legacy or never-published rows. */
  productVersionId: string | null
  counters: DepartureCapacityCounters
  /** Ids of `held` allocations past `hold_expires_at`, capped for boundedness. */
  staleHeldAllocationIds: readonly string[]
  /** Ids of cancelled bookings still holding a live allocation, capped. */
  cancelledBookingIds: readonly string[]
}

/**
 * Evaluate every rule against already-loaded facts. Pure: same facts in, same
 * issues out, in a stable order (critical first, then code order).
 */
export function evaluateDepartureIssues(input: DepartureIssueInput): DepartureIssue[] {
  const { counters } = input
  const issues: DepartureIssue[] = []

  const departureIssue = (
    code: DepartureIssueCode,
    severity: DepartureIssueSeverity,
    count: number,
    message: string,
  ) => {
    issues.push({
      code,
      severity,
      subjectType: "departure",
      subjectId: input.slotId,
      count,
      message,
    })
  }

  for (const allocationId of input.staleHeldAllocationIds) {
    issues.push({
      code: "stale_held_allocation",
      severity: "warning",
      subjectType: "booking_allocation",
      subjectId: allocationId,
      count: 1,
      message: "Allocation is still held past its hold expiry and is holding a seat nobody owns.",
    })
  }
  // The sample is capped; report whatever it did not name as one rolled-up row
  // so a departure with hundreds of stale holds still returns a bounded body.
  const unnamedStale = counters.allocations.staleHeld - input.staleHeldAllocationIds.length
  if (unnamedStale > 0) {
    departureIssue(
      "stale_held_allocation",
      "warning",
      unnamedStale,
      "Further allocations are still held past their hold expiry.",
    )
  }

  for (const bookingId of input.cancelledBookingIds) {
    issues.push({
      code: "allocation_on_cancelled_booking",
      severity: "warning",
      subjectType: "booking",
      subjectId: bookingId,
      count: 1,
      message: "Booking is cancelled but still holds a live allocation on this departure.",
    })
  }
  const unnamedCancelled =
    counters.bookings.cancelledWithLiveAllocation - input.cancelledBookingIds.length
  if (unnamedCancelled > 0) {
    departureIssue(
      "allocation_on_cancelled_booking",
      "warning",
      unnamedCancelled,
      "Further cancelled bookings still hold a live allocation on this departure.",
    )
  }

  if (counters.holds.expired > 0) {
    departureIssue(
      "expired_hold_not_released",
      "warning",
      counters.holds.expired,
      "Checkout holds have expired without being released, so their pax are still deducted.",
    )
  }

  if (counters.travelers.missing > 0) {
    departureIssue(
      "travelers_missing_for_booked_pax",
      "warning",
      counters.travelers.missing,
      "Fewer traveler records have been entered than the bookings sold pax for.",
    )
  } else if (counters.travelers.missing < 0) {
    departureIssue(
      "travelers_exceed_booked_pax",
      "warning",
      -counters.travelers.missing,
      "More traveler records have been entered than the bookings sold pax for.",
    )
  }

  if (
    counters.remainingPax !== null &&
    counters.derivedRemainingPax !== null &&
    counters.remainingPax !== counters.derivedRemainingPax
  ) {
    departureIssue(
      "remaining_pax_drift",
      "warning",
      Math.abs(counters.remainingPax - counters.derivedRemainingPax),
      "The stored remaining-pax counter disagrees with what the bookings and holds consume.",
    )
  }

  if (counters.derivedRemainingPax !== null && counters.derivedRemainingPax < 0) {
    departureIssue(
      "capacity_oversold",
      "critical",
      -counters.derivedRemainingPax,
      "Bookings and live holds consume more pax than the departure's authored capacity.",
    )
  }

  for (const resource of counters.resourceBreakdown) {
    if (resource.assigned <= resource.capacity) continue
    issues.push({
      code: "resource_over_capacity",
      severity: "critical",
      subjectType: "allocation_resource",
      subjectId: resource.id,
      count: resource.assigned - resource.capacity,
      message: "More travelers are assigned to this resource than it can hold.",
    })
  }

  if (counters.resources.seating === 0 && counters.travelers.entered > 0) {
    departureIssue(
      "allocation_resources_missing",
      "warning",
      counters.travelers.entered,
      "Travelers are booked on this departure but no rooms or seats have been laid out.",
    )
  } else if (counters.travelers.unassigned > 0) {
    departureIssue(
      "travelers_unassigned",
      "warning",
      counters.travelers.unassigned,
      "Travelers on this departure have not been assigned to a room or seat.",
    )
  }

  if (!input.productVersionId) {
    departureIssue(
      "departure_not_version_bound",
      "warning",
      1,
      "This departure is not bound to a published Product Version, so what it sells can drift.",
    )
  }

  return issues.sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      a.code.localeCompare(b.code) ||
      a.subjectId.localeCompare(b.subjectId),
  )
}

function severityRank(severity: DepartureIssueSeverity): number {
  return severity === "critical" ? 0 : 1
}

interface DepartureIssueSubjects {
  staleHeldAllocationIds: string[]
  cancelledBookingIds: string[]
}

/**
 * Load the individually-identified subjects the evaluator names. Both queries
 * are capped so the issue list stays bounded no matter how badly a departure
 * has drifted; the counters carry the true totals.
 */
export async function loadDepartureIssueSubjects(
  db: PostgresJsDatabase,
  slotId: string,
  now: Date = new Date(),
): Promise<DepartureIssueSubjects> {
  const [staleRows, cancelledRows] = await Promise.all([
    executeRows<{ id: string }>(
      db,
      sql`
        SELECT ba.id
        FROM booking_allocations ba
        WHERE ba.availability_slot_id = ${slotId}
          AND ba.status = 'held'
          AND ba.hold_expires_at IS NOT NULL
          AND ba.hold_expires_at < ${now.toISOString()}::timestamptz
        ORDER BY ba.hold_expires_at
        LIMIT ${SUBJECT_SAMPLE_LIMIT}
      `,
    ),
    executeRows<{ id: string }>(
      db,
      sql`
        SELECT DISTINCT b.id
        FROM bookings b
        JOIN booking_allocations ba ON ba.booking_id = b.id
        WHERE ba.availability_slot_id = ${slotId}
          AND ba.status IN (${activeBookingAllocationStatusesSql()})
          AND b.status = 'cancelled'
        ORDER BY b.id
        LIMIT ${SUBJECT_SAMPLE_LIMIT}
      `,
    ),
  ])

  return {
    staleHeldAllocationIds: staleRows.map((row) => row.id),
    cancelledBookingIds: cancelledRows.map((row) => row.id),
  }
}

/**
 * Convenience loader + evaluator for callers that hold nothing yet. Returns
 * `null` when the slot does not exist.
 */
export async function getDepartureIssues(
  db: PostgresJsDatabase,
  slotId: string,
  options: {
    now?: Date
    counters?: DepartureCapacityCounters
    productVersionId?: string | null
  } = {},
): Promise<DepartureIssue[] | null> {
  const now = options.now ?? new Date()
  const counters = options.counters ?? (await getDepartureCapacityCounters(db, slotId, now))
  if (!counters) return null

  const productVersionId =
    options.productVersionId !== undefined
      ? options.productVersionId
      : await loadProductVersionId(db, slotId)
  const subjects = await loadDepartureIssueSubjects(db, slotId, now)

  return evaluateDepartureIssues({ slotId, productVersionId, counters, ...subjects })
}

async function loadProductVersionId(
  db: PostgresJsDatabase,
  slotId: string,
): Promise<string | null> {
  const rows = await executeRows<{ product_version_id: string | null }>(
    db,
    sql`
      SELECT product_version_id
      FROM availability_slots
      WHERE id = ${slotId}
      LIMIT 1
    `,
  )
  return rows[0]?.product_version_id ?? null
}
