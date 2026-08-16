/**
 * Client functions for the Booking.com-style catalog offer endpoints.
 *
 * These are the non-hook layer (mirrors `fetchWithValidation`'s "bypass the
 * hook layer" intent) — imperative consumers (search-on-submit, lazy
 * per-row pricing) call these directly with `{ baseUrl, fetcher }` from
 * `useVoyantCatalogContext()`; the `hooks/` wrap them in react-query.
 *
 * `surface` switches `/v1/admin/...` (operator dashboards, default) vs
 * `/v1/public/...` (storefront / partner / embedded surfaces).
 */

import { fetchWithValidation, type VoyantFetcher } from "./client.js"
import { type CatalogSearchHit, catalogSearchResponseSchema } from "./schemas.js"
import {
  type CatalogSlotsResponse,
  type CruiseContentResponse,
  type CruisePriceResponse,
  type CruiseSailingPricingResponse,
  catalogSlotsResponseSchema,
  cruiseContentResponseSchema,
  cruisePriceResponseSchema,
  cruiseSailingPricingResponseSchema,
  type DepartureAirportsResponse,
  departureAirportsResponseSchema,
  type PackageDetailResponse,
  type PackageSearchResponse,
  packageDetailResponseSchema,
  packageSearchResponseSchema,
} from "./schemas-catalog-offers.js"

export type CatalogSurface = "admin" | "public"

export interface CatalogOffersClientContext {
  baseUrl: string
  fetcher: VoyantFetcher
  /** Defaults to `"admin"`. */
  surface?: CatalogSurface
}

export interface NightsRange {
  min: number
  max: number
}

function catalogPath(surface: CatalogSurface | undefined, path: string): string {
  return `/v1/${surface ?? "admin"}/catalog/${path}`
}

function post(body: unknown, signal?: AbortSignal): RequestInit {
  return { method: "POST", body: JSON.stringify(body), signal }
}

export function fetchDepartureAirports(
  ctx: CatalogOffersClientContext,
  args: { countryCode: string },
  signal?: AbortSignal,
): Promise<DepartureAirportsResponse> {
  return fetchWithValidation(
    catalogPath(ctx.surface, "departure-airports"),
    departureAirportsResponseSchema,
    { baseUrl: ctx.baseUrl, fetcher: ctx.fetcher },
    post({ destination: { countryCode: args.countryCode } }, signal),
  )
}

export function fetchPackageSearch(
  ctx: CatalogOffersClientContext,
  args: {
    countryCode: string
    departureDateFrom: string
    departureDateTo: string
    adults: number
    nights: NightsRange
  },
  signal?: AbortSignal,
): Promise<PackageSearchResponse> {
  return fetchWithValidation(
    catalogPath(ctx.surface, "package-search"),
    packageSearchResponseSchema,
    { baseUrl: ctx.baseUrl, fetcher: ctx.fetcher },
    post(
      {
        destination: { countryCode: args.countryCode },
        departureDateFrom: args.departureDateFrom,
        departureDateTo: args.departureDateTo,
        adults: args.adults,
        nights: args.nights,
      },
      signal,
    ),
  )
}

export function fetchPackageDetail(
  ctx: CatalogOffersClientContext,
  args: {
    productId: string
    departureDateFrom: string
    departureDateTo: string
    adults: number
    nights: NightsRange
    locale?: string
  },
  signal?: AbortSignal,
): Promise<PackageDetailResponse> {
  return fetchWithValidation(
    catalogPath(ctx.surface, "package-detail"),
    packageDetailResponseSchema,
    { baseUrl: ctx.baseUrl, fetcher: ctx.fetcher },
    post(
      {
        productId: args.productId,
        departureDateFrom: args.departureDateFrom,
        departureDateTo: args.departureDateTo,
        adults: args.adults,
        nights: args.nights,
        locale: args.locale,
      },
      signal,
    ),
  )
}

export function fetchCruisePrice(
  ctx: CatalogOffersClientContext,
  args: { cruiseId: string },
  signal?: AbortSignal,
): Promise<CruisePriceResponse> {
  return fetchWithValidation(
    catalogPath(ctx.surface, "cruise-price"),
    cruisePriceResponseSchema,
    { baseUrl: ctx.baseUrl, fetcher: ctx.fetcher },
    post({ cruiseId: args.cruiseId }, signal),
  )
}

export function fetchCruiseSailingPricing(
  ctx: CatalogOffersClientContext,
  args: { cruiseId: string; sailingRef: string },
  signal?: AbortSignal,
): Promise<CruiseSailingPricingResponse> {
  return fetchWithValidation(
    catalogPath(ctx.surface, "cruise-sailing-pricing"),
    cruiseSailingPricingResponseSchema,
    { baseUrl: ctx.baseUrl, fetcher: ctx.fetcher },
    post({ cruiseId: args.cruiseId, sailingRef: args.sailingRef }, signal),
  )
}

export function fetchCruiseContent(
  ctx: CatalogOffersClientContext,
  args: { cruiseId: string; locale?: string },
  signal?: AbortSignal,
): Promise<CruiseContentResponse> {
  const params = new URLSearchParams()
  if (args.locale) params.set("locale", args.locale)
  const qs = params.toString()
  return fetchWithValidation(
    `/v1/${ctx.surface ?? "admin"}/cruises/${encodeURIComponent(args.cruiseId)}/content${
      qs ? `?${qs}` : ""
    }`,
    cruiseContentResponseSchema,
    { baseUrl: ctx.baseUrl, fetcher: ctx.fetcher },
    { method: "GET", signal },
  )
}

/**
 * Fetch a single indexed catalog document by its catalog id.
 *
 * The URL-addressable detail pages are entered by id, not from a result row, so
 * they have no search hit to carry the index projection. Everything the detail
 * body renders off `hit.document.fields` — price, offers, status, and the whole
 * Attributes tab — is in the index and nowhere else; without this the page
 * dropped all of it and rendered a fraction of what the same record shows in
 * the detail sheet. An `eq` filter on `id` is the by-id read the search route
 * already supports.
 *
 * Resolves to `null` when nothing matches (an id that is real but unindexed —
 * the caller still has the content route).
 */
export function fetchCatalogIndexDocument(
  ctx: CatalogOffersClientContext,
  args: { vertical: string; id: string },
  signal?: AbortSignal,
): Promise<CatalogSearchHit | null> {
  return fetchWithValidation(
    catalogPath(ctx.surface, "search"),
    catalogSearchResponseSchema,
    { baseUrl: ctx.baseUrl, fetcher: ctx.fetcher },
    post(
      {
        vertical: args.vertical,
        query: "",
        mode: "keyword",
        filters: [{ kind: "eq", field: "id", value: args.id }],
        pagination: { limit: 1 },
      },
      signal,
    ),
  ).then((res) => res.hits.find((hit) => hit.id === args.id) ?? null)
}

export function fetchCatalogSlots(
  ctx: CatalogOffersClientContext,
  args: { entityModule: string; entityId: string },
  signal?: AbortSignal,
): Promise<CatalogSlotsResponse> {
  const params = new URLSearchParams({
    entityModule: args.entityModule,
    entityId: args.entityId,
  })
  return fetchWithValidation(
    catalogPath(ctx.surface, `slots?${params.toString()}`),
    catalogSlotsResponseSchema,
    { baseUrl: ctx.baseUrl, fetcher: ctx.fetcher },
    { method: "GET", signal },
  )
}
