import { Hono } from "hono"
import { describe, expect, it } from "vitest"

import {
  createInMemoryBookingSessionRepository,
  createInMemoryOwnedInventoryPorts,
} from "./sessions-memory.js"
import { createBookingSessionRoutes } from "./sessions-routes.js"
import { createBookingSessionModule } from "./sessions-service.js"

const PUBLIC_CAPABILITY = `bcap_${"a".repeat(43)}`
const WRONG_CAPABILITY = `bcap_${"b".repeat(43)}`

function createApp() {
  const repository = createInMemoryBookingSessionRepository()
  const inventory = createInMemoryOwnedInventoryPorts()
  inventory.setCapacity("product:prod_owned_1", 2)
  const module = createBookingSessionModule({
    now: () => new Date("2026-08-01T12:00:00.000Z"),
    ports: {
      repository,
      normalizeSelection: async ({ selection }) => selection,
      composeQuote: async () => ({
        status: "quoted",
        pricing: {
          currency: "EUR",
          lines: [],
          taxes: [],
          subtotal: 10000,
          taxTotal: 0,
          total: 10000,
        },
      }),
      placeCapacityHold: inventory.placeCapacityHold,
      releaseCapacityHold: inventory.releaseCapacityHold,
      commitOwnedBooking: inventory.commitOwnedBooking,
    },
  })
  const app = new Hono()
  app.route(
    "/v1/public/catalog",
    createBookingSessionRoutes({ actorKind: "anonymous", resolveModule: () => module }),
  )
  app.route(
    "/v1/admin/catalog",
    createBookingSessionRoutes({
      actorKind: "staff",
      resolveModule: () => module,
      resolveAccess: () => ({
        actorKind: "staff",
        principalId: "staff_1",
        staffAuthority: { admitted: true, reason: "booking_support_case" },
      }),
    }),
  )
  return { app, inventory }
}

