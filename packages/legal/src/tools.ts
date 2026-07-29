// agent-quality: file-size exception -- owner: legal; contract lifecycle tools stay co-located because create/read/update/document handlers share one admission and schema surface.
import {
  admitHandlerActionPolicy,
  defineTool,
  READ_ONLY_RISK,
  requireService,
  type ToolContext,
  ToolError,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { z } from "zod"
import { LEGAL_CONTRACT_DOCUMENT_HANDLER_EXPECTATIONS } from "./contract-document-policy.js"
import { LEGAL_CONTRACT_DRAFT_HANDLER_EXPECTATION } from "./created-target-policy.js"
import { LEGAL_CONTRACT_LIFECYCLE_HANDLER_EXPECTATIONS } from "./existing-target-policy.js"

const OWNER = "@voyant-travel/legal"
const VERSION = "v1"
const STAFF_AUDIENCE = { source: "grant", allowed: ["staff"] } as const
const READ_SCOPES = ["legal:read"] as const
const WRITE_SCOPES = ["legal:write"] as const
const BOOKING_CONTRACT_REVIEW_SCOPES = ["legal:read", "bookings-pii:read"] as const
const scopeSchema = z.enum(["customer", "supplier", "partner", "channel", "other"])
const statusSchema = z.enum(["draft", "issued", "sent", "signed", "executed", "expired", "void"])
const bookingContractEffectiveStatusSchema = z.enum([
  "draft",
  "sent",
  "viewed",
  "signed",
  "declined",
  "void",
])
const policyKindSchema = z.enum([
  "cancellation",
  "payment",
  "terms_and_conditions",
  "privacy",
  "refund",
  "commission",
  "guarantee",
  "other",
])
const targetKindSchema = z.enum([
  "booking",
  "quote_version",
  "program",
  "product",
  "inventory_item",
  "supplier_channel_relationship",
  "provider_source_ref",
])
const pageSchema = z.object({
  total: z.number().int().nonnegative(),
  limit: z.number().int(),
  offset: z.number().int(),
})

export const legalContractSummarySchema = z.object({
  id: z.string(),
  contractNumber: z.string().nullable(),
  scope: scopeSchema,
  status: statusSchema,
  title: z.string(),
  bookingId: z.string().nullable(),
  personId: z.string().nullable(),
  organizationId: z.string().nullable(),
  supplierId: z.string().nullable(),
  language: z.string(),
  issuedAt: z.string().datetime().nullable(),
  sentAt: z.string().datetime().nullable(),
  executedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  voidedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export const legalContractDetailSchema = legalContractSummarySchema.extend({
  templateVersionId: z.string().nullable(),
  seriesId: z.string().nullable(),
  channelId: z.string().nullable(),
  targetKind: targetKindSchema.nullable(),
  targetId: z.string().nullable(),
  targetProvider: z.string().nullable(),
  targetSourceRef: z.string().nullable(),
  renderedBodyFormat: z.enum(["markdown", "html", "lexical_json"]),
  renderedBody: z.string().nullable(),
  variables: z.json().nullable(),
  metadata: z.json().nullable(),
  stageHistory: z.array(
    z.object({
      stage: statusSchema,
      previousStage: statusSchema.nullable(),
      transition: z.enum(["created", "issued", "sent", "signed", "executed", "voided"]),
      enteredAt: z.string(),
      actorId: z.string().nullable().optional(),
    }),
  ),
})
export const contractTemplateSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  scope: scopeSchema,
  language: z.string(),
  description: z.string().nullable(),
  currentVersionId: z.string().nullable(),
  channelId: z.string().nullable(),
  isDefault: z.boolean(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export const contractTemplateDetailSchema = contractTemplateSummarySchema.extend({
  body: z.string(),
  variableSchema: z.json().nullable(),
})
const policySummarySchema = z.object({
  id: z.string(),
  kind: policyKindSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  language: z.string(),
  currentVersionId: z.string().nullable(),
  metadata: z.json().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
const policyVersionSchema = z.object({
  id: z.string(),
  policyId: z.string(),
  version: z.number().int(),
  status: z.enum(["draft", "published", "retired"]),
  title: z.string(),
  body: z.string().nullable(),
  publishedAt: z.string().datetime().nullable(),
  retiredAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
const policyRuleSchema = z.object({
  id: z.string(),
  policyVersionId: z.string(),
  ruleType: z.enum(["window", "percentage", "flat_amount", "date_range", "custom"]),
  label: z.string().nullable(),
  daysBeforeDeparture: z.number().int().nullable(),
  refundPercent: z.number().int().nullable(),
  refundType: z.enum(["cash", "credit", "cash_or_credit", "none"]).nullable(),
  flatAmountCents: z.number().int().nullable(),
  currency: z.string().nullable(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  conditions: z.json().nullable(),
  sortOrder: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
const policyDetailSchema = z.object({
  policy: policySummarySchema,
  currentVersion: policyVersionSchema.nullable(),
  currentRules: z.array(policyRuleSchema),
})
const legalTermSchema = z.object({
  id: z.string(),
  contractId: z.string().nullable(),
  policyVersionId: z.string().nullable(),
  targetKind: targetKindSchema.nullable(),
  targetId: z.string().nullable(),
  termType: z.enum([
    "terms_and_conditions",
    "cancellation",
    "guarantee",
    "payment",
    "pricing",
    "commission",
    "other",
  ]),
  title: z.string(),
  body: z.string(),
  language: z.string().nullable(),
  required: z.boolean(),
  sortOrder: z.number().int(),
  acceptanceStatus: z.enum(["not_required", "pending", "accepted", "declined"]),
  acceptedAt: z.string().datetime().nullable(),
  acceptedBy: z.string().nullable(),
  metadata: z.json().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
const attachmentSchema = z.object({
  id: z.string(),
  contractId: z.string(),
  kind: z.string(),
  name: z.string(),
  mimeType: z.string().nullable(),
  fileSize: z.number().int().nullable(),
  checksum: z.string().nullable(),
  storageAvailable: z.boolean(),
  createdAt: z.string().datetime(),
})
const cancellationRuleSchema = z.object({
  id: z.string().optional(),
  daysBeforeDeparture: z.number().int().nullable(),
  refundPercent: z.number().int().nullable(),
  refundType: z.enum(["cash", "credit", "cash_or_credit", "none"]).nullable(),
  flatAmountCents: z.number().int().nullable(),
  label: z.string().nullable(),
})

const listContractsInputSchema = z.object({
  scope: scopeSchema.optional(),
  status: statusSchema.optional(),
  personId: z.string().optional(),
  organizationId: z.string().optional(),
  supplierId: z.string().optional(),
  bookingId: z.string().optional(),
  targetKind: targetKindSchema.optional(),
  targetId: z.string().optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
})
const idInputSchema = z.object({ id: z.string().trim().min(1) })
const createDraftInputSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(255).optional(),
  title: z.string().trim().min(1).max(500),
  scope: scopeSchema.optional(),
  language: z.string().min(2).max(10).optional(),
  bookingId: z.string().optional(),
  personId: z.string().optional(),
  organizationId: z.string().optional(),
  supplierId: z.string().optional(),
  channelId: z.string().optional(),
  templateVersionId: z.string().optional(),
  seriesId: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  variables: z.record(z.string(), z.json()).optional(),
  metadata: z.record(z.string(), z.json()).optional(),
  revisionOfContractId: z.string().trim().min(1).optional(),
})
const bookingContractInputSchema = z.object({
  bookingId: z.string().trim().min(1),
  language: z.string().trim().min(2).max(10).optional(),
  channelId: z.string().trim().min(1).optional(),
})
const bookingContractReviewInputSchema = z.object({ contractId: z.string().trim().min(1) })

const bookingContractTemplateCandidateSchema = contractTemplateSummarySchema.extend({
  applicable: z.boolean(),
  missingPrerequisites: z.array(z.string()),
  requiredVariables: z.array(z.string()),
})

export const bookingContractReviewSchema = z.object({
  contract: legalContractDetailSchema,
  contentFingerprint: z.string().startsWith("booking-contract-content:v1:sha256:"),
  effectiveStatus: bookingContractEffectiveStatusSchema,
  revision: z.number().int().positive(),
  previousRevisionId: z.string().nullable(),
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
      quantity: z.number().int().positive(),
      amountCents: z.number().int().nullable(),
      currency: z.string(),
    }),
  ),
  template: z.object({
    id: z.string(),
    name: z.string(),
    versionId: z.string(),
    version: z.number().int().positive(),
    language: z.string(),
  }),
  commercialTerms: z.record(z.string(), z.json()),
  delivery: z.object({
    recipient: z.string().nullable(),
    channel: z.enum(["email", "sms", "whatsapp"]).nullable(),
    sentRevision: z.number().int().positive().nullable(),
    sentAt: z.string().datetime().nullable(),
    viewedAt: z.string().datetime().nullable(),
    declinedAt: z.string().datetime().nullable(),
    notificationsSuppressed: z.boolean(),
  }),
  voidConsequences: z.array(z.string()),
})
const listTemplatesInputSchema = z.object({
  scope: scopeSchema.optional(),
  language: z.string().optional(),
  channelId: z.string().optional(),
  active: z.boolean().optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
})
const previewTemplateInputSchema = z.object({
  templateId: z.string().trim().min(1),
  variables: z.record(z.string(), z.json()),
})
const contractTemplateFieldsSchema = z.object({
  name: z.string().trim().min(1).max(255),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "slug must be kebab-case"),
  scope: scopeSchema,
  language: z.string().trim().min(2).max(10).default("en"),
  description: z.string().max(2_000).nullable().optional(),
  body: z.string().min(1),
  variableSchema: z.record(z.string(), z.json()).nullable().optional(),
  channelId: z.string().nullable().optional(),
  isDefault: z.boolean().default(false),
  active: z.boolean().default(true),
})
const createContractTemplateInputSchema = contractTemplateFieldsSchema
const updateContractTemplateInputSchema = z
  .object({ id: z.string().trim().min(1) })
  .extend(contractTemplateFieldsSchema.partial().shape)
const listPoliciesInputSchema = z.object({
  kind: policyKindSchema.optional(),
  language: z.string().optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
})
const resolvePolicyInputSchema = z.object({
  kind: policyKindSchema,
  productId: z.string().optional(),
  channelId: z.string().optional(),
  supplierId: z.string().optional(),
  marketId: z.string().optional(),
  organizationId: z.string().optional(),
  at: z.string().date().optional(),
})
const evaluateCancellationInputSchema = z.object({
  policyId: z.string().trim().min(1),
  daysBeforeDeparture: z.number().int(),
  totalCents: z.number().int().nonnegative(),
  currency: z.string().max(10).optional(),
})
const listTermsInputSchema = z.object({
  contractId: z.string().optional(),
  policyVersionId: z.string().optional(),
  targetKind: targetKindSchema.optional(),
  targetId: z.string().optional(),
  termType: legalTermSchema.shape.termType.optional(),
  acceptanceStatus: legalTermSchema.shape.acceptanceStatus.optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
})
const listAttachmentsInputSchema = z.object({ contractId: z.string().trim().min(1) })
const transitionContractInputSchema = z.object({ contractId: z.string().trim().min(1) })
const legacySendContractInputSchema = transitionContractInputSchema
  .extend({
    recipientEmail: z.string().email().nullable().optional(),
    subject: z.string().max(500).nullable().optional(),
    message: z.string().max(10_000).nullable().optional(),
  })
  .strict()
const bookingContractSendFields = {
  revision: z.number().int().positive(),
  contentFingerprint: z.string().startsWith("booking-contract-content:v1:sha256:"),
  notificationsSuppressed: z.boolean().default(false),
  subject: z.string().max(500).nullable().optional(),
  message: z.string().max(10_000).nullable().optional(),
}
const bookingContractSendInputSchema = z.discriminatedUnion("channel", [
  transitionContractInputSchema
    .extend({
      ...bookingContractSendFields,
      channel: z.literal("email"),
      recipient: z.string().trim().email().max(320),
    })
    .strict(),
  transitionContractInputSchema
    .extend({
      ...bookingContractSendFields,
      channel: z.literal("sms"),
      recipient: z.string().trim().min(3).max(320),
    })
    .strict(),
  transitionContractInputSchema
    .extend({
      ...bookingContractSendFields,
      channel: z.literal("whatsapp"),
      recipient: z.string().trim().min(3).max(320),
    })
    .strict(),
])
const sendContractInputSchema = z.union([
  bookingContractSendInputSchema,
  legacySendContractInputSchema,
])
const voidContractInputSchema = transitionContractInputSchema.extend({
  revision: z.number().int().positive(),
  reason: z.string().trim().min(3).max(2_000),
  acknowledgedConsequences: z.literal(true),
})
const resolveContractDocumentDeliveryInputSchema = z.object({
  attachmentId: z.string().trim().min(1),
})
const mutateBookingContractDocumentInputSchema = z.object({
  bookingId: z.string().trim().min(1),
  contractId: z.string().trim().min(1),
})
const contractDocumentOperationResultSchema = z.object({
  operationId: z.string(),
  bookingId: z.string(),
  contractId: z.string(),
  attachmentId: z.string(),
  mode: z.enum(["generate", "regenerate"]),
  checksumSha256: z.string(),
})
const contractDocumentDeliverySchema = z.object({
  url: z.string().min(1),
  filename: z.string(),
  contentType: z.string().nullable(),
})

export type LegalContractSummary = z.infer<typeof legalContractSummarySchema>
export type LegalContractDetail = z.infer<typeof legalContractDetailSchema>
export type ContractTemplateSummary = z.infer<typeof contractTemplateSummarySchema>
export type ContractTemplateDetail = z.infer<typeof contractTemplateDetailSchema>
export type PolicySummary = z.infer<typeof policySummarySchema>
export type PolicyDetail = z.infer<typeof policyDetailSchema>
export type LegalTermDto = z.infer<typeof legalTermSchema>
export type ContractAttachmentDto = z.infer<typeof attachmentSchema>

export interface LegalToolServices {
  listContracts(
    input: z.infer<typeof listContractsInputSchema>,
  ): Promise<{ data: LegalContractSummary[]; meta: z.infer<typeof pageSchema> }>
  getContract(id: string): Promise<LegalContractDetail | null>
  createDraft(
    input: z.infer<typeof createDraftInputSchema>,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<{
    status: "created"
    contract: { id: string }
    replayed: boolean
  }>
  listTemplates(
    input: z.infer<typeof listTemplatesInputSchema>,
  ): Promise<{ data: ContractTemplateSummary[]; meta: z.infer<typeof pageSchema> }>
  listApplicableBookingTemplates(input: z.infer<typeof bookingContractInputSchema>): Promise<{
    bookingFound: boolean
    data: z.infer<typeof bookingContractTemplateCandidateSchema>[]
  }>
  getBookingContractReview(
    input: z.infer<typeof bookingContractReviewInputSchema>,
  ): Promise<z.infer<typeof bookingContractReviewSchema> | null>
  getTemplate(id: string): Promise<ContractTemplateDetail | null>
  previewTemplate(input: z.infer<typeof previewTemplateInputSchema>): Promise<{ rendered: string }>
  createTemplate(
    input: z.infer<typeof createContractTemplateInputSchema>,
  ): Promise<ContractTemplateDetail>
  updateTemplate(
    input: z.infer<typeof updateContractTemplateInputSchema>,
  ): Promise<ContractTemplateDetail | null>
  listPolicies(
    input: z.infer<typeof listPoliciesInputSchema>,
  ): Promise<{ data: PolicySummary[]; meta: z.infer<typeof pageSchema> }>
  getPolicy(id: string): Promise<PolicyDetail | null>
  resolvePolicy(input: z.infer<typeof resolvePolicyInputSchema>): Promise<PolicyDetail | null>
  evaluateCancellation(input: z.infer<typeof evaluateCancellationInputSchema>): Promise<{
    refundPercent: number
    refundCents: number
    refundType: "cash" | "credit" | "cash_or_credit" | "none"
    appliedRule: z.infer<typeof cancellationRuleSchema> | null
  } | null>
  listTerms(
    input: z.infer<typeof listTermsInputSchema>,
  ): Promise<{ data: LegalTermDto[]; meta: z.infer<typeof pageSchema> }>
  getTerm(id: string): Promise<LegalTermDto | null>
  listAttachments(contractId: string): Promise<ContractAttachmentDto[]>
  issueContract(contractId: string): Promise<LegalContractDetail>
  sendContract(input: z.infer<typeof sendContractInputSchema>): Promise<LegalContractDetail>
  executeContract(contractId: string): Promise<LegalContractDetail>
}

export interface LegalLifecycleCommandToolServices {
  issueContractCommand(
    input: z.infer<typeof transitionContractInputSchema>,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<LegalContractDetail>
  sendContractCommand(
    input: z.infer<typeof sendContractInputSchema>,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<LegalContractDetail>
  executeContractCommand(
    input: z.infer<typeof transitionContractInputSchema>,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<LegalContractDetail>
  voidContractCommand(
    input: z.infer<typeof voidContractInputSchema>,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<LegalContractDetail>
}

export interface LegalContractDocumentToolServices {
  generate(
    input: z.infer<typeof mutateBookingContractDocumentInputSchema>,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<z.infer<typeof contractDocumentOperationResultSchema>>
  regenerate(
    input: z.infer<typeof mutateBookingContractDocumentInputSchema>,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<z.infer<typeof contractDocumentOperationResultSchema>>
  resolveDelivery(
    input: z.infer<typeof resolveContractDocumentDeliveryInputSchema>,
  ): Promise<z.infer<typeof contractDocumentDeliverySchema> | null>
}

export type LegalToolContext = ToolContext & {
  legal?: LegalToolServices & Partial<LegalLifecycleCommandToolServices>
  legalContractDocument?: LegalContractDocumentToolServices
}

function legal(ctx: LegalToolContext): LegalToolServices {
  if (ctx.actor !== "staff" || ctx.audience !== "staff") {
    throw new ToolError(
      "Legal Tools require a staff grant and staff audience.",
      "AUTHORIZATION_DENIED",
    )
  }
  return requireService(ctx.legal, "legal")
}

function legalLifecycleCommands(ctx: LegalToolContext): LegalLifecycleCommandToolServices {
  const service = legal(ctx) as LegalToolServices & Partial<LegalLifecycleCommandToolServices>
  if (
    !service.issueContractCommand ||
    !service.sendContractCommand ||
    !service.voidContractCommand ||
    !service.executeContractCommand
  ) {
    throw new ToolError(
      "The selected Legal runtime does not provide durable lifecycle command services.",
      "MISSING_SERVICE",
    )
  }
  return service as LegalToolServices & LegalLifecycleCommandToolServices
}

function legalContractDocument(ctx: LegalToolContext): LegalContractDocumentToolServices {
  if (ctx.actor !== "staff" || ctx.audience !== "staff") {
    throw new ToolError(
      "Contract document Tools require a staff grant and staff audience.",
      "AUTHORIZATION_DENIED",
    )
  }
  return requireService(ctx.legalContractDocument, "legalContractDocument")
}

const readMetadata = {
  owner: OWNER,
  capabilityVersion: VERSION,
  requiredScopes: READ_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "sensitive" as const,
  riskPolicy: READ_ONLY_RISK,
  annotations: { readOnlyHint: true, idempotentHint: true },
}
const writeMetadata = {
  owner: OWNER,
  capabilityVersion: VERSION,
  requiredScopes: WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "write" as const,
  riskPolicy: {
    destructive: false,
    reversible: true,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["data-write"] as const,
  },
}

export const listLegalContractsTool = defineTool({
  ...readMetadata,
  capabilityId: `${OWNER}#tool.list-contracts`,
  name: "list_legal_contracts",
  description: "List compact contract records without rendered bodies or variable snapshots.",
  inputSchema: listContractsInputSchema,
  outputSchema: z.object({ data: z.array(legalContractSummarySchema), meta: pageSchema }),
  handler: (input, ctx: LegalToolContext) => legal(ctx).listContracts(input),
})
export const getLegalContractTool = defineTool({
  ...readMetadata,
  capabilityId: `${OWNER}#tool.get-contract`,
  name: "get_legal_contract",
  description:
    "Read one contract including its rendered body, variables, metadata, and stage history.",
  inputSchema: idInputSchema,
  outputSchema: legalContractDetailSchema,
  async handler({ id }, ctx: LegalToolContext) {
    const result = await legal(ctx).getContract(id)
    if (!result) throw new ToolError(`Contract "${id}" was not found.`, "NOT_FOUND", { id })
    return result
  },
})
export const createLegalContractDraftTool = defineTool({
  ...writeMetadata,
  riskPolicy: { ...writeMetadata.riskPolicy, reversible: false },
  capabilityId: `${OWNER}#tool.create-contract-draft`,
  name: "create_legal_contract_draft",
  description:
    "Create a review-only booking contract draft without sending or signing it. Supply bookingId, an exact templateVersionId, customer/commercial variables, and an idempotency key. To edit conversationally, call again with revisionOfContractId; the prior revision remains immutable.",
  inputSchema: createDraftInputSchema,
  outputSchema: z.object({
    status: z.literal("created"),
    contract: z.object({ id: z.string() }),
    replayed: z.boolean(),
  }),
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  async handler(input, ctx: LegalToolContext) {
    const admitted = admitHandlerActionPolicy(ctx, LEGAL_CONTRACT_DRAFT_HANDLER_EXPECTATION)
    return legal(ctx).createDraft(input, admitted)
  },
})
export const listContractTemplatesTool = defineTool({
  ...readMetadata,
  capabilityId: `${OWNER}#tool.list-contract-templates`,
  name: "list_contract_templates",
  description: "List compact contract template metadata without template bodies.",
  inputSchema: listTemplatesInputSchema,
  outputSchema: z.object({ data: z.array(contractTemplateSummarySchema), meta: pageSchema }),
  handler: (input, ctx: LegalToolContext) => legal(ctx).listTemplates(input),
})
export const listApplicableBookingContractTemplatesTool = defineTool({
  ...readMetadata,
  capabilityId: `${OWNER}#tool.list-applicable-booking-contract-templates`,
  name: "list_applicable_booking_contract_templates",
  description:
    "For one booking, list active customer-contract templates and state every missing prerequisite. This read never creates, sends, signs, or changes a contract.",
  inputSchema: bookingContractInputSchema,
  outputSchema: z.object({
    bookingFound: z.boolean(),
    data: z.array(bookingContractTemplateCandidateSchema),
  }),
  handler: (input, ctx: LegalToolContext) => legal(ctx).listApplicableBookingTemplates(input),
})
export const getBookingContractReviewTool = defineTool({
  ...readMetadata,
  requiredScopes: BOOKING_CONTRACT_REVIEW_SCOPES,
  capabilityId: `${OWNER}#tool.get-booking-contract-review`,
  name: "get_booking_contract_review",
  description:
    "Open the durable review surface for one booking-contract revision: booking, customer, products, commercial terms, exact template version/language, delivery state, and void consequences.",
  inputSchema: bookingContractReviewInputSchema,
  outputSchema: bookingContractReviewSchema,
  async handler(input, ctx: LegalToolContext) {
    const result = await legal(ctx).getBookingContractReview(input)
    if (!result) throw new ToolError(`Contract "${input.contractId}" was not found.`, "NOT_FOUND")
    return result
  },
})
export const getContractTemplateTool = defineTool({
  ...readMetadata,
  capabilityId: `${OWNER}#tool.get-contract-template`,
  name: "get_contract_template",
  description: "Read one contract template including its body and variable schema.",
  inputSchema: idInputSchema,
  outputSchema: contractTemplateDetailSchema,
  async handler({ id }, ctx: LegalToolContext) {
    const result = await legal(ctx).getTemplate(id)
    if (!result)
      throw new ToolError(`Contract template "${id}" was not found.`, "NOT_FOUND", { id })
    return result
  },
})
export const previewContractTemplateTool = defineTool({
  ...readMetadata,
  capabilityId: `${OWNER}#tool.preview-contract-template`,
  name: "preview_contract_template",
  description:
    "Render a stored contract template with supplied JSON variables without persisting a contract.",
  inputSchema: previewTemplateInputSchema,
  outputSchema: z.object({ rendered: z.string() }),
  handler: (input, ctx: LegalToolContext) => legal(ctx).previewTemplate(input),
})
export const createContractTemplateTool = defineTool({
  ...writeMetadata,
  capabilityId: `${OWNER}#tool.create-contract-template`,
  name: "create_contract_template",
  description:
    "Create a versioned contract template after validating its structured-template syntax.",
  inputSchema: createContractTemplateInputSchema,
  outputSchema: contractTemplateDetailSchema,
  handler: (input, ctx: LegalToolContext) => legal(ctx).createTemplate(input),
})
export const updateContractTemplateTool = defineTool({
  ...writeMetadata,
  capabilityId: `${OWNER}#tool.update-contract-template`,
  name: "update_contract_template",
  description:
    "Update selected contract-template fields. Body changes create a version through the legal service.",
  inputSchema: updateContractTemplateInputSchema,
  outputSchema: contractTemplateDetailSchema,
  async handler(input, ctx: LegalToolContext) {
    const { id, ...update } = input
    if (!Object.values(update).some((value) => value !== undefined)) {
      throw new ToolError("At least one template field must be supplied.", "INVALID_INPUT")
    }
    const result = await legal(ctx).updateTemplate(input)
    if (!result) {
      throw new ToolError(`Contract template "${id}" was not found.`, "NOT_FOUND", {
        id,
      })
    }
    return result
  },
})
export const listLegalPoliciesTool = defineTool({
  ...readMetadata,
  capabilityId: `${OWNER}#tool.list-policies`,
  name: "list_legal_policies",
  description: "List legal and commercial policy definitions.",
  inputSchema: listPoliciesInputSchema,
  outputSchema: z.object({ data: z.array(policySummarySchema), meta: pageSchema }),
  handler: (input, ctx: LegalToolContext) => legal(ctx).listPolicies(input),
})
export const getLegalPolicyTool = defineTool({
  ...readMetadata,
  capabilityId: `${OWNER}#tool.get-policy`,
  name: "get_legal_policy",
  description: "Read a policy with its current version and ordered current rules.",
  inputSchema: idInputSchema,
  outputSchema: policyDetailSchema,
  async handler({ id }, ctx: LegalToolContext) {
    const result = await legal(ctx).getPolicy(id)
    if (!result) throw new ToolError(`Policy "${id}" was not found.`, "NOT_FOUND", { id })
    return result
  },
})
export const resolveLegalPolicyTool = defineTool({
  ...readMetadata,
  capabilityId: `${OWNER}#tool.resolve-policy`,
  name: "resolve_legal_policy",
  description:
    "Resolve the selected published policy and rules for an exact product/channel/supplier/market/organization context.",
  inputSchema: resolvePolicyInputSchema,
  outputSchema: policyDetailSchema.nullable(),
  handler: (input, ctx: LegalToolContext) => legal(ctx).resolvePolicy(input),
})
export const evaluateCancellationPolicyTool = defineTool({
  ...readMetadata,
  capabilityId: `${OWNER}#tool.evaluate-cancellation-policy`,
  name: "evaluate_cancellation_policy",
  description:
    "Evaluate the current rules of one cancellation policy. This is a calculation and does not cancel or refund anything.",
  inputSchema: evaluateCancellationInputSchema,
  outputSchema: z
    .object({
      refundPercent: z.number().int(),
      refundCents: z.number().int(),
      refundType: z.enum(["cash", "credit", "cash_or_credit", "none"]),
      appliedRule: cancellationRuleSchema.nullable(),
    })
    .nullable(),
  handler: (input, ctx: LegalToolContext) => legal(ctx).evaluateCancellation(input),
})
export const listLegalTermsTool = defineTool({
  ...readMetadata,
  capabilityId: `${OWNER}#tool.list-terms`,
  name: "list_legal_terms",
  description: "List legal terms attached to a contract, policy version, or exact target.",
  inputSchema: listTermsInputSchema,
  outputSchema: z.object({ data: z.array(legalTermSchema), meta: pageSchema }),
  handler: (input, ctx: LegalToolContext) => legal(ctx).listTerms(input),
})
export const getLegalTermTool = defineTool({
  ...readMetadata,
  capabilityId: `${OWNER}#tool.get-term`,
  name: "get_legal_term",
  description: "Read one legal term and its acceptance state.",
  inputSchema: idInputSchema,
  outputSchema: legalTermSchema,
  async handler({ id }, ctx: LegalToolContext) {
    const result = await legal(ctx).getTerm(id)
    if (!result) throw new ToolError(`Legal term "${id}" was not found.`, "NOT_FOUND", { id })
    return result
  },
})
export const listContractAttachmentsTool = defineTool({
  ...readMetadata,
  capabilityId: `${OWNER}#tool.list-contract-attachments`,
  name: "list_contract_attachments",
  description: "List contract attachment metadata without exposing private storage keys.",
  inputSchema: listAttachmentsInputSchema,
  outputSchema: z.array(attachmentSchema),
  handler: ({ contractId }, ctx: LegalToolContext) => legal(ctx).listAttachments(contractId),
})

const lifecycleWriteMetadata = {
  ...writeMetadata,
  tier: "write" as const,
  riskPolicy: {
    destructive: false,
    reversible: false,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["data-write"] as const,
  },
}

export const issueLegalContractTool = defineTool({
  ...lifecycleWriteMetadata,
  capabilityId: `${OWNER}#tool.issue-contract`,
  name: "issue_legal_contract",
  description:
    "Issue one draft contract through the legal lifecycle service. Requires explicit confirmation and selected approval.",
  inputSchema: transitionContractInputSchema,
  outputSchema: legalContractDetailSchema,
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  handler: (input, ctx: LegalToolContext) =>
    legalLifecycleCommands(ctx).issueContractCommand(
      input,
      admitHandlerActionPolicy(ctx, LEGAL_CONTRACT_LIFECYCLE_HANDLER_EXPECTATIONS.issue),
    ),
})
export const sendLegalContractTool = defineTool({
  ...lifecycleWriteMetadata,
  capabilityId: `${OWNER}#tool.send-contract`,
  name: "send_legal_contract",
  description:
    "Send a contract with explicit approval. Booking-contract revisions require recipient, channel, revision, and the contentFingerprint returned by get_booking_contract_review; legacy issued contracts retain recipientEmail compatibility. A reviewed draft is issued atomically before delivery and duplicate approval clicks replay the same durable result.",
  inputSchema: sendContractInputSchema,
  outputSchema: legalContractDetailSchema,
  riskPolicy: {
    ...lifecycleWriteMetadata.riskPolicy,
    sideEffects: ["data-write", "email", "sms"],
  },
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  handler: (input, ctx: LegalToolContext) =>
    legalLifecycleCommands(ctx).sendContractCommand(
      input,
      admitHandlerActionPolicy(ctx, LEGAL_CONTRACT_LIFECYCLE_HANDLER_EXPECTATIONS.send),
    ),
})
export const executeLegalContractTool = defineTool({
  ...lifecycleWriteMetadata,
  capabilityId: `${OWNER}#tool.execute-contract`,
  name: "execute_legal_contract",
  description:
    "Execute a contract only after an authoritative signature has already moved it to signed. This Tool cannot create or spoof signatures.",
  inputSchema: transitionContractInputSchema,
  outputSchema: legalContractDetailSchema,
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  handler: (input, ctx: LegalToolContext) =>
    legalLifecycleCommands(ctx).executeContractCommand(
      input,
      admitHandlerActionPolicy(ctx, LEGAL_CONTRACT_LIFECYCLE_HANDLER_EXPECTATIONS.execute),
    ),
})
export const voidLegalContractTool = defineTool({
  ...lifecycleWriteMetadata,
  capabilityId: `${OWNER}#tool.void-contract`,
  name: "void_legal_contract",
  description:
    "Void one exact contract revision after reviewing that delivery cannot be recalled, signing is disabled, and immutable lifecycle/revision audit history is retained. Requires explicit approval and a reason.",
  inputSchema: voidContractInputSchema,
  outputSchema: legalContractDetailSchema,
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  handler: (input, ctx: LegalToolContext) =>
    legalLifecycleCommands(ctx).voidContractCommand(
      input,
      admitHandlerActionPolicy(ctx, LEGAL_CONTRACT_LIFECYCLE_HANDLER_EXPECTATIONS.void),
    ),
})

const contractDocumentReadMetadata = {
  owner: OWNER,
  capabilityVersion: VERSION,
  requiredScopes: READ_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "sensitive" as const,
  riskPolicy: READ_ONLY_RISK,
  annotations: { readOnlyHint: true, idempotentHint: true },
}

export const resolveContractDocumentDeliveryTool = defineTool({
  ...contractDocumentReadMetadata,
  capabilityId: `${OWNER}#tool.resolve-contract-document-delivery`,
  name: "resolve_contract_document_delivery",
  description:
    "Resolve a short-lived or deployment-authorized URL for one generated attachment without exposing its private storage key.",
  inputSchema: resolveContractDocumentDeliveryInputSchema,
  outputSchema: contractDocumentDeliverySchema,
  async handler(input, ctx: LegalToolContext) {
    const result = await legalContractDocument(ctx).resolveDelivery(input)
    if (!result)
      throw new ToolError(
        `Generated attachment "${input.attachmentId}" is unavailable.`,
        "NOT_FOUND",
        { attachmentId: input.attachmentId },
      )
    return result
  },
})

export const generateBookingContractDocumentTool = defineTool({
  ...lifecycleWriteMetadata,
  capabilityId: `${OWNER}#tool.generate-booking-contract-document`,
  name: "generate_booking_contract_document",
  description:
    "Generate the first canonical document for an existing booking contract through the durable legal document operation.",
  inputSchema: mutateBookingContractDocumentInputSchema,
  outputSchema: contractDocumentOperationResultSchema,
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  handler: (input, ctx: LegalToolContext) =>
    legalContractDocument(ctx).generate(
      input,
      admitHandlerActionPolicy(ctx, LEGAL_CONTRACT_DOCUMENT_HANDLER_EXPECTATIONS.generate),
    ),
})

export const regenerateBookingContractDocumentTool = defineTool({
  ...lifecycleWriteMetadata,
  capabilityId: `${OWNER}#tool.regenerate-booking-contract-document`,
  name: "regenerate_booking_contract_document",
  description:
    "Replace the admitted canonical booking-contract document through the durable legal document operation and retain truthful history.",
  inputSchema: mutateBookingContractDocumentInputSchema,
  outputSchema: contractDocumentOperationResultSchema,
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  handler: (input, ctx: LegalToolContext) =>
    legalContractDocument(ctx).regenerate(
      input,
      admitHandlerActionPolicy(ctx, LEGAL_CONTRACT_DOCUMENT_HANDLER_EXPECTATIONS.regenerate),
    ),
})

export const legalTools = [
  listLegalContractsTool,
  getLegalContractTool,
  createLegalContractDraftTool,
  listContractTemplatesTool,
  listApplicableBookingContractTemplatesTool,
  getBookingContractReviewTool,
  getContractTemplateTool,
  previewContractTemplateTool,
  createContractTemplateTool,
  updateContractTemplateTool,
  listLegalPoliciesTool,
  getLegalPolicyTool,
  resolveLegalPolicyTool,
  evaluateCancellationPolicyTool,
  listLegalTermsTool,
  getLegalTermTool,
  listContractAttachmentsTool,
  issueLegalContractTool,
  sendLegalContractTool,
  voidLegalContractTool,
  executeLegalContractTool,
] as const

export const legalContractDocumentTools = [
  generateBookingContractDocumentTool,
  regenerateBookingContractDocumentTool,
  resolveContractDocumentDeliveryTool,
] as const
