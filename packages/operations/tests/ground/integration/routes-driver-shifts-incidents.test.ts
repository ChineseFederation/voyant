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

  describe("Driver Shifts", () => {
    it("creates a driver shift with defaults", async () => {
      const resource = await seedResource({ kind: "guide" as const })
      const driver = await seedDriver(resource.id)
      const res = await app.request("/driver-shifts", {
        method: "POST",
        ...json({
          driverId: driver.id,
          startsAt: "2025-06-15T06:00:00Z",
          endsAt: "2025-06-15T18:00:00Z",
        }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.id).toMatch(/^gdsh_/)
      expect(data.status).toBe("scheduled")
    })

    it("creates with all fields", async () => {
      const resource = await seedResource({ kind: "guide" as const })
      const driver = await seedDriver(resource.id)
      const operator = await seedOperator()
      const res = await app.request("/driver-shifts", {
        method: "POST",
        ...json({
          driverId: driver.id,
          operatorId: operator.id,
          startsAt: "2025-06-15T06:00:00Z",
          endsAt: "2025-06-15T18:00:00Z",
          status: "available",
          notes: "Morning shift",
        }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.status).toBe("available")
      expect(data.notes).toBe("Morning shift")
    })

    it("gets a driver shift by id", async () => {
      const resource = await seedResource({ kind: "guide" as const })
      const driver = await seedDriver(resource.id)
      const createRes = await app.request("/driver-shifts", {
        method: "POST",
        ...json({
          driverId: driver.id,
          startsAt: "2025-06-15T06:00:00Z",
          endsAt: "2025-06-15T18:00:00Z",
        }),
      })
      const { data: shift } = await createRes.json()

      const res = await app.request(`/driver-shifts/${shift.id}`, { method: "GET" })
      expect(res.status).toBe(200)
    })

    it("returns 404 for non-existent shift", async () => {
      const res = await app.request("/driver-shifts/gdsh_00000000000000000000000000", {
        method: "GET",
      })
      expect(res.status).toBe(404)
    })

    it("updates a driver shift", async () => {
      const resource = await seedResource({ kind: "guide" as const })
      const driver = await seedDriver(resource.id)
      const createRes = await app.request("/driver-shifts", {
        method: "POST",
        ...json({
          driverId: driver.id,
          startsAt: "2025-06-15T06:00:00Z",
          endsAt: "2025-06-15T18:00:00Z",
        }),
      })
      const { data: shift } = await createRes.json()

      const res = await app.request(`/driver-shifts/${shift.id}`, {
        method: "PATCH",
        ...json({ status: "on_duty", notes: "Started early" }),
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.status).toBe("on_duty")
      expect(data.notes).toBe("Started early")
    })

    it("deletes a driver shift", async () => {
      const resource = await seedResource({ kind: "guide" as const })
      const driver = await seedDriver(resource.id)
      const createRes = await app.request("/driver-shifts", {
        method: "POST",
        ...json({
          driverId: driver.id,
          startsAt: "2025-06-15T06:00:00Z",
          endsAt: "2025-06-15T18:00:00Z",
        }),
      })
      const { data: shift } = await createRes.json()

      const res = await app.request(`/driver-shifts/${shift.id}`, { method: "DELETE" })
      expect(res.status).toBe(200)
    })
  })

  describe("Driver Shifts list & filters", () => {
    it("lists filtered by driverId", async () => {
      const resource = await seedResource({ kind: "guide" as const })
      const driver = await seedDriver(resource.id)
      await app.request("/driver-shifts", {
        method: "POST",
        ...json({
          driverId: driver.id,
          startsAt: "2025-06-15T06:00:00Z",
          endsAt: "2025-06-15T18:00:00Z",
        }),
      })
      await app.request("/driver-shifts", {
        method: "POST",
        ...json({
          driverId: driver.id,
          startsAt: "2025-06-16T06:00:00Z",
          endsAt: "2025-06-16T18:00:00Z",
        }),
      })
      const res = await app.request(`/driver-shifts?driverId=${driver.id}`, { method: "GET" })
      const body = await res.json()
      expect(body.total).toBe(2)
    })

    it("filters by status", async () => {
      const r1 = await seedResource({ kind: "guide" as const })
      const r2 = await seedResource({ kind: "guide" as const })
      const d1 = await seedDriver(r1.id)
      const d2 = await seedDriver(r2.id)
      await app.request("/driver-shifts", {
        method: "POST",
        ...json({
          driverId: d1.id,
          startsAt: "2025-06-15T06:00:00Z",
          endsAt: "2025-06-15T18:00:00Z",
          status: "scheduled",
        }),
      })
      await app.request("/driver-shifts", {
        method: "POST",
        ...json({
          driverId: d2.id,
          startsAt: "2025-06-15T06:00:00Z",
          endsAt: "2025-06-15T18:00:00Z",
          status: "completed",
        }),
      })
      const res = await app.request("/driver-shifts?status=completed", { method: "GET" })
      const body = await res.json()
      expect(body.total).toBe(1)
      expect(body.data[0].status).toBe("completed")
    })
  })

  // ─── Service Incidents ─────────────────────────────────────

  describe("Service Incidents", () => {
    it("creates a service incident with defaults", async () => {
      const { dispatch } = await seedDispatchChain()
      const res = await app.request("/service-incidents", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, incidentType: "delay" }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.id).toMatch(/^gsin_/)
      expect(data.severity).toBe("warning")
      expect(data.resolutionStatus).toBe("open")
    })

    it("creates with all fields", async () => {
      const { dispatch } = await seedDispatchChain()
      const res = await app.request("/service-incidents", {
        method: "POST",
        ...json({
          dispatchId: dispatch.id,
          incidentType: "vehicle_breakdown",
          severity: "critical",
          resolutionStatus: "open",
          notes: "Flat tire on highway",
        }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.severity).toBe("critical")
      expect(data.incidentType).toBe("vehicle_breakdown")
      expect(data.notes).toBe("Flat tire on highway")
    })

    it("gets a service incident by id", async () => {
      const { dispatch } = await seedDispatchChain()
      const createRes = await app.request("/service-incidents", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, incidentType: "delay" }),
      })
      const { data: incident } = await createRes.json()

      const res = await app.request(`/service-incidents/${incident.id}`, { method: "GET" })
      expect(res.status).toBe(200)
    })

    it("returns 404 for non-existent incident", async () => {
      const res = await app.request("/service-incidents/gsin_00000000000000000000000000", {
        method: "GET",
      })
      expect(res.status).toBe(404)
    })

    it("updates a service incident", async () => {
      const { dispatch } = await seedDispatchChain()
      const createRes = await app.request("/service-incidents", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, incidentType: "delay" }),
      })
      const { data: incident } = await createRes.json()

      const res = await app.request(`/service-incidents/${incident.id}`, {
        method: "PATCH",
        ...json({ resolutionStatus: "resolved", notes: "Issue fixed" }),
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.resolutionStatus).toBe("resolved")
      expect(data.notes).toBe("Issue fixed")
    })

    it("deletes a service incident", async () => {
      const { dispatch } = await seedDispatchChain()
      const createRes = await app.request("/service-incidents", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, incidentType: "delay" }),
      })
      const { data: incident } = await createRes.json()

      const res = await app.request(`/service-incidents/${incident.id}`, { method: "DELETE" })
      expect(res.status).toBe(200)
    })
  })

  describe("Service Incidents list & filters", () => {
    it("lists filtered by dispatchId", async () => {
      const { dispatch } = await seedDispatchChain()
      await app.request("/service-incidents", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, incidentType: "delay" }),
      })
      await app.request("/service-incidents", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, incidentType: "complaint" }),
      })
      const res = await app.request(`/service-incidents?dispatchId=${dispatch.id}`, {
        method: "GET",
      })
      const body = await res.json()
      expect(body.total).toBe(2)
    })

    it("filters by severity", async () => {
      const { dispatch } = await seedDispatchChain()
      await app.request("/service-incidents", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, incidentType: "note", severity: "info" }),
      })
      await app.request("/service-incidents", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, incidentType: "breakdown", severity: "critical" }),
      })
      const res = await app.request(
        `/service-incidents?dispatchId=${dispatch.id}&severity=critical`,
        { method: "GET" },
      )
      const body = await res.json()
      expect(body.total).toBe(1)
      expect(body.data[0].severity).toBe("critical")
    })

    it("filters by resolutionStatus", async () => {
      const { dispatch } = await seedDispatchChain()
      await app.request("/service-incidents", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, incidentType: "delay", resolutionStatus: "open" }),
      })
      await app.request("/service-incidents", {
        method: "POST",
        ...json({
          dispatchId: dispatch.id,
          incidentType: "complaint",
          resolutionStatus: "resolved",
        }),
      })
      const res = await app.request(
        `/service-incidents?dispatchId=${dispatch.id}&resolutionStatus=resolved`,
        { method: "GET" },
      )
      const body = await res.json()
      expect(body.total).toBe(1)
      expect(body.data[0].resolutionStatus).toBe("resolved")
    })
  })

  // ─── Dispatch Checkpoints ──────────────────────────────────
})
