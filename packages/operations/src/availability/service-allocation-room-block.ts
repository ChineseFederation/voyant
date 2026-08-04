/**
 * Binding a contracted accommodation block to a departure's room inventory.
 *
 * ## Which table is authoritative
 *
 * This follows the split `docs/architecture/operated-departure-logistics.md`
 * documented for fleet resources, with the same shape and for the same reason:
 *
 * | Table | Authoritative for | Scope |
 * |---|---|---|
 * | `allocation_resources` (`ref_type = "room_block"`) | **what this departure operates** — the room positions travelers are assigned against, their occupancy band, room type and bed configuration | one slot |
 * | `room_block_nights` / `room_block_pickups` | **the contracted hold across departures** — how many of the supplier's rooms are still free on each night, and who took them | every departure, and every non-departure stay |
 *
 * Neither is a copy of the other. Every read the departure workspace does goes
 * through `allocation_resources`, so a departure never has to consult
 * Accommodations to render or validate its plan. Only `room_block_nights` spans
 * departures, so it is the only table that can tell you the block is already
 * spent — it is the conflict oracle, exactly as `resource_slot_assignments` is
 * for a coach.
 *
 * There is exactly **one write path**: `materializeDepartureRoomsFromBlock`
 * creates the positions and takes the pickup in one transaction;
 * `releaseDepartureRoomBlock` removes the positions and gives the pickup back.
 * Taking rooms without recording the pickup would let two departures sell the
 * same twenty rooms, which is the whole failure the nightly counters exist to
 * prevent.
 *
 * ## Cross-package access
 *
 * `room_blocks`, `room_block_nights`, `room_block_pickups`, `room_types` and
 * `room_type_bed_configs` are owned by @voyant-travel/accommodations.
 * Operations does not depend on that package and must not import its Drizzle
 * tables — a module's tables are private (ADR-0016 decision 6), and there is no
 * `operations->accommodations` reach-in budget at all. Every statement below is
 * therefore raw SQL through `executeRows`, and every one tolerates the tables
 * being absent: an accommodations-less deployment gets a clean 400, not a
 * `relation does not exist` stack trace.
 */

import type { AllocationResource } from "@voyant-travel/availability/schema"
import { newId } from "@voyant-travel/db/lib/typeid"
import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { z } from "zod"
import type { AllocationMutationOptions } from "./service-allocation.js"
import { recordAllocationAudit } from "./service-allocation-audit.js"
import { AllocationServiceError } from "./service-allocation-errors.js"
import { executeRows, type SqlExecutor, sqlTextArray } from "./service-allocation-sql.js"
import { renderNamePattern } from "./service-allocation-vehicle-materialization.js"
import type { materializeFromRoomBlockSchema } from "./validation.js"

export type MaterializeFromRoomBlockInput = z.infer<typeof materializeFromRoomBlockSchema>

export interface RoomBlockMaterializationResult {
  blockId: string
  kind: string
  /** Positions written by this call; `0` on an idempotent repeat. */
  created: number
  /** Positions the departure already held for this block and that were left alone. */
  skippedExisting: number
  /** Rooms taken from the block's nightly hold by this call. */
  roomsPickedUp: number
  /** The pickup ledger row this call opened, when it took any rooms. */
  pickupId: string | null
  /** Free rooms remaining on the tightest night of the departure, after the pickup. */
  remainingAfter: number
  resources: AllocationResource[]
}

interface RoomBlockRow {
  id: string
  name: string
  status: string
  room_type_id: string
  room_type_name: string | null
  min_occupancy: number | null
  standard_occupancy: number | null
  max_occupancy: number | null
  bed_configuration: string | null
}

interface RoomBlockNightRow {
  date: string
  rooms_held: number
  rooms_picked_up: number
  rooms_released: number
}

/** Block statuses that may still be drawn against. */
const DRAWABLE_BLOCK_STATUSES = new Set(["confirmed", "option", "held", "definite"])

