import type {
  IndexerDocument,
  IndexerSlice,
  SearchRequest,
  SearchResults,
} from "@voyant-travel/catalog-contracts/indexer/contract"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { describe, expect, it, vi } from "vitest"
import type { SourceAdapter } from "../adapter/contract.js"
import type { FieldPolicy, FieldPolicyRegistry } from "../contract.js"
import type { DocumentBuilder, IndexerService } from "../services/indexer-service.js"

import { createSourceAdapterRegistry } from "./registry.js"
import { syncSources } from "./sync.js"

function drizzleStub(methods: Partial<Record<keyof AnyDrizzleDb, unknown>>): AnyDrizzleDb {
  return methods as never
}

/**
 * Stub IndexerService that records every reindex call and synthesizes
 * its own slices so the sync's pagination + dispatch are observable
 * without spinning up Typesense.
 */
function makeStubIndexer(slicesByVertical: Record<string, IndexerSlice[]>): {
  service: IndexerService
  upserted: Array<{ slice: IndexerSlice; doc: IndexerDocument }>
  deleted: Array<{ entityModule: string; entityId: string }>
} {
  const upserted: Array<{ slice: IndexerSlice; doc: IndexerDocument }> = []
  const deleted: Array<{ entityModule: string; entityId: string }> = []
  const service: IndexerService = {
    async ensureCollections() {},
    async reindexEntity(entityModule, entityId, builder: DocumentBuilder) {
      const slices = slicesByVertical[entityModule] ?? []
      for (const slice of slices) {
        const doc = await builder(entityId, slice)
        if (doc) upserted.push({ slice, doc })
      }
    },
    async reindexEntityForSlice(slice, entityId, builder: DocumentBuilder) {
      const doc = await builder(entityId, slice)
      if (doc) upserted.push({ slice, doc })
    },
    async deleteEntity(entityModule, entityId) {
      deleted.push({ entityModule, entityId })
    },
    async search(_slice: IndexerSlice, _request: SearchRequest): Promise<SearchResults> {
      return { total: 0, hits: [] }
    },
    slicesForVertical(entityModule: string): IndexerSlice[] {
      return slicesByVertical[entityModule] ?? []
    },
  }
  return { service, upserted, deleted }
}

/**
 * Stub field-policy registry that pretends every projection field is
 * indexed and visible to staff. The sync's job is to call
 * `buildIndexerDocument` with the right registry, slice, and entity id —
 * the registry's actual policy logic is covered by other tests.
 */
function makePassthroughRegistry(): FieldPolicyRegistry {
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

  return {
    policies: [],
    byPath: new Map(),
    resolve(path: string) {
      return policy(path)
    },
  }
}

function makeAdapter(
  kind: string,
  pages: Array<{ projections: string[]; next?: string }>,
): SourceAdapter {
  let pageIdx = 0
  return {
    kind,
    capabilities: {
      verticals: ["products"],
      supportsLiveResolution: false,
      supportsDriftDetection: false,
      supportsBookingForwarding: false,
      postBookOperations: [],
    },
    connect: async () => undefined,
    pause: async () => undefined,
    disconnect: async () => undefined,
    getState: async () => "active",
    discover: async () => {
      const page = pages[pageIdx] ?? { projections: [], next: undefined }
      pageIdx += 1
      return {
        projections: page.projections.map((id) => ({
          entity_module: "products",
          entity_id: id,
          provenance: { source_kind: kind, source_freshness: "sync" as const },
          fields: { id, name: `Inventory ${id}`, status: "active" },
        })),
        next_cursor: page.next,
      }
    },
  }
}

