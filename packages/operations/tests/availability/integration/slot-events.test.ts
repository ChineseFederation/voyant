import { createEventBus } from "@voyant-travel/core"
import { newId } from "@voyant-travel/db/lib/typeid"
import { cleanupTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { availabilitySlots } from "@voyant-travel/operations/schema"
import { eq } from "drizzle-orm"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { products } from "../../../../inventory/src/schema.js"
import {
  AVAILABILITY_SLOT_CHANGED_EVENT,
  type AvailabilitySlotChangedEvent,
} from "../../../src/availability/events.js"
import {
  AvailabilitySlotRevisionConflictError,
  createSlot,
  deleteSlot,
  getSlotById,
  updateSlot,
} from "../../../src/availability/service-core.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

describe.skipIf(!DB_AVAILABLE)("availability slot events", () => {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle test client -- owner: availability; existing suppression is intentional pending typed cleanup.
  let db: any
  let productId: string

  beforeAll(() => {
    db = createTestDb()
  })

  beforeEach(async () => {
    await cleanupTestDb(db)
    productId = newId("products")
    await db.insert(products).values({
      id: productId,
      name: "Slot Event Test Product",
      sellCurrency: "USD",
      bookingMode: "date",
    })
  })

  function recordingBus() {
    const bus = createEventBus()
    const events: Array<{ event: string; data: AvailabilitySlotChangedEvent }> = []
    bus.subscribe<AvailabilitySlotChangedEvent>(AVAILABILITY_SLOT_CHANGED_EVENT, ({ data }) => {
      events.push({ event: AVAILABILITY_SLOT_CHANGED_EVENT, data })
    })
    return { bus, events }
  }

  it("createSlot emits availability.slot.changed with source='created'", async () => {
    const { bus, events } = recordingBus()
    const created = await createSlot(
      db,
      {
        productId,
        dateLocal: "2026-06-01",
        startsAt: "2026-06-01T08:00:00Z",
        timezone: "UTC",
        status: "open",
        unlimited: false,
        pastCutoff: false,
        tooEarly: false,
        remainingPax: 5,
      },
      { eventBus: bus },
    )
    expect(created).toBeDefined()
    expect(events).toHaveLength(1)
    expect(events[0]?.data.source).toBe("created")
    expect(events[0]?.data.productId).toBe(productId)
    expect(events[0]?.data.remainingPax).toBe(5)
  })

  it("deleteSlot emits availability.slot.changed with source='deleted'", async () => {
    // Seed a slot directly so we can isolate the delete event.
    const slotId = newId("availability_slots")
    await db.insert(availabilitySlots).values({
      id: slotId,
      productId,
      dateLocal: "2026-06-01",
      startsAt: new Date("2026-06-01T08:00:00Z"),
      timezone: "UTC",
      status: "open",
      unlimited: false,
      remainingPax: 5,
    })

    const { bus, events } = recordingBus()
    const deleted = await deleteSlot(db, slotId, { eventBus: bus })
    expect(deleted).toBeDefined()
    expect(events).toHaveLength(1)
    expect(events[0]?.data.source).toBe("deleted")
    expect(events[0]?.data.productId).toBe(productId)
    // Deleted slot reports zero remaining capacity per the contract.
    expect(events[0]?.data.remainingPax).toBe(0)
  })

  it("deleteSlot is a no-op (no event) when the slot doesn't exist", async () => {
    const { bus, events } = recordingBus()
    const result = await deleteSlot(db, "availability_slots_nonexistent", { eventBus: bus })
    expect(result).toBeNull()
    expect(events).toHaveLength(0)
  })

  it("updateSlot still emits with default source='manual' (back-compat)", async () => {
    const slotId = newId("availability_slots")
    await db.insert(availabilitySlots).values({
      id: slotId,
      productId,
      dateLocal: "2026-06-01",
      startsAt: new Date("2026-06-01T08:00:00Z"),
      timezone: "UTC",
      status: "open",
      unlimited: false,
      remainingPax: 5,
    })

    const { bus, events } = recordingBus()
    await updateSlot(db, slotId, { remainingPax: 3 }, { eventBus: bus })
    expect(events).toHaveLength(1)
    expect(events[0]?.data.source).toBe("manual")
  })

  it("rejects a product ownership move without emitting a misleading new-product event", async () => {
    const slotId = newId("availability_slots")
    const otherProductId = newId("products")
    await db.insert(products).values({
      id: otherProductId,
      name: "Other Slot Event Product",
      sellCurrency: "USD",
      bookingMode: "date",
    })
    await db.insert(availabilitySlots).values({
      id: slotId,
      productId,
      dateLocal: "2026-06-01",
      startsAt: new Date("2026-06-01T08:00:00Z"),
      timezone: "UTC",
      status: "open",
      unlimited: false,
      remainingPax: 5,
    })

    const { bus, events } = recordingBus()
    await expect(
      updateSlot(db, slotId, { productId: otherProductId }, { eventBus: bus }),
    ).rejects.toThrow("product ownership is immutable")
    expect(events).toHaveLength(0)
    expect(await getSlotById(db, slotId)).toMatchObject({ productId })
  })

  it("accepts an unchanged full snapshot without losing remaining or cutoff compatibility fields", async () => {
    const slotId = newId("availability_slots")
    await db.insert(availabilitySlots).values({
      id: slotId,
      productId,
      dateLocal: "2026-06-01",
      startsAt: new Date("2026-06-01T08:00:00Z"),
      timezone: "UTC",
      status: "open",
      unlimited: false,
      initialPax: 8,
      remainingPax: 5,
      initialPickups: 4,
      remainingPickups: 3,
      remainingResources: 2,
      pastCutoff: false,
      tooEarly: false,
      nights: 1,
      days: 2,
      notes: "Original note",
    })
    const current = await getSlotById(db, slotId)
    if (!current) throw new Error("compatibility test slot disappeared")

    const updated = await updateSlot(db, slotId, {
      productId: current.productId,
      itineraryId: current.itineraryId,
      optionId: current.optionId,
      facilityId: current.facilityId,
      availabilityRuleId: current.availabilityRuleId,
      startTimeId: current.startTimeId,
      dateLocal: current.dateLocal,
      startsAt: current.startsAt.toISOString(),
      endsAt: current.endsAt?.toISOString() ?? null,
      timezone: current.timezone,
      status: current.status,
      unlimited: current.unlimited,
      initialPax: current.initialPax,
      remainingPax: current.remainingPax,
      initialPickups: current.initialPickups,
      remainingPickups: current.remainingPickups,
      remainingResources: current.remainingResources,
      pastCutoff: current.pastCutoff,
      tooEarly: current.tooEarly,
      nights: current.nights,
      days: current.days,
      notes: "Updated through a full snapshot",
    })

    expect(updated).toMatchObject({
      id: slotId,
      productId,
      remainingPax: 5,
      remainingPickups: 3,
      remainingResources: 2,
      pastCutoff: false,
      tooEarly: false,
      notes: "Updated through a full snapshot",
    })
  })

  it("does not restore stale service-owned counters and flags during a notes-only full-snapshot update", async () => {
    const slotId = newId("availability_slots")
    await db.insert(availabilitySlots).values({
      id: slotId,
      productId,
      dateLocal: "2026-06-01",
      startsAt: new Date("2026-06-01T08:00:00Z"),
      timezone: "UTC",
      status: "open",
      unlimited: false,
      initialPax: 8,
      remainingPax: 5,
      initialPickups: 4,
      remainingPickups: 3,
      remainingResources: 2,
      pastCutoff: false,
      tooEarly: true,
      notes: "Original note",
    })
    const stale = await getSlotById(db, slotId)
    if (!stale) throw new Error("stale-snapshot test slot disappeared")

    await db
      .update(availabilitySlots)
      .set({
        remainingPax: 4,
        remainingPickups: 1,
        remainingResources: 0,
        pastCutoff: true,
        tooEarly: false,
      })
      .where(eq(availabilitySlots.id, slotId))

    const updated = await updateSlot(db, slotId, {
      productId: stale.productId,
      itineraryId: stale.itineraryId,
      optionId: stale.optionId,
      facilityId: stale.facilityId,
      availabilityRuleId: stale.availabilityRuleId,
      startTimeId: stale.startTimeId,
      dateLocal: stale.dateLocal,
      startsAt: stale.startsAt.toISOString(),
      endsAt: stale.endsAt?.toISOString() ?? null,
      timezone: stale.timezone,
      status: stale.status,
      unlimited: stale.unlimited,
      initialPax: stale.initialPax,
      remainingPax: stale.remainingPax,
      initialPickups: stale.initialPickups,
      remainingPickups: stale.remainingPickups,
      remainingResources: stale.remainingResources,
      pastCutoff: stale.pastCutoff,
      tooEarly: stale.tooEarly,
      nights: stale.nights,
      days: stale.days,
      notes: "Notes-only operator edit",
    })

    expect(updated).toMatchObject({
      remainingPax: 4,
      remainingPickups: 1,
      remainingResources: 0,
      pastCutoff: true,
      tooEarly: false,
      notes: "Notes-only operator edit",
    })
  })

  it("rejects a stale full snapshot before it can reopen or restore capacity", async () => {
    const slotId = newId("availability_slots")
    await db.insert(availabilitySlots).values({
      id: slotId,
      productId,
      dateLocal: "2026-06-01",
      startsAt: new Date("2026-06-01T08:00:00Z"),
      timezone: "UTC",
      status: "open",
      unlimited: false,
      initialPax: 20,
      remainingPax: 20,
      notes: "Original note",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    })
    const stale = await getSlotById(db, slotId)
    if (!stale) throw new Error("revision-conflict test slot disappeared")

    // Patch-only callers remain compatible: without a revision precondition,
    // this authoritative cancellation and capacity reduction succeeds.
    const concurrent = await updateSlot(db, slotId, {
      status: "cancelled",
      initialPax: 10,
    })
    expect(concurrent).toMatchObject({ status: "cancelled", initialPax: 10 })
    expect(concurrent?.updatedAt.getTime()).toBeGreaterThan(stale.updatedAt.getTime())

    let conflict: unknown
    try {
      await updateSlot(db, slotId, {
        updatedAt: stale.updatedAt.toISOString(),
        productId: stale.productId,
        itineraryId: stale.itineraryId,
        optionId: stale.optionId,
        facilityId: stale.facilityId,
        availabilityRuleId: stale.availabilityRuleId,
        startTimeId: stale.startTimeId,
        dateLocal: stale.dateLocal,
        startsAt: stale.startsAt.toISOString(),
        endsAt: stale.endsAt?.toISOString() ?? null,
        timezone: stale.timezone,
        status: stale.status,
        unlimited: stale.unlimited,
        initialPax: stale.initialPax,
        remainingPax: stale.remainingPax,
        initialPickups: stale.initialPickups,
        remainingPickups: stale.remainingPickups,
        remainingResources: stale.remainingResources,
        pastCutoff: stale.pastCutoff,
        tooEarly: stale.tooEarly,
        nights: stale.nights,
        days: stale.days,
        notes: "Stale notes-only edit",
      })
    } catch (error) {
      conflict = error
    }

    expect(conflict).toBeInstanceOf(AvailabilitySlotRevisionConflictError)
    expect(conflict).toMatchObject({
      expectedUpdatedAt: stale.updatedAt.toISOString(),
      current: { status: "cancelled", initialPax: 10 },
    })
    expect(await getSlotById(db, slotId)).toMatchObject({
      status: "cancelled",
      initialPax: 10,
      remainingPax: 10,
      notes: "Original note",
    })
  })
})
