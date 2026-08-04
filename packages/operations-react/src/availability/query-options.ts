"use client"

import { queryOptions } from "@tanstack/react-query"

import { type FetchWithValidationOptions, fetchWithValidation } from "./client.js"
import type { UseCloseoutsOptions } from "./hooks/use-closeouts.js"
import type { UsePickupPointsOptions } from "./hooks/use-pickup-points.js"
import type { UseProductsOptions } from "./hooks/use-products.js"
import type { UseRulesOptions } from "./hooks/use-rules.js"
import type { UseSlotsOptions } from "./hooks/use-slots.js"
import type { UseStartTimesOptions } from "./hooks/use-start-times.js"
import {
  type AvailabilityOverviewFilters,
  availabilityQueryKeys,
  type FleetResourceListFilters,
} from "./query-keys.js"
import {
  allocationAuditLogResponse,
  allocationConflictsResponse,
  availabilityCloseoutListResponse,
  availabilityOverviewResponse,
  availabilityPickupPointListResponse,
  availabilityRuleListResponse,
  availabilitySlotAssignmentListResponse,
  availabilitySlotListResponse,
  availabilitySlotPickupListResponse,
  availabilitySlotSingleResponse,
  availabilityStartTimeListResponse,
  bookingSummaryListResponse,
  departureFleetResourcesResponse,
  departureSummaryResponse,
  fleetResourceListResponse,
  productListResponse,
  productOptionResourceTemplatesListResponse,
  productSingleResponse,
  resourceSummaryListResponse,
  slotAllocationManifestResponse,
  slotUnitAvailabilityListResponse,
} from "./schemas.js"

function appendPagination(params: URLSearchParams, filters: { limit?: number; offset?: number }) {
  if (filters.limit !== undefined) params.set("limit", String(filters.limit))
  if (filters.offset !== undefined) params.set("offset", String(filters.offset))
}

export function getProductsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseProductsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: availabilityQueryKeys.productsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.search) params.set("search", filters.search)
      appendPagination(params, filters)
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/products${qs ? `?${qs}` : ""}`,
        productListResponse,
        client,
      )
    },
  })
}

export function getRulesQueryOptions(
  client: FetchWithValidationOptions,
  options: UseRulesOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: availabilityQueryKeys.rulesList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.productId) params.set("productId", filters.productId)
      appendPagination(params, filters)
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/operations/availability/rules${qs ? `?${qs}` : ""}`,
        availabilityRuleListResponse,
        client,
      )
    },
  })
}

export function getStartTimesQueryOptions(
  client: FetchWithValidationOptions,
  options: UseStartTimesOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: availabilityQueryKeys.startTimesList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.productId) params.set("productId", filters.productId)
      appendPagination(params, filters)
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/operations/availability/start-times${qs ? `?${qs}` : ""}`,
        availabilityStartTimeListResponse,
        client,
      )
    },
  })
}

export function getSlotsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseSlotsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: availabilityQueryKeys.slotsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.productId) params.set("productId", filters.productId)
      if (filters.itineraryId) params.set("itineraryId", filters.itineraryId)
      if (filters.optionId) params.set("optionId", filters.optionId)
      if (filters.facilityId) params.set("facilityId", filters.facilityId)
      if (filters.availabilityRuleId) params.set("availabilityRuleId", filters.availabilityRuleId)
      if (filters.startTimeId) params.set("startTimeId", filters.startTimeId)
      if (filters.dateLocal) params.set("dateLocal", filters.dateLocal)
      if (filters.startsAtFrom) params.set("startsAtFrom", filters.startsAtFrom)
      if (filters.status) params.set("status", filters.status)
      appendPagination(params, filters)
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/operations/availability/slots${qs ? `?${qs}` : ""}`,
        availabilitySlotListResponse,
        client,
      )
    },
  })
}

export function getAvailabilityOverviewQueryOptions(
  client: FetchWithValidationOptions,
  options: AvailabilityOverviewFilters = {},
) {
  const filters = options
  return queryOptions({
    queryKey: availabilityQueryKeys.overview(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.productId) params.set("productId", filters.productId)
      if (filters.attentionLimit !== undefined) {
        params.set("attentionLimit", String(filters.attentionLimit))
      }
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/operations/availability/overview${qs ? `?${qs}` : ""}`,
        availabilityOverviewResponse,
        client,
      )
    },
  })
}

export function getCloseoutsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseCloseoutsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: availabilityQueryKeys.closeoutsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.productId) params.set("productId", filters.productId)
      if (filters.slotId) params.set("slotId", filters.slotId)
      appendPagination(params, filters)
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/operations/availability/closeouts${qs ? `?${qs}` : ""}`,
        availabilityCloseoutListResponse,
        client,
      )
    },
  })
}

