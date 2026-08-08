import {
  admitHandlerActionPolicy,
  defineTool,
  type HandlerActionPolicyExpectation,
  READ_ONLY_RISK,
  requireService,
  type ToolContext,
  ToolError,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { listResponseSchema } from "@voyant-travel/types"
import { z } from "zod"
import {
  PROPOSALS_CREATED_TARGET_POLICIES,
  proposalsHandlerActionPolicyExpectation,
} from "./created-target-policy.js"
import {
  acceptProposalVersionResultSchema,
  pipelineSchema,
  proposalProductSchema,
  proposalSchema,
  proposalVersionSchema,
  stageSchema,
} from "./routes/openapi-schemas.js"
import { snapshotAndSendProposalInputSchema } from "./service/proposal-delivery.js"
import {
  insertProposalProductSchema,
  insertProposalSchema,
  pipelineListQuerySchema,
  proposalListQuerySchema,
  sendProposalVersionSchema,
  stageListQuerySchema,
} from "./validation.js"

const OWNER = "@voyant-travel/proposals"
const VERSION = "v1"
const DURABLE_PROPOSAL_DELIVERY_VERSION = "v2"
const STAFF_AUDIENCE = { source: "grant", allowed: ["staff"] } as const
const READ_SCOPES = ["proposals:read"] as const
const WRITE_SCOPES = ["proposals:write"] as const
const proposalVersionIdSchema = z.string().min(1).describe("The proposal version id.")
const proposalIdSchema = z.string().min(1).describe("The proposal id.")
const proposalListOutputSchema = listResponseSchema(proposalSchema)

export interface ProposalsToolServices {
  listProposals(query: z.infer<typeof proposalListQuerySchema>): Promise<unknown>
  getProposalById(id: string): Promise<unknown>
  listPipelines(query: z.infer<typeof pipelineListQuerySchema>): Promise<unknown>
  listStages(query: z.infer<typeof stageListQuerySchema>): Promise<unknown>
  createProposal(
    input: z.infer<typeof createProposalToolInputSchema>,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
  addProposalProduct(
    proposalId: string,
    input: z.infer<typeof insertProposalProductSchema>,
  ): Promise<unknown>
  snapshotProposalVersion(proposalId: string): Promise<unknown>
  sendProposalVersion(
    proposalVersionId: string,
    input: z.infer<typeof sendProposalVersionSchema>,
  ): Promise<unknown>
  acceptProposalVersion(
    proposalVersionId: string,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
  declineProposalVersion(proposalVersionId: string): Promise<unknown>
}

export interface ProposalDeliveryToolServices {
  snapshotAndSendProposal(
    input: z.infer<typeof snapshotAndSendProposalInputSchema>,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
}

export interface ProposalAcceptanceToolServices {
  acceptProposalForBooking(
    proposalVersionId: string,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
}

export type ProposalsToolContext = ToolContext & {
  proposals?: ProposalsToolServices
  proposalDelivery?: ProposalDeliveryToolServices
  proposalAcceptance?: ProposalAcceptanceToolServices
}

function proposalAcceptance(ctx: ProposalsToolContext): ProposalAcceptanceToolServices {
  if (ctx.actor !== "staff" || ctx.audience !== "staff") {
    throw new ToolError("Proposal acceptance Tools require a staff grant.", "AUTHORIZATION_DENIED")
  }
  return requireService(ctx.proposalAcceptance, "proposalAcceptance")
}

function proposals(ctx: ProposalsToolContext): ProposalsToolServices {
  if (ctx.actor !== "staff" || ctx.audience !== "staff") {
    throw new ToolError("Proposal lifecycle Tools require a staff grant.", "AUTHORIZATION_DENIED")
  }
  return requireService(ctx.proposals, "proposals")
}

function proposalDelivery(ctx: ProposalsToolContext): ProposalDeliveryToolServices {
  if (ctx.actor !== "staff" || ctx.audience !== "staff") {
    throw new ToolError("Proposal delivery Tools require a staff grant.", "AUTHORIZATION_DENIED")
  }
  return requireService(ctx.proposalDelivery, "proposalDelivery")
}

const readMetadata = {
  owner: OWNER,
  capabilityVersion: VERSION,
  requiredScopes: READ_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "read" as const,
  riskPolicy: READ_ONLY_RISK,
  annotations: { readOnlyHint: true, idempotentHint: true },
}

const proposalWriteRisk = {
  destructive: false,
  reversible: false,
  dryRunSupported: false,
  confirmationRequired: true,
  sideEffects: ["data-write"] as const,
}

const proposalProposalDeliverySchema = z.object({
  id: z.string(),
  status: z.enum(["pending", "sent", "failed", "cancelled"]),
  channel: z.enum(["email", "sms"]),
  provider: z.string(),
  providerMessageId: z.string().nullable(),
  toAddress: z.string(),
})

export const snapshotAndSendProposalOutputSchema = z.object({
  proposalVersion: proposalVersionSchema,
  proposalUrl: z.string().min(1),
  delivery: proposalProposalDeliverySchema,
})

export const SNAPSHOT_AND_SEND_PROPOSAL_HANDLER_POLICY = {
  capabilityId: `${OWNER}#presentation-extension.tool.snapshot-and-send-proposal`,
  capabilityVersion: DURABLE_PROPOSAL_DELIVERY_VERSION,
  canonicalName: "snapshot_and_send_proposal",
  actionPolicy: {
    id: `${OWNER}#presentation-extension.action.snapshot-and-send-proposal`,
    capabilityId: `${OWNER}#presentation-extension.action.snapshot-and-send-proposal`,
    version: DURABLE_PROPOSAL_DELIVERY_VERSION,
    kind: "execute",
    targetType: "proposal",
    commandTargetField: "proposalId",
    targetLifecycle: "existing",
    existingTarget: { durability: "handler-command-result-v1" },
    risk: "high",
    ledger: "required",
    approval: "required",
    reversible: false,
  },
} as const satisfies HandlerActionPolicyExpectation

export const ACCEPT_PROPOSAL_VERSION_HANDLER_POLICY = {
  capabilityId: `${OWNER}#tool.accept-proposal-version`,
  capabilityVersion: VERSION,
  canonicalName: "accept_proposal_version",
  actionPolicy: {
    id: `${OWNER}#action.accept-proposal-version`,
    capabilityId: `${OWNER}#action.accept-proposal-version`,
    version: VERSION,
    kind: "execute",
    targetType: "proposal-version",
    commandTargetField: "proposalVersionId",
    targetLifecycle: "existing",
    existingTarget: { durability: "handler-command-result-v1" },
    risk: "high",
    ledger: "required",
    approval: "required",
    reversible: false,
  },
} as const satisfies HandlerActionPolicyExpectation

export const ACCEPT_PROPOSAL_FOR_BOOKING_HANDLER_POLICY = {
  capabilityId: `${OWNER}#presentation-extension.tool.accept-proposal-for-booking`,
  capabilityVersion: VERSION,
  canonicalName: "accept_proposal_for_booking",
  actionPolicy: {
    id: `${OWNER}#presentation-extension.action.accept-proposal-for-booking`,
    capabilityId: `${OWNER}#presentation-extension.action.accept-proposal-for-booking`,
    version: VERSION,
    kind: "execute",
    targetType: "proposal-version",
    commandTargetField: "proposalVersionId",
    targetLifecycle: "existing",
    existingTarget: { durability: "handler-command-result-v1" },
    risk: "high",
    ledger: "required",
    approval: "required",
    reversible: false,
  },
} as const satisfies HandlerActionPolicyExpectation

export const listProposalsTool = defineTool({
  ...readMetadata,
  capabilityId: `${OWNER}#tool.list-proposals`,
  name: "list_proposals",
  description: "List proposals with bounded filters and pagination. Staff-only and read-only.",
  inputSchema: proposalListQuerySchema,
  outputSchema: proposalListOutputSchema,
  async handler(query, ctx: ProposalsToolContext) {
    return parseJsonResult(proposalListOutputSchema, await proposals(ctx).listProposals(query))
  },
})

export const getProposalTool = defineTool({
  ...readMetadata,
  capabilityId: `${OWNER}#tool.get-proposal`,
  name: "get_proposal",
  description: "Read one proposal by id. Returns null when not found. Staff-only and read-only.",
  inputSchema: z.object({ id: proposalIdSchema }),
  outputSchema: proposalSchema.nullable(),
  async handler({ id }, ctx: ProposalsToolContext) {
    return parseJsonResult(proposalSchema.nullable(), await proposals(ctx).getProposalById(id))
  },
})

export const listProposalPipelinesTool = defineTool({
  ...readMetadata,
  capabilityId: `${OWNER}#tool.list-proposal-pipelines`,
  name: "list_proposal_pipelines",
  description:
    "List the sales pipelines a proposal can be filed under. A proposal must belong to a pipeline " +
    "and one of its stages, so call this before creating one. Staff-only and read-only.",
  inputSchema: pipelineListQuerySchema,
  outputSchema: listResponseSchema(pipelineSchema),
  async handler(query, ctx: ProposalsToolContext) {
    return parseJsonResult(
      listResponseSchema(pipelineSchema),
      await proposals(ctx).listPipelines(query),
    )
  },
})

export const listProposalStagesTool = defineTool({
  ...readMetadata,
  capabilityId: `${OWNER}#tool.list-proposal-stages`,
  name: "list_proposal_stages",
  description:
    "List the stages of a sales pipeline, so a new proposal can be opened at the right one. " +
    "Staff-only and read-only.",
  inputSchema: stageListQuerySchema,
  outputSchema: listResponseSchema(stageSchema),
  async handler(query, ctx: ProposalsToolContext) {
    return parseJsonResult(listResponseSchema(stageSchema), await proposals(ctx).listStages(query))
  },
})

/**
 * A proposal opens in the `open` state, always.
 *
 * `insertProposalSchema` is the HTTP-facing shape and carries the whole lifecycle:
 * `status`, `acceptedVersionId`, `lostReason`. Passing it through would let a
 * caller create a proposal already marked `won` with an `acceptedVersionId`,
 * skipping `accept_proposal_version` and its checks that a version was actually
 * sent, that no other version is accepted, and that competing versions get
 * closed. Acceptance and closure are transitions, not creation inputs.
 */
export const createProposalToolInputSchema = insertProposalSchema
  .omit({ status: true, acceptedVersionId: true, lostReason: true })
  .strict()

export const createProposalTool = defineTool({
  owner: OWNER,
  capabilityId: `${OWNER}#tool.create-proposal`,
  capabilityVersion: VERSION,
  name: "create_proposal",
  description:
    "Open a new proposal for a customer in a pipeline stage. The proposal starts open — " +
    "winning or losing it happens through accept_proposal_version and decline_proposal_version. " +
    "Add what is being sold with add_proposal_product, then snapshot_proposal_version to freeze a " +
    "proposal and send_proposal_version to deliver it. An exact retry returns the original proposal.",
  inputSchema: createProposalToolInputSchema,
  outputSchema: proposalSchema,
  requiredScopes: WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "write",
  riskPolicy: proposalWriteRisk,
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  async handler(input, ctx: ProposalsToolContext) {
    const admitted = admitHandlerActionPolicy(
      ctx,
      proposalsHandlerActionPolicyExpectation(PROPOSALS_CREATED_TARGET_POLICIES.proposal),
    )
    return parseJsonResult(proposalSchema, await proposals(ctx).createProposal(input, admitted))
  },
})

export const addProposalProductTool = defineTool({
  owner: OWNER,
  capabilityId: `${OWNER}#tool.add-proposal-product`,
  capabilityVersion: VERSION,
  name: "add_proposal_product",
  description:
    "Add a priced line to a proposal — a catalog product or a free-text item. `nameSnapshot` is " +
    "what the customer reads on the proposal, so it is captured on the line rather than looked " +
    "up later. Lines are only frozen into a proposal by snapshot_proposal_version.",
  inputSchema: insertProposalProductSchema.extend({ proposalId: proposalIdSchema }),
  outputSchema: proposalProductSchema,
  requiredScopes: WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "write",
  riskPolicy: proposalWriteRisk,
  async handler({ proposalId, ...line }, ctx: ProposalsToolContext) {
    return parseJsonResult(
      proposalProductSchema,
      await proposals(ctx).addProposalProduct(proposalId, line),
    )
  },
})

export const snapshotProposalVersionTool = defineTool({
  owner: OWNER,
  capabilityId: `${OWNER}#tool.snapshot-proposal-version`,
  capabilityVersion: VERSION,
  name: "snapshot_proposal_version",
  description:
    "Freeze a proposal's current line items into a new immutable draft proposal version. " +
    "The proposal service expires prior draft or sent versions atomically.",
  inputSchema: z.object({ proposalId: proposalIdSchema }),
  outputSchema: proposalVersionSchema.nullable(),
  requiredScopes: WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "write",
  riskPolicy: proposalWriteRisk,
  async handler({ proposalId }, ctx: ProposalsToolContext) {
    return parseJsonResult(
      proposalVersionSchema.nullable(),
      await proposals(ctx).snapshotProposalVersion(proposalId),
    )
  },
})

export const sendProposalVersionTool = defineTool({
  owner: OWNER,
  capabilityId: `${OWNER}#tool.send-proposal-version`,
  capabilityVersion: VERSION,
  name: "send_proposal_version",
  description:
    "Mark a draft proposal version as sent and immutable, with an optional validity date. " +
    "This records proposal lifecycle state; customer delivery remains notification-owned.",
  inputSchema: sendProposalVersionSchema.extend({ proposalVersionId: proposalVersionIdSchema }),
  outputSchema: proposalVersionSchema.nullable(),
  requiredScopes: WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "write",
  riskPolicy: proposalWriteRisk,
  async handler({ proposalVersionId, ...input }, ctx: ProposalsToolContext) {
    return parseJsonResult(
      proposalVersionSchema.nullable(),
      await proposals(ctx).sendProposalVersion(proposalVersionId, input),
    )
  },
})

export const snapshotAndSendProposalTool = defineTool({
  owner: `${OWNER}#presentation-extension`,
  capabilityId: `${OWNER}#presentation-extension.tool.snapshot-and-send-proposal`,
  capabilityVersion: DURABLE_PROPOSAL_DELIVERY_VERSION,
  name: "snapshot_and_send_proposal",
  description:
    "Atomically prepare a new proposal snapshot, enqueue its public link through a vetted " +
    "notification template, and mark that exact version sent. Exact retries use the admitted " +
    "action idempotency key and command.",
  inputSchema: snapshotAndSendProposalInputSchema,
  outputSchema: snapshotAndSendProposalOutputSchema,
  requiredScopes: ["proposals:write", "notifications:send"],
  audience: STAFF_AUDIENCE,
  tier: "destructive",
  riskPolicy: {
    destructive: true,
    reversible: false,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["data-write", "email", "sms"],
  },
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  async handler(input, ctx: ProposalsToolContext) {
    const admitted = admitHandlerActionPolicy(ctx, SNAPSHOT_AND_SEND_PROPOSAL_HANDLER_POLICY)
    return parseJsonResult(
      snapshotAndSendProposalOutputSchema,
      await proposalDelivery(ctx).snapshotAndSendProposal(input, admitted),
    )
  },
})

export const acceptProposalVersionTool = defineTool({
  owner: OWNER,
  capabilityId: `${OWNER}#tool.accept-proposal-version`,
  capabilityVersion: VERSION,
  name: "accept_proposal_version",
  description:
    "Record acceptance of a sent proposal. This wins the proposal, pins the accepted version, " +
    "and closes competing draft or sent versions atomically.",
  inputSchema: z.object({ proposalVersionId: proposalVersionIdSchema }),
  outputSchema: acceptProposalVersionResultSchema.nullable(),
  requiredScopes: WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "write",
  riskPolicy: proposalWriteRisk,
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  async handler({ proposalVersionId }, ctx: ProposalsToolContext) {
    const admitted = admitHandlerActionPolicy(ctx, ACCEPT_PROPOSAL_VERSION_HANDLER_POLICY)
    return parseJsonResult(
      acceptProposalVersionResultSchema.nullable(),
      await proposals(ctx).acceptProposalVersion(proposalVersionId, admitted),
    )
  },
})

export const acceptProposalForBookingOutputSchema = z.object({
  status: z.literal("accepted"),
  currency: z.string().min(1),
  totalAmountCents: z.number().int(),
  bookingSession: z.object({
    id: z.string().min(1),
    state: z.string().min(1),
    revision: z.number().int(),
    expiresAt: z.string().min(1),
  }),
})

export const acceptProposalForBookingTool = defineTool({
  owner: `${OWNER}#presentation-extension`,
  capabilityId: `${OWNER}#presentation-extension.tool.accept-proposal-for-booking`,
  capabilityVersion: VERSION,
  name: "accept_proposal_for_booking",
  description:
    "Accept a sent, snapshot-backed proposal and atomically prepare its Booking Session. " +
    "The server validates the frozen Trip snapshot and resolves the reservation handoff.",
  inputSchema: z.object({ proposalVersionId: proposalVersionIdSchema }),
  outputSchema: acceptProposalForBookingOutputSchema,
  requiredScopes: WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "destructive",
  riskPolicy: proposalWriteRisk,
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  async handler({ proposalVersionId }, ctx: ProposalsToolContext) {
    const admitted = admitHandlerActionPolicy(ctx, ACCEPT_PROPOSAL_FOR_BOOKING_HANDLER_POLICY)
    return acceptProposalForBookingOutputSchema.parse(
      await proposalAcceptance(ctx).acceptProposalForBooking(proposalVersionId, admitted),
    )
  },
})

export const declineProposalVersionTool = defineTool({
  owner: OWNER,
  capabilityId: `${OWNER}#tool.decline-proposal-version`,
  capabilityVersion: VERSION,
  name: "decline_proposal_version",
  description:
    "Record decline of a sent proposal version. The proposal remains open for a revised snapshot.",
  inputSchema: z.object({ proposalVersionId: proposalVersionIdSchema }),
  outputSchema: proposalVersionSchema.nullable(),
  requiredScopes: WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "write",
  riskPolicy: proposalWriteRisk,
  async handler({ proposalVersionId }, ctx: ProposalsToolContext) {
    return parseJsonResult(
      proposalVersionSchema.nullable(),
      await proposals(ctx).declineProposalVersion(proposalVersionId),
    )
  },
})

export const proposalsTools = [
  listProposalsTool,
  getProposalTool,
  listProposalPipelinesTool,
  listProposalStagesTool,
  createProposalTool,
  addProposalProductTool,
  snapshotProposalVersionTool,
  sendProposalVersionTool,
  snapshotAndSendProposalTool,
  acceptProposalVersionTool,
  acceptProposalForBookingTool,
  declineProposalVersionTool,
] as const

function parseJsonResult<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  return schema.parse(toJsonValue(value))
}

function toJsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(toJsonValue)
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nested]) => [key, toJsonValue(nested)] as const)
      .filter(([, nested]) => nested !== undefined),
  )
}
