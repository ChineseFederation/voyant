import { z } from "zod"
import {
  legalTargetListQueryFieldsSchema,
  legalTargetRefFieldsSchema,
} from "../targets/validation.js"

export const policyKindSchema = z.enum([
  "cancellation",
  "payment",
  "terms_and_conditions",
  "privacy",
  "refund",
  "commission",
  "guarantee",
  "other",
])

export const policyVersionStatusSchema = z.enum(["draft", "published", "retired"])

export const policyRuleTypeSchema = z.enum([
  "window",
  "percentage",
  "flat_amount",
  "date_range",
  "custom",
])

export const policyRefundTypeSchema = z.enum(["cash", "credit", "cash_or_credit", "none"])

export const policyAssignmentScopeSchema = z.enum([
  "product",
  "channel",
  "supplier",
  "market",
  "organization",
  "global",
])

export const policyAcceptanceMethodSchema = z.enum(["implicit", "explicit_checkbox", "signature"])

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

type StripDefault<T extends z.core.SomeType> = T extends z.ZodDefault<infer U> ? U : T
type StripDefaultShape<T extends z.ZodRawShape> = {
  [K in keyof T]: StripDefault<T[K]>
}

const stripDefaultsFromShape = <T extends z.ZodRawShape>(shape: T): StripDefaultShape<T> =>
  Object.fromEntries(
    Object.entries(shape).map(([key, schema]) => [
      key,
      schema instanceof z.ZodDefault ? schema.unwrap() : schema,
    ]),
  ) as StripDefaultShape<T>

const partialWithoutDefaults = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  z.object(stripDefaultsFromShape(schema.shape)).partial()

// ---------- policies ----------

const policyCoreSchema = z.object({
  kind: policyKindSchema,
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "slug must be kebab-case"),
  description: z.string().max(2000).optional().nullable(),
  language: z.string().min(2).max(10).default("en"),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
})

export const insertPolicySchema = policyCoreSchema
export const updatePolicySchema = partialWithoutDefaults(policyCoreSchema)

export const policyListQuerySchema = paginationSchema.extend({
  kind: policyKindSchema.optional(),
  language: z.string().optional(),
  search: z.string().optional(),
})

// ---------- policy_versions ----------

const policyVersionCoreSchema = z.object({
  title: z.string().min(1).max(500),
  body: z.string().optional().nullable(),
  publishedBy: z.string().max(255).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
})

export const insertPolicyVersionSchema = policyVersionCoreSchema
export const updatePolicyVersionSchema = policyVersionCoreSchema.partial()

// ---------- policy_rules ----------

const policyRuleCoreSchema = z.object({
  ruleType: policyRuleTypeSchema,
  label: z.string().max(255).optional().nullable(),
  daysBeforeDeparture: z.number().int().optional().nullable(),
  refundPercent: z.number().int().min(0).max(10000).optional().nullable(),
  refundType: policyRefundTypeSchema.optional().nullable(),
  flatAmountCents: z.number().int().optional().nullable(),
  currency: z.string().max(10).optional().nullable(),
  validFrom: z.string().optional().nullable(),
  validTo: z.string().optional().nullable(),
  conditions: z.record(z.string(), z.unknown()).optional().nullable(),
  sortOrder: z.number().int().default(0),
})

export const insertPolicyRuleSchema = policyRuleCoreSchema
export const updatePolicyRuleSchema = partialWithoutDefaults(policyRuleCoreSchema)

// ---------- policy_assignments ----------

const policyAssignmentCoreSchema = z.object({
  policyId: z.string(),
  scope: policyAssignmentScopeSchema,
  productId: z.string().optional().nullable(),
  channelId: z.string().optional().nullable(),
  supplierId: z.string().optional().nullable(),
  marketId: z.string().optional().nullable(),
  organizationId: z.string().optional().nullable(),
  validFrom: z.string().optional().nullable(),
  validTo: z.string().optional().nullable(),
  priority: z.number().int().default(0),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
})

export const insertPolicyAssignmentSchema = policyAssignmentCoreSchema
export const updatePolicyAssignmentSchema = policyAssignmentCoreSchema.partial()

export const policyAssignmentListQuerySchema = paginationSchema.extend({
  policyId: z.string().optional(),
  scope: policyAssignmentScopeSchema.optional(),
  productId: z.string().optional(),
  channelId: z.string().optional(),
  supplierId: z.string().optional(),
  marketId: z.string().optional(),
  organizationId: z.string().optional(),
})

// ---------- policy_acceptances ----------

const policyAcceptanceCoreSchema = z.object({
  policyVersionId: z.string(),
  personId: z.string().optional().nullable(),
  bookingId: z.string().optional().nullable(),
  ...legalTargetRefFieldsSchema.shape,
  acceptedBy: z.string().max(255).optional().nullable(),
  method: policyAcceptanceMethodSchema.default("implicit"),
  ipAddress: z.string().max(64).optional().nullable(),
  userAgent: z.string().max(500).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
})

export const insertPolicyAcceptanceSchema = policyAcceptanceCoreSchema

export const policyAcceptanceListQuerySchema = paginationSchema.extend({
  policyId: z.string().optional(),
  policyVersionId: z.string().optional(),
  personId: z.string().optional(),
  bookingId: z.string().optional(),
  ...legalTargetListQueryFieldsSchema.shape,
})

// ---------- evaluation ----------

export const evaluateCancellationInputSchema = z.object({
  daysBeforeDeparture: z.number().int(),
  totalCents: z.number().int().min(0),
  currency: z.string().max(10).optional(),
})

export const cancellationPolicySnapshotRuleV1Schema = z.object({
  id: z.string().optional(),
  daysBeforeDeparture: z.number().int().nullable(),
  refundPercent: z.number().int().min(0).max(10000).nullable(),
  refundType: policyRefundTypeSchema.nullable(),
  flatAmountCents: z.number().int().min(0).nullable(),
  currency: z.string().max(10).nullable(),
  label: z.string().max(255).nullable(),
})

/** Immutable cancellation terms copied from one published policy version. */
export const cancellationPolicySnapshotV1Schema = z.object({
  schemaVersion: z.literal(1),
  policyId: z.string().min(1),
  policyVersionId: z.string().min(1),
  version: z.number().int().positive(),
  capturedAt: z.string().datetime(),
  rules: z.array(cancellationPolicySnapshotRuleV1Schema),
})

export type CancellationPolicySnapshotV1 = z.infer<typeof cancellationPolicySnapshotV1Schema>

export const resolvePolicyInputSchema = z.object({
  kind: policyKindSchema,
  productId: z.string().optional(),
  channelId: z.string().optional(),
  supplierId: z.string().optional(),
  marketId: z.string().optional(),
  organizationId: z.string().optional(),
  at: z.string().optional(), // ISO date for validFrom/validTo filtering
})