describe("syncSources", () => {
  it("paginates discovery and pushes each projection into every slice for the vertical", async () => {
    const registry = createSourceAdapterRegistry()
    registry.register(
      makeAdapter("demo", [
        { projections: ["a", "b"], next: "page-2" },
        { projections: ["c"], next: undefined },
      ]),
    )

    const slices: IndexerSlice[] = [
      { vertical: "products", locale: "en-GB", audience: "staff", market: "default" },
      { vertical: "products", locale: "en-GB", audience: "customer", market: "default" },
    ]
    const { service, upserted } = makeStubIndexer({ products: slices })
    const fieldPolicyRegistries = new Map([["products", makePassthroughRegistry()]])

    const summary = await syncSources({
      registry,
      indexerService: service,
      fieldPolicyRegistries,
    })

    expect(summary.totalProjections).toBe(3)
    expect(summary.adapters[0]?.pages).toBe(2)
    expect(summary.adapters[0]?.projectionsSynced).toBe(3)
    expect(summary.adapters[0]?.verticalsTouched).toEqual(["products"])
    // 3 projections × 2 slices = 6 upserts
    expect(upserted).toHaveLength(6)
    expect(upserted.map((u) => u.doc.id).sort()).toEqual(["a", "a", "b", "b", "c", "c"])
  })

  it("skips projections whose vertical has no field-policy registry", async () => {
    const registry = createSourceAdapterRegistry()
    registry.register(makeAdapter("demo", [{ projections: ["x"], next: undefined }]))

    const slices: IndexerSlice[] = [
      { vertical: "products", locale: "en-GB", audience: "staff", market: "default" },
    ]
    const { service, upserted } = makeStubIndexer({ products: slices })
    // Empty registry map → projection should be skipped, not crash.
    const summary = await syncSources({
      registry,
      indexerService: service,
      fieldPolicyRegistries: new Map(),
    })

    expect(summary.totalProjections).toBe(0)
    expect(summary.adapters[0]?.projectionsSynced).toBe(0)
    expect(summary.adapters[0]?.skippedNoRegistry).toBe(1)
    expect(upserted).toHaveLength(0)
  })

  it("emits onProgress per page", async () => {
    const registry = createSourceAdapterRegistry()
    registry.register(
      makeAdapter("demo", [
        { projections: ["a", "b"], next: "p2" },
        { projections: ["c"], next: undefined },
      ]),
    )
    const { service } = makeStubIndexer({
      products: [{ vertical: "products", locale: "en-GB", audience: "staff", market: "default" }],
    })
    const fieldPolicyRegistries = new Map([["products", makePassthroughRegistry()]])

    const events: number[] = []
    await syncSources({
      registry,
      indexerService: service,
      fieldPolicyRegistries,
      onProgress(event) {
        events.push(event.pageSize)
      },
    })
    expect(events).toEqual([2, 1])
  })

  it("counts owned vs sourced projections without a DB handle", async () => {
    // Adapter that emits one sourced + one owned projection. Without a
    // DB handle in scope, sync skips the sourced-entry upsert entirely;
    // it still counts owned vs sourced for diagnostics.
    const registry = createSourceAdapterRegistry()
    registry.register({
      kind: "mixed",
      capabilities: {
        verticals: ["products"],
        supportsLiveResolution: false,
        supportsDriftDetection: false,
        supportsBookingForwarding: false,
        postBookOperations: [],
      },
      connect: async () => undefined,
      pause: async () => undefined,
      disconnect: async () => undefined,
      getState: async () => "active",
      discover: async () => ({
        projections: [
          {
            entity_module: "products",
            entity_id: "owned_a",
            provenance: { source_kind: "owned", source_freshness: "static" as const },
            fields: { id: "owned_a", name: "Owned A", status: "active" },
          },
          {
            entity_module: "products",
            entity_id: "src_b",
            provenance: { source_kind: "direct:tui", source_freshness: "sync" as const },
            fields: { id: "src_b", name: "Sourced B", status: "active" },
          },
        ],
        next_cursor: undefined,
      }),
    })
    const { service } = makeStubIndexer({
      products: [{ vertical: "products", locale: "en-GB", audience: "staff", market: "default" }],
    })
    const fieldPolicyRegistries = new Map([["products", makePassthroughRegistry()]])

    const summary = await syncSources({
      registry,
      indexerService: service,
      fieldPolicyRegistries,
      // No db handle → sourced-entry upsert path is gated off.
    })

    expect(summary.adapters[0]?.projectionsSynced).toBe(2)
    expect(summary.adapters[0]?.ownedProjections).toBe(1)
    expect(summary.adapters[0]?.sourcedEntriesUpserted).toBe(0)
  })

  it("upserts sourced-entry rows when a DB handle is in scope (stub)", async () => {
    // Stub the upsert path by passing a fake `db` and asserting the
    // counter advances. The integration test covers the actual SQL.
    const registry = createSourceAdapterRegistry()
    registry.register(makeAdapter("demo", [{ projections: ["a", "b"], next: undefined }]))
    const { service } = makeStubIndexer({
      products: [{ vertical: "products", locale: "en-GB", audience: "staff", market: "default" }],
    })
    const fieldPolicyRegistries = new Map([["products", makePassthroughRegistry()]])

    // Stub db whose .insert(...).values(...).onConflictDoUpdate(...).returning()
    // returns one row. Mirrors enough of the drizzle chain to exercise sync.
    const upsertCalls: unknown[] = []
    const stubDb = drizzleStub({
      insert() {
        return {
          values(v: unknown) {
            upsertCalls.push(v)
            return {
              onConflictDoUpdate() {
                return {
                  async returning() {
                    return [{ id: "cse_x", entity_module: "products", entity_id: "a" }]
                  },
                }
              },
            }
          },
        }
      },
    })

    const summary = await syncSources({
      registry,
      indexerService: service,
      fieldPolicyRegistries,
      db: stubDb,
    })

    expect(summary.adapters[0]?.sourcedEntriesUpserted).toBe(2)
    expect(upsertCalls).toHaveLength(2)
  })

  it("applies wrapBuilder to every per-projection builder", async () => {
    const registry = createSourceAdapterRegistry()
    registry.register(makeAdapter("demo", [{ projections: ["a"], next: undefined }]))
    const { service, upserted } = makeStubIndexer({
      products: [{ vertical: "products", locale: "en-GB", audience: "staff", market: "default" }],
    })
    const fieldPolicyRegistries = new Map([["products", makePassthroughRegistry()]])

    let wrapped = 0
    await syncSources({
      registry,
      indexerService: service,
      fieldPolicyRegistries,
      wrapBuilder(inner) {
        wrapped += 1
        return async (entityId, slice) => {
          const doc = await inner(entityId, slice)
          if (!doc) return null
          return {
            ...doc,
            fields: { ...doc.fields, wrapped: true },
          }
        }
      },
    })

    expect(wrapped).toBe(1)
    expect(upserted[0]?.doc.fields.wrapped).toBe(true)
  })

  it("marks missing sourced rows withdrawn and deletes them from index slices after a successful pruned sync", async () => {
    const registry = createSourceAdapterRegistry()
    registry.register("conn-a", {
      kind: "demo",
      capabilities: {
        verticals: ["products"],
        supportsLiveResolution: false,
        supportsDriftDetection: false,
        supportsBookingForwarding: false,
        postBookOperations: [],
      },
      connect: async () => undefined,
      pause: async () => undefined,
      disconnect: async () => undefined,
      getState: async () => "active",
      discover: async () => ({
        projections: [
          {
            entity_module: "products",
            entity_id: "active_a",
            provenance: {
              source_kind: "demo",
              source_connection_id: "conn-a",
              source_ref: "src-a",
              source_freshness: "sync" as const,
            },
            fields: { id: "active_a", name: "Active A", status: "active" },
          },
        ],
        next_cursor: undefined,
      }),
    })

    const { service, deleted } = makeStubIndexer({
      products: [{ vertical: "products", locale: "en-GB", audience: "staff", market: "default" }],
    })
    const fieldPolicyRegistries = new Map([["products", makePassthroughRegistry()]])

    const updatedIds: string[][] = []
    const stubDb = drizzleStub({
      insert() {
        return {
          values() {
            return {
              onConflictDoUpdate() {
                return {
                  async returning() {
                    return [{ id: "cse_active", entity_module: "products", entity_id: "active_a" }]
                  },
                }
              },
            }
          },
        }
      },
      select() {
        return {
          from() {
            return {
              async where() {
                return [
                  {
                    id: "cse_stale",
                    entity_module: "products",
                    entity_id: "stale_b",
                  },
                ]
              },
            }
          },
        }
      },
      update() {
        return {
          set() {
            return {
              async where(condition: unknown) {
                updatedIds.push([String(condition)])
              },
            }
          },
        }
      },
    })

    const summary = await syncSources({
      registry,
      indexerService: service,
      fieldPolicyRegistries,
      db: stubDb,
      pruneMissing: true,
      verticals: ["products"],
    })

    expect(summary.adapters[0]?.withdrawnProjections).toBe(1)
    expect(deleted).toEqual([{ entityModule: "products", entityId: "stale_b" }])
    expect(updatedIds).toHaveLength(1)
  })
})

