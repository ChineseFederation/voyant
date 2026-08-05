/**
 * Progressive disclosure (voyant#3927): the eager MCP surface is a small tier-0
 * of meta-tools; the long tail of domain tools is discovered and dispatched on
 * demand instead of being serialized into every `tools/list`. Today that eager
 * domain surface is empty — the guide (W7), workflow (W9), and consolidated
 * domain-query (W8) tiers that #3921 wants resident do not exist yet — so
 * `tools/list` carries only the three meta-tools below.
 *
 * - `search_tools(query, domain)` → names + one-line descriptions (NOT schemas).
 * - `describe_tool(name)` → the full advertised descriptor for one tool.
 * - `call_tool(name, args)` → dispatch a tool that is not eagerly registered.
 *
 * Every meta-tool re-checks authorization against the SAME scope/audience
 * filtered surface the transport built, so an unauthorized tool is neither
 * discoverable (search / describe) nor callable (call). That re-check is the
 * security property of the whole server: with per-tool registration gone, the
 * index layer and the dispatch layer must each prune, not just the register loop.
 */
import { z } from "@hono/zod-openapi"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import {
  type ToolContext,
  ToolError,
  type ToolManifestEntry,
  type ToolRegistry,
} from "@voyant-travel/tools"
import type { AccessCatalog, ApiKeyPermissions } from "@voyant-travel/types/api-keys"
import { isAuthorized } from "./authorization.js"
import { dispatchToResult, toErrorResult } from "./dispatch.js"
import { isRecord } from "./guards.js"
import type { McpCaller, McpCallOutcome, McpObserver } from "./observability.js"
import {
  advertiseQueryTool,
  dispatchQueryTool,
  hasQueryResource,
  queryToolDescription,
  type ReadProjection,
  toolDomain,
} from "./read-projection.js"
import { toMcpMeta } from "./register.js"
import { DEFAULT_RESPONSE_BUDGET_BYTES, isListShapedOutput } from "./response-budget.js"
import { toMcpInputSchema, toMcpOutputContract } from "./schema-projection.js"

export { toolDomain } from "./read-projection.js"

/** The eager tier-0 meta-tool names, reserved so a domain tool can never shadow one. */
export const SEARCH_TOOLS_NAME = "search_tools"
export const DESCRIBE_TOOL_NAME = "describe_tool"
export const CALL_TOOL_NAME = "call_tool"
export const META_TOOL_NAMES: readonly string[] = [
  SEARCH_TOOLS_NAME,
  DESCRIBE_TOOL_NAME,
  CALL_TOOL_NAME,
]

/** Default and maximum number of hits `search_tools` returns in one call. */
const DEFAULT_SEARCH_LIMIT = 25
const MAX_SEARCH_LIMIT = 50

const DISPATCH_ERROR_META_KEY = "voyant.travel/error"

/** One authorized invocation name → its manifest entry (canonical or alias). */
export interface AuthorizedTool {
  entry: ToolManifestEntry
  /** Canonical name when this binding is an alias; undefined for the canonical name. */
  aliasFor?: string
}

export type AuthorizedSurface = ReadonlyMap<string, AuthorizedTool>

/**
 * Build the caller's authorized surface: every invocation name (canonical and
 * alias) the scope/audience filter admits, mapped to its manifest entry. This is
 * the single source of truth the meta-tools and flat-name dispatch consult, so a
 * tool absent here is unreachable by any path.
 */
export function collectAuthorizedTools(
  registry: ToolRegistry,
  permissions: ApiKeyPermissions,
  accessCatalog: AccessCatalog,
  audience: ToolContext["audience"],
): Map<string, AuthorizedTool> {
  const surface = new Map<string, AuthorizedTool>()
  for (const entry of registry.list()) {
    if (!isAuthorized(entry, permissions, accessCatalog, audience)) continue
    if (!registry.get(entry.name)) continue
    surface.set(entry.name, { entry })
    for (const alias of entry.aliases) surface.set(alias, { entry, aliasFor: entry.name })
  }
  return surface
}

/**
 * Choose the tier-0 domain tools to register eagerly. The mechanism is
 * deployment-driven: `eagerToolNames` promotes specific tools (canonical names)
 * into the resident surface. It defaults to empty, which — until the guide /
 * workflow / domain-query tiers land — keeps `tools/list` at just the meta-tools.
 */
