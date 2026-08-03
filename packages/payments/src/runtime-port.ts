/**
 * Managed payment registry runtime port.
 *
 * A deployment provides a `PaymentProviderRegistryResolver` under this port to
 * broker Settings → Payments to a managed control plane. The operator-settings
 * routes resolve it from the runtime container per request (else the default
 * self-host registry). The routes own the single API surface; the deployment
 * supplies the implementation — the Option A seam from
 * `docs/adr/0015-payment-adapter-transports-and-managed-connect.md`.
 */

import { definePort } from "@voyant-travel/graph-contracts"

import type { PaymentProviderRegistry } from "./provider-catalog.js"

/**
 * Per-request context a resolver may use to build a registry. `db` is kept
 * loosely typed (a `PostgresJsDatabase` at runtime) so this contract package
 * stays free of a Drizzle dependency.
 */
export interface PaymentProviderRegistryContext {
  db: unknown
  env: Readonly<Record<string, unknown>>
  /** The raw request — a managed resolver uses it to resolve the acting user. */
  request: Request
}

/** Deployment-provided factory producing a request-scoped registry. */
export type PaymentProviderRegistryResolver = (
  context: PaymentProviderRegistryContext,
) => PaymentProviderRegistry | Promise<PaymentProviderRegistry>

export const PAYMENT_PROVIDER_REGISTRY_RUNTIME_PORT_ID =
  "payments.provider-registry-resolver" as const

export const paymentProviderRegistryRuntimePort = definePort<PaymentProviderRegistryResolver>({
  id: PAYMENT_PROVIDER_REGISTRY_RUNTIME_PORT_ID,
  test(resolver) {
    if (typeof resolver !== "function") {
      throw new Error("Payment provider registry resolver must be a function.")
    }
  },
})
