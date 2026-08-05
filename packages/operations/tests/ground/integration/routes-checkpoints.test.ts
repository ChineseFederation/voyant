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

  describe("Dispatch Checkpoints", () => {
    it("creates a checkpoint with defaults", async () => {
      const { dispatch } = await seedDispatchChain()
      const res = await app.request("/dispatch-checkpoints", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, checkpointType: "departure" }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.id).toMatch(/^gdcp_/)
      expect(data.sequence).toBe(0)
      expect(data.status).toBe("pending")
    })

    it("creates with all fields", async () => {
      const { dispatch } = await seedDispatchChain()
      const res = await app.request("/dispatch-checkpoints", {
        method: "POST",
        ...json({
          dispatchId: dispatch.id,
          sequence: 1,
          checkpointType: "arrival",
          status: "reached",
          plannedAt: "2025-06-15T09:00:00Z",
          actualAt: "2025-06-15T09:05:00Z",
          notes: "Arrived slightly late",
        }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.sequence).toBe(1)
      expect(data.checkpointType).toBe("arrival")
      expect(data.status).toBe("reached")
      expect(data.notes).toBe("Arrived slightly late")
    })

    it("gets a checkpoint by id", async () => {
      const { dispatch } = await seedDispatchChain()
      const createRes = await app.request("/dispatch-checkpoints", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, checkpointType: "departure" }),
      })
      const { data: cp } = await createRes.json()

      const res = await app.request(`/dispatch-checkpoints/${cp.id}`, { method: "GET" })
      expect(res.status).toBe(200)
    })

    it("returns 404 for non-existent checkpoint", async () => {
      const res = await app.request("/dispatch-checkpoints/gdcp_00000000000000000000000000", {
        method: "GET",
      })
      expect(res.status).toBe(404)
    })

    it("updates a checkpoint", async () => {
      const { dispatch } = await seedDispatchChain()
      const createRes = await app.request("/dispatch-checkpoints", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, checkpointType: "departure" }),
      })
      const { data: cp } = await createRes.json()

      const res = await app.request(`/dispatch-checkpoints/${cp.id}`, {
        method: "PATCH",
        ...json({ status: "reached", actualAt: "2025-06-15T08:00:00Z" }),
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.status).toBe("reached")
    })

    it("deletes a checkpoint", async () => {
      const { dispatch } = await seedDispatchChain()
      const createRes = await app.request("/dispatch-checkpoints", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, checkpointType: "departure" }),
      })
      const { data: cp } = await createRes.json()

      const res = await app.request(`/dispatch-checkpoints/${cp.id}`, { method: "DELETE" })
      expect(res.status).toBe(200)
    })
  })

  describe("Dispatch Checkpoints list & filters", () => {
    it("lists filtered by dispatchId", async () => {
      const { dispatch } = await seedDispatchChain()
      await app.request("/dispatch-checkpoints", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, checkpointType: "departure", sequence: 0 }),
      })
      await app.request("/dispatch-checkpoints", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, checkpointType: "arrival", sequence: 1 }),
      })
      const res = await app.request(`/dispatch-checkpoints?dispatchId=${dispatch.id}`, {
        method: "GET",
      })
      const body = await res.json()
      expect(body.total).toBe(2)
    })

    it("filters by status", async () => {
      const { dispatch } = await seedDispatchChain()
      await app.request("/dispatch-checkpoints", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, checkpointType: "departure", status: "pending" }),
      })
      await app.request("/dispatch-checkpoints", {
        method: "POST",
        ...json({ dispatchId: dispatch.id, checkpointType: "arrival", status: "reached" }),
      })
      const res = await app.request(
        `/dispatch-checkpoints?dispatchId=${dispatch.id}&status=reached`,
        { method: "GET" },
      )
      const body = await res.json()
      expect(body.total).toBe(1)
      expect(body.data[0].status).toBe("reached")
    })
  })
})
