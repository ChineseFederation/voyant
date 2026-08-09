// agent-quality: file-size exception -- owner: trips; the package schema remains one Drizzle graph so migrations, foreign keys, and exported relations are generated from one source.
import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { relations } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

export const tripEnvelopeStatusEnum = pgEnum("trip_envelope_status", [
  "draft",
  "priced",
  "reserve_in_progress",
  "reserved",
  "checkout_started",
  "booked",
  "failed",
  "cancelled",
])

export const tripComponentKindEnum = pgEnum("trip_component_kind", [
  "catalog_booking",
  "manual_placeholder",
  "flight_placeholder",
  "flight_order",
  "external_order",
])

export const tripComponentStatusEnum = pgEnum("trip_component_status", [
  "draft",
  "priced",
  "unavailable",
  "held",
  "booked",
  "checkout_started",
  "failed",
  "cancelled",
  "removed",
])

export const tripComponentEventTypeEnum = pgEnum("trip_component_event_type", [
  "created",
  "updated",
  "priced",
  "hold_placed",
  "booked",
  "checkout_started",
  "failed",
  "cancelled",
  "removed",
  "staff_remediation_required",
])

export const tripReservationPlanStatusEnum = pgEnum("trip_reservation_plan_status", [
  "pending",
  "submitted",
  "reserved",
  "failed",
  "cancelled",
])

// ── Dynamic packaging: unresolved requirements + ranked candidates (RFC #2082) ──

export const tripRequirementStatusEnum = pgEnum("trip_requirement_status", [
  "open", // created, not yet sourced
  "sourcing", // a fan-out search is in flight
  "candidates_ready", // ranked candidates available, none selected
  "selected", // a candidate was picked and pinned to a component
  "no_availability", // a search returned nothing
  "cancelled",
])

export const tripCandidateStatusEnum = pgEnum("trip_candidate_status", [
  "ranked", // live option under a requirement
  "selected", // the chosen candidate (one per requirement)
  "expired", // TTL elapsed; reaper-swept, not bookable without re-shop
  "discarded", // superseded by a re-shop round
])

export const tripRequirementSourcingOperationStatusEnum = pgEnum(
  "trip_requirement_sourcing_operation_status",
  ["pending", "processing", "retry", "completed", "dead_letter"],
)

export const tripActionOperationKindEnum = pgEnum("trip_action_operation_kind", [
  "price-trip",
  "reserve-trip",
])

export const tripActionOperationStatusEnum = pgEnum("trip_action_operation_status", [
  "pending",
  "processing",
  "retry",
  "completed",
  "dead_letter",
])

export type TripEnvelopePricingSnapshot = {
  currency: string
  subtotalAmountCents: number
  taxAmountCents: number
  totalAmountCents: number
  componentCount: number
  pricedComponentCount: number
  warnings?: string[]
}

export type TripComponentPricingSnapshot = {
  currency: string
  subtotalAmountCents: number
  taxAmountCents: number
  totalAmountCents: number
  priceExpiresAt?: string
  warnings?: string[]
}

export type TripComponentTaxLineSnapshot = {
  code: string
  label: string
  amountCents: number
  baseAmountCents: number
  rate?: number
  jurisdiction?: string
  includedInPrice?: boolean
  source?: string
}

export type TripReservationPlanComponentSnapshot = {
  componentId: string
  sequence: number
  kind: string
  status: string
  catalogBacked: boolean
  entityModule: string | null
  entityId: string | null
  sourceKind: string | null
  sourceConnectionId: string | null
  sourceRef: string | null
  bookingDraftId: string | null
  catalogQuoteId: string | null
  currency: string | null
  totalAmountCents: number | null
  priceExpiresAt: string | null
  warningCodes: string[]
}

export type TripReservationPlanFailureSnapshot = {
  componentId: string
  reason: string
  code?: string
  details?: Record<string, unknown>
}

export type TripReservationPlanCompensationSnapshot = {
  componentId: string
  status: "released" | "release_failed" | "release_not_configured"
  reason?: string
}

export type TripSnapshotProposalLine = {
  componentId: string
  sequence: number
  kind: string
  status: string
  title: string | null
  description: string
  entityModule: string | null
  entityId: string | null
  sourceKind: string | null
  currency: string
  subtotalAmountCents: number
  taxAmountCents: number
  totalAmountCents: number
  priceExpiresAt: string | null
  warnings: string[]
}

