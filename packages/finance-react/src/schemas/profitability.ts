import { z } from "zod"

import { singleEnvelope } from "./common.js"

export const profitabilityCostByServiceTypeSchema = z.object({
  serviceType: z.string(),
  currency: z.string(),
  amountCents: z.number().int(),
})
export type ProfitabilityCostByServiceType = z.infer<typeof profitabilityCostByServiceTypeSchema>

export const profitabilityUnattributedSchema = z.object({
  currency: z.string(),
  amountCents: z.number().int(),
})
export type ProfitabilityUnattributed = z.infer<typeof profitabilityUnattributedSchema>

/**
 * The under-allocated remainder of recorded supplier cost — an invoice total
 * minus every allocation row against it. Distinct from `unattributed`, which is
 * cost deliberately allocated to no departure.
 */
export const profitabilityUnallocatedSchema = z.object({
  currency: z.string(),
  amountCents: z.number().int(),
})
export type ProfitabilityUnallocated = z.infer<typeof profitabilityUnallocatedSchema>

export const departureProfitabilityRowSchema = z.object({
  departureId: z.string(),
  departureLabel: z.string().nullable(),
  productId: z.string().nullable(),
  productName: z.string().nullable(),
  departureDate: z.string().nullable(),
  currency: z.string(),
  revenueCents: z.number().int(),
  actualCostCents: z.number().int(),
  plannedCostCents: z.number().int(),
  profitCents: z.number().int(),
  marginPercent: z.number().nullable(),
  varianceCents: z.number().int(),
})
export type DepartureProfitabilityRow = z.infer<typeof departureProfitabilityRowSchema>

export const departureProfitabilityBaseRollupSchema = z.object({
  currency: z.string(),
  rows: z.array(departureProfitabilityRowSchema),
  costByServiceType: z.array(profitabilityCostByServiceTypeSchema),
  unattributedCents: z.number().int(),
  unallocatedCents: z.number().int(),
  unconvertibleCurrencies: z.array(z.string()),
})
export type DepartureProfitabilityBaseRollup = z.infer<
  typeof departureProfitabilityBaseRollupSchema
>

export const departureProfitabilityReportSchema = z.object({
  rows: z.array(departureProfitabilityRowSchema),
  costByServiceType: z.array(profitabilityCostByServiceTypeSchema),
  unattributed: z.array(profitabilityUnattributedSchema),
  unallocated: z.array(profitabilityUnallocatedSchema),
  base: departureProfitabilityBaseRollupSchema.optional(),
})
export type DepartureProfitabilityReport = z.infer<typeof departureProfitabilityReportSchema>

export const productProfitabilityRowSchema = z.object({
  productId: z.string(),
  productName: z.string().nullable(),
  currency: z.string(),
  departureCount: z.number().int(),
  revenueCents: z.number().int(),
  actualCostCents: z.number().int(),
  plannedCostCents: z.number().int(),
  profitCents: z.number().int(),
  marginPercent: z.number().nullable(),
  varianceCents: z.number().int(),
})
export type ProductProfitabilityRow = z.infer<typeof productProfitabilityRowSchema>

export const productProfitabilityBaseRollupSchema = z.object({
  currency: z.string(),
  rows: z.array(productProfitabilityRowSchema),
  costByServiceType: z.array(profitabilityCostByServiceTypeSchema),
  unattributedCents: z.number().int(),
  unallocatedCents: z.number().int(),
  unconvertibleCurrencies: z.array(z.string()),
})
export type ProductProfitabilityBaseRollup = z.infer<typeof productProfitabilityBaseRollupSchema>

export const productProfitabilityReportSchema = z.object({
  rows: z.array(productProfitabilityRowSchema),
  costByServiceType: z.array(profitabilityCostByServiceTypeSchema),
  unattributed: z.array(profitabilityUnattributedSchema),
  unallocated: z.array(profitabilityUnallocatedSchema),
  base: productProfitabilityBaseRollupSchema.optional(),
})
export type ProductProfitabilityReport = z.infer<typeof productProfitabilityReportSchema>

export const travelerProfitabilityRowSchema = z.object({
  travelerId: z.string(),
  travelerName: z.string(),
  bookingId: z.string(),
  currency: z.string(),
  revenueCents: z.number().int(),
  actualCostCents: z.number().int(),
  plannedCostCents: z.number().int(),
  profitCents: z.number().int(),
  marginPercent: z.number().nullable(),
  varianceCents: z.number().int(),
})
export type TravelerProfitabilityRow = z.infer<typeof travelerProfitabilityRowSchema>

export const travelerProfitabilityReportSchema = z.object({
  departureId: z.string(),
  currency: z.string(),
  travelerCount: z.number().int(),
  rows: z.array(travelerProfitabilityRowSchema),
})
export type TravelerProfitabilityReport = z.infer<typeof travelerProfitabilityReportSchema>

export const departureProfitabilityResponse = singleEnvelope(departureProfitabilityReportSchema)
export const productProfitabilityResponse = singleEnvelope(productProfitabilityReportSchema)
export const travelerProfitabilityResponse = singleEnvelope(travelerProfitabilityReportSchema)
