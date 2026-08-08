import type {
  IndexerAdapter,
  SearchResults,
} from "@voyant-travel/catalog-contracts/indexer/contract"
import {
  isProductOwnedVertical,
  owningVerticalFor,
} from "@voyant-travel/catalog-contracts/indexer/contract"
import { describe, expect, it, vi } from "vitest"
import {
  buildCatalogEmbeddingProvider,
  buildCatalogSlices,
  createCatalogOffersSearchResolvers,
  DEFAULT_CATALOG_SLICES,
  DEFAULT_CATALOG_VERTICALS,
  withCatalogEmbedding,
  withoutCatalogScopeChannel,
} from "./runtime-support.js"
import type { DocumentBuilderContext } from "./services/indexer-service.js"

const scope = withoutCatalogScopeChannel({
  locale: "ro-RO",
  audience: "staff",
  market: "ro",
  channel: "website",
})

describe("catalog embedding provider selection", () => {
  it("allows keyword-only deployments to explicitly disable embeddings", () => {
    expect(
      buildCatalogEmbeddingProvider({
        VOYANT_API_KEY: "cloud-api-key",
        CATALOG_EMBEDDING_PROVIDER: "none",
      }),
    ).toBeUndefined()
  })
})

function createIndexer(search: IndexerAdapter["search"]): IndexerAdapter {
  return {
    capabilities: {
      supportsKeywordSearch: true,
      supportsHybridSearch: false,
      supportsVectorFields: false,
      vectorDimensions: null,
      maxVectorsPerDocument: null,
      supportsCrossAudienceFederation: false,
      supportsAdminDenormalization: false,
    },
    async ensureCollection() {},
    async upsert() {},
    async delete() {},
    search,
    async bulkReindex() {},
  }
}

function searchResults(
  hits: Array<{ id: string; fields?: Record<string, unknown> }>,
): SearchResults {
  return {
    hits: hits.map((hit) => ({
      id: hit.id,
      score: 0,
      document: { id: hit.id, fields: hit.fields ?? {} },
    })),
    total: hits.length,
  }
}

describe("catalog offer search resolvers", () => {
  it("searches the scoped products slice in deduplicated batches of 80", async () => {
    const search = vi
      .fn<IndexerAdapter["search"]>()
      .mockResolvedValueOnce(
        searchResults([
          {
            id: "product-0",
            fields: {
              name: "Hotel Zero",
              thumbnailUrl: "https://cdn.test/zero.jpg",
              internalSupplierNotes: "must not leak",
            },
          },
        ]),
      )
      .mockResolvedValueOnce(searchResults([{ id: "product-80", fields: { stars: 5 } }]))
    const resolvers = createCatalogOffersSearchResolvers(
      () => createIndexer(search),
      () => scope,
    )
    const ids = [...Array.from({ length: 82 }, (_, index) => `product-${index}`), "product-0"]

    const fields = await resolvers.fetchIndexFields({}, ids)

    expect(search).toHaveBeenCalledTimes(2)
    expect(search).toHaveBeenNthCalledWith(
      1,
      { vertical: "products", locale: "ro-RO", audience: "staff", market: "ro" },
      {
        query: "",
        mode: "keyword",
        filters: [
          {
            kind: "in",
            field: "id",
            values: Array.from({ length: 80 }, (_, index) => `product-${index}`),
          },
        ],
        pagination: { limit: 80 },
      },
    )
    expect(search).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        filters: [{ kind: "in", field: "id", values: ["product-80", "product-81"] }],
        pagination: { limit: 2 },
      }),
    )
    expect(fields).toEqual(
      new Map([
        ["product-0", { name: "Hotel Zero", thumbnailUrl: "https://cdn.test/zero.jpg" }],
        ["product-80", { stars: 5 }],
      ]),
    )
  })

  it("uses portable dynamic-hotel filters and caps the requested result count", async () => {
    const search = vi
      .fn<IndexerAdapter["search"]>()
      .mockResolvedValue(searchResults([{ id: "hotel-1" }, { id: "hotel-2" }]))
    const resolvers = createCatalogOffersSearchResolvers(
      () => createIndexer(search),
      () => scope,
    )

    const ids = await resolvers.resolveDynamicHotelIds(
      {},
      { countryCode: "RO", city: "Bucharest" },
      500,
    )

    expect(ids).toEqual(["hotel-1", "hotel-2"])
    expect(search).toHaveBeenCalledWith(
      { vertical: "products", locale: "ro-RO", audience: "staff", market: "ro" },
      {
        query: "",
        mode: "keyword",
        filters: [
          { kind: "eq", field: "supplyModel", value: "dynamic" },
          { kind: "in", field: "countryCodes", values: ["RO"] },
          { kind: "in", field: "destinations", values: ["Bucharest"] },
        ],
        pagination: { limit: 250 },
      },
    )
  })

  it("keeps offer lookups best-effort when the index is unavailable or search fails", async () => {
    const unavailable = createCatalogOffersSearchResolvers(
      () => undefined,
      () => scope,
    )
    const failing = createCatalogOffersSearchResolvers(
      () =>
        createIndexer(
          vi.fn<IndexerAdapter["search"]>().mockRejectedValue(new Error("search unavailable")),
        ),
      () => scope,
    )

    await expect(unavailable.fetchIndexFields({}, ["product-1"])).resolves.toEqual(new Map())
    await expect(
      unavailable.resolveDynamicHotelIds({}, { countryCode: "RO" }, 10),
    ).resolves.toEqual([])
    await expect(failing.fetchIndexFields({}, ["product-1"])).resolves.toEqual(new Map())
    await expect(failing.resolveDynamicHotelIds({}, { countryCode: "RO" }, 10)).resolves.toEqual([])
  })
})

describe("withCatalogEmbedding", () => {
  it("preserves referenced-subject builder context", async () => {
    const context = {
      resolveReferencedSubject: vi.fn(async () => null),
    } satisfies DocumentBuilderContext
    const inner = vi.fn(async () => ({ id: "product-1", fields: { name: "Danube" } }))
    const builder = withCatalogEmbedding(inner, {
      capabilities: { modelId: "test-model" },
      embed: vi.fn(async () => [[0.1, 0.2]]),
    })
    const slice = {
      vertical: "products",
      locale: "ro-RO",
      audience: "customer" as const,
      market: "RO",
    }

    await builder("product-1", slice, context)

    expect(inner).toHaveBeenCalledWith("product-1", slice, context)
  })
})

describe("product-owned verticals", () => {
  it("never indexes extras: no vertical, no slice, no collection", () => {
    expect(DEFAULT_CATALOG_VERTICALS).not.toContain("extras")
    expect(DEFAULT_CATALOG_SLICES.map((slice) => slice.vertical)).not.toContain("extras")

    const slices = buildCatalogSlices({
      markets: [{ id: "ro", defaultLanguageTag: "ro-RO" }],
      locales: [{ marketId: "ro", languageTag: "en-GB" }],
      channelIds: ["chan_website"],
    })

    // Every market/locale/channel permutation, and still nothing for an Extra —
    // an Extra is discovered through the Product that sells it.
    expect(slices.length).toBeGreaterThan(0)
    expect(slices.some((slice) => slice.vertical === "extras")).toBe(false)
    expect(isProductOwnedVertical("extras")).toBe(true)
    expect(owningVerticalFor("extras")).toBe("products")
    expect(isProductOwnedVertical("products")).toBe(false)
  })
})
