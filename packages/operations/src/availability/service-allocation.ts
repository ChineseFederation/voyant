// agent-quality: file-size exception -- owner: availability. This module
// pairs the slot allocation manifest read with every traveler/sharing-group
// mutation that must stay in step with it, and they share private slot/
// traveler helpers below. It was already over the limit before #4164 wrapped
// the mutations' audit writes in their transactions; splitting the manifest
// read out is a separate refactor, not part of this bug fix.

import { eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { z } from "zod"
import { activeBookingAllocationStatusesSql, activeBookingStatusesSql } from "./booking-statuses.js"
import { type allocationResources, availabilitySlots, sharingGroupLabels } from "./schema.js"
import { recordAllocationAudit } from "./service-allocation-audit.js"
import {
  type AssignmentConstraintDecision,
  decideAssignmentConstraints,
  lockConstraintResource,
} from "./service-allocation-constraint-checks.js"
import { AllocationServiceError } from "./service-allocation-errors.js"
import type { AllocationPaymentStatus } from "./service-allocation-manifest-queries.js"
import {
  derivePaidAmountCents,
  derivePaymentStatus,
  loadSlotBookingRows,
  loadSlotBookingUnitRows,
  loadSlotTravelerCounts,
  loadSlotTravelerRows,
  normalizeAllocationMap,
  serializeSlot,
} from "./service-allocation-manifest-queries.js"
import {
  countResourceOccupants,
  listAllocationResources,
} from "./service-allocation-resource-capacity.js"
import { executeRows, type SqlExecutor, sqlTextArray } from "./service-allocation-sql.js"
import type {
  assignTravelerAllocationSchema,
  insertAllocationResourceSchema,
  pairSharingGroupSchema,
  updateAllocationResourceSchema,
  updateSharingGroupLabelSchema,
  updateTravelerSharingGroupSchema,
} from "./validation.js"

export {
  type AllocationAuditLogEntry,
  listAllocationAuditLog,
  recordAllocationAudit,
} from "./service-allocation-audit.js"
export { AllocationServiceError } from "./service-allocation-errors.js"
export type { AllocationPaymentStatus, BookingRow } from "./service-allocation-manifest-queries.js"
export {
  derivePaidAmountCents,
  derivePaymentStatus,
} from "./service-allocation-manifest-queries.js"
export type {
  PlannedAllocation,
  ResourceCapacityViolation,
  SlotResourceAvailability,
} from "./service-allocation-resource-capacity.js"
export {
  getSlotResourceAvailability,
  getSlotsResourceAvailability,
  listAllocationResources,
  validateSlotAllocationCapacity,
} from "./service-allocation-resource-capacity.js"
export {
  createAllocationResource,
  deleteAllocationResource,
  updateAllocationResource,
} from "./service-allocation-resource-crud.js"

export type CreateAllocationResourceInput = z.infer<typeof insertAllocationResourceSchema>
export type UpdateAllocationResourceInput = z.infer<typeof updateAllocationResourceSchema>
export type AssignTravelerAllocationInput = z.infer<typeof assignTravelerAllocationSchema>
export type UpdateTravelerSharingGroupInput = z.infer<typeof updateTravelerSharingGroupSchema>
export type PairSharingGroupInput = z.infer<typeof pairSharingGroupSchema>
export type UpdateSharingGroupLabelInput = z.infer<typeof updateSharingGroupLabelSchema>

export interface AllocationMutationOptions {
  actorId?: string | null
}

export interface AllocationManifestTraveler {
  id: string
  bookingId: string
  bookingNumber: string
  bookingStatus: string
  /**
   * Per-slot booking ordinal (1-based) derived from each booking's
   * createdAt. All travelers on the same booking share the same number,
   * so the operator can scan the resource grid and spot at a glance
   * which chips belong together.
   */
  bookingSequence: number
  /** Aggregated payment status of the parent booking (see derivePaymentStatus). */
  paymentStatus: AllocationPaymentStatus
  firstName: string
  lastName: string
  fullName: string
  email: string | null
  phone: string | null
  isLeadTraveler: boolean
  isPrimary: boolean
  sharingGroupId: string | null
  optionId: string | null
  optionUnitId: string | null
  optionUnitCode: string | null
  roomTypeId: string | null
  bedPreference: string | null
  allocations: Record<string, string>
  travelerCategory: string | null
  participantType: string
  hasAccessibilityNeeds: boolean
  hasDietaryRequirements: boolean
}

export interface AllocationManifestBooking {
  id: string
  bookingNumber: string
  status: string
  /** Per-slot ordinal (1-based) by createdAt; same number as the travelers on this booking. */
  bookingSequence: number
  /** Aggregated payment status of the booking (see derivePaymentStatus). */
  paymentStatus: AllocationPaymentStatus
  contactFirstName: string | null
  contactLastName: string | null
  contactEmail: string | null
  contactPhone: string | null
  sellCurrency: string | null
  pax: number | null
  /** Total contracted sell amount on the booking (in `sellCurrency`). */
  sellAmountCents: number | null
  /**
   * Best-effort settled amount: max of `schedules_paid_cents`,
   * `invoice_paid_cents`, and `sellAmountCents` (when `paid_at` is set),
   * capped at `sellAmountCents`. Returned in `sellCurrency`.
   */
  paidAmountCents: number | null
  travelers: AllocationManifestTraveler[]
}

/**
 * Paging state for the manifest's booking axis.
 *
 * `limit: null` means no page was requested and every booking is present —
 * the pre-pagination behaviour, kept as the default so existing callers are
 * unaffected. `total` is always the departure's full booking count, never the
 * page's, and every figure in `summary` is likewise whole-departure. Paging
 * changes which rows come back; it never changes a count.
 */
export interface SlotAllocationManifestPagination {
  limit: number | null
  offset: number
  total: number
}

export interface SlotAllocationManifestOptions {
  /** Bookings per page. Omit to return every booking. */
  limit?: number
  /** Bookings to skip. Ignored when `limit` is omitted. */
  offset?: number
}

export interface SlotAllocationManifest {
  slot: {
    id: string
    productId: string | null
    startsAt: string | null
    endsAt: string | null
  }
  bookings: AllocationManifestBooking[]
  resources: Array<typeof allocationResources.$inferSelect>
  sharingGroupLabels: Record<string, string>
  pagination: SlotAllocationManifestPagination
  /**
   * Whole-departure headline counts. Deliberately not derived from `bookings`
   * above — see `SlotAllocationManifestPagination`. The richer counters live
   * in the departure summary (`service-departure-summary.ts`).
   */
  summary: {
    bookingCount: number
    travelerCount: number
    leadTravelerCount: number
    bookingsByStatus: Record<string, number>
  }
}

export async function getSlotAllocationManifest(
  db: PostgresJsDatabase,
  slotId: string,
  options: SlotAllocationManifestOptions = {},
): Promise<SlotAllocationManifest | null> {
  const [slot] = await db
    .select({
      id: availabilitySlots.id,
      productId: availabilitySlots.productId,
      startsAt: availabilitySlots.startsAt,
      endsAt: availabilitySlots.endsAt,
    })
    .from(availabilitySlots)
    .where(eq(availabilitySlots.id, slotId))
    .limit(1)

  if (!slot) return null

  const resources = await listAllocationResources(db, slotId)
  const allBookingRows = await loadSlotBookingRows(db, slotId)
  const offset = options.limit === undefined ? 0 : (options.offset ?? 0)
  const pagination: SlotAllocationManifestPagination = {
    limit: options.limit ?? null,
    offset,
    total: allBookingRows.length,
  }

  if (allBookingRows.length === 0) {
    return {
      slot: serializeSlot(slot),
      bookings: [],
      resources,
      sharingGroupLabels: {},
      pagination,
      summary: {
        bookingCount: 0,
        travelerCount: 0,
        leadTravelerCount: 0,
        bookingsByStatus: {},
      },
    }
  }

  // Counts are read over every booking on the departure before the page is
  // cut, so a caller that pages sees the same headline numbers on page 3 as on
  // page 1.
  const summary = {
    bookingCount: allBookingRows.length,
    ...(await loadSlotTravelerCounts(
      db,
      allBookingRows.map((row) => row.id),
    )),
    bookingsByStatus: allBookingRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1
      return acc
    }, {}),
  }

  const bookingRows =
    options.limit === undefined
      ? allBookingRows
      : allBookingRows.slice(offset, offset + options.limit)
  const bookingIds = bookingRows.map((row) => row.id)
  const travelerRows = await loadSlotTravelerRows(db, bookingIds)
  const bookingUnitRows = await loadSlotBookingUnitRows(db, slotId, bookingIds)
  const selectedUnitByBookingId = new Map(bookingUnitRows.map((row) => [row.booking_id, row]))
  const bookingById = new Map(bookingRows.map((row) => [row.id, row]))
  // Assign 1-based slot-local sequence by booking createdAt. The SQL above
  // already orders by `created_at` then `booking_number`, so iterating in
  // array order is the same as iterating in chronological order. Numbered off
  // the *full* list so a booking keeps its chip number when the caller pages.
  const sequenceByBookingId = new Map<string, number>()
  for (const [index, row] of allBookingRows.entries()) {
    sequenceByBookingId.set(row.id, index + 1)
  }
  const travelersByBooking = new Map<string, AllocationManifestTraveler[]>()

  for (const row of travelerRows) {
    const booking = bookingById.get(row.booking_id)
    const traveler: AllocationManifestTraveler = {
      id: row.id,
      bookingId: row.booking_id,
      bookingNumber: booking?.booking_number ?? "",
      bookingStatus: booking?.status ?? "unknown",
      bookingSequence: sequenceByBookingId.get(row.booking_id) ?? 0,
      paymentStatus: booking ? derivePaymentStatus(booking) : "unpaid",
      firstName: row.first_name,
      lastName: row.last_name,
      fullName: [row.first_name, row.last_name].filter(Boolean).join(" "),
      email: row.email,
      phone: row.phone,
      isLeadTraveler: row.is_lead_traveler ?? false,
      isPrimary: row.is_primary,
      sharingGroupId: row.sharing_group_id,
      optionId: selectedUnitByBookingId.get(row.booking_id)?.option_id ?? null,
      optionUnitId: selectedUnitByBookingId.get(row.booking_id)?.option_unit_id ?? null,
      optionUnitCode: selectedUnitByBookingId.get(row.booking_id)?.option_unit_code ?? null,
      roomTypeId: row.room_type_id,
      bedPreference: row.bed_preference,
      allocations: normalizeAllocationMap(row.allocations),
      travelerCategory: row.traveler_category,
      participantType: row.participant_type,
      hasAccessibilityNeeds: row.has_accessibility_needs,
      hasDietaryRequirements: row.has_dietary_requirements,
    }
    const list = travelersByBooking.get(row.booking_id) ?? []
    list.push(traveler)
    travelersByBooking.set(row.booking_id, list)
  }

  const bookings = bookingRows.map(
    (row): AllocationManifestBooking => ({
      id: row.id,
      bookingNumber: row.booking_number,
      status: row.status,
      bookingSequence: sequenceByBookingId.get(row.id) ?? 0,
      paymentStatus: derivePaymentStatus(row),
      contactFirstName: row.contact_first_name,
      contactLastName: row.contact_last_name,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
      sellCurrency: row.sell_currency,
      pax: row.pax,
      sellAmountCents: row.sell_amount_cents,
      paidAmountCents: derivePaidAmountCents(row),
      travelers: travelersByBooking.get(row.id) ?? [],
    }),
  )
  const sharingGroupLabelMap = await loadSharingGroupLabelMap(
    db,
    bookings.flatMap((booking) =>
      booking.travelers.flatMap((traveler) =>
        traveler.sharingGroupId ? [traveler.sharingGroupId] : [],
      ),
    ),
  )

  return {
    slot: serializeSlot(slot),
    bookings,
    resources,
    sharingGroupLabels: sharingGroupLabelMap,
    pagination,
    summary,
  }
}

