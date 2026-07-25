import type { AnyDrizzleDb } from "@voyant-travel/db"
import { newId } from "@voyant-travel/db/lib/typeid"
import { withOptionalTransaction } from "@voyant-travel/db/transaction"
import { and, eq } from "drizzle-orm"
import type { NewActionApproval } from "./schema.js"
import { actionApprovals, actionMutationDetails } from "./schema.js"
import { assertApprovalDecisionStatus } from "./service/approval-status.js"
import {
  normalizeListLimit,
  parseCursorDate,
  toActionApprovalListCursor,
  toActionDelegationListCursor,
  toActionLedgerListCursor,
} from "./service/cursors.js"
import {
  assertSameFingerprint,
  decisionEntryInput,
  findApprovalById,
  findApprovalForRequestedAction,
  findExistingIdempotentEntry,
  findReplayedDecision,
  insertEntry,
} from "./service/entries.js"
import {
  ActionApprovalDecisionConflictError,
  ActionLedgerReversalTargetError,
} from "./service/errors.js"
import { listApprovals, listDelegations, listEntries } from "./service/listing.js"
import {
  buildActionApprovalsPredicate,
  buildActionDelegationsPredicate,
  buildActionLedgerEntriesPredicate,
} from "./service/predicates.js"
import { getApproval, getDelegation, getEntry } from "./service/records.js"
import type {
  AppendActionLedgerEntryInput,
  AppendActionLedgerEntryResult,
  DecideActionApprovalInput,
  DecideActionApprovalResult,
  RecordActionLedgerReversalInput,
  RecordActionLedgerReversalResult,
  RequestActionApprovalInput,
  RequestActionApprovalResult,
  ValidateApprovedActionInput,
  ValidateApprovedActionResult,
} from "./service/types.js"

export {
  ActionApprovalDecisionConflictError,
  ActionApprovalDecisionStatusError,
  ActionLedgerIdempotencyConflictError,
  ActionLedgerReversalTargetError,
} from "./service/errors.js"
export type {
  ActionApprovalListCursor,
  ActionDelegationListCursor,
  ActionLedgerListCursor,
  AppendActionLedgerEntryInput,
  AppendActionLedgerEntryResult,
  DecideActionApprovalInput,
  DecideActionApprovalResult,
  GetActionApprovalResult,
  GetActionDelegationResult,
  GetActionLedgerEntryResult,
  ListActionApprovalsInput,
  ListActionApprovalsResult,
  ListActionDelegationsInput,
  ListActionDelegationsResult,
  ListActionLedgerEntriesInput,
  ListActionLedgerEntriesResult,
  RecordActionLedgerReversalInput,
  RecordActionLedgerReversalResult,
  RequestActionApprovalInput,
  RequestActionApprovalResult,
  ValidateApprovedActionFailureReason,
  ValidateApprovedActionInput,
  ValidateApprovedActionResult,
} from "./service/types.js"

