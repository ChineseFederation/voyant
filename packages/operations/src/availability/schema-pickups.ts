import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import {
  availabilitySlots,
  availabilityStartTimes,
  meetingModeEnum,
  pickupGroupKindEnum,
  pickupTimingModeEnum,
} from "./schema-core.js"

export const availabilityPickupPoints = pgTable(
  "availability_pickup_points",
  {
    id: typeId("availability_pickup_points"),
    productId: text("product_id").notNull(),
    facilityId: text("facility_id"),
    name: text("name").notNull(),
    description: text("description"),
    locationText: text("location_text"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_availability_pickup_points_created").on(table.createdAt),
    index("idx_availability_pickup_points_product_created").on(table.productId, table.createdAt),
    index("idx_availability_pickup_points_facility_created").on(table.facilityId, table.createdAt),
    index("idx_availability_pickup_points_active_created").on(table.active, table.createdAt),
  ],
)

export const availabilitySlotPickups = pgTable(
  "availability_slot_pickups",
  {
    id: typeId("availability_slot_pickups"),
    slotId: typeIdRef("slot_id")
      .notNull()
      .references(() => availabilitySlots.id, { onDelete: "cascade" }),
    pickupPointId: typeIdRef("pickup_point_id")
      .notNull()
      .references(() => availabilityPickupPoints.id, { onDelete: "cascade" }),
    initialCapacity: integer("initial_capacity"),
    remainingCapacity: integer("remaining_capacity"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_availability_slot_pickups_created").on(table.createdAt),
    index("idx_availability_slot_pickups_slot_created").on(table.slotId, table.createdAt),
    index("idx_availability_slot_pickups_pickup_point_created").on(
      table.pickupPointId,
      table.createdAt,
    ),
  ],
)

export const productMeetingConfigs = pgTable(
  "product_meeting_configs",
  {
    id: typeId("product_meeting_configs"),
    productId: text("product_id").notNull(),
    optionId: text("option_id"),
    facilityId: text("facility_id"),
    mode: meetingModeEnum("mode").notNull().default("meeting_only"),
    allowCustomPickup: boolean("allow_custom_pickup").notNull().default(false),
    allowCustomDropoff: boolean("allow_custom_dropoff").notNull().default(false),
    requiresPickupSelection: boolean("requires_pickup_selection").notNull().default(false),
    requiresDropoffSelection: boolean("requires_dropoff_selection").notNull().default(false),
    usePickupAllotment: boolean("use_pickup_allotment").notNull().default(false),
    meetingInstructions: text("meeting_instructions"),
    pickupInstructions: text("pickup_instructions"),
    dropoffInstructions: text("dropoff_instructions"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_product_meeting_configs_updated").on(table.updatedAt),
    index("idx_product_meeting_configs_product_updated").on(table.productId, table.updatedAt),
    index("idx_product_meeting_configs_option_updated").on(table.optionId, table.updatedAt),
    index("idx_product_meeting_configs_facility_updated").on(table.facilityId, table.updatedAt),
    index("idx_product_meeting_configs_mode_updated").on(table.mode, table.updatedAt),
    index("idx_product_meeting_configs_active_updated").on(table.active, table.updatedAt),
  ],
)

export const pickupGroups = pgTable(
  "pickup_groups",
  {
    id: typeId("pickup_groups"),
    meetingConfigId: typeIdRef("meeting_config_id")
      .notNull()
      .references(() => productMeetingConfigs.id, { onDelete: "cascade" }),
    kind: pickupGroupKindEnum("kind").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_pickup_groups_sort_created").on(table.sortOrder, table.createdAt),
    index("idx_pickup_groups_meeting_config_sort_created").on(
      table.meetingConfigId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_pickup_groups_kind_sort_created").on(table.kind, table.sortOrder, table.createdAt),
    index("idx_pickup_groups_active_sort_created").on(
      table.active,
      table.sortOrder,
      table.createdAt,
    ),
  ],
)

export const pickupLocations = pgTable(
  "pickup_locations",
  {
    id: typeId("pickup_locations"),
    groupId: typeIdRef("group_id")
      .notNull()
      .references(() => pickupGroups.id, { onDelete: "cascade" }),
    facilityId: text("facility_id"),
    name: text("name").notNull(),
    description: text("description"),
    locationText: text("location_text"),
    leadTimeMinutes: integer("lead_time_minutes"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_pickup_locations_sort_created").on(table.sortOrder, table.createdAt),
    index("idx_pickup_locations_group_sort_created").on(
      table.groupId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_pickup_locations_facility_sort_created").on(
      table.facilityId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_pickup_locations_active_sort_created").on(
      table.active,
      table.sortOrder,
      table.createdAt,
    ),
  ],
)

export const locationPickupTimes = pgTable(
  "location_pickup_times",
  {
    id: typeId("location_pickup_times"),
    pickupLocationId: typeIdRef("pickup_location_id")
      .notNull()
      .references(() => pickupLocations.id, { onDelete: "cascade" }),
    slotId: typeIdRef("slot_id").references(() => availabilitySlots.id, { onDelete: "cascade" }),
    startTimeId: typeIdRef("start_time_id").references(() => availabilityStartTimes.id, {
      onDelete: "set null",
    }),
    timingMode: pickupTimingModeEnum("timing_mode").notNull().default("fixed_time"),
    localTime: text("local_time"),
    offsetMinutes: integer("offset_minutes"),
    instructions: text("instructions"),
    initialCapacity: integer("initial_capacity"),
    remainingCapacity: integer("remaining_capacity"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_location_pickup_times_created").on(table.createdAt),
    index("idx_location_pickup_times_pickup_location_created").on(
      table.pickupLocationId,
      table.createdAt,
    ),
    index("idx_location_pickup_times_slot_created").on(table.slotId, table.createdAt),
    index("idx_location_pickup_times_start_time_created").on(table.startTimeId, table.createdAt),
    index("idx_location_pickup_times_active_created").on(table.active, table.createdAt),
  ],
)

export const customPickupAreas = pgTable(
  "custom_pickup_areas",
  {
    id: typeId("custom_pickup_areas"),
    meetingConfigId: typeIdRef("meeting_config_id")
      .notNull()
      .references(() => productMeetingConfigs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    geographicText: text("geographic_text"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_custom_pickup_areas_created").on(table.createdAt),
    index("idx_custom_pickup_areas_meeting_config_created").on(
      table.meetingConfigId,
      table.createdAt,
    ),
    index("idx_custom_pickup_areas_active_created").on(table.active, table.createdAt),
  ],
)
