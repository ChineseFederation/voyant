/**
 * The database half of `room-constraints.ts`: load the facts one assignment
 * needs, evaluate, and decide whether the write may proceed.
 *
 * Kept out of `service-allocation.ts` because the queries here are the only
 * ones in the module that read a traveler's *commercial* facts (which option
 * unit they bought) alongside their *rooming* facts (bed preference, category).
 * Every read is raw SQL through `executeRows`: `allocation_resources` is owned
 * by @voyant-travel/availability and the `operations->availability` table
 * reach-in ratchet has no headroom, so this file adds no schema imports.
 */

import { sql } from "drizzle-orm"

import { activeBookingAllocationStatusesSql, activeBookingStatusesSql } from "./booking-statuses.js"
import {
  type AllocationConstraintViolation,
  type ConstraintResource,
  type ConstraintTraveler,
  evaluateAssignmentConstraints,
} from "./room-constraints.js"
import { AllocationServiceError } from "./service-allocation-errors.js"
import { executeRows, type SqlExecutor, sqlTextArray } from "./service-allocation-sql.js"

interface ConstraintResourceRow {
  id: string
  kind: string
  capacity: number
  occupancy_min: number | null
  room_type_id: string | null
  bed_configuration: string | null
  accessible: boolean
  min_age: number | null
  max_age: number | null
  ref_type: string | null
  ref_id: string | null
  flags: Record<string, unknown> | null
}

interface ConstraintTravelerRow {
  id: string
  booking_id: string
  sharing_group_id: string | null
  traveler_category: string | null
  option_id: string | null
  option_unit_id: string | null
  room_type_id: string | null
  bed_preference: string | null
  has_accessibility_needs: boolean
}

/**
 * Lock and load one allocation resource with everything the constraint
 * evaluator needs. `FOR UPDATE` because the caller decides capacity from it.
 */
export async function lockConstraintResource(
  db: SqlExecutor,
  slotId: string,
  kind: string,
  resourceId: string,
): Promise<ConstraintResource | null> {
  const [row] = await executeRows<ConstraintResourceRow>(
    db,
    sql`
      SELECT
        id, kind, capacity, occupancy_min, room_type_id, bed_configuration,
        accessible, min_age, max_age, ref_type, ref_id, flags
      FROM allocation_resources
      WHERE id = ${resourceId}
        AND slot_id = ${slotId}
        AND kind = ${kind}
      FOR UPDATE
    `,
  )
  return row ? toConstraintResource(row) : null
}

export function toConstraintResource(row: ConstraintResourceRow): ConstraintResource {
  return {
    id: row.id,
    kind: row.kind,
    capacity: row.capacity,
    occupancyMin: row.occupancy_min,
    roomTypeId: row.room_type_id,
    bedConfiguration: row.bed_configuration,
    accessible: row.accessible ?? false,
    minAge: row.min_age,
    maxAge: row.max_age,
    refType: row.ref_type,
    refId: row.ref_id,
    flags: row.flags ?? {},
  }
}

/**
 * Constraint facts for a set of travelers.
 *
 * The commercial pair (option, option unit) comes from `booking_allocations`,
 * the canonical slot↔booking edge documented in
 * `docs/architecture/operated-departure-logistics.md` — the same edge the
 * manifest reads, so the guard and the screen can never disagree about which
 * unit a traveler bought.
 */
