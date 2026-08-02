import type {
  channelBookingLinks,
  channelCommissionRules,
  channelContracts,
  channelInventoryAllotments,
  channelInventoryAllotmentTargets,
  channelInventoryReleaseExecutions,
  channelInventoryReleaseRules,
  channelProductMappings,
  channelProductPublications,
  channelPublicationReindexIntents,
  channelReconciliationItems,
  channelReconciliationPolicies,
  channelReconciliationRuns,
  channelReleaseSchedules,
  channelRemittanceExceptions,
  channelSettlementApprovals,
  channelSettlementItems,
  channelSettlementPolicies,
  channelSettlementRuns,
  channelSupplierPublications,
  channels,
  channelWebhookEvents,
  externalRefs,
} from "@voyant-travel/distribution/schema"
import type { InferSelectModel } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  channelBookingLinkSchema,
  channelCommissionRuleSchema,
  channelContractSchema,
  channelInventoryAllotmentSchema,
  channelInventoryAllotmentTargetSchema,
  channelInventoryReleaseExecutionSchema,
  channelInventoryReleaseRuleSchema,
  channelProductMappingSchema,
  channelProductPublicationSchema,
  channelPublicationReindexIntentSchema,
  channelReconciliationItemSchema,
  channelReconciliationPolicySchema,
  channelReconciliationRunSchema,
  channelReleaseScheduleSchema,
  channelRemittanceExceptionSchema,
  channelSchema,
  channelSettlementApprovalSchema,
  channelSettlementItemSchema,
  channelSettlementPolicySchema,
  channelSettlementRunSchema,
  channelSupplierPublicationSchema,
  channelWebhookEventSchema,
  effectivePublicationSchema,
  supplierPublicationPreviewResponseSchema,
} from "../../src/routes/openapi-schemas.js"

/**
 * Response contract tests (voyant#2114 — distribution sub-batch) for the
 * distribution admin routes. Each Drizzle-backed fixture is typed as the real
 * `$inferSelect` row so column drift breaks compilation; the JSON round-trip
 * (Date → ISO string) mirrors `c.json` so a declared/actual mismatch breaks the
 * test. The schemas mirror the response shapes declared in `routes.ts` /
 * `routes/inventory.ts` / `routes/settlements.ts` / `external-refs/routes.ts`
 * (§17: `timestamp`/`date` columns → strings; jsonb bags are open records).
 * No distribution list endpoint joins another table, so list rows carry no
 * extra columns beyond the base `$inferSelect` shape (the channel row is the one
 * exception — it is hydrated with the identity-projection `website`/
 * `contactName`/`contactEmail` columns); each list is asserted against the
 * shared `{ data, total, limit, offset }` envelope using the same row schema as
 * the single `{ data }` get/create/update responses.
 */

const createdAt = new Date("2026-01-01T00:00:00.000Z")
const updatedAt = new Date("2026-01-02T00:00:00.000Z")

