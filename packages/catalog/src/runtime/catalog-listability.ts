/**
 * Owned-product catalog listability policy for the operator deployment.
 *
 * This is the deployment-owned rule the inventory document builder injects via
 * its `isPublicAudienceListable` hook. It decides whether an owned product
 * (already gated as active + public + activated upstream) should be emitted
 * into a public-audience search slice.
 *
 * Kept in its own module so the audience decision can be unit-tested without
 * dragging in the whole catalog-plane runtime graph (embeddings, policies,
 * projection extensions).
 */

import type { IndexerSlice } from "@voyant-travel/catalog-contracts/indexer/contract"

export type OwnedProductStorefrontListabilityInput = {
  audience: IndexerSlice["audience"]
  channel?: string
  /** Resolves Distribution-owned effective product publication for the channel. */
  isEffectivelyPublished: () => boolean | Promise<boolean>
}

/**
 * Storefront/distribution listability predicate for owned products.
 *
 * The upstream inventory gate (`isPublicStorefrontProduct`) already requires
 * `status = active`, `activated = true`, and `visibility = public` before this
 * runs, so the caller only reaches here for an owned product that is otherwise
 * publicly sellable.
 *
 * Public and external slices require an explicit server-derived channel.
 * Unchannelled customer slices remain buildable for compatibility with existing
 * index infrastructure, but they are no longer an authorization fallback.
 */
export async function isOwnedProductStorefrontListable(
  input: OwnedProductStorefrontListabilityInput,
): Promise<boolean> {
  if (!input.channel) return false
  return input.isEffectivelyPublished()
}
