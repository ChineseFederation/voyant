import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"

import { groundRoutes } from "../../../src/ground/routes.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL
const json = (body: Record<string, unknown>) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

let seq = 0
function nextSeq() {
  seq++
  return String(seq).padStart(4, "0")
}

describe.skipIf(!DB_AVAILABLE)("Ground routes", () => {
  let app: Hono
  let db: ReturnType<typeof import("@voyant-travel/db/test-utils").createTestDb>

  beforeAll(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
    await cleanupTestDb(db)

    app = new Hono()
    app.use("*", async (c, next) => {
      c.set("db" as never, db)
      c.set("userId" as never, "test-user-id")
      await next()
    })
    app.route("/", groundRoutes)
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
  })

  // ─── Seed Helpers ─────────────────────────────────────────

  async function seedResource(overrides: Record<string, unknown> = {}) {
    const { resources } = await import("../../../src/index.js")
    const [row] = await db
      .insert(resources)
      .values({ kind: "vehicle" as const, name: `Resource ${nextSeq()}`, ...overrides })
      .returning()
    return row!
  }

  async function seedBooking(overrides: Record<string, unknown> = {}) {
    const { bookings } = await import("@voyant-travel/bookings/schema")
    const [row] = await db
      .insert(bookings)
      .values({
        bookingNumber: `BK-${nextSeq()}`,
        sellCurrency: "USD",
        // `bookings.status` is NOT NULL and lost its database default in the
        // v1 status cutover, so a seeded booking has to name its own status.
        status: "confirmed" as const,
        ...overrides,
      })
      .returning()
    return row!
  }

  async function seedOperator(overrides: Record<string, unknown> = {}) {
    const body = { name: `Operator ${nextSeq()}`, ...overrides }
    const res = await app.request("/operators", { method: "POST", ...json(body) })
    expect(res.status).toBe(201)
    const { data } = await res.json()
    return data as { id: string; [k: string]: unknown }
  }

  async function seedVehicle(resourceId: string, overrides: Record<string, unknown> = {}) {
    const body = { resourceId, ...overrides }
    const res = await app.request("/vehicles", { method: "POST", ...json(body) })
    expect(res.status).toBe(201)
    const { data } = await res.json()
    return data as { id: string; resourceId: string; [k: string]: unknown }
  }

  async function seedDriver(resourceId: string, overrides: Record<string, unknown> = {}) {
    const body = { resourceId, ...overrides }
    const res = await app.request("/drivers", { method: "POST", ...json(body) })
    expect(res.status).toBe(201)
    const { data } = await res.json()
    return data as { id: string; resourceId: string; [k: string]: unknown }
  }

  async function seedTransferPreference(
    bookingId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const body = { bookingId, ...overrides }
    const res = await app.request("/transfer-preferences", { method: "POST", ...json(body) })
    expect(res.status).toBe(201)
    const { data } = await res.json()
    return data as { id: string; bookingId: string; [k: string]: unknown }
  }

  async function seedDispatch(
    transferPreferenceId: string,
    bookingId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const body = { transferPreferenceId, bookingId, ...overrides }
    const res = await app.request("/dispatches", { method: "POST", ...json(body) })
    expect(res.status).toBe(201)
    const { data } = await res.json()
    return data as { id: string; [k: string]: unknown }
  }

  /** Seeds the full chain: booking → transferPref → dispatch */
  async function seedDispatchChain(dispatchOverrides: Record<string, unknown> = {}) {
    const booking = await seedBooking()
    const transferPref = await seedTransferPreference(booking.id)
    const dispatch = await seedDispatch(transferPref.id, booking.id, dispatchOverrides)
    return { booking, transferPref, dispatch }
  }

  // ─── Operators ──────────────────────────────────────────────

  describe("Operators", () => {
    it("creates an operator with defaults", async () => {
      const op = await seedOperator()
      expect(op.id).toMatch(/^gopr_/)
      expect(op.active).toBe(true)
    })

    it("creates an operator with all fields", async () => {
      const op = await seedOperator({
        name: "Airport Transfers Ltd",
        code: "ATL",
        active: false,
        notes: "Premium operator",
      })
      expect(op.name).toBe("Airport Transfers Ltd")
      expect(op.code).toBe("ATL")
      expect(op.active).toBe(false)
      expect(op.notes).toBe("Premium operator")
    })

    it("gets an operator by id", async () => {
      const op = await seedOperator()
      const res = await app.request(`/operators/${op.id}`, { method: "GET" })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.id).toBe(op.id)
    })

    it("returns 404 for non-existent operator", async () => {
      const res = await app.request("/operators/gopr_00000000000000000000000000", { method: "GET" })
      expect(res.status).toBe(404)
    })

    it("updates an operator", async () => {
      const op = await seedOperator()
      const res = await app.request(`/operators/${op.id}`, {
        method: "PATCH",
        ...json({ name: "Updated Operator", active: false }),
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.name).toBe("Updated Operator")
      expect(data.active).toBe(false)
    })

    it("returns 404 when updating non-existent operator", async () => {
      const res = await app.request("/operators/gopr_00000000000000000000000000", {
        method: "PATCH",
        ...json({ name: "x" }),
      })
      expect(res.status).toBe(404)
    })

    it("deletes an operator", async () => {
      const op = await seedOperator()
      const res = await app.request(`/operators/${op.id}`, { method: "DELETE" })
      expect(res.status).toBe(200)

      const check = await app.request(`/operators/${op.id}`, { method: "GET" })
      expect(check.status).toBe(404)
    })

    it("returns 404 when deleting non-existent operator", async () => {
      const res = await app.request("/operators/gopr_00000000000000000000000000", {
        method: "DELETE",
      })
      expect(res.status).toBe(404)
    })
  })

  describe("Operators list & filters", () => {
    it("lists with pagination", async () => {
      await seedOperator()
      await seedOperator()
      await seedOperator()
      const res = await app.request("/operators?limit=2", { method: "GET" })
      const body = await res.json()
      expect(body.data.length).toBe(2)
      expect(body.total).toBe(3)
    })

    it("filters by active", async () => {
      await seedOperator({ active: true })
      await seedOperator({ active: false })
      const res = await app.request("/operators?active=false", { method: "GET" })
      const body = await res.json()
      expect(body.total).toBe(1)
      expect(body.data[0].active).toBe(false)
    })
  })

  // ─── Vehicles ───────────────────────────────────────────────

  describe("Vehicles", () => {
    it("creates a vehicle with defaults", async () => {
      const resource = await seedResource()
      const v = await seedVehicle(resource.id)
      expect(v.id).toMatch(/^gveh_/)
      expect(v.resourceId).toBe(resource.id)
      expect(v.category).toBe("other")
      expect(v.vehicleClass).toBe("standard")
      expect(v.active).toBe(true)
    })

    it("creates a vehicle with all fields", async () => {
      const resource = await seedResource()
      const v = await seedVehicle(resource.id, {
        category: "sedan",
        vehicleClass: "luxury",
        passengerCapacity: 4,
        checkedBagCapacity: 3,
        isAccessible: true,
        notes: "VIP sedan",
      })
      expect(v.category).toBe("sedan")
      expect(v.vehicleClass).toBe("luxury")
      expect(v.passengerCapacity).toBe(4)
      expect(v.isAccessible).toBe(true)
    })

    it("gets a vehicle by id", async () => {
      const resource = await seedResource()
      const v = await seedVehicle(resource.id)
      const res = await app.request(`/vehicles/${v.id}`, { method: "GET" })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.id).toBe(v.id)
    })

    it("returns 404 for non-existent vehicle", async () => {
      const res = await app.request("/vehicles/gveh_00000000000000000000000000", { method: "GET" })
      expect(res.status).toBe(404)
    })

    it("updates a vehicle", async () => {
      const resource = await seedResource()
      const v = await seedVehicle(resource.id)
      const res = await app.request(`/vehicles/${v.id}`, {
        method: "PATCH",
        ...json({ category: "suv", passengerCapacity: 7 }),
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.category).toBe("suv")
      expect(data.passengerCapacity).toBe(7)
    })

    it("deletes a vehicle", async () => {
      const resource = await seedResource()
      const v = await seedVehicle(resource.id)
      const res = await app.request(`/vehicles/${v.id}`, { method: "DELETE" })
      expect(res.status).toBe(200)

      const check = await app.request(`/vehicles/${v.id}`, { method: "GET" })
      expect(check.status).toBe(404)
    })
  })

  describe("Vehicles list & filters", () => {
    it("lists with pagination", async () => {
      const r1 = await seedResource()
      const r2 = await seedResource()
      const r3 = await seedResource()
      await seedVehicle(r1.id)
      await seedVehicle(r2.id)
      await seedVehicle(r3.id)
      const res = await app.request("/vehicles?limit=2", { method: "GET" })
      const body = await res.json()
      expect(body.data.length).toBe(2)
      expect(body.total).toBe(3)
    })

    it("filters by category", async () => {
      const r1 = await seedResource()
      const r2 = await seedResource()
      await seedVehicle(r1.id, { category: "sedan" })
      await seedVehicle(r2.id, { category: "bus" })
      const res = await app.request("/vehicles?category=bus", { method: "GET" })
      const body = await res.json()
      expect(body.total).toBe(1)
      expect(body.data[0].category).toBe("bus")
    })
  })

  // ─── Drivers ────────────────────────────────────────────────

  describe("Drivers", () => {
    it("creates a driver with defaults", async () => {
      const resource = await seedResource({ kind: "guide" as const })
      const d = await seedDriver(resource.id)
      expect(d.id).toMatch(/^gdrv_/)
      expect(d.resourceId).toBe(resource.id)
      expect(d.active).toBe(true)
      expect(d.isGuide).toBe(false)
    })

    it("creates a driver with all fields", async () => {
      const resource = await seedResource({ kind: "guide" as const })
      const d = await seedDriver(resource.id, {
        licenseNumber: "DL-12345",
        spokenLanguages: ["en", "es", "fr"],
        isGuide: true,
        isMeetAndGreetCapable: true,
        notes: "Experienced guide",
      })
      expect(d.licenseNumber).toBe("DL-12345")
      expect(d.spokenLanguages).toEqual(["en", "es", "fr"])
      expect(d.isGuide).toBe(true)
      expect(d.isMeetAndGreetCapable).toBe(true)
    })

    it("gets a driver by id", async () => {
      const resource = await seedResource({ kind: "guide" as const })
      const d = await seedDriver(resource.id)
      const res = await app.request(`/drivers/${d.id}`, { method: "GET" })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.id).toBe(d.id)
    })

    it("returns 404 for non-existent driver", async () => {
      const res = await app.request("/drivers/gdrv_00000000000000000000000000", { method: "GET" })
      expect(res.status).toBe(404)
    })

    it("updates a driver", async () => {
      const resource = await seedResource({ kind: "guide" as const })
      const d = await seedDriver(resource.id)
      const res = await app.request(`/drivers/${d.id}`, {
        method: "PATCH",
        ...json({ licenseNumber: "DL-99999", isGuide: true }),
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.licenseNumber).toBe("DL-99999")
      expect(data.isGuide).toBe(true)
    })

    it("deletes a driver", async () => {
      const resource = await seedResource({ kind: "guide" as const })
      const d = await seedDriver(resource.id)
      const res = await app.request(`/drivers/${d.id}`, { method: "DELETE" })
      expect(res.status).toBe(200)

      const check = await app.request(`/drivers/${d.id}`, { method: "GET" })
      expect(check.status).toBe(404)
    })
  })

  describe("Drivers list & filters", () => {
    it("lists with pagination", async () => {
      const r1 = await seedResource({ kind: "guide" as const })
      const r2 = await seedResource({ kind: "guide" as const })
      const r3 = await seedResource({ kind: "guide" as const })
      await seedDriver(r1.id)
      await seedDriver(r2.id)
      await seedDriver(r3.id)
      const res = await app.request("/drivers?limit=2", { method: "GET" })
      const body = await res.json()
      expect(body.data.length).toBe(2)
      expect(body.total).toBe(3)
    })

    it("filters by active", async () => {
      const r1 = await seedResource({ kind: "guide" as const })
      const r2 = await seedResource({ kind: "guide" as const })
      await seedDriver(r1.id, { active: true })
      await seedDriver(r2.id, { active: false })
      const res = await app.request("/drivers?active=false", { method: "GET" })
      const body = await res.json()
      expect(body.total).toBe(1)
      expect(body.data[0].active).toBe(false)
    })
  })

  // ─── Transfer Preferences ──────────────────────────────────

  describe("Transfer Preferences", () => {
    it("creates a transfer preference with defaults", async () => {
      const booking = await seedBooking()
      const tp = await seedTransferPreference(booking.id)
      expect(tp.id).toMatch(/^gtpr_/)
      expect(tp.bookingId).toBe(booking.id)
      expect(tp.serviceLevel).toBe("private")
      expect(tp.meetAndGreet).toBe(false)
    })

    it("creates with all fields", async () => {
      const booking = await seedBooking()
      const tp = await seedTransferPreference(booking.id, {
        requestedVehicleCategory: "sedan",
        requestedVehicleClass: "luxury",
        serviceLevel: "vip",
        passengerCount: 2,
        checkedBags: 4,
        meetAndGreet: true,
        driverLanguage: "en",
        pickupNotes: "Terminal 2",
        dropoffNotes: "Hotel lobby",
      })
      expect(tp.serviceLevel).toBe("vip")
      expect(tp.passengerCount).toBe(2)
      expect(tp.meetAndGreet).toBe(true)
      expect(tp.pickupNotes).toBe("Terminal 2")
    })

    it("gets a transfer preference by id", async () => {
      const booking = await seedBooking()
      const tp = await seedTransferPreference(booking.id)
      const res = await app.request(`/transfer-preferences/${tp.id}`, { method: "GET" })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.id).toBe(tp.id)
    })

    it("returns 404 for non-existent transfer preference", async () => {
      const res = await app.request("/transfer-preferences/gtpr_00000000000000000000000000", {
        method: "GET",
      })
      expect(res.status).toBe(404)
    })

    it("updates a transfer preference", async () => {
      const booking = await seedBooking()
      const tp = await seedTransferPreference(booking.id)
      const res = await app.request(`/transfer-preferences/${tp.id}`, {
        method: "PATCH",
        ...json({ serviceLevel: "shared", passengerCount: 6 }),
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.serviceLevel).toBe("shared")
      expect(data.passengerCount).toBe(6)
    })

    it("deletes a transfer preference", async () => {
      const booking = await seedBooking()
      const tp = await seedTransferPreference(booking.id)
      const res = await app.request(`/transfer-preferences/${tp.id}`, { method: "DELETE" })
      expect(res.status).toBe(200)

      const check = await app.request(`/transfer-preferences/${tp.id}`, { method: "GET" })
      expect(check.status).toBe(404)
    })
  })

  describe("Transfer Preferences list & filters", () => {
    it("lists with pagination", async () => {
      const b1 = await seedBooking()
      const b2 = await seedBooking()
      const b3 = await seedBooking()
      await seedTransferPreference(b1.id)
      await seedTransferPreference(b2.id)
      await seedTransferPreference(b3.id)
      const res = await app.request("/transfer-preferences?limit=2", { method: "GET" })
      const body = await res.json()
      expect(body.data.length).toBe(2)
      expect(body.total).toBe(3)
    })

    it("filters by bookingId", async () => {
      const b1 = await seedBooking()
      const b2 = await seedBooking()
      await seedTransferPreference(b1.id)
      await seedTransferPreference(b2.id)
      const res = await app.request(`/transfer-preferences?bookingId=${b1.id}`, { method: "GET" })
      const body = await res.json()
      expect(body.total).toBe(1)
      expect(body.data[0].bookingId).toBe(b1.id)
    })

    it("filters by serviceLevel", async () => {
      const b1 = await seedBooking()
      const b2 = await seedBooking()
      await seedTransferPreference(b1.id, { serviceLevel: "private" })
      await seedTransferPreference(b2.id, { serviceLevel: "vip" })
      const res = await app.request("/transfer-preferences?serviceLevel=vip", { method: "GET" })
      const body = await res.json()
      expect(body.total).toBe(1)
      expect(body.data[0].serviceLevel).toBe("vip")
    })
  })

  // ─── Dispatches ─────────────────────────────────────────────

  describe("Dispatches", () => {
    it("creates a dispatch with defaults", async () => {
      const { dispatch } = await seedDispatchChain()
      expect(dispatch.id).toMatch(/^gdsp_/)
      expect(dispatch.status).toBe("draft")
    })

    it("creates a dispatch with timestamps", async () => {
      const booking = await seedBooking()
      const tp = await seedTransferPreference(booking.id)
      const d = await seedDispatch(tp.id, booking.id, {
        serviceDate: "2025-06-15",
        scheduledPickupAt: "2025-06-15T08:00:00Z",
        scheduledDropoffAt: "2025-06-15T09:30:00Z",
        status: "scheduled",
        passengerCount: 3,
      })
      expect(d.status).toBe("scheduled")
      expect(d.passengerCount).toBe(3)
    })

    it("gets a dispatch by id", async () => {
      const { dispatch } = await seedDispatchChain()
      const res = await app.request(`/dispatches/${dispatch.id}`, { method: "GET" })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.id).toBe(dispatch.id)
    })

    it("returns 404 for non-existent dispatch", async () => {
      const res = await app.request("/dispatches/gdsp_00000000000000000000000000", {
        method: "GET",
      })
      expect(res.status).toBe(404)
    })

    it("updates a dispatch", async () => {
      const { dispatch } = await seedDispatchChain()
      const res = await app.request(`/dispatches/${dispatch.id}`, {
        method: "PATCH",
        ...json({ status: "assigned", notes: "Driver confirmed" }),
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.status).toBe("assigned")
      expect(data.notes).toBe("Driver confirmed")
    })

    it("deletes a dispatch", async () => {
      const { dispatch } = await seedDispatchChain()
      const res = await app.request(`/dispatches/${dispatch.id}`, { method: "DELETE" })
      expect(res.status).toBe(200)

      const check = await app.request(`/dispatches/${dispatch.id}`, { method: "GET" })
      expect(check.status).toBe(404)
    })
  })

  describe("Dispatches list & filters", () => {
    it("lists with pagination", async () => {
      await seedDispatchChain()
      await seedDispatchChain()
      await seedDispatchChain()
      const res = await app.request("/dispatches?limit=2", { method: "GET" })
      const body = await res.json()
      expect(body.data.length).toBe(2)
      expect(body.total).toBe(3)
    })

    it("filters by status", async () => {
      await seedDispatchChain({ status: "draft" })
      await seedDispatchChain({ status: "scheduled" })
      const res = await app.request("/dispatches?status=scheduled", { method: "GET" })
      const body = await res.json()
      expect(body.total).toBe(1)
      expect(body.data[0].status).toBe("scheduled")
    })

    it("filters by bookingId", async () => {
      const { booking } = await seedDispatchChain()
      await seedDispatchChain()
      const res = await app.request(`/dispatches?bookingId=${booking.id}`, { method: "GET" })
      const body = await res.json()
      expect(body.total).toBe(1)
      expect(body.data[0].bookingId).toBe(booking.id)
    })
  })

  // ─── Execution Events ──────────────────────────────────────
})
