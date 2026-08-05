import type { SourceAdapter } from "@voyant-travel/catalog"
import { beforeEach, describe, expect, it, vi } from "vitest"

const catalogMocks = vi.hoisted(() => ({
  CONTENT_ROOT_NODE_KEY: "root",
  CONTENT_ROOT_NODE_KIND: "root",
  createInvalidateOnDrift: vi.fn(() => vi.fn()),
  fetchOverlaysForEntity: vi.fn(async () => []),
  isStale: vi.fn(() => false),
  mergeOverlaysIntoContent: vi.fn(
    (payload: unknown, overlays: ReadonlyArray<{ field_path: string; value: unknown }>) => {
      const copy = structuredClone(payload) as Record<string, unknown>
      for (const overlay of overlays) {
        if (overlay.field_path === "/product/name") {
          ;(copy.product as Record<string, unknown>).name = overlay.value
        }
      }
      return copy
    },
  ),
  pickBestCachedLocale: vi.fn(() => null),
  readSourcedEntry: vi.fn(),
  withContentRefreshLock: vi.fn(async (_db: unknown, _key: unknown, fn: () => unknown) => fn()),
}))
const ownedMocks = vi.hoisted(() => ({
  buildOwnedProductContent: vi.fn(),
}))

vi.mock("@voyant-travel/catalog", () => catalogMocks)
vi.mock("../../src/service-content-owned.js", () => ownedMocks)

import { PRODUCTS_CONTENT_SCHEMA_VERSION } from "../../src/content-shape.js"
import { getProductContent } from "../../src/service-content.js"

function makeProductContent(name: string) {
  return {
    product: {
      id: "prod_1",
      name,
    },
    options: [],
    days: [],
    media: [],
    policies: [],
    departures: [],
  }
}

function makeSourcedEntry() {
  const now = new Date("2026-01-01T00:00:00Z")
  return {
    id: "cse_1",
    entity_module: "products",
    entity_id: "prod_1",
    source_kind: "direct:test",
    source_provider: "test",
    source_connection_id: "conn_1",
    source_ref: "upstream_prod_1",
    source_freshness: "sync",
    last_sourced_at: now,
    status: "active",
    projection: { fields: { name: "Projected product" } },
    projection_etag: "projection-etag",
    projection_seen_at: now,
    first_seen_at: now,
    last_seen_at: now,
  }
}

function makeDb(rows: unknown[] = []) {
  const where = vi.fn(async () => rows)
  const from = vi.fn(() => ({ where }))
  const select = vi.fn(() => ({ from }))

  const onConflictDoUpdate = vi.fn(async () => undefined)
  const values = vi.fn(() => ({ onConflictDoUpdate }))
  const insert = vi.fn(() => ({ values }))

  return {
    db: { select, insert },
    insert,
    select,
    values,
    onConflictDoUpdate,
  }
}

function makeAdapter(ownsContentCache: boolean): SourceAdapter {
  return {
    kind: "direct:test",
    capabilities: {
      verticals: ["products"],
      supportsLiveResolution: true,
      supportsDriftDetection: true,
      supportsBookingForwarding: false,
      postBookOperations: [],
      supportsContentFetch: true,
      ownsContentCache,
    },
    getContent: vi.fn(async (_ctx, request) => ({
      entity_module: request.entity_module,
      entity_id: request.entity_id,
      source_ref: "upstream_prod_1",
      returned_locale: request.locale,
      content: makeProductContent(`Fresh ${request.locale}`),
      content_schema_version: PRODUCTS_CONTENT_SCHEMA_VERSION,
    })),
  }
}

function makeRegistry(adapter: SourceAdapter) {
  return {
    resolveByConnection: vi.fn(() => adapter),
    byKind: vi.fn(() => [{ adapter }]),
  }
}

