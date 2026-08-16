// agent-quality: file-size exception -- owner: flights-contracts; existing schema contract stays co-located until a dedicated split preserves behavior and tests.
import { z } from "zod"

import { FLIGHT_CAPABILITIES, type FlightCapability } from "./types.js"

const decimalStringSchema = z.string().regex(/^\d+(\.\d+)?$/)
const signedDecimalStringSchema = z.string().regex(/^-?\d+(\.\d+)?$/)
const iataCodeSchema = z.string().length(3)
/**
 * A real calendar day, not merely a `yyyy-MM-dd`-shaped string.
 *
 * Shape alone is not enough: `Date` silently rolls `2026-02-31` forward to
 * 2026-03-03, so a format-only check would hand the connector a window the
 * caller never asked for and quote the wrong month back. Round-tripping the
 * parsed parts is what rejects a day that does not exist.
 */
const isoDateSchema = z
  .string()
  .refine(isCalendarDate, { message: "Expected a calendar date in yyyy-MM-dd form" })
  // `z.toJSONSchema` drops refinements, so a caller reading only the generated
  // schema — an agent, say — would learn the day-must-exist rule from a 400.
  // The description is the part it can actually see.
  .describe(
    "A calendar date as yyyy-MM-dd. The day must exist: 2026-02-31 and 2026-13-01 are rejected rather than rolled forward.",
  )

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [, year, month, day] = match
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return false
  return (
    parsed.getUTCFullYear() === Number(year) &&
    parsed.getUTCMonth() + 1 === Number(month) &&
    parsed.getUTCDate() === Number(day)
  )
}
const carrierCodeSchema = z.string().min(2).max(3)
const currencyCodeSchema = z.string().length(3)
const providerDataSchema = z.record(z.string(), z.unknown())
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

export const cabinClassSchema = z.enum(["economy", "premium_economy", "business", "first"])
export const passengerTypeSchema = z.enum(["adult", "child", "infant", "senior", "youth"])
export const paymentIntentTypeSchema = z.enum(["hold", "bank_transfer", "card", "ticket_on_credit"])
export const flightOrderStatusSchema = z.enum([
  "pending",
  "confirmed",
  "ticketed",
  "cancelled",
  "failed",
])
export const flightCancelReasonSchema = z.enum([
  "customer_request",
  "schedule_change",
  "operational",
  "fraud",
])
export const flightModifyReasonSchema = z.enum([
  "customer_request",
  "schedule_change",
  "name_correction",
  "disruption",
  "operational",
])
export const flightRefundReasonSchema = z.enum([
  "customer_request",
  "schedule_change",
  "disruption",
  "duplicate_booking",
  "medical",
  "other",
])
export const ssrCodeSchema = z.enum([
  "WCHR",
  "WCHS",
  "WCHC",
  "BLND",
  "DEAF",
  "MAAS",
  "UMNR",
  "INFT",
  "PETC",
  "VGML",
  "KSML",
  "MOML",
  "OTHER",
])
export const checkInStatusSchema = z.enum(["initiated", "checked_in", "failed"])
export const flightAdapterEnvironmentSchema = z.enum(["sandbox", "production"])
export const flightCapabilitySchema = z.enum(
  Object.values(FLIGHT_CAPABILITIES) as [FlightCapability, ...FlightCapability[]],
)

export const moneySchema = z.object({
  amount: decimalStringSchema,
  currency: currencyCodeSchema,
})

const signedMoneySchema = moneySchema.extend({ amount: signedDecimalStringSchema })

export const flightContactSchema = z.object({
  email: z.string().optional(),
  phone: z.string().optional(),
})

export const pointOfSaleSchema = z.string()

export const flightSegmentEndpointSchema = z.object({
  iataCode: iataCodeSchema,
  terminal: z.string().optional(),
  at: z.string(),
})

export const flightSegmentSchema = z.object({
  segmentId: z.string(),
  carrierCode: carrierCodeSchema,
  flightNumber: z.string(),
  operatingCarrierCode: carrierCodeSchema.optional(),
  operatingFlightNumber: z.string().optional(),
  departure: flightSegmentEndpointSchema,
  arrival: flightSegmentEndpointSchema,
  duration: z.string().optional(),
  aircraft: z.string().optional(),
  cabin: cabinClassSchema,
  fareClass: z.string().optional(),
  fareBasis: z.string().optional(),
  status: z.string().optional(),
  providerData: providerDataSchema.optional(),
})

export const flightItinerarySchema = z.object({
  segments: z.array(flightSegmentSchema),
  duration: z.string().optional(),
})

export const itinerarySchema = flightItinerarySchema

