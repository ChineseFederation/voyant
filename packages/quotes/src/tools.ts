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
  acceptQuoteVersionResultSchema,
  quoteSchema,
  quoteVersionSchema,
} from "./routes/openapi-schemas.js"
import { snapshotAndSendQuoteInputSchema } from "./service/quote-delivery.js"
import { quoteListQuerySchema, sendQuoteVersionSchema } from "./validation.js"

const OWNER = "@voyant-travel/quotes"
const VERSION = "v1"
const DURABLE_QUOTE_DELIVERY_VERSION = "v2"
const STAFF_AUDIENCE = { source: "grant", allowed: ["staff"] } as const
const READ_SCOPES = ["quotes:read"] as const
const WRITE_SCOPES = ["quotes:write"] as const
const quoteVersionIdSchema = z.string().min(1).describe("The quote version id.")
const quoteIdSchema = z.string().min(1).describe("The quote id.")
const quoteListOutputSchema = listResponseSchema(quoteSchema)

export interface QuotesToolServices {
  listQuotes(query: z.infer<typeof quoteListQuerySchema>): Promise<unknown>
  getQuoteById(id: string): Promise<unknown>
  snapshotQuoteVersion(quoteId: string): Promise<unknown>
  sendQuoteVersion(
    quoteVersionId: string,
    input: z.infer<typeof sendQuoteVersionSchema>,
  ): Promise<unknown>
  acceptQuoteVersion(quoteVersionId: string): Promise<unknown>
  declineQuoteVersion(quoteVersionId: string): Promise<unknown>
}

