import type {
  PublicApiShoppingContext,
  PublicApiShoppingRuntime,
  PublicApiTripSelectionsRuntime,
} from "./runtime-port.js"
import {
  type PublicApiShoppingResult,
  type PublicApiTripBooking,
  type PublicApiTripSelection,
  publicApiResolvedScopeSchema,
  publicApiShoppingRequestSchema,
  publicApiShoppingResultSchema,
  publicApiTripBookingCreateSchema,
  publicApiTripBookingSchema,
  publicApiTripSelectionCreateSchema,
  publicApiTripSelectionSchema,
  publicApiTripSelectionUpdateSchema,
} from "./schemas.js"

export class PublicApiShoppingUnavailableError extends Error {
  readonly code = "storefront_shopping_unavailable"

  constructor(
    capability:
      | "shopping"
      | "trip-selections"
      | "active channel"
      | "trusted channel context"
      | "active market scope"
      | "active live-shopping scope"
      | "catalog field policy"
      | "catalog indexer"
      | "customer catalog title"
      | `customer catalog field policy for ${string}`,
  ) {
    super(`Storefront ${capability} runtime is not configured.`)
    this.name = "PublicApiShoppingUnavailableError"
  }
}

/** Provider-neutral compare-and-swap failure surfaced by Trip-selection runtimes. */
export class PublicApiTripSelectionRevisionConflictError extends Error {
  readonly code = "trip_selection_revision_conflict"

  constructor() {
    super("Trip selection changed after it was read.")
    this.name = "PublicApiTripSelectionRevisionConflictError"
  }
}

export interface PublicApiShoppingGateway {
  search(context: PublicApiShoppingContext, request: unknown): Promise<PublicApiShoppingResult>
  createTripSelection(
    context: PublicApiShoppingContext,
    request: unknown,
  ): Promise<PublicApiTripSelection>
  updateTripSelection(
    context: PublicApiShoppingContext,
    request: unknown,
  ): Promise<PublicApiTripSelection>
  bookTripSelection(
    context: PublicApiShoppingContext,
    request: unknown,
  ): Promise<PublicApiTripBooking>
}

/**
 * Strict validation boundary in front of deployment-provided implementations.
 * Optional ports keep existing deployments bootable; calls fail explicitly
 * until the corresponding managed or self-hosted provider is installed.
 */
export function createPublicApiShoppingGateway(options: {
  shopping?: PublicApiShoppingRuntime
  tripSelections?: PublicApiTripSelectionsRuntime
}): PublicApiShoppingGateway {
  return {
    async search(context, rawRequest) {
      const shopping = options.shopping
      if (!shopping) throw new PublicApiShoppingUnavailableError("shopping")
      const request = publicApiShoppingRequestSchema.parse(rawRequest)
      const scope = publicApiResolvedScopeSchema.parse(
        await shopping.resolveScope(context, request.scope),
      )
      const result = publicApiShoppingResultSchema.parse(
        await shopping.search(context, { scope, intent: request.intent }),
      )
      assertSameResolvedScope(scope, result.scope)
      if (result.kind !== request.intent.kind) {
        throw new Error(
          `Storefront shopping runtime returned ${result.kind} for ${request.intent.kind} intent.`,
        )
      }
      return result
    },

    async createTripSelection(context, rawRequest) {
      const shopping = options.shopping
      if (!shopping) throw new PublicApiShoppingUnavailableError("shopping")
      const tripSelections = options.tripSelections
      if (!tripSelections) throw new PublicApiShoppingUnavailableError("trip-selections")
      const request = publicApiTripSelectionCreateSchema.parse(rawRequest)
      const scope = publicApiResolvedScopeSchema.parse(
        await shopping.resolveScope(context, request.scope),
      )
      const result = publicApiTripSelectionSchema.parse(
        await tripSelections.create(context, { scope, offers: request.offers }),
      )
      assertSameResolvedScope(scope, result.scope)
      return result
    },

    async updateTripSelection(context, rawRequest) {
      const tripSelections = options.tripSelections
      if (!tripSelections) throw new PublicApiShoppingUnavailableError("trip-selections")
      const request = publicApiTripSelectionUpdateSchema.parse(rawRequest)
      return publicApiTripSelectionSchema.parse(await tripSelections.update(context, request))
    },

    async bookTripSelection(context, rawRequest) {
      const tripSelections = options.tripSelections
      if (!tripSelections) throw new PublicApiShoppingUnavailableError("trip-selections")
      const request = publicApiTripBookingCreateSchema.parse(rawRequest)
      return publicApiTripBookingSchema.parse(await tripSelections.book(context, request))
    },
  }
}

function assertSameResolvedScope(
  expected: { marketId: string; locale: string; currency: string },
  actual: { marketId: string; locale: string; currency: string },
): void {
  if (
    expected.marketId !== actual.marketId ||
    expected.locale !== actual.locale ||
    expected.currency !== actual.currency
  ) {
    throw new Error("Storefront runtime returned a result outside the resolved shopping scope.")
  }
}
