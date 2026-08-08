import type { VoyantGraphActionDeclaration } from "@voyant-travel/core/project"
import type { ToolActionPolicyExecutionInput, ToolActionPolicyManifest } from "@voyant-travel/tools"
import { afterEach, describe, expect, it, vi } from "vitest"

import { buildActionApprovalCommandFingerprint } from "../../src/fingerprint.js"
import { actionLedgerService } from "../../src/service.js"
import { createToolActionPolicyGate } from "../../src/tool-action-policy.js"

const requestId = "6c0f3fb4-2c96-4c3a-a520-28166167fb18"
const requestContext = {
  actor: "staff",
  callerType: "agent",
  agentId: "agent_1",
  organizationId: "org_1",
}

afterEach(() => vi.restoreAllMocks())

describe("generic MCP action-policy gate", () => {
  it("permits an optional-ledger routine read without action invocation metadata", async () => {
    const selected = action({ kind: "read", ledger: "optional", risk: "low" })
    const dispatch = vi.fn(async () => ({ ok: true }))

    await expect(gate(selected).execute(execution(selected, {}), dispatch)).resolves.toEqual({
      ok: true,
    })
    expect(dispatch).toHaveBeenCalledOnce()
  })

  it("fails closed when a ledgered action has no server-resolved target", async () => {
    const selected = action()
    const dispatch = vi.fn(async () => ({ ok: true }))

    await expect(
      gate(selected).execute(
        execution(selected, { confirmed: true, requestId }, { value: 1 }, " "),
        dispatch,
      ),
    ).rejects.toMatchObject({
      code: "ACTION_POLICY_REQUIRED",
      meta: { targetResolution: "package-resolver" },
    })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it("derives a stable key for a server-owned required-ledger action", async () => {
    const selected = action()
    const events: string[] = []
    let sequence = 0
    vi.spyOn(actionLedgerService, "appendEntry").mockImplementation(async (_db, input) => {
      events.push(`ledger:${input.status}`)
      sequence += 1
      return { entry: { id: `action_${sequence}`, ...input }, replayed: false } as never
    })

    const result = await gate(selected).execute(
      // Even an old client-supplied requestId cannot override the server's
      // command-derived key; otherwise omitting it on an approved retry changes
      // the key and invalidates the approval.
      execution(selected, { confirmed: true, requestId: "caller-placeholder" }),
      async () => {
        events.push("dispatch")
        return { ok: true }
      },
    )

    expect(result).toEqual({ ok: true })
    expect(events).toEqual(["ledger:requested", "dispatch", "ledger:succeeded"])
    expect(actionLedgerService.appendEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        targetId: "target_1",
        idempotencyKey: expect.stringMatching(/^mcp-request:sha256:[0-9a-f]{64}$/),
      }),
    )
  })

  it("retains the existing invocation contract for an unmigrated execute", async () => {
    const selected = action()
    vi.spyOn(actionLedgerService, "appendEntry")
      .mockResolvedValueOnce({
        entry: { id: "action_1", status: "requested" },
        replayed: false,
      } as never)
      .mockResolvedValueOnce({
        entry: { id: "action_2", status: "succeeded" },
        replayed: false,
      } as never)
    const migrated = execution(selected, {
      confirmed: true,
      targetId: "target_1",
      idempotencyKey: "legacy-key",
    })
    const { targetResolution: _targetResolution, ...legacyInvocation } =
      migrated.actionPolicy.invocation
    const { resolvedTargetId: _resolvedTargetId, ...legacyExecutionBase } = migrated
    const legacyExecution: ToolActionPolicyExecutionInput = {
      ...legacyExecutionBase,
      actionPolicy: {
        ...migrated.actionPolicy,
        invocation: legacyInvocation,
      },
    }

    await expect(
      gate(selected).execute(legacyExecution, async () => ({ ok: true })),
    ).resolves.toEqual({ ok: true })
    expect(actionLedgerService.appendEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        targetId: "target_1",
        idempotencyKey: "legacy-key",
      }),
    )
  })

  it("requires explicit confirmation before creating an approval", async () => {
    const selected = action({ approval: "required" })
    const requestApproval = vi.spyOn(actionLedgerService, "requestApproval")
    const dispatch = vi.fn(async () => ({ ok: true }))

    await expect(
      gate(selected).execute(execution(selected, { requestId }), dispatch),
    ).rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED" })
    expect(requestApproval).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
  })

  /**
   * The preflight CREATES the approval, so the caller must approve that exact one
   * and retry — never request another. The shared APPROVAL_REQUIRED default opens
   * with "call request_action_approval", which on this path mints a second,
   * unrelated approval and leaves the server-issued one pending, so the retry
   * fails identically forever.
   *
   * A real agent ran that loop against publish_product and could not escape it:
   *   publish_product -> APPROVAL_REQUIRED -> request_action_approval
   *   -> approve_action_approval -> publish_product -> APPROVAL_REQUIRED
   * Since publish_product is how a product leaves `draft`, this is why nothing the
   * capability harness created was ever bookable.
   */
  it("tells the caller to approve THIS approval, not to request another", async () => {
    const selected = action({ approval: "required" })
    vi.spyOn(actionLedgerService, "requestApproval").mockResolvedValue(
      approvalRequest(false) as never,
    )

    const error = await gate(selected)
      .execute(execution(selected, { confirmed: true, requestId }), vi.fn())
      .catch((thrown) => thrown as { nextSteps?: string[] })

    expect(error.nextSteps).toHaveLength(2)
    // The concrete id, not a description of where to find it.
    expect(error.nextSteps?.[0]).toContain("approve_action_approval")
    expect(error.nextSteps?.[0]).toContain("approval_1")
    expect(error.nextSteps?.[0]).toContain('"_voyant": {"confirmed": true}')
    expect(error.nextSteps?.[1]).toContain('"approvalId": "approval_1"')
    expect(error.nextSteps?.[1]).toContain("approval_1")
    // Confirmation is asserted on the approved retry too, so the retry step has
    // to say to keep it. Without this an agent alternates between
    // APPROVAL_REQUIRED and CONFIRMATION_REQUIRED, holding one field at a time.
    expect(error.nextSteps?.[1]).toContain('"confirmed": true')
    expect(error.nextSteps?.[1]).toContain("Do not send flat keys")
    // The loop-causing instruction must not survive anywhere in the remediation.
    expect(error.nextSteps?.join(" ")).toMatch(/do NOT call request_action_approval/)
  })

  it("creates and replays an approval preflight without dispatch", async () => {
    const selected = action({ approval: "required" })
    const derivedRequestId = `mcp-request:${await exactFingerprint(selected, { value: 1 })}`
    const requestApproval = vi.spyOn(actionLedgerService, "requestApproval")
    requestApproval
      .mockResolvedValueOnce(approvalRequest(false) as never)
      .mockResolvedValueOnce(approvalRequest(true) as never)
    const dispatch = vi.fn(async () => ({ ok: true }))
    const invoke = () =>
      gate(selected).execute(execution(selected, { confirmed: true, requestId }), dispatch)

    await expect(invoke()).rejects.toMatchObject({
      code: "APPROVAL_REQUIRED",
      meta: {
        approvalId: "approval_1",
        requestedActionId: "requested_1",
        status: "pending",
        requestId: derivedRequestId,
        idempotencyFingerprint: expect.stringMatching(/^sha256:/),
        replayed: false,
      },
    })
    await expect(invoke()).rejects.toMatchObject({
      code: "APPROVAL_REQUIRED",
      meta: {
        approvalId: "approval_1",
        requestId: derivedRequestId,
        idempotencyFingerprint: expect.stringMatching(/^sha256:/),
        replayed: true,
      },
    })
    expect(requestApproval).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        requestedAction: expect.objectContaining({
          targetId: "target_1",
          idempotencyKey: derivedRequestId,
          idempotencyFingerprint: expect.stringMatching(/^sha256:/),
        }),
      }),
    )
    expect(dispatch).not.toHaveBeenCalled()
  })

  it("rejects tampered command, target, principal, and request id through server recomputation", async () => {
    const selected = action({ approval: "required" })
    const validateApprovedAction = vi
      .spyOn(actionLedgerService, "validateApprovedAction")
      .mockResolvedValueOnce({ ok: false, reason: "fingerprint_mismatch" })
      .mockResolvedValueOnce({ ok: false, reason: "mismatched_action" })
      .mockResolvedValueOnce({ ok: false, reason: "principal_mismatch" })
      .mockResolvedValueOnce({
        ok: true,
        approval: { id: "approval_1" },
        requestedAction: { id: "requested_1", idempotencyKey: "another-request" },
      } as never)
    const dispatch = vi.fn(async () => ({ ok: true }))
    const invoke = (commandInput: unknown, targetId = "target_1") =>
      gate(selected).execute(
        execution(
          selected,
          { confirmed: true, requestId, approvalId: "approval_1" },
          commandInput,
          targetId,
        ),
        dispatch,
      )

    await expect(invoke({ value: "tampered" })).rejects.toMatchObject({
      meta: { reason: "fingerprint_mismatch" },
    })
    await expect(invoke({ value: 1 }, "target_2")).rejects.toMatchObject({
      meta: { reason: "mismatched_action" },
    })
    await expect(invoke({ value: 1 })).rejects.toMatchObject({
      meta: { reason: "principal_mismatch" },
    })
    await expect(invoke({ value: 1 })).rejects.toMatchObject({
      meta: { reason: "request_id_mismatch" },
    })
    expect(validateApprovedAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: "org_1",
        principalId: "agent_1",
        idempotencyFingerprint: expect.stringMatching(/^sha256:/),
      }),
    )
    expect(dispatch).not.toHaveBeenCalled()
  })

  it("executes the exact approved command once without a client fingerprint", async () => {
    const selected = action({ approval: "required" })
    const commandInput = { value: 1 }
    const fingerprint = await exactFingerprint(selected, commandInput)
    const derivedRequestId = `mcp-request:${fingerprint}`
    vi.spyOn(actionLedgerService, "validateApprovedAction").mockResolvedValue({
      ok: true,
      approval: { id: "approval_1" },
      requestedAction: { id: "requested_1", idempotencyKey: derivedRequestId },
      idempotencyFingerprint: fingerprint,
    } as never)
    const appended: unknown[] = []
    vi.spyOn(actionLedgerService, "appendEntry").mockImplementation(async (_db, input) => {
      appended.push(input)
      return { entry: { id: `entry_${appended.length}`, ...input }, replayed: false } as never
    })
    const dispatch = vi.fn(async () => ({ ok: true }))

    await expect(
      gate(selected).execute(
        execution(selected, { confirmed: true, requestId, approvalId: "approval_1" }, commandInput),
        dispatch,
      ),
    ).resolves.toEqual({ ok: true })
    expect(dispatch).toHaveBeenCalledOnce()
    expect(appended).toEqual([
      expect.objectContaining({ status: "requested", causationActionId: "requested_1" }),
      expect.objectContaining({
        status: "succeeded",
        causationActionId: "entry_1",
        approvalId: "approval_1",
        idempotencyFingerprint: fingerprint,
      }),
    ])
  })

  it("allows one exact retry after an approved dispatch fails", async () => {
    const selected = action({ approval: "required" })
    const commandInput = { value: 1 }
    const fingerprint = await exactFingerprint(selected, commandInput)
    const derivedRequestId = `mcp-request:${fingerprint}`
    vi.spyOn(actionLedgerService, "validateApprovedAction").mockResolvedValue({
      ok: true,
      approval: { id: "approval_1" },
      requestedAction: { id: "requested_1", idempotencyKey: derivedRequestId },
      idempotencyFingerprint: fingerprint,
    } as never)
    const entries = new Map<
      string,
      { id: string; status: string; idempotencyScope?: string | null }
    >()
    vi.spyOn(actionLedgerService, "appendEntry").mockImplementation(async (_db, input) => {
      const identity = `${input.idempotencyScope}:${input.idempotencyKey}`
      const existing = entries.get(identity)
      if (existing) return { entry: existing, replayed: true } as never
      const entry = { id: `entry_${entries.size + 1}`, ...input }
      entries.set(identity, entry)
      return { entry, replayed: false } as never
    })
    vi.spyOn(actionLedgerService, "listEntries").mockImplementation(
      async (_db, input) =>
        ({
          entries: [...entries.values()].filter(
            (entry) => entry.idempotencyScope === input.idempotencyScope,
          ),
          nextCursor: null,
        }) as never,
    )
    let completeRetry!: (value: { ok: true }) => void
    const retryResult = new Promise<{ ok: true }>((resolve) => {
      completeRetry = resolve
    })
    const dispatch = vi
      .fn<() => Promise<{ ok: true }>>()
      .mockRejectedValueOnce(new Error("readiness changed before publication"))
      .mockReturnValueOnce(retryResult)
    const invoke = () =>
      gate(selected).execute(
        execution(selected, { confirmed: true, approvalId: "approval_1" }, commandInput),
        dispatch,
      )

    await expect(invoke()).rejects.toThrow("readiness changed before publication")
    const retry = invoke()
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(2))
    await expect(invoke()).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      retryable: true,
      meta: { reason: "approved_execution_in_progress", attempt: 2 },
    })
    completeRetry({ ok: true })
    await expect(retry).resolves.toEqual({ ok: true })
    expect(dispatch).toHaveBeenCalledTimes(2)
  })

  it("rejects a package-resolved target that conflicts with the declared command target", async () => {
    const selected = action({ commandTargetField: "bookingId" })
    const dispatch = vi.fn(async () => ({ ok: true }))

    await expect(
      gate(selected).execute(
        execution(
          selected,
          { confirmed: true, requestId },
          { bookingId: "booking_A" },
          "booking_B",
        ),
        dispatch,
      ),
    ).rejects.toMatchObject({
      code: "ACTION_POLICY_REQUIRED",
      meta: {
        field: "bookingId",
        targetId: "booking_B",
        commandTarget: "booking_A",
      },
    })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it("accepts a package-resolved target when the command omits the declared target field", async () => {
    const selected = action({ commandTargetField: "id" })
    const events: string[] = []
    let sequence = 0
    vi.spyOn(actionLedgerService, "appendEntry").mockImplementation(async (_db, input) => {
      events.push(`ledger:${input.status}`)
      sequence += 1
      return { entry: { id: `action_${sequence}`, ...input }, replayed: false } as never
    })

    const result = await gate(selected).execute(
      execution(selected, { confirmed: true, requestId }, { dayId: "pday_1", title: "Alfama" }),
      async () => {
        events.push("dispatch")
        return { ok: true }
      },
    )

    expect(result).toEqual({ ok: true })
    expect(events).toEqual(["ledger:requested", "dispatch", "ledger:succeeded"])
    expect(actionLedgerService.appendEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetId: "target_1" }),
    )
  })

  it("rejects a padded command target before dispatching a Commerce-like mutation", async () => {
    const selected = action({ commandTargetField: "id" })
    const dispatch = vi.fn(async () => ({ ok: true }))

    await expect(
      gate(selected).execute(
        execution(
          selected,
          { confirmed: true, requestId },
          { id: " target_1 ", name: "Summer" },
          "target_1",
        ),
        dispatch,
      ),
    ).rejects.toMatchObject({
      code: "ACTION_POLICY_REQUIRED",
      meta: {
        field: "id",
        targetId: "target_1",
        commandTarget: " target_1 ",
      },
    })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it("fails closed for conditional and handler-owned durable policies", async () => {
    const conditional = action({ approval: "conditional" })
    const created = action({
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: "test-create-command",
        resultReferenceType: "test-target-ref",
        durability: "handler-command-claim-v1",
      },
    })
    const dispatch = vi.fn(async () => ({ ok: true }))

    await expect(
      gate(conditional).execute(execution(conditional, { confirmed: true, requestId }), dispatch),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" })
    await expect(
      gate(created).execute(execution(created, { confirmed: true, requestId }), dispatch),
    ).rejects.toMatchObject({
      code: "ACTION_POLICY_REQUIRED",
      message: expect.stringContaining("handler-owned durable command claim"),
    })
    expect(dispatch).not.toHaveBeenCalled()
  })
})

