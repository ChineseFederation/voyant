import type { VoyantGraphActionDeclaration } from "@voyant-travel/core/project"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import {
  type ToolActionPolicyExecutionInput,
  type ToolActionPolicyGate,
  ToolError,
} from "@voyant-travel/tools"

import {
  buildActionApprovalCommandFingerprint,
  buildIdempotencyFingerprint,
} from "./fingerprint.js"
import {
  type ActionLedgerRequestContextValues,
  appendActionLedgerMutation,
  appendActionLedgerSensitiveRead,
  mapActionLedgerRequestContext,
  requestActionLedgerApproval,
} from "./request-context.js"
import type { ActionLedgerEntry } from "./schema.js"
import { actionLedgerService } from "./service.js"

export interface CreateToolActionPolicyGateInput {
  db: AnyDrizzleDb
  selectedActions: readonly VoyantGraphActionDeclaration[]
  requestContext: ActionLedgerRequestContextValues
}

/**
 * Gate generic Tool execution with the selected graph action and the existing
 * action-ledger approval/idempotency model. The requested preflight is written
 * before domain dispatch so a missing ledger can never degrade to an unlogged
 * mutation; success/failure is then appended with the same exact fingerprint.
 */
export function createToolActionPolicyGate(
  input: CreateToolActionPolicyGateInput,
): ToolActionPolicyGate {
  return {
    async execute<T>(execution: ToolActionPolicyExecutionInput, dispatch: () => Promise<T>) {
      const selected = resolveSelectedAction(input.selectedActions, execution)
      assertConfirmation(execution)
      assertActorAllowed(selected, input.requestContext.actor)

      if (selected.approval === "conditional") {
        throw new ToolError(
          "Conditional graph approval requires a package-owned evaluator; generic dispatch fails closed.",
          "APPROVAL_REQUIRED",
          { actionId: selected.id },
        )
      }
      if (selected.kind !== "execute" && selected.approval === "required") {
        throw new ToolError(
          "Approval-required graph actions must use an executable domain command; refusing read dispatch.",
          "APPROVAL_REQUIRED",
          { actionId: selected.id, kind: selected.kind },
        )
      }
      if (selected.targetLifecycle === "created") {
        throw new ToolError(
          "Created-target actions require a handler-owned durable command claim; generic dispatch fails closed.",
          "ACTION_POLICY_REQUIRED",
          { actionId: selected.id, durability: selected.createdTarget?.durability ?? null },
        )
      }
      if (selected.existingTarget?.durability === "handler-command-result-v1") {
        throw new ToolError(
          "Existing-target durable result actions require handler-owned replay resolution; generic dispatch fails closed.",
          "ACTION_POLICY_REQUIRED",
          { actionId: selected.id, durability: selected.existingTarget.durability },
        )
      }

      if (selected.ledger === "optional" && selected.approval !== "required") {
        return dispatch()
      }

      const serverOwnedTarget = execution.actionPolicy.invocation.targetResolution !== undefined
      const targetId = serverOwnedTarget
        ? requiredResolvedTarget(execution)
        : requiredInvocationString(execution, "targetId")
      assertCommandTargetMatches(selected, execution, targetId)
      const principal = concretePrincipal(input.requestContext)

      if (selected.kind !== "execute") {
        await appendActionLedgerSensitiveRead(input.db, {
          context: input.requestContext,
          actionName: selected.capabilityId ?? selected.id,
          actionVersion: selected.version,
          evaluatedRisk: selected.risk,
          targetType: selected.targetType,
          targetId,
          routeOrToolName: execution.capabilityId,
          capabilityId: selected.capabilityId ?? selected.id,
          capabilityVersion: selected.version,
          authorizationSource: "selected_graph_mcp_gate",
          reasonCode: execution.invocation.reasonCode ?? "mcp_action_policy_preflight",
          decisionPolicy: selected.policy ?? selected.id,
        })
        return dispatch()
      }

      const fingerprint = await commandFingerprint(selected, execution, targetId)
      // A server-owned target has no caller-supplied id to key on, so the protocol
      // asked the caller to invent a `requestId` — and then required the SAME one
      // on the approved retry (see validateApproval, which compares it to the
      // requested action's idempotencyKey). Asking a model to mint an opaque token
      // and carry it across a human approval is the least reliable way to satisfy
      // a requirement the server can satisfy itself, and measured against a real
      // agent it simply failed: `ACTION_POLICY_REQUIRED: Tool action invocation
      // metadata requires requestId`.
      //
      // `fingerprint` is already a deterministic hash of this exact command,
      // computed one line above for the approval record. Using it gives
      // the stability the protocol wants by construction: the request and the
      // approved retry hash identically, while a different command gets a
      // different key. Do not let an explicit requestId override it: a live GPT
      // client supplied a placeholder on the approval request and omitted it on
      // the retry, which made the approved command reject its own retry. The
      // server-owned path must have exactly one authority for this key.
      const executionKey = serverOwnedTarget
        ? `mcp-request:${fingerprint}`
        : requiredInvocationString(execution, "idempotencyKey")
      const approved =
        selected.approval === "required"
          ? serverOwnedTarget
            ? execution.invocation.approvalId
              ? await validateApproval({
                  db: input.db,
                  selected,
                  execution,
                  targetId,
                  requestId: executionKey,
                  fingerprint,
                  principal,
                })
              : await requestApprovalPreflight({
                  db: input.db,
                  selected,
                  execution,
                  targetId,
                  requestId: executionKey,
                  fingerprint,
                  principal,
                  requestContext: input.requestContext,
                })
            : await validateLegacyApproval({
                db: input.db,
                selected,
                execution,
                targetId,
                idempotencyKey: executionKey,
                fingerprint,
                principal,
              })
          : null

      const actionName = selected.capabilityId ?? selected.id
      let attempt = 1
      let preflight: Awaited<ReturnType<typeof appendActionLedgerMutation>>
      while (true) {
        preflight = await appendActionLedgerMutation(input.db, {
          context: input.requestContext,
          actionName,
          actionVersion: selected.version,
          actionKind: "execute",
          status: "requested",
          evaluatedRisk: selected.risk,
          targetType: selected.targetType,
          targetId,
          routeOrToolName: execution.capabilityId,
          capabilityId: actionName,
          capabilityVersion: selected.version,
          authorizationSource: "selected_graph_mcp_gate",
          causationActionId: approved?.requestedAction.id ?? null,
          approvalId: approved?.approval.id ?? null,
          idempotencyScope: approved
            ? `${approved.approval.id}:mcp-execution-preflight:${attempt}`
            : `${actionName}:${selected.version}:${targetId}:mcp-preflight`,
          idempotencyKey: approved?.approval.id ?? executionKey,
          idempotencyFingerprint: fingerprint,
          mutationDetail: {
            summary: `MCP Tool ${execution.canonicalName} passed selected action policy`,
            reversalKind: "none",
          },
        })
        if (!preflight.replayed) break
        if (!approved) {
          throw duplicateDispatchError(preflight.entry.id, serverOwnedTarget, executionKey)
        }
        const result = await actionLedgerService.listEntries(input.db, {
          idempotencyScope: `${approved.approval.id}:execution:${attempt}`,
          idempotencyKey: approved.approval.id,
          limit: 1,
        })
        const terminal = result.entries[0]
        if (terminal?.status === "failed") {
          attempt += 1
          continue
        }
        if (!terminal) {
          throw new ToolError(
            "This approved Tool execution is already in progress.",
            "PROVIDER_UNAVAILABLE",
            {
              reason: "approved_execution_in_progress",
              attempt,
              actionId: preflight.entry.id,
            },
            undefined,
            {
              nextSteps: [
                "Wait briefly, then retry the same approved command. Do not request another approval.",
              ],
            },
          )
        }
        throw duplicateDispatchError(preflight.entry.id, serverOwnedTarget, executionKey)
      }

      try {
        const result = await dispatch()
        await appendExecutionResult({
          db: input.db,
          context: input.requestContext,
          execution,
          selected,
          targetId,
          executionKey,
          fingerprint,
          preflightActionId: preflight.entry.id,
          attempt,
          approved,
          status: "succeeded",
        })
        return result
      } catch (error) {
        await appendExecutionResult({
          db: input.db,
          context: input.requestContext,
          execution,
          selected,
          targetId,
          executionKey,
          fingerprint,
          preflightActionId: preflight.entry.id,
          attempt,
          approved,
          status: "failed",
        })
        throw error
      }
    },
  }
}

