import { bookingSessionOutcomeV1 } from "@voyant-travel/catalog-contracts/booking-engine/session-contracts"
import {
  type CatalogMoney,
  catalogMoneySchema,
  type PresentationFxQuote,
  type PresentationMoney,
  presentationFxProvenanceSchema,
  presentationMoneySchema,
} from "@voyant-travel/catalog-contracts/presentation-money"
import { z } from "zod"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const CURRENCY = /^[A-Z]{3}$/
const LANGUAGE_TAG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/

const opaqueRefSchema = z.string().min(16).max(512)
const isoDateSchema = z.string().regex(ISO_DATE, "Expected an ISO 8601 calendar date (YYYY-MM-DD)")
const currencyCodeSchema = z.string().regex(CURRENCY, "Expected an ISO 4217 currency code")
const localeSchema = z.string().regex(LANGUAGE_TAG, "Expected a BCP 47 language tag")

/** Values a browser may request. Deployment and supply selectors are deliberately absent. */
export const publicApiRequestedScopeSchema = z
  .object({
    marketId: z.string().min(1).max(128).optional(),
    locale: localeSchema.optional(),
    currency: currencyCodeSchema.optional(),
  })
  .strict()

/**
 * Server-authoritative scope after validation against the active operator market.
 * `available` is suitable for language/currency pickers and proves which values
 * were considered while resolving defaults or clamping stale browser choices.
 */
export const publicApiResolvedScopeSchema = z
  .object({
    marketId: z.string().min(1).max(128),
    locale: localeSchema,
    currency: currencyCodeSchema,
    available: z
      .object({
        marketIds: z.array(z.string().min(1).max(128)).min(1),
        locales: z.array(localeSchema).min(1),
        currencies: z.array(currencyCodeSchema).min(1),
      })
      .strict(),
  })
  .strict()

/** Shared Catalog money authority re-exported under the Storefront names. */
export const publicApiNativeMoneySchema = catalogMoneySchema
export const publicApiFxQuoteSchema = presentationFxProvenanceSchema
/** Native supplier amount plus server-normalized display amount. Themes never calculate FX. */
export const publicApiPresentationMoneySchema = presentationMoneySchema
export type PublicApiNativeMoney = CatalogMoney
export type PublicApiFxQuote = PresentationFxQuote
export type PublicApiPresentationMoney = PresentationMoney

export const publicApiInspirationGroupSchema = z.enum([
  "tours",
  "excursions",
  "experiences",
  "activities",
  "attractions",
  "stays",
  "cruises",
  "charters",
])

const destinationSchema = z
  .object({
    query: z.string().min(1).max(200).optional(),
    countryCode: z.string().length(2).optional(),
    city: z.string().min(1).max(120).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  })
  .strict()
  .superRefine((destination, ctx) => {
    if (
      destination.query === undefined &&
      destination.countryCode === undefined &&
      destination.city === undefined &&
      destination.latitude === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one destination criterion is required",
      })
    }
    if ((destination.latitude === undefined) !== (destination.longitude === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "latitude and longitude must be supplied together",
      })
    }
  })

const paginationSchema = z
  .object({
    cursor: opaqueRefSchema.optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict()

const inspirationGroupRequestSchema = z
  .object({
    group: publicApiInspirationGroupSchema,
    query: z.string().max(300).optional(),
    destination: destinationSchema.optional(),
    fromDate: isoDateSchema.optional(),
    toDate: isoDateSchema.optional(),
    pagination: paginationSchema.optional(),
  })
  .strict()

export const publicApiIndexedInspirationIntentSchema = z
  .object({
    kind: z.literal("indexed-inspiration"),
    groups: z.array(inspirationGroupRequestSchema).min(1).max(8),
  })
  .strict()
  .superRefine((intent, ctx) => {
    const seen = new Set<string>()
    for (const [index, group] of intent.groups.entries()) {
      if (seen.has(group.group)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["groups", index, "group"],
          message: "Each inspiration group may be requested only once",
        })
      }
      seen.add(group.group)
    }
  })

