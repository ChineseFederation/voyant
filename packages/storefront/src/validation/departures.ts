import { extraPricingModeSchema } from "@voyant-travel/bookings/extras/validation"
import { z } from "zod"

import { languageTagSchema } from "../validation-settings.js"
import {
  storefrontAppliedOfferSchema,
  storefrontOfferConflictSchema,
  storefrontOfferMutationResultSchema,
  storefrontPromotionalOfferSchema,
} from "./offers.js"

export const storefrontDepartureStatusSchema = z.enum([
  "open",
  "closed",
  "sold_out",
  "cancelled",
  "on_request",
])

const persistedDepartureStatusSchema = z.enum(["open", "closed", "sold_out", "cancelled"])

export const storefrontDepartureRoomOccupancySchema = z.object({
  adultsMin: z.number().int().min(0),
  adultsMax: z.number().int().min(0),
  childrenMax: z.number().int().min(0),
})

export const storefrontDepartureRoomPriceSchema = z.object({
  amount: z.number(),
  currencyCode: z.string(),
  roomType: z.object({
    id: z.string(),
    name: z.string(),
    occupancy: storefrontDepartureRoomOccupancySchema,
  }),
})

export const storefrontDepartureRatePlanSchema = z.object({
  id: z.string(),
  active: z.boolean(),
  name: z.string(),
  pricingModel: z.string(),
  basePrices: z.array(
    z.object({
      amount: z.number(),
      currencyCode: z.string(),
    }),
  ),
  roomPrices: z.array(storefrontDepartureRoomPriceSchema),
})

export const storefrontDepartureStartTimeSchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  startTimeLocal: z.string(),
  durationMinutes: z.number().int().nullable(),
})

export const storefrontDepartureResourceManifestSchema = z.object({
  kinds: z.array(
    z.object({
      kind: z.string(),
      capacity: z.number(),
      assigned: z.number(),
      available: z.number(),
    }),
  ),
  resources: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      label: z.string().nullable(),
      refType: z.string().nullable(),
      refId: z.string().nullable(),
      capacity: z.number(),
      assigned: z.number(),
      available: z.number(),
      parentId: z.string().nullable(),
      flags: z.record(z.string(), z.unknown()),
    }),
  ),
})

export const storefrontDepartureSchema = z.object({
  id: z.string(),
  productId: z.string(),
  itineraryId: z.string(),
  optionId: z.string().nullable(),
  dateLocal: z.string().nullable(),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
  timezone: z.string(),
  startTime: storefrontDepartureStartTimeSchema.nullable(),
  meetingPoint: z.string().nullable(),
  capacity: z.number().int().nullable(),
  remaining: z.number().int().nullable(),
  departureStatus: storefrontDepartureStatusSchema,
  nights: z.number().int().nullable(),
  days: z.number().int().nullable(),
  ratePlans: z.array(storefrontDepartureRatePlanSchema),
  // Always present on a built departure (`buildResourceManifest`); `null` when
  // the departure tracks no resources. Feeds both the departure-by-id and the
  // product departures list responses.
  resourceManifest: storefrontDepartureResourceManifestSchema.nullable(),
})

export const storefrontDepartureListQuerySchema = z.object({
  optionId: z.string().optional(),
  status: persistedDepartureStatusSchema.optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  limit: z.coerce.number().int().min(1).max(250).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})

