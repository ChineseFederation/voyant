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
import type { ToolDefinition } from "./define-tool.js"
import { isToolDeploymentRiskCompatible } from "./risk.js"

/**
 * Construction half of the Tool registry: reconcile a tool definition against
 * its package binding, derive the action policy and invocation contract, and
 * fail closed on any mismatch. Dispatch lives in `registry.ts`.
 */

// biome-ignore lint/suspicious/noExplicitAny: because the registry is a heterogeneous container over each tool's distinct input/output/context types.
export type AnyToolDefinition = ToolDefinition<any, any, any>

export interface RegisteredTool {
  definition: AnyToolDefinition
  manifest: ToolManifestEntry
}

const DEFAULT_AUDIENCE = { source: "grant" } as const

export function createRegisteredTool(
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
      // `requestId` is deliberately not advertised. The generic gate derives it
      // from the command fingerprint it already computes, so there is no token
      // for the caller to invent or carry across an approval.
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
    // A handler that mints its own key must not advertise one as caller-required:
    // the whole point of an intent-level Tool is that no token crosses calls.
    if (
      action.kind === "execute" &&
      action.ledger === "required" &&
      !tool.resolvesIdempotencyKeyServerSide
    ) {
      requiredFields.push("idempotencyKey")
    }
    if (action.approval === "required") {
      requiredFields.push("approvalId")
      if (!tool.resolvesIdempotencyKeyServerSide) {
        requiredFields.push("idempotencyFingerprint")
      }
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
          : tool.resolvesIdempotencyKeyServerSide
            ? ["reasonCode", "approvalId"]
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
