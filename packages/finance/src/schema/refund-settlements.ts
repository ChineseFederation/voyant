/**
 * The money leg of a refund (voyant#4303).
 *
 * Finance already modelled refunds well as accounting and not at all as money:
 * a credit note said an amount was owed back, and nothing recorded that anyone
 * had paid it, how, or whether it arrived. This table is that record — bound to
 * what it reverses and to how it was paid.
 *
 * Three properties are load-bearing:
 *
 * - **A refund can be owed and not yet paid.** `pending` is the normal state of
 *   a bank-transfer refund for a day or two, and it must not read as settled.
 * - **A pending refund still holds its amount.** The refundable remainder
 *   subtracts `pending` as well as `settled`, so a retry after an ambiguous
 *   processor failure cannot return the same money twice.
 * - **Repeated partial refunds are ordinary.** Nothing here is one-per-payment;
 *   the bound is the arithmetic, not the row count.
 *
 * Nothing in this table names a processor. `provider`, `processorReference` and
 * `externalReference` are opaque strings the framework stores and hands back.
 */

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

import { refundSettlementMethodEnum, refundSettlementStatusEnum } from "./enums.js"
import { paymentSessions } from "./payment-sessions.js"
import { creditNotes, invoices, payments } from "./receivables.js"
import { travelCredits } from "./travel-credits.js"

export const refundSettlements = pgTable(
  "refund_settlements",
  {
    id: typeId("refund_settlements"),
    /**
     * The accounting document this settles. Nullable because an operator can
     * pay money back before the credit note is cut — but see the check
     * constraint: a settlement bound to neither a credit note nor a payment
     * reverses nothing and is not a refund.
     */
    creditNoteId: typeIdRef("credit_note_id").references(() => creditNotes.id, {
      onDelete: "set null",
    }),
    /** The payment being reversed. What bounds the refundable amount. */
    paymentId: typeIdRef("payment_id").references(() => payments.id, { onDelete: "set null" }),
    invoiceId: typeIdRef("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    /**
     * The checkout session, when the money is going back through the processor
     * that took it. This is what `adapter.refund()` is addressed to.
     */
    paymentSessionId: typeIdRef("payment_session_id").references(() => paymentSessions.id, {
      onDelete: "set null",
    }),
    /** Copied at record time so a booking can be asked directly. */
    bookingId: text("booking_id"),
    method: refundSettlementMethodEnum("method").notNull(),
    status: refundSettlementStatusEnum("status").notNull().default("pending"),
    /** What the customer is owed back, in the currency they are owed it in. */
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    /**
     * What the instrument is worth, when that is not the amount refunded.
     *
     * Offering 110% in credit to avoid paying out 100% in cash is a standard
     * cancellation tactic, and it is not an accounting identity: the credit note
     * says 100 and the voucher says 110. Recording only one of the two numbers
     * would make the pair disagree with no way to tell which was right. Null
     * means the instrument is worth exactly `amountCents`.
     */
    instrumentAmountCents: integer("instrument_amount_cents"),
    instrumentCurrency: text("instrument_currency"),
    /** The credit or voucher issued, for the two instrument-backed methods. */
    travelCreditId: typeIdRef("travel_credit_id").references(() => travelCredits.id, {
      onDelete: "set null",
    }),
    /**
     * Whose balance a `counterparty_offset` was netted against. A trade account
     * that owes money on three other bookings is credited, not paid — and the
     * balance is the counterparty's, not any one booking's.
     */
    counterpartyOrganizationId: text("counterparty_organization_id"),
    counterpartyPersonId: text("counterparty_person_id"),
    /**
     * The method's own reference where it has one: a bank payment reference, a
     * cheque number, the processor's refund id. Opaque and never parsed.
     */
    externalReference: text("external_reference"),
    provider: text("provider"),
    providerConnectionId: text("provider_connection_id"),
    processorReference: text("processor_reference"),
    /**
     * Who authorized the refund. `approvalId` and `requestedActionId` are the
     * existing `finance:refund` approval — this record does not invent a second
     * authorization path, it points at the one that already exists.
     */
    authorizedByUserId: text("authorized_by_user_id"),
    approvalId: text("approval_id"),
    requestedActionId: text("requested_action_id"),
    /**
     * Caller-supplied de-duplication key, scoped to the payment. A retry that
     * carries the same key finds the settlement it already made instead of
     * paying the customer twice.
     */
    idempotencyKey: text("idempotency_key"),
    initiatedAt: timestamp("initiated_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    /** Why the money did not move. Free text, including a processor's own words. */
    failureReason: text("failure_reason"),
    notes: text("notes"),
    providerPayload: jsonb("provider_payload").$type<Record<string, unknown>>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_refund_settlements_credit_note").on(table.creditNoteId),
    index("idx_refund_settlements_payment").on(table.paymentId),
    index("idx_refund_settlements_payment_status").on(table.paymentId, table.status),
    index("idx_refund_settlements_invoice").on(table.invoiceId),
    index("idx_refund_settlements_session").on(table.paymentSessionId),
    index("idx_refund_settlements_booking").on(table.bookingId),
    index("idx_refund_settlements_booking_status").on(table.bookingId, table.status),
    index("idx_refund_settlements_status").on(table.status),
    index("idx_refund_settlements_status_initiated").on(table.status, table.initiatedAt),
    index("idx_refund_settlements_method").on(table.method),
    index("idx_refund_settlements_travel_credit").on(table.travelCreditId),
    index("idx_refund_settlements_counterparty_organization").on(table.counterpartyOrganizationId),
    /**
     * A retried request settles once. Postgres treats NULLs as distinct, so a
     * settlement recorded by hand with no key is never blocked — an operator
     * typing in two separate cash refunds against one payment is ordinary.
     */
    uniqueIndex("uidx_refund_settlements_idempotency").on(table.paymentId, table.idempotencyKey),
    // A settlement that reverses neither a credit note nor a payment is not a
    // refund. One of the two is what makes this record mean anything.
    check(
      "ck_refund_settlements_reverses_something",
      // agent-quality: raw-sql reviewed -- owner: finance; the expression names two columns and binds no parameters.
      sql`${table.creditNoteId} IS NOT NULL OR ${table.paymentId} IS NOT NULL`,
    ),
    // An instrument amount without its currency cannot be compared to anything.
    check(
      "ck_refund_settlements_instrument_currency",
      // agent-quality: raw-sql reviewed -- owner: finance; the expression names two columns and binds no parameters.
      sql`(${table.instrumentAmountCents} IS NULL) = (${table.instrumentCurrency} IS NULL)`,
    ),
    check(
      "ck_refund_settlements_amount_positive",
      // agent-quality: raw-sql reviewed -- owner: finance; the expression names one column and binds no parameters.
      sql`${table.amountCents} > 0`,
    ),
  ],
)

export type RefundSettlement = typeof refundSettlements.$inferSelect
export type NewRefundSettlement = typeof refundSettlements.$inferInsert
