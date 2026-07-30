/**
 * Instrumentation at the MCP dispatch boundary (voyant#3925). Proves that every
 * `tools/call` emits one structured event through the shipped Reporter seam,
 * that unknown-tool and validation-failure events stay distinct from a
 * successful call, and — the hard rule from `docs/architecture/booking-pii.md` —
 * that no argument or result payload value ever reaches an emitted event.
 */
import type { ErrorEvent, Reporter } from "@voyant-travel/hono/observability"
import {
  createToolRegistry,
  defineTool,
  READ_ONLY_RISK,
  type ToolContext,
  ToolError,
} from "@voyant-travel/tools"
import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { createMcpApiRoutes } from "../src/index.js"
import { MCP_TELEMETRY_CONTEXT_KEY } from "../src/observability.js"

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
    {
      id: "records",
      unitId: "@voyant-travel/test",
      resource: "records",
      label: "Records",
      description: "Records",
      wildcard: "allow" as const,
      actions: [
        { action: "read", label: "Read", description: "Read records" },
        { action: "write", label: "Write", description: "Write records" },
      ],
    },
  ],
  presets: [],
}

// A sentinel that stands in for encrypted booking/traveller PII. If any of these
// strings surfaces in an emitted event, the payload leaked.
const PII = {
  email: "traveller.secret@pii.example",
  lastName: "SECRET_SURNAME_9137",
  passport: "PPT-SECRET-88231",
}

