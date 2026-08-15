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

import { bookings, bookingTravelers } from "./schema-core.js"
import {
  bookingActivityTypeEnum,
  bookingDocumentTypeEnum,
  supplierConfirmationStatusEnum,
} from "./schema-shared.js"

export const bookingSupplierStatuses = pgTable(
  "booking_supplier_statuses",
  {
    id: typeId("booking_supplier_statuses"),
    bookingId: typeIdRef("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    supplierServiceId: text("supplier_service_id"),
    // Supplier snapshot — the status has no FK to suppliers; this lets a
    // received supplier invoice be matched to the commitment without an
    // unreliable join through supplier_services. See AP design §5.5.
    supplierId: text("supplier_id"),
    serviceName: text("service_name").notNull(),
    status: supplierConfirmationStatusEnum("status").notNull().default("pending"),
    supplierReference: text("supplier_reference"),
    costCurrency: text("cost_currency").notNull(),
    costAmountCents: integer("cost_amount_cents").notNull(),
    // Link to the actual supplier invoice line once the bill arrives — gives
    // the commitment → invoice (committed-vs-invoiced) variance. See §5.5 / §10.
    supplierInvoiceLineId: text("supplier_invoice_line_id"),
    notes: text("notes"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_booking_supplier_statuses_booking").on(table.bookingId),
    index("idx_booking_supplier_statuses_booking_created").on(table.bookingId, table.createdAt),
    index("idx_booking_supplier_statuses_service").on(table.supplierServiceId),
    index("idx_booking_supplier_statuses_supplier").on(table.supplierId),
    index("idx_booking_supplier_statuses_invoice_line").on(table.supplierInvoiceLineId),
  ],
)

export const bookingActivityLog = pgTable(
  "booking_activity_log",
  {
    id: typeId("booking_activity_log"),
    bookingId: typeIdRef("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    actorId: text("actor_id"),
    activityType: bookingActivityTypeEnum("activity_type").notNull(),
    description: text("description").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_booking_activity_log_booking").on(table.bookingId),
    index("idx_booking_activity_log_booking_created").on(table.bookingId, table.createdAt),
  ],
)

export const bookingNotes = pgTable(
  "booking_notes",
  {
    id: typeId("booking_notes"),
    bookingId: typeIdRef("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_booking_notes_booking").on(table.bookingId),
    index("idx_booking_notes_booking_created").on(table.bookingId, table.createdAt),
  ],
)

/**
 * Documents held against a Booking. Every row is a RECORD of a document that
 * exists somewhere else — an uploaded passport scan, or a contract or invoice
 * issued by an external system. Platform-issued paperwork is not stored here:
 * a generated booking contract lives in legal's contract attachments and a
 * Voyant-issued invoice lives in finance's renditions.
 *
 * The `issued*` columns carry the external document's OWN identity, so the
 * booking is auditable against the paperwork the customer actually holds
 * without Voyant claiming to have issued it (voyant#4657).
 */
export const bookingDocuments = pgTable(
  "booking_documents",
  {
    id: typeId("booking_documents"),
    bookingId: typeIdRef("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    travelerId: typeIdRef("traveler_id").references(() => bookingTravelers.id, {
      onDelete: "set null",
    }),
    type: bookingDocumentTypeEnum("type").notNull(),
    fileName: text("file_name").notNull(),
    fileUrl: text("file_url").notNull(),
    /** Who issued the document — an accounting system, agency, or authority. */
    issuedBy: text("issued_by"),
    /** The issuer's own series, when the document carries one. */
    issuedSeries: text("issued_series"),
    /** The issuer's own number. Never allocated by Voyant. */
    issuedNumber: text("issued_number"),
    /** The date the issuer put on the document. */
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_booking_documents_booking").on(table.bookingId),
    index("idx_booking_documents_booking_created").on(table.bookingId, table.createdAt),
    index("idx_booking_documents_traveler").on(table.travelerId),
    // A commercial document is only auditable if it says which document it
    // is, so the kinds that stand in for issued paperwork must carry the
    // issuer's number and date. Enforced here rather than in the route so no
    // writer can bypass it.
    check(
      "ck_booking_documents_issued_identity",
      sql`${table.type} NOT IN ('contract', 'invoice', 'proforma', 'credit_note') OR (${table.issuedNumber} IS NOT NULL AND ${table.issuedAt} IS NOT NULL)`,
    ),
    // Recording the same issued document twice would double it in the
    // booking's audit trail. The key is the document's whole identity, not
    // just its number: two issuers can both number an invoice 1042, and a
    // series-less issuer reuses numbers across years. `coalesce` because
    // issuer, series, and date are individually optional and PostgreSQL
    // treats NULLs as distinct in a unique index.
    uniqueIndex("uq_booking_documents_issued_identity")
      .on(
        table.bookingId,
        table.type,
        // agent-quality: raw-sql reviewed -- owner: bookings; the expressions interpolate Drizzle column references only.
        sql`coalesce(${table.issuedBy}, '')`,
        sql`coalesce(${table.issuedSeries}, '')`,
        table.issuedNumber,
        sql`coalesce(${table.issuedAt}, '-infinity'::timestamptz)`,
      )
      .where(sql`${table.issuedNumber} IS NOT NULL`),
  ],
)

export type BookingSupplierStatus = typeof bookingSupplierStatuses.$inferSelect
export type NewBookingSupplierStatus = typeof bookingSupplierStatuses.$inferInsert
export type BookingActivity = typeof bookingActivityLog.$inferSelect
export type NewBookingActivity = typeof bookingActivityLog.$inferInsert
export type BookingNote = typeof bookingNotes.$inferSelect
export type NewBookingNote = typeof bookingNotes.$inferInsert
export type BookingDocument = typeof bookingDocuments.$inferSelect
export type NewBookingDocument = typeof bookingDocuments.$inferInsert
