// agent-quality: file-size exception -- owner: action-ledger; durable command admission, replay validation, and canonical completion share one exact state machine.
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { dbSupportsTransactions } from "@voyant-travel/db/transaction-capability"
import {
  assertAuthenticHandlerActionPolicyContext,
  ToolError,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { and, eq, sql } from "drizzle-orm"

import type {
  ActionLedgerCapabilityApprovalPolicy,
  ActionLedgerCapabilityRisk,
} from "./capability.js"
import { buildActionApprovalCommandFingerprint, sha256 } from "./fingerprint.js"
import {
  type ActionLedgerRequestContextValues,
  type BuildActionLedgerMutationInput,
  buildActionLedgerMutationEntryInput,
  mapActionLedgerRequestContext,
  requestActionLedgerApproval,
} from "./request-context.js"
import { type ActionLedgerEntry, actionLedgerEntries, actionMutationDetails } from "./schema.js"
import { insertEntry } from "./service/entries.js"
import { ActionLedgerIdempotencyConflictError } from "./service/errors.js"
import type { AppendActionLedgerEntryInput } from "./service/types.js"
import { actionLedgerService } from "./service.js"

const CLAIM_SCOPE_SUFFIX = ":created-command-claim"
const RESULT_SCOPE_SUFFIX = ":created-command-result"
const EXISTING_CLAIM_SCOPE_SUFFIX = ":existing-command-claim"

export type CreatedTargetCommandResultReference<TReferenceType extends string = string> =
  `${TReferenceType}:${string}`

export type ActionLedgerCreatedCommandReplayCorruptReason =
  | "malformed_result_reference"
  | "wrong_result_reference_type"
  | "result_target_id_mismatch"
  | "result_target_type_mismatch"
  | "result_action_mismatch"
  | "result_fingerprint_mismatch"
  | "result_identity_mismatch"

export class ActionLedgerCreatedCommandReplayIncompleteError extends Error {
  readonly claimActionId: string

  constructor(claimActionId: string) {
    super(`Created-target command claim ${claimActionId} has no canonical succeeded result`)
    this.name = "ActionLedgerCreatedCommandReplayIncompleteError"
    this.claimActionId = claimActionId
  }
}

export class ActionLedgerCreatedCommandReplayCorruptError extends Error {
  readonly claimActionId: string
  readonly resultActionId: string
  readonly reason: ActionLedgerCreatedCommandReplayCorruptReason

  constructor(
    claimActionId: string,
    resultActionId: string,
    reason: ActionLedgerCreatedCommandReplayCorruptReason,
  ) {
    super(
      `Created-target command result ${resultActionId} for claim ${claimActionId} is invalid: ${reason}`,
    )
    this.name = "ActionLedgerCreatedCommandReplayCorruptError"
    this.claimActionId = claimActionId
    this.resultActionId = resultActionId
    this.reason = reason
  }
}

export class ActionLedgerCreatedCommandFingerprintMismatchError extends Error {
  readonly expectedFingerprint: string
  readonly receivedFingerprint: string

  constructor(expectedFingerprint: string, receivedFingerprint: string) {
    super("Created-target command fingerprint does not match its selected action policy")
    this.name = "ActionLedgerCreatedCommandFingerprintMismatchError"
    this.expectedFingerprint = expectedFingerprint
    this.receivedFingerprint = receivedFingerprint
  }
}

export class ActionLedgerCreatedCommandTransactionRequiredError extends Error {
  constructor() {
    super("Created-target command execution requires a transaction-capable database")
    this.name = "ActionLedgerCreatedCommandTransactionRequiredError"
  }
}

export class ActionLedgerCreatedCommandProtocolError extends Error {
  readonly reason:
    | "admitted_policy_mismatch"
    | "invalid_parent_anchor"
    | "approval_policy_unsupported"
    | "forged_approval_linkage"
    | "invalid_approval_controls"
    | "invalid_command_payload"
    | "claim_changed_during_mutation"
    | "result_created_during_mutation"
    | "invalid_mutation_lease"

  readonly field?: keyof ActionLedgerEntry

  constructor(
    reason: ActionLedgerCreatedCommandProtocolError["reason"],
    field?: keyof ActionLedgerEntry,
  ) {
    super(`Created-target command protocol failed closed: ${reason}${field ? ` (${field})` : ""}`)
    this.name = "ActionLedgerCreatedCommandProtocolError"
    this.reason = reason
    this.field = field
  }
}

export class ActionLedgerCreatedCommandApprovalError extends Error {
  readonly approvalId: string
  readonly reason: string

  constructor(approvalId: string, reason: string) {
    super(`Approval ${approvalId} does not authorize this exact created-target command: ${reason}`)
    this.name = "ActionLedgerCreatedCommandApprovalError"
    this.approvalId = approvalId
    this.reason = reason
  }
}

export interface BuildCreatedTargetCommandFingerprintInput {
  actionName: string
  actionVersion: string
  commandTarget: { type: string; id: string }
  canonicalTargetType: string
  resultReferenceType: string
  parentAnchor?: {
    targetIdField: string
    targetType?: string
    targetTypeField?: string
    relatedTargetIdField?: string
  }
  commandInput?: unknown
  capabilityId: string
  capabilityVersion: string
  evaluatedRisk: ActionLedgerCapabilityRisk
  approvalPolicy: ActionLedgerCapabilityApprovalPolicy
  approvalReasonCode: string | null
}

type CreatedCommandCommonInput = Omit<
  BuildActionLedgerMutationInput,
  | "actionVersion"
  | "actionKind"
  | "status"
  | "evaluatedRisk"
  | "targetType"
  | "targetId"
  | "capabilityId"
  | "capabilityVersion"
  | "idempotencyScope"
  | "idempotencyKey"
  | "idempotencyFingerprint"
  | "mutationDetail"
>

export interface ExecuteCreatedTargetCommandInput extends CreatedCommandCommonInput {
  context: ActionLedgerRequestContextValues
  actionVersion: string
  actionKind?: Extract<ActionLedgerEntry["actionKind"], "create" | "execute">
  evaluatedRisk: ActionLedgerCapabilityRisk
  commandTarget: { type: string; id: string }
  canonicalTargetType: string
  resultReferenceType: string
  parentAnchor?: BuildCreatedTargetCommandFingerprintInput["parentAnchor"]
  capabilityId: string
  capabilityVersion: string
  approvalPolicy: ActionLedgerCapabilityApprovalPolicy
  /** Selected graph policy name. Required when `approvalPolicy` is `required`. */
  approvalPolicyName?: string | null
  approvalReasonCode: string | null
  commandInput?: unknown
  idempotency: {
    scope: string
    key: string
    fingerprint: string
  }
  /**
   * Request-scoped controls propagated from the handler-owned Tool dispatch.
   * Approval and causation ledger fields are derived from these controls and
   * the validated approval; callers must not supply those fields directly.
   */
  approvalControls?: {
    approvalId: string
    idempotencyKey: string
    idempotencyFingerprint: string
    reasonCode?: string | null
  }
  mutationDetail?: Omit<
    NonNullable<BuildActionLedgerMutationInput["mutationDetail"]>,
    "commandResultRef"
  >
}

export interface CreatedTargetCommandResultMetadata<TReferenceType extends string = string> {
  entry: ActionLedgerEntry
  reference: {
    type: TReferenceType
    id: string
    value: CreatedTargetCommandResultReference<TReferenceType>
  }
}

export interface CreatedTargetCommandMutation<TValue> {
  value: TValue
  targetId: string
  mutationDetail?: Omit<
    NonNullable<BuildActionLedgerMutationInput["mutationDetail"]>,
    "commandResultRef"
  >
  payloads?: AppendActionLedgerEntryInput["payloads"]
}

export interface CreatedTargetMutationLease {
  readonly claimActionId: string
}

export interface CreatedTargetMutationLeaseIdentity {
  actionName: string
  actionVersion: string
  commandTarget: { type: string; id: string }
  canonicalTargetType: string
  resultReferenceType: string
}

class CreatedTargetMutationLeaseImpl implements CreatedTargetMutationLease {
  readonly #tx: AnyDrizzleDb
  readonly #identity: CreatedTargetMutationLeaseIdentity
  #consumed = false

  constructor(
    tx: AnyDrizzleDb,
    readonly claimActionId: string,
    identity: CreatedTargetMutationLeaseIdentity,
  ) {
    this.#tx = tx
    this.#identity = identity
  }

  consume(tx: AnyDrizzleDb, expected: CreatedTargetMutationLeaseIdentity): boolean {
    if (
      this.#consumed ||
      this.#tx !== tx ||
      this.#identity.actionName !== expected.actionName ||
      this.#identity.actionVersion !== expected.actionVersion ||
      this.#identity.commandTarget.type !== expected.commandTarget.type ||
      this.#identity.commandTarget.id !== expected.commandTarget.id ||
      this.#identity.canonicalTargetType !== expected.canonicalTargetType ||
      this.#identity.resultReferenceType !== expected.resultReferenceType
    ) {
      return false
    }
    this.#consumed = true
    return true
  }
}

export function consumeCreatedTargetMutationLease(
  value: unknown,
  tx: AnyDrizzleDb,
  expected: CreatedTargetMutationLeaseIdentity,
): asserts value is CreatedTargetMutationLease {
  if (!(value instanceof CreatedTargetMutationLeaseImpl) || !value.consume(tx, expected)) {
    throw new ActionLedgerCreatedCommandProtocolError("invalid_mutation_lease")
  }
}

export interface ExecuteCreatedTargetCommandHandlers<TValue, TReferenceType extends string> {
  create: (
    tx: AnyDrizzleDb,
    lease: CreatedTargetMutationLease,
  ) => Promise<CreatedTargetCommandMutation<TValue>>
  replay: (
    tx: AnyDrizzleDb,
    result: CreatedTargetCommandResultMetadata<TReferenceType>,
  ) => Promise<TValue>
}

export type ExecuteCreatedTargetCommandResult<TValue, TReferenceType extends string = string> =
  | {
      replayed: false
      value: TValue
      result: CreatedTargetCommandResultMetadata<TReferenceType>
    }
  | {
      replayed: true
      value: TValue
      result: CreatedTargetCommandResultMetadata<TReferenceType>
    }

export interface ExecuteAdmittedCreatedTargetCommandInput<TReferenceType extends string> {
  db: AnyDrizzleDb
  context: ActionLedgerRequestContextValues
  admitted: ToolHandlerActionPolicyContext
  /** Optional compatibility copy; the admitted `_voyant` invocation remains authoritative. */
  idempotencyKey?: string
  commandTargetType: string
  /**
   * Stable package-owned command target identity. Defaults to the admitted
   * idempotency key for commands whose established protocol used that key.
   */
  commandTargetId?: string
  /** Established audit route retained for exact replay compatibility. */
  routeOrToolName?: string
  canonicalTargetType: string
  resultReferenceType: TReferenceType
  commandInput: unknown
  evaluatedRisk: ActionLedgerCapabilityRisk
}

export interface ExecuteAdmittedExistingTargetCommandInput<TCommandPayload = unknown> {
  db: AnyDrizzleDb
  context: ActionLedgerRequestContextValues
  admitted: ToolHandlerActionPolicyContext
  commandInput: TCommandPayload
  evaluatedRisk: ActionLedgerCapabilityRisk
  /** Optional compatibility copy; the admitted `_voyant` invocation remains authoritative. */
  idempotencyKey?: string
  /** Optional compatibility copy; commandTargetField remains authoritative. */
  targetId?: string
  /** Human-readable immutable consequence preview attached to the approval request. */
  approvalMutationDetail?: Omit<
    NonNullable<BuildActionLedgerMutationInput["mutationDetail"]>,
    "commandResultRef"
  >
  /** Additional safe metadata returned with the approval-required Tool error. */
  approvalErrorMetadata?: Readonly<Record<string, unknown>>
}

export interface AdmittedExistingTargetCommand {
  readonly action: {
    readonly name: string
    readonly version: string
    readonly capabilityId: string
    readonly capabilityVersion: string
    readonly routeOrToolName: string
  }
  readonly target: {
    readonly type: string
    readonly id: string
  }
  readonly idempotency: {
    readonly scope: string
    readonly key: string
    readonly fingerprint: string
  }
  readonly authorization: {
    readonly principalType: ActionLedgerEntry["principalType"]
    readonly principalId: string
    readonly organizationId: string | null
  }
  readonly causation: {
    readonly claimActionId: string
    readonly requestedActionId: string | null
    readonly approvalId: string | null
  }
}

export type ExistingTargetCommandPayload<T> = T extends (...args: never[]) => unknown
  ? never
  : T extends readonly (infer TItem)[]
    ? readonly ExistingTargetCommandPayload<TItem>[]
    : T extends object
      ? { readonly [TKey in keyof T]: ExistingTargetCommandPayload<T[TKey]> }
      : T

export interface ExecuteAdmittedExistingTargetCommandHandlers<TValue, TCommandPayload> {
  /**
   * Persists the package-owned durable operation intent inside the same
   * transaction as the immutable action-ledger claim. It must not perform the
   * external effect. Throwing rolls back both claim and intent.
   */
  prepare(
    tx: AnyDrizzleDb,
    command: AdmittedExistingTargetCommand,
    payload: ExistingTargetCommandPayload<TCommandPayload>,
  ): Promise<void>
  /**
   * Starts the already-persisted package-owned durable operation after the
   * immutable ledger claim and intent commit.
   */
  execute(
    command: AdmittedExistingTargetCommand,
    payload: ExistingTargetCommandPayload<TCommandPayload>,
  ): Promise<TValue>
  /**
   * Resolves or resumes the package-owned durable operation for an exact
   * command replay. This path never receives request-scoped transport context.
   */
  replay(
    command: AdmittedExistingTargetCommand,
    payload: ExistingTargetCommandPayload<TCommandPayload>,
  ): Promise<TValue>
}

export type ExecuteAdmittedExistingTargetCommandResult<TValue> =
  | { replayed: false; value: TValue; command: AdmittedExistingTargetCommand }
  | { replayed: true; value: TValue; command: AdmittedExistingTargetCommand }

/**
 * Execute a handler-admitted created-target command using the selected graph
 * action as ledger identity and the selected Tool capability as its route.
 */
export async function executeAdmittedCreatedTargetCommand<TValue, TReferenceType extends string>(
  input: ExecuteAdmittedCreatedTargetCommandInput<TReferenceType>,
  handlers: ExecuteCreatedTargetCommandHandlers<TValue, TReferenceType>,
): Promise<ExecuteCreatedTargetCommandResult<TValue, TReferenceType>> {
  assertAuthenticHandlerActionPolicyContext(input.admitted)
  const principal = mapActionLedgerRequestContext(input.context)
  const selected = input.admitted.actionPolicy
  const createdTarget = selected.createdTarget
  const idempotencyKey = input.admitted.invocation.idempotencyKey?.trim()
  const commandTargetId = input.commandTargetId ?? idempotencyKey
  const routeOrToolName = input.routeOrToolName ?? input.admitted.capabilityId
  if (
    selected.kind !== "execute" ||
    selected.ledger !== "required" ||
    selected.enforcement !== "handler" ||
    selected.targetLifecycle !== "created" ||
    !createdTarget ||
    createdTarget.durability !== "handler-command-claim-v1" ||
    createdTarget.commandTargetType !== input.commandTargetType ||
    selected.targetType !== input.canonicalTargetType ||
    createdTarget.resultReferenceType !== input.resultReferenceType ||
    selected.risk !== input.evaluatedRisk ||
    selected.approval !== "never" ||
    !idempotencyKey ||
    !commandTargetId?.trim() ||
    !routeOrToolName.trim() ||
    (input.idempotencyKey !== undefined && input.idempotencyKey !== idempotencyKey)
  ) {
    throw new ActionLedgerCreatedCommandProtocolError("admitted_policy_mismatch")
  }
  assertCreatedTargetParentAnchor(createdTarget.parentAnchor, input.commandInput)
  const command = {
    actionName: selected.id,
    actionVersion: selected.version,
    commandTarget: { type: createdTarget.commandTargetType, id: commandTargetId },
    canonicalTargetType: selected.targetType,
    resultReferenceType: input.resultReferenceType,
    parentAnchor: createdTarget.parentAnchor,
    commandInput: input.commandInput,
    capabilityId: selected.capabilityId,
    capabilityVersion: selected.version,
    evaluatedRisk: selected.risk,
    approvalPolicy: "none" as const,
    approvalReasonCode: null,
  }
  const fingerprint = await buildCreatedTargetCommandFingerprint(command)
  const scope = await buildCreatedTargetIdempotencyScope({
    actionName: command.actionName,
    actionVersion: command.actionVersion,
    principalType: principal.principalType,
    principalId: principal.principalId,
    organizationId: principal.organizationId,
  })
  return executeCreatedTargetCommand(
    input.db,
    {
      context: input.context,
      ...command,
      routeOrToolName,
      authorizationSource: "selected_graph_mcp_handler",
      idempotency: { scope, key: idempotencyKey, fingerprint },
    },
    handlers,
  )
}

/**
 * Admit one existing-target command, then delegate first execution or exact
 * replay to the package-owned durable result protocol.
 *
 * Only the immutable admitted command crosses the transaction boundary. The
 * raw request context is deliberately not forwarded to either handler.
 */
export async function executeAdmittedExistingTargetCommand<TValue, TCommandPayload>(
  input: ExecuteAdmittedExistingTargetCommandInput<TCommandPayload>,
  handlers: ExecuteAdmittedExistingTargetCommandHandlers<TValue, TCommandPayload>,
): Promise<ExecuteAdmittedExistingTargetCommandResult<TValue>> {
  assertAuthenticHandlerActionPolicyContext(input.admitted)
  const payload = freezeCommandPayload(input.commandInput)
  const principal = mapActionLedgerRequestContext(input.context)
  if (principal.principalId === "unknown_request") {
    throw new TypeError("Existing-target command execution requires a concrete request principal")
  }
  const selected = input.admitted.actionPolicy
  const existingTarget = selected.existingTarget
  const commandTargetField = selected.commandTargetField?.trim()
  const idempotencyKey = input.admitted.invocation.idempotencyKey?.trim()
  if (
    selected.kind !== "execute" ||
    selected.ledger !== "required" ||
    selected.enforcement !== "handler" ||
    selected.targetLifecycle !== "existing" ||
    existingTarget?.durability !== "handler-command-result-v1" ||
    !commandTargetField ||
    selected.risk !== input.evaluatedRisk ||
    (selected.approval !== "never" && selected.approval !== "required") ||
    !idempotencyKey ||
    (input.idempotencyKey !== undefined && input.idempotencyKey !== idempotencyKey)
  ) {
    throw new ActionLedgerCreatedCommandProtocolError("admitted_policy_mismatch")
  }
  const targetId = existingTargetId(payload, commandTargetField)
  if (input.targetId !== undefined && input.targetId !== targetId) {
    throw new ActionLedgerCreatedCommandProtocolError("admitted_policy_mismatch")
  }
  const actionName = requiredValue(selected.capabilityId, "capability id")
  const approvalPolicy = selected.approval === "required" ? "required" : "none"
  const approvalReasonCode = input.admitted.invocation.reasonCode ?? null
  const fingerprint = await buildActionApprovalCommandFingerprint({
    actionName,
    actionVersion: selected.version,
    targetType: selected.targetType,
    targetId,
    commandInput: payload,
    approvalPolicy,
    capabilityId: actionName,
    capabilityVersion: selected.version,
    evaluatedRisk: selected.risk,
    reasonCode: approvalReasonCode,
  })
  const scope = await buildExistingTargetIdempotencyScope({
    actionName,
    actionVersion: selected.version,
    principalType: principal.principalType,
    principalId: principal.principalId,
    organizationId: principal.organizationId,
  })
  if (
    selected.approval === "never" &&
    (input.admitted.invocation.approvalId || input.admitted.invocation.idempotencyFingerprint)
  ) {
    throw new ActionLedgerCreatedCommandProtocolError("forged_approval_linkage")
  }
  if (selected.approval === "required" && !input.admitted.invocation.approvalId?.trim()) {
    await throwHandlerApprovalRequired({
      db: input.db,
      context: input.context,
      principal,
      actionName,
      actionVersion: selected.version,
      evaluatedRisk: selected.risk,
      policyName: selected.policy,
      targetType: selected.targetType,
      targetId,
      capabilityId: actionName,
      routeOrToolName: input.admitted.capabilityId,
      idempotencyKey,
      fingerprint,
      reasonCode: approvalReasonCode,
      mutationDetail: input.approvalMutationDetail,
      errorMetadata: input.approvalErrorMetadata,
    })
  }
  const approvalControls =
    selected.approval === "required"
      ? {
          approvalId: input.admitted.invocation.approvalId ?? "",
          idempotencyKey,
          idempotencyFingerprint: input.admitted.invocation.idempotencyFingerprint ?? "",
          reasonCode: input.admitted.invocation.reasonCode ?? null,
        }
      : undefined
  const commandInput: ExecuteCreatedTargetCommandInput & { resultReferenceType: string } = {
    context: input.context,
    actionName,
    actionVersion: selected.version,
    actionKind: "execute",
    evaluatedRisk: selected.risk,
    commandTarget: { type: selected.targetType, id: targetId },
    canonicalTargetType: selected.targetType,
    resultReferenceType: selected.targetType,
    capabilityId: actionName,
    capabilityVersion: selected.version,
    approvalPolicy,
    approvalPolicyName: selected.policy ?? null,
    approvalReasonCode,
    commandInput: payload,
    idempotency: { scope, key: idempotencyKey, fingerprint },
    ...(approvalControls ? { approvalControls } : {}),
    routeOrToolName: input.admitted.capabilityId,
    authorizationSource: "selected_graph_mcp_handler_existing_target",
  }
  const expectedClaim = buildActionLedgerMutationEntryInput({
    ...commandInput,
    actionKind: "execute",
    status: "requested",
    targetType: selected.targetType,
    targetId,
    capabilityId: actionName,
    capabilityVersion: selected.version,
    idempotencyScope: existingClaimScope(scope),
    idempotencyKey,
    idempotencyFingerprint: fingerprint,
    mutationDetail: {
      ...input.approvalMutationDetail,
      summary:
        input.approvalMutationDetail?.summary ??
        `Handler-owned Tool ${input.admitted.canonicalName} admitted durable existing-target command`,
      commandResultRef: null,
      reversalKind: "none",
    },
  })
  const prepared: PreparedCreatedCommand<string> = {
    expectedClaim,
    canonicalTargetType: selected.targetType,
    resultReferenceType: selected.targetType,
    idempotency: { scope, key: idempotencyKey, fingerprint },
  }
  const approval = prepareApproval(commandInput, prepared)
  const admission = await requiredTransaction(input.db, async (tx) => {
    if (approval) {
      await lockCommand(tx, "existing-command-approval", approval.approvalId)
    }
    await lockCommand(tx, scope, idempotencyKey)
    const existing = await findClaim(tx, existingClaimScope(scope), idempotencyKey)
    if (existing) {
      if (approval) {
        assertApprovalReplayClaimIdentity(existing, prepared.expectedClaim, approval.approvalId)
      }
      const exactClaim = approval
        ? await approvedReplayExpectedClaim(tx, commandInput, prepared, approval)
        : prepared.expectedClaim
      assertExactEntry(existing, exactClaim)
      return { replayed: true as const, command: existingTargetCommand(existing, scope) }
    }
    const exactClaim = approval
      ? await approvedLiveExpectedClaim(tx, commandInput, prepared, approval)
      : prepared.expectedClaim
    if (approval) await assertApprovalUnused(tx, exactClaim)
    const inserted = await insertEntry(tx, exactClaim)
    const command = existingTargetCommand(inserted.entry, scope)
    await handlers.prepare(tx, command, payload)
    const current = await findClaim(tx, existingClaimScope(scope), idempotencyKey)
    if (!current || current.id !== inserted.entry.id) {
      throw new ActionLedgerCreatedCommandProtocolError("claim_changed_during_mutation")
    }
    assertExactEntry(current, exactClaim)
    return { replayed: false as const, command }
  })
  const value = admission.replayed
    ? await handlers.replay(admission.command, payload)
    : await handlers.execute(admission.command, payload)
  return { ...admission, value }
}

function freezeCommandPayload<TCommandPayload>(
  value: TCommandPayload,
): ExistingTargetCommandPayload<TCommandPayload> {
  return cloneJsonCommandPayload(
    value,
    new WeakSet(),
  ) as ExistingTargetCommandPayload<TCommandPayload>
}

function cloneJsonCommandPayload(value: unknown, ancestors: WeakSet<object>): unknown {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Object.is(value, -0) ? 0 : value
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value
  }
  if (typeof value !== "object") {
    throw new ActionLedgerCreatedCommandProtocolError("invalid_command_payload")
  }
  if (ancestors.has(value)) {
    throw new ActionLedgerCreatedCommandProtocolError("invalid_command_payload")
  }
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw new ActionLedgerCreatedCommandProtocolError("invalid_command_payload")
      }
      const descriptors = Object.getOwnPropertyDescriptors(value)
      const allowedKeys = new Set(["length"])
      for (let index = 0; index < value.length; index += 1) {
        allowedKeys.add(String(index))
      }
      if (
        Reflect.ownKeys(descriptors).some((key) => {
          if (typeof key !== "string" || !allowedKeys.has(key)) return true
          if (key === "length") return false
          const descriptor = descriptors[key]
          return !descriptor?.enumerable || !("value" in descriptor)
        })
      ) {
        throw new ActionLedgerCreatedCommandProtocolError("invalid_command_payload")
      }
      const cloned: unknown[] = []
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          throw new ActionLedgerCreatedCommandProtocolError("invalid_command_payload")
        }
        cloned.push(cloneJsonCommandPayload(descriptors[index]?.value, ancestors))
      }
      return Object.freeze(cloned)
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new ActionLedgerCreatedCommandProtocolError("invalid_command_payload")
    }
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const ownKeys = Reflect.ownKeys(descriptors)
    if (
      ownKeys.some(
        (key) =>
          typeof key !== "string" ||
          !descriptors[key]?.enumerable ||
          !("value" in descriptors[key]),
      )
    ) {
      throw new ActionLedgerCreatedCommandProtocolError("invalid_command_payload")
    }
    const cloned: Record<string, unknown> = {}
    for (const key of Object.keys(descriptors).sort()) {
      Object.defineProperty(cloned, key, {
        value: cloneJsonCommandPayload(descriptors[key]?.value, ancestors),
        enumerable: true,
        configurable: false,
        writable: false,
      })
    }
    return Object.freeze(cloned)
  } finally {
    ancestors.delete(value)
  }
}

