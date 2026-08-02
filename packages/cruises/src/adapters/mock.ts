/**
 * In-memory CruiseAdapter for tests and templates that need a working
 * external source without a real upstream.
 *
 * Seed it via the `add*` methods; queries against the registered data work
 * exactly like a real adapter would. Booking commits return synthesized
 * confirmation refs and increment a per-instance counter.
 */

import type {
  CreateExternalBookingInput,
  CruiseAdapter,
  CruiseSearchProjectionEntry,
  ExternalBookingResult,
  ExternalCruise,
  ExternalCruiseSummary,
  ExternalItineraryDay,
  ExternalPriceRow,
  ExternalSailing,
  ExternalShip,
  ListEntriesOptions,
  ListEntriesResult,
  SourceRef,
} from "./index.js"

export type MockCruiseAdapterOptions = {
  name?: string
  version?: string
  /** Auto-fail every nth call to surface upstream-error handling in tests. */
  failEveryNthCall?: number
}

type SeededCruise = {
  cruise: ExternalCruise
  sailings: ExternalSailing[]
  itinerariesBySailing: Map<string, ExternalItineraryDay[]>
  pricingBySailing: Map<string, ExternalPriceRow[]>
}

function refKey(ref: SourceRef): string {
  return JSON.stringify(sortValue(ref))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (!value || typeof value !== "object") return value
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) {
    out[key] = sortValue((value as Record<string, unknown>)[key])
  }
  return out
}

export class MockCruiseAdapter implements CruiseAdapter {
  readonly name: string
  readonly version: string

  private readonly cruisesByRef = new Map<string, SeededCruise>()
  private readonly shipsByRef = new Map<string, ExternalShip>()
  private readonly bookingResults = new Map<string, ExternalBookingResult>()
  private readonly bookingsByIdempotencyKey = new Map<string, ExternalBookingResult>()
  private readonly bookingsByRef = new Map<string, ExternalBookingResult>()

  // Telemetry — useful for assertions in tests.
  callCount = 0
  bookingCount = 0
  private readonly failEveryNthCall: number

  constructor(options: MockCruiseAdapterOptions = {}) {
    this.name = options.name ?? "mock"
    this.version = options.version ?? "1.0.0"
    this.failEveryNthCall = options.failEveryNthCall ?? 0
  }

  // ---------- seeders ----------

  addCruise(cruise: ExternalCruise, sailings: ExternalSailing[] = []): void {
    const key = refKey(cruise.sourceRef)
    this.cruisesByRef.set(key, {
      cruise,
      sailings: [...sailings],
      itinerariesBySailing: new Map(),
      pricingBySailing: new Map(),
    })
  }

  addSailing(cruiseRef: SourceRef, sailing: ExternalSailing): void {
    const seeded = this.cruisesByRef.get(refKey(cruiseRef))
    if (!seeded) throw new Error(`MockCruiseAdapter: cruise ${cruiseRef.externalId} not seeded`)
    seeded.sailings.push(sailing)
  }

  addShip(ship: ExternalShip): void {
    this.shipsByRef.set(refKey(ship.sourceRef), ship)
  }

  setSailingPricing(sailingRef: SourceRef, prices: ExternalPriceRow[]): void {
    for (const seeded of this.cruisesByRef.values()) {
      const match = seeded.sailings.find((s) => refKey(s.sourceRef) === refKey(sailingRef))
      if (match) {
        seeded.pricingBySailing.set(refKey(sailingRef), prices)
        return
      }
    }
    throw new Error(`MockCruiseAdapter: sailing ${sailingRef.externalId} not seeded`)
  }

  setSailingItinerary(sailingRef: SourceRef, days: ExternalItineraryDay[]): void {
    for (const seeded of this.cruisesByRef.values()) {
      const match = seeded.sailings.find((s) => refKey(s.sourceRef) === refKey(sailingRef))
      if (match) {
        seeded.itinerariesBySailing.set(refKey(sailingRef), days)
        return
      }
    }
    throw new Error(`MockCruiseAdapter: sailing ${sailingRef.externalId} not seeded`)
  }

  /** Pre-program a specific booking response for the next createBooking that matches. */
  setBookingResult(
    sailingRef: SourceRef,
    cabinCategoryRef: SourceRef,
    result: ExternalBookingResult,
  ): void {
    this.bookingResults.set(`${refKey(sailingRef)}::${refKey(cabinCategoryRef)}`, result)
  }

  // ---------- contract implementation ----------

  private tickAndCheck(): void {
    this.callCount++
    if (this.failEveryNthCall > 0 && this.callCount % this.failEveryNthCall === 0) {
      throw new Error(`MockCruiseAdapter forced failure on call #${this.callCount}`)
    }
  }