export type TripSnapshotProposal = {
  envelopeId: string
  title: string | null
  description: string | null
  currency: string
  subtotalAmountCents: number
  taxAmountCents: number
  totalAmountCents: number
  componentCount: number
  pricedComponentCount: number
  warnings: string[]
  frozenAt: string
  lines: TripSnapshotProposalLine[]
}

export const tripEnvelopes = pgTable(
  "trip_envelopes",
  {
    id: typeId("trip_envelopes"),
    status: tripEnvelopeStatusEnum("status").notNull().default("draft"),
    title: text("title"),
    description: text("description"),

    travelerParty: jsonb("traveler_party").$type<Record<string, unknown>>().notNull().default({}),
    constraints: jsonb("constraints").$type<Record<string, unknown>>().notNull().default({}),

    aggregateCurrency: text("aggregate_currency"),
    aggregateSubtotalAmountCents: integer("aggregate_subtotal_amount_cents"),
    aggregateTaxAmountCents: integer("aggregate_tax_amount_cents"),
    aggregateTotalAmountCents: integer("aggregate_total_amount_cents"),
    aggregatePricingSnapshot: jsonb(
      "aggregate_pricing_snapshot",
    ).$type<TripEnvelopePricingSnapshot>(),
    currentPriceExpiresAt: timestamp("current_price_expires_at", { withTimezone: true }),

    bookingGroupId: text("booking_group_id"),
    orderId: text("order_id"),
    paymentSessionId: text("payment_session_id"),
    reserveIdempotencyKey: text("reserve_idempotency_key"),
    reserveStartedAt: timestamp("reserve_started_at", { withTimezone: true }),
    reservedAt: timestamp("reserved_at", { withTimezone: true }),
    checkoutIdempotencyKey: text("checkout_idempotency_key"),
    checkoutStartedAt: timestamp("checkout_started_at", { withTimezone: true }),

    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_trip_envelopes_status_updated").on(table.status, table.updatedAt),
    index("idx_trip_envelopes_created_by_updated").on(table.createdBy, table.updatedAt),
    index("idx_trip_envelopes_booking_group").on(table.bookingGroupId),
    index("idx_trip_envelopes_payment_session").on(table.paymentSessionId),
    index("idx_trip_envelopes_reserve_idempotency").on(table.reserveIdempotencyKey),
    index("idx_trip_envelopes_checkout_idempotency").on(table.checkoutIdempotencyKey),
  ],
)

/**
 * Storefront ownership for a customer-authored Trip.
 *
 * The browser carries a random capability while the database stores only its
 * SHA-256 digest. Storefront/channel and shopping scope come from trusted
 * runtime context, never request selectors, so capabilities cannot cross
 * storefront boundaries.
 */
export const tripStorefrontAccess = pgTable(
  "trip_storefront_access",
  {
    envelopeId: typeIdRef("envelope_id")
      .primaryKey()
      .references(() => tripEnvelopes.id, { onDelete: "cascade" }),
    capabilityDigest: text("capability_digest").notNull().unique(),
    storefrontId: text("storefront_id").notNull(),
    channelId: text("channel_id").notNull(),
    marketId: text("market_id").notNull(),
    locale: text("locale").notNull(),
    currency: text("currency").notNull(),
    ownerUserId: text("owner_user_id"),
    ownerBuyerAccountId: text("owner_buyer_account_id"),
    revision: integer("revision").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_trip_storefront_access_scope").on(table.storefrontId, table.channelId),
    index("idx_trip_storefront_access_owner").on(table.ownerUserId, table.updatedAt),
    index("idx_trip_storefront_access_expiry").on(table.expiresAt),
  ],
)

/**
 * Server-only shopping capabilities issued to public Storefront clients.
 *
 * The raw 256-bit capability is never persisted. `referenceDigest` is its
 * SHA-256 digest and `payload` is intentionally absent from every public Trip
 * projection. Exact trust and shopping-scope columns make redemption a single
 * fail-closed database predicate rather than an application-side comparison.
 */
export const tripShoppingReferences = pgTable(
  "trip_shopping_references",
  {
    referenceDigest: text("reference_digest").primaryKey(),
    purpose: text("purpose").notNull(),
    storefrontId: text("storefront_id").notNull(),
    channelId: text("channel_id").notNull(),
    ownerUserId: text("owner_user_id"),
    ownerBuyerAccountId: text("owner_buyer_account_id"),
    marketId: text("market_id").notNull(),
    locale: text("locale").notNull(),
    currency: text("currency").notNull(),
    replay: text("replay").notNull(),
    payload: jsonb("payload").$type<Readonly<Record<string, unknown>>>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_trip_shopping_references_expiry").on(table.expiresAt),
    index("idx_trip_shopping_references_scope").on(
      table.storefrontId,
      table.channelId,
      table.marketId,
    ),
    index("idx_trip_shopping_references_owner").on(
      table.ownerUserId,
      table.ownerBuyerAccountId,
      table.expiresAt,
    ),
  ],
)

