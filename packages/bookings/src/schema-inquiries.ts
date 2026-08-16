import { typeId } from "@voyant-travel/db/lib/typeid-column"
import { sql } from "drizzle-orm"
import { check, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

export const bookingInquiries = pgTable(
  "booking_inquiries",
  {
    id: typeId("booking_inquiries"),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    channelId: text("channel_id").notNull(),
    productId: text("product_id").notNull(),
    departureId: text("departure_id"),
    contactFirstName: text("contact_first_name"),
    contactLastName: text("contact_last_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    locale: text("locale").notNull(),
    message: text("message").notNull(),
    status: text("status").$type<"open" | "closed">().notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("ck_booking_inquiries_status", sql`${table.status} IN ('open', 'closed')`),
    uniqueIndex("uq_booking_inquiries_channel_idempotency").on(
      table.channelId,
      table.idempotencyKey,
    ),
    index("idx_booking_inquiries_status_created").on(table.status, table.createdAt),
    index("idx_booking_inquiries_product").on(table.productId),
    index("idx_booking_inquiries_departure").on(table.departureId),
  ],
)

export type BookingInquiry = typeof bookingInquiries.$inferSelect
export type NewBookingInquiry = typeof bookingInquiries.$inferInsert
