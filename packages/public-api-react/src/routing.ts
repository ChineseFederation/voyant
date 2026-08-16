/**
 * Verticals that have a working customer detail + booking page in the
 * storefront. Search and the customer detail route derive their accepted
 * verticals from this list, so a vertical only surfaces once it can render a
 * detail page and take a booking (voyant#2640).
 */
export const publicApiCustomerBookableProductVerticals = [
  "products",
  "accommodations",
  "cruises",
] as const

export type PublicApiCustomerBookableProductVertical =
  (typeof publicApiCustomerBookableProductVerticals)[number]

export function isPublicApiCustomerBookableProductVertical(
  vertical: string,
): vertical is PublicApiCustomerBookableProductVertical {
  return publicApiCustomerBookableProductVerticals.includes(
    vertical as PublicApiCustomerBookableProductVertical,
  )
}

export function getPublicApiCustomerProductDetailRoute(
  entityModule: string,
  entityId: string,
): {
  to: "/shop/products/$entityModule/$entityId"
  params: { entityModule: PublicApiCustomerBookableProductVertical; entityId: string }
} | null {
  if (!isPublicApiCustomerBookableProductVertical(entityModule)) {
    return null
  }
  if (entityModule === "cruises" && !isOwnedCruiseId(entityId)) {
    return null
  }

  return {
    to: "/shop/products/$entityModule/$entityId",
    params: { entityModule, entityId },
  }
}

function isOwnedCruiseId(entityId: string): boolean {
  return entityId.startsWith("cru_")
}
