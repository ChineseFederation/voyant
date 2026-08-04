import type {
  IndexerAdapter,
  IndexerCapabilities,
  IndexerDocument,
  IndexerSlice,
} from "@voyant-travel/catalog-contracts/indexer/contract"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { describe, expect, it, vi } from "vitest"

import type { SourceAdapter } from "./adapter/contract.js"
import { createSourceAdapterRegistry, type SourceAdapterRegistry } from "./booking-engine/index.js"

import type { FieldPolicy, FieldPolicyRegistry } from "./contract.js"
import type { EmbeddingProvider } from "./embeddings/contract.js"
import type { CatalogRuntimeServices } from "./runtime-contracts.js"
import type { DocumentBuilder } from "./services/indexer-service.js"
import {
  type CatalogSourcesSyncJobRuntime,
  runCatalogDiscoverySync,
  runCatalogSourcesSync,
} from "./sources-sync-job.js"

/**
 * The admin browse queries `market: "default"`, `locale: "en-GB"`; the slice
 * set a deployment loads always contains those, so discovered projections are
 * expected to land there.
 */
const PRODUCT_SLICES: IndexerSlice[] = [
  { vertical: "products", locale: "en-GB", audience: "staff", market: "default" },
  { vertical: "products", locale: "en-GB", audience: "customer", market: "default" },
]

function createStubAdapter(): IndexerAdapter & {
  ensured: IndexerSlice[]
  upserted: Array<{ slice: IndexerSlice; documents: IndexerDocument[] }>
} {
  const ensured: IndexerSlice[] = []
  const upserted: Array<{ slice: IndexerSlice; documents: IndexerDocument[] }> = []
  const capabilities: IndexerCapabilities = {
    supportsKeywordSearch: true,
    supportsHybridSearch: false,
    supportsVectorFields: false,
    vectorDimensions: null,
    maxVectorsPerDocument: null,
    supportsCrossAudienceFederation: false,
    supportsAdminDenormalization: false,
  }
  return {
    capabilities,
    ensured,
    upserted,
    async ensureCollection(slice) {
      ensured.push(slice)
    },
    async upsert(slice, documents) {
      upserted.push({ slice, documents })
    },
    async delete() {},
    async search() {
      return { hits: [], total: 0 }
    },
    async bulkReindex() {},
  }
}

function passthroughRegistry(): FieldPolicyRegistry {
  const policy = (path: string): FieldPolicy => ({
    path,
    class: "managed",
    merge: "source-only",
    drift: "low",
    reindex: "entry",
    snapshot: "never",
    query: "indexed-column",
    localized: false,
    visibility: ["staff", "customer", "partner", "supplier"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "static",
  })
  return { policies: [], byPath: new Map(), resolve: (path: string) => policy(path) }
}

function connectStyleAdapter(
  kind: string,
  entityIds: string[],
  options: { failWith?: string; seenContexts?: string[] } = {},
): SourceAdapter {
  let served = false
  return {
    kind,
    capabilities: {
      verticals: ["products"],
      supportsLiveResolution: true,
      supportsDriftDetection: false,
      supportsBookingForwarding: true,
      postBookOperations: [],
    },
    connect: async () => undefined,
    pause: async () => undefined,
    disconnect: async () => undefined,
    getState: async () => "active",
    discover: async (ctx) => {
      options.seenContexts?.push(ctx.connection_id)
      if (options.failWith) throw new Error(options.failWith)
      if (served) return { projections: [], next_cursor: undefined }
      served = true
      return {
        projections: entityIds.map((id) => ({
          entity_module: "products",
          entity_id: id,
          provenance: {
            source_kind: kind,
            source_connection_id: kind,
            source_freshness: "sync" as const,
          },
          fields: { id, name: `Sourced ${id}`, status: "active" },
        })),
        next_cursor: undefined,
      }
    },
  }
}

/** Records sourced-entry upserts without a live Postgres. */
function drizzleStub(): AnyDrizzleDb & { inserted: Record<string, unknown>[] } {
  const inserted: Record<string, unknown>[] = []
  const db = {
    inserted,
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        inserted.push(row)
        return {
          onConflictDoUpdate: () => ({ returning: async () => [row] }),
        }
      },
    }),
  }
  return db as never
}

