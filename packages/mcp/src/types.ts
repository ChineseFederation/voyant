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
  /** Observability sink for MCP transport telemetry (RFC #1553). Defaults to no-op. */
  reporter?: Reporter
  /** Logical app name stamped on emitted telemetry events. Defaults to `"voyant"`. */
  appName?: string
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
}

export type GraphMcpRuntime = VoyantGraphRuntime
