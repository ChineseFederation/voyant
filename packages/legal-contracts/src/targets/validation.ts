import { z } from "zod"

export const legalTargetKindSchema = z.enum([
  "booking",
  "proposal_version",
  "program",
  "product",
  "inventory_item",
  "supplier_channel_relationship",
  "provider_source_ref",
])

export type LegalTargetKind = z.infer<typeof legalTargetKindSchema>

function optionalNullableString(schema: z.ZodString = z.string()) {
  return z
    .union([z.literal("").transform(() => undefined), schema])
    .optional()
    .nullable()
}

export const legalTargetRefFieldsSchema = z.object({
  targetKind: legalTargetKindSchema.optional().nullable(),
  targetId: optionalNullableString(),
  targetProvider: optionalNullableString(z.string().trim().min(1).max(100)),
  targetSourceRef: optionalNullableString(z.string().trim().min(1).max(500)),
  legacyTransactionOfferId: optionalNullableString(),
  legacyTransactionOrderId: optionalNullableString(),
})

export const legalTargetListQueryFieldsSchema = z.object({
  targetKind: legalTargetKindSchema.optional(),
  targetId: z.string().optional(),
  targetProvider: z.string().optional(),
  targetSourceRef: z.string().optional(),
  legacyTransactionOfferId: z.string().optional(),
  legacyTransactionOrderId: z.string().optional(),
})

export type LegalTargetRefFields = z.infer<typeof legalTargetRefFieldsSchema>

export function hasExplicitLegalTarget(value: LegalTargetRefFields): boolean {
  if (!value.targetKind) return false
  if (value.targetKind === "provider_source_ref") {
    return Boolean(value.targetProvider && value.targetSourceRef)
  }
  return Boolean(value.targetId)
}

export function hasLegalTargetOrCompatibilityRef(value: LegalTargetRefFields): boolean {
  return (
    hasExplicitLegalTarget(value) ||
    Boolean(value.legacyTransactionOfferId || value.legacyTransactionOrderId)
  )
}

export const legalTargetRefSchema = legalTargetRefFieldsSchema.refine(hasExplicitLegalTarget, {
  message:
    "targetKind plus targetId is required, or targetProvider plus targetSourceRef for provider_source_ref targets",
  path: ["targetKind"],
})
