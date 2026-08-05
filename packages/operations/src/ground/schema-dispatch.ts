import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { identityAddresses } from "@voyant-travel/identity/schema"
import { boolean, date, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"

import { groundDrivers, groundOperators, groundVehicles } from "./schema-operators.js"
import {
  groundDispatchStatusEnum,
  groundServiceLevelEnum,
  groundVehicleCategoryEnum,
  groundVehicleClassEnum,
} from "./schema-shared.js"

export const groundTransferPreferences = pgTable(
  "ground_transfer_preferences",
  {
    id: typeId("ground_transfer_preferences"),
    bookingId: text("booking_id").notNull(),
    bookingItemId: text("booking_item_id"),
    pickupFacilityId: typeIdRef("pickup_facility_id"),
    dropoffFacilityId: typeIdRef("dropoff_facility_id"),
    // Cross-package FK into identity, allowed because operations declares
    // "@voyant-travel/identity" in voyant.requiresSchemas — see
    // docs/architecture/schema-discipline.md. identity_addresses is hard-deleted
    // (deleteAddress in packages/identity/src/service.ts, no deletedAt column),
    // so `set null` is what stops these columns holding a dangling id.
    pickupAddressId: typeIdRef("pickup_address_id").references(() => identityAddresses.id, {
      onDelete: "set null",
    }),
    dropoffAddressId: typeIdRef("dropoff_address_id").references(() => identityAddresses.id, {
      onDelete: "set null",
    }),
    requestedVehicleCategory: groundVehicleCategoryEnum("requested_vehicle_category"),
    requestedVehicleClass: groundVehicleClassEnum("requested_vehicle_class"),
    serviceLevel: groundServiceLevelEnum("service_level").notNull().default("private"),
    passengerCount: integer("passenger_count"),
    checkedBags: integer("checked_bags"),
    carryOnBags: integer("carry_on_bags"),
    wheelchairCount: integer("wheelchair_count"),
    childSeatCount: integer("child_seat_count"),
    driverLanguage: text("driver_language"),
    meetAndGreet: boolean("meet_and_greet").notNull().default(false),
    accessibilityNotes: text("accessibility_notes"),
    pickupNotes: text("pickup_notes"),
    dropoffNotes: text("dropoff_notes"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_ground_transfer_preferences_booking_created").on(table.bookingId, table.createdAt),
    index("idx_ground_transfer_preferences_booking_item_created").on(
      table.bookingItemId,
      table.createdAt,
    ),
    index("idx_ground_transfer_preferences_pickup_facility_created").on(
      table.pickupFacilityId,
      table.createdAt,
    ),
    index("idx_ground_transfer_preferences_dropoff_facility_created").on(
      table.dropoffFacilityId,
      table.createdAt,
    ),
    index("idx_ground_transfer_preferences_service_level_created").on(
      table.serviceLevel,
      table.createdAt,
    ),
  ],
)

export const groundDispatches = pgTable(
  "ground_dispatches",
  {
    id: typeId("ground_dispatches"),
    transferPreferenceId: typeIdRef("transfer_preference_id")
      .notNull()
      .references(() => groundTransferPreferences.id, { onDelete: "cascade" }),
    bookingId: text("booking_id").notNull(),
    bookingItemId: text("booking_item_id"),
    operatorId: typeIdRef("operator_id").references(() => groundOperators.id, {
      onDelete: "set null",
    }),
    vehicleId: typeIdRef("vehicle_id").references(() => groundVehicles.id, {
      onDelete: "set null",
    }),
    driverId: typeIdRef("driver_id").references(() => groundDrivers.id, { onDelete: "set null" }),
    serviceDate: date("service_date"),
    scheduledPickupAt: timestamp("scheduled_pickup_at", { withTimezone: true }),
    scheduledDropoffAt: timestamp("scheduled_dropoff_at", { withTimezone: true }),
    actualPickupAt: timestamp("actual_pickup_at", { withTimezone: true }),
    actualDropoffAt: timestamp("actual_dropoff_at", { withTimezone: true }),
    status: groundDispatchStatusEnum("status").notNull().default("draft"),
    passengerCount: integer("passenger_count"),
    checkedBags: integer("checked_bags"),
    carryOnBags: integer("carry_on_bags"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_ground_dispatches_preference_service_date_created").on(
      table.transferPreferenceId,
      table.serviceDate,
      table.createdAt,
    ),
    index("idx_ground_dispatches_booking_service_date_created").on(
      table.bookingId,
      table.serviceDate,
      table.createdAt,
    ),
    index("idx_ground_dispatches_booking_item_service_date_created").on(
      table.bookingItemId,
      table.serviceDate,
      table.createdAt,
    ),
    index("idx_ground_dispatches_operator_service_date_created").on(
      table.operatorId,
      table.serviceDate,
      table.createdAt,
    ),
    index("idx_ground_dispatches_vehicle_service_date_created").on(
      table.vehicleId,
      table.serviceDate,
      table.createdAt,
    ),
    index("idx_ground_dispatches_driver_service_date_created").on(
      table.driverId,
      table.serviceDate,
      table.createdAt,
    ),
    index("idx_ground_dispatches_status_service_date_created").on(
      table.status,
      table.serviceDate,
      table.createdAt,
    ),
    index("idx_ground_dispatches_service_date_created").on(table.serviceDate, table.createdAt),
  ],
)

export type GroundTransferPreference = typeof groundTransferPreferences.$inferSelect
export type NewGroundTransferPreference = typeof groundTransferPreferences.$inferInsert
export type GroundDispatch = typeof groundDispatches.$inferSelect
export type NewGroundDispatch = typeof groundDispatches.$inferInsert