export async function assignTravelerAllocation(
  db: PostgresJsDatabase,
  slotId: string,
  travelerId: string,
  input: AssignTravelerAllocationInput,
  options: AllocationMutationOptions = {},
) {
  if (input.kind === "vehicle" && input.resourceId !== null) {
    throw new AllocationServiceError(
      "Vehicles are parent resources; assign travelers to vehicle seats instead",
      400,
    )
  }
  // Returned out of the transaction rather than assigned to an outer `let`:
  // TypeScript cannot see an assignment made inside a callback, so the outer
  // binding narrows to `null` and every later read is an error.
  const decision = await db.transaction(
    async (tx): Promise<AssignmentConstraintDecision | null> => {
      await assertTravelerBelongsToSlot(tx, slotId, travelerId)
      const beforeResourceId = await getTravelerAllocation(tx, travelerId, input.kind)

      let verdict: AssignmentConstraintDecision | null = null

      if (input.resourceId) {
        const resource = await lockConstraintResource(tx, slotId, input.kind, input.resourceId)

        if (!resource) {
          throw new AllocationServiceError("Resource not found for this slot/kind", 404)
        }

        const current = await countResourceOccupants(
          tx,
          slotId,
          input.kind,
          input.resourceId,
          travelerId,
        )
        if (current + 1 > resource.capacity) {
          throw new AllocationServiceError("Resource over capacity", 409, {
            capacity: resource.capacity,
            current,
          })
        }

        // Everything past capacity: room type, bed configuration, accessibility,
        // the unit that was sold, and the age/supervision rules. Blocking
        // violations reject with 409 unless the operator supplied
        // `override.reason`, which is then recorded in the audit entry below.
        verdict = await decideAssignmentConstraints(tx, {
          slotId,
          kind: input.kind,
          travelerId,
          resource,
          override: input.override ?? null,
        })
      }

      await ensureTravelerTravelDetailsRow(tx, travelerId)

      if (input.resourceId) {
        await tx.execute(sql`
        UPDATE booking_traveler_travel_details
        SET allocations = COALESCE(allocations, '{}'::jsonb) || jsonb_build_object(${input.kind}::text, ${input.resourceId}::text),
            updated_at = now()
        WHERE traveler_id = ${travelerId}
      `)
      } else {
        await tx.execute(sql`
        UPDATE booking_traveler_travel_details
        SET allocations = COALESCE(allocations, '{}'::jsonb) - ${input.kind}::text,
            updated_at = now()
        WHERE traveler_id = ${travelerId}
      `)
      }

      // Audit inside the transaction so a failed audit insert rolls the
      // assignment back rather than committing an unrecorded move.
      // `beforeResourceId` was captured above, before the write.
      //
      // The `after` payload carries the constraint verdict as well as the target:
      // enforcing a rule the operator can wave through is only defensible if the
      // waiver, its stated reason, and exactly which rules it waived are all on
      // the record.
      await recordAllocationAudit(tx, {
        slotId,
        action: input.resourceId ? "traveler.assign" : "traveler.unassign",
        actorId: options.actorId ?? null,
        travelerId,
        before: { kind: input.kind, resourceId: beforeResourceId },
        after: {
          kind: input.kind,
          resourceId: input.resourceId,
          ...(verdict && verdict.violations.length > 0 ? { violations: verdict.violations } : {}),
          ...(input.override
            ? {
                override: {
                  reason: input.override.reason,
                  overrode: verdict?.overridden.map((entry) => entry.code) ?? [],
                },
              }
            : {}),
        },
      })

      return verdict
    },
  )

  return {
    travelerId,
    kind: input.kind,
    resourceId: input.resourceId,
    violations: decision?.violations ?? [],
  }
}

