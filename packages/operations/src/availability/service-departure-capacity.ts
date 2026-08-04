/**
 * Per-departure capacity census.
 *
 * An operated Departure is an `availability_slots` row bound to an immutable
 * Product Version. Everything that consumes its capacity is written somewhere
 * else — `availability_holds` while a cart is open, `booking_allocations` once
 * a booking exists, `booking_travelers` once names are entered, and
 * `allocation_resources` once the operator has laid out rooms or seats. The
 * slot itself carries only two write-once-ish counters (`initial_pax`,
 * `remaining_pax`) that nothing recomputes.
 *
 * This module counts all of it in one place so the workspace can put the
 * stored counter next to the derived one and let the operator see when they
 * disagree, rather than silently trusting either. Nothing here writes: a
 * disagreement is reported (see `service-departure-issues.ts`), never
 * repaired.
 *
 * Join path: `booking_allocations.availability_slot_id` is the canonical
 * slot↔booking edge for the workspace. See
 * `docs/architecture/operated-departure-logistics.md` for why, and for the two
 * other edges that coexist in the codebase.
 *
 * Known attribution limit: `bookings.pax` and `booking_travelers` are
 * booking-level, not departure-level. A single booking that touches two
 * departures contributes its whole pax count and its whole traveler list to
 * both. This matches how the existing allocation manifest already counts, so
 * the workspace's counters and its rows agree; splitting a booking across
 * departures needs a per-allocation pax figure, which
 * `booking_allocations.quantity` could carry but nothing currently populates
 * consistently. Not silently corrected here — a counter that guessed would be
 * worse than one that matches the manifest.
 */

import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { activeBookingAllocationStatusesSql, activeBookingStatusesSql } from "./booking-statuses.js"
import {
  getSlotResourceAvailability,
  type SlotResourceAvailability,
} from "./service-allocation-resource-capacity.js"
import { executeRows } from "./service-allocation-sql.js"
import { getSlotById } from "./service-core.js"
import { countSlotHolds, type SlotHoldCounts } from "./service-holds.js"

/** Allocation rows split by what they still do to the slot's inventory. */
export interface DepartureAllocationCounters {
  /** `status = 'held'` — a claim that has not been confirmed yet. */
  held: number
  /** `status = 'confirmed'`. */
  confirmed: number
  /** `status = 'fulfilled'` — the departure ran and this booking travelled. */
  fulfilled: number
  /**
   * `status = 'held'` whose `hold_expires_at` has passed. These still count as
   * consumption everywhere in the read model, which is exactly the problem:
   * the seat is neither sellable nor sold. Detection only — releasing them is
   * issue #4067's job.
   */
  staleHeld: number
  /** `status = 'released'`. */
  released: number
  /** `status = 'expired'`. */
  expired: number
  /** `status = 'cancelled'`. */
  cancelled: number
  /** held + confirmed + fulfilled — the rows that still consume capacity. */
  active: number
  /** released + expired + cancelled — the rows that gave the seat back. */
  inactive: number
}

export interface DepartureBookingCounters {
  /** Bookings with a live allocation on this slot and a live booking status. */
  active: number
  /**
   * Bookings whose allocation still points at this slot while the booking
   * itself is cancelled. Every read model filters these out, so they are
   * invisible until something counts them.
   */
  cancelledWithLiveAllocation: number
  /** `Σ bookings.pax` over the active bookings — what was sold. */
  expectedPax: number
  /** Active booking count broken down by `bookings.status`. */
  byStatus: Record<string, number>
}

export interface DepartureTravelerCounters {
  /** `booking_travelers` rows entered against the active bookings. */
  entered: number
  /** Of those, how many are flagged as their booking's lead traveler. */
  lead: number
  /** Of those, how many hold at least one resource assignment. */
  assigned: number
  /** `entered - assigned`. */
  unassigned: number
  /**
   * `expectedPax - entered`. Positive means names are still missing; negative
   * means more travelers were entered than were sold.
   */
  missing: number
}

export interface DepartureResourceCounters {
  /** Every `allocation_resources` row on the slot, parents included. */
  total: number
  /**
   * Resources that actually seat a traveler — a `vehicle` whose
   * `vehicle_seat` children are also rows would otherwise be counted twice.
   */
  seating: number
  /** Σ capacity over the seating resources. */
  capacity: number
  /** Σ distinct assigned travelers over the seating resources. */
  assigned: number
  /** Σ remaining headroom over the seating resources. */
  available: number
  /** Seating resources whose assigned count exceeds their capacity. */
  overCapacity: number
}

