import { describe, expect, it } from "vitest"
import type { z } from "zod"
import type { Provenance } from "../provenance.js"
import type {
  AdapterCapabilities,
  CancelRequest,
  CancelResult,
  CatalogProjection,
  ConnectionState,
  DiscoveryCursor,
  DiscoveryPage,
  GetContentRequest,
  GetContentResult,
  GetReservationRequest,
  GetReservationResult,
  ListReservationsPage,
  ListReservationsQuery,
  LiveResolveRequest,
  LiveResolveResult,
  PushAvailabilityRequest,
  PushAvailabilityResult,
  PushBookingRequest,
  PushBookingResult,
  PushContentRequest,
  PushContentResult,
  ReservationStatus,
  ReserveRequest,
  ReserveResult,
  SourceAdapter,
  SourceAdapterContext,
  SourceAdapterRequestScope,
} from "./contract.js"
import {
  adapterCapabilitiesSchema,
  cancelRequestSchema,
  cancelResultSchema,
  catalogProjectionSchema,
  connectionStateSchema,
  discoveryCursorSchema,
  discoveryPageSchema,
  getContentRequestSchema,
  getContentResultSchema,
  getReservationRequestSchema,
  getReservationResultSchema,
  listReservationsPageSchema,
  listReservationsQuerySchema,
  liveResolveRequestSchema,
  liveResolveResultSchema,
  provenanceSchema,
  pushAvailabilityRequestSchema,
  pushAvailabilityResultSchema,
  pushBookingRequestSchema,
  pushBookingResultSchema,
  pushContentRequestSchema,
  pushContentResultSchema,
  reservationStatusSchema,
  reserveRequestSchema,
  reserveResultSchema,
  sourceAdapterContextSchema,
  sourceAdapterRequestScopeSchema,
  sourceAdapterSchema,
} from "./schemas.js"

type AssertEquivalent<Actual, Expected> = Actual extends Expected
  ? Expected extends Actual
    ? true
    : never
  : never

const typeChecks: [
  AssertEquivalent<z.infer<typeof adapterCapabilitiesSchema>, AdapterCapabilities>,
  AssertEquivalent<z.infer<typeof connectionStateSchema>, ConnectionState>,
  AssertEquivalent<z.infer<typeof sourceAdapterContextSchema>, SourceAdapterContext>,
  AssertEquivalent<z.infer<typeof provenanceSchema>, Provenance>,
  AssertEquivalent<z.infer<typeof catalogProjectionSchema>, CatalogProjection>,
  AssertEquivalent<z.infer<typeof discoveryCursorSchema>, DiscoveryCursor>,
  AssertEquivalent<z.infer<typeof discoveryPageSchema>, DiscoveryPage>,
  AssertEquivalent<z.infer<typeof liveResolveRequestSchema>, LiveResolveRequest>,
  AssertEquivalent<z.infer<typeof sourceAdapterRequestScopeSchema>, SourceAdapterRequestScope>,
  AssertEquivalent<z.infer<typeof liveResolveResultSchema>, LiveResolveResult>,
  AssertEquivalent<z.infer<typeof getContentRequestSchema>, GetContentRequest>,
  AssertEquivalent<z.infer<typeof getContentResultSchema>, GetContentResult>,
  AssertEquivalent<z.infer<typeof reserveRequestSchema>, ReserveRequest>,
  AssertEquivalent<z.infer<typeof reserveResultSchema>, ReserveResult>,
  AssertEquivalent<z.infer<typeof cancelRequestSchema>, CancelRequest>,
  AssertEquivalent<z.infer<typeof cancelResultSchema>, CancelResult>,
  AssertEquivalent<z.infer<typeof reservationStatusSchema>, ReservationStatus>,
  AssertEquivalent<z.infer<typeof getReservationRequestSchema>, GetReservationRequest>,
  AssertEquivalent<z.infer<typeof getReservationResultSchema>, GetReservationResult>,
  AssertEquivalent<z.infer<typeof listReservationsQuerySchema>, ListReservationsQuery>,
  AssertEquivalent<z.infer<typeof listReservationsPageSchema>, ListReservationsPage>,
  AssertEquivalent<z.infer<typeof pushBookingRequestSchema>, PushBookingRequest>,
  AssertEquivalent<z.infer<typeof pushBookingResultSchema>, PushBookingResult>,
  AssertEquivalent<z.infer<typeof pushAvailabilityRequestSchema>, PushAvailabilityRequest>,
  AssertEquivalent<z.infer<typeof pushAvailabilityResultSchema>, PushAvailabilityResult>,
  AssertEquivalent<z.infer<typeof pushContentRequestSchema>, PushContentRequest>,
  AssertEquivalent<z.infer<typeof pushContentResultSchema>, PushContentResult>,
  AssertEquivalent<z.infer<typeof sourceAdapterSchema>, SourceAdapter>,
] = [
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
]
void typeChecks