  async listEntries(options: ListEntriesOptions = {}): Promise<ListEntriesResult> {
    this.tickAndCheck()
    const limit = options.limit ?? 50
    const all: ExternalCruiseSummary[] = []
    for (const seeded of this.cruisesByRef.values()) {
      const c = seeded.cruise
      const earliest =
        seeded.sailings
          .map((s) => s.departureDate)
          .sort()
          .at(0) ?? null
      all.push({
        sourceRef: c.sourceRef,
        name: c.name,
        slug: c.slug,
        cruiseType: c.cruiseType,
        lineName: c.lineName,
        nights: c.nights,
        earliestDeparture: earliest,
        heroImageUrl: c.heroImageUrl ?? null,
      })
    }
    return { entries: all.slice(0, limit) }
  }

  async *searchProjection(
    options: ListEntriesOptions = {},
  ): AsyncIterable<CruiseSearchProjectionEntry> {
    this.tickAndCheck()
    void options
    for (const seeded of this.cruisesByRef.values()) {
      const c = seeded.cruise
      const earliest =
        seeded.sailings
          .map((s) => s.departureDate)
          .sort()
          .at(0) ?? null
      const latest =
        seeded.sailings
          .map((s) => s.departureDate)
          .sort()
          .at(-1) ?? null
      yield {
        sourceRef: c.sourceRef,
        slug: c.slug,
        name: c.name,
        cruiseType: c.cruiseType,
        lineName: c.lineName,
        shipName: this.shipsByRef.get(refKey(c.defaultShipRef ?? c.sourceRef))?.name ?? c.lineName,
        nights: c.nights,
        embarkPortName: c.embarkPortName ?? null,
        disembarkPortName: c.disembarkPortName ?? null,
        regions: c.regions,
        themes: c.themes,
        earliestDeparture: earliest,
        latestDeparture: latest,
        heroImageUrl: c.heroImageUrl ?? null,
      }
    }
  }

  async fetchCruise(ref: SourceRef): Promise<ExternalCruise | null> {
    this.tickAndCheck()
    return this.cruisesByRef.get(refKey(ref))?.cruise ?? null
  }

  async fetchSailing(ref: SourceRef): Promise<ExternalSailing | null> {
    this.tickAndCheck()
    for (const seeded of this.cruisesByRef.values()) {
      const match = seeded.sailings.find((s) => refKey(s.sourceRef) === refKey(ref))
      if (match) return match
    }
    return null
  }

  async fetchSailingPricing(ref: SourceRef): Promise<ExternalPriceRow[]> {
    this.tickAndCheck()
    for (const seeded of this.cruisesByRef.values()) {
      const prices = seeded.pricingBySailing.get(refKey(ref))
      if (prices) return prices
    }
    return []
  }

  async fetchSailingItinerary(ref: SourceRef): Promise<ExternalItineraryDay[]> {
    this.tickAndCheck()
    for (const seeded of this.cruisesByRef.values()) {
      const days = seeded.itinerariesBySailing.get(refKey(ref))
      if (days) return days
    }
    return []
  }

  async fetchShip(ref: SourceRef): Promise<ExternalShip | null> {
    this.tickAndCheck()
    return this.shipsByRef.get(refKey(ref)) ?? null
  }

  async listSailingsForCruise(cruiseRef: SourceRef): Promise<ExternalSailing[]> {
    this.tickAndCheck()
    return this.cruisesByRef.get(refKey(cruiseRef))?.sailings ?? []
  }

  async createBooking(input: CreateExternalBookingInput): Promise<ExternalBookingResult> {
    this.tickAndCheck()
    if (input.idempotencyKey) {
      const replay = this.bookingsByIdempotencyKey.get(input.idempotencyKey)
      if (replay) return replay
    }
    this.bookingCount++
    const programmed = this.bookingResults.get(
      `${refKey(input.sailingRef)}::${refKey(input.cabinCategoryRef)}`,
    )
    const result = programmed ?? {
      connectorBookingRef: `MOCK-${this.bookingCount.toString().padStart(6, "0")}`,
      connectorStatus: "confirmed",
    }
    if (input.idempotencyKey) this.bookingsByIdempotencyKey.set(input.idempotencyKey, result)
    this.bookingsByRef.set(result.connectorBookingRef, result)
    return result
  }

  async getBooking(connectorBookingRef: string): Promise<ExternalBookingResult | null> {
    this.tickAndCheck()
    return this.bookingsByRef.get(connectorBookingRef) ?? null
  }

  async getBookingByIdempotencyKey(idempotencyKey: string): Promise<ExternalBookingResult | null> {
    this.tickAndCheck()
    return this.bookingsByIdempotencyKey.get(idempotencyKey) ?? null
  }
}
