import { isActiveBookingStatus } from "./booking-statuses.js"
import {
  bedPreferenceSatisfied,
  type ConstraintResource,
  isAccessibleResource,
  isAdultCategory,
  isChildCategory,
  resourceAdmitsAdults,
  resourceAdmitsChildren,
} from "./room-constraints.js"

export interface AllocatorTraveler {
  id: string
  bookingId: string
  bookingStatus: string
  isLeadTraveler: boolean
  sharingGroupId: string | null
  hasAccessibilityNeeds: boolean
  existingAllocationId: string | null
  optionId?: string | null
  optionUnitId?: string | null
  optionUnitCode?: string | null
  /** `single` | `twin` | `double` | `no-preference`. */
  bedPreference?: string | null
  roomTypeId?: string | null
  /** `adult` | `child` | `infant` | `senior` | `other`. */
  travelerCategory?: string | null
}

export interface AllocatorResource {
  id: string
  kind: string
  capacity: number
  flags: Record<string, unknown>
  parentId: string | null
  refType?: string | null
  refId?: string | null
  label?: string | null
  row?: number
  column?: string
  position?: "window" | "aisle" | "middle"
  occupancyMin?: number | null
  roomTypeId?: string | null
  bedConfiguration?: string | null
  accessible?: boolean
  minAge?: number | null
  maxAge?: number | null
}

/**
 * A constraint the planner gave up in order to place a group at all.
 *
 * Reported rather than silently applied. Before #4036 accessibility and
 * option/unit matching were only *sort keys*, so a group whose preferred room
 * was full quietly landed somewhere incompatible and nothing said so — the
 * conflicts projection then reported a conflict the planner had itself created.
 */
export type AllocationRelaxation =
  | "bed_preference"
  | "room_type"
  | "option"
  | "option_unit"
  | "age_band"
  | "accessibility"

/**
 * The order the planner gives constraints up in, least costly first.
 *
 * A bed preference is a request. A room type is a supplier-side label. The
 * option and the option unit are what the traveler actually bought and paid
 * for. The age band and accessibility are duty-of-care, so they are the last
 * two the planner will trade away — and when it does, it says so.
 */
const RELAXATION_ORDER: readonly AllocationRelaxation[] = [
  "bed_preference",
  "room_type",
  "option",
  "option_unit",
  "age_band",
  "accessibility",
]

/** Why a group could not be placed at all. */
export type AllocationUnplacedReason =
  /** No position of this kind exists on the departure. */
  | "no_resources"
  /** Every position is full, or none is large enough for the group. */
  | "no_capacity"

export interface AllocationUnplacedGroup {
  /** Stable planner-local group key (`r:`/`sg:`/`b:` prefixed). */
  groupKey: string
  /** The sharing group the members belong to, when they were grouped by one. */
  sharingGroupId: string | null
  travelerIds: string[]
  reason: AllocationUnplacedReason
  /** Largest free block of capacity the planner could find, for the operator's benefit. */
  largestFreeCapacity: number
}

export interface AllocationCompromise {
  groupKey: string
  sharingGroupId: string | null
  travelerIds: string[]
  resourceId: string
  relaxed: AllocationRelaxation[]
}

export interface AllocationPlan {
  assignments: Array<{ travelerId: string; resourceId: string }>
  skipped: number
  /**
   * Groups the planner could not place, each with a reason. `skipped` stays the
   * traveler count for callers that only render a number; this is the same fact
   * with the sharing group and the reason attached, so "12 skipped" can finally
   * be read as "this party of 3 needs a triple and none is free".
   */
  unplaced: AllocationUnplacedGroup[]
  /** Groups placed only after a constraint was relaxed. */
  compromises: AllocationCompromise[]
}