const capabilities: AdapterCapabilities = {
  verticals: ["products"],
  supportsLiveResolution: true,
  supportsDriftDetection: true,
  supportsBookingForwarding: true,
  supportsReservationRetrieval: true,
  supportsSyncCancellation: false,
  postBookOperations: ["cancel", "status"],
  cacheTtlSeconds: 300,
  supportsContentFetch: true,
  supportedContentLocales: ["en-GB", "ro-RO"],
  ownsContentCache: true,
  ownsAvailabilityCache: false,
  holdReleaseGraceMs: 1000,
  supportsBookingPush: true,
  supportsAvailabilityPush: true,
  supportsContentPush: true,
  providerCapabilities: [
    {
      capability: "category_availability_counts",
      support: "supported",
      applies_to: ["cruises"],
      evidence: "category inventory feed",
    },
    {
      capability: "physical_inventory_units",
      support: "unsupported",
      applies_to: ["cruises"],
      reason: "provider feed exposes category counts but not cabin numbers",
    },
  ],
}

const context: SourceAdapterContext = {
  connection_id: "conn_123",
  credentials: { apiKey: "secret" },
  tenant_id: "tenant_1",
  correlation_id: "corr_1",
}

const provenance: Provenance = {
  source_kind: "direct:tui",
  source_provider: "tui",
  source_connection_id: "conn_123",
  source_ref: "TUI-123",
  source_freshness: "sync",
  last_sourced_at: new Date("2026-01-01T00:00:00Z"),
}

const projection: CatalogProjection = {
  entity_module: "products",
  entity_id: "prod_123",
  provenance,
  fields: { title: "Sample tour", country: "RO" },
}

const discoveryPage: DiscoveryPage = {
  projections: [projection],
  next_cursor: "cursor_2",
}

const liveResolveRequest: LiveResolveRequest = {
  ids: ["prod_123"],
  scope: {
    locale: "en-GB",
    audience: "customer",
    market: "GB",
    currency: "GBP",
  },
  parameters: { departureId: "dep_1" },
}

const sourceAdapterRequestScope: SourceAdapterRequestScope = liveResolveRequest.scope

const liveResolveResult: LiveResolveResult = {
  values: {
    prod_123: {
      price: { amount: "100.00", currency: "GBP" },
      remainingPax: 4,
    },
  },
  failed: { prod_missing: "not_found" },
}

const getContentRequest: GetContentRequest = {
  entity_module: "products",
  entity_id: "prod_123",
  locale: "ro-RO",
  market: "RO",
  currency: "RON",
}

const getContentResult: GetContentResult = {
  entity_module: "products",
  entity_id: "prod_123",
  source_ref: "TUI-123",
  returned_locale: "en-GB",
  machine_translated: false,
  content: { product: { title: "Sample tour" } },
  content_schema_version: "products/v1",
  source_updated_at: new Date("2026-01-02T00:00:00Z"),
  fresh_until: new Date("2026-01-03T00:00:00Z"),
  etag: "etag-1",
}

const reserveRequest: ReserveRequest = {
  entity_module: "products",
  entity_id: "prod_123",
  parameters: { departureId: "dep_1" },
  party: { travelers: 2 },
  payment_intent: { type: "hold" },
  scope: sourceAdapterRequestScope,
  idempotency_key: "reserve_123",
}

const reserveResult: ReserveResult = {
  upstream_ref: "booking_123",
  status: "held",
  upstream_payload: { holdToken: "hold_1" },
}

const cancelRequest: CancelRequest = {
  upstream_ref: "booking_123",
  reason: "customer_request",
  scope: sourceAdapterRequestScope,
  idempotency_key: "cancel_123",
}

const cancelResult: CancelResult = {
  status: "pending",
  pending_channel: "partner portal",
}

const getReservationRequest: GetReservationRequest = {
  upstream_ref: "booking_123",
  scope: sourceAdapterRequestScope,
}

