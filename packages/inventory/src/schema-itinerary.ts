import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import { products } from "./schema-core.js"
import { productMediaTypeEnum, serviceTypeEnum } from "./schema-shared.js"

/**
 * Whether a day service is delivered as part of the sold package (`included`)
 * or only when a traveller elects it (`optional`). The multi-day tracer
 * (voyant#4035) needs this operational role to know what a materialized
 * departure line obligates the operator to run.
 */
export const dayServiceInclusionRoleEnum = pgEnum("day_service_inclusion_role", [
  "included",
  "optional",
])

/** Which travellers a day service applies to. Coarse for the spine (voyant#4035). */
export const dayServiceTravelerScopeEnum = pgEnum("day_service_traveler_scope", [
  "all",
  "adults",
  "children",
])

/**
 * How a day service's planned-cost rate (`cost_amount_cents`) is expressed — the
 * unit it is priced per. The profitability tracer (voyant#4037) needs a declared
 * basis so a departure can restate the frozen cost against its own quantities
 * instead of guessing. Reuses the supplier `rate_unit` vocabulary
 * (`packages/distribution/src/suppliers/schema.ts`) verbatim where it maps —
 * `per_person`, `per_night`, `per_vehicle`, `flat` — rather than minting a
 * parallel enum, and adds the two bases day services need that `rate_unit` lacks:
 * `per_room` and `per_service_unit`. The paired {@link dayServiceQuantityDriverEnum}
 * names which authoritative departure quantity multiplies the rate.
 */
export const dayServicePlannedCostBasisEnum = pgEnum("day_service_planned_cost_basis", [
  "flat",
  "per_person",
  "per_room",
  "per_night",
  "per_vehicle",
  "per_service_unit",
])

/**
 * Which authoritative departure quantity multiplies the planned-cost rate when a
 * departure resolves this service. `fixed` multiplies by one; `service_units`
 * multiplies by the configured `quantity`; the rest are read from the departure:
 * `pax` from booked travellers, `rooms`/`vehicles` from `allocation_resources`,
 * `nights` from `availability_slots.nights`. Kept separate from the basis so an
 * author can, e.g., price a `flat` rate that a departure still applies once per
 * `service_units`.
 */
export const dayServiceQuantityDriverEnum = pgEnum("day_service_quantity_driver", [
  "fixed",
  "pax",
  "rooms",
  "nights",
  "vehicles",
  "service_units",
])

