import { bookingItems } from "@voyant-travel/bookings/schema"
import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import { mealPlans, ratePlans, roomTypes } from "./schema-inventory.js"
import { stayBookingItemStatusEnum } from "./schema-shared.js"

export const stayBookingItems = pgTable(
  "stay_booking_items",
  {
    id: typeId("stay_booking_items"),
    // The vertical-extension case from docs/architecture/schema-discipline.md:
    // stay_booking_items is a required per-item extension of booking_items, the
    // column is notNull, and accommodations depends on bookings one-way and is
    // never used without it. accommodations declares "@voyant-travel/bookings"
    // in voyant.requiresSchemas, so migrations are ordered and `cascade` keeps
    // the extension row from outliving the item it extends.
    bookingItemId: typeIdRef("booking_item_id")
      .notNull()
      .references(() => bookingItems.id, { onDelete: "cascade" }),
    propertyId: typeIdRef("property_id").notNull(),
    roomTypeId: typeIdRef("room_type_id")
      .notNull()
      .references(() => roomTypes.id, { onDelete: "cascade" }),
    supplierRoomRef: text("supplier_room_ref"),
    ratePlanId: typeIdRef("rate_plan_id")
      .notNull()
      .references(() => ratePlans.id, { onDelete: "cascade" }),
    checkInDate: date("check_in_date").notNull(),
    checkOutDate: date("check_out_date").notNull(),
    nightCount: integer("night_count").notNull().default(1),
    roomCount: integer("room_count").notNull().default(1),
    adults: integer("adults").notNull().default(1),
    children: integer("children").notNull().default(0),
    infants: integer("infants").notNull().default(0),
    mealPlanId: typeIdRef("meal_plan_id").references(() => mealPlans.id, { onDelete: "set null" }),
    confirmationCode: text("confirmation_code"),
    voucherCode: text("voucher_code"),
    status: stayBookingItemStatusEnum("status").notNull().default("reserved"),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_stay_booking_items_booking_item").on(table.bookingItemId),
    index("idx_stay_booking_items_check_in").on(table.checkInDate),
    index("idx_stay_booking_items_property_check_in").on(table.propertyId, table.checkInDate),
    index("idx_stay_booking_items_room_type_check_in").on(table.roomTypeId, table.checkInDate),
    index("idx_stay_booking_items_rate_plan_check_in").on(table.ratePlanId, table.checkInDate),
    index("idx_stay_booking_items_status_check_in").on(table.status, table.checkInDate),
    uniqueIndex("uidx_stay_booking_items_booking_item").on(table.bookingItemId),
  ],
)

export const stayDailyRates = pgTable(
  "stay_daily_rates",
  {
    id: typeId("stay_daily_rates"),
    stayBookingItemId: typeIdRef("stay_booking_item_id")
      .notNull()
      .references(() => stayBookingItems.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    sellCurrency: text("sell_currency").notNull(),
    sellAmountCents: integer("sell_amount_cents"),
    costCurrency: text("cost_currency"),
    costAmountCents: integer("cost_amount_cents"),
    taxAmountCents: integer("tax_amount_cents"),
    feeAmountCents: integer("fee_amount_cents"),
    commissionAmountCents: integer("commission_amount_cents"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_stay_daily_rates_stay_booking_item").on(table.stayBookingItemId),
    index("idx_stay_daily_rates_date").on(table.date),
    uniqueIndex("uidx_stay_daily_rates_item_date").on(table.stayBookingItemId, table.date),
  ],
)

export type StayBookingItem = typeof stayBookingItems.$inferSelect
export type NewStayBookingItem = typeof stayBookingItems.$inferInsert
export type StayDailyRate = typeof stayDailyRates.$inferSelect
export type NewStayDailyRate = typeof stayDailyRates.$inferInsert
