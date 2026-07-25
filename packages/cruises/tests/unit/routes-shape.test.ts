// agent-quality: file-size exception -- owner: cruises; existing coverage file stays co-located until a dedicated split preserves behavior and tests.
import { mountTestApp } from "@voyant-travel/voyant-test-utils/http"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ExternalCruise, ExternalSailing } from "../../src/adapters/index.js"
import { MockCruiseAdapter } from "../../src/adapters/mock.js"
import { clearCruiseAdapters, registerCruiseAdapter } from "../../src/adapters/registry.js"
import { cruiseAdminRoutes } from "../../src/routes.js"
import { cruisesService } from "../../src/service.js"
import { cruisesSearchService } from "../../src/service-search.js"

afterEach(() => {
  clearCruiseAdapters()
  vi.restoreAllMocks()
})

const seedCruise: ExternalCruise = {
  sourceRef: { externalId: "ext-cru-1" },
  name: "Norwegian Fjords",
  slug: "norwegian-fjords",
  cruiseType: "ocean",
  lineName: "Acme Cruises",
  defaultShipRef: { externalId: "ext-ship-1" },
  nights: 7,
}

const seedSailing: ExternalSailing = {
  sourceRef: { externalId: "ext-sl-1" },
  cruiseRef: seedCruise.sourceRef,
  shipRef: { externalId: "ext-ship-1" },
  departureDate: "2026-06-15",
  returnDate: "2026-06-22",
  salesStatus: "open",
}

describe("admin routes — static subresource ordering", () => {
  const app = mountTestApp(cruiseAdminRoutes, { db: undefined })

  it("routes GET /sailings to the sailings list handler instead of GET /:key", async () => {
    const listSailings = vi.spyOn(cruisesService, "listSailings").mockResolvedValueOnce({
      data: [],
      total: 0,
      limit: 25,
      offset: 0,
    })

    const res = await app.request("/sailings?limit=25&offset=0")

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data?: unknown[]; error?: string }
    expect(body.error).not.toBe("invalid_key")
    expect(body.data).toEqual([])
    expect(listSailings).toHaveBeenCalledTimes(1)
    expect(listSailings.mock.calls[0]?.[1]).toMatchObject({ limit: 25, offset: 0 })
  })

  it("keeps other one-segment static collections ahead of GET /:key", async () => {
    vi.spyOn(cruisesService, "listShips").mockResolvedValueOnce({
      data: [],
      total: 0,
      limit: 25,
      offset: 0,
    })
    vi.spyOn(cruisesService, "listPrices").mockResolvedValueOnce({
      data: [],
      total: 0,
      limit: 25,
      offset: 0,
    })

    const shipsRes = await app.request("/ships?limit=25&offset=0")
    const pricesRes = await app.request("/prices?limit=25&offset=0")

    expect(shipsRes.status).toBe(200)
    expect(pricesRes.status).toBe(200)
    await expect(shipsRes.json()).resolves.toMatchObject({ data: [] })
    await expect(pricesRes.json()).resolves.toMatchObject({ data: [] })
  })

  it("routes voyage group collections ahead of GET /:key", async () => {
    const listVoyageGroups = vi.spyOn(cruisesService, "listVoyageGroups").mockResolvedValueOnce({
      data: [],
      total: 0,
      limit: 25,
      offset: 0,
    })

    const res = await app.request("/voyage-groups?limit=25&offset=0")

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ data: [] })
    expect(listVoyageGroups).toHaveBeenCalledTimes(1)
  })
})

