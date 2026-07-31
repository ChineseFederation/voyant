/**
 * Layered read projection (voyant#3932, RFC voyant#3921).
 *
 * A pure TRANSPORT-LAYER collapse of the ~133 fine-grained read tools
 * (`get_*` / `list_*` / `search_*`) into one `<domain>_query` tool per product
 * area. No domain `tools.ts` changes: `ToolManifestEntry` already carries the
 * `owner` a read belongs to, so grouping is mechanical.
 *
 * The shape is `inventory_query({ resource: "products", … })` — a discriminated
 * union on `resource`, where each resource is one former read tool. Discovery
 * (`search_tools` / `describe_tool`) sees the query tools instead of the reads;
 * dispatch (`call_tool` or a flat `tools/call`) routes `{ resource, …args }` to
 * the underlying read and dispatches it exactly as before.
 *
 * Why this cuts the agent's discovery bill: a real per-read `describe_tool` pays
 * that read's full output schema (a `get_booking` descriptor is ~12.7k tokens,
 * dominated by the Booking entity), and a broad `search_tools` returns dozens of
 * near-identical read names. A query tool advertises only the union of its
 * members' compact INPUT schemas plus a permissive output note, and a domain
 * clusters what used to be dozens of interchangeable verb-first hits into one.
 *
 * Writes are deliberately NOT collapsed — their per-action risk annotations,
 * confirmation requirements, ledger bindings and approval policy are
 * load-bearing and must stay one Tool each.
 *
 * Scope filtering prunes resources WITHIN a group: the projection is built from
 * the caller's already-authorized surface, so an unauthorized read is neither a
 * discoverable resource nor a routable one — exactly as a hidden flat tool was.
 */
import { z } from "@hono/zod-openapi"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import {
  TOOL_CONTRACT_VERSION,
  type ToolContext,
  ToolError,
  type ToolManifestEntry,
  type ToolRegistry,
} from "@voyant-travel/tools"

import { dispatchToResult } from "./dispatch.js"
import { isRecord } from "./guards.js"
import type { AuthorizedSurface } from "./meta-tools.js"
import { DEFAULT_RESPONSE_BUDGET_BYTES, isListShapedOutput } from "./response-budget.js"
import { toMcpInputSchema, toMcpOutputContract } from "./schema-projection.js"

/** Read verbs that collapse into a per-domain query tool. Matches the 133 reads. */
const READ_VERB = /^(?:get|list|search)_/

/** The suffix that names a collapsed per-domain read tool. */
const QUERY_SUFFIX = "_query"

/** True when a canonical tool name is a read (`get_*` / `list_*` / `search_*`). */
export function isReadToolName(name: string): boolean {
  return READ_VERB.test(name)
}

