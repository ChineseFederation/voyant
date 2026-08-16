export interface CruisesListFilters {
  cruiseType?: "ocean" | "river" | "expedition" | "coastal" | undefined
  status?: "draft" | "awaiting_review" | "live" | "archived" | undefined
  lineSupplierId?: string | undefined
  region?: string | undefined
  search?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface SailingsListFilters {
  cruiseId?: string | undefined
  shipId?: string | undefined
  dateFrom?: string | undefined
  dateTo?: string | undefined
  salesStatus?: "open" | "on_request" | "wait_list" | "sold_out" | "closed" | undefined
  direction?: "upstream" | "downstream" | "round_trip" | "one_way" | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface ShipsListFilters {
  lineSupplierId?: string | undefined
  shipType?: "ocean" | "river" | "expedition" | "yacht" | "sailing" | "coastal" | undefined
  isActive?: boolean | undefined
  search?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface PricesListFilters {
  sailingId?: string | undefined
  cabinCategoryId?: string | undefined
  occupancy?: number | undefined
  fareCode?: string | undefined
  availability?: "available" | "limited" | "on_request" | "wait_list" | "sold_out" | undefined
  priceCatalogId?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface PublicApiListFilters {
  cruiseType?: "ocean" | "river" | "expedition" | "coastal" | undefined
  region?: string | undefined
  theme?: string | undefined
  dateFrom?: string | undefined
  dateTo?: string | undefined
  priceMaxCents?: number | undefined
  source?: "local" | "external" | undefined
  search?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

/**
 * Hierarchical TanStack query keys for the cruises module. Following the
 * convention from relationships-react and products-react: all keys are tuples rooted
 * at ["voyant", "cruises", ...] so a single invalidation can wipe everything
 * cruises-related, and finer-grained invalidations target specific resources.
 */
export const cruisesQueryKeys = {
  all: ["voyant", "cruises"] as const,

  // Cruises (root entity)
  cruises: () => [...cruisesQueryKeys.all, "cruises"] as const,
  cruisesList: (filters: CruisesListFilters) =>
    [...cruisesQueryKeys.cruises(), "list", filters] as const,
  /** Detail by unified key — accepts both `cru_*` TypeIDs and `<provider>:<ref>` external keys. */
  cruise: (key: string, include?: ReadonlyArray<"sailings" | "days">) =>
    [...cruisesQueryKeys.cruises(), "detail", key, include ?? []] as const,
  cruiseSailings: (key: string) => [...cruisesQueryKeys.cruise(key), "sailings"] as const,

  // Sailings
  sailings: () => [...cruisesQueryKeys.all, "sailings"] as const,
  sailingsList: (filters: SailingsListFilters) =>
    [...cruisesQueryKeys.sailings(), "list", filters] as const,
  sailing: (key: string, include?: ReadonlyArray<"pricing" | "itinerary">) =>
    [...cruisesQueryKeys.sailings(), "detail", key, include ?? []] as const,
  sailingItinerary: (key: string) => [...cruisesQueryKeys.sailing(key), "itinerary"] as const,

  // Ships
  ships: () => [...cruisesQueryKeys.all, "ships"] as const,
  shipsList: (filters: ShipsListFilters) => [...cruisesQueryKeys.ships(), "list", filters] as const,
  ship: (key: string) => [...cruisesQueryKeys.ships(), "detail", key] as const,
  shipDecks: (key: string) => [...cruisesQueryKeys.ship(key), "decks"] as const,
  shipCategories: (key: string) => [...cruisesQueryKeys.ship(key), "categories"] as const,

  // Cabin categories + cabins
  categoryCabins: (categoryId: string) =>
    [...cruisesQueryKeys.all, "categories", categoryId, "cabins"] as const,

  // Pricing
  prices: () => [...cruisesQueryKeys.all, "prices"] as const,
  pricesList: (filters: PricesListFilters) =>
    [...cruisesQueryKeys.prices(), "list", filters] as const,

  // Enrichment programs (per cruise)
  enrichment: (cruiseKey: string) => [...cruisesQueryKeys.cruise(cruiseKey), "enrichment"] as const,

  // Storefront (public)
  storefront: () => [...cruisesQueryKeys.all, "storefront"] as const,
  publicApiList: (filters: PublicApiListFilters) =>
    [...cruisesQueryKeys.storefront(), "list", filters] as const,
  publicApiCruise: (slug: string) => [...cruisesQueryKeys.storefront(), "detail", slug] as const,
  publicApiSailing: (key: string) => [...cruisesQueryKeys.storefront(), "sailings", key] as const,
  publicApiShip: (key: string) => [...cruisesQueryKeys.storefront(), "ships", key] as const,
} as const