describe("admin routes — voyage groups", () => {
  const app = mountTestApp(cruiseAdminRoutes, { db: undefined })

  it("creates voyage groups with composite voyage fields", async () => {
    vi.spyOn(cruisesService, "createVoyageGroup").mockResolvedValueOnce({
      id: "crvg_123",
      slug: "world-cruise-2027",
      name: "World Cruise 2027",
      groupKind: "world_cruise",
      lineSupplierId: null,
      nights: 120,
      embarkPortFacilityId: null,
      embarkPortCanonicalPlaceId: null,
      disembarkPortFacilityId: null,
      disembarkPortCanonicalPlaceId: null,
      description: null,
      shortDescription: null,
      highlights: [],
      regions: [],
      themes: [],
      heroImageUrl: null,
      mapImageUrl: null,
      status: "draft",
      lowestPriceCached: null,
      lowestPriceCurrencyCached: null,
      earliestDepartureCached: null,
      latestDepartureCached: null,
      externalRefs: {},
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    })

    const res = await app.request("/voyage-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: "world-cruise-2027",
        name: "World Cruise 2027",
        groupKind: "world_cruise",
        nights: 120,
      }),
    })

    expect(res.status).toBe(201)
    expect(cruisesService.createVoyageGroup).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ groupKind: "world_cruise", nights: 120 }),
    )
  })

  it("creates scoped pre-extension segments from the voyage group route", async () => {
    vi.spyOn(cruisesService, "createVoyageGroupSegment").mockResolvedValueOnce({
      id: "crvs_123",
      voyageGroupId: "crvg_123",
      sortOrder: 0,
      segmentKind: "land",
      segmentRole: "pre_extension",
      title: "Reykjavik pre-tour",
      description: null,
      cruiseId: null,
      sailingId: null,
      startDay: 1,
      endDay: 3,
      startDate: null,
      endDate: null,
      embarkPortFacilityId: null,
      embarkPortCanonicalPlaceId: null,
      disembarkPortFacilityId: null,
      disembarkPortCanonicalPlaceId: null,
      nights: 2,
      externalRefs: {},
      metadata: {},
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    })

    const res = await app.request("/voyage-groups/crvg_123/segments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sortOrder: 0,
        segmentKind: "land",
        segmentRole: "pre_extension",
        title: "Reykjavik pre-tour",
        startDay: 1,
        endDay: 3,
        nights: 2,
      }),
    })

    expect(res.status).toBe(201)
    expect(cruisesService.createVoyageGroupSegment).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        voyageGroupId: "crvg_123",
        segmentKind: "land",
        segmentRole: "pre_extension",
      }),
    )
  })
})

describe("admin routes — search index bulk", () => {
  const app = mountTestApp(cruiseAdminRoutes, { db: undefined })

  it("passes canonical geography arrays through the bulk route schema", async () => {
    const bulkUpsert = vi
      .spyOn(cruisesSearchService, "bulkUpsert")
      .mockResolvedValueOnce({ upserted: 1 })

    const entry = {
      source: "external",
      sourceProvider: "voyant-connect",
      sourceRef: { externalId: "ext-cru-1", connectionId: "cnx_123" },
      slug: "danube-discovery",
      name: "Danube Discovery",
      cruiseType: "river",
      lineName: "Acme Cruises",
      shipName: "River Star",
      nights: 7,
      embarkPortName: "Budapest",
      disembarkPortName: "Vienna",
      regionIds: ["region:europe"],
      waterwayIds: ["river:Q1653"],
      portIds: ["port:budapest", "port:vienna"],
      countryIso: ["HU", "AT"],
      regions: ["Europe"],
      waterways: ["Danube"],
      ports: ["Budapest", "Vienna"],
      countries: ["Hungary", "Austria"],
      themes: ["culture"],
      earliestDeparture: "2026-07-01",
      latestDeparture: "2026-07-08",
      departureCount: 1,
      lowestPriceCents: 120000,
      lowestPriceCurrency: "EUR",
      salesStatus: "open",
      heroImageUrl: "https://example.com/cruises/danube.jpg",
    }

    const res = await app.request("/search-index/bulk", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: [entry] }),
    })

    expect(res.status).toBe(200)
    expect(bulkUpsert).toHaveBeenCalledWith(
      undefined,
      expect.arrayContaining([
        expect.objectContaining({
          regionIds: entry.regionIds,
          waterwayIds: entry.waterwayIds,
          portIds: entry.portIds,
          countryIso: entry.countryIso,
          regions: entry.regions,
          waterways: entry.waterways,
          ports: entry.ports,
          countries: entry.countries,
          departureCount: entry.departureCount,
          lowestPriceCents: entry.lowestPriceCents,
        }),
      ]),
    )
  })
})

