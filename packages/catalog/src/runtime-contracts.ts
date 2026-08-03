import type {
  IndexerAdapter,
  IndexerSlice,
} from "@voyant-travel/catalog-contracts/indexer/contract"
import { definePort } from "@voyant-travel/core/project"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import type { PaymentPolicy } from "@voyant-travel/finance"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { SourceAdapterContext } from "./adapter/contract.js"
import type {
  BookingSessionCompositeHandler,
  OwnedBookingHandlerRegistry,
  QuoteEntityResult,
  SourceAdapterRegistry,
} from "./booking-engine/index.js"
import type { CatalogBookingRouteModuleOptions } from "./booking-engine/operator-routes.js"
import type { CatalogBookingRoutesOptions } from "./booking-engine/routes-contracts.js"
import type {
  CatalogBookingSnapshotExecutionContext,
  CatalogBookingSnapshotRuntime,
} from "./booking-snapshot-subscriber-runtime.js"
import type { FieldPolicy, FieldPolicyRegistry } from "./contract.js"
import type { EmbeddingProvider } from "./embeddings/contract.js"
import type { EntityOverlayChangedPayload } from "./events/taxonomy.js"
import type { OwnedAvailabilitySearchHandlerRegistry } from "./search/owned-search-handler.js"
import type { DocumentBuilder } from "./services/indexer-service.js"

export { catalogBookingRuntimePort } from "./booking-runtime-port.js"
export {
  type CatalogProjectionRuntimeProvider,
  catalogProjectionRuntimePort,
} from "./subscriber-runtime-ports.js"

export interface CatalogProjectionExtension {
  readonly name: string
  project(
    db: AnyDrizzleDb,
    entityId: string,
    slice: IndexerSlice,
  ): Promise<ReadonlyMap<string, unknown>>
}

export interface CatalogOwnedBookingHandlerHost {
  withDatabase<T>(operation: (db: PostgresJsDatabase) => Promise<T>): Promise<T>
  getSourceRegistry(): SourceAdapterRegistry
}

export interface CatalogPolicyRuntimeExtension {
  readonly fieldPolicy: readonly FieldPolicy[]
}

export interface CatalogAccommodationsRuntimeExtension extends CatalogPolicyRuntimeExtension {
  readonly propertyFieldPolicy: readonly FieldPolicy[]
  createDocumentBuilder(input: { db: AnyDrizzleDb; sellerOperatorId: string }): DocumentBuilder
  listAccommodationOffersReferencingProperty(
    db: AnyDrizzleDb,
    propertyId: string,
  ): Promise<Array<{ entityModule: "accommodations"; entityId: string }>>
  createPropertyDocumentBuilder(db: AnyDrizzleDb): DocumentBuilder
  registerOwnedBookingHandler(
    registry: OwnedBookingHandlerRegistry,
    host: CatalogOwnedBookingHandlerHost,
  ): void
  registerOwnedAvailabilitySearchHandler(registry: OwnedAvailabilitySearchHandlerRegistry): void
}

export interface CatalogChartersRuntimeExtension extends CatalogPolicyRuntimeExtension {}

export interface CatalogCommerceRuntimeExtension {
  loadSliceInputs(db: AnyDrizzleDb): Promise<{
    markets: readonly { id: string; defaultLanguageTag: string }[]
    locales: readonly { marketId: string; languageTag: string }[]
  }>
  createPromotionEvaluator: NonNullable<CatalogBookingRoutesOptions["resolveEvaluatePromotions"]>
  createPricingProjectionExtension(): CatalogProjectionExtension
  createPromotionsProjectionExtension(): CatalogProjectionExtension
}

export interface CatalogDistributionRuntimeExtension {
  loadActiveChannelIds(db: AnyDrizzleDb): Promise<readonly string[]>
  hasEffectiveProductPublication(
    db: AnyDrizzleDb,
    productId: string,
    channelId?: string,
  ): Promise<boolean>
  loadSupplierReservationTimeout(
    db: AnyDrizzleDb,
    supplierId: string,
  ): Promise<{ reservationTimeoutMinutes: number | null } | null>
  loadSupplierPaymentPolicy(db: AnyDrizzleDb, supplierId: string): Promise<PaymentPolicy | null>
}

