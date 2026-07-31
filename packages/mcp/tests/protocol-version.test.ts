import {
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@modelcontextprotocol/sdk/types.js"
import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { Hono } from "hono"
import { describe, expect, it } from "vitest"

import { createMcpApiRoutes } from "../src/index.js"

/**
 * Protocol-version guard for the MCP SDK upgrade (voyant#3934, MCP W10).
 *
 * The 2026-07-28 spec revision adds cacheable list results, MRTR
 * `input_required`, the tasks extension, and `Mcp-Method`/`Mcp-Name` header
 * routing — none of which the TypeScript SDK implements yet (1.30.0 shipped one
 * day *before* the spec landed). The tracking checklist lives in
 * `docs/architecture/mcp-2026-07-28-spec-adoption.md`.
 *
 * This test pins the version the SDK actually negotiates over our stateless
 * transport, so a future SDK bump that advances the wire protocol — and, with
 * it, the features we can finally delete workarounds for — is visible in a diff
 * rather than silent.
 */

const MCP_HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
}

const accessCatalog = { resources: [], presets: [] }

function buildContext(): ToolContext {
  return {
    db: {},
    actor: "staff",
    audience: "staff",
    tenantId: "t1",
    resolverScope: { locale: "en-GB", audience: "staff", market: "default", actor: "staff" },
  }
}

function app(): Hono {
  const mcp = createMcpApiRoutes({
    accessCatalog,
    registry: createToolRegistry(),
    buildContext,
  })
  const outer = new Hono()
  outer.use("*", async (c, next) => {
    c.set("scopes", [])
    await next()
  })
  outer.route("/", mcp)
  return outer
}

async function readRpc(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    const line = text.split("\n").find((l) => l.startsWith("data:"))
    return JSON.parse(line?.slice("data:".length).trim() ?? "{}")
  }
  return JSON.parse(text)
}

async function initialize(protocolVersion: string): Promise<Record<string, unknown>> {
  const res = await app().request("/", {
    method: "POST",
    headers: MCP_HEADERS,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion,
        capabilities: {},
        clientInfo: { name: "voyant-protocol-test", version: "0.0.0" },
      },
    }),
  })
  const body = await readRpc(res)
  return (body.result as Record<string, unknown>) ?? {}
}

describe("MCP protocol negotiation (SDK @modelcontextprotocol/sdk)", () => {
  it("negotiates the SDK's latest protocol version when the client requests it", async () => {
    // Guards the SDK upgrade in voyant#3934: 1.30.0 tops out at 2025-11-25 and
    // does NOT yet carry the 2026-07-28 spec features. When a later SDK advances
    // this, the assertion fails and points at the tracking checklist.
    expect(LATEST_PROTOCOL_VERSION).toBe("2025-11-25")

    const result = await initialize(LATEST_PROTOCOL_VERSION)
    expect(result.protocolVersion).toBe("2025-11-25")
    expect(result.protocolVersion).toBe(LATEST_PROTOCOL_VERSION)
  })

  it("does not negotiate the unshipped 2026-07-28 spec revision", async () => {
    // If a future SDK begins negotiating 2026-07-28, this deliberately fails so
    // the checklist features can be picked up rather than silently skipped.
    expect(SUPPORTED_PROTOCOL_VERSIONS).not.toContain("2026-07-28")

    const result = await initialize("2026-07-28")
    // An unsupported request falls back to the SDK's latest supported version.
    expect(result.protocolVersion).toBe(LATEST_PROTOCOL_VERSION)
    expect(result.protocolVersion).not.toBe("2026-07-28")
  })
})