export function getPickupPointsQueryOptions(
  client: FetchWithValidationOptions,
  options: UsePickupPointsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: availabilityQueryKeys.pickupPointsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.productId) params.set("productId", filters.productId)
      if (filters.active !== undefined) params.set("active", String(filters.active))
      appendPagination(params, filters)
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/operations/availability/pickup-points${qs ? `?${qs}` : ""}`,
        availabilityPickupPointListResponse,
        client,
      )
    },
  })
}

export function getSlotQueryOptions(
  client: FetchWithValidationOptions,
  id: string | null | undefined,
) {
  return queryOptions({
    queryKey: availabilityQueryKeys.slotDetail(id ?? ""),
    queryFn: async () => {
      if (!id) throw new Error("getSlotQueryOptions requires an id")
      return fetchWithValidation(
        `/v1/admin/operations/availability/slots/${id}`,
        availabilitySlotSingleResponse,
        client,
      )
    },
  })
}

export function getSlotUnitAvailabilityQueryOptions(
  client: FetchWithValidationOptions,
  slotId: string | null | undefined,
) {
  return queryOptions({
    queryKey: availabilityQueryKeys.slotUnitAvailability(slotId ?? ""),
    queryFn: async () => {
      if (!slotId) throw new Error("getSlotUnitAvailabilityQueryOptions requires a slotId")
      return fetchWithValidation(
        `/v1/admin/operations/availability/slots/${slotId}/unit-availability`,
        slotUnitAvailabilityListResponse,
        client,
      )
    },
  })
}

/**
 * The departure workspace's one headline read. Every counter in the envelope
 * is computed by aggregate over the whole departure, so the workspace never
 * has to reassemble a headline from the paginated detail lists (pickups,
 * closeouts, resources, manifests) — those stay separate fetches.
 */
export function getDepartureSummaryQueryOptions(
  client: FetchWithValidationOptions,
  slotId: string | null | undefined,
) {
  return queryOptions({
    queryKey: availabilityQueryKeys.departureSummary(slotId ?? ""),
    queryFn: async () => {
      if (!slotId) throw new Error("getDepartureSummaryQueryOptions requires a slotId")
      return fetchWithValidation(
        `/v1/admin/operations/availability/slots/${slotId}/summary`,
        departureSummaryResponse,
        client,
      )
    },
  })
}

export function getSlotAllocationQueryOptions(
  client: FetchWithValidationOptions,
  slotId: string | null | undefined,
) {
  return queryOptions({
    queryKey: availabilityQueryKeys.slotAllocation(slotId ?? ""),
    queryFn: async () => {
      if (!slotId) throw new Error("getSlotAllocationQueryOptions requires a slotId")
      return fetchWithValidation(
        `/v1/admin/operations/availability/slots/${slotId}/allocation`,
        slotAllocationManifestResponse,
        client,
      )
    },
  })
}

export function getSlotAllocationAuditLogQueryOptions(
  client: FetchWithValidationOptions,
  slotId: string | null | undefined,
) {
  return queryOptions({
    queryKey: availabilityQueryKeys.slotAllocationAuditLog(slotId ?? ""),
    queryFn: async () => {
      if (!slotId) throw new Error("getSlotAllocationAuditLogQueryOptions requires a slotId")
      return fetchWithValidation(
        `/v1/admin/operations/availability/slots/${slotId}/allocation/audit-log`,
        allocationAuditLogResponse,
        client,
      )
    },
  })
}

/**
 * The server-side conflicts projection for one resource kind. The workspace,
 * the CSV export and the printed manifest all read this one answer instead of
 * each re-deriving "what is wrong with this rooming plan" client-side.
 */
export function getSlotAllocationConflictsQueryOptions(
  client: FetchWithValidationOptions,
  slotId: string | null | undefined,
  kind: string,
) {
  return queryOptions({
    queryKey: availabilityQueryKeys.slotAllocationConflicts(slotId ?? "", kind),
    queryFn: async () => {
      if (!slotId) throw new Error("getSlotAllocationConflictsQueryOptions requires a slotId")
      return fetchWithValidation(
        `/v1/admin/operations/availability/slots/${slotId}/allocation/conflicts?kind=${encodeURIComponent(kind)}`,
        allocationConflictsResponse,
        client,
      )
    },
  })
}

/** Fleet `resources` records currently attached to this departure. */
export function getDepartureFleetResourcesQueryOptions(
  client: FetchWithValidationOptions,
  slotId: string | null | undefined,
) {
  return queryOptions({
    queryKey: availabilityQueryKeys.slotAllocationFleetResources(slotId ?? ""),
    queryFn: async () => {
      if (!slotId) throw new Error("getDepartureFleetResourcesQueryOptions requires a slotId")
      return fetchWithValidation(
        `/v1/admin/operations/availability/slots/${slotId}/allocation/fleet-resources`,
        departureFleetResourcesResponse,
        client,
      )
    },
  })
}

/** The operated-resource registry, filtered to what the attach picker offers. */
export function getFleetResourcesQueryOptions(
  client: FetchWithValidationOptions,
  options: FleetResourceListFilters = {},
) {
  return queryOptions({
    queryKey: availabilityQueryKeys.fleetResourcesList(options),
    queryFn: () => {
      const params = new URLSearchParams()
      if (options.kind) params.set("kind", options.kind)
      if (options.active !== undefined) params.set("active", String(options.active))
      appendPagination(params, options)
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/operations/resources${qs ? `?${qs}` : ""}`,
        fleetResourceListResponse,
        client,
      )
    },
  })
}

