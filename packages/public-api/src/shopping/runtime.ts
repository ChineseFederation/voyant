import type { PublicApiShoppingContext, PublicApiShoppingRuntime } from "./runtime-port.js"
import {
  type PublicApiShoppingResult,
  publicApiResolvedScopeSchema,
  publicApiShoppingRequestSchema,
  publicApiShoppingResultSchema,
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

export interface PublicApiShoppingGateway {
  search(context: PublicApiShoppingContext, request: unknown): Promise<PublicApiShoppingResult>
}

/**
 * Strict validation boundary in front of deployment-provided implementations.
 * Optional ports keep existing deployments bootable; calls fail explicitly
 * until the corresponding managed or self-hosted provider is installed.
 */
export function createPublicApiShoppingGateway(options: {
  shopping?: PublicApiShoppingRuntime
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