export interface DepartureCapacityCounters {
  slotId: string
  unlimited: boolean
  /** `availability_slots.initial_pax` — the authored capacity. */
  initialPax: number | null
  /**
   * The capacity the departure can actually seat: `initialPax`, lowered to the
   * seating resources' total capacity when the operator has laid out fewer
   * beds/seats than they authored pax. `null` when the slot is unlimited or
   * has no authored capacity and no resources.
   */
  effectivePax: number | null
  /** `availability_slots.remaining_pax` — the stored counter, as persisted. */
  remainingPax: number | null
  /**
   * `initialPax` less what the other tables say is consumed (sold pax plus
   * live hold pax). `null` when there is nothing to subtract from. Compared
   * against `remainingPax` to detect counter drift.
   */
  derivedRemainingPax: number | null
  /** `expectedPax` + live hold pax — what the derived remaining subtracts. */
  derivedConsumedPax: number
  holds: SlotHoldCounts
  allocations: DepartureAllocationCounters
  bookings: DepartureBookingCounters
  travelers: DepartureTravelerCounters
  resources: DepartureResourceCounters
  /** The per-resource rows the resource counters roll up, in render order. */
  resourceBreakdown: SlotResourceAvailability[]
}

interface AllocationStatusRow {
  status: string
  allocation_count: number
  stale_held_count: number
}

interface BookingStatusRow {
  status: string
  booking_count: number
  pax: number
}

interface TravelerCountRow {
  entered: number
  lead: number
  assigned: number
}

/**
 * Count everything that bears on one departure's capacity.
 *
 * Returns `null` when the slot does not exist, matching the other per-slot
 * read models in this package.
 */
export async function getDepartureCapacityCounters(
  db: PostgresJsDatabase,
  slotId: string,
  now: Date = new Date(),
): Promise<DepartureCapacityCounters | null> {
  const slot = await getSlotById(db, slotId)

  if (!slot) return null

  const [allocationRows, bookingRows, travelerRows, holds, resourceBreakdown] = await Promise.all([
    loadAllocationStatusRows(db, slotId, now),
    loadBookingStatusRows(db, slotId),
    loadTravelerCounts(db, slotId),
    countSlotHolds(db, slotId, now),
    getSlotResourceAvailability(db, slotId),
  ])

  const allocations = rollUpAllocations(allocationRows)
  const bookings = rollUpBookings(bookingRows)
  const travelers = rollUpTravelers(travelerRows[0], bookings.expectedPax)
  const resources = rollUpResources(resourceBreakdown)

  const derivedConsumedPax = bookings.expectedPax + holds.activePax
  const initialPax = slot.initialPax ?? null

  return {
    slotId: slot.id,
    unlimited: slot.unlimited,
    initialPax,
    effectivePax: deriveEffectivePax(slot.unlimited, initialPax, resources),
    remainingPax: slot.remainingPax ?? null,
    derivedRemainingPax:
      slot.unlimited || initialPax === null ? null : initialPax - derivedConsumedPax,
    derivedConsumedPax,
    holds,
    allocations,
    bookings,
    travelers,
    resources,
    resourceBreakdown,
  }
}

function deriveEffectivePax(
  unlimited: boolean,
  initialPax: number | null,
  resources: DepartureResourceCounters,
): number | null {
  if (unlimited) return null
  if (resources.seating === 0) return initialPax
  if (initialPax === null) return resources.capacity
  return Math.min(initialPax, resources.capacity)
}

async function loadAllocationStatusRows(
  db: PostgresJsDatabase,
  slotId: string,
  now: Date,
): Promise<AllocationStatusRow[]> {
  return executeRows<AllocationStatusRow>(
    db,
    sql`
      SELECT
        ba.status,
        COUNT(*)::int AS allocation_count,
        COUNT(*) FILTER (
          WHERE ba.status = 'held'
            AND ba.hold_expires_at IS NOT NULL
            AND ba.hold_expires_at < ${now.toISOString()}::timestamptz
        )::int AS stale_held_count
      FROM booking_allocations ba
      WHERE ba.availability_slot_id = ${slotId}
      GROUP BY ba.status
    `,
  )
}

/**
 * Bookings reachable from this slot through a *live* allocation, grouped by
 * booking status. Deliberately unfiltered on `bookings.status` so a cancelled
 * booking still holding an allocation shows up instead of vanishing.
 *
 * `EXISTS` rather than a join so a booking with two allocations on the same
 * slot cannot double its `pax` into the sum.
 */
