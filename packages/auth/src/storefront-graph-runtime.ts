import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"

import { customerBusinessAccountOnboardingRuntimePort } from "./customer-business-onboarding-runtime-port.js"
import { createLinkServiceStorefrontChannelBindingProvider } from "./storefront-channel-binding-provider.js"
import { createStorefrontAdminRoutes } from "./storefront-routes.js"
import { storefrontRuntimePort } from "./storefront-runtime-port.js"

/**
 * Selected-graph runtime for the storefront admin surface. The business
 * buyer-account capability is derived from whether the deployment also wires
 * the customer business-account onboarding runtime, so the admin UI can gate
 * the org-account controls on a real runtime signal rather than a static flag.
 */
export const createStorefrontVoyantRuntime = defineGraphRuntimeFactory(
  async ({ getPort, hasPort }) => ({
    module: { name: "storefronts" },
    adminRoutes: createStorefrontAdminRoutes(await getPort(storefrontRuntimePort), {
      businessAccounts: hasPort(customerBusinessAccountOnboardingRuntimePort),
      channelBinding: createLinkServiceStorefrontChannelBindingProvider(),
    }),
  }),
)
