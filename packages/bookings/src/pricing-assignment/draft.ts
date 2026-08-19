import { computeAgeYears, deriveDraftPaxBand, pickUnitForAge } from "./age.js"
import type {
  BookingDraftQuantities,
  BookingDraftTraveler,
  PricingAssignmentUnit,
  ResolvableExtraLine,
  ResolvedBookingDraft,
} from "./types.js"

import { isInventoryUnit, isPersonUnit, optionKey, roleHintForTraveler } from "./unit-helpers.js"

/**
 * Resolve a booking-create draft into the per-unit quantities and
 * per-traveler unit assignments the submit pipeline + price preview
 * both need. Single source of truth for traveler→unit mapping.
 *
 * Shape branching:
 *   - **Person-priced options** (only `person` units, no `room`):
 *     quantities are derived from traveler assignments (1 adult + 1
 *     child + 1 infant = 3 line items, not "3 x Adult"). Auto-source
 *     travelers are re-derived against the current option's bands.
 *   - **Accommodation options** (any `room` unit): operator-picked
 *     stepper quantities are preserved (1 DBL room is 1 line). Per-
 *     traveler room assignments still update `travelerIndexesByUnitId`
 *     so `booking_item_travelers` rows can be created.
 *
 * Respects assignment sources:
 *   - `none` → the corresponding field stays null
 *   - `manual` → the existing unit is kept when valid for the chosen option
 *   - `auto` → re-derived against current options
 */
