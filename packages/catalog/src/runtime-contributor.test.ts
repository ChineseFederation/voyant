import { bookingsRelationshipsRuntimePort } from "@voyant-travel/bookings/runtime-port"
import { catalogSearchRuntimePort } from "@voyant-travel/catalog/api-runtime-ports"
import { createFieldPolicyRegistry } from "@voyant-travel/catalog/contract"
import { catalogIndexerProviderPort } from "@voyant-travel/catalog/indexer/provider"
import { catalogReindexJobRuntimePort } from "@voyant-travel/catalog/reindex-job"
import {
  catalogAccommodationsRuntimeExtensionPort,
  catalogChartersRuntimeExtensionPort,
  catalogCommerceRuntimeExtensionPort,
  catalogCruisesRuntimeExtensionPort,
  catalogDistributionRuntimeExtensionPort,
  catalogInventoryRuntimeExtensionPort,
  catalogOperationsRuntimeExtensionPort,
} from "@voyant-travel/catalog/runtime-contracts"
import type { IndexerAdapter } from "@voyant-travel/catalog-contracts/indexer/contract"
import { financeOperatorSettingsRuntimePort } from "@voyant-travel/finance/runtime-port"
import { describe, expect, it, vi } from "vitest"

import { catalogBookingSessionMaintenanceJobRuntimePort } from "./booking-session-maintenance-job-runtime-port.js"
import { createCatalogRuntimePortContribution } from "./runtime-contributor.js"

type SelfServiceDeps = {
  resolveBillingPerson?: (
    contact: Record<string, unknown>,
    provenance: { source: string; sourceRef: string },
  ) => Promise<string | null>
}

/** Deps handed to the provider, in call order; the last one is the newest. */
const capturedSelfServiceDeps: SelfServiceDeps[] = []

vi.mock("@voyant-travel/catalog/booking-engine", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    createSelfServiceBookingSourceProvider: (deps: SelfServiceDeps) => {
      capturedSelfServiceDeps.push(deps)
      return (actual.createSelfServiceBookingSourceProvider as (d: SelfServiceDeps) => unknown)(
        deps,
      )
    },
  }
})

