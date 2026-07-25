import type { AnyDrizzleDb } from "@voyant-travel/db"
import {
  type DbTransactionCapability,
  VOYANT_DB_SUPPORTS_TRANSACTIONS,
} from "@voyant-travel/db/transaction-capability"
import { describe, expect, test } from "vitest"

import {
  __test__,
  ActionApprovalDecisionConflictError,
  ActionApprovalDecisionStatusError,
  ActionLedgerIdempotencyConflictError,
  type AppendActionLedgerEntryInput,
  actionLedgerService,
} from "../../src/service.js"
import {
  drizzleDb,
  makeApproval,
  makeEntry,
  malformedDecideApprovalInput,
} from "./service-fixtures.js"
import { makeAppendDb, makeApprovalLifecycleDb } from "./service-write-fixtures.js"

describe("actionLedgerService.appendEntry", () => {
  test("wraps entry detail inserts in a transaction when the db supports it", async () => {
    const { db, transactionCalls } = makeAppendDb()

    await actionLedgerService.appendEntry(db, {
      actionName: "booking.cancel",
      actionVersion: "v1",
      actionKind: "update",
      status: "succeeded",
      evaluatedRisk: "high",
      principalType: "user",
      principalId: "usr_1",
      internalRequest: false,
      targetType: "booking",
      targetId: "book_1",
      mutationDetail: {
        summary: "Cancelled booking",
        reversalKind: "domain_command",
      },
      payloads: [
        {
          payloadKind: "command_input",
          schemaTag: "booking.cancel:v1",
          retentionPolicy: "audit-default",
          storageRef: "blob://action-ledger/book_1/cancel-input",
        },
      ],
    })

    expect(transactionCalls).toEqual(["begin", "commit"])
  })

  test("inserts payload references with the action id", async () => {
    const { db, insertedPayloads } = makeAppendDb()

    const result = await actionLedgerService.appendEntry(db, {
      actionName: "booking.cancel",
      actionVersion: "v1",
      actionKind: "update",
      status: "succeeded",
      evaluatedRisk: "high",
      principalType: "user",
      principalId: "usr_1",
      internalRequest: false,
      organizationId: "org_1",
      targetType: "booking",
      targetId: "book_1",
      payloads: [
        {
          payloadKind: "command_input",
          schemaTag: "booking.cancel:v1",
          retentionPolicy: "audit-default",
          storageRef: "blob://action-ledger/book_1/cancel-input",
          hash: "sha256:payload",
        },
      ],
    })

    expect(result.replayed).toBe(false)
    expect(insertedPayloads).toEqual([
      expect.objectContaining({
        actionId: result.entry.id,
        payloadKind: "command_input",
        schemaTag: "booking.cancel:v1",
        retentionPolicy: "audit-default",
        storageRef: "blob://action-ledger/book_1/cancel-input",
        hash: "sha256:payload",
      }),
    ])
  })

  test("throws a conflict when an idempotency key is replayed with a different fingerprint", async () => {
    const { db } = makeAppendDb()
    const input: AppendActionLedgerEntryInput = {
      actionName: "booking.cancel",
      actionVersion: "v1",
      actionKind: "update",
      status: "succeeded",
      evaluatedRisk: "medium",
      principalType: "user",
      principalId: "usr_1",
      internalRequest: false,
      targetType: "booking",
      targetId: "book_1",
      idempotencyScope: "booking",
      idempotencyKey: "idem_1",
      idempotencyFingerprint: "sha256:first",
    }

    await actionLedgerService.appendEntry(db, input)

    await expect(
      actionLedgerService.appendEntry(db, {
        ...input,
        idempotencyFingerprint: "sha256:second",
      }),
    ).rejects.toMatchObject({
      name: ActionLedgerIdempotencyConflictError.name,
      existingActionId: "alge_1",
    })
  })
})