function duplicateDispatchError(
  actionId: string,
  serverOwnedTarget: boolean,
  executionKey: string,
) {
  return new ToolError(
    "This exact Tool execution has already been claimed; refusing duplicate dispatch.",
    "AUTHORIZATION_DENIED",
    {
      actionId,
      ...(serverOwnedTarget ? { requestId: executionKey } : { idempotencyKey: executionKey }),
    },
  )
}

function resolveSelectedAction(
  actions: readonly VoyantGraphActionDeclaration[],
  execution: ToolActionPolicyExecutionInput,
): VoyantGraphActionDeclaration {
  const selected = actions.find(
    (action) =>
      action.id === execution.actionPolicy.id &&
      action.version === execution.actionPolicy.version &&
      action.from?.tools?.includes(execution.capabilityId),
  )
  if (
    !selected ||
    (selected.capabilityId ?? selected.id) !== execution.actionPolicy.capabilityId ||
    selected.kind !== execution.actionPolicy.kind ||
    selected.targetType !== execution.actionPolicy.targetType ||
    selected.commandTargetField !== execution.actionPolicy.commandTargetField ||
    selected.risk !== execution.actionPolicy.risk ||
    selected.ledger !== execution.actionPolicy.ledger ||
    (selected.approval ?? "never") !== execution.actionPolicy.approval ||
    (selected.targetLifecycle ?? "existing") !==
      (execution.actionPolicy.targetLifecycle ?? "existing") ||
    selected.createdTarget?.commandTargetType !==
      execution.actionPolicy.createdTarget?.commandTargetType ||
    selected.createdTarget?.resultReferenceType !==
      execution.actionPolicy.createdTarget?.resultReferenceType ||
    selected.createdTarget?.durability !== execution.actionPolicy.createdTarget?.durability ||
    selected.existingTarget?.durability !== execution.actionPolicy.existingTarget?.durability ||
    !sameParentAnchor(
      selected.createdTarget?.parentAnchor,
      execution.actionPolicy.createdTarget?.parentAnchor,
    )
  ) {
    throw new ToolError(
      "The Tool action policy does not resolve exactly to the selected deployment graph.",
      "ACTION_POLICY_REQUIRED",
      { capabilityId: execution.capabilityId, actionId: execution.actionPolicy.id },
    )
  }
  return selected
}

