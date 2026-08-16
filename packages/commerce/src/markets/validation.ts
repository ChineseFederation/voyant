import { booleanQueryParam } from "@voyant-travel/db/helpers"
import { paginationSchema } from "@voyant-travel/types"
import { z } from "zod"

const languageTagSchema = z
  .string()
  .min(2)
  .max(35)
  .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/)

const currencyCodeSchema = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/)
const numericStringSchema = z.string().regex(/^\d+(\.\d+)?$/)

export const marketStatusSchema = z.enum(["active", "inactive", "archived"])
export const marketVisibilitySchema = z.enum(["public", "private", "hidden"])
export const marketSellabilitySchema = z.enum(["sellable", "on_request", "unavailable"])
export const marketChannelScopeSchema = z.enum(["all", "b2c", "b2b", "internal"])
export const fxRateSourceSchema = z.enum([
  "manual",
  "ecb",
  "bnr",
  "custom",
  "channel",
  "supplier",
  "other",
])

export const marketCoreSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  status: marketStatusSchema.default("active"),
  regionCode: z.string().max(20).nullable().optional(),
  countryCode: z.string().max(2).nullable().optional(),
  defaultLanguageTag: languageTagSchema,
  defaultCurrency: currencyCodeSchema,
  timezone: z.string().max(100).nullable().optional(),
  taxContext: z.string().max(255).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const insertMarketSchema = marketCoreSchema
export const updateMarketSchema = marketCoreSchema.partial()
export const marketListQuerySchema = paginationSchema.extend({
  status: marketStatusSchema.optional(),
  countryCode: z.string().optional(),
  search: z.string().optional(),
})

/**
 * The serialized (wire) shape of a persisted market row. This is the response
 * contract: `createdAt`/`updatedAt` are ISO strings (drizzle `Date`s once
 * JSON-serialized), not `Date` objects. Used as the OpenAPI response schema so
 * the generated doc tracks the real payload.
 */
export const marketSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  status: marketStatusSchema,
  regionCode: z.string().nullable(),
  countryCode: z.string().nullable(),
  defaultLanguageTag: z.string(),
  defaultCurrency: z.string(),
  timezone: z.string().nullable(),
  taxContext: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Market = z.infer<typeof marketSchema>

export const marketLocaleCoreSchema = z.object({
  languageTag: languageTagSchema,
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
})

export const insertMarketLocaleSchema = marketLocaleCoreSchema
export const updateMarketLocaleSchema = marketLocaleCoreSchema.partial()
export const marketLocaleListQuerySchema = paginationSchema.extend({
  marketId: z.string().optional(),
  languageTag: languageTagSchema.optional(),
  active: booleanQueryParam.optional(),
})

export const marketCurrencyCoreSchema = z.object({
  currencyCode: currencyCodeSchema,
  isDefault: z.boolean().default(false),
  isSettlement: z.boolean().default(false),
  isReporting: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
})

export const insertMarketCurrencySchema = marketCurrencyCoreSchema
export const updateMarketCurrencySchema = marketCurrencyCoreSchema.partial()
export const marketCurrencyListQuerySchema = paginationSchema.extend({
  marketId: z.string().optional(),
  currencyCode: currencyCodeSchema.optional(),
  active: booleanQueryParam.optional(),
})

export const fxRateSetCoreSchema = z.object({
  source: fxRateSourceSchema.default("manual"),
  baseCurrency: currencyCodeSchema,
  effectiveAt: z.string().datetime(),
  observedAt: z.string().datetime().nullable().optional(),
  sourceReference: z.string().max(255).nullable().optional(),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const insertFxRateSetSchema = fxRateSetCoreSchema
export const updateFxRateSetSchema = fxRateSetCoreSchema.partial()
export const fxRateSetListQuerySchema = paginationSchema.extend({
  source: fxRateSourceSchema.optional(),
  baseCurrency: currencyCodeSchema.optional(),
})

export const exchangeRateCoreSchema = z.object({
  baseCurrency: currencyCodeSchema,
  quoteCurrency: currencyCodeSchema,
  rateDecimal: numericStringSchema,
  inverseRateDecimal: numericStringSchema.nullable().optional(),
  effectiveRateDecimal: numericStringSchema.nullable().optional(),
  commissionBps: z.number().int().min(0).nullable().optional(),
  observedAt: z.string().datetime().nullable().optional(),
})

export const insertExchangeRateSchema = exchangeRateCoreSchema
export const updateExchangeRateSchema = exchangeRateCoreSchema.partial()
export const exchangeRateListQuerySchema = paginationSchema.extend({
  fxRateSetId: z.string().optional(),
  baseCurrency: currencyCodeSchema.optional(),
  quoteCurrency: currencyCodeSchema.optional(),
})

export const marketPriceCatalogCoreSchema = z.object({
  marketId: z.string(),
  priceCatalogId: z.string(),
  isDefault: z.boolean().default(false),
  priority: z.number().int().default(0),
  active: z.boolean().default(true),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const insertMarketPriceCatalogSchema = marketPriceCatalogCoreSchema
export const updateMarketPriceCatalogSchema = marketPriceCatalogCoreSchema.partial()
export const marketPriceCatalogListQuerySchema = paginationSchema.extend({
  marketId: z.string().optional(),
  priceCatalogId: z.string().optional(),
  active: booleanQueryParam.optional(),
})

export const marketProductRuleCoreSchema = z.object({
  marketId: z.string(),
  productId: z.string(),
  optionId: z.string().nullable().optional(),
  priceCatalogId: z.string().nullable().optional(),
  visibility: marketVisibilitySchema.default("public"),
  sellability: marketSellabilitySchema.default("sellable"),
  channelScope: marketChannelScopeSchema.default("all"),
  active: z.boolean().default(true),
  availableFrom: z.string().date().nullable().optional(),
  availableTo: z.string().date().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export const insertMarketProductRuleSchema = marketProductRuleCoreSchema
export const updateMarketProductRuleSchema = marketProductRuleCoreSchema.partial()
export const marketProductRuleListQuerySchema = paginationSchema.extend({
  marketId: z.string().optional(),
  productId: z.string().optional(),
  optionId: z.string().optional(),
  sellability: marketSellabilitySchema.optional(),
  active: booleanQueryParam.optional(),
})

export const marketChannelRuleCoreSchema = z.object({
  marketId: z.string(),
  channelId: z.string(),
  priceCatalogId: z.string().nullable().optional(),
  visibility: marketVisibilitySchema.default("public"),
  sellability: marketSellabilitySchema.default("sellable"),
  active: z.boolean().default(true),
  priority: z.number().int().default(0),
  notes: z.string().nullable().optional(),
})

export const insertMarketChannelRuleSchema = marketChannelRuleCoreSchema
export const updateMarketChannelRuleSchema = marketChannelRuleCoreSchema.partial()
export const marketChannelRuleListQuerySchema = paginationSchema.extend({
  marketId: z.string().optional(),
  channelId: z.string().optional(),
  sellability: marketSellabilitySchema.optional(),
  active: booleanQueryParam.optional(),
})
