"use client"

import { queryOptions } from "@tanstack/react-query"

import { BOOKING_STATUS_ALL } from "./booking-list-constants.js"
import { type FetchWithValidationOptions, fetchWithValidation } from "./client.js"
import type { UseBookingOptions } from "./hooks/use-booking.js"
import type { UseBookingActivityOptions } from "./hooks/use-booking-activity.js"
import type { UseBookingTravelerDocumentsOptions } from "./hooks/use-booking-documents.js"
import type { UseBookingGroupOptions } from "./hooks/use-booking-group.js"
import type { UseBookingGroupForBookingOptions } from "./hooks/use-booking-group-for-booking.js"
import type { UseBookingGroupsOptions } from "./hooks/use-booking-groups.js"
import type { UseBookingItemTravelersOptions } from "./hooks/use-booking-item-travelers.js"
import type { UseBookingItemsOptions } from "./hooks/use-booking-items.js"
import type { UseBookingNotesOptions } from "./hooks/use-booking-notes.js"
import type { UseBookingsOptions } from "./hooks/use-bookings.js"
import type { UseSupplierStatusesOptions } from "./hooks/use-supplier-statuses.js"
import type { UseTravelersOptions } from "./hooks/use-travelers.js"
import {
  bookingsQueryKeys,
  type PricingPreviewFilters,
  type TaxPreviewFilters,
} from "./query-keys.js"
import {
  bookingActivityResponse,
  bookingDetailResponse,
  bookingGroupDetailResponse,
  bookingGroupForBookingResponse,
  bookingGroupListResponse,
  bookingItemsResponse,
  bookingItemTravelersResponse,
  bookingListResponse,
  bookingNotesResponse,
  bookingSupplierStatusesResponse,
  bookingTravelerDocumentsResponse,
  bookingTravelerSharingGroupsResponse,
  bookingTravelerSingleResponse,
  bookingTravelersBySharingGroupResponse,
  bookingTravelersResponse,
  pricingPreviewResponse,
  taxPreviewResponse,
} from "./schemas.js"

export function getBookingsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseBookingsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options

  return queryOptions({
    queryKey: bookingsQueryKeys.bookingsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.status && filters.status !== BOOKING_STATUS_ALL) {
        params.set("status", filters.status)
      }
      if (filters.excludeStatuses && filters.excludeStatuses.length > 0) {
        // Send as a single comma-separated value rather than repeated
        // params. The server's `parseQuery` uses
        // `Object.fromEntries(searchParams)` which collapses duplicate
        // keys to the last one — appending each status would silently
        // drop all but the final entry. The schema's preprocess hook
        // splits this back into an array.
        params.set("excludeStatuses", filters.excludeStatuses.join(","))
      }
      if (filters.search) params.set("search", filters.search)
      if (filters.productId) params.set("productId", filters.productId)
      if (filters.optionId) params.set("optionId", filters.optionId)
      if (filters.availabilitySlotId) params.set("availabilitySlotId", filters.availabilitySlotId)
      if (filters.supplierId) params.set("supplierId", filters.supplierId)
      if (filters.productCategoryId) params.set("productCategoryId", filters.productCategoryId)
      if (filters.personId) params.set("personId", filters.personId)
      if (filters.organizationId) params.set("organizationId", filters.organizationId)
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom)
      if (filters.dateTo) params.set("dateTo", filters.dateTo)
      if (filters.paxMin !== undefined) params.set("paxMin", String(filters.paxMin))
      if (filters.paxMax !== undefined) params.set("paxMax", String(filters.paxMax))
      if (filters.sortBy) params.set("sortBy", filters.sortBy)
      if (filters.sortDir) params.set("sortDir", filters.sortDir)
      if (filters.limit !== undefined) params.set("limit", String(filters.limit))
      if (filters.offset !== undefined) params.set("offset", String(filters.offset))
      const qs = params.toString()

      return fetchWithValidation(
        `/v1/admin/bookings${qs ? `?${qs}` : ""}`,
        bookingListResponse,
        client,
      )
    },
  })
}