export async function materializeDepartureRoomsFromBlock(
  db: PostgresJsDatabase,
  slotId: string,
  input: MaterializeFromRoomBlockInput,
  options: AllocationMutationOptions = {},
): Promise<RoomBlockMaterializationResult> {
  return db.transaction(async (tx) => {
    const scoped = tx as PostgresJsDatabase
    const nights = await lockDepartureNights(scoped, slotId)
    const block = await loadRoomBlock(scoped, input.blockId)

    if (!DRAWABLE_BLOCK_STATUSES.has(block.status)) {
      throw new AllocationServiceError("This room block cannot be drawn against", 409, {
        blockId: block.id,
        status: block.status,
      })
    }

    // Idempotent at (kind, ref) granularity, the same rule both existing
    // materialisation paths use: running this twice leaves the same rows and
    // takes no second pickup.
    const existing = await executeRows<{ count: number }>(
      scoped,
      sql`
        SELECT COUNT(*)::int AS count
        FROM allocation_resources
        WHERE slot_id = ${slotId}
          AND kind = ${input.kind}
          AND ref_type = 'room_block'
          AND ref_id = ${block.id}
      `,
    )
    const alreadyHeld = existing[0]?.count ?? 0
    if (alreadyHeld > 0) {
      return {
        blockId: block.id,
        kind: input.kind,
        created: 0,
        skippedExisting: alreadyHeld,
        roomsPickedUp: 0,
        pickupId: null,
        remainingAfter: await tightestRemaining(scoped, block.id, nights),
        resources: [],
      }
    }

    const nightRows = await lockBlockNights(scoped, block.id, nights)
    if (nightRows.length !== nights.length) {
      throw new AllocationServiceError(
        "The room block does not cover every night of this departure",
        409,
        {
          blockId: block.id,
          departureNights: nights,
          blockNights: nightRows.map((row) => row.date),
        },
      )
    }

    // A block's usable size is its *tightest* night: twenty rooms held on four
    // nights and twelve on the fifth is a twelve-room block for a five-night
    // departure. Taking twenty would break the nightly CHECK on the fifth night
    // and roll the whole thing back anyway; failing here says why.
    const remaining = nightRows.reduce(
      (least, row) => Math.min(least, row.rooms_held - row.rooms_picked_up - row.rooms_released),
      Number.POSITIVE_INFINITY,
    )
    const rooms = input.rooms ?? remaining
    if (rooms <= 0 || remaining <= 0) {
      throw new AllocationServiceError("The room block has no rooms left for these nights", 409, {
        blockId: block.id,
        remaining: Math.max(0, remaining),
      })
    }
    if (rooms > remaining) {
      const tightest = nightRows.reduce((worst, row) =>
        row.rooms_held - row.rooms_picked_up - row.rooms_released <
        worst.rooms_held - worst.rooms_picked_up - worst.rooms_released
          ? row
          : worst,
      )
      throw new AllocationServiceError("The room block cannot cover that many rooms", 409, {
        blockId: block.id,
        requested: rooms,
        remaining,
        tightestNight: tightest.date,
      })
    }

    const pickupId = await takeRoomBlockPickup(scoped, block.id, nights, rooms)

    const capacity = block.max_occupancy ?? block.standard_occupancy ?? 2
    const created: AllocationResource[] = []
    for (let index = 0; index < rooms; index++) {
      const label = renderNamePattern(input.namePattern, {
        sequence: String(index + 1),
        index: String(index + 1),
        option: block.room_type_name ?? block.name,
        block: block.name,
      })
      const flags = JSON.stringify({ roomBlockId: block.id, roomBlockPickupId: pickupId })
      const [row] = await executeRows<AllocationResource>(
        scoped,
        sql`
          INSERT INTO allocation_resources
            (id, slot_id, kind, ref_type, ref_id, label, capacity, occupancy_min,
             room_type_id, bed_configuration, flags, sort_order)
          VALUES (
            ${newId("allocation_resources")}, ${slotId}, ${input.kind}, 'room_block', ${block.id},
            ${label}, ${capacity}, ${block.min_occupancy}, ${block.room_type_id},
            ${block.bed_configuration}, ${flags}::jsonb, ${index + 1}
          )
          RETURNING
            id, slot_id AS "slotId", kind, ref_type AS "refType", ref_id AS "refId", label,
            capacity, occupancy_min AS "occupancyMin", room_type_id AS "roomTypeId",
            bed_configuration AS "bedConfiguration", accessible, min_age AS "minAge",
            max_age AS "maxAge", flags, parent_id AS "parentId", sort_order AS "sortOrder",
            created_at AS "createdAt", updated_at AS "updatedAt"
        `,
      )
      if (row) created.push(row)
    }

    // Audit inside the transaction: a rolled-back materialisation must not
    // leave a record claiming the block was drawn down.
    await recordAllocationAudit(scoped, {
      slotId,
      action: "resources.materialize.room-block",
      actorId: options.actorId ?? null,
      after: {
        kind: input.kind,
        blockId: block.id,
        created: created.length,
        roomsPickedUp: rooms,
        pickupId,
        nights,
      },
    })

    return {
      blockId: block.id,
      kind: input.kind,
      created: created.length,
      skippedExisting: 0,
      roomsPickedUp: rooms,
      pickupId,
      remainingAfter: remaining - rooms,
      resources: created,
    }
  })
}

export interface RoomBlockReleaseResult {
  blockId: string
  kind: string
  removed: number
  roomsReleased: number
}

