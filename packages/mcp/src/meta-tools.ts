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
import { dispatchToResult } from "./dispatch.js"
import { isRecord } from "./guards.js"
import type { McpCaller, McpCallOutcome, McpObserver } from "./observability.js"
import { toMcpMeta } from "./register.js"
import { toMcpInputSchema, toMcpOutputContract } from "./schema-projection.js"

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

/** The domain slug a tool belongs to, derived from its owning package. */
export function toolDomain(entry: ToolManifestEntry): string {
  const owner = entry.owner ?? ""
  const withoutScope = owner.replace(/^@[^/]+\//, "")
  const base = withoutScope.split("#")[0] ?? withoutScope
  return base.length > 0 ? base : withoutScope
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
  const inputSchema = z.toJSONSchema(toMcpInputSchema(def.inputSchema, entry), {
    io: "input",
    unrepresentable: "any",
  })
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
  ctx: ToolContext
  requireActionPolicy: boolean
  observer: McpObserver
  caller: McpCaller
  now: () => number
}

/** Register the three tier-0 meta-tools on the per-request server. */
export function registerMetaTools(input: RegisterMetaToolsInput): void {
  registerSearchTools(input)
  registerDescribeTool(input)
  registerCallTool(input)
}

function registerSearchTools({ server, surface }: RegisterMetaToolsInput): void {
  server.registerTool(
    SEARCH_TOOLS_NAME,
    {
      description:
        "Find domain tools by keyword and/or domain. Returns names and one-line " +
        "descriptions only — call describe_tool for a tool's full input schema, then " +
        "call_tool (or the flat tool name) to run it.",
      inputSchema: z.object({
        query: z.string().trim().optional(),
        domain: z.string().trim().optional(),
        limit: z.number().int().min(1).max(MAX_SEARCH_LIMIT).optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => searchTools(surface, args),
  )
}

function searchTools(
  surface: AuthorizedSurface,
  args: { query?: string; domain?: string; limit?: number },
): CallToolResult {
  const query = args.query?.toLowerCase().trim() ?? ""
  const terms = query.length > 0 ? query.split(/\s+/) : []
  const domain = args.domain?.toLowerCase().trim()
  const limit = Math.min(args.limit ?? DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT)

  const matches: Array<{
    name: string
    description: string
    domain: string
    tier: string
    score: number
  }> = []
  // Iterate canonical entries only; aliases are folded into their canonical name.
  for (const [name, { entry, aliasFor }] of surface) {
    if (aliasFor) continue
    const toolDomainSlug = toolDomain(entry)
    if (domain && toolDomainSlug.toLowerCase() !== domain) continue
    const haystack = `${name} ${entry.description} ${toolDomainSlug}`.toLowerCase()
    if (terms.length > 0 && !terms.every((term) => haystack.includes(term))) continue
    matches.push({
      name,
      description: entry.description,
      domain: toolDomainSlug,
      tier: entry.tier,
      score: scoreMatch(name, terms),
    })
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

function registerDescribeTool({ server, registry, surface }: RegisterMetaToolsInput): void {
  server.registerTool(
    DESCRIBE_TOOL_NAME,
    {
      description:
        "Return the full input schema, output contract, and metadata for one tool " +
        "by name. Use the names returned by search_tools.",
      inputSchema: z.object({ name: z.string().trim().min(1) }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => describeTool(registry, surface, args.name),
  )
}

function describeTool(
  registry: ToolRegistry,
  surface: AuthorizedSurface,
  name: string,
): CallToolResult {
  const binding = surface.get(name)
  if (!binding) return unknownToolResult(name)
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
  const { server, registry, surface, ctx, requireActionPolicy, observer, caller, now } = input
  server.registerTool(
    CALL_TOOL_NAME,
    {
      description:
        "Dispatch a tool discovered through search_tools / describe_tool. Pass the " +
        "tool name and its arguments object; the result is the underlying tool's result.",
      inputSchema: z.object({
        name: z.string().trim().min(1),
        arguments: z.record(z.string(), z.unknown()).optional(),
      }),
      annotations: { openWorldHint: true },
    },
    async (args) => {
      const binding = surface.get(args.name)
      if (!binding) return unknownToolResult(args.name)
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

function errorResult(err: unknown): CallToolResult {
  const toolError =
    err instanceof ToolError
      ? err
      : new ToolError(err instanceof Error ? err.message : String(err), "PROVIDER_ERROR")
  return {
    isError: true,
    content: [{ type: "text", text: `[${toolError.code}] ${toolError.message}` }],
    _meta: {
      [DISPATCH_ERROR_META_KEY]: {
        code: toolError.code,
        message: toolError.message,
        retryable: toolError.retryable,
        nextSteps: toolError.nextSteps,
      },
    },
  }
}
