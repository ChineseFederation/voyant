import {
  type CatalogCommerceRuntimeExtension,
  type CatalogPublicationRuntime,
  type CatalogRuntimeServices,
  catalogCommerceRuntimeExtensionPort,
  catalogPublicationRuntimePort,
  catalogRuntimeServicesPort,
} from "@voyant-travel/catalog/runtime-contracts"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type { VoyantPort } from "@voyant-travel/core/project"
import {
  type FinanceAccommodationsPaymentPolicyRuntime,
  type FinanceCruisesPaymentPolicyRuntime,
  type FinanceDistributionPaymentPolicyRuntime,
  type FinanceFxRateCaptureRuntime,
  type FinanceInventoryPaymentPolicyRuntime,
  financeAccommodationsPaymentPolicyRuntimePort,
  financeCruisesPaymentPolicyRuntimePort,
  financeDistributionPaymentPolicyRuntimePort,
  financeFxRateCaptureRuntimePort,
  financeInventoryPaymentPolicyRuntimePort,
} from "@voyant-travel/finance/runtime-port"
import { catalogCommerceRuntimeExtension } from "./catalog-runtime-extension.js"
import { quoteAncillaryOffers } from "./checkout/ancillary-offers.js"
import {
  type AncillaryOfferSource,
  type AncillaryQuoteInput,
  ancillaryOfferSourceRuntimePort,
} from "./checkout/ancillary-ports.js"
import {
  bookingMaintenanceRuntimePort,
  catalogCheckoutApiRuntimePort,
  catalogCheckoutDatabaseRuntimePort,
  catalogCheckoutLegalRuntimePort,
} from "./checkout/runtime-ports.js"
import { commerceFxRateCaptureRuntime } from "./markets/fx-capture-runtime.js"
import { promotionBoundaryJobRuntimePort } from "./promotions/boundary-job-runtime-port.js"
import { promotionReindexJobRuntimePort } from "./promotions/reindex-job-runtime-port.js"
import {
  promotionRedemptionDatabaseRuntimePort,
  promotionsBulkReindexRuntimePort,
} from "./promotions/runtime-ports.js"
import { createCommerceRuntime } from "./runtime.js"
import {
  type CommerceCardPaymentRuntime,
  type CommerceInventoryRuntime,
  type CommerceLegalRuntime,
  type CommerceOperatorSettingsRuntime,
  commerceCardPaymentRuntimePort,
  commerceInventoryRuntimePort,
  commerceLegalRuntimePort,
  commerceOperatorSettingsRuntimePort,
} from "./runtime-port.js"

export type CommerceRuntimePortContribution = ReturnType<typeof createCommerceRuntime>

export interface CommerceRuntimeContributorHost {
  primitives: VoyantRuntimeHostPrimitives
  getRuntimePort<T>(port: Pick<VoyantPort<T>, "id">): T | Promise<T>
  /**
   * Many-valued read. Absent on a host that predates one, which reads the same
   * as "nothing bound" — the ancillary step then does not exist.
   */
  getRuntimePorts?<T>(port: Pick<VoyantPort<T>, "id">): readonly T[] | Promise<readonly T[]>
}