export interface QuoteDeliveryToolServices {
  snapshotAndSendQuote(
    input: z.infer<typeof snapshotAndSendQuoteInputSchema>,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
}

export type QuotesToolContext = ToolContext & {
  quotes?: QuotesToolServices
  quoteDelivery?: QuoteDeliveryToolServices
}

function quotes(ctx: QuotesToolContext): QuotesToolServices {
  if (ctx.actor !== "staff" || ctx.audience !== "staff") {
    throw new ToolError("Quote lifecycle Tools require a staff grant.", "AUTHORIZATION_DENIED")
  }
  return requireService(ctx.quotes, "quotes")
}

function quoteDelivery(ctx: QuotesToolContext): QuoteDeliveryToolServices {
  if (ctx.actor !== "staff" || ctx.audience !== "staff") {
    throw new ToolError("Quote delivery Tools require a staff grant.", "AUTHORIZATION_DENIED")
  }
  return requireService(ctx.quoteDelivery, "quoteDelivery")
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

const quoteWriteRisk = {
  destructive: false,
  reversible: false,
  dryRunSupported: false,
  confirmationRequired: true,
  sideEffects: ["data-write"] as const,
}

const quoteProposalDeliverySchema = z.object({
  id: z.string(),
  status: z.enum(["pending", "sent", "failed", "cancelled"]),
  channel: z.enum(["email", "sms"]),
  provider: z.string(),
  providerMessageId: z.string().nullable(),
  toAddress: z.string(),
})

export const snapshotAndSendQuoteOutputSchema = z.object({
  quoteVersion: quoteVersionSchema,
  proposalUrl: z.string().min(1),
  delivery: quoteProposalDeliverySchema,
})

export const SNAPSHOT_AND_SEND_QUOTE_HANDLER_POLICY = {
  capabilityId: `${OWNER}#proposal-extension.tool.snapshot-and-send-quote`,
  capabilityVersion: DURABLE_QUOTE_DELIVERY_VERSION,
  canonicalName: "snapshot_and_send_quote",
  actionPolicy: {
    id: `${OWNER}#proposal-extension.action.snapshot-and-send-quote`,
    capabilityId: `${OWNER}#proposal-extension.action.snapshot-and-send-quote`,
    version: DURABLE_QUOTE_DELIVERY_VERSION,
    kind: "execute",
    targetType: "quote",
    commandTargetField: "quoteId",
    targetLifecycle: "existing",
    existingTarget: { durability: "handler-command-result-v1" },
    risk: "high",
    ledger: "required",
    approval: "required",
    reversible: false,
  },
} as const satisfies HandlerActionPolicyExpectation

export const listQuotesTool = defineTool({
  ...readMetadata,
  capabilityId: `${OWNER}#tool.list-quotes`,
  name: "list_quotes",
  description: "List quotes with bounded filters and pagination. Staff-only and read-only.",
  inputSchema: quoteListQuerySchema,
  outputSchema: quoteListOutputSchema,
  async handler(query, ctx: QuotesToolContext) {
    return parseJsonResult(quoteListOutputSchema, await quotes(ctx).listQuotes(query))
  },
})

export const getQuoteTool = defineTool({
  ...readMetadata,
  capabilityId: `${OWNER}#tool.get-quote`,
  name: "get_quote",
  description: "Read one quote by id. Returns null when not found. Staff-only and read-only.",
  inputSchema: z.object({ id: quoteIdSchema }),
  outputSchema: quoteSchema.nullable(),
  async handler({ id }, ctx: QuotesToolContext) {
    return parseJsonResult(quoteSchema.nullable(), await quotes(ctx).getQuoteById(id))
  },
})

export const snapshotQuoteVersionTool = defineTool({
  owner: OWNER,
  capabilityId: `${OWNER}#tool.snapshot-quote-version`,
  capabilityVersion: VERSION,
  name: "snapshot_quote_version",
  description:
    "Freeze a quote's current line items into a new immutable draft proposal version. " +
    "The quote service expires prior draft or sent versions atomically.",
  inputSchema: z.object({ quoteId: quoteIdSchema }),
  outputSchema: quoteVersionSchema.nullable(),
  requiredScopes: WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "write",
  riskPolicy: quoteWriteRisk,
  async handler({ quoteId }, ctx: QuotesToolContext) {
    return parseJsonResult(
      quoteVersionSchema.nullable(),
      await quotes(ctx).snapshotQuoteVersion(quoteId),
    )
  },
})

export const sendQuoteVersionTool = defineTool({
  owner: OWNER,
  capabilityId: `${OWNER}#tool.send-quote-version`,
  capabilityVersion: VERSION,
  name: "send_quote_version",
  description:
    "Mark a draft proposal version as sent and immutable, with an optional validity date. " +
    "This records proposal lifecycle state; customer delivery remains notification-owned.",
  inputSchema: sendQuoteVersionSchema.extend({ quoteVersionId: quoteVersionIdSchema }),
  outputSchema: quoteVersionSchema.nullable(),
  requiredScopes: WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "write",
  riskPolicy: quoteWriteRisk,
  async handler({ quoteVersionId, ...input }, ctx: QuotesToolContext) {
    return parseJsonResult(
      quoteVersionSchema.nullable(),
      await quotes(ctx).sendQuoteVersion(quoteVersionId, input),
    )
  },
})

export const snapshotAndSendQuoteTool = defineTool({
  owner: `${OWNER}#proposal-extension`,
  capabilityId: `${OWNER}#proposal-extension.tool.snapshot-and-send-quote`,
  capabilityVersion: DURABLE_QUOTE_DELIVERY_VERSION,
  name: "snapshot_and_send_quote",
  description:
    "Atomically prepare a new proposal snapshot, enqueue its public link through a vetted " +
    "notification template, and mark that exact version sent. Exact retries use the admitted " +
    "action idempotency key and command.",
  inputSchema: snapshotAndSendQuoteInputSchema,
  outputSchema: snapshotAndSendQuoteOutputSchema,
  requiredScopes: ["quotes:write", "notifications:send"],
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
  async handler(input, ctx: QuotesToolContext) {
    const admitted = admitHandlerActionPolicy(ctx, SNAPSHOT_AND_SEND_QUOTE_HANDLER_POLICY)
    return parseJsonResult(
      snapshotAndSendQuoteOutputSchema,
      await quoteDelivery(ctx).snapshotAndSendQuote(input, admitted),
    )
  },
})

export const acceptQuoteVersionTool = defineTool({
  owner: OWNER,
  capabilityId: `${OWNER}#tool.accept-quote-version`,
  capabilityVersion: VERSION,
  name: "accept_quote_version",
  description:
    "Record acceptance of a sent proposal. This wins the quote, pins the accepted version, " +
    "and closes competing draft or sent versions atomically.",
  inputSchema: z.object({ quoteVersionId: quoteVersionIdSchema }),
  outputSchema: acceptQuoteVersionResultSchema.nullable(),
  requiredScopes: WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "write",
  riskPolicy: quoteWriteRisk,
  async handler({ quoteVersionId }, ctx: QuotesToolContext) {
    return parseJsonResult(
      acceptQuoteVersionResultSchema.nullable(),
      await quotes(ctx).acceptQuoteVersion(quoteVersionId),
    )
  },
})

export const declineQuoteVersionTool = defineTool({
  owner: OWNER,
  capabilityId: `${OWNER}#tool.decline-quote-version`,
  capabilityVersion: VERSION,
  name: "decline_quote_version",
  description:
    "Record decline of a sent proposal version. The quote remains open for a revised snapshot.",
  inputSchema: z.object({ quoteVersionId: quoteVersionIdSchema }),
  outputSchema: quoteVersionSchema.nullable(),
  requiredScopes: WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "write",
  riskPolicy: quoteWriteRisk,
  async handler({ quoteVersionId }, ctx: QuotesToolContext) {
    return parseJsonResult(
      quoteVersionSchema.nullable(),
      await quotes(ctx).declineQuoteVersion(quoteVersionId),
    )
  },
})

export const quotesTools = [
  listQuotesTool,
  getQuoteTool,
  snapshotQuoteVersionTool,
  sendQuoteVersionTool,
  snapshotAndSendQuoteTool,
  acceptQuoteVersionTool,
  declineQuoteVersionTool,
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