export function getProductQueryOptions(
  client: FetchWithValidationOptions,
  id: string | null | undefined,
) {
  return queryOptions({
    queryKey: availabilityQueryKeys.product(id ?? ""),
    queryFn: async () => {
      if (!id) throw new Error("getProductQueryOptions requires an id")
      return fetchWithValidation(`/v1/admin/products/${id}`, productSingleResponse, client)
    },
  })
}

export function getProductResourceTemplatesQueryOptions(
  client: FetchWithValidationOptions,
  productId: string | null | undefined,
) {
  return queryOptions({
    queryKey: availabilityQueryKeys.productResourceTemplates(productId ?? ""),
    queryFn: async () => {
      if (!productId)
        throw new Error("getProductResourceTemplatesQueryOptions requires a productId")
      return fetchWithValidation(
        `/v1/admin/operations/availability/products/${productId}/allocation/resource-templates`,
        productOptionResourceTemplatesListResponse,
        client,
      )
    },
  })
}

export function getSlotPickupsQueryOptions(
  client: FetchWithValidationOptions,
  slotId: string | null | undefined,
  options: Pick<UseSlotsOptions, "limit" | "offset"> = {},
) {
  const filters = { slotId: slotId ?? undefined, ...options }
  return queryOptions({
    queryKey: availabilityQueryKeys.slotPickupsList(filters),
    queryFn: async () => {
      if (!slotId) throw new Error("getSlotPickupsQueryOptions requires a slotId")
      const params = new URLSearchParams()
      params.set("slotId", slotId)
      appendPagination(params, options)
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/operations/availability/slot-pickups?${qs}`,
        availabilitySlotPickupListResponse,
        client,
      )
    },
  })
}

export function getSlotCloseoutsQueryOptions(
  client: FetchWithValidationOptions,
  slotId: string | null | undefined,
  options: Pick<UseCloseoutsOptions, "limit" | "offset"> = {},
) {
  const filters = { slotId: slotId ?? undefined, ...options }
  return queryOptions({
    queryKey: availabilityQueryKeys.slotCloseoutsList(filters),
    queryFn: async () => {
      if (!slotId) throw new Error("getSlotCloseoutsQueryOptions requires a slotId")
      const params = new URLSearchParams()
      params.set("slotId", slotId)
      appendPagination(params, options)
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/operations/availability/closeouts?${qs}`,
        availabilityCloseoutListResponse,
        client,
      )
    },
  })
}

export function getSlotAssignmentsQueryOptions(
  client: FetchWithValidationOptions,
  slotId: string | null | undefined,
  options: Pick<UseSlotsOptions, "limit" | "offset"> = {},
) {
  const filters = { slotId: slotId ?? undefined, ...options }
  return queryOptions({
    queryKey: availabilityQueryKeys.slotAssignmentsList(filters),
    queryFn: async () => {
      if (!slotId) throw new Error("getSlotAssignmentsQueryOptions requires a slotId")
      const params = new URLSearchParams()
      params.set("slotId", slotId)
      appendPagination(params, options)
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/operations/slot-assignments?${qs}`,
        availabilitySlotAssignmentListResponse,
        client,
      )
    },
  })
}

export function getSlotResourcesQueryOptions(
  client: FetchWithValidationOptions,
  options: Pick<UseProductsOptions, "limit" | "offset"> = {},
) {
  return queryOptions({
    queryKey: availabilityQueryKeys.slotResourcesList(options),
    queryFn: () => {
      const params = new URLSearchParams()
      appendPagination(params, options)
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/operations/resources${qs ? `?${qs}` : ""}`,
        resourceSummaryListResponse,
        client,
      )
    },
  })
}

export function getSlotBookingsQueryOptions(
  client: FetchWithValidationOptions,
  options: Pick<UseProductsOptions, "limit" | "offset"> = {},
) {
  return queryOptions({
    queryKey: availabilityQueryKeys.slotBookingsList(options),
    queryFn: () => {
      const params = new URLSearchParams()
      appendPagination(params, options)
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/bookings${qs ? `?${qs}` : ""}`,
        bookingSummaryListResponse,
        client,
      )
    },
  })
}
