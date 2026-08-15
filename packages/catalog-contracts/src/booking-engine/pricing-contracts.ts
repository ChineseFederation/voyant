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
