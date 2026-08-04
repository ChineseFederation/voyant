/**
 * Allocation conflicts — the one server-side answer to "what is wrong with this
 * departure's rooming / seating plan".
 *
 * Modelled on `service-departure-issues.ts`: the rules are **pure** over facts a
 * loader already gathered, every conflict carries a **stable machine code** the
 * UI translates, and nothing here repairs anything. Building it server-side is
 * the point — the workspace UI, the CSV export and the printed manifest were
 * each free to invent their own notion of "conflict", and the only client-side
 * implementation that existed (`buildValidationIssues` in `operations-react`)
 * had zero call sites and covered three of the seven cases.
 *
 * Never rename a code; add a new one.
 *
 * Severities follow the departure-issues convention:
 *   - `critical` — the plan cannot physically be operated as it stands.
 *   - `warning`  — the plan will operate, but a reconciliation is outstanding.
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { isActiveBookingStatus } from "./booking-statuses.js"
import {
  type AllocationConstraintCode,
  bedPreferenceSatisfied,
  type ConstraintResource,
  type ConstraintTraveler,
  evaluateOccupancyConstraints,
  isAccessibleResource,
  isSeatShapedKind,
} from "./room-constraints.js"
import {
  type AllocationManifestTraveler,
  getSlotAllocationManifest,
  type SlotAllocationManifest,
} from "./service-allocation.js"

export type AllocationConflictSeverity = "critical" | "warning"

/** Stable allocation-conflict codes. Never rename one; add a new code instead. */
export type AllocationConflictCode =
  /** A traveler on a live booking holds no resource of this kind. */
  | "traveler_unassigned"
  /** A resource with capacity > 1 holds more travelers than it can. */
  | "resource_over_capacity"
  /** A capacity-1 resource (a seat) is held by more than one traveler. */
  | "duplicate_assignment"
  /** A traveler who flagged accessibility needs sits in a resource not marked accessible. */
  | "inaccessible_assignment"
  /** A traveler sits in a resource belonging to an option or unit they did not buy. */
  | "incompatible_assignment"
  /** A sharing group is larger than the resource it can be placed in. */
  | "oversubscribed_sharing_group"
  /** A sharing group's members are spread across more than one resource. */
  | "split_sharing_group"
  /**
   * A room is held by fewer travelers than the minimum occupancy it was let at
   * — a bed the operator has paid for and left empty, or a single supplement
   * nobody has billed. Only reportable since #4036 gave positions an
   * `occupancy_min`; before that a triple sold to two looked exactly like a
   * double sold to two.
   */
  | "under_occupied_resource"
  /** A traveler's stated bed preference cannot be met by the room they hold. */
  | "bed_preference_unmet"
  /** A room would hold a child with no accompanying adult. */
  | "unaccompanied_minor"
  /** A child shares a room with adults from another booking and another sharing group. */
  | "adult_child_mixing"

export type AllocationConflictSubjectType =
  | "traveler"
  | "allocation_resource"
  | "sharing_group"
  | "departure"

export interface AllocationConflict {
  code: AllocationConflictCode
  severity: AllocationConflictSeverity
  /** Resource kind the conflict was evaluated for ("room", "vehicle_seat", …). */
  kind: string
  subjectType: AllocationConflictSubjectType
  /** Id of the row the conflict is about; the slot id for departure-level rollups. */
  subjectId: string
  /** How many rows of `subjectType` this conflict covers. */
  count: number
  /** Travelers implicated, capped. Empty for departure-level rollups. */
  travelerIds: string[]
  /** Resources implicated, capped. */
  resourceIds: string[]
  /** English fallback for consumers with no message catalogue. */
  message: string
}

/** How many individually-named subjects one code emits before it rolls up. */
const SUBJECT_SAMPLE_LIMIT = 100

export interface AllocationConflictResource {
  id: string
  kind: string
  /** Maximum occupancy. */
  capacity: number
  label: string | null
  refType: string | null
  refId: string | null
  parentId: string | null
  flags: Record<string, unknown>
  occupancyMin?: number | null
  roomTypeId?: string | null
  bedConfiguration?: string | null
  accessible?: boolean | null
  minAge?: number | null
  maxAge?: number | null
}

export interface AllocationConflictInput {
  slotId: string
  kind: string
  /** Travelers on live bookings only. The caller filters; the evaluator does not. */
  travelers: readonly AllocationManifestTraveler[]
  /** Every resource on the slot, of every kind. Filtering to `kind` is the evaluator's job. */
  resources: readonly AllocationConflictResource[]
}

/**
 * Evaluate every rule against already-loaded facts. Pure: same facts in, same
 * conflicts out, in a stable order (critical first, then code, then subject).
 */