/** Register Commerce-owned bindings composed from selected domain providers. */
export function createCommerceRuntimePortContribution(
  host: CommerceRuntimeContributorHost,
): Readonly<Record<string, unknown>> {
  const contribution = Promise.resolve()
    .then(() =>
      Promise.all([
        host.getRuntimePort<CommerceOperatorSettingsRuntime>(commerceOperatorSettingsRuntimePort),
        host.getRuntimePort<CommerceInventoryRuntime>(commerceInventoryRuntimePort),
        host.getRuntimePort<CommerceLegalRuntime>(commerceLegalRuntimePort),
        host.getRuntimePort<CatalogRuntimeServices>(catalogRuntimeServicesPort),
        host.getRuntimePort<CatalogPublicationRuntime>(catalogPublicationRuntimePort),
        host.getRuntimePort<FinanceDistributionPaymentPolicyRuntime>(
          financeDistributionPaymentPolicyRuntimePort,
        ),
        host.getRuntimePort<FinanceAccommodationsPaymentPolicyRuntime>(
          financeAccommodationsPaymentPolicyRuntimePort,
        ),
        host.getRuntimePort<FinanceCruisesPaymentPolicyRuntime>(
          financeCruisesPaymentPolicyRuntimePort,
        ),
        host.getRuntimePort<FinanceInventoryPaymentPolicyRuntime>(
          financeInventoryPaymentPolicyRuntimePort,
        ),
        resolveOptionalPort(host, commerceCardPaymentRuntimePort),
      ]),
    )
    .then(
      ([
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
      ]) =>
        createCommerceRuntime({
          primitives: host.primitives,
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
        }),
    )
  return {
    // `satisfies` rather than a bare literal: the value is handed to a
    // `Record<string, unknown>`, so nothing would otherwise check it against
    // the extension contract — and an un-contextually-typed callback parameter
    // is an implicit `any` that only the build catches.
    [catalogCommerceRuntimeExtensionPort.id]: {
      ...catalogCommerceRuntimeExtension,
      // Bound through the pending contribution rather than resolved here: the
      // extension is a plain object the catalog reads synchronously, and the
      // cascade it publishes is composed from ports that settle later.
      entityPaymentPolicy: {
        resolveListingPolicyForEntity: async (db, context) =>
          (await contribution).entityPaymentPolicy.resolveListingPolicyForEntity(db, context),
        resolveCategoryPolicyForEntity: async (db, context) =>
          (await contribution).entityPaymentPolicy.resolveCategoryPolicyForEntity(db, context),
        resolveSupplierPolicyForEntity: async (db, context) =>
          (await contribution).entityPaymentPolicy.resolveSupplierPolicyForEntity(db, context),
      },
      // The Booking Session descriptor is composed in catalog, and the sources
      // that price a live third-party offer are bound to a commerce port, so
      // this is where the two meet. Resolved per call rather than captured:
      // an operator connecting an insurer should not need a restart to sell
      // through it.
      resolveAncillaryOffers: async (request: AncillaryQuoteInput) =>
        quoteAncillaryOffers(
          (await host.getRuntimePorts?.<AncillaryOfferSource>(ancillaryOfferSourceRuntimePort)) ??
            [],
          request,
        ),
    } satisfies CatalogCommerceRuntimeExtension,
    // Markets owns `fx_rate_sets`/`exchange_rates`, so it is what turns a
    // resolved reference rate into a durable rate-set identity for finance to
    // stamp documents with (voyant#4703).
    [financeFxRateCaptureRuntimePort.id]:
      commerceFxRateCaptureRuntime satisfies FinanceFxRateCaptureRuntime,
    [bookingMaintenanceRuntimePort.id]: contribution.then((runtime) => runtime.bookingMaintenance),
    [catalogCheckoutApiRuntimePort.id]: contribution.then((runtime) => runtime.checkoutApi),
    [catalogCheckoutDatabaseRuntimePort.id]: contribution.then(
      (runtime) => runtime.checkoutDatabase,
    ),
    [catalogCheckoutLegalRuntimePort.id]: contribution.then((runtime) => runtime.checkoutLegal),
    [promotionRedemptionDatabaseRuntimePort.id]: contribution.then(
      (runtime) => runtime.promotionRedemptionDatabase,
    ),
    [promotionsBulkReindexRuntimePort.id]: contribution.then(
      (runtime) => runtime.promotionsBulkReindex,
    ),
    [promotionBoundaryJobRuntimePort.id]: contribution.then((runtime) => ({
      withDb: <T>(operation: (db: import("@voyant-travel/db").AnyDrizzleDb) => Promise<T>) =>
        runtime.promotionRedemptionDatabase.withDb(undefined, operation),
      createReindexService: () => runtime.promotionsBulkReindex.createService(undefined),
    })),
    [promotionReindexJobRuntimePort.id]: contribution.then((runtime) => ({
      withDb: <T>(operation: (db: import("@voyant-travel/db").AnyDrizzleDb) => Promise<T>) =>
        runtime.promotionRedemptionDatabase.withDb(undefined, operation),
      createService: () => runtime.promotionsBulkReindex.createService(undefined),
    })),
  }
}

async function resolveOptionalPort(
  host: CommerceRuntimeContributorHost,
  port: Pick<VoyantPort<CommerceCardPaymentRuntime>, "id">,
): Promise<CommerceCardPaymentRuntime | undefined> {
  try {
    return await host.getRuntimePort(port)
  } catch (error) {
    if (error instanceof Error && error.message.includes("was read before")) return undefined
    throw error
  }
}
