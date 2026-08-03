import type { PricingCategoryRecord } from "@voyant-travel/commerce-react/pricing"
import type { BookingsUiMessages } from "../i18n/messages.js"
import { formatMessage } from "../i18n/provider.js"
import type { BookingCreatePaymentScheduleInput, PricingPreviewSnapshot } from "../index.js"
import type { OptionUnitsStepperUnit } from "./option-units-stepper-section.js"
import type { PaymentScheduleValue } from "./payment-schedule-section.js"
import type { TravelerEntry, TravelerPricingCategoryOption } from "./travelers-section.js"

export function generateBookingNumber(): string {
  const now = new Date()
  const y = now.getFullYear().toString().slice(-2)
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const seq = String(Math.floor(Math.random() * 9000) + 1000)
  return `BK-${y}${m}-${seq}`
}

export function paymentScheduleToRows(
  value: PaymentScheduleValue,
  currency: string,
  totalAmountCents: number | null,
): BookingCreatePaymentScheduleInput[] {
  if (value.mode === "full") {
    const installment = value.installments[0]
    if (!installment?.dueDate || totalAmountCents === null) return []
    return [
      {
        scheduleType: "balance",
        status: installment.alreadyPaid ? "paid" : "due",
        dueDate: installment.dueDate,
        currency,
        amountCents: totalAmountCents,
        notes: paidScheduleNotes(
          installment.alreadyPaid,
          installment.paymentDate,
          installment.paymentMethod,
          installment.paymentReference,
        ),
      },
    ]
  }

  // split — N installments
  const rows: BookingCreatePaymentScheduleInput[] = []
  for (const [idx, installment] of value.installments.entries()) {
    if (!installment.dueDate || installment.amountCents == null) continue
    rows.push({
      scheduleType: "installment",
      // First installment defaults to `due` (immediately collectable),
      // subsequent ones to `pending` so the dashboard's "next due" picker
      // doesn't flag them all at once.
      status: installment.alreadyPaid ? "paid" : idx === 0 ? "due" : "pending",
      dueDate: installment.dueDate,
      currency,
      amountCents: installment.amountCents,
      notes: paidScheduleNotes(
        installment.alreadyPaid,
        installment.paymentDate,
        installment.paymentMethod,
        installment.paymentReference,
      ),
    })
  }
  return rows
}

function paidScheduleNotes(
  alreadyPaid: boolean,
  paymentDate: string | null,
  paymentMethod: string,
  paymentReference: string,
) {
  if (!alreadyPaid) return null
  return JSON.stringify({
    alreadyPaid: true,
    paymentDate,
    paymentMethod,
    paymentReference: paymentReference.trim() || null,
  })
}

/**
 * Pick the option-unit that matches a given age. Falls back to an
 * ADULT-coded unit when no min/max window matches, then to the first
 * unit in the option. When `age` is null (no DOB), prefer ADULT.
 */
/**
 * The catalog stepper builds unit names like "Standard double - Adult"
 * when an option has multiple units. The Room dropdown wants the bare
 * option name ("Standard double"), so we trim off the trailing
 * "- <unit>" suffix for display.
 */
export function stripUnitSuffix(name: string): string {
  const idx = name.lastIndexOf(" - ")
  return idx > 0 ? name.slice(0, idx) : name
}

/**
 * Whether any payment-schedule entry has already been paid. The Booking
 * remains a committed Booking either way; this only selects the appropriate
 * payment intent and Finance-owned schedule state.
 */
export function hasAnyPaidPayment(schedule: PaymentScheduleValue): boolean {
  return schedule.installments.some((installment) => installment.alreadyPaid)
}

export function findAlreadyPaidInstallmentMissingPaymentDate(
  schedule: PaymentScheduleValue,
): number | null {
  const index = schedule.installments.findIndex(
    (installment) => installment.alreadyPaid && !installment.paymentDate?.trim(),
  )
  return index >= 0 ? index : null
}

/**
 * Inverse of stripUnitSuffix — strip the leading "Option name - " so
 * the per-unit label stands alone for category buttons.
 */
export function stripOptionPrefix(name: string): string {
  const idx = name.indexOf(" - ")
  return idx > 0 ? name.slice(idx + 3) : name
}

export function sameRoomUnits(
  left: OptionUnitsStepperUnit[],
  right: OptionUnitsStepperUnit[],
): boolean {
  if (left.length !== right.length) return false
  return left.every((unit, index) => {
    const other = right[index]
    return (
      other !== undefined &&
      unit.optionId === other.optionId &&
      unit.optionUnitId === other.optionUnitId &&
      unit.unitName === other.unitName &&
      unit.unitCode === other.unitCode &&
      unit.unitType === other.unitType &&
      unit.minAge === other.minAge &&
      unit.maxAge === other.maxAge &&
      unit.occupancyMax === other.occupancyMax &&
      unit.remaining === other.remaining
    )
  })
}

export function inferTravelerPricingCategoryId(
  traveler: TravelerEntry,
  categories: ReadonlyArray<TravelerPricingCategoryOption>,
): string | null {
  if (traveler.pricingCategoryId) return traveler.pricingCategoryId
  const pool = traveler.inventoryUnitId
    ? categories.filter((category) => category.unitIds.includes(traveler.inventoryUnitId ?? ""))
    : categories
  if (pool.length === 0) return null
  const roleType = traveler.role === "child" || traveler.role === "infant" ? traveler.role : "adult"
  return (
    pool.find((category) => category.categoryType === roleType)?.categoryId ??
    pool[0]?.categoryId ??
    null
  )
}

