/**
 * Catalog "surfaces" that have a dedicated, full-page detail view. Excursions
 * and tours are scheduled PRODUCTS (their own browse surface), but their detail
 * content comes from the products content route — see `catalogSurfaceVertical`.
 */
export const catalogDetailSurfaces = [
  "products",
  "cruises",
  "accommodations",
  "excursions",
  "tours",
  "activities",
  "attractions",
  "events",
  "transportation",
] as const
export type CatalogDetailSurface = (typeof catalogDetailSurfaces)[number]

/**
 * Verticals the indexed browse grid (`CatalogVerticalHost`) can render — the
 * surfaces with their own search-index collection. Excursions/tours browse the
 * `products` vertical with locked supply-model/duration filters instead.
 */
export const catalogVerticalPageIds = ["products", "cruises", "accommodations"] as const
export type CatalogVerticalPageId = (typeof catalogVerticalPageIds)[number]

/** Catalog/content vertical backing a surface (excursions/tours → products). */
export function catalogSurfaceVertical(
  surface: CatalogDetailSurface,
): "products" | "cruises" | "accommodations" {
  if (surface === "cruises") return "cruises"
  if (surface === "accommodations") return "accommodations"
  return "products"
}
