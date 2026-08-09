export type ProductsListSortField =
  | "name"
  | "status"
  | "sellAmount"
  | "pax"
  | "startDate"
  | "endDate"
  | "createdAt"

export type ProductsListSortDir = "asc" | "desc"

export interface ProductsListFilters {
  status?: string | undefined
  bookingMode?: string | undefined
  visibility?: string | undefined
  activated?: boolean | undefined
  facilityId?: string | undefined
  productTypeId?: string | undefined
  categoryId?: string | undefined
  tag?: string | undefined
  search?: string | undefined
  dateFrom?: string | undefined
  dateTo?: string | undefined
  departureFrom?: string | undefined
  departureTo?: string | undefined
  paxMin?: number | undefined
  paxMax?: number | undefined
  sellAmountMin?: number | undefined
  sellAmountMax?: number | undefined
  sortBy?: ProductsListSortField | undefined
  sortDir?: ProductsListSortDir | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface ProductTypesListFilters {
  active?: boolean | undefined
  search?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface ProductCategoriesListFilters {
  parentId?: string | undefined
  active?: boolean | undefined
  search?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface ProductTagsListFilters {
  search?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface ProductOptionsListFilters {
  productId?: string | undefined
  status?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface OptionUnitsListFilters {
  optionId?: string | undefined
  unitType?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface ProductMediaListFilters {
  dayId?: string | undefined
  mediaType?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface ProductActionLedgerListCursor {
  occurredAt: string
  id: string
}

export interface ProductActionLedgerListFilters {
  cursorOccurredAt?: string | undefined
  cursorId?: string | undefined
  limit?: number | undefined
}

export interface ProductTranslationsListFilters {
  productId?: string | undefined
  languageTag?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface ProductDayTranslationsListFilters {
  languageTag?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface ProductItineraryTranslationsListFilters {
  languageTag?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface DayServiceTranslationsListFilters {
  languageTag?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export const productsQueryKeys = {
  all: ["voyant", "products"] as const,

  products: () => [...productsQueryKeys.all, "products"] as const,
  productsList: (filters: ProductsListFilters) =>
    [...productsQueryKeys.products(), "list", filters] as const,
  productSummariesList: (filters: ProductsListFilters) =>
    [...productsQueryKeys.products(), "summary-list", filters] as const,
  product: (id: string) => [...productsQueryKeys.products(), "detail", id] as const,
  productTranslationsRoot: (productId: string) =>
    [...productsQueryKeys.product(productId), "translations"] as const,
  productTranslations: (productId: string, filters: ProductTranslationsListFilters = {}) =>
    [...productsQueryKeys.productTranslationsRoot(productId), filters] as const,
  productActionLedger: (id: string, filters: ProductActionLedgerListFilters = {}) =>
    [...productsQueryKeys.product(id), "action-ledger", filters] as const,

  productTypes: () => [...productsQueryKeys.all, "product-types"] as const,
  productTypesList: (filters: ProductTypesListFilters) =>
    [...productsQueryKeys.productTypes(), "list", filters] as const,
  productType: (id: string) => [...productsQueryKeys.productTypes(), "detail", id] as const,

  productCategories: () => [...productsQueryKeys.all, "product-categories"] as const,
  productCategoriesList: (filters: ProductCategoriesListFilters) =>
    [...productsQueryKeys.productCategories(), "list", filters] as const,
  productCategory: (id: string) =>
    [...productsQueryKeys.productCategories(), "detail", id] as const,

  productTags: () => [...productsQueryKeys.all, "product-tags"] as const,
  productTagsList: (filters: ProductTagsListFilters) =>
    [...productsQueryKeys.productTags(), "list", filters] as const,
  productTag: (id: string) => [...productsQueryKeys.productTags(), "detail", id] as const,

  productOptions: () => [...productsQueryKeys.all, "product-options"] as const,
  productOptionsList: (filters: ProductOptionsListFilters) =>
    [...productsQueryKeys.productOptions(), "list", filters] as const,
  productOption: (id: string) => [...productsQueryKeys.productOptions(), "detail", id] as const,

  optionUnits: () => [...productsQueryKeys.all, "option-units"] as const,
  optionUnitsList: (filters: OptionUnitsListFilters) =>
    [...productsQueryKeys.optionUnits(), "list", filters] as const,
  optionUnit: (id: string) => [...productsQueryKeys.optionUnits(), "detail", id] as const,

  productItineraries: (productId: string) =>
    [...productsQueryKeys.product(productId), "itineraries"] as const,
  productItineraryDays: (productId: string, itineraryId: string) =>
    [...productsQueryKeys.productItineraries(productId), itineraryId, "days"] as const,
  productItineraryTranslationsRoot: (productId: string, itineraryId: string) =>
    [...productsQueryKeys.productItineraries(productId), itineraryId, "translations"] as const,
  productItineraryTranslations: (
    productId: string,
    itineraryId: string,
    filters: ProductItineraryTranslationsListFilters = {},
  ) =>
    [
      ...productsQueryKeys.productItineraryTranslationsRoot(productId, itineraryId),
      filters,
    ] as const,
  productDays: (productId: string) => [...productsQueryKeys.product(productId), "days"] as const,
  productDayServices: (productId: string, dayId: string) =>
    [...productsQueryKeys.productDays(productId), dayId, "services"] as const,
  dayServiceTranslationsRoot: (productId: string, dayId: string, serviceId: string) =>
    [...productsQueryKeys.productDayServices(productId, dayId), serviceId, "translations"] as const,
  dayServiceTranslations: (
    productId: string,
    dayId: string,
    serviceId: string,
    filters: DayServiceTranslationsListFilters = {},
  ) =>
    [
      ...productsQueryKeys.dayServiceTranslationsRoot(productId, dayId, serviceId),
      filters,
    ] as const,
  productDayTranslationsRoot: (productId: string, dayId: string) =>
    [...productsQueryKeys.productDays(productId), dayId, "translations"] as const,
  productDayTranslations: (
    productId: string,
    dayId: string,
    filters: ProductDayTranslationsListFilters = {},
  ) => [...productsQueryKeys.productDayTranslationsRoot(productId, dayId), filters] as const,
  productVersions: (productId: string) =>
    [...productsQueryKeys.product(productId), "versions"] as const,
  productReadiness: (productId: string) =>
    [...productsQueryKeys.product(productId), "readiness"] as const,
  productMedia: (productId: string) => [...productsQueryKeys.product(productId), "media"] as const,
  productMediaList: (productId: string, filters: ProductMediaListFilters) =>
    [...productsQueryKeys.productMedia(productId), "list", filters] as const,
  productMediaItem: (mediaId: string) =>
    [...productsQueryKeys.all, "product-media", mediaId] as const,
} as const
