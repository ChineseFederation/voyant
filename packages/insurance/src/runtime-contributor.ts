/**
 * What this package contributes to the composed runtime.
 *
 * Two ports, and the interesting one is the first. `commerce.ancillary-offer-source`
 * is where the cardinality changes: commerce reads one source, and the source
 * it gets here fans out across however many insurers the graph bound. So the
 * insurer set is resolved lazily, per call, from `insurance.provider-source` —
 * not captured at composition time, because an operator connecting an insurer
 * should not need a restart to sell through it.
 *
 * Everything else this module needs from the deployment (the KMS provider, the
 * booking-document recorder, the notifier, the staff-alert raiser) arrives
 * through `insurance.runtime`, which the deployment provides.
 */

import { ancillaryOfferSourceRuntimePort } from "@voyant-travel/commerce/checkout/ancillary-ports"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type { InsuranceProviderAdapter } from "@voyant-travel/insurance-contracts/provider"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { createInsuranceAncillaryOfferSource } from "./ancillary-source.js"
import { createInsuranceCustomerPortalReader } from "./customer-portal-runtime.js"
import { insuranceProviderSourcePort } from "./provider-ports.js"
import {
  type InsuranceRuntime,
  insuranceCustomerPortalPort,
  insuranceRuntimePort,
} from "./runtime-port.js"

export interface InsuranceRuntimeContributorHost {
  primitives: VoyantRuntimeHostPrimitives
  getRuntimePort<T>(port: { id: string }): T | Promise<T>
  getRuntimePorts?<T>(port: { id: string }): readonly T[] | Promise<readonly T[]>
}

export function createInsuranceRuntimePortContribution(
  host: InsuranceRuntimeContributorHost,
): Readonly<Record<string, unknown>> {
  const resolveRuntime = async (): Promise<InsuranceRuntime> =>
    host.getRuntimePort<InsuranceRuntime>(insuranceRuntimePort)

  return {
    [ancillaryOfferSourceRuntimePort.id]: createInsuranceAncillaryOfferSource({
      // Zero bound insurers is a supported, silent state: `getPorts` on an
      // unbound optional many-valued port is an empty list, and the source
      // returns an empty group rather than failing the checkout step.
      resolveProviders: async () =>
        (await host.getRuntimePorts?.<InsuranceProviderAdapter>(insuranceProviderSourcePort)) ?? [],
      resolveDb: () => host.primitives.database.resolve<PostgresJsDatabase>(undefined),
      resolvePii: async () => (await resolveRuntime()).createPiiService(),
      resolveIntegration: async () => (await resolveRuntime()).bookingIntegration(),
      resolveEventBus: async () => (await resolveRuntime()).eventBus?.(),
    }),
    [insuranceCustomerPortalPort.id]: createInsuranceCustomerPortalReader(),
  }
}
