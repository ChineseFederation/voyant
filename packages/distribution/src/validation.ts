import { booleanQueryParam } from "@voyant-travel/db/helpers"
import { z } from "zod"

export * from "./external-refs/validation.js"
export * from "./publication-validation.js"
export * from "./suppliers/validation.js"

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

const isoDateSchema = z.string().date()
const isoDateTimeSchema = z.string().datetime()

export const channelKindSchema = z.enum([
  "direct",
  "affiliate",
  "ota",
  "reseller",
  "marketplace",
  "api_partner",
  "connect",
])
export const channelStatusSchema = z.enum(["active", "inactive", "pending", "archived"])
export const channelContractStatusSchema = z.enum(["draft", "active", "expired", "terminated"])
export const distributionPaymentOwnerSchema = z.enum(["operator", "channel", "split"])
export const distributionCancellationOwnerSchema = z.enum(["operator", "channel", "mixed"])
export const channelCommissionScopeSchema = z.enum(["booking", "product", "rate", "category"])
export const channelCommissionTypeSchema = z.enum(["fixed", "percentage"])
export const channelWebhookStatusSchema = z.enum(["pending", "processed", "failed", "ignored"])
export const channelAllotmentReleaseModeSchema = z.enum(["automatic", "manual"])
export const channelAllotmentUnsoldActionSchema = z.enum([
  "release_to_general_pool",
  "expire",
  "retain",
])
export const channelSettlementRunStatusSchema = z.enum(["draft", "open", "posted", "paid", "void"])
export const channelSettlementItemStatusSchema = z.enum([
  "pending",
  "approved",
  "disputed",
  "paid",
  "void",
])
export const channelReconciliationRunStatusSchema = z.enum([
  "draft",
  "running",
  "completed",
  "archived",
])
export const channelReconciliationIssueTypeSchema = z.enum([
  "missing_booking",
  "status_mismatch",
  "amount_mismatch",
  "cancel_mismatch",
  "missing_payout",
  "other",
])
export const channelReconciliationSeveritySchema = z.enum(["info", "warning", "error"])
export const channelReconciliationResolutionStatusSchema = z.enum(["open", "ignored", "resolved"])
export const channelReleaseExecutionStatusSchema = z.enum([
  "pending",
  "completed",
  "skipped",
  "failed",
])
export const channelReleaseExecutionActionSchema = z.enum([
  "released",
  "expired",
  "retained",
  "manual_override",
])
export const channelSettlementPolicyFrequencySchema = z.enum([
  "manual",
  "daily",
  "weekly",
  "monthly",
])
export const channelReconciliationPolicyFrequencySchema = z.enum([
  "manual",
  "daily",
  "weekly",
  "monthly",
])
export const channelReleaseScheduleKindSchema = z.enum(["manual", "hourly", "daily"])
export const channelRemittanceExceptionStatusSchema = z.enum([
  "open",
  "investigating",
  "resolved",
  "ignored",
])
export const channelSettlementApprovalStatusSchema = z.enum(["pending", "approved", "rejected"])

export const channelCoreSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  kind: channelKindSchema,
  status: channelStatusSchema.default("active"),
  website: z
    .string()
    .url()
    .nullable()
    .optional()
    .or(z.literal(""))
    .transform((value) => value || null),
  contactName: z.string().nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const insertChannelSchema = channelCoreSchema
export const updateChannelSchema = channelCoreSchema.partial()
export const channelListQuerySchema = paginationSchema.extend({
  kind: channelKindSchema.optional(),
  status: channelStatusSchema.optional(),
})

