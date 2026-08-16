import type {
  CabinClass,
  FareBreakdown,
  FlightOffer,
  FlightSearchRequest,
  FlightSegment,
  FlightSlice,
  Itinerary,
} from "@voyant-travel/flights/contract/types"

import {
  AIRCRAFT_TYPES,
  addDays,
  CABIN_PRICE_MULT,
  CARRIERS,
  type DemoCarrier,
  durationOfItinerary,
  hashRequest,
  minutesToIso8601,
  mulberry32,
  routeOperatesOn,
  setHourMinute,
} from "./synthesis-common.js"
import { synthesizeFareBundles } from "./synthesis-fare-bundles.js"

/** Total offer pool generated per route — server applies filters + pagination. */
const POOL_SIZE = 32
/** Default page size when caller omits pagination.limit. */
const _DEFAULT_PAGE_SIZE = 20

/**
 * Compact, deterministic signature of the searched legs — origin, destination,
 * and date for every slice. This is embedded verbatim in each offer id so that
 * opposite directions of a round trip (e.g. BCN→FCO outbound vs FCO→BCN return)
 * ALWAYS produce different ids, independent of the request hash. The booking
 * page reads the outbound and return offers from the query cache keyed by id,
 * so a shared id would make both legs resolve to the same offer (#2652).
 */
function routeSignature(slices: FlightSlice[]): string {
  return slices
    .map((slice) => `${slice.origin}${slice.destination}${slice.departureDate.replace(/-/g, "")}`)
    .join("-")
}

export function synthesizeOffers(request: FlightSearchRequest): FlightOffer[] {
  // A trip is only sellable when every leg operates on its date. Returning
  // nothing here is what the fare calendar reports as an unavailable day.
  const operates = request.slices.every((slice) =>
    routeOperatesOn(slice.origin, slice.destination, slice.departureDate),
  )
  if (!operates) return []

  // Hash without pagination so the same route produces the same pool across
  // page navigations — pagination is applied as a slice on top of the pool.
  const { pagination: _ignored, ...rest } = request
  const seed = hashRequest(rest)
  const rand = mulberry32(seed)
  const cabin = request.cabin ?? "economy"
  // Direction + date entropy, explicit in the id so it cannot collide with the
  // reverse leg even if the request hash were to (the hash is a 32-bit digest).
  const route = routeSignature(request.slices)

  const offers: FlightOffer[] = []
  for (let i = 0; i < POOL_SIZE; i++) {
    const carrier = CARRIERS[Math.floor(rand() * CARRIERS.length)]
    if (!carrier) continue

    // Stops: 60% nonstop, 30% one-stop, 10% two-stop. Low-cost carriers
    // (U2, FR) skew nonstop for short-haul.
    const stopsRoll = rand()
    let stops = 0
    if (carrier.basePriceMultiplier > 0.7) {
      if (stopsRoll > 0.4 && stopsRoll <= 0.7) stops = 1
      else if (stopsRoll > 0.9) stops = 2
    }

    const itineraries: Itinerary[] = []
    for (const slice of request.slices) {
      const offsetHours = 5 + Math.floor(rand() * 17) // 05:00 .. 22:00
      itineraries.push(buildItinerary(slice, carrier, stops, cabin, offsetHours, rand, i))
    }

    const totalMinutes = itineraries.reduce(
      (acc, itin) => acc + (durationOfItinerary(itin) ?? 0),
      0,
    )
    const baseFarePerAdult = priceFor(carrier, cabin, totalMinutes, rand)
    const fareBreakdowns = buildFareBreakdowns(request.passengers, baseFarePerAdult)
    const totalAmount = fareBreakdowns.reduce(
      (sum, b) => sum + Number(b.total.amount) * b.passengerCount,
      0,
    )

    const offerId = `demo_${route}_${seed.toString(36)}_${i}`

    offers.push({
      offerId,
      source: "demo",
      itineraries,
      fareBreakdowns,
      totalPrice: { amount: totalAmount.toFixed(2), currency: "EUR" },
      validatingCarrier: carrier.code,
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      lastTicketingDate: addDays(new Date(), 1).toISOString().slice(0, 10),
      instantTicketing: false,
      fareBundles: synthesizeFareBundles(carrier, cabin, totalMinutes),
    })
  }

  // Sort cheapest first — most expected ordering for ecommerce search.
  offers.sort((a, b) => Number(a.totalPrice.amount) - Number(b.totalPrice.amount))
  return offers
}

