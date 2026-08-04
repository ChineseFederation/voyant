import { listResponseSchema } from "@voyant-travel/types"
import { z } from "zod"

/**
 * Wire schemas for the allocation workspace: the resource row every view reads,
 * plus the departure-planning legs — the conflicts projection, the dry-run
 * auto-allocation plan, the atomic batch placement and the fleet-resource link.
 *
 * Split out of `schemas.ts`, which re-exports it, so consumers still import
 * everything from `@voyant-travel/operations-react/availability`. This file is
 * the leaf of the pair: `schemas.ts` reads `allocationResourceSchema` from here
 * rather than the other way round, because an `export *` is instantiated before
 * the re-exporting module's own body runs — the reverse direction leaves the
 * envelope helpers in the temporal dead zone.
 */

const paginatedEnvelope = listResponseSchema
const singleEnvelope = <T extends z.ZodTypeAny>(item: T) => z.object({ data: item })

export const allocationResourceSchema = z.object({
  id: z.string(),
  slotId: z.string(),
  kind: z.string(),
  refType: z.string().nullable(),
  refId: z.string().nullable(),
  label: z.string().nullable(),
  capacity: z.number().int(),
  flags: z.record(z.string(), z.unknown()),
  parentId: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
})

export type AllocationResource = z.infer<typeof allocationResourceSchema>

/**
 * The departure's allocation conflicts (`GET /slots/{id}/allocation/conflicts`).
 *
 * `code` deliberately stays an open `string`: the server owns the vocabulary and
 * may ship a code this client has never heard of. Consumers translate the codes
 * they know and fall back to the server's English `message` for the rest, the
 * same contract `DepartureIssueList` already follows.
 */
export const ALLOCATION_CONFLICT_CODES = [
  "traveler_unassigned",
  "resource_over_capacity",
  "duplicate_assignment",
  "inaccessible_assignment",
  "incompatible_assignment",
  "oversubscribed_sharing_group",
  "split_sharing_group",
] as const

/** The codes this client release knows how to localize. */
export type AllocationConflictCode = (typeof ALLOCATION_CONFLICT_CODES)[number]

export const allocationConflictSeveritySchema = z.enum(["critical", "warning"])
export type AllocationConflictSeverity = z.infer<typeof allocationConflictSeveritySchema>

export const allocationConflictSubjectTypeSchema = z.enum([
  "traveler",
  "allocation_resource",
  "sharing_group",
  "departure",
])
export type AllocationConflictSubjectType = z.infer<typeof allocationConflictSubjectTypeSchema>

export const allocationConflictSchema = z.object({
  code: z.string(),
  severity: allocationConflictSeveritySchema,
  kind: z.string(),
  subjectType: allocationConflictSubjectTypeSchema,
  subjectId: z.string(),
  count: z.number().int(),
  travelerIds: z.array(z.string()),
  resourceIds: z.array(z.string()),
  /** English fallback for a code with no catalogue entry. Never the primary copy. */
  message: z.string(),
})

export type AllocationConflict = z.infer<typeof allocationConflictSchema>

export const allocationConflictsResponse = z.object({
  data: z.array(allocationConflictSchema),
})

/** One capacity violation an auto-allocation plan would create. */
export const allocationCapacityViolationSchema = z.object({
  slotId: z.string(),
  resourceId: z.string(),
  kind: z.string(),
  capacity: z.number().int(),
  existingAssigned: z.number().int(),
  requested: z.number().int(),
})

export type AllocationCapacityViolation = z.infer<typeof allocationCapacityViolationSchema>

export const allocationPlanEntrySchema = z.object({
  travelerId: z.string(),
  travelerName: z.string(),
  bookingId: z.string(),
  bookingNumber: z.string(),
  sharingGroupId: z.string().nullable(),
  resourceId: z.string(),
  resourceLabel: z.string().nullable(),
  currentResourceId: z.string().nullable(),
  unchanged: z.boolean(),
})

export type AllocationPlanEntry = z.infer<typeof allocationPlanEntrySchema>

/** The uncommitted auto-allocation plan (`POST .../auto-allocate/preview`). */
export const allocationPlanPreviewSchema = z.object({
  kind: z.string(),
  assigned: z.number().int(),
  skipped: z.number().int(),
  entries: z.array(allocationPlanEntrySchema),
  violations: z.array(allocationCapacityViolationSchema),
})

export type AllocationPlanPreview = z.infer<typeof allocationPlanPreviewSchema>
export const allocationPlanPreviewResponse = singleEnvelope(allocationPlanPreviewSchema)

/**
 * One traveler's placement inside an atomic batch. `expectedResourceId` is the
 * optimistic-concurrency precondition — omit it to write unconditionally, pass
 * `null` to require the traveler to be currently unassigned.
 */
export interface BatchAllocationAssignment {
  travelerId: string
  resourceId: string | null
  expectedResourceId?: string | null
}

export const batchAssignAllocationsResultSchema = z.object({
  kind: z.string(),
  assigned: z.number().int(),
  unassigned: z.number().int(),
  unchanged: z.number().int(),
  travelerIds: z.array(z.string()),
})

export type BatchAssignAllocationsResult = z.infer<typeof batchAssignAllocationsResultSchema>
export const batchAssignAllocationsResponse = singleEnvelope(batchAssignAllocationsResultSchema)

/** The departure container + fleet commitment written by an attach. */
export const departureResourceLinkSchema = z.object({
  resource: allocationResourceSchema,
  assignmentId: z.string(),
  /** `false` when the resource was already attached and the link was returned as-is. */
  created: z.boolean(),
})

export type DepartureResourceLink = z.infer<typeof departureResourceLinkSchema>
export const departureResourceLinkResponse = singleEnvelope(departureResourceLinkSchema)

export const departureResourceDetachSchema = z.object({
  removedResourceIds: z.array(z.string()),
  assignmentId: z.string().nullable(),
})

export type DepartureResourceDetach = z.infer<typeof departureResourceDetachSchema>
export const departureResourceDetachResponse = singleEnvelope(departureResourceDetachSchema)

export const departureFleetResourcesResponse = z.object({
  data: z.array(allocationResourceSchema),
})

/**
 * A global fleet `resources` record — the coach itself, not the departure's
 * container for it. `resourceSummarySchema` above is the id/name projection the
 * slot detail page uses; the picker needs the kind, code and capacity too so the
 * operator recognises the vehicle and the attach can default its capacity.
 */
export const fleetResourceSchema = z.object({
  id: z.string(),
  supplierId: z.string().nullable(),
  facilityId: z.string().nullable(),
  kind: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  capacity: z.number().int().nullable(),
  active: z.boolean(),
  notes: z.string().nullable(),
})

export type FleetResource = z.infer<typeof fleetResourceSchema>
export const fleetResourceListResponse = paginatedEnvelope(fleetResourceSchema)