export function evaluateAllocationConflicts(input: AllocationConflictInput): AllocationConflict[] {
  const { kind, slotId } = input
  const kindResources = input.resources.filter((resource) => resource.kind === kind)
  const resourceById = new Map(kindResources.map((resource) => [resource.id, resource]))
  const conflicts: AllocationConflict[] = []

  const occupants = new Map<string, AllocationManifestTraveler[]>()
  const unassigned: AllocationManifestTraveler[] = []
  for (const traveler of input.travelers) {
    const resourceId = traveler.allocations[kind]
    const resource = resourceId ? resourceById.get(resourceId) : undefined
    if (!resource) {
      unassigned.push(traveler)
      continue
    }
    const list = occupants.get(resource.id) ?? []
    list.push(traveler)
    occupants.set(resource.id, list)
  }

  pushTravelerConflicts(conflicts, {
    code: "traveler_unassigned",
    severity: "warning",
    kind,
    slotId,
    travelers: unassigned,
    message: "Traveler has not been assigned a place on this departure.",
    rollupMessage: "Further travelers have not been assigned a place on this departure.",
  })

  for (const resource of kindResources) {
    const held = occupants.get(resource.id) ?? []
    if (held.length <= resource.capacity) continue
    // Capacity-1 containers (a seat) get their own code: "two people in seat 12A"
    // is a different operator conversation from "a triple holds four". The two
    // codes are deliberately disjoint so a consumer can render either alone.
    const duplicate = resource.capacity === 1
    conflicts.push({
      code: duplicate ? "duplicate_assignment" : "resource_over_capacity",
      severity: "critical",
      kind,
      subjectType: "allocation_resource",
      subjectId: resource.id,
      count: held.length - resource.capacity,
      travelerIds: held.slice(0, SUBJECT_SAMPLE_LIMIT).map((traveler) => traveler.id),
      resourceIds: [resource.id],
      message: duplicate
        ? "More than one traveler holds this seat."
        : "More travelers are assigned to this resource than it can hold.",
    })
  }

  const inaccessible: AllocationManifestTraveler[] = []
  const incompatible: AllocationManifestTraveler[] = []
  const bedPreferenceUnmet: AllocationManifestTraveler[] = []
  const inaccessibleResourceIds = new Set<string>()
  const incompatibleResourceIds = new Set<string>()
  const bedPreferenceResourceIds = new Set<string>()
  for (const [resourceId, held] of occupants) {
    const resource = resourceById.get(resourceId)
    if (!resource) continue
    for (const traveler of held) {
      if (traveler.hasAccessibilityNeeds && !isAccessibleResource(resource)) {
        inaccessible.push(traveler)
        inaccessibleResourceIds.add(resourceId)
      }
      if (isIncompatibleAssignment(traveler, resource)) {
        incompatible.push(traveler)
        incompatibleResourceIds.add(resourceId)
      }
      if (
        !isSeatShapedKind(resource.kind) &&
        !bedPreferenceSatisfied(
          traveler.bedPreference,
          resource.bedConfiguration ?? null,
          resource.capacity,
        )
      ) {
        bedPreferenceUnmet.push(traveler)
        bedPreferenceResourceIds.add(resourceId)
      }
    }
  }

  // Room-level rules — the occupancy floor and the two child-supervision rules
  // — come from the shared `room-constraints.ts` evaluator, so a violation an
  // operator overrode on assignment still shows up here, on the CSV and on the
  // printed sheet rather than disappearing with the override.
  for (const resource of kindResources) {
    if (isSeatShapedKind(resource.kind)) continue
    const held = occupants.get(resource.id) ?? []
    if (held.length === 0) continue
    for (const roomViolation of evaluateOccupancyConstraints(
      toConstraintResource(resource),
      held.map(toConstraintTraveler),
    )) {
      const code = ROOM_VIOLATION_CODES[roomViolation.code]
      if (!code) continue
      conflicts.push({
        code,
        severity: roomViolation.severity === "blocking" ? "critical" : "warning",
        kind,
        subjectType: "allocation_resource",
        subjectId: resource.id,
        count:
          roomViolation.code === "occupancy_below_minimum"
            ? (resource.occupancyMin ?? 0) - held.length
            : (roomViolation.travelerIds?.length ?? held.length),
        travelerIds: (roomViolation.travelerIds ?? []).slice(0, SUBJECT_SAMPLE_LIMIT),
        resourceIds: [resource.id],
        message: roomViolation.message,
      })
    }
  }

  pushTravelerConflicts(conflicts, {
    code: "inaccessible_assignment",
    severity: "warning",
    kind,
    slotId,
    travelers: inaccessible,
    resourceIds: [...inaccessibleResourceIds],
    message:
      "Traveler flagged accessibility needs but is placed in a resource not marked accessible.",
    rollupMessage:
      "Further travelers flagged accessibility needs but are placed in resources not marked accessible.",
  })
  pushTravelerConflicts(conflicts, {
    code: "incompatible_assignment",
    severity: "critical",
    kind,
    slotId,
    travelers: incompatible,
    resourceIds: [...incompatibleResourceIds],
    message:
      "Traveler is placed in a resource belonging to an option, unit or room type they did not buy.",
    rollupMessage:
      "Further travelers are placed in resources belonging to options, units or room types they did not buy.",
  })
  pushTravelerConflicts(conflicts, {
    code: "bed_preference_unmet",
    severity: "warning",
    kind,
    slotId,
    travelers: bedPreferenceUnmet,
    resourceIds: [...bedPreferenceResourceIds],
    message: "The room this traveler holds cannot meet their stated bed preference.",
    rollupMessage: "Further travelers hold rooms that cannot meet their stated bed preference.",
  })

  const largestCapacity = kindResources.reduce(
    (largest, resource) => Math.max(largest, resource.capacity),
    0,
  )
  for (const group of sharingGroups(input.travelers, kind)) {
    // A group is oversubscribed when it cannot fit where it sits, or — when it
    // has not been placed yet — cannot fit anywhere on this departure.
    const target = group.placedResourceIds.length === 1 ? group.placedResourceIds[0] : null
    const targetCapacity = target
      ? (resourceById.get(target)?.capacity ?? 0)
      : group.placedResourceIds.length === 0
        ? largestCapacity
        : null
    if (
      targetCapacity !== null &&
      kindResources.length > 0 &&
      group.travelerIds.length > targetCapacity
    ) {
      conflicts.push({
        code: "oversubscribed_sharing_group",
        severity: "critical",
        kind,
        subjectType: "sharing_group",
        subjectId: group.id,
        count: group.travelerIds.length - targetCapacity,
        travelerIds: group.travelerIds.slice(0, SUBJECT_SAMPLE_LIMIT),
        resourceIds: target ? [target] : [],
        message: "This sharing group has more members than the resource it can be placed in holds.",
      })
    }

    if (group.distinctPlacements > 1) {
      conflicts.push({
        code: "split_sharing_group",
        severity: "warning",
        kind,
        subjectType: "sharing_group",
        subjectId: group.id,
        count: group.distinctPlacements,
        travelerIds: group.travelerIds.slice(0, SUBJECT_SAMPLE_LIMIT),
        resourceIds: group.placedResourceIds,
        message: "This sharing group's members are split across more than one resource.",
      })
    }
  }

  return conflicts.sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      a.code.localeCompare(b.code) ||
      a.subjectId.localeCompare(b.subjectId),
  )
}

