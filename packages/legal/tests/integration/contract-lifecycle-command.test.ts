import {
  actionLedgerService,
  buildActionApprovalCommandFingerprint,
} from "@voyant-travel/action-ledger"
import { actionLedgerEntries } from "@voyant-travel/action-ledger/schema"
import { createDbClient } from "@voyant-travel/db"
import { eventOutboxTable } from "@voyant-travel/db/schema"
import { cleanupTestDb } from "@voyant-travel/db/test-utils"
import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  bookingContractContentFingerprint,
  recordBookingContractDeliveryStatus,
} from "../../src/booking-contract-review.js"
import {
  executeLegalContractLifecycleCommand,
  legalContractLifecycleEventId,
} from "../../src/contract-lifecycle-command.js"
import {
  type ContractStatus,
  contractLifecycleCommandResults,
  contracts,
} from "../../src/contracts/schema.js"
import { contractsService } from "../../src/contracts/service.js"
import {
  LEGAL_CONTRACT_LIFECYCLE_HANDLER_EXPECTATIONS,
  LEGAL_CONTRACT_LIFECYCLE_POLICIES,
} from "../../src/existing-target-policy.js"
import {
  executeLegalContractTool,
  issueLegalContractTool,
  type LegalLifecycleCommandToolServices,
  type LegalToolServices,
  sendLegalContractTool,
  voidLegalContractTool,
} from "../../src/tools.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL
type ClosableTestDb = PostgresJsDatabase & {
  $client: { end(options?: { timeout?: number | null }): Promise<unknown> }
}
type Transition = keyof typeof LEGAL_CONTRACT_LIFECYCLE_POLICIES
type CommandInput = {
  contractId: string
  recipient?: string
  channel?: "email" | "sms" | "whatsapp"
  revision?: number
  contentFingerprint?: string
  notificationsSuppressed?: boolean
  reason?: string
  acknowledgedConsequences?: true
  subject?: string | null
  message?: string | null
}