export function resolveBookingDraft<TTraveler extends BookingDraftTraveler>(options: {
  quantities: BookingDraftQuantities
  travelers: readonly TTraveler[]
  units: readonly PricingAssignmentUnit[]
  /**
   * Options whose occupancy price supplements, rather than replaces, their
   * traveler fares. For these mixed options the admin form selects rooms while
   * Adult/Child quantities follow the traveler roster automatically. Omitted
   * for all-in occupancy pricing and legacy callers whose person unit was only
   * an option-level quantity proxy.
   */
  derivePersonQuantitiesForOptionIds?: ReadonlySet<string>
  now?: Date
}): ResolvedBookingDraft<TTraveler> {
  const { quantities, travelers, now = new Date() } = options
  const units = [...options.units]
  if (units.length === 0) {
    return { quantities, travelers: [...travelers], travelerIndexesByUnitId: {} }
  }

  const unitsByOption = new Map<string, PricingAssignmentUnit[]>()
  const unitById = new Map<string, PricingAssignmentUnit>()
  const unitToOption = new Map<string, string>()
  for (const unit of units) {
    const key = optionKey(unit)
    unitById.set(unit.optionUnitId, unit)
    unitToOption.set(unit.optionUnitId, key)
    const list = unitsByOption.get(key)
    if (list) list.push(unit)
    else unitsByOption.set(key, [unit])
  }

  const inventoryUnitsByOption = new Map<string, PricingAssignmentUnit[]>()
  for (const [key, optionUnits] of unitsByOption) {
    const inventoryUnits = optionUnits.filter(isInventoryUnit)
    if (inventoryUnits.length > 0) inventoryUnitsByOption.set(key, inventoryUnits)
  }

  // An option is "person-priced" when it has at least one person unit
  // and no inventory unit (room/vehicle). That's the excursion shape:
  // line quantities derive from travelers, not from the stepper's
  // primary-unit count. Multi-day packages with both a room AND a
  // person-typed adult fee fall outside this set — the room
  // quantity passes through unchanged.
  const personPricedOptions = new Set<string>()
  for (const [key, optionUnits] of unitsByOption) {
    const hasPerson = optionUnits.some(isPersonUnit)
    const hasInventory = optionUnits.some(isInventoryUnit)
    if (hasPerson && !hasInventory) personPricedOptions.add(key)
  }

  const totalByOption = new Map<string, number>()
  for (const [unitId, quantity] of Object.entries(quantities)) {
    if (quantity <= 0) continue
    const key = unitToOption.get(unitId)
    if (!key) continue
    totalByOption.set(key, (totalByOption.get(key) ?? 0) + quantity)
  }

  const selectedInventoryByOption = new Map<string, PricingAssignmentUnit[]>()
  const optionsWithExplicitInventorySelection = new Set<string>()
  const inventoryCapacityByUnitId = new Map<string, number>()
  for (const [key, inventoryUnits] of inventoryUnitsByOption) {
    const directlySelected = inventoryUnits.filter(
      (unit) => (quantities[unit.optionUnitId] ?? 0) > 0,
    )
    if (directlySelected.length > 0) optionsWithExplicitInventorySelection.add(key)
    // Legacy accommodation drafts can carry their quantity on the option's
    // person-pricing unit. Keep normalizing those drafts onto the primary room
    // while direct room selections retain their exact unit mix.
    const selected =
      directlySelected.length > 0
        ? directlySelected
        : (totalByOption.get(key) ?? 0) > 0 && inventoryUnits[0]
          ? [inventoryUnits[0]]
          : []
    if (selected.length === 0) continue
    selectedInventoryByOption.set(key, selected)
    for (const unit of selected) {
      const quantity =
        directlySelected.length > 0
          ? (quantities[unit.optionUnitId] ?? 0)
          : (totalByOption.get(key) ?? 0)
      inventoryCapacityByUnitId.set(
        unit.optionUnitId,
        quantity * Math.max(1, unit.occupancyMax ?? 1),
      )
    }
  }

  const assignmentDemandByOption = new Map(totalByOption)
  for (const [key, selected] of selectedInventoryByOption) {
    assignmentDemandByOption.set(
      key,
      selected.reduce(
        (sum, unit) => sum + (inventoryCapacityByUnitId.get(unit.optionUnitId) ?? 0),
        0,
      ),
    )
  }

  const assignedForDefaulting = new Map<string, number>()
  for (const traveler of travelers) {
    const inventorySource = traveler.inventoryUnitSource ?? "auto"
    const pricingSource = traveler.pricingUnitSource ?? "auto"
    const assignedUnitId =
      inventorySource !== "none" && traveler.inventoryUnitId
        ? traveler.inventoryUnitId
        : pricingSource !== "none"
          ? traveler.pricingUnitId
          : null
    if (!assignedUnitId) continue
    const key = unitToOption.get(assignedUnitId)
    if (!key) continue
    assignedForDefaulting.set(key, (assignedForDefaulting.get(key) ?? 0) + 1)
  }

  const optionDemand = Array.from(assignmentDemandByOption.entries())
  const pickOptionWithDemand = () =>
    optionDemand.find(
      ([candidate, total]) => (assignedForDefaulting.get(candidate) ?? 0) < total,
    )?.[0] ?? optionDemand[0]?.[0]

  const resolvePricingUnitForTraveler = (
    traveler: TTraveler,
    key: string,
  ): PricingAssignmentUnit | undefined =>
    pickUnitForAge(
      (unitsByOption.get(key) ?? []).filter(isPersonUnit),
      computeAgeYears(traveler.dateOfBirth, now),
      roleHintForTraveler(traveler),
    )

  const inventoryUsedByUnitId = new Map<string, number>()
  for (const traveler of travelers) {
    if ((traveler.inventoryUnitSource ?? "auto") !== "manual" || !traveler.inventoryUnitId) {
      continue
    }
    if (!inventoryCapacityByUnitId.has(traveler.inventoryUnitId)) continue
    inventoryUsedByUnitId.set(
      traveler.inventoryUnitId,
      (inventoryUsedByUnitId.get(traveler.inventoryUnitId) ?? 0) + 1,
    )
  }

  const pickInventoryUnit = (key: string): PricingAssignmentUnit | null => {
    const selected = selectedInventoryByOption.get(key) ?? []
    const available = selected.find(
      (unit) =>
        (inventoryUsedByUnitId.get(unit.optionUnitId) ?? 0) <
        (inventoryCapacityByUnitId.get(unit.optionUnitId) ?? 0),
    )
    const picked = available ?? selected[0] ?? null
    if (picked) {
      inventoryUsedByUnitId.set(
        picked.optionUnitId,
        (inventoryUsedByUnitId.get(picked.optionUnitId) ?? 0) + 1,
      )
    }
    return picked
  }

  const resolveTargetOption = (
    traveler: TTraveler,
  ): { key: string; fromDemand: boolean } | null => {
    const inventorySource = traveler.inventoryUnitSource ?? "auto"
    if (inventorySource !== "none" && traveler.inventoryUnitId) {
      const inventoryUnit = unitById.get(traveler.inventoryUnitId)
      const key = unitToOption.get(traveler.inventoryUnitId)
      if (key && inventoryUnit && isInventoryUnit(inventoryUnit)) return { key, fromDemand: false }
    }

    const pricingSource = traveler.pricingUnitSource ?? "auto"
    if (pricingSource !== "none" && traveler.pricingUnitId) {
      const pricingUnit = unitById.get(traveler.pricingUnitId)
      const key = unitToOption.get(traveler.pricingUnitId)
      if (key && pricingUnit && isPersonUnit(pricingUnit)) return { key, fromDemand: false }
    }

    const key = pickOptionWithDemand()
    return key ? { key, fromDemand: true } : null
  }

  const nextTravelers = travelers.map((traveler) => {
    const target = resolveTargetOption(traveler)
    const pricingSource = traveler.pricingUnitSource ?? "auto"
    const inventorySource = traveler.inventoryUnitSource ?? "auto"

    if (!target) {
      return {
        ...traveler,
        pricingUnitId: null,
        inventoryUnitId: null,
        pricingUnitSource: pricingSource === "none" ? "none" : "auto",
        inventoryUnitSource: inventorySource === "none" ? "none" : "auto",
      } as TTraveler
    }
    const targetKey = target.key

    const currentPricingUnit = traveler.pricingUnitId
      ? unitById.get(traveler.pricingUnitId)
      : undefined
    const currentPricingKey = traveler.pricingUnitId
      ? unitToOption.get(traveler.pricingUnitId)
      : undefined
    const keepManualPricing =
      pricingSource === "manual" &&
      currentPricingUnit &&
      isPersonUnit(currentPricingUnit) &&
      currentPricingKey === targetKey
    const nextPricingUnit =
      pricingSource === "none"
        ? null
        : keepManualPricing
          ? currentPricingUnit
          : (resolvePricingUnitForTraveler(traveler, targetKey) ?? null)

    const currentInventoryUnit = traveler.inventoryUnitId
      ? unitById.get(traveler.inventoryUnitId)
      : undefined
    const currentInventoryKey = traveler.inventoryUnitId
      ? unitToOption.get(traveler.inventoryUnitId)
      : undefined
    const keepManualInventory =
      inventorySource === "manual" &&
      currentInventoryUnit &&
      isInventoryUnit(currentInventoryUnit) &&
      currentInventoryKey === targetKey &&
      inventoryCapacityByUnitId.has(currentInventoryUnit.optionUnitId)
    const nextInventoryUnit =
      inventorySource === "none"
        ? null
        : keepManualInventory
          ? currentInventoryUnit
          : pickInventoryUnit(targetKey)

    if (target.fromDemand && (nextPricingUnit || nextInventoryUnit)) {
      assignedForDefaulting.set(targetKey, (assignedForDefaulting.get(targetKey) ?? 0) + 1)
    }

    return {
      ...traveler,
      pricingUnitId: nextPricingUnit?.optionUnitId ?? null,
      inventoryUnitId: nextInventoryUnit?.optionUnitId ?? null,
      pricingUnitSource: pricingSource === "none" ? "none" : keepManualPricing ? "manual" : "auto",
      inventoryUnitSource:
        inventorySource === "none" ? "none" : keepManualInventory ? "manual" : "auto",
    } as TTraveler
  })

  const next: BookingDraftQuantities = {}
  const travelerIndexesByUnitId: Record<string, number[]> = {}

  // Accommodation quantities pass through unchanged — 1 DBL room
  // stays 1 line. Person-priced quantities are rebuilt from traveler
  // assignments below.
  for (const [unitId, quantity] of Object.entries(quantities)) {
    if (quantity <= 0) continue
    const key = unitToOption.get(unitId)
    if (!key || personPricedOptions.has(key)) continue
    const submittedUnit = unitById.get(unitId)
    if (
      options.derivePersonQuantitiesForOptionIds?.has(key) === true &&
      submittedUnit &&
      isPersonUnit(submittedUnit) &&
      optionsWithExplicitInventorySelection.has(key)
    ) {
      continue
    }
    // An adult-only legacy accommodation draft used the person unit as an
    // option-level quantity proxy. Preserve that compatibility only while the
    // draft has no explicit room/vehicle selection. Once inventory is selected
    // directly, a person line is an independent fare (for example a coach-tour
    // fare plus SGL/DBL supplements) and must keep its own identity.
    const normalizeLegacyPersonSelection =
      submittedUnit &&
      isPersonUnit(submittedUnit) &&
      !optionsWithExplicitInventorySelection.has(key)
    const targetUnitId = normalizeLegacyPersonSelection
      ? (selectedInventoryByOption.get(key)?.[0]?.optionUnitId ?? unitId)
      : unitId
    next[targetUnitId] = (next[targetUnitId] ?? 0) + quantity
  }

  const assignedByOption = new Map<string, number>()
  for (const [index, traveler] of nextTravelers.entries()) {
    const pricingSource = traveler.pricingUnitSource ?? "auto"
    const inventorySource = traveler.inventoryUnitSource ?? "auto"
    const pricingKey =
      pricingSource !== "none" && traveler.pricingUnitId
        ? unitToOption.get(traveler.pricingUnitId)
        : undefined
    const inventoryKey =
      inventorySource !== "none" && traveler.inventoryUnitId
        ? unitToOption.get(traveler.inventoryUnitId)
        : undefined
    const key = inventoryKey ?? pricingKey
    if (!key) continue
    if (personPricedOptions.has(key)) {
      if (!traveler.pricingUnitId || pricingSource === "none") continue
      const unitIndexes = travelerIndexesByUnitId[traveler.pricingUnitId] ?? []
      unitIndexes.push(index)
      travelerIndexesByUnitId[traveler.pricingUnitId] = unitIndexes
      next[traveler.pricingUnitId] = (next[traveler.pricingUnitId] ?? 0) + 1
      assignedByOption.set(key, (assignedByOption.get(key) ?? 0) + 1)
    } else {
      // A traveler in mixed fare + inventory pricing participates in both
      // booking items: the person fare they pay and the room/vehicle they
      // occupy. The admin form derives that fare from its traveler roster;
      // legacy callers may still opt in by submitting the person quantity.
      const includePersonFare =
        optionsWithExplicitInventorySelection.has(key) &&
        (options.derivePersonQuantitiesForOptionIds?.has(key) === true ||
          (traveler.pricingUnitId ? (quantities[traveler.pricingUnitId] ?? 0) > 0 : false))
      if (traveler.pricingUnitId && pricingSource !== "none" && includePersonFare) {
        const pricingIndexes = travelerIndexesByUnitId[traveler.pricingUnitId] ?? []
        pricingIndexes.push(index)
        travelerIndexesByUnitId[traveler.pricingUnitId] = pricingIndexes
        if (options.derivePersonQuantitiesForOptionIds?.has(key) === true) {
          next[traveler.pricingUnitId] = (next[traveler.pricingUnitId] ?? 0) + 1
        }
      }
      if (traveler.inventoryUnitId && inventorySource !== "none") {
        const inventoryIndexes = travelerIndexesByUnitId[traveler.inventoryUnitId] ?? []
        inventoryIndexes.push(index)
        travelerIndexesByUnitId[traveler.inventoryUnitId] = inventoryIndexes
      }
    }
  }

  // Person-priced residual: operator picked N seats but only added M
  // travelers (M < N) → put the leftover on the option's adult unit
  // so the line-item total matches the stepper.
  for (const [key, total] of totalByOption) {
    if (!personPricedOptions.has(key)) continue
    const assigned = assignedByOption.get(key) ?? 0
    const residual = Math.max(0, total - assigned)
    if (residual === 0) continue
    const adult = pickUnitForAge(unitsByOption.get(key) ?? [], null, "adult")
    if (!adult) continue
    next[adult.optionUnitId] = (next[adult.optionUnitId] ?? 0) + residual
  }

  return { quantities: next, travelers: nextTravelers, travelerIndexesByUnitId }
}

