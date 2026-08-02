import { z } from "zod"

import type { SourceAdapter } from "./contract.js"

const recordSchema = z.record(z.string(), z.unknown())
const localeSchema = z.string().regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/)
const currencySchema = z.string().length(3)
const dateOrStringSchema = z.union([z.date(), z.string()])
const catalogVerticalSchema = z.string()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const optionalFunction = (value: unknown) => value === undefined || typeof value === "function"

export const postBookOperationSchema = z.enum([
  "modify",
  "cancel",
  "status",
  "refund",
  "exchange",
  "void",
])

export const capabilitySupportSchema = z.enum(["supported", "unsupported", "unknown"])

export const providerCapabilityKeySchema = z.enum([
  "category_availability_counts",
  "physical_inventory_units",
  "inventory_assignment_selection",
  "price_ranges",
  "offer_applicability_evaluation",
  "promotion_media",
  "promotion_stacking_rules",
])

export const providerCapabilityDeclarationSchema = z.object({
  capability: providerCapabilityKeySchema,
  support: capabilitySupportSchema,
  applies_to: z.array(z.string()).readonly().optional(),
  reason: z.string().optional(),
  evidence: z.string().optional(),
  source_updated_at: dateOrStringSchema.optional(),
})

export const promotionApplicabilityEvaluationSchema = z.enum([
  "evaluable",
  "not_evaluable_locally",
  "unknown",
])

export const promotionPriceEffectSchema = z.enum([
  "price_affecting",
  "informational_only",
  "unknown",
])

export const promotionApplicabilityConstraintKindSchema = z.enum([
  "loyalty",
  "solo_traveler",
  "market",
  "language",
  "currency",
  "fare_code",
  "passenger_occupancy",
  "booking_window",
  "travel_window",
  "customer_session",
])

export const promotionApplicabilityResolutionSchema = z.enum([
  "eligible",
  "ineligible",
  "customer_context_required",
  "not_evaluable_locally",
  "unknown",
])

export const promotionApplicabilityConstraintSchema = z.object({
  kind: promotionApplicabilityConstraintKindSchema,
  resolution: promotionApplicabilityResolutionSchema,
  values: z.array(z.string()).readonly().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  starts_at: dateOrStringSchema.optional(),
  ends_at: dateOrStringSchema.optional(),
  requires_customer_context: z.boolean().optional(),
  reason: z.string().optional(),
})

export const promotionApplicabilitySchema = z.object({
  evaluation: promotionApplicabilityEvaluationSchema,
  price_effect: promotionPriceEffectSchema,
  constraints: z.array(promotionApplicabilityConstraintSchema).readonly(),
})

export const promotionMediaKindSchema = z.enum(["hero", "primary", "thumbnail", "logo", "other"])

export const promotionMediaAssetSchema = z.object({
  kind: promotionMediaKindSchema,
  url: z.url(),
  alt_text: z.string().optional(),
  mime_type: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
})

export const promotionDisplayFieldsSchema = z.object({
  display_name: z.string().optional(),
  subtitle: z.string().optional(),
  rich_description: z.string().optional(),
  terms_and_conditions: z.string().optional(),
  media: z.array(promotionMediaAssetSchema).readonly().optional(),
  featured: z.boolean().optional(),
  display_priority: z.number().int().optional(),
})

export const promotionStackingSemanticsSchema = z.enum([
  "stackable",
  "exclusive",
  "provider_defined",
  "unknown",
])

export const providerPromotionSchema = z.object({
  source_offer_id: z.string(),
  source_offer_ref: z.string().optional(),
  provider: z.string().optional(),
  display: promotionDisplayFieldsSchema.optional(),
  applicability: promotionApplicabilitySchema,
  stacking: promotionStackingSemanticsSchema,
  raw_payload: recordSchema.optional(),
})

export const availabilityRowKindSchema = z.enum([
  "entity",
  "departure",
  "sailing",
  "category",
  "fare",
  "other",
])

export const availabilityUnitPrecisionSchema = z.enum([
  "exact",
  "category_count",
  "lower_bound",
  "upper_bound",
  "unknown",
])

export const availabilityStatusSchema = z.enum([
  "available",
  "low",
  "unavailable",
  "sold_out",
  "on_request",
  "unknown",
])

export const availabilityBadgeKindSchema = z.enum([
  "available",
  "low_availability",
  "sold_out",
  "on_request",
  "unknown",
])

export const availabilityBadgeSchema = z.object({
  kind: availabilityBadgeKindSchema,
  label: z.string().optional(),
})