export const actionLedgerService = {
  async appendEntry(
    db: AnyDrizzleDb,
    input: AppendActionLedgerEntryInput,
  ): Promise<AppendActionLedgerEntryResult> {
    const existing = await findExistingIdempotentEntry(db, input)
    if (existing) {
      assertSameFingerprint(existing, input.idempotencyFingerprint ?? null)
      return { entry: existing, replayed: true }
    }

    try {
      return await withOptionalTransaction(db, (tx) => insertEntry(tx, input))
    } catch (error) {
      const racedExisting = await findExistingIdempotentEntry(db, input)
      if (racedExisting) {
        assertSameFingerprint(racedExisting, input.idempotencyFingerprint ?? null)
        return { entry: racedExisting, replayed: true }
      }
      throw error
    }
  },

  async requestApproval(
    db: AnyDrizzleDb,
    input: RequestActionApprovalInput,
  ): Promise<RequestActionApprovalResult> {
    return withOptionalTransaction(db, async (tx) => {
      const approvalId = newId("action_approvals")
      const requestedActionResult = await actionLedgerService.appendEntry(tx, {
        ...input.requestedAction,
        status: "awaiting_approval",
        approvalId,
      })
      if (!requestedActionResult.entry.approvalId) {
        throw new Error("Action approval requested action is missing its approval id")
      }
      const existingApproval = await findApprovalForRequestedAction(
        tx,
        requestedActionResult.entry.id,
      )
      if (existingApproval) {
        return {
          requestedAction: requestedActionResult.entry,
          approval: existingApproval,
          replayed: requestedActionResult.replayed,
        }
      }

      const [approval] = await tx
        .insert(actionApprovals)
        .values({
          id: requestedActionResult.entry.approvalId,
          requestedActionId: requestedActionResult.entry.id,
          status: "pending",
          requestedByPrincipalId:
            input.approval.requestedByPrincipalId ?? requestedActionResult.entry.principalId,
          assignedToPrincipalId: input.approval.assignedToPrincipalId ?? null,
          delegatedFromPrincipalId: input.approval.delegatedFromPrincipalId ?? null,
          policyName: input.approval.policyName,
          policyVersion: input.approval.policyVersion,
          targetSnapshotRef: input.approval.targetSnapshotRef ?? null,
          riskSnapshot: input.approval.riskSnapshot ?? requestedActionResult.entry.evaluatedRisk,
          reasonCode: input.approval.reasonCode ?? null,
          expiresAt: input.approval.expiresAt ? parseCursorDate(input.approval.expiresAt) : null,
        } satisfies NewActionApproval)
        .returning()

      if (!approval) {
        throw new Error("Action approval insert did not return an approval")
      }

      return {
        requestedAction: requestedActionResult.entry,
        approval,
        replayed: requestedActionResult.replayed,
      }
    })
  },

  async decideApproval(
    db: AnyDrizzleDb,
    input: DecideActionApprovalInput,
  ): Promise<DecideActionApprovalResult | null> {
    assertApprovalDecisionStatus(input.status)

    return withOptionalTransaction(db, async (tx) => {
      const approval = await findApprovalById(tx, input.id)
      if (!approval) return null
      if (approval.status !== "pending") {
        const replayed = await findReplayedDecision(tx, input, approval)
        if (replayed) return replayed
        throw new ActionApprovalDecisionConflictError(approval.id, approval.status)
      }

      const decidedAt = input.decidedAt ? parseCursorDate(input.decidedAt) : new Date()
      const [updatedApproval] = await tx
        .update(actionApprovals)
        .set({
          status: input.status,
          decidedByPrincipalId: input.decidedByPrincipalId,
          decidedAt,
        })
        .where(and(eq(actionApprovals.id, input.id), eq(actionApprovals.status, "pending")))
        .returning()

      if (!updatedApproval) {
        const current = await findApprovalById(tx, input.id)
        if (!current) return null
        const replayed = await findReplayedDecision(tx, input, current)
        if (replayed) return replayed
        throw new ActionApprovalDecisionConflictError(current.id, current.status)
      }

      const decisionAction = await actionLedgerService.appendEntry(
        tx,
        decisionEntryInput(input, updatedApproval),
      )

      return {
        approval: updatedApproval,
        decisionAction: decisionAction.entry,
      }
    })
  },

  async recordReversal(
    db: AnyDrizzleDb,
    input: RecordActionLedgerReversalInput,
  ): Promise<RecordActionLedgerReversalResult | null> {
    return withOptionalTransaction(db, async (tx) => {
      const original = await actionLedgerService.getEntry(tx, input.originalActionId)
      if (!original) return null
      if (!original.mutationDetail) {
        throw new ActionLedgerReversalTargetError(input.originalActionId, "missing_mutation_detail")
      }
      if (original.mutationDetail.reversalKind === "none") {
        throw new ActionLedgerReversalTargetError(input.originalActionId, "not_reversible")
      }

      const reversalResult = await actionLedgerService.appendEntry(tx, {
        ...input.reversalAction,
        causationActionId: original.entry.id,
        mutationDetail: {
          commandInputRef: input.reversalAction.mutationDetail?.commandInputRef ?? null,
          commandResultRef: input.reversalAction.mutationDetail?.commandResultRef ?? null,
          summary: input.reversalAction.mutationDetail?.summary ?? null,
          reversalKind: input.reversalAction.mutationDetail?.reversalKind ?? "none",
          reversalCommandId: input.reversalAction.mutationDetail?.reversalCommandId ?? null,
          reversalCommandVersion:
            input.reversalAction.mutationDetail?.reversalCommandVersion ?? null,
          reversalArgsRef: input.reversalAction.mutationDetail?.reversalArgsRef ?? null,
          reversalStateProjection:
            input.reversalAction.mutationDetail?.reversalStateProjection ?? null,
          reversalOutcomeProjection:
            input.reversalAction.mutationDetail?.reversalOutcomeProjection ?? null,
          reversesActionId: original.entry.id,
          reversedByActionIdProjection:
            input.reversalAction.mutationDetail?.reversedByActionIdProjection ?? null,
        },
      })

      const defaultProjection =
        input.reversalAction.status === "failed"
          ? ({ reversalState: "failed", reversalOutcome: "failed" } as const)
          : ({ reversalState: "completed", reversalOutcome: "full" } as const)

      await tx
        .update(actionMutationDetails)
        .set({
          reversalStateProjection:
            input.projection?.reversalState ?? defaultProjection.reversalState,
          reversalOutcomeProjection:
            input.projection?.reversalOutcome ?? defaultProjection.reversalOutcome,
          reversedByActionIdProjection: reversalResult.entry.id,
        })
        .where(eq(actionMutationDetails.actionId, original.entry.id))

      return {
        originalAction: original.entry,
        originalMutationDetail: original.mutationDetail,
        reversalAction: reversalResult.entry,
        replayed: reversalResult.replayed,
      }
    })
  },

  listEntries,
  listApprovals,
  listDelegations,
  getApproval,

  async validateApprovedAction(
    db: AnyDrizzleDb,
    input: ValidateApprovedActionInput,
  ): Promise<ValidateApprovedActionResult> {
    const result = await actionLedgerService.getApproval(db, input.approvalId)
    if (!result) {
      return { ok: false, reason: "not_found" }
    }

    if (result.approval.status !== "approved") {
      return {
        ok: false,
        reason: "not_approved",
        approval: result.approval,
        status: result.approval.status,
      }
    }

    const now = input.now ? parseCursorDate(input.now) : new Date()
    if (result.approval.expiresAt && result.approval.expiresAt < now) {
      return {
        ok: false,
        reason: "expired",
        approval: result.approval,
      }
    }

    const requestedAction = result.requestedAction?.entry
    if (
      !requestedAction ||
      requestedAction.actionName !== input.actionName ||
      requestedAction.actionVersion !== input.actionVersion ||
      (input.requestedActionKind && requestedAction.actionKind !== input.requestedActionKind) ||
      (input.requestedActionStatus &&
        !(
          Array.isArray(input.requestedActionStatus)
            ? input.requestedActionStatus
            : [input.requestedActionStatus]
        ).includes(requestedAction.status)) ||
      requestedAction.targetType !== input.targetType ||
      requestedAction.targetId !== input.targetId ||
      requestedAction.routeOrToolName !== (input.routeOrToolName ?? null) ||
      requestedAction.approvalId !== result.approval.id
    ) {
      return {
        ok: false,
        reason: "mismatched_action",
        approval: result.approval,
        requestedAction: requestedAction ?? undefined,
      }
    }

    if (!requestedAction.idempotencyFingerprint) {
      return {
        ok: false,
        reason: "missing_fingerprint",
        approval: result.approval,
        requestedAction,
      }
    }

    if (input.idempotencyFingerprint !== requestedAction.idempotencyFingerprint) {
      return {
        ok: false,
        reason: "fingerprint_mismatch",
        approval: result.approval,
        requestedAction,
      }
    }

    if (
      input.principalType &&
      input.principalId &&
      (requestedAction.principalType !== input.principalType ||
        requestedAction.principalId !== input.principalId ||
        (input.requireApprovalProvenance &&
          result.approval.requestedByPrincipalId !== input.principalId))
    ) {
      return {
        ok: false,
        reason: "principal_mismatch",
        approval: result.approval,
        requestedAction,
      }
    }

    if (
      input.organizationId !== undefined &&
      requestedAction.organizationId !== input.organizationId
    ) {
      return {
        ok: false,
        reason: "organization_mismatch",
        approval: result.approval,
        requestedAction,
      }
    }

    if (
      input.requireApprovalProvenance &&
      result.approval.assignedToPrincipalId &&
      result.approval.decidedByPrincipalId !== result.approval.assignedToPrincipalId
    ) {
      return {
        ok: false,
        reason: "assignee_mismatch",
        approval: result.approval,
        requestedAction,
      }
    }

    if (
      input.capabilityId !== undefined &&
      (requestedAction.capabilityId !== input.capabilityId ||
        requestedAction.capabilityVersion !== (input.capabilityVersion ?? null))
    ) {
      return {
        ok: false,
        reason: "capability_mismatch",
        approval: result.approval,
        requestedAction,
      }
    }

    if (
      input.evaluatedRisk !== undefined &&
      (requestedAction.evaluatedRisk !== input.evaluatedRisk ||
        result.approval.riskSnapshot !== input.evaluatedRisk)
    ) {
      return {
        ok: false,
        reason: "risk_mismatch",
        approval: result.approval,
        requestedAction,
      }
    }

    if (
      input.policyName !== undefined &&
      (result.approval.policyName !== input.policyName ||
        result.approval.policyVersion !== (input.policyVersion ?? null))
    ) {
      return {
        ok: false,
        reason: "policy_mismatch",
        approval: result.approval,
        requestedAction,
      }
    }

    if (input.reasonCode !== undefined && result.approval.reasonCode !== input.reasonCode) {
      return {
        ok: false,
        reason: "reason_mismatch",
        approval: result.approval,
        requestedAction,
      }
    }

    if (
      input.idempotencyKey !== undefined &&
      requestedAction.idempotencyKey !== input.idempotencyKey
    ) {
      return {
        ok: false,
        reason: "idempotency_key_mismatch",
        approval: result.approval,
        requestedAction,
      }
    }

    const existingExecution = await actionLedgerService.listEntries(db, {
      actionName: input.actionName,
      actionKind: input.executionActionKind,
      targetType: input.targetType,
      targetId: input.targetId,
      causationActionId: requestedAction.id,
      approvalId: result.approval.id,
      status: input.executionStatus ?? "succeeded",
      limit: 1,
    })
    if (existingExecution.entries.length > 0) {
      return {
        ok: false,
        reason: "already_executed",
        approval: result.approval,
        requestedAction,
        existingActionId: existingExecution.entries[0]?.id,
      }
    }

    return {
      ok: true,
      approval: result.approval,
      requestedAction,
      idempotencyFingerprint: requestedAction.idempotencyFingerprint,
    }
  },

  getDelegation,

  getEntry,
}

export const __test__ = {
  buildActionApprovalsPredicate,
  buildActionDelegationsPredicate,
  buildActionLedgerEntriesPredicate,
  withOptionalTransaction,
  normalizeListLimit,
  toActionApprovalListCursor,
  toActionDelegationListCursor,
  toActionLedgerListCursor,
}
