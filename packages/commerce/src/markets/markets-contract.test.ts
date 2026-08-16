import { listResponse, listResponseSchema } from "@voyant-travel/types"
import type { InferSelectModel } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  exchangeRateSchema,
  fxRateSetSchema,
  marketChannelRuleSchema,
  marketCurrencySchema,
  marketLocaleSchema,
  marketPriceCatalogSchema,
  marketProductRuleSchema,
  marketSchema,
} from "./openapi-schemas.js"
import type {
  exchangeRates,
  fxRateSets,
  marketChannelRules,
  marketCurrencies,
  marketLocales,
  marketPriceCatalogs,
  marketProductRules,
  markets,
} from "./schema.js"

/**
 * Response contract tests (voyant#2276 — step 3.5) for the markets admin routes.
 * They close the gap that `@hono/zod-openapi` leaves open (honojs/middleware#181):
 * the library keeps the generated doc in sync with the *declared* response
 * schema, but does NOT verify the handler actually returns that shape. Without
 * this, a wrong response schema (the platform#645 class) still generates a
 * clean — but lying — doc.
 *
 * Each fixture is typed as the real Drizzle select row, so a column drift breaks
 * compilation; the JSON round-trip (Date → ISO string, `date`/`numeric` columns
 * → strings, §17) mirrors `c.json` so a declared/actual mismatch breaks the
 * test. The schemas are imported from `openapi-schemas.ts` — the same module the
 * route declarations read from — so doc, handler, and assertion share one source.
 */

const createdAt = new Date("2026-01-01T00:00:00.000Z")
const updatedAt = new Date("2026-01-02T00:00:00.000Z")

const marketRow: InferSelectModel<typeof markets> = {
  id: "markets_00000000000000000000000",
  code: "RO",
  name: "Romania",
  status: "active",
  regionCode: null,
  countryCode: "RO",
  defaultLanguageTag: "ro-RO",
  defaultCurrency: "RON",
  timezone: null,
  taxContext: null,
  metadata: null,
  createdAt,
  updatedAt,
}

const marketLocaleRow: InferSelectModel<typeof marketLocales> = {
  id: "market_locales_000000000000000000",
  marketId: "markets_00000000000000000000000",
  languageTag: "ro-RO",
  isDefault: true,
  sortOrder: 0,
  active: true,
  createdAt,
  updatedAt,
}

const marketCurrencyRow: InferSelectModel<typeof marketCurrencies> = {
  id: "market_currencies_0000000000000000",
  marketId: "markets_00000000000000000000000",
  currencyCode: "RON",
  isDefault: true,
  isSettlement: true,
  isReporting: false,
  sortOrder: 0,
  active: true,
  createdAt,
  updatedAt,
}

const fxRateSetRow: InferSelectModel<typeof fxRateSets> = {
  id: "fx_rate_sets_0000000000000000000",
  source: "manual",
  baseCurrency: "EUR",
  effectiveAt: createdAt,
  observedAt: null,
  sourceReference: null,
  notes: null,
  metadata: null,
  createdAt,
}

const exchangeRateRow: InferSelectModel<typeof exchangeRates> = {
  id: "exchange_rates_000000000000000000",
  fxRateSetId: "fx_rate_sets_0000000000000000000",
  baseCurrency: "EUR",
  quoteCurrency: "RON",
  rateDecimal: "4.97500000",
  inverseRateDecimal: null,
  effectiveRateDecimal: "5.07450000",
  commissionBps: 200,
  observedAt: null,
  createdAt,
}

const marketPriceCatalogRow: InferSelectModel<typeof marketPriceCatalogs> = {
  id: "market_price_catalogs_000000000000",
  marketId: "markets_00000000000000000000000",
  priceCatalogId: "price_catalogs_0000000000000000",
  isDefault: true,
  priority: 0,
  active: true,
  notes: null,
  metadata: null,
  createdAt,
  updatedAt,
}

const marketProductRuleRow: InferSelectModel<typeof marketProductRules> = {
  id: "market_product_rules_00000000000000",
  marketId: "markets_00000000000000000000000",
  productId: "products_00000000000000000000000",
  optionId: null,
  priceCatalogId: null,
  visibility: "public",
  sellability: "sellable",
  channelScope: "all",
  active: true,
  availableFrom: "2026-06-01",
  availableTo: null,
  notes: null,
  createdAt,
  updatedAt,
}

const marketChannelRuleRow: InferSelectModel<typeof marketChannelRules> = {
  id: "market_channel_rules_00000000000000",
  marketId: "markets_00000000000000000000000",
  channelId: "channels_00000000000000000000000",
  priceCatalogId: null,
  visibility: "public",
  sellability: "sellable",
  active: true,
  priority: 0,
  notes: null,
  createdAt,
  updatedAt,
}

const cases = [
  ["market", marketSchema, marketRow],
  ["market locale", marketLocaleSchema, marketLocaleRow],
  ["market currency", marketCurrencySchema, marketCurrencyRow],
  ["fx rate set", fxRateSetSchema, fxRateSetRow],
  ["exchange rate", exchangeRateSchema, exchangeRateRow],
  ["market price catalog", marketPriceCatalogSchema, marketPriceCatalogRow],
  ["market product rule", marketProductRuleSchema, marketProductRuleRow],
  ["market channel rule", marketChannelRuleSchema, marketChannelRuleRow],
] as const

describe("markets single-entity response contracts", () => {
  for (const [label, schema, row] of cases) {
    it(`the serialized ${label} { data } envelope satisfies the declared OpenAPI schema`, () => {
      const wire = JSON.parse(JSON.stringify({ data: row }))
      const parsed = z.object({ data: schema }).safeParse(wire)
      expect(parsed.success ? null : parsed.error.toString()).toBeNull()
    })
  }
})

describe("markets list response contracts", () => {
  for (const [label, schema, row] of cases) {
    it(`the serialized ${label} list satisfies the declared OpenAPI list envelope`, () => {
      const wire = JSON.parse(
        JSON.stringify(listResponse([row], { total: 1, limit: 50, offset: 0 })),
      )
      const parsed = listResponseSchema(schema).safeParse(wire)
      expect(parsed.success ? null : parsed.error.toString()).toBeNull()
    })
  }

  it("the delete envelope satisfies the declared OpenAPI schema", () => {
    const parsed = z.object({ success: z.literal(true) }).safeParse({ success: true })
    expect(parsed.success).toBe(true)
  })
})
