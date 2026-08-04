import { isActiveBookingStatus } from "./booking-statuses.js"

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
}

export interface AllocationPlan {
  assignments: Array<{ travelerId: string; resourceId: string }>
  skipped: number
}

interface InternalGroup {
  key: string
  travelerIds: string[]
  needsAccessibility: boolean
  leadTravelerId: string | null
  optionIds: Set<string>
  optionUnitIds: Set<string>
  optionUnitCodes: Set<string>
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
      optionIds: new Set<string>(),
      optionUnitIds: new Set<string>(),
      optionUnitCodes: new Set<string>(),
    }
    group.travelerIds.push(traveler.id)
    if (traveler.hasAccessibilityNeeds) group.needsAccessibility = true
    if (traveler.isLeadTraveler && !group.leadTravelerId) group.leadTravelerId = traveler.id
    if (traveler.optionId) group.optionIds.add(traveler.optionId)
    if (traveler.optionUnitId) group.optionUnitIds.add(traveler.optionUnitId)
    if (traveler.optionUnitCode) group.optionUnitCodes.add(traveler.optionUnitCode)
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
  for (const group of sortedGroups) {
    const allInOne = group.travelerIds.every(
      (travelerId) =>
        assignmentMap.has(travelerId) &&
        group.travelerIds.every(
          (otherTravelerId) => assignmentMap.get(otherTravelerId) === assignmentMap.get(travelerId),
        ),
    )
    if (allInOne) continue

    const sortedResources = [...resources].sort((left, right) => {
      const leftAccessible = left.flags.accessibilityNeeded === true
      const rightAccessible = right.flags.accessibilityNeeded === true
      if (group.needsAccessibility) {
        if (leftAccessible !== rightAccessible) return leftAccessible ? -1 : 1
      } else if (leftAccessible !== rightAccessible) {
        return leftAccessible ? 1 : -1
      }

      const leftUnitMatch = groupUnitMatchScore(left, group)
      const rightUnitMatch = groupUnitMatchScore(right, group)
      if (leftUnitMatch !== rightUnitMatch) return rightUnitMatch - leftUnitMatch

      const leftFree = left.capacity - (occupancy.get(left.id) ?? 0)
      const rightFree = right.capacity - (occupancy.get(right.id) ?? 0)
      const leftExact = leftFree === group.travelerIds.length ? 1 : 0
      const rightExact = rightFree === group.travelerIds.length ? 1 : 0
      if (leftExact !== rightExact) return rightExact - leftExact
      return rightFree - leftFree
    })

    const target = sortedResources.find(
      (resource) =>
        resource.capacity - (occupancy.get(resource.id) ?? 0) >= group.travelerIds.length,
    )
    if (!target) {
      skipped += group.travelerIds.length
      continue
    }

    for (const travelerId of group.travelerIds) {
      const previous = assignmentMap.get(travelerId)
      if (previous === target.id) continue
      if (previous) occupancy.set(previous, (occupancy.get(previous) ?? 1) - 1)
      occupancy.set(target.id, (occupancy.get(target.id) ?? 0) + 1)
      assignmentMap.set(travelerId, target.id)
    }
  }

  return plannedAssignments(active, assignmentMap, skipped)
}

export function planVehicleSeatAllocation(
  travelers: AllocatorTraveler[],
  seats: AllocatorResource[],
): AllocationPlan {
  if (seats.length === 0) return { assignments: [], skipped: 0 }

  const active = activeTravelers(travelers)
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
  for (const group of sortedGroups) {
    const unassigned = group.travelerIds.filter((travelerId) => !assignmentMap.has(travelerId))
    if (unassigned.length === 0) continue

    const seatIds = findContiguousFreeSeats(seatsByParent, occupant, unassigned.length)
    if (seatIds.length === 0) {
      skipped += unassigned.length
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

  return plannedAssignments(active, assignmentMap, skipped)
}

function plannedAssignments(
  active: AllocatorTraveler[],
  assignmentMap: Map<string, string>,
  skipped: number,
): AllocationPlan {
  const assignments: Array<{ travelerId: string; resourceId: string }> = []
  for (const traveler of active) {
    const planned = assignmentMap.get(traveler.id)
    if (!planned) continue
    if (planned === traveler.existingAllocationId) continue
    assignments.push({ travelerId: traveler.id, resourceId: planned })
  }
  return { assignments, skipped }
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
