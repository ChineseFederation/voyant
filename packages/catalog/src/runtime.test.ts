import type { CatalogSearchRuntimeOptions } from "@voyant-travel/catalog/api-runtime-ports"
import type { CatalogProjectionRuntimeProvider } from "@voyant-travel/catalog/subscriber-runtime-ports"
import type {
  IndexerAdapter,
  IndexerProvider,
} from "@voyant-travel/catalog-contracts/indexer/contract"
import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  dimensions: 384,
  offerIndexer: undefined as ((context: unknown) => IndexerAdapter | undefined) | undefined,
  registries: new Map(),
  subscriberIndexer: undefined as IndexerAdapter | undefined,
}))

vi.mock("./runtime/booking-engine-runtime.js", () => ({
  ensureBookingEngineRegistry: vi.fn(),
  getBookingEngineRegistryFromContext: vi.fn(),
  getOwnedBookingHandlerRegistry: vi.fn(),
  getOwnedBookingHandlerRegistryFromContext: vi.fn(),
}))

vi.mock("./runtime/booking-runtime.js", () => ({
  createOperatorCatalogBookingRouteModuleOptions: vi.fn(() => ({})),
}))

vi.mock("./runtime/catalog-runtime.js", () => ({
  buildEmbeddingProvider: vi.fn(() => ({
    capabilities: {
      dimensions: state.dimensions,
      maxBatchSize: 32,
      maxTokensPerInput: 512,
      modelId: "test/embedding/v1",
    },
  })),
  createCatalogDocumentBuilder: vi.fn(),
  createProductsDocumentBuilder: vi.fn(),
  DEFAULT_SLICES: [],
  getFieldPolicyRegistries: vi.fn(() => state.registries),
  loadCatalogSlices: vi.fn(),
  withEmbedding: vi.fn((builder: unknown) => builder),
  withoutCatalogScopeChannel: vi.fn((scope: unknown) => scope),
}))

vi.mock("./runtime/host.js", () => ({
  configureCatalogRuntimeHost: vi.fn(),
}))

vi.mock("./runtime/offers-runtime.js", () => ({
  createOperatorCatalogOffersRouteModuleOptions: vi.fn(
    (_resolveScope: unknown, resolveIndexer: (context: unknown) => IndexerAdapter | undefined) => {
      state.offerIndexer = resolveIndexer
      return {}
    },
  ),
}))

vi.mock("./runtime/subscriber-runtime.js", () => ({
  createOperatorCatalogBookingSnapshotRuntime: vi.fn(),
  createOperatorCatalogProjectionRuntime: vi.fn(
    (
      _bindings: unknown,
      services: {
        buildEmbeddingProvider(env: Record<string, unknown>): unknown
        buildIndexer(env: Record<string, unknown>, embeddings: unknown): IndexerAdapter | undefined
      },
    ) => {
      const env = {}
      state.subscriberIndexer = services.buildIndexer(env, services.buildEmbeddingProvider(env))
      return {}
    },
  ),
}))

vi.mock("./runtime-contracts.js", () => ({
  installCatalogRuntimeServices: vi.fn(),
}))

import { createCatalogRuntime } from "./runtime.js"

function createAdapter(): IndexerAdapter {
  return {
    capabilities: {
      supportsKeywordSearch: true,
      supportsHybridSearch: true,
      supportsVectorFields: true,
      vectorDimensions: state.dimensions,
      maxVectorsPerDocument: 1,
      supportsCrossAudienceFederation: false,
      supportsAdminDenormalization: true,
    },
    ensureCollection: vi.fn(async () => undefined),
    upsert: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    search: vi.fn(async () => ({ hits: [], total: 0 })),
    bulkReindex: vi.fn(async () => undefined),
  }
}

function resolveRuntimeIndexers(indexer: IndexerAdapter | IndexerProvider) {
  const runtime = createCatalogRuntime(
    {} as never,
    {
      accommodations: {
        registerOwnedAvailabilitySearchHandler: vi.fn(),
      },
    } as never,
    {} as never,
    { indexer },
  )
  const context = { env: {}, var: { actor: "staff" } }
  const search = (runtime.search as CatalogSearchRuntimeOptions).resolveRuntime(context as never)
  const offers = state.offerIndexer?.(context)
  void (runtime.projection as CatalogProjectionRuntimeProvider).createRuntime({})

  return { search: search.indexer, offers, projection: state.subscriberIndexer }
}

describe("createCatalogRuntime indexer authority", () => {
  beforeEach(() => {
    state.offerIndexer = undefined
    state.subscriberIndexer = undefined
    vi.clearAllMocks()
  })

  it("shares one directly supplied adapter across search, offers, and subscribers", () => {
    const adapter = createAdapter()

    expect(resolveRuntimeIndexers(adapter)).toEqual({
      search: adapter,
      offers: adapter,
      projection: adapter,
    })
  })

  it("creates a selected provider once and shares its adapter across every consumer", () => {
    const adapter = createAdapter()
    const create = vi.fn(() => adapter)

    expect(resolveRuntimeIndexers({ create })).toEqual({
      search: adapter,
      offers: adapter,
      projection: adapter,
    })
    expect(create).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledWith({
      registries: state.registries,
      vectorDimensions: state.dimensions,
    })
  })

  it("validates embedding compatibility for a direct adapter", () => {
    const adapter = createAdapter()
    adapter.capabilities.vectorDimensions = 768

    expect(() => resolveRuntimeIndexers(adapter)).toThrow(
      /test\/embedding\/v1 produces 384-d vectors.*configured for 768-d/s,
    )
  })

  it("does not cache an adapter when embedding validation fails", () => {
    const incompatible = createAdapter()
    incompatible.capabilities.vectorDimensions = 768
    const compatible = createAdapter()
    const create = vi.fn().mockReturnValueOnce(incompatible).mockReturnValueOnce(compatible)
    const runtime = createCatalogRuntime(
      {} as never,
      {
        accommodations: {
          registerOwnedAvailabilitySearchHandler: vi.fn(),
        },
      } as never,
      {} as never,
      { indexer: { create } },
    )
    const search = runtime.search as CatalogSearchRuntimeOptions
    const context = { env: {}, var: { actor: "staff" } }

    expect(() => search.resolveRuntime(context as never)).toThrow(
      /test\/embedding\/v1 produces 384-d vectors.*configured for 768-d/s,
    )
    expect(search.resolveRuntime(context as never).indexer).toBe(compatible)
    expect(create).toHaveBeenCalledTimes(2)
  })
})