function existingTargetId(commandInput: unknown, field: string): string {
  if (!isPlainRecord(commandInput)) {
    throw new ActionLedgerCreatedCommandProtocolError("admitted_policy_mismatch")
  }
  const value = commandInput[field]
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw new ActionLedgerCreatedCommandProtocolError("admitted_policy_mismatch")
  }
  return value
}

function existingTargetCommand(
  claim: ActionLedgerEntry,
  scope: string,
): AdmittedExistingTargetCommand {
  return Object.freeze({
    action: Object.freeze({
      name: claim.actionName,
      version: claim.actionVersion,
      capabilityId: requiredValue(claim.capabilityId ?? "", "capability id"),
      capabilityVersion: requiredValue(claim.capabilityVersion ?? "", "capability version"),
      routeOrToolName: requiredValue(claim.routeOrToolName ?? "", "Tool route"),
    }),
    target: Object.freeze({
      type: claim.targetType,
      id: claim.targetId,
    }),
    idempotency: Object.freeze({
      scope,
      key: requiredValue(claim.idempotencyKey ?? "", "idempotency key"),
      fingerprint: requiredValue(claim.idempotencyFingerprint ?? "", "idempotency fingerprint"),
    }),
    authorization: Object.freeze({
      principalType: claim.principalType,
      principalId: claim.principalId,
      organizationId: claim.organizationId,
    }),
    causation: Object.freeze({
      claimActionId: claim.id,
      requestedActionId: claim.causationActionId,
      approvalId: claim.approvalId,
    }),
  })
}