export async function updateTravelerSharingGroup(
  db: PostgresJsDatabase,
  slotId: string,
  travelerId: string,
  input: UpdateTravelerSharingGroupInput,
  options: AllocationMutationOptions = {},
) {
  await db.transaction(async (tx) => {
    await assertTravelerBelongsToSlot(tx, slotId, travelerId)
    const beforeSharingGroupId = await getTravelerSharingGroup(tx, travelerId)
    await tx.execute(sql`
      INSERT INTO booking_traveler_travel_details (traveler_id, sharing_group_id)
      VALUES (${travelerId}, ${input.sharingGroupId})
      ON CONFLICT (traveler_id) DO UPDATE SET
        sharing_group_id = ${input.sharingGroupId},
        updated_at = now()
    `)
    // Audit inside the transaction so the sharing-group change and its
    // record commit or roll back together.
    await recordAllocationAudit(tx, {
      slotId,
      action: input.sharingGroupId ? "traveler.sharing-group.set" : "traveler.sharing-group.clear",
      actorId: options.actorId ?? null,
      travelerId,
      before: { sharingGroupId: beforeSharingGroupId },
      after: { sharingGroupId: input.sharingGroupId },
    })
  })

  return { travelerId, sharingGroupId: input.sharingGroupId }
}

export async function pairSharingGroup(
  db: PostgresJsDatabase,
  slotId: string,
  input: PairSharingGroupInput,
  options: AllocationMutationOptions = {},
) {
  const sharingGroupId = input.sharingGroupId ?? globalThis.crypto.randomUUID()
  await db.transaction(async (tx) => {
    for (const travelerId of input.travelerIds) {
      await assertTravelerBelongsToSlot(tx, slotId, travelerId)
    }

    await tx.execute(sql`
      INSERT INTO booking_traveler_travel_details (traveler_id, sharing_group_id)
      SELECT id, ${sharingGroupId}
      FROM unnest(${sqlTextArray(input.travelerIds)}) AS u(id)
      ON CONFLICT (traveler_id) DO UPDATE SET
        sharing_group_id = EXCLUDED.sharing_group_id,
        updated_at = now()
    `)
    // Audit inside the transaction so the pairing and its record commit
    // or roll back together.
    await recordAllocationAudit(tx, {
      slotId,
      action: "traveler.sharing-group.set",
      actorId: options.actorId ?? null,
      after: { sharingGroupId, travelerIds: input.travelerIds },
    })
  })

  return { sharingGroupId, travelerIds: input.travelerIds }
}

