import {
  type AllocationManifestTraveler,
  type AllocationResource,
  type SeatLayoutSpec,
  seatLayoutSpecSchema,
} from "@voyant-travel/operations-react/availability"

import type { AllocationUiMessages } from "../i18n/index.js"

export const ROOM_KIND = "room"
export const VEHICLE_KIND = "vehicle"
export const VEHICLE_SEAT_KIND = "vehicle_seat"

/**
 * The operated-departure workspace always exposes these common logistics
 * dimensions. Resources remain open-ended (cabins, flight seats, equipment,
 * etc. can still arrive from templates), but an operator should not need to
 * configure a product template before they can start a rooming, vehicle,
 * or seating plan for a specific departure.
 */
export const STANDARD_OPERATIONAL_KINDS = [ROOM_KIND, VEHICLE_KIND, VEHICLE_SEAT_KIND] as const

export type AllocationOccupants = {
  byResource: Map<string, AllocationManifestTraveler[]>
  byTravelerId: Map<string, AllocationManifestTraveler>
  unallocated: AllocationManifestTraveler[]
}

export function deriveAllocationKinds({
  resources,
  templateOptions,
}: {
  resources: ReadonlyArray<Pick<AllocationResource, "kind">>
  templateOptions: ReadonlyArray<{
    templates: ReadonlyArray<{ kind: string | null | undefined }>
  }>
}) {
  const kinds: string[] = [...STANDARD_OPERATIONAL_KINDS]
  const addKind = (kind: string | null | undefined) => {
    if (!kind || kinds.includes(kind)) return
    kinds.push(kind)
  }

  for (const resource of resources) addKind(resource.kind)
  for (const option of templateOptions) {
    for (const template of option.templates) addKind(template.kind)
  }

  return kinds
}

export function collectOccupants(
  travelers: AllocationManifestTraveler[],
  resources: AllocationResource[],
  kind: string,
): AllocationOccupants {
  const resourceIds = new Set(resources.map((resource) => resource.id))
  const byResource = new Map<string, AllocationManifestTraveler[]>()
  const byTravelerId = new Map<string, AllocationManifestTraveler>()
  const unallocated: AllocationManifestTraveler[] = []

  for (const traveler of travelers) {
    byTravelerId.set(traveler.id, traveler)
    const resourceId = traveler.allocations[kind]
    if (!resourceId || !resourceIds.has(resourceId)) {
      unallocated.push(traveler)
      continue
    }
    const list = byResource.get(resourceId) ?? []
    list.push(traveler)
    byResource.set(resourceId, list)
  }

  return { byResource, byTravelerId, unallocated }
}

/**
 * Roll exact seat assignments up to their parent vehicle. Vehicles are not
 * directly assignable, but their management rows still need to show the real
 * passenger load carried by their child seats.
 */
export function collectVehicleOccupants(
  travelers: AllocationManifestTraveler[],
  vehicles: AllocationResource[],
  seats: AllocationResource[],
): AllocationOccupants {
  const vehicleIds = new Set(vehicles.map((vehicle) => vehicle.id))
  const vehicleBySeatId = new Map(
    seats.flatMap((seat) =>
      seat.parentId && vehicleIds.has(seat.parentId) ? [[seat.id, seat.parentId] as const] : [],
    ),
  )
  const byResource = new Map<string, AllocationManifestTraveler[]>()
  const byTravelerId = new Map<string, AllocationManifestTraveler>()
  const unallocated: AllocationManifestTraveler[] = []

  for (const traveler of travelers) {
    byTravelerId.set(traveler.id, traveler)
    const seatId = traveler.allocations[VEHICLE_SEAT_KIND]
    const vehicleId = seatId ? vehicleBySeatId.get(seatId) : undefined
    if (!vehicleId) {
      unallocated.push(traveler)
      continue
    }
    const occupants = byResource.get(vehicleId) ?? []
    occupants.push(traveler)
    byResource.set(vehicleId, occupants)
  }

  return { byResource, byTravelerId, unallocated }
}

export interface VehicleSeatGroup {
  id: string
  label: string
  sortOrder: number
  seats: AllocationResource[]
  /**
   * Parsed 2D layout for this vehicle when the operator drew a custom map
   * via `<SeatMapBuilder />`. Renderers honor this to draw aisles, doors,
   * and voids; absent means fall back to the row-grouped layout.
   */
  layoutSpec: SeatLayoutSpec | null
}

