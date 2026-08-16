import type { OfferPreviewRequestV1 } from "@voyant-travel/catalog-contracts/booking-engine/preview-contracts"
import { bookingSessionAudienceForActorV1 } from "@voyant-travel/catalog-contracts/booking-engine/session-contracts"
import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"

import {
  createInMemoryBookingSessionRepository,
  createInMemoryOwnedInventoryPorts,
  inMemoryBookingRequirements,
} from "./sessions-memory.js"
import { createBookingSessionRoutes } from "./sessions-routes.js"
import {
  type BookingSessionModulePorts,
  createBookingSessionModule,
  InvalidBookingSessionSelectionError,
} from "./sessions-service.js"

const ACTIVE_STOREFRONT = {
  channelId: "chan_public",
  channelStatus: "active",
} as const

const PRICING = {
  currency: "EUR",
  lines: [],
  taxes: [],
  subtotal: 10000,
  taxTotal: 0,
  total: 10000,
} as const

const REQUEST: OfferPreviewRequestV1 = {
  target: { kind: "product", productId: "prod_owned_1" },
  scope: { locale: "ro", market: "mkt_ro", currency: "RON" },
  selection: { configure: { pax: { adult: 2 } } },
}

function createHarness(
  overrides: Partial<Pick<BookingSessionModulePorts, "composeQuote" | "composeRequirements">> = {},
) {
  const repository = createInMemoryBookingSessionRepository()
  const inventory = createInMemoryOwnedInventoryPorts()
  inventory.setCapacity("product:prod_owned_1", 2)
  const composeQuote = vi.fn<BookingSessionModulePorts["composeQuote"]>(async () => ({
    status: "quoted" as const,
    requirements: inMemoryBookingRequirements(),
    pricing: { ...PRICING, lines: [], taxes: [] },
  }))
  const composeRequirements = vi.fn<BookingSessionModulePorts["composeRequirements"]>(
    inventory.composeRequirements,
  )
  const module = createBookingSessionModule({
    now: () => new Date("2026-08-01T12:00:00.000Z"),
    ports: {
      repository,
      normalizeSelection: async ({ selection }) => selection,
      composeRequirements: overrides.composeRequirements ?? composeRequirements,
      composeQuote: overrides.composeQuote ?? composeQuote,
      placeCapacityHold: inventory.placeCapacityHold,
      releaseCapacityHold: inventory.releaseCapacityHold,
      commitOwnedBooking: inventory.commitOwnedBooking,
    },
  })
  return { composeQuote, composeRequirements, module, repository }
}

function createApp(harness: ReturnType<typeof createHarness>) {
  const app = new Hono()
  app.use("/v1/public/catalog/*", async (c, next) => {
    c.set("publicChannel" as never, ACTIVE_STOREFRONT as never)
    await next()
  })
  app.route(
    "/v1/public/catalog",
    createBookingSessionRoutes({ actorKind: "anonymous", resolveModule: () => harness.module }),
  )
  app.route(
    "/v1/admin/catalog",
    createBookingSessionRoutes({
      actorKind: "staff",
      resolveModule: () => harness.module,
      resolveAccess: () => ({
        actorKind: "staff",
        principalId: "staff_1",
        staffAuthority: { admitted: true, reason: "booking_support_case" },
      }),
    }),
  )
  return app
}

function repositoryRowCount(repository: ReturnType<typeof createInMemoryBookingSessionRepository>) {
  return (
    repository.sessions.size +
    repository.quotes.size +
    repository.holds.size +
    repository.commits.size +
    repository.operations.size +
    repository.auditEvents.size
  )
}

