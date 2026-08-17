import { definePort } from "@voyant-travel/core/project"

import type { PublicCustomerPortalRouteOptions } from "./customer-portal/routes-public.js"
import type { PublicApiOfferResolvers } from "./service.js"
import type { PublicApiIntakePersistence } from "./service-intake.js"

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

export const publicApiOffersRuntimePort = optionsPort<PublicApiOfferResolvers>(
  "public-api.offers.runtime",
)
export const publicApiIntakeRuntimePort = optionsPort<PublicApiIntakePersistence>(
  "public-api.intake.runtime",
)
export const publicApiCustomerPortalRuntimePort = optionsPort<PublicCustomerPortalRouteOptions>(
  "public-api.customer-portal.runtime",
)