function sameParentAnchor(
  selected:
    | {
        targetIdField: string
        targetType?: string
        targetTypeField?: string
        relatedTargetIdField?: string
      }
    | undefined,
  execution:
    | {
        targetIdField: string
        targetType?: string
        targetTypeField?: string
        relatedTargetIdField?: string
      }
    | undefined,
): boolean {
  if (!selected || !execution) return selected === execution
  return (
    selected.targetIdField === execution.targetIdField &&
    selected.targetType === execution.targetType &&
    selected.targetTypeField === execution.targetTypeField &&
    selected.relatedTargetIdField === execution.relatedTargetIdField
  )
}

function assertCommandTargetMatches(
  selected: VoyantGraphActionDeclaration,
  execution: ToolActionPolicyExecutionInput,
  targetId: string,
): void {
  const field = selected.commandTargetField
  if (!field) return
  const commandInput = execution.commandInput
  const commandTarget =
    typeof commandInput === "object" && commandInput !== null && !Array.isArray(commandInput)
      ? (commandInput as Record<string, unknown>)[field]
      : undefined
  // A package resolver derives the target from server-owned state, so the
  // command may legitimately omit the declared target field (e.g. addressing an
  // itinerary day by `dayId` instead of the owning product `id`). There is no
  // caller-named target to cross-check, and nothing to spoof. When the caller
  // does name one it still has to match exactly.
  if (
    commandTarget === undefined &&
    execution.actionPolicy.invocation.targetResolution === "package-resolver"
  ) {
    return
  }
  if (typeof commandTarget !== "string" || !commandTarget.trim() || commandTarget !== targetId) {
    throw new ToolError(
      `Tool action targetId must exactly match command input field "${field}".`,
      "ACTION_POLICY_REQUIRED",
      {
        actionId: selected.id,
        field,
        targetId,
        commandTarget: typeof commandTarget === "string" ? commandTarget : null,
      },
    )
  }
}

