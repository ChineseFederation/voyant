/**
 * Public option and identity types for the MCP transport. They live apart from
 * `server.ts` so the composition, authorization, and dispatch modules can share
 * them without importing the route factories back.
 */
import type { VoyantGraphRuntime } from "@voyant-travel/framework/runtime-attestation"
import type { Reporter } from "@voyant-travel/hono/observability"
import type { ToolContext, ToolRegistry } from "@voyant-travel/tools"
import type { AccessCatalog } from "@voyant-travel/types/api-keys"
import type { Context } from "hono"

import type { McpRateLimitOptions } from "./rate-limit.js"

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
  /**
   * Canonical names of domain tools to register eagerly in tier 0 alongside the
   * meta-tools (voyant#3927). Defaults to none: the domain surface is discovered
   * on demand through `search_tools` / `describe_tool` / `call_tool` until the
   * guide / workflow / domain-query tiers land and opt specific tools in.
   */
  eagerToolNames?: readonly string[]
  /** Observability sink for MCP transport telemetry (RFC #1553). Defaults to no-op. */
  reporter?: Reporter
  /** Logical app name stamped on emitted telemetry events. Defaults to `"voyant"`. */
  appName?: string
  /**
   * Serialized byte ceiling for a single tool response (voyant#3928). A
   * list-shaped result over this budget is row-truncated with guidance;
   * defaults to `DEFAULT_RESPONSE_BUDGET_BYTES` (~24 KB).
   */
  responseBudgetBytes?: number
  /**
   * Per-key rate limiting for the JSON-RPC endpoint. Enabled with safe defaults
   * (see {@link McpRateLimitOptions}); pass `false` to disable, or an object to
   * tune the window, limits, key derivation, or backing store.
   */
  rateLimit?: McpRateLimitOptions | false
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
  /** Observability sink for MCP transport telemetry (RFC #1553). Defaults to no-op. */
  reporter?: Reporter
  /** Logical app name stamped on emitted telemetry events. Defaults to `"voyant"`. */
  appName?: string
  /** Serialized byte ceiling for a single tool response (voyant#3928). */
  responseBudgetBytes?: number
  /** Per-key rate limiting for the JSON-RPC endpoint. See {@link McpApiRoutesOptions.rateLimit}. */
  rateLimit?: McpRateLimitOptions | false
}

export type GraphMcpRuntime = VoyantGraphRuntime
