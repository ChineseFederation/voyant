"use client"

import type { QueryClient } from "@tanstack/react-query"

import {
  getDepartureSummaryQueryOptions,
  getPickupPointsQueryOptions,
  getProductQueryOptions,
  getSlotAllocationQueryOptions,
  getSlotAssignmentsQueryOptions,
  getSlotCloseoutsQueryOptions,
  getSlotPickupsQueryOptions,
  getSlotQueryOptions,
  getSlotResourcesQueryOptions,
  type VoyantAvailabilityContextValue,
} from "../index.js"

/**
 * The departure workspace's reads, in one place.
 *
 * Split out of the page module so the page stays a page. Everything here is
 * re-exported from `availability-slot-detail-page.js`, which is the published
 * entry hosts and the admin route loader already import from.
 *
 * Two kinds of read live side by side on purpose:
 *
 *   - the COMPOSED SUMMARY (`GET /slots/{id}/summary`), which carries every
 *     headline figure as a whole-departure aggregate;
 *   - the PAGINATED DETAIL (pickups, closeouts, assignments, resources, the
 *     allocation manifest), which carries rows.
 *
 * The workspace never derives a headline from the second kind. That is the
 * whole point of the envelope: paging the manifest cannot move a counter.
 */

export function getAvailabilitySlotDetailQueryOptions(
  client: VoyantAvailabilityContextValue,
  id: string | null | undefined,
) {
  return getSlotQueryOptions(client, id)
}

export function getAvailabilitySlotSummaryQueryOptions(
  client: VoyantAvailabilityContextValue,
  id: string | null | undefined,
) {
  return getDepartureSummaryQueryOptions(client, id)
}

export function getAvailabilitySlotProductQueryOptions(
  client: VoyantAvailabilityContextValue,
  productId: string | null | undefined,
) {
  return getProductQueryOptions(client, productId)
}

export function getAvailabilitySlotPickupsQueryOptions(
  client: VoyantAvailabilityContextValue,
  id: string | null | undefined,
) {
  return getSlotPickupsQueryOptions(client, id, { limit: 25, offset: 0 })
}

export function getAvailabilitySlotPickupPointsQueryOptions(
  client: VoyantAvailabilityContextValue,
  productId: string | null | undefined,
) {
  return getPickupPointsQueryOptions(client, {
    productId: productId ?? undefined,
    limit: 25,
    offset: 0,
  })
}

export function getAvailabilitySlotCloseoutsQueryOptions(
  client: VoyantAvailabilityContextValue,
  id: string | null | undefined,
) {
  return getSlotCloseoutsQueryOptions(client, id, { limit: 25, offset: 0 })
}

export function getAvailabilitySlotAssignmentsQueryOptions(
  client: VoyantAvailabilityContextValue,
  id: string | null | undefined,
) {
  return getSlotAssignmentsQueryOptions(client, id, { limit: 25, offset: 0 })
}

export function getAvailabilitySlotResourcesQueryOptions(client: VoyantAvailabilityContextValue) {
  return getSlotResourcesQueryOptions(client, { limit: 25, offset: 0 })
}

export function getAvailabilitySlotAllocationQueryOptions(
  client: VoyantAvailabilityContextValue,
  id: string | null | undefined,
) {
  return getSlotAllocationQueryOptions(client, id)
}

export async function loadAvailabilitySlotDetailPage(
  queryClient: QueryClient,
  client: VoyantAvailabilityContextValue,
  id: string,
) {
  const slotData = await queryClient.ensureQueryData(
    getAvailabilitySlotDetailQueryOptions(client, id),
  )

  return Promise.all([
    Promise.resolve(slotData),
    // The composed envelope: every headline figure in the workspace comes from
    // this one read, so it is prefetched alongside the slot itself.
    queryClient.ensureQueryData(getAvailabilitySlotSummaryQueryOptions(client, id)),
    queryClient.ensureQueryData(getAvailabilitySlotPickupsQueryOptions(client, id)),
    queryClient.ensureQueryData(getAvailabilitySlotCloseoutsQueryOptions(client, id)),
    queryClient.ensureQueryData(getAvailabilitySlotAssignmentsQueryOptions(client, id)),
    queryClient.ensureQueryData(getAvailabilitySlotResourcesQueryOptions(client)),
    queryClient.ensureQueryData(getAvailabilitySlotAllocationQueryOptions(client, id)),
    queryClient.ensureQueryData(
      getAvailabilitySlotProductQueryOptions(client, slotData.data.productId),
    ),
    queryClient.ensureQueryData(
      getAvailabilitySlotPickupPointsQueryOptions(client, slotData.data.productId),
    ),
  ])
}
