import {
  defineTool,
  READ_ONLY_RISK,
  requireService,
  type ToolContext,
  ToolError,
} from "@voyant-travel/tools"
import { z } from "zod"

const principalTypeSchema = z.enum(["user", "api_key", "agent", "workflow", "system"])
const actionKindSchema = z.enum([
  "read",
  "create",
  "update",
  "delete",
  "execute",
  "approve",
  "reject",
  "reverse",
  "compensate",
  "duplicate",
])
const actionStatusSchema = z.enum([
  "requested",
  "awaiting_approval",
  "approved",
  "denied",
  "succeeded",
  "failed",
  "reversed",
  "compensated",
  "expired",
  "cancelled",
  "superseded",
])
const riskSchema = z.enum(["low", "medium", "high", "critical"])
const approvalStatusSchema = z.enum([
  "pending",
  "approved",
  "denied",
  "expired",
  "cancelled",
  "superseded",
])
const reversalKindSchema = z.enum(["none", "revert", "compensate", "domain_command"])
const reversalStateSchema = z.enum([
  "not_reversible",
  "available",
  "requested",
  "running",
  "completed",
  "failed",
  "expired",
])
const reversalOutcomeSchema = z.enum(["full", "partial", "failed"])
const redactionStatusSchema = z.enum(["none", "redacted", "tombstoned", "crypto_shredded"])

const ledgerCursorSchema = z.object({ occurredAt: z.string().datetime(), id: z.string() })
const createdCursorSchema = z.object({ createdAt: z.string().datetime(), id: z.string() })

export const actionLedgerEntryDtoSchema = z.object({
  id: z.string(),
  occurredAt: z.string().datetime(),
  actionName: z.string(),
  actionVersion: z.string(),
  actionKind: actionKindSchema,
  status: actionStatusSchema,
  evaluatedRisk: riskSchema,
  actorType: z.string().nullable(),
  principalType: principalTypeSchema,
  principalId: z.string(),
  principalSubtype: z.string().nullable(),
  sessionId: z.string().nullable(),
  apiTokenId: z.string().nullable(),
  internalRequest: z.boolean(),
  delegatedByPrincipalType: principalTypeSchema.nullable(),
  delegatedByPrincipalId: z.string().nullable(),
  delegationId: z.string().nullable(),
  callerType: z.string().nullable(),
  organizationId: z.string().nullable(),
  routeOrToolName: z.string().nullable(),
  workflowRunId: z.string().nullable(),
  workflowStepId: z.string().nullable(),
  correlationId: z.string().nullable(),
  causationActionId: z.string().nullable(),
  idempotencyScope: z.string().nullable(),
  idempotencyKey: z.string().nullable(),
  idempotencyFingerprint: z.string().nullable(),
  targetType: z.string(),
  targetId: z.string(),
  capabilityId: z.string().nullable(),
  capabilityVersion: z.string().nullable(),
  authorizationSource: z.string().nullable(),
  approvalId: z.string().nullable(),
  amendsActionId: z.string().nullable(),
  createdAt: z.string().datetime(),
})

