import { handleApiError, requestId } from "@voyant-travel/hono"
import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"

import {
  createPublicApiShoppingPublicRoutes,
  type PublicApiShoppingRuntime,
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

function runtime(): PublicApiShoppingRuntime {
  return {
    resolveScope: vi.fn(async () => scope),
    search: vi.fn(async () => ({
      kind: "indexed-inspiration" as const,
      scope,
      groups: [{ group: "tours" as const, items: [], total: 0 }],
    })),
  }
}

function app(
  options: Parameters<typeof createPublicApiShoppingPublicRoutes>[0] = {},
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
      "publicChannel" as never,
      {
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
  root.route("/v1/public/shopping", createPublicApiShoppingPublicRoutes(options))
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
    const routes = createPublicApiShoppingPublicRoutes()
    expect([
      ...new Set(
        routes.routes
          .filter(({ method }) => method !== "ALL")
          .map(({ method, path }) => `${method} ${path}`),
      ),
      // Narrowed to its name (voyant#4627): of the three routes this module
      // used to serve, only `/search` is the NDC shopping phase. The
      // order-phase trip-selection routes moved to `@voyant-travel/trips`.
    ]).toEqual(["POST /search"])
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

  it("returns a bounded 400 for an unsupported managed scope", async () => {
    const shopping = runtime()
    vi.mocked(shopping.search).mockRejectedValueOnce({
      code: "storefront_shopping_scope_unsupported",
      selector: "locale",
      requested: "en",
    })
    const response = await app({ shopping }).request(
      jsonRequest("/v1/public/shopping/search", searchBody),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: "storefront_shopping_scope_unsupported",
      requestId: expect.any(String),
    })
    expect(response.headers.get("cache-control")).toBe("private, no-store")
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
    const liveShopping: PublicApiShoppingRuntime = {
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
})
