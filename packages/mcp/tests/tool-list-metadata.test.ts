/**
 * Every `tools/list` entry says what it is (voyant#4592).
 *
 * A client cannot read absence: an entry with no `_meta` is either a tool the
 * SERVER owns — never a registry Tool, safe to skip — or a registry Tool whose
 * metadata went missing, which is a contract break it must fail closed on. Max
 * chose the second reading and one unmarked entry discarded the whole tenant
 * catalog on every managed deployment from 0.13 on.
 *
 * So the property under test is totality, not the presence of any one block:
 * every advertised entry carries exactly one marker, whatever gets registered
 * later. A new server-owned tool that forgets its marker fails here rather than
 * in a client.
 */
import {
  createToolRegistry,
  defineTool,
  READ_ONLY_RISK,
  TOOL_CONTRACT_VERSION,
  type ToolContext,
} from "@voyant-travel/tools"
import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { createMcpApiRoutes, SERVER_TOOL_META_KEY, VOYANT_TOOL_META_KEY } from "../src/index.js"

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

const listRecordsTool = defineTool({
  capabilityId: "@voyant-travel/test#tool.list-records",
  owner: "@voyant-travel/test",
  capabilityVersion: "v1",
  name: "list_records",
  description: "List records.",
  inputSchema: z.object({ limit: z.number().int().optional() }),
  outputSchema: z.object({ data: z.array(z.string()), total: z.number() }),
  requiredScopes: ["records:read"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  annotations: { idempotentHint: true },
  async handler() {
    return { data: ["a"], total: 1 }
  },
})

const updateRecordTool = defineTool({
  capabilityId: "@voyant-travel/test#tool.update-record",
  owner: "@voyant-travel/test",
  capabilityVersion: "v1",
  name: "update_record",
  description: "Update a record.",
  inputSchema: z.object({ id: z.string().min(1), name: z.string().min(1) }),
  outputSchema: z.object({ id: z.string(), name: z.string() }),
  requiredScopes: ["records:write"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "write",
  riskPolicy: {
    destructive: false,
    reversible: true,
    dryRunSupported: false,
    confirmationRequired: false,
    sideEffects: [],
  },
  async handler(input) {
    return input
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

function mcpApp(eagerToolNames?: readonly string[]): Hono {
  const registry = createToolRegistry()
  registry.register(listRecordsTool)
  registry.register(updateRecordTool)
  const mcp = createMcpApiRoutes({
    accessCatalog,
    registry,
    buildContext,
    ...(eagerToolNames ? { eagerToolNames } : {}),
  })
  const outer = new Hono()
  outer.use("*", async (c, next) => {
    c.set("scopes", ["records:read", "records:write"])
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

interface ListedTool {
  name: string
  _meta?: Record<string, unknown>
}

async function listTools(app: Hono): Promise<ListedTool[]> {
  const listed = await readRpc(await app.request("/", rpc("tools/list", {})))
  return (listed.result as { tools?: ListedTool[] } | undefined)?.tools ?? []
}

async function callTool(
  app: Hono,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown> | undefined> {
  const res = await readRpc(await app.request("/", rpc("tools/call", { name, arguments: args })))
  return (res.result as { structuredContent?: Record<string, unknown> } | undefined)
    ?.structuredContent
}

/** The marker block, or undefined when the entry does not claim to be server-owned. */
function serverMarker(tool: ListedTool): Record<string, unknown> | undefined {
  const marker = tool._meta?.[SERVER_TOOL_META_KEY]
  return typeof marker === "object" && marker !== null
    ? (marker as Record<string, unknown>)
    : undefined
}

describe("tools/list metadata", () => {
  it("marks every advertised entry as either a registry Tool or server-owned", async () => {
    const tools = await listTools(mcpApp(["update_record"]))
    expect(tools.length).toBeGreaterThan(0)

    // Totality is the point: not "the tools we happen to name below carry a
    // marker" but "nothing on the wire is unclassifiable". The two claims are
    // also mutually exclusive — an entry asserting both would leave a client
    // with the same ambiguity in a different form.
    const unclassifiable = tools
      .map((tool) => ({
        name: tool.name,
        registryTool: tool._meta?.[VOYANT_TOOL_META_KEY] !== undefined,
        serverTool: tool._meta?.[SERVER_TOOL_META_KEY] !== undefined,
      }))
      .filter((claim) => claim.registryTool === claim.serverTool)
    expect(unclassifiable).toEqual([])
  })

  it("classifies the guide and meta tiers by kind", async () => {
    const tools = await listTools(mcpApp())
    const kinds = Object.fromEntries(
      tools.map((tool) => [tool.name, serverMarker(tool)?.kind]),
    ) as Record<string, string | undefined>

    expect(kinds).toEqual({
      voyant_guide: "guide",
      voyant_glossary: "guide",
      search_tools: "meta",
      describe_tool: "meta",
      call_tool: "meta",
    })
    // The marker is versioned by the same Tool contract a registry Tool is, so a
    // client checks one version across the whole surface.
    expect(serverMarker(tools[0] as ListedTool)?.contractVersion).toBe(TOOL_CONTRACT_VERSION)
  })

  it("keeps an eagerly registered registry Tool on the registry-Tool block", async () => {
    const eager = (await listTools(mcpApp(["update_record"]))).find(
      (tool) => tool.name === "update_record",
    )
    expect(eager?._meta?.[VOYANT_TOOL_META_KEY]).toMatchObject({
      capabilityId: "@voyant-travel/test#tool.update-record",
      owner: "@voyant-travel/test",
      tier: "write",
    })
    expect(eager?._meta?.[SERVER_TOOL_META_KEY]).toBeUndefined()
  })

  it("describes a folded read group as server-owned without dropping its capabilities", async () => {
    const app = mcpApp()
    const found = await callTool(app, "search_tools", { query: "query" })
    const queryName = ((found?.tools ?? []) as Array<{ name: string }>)
      .map(({ name }) => name)
      .find((name) => name.endsWith("_query"))
    expect(queryName).toBeDefined()

    const descriptor = await callTool(app, "describe_tool", { name: queryName })
    const meta = descriptor?._meta as Record<string, Record<string, unknown>> | undefined

    // A group has no capability identity of its own — it stands in for several —
    // so it is marked server-owned rather than advertised as a registry Tool a
    // strict client would then reject for incomplete metadata.
    expect(meta?.[SERVER_TOOL_META_KEY]).toMatchObject({ kind: "read-query" })
    // The capabilities it absorbed still travel on the block clients already
    // read, which is how they know which flat reads to stop offering.
    expect(meta?.[VOYANT_TOOL_META_KEY]).toMatchObject({
      kind: "read-query",
      resources: [{ resource: "records", capabilityId: "@voyant-travel/test#tool.list-records" }],
    })
  })

  it("describes call_tool with the same marker it advertises", async () => {
    const descriptor = await callTool(mcpApp(), "describe_tool", { name: "call_tool" })
    expect(
      (descriptor?._meta as Record<string, unknown> | undefined)?.[SERVER_TOOL_META_KEY],
    ).toMatchObject({ kind: "meta" })
  })
})
