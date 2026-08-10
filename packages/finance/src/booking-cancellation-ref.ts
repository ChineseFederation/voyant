import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

/** Narrow Finance read view of the booking facts needed to settle a cancellation refund. */
export const bookingCancellationRef = pgTable("bookings", {
  id: text("id").notNull(),
  bookingNumber: text("booking_number").notNull(),
  status: text("status").notNull(),
})

/** Durable sale-time entitlement written by the Bookings cancellation command. */
export const bookingCancellationActivityRef = pgTable("booking_activity_log", {
  id: text("id").notNull(),
  bookingId: text("booking_id").notNull(),
  activityType: text("activity_type").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
})