export const productItineraries = pgTable(
  "product_itineraries",
  {
    id: typeId("product_itineraries"),
    productId: typeIdRef("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_product_itineraries_product").on(table.productId),
    index("idx_product_itineraries_product_sort").on(
      table.productId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_product_itineraries_product_default").on(table.productId, table.isDefault),
    uniqueIndex("uidx_product_itineraries_default")
      .on(table.productId)
      // agent-quality: raw-sql reviewed -- owner: inventory; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      .where(sql`${table.isDefault} = true`),
  ],
)

export type ProductItinerary = typeof productItineraries.$inferSelect
export type NewProductItinerary = typeof productItineraries.$inferInsert

export const productItineraryTranslations = pgTable(
  "product_itinerary_translations",
  {
    id: typeId("product_itinerary_translations"),
    itineraryId: typeIdRef("itinerary_id")
      .notNull()
      .references(() => productItineraries.id, { onDelete: "cascade" }),
    languageTag: text("language_tag").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_product_itinerary_translations_itinerary").on(table.itineraryId),
    index("idx_product_itinerary_translations_language").on(table.languageTag),
    uniqueIndex("uidx_product_itinerary_translations_itinerary_language").on(
      table.itineraryId,
      table.languageTag,
    ),
  ],
)

export type ProductItineraryTranslation = typeof productItineraryTranslations.$inferSelect
export type NewProductItineraryTranslation = typeof productItineraryTranslations.$inferInsert

export const productDays = pgTable(
  "product_days",
  {
    id: typeId("product_days"),
    itineraryId: typeIdRef("itinerary_id")
      .notNull()
      .references(() => productItineraries.id, { onDelete: "cascade" }),
    dayNumber: integer("day_number").notNull(),
    title: text("title"),
    description: text("description"),
    location: text("location"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_product_days_itinerary").on(table.itineraryId),
    index("idx_product_days_itinerary_day_number").on(table.itineraryId, table.dayNumber),
    uniqueIndex("uidx_product_days_itinerary_day_number").on(table.itineraryId, table.dayNumber),
  ],
)

export type ProductDay = typeof productDays.$inferSelect
export type NewProductDay = typeof productDays.$inferInsert

export const productDayTranslations = pgTable(
  "product_day_translations",
  {
    id: typeId("product_day_translations"),
    dayId: typeIdRef("day_id")
      .notNull()
      .references(() => productDays.id, { onDelete: "cascade" }),
    languageTag: text("language_tag").notNull(),
    title: text("title"),
    description: text("description"),
    location: text("location"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_product_day_translations_day").on(table.dayId),
    index("idx_product_day_translations_language").on(table.languageTag),
    uniqueIndex("uidx_product_day_translations_day_language").on(table.dayId, table.languageTag),
  ],
)

export type ProductDayTranslation = typeof productDayTranslations.$inferSelect
export type NewProductDayTranslation = typeof productDayTranslations.$inferInsert

export const productDayServices = pgTable(
  "product_day_services",
  {
    id: typeId("product_day_services"),
    dayId: typeIdRef("day_id")
      .notNull()
      .references(() => productDays.id, { onDelete: "cascade" }),
    supplierServiceId: text("supplier_service_id"),
    // A supplier the service is delivered by, alongside the loose
    // `supplierServiceId`. Soft reference — inventory does not own suppliers.
    supplierId: text("supplier_id"),
    // A Place/facility the service happens at. Soft reference — operations owns
    // facilities; a cross-domain FK would violate schema discipline.
    facilityId: text("facility_id"),
    serviceType: serviceTypeEnum("service_type").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    countryCode: text("country_code"),
    // When the service happens within its day, in the departure's local time.
    // `durationMinutes` is an alternative to an explicit end time.
    startTimeLocal: text("start_time_local"),
    endTimeLocal: text("end_time_local"),
    durationMinutes: integer("duration_minutes"),
    inclusionRole: dayServiceInclusionRoleEnum("inclusion_role").notNull().default("included"),
    travelerScope: dayServiceTravelerScopeEnum("traveler_scope").notNull().default("all"),
    costCurrency: text("cost_currency").notNull(),
    costAmountCents: integer("cost_amount_cents").notNull(),
    quantity: integer("quantity").notNull().default(1),
    // Planned-cost basis + quantity driver (voyant#4037). The default pair
    // (`per_service_unit` / `service_units`) reproduces the legacy costing —
    // `cost_amount_cents` × `quantity` — so a service authored before this
    // migration resolves to the same planned figure; authors opt into a
    // departure-driven basis (per person/room/night/vehicle) explicitly.
    plannedCostBasis: dayServicePlannedCostBasisEnum("planned_cost_basis")
      .notNull()
      .default("per_service_unit"),
    quantityDriver: dayServiceQuantityDriverEnum("quantity_driver")
      .notNull()
      .default("service_units"),
    sortOrder: integer("sort_order"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_product_day_services_day").on(table.dayId),
    index("idx_product_day_services_day_sort").on(table.dayId, table.sortOrder),
    index("idx_product_day_services_supplier_service").on(table.supplierServiceId),
    index("idx_product_day_services_supplier").on(table.supplierId),
    index("idx_product_day_services_facility").on(table.facilityId),
  ],
)

export type ProductDayService = typeof productDayServices.$inferSelect
export type NewProductDayService = typeof productDayServices.$inferInsert

export const productDayServiceTranslations = pgTable(
  "product_day_service_translations",
  {
    id: typeId("product_day_service_translations"),
    serviceId: typeIdRef("service_id")
      .notNull()
      .references(() => productDayServices.id, { onDelete: "cascade" }),
    languageTag: text("language_tag").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_product_day_service_translations_service").on(table.serviceId),
    index("idx_product_day_service_translations_language").on(table.languageTag),
    uniqueIndex("uidx_product_day_service_translations_service_language").on(
      table.serviceId,
      table.languageTag,
    ),
  ],
)

export type ProductDayServiceTranslation = typeof productDayServiceTranslations.$inferSelect
export type NewProductDayServiceTranslation = typeof productDayServiceTranslations.$inferInsert

export const productVersions = pgTable(
  "product_versions",
  {
    id: typeId("product_versions"),
    productId: typeIdRef("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    authorId: text("author_id").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_product_versions_product").on(table.productId),
    index("idx_product_versions_product_version").on(table.productId, table.versionNumber),
  ],
)

export type ProductVersion = typeof productVersions.$inferSelect
export type NewProductVersion = typeof productVersions.$inferInsert

export const productNotes = pgTable(
  "product_notes",
  {
    id: typeId("product_notes"),
    productId: typeIdRef("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_product_notes_product").on(table.productId),
    index("idx_product_notes_product_created").on(table.productId, table.createdAt),
  ],
)

export type ProductNote = typeof productNotes.$inferSelect
export type NewProductNote = typeof productNotes.$inferInsert

export const productMedia = pgTable(
  "product_media",
  {
    id: typeId("product_media"),
    productId: typeIdRef("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    dayId: typeIdRef("day_id").references(() => productDays.id, { onDelete: "cascade" }),
    mediaType: productMediaTypeEnum("media_type").notNull(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    storageKey: text("storage_key"),
    mimeType: text("mime_type"),
    fileSize: integer("file_size"),
    width: integer("width"),
    height: integer("height"),
    altText: text("alt_text"),
    assetId: text("asset_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    isCover: boolean("is_cover").notNull().default(false),
    isOpenGraph: boolean("is_open_graph").notNull().default(false),
    isBrochure: boolean("is_brochure").notNull().default(false),
    isBrochureCurrent: boolean("is_brochure_current").notNull().default(false),
    brochureVersion: integer("brochure_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_product_media_product").on(table.productId),
    index("idx_product_media_day").on(table.dayId),
    index("idx_product_media_product_day").on(table.productId, table.dayId),
    index("idx_product_media_product_cover_sort").on(
      table.productId,
      table.isCover,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_product_media_product_day_cover_sort").on(
      table.productId,
      table.dayId,
      table.isCover,
      table.sortOrder,
      table.createdAt,
    ),
    uniqueIndex("uidx_product_media_open_graph")
      .on(table.productId)
      // agent-quality: raw-sql reviewed -- owner: inventory; fixed partial-index predicate.
      .where(sql`${table.isOpenGraph} = true`),
    check(
      "chk_product_media_open_graph_image",
      sql`${table.isOpenGraph} = false OR (${table.mediaType} = 'image' AND ${table.dayId} IS NULL AND ${table.isBrochure} = false)`,
    ),
    index("idx_product_media_product_brochure_current_version").on(
      table.productId,
      table.isBrochure,
      table.dayId,
      table.isBrochureCurrent,
      table.brochureVersion,
      table.updatedAt,
      table.createdAt,
    ),
  ],
)

export type ProductMedia = typeof productMedia.$inferSelect
export type NewProductMedia = typeof productMedia.$inferInsert
