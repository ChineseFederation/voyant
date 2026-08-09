import { definePort } from "@voyant-travel/core/project"

import type {
  StorefrontRequestedScope,
  StorefrontResolvedScope,
  StorefrontShoppingIntent,
  StorefrontShoppingResult,
  StorefrontTripBooking,
  StorefrontTripBookingCreate,
  StorefrontTripSelection,
  StorefrontTripSelectionCreate,
  StorefrontTripSelectionUpdate,
} from "./schemas.js"

// Package manifests consume graph-safe provider contracts through this
// dedicated runtime-port surface rather than the runtime-heavy provider module.
export { storefrontDynamicPackageSourceProviderPort } from "./provider-ports.js"

/** Server-derived authority. It must never be accepted from a browser body. */
export interface StorefrontShoppingContext {
  storefrontId: string
  channelId: string
  /** Voyant-managed customer identity; absent/null for an anonymous capability owner. */
  userId?: string | null
  /** Voyant-managed buyer account selected for the journey, never browser-derived. */
  buyerAccountId?: string | null
}

export interface StorefrontOpaqueReferenceIssuer {
  /**
   * The backing issuer MUST authenticate the same storefront/channel/scope and
   * owner tuple when resolving the ref, and reject cross-owner replay. The
   * managed shopping runtime never resolves or commits an offer itself.
   */
  issue(input: {
    purpose: "catalog-item" | "flight-offer" | "stay-offer" | "package-offer" | "live-continuation"
    storefrontId: string
    channelId: string
    /** Trusted capability owner binding. Anonymous owners are explicitly null. */
    owner: { userId: string | null; buyerAccountId: string | null }
    scope: Pick<StorefrontResolvedScope, "marketId" | "locale" | "currency">
    payload: Readonly<Record<string, unknown>>
    ttlSeconds: number
    replay: "multi-use" | "single-use"
  }): Promise<{ ref: string; expiresAt: string }>
  /**
   * Atomically redeems a server-stored capability against the complete trust
   * boundary. Implementations return only its closed payload. Single-use
   * references MUST be claimed with compare-and-set before returning it.
   */
  redeem(input: {
    ref: string
    purpose: "live-continuation"
    storefrontId: string
    channelId: string
    owner: { userId: string | null; buyerAccountId: string | null }
    scope: Pick<StorefrontResolvedScope, "marketId" | "locale" | "currency">
    kind: "flight" | "stay" | "package"
    intentFingerprint: string
  }): Promise<{ payload: Readonly<Record<string, unknown>> } | null>
}

export interface StorefrontShoppingRuntime {
  resolveScope(
    context: StorefrontShoppingContext,
    requested: StorefrontRequestedScope,
  ): Promise<StorefrontResolvedScope>
  search(
    context: StorefrontShoppingContext,
    input: { scope: StorefrontResolvedScope; intent: StorefrontShoppingIntent },
  ): Promise<StorefrontShoppingResult>
}

/** Separate stateful seam: shopping remains read-only and stateless. */
export interface StorefrontTripSelectionsRuntime {
  create(
    context: StorefrontShoppingContext,
    input: Omit<StorefrontTripSelectionCreate, "scope"> & { scope: StorefrontResolvedScope },
  ): Promise<StorefrontTripSelection>
  update(
    context: StorefrontShoppingContext,
    input: StorefrontTripSelectionUpdate,
  ): Promise<StorefrontTripSelection>
  book(
    context: StorefrontShoppingContext,
    input: StorefrontTripBookingCreate,
  ): Promise<StorefrontTripBooking>
}

function requireMethods(id: string, provider: object, methods: readonly string[]): void {
  for (const method of methods) {
    if (typeof (provider as Record<string, unknown>)[method] !== "function") {
      throw new Error(`${id} provider must implement ${method}().`)
    }
  }
}

export const storefrontShoppingRuntimePort = definePort<StorefrontShoppingRuntime>({
  id: "storefront.shopping.runtime",
  test(provider) {
    if (provider === null || typeof provider !== "object") {
      throw new Error("storefront.shopping.runtime provider must be an options object.")
    }
    requireMethods("storefront.shopping.runtime", provider, ["resolveScope", "search"])
  },
})

export const storefrontOpaqueReferenceIssuerPort = definePort<StorefrontOpaqueReferenceIssuer>({
  id: "storefront.shopping.opaque-reference-issuer",
  test(provider) {
    if (
      provider === null ||
      typeof provider !== "object" ||
      typeof (provider as { issue?: unknown }).issue !== "function" ||
      typeof (provider as { redeem?: unknown }).redeem !== "function"
    ) {
      throw new Error(
        "storefront.shopping.opaque-reference-issuer provider must implement issue() and redeem().",
      )
    }
  },
})

export const storefrontTripSelectionsRuntimePort = definePort<StorefrontTripSelectionsRuntime>({
  id: "storefront.trip-selections.runtime",
  test(provider) {
    if (provider === null || typeof provider !== "object") {
      throw new Error("storefront.trip-selections.runtime provider must be an options object.")
    }
    requireMethods("storefront.trip-selections.runtime", provider, ["create", "update", "book"])
  },
})
