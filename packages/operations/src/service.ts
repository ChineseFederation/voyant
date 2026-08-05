import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import {
  type AvailabilityHold,
  type AvailabilitySlot,
  availabilityHolds,
} from "./availability/schema.js"
import { availabilityService } from "./availability/service.js"
import {
  type PlaceAvailabilityHoldInput,
  type PlaceAvailabilityHoldOutcome,
  placeAvailabilityHold,
  releaseAvailabilityHold,
} from "./availability/service-holds.js"
import { groundService } from "./ground/service.js"
import { placesService } from "./places/index.js"
import { resourcesService } from "./resources/service.js"

export interface CheckOperationalAvailabilityInput {
  slotId: string
}

export type CheckOperationalAvailabilityOutcome =
  | {
      status: "available"
      slot: AvailabilitySlot
      remainingPax: number | null
      unlimited: boolean
    }
  | { status: "unavailable"; reason: "slot_not_found" | "closed" | "sold_out" }

export async function checkOperationalAvailability(
  db: PostgresJsDatabase,
  input: CheckOperationalAvailabilityInput,
): Promise<CheckOperationalAvailabilityOutcome> {
  const slot = await availabilityService.getSlotById(db, input.slotId)
  if (!slot) return { status: "unavailable", reason: "slot_not_found" }
  if (slot.status !== "open") return { status: "unavailable", reason: "closed" }
  if (!slot.unlimited && (slot.remainingPax ?? 0) <= 0) {
    return { status: "unavailable", reason: "sold_out" }
  }
  return {
    status: "available",
    slot,
    remainingPax: slot.remainingPax,
    unlimited: slot.unlimited,
  }
}

export type CreateResourceHoldInput = PlaceAvailabilityHoldInput
export type CreateResourceHoldOutcome = PlaceAvailabilityHoldOutcome

export async function createResourceHold(
  db: PostgresJsDatabase,
  input: CreateResourceHoldInput,
): Promise<CreateResourceHoldOutcome> {
  return placeAvailabilityHold(db, input)
}

export interface ConfirmResourceHoldInput {
  holdToken: string
}

export type ConfirmResourceHoldOutcome =
  | { status: "ok"; hold: AvailabilityHold }
  | { status: "hold_not_found" }
  | { status: "already_released" }
  | { status: "expired" }

export async function confirmResourceHold(
  db: PostgresJsDatabase,
  input: ConfirmResourceHoldInput,
): Promise<ConfirmResourceHoldOutcome> {
  const [hold] = await db
    .select()
    .from(availabilityHolds)
    .where(eq(availabilityHolds.holdToken, input.holdToken))
    .limit(1)

  if (!hold) return { status: "hold_not_found" }
  if (hold.releasedAt || hold.convertedAt) return { status: "already_released" }
  if (hold.expiresAt.getTime() <= Date.now()) return { status: "expired" }
  return { status: "ok", hold }
}

export interface ReleaseResourceHoldInput {
  holdToken: string
}

export async function releaseResourceHold(
  db: PostgresJsDatabase,
  input: ReleaseResourceHoldInput,
): Promise<void> {
  await releaseAvailabilityHold(db, input.holdToken)
}

export const operationsService = {
  checkOperationalAvailability,
  createResourceHold,
  confirmResourceHold,
  releaseResourceHold,
  availability: availabilityService,
  resources: resourcesService,
  ground: groundService,
  places: placesService,
}
