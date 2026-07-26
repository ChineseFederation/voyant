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
 * Authorization (D2): each tool's `requiredScopes` are checked against the
 * caller's granted scopes with **AND** semantics. Unauthorized tools are neither
 * listed nor registered on the per-request server, so they cannot be called.
 *
 * agent-quality: file-size exception -- intentional while the HTTP transport,
 * graph composition, and action-policy gate remain one reviewable security boundary (#3370).
 */
import { StreamableHTTPTransport } from "@hono/mcp"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import {
  assertVoyantGraphMcpRuntime,
  type VoyantGraphRuntime,
} from "@voyant-travel/framework/runtime-attestation"
import {
  createToolRegistry,
  TOOL_ACTION_INVOCATION_FIELD,
  TOOL_CONTEXT_CONTRIBUTION_EXPORT,
  TOOL_CONTRACT_VERSION,
  type ToolActionInvocationControl,
  type ToolActionPolicyBinding,
  type ToolContext,
  type ToolContextContribution,
  ToolError,
  type ToolManifestEntry,
  type ToolRegistry,
} from "@voyant-travel/tools"
import {
  type AccessCatalog,
  type ApiKeyPermissions,
  hasApiKeyPermission,
  permissionStringsToPermissions,
} from "@voyant-travel/types/api-keys"
import type { Context } from "hono"

export interface McpServerInfo {
  name: string
  version: string
}

export interface McpApiRoutesOptions {
  /** The tool registry to expose. */
  registry: ToolRegistry
  /** Build the per-request tool context from the Hono context (db/actor/audience/scope). */
  buildContext(c: Context): ToolContext | Promise<ToolContext>
  /** Selected graph authority for wildcard and explicit-action policy. */
  accessCatalog: AccessCatalog
  /** MCP server identity advertised in `initialize`. */
  serverInfo?: McpServerInfo
  /** Graph-composed hosts fail closed when a selected Tool has no selected action policy. */
  requireActionPolicies?: boolean
}

export interface GraphMcpApiRoutesOptions {
  runtime: unknown
  buildContext(c: Context): ToolContext
  buildResources?(c: Context): Readonly<Record<string, unknown>>
  /** Resources visible only to context contributors owned by the selected unit. */
  buildUnitResources?(unitId: string, c: Context): Readonly<Record<string, unknown>>
  /** Context keys supplied by the deployment while packages migrate to contributions. */
  providedContext?: readonly string[]
  serverInfo?: McpServerInfo
}

export type GraphMcpRuntime = VoyantGraphRuntime

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

  app.openapi(getManifestRoute, async (c) => {
    const permissions = callerPermissions(c)
    const ctx = await buildContext(c)
    const tools = registry
      .list()
      .filter((tool) => isAuthorized(tool, permissions, accessCatalog, ctx.audience))
    return c.json({ version: TOOL_CONTRACT_VERSION, serverInfo, tools })
  })

  app.openapi(callMcpRoute, async (c) => {
    const permissions = callerPermissions(c)
    const ctx = await buildContext(c)
    const server = new McpServer(serverInfo)

    for (const entry of registry.list()) {
      if (!isAuthorized(entry, permissions, accessCatalog, ctx.audience)) continue
      const def = registry.get(entry.name)
      if (!def) continue
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
    return (await transport.handleRequest(c)) ?? c.body(null, 204)
  })

  return app
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
    buildContext: (c) => buildContributedContext(c, options, contributions.values()),
  })
}

function indexActionsByTool(
  actions: NonNullable<GraphMcpRuntime["actions"]>,
): Map<string, ToolActionPolicyBinding> {
  const result = new Map<string, ToolActionPolicyBinding>()
  for (const action of actions) {
    if (action.availability?.status === "unavailable") continue
    const binding: ToolActionPolicyBinding = {
      id: action.id,
      capabilityId: action.capabilityId ?? action.id,
      version: action.version,
      kind: action.kind,
      targetType: action.targetType,
      ...(action.commandTargetField ? { commandTargetField: action.commandTargetField } : {}),
      ...(action.targetLifecycle ? { targetLifecycle: action.targetLifecycle } : {}),
      ...(action.existingTarget ? { existingTarget: action.existingTarget } : {}),
      ...(action.createdTarget ? { createdTarget: action.createdTarget } : {}),
      risk: action.risk,
      ledger: action.ledger,
      approval: action.approval ?? "never",
      ...(action.policy ? { policy: action.policy } : {}),
      ...(action.reversible !== undefined ? { reversible: action.reversible } : {}),
      ...(action.allowedActorTypes ? { allowedActorTypes: action.allowedActorTypes } : {}),
    }
    for (const toolId of action.from?.tools ?? []) {
      if (result.has(toolId)) {
        throw new Error(`Selected MCP Tool capability "${toolId}" maps to multiple graph actions.`)
      }
      result.set(toolId, binding)
    }
  }
  return result
}