function assertConfirmation(execution: ToolActionPolicyExecutionInput): void {
  if (
    execution.actionPolicy.invocation.requiredFields.includes("confirmed") &&
    execution.invocation.confirmed !== true
  ) {
    throw new ToolError(
      "This Tool requires explicit confirmation before dispatch.",
      "CONFIRMATION_REQUIRED",
      { capabilityId: execution.capabilityId },
    )
  }
}

function assertActorAllowed(
  selected: VoyantGraphActionDeclaration,
  actor: string | null | undefined,
): void {
  if (
    selected.allowedActorTypes?.length &&
    (!actor || !selected.allowedActorTypes.includes(actor))
  ) {
    throw new ToolError(
      "The authenticated actor is not allowed by the selected graph action.",
      "AUTHORIZATION_DENIED",
      { actionId: selected.id, actor: actor ?? null },
    )
  }
}

function requiredInvocationString(
  execution: ToolActionPolicyExecutionInput,
  field: "requestId" | "targetId" | "idempotencyKey" | "approvalId" | "idempotencyFingerprint",
): string {
  const value = execution.invocation[field]
  if (!value?.trim()) {
    throw new ToolError(
      `Tool action invocation metadata requires ${field}.`,
      field === "approvalId" ? "APPROVAL_REQUIRED" : "ACTION_POLICY_REQUIRED",
      { capabilityId: execution.capabilityId, field },
    )
  }
  return value
}

function requiredResolvedTarget(execution: ToolActionPolicyExecutionInput): string {
  const targetId = execution.resolvedTargetId?.trim()
  if (!targetId) {
    throw new ToolError(
      "A server-owned action target is required for ledgered generic Tool dispatch.",
      "ACTION_POLICY_REQUIRED",
      {
        capabilityId: execution.capabilityId,
        targetResolution: execution.actionPolicy.invocation.targetResolution ?? "missing",
      },
    )
  }
  return targetId
}

function concretePrincipal(context: ActionLedgerRequestContextValues) {
  const principal = mapActionLedgerRequestContext(context)
  if (principal.principalId === "unknown_request") {
    throw new ToolError(
      "A concrete authenticated principal is required for audited Tool dispatch.",
      "AUTHORIZATION_DENIED",
    )
  }
  return principal
}

async function commandFingerprint(
  selected: VoyantGraphActionDeclaration,
  execution: ToolActionPolicyExecutionInput,
  targetId: string,
): Promise<string> {
  const actionName = selected.capabilityId ?? selected.id
  if (selected.approval === "required") {
    return buildActionApprovalCommandFingerprint({
      actionName,
      actionVersion: selected.version,
      targetType: selected.targetType,
      targetId,
      commandInput: execution.commandInput,
      approvalPolicy: "required",
      capabilityId: actionName,
      capabilityVersion: selected.version,
      evaluatedRisk: selected.risk,
      reasonCode: execution.invocation.reasonCode ?? null,
    })
  }
  return buildIdempotencyFingerprint({
    actionName,
    actionVersion: selected.version,
    targetType: selected.targetType,
    targetId,
    commandInput: execution.commandInput,
    policyInputs: {
      capabilityId: execution.capabilityId,
      capabilityVersion: execution.capabilityVersion,
      risk: selected.risk,
      ledger: selected.ledger,
    },
  })
}