const travelersSchema = z
  .object({
    adults: z.number().int().min(1).max(20),
    childrenAges: z.array(z.number().int().min(0).max(17)).max(20).optional(),
    infants: z.number().int().min(0).max(10).optional(),
  })
  .strict()

const flightSliceSchema = z
  .object({
    origin: z.string().length(3),
    destination: z.string().length(3),
    departureDate: isoDateSchema,
  })
  .strict()

export const publicApiFlightSearchIntentSchema = z
  .object({
    kind: z.literal("flight"),
    slices: z.array(flightSliceSchema).min(1).max(6),
    travelers: travelersSchema,
    cabin: z.enum(["economy", "premium_economy", "business", "first"]).optional(),
    directOnly: z.boolean().optional(),
    pagination: paginationSchema.optional(),
  })
  .strict()

const stayRoomSchema = z
  .object({
    adults: z.number().int().min(1).max(20),
    childrenAges: z.array(z.number().int().min(0).max(17)).max(20).optional(),
  })
  .strict()

export const publicApiStaySearchIntentSchema = z
  .object({
    kind: z.literal("stay"),
    destination: destinationSchema,
    checkIn: isoDateSchema,
    checkOut: isoDateSchema,
    rooms: z.array(stayRoomSchema).min(1).max(10),
    minStars: z.number().min(1).max(5).optional(),
    pagination: paginationSchema.optional(),
  })
  .strict()
  .superRefine((intent, ctx) => {
    if (intent.checkOut <= intent.checkIn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["checkOut"],
        message: "checkOut must be after checkIn",
      })
    }
  })

export const publicApiPackageSearchIntentSchema = z
  .object({
    kind: z.literal("package"),
    origin: z.string().length(3),
    destination: destinationSchema,
    departureDateFrom: isoDateSchema,
    departureDateTo: isoDateSchema,
    nights: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }).strict(),
    travelers: travelersSchema,
    boards: z.array(z.string().min(1).max(80)).max(20).optional(),
    minStars: z.number().min(1).max(5).optional(),
    pagination: paginationSchema.optional(),
  })
  .strict()
  .superRefine((intent, ctx) => {
    if (intent.departureDateTo < intent.departureDateFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["departureDateTo"],
        message: "departureDateTo must not be before departureDateFrom",
      })
    }
    if (intent.nights.max < intent.nights.min) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nights", "max"],
        message: "nights.max must not be less than nights.min",
      })
    }
  })

export const publicApiCruiseSearchIntentSchema = z
  .object({
    kind: z.literal("cruise"),
    query: z.string().min(1).max(300).optional(),
    departureDateFrom: isoDateSchema.optional(),
    departureDateTo: isoDateSchema.optional(),
    travelers: travelersSchema.extend({ seniors: z.number().int().min(0).max(20).optional() }),
    cruiseTypes: z
      .array(z.enum(["ocean", "river", "expedition", "coastal"]))
      .max(4)
      .optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict()
  .superRefine((intent, ctx) => {
    if (
      intent.departureDateFrom !== undefined &&
      intent.departureDateTo !== undefined &&
      intent.departureDateTo < intent.departureDateFrom
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["departureDateTo"],
        message: "departureDateTo must not be before departureDateFrom",
      })
    }
  })

export const publicApiShoppingIntentSchema = z.discriminatedUnion("kind", [
  publicApiIndexedInspirationIntentSchema,
  publicApiFlightSearchIntentSchema,
  publicApiStaySearchIntentSchema,
  publicApiPackageSearchIntentSchema,
  publicApiCruiseSearchIntentSchema,
])

/** Complete browser request. `.strict()` at every object boundary rejects trust-plane selectors. */
export const publicApiShoppingRequestSchema = z
  .object({ scope: publicApiRequestedScopeSchema, intent: publicApiShoppingIntentSchema })
  .strict()

