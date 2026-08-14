/**
 * Response/envelope schemas for the distribution admin OpenAPI routes
 * (voyant#2114 — distribution sub-batch). The row schemas are authored from the
 * Drizzle `$inferSelect` shapes in `schema-core.ts` / `schema-inventory.ts` /
 * `schema-finance.ts` / `schema-automation.ts` (§17: `timestamp`/`date` columns
 * serialize to strings over the wire; integer/double fields stay numbers; jsonb
 * bags are open records). Enum columns reuse the exported `validation.ts` enum
 * schemas so the documented values stay in lock-step with request validation.
 *
 * These are shared between `routes.ts`, `routes/inventory.ts`,
 * `routes/settlements.ts`, and the contract test so the documented envelopes,
 * the runtime handlers, and the round-trip assertions all read from one source.
 */

import { z } from "zod"

import {
  channelAllotmentReleaseModeSchema,
  channelAllotmentUnsoldActionSchema,
  channelCommissionScopeSchema,
  channelCommissionTypeSchema,
  channelContractStatusSchema,
  channelKindSchema,
  channelPublicationDecisionSchema,
  channelPublicationReindexIntentKindSchema,
  channelPublicationReindexIntentStatusSchema,
  channelReconciliationIssueTypeSchema,
  channelReconciliationPolicyFrequencySchema,
  channelReconciliationResolutionStatusSchema,
  channelReconciliationRunStatusSchema,
  channelReconciliationSeveritySchema,
  channelReleaseExecutionActionSchema,
  channelReleaseExecutionStatusSchema,
  channelReleaseScheduleKindSchema,
  channelRemittanceExceptionStatusSchema,
  channelSettlementApprovalStatusSchema,
  channelSettlementItemStatusSchema,
  channelSettlementPolicyFrequencySchema,
  channelSettlementRunStatusSchema,
  channelStatusSchema,
  channelWebhookStatusSchema,
  distributionCancellationOwnerSchema,
  distributionPaymentOwnerSchema,
  effectivePublicationReasonSchema,
  effectiveSourcePublicationReasonSchema,
} from "../validation.js"

// --- shared envelopes -------------------------------------------------------

export const errorResponseSchema = z.object({ error: z.string() })
export const successResponseSchema = z.object({ success: z.literal(true) })
const idSchema = z.string()
export const idParamSchema = z.object({ id: idSchema })

/** Envelope returned by the shared batch-update handler. */
export function batchUpdateResponseSchema<T extends z.ZodTypeAny>(row: T) {
  return z.object({
    data: z.array(row),
    total: z.number().int(),
    succeeded: z.number().int(),
    failed: z.array(z.object({ id: idSchema, error: z.string() })),
  })
}

/** Envelope returned by the shared batch-delete handler. */
export const batchDeleteResponseSchema = z.object({
  deletedIds: z.array(idSchema),
  total: z.number().int(),
  succeeded: z.number().int(),
  failed: z.array(z.object({ id: idSchema, error: z.string() })),
})

// §17: `timestamp`/`date` columns are serialized to ISO strings over the wire.
const isoTimestamp = z.string()
const isoDate = z.string()
const jsonRecord = z.record(z.string(), z.unknown())
const numberRecord = z.record(z.string(), z.number())

// --- channel ----------------------------------------------------------------

/** Base `channels` row (all `$inferSelect` columns). */
const channelBaseSchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string().nullable(),
  kind: channelKindSchema,
  status: channelStatusSchema,
  metadata: jsonRecord.nullable(),
  /**
   * Non-null on a channel the deployment provisions for itself — `direct` is
   * the only one today. Such a channel cannot be deleted or deactivated, and
   * the counterparty list leaves it out.
   */
  systemKey: z.string().nullable(),
  /**
   * The catalog entry this channel was created from, for named networks only.
   * A stable identity a connector can bind to, unlike the display name.
   */
  presetKey: z.string().nullable(),
  rateLimitRps: z.number().int().nullable(),
  rateLimitBurst: z.number().int().nullable(),
  rateLimitPriorityGates: numberRecord.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

/**
 * A catalog entry the operator may create a channel from. Not a channel — no
 * row exists until they pick one.
 */
export const channelPresetSchema = z.object({
  key: z.string(),
  name: z.string(),
  kind: channelKindSchema,
  /**
   * `network` names a specific counterparty and is recorded on the row it
   * creates; `partner-type` only prefills the form's `kind`.
   */
  identity: z.enum(["network", "partner-type"]),
  website: z.string().optional(),
  description: z.string().optional(),
})