export async function updateSharingGroupLabel(
  db: PostgresJsDatabase,
  slotId: string,
  groupId: string,
  input: UpdateSharingGroupLabelInput,
  options: AllocationMutationOptions = {},
) {
  const row = await db.transaction(async (tx) => {
    await assertSharingGroupBelongsToSlot(tx, slotId, groupId)
    const [inserted] = await tx
      .insert(sharingGroupLabels)
      .values({ groupId, label: input.label })
      .onConflictDoUpdate({
        target: sharingGroupLabels.groupId,
        set: { label: input.label, updatedAt: new Date() },
      })
      .returning()
    // Audit inside the transaction so the label change and its record
    // commit or roll back together.
    await recordAllocationAudit(tx, {
      slotId,
      action: "sharing-group.label.update",
      actorId: options.actorId ?? null,
      after: { sharingGroupId: groupId, label: inserted?.label ?? input.label },
    })
    return inserted
  })
  return row ?? { groupId, label: input.label, createdAt: new Date(), updatedAt: new Date() }
}

export async function deleteSharingGroupLabel(
  db: PostgresJsDatabase,
  slotId: string,
  groupId: string,
  options: AllocationMutationOptions = {},
) {
  const row = await db.transaction(async (tx) => {
    await assertSharingGroupBelongsToSlot(tx, slotId, groupId)
    const [deleted] = await tx
      .delete(sharingGroupLabels)
      .where(eq(sharingGroupLabels.groupId, groupId))
      .returning()
    if (deleted) {
      // Audit inside the transaction so the label removal and its record
      // commit or roll back together.
      await recordAllocationAudit(tx, {
        slotId,
        action: "sharing-group.label.clear",
        actorId: options.actorId ?? null,
        before: { sharingGroupId: groupId, label: deleted.label },
      })
    }
    return deleted
  })
  return row ?? null
}