const coverageSchema = z
  .object({
    status: z.enum(["complete", "partial", "unavailable"]),
    succeeded: z.number().int().min(0),
    failed: z.number().int().min(0),
    timedOut: z.number().int().min(0),
  })
  .strict()

const imageSchema = z
  .object({ url: z.string().url(), alt: z.string().max(300).optional() })
  .strict()

const inspirationItemSchema = z
  .object({
    itemRef: opaqueRefSchema,
    title: z.string().min(1),
    summary: z.string().optional(),
    href: z.string().min(1).optional(),
    image: imageSchema.optional(),
    priceFrom: publicApiPresentationMoneySchema.optional(),
  })
  .strict()

const inspirationGroupResultSchema = z
  .object({
    group: publicApiInspirationGroupSchema,
    items: z.array(inspirationItemSchema),
    total: z.number().int().min(0),
    nextCursor: opaqueRefSchema.optional(),
  })
  .strict()

export const publicApiIndexedInspirationResultSchema = z
  .object({
    kind: z.literal("indexed-inspiration"),
    scope: publicApiResolvedScopeSchema,
    groups: z.array(inspirationGroupResultSchema),
  })
  .strict()

const airportStopSchema = z
  .object({ code: z.string().length(3), at: z.string().datetime({ offset: true }) })
  .strict()
const flightSegmentResultSchema = z
  .object({
    origin: airportStopSchema,
    destination: airportStopSchema,
    marketingCarrier: z.string().min(2).max(3),
    flightNumber: z.string().min(1).max(12),
  })
  .strict()
const flightItinerarySchema = z
  .object({ segments: z.array(flightSegmentResultSchema).min(1), duration: z.string().optional() })
  .strict()

