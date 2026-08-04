import { type AllocationResource, allocationResources } from "@voyant-travel/availability/schema"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { assertVehicleChildCapacity } from "./service-allocation-resource-invariants.js"
import type { SeatLayoutCell, SeatLayoutSpec } from "./validation.js"
import { seatLayoutSpecSchema } from "./validation.js"

export interface AutoMaterializeRow {
  option_id: string
  pax_count: number
  capacity: number
  name_pattern: string
  ref_type: string | null
  ref_id: string | null
  layout: string | null
  flags: Record<string, unknown> | null
  option_name: string | null
  sort_order: number | null
  /**
   * Explicit number of vehicles to lay out, overriding the pax-derived count.
   * Template-default materialisation supplies this so an operator can draw a
   * coach *before* the first sale, when `pax_count` is zero and the derived
   * count would be meaningless.
   */
  vehicle_count?: number | null
}

/**
 * How many vehicles this group needs: the explicit `vehicle_count` when the
 * caller knows it (template defaults), otherwise derived from pax.
 */
function resolveVehicleCount(group: AutoMaterializeRow, seatsPerVehicle: number): number {
  if (group.vehicle_count != null) return Math.max(0, group.vehicle_count)
  return Math.max(1, Math.ceil(group.pax_count / Math.max(1, seatsPerVehicle)))
}

/**
 * Writes each vehicle and its child seats through the transaction supplied by
 * `autoMaterializeAllocationResources`. Do not call with an unscoped database
 * handle: the caller must hold the availability-slot row lock for the full
 * read/check/write operation.
 */
export async function materializeVehicleSeatGroupInTransaction(
  db: PostgresJsDatabase,
  slotId: string,
  group: AutoMaterializeRow,
  startingSequence: number,
): Promise<{ resources: AllocationResource[]; vehicleCount: number }> {
  const layoutSpec = parseLayoutSpecFromFlags(group.flags)
  if (layoutSpec) {
    return materializeVehicleSeatGroupFromSpec(db, slotId, group, startingSequence, layoutSpec)
  }

  const layout = group.layout ?? "2-2"
  const seatsPerRow = parseLayoutSeatsPerRow(layout)
  const vehiclesNeeded = resolveVehicleCount(group, group.capacity)
  const resources: AllocationResource[] = []
  let sequence = startingSequence

  for (let vehicleIndex = 0; vehicleIndex < vehiclesNeeded; vehicleIndex++) {
    sequence += 1
    const [parent] = await db
      .insert(allocationResources)
      .values({
        slotId,
        kind: "vehicle",
        refType: group.ref_type,
        refId: group.ref_id,
        label: renderNamePattern(group.name_pattern || "Vehicle {sequence}", {
          sequence: String(sequence),
          option: group.option_name ?? "",
          index: String(vehicleIndex + 1),
        }),
        capacity: group.capacity,
        flags: { ...(group.flags ?? {}), layout, templateOptionId: group.option_id },
        sortOrder: sequence,
      })
      .returning()
    if (!parent) continue
    resources.push(parent)

    // The parent and all child seats are written inside the caller's slot-
    // locked transaction. Use the same capacity invariant as manual seat
    // creation before writing any children, so a template cannot create a
    // layout the manual API would reject.
    assertVehicleChildCapacity({
      capacity: parent.capacity,
      existingSeatCount: 0,
      seatsToAdd: group.capacity,
    })

    const seatsPerRowTotal = seatsPerRow.reduce((sum, seats) => sum + seats, 0)
    const totalRows = Math.ceil(group.capacity / seatsPerRowTotal)
    let seatIndex = 0
    for (let row = 1; row <= totalRows && seatIndex < group.capacity; row++) {
      let column = 0
      for (let groupIndex = 0; groupIndex < seatsPerRow.length; groupIndex++) {
        const blockSize = seatsPerRow[groupIndex] ?? 0
        for (let seatInGroup = 0; seatInGroup < blockSize; seatInGroup++) {
          if (seatIndex >= group.capacity) break
          column += 1
          const columnName = columnLetter(column)
          const position = seatPosition(groupIndex, seatInGroup, seatsPerRow)
          const [seat] = await db
            .insert(allocationResources)
            .values({
              slotId,
              kind: "vehicle_seat",
              refType: group.ref_type,
              refId: group.ref_id,
              label: renderNamePattern("Seat {row}{column}", {
                sequence: String(seatIndex + 1),
                row: String(row),
                column: columnName,
                seat: `${row}${columnName}`,
              }),
              capacity: 1,
              flags: { row, column: columnName, position },
              parentId: parent.id,
              sortOrder: seatIndex,
            })
            .returning()
          if (seat) resources.push(seat)
          seatIndex += 1
        }
      }
    }
  }

  return { resources, vehicleCount: vehiclesNeeded }
}

