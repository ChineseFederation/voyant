import {
  actionTransportAdmits,
  type ToolBindingMetadata,
  type ToolManifestEntry,
} from "./binding.js"
import type { ToolContext, ToolHandlerActionPolicyContext } from "./context.js"
import { isToolError, ToolError, toToolError } from "./errors.js"
import {
  firstHandlerActionPolicyIdentityMismatch,
  mintHandlerActionPolicyContext,
} from "./handler-action-policy.js"
import { findNearMatches } from "./near-matches.js"
import { warnOnDuplicateToolsPackageInstance } from "./package-instance.js"
import {
  type AnyToolDefinition,
  createRegisteredTool,
  type RegisteredTool,
} from "./registered-tool.js"
import {
  createRouteActionRegistry,
  type RouteActionAdmissionInput,
  type RouteActionBinding,
} from "./route-action.js"

/**
 * Transport-neutral registry of headless tools. Any domain package registers a
 * tool array here (mirroring how modules mount routes); a transport adapter
 * enumerates `list()` and dispatches by name. Authorization is **not** enforced
 * here — that stays in the transport, bound to each tool's `requiredScopes`.
 */
export interface ToolRegistry {
  /**
   * Register a tool. Graph-driven hosts pass their canonical package binding;
   * standalone callers may put the same metadata directly on the definition.
   */
  register(def: AnyToolDefinition, binding?: Partial<ToolBindingMetadata>): void
  /** Register many tools. */
  registerAll(defs: readonly AnyToolDefinition[]): void
  /** Look up a registered tool by name. */
  get(name: string): AnyToolDefinition | undefined
  /** Resolve a stable capability, optionally requiring an exact supported version. */
  getByCapabilityId(capabilityId: string, capabilityVersion?: string): AnyToolDefinition | undefined
  /** All registered tool names. */
  names(): string[]
  /** The discovery manifest — pure data for `tools/list` and remote consumers. */
  list(): ToolManifestEntry[]
  /**
   * Parse domain input exactly once and resolve its action target inside the
   * Tool-owning package. The returned value is admitted only to this registry.
   */
  prepareAction(name: string, args: unknown, ctx: ToolContext): Promise<PreparedToolAction>
  /** Dispatch an action prepared by this exact registry without re-parsing it. */
  dispatchPrepared<Out = unknown>(prepared: PreparedToolAction, ctx: ToolContext): Promise<Out>
  /**
   * Dispatch a tool by name: validate args against `inputSchema`, run the
   * handler, validate the result against `outputSchema`, return pure data.
   * Throws {@link ToolError} on unknown tool / invalid input / invalid output /
   * handler failure.
   */
  dispatch<Out = unknown>(name: string, args: unknown, ctx: ToolContext): Promise<Out>
  /**
   * Register an action that a route serves rather than a Tool. It carries the
   * same selected-graph policy as a Tool-bound action but is never listed on
   * the discovery manifest and can never be dispatched by name.
   */
  registerRouteAction(binding: RouteActionBinding): void
  /**
   * Mint an admission for a registered route action. This is the only way a
   * route can obtain one — the admission is minted against the graph-registered
   * policy, exactly as Tool dispatch mints its own.
   */
  admitRouteAction(
    actionId: string,
    input: RouteActionAdmissionInput,
  ): ToolHandlerActionPolicyContext
}

