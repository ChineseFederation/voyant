import {
  type CatalogProjectionRuntimeProvider,
  catalogProjectionRuntimePort,
} from "@voyant-travel/catalog/projection-runtime"
import {
  type CatalogPublicationRuntime,
  type CatalogRuntimeServices,
  catalogDistributionRuntimeExtensionPort,
  catalogPublicationRuntimePort,
  catalogRuntimeServicesPort,
} from "@voyant-travel/catalog/runtime-contracts"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type { VoyantPort } from "@voyant-travel/core/project"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import {
  type FinanceDistributionPaymentPolicyRuntime,
  financeDistributionPaymentPolicyRuntimePort,
} from "@voyant-travel/finance/runtime-port"

import { catalogDistributionRuntimeExtension } from "./catalog-runtime-extension.js"
import { channelPushRuntimePort } from "./channel-push/runtime-port.js"
import {
  resolveBookingSupplierPaymentPolicy,
  resolveSupplierPaymentPolicyById,
} from "./payment-policy-runtime.js"
import {
  type DistributionPublicationIntentWorkerDeps,
  distributionPublicationIntentWorkerRuntimePort,
} from "./publication-intent-runtime-port.js"
import { createDistributionRuntime } from "./runtime.js"

export interface DistributionRuntimeContributorHost {
  primitives: VoyantRuntimeHostPrimitives
  getRuntimePort<T>(port: Pick<VoyantPort<T>, "id">): T | Promise<T>
}

/** Provide Distribution's channel-push runtime and cross-domain contracts. */
export function createDistributionRuntimePortContribution(
  host: DistributionRuntimeContributorHost,
): Readonly<Record<string, unknown>> {
  const channelPushRuntime = Promise.resolve()
    .then(() => host.getRuntimePort<CatalogRuntimeServices>(catalogRuntimeServicesPort))
    .then((services) => createDistributionRuntime(host.primitives, services))
  const catalogProjectionRuntime = Promise.resolve().then(() =>
    host.getRuntimePort<CatalogProjectionRuntimeProvider>(catalogProjectionRuntimePort),
  )
  return {
    [channelPushRuntimePort.id]: channelPushRuntime,
    [distributionPublicationIntentWorkerRuntimePort.id]: {
      async withDeps<T>(
        bindings: unknown,
        operation: (deps: DistributionPublicationIntentWorkerDeps) => Promise<T>,
      ) {
        const projectionProvider = await catalogProjectionRuntime
        const projection = await projectionProvider.createRuntime(bindings)
        return operation({
          db: host.primitives.database.resolve<AnyDrizzleDb>(bindings),
          projection,
          report: (message: string, detail?: Record<string, unknown>) =>
            console.info(message, detail ?? {}),
        })
      },
    },
    [catalogDistributionRuntimeExtensionPort.id]: catalogDistributionRuntimeExtension,
    [catalogPublicationRuntimePort.id]: {
      isProductPublished: ({ db, productId, channelId }) =>
        catalogDistributionRuntimeExtension.hasEffectiveProductPublication(
          db,
          productId,
          channelId,
        ),
    } satisfies CatalogPublicationRuntime,
    [financeDistributionPaymentPolicyRuntimePort.id]: {
      resolveSupplierPolicy: resolveBookingSupplierPaymentPolicy,
      resolveSupplierPolicyById: resolveSupplierPaymentPolicyById,
    } satisfies FinanceDistributionPaymentPolicyRuntime,
  }
}
