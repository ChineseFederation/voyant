import { availabilityHolds, availabilitySlots } from "@voyant-travel/availability/schema"
import { newId } from "@voyant-travel/db/lib/typeid"
import { cleanupTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { and, eq, isNull } from "drizzle-orm"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { products } from "../../../../inventory/src/schema.js"
import {
  placeAvailabilityHold,
  releaseAvailabilityHold,
  releaseExpiredHolds,
} from "../../../src/availability/service-holds.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)

describe.skipIf(!DB_AVAILABLE)("availability hold lifecycle", () => {
  // biome-ignore lint/suspicious/noExplicitAny: owner: availability; shared integration DB helper returns the configured Drizzle client.
  let db: any
  let productId: string
  let slotId: string

  beforeAll(() => {
    db = createTestDb()
  })

  beforeEach(async () => {
    await cleanupTestDb(db)
    productId = newId("products")
    slotId = newId("availability_slots")
    await db.insert(products).values({
      id: productId,
      name: "Hold lifecycle product",
      sellCurrency: "EUR",
      bookingMode: "date",
    })
    await db.insert(availabilitySlots).values({
      id: slotId,
      productId,
      dateLocal: "2026-08-01",
      startsAt: new Date("2026-08-01T08:00:00Z"),
      timezone: "UTC",
      status: "open",
      unlimited: false,
      initialPax: 12,
      remainingPax: 12,
    })
  })

  async function remainingPax() {
    const [slot] = await db
      .select({ remainingPax: availabilitySlots.remainingPax })
      .from(availabilitySlots)
      .where(eq(availabilitySlots.id, slotId))
    return slot?.remainingPax
  }

  it("places the same hold idempotently without decrementing capacity twice", async () => {
    const input = {
      draftId: "draft_replayed",
      productId,
      slotId,
      paxCount: 2,
      ttlMs: 30 * 60 * 1000,
      holdToken: "draft_replayed",
    }

    const first = await placeAvailabilityHold(db, input)
    const replay = await placeAvailabilityHold(db, input)

    expect(first.status).toBe("ok")
    expect(replay.status).toBe("ok")
    expect(await remainingPax()).toBe(10)
    const rows = await db
      .select()
      .from(availabilityHolds)
      .where(eq(availabilityHolds.holdToken, input.holdToken))
    expect(rows).toHaveLength(1)
  })

  it("allows exactly one concurrent claimant to take the last seat", async () => {
    await db
      .update(availabilitySlots)
      .set({ initialPax: 1, remainingPax: 1 })
      .where(eq(availabilitySlots.id, slotId))

    const [first, second] = await Promise.all([
      placeAvailabilityHold(db, {
        draftId: "last_seat_a",
        productId,
        slotId,
        paxCount: 1,
        ttlMs: 30 * 60 * 1000,
        holdToken: "last_seat_a",
      }),
      placeAvailabilityHold(db, {
        draftId: "last_seat_b",
        productId,
        slotId,
        paxCount: 1,
        ttlMs: 30 * 60 * 1000,
        holdToken: "last_seat_b",
      }),
    ])

    expect([first.status, second.status].sort()).toEqual(["insufficient_capacity", "ok"])
    expect(await remainingPax()).toBe(0)
    const liveHolds = await db
      .select()
      .from(availabilityHolds)
      .where(
        and(
          eq(availabilityHolds.slotId, slotId),
          isNull(availabilityHolds.releasedAt),
          isNull(availabilityHolds.convertedAt),
        ),
      )
    expect(liveHolds).toHaveLength(1)
    expect(liveHolds[0]?.paxCount).toBe(1)
  })

  it("reconciles capacity when a replay changes the passenger count", async () => {
    const input = {
      draftId: "draft_resized",
      productId,
      slotId,
      paxCount: 2,
      ttlMs: 30 * 60 * 1000,
      holdToken: "draft_resized",
    }

    await placeAvailabilityHold(db, input)
    const increased = await placeAvailabilityHold(db, { ...input, paxCount: 4 })
    const decreased = await placeAvailabilityHold(db, { ...input, paxCount: 1 })

    expect(increased.status).toBe("ok")
    expect(decreased.status).toBe("ok")
    expect(await remainingPax()).toBe(11)
    const rows = await db
      .select()
      .from(availabilityHolds)
      .where(eq(availabilityHolds.holdToken, input.holdToken))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.paxCount).toBe(1)
  })

  it("releases every matching live hold and restores their capacity", async () => {
    await db.insert(availabilityHolds).values([
      {
        draftId: "draft_duplicate",
        holdToken: "duplicate_token",
        productId,
        slotId,
        paxCount: 2,
        expiresAt: new Date("2026-08-01T09:00:00Z"),
      },
      {
        draftId: "draft_duplicate",
        holdToken: "duplicate_token",
        productId,
        slotId,
        paxCount: 1,
        expiresAt: new Date("2026-08-01T09:00:00Z"),
      },
    ])
    await db
      .update(availabilitySlots)
      .set({ remainingPax: 9 })
      .where(eq(availabilitySlots.id, slotId))

    await releaseAvailabilityHold(db, "duplicate_token")

    expect(await remainingPax()).toBe(12)
    const liveRows = await db
      .select()
      .from(availabilityHolds)
      .where(eq(availabilityHolds.holdToken, "duplicate_token"))
    expect(liveRows.every((row: { releasedAt: Date | null }) => row.releasedAt !== null)).toBe(true)
  })

  it("releases all expired matching holds and reports every released row", async () => {
    const expiresAt = new Date("2026-07-31T23:00:00Z")
    await db.insert(availabilityHolds).values([
      {
        draftId: "draft_expired",
        holdToken: "expired_token",
        productId,
        slotId,
        paxCount: 2,
        expiresAt,
      },
      {
        draftId: "draft_expired",
        holdToken: "expired_token",
        productId,
        slotId,
        paxCount: 1,
        expiresAt,
      },
    ])
    await db
      .update(availabilitySlots)
      .set({ remainingPax: 9 })
      .where(eq(availabilitySlots.id, slotId))

    const released = await releaseExpiredHolds(db, new Date("2026-08-01T00:00:00Z"))

    expect(released).toBe(2)
    expect(await remainingPax()).toBe(12)
    const liveRows = await db
      .select()
      .from(availabilityHolds)
      .where(isNull(availabilityHolds.releasedAt))
    expect(liveRows).toHaveLength(0)
  })

  it("does not release an unexpired hold that shares an expired hold token", async () => {
    await db.insert(availabilityHolds).values([
      {
        draftId: "draft_expired_shared",
        holdToken: "shared_token",
        productId,
        slotId,
        paxCount: 2,
        expiresAt: new Date("2026-07-31T23:00:00Z"),
      },
      {
        draftId: "draft_live_shared",
        holdToken: "shared_token",
        productId,
        slotId,
        paxCount: 1,
        expiresAt: new Date("2026-08-01T01:00:00Z"),
      },
    ])
    await db
      .update(availabilitySlots)
      .set({ remainingPax: 9 })
      .where(eq(availabilitySlots.id, slotId))

    const released = await releaseExpiredHolds(db, new Date("2026-08-01T00:00:00Z"))

    expect(released).toBe(1)
    expect(await remainingPax()).toBe(11)
    const rows = await db
      .select()
      .from(availabilityHolds)
      .where(eq(availabilityHolds.holdToken, "shared_token"))
    expect(
      rows.find((row: { draftId: string }) => row.draftId === "draft_expired_shared")?.releasedAt,
    ).toBeInstanceOf(Date)
    expect(
      rows.find((row: { draftId: string }) => row.draftId === "draft_live_shared")?.releasedAt,
    ).toBeNull()
  })
})
