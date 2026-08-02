import type {
  IndexerAdapter,
  IndexerSlice,
  SearchRequest,
  SearchResults,
} from "@voyant-travel/catalog-contracts/indexer/contract"
import { handleApiError } from "@voyant-travel/hono"
import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"

import {
  type CatalogSearchExecuteInput,
  createCatalogSearchApiModule,
  createCatalogSearchRoutes,
} from "./routes.js"

const emptyResults: SearchResults = { total: 0, hits: [], facets: {} }
const activeStorefrontChannel = {
  storefrontId: "sf_web",
  channelId: "chan_website",
  channelStatus: "active",
}

function createIndexer(
  search: (slice: IndexerSlice, request: SearchRequest) => Promise<SearchResults> = async () =>
    emptyResults,
): IndexerAdapter {
  return {
    capabilities: {
      supportsKeywordSearch: true,
      supportsHybridSearch: true,
      supportsVectorFields: true,
      vectorDimensions: 3,
      maxVectorsPerDocument: null,
      supportsCrossAudienceFederation: false,
      supportsAdminDenormalization: true,
    },
    ensureCollection: async () => {},
    upsert: async () => {},
    delete: async () => {},
    search,
    bulkReindex: async () => {},
  }
}

function routeApp(
  options: Parameters<typeof createCatalogSearchRoutes>[0],
  storefrontChannel: typeof activeStorefrontChannel | null = activeStorefrontChannel,
) {
  const app = new Hono()
  app.onError(handleApiError)
  if (options.surface === "public" && storefrontChannel) {
    app.use("*", async (c, next) => {
      c.set("storefrontChannel" as never, storefrontChannel as never)
      await next()
    })
  }
  app.route("/v1/admin/catalog", createCatalogSearchRoutes(options))
  return app
}