/**
 * Give a departure's block rooms back: remove the positions, clear the traveler
 * allocations that pointed at them, and reverse the pickup so another departure
 * can draw the same rooms. The pickup ledger is append-only, so the reversal
 * compensates rather than deletes.
 */
export async function releaseDepartureRoomBlock(
  db: PostgresJsDatabase,
  slotId: string,
  blockId: string,
  input: { kind?: string } = {},
  options: AllocationMutationOptions = {},
): Promise<RoomBlockReleaseResult> {
  const kind = input.kind ?? "room"
  return db.transaction(async (tx) => {
    const scoped = tx as PostgresJsDatabase
    const removedRows = await executeRows<{ id: string; flags: Record<string, unknown> | null }>(
      scoped,
      sql`
        DELETE FROM allocation_resources
        WHERE slot_id = ${slotId}
          AND kind = ${kind}
          AND ref_type = 'room_block'
          AND ref_id = ${blockId}
        RETURNING id, flags
      `,
    )

    if (removedRows.length === 0) {
      throw new AllocationServiceError("This departure holds no rooms from that block", 404, {
        blockId,
        kind,
      })
    }

    // Clear the dangling traveler references in the same transaction, exactly
    // as `deleteAllocationResource` does: otherwise `allocations` points at a
    // deleted resource id and the rooming list stops reconciling.
    await scoped.execute(sql`
      UPDATE booking_traveler_travel_details
      SET allocations = allocations - ${kind}::text,
          updated_at = now()
      WHERE allocations ->> ${kind} = ANY(${sqlTextArray(removedRows.map((row) => row.id))})
    `)

    const pickupIds = [
      ...new Set(
        removedRows.flatMap((row) =>
          typeof row.flags?.roomBlockPickupId === "string" ? [row.flags.roomBlockPickupId] : [],
        ),
      ),
    ]
    const roomsReleased = await withAccommodations(
      () => reverseRoomBlockPickups(scoped, blockId, pickupIds),
      "Room blocks are not available in this deployment",
    )

    await recordAllocationAudit(scoped, {
      slotId,
      action: "resources.release.room-block",
      actorId: options.actorId ?? null,
      before: { kind, blockId, removed: removedRows.length, roomsReleased },
    })

    return { blockId, kind, removed: removedRows.length, roomsReleased }
  })
}

/**
 * The local dates a departure occupies a room on. A room block is contracted
 * per *night*, so a three-day/two-night departure starting 2026-06-01 draws
 * against 2026-06-01 and 2026-06-02 — never the day it checks out.
 */
async function lockDepartureNights(db: PostgresJsDatabase, slotId: string): Promise<string[]> {
  const [slot] = await executeRows<{
    date_local: string
    nights: number | null
    end_date_local: string | null
  }>(
    db,
    sql`
      SELECT
        date_local::text AS date_local,
        nights,
        CASE
          WHEN ends_at IS NULL THEN NULL
          ELSE (ends_at AT TIME ZONE timezone)::date::text
        END AS end_date_local
      FROM availability_slots
      WHERE id = ${slotId}
      FOR UPDATE
    `,
  )
  if (!slot) throw new AllocationServiceError("Availability slot not found", 404)

  const nightCount =
    slot.nights && slot.nights > 0
      ? slot.nights
      : slot.end_date_local
        ? Math.max(0, daysBetween(slot.date_local, slot.end_date_local))
        : 0
  if (nightCount <= 0) {
    throw new AllocationServiceError(
      "This departure has no overnight stay to draw a room block against",
      400,
      { slotId },
    )
  }

  const nights: string[] = []
  for (let offset = 0; offset < nightCount; offset++) {
    nights.push(addDays(slot.date_local, offset))
  }
  return nights
}

async function loadRoomBlock(db: SqlExecutor, blockId: string): Promise<RoomBlockRow> {
  const rows = await withAccommodations(
    () =>
      executeRows<RoomBlockRow>(
        db,
        sql`
          SELECT
            rb.id,
            rb.name,
            rb.status::text AS status,
            rb.room_type_id,
            rt.name AS room_type_name,
            rt.min_occupancy,
            rt.standard_occupancy,
            rt.max_occupancy,
            bed.bed_configuration
          FROM room_blocks rb
          LEFT JOIN room_types rt ON rt.id = rb.room_type_id
          LEFT JOIN LATERAL (
            SELECT string_agg(
                     btrim(concat_ws(' ', c.quantity::text, c.bed_type)),
                     ' + '
                     ORDER BY c.is_primary DESC, c.created_at
                   ) AS bed_configuration
            FROM room_type_bed_configs c
            WHERE c.room_type_id = rb.room_type_id
          ) bed ON true
          WHERE rb.id = ${blockId}
          LIMIT 1
        `,
      ),
    "Room blocks are not available in this deployment",
  )
  const row = rows[0]
  if (!row) throw new AllocationServiceError("Room block not found", 404, { blockId })
  return row
}