const mutationDetailDtoSchema = z.object({
  actionId: z.string(),
  commandInputRef: z.string().nullable(),
  commandResultRef: z.string().nullable(),
  summary: z.string().nullable(),
  reversalKind: reversalKindSchema,
  reversalCommandId: z.string().nullable(),
  reversalCommandVersion: z.string().nullable(),
  reversalArgsRef: z.string().nullable(),
  reversalStateProjection: reversalStateSchema.nullable(),
  reversalOutcomeProjection: reversalOutcomeSchema.nullable(),
  reversesActionId: z.string().nullable(),
  reversedByActionIdProjection: z.string().nullable(),
})
const sensitiveReadDetailDtoSchema = z.object({
  actionId: z.string(),
  reasonCode: z.string().nullable(),
  disclosedFieldSet: z.array(z.string()).nullable(),
  disclosureSummary: z.string().nullable(),
  decisionPolicy: z.string().nullable(),
})
const payloadDtoSchema = z.object({
  id: z.string(),
  actionId: z.string(),
  payloadKind: z.string(),
  schemaTag: z.string(),
  redactionStatus: redactionStatusSchema,
  retentionPolicy: z.string(),
  storageRef: z.string(),
  hash: z.string().nullable(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
})
export const actionLedgerEntryDetailDtoSchema = actionLedgerEntryDtoSchema.extend({
  mutationDetail: mutationDetailDtoSchema.nullable(),
  sensitiveReadDetail: sensitiveReadDetailDtoSchema.nullable(),
  payloads: z.array(payloadDtoSchema),
})

export const actionApprovalDtoSchema = z.object({
  id: z.string(),
  requestedActionId: z.string(),
  status: approvalStatusSchema,
  requestedByPrincipalId: z.string(),
  assignedToPrincipalId: z.string().nullable(),
  decidedByPrincipalId: z.string().nullable(),
  delegatedFromPrincipalId: z.string().nullable(),
  policyName: z.string(),
  policyVersion: z.string(),
  targetSnapshotRef: z.string().nullable(),
  riskSnapshot: riskSchema,
  reasonCode: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
  decidedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
})
export const actionApprovalDetailDtoSchema = actionApprovalDtoSchema.extend({
  requestedAction: actionLedgerEntryDetailDtoSchema.nullable(),
})
export const actionDelegationDtoSchema = z.object({
  id: z.string(),
  rootPrincipalType: principalTypeSchema,
  rootPrincipalId: z.string(),
  parentPrincipalType: principalTypeSchema,
  parentPrincipalId: z.string(),
  childPrincipalType: principalTypeSchema,
  childPrincipalId: z.string(),
  grantSource: z.string(),
  capabilityScopeRef: z.string().nullable(),
  budgetScopeRef: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
})

export const listActionLedgerEntriesInputSchema = z.object({
  actionName: z.string().trim().min(1).optional(),
  actionKind: actionKindSchema.optional(),
  principalType: principalTypeSchema.optional(),
  principalId: z.string().trim().min(1).optional(),
  organizationId: z.string().trim().min(1).optional(),
  targetType: z.string().trim().min(1).optional(),
  targetId: z.string().trim().min(1).optional(),
  routeOrToolName: z.string().trim().min(1).optional(),
  workflowRunId: z.string().trim().min(1).optional(),
  correlationId: z.string().trim().min(1).optional(),
  approvalId: z.string().trim().min(1).optional(),
  evaluatedRisk: z.array(riskSchema).min(1).optional(),
  status: z.array(actionStatusSchema).min(1).optional(),
  reversalKind: z.array(reversalKindSchema).min(1).optional(),
  reversalState: z.array(reversalStateSchema).min(1).optional(),
  reversalOutcome: z.array(reversalOutcomeSchema).min(1).optional(),
  occurredAtFrom: z.string().datetime().optional(),
  occurredAtTo: z.string().datetime().optional(),
  cursor: ledgerCursorSchema.optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  limit: z.number().int().min(1).max(200).optional(),
})
const getByIdInputSchema = z.object({ id: z.string().trim().min(1) })
const targetTimelineInputSchema = z.object({
  targetType: z.string().trim().min(1),
  targetId: z.string().trim().min(1),
  cursor: ledgerCursorSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
})
const listApprovalsInputSchema = z.object({
  requestedActionId: z.string().trim().min(1).optional(),
  status: z.array(approvalStatusSchema).min(1).optional(),
  requestedByPrincipalId: z.string().trim().min(1).optional(),
  assignedToPrincipalId: z.string().trim().min(1).optional(),
  decidedByPrincipalId: z.string().trim().min(1).optional(),
  policyName: z.string().trim().min(1).optional(),
  policyVersion: z.string().trim().min(1).optional(),
  riskSnapshot: z.array(riskSchema).min(1).optional(),
  reasonCode: z.string().trim().min(1).optional(),
  expiresAtFrom: z.string().datetime().optional(),
  expiresAtTo: z.string().datetime().optional(),
  createdAtFrom: z.string().datetime().optional(),
  createdAtTo: z.string().datetime().optional(),
  cursor: createdCursorSchema.optional(),
  limit: z.number().int().min(1).max(200).optional(),
})
const listDelegationsInputSchema = z.object({
  rootPrincipalType: principalTypeSchema.optional(),
  rootPrincipalId: z.string().trim().min(1).optional(),
  parentPrincipalType: principalTypeSchema.optional(),
  parentPrincipalId: z.string().trim().min(1).optional(),
  childPrincipalType: principalTypeSchema.optional(),
  childPrincipalId: z.string().trim().min(1).optional(),
  grantSource: z.string().trim().min(1).optional(),
  capabilityScopeRef: z.string().trim().min(1).optional(),
  budgetScopeRef: z.string().trim().min(1).optional(),
  cursor: createdCursorSchema.optional(),
  limit: z.number().int().min(1).max(200).optional(),
})
const requestApprovalInputSchema = z.object({
  actionId: z.string().trim().min(1).describe("Stable id of a selected graph action."),
  actionVersion: z.string().trim().min(1).default("v1"),
  toolCapabilityId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "Exact selected Tool capability being approved. Required when an action is exposed by multiple Tools.",
    ),
  targetId: z.string().trim().min(1),
  commandInput: z.json().optional(),
  idempotencyKey: z.string().trim().min(1).max(255),
  assignedToPrincipalId: z.string().trim().min(1).optional(),
  targetSnapshotRef: z.string().trim().min(1).optional(),
  reasonCode: z.string().trim().min(1).optional(),
  expiresAt: z.string().datetime().optional(),
})
const decideApprovalInputSchema = z.object({ approvalId: z.string().trim().min(1) })