function stubServices(
  overrides: Partial<CatalogRuntimeServices> & { registry?: SourceAdapterRegistry } = {},
): CatalogRuntimeServices {
  const { registry, ...rest } = overrides
  const services: CatalogRuntimeServices = {
    defaultSlices: PRODUCT_SLICES,
    ensureSourceRegistry: async () => registry ?? createSourceAdapterRegistry(),
    getSourceRegistryFromContext: () => registry ?? createSourceAdapterRegistry(),
    getOwnedHandlers: () => ({}) as never,
    getOwnedHandlersFromContext: () => ({}) as never,
    getOwnedAvailabilitySearchHandlers: () => ({}) as never,
    buildEmbeddingProvider: () => undefined,
    buildIndexer: () => createStubAdapter(),
    loadSlices: async () => [...PRODUCT_SLICES],
    fieldPolicyRegistries: () => new Map([["products", passthroughRegistry()]]),
    reindexReferencedSubjectOverlayChange: async () => {},
    createProductsDocumentBuilder: () => (async () => null) as DocumentBuilder,
    createCatalogDocumentBuilder: () => (async () => null) as DocumentBuilder,
    // Publication is exercised in `booking-engine/sync.test.ts`; these cases
    // are about the composition the job performs around it, so the default
    // stub publishes everything and one case below asserts the wiring.
    isSourcedEntryListable: async () => true,
    withEmbedding: (inner) => inner,
    previewOffer: async () => ({ kind: "rejected", error: { kind: "not_authorized" } }),
    ...rest,
  }
  return services
}

