import { OpenAPIHono } from "@hono/zod-openapi"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  type CatalogBookingRouteModuleOptions,
  createCatalogBookingOrdersRoutes,
  mountCatalogBookingRoutes,
} from "../../src/booking-engine/operator-routes.js"
import {
  type CatalogOffersRouteModuleOptions,
  createCatalogOffersAdminRoutes,
} from "../../src/offers/operator-routes.js"

/**
 * Response contract tests (voyant#2114 — catalog admin operator-routes batch)
 * for the converted JSON-returning legs. Each test mounts the real `.openapi()`
 * factory with stubbed injected options and exercises the dependency-free paths
 * (null Connect client / invalid body / non-products slots), then validates the
 * JSON against schemas that mirror the response shapes declared in
 * `offers/operator-routes.ts` + `booking-engine/operator-routes.ts`. A
 * declared/actual mismatch breaks the test; the `passthrough`-free `z.object`
 * strips extras so the heterogeneous offer rows stay tolerant.
 */

// --- schemas mirroring the declared offer responses --------------------------

const offerErrorSchema = z.object({ error: z.string(), details: z.unknown().optional() })
const airportLabelSchema = z.object({ code: z.string(), label: z.string() })

const packageOffersResponseSchema = z.object({
  product: z.unknown().nullish(),
  offers: z.array(z.unknown()),
  retryable: z.boolean().optional(),
  error: z.string().optional(),
})

const packageSearchResponseSchema = z.object({
  offers: z.array(z.unknown()),
  departureAirports: z.array(airportLabelSchema).optional(),
  currency: z.string().optional(),
  sampledHotels: z.number().optional(),
  retryable: z.boolean().optional(),
  error: z.string().optional(),
})

const departureAirportsResponseSchema = z.object({
  departureAirports: z.array(airportLabelSchema),
})

const cruisePriceResponseSchema = z.object({
  fromAmountMinor: z.number().nullable(),
  currency: z.string().nullable(),
})

// --- schemas mirroring the declared booking responses ------------------------

const errorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
})

const slotsResponseSchema = z.object({
  rows: z.array(z.unknown()),
})

// --- stub injected options (no network / no db on the exercised paths) -------

const offerOptions: CatalogOffersRouteModuleOptions = {
  resolveConnectClient: () => null,
  fetchIndexFields: async () => new Map(),
  resolveDynamicHotelIds: async () => [],
  resolveAirportLabels: async (_c, codes) => codes.map((code) => ({ code, label: code })),
}

// The booking-module stubs are only reached AFTER the dependency-free guards on
// the exercised legs (invalid body / non-products slots), so the resolvers throw
// to prove they're never hit on these paths.
const bookingOptions = {
  resolveDb: () => {
    throw new Error("resolveDb should not be reached on the tested paths")
  },
  resolveRegistry: () => {
    throw new Error("resolveRegistry should not be reached on the tested paths")
  },
  getProductContent: async () => null,
  listAvailabilitySlots: async () => [],
  getOwnedProductById: async () => null,
} as unknown as CatalogBookingRouteModuleOptions

function postJson(
  app: { request: (p: string, init: RequestInit) => Promise<Response> },
  path: string,
  body: unknown,
) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("catalog offers admin routes (openapi)", () => {
  const app = createCatalogOffersAdminRoutes(offerOptions)

  it("POST /package-offers → 400 invalid_request on a malformed body", async () => {
    const res = await postJson(app, "/package-offers", {})
    expect(res.status).toBe(400)
    expect(offerErrorSchema.parse(await res.json()).error).toBe("invalid_request")
  })

  it("POST /package-offers → 200 connect_not_configured when Connect is unset", async () => {
    const res = await postJson(app, "/package-offers", {
      productId: "p1",
      departureDateFrom: "2026-07-01",
      departureDateTo: "2026-07-31",
    })
    expect(res.status).toBe(200)
    const body = packageOffersResponseSchema.parse(await res.json())
    expect(body.error).toBe("connect_not_configured")
    expect(body.offers).toEqual([])
  })

  it("POST /package-search → 200 connect_not_configured when Connect is unset", async () => {
    const res = await postJson(app, "/package-search", {
      destination: { city: "Antalya" },
      departureDateFrom: "2026-07-01",
      departureDateTo: "2026-07-31",
    })
    expect(res.status).toBe(200)
    const body = packageSearchResponseSchema.parse(await res.json())
    expect(body.error).toBe("connect_not_configured")
  })

  it("POST /departure-airports → 200 empty list on invalid body", async () => {
    const res = await postJson(app, "/departure-airports", {})
    expect(res.status).toBe(200)
    expect(departureAirportsResponseSchema.parse(await res.json()).departureAirports).toEqual([])
  })

  it("POST /cruise-price → 200 null price when Connect is unset", async () => {
    const res = await postJson(app, "/cruise-price", { cruiseId: "crus_sr_x" })
    expect(res.status).toBe(200)
    const body = cruisePriceResponseSchema.parse(await res.json())
    expect(body.fromAmountMinor).toBeNull()
    expect(body.currency).toBeNull()
  })
})

describe("catalog booking orders admin routes (openapi)", () => {
  const app = createCatalogBookingOrdersRoutes(bookingOptions)

  it("POST /orders/{id}/cancel → 400 when required body fields are missing", async () => {
    const res = await postJson(app, "/orders/ord_1/cancel", {})
    expect(res.status).toBe(400)
    expect(errorResponseSchema.parse(await res.json()).error).toContain("required")
  })
})

describe("catalog booking mount target slots leg (openapi)", () => {
  const app = new OpenAPIHono()
  mountCatalogBookingRoutes(app, bookingOptions)

  it("GET /v1/admin/catalog/slots → 200 empty rows for non-product verticals", async () => {
    const res = await app.request("/v1/admin/catalog/slots?entityModule=cruises&entityId=crus_1", {
      method: "GET",
    })
    expect(res.status).toBe(200)
    expect(slotsResponseSchema.parse(await res.json()).rows).toEqual([])
  })

  it("GET /v1/admin/catalog/slots → 400 when entityModule/entityId are absent", async () => {
    const res = await app.request("/v1/admin/catalog/slots", { method: "GET" })
    expect(res.status).toBe(400)
    expect(errorResponseSchema.parse(await res.json()).error).toContain("required")
  })
})
