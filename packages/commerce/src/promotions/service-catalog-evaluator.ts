/**
 * Catalog evaluator adapter — bridges `@voyant-travel/catalog`'s
 * `PromotionEvaluationInput` / `PromotionEvaluationOutput` contract to
 * this package's internal evaluator.
 *
 * Currently unwired: the deployment hook it plugged into was the beta
 * `QuoteEntityDeps.evaluatePromotions`, deleted with the beta quote path in
 * voyant#4188. The bridge is kept because it is the published adapter a
 * v1 Session `composeQuote` promotion hook would reuse verbatim.
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
