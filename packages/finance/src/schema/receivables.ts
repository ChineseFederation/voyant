import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { sql } from "drizzle-orm"
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { bookingPaymentSchedules } from "./booking-billing.js"
import {
  creditNoteStatusEnum,
  invoiceStatusEnum,
  invoiceTypeEnum,
  paymentMethodEnum,
  paymentStatusEnum,
} from "./enums.js"
import { paymentInstruments } from "./payment-instruments.js"
import { paymentAuthorizations, paymentCaptures } from "./payment-processing.js"

// ---------- invoices ----------

export const invoices = pgTable(
  "invoices",
  {
    id: typeId("invoices"),

    invoiceNumber: text("invoice_number").notNull(),
    invoiceType: invoiceTypeEnum("invoice_type").notNull().default("invoice"),
    /**
     * Source proforma when this row is the final invoice that
     * superseded one. Lets the bank-transfer flow link the proforma
     * issued at checkout to the invoice issued after payment lands —
     * SmartBill's "convert proforma" call returns the same number
     * series, but the local rows stay distinct so the audit trail
     * shows both documents.
     */
    convertedFromInvoiceId: text("converted_from_invoice_id"),
    seriesId: typeIdRef("series_id"),
    sequence: integer("sequence"),
    templateId: typeIdRef("template_id"),
    taxRegimeId: typeIdRef("tax_regime_id"),
    language: text("language"),
    bookingId: text("booking_id").notNull(),
    personId: text("person_id"),
    organizationId: text("organization_id"),
    status: invoiceStatusEnum("status").notNull().default("draft"),

    currency: text("currency").notNull(),
    baseCurrency: text("base_currency"),
    fxRateSetId: text("fx_rate_set_id"),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    baseSubtotalCents: integer("base_subtotal_cents"),
    taxCents: integer("tax_cents").notNull().default(0),
    baseTaxCents: integer("base_tax_cents"),
    totalCents: integer("total_cents").notNull().default(0),
    baseTotalCents: integer("base_total_cents"),
    paidCents: integer("paid_cents").notNull().default(0),
    basePaidCents: integer("base_paid_cents"),
    balanceDueCents: integer("balance_due_cents").notNull().default(0),
    baseBalanceDueCents: integer("base_balance_due_cents"),
    commissionPercent: integer("commission_percent"),
    commissionAmountCents: integer("commission_amount_cents"),

    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date").notNull(),
    notes: text("notes"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_invoices_booking").on(table.bookingId),
    index("idx_invoices_booking_created").on(table.bookingId, table.createdAt),
    index("idx_invoices_person").on(table.personId),
    index("idx_invoices_organization").on(table.organizationId),
    index("idx_invoices_status").on(table.status),
    index("idx_invoices_status_created").on(table.status, table.createdAt),
    index("idx_invoices_outstanding_due").on(table.status, table.balanceDueCents, table.dueDate),
    // Bare created_at index for the dashboard's monthly rollups, which
    // filter a created_at range without a leading status column.
    index("idx_invoices_created").on(table.createdAt),
    index("idx_invoices_fx_rate_set").on(table.fxRateSetId),
    index("idx_invoices_number").on(table.invoiceNumber),
    uniqueIndex("invoices_invoice_number_type_active_idx")
      .on(table.invoiceNumber, table.invoiceType)
      // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      .where(sql`${table.status} <> 'void'`),
    index("idx_invoices_due_date").on(table.dueDate),
    index("idx_invoices_converted_from").on(table.convertedFromInvoiceId),
    // base_currency covers every base_*_cents column. If any base amount is
    // present, base_currency must be set so reporting can interpret it.
    check(
      "ck_invoices_base_currency_amounts",
      sql`(
        ${table.baseSubtotalCents} IS NULL
        AND ${table.baseTaxCents} IS NULL
        AND ${table.baseTotalCents} IS NULL
        AND ${table.basePaidCents} IS NULL
        AND ${table.baseBalanceDueCents} IS NULL
      ) OR ${table.baseCurrency} IS NOT NULL`,
    ),
  ],
)

export type Invoice = typeof invoices.$inferSelect
export type NewInvoice = typeof invoices.$inferInsert

// ---------- invoice_line_items ----------

export const invoiceLineItems = pgTable(
  "invoice_line_items",
  {
    id: typeId("invoice_line_items"),
    invoiceId: typeIdRef("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    bookingItemId: text("booking_item_id"),
    bookingPaymentScheduleId: text("booking_payment_schedule_id").references(
      () => bookingPaymentSchedules.id,
      { onDelete: "set null" },
    ),

    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPriceCents: integer("unit_price_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    taxRate: integer("tax_rate"),
    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_invoice_line_items_invoice").on(table.invoiceId),
    index("idx_invoice_line_items_invoice_sort").on(table.invoiceId, table.sortOrder),
    index("idx_invoice_line_items_booking_item").on(table.bookingItemId),
    index("idx_invoice_line_items_payment_schedule").on(table.bookingPaymentScheduleId),
  ],
)

export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect
export type NewInvoiceLineItem = typeof invoiceLineItems.$inferInsert

// ---------- payments ----------

export const payments = pgTable(
  "payments",
  {
    id: typeId("payments"),
    invoiceId: typeIdRef("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),

    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    /**
     * The payment expressed in the INVOICE's currency — a settlement
     * conversion, not a reporting one. Unlike `base_*` on `invoices`,
     * `bookings` and `supplier_invoices`, which all mean the operator's
     * reporting currency, this answers "how much of the invoice does this
     * clear?" and `paymentSettlementAmountSql` depends on it. Unifying the
     * name is follow-up work with a data migration behind it; until then the
     * reporting figure lives in `reporting_*` below.
     */
    baseCurrency: text("base_currency"),
    baseAmountCents: integer("base_amount_cents"),
    fxRateSetId: text("fx_rate_set_id"),
    /**
     * The payment in the operator's reporting currency, at the rate of its own
     * payment date (voyant#4703). This is the figure a regulator asks for —
     * "advances collected, in lei" — and it has to be frozen at the payment
     * date, because a rate resolved later is a different number.
     */
    reportingCurrency: text("reporting_currency"),
    reportingAmountCents: integer("reporting_amount_cents"),
    /** The rate set the reporting amount was computed from. */
    reportingFxRateSetId: text("reporting_fx_rate_set_id"),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    paymentInstrumentId: typeIdRef("payment_instrument_id").references(
      () => paymentInstruments.id,
      {
        onDelete: "set null",
      },
    ),
    paymentAuthorizationId: typeIdRef("payment_authorization_id").references(
      () => paymentAuthorizations.id,
      { onDelete: "set null" },
    ),
    paymentCaptureId: typeIdRef("payment_capture_id").references(() => paymentCaptures.id, {
      onDelete: "set null",
    }),
    status: paymentStatusEnum("status").notNull().default("pending"),
    referenceNumber: text("reference_number"),
    paymentDate: date("payment_date").notNull(),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_payments_invoice").on(table.invoiceId),
    index("idx_payments_invoice_date").on(table.invoiceId, table.paymentDate),
    index("idx_payments_fx_rate_set").on(table.fxRateSetId),
    index("idx_payments_instrument").on(table.paymentInstrumentId),
    index("idx_payments_authorization").on(table.paymentAuthorizationId),
    index("idx_payments_capture").on(table.paymentCaptureId),
    index("idx_payments_status").on(table.status),
    index("idx_payments_date").on(table.paymentDate),
    index("idx_payments_reporting_fx_rate_set").on(table.reportingFxRateSetId),
    check(
      "ck_payments_base_currency_amount",
      // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      sql`(${table.baseCurrency} IS NULL) = (${table.baseAmountCents} IS NULL)`,
    ),
    check(
      "ck_payments_reporting_currency_amount",
      // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      sql`(${table.reportingCurrency} IS NULL) = (${table.reportingAmountCents} IS NULL)`,
    ),
  ],
)

export type Payment = typeof payments.$inferSelect
export type NewPayment = typeof payments.$inferInsert

// ---------- credit_notes ----------

export const creditNotes = pgTable(
  "credit_notes",
  {
    id: typeId("credit_notes"),

    creditNoteNumber: text("credit_note_number").notNull().unique(),
    invoiceId: typeIdRef("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    status: creditNoteStatusEnum("status").notNull().default("draft"),

    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    baseCurrency: text("base_currency"),
    baseAmountCents: integer("base_amount_cents"),
    fxRateSetId: text("fx_rate_set_id"),
    reason: text("reason").notNull(),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_credit_notes_invoice").on(table.invoiceId),
    index("idx_credit_notes_invoice_created").on(table.invoiceId, table.createdAt),
    index("idx_credit_notes_fx_rate_set").on(table.fxRateSetId),
    index("idx_credit_notes_number").on(table.creditNoteNumber),
  ],
)

export type CreditNote = typeof creditNotes.$inferSelect
export type NewCreditNote = typeof creditNotes.$inferInsert

// ---------- credit_note_line_items ----------

export const creditNoteLineItems = pgTable(
  "credit_note_line_items",
  {
    id: typeId("credit_note_line_items"),
    creditNoteId: typeIdRef("credit_note_id")
      .notNull()
      .references(() => creditNotes.id, { onDelete: "cascade" }),

    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPriceCents: integer("unit_price_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_credit_note_line_items_credit_note").on(table.creditNoteId),
    index("idx_credit_note_line_items_credit_note_sort").on(table.creditNoteId, table.sortOrder),
  ],
)

export type CreditNoteLineItem = typeof creditNoteLineItems.$inferSelect
export type NewCreditNoteLineItem = typeof creditNoteLineItems.$inferInsert