function toStepperUnitType(
  value: string | null | undefined,
): OptionUnitsStepperUnit["unitType"] | null {
  if (
    value === "person" ||
    value === "group" ||
    value === "room" ||
    value === "vehicle" ||
    value === "service" ||
    value === "other"
  ) {
    return value
  }
  return null
}

export function normalizeBookingUnit(unit: OptionUnitsStepperUnit): OptionUnitsStepperUnit {
  return {
    ...unit,
    unitType: unit.unitType ?? (unit.occupancyMax != null ? "room" : null),
  }
}

export function isBookingInventoryUnit(
  unit: Pick<OptionUnitsStepperUnit, "unitType" | "occupancyMax">,
): boolean {
  return unit.unitType === "room" || unit.unitType === "vehicle" || unit.occupancyMax != null
}

export function pricingSnapshotRoomUnits(
  snapshot: PricingPreviewSnapshot | null | undefined,
): OptionUnitsStepperUnit[] {
  if (!snapshot) return []
  const unitsById = new Map<string, OptionUnitsStepperUnit>()
  for (const unitPrice of snapshot.unitPrices) {
    if (unitPrice.unitType !== "room" && unitPrice.unitType !== "vehicle") continue
    if (unitsById.has(unitPrice.unitId)) continue
    unitsById.set(unitPrice.unitId, {
      optionId: unitPrice.optionId,
      optionUnitId: unitPrice.unitId,
      unitName: unitPrice.unitName ?? unitPrice.unitId,
      unitCode: null,
      minAge: null,
      maxAge: null,
      unitType: toStepperUnitType(unitPrice.unitType) ?? "room",
      occupancyMax: unitPrice.occupancyMax,
      initial: null,
      reserved: 0,
      remaining: null,
    })
  }
  return Array.from(unitsById.values())
}

export function mergePricingRoomMetadata(
  units: readonly OptionUnitsStepperUnit[],
  pricingUnits: readonly OptionUnitsStepperUnit[],
): OptionUnitsStepperUnit[] {
  if (pricingUnits.length === 0) return units.map(normalizeBookingUnit)
  const pricingUnitById = new Map(pricingUnits.map((unit) => [unit.optionUnitId, unit]))
  const seen = new Set<string>()
  const merged = units.map((unit) => {
    seen.add(unit.optionUnitId)
    const pricingUnit = pricingUnitById.get(unit.optionUnitId)
    if (!pricingUnit) return normalizeBookingUnit(unit)
    return normalizeBookingUnit({
      ...pricingUnit,
      ...unit,
      optionId: unit.optionId ?? pricingUnit.optionId,
      unitName: unit.unitName || pricingUnit.unitName,
      unitType: unit.unitType ?? pricingUnit.unitType,
      occupancyMax: unit.occupancyMax ?? pricingUnit.occupancyMax,
    })
  })
  for (const pricingUnit of pricingUnits) {
    if (!seen.has(pricingUnit.optionUnitId)) merged.push(pricingUnit)
  }
  return merged
}

export type PricingCategoryLike = Pick<
  PricingCategoryRecord,
  "id" | "name" | "code" | "minAge" | "maxAge" | "sortOrder"
> & {
  categoryType: string
}

interface PayloadResolverMismatch {
  kind: "qty" | "missing" | "extra"
  optionUnitId: string
  submittedQuantity: number
  resolvedQuantity: number
}

export function isPayloadResolverMismatchBody(
  body: unknown,
): body is { code: "payload_resolver_mismatch"; mismatches: PayloadResolverMismatch[] } {
  if (typeof body !== "object" || body === null) return false
  const candidate = body as { code?: unknown; mismatches?: unknown }
  return (
    candidate.code === "payload_resolver_mismatch" &&
    Array.isArray(candidate.mismatches) &&
    candidate.mismatches.every((mismatch) => {
      if (typeof mismatch !== "object" || mismatch === null) return false
      const item = mismatch as Record<string, unknown>
      return (
        (item.kind === "qty" || item.kind === "missing" || item.kind === "extra") &&
        typeof item.optionUnitId === "string" &&
        typeof item.submittedQuantity === "number" &&
        typeof item.resolvedQuantity === "number"
      )
    })
  )
}

export function formatPayloadResolverMismatchError(
  body: { mismatches: PayloadResolverMismatch[] },
  unitLabels: Record<string, string>,
  validationMessages: BookingsUiMessages["bookingCreateDialog"]["validation"],
) {
  const details = body.mismatches
    .map((mismatch) => {
      const label = unitLabels[mismatch.optionUnitId] ?? mismatch.optionUnitId
      return formatMessage(validationMessages.payloadResolverMismatchLine, {
        label,
        resolvedQuantity: mismatch.resolvedQuantity,
        submittedQuantity: mismatch.submittedQuantity,
      })
    })
    .join("; ")

  return details
    ? formatMessage(validationMessages.payloadResolverMismatchDetails, { details })
    : validationMessages.payloadResolverMismatchFallback
}
