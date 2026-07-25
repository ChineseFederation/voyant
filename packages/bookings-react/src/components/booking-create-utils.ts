import type { ProductRecord } from "@voyant-travel/inventory-react"
import type { BookingCreateItemLineInput } from "../index.js"

export type ProductPickerSearchRecord = Pick<ProductRecord, "description" | "name" | "sellCurrency">

export interface DepartureSlotSearchRecord {
  id: string
  optionId: string | null
  startsAt: string
  status?: string
}

export interface BookingCreateUnitLineRecord {
  optionId: string | null
  optionUnitId: string
  unitName: string
}

export interface BookingCreatePricingLineRecord {
  unitId: string
  pricingCategoryId?: string | null
  label: string
  unitAmountCents: number | null
  totalAmountCents: number | null
  quantity?: number
}

export interface BookingCreatePricingRecord {
  confirmedAmountCents: number | null
  lines: BookingCreatePricingLineRecord[]
}

type BookingCreateStepperUnitType =
  | "person"
  | "group"
  | "room"
  | "vehicle"
  | "service"
  | "other"
  | null

export interface BookingCreateTravelerAssignableUnitRecord {
  optionId?: string | null
  optionUnitId: string
  unitType?: BookingCreateStepperUnitType
}

export interface BookingCreateCapacityUnitRecord {
  optionUnitId: string
  unitName: string
  unitType?: BookingCreateStepperUnitType
  occupancyMax?: number | null
}

export interface BookingCreateCapacityTravelerRecord {
  inventoryUnitId?: string | null
}

export interface BookingCreateOverCapacityAssignment {
  optionUnitId: string
  unitName: string
  assignedTravelers: number
  capacity: number
}

export function normalizeBookingSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
}

export function matchesBookingSearchText(value: string | null | undefined, query: string): boolean {
  const normalizedQuery = normalizeBookingSearchText(query)
  if (!normalizedQuery) return true
  return normalizeBookingSearchText(value ?? "").includes(normalizedQuery)
}

export function productMatchesPickerSearch(
  product: ProductPickerSearchRecord | null | undefined,
  query: string,
): boolean {
  if (!product) return false
  return [product.name, product.description, product.sellCurrency].some((value) =>
    matchesBookingSearchText(value, query),
  )
}

export type BillingPersonContactValidationResult = "valid" | "missing-contact" | "invalid-email"

export function isRealBookingEmail(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLowerCase() ?? ""
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return false
  return !["noreply@example.com", "tbd@example.com", "traveler@example.com"].includes(normalized)
}

export function validateBillingPersonContact(
  contact: { email?: string | null; phone?: string | null } | null | undefined,
): BillingPersonContactValidationResult {
  const email = contact?.email?.trim() ?? ""
  const phone = contact?.phone?.trim() ?? ""

  if (email && !isRealBookingEmail(email)) return "invalid-email"
  if (!email && !phone) return "missing-contact"
  return "valid"
}

export function getTravelerAssignableStepperUnits<
  TUnit extends BookingCreateTravelerAssignableUnitRecord,
>(units: readonly TUnit[]): TUnit[] {
  // "Inventory" units (rooms, vehicles) are containers a traveler is
  // placed into. When an option configures one, person-typed
  // pricing-tier units on the same option are hidden from the
  // stepper since their pricing folds into the container's per-pax
  // accounting at submit time.
  const isInventoryType = (unit: TUnit) => unit.unitType === "room" || unit.unitType === "vehicle"
  const hasInventoryByOption = new Map<string, boolean>()

  for (const unit of units) {
    const optionKey = unit.optionId ?? unit.optionUnitId
    if (isInventoryType(unit)) hasInventoryByOption.set(optionKey, true)
    else if (!hasInventoryByOption.has(optionKey)) hasInventoryByOption.set(optionKey, false)
  }

  return units.filter((unit) => {
    if (isInventoryType(unit)) return true
    if (unit.unitType !== "person") return false
    return !hasInventoryByOption.get(unit.optionId ?? unit.optionUnitId)
  })
}

export function getOverCapacityInventoryAssignments(
  units: readonly BookingCreateCapacityUnitRecord[],
  quantities: Record<string, number>,
  travelers: readonly BookingCreateCapacityTravelerRecord[],
): BookingCreateOverCapacityAssignment[] {
  const inventoryUnits = units.filter(
    (unit) => unit.unitType === "room" || unit.unitType === "vehicle",
  )
  const assignedByUnitId = new Map<string, number>()
  for (const traveler of travelers) {
    if (!traveler.inventoryUnitId) continue
    assignedByUnitId.set(
      traveler.inventoryUnitId,
      (assignedByUnitId.get(traveler.inventoryUnitId) ?? 0) + 1,
    )
  }

  return inventoryUnits.flatMap((unit) => {
    const quantity = Math.max(0, quantities[unit.optionUnitId] ?? 0)
    const occupancy = Math.max(1, unit.occupancyMax ?? 1)
    const capacity = quantity * occupancy
    const assignedTravelers = assignedByUnitId.get(unit.optionUnitId) ?? 0
    if (assignedTravelers <= capacity) return []
    return [
      {
        optionUnitId: unit.optionUnitId,
        unitName: unit.unitName,
        assignedTravelers,
        capacity,
      },
    ]
  })
}

