import type { BookingSessionCapabilityActionV1 } from "@voyant-travel/catalog-contracts/booking-engine/session-contracts"
import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type { BookingSessionTargetV1 } from "./contracts.js"

export const bookingSessionsTable = pgTable(
  "booking_sessions",
  {
    id: typeId("booking_sessions"),
    createIdempotencyKey: text("create_idempotency_key").notNull(),
    createRequestFingerprint: text("create_request_fingerprint").notNull(),
    capabilityHash: text("capability_hash"),
    capabilityScopes: jsonb("capability_scopes")
      .$type<BookingSessionCapabilityActionV1[]>()
      .notNull()
      .default([]),
    actorKind: text("actor_kind").notNull(),
    ownerPrincipalId: text("owner_principal_id"),
    ownerOrganizationId: text("owner_organization_id"),
    storefrontId: text("storefront_id"),
    channelId: text("channel_id"),
    targetKind: text("target_kind").notNull(),
    productId: typeIdRef("product_id"),
    catalogItemId: text("catalog_item_id"),
    targetEntityModule: text("target_entity_module"),
    targetEntityId: text("target_entity_id"),
    tripSnapshotId: text("trip_snapshot_id"),
    tripEnvelopeId: text("trip_envelope_id"),
    proposalId: text("proposal_id"),
    proposalVersionId: text("proposal_version_id"),
    state: text("state").notNull(),
    revision: integer("revision").notNull(),
    statePayload: jsonb("state_payload").$type<Record<string, unknown>>().notNull().default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    abandonedAt: timestamp("abandoned_at", { withTimezone: true }),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("booking_sessions_id_typeid", sql`${table.id} LIKE 'bses_%'`),
    check(
      "booking_sessions_actor_kind",
      sql`${table.actorKind} IN ('anonymous', 'customer', 'staff', 'partner')`,
    ),
    check(
      "booking_sessions_state",
      sql`${table.state} IN ('active', 'supplier_pending', 'component_pending', 'consumed', 'expired', 'abandoned')`,
    ),
    check(
      "booking_sessions_storefront_origin",
      sql`(${table.storefrontId} IS NULL AND ${table.channelId} IS NULL)
        OR (${table.purgedAt} IS NULL AND ${table.storefrontId} IS NOT NULL AND ${table.channelId} IS NOT NULL)`,
    ),
    check(
      "booking_sessions_target_exactly_one",
      sql`(${table.targetKind} = 'product'
            AND ${table.productId} IS NOT NULL
            AND ${table.catalogItemId} IS NULL
            AND ${table.targetEntityModule} IS NULL
            AND ${table.targetEntityId} IS NULL
            AND ${table.tripSnapshotId} IS NULL
            AND ${table.tripEnvelopeId} IS NULL)
        OR (${table.targetKind} = 'catalog_item'
            AND ${table.catalogItemId} IS NOT NULL
            AND ${table.productId} IS NULL
            AND ${table.targetEntityModule} IS NULL
            AND ${table.targetEntityId} IS NULL
            AND ${table.tripSnapshotId} IS NULL
            AND ${table.tripEnvelopeId} IS NULL)
        OR (${table.targetKind} = 'owned_entity'
            AND ${table.targetEntityModule} IS NOT NULL
            AND ${table.targetEntityId} IS NOT NULL
            AND ${table.productId} IS NULL
            AND ${table.catalogItemId} IS NULL
            AND ${table.tripSnapshotId} IS NULL
            AND ${table.tripEnvelopeId} IS NULL)
        OR (${table.targetKind} = 'trip_snapshot'
            AND ${table.tripSnapshotId} IS NOT NULL
            AND ${table.tripEnvelopeId} IS NOT NULL
            AND ${table.productId} IS NULL
            AND ${table.catalogItemId} IS NULL
            AND ${table.targetEntityModule} IS NULL
            AND ${table.targetEntityId} IS NULL)`,
    ),
    check(
      "booking_sessions_proposal_origin",
      sql`(${table.proposalId} IS NULL AND ${table.proposalVersionId} IS NULL)
        OR (${table.targetKind} = 'trip_snapshot'
            AND ${table.proposalId} IS NOT NULL
            AND ${table.proposalVersionId} IS NOT NULL)`,
    ),
    check(
      "booking_sessions_anonymous_capability",
      sql`(${table.purgedAt} IS NOT NULL
          AND ${table.ownerPrincipalId} IS NULL
          AND ${table.ownerOrganizationId} IS NULL
          AND ${table.capabilityHash} IS NULL
          AND jsonb_array_length(${table.capabilityScopes}) = 0)
        OR (${table.purgedAt} IS NULL AND (
          (${table.actorKind} = 'anonymous' AND ${table.ownerPrincipalId} IS NULL AND ${table.capabilityHash} IS NOT NULL AND jsonb_array_length(${table.capabilityScopes}) > 0)
          OR (${table.actorKind} <> 'anonymous' AND ${table.capabilityHash} IS NULL AND ${table.ownerPrincipalId} IS NOT NULL AND jsonb_array_length(${table.capabilityScopes}) = 0)
        ))`,
    ),
    index("idx_booking_sessions_state_expires").on(table.state, table.expiresAt),
    index("idx_booking_sessions_product").on(table.productId),
    index("idx_booking_sessions_catalog_item").on(table.catalogItemId),
    index("idx_booking_sessions_owned_entity").on(table.targetEntityModule, table.targetEntityId),
    index("idx_booking_sessions_trip_snapshot").on(table.tripSnapshotId),
    index("idx_booking_sessions_trip_envelope").on(table.tripEnvelopeId),
    uniqueIndex("uidx_booking_sessions_proposal_version")
      .on(table.proposalVersionId)
      .where(sql`${table.proposalVersionId} IS NOT NULL`),
    uniqueIndex("uidx_booking_sessions_create_idem").on(table.createIdempotencyKey),
  ],
)