const echoTool = defineTool({
  capabilityId: "@voyant-travel/test#tool.echo",
  owner: "@voyant-travel/test",
  capabilityVersion: "v1",
  name: "echo",
  description: "Echo the text back.",
  aliases: ["echo_text"],
  inputSchema: z.object({ text: z.string() }),
  outputSchema: z.object({ text: z.string() }),
  requiredScopes: ["catalog:read"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  async handler({ text }) {
    return { text: `echo: ${text}` }
  },
})

// Reads and returns traveller identity — the input and output both carry PII.
const lookupTravellerTool = defineTool({
  capabilityId: "@voyant-travel/test#tool.lookup_traveller",
  owner: "@voyant-travel/test",
  capabilityVersion: "v1",
  name: "lookup_traveller",
  description: "Look a traveller up by email.",
  aliases: [],
  inputSchema: z.object({ email: z.string(), lastName: z.string() }),
  outputSchema: z.object({ email: z.string(), lastName: z.string(), passport: z.string() }),
  requiredScopes: ["catalog:read"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  async handler(input) {
    return { email: input.email, lastName: input.lastName, passport: PII.passport }
  },
})

// A write tool that fails with a coded ToolError, exercising the tool_error path.
const saveNoteTool = defineTool({
  capabilityId: "@voyant-travel/test#tool.save_note",
  owner: "@voyant-travel/test",
  capabilityVersion: "v1",
  name: "save_note",
  description: "Save a note against a record.",
  aliases: [],
  inputSchema: z.object({ note: z.string() }),
  outputSchema: z.object({ saved: z.boolean() }),
  requiredScopes: ["records:write"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "write",
  riskPolicy: {
    destructive: false,
    reversible: true,
    dryRunSupported: false,
    sideEffects: ["data-write"],
  },
  async handler({ note }) {
    throw new ToolError(`refusing to persist ${note}`, "RECORD_LOCKED")
  },
})

function buildContext(): ToolContext {
  return {
    db: {},
    actor: "staff",
    audience: "staff",
    tenantId: "t1",
    organizationId: "org-9",
    resolverScope: { locale: "en-GB", audience: "staff", market: "default", actor: "staff" },
  }
}

interface Harness {
  app: Hono
  events: ErrorEvent[]
  telemetry: () => Array<Record<string, unknown>>
}

function harness(scopes = ["catalog:read", "records:write"]): Harness {
  const events: ErrorEvent[] = []
  const reporter: Reporter = {
    captureException(event) {
      events.push(event)
    },
  }
  const registry = createToolRegistry()
  registry.register(echoTool)
  registry.register(lookupTravellerTool)
  registry.register(saveNoteTool)
  const mcp = createMcpApiRoutes({
    accessCatalog,
    registry,
    buildContext,
    reporter,
    appName: "test-app",
  })
  const app = new Hono()
  app.use("*", async (c, next) => {
    c.set("scopes", scopes)
    await next()
  })
  app.route("/", mcp)
  return {
    app,
    events,
    telemetry: () =>
      events
        .map((e) => e.context?.[MCP_TELEMETRY_CONTEXT_KEY])
        .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null),
  }
}

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

async function call(app: Hono, name: string, args: unknown) {
  return app.request("/", rpc("tools/call", { name, arguments: args }))
}

describe("MCP dispatch instrumentation", () => {
  it("emits one structured tool_call event per successful call", async () => {
    const h = harness()
    await call(h.app, "echo", { text: "hello" })

    const calls = h.telemetry().filter((e) => e.event === "tool_call")
    expect(calls).toHaveLength(1)
    const event = calls[0]!
    expect(event).toMatchObject({
      tool: "echo",
      outcome: "ok",
      write: false,
    })
    expect(typeof event.durationMs).toBe("number")
    expect(event.code).toBeUndefined()
    expect(event.caller).toMatchObject({
      actor: "staff",
      audience: "staff",
      tenantId: "t1",
      organizationId: "org-9",
    })
    expect(event.caller).toMatchObject({ scopes: expect.arrayContaining(["catalog:read"]) })
    // Rides the shipped seam: requestId + app name on the ErrorEvent envelope.
    expect(h.events[0]!.app).toBe("test-app")
    expect(typeof h.events[0]!.requestId).toBe("string")
  })

  it("marks a write tool's calls as writes", async () => {
    const h = harness()
    await call(h.app, "save_note", { note: "n" })
    const event = h.telemetry().find((e) => e.event === "tool_call")
    expect(event).toMatchObject({ tool: "save_note", write: true })
  })

  it("distinguishes unknown-tool calls from successful calls", async () => {
    const h = harness()
    await call(h.app, "find_reservation", { q: "x" })
    const event = h.telemetry().find((e) => e.event === "tool_call")
    expect(event).toMatchObject({ tool: "find_reservation", outcome: "unknown_tool", write: false })
  })

  it("reports a tool filtered by scope as unknown so the naming gap is visible", async () => {
    const h = harness(["catalog:read"]) // no records:write, so save_note is not registered
    await call(h.app, "save_note", { note: "n" })
    const event = h.telemetry().find((e) => e.event === "tool_call")
    expect(event).toMatchObject({ tool: "save_note", outcome: "unknown_tool" })
  })

  it("distinguishes argument-validation failures from successful calls", async () => {
    const h = harness()
    await call(h.app, "echo", { text: 42 }) // text must be a string
    const event = h.telemetry().find((e) => e.event === "tool_call")
    expect(event).toMatchObject({ tool: "echo", outcome: "validation_error" })
  })

  it("carries the domain error code on a tool_error", async () => {
    const h = harness()
    await call(h.app, "save_note", { note: "keep" })
    const event = h.telemetry().find((e) => e.event === "tool_call")
    expect(event).toMatchObject({ tool: "save_note", outcome: "tool_error", code: "RECORD_LOCKED" })
  })

  it("emits the tools/list payload size", async () => {
    const h = harness()
    await h.app.request("/", rpc("tools/list", {}))
    const event = h.telemetry().find((e) => e.event === "tools_list")
    expect(event).toBeDefined()
    expect(event!.toolCount).toBeGreaterThan(0)
    expect(typeof event!.payloadBytes).toBe("number")
    expect(event!.payloadBytes).toBeGreaterThan(0)
  })

  it("emits the manifest payload size on GET /manifest", async () => {
    const h = harness()
    await h.app.request("/manifest")
    const event = h.telemetry().find((e) => e.event === "tools_list")
    expect(event).toMatchObject({ toolCount: expect.any(Number) })
    expect(event!.payloadBytes).toBeGreaterThan(0)
  })

  it("never lets an argument or result payload value reach an emitted event", async () => {
    const h = harness()
    // A successful call whose input AND output carry PII.
    await call(h.app, "lookup_traveller", { email: PII.email, lastName: PII.lastName })
    // A validation failure whose rejected arguments carry PII.
    await call(h.app, "lookup_traveller", { email: PII.email, lastName: 999 })
    // An unknown-tool call whose arguments carry PII.
    await call(h.app, "purge_traveller", { email: PII.email })
    // A coded tool_error whose arguments carry PII.
    await call(h.app, "save_note", { note: PII.passport })

    expect(h.telemetry().length).toBeGreaterThanOrEqual(4)
    // Serialize the ENTIRE emitted events (envelope + signal message + context)
    // and assert not a single PII sentinel leaked anywhere.
    const serialized = h.events.map((event) => ({
      requestId: event.requestId,
      app: event.app,
      error: event.error instanceof Error ? event.error.message : String(event.error),
      context: event.context,
    }))
    const blob = JSON.stringify(serialized)
    for (const secret of Object.values(PII)) {
      expect(blob).not.toContain(secret)
    }
  })
})
