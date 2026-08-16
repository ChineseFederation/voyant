"use client"

import { queryOptions } from "@tanstack/react-query"
import type {
  FareCalendarRequest,
  FlightOffer,
  FlightSearchRequest,
} from "@voyant-travel/flights/contract/types"

import { type FetchWithValidationOptions, fetchWithValidation } from "./client.js"
import { type AirportSearchFilters, flightsQueryKeys } from "./query-keys.js"
import {
  aircraftListResponseSchema,
  airlineListResponseSchema,
  airportListResponseSchema,
  ancillaryResponseSchema,
  fareCalendarResponseSchema,
  flightSearchResponseSchema,
  seatMapResponseSchema,
  servedMarketsResponseSchema,
} from "./schemas.js"

export function getFlightSearchQueryOptions(
  client: FetchWithValidationOptions,
  request: FlightSearchRequest,
) {
  return queryOptions({
    queryKey: flightsQueryKeys.searchRequest(request),
    queryFn: () =>
      fetchWithValidation("/v1/admin/flights/search", flightSearchResponseSchema, client, {
        method: "POST",
        body: JSON.stringify(request),
      }),
  })
}

/**
 * Quote a window of departure dates for one route.
 *
 * `retry: false` is deliberate: a connector without the capability answers
 * 501, and that is a settled answer about this deployment's supply, not a
 * transient failure worth three round-trips.
 */
export function getFareCalendarQueryOptions(
  client: FetchWithValidationOptions,
  request: FareCalendarRequest,
) {
  return queryOptions({
    queryKey: flightsQueryKeys.fareCalendarWindow(request),
    retry: false,
    queryFn: () =>
      fetchWithValidation("/v1/admin/flights/fare-calendar", fareCalendarResponseSchema, client, {
        method: "POST",
        body: JSON.stringify(request),
      }),
  })
}

/**
 * The connector's declared network. `retry: false` for the same reason the
 * fare calendar sets it: 501 is an answer about this deployment, not a blip.
 */
export function getServedMarketsQueryOptions(client: FetchWithValidationOptions) {
  return queryOptions({
    queryKey: flightsQueryKeys.servedMarkets(),
    retry: false,
    queryFn: () =>
      fetchWithValidation("/v1/admin/flights/served-markets", servedMarketsResponseSchema, client),
  })
}

export function getFlightAncillariesQueryOptions(
  client: FetchWithValidationOptions,
  input: { offerId: string; offer?: FlightOffer },
) {
  return queryOptions({
    queryKey: flightsQueryKeys.ancillariesForOffer(input.offerId),
    queryFn: () =>
      fetchWithValidation("/v1/admin/flights/ancillaries", ancillaryResponseSchema, client, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  })
}

export function getFlightSeatMapQueryOptions(
  client: FetchWithValidationOptions,
  input: { offerId: string; segmentId: string; offer?: FlightOffer },
) {
  return queryOptions({
    queryKey: flightsQueryKeys.seatMapForSegment(input.offerId, input.segmentId),
    queryFn: () =>
      fetchWithValidation("/v1/admin/flights/seatmap", seatMapResponseSchema, client, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  })
}

export function getAirlinesQueryOptions(client: FetchWithValidationOptions) {
  return queryOptions({
    queryKey: flightsQueryKeys.airlines(),
    queryFn: () =>
      fetchWithValidation(
        "/v1/admin/flights/reference/airlines",
        airlineListResponseSchema,
        client,
      ),
  })
}

export function getAirportsQueryOptions(
  client: FetchWithValidationOptions,
  filters: AirportSearchFilters = {},
) {
  return queryOptions({
    queryKey: flightsQueryKeys.airports(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.q) params.set("q", filters.q)
      if (filters.limit !== undefined) params.set("limit", String(filters.limit))
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/flights/reference/airports${qs ? `?${qs}` : ""}`,
        airportListResponseSchema,
        client,
      )
    },
  })
}

export function getAircraftQueryOptions(client: FetchWithValidationOptions) {
  return queryOptions({
    queryKey: flightsQueryKeys.aircraft(),
    queryFn: () =>
      fetchWithValidation(
        "/v1/admin/flights/reference/aircraft",
        aircraftListResponseSchema,
        client,
      ),
  })
}
