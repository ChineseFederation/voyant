import { definePort } from "@voyant-travel/core/project"

import type { CustomerVerificationRoutesOptions } from "./verification/routes-public.js"

/**
 * Options-shaped ports: the provider IS the options object the routes need, so
 * the only invariant worth asserting is that one was supplied.
 */
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

export const customerVerificationRuntimePort = optionsPort<CustomerVerificationRoutesOptions>(
  "identity.verification.runtime",
)
