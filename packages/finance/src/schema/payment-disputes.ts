/**
 * Card disputes — a chargeback recorded against the payment session it contests
 * (voyant#4289).
 *
 * A dispute is a generic commerce event: every card processor produces them,
 * with the same shape. A payment is contested, funds are withdrawn or held,
 * there is a window to respond, and it resolves for or against the merchant.
 * So the record lives in the framework and nothing in it names a processor —
 * `provider` and `processor_reference` are opaque strings the framework stores
 * and never interprets.
 *
 * Evidence assembly and submission stay behind the payment adapter port, which
 * is where they belong. All this table learns is `evidence_submitted_at`: that
 * something was submitted, and when.
 */

import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { paymentDisputeStatusEnum } from "./enums.js"
import { paymentSessions } from "./payment-sessions.js"
import { invoices, payments } from "./receivables.js"

export const paymentDisputes = pgTable(
  "payment_disputes",
  {
    id: typeId("payment_disputes"),
    /**
     * The contested payment. Required — a dispute with nothing to contest is
     * not a dispute, and this is what makes the booking reachable without the
     * table reaching into `bookings`.
     */
    paymentSessionId: typeIdRef("payment_session_id")
      .notNull()
      .references(() => paymentSessions.id, { onDelete: "cascade" }),
    /** Copied from the session at open time so a booking can be asked directly. */
    bookingId: text("booking_id"),
    invoiceId: typeIdRef("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    paymentId: typeIdRef("payment_id").references(() => payments.id, { onDelete: "set null" }),
    status: paymentDisputeStatusEnum("status").notNull().default("opened"),
    /**
     * The contested amount, which may be less than the payment. Held in the
     * dispute's own currency rather than inherited, because a processor states
     * the contested sum in the settlement currency it took the money in.
     */
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    /** The processor's deadline to respond, where it supplies one. */
    respondBy: timestamp("respond_by", { withTimezone: true }),
    /** Opaque processor id for this dispute. Also its idempotency key. */
    processorReference: text("processor_reference"),
    provider: text("provider"),
    providerConnectionId: text("provider_connection_id"),
    /** The processor's own reason label, recorded verbatim and never parsed. */
    reasonCode: text("reason_code"),
    /**
     * When the record reached a terminal status. The resolution itself is that
     * status (`won` / `lost` / `withdrawn`) — a separate outcome column would
     * only be able to disagree with it.
     */
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    /** Whatever the processor said about the outcome. Free text. */
    resolutionNote: text("resolution_note"),
    evidenceSubmittedAt: timestamp("evidence_submitted_at", { withTimezone: true }),
    notes: text("notes"),
    providerPayload: jsonb("provider_payload").$type<Record<string, unknown>>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_payment_disputes_session").on(table.paymentSessionId),
    index("idx_payment_disputes_booking").on(table.bookingId),
    index("idx_payment_disputes_booking_status").on(table.bookingId, table.status),
    index("idx_payment_disputes_status").on(table.status),
    index("idx_payment_disputes_status_opened").on(table.status, table.openedAt),
    index("idx_payment_disputes_invoice").on(table.invoiceId),
    index("idx_payment_disputes_respond_by").on(table.respondBy),
    /**
     * A repeated callback for a dispute the framework already recorded updates
     * it. A genuinely second dispute against the same payment carries a
     * different processor reference and becomes a second row — nothing here
     * lets one overwrite the other. Postgres treats NULLs as distinct, so a
     * manually recorded dispute with no processor reference is never blocked.
     */
    uniqueIndex("uidx_payment_disputes_processor_reference").on(
      table.paymentSessionId,
      table.processorReference,
    ),
  ],
)

export type PaymentDispute = typeof paymentDisputes.$inferSelect
export type NewPaymentDispute = typeof paymentDisputes.$inferInsert