interface TravelerConflictSpec {
  code: AllocationConflictCode
  severity: AllocationConflictSeverity
  kind: string
  slotId: string
  travelers: readonly AllocationManifestTraveler[]
  resourceIds?: readonly string[]
  message: string
  rollupMessage: string
}

/**
 * Emit one row per traveler up to the sample cap, then a single departure-level
 * rollup for the remainder, so a 400-pax coach still returns a bounded body.
 */
function pushTravelerConflicts(conflicts: AllocationConflict[], spec: TravelerConflictSpec): void {
  for (const traveler of spec.travelers.slice(0, SUBJECT_SAMPLE_LIMIT)) {
    conflicts.push({
      code: spec.code,
      severity: spec.severity,
      kind: spec.kind,
      subjectType: "traveler",
      subjectId: traveler.id,
      count: 1,
      travelerIds: [traveler.id],
      resourceIds: spec.resourceIds ? [...spec.resourceIds] : [],
      message: spec.message,
    })
  }
  const unnamed = spec.travelers.length - SUBJECT_SAMPLE_LIMIT
  if (unnamed > 0) {
    conflicts.push({
      code: spec.code,
      severity: spec.severity,
      kind: spec.kind,
      subjectType: "departure",
      subjectId: spec.slotId,
      count: unnamed,
      travelerIds: [],
      resourceIds: [],
      message: spec.rollupMessage,
    })
  }
}

interface SharingGroupFacts {
  id: string
  travelerIds: string[]
  /** Distinct resources the group's placed members occupy. */
  placedResourceIds: string[]
  /** Distinct placements including "not placed", so a half-placed family counts as split. */
  distinctPlacements: number
}

