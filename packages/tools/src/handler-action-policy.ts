import {
  actionTransportAdmits,
  type ToolActionPolicyBinding,
  type ToolActionPolicyManifest,
  type ToolAdmissionTransport,
} from "./binding.js"
import type { ToolContext, ToolHandlerActionPolicyContext } from "./context.js"
import { ToolError } from "./errors.js"
import {
  DUPLICATE_TOOLS_INSTANCE_REMEDIATION,
  loadedToolsPackageInstanceCount,
  TOOLS_PACKAGE_INSTANCE,
  TOOLS_PACKAGE_NAME,
  type ToolsPackageInstance,
} from "./package-instance.js"

const authenticHandlerAdmissions = new WeakSet<object>()

/**
 * Non-enumerable stamp naming the loaded copy of this package that minted an
 * admission. `Symbol.for` on purpose: the whole point is that a *different*
 * copy can read it.
 *
 * The stamp is a diagnostic, never a credential — it is trivially forgeable and
 * is only ever read after the authenticity `WeakSet` has already refused. It
 * lets the refusal say "minted by another copy of the package" instead of
 * reporting a packaging fault as a forgery attempt.
 */
const ADMISSION_MINT_BRAND = Symbol.for("@voyant-travel/tools.handlerAdmissionMintedBy")

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
  assertAuthenticHandlerActionPolicyContext(admitted, expected)
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

/** Why an admission failed the authenticity check. */
export type HandlerAdmissionAuthenticityFailure =
  /** No admission reached the assertion, or it is not an object at all. */
  | "admission-absent"
  /** An object that this package never minted — a structural lookalike. */
  | "admission-not-minted"
  /** Genuinely minted, but by a *different* loaded copy of this package. */
  | "admission-minted-by-another-package-instance"

/** The identity fields a failure reports, when the caller can supply them. */
export interface HandlerAdmissionIdentityHint {
  capabilityId?: string
  canonicalName?: string
}

/**
 * Assert that a handler admission was minted by the Tool registry while
 * dispatching a selected handler-owned action.
 *
 * Structural lookalikes are deliberately rejected: action-ledger command
 * entrypoints use this assertion before any claim or mutation lease is minted.
 *
 * Failures carry the same diagnostic detail every sibling guard in this file
 * attaches, plus a `reason` separating the three situations that used to be
 * indistinguishable from the outside — nothing admitted, a lookalike, and a
 * duplicate-install packaging fault (voyant#4115).
 *
 * Pass `identity` where the caller pins one static expectation, so the failure
 * names the action rather than only the fact that one failed.
 */
export function assertAuthenticHandlerActionPolicyContext(
  admitted: unknown,
  identity?: HandlerAdmissionIdentityHint,
): asserts admitted is ToolHandlerActionPolicyContext {
  if (typeof admitted !== "object" || admitted === null) {
    throw admissionAuthenticityError("admission-absent", admitted, identity)
  }
  if (authenticHandlerAdmissions.has(admitted)) return
  const mintedBy = readAdmissionMintBrand(admitted)
  throw admissionAuthenticityError(
    mintedBy ? "admission-minted-by-another-package-instance" : "admission-not-minted",
    admitted,
    identity,
    mintedBy,
  )
}

function admissionAuthenticityError(
  reason: HandlerAdmissionAuthenticityFailure,
  admitted: unknown,
  identity: HandlerAdmissionIdentityHint | undefined,
  mintedBy?: ToolsPackageInstance,
): ToolError {
  // The expectation is trustworthy; anything read off the admission is the
  // caller's own claim and is reported under a distinct key so an operator
  // reading the meta is never misled about its provenance.
  const claimed = claimedAdmissionIdentity(admitted)
  const subject = identity?.canonicalName ?? identity?.capabilityId ?? claimed.capabilityId
  const meta: Record<string, unknown> = {
    reason,
    ...(identity?.capabilityId ? { capabilityId: identity.capabilityId } : {}),
    ...(identity?.canonicalName ? { canonicalName: identity.canonicalName } : {}),
    ...(claimed.capabilityId ? { claimedCapabilityId: claimed.capabilityId } : {}),
    ...(claimed.actionId ? { claimedActionId: claimed.actionId } : {}),
    assertedBy: TOOLS_PACKAGE_INSTANCE,
    loadedPackageInstances: loadedToolsPackageInstanceCount(),
  }
  const named = subject ? ` for "${subject}"` : ""

  if (reason === "admission-minted-by-another-package-instance") {
    return new ToolError(
      `The handler-owned action admission${named} was minted by a different loaded copy of ${TOOLS_PACKAGE_NAME}, so it is not authentic to the copy checking it. This is a packaging fault in the deployment, not a rejected caller.`,
      "ACTION_POLICY_REQUIRED",
      { ...meta, mintedBy },
      undefined,
      { nextSteps: DUPLICATE_TOOLS_INSTANCE_REMEDIATION },
    )
  }

  const duplicateHint =
    loadedToolsPackageInstanceCount() > 1 ? DUPLICATE_TOOLS_INSTANCE_REMEDIATION : []
  if (reason === "admission-absent") {
    return new ToolError(
      `No handler-owned action admission reached this action${named}. It must be dispatched through the Tool registry or through the route that serves it.`,
      "ACTION_POLICY_REQUIRED",
      meta,
      undefined,
      {
        nextSteps: [
          "Invoke this action through its registered Tool or route so the registry mints an admission; a handler cannot admit itself.",
          ...duplicateHint,
        ],
      },
    )
  }
  return new ToolError(
    `The handler-owned action admission${named} was not minted by this Tool registry.`,
    "ACTION_POLICY_REQUIRED",
    meta,
    undefined,
    {
      nextSteps: [
        "Admissions cannot be constructed by a caller. Dispatch through the registered Tool or route action so the registry mints one.",
        ...duplicateHint,
      ],
    },
  )
}

