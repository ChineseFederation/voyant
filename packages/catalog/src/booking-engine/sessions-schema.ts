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
    actorKind: text("actor_kind").notNull(),
    ownerPrincipalId: text("owner_principal_id"),
    ownerOrganizationId: text("owner_organization_id"),
    targetKind: text("target_kind").notNull(),
    productId: typeIdRef("product_id"),
    catalogItemId: text("catalog_item_id"),
    state: text("state").notNull(),
    revision: integer("revision").notNull(),
    statePayload: jsonb("state_payload").$type<Record<string, unknown>>().notNull().default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    abandonedAt: timestamp("abandoned_at", { withTimezone: true }),
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
      sql`${table.state} IN ('active', 'consumed', 'expired', 'abandoned')`,
    ),
    check(
      "booking_sessions_target_exactly_one",
      sql`(${table.targetKind} = 'product' AND ${table.productId} IS NOT NULL AND ${table.catalogItemId} IS NULL)
        OR (${table.targetKind} = 'catalog_item' AND ${table.catalogItemId} IS NOT NULL AND ${table.productId} IS NULL)`,
    ),
    check(
      "booking_sessions_anonymous_capability",
      sql`(${table.actorKind} = 'anonymous' AND ${table.capabilityHash} IS NOT NULL AND ${table.ownerPrincipalId} IS NULL)
        OR (${table.actorKind} <> 'anonymous' AND ${table.capabilityHash} IS NULL AND ${table.ownerPrincipalId} IS NOT NULL)`,
    ),
    index("idx_booking_sessions_state_expires").on(table.state, table.expiresAt),
    index("idx_booking_sessions_product").on(table.productId),
    index("idx_booking_sessions_catalog_item").on(table.catalogItemId),
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
      sql`${table.operation} IN ('update', 'quote', 'hold', 'abandon')`,
    ),
    uniqueIndex("uidx_booking_session_operations_idem").on(
      table.sessionId,
      table.operation,
      table.idempotencyKey,
    ),
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
