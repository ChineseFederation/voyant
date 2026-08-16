/**
 * The seam an insurer adapter binds.
 *
 * Deliberately the cheapest file in the package: an adapter package (the
 * Connect adapter is the first, voyant#4732) imports this module to declare
 * `providePort(insuranceProviderSourcePort)` and must not drag the insurance
 * runtime — schema, services, routes, Drizzle, Hono — into its import closure
 * to do it. So this file imports exactly one type and one function from
 * `insurance-contracts`, and nothing from anywhere else in this package.
 *
 * Mirrors `packages/storefront/src/shopping/provider-ports.ts`.
 */

import { definePort } from "@voyant-travel/core/project"
import type { InsuranceProviderAdapter } from "@voyant-travel/insurance-contracts/provider"

export type {
  InsuranceProviderAdapter,
  InsuranceProviderContext,
} from "@voyant-travel/insurance-contracts/provider"

/**
 * The same structural check `assertInsuranceProviderAdapter` performs, written
 * out here rather than imported.
 *
 * The module manifest reaches this file to declare the port, and
 * `verify:deployment-graph-import-cheap` allows a manifest's import closure to
 * carry only authoring helpers and port contracts — resolving the graph must
 * not drag a package's runtime in behind it. A *type* import is erased and
 * costs nothing; importing the helper as a value would pull
 * `insurance-contracts` into every graph resolution.
 *
 * `provider-adapter-parity.test.ts` asserts this and the contracts helper
 * reject exactly the same providers, so the duplication cannot drift.
 */
const REQUIRED_PROVIDER_METHODS = ["quote", "apply", "issue", "document", "cancel"] as const

/**
 * Bound `cardinality: "many"`, `optional: true`, and read with `getPorts`.
 *
 * An operator may have no insurer connected at all — the ancillary step simply
 * does not appear — or several, in which case the traveller sees a list. The
 * count is presentation's business and nothing else's, which is why the port is
 * many-valued from the start rather than promoted to one later.
 */
export const insuranceProviderSourcePort = definePort<InsuranceProviderAdapter>({
  id: "insurance.provider-source",
  test(provider) {
    if (provider === null || typeof provider !== "object") {
      throw new Error("insurance provider must be an object")
    }
    // Through `unknown`: an interface has no index signature, so it does not
    // overlap `Record<string, unknown>` directly. The point of the check is that
    // whatever the graph bound may not be the declared type at all.
    const candidate = provider as unknown as Record<string, unknown>
    for (const field of ["providerId", "displayName"] as const) {
      const value = candidate[field]
      if (typeof value !== "string" || value.length === 0) {
        throw new Error(`insurance provider must expose a non-empty ${field}`)
      }
    }
    for (const method of REQUIRED_PROVIDER_METHODS) {
      if (typeof candidate[method] !== "function") {
        throw new Error(`insurance provider must implement ${method}()`)
      }
    }
  },
})