/**
 * Regression coverage for #4089: attaching a supply connection used to publish
 * the supplier's whole catalogue into every channel slice, because sourced
 * projections never passed a listability gate at all.
 */
describe("syncSources sourced-entry publication gate", () => {
  const slices: IndexerSlice[] = [
    { vertical: "products", locale: "en-GB", audience: "staff", market: "default" },
    {
      vertical: "products",
      locale: "en-GB",
      audience: "customer",
      market: "default",
      channel: "chan_website",
    },
  ]

  it("keeps an unpublished sourced entry out of customer slices but in staff slices", async () => {
    const registry = createSourceAdapterRegistry()
    registry.register(makeAdapter("tui", [{ projections: ["tui-pkg:ACE20001"] }]))
    const { service, upserted } = makeStubIndexer({ products: slices })

    const summary = await syncSources({
      registry,
      indexerService: service,
      fieldPolicyRegistries: new Map([["products", makePassthroughRegistry()]]),
      // No publication rule exists for this connection.
      isSourcedEntryListable: ({ slice }) => slice.audience === "staff",
    })

    expect(summary.totalProjections).toBe(1)
    expect(upserted.map((entry) => entry.slice.audience)).toEqual(["staff"])
  })

  it("emits into the customer slice once the connection is published", async () => {
    const registry = createSourceAdapterRegistry()
    registry.register(makeAdapter("tui", [{ projections: ["tui-pkg:ACE20001"] }]))
    const { service, upserted } = makeStubIndexer({ products: slices })
    const seen: Array<{ sourceKind: string; sourceConnectionId: string | null }> = []

    await syncSources({
      registry,
      indexerService: service,
      fieldPolicyRegistries: new Map([["products", makePassthroughRegistry()]]),
      isSourcedEntryListable: ({ provenance }) => {
        seen.push(provenance)
        return true
      },
    })

    expect(upserted.map((entry) => entry.slice.audience).sort()).toEqual(["customer", "staff"])
    // The gate is addressed by provenance, not by entity id — a sourced entry
    // has no owned row for a product rule to hang off.
    expect(seen[0]?.sourceKind).toBe("tui")
  })

  it("projects provenance into the document so consumers need not infer ownership", async () => {
    const registry = createSourceAdapterRegistry()
    registry.register(makeAdapter("tui", [{ projections: ["tui-pkg:ACE20001"] }]))
    const { service, upserted } = makeStubIndexer({ products: slices })

    await syncSources({
      registry,
      indexerService: service,
      fieldPolicyRegistries: new Map([["products", makePassthroughRegistry()]]),
      isSourcedEntryListable: () => true,
    })

    expect(upserted[0]?.doc.fields).toMatchObject({ isSourced: true, sourceKind: "tui" })
  })

  it("does not gate owned projections — they carry their own product rule", async () => {
    const registry = createSourceAdapterRegistry()
    registry.register(makeOwnedAdapter("in-house", ["prod_123"]))
    const { service, upserted } = makeStubIndexer({ products: slices })
    const gate = vi.fn(() => false)

    await syncSources({
      registry,
      indexerService: service,
      fieldPolicyRegistries: new Map([["products", makePassthroughRegistry()]]),
      isSourcedEntryListable: gate,
    })

    expect(gate).not.toHaveBeenCalled()
    expect(upserted).toHaveLength(2)
    expect(upserted[0]?.doc.fields).toMatchObject({ isSourced: false, sourceKind: "owned" })
  })
})

