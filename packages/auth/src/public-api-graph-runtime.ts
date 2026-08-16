import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"

import { customerBusinessAccountOnboardingRuntimePort } from "./customer-business-onboarding-runtime-port.js"
import { createPublicApiChannelProvider } from "./public-api-channel-provider.js"
import {
  createCustomerAccountsAdminRoutes,
  createPublicApiAdminRoutes,
} from "./public-api-routes.js"
import { publicApiRuntimePort } from "./public-api-runtime-port.js"

/** Selected-graph runtime for the Public API admin surface (keys and origins). */
export const createPublicApiVoyantRuntime = defineGraphRuntimeFactory(async ({ getPort }) => ({
  module: { name: "public-api" },
  adminRoutes: createPublicApiAdminRoutes(await getPort(publicApiRuntimePort), {
    channels: createPublicApiChannelProvider(),
  }),
}))

/**
 * Selected-graph runtime for the Customer accounts admin surface.
 *
 * The business buyer-account capability is derived from whether the deployment
 * also wires the customer business-account onboarding runtime, so the admin UI
 * can gate the org-account controls on a real runtime signal rather than a
 * static flag.
 */
export const createCustomerAccountsVoyantRuntime = defineGraphRuntimeFactory(
  async ({ getPort, hasPort }) => ({
    module: { name: "customer-accounts" },
    adminRoutes: createCustomerAccountsAdminRoutes(await getPort(publicApiRuntimePort), {
      businessAccounts: hasPort(customerBusinessAccountOnboardingRuntimePort),
    }),
  }),
)
