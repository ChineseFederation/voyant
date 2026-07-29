/**
 * Per-request context passed to every tool handler.
 *
 * A deployment constructs this once per agent request (derived from the
 * request's auth grant) and the transport passes the same context to every
 * tool dispatch. Domain packages that need injected services extend this by
 * intersection — e.g. `ToolContext & { trips: TripsToolServices }` — so the
 * `tools` package itself stays free of any domain dependency.
 */
export interface ToolContext {
  /**
   * The leased DB client for this request. Typed `unknown` here so the tools
   * package takes no `@voyant-travel/db` dependency; domain handlers cast it to
   * their expected client type.
   */
  db: unknown
  /** The actor making the request. Drives visibility filtering. */
  actor: Visibility
  /**
   * The audience this grant represents. Carried on the key grant, not inferred
   * from scopes. Usually equal to `actor`; kept distinct so a staff key can act
   * on behalf of a customer audience.
   */
  audience: Visibility
  /** Tenant / operator identifier — usually synthesized into provenance. */
  tenantId: string
  /** Authenticated organization when the grant is organization-scoped. */
  organizationId?: string
  /** Authenticated scopes granted by the transport for this request. */
  scopes?: readonly string[]
  /** Default resolver scope for tools that need locale / audience / market. */
  resolverScope: ResolverScope
  /** Optional runtime hook to keep the isolate alive for background work. */
  waitUntil?(promise: Promise<unknown>): void
  /** Request-scoped selected-graph action gate supplied by the action-ledger package. */
  toolActionPolicy?: ToolActionPolicyGate
  /**
   * Invocation controls and selected policy for the current handler-owned
   * dispatch. The MCP transport creates a fresh value for each call and never
   * exposes it to generic-policy handlers.
   */
  handlerActionPolicy?: ToolHandlerActionPolicyContext
}

export interface ToolActionInvocationControl {
  confirmed?: boolean
  /** Opaque client request identifier used as the server-owned idempotency key. */
  requestId?: string
  /** Server-issued approval identifier returned by an approval preflight. */
  approvalId?: string
  reasonCode?: string
  /**
   * Compatibility controls for handler-owned policies and generic actions
   * awaiting server-owned target migration.
   */
  targetId?: string
  idempotencyKey?: string
  idempotencyFingerprint?: string
}

export interface ToolActionPolicyExecutionInput {
  capabilityId: string
  capabilityVersion: string
  canonicalName: string
  actionPolicy: import("./binding.js").ToolActionPolicyManifest
  commandInput: unknown
  invocation: ToolActionInvocationControl
  /** Package-owned target resolved from already validated command input. */
  resolvedTargetId?: string
}

export type ToolHandlerActionPolicyContext = Readonly<
  Omit<ToolActionPolicyExecutionInput, "commandInput">
>

/** Transport-neutral gate: the implementation owns policy checks and audited dispatch. */
export interface ToolActionPolicyGate {
  execute<T>(input: ToolActionPolicyExecutionInput, dispatch: () => Promise<T>): Promise<T>
}

export const TOOL_CONTEXT_CONTRIBUTION_EXPORT = "voyantToolContextContribution" as const

/** Generic MCP resource containing the selected deployment providers by graph role. */
export const TOOL_PROVIDER_SELECTIONS_RESOURCE = "voyant.graph.provider-selections" as const

/** Generic MCP resource containing the action policies admitted by the selected graph. */
export const TOOL_GRAPH_ACTIONS_RESOURCE = "voyant.graph.actions" as const

/** Generic MCP resource containing setup steps admitted by the selected graph. */
export const TOOL_GRAPH_SETUP_STEPS_RESOURCE = "voyant.graph.setup-steps" as const

/** MCP resource scoped to the Tool-owning unit's selected project configuration. */
export const TOOL_UNIT_PROJECT_CONFIG_RESOURCE = "voyant.graph.unit-project-config" as const

export interface ToolContextContributionInput {
  /** Transport request context. Contributors narrow this at their package boundary. */
  request: unknown
  context: ToolContext
  /** Deployment resources supplied by the generic host. */
  resources: Readonly<Record<string, unknown>>
}

/** Package-owned enrichment for context keys declared by selected graph tools. */
export interface ToolContextContribution {
  context: readonly string[]
  contribute(
    input: ToolContextContributionInput,
  ): Record<string, unknown> | Promise<Record<string, unknown>>
}

export function defineToolContextContribution(
  contribution: ToolContextContribution,
): ToolContextContribution {
  return contribution
}

/**
 * Who a request represents. Mirrors the `Actor`/`Visibility` unions in
 * `@voyant-travel/core` / `@voyant-travel/catalog-contracts`, defined locally so
 * the `tools` package has no cross-package dependency. Structurally assignable
 * to/from those types.
 */
export type Visibility = "staff" | "customer" | "partner" | "supplier"

/**
 * Structural mirror of `@voyant-travel/catalog`'s `ResolverScope`. Declared here
 * (rather than imported) to avoid a runtime dependency on the heavy catalog
 * package; the operator-built scope is structurally assignable.
 */
export interface ResolverScope {
  locale: string
  audience: Visibility
  market: string
  actor: Visibility
}
