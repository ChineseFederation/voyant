/** Booking pricing V1 schemas — lines, taxes, policy evidence, schedules. */

import { z } from "zod"

// ─────────────────────────────────────────────────────────────────
// PricingBreakdown — richer than PricingBasis, carries lines + taxes
// ─────────────────────────────────────────────────────────────────

export const pricingLineV1 = z.object({
  kind: z.enum(["base", "addon", "accommodation", "supplement", "discount", "fee"]),
  label: z.string(),
  quantity: z.number().nonnegative().optional(),
  unitAmount: z.number().int(),
  totalAmount: z.number().int(),
  taxIncluded: z.boolean().optional(),
  /** How quantity is interpreted for this line. Booking UIs use this to
   * distinguish inventory held from travelers charged. */
  pricingBasis: z.enum(["per_person", "per_unit", "per_booking"]).optional(),
  /** Aggregate Quote provenance for one Trip Component. */
  componentId: z.string().min(1).optional(),
  authority: z.enum(["booking_quote", "accepted_proposal_manual"]).optional(),
})

export const pricingTaxV1 = z.object({
  code: z.string(),
  label: z.string(),
  rate: z.number().nonnegative(),
  amount: z.number().int(),
  base: z.number().int(),
  includedInPrice: z.boolean().optional(),
  scope: z.enum(["included", "excluded", "withheld"]).optional(),
  componentId: z.string().min(1).optional(),
})

export const bookingPolicyEvidenceV1 = z.object({
  cancellation: z.unknown().optional(),
  bookingTerms: z.unknown().optional(),
})

/**
 * One promotional offer applied to a quote. Structurally identical to the
 * `AppliedOffer` interface in `./promotions-contract.ts` — that file declares
 * the evaluator seam, this schema is the wire form carried on the quote and
 * frozen onto `PricingBasis.appliedOffers` at commit.
 */
export const pricingAppliedOfferV1 = z.object({
  offerId: z.string().min(1),
  offerName: z.string(),
  discountAppliedCents: z.number().int(),
  discountedPriceCents: z.number().int(),
  currency: z.string(),
  discountKind: z.enum(["percentage", "fixed_amount"]),
  discountPercent: z.number().nullable(),
  discountAmountCents: z.number().int().nullable(),
  /** The literal code the customer entered (case preserved); null for auto-applied. */
  appliedCode: z.string().nullable(),
  stackable: z.boolean(),
})
export type PricingAppliedOfferV1 = z.infer<typeof pricingAppliedOfferV1>

/**
 * Verdict on a promotion code the caller supplied. Present only when a code
 * was sent, and carried on an **available** quote: a rejected code does not
 * make the target unbookable, it just does not discount it. Without this a
 * client has no way to tell "your code is wrong" from "this departure cannot
 * be priced", which is exactly the conflation voyant#4615 reported.
 */
export const promotionCodeStatusV1 = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("code_valid") }),
  z.object({ kind: z.literal("code_not_found") }),
  z.object({ kind: z.literal("code_expired") }),
  z.object({ kind: z.literal("code_not_yet_valid") }),
  z.object({
    kind: z.literal("code_not_applicable"),
    reason: z.enum(["scope", "min_pax", "eligibility", "currency"]),
  }),
])
export type PromotionCodeStatusV1 = z.infer<typeof promotionCodeStatusV1>

export const pricingBreakdownV1 = z.object({
  currency: z.string().length(3),
  lines: z.array(pricingLineV1),
  taxes: z.array(pricingTaxV1),
  subtotal: z.number().int(),
  taxTotal: z.number().int(),
  total: z.number().int(),
  /**
   * Promotional offers reflected in the totals above. The `discount` lines in
   * `lines` are the human-readable face of the same offers.
   */
  appliedOffers: z.array(pricingAppliedOfferV1).optional(),
  /** Verdict on the caller's promotion code. Absent when no code was sent. */
  promotionCodeStatus: promotionCodeStatusV1.optional(),
  /** Fresh policy evidence for a leaf Quote. */
  policyEvidence: bookingPolicyEvidenceV1.optional(),
  /** Component-tagged policy evidence for an aggregate Trip Quote. */
  componentPolicies: z
    .array(bookingPolicyEvidenceV1.extend({ componentId: z.string().min(1) }))
    .optional(),
})
export type PricingBreakdownV1 = z.infer<typeof pricingBreakdownV1>

/**
 * The key a policy snapshot stamps with the instant it was READ.
 *
 * `captureCancellationPolicySnapshot` defaults it to `new Date()`, so it is
 * different on every compose of the same unchanged selection. That is correct
 * for evidence — it records when we looked — and wrong for identity: it says
 * nothing about WHICH policy was captured or what it costs.
 */
const POLICY_CAPTURE_INSTANT = "capturedAt"

/**
 * Policy evidence reduced to what identifies the policy.
 *
 * Everything that decides whether a quote still stands survives:
 * `policyId`, `policyVersionId`, `version` and the `rules` themselves. Only the
 * capture instant is dropped, and only inside the evidence subtree.
 *
 * The recursion is deliberate. `cancellation` and `bookingTerms` are typed
 * `unknown` because a supplier's terms are its own shape, so there is no field
 * list to walk; the statable invariant — no capture instant anywhere inside
 * policy evidence contributes to identity — is the one that survives the shape
 * changing underneath it.
 */