describe("runCatalogDiscoverySync", () => {
  it("composes the indexer stack and projects discovered entries into every slice", async () => {
    const adapter = createStubAdapter()
    const registry = createSourceAdapterRegistry()
    registry.register(connectStyleAdapter("voyant-connect", ["prd_1", "prd_2"]))
    const db = drizzleStub()
    const services = stubServices({ registry, buildIndexer: () => adapter })

    const summary = await runCatalogDiscoverySync({ env: {}, db, services })

    expect(summary.totalProjections).toBe(2)
    expect(summary.adapters[0]?.sourcedEntriesUpserted).toBe(2)
    expect(db.inserted).toHaveLength(2)
    // Collections are ensured before the first write so a cold deployment
    // does not upsert into a missing collection.
    expect(adapter.ensured).toEqual(PRODUCT_SLICES)
    // 2 projections × 2 slices.
    expect(adapter.upserted).toHaveLength(4)
    expect(
      adapter.upserted
        .map(({ slice, documents }) => `${slice.audience}:${documents[0]?.id}`)
        .sort(),
    ).toEqual(["customer:prd_1", "customer:prd_2", "staff:prd_1", "staff:prd_2"])
  })

  it("routes the deployment's publication gate into the emission decision", async () => {
    const adapter = createStubAdapter()
    const registry = createSourceAdapterRegistry()
    registry.register(connectStyleAdapter("voyant-connect", ["prd_1"]))
    const db = drizzleStub()
    const asked: Array<{ audience: string; sourceKind: string }> = []
    const services = stubServices({
      registry,
      buildIndexer: () => adapter,
      // Stand in for the real Distribution-backed rule: this connection is
      // published to staff but not to the storefront.
      isSourcedEntryListable: async ({ db: gateDb, slice, provenance }) => {
        expect(gateDb).toBe(db)
        asked.push({ audience: slice.audience, sourceKind: provenance.sourceKind })
        return slice.audience === "staff"
      },
    })

    await runCatalogDiscoverySync({ env: {}, db, services })

    expect(asked.map(({ audience }) => audience).sort()).toEqual(["customer", "staff"])
    expect(asked[0]?.sourceKind).toBe("voyant-connect")
    // The customer slice gets a delete rather than an upsert, so revoking
    // publication empties the storefront on the next pass.
    expect(adapter.upserted.map(({ slice }) => slice.audience)).toEqual(["staff"])
  })

  it("wraps the document builder with the resolved embedding provider", async () => {
    const registry = createSourceAdapterRegistry()
    registry.register(connectStyleAdapter("voyant-connect", ["prd_1"]))
    const embeddings: EmbeddingProvider = {
      capabilities: {
        modelId: "stub/embed/v1",
        dimensions: 3,
        maxTokensPerInput: 128,
        maxBatchSize: 8,
      },
      embed: async (texts) => texts.map(() => [0, 0, 0]),
    }
    const withEmbedding = vi.fn(
      (inner: DocumentBuilder, _embeddings: EmbeddingProvider | undefined) => inner,
    )
    const services = stubServices({
      registry,
      buildEmbeddingProvider: () => embeddings,
      withEmbedding,
    })

    await runCatalogDiscoverySync({ env: {}, db: drizzleStub(), services })

    expect(withEmbedding).toHaveBeenCalled()
    expect(withEmbedding.mock.calls[0]?.[1]).toBe(embeddings)
  })

  it("does not prune unseen sourced rows unless the caller opts in", async () => {
    const registry = createSourceAdapterRegistry()
    registry.register(connectStyleAdapter("voyant-connect", []))
    const services = stubServices({ registry })

    const summary = await runCatalogDiscoverySync({ env: {}, db: drizzleStub(), services })

    expect(summary.adapters[0]?.withdrawnProjections).toBe(0)
  })

  it("skips the unscoped fallback once the same kind has connection-scoped adapters", async () => {
    // Mirrors a warmed Connect deployment: registerVoyantConnectFallback stores
    // the un-scoped pair under `default:<kind>`, then the warm registers the
    // real connections. Discovering through the synthetic id would forward it
    // upstream as a connection id and stamp it into provenance.
    const seenContexts: string[] = []
    const registry = createSourceAdapterRegistry()
    registry.register(connectStyleAdapter("voyant-connect", ["fallback"], { seenContexts }))
    registry.register("conn_a", connectStyleAdapter("voyant-connect", ["prd_1"], { seenContexts }))

    const summary = await runCatalogDiscoverySync({
      env: {},
      db: drizzleStub(),
      services: stubServices({ registry }),
    })

    expect(seenContexts).toEqual(["conn_a"])
    expect(summary.adapters.map((entry) => entry.connectionId)).toEqual(["conn_a"])
    expect(summary.skippedConnections).toEqual([
      {
        connectionId: "default:voyant-connect",
        adapter: "voyant-connect",
        reason: "unscoped-fallback-superseded-by-connection-scoped-adapter",
      },
    ])
  })

  it("keeps an unscoped adapter that is the only registration for its kind", async () => {
    const seenContexts: string[] = []
    const registry = createSourceAdapterRegistry()
    registry.register(connectStyleAdapter("demo-source", ["prd_1"], { seenContexts }))

    const summary = await runCatalogDiscoverySync({
      env: {},
      db: drizzleStub(),
      services: stubServices({ registry }),
    })

    expect(seenContexts).toEqual(["default:demo-source"])
    expect(summary.totalProjections).toBe(1)
    expect(summary.skippedConnections).toEqual([])
  })

  it("isolates one failing connection so the rest still sync", async () => {
    const registry = createSourceAdapterRegistry()
    registry.register(
      "conn_broken",
      connectStyleAdapter("supplier-a", [], { failWith: "upstream 503" }),
    )
    registry.register("conn_ok", connectStyleAdapter("supplier-b", ["prd_1", "prd_2"]))

    const summary = await runCatalogDiscoverySync({
      env: {},
      db: drizzleStub(),
      services: stubServices({ registry }),
    })

    expect(summary.totalProjections).toBe(2)
    expect(summary.failures).toEqual([
      { connectionId: "conn_broken", adapter: "supplier-a", error: "upstream 503" },
    ])
    expect(summary.adapters.find((a) => a.connectionId === "conn_broken")?.error).toBe(
      "upstream 503",
    )
  })

  it("propagates the failure when the caller opts out of isolation", async () => {
    const registry = createSourceAdapterRegistry()
    registry.register("conn_broken", connectStyleAdapter("supplier-a", [], { failWith: "boom" }))

    await expect(
      runCatalogDiscoverySync(
        { env: {}, db: drizzleStub(), services: stubServices({ registry }) },
        { continueOnError: false },
      ),
    ).rejects.toThrow("boom")
  })

  it("fails loudly when the deployment has no catalog indexer", async () => {
    const services = stubServices({ buildIndexer: () => undefined })

    await expect(runCatalogDiscoverySync({ env: {}, db: drizzleStub(), services })).rejects.toThrow(
      /requires a configured catalog indexer/,
    )
  })
})