export const availabilityProjectionSchema = z.object({
  row_kind: availabilityRowKindSchema,
  row_id: z.string().optional(),
  available_units: z.number().int().min(0).nullable(),
  precision: availabilityUnitPrecisionSchema,
  status: availabilityStatusSchema,
  low_availability_threshold: z.number().int().min(0).nullable().optional(),
  badge: availabilityBadgeSchema.optional(),
  sort_priority: z.number().int().optional(),
  source_updated_at: dateOrStringSchema.optional(),
})

export const adapterCapabilitiesSchema = z.object({
  verticals: z.array(catalogVerticalSchema),
  supportsLiveResolution: z.boolean(),
  supportsDriftDetection: z.boolean(),
  supportsBookingForwarding: z.boolean(),
  supportsReservationRetrieval: z.boolean().optional(),
  supportsReservationLookupByIdempotencyKey: z.boolean().optional(),
  supportsSyncCancellation: z.boolean().optional(),
  postBookOperations: z.array(postBookOperationSchema).readonly(),
  cacheTtlSeconds: z.number().int().min(0).nullable().optional(),
  supportsContentFetch: z.boolean().optional(),
  supportedContentLocales: z.array(localeSchema).readonly().optional(),
  ownsContentCache: z.boolean().optional(),
  ownsAvailabilityCache: z.boolean().optional(),
  holdReleaseGraceMs: z.number().int().min(0).optional(),
  supportsBookingPush: z.boolean().optional(),
  supportsAvailabilityPush: z.boolean().optional(),
  supportsContentPush: z.boolean().optional(),
  providerCapabilities: z.array(providerCapabilityDeclarationSchema).readonly().optional(),
})

export const connectionStateSchema = z.enum(["active", "paused", "disconnected", "error"])

export const sourceAdapterContextSchema = z.object({
  connection_id: z.string(),
  credentials: z.record(z.string(), z.string()).optional(),
  tenant_id: z.string().optional(),
  correlation_id: z.string().optional(),
})

export const sourceFreshnessSchema = z.enum(["sync", "event", "request", "static"]).nullable()

export const provenanceSchema = z.object({
  source_kind: z.string(),
  source_provider: z.string().optional(),
  source_connection_id: z.string().optional(),
  source_ref: z.string().optional(),
  source_freshness: sourceFreshnessSchema,
  last_sourced_at: z.date().optional(),
})

export const catalogProjectionSchema = z.object({
  entity_module: catalogVerticalSchema,
  entity_id: z.string(),
  provenance: provenanceSchema,
  fields: recordSchema,
})

export const discoveryCursorSchema = z.custom<string | undefined>(
  (value) => value === undefined || typeof value === "string",
)

export const discoveryPageSchema = z.object({
  projections: z.array(catalogProjectionSchema),
  next_cursor: discoveryCursorSchema,
})

export const liveResolveScopeSchema = z.object({
  locale: localeSchema,
  audience: z.string(),
  market: z.string(),
  currency: currencySchema.optional(),
})

export const sourceAdapterRequestScopeSchema = liveResolveScopeSchema

export const liveResolveRequestSchema = z.object({
  ids: z.array(z.string()),
  scope: liveResolveScopeSchema,
  parameters: recordSchema.optional(),
})

export const liveResolveFailedReasonSchema = z.enum([
  "timeout",
  "not_found",
  "unavailable",
  "departure_not_found",
  "departure_unavailable",
  "unsupported",
  "error",
])

export const liveResolveResultSchema = z.object({
  values: z.record(z.string(), recordSchema),
  failed: z.record(z.string(), liveResolveFailedReasonSchema).optional(),
})

export const getContentRequestSchema = z.object({
  entity_module: catalogVerticalSchema,
  entity_id: z.string(),
  locale: localeSchema,
  market: z.string().optional(),
  currency: currencySchema.optional(),
})

export const getContentResultSchema = z.object({
  entity_module: catalogVerticalSchema,
  entity_id: z.string(),
  source_ref: z.string(),
  returned_locale: localeSchema,
  machine_translated: z.boolean().optional(),
  content: z.unknown(),
  content_schema_version: z.string(),
  source_updated_at: z.date().optional(),
  fresh_until: z.date().optional(),
  etag: z.string().optional(),
})

export const reserveRequestSchema = z.object({
  entity_module: catalogVerticalSchema,
  entity_id: z.string(),
  parameters: recordSchema,
  party: recordSchema.optional(),
  payment_intent: recordSchema.optional(),
  scope: sourceAdapterRequestScopeSchema.optional(),
  idempotency_key: z.string().optional(),
})

