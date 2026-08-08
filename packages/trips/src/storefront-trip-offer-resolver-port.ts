import { definePort } from "@voyant-travel/core/project"
import type {
  StorefrontShoppingContext,
  StorefrontTripSelectionCreate,
} from "@voyant-travel/storefront/shopping"

import type { StorefrontTripScope } from "./storefront-access.js"
import type { CreateTripComponentBodyInput } from "./validation.js"

type StorefrontOfferSelection = StorefrontTripSelectionCreate["offers"][number]

export interface StorefrontTripOfferResolutionInput extends StorefrontOfferSelection {
  scope: StorefrontTripScope
}

/**
 * Closed trust-plane seam from a gateway-issued offerRef to a Trips component.
 * Deployments may resolve only the opaque offerRef plus trusted context/scope;
 * raw entity, connection, source, or provider selectors never cross this port.
 */
export interface StorefrontTripOfferResolver {
  resolve(
    context: StorefrontShoppingContext,
    input: StorefrontTripOfferResolutionInput,
  ): Promise<{ component: CreateTripComponentBodyInput } | null>
}

export const storefrontTripOfferResolverPort = definePort<StorefrontTripOfferResolver>({
  id: "trips.storefront-offer-resolver.runtime",
  test(provider) {
    if (
      provider === null ||
      typeof provider !== "object" ||
      typeof (provider as { resolve?: unknown }).resolve !== "function"
    ) {
      throw new Error("trips.storefront-offer-resolver.runtime provider must implement resolve().")
    }
  },
})
