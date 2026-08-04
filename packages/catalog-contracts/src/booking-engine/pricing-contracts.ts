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

export const pricingBreakdownV1 = z.object({
  currency: z.string().length(3),
  lines: z.array(pricingLineV1),
  taxes: z.array(pricingTaxV1),
  subtotal: z.number().int(),
  taxTotal: z.number().int(),
  total: z.number().int(),
  /** Fresh policy evidence for a leaf Quote. */
  policyEvidence: bookingPolicyEvidenceV1.optional(),
  /** Component-tagged policy evidence for an aggregate Trip Quote. */
  componentPolicies: z
    .array(bookingPolicyEvidenceV1.extend({ componentId: z.string().min(1) }))
    .optional(),
})
export type PricingBreakdownV1 = z.infer<typeof pricingBreakdownV1>

export const bookingPaymentScheduleV1 = z.object({
  scheduleType: z.enum(["deposit", "installment", "balance", "hold", "other"]),
  status: z.enum(["pending", "due", "paid", "waived", "cancelled", "expired"]),
  dueDate: z.string(),
  currency: z.string().length(3),
  amountCents: z.number().int().nonnegative(),
  notes: z.string().nullable().optional(),
})
