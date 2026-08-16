import type { Module } from "@voyant-travel/core"
import type { ApiModule } from "@voyant-travel/hono/module"
import { marketsRoutes } from "./routes.js"
import { publicMarketsRoutes } from "./routes-public.js"
import { marketsService } from "./service.js"

export type {
  CapturedFxQuote,
  CapturedFxRate,
  CapturedFxRateSource,
  CaptureFxRateSetInput,
  CaptureFxRateSetResult,
} from "./fx-capture.js"
export { applyCommission, captureFxRateSet, FxRateCaptureError } from "./fx-capture.js"
export type { MarketsRoutes } from "./routes.js"
export type { PublicMarketsRoutes } from "./routes-public.js"
export { publicMarketSchema } from "./routes-public.js"
export type {
  PublicMarket,
  PublicMarketCurrency,
  PublicMarketLocale,
} from "./service-public.js"
export { listPublicMarkets } from "./service-public.js"

export const marketsModule: Module = {
  name: "markets",
}

export const marketsApiModule: ApiModule = {
  module: marketsModule,
  adminRoutes: marketsRoutes,
  // Read-only market/locale/currency discovery for anonymous storefront clients
  // (voyant#2643). Only the public projection is exposed; see routes-public.ts.
  publicRoutes: publicMarketsRoutes,
  anonymous: true,
}

export type {
  ExchangeRate,
  FxRateSet,
  Market,
  MarketChannelRule,
  MarketCurrency,
  MarketLocale,
  MarketPriceCatalog,
  MarketProductRule,
  NewExchangeRate,
  NewFxRateSet,
  NewMarket,
  NewMarketChannelRule,
  NewMarketCurrency,
  NewMarketLocale,
  NewMarketPriceCatalog,
  NewMarketProductRule,
} from "./schema.js"
export {
  exchangeRates,
  fxRateSets,
  marketChannelRules,
  marketCurrencies,
  marketLocales,
  marketPriceCatalogs,
  marketProductRules,
  markets,
} from "./schema.js"
export {
  exchangeRateListQuerySchema,
  fxRateSetListQuerySchema,
  insertExchangeRateSchema,
  insertFxRateSetSchema,
  insertMarketChannelRuleSchema,
  insertMarketCurrencySchema,
  insertMarketLocaleSchema,
  insertMarketPriceCatalogSchema,
  insertMarketProductRuleSchema,
  insertMarketSchema,
  marketChannelRuleListQuerySchema,
  marketCurrencyListQuerySchema,
  marketListQuerySchema,
  marketLocaleListQuerySchema,
  marketPriceCatalogListQuerySchema,
  marketProductRuleListQuerySchema,
  updateExchangeRateSchema,
  updateFxRateSetSchema,
  updateMarketChannelRuleSchema,
  updateMarketCurrencySchema,
  updateMarketLocaleSchema,
  updateMarketPriceCatalogSchema,
  updateMarketProductRuleSchema,
  updateMarketSchema,
} from "./validation.js"
export { marketsService }
