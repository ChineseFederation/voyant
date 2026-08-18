/**
 * Moved from `public-api`'s shopping route tests with the routes themselves
 * (voyant#4627), and re-pointed at the new URL — `/v1/public/trips/…` rather
 * than `/v1/public/shopping/…`.
 *
 * The assertions are deliberately unchanged otherwise: the point of the move is
 * that the surface behaves identically, so a rewritten test would prove nothing
 * about it.
 */
import { handleApiError, requestId } from "@voyant-travel/hono"
import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"

import {
  PublicApiTripSelectionRevisionConflictError,
  type PublicApiTripSelectionsRuntime,
} from "../../src/public-api-trip-selections-gateway.js"
import { createPublicApiTripSelectionsRoutes } from "../../src/public-api-trip-selections-routes.js"

const scope = {
  marketId: "default",
  locale: "en-GB",
  currency: "EUR",
  available: { marketIds: ["default"], locales: ["en-GB"], currencies: ["EUR"] },
}

const resolveScope = vi.fn(async () => scope)

function tripRuntime(): PublicApiTripSelectionsRuntime {
  return {
    create: vi.fn(async (_context, input) => ({
      selectionRef: "selection_ref_123456789",
      revision: 0,
      scope: input.scope,
      items: [],
    })),
    update: vi.fn(async (_context, input) => ({
      selectionRef: input.selectionRef,
      revision: input.expectedRevision + 1,
      scope,
      items: [],
    })),
    book: vi.fn(async () => ({
      bookingSessionCapability: `bcap_${"a".repeat(43)}`,
      outcome: {
        kind: "session_created" as const,
        session: {
          id: "booking_sessions_public_1",
          target: { kind: "managed_itinerary" as const },
          actorKind: "anonymous" as const,
          state: "active" as const,
          revision: 1,
          scope: { locale: "ro-RO", market: "market_ro", currency: "EUR" },
          expiresAt: "2026-08-08T10:30:00.000Z",
          createdAt: "2026-08-08T10:00:00.000Z",
          updatedAt: "2026-08-08T10:00:00.000Z",
        },
      },
    })),
  }
}

function app(
  options: Parameters<typeof createPublicApiTripSelectionsRoutes>[0] = {},
  context: { active?: boolean; anonymous?: boolean; userId?: string } = {},
) {
  const root = new Hono()
  root.use("*", requestId)
  root.use("*", async (c, next) => {
    c.set(
      "publicChannel" as never,
      {
        channelId: "chan_server",
        channelStatus: context.active === false ? "inactive" : "active",
      } as never,
    )
    c.set("isAnonymousRequest" as never, (context.anonymous ?? true) as never)
    if (context.userId) c.set("userId" as never, context.userId as never)
    await next()
  })
  root.onError((cause, c) => handleApiError(cause, c))
  root.route("/v1/public/trips", createPublicApiTripSelectionsRoutes(options))
  return root
}

function jsonRequest(path: string, body: unknown, init: RequestInit = {}) {
  return new Request(`https://shop.example${path}`, {
    ...init,
    method: init.method ?? "POST",
    headers: { "content-type": "application/json", ...init.headers },
    body: JSON.stringify(body),
  })
}

describe("public Trip-selection routes", () => {
  it("serves the selection paths under the trips public mount", () => {
    const registry = createPublicApiTripSelectionsRoutes()
      .openAPIRegistry.definitions.filter((definition) => "route" in definition)
      .map((definition) => `${definition.route.method.toUpperCase()} ${definition.route.path}`)
      .sort()
    expect(registry).toEqual([
      "PATCH /trip-selections",
      "POST /trip-selections",
      "POST /trip-selections/book",
    ])
  })

  it("rejects cross-site Trip mutations and maps provider CAS conflicts to 409", async () => {
    const trips = tripRuntime()
    const createBody = {
      scope: {},
      offers: [{ kind: "product", offerRef: "offer_ref_123456789" }],
    }
    const crossSite = await app({ resolveScope, selections: trips }).request(
      jsonRequest("/v1/public/trips/trip-selections", createBody, {
        headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
      }),
    )
    expect(crossSite.status).toBe(403)
    expect(trips.create).not.toHaveBeenCalled()

    trips.update = vi.fn(async () => {
      throw new PublicApiTripSelectionRevisionConflictError()
    })
    const conflict = await app({ resolveScope, selections: trips }).request(
      jsonRequest(
        "/v1/public/trips/trip-selections",
        {
          selectionRef: "selection_ref_123456789",
          expectedRevision: 3,
          mutation: { kind: "remove", itemRef: "selection_item_123456" },
        },
        { method: "PATCH", headers: { origin: "https://shop.example" } },
      ),
    )
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toMatchObject({
      error: "trip_selection_revision_conflict",
      requestId: expect.any(String),
    })
    expect(conflict.headers.get("cache-control")).toBe("private, no-store")
  })

  it("creates a managed itinerary Session without accepting authority selectors", async () => {
    const trips = tripRuntime()
    const request = {
      selectionRef: "selection_ref_123456789",
      expectedRevision: 3,
      idempotencyKey: "book_trip_once",
    }
    const response = await app({ resolveScope, selections: trips }).request(
      jsonRequest("/v1/public/trips/trip-selections/book", request, {
        headers: { origin: "https://shop.example" },
      }),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: {
        bookingSessionCapability: expect.stringMatching(/^bcap_/),
        outcome: {
          kind: "session_created",
          session: { target: { kind: "managed_itinerary" } },
        },
      },
    })

    const injected = await app({ resolveScope, selections: trips }).request(
      jsonRequest(
        "/v1/public/trips/trip-selections/book",
        { ...request, providerId: "provider_browser" },
        { headers: { origin: "https://shop.example" } },
      ),
    )
    expect(injected.status).toBe(400)
    expect(trips.book).toHaveBeenCalledOnce()
  })

  it("requires an active channel before any mutation", async () => {
    const trips = tripRuntime()
    const response = await app({ resolveScope, selections: trips }, { active: false }).request(
      jsonRequest(
        "/v1/public/trips/trip-selections",
        { scope: {}, offers: [{ kind: "product", offerRef: "offer_ref_123456789" }] },
        { headers: { origin: "https://shop.example" } },
      ),
    )
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: "active_channel_required" })
    expect(trips.create).not.toHaveBeenCalled()
  })

  // The shopping runtime is optional in the graph, so a deployment without one
  // must refuse rather than throw — these routes cannot resolve a scope alone.
  it("answers 503 when the shopping runtime that resolves scope is unbound", async () => {
    const trips = tripRuntime()
    const response = await app({ selections: trips }).request(
      jsonRequest(
        "/v1/public/trips/trip-selections",
        { scope: {}, offers: [{ kind: "product", offerRef: "offer_ref_123456789" }] },
        { headers: { origin: "https://shop.example" } },
      ),
    )
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: "storefront_shopping_unavailable" })
    expect(trips.create).not.toHaveBeenCalled()
  })
})
