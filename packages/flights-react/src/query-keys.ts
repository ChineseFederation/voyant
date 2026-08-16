import type {
  FareCalendarRequest,
  FlightOrderStatus,
  FlightSearchRequest,
} from "@voyant-travel/flights/contract/types"

export interface AirportSearchFilters {
  q?: string | undefined
  limit?: number | undefined
}

/**
 * `paymentStatus` mirrors the finance `payment_session` statuses, plus
 * `"none"` for orders the operator hasn't created a session for yet.
 * Sent operator-side; the underlying flight adapter stays unaware of
 * payments.
 */
export type FlightOrderPaymentStatus =
  | "none"
  | "pending"
  | "requires_redirect"
  | "processing"
  | "authorized"
  | "paid"
  | "failed"
  | "cancelled"
  | "expired"

export interface FlightOrdersListFilters {
  cursor?: string | undefined
  limit?: number | undefined
  search?: string | undefined
  status?: FlightOrderStatus[] | undefined
  paymentStatus?: FlightOrderPaymentStatus[] | undefined
}

export const flightsQueryKeys = {
  all: ["voyant", "flights"] as const,

  search: () => [...flightsQueryKeys.all, "search"] as const,
  searchRequest: (request: FlightSearchRequest) => [...flightsQueryKeys.search(), request] as const,

  fareCalendar: () => [...flightsQueryKeys.all, "fare-calendar"] as const,
  fareCalendarWindow: (request: FareCalendarRequest) =>
    [...flightsQueryKeys.fareCalendar(), request] as const,

  servedMarkets: () => [...flightsQueryKeys.all, "served-markets"] as const,

  offer: () => [...flightsQueryKeys.all, "offer"] as const,
  offerDetail: (offerId: string) => [...flightsQueryKeys.offer(), "detail", offerId] as const,

  ancillaries: () => [...flightsQueryKeys.all, "ancillaries"] as const,
  ancillariesForOffer: (offerId: string) => [...flightsQueryKeys.ancillaries(), offerId] as const,

  seatMap: () => [...flightsQueryKeys.all, "seatmap"] as const,
  seatMapForSegment: (offerId: string, segmentId: string) =>
    [...flightsQueryKeys.seatMap(), offerId, segmentId] as const,

  /** Saved payment methods are CRM-adjacent but currently expose via the operator starter route. */
  savedPaymentMethods: (personId: string) =>
    [...flightsQueryKeys.all, "saved-payment-methods", personId] as const,

  order: () => [...flightsQueryKeys.all, "order"] as const,
  orderDetail: (orderId: string) => [...flightsQueryKeys.order(), "detail", orderId] as const,
  orderList: (filters: FlightOrdersListFilters) =>
    [...flightsQueryKeys.order(), "list", filters] as const,

  reference: () => [...flightsQueryKeys.all, "reference"] as const,
  airlines: () => [...flightsQueryKeys.reference(), "airlines"] as const,
  airports: (filters: AirportSearchFilters) =>
    [...flightsQueryKeys.reference(), "airports", filters] as const,
  airline: (iataCode: string) => [...flightsQueryKeys.reference(), "airline", iataCode] as const,
  airport: (iataCode: string) => [...flightsQueryKeys.reference(), "airport", iataCode] as const,
  aircraft: () => [...flightsQueryKeys.reference(), "aircraft"] as const,
} as const
