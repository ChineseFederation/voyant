/**
 * Zod schemas mirroring the flight contract types from `@voyant-travel/flights`.
 * Used to validate API responses at the network boundary.
 *
 * Drift policy: when the contract types change (additive only — see
 * `packages/flights/src/contract/types.ts`), update these schemas to match.
 */

import { z } from "zod"

const cabinSchema = z.enum(["economy", "premium_economy", "business", "first"])

const passengerTypeSchema = z.enum(["adult", "child", "infant", "senior", "youth"])

const moneySchema = z.object({
  amount: z.string(),
  currency: z.string(),
})

const segmentEndpointSchema = z.object({
  iataCode: z.string(),
  terminal: z.string().optional(),
  at: z.string(),
})

const flightSegmentSchema = z.object({
  segmentId: z.string(),
  carrierCode: z.string(),
  flightNumber: z.string(),
  operatingCarrierCode: z.string().optional(),
  operatingFlightNumber: z.string().optional(),
  departure: segmentEndpointSchema,
  arrival: segmentEndpointSchema,
  duration: z.string().optional(),
  aircraft: z.string().optional(),
  cabin: cabinSchema,
  fareClass: z.string().optional(),
  fareBasis: z.string().optional(),
  status: z.string().optional(),
  providerData: z.record(z.string(), z.unknown()).optional(),
})

const itinerarySchema = z.object({
  segments: z.array(flightSegmentSchema),
  duration: z.string().optional(),
})

const fareBreakdownSchema = z.object({
  passengerType: passengerTypeSchema,
  passengerCount: z.number(),
  baseFare: moneySchema,
  taxes: moneySchema,
  fees: moneySchema.optional(),
  total: moneySchema,
  fareFamily: z.string().optional(),
})

const fareBundleInclusionsSchema = z.object({
  cabinBag: z.object({ included: z.boolean(), weightKg: z.number().optional() }).optional(),
  checkedBag: z
    .object({
      included: z.boolean(),
      pieces: z.number().optional(),
      weightKg: z.number().optional(),
    })
    .optional(),
  seatSelection: z.enum(["none", "standard", "free"]).optional(),
  priorityBoarding: z.boolean().optional(),
  loungeAccess: z.boolean().optional(),
  refundable: z.boolean().optional(),
  changeable: z.boolean().optional(),
  notes: z.array(z.string()).optional(),
})

export const fareBundleSchema = z.object({
  id: z.string(),
  label: z.string(),
  tier: z.enum(["basic", "standard", "plus", "premium"]),
  priceDelta: moneySchema,
  recommended: z.boolean().optional(),
  inclusions: fareBundleInclusionsSchema,
  providerData: z.record(z.string(), z.unknown()).optional(),
})

export type FareBundleDto = z.infer<typeof fareBundleSchema>

export const flightOfferSchema = z.object({
  offerId: z.string(),
  source: z.string(),
  itineraries: z.array(itinerarySchema),
  fareBreakdowns: z.array(fareBreakdownSchema),
  totalPrice: moneySchema,
  validatingCarrier: z.string().optional(),
  expiresAt: z.string().optional(),
  lastTicketingDate: z.string().optional(),
  instantTicketing: z.boolean().optional(),
  fareBundles: z.array(fareBundleSchema).optional(),
  providerData: z.record(z.string(), z.unknown()).optional(),
})

export type FlightOfferDto = z.infer<typeof flightOfferSchema>

export const flightSearchPaginationMetaSchema = z.object({
  total: z.number(),
  cursor: z.string().optional(),
  hasMore: z.boolean(),
})

export type FlightSearchPaginationMetaDto = z.infer<typeof flightSearchPaginationMetaSchema>

export const flightSearchResponseSchema = z.object({
  offers: z.array(flightOfferSchema),
  pagination: flightSearchPaginationMetaSchema.optional(),
  providerData: z.record(z.string(), z.unknown()).optional(),
})

export type FlightSearchResponseDto = z.infer<typeof flightSearchResponseSchema>

export const flightPriceResponseSchema = z.object({
  offer: flightOfferSchema,
  valid: z.boolean(),
  invalidReason: z.string().optional(),
})

