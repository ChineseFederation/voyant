import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const priceCatalogsRef = pgTable("price_catalogs", {
  id: typeId("price_catalogs").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  currencyCode: text("currency_code"),
  catalogType: text("catalog_type").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  active: boolean("active").notNull().default(true),
})

export const optionPriceRulesRef = pgTable("option_price_rules", {
  id: typeId("option_price_rules").primaryKey(),
  productId: text("product_id").notNull(),
  optionId: text("option_id").notNull(),
  priceCatalogId: typeIdRef("price_catalog_id").notNull(),
  cancellationPolicyId: typeIdRef("cancellation_policy_id"),
  name: text("name").notNull(),
  description: text("description"),
  pricingMode: text("pricing_mode").notNull(),
  occupancyPriceBasis: text("occupancy_price_basis"),
  baseSellAmountCents: integer("base_sell_amount_cents"),
  minPerBooking: integer("min_per_booking"),
  maxPerBooking: integer("max_per_booking"),
  isDefault: boolean("is_default").notNull().default(false),
  active: boolean("active").notNull().default(true),
})

export const optionUnitPriceRulesRef = pgTable("option_unit_price_rules", {
  id: typeId("option_unit_price_rules").primaryKey(),
  optionPriceRuleId: typeIdRef("option_price_rule_id").notNull(),
  optionId: text("option_id").notNull(),
  unitId: text("unit_id").notNull(),
  pricingCategoryId: typeIdRef("pricing_category_id"),
  pricingMode: text("pricing_mode").notNull(),
  sellAmountCents: integer("sell_amount_cents"),
  minQuantity: integer("min_quantity"),
  maxQuantity: integer("max_quantity"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const optionUnitTiersRef = pgTable("option_unit_tiers", {
  id: typeId("option_unit_tiers").primaryKey(),
  optionUnitPriceRuleId: typeIdRef("option_unit_price_rule_id").notNull(),
  minQuantity: integer("min_quantity").notNull(),
  maxQuantity: integer("max_quantity"),
  sellAmountCents: integer("sell_amount_cents"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
})

export const pricingCategoriesRef = pgTable("pricing_categories", {
  id: typeId("pricing_categories").primaryKey(),
  productId: text("product_id"),
  optionId: text("option_id"),
  unitId: text("unit_id"),
  code: text("code"),
  name: text("name").notNull(),
  categoryType: text("category_type").notNull(),
  seatOccupancy: integer("seat_occupancy").notNull().default(1),
  groupSize: integer("group_size"),
  isAgeQualified: boolean("is_age_qualified").notNull().default(false),
  minAge: integer("min_age"),
  maxAge: integer("max_age"),
  internalUseOnly: boolean("internal_use_only").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
})

export const departurePriceOverridesRef = pgTable("departure_price_overrides", {
  id: typeId("departure_price_overrides").primaryKey(),
  departureId: text("departure_id").notNull(),
  optionId: text("option_id").notNull(),
  optionUnitId: text("option_unit_id").notNull(),
  priceCatalogId: typeIdRef("price_catalog_id").notNull(),
  sellAmountCents: integer("sell_amount_cents").notNull(),
  costAmountCents: integer("cost_amount_cents"),
  active: boolean("active").notNull().default(true),
})
