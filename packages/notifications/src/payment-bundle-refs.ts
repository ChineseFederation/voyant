import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"

/**
 * Minimal read-only references used to assemble and retry the post-payment
 * document bundle. These deliberately carry no foreign keys: Notifications
 * observes document readiness without taking ownership of the source tables.
 */
export const bookingItemsRef = pgTable("booking_items", {
  bookingId: text("booking_id").notNull(),
  productId: text("product_id"),
})

export const paymentSessionsRef = pgTable("payment_sessions", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id"),
  status: text("status").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

export const invoicesRef = pgTable("invoices", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id").notNull(),
})

export const contractsRef = pgTable("contracts", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id"),
})

export const productMediaRef = pgTable("product_media", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  storageKey: text("storage_key"),
  mimeType: text("mime_type"),
  isBrochure: boolean("is_brochure").notNull(),
  isBrochureCurrent: boolean("is_brochure_current").notNull(),
  brochureVersion: integer("brochure_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
})
