"use client"

import { queryOptions } from "@tanstack/react-query"

import { type FetchWithValidationOptions, fetchWithValidation } from "./client.js"
import type { UseOptionUnitOptions } from "./hooks/use-option-unit.js"
import type { UseOptionUnitsOptions } from "./hooks/use-option-units.js"
import type { UseProductOptions } from "./hooks/use-product.js"
import type { UseProductCategoriesOptions } from "./hooks/use-product-categories.js"
import type { UseProductDayServicesOptions } from "./hooks/use-product-day-services.js"
import type { UseProductDaysOptions } from "./hooks/use-product-days.js"
import type { UseProductItinerariesOptions } from "./hooks/use-product-itineraries.js"
import type { UseProductItineraryDaysOptions } from "./hooks/use-product-itinerary-days.js"
import type { UseProductMediaOptions } from "./hooks/use-product-media.js"
import type { UseProductOptionOptions } from "./hooks/use-product-option.js"
import type { UseProductOptionsListOptions } from "./hooks/use-product-options.js"
import type { UseProductTagsOptions } from "./hooks/use-product-tags.js"
import type { UseProductTypesOptions } from "./hooks/use-product-types.js"
import type { UseProductVersionsOptions } from "./hooks/use-product-versions.js"
import type { UseProductsOptions } from "./hooks/use-products.js"
import { productsQueryKeys } from "./query-keys.js"
import {
  optionUnitListResponse,
  optionUnitSingleResponse,
  productCategoryListResponse,
  productDayServicesResponse,
  productDaysResponse,
  productItinerariesResponse,
  productListResponse,
  productMediaListResponse,
  productOptionListResponse,
  productOptionSingleResponse,
  productReadinessResponse,
  productSingleResponse,
  productTagListResponse,
  productTypeListResponse,
  productTypeSingleResponse,
  productVersionsResponse,
} from "./schemas.js"

export function getProductsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseProductsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options

  return queryOptions({
    queryKey: productsQueryKeys.productsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.status) params.set("status", filters.status)
      if (filters.bookingMode) params.set("bookingMode", filters.bookingMode)
      if (filters.visibility) params.set("visibility", filters.visibility)
      if (filters.activated !== undefined) params.set("activated", String(filters.activated))
      if (filters.facilityId) params.set("facilityId", filters.facilityId)
      if (filters.productTypeId) params.set("productTypeId", filters.productTypeId)
      if (filters.categoryId) params.set("categoryId", filters.categoryId)
      if (filters.tag) params.set("tag", filters.tag)
      if (filters.search) params.set("search", filters.search)
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom)
      if (filters.dateTo) params.set("dateTo", filters.dateTo)
      if (filters.departureFrom) params.set("departureFrom", filters.departureFrom)
      if (filters.departureTo) params.set("departureTo", filters.departureTo)
      if (filters.paxMin !== undefined) params.set("paxMin", String(filters.paxMin))
      if (filters.paxMax !== undefined) params.set("paxMax", String(filters.paxMax))
      if (filters.sellAmountMin !== undefined)
        params.set("sellAmountMin", String(filters.sellAmountMin))
      if (filters.sellAmountMax !== undefined)
        params.set("sellAmountMax", String(filters.sellAmountMax))
      if (filters.sortBy) params.set("sortBy", filters.sortBy)
      if (filters.sortDir) params.set("sortDir", filters.sortDir)
      if (filters.limit !== undefined) params.set("limit", String(filters.limit))
      if (filters.offset !== undefined) params.set("offset", String(filters.offset))
      const qs = params.toString()

      return fetchWithValidation(
        `/v1/admin/products${qs ? `?${qs}` : ""}`,
        productListResponse,
        client,
      )
    },
  })
}

export function getProductQueryOptions(
  client: FetchWithValidationOptions,
  id: string | null | undefined,
  options: UseProductOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: productsQueryKeys.product(id ?? ""),
    queryFn: async () => {
      if (!id) throw new Error("getProductQueryOptions requires an id")

      const { data } = await fetchWithValidation(
        `/v1/admin/products/${id}`,
        productSingleResponse,
        client,
      )
      return data
    },
  })
}

