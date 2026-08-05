/**
 * The Product authoring information architecture (voyant#4038).
 *
 * Product authoring is organized around seven ordered groups — Overview &
 * readiness, Content, Plan, Options & pricing, Availability, Distribution and
 * History — each addressable by a stable in-page anchor so the operator (and a
 * deep link from elsewhere) can jump straight to a concern. The grouping is a
 * presentation concern: the underlying section components are unchanged, they
 * are just gathered under a stable, ordered set of headings.
 *
 * This module is the single source of truth for the group order, the stable
 * ids, and the anchor/deep-link derivation, so the nav and the detail page can
 * never drift on either the set or the ordering.
 */

/** The seven authoring groups, in canonical display order. */
export type ProductAuthoringGroupId =
  | "overview"
  | "content"
  | "plan"
  | "options"
  | "availability"
  | "distribution"
  | "history"

export const PRODUCT_AUTHORING_GROUP_IDS = [
  "overview",
  "content",
  "plan",
  "options",
  "availability",
  "distribution",
  "history",
] as const satisfies readonly ProductAuthoringGroupId[]

/** The in-page element id an authoring group anchors to. */
export function authoringGroupAnchorId(id: ProductAuthoringGroupId): string {
  return `authoring-${id}`
}

/** A contextual deep link to a Product authoring group. */
export function authoringGroupDeepLink(productId: string, id: ProductAuthoringGroupId): string {
  return `/products/${productId}#${authoringGroupAnchorId(id)}`
}

/**
 * Resolve the active authoring group from a location hash (`#authoring-plan` →
 * `plan`), or null when the hash names no known group.
 */
export function authoringGroupFromHash(
  hash: string | null | undefined,
): ProductAuthoringGroupId | null {
  if (!hash) return null
  const bare = hash.replace(/^#/, "")
  const match = PRODUCT_AUTHORING_GROUP_IDS.find((id) => authoringGroupAnchorId(id) === bare)
  return match ?? null
}
