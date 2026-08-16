"use client"

import { useQuery } from "@tanstack/react-query"
import type { FareCalendarRequest } from "@voyant-travel/flights/contract/types"

import { useVoyantFlightsContext } from "../provider.js"
import { getFareCalendarQueryOptions } from "../query-options.js"

export interface UseFareCalendarOptions {
  /** Disable the query — e.g. while the route is incomplete or the picker is shut. */
  enabled?: boolean
  /**
   * TanStack Query stale time, milliseconds. Default 5 minutes: calendars are
   * served from the provider's cached lowest-fare data, so re-asking on every
   * picker open buys nothing.
   */
  staleTime?: number
}

/**
 * POST `/v1/admin/flights/fare-calendar` — indicative prices and availability
 * across a window of departure dates.
 *
 * Availability decoration is an enhancement, never a gate: a connector that
 * doesn't declare `flight/fare-calendar` answers 501, and callers are expected
 * to render a plain calendar rather than surface an error. Read
 * `isCapabilityMissing` for that case instead of treating it as a failure.
 */
export function useFareCalendar(
  request: FareCalendarRequest,
  options: UseFareCalendarOptions = {},
) {
  const client = useVoyantFlightsContext()
  const { enabled = false, staleTime = 5 * 60_000 } = options
  const query = useQuery({
    ...getFareCalendarQueryOptions(client, request),
    enabled: enabled && Boolean(request.origin && request.destination),
    staleTime,
  })

  const status = (query.error as { status?: number } | null | undefined)?.status
  return {
    ...query,
    /** The connector has no fare-calendar support. Degrade, don't report. */
    isCapabilityMissing: status === 501,
  }
}