function assertCreatedTargetParentAnchor(
  parentAnchor: NonNullable<
    ToolHandlerActionPolicyContext["actionPolicy"]["createdTarget"]
  >["parentAnchor"],
  commandInput: unknown,
): void {
  if (!parentAnchor) return
  if (!isPlainRecord(commandInput)) {
    throw new ActionLedgerCreatedCommandProtocolError("invalid_parent_anchor")
  }
  requiredAnchorValue(commandInput, parentAnchor.targetIdField)
  if (parentAnchor.targetTypeField) {
    requiredAnchorValue(commandInput, parentAnchor.targetTypeField)
  }
  if (parentAnchor.relatedTargetIdField) {
    requiredAnchorValue(commandInput, parentAnchor.relatedTargetIdField)
  }
}

function requiredAnchorValue(commandInput: Record<string, unknown>, field: string): string {
  const value = commandInput[field]
  if (typeof value !== "string" || !value.trim()) {
    throw new ActionLedgerCreatedCommandProtocolError("invalid_parent_anchor")
  }
  return value
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

interface CreatedCommandState<TReferenceType extends string> {
  claim: ActionLedgerEntry
  expectedClaim: AppendActionLedgerEntryInput
  canonicalTargetType: string
  resultReferenceType: TReferenceType
  idempotency: { scope: string; key: string; fingerprint: string }
}

interface PreparedCreatedCommand<TReferenceType extends string> {
  expectedClaim: AppendActionLedgerEntryInput
  canonicalTargetType: string
  resultReferenceType: TReferenceType
  idempotency: { scope: string; key: string; fingerprint: string }
}

interface PreparedCreatedCommandApproval {
  approvalId: string
  policyName: string
  principalType: ActionLedgerEntry["principalType"]
  principalId: string
}

/**
 * Owns BEGIN → claim → domain mutation → canonical result → COMMIT.
 *
 * The claim is never exposed. Domain code receives only the exact transaction
 * handle owned by this helper. Exact replays resolve their immutable result
 * through `handlers.replay` without invoking `handlers.create`.
 */
export async function executeCreatedTargetCommand<TValue, TReferenceType extends string>(
  db: AnyDrizzleDb,
  input: ExecuteCreatedTargetCommandInput & { resultReferenceType: TReferenceType },
  handlers: ExecuteCreatedTargetCommandHandlers<TValue, TReferenceType>,
): Promise<ExecuteCreatedTargetCommandResult<TValue, TReferenceType>> {
  const prepared = await prepareCommand(input)
  const approval = prepareApproval(input, prepared)
  return requiredTransaction(db, async (tx) => {
    if (approval) {
      await lockCommand(tx, "created-command-approval", approval.approvalId)
    }
    await lockCommand(tx, prepared.idempotency.scope, prepared.idempotency.key)
    const existing = await findClaim(
      tx,
      claimScope(prepared.idempotency.scope),
      prepared.idempotency.key,
    )
    if (existing) {
      if (approval) {
        assertApprovalReplayClaimIdentity(existing, prepared.expectedClaim, approval.approvalId)
      }
      const expectedClaim = approval
        ? await approvedReplayExpectedClaim(tx, input, prepared, approval)
        : prepared.expectedClaim
      assertExactEntry(existing, expectedClaim)
      const state = toState(existing, { ...prepared, expectedClaim })
      const result = await readCompletedResult(tx, state)
      return {
        replayed: true,
        value: await handlers.replay(tx, result),
        result,
      }
    }

    const expectedClaim = approval
      ? await approvedLiveExpectedClaim(tx, input, prepared, approval)
      : prepared.expectedClaim
    if (approval) {
      await assertApprovalUnused(tx, expectedClaim)
    }
    const inserted = await insertEntry(tx, expectedClaim)
    const state = toState(inserted.entry, { ...prepared, expectedClaim })
    const mutation = await handlers.create(
      tx,
      new CreatedTargetMutationLeaseImpl(tx, inserted.entry.id, {
        actionName: input.actionName,
        actionVersion: input.actionVersion,
        commandTarget: input.commandTarget,
        canonicalTargetType: input.canonicalTargetType,
        resultReferenceType: input.resultReferenceType,
      }),
    )
    await assertCurrentClaim(tx, state)
    if (await findResultEntry(tx, state)) {
      throw new ActionLedgerCreatedCommandProtocolError("result_created_during_mutation")
    }
    const result = await appendCompletedResult(tx, state, mutation)
    return { replayed: false, value: mutation.value, result }
  })
}

function assertApprovalReplayClaimIdentity(
  existing: ActionLedgerEntry,
  expectedClaim: AppendActionLedgerEntryInput,
  approvalId: string,
): void {
  if (!existing.causationActionId) {
    throw new ActionLedgerCreatedCommandApprovalError(approvalId, "mismatched_action")
  }
  assertExactEntry(existing, {
    ...expectedClaim,
    approvalId,
    causationActionId: existing.causationActionId,
  })
}

export async function buildCreatedTargetCommandFingerprint(
  input: BuildCreatedTargetCommandFingerprintInput,
): Promise<string> {
  return buildActionApprovalCommandFingerprint({
    actionName: requiredValue(input.actionName, "action name"),
    actionVersion: requiredValue(input.actionVersion, "action version"),
    targetType: requiredValue(input.commandTarget.type, "command target type"),
    targetId: requiredValue(input.commandTarget.id, "command target id"),
    commandInput: input.commandInput ?? null,
    approvalPolicy: input.approvalPolicy,
    capabilityId: requiredValue(input.capabilityId, "capability id"),
    capabilityVersion: requiredValue(input.capabilityVersion, "capability version"),
    evaluatedRisk: input.evaluatedRisk,
    reasonCode: input.approvalReasonCode,
    createdTarget: {
      canonicalTargetType: requiredValue(input.canonicalTargetType, "canonical target type"),
      resultReferenceType: validReferenceType(input.resultReferenceType),
      ...(input.parentAnchor ? { parentAnchor: input.parentAnchor } : {}),
    },
  })
}

export function createCreatedTargetCommandResultReference<TReferenceType extends string>(
  referenceType: TReferenceType,
  targetId: string,
): CreatedTargetCommandResultReference<TReferenceType> {
  return `${validReferenceType(referenceType)}:${requiredValue(targetId, "canonical target id")}`
}

export interface BuildCreatedTargetIdempotencyScopeInput {
  actionName: string
  actionVersion: string
  principalType: ActionLedgerEntry["principalType"]
  principalId: string
  organizationId: string | null
}

export type BuildExistingTargetIdempotencyScopeInput = BuildCreatedTargetIdempotencyScopeInput

/** Collision-safe scope binding a caller-selected key to exactly one target and payload. */
export async function buildExistingTargetIdempotencyScope(
  input: BuildExistingTargetIdempotencyScopeInput,
): Promise<string> {
  const digest = await sha256({
    protocol: "action-ledger-existing-target-scope-v1",
    actionName: requiredValue(input.actionName, "action name"),
    actionVersion: requiredValue(input.actionVersion, "action version"),
    principalType: requiredValue(input.principalType, "principal type"),
    principalId: requiredValue(input.principalId, "principal id"),
    organizationId: input.organizationId ?? null,
  })
  return `existing-target-command:v1:sha256:${digest}`
}

/** Collision-safe scope for caller-selected created-command keys. */
export async function buildCreatedTargetIdempotencyScope(
  input: BuildCreatedTargetIdempotencyScopeInput,
): Promise<string> {
  const digest = await sha256({
    protocol: "action-ledger-created-target-scope-v1",
    actionName: requiredValue(input.actionName, "action name"),
    actionVersion: requiredValue(input.actionVersion, "action version"),
    principalType: requiredValue(input.principalType, "principal type"),
    principalId: requiredValue(input.principalId, "principal id"),
    organizationId: input.organizationId ?? null,
  })
  return `created-target-command:v1:sha256:${digest}`
}

async function prepareCommand<TReferenceType extends string>(
  input: ExecuteCreatedTargetCommandInput & { resultReferenceType: TReferenceType },
): Promise<PreparedCreatedCommand<TReferenceType>> {
  const actor = mapActionLedgerRequestContext(input.context, input)
  if (actor.principalId === "unknown_request") {
    throw new TypeError("Created-target command execution requires a concrete request principal")
  }
  const actionName = requiredValue(input.actionName, "action name")
  const actionVersion = requiredValue(input.actionVersion, "action version")
  const commandTargetType = requiredValue(input.commandTarget.type, "command target type")
  const commandTargetId = requiredValue(input.commandTarget.id, "command target id")
  const canonicalTargetType = requiredValue(input.canonicalTargetType, "canonical target type")
  const resultReferenceType = validReferenceType(input.resultReferenceType)
  const scope = requiredValue(input.idempotency.scope, "idempotency scope")
  const key = requiredValue(input.idempotency.key, "idempotency key")
  const fingerprint = requiredValue(input.idempotency.fingerprint, "idempotency fingerprint")
  const expectedFingerprint = await buildCreatedTargetCommandFingerprint({
    actionName,
    actionVersion,
    commandTarget: { type: commandTargetType, id: commandTargetId },
    canonicalTargetType,
    resultReferenceType,
    parentAnchor: input.parentAnchor,
    commandInput: input.commandInput,
    capabilityId: input.capabilityId,
    capabilityVersion: input.capabilityVersion,
    evaluatedRisk: input.evaluatedRisk,
    approvalPolicy: input.approvalPolicy,
    approvalReasonCode: input.approvalReasonCode,
  })
  if (fingerprint !== expectedFingerprint) {
    throw new ActionLedgerCreatedCommandFingerprintMismatchError(expectedFingerprint, fingerprint)
  }
  if (input.approvalPolicy === "conditional") {
    throw new ActionLedgerCreatedCommandProtocolError("approval_policy_unsupported")
  }
  if (input.approvalPolicy === "none" && (input.approvalControls || input.approvalId)) {
    throw new ActionLedgerCreatedCommandProtocolError("forged_approval_linkage")
  }
  if (input.approvalPolicy === "required" && (input.approvalId || input.causationActionId)) {
    throw new ActionLedgerCreatedCommandProtocolError("forged_approval_linkage")
  }

  const expectedClaim = buildActionLedgerMutationEntryInput({
    ...input,
    actionName,
    actionVersion,
    actionKind: input.actionKind ?? "create",
    status: "requested",
    targetType: commandTargetType,
    targetId: commandTargetId,
    capabilityId: requiredValue(input.capabilityId, "capability id"),
    capabilityVersion: requiredValue(input.capabilityVersion, "capability version"),
    idempotencyScope: claimScope(scope),
    idempotencyKey: key,
    idempotencyFingerprint: fingerprint,
    mutationDetail: {
      ...input.mutationDetail,
      commandResultRef: null,
      reversalKind: input.mutationDetail?.reversalKind ?? "none",
    },
  })
  return {
    expectedClaim,
    canonicalTargetType,
    resultReferenceType,
    idempotency: { scope, key, fingerprint },
  }
}

async function throwHandlerApprovalRequired(input: {
  db: AnyDrizzleDb
  context: ActionLedgerRequestContextValues
  principal: ReturnType<typeof mapActionLedgerRequestContext>
  actionName: string
  actionVersion: string
  evaluatedRisk: ActionLedgerCapabilityRisk
  policyName: string | null | undefined
  targetType: string
  targetId: string
  capabilityId: string
  routeOrToolName: string
  idempotencyKey: string
  fingerprint: string
  reasonCode: string | null
  mutationDetail?: Omit<
    NonNullable<BuildActionLedgerMutationInput["mutationDetail"]>,
    "commandResultRef"
  >
  errorMetadata?: Readonly<Record<string, unknown>>
}): Promise<never> {
  const policyName = input.policyName?.trim()
  if (!policyName) {
    throw new ActionLedgerCreatedCommandProtocolError("invalid_approval_controls")
  }
  const result = await requestActionLedgerApproval(input.db, {
    context: input.context,
    actionName: input.actionName,
    actionVersion: input.actionVersion,
    actionKind: "execute",
    evaluatedRisk: input.evaluatedRisk,
    targetType: input.targetType,
    targetId: input.targetId,
    routeOrToolName: input.routeOrToolName,
    capabilityId: input.capabilityId,
    capabilityVersion: input.actionVersion,
    authorizationSource: "selected_graph_mcp_handler_existing_target",
    idempotencyScope: `${input.actionName}:${input.actionVersion}:handler-approval`,
    idempotencyKey: input.idempotencyKey,
    idempotencyFingerprint: input.fingerprint,
    mutationDetail: input.mutationDetail,
    approval: {
      requestedByPrincipalId: input.principal.principalId,
      policyName,
      policyVersion: input.actionVersion,
      riskSnapshot: input.evaluatedRisk,
      reasonCode: input.reasonCode,
    },
  })
  throw new ToolError(
    "This Tool action is awaiting approval. Approve the server-issued request, then retry the exact command.",
    "APPROVAL_REQUIRED",
    {
      approvalId: result.approval.id,
      requestedActionId: result.requestedAction.id,
      status: result.approval.status,
      requestId: input.idempotencyKey,
      idempotencyFingerprint: input.fingerprint,
      replayed: result.replayed,
      ...input.errorMetadata,
    },
  )
}

function prepareApproval<TReferenceType extends string>(
  input: ExecuteCreatedTargetCommandInput & { resultReferenceType: TReferenceType },
  prepared: PreparedCreatedCommand<TReferenceType>,
): PreparedCreatedCommandApproval | null {
  if (input.approvalPolicy === "none") return null
  if (input.approvalPolicy !== "required") {
    throw new ActionLedgerCreatedCommandProtocolError("approval_policy_unsupported")
  }

  const controls = input.approvalControls
  const policyName = input.approvalPolicyName?.trim()
  if (
    !controls ||
    !policyName ||
    controls.idempotencyKey.trim() !== prepared.idempotency.key ||
    controls.idempotencyFingerprint.trim() !== prepared.idempotency.fingerprint ||
    (controls.reasonCode ?? null) !== input.approvalReasonCode
  ) {
    throw new ActionLedgerCreatedCommandProtocolError("invalid_approval_controls")
  }
  const approvalId = requiredValue(controls.approvalId, "approval id")
  const actor = mapActionLedgerRequestContext(input.context, input)
  return {
    approvalId,
    policyName,
    principalType: actor.principalType,
    principalId: actor.principalId,
  }
}

async function approvedLiveExpectedClaim<TReferenceType extends string>(
  tx: AnyDrizzleDb,
  input: ExecuteCreatedTargetCommandInput & { resultReferenceType: TReferenceType },
  prepared: PreparedCreatedCommand<TReferenceType>,
  approval: PreparedCreatedCommandApproval,
): Promise<AppendActionLedgerEntryInput> {
  const validation = await actionLedgerService.validateApprovedAction(tx, {
    approvalId: approval.approvalId,
    actionName: prepared.expectedClaim.actionName,
    actionVersion: prepared.expectedClaim.actionVersion,
    requestedActionKind: "execute",
    requestedActionStatus: "awaiting_approval",
    targetType: prepared.expectedClaim.targetType,
    targetId: prepared.expectedClaim.targetId,
    routeOrToolName: prepared.expectedClaim.routeOrToolName,
    principalType: approval.principalType,
    principalId: approval.principalId,
    organizationId: prepared.expectedClaim.organizationId,
    requireApprovalProvenance: true,
    capabilityId: prepared.expectedClaim.capabilityId,
    capabilityVersion: prepared.expectedClaim.capabilityVersion,
    evaluatedRisk: prepared.expectedClaim.evaluatedRisk,
    policyName: approval.policyName,
    policyVersion: prepared.expectedClaim.actionVersion,
    reasonCode: input.approvalReasonCode,
    idempotencyKey: prepared.idempotency.key,
    idempotencyFingerprint: prepared.idempotency.fingerprint,
    executionActionKind: prepared.expectedClaim.actionKind,
    executionStatus: "succeeded",
  })
  if (!validation.ok) {
    throw new ActionLedgerCreatedCommandApprovalError(approval.approvalId, validation.reason)
  }
  return {
    ...prepared.expectedClaim,
    causationActionId: validation.requestedAction.id,
    approvalId: validation.approval.id,
  }
}

/**
 * Re-validates immutable approval continuity only after the exact persisted
 * command claim has been found under both approval and command locks. This is
 * intentionally private: the public validator always applies live expiry and
 * prior-execution authorization.
 */
async function approvedReplayExpectedClaim<TReferenceType extends string>(
  tx: AnyDrizzleDb,
  input: ExecuteCreatedTargetCommandInput & { resultReferenceType: TReferenceType },
  prepared: PreparedCreatedCommand<TReferenceType>,
  expectedApproval: PreparedCreatedCommandApproval,
): Promise<AppendActionLedgerEntryInput> {
  const result = await actionLedgerService.getApproval(tx, expectedApproval.approvalId)
  if (!result) return approvalFailure(expectedApproval.approvalId, "not_found")
  const { approval } = result
  if (approval.status !== "approved") {
    return approvalFailure(expectedApproval.approvalId, "not_approved")
  }
  const requestedAction = result.requestedAction?.entry
  if (
    !requestedAction ||
    approval.requestedActionId !== requestedAction.id ||
    requestedAction.actionName !== prepared.expectedClaim.actionName ||
    requestedAction.actionVersion !== prepared.expectedClaim.actionVersion ||
    requestedAction.actionKind !== "execute" ||
    requestedAction.status !== "awaiting_approval" ||
    requestedAction.targetType !== prepared.expectedClaim.targetType ||
    requestedAction.targetId !== prepared.expectedClaim.targetId ||
    requestedAction.routeOrToolName !== (prepared.expectedClaim.routeOrToolName ?? null) ||
    requestedAction.approvalId !== approval.id
  ) {
    return approvalFailure(expectedApproval.approvalId, "mismatched_action")
  }
  if (!requestedAction.idempotencyFingerprint) {
    return approvalFailure(expectedApproval.approvalId, "missing_fingerprint")
  }
  if (requestedAction.idempotencyFingerprint !== prepared.idempotency.fingerprint) {
    return approvalFailure(expectedApproval.approvalId, "fingerprint_mismatch")
  }
  if (
    requestedAction.principalType !== expectedApproval.principalType ||
    requestedAction.principalId !== expectedApproval.principalId ||
    approval.requestedByPrincipalId !== expectedApproval.principalId
  ) {
    return approvalFailure(expectedApproval.approvalId, "principal_mismatch")
  }
  if (requestedAction.organizationId !== prepared.expectedClaim.organizationId) {
    return approvalFailure(expectedApproval.approvalId, "organization_mismatch")
  }
  if (
    approval.assignedToPrincipalId &&
    approval.decidedByPrincipalId !== approval.assignedToPrincipalId
  ) {
    return approvalFailure(expectedApproval.approvalId, "assignee_mismatch")
  }
  if (
    requestedAction.capabilityId !== (prepared.expectedClaim.capabilityId ?? null) ||
    requestedAction.capabilityVersion !== (prepared.expectedClaim.capabilityVersion ?? null)
  ) {
    return approvalFailure(expectedApproval.approvalId, "capability_mismatch")
  }
  if (
    requestedAction.evaluatedRisk !== prepared.expectedClaim.evaluatedRisk ||
    approval.riskSnapshot !== prepared.expectedClaim.evaluatedRisk
  ) {
    return approvalFailure(expectedApproval.approvalId, "risk_mismatch")
  }
  if (
    approval.policyName !== expectedApproval.policyName ||
    approval.policyVersion !== prepared.expectedClaim.actionVersion
  ) {
    return approvalFailure(expectedApproval.approvalId, "policy_mismatch")
  }
  if (approval.reasonCode !== input.approvalReasonCode) {
    return approvalFailure(expectedApproval.approvalId, "reason_mismatch")
  }
  if (requestedAction.idempotencyKey !== prepared.idempotency.key) {
    return approvalFailure(expectedApproval.approvalId, "idempotency_key_mismatch")
  }
  return {
    ...prepared.expectedClaim,
    causationActionId: requestedAction.id,
    approvalId: approval.id,
  }
}

function approvalFailure(approvalId: string, reason: string): never {
  throw new ActionLedgerCreatedCommandApprovalError(approvalId, reason)
}

async function assertApprovalUnused(
  tx: AnyDrizzleDb,
  expectedClaim: AppendActionLedgerEntryInput,
): Promise<void> {
  const approvalId = requiredValue(expectedClaim.approvalId ?? "", "approval id")
  const requestedActionId = requiredValue(
    expectedClaim.causationActionId ?? "",
    "approval requested action id",
  )
  const idempotencyKey = requiredValue(expectedClaim.idempotencyKey ?? "", "idempotency key")
  const idempotencyFingerprint = requiredValue(
    expectedClaim.idempotencyFingerprint ?? "",
    "idempotency fingerprint",
  )
  const [row] = await tx
    .select({ approvedClaim: actionLedgerEntries })
    .from(actionLedgerEntries)
    .where(
      and(
        eq(actionLedgerEntries.actionName, expectedClaim.actionName),
        eq(actionLedgerEntries.actionVersion, expectedClaim.actionVersion),
        eq(actionLedgerEntries.actionKind, expectedClaim.actionKind),
        eq(actionLedgerEntries.status, "requested"),
        eq(actionLedgerEntries.targetType, expectedClaim.targetType),
        eq(actionLedgerEntries.targetId, expectedClaim.targetId),
        eq(actionLedgerEntries.causationActionId, requestedActionId),
        eq(actionLedgerEntries.approvalId, approvalId),
        eq(actionLedgerEntries.idempotencyKey, idempotencyKey),
        eq(actionLedgerEntries.idempotencyFingerprint, idempotencyFingerprint),
      ),
    )
    .limit(1)
  if (row?.approvedClaim) {
    throw new ActionLedgerCreatedCommandApprovalError(approvalId, "already_executed")
  }
}

async function requiredTransaction<T>(
  db: AnyDrizzleDb,
  run: (tx: AnyDrizzleDb) => Promise<T>,
): Promise<T> {
  if (dbSupportsTransactions(db) === false) {
    throw new ActionLedgerCreatedCommandTransactionRequiredError()
  }
  const transactional = db as AnyDrizzleDb & {
    transaction?: (callback: (tx: AnyDrizzleDb) => Promise<T>) => Promise<T>
  }
  if (typeof transactional.transaction !== "function") {
    throw new ActionLedgerCreatedCommandTransactionRequiredError()
  }
  return transactional.transaction(run)
}

async function lockCommand(tx: AnyDrizzleDb, scope: string, key: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${scope}:${key}`}, 0))`)
}

