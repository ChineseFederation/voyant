import assert from "node:assert/strict"
import {
  createToolRegistry,
  type ToolContext,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"

import {
  QUOTES_CREATED_TARGET_POLICIES,
  quotesHandlerActionPolicyExpectation,
} from "../src/created-target-policy.js"
import {
  createQuoteTool,
  type QuoteDeliveryToolServices,
  type QuotesToolServices,
  quotesTools,
  SNAPSHOT_AND_SEND_QUOTE_HANDLER_POLICY,
  snapshotAndSendQuoteTool,
} from "../src/tools.js"

function ctx(
  services?: Partial<QuotesToolServices>,
  actor: ToolContext["actor"] = "staff",
  delivery?: QuoteDeliveryToolServices,
  handlerActionPolicy: ToolHandlerActionPolicyContext = snapshotSendActionPolicy(),
): ToolContext & { quotes?: QuotesToolServices; quoteDelivery?: QuoteDeliveryToolServices } {
  return {
    db: {},
    actor,
    audience: actor,
    tenantId: "default",
    resolverScope: { locale: "en-GB", audience: actor, market: "default", actor },
    handlerActionPolicy,
    quotes: services as QuotesToolServices | undefined,
    quoteDelivery: delivery,
  }
}

/** The admitted context the create handler must have produced. */
function assertAdmitted(admitted: ToolHandlerActionPolicyContext) {
  assert.equal(admitted.canonicalName, "create_quote")
  assert.equal(admitted.actionPolicy.targetLifecycle, "created")
  assert.equal(admitted.actionPolicy.createdTarget?.durability, "handler-command-claim-v1")
}

/** Admitted policy for the created-target quote command. */
function createQuoteActionPolicy(key = "quote-create-1"): ToolHandlerActionPolicyContext {
  const expectation = quotesHandlerActionPolicyExpectation(QUOTES_CREATED_TARGET_POLICIES.quote)
  return {
    capabilityId: expectation.capabilityId,
    capabilityVersion: expectation.capabilityVersion,
    canonicalName: expectation.canonicalName,
    actionPolicy: {
      ...expectation.actionPolicy,
      enforcement: "handler",
      invocation: {
        controlField: "_voyant",
        requiredFields: ["idempotencyKey"],
        optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"],
        fingerprintAlgorithm: "action-ledger-command-v1",
      },
    },
    invocation: { idempotencyKey: key },
  }
}

function snapshotSendActionPolicy(): ToolHandlerActionPolicyContext {
  return {
    capabilityId: SNAPSHOT_AND_SEND_QUOTE_HANDLER_POLICY.capabilityId,
    capabilityVersion: SNAPSHOT_AND_SEND_QUOTE_HANDLER_POLICY.capabilityVersion,
    canonicalName: SNAPSHOT_AND_SEND_QUOTE_HANDLER_POLICY.canonicalName,
    actionPolicy: {
      ...SNAPSHOT_AND_SEND_QUOTE_HANDLER_POLICY.actionPolicy,
      enforcement: "handler",
      invocation: {
        controlField: "_voyant",
        requiredFields: ["idempotencyKey", "approvalId", "idempotencyFingerprint"],
        optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"],
        fingerprintAlgorithm: "action-ledger-command-v1",
      },
    },
    invocation: {
      idempotencyKey: "quote-send-1",
      approvalId: "approval_1",
      idempotencyFingerprint: "sha256:test",
    },
  }
}

function registry() {
  const registry = createToolRegistry()
  for (const tool of quotesTools) {
    if (tool === snapshotAndSendQuoteTool) {
      registry.register(tool, {
        actionPolicy: SNAPSHOT_AND_SEND_QUOTE_HANDLER_POLICY.actionPolicy,
      })
    } else if (tool === createQuoteTool) {
      registry.register(tool, {
        actionPolicy: quotesHandlerActionPolicyExpectation(QUOTES_CREATED_TARGET_POLICIES.quote)
          .actionPolicy,
      })
    } else {
      registry.register(tool)
    }
  }
  return registry
}

const timestamp = new Date("2026-07-15T08:00:00.000Z")
const quote = {
  id: "quot_1",
  title: "Danube proposal",
  personId: null,
  organizationId: null,
  pipelineId: "pipe_1",
  stageId: "stge_1",
  ownerId: null,
  status: "open",
  acceptedVersionId: null,
  valueAmountCents: 120_000,
  valueCurrency: "EUR",
  paxCount: 2,
  expectedCloseDate: null,
  source: null,
  sourceRef: null,
  lostReason: null,
  tags: [],
  customFields: {},
  description: null,
  createdBy: null,
  updatedBy: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  stageChangedAt: timestamp,
  closedAt: null,
}
const version = {
  id: "qver_1",
  quoteId: quote.id,
  label: null,
  status: "draft",
  supersedesId: null,
  tripSnapshotId: null,
  validUntil: null,
  currency: "EUR",
  subtotalAmountCents: 120_000,
  taxAmountCents: 0,
  totalAmountCents: 120_000,
  notes: null,
  sentAt: null,
  viewedAt: null,
  decidedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  archivedAt: null,
}

describe("quotes Tools", () => {
  it("registers structural reads and the complete guarded proposal lifecycle", () => {
    const list = registry().list()
    expect(list.map((tool) => tool.name).sort()).toEqual([
      "accept_quote_version",
      "add_quote_product",
      "create_quote",
      "decline_quote_version",
      "get_quote",
      "list_quote_pipelines",
      "list_quote_stages",
      "list_quotes",
      "send_quote_version",
      "snapshot_and_send_quote",
      "snapshot_quote_version",
    ])
    for (const tool of list.filter(({ name }) => name !== "snapshot_and_send_quote")) {
      expect(tool.owner).toBe("@voyant-travel/quotes")
    }
    expect(list.find(({ name }) => name === "snapshot_and_send_quote")?.owner).toBe(
      "@voyant-travel/quotes#proposal-extension",
    )
    for (const tool of list) {
      expect(tool.capabilityVersion).toBe(tool.name === "snapshot_and_send_quote" ? "v2" : "v1")
      expect(tool.audience).toEqual({ source: "grant", allowed: ["staff"] })
      expect(tool.outputSchema).not.toHaveProperty("x-voyant-schema-quality")
    }
    for (const name of [
      "snapshot_quote_version",
      "send_quote_version",
      "accept_quote_version",
      "decline_quote_version",
      "create_quote",
      "add_quote_product",
    ]) {
      expect(list.find((tool) => tool.name === name)).toMatchObject({
        tier: "write",
        requiredScopes: ["quotes:write"],
        riskPolicy: {
          destructive: false,
          reversible: false,
          confirmationRequired: true,
          sideEffects: ["data-write"],
        },
      })
    }
  })

  it("composes a snapshot and vetted-template delivery through one exact-idempotent service", async () => {
    const toolRegistry = registry()
    const delivery: QuoteDeliveryToolServices = {
      async snapshotAndSendQuote(input, admitted) {
        expect(input).toMatchObject({
          quoteId: quote.id,
          templateSlug: "quote-proposal",
        })
        expect(admitted.invocation.idempotencyKey).toBe("quote-send-1")
        return {
          quoteVersion: { ...version, status: "sent", sentAt: timestamp },
          proposalUrl: `/proposal/${version.id}`,
          delivery: {
            id: "ndel_1",
            status: "pending",
            channel: "email",
            provider: "local",
            providerMessageId: "message_1",
            toAddress: "traveler@example.test",
          },
        }
      },
    }

    const result = await toolRegistry.dispatch<Record<string, unknown>>(
      "snapshot_and_send_quote",
      {
        quoteId: quote.id,
        to: "traveler@example.test",
        templateSlug: "quote-proposal",
      },
      ctx(undefined, "staff", delivery),
    )

    expect(result).toMatchObject({
      proposalUrl: `/proposal/${version.id}`,
      delivery: { id: "ndel_1", status: "pending" },
    })
  })

  it("dispatches the full lifecycle through domain services and serializes dates", async () => {
    const calls: string[] = []
    const toolRegistry = registry()
    const services: QuotesToolServices = {
      async listQuotes(query) {
        calls.push(`list:${query.limit}`)
        return { data: [quote], total: 1, limit: query.limit, offset: query.offset }
      },
      async getQuoteById(id) {
        calls.push(`get:${id}`)
        return quote
      },
      async snapshotQuoteVersion(quoteId) {
        calls.push(`snapshot:${quoteId}`)
        return version
      },
      async sendQuoteVersion(id, input) {
        calls.push(`send:${id}:${input.validUntil}`)
        return {
          ...version,
          status: "sent",
          validUntil: input.validUntil ?? null,
          sentAt: timestamp,
        }
      },
      async acceptQuoteVersion(id) {
        calls.push(`accept:${id}`)
        return {
          quote: { ...quote, status: "won", acceptedVersionId: id, closedAt: timestamp },
          quoteVersion: { ...version, id, status: "accepted", decidedAt: timestamp },
          closedQuoteVersions: [],
        }
      },
      async declineQuoteVersion(id) {
        calls.push(`decline:${id}`)
        return { ...version, id, status: "declined", decidedAt: timestamp }
      },
    }

    const snapshot = await toolRegistry.dispatch<Record<string, unknown>>(
      "snapshot_quote_version",
      { quoteId: quote.id },
      ctx(services),
    )
    const sent = await toolRegistry.dispatch<Record<string, unknown>>(
      "send_quote_version",
      { quoteVersionId: version.id, validUntil: "2026-09-01" },
      ctx(services),
    )
    const accepted = await toolRegistry.dispatch<{ quoteVersion: Record<string, unknown> }>(
      "accept_quote_version",
      { quoteVersionId: version.id },
      ctx(services),
    )
    const declined = await toolRegistry.dispatch<Record<string, unknown>>(
      "decline_quote_version",
      { quoteVersionId: version.id },
      ctx(services),
    )

    expect(snapshot.createdAt).toBe(timestamp.toISOString())
    expect(sent).toMatchObject({ status: "sent", validUntil: "2026-09-01" })
    expect(accepted.quoteVersion).toMatchObject({ status: "accepted" })
    expect(declined).toMatchObject({ status: "declined" })
    expect(calls).toEqual([
      `snapshot:${quote.id}`,
      `send:${version.id}:2026-09-01`,
      `accept:${version.id}`,
      `decline:${version.id}`,
    ])
  })

  it("authors a quote end to end: pipeline, stage, quote, priced line", async () => {
    // The lifecycle Tools could send and accept a quote that nothing could
    // build. This is the path an operator actually takes when a customer asks
    // for a price: find where quotes are filed, open one, put a line on it.
    const toolRegistry = registry()
    const services: Partial<QuotesToolServices> = {
      async listPipelines() {
        return {
          data: [
            {
              id: "pipe_1",
              entityType: "quote",
              name: "Sales",
              isDefault: true,
              sortOrder: 0,
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          ],
          total: 1,
          limit: 50,
          offset: 0,
        }
      },
      async listStages() {
        return {
          data: [
            {
              id: "stge_1",
              pipelineId: "pipe_1",
              name: "New enquiry",
              sortOrder: 0,
              probability: 10,
              isClosed: false,
              isWon: false,
              isLost: false,
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          ],
          total: 1,
          limit: 50,
          offset: 0,
        }
      },
      async createQuote(input, admitted) {
        // The handler must admit the created-target policy before the service
        // is reached, or a retry could open a second quote.
        assertAdmitted(admitted)
        return { ...quote, ...input, id: "quot_new", status: "open" }
      },
      async addQuoteProduct(quoteId, line) {
        return {
          id: "qprd_1",
          quoteId,
          productId: null,
          supplierServiceId: null,
          description: null,
          unitPriceAmountCents: null,
          costAmountCents: null,
          currency: null,
          discountAmountCents: null,
          createdAt: timestamp,
          updatedAt: timestamp,
          ...line,
        }
      },
    }

    const pipelines = (await toolRegistry.dispatch("list_quote_pipelines", {}, ctx(services))) as {
      data: { id: string; isDefault: boolean }[]
    }
    const pipelineId = pipelines.data.find((p) => p.isDefault)?.id
    expect(pipelineId).toBe("pipe_1")

    const stages = (await toolRegistry.dispatch(
      "list_quote_stages",
      { pipelineId },
      ctx(services),
    )) as { data: { id: string }[] }
    const stageId = stages.data[0]?.id

    const created = (await toolRegistry.dispatch(
      "create_quote",
      { title: "Coastal Day Cruise — Ana Ionescu", pipelineId, stageId, paxCount: 4 },
      ctx(services, "staff", undefined, createQuoteActionPolicy()),
    )) as { id: string; title: string; paxCount: number }
    expect(created).toMatchObject({ id: "quot_new", paxCount: 4 })

    const line = (await toolRegistry.dispatch(
      "add_quote_product",
      {
        quoteId: created.id,
        nameSnapshot: "Coastal Day Cruise",
        quantity: 4,
        unitPriceAmountCents: 40_000,
        currency: "EUR",
      },
      ctx(services),
    )) as { quoteId: string; nameSnapshot: string; quantity: number }
    // quoteId addresses the quote; it must not leak into the line payload as a
    // column, and the customer-facing name is captured on the line.
    expect(line).toMatchObject({
      quoteId: "quot_new",
      nameSnapshot: "Coastal Day Cruise",
      quantity: 4,
      unitPriceAmountCents: 40_000,
    })
    // Dates serialize, matching every other Tool in this package.
    expect(typeof (line as unknown as { createdAt: unknown }).createdAt).toBe("string")
  })

  it("fails closed for non-staff grants and missing services", async () => {
    const toolRegistry = registry()
    await expect(toolRegistry.dispatch("list_quotes", {}, ctx(undefined))).rejects.toMatchObject({
      code: "MISSING_SERVICE",
    })
    await expect(
      toolRegistry.dispatch("get_quote", { id: quote.id }, ctx(undefined, "customer")),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" })
    // Authoring is staff-only too, or a customer grant could open quotes.
    await expect(
      toolRegistry.dispatch(
        "create_quote",
        { title: "x", pipelineId: "pipe_1", stageId: "stge_1" },
        ctx(undefined, "customer", undefined, createQuoteActionPolicy()),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" })
    await expect(
      toolRegistry.dispatch(
        "add_quote_product",
        { quoteId: quote.id, nameSnapshot: "x" },
        ctx(undefined, "customer"),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" })
  })
})