export type ActionLedgerEntryDto = z.infer<typeof actionLedgerEntryDtoSchema>
export type ActionLedgerEntryDetailDto = z.infer<typeof actionLedgerEntryDetailDtoSchema>
export type ActionApprovalDto = z.infer<typeof actionApprovalDtoSchema>
export type ActionApprovalDetailDto = z.infer<typeof actionApprovalDetailDtoSchema>
export type ActionDelegationDto = z.infer<typeof actionDelegationDtoSchema>
export type ListActionLedgerEntriesToolInput = z.infer<typeof listActionLedgerEntriesInputSchema>
export type RequestActionApprovalToolInput = z.infer<typeof requestApprovalInputSchema>

export interface ActionLedgerToolServices {
  listEntries(input: ListActionLedgerEntriesToolInput): Promise<{
    data: ActionLedgerEntryDto[]
    nextCursor: z.infer<typeof ledgerCursorSchema> | null
  }>
  getEntry(id: string): Promise<ActionLedgerEntryDetailDto | null>
  getTargetTimeline(input: z.infer<typeof targetTimelineInputSchema>): Promise<{
    data: Array<ActionLedgerEntryDto & { mutationSummary: string | null }>
    nextCursor: z.infer<typeof ledgerCursorSchema> | null
  }>
  listApprovals(input: z.infer<typeof listApprovalsInputSchema>): Promise<{
    data: ActionApprovalDto[]
    nextCursor: z.infer<typeof createdCursorSchema> | null
  }>
  getApproval(id: string): Promise<ActionApprovalDetailDto | null>
  listDelegations(input: z.infer<typeof listDelegationsInputSchema>): Promise<{
    data: ActionDelegationDto[]
    nextCursor: z.infer<typeof createdCursorSchema> | null
  }>
  getDelegation(id: string): Promise<ActionDelegationDto | null>
  requestApproval(input: RequestActionApprovalToolInput): Promise<{
    requestedAction: ActionLedgerEntryDto
    approval: ActionApprovalDto
    replayed: boolean
  }>
  decideApproval(input: { approvalId: string; status: "approved" | "denied" }): Promise<{
    approval: ActionApprovalDto
    decisionAction: ActionLedgerEntryDto
  }>
}

export type ActionLedgerToolContext = ToolContext & { actionLedger?: ActionLedgerToolServices }

function service(ctx: ActionLedgerToolContext): ActionLedgerToolServices {
  if (ctx.actor !== "staff" || ctx.audience !== "staff") {
    throw new ToolError(
      "Action-ledger Tools are restricted to staff grants.",
      "AUTHORIZATION_DENIED",
      {
        actor: ctx.actor,
        audience: ctx.audience,
      },
    )
  }
  return requireService(ctx.actionLedger, "actionLedger")
}

const pagedEntriesOutputSchema = z.object({
  data: z.array(actionLedgerEntryDtoSchema),
  nextCursor: ledgerCursorSchema.nullable(),
})
const pagedApprovalsOutputSchema = z.object({
  data: z.array(actionApprovalDtoSchema),
  nextCursor: createdCursorSchema.nullable(),
})
const pagedDelegationsOutputSchema = z.object({
  data: z.array(actionDelegationDtoSchema),
  nextCursor: createdCursorSchema.nullable(),
})