export function getBookingQueryOptions(
  client: FetchWithValidationOptions,
  id: string | null | undefined,
  options: UseBookingOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: bookingsQueryKeys.booking(id ?? ""),
    queryFn: () => fetchWithValidation(`/v1/admin/bookings/${id}`, bookingDetailResponse, client),
  })
}

export function getBookingItemsQueryOptions(
  client: FetchWithValidationOptions,
  bookingId: string | null | undefined,
  options: UseBookingItemsOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: bookingsQueryKeys.items(bookingId ?? ""),
    queryFn: () =>
      fetchWithValidation(`/v1/admin/bookings/${bookingId}/items`, bookingItemsResponse, client),
  })
}

export function getBookingItemTravelersQueryOptions(
  client: FetchWithValidationOptions,
  bookingId: string | null | undefined,
  itemId: string | null | undefined,
  options: UseBookingItemTravelersOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: bookingsQueryKeys.itemTravelers(bookingId ?? "", itemId ?? ""),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/bookings/${bookingId}/items/${itemId}/travelers`,
        bookingItemTravelersResponse,
        client,
      ),
  })
}

export function getBookingTravelerDocumentsQueryOptions(
  client: FetchWithValidationOptions,
  bookingId: string | null | undefined,
  options: UseBookingTravelerDocumentsOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: bookingsQueryKeys.documents(bookingId ?? ""),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/bookings/${bookingId}/documents`,
        bookingTravelerDocumentsResponse,
        client,
      ),
  })
}

export function getTravelersQueryOptions(
  client: FetchWithValidationOptions,
  bookingId: string | null | undefined,
  options: UseTravelersOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: bookingsQueryKeys.travelers(bookingId ?? ""),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/bookings/${bookingId}/travelers`,
        bookingTravelersResponse,
        client,
      ),
  })
}

export function getSharingGroupsForSlotQueryOptions(
  client: FetchWithValidationOptions,
  slotId: string | null | undefined,
) {
  return queryOptions({
    queryKey: bookingsQueryKeys.sharingGroupsForSlot(slotId ?? ""),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/bookings/sharing-groups?slotId=${encodeURIComponent(slotId ?? "")}`,
        bookingTravelerSharingGroupsResponse,
        client,
      ),
  })
}

export function getBookingsBySharingGroupQueryOptions(
  client: FetchWithValidationOptions,
  slotId: string | null | undefined,
  groupId: string | null | undefined,
) {
  return queryOptions({
    queryKey: bookingsQueryKeys.travelersBySharingGroup(slotId ?? "", groupId ?? ""),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/bookings/sharing-groups/${encodeURIComponent(
          groupId ?? "",
        )}/travelers?slotId=${encodeURIComponent(slotId ?? "")}`,
        bookingTravelersBySharingGroupResponse,
        client,
      ),
  })
}

/**
 * Fetch a single traveler with PII unmasked. Backend authorizes via
 * the same policy as `/travel-details` (staff or `bookings-pii:read`)
 * and audit-logs the access. Used by the "click to reveal" eye button
 * in the operator's traveler list — fetched lazily so unauthenticated
 * pageloads don't trigger reveal logs.
 */
export function getTravelerRevealQueryOptions(
  client: FetchWithValidationOptions,
  bookingId: string | null | undefined,
  travelerId: string | null | undefined,
) {
  return queryOptions({
    queryKey: ["voyant-bookings", "traveler-reveal", bookingId ?? "", travelerId ?? ""],
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/bookings/${bookingId}/travelers/${travelerId}/reveal`,
        bookingTravelerSingleResponse,
        client,
      ),
    // Don't cache reveals — every reveal should hit the audit log so
    // operators can't avoid logging by re-rendering the dashboard.
    staleTime: 0,
    gcTime: 0,
  })
}

