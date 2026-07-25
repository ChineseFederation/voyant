import { customerBusinessAccountOnboardingRuntimePort } from "@voyant-travel/auth/customer-business-onboarding-runtime-port"
import { createCommerceStorefrontOfferResolvers } from "@voyant-travel/commerce"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import { createStorefrontCustomerBusinessOnboardingRuntime } from "./customer-business-onboarding-runtime.js"
import { storefrontCustomerPortalRuntimePort, storefrontOffersRuntimePort } from "./runtime-port.js"

export interface StorefrontRuntimeContributorHost {
  primitives: VoyantRuntimeHostPrimitives
  hasRuntimePort?(port: { id: string }): boolean
}

/** Storefront-owned adapters derived exclusively from generic Node primitives. */
export function createStorefrontRuntimePortContribution(
  host: StorefrontRuntimeContributorHost,
): Readonly<Record<string, unknown>> {
  return {
    [storefrontOffersRuntimePort.id]: createCommerceStorefrontOfferResolvers(),
    [storefrontCustomerPortalRuntimePort.id]: {
      resolveDocumentDownloadUrl: host.primitives.storage.downloadUrl,
    },
    ...(host.hasRuntimePort?.(customerBusinessAccountOnboardingRuntimePort)
      ? {}
      : {
          [customerBusinessAccountOnboardingRuntimePort.id]:
            createStorefrontCustomerBusinessOnboardingRuntime(),
        }),
  }
}
