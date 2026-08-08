import { createFieldPolicyRegistry, type FieldPolicy } from "@voyant-travel/catalog/contract"
import type { IndexerAdapter } from "@voyant-travel/catalog-contracts/indexer/contract"
import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it, vi } from "vitest"

import { createClosedStorefrontShoppingAdapters } from "../../src/shopping/closed-provider-adapters.js"
import { StorefrontShoppingUnavailableError } from "../../src/shopping/runtime.js"

const storefront = { storefrontId: "sf_alpha", channelId: "channel_web" }
const dialect = new PgDialect()
const activeMarket = {
  id: "market_ro",
  code: "RO",
  name: "Romania",
  regionCode: "EU",
  countryCode: "RO",
  defaultLocale: "ro-RO",
  defaultCurrency: "RON",
  locales: [
    { languageTag: "ro-RO", isDefault: true },
    { languageTag: "en-GB", isDefault: false },
  ],
  currencies: [
    { currencyCode: "RON", isDefault: true },
    { currencyCode: "EUR", isDefault: false },
  ],
}

function policy(path: string, overrides: Partial<FieldPolicy> = {}): FieldPolicy {
  return {
    path,
    class: "structural",
    merge: "source-only",
    drift: "low",
    reindex: "entry",
    snapshot: "never",
    query: "indexed-column",
    localized: false,
    visibility: ["customer"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "sync",
    ...overrides,
  }
}

function createIndexer(search = vi.fn(async () => ({ hits: [], total: 0 }))): IndexerAdapter {
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
    ensureCollection: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    search,
    bulkReindex: vi.fn(),
  }
}

function adapters(
  input: {
    active?: (context: typeof storefront) => boolean
    indexer?: IndexerAdapter
    policies?: FieldPolicy[]
  } = {},
) {
  const indexer = input.indexer ?? createIndexer()
  return createClosedStorefrontShoppingAdapters({
    primitives: {
      env: vi.fn(() => ({ TENANT_ID: "operator_server_owned" })),
      database: { resolve: vi.fn(() => ({ server: "db" })) },
    } as never,
    catalogSearch: {
      resolveRuntime: vi.fn(() => ({
        indexer,
        defaultScope: { locale: "ignored", audience: "staff", market: "ignored" },
      })),
    },
    catalogServices: {
      fieldPolicyRegistries: () =>
        new Map([
          [
            "products",
            createFieldPolicyRegistry(
              input.policies ?? [
                policy("name"),
                policy("description", { query: "blob-only" }),
                policy("slug"),
                policy("thumbnailUrl"),
                policy("priceFromAmountCents"),
                policy("priceFromCurrency"),
                policy("familyCode"),
              ],
            ),
          ],
        ]),
    },
    listMarkets: vi.fn(async () => [activeMarket]),
    isActiveStorefrontChannel: vi.fn(async (_db, context) =>
      input.active ? input.active(context as typeof storefront) : true,
    ),
  })
}

describe("closed storefront shopping market adapter", () => {
  it("ignores a soft-deleted storefront channel binding", async () => {
    const statements: Array<{ sql: string; params: unknown[] }> = []
    const provider = createClosedStorefrontShoppingAdapters({
      primitives: {
        env: vi.fn(() => ({})),
        database: {
          resolve: vi.fn(() => ({
            execute(query: SQL) {
              const statement = dialect.sqlToQuery(query)
              statements.push({ sql: statement.sql, params: statement.params })
              return Promise.resolve([{ active: false }])
            },
          })),
        },
      } as never,
      catalogSearch: {
        resolveRuntime: vi.fn(() => ({
          defaultScope: { locale: "ignored", audience: "staff", market: "ignored" },
        })),
      },
      catalogServices: { fieldPolicyRegistries: () => new Map() },
      listMarkets: vi.fn(async () => [activeMarket]),
    }).markets

    await expect(provider.listActiveMarkets(storefront)).rejects.toThrow(
      "active storefront channel",
    )
    expect(statements).toHaveLength(1)
    expect(statements[0]?.sql).toContain("binding.deleted_at IS NULL")
    expect(statements[0]?.params).toEqual([storefront.storefrontId, storefront.channelId])
  })

  it("keeps an active channel binding isolated to its trusted storefront", async () => {
    const provider = adapters({
      active: (context) =>
        context.storefrontId === storefront.storefrontId &&
        context.channelId === storefront.channelId,
    }).markets

    await expect(provider.listActiveMarkets(storefront)).resolves.toHaveLength(1)
    await expect(
      provider.listActiveMarkets({ ...storefront, storefrontId: "sf_other" }),
    ).rejects.toBeInstanceOf(StorefrontShoppingUnavailableError)
  })

  it("fails closed for an inactive channel", async () => {
    await expect(
      adapters({ active: () => false }).markets.listActiveMarkets(storefront),
    ).rejects.toThrow("active storefront channel")
  })
})