const flightOfferSchema = z
  .object({
    offerRef: opaqueRefSchema,
    itineraries: z.array(flightItinerarySchema).min(1),
    price: publicApiPresentationMoneySchema,
    expiresAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict()

export const publicApiFlightSearchResultSchema = z
  .object({
    kind: z.literal("flight"),
    scope: publicApiResolvedScopeSchema,
    offers: z.array(flightOfferSchema),
    coverage: coverageSchema,
    nextCursor: opaqueRefSchema.optional(),
  })
  .strict()

const stayOfferSchema = z
  .object({
    offerRef: opaqueRefSchema,
    accommodationRef: opaqueRefSchema,
    title: z.string().min(1),
    checkIn: isoDateSchema,
    checkOut: isoDateSchema,
    roomName: z.string().optional(),
    boardName: z.string().optional(),
    image: imageSchema.optional(),
    price: publicApiPresentationMoneySchema,
    expiresAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict()

export const publicApiStaySearchResultSchema = z
  .object({
    kind: z.literal("stay"),
    scope: publicApiResolvedScopeSchema,
    offers: z.array(stayOfferSchema),
    coverage: coverageSchema,
    nextCursor: opaqueRefSchema.optional(),
  })
  .strict()

const packageOfferSchema = z
  .object({
    offerRef: opaqueRefSchema,
    title: z.string().min(1),
    origin: z.string().length(3),
    destination: z.string().min(1),
    departureDate: isoDateSchema,
    nights: z.number().int().min(1),
    accommodationName: z.string().min(1),
    boardName: z.string().optional(),
    image: imageSchema.optional(),
    price: publicApiPresentationMoneySchema,
    expiresAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict()

export const publicApiPackageSearchResultSchema = z
  .object({
    kind: z.literal("package"),
    scope: publicApiResolvedScopeSchema,
    offers: z.array(packageOfferSchema),
    coverage: coverageSchema,
    nextCursor: opaqueRefSchema.optional(),
  })
  .strict()

const cruiseOfferSchema = z
  .object({
    offerRef: opaqueRefSchema,
    title: z.string().min(1),
    cruiseType: z.enum(["ocean", "river", "expedition", "coastal"]),
    lineName: z.string().min(1),
    shipName: z.string().min(1),
    departureDate: isoDateSchema,
    returnDate: isoDateSchema,
    nights: z.number().int().min(1),
    embarkPortName: z.string().optional(),
    disembarkPortName: z.string().optional(),
    cabinName: z.string().min(1),
    availability: z.enum(["available", "limited"]),
    image: imageSchema.optional(),
    price: publicApiPresentationMoneySchema,
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict()

export const publicApiCruiseSearchResultSchema = z
  .object({
    kind: z.literal("cruise"),
    scope: publicApiResolvedScopeSchema,
    offers: z.array(cruiseOfferSchema),
    coverage: coverageSchema,
  })
  .strict()

export const publicApiShoppingResultSchema = z.discriminatedUnion("kind", [
  publicApiIndexedInspirationResultSchema,
  publicApiFlightSearchResultSchema,
  publicApiStaySearchResultSchema,
  publicApiPackageSearchResultSchema,
  publicApiCruiseSearchResultSchema,
])

const tripOfferSelectionSchema = z
  .object({
    kind: z.enum(["product", "flight", "stay", "package", "cruise"]),
    offerRef: opaqueRefSchema,
    quantity: z.number().int().min(1).max(99).optional(),
  })
  .strict()

export const publicApiTripSelectionCreateSchema = z
  .object({
    scope: publicApiRequestedScopeSchema,
    offers: z.array(tripOfferSelectionSchema).min(1).max(100),
  })
  .strict()

const tripSelectionMutationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("add"), offer: tripOfferSelectionSchema }).strict(),
  z.object({ kind: z.literal("remove"), itemRef: opaqueRefSchema }).strict(),
  z
    .object({ kind: z.literal("reorder"), itemRefs: z.array(opaqueRefSchema).min(1).max(100) })
    .strict(),
])

export const publicApiTripSelectionUpdateSchema = z
  .object({
    selectionRef: opaqueRefSchema,
    expectedRevision: z.number().int().min(0),
    mutation: tripSelectionMutationSchema,
  })
  .strict()

const tripSelectionItemSchema = z
  .object({
    itemRef: opaqueRefSchema,
    kind: z.enum(["product", "flight", "stay", "package", "cruise"]),
    quantity: z.number().int().min(1),
  })
  .strict()

export const publicApiTripSelectionSchema = z
  .object({
    selectionRef: opaqueRefSchema,
    revision: z.number().int().min(0),
    scope: publicApiResolvedScopeSchema,
    items: z.array(tripSelectionItemSchema).max(100),
  })
  .strict()

export const publicApiTripBookingCreateSchema = z
  .object({
    selectionRef: opaqueRefSchema,
    expectedRevision: z.number().int().min(0),
    idempotencyKey: z.string().min(8).max(128),
  })
  .strict()

export const publicApiTripBookingSchema = z
  .object({
    bookingSessionCapability: z
      .string()
      .regex(/^bcap_[A-Za-z0-9_-]{43,}$/)
      .optional(),
    outcome: bookingSessionOutcomeV1,
  })
  .strict()

export type PublicApiRequestedScope = z.infer<typeof publicApiRequestedScopeSchema>
export type PublicApiResolvedScope = z.infer<typeof publicApiResolvedScopeSchema>
export type PublicApiShoppingIntent = z.infer<typeof publicApiShoppingIntentSchema>
export type PublicApiShoppingRequest = z.infer<typeof publicApiShoppingRequestSchema>
export type PublicApiShoppingResult = z.infer<typeof publicApiShoppingResultSchema>
export type PublicApiTripSelectionCreate = z.infer<typeof publicApiTripSelectionCreateSchema>
export type PublicApiTripSelectionUpdate = z.infer<typeof publicApiTripSelectionUpdateSchema>
export type PublicApiTripSelection = z.infer<typeof publicApiTripSelectionSchema>
export type PublicApiTripBookingCreate = z.infer<typeof publicApiTripBookingCreateSchema>
export type PublicApiTripBooking = z.infer<typeof publicApiTripBookingSchema>
