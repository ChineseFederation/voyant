import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { priceCatalogs, priceSchedules } from "./schema-catalogs.js"
import { pricingCategories } from "./schema-categories.js"
import { cancellationPolicies } from "./schema-policies.js"
import {
  addonPricingModeEnum,
  occupancyPriceBasisEnum,
  optionPricingModeEnum,
  optionStartTimeRuleModeEnum,
  optionUnitPricingModeEnum,
  priceAdjustmentTypeEnum,
} from "./schema-shared.js"

export const optionPriceRules = pgTable(
  "option_price_rules",
  {
    id: typeId("option_price_rules"),
    productId: text("product_id").notNull(),
    optionId: text("option_id").notNull(),
    priceCatalogId: typeIdRef("price_catalog_id")
      .notNull()
      .references(() => priceCatalogs.id, { onDelete: "cascade" }),
    priceScheduleId: typeIdRef("price_schedule_id").references(() => priceSchedules.id, {
      onDelete: "set null",
    }),
    cancellationPolicyId: typeIdRef("cancellation_policy_id").references(
      () => cancellationPolicies.id,
      { onDelete: "set null" },
    ),
    code: text("code"),
    name: text("name").notNull(),
    description: text("description"),
    pricingMode: optionPricingModeEnum("pricing_mode").notNull().default("per_person"),
    occupancyPriceBasis: occupancyPriceBasisEnum("occupancy_price_basis"),
    baseSellAmountCents: integer("base_sell_amount_cents"),
    baseCostAmountCents: integer("base_cost_amount_cents"),
    minPerBooking: integer("min_per_booking"),
    maxPerBooking: integer("max_per_booking"),
    allPricingCategories: boolean("all_pricing_categories").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    active: boolean("active").notNull().default(true),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_option_price_rules_updated").on(table.updatedAt),
    index("idx_option_price_rules_product_updated").on(table.productId, table.updatedAt),
    index("idx_option_price_rules_option_updated").on(table.optionId, table.updatedAt),
    index("idx_option_price_rules_catalog_updated").on(table.priceCatalogId, table.updatedAt),
    index("idx_option_price_rules_schedule_updated").on(table.priceScheduleId, table.updatedAt),
    index("idx_option_price_rules_policy_updated").on(table.cancellationPolicyId, table.updatedAt),
    index("idx_option_price_rules_pricing_mode_updated").on(table.pricingMode, table.updatedAt),
    index("idx_option_price_rules_active_updated").on(table.active, table.updatedAt),
    uniqueIndex("uidx_option_price_rules_option_code").on(table.optionId, table.code),
  ],
)

export const optionUnitPriceRules = pgTable(
  "option_unit_price_rules",
  {
    id: typeId("option_unit_price_rules"),
    optionPriceRuleId: typeIdRef("option_price_rule_id")
      .notNull()
      .references(() => optionPriceRules.id, { onDelete: "cascade" }),
    optionId: text("option_id").notNull(),
    unitId: text("unit_id").notNull(),
    pricingCategoryId: typeIdRef("pricing_category_id").references(() => pricingCategories.id, {
      onDelete: "set null",
    }),
    pricingMode: optionUnitPricingModeEnum("pricing_mode").notNull().default("per_unit"),
    sellAmountCents: integer("sell_amount_cents"),
    costAmountCents: integer("cost_amount_cents"),
    minQuantity: integer("min_quantity"),
    maxQuantity: integer("max_quantity"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_option_unit_price_rules_rule_sort_created").on(
      table.optionPriceRuleId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_option_unit_price_rules_option_sort_created").on(
      table.optionId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_option_unit_price_rules_unit_sort_created").on(
      table.unitId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_option_unit_price_rules_category_sort_created").on(
      table.pricingCategoryId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_option_unit_price_rules_active_sort_created").on(
      table.active,
      table.sortOrder,
      table.createdAt,
    ),
  ],
)

export const optionStartTimeRules = pgTable(
  "option_start_time_rules",
  {
    id: typeId("option_start_time_rules"),
    optionPriceRuleId: typeIdRef("option_price_rule_id")
      .notNull()
      .references(() => optionPriceRules.id, { onDelete: "cascade" }),
    optionId: text("option_id").notNull(),
    startTimeId: text("start_time_id").notNull(),
    ruleMode: optionStartTimeRuleModeEnum("rule_mode").notNull().default("included"),
    adjustmentType: priceAdjustmentTypeEnum("adjustment_type"),
    sellAdjustmentCents: integer("sell_adjustment_cents"),
    costAdjustmentCents: integer("cost_adjustment_cents"),
    adjustmentBasisPoints: integer("adjustment_basis_points"),
    active: boolean("active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_option_start_time_rules_created").on(table.createdAt),
    index("idx_option_start_time_rules_rule_created").on(table.optionPriceRuleId, table.createdAt),
    index("idx_option_start_time_rules_option_created").on(table.optionId, table.createdAt),
    index("idx_option_start_time_rules_start_time_created").on(table.startTimeId, table.createdAt),
    index("idx_option_start_time_rules_active_created").on(table.active, table.createdAt),
    uniqueIndex("uidx_option_start_time_rules_rule_start_time").on(
      table.optionPriceRuleId,
      table.startTimeId,
    ),
  ],
)

