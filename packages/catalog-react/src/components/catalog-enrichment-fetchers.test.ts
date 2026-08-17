import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { CatalogSearchHit } from "../index.js"

import {
  __resetEnrichmentFetcherWarnings,
  createCatalogEnrichmentFetchers,
} from "./catalog-enrichment-fetchers.js"

function hit(id: string): CatalogSearchHit {
  return {
    id,
    score: 1,
    document: {
      id,
      fields: {},
    },
  }
}

function ok(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  })
}

const samplePayload = {
  data: {
    content: {
      product: {
        id: "prod_1",
        name: "Test tour",
        description: "Long description",
        highlights: ["Hi", "Mountain"],
        hero_image_url: "https://example.com/hero.jpg",
        supplier: "supp_1",
      },
      options: [{ id: "opt_1", name: "Standard" }],
      days: [{ day_number: 1, title: "Arrival", description: "Land at airport" }],
      media: [{ url: "https://example.com/1.jpg", type: "image" }],
      policies: [{ kind: "cancellation", body: "no refunds" }],
      departures: [
        {
          id: "dep_1",
          starts_at: "2026-06-01T10:00:00Z",
          status: "open",
          capacity: 10,
          remaining: 7,
          lowest_price_cents: 12000,
          currency: "EUR",
        },
      ],
    },
    provenance: {
      source_kind: "demo",
      source_connection_id: "conn_demo",
      source_ref: "demo_prod_1",
    },
    served_locale: "en-GB",
    match_kind: "exact" as const,
    source: "sourced-cache" as const,
    served_stale: false,
    synthesized: false,
    machine_translated: false,
  },
}

