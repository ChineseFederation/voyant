import { z } from "zod"

import {
  TOOL_ACTION_INVOCATION_FIELD,
  type ToolActionInvocationPolicy,
  type ToolActionPolicyBinding,
  type ToolActionPolicyManifest,
  type ToolAnnotations,
  type ToolBindingMetadata,
  type ToolManifestEntry,
} from "./binding.js"
import type { ToolContext } from "./context.js"
import type { ToolDefinition } from "./define-tool.js"
import { ToolError } from "./errors.js"
import {
  firstHandlerActionPolicyIdentityMismatch,
  mintHandlerActionPolicyContext,
} from "./handler-action-policy.js"
import { isToolDeploymentRiskCompatible } from "./risk.js"

// biome-ignore lint/suspicious/noExplicitAny: the registry is a heterogeneous container over each tool's distinct input/output/context types.
type AnyToolDefinition = ToolDefinition<any, any, any>

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
}

export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, RegisteredTool>()
  const invocationNames = new Map<string, RegisteredTool>()
  const capabilities = new Map<string, RegisteredTool>()
  const admittedPreparedActions = new WeakSet<PreparedToolAction>()

  return {
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
    handlerActionPolicy: mintHandlerActionPolicyContext(candidate),
  }
}

interface RegisteredTool {
  definition: AnyToolDefinition
  manifest: ToolManifestEntry
}

const DEFAULT_AUDIENCE = { source: "grant" } as const

function createRegisteredTool(
  tool: AnyToolDefinition,
  binding: Partial<ToolBindingMetadata>,
): RegisteredTool {
  assertMatchingMetadata(tool, binding)
  const aliases = uniqueStrings([...(binding.aliases ?? []), ...(tool.aliases ?? [])])
  if (aliases.includes(tool.name)) {
    throw new Error(`Tool "${tool.name}" cannot also declare its canonical name as an alias`)
  }
  const manifest: ToolManifestEntry = {
    capabilityId: binding.capabilityId ?? tool.capabilityId ?? tool.name,
    owner: binding.owner ?? tool.owner ?? "unbound",
    capabilityVersion: binding.capabilityVersion ?? tool.capabilityVersion ?? "v1",
    name: tool.name,
    description: tool.description,
    aliases,
    ...((binding.deprecation ?? tool.deprecation)
      ? { deprecation: binding.deprecation ?? tool.deprecation }
      : {}),
    inputSchema: toJsonSchema(tool.inputSchema, "Input", tool.name),
    outputSchema: toJsonSchema(tool.outputSchema, "Output", tool.name),
    requiredScopes: tool.requiredScopes,
    audience: binding.audience ?? tool.audience ?? DEFAULT_AUDIENCE,
    deploymentRisk: binding.deploymentRisk ?? defaultDeploymentRisk(tool.tier),
    tier: tool.tier,
    riskPolicy: tool.riskPolicy,
    annotations: deriveAnnotations(tool, binding.annotations),
    ...(binding.actionPolicy
      ? { actionPolicy: deriveActionPolicy(tool, binding.actionPolicy) }
      : {}),
  }
  assertNonEmpty(manifest.capabilityId, "capabilityId", tool.name)
  assertNonEmpty(manifest.owner, "owner", tool.name)
  assertNonEmpty(manifest.capabilityVersion, "capabilityVersion", tool.name)
  assertCompatibleRisk(manifest.deploymentRisk, tool.tier, tool.name)
  return { definition: tool, manifest }
}