async function validateApproval(input: {
  db: AnyDrizzleDb
  selected: VoyantGraphActionDeclaration
  execution: ToolActionPolicyExecutionInput
  targetId: string
  requestId: string
  fingerprint: string
  principal: ReturnType<typeof mapActionLedgerRequestContext>
}) {
  const approvalId = requiredInvocationString(input.execution, "approvalId")
  const actionName = input.selected.capabilityId ?? input.selected.id
  const validation = await actionLedgerService.validateApprovedAction(input.db, {
    approvalId,
    actionName,
    actionVersion: input.selected.version,
    requestedActionKind: "execute",
    requestedActionStatus: "awaiting_approval",
    targetType: input.selected.targetType,
    targetId: input.targetId,
    routeOrToolName: input.execution.capabilityId,
    principalType: input.principal.principalType,
    principalId: input.principal.principalId,
    requireApprovalProvenance: true,
    organizationId: input.principal.organizationId,
    capabilityId: actionName,
    capabilityVersion: input.selected.version,
    evaluatedRisk: input.selected.risk,
    policyName: input.selected.policy ?? input.selected.id,
    policyVersion: input.selected.version,
    reasonCode: input.execution.invocation.reasonCode ?? null,
    idempotencyKey: input.requestId,
    idempotencyFingerprint: input.fingerprint,
    executionActionKind: "execute",
    executionStatus: "succeeded",
  })
  if (!validation.ok) {
    throw new ToolError(
      "The approval does not authorize this exact Tool command.",
      "AUTHORIZATION_DENIED",
      { approvalId, reason: validation.reason },
    )
  }
  if (validation.requestedAction.idempotencyKey !== input.requestId) {
    throw new ToolError(
      "The Tool requestId does not match the approved request.",
      "AUTHORIZATION_DENIED",
      { approvalId, reason: "request_id_mismatch" },
    )
  }
  return validation
}

async function validateLegacyApproval(input: {
  db: AnyDrizzleDb
  selected: VoyantGraphActionDeclaration
  execution: ToolActionPolicyExecutionInput
  targetId: string
  idempotencyKey: string
  fingerprint: string
  principal: ReturnType<typeof mapActionLedgerRequestContext>
}) {
  const approvalId = requiredInvocationString(input.execution, "approvalId")
  const suppliedFingerprint = requiredInvocationString(input.execution, "idempotencyFingerprint")
  if (suppliedFingerprint !== input.fingerprint) {
    throw new ToolError(
      "The supplied idempotency fingerprint does not match this exact Tool command.",
      "AUTHORIZATION_DENIED",
      { approvalId, reason: "fingerprint_mismatch" },
    )
  }
  const actionName = input.selected.capabilityId ?? input.selected.id
  const validation = await actionLedgerService.validateApprovedAction(input.db, {
    approvalId,
    actionName,
    actionVersion: input.selected.version,
    requestedActionKind: "execute",
    requestedActionStatus: "awaiting_approval",
    targetType: input.selected.targetType,
    targetId: input.targetId,
    routeOrToolName: input.execution.capabilityId,
    principalType: input.principal.principalType,
    principalId: input.principal.principalId,
    organizationId: input.principal.organizationId,
    idempotencyFingerprint: input.fingerprint,
    executionActionKind: "execute",
    executionStatus: "succeeded",
  })
  if (!validation.ok) {
    throw new ToolError(
      "The approval does not authorize this exact Tool command.",
      "AUTHORIZATION_DENIED",
      { approvalId, reason: validation.reason },
    )
  }
  if (validation.requestedAction.idempotencyKey !== input.idempotencyKey) {
    throw new ToolError(
      "The execution idempotency key does not match the approved request.",
      "AUTHORIZATION_DENIED",
      { approvalId, reason: "idempotency_key_mismatch" },
    )
  }
  return validation
}

