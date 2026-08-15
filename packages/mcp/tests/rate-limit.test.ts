import {
  createToolRegistry,
  defineTool,
  READ_ONLY_RISK,
  type ToolContext,
} from "@voyant-travel/tools"
import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { createMcpApiRoutes } from "../src/index.js"
import { isRestrictedTool } from "../src/rate-limit.js"

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
      description: "Test records",
      wildcard: "allow" as const,
      actions: [
        { action: "read", label: "Read", description: "Read records" },
        { action: "write", label: "Write", description: "Write records" },
      ],
    },
  ],
  presets: [],
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

const echoTool = defineTool({
  capabilityId: "@voyant-travel/test#tool.echo",
  owner: "@voyant-travel/test",
  capabilityVersion: "v2",
  name: "echo",
  description: "Echo the text back.",
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

const deleteRecordTool = defineTool({
  name: "delete_record",
  description: "Irreversibly delete a record.",
  inputSchema: z.object({ id: z.string().min(1) }),
  outputSchema: z.object({ id: z.string() }),
  requiredScopes: ["records:write"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "destructive",
  riskPolicy: {
    destructive: true,
    reversible: false,
    dryRunSupported: false,
    sideEffects: ["data-delete"],
  },
  async handler({ id }) {
    return { id }
  },
})

function buildContext(): ToolContext {
  return {
    db: {},
    actor: "staff",
    audience: "staff",
    tenantId: "t1",
    resolverScope: { locale: "en-GB", audience: "staff", market: "default", actor: "staff" },
  }
}

/** Mount the MCP app, seeding granted scopes and a stable per-caller key. */
function app(options: {
  readLimit?: number
  writeLimit?: number
  rateLimit?: false
  apiKeyId?: string
}): Hono {
  const registry = createToolRegistry()
  registry.register(echoTool)
  registry.register(deleteRecordTool)
  const mcp = createMcpApiRoutes({
    accessCatalog,
    registry,
    buildContext,
    ...(options.rateLimit === false
      ? { rateLimit: false as const }
      : {
          rateLimit: {
            ...(options.readLimit !== undefined ? { readLimit: options.readLimit } : {}),
            ...(options.writeLimit !== undefined ? { writeLimit: options.writeLimit } : {}),
          },
        }),
  })

  const outer = new Hono()
  outer.use("*", async (c, next) => {
    c.set("scopes", ["catalog:read", "records:write"])
    c.set("apiKeyId", options.apiKeyId ?? "key-a")
    await next()
  })
  outer.route("/", mcp)
  return outer
}

const echoCall = rpc("tools/call", { name: "echo", arguments: { text: "hi" } })
const deleteCall = rpc("tools/call", { name: "delete_record", arguments: { id: "r1" } })

describe("isRestrictedTool", () => {
  it("treats reads as unrestricted and non-reads as restricted", () => {
    const registry = createToolRegistry()
    registry.register(echoTool)
    registry.register(deleteRecordTool)
    const byName = new Map(registry.list().map((entry) => [entry.name, entry]))
    expect(isRestrictedTool(byName.get("echo")!)).toBe(false)
    expect(isRestrictedTool(byName.get("delete_record")!)).toBe(true)
  })
})

describe("createMcpRateLimiter middleware", () => {
  it("throttles read calls after the read limit and returns 429", async () => {
    const server = app({ readLimit: 2, writeLimit: 10 })
    expect((await server.request("/", echoCall)).status).toBe(200)
    expect((await server.request("/", echoCall)).status).toBe(200)
    const limited = await server.request("/", echoCall)
    expect(limited.status).toBe(429)
  })

  it("throttles destructive/ledgered calls tighter than reads", async () => {
    const server = app({ readLimit: 100, writeLimit: 1 })
    expect((await server.request("/", deleteCall)).status).toBe(200)
    const limited = await server.request("/", deleteCall)
    expect(limited.status).toBe(429)
    // The read bucket is independent and still has plenty of budget.
    expect((await server.request("/", echoCall)).status).toBe(200)
  })

  it("keeps read and write buckets on separate counters", async () => {
    const server = app({ readLimit: 1, writeLimit: 1 })
    expect((await server.request("/", echoCall)).status).toBe(200)
    // A read at its limit must not consume the write budget.
    expect((await server.request("/", deleteCall)).status).toBe(200)
    expect((await server.request("/", echoCall)).status).toBe(429)
    expect((await server.request("/", deleteCall)).status).toBe(429)
  })

  it("limits each caller key independently", async () => {
    const first = app({ readLimit: 1, apiKeyId: "key-a" })
    const second = app({ readLimit: 1, apiKeyId: "key-b" })
    expect((await first.request("/", echoCall)).status).toBe(200)
    expect((await first.request("/", echoCall)).status).toBe(429)
    // A different key starts with a fresh budget.
    expect((await second.request("/", echoCall)).status).toBe(200)
  })

  it("charges a write dispatched through call_tool to the write bucket", async () => {
    // The bucket has to follow the tool that will RUN, not the name on the
    // envelope. Progressive disclosure made `call_tool` the ordinary way to reach
    // a non-eager tool, so classifying the envelope let every such write run at
    // the loose read limit (voyant#4661 review).
    const server = app({ readLimit: 100, writeLimit: 1 })
    const nested = rpc("tools/call", {
      name: "call_tool",
      arguments: { name: "delete_record", arguments: { id: "r1" } },
    })

    expect((await server.request("/", nested)).status).toBe(200)
    expect((await server.request("/", nested)).status).toBe(429)
    // Still its own counter: the read bucket was never touched.
    expect((await server.request("/", echoCall)).status).toBe(200)
  })

  it("charges a namespaced write name to the write bucket", async () => {
    // Dispatch accepts `functions.delete_record`, so a throttle that does not
    // would make the prefix a one-token way down to the read limit.
    const server = app({ readLimit: 100, writeLimit: 1 })
    const prefixed = rpc("tools/call", {
      name: "functions.delete_record",
      arguments: { id: "r1" },
    })

    await server.request("/", prefixed)
    expect((await server.request("/", prefixed)).status).toBe(429)
  })

  it("keeps a read dispatched through call_tool on the read bucket", async () => {
    // The unwrapping must not push everything into the tight bucket — a read is
    // still a read wherever it is called from.
    const server = app({ readLimit: 100, writeLimit: 1 })
    const nested = rpc("tools/call", {
      name: "call_tool",
      arguments: { name: "echo", arguments: { text: "hi" } },
    })

    expect((await server.request("/", nested)).status).toBe(200)
    expect((await server.request("/", nested)).status).toBe(200)
    // The write budget of 1 is untouched.
    expect((await server.request("/", deleteCall)).status).toBe(200)
  })

  it("does not throttle when rate limiting is disabled", async () => {
    const server = app({ rateLimit: false })
    for (let i = 0; i < 10; i++) {
      expect((await server.request("/", echoCall)).status).toBe(200)
    }
  })
})
