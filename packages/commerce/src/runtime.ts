import { createIndexerService } from "@voyant-travel/catalog"
import type {
  CatalogEntityPaymentPolicyReaders,
  CatalogPublicationRuntime,
  CatalogRuntimeServices,
} from "@voyant-travel/catalog/runtime-contracts"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { noDepositPolicy, resolveEffectivePaymentPolicy } from "@voyant-travel/finance"
import type {
  FinanceAccommodationsPaymentPolicyRuntime,
  FinanceCruisesPaymentPolicyRuntime,
  FinanceDistributionPaymentPolicyRuntime,
  FinanceInventoryPaymentPolicyRuntime,
} from "@voyant-travel/finance/runtime-port"
import type { ApiModule } from "@voyant-travel/hono/module"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import type { BookingMaintenanceRoutesOptions } from "./checkout/routes.js"
import type {
  CatalogCheckoutApiRuntime,
  CatalogCheckoutDatabaseRuntime,
} from "./checkout/runtime-ports.js"
import { marketsApiModule } from "./markets/index.js"
import { pricingApiModule } from "./pricing/index.js"
import {
  createPromotionsApiModule,
  type PromotionsRoutesOptions,
  promotionsApiModule,
} from "./promotions/index.js"
import type {
  PromotionRedemptionDatabaseRuntime,
  PromotionsBulkReindexRuntime,
} from "./promotions/runtime-ports.js"
import { createPromotionsPublicApiResolvers } from "./promotions/service-public-api.js"
import type {
  CommerceCardPaymentRuntime,
  CommerceInventoryRuntime,
  CommerceLegalRuntime,
  CommerceOperatorSettingsRuntime,
} from "./runtime-port.js"
import {
  createSellabilityApiModule,
  type SellabilityRoutesOptions,
  sellabilityApiModule,
} from "./sellability/index.js"

export const commerceRuntimeModuleNames = [
  "pricing",
  "markets",
  "sellability",
  "promotions",
] as const

export type CommerceRuntimeModuleName = (typeof commerceRuntimeModuleNames)[number]

export interface CommerceApiModulesOptions {
  promotions?: PromotionsRoutesOptions
  sellability?: SellabilityRoutesOptions
}

/** Build the HTTP modules represented by the consolidated Commerce manifest. */
export function createCommerceApiModules(options: CommerceApiModulesOptions = {}): ApiModule[] {
  return [
    pricingApiModule,
    marketsApiModule,
    options.sellability ? createSellabilityApiModule(options.sellability) : sellabilityApiModule,
    options.promotions ? createPromotionsApiModule(options.promotions) : promotionsApiModule,
  ]
}

export const createCommercePublicApiOfferResolvers = createPromotionsPublicApiResolvers

interface CommerceRuntimeRequirements {
  primitives: VoyantRuntimeHostPrimitives
  settings: CommerceOperatorSettingsRuntime
  inventory: CommerceInventoryRuntime
  legal: CommerceLegalRuntime
  catalog: CatalogRuntimeServices
  publication: CatalogPublicationRuntime
  distribution: FinanceDistributionPaymentPolicyRuntime
  accommodations: FinanceAccommodationsPaymentPolicyRuntime
  cruises: FinanceCruisesPaymentPolicyRuntime
  inventoryPolicy: FinanceInventoryPaymentPolicyRuntime
  cardPayment?: CommerceCardPaymentRuntime
}

export interface CommerceRuntime {
  bookingMaintenance: BookingMaintenanceRoutesOptions
  checkoutApi: CatalogCheckoutApiRuntime
  checkoutDatabase: CatalogCheckoutDatabaseRuntime
  checkoutLegal: CommerceLegalRuntime
  promotionRedemptionDatabase: PromotionRedemptionDatabaseRuntime
  promotionsBulkReindex: PromotionsBulkReindexRuntime
  /**
   * The entity-keyed half of the composed payment-policy cascade, published so
   * the Booking Session checkout can resolve a policy for a target that has no
   * booking row yet. Commerce already composes the vertical readers for its own
   * accepted-policy resolution; re-composing them next to the Session would put
   * the preview a shopper saw and the terms they are charged on two code paths.
   */
  entityPaymentPolicy: CatalogEntityPaymentPolicyReaders
}