export function groupSeatsByVehicle(
  seats: AllocationResource[],
  vehicles: AllocationResource[],
  messages: AllocationUiMessages,
): VehicleSeatGroup[] {
  const vehiclesById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]))
  const grouped = new Map<string, VehicleSeatGroup>()

  for (const seat of seats) {
    const parentId = seat.parentId ?? "ungrouped"
    const parent = parentId === "ungrouped" ? null : vehiclesById.get(parentId)
    const group =
      grouped.get(parentId) ??
      grouped
        .set(parentId, {
          id: parentId,
          label: parent?.label ?? messages.vehicle,
          sortOrder: parent?.sortOrder ?? 0,
          layoutSpec: parseLayoutSpecFromFlags(parent?.flags ?? null),
          seats: [],
        })
        .get(parentId)

    group?.seats.push(seat)
  }

  return Array.from(grouped.values())
    .map((group) => ({
      ...group,
      seats: group.seats.sort(compareSeatResources),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
}

function parseLayoutSpecFromFlags(flags: Record<string, unknown> | null): SeatLayoutSpec | null {
  const raw = flags?.layoutSpec
  if (!raw) return null
  const parsed = seatLayoutSpecSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export function seatRows(seats: AllocationResource[]) {
  const byRow = new Map<string, AllocationResource[]>()
  for (const seat of seats) {
    const rowKey = String(flagNumber(seat.flags.row) ?? 0)
    const row = byRow.get(rowKey) ?? []
    row.push(seat)
    byRow.set(rowKey, row)
  }

  return Array.from(byRow.entries())
    .map(([rowKey, rowSeats]) => ({
      rowKey,
      seats: rowSeats.sort(compareSeatResources),
    }))
    .sort((a, b) => Number(a.rowKey) - Number(b.rowKey) || a.rowKey.localeCompare(b.rowKey))
}

export function seatName(seat: AllocationResource, messages: AllocationUiMessages) {
  return seatDesignation(seat) ?? messages.seat
}

/** Stable, human-readable seat designation used for display and uniqueness. */
export function seatDesignation(seat: Pick<AllocationResource, "label" | "flags">): string | null {
  const row = flagNumber(seat.flags.row)
  const column = flagString(seat.flags.column)
  if (row && column) return `${row}${column}`
  return seat.label?.trim() || null
}

export type VehicleSeatDesignationIssue = "required" | "duplicate" | null

/** Validate a manually-authored seat name within its parent vehicle. */
export function validateVehicleSeatDesignation({
  label,
  parentId,
  seats,
}: {
  label: string
  parentId: string | null
  seats: AllocationResource[]
}): VehicleSeatDesignationIssue {
  const normalized = label.trim().toLowerCase()
  if (!normalized) return "required"
  const duplicate = seats.some(
    (seat) => seat.parentId === parentId && seatDesignation(seat)?.toLowerCase() === normalized,
  )
  return duplicate ? "duplicate" : null
}

export function parentKindFor(kind: string) {
  return kind === VEHICLE_SEAT_KIND ? VEHICLE_KIND : ""
}

export function defaultCapacityFor(kind: string) {
  return kind === VEHICLE_SEAT_KIND ? 1 : kind === ROOM_KIND ? 2 : kind === VEHICLE_KIND ? 50 : 1
}

export function isTravelerAllocatableKind(kind: string) {
  return kind !== VEHICLE_KIND
}

export function kindLabel(kind: string, messages: AllocationUiMessages) {
  if (kind === ROOM_KIND) return messages.rooms
  if (kind === VEHICLE_KIND) return messages.vehicles
  if (kind === VEHICLE_SEAT_KIND) return messages.vehicleSeats
  if (kind === "cabin") return messages.cabins
  if (kind === "flight_seat") return messages.flightSeats
  return titleCaseKind(kind)
}

export function kindDescription(kind: string, messages: AllocationUiMessages) {
  if (kind === ROOM_KIND) return messages.operationalKindDescriptions.room
  if (kind === VEHICLE_KIND) return messages.operationalKindDescriptions.vehicle
  if (kind === VEHICLE_SEAT_KIND) return messages.operationalKindDescriptions.vehicle_seat
  return null
}

/**
 * Group resources for display by a "sub-type" — `refId` when present,
 * otherwise the leading alphabetic token of `label` ("DBL" from
 * "DBL 1"), otherwise a single "other" bucket. Lets the operator scan
 * all DBLs together instead of an alphabetic interleave of mixed
 * sub-types. Each group also exposes the count and the total person-
 * capacity so the header summary stays consistent with the grid.
 */
export interface ResourceSubTypeGroup {
  key: string
  /**
   * Human-readable group label derived from the resource's refId or
   * label prefix. `null` for the catch-all bucket (unlabeled, refId-
   * less resources) — consumers should fall back to a localized
   * "Other" string.
   */
  label: string | null
  resources: AllocationResource[]
  count: number
  capacity: number
}

export function groupResourcesBySubType(resources: AllocationResource[]): ResourceSubTypeGroup[] {
  const buckets = new Map<
    string,
    { key: string; label: string | null; resources: AllocationResource[] }
  >()
  for (const resource of resources) {
    const { key, label } = resourceSubTypeKey(resource)
    const bucket = buckets.get(key) ?? { key, label, resources: [] }
    bucket.resources.push(resource)
    buckets.set(key, bucket)
  }
  return Array.from(buckets.values())
    .map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      resources: bucket.resources,
      count: bucket.resources.length,
      capacity: bucket.resources.reduce((sum, resource) => sum + resource.capacity, 0),
    }))
    .sort((a, b) => (a.label ?? "").localeCompare(b.label ?? "") || a.key.localeCompare(b.key))
}