/**
 * Normalize per-person extras to charged traveler quantity and
 * stamp traveler links + `clientLineKey` so the server can link
 * each extra line to the travelers it applies to via
 * `booking_item_travelers`.
 *
 * Per-person mode (`pricingMode === "per_person"` or
 * `pricedPerPerson === true`): quantity multiplied by travelerCount,
 * `travelerKeys` set to all travelers when stable keys are supplied;
 * otherwise `travelerIndexes` is set as a deprecated fallback.
 * Non-per-person lines pass through with `clientLineKey` only.
 */
export function resolveBookingExtraLines<TLine extends ResolvableExtraLine>(options: {
  extraLines: readonly TLine[]
  travelerCount: number
  travelerKeys?: readonly (string | null | undefined)[]
}): TLine[] {
  const travelerIndexes = Array.from({ length: options.travelerCount }, (_, index) => index)
  const travelerKeys = (options.travelerKeys ?? []).filter(
    (key): key is string => typeof key === "string" && key.trim().length > 0,
  )
  const useTravelerKeys = travelerKeys.length === options.travelerCount
  return options.extraLines.map((line) => {
    const perPerson = line.pricingMode === "per_person" || line.pricedPerPerson === true
    if (!perPerson) {
      return {
        ...line,
        clientLineKey: line.clientLineKey ?? `extra:${line.productExtraId}`,
      }
    }
    const quantity = Math.max(1, options.travelerCount) * line.quantity
    return {
      ...line,
      clientLineKey: line.clientLineKey ?? `extra:${line.productExtraId}`,
      quantity,
      totalSellAmountCents:
        line.unitSellAmountCents == null
          ? line.totalSellAmountCents
          : line.unitSellAmountCents * quantity,
      ...(useTravelerKeys ? { travelerKeys } : { travelerIndexes }),
    }
  })
}