function sharingGroups(
  travelers: readonly AllocationManifestTraveler[],
  kind: string,
): SharingGroupFacts[] {
  const byGroup = new Map<string, { travelerIds: string[]; placements: Set<string> }>()
  for (const traveler of travelers) {
    const groupId = traveler.sharingGroupId
    if (!groupId) continue
    const bucket = byGroup.get(groupId) ?? { travelerIds: [], placements: new Set<string>() }
    bucket.travelerIds.push(traveler.id)
    bucket.placements.add(traveler.allocations[kind] ?? "")
    byGroup.set(groupId, bucket)
  }
  return [...byGroup]
    .map(([id, bucket]) => ({
      id,
      travelerIds: bucket.travelerIds,
      placedResourceIds: [...bucket.placements].filter(Boolean),
      distinctPlacements: bucket.placements.size,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * A resource that names the option unit or product option it was materialised
 * for may only hold travelers who bought that unit/option. Resources with no
 * such ref hold anyone — most departures never key their rooms by unit.
 */
function isIncompatibleAssignment(
  traveler: AllocationManifestTraveler,
  resource: AllocationConflictResource,
): boolean {
  if (resource.refType === "option_unit" && resource.refId && traveler.optionUnitId) {
    if (resource.refId !== traveler.optionUnitId) return true
  }
  const templateOptionId = resource.flags.templateOptionId
  if (typeof templateOptionId === "string" && traveler.optionId) {
    if (templateOptionId !== traveler.optionId) return true
  }
  // Room type joined the rule in #4036: a position materialized for a specific
  // accommodations room type may only hold travelers who booked that type.
  // Positions that name no room type still hold anyone.
  if (resource.roomTypeId && traveler.roomTypeId && resource.roomTypeId !== traveler.roomTypeId) {
    return true
  }
  return false
}

/** Room-level constraint code -> the conflict code it is reported under. */
const ROOM_VIOLATION_CODES: Partial<Record<AllocationConstraintCode, AllocationConflictCode>> = {
  occupancy_below_minimum: "under_occupied_resource",
  unaccompanied_minor: "unaccompanied_minor",
  adult_child_mixing: "adult_child_mixing",
}

function toConstraintResource(resource: AllocationConflictResource): ConstraintResource {
  return {
    id: resource.id,
    kind: resource.kind,
    capacity: resource.capacity,
    occupancyMin: resource.occupancyMin ?? null,
    roomTypeId: resource.roomTypeId ?? null,
    bedConfiguration: resource.bedConfiguration ?? null,
    accessible: resource.accessible ?? false,
    minAge: resource.minAge ?? null,
    maxAge: resource.maxAge ?? null,
    refType: resource.refType,
    refId: resource.refId,
    flags: resource.flags,
  }
}

function toConstraintTraveler(traveler: AllocationManifestTraveler): ConstraintTraveler {
  return {
    id: traveler.id,
    bookingId: traveler.bookingId,
    sharingGroupId: traveler.sharingGroupId,
    travelerCategory: traveler.travelerCategory,
    optionId: traveler.optionId,
    optionUnitId: traveler.optionUnitId,
    roomTypeId: traveler.roomTypeId,
    bedPreference: traveler.bedPreference,
    hasAccessibilityNeeds: traveler.hasAccessibilityNeeds,
  }
}

function severityRank(severity: AllocationConflictSeverity): number {
  return severity === "critical" ? 0 : 1
}

/**
 * Load the departure's manifest and evaluate conflicts for one resource kind.
 * Returns `null` when the slot does not exist.
 *
 * Only travelers on live bookings are considered — a cancelled booking's
 * traveler is not a rooming problem, it is a booking problem, and
 * `service-departure-issues.ts` already reports it.
 */
export async function getSlotAllocationConflicts(
  db: PostgresJsDatabase,
  slotId: string,
  options: { kind?: string; manifest?: SlotAllocationManifest } = {},
): Promise<AllocationConflict[] | null> {
  const kind = options.kind ?? "room"
  const manifest = options.manifest ?? (await getSlotAllocationManifest(db, slotId))
  if (!manifest) return null
  return evaluateAllocationConflicts({
    slotId,
    kind,
    travelers: manifest.bookings.flatMap((booking) =>
      isActiveBookingStatus(booking.status) ? booking.travelers : [],
    ),
    resources: manifest.resources.map((resource) => ({
      id: resource.id,
      kind: resource.kind,
      capacity: resource.capacity,
      label: resource.label,
      refType: resource.refType,
      refId: resource.refId,
      parentId: resource.parentId,
      flags: resource.flags ?? {},
      occupancyMin: resource.occupancyMin,
      roomTypeId: resource.roomTypeId,
      bedConfiguration: resource.bedConfiguration,
      accessible: resource.accessible,
      minAge: resource.minAge,
      maxAge: resource.maxAge,
    })),
  })
}
