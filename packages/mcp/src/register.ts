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
import { DEFAULT_RESPONSE_BUDGET_BYTES, isListShapedOutput } from "./response-budget.js"
import { toMcpInputSchema, toMcpOutputContract } from "./schema-projection.js"
import { VOYANT_TOOL_META_KEY } from "./tool-meta.js"

export function registerMcpTool(
  server: McpServer,
  registry: ToolRegistry,
  entry: ToolManifestEntry,
  def: NonNullable<ReturnType<ToolRegistry["get"]>>,
  invocationName: string,
  ctx: ToolContext,
  aliasFor?: string,
  requireActionPolicy = false,
  budgetBytes: number = DEFAULT_RESPONSE_BUDGET_BYTES,
): void {
  const output = toMcpOutputContract(def.outputSchema)
  server.registerTool(
    invocationName,
    {
      description: entry.description,
      inputSchema: toMcpInputSchema(def.inputSchema, entry, isListShapedOutput(def.outputSchema)),
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
        budgetBytes,
      ),
  )
}

export function toMcpMeta(entry: ToolManifestEntry, aliasFor?: string): Record<string, unknown> {
  return {
    [VOYANT_TOOL_META_KEY]: {
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