/**
 * Provider-neutral request-time publication decision used by public catalog
 * and checkout consumers. The selected Distribution implementation owns the
 * policy and persistence; consumers only supply their resolved database and
 * channel identity.
 */
export interface CatalogPublicationRuntime {
  isProductPublished(input: {
    db: AnyDrizzleDb
    productId: string
    channelId: string
  }): Promise<boolean>
}

export interface CatalogCruisesRuntimeExtension extends CatalogPolicyRuntimeExtension {
  readonly shipFieldPolicy: readonly FieldPolicy[]
  listCruisesReferencingShip(
    db: AnyDrizzleDb,
    shipId: string,
  ): Promise<Array<{ entityModule: "cruises"; entityId: string }>>
  createShipDocumentBuilder(db: AnyDrizzleDb): DocumentBuilder
  createRegistry(fieldPolicy: readonly FieldPolicy[]): FieldPolicyRegistry
  createDocumentBuilder(input: {
    db: AnyDrizzleDb
    sellerOperatorId: string
    registry?: FieldPolicyRegistry
    extensions: readonly CatalogProjectionExtension[]
  }): DocumentBuilder
  createCabinFacetProjectionExtension(): CatalogProjectionExtension
  registerOwnedBookingHandler(
    registry: OwnedBookingHandlerRegistry,
    host: CatalogOwnedBookingHandlerHost,
  ): void
  registerAdapters(
    registry: SourceAdapterRegistry,
    env: Readonly<Record<string, string | undefined>>,
    adapters?: readonly unknown[],
  ): void
  syncRegistry(registry: SourceAdapterRegistry): void
}

export type CatalogProductQuoteEnricher = (input: {
  db: unknown
  result: QuoteEntityResult
  entityModule: string
  entityId: string
  locale?: string
  audience?: string
  market?: string
  currency?: string
  registry: SourceAdapterRegistry
  adapterContext?: SourceAdapterContext
}) => Promise<QuoteEntityResult>

export interface CatalogInventoryRuntimeExtension {
  readonly productFieldPolicy: readonly FieldPolicy[]
  readonly extrasFieldPolicy: readonly FieldPolicy[]
  listCanonicalProductIds(
    db: AnyDrizzleDb,
    input: { afterId?: string; limit: number },
  ): Promise<readonly string[]>
  createDocumentBuilder(input: {
    db: AnyDrizzleDb
    sellerOperatorId: string
    registry?: FieldPolicyRegistry
    extensions: readonly CatalogProjectionExtension[]
    isPublicAudienceListable(input: {
      db: AnyDrizzleDb
      product: { id: string }
      slice: IndexerSlice
    }): boolean | Promise<boolean>
  }): DocumentBuilder
  createStorefrontCardProjectionExtension(): CatalogProjectionExtension
  createDestinationsProjectionExtension(): CatalogProjectionExtension
  createTaxonomyProjectionExtension(): CatalogProjectionExtension
  createClassificationProjectionExtension(): CatalogProjectionExtension
  listProductsReferencingAccommodationProperty(
    db: AnyDrizzleDb,
    propertyId: string,
  ): Promise<Array<{ entityModule: "products"; entityId: string }>>
  registerOwnedBookingHandler(
    registry: OwnedBookingHandlerRegistry,
    host: CatalogOwnedBookingHandlerHost,
  ): void
  getProductContent: CatalogBookingRouteModuleOptions["getProductContent"]
  getOwnedProductById: CatalogBookingRouteModuleOptions["getOwnedProductById"]
  loadProductReservationPolicy(
    db: AnyDrizzleDb,
    productId: string,
  ): Promise<{ supplierId: string | null; reservationTimeoutMinutes: number | null } | null>
  loadProductPaymentPolicyContext(
    db: AnyDrizzleDb,
    productId: string,
  ): Promise<{
    listingPolicy: PaymentPolicy | null
    categoryPolicy: PaymentPolicy | null
    supplierId: string | null
    departureDate: string | null
  } | null>
  enrichProductQuoteShape: CatalogProductQuoteEnricher
  buildSnapshotInput(
    db: AnyDrizzleDb,
    productId: Parameters<CatalogBookingSnapshotExecutionContext["buildSnapshotInput"]>[0],
    options: Parameters<CatalogBookingSnapshotExecutionContext["buildSnapshotInput"]>[1],
  ): ReturnType<CatalogBookingSnapshotExecutionContext["buildSnapshotInput"]>
}

