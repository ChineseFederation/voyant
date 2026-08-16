import { z } from "zod"
import { insuranceCoverSchema, insuranceOptionalCoverSchema } from "./cover.js"
import { insuranceDisclosureSchema } from "./disclosure.js"
import { insuranceEligibilitySchema } from "./eligibility.js"
import {
  insuranceCountryCodeSchema,
  insuranceCurrencySchema,
  insuranceDateSchema,
  insuranceInstantSchema,
  insuranceMoneySchema,
} from "./money.js"

/** Where the traveller is going, at the granularity insurers actually price on. */
export const insuranceDestinationScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("domestic") }).strict(),
  z.object({ kind: z.literal("continental") }).strict(),
  z.object({ kind: z.literal("worldwide") }).strict(),
  z
    .object({
      kind: z.literal("worldwide_excluding"),
      excludedCountries: z.array(insuranceCountryCodeSchema).min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("countries"),
      countries: z.array(insuranceCountryCodeSchema).min(1),
    })
    .strict(),
])

export type InsuranceDestinationScope = z.infer<typeof insuranceDestinationScopeSchema>

export const INSURANCE_TRAVEL_PURPOSES = [
  "leisure",
  "business",
  "study",
  "winter_sports",
  "adventure_sports",
  "mixed",
  "other",
] as const

export const insuranceTravelPurposeSchema = z.enum(INSURANCE_TRAVEL_PURPOSES)

/**
 * A traveller as the quote step knows them: an age and a local reference.
 *
 * Pricing needs an age band and nothing else, so nothing else is here. Names,
 * dates of birth and identity documents are collected only once the traveller
 * has accepted an offer, and they live on the application rather than the
 * quote. Keeping the shapes separate is what makes "quote without personal
 * data" a property of the type rather than a rule someone has to remember.
 */
export const insuranceQuoteTravelerSchema = z
  .object({
    /** Caller-assigned, stable within the request; echoed back on reasons. */
    ref: z.string().min(1),
    age: z.number().int().min(0).max(130),
    residencyCountry: insuranceCountryCodeSchema.optional(),
  })
  .strict()

export type InsuranceQuoteTraveler = z.infer<typeof insuranceQuoteTravelerSchema>

export const insuranceQuoteRequestSchema = z
  .object({
    tripStartDate: insuranceDateSchema,
    tripEndDate: insuranceDateSchema,
    destinationScope: insuranceDestinationScopeSchema,
    travelPurpose: insuranceTravelPurposeSchema,
    travelers: z.array(insuranceQuoteTravelerSchema).min(1),
    /** What the traveller stands to lose, which is what cancellation cover prices on. */
    tripCost: insuranceMoneySchema.optional(),
    /** Cover categories the caller wants priced, when the operator narrows the ask. */
    requestedCovers: z.array(insuranceCoverSchema.shape.category).optional(),
    /** The currency the caller wants to be quoted in; the insurer may decline. */
    currency: insuranceCurrencySchema,
    locale: z.string().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.tripEndDate < value.tripStartDate) {
      ctx.addIssue({
        code: "custom",
        path: ["tripEndDate"],
        message: "tripEndDate must not precede tripStartDate",
      })
    }
    const refs = new Set<string>()
    for (const [index, traveler] of value.travelers.entries()) {
      if (refs.has(traveler.ref)) {
        ctx.addIssue({
          code: "custom",
          path: ["travelers", index, "ref"],
          message: `duplicate traveler ref "${traveler.ref}"`,
        })
      }
      refs.add(traveler.ref)
    }
  })

export type InsuranceQuoteRequest = z.infer<typeof insuranceQuoteRequestSchema>

export const insuranceQuoteSchema = z
  .object({
    quoteId: z.string().min(1),
    providerId: z.string().min(1),
    /** How the insurer is named to the traveller. */
    providerLabel: z.string().min(1),
    planId: z.string().min(1),
    planName: z.string().min(1),
    /**
     * The insurer's own tier wording — "Silver", "Comfort", "Plus".
     *
     * Tiers are an insurer's invention and mean different things to each of
     * them, so this is a **display label only**: never a sort key, never a
     * branch condition, and never comparable across providers. What is
     * comparable is `premium`, `sumInsured`, `excess` and the cover categories.
     */
    planTier: z.string().optional(),
    premium: insuranceMoneySchema,
    /** The headline limit, when the insurer states one for the plan as a whole. */
    sumInsured: insuranceMoneySchema.optional(),
    /** The standard excess, when it is uniform across covers. */
    excess: insuranceMoneySchema.optional(),
    includedCovers: z.array(insuranceCoverSchema).default([]),
    optionalCovers: z.array(insuranceOptionalCoverSchema).default([]),
    eligibility: insuranceEligibilitySchema,
    disclosures: z.array(insuranceDisclosureSchema).default([]),
    /**
     * The insurer holds this price until here and no longer. A quote is an
     * offer with a bounded window, not a catalogue entry.
     */
    validUntil: insuranceInstantSchema,
    /** Opaque to everything except the provider that issued it. */
    providerReference: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

export type InsuranceQuote = z.infer<typeof insuranceQuoteSchema>

/**
 * Whether the quote may still be acted on.
 *
 * `at` is passed in rather than read from the clock so callers stay testable
 * and so a batch reconciling many quotes evaluates them all against one instant.
 */
export function isInsuranceQuoteValidAt(quote: InsuranceQuote, at: Date): boolean {
  const validUntil = Date.parse(quote.validUntil)
  return Number.isFinite(validUntil) && validUntil > at.getTime()
}

/**
 * The neutral ordering: purchasable first, then cheapest, then a stable
 * tie-break on insurer name and quote id.
 *
 * Deliberately not configurable by anything the operator earns from. An
 * operator may re-order for its own presentation, but the default must never
 * be "whatever pays us most", and there is no commission or margin field here
 * for such a sort to reach.
 */
export function orderInsuranceQuotes(quotes: readonly InsuranceQuote[]): InsuranceQuote[] {
  return [...quotes].sort((left, right) => {
    const leftPurchasable = left.eligibility.status === "eligible" ? 0 : 1
    const rightPurchasable = right.eligibility.status === "eligible" ? 0 : 1
    if (leftPurchasable !== rightPurchasable) return leftPurchasable - rightPurchasable
    if (left.premium.amountMinor !== right.premium.amountMinor) {
      return left.premium.amountMinor - right.premium.amountMinor
    }
    const byProvider = left.providerLabel.localeCompare(right.providerLabel)
    if (byProvider !== 0) return byProvider
    return left.quoteId.localeCompare(right.quoteId)
  })
}