async function findClaim(
  tx: AnyDrizzleDb,
  idempotencyScope: string,
  idempotencyKey: string,
): Promise<ActionLedgerEntry | null> {
  const [row] = await tx
    .select({ claim: actionLedgerEntries })
    .from(actionLedgerEntries)
    .where(
      and(
        eq(actionLedgerEntries.idempotencyScope, idempotencyScope),
        eq(actionLedgerEntries.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1)
  return row?.claim ?? null
}

async function assertCurrentClaim<TReferenceType extends string>(
  tx: AnyDrizzleDb,
  state: CreatedCommandState<TReferenceType>,
): Promise<void> {
  const current = await findClaim(tx, claimScope(state.idempotency.scope), state.idempotency.key)
  if (!current || current.id !== state.claim.id) {
    throw new ActionLedgerCreatedCommandProtocolError("claim_changed_during_mutation")
  }
  const changedField = CLAIM_IDENTITY_FIELDS.find((field) => current[field] !== state.claim[field])
  if (changedField) {
    throw new ActionLedgerCreatedCommandProtocolError("claim_changed_during_mutation", changedField)
  }
}

async function findResultEntry<TReferenceType extends string>(
  tx: AnyDrizzleDb,
  state: CreatedCommandState<TReferenceType>,
): Promise<ActionLedgerEntry | null> {
  const [row] = await tx
    .select({ result: actionLedgerEntries })
    .from(actionLedgerEntries)
    .where(
      and(
        eq(actionLedgerEntries.idempotencyScope, resultScope(state.idempotency.scope)),
        eq(actionLedgerEntries.idempotencyKey, state.idempotency.key),
      ),
    )
    .limit(1)
  return row?.result ?? null
}

async function readCompletedResult<TReferenceType extends string>(
  tx: AnyDrizzleDb,
  state: CreatedCommandState<TReferenceType>,
): Promise<CreatedTargetCommandResultMetadata<TReferenceType>> {
  const entry = await findResultEntry(tx, state)
  if (!entry) throw new ActionLedgerCreatedCommandReplayIncompleteError(state.claim.id)
  assertResultIdentity(state, entry)
  const [detail] = await tx
    .select({ commandResultRef: actionMutationDetails.commandResultRef })
    .from(actionMutationDetails)
    .where(eq(actionMutationDetails.actionId, entry.id))
    .limit(1)
  const reference = parseResultReference(state, entry, detail?.commandResultRef ?? null)
  if (reference.id !== entry.targetId) {
    throw corrupt(state, entry, "result_target_id_mismatch")
  }
  return { entry, reference }
}

async function appendCompletedResult<TValue, TReferenceType extends string>(
  tx: AnyDrizzleDb,
  state: CreatedCommandState<TReferenceType>,
  mutation: CreatedTargetCommandMutation<TValue>,
): Promise<CreatedTargetCommandResultMetadata<TReferenceType>> {
  const targetId = requiredValue(mutation.targetId, "canonical target id")
  const commandResultRef = createCreatedTargetCommandResultReference(
    state.resultReferenceType,
    targetId,
  )
  const inserted = await insertEntry(tx, {
    ...copyClaimEntry(state.claim),
    status: "succeeded",
    targetType: state.canonicalTargetType,
    targetId,
    causationActionId: state.claim.id,
    idempotencyScope: resultScope(state.idempotency.scope),
    idempotencyKey: state.idempotency.key,
    idempotencyFingerprint: state.idempotency.fingerprint,
    payloads: mutation.payloads,
    mutationDetail: {
      ...mutation.mutationDetail,
      commandResultRef,
      reversalKind: mutation.mutationDetail?.reversalKind ?? "none",
    },
  })
  return {
    entry: inserted.entry,
    reference: {
      type: state.resultReferenceType,
      id: targetId,
      value: commandResultRef,
    },
  }
}

function assertExactEntry(actual: ActionLedgerEntry, expected: AppendActionLedgerEntryInput): void {
  for (const field of CLAIM_IDENTITY_FIELDS) {
    // Drizzle/PostgreSQL persist omitted nullable columns as null. Treat an
    // omitted expected field as that canonical database representation so an
    // exact replay does not conflict solely on undefined-versus-null.
    if (actual[field] !== (expected[field] ?? null)) {
      throw new ActionLedgerIdempotencyConflictError(actual.id)
    }
  }
}

function assertResultIdentity<TReferenceType extends string>(
  state: CreatedCommandState<TReferenceType>,
  entry: ActionLedgerEntry,
): void {
  if (entry.actionName !== state.claim.actionName) {
    throw corrupt(state, entry, "result_action_mismatch")
  }
  if (entry.idempotencyFingerprint !== state.idempotency.fingerprint) {
    throw corrupt(state, entry, "result_fingerprint_mismatch")
  }
  if (entry.targetType !== state.canonicalTargetType) {
    throw corrupt(state, entry, "result_target_type_mismatch")
  }
  for (const field of RESULT_CONTINUITY_FIELDS) {
    if (entry[field] !== state.claim[field]) {
      throw corrupt(state, entry, "result_identity_mismatch")
    }
  }
  if (
    entry.status !== "succeeded" ||
    entry.causationActionId !== state.claim.id ||
    entry.idempotencyScope !== resultScope(state.idempotency.scope) ||
    entry.idempotencyKey !== state.idempotency.key ||
    entry.approvalId !== state.claim.approvalId
  ) {
    throw corrupt(state, entry, "result_identity_mismatch")
  }
}

function parseResultReference<TReferenceType extends string>(
  state: CreatedCommandState<TReferenceType>,
  entry: ActionLedgerEntry,
  value: string | null,
): CreatedTargetCommandResultMetadata<TReferenceType>["reference"] {
  if (!value) throw corrupt(state, entry, "malformed_result_reference")
  const separator = value.indexOf(":")
  if (separator <= 0 || separator === value.length - 1) {
    throw corrupt(state, entry, "malformed_result_reference")
  }
  const type = value.slice(0, separator)
  const rawId = value.slice(separator + 1)
  const id = rawId.trim()
  if (!id) throw corrupt(state, entry, "malformed_result_reference")
  if (type !== state.resultReferenceType) {
    throw corrupt(state, entry, "wrong_result_reference_type")
  }
  if (value !== `${state.resultReferenceType}:${id}`) {
    throw corrupt(state, entry, "malformed_result_reference")
  }
  return {
    type: state.resultReferenceType,
    id,
    value: value as CreatedTargetCommandResultReference<TReferenceType>,
  }
}

function toState<TReferenceType extends string>(
  claim: ActionLedgerEntry,
  prepared: {
    expectedClaim: AppendActionLedgerEntryInput
    canonicalTargetType: string
    resultReferenceType: TReferenceType
    idempotency: { scope: string; key: string; fingerprint: string }
  },
): CreatedCommandState<TReferenceType> {
  // Keep an immutable value snapshot rather than the driver's row object. This
  // lets the post-mutation re-read detect an in-transaction claim change even
  // when a test double or adapter reuses object identities for selected rows.
  return { claim: { ...claim }, ...prepared }
}

function copyClaimEntry(
  entry: ActionLedgerEntry,
): Omit<
  AppendActionLedgerEntryInput,
  | "status"
  | "targetType"
  | "targetId"
  | "causationActionId"
  | "idempotencyScope"
  | "idempotencyKey"
  | "idempotencyFingerprint"
> {
  return {
    actionName: entry.actionName,
    actionVersion: entry.actionVersion,
    actionKind: entry.actionKind,
    evaluatedRisk: entry.evaluatedRisk,
    actorType: entry.actorType,
    principalType: entry.principalType,
    principalId: entry.principalId,
    principalSubtype: entry.principalSubtype,
    sessionId: entry.sessionId,
    apiTokenId: entry.apiTokenId,
    internalRequest: entry.internalRequest,
    delegatedByPrincipalType: entry.delegatedByPrincipalType,
    delegatedByPrincipalId: entry.delegatedByPrincipalId,
    delegationId: entry.delegationId,
    callerType: entry.callerType,
    organizationId: entry.organizationId,
    routeOrToolName: entry.routeOrToolName,
    workflowRunId: entry.workflowRunId,
    workflowStepId: entry.workflowStepId,
    correlationId: entry.correlationId,
    capabilityId: entry.capabilityId,
    capabilityVersion: entry.capabilityVersion,
    authorizationSource: entry.authorizationSource,
    approvalId: entry.approvalId,
    amendsActionId: null,
  }
}

function corrupt<TReferenceType extends string>(
  state: CreatedCommandState<TReferenceType>,
  entry: ActionLedgerEntry,
  reason: ActionLedgerCreatedCommandReplayCorruptReason,
): ActionLedgerCreatedCommandReplayCorruptError {
  return new ActionLedgerCreatedCommandReplayCorruptError(state.claim.id, entry.id, reason)
}

const CLAIM_IDENTITY_FIELDS = [
  "actionName",
  "actionVersion",
  "actionKind",
  "status",
  "evaluatedRisk",
  "actorType",
  "principalType",
  "principalId",
  "principalSubtype",
  "internalRequest",
  "delegatedByPrincipalType",
  "delegatedByPrincipalId",
  "delegationId",
  "organizationId",
  "routeOrToolName",
  "causationActionId",
  "idempotencyScope",
  "idempotencyKey",
  "idempotencyFingerprint",
  "targetType",
  "targetId",
  "capabilityId",
  "capabilityVersion",
  "authorizationSource",
  "approvalId",
] as const satisfies readonly (keyof ActionLedgerEntry)[]

const RESULT_CONTINUITY_FIELDS = [
  "actionVersion",
  "actionKind",
  "evaluatedRisk",
  "actorType",
  "principalType",
  "principalId",
  "principalSubtype",
  "sessionId",
  "apiTokenId",
  "internalRequest",
  "delegatedByPrincipalType",
  "delegatedByPrincipalId",
  "delegationId",
  "callerType",
  "organizationId",
  "routeOrToolName",
  "workflowRunId",
  "workflowStepId",
  "correlationId",
  "capabilityId",
  "capabilityVersion",
  "authorizationSource",
] as const satisfies readonly (keyof ActionLedgerEntry)[]

function claimScope(scope: string): string {
  return `${scope}${CLAIM_SCOPE_SUFFIX}`
}

function existingClaimScope(scope: string): string {
  return `${scope}${EXISTING_CLAIM_SCOPE_SUFFIX}`
}

function resultScope(scope: string): string {
  return `${scope}${RESULT_SCOPE_SUFFIX}`
}

function requiredValue(value: string, label: string): string {
  const normalized = value.trim()
  if (!normalized) throw new TypeError(`Created-target command ${label} is required`)
  return normalized
}

function validReferenceType<TReferenceType extends string>(value: TReferenceType): TReferenceType {
  const normalized = requiredValue(value, "result reference type")
  if (normalized.includes(":")) {
    throw new TypeError("Created-target command result reference type cannot contain ':'")
  }
  return normalized as TReferenceType
}