describe("Booking Session v1 routes", () => {
  it("mounts retention maintenance only on the admitted staff surface", async () => {
    const { app } = createApp()
    const request = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: 10 }),
    }
    const publicResponse = await app.request(
      "/v1/public/catalog/booking-sessions/maintenance/expire",
      request,
    )
    const adminResponse = await app.request(
      "/v1/admin/catalog/booking-sessions/maintenance/expire",
      request,
    )

    expect(publicResponse.status).toBe(404)
    expect(adminResponse.status).toBe(200)
    await expect(adminResponse.json()).resolves.toEqual({ expired: 0 })
  })

  it("adapts public anonymous and admin staff transports to the same module outcomes", async () => {
    const { app } = createApp()
    const publicBody = JSON.stringify({
      idempotencyKey: "route_create_public",
      target: { kind: "product", productId: "prod_owned_1" },
    })
    const adminBody = JSON.stringify({
      idempotencyKey: "route_create_staff",
      target: { kind: "product", productId: "prod_owned_1" },
    })
    const headers = { "content-type": "application/json" }

    const publicResponse = await app.request("/v1/public/catalog/booking-sessions", {
      method: "POST",
      headers: { ...headers, "Voyant-Booking-Session-Capability": PUBLIC_CAPABILITY },
      body: publicBody,
    })
    const adminResponse = await app.request("/v1/admin/catalog/booking-sessions", {
      method: "POST",
      headers,
      body: adminBody,
    })

    expect(publicResponse.status).toBe(200)
    expect(adminResponse.status).toBe(200)
    await expect(publicResponse.json()).resolves.toMatchObject({
      kind: "session_created",
      session: { actorKind: "anonymous", revision: 1, target: { productId: "prod_owned_1" } },
    })
    await expect(adminResponse.json()).resolves.toMatchObject({
      kind: "session_created",
      session: { actorKind: "staff", revision: 1, target: { productId: "prod_owned_1" } },
    })
  })

  it("requires the anonymous capability for public mutations while staff uses the same module", async () => {
    const { app, inventory } = createApp()
    const headers = { "content-type": "application/json" }
    const publicCreated = await app.request("/v1/public/catalog/booking-sessions", {
      method: "POST",
      headers: { ...headers, "Voyant-Booking-Session-Capability": PUBLIC_CAPABILITY },
      body: JSON.stringify({
        idempotencyKey: "route_public_create",
        target: { kind: "product", productId: "prod_owned_1" },
      }),
    })
    const publicSession = (await publicCreated.json()) as {
      session: { id: string; revision: number }
    }

    const missingCapability = await app.request(
      `/v1/public/catalog/booking-sessions/${publicSession.session.id}/quote`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          expectedRevision: publicSession.session.revision,
          idempotencyKey: "missing_capability_quote",
        }),
      },
    )
    await expect(missingCapability.json()).resolves.toMatchObject({
      kind: "rejected",
      error: { kind: "capability_required" },
    })

    const wrongCapability = await app.request(
      `/v1/public/catalog/booking-sessions/${publicSession.session.id}/quote`,
      {
        method: "POST",
        headers: {
          ...headers,
          "Voyant-Booking-Session-Capability": WRONG_CAPABILITY,
        },
        body: JSON.stringify({
          expectedRevision: publicSession.session.revision,
          idempotencyKey: "wrong_capability_quote",
        }),
      },
    )
    await expect(wrongCapability.json()).resolves.toMatchObject({
      kind: "rejected",
      error: { kind: "capability_required" },
    })

    const quoted = await app.request(
      `/v1/public/catalog/booking-sessions/${publicSession.session.id}/quote`,
      {
        method: "POST",
        headers: {
          ...headers,
          "Voyant-Booking-Session-Capability": PUBLIC_CAPABILITY,
        },
        body: JSON.stringify({
          expectedRevision: publicSession.session.revision,
          idempotencyKey: "route_quote_key",
        }),
      },
    )
    const publicQuote = (await quoted.json()) as {
      kind: "quote_created"
      quote: { id: string }
    }
    expect(publicQuote).toMatchObject({ kind: "quote_created" })
    const publicHoldResponse = await app.request(
      `/v1/public/catalog/booking-sessions/${publicSession.session.id}/hold`,
      {
        method: "POST",
        headers: {
          ...headers,
          "Voyant-Booking-Session-Capability": PUBLIC_CAPABILITY,
        },
        body: JSON.stringify({
          expectedRevision: publicSession.session.revision,
          quoteId: publicQuote.quote.id,
          idempotencyKey: "route_public_hold_key",
        }),
      },
    )
    const publicHold = (await publicHoldResponse.json()) as {
      kind: "hold_created"
      hold: { id: string }
    }
    expect(publicHold).toMatchObject({ kind: "hold_created" })
    const publicCommitResponse = await app.request(
      `/v1/public/catalog/booking-sessions/${publicSession.session.id}/commit`,
      {
        method: "POST",
        headers: {
          ...headers,
          "Voyant-Booking-Session-Capability": PUBLIC_CAPABILITY,
        },
        body: JSON.stringify({
          expectedRevision: publicSession.session.revision,
          quoteId: publicQuote.quote.id,
          holdId: publicHold.hold.id,
          idempotencyKey: "route_public_commit_key",
        }),
      },
    )
    await expect(publicCommitResponse.json()).resolves.toMatchObject({
      kind: "commit_result",
      outcome: { kind: "committed", booking: { status: "confirmed" } },
    })

    const adminCreated = await app.request("/v1/admin/catalog/booking-sessions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        idempotencyKey: "route_staff_create",
        target: { kind: "product", productId: "prod_owned_1" },
      }),
    })
    const adminSession = (await adminCreated.json()) as {
      session: { id: string; revision: number }
    }
    const staffQuote = await app.request(
      `/v1/admin/catalog/booking-sessions/${adminSession.session.id}/quote`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          expectedRevision: adminSession.session.revision,
          idempotencyKey: "staff_quote_key",
        }),
      },
    )
    const staffQuoteBody = (await staffQuote.json()) as {
      kind: "quote_created"
      quote: { id: string }
    }
    expect(staffQuoteBody).toMatchObject({ kind: "quote_created" })
    const staffHoldResponse = await app.request(
      `/v1/admin/catalog/booking-sessions/${adminSession.session.id}/hold`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          expectedRevision: adminSession.session.revision,
          quoteId: staffQuoteBody.quote.id,
          idempotencyKey: "route_staff_hold_key",
        }),
      },
    )
    const staffHold = (await staffHoldResponse.json()) as {
      kind: "hold_created"
      hold: { id: string }
    }
    expect(staffHold).toMatchObject({ kind: "hold_created" })
    const staffCommitResponse = await app.request(
      `/v1/admin/catalog/booking-sessions/${adminSession.session.id}/commit`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          expectedRevision: adminSession.session.revision,
          quoteId: staffQuoteBody.quote.id,
          holdId: staffHold.hold.id,
          idempotencyKey: "route_staff_commit_key",
        }),
      },
    )
    await expect(staffCommitResponse.json()).resolves.toMatchObject({
      kind: "commit_result",
      outcome: { kind: "committed", booking: { status: "confirmed" } },
    })

    const staffOnlyCreated = await app.request("/v1/admin/catalog/booking-sessions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        idempotencyKey: "route_staff_auth_create",
        target: { kind: "product", productId: "prod_owned_1" },
      }),
    })
    const staffOnlySession = (await staffOnlyCreated.json()) as {
      session: { id: string; revision: number }
    }
    const publicAgainstStaff = await app.request(
      `/v1/public/catalog/booking-sessions/${staffOnlySession.session.id}/quote`,
      {
        method: "POST",
        headers: {
          ...headers,
          "Voyant-Booking-Session-Capability": PUBLIC_CAPABILITY,
        },
        body: JSON.stringify({
          expectedRevision: staffOnlySession.session.revision,
          idempotencyKey: "public_against_staff_quote",
        }),
      },
    )
    await expect(publicAgainstStaff.json()).resolves.toMatchObject({
      kind: "rejected",
      error: { kind: "not_authorized" },
    })
    expect(inventory.bookingIds).toHaveLength(2)
    expect(inventory.allocationIds).toHaveLength(2)
  })
})