export interface CatalogOperationsRuntimeExtension {
  listAvailabilitySlots: CatalogBookingRouteModuleOptions["listAvailabilitySlots"]
  createDeparturesProjectionExtension(): CatalogProjectionExtension
}

/**
 * A channel that sources inventory into the booking engine.
 *
 * Voyant Connect is one implementation; the catalog spine must not name it.
 * Anything that can register `SourceAdapter`s — a self-hosted integration, a
 * different vendor — provides this port instead.
 */
export type { SourceAdapterRegistry } from "./booking-engine/registry.js"

export interface CatalogSourcesRuntimeExtension {
  /**
   * Register the un-scoped default adapters synchronously. This is the
   * cold-window fallback that keeps sourced reads and quoting dispatching
   * before {@link warm} completes. A channel with nothing to register, or with
   * incomplete configuration, returns without touching the registry.
   */
  registerFallback(registry: SourceAdapterRegistry, env: Record<string, string | undefined>): void
  /**
   * Enumerate the operator's active connections and register one
   * connection-scoped adapter set per connection, so the live book path
   * resolves by connection id. Must be idempotent; the caller memoizes it and
   * resets on failure so a later request retries.
   */
  warm(registry: SourceAdapterRegistry, env: Record<string, string | undefined>): Promise<void>
  /**
   * The channel's offers client, or null when it is unconfigured. Catalog
   * declares the shape it needs (`CatalogOffersConnectClient`) and the channel
   * constructs it, so the spine never imports a vendor SDK.
   */
  createOffersClient(env: Record<string, string | undefined>): unknown | null
  /** Human labels for destination codes; falls back to the code itself. */
  resolveDestinationNames(
    codes: readonly string[],
    env: Record<string, string | undefined>,
  ): Promise<ReadonlyArray<{ code: string; label: string }>>
}

export interface CatalogRuntimeExtensions {
  accommodations: CatalogAccommodationsRuntimeExtension
  charters: CatalogChartersRuntimeExtension
  commerce: CatalogCommerceRuntimeExtension
  distribution: CatalogDistributionRuntimeExtension
  cruises: CatalogCruisesRuntimeExtension
  inventory: CatalogInventoryRuntimeExtension
  operations: CatalogOperationsRuntimeExtension
  /** Absent when the deployment binds no inventory channel. */
  sources?: CatalogSourcesRuntimeExtension
}

function extensionPort<T extends object>(id: string) {
  return definePort<T>({
    id,
    test(provider) {
      if (provider === null || typeof provider !== "object") {
        throw new Error(`${id} provider must be an object.`)
      }
    },
  })
}

export const catalogSourcesRuntimeExtensionPort = extensionPort<CatalogSourcesRuntimeExtension>(
  "catalog.extension.sources",
)
export const catalogAccommodationsRuntimeExtensionPort =
  extensionPort<CatalogAccommodationsRuntimeExtension>("catalog.extension.accommodations")
export const catalogChartersRuntimeExtensionPort = extensionPort<CatalogChartersRuntimeExtension>(
  "catalog.extension.charters",
)
export const catalogCommerceRuntimeExtensionPort = extensionPort<CatalogCommerceRuntimeExtension>(
  "catalog.extension.commerce",
)
export const catalogDistributionRuntimeExtensionPort =
  extensionPort<CatalogDistributionRuntimeExtension>("catalog.extension.distribution")
export const catalogPublicationRuntimePort = extensionPort<CatalogPublicationRuntime>(
  "catalog.publication.runtime",
)
export const catalogCruisesRuntimeExtensionPort = extensionPort<CatalogCruisesRuntimeExtension>(
  "catalog.extension.cruises",
)
export const catalogInventoryRuntimeExtensionPort = extensionPort<CatalogInventoryRuntimeExtension>(
  "catalog.extension.inventory",
)
export const catalogOperationsRuntimeExtensionPort =
  extensionPort<CatalogOperationsRuntimeExtension>("catalog.extension.operations")
