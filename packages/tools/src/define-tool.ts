import type { z } from "zod"

import type {
  ToolActionPolicyEnforcement,
  ToolAnnotations,
  ToolAudiencePolicy,
  ToolDeprecation,
} from "./binding.js"
import type { ToolContext } from "./context.js"
import type { RiskPolicy, RiskTier } from "./risk.js"

/**
 * A transport-neutral, headless tool definition. The handler returns **typed
 * pure data** validated by `outputSchema` — no transport envelopes, no
 * presentation. Exposure (MCP, remote agent, HTTP) is a thin adapter over this.
 *
 * @typeParam In - the parsed input type (from `inputSchema`).
 * @typeParam Out - the pure-data output type (validated by `outputSchema`).
 * @typeParam Ctx - the context type; domains widen it by intersection to inject
 *   services, e.g. `ToolContext & { trips: TripsToolServices }`.
 */
export interface ToolDefinition<In, Out, Ctx extends ToolContext = ToolContext> {
  /**
   * Stable capability identity. A selected deployment graph supplies this from
   * its package manifest when omitted; standalone registries should set it.
   */
  capabilityId?: string
  /** Owning package/module. Supplied by the selected graph when omitted. */
  owner?: string
  /** Capability contract version. Defaults to `v1` for legacy definitions. */
  capabilityVersion?: string
  /** Tool name surfaced to the agent. Convention: snake_case. */
  name: string
  /** Human-readable description shown to the agent. */
  description: string
  /** Previous invocation names accepted as compatibility aliases. */
  aliases?: readonly string[]
  /** Optional lifecycle metadata for a deprecated capability. */
  deprecation?: ToolDeprecation
  /**
   * Zod schema validating + typing the args. Keep it serialization-friendly
   * (avoid top-level `.transform()`/`.refine()`) so `z.toJSONSchema` can emit a
   * faithful manifest for remote consumers.
   */
  inputSchema: z.ZodType<In>
  /** Zod schema validating the handler's return value (pure data). */
  outputSchema: z.ZodType<Out>
  /**
   * Scopes required to call this tool, in `resource:action` form (from
   * the selected deployment graph's access declarations. Enforced by
   * the transport with AND semantics — the caller must hold **all** of them.
   */
  requiredScopes: readonly string[]
  /** Grant-derived audience policy. Defaults to all authenticated grant audiences. */
  audience?: ToolAudiencePolicy
  /** Coarse risk tier. */
  tier: RiskTier
  /** Declarative risk policy (destructive / reversible / dry-run / side effects). */
  riskPolicy: RiskPolicy
  /** Optional overrides for standard MCP ToolAnnotations hints. */
  annotations?: ToolAnnotations
  /** Use only when the handler already enforces the selected action-ledger policy itself. */
  actionPolicyEnforcement?: ToolActionPolicyEnforcement
  /**
   * Resolve the durable action target from validated domain input.
   *
   * Use this for targets that cannot be selected by the graph action's
   * `commandTargetField`. Transport callers never supply or override the
   * resolved target.
   */
  resolveActionTarget?(args: In, ctx: Ctx): string | Promise<string>
  /** The implementation — receives parsed args + context, returns pure data. */
  handler(args: In, ctx: Ctx): Promise<Out>
}

/**
 * Identity helper that defines a tool while preserving its generics. Purely for
 * ergonomics + inference; returns the definition unchanged.
 */
export function defineTool<In, Out, Ctx extends ToolContext = ToolContext>(
  def: ToolDefinition<In, Out, Ctx>,
): ToolDefinition<In, Out, Ctx> {
  return def
}
