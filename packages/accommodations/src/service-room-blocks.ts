/**
 * Room-block allotment service. Owns the pickup ledger and the per-night
 * counter projection. See RFC voyant#1489 §5.
 *
 * Atomicity: pickup / reversal / cutoff each run inside a transaction that
 * row-locks the affected `room_block_nights` (and the block header) so
 * concurrent pickups cannot oversell. The `room_block_nights` CHECK
 * constraints (`picked_up + released <= held`) are the loud backstop.
 *
 * Counters are a MAINTAINED PROJECTION of the append-only `room_block_pickups`
 * ledger — updated in the same transaction as each ledger write. Pickup
 * progress (none / partial / full) is DERIVED from the counters at read time,
 * never stored on the block header.
 */

import {
  allotmentPickupProgress,
  allotmentRemaining,
  eachDateInRange,
  isClosedAllotmentStatus,
  type PickupProgress,
} from "@voyant-travel/allotments"
import { and, eq, inArray, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { roomTypes } from "./schema-inventory.js"
import {
  type RoomBlock,
  type RoomBlockPickup,
  roomBlockNights,
  roomBlockPickups,
  roomBlocks,
} from "./schema-room-blocks.js"

/**
 * The night dates a stay occupies (inclusive check-in → exclusive check-out).
 * Thin alias over the shared allotment slot enumeration. See @voyant-travel/allotments.
 */
export function eachNight(checkIn: string, checkOut: string): string[] {
  return eachDateInRange(checkIn, checkOut)
}

export interface CreateRoomBlockInput {
  roomTypeId: string
  name: string
  currency: string
  programId?: string
  supplierId?: string
  propertyId?: string
  netRateCents?: number
  sellRateCents?: number
  optionDate?: string
  cutoffDate?: string
  notes?: string
}

/** Create a block header (starts in `inquiry`; nights are set separately). */
export async function createRoomBlock(
  db: PostgresJsDatabase,
  input: CreateRoomBlockInput,
): Promise<RoomBlock> {
  const [roomType] = await db
    .select({ id: roomTypes.id })
    .from(roomTypes)
    .where(eq(roomTypes.id, input.roomTypeId))
    .limit(1)
  if (!roomType) {
    throw new RoomBlockRoomTypeNotFoundError(input.roomTypeId)
  }
  const [block] = await db.insert(roomBlocks).values(input).returning()
  if (!block) throw new Error("createRoomBlock: insert returned no rows")
  return block
}

export class RoomBlockRoomTypeNotFoundError extends Error {
  readonly roomTypeId: string

  constructor(roomTypeId: string) {
    super(`Room type "${roomTypeId}" was not found.`)
    this.name = "RoomBlockRoomTypeNotFoundError"
    this.roomTypeId = roomTypeId
  }
}

export async function getRoomBlock(
  db: PostgresJsDatabase,
  blockId: string,
): Promise<RoomBlock | null> {
  const [block] = await db.select().from(roomBlocks).where(eq(roomBlocks.id, blockId)).limit(1)
  return block ?? null
}

export interface RoomBlockNightInput {
  date: string
  roomsHeld: number
  netRateCentsOverride?: number
  sellRateCentsOverride?: number
}

/**
 * Set the held inventory per night (upsert). Only `rooms_held` and the rate
 * overrides are caller-controlled; pickup/release counters are owned by the
 * lifecycle functions and never set here.
 */
export async function setRoomBlockNights(
  db: PostgresJsDatabase,
  blockId: string,
  nights: RoomBlockNightInput[],
): Promise<void> {
  if (nights.length === 0) return
  await db
    .insert(roomBlockNights)
    .values(nights.map((n) => ({ blockId, ...n })))
    .onConflictDoUpdate({
      target: [roomBlockNights.blockId, roomBlockNights.date],
      set: {
        roomsHeld: sql`excluded.rooms_held`,
        netRateCentsOverride: sql`excluded.net_rate_cents_override`,
        sellRateCentsOverride: sql`excluded.sell_rate_cents_override`,
      },
    })
}

export interface RoomBlockPickupInput {
  blockId: string
  bookingId?: string
  stayBookingItemId?: string
  checkIn: string
  checkOut: string
  rooms?: number
}

export type RoomBlockPickupOutcome =
  | { status: "ok"; pickup: RoomBlockPickup; idempotent: boolean }
  | { status: "invalid_range" }
  | { status: "block_not_found" }
  | { status: "block_not_active" }
  | { status: "night_unavailable"; date: string; remaining: number; needed: number }

/**
 * Record a pickup against a block (a booking confirmed into the held
 * inventory). Idempotent on `stayBookingItemId`: re-processing the same stay
 * item is a no-op that returns the existing active pickup.
 */
export async function pickupRoomBlock(
  db: PostgresJsDatabase,
  input: RoomBlockPickupInput,
): Promise<RoomBlockPickupOutcome> {
  const rooms = input.rooms ?? 1
  const nights = eachNight(input.checkIn, input.checkOut)
  if (rooms <= 0 || nights.length === 0) return { status: "invalid_range" }

  return db.transaction(async (tx) => {
    const [block] = await tx
      .select({ id: roomBlocks.id, status: roomBlocks.status })
      .from(roomBlocks)
      .where(eq(roomBlocks.id, input.blockId))
      .for("update")
      .limit(1)
    if (!block) return { status: "block_not_found" as const }
    if (isClosedAllotmentStatus(block.status)) {
      return { status: "block_not_active" as const }
    }

    // Idempotency: an active pickup already exists for this stay item.
    if (input.stayBookingItemId) {
      const [existing] = await tx
        .select()
        .from(roomBlockPickups)
        .where(
          and(
            eq(roomBlockPickups.stayBookingItemId, input.stayBookingItemId),
            eq(roomBlockPickups.status, "active"),
          ),
        )
        .limit(1)
      if (existing) return { status: "ok" as const, pickup: existing, idempotent: true }
    }

    // Lock the affected nights and verify capacity before incrementing.
    const nightRows = await tx
      .select()
      .from(roomBlockNights)
      .where(and(eq(roomBlockNights.blockId, input.blockId), inArray(roomBlockNights.date, nights)))
      .for("update")
    const byDate = new Map(nightRows.map((n) => [n.date, n]))

    for (const date of nights) {
      const night = byDate.get(date)
      const remaining = night ? night.roomsHeld - night.roomsPickedUp - night.roomsReleased : 0
      if (!night || remaining < rooms) {
        return { status: "night_unavailable" as const, date, remaining, needed: rooms }
      }
    }

    for (const date of nights) {
      await tx
        .update(roomBlockNights)
        .set({
          // agent-quality: raw-sql reviewed -- owner: accommodations; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
          roomsPickedUp: sql`${roomBlockNights.roomsPickedUp} + ${rooms}`,
        })
        .where(and(eq(roomBlockNights.blockId, input.blockId), eq(roomBlockNights.date, date)))
    }

    const [pickup] = await tx
      .insert(roomBlockPickups)
      .values({
        blockId: input.blockId,
        bookingId: input.bookingId,
        stayBookingItemId: input.stayBookingItemId,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        rooms,
      })
      .returning()
    if (!pickup) throw new Error("pickupRoomBlock: insert returned no rows")
    return { status: "ok" as const, pickup, idempotent: false }
  })
}

export interface RoomBlockReversalInput {
  /** When set, the pickup must belong to this block or it is treated as not found. */
  blockId?: string
  pickupId?: string
  stayBookingItemId?: string
}

export type RoomBlockReversalOutcome =
  | { status: "ok"; pickup: RoomBlockPickup }
  | { status: "pickup_not_found" }

/**
 * Reverse a pickup (booking cancelled / rooms reduced). The reversal
 * decrements `rooms_picked_up`, returning rooms to `remaining` — NOT to
 * `rooms_released`. The ledger row is marked `reversed`, never deleted.
 */
export async function reverseRoomBlockPickup(
  db: PostgresJsDatabase,
  input: RoomBlockReversalInput,
): Promise<RoomBlockReversalOutcome> {
  if (!input.pickupId && !input.stayBookingItemId) return { status: "pickup_not_found" }

  return db.transaction(async (tx) => {
    const condition = input.pickupId
      ? eq(roomBlockPickups.id, input.pickupId)
      : and(
          eq(roomBlockPickups.stayBookingItemId, input.stayBookingItemId as string),
          eq(roomBlockPickups.status, "active"),
        )
    const [pickup] = await tx
      .select()
      .from(roomBlockPickups)
      .where(condition)
      .for("update")
      .limit(1)
    if (!pickup || pickup.status === "reversed") return { status: "pickup_not_found" as const }
    // Scope to the requested block: never reverse a pickup that belongs to a
    // different block just because the caller knows its id.
    if (input.blockId && pickup.blockId !== input.blockId) {
      return { status: "pickup_not_found" as const }
    }

    for (const date of eachNight(pickup.checkIn, pickup.checkOut)) {
      await tx
        .update(roomBlockNights)
        .set({
          // agent-quality: raw-sql reviewed -- owner: accommodations; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
          roomsPickedUp: sql`${roomBlockNights.roomsPickedUp} - ${pickup.rooms}`,
        })
        .where(and(eq(roomBlockNights.blockId, pickup.blockId), eq(roomBlockNights.date, date)))
    }

    const [reversed] = await tx
      .update(roomBlockPickups)
      .set({ status: "reversed", reversedAt: new Date() })
      .where(eq(roomBlockPickups.id, pickup.id))
      .returning()
    if (!reversed) throw new Error("reverseRoomBlockPickup: update returned no rows")
    return { status: "ok" as const, pickup: reversed }
  })
}

export async function getRoomBlockPickupReversalOutcome(
  db: PostgresJsDatabase,
  input: RoomBlockReversalInput,
): Promise<RoomBlockReversalOutcome> {
  if (!input.pickupId && !input.stayBookingItemId) return { status: "pickup_not_found" }
  const condition = input.pickupId
    ? eq(roomBlockPickups.id, input.pickupId)
    : eq(roomBlockPickups.stayBookingItemId, input.stayBookingItemId as string)
  const [pickup] = await db.select().from(roomBlockPickups).where(condition).limit(1)
  if (!pickup || pickup.blockId !== input.blockId || pickup.status !== "reversed") {
    return { status: "pickup_not_found" }
  }
  return { status: "ok", pickup }
}

export interface RoomBlockCutoffInput {
  blockId: string
}

export type RoomBlockCutoffOutcome =
  | { status: "ok"; releasedRooms: number; block: RoomBlock }
  | { status: "block_not_found" }

/**
 * Cutoff reached: release every still-unpicked room on each night back to the
 * property and move the block to `released`. `released += held - picked -
 * released` per night, so `remaining` falls to zero for unpicked inventory.
 */
export async function releaseRoomBlockAtCutoff(
  db: PostgresJsDatabase,
  input: RoomBlockCutoffInput,
): Promise<RoomBlockCutoffOutcome> {
  return db.transaction(async (tx) => {
    const [block] = await tx
      .select()
      .from(roomBlocks)
      .where(eq(roomBlocks.id, input.blockId))
      .for("update")
      .limit(1)
    if (!block) return { status: "block_not_found" as const }

    const nightRows = await tx
      .select()
      .from(roomBlockNights)
      .where(eq(roomBlockNights.blockId, input.blockId))
      .for("update")

    let releasedRooms = 0
    for (const night of nightRows) {
      const unpicked = night.roomsHeld - night.roomsPickedUp - night.roomsReleased
      if (unpicked <= 0) continue
      releasedRooms += unpicked
      await tx
        .update(roomBlockNights)
        .set({ roomsReleased: night.roomsReleased + unpicked })
        .where(eq(roomBlockNights.id, night.id))
    }

    const [updated] = await tx
      .update(roomBlocks)
      .set({ status: "released", updatedAt: new Date() })
      .where(eq(roomBlocks.id, input.blockId))
      .returning()
    if (!updated) throw new Error("releaseRoomBlockAtCutoff: update returned no rows")
    return { status: "ok" as const, releasedRooms, block: updated }
  })
}

export type { PickupProgress } from "@voyant-travel/allotments"

export interface RoomBlockSummary {
  blockId: string
  status: RoomBlock["status"]
  totalHeld: number
  totalPickedUp: number
  totalReleased: number
  totalRemaining: number
  /** DERIVED from counters — not a stored header status. */
  pickupProgress: PickupProgress
}

/** The canonical ops view: held / picked / released / remaining for a block. */
export async function summarizeRoomBlock(
  db: PostgresJsDatabase,
  blockId: string,
): Promise<RoomBlockSummary | null> {
  const [block] = await db
    .select({ id: roomBlocks.id, status: roomBlocks.status })
    .from(roomBlocks)
    .where(eq(roomBlocks.id, blockId))
    .limit(1)
  if (!block) return null

  const nightRows = await db
    .select()
    .from(roomBlockNights)
    .where(eq(roomBlockNights.blockId, blockId))

  let totalHeld = 0
  let totalPickedUp = 0
  let totalReleased = 0
  for (const n of nightRows) {
    totalHeld += n.roomsHeld
    totalPickedUp += n.roomsPickedUp
    totalReleased += n.roomsReleased
  }
  const counters = { held: totalHeld, pickedUp: totalPickedUp, released: totalReleased }
  const totalRemaining = allotmentRemaining(counters)
  const pickupProgress = allotmentPickupProgress(counters)

  return {
    blockId: block.id,
    status: block.status,
    totalHeld,
    totalPickedUp,
    totalReleased,
    totalRemaining,
    pickupProgress,
  }
}

export const roomBlockService = {
  createRoomBlock,
  getRoomBlock,
  setRoomBlockNights,
  pickupRoomBlock,
  reverseRoomBlockPickup,
  releaseRoomBlockAtCutoff,
  summarizeRoomBlock,
}