export const fareBreakdownSchema = z.object({
  passengerType: passengerTypeSchema,
  passengerCount: z.number().int().min(0),
  baseFare: moneySchema,
  taxes: moneySchema,
  fees: moneySchema.optional(),
  total: moneySchema,
  fareFamily: z.string().optional(),
})

export const fareBundleInclusionsSchema = z.object({
  cabinBag: z
    .object({
      included: z.boolean(),
      weightKg: z.number().optional(),
    })
    .optional(),
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
  providerData: providerDataSchema.optional(),
})

export const flightOfferSchema = z.object({
  offerId: z.string(),
  source: z.string(),
  itineraries: z.array(flightItinerarySchema),
  fareBreakdowns: z.array(fareBreakdownSchema),
  totalPrice: moneySchema,
  validatingCarrier: z.string().optional(),
  expiresAt: z.string().optional(),
  lastTicketingDate: z.string().optional(),
  instantTicketing: z.boolean().optional(),
  fareBundles: z.array(fareBundleSchema).optional(),
  providerData: providerDataSchema.optional(),
})

export const flightSliceSchema = z.object({
  origin: iataCodeSchema,
  destination: iataCodeSchema,
  departureDate: z.string(),
  departureTimeWindow: z
    .object({
      earliest: z.string().optional(),
      latest: z.string().optional(),
    })
    .optional(),
})

export const passengerCountsSchema = z.object({
  adults: z.number().int().min(0),
  children: z.number().int().min(0).optional(),
  infants: z.number().int().min(0).optional(),
})

export const flightSearchPaginationSchema = z.object({
  limit: z.number().int().min(1).optional(),
  cursor: z.string().optional(),
})

export const flightSearchPaginationMetaSchema = z.object({
  total: z.number().int().min(0),
  cursor: z.string().optional(),
  hasMore: z.boolean(),
})

export const flightSearchOptionsSchema = z.object({
  directOnly: z.boolean().optional(),
  maxStops: z.number().int().min(0).optional(),
  minConnectionMinutes: z.number().int().min(0).optional(),
  includeCarriers: z.array(carrierCodeSchema).optional(),
  excludeCarriers: z.array(carrierCodeSchema).optional(),
  maxPrice: z.number().min(0).optional(),
})

export const flightSearchRequestSchema = z.object({
  slices: z.array(flightSliceSchema),
  passengers: passengerCountsSchema,
  cabin: cabinClassSchema.optional(),
  searchOptions: flightSearchOptionsSchema.optional(),
  pagination: flightSearchPaginationSchema.optional(),
})

export const flightSearchResponseSchema = z.object({
  offers: z.array(flightOfferSchema),
  pagination: flightSearchPaginationMetaSchema.optional(),
  providerData: providerDataSchema.optional(),
})

export const fareCalendarRequestSchema = z.object({
  origin: iataCodeSchema,
  destination: iataCodeSchema,
  from: isoDateSchema,
  to: isoDateSchema,
  passengers: passengerCountsSchema,
  cabin: cabinClassSchema.optional(),
  returnAfterDays: z.number().int().min(0).optional(),
  searchOptions: z
    .object({
      directOnly: z.boolean().optional(),
      maxStops: z.number().int().min(0).optional(),
    })
    .optional(),
})

export const fareCalendarDaySchema = z.object({
  date: isoDateSchema,
  available: z.boolean(),
  cheapestPrice: moneySchema.optional(),
  offerCount: z.number().int().min(0).optional(),
})

export const fareCalendarResponseSchema = z.object({
  days: z.array(fareCalendarDaySchema),
  expiresAt: z.string().optional(),
  providerData: providerDataSchema.optional(),
})

export const servedMarketsResponseSchema = z.object({
  origins: z.array(iataCodeSchema),
  destinations: z.array(iataCodeSchema).optional(),
  expiresAt: z.string().optional(),
  providerData: providerDataSchema.optional(),
})

export const flightPriceRequestSchema = z.object({
  offerId: z.string(),
  offer: flightOfferSchema.optional(),
})

export const flightPriceResponseSchema = z.object({
  offer: flightOfferSchema,
  valid: z.boolean(),
  invalidReason: z.string().optional(),
})

export const billingAddressSchema = z.object({
  line1: z.string(),
  line2: z.string().optional(),
  city: z.string(),
  region: z.string().optional(),
  postalCode: z.string().optional(),
  countryCode: z.string(),
})

export const paymentIntentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hold") }),
  z.object({ type: z.literal("bank_transfer") }),
  z.object({
    type: z.literal("card"),
    token: z.string(),
    cardholderName: z.string().optional(),
    billingAddress: billingAddressSchema.optional(),
  }),
  z.object({
    type: z.literal("saved_method"),
    methodId: z.string().min(1),
  }),
  z.object({
    type: z.literal("ticket_on_credit"),
    iataCode: z.string().optional(),
  }),
])

