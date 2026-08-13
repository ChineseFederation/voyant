import type { CatalogCommerceRuntimeExtension } from "@voyant-travel/catalog/runtime-contracts"
import { asc, eq } from "drizzle-orm"

import { marketLocales, markets } from "./markets/schema.js"
import {
  createProductPricingProjectionExtension,
  loadProductPriceFrom,
} from "./pricing/service-catalog-plane-pricing.js"
import { createCatalogPromotionEvaluator } from "./promotions/service-catalog-evaluator.js"
import { createProductPromotionsProjectionExtension } from "./promotions/service-catalog-plane-promotions.js"

export const catalogCommerceRuntimeExtension: CatalogCommerceRuntimeExtension = {
  async loadSliceInputs(db) {
    const [marketRows, localeRows] = await Promise.all([
      db
        .select({ id: markets.id, defaultLanguageTag: markets.defaultLanguageTag })
        .from(markets)
        .where(eq(markets.status, "active"))
        .orderBy(asc(markets.code)),
      db
        .select({ marketId: marketLocales.marketId, languageTag: marketLocales.languageTag })
        .from(marketLocales)
        .where(eq(marketLocales.active, true))
        .orderBy(asc(marketLocales.sortOrder), asc(marketLocales.languageTag)),
    ])
    return { markets: marketRows, locales: localeRows }
  },
  createPricingProjectionExtension: () => createProductPricingProjectionExtension(),
  createPromotionsProjectionExtension: () =>
    createProductPromotionsProjectionExtension({ loadOriginalPrice: loadProductPriceFrom }),
  createPromotionEvaluator: (db) => createCatalogPromotionEvaluator(db),
}