function deriveActionPolicy(
  tool: AnyToolDefinition,
  action: ToolActionPolicyBinding,
): ToolActionPolicyManifest {
  const enforcement = tool.actionPolicyEnforcement ?? "generic"
  if (action.targetLifecycle === "existing" && action.existingTarget) {
    if (action.kind !== "execute" || action.ledger !== "required") {
      throw new Error(
        `Tool "${tool.name}" action "${action.id}" may use the existing-target durable result protocol only for a required-ledger execute action`,
      )
    }
    if (action.approval === "conditional") {
      throw new Error(
        `Tool "${tool.name}" action "${action.id}" uses the existing-target durable result protocol but conditional approval is unsupported`,
      )
    }
    if (action.existingTarget.durability !== "handler-command-result-v1") {
      throw new Error(
        `Tool "${tool.name}" action "${action.id}" uses an unsupported existing-target durable result protocol`,
      )
    }
    if (!action.commandTargetField) {
      throw new Error(
        `Tool "${tool.name}" action "${action.id}" uses the existing-target durable result protocol but has no commandTargetField`,
      )
    }
    if (enforcement !== "handler") {
      throw new Error(
        `Tool "${tool.name}" action "${action.id}" uses the existing-target durable result protocol and requires actionPolicyEnforcement "handler"`,
      )
    }
  } else if (action.existingTarget) {
    throw new Error(
      `Tool "${tool.name}" action "${action.id}" declares existingTarget without targetLifecycle "existing"`,
    )
  }
  if (action.targetLifecycle === "created") {
    if (action.kind !== "execute" || action.ledger !== "required") {
      throw new Error(
        `Tool "${tool.name}" action "${action.id}" may create its target only for a required-ledger execute action`,
      )
    }
    if (!action.createdTarget) {
      throw new Error(
        `Tool "${tool.name}" action "${action.id}" declares a created target but is missing createdTarget command metadata`,
      )
    }
    assertNonEmpty(
      action.createdTarget.commandTargetType,
      "action createdTarget.commandTargetType",
      tool.name,
    )
    assertNonEmpty(
      action.createdTarget.resultReferenceType,
      "action createdTarget.resultReferenceType",
      tool.name,
    )
    if (enforcement !== "handler") {
      throw new Error(
        `Tool "${tool.name}" action "${action.id}" creates its target and requires actionPolicyEnforcement "handler"`,
      )
    }
  } else if (action.createdTarget) {
    throw new Error(
      `Tool "${tool.name}" action "${action.id}" declares createdTarget without targetLifecycle "created"`,
    )
  }
  const targetResolution = genericTargetResolution(tool, action, enforcement)
  const serverOwnedGenericTarget =
    enforcement === "generic" && targetResolution.targetResolution !== undefined
  const requiredFields: ToolActionInvocationPolicy["requiredFields"][number][] = []
  if (
    tool.riskPolicy.confirmationRequired ||
    (serverOwnedGenericTarget && action.approval === "required")
  ) {
    requiredFields.push("confirmed")
  }
  if (enforcement === "generic") {
    if (serverOwnedGenericTarget) {
      if (action.kind === "execute" && action.ledger === "required") {
        requiredFields.push("requestId")
      }
    } else {
      if (action.ledger === "required") requiredFields.push("targetId")
      if (action.kind === "execute" && action.ledger === "required") {
        requiredFields.push("idempotencyKey")
      }
      if (action.approval === "required") {
        requiredFields.push("approvalId", "idempotencyFingerprint")
      }
    }
  } else {
    if (action.kind === "execute" && action.ledger === "required") {
      requiredFields.push("idempotencyKey")
    }
    if (action.approval === "required") {
      requiredFields.push("approvalId", "idempotencyFingerprint")
    }
  }
  return {
    ...action,
    enforcement,
    invocation: {
      controlField: TOOL_ACTION_INVOCATION_FIELD,
      requiredFields,
      optionalFields:
        enforcement === "generic"
          ? serverOwnedGenericTarget
            ? ["reasonCode", "approvalId"]
            : ["reasonCode", "approvalId", "idempotencyFingerprint"]
          : ["reasonCode", "approvalId", "idempotencyFingerprint"],
      fingerprintAlgorithm: "action-ledger-command-v1",
      ...targetResolution,
    },
  }
}