export function selectEagerToolNames(
  surface: AuthorizedSurface,
  eagerToolNames: readonly string[] | undefined,
): Set<string> {
  const eager = new Set<string>()
  for (const name of eagerToolNames ?? []) {
    const binding = surface.get(name)
    // Only promote canonical names; aliases follow their canonical registration.
    if (binding && !binding.aliasFor) eager.add(name)
  }
  return eager
}

/**
 * The descriptor a caller would have seen in `tools/list` for one tool: name,
 * description, the projected input schema, the output contract, annotations, and
 * the `voyant.travel/tool` discovery metadata. `describe_tool` returns this so an
 * agent recovers the full schema it needs to call a lazy tool.
 */
export function advertiseTool(
  registry: ToolRegistry,
  entry: ToolManifestEntry,
  invocationName: string,
  aliasFor?: string,
): Record<string, unknown> {
  const def = registry.get(entry.name)
  if (!def) {
    throw new ToolError(`Tool "${invocationName}" is not registered.`, "NOT_FOUND")
  }
  const inputSchema = z.toJSONSchema(
    toMcpInputSchema(def.inputSchema, entry, isListShapedOutput(def.outputSchema)),
    {
      io: "input",
      unrepresentable: "any",
    },
  )
  const output = toMcpOutputContract(def.outputSchema)
  const outputSchema = z.toJSONSchema(output.schema, { unrepresentable: "any" })
  return {
    name: invocationName,
    description: entry.description,
    inputSchema,
    outputSchema,
    annotations: entry.annotations,
    _meta: toMcpMeta(entry, aliasFor),
  }
}

export interface RegisterMetaToolsInput {
  server: McpServer
  registry: ToolRegistry
  surface: AuthorizedSurface
  /** The read projection: per-domain query tools that stand in for the flat reads. */
  projection: ReadProjection
  ctx: ToolContext
  requireActionPolicy: boolean
  observer: McpObserver
  caller: McpCaller
  now: () => number
  /** Serialized response byte budget applied to every dispatched tool result. */
  budgetBytes?: number
}

/** Register the three tier-0 meta-tools on the per-request server. */
export function registerMetaTools(input: RegisterMetaToolsInput): void {
  registerSearchTools(input)
  registerDescribeTool(input)
  registerCallTool(input)
}