export const listActionLedgerEntriesTool = defineTool({
  name: "list_action_ledger_entries",
  description:
    "List staff-only action audit records with bounded filters and cursor pagination. Returns metadata and references, never dereferenced payload contents.",
  inputSchema: listActionLedgerEntriesInputSchema,
  outputSchema: pagedEntriesOutputSchema,
  requiredScopes: ["action-ledger:read"],
  tier: "sensitive",
  riskPolicy: READ_ONLY_RISK,
  async handler(input, ctx: ActionLedgerToolContext) {
    return service(ctx).listEntries(input)
  },
})

export const getActionLedgerEntryTool = defineTool({
  name: "get_action_ledger_entry",
  description:
    "Read one staff-only audit record with mutation, sensitive-read, and payload-reference metadata. Stored payload contents are not dereferenced.",
  inputSchema: getByIdInputSchema,
  outputSchema: actionLedgerEntryDetailDtoSchema,
  requiredScopes: ["action-ledger:read"],
  tier: "sensitive",
  riskPolicy: READ_ONLY_RISK,
  async handler({ id }, ctx: ActionLedgerToolContext) {
    const result = await service(ctx).getEntry(id)
    if (!result)
      throw new ToolError(`Action ledger entry "${id}" was not found.`, "NOT_FOUND", { id })
    return result
  },
})

export const getActionTargetTimelineTool = defineTool({
  name: "get_action_target_timeline",
  description:
    "Read a newest-first staff-only audit timeline for one exact target, including recorded mutation summaries.",
  inputSchema: targetTimelineInputSchema,
  outputSchema: z.object({
    data: z.array(actionLedgerEntryDtoSchema.extend({ mutationSummary: z.string().nullable() })),
    nextCursor: ledgerCursorSchema.nullable(),
  }),
  requiredScopes: ["action-ledger:read"],
  tier: "sensitive",
  riskPolicy: READ_ONLY_RISK,
  async handler(input, ctx: ActionLedgerToolContext) {
    return service(ctx).getTargetTimeline(input)
  },
})

export const listActionApprovalsTool = defineTool({
  name: "list_action_approvals",
  description: "List staff-only approval records and policy snapshots with bounded filters.",
  inputSchema: listApprovalsInputSchema,
  outputSchema: pagedApprovalsOutputSchema,
  requiredScopes: ["action-ledger:read"],
  tier: "sensitive",
  riskPolicy: READ_ONLY_RISK,
  async handler(input, ctx: ActionLedgerToolContext) {
    return service(ctx).listApprovals(input)
  },
})

export const getActionApprovalTool = defineTool({
  name: "get_action_approval",
  description:
    "Read one staff-only approval, its selected policy snapshot, and its requested audit action.",
  inputSchema: getByIdInputSchema,
  outputSchema: actionApprovalDetailDtoSchema,
  requiredScopes: ["action-ledger:read"],
  tier: "sensitive",
  riskPolicy: READ_ONLY_RISK,
  async handler({ id }, ctx: ActionLedgerToolContext) {
    const result = await service(ctx).getApproval(id)
    if (!result) throw new ToolError(`Action approval "${id}" was not found.`, "NOT_FOUND", { id })
    return result
  },
})

export const listActionDelegationsTool = defineTool({
  name: "list_action_delegations",
  description: "List staff-only delegation provenance and capability/budget references.",
  inputSchema: listDelegationsInputSchema,
  outputSchema: pagedDelegationsOutputSchema,
  requiredScopes: ["action-ledger:read"],
  tier: "sensitive",
  riskPolicy: READ_ONLY_RISK,
  async handler(input, ctx: ActionLedgerToolContext) {
    return service(ctx).listDelegations(input)
  },
})

export const getActionDelegationTool = defineTool({
  name: "get_action_delegation",
  description: "Read one staff-only delegation provenance record.",
  inputSchema: getByIdInputSchema,
  outputSchema: actionDelegationDtoSchema,
  requiredScopes: ["action-ledger:read"],
  tier: "sensitive",
  riskPolicy: READ_ONLY_RISK,
  async handler({ id }, ctx: ActionLedgerToolContext) {
    const result = await service(ctx).getDelegation(id)
    if (!result)
      throw new ToolError(`Action delegation "${id}" was not found.`, "NOT_FOUND", { id })
    return result
  },
})