/** Compose Commerce from generic host primitives and selected domain providers. */
export function createCommerceRuntime(requirements: CommerceRuntimeRequirements): CommerceRuntime {
  const {
    primitives,
    settings,
    inventory,
    legal,
    catalog,
    publication,
    distribution,
    accommodations,
    cruises,
    inventoryPolicy,
    cardPayment,
  } = requirements
  const paymentPolicy = inventoryPolicy.createPaymentPolicyRuntime({
    resolveSupplierPolicy: distribution.resolveSupplierPolicy,
    resolveSupplierPolicyById: distribution.resolveSupplierPolicyById,
    resolveVerticalListingPolicy: async (db, bookingId) =>
      (await cruises.resolveBookingPolicy(db, bookingId)) ??
      accommodations.resolveBookingPolicy(db, bookingId),
    resolveVerticalListingPolicyForEntity: async (db, context) =>
      (await cruises.resolveEntityPolicy(db, context)) ??
      accommodations.resolveEntityPolicy(db, context),
    resolveVerticalSupplierPolicyForEntity: async (db, context) => {
      const supplierId = await cruises.resolveSupplierId(db, context)
      return supplierId ? distribution.resolveSupplierPolicyById(db, supplierId) : null
    },
  })

  return {
    entityPaymentPolicy: {
      resolveListingPolicyForEntity: (db, context) =>
        paymentPolicy.resolveListingPolicyForEntity(db as PostgresJsDatabase, context),
      resolveCategoryPolicyForEntity: (db, context) =>
        paymentPolicy.resolveCategoryPolicyForEntity(db as PostgresJsDatabase, context),
      resolveSupplierPolicyForEntity: (db, context) =>
        paymentPolicy.resolveSupplierPolicyForEntity(db as PostgresJsDatabase, context),
    },
    bookingMaintenance: {
      resolveDb: (context) => primitives.database.fromContext<PostgresJsDatabase>(context),
      resolveBookingTaxSettings: settings.resolveBookingTaxSettings,
    },
    checkoutApi: (context: Context) => ({
      resolveBookingTaxSettings: settings.resolveBookingTaxSettings,
      getOwnedProductName: inventory.getOwnedProductName,
      resolveBankTransferInstructions: settings.resolveBankTransferInstructions,
      resolveAcceptedPaymentPolicy: async ({ db, booking }) => {
        const [operatorDefault, supplierPolicy, categoryPolicy, listingPolicy] = await Promise.all([
          settings.resolveOperatorDefaultPaymentPolicy(db),
          paymentPolicy.resolveSupplierPolicy(db, booking.id),
          paymentPolicy.resolveCategoryPolicy(db, booking.id),
          paymentPolicy.resolveListingPolicy(db, booking.id),
        ])
        return resolveEffectivePaymentPolicy({
          bookingPolicy: booking.customerPaymentPolicy,
          listingPolicy,
          categoryPolicy,
          supplierPolicy,
          operatorDefault: operatorDefault ?? noDepositPolicy,
        })
      },
      persistAcceptanceDraftContract: (db, input) =>
        legal.persistAcceptanceDraftContract(db, input),
      startCardPayment: cardPayment?.createStartCardPayment(context),
      publication: {
        isProductPublished: ({ db, productId, channelId }) =>
          publication.isProductPublished({ db, productId, channelId }),
      },
    }),
    checkoutDatabase: {
      withDb: <T>(bindings: unknown, operation: (db: PostgresJsDatabase) => Promise<T>) =>
        primitives.database.transaction(bindings, (database) =>
          operation(database as PostgresJsDatabase),
        ),
    },
    checkoutLegal: legal,
    promotionRedemptionDatabase: {
      withDb: <T>(bindings: unknown, operation: (db: AnyDrizzleDb) => Promise<T>) =>
        primitives.database.transaction(bindings, (database) =>
          operation(database as AnyDrizzleDb),
        ),
    },
    promotionsBulkReindex: {
      createService: (bindings) => {
        const env = primitives.env(bindings)
        const sellerOperatorId = stringValue(env.TENANT_ID) ?? "default"
        return {
          listAllProductIds: () =>
            primitives.database.transaction(bindings, (database) =>
              inventory.listAllProductIds(database as PostgresJsDatabase),
            ),
          async reindexProduct(productId) {
            const embeddings = catalog.buildEmbeddingProvider(env)
            const adapter = catalog.buildIndexer(env, embeddings)
            if (!adapter) return
            await primitives.database.transaction(bindings, async (database) => {
              const db = database as AnyDrizzleDb
              const service = createIndexerService({
                adapter,
                slices: await catalog.loadSlices(db),
                registries: catalog.fieldPolicyRegistries(),
              })
              const builder = catalog.withEmbedding(
                catalog.createProductsDocumentBuilder(db, { sellerOperatorId }),
                embeddings,
              )
              await service.ensureCollections()
              await service.reindexEntity("products", productId, builder)
            })
          },
        }
      },
    },
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}
