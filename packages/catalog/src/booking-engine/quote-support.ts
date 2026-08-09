import { paxBandBaseCode } from "@voyant-travel/catalog-contracts/booking-engine/requirements-defaults"

/**
 * Translate canonical Booking Session selection state into adapter parameters.
 * This is shared by Session quote/commit and the staff quote tool; it is not a
 * second persistence or transport lifecycle.
 */
export function engineParametersFromSelection(
  parameters: Record<string, unknown> | undefined,
  selectionPayload: unknown,
  context: {
    entityModule?: string
    sourceKind?: string
    sourceProvider?: string
  } = {},
): Record<string, unknown> {
  const selection = asRecord(selectionPayload)
  const configure = asRecord(selection?.configure)
  const departureSlotId = stringValue(configure?.departureSlotId)
  const departureDate = stringValue(configure?.departureDate)
  const departureAirportCode = stringValue(configure?.departureAirportCode)
  const nights = positiveInteger(configure?.nights)
  const paxCount = sumPax(configure?.pax)
  const next: Record<string, unknown> = {
    ...(parameters ?? {}),
    ...(selection ? { draft: selection } : {}),
  }

  if (departureSlotId) {
    if (next.departureSlotId == null) next.departureSlotId = departureSlotId
    if (next.departure_id == null) next.departure_id = departureSlotId
    if (next.slotId == null) next.slotId = departureSlotId
  }
  if (departureDate && next.departureDate == null) next.departureDate = departureDate
  if (departureAirportCode && next.departureAirportCode == null) {
    next.departureAirportCode = departureAirportCode
  }
  if (nights && next.nights == null) next.nights = nights
  if (paxCount > 0 && next.paxCount == null) next.paxCount = paxCount
  for (const key of ["roomTypeId", "ratePlanId", "board"] as const) {
    const value = stringValue(configure?.[key])
    if (value && next[key] == null) next[key] = value
  }
  for (const key of [
    "sailingId",
    "cabinCategoryId",
    "cabinCategoryRef",
    "occupancy",
    "passengerComposition",
    "fareCode",
    "fareVariant",
    "bookingTerms",
  ] as const) {
    if (configure?.[key] != null && next[key] == null) next[key] = configure[key]
  }
  const promotionCode = stringValue(selection?.promotionCode)
  if (promotionCode && next.promotionCode == null) next.promotionCode = promotionCode
  applyConnectPackageConfirmParameters(next, selection, context)

  return next
}

function applyConnectPackageConfirmParameters(
  parameters: Record<string, unknown>,
  selection: Record<string, unknown> | undefined,
  context: { entityModule?: string; sourceKind?: string },
): void {
  if (!selection || !isConnectPackageCandidate(parameters, selection, context)) return
  if (parameters.connectRoute == null) parameters.connectRoute = "packages"

  const billing = asRecord(selection.billing)
  const contact = asRecord(billing?.contact)
  const mappedContact = mapPackageContact(contact)
  if (mappedContact && parameters.contact == null) parameters.contact = mappedContact

  const travelers = mapPackageTravelers(selection.travelers, contact)
  if (travelers.length === 0) return
  if (parameters.travelers == null) parameters.travelers = travelers
  if (parameters.leadTraveler == null) {
    parameters.leadTraveler =
      travelers.find((traveler) => traveler.isPrimary === true) ?? travelers[0]
  }
}

function isConnectPackageCandidate(
  parameters: Record<string, unknown>,
  selection: Record<string, unknown>,
  context: { entityModule?: string; sourceKind?: string },
): boolean {
  if (parameters.connectRoute === "packages") return true
  if (context.sourceKind !== "voyant-connect") return false
  const entityModule = context.entityModule ?? stringValue(asRecord(selection.entity)?.module)
  if (entityModule !== "products") return false
  const configure = asRecord(selection.configure)
  return Boolean(
    stringValue(configure?.roomTypeId) ||
      stringValue(configure?.ratePlanId) ||
      stringValue(configure?.board),
  )
}

function mapPackageContact(
  contact: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const email = stringValue(contact?.email)
  const phone = stringValue(contact?.phone)
  if (!email && !phone) return undefined
  return {
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
  }
}

function mapPackageTravelers(
  travelersValue: unknown,
  fallbackContact: Record<string, unknown> | undefined,
): Array<Record<string, unknown>> {
  const travelers = Array.isArray(travelersValue) ? travelersValue : []
  const mapped = travelers
    .map((value, index) => mapPackageTraveler(asRecord(value), index))
    .filter((value): value is Record<string, unknown> => value !== undefined)
  if (mapped.length > 0) return mapped

  const firstName = stringValue(fallbackContact?.firstName)
  const lastName = stringValue(fallbackContact?.lastName)
  if (!firstName || !lastName) return []
  return [
    {
      category: "adult",
      firstName,
      lastName,
      ...(stringValue(fallbackContact?.email)
        ? { email: stringValue(fallbackContact?.email) }
        : {}),
      ...(stringValue(fallbackContact?.phone)
        ? { phone: stringValue(fallbackContact?.phone) }
        : {}),
      isPrimary: true,
    },
  ]
}

function mapPackageTraveler(
  traveler: Record<string, unknown> | undefined,
  index: number,
): Record<string, unknown> | undefined {
  const firstName = stringValue(traveler?.firstName)
  const lastName = stringValue(traveler?.lastName)
  if (!firstName || !lastName) return undefined
  const documents = asRecord(traveler?.documents)
  const sex = packageTravelerSex(stringValue(documents?.sex) ?? stringValue(documents?.gender))
  return {
    category: packageTravelerCategory(stringValue(traveler?.band)),
    firstName,
    lastName,
    ...(stringValue(traveler?.dateOfBirth)
      ? { dateOfBirth: stringValue(traveler?.dateOfBirth) }
      : {}),
    ...(sex ? { sex } : {}),
    ...(stringValue(documents?.title) ? { title: stringValue(documents?.title) } : {}),
    ...(stringValue(documents?.nationality)
      ? { nationality: stringValue(documents?.nationality) }
      : {}),
    ...(stringValue(traveler?.email) ? { email: stringValue(traveler?.email) } : {}),
    ...(stringValue(traveler?.phone) ? { phone: stringValue(traveler?.phone) } : {}),
    isPrimary: traveler?.isPrimary === true || index === 0,
  }
}

/**
 * Canonical traveler category for a pax band code. A product selling
 * several tiers of one category qualifies the band ("child:pricing_…"),
 * and the package supplier is only ever told the category.
 */
function packageTravelerCategory(value: string | null): "adult" | "child" | "infant" | "senior" {
  const base = value == null ? null : paxBandBaseCode(value)
  if (base === "child" || base === "infant" || base === "senior") return base
  return "adult"
}

function packageTravelerSex(value: string | null): "male" | "female" | "unspecified" | undefined {
  if (value === "male" || value === "female" || value === "unspecified") return value
  if (value === "m") return "male"
  if (value === "f") return "female"
  return undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null
}

function sumPax(value: unknown): number {
  const pax = asRecord(value)
  if (!pax) return 0
  let total = 0
  for (const count of Object.values(pax)) {
    if (typeof count === "number" && Number.isFinite(count) && count > 0) total += count
  }
  return total
}