async function ensureTravelerTravelDetailsRow(db: SqlExecutor, travelerId: string) {
  await db.execute(sql`
    INSERT INTO booking_traveler_travel_details (traveler_id)
    VALUES (${travelerId})
    ON CONFLICT (traveler_id) DO NOTHING
  `)
}

async function getTravelerAllocation(db: SqlExecutor, travelerId: string, kind: string) {
  const rows = await executeRows<{ resource_id: string | null }>(
    db,
    sql`
    SELECT allocations ->> ${kind} AS resource_id
    FROM booking_traveler_travel_details
    WHERE traveler_id = ${travelerId}
    LIMIT 1
  `,
  )
  return rows[0]?.resource_id ?? null
}

async function getTravelerSharingGroup(db: SqlExecutor, travelerId: string) {
  const rows = await executeRows<{ sharing_group_id: string | null }>(
    db,
    sql`
    SELECT sharing_group_id
    FROM booking_traveler_travel_details
    WHERE traveler_id = ${travelerId}
    LIMIT 1
  `,
  )
  return rows[0]?.sharing_group_id ?? null
}

async function assertTravelerBelongsToSlot(db: SqlExecutor, slotId: string, travelerId: string) {
  const rows = await executeRows<{ exists: number }>(
    db,
    sql`
    SELECT 1 AS exists
    FROM booking_travelers bt
    JOIN booking_allocations ba ON ba.booking_id = bt.booking_id
    JOIN bookings b ON b.id = bt.booking_id
    WHERE bt.id = ${travelerId}
      AND ba.availability_slot_id = ${slotId}
      AND b.status IN (${activeBookingStatusesSql()})
      AND ba.status IN (${activeBookingAllocationStatusesSql()})
    LIMIT 1
  `,
  )

  if (rows.length === 0) {
    throw new AllocationServiceError("Traveler not found for this slot", 404)
  }
}

