"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { fetchWithValidation } from "../client.js"
import { useVoyantAvailabilityContext } from "../provider.js"
import { availabilityQueryKeys } from "../query-keys.js"
import {
  getDepartureFleetResourcesQueryOptions,
  getFleetResourcesQueryOptions,
  getSlotAllocationConflictsQueryOptions,
} from "../query-options.js"
import {
  allocationPlanPreviewResponse,
  type BatchAllocationAssignment,
  batchAssignAllocationsResponse,
  departureResourceDetachResponse,
  departureResourceLinkResponse,
} from "../schemas.js"

/**
 * The departure-planning half of the allocation client: the fleet-resource
 * link, the conflicts projection, the atomic batch placement, the dry-run
 * auto-allocation and the CSV exports.
 *
 * Kept out of `use-slot-allocation.ts` for the same reason the server split
 * `routes-allocation-planning.ts` out of `routes-allocation.ts` — these are the
 * legs that plan a departure, not the ones that edit a single row.
 */

const slotAvailabilityPath = (slotId: string) => `/v1/admin/operations/availability/slots/${slotId}`

export interface UseSlotAllocationConflictsOptions {
  slotId: string | null | undefined
  /** Resource kind to evaluate. Defaults to the server's own default (`room`). */
  kind?: string
  enabled?: boolean
}

export function useSlotAllocationConflicts({
  slotId,
  kind = "room",
  enabled = true,
}: UseSlotAllocationConflictsOptions) {
  const client = useVoyantAvailabilityContext()
  return useQuery({
    ...getSlotAllocationConflictsQueryOptions(client, slotId, kind),
    enabled: enabled && Boolean(slotId),
  })
}

export interface UseDepartureFleetResourcesOptions {
  slotId: string | null | undefined
  enabled?: boolean
}

/** The `allocation_resources` rows on this departure whose `refType` is `resource`. */
export function useDepartureFleetResources({
  slotId,
  enabled = true,
}: UseDepartureFleetResourcesOptions) {
  const client = useVoyantAvailabilityContext()
  return useQuery({
    ...getDepartureFleetResourcesQueryOptions(client, slotId),
    enabled: enabled && Boolean(slotId),
  })
}

export interface UseFleetResourcesOptions {
  kind?: string
  active?: boolean
  limit?: number
  enabled?: boolean
}

/** The global operated-resource registry, for the attach picker. */
export function useFleetResources({
  kind,
  active = true,
  limit = 100,
  enabled = true,
}: UseFleetResourcesOptions = {}) {
  const client = useVoyantAvailabilityContext()
  return useQuery({
    ...getFleetResourcesQueryOptions(client, { kind, active, limit }),
    enabled,
  })
}

export interface AttachDepartureResourceInput {
  /** `resources.id` of the fleet record to attach. */
  resourceId: string
  /** Departure-workspace kind; defaults server-side from the fleet record's kind. */
  kind?: string
  /** Defaults server-side to the fleet record's own capacity. */
  capacity?: number
  label?: string | null
  notes?: string | null
}

export interface DetachDepartureResourceInput {
  /** `resources.id` of the fleet record — not the `allocation_resources` id. */
  resourceId: string
  /** Remove the container's children (a coach's seats) with it. */
  cascade?: boolean
  /** Optimistic-concurrency precondition: the `updatedAt` the caller read. */
  expectedUpdatedAt?: string
}

