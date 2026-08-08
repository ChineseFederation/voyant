import { z } from "zod"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const CURRENCY = /^[A-Z]{3}$/
const LANGUAGE_TAG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/

const opaqueRefSchema = z.string().min(16).max(512)
const isoDateSchema = z.string().regex(ISO_DATE, "Expected an ISO 8601 calendar date (YYYY-MM-DD)")
const currencyCodeSchema = z.string().regex(CURRENCY, "Expected an ISO 4217 currency code")
const localeSchema = z.string().regex(LANGUAGE_TAG, "Expected a BCP 47 language tag")

/** Values a browser may request. Deployment and supply selectors are deliberately absent. */
export const storefrontRequestedScopeSchema = z
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
export const storefrontResolvedScopeSchema = z
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

export const storefrontNativeMoneySchema = z
  .object({ amount: z.string().min(1), currency: currencyCodeSchema })
  .strict()

export const storefrontFxQuoteSchema = z
  .object({
    authority: z.string().min(1).max(128),
    rate: z.string().min(1),
    quotedAt: z.string().datetime({ offset: true }),
    validUntil: z.string().datetime({ offset: true }).optional(),
  })
  .strict()

/** Native supplier amount plus server-normalized display amount. Themes never calculate FX. */
export const storefrontPresentationMoneySchema = z
  .object({
    native: storefrontNativeMoneySchema,
    presentation: storefrontNativeMoneySchema,
    fx: storefrontFxQuoteSchema.optional(),
  })
  .strict()
  .superRefine((money, ctx) => {
    if (money.native.currency !== money.presentation.currency && !money.fx) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fx"],
        message: "FX provenance is required when native and presentation currencies differ",
      })
    }
  })

export const storefrontInspirationGroupSchema = z.enum([
  "tours",
  "excursions",
  "experiences",
  "activities",
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
    group: storefrontInspirationGroupSchema,
    query: z.string().max(300).optional(),
    destination: destinationSchema.optional(),
    fromDate: isoDateSchema.optional(),
    toDate: isoDateSchema.optional(),
    pagination: paginationSchema.optional(),
  })
  .strict()

export const storefrontIndexedInspirationIntentSchema = z
  .object({
    kind: z.literal("indexed-inspiration"),
    groups: z.array(inspirationGroupRequestSchema).min(1).max(7),
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

export const storefrontFlightSearchIntentSchema = z
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

export const storefrontStaySearchIntentSchema = z
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

export const storefrontPackageSearchIntentSchema = z
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

export const storefrontShoppingIntentSchema = z.discriminatedUnion("kind", [
  storefrontIndexedInspirationIntentSchema,
  storefrontFlightSearchIntentSchema,
  storefrontStaySearchIntentSchema,
  storefrontPackageSearchIntentSchema,
])

/** Complete browser request. `.strict()` at every object boundary rejects trust-plane selectors. */
export const storefrontShoppingRequestSchema = z
  .object({ scope: storefrontRequestedScopeSchema, intent: storefrontShoppingIntentSchema })
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
    priceFrom: storefrontPresentationMoneySchema.optional(),
  })
  .strict()

const inspirationGroupResultSchema = z
  .object({
    group: storefrontInspirationGroupSchema,
    items: z.array(inspirationItemSchema),
    total: z.number().int().min(0),
    nextCursor: opaqueRefSchema.optional(),
  })
  .strict()

export const storefrontIndexedInspirationResultSchema = z
  .object({
    kind: z.literal("indexed-inspiration"),
    scope: storefrontResolvedScopeSchema,
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
    price: storefrontPresentationMoneySchema,
    expiresAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict()

export const storefrontFlightSearchResultSchema = z
  .object({
    kind: z.literal("flight"),
    scope: storefrontResolvedScopeSchema,
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
    price: storefrontPresentationMoneySchema,
    expiresAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict()

export const storefrontStaySearchResultSchema = z
  .object({
    kind: z.literal("stay"),
    scope: storefrontResolvedScopeSchema,
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
    price: storefrontPresentationMoneySchema,
    expiresAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict()

export const storefrontPackageSearchResultSchema = z
  .object({
    kind: z.literal("package"),
    scope: storefrontResolvedScopeSchema,
    offers: z.array(packageOfferSchema),
    coverage: coverageSchema,
    nextCursor: opaqueRefSchema.optional(),
  })
  .strict()

export const storefrontShoppingResultSchema = z.discriminatedUnion("kind", [
  storefrontIndexedInspirationResultSchema,
  storefrontFlightSearchResultSchema,
  storefrontStaySearchResultSchema,
  storefrontPackageSearchResultSchema,
])

const tripOfferSelectionSchema = z
  .object({
    kind: z.enum(["product", "flight", "stay", "package"]),
    offerRef: opaqueRefSchema,
    quantity: z.number().int().min(1).max(99).optional(),
  })
  .strict()

export const storefrontTripSelectionCreateSchema = z
  .object({
    scope: storefrontRequestedScopeSchema,
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

export const storefrontTripSelectionUpdateSchema = z
  .object({
    selectionRef: opaqueRefSchema,
    expectedRevision: z.number().int().min(0),
    mutation: tripSelectionMutationSchema,
  })
  .strict()

const tripSelectionItemSchema = z
  .object({
    itemRef: opaqueRefSchema,
    kind: z.enum(["product", "flight", "stay", "package"]),
    quantity: z.number().int().min(1),
  })
  .strict()

export const storefrontTripSelectionSchema = z
  .object({
    selectionRef: opaqueRefSchema,
    revision: z.number().int().min(0),
    scope: storefrontResolvedScopeSchema,
    items: z.array(tripSelectionItemSchema).max(100),
  })
  .strict()

export type StorefrontRequestedScope = z.infer<typeof storefrontRequestedScopeSchema>
export type StorefrontResolvedScope = z.infer<typeof storefrontResolvedScopeSchema>
export type StorefrontShoppingIntent = z.infer<typeof storefrontShoppingIntentSchema>
export type StorefrontShoppingRequest = z.infer<typeof storefrontShoppingRequestSchema>
export type StorefrontShoppingResult = z.infer<typeof storefrontShoppingResultSchema>
export type StorefrontTripSelectionCreate = z.infer<typeof storefrontTripSelectionCreateSchema>
export type StorefrontTripSelectionUpdate = z.infer<typeof storefrontTripSelectionUpdateSchema>
export type StorefrontTripSelection = z.infer<typeof storefrontTripSelectionSchema>