describe("createCatalogEnrichmentFetchers", () => {
  beforeEach(() => {
    __resetEnrichmentFetcherWarnings()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("calls the configured baseUrl + default content path with the encoded id", async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>(async () => ok(samplePayload))
    const fetchers = createCatalogEnrichmentFetchers({
      baseUrl: "https://operator.example/api",
      fetch: fetchImpl,
    })

    await fetchers.loadProductDetail(hit("prod with space"))

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe("https://operator.example/api/v1/admin/products/prod%20with%20space/content")
    expect((init as RequestInit).method).toBe("GET")
    expect((init as RequestInit).credentials).toBe("include")
  })

  test("strips trailing slashes from baseUrl and honors contentBasePath", async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>(async () => ok(samplePayload))
    const fetchers = createCatalogEnrichmentFetchers({
      baseUrl: "https://operator.example/api/",
      contentBasePath: "/v1/public/products",
      fetch: fetchImpl,
    })

    await fetchers.loadProductDetail(hit("prod_1"))

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "https://operator.example/api/v1/public/products/prod_1/content",
    )
  })

  test("forwards locale and market as query params", async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>(async () => ok(samplePayload))
    const fetchers = createCatalogEnrichmentFetchers({
      baseUrl: "/api",
      fetch: fetchImpl,
      locale: "fr-FR",
      market: "mkt_eu",
    })

    await fetchers.loadProductDetail(hit("prod_1"))

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "/api/v1/admin/products/prod_1/content?locale=fr-FR&market=mkt_eu",
    )
  })

  test("routes the content fetch by vertical when contentBasePathByVertical is set", async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>(async () => ok(samplePayload))
    const fetchers = createCatalogEnrichmentFetchers({
      baseUrl: "/api",
      contentBasePathByVertical: {
        products: "/v1/admin/products",
        cruises: "/v1/admin/cruises",
      },
      fetch: fetchImpl,
    })

    await fetchers.loadProductDetail(hit("crus_1"), "cruises")
    expect(fetchImpl.mock.calls[0]![0]).toBe("/api/v1/admin/cruises/crus_1/content")

    await fetchers.loadProductDetail(hit("prod_1"), "products")
    expect(fetchImpl.mock.calls[1]![0]).toBe("/api/v1/admin/products/prod_1/content")
  })

  test("skips the fetch for verticals without a configured content route", async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>(async () => ok(samplePayload))
    const fetchers = createCatalogEnrichmentFetchers({
      baseUrl: "/api",
      contentBasePathByVertical: { cruises: "/v1/admin/cruises" },
      fetch: fetchImpl,
    })

    // Unmapped vertical → no request, projection-only.
    expect(await fetchers.loadProductDetail(hit("ext_1"), "extras")).toBeNull()
    // No vertical provided with a map → no request.
    expect(await fetchers.loadProductDetail(hit("crus_1"))).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  test("maps the content payload to a CatalogDetailEnrichment", async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>(async () => ok(samplePayload))
    const fetchers = createCatalogEnrichmentFetchers({
      baseUrl: "/api",
      fetch: fetchImpl,
      formatSupplier: (id) => `Supplier(${id})`,
    })

    const result = await fetchers.loadProductDetail(hit("prod_1"))
    expect(result).toMatchObject({
      description: "Long description",
      highlights: ["Hi", "Mountain"],
      heroImageUrl: "https://example.com/hero.jpg",
      supplier: "Supplier(supp_1)",
      itinerary: [{ dayNumber: 1, title: "Arrival" }],
      media: [{ url: "https://example.com/1.jpg", type: "image" }],
      options: [{ id: "opt_1", name: "Standard" }],
      policies: [{ kind: "cancellation", body: "no refunds" }],
      servedLocale: "en-GB",
      matchKind: "exact",
      source: "sourced-cache",
      sourceKind: "demo",
      sourceConnectionId: "conn_demo",
      sourceRef: "demo_prod_1",
      servedStale: false,
      synthesized: false,
      machineTranslated: false,
    })
    expect(result?.departures).toHaveLength(1)
    expect(result?.departures?.[0]).toMatchObject({
      id: "dep_1",
      startsAt: "2026-06-01T10:00:00Z",
      status: "open",
      capacity: 10,
      remaining: 7,
      lowestPriceCents: 12000,
      currency: "EUR",
    })
  })

  test("maps cruise sourced-content sailings to UI departures without decimal parsing", async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>(async () =>
      ok({
        data: {
          content: {
            cruise: {
              id: "crus_1",
              name: "Greek Isles",
              description: "Seven-night cruise",
              highlights: ["Aegean"],
              hero_image_url: "https://example.com/cruise.jpg",
              cruise_line: "Sample Line",
            },
            ship: {
              name: "MS Sample",
              deck_plan_url: "https://example.com/deck-plan.pdf",
              deck_plans: [
                { name: "Upper Deck", level: 3, image_url: "https://example.com/d3.jpg" },
              ],
              gallery: ["https://example.com/ship.jpg"],
            },
            sailings: [
              {
                id: "sail_1",
                source_ref: "ext_sail_1",
                start_date: "2026-06-01",
                end_date: "2026-06-08",
                duration_nights: 7,
                status: "open",
                embarkation_port: "Athens",
                disembarkation_port: "Athens",
                itinerary_stops: [
                  {
                    day_number: 1,
                    port_name: "Athens",
                    date: "2026-06-01",
                    departure_time: "17:00",
                  },
                  {
                    day_number: 2,
                    port_name: "Mykonos",
                    date: "2026-06-02",
                    arrival_time: "08:00",
                    departure_time: "18:00",
                  },
                ],
                lowest_price_cents: 349900,
                currency: "EUR",
              },
            ],
            cabin_categories: [
              {
                id: "cab_1",
                code: "BA",
                name: "Balcony",
                type: "balcony",
                images: ["https://example.com/cabin.jpg"],
                floorplan_images: ["https://example.com/cabin-plan.jpg"],
                square_feet: "270",
                grade_codes: ["BA", "BB"],
                wheelchair_accessible: true,
              },
            ],
            policies: [{ kind: "cancellation", body: "Free up to 60 days." }],
          },
          served_locale: "en-GB",
          match_kind: "exact",
          source: "sourced-fresh",
          served_stale: false,
          synthesized: false,
          machine_translated: false,
        },
      }),
    )
    const fetchers = createCatalogEnrichmentFetchers({ baseUrl: "/api", fetch: fetchImpl })

    const result = await fetchers.loadProductDetail(hit("crus_1"))

    expect(result).toMatchObject({
      description: "Seven-night cruise",
      highlights: ["Aegean"],
      heroImageUrl: "https://example.com/cruise.jpg",
      supplier: "Sample Line",
      ship: {
        name: "MS Sample",
        deckPlanUrl: "https://example.com/deck-plan.pdf",
        deckPlans: [{ name: "Upper Deck", level: 3, imageUrl: "https://example.com/d3.jpg" }],
        images: ["https://example.com/ship.jpg"],
      },
      // The cruise-level itinerary may be empty, so the Itinerary tab falls
      // back to the first sailing that has a route.
      itinerary: [
        { dayNumber: 1, title: "Athens", location: "Athens", date: "2026-06-01" },
        { dayNumber: 2, title: "Mykonos", location: "Mykonos", date: "2026-06-02" },
      ],
      options: [
        {
          id: "cab_1",
          name: "BA - Balcony",
          code: "BA",
          type: "balcony",
          images: ["https://example.com/cabin.jpg"],
          floorplanImages: ["https://example.com/cabin-plan.jpg"],
          squareFeet: "270",
          gradeCodes: ["BA", "BB"],
          wheelchairAccessible: true,
        },
      ],
      policies: [{ kind: "cancellation", body: "Free up to 60 days." }],
      source: "sourced-fresh",
    })
    expect(result?.departures?.[0]).toMatchObject({
      id: "sail_1",
      sourceRef: "ext_sail_1",
      startsAt: "2026-06-01",
      endsAt: "2026-06-08",
      durationNights: 7,
      status: "open",
      embarkationPort: "Athens",
      disembarkationPort: "Athens",
      lowestPriceCents: 349900,
      currency: "EUR",
      itinerary: [
        {
          dayNumber: 1,
          title: "Athens",
          location: "Athens",
          date: "2026-06-01",
          departureTime: "17:00",
        },
        {
          dayNumber: 2,
          title: "Mykonos",
          location: "Mykonos",
          date: "2026-06-02",
          arrivalTime: "08:00",
          departureTime: "18:00",
        },
      ],
    })
  })

  test("skips a sailing with no stops when falling back to a cruise itinerary", async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>(async () =>
      ok({
        data: {
          content: {
            cruise: { id: "crus_1", name: "Greek Isles" },
            sailings: [
              {
                id: "sail_1",
                start_date: "2026-06-01",
                end_date: "2026-06-08",
                itinerary_stops: [],
                lowest_price_cents: null,
                currency: null,
              },
              {
                id: "sail_2",
                start_date: "2026-07-01",
                end_date: "2026-07-08",
                itinerary_stops: [
                  { day_number: 1, port_name: "Athens", date: "2026-07-01" },
                  { day_number: 2, port_name: "Mykonos", date: "2026-07-02" },
                ],
                lowest_price_cents: null,
                currency: null,
              },
            ],
            policies: [],
          },
          served_locale: "en-GB",
          match_kind: "exact",
          source: "sourced-fresh",
          served_stale: false,
          synthesized: false,
          machine_translated: false,
        },
      }),
    )
    const fetchers = createCatalogEnrichmentFetchers({ baseUrl: "/api", fetch: fetchImpl })

    const result = await fetchers.loadProductDetail(hit("crus_1"))

    expect(result?.itinerary).toMatchObject([
      { dayNumber: 1, title: "Athens", date: "2026-07-01" },
      { dayNumber: 2, title: "Mykonos", date: "2026-07-02" },
    ])
  })

  test("sanitizes cruise cabin names (strips HTML, dedupes name===code grades)", async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>(async () =>
      ok({
        data: {
          content: {
            cruise: { id: "crus_1", name: "X", description: "", highlights: [], cruise_line: "L" },
            sailings: [],
            cabin_categories: [
              {
                id: "c1",
                code: "DV1",
                name: "<p>Deluxe Veranda Stateroom (DV)</p>",
                type: "balcony",
              },
              { id: "c2", code: "DV2", name: "DV2", type: "balcony" },
            ],
            policies: [],
          },
          served_locale: "en-GB",
          match_kind: "exact",
          source: "sourced-fresh",
          served_stale: false,
          synthesized: false,
          machine_translated: false,
        },
      }),
    )
    const fetchers = createCatalogEnrichmentFetchers({ baseUrl: "/api", fetch: fetchImpl })
    const result = await fetchers.loadProductDetail(hit("crus_1"))
    expect(result?.options).toEqual([
      {
        id: "c1",
        name: "DV1 - Deluxe Veranda Stateroom (DV)",
        description: null,
        code: "DV1",
        type: "balcony",
        images: [],
        floorplanImages: [],
        squareFeet: null,
        gradeCodes: [],
        wheelchairAccessible: false,
        capacityMax: null,
        amenities: [],
      },
      {
        id: "c2",
        name: "DV2",
        description: null,
        code: "DV2",
        type: "balcony",
        images: [],
        floorplanImages: [],
        squareFeet: null,
        gradeCodes: [],
        wheelchairAccessible: false,
        capacityMax: null,
        amenities: [],
      },
    ])
  })

  test("merges slot-availability data over the content departures", async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>(async () => ok(samplePayload))
    const fetchers = createCatalogEnrichmentFetchers({
      baseUrl: "/api",
      fetch: fetchImpl,
      loadSlotAvailability: async () =>
        new Map([["dep_1", { id: "dep_1", status: "sold_out", initialPax: 10, remainingPax: 0 }]]),
    })

    const result = await fetchers.loadProductDetail(hit("prod_1"))
    expect(result?.departures?.[0]).toMatchObject({
      status: "sold_out",
      capacity: 10,
      remaining: 0,
    })
  })

  test("returns null on 404 and 503 (no content row / cache unavailable)", async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>(
      async () => new Response(null, { status: 404 }),
    )
    const fetchers = createCatalogEnrichmentFetchers({ baseUrl: "/api", fetch: fetchImpl })
    expect(await fetchers.loadProductDetail(hit("prod_1"))).toBeNull()

    const fetchImpl503 = vi.fn<typeof globalThis.fetch>(
      async () => new Response(null, { status: 503 }),
    )
    const fetchers503 = createCatalogEnrichmentFetchers({ baseUrl: "/api", fetch: fetchImpl503 })
    expect(await fetchers503.loadProductDetail(hit("prod_1"))).toBeNull()
  })

  test("warns once on first 404 hinting at missing route mount", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const fetchImpl = vi.fn<typeof globalThis.fetch>(
      async () => new Response(null, { status: 404 }),
    )
    const fetchers = createCatalogEnrichmentFetchers({ baseUrl: "/api", fetch: fetchImpl })

    await fetchers.loadProductDetail(hit("a"))
    await fetchers.loadProductDetail(hit("b"))

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toMatch(/createProductContentRoutes/)
  })

  test("throws for non-404 server errors", async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>(
      async () => new Response("oops", { status: 500 }),
    )
    const fetchers = createCatalogEnrichmentFetchers({ baseUrl: "/api", fetch: fetchImpl })
    await expect(fetchers.loadProductDetail(hit("prod_1"))).rejects.toThrow(/500/)
  })

  test("tolerates slot-availability loader failures", async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>(async () => ok(samplePayload))
    const fetchers = createCatalogEnrichmentFetchers({
      baseUrl: "/api",
      fetch: fetchImpl,
      loadSlotAvailability: async () => {
        throw new Error("slots are down")
      },
    })

    const result = await fetchers.loadProductDetail(hit("prod_1"))
    // Falls back to content-payload departures unchanged.
    expect(result?.departures?.[0]?.status).toBe("open")
    expect(result?.departures?.[0]?.remaining).toBe(7)
  })
})