describe("withOptionalTransaction", () => {
  test("skips transaction when the db capability says transactions are unsupported", async () => {
    const db = {
      [VOYANT_DB_SUPPORTS_TRANSACTIONS]: false,
      transaction() {
        throw new Error("transaction should not be called")
      },
    } as DbTransactionCapability

    const result = await __test__.withOptionalTransaction(drizzleDb(db), async (tx) => {
      expect(tx).toBe(db)
      return "ok"
    })

    expect(result).toBe("ok")
  })

  test("falls back when an untagged neon-http transaction method throws before callback start", async () => {
    const db = {
      transaction() {
        throw new Error("No transactions support in neon-http driver")
      },
    }

    const result = await __test__.withOptionalTransaction(drizzleDb(db), async (tx) => {
      expect(tx).toBe(db)
      return "ok"
    })

    expect(result).toBe("ok")
  })

  test("does not retry errors thrown after the transaction callback starts", async () => {
    const callbackCalls: AnyDrizzleDb[] = []
    const tx = {} as AnyDrizzleDb
    const db = {
      async transaction<T>(callback: (tx: AnyDrizzleDb) => Promise<T>) {
        return callback(tx)
      },
    }

    await expect(
      __test__.withOptionalTransaction(drizzleDb(db), async (callbackTx) => {
        callbackCalls.push(callbackTx)
        throw new Error("No transactions support in downstream write")
      }),
    ).rejects.toThrow(/downstream write/)

    expect(callbackCalls).toEqual([tx])
  })
})

