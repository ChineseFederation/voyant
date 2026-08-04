import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"

export const productsRef = pgTable("products", {
  id: typeId("products").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  description: text("description"),
  visibility: text("visibility").notNull(),
  activated: boolean("activated").notNull().default(false),
  reservationTimeoutMinutes: integer("reservation_timeout_minutes"),
  sellCurrency: text("sell_currency").notNull(),
  sellAmountCents: integer("sell_amount_cents"),
  costAmountCents: integer("cost_amount_cents"),
  marginPercent: integer("margin_percent"),
  supplierId: text("supplier_id"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  pax: integer("pax"),
})

export const suppliersRef = pgTable("suppliers", {
  id: typeId("suppliers").primaryKey(),
  reservationTimeoutMinutes: integer("reservation_timeout_minutes"),
})

export const productOptionsRef = pgTable("product_options", {
  id: typeId("product_options").primaryKey(),
  productId: typeIdRef("product_id").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const productCategoryProductsRef = pgTable(
  "product_category_products",
  {
    productId: typeIdRef("product_id").notNull(),
    categoryId: typeIdRef("category_id").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.productId, table.categoryId] })],
)

export const optionUnitsRef = pgTable("option_units", {
  id: typeId("option_units").primaryKey(),
  optionId: typeIdRef("option_id").notNull(),
  name: text("name").notNull(),
  code: text("code"),
  description: text("description"),
  unitType: text("unit_type"),
  isRequired: boolean("is_required").notNull().default(false),
  isHidden: boolean("is_hidden").notNull().default(false),
  minQuantity: integer("min_quantity"),
  maxQuantity: integer("max_quantity"),
  minAge: integer("min_age"),
  maxAge: integer("max_age"),
  occupancyMin: integer("occupancy_min"),
  occupancyMax: integer("occupancy_max"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const productItinerariesRef = pgTable("product_itineraries", {
  id: typeId("product_itineraries").primaryKey(),
  productId: typeIdRef("product_id").notNull(),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
})

// product_days was re-parented to product_itineraries in products, so the
// historical `product_days.product_id` column no longer exists. Bookings'
// getConvertProductData joins through product_itineraries to keep the
// per-product day lookup working.
export const productDaysRef = pgTable("product_days", {
  id: typeId("product_days").primaryKey(),
  itineraryId: typeIdRef("itinerary_id").notNull(),
  dayNumber: integer("day_number").notNull(),
})

export const productDayServicesRef = pgTable("product_day_services", {
  id: typeId("product_day_services").primaryKey(),
  dayId: typeIdRef("day_id").notNull(),
  supplierServiceId: text("supplier_service_id"),
  serviceType: text("service_type").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  costCurrency: text("cost_currency").notNull(),
  costAmountCents: integer("cost_amount_cents").notNull(),
  quantity: integer("quantity").notNull().default(1),
  sortOrder: integer("sort_order"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

/**
 * DELIBERATE local mirror of `product_versions` (owned by
 * `@voyant-travel/inventory`). Bookings reads only the frozen `snapshot` blob,
 * and only to seed supplier commitments at conversion (voyant#4189) — the
 * immutable Product Version, not the live product, is what a sold departure
 * committed to. Mirrored rather than imported because bookings is a retail-spine
 * package and must not take a runtime dependency on the Inventory authoring
 * runtime (enforced by scripts/check-retail-spine-closure.mjs). The blob is
 * decoded through the shared `@voyant-travel/products-contracts` reader, so the
 * SHAPE of the snapshot is still a contract, not a local guess.
 */
export const productVersionsRef = pgTable("product_versions", {
  id: typeId("product_versions").primaryKey(),
  productId: typeIdRef("product_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  snapshot: jsonb("snapshot").notNull(),
})

export const productTicketSettingsRef = pgTable("product_ticket_settings", {
  id: typeId("product_ticket_settings").primaryKey(),
  productId: typeIdRef("product_id").notNull(),
  fulfillmentMode: text("fulfillment_mode").notNull(),
  defaultDeliveryFormat: text("default_delivery_format").notNull(),
  ticketPerUnit: boolean("ticket_per_unit").notNull().default(false),
})

export const bookingProductDetailsRef = pgTable("booking_product_details", {
  bookingId: text("booking_id").primaryKey(),
  productId: text("product_id"),
  optionId: text("option_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const bookingItemProductDetailsRef = pgTable("booking_item_product_details", {
  bookingItemId: text("booking_item_id").primaryKey(),
  productId: text("product_id"),
  optionId: text("option_id"),
  unitId: text("unit_id"),
  supplierServiceId: text("supplier_service_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
