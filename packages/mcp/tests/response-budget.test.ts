/**
 * Response budget, `response_format`, and guided truncation (voyant#3928).
 *
 * Unit coverage for {@link shapeResponse} / {@link isListShapedOutput} plus an
 * end-to-end pass through the real transport, and a measured concise-vs-detailed
 * token delta on a booking-shaped list — the heaviest read tool in the tree.
 */
import {
  createToolRegistry,
  defineTool,
  READ_ONLY_RISK,
  type ToolContext,
} from "@voyant-travel/tools"
import { listResponseSchema, paginationSchema } from "@voyant-travel/types"
import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { createMcpApiRoutes } from "../src/index.js"
import {
  isListShapedOutput,
  RESPONSE_TRUNCATION_META_KEY,
  shapeResponse,
} from "../src/response-budget.js"

const MCP_HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
}

function rpc(method: string, params: unknown, id: number | string = 1) {
  return {
    method: "POST",
    headers: MCP_HEADERS,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  }
}

async function readRpc(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    const line = text.split("\n").find((l) => l.startsWith("data:"))
    return JSON.parse(line?.slice("data:".length).trim() ?? "{}")
  }
  return JSON.parse(text)
}

/** A booking-shaped list row: many flat fields, several null, a couple nested. */
function bookingRow(index: number): Record<string, unknown> {
  return {
    id: `book_${index.toString().padStart(6, "0")}`,
    bookingNumber: `B-${1000 + index}`,
    status: index % 2 === 0 ? "confirmed" : "hold",
    personId: `per_${index}`,
    organizationId: null,
    sourceType: "direct",
    externalBookingRef: null,
    communicationLanguage: "en-GB",
    contactFirstName: null,
    contactLastName: null,
    contactEmail: null,
    contactPhone: null,
    contactCountry: "GB",
    sellCurrency: "GBP",
    baseCurrency: null,
    sellAmountCents: 125_000 + index,
    costAmountCents: 90_000 + index,
    marginPercent: 28,
    startDate: "2026-09-14",
    endDate: "2026-09-21",
    pax: 2,
    internalNotes: null,
    notificationsSuppressed: false,
    priceOverride: null,
    customFields: { "voyant.loyalty": { tier: "gold", points: 4200 } },
    holdExpiresAt: null,
    confirmedAt: index % 2 === 0 ? "2026-07-01T10:00:00.000Z" : null,
    createdAt: "2026-06-30T09:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z",
  }
}

const bookingRowSchema = z.looseObject({
  id: z.string(),
  bookingNumber: z.string(),
  status: z.string(),
})