export type FlightPriceResponseDto = z.infer<typeof flightPriceResponseSchema>

// ── Booking ─────────────────────────────────────────────────────────────────

const flightTicketSchema = z.object({
  ticketNumber: z.string(),
  passengerId: z.string(),
  segmentIds: z.array(z.string()),
  status: z.string().optional(),
})

const flightOrderStatusSchema = z.enum(["pending", "confirmed", "ticketed", "cancelled", "failed"])

export const flightOrderSchema = z.object({
  orderId: z.string(),
  pnr: z.string().optional(),
  status: flightOrderStatusSchema,
  offer: flightOfferSchema,
  passengers: z.array(
    z.object({
      passengerId: z.string(),
      type: passengerTypeSchema,
      firstName: z.string(),
      middleName: z.string().optional(),
      lastName: z.string(),
      dateOfBirth: z.string(),
      gender: z.enum(["M", "F", "X"]).optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      documents: z
        .array(
          z.object({
            type: z.enum(["passport", "national_id", "visa"]),
            number: z.string(),
            countryOfIssue: z.string(),
            countryOfNationality: z.string().optional(),
            expiryDate: z.string().optional(),
          }),
        )
        .optional(),
    }),
  ),
  contact: z.object({ email: z.string().optional(), phone: z.string().optional() }).optional(),
  tickets: z.array(flightTicketSchema).optional(),
  totalPrice: moneySchema,
  paymentDeadline: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  providerData: z.record(z.string(), z.unknown()).optional(),
})

export type FlightOrderDto = z.infer<typeof flightOrderSchema>

export const flightBookResponseSchema = z.object({
  order: flightOrderSchema,
})

export type FlightBookResponseDto = z.infer<typeof flightBookResponseSchema>

export const flightGetOrderResponseSchema = z.object({
  order: flightOrderSchema,
})

export type FlightGetOrderResponseDto = z.infer<typeof flightGetOrderResponseSchema>

export const flightCancelResponseSchema = z.object({
  order: flightOrderSchema,
  refundedAmount: moneySchema.optional(),
})

export type FlightCancelResponseDto = z.infer<typeof flightCancelResponseSchema>

export const flightOrdersListResponseSchema = z.object({
  orders: z.array(flightOrderSchema),
  pagination: z.object({
    total: z.number(),
    hasMore: z.boolean(),
    cursor: z.string().optional(),
  }),
})

export type FlightOrdersListResponseDto = z.infer<typeof flightOrdersListResponseSchema>

// ── Ancillaries ─────────────────────────────────────────────────────────────

const baggageCategorySchema = z.enum(["checked", "cabin", "personal_item", "sports", "oversized"])

const assistanceCategorySchema = z.enum([
  "wheelchair",
  "visual",
  "hearing",
  "cognitive",
  "medical",
  "other",
])

const ancillaryBaggageOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  category: baggageCategorySchema,
  weightKg: z.number().optional(),
  dimensions: z
    .object({
      lengthCm: z.number().optional(),
      widthCm: z.number().optional(),
      heightCm: z.number().optional(),
    })
    .optional(),
  price: moneySchema,
  recommended: z.boolean().optional(),
  providerData: z.record(z.string(), z.unknown()).optional(),
})

export type AncillaryBaggageOptionDto = z.infer<typeof ancillaryBaggageOptionSchema>

const ancillaryAssistanceOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  category: assistanceCategorySchema,
  price: moneySchema.optional(),
  notes: z.string().optional(),
})

export type AncillaryAssistanceOptionDto = z.infer<typeof ancillaryAssistanceOptionSchema>

const ancillaryExtraOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  category: z.string(),
  price: moneySchema,
  pricingScope: z.enum(["per_passenger", "per_booking"]).optional(),
})

export type AncillaryExtraOptionDto = z.infer<typeof ancillaryExtraOptionSchema>

export const ancillaryCatalogSchema = z.object({
  baggage: z.array(ancillaryBaggageOptionSchema),
  assistance: z.array(ancillaryAssistanceOptionSchema),
  extras: z.array(ancillaryExtraOptionSchema),
})

