/**
 * Strict validation boundary in front of the Trip-selection runtime.
 *
 * Moved here with the routes (voyant#4627). It parses on the way in and on the
 * way out, so a deployment-provided runtime cannot widen the published contract
 * by returning something the schema does not describe.
 *
 * The one thing it still needs from the shopping layer is `resolveScope`: the
 * browser sends a *requested* scope and a selection is only meaningful inside
 * the resolved one. That arrives as a bare function rather than the whole
 * `PublicApiShoppingRuntime`, so this module depends on the single capability
 * it uses instead of the interface that happens to carry it.
 */
import type {
  PublicApiRequestedScope,
  PublicApiResolvedScope,
  PublicApiShoppingContext,
} from "@voyant-travel/public-api/shopping"

import {
  type PublicApiTripBooking,
  type PublicApiTripBookingCreate,
  type PublicApiTripSelection,
  type PublicApiTripSelectionCreate,
  type PublicApiTripSelectionUpdate,
  publicApiTripBookingCreateSchema,
  publicApiTripBookingSchema,
  publicApiTripSelectionCreateSchema,
  publicApiTripSelectionSchema,
  publicApiTripSelectionUpdateSchema,
} from "./public-api-trip-selections-schemas.js"

/** Which capability was missing, so the route can answer 503 rather than 500. */
export class PublicApiTripSelectionsUnavailableError extends Error {
  readonly code = "storefront_shopping_unavailable"

  constructor(capability: "shopping" | "trip-selections") {
    super(`Storefront ${capability} runtime is not configured.`)
    this.name = "PublicApiTripSelectionsUnavailableError"
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

/** The single shopping capability a Trip selection needs. */
export type PublicApiResolveShoppingScope = (
  context: PublicApiShoppingContext,
  requested: PublicApiRequestedScope,
) => Promise<PublicApiResolvedScope>

export interface PublicApiTripSelectionsRuntime {
  create(
    context: PublicApiShoppingContext,
    input: { scope: PublicApiResolvedScope; offers: PublicApiTripSelectionCreate["offers"] },
  ): Promise<PublicApiTripSelection>
  update(
    context: PublicApiShoppingContext,
    input: PublicApiTripSelectionUpdate,
  ): Promise<PublicApiTripSelection>
  book(
    context: PublicApiShoppingContext,
    input: PublicApiTripBookingCreate,
  ): Promise<PublicApiTripBooking>
}

export interface PublicApiTripSelectionsGateway {
  create(context: PublicApiShoppingContext, request: unknown): Promise<PublicApiTripSelection>
  update(context: PublicApiShoppingContext, request: unknown): Promise<PublicApiTripSelection>
  book(context: PublicApiShoppingContext, request: unknown): Promise<PublicApiTripBooking>
}

export function createPublicApiTripSelectionsGateway(options: {
  resolveScope?: PublicApiResolveShoppingScope
  selections?: PublicApiTripSelectionsRuntime
}): PublicApiTripSelectionsGateway {
  const requireSelections = (): PublicApiTripSelectionsRuntime => {
    if (!options.selections) throw new PublicApiTripSelectionsUnavailableError("trip-selections")
    return options.selections
  }

  return {
    async create(context, rawRequest) {
      const resolveScope = options.resolveScope
      if (!resolveScope) throw new PublicApiTripSelectionsUnavailableError("shopping")
      const selections = requireSelections()
      const request = publicApiTripSelectionCreateSchema.parse(rawRequest)
      const scope = await resolveScope(context, request.scope)
      const result = publicApiTripSelectionSchema.parse(
        await selections.create(context, { scope, offers: request.offers }),
      )
      assertSameResolvedScope(scope, result.scope)
      return result
    },

    async update(context, rawRequest) {
      const selections = requireSelections()
      const request = publicApiTripSelectionUpdateSchema.parse(rawRequest)
      return publicApiTripSelectionSchema.parse(await selections.update(context, request))
    },

    async book(context, rawRequest) {
      const selections = requireSelections()
      const request = publicApiTripBookingCreateSchema.parse(rawRequest)
      return publicApiTripBookingSchema.parse(await selections.book(context, request))
    },
  }
}

/**
 * A runtime that answered outside the scope it was handed has ignored the
 * market, locale or currency the channel resolved — which would price or
 * present the selection in something other than what the shopper was shown.
 */
function assertSameResolvedScope(
  expected: { marketId: string; locale: string; currency: string },
  actual: { marketId: string; locale: string; currency: string },
): void {
  if (
    expected.marketId !== actual.marketId ||
    expected.locale !== actual.locale ||
    expected.currency !== actual.currency
  ) {
    throw new Error("Trip-selection runtime returned a result outside the resolved shopping scope.")
  }
}
