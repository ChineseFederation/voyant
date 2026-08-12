// agent-quality: file-size exception -- owner: flights-contracts; existing module stays co-located until a dedicated split preserves behavior and tests.
/**
 * Flight contract types — shapes mirror voyant-cloud's `connect-flight-contract`
 * so adapters are portable across Voyant Cloud and Voyant Catalog deployments.
 *
 * These are the load-bearing data structures: `FlightSegment`, `Itinerary`,
 * `FlightOffer`, `FlightOrder`, `FlightSearchRequest`, `FlightBookRequest`,
 * the `paymentIntent` discriminated union, and the capability id namespace.
 *
 * **Drift policy:** when voyant-cloud's `connect-flight-contract` evolves,
 * mirror the additive changes here. Breaking changes flow through a
 * coordinated release across both packages.
 *
 * See `docs/architecture/catalog-flights-architecture.md` §3.
 */

/** Cabin class. Standard IATA-aligned vocabulary. */
export type CabinClass = "economy" | "premium_economy" | "business" | "first"

/** Passenger type. Affects fare lookup and ticketing rules. */
export type PassengerType = "adult" | "child" | "infant" | "senior" | "youth"

/** Currency + amount. */
export interface Money {
  amount: string // string to preserve decimal precision
  currency: string // ISO 4217
}

/**
 * One segment of an itinerary — from departure airport to arrival airport
 * on a specific carrier + flight number.
 */
export interface FlightSegment {
  segmentId: string
  carrierCode: string // 2- or 3-char IATA carrier code
  flightNumber: string
  /** Operating carrier when different from the marketing carrier. */
  operatingCarrierCode?: string
  operatingFlightNumber?: string
  departure: {
    iataCode: string // 3-char IATA airport code
    terminal?: string
    at: string // ISO 8601 datetime with offset
  }
  arrival: {
    iataCode: string
    terminal?: string
    at: string
  }
  duration?: string // ISO 8601 duration
  aircraft?: string // IATA aircraft type code
  cabin: CabinClass
  fareClass?: string
  fareBasis?: string
  status?: string
  /** Provider-specific data — opaque round-trip. */
  providerData?: Record<string, unknown>
}

/**
 * One itinerary (journey leg) — a sequence of segments. Round-trip and
 * multi-city offers have multiple itineraries.
 */
export interface Itinerary {
  segments: FlightSegment[]
  duration?: string
}

/** Per-passenger fare breakdown line. */
export interface FareBreakdown {
  passengerType: PassengerType
  passengerCount: number
  baseFare: Money
  taxes: Money
  fees?: Money
  total: Money
  fareFamily?: string
}

/**
 * A priced flight proposition. Returned by `searchFlights`; passed back to
 * `priceOffer` and `bookFlight`. Always vertical-specific — never collapse
 * into a generic `Offer` (per architecture §1.1 and `UBIQUITOUS_LANGUAGE.md`).
 */
export interface FlightOffer {
  offerId: string
  /** Source identifier — typically the connection id or adapter slug. */
  source: string
  itineraries: Itinerary[]
  fareBreakdowns: FareBreakdown[]
  totalPrice: Money
  validatingCarrier?: string
  /** ISO 8601 — when the offer expires (provider may refuse to book after). */
  expiresAt?: string
  /** ISO 8601 — last ticketing date. */
  lastTicketingDate?: string
  instantTicketing?: boolean
  /**
   * Branded fare bundles available for this offer (Basic / Standard / Plus
   * style). Optional — adapters that don't surface branded fares omit this
   * field; the offer's `totalPrice` is then the only fare. Bundles are
   * defined per-offer; for round-trip flows where each leg is its own
   * offer, callers fetch bundles per leg and submit picks via
   * `AncillarySelection.fareBundle`.
   */
  fareBundles?: FareBundle[]
  /** Provider-specific data — opaque round-trip. */
  providerData?: Record<string, unknown>
}

/**
 * A branded fare upsell tier. Tiers add inclusions (bag, seat, refund
 * flexibility) on top of the offer's base fare for a per-pax delta.
 */
export interface FareBundle {
  id: string
  /** Display label, e.g. "Wizz Standard", "Plus", "Lufthansa Light". */
  label: string
  /** Tier hint — UI uses it to badge / order tiles. */
  tier: "basic" | "standard" | "plus" | "premium"
  /** Per-adult price delta on top of `FlightOffer.totalPrice`. */
  priceDelta: Money
  /** Highlights the recommended tier in the UI (typically "standard"). */
  recommended?: boolean
  /** Structured inclusions — UI renders as a checklist on the tile. */
  inclusions: FareBundleInclusions
  /** Provider-specific data — opaque round-trip. */
  providerData?: Record<string, unknown>
}