function buildItinerary(
  slice: FlightSlice,
  carrier: DemoCarrier,
  stops: number,
  cabin: CabinClass,
  startHour: number,
  rand: () => number,
  variant: number,
): Itinerary {
  const segments: FlightSegment[] = []
  const baseDate = slice.departureDate

  // Direct: one segment origin → destination
  // 1 stop : origin → hub → destination
  // 2 stops: origin → hub → hub2 → destination
  const stations: string[] = [slice.origin]
  if (stops >= 1) stations.push(carrier.hubs[0] ?? "AMS")
  if (stops >= 2) stations.push(carrier.hubs[1] ?? carrier.hubs[0] ?? "FRA")
  stations.push(slice.destination)
  // Avoid silly self-routing when origin/destination IS the hub.
  for (let i = 1; i < stations.length - 1; i++) {
    if (stations[i] === stations[0] || stations[i] === stations[stations.length - 1]) {
      stations.splice(i, 1)
      i--
    }
  }

  let cursor = setHourMinute(baseDate, startHour, Math.floor(rand() * 12) * 5)
  for (let i = 0; i < stations.length - 1; i++) {
    const from = stations[i] as string
    const to = stations[i + 1] as string
    const flightMinutes = 60 + Math.floor(rand() * 240) // 1h..5h per leg
    const departureAt = cursor
    const arrivalAt = new Date(departureAt.getTime() + flightMinutes * 60_000)

    segments.push({
      segmentId: `${carrier.code}-${variant}-${i}`,
      carrierCode: carrier.code,
      flightNumber: String(100 + Math.floor(rand() * 8000)),
      departure: { iataCode: from, at: departureAt.toISOString() },
      arrival: { iataCode: to, at: arrivalAt.toISOString() },
      duration: minutesToIso8601(flightMinutes),
      aircraft: AIRCRAFT_TYPES[Math.floor(rand() * AIRCRAFT_TYPES.length)],
      cabin,
    })

    // Layover: 1h..3h
    const layover = 60 + Math.floor(rand() * 120)
    cursor = new Date(arrivalAt.getTime() + layover * 60_000)
  }

  const totalMinutes =
    (new Date(segments[segments.length - 1]!.arrival.at).getTime() -
      new Date(segments[0]!.departure.at).getTime()) /
    60_000

  return { segments, duration: minutesToIso8601(Math.round(totalMinutes)) }
}

function buildFareBreakdowns(
  pax: FlightSearchRequest["passengers"],
  baseFarePerAdult: number,
): FareBreakdown[] {
  const out: FareBreakdown[] = []
  const breakdown = (
    type: "adult" | "child" | "infant",
    count: number,
    multiplier: number,
  ): FareBreakdown => {
    const base = baseFarePerAdult * multiplier
    const tax = base * 0.18
    const total = base + tax
    return {
      passengerType: type,
      passengerCount: count,
      baseFare: { amount: base.toFixed(2), currency: "EUR" },
      taxes: { amount: tax.toFixed(2), currency: "EUR" },
      total: { amount: total.toFixed(2), currency: "EUR" },
    }
  }
  if (pax.adults > 0) out.push(breakdown("adult", pax.adults, 1))
  if (pax.children && pax.children > 0) out.push(breakdown("child", pax.children, 0.75))
  if (pax.infants && pax.infants > 0) out.push(breakdown("infant", pax.infants, 0.1))
  return out
}

function priceFor(
  carrier: DemoCarrier,
  cabin: CabinClass,
  totalMinutes: number,
  rand: () => number,
): number {
  // Roughly: €0.5/minute for short-haul economy, scaled by carrier + cabin
  // + a small jitter so identical itineraries don't all land on the same
  // fare. Floor of €40 (low-cost short-haul).
  const base = Math.max(40, totalMinutes * 0.5)
  const jitter = 0.85 + rand() * 0.3
  return base * carrier.basePriceMultiplier * CABIN_PRICE_MULT[cabin] * jitter
}

/**
 * Apply server-side filters from `request.searchOptions` to the offer pool
 * BEFORE pagination. Mirrors what a real GDS adapter would do — filters
 * are part of the search query, not a client-side post-process, so the
 * `total` we return matches what a paginated UI navigates through.
 */
export function applySearchFilters(
  offers: FlightOffer[],
  request: FlightSearchRequest,
): FlightOffer[] {
  const opts = request.searchOptions
  if (!opts) return offers

  return offers.filter((offer) => {
    // Carriers — match any (the offer carries it on at least one segment)
    if (opts.includeCarriers && opts.includeCarriers.length > 0) {
      const carriers = new Set<string>()
      for (const it of offer.itineraries) for (const s of it.segments) carriers.add(s.carrierCode)
      if (!opts.includeCarriers.some((c) => carriers.has(c))) return false
    }
    if (opts.excludeCarriers && opts.excludeCarriers.length > 0) {
      const carriers = new Set<string>()
      for (const it of offer.itineraries) for (const s of it.segments) carriers.add(s.carrierCode)
      if (opts.excludeCarriers.some((c) => carriers.has(c))) return false
    }
    // Stops — `directOnly` overrides `maxStops`
    const maxStops = opts.directOnly ? 0 : opts.maxStops
    if (maxStops != null) {
      const offerMax = Math.max(0, ...offer.itineraries.map((i) => i.segments.length - 1))
      if (offerMax > maxStops) return false
    }
    // Price cap — same-currency (demo is all EUR)
    if (opts.maxPrice != null) {
      if (Number(offer.totalPrice.amount) > opts.maxPrice) return false
    }
    return true
  })
}

export function parsePageCursor(cursor: string | undefined): number {
  if (!cursor) return 1
  const n = Number(cursor)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}