export const channelContractCoreSchema = z.object({
  channelId: z.string(),
  supplierId: z.string().nullable().optional(),
  status: channelContractStatusSchema.default("draft"),
  startsAt: isoDateSchema,
  endsAt: isoDateSchema.nullable().optional(),
  paymentOwner: distributionPaymentOwnerSchema.default("operator"),
  cancellationOwner: distributionCancellationOwnerSchema.default("operator"),
  settlementTerms: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export const insertChannelContractSchema = channelContractCoreSchema
export const updateChannelContractSchema = channelContractCoreSchema.partial()
export const channelContractListQuerySchema = paginationSchema.extend({
  channelId: z.string().optional(),
  supplierId: z.string().optional(),
  status: channelContractStatusSchema.optional(),
})

export const channelCommissionRuleCoreSchema = z.object({
  contractId: z.string(),
  scope: channelCommissionScopeSchema,
  productId: z.string().nullable().optional(),
  externalRateId: z.string().nullable().optional(),
  externalCategoryId: z.string().nullable().optional(),
  commissionType: channelCommissionTypeSchema,
  amountCents: z.number().int().min(0).nullable().optional(),
  percentBasisPoints: z.number().int().min(0).nullable().optional(),
  validFrom: isoDateSchema.nullable().optional(),
  validTo: isoDateSchema.nullable().optional(),
})

export const insertChannelCommissionRuleSchema = channelCommissionRuleCoreSchema
export const updateChannelCommissionRuleSchema = channelCommissionRuleCoreSchema.partial()
export const channelCommissionRuleListQuerySchema = paginationSchema.extend({
  contractId: z.string().optional(),
  productId: z.string().optional(),
  scope: channelCommissionScopeSchema.optional(),
})

export const channelProductMappingCoreSchema = z.object({
  channelId: z.string(),
  productId: z.string(),
  externalProductId: z.string().min(1).nullable().optional(),
  externalRateId: z.string().nullable().optional(),
  externalCategoryId: z.string().nullable().optional(),
  active: z.boolean().default(true),
  sourceKind: z.string().min(1).nullable().optional(),
  sourceConnectionId: z.string().min(1).nullable().optional(),
  pushBookings: z.boolean().default(true),
  pushAvailability: z.boolean().default(true),
  pushContent: z.boolean().default(true),
  policy: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const insertChannelProductMappingSchema = channelProductMappingCoreSchema
export const updateChannelProductMappingSchema = channelProductMappingCoreSchema
  .extend({
    active: z.boolean().optional(),
    pushBookings: z.boolean().optional(),
    pushAvailability: z.boolean().optional(),
    pushContent: z.boolean().optional(),
  })
  .partial()
export const channelProductMappingListQuerySchema = paginationSchema.extend({
  channelId: z.string().optional(),
  productId: z.string().optional(),
  active: booleanQueryParam.optional(),
})

export const channelBookingLinkCoreSchema = z.object({
  channelId: z.string(),
  bookingId: z.string(),
  externalBookingId: z.string().nullable().optional(),
  externalReference: z.string().nullable().optional(),
  externalStatus: z.string().nullable().optional(),
  bookedAtExternal: isoDateTimeSchema.nullable().optional(),
  lastSyncedAt: isoDateTimeSchema.nullable().optional(),
})

export const insertChannelBookingLinkSchema = channelBookingLinkCoreSchema
export const updateChannelBookingLinkSchema = channelBookingLinkCoreSchema.partial()
export const channelBookingLinkListQuerySchema = paginationSchema.extend({
  channelId: z.string().optional(),
  bookingId: z.string().optional(),
  externalBookingId: z.string().optional(),
})

export const channelWebhookEventCoreSchema = z.object({
  channelId: z.string(),
  eventType: z.string().min(1),
  externalEventId: z.string().nullable().optional(),
  payload: z.record(z.string(), z.unknown()),
  receivedAt: isoDateTimeSchema.nullable().optional(),
  processedAt: isoDateTimeSchema.nullable().optional(),
  status: channelWebhookStatusSchema.default("pending"),
  errorMessage: z.string().nullable().optional(),
})

export const insertChannelWebhookEventSchema = channelWebhookEventCoreSchema
export const updateChannelWebhookEventSchema = channelWebhookEventCoreSchema.partial()
export const channelWebhookEventListQuerySchema = paginationSchema.extend({
  channelId: z.string().optional(),
  status: channelWebhookStatusSchema.optional(),
  eventType: z.string().optional(),
})

export const channelInventoryAllotmentCoreSchema = z.object({
  channelId: z.string(),
  contractId: z.string().nullable().optional(),
  productId: z.string(),
  optionId: z.string().nullable().optional(),
  startTimeId: z.string().nullable().optional(),
  validFrom: isoDateSchema.nullable().optional(),
  validTo: isoDateSchema.nullable().optional(),
  guaranteedCapacity: z.number().int().min(0).nullable().optional(),
  maxCapacity: z.number().int().min(0).nullable().optional(),
  active: z.boolean().default(true),
  notes: z.string().nullable().optional(),
})

export const insertChannelInventoryAllotmentSchema = channelInventoryAllotmentCoreSchema
export const updateChannelInventoryAllotmentSchema = channelInventoryAllotmentCoreSchema.partial()
export const channelInventoryAllotmentListQuerySchema = paginationSchema.extend({
  channelId: z.string().optional(),
  contractId: z.string().optional(),
  productId: z.string().optional(),
  optionId: z.string().optional(),
  startTimeId: z.string().optional(),
  active: booleanQueryParam.optional(),
})

export const channelInventoryAllotmentTargetCoreSchema = z.object({
  allotmentId: z.string(),
  slotId: z.string().nullable().optional(),
  startTimeId: z.string().nullable().optional(),
  dateLocal: isoDateSchema.nullable().optional(),
  guaranteedCapacity: z.number().int().min(0).nullable().optional(),
  maxCapacity: z.number().int().min(0).nullable().optional(),
  soldCapacity: z.number().int().min(0).nullable().optional(),
  remainingCapacity: z.number().int().min(0).nullable().optional(),
  active: z.boolean().default(true),
})

export const insertChannelInventoryAllotmentTargetSchema = channelInventoryAllotmentTargetCoreSchema
export const updateChannelInventoryAllotmentTargetSchema =
  channelInventoryAllotmentTargetCoreSchema.partial()
export const channelInventoryAllotmentTargetListQuerySchema = paginationSchema.extend({
  allotmentId: z.string().optional(),
  slotId: z.string().optional(),
  startTimeId: z.string().optional(),
  dateLocal: isoDateSchema.optional(),
  active: booleanQueryParam.optional(),
})

export const channelInventoryReleaseRuleCoreSchema = z.object({
  allotmentId: z.string(),
  releaseMode: channelAllotmentReleaseModeSchema.default("automatic"),
  releaseDaysBeforeStart: z.number().int().min(0).nullable().optional(),
  releaseHoursBeforeStart: z.number().int().min(0).nullable().optional(),
  unsoldAction: channelAllotmentUnsoldActionSchema.default("release_to_general_pool"),
  notes: z.string().nullable().optional(),
})

export const insertChannelInventoryReleaseRuleSchema = channelInventoryReleaseRuleCoreSchema
export const updateChannelInventoryReleaseRuleSchema =
  channelInventoryReleaseRuleCoreSchema.partial()
export const channelInventoryReleaseRuleListQuerySchema = paginationSchema.extend({
  allotmentId: z.string().optional(),
  releaseMode: channelAllotmentReleaseModeSchema.optional(),
})

export const channelSettlementRunCoreSchema = z.object({
  channelId: z.string(),
  contractId: z.string().nullable().optional(),
  status: channelSettlementRunStatusSchema.default("draft"),
  currencyCode: z.string().nullable().optional(),
  periodStart: isoDateSchema.nullable().optional(),
  periodEnd: isoDateSchema.nullable().optional(),
  statementReference: z.string().nullable().optional(),
  generatedAt: isoDateTimeSchema.nullable().optional(),
  postedAt: isoDateTimeSchema.nullable().optional(),
  paidAt: isoDateTimeSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const insertChannelSettlementRunSchema = channelSettlementRunCoreSchema
export const updateChannelSettlementRunSchema = channelSettlementRunCoreSchema.partial()
export const channelSettlementRunListQuerySchema = paginationSchema.extend({
  channelId: z.string().optional(),
  contractId: z.string().optional(),
  status: channelSettlementRunStatusSchema.optional(),
})

export const channelSettlementItemCoreSchema = z.object({
  settlementRunId: z.string(),
  bookingLinkId: z.string().nullable().optional(),
  bookingId: z.string().nullable().optional(),
  commissionRuleId: z.string().nullable().optional(),
  status: channelSettlementItemStatusSchema.default("pending"),
  grossAmountCents: z.number().int().default(0),
  commissionAmountCents: z.number().int().default(0),
  netRemittanceAmountCents: z.number().int().default(0),
  currencyCode: z.string().nullable().optional(),
  remittanceDueAt: isoDateTimeSchema.nullable().optional(),
  paidAt: isoDateTimeSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
})

export const insertChannelSettlementItemSchema = channelSettlementItemCoreSchema
export const updateChannelSettlementItemSchema = channelSettlementItemCoreSchema.partial()
export const channelSettlementItemListQuerySchema = paginationSchema.extend({
  settlementRunId: z.string().optional(),
  bookingLinkId: z.string().optional(),
  bookingId: z.string().optional(),
  status: channelSettlementItemStatusSchema.optional(),
})

export const channelReconciliationRunCoreSchema = z.object({
  channelId: z.string(),
  contractId: z.string().nullable().optional(),
  status: channelReconciliationRunStatusSchema.default("draft"),
  periodStart: isoDateSchema.nullable().optional(),
  periodEnd: isoDateSchema.nullable().optional(),
  externalReportReference: z.string().nullable().optional(),
  startedAt: isoDateTimeSchema.nullable().optional(),
  completedAt: isoDateTimeSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const insertChannelReconciliationRunSchema = channelReconciliationRunCoreSchema
export const updateChannelReconciliationRunSchema = channelReconciliationRunCoreSchema.partial()
export const channelReconciliationRunListQuerySchema = paginationSchema.extend({
  channelId: z.string().optional(),
  contractId: z.string().optional(),
  status: channelReconciliationRunStatusSchema.optional(),
})

export const channelReconciliationItemCoreSchema = z.object({
  reconciliationRunId: z.string(),
  bookingLinkId: z.string().nullable().optional(),
  bookingId: z.string().nullable().optional(),
  externalBookingId: z.string().nullable().optional(),
  issueType: channelReconciliationIssueTypeSchema.default("other"),
  severity: channelReconciliationSeveritySchema.default("warning"),
  resolutionStatus: channelReconciliationResolutionStatusSchema.default("open"),
  notes: z.string().nullable().optional(),
  resolvedAt: isoDateTimeSchema.nullable().optional(),
})

export const insertChannelReconciliationItemSchema = channelReconciliationItemCoreSchema
export const updateChannelReconciliationItemSchema = channelReconciliationItemCoreSchema.partial()
export const channelReconciliationItemListQuerySchema = paginationSchema.extend({
  reconciliationRunId: z.string().optional(),
  bookingLinkId: z.string().optional(),
  bookingId: z.string().optional(),
  issueType: channelReconciliationIssueTypeSchema.optional(),
  resolutionStatus: channelReconciliationResolutionStatusSchema.optional(),
})

export const channelInventoryReleaseExecutionCoreSchema = z.object({
  allotmentId: z.string(),
  releaseRuleId: z.string().nullable().optional(),
  targetId: z.string().nullable().optional(),
  slotId: z.string().nullable().optional(),
  actionTaken: channelReleaseExecutionActionSchema.default("released"),
  status: channelReleaseExecutionStatusSchema.default("pending"),
  releasedCapacity: z.number().int().min(0).nullable().optional(),
  executedAt: isoDateTimeSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const insertChannelInventoryReleaseExecutionSchema =
  channelInventoryReleaseExecutionCoreSchema
export const updateChannelInventoryReleaseExecutionSchema =
  channelInventoryReleaseExecutionCoreSchema.partial()
export const channelInventoryReleaseExecutionListQuerySchema = paginationSchema.extend({
  allotmentId: z.string().optional(),
  releaseRuleId: z.string().optional(),
  targetId: z.string().optional(),
  slotId: z.string().optional(),
  status: channelReleaseExecutionStatusSchema.optional(),
})

export const channelSettlementPolicyCoreSchema = z.object({
  channelId: z.string(),
  contractId: z.string().nullable().optional(),
  frequency: channelSettlementPolicyFrequencySchema.default("manual"),
  autoGenerate: z.boolean().default(false),
  approvalRequired: z.boolean().default(false),
  remittanceDaysAfterPeriodEnd: z.number().int().min(0).nullable().optional(),
  minimumPayoutAmountCents: z.number().int().min(0).nullable().optional(),
  currencyCode: z.string().nullable().optional(),
  active: z.boolean().default(true),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})
export const insertChannelSettlementPolicySchema = channelSettlementPolicyCoreSchema
export const updateChannelSettlementPolicySchema = channelSettlementPolicyCoreSchema.partial()
export const channelSettlementPolicyListQuerySchema = paginationSchema.extend({
  channelId: z.string().optional(),
  contractId: z.string().optional(),
  frequency: channelSettlementPolicyFrequencySchema.optional(),
  active: booleanQueryParam.optional(),
})

export const channelReconciliationPolicyCoreSchema = z.object({
  channelId: z.string(),
  contractId: z.string().nullable().optional(),
  frequency: channelReconciliationPolicyFrequencySchema.default("manual"),
  autoRun: z.boolean().default(false),
  compareGrossAmounts: z.boolean().default(true),
  compareStatuses: z.boolean().default(true),
  compareCancellations: z.boolean().default(true),
  amountToleranceCents: z.number().int().min(0).nullable().optional(),
  active: z.boolean().default(true),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})
export const insertChannelReconciliationPolicySchema = channelReconciliationPolicyCoreSchema
export const updateChannelReconciliationPolicySchema =
  channelReconciliationPolicyCoreSchema.partial()
export const channelReconciliationPolicyListQuerySchema = paginationSchema.extend({
  channelId: z.string().optional(),
  contractId: z.string().optional(),
  frequency: channelReconciliationPolicyFrequencySchema.optional(),
  active: booleanQueryParam.optional(),
})

export const channelReleaseScheduleCoreSchema = z.object({
  releaseRuleId: z.string(),
  scheduleKind: channelReleaseScheduleKindSchema.default("manual"),
  nextRunAt: isoDateTimeSchema.nullable().optional(),
  lastRunAt: isoDateTimeSchema.nullable().optional(),
  active: z.boolean().default(true),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})
export const insertChannelReleaseScheduleSchema = channelReleaseScheduleCoreSchema
export const updateChannelReleaseScheduleSchema = channelReleaseScheduleCoreSchema.partial()
export const channelReleaseScheduleListQuerySchema = paginationSchema.extend({
  releaseRuleId: z.string().optional(),
  scheduleKind: channelReleaseScheduleKindSchema.optional(),
  active: booleanQueryParam.optional(),
})

export const channelRemittanceExceptionCoreSchema = z.object({
  channelId: z.string(),
  settlementItemId: z.string().nullable().optional(),
  reconciliationItemId: z.string().nullable().optional(),
  exceptionType: z.string().min(1),
  severity: channelReconciliationSeveritySchema.default("warning"),
  status: channelRemittanceExceptionStatusSchema.default("open"),
  openedAt: isoDateTimeSchema.nullable().optional(),
  resolvedAt: isoDateTimeSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})
export const insertChannelRemittanceExceptionSchema = channelRemittanceExceptionCoreSchema
export const updateChannelRemittanceExceptionSchema = channelRemittanceExceptionCoreSchema.partial()
export const channelRemittanceExceptionListQuerySchema = paginationSchema.extend({
  channelId: z.string().optional(),
  settlementItemId: z.string().optional(),
  reconciliationItemId: z.string().optional(),
  status: channelRemittanceExceptionStatusSchema.optional(),
})

export const channelSettlementApprovalCoreSchema = z.object({
  settlementRunId: z.string(),
  approverUserId: z.string().nullable().optional(),
  status: channelSettlementApprovalStatusSchema.default("pending"),
  decidedAt: isoDateTimeSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})
export const insertChannelSettlementApprovalSchema = channelSettlementApprovalCoreSchema
export const updateChannelSettlementApprovalSchema = channelSettlementApprovalCoreSchema.partial()
export const channelSettlementApprovalListQuerySchema = paginationSchema.extend({
  settlementRunId: z.string().optional(),
  status: channelSettlementApprovalStatusSchema.optional(),
})