describe("createCatalogRuntimePortContribution", () => {
  it("does not read retention environment while contributing runtime ports", async () => {
    const contribution = createCatalogRuntimePortContribution({
      primitives: { database: { resolve: () => ({}) } } as never,
      hasRuntimePort: () => false,
      getRuntimePort: vi.fn(() => ({})) as never,
    })

    expect(
      (
        contribution[catalogBookingSessionMaintenanceJobRuntimePort.id] as {
          resolveRetentionMs?: unknown
        }
      ).resolveRetentionMs,
    ).toBeTypeOf("function")
    await Promise.allSettled(
      Object.values(contribution).filter(
        (value): value is Promise<unknown> => value instanceof Promise,
      ),
    )
  })

  it.each([
    undefined,
    null,
    false,
    0,
    "",
    { source: "host" },
  ])("rejects an invalid present catalog.indexer port during boot: %j", async (indexer) => {
    const contribution = createCatalogRuntimePortContribution({
      primitives: {} as never,
      hasRuntimePort: (port) => port.id === catalogIndexerProviderPort.id,
      getRuntimePort: (port) => (port.id === catalogIndexerProviderPort.id ? indexer : {}) as never,
    })
    const search = contribution[catalogSearchRuntimePort.id] as Promise<unknown>
    const observed = Promise.allSettled(
      Object.values(contribution).filter(
        (value): value is Promise<unknown> => value instanceof Promise,
      ),
    )

    await expect(search).rejects.toThrow(
      "catalog.indexer must implement IndexerAdapter or IndexerProvider.create().",
    )
    await observed
  })

  it("fails explicitly when a product reindex is requested without an indexer", async () => {
    const contribution = createCatalogRuntimePortContribution({
      primitives: {} as never,
      hasRuntimePort: () => false,
      getRuntimePort: vi.fn() as never,
    })
    const provider = contribution[catalogReindexJobRuntimePort.id] as {
      createRuntime(bindings: unknown): Promise<unknown>
    }

    await expect(provider.createRuntime({ TENANT_ID: "tenant_pro_travel" })).rejects.toThrow(
      "requires a configured catalog indexer",
    )
    await Promise.allSettled(
      Object.values(contribution).filter(
        (value): value is Promise<unknown> => value instanceof Promise,
      ),
    )
  })

  it("uses the same non-default tenant bindings for inventory and the selected indexer", async () => {
    const bindings = { TENANT_ID: "tenant_pro_travel", DATABASE_URL: "postgres://tenant" }
    const transaction = vi.fn(async (receivedBindings, operation) => {
      expect(receivedBindings).toBe(bindings)
      return operation({})
    })
    const upsert = vi.fn(async () => undefined)
    const adapter: IndexerAdapter = {
      capabilities: {
        supportsKeywordSearch: true,
        supportsHybridSearch: false,
        supportsVectorFields: false,
        vectorDimensions: null,
        maxVectorsPerDocument: null,
        supportsCrossAudienceFederation: false,
        supportsAdminDenormalization: true,
      },
      ensureCollection: vi.fn(async () => undefined),
      upsert,
      delete: vi.fn(async () => undefined),
      search: vi.fn(async () => ({ hits: [], total: 0 })),
      bulkReindex: vi.fn(async () => undefined),
    }
    const createIndexer = vi.fn(() => adapter)
    const createProductBuilder = vi.fn(({ sellerOperatorId }) => {
      expect(sellerOperatorId).toBe("tenant_pro_travel")
      return async (entityId: string) => ({ id: entityId, fields: { sellerOperatorId } })
    })
    const emptyProjection = { name: "test", project: vi.fn(async () => new Map()) }
    const extensions = {
      [catalogAccommodationsRuntimeExtensionPort.id]: {
        fieldPolicy: [],
        propertyFieldPolicy: [],
        createDocumentBuilder: vi.fn(() => async () => null),
        createPropertyDocumentBuilder: vi.fn(() => async () => null),
        registerOwnedAvailabilitySearchHandler: vi.fn(),
      },
      [catalogChartersRuntimeExtensionPort.id]: { fieldPolicy: [] },
      [catalogCommerceRuntimeExtensionPort.id]: {
        loadSliceInputs: vi.fn(async () => ({ markets: [], locales: [] })),
        createPromotionEvaluator: vi.fn(),
        createPricingProjectionExtension: () => emptyProjection,
        createPromotionsProjectionExtension: () => emptyProjection,
      },
      [catalogCruisesRuntimeExtensionPort.id]: {
        fieldPolicy: [],
        shipFieldPolicy: [],
        createRegistry: () => createFieldPolicyRegistry([]),
        createDocumentBuilder: vi.fn(() => async () => null),
        createShipDocumentBuilder: vi.fn(() => async () => null),
        createCabinFacetProjectionExtension: () => emptyProjection,
      },
      [catalogDistributionRuntimeExtensionPort.id]: {
        loadActiveChannelIds: vi.fn(async () => []),
        hasEffectiveProductPublication: vi.fn(async () => true),
      },
      [catalogInventoryRuntimeExtensionPort.id]: {
        productFieldPolicy: [],
        extrasFieldPolicy: [],
        listCanonicalProductIds: vi.fn(async () => ["product_1"]),
        createDocumentBuilder: createProductBuilder,
        createStorefrontCardProjectionExtension: () => emptyProjection,
        createDestinationsProjectionExtension: () => emptyProjection,
        createTaxonomyProjectionExtension: () => emptyProjection,
        getProductContent: vi.fn(),
        getOwnedProductById: vi.fn(),
        enrichProductQuoteShape: vi.fn(),
        loadProductReservationPolicy: vi.fn(),
      },
      [catalogOperationsRuntimeExtensionPort.id]: {
        createDeparturesProjectionExtension: () => emptyProjection,
        listAvailabilitySlots: vi.fn(),
      },
      [financeOperatorSettingsRuntimePort.id]: {},
    } as Record<string, unknown>
    const contribution = createCatalogRuntimePortContribution({
      primitives: {
        env: (receivedBindings: unknown) => receivedBindings as never,
        database: { transaction },
      } as never,
      hasRuntimePort: (port) => port.id === catalogIndexerProviderPort.id,
      getRuntimePort: (port) =>
        (port.id === catalogIndexerProviderPort.id
          ? { create: createIndexer }
          : extensions[port.id]) as never,
    })
    const provider = contribution[catalogReindexJobRuntimePort.id] as {
      createRuntime(bindings: unknown): Promise<{
        listProductIdsPage(input: { limit: number }): Promise<readonly string[]>
        reindexProduct(productId: string): Promise<void>
      }>
    }

    const runtime = await provider.createRuntime(bindings)
    await expect(runtime.listProductIdsPage({ limit: 100 })).resolves.toEqual(["product_1"])
    await runtime.reindexProduct("product_1")

    expect(createIndexer).toHaveBeenCalledOnce()
    expect(createProductBuilder).toHaveBeenCalled()
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ vertical: "products" }), [
      expect.objectContaining({ id: "product_1" }),
    ])
    expect(transaction).toHaveBeenCalled()
  })

  /**
   * Contributors load in alphabetical order by package name, and
   * `bookings.relationships.runtime` comes from @voyant-travel/relationships —
   * which sorts AFTER @voyant-travel/catalog and so cannot ever have run by the
   * time this contributor is built. Deciding then read the port as permanently
   * absent and dropped `resolveBillingPerson` from the deps entirely, which made
   * `resolveBilling` return null and refused every guest self-service booking
   * with `incomplete_draft`. Authenticated customers were unaffected, so it
   * stayed invisible.
   *
   * `resolveBillingPerson` lives in the provider's closure, so the deps object
   * handed to `createSelfServiceBookingSourceProvider` is the only place the
   * wiring is observable.
   */
  it("wires a billing-person resolver even when the relationships port arrives later", async () => {
    const upsertPersonFromContact = vi.fn(async () => ({ id: "person_1" }))
    let relationshipsPortPresent = false
    const contribution = createCatalogRuntimePortContribution({
      primitives: { env: () => ({}), database: { resolve: () => ({}) } } as never,
      hasRuntimePort: (port) =>
        port.id === bookingsRelationshipsRuntimePort.id ? relationshipsPortPresent : false,
      getRuntimePort: ((port: { id: string }) =>
        port.id === bookingsRelationshipsRuntimePort.id
          ? { upsertPersonFromContact }
          : {}) as never,
    })
    // The port lands after every contributor has run, before any request.
    relationshipsPortPresent = true

    const deps = capturedSelfServiceDeps.at(-1)
    expect(deps?.resolveBillingPerson).toBeTypeOf("function")
    await expect(
      deps?.resolveBillingPerson?.(
        { firstName: "Mihai", lastName: "Ungureanu", email: "buyer@example.com", phone: null },
        { source: "storefront-self-service", sourceRef: "bdrf_1" },
      ),
    ).resolves.toBe("person_1")
    expect(upsertPersonFromContact).toHaveBeenCalledOnce()

    await Promise.allSettled(
      Object.values(contribution).filter(
        (value): value is Promise<unknown> => value instanceof Promise,
      ),
    )
  })

  it("refuses a guest booking when the relationships port is genuinely absent", async () => {
    const contribution = createCatalogRuntimePortContribution({
      primitives: { env: () => ({}), database: { resolve: () => ({}) } } as never,
      hasRuntimePort: () => false,
      getRuntimePort: vi.fn() as never,
    })

    const deps = capturedSelfServiceDeps.at(-1)
    // Null, not a throw: only authenticated customers can book on a deployment
    // that ships no relationships runtime.
    await expect(
      deps?.resolveBillingPerson?.(
        { firstName: "Mihai", lastName: "Ungureanu", email: "buyer@example.com", phone: null },
        { source: "storefront-self-service", sourceRef: "bdrf_1" },
      ),
    ).resolves.toBeNull()

    await Promise.allSettled(
      Object.values(contribution).filter(
        (value): value is Promise<unknown> => value instanceof Promise,
      ),
    )
  })
})