describe("admin routes — external key dispatch (no catalog registry configured)", () => {
  // Per the catalog-sourced-content migration, the /:key external
  // branch dispatches through getCruiseContent — which needs the
  // catalog SourceAdapterRegistry set on c.var. Without it, the route
  // returns 503 with a clear "configure the registry" message.
  const app = mountTestApp(cruiseAdminRoutes, { db: undefined })

  it("returns 503 + registry_not_configured on GET /:key when no registry is set", async () => {
    const res = await app.request("/voyant-connect:cnx_abc")
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("registry_not_configured")
  })

  it("returns 503 on POST /:key/refresh when no registry is set", async () => {
    const res = await app.request("/voyant-connect:cnx_abc/refresh", { method: "POST" })
    expect(res.status).toBe(503)
  })
})

describe("admin routes — write rejection on external rows", () => {
  const app = mountTestApp(cruiseAdminRoutes, { db: undefined })

  it("returns 409 + external_cruise_read_only on PUT /:key with external key", async () => {
    const res = await app.request("/voyant-connect:cnx_abc", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("external_cruise_read_only")
  })

  it("returns 409 on DELETE /:key with external key", async () => {
    const res = await app.request("/voyant-connect:cnx_abc", { method: "DELETE" })
    expect(res.status).toBe(409)
  })

  it("returns 409 on PUT /sailings/:key/pricing/bulk with external key", async () => {
    const res = await app.request("/sailings/voyant-connect:cnx_abc/pricing/bulk", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prices: [] }),
    })
    expect(res.status).toBe(409)
  })
})

describe("admin routes — invalid keys + local detach guards", () => {
  const app = mountTestApp(cruiseAdminRoutes, { db: undefined })

  it("returns 400 on POST /:key/refresh with a local key", async () => {
    const res = await app.request("/cru_abc123/refresh", { method: "POST" })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("local_cruise_no_refresh")
  })

  it("returns 400 on POST /:key/detach with a local key", async () => {
    const res = await app.request("/cru_abc123/detach", { method: "POST" })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("local_cruise_no_detach")
  })

  it("returns 400 for malformed keys", async () => {
    const res = await app.request("/not-a-typeid-and-not-external")
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("invalid_key")
  })
})