async function buildContributedContext(
  c: Context,
  options: GraphMcpApiRoutesOptions,
  contributions: Iterable<{ contribution: ToolContextContribution; unitId: string }>,
): Promise<ToolContext> {
  const base = await options.buildContext(c)
  const sharedResources = options.buildResources?.(c) ?? {}
  let context: ToolContext & Record<string, unknown> = base as ToolContext & Record<string, unknown>
  for (const { contribution, unitId } of contributions) {
    const resources = {
      ...sharedResources,
      ...(unitId ? options.buildUnitResources?.(unitId, c) : {}),
    }
    const contributed = await contribution.contribute({ request: c, context, resources })
    const undeclared = Object.keys(contributed).filter((key) => !contribution.context.includes(key))
    if (undeclared.length > 0) {
      throw new Error(
        `Tool context contribution returned undeclared keys: ${undeclared.sort().join(", ")}.`,
      )
    }
    context = {
      ...context,
      ...contributed,
    }
  }
  return context
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function assertToolContextContribution(
  value: unknown,
  importEntry: string,
): asserts value is ToolContextContribution {
  if (
    !isRecord(value) ||
    !Array.isArray(value.context) ||
    value.context.some((key) => typeof key !== "string" || key.length === 0) ||
    typeof value.contribute !== "function"
  ) {
    throw new Error(
      `MCP runtime entry "${importEntry}" exports an invalid ${TOOL_CONTEXT_CONTRIBUTION_EXPORT}.`,
    )
  }
}

/** Resolve the caller's granted permissions from `c.var.scopes`. */
function callerPermissions(c: Context): ApiKeyPermissions {
  const scopes = (c.var as { scopes?: string[] | null }).scopes ?? []
  return permissionStringsToPermissions(scopes)
}

/** AND semantics — the caller must hold every one of the tool's required scopes. */
function isAuthorized(
  tool: ToolManifestEntry,
  permissions: ApiKeyPermissions,
  accessCatalog: AccessCatalog,
  audience: ToolContext["audience"],
): boolean {
  if (tool.audience.allowed && !tool.audience.allowed.includes(audience)) return false
  return tool.requiredScopes.every((scope) => {
    const [resource, action] = scope.split(":")
    return Boolean(
      resource && action && hasApiKeyPermission(permissions, resource, action, accessCatalog),
    )
  })
}

function registerMcpTool(
  server: McpServer,
  registry: ToolRegistry,
  entry: ToolManifestEntry,
  def: NonNullable<ReturnType<ToolRegistry["get"]>>,
  invocationName: string,
  ctx: ToolContext,
  aliasFor?: string,
  requireActionPolicy = false,
): void {
  const output = toMcpOutputContract(def.outputSchema)
  server.registerTool(
    invocationName,
    {
      description: entry.description,
      inputSchema: toMcpInputSchema(def.inputSchema, entry),
      outputSchema: output.schema,
      annotations: entry.annotations,
      _meta: toMcpMeta(entry, aliasFor),
    },
    (args) =>
      dispatchToResult(
        registry,
        invocationName,
        entry,
        args,
        ctx,
        requireActionPolicy,
        output.envelopeResult,
      ),
  )
}

function toMcpMeta(entry: ToolManifestEntry, aliasFor?: string): Record<string, unknown> {
  return {
    "voyant.travel/tool": {
      contractVersion: TOOL_CONTRACT_VERSION,
      capabilityId: entry.capabilityId,
      owner: entry.owner,
      capabilityVersion: entry.capabilityVersion,
      canonicalName: entry.name,
      aliases: entry.aliases,
      ...(aliasFor ? { aliasFor } : {}),
      ...(entry.deprecation ? { deprecation: entry.deprecation } : {}),
      requiredScopes: entry.requiredScopes,
      audience: entry.audience,
      deploymentRisk: entry.deploymentRisk,
      tier: entry.tier,
      riskPolicy: entry.riskPolicy,
      ...(entry.actionPolicy ? { actionPolicy: entry.actionPolicy } : {}),
    },
  }
}

interface McpOutputContract {
  schema: z.ZodType
  envelopeResult: boolean
}

const actionInvocationFields = {
  confirmed: z.boolean().optional(),
  requestId: z.uuid().optional(),
  approvalId: z.string().trim().min(1).optional(),
  reasonCode: z.string().trim().min(1).optional(),
  // Compatibility fields used by handler-owned policies and generic actions
  // that have not yet declared server-owned target resolution.
  targetId: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(1).max(255).optional(),
  idempotencyFingerprint: z.string().trim().min(1).optional(),
} satisfies z.ZodRawShape

type ZodCompositionDef = {
  type?: string
  innerType?: unknown
  in?: unknown
  out?: unknown
  left?: unknown
  right?: unknown
}

/**
 * The MCP SDK validates complete Zod schemas, but its discovery serializer only
 * recognizes a direct object. Normalize object-bearing intersections,
 * pipes/effects, and wrappers into one loose object for transport discovery and
 * argument preservation. The registry still validates the untouched domain
 * schema before dispatch, including cross-field refinements and transforms.
 *
 * Date nodes are projected to JSON-Schema-safe datetime strings so `tools/list`
 * does not fail closed when a domain Tool reuses `z.date()` / `z.coerce.date()`.
 * Wire clients send ISO strings; before registry dispatch those strings are
 * revived to `Date` wherever the domain schema expects a date node.
 */
function toMcpInputSchema(schema: z.ZodType, entry: ToolManifestEntry): z.ZodObject {
  const shape =
    schema instanceof z.ZodObject
      ? schema.shape
      : Object.assign({}, ...collectInputObjectShapes(schema))
  const projectedShape = projectShapeForMcpDiscovery(shape)
  if (!entry.actionPolicy) {
    return z.looseObject(projectedShape)
  }
  if (TOOL_ACTION_INVOCATION_FIELD in projectedShape) {
    throw new Error(
      `Tool "${entry.name}" input conflicts with reserved action metadata field "${TOOL_ACTION_INVOCATION_FIELD}".`,
    )
  }
  return z.looseObject({
    ...projectedShape,
    [TOOL_ACTION_INVOCATION_FIELD]: actionInvocationSchemaFor(entry).optional(),
  })
}

const mcpDateTimeSchema = z.iso.datetime({ offset: true })

function projectShapeForMcpDiscovery(shape: z.ZodRawShape): z.ZodRawShape {
  return Object.fromEntries(
    Object.entries(shape).map(([key, value]) => [
      key,
      projectSchemaForMcpDiscovery(value as z.ZodType),
    ]),
  )
}

function projectSchemaForMcpDiscovery(schema: z.ZodType): z.ZodType {
  try {
    z.toJSONSchema(schema)
    return schema
  } catch {
    return projectUnrepresentableSchema(schema)
  }
}

type ZodDiscoveryDef = ZodCompositionDef & {
  coerce?: boolean
  options?: unknown[]
  shape?: z.ZodRawShape | (() => z.ZodRawShape)
  defaultValue?: unknown
}

function projectUnrepresentableSchema(schema: z.ZodType): z.ZodType {
  const def = (schema as { _zod?: { def?: ZodDiscoveryDef } })._zod?.def
  switch (def?.type) {
    case "date":
      return mcpDateTimeSchema
    case "optional":
      return projectSchemaForMcpDiscovery(def.innerType as z.ZodType).optional()
    case "nullable":
      return projectSchemaForMcpDiscovery(def.innerType as z.ZodType).nullable()
    case "default": {
      const inner = projectSchemaForMcpDiscovery(def.innerType as z.ZodType)
      return def.defaultValue === undefined ? inner : inner.default(def.defaultValue as never)
    }
    case "catch":
    case "nonoptional":
    case "readonly":
      return projectSchemaForMcpDiscovery(def.innerType as z.ZodType)
    case "object": {
      const shape = typeof def.shape === "function" ? def.shape() : (def.shape ?? {})
      return z.looseObject(projectShapeForMcpDiscovery(shape))
    }
    case "union": {
      const options = (def.options ?? []).map((option) =>
        projectSchemaForMcpDiscovery(option as z.ZodType),
      )
      if (options.length === 0) return z.unknown()
      if (options.length === 1) return options[0]!
      return z.union(options as [z.ZodType, z.ZodType, ...z.ZodType[]])
    }
    case "intersection":
      return projectSchemaForMcpDiscovery(def.left as z.ZodType).and(
        projectSchemaForMcpDiscovery(def.right as z.ZodType),
      )
    case "pipe":
      return projectSchemaForMcpDiscovery((def.in ?? def.out) as z.ZodType)
    default:
      return z.unknown()
  }
}

function actionInvocationSchemaFor(entry: ToolManifestEntry): z.ZodObject {
  const fields = new Set([
    ...(entry.actionPolicy?.invocation.requiredFields ?? []),
    ...(entry.actionPolicy?.invocation.optionalFields ?? []),
  ])
  return z.strictObject(
    Object.fromEntries(
      Object.entries(actionInvocationFields).filter(([field]) =>
        fields.has(field as keyof typeof actionInvocationFields),
      ),
    ) as z.ZodRawShape,
  )
}

function collectInputObjectShapes(schema: unknown, seen = new Set<unknown>()): z.ZodRawShape[] {
  if (!schema || seen.has(schema)) return []
  seen.add(schema)
  if (schema instanceof z.ZodObject) return [schema.shape]

  const def = (schema as { _zod?: { def?: ZodCompositionDef } })._zod?.def
  switch (def?.type) {
    case "intersection":
      return [
        ...collectInputObjectShapes(def.left, seen),
        ...collectInputObjectShapes(def.right, seen),
      ]
    case "pipe":
      return [...collectInputObjectShapes(def.in, seen), ...collectInputObjectShapes(def.out, seen)]
    case "catch":
    case "default":
    case "nonoptional":
    case "nullable":
    case "optional":
    case "readonly":
      return collectInputObjectShapes(def.innerType, seen)
    default:
      return []
  }
}

/**
 * MCP structured output must have an object root. Decide once whether the
 * domain value needs a `{ result }` envelope, then use that same decision for
 * both the advertised schema and the returned structured content.
 */
function toMcpOutputContract(schema: z.ZodType): McpOutputContract {
  try {
    const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>
    if (jsonSchema.type === "object") return { schema, envelopeResult: false }
    return { schema: z.object({ result: schema }), envelopeResult: true }
  } catch {
    // The custom manifest labels this runtime-only schema. MCP still requires a
    // serializable object output schema, so preserve the value in an explicit
    // permissive result envelope.
    return { schema: z.object({ result: z.unknown() }), envelopeResult: true }
  }
}

/**
 * MCP discovery advertises dates as ISO strings. Revive those strings back to
 * `Date` before the registry validates the domain schema, including plain
 * `z.date()` fields that reject strings.
 */
function reviveDateInputs(schema: z.ZodType, value: unknown): unknown {
  if (value === undefined || value === null) return value
  const def = (schema as { _zod?: { def?: ZodDiscoveryDef & { element?: unknown } } })._zod?.def
  switch (def?.type) {
    case "date": {
      if (typeof value !== "string") return value
      const parsed = new Date(value)
      return Number.isNaN(parsed.getTime()) ? value : parsed
    }
    case "optional":
    case "nullable":
    case "default":
    case "catch":
    case "nonoptional":
    case "readonly":
      return reviveDateInputs(def.innerType as z.ZodType, value)
    case "object": {
      if (!isRecord(value)) return value
      const shape = typeof def.shape === "function" ? def.shape() : (def.shape ?? {})
      const next: Record<string, unknown> = { ...value }
      for (const [key, field] of Object.entries(shape)) {
        if (Object.hasOwn(next, key)) {
          next[key] = reviveDateInputs(field as z.ZodType, next[key])
        }
      }
      return next
    }
    case "array": {
      if (!Array.isArray(value) || !def.element) return value
      return value.map((item) => reviveDateInputs(def.element as z.ZodType, item))
    }
    case "union": {
      if (typeof value === "string") {
        for (const option of def.options ?? []) {
          const optionDef = (option as { _zod?: { def?: ZodDiscoveryDef } })._zod?.def
          if (optionDef?.type === "date") {
            return reviveDateInputs(option as z.ZodType, value)
          }
        }
      }
      if (isRecord(value)) {
        for (const option of def.options ?? []) {
          const optionDef = (option as { _zod?: { def?: ZodDiscoveryDef } })._zod?.def
          if (optionDef?.type === "object" || optionDef?.type === "intersection") {
            return reviveDateInputs(option as z.ZodType, value)
          }
        }
      }
      return value
    }
    case "intersection":
      return reviveDateInputs(
        def.right as z.ZodType,
        reviveDateInputs(def.left as z.ZodType, value),
      )
    case "pipe":
      return reviveDateInputs((def.in ?? def.out) as z.ZodType, value)
    default:
      return value
  }
}

/** Dispatch through the registry (validates in + out) and wrap pure data in an MCP envelope. */
async function dispatchToResult(
  registry: ToolRegistry,
  name: string,
  entry: ToolManifestEntry,
  args: unknown,
  ctx: ToolContext,
  requireActionPolicy: boolean,
  envelopeResult: boolean,
): Promise<CallToolResult> {
  try {
    const { commandInput, invocation } = entry.actionPolicy
      ? splitInvocation(args, entry)
      : { commandInput: args, invocation: {} }
    if (requireActionPolicy && !entry.actionPolicy && entry.deploymentRisk !== "low") {
      throw new ToolError(
        `Tool "${entry.name}" has no selected graph action policy.`,
        "ACTION_POLICY_REQUIRED",
        { capabilityId: entry.capabilityId },
      )
    }
    const domainInputSchema = registry.get(name)?.inputSchema
    const revivedCommandInput =
      domainInputSchema === undefined
        ? commandInput
        : reviveDateInputs(domainInputSchema, commandInput)
    const baseDispatchContext = withoutHandlerActionPolicy(ctx)
    const dispatch = (dispatchContext: ToolContext = baseDispatchContext) =>
      registry.dispatch(name, revivedCommandInput, dispatchContext)
    if (
      entry.actionPolicy?.enforcement === "handler" &&
      entry.actionPolicy.invocation.requiredFields.includes("confirmed") &&
      invocation.confirmed !== true
    ) {
      throw new ToolError(
        "This Tool requires explicit confirmation before handler-owned policy dispatch.",
        "CONFIRMATION_REQUIRED",
        { capabilityId: entry.capabilityId },
      )
    }
    const data =
      entry.actionPolicy?.enforcement === "generic"
        ? await dispatchGenericAction({
            registry,
            invocationName: name,
            entry,
            commandInput: revivedCommandInput,
            invocation,
            context: ctx,
          })
        : await dispatch(
            entry.actionPolicy?.enforcement === "handler"
              ? handlerDispatchContext(baseDispatchContext, entry, invocation)
              : baseDispatchContext,
          )
    return {
      content: [{ type: "text", text: safeStringify(data) }],
      structuredContent: toStructuredContent(data, envelopeResult),
    }
  } catch (err) {
    const code = err instanceof ToolError ? err.code : "PROVIDER_ERROR"
    const message = err instanceof Error ? err.message : String(err)
    const error = {
      contractVersion: TOOL_CONTRACT_VERSION,
      code,
      message,
      ...(err instanceof ToolError && err.meta ? { meta: err.meta } : {}),
    }
    return {
      isError: true,
      content: [{ type: "text", text: `[${code}] ${message}` }],
      _meta: { "voyant.travel/error": error },
    }
  }
}

async function dispatchGenericAction(input: {
  registry: ToolRegistry
  invocationName: string
  entry: ToolManifestEntry
  commandInput: unknown
  invocation: ToolActionInvocationControl
  context: ToolContext
}): Promise<unknown> {
  const actionPolicy = input.entry.actionPolicy
  if (actionPolicy?.enforcement !== "generic") {
    throw new ToolError(
      "Generic action dispatch requires a generic action policy.",
      "INVALID_INPUT",
    )
  }
  const dispatchContext = withoutHandlerActionPolicy(input.context)
  if (!actionPolicy.invocation.targetResolution) {
    return requireActionGate(input.context).execute(
      {
        capabilityId: input.entry.capabilityId,
        capabilityVersion: input.entry.capabilityVersion,
        canonicalName: input.entry.name,
        actionPolicy,
        commandInput: input.commandInput,
        invocation: input.invocation,
      },
      () => input.registry.dispatch(input.invocationName, input.commandInput, dispatchContext),
    )
  }
  const prepared = await input.registry.prepareAction(
    input.invocationName,
    input.commandInput,
    dispatchContext,
  )
  const needsTarget = actionPolicy.ledger === "required"
  const resolvedTargetId = prepared.resolvedTargetId
  if (needsTarget && !resolvedTargetId) {
    throw new ToolError(
      "This ledgered Tool has no valid server-owned action target; refusing dispatch.",
      "ACTION_POLICY_REQUIRED",
      {
        capabilityId: input.entry.capabilityId,
        targetResolution: actionPolicy.invocation.targetResolution ?? "missing",
      },
    )
  }
  return requireActionGate(input.context).execute(
    {
      capabilityId: input.entry.capabilityId,
      capabilityVersion: input.entry.capabilityVersion,
      canonicalName: input.entry.name,
      actionPolicy,
      commandInput: prepared.commandInput,
      invocation: input.invocation,
      ...(resolvedTargetId ? { resolvedTargetId } : {}),
    },
    () => input.registry.dispatchPrepared(prepared, dispatchContext),
  )
}

function withoutHandlerActionPolicy(context: ToolContext): ToolContext {
  if (!("handlerActionPolicy" in context)) return context
  const { handlerActionPolicy: _handlerActionPolicy, ...base } = context
  return base
}

function handlerDispatchContext(
  context: ToolContext,
  entry: ToolManifestEntry,
  invocation: ToolActionInvocationControl,
): ToolContext {
  const actionPolicy = entry.actionPolicy
  if (actionPolicy?.enforcement !== "handler") return context
  const handlerContext: ToolContext = {
    ...context,
    handlerActionPolicy: {
      capabilityId: entry.capabilityId,
      capabilityVersion: entry.capabilityVersion,
      canonicalName: entry.name,
      actionPolicy: {
        ...actionPolicy,
        ...(actionPolicy.existingTarget
          ? { existingTarget: { ...actionPolicy.existingTarget } }
          : {}),
        ...(actionPolicy.createdTarget ? { createdTarget: { ...actionPolicy.createdTarget } } : {}),
        ...(actionPolicy.allowedActorTypes
          ? { allowedActorTypes: [...actionPolicy.allowedActorTypes] }
          : {}),
        invocation: {
          ...actionPolicy.invocation,
          requiredFields: [...actionPolicy.invocation.requiredFields],
          optionalFields: [...actionPolicy.invocation.optionalFields],
        },
      },
      invocation: { ...invocation },
    },
  }
  return handlerContext
}

function toStructuredContent(data: unknown, envelopeResult: boolean): Record<string, unknown> {
  if (envelopeResult) return { result: data }
  if (isRecord(data)) return data
  throw new ToolError(
    "MCP object output did not produce object structured content.",
    "INVALID_OUTPUT",
  )
}

function splitInvocation(
  args: unknown,
  entry: ToolManifestEntry,
): {
  commandInput: unknown
  invocation: ToolActionInvocationControl
} {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return { commandInput: args, invocation: {} }
  }
  const { [TOOL_ACTION_INVOCATION_FIELD]: rawInvocation, ...commandInput } = args as Record<
    string,
    unknown
  >
  const parsed = actionInvocationSchemaFor(entry).safeParse(rawInvocation ?? {})
  if (!parsed.success) {
    throw new ToolError("Invalid Voyant action invocation metadata.", "INVALID_INPUT", {
      issues: parsed.error.issues,
    })
  }
  return { commandInput, invocation: parsed.data }
}

function requireActionGate(ctx: ToolContext) {
  if (!ctx.toolActionPolicy) {
    throw new ToolError(
      "The selected action-policy gate is unavailable; refusing Tool dispatch.",
      "ACTION_POLICY_REQUIRED",
    )
  }
  return ctx.toolActionPolicy
}

function safeStringify(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}
