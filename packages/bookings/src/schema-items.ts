import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"

import { bookings, bookingTravelers } from "./schema-core.js"
import {
  bookingAllocationStatusEnum,
  bookingAllocationTypeEnum,
  bookingFulfillmentDeliveryChannelEnum,
  bookingFulfillmentStatusEnum,
  bookingFulfillmentTypeEnum,
  bookingItemParticipantRoleEnum,
  bookingItemStatusEnum,
  bookingItemTypeEnum,
  bookingRedemptionMethodEnum,
} from "./schema-shared.js"

export const bookingItems = pgTable(
  "booking_items",
  {
    id: typeId("booking_items"),
    bookingId: typeIdRef("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    itemType: bookingItemTypeEnum("item_type").notNull().default("unit"),
    status: bookingItemStatusEnum("status").notNull(),
    serviceDate: date("service_date"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    quantity: integer("quantity").notNull().default(1),
    sellCurrency: text("sell_currency").notNull(),
    unitSellAmountCents: integer("unit_sell_amount_cents"),
    totalSellAmountCents: integer("total_sell_amount_cents"),
    costCurrency: text("cost_currency"),
    unitCostAmountCents: integer("unit_cost_amount_cents"),
    totalCostAmountCents: integer("total_cost_amount_cents"),
    notes: text("notes"),
    productId: text("product_id"),
    optionId: text("option_id"),
    optionUnitId: text("option_unit_id"),
    pricingCategoryId: text("pricing_category_id"),
    // Decoupled reference to the departure slot. Plain text (no FK)
    // because availability lives in a different module — see the
    // module-decoupling decision in memory. Dangling when the slot is
    // deleted; the `*Snapshot` columns below preserve what was booked.
    availabilitySlotId: text("availability_slot_id"),
    // Catalog-snapshots taken at item-create time. Authoritative for
    // "what did the customer buy?" — never updated, so operators can
    // always see the booking exactly as it was sold, even if the
    // catalog row was edited/deleted, or if this deployment doesn't
    // mount the catalog plane at all (OTA case).
    productNameSnapshot: text("product_name_snapshot"),
    optionNameSnapshot: text("option_name_snapshot"),
    unitNameSnapshot: text("unit_name_snapshot"),
    // Pre-rendered departure label (e.g. "May 28, 2026 09:00 — Bucharest").
    // `startsAt`/`endsAt` capture the timing but not the start-point or
    // any human context; this column carries the operator-friendly
    // string written at booking time.
    departureLabelSnapshot: text("departure_label_snapshot"),
    sourceSnapshotId: text("source_snapshot_id"),
    sourceOfferId: text("source_offer_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_booking_items_booking").on(table.bookingId),
    index("idx_booking_items_booking_created").on(table.bookingId, table.createdAt),
    index("idx_booking_items_status").on(table.status),
    // cost_currency is optional on items (not every line has cost data) but
    // if any cost amount is set, the currency MUST be set so reporting can
    // interpret it.
    check(
      "ck_booking_items_cost_currency_amounts",
      // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      sql`(${table.unitCostAmountCents} IS NULL AND ${table.totalCostAmountCents} IS NULL) OR ${table.costCurrency} IS NOT NULL`,
    ),
  ],
)

export const bookingAllocations = pgTable(
  "booking_allocations",
  {
    id: typeId("booking_allocations"),
    bookingId: typeIdRef("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    bookingItemId: typeIdRef("booking_item_id")
      .notNull()
      .references(() => bookingItems.id, { onDelete: "cascade" }),
    productId: text("product_id"),
    optionId: text("option_id"),
    optionUnitId: text("option_unit_id"),
    pricingCategoryId: text("pricing_category_id"),
    // Plain id (indexed below), not a hard cross-package FK — availability_slots
    // is owned by @voyant-travel/operations; bookings references it loosely
    // per module decoupling.
    availabilitySlotId: typeIdRef("availability_slot_id"),
    quantity: integer("quantity").notNull().default(1),
    allocationType: bookingAllocationTypeEnum("allocation_type").notNull().default("unit"),
    status: bookingAllocationStatusEnum("status").notNull().default("held"),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_booking_allocations_booking").on(table.bookingId),
    index("idx_booking_allocations_booking_created").on(table.bookingId, table.createdAt),
    index("idx_booking_allocations_item").on(table.bookingItemId),
    index("idx_booking_allocations_slot").on(table.availabilitySlotId),
    index("idx_booking_allocations_status").on(table.status),
  ],
)

export const bookingFulfillments = pgTable(
  "booking_fulfillments",
  {
    id: typeId("booking_fulfillments"),
    bookingId: typeIdRef("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    bookingItemId: typeIdRef("booking_item_id").references(() => bookingItems.id, {
      onDelete: "set null",
    }),
    travelerId: typeIdRef("traveler_id").references(() => bookingTravelers.id, {
      onDelete: "set null",
    }),
    fulfillmentType: bookingFulfillmentTypeEnum("fulfillment_type").notNull(),
    deliveryChannel: bookingFulfillmentDeliveryChannelEnum("delivery_channel").notNull(),
    status: bookingFulfillmentStatusEnum("status").notNull().default("pending"),
    artifactUrl: text("artifact_url"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_booking_fulfillments_booking").on(table.bookingId),
    index("idx_booking_fulfillments_booking_created").on(table.bookingId, table.createdAt),
    index("idx_booking_fulfillments_item").on(table.bookingItemId),
    index("idx_booking_fulfillments_traveler").on(table.travelerId),
    index("idx_booking_fulfillments_status").on(table.status),
  ],
)

export const bookingRedemptionEvents = pgTable(
  "booking_redemption_events",
  {
    id: typeId("booking_redemption_events"),
    bookingId: typeIdRef("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    bookingItemId: typeIdRef("booking_item_id").references(() => bookingItems.id, {
      onDelete: "set null",
    }),
    travelerId: typeIdRef("traveler_id").references(() => bookingTravelers.id, {
      onDelete: "set null",
    }),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
    redeemedBy: text("redeemed_by"),
    location: text("location"),
    method: bookingRedemptionMethodEnum("method").notNull().default("manual"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_booking_redemption_events_booking").on(table.bookingId),
    index("idx_booking_redemption_events_booking_redeemed_created").on(
      table.bookingId,
      table.redeemedAt,
      table.createdAt,
    ),
    index("idx_booking_redemption_events_item").on(table.bookingItemId),
    index("idx_booking_redemption_events_traveler").on(table.travelerId),
    index("idx_booking_redemption_events_redeemed_at").on(table.redeemedAt),
  ],
)

export const bookingItemTravelers = pgTable(
  "booking_item_travelers",
  {
    id: typeId("booking_item_travelers"),
    bookingItemId: typeIdRef("booking_item_id")
      .notNull()
      .references(() => bookingItems.id, { onDelete: "cascade" }),
    travelerId: typeIdRef("traveler_id")
      .notNull()
      .references(() => bookingTravelers.id, { onDelete: "cascade" }),
    role: bookingItemParticipantRoleEnum("role").notNull().default("traveler"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_booking_item_travelers_item").on(table.bookingItemId),
    index("idx_booking_item_travelers_item_primary_created").on(
      table.bookingItemId,
      table.isPrimary,
      table.createdAt,
    ),
    index("idx_booking_item_travelers_traveler").on(table.travelerId),
  ],
)

export type BookingItem = typeof bookingItems.$inferSelect
export type NewBookingItem = typeof bookingItems.$inferInsert
export type BookingAllocation = typeof bookingAllocations.$inferSelect
export type NewBookingAllocation = typeof bookingAllocations.$inferInsert
export type BookingFulfillment = typeof bookingFulfillments.$inferSelect
export type NewBookingFulfillment = typeof bookingFulfillments.$inferInsert
export type BookingRedemptionEvent = typeof bookingRedemptionEvents.$inferSelect
export type NewBookingRedemptionEvent = typeof bookingRedemptionEvents.$inferInsert
export type BookingItemTraveler = typeof bookingItemTravelers.$inferSelect
export type NewBookingItemTraveler = typeof bookingItemTravelers.$inferInsert
