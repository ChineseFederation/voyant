import {
  actionTransportAdmits,
  type ToolActionPolicyBinding,
  type ToolActionPolicyManifest,
  type ToolAdmissionTransport,
} from "./binding.js"
import type { ToolContext, ToolHandlerActionPolicyContext } from "./context.js"
import { ToolError } from "./errors.js"

const authenticHandlerAdmissions = new WeakSet<object>()

export interface HandlerActionPolicyExpectation {
  capabilityId: string
  capabilityVersion: string
  canonicalName: string
  actionPolicy: ToolActionPolicyBinding
  /**
   * The boundary the calling handler is served by. A handler that states this
   * refuses an admission minted at any other boundary, so a route-bound action
   * cannot be driven by Tool dispatch and vice versa.
   */
  transport?: ToolAdmissionTransport
}

/**
 * Admit one handler-owned Tool call against package-known identity metadata.
 *
 * MCP also applies this at its handler dispatch boundary. Package handlers can
 * call it again with their static action contract before claiming or mutating,
 * without trusting transport context or duplicating actor-policy checks.
 */
export function admitHandlerActionPolicy(
  context: ToolContext,
  expected: HandlerActionPolicyExpectation,
): ToolHandlerActionPolicyContext {
  const admitted = context.handlerActionPolicy
  assertAdmittedActionPolicy(admitted, expected)

  const allowedActorTypes = admitted.actionPolicy.allowedActorTypes
  if (allowedActorTypes?.length && !allowedActorTypes.includes(context.actor)) {
    throw new ToolError(
      "The authenticated actor is not allowed by the selected handler action.",
      "AUTHORIZATION_DENIED",
      {
        actionId: admitted.actionPolicy.id,
        actor: context.actor,
      },
    )
  }
  return admitted
}

/**
 * Assert an admission against exactly one static policy expectation.
 *
 * Route-served command entrypoints use this: they have an admission but no
 * `ToolContext`, and each entrypoint must pin one expectation rather than
 * selecting it from caller-supplied admission metadata.
 */
export function assertAdmittedActionPolicy(
  admitted: ToolHandlerActionPolicyContext | undefined,
  expected: HandlerActionPolicyExpectation,
): asserts admitted is ToolHandlerActionPolicyContext {
  assertAuthenticHandlerActionPolicyContext(admitted)
  if (admitted.actionPolicy.enforcement !== "handler") {
    throw new ToolError(
      "Handler-owned action policy context is required for this action.",
      "ACTION_POLICY_REQUIRED",
      { capabilityId: expected.capabilityId },
    )
  }

  const mismatch = firstHandlerActionPolicyIdentityMismatch(admitted, expected)
  if (mismatch) {
    throw new ToolError(
      "Handler-owned action policy context does not match this action contract.",
      "ACTION_POLICY_REQUIRED",
      { capabilityId: expected.capabilityId, mismatch },
    )
  }

  assertAdmissionTransport(admitted, expected)
}

/**
 * Reject an admission minted at a boundary the handler does not serve.
 *
 * This is the confused-deputy boundary between two policies over the same
 * command: a route-bound action must not be reachable through Tool dispatch,
 * and a Tool-bound action must not be reachable through a route.
 */
export function assertAdmissionTransport(
  admitted: ToolHandlerActionPolicyContext,
  expected: HandlerActionPolicyExpectation,
): void {
  const mintedAt = admitted.transport ?? "tool"
  if (expected.transport && mintedAt !== expected.transport) {
    throw new ToolError(
      "Handler-owned action admission was minted at a different boundary.",
      "ACTION_POLICY_REQUIRED",
      { capabilityId: expected.capabilityId, expected: expected.transport, minted: mintedAt },
    )
  }
  if (!actionTransportAdmits(admitted.actionPolicy, mintedAt)) {
    throw new ToolError(
      "The selected action does not admit this transport.",
      "ACTION_POLICY_REQUIRED",
      { actionId: admitted.actionPolicy.id, minted: mintedAt },
    )
  }
}

/**
 * Assert that a handler admission was minted by the Tool registry while
 * dispatching a selected handler-owned action.
 *
 * Structural lookalikes are deliberately rejected: action-ledger command
 * entrypoints use this assertion before any claim or mutation lease is minted.
 */
export function assertAuthenticHandlerActionPolicyContext(
  admitted: unknown,
): asserts admitted is ToolHandlerActionPolicyContext {
  if (
    typeof admitted !== "object" ||
    admitted === null ||
    !authenticHandlerAdmissions.has(admitted)
  ) {
    throw new ToolError(
      "Authentic handler-owned action admission is required.",
      "ACTION_POLICY_REQUIRED",
    )
  }
}

/**
 * Package-private runtime primitive used only by the Tool registry.
 *
 * This module is not a package export; consumers can assert admissions but
 * cannot mint them.
 */
