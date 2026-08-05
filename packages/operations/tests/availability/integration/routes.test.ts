// agent-quality: file-size exception -- owner: availability; existing coverage file stays co-located until a dedicated split preserves behavior and tests.

import { newId } from "@voyant-travel/db/lib/typeid"
import { cleanupTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { availabilityPickupPoints, availabilitySlots } from "@voyant-travel/operations/schema"
import { sql } from "drizzle-orm"
import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { optionUnits, productOptions, products } from "../../../../inventory/src/schema.js"
import { availabilityRoutes } from "../../../src/availability/routes.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const DB_AVAILABLE = !!TEST_DATABASE_URL

const db = DB_AVAILABLE ? createTestDb() : (null as never)

const json = (body: Record<string, unknown>) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

describe.skipIf(!DB_AVAILABLE)("Availability routes", () => {
  let app: Hono
  let productId: string

  beforeAll(() => {
    productId = newId("products")

    app = new Hono()
    app.use("*", async (c, next) => {
      c.set("db" as never, db)
      c.set("userId" as never, "test-user-id")
      await next()
    })
    app.route("/", availabilityRoutes)
  })

  beforeEach(async () => {
    await cleanupTestDb(db)
    await db.insert(products).values({
      id: productId,
      name: "Test Product",
      sellCurrency: "USD",
    })
  })

  describe("Rules", () => {
    const validRule = () => ({
      productId,
      timezone: "Europe/London",
      recurrenceRule: "FREQ=DAILY",
      maxCapacity: 20,
    })

    it("creates a rule", async () => {
      const res = await app.request("/rules", { method: "POST", ...json(validRule()) })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.productId).toBe(productId)
      expect(body.data.active).toBe(true)
      expect(body.data.id).toBeTruthy()
    })

    it("creates a weekly rule with explicit weekdays", async () => {
      const res = await app.request("/rules", {
        method: "POST",
        ...json({
          ...validRule(),
          recurrenceRule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR",
        }),
      })

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.recurrenceRule).toBe("FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR")
    })

    it("rejects malformed recurrence rules", async () => {
      const res = await app.request("/rules", {
        method: "POST",
        ...json({ ...validRule(), recurrenceRule: "NOT_A_RULE" }),
      })

      expect(res.status).toBe(400)
    })

    it("rejects weekly recurrence rules without weekdays", async () => {
      const res = await app.request("/rules", {
        method: "POST",
        ...json({ ...validRule(), recurrenceRule: "FREQ=WEEKLY;INTERVAL=1" }),
      })

      expect(res.status).toBe(400)
    })

    it("lists rules", async () => {
      await app.request("/rules", { method: "POST", ...json(validRule()) })
      const res = await app.request("/rules", { method: "GET" })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toBeInstanceOf(Array)
      expect(body.total).toBe(1)
    })

    it("gets a rule by id", async () => {
      const createRes = await app.request("/rules", { method: "POST", ...json(validRule()) })
      const { data: created } = await createRes.json()
      const res = await app.request(`/rules/${created.id}`, { method: "GET" })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.recurrenceRule).toBe("FREQ=DAILY")
    })

    it("updates a rule", async () => {
      const createRes = await app.request("/rules", { method: "POST", ...json(validRule()) })
      const { data: created } = await createRes.json()
      const res = await app.request(`/rules/${created.id}`, {
        method: "PATCH",
        ...json({ maxCapacity: 50 }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.maxCapacity).toBe(50)
    })

    it("deletes a rule", async () => {
      const createRes = await app.request("/rules", { method: "POST", ...json(validRule()) })
      const { data: created } = await createRes.json()
      const res = await app.request(`/rules/${created.id}`, { method: "DELETE" })
      expect(res.status).toBe(200)
      expect((await res.json()).success).toBe(true)
    })

    it("returns 404 for non-existent rule", async () => {
      const res = await app.request("/rules/avrl_00000000000000000000000000", { method: "GET" })
      expect(res.status).toBe(404)
    })

    it("batch-deletes rules", async () => {
      const r1 = await app.request("/rules", { method: "POST", ...json(validRule()) })
      const r2 = await app.request("/rules", {
        method: "POST",
        ...json({ ...validRule(), maxCapacity: 10 }),
      })
      const { data: d1 } = await r1.json()
      const { data: d2 } = await r2.json()

      const res = await app.request("/rules/batch-delete", {
        method: "POST",
        ...json({ ids: [d1.id, d2.id] }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.succeeded).toBe(2)
      expect(body.failed).toEqual([])
    })

    it("batch-updates rules", async () => {
      const r1 = await app.request("/rules", { method: "POST", ...json(validRule()) })
      const { data: d1 } = await r1.json()

      const res = await app.request("/rules/batch-update", {
        method: "POST",
        ...json({ ids: [d1.id], patch: { active: false } }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.succeeded).toBe(1)
      expect(body.data[0].active).toBe(false)
    })
  })

  describe("Start Times", () => {
    const validStartTime = () => ({ productId, startTimeLocal: "09:00" })

    it("creates a start time", async () => {
      const res = await app.request("/start-times", {
        method: "POST",
        ...json(validStartTime()),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.startTimeLocal).toBe("09:00")
    })

    it("CRUD cycle", async () => {
      const createRes = await app.request("/start-times", {
        method: "POST",
        ...json(validStartTime()),
      })
      const { data: created } = await createRes.json()

      const getRes = await app.request(`/start-times/${created.id}`, { method: "GET" })
      expect(getRes.status).toBe(200)

      const updateRes = await app.request(`/start-times/${created.id}`, {
        method: "PATCH",
        ...json({ label: "Morning" }),
      })
      expect((await updateRes.json()).data.label).toBe("Morning")

      const deleteRes = await app.request(`/start-times/${created.id}`, { method: "DELETE" })
      expect((await deleteRes.json()).success).toBe(true)
    })

    it("returns 404 for non-existent start time", async () => {
      const res = await app.request("/start-times/avst_00000000000000000000000000", {
        method: "GET",
      })
      expect(res.status).toBe(404)
    })
  })

  describe("Slots", () => {
    const validSlot = () => ({
      productId,
      dateLocal: "2025-06-15",
      startsAt: "2025-06-15T09:00:00Z",
      timezone: "Europe/London",
    })

    it("creates a slot", async () => {
      const res = await app.request("/slots", { method: "POST", ...json(validSlot()) })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.status).toBe("open")
      expect(body.data.dateLocal).toBe("2025-06-15")
    })

    it("creates a limited slot with coherent timing and capacity", async () => {
      const res = await app.request("/slots", {
        method: "POST",
        ...json({
          ...validSlot(),
          endsAt: "2025-06-15T17:00:00Z",
          initialPax: 12,
          remainingPax: 8,
        }),
      })

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.initialPax).toBe(12)
      expect(body.data.remainingPax).toBe(8)
    })

    it("rejects slots whose endsAt is before startsAt", async () => {
      const res = await app.request("/slots", {
        method: "POST",
        ...json({
          ...validSlot(),
          startsAt: "2025-06-15T18:00:00Z",
          endsAt: "2025-06-15T09:00:00Z",
        }),
      })

      expect(res.status).toBe(400)
    })

    it("rejects limited slots whose remainingPax exceeds initialPax", async () => {
      const res = await app.request("/slots", {
        method: "POST",
        ...json({
          ...validSlot(),
          initialPax: 5,
          remainingPax: 9,
        }),
      })

      expect(res.status).toBe(400)
    })

    it("rejects slots whose dateLocal does not match startsAt in the slot timezone", async () => {
      const res = await app.request("/slots", {
        method: "POST",
        ...json({
          ...validSlot(),
          dateLocal: "2025-06-16",
          startsAt: "2025-06-15T09:00:00Z",
          timezone: "UTC",
        }),
      })

      expect(res.status).toBe(400)
    })

    it("updates slot status", async () => {
      const createRes = await app.request("/slots", { method: "POST", ...json(validSlot()) })
      const { data: created } = await createRes.json()

      const res = await app.request(`/slots/${created.id}`, {
        method: "PATCH",
        ...json({ status: "sold_out" }),
      })
      expect(res.status).toBe(200)
      expect((await res.json()).data.status).toBe("sold_out")
    })

    it("returns 404 for non-existent slot", async () => {
      const res = await app.request("/slots/avsl_00000000000000000000000000", { method: "GET" })
      expect(res.status).toBe(404)
    })

    it("returns per-option-unit availability for a slot", async () => {
      // Seed a product option + two units (single cap=2, double cap=3).
      const optionId = newId("product_options")
      await db.insert(productOptions).values({
        id: optionId,
        productId,
        name: "Standard",
      })

      const singleUnitId = newId("option_units")
      const doubleUnitId = newId("option_units")
      await db.insert(optionUnits).values([
        {
          id: singleUnitId,
          optionId,
          name: "Single",
          unitType: "person",
          maxQuantity: 2,
          occupancyMax: 1,
          sortOrder: 0,
        },
        {
          id: doubleUnitId,
          optionId,
          name: "Double",
          unitType: "person",
          maxQuantity: 3,
          occupancyMax: 2,
          sortOrder: 1,
        },
      ])

      // Create a slot pinned to the option.
      const slotRes = await app.request("/slots", {
        method: "POST",
        ...json({
          productId,
          optionId,
          dateLocal: "2025-07-01",
          startsAt: "2025-07-01T09:00:00Z",
          timezone: "Europe/London",
        }),
      })
      const { data: slot } = await slotRes.json()

      // Seed two bookings: confirmed (2 singles) + cancelled (1 double, must be
      // ignored). Raw SQL so availability's integration test doesn't take a
      // compile-time dep on the bookings package.
      const bookingConfirmedId = newId("bookings")
      const bookingCancelledId = newId("bookings")
      await db.execute(
        sql`INSERT INTO bookings (id, booking_number, status, sell_currency)
            VALUES
              (${bookingConfirmedId}, 'BK-UA-CONFIRM', 'confirmed', 'USD'),
              (${bookingCancelledId}, 'BK-UA-CANCEL', 'cancelled', 'USD')`,
      )
      await db.execute(
        sql`INSERT INTO booking_items
              (id, booking_id, title, sell_currency, quantity, option_unit_id, metadata)
            VALUES
              (${newId("booking_items")}, ${bookingConfirmedId}, 'Single x2', 'USD', 2,
                ${singleUnitId}, ${JSON.stringify({ availabilitySlotId: slot.id })}::jsonb),
              (${newId("booking_items")}, ${bookingCancelledId}, 'Double x1', 'USD', 1,
                ${doubleUnitId}, ${JSON.stringify({ availabilitySlotId: slot.id })}::jsonb)`,
      )

      const res = await app.request(`/slots/${slot.id}/unit-availability`, { method: "GET" })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toHaveLength(2)

      const single = body.data.find((row: { unitName: string }) => row.unitName === "Single")
      const double = body.data.find((row: { unitName: string }) => row.unitName === "Double")
      expect(single).toMatchObject({
        optionUnitId: singleUnitId,
        initial: 2,
        reserved: 2,
        remaining: 0,
      })
      // Cancelled booking must not count — capacity stays full.
      expect(double).toMatchObject({
        optionUnitId: doubleUnitId,
        initial: 3,
        reserved: 0,
        remaining: 3,
      })
    })

    it("returns 404 unit-availability for a non-existent slot", async () => {
      const res = await app.request("/slots/avsl_00000000000000000000000000/unit-availability", {
        method: "GET",
      })
      expect(res.status).toBe(404)
    })
  })

  describe("Overview", () => {
    it("derives overview counts from the full dataset, not the first slots page", async () => {
      const productWithoutFutureSlotId = newId("products")
      await db.insert(products).values({
        id: productWithoutFutureSlotId,
        name: "No Departures",
        sellCurrency: "USD",
      })

      await db.insert(availabilitySlots).values(
        Array.from({ length: 26 }, (_, index) => ({
          id: newId("availability_slots"),
          productId,
          dateLocal: `2024-01-${String(index + 1).padStart(2, "0")}`,
          startsAt: new Date(`2024-01-${String(index + 1).padStart(2, "0")}T09:00:00.000Z`),
          timezone: "Europe/London",
          status: "closed" as const,
        })),
      )
      await db.insert(availabilitySlots).values([
        {
          id: newId("availability_slots"),
          productId,
          dateLocal: "2099-06-15",
          startsAt: new Date("2099-06-15T09:00:00.000Z"),
          timezone: "Europe/London",
          status: "open",
          remainingPax: 8,
        },
        {
          id: newId("availability_slots"),
          productId,
          dateLocal: "2099-06-16",
          startsAt: new Date("2099-06-16T09:00:00.000Z"),
          timezone: "Europe/London",
          status: "sold_out",
          remainingPax: 0,
        },
      ])
      await app.request("/rules", {
        method: "POST",
        ...json({
          productId,
          timezone: "Europe/London",
          recurrenceRule: "FREQ=DAILY",
          maxCapacity: 20,
        }),
      })
      await db.insert(availabilityPickupPoints).values({
        id: newId("availability_pickup_points"),
        productId,
        name: "Hotel Lobby",
      })

      const res = await app.request("/overview?attentionLimit=10", { method: "GET" })
      expect(res.status).toBe(200)
      const body = await res.json()

      expect(body.data.openSlotsCount).toBe(1)
      expect(body.data.constrainedSlotsCount).toBe(1)
      expect(body.data.activeRulesCount).toBe(1)
      expect(body.data.activePickupPointsCount).toBe(1)
      expect(body.data.constrainedSlots).toHaveLength(1)
      expect(body.data.constrainedSlots[0].status).toBe("sold_out")
      expect(body.data.productsWithoutUpcomingDeparturesCount).toBe(1)
      expect(body.data.productsWithoutUpcomingDepartures).toEqual([
        { id: productWithoutFutureSlotId, name: "No Departures" },
      ])
    })
  })

  describe("Closeouts", () => {
    const validCloseout = () => ({ productId, dateLocal: "2025-12-25" })

    it("creates a closeout", async () => {
      const res = await app.request("/closeouts", { method: "POST", ...json(validCloseout()) })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.dateLocal).toBe("2025-12-25")
    })

    it("CRUD cycle", async () => {
      const createRes = await app.request("/closeouts", {
        method: "POST",
        ...json(validCloseout()),
      })
      const { data: created } = await createRes.json()

      const updateRes = await app.request(`/closeouts/${created.id}`, {
        method: "PATCH",
        ...json({ reason: "Holiday" }),
      })
      expect((await updateRes.json()).data.reason).toBe("Holiday")

      const deleteRes = await app.request(`/closeouts/${created.id}`, { method: "DELETE" })
      expect((await deleteRes.json()).success).toBe(true)
    })
  })

  describe("Pickup Points", () => {
    const validPickupPoint = () => ({ productId, name: "Hotel Lobby" })

    it("creates a pickup point", async () => {
      const res = await app.request("/pickup-points", {
        method: "POST",
        ...json(validPickupPoint()),
      })
      expect(res.status).toBe(201)
      expect((await res.json()).data.name).toBe("Hotel Lobby")
    })

    it("lists filtered by productId", async () => {
      await app.request("/pickup-points", { method: "POST", ...json(validPickupPoint()) })
      const res = await app.request(`/pickup-points?productId=${productId}`, { method: "GET" })
      expect(res.status).toBe(200)
      expect((await res.json()).data.length).toBe(1)
    })

    it("returns 404 for non-existent pickup point", async () => {
      const res = await app.request("/pickup-points/avpp_00000000000000000000000000", {
        method: "GET",
      })
      expect(res.status).toBe(404)
    })
  })

  describe("Meeting Configs → Pickup Groups → Pickup Locations", () => {
    async function seedMeetingConfig() {
      const res = await app.request("/meeting-configs", {
        method: "POST",
        ...json({ productId, mode: "meet_or_pickup" }),
      })
      return (await res.json()).data
    }

    async function seedPickupGroup(meetingConfigId: string) {
      const res = await app.request("/pickup-groups", {
        method: "POST",
        ...json({ meetingConfigId, kind: "pickup", name: "Hotels" }),
      })
      return (await res.json()).data
    }

    it("creates a meeting config", async () => {
      const config = await seedMeetingConfig()
      expect(config.mode).toBe("meet_or_pickup")
      expect(config.active).toBe(true)
    })

    it("CRUD meeting config", async () => {
      const config = await seedMeetingConfig()

      const getRes = await app.request(`/meeting-configs/${config.id}`, { method: "GET" })
      expect(getRes.status).toBe(200)

      const updateRes = await app.request(`/meeting-configs/${config.id}`, {
        method: "PATCH",
        ...json({ allowCustomPickup: true }),
      })
      expect((await updateRes.json()).data.allowCustomPickup).toBe(true)

      const deleteRes = await app.request(`/meeting-configs/${config.id}`, { method: "DELETE" })
      expect((await deleteRes.json()).success).toBe(true)
    })

    it("creates a pickup group under a meeting config", async () => {
      const config = await seedMeetingConfig()
      const group = await seedPickupGroup(config.id)
      expect(group.kind).toBe("pickup")
      expect(group.meetingConfigId).toBe(config.id)
    })

    it("lists pickup groups filtered by meetingConfigId", async () => {
      const config = await seedMeetingConfig()
      await seedPickupGroup(config.id)

      const res = await app.request(`/pickup-groups?meetingConfigId=${config.id}`, {
        method: "GET",
      })
      expect(res.status).toBe(200)
      expect((await res.json()).data.length).toBe(1)
    })

    it("creates a pickup location under a group", async () => {
      const config = await seedMeetingConfig()
      const group = await seedPickupGroup(config.id)

      const res = await app.request("/pickup-locations", {
        method: "POST",
        ...json({ groupId: group.id, name: "Hilton Entrance" }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.name).toBe("Hilton Entrance")
      expect(body.data.groupId).toBe(group.id)
    })

    it("CRUD pickup location", async () => {
      const config = await seedMeetingConfig()
      const group = await seedPickupGroup(config.id)

      const createRes = await app.request("/pickup-locations", {
        method: "POST",
        ...json({ groupId: group.id, name: "Airport" }),
      })
      const { data: loc } = await createRes.json()

      const updateRes = await app.request(`/pickup-locations/${loc.id}`, {
        method: "PATCH",
        ...json({ leadTimeMinutes: 15 }),
      })
      expect((await updateRes.json()).data.leadTimeMinutes).toBe(15)

      const deleteRes = await app.request(`/pickup-locations/${loc.id}`, { method: "DELETE" })
      expect((await deleteRes.json()).success).toBe(true)
    })

    it("returns 404 for non-existent meeting config", async () => {
      const res = await app.request("/meeting-configs/avmc_00000000000000000000000000", {
        method: "GET",
      })
      expect(res.status).toBe(404)
    })
  })

  describe("Custom Pickup Areas", () => {
    async function seedMeetingConfig() {
      const res = await app.request("/meeting-configs", {
        method: "POST",
        ...json({ productId }),
      })
      return (await res.json()).data
    }

    it("creates a custom pickup area", async () => {
      const config = await seedMeetingConfig()
      const res = await app.request("/custom-pickup-areas", {
        method: "POST",
        ...json({ meetingConfigId: config.id, name: "North Shore" }),
      })
      expect(res.status).toBe(201)
      expect((await res.json()).data.name).toBe("North Shore")
    })

    it("CRUD custom pickup area", async () => {
      const config = await seedMeetingConfig()
      const createRes = await app.request("/custom-pickup-areas", {
        method: "POST",
        ...json({ meetingConfigId: config.id, name: "South Bay" }),
      })
      const { data: area } = await createRes.json()

      const updateRes = await app.request(`/custom-pickup-areas/${area.id}`, {
        method: "PATCH",
        ...json({ geographicText: "South Bay area" }),
      })
      expect((await updateRes.json()).data.geographicText).toBe("South Bay area")

      const deleteRes = await app.request(`/custom-pickup-areas/${area.id}`, { method: "DELETE" })
      expect((await deleteRes.json()).success).toBe(true)
    })
  })

  describe("Batch operations (non-existent IDs)", () => {
    it("batch-delete reports failures for non-existent IDs", async () => {
      const res = await app.request("/rules/batch-delete", {
        method: "POST",
        ...json({ ids: ["avrl_00000000000000000000000000"] }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.succeeded).toBe(0)
      expect(body.failed.length).toBe(1)
      expect(body.failed[0].error).toBe("Not found")
    })

    it("batch-update reports failures for non-existent IDs", async () => {
      const res = await app.request("/rules/batch-update", {
        method: "POST",
        ...json({ ids: ["avrl_00000000000000000000000000"], patch: { active: false } }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.succeeded).toBe(0)
      expect(body.failed.length).toBe(1)
    })
  })
})