/**
 * Channel list/detail rows are hydrated with the identity-projection columns
 * (`website`, `contactName`, `contactEmail`) on top of the base `channels` row.
 */
export const channelSchema = channelBaseSchema.extend({
  website: z.string().nullable(),
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
})

// --- channel contact points / named contacts (identity-owned rows) ----------

export const channelContactPointSchema = z.object({
  id: idSchema,
  entityType: z.string(),
  entityId: z.string(),
  kind: z.string(),
  label: z.string().nullable(),
  value: z.string(),
  normalizedValue: z.string().nullable(),
  isPrimary: z.boolean(),
  notes: z.string().nullable(),
  metadata: jsonRecord.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

export const channelNamedContactSchema = z.object({
  id: idSchema,
  entityType: z.string(),
  entityId: z.string(),
  role: z.string(),
  name: z.string(),
  title: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  isPrimary: z.boolean(),
  notes: z.string().nullable(),
  metadata: jsonRecord.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

// --- contract ---------------------------------------------------------------

export const channelContractSchema = z.object({
  id: idSchema,
  channelId: z.string(),
  supplierId: z.string().nullable(),
  status: channelContractStatusSchema,
  startsAt: isoDate,
  endsAt: isoDate.nullable(),
  paymentOwner: distributionPaymentOwnerSchema,
  cancellationOwner: distributionCancellationOwnerSchema,
  settlementTerms: z.string().nullable(),
  notes: z.string().nullable(),
  rateLimitRps: z.number().int().nullable(),
  rateLimitBurst: z.number().int().nullable(),
  rateLimitPriorityGates: numberRecord.nullable(),
  policy: jsonRecord.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

// --- commission rule --------------------------------------------------------

export const channelCommissionRuleSchema = z.object({
  id: idSchema,
  contractId: z.string(),
  scope: channelCommissionScopeSchema,
  productId: z.string().nullable(),
  externalRateId: z.string().nullable(),
  externalCategoryId: z.string().nullable(),
  commissionType: channelCommissionTypeSchema,
  amountCents: z.number().int().nullable(),
  percentBasisPoints: z.number().int().nullable(),
  validFrom: isoDate.nullable(),
  validTo: isoDate.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

// --- product mapping --------------------------------------------------------

export const channelProductMappingSchema = z.object({
  id: idSchema,
  channelId: z.string(),
  productId: z.string(),
  externalProductId: z.string().nullable(),
  externalRateId: z.string().nullable(),
  externalCategoryId: z.string().nullable(),
  active: z.boolean(),
  sourceKind: z.string().nullable(),
  sourceConnectionId: z.string().nullable(),
  pushBookings: z.boolean(),
  pushAvailability: z.boolean(),
  pushContent: z.boolean(),
  policy: jsonRecord.nullable(),
  lastPushedContentHash: z.string().nullable(),
  lastPushedContentAt: isoTimestamp.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

// --- publication ------------------------------------------------------------

export const channelProductPublicationSchema = z.object({
  id: idSchema,
  channelId: z.string(),
  productId: z.string(),
  decision: channelPublicationDecisionSchema,
  reason: z.string().nullable(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
  metadata: jsonRecord.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

export const channelSupplierPublicationSchema = z.object({
  id: idSchema,
  channelId: z.string(),
  supplierId: z.string(),
  decision: channelPublicationDecisionSchema,
  reason: z.string().nullable(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
  metadata: jsonRecord.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

export const effectivePublicationSchema = z.object({
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

export const supplierPublicationMutationResponseSchema = z.object({
  data: channelSupplierPublicationSchema,
  affectedProductCount: z.number().int(),
})

export const supplierPublicationPreviewResponseSchema = z.object({
  data: z.object({
    channelId: z.string(),
    supplierId: z.string(),
    decision: channelPublicationDecisionSchema,
    reason: z.string().nullable().optional(),
    metadata: jsonRecord.nullable().optional(),
  }),
  affectedProductCount: z.number().int(),
})

export const channelSourcePublicationSchema = z.object({
  id: idSchema,
  channelId: z.string(),
  sourceKind: z.string(),
  sourceConnectionId: z.string().nullable(),
  decision: channelPublicationDecisionSchema,
  reason: z.string().nullable(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
  metadata: jsonRecord.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

export const effectiveSourcePublicationSchema = z.object({
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

export const publicationSourceSchema = z.object({
  sourceKind: z.string(),
  sourceConnectionId: z.string().nullable(),
  entryCount: z.number().int(),
})

export const sourcePublicationMutationResponseSchema = z.object({
  data: channelSourcePublicationSchema,
  affectedEntryCount: z.number().int(),
})

export const sourcePublicationPreviewResponseSchema = z.object({
  data: z.object({
    channelId: z.string(),
    sourceKind: z.string(),
    sourceConnectionId: z.string().nullable().optional(),
    decision: channelPublicationDecisionSchema,
    reason: z.string().nullable().optional(),
    metadata: jsonRecord.nullable().optional(),
  }),
  affectedEntryCount: z.number().int(),
})

export const channelPublicationReindexIntentSchema = z.object({
  id: idSchema,
  channelId: z.string().nullable(),
  kind: channelPublicationReindexIntentKindSchema,
  productId: z.string().nullable(),
  supplierId: z.string().nullable(),
  sourceKind: z.string().nullable(),
  sourceConnectionId: z.string().nullable(),
  cursor: z.string().nullable(),
  status: channelPublicationReindexIntentStatusSchema,
  attempts: z.number().int(),
  nextAttemptAt: isoTimestamp,
  leaseOwner: z.string().nullable(),
  leaseUntil: isoTimestamp.nullable(),
  requestedBy: z.string().nullable(),
  lastError: z.string().nullable(),
  metadata: jsonRecord.nullable(),
  requestedAt: isoTimestamp,
  processingStartedAt: isoTimestamp.nullable(),
  completedAt: isoTimestamp.nullable(),
  updatedAt: isoTimestamp,
})

// --- booking link -----------------------------------------------------------

export const channelBookingLinkSchema = z.object({
  id: idSchema,
  channelId: z.string(),
  bookingId: z.string(),
  bookingItemId: z.string().nullable(),
  externalBookingId: z.string().nullable(),
  externalReference: z.string().nullable(),
  externalStatus: z.string().nullable(),
  bookedAtExternal: isoTimestamp.nullable(),
  lastSyncedAt: isoTimestamp.nullable(),
  sourceKind: z.string().nullable(),
  sourceConnectionId: z.string().nullable(),
  pushStatus: z.string(),
  pushAttempts: z.number().int(),
  lastPushAt: isoTimestamp.nullable(),
  lastError: z.string().nullable(),
  pushedPayloadHash: z.string().nullable(),
  idempotencyKey: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

// --- webhook event ----------------------------------------------------------

export const channelWebhookEventSchema = z.object({
  id: idSchema,
  channelId: z.string(),
  eventType: z.string(),
  externalEventId: z.string().nullable(),
  payload: jsonRecord,
  receivedAt: isoTimestamp,
  processedAt: isoTimestamp.nullable(),
  status: channelWebhookStatusSchema,
  errorMessage: z.string().nullable(),
  createdAt: isoTimestamp,
})

// --- inventory allotments / targets / release rules -------------------------

export const channelInventoryAllotmentSchema = z.object({
  id: idSchema,
  channelId: z.string(),
  contractId: z.string().nullable(),
  productId: z.string(),
  optionId: z.string().nullable(),
  startTimeId: z.string().nullable(),
  validFrom: isoDate.nullable(),
  validTo: isoDate.nullable(),
  guaranteedCapacity: z.number().int().nullable(),
  maxCapacity: z.number().int().nullable(),
  active: z.boolean(),
  notes: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

export const channelInventoryAllotmentTargetSchema = z.object({
  id: idSchema,
  allotmentId: z.string(),
  slotId: z.string().nullable(),
  startTimeId: z.string().nullable(),
  dateLocal: isoDate.nullable(),
  guaranteedCapacity: z.number().int().nullable(),
  maxCapacity: z.number().int().nullable(),
  soldCapacity: z.number().int().nullable(),
  remainingCapacity: z.number().int().nullable(),
  active: z.boolean(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

export const channelInventoryReleaseRuleSchema = z.object({
  id: idSchema,
  allotmentId: z.string(),
  releaseMode: channelAllotmentReleaseModeSchema,
  releaseDaysBeforeStart: z.number().int().nullable(),
  releaseHoursBeforeStart: z.number().int().nullable(),
  unsoldAction: channelAllotmentUnsoldActionSchema,
  notes: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

export const channelInventoryReleaseExecutionSchema = z.object({
  id: idSchema,
  allotmentId: z.string(),
  releaseRuleId: z.string().nullable(),
  targetId: z.string().nullable(),
  slotId: z.string().nullable(),
  actionTaken: channelReleaseExecutionActionSchema,
  status: channelReleaseExecutionStatusSchema,
  releasedCapacity: z.number().int().nullable(),
  executedAt: isoTimestamp.nullable(),
  notes: z.string().nullable(),
  metadata: jsonRecord.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

// --- settlement / reconciliation --------------------------------------------

export const channelSettlementRunSchema = z.object({
  id: idSchema,
  channelId: z.string(),
  contractId: z.string().nullable(),
  status: channelSettlementRunStatusSchema,
  currencyCode: z.string().nullable(),
  periodStart: isoDate.nullable(),
  periodEnd: isoDate.nullable(),
  statementReference: z.string().nullable(),
  generatedAt: isoTimestamp.nullable(),
  postedAt: isoTimestamp.nullable(),
  paidAt: isoTimestamp.nullable(),
  notes: z.string().nullable(),
  metadata: jsonRecord.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

export const channelSettlementItemSchema = z.object({
  id: idSchema,
  settlementRunId: z.string(),
  bookingLinkId: z.string().nullable(),
  bookingId: z.string().nullable(),
  commissionRuleId: z.string().nullable(),
  status: channelSettlementItemStatusSchema,
  grossAmountCents: z.number().int(),
  commissionAmountCents: z.number().int(),
  netRemittanceAmountCents: z.number().int(),
  currencyCode: z.string().nullable(),
  remittanceDueAt: isoTimestamp.nullable(),
  paidAt: isoTimestamp.nullable(),
  notes: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

export const channelReconciliationRunSchema = z.object({
  id: idSchema,
  channelId: z.string(),
  contractId: z.string().nullable(),
  status: channelReconciliationRunStatusSchema,
  periodStart: isoDate.nullable(),
  periodEnd: isoDate.nullable(),
  externalReportReference: z.string().nullable(),
  startedAt: isoTimestamp.nullable(),
  completedAt: isoTimestamp.nullable(),
  notes: z.string().nullable(),
  metadata: jsonRecord.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

export const channelReconciliationItemSchema = z.object({
  id: idSchema,
  reconciliationRunId: z.string(),
  bookingLinkId: z.string().nullable(),
  bookingId: z.string().nullable(),
  externalBookingId: z.string().nullable(),
  issueType: channelReconciliationIssueTypeSchema,
  severity: channelReconciliationSeveritySchema,
  resolutionStatus: channelReconciliationResolutionStatusSchema,
  notes: z.string().nullable(),
  resolvedAt: isoTimestamp.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

// --- settlement / reconciliation policies, schedules, exceptions, approvals --

export const channelSettlementPolicySchema = z.object({
  id: idSchema,
  channelId: z.string(),
  contractId: z.string().nullable(),
  frequency: channelSettlementPolicyFrequencySchema,
  autoGenerate: z.boolean(),
  approvalRequired: z.boolean(),
  remittanceDaysAfterPeriodEnd: z.number().int().nullable(),
  minimumPayoutAmountCents: z.number().int().nullable(),
  currencyCode: z.string().nullable(),
  active: z.boolean(),
  notes: z.string().nullable(),
  metadata: jsonRecord.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

export const channelReconciliationPolicySchema = z.object({
  id: idSchema,
  channelId: z.string(),
  contractId: z.string().nullable(),
  frequency: channelReconciliationPolicyFrequencySchema,
  autoRun: z.boolean(),
  compareGrossAmounts: z.boolean(),
  compareStatuses: z.boolean(),
  compareCancellations: z.boolean(),
  amountToleranceCents: z.number().int().nullable(),
  active: z.boolean(),
  notes: z.string().nullable(),
  metadata: jsonRecord.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

export const channelReleaseScheduleSchema = z.object({
  id: idSchema,
  releaseRuleId: z.string(),
  scheduleKind: channelReleaseScheduleKindSchema,
  nextRunAt: isoTimestamp.nullable(),
  lastRunAt: isoTimestamp.nullable(),
  active: z.boolean(),
  notes: z.string().nullable(),
  metadata: jsonRecord.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

export const channelRemittanceExceptionSchema = z.object({
  id: idSchema,
  channelId: z.string(),
  settlementItemId: z.string().nullable(),
  reconciliationItemId: z.string().nullable(),
  exceptionType: z.string(),
  severity: channelReconciliationSeveritySchema,
  status: channelRemittanceExceptionStatusSchema,
  openedAt: isoTimestamp,
  resolvedAt: isoTimestamp.nullable(),
  notes: z.string().nullable(),
  metadata: jsonRecord.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

export const channelSettlementApprovalSchema = z.object({
  id: idSchema,
  settlementRunId: z.string(),
  approverUserId: z.string().nullable(),
  status: channelSettlementApprovalStatusSchema,
  decidedAt: isoTimestamp.nullable(),
  notes: z.string().nullable(),
  metadata: jsonRecord.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})