function genericTargetResolution(
  tool: AnyToolDefinition,
  action: ToolActionPolicyBinding,
  enforcement: ToolActionPolicyManifest["enforcement"],
): Pick<ToolActionInvocationPolicy, "targetResolution"> {
  if (enforcement !== "generic" || action.ledger !== "required") return {}
  if (tool.resolveActionTarget) return { targetResolution: "package-resolver" }
  if (action.commandTargetField) return { targetResolution: "command-target-field" }
  if (action.kind === "read" || action.kind === "sensitive-read") {
    return { targetResolution: "authenticated-organization-collection" }
  }
  return {}
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

function unknownToolError(name: string, knownNames: Iterable<string>): ToolError {
  return new ToolError(
    `Tool "${name}" is not registered. Known tools: ${Array.from(knownNames).join(", ") || "(none)"}`,
    "NOT_FOUND",
    { name },
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
    if (err instanceof ToolError) throw err
    const message = err instanceof Error ? err.message : String(err)
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

/**
 * Serialize a tool schema to JSON Schema via zod v4's native `z.toJSONSchema`.
 *
 * The `io` direction is load-bearing, not a detail. `z.toJSONSchema` defaults
 * to `io: "output"`, and a schema containing a transform has no statically
 * known output type — so zod threw `Transforms cannot be represented in JSON
 * Schema`, this function fell into the catch below, and the tool was published
 * with a description-only stub carrying NO parameter names, types or required
 * list. An agent could then only guess field names, and every guess came back
 * as a -32602 it could not learn from.
 *
 * That silently degraded 26 of 284 Tools, including every `list_*` whose query
 * schema coerces a boolean query param (`active`, `activated`, `isPrimary`) and
 * every write that trims a string (`website`, `taxId`, `currency`).
 *
 * An input schema must serialize as `io: "input"` — what the caller SENDS —
 * which is both correct and representable through a transform. Output schemas
 * describe what the tool RETURNS, so they stay `io: "output"`.
 */
function toJsonSchema(
  schema: z.ZodType,
  direction: "Input" | "Output",
  name: string,
): Record<string, unknown> {
  try {
    const serialized = z.toJSONSchema(schema, {
      io: direction === "Input" ? "input" : "output",
    }) as Record<string, unknown>
    const meaningfulKeys = Object.keys(serialized).filter((key) => key !== "$schema")
    if (meaningfulKeys.length > 0) return serialized
    return {
      ...serialized,
      description: `${direction} for "${name}" is validated server-side by a permissive runtime schema.`,
      "x-voyant-schema-quality": "permissive",
    }
  } catch {
    return {
      description: `${direction} schema for "${name}" is not JSON-Schema-serializable; validated server-side.`,
      "x-voyant-schema-quality": "runtime-only",
    }
  }
}

function deriveAnnotations(
  tool: AnyToolDefinition,
  bindingAnnotations: ToolAnnotations | undefined,
): ToolAnnotations {
  const sideEffects = tool.riskPolicy.sideEffects ?? []
  const derived: ToolAnnotations = {
    readOnlyHint: tool.tier === "read" && sideEffects.length === 0,
    destructiveHint: tool.riskPolicy.destructive,
    openWorldHint: sideEffects.some((effect: string) =>
      ["payment", "refund", "email", "sms", "push", "external-booking"].includes(effect),
    ),
  }
  return { ...derived, ...tool.annotations, ...bindingAnnotations }
}

function assertMatchingMetadata(
  tool: AnyToolDefinition,
  binding: Partial<ToolBindingMetadata>,
): void {
  const pairs = [
    ["name", tool.name, binding.name],
    ["capabilityId", tool.capabilityId, binding.capabilityId],
    ["owner", tool.owner, binding.owner],
    ["capabilityVersion", tool.capabilityVersion, binding.capabilityVersion],
  ] as const
  for (const [field, declared, bound] of pairs) {
    if (declared !== undefined && bound !== undefined && declared !== bound) {
      throw new Error(
        `Tool "${tool.name}" ${field} "${declared}" does not match graph binding "${bound}"`,
      )
    }
  }
  if (
    binding.requiredScopes !== undefined &&
    !sameStringSet(tool.requiredScopes, binding.requiredScopes)
  ) {
    throw new Error(
      `Tool "${tool.name}" requiredScopes [${tool.requiredScopes.join(", ")}] do not match graph binding [${binding.requiredScopes.join(", ")}]`,
    )
  }
}

function assertCompatibleRisk(
  deploymentRisk: NonNullable<ToolBindingMetadata["deploymentRisk"]>,
  tier: AnyToolDefinition["tier"],
  name: string,
): void {
  if (!isToolDeploymentRiskCompatible(deploymentRisk, tier)) {
    throw new Error(
      `Tool "${name}" tier "${tier}" is incompatible with graph risk "${deploymentRisk}"`,
    )
  }
}

function defaultDeploymentRisk(
  tier: AnyToolDefinition["tier"],
): NonNullable<ToolBindingMetadata["deploymentRisk"]> {
  if (tier === "read") return "low"
  if (tier === "write") return "medium"
  if (tier === "sensitive") return "high"
  return "critical"
}

function assertNonEmpty(value: string, field: string, name: string): void {
  if (value.trim().length === 0) throw new Error(`Tool "${name}" ${field} must not be empty`)
}

function assertInvocationName(value: string, canonicalName: string): void {
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(value)) {
    throw new Error(
      `Tool "${canonicalName}" invocation name "${value}" must use 1-128 letters, numbers, underscores, dots, or hyphens`,
    )
  }
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const normalize = (values: readonly string[]) => [...new Set(values)].sort()
  const normalizedLeft = normalize(left)
  const normalizedRight = normalize(right)
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  )
}
