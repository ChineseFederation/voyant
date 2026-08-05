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

  describe("Execution Events", () => {
    it("creates an execution event with defaults", async () => {
      const { dispatch } = await seedDispatchChain()
      const res = await app.request("/execution-events", {
        method: "POST",
        ...json({ dispatchId: dispatch.id }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.id).toMatch(/^gexe_/)
      expect(data.eventType).toBe("note")
    })

    it("creates with event type and notes", async () => {
      const { dispatch } = await seedDispatchChain()
      const res = await app.request("/execution-events", {
        method: "POST",
        ...json({
          dispatchId: dispatch.id,
          eventType: "driver_arrived",
          notes: "Driver at gate B",
          metadata: { gate: "B" },
        }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.eventType).toBe("driver_arrived")
      expect(data.notes).toBe("Driver at gate B")
    })

    it("gets an execution event by id", async () => {
      const { dispatch } = await seedDispatchChain()
      const createRes = await app.request("/execution-events", {
        method: "POST",
        ...json({ dispatchId: dispatch.id }),
      })
      const { data: ev } = await createRes.json()

      const res = await app.request(`/execution-events/${ev.id}`, { method: "GET" })
      expect(res.status).toBe(200)
    })

    it("returns 404 for non-existent execution event", async () => {
      const res = await app.request("/execution-events/gexe_00000000000000000000000000", {
        method: "GET",
      })
      expect(res.status).toBe(404)
    })

    it("updates an execution event", async () => {
      const { dispatch } = await seedDispatchChain()
      const createRes = await app.request("/execution-events", {
        method: "POST",
        ...json({ dispatchId: dispatch.id }),
      })
      const { data: ev } = await createRes.json()

      const res = await app.request(`/execution-events/${ev.id}`, {
        method: "PATCH",
        ...json({ eventType: "pickup_completed", notes: "Picked up all passengers" }),
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.eventType).toBe("pickup_completed")
    })

    it("deletes an execution event", async () => {
      const { dispatch } = await seedDispatchChain()
      const createRes = await app.request("/execution-events", {
        method: "POST",
        ...json({ dispatchId: dispatch.id }),
      })
      const { data: ev } = await createRes.json()

      const res = await app.request(`/execution-events/${ev.id}`, { method: "DELETE" })
      expect(res.status).toBe(200)
    })
  })

  describe("Execution Events list & filters", () => {
    it("lists filtered by dispatchId", async () => {
      const { dispatch } = await seedDispatchChain()
      await app.request("/execution-events", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, eventType: "scheduled" }),
      })
      await app.request("/execution-events", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, eventType: "assigned" }),
      })
      const res = await app.request(`/execution-events?dispatchId=${dispatch.id}`, {
        method: "GET",
      })
      const body = await res.json()
      expect(body.total).toBe(2)
    })

    it("filters by eventType", async () => {
      const { dispatch } = await seedDispatchChain()
      await app.request("/execution-events", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, eventType: "scheduled" }),
      })
      await app.request("/execution-events", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, eventType: "issue" }),
      })
      const res = await app.request(`/execution-events?dispatchId=${dispatch.id}&eventType=issue`, {
        method: "GET",
      })
      const body = await res.json()
      expect(body.total).toBe(1)
      expect(body.data[0].eventType).toBe("issue")
    })
  })

  // ─── Dispatch Assignments ──────────────────────────────────

  describe("Dispatch Assignments", () => {
    it("creates a dispatch assignment with defaults", async () => {
      const { dispatch } = await seedDispatchChain()
      const res = await app.request("/dispatch-assignments", {
        method: "POST",
        ...json({ dispatchId: dispatch.id }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.id).toMatch(/^gdas_/)
      expect(data.assignmentSource).toBe("manual")
    })

    it("creates with source and notes", async () => {
      const { dispatch } = await seedDispatchChain()
      const res = await app.request("/dispatch-assignments", {
        method: "POST",
        ...json({
          dispatchId: dispatch.id,
          assignmentSource: "auto",
          notes: "Auto-matched",
        }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.assignmentSource).toBe("auto")
      expect(data.notes).toBe("Auto-matched")
    })

    it("gets a dispatch assignment by id", async () => {
      const { dispatch } = await seedDispatchChain()
      const createRes = await app.request("/dispatch-assignments", {
        method: "POST",
        ...json({ dispatchId: dispatch.id }),
      })
      const { data: assignment } = await createRes.json()

      const res = await app.request(`/dispatch-assignments/${assignment.id}`, { method: "GET" })
      expect(res.status).toBe(200)
    })

    it("returns 404 for non-existent assignment", async () => {
      const res = await app.request("/dispatch-assignments/gdas_00000000000000000000000000", {
        method: "GET",
      })
      expect(res.status).toBe(404)
    })

    it("updates a dispatch assignment", async () => {
      const { dispatch } = await seedDispatchChain()
      const createRes = await app.request("/dispatch-assignments", {
        method: "POST",
        ...json({ dispatchId: dispatch.id }),
      })
      const { data: assignment } = await createRes.json()

      const res = await app.request(`/dispatch-assignments/${assignment.id}`, {
        method: "PATCH",
        ...json({ assignmentSource: "suggested", notes: "Operator suggested" }),
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.assignmentSource).toBe("suggested")
    })

    it("deletes a dispatch assignment", async () => {
      const { dispatch } = await seedDispatchChain()
      const createRes = await app.request("/dispatch-assignments", {
        method: "POST",
        ...json({ dispatchId: dispatch.id }),
      })
      const { data: assignment } = await createRes.json()

      const res = await app.request(`/dispatch-assignments/${assignment.id}`, { method: "DELETE" })
      expect(res.status).toBe(200)
    })
  })

  describe("Dispatch Assignments list & filters", () => {
    it("lists filtered by dispatchId", async () => {
      const { dispatch } = await seedDispatchChain()
      await app.request("/dispatch-assignments", {
        method: "POST",
        ...json({ dispatchId: dispatch.id }),
      })
      await app.request("/dispatch-assignments", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, assignmentSource: "auto" }),
      })
      const res = await app.request(`/dispatch-assignments?dispatchId=${dispatch.id}`, {
        method: "GET",
      })
      const body = await res.json()
      expect(body.total).toBe(2)
    })

    it("filters by assignmentSource", async () => {
      const { dispatch } = await seedDispatchChain()
      await app.request("/dispatch-assignments", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, assignmentSource: "manual" }),
      })
      await app.request("/dispatch-assignments", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, assignmentSource: "auto" }),
      })
      const res = await app.request(
        `/dispatch-assignments?dispatchId=${dispatch.id}&assignmentSource=auto`,
        { method: "GET" },
      )
      const body = await res.json()
      expect(body.total).toBe(1)
      expect(body.data[0].assignmentSource).toBe("auto")
    })
  })

  // ─── Dispatch Legs ─────────────────────────────────────────

  describe("Dispatch Legs", () => {
    it("creates a dispatch leg with defaults", async () => {
      const { dispatch } = await seedDispatchChain()
      const res = await app.request("/dispatch-legs", {
        method: "POST",
        ...json({ dispatchId: dispatch.id }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.id).toMatch(/^gdlg_/)
      expect(data.sequence).toBe(0)
      expect(data.legType).toBe("pickup")
    })

    it("creates with sequence and type", async () => {
      const { dispatch } = await seedDispatchChain()
      const res = await app.request("/dispatch-legs", {
        method: "POST",
        ...json({
          dispatchId: dispatch.id,
          sequence: 1,
          legType: "dropoff",
          scheduledAt: "2025-06-15T09:30:00Z",
          notes: "Hotel entrance",
        }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.sequence).toBe(1)
      expect(data.legType).toBe("dropoff")
      expect(data.notes).toBe("Hotel entrance")
    })

    it("gets a dispatch leg by id", async () => {
      const { dispatch } = await seedDispatchChain()
      const createRes = await app.request("/dispatch-legs", {
        method: "POST",
        ...json({ dispatchId: dispatch.id }),
      })
      const { data: leg } = await createRes.json()

      const res = await app.request(`/dispatch-legs/${leg.id}`, { method: "GET" })
      expect(res.status).toBe(200)
    })

    it("returns 404 for non-existent leg", async () => {
      const res = await app.request("/dispatch-legs/gdlg_00000000000000000000000000", {
        method: "GET",
      })
      expect(res.status).toBe(404)
    })

    it("updates a dispatch leg", async () => {
      const { dispatch } = await seedDispatchChain()
      const createRes = await app.request("/dispatch-legs", {
        method: "POST",
        ...json({ dispatchId: dispatch.id }),
      })
      const { data: leg } = await createRes.json()

      const res = await app.request(`/dispatch-legs/${leg.id}`, {
        method: "PATCH",
        ...json({ legType: "stop", notes: "Rest stop" }),
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.legType).toBe("stop")
    })

    it("deletes a dispatch leg", async () => {
      const { dispatch } = await seedDispatchChain()
      const createRes = await app.request("/dispatch-legs", {
        method: "POST",
        ...json({ dispatchId: dispatch.id }),
      })
      const { data: leg } = await createRes.json()

      const res = await app.request(`/dispatch-legs/${leg.id}`, { method: "DELETE" })
      expect(res.status).toBe(200)
    })
  })

  describe("Dispatch Legs list & filters", () => {
    it("lists filtered by dispatchId", async () => {
      const { dispatch } = await seedDispatchChain()
      await app.request("/dispatch-legs", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, sequence: 0, legType: "pickup" }),
      })
      await app.request("/dispatch-legs", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, sequence: 1, legType: "dropoff" }),
      })
      const res = await app.request(`/dispatch-legs?dispatchId=${dispatch.id}`, { method: "GET" })
      const body = await res.json()
      expect(body.total).toBe(2)
    })

    it("filters by legType", async () => {
      const { dispatch } = await seedDispatchChain()
      await app.request("/dispatch-legs", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, legType: "pickup" }),
      })
      await app.request("/dispatch-legs", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, legType: "deadhead" }),
      })
      const res = await app.request(`/dispatch-legs?dispatchId=${dispatch.id}&legType=deadhead`, {
        method: "GET",
      })
      const body = await res.json()
      expect(body.total).toBe(1)
      expect(body.data[0].legType).toBe("deadhead")
    })
  })

  // ─── Dispatch Passengers ───────────────────────────────────

  describe("Dispatch Passengers", () => {
    it("creates a dispatch passenger", async () => {
      const { dispatch } = await seedDispatchChain()
      const res = await app.request("/dispatch-passengers", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, displayName: "John Doe", seatLabel: "1A" }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.id).toMatch(/^gdps_/)
      expect(data.displayName).toBe("John Doe")
      expect(data.seatLabel).toBe("1A")
    })

    it("gets a dispatch passenger by id", async () => {
      const { dispatch } = await seedDispatchChain()
      const createRes = await app.request("/dispatch-passengers", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, displayName: "Jane Doe" }),
      })
      const { data: pax } = await createRes.json()

      const res = await app.request(`/dispatch-passengers/${pax.id}`, { method: "GET" })
      expect(res.status).toBe(200)
    })

    it("returns 404 for non-existent passenger", async () => {
      const res = await app.request("/dispatch-passengers/gdps_00000000000000000000000000", {
        method: "GET",
      })
      expect(res.status).toBe(404)
    })

    it("updates a dispatch passenger", async () => {
      const { dispatch } = await seedDispatchChain()
      const createRes = await app.request("/dispatch-passengers", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, displayName: "John" }),
      })
      const { data: pax } = await createRes.json()

      const res = await app.request(`/dispatch-passengers/${pax.id}`, {
        method: "PATCH",
        ...json({ displayName: "John Smith", notes: "VIP" }),
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.displayName).toBe("John Smith")
      expect(data.notes).toBe("VIP")
    })

    it("deletes a dispatch passenger", async () => {
      const { dispatch } = await seedDispatchChain()
      const createRes = await app.request("/dispatch-passengers", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, displayName: "Temp Pax" }),
      })
      const { data: pax } = await createRes.json()

      const res = await app.request(`/dispatch-passengers/${pax.id}`, { method: "DELETE" })
      expect(res.status).toBe(200)
    })
  })

  describe("Dispatch Passengers list & filters", () => {
    it("lists filtered by dispatchId", async () => {
      const { dispatch } = await seedDispatchChain()
      await app.request("/dispatch-passengers", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, displayName: "Pax 1" }),
      })
      await app.request("/dispatch-passengers", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, displayName: "Pax 2" }),
      })
      const res = await app.request(`/dispatch-passengers?dispatchId=${dispatch.id}`, {
        method: "GET",
      })
      const body = await res.json()
      expect(body.total).toBe(2)
    })
  })

  // ─── Driver Shifts ─────────────────────────────────────────
})