describe("Offer Preview", () => {
  it("prices a target without opening a Booking Session", async () => {
    const harness = createHarness()

    const outcome = await harness.module.previewOffer(REQUEST, { actorKind: "anonymous" })

    expect(outcome.kind).toBe("offer_preview")
    if (outcome.kind !== "offer_preview") return
    expect(outcome.preview.binding).toBe(false)
    expect(outcome.preview.available).toBe(true)
    expect(outcome.preview.pricing?.total).toBe(10000)
    expect(outcome.preview.requirements).toBeDefined()
  })

  /**
   * Accommodations and cruises are `owned_entity` targets, which
   * `createBookingSessionTargetV1` refuses. The preview admits them because it
   * is a read (voyant#4188); the composition ports then route them to the owned
   * handler registry by `entityModule`, exactly as the Session path does.
   */
  it("takes an owned_entity target and hands it to the composition ports intact", async () => {
    const harness = createHarness()

    const outcome = await harness.module.previewOffer(
      {
        ...REQUEST,
        target: { kind: "owned_entity", entityModule: "accommodations", entityId: "acc_1" },
      },
      { actorKind: "anonymous" },
    )

    expect(outcome.kind).toBe("offer_preview")
    expect(harness.composeQuote.mock.calls[0]?.[0].session.target).toEqual({
      kind: "owned_entity",
      entityModule: "accommodations",
      entityId: "acc_1",
    })
  })

  /**
   * The load-bearing case: a sold-out or unpriced target still has to render a
   * wizard, or the shopper cannot change the selection that made it
   * unavailable.
   */
  it("returns requirements when pricing is unavailable", async () => {
    const harness = createHarness({
      composeQuote: async () => ({
        status: "unavailable",
        requirements: inMemoryBookingRequirements(),
        reason: "selection_unavailable",
        nextAction: "update_selection",
      }),
    })

    const outcome = await harness.module.previewOffer(REQUEST, { actorKind: "anonymous" })

    expect(outcome.kind).toBe("offer_preview")
    if (outcome.kind !== "offer_preview") return
    expect(outcome.preview.available).toBe(false)
    expect(outcome.preview.pricing).toBeUndefined()
    expect(outcome.preview.unavailableReason).toBe("selection_unavailable")
    expect(outcome.preview.requirements.paxBands.length).toBeGreaterThan(0)
  })

  it("falls back to the requirements derivation when the quote dropped the descriptor", async () => {
    const harness = createHarness({
      composeQuote: async () => ({
        status: "unavailable",
        reason: "price_unavailable",
        nextAction: "contact_operator",
      }),
    })

    const outcome = await harness.module.previewOffer(REQUEST, { actorKind: "anonymous" })

    expect(outcome.kind).toBe("offer_preview")
    if (outcome.kind !== "offer_preview") return
    expect(outcome.preview.requirements.paxBands.length).toBeGreaterThan(0)
    expect(outcome.preview.unavailableReason).toBe("price_unavailable")
  })

  it("rejects only when the target itself does not resolve", async () => {
    const harness = createHarness({
      composeQuote: async () => ({
        status: "unavailable",
        reason: "target_not_found",
        nextAction: "select_alternative_inventory",
      }),
      composeRequirements: async () => ({
        status: "unavailable",
        reason: "target_not_found",
        nextAction: "select_alternative_inventory",
      }),
    })

    const outcome = await harness.module.previewOffer(REQUEST, { actorKind: "anonymous" })

    expect(outcome).toEqual({
      kind: "rejected",
      error: {
        kind: "quote_unavailable",
        reason: "target_not_found",
        nextAction: "select_alternative_inventory",
      },
    })
  })

  /** Invariant 1 + 4 (voyant#4188), asserted on a real response. */
  it("mints no identifier a caller could present as authority", async () => {
    const harness = createHarness()

    const outcome = await harness.module.previewOffer(REQUEST, { actorKind: "anonymous" })

    if (outcome.kind !== "offer_preview") throw new Error("expected a preview")
    for (const key of ["id", "quoteId", "sessionId", "holdId", "token"]) {
      expect(outcome.preview).not.toHaveProperty(key)
    }
    expect(JSON.stringify(outcome.preview)).not.toMatch(/"(id|quoteId|sessionId|token)"/)
  })

  /** Invariant 2 (voyant#4188). */
  it("persists nothing — no Session, Quote, Hold, operation or audit row", async () => {
    const harness = createHarness()
    expect(repositoryRowCount(harness.repository)).toBe(0)

    for (let index = 0; index < 25; index += 1) {
      await harness.module.previewOffer(REQUEST, { actorKind: "anonymous" })
    }

    expect(repositoryRowCount(harness.repository)).toBe(0)
    expect(harness.repository.sessions.size).toBe(0)
    expect(harness.repository.quotes.size).toBe(0)
    expect(harness.repository.auditEvents.size).toBe(0)
  })

  it("is deterministic for the same target, scope and selection", async () => {
    const harness = createHarness()

    const first = await harness.module.previewOffer(REQUEST, { actorKind: "anonymous" })
    const second = await harness.module.previewOffer(REQUEST, { actorKind: "anonymous" })

    expect(first).toEqual(second)
  })

  describe("audience", () => {
    it("derives customer audience for a public caller even when the body names staff", async () => {
      const harness = createHarness()

      await harness.module.previewOffer(
        { ...REQUEST, scope: { ...REQUEST.scope, audience: "staff" } as never },
        { actorKind: "anonymous" },
      )

      const session = harness.composeQuote.mock.calls[0]?.[0].session
      expect(session?.actorKind).toBe("anonymous")
      expect(bookingSessionAudienceForActorV1(session?.actorKind ?? "anonymous")).toBe("customer")
      expect(session?.scope).not.toHaveProperty("audience")
    })

    it("keeps staff audience for a staff caller", async () => {
      const harness = createHarness()

      await harness.module.previewOffer(REQUEST, {
        actorKind: "staff",
        principalId: "staff_1",
        staffAuthority: { admitted: true, reason: "booking_support_case" },
      })

      const session = harness.composeQuote.mock.calls[0]?.[0].session
      expect(bookingSessionAudienceForActorV1(session?.actorKind ?? "anonymous")).toBe("staff")
    })

    it("refuses a named actor without a principal", async () => {
      const harness = createHarness()

      const outcome = await harness.module.previewOffer(REQUEST, { actorKind: "customer" })

      expect(outcome).toEqual({ kind: "rejected", error: { kind: "not_authorized" } })
      expect(harness.composeQuote).not.toHaveBeenCalled()
    })
  })

  it("rejects a selection the Session plane would refuse", async () => {
    const repository = createInMemoryBookingSessionRepository()
    const inventory = createInMemoryOwnedInventoryPorts()
    const module = createBookingSessionModule({
      ports: {
        repository,
        normalizeSelection: async () => {
          throw new InvalidBookingSessionSelectionError("forbidden_field", "selection.staffBooking")
        },
        composeRequirements: inventory.composeRequirements,
        composeQuote: async () => ({
          status: "quoted",
          requirements: inMemoryBookingRequirements(),
          pricing: { ...PRICING, lines: [], taxes: [] },
        }),
        placeCapacityHold: inventory.placeCapacityHold,
        releaseCapacityHold: inventory.releaseCapacityHold,
        commitOwnedBooking: inventory.commitOwnedBooking,
      },
    })

    const outcome = await module.previewOffer(REQUEST, { actorKind: "anonymous" })

    expect(outcome).toEqual({
      kind: "rejected",
      error: {
        kind: "invalid_selection",
        reason: "forbidden_field",
        path: "selection.staffBooking",
      },
    })
    expect(repositoryRowCount(repository)).toBe(0)
  })
})