describe("admin routes — external dispatch via registered adapter", () => {
  // Note: GET /:key (cruise detail) and POST /:key/refresh now
  // dispatch through getCruiseContent (catalog content service), which
  // requires both a SourceAdapterRegistry on c.var and a sourced-entry
  // row in the DB. The "happy-path" adapter-dispatch tests for those
  // paths live in routes-content.test.ts (which exercises the
  // identical getCruiseContent logic with a mocked module). Per-key
  // sailings + ships routes below remain on the cruise vertical's own
  // adapter registry path.
  it("GET /:key/sailings returns the external sailings", async () => {
    const adapter = new MockCruiseAdapter({ name: "voyant-connect" })
    adapter.addCruise(seedCruise, [seedSailing])
    registerCruiseAdapter(adapter)
    const app = mountTestApp(cruiseAdminRoutes, { db: undefined })

    const res = await app.request("/voyant-connect:ext-cru-1/sailings")
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: Array<{ source: string; sailing: { departureDate: string } }>
    }
    expect(body.data).toHaveLength(1)
    expect(body.data[0]?.source).toBe("external")
    expect(body.data[0]?.sailing.departureDate).toBe("2026-06-15")
  })

  it("GET /sailings/:key returns the external sailing", async () => {
    const adapter = new MockCruiseAdapter({ name: "voyant-connect" })
    adapter.addCruise(seedCruise, [seedSailing])
    registerCruiseAdapter(adapter)
    const app = mountTestApp(cruiseAdminRoutes, { db: undefined })

    const res = await app.request("/sailings/voyant-connect:ext-sl-1")
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { source: string; sailing: { departureDate: string } }
    }
    expect(body.data.source).toBe("external")
    expect(body.data.sailing.departureDate).toBe("2026-06-15")
  })

  it("GET /sailings/:key?include=pricing,itinerary returns nested data", async () => {
    const adapter = new MockCruiseAdapter({ name: "voyant-connect" })
    adapter.addCruise(seedCruise, [seedSailing])
    adapter.setSailingPricing(seedSailing.sourceRef, [
      {
        cabinCategoryRef: { externalId: "cat-A" },
        occupancy: 2,
        currency: "USD",
        pricePerPerson: "1500.00",
        availability: "available",
      },
    ])
    adapter.setSailingItinerary(seedSailing.sourceRef, [{ dayNumber: 1, portName: "Bergen" }])
    registerCruiseAdapter(adapter)
    const app = mountTestApp(cruiseAdminRoutes, { db: undefined })

    const res = await app.request("/sailings/voyant-connect:ext-sl-1?include=pricing,itinerary")
    const body = (await res.json()) as {
      data: { pricing: unknown[]; itinerary: unknown[] }
    }
    expect(body.data.pricing).toHaveLength(1)
    expect(body.data.itinerary).toHaveLength(1)
  })

  it("GET /sailings/:key/pricing returns external sailing pricing", async () => {
    const adapter = new MockCruiseAdapter({ name: "voyant-connect" })
    adapter.addCruise(seedCruise, [seedSailing])
    adapter.setSailingPricing(seedSailing.sourceRef, [
      {
        cabinCategoryRef: { externalId: "cat-A" },
        occupancy: 2,
        currency: "USD",
        pricePerPerson: "1500.00",
        availability: "available",
      },
    ])
    registerCruiseAdapter(adapter)
    const app = mountTestApp(cruiseAdminRoutes, { db: undefined })

    const res = await app.request("/sailings/voyant-connect:ext-sl-1/pricing")
    const body = (await res.json()) as { data: unknown[] }
    expect(res.status).toBe(200)
    expect(body.data).toHaveLength(1)
  })

  // POST /:key/refresh happy-path coverage moves to routes-content
  // tests once the SWR-aware refresh path lives there. The route's
  // contract (registry required, dispatch via getCruiseContent +
  // invalidateCruiseContentOnDrift) is identical to GET /:key external
  // — see the "registry not configured" tests above for the boundary.

  it("POST /sailings/:key/quote composes a quote from upstream pricing", async () => {
    const adapter = new MockCruiseAdapter({ name: "voyant-connect" })
    adapter.addCruise(seedCruise, [seedSailing])
    adapter.setSailingPricing(seedSailing.sourceRef, [
      {
        cabinCategoryRef: { externalId: "cat-A" },
        occupancy: 2,
        currency: "USD",
        pricePerPerson: "2000.00",
        availability: "available",
        components: [
          {
            kind: "gratuity",
            label: "Pre-paid gratuities",
            amount: "15.00",
            currency: "USD",
            direction: "addition",
            perPerson: true,
          },
        ],
      },
    ])
    registerCruiseAdapter(adapter)
    const app = mountTestApp(cruiseAdminRoutes, { db: undefined })

    const res = await app.request("/sailings/voyant-connect:ext-sl-1/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cabinCategoryId: "cat-A",
        occupancy: 2,
        guestCount: 2,
      }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { totalForCabin: string } }
    // 2000 × 2 + 15 × 2 = 4030
    expect(body.data.totalForCabin).toBe("4030.00")
  })

  it("POST /sailings/:key/quote returns 404 when no matching price exists", async () => {
    const adapter = new MockCruiseAdapter({ name: "voyant-connect" })
    adapter.addCruise(seedCruise, [seedSailing])
    adapter.setSailingPricing(seedSailing.sourceRef, [])
    registerCruiseAdapter(adapter)
    const app = mountTestApp(cruiseAdminRoutes, { db: undefined })

    const res = await app.request("/sailings/voyant-connect:ext-sl-1/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cabinCategoryId: "cat-X",
        occupancy: 2,
        guestCount: 2,
      }),
    })
    expect(res.status).toBe(404)
  })
})

// Search-index endpoints (phase 4) are real DB-backed handlers — coverage for
// them lives with the deferred integration test suite that runs against a real
// Postgres test database (TEST_DATABASE_URL).