/** An adapter whose `discover()` emits operator-owned projections. */
function makeOwnedAdapter(kind: string, ids: string[]): SourceAdapter {
  let done = false
  return {
    ...makeAdapter(kind, []),
    discover: async () => {
      if (done) return { projections: [], next_cursor: undefined }
      done = true
      return {
        projections: ids.map((id) => ({
          entity_module: "products",
          entity_id: id,
          provenance: { source_kind: "owned", source_freshness: "sync" as const },
          fields: { id, name: `Owned ${id}`, status: "active" },
        })),
        next_cursor: undefined,
      }
    },
  }
}

describe("syncSources provenance authority", () => {
  it("does not let an adapter payload overwrite the provenance it was routed by", async () => {
    const registry = createSourceAdapterRegistry()
    // A supplier payload claiming to be owned inventory.
    registry.register({
      ...makeAdapter("tui", []),
      discover: (() => {
        let done = false
        return async () => {
          if (done) return { projections: [], next_cursor: undefined }
          done = true
          return {
            projections: [
              {
                entity_module: "products",
                entity_id: "tui-pkg:ACE20001",
                provenance: {
                  source_kind: "tui",
                  source_connection_id: "conn_tui",
                  source_freshness: "sync" as const,
                },
                fields: { id: "tui-pkg:ACE20001", isSourced: false, sourceKind: "owned" },
              },
            ],
            next_cursor: undefined,
          }
        }
      })(),
    })
    const slices: IndexerSlice[] = [
      { vertical: "products", locale: "en-GB", audience: "staff", market: "default" },
    ]
    const { service, upserted } = makeStubIndexer({ products: slices })

    await syncSources({
      registry,
      indexerService: service,
      fieldPolicyRegistries: new Map([["products", makePassthroughRegistry()]]),
      isSourcedEntryListable: () => true,
    })

    expect(upserted[0]?.doc.fields).toMatchObject({
      isSourced: true,
      sourceKind: "tui",
      sourceConnectionId: "conn_tui",
    })
  })
})