export function mintHandlerActionPolicyContext(
  admitted: ToolHandlerActionPolicyContext,
  transport: ToolAdmissionTransport = "tool",
): ToolHandlerActionPolicyContext {
  const minted = deepFreezeAdmission({
    ...admitted,
    transport,
    actionPolicy: {
      ...admitted.actionPolicy,
      ...(admitted.actionPolicy.existingTarget
        ? { existingTarget: { ...admitted.actionPolicy.existingTarget } }
        : {}),
      ...(admitted.actionPolicy.createdTarget
        ? {
            createdTarget: {
              ...admitted.actionPolicy.createdTarget,
              ...(admitted.actionPolicy.createdTarget.parentAnchor
                ? { parentAnchor: { ...admitted.actionPolicy.createdTarget.parentAnchor } }
                : {}),
            },
          }
        : {}),
      ...(admitted.actionPolicy.allowedActorTypes
        ? { allowedActorTypes: [...admitted.actionPolicy.allowedActorTypes] }
        : {}),
      invocation: {
        ...admitted.actionPolicy.invocation,
        requiredFields: [...admitted.actionPolicy.invocation.requiredFields],
        optionalFields: [...admitted.actionPolicy.invocation.optionalFields],
      },
    },
    invocation: { ...admitted.invocation },
  })
  authenticHandlerAdmissions.add(minted)
  return minted
}

function deepFreezeAdmission(
  admitted: ToolHandlerActionPolicyContext,
): ToolHandlerActionPolicyContext {
  if (admitted.actionPolicy.createdTarget?.parentAnchor) {
    Object.freeze(admitted.actionPolicy.createdTarget.parentAnchor)
  }
  if (admitted.actionPolicy.createdTarget) Object.freeze(admitted.actionPolicy.createdTarget)
  if (admitted.actionPolicy.existingTarget) Object.freeze(admitted.actionPolicy.existingTarget)
  if (admitted.actionPolicy.allowedActorTypes) {
    Object.freeze(admitted.actionPolicy.allowedActorTypes)
  }
  Object.freeze(admitted.actionPolicy.invocation.requiredFields)
  Object.freeze(admitted.actionPolicy.invocation.optionalFields)
  Object.freeze(admitted.actionPolicy.invocation)
  Object.freeze(admitted.actionPolicy)
  Object.freeze(admitted.invocation)
  return Object.freeze(admitted)
}

export function firstHandlerActionPolicyIdentityMismatch(
  admitted: ToolHandlerActionPolicyContext,
  expected: HandlerActionPolicyExpectation,
): string | null {
  if (admitted.capabilityId !== expected.capabilityId) return "capabilityId"
  if (admitted.capabilityVersion !== expected.capabilityVersion) return "capabilityVersion"
  if (admitted.canonicalName !== expected.canonicalName) return "canonicalName"

  const actual = admitted.actionPolicy
  for (const field of [
    "id",
    "capabilityId",
    "version",
    "kind",
    "targetType",
    "commandTargetField",
    "targetLifecycle",
  ] as const) {
    if (actual[field] !== expected.actionPolicy[field]) return `actionPolicy.${field}`
  }
  if (!sameExistingTarget(actual, expected.actionPolicy)) return "actionPolicy.existingTarget"
  if (!sameCreatedTarget(actual, expected.actionPolicy)) return "actionPolicy.createdTarget"
  for (const field of ["risk", "ledger", "approval", "policy", "reversible"] as const) {
    if (actual[field] !== expected.actionPolicy[field]) return `actionPolicy.${field}`
  }
  if ((actual.transport ?? "tool") !== (expected.actionPolicy.transport ?? "tool")) {
    return "actionPolicy.transport"
  }
  if (!sameStrings(actual.allowedActorTypes, expected.actionPolicy.allowedActorTypes)) {
    return "actionPolicy.allowedActorTypes"
  }
  return null
}

function sameExistingTarget(
  actual: ToolActionPolicyManifest,
  expected: HandlerActionPolicyExpectation["actionPolicy"],
): boolean {
  const actualExisting = actual.existingTarget
  const expectedExisting = expected.existingTarget
  if (!actualExisting || !expectedExisting) return actualExisting === expectedExisting
  return actualExisting.durability === expectedExisting.durability
}

function sameCreatedTarget(
  actual: ToolActionPolicyManifest,
  expected: HandlerActionPolicyExpectation["actionPolicy"],
): boolean {
  const actualCreated = actual.createdTarget
  const expectedCreated = expected.createdTarget
  if (!actualCreated || !expectedCreated) return actualCreated === expectedCreated
  return (
    actualCreated.commandTargetType === expectedCreated.commandTargetType &&
    actualCreated.resultReferenceType === expectedCreated.resultReferenceType &&
    actualCreated.durability === expectedCreated.durability &&
    sameParentAnchor(actualCreated.parentAnchor, expectedCreated.parentAnchor)
  )
}

function sameParentAnchor(
  actual: NonNullable<ToolActionPolicyBinding["createdTarget"]>["parentAnchor"],
  expected: NonNullable<ToolActionPolicyBinding["createdTarget"]>["parentAnchor"],
): boolean {
  if (!actual || !expected) return actual === expected
  return (
    actual.targetIdField === expected.targetIdField &&
    actual.targetType === expected.targetType &&
    actual.targetTypeField === expected.targetTypeField &&
    actual.relatedTargetIdField === expected.relatedTargetIdField
  )
}

function sameStrings(
  actual: readonly string[] | undefined,
  expected: readonly string[] | undefined,
): boolean {
  if (!actual || !expected) return actual === expected
  if (actual.length !== expected.length) return false
  const actualValues = new Set(actual)
  const expectedValues = new Set(expected)
  if (actualValues.size !== expectedValues.size) return false
  return [...actualValues].every((value) => expectedValues.has(value))
}
