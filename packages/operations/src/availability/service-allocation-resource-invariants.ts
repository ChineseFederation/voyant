import { AllocationServiceError } from "./service-allocation-errors.js"

/**
 * Shared invariant for manual and template-driven vehicle-seat writes.
 * Callers performing persistence must hold the parent vehicle row lock until
 * their seat insert/update commits.
 */
export function assertVehicleChildCapacity({
  capacity,
  existingSeatCount,
  seatsToAdd,
}: {
  capacity: number
  existingSeatCount: number
  seatsToAdd: number
}) {
  if (existingSeatCount + seatsToAdd <= capacity) return
  throw new AllocationServiceError("Vehicle seat count exceeds vehicle capacity", 409, {
    capacity,
    existingSeatCount,
    requestedSeatCount: seatsToAdd,
  })
}

export function normalizeVehicleSeatDesignation(
  label: string | null | undefined,
  flags: Record<string, unknown> | null | undefined,
): string | null {
  const row = typeof flags?.row === "number" && Number.isInteger(flags.row) ? flags.row : null
  const column = typeof flags?.column === "string" ? flags.column.trim() : ""
  if (row && column) return `${row}${column}`.toLocaleLowerCase()
  const normalized = label?.trim().toLocaleLowerCase() ?? ""
  return normalized || null
}

export function assertVehicleSeatDesignationAvailable({
  label,
  flags,
  existingSeats,
}: {
  label: string | null | undefined
  flags: Record<string, unknown> | null | undefined
  existingSeats: ReadonlyArray<{
    label: string | null
    flags: Record<string, unknown> | null
  }>
}) {
  const designation = normalizeVehicleSeatDesignation(label, flags)
  if (!designation) {
    throw new AllocationServiceError("A vehicle seat must have a designation", 400)
  }
  if (
    existingSeats.some(
      (seat) => normalizeVehicleSeatDesignation(seat.label, seat.flags) === designation,
    )
  ) {
    throw new AllocationServiceError("Seat designation already exists in this vehicle", 409, {
      designation,
    })
  }
}