export function getBookableDepartureSlots<TSlot extends DepartureSlotSearchRecord>(
  slots: readonly TSlot[],
  options: {
    nowIso: string
    optionId: string | null
  },
): TSlot[] {
  return slots
    .filter((slot) => !slot.status || slot.status === "open")
    .filter((slot) => slot.startsAt >= options.nowIso)
    .filter((slot) => {
      if (!options.optionId) return true
      return slot.optionId === null || slot.optionId === options.optionId
    })
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
}

export function itemLinesToRows(
  quantities: Record<string, number>,
  units: BookingCreateUnitLineRecord[],
  pricing: BookingCreatePricingRecord | null,
  travelerKeysByUnitId: Record<string, string[]> = {},
  travelerKeysByUnitAndCategoryId: Record<string, Record<string, string[]>> = {},
): BookingCreateItemLineInput[] {
  const unitsById = new Map(units.map((unit) => [unit.optionUnitId, unit]))
  const unitNames = new Map(units.map((unit) => [unit.optionUnitId, unit.unitName]))
  const pricedLines = new Map(
    (pricing?.lines ?? [])
      .filter((line) => !line.pricingCategoryId)
      .map((line) => [line.unitId, line]),
  )
  const categoryPricedLinesByUnitId = new Map<string, BookingCreatePricingLineRecord[]>()
  for (const line of pricing?.lines ?? []) {
    if (!line.pricingCategoryId) continue
    const existing = categoryPricedLinesByUnitId.get(line.unitId) ?? []
    existing.push(line)
    categoryPricedLinesByUnitId.set(line.unitId, existing)
  }
  const selectedLines = Object.entries(quantities).filter(([, quantity]) => quantity > 0)
  const pricedTotal = selectedLines.reduce((sum, [optionUnitId]) => {
    const total = pricedLines.get(optionUnitId)?.totalAmountCents
    return total == null ? sum : sum + total
  }, 0)
  const unpricedLines = selectedLines.filter(
    ([optionUnitId]) => pricedLines.get(optionUnitId)?.totalAmountCents == null,
  )
  const unpricedQuantity = unpricedLines.reduce((sum, [, quantity]) => sum + quantity, 0)
  const manualRemainder =
    pricing?.confirmedAmountCents != null && unpricedLines.length > 0
      ? Math.max(0, pricing.confirmedAmountCents - pricedTotal)
      : null
  let allocatedManualTotal = 0

  return selectedLines.flatMap(([optionUnitId, quantity]) => {
    const categoryPricedLines = categoryPricedLinesByUnitId.get(optionUnitId) ?? []
    if (categoryPricedLines.length > 0) {
      return categoryPricedLines.map((pricedLine) => {
        const pricingCategoryId = pricedLine.pricingCategoryId
        const categoryQuantity = Math.max(1, pricedLine.quantity ?? 1)
        const travelerKeys = pricingCategoryId
          ? travelerKeysByUnitAndCategoryId[optionUnitId]?.[pricingCategoryId]
          : undefined
        const hasTravelerLinks = Boolean(travelerKeys?.length)
        return {
          clientLineKey: hasTravelerLinks
            ? `unit:${optionUnitId}:category:${pricingCategoryId ?? "default"}`
            : undefined,
          optionId: unitsById.get(optionUnitId)?.optionId ?? null,
          optionUnitId,
          pricingCategoryId,
          quantity: categoryQuantity,
          title: pricedLine.label ?? unitNames.get(optionUnitId) ?? null,
          unitSellAmountCents: pricedLine.unitAmountCents,
          totalSellAmountCents: pricedLine.totalAmountCents,
          ...(travelerKeys?.length ? { travelerKeys } : {}),
        }
      })
    }

    const pricedLine = pricedLines.get(optionUnitId)
    let totalSellAmountCents = pricedLine?.totalAmountCents ?? null
    if (totalSellAmountCents == null && manualRemainder != null && unpricedQuantity > 0) {
      const isLastUnpriced = unpricedLines[unpricedLines.length - 1]?.[0] === optionUnitId
      totalSellAmountCents = isLastUnpriced
        ? manualRemainder - allocatedManualTotal
        : Math.floor((manualRemainder * quantity) / unpricedQuantity)
      allocatedManualTotal += totalSellAmountCents
    }
    const unitSellAmountCents =
      pricedLine?.unitAmountCents ??
      (totalSellAmountCents != null ? Math.floor(totalSellAmountCents / quantity) : null)
    const travelerKeys = travelerKeysByUnitId[optionUnitId]
    const hasTravelerLinks = Boolean(travelerKeys?.length)
    return {
      // Server uses `clientLineKey` to look up this item after insert
      // and link it to travelers via `booking_item_travelers`. Only
      // stamp when there's an actual traveler mapping to write.
      clientLineKey: hasTravelerLinks ? `unit:${optionUnitId}` : undefined,
      optionId: unitsById.get(optionUnitId)?.optionId ?? null,
      optionUnitId,
      quantity,
      title: pricedLine?.label ?? unitNames.get(optionUnitId) ?? null,
      unitSellAmountCents,
      totalSellAmountCents,
      ...(travelerKeys?.length ? { travelerKeys } : {}),
    }
  })
}

export function getSelectedSharedRoomUnitId(quantities: Record<string, number>): string | null {
  return Object.entries(quantities).find(([, quantity]) => quantity > 0)?.[0] ?? null
}
