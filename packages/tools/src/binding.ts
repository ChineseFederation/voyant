import type { RiskPolicy, RiskTier } from "./risk.js"

export type ToolAudience = "staff" | "customer" | "partner" | "supplier"

/**
 * Audience is resolved from the authenticated grant. `allowed` narrows which
 * grant audiences may discover and call the tool; omitting it allows every
 * authenticated audience while still carrying the grant-derived resolver
 * scope into the handler.
 */
export interface ToolAudiencePolicy {
  source: "grant"
  allowed?: readonly ToolAudience[]
}

/** Standard MCP ToolAnnotations hints. Exact authorization and risk remain in Voyant metadata. */
export interface ToolAnnotations {
  title?: string
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

/** Compatibility metadata for a capability scheduled for removal or replacement. */
export interface ToolDeprecation {
  /** Capability version at which deprecation began. */
  sinceVersion: string
  message: string
  replacementCapabilityId?: string
  /** ISO-8601 calendar date after which the capability may be removed. */
  sunsetDate?: string
}

/** Deployment/action-ledger risk posture from the selected package graph. */
export type ToolDeploymentRisk = "low" | "medium" | "high" | "critical"

export const TOOL_ACTION_INVOCATION_FIELD = "_voyant" as const

export type ToolActionPolicyEnforcement = "generic" | "handler"

/** Selected graph action policy bound to one stable Tool capability. */
export interface ToolActionPolicyBinding {
  id: string
  capabilityId: string
  version: string
  kind: "execute" | "read" | "sensitive-read"
  targetType: string
  commandTargetField?: string
  targetLifecycle?: "existing" | "created"
  existingTarget?: {
    durability: "handler-command-result-v1"
  }
  createdTarget?: {
    commandTargetType: string
    resultReferenceType: string
    durability: "handler-command-claim-v1"
    parentAnchor?: {
      targetIdField: string
      targetType?: string
      targetTypeField?: string
      relatedTargetIdField?: string
    }
  }
  risk: ToolDeploymentRisk
  ledger: "required" | "optional"
  approval: "never" | "conditional" | "required"
  policy?: string
  reversible?: boolean
  allowedActorTypes?: readonly string[]
}

export interface ToolActionInvocationPolicy {
  controlField: typeof TOOL_ACTION_INVOCATION_FIELD
  requiredFields: readonly (
    | "confirmed"
    | "requestId"
    | "targetId"
    | "idempotencyKey"
    | "approvalId"
    | "idempotencyFingerprint"
  )[]
  optionalFields: readonly (
    | "reasonCode"
    | "approvalId"
    | "targetId"
    | "idempotencyKey"
    | "idempotencyFingerprint"
  )[]
  fingerprintAlgorithm: "action-ledger-command-v1"
  /**
   * Generic policy targets are resolved from server-owned state after domain
   * input validation. The client never supplies the target.
   */
  targetResolution?:
    | "package-resolver"
    | "command-target-field"
    | "authenticated-organization-collection"
}

export interface ToolActionPolicyManifest extends ToolActionPolicyBinding {
  enforcement: ToolActionPolicyEnforcement
  invocation: ToolActionInvocationPolicy
}

/** Stable identity supplied by a package graph binding or directly by a standalone tool. */
export interface ToolBindingMetadata {
  capabilityId: string
  owner: string
  capabilityVersion: string
  /** Duplicated declaration fields are checked against the runtime definition. */
  name?: string
  requiredScopes?: readonly string[]
  deploymentRisk?: ToolDeploymentRisk
  aliases?: readonly string[]
  deprecation?: ToolDeprecation
  audience?: ToolAudiencePolicy
  annotations?: ToolAnnotations
  actionPolicy?: ToolActionPolicyBinding
}

/**
 * A single tool as advertised on the discovery manifest — pure data a remote
 * agent client can read to discover, gate, and (later) invoke the tool over the
 * wire. This is what `ToolRegistry.list()` returns and what the MCP transport
 * maps into `tools/list`.
 */
export interface ToolManifestEntry {
  /** Stable package capability identity, independent of the invocation name. */
  capabilityId: string
  /** Package/module that owns the capability. */
  owner: string
  /** Version of the capability contract, independent of the manifest contract version. */
  capabilityVersion: string
  name: string
  description: string
  /** Deprecated invocation names accepted for compatibility but not treated as identities. */
  aliases: readonly string[]
  deprecation?: ToolDeprecation
  /** JSON Schema (draft 2020-12) for the tool input, from `z.toJSONSchema`. */
  inputSchema: Record<string, unknown>
  /** JSON Schema (draft 2020-12) for the typed pure-data result. */
  outputSchema: Record<string, unknown>
  /** Scopes required to call the tool (AND semantics), `resource:action` form. */
  requiredScopes: readonly string[]
  /** Grant-derived audience policy used for discovery and invocation. */
  audience: ToolAudiencePolicy
  /** Graph/action-ledger risk posture, checked for compatibility with `tier`. */
  deploymentRisk: ToolDeploymentRisk
  tier: RiskTier
  riskPolicy: RiskPolicy
  /** Standard MCP hints derived from risk, with explicit tool overrides applied. */
  annotations: ToolAnnotations
  /** Selected graph action and the fail-closed invocation contract for this capability. */
  actionPolicy?: ToolActionPolicyManifest
}

/** Version of the manifest contract, carried so consumers degrade gracefully. */
export const TOOL_CONTRACT_VERSION = "2026-07-25" as const

/**
 * A tool reachable over a versioned remote protocol rather than dispatched
 * in-process (design decision D1). Modeled now; remote proxying lands later.
 */
export interface RemoteToolRef extends ToolManifestEntry {
  /** Base URL of the remote tool server exposing the manifest + invocation. */
  baseUrl: string
  /** Whether to forward the caller's auth to the remote server. */
  forwardAuth: boolean
}
