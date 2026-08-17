import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"

import {
  createInMemoryBookingSessionRepository,
  createInMemoryOwnedInventoryPorts,
  inMemoryBookingRequirements,
} from "./sessions-memory.js"
import { createBookingSessionRoutes } from "./sessions-routes.js"
import { createBookingSessionModule } from "./sessions-service.js"

const ACTIVE_STOREFRONT = {
  channelId: "chan_public",
  channelStatus: "active",
} as const

const PUBLIC_CAPABILITY = `bcap_${"a".repeat(43)}`
const WRONG_CAPABILITY = `bcap_${"b".repeat(43)}`
const SUPPLIER_OPERATION = {
  id: "suop_route_1",
  subjectType: "booking_session" as const,
  subjectId: "bses_route_1",
  sessionId: "bses_route_1",
  scopeKey: "session",
  quoteId: "bsqu_route_1",
  holdId: null,
  bookingItemId: null,
  amendmentId: null,
  operationKind: "reserve" as const,
  state: "manual_review" as const,
  commitmentPolicy: "supplier_first" as const,
  entityModule: "cruises",
  entityId: "crus_route_1",
  sourceKind: "cruise:test",
  sourceConnectionId: "conn_route_1",
  sourceRef: "source-route-1",
  adapterKind: "cruise:test",
  requestFingerprint: "request-fingerprint-route-1",
  adapterIdempotencyKey: "bses_route_1:commit-route-1:reserve",
  attemptCount: 1,
  upstreamRef: null,
  upstreamStatus: null,
  bookingId: null,
  lastErrorClass: "supplier_timeout",
  safeEvidence: {},
  submittedAt: "2026-08-01T12:00:00.000Z",
  lastCheckedAt: null,
  sourceUpdatedAt: null,
  nextReconcileAt: null,
  resolvedAt: null,
  resolvedBy: null,
  resolutionReason: null,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
}

