/**
 * Soft-hold service for the booking-journey wizard.
 *
 * Per `docs/architecture/booking-journey-architecture.md` §5.7 +
 * §6. Decrements `availability_slots.remainingPax` while a hold is
 * live, restores it on release. The booking-journey reaper job
 * calls `releaseExpiredHolds` to clean up abandoned drafts.
 *
 * Atomicity: every operation runs inside a transaction that
 * locks the slot row, so concurrent placeHold attempts can't
 * over-allocate.
 */

import {
  type AvailabilityHold,
  availabilityHolds,
  availabilitySlots,
} from "@voyant-travel/availability/schema"
import { newId } from "@voyant-travel/db/lib/typeid"
import { and, asc, eq, inArray, isNull, lt, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

export interface PlaceAvailabilityHoldInput {
  draftId: string
  productId: string
  slotId: string
  paxCount: number
  ttlMs: number
  /** Caller-supplied hold token; defaults to a fresh typeid. */
  holdToken?: string
}

export type PlaceAvailabilityHoldOutcome =
  | { status: "ok"; hold: AvailabilityHold }
  | { status: "slot_not_found" }
  | { status: "slot_unlimited"; holdToken: string; expiresAt: Date }
  | { status: "insufficient_capacity"; remaining: number; needed: number }

/**
 * Place a soft hold on a slot. When the slot is `unlimited`, no
 * capacity decrement is needed but a hold row is still written for
 * audit + later release. The bridge returns a token the caller
 * stores on the draft (typically as `draft.id` for journey
 * convenience).
 */
export async function placeAvailabilityHold(
  db: PostgresJsDatabase,
  input: PlaceAvailabilityHoldInput,
): Promise<PlaceAvailabilityHoldOutcome> {
  if (input.paxCount <= 0) {
    return { status: "insufficient_capacity", remaining: 0, needed: input.paxCount }
  }

  return db.transaction(async (tx) => {
    const [slot] = await tx
      .select({
        id: availabilitySlots.id,
        unlimited: availabilitySlots.unlimited,
        remainingPax: availabilitySlots.remainingPax,
      })
      .from(availabilitySlots)
      .where(eq(availabilitySlots.id, input.slotId))
      .for("update")
      .limit(1)

    if (!slot) return { status: "slot_not_found" as const }

    const expiresAt = new Date(Date.now() + input.ttlMs)
    const holdToken = input.holdToken ?? `hold_${newId("availability_holds")}`

    const [existing] = await tx
      .select()
      .from(availabilityHolds)
      .where(
        and(
          eq(availabilityHolds.holdToken, holdToken),
          eq(availabilityHolds.draftId, input.draftId),
          eq(availabilityHolds.productId, input.productId),
          eq(availabilityHolds.slotId, input.slotId),
          isNull(availabilityHolds.releasedAt),
          isNull(availabilityHolds.convertedAt),
        ),
      )
      .orderBy(asc(availabilityHolds.createdAt))
      .limit(1)

    if (existing) {
      const paxDelta = input.paxCount - existing.paxCount

      if (!slot.unlimited && paxDelta > 0) {
        const remaining = slot.remainingPax ?? 0
        if (remaining < paxDelta) {
          return {
            status: "insufficient_capacity" as const,
            remaining: remaining + existing.paxCount,
            needed: input.paxCount,
          }
        }
      }

      if (!slot.unlimited && paxDelta !== 0) {
        await tx
          .update(availabilitySlots)
          .set({
            // agent-quality: raw-sql reviewed -- owner: availability; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
            remainingPax: sql`${availabilitySlots.remainingPax} - ${paxDelta}`,
            updatedAt: new Date(),
          })
          .where(eq(availabilitySlots.id, input.slotId))
      }

      const [updated] = await tx
        .update(availabilityHolds)
        .set({ paxCount: input.paxCount, expiresAt, updatedAt: new Date() })
        .where(eq(availabilityHolds.id, existing.id))
        .returning()
      if (!updated) throw new Error("placeAvailabilityHold: update returned no rows")
      return { status: "ok" as const, hold: updated }
    }

    if (slot.unlimited) {
      const [row] = await tx
        .insert(availabilityHolds)
        .values({
          draftId: input.draftId,
          holdToken,
          productId: input.productId,
          slotId: input.slotId,
          paxCount: input.paxCount,
          expiresAt,
        })
        .returning()
      if (!row) throw new Error("placeAvailabilityHold: insert returned no rows")
      return { status: "ok" as const, hold: row }
    }

    const remaining = slot.remainingPax ?? 0
    if (remaining < input.paxCount) {
      return {
        status: "insufficient_capacity" as const,
        remaining,
        needed: input.paxCount,
      }
    }

    await tx
      .update(availabilitySlots)
      .set({
        // agent-quality: raw-sql reviewed -- owner: availability; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
        remainingPax: sql`${availabilitySlots.remainingPax} - ${input.paxCount}`,
        updatedAt: new Date(),
      })
      .where(eq(availabilitySlots.id, input.slotId))

    const [row] = await tx
      .insert(availabilityHolds)
      .values({
        draftId: input.draftId,
        holdToken,
        productId: input.productId,
        slotId: input.slotId,
        paxCount: input.paxCount,
        expiresAt,
      })
      .returning()
    if (!row) throw new Error("placeAvailabilityHold: insert returned no rows")
    return { status: "ok" as const, hold: row }
  })
}

export interface ExtendAvailabilityHoldInput {
  holdToken: string
  ttlMs: number
}

export type ExtendAvailabilityHoldOutcome =
  | { status: "ok"; expiresAt: Date }
  | { status: "hold_not_found" }
  | { status: "already_released" }

export async function extendAvailabilityHold(
  db: PostgresJsDatabase,
  input: ExtendAvailabilityHoldInput,
): Promise<ExtendAvailabilityHoldOutcome> {
  const [row] = await db
    .select({
      id: availabilityHolds.id,
      releasedAt: availabilityHolds.releasedAt,
    })
    .from(availabilityHolds)
    .where(
      and(eq(availabilityHolds.holdToken, input.holdToken), isNull(availabilityHolds.convertedAt)),
    )
    .limit(1)

  if (!row) return { status: "hold_not_found" }
  if (row.releasedAt) return { status: "already_released" }

  const expiresAt = new Date(Date.now() + input.ttlMs)
  await db
    .update(availabilityHolds)
    .set({ expiresAt, updatedAt: new Date() })
    .where(eq(availabilityHolds.id, row.id))
  return { status: "ok", expiresAt }
}

/**
 * Release a hold by token. Restores capacity. Idempotent — calling
 * twice is a no-op on the second call.
 */
export async function releaseAvailabilityHold(
  db: PostgresJsDatabase,
  holdToken: string,
): Promise<void> {
  await releaseAvailabilityHoldsByToken(db, holdToken)
}

async function releaseAvailabilityHoldsByToken(
  db: PostgresJsDatabase,
  holdToken: string,
): Promise<number> {
  return db.transaction(async (tx) => {
    const holds = await tx
      .select()
      .from(availabilityHolds)
      .where(
        and(
          eq(availabilityHolds.holdToken, holdToken),
          isNull(availabilityHolds.releasedAt),
          isNull(availabilityHolds.convertedAt),
        ),
      )
      .orderBy(asc(availabilityHolds.slotId), asc(availabilityHolds.createdAt))
      .for("update")

    if (holds.length === 0) return 0

    const paxBySlot = new Map<string, number>()
    for (const hold of holds) {
      paxBySlot.set(hold.slotId, (paxBySlot.get(hold.slotId) ?? 0) + hold.paxCount)
    }

    for (const [slotId, paxCount] of paxBySlot) {
      const [slot] = await tx
        .select({ unlimited: availabilitySlots.unlimited })
        .from(availabilitySlots)
        .where(eq(availabilitySlots.id, slotId))
        .for("update")
        .limit(1)

      if (slot && !slot.unlimited) {
        await tx
          .update(availabilitySlots)
          .set({
            // agent-quality: raw-sql reviewed -- owner: availability; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
            remainingPax: sql`${availabilitySlots.remainingPax} + ${paxCount}`,
            updatedAt: new Date(),
          })
          .where(eq(availabilitySlots.id, slotId))
      }
    }

    await tx
      .update(availabilityHolds)
      .set({ releasedAt: new Date(), updatedAt: new Date() })
      .where(
        inArray(
          availabilityHolds.id,
          holds.map((hold) => hold.id),
        ),
      )

    return holds.length
  })
}

/**
 * Reaper helper — releases all holds past `expires_at` that haven't
 * already been released. Returns the count of newly-released holds.
 *
 * Locks slot-before-holds, matching `placeAvailabilityHold`. Taking the hold
 * lock first (the obvious shape, since the holds are what the sweep selects)
 * inverts that order, and a checkout placing a hold on the same slot while this
 * runs deadlocks — Postgres then aborts one of them, either the sweep or a
 * customer's checkout. The slot ids are therefore collected with an unlocked
 * read, and each slot's holds are re-selected under its slot lock.
 */
export async function releaseExpiredHolds(
  db: PostgresJsDatabase,
  cutoff: Date = new Date(),
): Promise<number> {
  return db.transaction(async (tx) => {
    const expiredPredicate = and(
      lt(availabilityHolds.expiresAt, cutoff),
      isNull(availabilityHolds.releasedAt),
      isNull(availabilityHolds.convertedAt),
    )

    // Unlocked probe purely to learn which slots are involved. Anything that
    // changes between here and the slot lock is caught by re-reading below.
    const candidates = await tx
      .selectDistinct({ slotId: availabilityHolds.slotId })
      .from(availabilityHolds)
      .where(expiredPredicate)
      .orderBy(asc(availabilityHolds.slotId))

    if (candidates.length === 0) return 0

    const now = new Date()
    let released = 0

    // Ascending slot id keeps two sweeps (or a sweep and any other multi-slot
    // writer) from taking the same pair of slot locks in opposite orders.
    for (const { slotId } of candidates) {
      const [slot] = await tx
        .select({ unlimited: availabilitySlots.unlimited })
        .from(availabilitySlots)
        .where(eq(availabilitySlots.id, slotId))
        .for("update")
        .limit(1)

      const expired = await tx
        .select()
        .from(availabilityHolds)
        .where(and(expiredPredicate, eq(availabilityHolds.slotId, slotId)))
        .orderBy(asc(availabilityHolds.createdAt))
        .for("update")

      if (expired.length === 0) continue

      const paxCount = expired.reduce((total, hold) => total + hold.paxCount, 0)

      if (slot && !slot.unlimited) {
        await tx
          .update(availabilitySlots)
          .set({
            // agent-quality: raw-sql reviewed -- owner: availability; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
            remainingPax: sql`${availabilitySlots.remainingPax} + ${paxCount}`,
            updatedAt: new Date(),
          })
          .where(eq(availabilitySlots.id, slotId))
      }

      await tx
        .update(availabilityHolds)
        .set({ releasedAt: now, updatedAt: now })
        .where(
          inArray(
            availabilityHolds.id,
            expired.map((hold) => hold.id),
          ),
        )

      released += expired.length
    }

    return released
  })
}

/**
 * When the oldest live hold becomes reapable, or `undefined` when nothing is
 * outstanding.
 *
 * This is what lets the reaper be woken instead of polled: the instant is
 * already recorded at write time, so the job can arm its own next run rather
 * than have a cadence rediscover it. A tenant with no live holds returns
 * `undefined` and stops touching its database entirely.
 */
export async function earliestOutstandingHoldExpiry(
  db: PostgresJsDatabase,
): Promise<Date | undefined> {
  const [row] = await db
    .select({ expiresAt: availabilityHolds.expiresAt })
    .from(availabilityHolds)
    .where(and(isNull(availabilityHolds.releasedAt), isNull(availabilityHolds.convertedAt)))
    .orderBy(asc(availabilityHolds.expiresAt))
    .limit(1)

  return row?.expiresAt
}

/**
 * Looks up the hold(s) for a draft id. Multiple holds per draft
 * are possible (e.g. a multi-day product touching several slots);
 * the journey reaper releases them all at once.
 */
export async function findHoldsByDraft(
  db: PostgresJsDatabase,
  draftId: string,
): Promise<AvailabilityHold[]> {
  return await db.select().from(availabilityHolds).where(eq(availabilityHolds.draftId, draftId))
}
