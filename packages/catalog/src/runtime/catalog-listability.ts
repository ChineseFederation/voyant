/**
 * Catalog listability policy for the operator deployment — the audience gate
 * for both halves of the catalog plane.
 *
 * Owned products reach it through the inventory document builder's
 * `isPublicAudienceListable` hook; sourced entries reach it through the
 * discovery sync's emission gate. Both resolve the same question — may this
 * entry appear in this slice? — against the same Distribution authority, just
 * addressed differently: a product id versus a provenance pair.
 *
 * Kept in its own module so the audience decision can be unit-tested without
 * dragging in the whole catalog-plane runtime graph (embeddings, policies,
 * projection extensions).
 */

import type { IndexerSlice } from "@voyant-travel/catalog-contracts/indexer/contract"

export type OwnedProductPublicApiListabilityInput = {
  audience: IndexerSlice["audience"]
  channel?: string
  /** Resolves Distribution-owned effective product publication for the channel. */
  isEffectivelyPublished: () => boolean | Promise<boolean>
}

/**
 * Storefront/distribution listability predicate for owned products.
 *
 * The upstream inventory gate already requires `status = active` before this
 * runs. Effective Publication is the distribution authority; the deprecated
 * product-level `visibility` and `activated` compatibility fields do not
 * participate in this decision.
 *
 * Public and external slices require an explicit server-derived channel.
 * Unchannelled customer slices remain buildable for compatibility with existing
 * index infrastructure, but they are no longer an authorization fallback.
 */
export async function isOwnedProductPublicApiListable(
  input: OwnedProductPublicApiListabilityInput,
): Promise<boolean> {
  if (!input.channel) return false
  return input.isEffectivelyPublished()
}

export type SourcedEntryPublicApiListabilityInput = {
  audience: IndexerSlice["audience"]
  channel?: string
  /** Resolves Distribution-owned effective source publication for the channel. */
  isEffectivelyPublished: () => boolean | Promise<boolean>
}

/**
 * True when a slice is customer-facing and therefore subject to publication.
 *
 * Mirrors the inventory document builder's own audience split so owned and
 * sourced entries cannot drift on which slices are gated.
 */
export function isPublicAudienceSlice(audience: IndexerSlice["audience"]): boolean {
  return audience === "customer" || audience === "partner" || audience === "supplier"
}

/**
 * Storefront/distribution listability predicate for sourced entries.
 *
 * Staff slices are deliberately ungated: the operator has to be able to browse
 * a connected supplier's inventory in admin in order to decide what to publish,
 * and manual booking discovery reads the same staff slice. Publication governs
 * merchandising, not visibility to the operator.
 *
 * Customer-facing slices are default-deny and require an explicit
 * server-derived channel, exactly as owned products do.
 */
export async function isSourcedEntryPublicApiListable(
  input: SourcedEntryPublicApiListabilityInput,
): Promise<boolean> {
  if (!isPublicAudienceSlice(input.audience)) return true
  if (!input.channel) return false
  return input.isEffectivelyPublished()
}
