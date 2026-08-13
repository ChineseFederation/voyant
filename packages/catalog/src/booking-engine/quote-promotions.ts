/**
 * Promotion evaluation on the v1 Booking Session quote.
 *
 * This is the `composeQuote` hook that
 * `docs/architecture/promotions-architecture.md` §7.1 always described and
 * that voyant#4188 left unwired when it deleted the beta `quoteEntity` path.
 * Until voyant#4615 the consequence was silent: `promotionCode` was declared
 * on the public selection, accepted by the route, and then projected away by
 * `normalizeBookingSelection` — so a code could never change a price, and the
 * only client that offered a code field had to infer failure from an
 * unrelated `available === false`.
 *
 * The evaluation itself lives in `@voyant-travel/commerce`; catalog only owns
 * the seam (`PromotionEvaluationInput` / `PromotionEvaluationOutput`) and the
 * arithmetic below, which is pure and directly unit-tested.
 */

import type {
  BookingSessionScopeV1,
  PricingBreakdownV1,
  PromotionCodeStatusV1,
} from "./contracts.js"
import type { PromotionEvaluationInput, PromotionEvaluationOutput } from "./promotions-contract.js"

/** Request-scoped promotion evaluator, supplied by the deployment. */
export type PromotionEvaluator = (
  input: PromotionEvaluationInput,
) => Promise<PromotionEvaluationOutput>

/**
 * Build the evaluator input for a product quote.
 *
 * The discount base is the quote **total** — the amount the customer would
 * otherwise pay — so `evaluation.total.discountedPriceCents` is the new total
 * directly, and a `fixed_amount` offer is capped against the real price rather
 * than a pre-tax figure the customer never sees.
 */
export function promotionEvaluationInputFor(input: {
  productId: string
  breakdown: PricingBreakdownV1
  scope: Pick<BookingSessionScopeV1, "market">
  audience: PromotionEvaluationInput["slice"]["audience"]
  pax: number
  at: Date
  code: string | null | undefined
  hasChildTraveler?: boolean
}): PromotionEvaluationInput {
  return {
    productId: input.productId,
    slice: { audience: input.audience, market: input.scope.market },
    // Pax is always known by the time a target is priced, so `minPax`
    // conditions resolve to applied/excluded here rather than to the
    // "conditional" bucket the catalog-plane projection sees.
    pax: input.pax,
    ...(input.hasChildTraveler !== undefined
      ? { eligibility: { hasChildTraveler: input.hasChildTraveler } }
      : {}),
    date: input.at,
    ...(input.code ? { code: input.code } : {}),
    basePriceCents: input.breakdown.total,
    baseCurrency: input.breakdown.currency,
  }
}

/**
 * Fold an evaluation into a priced breakdown.
 *
 * Totals move; the base lines do not. Each applied offer becomes its own
 * negative `discount` line, and `subtotal`/`taxTotal` are scaled so the
 * effective tax rate and the `subtotal + taxTotal === total` invariant both
 * survive — which holds whether the handler priced tax inclusively or
 * exclusively. Leaving the base lines at their undiscounted amounts is what
 * `fillMissingBookingItemSellAmounts` expects: it reconciles item lines to the
 * accepted sell total using those lines as weights, and its contract already
 * names promotion as one of the residuals it allocates.
 */
export function applyPromotionsToBreakdown(
  breakdown: PricingBreakdownV1,
  evaluation: PromotionEvaluationOutput,
): PricingBreakdownV1 {
  const codeStatus = resolveCodeStatus(evaluation)
  const discount = Math.max(
    0,
    Math.min(Math.round(evaluation.total.discountAppliedCents), breakdown.total),
  )
  const applied = discount > 0 ? evaluation.applied : []
  const annotations = {
    ...(applied.length > 0 ? { appliedOffers: applied } : {}),
    ...(codeStatus ? { promotionCodeStatus: codeStatus } : {}),
  }
  if (discount <= 0) return { ...breakdown, ...annotations }

  const total = breakdown.total - discount
  const taxTotal =
    breakdown.total > 0 ? Math.round((breakdown.taxTotal * total) / breakdown.total) : 0
  const subtotal = total - taxTotal
  return {
    ...breakdown,
    lines: [
      ...breakdown.lines,
      ...applied.map((offer) => ({
        kind: "discount" as const,
        label: offer.offerName,
        quantity: 1,
        unitAmount: -offer.discountAppliedCents,
        totalAmount: -offer.discountAppliedCents,
      })),
    ],
    taxes: scaleTaxes(breakdown.taxes, taxTotal, subtotal),
    subtotal,
    taxTotal,
    total,
    ...annotations,
  }
}

/**
 * Scale tax rows to the post-discount tax total, allocating the rounding
 * residual to the largest row so the rows sum to `taxTotal` exactly.
 */
function scaleTaxes(
  taxes: PricingBreakdownV1["taxes"],
  taxTotal: number,
  base: number,
): PricingBreakdownV1["taxes"] {
  if (taxes.length === 0) return taxes
  const priorTotal = taxes.reduce((sum, tax) => sum + tax.amount, 0)
  if (priorTotal <= 0) return taxes.map((tax) => ({ ...tax, base }))
  const scaled = taxes.map((tax) => ({
    ...tax,
    amount: Math.round((tax.amount * taxTotal) / priorTotal),
    base,
  }))
  const residual = taxTotal - scaled.reduce((sum, tax) => sum + tax.amount, 0)
  if (residual === 0) return scaled
  let largest = 0
  for (const [index, tax] of scaled.entries()) {
    if (tax.amount > (scaled[largest]?.amount ?? 0)) largest = index
  }
  const target = scaled[largest]
  if (target) scaled[largest] = { ...target, amount: target.amount + residual }
  return scaled
}

/**
 * A code that matched an active offer but produced no discount at all did not
 * really apply. The evaluator reports `code_valid` in that case because its
 * validity check runs before the eligibility filter, and an eligibility flag
 * nobody can answer (past guest, family) parks the offer in the "conditional"
 * bucket rather than rejecting it. Reporting "valid" next to an unchanged
 * total is the same conflation voyant#4615 was about, so name it.
 *
 * Only when nothing discounted: if a better auto offer won the stacking pick,
 * the customer got the lower price and the code was genuinely honoured.
 */
function resolveCodeStatus(evaluation: PromotionEvaluationOutput): PromotionCodeStatusV1 | null {
  const status = evaluation.codeStatus
  if (status?.kind !== "code_valid") return status ?? null
  if (evaluation.total.discountAppliedCents > 0) return status
  return { kind: "code_not_applicable", reason: "eligibility" }
}
