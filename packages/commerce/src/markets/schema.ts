import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { relations, sql } from "drizzle-orm"
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

export const marketStatusEnum = pgEnum("market_status", ["active", "inactive", "archived"])
export const marketVisibilityEnum = pgEnum("market_visibility", ["public", "private", "hidden"])
export const marketSellabilityEnum = pgEnum("market_sellability", [
  "sellable",
  "on_request",
  "unavailable",
])
export const marketChannelScopeEnum = pgEnum("market_channel_scope", [
  "all",
  "b2c",
  "b2b",
  "internal",
])
export const fxRateSourceEnum = pgEnum("fx_rate_source", [
  "manual",
  "ecb",
  "bnr",
  "custom",
  "channel",
  "supplier",
  "other",
])

export const markets = pgTable(
  "markets",
  {
    id: typeId("markets"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    status: marketStatusEnum("status").notNull().default("active"),
    regionCode: text("region_code"),
    countryCode: text("country_code"),
    defaultLanguageTag: text("default_language_tag").notNull(),
    defaultCurrency: text("default_currency").notNull(),
    timezone: text("timezone"),
    taxContext: text("tax_context"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uidx_markets_code").on(table.code),
    index("idx_markets_updated").on(table.updatedAt),
    index("idx_markets_status_updated").on(table.status, table.updatedAt),
    index("idx_markets_country_updated").on(table.countryCode, table.updatedAt),
  ],
)

export const marketLocales = pgTable(
  "market_locales",
  {
    id: typeId("market_locales"),
    marketId: typeIdRef("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    languageTag: text("language_tag").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_market_locales_sort_created").on(table.sortOrder, table.createdAt),
    index("idx_market_locales_market_sort_created").on(
      table.marketId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_market_locales_language_sort_created").on(
      table.languageTag,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_market_locales_active_sort_created").on(
      table.active,
      table.sortOrder,
      table.createdAt,
    ),
    uniqueIndex("uidx_market_locales_market_language").on(table.marketId, table.languageTag),
  ],
)

export const marketCurrencies = pgTable(
  "market_currencies",
  {
    id: typeId("market_currencies"),
    marketId: typeIdRef("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    currencyCode: text("currency_code").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    isSettlement: boolean("is_settlement").notNull().default(false),
    isReporting: boolean("is_reporting").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_market_currencies_sort_created").on(table.sortOrder, table.createdAt),
    index("idx_market_currencies_market_sort_created").on(
      table.marketId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_market_currencies_code_sort_created").on(
      table.currencyCode,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_market_currencies_active_sort_created").on(
      table.active,
      table.sortOrder,
      table.createdAt,
    ),
    uniqueIndex("uidx_market_currencies_market_code").on(table.marketId, table.currencyCode),
  ],
)

export const fxRateSets = pgTable(
  "fx_rate_sets",
  {
    id: typeId("fx_rate_sets"),
    source: fxRateSourceEnum("source").notNull().default("manual"),
    baseCurrency: text("base_currency").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }),
    sourceReference: text("source_reference"),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_fx_rate_sets_base_currency_effective").on(table.baseCurrency, table.effectiveAt),
    index("idx_fx_rate_sets_effective_at").on(table.effectiveAt),
    index("idx_fx_rate_sets_source_effective").on(table.source, table.effectiveAt),
  ],
)

export const exchangeRates = pgTable(
  "exchange_rates",
  {
    id: typeId("exchange_rates"),
    fxRateSetId: typeIdRef("fx_rate_set_id")
      .notNull()
      .references(() => fxRateSets.id, { onDelete: "cascade" }),
    baseCurrency: text("base_currency").notNull(),
    quoteCurrency: text("quote_currency").notNull(),
    /** The rate exactly as the source published it. Never carries a margin. */
    rateDecimal: numeric("rate_decimal", { precision: 18, scale: 8 }).notNull(),
    inverseRateDecimal: numeric("inverse_rate_decimal", { precision: 18, scale: 8 }),
    /**
     * The rate documents are actually converted at:
     * `rate_decimal × (1 + commission_bps / 10_000)`. Recorded rather than
     * recomputed so a document stamped today still reproduces its own
     * arithmetic after the operator changes the margin — and so the two halves
     * (published rate, operator margin) can be shown separately to an
     * inspector. Null on rows captured before the margin was modelled.
     */
    effectiveRateDecimal: numeric("effective_rate_decimal", { precision: 18, scale: 8 }),
    /** The operator currency-risk margin folded into `effective_rate_decimal`. */
    commissionBps: integer("commission_bps"),
    observedAt: timestamp("observed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_exchange_rates_rate_set_created").on(table.fxRateSetId, table.createdAt),
    index("idx_exchange_rates_base_currency_created").on(table.baseCurrency, table.createdAt),
    index("idx_exchange_rates_quote_currency_created").on(table.quoteCurrency, table.createdAt),
    index("idx_exchange_rates_pair").on(table.baseCurrency, table.quoteCurrency),
    uniqueIndex("uidx_exchange_rates_set_pair").on(
      table.fxRateSetId,
      table.baseCurrency,
      table.quoteCurrency,
    ),
    // The applied rate is only interpretable next to the margin that produced
    // it, so neither half may be recorded on its own.
    check(
      "ck_exchange_rates_effective_rate_commission",
      // agent-quality: raw-sql reviewed -- owner: commerce; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      sql`(${table.effectiveRateDecimal} IS NULL) = (${table.commissionBps} IS NULL)`,
    ),
  ],
)

export const marketPriceCatalogs = pgTable(
  "market_price_catalogs",
  {
    id: typeId("market_price_catalogs"),
    marketId: typeIdRef("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    priceCatalogId: typeIdRef("price_catalog_id").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    priority: integer("priority").notNull().default(0),
    active: boolean("active").notNull().default(true),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_market_price_catalogs_market_created").on(table.marketId, table.createdAt),
    index("idx_market_price_catalogs_catalog_created").on(table.priceCatalogId, table.createdAt),
    index("idx_market_price_catalogs_active_created").on(table.active, table.createdAt),
    uniqueIndex("uidx_market_price_catalogs_market_catalog").on(
      table.marketId,
      table.priceCatalogId,
    ),
  ],
)

export const marketProductRules = pgTable(
  "market_product_rules",
  {
    id: typeId("market_product_rules"),
    marketId: typeIdRef("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull(),
    optionId: text("option_id"),
    priceCatalogId: typeIdRef("price_catalog_id").references(() => marketPriceCatalogs.id, {
      onDelete: "set null",
    }),
    visibility: marketVisibilityEnum("visibility").notNull().default("public"),
    sellability: marketSellabilityEnum("sellability").notNull().default("sellable"),
    channelScope: marketChannelScopeEnum("channel_scope").notNull().default("all"),
    active: boolean("active").notNull().default(true),
    availableFrom: date("available_from"),
    availableTo: date("available_to"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_market_product_rules_market_created").on(table.marketId, table.createdAt),
    index("idx_market_product_rules_product_created").on(table.productId, table.createdAt),
    index("idx_market_product_rules_option_created").on(table.optionId, table.createdAt),
    index("idx_market_product_rules_catalog").on(table.priceCatalogId),
    index("idx_market_product_rules_sellability_created").on(table.sellability, table.createdAt),
    index("idx_market_product_rules_active_created").on(table.active, table.createdAt),
  ],
)

export const marketChannelRules = pgTable(
  "market_channel_rules",
  {
    id: typeId("market_channel_rules"),
    marketId: typeIdRef("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    priceCatalogId: typeIdRef("price_catalog_id").references(() => marketPriceCatalogs.id, {
      onDelete: "set null",
    }),
    visibility: marketVisibilityEnum("visibility").notNull().default("public"),
    sellability: marketSellabilityEnum("sellability").notNull().default("sellable"),
    active: boolean("active").notNull().default(true),
    priority: integer("priority").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_market_channel_rules_market_created").on(table.marketId, table.createdAt),
    index("idx_market_channel_rules_channel_created").on(table.channelId, table.createdAt),
    index("idx_market_channel_rules_catalog").on(table.priceCatalogId),
    index("idx_market_channel_rules_sellability_created").on(table.sellability, table.createdAt),
    index("idx_market_channel_rules_active_created").on(table.active, table.createdAt),
  ],
)

export type Market = typeof markets.$inferSelect
export type NewMarket = typeof markets.$inferInsert
export type MarketLocale = typeof marketLocales.$inferSelect
export type NewMarketLocale = typeof marketLocales.$inferInsert
export type MarketCurrency = typeof marketCurrencies.$inferSelect
export type NewMarketCurrency = typeof marketCurrencies.$inferInsert
export type FxRateSet = typeof fxRateSets.$inferSelect
export type NewFxRateSet = typeof fxRateSets.$inferInsert
export type ExchangeRate = typeof exchangeRates.$inferSelect
export type NewExchangeRate = typeof exchangeRates.$inferInsert
export type MarketPriceCatalog = typeof marketPriceCatalogs.$inferSelect
export type NewMarketPriceCatalog = typeof marketPriceCatalogs.$inferInsert
export type MarketProductRule = typeof marketProductRules.$inferSelect
export type NewMarketProductRule = typeof marketProductRules.$inferInsert
export type MarketChannelRule = typeof marketChannelRules.$inferSelect
export type NewMarketChannelRule = typeof marketChannelRules.$inferInsert

export const marketsRelations = relations(markets, ({ many }) => ({
  locales: many(marketLocales),
  currencies: many(marketCurrencies),
  priceCatalogs: many(marketPriceCatalogs),
  productRules: many(marketProductRules),
  channelRules: many(marketChannelRules),
}))

export const marketLocalesRelations = relations(marketLocales, ({ one }) => ({
  market: one(markets, {
    fields: [marketLocales.marketId],
    references: [markets.id],
  }),
}))

export const marketCurrenciesRelations = relations(marketCurrencies, ({ one }) => ({
  market: one(markets, {
    fields: [marketCurrencies.marketId],
    references: [markets.id],
  }),
}))

export const fxRateSetsRelations = relations(fxRateSets, ({ many }) => ({
  exchangeRates: many(exchangeRates),
}))

export const exchangeRatesRelations = relations(exchangeRates, ({ one }) => ({
  fxRateSet: one(fxRateSets, {
    fields: [exchangeRates.fxRateSetId],
    references: [fxRateSets.id],
  }),
}))

export const marketPriceCatalogsRelations = relations(marketPriceCatalogs, ({ one, many }) => ({
  market: one(markets, {
    fields: [marketPriceCatalogs.marketId],
    references: [markets.id],
  }),
  productRules: many(marketProductRules),
  channelRules: many(marketChannelRules),
}))

export const marketProductRulesRelations = relations(marketProductRules, ({ one }) => ({
  market: one(markets, {
    fields: [marketProductRules.marketId],
    references: [markets.id],
  }),
  priceCatalog: one(marketPriceCatalogs, {
    fields: [marketProductRules.priceCatalogId],
    references: [marketPriceCatalogs.id],
  }),
}))

export const marketChannelRulesRelations = relations(marketChannelRules, ({ one }) => ({
  market: one(markets, {
    fields: [marketChannelRules.marketId],
    references: [markets.id],
  }),
  priceCatalog: one(marketPriceCatalogs, {
    fields: [marketChannelRules.priceCatalogId],
    references: [marketPriceCatalogs.id],
  }),
}))
