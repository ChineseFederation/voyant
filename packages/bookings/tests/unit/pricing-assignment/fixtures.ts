import type {
  BookingDraftTraveler,
  PricingAssignmentUnit,
} from "../../../src/pricing-assignment.js"

export const NOW = new Date("2026-05-25T00:00:00.000Z")

export function unit(
  partial: Partial<PricingAssignmentUnit> & Pick<PricingAssignmentUnit, "optionUnitId">,
): PricingAssignmentUnit {
  return {
    optionId: partial.optionId ?? "opto_day_tour",
    optionUnitId: partial.optionUnitId,
    unitName: partial.unitName ?? partial.optionUnitId,
    unitCode: partial.unitCode ?? null,
    minAge: partial.minAge ?? null,
    maxAge: partial.maxAge ?? null,
    unitType: partial.unitType ?? "person",
    occupancyMax: partial.occupancyMax ?? null,
  }
}

export function traveler(partial: Partial<BookingDraftTraveler> = {}): BookingDraftTraveler {
  return {
    clientTravelerKey: partial.clientTravelerKey ?? null,
    personId: partial.personId ?? null,
    firstName: partial.firstName ?? "Test",
    lastName: partial.lastName ?? "Traveler",
    email: partial.email ?? "",
    phone: partial.phone ?? "",
    preferredLanguage: partial.preferredLanguage ?? "",
    role: partial.role ?? "adult",
    dateOfBirth: partial.dateOfBirth ?? null,
    pricingUnitId: partial.pricingUnitId ?? null,
    inventoryUnitId: partial.inventoryUnitId ?? null,
    pricingUnitSource: partial.pricingUnitSource ?? "auto",
    inventoryUnitSource: partial.inventoryUnitSource ?? "auto",
  }
}