export const tripComponents = pgTable(
  "trip_components",
  {
    id: typeId("trip_components"),
    envelopeId: typeIdRef("envelope_id")
      .notNull()
      .references(() => tripEnvelopes.id, { onDelete: "cascade" }),

    sequence: integer("sequence").notNull().default(0),
    kind: tripComponentKindEnum("kind").notNull(),
    status: tripComponentStatusEnum("status").notNull().default("draft"),
    title: text("title"),
    description: text("description"),

    entityModule: text("entity_module"),
    entityId: text("entity_id"),
    sourceKind: text("source_kind"),
    sourceConnectionId: text("source_connection_id"),
    sourceRef: text("source_ref"),

    bookingDraftId: text("booking_draft_id"),
    catalogQuoteId: text("catalog_quote_id"),
    bookingId: text("booking_id"),
    bookingGroupId: text("booking_group_id"),
    orderId: text("order_id"),
    paymentSessionId: text("payment_session_id"),
    providerRef: text("provider_ref"),
    supplierRef: text("supplier_ref"),

    componentCurrency: text("component_currency"),
    componentSubtotalAmountCents: integer("component_subtotal_amount_cents"),
    componentTaxAmountCents: integer("component_tax_amount_cents"),
    componentTotalAmountCents: integer("component_total_amount_cents"),
    pricingSnapshot: jsonb("pricing_snapshot").$type<TripComponentPricingSnapshot>(),
    taxLines: jsonb("tax_lines").$type<TripComponentTaxLineSnapshot[]>().default([]),
    cancellationSnapshot: jsonb("cancellation_snapshot").$type<Record<string, unknown>>(),

    holdToken: text("hold_token"),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    priceExpiresAt: timestamp("price_expires_at", { withTimezone: true }),
    warningCodes: jsonb("warning_codes").$type<string[]>().notNull().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_trip_components_envelope_sequence").on(table.envelopeId, table.sequence),
    index("idx_trip_components_envelope_status").on(table.envelopeId, table.status),
    index("idx_trip_components_catalog_entity").on(table.entityModule, table.entityId),
    index("idx_trip_components_booking_draft").on(table.bookingDraftId),
    index("idx_trip_components_catalog_quote").on(table.catalogQuoteId),
    index("idx_trip_components_booking").on(table.bookingId),
    index("idx_trip_components_order").on(table.orderId),
    index("idx_trip_components_payment_session").on(table.paymentSessionId),
  ],
)