const getReservationResult: GetReservationResult = {
  upstream_ref: "booking_123",
  status: "confirmed",
  source_updated_at: new Date("2026-01-04T00:00:00Z"),
  upstream_payload: { travelers: 2, supplierStatus: "OK" },
}

const listReservationsQuery: ListReservationsQuery = {
  cursor: "cursor_1",
  limit: 50,
  status: ["held", "confirmed", "cancelling"],
  updated_after: new Date("2026-01-01T00:00:00Z"),
  scope: sourceAdapterRequestScope,
}

const listReservationsPage: ListReservationsPage = {
  reservations: [getReservationResult],
  next_cursor: "cursor_2",
}

const pushBookingRequest: PushBookingRequest = {
  idempotencyKey: "idem_1",
  bookingId: "book_1",
  bookingItemId: "item_1",
  externalProductId: "EXT-1",
  externalRateId: "RATE-1",
  externalCategoryId: "CAT-1",
  channelId: "channel_1",
  contractPolicy: { commission: 0.1 },
  payload: { travelers: 2 },
}

const pushBookingResult: PushBookingResult = {
  upstreamRef: "upstream_1",
  externalReference: "CONF-1",
  externalStatus: "confirmed",
  upstreamPayload: { ok: true },
}

const pushAvailabilityRequest: PushAvailabilityRequest = {
  channelId: "channel_1",
  externalProductId: "EXT-1",
  externalRateId: "RATE-1",
  externalCategoryId: "CAT-1",
  slotId: "slot_1",
  productId: "prod_123",
  optionId: "opt_1",
  startsAt: new Date("2026-02-01T10:00:00Z"),
  remainingPax: 8,
  source: "booking",
}

const pushAvailabilityResult: PushAvailabilityResult = {
  externalStatus: "updated",
  upstreamPayload: { ok: true },
}

const pushContentRequest: PushContentRequest = {
  channelId: "channel_1",
  externalProductId: "EXT-1",
  productId: "prod_123",
  contentHash: "hash_123",
  content: { product: { title: "Sample tour" } },
  contentSchemaVersion: "products/v1",
  locale: "en-GB",
}

const pushContentResult: PushContentResult = {
  externalStatus: "updated",
  upstreamPayload: { ok: true },
  acknowledgedHash: "hash_123",
}

const sourceAdapter: SourceAdapter = {
  kind: "direct:tui",
  capabilities,
  async connect() {},
  async getState() {
    return "active"
  },
  async discover() {
    return discoveryPage
  },
  async getContent(_ctx, request) {
    return { ...getContentResult, entity_id: request.entity_id }
  },
  async getReservation(_ctx, request) {
    return request.upstream_ref === getReservationResult.upstream_ref ? getReservationResult : null
  },
  async listReservations() {
    return listReservationsPage
  },
}

const roundTripCases = [
  ["adapterCapabilitiesSchema", adapterCapabilitiesSchema, capabilities],
  ["connectionStateSchema", connectionStateSchema, "active" satisfies ConnectionState],
  ["sourceAdapterContextSchema", sourceAdapterContextSchema, context],
  ["provenanceSchema", provenanceSchema, provenance],
  ["catalogProjectionSchema", catalogProjectionSchema, projection],
  ["discoveryCursorSchema", discoveryCursorSchema, "cursor_2" satisfies DiscoveryCursor],
  ["discoveryPageSchema", discoveryPageSchema, discoveryPage],
  ["sourceAdapterRequestScopeSchema", sourceAdapterRequestScopeSchema, sourceAdapterRequestScope],
  ["liveResolveRequestSchema", liveResolveRequestSchema, liveResolveRequest],
  ["liveResolveResultSchema", liveResolveResultSchema, liveResolveResult],
  ["getContentRequestSchema", getContentRequestSchema, getContentRequest],
  ["getContentResultSchema", getContentResultSchema, getContentResult],
  ["reserveRequestSchema", reserveRequestSchema, reserveRequest],
  ["reserveResultSchema", reserveResultSchema, reserveResult],
  ["cancelRequestSchema", cancelRequestSchema, cancelRequest],
  ["cancelResultSchema", cancelResultSchema, cancelResult],
  ["reservationStatusSchema", reservationStatusSchema, "cancelling" satisfies ReservationStatus],
  ["getReservationRequestSchema", getReservationRequestSchema, getReservationRequest],
  ["getReservationResultSchema", getReservationResultSchema, getReservationResult],
  ["listReservationsQuerySchema", listReservationsQuerySchema, listReservationsQuery],
  ["listReservationsPageSchema", listReservationsPageSchema, listReservationsPage],
  ["pushBookingRequestSchema", pushBookingRequestSchema, pushBookingRequest],
  ["pushBookingResultSchema", pushBookingResultSchema, pushBookingResult],
  ["pushAvailabilityRequestSchema", pushAvailabilityRequestSchema, pushAvailabilityRequest],
  ["pushAvailabilityResultSchema", pushAvailabilityResultSchema, pushAvailabilityResult],
  ["pushContentRequestSchema", pushContentRequestSchema, pushContentRequest],
  ["pushContentResultSchema", pushContentResultSchema, pushContentResult],
  ["sourceAdapterSchema", sourceAdapterSchema, sourceAdapter],
] as const

