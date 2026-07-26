import { createToolRegistry, defineTool, type ToolContext } from "@voyant-travel/tools"
import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { createMcpApiRoutes } from "../src/index.js"

const accessCatalog = {
  resources: [
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

async function readRpc(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    const line = text.split("\n").find((l) => l.startsWith("data:"))
    return JSON.parse(line?.slice("data:".length).trim() ?? "{}")
  }
  return JSON.parse(text)
}

const scheduleOfferTool = defineTool({
  name: "schedule_offer",
  description: "Schedule an offer with Date-bearing validity bounds.",
  inputSchema: z.object({
    code: z.string().min(1),
    validFrom: z.coerce.date().nullable().optional(),
    validUntil: z.coerce.date().nullable().optional(),
  }),
  outputSchema: z.object({
    code: z.string(),
    validFrom: z.string().nullable(),
    validUntil: z.string().nullable(),
  }),
  requiredScopes: ["records:write"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "write",
  riskPolicy: {
    destructive: false,
    reversible: true,
    dryRunSupported: false,
    sideEffects: ["data-write"],
  },
  async handler(input) {
    return {
      code: input.code,
      validFrom: input.validFrom?.toISOString() ?? null,
      validUntil: input.validUntil?.toISOString() ?? null,
    }
  },
})

function buildContext(): ToolContext {
  return {
    db: {},
    actor: "staff",
    audience: "staff",
    tenantId: "t1",
    resolverScope: {
      locale: "en-GB",
      audience: "staff",
      market: "default",
      actor: "staff",
    },
  }
}

const scheduleStrictDateTool = defineTool({
  name: "schedule_strict_date",
  description: "Schedule with plain z.date() fields (no coerce).",
  inputSchema: z.object({
    code: z.string().min(1),
    startsAt: z.date(),
  }),
  outputSchema: z.object({
    code: z.string(),
    startsAt: z.string(),
  }),
  requiredScopes: ["records:write"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "write",
  riskPolicy: {
    destructive: false,
    reversible: true,
    dryRunSupported: false,
    sideEffects: ["data-write"],
  },
  async handler(input) {
    expect(input.startsAt).toBeInstanceOf(Date)
    return {
      code: input.code,
      startsAt: input.startsAt.toISOString(),
    }
  },
})

function mcpAppFor(...tools: Array<typeof scheduleOfferTool | typeof scheduleStrictDateTool>) {
  const registry = createToolRegistry()
  for (const tool of tools) registry.register(tool)
  const mcp = createMcpApiRoutes({
    accessCatalog,
    registry,
    buildContext,
  })
  const app = new Hono()
  app.use("*", async (c, next) => {
    c.set("scopes", ["records:write"])
    await next()
  })
  app.route("/", mcp)
  return app
}

describe("MCP Date input discovery", () => {
  it("lists and calls Tools whose input schemas include coerced Date fields", async () => {
    const app = mcpAppFor(scheduleOfferTool)

    const listed = await readRpc(await app.request("/", rpc("tools/list", {})))
    expect(listed.error).toBeUndefined()
    const tool = (
      listed.result as {
        tools?: Array<{
          name: string
          inputSchema?: {
            properties?: Record<string, { type?: string; format?: string }>
          }
        }>
      }
    ).tools?.find(({ name }) => name === "schedule_offer")

    expect(tool).toBeDefined()
    const validFrom = tool?.inputSchema?.properties?.validFrom
    expect(JSON.stringify(validFrom)).toMatch(/string|date-time/)

    const called = await readRpc(
      await app.request(
        "/",
        rpc("tools/call", {
          name: "schedule_offer",
          arguments: {
            code: "spring",
            validFrom: "2026-07-01T00:00:00.000Z",
            validUntil: "2026-07-31T23:59:59.000Z",
          },
        }),
      ),
    )
    expect(called.error).toBeUndefined()
    expect(called.result).toMatchObject({
      structuredContent: {
        code: "spring",
        validFrom: "2026-07-01T00:00:00.000Z",
        validUntil: "2026-07-31T23:59:59.000Z",
      },
    })
  })

  it("revives ISO datetime strings for plain z.date() Tool inputs before registry validation", async () => {
    const app = mcpAppFor(scheduleStrictDateTool)

    const listed = await readRpc(await app.request("/", rpc("tools/list", {})))
    expect(listed.error).toBeUndefined()
    expect(
      (
        listed.result as {
          tools?: Array<{ name: string }>
        }
      ).tools?.some(({ name }) => name === "schedule_strict_date"),
    ).toBe(true)

    const called = await readRpc(
      await app.request(
        "/",
        rpc("tools/call", {
          name: "schedule_strict_date",
          arguments: {
            code: "summer",
            startsAt: "2026-08-01T12:00:00.000Z",
          },
        }),
      ),
    )
    expect(called.error).toBeUndefined()
    expect(called.result).toMatchObject({
      structuredContent: {
        code: "summer",
        startsAt: "2026-08-01T12:00:00.000Z",
      },
    })
  })
})