export const tripComponentEvents = pgTable(
  "trip_component_events",
  {
    id: typeId("trip_component_events"),
    envelopeId: typeIdRef("envelope_id")
      .notNull()
      .references(() => tripEnvelopes.id, { onDelete: "cascade" }),
    componentId: typeIdRef("component_id").references(() => tripComponents.id, {
      onDelete: "set null",
    }),
    eventType: tripComponentEventTypeEnum("event_type").notNull(),
    fromStatus: tripComponentStatusEnum("from_status"),
    toStatus: tripComponentStatusEnum("to_status"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    actorId: text("actor_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_trip_component_events_envelope_time").on(table.envelopeId, table.occurredAt),
    index("idx_trip_component_events_component_time").on(table.componentId, table.occurredAt),
    index("idx_trip_component_events_type_time").on(table.eventType, table.occurredAt),
  ],
)

export const tripSnapshots = pgTable(
  "trip_snapshots",
  {
    id: typeId("trip_snapshots"),
    envelopeId: typeIdRef("envelope_id")
      .notNull()
      .references(() => tripEnvelopes.id, { onDelete: "restrict" }),
    sourceEnvelopeUpdatedAt: timestamp("source_envelope_updated_at", {
      withTimezone: true,
    }).notNull(),
    titleSnapshot: text("title_snapshot"),
    descriptionSnapshot: text("description_snapshot"),
    travelerPartySnapshot: jsonb("traveler_party_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    constraintsSnapshot: jsonb("constraints_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    currency: text("currency").notNull(),
    subtotalAmountCents: integer("subtotal_amount_cents").notNull().default(0),
    taxAmountCents: integer("tax_amount_cents").notNull().default(0),
    totalAmountCents: integer("total_amount_cents").notNull().default(0),
    componentCount: integer("component_count").notNull().default(0),
    pricedComponentCount: integer("priced_component_count").notNull().default(0),
    frozenEnvelope: jsonb("frozen_envelope").$type<Record<string, unknown>>().notNull(),
    frozenComponents: jsonb("frozen_components")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),
    proposal: jsonb("proposal").$type<TripSnapshotProposal>().notNull(),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_trip_snapshots_envelope_created").on(table.envelopeId, table.createdAt),
    index("idx_trip_snapshots_created").on(table.createdAt),
  ],
)

export const tripReservationPlans = pgTable(
  "trip_reservation_plans",
  {
    id: typeId("trip_reservation_plans"),
    envelopeId: typeIdRef("envelope_id")
      .notNull()
      .references(() => tripEnvelopes.id, { onDelete: "restrict" }),
    snapshotId: typeIdRef("snapshot_id").references(() => tripSnapshots.id, {
      onDelete: "set null",
    }),
    status: tripReservationPlanStatusEnum("status").notNull().default("pending"),
    idempotencyKey: text("idempotency_key"),
    refreshScope: jsonb("refresh_scope").$type<Record<string, unknown> | null>(),
    componentCount: integer("component_count").notNull().default(0),
    components: jsonb("components")
      .$type<TripReservationPlanComponentSnapshot[]>()
      .notNull()
      .default([]),
    failures: jsonb("failures").$type<TripReservationPlanFailureSnapshot[]>().default([]),
    compensations: jsonb("compensations")
      .$type<TripReservationPlanCompensationSnapshot[]>()
      .default([]),
    warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_trip_reservation_plans_envelope_created").on(table.envelopeId, table.createdAt),
    index("idx_trip_reservation_plans_snapshot").on(table.snapshotId),
    index("idx_trip_reservation_plans_status_updated").on(table.status, table.updatedAt),
    index("idx_trip_reservation_plans_idempotency").on(table.idempotencyKey),
  ],
)

// An unresolved customer-facing need on an envelope ("3-night stay in Cairo,
// 2 adults"). Sourced via the catalog availability fan-out into ranked
// candidates; selecting one resolves it into a pinned trip component.
export const tripRequirements = pgTable(
  "trip_requirements",
  {
    id: typeId("trip_requirements"),
    envelopeId: typeIdRef("envelope_id")
      .notNull()
      .references(() => tripEnvelopes.id, { onDelete: "cascade" }),

    sequence: integer("sequence").notNull().default(0),
    status: tripRequirementStatusEnum("status").notNull().default("open"),
    title: text("title"),
    description: text("description"),

    // Vertical + criteria mirror the catalog `AvailabilitySearchRequest`.
    vertical: text("vertical").notNull(),
    criteria: jsonb("criteria").$type<Record<string, unknown>>().notNull().default({}),
    criteriaVersion: text("criteria_version").notNull(),

    // When true, `reserveTrip` is gated until this requirement is `selected`.
    required: boolean("required").notNull().default(true),

    // The chosen candidate + the component it was pinned into. Plain typed-id
    // columns (no FK constraint) to avoid a circular requirement↔candidate FK;
    // selected-uniqueness is enforced in the service layer.
    selectedCandidateId: typeIdRef("selected_candidate_id"),
    resolvedComponentId: typeIdRef("resolved_component_id"),

    lastSourcedAt: timestamp("last_sourced_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_trip_requirements_envelope_sequence").on(table.envelopeId, table.sequence),
    index("idx_trip_requirements_envelope_status").on(table.envelopeId, table.status),
  ],
)

// A normalized `AvailabilityCandidate` attached to a requirement: ranked,
// TTL'd, resumable trip state (re-validated before commit) — NOT a catalog
// cache. `providerData` holds internal economics + the payload needed to
// re-resolve/reserve; it never leaks into public/proposal DTOs.
export const tripCandidates = pgTable(
  "trip_candidates",
  {
    id: typeId("trip_candidates"),
    requirementId: typeIdRef("requirement_id")
      .notNull()
      .references(() => tripRequirements.id, { onDelete: "cascade" }),
    // Denormalized for envelope-wide reaper / queries without a join.
    envelopeId: typeIdRef("envelope_id")
      .notNull()
      .references(() => tripEnvelopes.id, { onDelete: "cascade" }),

    rank: integer("rank").notNull().default(0),
    status: tripCandidateStatusEnum("status").notNull().default("ranked"),

    // Mirrors catalog `AvailabilityCandidate`. `candidateRef` is the adapter's
    // per-search id and is NOT replay-safe — `selection` is re-resolved before
    // reserve.
    candidateRef: text("candidate_ref").notNull(),
    entityModule: text("entity_module").notNull(),
    entityId: text("entity_id").notNull(),

    // Origin, so a selection routes back to the right source at reserve time.
    sourceKind: text("source_kind").notNull(), // "sourced" | "owned"
    sourceConnectionId: text("source_connection_id"), // when sourced
    sourceModule: text("source_module"), // when owned

    selection: jsonb("selection").$type<Record<string, unknown>>().notNull().default({}),
    priceCurrency: text("price_currency").notNull(),
    // Decimal string, matching `AvailabilityCandidate.price.amount` exactly.
    priceAmount: text("price_amount").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    providerData: jsonb("provider_data").$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_trip_candidates_requirement_rank").on(table.requirementId, table.rank),
    index("idx_trip_candidates_requirement_status").on(table.requirementId, table.status),
    index("idx_trip_candidates_envelope").on(table.envelopeId),
    index("idx_trip_candidates_expires").on(table.expiresAt),
  ],
)

/**
 * Trips-owned durable work for agent-initiated requirement sourcing.
 *
 * The action ledger owns immutable command admission. This row owns the
 * immutable provider request, exact accepted Tool result, retry lease, and
 * terminal operational state. Candidate replacement remains in Trips.
 */
export const tripRequirementSourcingOperations = pgTable(
  "trip_requirement_sourcing_operations",
  {
    // The admitted claim id is already globally unique and gives the operation
    // a stable identity without introducing another generated-id namespace.
    id: text("id").primaryKey(),
    commandScope: text("command_scope").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    organizationId: text("organization_id"),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    requirementId: typeIdRef("requirement_id")
      .notNull()
      .references(() => tripRequirements.id, { onDelete: "restrict" }),
    previousRequirementStatus: tripRequirementStatusEnum("previous_requirement_status").notNull(),
    requestSnapshot: jsonb("request_snapshot").$type<Record<string, unknown>>().notNull(),
    resultSnapshot: jsonb("result_snapshot").$type<Record<string, unknown>>().notNull(),
    outcomeSnapshot: jsonb("outcome_snapshot").$type<Record<string, unknown>>(),
    status: tripRequirementSourcingOperationStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(8),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    leaseVersion: integer("lease_version").notNull().default(0),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uidx_trip_requirement_sourcing_operations_command").on(
      table.commandScope,
      table.idempotencyKey,
    ),
    index("idx_trip_requirement_sourcing_operations_due").on(
      table.status,
      table.nextAttemptAt,
      table.leaseExpiresAt,
    ),
    index("idx_trip_requirement_sourcing_operations_requirement").on(
      table.requirementId,
      table.status,
    ),
  ],
)

