import {
  contractStageHistoryEntrySchema,
  insertContractAttachmentSchema,
  insertContractNumberSeriesSchema,
  insertContractSchema,
  insertContractSignatureSchema,
  insertContractTemplateSchema,
  insertContractTemplateVersionSchema,
} from "@voyant-travel/legal/contracts/validation"
import {
  insertPolicyAssignmentSchema,
  insertPolicyRuleSchema,
  insertPolicySchema,
  insertPolicyVersionSchema,
  policyAcceptanceMethodSchema,
  policyRefundTypeSchema,
  policyVersionStatusSchema,
} from "@voyant-travel/legal/policies/validation"
import {
  legalTermAcceptanceStatusSchema,
  legalTermTypeSchema,
} from "@voyant-travel/legal/terms/validation"
import { listResponseSchema } from "@voyant-travel/types"
import { z } from "zod"

const legalTargetKindSchema = z.enum([
  "booking",
  "proposal_version",
  "program",
  "product",
  "inventory_item",
  "supplier_channel_relationship",
  "provider_source_ref",
])

export const paginatedEnvelope = listResponseSchema

export const singleEnvelope = <T extends z.ZodTypeAny>(item: T) => z.object({ data: item })
export const successEnvelope = z.object({ success: z.boolean() })

export const legalContractRecordSchema = insertContractSchema.extend({
  id: z.string(),
  contractNumber: z.string().nullable(),
  stageHistory: z.array(contractStageHistoryEntrySchema),
  templateVersionId: z.string().nullable(),
  seriesId: z.string().nullable(),
  personId: z.string().nullable(),
  organizationId: z.string().nullable(),
  supplierId: z.string().nullable(),
  channelId: z.string().nullable(),
  bookingId: z.string().nullable(),
  targetKind: legalTargetKindSchema.nullable().optional(),
  targetId: z.string().nullable().optional(),
  targetProvider: z.string().nullable().optional(),
  targetSourceRef: z.string().nullable().optional(),
  legacyTransactionOfferId: z.string().nullable().optional(),
  legacyTransactionOrderId: z.string().nullable().optional(),
  personFirstName: z.string().nullable().optional(),
  personLastName: z.string().nullable().optional(),
  personEmail: z.string().nullable().optional(),
  personPhone: z.string().nullable().optional(),
  issuedAt: z.string().nullable().optional(),
  sentAt: z.string().nullable().optional(),
  executedAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  voidedAt: z.string().nullable().optional(),
  renderedBodyFormat: z.enum(["markdown", "html", "lexical_json"]),
  renderedBody: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type LegalContractRecord = z.infer<typeof legalContractRecordSchema>

export const legalContractSignatureRecordSchema = insertContractSignatureSchema.extend({
  id: z.string(),
  contractId: z.string(),
  signerEmail: z.string().nullable(),
  signerRole: z.string().nullable(),
  personId: z.string().nullable(),
  targetKind: legalTargetKindSchema.nullable().optional(),
  targetId: z.string().nullable().optional(),
  targetProvider: z.string().nullable().optional(),
  targetSourceRef: z.string().nullable().optional(),
  legacyTransactionOfferId: z.string().nullable().optional(),
  legacyTransactionOrderId: z.string().nullable().optional(),
  provider: z.string().nullable(),
  externalReference: z.string().nullable(),
  signatureData: z.string().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  signedAt: z.string(),
  createdAt: z.string(),
})

export type LegalContractSignatureRecord = z.infer<typeof legalContractSignatureRecordSchema>

export const legalContractAttachmentRecordSchema = insertContractAttachmentSchema.extend({
  id: z.string(),
  contractId: z.string(),
  mimeType: z.string().nullable(),
  fileSize: z.number().int().nullable(),
  storageKey: z.string().nullable(),
  checksum: z.string().nullable(),
  targetKind: legalTargetKindSchema.nullable().optional(),
  targetId: z.string().nullable().optional(),
  targetProvider: z.string().nullable().optional(),
  targetSourceRef: z.string().nullable().optional(),
  legacyTransactionOfferId: z.string().nullable().optional(),
  legacyTransactionOrderId: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string(),
})

export type LegalContractAttachmentRecord = z.infer<typeof legalContractAttachmentRecordSchema>
export const legalContractAttachmentSingleResponse = singleEnvelope(
  legalContractAttachmentRecordSchema,
)

export const legalContractTemplateRecordSchema = insertContractTemplateSchema.extend({
  id: z.string(),
  description: z.string().nullable(),
  channelId: z.string().nullable().optional(),
  isDefault: z.boolean(),
  variableSchema: z.record(z.string(), z.unknown()).nullable().optional(),
  currentVersionId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type LegalContractTemplateRecord = z.infer<typeof legalContractTemplateRecordSchema>

export const legalContractTemplateVersionRecordSchema = insertContractTemplateVersionSchema.extend({
  id: z.string(),
  templateId: z.string(),
  version: z.number().int(),
  variableSchema: z.record(z.string(), z.unknown()).nullable().optional(),
  changelog: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
})

export type LegalContractTemplateVersionRecord = z.infer<
  typeof legalContractTemplateVersionRecordSchema
>

export const legalContractNumberSeriesRecordSchema = insertContractNumberSeriesSchema.extend({
  id: z.string(),
  currentSequence: z.number().int(),
  resetAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type LegalContractNumberSeriesRecord = z.infer<typeof legalContractNumberSeriesRecordSchema>

export const legalPolicyRecordSchema = insertPolicySchema.extend({
  id: z.string(),
  description: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  currentVersionId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type LegalPolicyRecord = z.infer<typeof legalPolicyRecordSchema>

export const legalPolicyVersionRecordSchema = insertPolicyVersionSchema.extend({
  id: z.string(),
  policyId: z.string(),
  version: z.number().int(),
  status: policyVersionStatusSchema,
  body: z.string().nullable(),
  publishedAt: z.string().nullable(),
  publishedBy: z.string().nullable(),
  retiredAt: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type LegalPolicyVersionRecord = z.infer<typeof legalPolicyVersionRecordSchema>

export const legalPolicyRuleRecordSchema = insertPolicyRuleSchema.extend({
  id: z.string(),
  policyVersionId: z.string(),
  label: z.string().nullable(),
  daysBeforeDeparture: z.number().int().nullable(),
  refundPercent: z.number().int().nullable(),
  refundType: policyRefundTypeSchema.nullable().optional(),
  flatAmountCents: z.number().int().nullable(),
  currency: z.string().nullable(),
  validFrom: z.string().nullable().optional(),
  validTo: z.string().nullable().optional(),
  conditions: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type LegalPolicyRuleRecord = z.infer<typeof legalPolicyRuleRecordSchema>

export const legalPolicyAssignmentRecordSchema = insertPolicyAssignmentSchema.extend({
  id: z.string(),
  productId: z.string().nullable(),
  channelId: z.string().nullable(),
  supplierId: z.string().nullable(),
  marketId: z.string().nullable(),
  organizationId: z.string().nullable(),
  validFrom: z.string().nullable().optional(),
  validTo: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type LegalPolicyAssignmentRecord = z.infer<typeof legalPolicyAssignmentRecordSchema>

export const legalPolicyAcceptanceRecordSchema = z.object({
  id: z.string(),
  policyVersionId: z.string(),
  personId: z.string().nullable(),
  bookingId: z.string().nullable(),
  targetKind: legalTargetKindSchema.nullable().optional(),
  targetId: z.string().nullable().optional(),
  targetProvider: z.string().nullable().optional(),
  targetSourceRef: z.string().nullable().optional(),
  legacyTransactionOfferId: z.string().nullable().optional(),
  legacyTransactionOrderId: z.string().nullable().optional(),
  acceptedAt: z.string(),
  acceptedBy: z.string().nullable().optional(),
  method: policyAcceptanceMethodSchema,
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string(),
})

export type LegalPolicyAcceptanceRecord = z.infer<typeof legalPolicyAcceptanceRecordSchema>

export const legalTermRecordSchema = z.object({
  id: z.string(),
  contractId: z.string().nullable().optional(),
  policyVersionId: z.string().nullable().optional(),
  targetKind: legalTargetKindSchema.nullable().optional(),
  targetId: z.string().nullable().optional(),
  targetProvider: z.string().nullable().optional(),
  targetSourceRef: z.string().nullable().optional(),
  legacyTransactionOfferId: z.string().nullable().optional(),
  legacyTransactionOrderId: z.string().nullable().optional(),
  termType: legalTermTypeSchema,
  title: z.string(),
  body: z.string(),
  language: z.string().nullable().optional(),
  required: z.boolean(),
  sortOrder: z.number().int(),
  acceptanceStatus: legalTermAcceptanceStatusSchema,
  acceptedAt: z.string().nullable().optional(),
  acceptedBy: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type LegalTermRecord = z.infer<typeof legalTermRecordSchema>

/**
 * The un-redacted view of one managed booking-contract revision, served by
 * `GET /v1/admin/legal/contracts/{id}/booking-review`. It carries the
 * `revision` + `contentFingerprint` an operator confirms before issuing or
 * sending the revision (voyant#4706) — the generic contract detail redacts the
 * body and variables, so this is the only operator read that can support that
 * confirmation. Mirrored here rather than imported: the server schema lives
 * next to the Tool registry, which a browser package may not reach.
 */
export const legalBookingContractReviewSchema = z.object({
  contentFingerprint: z.string(),
  effectiveStatus: z.enum(["draft", "sent", "viewed", "declined", "signed", "void"]),
  revision: z.number().int(),
  previousRevisionId: z.string().nullable(),
  contract: z.object({
    id: z.string(),
    contractNumber: z.string().nullable(),
    status: z.string(),
    title: z.string(),
    language: z.string(),
    renderedBody: z.string().nullable(),
    renderedBodyFormat: z.string(),
  }),
  booking: z.object({
    id: z.string(),
    reference: z.string(),
    customerName: z.string().nullable(),
    customerEmail: z.string().nullable(),
    language: z.string(),
    currency: z.string(),
    totalAmountCents: z.number().int().nullable(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
  }),
  products: z.array(
    z.object({
      title: z.string(),
      quantity: z.number().int(),
      amountCents: z.number().int().nullable(),
      currency: z.string(),
    }),
  ),
  template: z.object({
    id: z.string(),
    name: z.string(),
    versionId: z.string(),
    version: z.number().int(),
    language: z.string(),
  }),
  delivery: z.object({
    recipient: z.string().nullable(),
    channel: z.enum(["email", "sms", "whatsapp"]).nullable(),
    sentRevision: z.number().int().nullable(),
    sentAt: z.string().nullable(),
    viewedAt: z.string().nullable(),
    declinedAt: z.string().nullable(),
    notificationsSuppressed: z.boolean(),
  }),
  voidConsequences: z.array(z.string()),
})

export type LegalBookingContractReview = z.infer<typeof legalBookingContractReviewSchema>
export const legalBookingContractReviewResponse = singleEnvelope(legalBookingContractReviewSchema)

export const legalContractListResponse = paginatedEnvelope(legalContractRecordSchema)
export const legalContractSingleResponse = singleEnvelope(legalContractRecordSchema)
export const legalContractSignatureListResponse = singleEnvelope(
  z.array(legalContractSignatureRecordSchema),
)
export const legalContractAttachmentListResponse = singleEnvelope(
  z.array(legalContractAttachmentRecordSchema),
)
export const legalContractTemplateListResponse = paginatedEnvelope(
  legalContractTemplateRecordSchema,
)
export const legalContractTemplateSingleResponse = singleEnvelope(legalContractTemplateRecordSchema)
export const legalContractTemplateVersionListResponse = singleEnvelope(
  z.array(legalContractTemplateVersionRecordSchema),
)
export const legalContractNumberSeriesListResponse = singleEnvelope(
  z.array(legalContractNumberSeriesRecordSchema),
)
export const legalContractNumberSeriesSingleResponse = singleEnvelope(
  legalContractNumberSeriesRecordSchema,
)
export const legalPolicyListResponse = paginatedEnvelope(legalPolicyRecordSchema)
export const legalPolicySingleResponse = singleEnvelope(legalPolicyRecordSchema)
export const legalPolicyVersionListResponse = singleEnvelope(
  z.array(legalPolicyVersionRecordSchema),
)
export const legalPolicyVersionSingleResponse = singleEnvelope(legalPolicyVersionRecordSchema)
export const legalPolicyRuleListResponse = singleEnvelope(z.array(legalPolicyRuleRecordSchema))
export const legalPolicyRuleSingleResponse = singleEnvelope(legalPolicyRuleRecordSchema)
export const legalPolicyAssignmentListResponse = singleEnvelope(
  z.array(legalPolicyAssignmentRecordSchema),
)
export const legalPolicyAssignmentSingleResponse = singleEnvelope(legalPolicyAssignmentRecordSchema)
export const legalPolicyAcceptanceListResponse = singleEnvelope(
  z.array(legalPolicyAcceptanceRecordSchema),
)
export const legalTermListResponse = paginatedEnvelope(legalTermRecordSchema)
export const legalTermSingleResponse = singleEnvelope(legalTermRecordSchema)

// Resolved policy returned by GET /v1/admin/legal/policies/resolve
export const resolvedPolicySchema = z.object({
  policy: legalPolicyRecordSchema,
  assignment: legalPolicyAssignmentRecordSchema,
  version: legalPolicyVersionRecordSchema.nullable(),
  rules: z.array(legalPolicyRuleRecordSchema),
})

export type ResolvedPolicy = z.infer<typeof resolvedPolicySchema>

export const resolvedPolicyResponse = z.object({
  data: resolvedPolicySchema.nullable(),
})

// Cancellation evaluation result from POST /v1/admin/legal/policies/:id/evaluate
export const cancellationRuleSchema = z.object({
  id: z.string().optional(),
  daysBeforeDeparture: z.number().int().nullable(),
  refundPercent: z.number().int().nullable(),
  refundType: z.enum(["cash", "credit", "cash_or_credit", "none"]).nullable(),
  flatAmountCents: z.number().int().nullable(),
  label: z.string().nullable(),
})

export const cancellationResultSchema = z.object({
  refundPercent: z.number().int(),
  refundCents: z.number().int(),
  refundType: z.enum(["cash", "credit", "cash_or_credit", "none"]),
  appliedRule: cancellationRuleSchema.nullable(),
})

export type CancellationResult = z.infer<typeof cancellationResultSchema>

export const cancellationResultResponse = singleEnvelope(cancellationResultSchema)