export function getProductTypesQueryOptions(
  client: FetchWithValidationOptions,
  options: UseProductTypesOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options

  return queryOptions({
    queryKey: productsQueryKeys.productTypesList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.active !== undefined) params.set("active", String(filters.active))
      if (filters.search) params.set("search", filters.search)
      if (filters.limit !== undefined) params.set("limit", String(filters.limit))
      if (filters.offset !== undefined) params.set("offset", String(filters.offset))
      const qs = params.toString()

      return fetchWithValidation(
        `/v1/admin/products/product-types${qs ? `?${qs}` : ""}`,
        productTypeListResponse,
        client,
      )
    },
  })
}

export function getProductTypeQueryOptions(
  client: FetchWithValidationOptions,
  id: string | null | undefined,
) {
  return queryOptions({
    queryKey: productsQueryKeys.productType(id ?? ""),
    queryFn: async () => {
      if (!id) throw new Error("getProductTypeQueryOptions requires an id")

      const { data } = await fetchWithValidation(
        `/v1/admin/products/product-types/${id}`,
        productTypeSingleResponse,
        client,
      )
      return data
    },
  })
}

export function getProductTagsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseProductTagsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options

  return queryOptions({
    queryKey: productsQueryKeys.productTagsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.search) params.set("search", filters.search)
      if (filters.limit !== undefined) params.set("limit", String(filters.limit))
      if (filters.offset !== undefined) params.set("offset", String(filters.offset))
      const qs = params.toString()

      return fetchWithValidation(
        `/v1/admin/products/product-tags${qs ? `?${qs}` : ""}`,
        productTagListResponse,
        client,
      )
    },
  })
}

export function getProductCategoriesQueryOptions(
  client: FetchWithValidationOptions,
  options: UseProductCategoriesOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options

  return queryOptions({
    queryKey: productsQueryKeys.productCategoriesList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.parentId) params.set("parentId", filters.parentId)
      if (filters.active !== undefined) params.set("active", String(filters.active))
      if (filters.search) params.set("search", filters.search)
      if (filters.limit !== undefined) params.set("limit", String(filters.limit))
      if (filters.offset !== undefined) params.set("offset", String(filters.offset))
      const qs = params.toString()

      return fetchWithValidation(
        `/v1/admin/products/product-categories${qs ? `?${qs}` : ""}`,
        productCategoryListResponse,
        client,
      )
    },
  })
}

export function getProductOptionsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseProductOptionsListOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options

  return queryOptions({
    queryKey: productsQueryKeys.productOptionsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.productId) params.set("productId", filters.productId)
      if (filters.status) params.set("status", filters.status)
      if (filters.limit !== undefined) params.set("limit", String(filters.limit))
      if (filters.offset !== undefined) params.set("offset", String(filters.offset))
      const qs = params.toString()

      return fetchWithValidation(
        `/v1/admin/products/options${qs ? `?${qs}` : ""}`,
        productOptionListResponse,
        client,
      )
    },
  })
}

export function getProductOptionQueryOptions(
  client: FetchWithValidationOptions,
  id: string | null | undefined,
  options: UseProductOptionOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: productsQueryKeys.productOption(id ?? ""),
    queryFn: async () => {
      if (!id) throw new Error("getProductOptionQueryOptions requires an id")

      const { data } = await fetchWithValidation(
        `/v1/admin/products/options/${id}`,
        productOptionSingleResponse,
        client,
      )
      return data
    },
  })
}

export function getOptionUnitsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseOptionUnitsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options

  return queryOptions({
    queryKey: productsQueryKeys.optionUnitsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.optionId) params.set("optionId", filters.optionId)
      if (filters.unitType) params.set("unitType", filters.unitType)
      if (filters.limit !== undefined) params.set("limit", String(filters.limit))
      if (filters.offset !== undefined) params.set("offset", String(filters.offset))
      const qs = params.toString()

      return fetchWithValidation(
        `/v1/admin/products/units${qs ? `?${qs}` : ""}`,
        optionUnitListResponse,
        client,
      )
    },
  })
}

export function getOptionUnitQueryOptions(
  client: FetchWithValidationOptions,
  id: string | null | undefined,
  options: UseOptionUnitOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: productsQueryKeys.optionUnit(id ?? ""),
    queryFn: async () => {
      if (!id) throw new Error("getOptionUnitQueryOptions requires an id")

      const { data } = await fetchWithValidation(
        `/v1/admin/products/units/${id}`,
        optionUnitSingleResponse,
        client,
      )
      return data
    },
  })
}