export const tripActionOperations = pgTable(
  "trip_action_operations",
  {
    // The admitted claim id is the stable globally unique operation identity.
    id: text("id").primaryKey(),
    commandScope: text("command_scope").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    claimActionId: text("claim_action_id").notNull(),
    organizationId: text("organization_id"),
    targetType: text("target_type").notNull(),
    targetId: text("target_id")
      .notNull()
      .references(() => tripEnvelopes.id, { onDelete: "restrict" }),
    kind: tripActionOperationKindEnum("kind").notNull(),
    backendIdentity: text("backend_identity").notNull(),
    requestSnapshot: jsonb("request_snapshot").$type<Record<string, unknown>>().notNull(),
    resultSnapshot: jsonb("result_snapshot").$type<Record<string, unknown>>().notNull(),
    outcomeSnapshot: jsonb("outcome_snapshot").$type<Record<string, unknown>>(),
    providerOperationId: text("provider_operation_id"),
    status: tripActionOperationStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(8),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    leaseVersion: integer("lease_version").notNull().default(0),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uidx_trip_action_operations_command").on(table.commandScope, table.idempotencyKey),
    index("idx_trip_action_operations_due").on(
      table.status,
      table.nextAttemptAt,
      table.leaseExpiresAt,
    ),
    index("idx_trip_action_operations_target").on(table.targetId, table.kind, table.status),
  ],
)