/** Identity the untrusted admission claims for itself, used for reporting only. */
function claimedAdmissionIdentity(admitted: unknown): {
  capabilityId?: string
  actionId?: string
} {
  if (typeof admitted !== "object" || admitted === null) return {}
  const candidate = admitted as { capabilityId?: unknown; actionPolicy?: { id?: unknown } }
  const capabilityId = candidate.capabilityId
  const actionId = candidate.actionPolicy?.id
  return {
    ...(typeof capabilityId === "string" ? { capabilityId } : {}),
    ...(typeof actionId === "string" ? { actionId } : {}),
  }
}

function readAdmissionMintBrand(admitted: object): ToolsPackageInstance | undefined {
  const branded = (admitted as Record<symbol, unknown>)[ADMISSION_MINT_BRAND]
  if (typeof branded !== "object" || branded === null) return undefined
  const candidate = branded as Partial<ToolsPackageInstance>
  if (candidate.package !== TOOLS_PACKAGE_NAME || typeof candidate.instance !== "number") {
    return undefined
  }
  return candidate as ToolsPackageInstance
}

/**
 * Re-mint an already-authentic handler admission with a server-resolved
 * idempotency key.
 *
 * Intent-level workflow tools (voyant#3933) resolve the action-ledger
 * idempotency key server-side rather than making the caller carry an opaque
 * token across turns — the failure mode that motivated retiring
 * `generate_booking_number`. Because `executeAdmittedCreatedTargetCommand`
 * treats `admitted.invocation.idempotencyKey` as authoritative, the workflow
 * handler needs to seat its server-derived key there without weakening the
 * gate. This is the sanctioned way to do it: the input admission must already
 * be authentic, and only the idempotency key is changed — actor, action policy,
 * capability identity and transport are carried through untouched. It is the
 * created-target analogue of the server-owned `requestId` a generic
 * server-owned-target action already uses.
 */
export function withServerResolvedIdempotencyKey(
  admitted: ToolHandlerActionPolicyContext,
  idempotencyKey: string,
): ToolHandlerActionPolicyContext {
  assertAuthenticHandlerActionPolicyContext(admitted)
  const key = idempotencyKey.trim()
  if (!key) {
    throw new ToolError(
      "A server-resolved idempotency key must be a non-empty string.",
      "INVALID_INPUT",
    )
  }
  return mintHandlerActionPolicyContext(
    { ...admitted, invocation: { ...admitted.invocation, idempotencyKey: key } },
    admitted.transport,
  )
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
  const minted = deepFreezeAdmission(
    brandMintedAdmission({
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
    }),
  )
  authenticHandlerAdmissions.add(minted)
  return minted
}

/**
 * Stamp the minting copy of this package onto a fresh admission.
 *
 * Applied before the deep freeze, because a frozen object cannot take new
 * properties. Non-enumerable so it never widens the admission's shape for
 * spreads, `JSON.stringify`, or the identity comparisons below.
 */
function brandMintedAdmission(
  admitted: ToolHandlerActionPolicyContext,
): ToolHandlerActionPolicyContext {
  Object.defineProperty(admitted, ADMISSION_MINT_BRAND, {
    value: TOOLS_PACKAGE_INSTANCE,
    enumerable: false,
    configurable: false,
    writable: false,
  })
  return admitted
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