export async function loadConstraintTravelers(
  db: SqlExecutor,
  slotId: string,
  travelerIds: readonly string[],
): Promise<Map<string, ConstraintTraveler>> {
  if (travelerIds.length === 0) return new Map()
  const rows = await executeRows<ConstraintTravelerRow>(
    db,
    sql`
      SELECT
        bt.id,
        bt.booking_id,
        bt.traveler_category,
        btd.sharing_group_id,
        btd.room_type_id,
        btd.bed_preference,
        (btd.accessibility_encrypted IS NOT NULL) AS has_accessibility_needs,
        unit.option_id,
        unit.option_unit_id
      FROM booking_travelers bt
      LEFT JOIN booking_traveler_travel_details btd ON btd.traveler_id = bt.id
      LEFT JOIN LATERAL (
        SELECT ba.option_id, ba.option_unit_id
        FROM booking_allocations ba
        WHERE ba.booking_id = bt.booking_id
          AND ba.availability_slot_id = ${slotId}
          AND ba.status IN (${activeBookingAllocationStatusesSql()})
        ORDER BY
          (ba.option_unit_id IS NULL),
          ba.updated_at DESC,
          ba.created_at DESC
        LIMIT 1
      ) unit ON true
      WHERE bt.id = ANY(${sqlTextArray([...travelerIds])})
    `,
  )
  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        bookingId: row.booking_id,
        sharingGroupId: row.sharing_group_id,
        travelerCategory: row.traveler_category,
        optionId: row.option_id,
        optionUnitId: row.option_unit_id,
        roomTypeId: row.room_type_id,
        bedPreference: row.bed_preference,
        hasAccessibilityNeeds: row.has_accessibility_needs ?? false,
      } satisfies ConstraintTraveler,
    ]),
  )
}

/**
 * Travelers other than `excludeTravelerId` who currently hold `resourceId` on
 * this slot, with their constraint facts. Only travelers on live bookings — a
 * cancelled booking's traveler does not occupy a bed.
 */
export async function loadResourceOccupantFacts(
  db: SqlExecutor,
  slotId: string,
  kind: string,
  resourceId: string,
  excludeTravelerId: string | null,
): Promise<ConstraintTraveler[]> {
  const rows = await executeRows<{ id: string }>(
    db,
    sql`
      SELECT DISTINCT bt.id
      FROM booking_traveler_travel_details btd
      JOIN booking_travelers bt ON bt.id = btd.traveler_id
      JOIN booking_allocations ba ON ba.booking_id = bt.booking_id
      JOIN bookings b ON b.id = bt.booking_id
      WHERE btd.allocations ->> ${kind} = ${resourceId}
        AND ba.availability_slot_id = ${slotId}
        AND b.status IN (${activeBookingStatusesSql()})
        AND ba.status IN (${activeBookingAllocationStatusesSql()})
        AND (${excludeTravelerId}::text IS NULL OR bt.id <> ${excludeTravelerId})
    `,
  )
  const facts = await loadConstraintTravelers(
    db,
    slotId,
    rows.map((row) => row.id),
  )
  return [...facts.values()]
}

export interface AllocationOverride {
  reason: string
}

export interface AssignmentConstraintDecision {
  violations: AllocationConstraintViolation[]
  /** Blocking violations the operator's `override` waved through. */
  overridden: AllocationConstraintViolation[]
}

/**
 * Evaluate an assignment and decide whether it may be written.
 *
 * Blocking violations reject with **409** and the structured `violations`
 * payload unless the caller supplied an explicit `override.reason`. That reason
 * — and every violation it waived — is what the caller records in the audit
 * entry, so "why is a 12-year-old in a room of strangers" has an answer six
 * months later.
 */
export async function decideAssignmentConstraints(
  db: SqlExecutor,
  params: {
    slotId: string
    kind: string
    travelerId: string
    resource: ConstraintResource
    override?: AllocationOverride | null
  },
): Promise<AssignmentConstraintDecision> {
  const { slotId, kind, travelerId, resource, override } = params
  const travelerFacts = await loadConstraintTravelers(db, slotId, [travelerId])
  const traveler = travelerFacts.get(travelerId)
  if (!traveler) throw new AllocationServiceError("Traveler not found for this slot", 404)

  const otherOccupants = await loadResourceOccupantFacts(db, slotId, kind, resource.id, travelerId)
  const violations = evaluateAssignmentConstraints({ traveler, resource, otherOccupants })
  const blocking = violations.filter((entry) => entry.severity === "blocking")

  if (blocking.length > 0 && !override) {
    throw new AllocationServiceError("Assignment violates a room constraint", 409, {
      kind,
      resourceId: resource.id,
      travelerId,
      violations,
    })
  }

  return { violations, overridden: override ? blocking : [] }
}