export const tripEnvelopeRelations = relations(tripEnvelopes, ({ many }) => ({
  components: many(tripComponents),
  events: many(tripComponentEvents),
  snapshots: many(tripSnapshots),
  reservationPlans: many(tripReservationPlans),
  requirements: many(tripRequirements),
}))

export const tripStorefrontAccessRelations = relations(tripStorefrontAccess, ({ one }) => ({
  envelope: one(tripEnvelopes, {
    fields: [tripStorefrontAccess.envelopeId],
    references: [tripEnvelopes.id],
  }),
}))

export const tripComponentRelations = relations(tripComponents, ({ one, many }) => ({
  envelope: one(tripEnvelopes, {
    fields: [tripComponents.envelopeId],
    references: [tripEnvelopes.id],
  }),
  events: many(tripComponentEvents),
}))

export const tripComponentEventRelations = relations(tripComponentEvents, ({ one }) => ({
  envelope: one(tripEnvelopes, {
    fields: [tripComponentEvents.envelopeId],
    references: [tripEnvelopes.id],
  }),
  component: one(tripComponents, {
    fields: [tripComponentEvents.componentId],
    references: [tripComponents.id],
  }),
}))

export const tripSnapshotRelations = relations(tripSnapshots, ({ one }) => ({
  envelope: one(tripEnvelopes, {
    fields: [tripSnapshots.envelopeId],
    references: [tripEnvelopes.id],
  }),
}))

export const tripReservationPlanRelations = relations(tripReservationPlans, ({ one }) => ({
  envelope: one(tripEnvelopes, {
    fields: [tripReservationPlans.envelopeId],
    references: [tripEnvelopes.id],
  }),
  snapshot: one(tripSnapshots, {
    fields: [tripReservationPlans.snapshotId],
    references: [tripSnapshots.id],
  }),
}))

export const tripRequirementRelations = relations(tripRequirements, ({ one, many }) => ({
  envelope: one(tripEnvelopes, {
    fields: [tripRequirements.envelopeId],
    references: [tripEnvelopes.id],
  }),
  candidates: many(tripCandidates),
}))

export const tripCandidateRelations = relations(tripCandidates, ({ one }) => ({
  requirement: one(tripRequirements, {
    fields: [tripCandidates.requirementId],
    references: [tripRequirements.id],
  }),
  envelope: one(tripEnvelopes, {
    fields: [tripCandidates.envelopeId],
    references: [tripEnvelopes.id],
  }),
}))

export const tripRequirementSourcingOperationRelations = relations(
  tripRequirementSourcingOperations,
  ({ one }) => ({
    requirement: one(tripRequirements, {
      fields: [tripRequirementSourcingOperations.requirementId],
      references: [tripRequirements.id],
    }),
  }),
)

export type TripEnvelope = typeof tripEnvelopes.$inferSelect
export type NewTripEnvelope = typeof tripEnvelopes.$inferInsert
export type TripStorefrontAccess = typeof tripStorefrontAccess.$inferSelect
export type NewTripStorefrontAccess = typeof tripStorefrontAccess.$inferInsert
export type TripShoppingReference = typeof tripShoppingReferences.$inferSelect
export type NewTripShoppingReference = typeof tripShoppingReferences.$inferInsert
export type TripComponent = typeof tripComponents.$inferSelect
export type NewTripComponent = typeof tripComponents.$inferInsert
export type TripComponentEvent = typeof tripComponentEvents.$inferSelect
export type NewTripComponentEvent = typeof tripComponentEvents.$inferInsert
export type TripSnapshot = typeof tripSnapshots.$inferSelect
export type NewTripSnapshot = typeof tripSnapshots.$inferInsert
export type TripReservationPlan = typeof tripReservationPlans.$inferSelect
export type NewTripReservationPlan = typeof tripReservationPlans.$inferInsert
export type TripRequirement = typeof tripRequirements.$inferSelect
export type NewTripRequirement = typeof tripRequirements.$inferInsert
export type TripCandidate = typeof tripCandidates.$inferSelect
export type NewTripCandidate = typeof tripCandidates.$inferInsert
export type TripRequirementSourcingOperation = typeof tripRequirementSourcingOperations.$inferSelect
export type NewTripRequirementSourcingOperation =
  typeof tripRequirementSourcingOperations.$inferInsert
export type TripActionOperation = typeof tripActionOperations.$inferSelect
export type NewTripActionOperation = typeof tripActionOperations.$inferInsert
