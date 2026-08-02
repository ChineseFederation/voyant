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
  uniqueIndex,
} from "drizzle-orm/pg-core"

import {
  optionUnitTypeEnum,
  productBookingModeEnum,
  productCapacityModeEnum,
  productOptionStatusEnum,
  productStatusEnum,
  productVisibilityEnum,
} from "./schema-shared.js"

export const products = pgTable(
  "products",
  {
    id: typeId("products"),
    name: text("name").notNull(),
    status: productStatusEnum("status").notNull().default("draft"),
    description: text("description"),
    inclusionsHtml: text("inclusions_html"),
    exclusionsHtml: text("exclusions_html"),
    termsHtml: text("terms_html"),
    termsShowOnContract: boolean("terms_show_on_contract").notNull().default(false),
    bookingMode: productBookingModeEnum("booking_mode").notNull().default("date"),
    capacityMode: productCapacityModeEnum("capacity_mode").notNull().default("limited"),
    timezone: text("timezone"),
    /**
     * BCP-47 tag for the language the base `name`/`description` columns are
     * written in. Translations cover the other languages; public serving
     * falls back to these base columns for this locale. Null until set.
     */
    defaultLanguageTag: text("default_language_tag"),
    /**
     * @deprecated Compatibility-only distribution flag. Product status and
     * Distribution-owned Publication are authoritative; new operator UI must
     * not author or interpret this column.
     */
    visibility: productVisibilityEnum("visibility").notNull().default("private"),
    /**
     * @deprecated Compatibility-only site flag. A direct Storefront resolves
     * a Channel whose effective Publication controls assortment.
     */
    activated: boolean("activated").notNull().default(false),
    reservationTimeoutMinutes: integer("reservation_timeout_minutes"),
    sellCurrency: text("sell_currency").notNull(),
    sellAmountCents: integer("sell_amount_cents"),
    costAmountCents: integer("cost_amount_cents"),
    marginPercent: integer("margin_percent"),
    facilityId: text("facility_id"),
    supplierId: text("supplier_id"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    pax: integer("pax"),
    /**
     * Product family reference — a soft id into `product_types` (recast as the
     * merchandising **Product family**: tour, activity, attraction, event,
     * transportation). Independent of `bookingMode`, `capacityMode`,
     * `durationMinutes`, and schedule. Null until classified; a null family is
     * surfaced as an actionable review warning rather than inferred.
     */
    productTypeId: text("product_type_id"),
    /**
     * Optional Product **subtype** stable code (e.g. `boat-tour`, `day-tour`).
     * A free-form stable code, independent from the family, booking mode, and
     * duration. Null when the product has no subtype. Never inferred from
     * duration (a 60-minute Boat Tour is a `tour`/`boat-tour`, not an Activity).
     */
    productSubtypeCode: text("product_subtype_code"),
    /**
     * Explicit product **duration in minutes** (positive). This is the
     * authored source of truth for duration; the resolver
     * (`resolveProductDuration`) prefers it over the legacy itinerary-day
     * derivation. Null when the operator has not authored an explicit
     * duration — the resolver then falls back to the itinerary or reports the
     * duration as unresolved (with a review warning). Enforced positive by
     * a CHECK constraint in the migration and by the contract schema.
     */
    durationMinutes: integer("duration_minutes"),
    /**
     * Soft reference to legal.contract_templates. This intentionally stays a
     * plain text column because legal lives in a separate package.
     */
    contractTemplateId: text("contract_template_id"),
    /**
     * Per-product tax class — drives the engine's tax computation at
     * quote time. Plain text (no FK) since `tax_classes` lives in
     * @voyant-travel/finance and cross-domain refs go through the link
     * service per schema-discipline. Default null → falls through to a
     * market-level default. Per booking-journey-architecture §9.
     */
    taxClassId: text("tax_class_id"),
    /**
     * Per-listing customer payment policy override. Wins over the
     * product's category and supplier policies in the cascade. Shape
     * mirrors `PaymentPolicy` from `@voyant-travel/finance`.
     *
     * `null` means "inherit from category / supplier / operator
     * default" — most products leave this empty.
     */
    customerPaymentPolicy: jsonb("customer_payment_policy"),
    tags: jsonb("tags").$type<string[]>().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_products_status").on(table.status),
    index("idx_products_facility").on(table.facilityId),
    index("idx_products_supplier").on(table.supplierId),
    index("idx_products_product_type").on(table.productTypeId),
    index("idx_products_contract_template").on(table.contractTemplateId),
    index("idx_products_status_created").on(table.status, table.createdAt),
    index("idx_products_booking_mode_created").on(table.bookingMode, table.createdAt),
    index("idx_products_capacity_mode_created").on(table.capacityMode, table.createdAt),
    index("idx_products_visibility_created").on(table.visibility, table.createdAt),
    index("idx_products_activated_created").on(table.activated, table.createdAt),
    index("idx_products_facility_created").on(table.facilityId, table.createdAt),
    index("idx_products_supplier_created").on(table.supplierId, table.createdAt),
    index("idx_products_product_type_created").on(table.productTypeId, table.createdAt),
    index("idx_products_public_created").on(
      table.status,
      table.activated,
      table.visibility,
      table.createdAt,
    ),
    // Trigram GIN indexes back the `ILIKE '%term%'` search in the admin
    // list + public product search. Requires the pg_trgm extension
    // (enabled in the operator starter's migrations).
    index("idx_products_name_trgm").using("gin", table.name.op("gin_trgm_ops")),
    index("idx_products_description_trgm").using("gin", table.description.op("gin_trgm_ops")),
    // Subtype is a facet in the catalog plane (e.g. Boat Tour view) — index it
    // so `productSubtypeCode` filters don't scan.
    index("idx_products_subtype_code").on(table.productSubtypeCode),
    // Explicit duration is positive when present; enforced at the DB so no
    // path (agent authoring, imports, backfills) can persist a nonsensical value.
    check("chk_products_duration_minutes_positive", sql`${table.durationMinutes} > 0`),
  ],
)

export type Product = typeof products.$inferSelect
export type NewProduct = typeof products.$inferInsert

export const productOptions = pgTable(
  "product_options",
  {
    id: typeId("product_options"),
    productId: typeIdRef("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code"),
    description: text("description"),
    status: productOptionStatusEnum("status").notNull().default("draft"),
    isDefault: boolean("is_default").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    availableFrom: date("available_from"),
    availableTo: date("available_to"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_product_options_product").on(table.productId),
    index("idx_product_options_product_sort").on(table.productId, table.sortOrder, table.createdAt),
    index("idx_product_options_status").on(table.status),
    index("idx_product_options_default").on(table.isDefault),
    uniqueIndex("uidx_product_options_product_code").on(table.productId, table.code),
  ],
)

export type ProductOption = typeof productOptions.$inferSelect
export type NewProductOption = typeof productOptions.$inferInsert

export const optionUnits = pgTable(
  "option_units",
  {
    id: typeId("option_units"),
    optionId: typeIdRef("option_id")
      .notNull()
      .references(() => productOptions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code"),
    description: text("description"),
    unitType: optionUnitTypeEnum("unit_type").notNull().default("person"),
    minQuantity: integer("min_quantity"),
    maxQuantity: integer("max_quantity"),
    minAge: integer("min_age"),
    maxAge: integer("max_age"),
    occupancyMin: integer("occupancy_min"),
    occupancyMax: integer("occupancy_max"),
    isRequired: boolean("is_required").notNull().default(false),
    isHidden: boolean("is_hidden").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_option_units_option").on(table.optionId),
    index("idx_option_units_option_sort").on(table.optionId, table.sortOrder, table.createdAt),
    index("idx_option_units_type").on(table.unitType),
    uniqueIndex("uidx_option_units_option_code").on(table.optionId, table.code),
  ],
)

export type OptionUnit = typeof optionUnits.$inferSelect
export type NewOptionUnit = typeof optionUnits.$inferInsert

/**
 * Per-product per-occupancy rate tiers for non-cruise verticals.
 * Cruises keep the specialized `cruise_prices` table; everyone else
 * uses this. Per booking-journey-architecture §9.
 *
 * `tier_pax` is the occupancy count the rate applies to (1-supp, 2-default,
 * 3-share, 4). Falls back to `option_unit_tiers` (quantity-based, not
 * occupancy-based) when no occupancy tier exists.
 */
export const productPaxPricingTiers = pgTable(
  "product_pax_pricing_tiers",
  {
    id: typeId("product_pax_pricing_tiers"),
    productId: typeIdRef("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    optionUnitId: typeIdRef("option_unit_id").references(() => optionUnits.id, {
      onDelete: "cascade",
    }),
    tierPax: integer("tier_pax").notNull(),
    pricePerPaxCents: integer("price_per_pax_cents").notNull(),
    promoPricePerPaxCents: integer("promo_price_per_pax_cents"),
    effectiveFrom: date("effective_from"),
    effectiveTo: date("effective_to"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_pax_tiers_product").on(table.productId),
    index("idx_pax_tiers_unit").on(table.optionUnitId),
    uniqueIndex("uidx_pax_tiers_unit_pax").on(table.optionUnitId, table.tierPax),
  ],
)

export type ProductPaxPricingTier = typeof productPaxPricingTiers.$inferSelect
export type NewProductPaxPricingTier = typeof productPaxPricingTiers.$inferInsert