export function policyEvidenceIdentity<T>(evidence: T): T {
  return stripCaptureInstant(evidence) as T
}

function stripCaptureInstant(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripCaptureInstant)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== POLICY_CAPTURE_INSTANT)
      .map(([key, item]) => [key, stripCaptureInstant(item)]),
  )
}

/**
 * The pricing, reduced to what a price fingerprint is allowed to depend on.
 *
 * A price fingerprint answers one question: has this quote's price moved since
 * we issued it. Commit re-composes the quote and compares, so anything in the
 * input that changes on every compose makes that comparison unconditionally
 * false — the quote is declared superseded, the hold is released, and no
 * booking can ever be made (voyant#4689).
 *
 * `policyEvidence.cancellation.capturedAt` was exactly that. Everything else
 * here is left alone: money, taxes, applied offers and the policy's own
 * identity all belong in the fingerprint, because a genuine change to any of
 * them genuinely does supersede the quote.
 */
export function priceFingerprintInput<T>(pricing: T): T {
  if (!pricing || typeof pricing !== "object") return pricing
  const breakdown = pricing as Record<string, unknown>
  if (breakdown.policyEvidence === undefined && breakdown.componentPolicies === undefined) {
    return pricing
  }
  return {
    ...breakdown,
    ...(breakdown.policyEvidence !== undefined
      ? { policyEvidence: policyEvidenceIdentity(breakdown.policyEvidence) }
      : {}),
    ...(breakdown.componentPolicies !== undefined
      ? { componentPolicies: policyEvidenceIdentity(breakdown.componentPolicies) }
      : {}),
  } as T
}

export const bookingPaymentScheduleV1 = z.object({
  scheduleType: z.enum(["deposit", "installment", "balance", "hold", "other"]),
  status: z.enum(["pending", "due", "paid", "waived", "cancelled", "expired"]),
  dueDate: z.string(),
  currency: z.string().length(3),
  amountCents: z.number().int().nonnegative(),
  notes: z.string().nullable().optional(),
})

/**
 * One row of the collection plan a shopper is shown before they commit.
 *
 * `scheduleType` mirrors finance's `PaymentScheduleEntryType`, which is a
 * narrower set than {@link bookingPaymentScheduleV1}'s: this describes what
 * `computePaymentSchedule` emits, not what a persisted schedule row may later
 * become. `"full"` is the collapse case — a policy with no deposit, a departure
 * too close for one, or a split that would leave a zero-cent partner.
 *
 * Nothing pins the mirror declaratively; the assignment in
 * `sessions-payment-production.ts` does it structurally, and a fourth entry
 * type in finance fails to compile there.
 */
export const bookingPaymentPlanEntryV1 = z.object({
  scheduleType: z.enum(["deposit", "balance", "full"]),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  /** ISO `YYYY-MM-DD`. */
  dueDate: z.string(),
})

/**
 * What the shopper will actually be charged, and when — published on the Quote
 * so a storefront can state the terms at the moment the shopper agrees to them.
 *
 * A shopper under a deposit policy used to review a total, accept a contract
 * naming that total, and then be charged something else, because nothing
 * carried the plan until Commit answered `payment_required` — after the review
 * step and after contract acceptance (voyant#4741).
 *
 * This is a pure projection over the Quote's total and the selected departure:
 * `resolveEffectivePaymentPolicy` then `computePaymentSchedule`, the same two
 * calls Commit makes. It is computed, never stored, so it cannot drift from the
 * Quote it is published on — and it is outside `pricing`, so it stays out of
 * the price fingerprint that supersession compares.
 *
 * `dueNowCents` is `entries[0].amountCents`, named separately because it is the
 * one number the pay button has to agree with.
 *
 * `payInFullCents` is the second button. A deposit is an option the operator
 * extends, not an obligation, so a shopper who would rather settle the whole
 * booking now may — by sending `payInFull` on Commit (voyant#4742). Publishing
 * the amount is what makes that a choice rather than a guess: a storefront can
 * render "Pay deposit €189.00" and "Pay in full €378.00" as two real options.
 * Null when there is nothing to choose, which today means the plan already
 * collects the whole total now, and is the seam an operator who has a reason
 * to refuse full prepayment would answer through.
 */
export const bookingPaymentPlanV1 = z.object({
  /** Which cascade layer the active policy came from. Mirrors finance's `PaymentPolicySource`. */
  policySource: z.enum([
    "booking",
    "proposal",
    "listing",
    "category",
    "supplier",
    "operator_default",
  ]),
  currency: z.string().length(3),
  totalCents: z.number().int().nonnegative(),
  dueNowCents: z.number().int().nonnegative(),
  /** What settling everything now costs, or null when that is not on offer. */
  payInFullCents: z.number().int().nonnegative().nullable(),
  entries: z.array(bookingPaymentPlanEntryV1).min(1),
})

export type BookingPaymentPlanEntryV1 = z.infer<typeof bookingPaymentPlanEntryV1>
export type BookingPaymentPlanV1 = z.infer<typeof bookingPaymentPlanV1>
