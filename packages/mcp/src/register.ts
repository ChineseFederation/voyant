/**
 * Registration of a single registry Tool onto a per-request `McpServer`,
 * including the `voyant.travel/tool` discovery metadata that carries capability
 * identity, scopes, risk, and action policy to remote consumers.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import {
  TOOL_CONTRACT_VERSION,
  type ToolContext,
  type ToolManifestEntry,
  type ToolRegistry,
} from "@voyant-travel/tools"

import { dispatchToResult } from "./dispatch.js"
import { toMcpInputSchema, toMcpOutputContract } from "./schema-projection.js"

export function registerMcpTool(
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

export function toMcpMeta(entry: ToolManifestEntry, aliasFor?: string): Record<string, unknown> {
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
