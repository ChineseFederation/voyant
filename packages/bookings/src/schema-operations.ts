import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

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
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_booking_documents_booking").on(table.bookingId),
    index("idx_booking_documents_booking_created").on(table.bookingId, table.createdAt),
    index("idx_booking_documents_traveler").on(table.travelerId),
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
