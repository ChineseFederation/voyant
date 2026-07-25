import { definePort } from "@voyant-travel/core/project"

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

export const storefrontOffersRuntimePort = optionsPort<StorefrontOfferResolvers>(
  "storefront.offers.runtime",
)
export const storefrontIntakeRuntimePort = optionsPort<StorefrontIntakePersistence>(
  "storefront.intake.runtime",
)
export const storefrontPaymentLinkRuntimePort = optionsPort<PaymentLinkRoutesOptions>(
  "storefront.payment-link.runtime",
)
export const storefrontCustomerPortalRuntimePort = optionsPort<PublicCustomerPortalRouteOptions>(
  "storefront.customer-portal.runtime",
)
export const storefrontVerificationRuntimePort = optionsPort<StorefrontVerificationRoutesOptions>(
  "storefront.verification.runtime",
)
