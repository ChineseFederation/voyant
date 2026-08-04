import { isActiveBookingStatus } from "./booking-statuses.js"
import type { AllocationManifestTraveler, SlotAllocationManifest } from "./service-allocation.js"

const PASSENGER_HEADERS = [
  "Booking",
  "Booking status",
  "Traveler",
  "Lead traveler",
  "Primary",
  "Email",
  "Phone",
  "Participant type",
  "Traveler category",
  "Sharing group",
  "Accessibility flagged",
  "Dietary flagged",
] as const

const ROOMING_HEADERS = ["Resource", "Capacity", "Occupants", "Traveler count"] as const

export function buildAllocationPassengersCsv(manifest: SlotAllocationManifest): string {
  const rows: Array<Array<string | number | boolean | null>> = [[...PASSENGER_HEADERS]]

  for (const booking of manifest.bookings) {
    for (const traveler of booking.travelers) {
      rows.push([
        booking.bookingNumber,
        booking.status,
        traveler.fullName,
        traveler.isLeadTraveler,
        traveler.isPrimary,
        traveler.email,
        traveler.phone,
        traveler.participantType,
        traveler.travelerCategory,
        traveler.sharingGroupId
          ? (manifest.sharingGroupLabels[traveler.sharingGroupId] ?? traveler.sharingGroupId)
          : null,
        traveler.hasAccessibilityNeeds,
        traveler.hasDietaryRequirements,
      ])
    }
  }

  return csvDocument(rows)
}

export function buildAllocationRoomingCsv(manifest: SlotAllocationManifest, kind = "room"): string {
  const rows: Array<Array<string | number | null>> = [[...ROOMING_HEADERS]]
  const travelers = manifest.bookings.flatMap((booking) =>
    isActiveBookingStatus(booking.status) ? booking.travelers : [],
  )
  const travelersByResource = new Map<string, AllocationManifestTraveler[]>()
  const unallocated: AllocationManifestTraveler[] = []

  for (const traveler of travelers) {
    const resourceId = traveler.allocations[kind]
    if (!resourceId) {
      unallocated.push(traveler)
      continue
    }
    const list = travelersByResource.get(resourceId) ?? []
    list.push(traveler)
    travelersByResource.set(resourceId, list)
  }

  for (const resource of manifest.resources.filter((row) => row.kind === kind)) {
    const occupants = travelersByResource.get(resource.id) ?? []
    rows.push([
      resource.label ?? resource.id,
      resource.capacity,
      occupants
        .map((traveler) => traveler.fullName)
        .filter(Boolean)
        .join("; "),
      occupants.length,
    ])
  }

  if (unallocated.length > 0) {
    rows.push([
      "Unallocated",
      null,
      unallocated
        .map((traveler) => traveler.fullName)
        .filter(Boolean)
        .join("; "),
      unallocated.length,
    ])
  }

  rows.push(["Total", null, null, travelers.length])

  return csvDocument(rows)
}

/**
 * Export filenames. `seating` was unreachable before: `buildAllocationRoomingCsv`
 * has always taken a `kind`, but the route declared no `kind` parameter and this
 * union had no name for a seat manifest, so a coach's seating list could not be
 * downloaded at all.
 */
export type AllocationExportPrefix = "passengers" | "rooming" | "seating"

export function allocationExportFilename(
  manifest: SlotAllocationManifest,
  prefix: AllocationExportPrefix,
): string {
  const slug = manifest.slot.productId?.slice(0, 8) ?? "departure"
  return `${prefix}-${slug}-${manifest.slot.id}.csv`
}

/**
 * Which export a resource kind belongs to. Seat-shaped kinds print as a seating
 * manifest; everything else prints as a rooming list.
 */
export function allocationExportPrefixForKind(kind: string): AllocationExportPrefix {
  return kind === "vehicle_seat" || kind === "flight_seat" ? "seating" : "rooming"
}

function csvDocument(rows: Array<Array<string | number | boolean | null | undefined>>) {
  return `\uFEFF${rows.map(csvRow).join("\r\n")}\r\n`
}

function csvRow(fields: Array<string | number | boolean | null | undefined>) {
  return fields.map(csvField).join(",")
}

function csvField(value: string | number | boolean | null | undefined) {
  if (value == null) return ""
  const text = typeof value === "boolean" ? (value ? "yes" : "no") : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
