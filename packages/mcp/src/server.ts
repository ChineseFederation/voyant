/**
 * The in-deployment MCP server (voyant#2792). Exposes a `@voyant-travel/tools`
 * `ToolRegistry` as a real Model Context Protocol server, mounted as a Hono
 * route group inside the operator app at `/v1/admin/mcp` — stateless, no Durable
 * Object (see the Sub-issue 0 spike). External MCP clients connect over the wire.
 *
 * Transport: `@modelcontextprotocol/sdk` `McpServer` connected to `@hono/mcp`'s
 * web-standard `StreamableHTTPTransport`. A fresh server + transport per request
 * keeps it stateless, so the lazy-route `c.var` hydration (db lease / actor /
 * scopes / audience) is all the context we need.
 *
 * This module owns route wiring and graph composition only. The security
 * boundary it used to hold inline now lives in focused siblings, so several
 * workstreams can edit them independently (voyant#3924):
 * - `authorization.ts` — scope/audience gating (D2)
 * - `register.ts` — per-tool registration + discovery metadata
 * - `dispatch.ts` — dispatch and the action-policy gate
 * - `schema-projection.ts` — Zod ↔ MCP schema translation
 * - `graph-composition.ts` — selected-graph composition and context contributors
 */
import { StreamableHTTPTransport } from "@hono/mcp"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { assertVoyantGraphMcpRuntime } from "@voyant-travel/framework/runtime-attestation"
import {
  createToolRegistry,
  TOOL_CONTEXT_CONTRIBUTION_EXPORT,
  TOOL_CONTRACT_VERSION,
  type ToolContext,
  type ToolContextContribution,
  type ToolManifestEntry,
  type ToolRegistry,
} from "@voyant-travel/tools"
import type { Context } from "hono"

import { buildAuthenticatedContext, callerPermissions, isAuthorized } from "./authorization.js"
import {
  assertToolContextContribution,
  buildContributedContext,
  indexActionsByTool,
} from "./graph-composition.js"
import {
  callerFromContext,
  classifyToolCallResult,
  createMcpObserver,
  jsonByteLength,
  type McpObserver,
} from "./observability.js"
import { registerMcpTool } from "./register.js"
import type { GraphMcpApiRoutesOptions, McpApiRoutesOptions, McpServerInfo } from "./types.js"

export type {
  GraphMcpApiRoutesOptions,
  GraphMcpRuntime,
  McpApiRoutesOptions,
  McpServerInfo,
} from "./types.js"

const DEFAULT_SERVER_INFO: McpServerInfo = { name: "voyant-mcp", version: "0.1.0" }
const mcpAdminApiId = "@voyant-travel/mcp#api.admin"
const getManifestRoute = createRoute({
  method: "get",
  path: "/manifest",
  operationId: "getMcpManifest",
  "x-voyant-api-id": mcpAdminApiId,
  responses: { 200: { description: "The authorized MCP tool manifest" } },
})
const callMcpRoute = createRoute({
  method: "post",
  path: "/",
  operationId: "callMcp",
  "x-voyant-api-id": mcpAdminApiId,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            jsonrpc: z.literal("2.0"),
            id: z.union([z.string(), z.number(), z.null()]).optional(),
            method: z.string(),
            params: z.record(z.string(), z.unknown()).optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: "The MCP JSON-RPC response" },
    204: { description: "The MCP notification was accepted" },
  },
})

/**
 * Build the MCP Hono sub-app. Mount at `/v1/admin/mcp`:
 * - `POST /` — MCP JSON-RPC (`initialize` / `tools/list` / `tools/call`).
 * - `GET /manifest` — the tool discovery manifest (contract-versioned), filtered
 *   to what the caller is authorized for.
 */