describe("runCatalogSourcesSync", () => {
  function jobRuntime(
    services: CatalogRuntimeServices,
    db: AnyDrizzleDb,
    refreshed?: SourceAdapterRegistry,
  ) {
    return {
      withDb: (operation) => operation(db),
      resolveServices: () => services,
      resolveEnv: () => ({ TENANT_ID: "acme" }),
      refreshSourceRegistry: async () => refreshed ?? createSourceAdapterRegistry(),
      reportProgress: vi.fn(),
    } satisfies CatalogSourcesSyncJobRuntime
  }

  it("runs a pass with the host-supplied env and database handle", async () => {
    const adapter = createStubAdapter()
    const registry = createSourceAdapterRegistry()
    registry.register(connectStyleAdapter("voyant-connect", ["prd_1"]))
    const buildIndexer = vi.fn(
      (_env: Readonly<Record<string, unknown>>, _embeddings?: EmbeddingProvider) => adapter,
    )
    const services = stubServices({ buildIndexer })
    const db = drizzleStub()

    const summary = await runCatalogSourcesSync(jobRuntime(services, db, registry))

    expect(summary.totalProjections).toBe(1)
    expect(buildIndexer.mock.calls[0]?.[0]).toEqual({ TENANT_ID: "acme" })
    expect(db.inserted).toHaveLength(1)
  })

  it("re-enumerates connections rather than reusing the memoized isolate warm", async () => {
    // The stale registry is what `ensureSourceRegistry` would hand back after a
    // process has already warmed once; the refreshed one carries a connection
    // added since. The job must sync the latter.
    const stale = createSourceAdapterRegistry()
    stale.register("conn_old", connectStyleAdapter("voyant-connect", ["old_1"]))
    const refreshed = createSourceAdapterRegistry()
    refreshed.register("conn_old", connectStyleAdapter("voyant-connect", ["old_1"]))
    refreshed.register("conn_new", connectStyleAdapter("voyant-connect", ["new_1"]))
    const ensureSourceRegistry = vi.fn(async () => stale)
    const services = stubServices({ registry: stale, ensureSourceRegistry })

    const summary = await runCatalogSourcesSync(jobRuntime(services, drizzleStub(), refreshed))

    expect(summary.adapters.map((entry) => entry.connectionId).sort()).toEqual([
      "conn_new",
      "conn_old",
    ])
    expect(ensureSourceRegistry).not.toHaveBeenCalled()
  })

  it("skips instead of failing the schedule when no indexer is configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const withDb = vi.fn()
    const services = stubServices({ buildIndexer: () => undefined })

    const refreshSourceRegistry = vi.fn(async () => createSourceAdapterRegistry())
    const summary = await runCatalogSourcesSync({
      withDb,
      resolveServices: () => services,
      resolveEnv: () => ({}),
      refreshSourceRegistry,
    })

    expect(summary).toEqual({
      adapters: [],
      totalProjections: 0,
      skippedConnections: [],
      failures: [],
    })
    expect(withDb).not.toHaveBeenCalled()
    // No point paying for connection enumeration when nothing can be indexed.
    expect(refreshSourceRegistry).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
