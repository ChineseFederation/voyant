import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { sql } from "drizzle-orm"
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

export const availabilitySlotStatusEnum = pgEnum("availability_slot_status", [
  "open",
  "closed",
  "sold_out",
  "cancelled",
])

export const meetingModeEnum = pgEnum("meeting_mode", [
  "meeting_only",
  "pickup_only",
  "meet_or_pickup",
])

export const pickupGroupKindEnum = pgEnum("pickup_group_kind", ["pickup", "dropoff", "meeting"])

export const pickupTimingModeEnum = pgEnum("pickup_timing_mode", [
  "fixed_time",
  "offset_from_start",
])

export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: typeId("availability_rules"),
    productId: text("product_id").notNull(),
    optionId: text("option_id"),
    facilityId: text("facility_id"),
    timezone: text("timezone").notNull(),
    recurrenceRule: text("recurrence_rule").notNull(),
    maxCapacity: integer("max_capacity").notNull(),
    maxPickupCapacity: integer("max_pickup_capacity"),
    minTotalPax: integer("min_total_pax"),
    cutoffMinutes: integer("cutoff_minutes"),
    earlyBookingLimitMinutes: integer("early_booking_limit_minutes"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_availability_rules_updated").on(table.updatedAt),
    index("idx_availability_rules_product_updated").on(table.productId, table.updatedAt),
    index("idx_availability_rules_option_updated").on(table.optionId, table.updatedAt),
    index("idx_availability_rules_facility_updated").on(table.facilityId, table.updatedAt),
    index("idx_availability_rules_active_updated").on(table.active, table.updatedAt),
  ],
)

export const availabilityStartTimes = pgTable(
  "availability_start_times",
  {
    id: typeId("availability_start_times"),
    productId: text("product_id").notNull(),
    optionId: text("option_id"),
    facilityId: text("facility_id"),
    label: text("label"),
    startTimeLocal: text("start_time_local").notNull(),
    durationMinutes: integer("duration_minutes"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_availability_start_times_product_sort_created").on(
      table.productId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_availability_start_times_option_sort_created").on(
      table.optionId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_availability_start_times_facility_sort_created").on(
      table.facilityId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_availability_start_times_active_sort_created").on(
      table.active,
      table.sortOrder,
      table.createdAt,
    ),
  ],
)

