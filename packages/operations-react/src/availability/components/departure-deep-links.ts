/**
 * Where a departure's rows live outside Operations.
 *
 * `allocation_resources` has carried `ref_type` / `ref_id` since it was
 * introduced — the materializer writes the option a room came from, and a
 * template may point a row at a supplier's inventory or at a row in the
 * operations resource pool — but nothing ever resolved that pair into a place
 * the operator could go. This module is that resolution, kept as pure data so
 * the page can map a target onto whichever navigation its host provides
 * (packaged pages never import a host route tree).
 */

export type DepartureLinkTarget =
  | { kind: "resource"; resourceId: string }
  | { kind: "supplier"; supplierId: string }
  | { kind: "product"; productId: string }
  | { kind: "booking"; bookingId: string }

export interface AllocationResourceRef {
  refType: string | null
  refId: string | null
}

/**
 * Resolve an allocation resource's persisted reference to a destination.
 *
 * `option` / `option_unit` refs point at a product OPTION, which has no page
 * of its own — the option is only reachable through the product editor, so
 * those resolve to the departure's product rather than to nothing. Anything
 * this codebase does not write (a bespoke template ref, a future kind) returns
 * `null`: rendering a dead link is worse than rendering plain text.
 */
export function resolveAllocationResourceTarget(
  resource: AllocationResourceRef,
  context: { productId: string | null },
): DepartureLinkTarget | null {
  const { refType, refId } = resource

  if (!refType) return null

  switch (refType) {
    case "resource":
      return refId ? { kind: "resource", resourceId: refId } : null
    case "supplier":
      return refId ? { kind: "supplier", supplierId: refId } : null
    case "product":
      return refId ? { kind: "product", productId: refId } : null
    case "option":
    case "option_unit":
      return context.productId ? { kind: "product", productId: context.productId } : null
    default:
      return null
  }
}
