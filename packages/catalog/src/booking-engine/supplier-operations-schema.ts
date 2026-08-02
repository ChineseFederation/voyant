import type {
  SupplierCommitmentPolicyV1,
  SupplierOperationStateV1,
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
    sessionId: typeIdRef("session_id")
      .notNull()
      .references(() => bookingSessionsTable.id, { onDelete: "restrict" }),
    quoteId: typeIdRef("quote_id")
      .notNull()
      .references(() => bookingSessionQuotesTable.id, { onDelete: "restrict" }),
    holdId: typeIdRef("hold_id").references(() => bookingSessionHoldsTable.id, {
      onDelete: "restrict",
    }),
    commitIdempotencyKey: text("commit_idempotency_key").notNull(),
    operationKind: text("operation_kind").notNull(),
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
    check("supplier_operations_kind", sql`${table.operationKind} = 'reserve'`),
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
    uniqueIndex("uidx_supplier_operations_session_commit").on(
      table.sessionId,
      table.commitIdempotencyKey,
    ),
    uniqueIndex("uidx_supplier_operations_session_reserve_guard")
      .on(table.sessionId, table.operationKind)
      .where(
        sql`${table.state} IN ('queued','submitted','pending','succeeded','in_doubt','manual_review') OR (${table.state} = 'manually_resolved' AND ${table.upstreamStatus} = 'succeeded')`,
      ),
    uniqueIndex("uidx_supplier_operations_adapter_idem").on(
      table.sourceConnectionId,
      table.adapterIdempotencyKey,
    ),
    index("idx_supplier_operations_state_reconcile").on(table.state, table.nextReconcileAt),
    index("idx_supplier_operations_session_created").on(table.sessionId, table.createdAt),
    index("idx_supplier_operations_upstream").on(table.sourceConnectionId, table.upstreamRef),
  ],
)

export type SelectSupplierOperation = typeof supplierOperationsTable.$inferSelect
export type InsertSupplierOperation = typeof supplierOperationsTable.$inferInsert
