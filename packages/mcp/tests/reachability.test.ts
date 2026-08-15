/**
 * What a caller can actually reach, and what it is told when it cannot
 * (voyant#4656).
 *
 * The reported failure had two halves. An operator asked its agent for a
 * confirmed, paid booking and was told no booking-creation or payment-recording
 * action existed — while both were registered and authorized. The eager tier was
 * empty by design and the long tail lived behind three meta-tools the consumer
 * had discarded, so "reachable in principle" and "reachable" were not the same
 * thing. And when a name did not resolve, every reason produced one sentence:
 * "it does not exist or your grant does not authorize it", which is the wrong
 * answer for a tool that exists, is authorized, and simply moved.
 *
 * So two properties are pinned here:
 *
 * 1. The core operator writes are resident with no deployment configuration, and
 *    only for a caller authorized for them.
 * 2. A folded read answers with WHERE IT WENT, over every path a caller can
 *    reach it by, and is counted as `unreachable` rather than as a typo.
 */
import type { ErrorEvent, Reporter } from "@voyant-travel/hono/observability"
import {
  createToolRegistry,
  defineTool,
  READ_ONLY_RISK,
  type ToolContext,
} from "@voyant-travel/tools"
import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { createMcpApiRoutes, DEFAULT_EAGER_TOOL_NAMES } from "../src/index.js"
import { MCP_TELEMETRY_CONTEXT_KEY } from "../src/observability.js"

const accessCatalog = {
  resources: [
    {
      id: "bookings",
      unitId: "@voyant-travel/bookings",
      resource: "bookings",
      label: "Bookings",
      description: "Bookings",
      wildcard: "allow" as const,
      actions: [
        { action: "read", label: "Read", description: "Read bookings" },
        { action: "write", label: "Write", description: "Write bookings" },
      ],
    },
    {
      id: "finance",
      unitId: "@voyant-travel/finance",
      resource: "finance",
      label: "Finance",
      description: "Finance",
      wildcard: "allow" as const,
      actions: [
        { action: "read", label: "Read", description: "Read finance" },
        { action: "write", label: "Write", description: "Write finance" },
      ],
    },
  ],
  presets: [],
}