function registerSearchTools({ server, surface, projection }: RegisterMetaToolsInput): void {
  server.registerTool(
    SEARCH_TOOLS_NAME,
    {
      description:
        "Find tools by keyword and/or domain. Reads are grouped into one " +
        "`<domain>_query` tool per product area — search for the record you want " +
        "(e.g. `products`, `bookings`) to find its query tool. Returns names and " +
        "one-line descriptions only — call describe_tool for a tool's full input " +
        "schema, then call_tool (or the flat tool name) to run it.",
      inputSchema: z.object({
        query: z.string().trim().optional(),
        domain: z.string().trim().optional(),
        limit: z.number().int().min(1).max(MAX_SEARCH_LIMIT).optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => searchTools(surface, projection, args),
  )
}

interface SearchCandidate {
  name: string
  description: string
  domain: string
  tier: string
  /** Extra identity terms (a query tool's resource names) that rank like the name. */
  keywords?: readonly string[]
}

/**
 * The discoverable surface: the per-domain query tools plus every non-read tool.
 * The flat reads are folded into their query tool, so they never appear here.
 */
function discoverableCandidates(
  surface: AuthorizedSurface,
  projection: ReadProjection,
): SearchCandidate[] {
  const candidates: SearchCandidate[] = []
  for (const queryTool of projection.queryTools.values()) {
    candidates.push({
      name: queryTool.name,
      description: queryToolDescription(queryTool),
      domain: queryTool.domain,
      tier: "read",
      // A query tool is named `<domain>_query`, so a search for the record noun
      // (`products`, `booking`) would only hit its description and rank below the
      // write tools that carry the noun in their name. Rank it by its resources so
      // the noun surfaces the read entry point, not a wall of writes.
      keywords: queryTool.resources.map((member) => member.resource),
    })
  }
  for (const [name, { entry, aliasFor }] of surface) {
    if (aliasFor) continue
    if (projection.hiddenReadNames.has(name)) continue
    candidates.push({
      name,
      description: entry.description,
      domain: toolDomain(entry),
      tier: entry.tier,
    })
  }
  return candidates
}

function searchTools(
  surface: AuthorizedSurface,
  projection: ReadProjection,
  args: { query?: string; domain?: string; limit?: number },
): CallToolResult {
  const query = args.query?.toLowerCase().trim() ?? ""
  const terms = query.length > 0 ? query.split(/\s+/) : []
  const domain = args.domain?.toLowerCase().trim()
  const limit = Math.min(args.limit ?? DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT)

  const matches: Array<SearchCandidate & { score: number }> = []
  for (const candidate of discoverableCandidates(surface, projection)) {
    if (domain && candidate.domain.toLowerCase() !== domain) continue
    const haystack = `${candidate.name} ${candidate.description} ${candidate.domain}`.toLowerCase()
    if (terms.length > 0 && !terms.every((term) => haystack.includes(term))) continue
    matches.push({ ...candidate, score: scoreCandidate(candidate, terms) })
  }

  matches.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  const returned = matches.slice(0, limit)
  const payload = {
    total: matches.length,
    returned: returned.length,
    truncated: matches.length > returned.length,
    tools: returned.map(({ score: _score, ...tool }) => tool),
  }
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  }
}

/** Rank an exact/prefix name match above a substring match above a description-only hit. */
function scoreMatch(name: string, terms: readonly string[]): number {
  if (terms.length === 0) return 0
  const lowered = name.toLowerCase()
  if (terms.every((term) => lowered === term)) return 3
  if (terms.every((term) => lowered.includes(term))) return 2
  return 1
}

/**
 * Score a candidate by the best of its name and its identity keywords (a query
 * tool's resource names), so a search for a record noun ranks the query tool as
 * highly as a write tool that carries the noun in its own name.
 */
function scoreCandidate(candidate: SearchCandidate, terms: readonly string[]): number {
  let best = scoreMatch(candidate.name, terms)
  for (const keyword of candidate.keywords ?? []) {
    best = Math.max(best, scoreMatch(keyword, terms))
    if (best === 3) break
  }
  return best
}

function registerDescribeTool({
  server,
  registry,
  surface,
  projection,
}: RegisterMetaToolsInput): void {
  server.registerTool(
    DESCRIBE_TOOL_NAME,
    {
      description:
        "Return the full input schema, output contract, and metadata for one tool " +
        "by name. Use the names returned by search_tools. For a `<domain>_query` tool " +
        "the input schema is a discriminated union on `resource` — pass `resource` " +
        "here to get just that branch, which is far cheaper than the whole union.",
      inputSchema: z.object({
        name: z.string().trim().min(1),
        resource: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            "For a `<domain>_query` tool: narrow the returned input schema to this " +
              "one resource. The resource names are listed in the tool's description.",
          ),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => describeTool(registry, surface, projection, args.name, args.resource),
  )
}

function describeTool(
  registry: ToolRegistry,
  surface: AuthorizedSurface,
  projection: ReadProjection,
  name: string,
  resource?: string,
): CallToolResult {
  const queryTool = projection.queryToolFor(name)
  if (queryTool) {
    // Fail closed on an unknown resource rather than advertising an empty union,
    // and hand back the valid names so the retry is one step, not a re-discovery.
    if (resource !== undefined && !hasQueryResource(queryTool, resource)) {
      return errorResult(
        new ToolError(
          `${name} has no resource "${resource}".`,
          "NOT_FOUND",
          undefined,
          undefined,
          // `candidates` is the 5th `details` arg, not `meta` — only the former
          // reaches the MCP error envelope (dispatch.ts lifts it out of the
          // ToolError, not out of meta).
          { candidates: queryTool.resources.map((member) => member.resource) },
        ),
      )
    }
    try {
      const descriptor = advertiseQueryTool(registry, queryTool, resource)
      // A query tool's descriptor is the union of every resource's schema — the
      // largest describe payload on the surface. Carry it once, in
      // `structuredContent`, and keep the human-readable `content` channel a short
      // pointer rather than a second pretty-printed copy (voyant#3932); the doubled
      // copy was the single biggest line in the discovery bill.
      const resources = queryTool.resources.map((member) => member.resource).join(", ")
      const text =
        resource === undefined
          ? `${queryTool.name}: set "resource" to one of ${resources}. Full schema in ` +
            `structuredContent — re-describe with {"resource": "<one of these>"} for just ` +
            "that resource's schema."
          : `${queryTool.name} resource "${resource}": schema in structuredContent.`
      return {
        content: [{ type: "text", text }],
        structuredContent: descriptor,
      }
    } catch (err) {
      return errorResult(err)
    }
  }
  const binding = surface.get(name)
  // A flat read name is folded into its query tool and no longer describable.
  if (!binding || projection.hiddenReadNames.has(name)) return unknownToolResult(name)
  try {
    const descriptor = advertiseTool(registry, binding.entry, name, binding.aliasFor)
    return {
      content: [{ type: "text", text: JSON.stringify(descriptor, null, 2) }],
      structuredContent: descriptor,
    }
  } catch (err) {
    return errorResult(err)
  }
}

function registerCallTool(input: RegisterMetaToolsInput): void {
  const { server, registry, surface, projection, ctx, requireActionPolicy, observer, caller, now } =
    input
  const budgetBytes = input.budgetBytes ?? DEFAULT_RESPONSE_BUDGET_BYTES
  server.registerTool(
    CALL_TOOL_NAME,
    {
      description:
        "Dispatch a tool discovered through search_tools / describe_tool. Pass the " +
        "tool name and its arguments object; the result is the underlying tool's " +
        "result. For a `<domain>_query` tool, include `resource` in the arguments.",
      inputSchema: z.object({
        name: z.string().trim().min(1),
        arguments: z.record(z.string(), z.unknown()).optional(),
      }),
      annotations: { openWorldHint: true },
    },
    async (args) => {
      // A query tool routes through the projection to the underlying read.
      const queryTool = projection.queryToolFor(args.name)
      if (queryTool) {
        const startedAt = now()
        const { result, member } = await dispatchQueryTool({
          registry,
          queryTool,
          args: args.arguments ?? {},
          ctx,
          requireActionPolicy,
          budgetBytes,
        })
        if (member) {
          const { outcome, code } = classifyDispatchResult(result)
          observer.toolCall({
            tool: member.entry.name,
            outcome,
            durationMs: now() - startedAt,
            write: false,
            ...(code ? { code } : {}),
            caller,
          })
        }
        return result
      }
      const binding = surface.get(args.name)
      // A flat read name is folded into its query tool and no longer callable.
      if (!binding || projection.hiddenReadNames.has(args.name)) return unknownToolResult(args.name)
      const def = registry.get(binding.entry.name)
      if (!def) return unknownToolResult(args.name)
      const output = toMcpOutputContract(def.outputSchema)
      const startedAt = now()
      const result = await dispatchToResult(
        registry,
        args.name,
        binding.entry,
        args.arguments ?? {},
        ctx,
        requireActionPolicy,
        output.envelopeResult,
        budgetBytes,
      )
      // Emit telemetry for the DISPATCHED tool, not the call_tool wrapper, so a
      // write routed through call_tool is as observable as a flat-name write.
      const { outcome, code } = classifyDispatchResult(result)
      observer.toolCall({
        tool: binding.entry.name,
        outcome,
        durationMs: now() - startedAt,
        write: binding.entry.annotations.readOnlyHint !== true,
        ...(code ? { code } : {}),
        caller,
      })
      return result
    },
  )
}

/** Classify a dispatched {@link CallToolResult} into an outcome + domain error code. */
function classifyDispatchResult(result: CallToolResult): {
  outcome: McpCallOutcome
  code?: string
} {
  if (result.isError !== true) return { outcome: "ok" }
  const meta = isRecord(result._meta) ? result._meta[DISPATCH_ERROR_META_KEY] : undefined
  const code = isRecord(meta) ? meta.code : undefined
  return typeof code === "string" && code.length > 0
    ? { outcome: "tool_error", code }
    : { outcome: "validation_error" }
}

/** The result for a name that is unknown OR filtered by the caller's scopes/audience. */
function unknownToolResult(name: string): CallToolResult {
  return errorResult(
    new ToolError(
      `Tool "${name}" is not available. It does not exist or your grant does not authorize it.`,
      "NOT_FOUND",
    ),
  )
}

/**
 * Meta-tool failures use the SAME envelope as dispatch. This used to be a
 * near-copy that dropped `candidates`, `didYouMean`, `meta` and
 * `contractVersion` — see {@link toErrorResult}.
 */
const errorResult = toErrorResult