export const storefrontDepartureListResponseSchema = z.object({
  data: z.array(storefrontDepartureSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
})

export const storefrontProductAvailabilityStateSchema = z.enum([
  "available",
  "sold_out",
  "closed",
  "cancelled",
  "on_request",
  "past_cutoff",
  "too_early",
  "unavailable",
])

export const storefrontProductAvailabilitySummaryQuerySchema = z.object({
  optionId: z.string().optional(),
  status: storefrontDepartureStatusSchema.optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  locale: languageTagSchema.optional(),
  limit: z.coerce.number().int().min(1).max(250).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})

export const storefrontProductAvailabilitySlotSchema = z.object({
  id: z.string(),
  productId: z.string(),
  optionId: z.string().nullable(),
  dateLocal: z.string().nullable(),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
  timezone: z.string(),
  status: storefrontDepartureStatusSchema,
  availabilityState: storefrontProductAvailabilityStateSchema,
  capacity: z.number().int().nullable(),
  remaining: z.number().int().nullable(),
  pastCutoff: z.boolean(),
  tooEarly: z.boolean(),
})

export const storefrontProductAvailabilitySummarySchema = z.object({
  productId: z.string(),
  availabilityState: storefrontProductAvailabilityStateSchema,
  counts: z.object({
    total: z.number().int(),
    open: z.number().int(),
    closed: z.number().int(),
    soldOut: z.number().int(),
    cancelled: z.number().int(),
    onRequest: z.number().int(),
    pastCutoff: z.number().int(),
    tooEarly: z.number().int(),
    available: z.number().int(),
  }),
  departures: z.array(storefrontProductAvailabilitySlotSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
})

export const storefrontProductAvailabilitySummaryResponseSchema = z.object({
  data: storefrontProductAvailabilitySummarySchema,
})

export const storefrontDeparturePricePreviewInputSchema = z.object({
  pax: z
    .object({
      adults: z.coerce.number().int().min(0).default(1),
      children: z.coerce.number().int().min(0).default(0),
      infants: z.coerce.number().int().min(0).default(0),
    })
    .default({ adults: 1, children: 0, infants: 0 }),
  currencyCode: z.string().trim().min(1).optional().nullable(),
  rooms: z
    .array(
      z.object({
        unitId: z.string().trim().min(1),
        occupancy: z.coerce.number().int().min(1).default(1),
        quantity: z.coerce.number().int().min(1).default(1),
      }),
    )
    .default([]),
  extras: z
    .array(
      z.object({
        extraId: z.string().trim().min(1),
        quantity: z.coerce.number().int().min(1).default(1),
      }),
    )
    .default([]),
  offers: z
    .array(
      z.object({
        slug: z.string().trim().min(1).max(120),
      }),
    )
    .default([]),
  offerCode: z.string().trim().min(1).max(80).optional().nullable(),
  locale: languageTagSchema.optional(),
  market: z.string().trim().min(1).default("default"),
})

export const storefrontDeparturePriceLineItemSchema = z.object({
  name: z.string(),
  total: z.number(),
  quantity: z.number().int().min(1),
  unitPrice: z.number(),
})

export const storefrontDeparturePriceSlotSchema = z.object({
  id: z.string(),
  productId: z.string(),
  optionId: z.string().nullable(),
  dateLocal: z.string().nullable(),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
  timezone: z.string(),
  status: storefrontDepartureStatusSchema,
  availabilityState: storefrontProductAvailabilityStateSchema,
  capacity: z.number().int().nullable(),
  remaining: z.number().int().nullable(),
  pastCutoff: z.boolean(),
  tooEarly: z.boolean(),
})

export const storefrontDeparturePricePaxSchema = z.object({
  adults: z.number().int().min(0),
  children: z.number().int().min(0),
  infants: z.number().int().min(0),
  total: z.number().int().min(1),
})

export const storefrontDeparturePriceUnitRowSchema = z.object({
  unitId: z.string().nullable(),
  requestRef: z.string().nullable(),
  name: z.string(),
  unitType: z.string().nullable(),
  quantity: z.number().int().min(1),
  pricingMode: z.string().nullable(),
  unitPrice: z.number(),
  total: z.number(),
  currencyCode: z.string(),
  tierId: z.string().nullable(),
})

export const storefrontDeparturePriceRoomRowSchema = z.object({
  unitId: z.string(),
  name: z.string(),
  occupancy: z.number().int().min(1),
  quantity: z.number().int().min(1),
  pax: z.number().int().min(1),
  pricingMode: z.string().nullable(),
  unitPrice: z.number(),
  total: z.number(),
  currencyCode: z.string(),
  tierId: z.string().nullable(),
})

export const storefrontDeparturePriceAllocationSchema = z.object({
  slot: storefrontDeparturePriceSlotSchema,
  pax: storefrontDeparturePricePaxSchema,
  requestedUnits: z.array(storefrontDeparturePriceUnitRowSchema),
  rooms: z.array(storefrontDeparturePriceRoomRowSchema),
})

export const storefrontDeparturePriceExtraImpactSchema = z.object({
  extraId: z.string(),
  name: z.string(),
  required: z.boolean(),
  selectable: z.boolean(),
  selected: z.boolean(),
  pricingMode: z.lazy(() => extraPricingModeSchema),
  quantity: z.number().int().min(0),
  unitPrice: z.number(),
  total: z.number(),
  currencyCode: z.string(),
})

export const storefrontDeparturePriceOfferImpactSchema = z.object({
  offer: z.lazy(() => storefrontPromotionalOfferSchema),
  status: z.enum(["applied", "not_applicable", "conflict"]),
  reason: z.enum(["min_pax", "eligibility", "currency", "no_discount", "conflict"]).nullable(),
  selected: z.boolean(),
  discountAppliedCents: z.number().int(),
  discountedPriceCents: z.number().int(),
})

export const storefrontDeparturePriceRequestedOfferSchema = z.object({
  kind: z.enum(["slug", "code"]),
  value: z.string(),
  result: z.lazy(() => storefrontOfferMutationResultSchema).nullable(),
})

export const storefrontDeparturePriceOffersSchema = z.object({
  available: z.array(storefrontDeparturePriceOfferImpactSchema),
  requested: z.array(storefrontDeparturePriceRequestedOfferSchema),
  applied: z.array(z.lazy(() => storefrontAppliedOfferSchema)),
  conflict: z.lazy(() => storefrontOfferConflictSchema).nullable(),
  discountTotal: z.number(),
  discountTotalCents: z.number().int(),
  totalAfterDiscount: z.number(),
  currencyCode: z.string(),
})

export const storefrontDeparturePriceTotalsSchema = z.object({
  currencyCode: z.string(),
  base: z.number(),
  extras: z.number(),
  subtotal: z.number(),
  discount: z.number(),
  tax: z.number(),
  total: z.number(),
  perPerson: z.number(),
  perBooking: z.number(),
})

export const storefrontDeparturePricePreviewSchema = z.object({
  departureId: z.string(),
  productId: z.string(),
  optionId: z.string().nullable(),
  currencyCode: z.string(),
  basePrice: z.number(),
  taxAmount: z.number(),
  total: z.number(),
  notes: z.string().nullable(),
  lineItems: z.array(storefrontDeparturePriceLineItemSchema),
  allocation: storefrontDeparturePriceAllocationSchema,
  units: z.array(storefrontDeparturePriceUnitRowSchema),
  rooms: z.array(storefrontDeparturePriceRoomRowSchema),
  extras: z.array(storefrontDeparturePriceExtraImpactSchema),
  offers: storefrontDeparturePriceOffersSchema,
  totals: storefrontDeparturePriceTotalsSchema,
})

export const storefrontProductExtensionsQuerySchema = z.object({
  optionId: z.string().optional(),
})

export const storefrontProductExtensionMediaSchema = z.object({
  url: z.string().trim().min(1),
  alt: z.string().trim().min(1).nullable(),
})

export const storefrontProductExtensionDetailSchema = z.object({
  description: z.string().nullable(),
  media: z.array(storefrontProductExtensionMediaSchema),
})

// A product extension's `pricingMode` is sourced from commerce option price
// rules, whose domain is the `addon_pricing_mode` enum — which can disable an
// add-on for an option via `unavailable` (NOT a value in the bookings-extras
// `extraPricingModeSchema`). Mirrored locally rather than imported from the
// commerce barrel to keep the storefront wire layer decoupled (same pattern as
// products' inlined service-type enum).
export const storefrontExtensionPricingModeSchema = z.enum([
  "included",
  "per_person",
  "per_booking",
  "on_request",
  "unavailable",
])

export const storefrontProductExtensionSchema = z.object({
  id: z.string(),
  name: z.string(),
  label: z.string(),
  required: z.boolean(),
  selectable: z.boolean(),
  hasOptions: z.boolean(),
  refProductId: z.string().nullable(),
  thumb: z.string().nullable(),
  pricePerPerson: z.number().nullable(),
  currencyCode: z.string(),
  pricingMode: storefrontExtensionPricingModeSchema,
  defaultQuantity: z.number().int().nullable(),
  minQuantity: z.number().int().nullable(),
  maxQuantity: z.number().int().nullable(),
})

export const storefrontProductExtensionsResponseSchema = z.object({
  extensions: z.array(storefrontProductExtensionSchema),
  items: z.array(storefrontProductExtensionSchema),
  details: z.record(z.string(), storefrontProductExtensionDetailSchema),
  currencyCode: z.string(),
})

export const storefrontDepartureItinerarySegmentSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
})

export const storefrontDepartureItineraryQuerySchema = z.object({
  languageTag: languageTagSchema.optional(),
  lang: languageTagSchema.optional(),
})

export const storefrontDepartureItineraryDaySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  thumbnail: z
    .object({
      url: z.string().trim().min(1),
    })
    .nullable(),
  segments: z.array(storefrontDepartureItinerarySegmentSchema),
})

export const storefrontDepartureItinerarySchema = z.object({
  id: z.string(),
  itineraryId: z.string(),
  days: z.array(storefrontDepartureItineraryDaySchema),
})

export type StorefrontDepartureListQuery = z.infer<typeof storefrontDepartureListQuerySchema>
export type StorefrontDepartureItineraryQuery = z.infer<
  typeof storefrontDepartureItineraryQuerySchema
>
export type StorefrontProductAvailabilitySummaryQuery = z.infer<
  typeof storefrontProductAvailabilitySummaryQuerySchema
>
export type StorefrontDeparturePricePreviewInput = z.infer<
  typeof storefrontDeparturePricePreviewInputSchema
>
export type StorefrontDeparturePricePreview = z.infer<typeof storefrontDeparturePricePreviewSchema>