const bookProductTool = defineTool({
  capabilityId: "@voyant-travel/finance#tool.book-product",
  owner: "@voyant-travel/finance",
  capabilityVersion: "v1",
  name: "book_product",
  description: "Book a product for a client in one call.",
  inputSchema: z.object({ productId: z.string().min(1), personId: z.string().min(1) }),
  outputSchema: z.object({ bookingId: z.string() }),
  requiredScopes: ["bookings:write"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "write",
  riskPolicy: {
    destructive: false,
    reversible: false,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["data-write"],
  },
  handler() {
    return Promise.resolve({ bookingId: "bkg_1" })
  },
})

const recordPaymentTool = defineTool({
  capabilityId: "@voyant-travel/finance#tool.record-payment",
  owner: "@voyant-travel/finance",
  capabilityVersion: "v1",
  name: "record_payment",
  description: "Record a payment received against an invoice.",
  inputSchema: z.object({ invoiceId: z.string().min(1), amountCents: z.number().int() }),
  outputSchema: z.object({ id: z.string() }),
  requiredScopes: ["finance:write"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "write",
  riskPolicy: {
    destructive: false,
    reversible: true,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["data-write"],
  },
  handler() {
    return Promise.resolve({ id: "pay_1" })
  },
})

/** A read, so the projection folds it into `bookings_query` as resource `booking`. */
const getBookingTool = defineTool({
  capabilityId: "@voyant-travel/bookings#tool.get-booking",
  owner: "@voyant-travel/bookings",
  capabilityVersion: "v1",
  name: "get_booking",
  description: "Read one booking by id.",
  inputSchema: z.object({ id: z.string().min(1) }),
  outputSchema: z.object({ id: z.string() }),
  requiredScopes: ["bookings:read"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  handler({ id }) {
    return Promise.resolve({ id })
  },
})

const MCP_HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
}

function rpc(method: string, params: unknown) {
  return {
    method: "POST",
    headers: MCP_HEADERS,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }
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

interface Harness {
  app: Hono
  telemetry: () => Array<Record<string, unknown>>
}

function harness(
  options: { eagerToolNames?: readonly string[]; scopes?: readonly string[] } = {},
): Harness {
  const events: ErrorEvent[] = []
  const reporter: Reporter = {
    captureException(event) {
      events.push(event)
    },
  }
  const registry = createToolRegistry()
  registry.register(bookProductTool)
  registry.register(recordPaymentTool)
  registry.register(getBookingTool)
  const mcp = createMcpApiRoutes({
    accessCatalog,
    registry,
    buildContext,
    reporter,
    ...(options.eagerToolNames ? { eagerToolNames: options.eagerToolNames } : {}),
  })
  const app = new Hono()
  const scopes = options.scopes ?? ["bookings:read", "bookings:write", "finance:write"]
  app.use("*", async (c, next) => {
    c.set("scopes", [...scopes])
    await next()
  })
  app.route("/", mcp)
  return {
    app,
    telemetry: () =>
      events
        .map((e) => e.context?.[MCP_TELEMETRY_CONTEXT_KEY])
        .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null),
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

async function listToolNames(app: Hono): Promise<string[]> {
  const listed = await readRpc(await app.request("/", rpc("tools/list", {})))
  const tools = (listed.result as { tools?: Array<{ name: string }> } | undefined)?.tools ?? []
  return tools.map(({ name }) => name).sort()
}

/** The `content` text of a `tools/call`, whether it succeeded or failed. */
async function callText(app: Hono, name: string, args: unknown): Promise<string> {
  const res = await readRpc(await app.request("/", rpc("tools/call", { name, arguments: args })))
  const result = res.result as { content?: Array<{ text?: string }>; isError?: boolean } | undefined
  return result?.content?.map((part) => part.text ?? "").join("\n") ?? JSON.stringify(res)
}

const TIER_0 = ["call_tool", "describe_tool", "search_tools", "voyant_glossary", "voyant_guide"]

describe("the core operator writes are reachable without configuration", () => {
  it("registers the default eager set when a deployment passes nothing", async () => {
    const names = await listToolNames(harness().app)

    expect(names).toEqual([...TIER_0, "book_product", "record_payment"].sort())
    // The default is the contract, not an accident of this fixture's names.
    expect([...DEFAULT_EAGER_TOOL_NAMES].sort()).toEqual(["book_product", "record_payment"])
  })

  it("still lets a deployment opt out with an explicit empty list", async () => {
    // `[]` and `undefined` mean different things: absent takes the default, empty
    // asks for tier-0 alone. Collapsing them would make the default unavoidable.
    const names = await listToolNames(harness({ eagerToolNames: [] }).app)

    expect(names).toEqual(TIER_0)
  })

  it("promotes only what the caller is authorized for", async () => {
    // A key with no finance grant must not be advertised the payment write —
    // eager registration is a disclosure decision, not just a cost one.
    const names = await listToolNames(harness({ scopes: ["bookings:read", "bookings:write"] }).app)

    expect(names).toEqual([...TIER_0, "book_product"].sort())
  })

  it("dispatches an eagerly registered write by its flat name", async () => {
    const text = await callText(harness().app, "record_payment", {
      invoiceId: "inv_1",
      amountCents: 1000,
    })

    expect(text).toContain("pay_1")
  })
})

describe("a folded read says where it went", () => {
  const EXPECTED = ["bookings_query", 'resource "booking"']

  it("answers a call_tool dispatch with the query tool and resource", async () => {
    const text = await callText(harness().app, "call_tool", {
      name: "get_booking",
      arguments: { id: "bkg_1" },
    })

    for (const fragment of EXPECTED) expect(text).toContain(fragment)
    // The two claims the old message made, both false here.
    expect(text).not.toContain("does not exist")
    expect(text).not.toContain("does not authorize")
  })

  it("answers a flat-name call the same way instead of the SDK's not-found", async () => {
    // The path the reported agent actually used. Left to the SDK it answers
    // "Tool not found", which is exactly what it says for a typo.
    const text = await callText(harness().app, "get_booking", { id: "bkg_1" })

    for (const fragment of EXPECTED) expect(text).toContain(fragment)
  })

  it("answers describe_tool with the resource to describe instead", async () => {
    const text = await callText(harness().app, "describe_tool", { name: "get_booking" })

    for (const fragment of EXPECTED) expect(text).toContain(fragment)
  })

  it("keeps a genuinely unknown name on the unknown-tool answer", async () => {
    const text = await callText(harness().app, "call_tool", { name: "get_nothing", arguments: {} })

    expect(text).toContain("is not available")
    expect(text).not.toContain('resource "booking"')
  })

  it("counts the folded read as unreachable, not as an unknown tool", async () => {
    const h = harness()
    await h.app.request("/", rpc("tools/call", { name: "get_booking", arguments: { id: "bkg_1" } }))

    const calls = h.telemetry().filter((event) => event.event === "tool_call")
    expect(calls).toHaveLength(1)
    // `unknown_tool` is a caller mistake and this is not one: the tool exists and
    // the caller is authorized. Blurring them hides the only outcome here that is
    // a defect on our side.
    expect(calls[0]).toMatchObject({ tool: "get_booking", outcome: "unreachable" })
  })
})