async function requestApprovalPreflight(input: {
  db: AnyDrizzleDb
  selected: VoyantGraphActionDeclaration
  execution: ToolActionPolicyExecutionInput
  targetId: string
  requestId: string
  fingerprint: string
  principal: ReturnType<typeof mapActionLedgerRequestContext>
  requestContext: ActionLedgerRequestContextValues
}): Promise<never> {
  const actionName = input.selected.capabilityId ?? input.selected.id
  const result = await requestActionLedgerApproval(input.db, {
    context: input.requestContext,
    actionName,
    actionVersion: input.selected.version,
    actionKind: "execute",
    evaluatedRisk: input.selected.risk,
    targetType: input.selected.targetType,
    targetId: input.targetId,
    routeOrToolName: input.execution.capabilityId,
    capabilityId: actionName,
    capabilityVersion: input.selected.version,
    authorizationSource: "selected_graph_mcp_preflight",
    idempotencyScope: `${actionName}:${input.selected.version}:mcp-approval`,
    idempotencyKey: input.requestId,
    idempotencyFingerprint: input.fingerprint,
    approval: {
      requestedByPrincipalId: input.principal.principalId,
      policyName: input.selected.policy ?? input.selected.id,
      policyVersion: input.selected.version,
      riskSnapshot: input.selected.risk,
      reasonCode: input.execution.invocation.reasonCode ?? null,
    },
  })
  throw new ToolError(
    "This Tool action is awaiting approval. Approve the server-issued request, then retry the exact command.",
    "APPROVAL_REQUIRED",
    {
      approvalId: result.approval.id,
      requestedActionId: result.requestedAction.id,
      status: result.approval.status,
      requestId: input.requestId,
      idempotencyFingerprint: input.fingerprint,
      replayed: result.replayed,
    },
    undefined,
    {
      // The generic APPROVAL_REQUIRED remediation starts with "call
      // request_action_approval", which is WRONG here and unrecoverably so: this
      // path has ALREADY created the approval, and its id is in `meta` above.
      // Following the generic steps mints a SECOND, unrelated approval, approves
      // that one, and retries — while the server-issued approval is still
      // pending, so the retry fails identically, forever.
      //
      // Measured, not theorised. A real agent ran exactly this loop against
      // publish_product:
      //   publish_product -> APPROVAL_REQUIRED -> request_action_approval
      //   -> approve_action_approval -> publish_product -> APPROVAL_REQUIRED
      // It did everything it was told and could not win. Because publish_product
      // is how a product leaves `draft`, this one wrong first step is why every
      // product the capability harness ever created is still draft, why bookings
      // are refused as "not bookable", and why invoicing has nothing to invoice.
      //
      // Two steps, and the id is interpolated rather than described, for the same
      // reason as the invoice payload: an id the caller has to go and find is an
      // id the caller can get wrong.
      nextSteps: [
        `1. Call approve_action_approval with approvalId "${result.approval.id}". This approval already exists and is PENDING — do NOT call request_action_approval, which would create a different one and leave this one blocking.`,
        // "keep _voyant.confirmed=true" is not padding. assertConfirmation runs on
        // EVERY dispatch, the approved retry included, so a caller that rebuilds
        // the control block with only approvalId loses its confirmation and is
        // bounced with CONFIRMATION_REQUIRED — which is precisely what a measured
        // agent did four times in one booking journey, alternating between the two
        // errors without ever holding both fields at once.
        `2. Re-call this tool with the nested control object "_voyant": {"confirmed": true, "approvalId": "${result.approval.id}"}, and the command otherwise unchanged. Do not send flat keys such as "_voyant.confirmed". Both fields must be present on the same call.`,
      ],
    },
  )
}

async function appendExecutionResult(input: {
  db: AnyDrizzleDb
  context: ActionLedgerRequestContextValues
  execution: ToolActionPolicyExecutionInput
  selected: VoyantGraphActionDeclaration
  targetId: string
  executionKey: string
  fingerprint: string
  preflightActionId: string
  attempt: number
  approved:
    | Awaited<ReturnType<typeof validateApproval>>
    | Awaited<ReturnType<typeof validateLegacyApproval>>
    | null
  status: Extract<ActionLedgerEntry["status"], "succeeded" | "failed">
}): Promise<void> {
  const actionName = input.selected.capabilityId ?? input.selected.id
  await appendActionLedgerMutation(input.db, {
    context: input.context,
    actionName,
    actionVersion: input.selected.version,
    actionKind: "execute",
    status: input.status,
    evaluatedRisk: input.selected.risk,
    targetType: input.selected.targetType,
    targetId: input.targetId,
    routeOrToolName: input.execution.capabilityId,
    capabilityId: actionName,
    capabilityVersion: input.selected.version,
    authorizationSource: "selected_graph_mcp_gate",
    causationActionId: input.preflightActionId,
    approvalId: input.approved?.approval.id ?? null,
    idempotencyScope: input.approved
      ? `${input.approved.approval.id}:execution:${input.attempt}`
      : `${actionName}:${input.selected.version}:${input.targetId}:mcp-result`,
    idempotencyKey: input.approved?.approval.id ?? input.executionKey,
    idempotencyFingerprint: input.fingerprint,
    mutationDetail: {
      summary: `MCP Tool ${input.execution.canonicalName} ${input.status}`,
      reversalKind: input.selected.reversible ? "domain_command" : "none",
    },
  })
}