export function createMcpApiRoutes(options: McpApiRoutesOptions): OpenAPIHono {
  const { accessCatalog, registry, buildContext } = options
  const serverInfo = options.serverInfo ?? DEFAULT_SERVER_INFO
  const app = new OpenAPIHono()

  const observerFor = (ctx: ToolContext): McpObserver =>
    createMcpObserver({
      ...(options.reporter ? { reporter: options.reporter } : {}),
      ...(options.appName ? { appName: options.appName } : {}),
      ...(ctx.waitUntil ? { waitUntil: ctx.waitUntil } : {}),
    })

  app.openapi(getManifestRoute, async (c) => {
    const permissions = callerPermissions(c)
    const ctx = await buildAuthenticatedContext(c, buildContext)
    const tools = registry
      .list()
      .filter((tool) => isAuthorized(tool, permissions, accessCatalog, ctx.audience))
    observerFor(ctx).toolsList({
      payloadBytes: jsonByteLength(tools),
      toolCount: tools.length,
      caller: callerFromContext(ctx),
    })
    return c.json({ version: TOOL_CONTRACT_VERSION, serverInfo, tools })
  })

  app.openapi(callMcpRoute, async (c) => {
    const permissions = callerPermissions(c)
    const ctx = await buildAuthenticatedContext(c, buildContext)
    const observer = observerFor(ctx)
    const server = new McpServer(serverInfo)

    // The invocation names the caller could actually reach, so an unknown-tool
    // event is a name that was never registered *or* was filtered by scope —
    // both of which reveal what the model expected but could not call.
    const authorizedTools = new Map<string, ToolManifestEntry>()
    for (const entry of registry.list()) {
      if (!isAuthorized(entry, permissions, accessCatalog, ctx.audience)) continue
      const def = registry.get(entry.name)
      if (!def) continue
      authorizedTools.set(entry.name, entry)
      registerMcpTool(
        server,
        registry,
        entry,
        def,
        entry.name,
        ctx,
        undefined,
        options.requireActionPolicies,
      )
      for (const alias of entry.aliases) {
        authorizedTools.set(alias, entry)
        registerMcpTool(
          server,
          registry,
          entry,
          def,
          alias,
          ctx,
          entry.name,
          options.requireActionPolicies,
        )
      }
    }

    const transport = new StreamableHTTPTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await server.connect(transport)
    const startedAt = Date.now()
    const response = (await transport.handleRequest(c)) ?? c.body(null, 204)
    await instrumentRpc(c, response, Date.now() - startedAt, authorizedTools, ctx, observer)
    return response
  })

  return app
}

/**
 * Emit the boundary telemetry for the request that just completed. Best-effort:
 * a parsing slip here must never change the response the caller receives, so the
 * whole body is defensive and swallows its own failures.
 */
