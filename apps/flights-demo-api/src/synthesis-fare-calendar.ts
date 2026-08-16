/**
 * Fare-calendar synthesis for the demo flight service.
 *
 * Every quoted day is priced by running the *real* offer synthesis for that
 * date and taking the cheapest survivor. That is deliberately more work than
 * a standalone price model would be: it guarantees the number the picker
 * shows for a day is the number a search on that day actually returns, and
 * that a greyed-out day is one search genuinely finds nothing for.
 *
 * Real connectors serve this from cached lowest-fare data instead, which is
 * why the contract calls the prices indicative and callers re-quote before
 * booking.
 */

import type {
  FareCalendarDay,
  FareCalendarRequest,
  FareCalendarResponse,
  FlightSearchRequest,
  FlightSlice,
} from "@voyant-travel/flights/contract/types"

import { applySearchFilters, synthesizeOffers } from "./synthesis-offers.js"

/** Demo quotes are cheap to recompute; keep the freshness window short. */
const QUOTE_TTL_MS = 15 * 60_000

/** Hard stop on how many days one call will price, mirroring the route's cap. */
const MAX_DAYS = 92

export function synthesizeFareCalendar(request: FareCalendarRequest): FareCalendarResponse {
  const days: FareCalendarDay[] = []

  for (const date of eachDate(request.from, request.to, MAX_DAYS)) {
    const searchRequest = searchForDate(request, date)
    const offers = applySearchFilters(synthesizeOffers(searchRequest), searchRequest)
    const cheapest = offers.reduce<(typeof offers)[number] | undefined>(
      (best, offer) =>
        best && Number(best.totalPrice.amount) <= Number(offer.totalPrice.amount) ? best : offer,
      undefined,
    )

    if (!cheapest) {
      days.push({ date, available: false })
      continue
    }

    days.push({
      date,
      available: true,
      cheapestPrice: cheapest.totalPrice,
      offerCount: offers.length,
    })
  }

  return {
    days,
    expiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
  }
}

/**
 * The search a given calendar day stands for. With `returnAfterDays` the day
 * is priced as the whole round trip, because that is what the traveller
 * actually buys when they pick a departure date in a round-trip picker.
 */
function searchForDate(request: FareCalendarRequest, departureDate: string): FlightSearchRequest {
  const slices: FlightSlice[] = [
    { origin: request.origin, destination: request.destination, departureDate },
  ]
  if (request.returnAfterDays != null) {
    slices.push({
      origin: request.destination,
      destination: request.origin,
      departureDate: shiftDate(departureDate, request.returnAfterDays),
    })
  }
  return {
    slices,
    passengers: request.passengers,
    cabin: request.cabin,
    searchOptions: request.searchOptions,
  }
}

/** Inclusive `yyyy-MM-dd` walk, capped so a bad window can't spin. */
function* eachDate(from: string, to: string, maxDays: number): Generator<string> {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return

  const total = Math.min(Math.floor((end - start) / 86_400_000) + 1, maxDays)
  for (let i = 0; i < total; i++) {
    yield new Date(start + i * 86_400_000).toISOString().slice(0, 10)
  }
}

function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}
