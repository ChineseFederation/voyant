import type { ToolManifestEntry } from "@voyant-travel/tools"
import type { AccessCatalog } from "@voyant-travel/types/api-keys"

export const MCP_EXPOSURE_POLICY_ID = "default"

export const MCP_TOOL_RISKS = ["low", "medium", "high", "critical"] as const
export type McpToolRisk = (typeof MCP_TOOL_RISKS)[number]
export type McpToolOverride = "allow" | "deny"

export interface McpExposurePolicy {
  allowedRiskLevels: McpToolRisk[]
  allowWrites: boolean
  allowSensitiveData: boolean
  toolOverrides: Record<string, McpToolOverride>
}

export interface McpToolExposure {
  enabled: boolean
  sensitive: boolean
  remoteSafe: boolean
  reason:
    | "enabled"
    | "disabled-by-operator"
    | "explicit-enable-required"
    | "risk-not-allowed"
    | "sensitive-data-disabled"
    | "writes-disabled"
}

/** Safe-by-default policy used until an operator deliberately broadens MCP access. */
export const DEFAULT_MCP_EXPOSURE_POLICY: Readonly<McpExposurePolicy> = Object.freeze({
  allowedRiskLevels: ["low"],
  allowWrites: false,
  allowSensitiveData: false,
  toolOverrides: {},
} satisfies McpExposurePolicy)

export function normalizeMcpExposurePolicy(value: unknown): McpExposurePolicy {
  const record = asRecord(value)
  const requestedRisks = record?.allowedRiskLevels
  const allowedRiskLevels = Array.isArray(requestedRisks)
    ? MCP_TOOL_RISKS.filter((risk) => requestedRisks.includes(risk))
    : [...DEFAULT_MCP_EXPOSURE_POLICY.allowedRiskLevels]
  const overrides = asRecord(record?.toolOverrides)
  const toolOverrides = Object.fromEntries(
    Object.entries(overrides ?? {}).filter(
      (entry): entry is [string, McpToolOverride] =>
        entry[0].trim().length > 0 && (entry[1] === "allow" || entry[1] === "deny"),
    ),
  )

  return {
    allowedRiskLevels,
    allowWrites: record?.allowWrites === true,
    allowSensitiveData: record?.allowSensitiveData === true,
    toolOverrides,
  }
}

/**
 * Deployment policy is a second authorization layer after the caller's RBAC
 * scopes. Package-owned remote-safe metadata controls preset eligibility;
 * operators may explicitly admit a tool, but writes and sensitive data retain
 * their independent deployment-wide switches.
 */
export function evaluateMcpToolExposure(
  tool: ToolManifestEntry,
  policy: McpExposurePolicy,
  accessCatalog: AccessCatalog,
): McpToolExposure {
  const override = policy.toolOverrides[tool.capabilityId]
  const readOnly = tool.annotations.readOnlyHint === true
  const grants = tool.requiredScopes.map((scope) => accessAction(accessCatalog, scope))
  const sensitive = grants.some((grant) => grant?.sensitive === true)
  const remoteSafe = grants.every((grant) => grant?.remoteSafe === true)

  if (override === "deny") return exposure(false, sensitive, remoteSafe, "disabled-by-operator")
  if (!readOnly && !policy.allowWrites)
    return exposure(false, sensitive, remoteSafe, "writes-disabled")
  if (sensitive && !policy.allowSensitiveData)
    return exposure(false, sensitive, remoteSafe, "sensitive-data-disabled")

  if (override === "allow") return exposure(true, sensitive, remoteSafe, "enabled")
  if (tool.deploymentRisk === "critical")
    return exposure(false, sensitive, remoteSafe, "explicit-enable-required")
  if (!remoteSafe) return exposure(false, sensitive, remoteSafe, "explicit-enable-required")
  if (!policy.allowedRiskLevels.includes(tool.deploymentRisk))
    return exposure(false, sensitive, remoteSafe, "risk-not-allowed")

  return exposure(true, sensitive, remoteSafe, "enabled")
}

export function filterMcpToolsByExposurePolicy(
  tools: readonly ToolManifestEntry[],
  policy: McpExposurePolicy,
  accessCatalog: AccessCatalog,
): ToolManifestEntry[] {
  return tools.filter((tool) => evaluateMcpToolExposure(tool, policy, accessCatalog).enabled)
}

function accessAction(accessCatalog: AccessCatalog, scope: string) {
  const separator = scope.lastIndexOf(":")
  if (separator <= 0 || separator === scope.length - 1) return undefined
  const resourceName = scope.slice(0, separator)
  const actionName = scope.slice(separator + 1)
  const resource = accessCatalog.resources.find((candidate) => candidate.resource === resourceName)
  const action = resource?.actions.find((candidate) => candidate.action === actionName)
  if (!resource || !action) return undefined
  return {
    sensitive: action.sensitive === true,
    remoteSafe: resource.remoteSafe === true || action.remoteSafe === true,
  }
}

function exposure(
  enabled: boolean,
  sensitive: boolean,
  remoteSafe: boolean,
  reason: McpToolExposure["reason"],
): McpToolExposure {
  return { enabled, sensitive, remoteSafe, reason }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