async function assertSharingGroupBelongsToSlot(db: SqlExecutor, slotId: string, groupId: string) {
  const rows = await executeRows<{ exists: number }>(
    db,
    sql`
    SELECT 1 AS exists
    FROM booking_traveler_travel_details btd
    JOIN booking_travelers bt ON bt.id = btd.traveler_id
    JOIN booking_allocations ba ON ba.booking_id = bt.booking_id
    JOIN bookings b ON b.id = bt.booking_id
    WHERE btd.sharing_group_id = ${groupId}
      AND ba.availability_slot_id = ${slotId}
      AND b.status IN (${activeBookingStatusesSql()})
      AND ba.status IN (${activeBookingAllocationStatusesSql()})
    LIMIT 1
  `,
  )

  if (rows.length === 0) {
    throw new AllocationServiceError("Sharing group not found for this slot", 404)
  }
}

async function loadSharingGroupLabelMap(
  db: PostgresJsDatabase,
  groupIds: string[],
): Promise<Record<string, string>> {
  const uniqueIds = [...new Set(groupIds)]
  if (uniqueIds.length === 0) return {}

  const rows = await db
    .select({
      groupId: sharingGroupLabels.groupId,
      label: sharingGroupLabels.label,
    })
    .from(sharingGroupLabels)
    // agent-quality: raw-sql reviewed -- owner: availability; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    .where(sql`${sharingGroupLabels.groupId} = ANY(${sqlTextArray(uniqueIds)})`)

  return Object.fromEntries(rows.map((row) => [row.groupId, row.label]))
}