async function materializeVehicleSeatGroupFromSpec(
  db: PostgresJsDatabase,
  slotId: string,
  group: AutoMaterializeRow,
  startingSequence: number,
  layoutSpec: SeatLayoutSpec,
): Promise<{ resources: AllocationResource[]; vehicleCount: number }> {
  const seatsPerVehicle = layoutSpec.rows.reduce(
    (sum, row) => sum + row.cells.filter((cell) => cell === "seat").length,
    0,
  )
  if (seatsPerVehicle === 0) return { resources: [], vehicleCount: 0 }

  const vehiclesNeeded = resolveVehicleCount(group, seatsPerVehicle)
  const resources: AllocationResource[] = []
  let sequence = startingSequence

  for (let vehicleIndex = 0; vehicleIndex < vehiclesNeeded; vehicleIndex++) {
    sequence += 1
    const [parent] = await db
      .insert(allocationResources)
      .values({
        slotId,
        kind: "vehicle",
        refType: group.ref_type,
        refId: group.ref_id,
        label: renderNamePattern(group.name_pattern || "Vehicle {sequence}", {
          sequence: String(sequence),
          option: group.option_name ?? "",
          index: String(vehicleIndex + 1),
        }),
        capacity: seatsPerVehicle,
        flags: {
          ...(group.flags ?? {}),
          layoutSpec,
          templateOptionId: group.option_id,
        },
        sortOrder: sequence,
      })
      .returning()
    if (!parent) continue
    resources.push(parent)

    assertVehicleChildCapacity({
      capacity: parent.capacity,
      existingSeatCount: 0,
      seatsToAdd: seatsPerVehicle,
    })

    let seatIndex = 0
    for (let rowIndex = 0; rowIndex < layoutSpec.rows.length; rowIndex++) {
      const rowCells = layoutSpec.rows[rowIndex]?.cells ?? []
      const rowNumber = rowIndex + 1
      let column = 0
      for (let cellIndex = 0; cellIndex < rowCells.length; cellIndex++) {
        const cell = rowCells[cellIndex]
        if (cell !== "seat") continue
        column += 1
        const columnName = columnLetter(column)
        const position = positionFromCells(rowCells, cellIndex)
        const [seat] = await db
          .insert(allocationResources)
          .values({
            slotId,
            kind: "vehicle_seat",
            refType: group.ref_type,
            refId: group.ref_id,
            label: renderNamePattern("Seat {row}{column}", {
              sequence: String(seatIndex + 1),
              row: String(rowNumber),
              column: columnName,
              seat: `${rowNumber}${columnName}`,
            }),
            capacity: 1,
            flags: { row: rowNumber, column: columnName, position },
            parentId: parent.id,
            sortOrder: seatIndex,
          })
          .returning()
        if (seat) resources.push(seat)
        seatIndex += 1
      }
    }
  }

  return { resources, vehicleCount: vehiclesNeeded }
}

export function parseLayoutSpecFromFlags(
  flags: Record<string, unknown> | null,
): SeatLayoutSpec | null {
  const raw = flags?.layoutSpec
  if (!raw) return null
  const parsed = seatLayoutSpecSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

/**
 * Derive window/aisle/middle from a seat's neighbours in the same row.
 *
 *   - Touching an aisle or door cell -> "aisle" (the seat is on the aisle side)
 *   - Touching the row boundary or a void cell -> "window"
 *   - Surrounded by other seats -> "middle"
 *
 * Aisle takes precedence so the "window" tag is reserved for actual outer
 * seats; a 2-1 row's lone middle seat ends up "aisle" on both sides.
 */
export function positionFromCells(
  cells: ReadonlyArray<SeatLayoutCell>,
  index: number,
): "window" | "aisle" | "middle" {
  const prev = index > 0 ? cells[index - 1] : undefined
  const next = index < cells.length - 1 ? cells[index + 1] : undefined
  if (prev === "aisle" || prev === "door") return "aisle"
  if (next === "aisle" || next === "door") return "aisle"
  if (prev === undefined || prev === "void") return "window"
  if (next === undefined || next === "void") return "window"
  return "middle"
}

export function renderNamePattern(pattern: string, vars: Record<string, string>): string {
  return pattern.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "")
}

function parseLayoutSeatsPerRow(layout: string): number[] {
  const parts = layout
    .split("-")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((part) => Number.isFinite(part) && part > 0)
  return parts.length > 0 ? parts : [2, 2]
}

function columnLetter(value: number): string {
  let result = ""
  let n = value
  while (n > 0) {
    const remainder = (n - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    n = Math.floor((n - 1) / 26)
  }
  return result
}

function seatPosition(
  groupIndex: number,
  seatInGroup: number,
  groups: number[],
): "window" | "aisle" | "middle" {
  const isFirstGroup = groupIndex === 0
  const isLastGroup = groupIndex === groups.length - 1
  const blockSize = groups[groupIndex] ?? 0
  const isFirstSeat = seatInGroup === 0
  const isLastSeat = seatInGroup === blockSize - 1
  if (isFirstGroup && isFirstSeat) return "window"
  if (isLastGroup && isLastSeat) return "window"
  if ((isFirstGroup && isLastSeat) || (isLastGroup && isFirstSeat)) return "aisle"
  if (!isFirstGroup && !isLastGroup && (isFirstSeat || isLastSeat)) return "aisle"
  return "middle"
}