describe("getProductContent cache ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    catalogMocks.fetchOverlaysForEntity.mockResolvedValue([])
    catalogMocks.pickBestCachedLocale.mockReturnValue(null)
    catalogMocks.readSourcedEntry.mockResolvedValue(makeSourcedEntry())
    catalogMocks.withContentRefreshLock.mockImplementation(
      async (_db: unknown, _key: unknown, fn: () => unknown) => fn(),
    )
    ownedMocks.buildOwnedProductContent.mockResolvedValue(null)
  })

  it("passes through every read and skips sourced-content cache storage when the adapter owns content cache", async () => {
    const db = makeDb()
    const adapter = makeAdapter(true)

    const first = await getProductContent(
      // biome-ignore lint/suspicious/noExplicitAny: this unit test stubs only the db calls used here. -- owner: products; existing suppression is intentional pending typed cleanup.
      db.db as any,
      "prod_1",
      { preferredLocales: ["en-GB"], audience: "customer", market: "GB" },
      { registry: makeRegistry(adapter) },
    )
    const second = await getProductContent(
      // biome-ignore lint/suspicious/noExplicitAny: this unit test stubs only the db calls used here. -- owner: products; existing suppression is intentional pending typed cleanup.
      db.db as any,
      "prod_1",
      { preferredLocales: ["en-GB"], audience: "customer", market: "GB" },
      { registry: makeRegistry(adapter) },
    )

    expect(adapter.getContent).toHaveBeenCalledTimes(2)
    expect(db.select).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
    expect(catalogMocks.withContentRefreshLock).not.toHaveBeenCalled()
    expect(first?.source).toBe("sourced-fresh")
    expect(first?.provenance).toEqual({
      source_kind: "direct:test",
      source_provider: "test",
      source_connection_id: "conn_1",
      source_ref: "upstream_prod_1",
    })
    expect(second?.source).toBe("sourced-fresh")
  })

  it("preserves catalog-owned cache write-through by default", async () => {
    const db = makeDb()
    const adapter = makeAdapter(false)

    const result = await getProductContent(
      // biome-ignore lint/suspicious/noExplicitAny: this unit test stubs only the db calls used here. -- owner: products; existing suppression is intentional pending typed cleanup.
      db.db as any,
      "prod_1",
      { preferredLocales: ["en-GB"], audience: "customer", market: "GB" },
      { registry: makeRegistry(adapter) },
    )

    expect(db.select).toHaveBeenCalledTimes(1)
    expect(catalogMocks.withContentRefreshLock).toHaveBeenCalledTimes(1)
    expect(adapter.getContent).toHaveBeenCalledTimes(1)
    expect(db.insert).toHaveBeenCalledTimes(1)
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_id: "prod_1",
        locale: "en-GB",
        market: "GB",
        content_schema_version: PRODUCTS_CONTENT_SCHEMA_VERSION,
      }),
    )
    expect(db.onConflictDoUpdate).toHaveBeenCalledTimes(1)
    expect(result?.source).toBe("sourced-fresh")
  })

  it("fails fast when content-cache ownership is declared without getContent", async () => {
    const db = makeDb()
    const adapter = makeAdapter(true)
    delete adapter.getContent

    await expect(
      getProductContent(
        // biome-ignore lint/suspicious/noExplicitAny: this unit test stubs only the db calls used here. -- owner: products; existing suppression is intentional pending typed cleanup.
        db.db as any,
        "prod_1",
        { preferredLocales: ["en-GB"], audience: "customer", market: "GB" },
        { registry: makeRegistry(adapter) },
      ),
    ).rejects.toThrow(/ownsContentCache/)

    expect(db.select).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
  })

  it("applies only overlays in the requested locale, audience, and market fallback chain", async () => {
    const cachedContent = makeProductContent("Source")
    const row = {
      entity_id: "prod_1",
      locale: "ro-RO",
      market: "RO",
      returned_locale: "ro-RO",
      payload: cachedContent,
      content_schema_version: PRODUCTS_CONTENT_SCHEMA_VERSION,
      machine_translated: false,
      fresh_until: new Date("2026-01-02T00:00:00Z"),
    }
    const db = makeDb([row])
    const adapter = makeAdapter(false)
    catalogMocks.pickBestCachedLocale.mockReturnValue({
      candidate: row,
      match_kind: "exact",
    })
    catalogMocks.fetchOverlaysForEntity.mockResolvedValue([
      {
        id: "ovl_ro_customer_default_market",
        version: 1,
        field_path: "/product/name",
        locale: "ro-RO",
        audience: "customer",
        market: "default",
        value: "Romanian customer fallback market",
      },
      {
        id: "ovl_ro_partner_ro",
        version: 1,
        field_path: "/product/name",
        locale: "ro-RO",
        audience: "partner",
        market: "RO",
        value: "Partner leak",
      },
      {
        id: "ovl_fr_customer_ro",
        version: 1,
        field_path: "/product/name",
        locale: "fr-FR",
        audience: "customer",
        market: "RO",
        value: "French leak",
      },
      {
        id: "ovl_ro_customer_gb",
        version: 1,
        field_path: "/product/name",
        locale: "ro-RO",
        audience: "customer",
        market: "GB",
        value: "GB leak",
      },
    ])

    const result = await getProductContent(
      // biome-ignore lint/suspicious/noExplicitAny: this unit test stubs only the db calls used here. -- owner: products; existing suppression is intentional pending typed cleanup.
      db.db as any,
      "prod_1",
      { preferredLocales: ["ro-RO"], audience: "customer", market: "RO" },
      { registry: makeRegistry(adapter) },
    )

    expect(result?.content.product.name).toBe("Romanian customer fallback market")
    expect(result?.resolution.served_locale).toBe("ro-RO")
    expect(result?.resolution.match_kind).toBe("exact")
  })

  it("prefers exact scope overlays over default fallbacks for the same field", async () => {
    const cachedContent = makeProductContent("Source")
    const row = {
      entity_id: "prod_1",
      locale: "ro-RO",
      market: "RO",
      returned_locale: "ro-RO",
      payload: cachedContent,
      content_schema_version: PRODUCTS_CONTENT_SCHEMA_VERSION,
      machine_translated: false,
      fresh_until: new Date("2026-01-02T00:00:00Z"),
    }
    const db = makeDb([row])
    const adapter = makeAdapter(false)
    catalogMocks.pickBestCachedLocale.mockReturnValue({
      candidate: row,
      match_kind: "exact",
    })
    catalogMocks.fetchOverlaysForEntity.mockResolvedValue([
      {
        id: "ovl_default",
        version: 1,
        field_path: "/product/name",
        locale: "default",
        audience: "default",
        market: "default",
        value: "Default fallback",
      },
      {
        id: "ovl_exact",
        version: 1,
        field_path: "/product/name",
        locale: "ro-RO",
        audience: "customer",
        market: "RO",
        value: "Exact overlay",
      },
    ])

    const result = await getProductContent(
      // biome-ignore lint/suspicious/noExplicitAny: this unit test stubs only the db calls used here. -- owner: products; existing suppression is intentional pending typed cleanup.
      db.db as any,
      "prod_1",
      { preferredLocales: ["ro-RO"], audience: "customer", market: "RO" },
      { registry: makeRegistry(adapter) },
    )

    expect(result?.content.product.name).toBe("Exact overlay")
  })

  it("reports fallback_chain when requested-locale overlays augment cached provider fallback content", async () => {
    const cachedContent = makeProductContent("English source")
    const row = {
      entity_id: "prod_1",
      locale: "ro-RO",
      market: "RO",
      returned_locale: "en-GB",
      payload: cachedContent,
      content_schema_version: PRODUCTS_CONTENT_SCHEMA_VERSION,
      machine_translated: false,
      fresh_until: new Date("2026-01-02T00:00:00Z"),
    }
    const db = makeDb([row])
    const adapter = makeAdapter(false)
    catalogMocks.pickBestCachedLocale.mockReturnValue({
      candidate: row,
      match_kind: "fallback_chain",
    })
    catalogMocks.fetchOverlaysForEntity.mockResolvedValue([
      {
        id: "ovl_ro",
        version: 1,
        field_path: "/product/name",
        locale: "ro-RO",
        audience: "customer",
        market: "RO",
        value: "Nume romanesc",
      },
    ])

    const result = await getProductContent(
      // biome-ignore lint/suspicious/noExplicitAny: this unit test stubs only the db calls used here. -- owner: products; existing suppression is intentional pending typed cleanup.
      db.db as any,
      "prod_1",
      { preferredLocales: ["ro-RO"], audience: "customer", market: "RO" },
      { registry: makeRegistry(adapter) },
    )

    expect(result?.content.product.name).toBe("Nume romanesc")
    expect(result?.resolution.served_locale).toBe("ro-RO")
    expect(result?.resolution.match_kind).toBe("fallback_chain")
    expect(result?.source).toBe("sourced-cache")
  })

  it("reports fallback_chain when requested-locale overlays augment fresh provider fallback content", async () => {
    const freshContent = makeProductContent("English source")
    const db = makeDb()
    const adapter = makeAdapter(true)
    adapter.getContent = vi.fn(async () => ({
      entity_module: "products",
      entity_id: "prod_1",
      source_ref: "upstream_prod_1",
      returned_locale: "en-GB",
      content: freshContent,
      content_schema_version: PRODUCTS_CONTENT_SCHEMA_VERSION,
    }))
    catalogMocks.fetchOverlaysForEntity.mockResolvedValue([
      {
        id: "ovl_ro",
        version: 1,
        field_path: "/product/name",
        locale: "ro-RO",
        audience: "customer",
        market: "RO",
        value: "Nume romanesc",
      },
    ])

    const result = await getProductContent(
      // biome-ignore lint/suspicious/noExplicitAny: this unit test stubs only the db calls used here. -- owner: products; existing suppression is intentional pending typed cleanup.
      db.db as any,
      "prod_1",
      { preferredLocales: ["ro-RO"], audience: "customer", market: "RO" },
      { registry: makeRegistry(adapter) },
    )

    expect(result?.content.product.name).toBe("Nume romanesc")
    expect(result?.resolution.served_locale).toBe("ro-RO")
    expect(result?.resolution.match_kind).toBe("fallback_chain")
    expect(result?.source).toBe("sourced-fresh")
  })

  // An owned product's copy lives in product_translations, which the operator
  // edits directly. Merging an overlay on top would give one field two
  // authoring surfaces and let the overlay win silently, so the owned branch
  // serves the projection as-authored and never reads the overlay store.
  it("serves owned content as authored and ignores overlay rows", async () => {
    const db = makeDb()
    const adapter = makeAdapter(false)
    catalogMocks.readSourcedEntry.mockResolvedValue(null)
    ownedMocks.buildOwnedProductContent.mockResolvedValue({
      content: makeProductContent("Owned English"),
      servedLocale: "en-GB",
      matchKind: "any",
    })
    catalogMocks.fetchOverlaysForEntity.mockResolvedValue([
      {
        id: "ovl_ro",
        version: 1,
        field_path: "/product/name",
        locale: "ro-RO",
        audience: "customer",
        market: "RO",
        value: "Nume romanesc",
      },
    ])

    const result = await getProductContent(
      // biome-ignore lint/suspicious/noExplicitAny: this unit test stubs only the db calls used here. -- owner: products; existing suppression is intentional pending typed cleanup.
      db.db as any,
      "prod_1",
      { preferredLocales: ["ro-RO"], audience: "customer", market: "RO" },
      { registry: makeRegistry(adapter) },
    )

    expect(result?.content.product.name).toBe("Owned English")
    expect(result?.resolution.served_locale).toBe("en-GB")
    expect(result?.resolution.match_kind).toBe("any")
    expect(result?.source).toBe("owned")
    expect(catalogMocks.fetchOverlaysForEntity).not.toHaveBeenCalled()
  })
})