/** The domain slug a tool belongs to, derived from its owning package. */
export function toolDomain(entry: ToolManifestEntry): string {
  const owner = entry.owner ?? ""
  const withoutScope = owner.replace(/^@[^/]+\//, "")
  const base = withoutScope.split("#")[0] ?? withoutScope
  return base.length > 0 ? base : withoutScope
}

/** The resource discriminator for a read: its name with the leading verb removed. */
function resourceOf(name: string): string {
  return name.replace(READ_VERB, "")
}

/** One former read tool, reachable as a `resource` inside its domain's query tool. */
export interface QueryResource {
  resource: string
  /** The invocation name to dispatch (the read's canonical name). */
  invocationName: string
  entry: ToolManifestEntry
}

/** A collapsed per-domain read tool: `<domain>_query` over N authorized resources. */
export interface QueryTool {
  name: string
  domain: string
  resources: QueryResource[]
}

export interface ReadProjection {
  /** Query tool name (`<domain>_query`) → its resources. */
  readonly queryTools: ReadonlyMap<string, QueryTool>
  /** Canonical names of the reads folded away (hidden from flat discovery/dispatch). */
  readonly hiddenReadNames: ReadonlySet<string>
  queryToolFor(name: string): QueryTool | undefined
}

/**
 * Partition the authorized surface into per-domain query tools. Reads are grouped
 * by owning domain; every other tool (writes, lifecycle verbs, non-verb reads
 * like `echo`) is left untouched and stays individually discoverable and callable.
 */
export function buildReadProjection(surface: AuthorizedSurface): ReadProjection {
  const byDomain = new Map<string, QueryResource[]>()
  const hiddenReadNames = new Set<string>()
  for (const [invocationName, { entry, aliasFor }] of surface) {
    // Fold aliases into their canonical; only project the canonical read once.
    if (aliasFor) {
      if (isReadToolName(entry.name)) hiddenReadNames.add(invocationName)
      continue
    }
    if (!isReadToolName(entry.name)) continue
    hiddenReadNames.add(invocationName)
    const domain = toolDomain(entry)
    const resources = byDomain.get(domain) ?? []
    resources.push({ resource: resourceOf(entry.name), invocationName, entry })
    byDomain.set(domain, resources)
  }
  const queryTools = new Map<string, QueryTool>()
  for (const [domain, resources] of byDomain) {
    resources.sort((a, b) => a.resource.localeCompare(b.resource))
    const name = `${domain}${QUERY_SUFFIX}`
    queryTools.set(name, { name, domain, resources })
  }
  return {
    queryTools,
    hiddenReadNames,
    queryToolFor: (name) => queryTools.get(name),
  }
}

/**
 * The discriminated-union input schema advertised for a query tool: one object
 * branch per resource, each carrying `resource: <literal>` alongside that read's
 * projected input fields. The registry still validates the untouched domain
 * schema at dispatch, so this is a discovery projection, not the parse contract.
 */
export function queryToolInputSchema(registry: ToolRegistry, queryTool: QueryTool): z.ZodType {
  const branches: z.ZodObject[] = []
  for (const member of queryTool.resources) {
    const def = registry.get(member.entry.name)
    if (!def) continue
    const memberObject = toMcpInputSchema(
      def.inputSchema,
      member.entry,
      isListShapedOutput(def.outputSchema),
    )
    branches.push(
      z.object({
        resource: z.literal(member.resource).describe(member.entry.description),
        ...memberObject.shape,
      }),
    )
  }
  if (branches.length === 0) return z.object({ resource: z.string() })
  if (branches.length === 1) return branches[0]!
  return z.discriminatedUnion("resource", branches as [z.ZodObject, z.ZodObject, ...z.ZodObject[]])
}

/** A one-line, resource-listing description so keyword `search_tools` still matches. */
export function queryToolDescription(queryTool: QueryTool): string {
  const resources = queryTool.resources.map((member) => member.resource).join(", ")
  return (
    `Query ${queryTool.domain} read data. Set "resource" to the record you want and ` +
    `supply that resource's own arguments (this tool's input schema is a discriminated ` +
    `union on "resource"). Resources: ${resources}.`
  )
}

/**
 * MCP requires an object output root; a query tool's real result is the selected
 * resource's typed data, whose shape varies by resource. Advertise a permissive
 * object rather than a union of every member's output — dropping those per-read
 * output schemas is the bulk of the discovery-cost saving.
 */
const QUERY_OUTPUT_SCHEMA = {
  type: "object" as const,
  additionalProperties: true,
  description:
    "Shape depends on the selected resource; the fine-grained /manifest carries " +
    "each resource's output contract.",
}

/**
 * The descriptor `describe_tool` returns for a query tool — the discovery view an
 * agent needs to call it: the union input schema, a permissive output note,
 * read-only annotations, and per-resource scope metadata.
 */
export function advertiseQueryTool(
  registry: ToolRegistry,
  queryTool: QueryTool,
): Record<string, unknown> {
  const inputSchema = z.toJSONSchema(queryToolInputSchema(registry, queryTool), {
    io: "input",
    unrepresentable: "any",
  })
  return {
    name: queryTool.name,
    description: queryToolDescription(queryTool),
    inputSchema,
    outputSchema: QUERY_OUTPUT_SCHEMA,
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: {
      "voyant.travel/tool": {
        contractVersion: TOOL_CONTRACT_VERSION,
        kind: "read-query",
        domain: queryTool.domain,
        tier: "read",
        resources: queryTool.resources.map((member) => ({
          resource: member.resource,
          capabilityId: member.entry.capabilityId,
          requiredScopes: member.entry.requiredScopes,
        })),
      },
    },
  }
}

export interface DispatchQueryToolInput {
  registry: ToolRegistry
  queryTool: QueryTool
  args: unknown
  ctx: ToolContext
  requireActionPolicy: boolean
  budgetBytes?: number
}

/**
 * Route a query call to its resource and dispatch the underlying read. The
 * `resource` discriminator is transport-only — it is stripped before the registry
 * validates the untouched domain schema.
 */
export async function dispatchQueryTool(
  input: DispatchQueryToolInput,
): Promise<{ result: CallToolResult; member?: QueryResource }> {
  const { registry, queryTool, args, ctx, requireActionPolicy } = input
  const budgetBytes = input.budgetBytes ?? DEFAULT_RESPONSE_BUDGET_BYTES
  const record = isRecord(args) ? args : {}
  const resource = record.resource
  if (typeof resource !== "string" || resource.length === 0) {
    return { result: queryResourceError(queryTool, undefined) }
  }
  const member = queryTool.resources.find((candidate) => candidate.resource === resource)
  if (!member) return { result: queryResourceError(queryTool, resource) }
  const def = registry.get(member.entry.name)
  if (!def) return { result: queryResourceError(queryTool, resource) }
  const { resource: _resource, ...rest } = record
  const output = toMcpOutputContract(def.outputSchema)
  const result = await dispatchToResult(
    registry,
    member.invocationName,
    member.entry,
    rest,
    ctx,
    requireActionPolicy,
    output.envelopeResult,
    budgetBytes,
  )
  return { result, member }
}

/**
 * Register a synthetic `<domain>_query` tool for a flat-name `tools/call`. It is
 * not a registry Tool, so it carries a permissive `resource`-keyed input and its
 * handler routes to the underlying read through the projection; the read's own
 * domain schema still validates at dispatch. `describe_tool` advertises the rich
 * discriminated-union schema separately.
 */
export function registerQueryTool(
  server: McpServer,
  registry: ToolRegistry,
  queryTool: QueryTool,
  ctx: ToolContext,
  requireActionPolicy: boolean,
  budgetBytes: number,
): void {
  server.registerTool(
    queryTool.name,
    {
      description: `Query ${queryTool.domain} read data by \`resource\`.`,
      inputSchema: z.looseObject({ resource: z.string() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args): Promise<CallToolResult> => {
      const { result } = await dispatchQueryTool({
        registry,
        queryTool,
        args,
        ctx,
        requireActionPolicy,
        budgetBytes,
      })
      return result
    },
  )
}

/** A NOT_FOUND result naming the resources this query tool actually serves. */
function queryResourceError(queryTool: QueryTool, resource: string | undefined): CallToolResult {
  const available = queryTool.resources.map((member) => member.resource)
  const message =
    resource === undefined
      ? `${queryTool.name} requires a "resource" argument. Available: ${available.join(", ")}.`
      : `${queryTool.name} has no resource "${resource}". Available: ${available.join(", ")}.`
  const error = new ToolError(message, "NOT_FOUND", undefined, undefined, { candidates: available })
  return {
    isError: true,
    content: [{ type: "text", text: `[${error.code}] ${error.message}` }],
    _meta: {
      "voyant.travel/error": {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        nextSteps: error.nextSteps,
        candidates: available,
      },
    },
  }
}