interface InternalGroup {
  key: string
  travelerIds: string[]
  needsAccessibility: boolean
  leadTravelerId: string | null
  sharingGroupId: string | null
  optionIds: Set<string>
  optionUnitIds: Set<string>
  optionUnitCodes: Set<string>
  roomTypeIds: Set<string>
  bedPreferences: Set<string>
  hasChildren: boolean
  hasAdults: boolean
}

function activeTravelers(travelers: AllocatorTraveler[]): AllocatorTraveler[] {
  return travelers.filter((traveler) => isActiveBookingStatus(traveler.bookingStatus))
}

function groupTravelers(travelers: AllocatorTraveler[]): Map<string, InternalGroup> {
  const groups = new Map<string, InternalGroup>()

  for (const traveler of travelers) {
    const groupKey = traveler.existingAllocationId
      ? `r:${traveler.existingAllocationId}`
      : traveler.sharingGroupId
        ? `sg:${traveler.sharingGroupId}`
        : `b:${traveler.bookingId}`
    const group = groups.get(groupKey) ?? {
      key: groupKey,
      travelerIds: [],
      needsAccessibility: false,
      leadTravelerId: null,
      sharingGroupId: traveler.sharingGroupId,
      optionIds: new Set<string>(),
      optionUnitIds: new Set<string>(),
      optionUnitCodes: new Set<string>(),
      roomTypeIds: new Set<string>(),
      bedPreferences: new Set<string>(),
      hasChildren: false,
      hasAdults: false,
    }
    group.travelerIds.push(traveler.id)
    if (traveler.hasAccessibilityNeeds) group.needsAccessibility = true
    if (traveler.isLeadTraveler && !group.leadTravelerId) group.leadTravelerId = traveler.id
    if (traveler.optionId) group.optionIds.add(traveler.optionId)
    if (traveler.optionUnitId) group.optionUnitIds.add(traveler.optionUnitId)
    if (traveler.optionUnitCode) group.optionUnitCodes.add(traveler.optionUnitCode)
    if (traveler.roomTypeId) group.roomTypeIds.add(traveler.roomTypeId)
    if (traveler.bedPreference && traveler.bedPreference !== "no-preference") {
      group.bedPreferences.add(traveler.bedPreference)
    }
    if (isChildCategory(traveler.travelerCategory)) group.hasChildren = true
    if (isAdultCategory(traveler.travelerCategory)) group.hasAdults = true
    groups.set(group.key, group)
  }

  return groups
}

function groupUnitMatchScore(resource: AllocatorResource, group: InternalGroup): number {
  let score = 0
  const optionId = singleSetValue(group.optionIds)
  if (optionId && resource.flags.templateOptionId === optionId) score += 4

  const optionUnitId = singleSetValue(group.optionUnitIds)
  if (optionUnitId && resource.refType === "option_unit" && resource.refId === optionUnitId) {
    score += 2
  }

  const optionUnitCode = singleSetValue(group.optionUnitCodes)
  if (optionUnitCode && labelStartsWithUnitCode(resource.label, optionUnitCode)) score += 1

  const roomTypeId = singleSetValue(group.roomTypeIds)
  if (roomTypeId && resource.roomTypeId === roomTypeId) score += 3

  return score
}

function singleSetValue(values: Set<string>): string | null {
  return values.size === 1 ? ([...values][0] ?? null) : null
}

function labelStartsWithUnitCode(label: string | null | undefined, code: string): boolean {
  const prefix = normalizeUnitCodePrefix(code)
  if (!prefix || !label) return false
  return label
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9]+/, "")
    .startsWith(prefix)
}

function normalizeUnitCodePrefix(code: string): string | null {
  return (
    code
      .trim()
      .toLowerCase()
      .split(/[^a-z0-9]+/)[0] ?? null
  )
}