export const optionUnitTiers = pgTable(
  "option_unit_tiers",
  {
    id: typeId("option_unit_tiers"),
    optionUnitPriceRuleId: typeIdRef("option_unit_price_rule_id")
      .notNull()
      .references(() => optionUnitPriceRules.id, { onDelete: "cascade" }),
    minQuantity: integer("min_quantity").notNull(),
    maxQuantity: integer("max_quantity"),
    sellAmountCents: integer("sell_amount_cents"),
    costAmountCents: integer("cost_amount_cents"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_option_unit_tiers_rule_sort_min_quantity").on(
      table.optionUnitPriceRuleId,
      table.sortOrder,
      table.minQuantity,
    ),
    index("idx_option_unit_tiers_active_sort_min_quantity").on(
      table.active,
      table.sortOrder,
      table.minQuantity,
    ),
  ],
)

export const pickupPriceRules = pgTable(
  "pickup_price_rules",
  {
    id: typeId("pickup_price_rules"),
    optionPriceRuleId: typeIdRef("option_price_rule_id")
      .notNull()
      .references(() => optionPriceRules.id, { onDelete: "cascade" }),
    optionId: text("option_id").notNull(),
    pickupPointId: text("pickup_point_id").notNull(),
    pricingMode: addonPricingModeEnum("pricing_mode").notNull().default("included"),
    sellAmountCents: integer("sell_amount_cents"),
    costAmountCents: integer("cost_amount_cents"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_pickup_price_rules_rule_sort_created").on(
      table.optionPriceRuleId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_pickup_price_rules_option_sort_created").on(
      table.optionId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_pickup_price_rules_pickup_sort_created").on(
      table.pickupPointId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_pickup_price_rules_active_sort_created").on(
      table.active,
      table.sortOrder,
      table.createdAt,
    ),
    uniqueIndex("uidx_pickup_price_rules_rule_pickup").on(
      table.optionPriceRuleId,
      table.pickupPointId,
    ),
  ],
)

export const dropoffPriceRules = pgTable(
  "dropoff_price_rules",
  {
    id: typeId("dropoff_price_rules"),
    optionPriceRuleId: typeIdRef("option_price_rule_id")
      .notNull()
      .references(() => optionPriceRules.id, { onDelete: "cascade" }),
    optionId: text("option_id").notNull(),
    facilityId: text("facility_id"),
    dropoffCode: text("dropoff_code"),
    dropoffName: text("dropoff_name").notNull(),
    pricingMode: addonPricingModeEnum("pricing_mode").notNull().default("included"),
    sellAmountCents: integer("sell_amount_cents"),
    costAmountCents: integer("cost_amount_cents"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_dropoff_price_rules_rule_sort_created").on(
      table.optionPriceRuleId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_dropoff_price_rules_option_sort_created").on(
      table.optionId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_dropoff_price_rules_facility_sort_created").on(
      table.facilityId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_dropoff_price_rules_active_sort_created").on(
      table.active,
      table.sortOrder,
      table.createdAt,
    ),
  ],
)

export const extraPriceRules = pgTable(
  "extra_price_rules",
  {
    id: typeId("extra_price_rules"),
    optionPriceRuleId: typeIdRef("option_price_rule_id")
      .notNull()
      .references(() => optionPriceRules.id, { onDelete: "cascade" }),
    optionId: text("option_id").notNull(),
    productExtraId: text("product_extra_id"),
    optionExtraConfigId: text("option_extra_config_id"),
    pricingMode: addonPricingModeEnum("pricing_mode").notNull().default("included"),
    sellAmountCents: integer("sell_amount_cents"),
    costAmountCents: integer("cost_amount_cents"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_extra_price_rules_rule_sort_created").on(
      table.optionPriceRuleId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_extra_price_rules_option_sort_created").on(
      table.optionId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_extra_price_rules_product_extra_sort_created").on(
      table.productExtraId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_extra_price_rules_option_extra_config_sort_created").on(
      table.optionExtraConfigId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_extra_price_rules_active_sort_created").on(
      table.active,
      table.sortOrder,
      table.createdAt,
    ),
  ],
)

export type OptionPriceRule = typeof optionPriceRules.$inferSelect
export type NewOptionPriceRule = typeof optionPriceRules.$inferInsert
export type OptionUnitPriceRule = typeof optionUnitPriceRules.$inferSelect
export type NewOptionUnitPriceRule = typeof optionUnitPriceRules.$inferInsert
export type OptionStartTimeRule = typeof optionStartTimeRules.$inferSelect
export type NewOptionStartTimeRule = typeof optionStartTimeRules.$inferInsert
export type OptionUnitTier = typeof optionUnitTiers.$inferSelect
export type NewOptionUnitTier = typeof optionUnitTiers.$inferInsert
export type PickupPriceRule = typeof pickupPriceRules.$inferSelect
export type NewPickupPriceRule = typeof pickupPriceRules.$inferInsert
export type DropoffPriceRule = typeof dropoffPriceRules.$inferSelect
export type NewDropoffPriceRule = typeof dropoffPriceRules.$inferInsert
export type ExtraPriceRule = typeof extraPriceRules.$inferSelect
export type NewExtraPriceRule = typeof extraPriceRules.$inferInsert