describe("createCatalogSearchRoutes", () => {
  it("exposes admin and public search routes through the API module wrapper", () => {
    const module = createCatalogSearchApiModule({
      resolveRuntime: () => ({
        indexer: createIndexer(),
        defaultScope: { locale: "en-GB", audience: "staff", market: "default" },
      }),
    })

    expect(module.module.name).toBe("catalog")
    expect(module.adminRoutes).toBeTruthy()
    expect(module.publicRoutes).toBeTruthy()
  })

  it("requires a vertical", async () => {
    const app = routeApp({
      surface: "admin",
      resolveRuntime: () => ({
        indexer: createIndexer(),
        defaultScope: { locale: "en-GB", audience: "staff", market: "default" },
      }),
    })

    const response = await app.request("/v1/admin/catalog/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "rome" }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: "vertical is required" })
  })

  it("returns shared validation errors for invalid search bodies", async () => {
    const executeSearch = vi.fn(
      async (_input: CatalogSearchExecuteInput): Promise<SearchResults> => emptyResults,
    )
    const app = routeApp({
      surface: "admin",
      resolveRuntime: () => ({
        indexer: createIndexer(),
        defaultScope: { locale: "en-GB", audience: "staff", market: "default" },
      }),
      executeSearch,
    })

    const response = await app.request("/v1/admin/catalog/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        vertical: "products",
        mode: "unknown",
        pagination: { limit: "10" },
      }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_request",
    })
    expect(executeSearch).not.toHaveBeenCalled()
  })

  it("returns a deployment error when no indexer is configured", async () => {
    const app = routeApp({
      surface: "admin",
      resolveRuntime: () => ({
        defaultScope: { locale: "en-GB", audience: "staff", market: "default" },
      }),
    })

    const response = await app.request("/v1/admin/catalog/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vertical: "products" }),
    })

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: "Search indexer is not configured for this deployment.",
    })
  })

  it("uses the admin default audience and the customer public audience", async () => {
    const executeSearch = vi.fn(
      async (_input: CatalogSearchExecuteInput): Promise<SearchResults> => emptyResults,
    )
    const module = createCatalogSearchApiModule({
      resolveRuntime: () => ({
        indexer: createIndexer(),
        defaultScope: { locale: "en-GB", audience: "staff", market: "default" },
      }),
      executeSearch,
    })
    const app = new Hono()
    app.use("/v1/public/*", async (c, next) => {
      c.set("storefrontChannel" as never, activeStorefrontChannel as never)
      await next()
    })
    app.route("/v1/admin/catalog", module.adminRoutes!)
    app.route("/v1/public/catalog", module.publicRoutes!)

    await app.request("/v1/admin/catalog/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vertical: "products", mode: "keyword" }),
    })
    await app.request("/v1/public/catalog/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vertical: "products", mode: "keyword", locale: "ro-RO" }),
    })

    expect(executeSearch.mock.calls[0]?.[0].slice).toEqual({
      vertical: "products",
      locale: "en-GB",
      audience: "staff",
      market: "default",
    })
    expect(executeSearch.mock.calls[1]?.[0].slice).toEqual({
      vertical: "products",
      locale: "ro-RO",
      audience: "customer",
      market: "default",
      channel: "chan_website",
    })
  })

  it("uses the trusted storefront channel for public search and permits admin preview channel", async () => {
    const executeSearch = vi.fn(
      async (_input: CatalogSearchExecuteInput): Promise<SearchResults> => emptyResults,
    )
    const module = createCatalogSearchApiModule({
      resolveRuntime: () => ({
        indexer: createIndexer(),
        defaultScope: {
          locale: "en-GB",
          audience: "staff",
          market: "default",
          channel: "chan_website",
        },
      }),
      executeSearch,
    })
    const app = new Hono()
    app.use("/v1/public/*", async (c, next) => {
      c.set("storefrontChannel" as never, activeStorefrontChannel as never)
      await next()
    })
    app.route("/v1/admin/catalog", module.adminRoutes!)
    app.route("/v1/public/catalog", module.publicRoutes!)

    await app.request("/v1/admin/catalog/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vertical: "products", mode: "keyword", channel: "chan_preview" }),
    })
    await app.request("/v1/public/catalog/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vertical: "products", mode: "keyword", channel: "chan_b2b" }),
    })

    expect(executeSearch.mock.calls[0]?.[0].slice.channel).toBe("chan_preview")
    expect(executeSearch.mock.calls[1]?.[0].slice.channel).toBe("chan_website")
  })

  it("denies public search without an active storefront channel context", async () => {
    const executeSearch = vi.fn(
      async (_input: CatalogSearchExecuteInput): Promise<SearchResults> => emptyResults,
    )
    const app = routeApp(
      {
        surface: "public",
        resolveRuntime: () => ({
          indexer: createIndexer(),
          defaultScope: { locale: "en-GB", audience: "staff", market: "default" },
        }),
        executeSearch,
      },
      null,
    )

    const response = await app.request("/v1/admin/catalog/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vertical: "products", mode: "keyword", channel: "chan_body" }),
    })

    expect(response.status).toBe(403)
    expect(executeSearch).not.toHaveBeenCalled()
  })

  it("downgrades semantic modes to keyword when embeddings are unavailable", async () => {
    const executeSearch = vi.fn(
      async (_input: CatalogSearchExecuteInput): Promise<SearchResults> => emptyResults,
    )
    const app = routeApp({
      surface: "admin",
      resolveRuntime: () => ({
        indexer: createIndexer(),
        defaultScope: { locale: "en-GB", audience: "staff", market: "default" },
      }),
      executeSearch,
    })

    const response = await app.request("/v1/admin/catalog/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vertical: "products", mode: "hybrid", query: "rome" }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ mode: "keyword" })
    expect(executeSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({ mode: "keyword" }),
      }),
    )
  })

  it("passes typed storefront sort options into the search request", async () => {
    const executeSearch = vi.fn(
      async (_input: CatalogSearchExecuteInput): Promise<SearchResults> => emptyResults,
    )
    const app = routeApp({
      surface: "public",
      resolveRuntime: () => ({
        indexer: createIndexer(),
        defaultScope: { locale: "en-GB", audience: "staff", market: "default" },
      }),
      executeSearch,
    })

    const response = await app.request("/v1/admin/catalog/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        vertical: "products",
        mode: "keyword",
        sort: "price-asc",
        pagination: { limit: 12 },
      }),
    })

    expect(response.status).toBe(200)
    expect(executeSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          sort: "price-asc",
          pagination: { limit: 12 },
        }),
      }),
    )
  })

  it("projects storefront cards from indexed fields when requested", async () => {
    const executeSearch = vi.fn(
      async (_input: CatalogSearchExecuteInput): Promise<SearchResults> => ({
        total: 1,
        facets: {
          "categorySlugs[]": [{ value: "cruises", count: 4 }],
        },
        hits: [
          {
            id: "prod_abc",
            score: 12,
            document: {
              id: "prod_abc",
              fields: {
                name: "Danube Cruise",
                slug: "danube-cruise",
                primaryCategoryId: "cat_cruises",
                primaryCategoryName: "Cruises",
                primaryCategorySlug: "cruises",
                thumbnailUrl: "https://cdn.example/thumb.jpg",
                coverMediaUrl: "https://cdn.example/cover.jpg",
                priceFromAmountCents: 125000,
                priceFromCurrency: "EUR",
                originalPriceFromAmountCents: 150000,
                hasOffer: true,
                bestOfferId: "offer_spring",
                bestOfferName: "Spring Sale",
                bestOfferDiscountKind: "percentage",
                bestOfferDiscountPercent: 15,
                upcomingDepartureCount: 3,
                nextDepartureAt: "2026-06-01T09:00:00Z",
                nextDepartureDate: "2026-06-01",
                "departureMonths[]": ["2026-06", "2026-07"],
                "departureDates[]": ["2026-06-01", "2026-07-15"],
                "regions[]": ["Europe"],
                "countries[]": ["Romania"],
                "cities[]": ["Tulcea"],
                "destinationIds[]": ["dest_ro"],
                "destinationSlugs[]": ["romania"],
                latitude: 45.18,
                longitude: 28.8,
              },
            },
          },
        ],
      }),
    )
    const module = createCatalogSearchApiModule({
      resolveRuntime: () => ({
        indexer: createIndexer(),
        defaultScope: { locale: "en-GB", audience: "staff", market: "default" },
      }),
      executeSearch,
    })
    const app = new Hono()
    app.use("/v1/public/*", async (c, next) => {
      c.set("storefrontChannel" as never, activeStorefrontChannel as never)
      await next()
    })
    app.route("/v1/public/catalog", module.publicRoutes!)

    const response = await app.request("/v1/public/catalog/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        vertical: "products",
        mode: "keyword",
        projection: "storefront-card",
        pagination: { limit: 12 },
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      total: 1,
      facets: {
        "categorySlugs[]": [{ value: "cruises", count: 4 }],
      },
      cards: [
        {
          id: "prod_abc",
          name: "Danube Cruise",
          slug: "danube-cruise",
          primaryCategory: {
            id: "cat_cruises",
            name: "Cruises",
            slug: "cruises",
          },
          media: {
            thumbnailUrl: "https://cdn.example/thumb.jpg",
            coverMediaUrl: "https://cdn.example/cover.jpg",
          },
          priceFrom: {
            amountCents: 125000,
            currency: "EUR",
            originalAmountCents: 150000,
          },
          offerBadges: [
            {
              id: "offer_spring",
              name: "Spring Sale",
              discountKind: "percentage",
              discountPercent: 15,
              discountAmountCents: null,
            },
          ],
          departures: {
            upcomingCount: 3,
            nextDepartureAt: "2026-06-01T09:00:00Z",
            nextDepartureDate: "2026-06-01",
            months: ["2026-06", "2026-07"],
            dates: ["2026-06-01", "2026-07-15"],
          },
          destinations: {
            regions: ["Europe"],
            countries: ["Romania"],
            cities: ["Tulcea"],
            ids: ["dest_ro"],
            slugs: ["romania"],
          },
          coordinates: {
            latitude: 45.18,
            longitude: 28.8,
          },
        },
      ],
    })
  })

  it("returns the declared search-result wire shape with the next cursor", async () => {
    const executeSearch = vi.fn(
      async (_input: CatalogSearchExecuteInput): Promise<SearchResults> => ({
        total: 2,
        totalRelation: "gte",
        next_cursor: "cursor-page-2",
        facets: { "regions[]": [{ value: "Europe", count: 2 }] },
        hits: [
          { id: "prod_a", score: 9.5, document: { id: "prod_a", fields: { name: "Alpha" } } },
          { id: "prod_b", score: 4.25, document: { id: "prod_b", fields: { name: "Beta" } } },
        ],
      }),
    )
    const app = routeApp({
      surface: "public",
      resolveRuntime: () => ({
        indexer: createIndexer(),
        defaultScope: { locale: "en-GB", audience: "staff", market: "default" },
      }),
      executeSearch,
    })

    const response = await app.request("/v1/admin/catalog/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vertical: "products", mode: "keyword" }),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body).toMatchObject({
      vertical: "products",
      mode: "keyword",
      total: 2,
      totalRelation: "gte",
      next_cursor: "cursor-page-2",
      hits: [
        { id: "prod_a", score: 9.5, document: { id: "prod_a", fields: { name: "Alpha" } } },
        { id: "prod_b", score: 4.25, document: { id: "prod_b", fields: { name: "Beta" } } },
      ],
      facets: { "regions[]": [{ value: "Europe", count: 2 }] },
    })
    // `cards` is omitted unless storefront-card projection is requested.
    expect(body.cards).toBeUndefined()
  })

  it("retries hybrid searches as keyword when semantic execution fails", async () => {
    const executeSearch = vi
      .fn(async (_input: CatalogSearchExecuteInput): Promise<SearchResults> => emptyResults)
      .mockRejectedValueOnce(new Error("embedding provider unavailable"))
      .mockResolvedValueOnce(emptyResults)
    const app = routeApp({
      surface: "admin",
      resolveRuntime: () => ({
        indexer: createIndexer(),
        embeddings: { kind: "test-embeddings" },
        defaultScope: { locale: "en-GB", audience: "staff", market: "default" },
      }),
      executeSearch,
    })

    const response = await app.request("/v1/admin/catalog/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vertical: "products", mode: "hybrid", query: "rome" }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ mode: "keyword" })
    expect(executeSearch.mock.calls.map(([input]) => input.request.mode)).toEqual([
      "hybrid",
      "keyword",
    ])
  })
})