function resourceSubTypeKey(resource: AllocationResource): { key: string; label: string | null } {
  if (resource.refId) return { key: `ref:${resource.refId}`, label: resource.refId }
  const label = (resource.label ?? "").trim()
  if (label.length > 0) {
    const prefix = label.match(/^[A-Za-z]+/)?.[0]
    if (prefix) return { key: `prefix:${prefix.toUpperCase()}`, label: prefix.toUpperCase() }
  }
  return { key: "other", label: null }
}

export interface ResourceCapacitySummary {
  resourceCount: number
  resourceCapacity: number
  slotPax: number | null
  slotRemainingPax: number | null
  delta: number | null
  status: "fits" | "exact" | "over" | "unbounded"
}

/**
 * Roll up slot pax vs. resource person-capacity into a single summary
 * the header can render as a coloured pill. `slotPax` is the slot's
 * `initialPax` when finite; if the slot is `unlimited` or has no
 * initial pax we treat it as unbounded and the operator only sees the
 * total resource capacity without a delta.
 */
export function summarizeResourceCapacity(input: {
  resources: AllocationResource[]
  slotInitialPax: number | null | undefined
  slotRemainingPax: number | null | undefined
  unlimited: boolean
}): ResourceCapacitySummary {
  const resourceCapacity = input.resources.reduce((sum, resource) => sum + resource.capacity, 0)
  const slotPax = input.unlimited ? null : (input.slotInitialPax ?? null)
  if (slotPax == null) {
    return {
      resourceCount: input.resources.length,
      resourceCapacity,
      slotPax: null,
      slotRemainingPax: input.unlimited ? null : (input.slotRemainingPax ?? null),
      delta: null,
      status: "unbounded",
    }
  }
  const delta = resourceCapacity - slotPax
  return {
    resourceCount: input.resources.length,
    resourceCapacity,
    slotPax,
    slotRemainingPax: input.slotRemainingPax ?? null,
    delta,
    status: delta > 0 ? "over" : delta === 0 ? "exact" : "fits",
  }
}

export function flagString(value: unknown) {
  return typeof value === "string" ? value : null
}

function compareSeatResources(a: AllocationResource, b: AllocationResource) {
  const aRow = flagNumber(a.flags.row) ?? 0
  const bRow = flagNumber(b.flags.row) ?? 0
  const aColumn = flagString(a.flags.column) ?? ""
  const bColumn = flagString(b.flags.column) ?? ""
  return aRow - bRow || aColumn.localeCompare(bColumn) || a.sortOrder - b.sortOrder
}

function titleCaseKind(kind: string) {
  return kind
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ")
}

function flagNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}