const invalidCases = [
  ["adapterCapabilitiesSchema", adapterCapabilitiesSchema, { ...capabilities, verticals: [123] }],
  ["connectionStateSchema", connectionStateSchema, "reconnecting"],
  ["sourceAdapterContextSchema", sourceAdapterContextSchema, { credentials: { apiKey: "secret" } }],
  ["provenanceSchema", provenanceSchema, { ...provenance, source_freshness: "live" }],
  ["catalogProjectionSchema", catalogProjectionSchema, { ...projection, entity_module: 123 }],
  ["discoveryCursorSchema", discoveryCursorSchema, 123],
  ["discoveryPageSchema", discoveryPageSchema, { projections: [{ fields: {} }] }],
  [
    "sourceAdapterRequestScopeSchema",
    sourceAdapterRequestScopeSchema,
    { ...sourceAdapterRequestScope, currency: "GB" },
  ],
  [
    "liveResolveRequestSchema",
    liveResolveRequestSchema,
    { ...liveResolveRequest, scope: { ...liveResolveRequest.scope, locale: "not_locale" } },
  ],
  ["liveResolveResultSchema", liveResolveResultSchema, { values: {}, failed: { prod_1: "gone" } }],
  ["getContentRequestSchema", getContentRequestSchema, { ...getContentRequest, currency: "EU" }],
  [
    "getContentResultSchema",
    getContentResultSchema,
    { ...getContentResult, content_schema_version: undefined },
  ],
  ["reserveRequestSchema", reserveRequestSchema, { ...reserveRequest, parameters: undefined }],
  ["reserveResultSchema", reserveResultSchema, { ...reserveResult, status: "unknown" }],
  ["cancelRequestSchema", cancelRequestSchema, { reason: "customer_request" }],
  ["cancelResultSchema", cancelResultSchema, { ...cancelResult, refund_currency: "GB" }],
  ["reservationStatusSchema", reservationStatusSchema, "expired"],
  [
    "getReservationRequestSchema",
    getReservationRequestSchema,
    { ...getReservationRequest, upstream_ref: undefined },
  ],
  [
    "getReservationResultSchema",
    getReservationResultSchema,
    { ...getReservationResult, status: "expired" },
  ],
  ["listReservationsQuerySchema", listReservationsQuerySchema, { limit: 0 }],
  [
    "listReservationsPageSchema",
    listReservationsPageSchema,
    { reservations: [{ ...getReservationResult, upstream_payload: "raw" }] },
  ],
  [
    "pushBookingRequestSchema",
    pushBookingRequestSchema,
    { ...pushBookingRequest, payload: undefined },
  ],
  ["pushBookingResultSchema", pushBookingResultSchema, { externalStatus: "confirmed" }],
  [
    "pushAvailabilityRequestSchema",
    pushAvailabilityRequestSchema,
    { ...pushAvailabilityRequest, remainingPax: -1 },
  ],
  ["pushAvailabilityResultSchema", pushAvailabilityResultSchema, { upstreamPayload: "ok" }],
  [
    "pushContentRequestSchema",
    pushContentRequestSchema,
    { ...pushContentRequest, locale: "not_locale" },
  ],
  ["pushContentResultSchema", pushContentResultSchema, { acknowledgedHash: 123 }],
  ["sourceAdapterSchema", sourceAdapterSchema, { ...sourceAdapter, discover: "yes" }],
] as const

describe("catalog source-adapter schemas", () => {
  it.each(roundTripCases)("parses %s fixtures without changing shape", (_name, schema, value) => {
    expect(schema.parse(value)).toEqual(value)
  })

  it.each(invalidCases)("rejects invalid %s fixtures", (_name, schema, value) => {
    expect(schema.safeParse(value).success).toBe(false)
  })
})