export function createToolRegistry(): ToolRegistry {
  // A duplicated install makes every cross-copy admission fail closed. Say so
  // at construction rather than leaving it to be discovered on the first
  // destructive Tool call (voyant#4115).
  warnOnDuplicateToolsPackageInstance()
  const tools = new Map<string, RegisteredTool>()
  const invocationNames = new Map<string, RegisteredTool>()
  const capabilities = new Map<string, RegisteredTool>()
  const routeActions = createRouteActionRegistry()
  const admittedPreparedActions = new WeakSet<PreparedToolAction>()

  return {
    registerRouteAction(binding) {
      routeActions.register(binding)
    },
    admitRouteAction(actionId, input) {
      return routeActions.admit(actionId, input)
    },
    register(def, binding = {}) {
      const registered = createRegisteredTool(def, binding)
      const allNames = [def.name, ...registered.manifest.aliases]
      for (const name of allNames) {
        assertInvocationName(name, def.name)
        const existing = invocationNames.get(name)
        if (existing) {
          throw new Error(
            `Tool invocation name "${name}" is already registered by "${existing.definition.name}"`,
          )
        }
      }
      if (capabilities.has(registered.manifest.capabilityId)) {
        throw new Error(
          `Tool capability "${registered.manifest.capabilityId}" is already registered`,
        )
      }
      tools.set(def.name, registered)
      capabilities.set(registered.manifest.capabilityId, registered)
      for (const name of allNames) invocationNames.set(name, registered)
    },
    registerAll(defs) {
      for (const def of defs) this.register(def)
    },
    get(name) {
      return invocationNames.get(name)?.definition
    },
    getByCapabilityId(capabilityId, capabilityVersion) {
      const registered = capabilities.get(capabilityId)
      if (!registered) return undefined
      if (
        capabilityVersion !== undefined &&
        capabilityVersion !== registered.manifest.capabilityVersion
      ) {
        return undefined
      }
      return registered.definition
    },
    names() {
      return Array.from(tools.keys())
    },
    list() {
      return Array.from(tools.values()).map(({ manifest }) => manifest)
    },
    async prepareAction(name, args, ctx) {
      const registered = invocationNames.get(name)
      if (!registered) {
        throw unknownToolError(name, tools.keys())
      }
      const tool = registered.definition
      const input = parseToolInput(tool, name, args)
      const resolvedTargetId = await resolvePreparedActionTarget(registered, input, ctx, name)
      const prepared: PreparedToolAction = {
        invocationName: name,
        commandInput: input,
        ...(resolvedTargetId ? { resolvedTargetId } : {}),
      }
      admittedPreparedActions.add(prepared)
      return prepared
    },
    async dispatchPrepared(prepared, ctx) {
      if (!admittedPreparedActions.delete(prepared)) {
        throw new ToolError(
          "Prepared Tool action was not admitted by this registry or was already dispatched.",
          "ACTION_POLICY_REQUIRED",
        )
      }
      const registered = invocationNames.get(prepared.invocationName)
      if (!registered) {
        throw unknownToolError(prepared.invocationName, tools.keys())
      }
      return executeTool(
        registered.definition,
        prepared.invocationName,
        prepared.commandInput,
        admittedDispatchContext(ctx, registered.manifest),
      )
    },
    async dispatch(name, args, ctx) {
      const registered = invocationNames.get(name)
      if (!registered) {
        throw unknownToolError(name, tools.keys())
      }
      const tool = registered.definition
      const input = parseToolInput(tool, name, args)

      return executeTool(tool, name, input, admittedDispatchContext(ctx, registered.manifest))
    },
  }
}

export interface PreparedToolAction {
  readonly invocationName: string
  readonly commandInput: unknown
  readonly resolvedTargetId?: string
}

function admittedDispatchContext(context: ToolContext, manifest: ToolManifestEntry): ToolContext {
  const policy = manifest.actionPolicy
  if (policy?.enforcement !== "handler") {
    if (!("handlerActionPolicy" in context)) return context
    const { handlerActionPolicy: _handlerActionPolicy, ...base } = context
    return base
  }
  const candidate = context.handlerActionPolicy
  if (!candidate) {
    throw new ToolError(
      "Handler-owned action policy context is required for this Tool.",
      "ACTION_POLICY_REQUIRED",
      { capabilityId: manifest.capabilityId },
    )
  }
  const mismatch = firstHandlerActionPolicyIdentityMismatch(candidate, {
    capabilityId: manifest.capabilityId,
    capabilityVersion: manifest.capabilityVersion,
    canonicalName: manifest.name,
    actionPolicy: policy,
  })
  if (mismatch) {
    throw new ToolError(
      "Handler-owned action policy context does not match the registered Tool.",
      "ACTION_POLICY_REQUIRED",
      { capabilityId: manifest.capabilityId, mismatch },
    )
  }
  if (!actionTransportAdmits(policy, "tool")) {
    throw new ToolError(
      "The selected action is not reachable through Tool dispatch.",
      "ACTION_POLICY_REQUIRED",
      { actionId: policy.id, transport: policy.transport },
    )
  }
  const allowedActorTypes = policy.allowedActorTypes
  if (allowedActorTypes?.length && !allowedActorTypes.includes(context.actor)) {
    throw new ToolError(
      "The authenticated actor is not allowed by the selected handler action.",
      "AUTHORIZATION_DENIED",
      {
        actionId: policy.id,
        actor: context.actor,
      },
    )
  }
  return {
    ...context,
    handlerActionPolicy: mintHandlerActionPolicyContext(candidate, "tool"),
  }
}