export function getSupplierStatusesQueryOptions(
  client: FetchWithValidationOptions,
  bookingId: string | null | undefined,
  options: UseSupplierStatusesOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: bookingsQueryKeys.supplierStatuses(bookingId ?? ""),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/bookings/${bookingId}/supplier-statuses`,
        bookingSupplierStatusesResponse,
        client,
      ),
  })
}

export function getBookingActivityQueryOptions(
  client: FetchWithValidationOptions,
  bookingId: string | null | undefined,
  options: UseBookingActivityOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: bookingsQueryKeys.activity(bookingId ?? ""),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/bookings/${bookingId}/activity`,
        bookingActivityResponse,
        client,
      ),
  })
}

export function getBookingNotesQueryOptions(
  client: FetchWithValidationOptions,
  bookingId: string | null | undefined,
  options: UseBookingNotesOptions = {},
) {
  const { enabled: _enabled = true } = options

  return queryOptions({
    queryKey: bookingsQueryKeys.notes(bookingId ?? ""),
    queryFn: () =>
      fetchWithValidation(`/v1/admin/bookings/${bookingId}/notes`, bookingNotesResponse, client),
  })
}

export function getBookingGroupsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseBookingGroupsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: bookingsQueryKeys.groupsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.kind) params.set("kind", filters.kind)
      if (filters.productId) params.set("productId", filters.productId)
      if (filters.optionUnitId) params.set("optionUnitId", filters.optionUnitId)
      if (filters.limit !== undefined) params.set("limit", String(filters.limit))
      if (filters.offset !== undefined) params.set("offset", String(filters.offset))
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/bookings/groups${qs ? `?${qs}` : ""}`,
        bookingGroupListResponse,
        client,
      )
    },
  })
}

export function getBookingGroupQueryOptions(
  client: FetchWithValidationOptions,
  id: string | null | undefined,
  options: UseBookingGroupOptions = {},
) {
  const { enabled: _enabled = true } = options
  return queryOptions({
    queryKey: bookingsQueryKeys.group(id ?? ""),
    queryFn: () =>
      fetchWithValidation(`/v1/admin/bookings/groups/${id}`, bookingGroupDetailResponse, client),
  })
}

export function getBookingGroupForBookingQueryOptions(
  client: FetchWithValidationOptions,
  bookingId: string | null | undefined,
  options: UseBookingGroupForBookingOptions = {},
) {
  const { enabled: _enabled = true } = options
  return queryOptions({
    queryKey: bookingsQueryKeys.groupForBooking(bookingId ?? ""),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/bookings/${bookingId}/group`,
        bookingGroupForBookingResponse,
        client,
      ),
  })
}

/**
 * Pricing preview — resolves the storefront pricing snapshot for a product
 * without creating a booking session. Use it for operator create dialogs,
 * tour-sheet quotes, and reconciliation where the question is "what would the
 * customer see?"
 */
export function getPricingPreviewQueryOptions(
  client: FetchWithValidationOptions,
  filters: PricingPreviewFilters,
) {
  return queryOptions({
    queryKey: bookingsQueryKeys.pricingPreview(filters),
    queryFn: () =>
      fetchWithValidation("/v1/admin/bookings/pricing-preview", pricingPreviewResponse, client, {
        method: "POST",
        body: JSON.stringify({
          productId: filters.productId,
          optionId: filters.optionId ?? null,
          catalogId: filters.catalogId ?? null,
        }),
      }),
  })
}

/**
 * Tax preview — resolves the configured sell-side tax rate against an
 * in-progress booking's subtotal so booking-create screens can show a
 * real subtotal/tax/total breakdown.
 *
 * Backed by the mountable booking-tax `/v1/admin/bookings/tax-preview`
 * route, which mirrors the logic that runs at booking-finalize time.
 * Numbers shown to staff match what will land in
 * `booking_item_tax_lines`.
 */
export function getTaxPreviewQueryOptions(
  client: FetchWithValidationOptions,
  filters: TaxPreviewFilters,
) {
  return queryOptions({
    queryKey: bookingsQueryKeys.taxPreview(filters),
    queryFn: () =>
      fetchWithValidation("/v1/admin/bookings/tax-preview", taxPreviewResponse, client, {
        method: "POST",
        body: JSON.stringify({
          productId: filters.productId,
          subtotalCents: filters.subtotalCents,
          currency: filters.currency,
        }),
      }),
  })
}