export const travelDocumentSchema = z.object({
  type: z.enum(["passport", "national_id", "visa"]),
  number: z.string(),
  countryOfIssue: z.string(),
  countryOfNationality: z.string().optional(),
  expiryDate: z.string().optional(),
})

export const flightPassengerSchema = z.object({
  passengerId: z.string(),
  type: passengerTypeSchema,
  firstName: z.string(),
  middleName: z.string().optional(),
  lastName: z.string(),
  dateOfBirth: z.string(),
  gender: z.enum(["M", "F", "X"]).optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  documents: z.array(travelDocumentSchema).optional(),
})

export const ancillarySelectionSchema = z.object({
  baggage: z
    .array(
      z.object({
        passengerId: z.string(),
        sliceIndex: z.number().int().min(0),
        optionId: z.string(),
        quantity: z.number().int().min(1).optional(),
      }),
    )
    .optional(),
  assistance: z
    .array(
      z.object({
        passengerId: z.string(),
        optionId: z.string(),
      }),
    )
    .optional(),
  extras: z
    .array(
      z.object({
        passengerId: z.string(),
        sliceIndex: z.number().int().min(0),
        optionId: z.string(),
        quantity: z.number().int().min(1).optional(),
      }),
    )
    .optional(),
  seats: z
    .array(
      z.object({
        passengerId: z.string(),
        segmentId: z.string(),
        seatNumber: z.string(),
      }),
    )
    .optional(),
  fareBundle: z
    .array(
      z.object({
        passengerId: z.string(),
        sliceIndex: z.number().int().min(0),
        bundleId: z.string(),
      }),
    )
    .optional(),
})

export const flightBookRequestSchema = z.object({
  offerId: z.string(),
  offer: flightOfferSchema.optional(),
  passengers: z.array(flightPassengerSchema),
  contact: flightContactSchema.optional(),
  paymentIntent: paymentIntentSchema.optional(),
  ancillaries: ancillarySelectionSchema.optional(),
})

export const flightTicketSchema = z.object({
  ticketNumber: z.string(),
  passengerId: z.string(),
  segmentIds: z.array(z.string()),
  status: z.string().optional(),
})

export const flightOrderSchema = z.object({
  orderId: z.string(),
  pnr: z.string().optional(),
  status: flightOrderStatusSchema,
  offer: flightOfferSchema,
  passengers: z.array(flightPassengerSchema),
  contact: flightContactSchema.optional(),
  tickets: z.array(flightTicketSchema).optional(),
  totalPrice: moneySchema,
  paymentDeadline: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  providerData: providerDataSchema.optional(),
})

export const flightBookResponseSchema = z.object({
  order: flightOrderSchema,
})

export const flightGetOrderResponseSchema = z.object({
  order: flightOrderSchema,
})

export const flightCancelResponseSchema = z.object({
  order: flightOrderSchema,
  refundedAmount: moneySchema.optional(),
})

export const flightOrdersListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).optional(),
  status: z.array(flightOrderStatusSchema).optional(),
  search: z.string().optional(),
})

export const flightOrdersListResponseSchema = z.object({
  orders: z.array(flightOrderSchema),
  pagination: z.object({
    total: z.number().int().min(0),
    hasMore: z.boolean(),
    cursor: z.string().optional(),
  }),
})

export const ancillaryBaggageOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  category: z.enum(["checked", "cabin", "personal_item", "sports", "oversized"]),
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
  providerData: providerDataSchema.optional(),
})

export const ancillaryAssistanceOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  category: z.enum(["wheelchair", "visual", "hearing", "cognitive", "medical", "other"]),
  price: moneySchema.optional(),
  notes: z.string().optional(),
})

export const ancillaryExtraOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  category: z.string(),
  price: moneySchema,
  pricingScope: z.enum(["per_passenger", "per_booking"]).optional(),
})

export const ancillaryCatalogSchema = z.object({
  baggage: z.array(ancillaryBaggageOptionSchema),
  assistance: z.array(ancillaryAssistanceOptionSchema),
  extras: z.array(ancillaryExtraOptionSchema),
})

export const ancillaryRequestSchema = z.object({
  offerId: z.string(),
  offer: flightOfferSchema.optional(),
})

export const ancillaryResponseSchema = z.object({
  catalog: ancillaryCatalogSchema,
  validUntil: z.string().optional(),
})

export const seatSchema = z.object({
  seatNumber: z.string(),
  row: z.number().int().min(1),
  column: z.string(),
  status: z.enum(["available", "blocked", "unavailable", "selected"]),
  category: z.enum(["standard", "preferred", "extra_legroom", "exit_row", "premium", "bulkhead"]),
  price: moneySchema.optional(),
  notes: z.string().optional(),
  window: z.boolean().optional(),
  aisle: z.boolean().optional(),
  providerData: providerDataSchema.optional(),
})

