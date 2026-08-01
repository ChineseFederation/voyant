import {
  type CatalogRuntimeServices,
  catalogCommerceRuntimeExtensionPort,
  catalogRuntimeServicesPort,
} from "@voyant-travel/catalog/runtime-contracts"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type { VoyantPort } from "@voyant-travel/core/project"
import {
  type FinanceAccommodationsPaymentPolicyRuntime,
  type FinanceCruisesPaymentPolicyRuntime,
  type FinanceDistributionPaymentPolicyRuntime,
  type FinanceInventoryPaymentPolicyRuntime,
  financeAccommodationsPaymentPolicyRuntimePort,
  financeCruisesPaymentPolicyRuntimePort,
  financeDistributionPaymentPolicyRuntimePort,
  financeInventoryPaymentPolicyRuntimePort,
} from "@voyant-travel/finance/runtime-port"
import {
  type CheckoutInquiryRuntime,
  checkoutInquiryRuntimePort,
} from "@voyant-travel/proposals-contracts/checkout-inquiry"
import { catalogCommerceRuntimeExtension } from "./catalog-runtime-extension.js"
import {
  bookingMaintenanceRuntimePort,
  catalogCheckoutApiRuntimePort,
  catalogCheckoutDatabaseRuntimePort,
  catalogCheckoutLegalRuntimePort,
} from "./checkout/runtime-ports.js"
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
        host.getRuntimePort<CheckoutInquiryRuntime>(checkoutInquiryRuntimePort),
        resolveOptionalPort(host, commerceCardPaymentRuntimePort),
      ]),
    )
    .then(
      ([
        settings,
        inventory,
        legal,
        catalog,
        distribution,
        accommodations,
        cruises,
        inventoryPolicy,
        checkoutInquiry,
        cardPayment,
      ]) =>
        createCommerceRuntime({
          primitives: host.primitives,
          settings,
          inventory,
          legal,
          catalog,
          distribution,
          accommodations,
          cruises,
          inventoryPolicy,
          checkoutInquiry,
          cardPayment,
        }),
    )
  return {
    [catalogCommerceRuntimeExtensionPort.id]: catalogCommerceRuntimeExtension,
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