export const availabilitySlots = pgTable(
  "availability_slots",
  {
    id: typeId("availability_slots"),
    productId: text("product_id").notNull(),
    /**
     * The immutable Product Version this departure was materialized from.
     *
     * A departure must be able to name the exact Product definition it was
     * sold against, and later Product edits must not silently rewrite it
     * (#4032, under the model accepted in #4027).
     *
     * A soft reference, deliberately: `product_versions` is owned by Inventory
     * and a cross-domain foreign key would violate schema discipline. It stays
     * a plain text column exactly like `product_id` above.
     *
     * Nullable, because slots created before this column existed have no
     * recorded version. Those legacy rows are reported for operator review
     * rather than being assigned a version by inference — guessing which
     * definition an already-sold departure ran under is worse than admitting
     * it is unknown.
     */
    productVersionId: text("product_version_id"),
    itineraryId: text("itinerary_id"),
    optionId: text("option_id"),
    facilityId: text("facility_id"),
    availabilityRuleId: typeIdRef("availability_rule_id").references(() => availabilityRules.id, {
      onDelete: "set null",
    }),
    startTimeId: typeIdRef("start_time_id").references(() => availabilityStartTimes.id, {
      onDelete: "set null",
    }),
    dateLocal: date("date_local").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    timezone: text("timezone").notNull(),
    status: availabilitySlotStatusEnum("status").notNull().default("open"),
    unlimited: boolean("unlimited").notNull().default(false),
    initialPax: integer("initial_pax"),
    remainingPax: integer("remaining_pax"),
    initialPickups: integer("initial_pickups"),
    remainingPickups: integer("remaining_pickups"),
    remainingResources: integer("remaining_resources"),
    pastCutoff: boolean("past_cutoff").notNull().default(false),
    tooEarly: boolean("too_early").notNull().default(false),
    nights: integer("nights"),
    days: integer("days"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_availability_slots_product_starts_at").on(table.productId, table.startsAt),
    // Backs both directions of the version binding: "which departures ran on
    // this version" (impact preview before a Product edit) and the legacy
    // report's scan for departures with no version recorded.
    index("idx_availability_slots_product_version").on(table.productVersionId),
    index("idx_availability_slots_itinerary_starts_at").on(table.itineraryId, table.startsAt),
    index("idx_availability_slots_option_starts_at").on(table.optionId, table.startsAt),
    index("idx_availability_slots_facility_starts_at").on(table.facilityId, table.startsAt),
    index("idx_availability_slots_rule_starts_at").on(table.availabilityRuleId, table.startsAt),
    index("idx_availability_slots_start_time_starts_at").on(table.startTimeId, table.startsAt),
    index("idx_availability_slots_date_starts_at").on(table.dateLocal, table.startsAt),
    index("idx_availability_slots_status_starts_at").on(table.status, table.startsAt),
    // Bare starts_at index for date-range scans that don't lead with a
    // product/status column (dashboard aggregates' from..to window).
    index("idx_availability_slots_starts_at").on(table.startsAt),
  ],
)

export const availabilityCloseouts = pgTable(
  "availability_closeouts",
  {
    id: typeId("availability_closeouts"),
    productId: text("product_id").notNull(),
    slotId: typeIdRef("slot_id").references(() => availabilitySlots.id, { onDelete: "set null" }),
    dateLocal: date("date_local").notNull(),
    reason: text("reason"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_availability_closeouts_product_created").on(table.productId, table.createdAt),
    index("idx_availability_closeouts_slot_created").on(table.slotId, table.createdAt),
    index("idx_availability_closeouts_date_created").on(table.dateLocal, table.createdAt),
  ],
)

export const allocationResources = pgTable(
  "allocation_resources",
  {
    id: typeId("allocation_resources"),
    slotId: typeIdRef("slot_id")
      .notNull()
      .references(() => availabilitySlots.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    refType: text("ref_type"),
    refId: text("ref_id"),
    label: text("label"),
    capacity: integer("capacity").notNull(),
    flags: jsonb("flags").$type<Record<string, unknown>>().notNull().default({}),
    parentId: text("parent_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_allocation_resources_slot_kind").on(table.slotId, table.kind),
    index("idx_allocation_resources_parent").on(table.parentId),
    index("idx_allocation_resources_kind_sort").on(table.kind, table.sortOrder, table.createdAt),
  ],
)

export const sharingGroupLabels = pgTable("sharing_group_labels", {
  groupId: text("group_id").primaryKey(),
  label: text("label").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const allocationAuditLog = pgTable(
  "allocation_audit_log",
  {
    id: typeId("allocation_audit_log"),
    slotId: typeIdRef("slot_id")
      .notNull()
      .references(() => availabilitySlots.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    actorId: text("actor_id"),
    travelerId: text("traveler_id"),
    resourceId: text("resource_id"),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_allocation_audit_slot_created").on(table.slotId, table.createdAt),
    index("idx_allocation_audit_traveler").on(table.travelerId),
  ],
)

export const productOptionResourceTemplates = pgTable(
  "product_option_resource_templates",
  {
    id: typeId("product_option_resource_templates"),
    productOptionId: text("product_option_id").notNull(),
    kind: text("kind").notNull(),
    refType: text("ref_type"),
    refId: text("ref_id"),
    capacity: integer("capacity").notNull(),
    namePattern: text("name_pattern").notNull(),
    layout: text("layout"),
    /**
     * How many resources to instantiate per slot when auto-materialising
     * from this template (e.g. "5 SGL, 20 DBL"). Null skips the
     * template during slot-publish auto-seed — admins must seed those
     * resources manually or via `autoMaterializeAllocationResources`
     * once bookings exist.
     */
    defaultCount: integer("default_count"),
    flags: jsonb("flags").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Unique per (option, kind, ref) — `COALESCE(ref_id,'')` keeps "one
    // non-ref template per kind" while allowing multiple unit-keyed room
    // templates under one option (Single/Double/Triple all kind="room",
    // distinguished by their option_unit ref). The allocator's option_unit
    // matching depends on this.
    uniqueIndex("idx_product_option_resource_templates_option_kind").on(
      table.productOptionId,
      table.kind,
      // agent-quality: raw-sql reviewed -- owner: availability; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      sql`coalesce(${table.refId}, '')`,
    ),
    index("idx_product_option_resource_templates_kind").on(table.kind, table.createdAt),
  ],
)