export type CatalogBookingSnapshotRuntimeFactory = (
  bindings: unknown,
) => CatalogBookingSnapshotRuntime

export interface CatalogRuntimeServices {
  readonly defaultSlices: readonly IndexerSlice[]
  ensureSourceRegistry(env: Readonly<Record<string, unknown>>): Promise<SourceAdapterRegistry>
  getSourceRegistryFromContext(context: unknown): SourceAdapterRegistry
  getOwnedHandlers(env: Readonly<Record<string, unknown>>): OwnedBookingHandlerRegistry
  getOwnedHandlersFromContext(context: unknown): OwnedBookingHandlerRegistry
  getOwnedAvailabilitySearchHandlers(): OwnedAvailabilitySearchHandlerRegistry
  registerCompositeBookingSessionHandler?(handler: BookingSessionCompositeHandler): void
  getCompositeBookingSessionHandler?(): BookingSessionCompositeHandler | undefined
  buildEmbeddingProvider(env: Readonly<Record<string, unknown>>): EmbeddingProvider | undefined
  buildIndexer(
    env: Readonly<Record<string, unknown>>,
    embeddings?: EmbeddingProvider,
  ): IndexerAdapter | undefined
  loadSlices(db: AnyDrizzleDb): Promise<IndexerSlice[]>
  fieldPolicyRegistries(): Map<string, FieldPolicyRegistry>
  reindexReferencedSubjectOverlayChange(
    db: AnyDrizzleDb,
    event: EntityOverlayChangedPayload,
    reindex: (target: {
      entityModule: string
      entityId: string
      locale?: string
      audience?: string
      market?: string
    }) => Promise<void>,
  ): Promise<void>
  createProductsDocumentBuilder(
    db: AnyDrizzleDb,
    context: { sellerOperatorId: string },
  ): DocumentBuilder
  createCatalogDocumentBuilder(
    db: AnyDrizzleDb,
    context: { sellerOperatorId: string },
  ): DocumentBuilder
  withEmbedding(inner: DocumentBuilder, embeddings: EmbeddingProvider | undefined): DocumentBuilder
  applyTaxToQuoteResult(
    db: AnyDrizzleDb,
    result: QuoteEntityResult,
    entityModule: string,
    entityId: string,
    sourceKind: string,
  ): Promise<QuoteEntityResult>
}

export const catalogRuntimeServicesPort = definePort<CatalogRuntimeServices>({
  id: "catalog.runtime-services",
  test(provider) {
    if (provider === null || typeof provider !== "object") {
      throw new Error("catalog.runtime-services provider must be an object.")
    }
    for (const method of [
      "ensureSourceRegistry",
      "getSourceRegistryFromContext",
      "getOwnedHandlers",
      "getOwnedHandlersFromContext",
      "getOwnedAvailabilitySearchHandlers",
      "buildEmbeddingProvider",
      "buildIndexer",
      "loadSlices",
      "fieldPolicyRegistries",
      "reindexReferencedSubjectOverlayChange",
      "createProductsDocumentBuilder",
      "createCatalogDocumentBuilder",
      "withEmbedding",
      "applyTaxToQuoteResult",
    ] as const) {
      if (typeof provider[method] !== "function") {
        throw new Error(`catalog.runtime-services provider must implement ${method}().`)
      }
    }
  },
})

let activeCatalogRuntimeServices: CatalogRuntimeServices | undefined

/** Installed only by Catalog's manifest-selected runtime contributor. */
export function installCatalogRuntimeServices(services: CatalogRuntimeServices): void {
  activeCatalogRuntimeServices = services
}

/** Resolve the selected Catalog runtime without importing its implementation. */
export function requireCatalogRuntimeServices(): CatalogRuntimeServices {
  if (!activeCatalogRuntimeServices) {
    throw new Error("Catalog runtime services are not installed")
  }
  return activeCatalogRuntimeServices
}
