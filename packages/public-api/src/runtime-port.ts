import { definePort } from "@voyant-travel/core/project"
import type { PaymentAdapter } from "@voyant-travel/payments"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { PublicCustomerPortalRouteOptions } from "./customer-portal/routes-public.js"
import type { PaymentLinkRoutesOptions } from "./payment-link/routes.js"
import type { PublicApiOfferResolvers } from "./service.js"
import type { PublicApiIntakePersistence } from "./service-intake.js"
import type { PublicApiVerificationRoutesOptions } from "./verification/routes-public.js"

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

export const publicApiOffersRuntimePort = optionsPort<PublicApiOfferResolvers>(
  "public-api.offers.runtime",
)
export const publicApiIntakeRuntimePort = optionsPort<PublicApiIntakePersistence>(
  "public-api.intake.runtime",
)
export const publicApiPaymentLinkRuntimePort = optionsPort<PaymentLinkRoutesOptions>(
  "public-api.payment-link.runtime",
)
export const publicApiPaymentReconciliationJobRuntimePort =
  optionsPort<PaymentReconciliationJobRuntime>("public-api.payment-reconciliation-job.runtime")
export const publicApiCustomerPortalRuntimePort = optionsPort<PublicCustomerPortalRouteOptions>(
  "public-api.customer-portal.runtime",
)
export const publicApiVerificationRuntimePort = optionsPort<PublicApiVerificationRoutesOptions>(
  "public-api.verification.runtime",
)
