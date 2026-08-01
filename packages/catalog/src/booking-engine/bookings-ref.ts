import { integer, pgTable, text } from "drizzle-orm/pg-core"

/**
 * Narrow local mirrors of the Booking-owned tables used while materializing an
 * owned Booking. They deliberately carry no foreign keys or generated values:
 * Catalog coordinates the transaction, but Bookings remains the schema owner.
 */
export const bookingsRef = pgTable("bookings", {
  id: text("id").notNull(),
  bookingNumber: text("booking_number").notNull(),
  status: text("status").notNull(),
  sellCurrency: text("sell_currency").notNull(),
})

export const bookingItemsRef = pgTable("booking_items", {
  id: text("id").notNull(),
  bookingId: text("booking_id").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  sellCurrency: text("sell_currency").notNull(),
  productId: text("product_id"),
})

export const bookingAllocationsRef = pgTable("booking_allocations", {
  id: text("id").notNull(),
  bookingId: text("booking_id").notNull(),
  bookingItemId: text("booking_item_id").notNull(),
  quantity: integer("quantity").notNull(),
  status: text("status").notNull(),
})
