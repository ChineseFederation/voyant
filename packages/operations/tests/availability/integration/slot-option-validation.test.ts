import { availabilityRules, availabilitySlots } from "@voyant-travel/availability/schema"
import { newId } from "@voyant-travel/db/lib/typeid"
import { cleanupTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { RequestValidationError } from "@voyant-travel/hono"
import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { productOptions, products } from "../../../../inventory/src/schema.js"
import {
  createRule,
  createSlot,
  updateRule,
  updateSlot,
} from "../../../src/availability/service-core.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const DB_AVAILABLE = !!TEST_DATABASE_URL

const db = DB_AVAILABLE ? createTestDb() : (null as never)

async function seedProduct(name: string, bookingMode = "date") {
  const productId = newId("products")
  await db.insert(products).values({
    id: productId,
    name,
    sellCurrency: "USD",
    bookingMode,
  })
  return productId
}

async function seedOption(productId: string, name: string) {
  const optionId = newId("product_options")
  await db.insert(productOptions).values({
    id: optionId,
    productId,
    name,
    status: "active",
    isDefault: true,
  })
  return optionId
}

function slotInput(productId: string, overrides: Partial<Parameters<typeof createSlot>[1]> = {}) {
  return {
    productId,
    dateLocal: "2026-09-10",
    startsAt: "2026-09-10T09:00:00.000Z",
    timezone: "Europe/London",
    ...overrides,
  }
}

describe.skipIf(!DB_AVAILABLE)("availability slot option validation", () => {
  beforeEach(async () => {
    await cleanupTestDb(db)
  })

  it("allows product-level slots without an option", async () => {
    const productId = await seedProduct("Product-level trip")

    const slot = await createSlot(db, slotInput(productId))

    expect(slot?.productId).toBe(productId)
    expect(slot?.optionId).toBeNull()
  })

  it("seeds remaining pax to initial pax for a bounded slot when omitted", async () => {
    // A bounded slot created without an explicit remainingPax must start at
    // full capacity. Otherwise remaining_pax lands NULL and the booking
    // engine's `remaining_pax ?? 0` treats it as sold out from birth (#2833).
    const productId = await seedProduct("Bounded trip")

    const slot = await createSlot(db, slotInput(productId, { initialPax: 50, unlimited: false }))

    expect(slot?.initialPax).toBe(50)
    expect(slot?.remainingPax).toBe(50)
  })

  it("honors an explicit remaining pax below initial pax", async () => {
    const productId = await seedProduct("Partially sold trip")

    const slot = await createSlot(
      db,
      slotInput(productId, { initialPax: 50, remainingPax: 20, unlimited: false }),
    )

    expect(slot?.remainingPax).toBe(20)
  })

  it("creates and updates one Bucharest departure without losing operator fields", async () => {
    const productId = await seedProduct("Bucharest rooms")
    const created = await createSlot(db, {
      productId,
      dateLocal: "2026-10-12",
      startsAt: "2026-10-12T06:30:00.000Z",
      endsAt: "2026-10-14T15:00:00.000Z",
      timezone: "Europe/Bucharest",
      status: "open",
      unlimited: false,
      initialPax: 20,
      remainingPax: 17,
      nights: 2,
      days: 3,
      notes: "Meet at the station",
    })
    if (!created) throw new Error("failed to create Bucharest departure")

    const updated = await updateSlot(db, created.id, {
      initialPax: 25,
      endsAt: "2026-10-15T15:00:00.000Z",
      nights: 3,
      days: 4,
      status: "closed",
      notes: "Meet at the station - platform 2",
      timezone: "Europe/Bucharest",
    })

    expect(updated).toMatchObject({
      id: created.id,
      dateLocal: "2026-10-12",
      startsAt: new Date("2026-10-12T06:30:00.000Z"),
      endsAt: new Date("2026-10-15T15:00:00.000Z"),
      timezone: "Europe/Bucharest",
      status: "closed",
      initialPax: 25,
      // Three places were consumed before the capacity increase, so the
      // derived remainder grows from 17 to 22 instead of resetting to 25.
      remainingPax: 22,
      nights: 3,
      days: 4,
      notes: "Meet at the station - platform 2",
    })
  })

  it("leaves remaining pax null for an unlimited slot", async () => {
    const productId = await seedProduct("Unlimited trip")

    const slot = await createSlot(db, slotInput(productId, { initialPax: 50, unlimited: true }))

    expect(slot?.remainingPax).toBeNull()
  })

  it("persists an explicit option that belongs to the slot product", async () => {
    const productId = await seedProduct("Priced trip")
    const optionId = await seedOption(productId, "Standard")

    const slot = await createSlot(db, slotInput(productId, { optionId }))

    expect(slot?.optionId).toBe(optionId)
  })

  it("rejects an explicit option from a different product", async () => {
    const productId = await seedProduct("Priced trip")
    const otherProductId = await seedProduct("Other trip")
    const otherOptionId = await seedOption(otherProductId, "Other standard")

    await expect(
      createSlot(db, slotInput(productId, { optionId: otherOptionId })),
    ).rejects.toBeInstanceOf(RequestValidationError)
  })

  it("repairs an existing product-level slot by saving a valid option", async () => {
    const productId = await seedProduct("Repairable trip")
    const optionId = await seedOption(productId, "Standard")
    const slot = await createSlot(db, slotInput(productId))
    if (!slot) throw new Error("failed to create slot")

    const updated = await updateSlot(db, slot.id, { productId, optionId })

    expect(updated?.optionId).toBe(optionId)
    const [stored] = await db
      .select({ optionId: availabilitySlots.optionId })
      .from(availabilitySlots)
      .where(eq(availabilitySlots.id, slot.id))
    expect(stored?.optionId).toBe(optionId)
  })

  it("rejects a product change that would leave the slot option on the wrong product", async () => {
    const productId = await seedProduct("Original trip")
    const optionId = await seedOption(productId, "Standard")
    const otherProductId = await seedProduct("Other trip")
    const slot = await createSlot(db, slotInput(productId, { optionId }))
    if (!slot) throw new Error("failed to create slot")

    await expect(updateSlot(db, slot.id, { productId: otherProductId })).rejects.toBeInstanceOf(
      RequestValidationError,
    )
  })

  it("rejects static slots for dynamic products", async () => {
    const productId = await seedProduct("Open-ended activity", "open")

    await expect(createSlot(db, slotInput(productId))).rejects.toBeInstanceOf(
      RequestValidationError,
    )
  })

  it("rejects slots whose end is before the start", async () => {
    const productId = await seedProduct("Badly timed trip")

    await expect(
      createSlot(
        db,
        slotInput(productId, {
          startsAt: "2026-09-10T18:00:00.000Z",
          endsAt: "2026-09-10T09:00:00.000Z",
        }),
      ),
    ).rejects.toBeInstanceOf(RequestValidationError)
  })

  it("rejects limited slots whose remaining pax exceeds initial pax", async () => {
    const productId = await seedProduct("Overfilled trip")

    await expect(
      createSlot(db, slotInput(productId, { initialPax: 5, remainingPax: 9 })),
    ).rejects.toBeInstanceOf(RequestValidationError)
  })

  it("rejects slots whose local date disagrees with startsAt and timezone", async () => {
    const productId = await seedProduct("Mismatched date trip")

    await expect(
      createSlot(
        db,
        slotInput(productId, {
          dateLocal: "2026-09-11",
          startsAt: "2026-09-10T09:00:00.000Z",
          timezone: "UTC",
        }),
      ),
    ).rejects.toBeInstanceOf(RequestValidationError)
  })

  it("rejects partial slot updates that would make the local date inconsistent", async () => {
    const productId = await seedProduct("Patch-validated trip")
    const slot = await createSlot(db, slotInput(productId))
    if (!slot) throw new Error("failed to create slot")

    await expect(updateSlot(db, slot.id, { dateLocal: "2026-09-11" })).rejects.toBeInstanceOf(
      RequestValidationError,
    )
  })

  it("rejects active recurrence rules for dynamic products", async () => {
    const productId = await seedProduct("Hotel stay", "stay")

    await expect(
      createRule(db, {
        productId,
        timezone: "UTC",
        recurrenceRule: "FREQ=DAILY",
        maxCapacity: 10,
        active: true,
      }),
    ).rejects.toBeInstanceOf(RequestValidationError)

    const [inactiveRule] = await db
      .insert(availabilityRules)
      .values({
        productId,
        timezone: "UTC",
        recurrenceRule: "FREQ=DAILY",
        maxCapacity: 10,
        active: false,
      })
      .returning()

    await expect(updateRule(db, inactiveRule.id, { active: true })).rejects.toBeInstanceOf(
      RequestValidationError,
    )
  })

  it("rejects malformed recurrence rules in service calls", async () => {
    const productId = await seedProduct("Rule-validated trip")

    await expect(
      createRule(db, {
        productId,
        timezone: "UTC",
        recurrenceRule: "NOT_A_RULE",
        maxCapacity: 10,
      }),
    ).rejects.toBeInstanceOf(RequestValidationError)

    await expect(
      createRule(db, {
        productId,
        timezone: "UTC",
        recurrenceRule: "FREQ=WEEKLY;INTERVAL=1",
        maxCapacity: 10,
      }),
    ).rejects.toBeInstanceOf(RequestValidationError)
  })
})