describe.skipIf(!DB_AVAILABLE)("Legal contract lifecycle existing-target commands", () => {
  let db: ClosableTestDb

  beforeAll(() => {
    db = createDbClient(process.env.TEST_DATABASE_URL as string, {
      adapter: "node",
      nodeMaxConnections: 2,
      timeouts: { statementMs: false, queryMs: false, connectMs: false },
    }) as ClosableTestDb
  })
  beforeEach(() => cleanupTestDb(db))
  afterAll(async () => {
    await db.$client.end({ timeout: 0 })
  })

  it("persists the original send intent and exact immutable result for replay", async () => {
    const contract = await insertContract("issued", "Original title")
    const commandInput = {
      contractId: contract.id,
      recipient: "traveller@example.com",
      channel: "email",
      revision: 1,
      notificationsSuppressed: false,
      subject: "Your exact contract subject",
      message: "The operator's exact delivery message.",
    }
    const command = await approvedCommand("send", "send-contract-1", commandInput)

    const first = await executeCommand(command)
    expect(first).toMatchObject({
      replayed: false,
      value: { id: contract.id, status: "sent", title: "Original title" },
    })

    await db
      .update(contracts)
      .set({ title: "Changed after command", updatedAt: new Date() })
      .where(eq(contracts.id, contract.id))
    const replay = await executeCommand(command)
    expect(replay).toMatchObject({ replayed: true, value: first.value })

    const results = await db.select().from(contractLifecycleCommandResults)
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      transition: "send",
      contractId: contract.id,
      commandPayload: normalizeInput("send", commandInput),
      result: first.value,
    })
    const eventId = legalContractLifecycleEventId(first.command)
    expect(await db.select().from(eventOutboxTable)).toEqual([
      expect.objectContaining({
        eventId,
        name: "contract.sent",
        payload: expect.objectContaining({
          contractId: contract.id,
          transition: "sent",
          delivery: expect.objectContaining({
            recipientEmail: commandInput.recipient,
            subject: commandInput.subject,
            message: commandInput.message,
          }),
        }),
        metadata: expect.objectContaining({ category: "domain", source: "service", eventId }),
      }),
    ])

    await db.update(contracts).set({ status: "void" }).where(eq(contracts.id, contract.id))
    await expect(contractsService.deleteContract(db, contract.id)).resolves.toEqual({
      status: "deleted",
    })
    expect(await db.select().from(contracts).where(eq(contracts.id, contract.id))).toHaveLength(0)
    expect(await db.select().from(contractLifecycleCommandResults)).toHaveLength(1)
    await expect(executeCommand(command)).resolves.toMatchObject({
      replayed: true,
      value: first.value,
    })
  })

  it("serializes concurrent exact commands and transitions/enqueues only once", async () => {
    const contract = await insertContract("issued", "Concurrent send")
    const command = await approvedCommand("send", "send-contract-concurrent", {
      contractId: contract.id,
      recipient: "concurrent@example.com",
      channel: "email",
      revision: 1,
      notificationsSuppressed: true,
      subject: null,
      message: null,
    })
    let releaseFirst: () => void = () => undefined
    const holdFirst = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    let transitioned: () => void = () => undefined
    const transitionReached = new Promise<void>((resolve) => {
      transitioned = resolve
    })
    const firstPromise = executeCommand({
      ...command,
      testHooks: {
        async afterTransition() {
          transitioned()
          await holdFirst
        },
      },
    })
    await transitionReached
    let secondSettled = false
    const secondPromise = executeCommand(command).finally(() => {
      secondSettled = true
    })
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(secondSettled).toBe(false)
    releaseFirst()

    const [first, replay] = await Promise.all([firstPromise, secondPromise])
    expect(first.replayed).toBe(false)
    expect(replay).toMatchObject({ replayed: true, value: first.value })
    expect(await db.select().from(contractLifecycleCommandResults)).toHaveLength(1)
    expect(await db.select().from(eventOutboxTable)).toHaveLength(1)
    expect(
      await db
        .select()
        .from(actionLedgerEntries)
        .where(eq(actionLedgerEntries.idempotencyKey, "send-contract-concurrent")),
    ).toHaveLength(2)
  })

  it("serializes different command keys on the contract row", async () => {
    const contract = await insertContract("issued", "Concurrent target")
    const firstCommand = await approvedCommand("send", "send-target-first", {
      contractId: contract.id,
      recipient: "first@example.com",
      channel: "email",
      revision: 1,
      notificationsSuppressed: false,
      subject: "First",
      message: "First",
    })
    const secondCommand = await approvedCommand("send", "send-target-second", {
      contractId: contract.id,
      recipient: "second@example.com",
      channel: "email",
      revision: 1,
      notificationsSuppressed: false,
      subject: "Second",
      message: "Second",
    })
    let releaseFirst: () => void = () => undefined
    const holdFirst = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    let transitioned: () => void = () => undefined
    const transitionReached = new Promise<void>((resolve) => {
      transitioned = resolve
    })
    const firstPromise = executeCommand({
      ...firstCommand,
      testHooks: {
        async afterTransition() {
          transitioned()
          await holdFirst
        },
      },
    })
    await transitionReached
    let secondSettled = false
    const secondResult = executeCommand(secondCommand).then(
      () => {
        secondSettled = true
        throw new Error("The second same-target command unexpectedly succeeded")
      },
      (error: unknown) => {
        secondSettled = true
        return error
      },
    )
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(secondSettled).toBe(false)
    releaseFirst()

    await expect(firstPromise).resolves.toMatchObject({ replayed: false })
    await expect(secondResult).resolves.toMatchObject({ code: "INVALID_INPUT" })
    expect(await db.select().from(contractLifecycleCommandResults)).toHaveLength(1)
    expect(await db.select().from(eventOutboxTable)).toHaveLength(1)
  })

  it("rejects payload, target, and organization drift without another transition", async () => {
    const contract = await insertContract("issued", "Conflict source")
    const otherContract = await insertContract("issued", "Conflict target")
    const originalInput = {
      contractId: contract.id,
      recipient: "original@example.com",
      channel: "email",
      revision: 1,
      notificationsSuppressed: false,
      subject: "Original",
      message: "Original",
    }
    const command = await approvedCommand("send", "send-contract-conflict", originalInput)
    await executeCommand(command)

    const driftedInput = { ...originalInput, subject: "Drifted" }
    await expect(
      executeCommand({
        ...command,
        commandInput: driftedInput,
        admitted: await admittedForExistingApproval(
          "send",
          "send-contract-conflict",
          driftedInput,
          command.admitted.invocation.approvalId as string,
        ),
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      cause: { name: "ActionLedgerIdempotencyConflictError" },
    })

    const targetInput = { ...originalInput, contractId: otherContract.id }
    await expect(
      executeCommand({
        ...command,
        commandInput: targetInput,
        admitted: await admittedForExistingApproval(
          "send",
          "send-contract-conflict",
          targetInput,
          command.admitted.invocation.approvalId as string,
        ),
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      cause: { name: "ActionLedgerIdempotencyConflictError" },
    })

    await expect(
      executeCommand({
        ...command,
        context: { ...command.context, organizationId: "organization_other" },
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      cause: { name: "ActionLedgerCreatedCommandApprovalError" },
    })

    expect(await db.select().from(contractLifecycleCommandResults)).toHaveLength(1)
    expect(await db.select().from(eventOutboxTable)).toHaveLength(1)
    expect(await db.select().from(contracts).where(eq(contracts.id, otherContract.id))).toEqual([
      expect.objectContaining({ status: "issued" }),
    ])
  })

  it("rolls back the state, claim, result, and intent when outbox insertion fails", async () => {
    const contract = await insertContract("issued", "Rollback send")
    const idempotencyKey = "send-contract-rollback"
    const command = await approvedCommand("send", idempotencyKey, {
      contractId: contract.id,
      recipient: "rollback@example.com",
      channel: "email",
      revision: 1,
      notificationsSuppressed: false,
      subject: "Rollback",
      message: "Rollback",
    })
    await expect(
      executeCommand({
        ...command,
        insertEvents: async () => {
          throw new Error("injected outbox insertion failure")
        },
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      cause: { message: "injected outbox insertion failure" },
    })

    expect(await db.select().from(contractLifecycleCommandResults)).toHaveLength(0)
    expect(await db.select().from(eventOutboxTable)).toHaveLength(0)
    expect(await db.select().from(contracts).where(eq(contracts.id, contract.id))).toEqual([
      expect.objectContaining({ status: "issued", sentAt: null }),
    ])
    expect(
      await db
        .select()
        .from(actionLedgerEntries)
        .where(eq(actionLedgerEntries.idempotencyKey, idempotencyKey)),
    ).toEqual([expect.objectContaining({ status: "awaiting_approval" })])
  })

  it("issues and executes through the same atomic mailbox/outbox protocol", async () => {
    const contract = await insertContract("draft", "Lifecycle contract")
    const issue = await approvedCommand("issue", "issue-contract-1", {
      contractId: contract.id,
    })
    await expect(executeCommand(issue)).resolves.toMatchObject({
      replayed: false,
      value: { id: contract.id, status: "issued" },
    })

    await db
      .update(contracts)
      .set({ status: "signed", updatedAt: new Date() })
      .where(eq(contracts.id, contract.id))
    const execute = await approvedCommand("execute", "execute-contract-1", {
      contractId: contract.id,
    })
    await expect(executeCommand(execute)).resolves.toMatchObject({
      replayed: false,
      value: { id: contract.id, status: "executed" },
    })
    expect((await db.select().from(eventOutboxTable)).map(({ name }) => name).sort()).toEqual([
      "contract.executed",
      "contract.issued",
    ])
    expect(await db.select().from(contractLifecycleCommandResults)).toHaveLength(2)
  })

  it("sends one exact draft revision with one approval, records provider status, then voids with audit", async () => {
    const contract = await insertContract("draft", "Review-first contract")
    const contentFingerprint = await bookingContractContentFingerprint(contract)
    const send = await approvedCommand("send", "send-reviewed-revision", {
      contractId: contract.id,
      recipient: "traveller@example.com",
      channel: "email",
      revision: 1,
      contentFingerprint,
      notificationsSuppressed: false,
      subject: "Your agreement",
      message: "Please review and sign.",
    })
    await expect(executeCommand(send)).resolves.toMatchObject({
      replayed: false,
      value: { id: contract.id, status: "sent" },
    })
    expect(await db.select().from(contracts).where(eq(contracts.id, contract.id))).toEqual([
      expect.objectContaining({
        status: "sent",
        metadata: expect.objectContaining({
          bookingContractWorkflow: expect.objectContaining({
            delivery: expect.objectContaining({
              recipient: "traveller@example.com",
              channel: "email",
              revision: 1,
            }),
          }),
        }),
      }),
    ])
    const viewedAt = new Date("2026-07-29T12:00:00.000Z")
    await expect(
      recordBookingContractDeliveryStatus(db, {
        contractId: contract.id,
        status: "viewed",
        occurredAt: viewedAt,
        provider: "signature-provider",
        externalReference: "delivery_1",
      }),
    ).resolves.toEqual({ status: "recorded", replayed: false })
    await expect(
      recordBookingContractDeliveryStatus(db, {
        contractId: contract.id,
        status: "viewed",
        occurredAt: viewedAt,
        provider: "signature-provider",
        externalReference: "delivery_1",
      }),
    ).resolves.toEqual({ status: "recorded", replayed: true })
    await expect(
      recordBookingContractDeliveryStatus(db, {
        contractId: contract.id,
        status: "viewed",
        occurredAt: new Date("2026-07-29T12:05:00.000Z"),
        provider: "signature-provider",
        externalReference: "delivery_1",
      }),
    ).resolves.toEqual({ status: "recorded", replayed: true })

    const voidCommand = await approvedCommand("void", "void-reviewed-revision", {
      contractId: contract.id,
      revision: 1,
      reason: "Booking cancelled by customer",
      acknowledgedConsequences: true,
    })
    await expect(executeCommand(voidCommand)).resolves.toMatchObject({
      replayed: false,
      value: { status: "void" },
    })
    expect((await db.select().from(eventOutboxTable)).map(({ name }) => name).sort()).toEqual([
      "contract.sent",
      "contract.voided",
    ])
  })

  it.each([
    "signed",
    "executed",
  ] as const)("records delayed viewed delivery evidence after a contract is %s", async (status) => {
    const contract = await insertContract(status, `Delayed viewed ${status}`)
    const occurredAt = new Date("2026-07-29T12:30:00.000Z")

    await expect(
      recordBookingContractDeliveryStatus(db, {
        contractId: contract.id,
        status: "viewed",
        occurredAt,
        provider: "signature-provider",
        externalReference: `delivery-${status}`,
      }),
    ).resolves.toEqual({ status: "recorded", replayed: false })

    expect(await db.select().from(contracts).where(eq(contracts.id, contract.id))).toEqual([
      expect.objectContaining({
        status,
        metadata: expect.objectContaining({
          bookingContractWorkflow: expect.objectContaining({
            delivery: expect.objectContaining({ viewedAt: occurredAt.toISOString() }),
            deliveryHistory: [
              expect.objectContaining({
                status: "viewed",
                externalReference: `delivery-${status}`,
              }),
            ],
          }),
        }),
      }),
    ])
  })

  it("rejects an approved revision when its reviewed content changed", async () => {
    const contract = await insertContract("draft", "Reviewed title")
    const command = await approvedCommand("send", "send-content-drift", {
      contractId: contract.id,
      recipient: "traveller@example.com",
      channel: "email",
      revision: 1,
      contentFingerprint: await bookingContractContentFingerprint(contract),
      notificationsSuppressed: false,
    })
    await db
      .update(contracts)
      .set({ title: "Changed after review" })
      .where(eq(contracts.id, contract.id))

    await expect(executeCommand(command)).rejects.toMatchObject({ code: "INVALID_INPUT" })
    await expect(db.select().from(contracts).where(eq(contracts.id, contract.id))).resolves.toEqual(
      [expect.objectContaining({ status: "draft", title: "Changed after review" })],
    )
    expect(await db.select().from(eventOutboxTable)).toHaveLength(0)
  })

  it("holds deletion eligibility through delete against a concurrent managed-workflow PATCH", async () => {
    const contract = await insertContract("draft", "Concurrent delete")
    let releaseDelete: () => void = () => undefined
    const holdDelete = new Promise<void>((resolve) => {
      releaseDelete = resolve
    })
    let lockReached: () => void = () => undefined
    const locked = new Promise<void>((resolve) => {
      lockReached = resolve
    })
    const deletion = contractsService.deleteContract(db, contract.id, {
      async afterLock() {
        lockReached()
        await holdDelete
      },
    })
    await locked

    let patchSettled = false
    const patch = contractsService
      .updateContract(db, contract.id, {
        metadata: { bookingContractWorkflow: { revision: 1, reviewOnly: true } },
      })
      .then(
        () => {
          patchSettled = true
          throw new Error("Concurrent PATCH unexpectedly committed")
        },
        (error: unknown) => {
          patchSettled = true
          return error
        },
      )
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(patchSettled).toBe(false)

    releaseDelete()
    await expect(deletion).resolves.toEqual({ status: "deleted" })
    await expect(patch).resolves.toMatchObject({ name: "RequestValidationError" })
    expect(await db.select().from(contracts).where(eq(contracts.id, contract.id))).toHaveLength(0)
  })

  async function insertContract(status: ContractStatus, title: string) {
    const [row] = await db
      .insert(contracts)
      .values({
        scope: "customer",
        status,
        title,
        stageHistory: [],
      })
      .returning()
    if (!row) throw new Error("Test contract insert failed")
    return row
  }

  async function executeCommand(
    command: Parameters<typeof executeLegalContractLifecycleCommand>[0],
  ) {
    const toolByTransition = {
      issue: issueLegalContractTool,
      send: sendLegalContractTool,
      void: voidLegalContractTool,
      execute: executeLegalContractTool,
    } as const
    const tool = toolByTransition[command.transition]
    const expectation = LEGAL_CONTRACT_LIFECYCLE_HANDLER_EXPECTATIONS[command.transition]
    const registry = createToolRegistry()
    registry.register(tool, { actionPolicy: expectation.actionPolicy })
    let execution: Awaited<ReturnType<typeof executeLegalContractLifecycleCommand>> | undefined
    const run = async (
      transition: Transition,
      admitted: Parameters<typeof executeLegalContractLifecycleCommand>[0]["admitted"],
    ) => {
      expect(transition).toBe(command.transition)
      execution = await executeLegalContractLifecycleCommand({ ...command, admitted })
      return execution.value
    }
    const lifecycleServices = {
      issueContractCommand: (_input, admitted) => run("issue", admitted),
      sendContractCommand: (_input, admitted) => run("send", admitted),
      voidContractCommand: (_input, admitted) => run("void", admitted),
      executeContractCommand: (_input, admitted) => run("execute", admitted),
    } satisfies LegalLifecycleCommandToolServices
    await registry.dispatch(tool.name, normalizeInput(command.transition, command.commandInput), {
      db: command.db,
      audience: command.context.actor,
      actor: command.context.actor,
      tenantId: command.context.organizationId,
      organizationId: command.context.organizationId,
      resolverScope: {
        locale: "en-GB",
        audience: command.context.actor,
        market: "default",
        actor: command.context.actor,
      },
      handlerActionPolicy: command.admitted,
      legal: lifecycleServices as LegalToolServices & LegalLifecycleCommandToolServices,
    } satisfies ToolContext & {
      legal: LegalToolServices & LegalLifecycleCommandToolServices
    })
    if (!execution) throw new Error("Legal lifecycle Tool did not execute its command service")
    return execution
  }

  async function approvedCommand(
    transition: Transition,
    idempotencyKey: string,
    commandInput: CommandInput,
  ) {
    const admitted = await createApprovedAdmission(transition, idempotencyKey, commandInput)
    return {
      db,
      context: requestContext,
      admitted,
      transition,
      commandInput,
    } as const
  }

  async function createApprovedAdmission(
    transition: Transition,
    idempotencyKey: string,
    commandInput: CommandInput,
  ) {
    const policy = LEGAL_CONTRACT_LIFECYCLE_POLICIES[transition]
    const expectation = LEGAL_CONTRACT_LIFECYCLE_HANDLER_EXPECTATIONS[transition]
    const normalizedInput = normalizeInput(transition, commandInput)
    const fingerprint = await commandFingerprint(transition, normalizedInput)
    const requested = await actionLedgerService.requestApproval(db, {
      requestedAction: {
        actionName: policy.actionName,
        actionVersion: policy.actionVersion,
        actionKind: "execute",
        evaluatedRisk: policy.evaluatedRisk,
        principalType: "user",
        principalId: requestContext.userId,
        organizationId: requestContext.organizationId,
        routeOrToolName: policy.toolCapabilityId,
        idempotencyScope: `test:legal-approval:${policy.actionName}`,
        idempotencyKey,
        idempotencyFingerprint: fingerprint,
        targetType: policy.canonicalTargetType,
        targetId: normalizedInput.contractId,
        capabilityId: policy.actionName,
        capabilityVersion: policy.actionVersion,
        authorizationSource: "legal_lifecycle_test",
      },
      approval: {
        policyName: policy.approvalPolicyName,
        policyVersion: policy.actionVersion,
        requestedByPrincipalId: requestContext.userId,
        riskSnapshot: policy.evaluatedRisk,
        reasonCode,
      },
    })
    await actionLedgerService.decideApproval(db, {
      id: requested.approval.id,
      status: "approved",
      decidedByPrincipalId: "user_approver",
      decisionAction: {
        actionName: "@voyant-travel/legal#action.approve-lifecycle-test",
        actionVersion: "v1",
        principalType: "user",
        principalId: "user_approver",
        organizationId: requestContext.organizationId,
      },
    })
    return admitted(
      expectation,
      idempotencyKey,
      fingerprint,
      requested.approval.id,
      normalizedInput.contractId,
    )
  }

  async function admittedForExistingApproval(
    transition: Transition,
    idempotencyKey: string,
    commandInput: CommandInput,
    approvalId: string,
  ) {
    return admitted(
      LEGAL_CONTRACT_LIFECYCLE_HANDLER_EXPECTATIONS[transition],
      idempotencyKey,
      await commandFingerprint(transition, normalizeInput(transition, commandInput)),
      approvalId,
      commandInput.contractId,
    )
  }

  function admitted(
    expectation: (typeof LEGAL_CONTRACT_LIFECYCLE_HANDLER_EXPECTATIONS)[Transition],
    idempotencyKey: string,
    fingerprint: string,
    approvalId: string,
    contractId: string,
  ) {
    return {
      capabilityId: expectation.capabilityId,
      capabilityVersion: expectation.capabilityVersion,
      canonicalName: expectation.canonicalName,
      actionPolicy: {
        ...expectation.actionPolicy,
        enforcement: "handler" as const,
        invocation: {
          controlField: "_voyant" as const,
          requiredFields: [
            "confirmed",
            "targetId",
            "idempotencyKey",
            "approvalId",
            "idempotencyFingerprint",
          ] as const,
          optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"] as const,
          fingerprintAlgorithm: "action-ledger-command-v1" as const,
        },
      },
      invocation: {
        confirmed: true,
        targetId: contractId,
        idempotencyKey,
        approvalId,
        idempotencyFingerprint: fingerprint,
        reasonCode,
      },
    }
  }

  function normalizeInput(transition: Transition, input: CommandInput) {
    if (transition === "void") {
      return {
        contractId: input.contractId,
        revision: input.revision ?? 1,
        reason: input.reason ?? "Operator voided contract",
        acknowledgedConsequences: true as const,
      }
    }
    if (transition !== "send") return { contractId: input.contractId }
    if (!input.contentFingerprint) {
      return {
        contractId: input.contractId,
        recipientEmail: input.recipient ?? null,
        subject: input.subject ?? null,
        message: input.message ?? null,
      }
    }
    return {
      contractId: input.contractId,
      recipient: input.recipient ?? "traveller@example.com",
      channel: input.channel ?? "email",
      revision: input.revision ?? 1,
      contentFingerprint: input.contentFingerprint,
      notificationsSuppressed: input.notificationsSuppressed ?? false,
      subject: input.subject ?? null,
      message: input.message ?? null,
    }
  }

  async function commandFingerprint(transition: Transition, commandInput: CommandInput) {
    const policy = LEGAL_CONTRACT_LIFECYCLE_POLICIES[transition]
    return buildActionApprovalCommandFingerprint({
      actionName: policy.actionName,
      actionVersion: policy.actionVersion,
      targetType: policy.canonicalTargetType,
      targetId: commandInput.contractId,
      commandInput,
      approvalPolicy: "required",
      capabilityId: policy.actionName,
      capabilityVersion: policy.actionVersion,
      evaluatedRisk: policy.evaluatedRisk,
      reasonCode,
    })
  }
})

const reasonCode = "operator_approved"
const requestContext = {
  userId: "user_legal_lifecycle",
  callerType: "session",
  actor: "staff",
  organizationId: "organization_legal_lifecycle",
} as const