export type AncillaryCatalogDto = z.infer<typeof ancillaryCatalogSchema>

export const ancillaryResponseSchema = z.object({
  catalog: ancillaryCatalogSchema,
  validUntil: z.string().optional(),
})

export type AncillaryResponseDto = z.infer<typeof ancillaryResponseSchema>

// ── Seat maps ───────────────────────────────────────────────────────────────

const seatStatusSchema = z.enum(["available", "blocked", "unavailable", "selected"])
const seatCategorySchema = z.enum([
  "standard",
  "preferred",
  "extra_legroom",
  "exit_row",
  "premium",
  "bulkhead",
])

const seatSchema = z.object({
  seatNumber: z.string(),
  row: z.number(),
  column: z.string(),
  status: seatStatusSchema,
  category: seatCategorySchema,
  price: moneySchema.optional(),
  notes: z.string().optional(),
  window: z.boolean().optional(),
  aisle: z.boolean().optional(),
  providerData: z.record(z.string(), z.unknown()).optional(),
})

export type SeatDto = z.infer<typeof seatSchema>

const seatRowSchema = z.object({
  row: z.number(),
  seats: z.array(seatSchema),
})

export const seatMapSchema = z.object({
  segmentId: z.string(),
  aircraft: z.string().optional(),
  cabin: cabinSchema,
  columnLayout: z.array(z.string().nullable()),
  rows: z.array(seatRowSchema),
  providerData: z.record(z.string(), z.unknown()).optional(),
})

export type SeatMapDto = z.infer<typeof seatMapSchema>

export const seatMapResponseSchema = z.object({
  seatMap: seatMapSchema,
  validUntil: z.string().optional(),
})

export type SeatMapResponseDto = z.infer<typeof seatMapResponseSchema>

// ── Saved payment methods (demo / template-side) ─────────────────────────────

export const savedPaymentMethodSchema = z.object({
  id: z.string(),
  /** Present on CRM-backed responses; ignored client-side. */
  personId: z.string().optional(),
  brand: z.enum(["visa", "mastercard", "amex", "revolut", "bank_transfer"]),
  /** Null for non-card methods (bank_transfer). */
  last4: z.string().nullable(),
  holderName: z.string().nullable().optional(),
  /** Null for non-card methods. */
  expMonth: z.number().nullable().optional(),
  expYear: z.number().nullable().optional(),
  isDefault: z.boolean(),
  createdAt: z.string(),
})

export type SavedPaymentMethodDto = z.infer<typeof savedPaymentMethodSchema>

export const savedPaymentMethodListResponseSchema = z.object({
  data: z.array(savedPaymentMethodSchema),
})

export type SavedPaymentMethodListResponse = z.infer<typeof savedPaymentMethodListResponseSchema>

// ── Reference data ──────────────────────────────────────────────────────────

export const airlineSchema = z.object({
  iataCode: z.string(),
  icaoCode: z.string().nullable().optional(),
  name: z.string(),
  country: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  alliance: z.string().nullable().optional(),
})

export type AirlineDto = z.infer<typeof airlineSchema>

export const airportSchema = z.object({
  iataCode: z.string(),
  icaoCode: z.string().nullable().optional(),
  name: z.string(),
  city: z.string(),
  country: z.string(),
  timezone: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
})

export type AirportDto = z.infer<typeof airportSchema>

export const aircraftSchema = z.object({
  iataCode: z.string(),
  icaoCode: z.string().nullable().optional(),
  name: z.string(),
  manufacturer: z.string().nullable().optional(),
  typicalSeats: z.number().nullable().optional(),
})

export type AircraftDto = z.infer<typeof aircraftSchema>

export const airlineListResponseSchema = z.object({ data: z.array(airlineSchema) })
export const airportListResponseSchema = z.object({ data: z.array(airportSchema) })
export const aircraftListResponseSchema = z.object({ data: z.array(aircraftSchema) })

export type AirlineListResponse = z.infer<typeof airlineListResponseSchema>
export type AirportListResponse = z.infer<typeof airportListResponseSchema>
export type AircraftListResponse = z.infer<typeof aircraftListResponseSchema>