describe("closed storefront shopping catalog adapter", () => {
  it.each([
    ["disabled locale", { marketId: "market_ro", locale: "de-DE", currency: "RON" }],
    ["disabled currency", { marketId: "market_ro", locale: "ro-RO", currency: "USD" }],
    ["inactive market", { marketId: "market_other", locale: "ro-RO", currency: "RON" }],
  ])("rejects %s before touching Catalog", async (_label, scope) => {
    const indexer = createIndexer()
    const provider = adapters({ indexer }).catalog

    await expect(
      provider.searchSlice({
        context: storefront,
        scope: { ...scope, available: { marketIds: [], locales: [], currencies: [] } },
        vertical: "products",
        query: "",
        filters: [],
      }),
    ).rejects.toThrow("active market scope")
    expect(indexer.search).not.toHaveBeenCalled()
  })

  it("uses the exact customer Catalog slice and maps only customer-policy fields", async () => {
    const search = vi.fn(async () => ({
      hits: [
        {
          id: "product_1",
          score: 1,
          document: {
            id: "product_1",
            fields: {
              name: "Danube tour",
              description: "Seven nights",
              slug: "danube-tour",
              thumbnailUrl: "https://media.example/danube.jpg",
              priceFromAmountCents: 12345,
              priceFromCurrency: "ron",
              supplierSecret: "must-not-leak",
            },
          },
        },
      ],
      total: 1,
      next_cursor: "cursor_2",
    }))
    const provider = adapters({
      indexer: createIndexer(search),
      policies: [
        policy("name"),
        policy("description", { query: "blob-only" }),
        policy("slug"),
        policy("thumbnailUrl"),
        policy("priceFromAmountCents"),
        policy("priceFromCurrency"),
        policy("familyCode"),
        policy("supplierSecret", { visibility: ["staff"] }),
      ],
    }).catalog

    await expect(
      provider.searchSlice({
        context: storefront,
        scope: {
          marketId: "market_ro",
          locale: "ro-RO",
          currency: "RON",
          available: { marketIds: [], locales: [], currencies: [] },
        },
        vertical: "products",
        query: "danube",
        filters: [{ kind: "eq", field: "familyCode", value: "tour" }],
        pagination: { limit: 12, cursor: "cursor_1" },
      }),
    ).resolves.toEqual({
      items: [
        {
          entityId: "product_1",
          title: "Danube tour",
          summary: "Seven nights",
          href: "/catalog/danube-tour",
          image: { url: "https://media.example/danube.jpg", alt: "Danube tour" },
          nativePrice: { amount: "123.45", currency: "RON" },
        },
      ],
      total: 1,
      nextCursor: "cursor_2",
    })
    expect(search).toHaveBeenCalledWith(
      {
        vertical: "products",
        locale: "ro-RO",
        audience: "customer",
        market: "market_ro",
        channel: "channel_web",
      },
      {
        query: "danube",
        mode: "keyword",
        filters: [{ kind: "eq", field: "familyCode", value: "tour" }],
        pagination: { limit: 12, cursor: "cursor_1" },
      },
    )
  })

  it.each([
    ["undeclared", "providerConnectionId"],
    ["staff-only", "supplierSecret"],
    ["blob-only", "description"],
  ])("refuses a %s Catalog filter under the exact field policy", async (_label, field) => {
    const indexer = createIndexer()
    const provider = adapters({
      indexer,
      policies: [
        policy("description", { query: "blob-only" }),
        policy("supplierSecret", { visibility: ["staff"] }),
      ],
    }).catalog

    await expect(
      provider.searchSlice({
        context: storefront,
        scope: {
          marketId: "market_ro",
          locale: "ro-RO",
          currency: "RON",
          available: { marketIds: [], locales: [], currencies: [] },
        },
        vertical: "products",
        query: "",
        filters: [{ kind: "eq", field, value: "browser-selected" }],
      }),
    ).rejects.toThrow(`customer catalog field policy for ${field}`)
    expect(indexer.search).not.toHaveBeenCalled()
  })

  it("does not expose a raw entity id when the customer title is unavailable", async () => {
    const privateEntityId = "product_internal_1"
    const indexer = createIndexer(
      vi.fn(async () => ({
        hits: [
          {
            id: privateEntityId,
            score: 1,
            document: { id: privateEntityId, fields: {} },
          },
        ],
        total: 1,
      })),
    )
    const provider = adapters({ indexer, policies: [policy("name")] }).catalog

    await expect(
      provider.searchSlice({
        context: storefront,
        scope: {
          marketId: "market_ro",
          locale: "ro-RO",
          currency: "RON",
          available: { marketIds: [], locales: [], currencies: [] },
        },
        vertical: "products",
        query: "",
        filters: [],
      }),
    ).rejects.toThrow("customer catalog title")
  })

  it("fails unavailable when the selected Catalog runtime has no indexer", async () => {
    const noIndexerProvider = createClosedStorefrontShoppingAdapters({
      primitives: {
        env: vi.fn(() => ({})),
        database: { resolve: vi.fn(() => ({})) },
      } as never,
      catalogSearch: {
        resolveRuntime: () => ({
          defaultScope: { locale: "ignored", audience: "staff", market: "ignored" },
        }),
      },
      catalogServices: {
        fieldPolicyRegistries: () =>
          new Map([["products", createFieldPolicyRegistry([policy("familyCode")])]]),
      },
      listMarkets: async () => [activeMarket],
      isActiveStorefrontChannel: async () => true,
    }).catalog
    await expect(
      noIndexerProvider.searchSlice({
        context: storefront,
        scope: {
          marketId: "market_ro",
          locale: "ro-RO",
          currency: "RON",
          available: { marketIds: [], locales: [], currencies: [] },
        },
        vertical: "products",
        query: "",
        filters: [],
      }),
    ).rejects.toThrow("catalog indexer")
  })
})