export const requestActionApprovalTool = defineTool({
  name: "request_action_approval",
  description:
    "Request approval only when the original domain Tool explicitly directs you here. Call the domain Tool first: handler-owned Tools issue their own approval bound to the exact command, and an independently requested approval cannot authorize them. For generic approval-required actions, identity, canonical capability, risk, target type, and policy are derived server-side; conditional and absent policies fail closed.",
  inputSchema: requestApprovalInputSchema,
  outputSchema: z.object({
    requestedAction: actionLedgerEntryDtoSchema,
    approval: actionApprovalDtoSchema,
    replayed: z.boolean(),
  }),
  requiredScopes: ["action-ledger:approve"],
  tier: "write",
  riskPolicy: {
    destructive: false,
    reversible: true,
    dryRunSupported: false,
    // voyant#3921: NOT confirmation-gated, deliberately.
    //
    // This is the entry point to the approval protocol: to perform an approved
    // write you must first request approval here. Gating the entry point created
    // a bootstrap trap — the agent called request_action_approval, was refused
    // with CONFIRMATION_REQUIRED, and looped, because nothing suggested that the
    // confirmation flag applied to the permission REQUEST as well as to the act
    // it was requesting. Measured over three runs against the real graph,
    // creating one priced unit this way succeeded 0/3.
    //
    // Confirmation exists so an agent cannot do something consequential by
    // accident. Creating a PENDING approval request is not consequential: it
    // writes a request nobody has acted on, it is reversible, it is declared
    // non-destructive right above, and the decision still has to be made by
    // approve_action_approval — which is destructive, stays confirmation-gated,
    // and is the gate that actually protects anything.
    confirmationRequired: false,
    sideEffects: ["data-write"],
  },
  actionPolicyEnforcement: "handler",
  async handler(input, ctx: ActionLedgerToolContext) {
    return service(ctx).requestApproval(input)
  },
})

const approvalDecisionRisk = {
  destructive: true,
  reversible: false,
  dryRunSupported: false,
  confirmationRequired: true,
  sideEffects: ["data-write"],
} as const
const approvalDecisionOutputSchema = z.object({
  approval: actionApprovalDtoSchema,
  decisionAction: actionLedgerEntryDtoSchema,
  nextSteps: z.array(z.string()),
})

export const approveActionApprovalTool = defineTool({
  name: "approve_action_approval",
  description:
    "Approve one pending request only when its capability and approval policy remain selected in the graph, it is unexpired, and the caller is the assigned staff principal when assigned. Approval does NOT execute the original action: after this succeeds, retry the original Tool with the exact same command and the approved id in its nested `_voyant` control.",
  inputSchema: decideApprovalInputSchema,
  outputSchema: approvalDecisionOutputSchema,
  requiredScopes: ["action-ledger:approve"],
  tier: "destructive",
  riskPolicy: approvalDecisionRisk,
  actionPolicyEnforcement: "handler",
  async handler({ approvalId }, ctx: ActionLedgerToolContext) {
    const result = await service(ctx).decideApproval({ approvalId, status: "approved" })
    return {
      ...result,
      // The approval decision is itself a successful Tool call, so error
      // remediation is no longer visible when the model receives this result.
      // A live GPT client approved correctly and then stopped, leaving the
      // original invoice action awaiting execution. Keep the continuation on
      // the success payload, where the client can act on it.
      nextSteps: [
        `Approval "${approvalId}" is now approved, but the original action has NOT executed. Re-call the original Tool with the exact same command and the nested control object "_voyant": {"confirmed": true, "approvalId": "${approvalId}"}.`,
      ],
    }
  },
})

export const denyActionApprovalTool = defineTool({
  name: "deny_action_approval",
  description:
    "Deny one pending request only when its capability and approval policy remain selected in the graph and the caller is the assigned staff principal when assigned.",
  inputSchema: decideApprovalInputSchema,
  outputSchema: approvalDecisionOutputSchema,
  requiredScopes: ["action-ledger:approve"],
  tier: "destructive",
  riskPolicy: approvalDecisionRisk,
  actionPolicyEnforcement: "handler",
  async handler({ approvalId }, ctx: ActionLedgerToolContext) {
    const result = await service(ctx).decideApproval({ approvalId, status: "denied" })
    return {
      ...result,
      nextSteps: [
        `Approval "${approvalId}" was denied. Do not retry the original action with this approval id.`,
      ],
    }
  },
})

export const actionLedgerTools = [
  listActionLedgerEntriesTool,
  getActionLedgerEntryTool,
  getActionTargetTimelineTool,
  listActionApprovalsTool,
  getActionApprovalTool,
  listActionDelegationsTool,
  getActionDelegationTool,
  requestActionApprovalTool,
  approveActionApprovalTool,
  denyActionApprovalTool,
] as const