/**
 * Does this position satisfy one constraint for this group?
 *
 * Each predicate mirrors the corresponding rule in `room-constraints.ts`, so the
 * planner never proposes a placement the conflicts projection would immediately
 * flag. Positions that declare nothing (no unit ref, no room type, no bed
 * configuration) satisfy every constraint — most departures never key their
 * rooms that finely, and reading "unspecified" as "incompatible" would leave
 * every one of them unplaceable.
 *
 * The **label prefix** heuristic in `groupUnitMatchScore` is deliberately NOT a
 * constraint. "DBL #1" is a name an operator typed, not something anyone
 * contracted, so it may steer a choice but must never block one or be reported
 * as a compromise.
 */
function satisfies(
  constraint: AllocationRelaxation,
  resource: AllocatorResource,
  group: InternalGroup,
): boolean {
  switch (constraint) {
    case "accessibility":
      return !group.needsAccessibility || isAccessibleResource(resource)
    case "option_unit": {
      const optionUnitId = singleSetValue(group.optionUnitIds)
      if (!optionUnitId) return true
      if (resource.refType !== "option_unit" || !resource.refId) return true
      return resource.refId === optionUnitId
    }
    case "option": {
      const optionId = singleSetValue(group.optionIds)
      if (!optionId) return true
      const templateOptionId = resource.flags.templateOptionId
      if (typeof templateOptionId !== "string") return true
      return templateOptionId === optionId
    }
    case "room_type": {
      const roomTypeId = singleSetValue(group.roomTypeIds)
      if (!roomTypeId || !resource.roomTypeId) return true
      return resource.roomTypeId === roomTypeId
    }
    case "age_band": {
      const asConstraint = toConstraintResource(resource)
      if (group.hasChildren && !resourceAdmitsChildren(asConstraint)) return false
      if (group.hasAdults && !resourceAdmitsAdults(asConstraint)) return false
      return true
    }
    case "bed_preference": {
      const preference = singleSetValue(group.bedPreferences)
      if (!preference) return true
      return bedPreferenceSatisfied(preference, resource.bedConfiguration, resource.capacity)
    }
  }
}

function toConstraintResource(resource: AllocatorResource): ConstraintResource {
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
    refType: resource.refType ?? null,
    refId: resource.refId ?? null,
    flags: resource.flags,
  }
}

