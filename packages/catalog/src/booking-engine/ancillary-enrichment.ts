import type { AncillaryOfferGroupV1 } from "@voyant-travel/catalog-contracts/booking-engine/ancillary-contracts"
import type { BookingRequirementsV1 } from "./contracts.js"

/**
 * Enrichment of a composed descriptor with live third-party offers.
 *
 * Every vertical builds its own requirements, and asking each of them to also
 * fan out across ancillary providers would put the same orchestration in every
 * handler and let them drift. So the descriptor is enriched in one place, after
 * whichever handler produced it, and a vertical never knows this happened.
 *
 * Catalog deliberately does not depend on commerce for this. The resolver is
 * injected the same way `resolvePromotionEvaluator` is: absent means the
 * deployment has no ancillary source wired, and the step simply does not exist.
 */

/**
 * What the enrichment needs from the session in order to ask for a price.
 *
 * Dates and ages. Nothing that identifies anyone — quoting happens before the
 * traveller has decided anything, so there is no basis for sending a name or a
 * document, and a shape that cannot carry them is a stronger guarantee than a
 * convention.
 */
export interface AncillaryQuoteRequestV1 {
  bookingSessionId: string
  tripStartDate: string
  tripEndDate: string
  destinationCountries: string[]
  travelers: Array<{ ref: string; age: number; band?: string }>
  tripCostMinor?: number
  currency: string
  locale?: string
}

export type AncillaryOfferResolver = (
  request: AncillaryQuoteRequestV1,
) => Promise<AncillaryOfferGroupV1[]>

/** Default ages per band, used when a traveller has not given a date of birth. */
const BAND_AGE_FALLBACK: Record<string, number> = {
  adult: 35,
  senior: 70,
  student: 22,
  child: 8,
  infant: 1,
}

function ageAt(dateOfBirth: string, on: Date): number | null {
  const born = Date.parse(dateOfBirth)
  if (!Number.isFinite(born)) return null
  const bornDate = new Date(born)
  let age = on.getUTCFullYear() - bornDate.getUTCFullYear()
  const monthDelta = on.getUTCMonth() - bornDate.getUTCMonth()
  if (monthDelta < 0 || (monthDelta === 0 && on.getUTCDate() < bornDate.getUTCDate())) age -= 1
  return age >= 0 && age <= 130 ? age : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

/**
 * Derives the quote request from the selection, or `null` when the selection
 * cannot support one yet.
 *
 * Returning `null` rather than guessing is deliberate: an insurer prices on the
 * trip window and the ages, and a request built from placeholder dates would
 * come back with a real price for a trip nobody is taking. The step stays
 * hidden until the selection can answer the question honestly.
 */
export function ancillaryQuoteRequestFromSelection(input: {
  bookingSessionId: string
  selection: unknown
  /** Absent on a session created before scope carried one; there is then no
   *  currency to be quoted in, and asking anyway would invent one. */
  currency: string | undefined
  now: Date
  locale?: string
}): AncillaryQuoteRequestV1 | null {
  const selection = asRecord(input.selection)
  if (!selection || !input.currency) return null

  const configure = asRecord(selection.configure)
  const dateRange = asRecord(configure?.dateRange)
  const tripStartDate = asString(dateRange?.checkIn) ?? asString(configure?.departureDate)
  const tripEndDate = asString(dateRange?.checkOut) ?? tripStartDate
  if (!tripStartDate || !tripEndDate) return null

  const travelerRows = Array.isArray(selection.travelers) ? selection.travelers : []
  const currency = input.currency
  const travelers: AncillaryQuoteRequestV1["travelers"] = []
  for (const [index, row] of travelerRows.entries()) {
    const traveler = asRecord(row)
    if (!traveler) continue
    const band = asString(traveler.band)
    const dateOfBirth = asString(traveler.dateOfBirth)
    const age =
      (dateOfBirth ? ageAt(dateOfBirth, new Date(tripStartDate)) : null) ??
      (band ? BAND_AGE_FALLBACK[band] : undefined)
    if (age === undefined || age === null) continue
    travelers.push({
      ref: asString(traveler.rowId) ?? `traveler-${index}`,
      age,
      ...(band ? { band } : {}),
    })
  }
  if (travelers.length === 0) return null

  return {
    bookingSessionId: input.bookingSessionId,
    tripStartDate,
    tripEndDate,
    destinationCountries: [],
    travelers,
    currency,
    ...(input.locale ? { locale: input.locale } : {}),
  }
}

/**
 * Folds resolved groups into a descriptor.
 *
 * A group with no offers still counts as "connected but nothing to sell", and
 * that is not the same as having nothing connected — the first can be explained
 * to a traveller, the second must render nothing at all. So `showsAncillaries`
 * follows whether any group came back, not whether any offer did.
 */
export function withAncillaryOffers(
  requirements: BookingRequirementsV1,
  groups: readonly AncillaryOfferGroupV1[],
): BookingRequirementsV1 {
  if (groups.length === 0) return requirements
  return {
    ...requirements,
    showsAncillaries: true,
    ancillaries: { groups: [...groups] },
  }
}

/**
 * Resolves and folds in one step, swallowing a resolver failure.
 *
 * An ancillary is an optional extra. A provider outage, a misconfiguration or a
 * slow fan-out must degrade to "no offers" and let the traveller finish
 * checking out — never take the descriptor, and therefore the booking, down
 * with it. The resolver is already responsible for per-provider timeouts; this
 * is the backstop for the resolver itself failing.
 */
export async function enrichRequirementsWithAncillaries(input: {
  requirements: BookingRequirementsV1
  request: AncillaryQuoteRequestV1 | null
  resolve: AncillaryOfferResolver | undefined
  onError?: (error: unknown) => void
}): Promise<BookingRequirementsV1> {
  if (!input.resolve || !input.request) return input.requirements
  try {
    const groups = await input.resolve(input.request)
    return withAncillaryOffers(input.requirements, groups)
  } catch (error) {
    input.onError?.(error)
    return input.requirements
  }
}