function createApp(
  publicChannel: {
    channelId: string
    channelStatus: string | null
  } | null = ACTIVE_STOREFRONT,
) {
  let currentPublicChannel = publicChannel
  const repository = createInMemoryBookingSessionRepository()
  const inventory = createInMemoryOwnedInventoryPorts()
  inventory.setCapacity("product:prod_owned_1", 2)
  const module = createBookingSessionModule({
    now: () => new Date("2026-08-01T12:00:00.000Z"),
    ports: {
      repository,
      normalizeSelection: async ({ selection }) => selection,
      composeRequirements: inventory.composeRequirements,
      composeQuote: async () => ({
        status: "quoted",
        requirements: inMemoryBookingRequirements(),
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
  const supplierOperations = {
    list: vi.fn(async () => [SUPPLIER_OPERATION]),
    get: vi.fn(async () => SUPPLIER_OPERATION),
    reconcile: vi.fn(async () => SUPPLIER_OPERATION),
    resolve: vi.fn(async () => SUPPLIER_OPERATION),
  }
  const app = new Hono()
  app.use("/v1/public/catalog/*", async (c, next) => {
    if (currentPublicChannel) {
      c.set("publicChannel" as never, currentPublicChannel as never)
    }
    await next()
  })
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
      resolveSupplierOperations: () => supplierOperations,
    }),
  )
  return {
    app,
    inventory,
    module,
    supplierOperations,
    setPublicChannel(
      next: {
        channelId: string
        channelStatus: string | null
      } | null,
    ) {
      currentPublicChannel = next
    },
  }
}

describe("Booking Session v1 routes", () => {
  it.each([
    ["missing", null],
    ["inactive", { ...ACTIVE_STOREFRONT, channelStatus: "inactive" }],
    ["blank", { channelId: "  ", channelStatus: "active" }],
  ])("fails closed for %s public storefront context", async (_label, publicChannel) => {
    const { app } = createApp(publicChannel)

    const response = await app.request("/v1/public/catalog/booking-sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Voyant-Booking-Session-Capability": PUBLIC_CAPABILITY,
      },
      body: JSON.stringify({
        idempotencyKey: "route_create_denied",
        target: { kind: "product", productId: "prod_owned_1" },
      }),
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: "Active storefront channel context is required.",
      code: "active_channel_required",
    })
  })

  it("derives anonymous storefront access from trusted Hono context only", async () => {
    const { app, module } = createApp()
    const createSession = vi.spyOn(module, "createSession")

    const response = await app.request("/v1/public/catalog/booking-sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Voyant-Booking-Session-Capability": PUBLIC_CAPABILITY,
      },
      body: JSON.stringify({
        idempotencyKey: "route_create_trusted_origin",
        target: { kind: "product", productId: "prod_owned_1" },
        storefront: { channelId: "chan_untrusted" },
      }),
    })

    expect(response.status).toBe(200)
    expect(createSession).toHaveBeenCalledWith(
      expect.not.objectContaining({ storefront: expect.anything() }),
      expect.objectContaining({
        actorKind: "anonymous",
        storefront: { channelId: "chan_public" },
      }),
    )
  })

  it.each([
    ["missing", null],
    ["inactive", { ...ACTIVE_STOREFRONT, channelStatus: "inactive" }],
  ])("rejects %s storefront context for public reads and mutations", async (_label, next) => {
    const { app, setPublicChannel } = createApp()
    const createdResponse = await app.request("/v1/public/catalog/booking-sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Voyant-Booking-Session-Capability": PUBLIC_CAPABILITY,
      },
      body: JSON.stringify({
        idempotencyKey: `route_context_${_label}`,
        target: { kind: "product", productId: "prod_owned_1" },
      }),
    })
    const created = (await createdResponse.json()) as { session: { id: string; revision: number } }
    setPublicChannel(next)

    const read = await app.request(`/v1/public/catalog/booking-sessions/${created.session.id}`, {
      headers: { "Voyant-Booking-Session-Capability": PUBLIC_CAPABILITY },
    })
    const mutation = await app.request(
      `/v1/public/catalog/booking-sessions/${created.session.id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "Voyant-Booking-Session-Capability": PUBLIC_CAPABILITY,
        },
        body: JSON.stringify({
          expectedRevision: created.session.revision,
          idempotencyKey: `route_context_update_${_label}`,
          selection: {},
        }),
      },
    )

    expect(read.status).toBe(403)
    expect(mutation.status).toBe(403)
  })

  it("rejects a capability replayed from another active storefront", async () => {
    const { app, setPublicChannel } = createApp()
    const createdResponse = await app.request("/v1/public/catalog/booking-sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Voyant-Booking-Session-Capability": PUBLIC_CAPABILITY,
      },
      body: JSON.stringify({
        idempotencyKey: "route_cross_storefront",
        target: { kind: "product", productId: "prod_owned_1" },
      }),
    })
    const created = (await createdResponse.json()) as { session: { id: string } }
    setPublicChannel({
      channelId: "chan_other",
      channelStatus: "active",
    })

    const response = await app.request(
      `/v1/public/catalog/booking-sessions/${created.session.id}`,
      { headers: { "Voyant-Booking-Session-Capability": PUBLIC_CAPABILITY } },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      kind: "rejected",
      error: { kind: "not_authorized" },
    })
  })

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

  it("mounts Supplier Operation inspection and resolution only on the staff surface", async () => {
    const { app, supplierOperations } = createApp()
    const publicResponse = await app.request("/v1/public/catalog/supplier-operations")
    const adminResponse = await app.request("/v1/admin/catalog/supplier-operations")
    const resolveResponse = await app.request(
      `/v1/admin/catalog/supplier-operations/${SUPPLIER_OPERATION.id}/resolve`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: "route-resolution-key",
          resolution: "refused",
          reason: "Supplier confirmed no reservation exists",
        }),
      },
    )

    expect(publicResponse.status).toBe(404)
    expect(adminResponse.status).toBe(200)
    await expect(adminResponse.json()).resolves.toEqual({ operations: [SUPPLIER_OPERATION] })
    expect(resolveResponse.status).toBe(200)
    expect(supplierOperations.resolve).toHaveBeenCalledWith(
      SUPPLIER_OPERATION.id,
      {
        idempotencyKey: "route-resolution-key",
        resolution: "refused",
        reason: "Supplier confirmed no reservation exists",
      },
      {
        actorKind: "staff",
        principalId: "staff_1",
        staffAuthority: { admitted: true, reason: "booking_support_case" },
      },
    )
  })

  it("adapts public anonymous and admin staff transports to the same module outcomes", async () => {
    const { app, module } = createApp()
    const createSession = vi.spyOn(module, "createSession")
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
    expect(createSession.mock.calls[0]?.[1]).toMatchObject({
      actorKind: "anonymous",
      storefront: { channelId: "chan_public" },
    })
    expect(createSession.mock.calls[1]?.[1]).toEqual({
      actorKind: "staff",
      principalId: "staff_1",
      staffAuthority: { admitted: true, reason: "booking_support_case" },
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
      quote: { id: string; requirementsFingerprint: string }
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
          requirementsFingerprint: publicQuote.quote.requirementsFingerprint,
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
      quote: { id: string; requirementsFingerprint: string }
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
          requirementsFingerprint: staffQuoteBody.quote.requirementsFingerprint,
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
