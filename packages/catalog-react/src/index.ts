// HTTP client + error type — re-exported for callers that want to bypass
// the hook layer (e.g. for SSR loaders).

// Catalog detail enrichment — the normalized detail view-model + its content client.
export {
  __resetEnrichmentFetcherWarnings,
  type CatalogDeparturePricingRow,
  type CatalogDetailEnrichment,
  type CatalogEnrichmentFetchers,
  type CatalogEnrichmentFetchersOptions,
  type CatalogSlotAvailability,
  createCatalogEnrichmentFetchers,
} from "./catalog-enrichment.js"
// Catalog offer/detail client functions (non-hook layer) + the surface switch.
export {
  type CatalogOffersClientContext,
  type CatalogSurface,
  fetchCatalogIndexDocument,
  fetchCatalogSlots,
  fetchCruiseContent,
  fetchCruisePrice,
  fetchCruiseSailingPricing,
  fetchDepartureAirports,
  fetchPackageDetail,
  fetchPackageSearch,
  type NightsRange,
} from "./catalog-offers-client.js"
// Catalog browse search-state contract (grid/list + sort + facet/range filters).
export {
  type CatalogFilterSelections,
  type CatalogSearchParams,
  type CatalogSortOption,
  type CatalogViewMode,
  catalogFiltersSchema,
  catalogSearchSchema,
  catalogSortOptions,
  catalogViewModes,
} from "./catalog-search-params.js"
export {
  defaultFetcher,
  type FetchWithValidationOptions,
  fetchWithValidation,
  VoyantApiError,
  type VoyantFetcher,
} from "./client.js"
export {
  type CatalogSearchFilter,
  type CatalogSearchMode,
  type UseCatalogSearchOptions,
  useCatalogSearch,
  useCatalogSlots,
  useCruiseContent,
  useCruisePrice,
  useCruiseSailingPricing,
  useDepartureAirports,
  usePackageDetail,
  usePackageSearch,
} from "./hooks/index.js"
// Provider: the same VoyantReactProvider as products-react / suppliers-react,
// re-exported under catalog naming for ergonomics in apps that compose
// multiple modules.
export {
  useVoyantCatalogContext,
  type VoyantCatalogContextValue,
  VoyantCatalogProvider,
  type VoyantCatalogProviderProps,
} from "./provider.js"
export {
  type CatalogFacetBucket,
  type CatalogSearchDocument,
  type CatalogSearchHit,
  type CatalogSearchResponse,
  catalogSearchResponseSchema,
} from "./schemas.js"
// Offer/detail request + response contracts (zod schemas + inferred types).
export {
  type CatalogAirportOption,
  type CatalogMoneyMinor,
  type CatalogSlot,
  type CatalogSlotsResponse,
  type CruiseCabinPrice,
  type CruiseContentResponse,
  type CruisePriceResponse,
  type CruiseSailingPricingResponse,
  catalogAirportOptionSchema,
  catalogSlotSchema,
  catalogSlotsResponseSchema,
  cruiseCabinPriceSchema,
  cruiseContentResponseSchema,
  cruisePriceResponseSchema,
  cruiseSailingPricingResponseSchema,
  type DepartureAirportsResponse,
  departureAirportsResponseSchema,
  type PackageDetailResponse,
  type PackageDetailSource,
  type PackageOffer,
  type PackageProductDetail,
  type PackageSearchCard,
  type PackageSearchResponse,
  packageDetailResponseSchema,
  packageDetailSourceSchema,
  packageOfferSchema,
  packageProductDetailSchema,
  packageSearchCardSchema,
  packageSearchResponseSchema,
} from "./schemas-catalog-offers.js"
