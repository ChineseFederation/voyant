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
import type { Reporter } from "@voyant-travel/hono/observability"
import {
  createToolRegistry,
  TOOL_CONTEXT_CONTRIBUTION_EXPORT,
  TOOL_CONTRACT_VERSION,
  type ToolContext,
  type ToolContextContribution,
  type ToolRegistry,
} from "@voyant-travel/tools"
import type { Context } from "hono"

import { buildAuthenticatedContext, callerPermissions, isAuthorized } from "./authorization.js"
import {
  assertToolContextContribution,
  buildContributedContext,
  indexActionsByTool,
} from "./graph-composition.js"
import { buildServerInstructions, registerGuideTools } from "./guide.js"
import {
  type AuthorizedSurface,
  collectAuthorizedTools,
  META_TOOL_NAMES,
  registerFoldedReadNotice,
  registerMetaTools,
  selectEagerToolNames,
} from "./meta-tools.js"
import {
  callerFromContext,
  classifyToolCallResult,
  createMcpObserver,
  jsonByteLength,
  type McpObserver,
} from "./observability.js"
import { createMcpRateLimiter } from "./rate-limit.js"
import { buildReadProjection, type ReadProjection, registerQueryTool } from "./read-projection.js"
import { registerMcpTool } from "./register.js"
import { DEFAULT_RESPONSE_BUDGET_BYTES } from "./response-budget.js"
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
  responses: { 200: { description: "The contract-versioned tools visible to the caller." } },
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

  // Throttle the JSON-RPC endpoint per caller before it can reach dispatch, with
  // a tighter bucket for write/destructive/ledgered calls than for reads.
  if (options.rateLimit !== false) {
    app.use(callMcpRoute.path, createMcpRateLimiter(registry, options.rateLimit ?? {}))
  }

  /**
   * Resolve the telemetry sink, preferring an explicitly configured reporter and
   * otherwise falling back to the one `createVoyantApp` puts on the request
   * context.
   *
   * The fallback is what makes this instrumentation actually emit. Nothing
   * threads a reporter into `createMcpVoyantRuntime` — the transport is composed
   * generically from the selected graph — so without reading the context the
   * observer defaults to a no-op and the whole surface ships dark.
   */
  const observerFor = (c: Context, ctx: ToolContext): McpObserver => {
    const contextReporter = (c.var as { reporter?: Reporter }).reporter
    const contextAppName = (c.var as { appName?: string }).appName
    const reporter = options.reporter ?? contextReporter
    const appName = options.appName ?? contextAppName
    return createMcpObserver({
      ...(reporter ? { reporter } : {}),
      ...(appName ? { appName } : {}),
      ...(ctx.waitUntil ? { waitUntil: ctx.waitUntil } : {}),
    })
  }

  app.openapi(getManifestRoute, async (c) => {
    const permissions = callerPermissions(c)
    const ctx = await buildAuthenticatedContext(c, buildContext)
    const tools = registry
      .list()
      .filter((tool) => isAuthorized(tool, permissions, accessCatalog, ctx.audience))
    observerFor(c, ctx).toolsList({
      payloadBytes: jsonByteLength(tools),
      toolCount: tools.length,
      caller: callerFromContext(ctx),
    })
    return c.json({ version: TOOL_CONTRACT_VERSION, serverInfo, tools })
  })

  app.openapi(callMcpRoute, async (c) => {
    const permissions = callerPermissions(c)
    const ctx = await buildAuthenticatedContext(c, buildContext)
    const observer = observerFor(c, ctx)
    const requireActionPolicy = options.requireActionPolicies ?? false
    const budgetBytes = options.responseBudgetBytes ?? DEFAULT_RESPONSE_BUDGET_BYTES

    // The caller's full authorized surface (canonical + alias names). Progressive
    // disclosure means only tier 0 is *registered* — but search / describe / call
    // and flat-name dispatch all consult this same map, so an unauthorized tool is
    // neither discoverable nor callable. Pruning at the index and dispatch layers,
    // not just the register loop, is the security property of the server.
    const surface = collectAuthorizedTools(registry, permissions, accessCatalog, ctx.audience)

    // Layered read projection (voyant#3932): the flat `get_*`/`list_*`/`search_*`
    // reads are folded into one `<domain>_query` tool per product area. Discovery
    // and dispatch consult this projection so the reads are neither individually
    // discoverable nor callable by their flat names, while scope filtering still
    // prunes an unauthorized read out of its group.
    const projection = buildReadProjection(surface)

    // Which domain tools are eager is resolved BEFORE the server is built,
    // because the guide describes the eager surface and must describe the one
    // this caller will actually receive — an authorized-and-selected set, not the
    // configured list (voyant#4661 review).
    const eagerNames = selectEagerToolNames(surface, options.eagerToolNames)

    // The guide layer's `instructions` are scope-aware — a read-only key is told
    // the write journeys are unreachable rather than shown workflows it cannot
    // perform — so whether any write Tool is reachable must be known before the
    // server is constructed.
    const guideScope = {
      writeEnabled: [...surface.values()].some(
        ({ entry }) => entry.annotations.readOnlyHint !== true,
      ),
      anyToolReachable: surface.size > 0,
      eagerToolNames: [...eagerNames],
    }
    const server = new McpServer(serverInfo, {
      instructions: buildServerInstructions(guideScope),
    })
    const guideToolNames = new Set(registerGuideTools(server, guideScope))

    // Register only the tier-0 domain tools eagerly; the long tail stays lazy.
    for (const name of eagerNames)
      registerSurfaceTool(server, registry, surface, name, ctx, requireActionPolicy, budgetBytes)

    registerMetaTools({
      server,
      registry,
      surface,
      projection,
      ctx,
      requireActionPolicy,
      observer,
      caller: callerFromContext(ctx),
      now: () => Date.now(),
      budgetBytes,
    })

    // Backwards compatibility: a flat-name `tools/call` for a lazy (non-eager)
    // authorized tool must still dispatch — the operator's manual-booking client
    // calls `create_booking` by name. Register just that tool for this request, so
    // the SDK validates and dispatches it exactly as before. Because `surface`
    // gates it, an unauthorized name is never registered and stays uncallable. A
    // `<domain>_query` tool is synthetic (not in the registry), so it registers
    // through its own projection-backed handler; a folded flat read name is never
    // registered and stays uncallable.
    const requestBody = asRecord(await c.req.json().catch(() => undefined))
    const requestedName = requestedToolName(requestBody)
    if (
      requestedName &&
      !eagerNames.has(requestedName) &&
      !META_TOOL_NAMES.includes(requestedName)
    ) {
      const queryTool = projection.queryToolFor(requestedName)
      if (queryTool) {
        registerQueryTool(server, registry, queryTool, ctx, requireActionPolicy, budgetBytes)
      } else if (surface.has(requestedName) && projection.hiddenReadNames.has(requestedName)) {
        // A folded read called by its old flat name. Without this the SDK answers
        // "tool not found", which is the same thing it says for a typo — so the
        // one case that is a discovery defect looked exactly like caller error
        // (voyant#4656). Registered only for THIS request, so it never appears in
        // a `tools/list`.
        registerFoldedReadNotice(server, projection, requestedName)
      } else if (surface.has(requestedName) && !projection.hiddenReadNames.has(requestedName)) {
        registerSurfaceTool(
          server,
          registry,
          surface,
          requestedName,
          ctx,
          requireActionPolicy,
          budgetBytes,
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
    await instrumentRpc(
      c,
      response,
      Date.now() - startedAt,
      surface,
      projection,
      guideToolNames,
      ctx,
      observer,
    )
    return response
  })

  return app
}

/** Register one invocation name from the authorized surface onto the per-request server. */
function registerSurfaceTool(
  server: McpServer,
  registry: ToolRegistry,
  surface: AuthorizedSurface,
  invocationName: string,
  ctx: ToolContext,
  requireActionPolicy: boolean,
  budgetBytes: number,
): void {
  const binding = surface.get(invocationName)
  if (!binding) return
  const def = registry.get(binding.entry.name)
  if (!def) return
  registerMcpTool(
    server,
    registry,
    binding.entry,
    def,
    invocationName,
    ctx,
    binding.aliasFor,
    requireActionPolicy,
    budgetBytes,
  )
  // A canonical eager tool also advertises its deprecated aliases, matching the
  // pre-disclosure behavior for the tools that remain resident.
  if (!binding.aliasFor) {
    for (const alias of binding.entry.aliases) {
      registerMcpTool(
        server,
        registry,
        binding.entry,
        def,
        alias,
        ctx,
        binding.entry.name,
        requireActionPolicy,
        budgetBytes,
      )
    }
  }
}

/** The `params.name` of a `tools/call` request, or undefined for any other method. */
function requestedToolName(request: Record<string, unknown> | undefined): string | undefined {
  if (request?.method !== "tools/call") return undefined
  const name = asRecord(request.params)?.name
  return typeof name === "string" ? name : undefined
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
  surface: AuthorizedSurface,
  projection: ReadProjection,
  guideToolNames: ReadonlySet<string>,
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
    // A meta-tool call (`search_tools` / `describe_tool` / `call_tool`) is a
    // known invocation with no write; a domain name resolves through `surface`.
    // `call_tool` additionally emits an event for the tool it dispatches.
    //
    // Guide Tools are registered directly on the server rather than through the
    // registry, so they carry no manifest entry — mark them known reads instead of
    // misclassifying a legitimate guide call as an unknown-tool miss, which is one
    // of the highest-signal events we record.
    // A `<domain>_query` tool is a known read that carries no manifest entry; a
    // folded flat read name is not a known invocation any longer.
    const queryTool = projection.queryToolFor(name)
    const entry =
      queryTool || projection.hiddenReadNames.has(name) ? undefined : surface.get(name)?.entry
    const known =
      entry !== undefined ||
      queryTool !== undefined ||
      META_TOOL_NAMES.includes(name) ||
      guideToolNames.has(name)
    // A folded read called by its flat name is not an unknown tool: it exists,
    // the caller is authorized, and discovery moved it. Counting it as a miss
    // buried the one outcome that is a defect rather than caller error.
    const folded = surface.has(name) && projection.hiddenReadNames.has(name)
    const { outcome, code } = folded
      ? { outcome: "unreachable" as const, code: undefined }
      : classifyToolCallResult(payload, known)
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
    ...(options.responseBudgetBytes !== undefined
      ? { responseBudgetBytes: options.responseBudgetBytes }
      : {}),
    ...(options.rateLimit !== undefined ? { rateLimit: options.rateLimit } : {}),
    buildContext: (c) => buildContributedContext(c, options, contributions.values()),
  })
}
