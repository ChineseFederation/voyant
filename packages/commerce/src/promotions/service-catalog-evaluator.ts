/**
 * Catalog evaluator adapter — bridges `@voyant-travel/catalog`'s
 * `PromotionEvaluationInput` / `PromotionEvaluationOutput` contract to
 * this package's internal evaluator.
 *
 * Wired onto the v1 Session `composeQuote` in voyant#4615 via
 * `CatalogCommerceRuntimeExtension.createPromotionEvaluator`, after spending
 * the interval since voyant#4188 — which deleted its original hook, the beta
 * `QuoteEntityDeps.evaluatePromotions` — with no call sites at all.
 *
 * Per docs/architecture/promotions-architecture.md §3.6 + §7.1.
 */

import type {
  PromotionEvaluationInput,
  PromotionEvaluationOutput,
} from "@voyant-travel/catalog/booking-engine"
import type { AnyDrizzleDb } from "@voyant-travel/db"

import { createDrizzleOfferDataSource, evaluateOffersForProduct } from "./service-evaluator.js"

/**
 * Build the `evaluatePromotions` hook a catalog quote path wires in. Closes
 * over the request-scoped db.
 */
export function createCatalogPromotionEvaluator(
  db: AnyDrizzleDb,
): (input: PromotionEvaluationInput) => Promise<PromotionEvaluationOutput> {
  const source = createDrizzleOfferDataSource(db)
  return async (input) => {
    const result = await evaluateOffersForProduct(source, input)
    // Shapes are 1:1 between the two `AppliedOffer` / `CodeStatus`
    // declarations — catalog's contract intentionally mirrors the
    // evaluator's so the bridge is just a structural pass-through.
    return {
      applied: result.applied,
      total: result.total,
      codeStatus: result.codeStatus,
    }
  }
}