export const seatRowSchema = z.object({
  row: z.number().int().min(1),
  seats: z.array(seatSchema),
})

export const seatMapSchema = z.object({
  segmentId: z.string(),
  aircraft: z.string().optional(),
  cabin: cabinClassSchema,
  columnLayout: z.array(z.string().nullable()),
  rows: z.array(seatRowSchema),
  providerData: providerDataSchema.optional(),
})

export const seatMapRequestSchema = z.object({
  offerId: z.string(),
  segmentId: z.string(),
  offer: flightOfferSchema.optional(),
})

export const seatMapResponseSchema = z.object({
  seatMap: seatMapSchema,
  validUntil: z.string().optional(),
})

export const seatAssignmentSchema = z.object({
  passengerId: z.string(),
  segmentId: z.string(),
  seatNumber: z.string(),
  price: moneySchema.optional(),
  providerData: providerDataSchema.optional(),
})

export const seatSelectionRequestSchema = z.object({
  orderId: z.string(),
  selections: z.array(seatAssignmentSchema),
})

export const seatSelectionResponseSchema = z.object({
  order: flightOrderSchema,
  selections: z.array(seatAssignmentSchema),
  additionalAmount: moneySchema.optional(),
})

export const flightBoardingPassSchema = z.object({
  passengerId: z.string(),
  segmentId: z.string(),
  boardingPassId: z.string().optional(),
  seatNumber: z.string().optional(),
  sequenceNumber: z.string().optional(),
  zone: z.string().optional(),
  providerData: providerDataSchema.optional(),
})

export const checkInRequestSchema = z.object({
  orderId: z.string(),
  passengerIds: z.array(z.string()).optional(),
  segmentIds: z.array(z.string()).optional(),
})

export const checkInResponseSchema = z.object({
  order: flightOrderSchema,
  status: checkInStatusSchema,
  boardingPasses: z.array(flightBoardingPassSchema).optional(),
})

export const flightModifyRequestSchema = z.object({
  orderId: z.string(),
  offer: flightOfferSchema.optional(),
  passengers: z.array(flightPassengerSchema).optional(),
  ancillaries: ancillarySelectionSchema.optional(),
  reason: flightModifyReasonSchema.optional(),
})

export const flightModifyResponseSchema = z.object({
  order: flightOrderSchema,
  priceDifference: signedMoneySchema.optional(),
  penalties: z.array(moneySchema).optional(),
})

export const flightRefundRequestSchema = z.object({
  orderId: z.string(),
  reason: flightRefundReasonSchema.optional(),
  amount: moneySchema.optional(),
})

export const flightRefundResponseSchema = z.object({
  order: flightOrderSchema,
  refundId: z.string().optional(),
  refundedAmount: moneySchema,
  penalties: z.array(moneySchema).optional(),
})

export const flightVoidResponseSchema = z.object({
  order: flightOrderSchema,
  voidId: z.string().optional(),
  voidedAt: z.string(),
})

export const ssrRequestSchema = z.object({
  orderId: z.string(),
  code: ssrCodeSchema,
  passengerIds: z.array(z.string()).optional(),
  segmentIds: z.array(z.string()).optional(),
  text: z.string().optional(),
})

export const ssrResponseSchema = z.object({
  order: flightOrderSchema,
  ssrId: z.string().optional(),
  status: z.enum(["requested", "confirmed", "rejected"]),
})

export const adapterLoggerSchema = z.custom<{
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}>(
  (value) =>
    isRecord(value) &&
    typeof value.debug === "function" &&
    typeof value.info === "function" &&
    typeof value.warn === "function" &&
    typeof value.error === "function",
)

export const abortSignalSchema = z.custom<AbortSignal>(
  (value) =>
    isRecord(value) &&
    typeof value.aborted === "boolean" &&
    typeof value.addEventListener === "function" &&
    typeof value.removeEventListener === "function",
)

export const flightAdapterContextSchema = z.object({
  connectionId: z.string(),
  credentials: z.record(z.string(), z.string()).optional(),
  pointOfSale: pointOfSaleSchema.optional(),
  correlationId: z.string().optional(),
  requestId: z.string().optional(),
  idempotencyKey: z.string().optional(),
  logger: adapterLoggerSchema.optional(),
  signal: abortSignalSchema.optional(),
  environment: flightAdapterEnvironmentSchema.optional(),
  deps: z.record(z.string(), z.unknown()).optional(),
})

export const flightAdapterCapabilitiesSchema = z.object({
  provider: z.string(),
  declared: z.array(flightCapabilitySchema),
  maxSlicesPerSearch: z.number().int().min(1).optional(),
  defaultTimeoutMs: z.number().int().min(1).optional(),
})
