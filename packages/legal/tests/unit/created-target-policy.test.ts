import { describe, expect, it } from "vitest"

import {
  buildLegalContractDraftFingerprint,
  LEGAL_CONTRACT_DRAFT_CREATED_TARGET_POLICY,
  LEGAL_CONTRACT_DRAFT_HANDLER_EXPECTATION,
} from "../../src/created-target-policy.js"
import {
  executeLegalContractDraftCreate,
  resolveLegalContractDraftExpiration,
  resolveLegalContractDraftLanguage,
  resolveLegalContractDraftMetadata,
  resolveLegalContractDraftNumber,
} from "../../src/mcp-runtime.js"
import { createLegalContractDraftTool } from "../../src/tools.js"
import { legalVoyantModule } from "../../src/voyant.js"

describe("legal contract draft created-target command", () => {
  it("inherits Romanian when a revision omits language", () => {
    expect(createLegalContractDraftTool.inputSchema.parse({ title: "Revizie" })).not.toHaveProperty(
      "language",
    )
    expect(resolveLegalContractDraftLanguage(undefined, "ro")).toBe("ro")
    expect(resolveLegalContractDraftLanguage("en", "ro")).toBe("en")
  })

  it("preserves revision expiration unless the operator explicitly replaces it", () => {
    expect(
      resolveLegalContractDraftExpiration(undefined, new Date("2026-12-31T23:59:59.000Z")),
    ).toBe("2026-12-31T23:59:59.000Z")
    expect(
      resolveLegalContractDraftExpiration(
        "2027-01-31T23:59:59.000Z",
        new Date("2026-12-31T23:59:59.000Z"),
      ),
    ).toBe("2027-01-31T23:59:59.000Z")
  })

  it("allocates a unique managed booking number for every immutable revision", async () => {
    let allocations = 0
    const allocated = await resolveLegalContractDraftNumber(
      {} as never,
      {
        bookingId: "book_1",
        seriesId: "series_1",
        variables: { booking: { reference: "BK-1" } },
      },
      async () => {
        allocations += 1
        return { number: "CTR-0042", sequence: 42 }
      },
    )
    expect(allocated).toEqual({
      contractNumber: "CTR-0042",
      variables: {
        booking: { reference: "BK-1" },
        contract: { contractNumber: "CTR-0042", number: "CTR-0042" },
      },
    })
    const revision = await resolveLegalContractDraftNumber(
      {} as never,
      {
        bookingId: "book_1",
        seriesId: "series_1",
        variables: allocated.variables,
      },
      async () => {
        allocations += 1
        return { number: "CTR-0043", sequence: 43 }
      },
    )
    expect(revision.contractNumber).toBe("CTR-0043")
    expect(revision.variables).toMatchObject({
      contract: { contractNumber: "CTR-0043", number: "CTR-0043" },
    })
    expect(allocations).toBe(2)
  })

  it("marks only booking drafts as managed booking revisions", () => {
    expect(
      resolveLegalContractDraftMetadata(
        { note: "generic" },
        { bookingContractWorkflow: { revision: 1 }, retained: true },
        { bookingId: null, revision: 2, previousRevisionId: "cont_1" },
      ),
    ).toEqual({ note: "generic", retained: true })
    expect(
      resolveLegalContractDraftMetadata(
        undefined,
        { retained: true },
        {
          bookingId: "book_1",
          revision: 2,
          previousRevisionId: "cont_1",
        },
      ),
    ).toEqual({
      retained: true,
      bookingContractWorkflow: {
        revision: 2,
        previousRevisionId: "cont_1",
        reviewOnly: true,
      },
    })
  })
  it("binds the create tool to a handler-owned durable graph action", () => {
    expect(createLegalContractDraftTool.actionPolicyEnforcement).toBe("handler")
    expect(
      legalVoyantModule.actions?.find(
        (action) => action.id === LEGAL_CONTRACT_DRAFT_CREATED_TARGET_POLICY.actionName,
      ),
    ).toMatchObject({
      reversible: false,
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: "legal_contract_draft_create_command",
        resultReferenceType: "legal-contract",
        durability: "handler-command-claim-v1",
      },
    })
  })

  it("sources the stable key from invocation metadata and fingerprints command drift", async () => {
    expect(createLegalContractDraftTool.inputSchema.safeParse({ title: "Draft" }).success).toBe(
      true,
    )

    const admittedAction = LEGAL_CONTRACT_DRAFT_HANDLER_EXPECTATION.actionPolicy
    const first = await buildLegalContractDraftFingerprint(admittedAction, "same-key", {
      title: "Draft A",
    })
    const replay = await buildLegalContractDraftFingerprint(admittedAction, "same-key", {
      title: "Draft A",
    })
    const drift = await buildLegalContractDraftFingerprint(admittedAction, "same-key", {
      title: "Draft B",
    })
    expect(replay).toBe(first)
    expect(drift).not.toBe(first)
    expect(
      createLegalContractDraftTool.outputSchema.safeParse({
        status: "created",
        contract: { id: "cont_1" },
        replayed: false,
      }).success,
    ).toBe(true)
    expect(
      createLegalContractDraftTool.outputSchema.safeParse({
        id: "cont_1",
        title: "mutable",
      }).success,
    ).toBe(false)
  })

  it("passes the executor transaction to contract creation and records the canonical Tool name", async () => {
    const tx = { transaction: "owned-by-executor" } as never
    let routeOrToolName: string | null | undefined
    let actionName: string | undefined
    let capabilityId: string | undefined
    let capabilityVersion: string | undefined
    let createCalls = 0
    const executor: NonNullable<Parameters<typeof executeLegalContractDraftCreate>[4]> = async (
      command,
      handlers,
    ) => {
      routeOrToolName = command.admitted.capabilityId
      actionName = command.admitted.actionPolicy.capabilityId
      capabilityId = command.admitted.actionPolicy.capabilityId
      capabilityVersion = command.admitted.actionPolicy.version
      const mutation = await handlers.create(tx)
      return {
        replayed: false as const,
        value: mutation.value,
        result: {
          entry: {} as never,
          reference: {
            type: "legal-contract",
            id: mutation.targetId,
            value: `legal-contract:${mutation.targetId}` as const,
          },
        },
      }
    }
    const createContract: NonNullable<
      Parameters<typeof executeLegalContractDraftCreate>[5]
    > = async (receivedTx) => {
      expect(receivedTx).toBe(tx)
      createCalls += 1
      return { id: "cont_1" } as never
    }

    await expect(
      executeLegalContractDraftCreate(
        {} as never,
        { userId: "usr_1", callerType: "session", organizationId: "org_1" },
        { idempotencyKey: "draft-key", title: "Draft", scope: "customer", language: "en" },
        legalHandlerContext(),
        executor,
        createContract,
      ),
    ).resolves.toMatchObject({ replayed: false, value: { id: "cont_1" } })
    expect(createCalls).toBe(1)
    expect(routeOrToolName).toBe("@voyant-travel/legal#tool.create-contract-draft")
    expect(actionName).toBe(LEGAL_CONTRACT_DRAFT_HANDLER_EXPECTATION.actionPolicy.capabilityId)
    expect(capabilityId).toBe(LEGAL_CONTRACT_DRAFT_HANDLER_EXPECTATION.actionPolicy.capabilityId)
    expect(capabilityVersion).toBe(LEGAL_CONTRACT_DRAFT_HANDLER_EXPECTATION.actionPolicy.version)
  })

  it("rejects unknown principals before executor and domain mutation", async () => {
    let executorCalls = 0
    let createCalls = 0
    await expect(
      executeLegalContractDraftCreate(
        {} as never,
        {},
        { idempotencyKey: "draft-key", title: "Draft", scope: "customer", language: "en" },
        legalHandlerContext(),
        async () => {
          executorCalls += 1
          throw new Error("executor must not run")
        },
        async () => {
          createCalls += 1
          return { id: "cont_never" } as never
        },
      ),
    ).rejects.toThrow("concrete principal")
    expect(executorCalls).toBe(0)
    expect(createCalls).toBe(0)
  })

  it("rejects missing or mismatched admitted idempotency before executor or mutation", async () => {
    let executorCalls = 0
    let createCalls = 0
    const execute = (
      admitted: ReturnType<typeof legalHandlerContext>,
      legacyIdempotencyKey?: string,
    ) =>
      executeLegalContractDraftCreate(
        {} as never,
        { userId: "usr_1", callerType: "session", organizationId: "org_1" },
        {
          ...(legacyIdempotencyKey ? { idempotencyKey: legacyIdempotencyKey } : {}),
          title: "Draft",
          scope: "customer",
          language: "en",
        },
        admitted,
        async () => {
          executorCalls += 1
          throw new Error("executor must not run")
        },
        async () => {
          createCalls += 1
          return { id: "cont_never" } as never
        },
      )

    await expect(execute(legalHandlerContext({ idempotencyKey: undefined }))).rejects.toMatchObject(
      { code: "ACTION_POLICY_REQUIRED" },
    )
    await expect(execute(legalHandlerContext(), "different-key")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    })
    expect(executorCalls).toBe(0)
    expect(createCalls).toBe(0)
  })

  it("denies missing, stale, and non-staff admission before service mutation", async () => {
    let mutations = 0
    const input = {
      idempotencyKey: "draft-key",
      title: "Draft",
      scope: "customer" as const,
      language: "en",
    }
    const service = {
      async createDraft() {
        mutations += 1
      },
    } as never
    const base = {
      db: {},
      actor: "staff" as const,
      audience: "staff" as const,
      tenantId: "tenant",
      resolverScope: {
        locale: "en",
        audience: "staff" as const,
        market: "default",
        actor: "staff" as const,
      },
      legal: service,
    }

    await expect(createLegalContractDraftTool.handler(input, base)).rejects.toMatchObject({
      code: "ACTION_POLICY_REQUIRED",
    })
    await expect(
      createLegalContractDraftTool.handler(input, {
        ...base,
        handlerActionPolicy: legalHandlerContext({ canonicalName: "stale_name" }),
      }),
    ).rejects.toMatchObject({ code: "ACTION_POLICY_REQUIRED" })
    await expect(
      createLegalContractDraftTool.handler(input, {
        ...base,
        actor: "partner",
        handlerActionPolicy: legalHandlerContext(),
      }),
    ).rejects.toMatchObject({ code: "ACTION_POLICY_REQUIRED" })
    expect(mutations).toBe(0)
  })
})

function legalHandlerContext(override: { canonicalName?: string; idempotencyKey?: string } = {}) {
  const expected = LEGAL_CONTRACT_DRAFT_HANDLER_EXPECTATION
  return {
    capabilityId: expected.capabilityId,
    capabilityVersion: expected.capabilityVersion,
    canonicalName: override.canonicalName ?? expected.canonicalName,
    actionPolicy: {
      ...expected.actionPolicy,
      enforcement: "handler" as const,
      invocation: {
        controlField: "_voyant" as const,
        requiredFields: ["confirmed"] as const,
        optionalFields: [] as const,
        fingerprintAlgorithm: "action-ledger-command-v1" as const,
      },
    },
    invocation: {
      confirmed: true,
      ...(override.idempotencyKey === undefined
        ? Object.hasOwn(override, "idempotencyKey")
          ? {}
          : { idempotencyKey: "draft-key" }
        : { idempotencyKey: override.idempotencyKey }),
    },
  }
}