async function instrumentRpc(
  c: Context,
  response: Response,
  durationMs: number,
  authorizedTools: Map<string, ToolManifestEntry>,
  ctx: ToolContext,
  observer: McpObserver,
): Promise<void> {
  try {
    // Hono caches the parsed body, so this reuses the parse the transport read.
    const request = asRecord(await c.req.json())
    const method = request?.method
    if (method !== "tools/call" && method !== "tools/list") return
    const caller = callerFromContext(ctx)
    const payload = await readJsonRpcResponse(response)
    if (method === "tools/list") {
      const tools = asRecord(payload?.result)?.tools
      const list = Array.isArray(tools) ? tools : []
      observer.toolsList({
        payloadBytes: jsonByteLength(list),
        toolCount: list.length,
        caller,
      })
      return
    }
    const name = asRecord(request?.params)?.name
    if (typeof name !== "string") return
    const entry = authorizedTools.get(name)
    const { outcome, code } = classifyToolCallResult(payload, entry !== undefined)
    observer.toolCall({
      tool: name,
      outcome,
      durationMs,
      write: entry ? entry.annotations.readOnlyHint !== true : false,
      ...(code ? { code } : {}),
      caller,
    })
  } catch {
    // Instrumentation is best-effort and must never break a tools/call.
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined
}

/** Read a JSON-RPC response body without consuming the response returned to the caller. */
async function readJsonRpcResponse(
  response: Response,
): Promise<Record<string, unknown> | undefined> {
  if (!response.body && response.status === 204) return undefined
  try {
    return asRecord(await response.clone().json())
  } catch {
    return undefined
  }
}

/** Compose selected tools and their package-owned context contributors from one graph. */
export async function createGraphMcpApiRoutes(
  options: GraphMcpApiRoutesOptions,
): Promise<OpenAPIHono> {
  assertVoyantGraphMcpRuntime(options.runtime)
  const registry = createToolRegistry()
  const contributions = new Map<string, { contribution: ToolContextContribution; unitId: string }>()
  const requiredContext = new Set<string>()
  const actions = options.runtime.actions ?? []
  const actionsByTool = indexActionsByTool(actions)
  const unavailableToolIds = new Set(
    actions
      .filter((action) => action.availability?.status === "unavailable")
      .flatMap((action) => action.from?.tools ?? []),
  )

  for (const tool of options.runtime.tools) {
    if (!tool.id) {
      throw new Error(`Selected MCP Tool "${tool.name ?? "unknown"}" has no stable capability id.`)
    }
    if (unavailableToolIds.has(tool.id)) {
      throw new Error(
        `Selected MCP Tool "${tool.name ?? tool.id}" is bound by an unavailable graph action.`,
      )
    }
    const definition = await tool.load<Parameters<ToolRegistry["register"]>[0]>()
    const actionPolicy = actionsByTool.get(tool.id)
    if (!actionPolicy && tool.risk !== "low") {
      throw new Error(
        `Selected MCP Tool "${tool.name ?? tool.id ?? "unknown"}" has no selected graph action policy.`,
      )
    }
    const capabilityVersion = (tool as { capabilityVersion?: unknown }).capabilityVersion
    registry.register(definition, {
      ...(tool.id ? { capabilityId: tool.id } : {}),
      ...(tool.unitId ? { owner: tool.unitId } : {}),
      ...(typeof capabilityVersion === "string" ? { capabilityVersion } : {}),
      ...(tool.name ? { name: tool.name } : {}),
      ...(tool.requiredScopes ? { requiredScopes: tool.requiredScopes } : {}),
      ...(tool.risk ? { deploymentRisk: tool.risk } : {}),
      ...(actionPolicy ? { actionPolicy } : {}),
    })
    if (actionPolicy && definition.actionPolicyEnforcement !== "handler") {
      requiredContext.add("toolActionPolicy")
    }
    for (const key of tool.context ?? []) requiredContext.add(key)

    const reference = options.runtime.references.find(({ id }) => id === tool.referenceId)
    if (!reference) continue
    const toolUnitId = tool.unitId ?? ""
    const existingContribution = contributions.get(reference.importEntry)
    if (existingContribution) {
      // A package may expose Tools from both its module and one or more extensions
      // through the same runtime entry. In that case the contribution remains shared,
      // as it was before unit-scoped resources existed; only uniquely-owned runtime
      // entries receive project configuration for their owning unit.
      if (existingContribution.unitId !== toolUnitId) existingContribution.unitId = ""
      continue
    }
    const namespace = await reference.loadModule()
    const contribution = namespace[TOOL_CONTEXT_CONTRIBUTION_EXPORT]
    if (contribution !== undefined) {
      assertToolContextContribution(contribution, reference.importEntry)
      contributions.set(reference.importEntry, {
        contribution,
        unitId: toolUnitId,
      })
    }
  }

  const contextOwners = new Map<string, string>()
  for (const [importEntry, { contribution }] of contributions) {
    for (const key of contribution.context) {
      const owner = contextOwners.get(key)
      if (owner && owner !== importEntry) {
        throw new Error(
          `Selected MCP runtimes "${owner}" and "${importEntry}" both contribute context "${key}".`,
        )
      }
      contextOwners.set(key, importEntry)
    }
  }
  const contributedContext = new Set(contextOwners.keys())
  const providedContext = new Set(options.providedContext ?? [])
  const missing = [...requiredContext]
    .filter((key) => !contributedContext.has(key) && !providedContext.has(key))
    .sort()
  if (missing.length > 0) {
    throw new Error(`Selected MCP tools have no context contribution for: ${missing.join(", ")}.`)
  }

  return createMcpApiRoutes({
    accessCatalog: options.runtime.accessCatalog,
    registry,
    requireActionPolicies: true,
    ...(options.serverInfo ? { serverInfo: options.serverInfo } : {}),
    ...(options.reporter ? { reporter: options.reporter } : {}),
    ...(options.appName ? { appName: options.appName } : {}),
    buildContext: (c) => buildContributedContext(c, options, contributions.values()),
  })
}