// `external_refs` is documented with an inline schema in `external-refs/routes.ts`;
// mirror it here so the contract still guards the entity-ref envelope.
const externalRefSchema = z.object({
  id: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  sourceSystem: z.string(),
  objectType: z.string(),
  namespace: z.string(),
  externalId: z.string(),
  externalParentId: z.string().nullable(),
  isPrimary: z.boolean(),
  status: z.enum(["active", "inactive", "archived"]),
  lastSyncedAt: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

// --- Drizzle-backed rows — typed so a column rename/retype breaks compilation.

const channelRow: InferSelectModel<typeof channels> = {
  id: "channels_00000000000000000000000000",
  name: "Acme OTA",
  description: null,
  kind: "ota",
  status: "active",
  metadata: null,
  rateLimitRps: null,
  rateLimitBurst: null,
  rateLimitPriorityGates: null,
  createdAt,
  updatedAt,
}

/** The channel list/detail response is hydrated with identity-projection columns. */
const hydratedChannelRow = {
  ...channelRow,
  website: "https://acme.example",
  contactName: "Ada Lovelace",
  contactEmail: "ada@acme.example",
}

const contractRow: InferSelectModel<typeof channelContracts> = {
  id: "channel_contracts_0000000000000000000000",
  channelId: channelRow.id,
  supplierId: null,
  status: "draft",
  startsAt: "2026-07-01",
  endsAt: null,
  paymentOwner: "operator",
  cancellationOwner: "operator",
  settlementTerms: null,
  notes: null,
  rateLimitRps: null,
  rateLimitBurst: null,
  rateLimitPriorityGates: null,
  policy: null,
  createdAt,
  updatedAt,
}

const commissionRuleRow: InferSelectModel<typeof channelCommissionRules> = {
  id: "channel_commission_rules_0000000000000000",
  contractId: contractRow.id,
  scope: "booking",
  productId: null,
  externalRateId: null,
  externalCategoryId: null,
  commissionType: "percentage",
  amountCents: null,
  percentBasisPoints: 1000,
  validFrom: null,
  validTo: null,
  createdAt,
  updatedAt,
}

const productMappingRow: InferSelectModel<typeof channelProductMappings> = {
  id: "channel_product_mappings_0000000000000000",
  channelId: channelRow.id,
  productId: "prod_0000000000000000000000000",
  externalProductId: "ext-1",
  externalRateId: null,
  externalCategoryId: null,
  active: true,
  sourceKind: null,
  sourceConnectionId: null,
  pushBookings: true,
  pushAvailability: true,
  pushContent: true,
  policy: null,
  lastPushedContentHash: null,
  lastPushedContentAt: null,
  createdAt,
  updatedAt,
}

const productPublicationRow: InferSelectModel<typeof channelProductPublications> = {
  id: "channel_product_publications_000000000000",
  channelId: channelRow.id,
  productId: productMappingRow.productId,
  decision: "include",
  reason: "Published for storefront channel",
  createdBy: "user_0000000000000000000000000",
  updatedBy: "user_0000000000000000000000000",
  metadata: null,
  createdAt,
  updatedAt,
}

const supplierPublicationRow: InferSelectModel<typeof channelSupplierPublications> = {
  id: "channel_supplier_publications_00000000000",
  channelId: channelRow.id,
  supplierId: "sup_0000000000000000000000000",
  decision: "exclude",
  reason: "Supplier paused",
  createdBy: "user_0000000000000000000000000",
  updatedBy: "user_0000000000000000000000000",
  metadata: { note: "manual" },
  createdAt,
  updatedAt,
}

const publicationReindexIntentRow: InferSelectModel<typeof channelPublicationReindexIntents> = {
  id: "channel_publication_reindex_intents_000000",
  channelId: channelRow.id,
  kind: "supplier",
  productId: null,
  supplierId: supplierPublicationRow.supplierId,
  cursor: null,
  status: "pending",
  attempts: 0,
  nextAttemptAt: createdAt,
  leaseOwner: null,
  leaseUntil: null,
  requestedBy: "user_0000000000000000000000000",
  lastError: null,
  metadata: null,
  requestedAt: createdAt,
  processingStartedAt: null,
  completedAt: null,
  updatedAt,
}

const bookingLinkRow: InferSelectModel<typeof channelBookingLinks> = {
  id: "channel_booking_links_0000000000000000000",
  channelId: channelRow.id,
  bookingId: "bkg_0000000000000000000000000",
  bookingItemId: null,
  externalBookingId: null,
  externalReference: null,
  externalStatus: null,
  bookedAtExternal: null,
  lastSyncedAt: null,
  sourceKind: null,
  sourceConnectionId: null,
  pushStatus: "pending",
  pushAttempts: 0,
  lastPushAt: null,
  lastError: null,
  pushedPayloadHash: null,
  idempotencyKey: null,
  createdAt,
  updatedAt,
}

const webhookEventRow: InferSelectModel<typeof channelWebhookEvents> = {
  id: "channel_webhook_events_0000000000000000000",
  channelId: channelRow.id,
  eventType: "booking.created",
  externalEventId: null,
  payload: { foo: "bar" },
  receivedAt: createdAt,
  processedAt: null,
  status: "pending",
  errorMessage: null,
  createdAt,
}

const allotmentRow: InferSelectModel<typeof channelInventoryAllotments> = {
  id: "channel_inventory_allotments_0000000000000",
  channelId: channelRow.id,
  contractId: null,
  productId: "prod_0000000000000000000000000",
  optionId: null,
  startTimeId: null,
  validFrom: null,
  validTo: null,
  guaranteedCapacity: 10,
  maxCapacity: 20,
  active: true,
  notes: null,
  createdAt,
  updatedAt,
}

const allotmentTargetRow: InferSelectModel<typeof channelInventoryAllotmentTargets> = {
  id: "channel_inventory_allotment_targets_0000000",
  allotmentId: allotmentRow.id,
  slotId: null,
  startTimeId: null,
  dateLocal: "2026-07-01",
  guaranteedCapacity: 10,
  maxCapacity: 20,
  soldCapacity: 0,
  remainingCapacity: 20,
  active: true,
  createdAt,
  updatedAt,
}

const releaseRuleRow: InferSelectModel<typeof channelInventoryReleaseRules> = {
  id: "channel_inventory_release_rules_0000000000",
  allotmentId: allotmentRow.id,
  releaseMode: "automatic",
  releaseDaysBeforeStart: 2,
  releaseHoursBeforeStart: null,
  unsoldAction: "release_to_general_pool",
  notes: null,
  createdAt,
  updatedAt,
}

const releaseExecutionRow: InferSelectModel<typeof channelInventoryReleaseExecutions> = {
  id: "channel_inventory_release_executions_000000",
  allotmentId: allotmentRow.id,
  releaseRuleId: releaseRuleRow.id,
  targetId: null,
  slotId: null,
  actionTaken: "released",
  status: "completed",
  releasedCapacity: 5,
  executedAt: createdAt,
  notes: null,
  metadata: null,
  createdAt,
  updatedAt,
}

const settlementRunRow: InferSelectModel<typeof channelSettlementRuns> = {
  id: "channel_settlement_runs_0000000000000000000",
  channelId: channelRow.id,
  contractId: null,
  status: "draft",
  currencyCode: "EUR",
  periodStart: "2026-06-01",
  periodEnd: "2026-06-30",
  statementReference: null,
  generatedAt: null,
  postedAt: null,
  paidAt: null,
  notes: null,
  metadata: null,
  createdAt,
  updatedAt,
}

const settlementItemRow: InferSelectModel<typeof channelSettlementItems> = {
  id: "channel_settlement_items_000000000000000000",
  settlementRunId: settlementRunRow.id,
  bookingLinkId: null,
  bookingId: null,
  commissionRuleId: null,
  status: "pending",
  grossAmountCents: 10000,
  commissionAmountCents: 1000,
  netRemittanceAmountCents: 9000,
  currencyCode: "EUR",
  remittanceDueAt: null,
  paidAt: null,
  notes: null,
  createdAt,
  updatedAt,
}

const reconciliationRunRow: InferSelectModel<typeof channelReconciliationRuns> = {
  id: "channel_reconciliation_runs_00000000000000",
  channelId: channelRow.id,
  contractId: null,
  status: "draft",
  periodStart: "2026-06-01",
  periodEnd: "2026-06-30",
  externalReportReference: null,
  startedAt: null,
  completedAt: null,
  notes: null,
  metadata: null,
  createdAt,
  updatedAt,
}

const reconciliationItemRow: InferSelectModel<typeof channelReconciliationItems> = {
  id: "channel_reconciliation_items_0000000000000",
  reconciliationRunId: reconciliationRunRow.id,
  bookingLinkId: null,
  bookingId: null,
  externalBookingId: null,
  issueType: "other",
  severity: "warning",
  resolutionStatus: "open",
  notes: null,
  resolvedAt: null,
  createdAt,
  updatedAt,
}

const settlementPolicyRow: InferSelectModel<typeof channelSettlementPolicies> = {
  id: "channel_settlement_policies_00000000000000",
  channelId: channelRow.id,
  contractId: null,
  frequency: "manual",
  autoGenerate: false,
  approvalRequired: false,
  remittanceDaysAfterPeriodEnd: null,
  minimumPayoutAmountCents: null,
  currencyCode: null,
  active: true,
  notes: null,
  metadata: null,
  createdAt,
  updatedAt,
}

const reconciliationPolicyRow: InferSelectModel<typeof channelReconciliationPolicies> = {
  id: "channel_reconciliation_policies_0000000000",
  channelId: channelRow.id,
  contractId: null,
  frequency: "manual",
  autoRun: false,
  compareGrossAmounts: true,
  compareStatuses: true,
  compareCancellations: true,
  amountToleranceCents: null,
  active: true,
  notes: null,
  metadata: null,
  createdAt,
  updatedAt,
}

const releaseScheduleRow: InferSelectModel<typeof channelReleaseSchedules> = {
  id: "channel_release_schedules_0000000000000000",
  releaseRuleId: releaseRuleRow.id,
  scheduleKind: "manual",
  nextRunAt: null,
  lastRunAt: null,
  active: true,
  notes: null,
  metadata: null,
  createdAt,
  updatedAt,
}

const remittanceExceptionRow: InferSelectModel<typeof channelRemittanceExceptions> = {
  id: "channel_remittance_exceptions_000000000000",
  channelId: channelRow.id,
  settlementItemId: null,
  reconciliationItemId: null,
  exceptionType: "amount_mismatch",
  severity: "warning",
  status: "open",
  openedAt: createdAt,
  resolvedAt: null,
  notes: null,
  metadata: null,
  createdAt,
  updatedAt,
}

const settlementApprovalRow: InferSelectModel<typeof channelSettlementApprovals> = {
  id: "channel_settlement_approvals_0000000000000",
  settlementRunId: settlementRunRow.id,
  approverUserId: null,
  status: "pending",
  decidedAt: null,
  notes: null,
  metadata: null,
  createdAt,
  updatedAt,
}

const externalRefRow: InferSelectModel<typeof externalRefs> = {
  id: "external_refs_0000000000000000000000000",
  entityType: "channel",
  entityId: channelRow.id,
  sourceSystem: "voyant-connect",
  objectType: "channel",
  namespace: "default",
  externalId: "ext-channel-1",
  externalParentId: null,
  isPrimary: true,
  status: "active",
  lastSyncedAt: null,
  metadata: null,
  createdAt,
  updatedAt,
}

const pagination = { total: 1, limit: 50, offset: 0 } as const

const cases: Array<{ name: string; row: object; schema: z.ZodTypeAny }> = [
  { name: "channel", row: hydratedChannelRow, schema: channelSchema },
  { name: "contract", row: contractRow, schema: channelContractSchema },
  { name: "commission rule", row: commissionRuleRow, schema: channelCommissionRuleSchema },
  { name: "product mapping", row: productMappingRow, schema: channelProductMappingSchema },
  {
    name: "product publication",
    row: productPublicationRow,
    schema: channelProductPublicationSchema,
  },
  {
    name: "supplier publication",
    row: supplierPublicationRow,
    schema: channelSupplierPublicationSchema,
  },
  {
    name: "publication reindex intent",
    row: publicationReindexIntentRow,
    schema: channelPublicationReindexIntentSchema,
  },
  { name: "booking link", row: bookingLinkRow, schema: channelBookingLinkSchema },
  { name: "webhook event", row: webhookEventRow, schema: channelWebhookEventSchema },
  { name: "inventory allotment", row: allotmentRow, schema: channelInventoryAllotmentSchema },
  {
    name: "inventory allotment target",
    row: allotmentTargetRow,
    schema: channelInventoryAllotmentTargetSchema,
  },
  {
    name: "inventory release rule",
    row: releaseRuleRow,
    schema: channelInventoryReleaseRuleSchema,
  },
  {
    name: "inventory release execution",
    row: releaseExecutionRow,
    schema: channelInventoryReleaseExecutionSchema,
  },
  { name: "settlement run", row: settlementRunRow, schema: channelSettlementRunSchema },
  { name: "settlement item", row: settlementItemRow, schema: channelSettlementItemSchema },
  { name: "reconciliation run", row: reconciliationRunRow, schema: channelReconciliationRunSchema },
  {
    name: "reconciliation item",
    row: reconciliationItemRow,
    schema: channelReconciliationItemSchema,
  },
  { name: "settlement policy", row: settlementPolicyRow, schema: channelSettlementPolicySchema },
  {
    name: "reconciliation policy",
    row: reconciliationPolicyRow,
    schema: channelReconciliationPolicySchema,
  },
  { name: "release schedule", row: releaseScheduleRow, schema: channelReleaseScheduleSchema },
  {
    name: "remittance exception",
    row: remittanceExceptionRow,
    schema: channelRemittanceExceptionSchema,
  },
  {
    name: "settlement approval",
    row: settlementApprovalRow,
    schema: channelSettlementApprovalSchema,
  },
  { name: "external reference", row: externalRefRow, schema: externalRefSchema },
]

describe("distribution Drizzle-backed response contracts", () => {
  for (const { name, row, schema } of cases) {
    it(`the ${name} { data } envelope satisfies the declared schema`, () => {
      const wire = JSON.parse(JSON.stringify({ data: row }))
      const parsed = z.object({ data: schema }).safeParse(wire)
      expect(parsed.success ? null : parsed.error.toString()).toBeNull()
    })

    it(`the ${name} list envelope satisfies the declared schema`, () => {
      const wire = JSON.parse(JSON.stringify({ data: [row], ...pagination }))
      const parsed = z
        .object({
          data: z.array(schema),
          total: z.number().int(),
          limit: z.number().int(),
          offset: z.number().int(),
        })
        .safeParse(wire)
      expect(parsed.success ? null : parsed.error.toString()).toBeNull()
    })
  }
})

describe("distribution publication response contracts", () => {
  it("the effective publication envelope satisfies the declared schema", () => {
    const wire = {
      data: {
        channelId: channelRow.id,
        productId: productMappingRow.productId,
        canonicalSupplierId: supplierPublicationRow.supplierId,
        published: true,
        decision: "include",
        reason: "product_decision",
        source: "product",
        ruleId: productPublicationRow.id,
        message: "Product publication explicitly includes the product.",
      },
    }
    const parsed = z.object({ data: effectivePublicationSchema }).safeParse(wire)
    expect(parsed.success ? null : parsed.error.toString()).toBeNull()
  })

  it("the supplier publication preview envelope satisfies the declared schema", () => {
    const wire = {
      data: {
        channelId: channelRow.id,
        supplierId: supplierPublicationRow.supplierId,
        decision: "include",
        reason: null,
        metadata: null,
      },
      affectedProductCount: 12,
    }
    const parsed = supplierPublicationPreviewResponseSchema.safeParse(wire)
    expect(parsed.success ? null : parsed.error.toString()).toBeNull()
  })
})
