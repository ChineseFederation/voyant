import { describe, expect, it } from "vitest"

import {
  buildDistributionCreatedTargetFingerprint,
  DISTRIBUTION_CREATED_TARGET_HANDLER_EXPECTATIONS,
  DISTRIBUTION_CREATED_TARGET_POLICIES,
} from "../src/created-target-policy.js"
import { executeDistributionCreate } from "../src/mcp-runtime.js"
import {
  createDistributionChannelTool,
  createSupplierTool,
  type DistributionToolServices,
} from "../src/tools.js"
import { distributionVoyantModule } from "../src/voyant.js"

describe("distribution created-target commands", () => {
  it("binds both create tools to handler-owned durable graph actions", () => {
    expect(createSupplierTool.actionPolicyEnforcement).toBe("handler")
    expect(createDistributionChannelTool.actionPolicyEnforcement).toBe("handler")

    for (const [id, commandTargetType, resultReferenceType] of [
      ["@voyant-travel/distribution#action.create-supplier", "supplier_create_command", "supplier"],
      [
        "@voyant-travel/distribution#action.create-channel",
        "distribution_channel_create_command",
        "distribution-channel",
      ],
    ] as const) {
      expect(distributionVoyantModule.actions?.find((action) => action.id === id)).toMatchObject({
        reversible: false,
        targetLifecycle: "created",
        createdTarget: {
          commandTargetType,
          resultReferenceType,
          durability: "handler-command-claim-v1",
        },
      })
    }
  })

  it("sources stable keys from invocation metadata and fingerprints command drift", async () => {
    expect(
      createSupplierTool.inputSchema.safeParse({ name: "Supplier", type: "guide" }).success,
    ).toBe(true)
    expect(
      createDistributionChannelTool.inputSchema.safeParse({ name: "Channel", kind: "direct" })
        .success,
    ).toBe(true)

    const policy = DISTRIBUTION_CREATED_TARGET_POLICIES.supplier
    const admittedAction = DISTRIBUTION_CREATED_TARGET_HANDLER_EXPECTATIONS.supplier.actionPolicy
    const first = await buildDistributionCreatedTargetFingerprint(
      policy,
      admittedAction,
      "same-key",
      { name: "Supplier A" },
    )
    const replay = await buildDistributionCreatedTargetFingerprint(
      policy,
      admittedAction,
      "same-key",
      { name: "Supplier A" },
    )
    const drift = await buildDistributionCreatedTargetFingerprint(
      policy,
      admittedAction,
      "same-key",
      { name: "Supplier B" },
    )
    expect(replay).toBe(first)
    expect(drift).not.toBe(first)
    expect(
      createSupplierTool.outputSchema.safeParse({
        status: "created",
        supplier: { id: "supp_1" },
        replayed: false,
      }).success,
    ).toBe(true)
    expect(
      createSupplierTool.outputSchema.safeParse({ id: "supp_1", name: "mutable" }).success,
    ).toBe(false)
  })

  it("passes the executor transaction to the domain service and replays one immutable id", async () => {
    const db = {} as never
    const tx = { transaction: "owned-by-executor" } as never
    const policy = DISTRIBUTION_CREATED_TARGET_POLICIES.supplier
    const admitted = handlerContext(DISTRIBUTION_CREATED_TARGET_HANDLER_EXPECTATIONS.supplier)
    let createdId: string | undefined
    let mutations = 0
    const routes: Array<string | null | undefined> = []
    const ledgerIdentities: Array<{
      actionName: string
      capabilityId: string
      capabilityVersion: string
    }> = []
    const executor: NonNullable<Parameters<typeof executeDistributionCreate>[7]> = async (
      input,
      handlers,
    ) => {
      routes.push(input.admitted.capabilityId)
      ledgerIdentities.push({
        actionName: input.admitted.actionPolicy.capabilityId,
        capabilityId: input.admitted.actionPolicy.capabilityId,
        capabilityVersion: input.admitted.actionPolicy.version,
      })
      if (!createdId) {
        const mutation = await handlers.create(tx)
        createdId = mutation.targetId
        return {
          replayed: false as const,
          value: mutation.value,
          result: {
            entry: {} as never,
            reference: {
              type: policy.resultReferenceType,
              id: mutation.targetId,
              value: `${policy.resultReferenceType}:${mutation.targetId}` as const,
            },
          },
        }
      }
      const result = {
        entry: {} as never,
        reference: {
          type: policy.resultReferenceType,
          id: createdId,
          value: `${policy.resultReferenceType}:${createdId}` as const,
        },
      }
      return { replayed: true as const, value: await handlers.replay(tx, result), result }
    }
    const create: Parameters<typeof executeDistributionCreate>[6] = async (receivedTx) => {
      expect(receivedTx).toBe(tx)
      mutations += 1
      return { id: "supp_1" }
    }
    const context = { userId: "same", callerType: "session", organizationId: "org_1" }

    const fresh = await executeDistributionCreate(
      db,
      context,
      policy,
      "same-key",
      { name: "Supplier" },
      admitted,
      create,
      executor,
    )
    const replay = await executeDistributionCreate(
      db,
      context,
      policy,
      "same-key",
      { name: "Supplier" },
      admitted,
      create,
      executor,
    )

    expect(fresh).toMatchObject({ replayed: false, value: { id: "supp_1" } })
    expect(replay).toMatchObject({ replayed: true, value: { id: "supp_1" } })
    expect(mutations).toBe(1)
    expect(routes).toEqual([
      "@voyant-travel/distribution#tool.create-supplier",
      "@voyant-travel/distribution#tool.create-supplier",
    ])
    expect(ledgerIdentities).toEqual([
      {
        actionName: admitted.actionPolicy.capabilityId,
        capabilityId: admitted.actionPolicy.capabilityId,
        capabilityVersion: admitted.actionPolicy.version,
      },
      {
        actionName: admitted.actionPolicy.capabilityId,
        capabilityId: admitted.actionPolicy.capabilityId,
        capabilityVersion: admitted.actionPolicy.version,
      },
    ])
  })

  it("rejects an unknown principal before executor or mutation", async () => {
    let executorCalls = 0
    let mutations = 0
    await expect(
      executeDistributionCreate(
        {} as never,
        {},
        DISTRIBUTION_CREATED_TARGET_POLICIES.supplier,
        "key",
        { name: "Supplier" },
        handlerContext(DISTRIBUTION_CREATED_TARGET_HANDLER_EXPECTATIONS.supplier, {
          idempotencyKey: "key",
        }),
        async () => {
          mutations += 1
          return { id: "supp_never" }
        },
        async () => {
          executorCalls += 1
          throw new Error("executor must not run")
        },
      ),
    ).rejects.toThrow("concrete principal")
    expect(executorCalls).toBe(0)
    expect(mutations).toBe(0)
  })

  it("rejects missing or mismatched admitted idempotency before executor or mutation", async () => {
    const expected = DISTRIBUTION_CREATED_TARGET_HANDLER_EXPECTATIONS.supplier
    let executorCalls = 0
    let mutations = 0
    const execute = (admitted: ReturnType<typeof handlerContext>, legacyKey?: string) =>
      executeDistributionCreate(
        {} as never,
        { userId: "usr_1", callerType: "session", organizationId: "org_1" },
        DISTRIBUTION_CREATED_TARGET_POLICIES.supplier,
        legacyKey,
        { name: "Supplier" },
        admitted,
        async () => {
          mutations += 1
          return { id: "supp_never" }
        },
        async () => {
          executorCalls += 1
          throw new Error("executor must not run")
        },
      )

    await expect(
      execute(handlerContext(expected, { idempotencyKey: undefined })),
    ).rejects.toMatchObject({ code: "ACTION_POLICY_REQUIRED" })
    await expect(execute(handlerContext(expected), "different-key")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    })
    expect(executorCalls).toBe(0)
    expect(mutations).toBe(0)
  })

  it.each([
    ["supplier", createSupplierTool, { idempotencyKey: "key", name: "Supplier", type: "guide" }],
    [
      "channel",
      createDistributionChannelTool,
      { idempotencyKey: "key", name: "Channel", kind: "direct" },
    ],
  ] as const)("denies missing and stale %s admission before service mutation", async (key, tool, input) => {
    let mutations = 0
    const service = {
      async createSupplier() {
        mutations += 1
      },
      async createChannel() {
        mutations += 1
      },
    } as unknown as DistributionToolServices
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
      distribution: service,
    }

    await expect(tool.handler(input as never, base as never)).rejects.toMatchObject({
      code: "ACTION_POLICY_REQUIRED",
    })
    await expect(
      tool.handler(
        input as never,
        {
          ...base,
          handlerActionPolicy: handlerContext(
            DISTRIBUTION_CREATED_TARGET_HANDLER_EXPECTATIONS[key],
            { canonicalName: "stale_name" },
          ),
        } as never,
      ),
    ).rejects.toMatchObject({ code: "ACTION_POLICY_REQUIRED" })
    expect(mutations).toBe(0)
  })
})

function handlerContext(
  expected:
    | (typeof DISTRIBUTION_CREATED_TARGET_HANDLER_EXPECTATIONS)["supplier"]
    | (typeof DISTRIBUTION_CREATED_TARGET_HANDLER_EXPECTATIONS)["channel"],
  override: { canonicalName?: string; idempotencyKey?: string } = {},
) {
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
          : { idempotencyKey: "same-key" }
        : { idempotencyKey: override.idempotencyKey }),
    },
  }
}