export function useDepartureFleetResourceMutation(slotId: string) {
  const { baseUrl, fetcher } = useVoyantAvailabilityContext()
  const queryClient = useQueryClient()
  // The conflicts and fleet-resource keys are children of `slotAllocation`, so
  // one prefix invalidation refreshes the manifest, the attached fleet list and
  // the conflicts projection together.
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: availabilityQueryKeys.slotAllocation(slotId) })
    await queryClient.invalidateQueries({
      queryKey: availabilityQueryKeys.slotAllocationAuditLog(slotId),
    })
  }

  const attach = useMutation({
    mutationFn: async (input: AttachDepartureResourceInput) => {
      const { data } = await fetchWithValidation(
        `${slotAvailabilityPath(slotId)}/allocation/fleet-resources`,
        departureResourceLinkResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: invalidate,
  })

  const detach = useMutation({
    mutationFn: async ({
      resourceId,
      cascade,
      expectedUpdatedAt,
    }: DetachDepartureResourceInput) => {
      const params = new URLSearchParams()
      if (cascade !== undefined) params.set("cascade", String(cascade))
      if (expectedUpdatedAt !== undefined) params.set("expectedUpdatedAt", expectedUpdatedAt)
      const qs = params.toString()
      const { data } = await fetchWithValidation(
        `${slotAvailabilityPath(slotId)}/allocation/fleet-resources/${encodeURIComponent(resourceId)}${qs ? `?${qs}` : ""}`,
        departureResourceDetachResponse,
        { baseUrl, fetcher },
        { method: "DELETE" },
      )
      return data
    },
    onSuccess: invalidate,
  })

  return { attach, detach }
}

export interface BatchAssignTravelerAllocationsInput {
  kind: string
  assignments: BatchAllocationAssignment[]
}

/**
 * Place a set of travelers in one transaction. Either every assignment lands or
 * none does, so a sharing group can never end up half-placed the way N
 * sequential `PATCH .../travelers/{id}` calls could leave it.
 */
export function useBatchAssignTravelerAllocationsMutation(slotId: string) {
  const { baseUrl, fetcher } = useVoyantAvailabilityContext()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: BatchAssignTravelerAllocationsInput) => {
      const { data } = await fetchWithValidation(
        `${slotAvailabilityPath(slotId)}/allocation/travelers/assignments`,
        batchAssignAllocationsResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: availabilityQueryKeys.slotAllocation(slotId),
      })
      await queryClient.invalidateQueries({
        queryKey: availabilityQueryKeys.slotAllocationAuditLog(slotId),
      })
    },
  })
}

/**
 * Compute the auto-allocation plan without writing it. A mutation rather than a
 * query because it is a `POST` the operator triggers deliberately and whose
 * result must not be served from cache after the manifest moved underneath it.
 */
export function useAutoAllocatePreviewMutation(slotId: string) {
  const { baseUrl, fetcher } = useVoyantAvailabilityContext()

  return useMutation({
    mutationFn: async (input: { kind: string }) => {
      const { data } = await fetchWithValidation(
        `${slotAvailabilityPath(slotId)}/allocation/auto-allocate/preview`,
        allocationPlanPreviewResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input) },
      )
      return data
    },
  })
}

/** Which CSV the operator asked for. */
export type AllocationExportVariant = "passengers" | "resources"

export interface AllocationExportInput {
  variant: AllocationExportVariant
  /**
   * Resource kind for the `resources` variant. `vehicle_seat` produces the
   * coach seating manifest; the default `room` produces the rooming list.
   */
  kind?: string
}

const CSV_MIME = "text/csv;charset=utf-8"

/**
 * Download an allocation CSV. The endpoints have existed since the allocation
 * routes shipped but nothing in this package ever called them, so the export
 * strings had no consumer. Goes through the configured fetcher (which carries
 * the session credentials) rather than a bare anchor `href`.
 */
export function useAllocationExportMutation(slotId: string) {
  const { baseUrl, fetcher } = useVoyantAvailabilityContext()

  return useMutation({
    mutationFn: async ({ variant, kind = "room" }: AllocationExportInput) => {
      const path =
        variant === "passengers"
          ? `${slotAvailabilityPath(slotId)}/allocation/export-passengers`
          : `${slotAvailabilityPath(slotId)}/allocation/export-rooming-list?kind=${encodeURIComponent(kind)}`
      const response = await fetcher(joinUrl(baseUrl, path))
      if (!response.ok) {
        throw new Error(`Allocation export failed: ${response.status} ${response.statusText}`)
      }
      const csv = await response.text()
      const filename =
        filenameFromContentDisposition(response.headers.get("content-disposition")) ??
        `${variant}-${slotId}.csv`
      return { csv, filename }
    },
  })
}

/**
 * Hand a CSV body to the browser as a download. Split from the mutation so the
 * transport stays testable in a DOM-free environment.
 */
export function downloadCsvDocument(input: { csv: string; filename: string }): void {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return
  const url = URL.createObjectURL(new Blob([input.csv], { type: CSV_MIME }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = input.filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (encoded) return decodeURIComponent(encoded.trim())
  const quoted = header.match(/filename="([^"]+)"/i)?.[1]
  if (quoted) return quoted
  return header.match(/filename=([^;]+)/i)?.[1]?.trim() ?? null
}

function joinUrl(baseUrl: string, path: string): string {
  const trimmedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
  const trimmedPath = path.startsWith("/") ? path : `/${path}`
  return `${trimmedBase}${trimmedPath}`
}