/**
 * Project a resolved draft's traveler list into the wire-format
 * `BookingCreateTravelerInput[]` shape the dialog submits. Derives
 * the `travelerCategory` from DOB / role.
 *
 * `roomUnitId` is a deprecated compatibility alias for the pricing tier
 * option unit. Inventory placement is expressed only by item lines and their
 * `travelerKeys`; the server accepts this field but does not persist it.
 */
export function travelersToRows(
  value: { travelers: readonly BookingDraftTraveler[] },
  now: Date = new Date(),
): Array<{
  clientTravelerKey: string | null
  personId: string | null
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  preferredLanguage: string | null
  participantType: "traveler"
  travelerCategory: "adult" | "child" | "infant" | null
  isPrimary: boolean
  roomUnitId: string | null
}> {
  return value.travelers.map((traveler) => ({
    clientTravelerKey: traveler.clientTravelerKey?.trim() || null,
    personId: traveler.personId,
    firstName: traveler.firstName.trim(),
    lastName: traveler.lastName.trim(),
    email: traveler.email.trim() || null,
    phone: traveler.phone.trim() || null,
    preferredLanguage: traveler.preferredLanguage.trim() || null,
    participantType: "traveler",
    travelerCategory: deriveDraftPaxBand(traveler, now),
    isPrimary: traveler.role === "lead",
    roomUnitId: traveler.pricingUnitSource === "none" ? null : traveler.pricingUnitId,
  }))
}