export const bookingSessionQuotesTable = pgTable(
  "booking_session_quotes",
  {
    id: typeId("booking_session_quotes"),
    sessionId: typeIdRef("session_id")
      .notNull()
      .references(() => bookingSessionsTable.id, { onDelete: "cascade" }),
    sessionRevision: integer("session_revision").notNull(),
    state: text("state").notNull(),
    /** Booking Requirements this price was computed against. */
    requirements: jsonb("requirements").$type<Record<string, unknown>>().notNull(),
    pricing: jsonb("pricing").$type<Record<string, unknown>>().notNull(),
    priceFingerprint: text("price_fingerprint").notNull(),
    quotedAt: timestamp("quoted_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (table) => [
    check("booking_session_quotes_id_typeid", sql`${table.id} LIKE 'bsqu_%'`),
    check(
      "booking_session_quotes_state",
      sql`${table.state} IN ('active', 'superseded', 'consumed', 'expired')`,
    ),
    index("idx_booking_session_quotes_session").on(table.sessionId, table.sessionRevision),
    index("idx_booking_session_quotes_expires").on(table.expiresAt),
  ],
)

export const bookingSessionHoldsTable = pgTable(
  "booking_session_holds",
  {
    id: typeId("booking_session_holds"),
    sessionId: typeIdRef("session_id")
      .notNull()
      .references(() => bookingSessionsTable.id, { onDelete: "cascade" }),
    quoteId: typeIdRef("quote_id")
      .notNull()
      .references(() => bookingSessionQuotesTable.id, { onDelete: "cascade" }),
    target: jsonb("target").$type<BookingSessionTargetV1>().notNull(),
    quantity: integer("quantity").notNull(),
    state: text("state").notNull(),
    capacityKey: text("capacity_key").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("booking_session_holds_id_typeid", sql`${table.id} LIKE 'bshd_%'`),
    check(
      "booking_session_holds_state",
      sql`${table.state} IN ('active', 'converted', 'released', 'expired')`,
    ),
    check("booking_session_holds_quantity_positive", sql`${table.quantity} > 0`),
    index("idx_booking_session_holds_session").on(table.sessionId),
    index("idx_booking_session_holds_capacity").on(table.capacityKey, table.state),
    index("idx_booking_session_holds_expires").on(table.expiresAt),
  ],
)

export const bookingSessionCommitsTable = pgTable(
  "booking_session_commits",
  {
    id: typeId("booking_session_commits"),
    sessionId: typeIdRef("session_id")
      .notNull()
      .references(() => bookingSessionsTable.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    outcome: jsonb("outcome").$type<Record<string, unknown>>().notNull(),
    bookingId: text("booking_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uidx_booking_session_commits_session_idem").on(
      table.sessionId,
      table.idempotencyKey,
    ),
    check("booking_session_commits_id_typeid", sql`${table.id} LIKE 'bscm_%'`),
    index("idx_booking_session_commits_booking").on(table.bookingId),
  ],
)

export const bookingSessionOperationsTable = pgTable(
  "booking_session_operations",
  {
    id: typeId("booking_session_operations"),
    sessionId: typeIdRef("session_id")
      .notNull()
      .references(() => bookingSessionsTable.id, { onDelete: "cascade" }),
    operation: text("operation").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    outcome: jsonb("outcome").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("booking_session_operations_id_typeid", sql`${table.id} LIKE 'bsop_%'`),
    check(
      "booking_session_operations_operation",
      sql`${table.operation} IN ('update', 'quote', 'hold', 'abandon', 'adopt', 'renew')`,
    ),
    uniqueIndex("uidx_booking_session_operations_idem").on(
      table.sessionId,
      table.operation,
      table.idempotencyKey,
    ),
  ],
)

export const bookingSessionAuditEventsTable = pgTable(
  "booking_session_audit_events",
  {
    id: typeId("booking_session_audit_events"),
    sessionId: typeIdRef("session_id")
      .notNull()
      .references(() => bookingSessionsTable.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    actorKind: text("actor_kind").notNull(),
    principalId: text("principal_id"),
    organizationId: text("organization_id"),
    authorityReason: text("authority_reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("booking_session_audit_events_id_typeid", sql`${table.id} LIKE 'bsae_%'`),
    check(
      "booking_session_audit_events_action",
      sql`${table.action} IN ('read', 'update', 'quote', 'hold', 'commit', 'adopt', 'renew', 'abandon', 'expire', 'purge', 'supplier_reconcile', 'supplier_manual_resolve')`,
    ),
    index("idx_booking_session_audit_events_session").on(table.sessionId, table.createdAt),
  ],
)

export type SelectBookingSession = typeof bookingSessionsTable.$inferSelect
export type InsertBookingSession = typeof bookingSessionsTable.$inferInsert
export type SelectBookingSessionQuote = typeof bookingSessionQuotesTable.$inferSelect
export type InsertBookingSessionQuote = typeof bookingSessionQuotesTable.$inferInsert
export type SelectBookingSessionHold = typeof bookingSessionHoldsTable.$inferSelect
export type InsertBookingSessionHold = typeof bookingSessionHoldsTable.$inferInsert
export type SelectBookingSessionCommit = typeof bookingSessionCommitsTable.$inferSelect
export type InsertBookingSessionCommit = typeof bookingSessionCommitsTable.$inferInsert
export type SelectBookingSessionOperation = typeof bookingSessionOperationsTable.$inferSelect
export type InsertBookingSessionOperation = typeof bookingSessionOperationsTable.$inferInsert
export type SelectBookingSessionAuditEvent = typeof bookingSessionAuditEventsTable.$inferSelect
export type InsertBookingSessionAuditEvent = typeof bookingSessionAuditEventsTable.$inferInsert