export function planRoomAllocation(
  travelers: AllocatorTraveler[],
  resources: AllocatorResource[],
): AllocationPlan {
  const active = activeTravelers(travelers)
  const groups = groupTravelers(active)

  const occupancy = new Map<string, number>()
  for (const resource of resources) occupancy.set(resource.id, 0)

  const assignmentMap = new Map<string, string>()
  for (const traveler of active) {
    if (!traveler.existingAllocationId) continue
    const target = resources.find((resource) => resource.id === traveler.existingAllocationId)
    if (!target) continue
    occupancy.set(target.id, (occupancy.get(target.id) ?? 0) + 1)
    assignmentMap.set(traveler.id, target.id)
  }

  const sortedGroups = [...groups.values()].sort(
    (left, right) => right.travelerIds.length - left.travelerIds.length,
  )

  let skipped = 0
  const unplaced: AllocationUnplacedGroup[] = []
  const compromises: AllocationCompromise[] = []

  for (const group of sortedGroups) {
    const allInOne = group.travelerIds.every(
      (travelerId) =>
        assignmentMap.has(travelerId) &&
        group.travelerIds.every(
          (otherTravelerId) => assignmentMap.get(otherTravelerId) === assignmentMap.get(travelerId),
        ),
    )
    if (allInOne) continue

    const freeCapacity = (resource: AllocatorResource) =>
      resource.capacity - (occupancy.get(resource.id) ?? 0)

    const sortedResources = [...resources].sort((left, right) => {
      // Accessibility is a *filter* below now; the sort only keeps accessible
      // rooms out of the hands of groups that do not need them.
      const leftAccessible = isAccessibleResource(left)
      const rightAccessible = isAccessibleResource(right)
      if (!group.needsAccessibility && leftAccessible !== rightAccessible) {
        return leftAccessible ? 1 : -1
      }

      const leftUnitMatch = groupUnitMatchScore(left, group)
      const rightUnitMatch = groupUnitMatchScore(right, group)
      if (leftUnitMatch !== rightUnitMatch) return rightUnitMatch - leftUnitMatch

      const leftFree = freeCapacity(left)
      const rightFree = freeCapacity(right)
      const leftExact = leftFree === group.travelerIds.length ? 1 : 0
      const rightExact = rightFree === group.travelerIds.length ? 1 : 0
      if (leftExact !== rightExact) return rightExact - leftExact
      return rightFree - leftFree
    })

    // Relax-and-report: start with every constraint applied, then give them up
    // one at a time in RELAXATION_ORDER until a position with room appears.
    let applied = [...RELAXATION_ORDER]
    const relaxed: AllocationRelaxation[] = []
    let target: AllocatorResource | undefined
    for (;;) {
      target = sortedResources.find(
        (resource) =>
          freeCapacity(resource) >= group.travelerIds.length &&
          applied.every((constraint) => satisfies(constraint, resource, group)),
      )
      if (target || applied.length === 0) break
      const dropped = applied[0]
      applied = applied.slice(1)
      if (dropped) relaxed.push(dropped)
    }

    if (!target) {
      skipped += group.travelerIds.length
      unplaced.push({
        groupKey: group.key,
        sharingGroupId: group.sharingGroupId,
        travelerIds: [...group.travelerIds],
        reason: resources.length === 0 ? "no_resources" : "no_capacity",
        largestFreeCapacity: resources.reduce(
          (largest, resource) => Math.max(largest, freeCapacity(resource)),
          0,
        ),
      })
      continue
    }

    if (relaxed.length > 0) {
      compromises.push({
        groupKey: group.key,
        sharingGroupId: group.sharingGroupId,
        travelerIds: [...group.travelerIds],
        resourceId: target.id,
        relaxed,
      })
    }

    for (const travelerId of group.travelerIds) {
      const previous = assignmentMap.get(travelerId)
      if (previous === target.id) continue
      if (previous) occupancy.set(previous, (occupancy.get(previous) ?? 1) - 1)
      occupancy.set(target.id, (occupancy.get(target.id) ?? 0) + 1)
      assignmentMap.set(travelerId, target.id)
    }
  }

  return plannedAssignments(active, assignmentMap, skipped, unplaced, compromises)
}

export function planVehicleSeatAllocation(
  travelers: AllocatorTraveler[],
  seats: AllocatorResource[],
): AllocationPlan {
  const active = activeTravelers(travelers)
  if (seats.length === 0) {
    return {
      assignments: [],
      skipped: 0,
      unplaced: [...groupTravelers(active).values()].map((group) => ({
        groupKey: group.key,
        sharingGroupId: group.sharingGroupId,
        travelerIds: [...group.travelerIds],
        reason: "no_resources" as const,
        largestFreeCapacity: 0,
      })),
      compromises: [],
    }
  }

  const groups = groupTravelers(active)
  const seatsByParent = groupSeatsByParent(seats)

  const occupant = new Map<string, string | null>()
  for (const seat of seats) occupant.set(seat.id, null)

  const assignmentMap = new Map<string, string>()
  for (const traveler of active) {
    if (traveler.existingAllocationId && occupant.has(traveler.existingAllocationId)) {
      occupant.set(traveler.existingAllocationId, traveler.id)
      assignmentMap.set(traveler.id, traveler.existingAllocationId)
    }
  }

  const sortedGroups = [...groups.values()].sort(
    (left, right) => right.travelerIds.length - left.travelerIds.length,
  )

  let skipped = 0
  const unplaced: AllocationUnplacedGroup[] = []
  for (const group of sortedGroups) {
    const unassigned = group.travelerIds.filter((travelerId) => !assignmentMap.has(travelerId))
    if (unassigned.length === 0) continue

    const seatIds = findContiguousFreeSeats(seatsByParent, occupant, unassigned.length)
    if (seatIds.length === 0) {
      skipped += unassigned.length
      unplaced.push({
        groupKey: group.key,
        sharingGroupId: group.sharingGroupId,
        travelerIds: unassigned,
        reason: "no_capacity",
        largestFreeCapacity: [...occupant.values()].filter((value) => value === null).length,
      })
      continue
    }

    const orderedSeats = sortSeatsByPositionRank(seatIds, seats)
    const orderedTravelers = orderTravelersLeadFirst(unassigned, group.leadTravelerId)

    for (let index = 0; index < orderedTravelers.length; index++) {
      const travelerId = orderedTravelers[index]
      const seatId = orderedSeats[index]
      if (!travelerId || !seatId) continue
      occupant.set(seatId, travelerId)
      assignmentMap.set(travelerId, seatId)
    }
  }

  return plannedAssignments(active, assignmentMap, skipped, unplaced, [])
}