async function lockBlockNights(
  db: SqlExecutor,
  blockId: string,
  nights: readonly string[],
): Promise<RoomBlockNightRow[]> {
  return withAccommodations(
    () =>
      executeRows<RoomBlockNightRow>(
        db,
        sql`
          SELECT date::text AS date, rooms_held, rooms_picked_up, rooms_released
          FROM room_block_nights
          WHERE block_id = ${blockId}
            AND date >= ${nights[0]}::date
            AND date <= ${nights[nights.length - 1]}::date
          ORDER BY date
          FOR UPDATE
        `,
      ),
    "Room blocks are not available in this deployment",
  )
}

async function tightestRemaining(
  db: SqlExecutor,
  blockId: string,
  nights: readonly string[],
): Promise<number> {
  const rows = await lockBlockNights(db, blockId, nights)
  if (rows.length === 0) return 0
  return rows.reduce(
    (least, row) => Math.min(least, row.rooms_held - row.rooms_picked_up - row.rooms_released),
    Number.POSITIVE_INFINITY,
  )
}

/**
 * Take `rooms` off the block for every night of the departure and open the
 * matching ledger row, in one statement pair inside the caller's transaction.
 * `room_block_nights`'s `ck_room_block_nights_capacity` CHECK is the real
 * oversell guard — it fires even if this module's arithmetic is wrong.
 */
async function takeRoomBlockPickup(
  db: SqlExecutor,
  blockId: string,
  nights: readonly string[],
  rooms: number,
): Promise<string> {
  const checkIn = nights[0]
  const checkOut = addDays(nights[nights.length - 1] ?? "", 1)
  // The id is minted here rather than in SQL so it is a real TypeID
  // (`hrbp_…`), the same way the fleet-resource link mints its rows.
  const pickupId = newId("room_block_pickups")
  const rows = await executeRows<{ id: string }>(
    db,
    sql`
      INSERT INTO room_block_pickups (id, block_id, check_in, check_out, rooms, status)
      VALUES (${pickupId}, ${blockId}, ${checkIn}::date, ${checkOut}::date, ${rooms}, 'active')
      RETURNING id
    `,
  )
  await db.execute(sql`
    UPDATE room_block_nights
    SET rooms_picked_up = rooms_picked_up + ${rooms}
    WHERE block_id = ${blockId}
      AND date >= ${checkIn}::date
      AND date < ${checkOut}::date
  `)
  const id = rows[0]?.id
  if (!id) throw new AllocationServiceError("Room block pickup failed", 500, { blockId })
  return id
}

/**
 * Reverse the pickups this departure's positions referenced, and hand the rooms
 * back to the nightly counters.
 *
 * The pickup ids come from the positions' own `flags.roomBlockPickupId`, read
 * before they were deleted — that pointer is what ties the departure's rooms to
 * the ledger row they came from, so a release can never give back rooms a
 * different departure took.
 */
async function reverseRoomBlockPickups(
  db: SqlExecutor,
  blockId: string,
  pickupIds: readonly string[],
): Promise<number> {
  if (pickupIds.length === 0) return 0
  const reversed = await executeRows<{
    id: string
    rooms: number
    check_in: string
    check_out: string
  }>(
    db,
    sql`
      UPDATE room_block_pickups
      SET status = 'reversed', reversed_at = now()
      WHERE block_id = ${blockId}
        AND status = 'active'
        AND id = ANY(${sqlTextArray([...pickupIds])})
      RETURNING id, rooms, check_in::text AS check_in, check_out::text AS check_out
    `,
  )
  let total = 0
  for (const row of reversed) {
    total += row.rooms
    await db.execute(sql`
      UPDATE room_block_nights
      SET rooms_picked_up = GREATEST(0, rooms_picked_up - ${row.rooms})
      WHERE block_id = ${blockId}
        AND date >= ${row.check_in}::date
        AND date < ${row.check_out}::date
    `)
  }
  return total
}

/**
 * Run an accommodations-owned query, turning "the table does not exist" into a
 * clean domain error. Deployments that do not compose the Accommodations module
 * have no room blocks at all; that is a 400, not a crash.
 */
async function withAccommodations<T>(run: () => Promise<T>, message: string): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (isUndefinedTableError(error)) throw new AllocationServiceError(message, 400)
    throw error
  }
}

function isUndefinedTableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "42P01"
  )
}

function addDays(dateLocal: string, days: number): string {
  const date = new Date(`${dateLocal}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.round((end - start) / 86_400_000)
}
