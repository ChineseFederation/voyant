import type {
  SupplierCommitmentPolicyV1,
  SupplierOperationKindV1,
  SupplierOperationStateV1,
  SupplierOperationSubjectTypeV1,
} from "@voyant-travel/catalog-contracts/booking-engine/supplier-operations"
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

import {
  bookingSessionHoldsTable,
  bookingSessionQuotesTable,
  bookingSessionsTable,
} from "./sessions-schema.js"

export const supplierOperationsTable = pgTable(
  "supplier_operations",
  {
    id: typeId("supplier_operations"),
    subjectType: text("subject_type").$type<SupplierOperationSubjectTypeV1>().notNull(),
    subjectId: text("subject_id").notNull(),
    sessionId: typeIdRef("session_id").references(() => bookingSessionsTable.id, {
      onDelete: "restrict",
    }),
    scopeKey: text("scope_key").notNull().default("session"),
    quoteId: typeIdRef("quote_id").references(() => bookingSessionQuotesTable.id, {
      onDelete: "restrict",
    }),
    holdId: typeIdRef("hold_id").references(() => bookingSessionHoldsTable.id, {
      onDelete: "restrict",
    }),
    idempotencyKey: text("idempotency_key").notNull(),
    operationKind: text("operation_kind").$type<SupplierOperationKindV1>().notNull(),
    state: text("state").$type<SupplierOperationStateV1>().notNull(),
    commitmentPolicy: text("commitment_policy").$type<SupplierCommitmentPolicyV1>().notNull(),
    entityModule: text("entity_module").notNull(),
    entityId: text("entity_id").notNull(),
    sourceKind: text("source_kind").notNull(),
    sourceConnectionId: text("source_connection_id").notNull(),
    sourceRef: text("source_ref").notNull(),
    adapterKind: text("adapter_kind").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    adapterIdempotencyKey: text("adapter_idempotency_key").notNull(),
    requestPayload: jsonb("request_payload").$type<Record<string, unknown>>().notNull(),
    version: integer("version").notNull().default(0),
    attemptCount: integer("attempt_count").notNull().default(0),
    upstreamRef: text("upstream_ref"),
    upstreamStatus: text("upstream_status"),
    bookingId: text("booking_id"),
    bookingItemId: text("booking_item_id"),
    amendmentId: text("amendment_id"),
    lastErrorClass: text("last_error_class"),
    safeEvidence: jsonb("safe_evidence").$type<Record<string, unknown>>().notNull().default({}),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    nextReconcileAt: timestamp("next_reconcile_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by"),
    resolutionReason: text("resolution_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("supplier_operations_id_typeid", sql`${table.id} LIKE 'suop_%'`),
    check(
      "supplier_operations_subject_type",
      sql`${table.subjectType} IN ('booking_session','booking_amendment')`,
    ),
    check(
      "supplier_operations_subject_shape",
      sql`(${table.subjectType} = 'booking_session' AND ${table.sessionId} IS NOT NULL AND ${table.quoteId} IS NOT NULL AND ${table.amendmentId} IS NULL) OR (${table.subjectType} = 'booking_amendment' AND ${table.sessionId} IS NULL AND ${table.quoteId} IS NULL AND ${table.bookingId} IS NOT NULL AND ${table.bookingItemId} IS NOT NULL AND ${table.amendmentId} IS NOT NULL)`,
    ),
    check("supplier_operations_kind", sql`${table.operationKind} IN ('reserve','modify','cancel')`),
    check(
      "supplier_operations_state",
      sql`${table.state} IN ('queued','submitted','pending','succeeded','refused','cancelled','in_doubt','manual_review','manually_resolved')`,
    ),
    check(
      "supplier_operations_policy",
      sql`${table.commitmentPolicy} IN ('supplier_first','operator_backed')`,
    ),
    check("supplier_operations_attempt_count", sql`${table.attemptCount} >= 0`),
    check("supplier_operations_version", sql`${table.version} >= 0`),
    uniqueIndex("uidx_supplier_operations_subject_command").on(
      table.subjectType,
      table.subjectId,
      table.scopeKey,
      table.idempotencyKey,
    ),
    uniqueIndex("uidx_supplier_operations_subject_active_guard")
      .on(table.subjectType, table.subjectId, table.scopeKey, table.operationKind)
      .where(
        sql`${table.state} IN ('queued','submitted','pending','succeeded','in_doubt','manual_review') OR (${table.state} = 'manually_resolved' AND ${table.upstreamStatus} = 'succeeded')`,
      ),
    uniqueIndex("uidx_supplier_operations_adapter_idem").on(
      table.sourceConnectionId,
      table.adapterIdempotencyKey,
    ),
    index("idx_supplier_operations_state_reconcile").on(table.state, table.nextReconcileAt),
    index("idx_supplier_operations_session_created").on(table.sessionId, table.createdAt),
    index("idx_supplier_operations_amendment_created").on(table.amendmentId, table.createdAt),
    index("idx_supplier_operations_upstream").on(table.sourceConnectionId, table.upstreamRef),
  ],
)

export type SelectSupplierOperation = typeof supplierOperationsTable.$inferSelect
export type InsertSupplierOperation = typeof supplierOperationsTable.$inferInsert
