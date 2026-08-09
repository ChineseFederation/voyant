/**
 * The departure workspace's write path for a traveler's rooming preferences.
 *
 * `booking_traveler_travel_details.bed_preference` and `room_type_id` existed
 * before #4036 but were writable only through the admin travel-details API —
 * a per-booking screen, not the rooming plan. Enforcing room constraints on
 * data no operator can enter *while laying out the rooms* is theatre: the first
 * `bed_preference_unmet` conflict would have named a preference nobody could
 * have set and nobody could correct.
 *
 * Deliberately narrow. This writes the two rooming fields and nothing else;
 * identity, dietary and accessibility notes stay behind the travel-details API,
 * which owns their KMS envelopes. Sharing-group membership already has its own
 * mutation (`updateTravelerSharingGroup`) and is not duplicated here.
 */

import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { z } from "zod"

import { activeBookingAllocationStatusesSql, activeBookingStatusesSql } from "./booking-statuses.js"
import type { AllocationMutationOptions } from "./service-allocation.js"
import { recordAllocationAudit } from "./service-allocation-audit.js"
import { AllocationServiceError } from "./service-allocation-errors.js"
import { executeRows, type SqlExecutor } from "./service-allocation-sql.js"
import type { updateTravelerRoomingPreferencesSchema } from "./validation.js"

export type UpdateTravelerRoomingPreferencesInput = z.infer<
  typeof updateTravelerRoomingPreferencesSchema
>

export interface TravelerRoomingPreferences {
  travelerId: string
  bedPreference: string | null
  roomTypeId: string | null
}

export async function getTravelerRoomingPreferences(
  db: PostgresJsDatabase,
  slotId: string,
  travelerId: string,
): Promise<TravelerRoomingPreferences> {
  await assertTravelerBelongsToSlot(db, slotId, travelerId)
  return { travelerId, ...(await readPreferences(db, travelerId)) }
}

export async function updateTravelerRoomingPreferences(
  db: PostgresJsDatabase,
  slotId: string,
  travelerId: string,
  input: UpdateTravelerRoomingPreferencesInput,
  options: AllocationMutationOptions = {},
): Promise<TravelerRoomingPreferences> {
  return db.transaction(async (tx) => {
    await assertTravelerBelongsToSlot(tx, slotId, travelerId)
    const before = await readPreferences(tx, travelerId)

    // COALESCE against the excluded value keeps this a genuine PATCH: a field
    // the caller omitted keeps its stored value, while an explicit `null`
    // clears it. Encoding "omitted" as a sentinel rather than as `undefined`
    // is what lets one statement serve both.
    const bedPreferenceProvided = input.bedPreference !== undefined
    const roomTypeProvided = input.roomTypeId !== undefined

    await tx.execute(sql`
      INSERT INTO booking_traveler_travel_details (traveler_id, bed_preference, room_type_id)
      VALUES (
        ${travelerId},
        ${bedPreferenceProvided ? (input.bedPreference ?? null) : null},
        ${roomTypeProvided ? (input.roomTypeId ?? null) : null}
      )
      ON CONFLICT (traveler_id) DO UPDATE SET
        bed_preference = CASE
          WHEN ${bedPreferenceProvided} THEN EXCLUDED.bed_preference
          ELSE booking_traveler_travel_details.bed_preference
        END,
        room_type_id = CASE
          WHEN ${roomTypeProvided} THEN EXCLUDED.room_type_id
          ELSE booking_traveler_travel_details.room_type_id
        END,
        updated_at = now()
    `)

    const after = await readPreferences(tx, travelerId)

    // Audit inside the transaction so the preference change and its record
    // commit or roll back together, per #4164.
    await recordAllocationAudit(tx, {
      slotId,
      action: "traveler.rooming-preferences.update",
      actorId: options.actorId ?? null,
      travelerId,
      before,
      after,
    })

    return { travelerId, ...after }
  })
}

async function readPreferences(
  db: SqlExecutor,
  travelerId: string,
): Promise<{ bedPreference: string | null; roomTypeId: string | null }> {
  const rows = await executeRows<{ bed_preference: string | null; room_type_id: string | null }>(
    db,
    sql`
      SELECT bed_preference, room_type_id
      FROM booking_traveler_travel_details
      WHERE traveler_id = ${travelerId}
      LIMIT 1
    `,
  )
  return {
    bedPreference: rows[0]?.bed_preference ?? null,
    roomTypeId: rows[0]?.room_type_id ?? null,
  }
}

async function assertTravelerBelongsToSlot(
  db: SqlExecutor,
  slotId: string,
  travelerId: string,
): Promise<void> {
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