export interface FareBundleInclusions {
  /** Cabin / personal item allowance. */
  cabinBag?: { included: boolean; weightKg?: number }
  /** Checked baggage allowance. */
  checkedBag?: { included: boolean; pieces?: number; weightKg?: number }
  /** Seat selection rights. `free` = pick any seat; `standard` = standard only. */
  seatSelection?: "none" | "standard" | "free"
  /** Priority boarding. */
  priorityBoarding?: boolean
  /** Lounge access. */
  loungeAccess?: boolean
  /** Refundable status — typically false for basic, partial for standard, true for plus. */
  refundable?: boolean
  /** Date / time changes allowed without fee. */
  changeable?: boolean
  /** Free-text additional perks the carrier wants to surface. */
  notes?: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One slice of a search request. Slice count determines trip type:
 *   - 1 slice  → one-way
 *   - 2 slices → round-trip
 *   - 3+       → multi-city / open-jaw
 */
export interface FlightSlice {
  origin: string // 3-char IATA
  destination: string
  departureDate: string // ISO date
  departureTimeWindow?: { earliest?: string; latest?: string }
}

export interface PassengerCounts {
  adults: number
  children?: number
  infants?: number
}

/**
 * Pagination cursor for results. Adapters that don't support pagination
 * may ignore this entirely and return the full result set on every call.
 *
 * `cursor` is opaque to the caller — it's whatever the previous response
 * returned in `pagination.cursor`. The demo adapter uses 1-indexed page
 * numbers; real connectors typically return GDS-issued continuation tokens.
 */
export interface FlightSearchPagination {
  /** Max offers per page. Adapters may cap or ignore. */
  limit?: number
  /** Continuation token from the prior response, or omitted for first page. */
  cursor?: string
}

/**
 * Pagination metadata returned by the adapter alongside the offer page.
 * `total` is the count BEFORE pagination but AFTER any server-side filters
 * declared on the request — so the UI can render "Showing 1-20 of 47".
 */
export interface FlightSearchPaginationMeta {
  total: number
  /** Cursor to pass for the next page, omitted on the last page. */
  cursor?: string
  /** Convenience flag — equivalent to `cursor != null`. */
  hasMore: boolean
}

export interface FlightSearchRequest {
  slices: FlightSlice[]
  passengers: PassengerCounts
  cabin?: CabinClass
  searchOptions?: {
    directOnly?: boolean
    maxStops?: number
    minConnectionMinutes?: number
    includeCarriers?: string[]
    excludeCarriers?: string[]
    /**
     * Cap the offer total price (in offer currency). Adapters that don't
     * declare currency-aware filtering should treat this as a same-currency
     * cap and skip offers priced above it.
     */
    maxPrice?: number
  }
  /**
   * Optional pagination cursor. Adapters that don't support pagination
   * may ignore this and return the full result set.
   */
  pagination?: FlightSearchPagination
}

// ─────────────────────────────────────────────────────────────────────────────
// Booking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Intent-driven booking — caller declares what they want, system honors
 * or rejects per the adapter's declared capabilities. Default if omitted:
 * `{ type: "hold" }`.
 */
export type PaymentIntent =
  | { type: "hold" }
  | { type: "bank_transfer" }
  | { type: "card"; token: string; cardholderName?: string; billingAddress?: BillingAddress }
  /**
   * A method already on file for the customer, named rather than carried.
   *
   * Distinct from `card` because the two are not the same fact: `card` carries
   * a credential the shopper just entered, while this carries only an
   * identifier the server resolves to a token it never sends out. Collapsing
   * them would put a chargeable credential on every client that renders a saved
   * card, which is exactly what having the id avoids.
   */
  | { type: "saved_method"; methodId: string }
  | { type: "ticket_on_credit"; iataCode?: string }

export interface BillingAddress {
  line1: string
  line2?: string
  city: string
  region?: string
  postalCode?: string
  countryCode: string
}

export interface FlightPassenger {
  passengerId: string
  type: PassengerType
  firstName: string
  middleName?: string
  lastName: string
  dateOfBirth: string // ISO date — matches the rest of the codebase (bookings, sellability, contact requirements)
  gender?: "M" | "F" | "X"
  email?: string
  phone?: string
  documents?: TravelDocument[]
}

export interface TravelDocument {
  type: "passport" | "national_id" | "visa"
  number: string
  countryOfIssue: string
  countryOfNationality?: string
  expiryDate?: string
}

export interface FlightBookRequest {
  offerId: string
  /** Provider-specific re-priced offer payload, when the adapter requires it. */
  offer?: FlightOffer
  passengers: FlightPassenger[]
  contact?: { email?: string; phone?: string }
  paymentIntent?: PaymentIntent // default: { type: "hold" }
  /**
   * Optional ancillary picks (bags / assistance / extras) collected at
   * checkout. Adapters that don't declare `flight/ancillaries` must accept
   * this field but ignore it; supporting adapters echo the picks back on
   * the resulting `FlightOrder.providerData` and reflect prices in the
   * order total.
   */
  ancillaries?: AncillarySelection
}

export type FlightOrderStatus =
  | "pending"
  | "confirmed" // held; awaiting ticketing
  | "ticketed"
  | "cancelled"
  | "failed"

export interface FlightTicket {
  ticketNumber: string
  passengerId: string
  segmentIds: string[]
  status?: string
}

export interface FlightOrder {
  orderId: string
  /** PNR / record locator. */
  pnr?: string
  status: FlightOrderStatus
  offer: FlightOffer
  passengers: FlightPassenger[]
  contact?: { email?: string; phone?: string }
  tickets?: FlightTicket[]
  totalPrice: Money
  /** ISO 8601 — deadline before the hold expires (held orders only). */
  paymentDeadline?: string
  createdAt: string
  updatedAt?: string
  /** Provider-specific data — opaque round-trip. */
  providerData?: Record<string, unknown>
}

// ─────────────────────────────────────────────────────────────────────────────
// Ancillaries (bags, assistance, extras)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bag option offered for a single itinerary. Per-pax pricing — the UI
 * multiplies by quantity + selected pax count.
 */
export interface AncillaryBaggageOption {
  id: string
  /** Display label, e.g. "20 kg checked bag". */
  label: string
  /** Bag category. `personal_item` is the under-seat bag; `cabin` is overhead. */
  category: "checked" | "cabin" | "personal_item" | "sports" | "oversized"
  weightKg?: number
  dimensions?: { lengthCm?: number; widthCm?: number; heightCm?: number }
  /** Per-pax per-leg price. */
  price: Money
  /** Hint that the UI should highlight this tier (typical: 20kg). */
  recommended?: boolean
  /** Provider-specific data — opaque round-trip. */
  providerData?: Record<string, unknown>
}

/** Special-assistance option. Most are free; a few carriers charge. */
export interface AncillaryAssistanceOption {
  id: string
  label: string
  category: "wheelchair" | "visual" | "hearing" | "cognitive" | "medical" | "other"
  /** Free when omitted. */
  price?: Money
  /** Free-text guidance for the operator (e.g. "Bring own equipment"). */
  notes?: string
}

/** Catch-all extras: priority boarding, pet in cabin, lounge access, etc. */
export interface AncillaryExtraOption {
  id: string
  label: string
  /** Provider-defined tag — UI may group by this. */
  category: string
  price: Money
  /** Per-pax (default) vs per-booking pricing. */
  pricingScope?: "per_passenger" | "per_booking"
}

/**
 * Catalog of ancillaries available for one offer. The catalog is offer-scoped
 * because availability and pricing depend on the booked itinerary (carrier,
 * cabin, route, fare class). For round-trip flows where the journey is
 * composed of two single-leg offers, the UI fetches one catalog per leg.
 */
export interface AncillaryCatalog {
  baggage: AncillaryBaggageOption[]
  assistance: AncillaryAssistanceOption[]
  extras: AncillaryExtraOption[]
}

export interface AncillaryRequest {
  offerId: string
  /** Some providers require the offer payload echoed back. */
  offer?: FlightOffer
}

export interface AncillaryResponse {
  catalog: AncillaryCatalog
  /** ISO 8601 — when this catalog quote stops being valid for booking. */
  validUntil?: string
}

/**
 * Ancillary selection submitted with `bookFlight`. Picks are indexed by
 * passenger id and (for per-leg picks) by slice index — slice 0 = outbound,
 * slice 1 = return (matching the order in `FlightOffer.itineraries`).
 *
 * The shape stays additive: providers that introduce per-segment seat picks
 * later get a sibling field on this interface, not a breaking change.
 */
export interface AncillarySelection {
  /** Per-pax per-slice baggage picks. */
  baggage?: Array<{
    passengerId: string
    sliceIndex: number
    optionId: string
    /** Defaults to 1 — same option may be picked multiple times per pax. */
    quantity?: number
  }>
  /** Per-pax assistance picks. Trip-wide (not per-slice) by convention. */
  assistance?: Array<{
    passengerId: string
    optionId: string
  }>
  /** Per-pax per-slice extras (priority boarding, sports equipment, etc.). */
  extras?: Array<{
    passengerId: string
    sliceIndex: number
    optionId: string
    quantity?: number
  }>
  /**
   * Per-pax per-segment seat picks. Seats are assigned at the segment level
   * (not the slice level) because a multi-stop itinerary requires distinct
   * picks per leg of the journey. Omit any pax/segment combination to defer
   * the assignment to airline auto-allocation.
   */
  seats?: Array<{
    passengerId: string
    segmentId: string
    seatNumber: string
  }>
  /**
   * Per-pax per-slice branded fare bundle picks (e.g. Adult 1 on Standard
   * outbound + Plus return; Adult 2 on Basic both legs). Omit any
   * pax/slice combination to keep that pax on the offer's base "Basic"
   * fare for that leg. The shell defaults to applying one pick to all pax
   * on a leg ("Same fare for all passengers" toggle), but the contract
   * stays honest about the per-pax shape — many full-service carriers
   * (LH, BA, AF) and B2B agency bookings actually exercise per-pax mixes.
   */
  fareBundle?: Array<{
    passengerId: string
    sliceIndex: number
    bundleId: string
  }>
}

// ─────────────────────────────────────────────────────────────────────────────
// Seat maps
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One seat on a seat map. Seats are addressed by an airline-style
 * row+column code (e.g. "12A") — the canonical identifier for booking. The
 * `category` drives how the UI styles + prices the seat.
 */
export interface Seat {
  /** Combined row+column, e.g. "12A". Stable across the seat map call. */
  seatNumber: string
  /** Row number, 1-indexed (matches airline numbering). */
  row: number
  /** Column letter, e.g. "A", "B", "F". */
  column: string
  status: "available" | "blocked" | "unavailable" | "selected"
  category: "standard" | "preferred" | "extra_legroom" | "exit_row" | "premium" | "bulkhead"
  /** Per-pax seat fee. Omitted = included in fare. */
  price?: Money
  /**
   * Provider hint about restrictions: e.g. "exit_row_restrictions",
   * "no_recline". Free-text, opaque to the UI; surface as a tooltip badge.
   */
  notes?: string
  /** True for window seats. */
  window?: boolean
  /** True for aisle seats. */
  aisle?: boolean
  /** Provider-specific data — opaque round-trip. */
  providerData?: Record<string, unknown>
}

export interface SeatRow {
  /** 1-indexed row number. */
  row: number
  /** Seats in cabin-order (left-to-right). Sparse: gaps render as aisles. */
  seats: Seat[]
}

export interface SeatMap {
  segmentId: string
  /** Aircraft IATA code if known — UI may display the model name. */
  aircraft?: string
  /** Cabin class this map applies to. */
  cabin: CabinClass
  /**
   * Column layout — letters in cabin order, with `null` for aisle gaps.
   * Example narrow-body 3-3: `["A","B","C",null,"D","E","F"]`.
   * Example wide-body 3-3-3: `["A","B","C",null,"D","E","F",null,"G","H","J"]`.
   */
  columnLayout: Array<string | null>
  rows: SeatRow[]
  /** Provider-specific data — opaque round-trip. */
  providerData?: Record<string, unknown>
}

export interface SeatMapRequest {
  offerId: string
  segmentId: string
  /** Some providers require the offer payload echoed back. */
  offer?: FlightOffer
}

export interface SeatMapResponse {
  seatMap: SeatMap
  /** ISO 8601 — when this seat map quote stops being valid for booking. */
  validUntil?: string
}

export type {
  CheckInRequest,
  CheckInResponse,
  CheckInStatus,
  FlightBoardingPass,
  FlightModifyReason,
  FlightModifyRequest,
  FlightModifyResponse,
  FlightRefundReason,
  FlightRefundRequest,
  FlightRefundResponse,
  FlightVoidResponse,
  SeatAssignment,
  SeatSelectionRequest,
  SeatSelectionResponse,
  SsrCode,
  SsrRequest,
  SsrResponse,
} from "./post-book-types.js"

// ─────────────────────────────────────────────────────────────────────────────
// Capability ids
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Capability ids declared per connection. Adapters that don't declare a
 * capability stub the corresponding method with `CAPABILITY_NOT_SUPPORTED`.
 */
export const FLIGHT_CAPABILITIES = {
  HOLDS: "flight/holds",
  SEATMAP: "flight/seatmap",
  SEAT_SELECTION: "flight/seat-selection",
  ANCILLARIES: "flight/ancillaries",
  CHECKIN: "flight/checkin",
  EXCHANGE: "flight/exchange",
  REFUND: "flight/refund",
  VOID: "flight/void",
  SSR: "flight/ssr",
  BRANDED_FARES: "flight/branded-fares",
  /** `listOrders(ctx, query)` is queryable — the adapter persists orders. */
  LIST_ORDERS: "flight/list-orders",
} as const

export type FlightCapability = (typeof FLIGHT_CAPABILITIES)[keyof typeof FLIGHT_CAPABILITIES]
