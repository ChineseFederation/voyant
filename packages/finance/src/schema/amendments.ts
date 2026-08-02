import type { BookingAmendmentFinancialConsequences } from "@voyant-travel/bookings-contracts"
import { typeId } from "@voyant-travel/db/lib/typeid-column"
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

export type FinanceAmendmentAdjustmentStatus =
  | "no_action"
  | "collection_required"
  | "refund_required"

export const financeAmendmentAdjustments = pgTable(
  "finance_amendment_adjustments",
  {
    id: typeId("finance_amendment_adjustments"),
    amendmentId: text("amendment_id").notNull(),
    bookingId: text("booking_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    currency: text("currency").notNull(),
    subtotalDeltaCents: integer("subtotal_delta_cents").notNull(),
    feeDeltaCents: integer("fee_delta_cents").notNull(),
    taxDeltaCents: integer("tax_delta_cents").notNull(),
    totalDeltaCents: integer("total_delta_cents").notNull(),
    collectionAmountCents: integer("collection_amount_cents").notNull().default(0),
    refundAmountCents: integer("refund_amount_cents").notNull().default(0),
    status: text("status").$type<FinanceAmendmentAdjustmentStatus>().notNull(),
    consequences: jsonb("consequences").$type<BookingAmendmentFinancialConsequences>().notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_finance_amendment_adjustments_amendment").on(table.amendmentId),
    index("idx_finance_amendment_adjustments_booking_created").on(table.bookingId, table.createdAt),
    index("idx_finance_amendment_adjustments_status").on(table.status),
    check(
      "ck_finance_amendment_adjustments_status",
      // agent-quality: raw-sql reviewed -- owner: finance; static status membership constraint over a Drizzle identifier.
      sql`${table.status} IN ('no_action', 'collection_required', 'refund_required')`,
    ),
    check(
      "ck_finance_amendment_adjustments_money",
      // agent-quality: raw-sql reviewed -- owner: finance; monetary balance invariant over Drizzle identifiers and integer literals.
      sql`${table.totalDeltaCents} = ${table.subtotalDeltaCents} + ${table.feeDeltaCents} + ${table.taxDeltaCents}
        AND ${table.collectionAmountCents} >= 0
        AND ${table.refundAmountCents} >= 0
        AND NOT (${table.collectionAmountCents} > 0 AND ${table.refundAmountCents} > 0)`,
    ),
  ],
)

export type FinanceAmendmentAdjustment = typeof financeAmendmentAdjustments.$inferSelect
