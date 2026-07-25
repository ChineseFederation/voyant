import type { AnyDrizzleDb } from "@voyant-travel/db"
import { and, eq } from "drizzle-orm"

import {
  type ActionApproval,
  type ActionLedgerEntry,
  actionApprovals,
  actionLedgerEntries,
  actionLedgerPayloads,
  actionMutationDetails,
  actionSensitiveReadDetails,
} from "../schema.js"
import { ActionLedgerIdempotencyConflictError } from "./errors.js"
import type {
  AppendActionLedgerEntryInput,
  AppendActionLedgerEntryResult,
  DecideActionApprovalInput,
  DecideActionApprovalResult,
} from "./types.js"

export async function insertEntry(
  db: AnyDrizzleDb,
  input: AppendActionLedgerEntryInput,
): Promise<AppendActionLedgerEntryResult> {
  const { mutationDetail, payloads, sensitiveReadDetail, ...entryInput } = input
  const [entry] = await db
    .insert(actionLedgerEntries)
    .values({
      ...entryInput,
      occurredAt: input.occurredAt,
    })
    .returning()

  if (!entry) {
    throw new Error("Action ledger insert did not return an entry")
  }

  if (mutationDetail) {
    await db.insert(actionMutationDetails).values({
      actionId: entry.id,
      ...mutationDetail,
    })
  }

  if (sensitiveReadDetail) {
    await db.insert(actionSensitiveReadDetails).values({
      actionId: entry.id,
      ...sensitiveReadDetail,
    })
  }

  if (payloads && payloads.length > 0) {
    await db.insert(actionLedgerPayloads).values(
      payloads.map((payload) => ({
        actionId: entry.id,
        ...payload,
      })),
    )
  }

  return { entry, replayed: false }
}

export async function findExistingIdempotentEntry(
  db: AnyDrizzleDb,
  input: AppendActionLedgerEntryInput,
): Promise<ActionLedgerEntry | null> {
  if (!input.idempotencyScope || !input.idempotencyKey) return null

  const [existing] = await db
    .select()
    .from(actionLedgerEntries)
    .where(
      and(
        eq(actionLedgerEntries.idempotencyScope, input.idempotencyScope),
        eq(actionLedgerEntries.actionName, input.actionName),
        eq(actionLedgerEntries.targetType, input.targetType),
        eq(actionLedgerEntries.targetId, input.targetId),
        eq(actionLedgerEntries.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1)

  return existing ?? null
}

export async function findApprovalForRequestedAction(
  db: AnyDrizzleDb,
  requestedActionId: string,
): Promise<ActionApproval | null> {
  const [approval] = await db
    .select()
    .from(actionApprovals)
    .where(eq(actionApprovals.requestedActionId, requestedActionId))
    .limit(1)

  return approval ?? null
}

export async function findApprovalById(
  db: AnyDrizzleDb,
  id: string,
): Promise<ActionApproval | null> {
  const [approval] = await db
    .select()
    .from(actionApprovals)
    .where(eq(actionApprovals.id, id))
    .limit(1)

  return approval ?? null
}

export function assertSameFingerprint(entry: ActionLedgerEntry, fingerprint: string | null): void {
  if (entry.idempotencyFingerprint !== fingerprint) {
    throw new ActionLedgerIdempotencyConflictError(entry.id)
  }
}

/** Merge a decision input against the current approval row into a full ledger-entry input. */
export function decisionEntryInput(
  input: DecideActionApprovalInput,
  approval: ActionApproval,
): AppendActionLedgerEntryInput {
  return {
    ...input.decisionAction,
    actionKind: input.status === "approved" ? "approve" : "reject",
    status: input.status,
    evaluatedRisk: input.decisionAction.evaluatedRisk ?? approval.riskSnapshot,
    targetType: input.decisionAction.targetType ?? "action_approval",
    targetId: input.decisionAction.targetId ?? approval.id,
    causationActionId: approval.requestedActionId,
    approvalId: approval.id,
  }
}

/**
 * `decideApproval` transitions an approval exactly once (pending -> a terminal
 * status). A retried decision request lands here once the approval is no
 * longer pending: if it already settled at the caller's requested status and
 * the decision's own idempotent ledger entry exists (matched by scope + key,
 * same as `appendEntry`'s replay lookup), this is an exact replay rather than
 * a conflicting second decision, so the original result is returned instead
 * of raising `ActionApprovalDecisionConflictError`. A different requested
 * status, or no matching prior entry, is a genuine conflict and returns null
 * so the caller throws.
 */
export async function findReplayedDecision(
  db: AnyDrizzleDb,
  input: DecideActionApprovalInput,
  approval: ActionApproval,
): Promise<DecideActionApprovalResult | null> {
  if (approval.status !== input.status) return null
  const existingDecision = await findExistingIdempotentEntry(
    db,
    decisionEntryInput(input, approval),
  )
  if (!existingDecision) return null
  return { approval, decisionAction: existingDecision }
}