const listThingsTool = defineTool({
  name: "list_things",
  description: "List booking-shaped things with filters and pagination. Read-only.",
  inputSchema: paginationSchema.extend({
    status: z.string().optional().describe("Filter by status."),
    dateFrom: z.string().optional().describe("Only things on or after this date."),
    count: z.coerce.number().int().min(0).max(500).default(0),
  }),
  outputSchema: listResponseSchema(bookingRowSchema),
  requiredScopes: ["catalog:read"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  annotations: { readOnlyHint: true },
  async handler(query) {
    const rows = Array.from({ length: query.count }, (_, i) => bookingRow(i))
    return { data: rows, total: rows.length, limit: query.limit, offset: query.offset }
  },
})

const accessCatalog = {
  resources: [
    {
      id: "catalog",
      unitId: "@voyant-travel/catalog",
      resource: "catalog",
      label: "Catalog",
      description: "Catalog",
      wildcard: "allow" as const,
      actions: [{ action: "read", label: "Read", description: "Read" }],
    },
  ],
  presets: [],
}

function buildContext(): ToolContext {
  return {
    db: {},
    actor: "staff",
    audience: "staff",
    tenantId: "t1",
    resolverScope: { locale: "en-GB", audience: "staff", market: "default", actor: "staff" },
  }
}

function mountListThings(responseBudgetBytes?: number): Hono {
  const registry = createToolRegistry()
  registry.register(listThingsTool)
  const mcp = createMcpApiRoutes({
    accessCatalog,
    registry,
    buildContext,
    eagerToolNames: ["list_things"],
    ...(responseBudgetBytes !== undefined ? { responseBudgetBytes } : {}),
  })
  const outer = new Hono()
  outer.use("*", async (c, next) => {
    c.set("scopes", ["catalog:read"])
    await next()
  })
  outer.route("/", mcp)
  return outer
}

interface CallToolResult {
  isError?: boolean
  content?: Array<{ type: string; text: string }>
  structuredContent?: { data?: unknown[]; total?: number }
  _meta?: Record<string, unknown>
}

async function callListThings(app: Hono, args: Record<string, unknown>): Promise<CallToolResult> {
  const res = await readRpc(
    await app.request("/", rpc("tools/call", { name: "list_things", arguments: args })),
  )
  return (res.result ?? {}) as CallToolResult
}

describe("isListShapedOutput", () => {
  it("recognizes the ListResponse envelope and rejects a plain object", () => {
    expect(isListShapedOutput(listResponseSchema(bookingRowSchema))).toBe(true)
    expect(isListShapedOutput(z.object({ id: z.string(), name: z.string() }))).toBe(false)
    expect(isListShapedOutput(z.array(bookingRowSchema))).toBe(false)
  })
})

describe("shapeResponse", () => {
  const toWire = (data: unknown) => data as Record<string, unknown>

  it("leaves a within-budget list untouched", () => {
    const data = { data: [bookingRow(0)], total: 1, limit: 50, offset: 0 }
    const shaped = shapeResponse(data, {
      format: "detailed",
      budgetBytes: 1_000_000,
      filterFields: ["status", "dateFrom"],
      toWire,
    })
    expect(shaped.meta).toBeUndefined()
    expect((shaped.structuredContent as { data: unknown[] }).data).toHaveLength(1)
  })

  it("row-truncates over budget, stays a success, and names real filters", () => {
    const rows = Array.from({ length: 200 }, (_, i) => bookingRow(i))
    const data = { data: rows, total: 200, limit: 200, offset: 0 }
    const shaped = shapeResponse(data, {
      format: "concise",
      budgetBytes: 4_000,
      filterFields: ["status", "dateFrom"],
      toWire,
    })
    const returned = (shaped.structuredContent as { data: unknown[] }).data
    expect(returned.length).toBeGreaterThan(0)
    expect(returned.length).toBeLessThan(200)
    // Whole rows only — each returned row is the full record, so it still
    // validates against the untouched output schema.
    expect(returned[0]).toMatchObject({ id: "book_000000", createdAt: expect.any(String) })
    const text = shaped.text
    expect(text).toContain("truncated")
    expect(text).toContain("`status`")
    expect(text).toContain(`of 200`)
    const truncation = shaped.meta?.[RESPONSE_TRUNCATION_META_KEY] as {
      returned: number
      total: number
      withheld: number
    }
    expect(truncation.total).toBe(200)
    expect(truncation.returned + truncation.withheld).toBe(200)
    // The whole serialized envelope respects the budget.
    const bytes = new TextEncoder().encode(JSON.stringify(shaped.structuredContent) + text).length
    expect(bytes).toBeLessThanOrEqual(4_000)
  })

  it("concise omits null and nested fields from the text; detailed keeps them", () => {
    const data = { data: [bookingRow(0)], total: 1, limit: 50, offset: 0 }
    const concise = shapeResponse(data, {
      format: "concise",
      budgetBytes: 1_000_000,
      filterFields: [],
      toWire,
    }).text
    const detailed = shapeResponse(data, {
      format: "detailed",
      budgetBytes: 1_000_000,
      filterFields: [],
      toWire,
    }).text
    expect(concise).not.toContain("organizationId") // null → dropped
    expect(concise).not.toContain("customFields") // nested → dropped
    expect(concise).toContain("bookingNumber")
    expect(detailed).toContain("organizationId")
    expect(detailed).toContain("customFields")
    // structuredContent is unaffected by format — full fields survive for clients.
    const full = shapeResponse(data, {
      format: "concise",
      budgetBytes: 1_000_000,
      filterFields: [],
      toWire,
    }).structuredContent as { data: Array<Record<string, unknown>> }
    expect(full.data[0]).toHaveProperty("organizationId")
    expect(full.data[0]).toHaveProperty("customFields")
  })

  it("passes a non-list value straight through", () => {
    const shaped = shapeResponse(
      { id: "x", name: "y" },
      { format: undefined, budgetBytes: 10, filterFields: [], toWire },
    )
    expect(shaped.meta).toBeUndefined()
    expect(shaped.structuredContent).toEqual({ id: "x", name: "y" })
  })
})

describe("list tool over the transport", () => {
  it("advertises response_format on the list tool's input schema", async () => {
    const app = mountListThings()
    const res = await readRpc(
      await app.request(
        "/",
        rpc("tools/call", { name: "describe_tool", arguments: { name: "list_things" } }),
      ),
    )
    const descriptor = (res.result as { structuredContent?: { inputSchema?: unknown } })
      ?.structuredContent
    expect(JSON.stringify(descriptor?.inputSchema)).toContain("response_format")
  })

  it("defaults to concise and truncates a large result with guidance, not an error", async () => {
    const app = mountListThings(6_000)
    const result = await callListThings(app, { count: 200, limit: 200 })
    expect(result.isError).not.toBe(true)
    const returned = result.structuredContent?.data ?? []
    expect(returned.length).toBeGreaterThan(0)
    expect(returned.length).toBeLessThan(200)
    const text = result.content?.[0]?.text ?? ""
    expect(text).toContain("truncated")
    expect(text).toContain("`status`")
    // Default (no response_format arg) is concise: null/nested fields absent from text.
    expect(text).not.toContain("customFields")
    expect(result._meta?.[RESPONSE_TRUNCATION_META_KEY]).toBeDefined()
  })

  it("honors response_format:detailed", async () => {
    const app = mountListThings(1_000_000)
    const detailed = await callListThings(app, {
      count: 3,
      limit: 50,
      response_format: "detailed",
    })
    expect(detailed.content?.[0]?.text ?? "").toContain("customFields")
    const concise = await callListThings(app, { count: 3, limit: 50 })
    expect(concise.content?.[0]?.text ?? "").not.toContain("customFields")
  })

  it("reports the concise-vs-detailed token delta on a booking-shaped list", async () => {
    const app = mountListThings(1_000_000)
    const rowsWanted = 30
    const detailed = await callListThings(app, {
      count: rowsWanted,
      limit: 50,
      response_format: "detailed",
    })
    const concise = await callListThings(app, {
      count: rowsWanted,
      limit: 50,
      response_format: "concise",
    })
    const detailedText = detailed.content?.[0]?.text ?? ""
    const conciseText = concise.content?.[0]?.text ?? ""
    const toTokens = (t: string) => Math.round(new TextEncoder().encode(t).length / 4)
    const detailedTokens = toTokens(detailedText)
    const conciseTokens = toTokens(conciseText)
    const perRow = (n: number) => Math.round(n / rowsWanted)
    // biome-ignore lint/suspicious/noConsole: intentional — this test's purpose is to
    // report the measured concise-vs-detailed delta, so the number lands in CI output
    // rather than only in an assertion nobody reads.
    console.log(
      `[voyant#3928] list_things content tokens over ${rowsWanted} booking-shaped rows — ` +
        `detailed ${detailedTokens} (${perRow(detailedTokens)}/row), ` +
        `concise ${conciseTokens} (${perRow(conciseTokens)}/row), ` +
        `delta ${detailedTokens - conciseTokens} tokens ` +
        `(${Math.round((1 - conciseTokens / detailedTokens) * 100)}% smaller).`,
    )
    expect(conciseTokens).toBeLessThan(detailedTokens)
  })
})