describe("actionLedgerService approval lifecycle", () => {
  test("creates an awaiting-approval requested action with a linked pending approval", async () => {
    const { db, entries, approvals, transactionCalls } = makeApprovalLifecycleDb()

    const result = await actionLedgerService.requestApproval(db, {
      requestedAction: {
        actionName: "booking.cancel",
        actionVersion: "v1",
        actionKind: "update",
        evaluatedRisk: "high",
        principalType: "user",
        principalId: "usr_requester",
        internalRequest: false,
        targetType: "booking",
        targetId: "book_1",
      },
      approval: {
        assignedToPrincipalId: "usr_approver",
        policyName: "booking-cancel-approval",
        policyVersion: "v1",
        targetSnapshotRef: "blob://action-ledger/book_1/cancel-target",
        reasonCode: "paid_booking_cancel",
        expiresAt: "2026-05-15T12:00:00.000Z",
      },
    })

    expect(transactionCalls).toHaveLength(1)
    expect(entries).toHaveLength(1)
    expect(approvals).toHaveLength(1)
    expect(result.replayed).toBe(false)
    expect(result.requestedAction).toMatchObject({
      id: "alge_1",
      actionName: "booking.cancel",
      status: "awaiting_approval",
      approvalId: result.approval.id,
      principalId: "usr_requester",
      evaluatedRisk: "high",
    })
    expect(result.approval).toMatchObject({
      requestedActionId: "alge_1",
      status: "pending",
      requestedByPrincipalId: "usr_requester",
      assignedToPrincipalId: "usr_approver",
      policyName: "booking-cancel-approval",
      policyVersion: "v1",
      targetSnapshotRef: "blob://action-ledger/book_1/cancel-target",
      riskSnapshot: "high",
      reasonCode: "paid_booking_cancel",
      expiresAt: new Date("2026-05-15T12:00:00.000Z"),
    })
  })

  test("returns an existing approval when an idempotent approval request is replayed", async () => {
    const existingEntry = makeEntry({
      id: "alge_existing",
      actionName: "booking.cancel",
      actionKind: "update",
      status: "awaiting_approval",
      targetType: "booking",
      targetId: "book_1",
      approvalId: "appr_existing",
      idempotencyScope: "booking",
      idempotencyKey: "idem_1",
      idempotencyFingerprint: "sha256:first",
    })
    const existingApproval = makeApproval({
      id: "appr_existing",
      requestedActionId: existingEntry.id,
    })
    const { db, entries, approvals } = makeApprovalLifecycleDb({
      entries: [existingEntry],
      approvals: [existingApproval],
    })

    const result = await actionLedgerService.requestApproval(db, {
      requestedAction: {
        actionName: "booking.cancel",
        actionVersion: "v1",
        actionKind: "update",
        evaluatedRisk: "high",
        principalType: "user",
        principalId: "usr_requester",
        internalRequest: false,
        targetType: "booking",
        targetId: "book_1",
        idempotencyScope: "booking",
        idempotencyKey: "idem_1",
        idempotencyFingerprint: "sha256:first",
      },
      approval: {
        policyName: "booking-cancel-approval",
        policyVersion: "v1",
      },
    })

    expect(result).toEqual({
      requestedAction: existingEntry,
      approval: existingApproval,
      replayed: true,
    })
    expect(entries).toHaveLength(1)
    expect(approvals).toHaveLength(1)
  })

  test("uses the replayed requested action approval id when recovering a missing approval", async () => {
    const existingEntry = makeEntry({
      id: "alge_existing",
      actionName: "booking.cancel",
      actionKind: "update",
      status: "awaiting_approval",
      targetType: "booking",
      targetId: "book_1",
      approvalId: "appr_recovered",
      idempotencyScope: "booking",
      idempotencyKey: "idem_1",
      idempotencyFingerprint: "sha256:first",
    })
    const { db, entries, approvals } = makeApprovalLifecycleDb({
      entries: [existingEntry],
    })

    const result = await actionLedgerService.requestApproval(db, {
      requestedAction: {
        actionName: "booking.cancel",
        actionVersion: "v1",
        actionKind: "update",
        evaluatedRisk: "high",
        principalType: "user",
        principalId: "usr_requester",
        internalRequest: false,
        targetType: "booking",
        targetId: "book_1",
        idempotencyScope: "booking",
        idempotencyKey: "idem_1",
        idempotencyFingerprint: "sha256:first",
      },
      approval: {
        policyName: "booking-cancel-approval",
        policyVersion: "v1",
      },
    })

    expect(result.replayed).toBe(true)
    expect(result.requestedAction).toBe(existingEntry)
    expect(result.approval).toMatchObject({
      id: "appr_recovered",
      requestedActionId: existingEntry.id,
      status: "pending",
    })
    expect(entries).toHaveLength(1)
    expect(approvals).toHaveLength(1)
    expect(approvals[0]?.id).toBe(existingEntry.approvalId)
  })

  test("decides a pending approval and appends a decision action", async () => {
    const decidedAt = new Date("2026-05-15T12:30:00.000Z")
    const pendingApproval = makeApproval({
      id: "appr_pending",
      requestedActionId: "alge_requested",
      status: "pending",
    })
    const { db, entries, approvals } = makeApprovalLifecycleDb({
      approvals: [pendingApproval],
    })

    const result = await actionLedgerService.decideApproval(db, {
      id: pendingApproval.id,
      status: "approved",
      decidedByPrincipalId: "usr_decider",
      decidedAt,
      decisionAction: {
        actionName: "action_approval.approve",
        actionVersion: "v1",
        principalType: "user",
        principalId: "usr_decider",
        internalRequest: false,
      },
    })

    expect(result?.approval).toMatchObject({
      id: pendingApproval.id,
      status: "approved",
      decidedByPrincipalId: "usr_decider",
      decidedAt,
    })
    expect(approvals[0]).toMatchObject({
      status: "approved",
      decidedByPrincipalId: "usr_decider",
    })
    expect(entries).toHaveLength(1)
    expect(result?.decisionAction).toMatchObject({
      actionName: "action_approval.approve",
      actionKind: "approve",
      status: "approved",
      evaluatedRisk: "high",
      principalId: "usr_decider",
      targetType: "action_approval",
      targetId: pendingApproval.id,
      causationActionId: pendingApproval.requestedActionId,
      approvalId: pendingApproval.id,
    })
  })

  test("throws a decision conflict when an approval is no longer pending", async () => {
    const { db } = makeApprovalLifecycleDb({
      approvals: [makeApproval({ id: "appr_done", status: "approved" })],
    })

    await expect(
      actionLedgerService.decideApproval(db, {
        id: "appr_done",
        status: "denied",
        decidedByPrincipalId: "usr_decider",
        decisionAction: {
          actionName: "action_approval.deny",
          actionVersion: "v1",
          principalType: "user",
          principalId: "usr_decider",
          internalRequest: false,
        },
      }),
    ).rejects.toMatchObject({
      name: ActionApprovalDecisionConflictError.name,
      approvalId: "appr_done",
      currentStatus: "approved",
    })
  })

  test("replays an already-settled decision that matches the requested status and idempotency key", async () => {
    const settledApproval = makeApproval({
      id: "appr_done",
      status: "approved",
      decidedByPrincipalId: "usr_decider",
      decidedAt: new Date("2026-05-15T12:30:00.000Z"),
    })
    const existingDecision = makeEntry({
      id: "alge_decision",
      actionName: "action_approval.approve",
      actionKind: "approve",
      status: "approved",
      targetType: "action_approval",
      targetId: "appr_done",
      approvalId: "appr_done",
      causationActionId: settledApproval.requestedActionId,
      principalId: "usr_decider",
      idempotencyScope: "appr_done:decision",
      idempotencyKey: "approved",
    })
    const { db, entries, approvals } = makeApprovalLifecycleDb({
      approvals: [settledApproval],
      entries: [existingDecision],
    })

    const result = await actionLedgerService.decideApproval(db, {
      id: "appr_done",
      status: "approved",
      decidedByPrincipalId: "usr_retrier",
      decisionAction: {
        actionName: "action_approval.approve",
        actionVersion: "v1",
        principalType: "user",
        principalId: "usr_retrier",
        internalRequest: false,
        idempotencyScope: "appr_done:decision",
        idempotencyKey: "approved",
      },
    })

    expect(result).toEqual({ approval: settledApproval, decisionAction: existingDecision })
    expect(entries).toHaveLength(1)
    expect(approvals).toHaveLength(1)
    expect(approvals[0]?.decidedByPrincipalId).toBe("usr_decider")
  })

  test("still throws a conflict when a settled decision does not match the requested status", async () => {
    const settledApproval = makeApproval({ id: "appr_done", status: "approved" })
    const existingDecision = makeEntry({
      id: "alge_decision",
      actionName: "action_approval.approve",
      actionKind: "approve",
      status: "approved",
      targetType: "action_approval",
      targetId: "appr_done",
      approvalId: "appr_done",
      idempotencyScope: "appr_done:decision",
      idempotencyKey: "approved",
    })
    const { db } = makeApprovalLifecycleDb({
      approvals: [settledApproval],
      entries: [existingDecision],
    })

    await expect(
      actionLedgerService.decideApproval(db, {
        id: "appr_done",
        status: "denied",
        decidedByPrincipalId: "usr_decider",
        decisionAction: {
          actionName: "action_approval.deny",
          actionVersion: "v1",
          principalType: "user",
          principalId: "usr_decider",
          internalRequest: false,
          idempotencyScope: "appr_done:decision",
          idempotencyKey: "denied",
        },
      }),
    ).rejects.toMatchObject({
      name: ActionApprovalDecisionConflictError.name,
      approvalId: "appr_done",
      currentStatus: "approved",
    })
  })

  test("rejects non-terminal decision statuses before writing", async () => {
    const pendingApproval = makeApproval({
      id: "appr_pending",
      requestedActionId: "alge_requested",
      status: "pending",
    })
    const { db, entries, approvals } = makeApprovalLifecycleDb({
      approvals: [pendingApproval],
    })

    const input = malformedDecideApprovalInput({
      id: pendingApproval.id,
      status: "pending",
      decidedByPrincipalId: "usr_decider",
      decisionAction: {
        actionName: "action_approval.pending",
        actionVersion: "v1",
        principalType: "user",
        principalId: "usr_decider",
        internalRequest: false,
      },
    })

    await expect(actionLedgerService.decideApproval(db, input)).rejects.toMatchObject({
      name: ActionApprovalDecisionStatusError.name,
      status: "pending",
    })
    expect(approvals[0]?.status).toBe("pending")
    expect(entries).toHaveLength(0)
  })
})
