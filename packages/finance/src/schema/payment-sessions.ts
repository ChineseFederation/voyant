import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import type { PaymentHostedCheckout } from "@voyant-travel/payments"
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { bookingGuarantees, bookingPaymentSchedules } from "./booking-billing.js"
import {
  paymentMethodEnum,
  paymentSessionStatusEnum,
  paymentSessionTargetTypeEnum,
} from "./enums.js"
import { paymentInstruments } from "./payment-instruments.js"
import { paymentAuthorizations, paymentCaptures } from "./payment-processing.js"
import { invoices, payments } from "./receivables.js"

// ---------- payment_sessions ----------

export const paymentSessions = pgTable(
  "payment_sessions",
  {
    id: typeId("payment_sessions"),
    targetType: paymentSessionTargetTypeEnum("target_type").notNull().default("other"),
    targetId: text("target_id"),
    bookingId: text("booking_id"),
    orderId: text("order_id"),
    invoiceId: typeIdRef("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    bookingPaymentScheduleId: typeIdRef("booking_payment_schedule_id").references(
      () => bookingPaymentSchedules.id,
      { onDelete: "set null" },
    ),
    bookingGuaranteeId: typeIdRef("booking_guarantee_id").references(() => bookingGuarantees.id, {
      onDelete: "set null",
    }),
    paymentInstrumentId: typeIdRef("payment_instrument_id").references(
      () => paymentInstruments.id,
      { onDelete: "set null" },
    ),
    paymentAuthorizationId: typeIdRef("payment_authorization_id").references(
      () => paymentAuthorizations.id,
      { onDelete: "set null" },
    ),
    paymentCaptureId: typeIdRef("payment_capture_id").references(() => paymentCaptures.id, {
      onDelete: "set null",
    }),
    paymentId: typeIdRef("payment_id").references(() => payments.id, {
      onDelete: "set null",
    }),
    status: paymentSessionStatusEnum("status").notNull().default("pending"),
    provider: text("provider"),
    providerConnectionId: text("provider_connection_id"),
    providerSessionId: text("provider_session_id"),
    providerPaymentId: text("provider_payment_id"),
    externalReference: text("external_reference"),
    idempotencyKey: text("idempotency_key"),
    clientReference: text("client_reference"),
    currency: text("currency").notNull(),
    amountCents: integer("amount_cents").notNull(),
    paymentMethod: paymentMethodEnum("payment_method"),
    payerPersonId: text("payer_person_id"),
    payerOrganizationId: text("payer_organization_id"),
    payerEmail: text("payer_email"),
    payerName: text("payer_name"),
    redirectUrl: text("redirect_url"),
    /**
     * The processor handoff as the adapter returned it.
     *
     * `redirect_url` is the flattened projection of the redirect arm and stays
     * the column every existing reader uses. This carries the whole
     * discriminated union, because the embedded arm has no URL to flatten to —
     * without it an in-page handoff cannot survive the round trip from
     * initiation to the page that has to mount the form.
     *
     * The embedded arm's `clientSecret` is a per-session token the provider
     * issues *for* the browser, not a credential at rest: it authorizes one
     * payment and nothing else. Processor credentials still never touch this
     * table — see ADR 0015.
     */
    checkout: jsonb("checkout").$type<PaymentHostedCheckout>(),
    returnUrl: text("return_url"),
    cancelUrl: text("cancel_url"),
    callbackUrl: text("callback_url"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    expiredAt: timestamp("expired_at", { withTimezone: true }),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    notes: text("notes"),
    providerPayload: jsonb("provider_payload").$type<Record<string, unknown>>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_payment_sessions_target").on(table.targetType, table.targetId),
    index("idx_payment_sessions_target_created").on(table.targetType, table.createdAt),
    index("idx_payment_sessions_booking").on(table.bookingId),
    index("idx_payment_sessions_booking_created").on(table.bookingId, table.createdAt),
    index("idx_payment_sessions_order").on(table.orderId),
    index("idx_payment_sessions_order_created").on(table.orderId, table.createdAt),
    index("idx_payment_sessions_invoice").on(table.invoiceId),
    index("idx_payment_sessions_invoice_created").on(table.invoiceId, table.createdAt),
    index("idx_payment_sessions_schedule").on(table.bookingPaymentScheduleId),
    index("idx_payment_sessions_schedule_created").on(
      table.bookingPaymentScheduleId,
      table.createdAt,
    ),
    index("idx_payment_sessions_guarantee").on(table.bookingGuaranteeId),
    index("idx_payment_sessions_guarantee_created").on(table.bookingGuaranteeId, table.createdAt),
    index("idx_payment_sessions_status").on(table.status),
    index("idx_payment_sessions_status_created").on(table.status, table.createdAt),
    index("idx_payment_sessions_provider").on(table.provider),
    index("idx_payment_sessions_provider_created").on(table.provider, table.createdAt),
    index("idx_payment_sessions_provider_connection").on(table.providerConnectionId),
    index("idx_payment_sessions_provider_session").on(table.providerSessionId),
    index("idx_payment_sessions_expires_at").on(table.expiresAt),
    uniqueIndex("uidx_payment_sessions_idempotency").on(table.idempotencyKey),
    uniqueIndex("uidx_payment_sessions_provider_session").on(
      table.provider,
      table.providerSessionId,
    ),
  ],
)

export type PaymentSession = typeof paymentSessions.$inferSelect
export type NewPaymentSession = typeof paymentSessions.$inferInsert