export const reserveStatusSchema = z.enum(["pending", "held", "confirmed", "ticketed", "failed"])

export const reserveResultSchema = z.object({
  upstream_ref: z.string(),
  status: reserveStatusSchema,
  upstream_payload: recordSchema.optional(),
})

export const cancelRequestSchema = z.object({
  upstream_ref: z.string(),
  reason: z.string().optional(),
  scope: sourceAdapterRequestScopeSchema.optional(),
  idempotency_key: z.string().optional(),
})

export const cancelStatusSchema = z.enum(["cancelled", "pending", "refused", "failed"])

export const cancelResultSchema = z.object({
  status: cancelStatusSchema,
  refund_amount: z.number().optional(),
  refund_currency: currencySchema.optional(),
  pending_channel: z.string().optional(),
})

export const reservationStatusSchema = z.enum([
  "held",
  "confirmed",
  "ticketed",
  "failed",
  "cancelled",
  "pending",
  "refused",
  "cancelling",
])

export const getReservationRequestSchema = z.union([
  z.object({
    upstream_ref: z.string(),
    idempotency_key: z.never().optional(),
    scope: sourceAdapterRequestScopeSchema.optional(),
  }),
  z.object({
    upstream_ref: z.never().optional(),
    idempotency_key: z.string(),
    scope: sourceAdapterRequestScopeSchema.optional(),
  }),
])

export const getReservationResultSchema = z.object({
  upstream_ref: z.string(),
  status: reservationStatusSchema,
  source_updated_at: z.date().optional(),
  upstream_payload: recordSchema.optional(),
})

export const listReservationsQuerySchema = z.object({
  cursor: discoveryCursorSchema.optional(),
  limit: z.number().int().positive().optional(),
  status: z.array(reservationStatusSchema).readonly().optional(),
  updated_after: z.date().optional(),
  scope: sourceAdapterRequestScopeSchema.optional(),
})

export const listReservationsPageSchema = z.object({
  reservations: z.array(getReservationResultSchema),
  next_cursor: discoveryCursorSchema,
})

export const pushBookingRequestSchema = z.object({
  idempotencyKey: z.string(),
  bookingId: z.string(),
  bookingItemId: z.string().optional(),
  externalProductId: z.string(),
  externalRateId: z.string().optional(),
  externalCategoryId: z.string().optional(),
  channelId: z.string(),
  contractPolicy: recordSchema.optional(),
  payload: recordSchema,
})

export const pushBookingResultSchema = z.object({
  upstreamRef: z.string(),
  externalReference: z.string().optional(),
  externalStatus: z.string().optional(),
  upstreamPayload: recordSchema.optional(),
})

export const pushAvailabilityRequestSchema = z.object({
  channelId: z.string(),
  externalProductId: z.string(),
  externalRateId: z.string().optional(),
  externalCategoryId: z.string().optional(),
  slotId: z.string(),
  productId: z.string(),
  optionId: z.string().optional(),
  startsAt: dateOrStringSchema,
  remainingPax: z.number().int().min(0),
  source: z.string(),
})

export const pushAvailabilityResultSchema = z.object({
  externalStatus: z.string().optional(),
  upstreamPayload: recordSchema.optional(),
})

export const pushContentRequestSchema = z.object({
  channelId: z.string(),
  externalProductId: z.string(),
  productId: z.string(),
  contentHash: z.string(),
  content: z.unknown(),
  contentSchemaVersion: z.string().optional(),
  locale: localeSchema.optional(),
})

export const pushContentResultSchema = z.object({
  externalStatus: z.string().optional(),
  upstreamPayload: recordSchema.optional(),
  acknowledgedHash: z.string().optional(),
})

export const sourceAdapterSchema = z.custom<SourceAdapter>(
  (value) => {
    if (!isRecord(value) || typeof value.kind !== "string") return false
    if (!adapterCapabilitiesSchema.safeParse(value.capabilities).success) return false
    return [
      "connect",
      "pause",
      "disconnect",
      "getState",
      "discover",
      "freshnessCheck",
      "liveResolve",
      "getContent",
      "reserve",
      "cancel",
      "getReservation",
      "listReservations",
      "pushBooking",
      "pushAvailability",
      "pushContent",
      "onDrift",
    ].every((key) => optionalFunction(value[key]))
  },
  { message: "Invalid source adapter" },
)
