import { definePort } from "@voyant-travel/core/project"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import type { PublicApiShoppingContext } from "@voyant-travel/public-api/shopping"

import type { PublicApiTripScope } from "./public-api-access.js"
import type { PublicApiTripSelectionCreate } from "./public-api-trip-selections-schemas.js"
import type { CreateTripComponentBodyInput } from "./validation.js"

type PublicApiOfferSelection = PublicApiTripSelectionCreate["offers"][number]

export interface PublicApiTripOfferResolutionInput extends PublicApiOfferSelection {
  scope: PublicApiTripScope
}

/** Sequence is owned by the Trip selection mutation, never by an offer payload. */
export type PublicApiTripOfferComponent = Omit<CreateTripComponentBodyInput, "sequence">

/**
 * Closed trust-plane seam from a gateway-issued offerRef to a Trips component.
 * Deployments may resolve only the opaque offerRef plus trusted context/scope;
 * raw entity, connection, source, or provider selectors never cross this port.
 */
export interface PublicApiTripOfferResolver {
  resolve(
    context: PublicApiShoppingContext,
    input: PublicApiTripOfferResolutionInput,
  ): Promise<{ component: PublicApiTripOfferComponent } | null>
  /** Keep one-time redemption inside the selection mutation transaction. */
  resolveInTransaction?(
    db: AnyDrizzleDb,
    context: PublicApiShoppingContext,
    input: PublicApiTripOfferResolutionInput,
  ): Promise<{ component: PublicApiTripOfferComponent } | null>
}

export const publicApiTripOfferResolverPort = definePort<PublicApiTripOfferResolver>({
  id: "trips.public-offer-resolver.runtime",
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