async function loadBookingStatusRows(
  db: PostgresJsDatabase,
  slotId: string,
): Promise<BookingStatusRow[]> {
  return executeRows<BookingStatusRow>(
    db,
    sql`
      SELECT
        b.status,
        COUNT(*)::int AS booking_count,
        COALESCE(SUM(b.pax), 0)::int AS pax
      FROM bookings b
      WHERE EXISTS (
        SELECT 1
        FROM booking_allocations ba
        WHERE ba.booking_id = b.id
          AND ba.availability_slot_id = ${slotId}
          AND ba.status IN (${activeBookingAllocationStatusesSql()})
      )
      GROUP BY b.status
    `,
  )
}

/**
 * Traveler records entered against the departure's live bookings, and how many
 * of them hold a resource assignment. Not filtered by `participant_type` so
 * this stays the same population `getSlotAllocationManifest` renders.
 */
async function loadTravelerCounts(
  db: PostgresJsDatabase,
  slotId: string,
): Promise<TravelerCountRow[]> {
  return executeRows<TravelerCountRow>(
    db,
    sql`
      SELECT
        COUNT(*)::int AS entered,
        COUNT(*) FILTER (WHERE btd.is_lead_traveler)::int AS lead,
        COUNT(*) FILTER (
          WHERE btd.allocations IS NOT NULL AND btd.allocations <> '{}'::jsonb
        )::int AS assigned
      FROM booking_travelers bt
      JOIN bookings b ON b.id = bt.booking_id
      LEFT JOIN booking_traveler_travel_details btd ON btd.traveler_id = bt.id
      WHERE b.status IN (${activeBookingStatusesSql()})
        AND EXISTS (
          SELECT 1
          FROM booking_allocations ba
          WHERE ba.booking_id = b.id
            AND ba.availability_slot_id = ${slotId}
            AND ba.status IN (${activeBookingAllocationStatusesSql()})
        )
    `,
  )
}

function rollUpAllocations(rows: readonly AllocationStatusRow[]): DepartureAllocationCounters {
  const byStatus = new Map(rows.map((row) => [row.status, row.allocation_count]))
  const count = (status: string) => byStatus.get(status) ?? 0
  const held = count("held")
  const confirmed = count("confirmed")
  const fulfilled = count("fulfilled")
  const released = count("released")
  const expired = count("expired")
  const cancelled = count("cancelled")

  return {
    held,
    confirmed,
    fulfilled,
    staleHeld: rows.reduce((total, row) => total + row.stale_held_count, 0),
    released,
    expired,
    cancelled,
    active: held + confirmed + fulfilled,
    inactive: released + expired + cancelled,
  }
}

function rollUpBookings(rows: readonly BookingStatusRow[]): DepartureBookingCounters {
  const byStatus: Record<string, number> = {}
  let active = 0
  let expectedPax = 0
  let cancelledWithLiveAllocation = 0

  for (const row of rows) {
    if (row.status === "cancelled") {
      cancelledWithLiveAllocation += row.booking_count
      continue
    }
    byStatus[row.status] = (byStatus[row.status] ?? 0) + row.booking_count
    active += row.booking_count
    expectedPax += row.pax
  }

  return { active, cancelledWithLiveAllocation, expectedPax, byStatus }
}

function rollUpTravelers(
  row: TravelerCountRow | undefined,
  expectedPax: number,
): DepartureTravelerCounters {
  const entered = row?.entered ?? 0
  const assigned = row?.assigned ?? 0
  return {
    entered,
    lead: row?.lead ?? 0,
    assigned,
    unassigned: Math.max(0, entered - assigned),
    missing: expectedPax - entered,
  }
}

function rollUpResources(
  breakdown: readonly SlotResourceAvailability[],
): DepartureResourceCounters {
  const parentIds = new Set(
    breakdown.flatMap((resource) => (resource.parentId ? [resource.parentId] : [])),
  )
  const seating = breakdown.filter((resource) => !parentIds.has(resource.id))

  return {
    total: breakdown.length,
    seating: seating.length,
    capacity: seating.reduce((sum, resource) => sum + resource.capacity, 0),
    assigned: seating.reduce((sum, resource) => sum + resource.assigned, 0),
    available: seating.reduce((sum, resource) => sum + resource.available, 0),
    overCapacity: seating.filter((resource) => resource.assigned > resource.capacity).length,
  }
}
