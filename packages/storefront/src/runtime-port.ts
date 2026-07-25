import { definePort } from "@voyant-travel/core/project"
import type { PaymentAdapter } from "@voyant-travel/payments"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { PublicCustomerPortalRouteOptions } from "./customer-portal/routes-public.js"
import type { PaymentLinkRoutesOptions } from "./payment-link/routes.js"
import type { StorefrontOfferResolvers } from "./service.js"
import type { StorefrontIntakePersistence } from "./service-intake.js"
import type { StorefrontVerificationRoutesOptions } from "./verification/routes-public.js"

function optionsPort<T extends object>(id: string) {
  return definePort<T>({
    id,
    test(provider) {
      if (provider === null || typeof provider !== "object") {
        throw new Error(`${id} provider must be an options object.`)
      }
    },
  })
}

export interface PaymentReconciliationJobRuntime {
  resolveDb(bindings: unknown): PostgresJsDatabase | Promise<PostgresJsDatabase>
  resolveAdapter(): PaymentAdapter | null | Promise<PaymentAdapter | null>
  resolveEnv(bindings: unknown): Readonly<Record<string, unknown>>
  warn?(message: string, detail?: unknown): void
}

export const storefrontOffersRuntimePort = optionsPort<StorefrontOfferResolvers>(
  "storefront.offers.runtime",
)
export const storefrontIntakeRuntimePort = optionsPort<StorefrontIntakePersistence>(
  "storefront.intake.runtime",
)
export const storefrontPaymentLinkRuntimePort = optionsPort<PaymentLinkRoutesOptions>(
  "storefront.payment-link.runtime",
)
export const storefrontPaymentReconciliationJobRuntimePort =
  optionsPort<PaymentReconciliationJobRuntime>("storefront.payment-reconciliation-job.runtime")
export const storefrontCustomerPortalRuntimePort = optionsPort<PublicCustomerPortalRouteOptions>(
  "storefront.customer-portal.runtime",
)
export const storefrontVerificationRuntimePort = optionsPort<StorefrontVerificationRoutesOptions>(
  "storefront.verification.runtime",
)
