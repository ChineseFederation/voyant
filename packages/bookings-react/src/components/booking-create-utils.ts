import type { BookingCreateItemLineInput } from "../index.js"

export interface ProductPickerSearchRecord {
  id?: string
  name: string
  description?: string | null
  sellCurrency?: string | null
  sellAmountCents?: number | null
  supplierName?: string | null
  sourceKind?: string | null
  sourceConnectionId?: string | null
  sourceRef?: string | null
}

export interface CatalogProductSearchHitLike {
  id: string
  document: { fields: Record<string, unknown> }
}

/** Normalize an indexed catalog hit into the small record the booking picker needs. */
export function catalogProductPickerRecordFromHit(
  hit: CatalogProductSearchHitLike,
): ProductPickerSearchRecord & { id: string } {
  const fields = hit.document.fields
  return {
    id: hit.id,
    name: firstString(fields, ["name", "title"]) ?? hit.id,
    description: firstString(fields, ["description", "shortDescription", "short_description"]),
    sellCurrency: firstString(fields, [
      "sellCurrency",
      "sell_currency",
      "priceFromCurrency",
      "price_from_currency",
    ]),
    sellAmountCents: firstNumber(fields, [
      "sellAmountCents",
      "sell_amount_cents",
      "priceFromAmountCents",
      "priceFromAmountMinor",
      "price_from_amount_cents",
    ]),
    supplierName: firstString(fields, [
      "supplierName",
      "supplier_name",
      "supplierId",
      "supplier",
      "source.provider",
    ]),
    sourceKind: firstString(fields, ["source.kind", "sourceKind", "source_kind"]) ?? "owned",
    sourceConnectionId: firstString(fields, [
      "source.connectionId",
      "source.connection_id",
      "sourceConnectionId",
      "source_connection_id",
    ]),
    sourceRef: firstString(fields, ["source.ref", "sourceRef", "source_ref"]),
  }
}

export interface DepartureSlotSearchRecord {
  id: string
  optionId: string | null
  startsAt: string
  status?: string
}

/** A departure plus the capacity fields a move has to respect. */
export interface DepartureSlotCapacityRecord extends DepartureSlotSearchRecord {
  unlimited?: boolean
  remainingPax?: number | null
}

/**
 * Departures a Booking Item could actually move onto.
 *
 * Narrower than `getBookableDepartureSlots` by two rules that only matter
 * once a booking already exists: a departure without room for the seats
 * being carried over is not a choice, and neither is the one the item is
 * already on. Offering either would put the operator in front of a
 * selection the server is obliged to refuse.
 */
export function getMoveTargetDepartureSlots<TSlot extends DepartureSlotCapacityRecord>(
  slots: readonly TSlot[],
  options: {
    nowIso: string
    optionId: string | null
    /** Seats the move has to carry across. */
    quantity: number
    /** The departure the item is on today. */
    currentSlotId: string | null
  },
): TSlot[] {
  return getBookableDepartureSlots(slots, options).filter((slot) => {
    if (slot.id === options.currentSlotId) return false
    if (slot.unlimited) return true
    return (slot.remainingPax ?? 0) >= options.quantity
  })
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
  return [
    product.id,
    product.name,
    product.description,
    product.sellCurrency,
    product.supplierName,
    product.sourceKind,
  ].some((value) => matchesBookingSearchText(value, query))
}

function firstString(fields: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = fields[key]
    if (typeof value === "string" && value.trim()) return value
  }
  return null
}

function firstNumber(fields: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = fields[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value)
    }
  }
  return null
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

/**
 * A departure as an operator says it out loud — "Aug 16, 2026 · 12 left" —
 * not the ISO instant the API returns. The raw timestamp is unreadable at
 * the speed someone takes a phone call.
 */
export function formatDepartureLabel(
  slot: { startsAt?: string | null; id: string; unlimited?: boolean; remainingPax?: number | null },
  formatDate: (value: string, options?: Intl.DateTimeFormatOptions) => string,
  messages: { fields: { seatsLeft: string } },
): string {
  if (!slot.startsAt) return slot.id
  const date = formatDate(slot.startsAt, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
  if (slot.unlimited || typeof slot.remainingPax !== "number") return date
  return `${date} · ${messages.fields.seatsLeft.replace("{count}", String(slot.remainingPax))}`
}
