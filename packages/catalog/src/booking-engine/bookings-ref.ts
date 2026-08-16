import { date, integer, pgTable, text } from "drizzle-orm/pg-core"

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
  /**
   * The persisted total and departure, read back after the Booking is written
   * so the collection plan is measured against what the Booking actually
   * records rather than against the Quote's own arithmetic. Finance reconciles
   * tax and extra lines while creating the Booking, so `sellAmountCents` is not
   * always the Quote total, and a schedule computed from the Quote can fail to
   * sum to the Booking it belongs to.
   */
  sellAmountCents: integer("sell_amount_cents"),
  startDate: date("start_date"),
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
