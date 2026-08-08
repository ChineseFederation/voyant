import type {
  StorefrontShoppingContext,
  StorefrontShoppingRuntime,
  StorefrontTripSelectionsRuntime,
} from "./runtime-port.js"
import {
  type StorefrontShoppingResult,
  type StorefrontTripSelection,
  storefrontResolvedScopeSchema,
  storefrontShoppingRequestSchema,
  storefrontShoppingResultSchema,
  storefrontTripSelectionCreateSchema,
  storefrontTripSelectionSchema,
  storefrontTripSelectionUpdateSchema,
} from "./schemas.js"

export class StorefrontShoppingUnavailableError extends Error {
  readonly code = "storefront_shopping_unavailable"

  constructor(
    capability:
      | "shopping"
      | "trip-selections"
      | "active storefront channel"
      | "trusted storefront channel context"
      | "active market scope"
      | "catalog field policy"
      | "catalog indexer"
      | "customer catalog title"
      | `customer catalog field policy for ${string}`,
  ) {
    super(`Storefront ${capability} runtime is not configured.`)
    this.name = "StorefrontShoppingUnavailableError"
  }
}

/** Provider-neutral compare-and-swap failure surfaced by Trip-selection runtimes. */
export class StorefrontTripSelectionRevisionConflictError extends Error {
  readonly code = "trip_selection_revision_conflict"

  constructor() {
    super("Trip selection changed after it was read.")
    this.name = "StorefrontTripSelectionRevisionConflictError"
  }
}

export interface StorefrontShoppingGateway {
  search(context: StorefrontShoppingContext, request: unknown): Promise<StorefrontShoppingResult>
  createTripSelection(
    context: StorefrontShoppingContext,
    request: unknown,
  ): Promise<StorefrontTripSelection>
  updateTripSelection(
    context: StorefrontShoppingContext,
    request: unknown,
  ): Promise<StorefrontTripSelection>
}

/**
 * Strict validation boundary in front of deployment-provided implementations.
 * Optional ports keep existing deployments bootable; calls fail explicitly
 * until the corresponding managed or self-hosted provider is installed.
 */
export function createStorefrontShoppingGateway(options: {
  shopping?: StorefrontShoppingRuntime
  tripSelections?: StorefrontTripSelectionsRuntime
}): StorefrontShoppingGateway {
  return {
    async search(context, rawRequest) {
      const shopping = options.shopping
      if (!shopping) throw new StorefrontShoppingUnavailableError("shopping")
      const request = storefrontShoppingRequestSchema.parse(rawRequest)
      const scope = storefrontResolvedScopeSchema.parse(
        await shopping.resolveScope(context, request.scope),
      )
      const result = storefrontShoppingResultSchema.parse(
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
      if (!shopping) throw new StorefrontShoppingUnavailableError("shopping")
      const tripSelections = options.tripSelections
      if (!tripSelections) throw new StorefrontShoppingUnavailableError("trip-selections")
      const request = storefrontTripSelectionCreateSchema.parse(rawRequest)
      const scope = storefrontResolvedScopeSchema.parse(
        await shopping.resolveScope(context, request.scope),
      )
      const result = storefrontTripSelectionSchema.parse(
        await tripSelections.create(context, { scope, offers: request.offers }),
      )
      assertSameResolvedScope(scope, result.scope)
      return result
    },

    async updateTripSelection(context, rawRequest) {
      const tripSelections = options.tripSelections
      if (!tripSelections) throw new StorefrontShoppingUnavailableError("trip-selections")
      const request = storefrontTripSelectionUpdateSchema.parse(rawRequest)
      return storefrontTripSelectionSchema.parse(await tripSelections.update(context, request))
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