function plannedAssignments(
  active: AllocatorTraveler[],
  assignmentMap: Map<string, string>,
  skipped: number,
  unplaced: AllocationUnplacedGroup[],
  compromises: AllocationCompromise[],
): AllocationPlan {
  const assignments: Array<{ travelerId: string; resourceId: string }> = []
  for (const traveler of active) {
    const planned = assignmentMap.get(traveler.id)
    if (!planned) continue
    if (planned === traveler.existingAllocationId) continue
    assignments.push({ travelerId: traveler.id, resourceId: planned })
  }
  return { assignments, skipped, unplaced, compromises }
}

function groupSeatsByParent(seats: AllocatorResource[]) {
  const seatsByParent = new Map<string, AllocatorResource[]>()
  for (const seat of seats) {
    const parent = seat.parentId ?? "_orphan"
    const list = seatsByParent.get(parent) ?? []
    list.push(seat)
    seatsByParent.set(parent, list)
  }
  for (const list of seatsByParent.values()) {
    list.sort((left, right) => {
      const leftRow = left.row ?? 0
      const rightRow = right.row ?? 0
      if (leftRow !== rightRow) return leftRow - rightRow
      return (left.column ?? "").localeCompare(right.column ?? "")
    })
  }
  return seatsByParent
}

function findContiguousFreeSeats(
  seatsByParent: Map<string, AllocatorResource[]>,
  occupant: Map<string, string | null>,
  size: number,
): string[] {
  for (const seats of seatsByParent.values()) {
    const byRow = new Map<number, AllocatorResource[]>()
    for (const seat of seats) {
      const row = seat.row ?? 0
      const list = byRow.get(row) ?? []
      list.push(seat)
      byRow.set(row, list)
    }
    for (const rowSeats of byRow.values()) {
      const free = rowSeats.filter((seat) => occupant.get(seat.id) === null).map((seat) => seat.id)
      if (free.length >= size) return free.slice(0, size)
    }
  }

  for (const seats of seatsByParent.values()) {
    const free = seats.filter((seat) => occupant.get(seat.id) === null).map((seat) => seat.id)
    if (free.length >= size) return free.slice(0, size)
  }

  return []
}

const POSITION_RANK: Record<string, number> = { window: 0, aisle: 1, middle: 2 }

function sortSeatsByPositionRank(seatIds: string[], seats: AllocatorResource[]): string[] {
  const rank = (seatId: string): number => {
    const seat = seats.find((candidate) => candidate.id === seatId)
    return POSITION_RANK[String(seat?.position ?? "")] ?? 3
  }
  return [...seatIds].sort((left, right) => rank(left) - rank(right))
}

function orderTravelersLeadFirst(travelerIds: string[], leadTravelerId: string | null): string[] {
  if (!leadTravelerId || !travelerIds.includes(leadTravelerId)) return [...travelerIds]
  return [leadTravelerId, ...travelerIds.filter((travelerId) => travelerId !== leadTravelerId)]
}