describe("POST /offers/preview", () => {
  it("is mounted on the public surface behind the storefront-channel gate", async () => {
    const harness = createHarness()
    const app = createApp(harness)

    const res = await app.request("/v1/public/catalog/offers/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(REQUEST),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { kind: string; preview: Record<string, unknown> }
    expect(body.kind).toBe("offer_preview")
    expect(body.preview.binding).toBe(false)
    expect(body.preview).not.toHaveProperty("quoteId")
    expect(repositoryRowCount(harness.repository)).toBe(0)
  })

  it("is refused without an active storefront channel", async () => {
    const harness = createHarness()
    const app = new Hono()
    app.route(
      "/v1/public/catalog",
      createBookingSessionRoutes({ actorKind: "anonymous", resolveModule: () => harness.module }),
    )

    const res = await app.request("/v1/public/catalog/offers/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(REQUEST),
    })

    expect(res.status).toBe(403)
  })

  it("is mounted on the admin surface too", async () => {
    const harness = createHarness()
    const app = createApp(harness)

    const res = await app.request("/v1/admin/catalog/offers/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(REQUEST),
    })

    expect(res.status).toBe(200)
    const session = harness.composeQuote.mock.calls[0]?.[0].session
    expect(session?.actorKind).toBe("staff")
  })
})