export function getProductDaysQueryOptions(
  client: FetchWithValidationOptions,
  productId: string | null | undefined,
  options: UseProductDaysOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: productsQueryKeys.productDays(productId ?? ""),
    queryFn: async () => {
      if (!productId) throw new Error("getProductDaysQueryOptions requires a productId")

      return fetchWithValidation(
        `/v1/admin/products/${productId}/days`,
        productDaysResponse,
        client,
      )
    },
  })
}

export function getProductItinerariesQueryOptions(
  client: FetchWithValidationOptions,
  productId: string | null | undefined,
  options: UseProductItinerariesOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: productsQueryKeys.productItineraries(productId ?? ""),
    queryFn: async () => {
      if (!productId) {
        throw new Error("getProductItinerariesQueryOptions requires a productId")
      }

      return fetchWithValidation(
        `/v1/admin/products/${productId}/itineraries`,
        productItinerariesResponse,
        client,
      )
    },
  })
}

export function getProductItineraryDaysQueryOptions(
  client: FetchWithValidationOptions,
  productId: string | null | undefined,
  itineraryId: string | null | undefined,
  options: UseProductItineraryDaysOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: productsQueryKeys.productItineraryDays(productId ?? "", itineraryId ?? ""),
    queryFn: async () => {
      if (!productId || !itineraryId) {
        throw new Error("getProductItineraryDaysQueryOptions requires productId and itineraryId")
      }

      return fetchWithValidation(
        `/v1/admin/products/${productId}/itineraries/${itineraryId}/days`,
        productDaysResponse,
        client,
      )
    },
  })
}

export function getProductDayServicesQueryOptions(
  client: FetchWithValidationOptions,
  productId: string | null | undefined,
  dayId: string | null | undefined,
  options: UseProductDayServicesOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: productsQueryKeys.productDayServices(productId ?? "", dayId ?? ""),
    queryFn: async () => {
      if (!productId || !dayId) {
        throw new Error("getProductDayServicesQueryOptions requires productId and dayId")
      }

      return fetchWithValidation(
        `/v1/admin/products/${productId}/days/${dayId}/services`,
        productDayServicesResponse,
        client,
      )
    },
  })
}

export function getProductVersionsQueryOptions(
  client: FetchWithValidationOptions,
  productId: string | null | undefined,
  options: UseProductVersionsOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: productsQueryKeys.productVersions(productId ?? ""),
    queryFn: async () => {
      if (!productId) throw new Error("getProductVersionsQueryOptions requires a productId")

      return fetchWithValidation(
        `/v1/admin/products/${productId}/versions`,
        productVersionsResponse,
        client,
      )
    },
  })
}

/**
 * Continuous publish readiness for the Product Overview. Same evaluation the
 * publish gate runs, so the panel and a refused publish can never disagree.
 */
export function getProductReadinessQueryOptions(
  client: FetchWithValidationOptions,
  productId: string | null | undefined,
) {
  return queryOptions({
    queryKey: productsQueryKeys.productReadiness(productId ?? ""),
    queryFn: async () => {
      if (!productId) throw new Error("getProductReadinessQueryOptions requires a productId")

      return fetchWithValidation(
        `/v1/admin/products/${productId}/readiness`,
        productReadinessResponse,
        client,
      )
    },
  })
}

export function getProductMediaQueryOptions(
  client: FetchWithValidationOptions,
  productId: string | null | undefined,
  options: UseProductMediaOptions = {},
) {
  const { enabled: _enabled = true, dayId, mediaType, limit, offset } = options

  return queryOptions({
    queryKey: productsQueryKeys.productMediaList(productId ?? "", {
      dayId,
      mediaType,
      limit,
      offset,
    }),
    queryFn: async () => {
      if (!productId) throw new Error("getProductMediaQueryOptions requires a productId")

      const params = new URLSearchParams()
      if (mediaType) params.set("mediaType", mediaType)
      if (limit !== undefined) params.set("limit", String(limit))
      if (offset !== undefined) params.set("offset", String(offset))
      const qs = params.toString()
      const basePath = dayId
        ? `/v1/admin/products/${productId}/days/${dayId}/media`
        : `/v1/admin/products/${productId}/media`

      return fetchWithValidation(
        `${basePath}${qs ? `?${qs}` : ""}`,
        productMediaListResponse,
        client,
      )
    },
  })
}
