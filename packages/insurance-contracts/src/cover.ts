import { z } from "zod"
import { insuranceMoneySchema } from "./money.js"

/**
 * What a policy actually protects against.
 *
 * These categories are the part of an insurance product that means the same
 * thing across insurers: every insurer that sells travel cover has a medical
 * limit and a cancellation limit, and those limits are comparable. Plan names
 * and tiers are not — see `planTier` on the quote.
 */
export const INSURANCE_COVER_CATEGORIES = [
  "medical_expenses",
  "emergency_assistance",
  "repatriation",
  "trip_cancellation",
  "trip_curtailment",
  "travel_delay",
  "missed_departure",
  "baggage",
  "personal_money",
  "personal_liability",
  "personal_accident",
  "legal_expenses",
  "winter_sports",
  "adventure_activities",
  "business_equipment",
  "gadget",
  "rental_vehicle_excess",
  "other",
] as const

export type InsuranceCoverCategory = (typeof INSURANCE_COVER_CATEGORIES)[number]

export const insuranceCoverCategorySchema = z.enum(INSURANCE_COVER_CATEGORIES)

/** What a limit is measured against. */
export const INSURANCE_COVER_LIMIT_BASES = [
  "per_person",
  "per_policy",
  "per_item",
  "per_day",
  "per_claim",
] as const

export const insuranceCoverLimitBasisSchema = z.enum(INSURANCE_COVER_LIMIT_BASES)

export const insuranceCoverSchema = z
  .object({
    category: insuranceCoverCategorySchema,
    /** The insurer's own wording for this cover, already localised. */
    label: z.string().min(1),
    /**
     * `false` marks a cover the insurer names but does not provide on this
     * plan. Carrying it explicitly is what lets a storefront show "baggage: not
     * covered" instead of silently omitting the line, which reads as an
     * oversight rather than a term.
     */
    included: z.boolean(),
    /** The maximum the insurer will pay. Absent when the insurer states none. */
    sumInsured: insuranceMoneySchema.optional(),
    limitBasis: insuranceCoverLimitBasisSchema.optional(),
    /** What the traveller bears before the insurer pays. */
    excess: insuranceMoneySchema.optional(),
    notes: z.string().optional(),
  })
  .strict()

export type InsuranceCover = z.infer<typeof insuranceCoverSchema>

/**
 * A cover the traveller may add for extra premium.
 *
 * There is no `selected` or `default` field, by design: nothing on an insurance
 * offer may arrive pre-ticked, so there is nowhere for a default to be
 * expressed. A caller records what the traveller chose in the application.
 */
export const insuranceOptionalCoverSchema = insuranceCoverSchema
  .omit({ included: true })
  .extend({
    /** Stable within a quote; the application refers back to it. */
    id: z.string().min(1),
    /** Additional premium if taken, on top of the plan premium. */
    premium: insuranceMoneySchema,
  })
  .strict()

export type InsuranceOptionalCover = z.infer<typeof insuranceOptionalCoverSchema>

/**
 * The single comparable headline across insurers: the medical limit, falling
 * back to the largest stated limit when an insurer does not sell medical cover.
 *
 * Returns `null` when nothing on the plan states a limit, which is a real
 * answer and not an error.
 */
export function headlineSumInsured(covers: readonly InsuranceCover[]) {
  const included = covers.filter((cover) => cover.included && cover.sumInsured)
  const medical = included.find((cover) => cover.category === "medical_expenses")
  if (medical?.sumInsured) return medical.sumInsured
  let largest: InsuranceCover["sumInsured"]
  for (const cover of included) {
    if (!cover.sumInsured) continue
    if (!largest || cover.sumInsured.amountMinor > largest.amountMinor) {
      largest = cover.sumInsured
    }
  }
  return largest ?? null
}
