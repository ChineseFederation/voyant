import { z } from "zod"

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const channelPublicationDecisionSchema = z.enum(["include", "exclude"])
export const channelPublicationReindexIntentStatusSchema = z.enum([
  "pending",
  "processing",
  "completed",
  "failed",
])
export const channelPublicationReindexIntentKindSchema = z.enum([
  "product",
  "supplier",
  "source",
  "catalog",
])
export const effectivePublicationReasonSchema = z.enum([
  "channel_missing",
  "channel_inactive",
  "product_decision",
  "supplier_decision",
  "default_deny",
  "product_missing_supplier",
  "product_eligibility",
])
export const effectiveSourcePublicationReasonSchema = z.enum([
  "channel_missing",
  "channel_inactive",
  "connection_decision",
  "source_kind_decision",
  "default_deny",
])

const publicationMetadataSchema = z.record(z.string(), z.unknown()).nullable().optional()

export const productPublicationSubjectSchema = z
  .object({
    channelId: z.string().min(1),
    productId: z.string().min(1),
  })
  .strict()

export const supplierPublicationSubjectSchema = z
  .object({
    channelId: z.string().min(1),
    supplierId: z.string().min(1),
  })
  .strict()

/**
 * Subject of a source publication rule. A null/absent `sourceConnectionId`
 * addresses every connection of that kind rather than a specific one, so the
 * two forms are deliberately the same shape.
 */
export const sourcePublicationSubjectSchema = z
  .object({
    channelId: z.string().min(1),
    sourceKind: z.string().min(1),
    sourceConnectionId: z.string().min(1).nullable().optional(),
  })
  .strict()

export const channelProductPublicationCoreSchema = productPublicationSubjectSchema
  .extend({
    decision: channelPublicationDecisionSchema,
    reason: z.string().min(1).nullable().optional(),
    createdBy: z.string().min(1).nullable().optional(),
    updatedBy: z.string().min(1).nullable().optional(),
    metadata: publicationMetadataSchema,
  })
  .strict()

export const channelSupplierPublicationCoreSchema = supplierPublicationSubjectSchema
  .extend({
    decision: channelPublicationDecisionSchema,
    reason: z.string().min(1).nullable().optional(),
    createdBy: z.string().min(1).nullable().optional(),
    updatedBy: z.string().min(1).nullable().optional(),
    metadata: publicationMetadataSchema,
  })
  .strict()

export const insertChannelProductPublicationSchema = channelProductPublicationCoreSchema
export const updateChannelProductPublicationSchema = channelProductPublicationCoreSchema
  .omit({ channelId: true, productId: true, createdBy: true })
  .partial()
  .strict()
export const channelProductPublicationListQuerySchema = paginationSchema
  .extend({
    channelId: z.string().optional(),
    productId: z.string().optional(),
    decision: channelPublicationDecisionSchema.optional(),
  })
  .strict()

export const insertChannelSupplierPublicationSchema = channelSupplierPublicationCoreSchema
export const previewChannelSupplierPublicationSchema = channelSupplierPublicationCoreSchema
  .omit({ createdBy: true, updatedBy: true })
  .strict()
export const updateChannelSupplierPublicationSchema = channelSupplierPublicationCoreSchema
  .omit({ channelId: true, supplierId: true, createdBy: true })
  .partial()
  .strict()
export const channelSupplierPublicationListQuerySchema = paginationSchema
  .extend({
    channelId: z.string().optional(),
    supplierId: z.string().optional(),
    decision: channelPublicationDecisionSchema.optional(),
  })
  .strict()

export const channelSourcePublicationCoreSchema = sourcePublicationSubjectSchema
  .extend({
    decision: channelPublicationDecisionSchema,
    reason: z.string().min(1).nullable().optional(),
    createdBy: z.string().min(1).nullable().optional(),
    updatedBy: z.string().min(1).nullable().optional(),
    metadata: publicationMetadataSchema,
  })
  .strict()

export const insertChannelSourcePublicationSchema = channelSourcePublicationCoreSchema
export const previewChannelSourcePublicationSchema = channelSourcePublicationCoreSchema
  .omit({ createdBy: true, updatedBy: true })
  .strict()
export const updateChannelSourcePublicationSchema = channelSourcePublicationCoreSchema
  .omit({ channelId: true, sourceKind: true, sourceConnectionId: true, createdBy: true })
  .partial()
  .strict()
export const channelSourcePublicationListQuerySchema = paginationSchema
  .extend({
    channelId: z.string().optional(),
    sourceKind: z.string().optional(),
    sourceConnectionId: z.string().optional(),
    decision: channelPublicationDecisionSchema.optional(),
  })
  .strict()

export const effectiveSourcePublicationInputSchema = sourcePublicationSubjectSchema

export const effectivePublicationInputSchema = z
  .object({
    channelId: z.string().min(1),
    productId: z.string().min(1),
    canonicalSupplierId: z.string().min(1).nullable().optional(),
  })
  .strict()

export const effectivePublicationResultSchema = z
  .object({
    channelId: z.string(),
    productId: z.string(),
    canonicalSupplierId: z.string().nullable(),
    published: z.boolean(),
    decision: channelPublicationDecisionSchema.nullable(),
    reason: effectivePublicationReasonSchema,
    source: z.enum(["product", "supplier", "channel", "default", "eligibility"]),
    ruleId: z.string().nullable(),
    message: z.string(),
  })
  .strict()

export const effectiveSourcePublicationResultSchema = z
  .object({
    channelId: z.string(),
    sourceKind: z.string(),
    sourceConnectionId: z.string().nullable(),
    published: z.boolean(),
    decision: channelPublicationDecisionSchema.nullable(),
    reason: effectiveSourcePublicationReasonSchema,
    source: z.enum(["connection", "source_kind", "channel", "default"]),
    ruleId: z.string().nullable(),
    message: z.string(),
  })
  .strict()

export const channelPublicationReindexIntentSchema = z
  .object({
    id: z.string(),
    channelId: z.string().nullable(),
    kind: channelPublicationReindexIntentKindSchema,
    productId: z.string().nullable(),
    supplierId: z.string().nullable(),
    sourceKind: z.string().nullable(),
    sourceConnectionId: z.string().nullable(),
    cursor: z.string().nullable(),
    status: channelPublicationReindexIntentStatusSchema,
    attempts: z.number().int(),
    nextAttemptAt: z.string(),
    leaseOwner: z.string().nullable(),
    leaseUntil: z.string().nullable(),
    requestedBy: z.string().nullable(),
    lastError: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    requestedAt: z.string(),
    processingStartedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    updatedAt: z.string(),
  })
  .strict()
