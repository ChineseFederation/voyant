import { handleApiError, requestId } from "@voyant-travel/hono"
import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"

import {
  createStorefrontShoppingPublicRoutes,
  type StorefrontShoppingRuntime,
  StorefrontTripSelectionRevisionConflictError,
  type StorefrontTripSelectionsRuntime,
} from "../../src/shopping/index.js"

const scope = {
  marketId: "default",
  locale: "en-GB",
  currency: "EUR",
  available: { marketIds: ["default"], locales: ["en-GB"], currencies: ["EUR"] },
}

const searchBody = {
  scope: { locale: "en-GB", currency: "EUR" },
  intent: { kind: "indexed-inspiration" as const, groups: [{ group: "tours" as const }] },
}

function runtime(): StorefrontShoppingRuntime {
  return {
    resolveScope: vi.fn(async () => scope),
    search: vi.fn(async () => ({
      kind: "indexed-inspiration" as const,
      scope,
      groups: [{ group: "tours" as const, items: [], total: 0 }],
    })),
  }
}

function tripRuntime(): StorefrontTripSelectionsRuntime {
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
  }
}

function app(
  options: Parameters<typeof createStorefrontShoppingPublicRoutes>[0] = {},
  context: {
    active?: boolean
    anonymous?: boolean
    userId?: string
    buyerAccountId?: string
  } = {},
) {
  const root = new Hono()
  root.use("*", requestId)
  root.use("*", async (c, next) => {
    c.set(
      "storefrontChannel" as never,
      {
        storefrontId: "sf_server",
        channelId: "chan_server",
        channelStatus: context.active === false ? "inactive" : "active",
      } as never,
    )
    c.set("isAnonymousRequest" as never, (context.anonymous ?? true) as never)
    if (context.userId) c.set("userId" as never, context.userId as never)
    if (context.buyerAccountId) c.set("buyerAccountId" as never, context.buyerAccountId as never)
    await next()
  })
  root.onError((cause, c) => handleApiError(cause, c))
  root.route("/v1/public/shopping", createStorefrontShoppingPublicRoutes(options))
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

describe("Storefront shopping public routes", () => {
  it("keeps the canonical public capability paths in the OpenAPI registry", () => {
    const routes = createStorefrontShoppingPublicRoutes()
    expect([
      ...new Set(
        routes.routes
          .filter(({ method }) => method !== "ALL")
          .map(({ method, path }) => `${method} ${path}`),
      ),
    ]).toEqual(["POST /search", "POST /trip-selections", "PATCH /trip-selections"])
  })

  it("requires an active server-resolved Storefront Channel and ignores no browser selector", async () => {
    const shopping = runtime()
    const response = await app({ shopping }, { active: false }).request(
      jsonRequest("/v1/public/shopping/search", searchBody),
    )
    expect(response.status).toBe(403)
    expect(shopping.search).not.toHaveBeenCalled()

    const spoofed = await app({ shopping }).request(
      jsonRequest("/v1/public/shopping/search", { ...searchBody, providerId: "provider_browser" }),
    )
    expect(spoofed.status).toBe(400)
    expect(await spoofed.json()).toMatchObject({
      code: "invalid_request",
      requestId: expect.any(String),
    })
  })

  it("returns an explicit PII-free 503 when optional runtimes are unbound", async () => {
    const response = await app().request(jsonRequest("/v1/public/shopping/search", searchBody))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: "storefront_shopping_unavailable",
      requestId: expect.any(String),
    })
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.get("vary")).toContain("Cookie")
    expect(response.headers.get("x-request-id")).toBeTruthy()
  })

  it("bounds JSON bodies with absent or misleading Content-Length before provider invocation", async () => {
    const shopping = runtime()
    const oversizedBody = { ...searchBody, padding: "x".repeat(65 * 1024) }
    const absentLength = await app({ shopping }).request(
      jsonRequest("/v1/public/shopping/search", oversizedBody),
    )
    expect(absentLength.status).toBe(413)
    expect(absentLength.headers.get("cache-control")).toBe("private, no-store")
    expect(await absentLength.json()).toMatchObject({
      code: "request_body_too_large",
      maxBytes: 64 * 1024,
      requestId: expect.any(String),
    })

    const misleadingLength = await app({ shopping }).request(
      jsonRequest("/v1/public/shopping/search", oversizedBody, {
        headers: { "content-length": "1" },
      }),
    )
    expect(misleadingLength.status).toBe(413)
    expect(shopping.search).not.toHaveBeenCalled()
  })

  it("propagates only managed customer ownership from request auth context", async () => {
    const shopping = runtime()
    const response = await app(
      { shopping },
      { anonymous: false, userId: "usr_managed", buyerAccountId: "buyer_managed" },
    ).request(jsonRequest("/v1/public/shopping/search", searchBody))
    expect(response.status).toBe(200)
    expect(shopping.search).toHaveBeenCalledWith(
      {
        storefrontId: "sf_server",
        channelId: "chan_server",
        userId: "usr_managed",
        buyerAccountId: "buyer_managed",
      },
      expect.anything(),
    )
    expect(response.headers.get("cache-control")).toBe("private, no-store")
  })

  it("shares only production anonymous indexed inspiration with a presentation/FX cache tag", async () => {
    const publicResponse = await app({ shopping: runtime(), production: true }).request(
      jsonRequest("/v1/public/shopping/search", searchBody, {
        headers: { "x-api-key": "storefront_key" },
      }),
    )
    expect(publicResponse.status).toBe(200)
    expect(publicResponse.headers.get("cache-control")).toBe("public, s-maxage=60")
    expect(publicResponse.headers.get("cache-tag")).toMatch(/^storefront-shopping-[a-f0-9]{64}$/)
    expect(publicResponse.headers.get("vary")).toBeNull()

    const cookieResponse = await app({ shopping: runtime(), production: true }).request(
      jsonRequest("/v1/public/shopping/search", searchBody, {
        headers: { cookie: "voyant.customer_session=opaque" },
      }),
    )
    expect(cookieResponse.headers.get("cache-control")).toBe("private, no-store")
    expect(cookieResponse.headers.get("vary")).toContain("Cookie")

    const liveBody = {
      scope: {},
      intent: {
        kind: "flight",
        slices: [{ origin: "OTP", destination: "LHR", departureDate: "2026-09-01" }],
        travelers: { adults: 1 },
      },
    }
    const liveShopping: StorefrontShoppingRuntime = {
      resolveScope: async () => scope,
      search: async () => ({
        kind: "flight",
        scope,
        offers: [],
        coverage: { status: "complete", succeeded: 1, failed: 0, timedOut: 0 },
      }),
    }
    const live = await app({ shopping: liveShopping, production: true }).request(
      jsonRequest("/v1/public/shopping/search", liveBody),
    )
    expect(live.headers.get("cache-control")).toBe("private, no-store")
  })

  it("rejects cross-site Trip mutations and maps provider CAS conflicts to 409", async () => {
    const trips = tripRuntime()
    const createBody = {
      scope: {},
      offers: [{ kind: "product", offerRef: "offer_ref_123456789" }],
    }
    const crossSite = await app({ shopping: runtime(), tripSelections: trips }).request(
      jsonRequest("/v1/public/shopping/trip-selections", createBody, {
        headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
      }),
    )
    expect(crossSite.status).toBe(403)
    expect(trips.create).not.toHaveBeenCalled()

    trips.update = vi.fn(async () => {
      throw new StorefrontTripSelectionRevisionConflictError()
    })
    const conflict = await app({ shopping: runtime(), tripSelections: trips }).request(
      jsonRequest(
        "/v1/public/shopping/trip-selections",
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
})