function gate(selected: VoyantGraphActionDeclaration) {
  return createToolActionPolicyGate({
    db: {} as never,
    selectedActions: [selected],
    requestContext,
  })
}

function action(
  overrides: Partial<VoyantGraphActionDeclaration> = {},
): VoyantGraphActionDeclaration {
  return {
    id: "@voyant-travel/test#action.mutate",
    capabilityId: "@voyant-travel/test#action.mutate",
    version: "v1",
    kind: "execute",
    targetType: "test-target",
    risk: "high",
    ledger: "required",
    approval: "never",
    allowedActorTypes: ["staff"],
    from: { tools: ["@voyant-travel/test#tool.mutate"] },
    ...overrides,
  }
}

function execution(
  selected: VoyantGraphActionDeclaration,
  invocation: ToolActionPolicyExecutionInput["invocation"],
  commandInput: unknown = { value: 1 },
  resolvedTargetId: string | undefined = "target_1",
): ToolActionPolicyExecutionInput {
  const actionPolicy: ToolActionPolicyManifest = {
    id: selected.id,
    capabilityId: selected.capabilityId ?? selected.id,
    version: selected.version,
    kind: selected.kind,
    targetType: selected.targetType,
    ...(selected.commandTargetField ? { commandTargetField: selected.commandTargetField } : {}),
    risk: selected.risk,
    ledger: selected.ledger,
    approval: selected.approval ?? "never",
    targetLifecycle: selected.targetLifecycle ?? "existing",
    ...(selected.existingTarget ? { existingTarget: selected.existingTarget } : {}),
    ...(selected.createdTarget ? { createdTarget: selected.createdTarget } : {}),
    allowedActorTypes: selected.allowedActorTypes,
    enforcement: "generic",
    invocation: {
      controlField: "_voyant",
      requiredFields: selected.kind === "execute" ? ["confirmed", "requestId"] : [],
      optionalFields: ["reasonCode", "approvalId"],
      fingerprintAlgorithm: "action-ledger-command-v1",
      targetResolution: "package-resolver",
    },
  }
  return {
    capabilityId: "@voyant-travel/test#tool.mutate",
    capabilityVersion: "v1",
    canonicalName: "mutate_test",
    actionPolicy,
    commandInput,
    invocation,
    ...(resolvedTargetId ? { resolvedTargetId } : {}),
  }
}

function approvalRequest(replayed: boolean) {
  return {
    requestedAction: { id: "requested_1" },
    approval: { id: "approval_1", status: "pending" },
    replayed,
  }
}

function exactFingerprint(selected: VoyantGraphActionDeclaration, commandInput: unknown) {
  return buildActionApprovalCommandFingerprint({
    actionName: selected.capabilityId ?? selected.id,
    actionVersion: selected.version,
    targetType: selected.targetType,
    targetId: "target_1",
    commandInput,
    approvalPolicy: "required",
    capabilityId: selected.capabilityId ?? selected.id,
    capabilityVersion: selected.version,
    evaluatedRisk: selected.risk,
    reasonCode: null,
  })
}
