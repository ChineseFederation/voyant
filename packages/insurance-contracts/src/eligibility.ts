import { z } from "zod"

/**
 * Why an insurer will not cover a request, expressed as a code a caller can
 * branch on plus a message it can show.
 *
 * Insurers refuse combinations of trip length, lead time, age, destination and
 * residency all the time, and that refusal is an ordinary outcome of asking for
 * a price — not a fault. It travels as data on the quote so a storefront can
 * explain it next to the plan it applies to, and so a traveller who is
 * ineligible with one insurer can still see that they are eligible with
 * another. An adapter that throws instead loses both of those.
 */
export const INSURANCE_ELIGIBILITY_REASON_CODES = [
  "trip_duration_exceeds_limit",
  "trip_starts_too_soon",
  "trip_starts_too_late",
  "purchase_window_closed",
  "traveler_age_above_maximum",
  "traveler_age_below_minimum",
  "party_size_exceeds_limit",
  "destination_not_covered",
  "residency_not_covered",
  "trip_cost_above_limit",
  "sum_insured_above_limit",
  "cover_not_available",
  "medical_declaration_required",
  "provider_declined",
  "other",
] as const

export type InsuranceEligibilityReasonCode = (typeof INSURANCE_ELIGIBILITY_REASON_CODES)[number]

export const insuranceEligibilityReasonCodeSchema = z.enum(INSURANCE_ELIGIBILITY_REASON_CODES)

/** What the reason is about, so a caller can anchor it to the right control. */
export const insuranceEligibilitySubjectSchema = z
  .object({
    kind: z.enum(["trip", "traveler", "cover", "policy"]),
    /**
     * For `traveler`, the `ref` from the quote request's traveller list. The
     * request carries ages and refs only, so this never identifies a person.
     */
    ref: z.string().optional(),
  })
  .strict()

export const insuranceEligibilityReasonSchema = z
  .object({
    code: insuranceEligibilityReasonCodeSchema,
    /**
     * The insurer's own wording where it has one, already localised. Callers
     * display this; they branch on `code`.
     */
    message: z.string().min(1),
    subject: insuranceEligibilitySubjectSchema,
    /** The insurer's raw reason identifier, kept for support and reconciliation. */
    providerReasonCode: z.string().optional(),
  })
  .strict()

export type InsuranceEligibilityReason = z.infer<typeof insuranceEligibilityReasonSchema>

export const INSURANCE_ELIGIBILITY_STATUSES = ["eligible", "ineligible", "referral"] as const

export type InsuranceEligibilityStatus = (typeof INSURANCE_ELIGIBILITY_STATUSES)[number]

/**
 * `referral` is the insurer saying "not automatically, but a human may still
 * accept this" — commonly a medical declaration. It is deliberately distinct
 * from `ineligible`, because presenting the two the same way tells a traveller
 * they cannot buy something they can in fact buy.
 */
export const insuranceEligibilitySchema = z
  .object({
    status: z.enum(INSURANCE_ELIGIBILITY_STATUSES),
    reasons: z.array(insuranceEligibilityReasonSchema).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status !== "eligible" && value.reasons.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["reasons"],
        message: `eligibility status "${value.status}" requires at least one reason`,
      })
    }
  })

export type InsuranceEligibility = z.infer<typeof insuranceEligibilitySchema>

/** Convenience for the common, uninteresting case. */
export const INSURANCE_ELIGIBLE: InsuranceEligibility = { status: "eligible", reasons: [] }

/** True when the outcome permits the traveller to buy without intervention. */
export function isInsurancePurchasable(eligibility: InsuranceEligibility): boolean {
  return eligibility.status === "eligible"
}