async function resolvePreparedActionTarget(
  registered: RegisteredTool,
  input: unknown,
  ctx: ToolContext,
  invocationName: string,
): Promise<string | undefined> {
  const { definition: tool, manifest } = registered
  const resolution = manifest.actionPolicy?.invocation.targetResolution
  let targetId: unknown

  switch (resolution) {
    case "package-resolver":
      targetId = await tool.resolveActionTarget?.(input, ctx)
      break
    case "command-target-field":
      targetId = commandTarget(input, manifest.actionPolicy?.commandTargetField)
      break
    case "authenticated-organization-collection":
      targetId = (ctx.organizationId ?? ctx.tenantId).trim()
        ? `${manifest.actionPolicy?.targetType}:${(ctx.organizationId ?? ctx.tenantId).trim()}`
        : undefined
      break
    default:
      // Standalone registries may prepare an unbound Tool directly.
      if (tool.resolveActionTarget) targetId = await tool.resolveActionTarget(input, ctx)
  }

  if (resolution !== undefined && (typeof targetId !== "string" || !targetId.trim())) {
    throw new ToolError(
      `Tool "${invocationName}" could not resolve a valid server-owned action target.`,
      "ACTION_POLICY_REQUIRED",
      {
        capabilityId: manifest.capabilityId,
        targetResolution: resolution,
        ...(resolution === "command-target-field"
          ? { commandTargetField: manifest.actionPolicy?.commandTargetField }
          : {}),
      },
    )
  }
  if (targetId === undefined) return undefined
  if (typeof targetId !== "string" || !targetId.trim()) {
    throw new ToolError(
      `Tool "${invocationName}" returned an invalid action target.`,
      "ACTION_POLICY_REQUIRED",
      { capabilityId: manifest.capabilityId },
    )
  }
  return targetId.trim()
}

function commandTarget(input: unknown, field: string | undefined): unknown {
  if (!field || typeof input !== "object" || input === null || Array.isArray(input)) {
    return undefined
  }
  return (input as Record<string, unknown>)[field]
}

function parseToolInput(
  tool: AnyToolDefinition,
  name: string,
  args: unknown,
): Parameters<AnyToolDefinition["handler"]>[0] {
  const input = tool.inputSchema.safeParse(args)
  if (!input.success) {
    throw new ToolError(
      `Invalid input for tool "${name}": ${input.error.message}`,
      "INVALID_INPUT",
      {
        issues: input.error.issues,
      },
    )
  }
  return input.data
}

/**
 * voyant#3950: an unregistered tool name is where `candidates` earns its keep.
 *
 * This used to inline EVERY registered name into the message — ~270 of them on
 * the operator graph, as one unstructured comma-joined string. That is a
 * directory listing charged to the agent's context at the exact moment it is
 * already lost, and it buries the one name it probably meant.
 *
 * Near matches instead: a handful of structured `candidates` the transport can
 * present or cap, plus `didYouMean` when one name is unambiguously nearest.
 * When nothing is close the message says how to enumerate rather than
 * enumerating — discovery is a tool call, not an error payload.
 */
function unknownToolError(name: string, knownNames: Iterable<string>): ToolError {
  const { candidates, didYouMean } = findNearMatches(name, knownNames)
  const suffix = didYouMean
    ? ` Did you mean "${didYouMean}"?`
    : candidates.length > 0
      ? ` Close matches: ${candidates.join(", ")}.`
      : " Use the discovery tools to list what this deployment serves."
  return new ToolError(
    `Tool "${name}" is not registered.${suffix}`,
    "NOT_FOUND",
    { name },
    undefined,
    { ...(candidates.length > 0 ? { candidates } : {}), ...(didYouMean ? { didYouMean } : {}) },
  )
}

async function executeTool(
  tool: AnyToolDefinition,
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<never> {
  let result: unknown
  try {
    result = await tool.handler(input, ctx)
  } catch (err) {
    // A ToolError thrown by another loaded copy of this package must keep its
    // code and remediation. `instanceof` alone would flatten it into a generic
    // PROVIDER_ERROR whose raw text reaches the caller (voyant#4115).
    if (isToolError(err)) throw toToolError(err)
    const message = err instanceof Error ? err.message : String(err)
    // voyant#3950: PROVIDER_ERROR (terminal) is the deliberate classification for
    // an UNRECOGNIZED throw, not a default nobody revisited. We know nothing about
    // what failed here, and this wrapper covers writes as well as reads — telling
    // an agent to retry a write whose outcome we cannot characterise is how you
    // get a duplicate booking. A handler that knows its failure is transient
    // should throw PROVIDER_UNAVAILABLE itself; `isToolError` above preserves it.
    throw new ToolError(`Tool "${name}" failed: ${message}`, "PROVIDER_ERROR", undefined, {
      cause: err,
    })
  }

  const output = tool.outputSchema.safeParse(result)
  if (!output.success) {
    throw new ToolError(
      `Tool "${name}" returned output that failed its outputSchema: ${output.error.message}`,
      "INVALID_OUTPUT",
      { issues: output.error.issues },
    )
  }
  return output.data as never
}

function assertInvocationName(value: string, canonicalName: string): void {
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(value)) {
    throw new Error(
      `Tool "${canonicalName}" invocation name "${value}" must use 1-128 letters, numbers, underscores, dots, or hyphens`,
    )
  }
}
