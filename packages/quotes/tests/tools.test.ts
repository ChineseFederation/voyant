import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"

import {
  type QuoteDeliveryToolServices,
  type QuotesToolServices,
  quotesTools,
} from "../src/tools.js"

function ctx(
  services?: Partial<QuotesToolServices>,
  actor: ToolContext["actor"] = "staff",
  delivery?: QuoteDeliveryToolServices,
): ToolContext & { quotes?: QuotesToolServices; quoteDelivery?: QuoteDeliveryToolServices } {
  return {
    db: {},
    actor,
    audience: actor,
    tenantId: "default",
    resolverScope: { locale: "en-GB", audience: actor, market: "default", actor },
    quotes: services as QuotesToolServices | undefined,
    quoteDelivery: delivery,
  }
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
    const registry = createToolRegistry()
    registry.registerAll(quotesTools)
    const list = registry.list()
    expect(list.map((tool) => tool.name).sort()).toEqual([
      "accept_quote_version",
      "decline_quote_version",
      "get_quote",
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
      expect(tool.capabilityVersion).toBe("v1")
      expect(tool.audience).toEqual({ source: "grant", allowed: ["staff"] })
      expect(tool.outputSchema).not.toHaveProperty("x-voyant-schema-quality")
    }
    for (const name of [
      "snapshot_quote_version",
      "send_quote_version",
      "accept_quote_version",
      "decline_quote_version",
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
    expect(list.find((tool) => tool.name === "snapshot_quote_version")?.aliases).toEqual([
      "quote_version_snapshot",
    ])
    expect(list.find((tool) => tool.name === "send_quote_version")?.aliases).toEqual([
      "quote_version_send",
    ])
    expect(list.find((tool) => tool.name === "accept_quote_version")?.aliases).toEqual([
      "quote_version_accept",
    ])
    expect(list.find((tool) => tool.name === "decline_quote_version")?.aliases).toEqual([
      "quote_version_decline",
    ])
  })

  it("composes a snapshot and vetted-template delivery through one exact-idempotent service", async () => {
    const registry = createToolRegistry()
    registry.registerAll(quotesTools)
    const delivery: QuoteDeliveryToolServices = {
      async snapshotAndSendQuote(input) {
        expect(input).toMatchObject({
          quoteId: quote.id,
          templateSlug: "quote-proposal",
          idempotencyKey: "quote-send-1",
        })
        return {
          quoteVersion: { ...version, status: "sent", sentAt: timestamp },
          proposalUrl: `/proposal/${version.id}`,
          delivery: {
            id: "ndel_1",
            status: "sent",
            channel: "email",
            provider: "local",
            providerMessageId: "message_1",
            toAddress: "traveler@example.test",
          },
          reused: false,
        }
      },
    }

    const result = await registry.dispatch<Record<string, unknown>>(
      "snapshot_and_send_quote",
      {
        quoteId: quote.id,
        to: "traveler@example.test",
        templateSlug: "quote-proposal",
        idempotencyKey: "quote-send-1",
      },
      ctx(undefined, "staff", delivery),
    )

    expect(result).toMatchObject({
      proposalUrl: `/proposal/${version.id}`,
      delivery: { id: "ndel_1", status: "sent" },
      reused: false,
    })
  })

  it("dispatches the full lifecycle through domain services and serializes dates", async () => {
    const calls: string[] = []
    const registry = createToolRegistry()
    registry.registerAll(quotesTools)
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

    const snapshot = await registry.dispatch<Record<string, unknown>>(
      "quote_version_snapshot",
      { quoteId: quote.id },
      ctx(services),
    )
    const sent = await registry.dispatch<Record<string, unknown>>(
      "quote_version_send",
      { quoteVersionId: version.id, validUntil: "2026-09-01" },
      ctx(services),
    )
    const accepted = await registry.dispatch<{ quoteVersion: Record<string, unknown> }>(
      "quote_version_accept",
      { quoteVersionId: version.id },
      ctx(services),
    )
    const declined = await registry.dispatch<Record<string, unknown>>(
      "quote_version_decline",
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

  it("fails closed for non-staff grants and missing services", async () => {
    const registry = createToolRegistry()
    registry.registerAll(quotesTools)
    await expect(registry.dispatch("list_quotes", {}, ctx(undefined))).rejects.toMatchObject({
      code: "MISSING_SERVICE",
    })
    await expect(
      registry.dispatch("get_quote", { id: quote.id }, ctx(undefined, "customer")),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" })
  })
})
