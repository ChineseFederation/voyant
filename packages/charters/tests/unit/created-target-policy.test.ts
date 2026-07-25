import type { HandlerActionPolicyExpectation, ToolContext } from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"

import {
  buildChartersCreatedTargetFingerprint,
  CHARTERS_CREATED_TARGET_POLICIES,
  chartersHandlerActionPolicyExpectation,
} from "../../src/created-target-policy.js"
import { executeChartersCreate } from "../../src/mcp-runtime.js"
import {
  type ChartersToolServices,
  createCharterProductTool,
  createCharterYachtTool,
} from "../../src/tools.js"
import { chartersVoyantModule } from "../../src/voyant.js"

describe("charters created-target commands", () => {
  it("declares product and yacht creates as immutable handler commands", () => {
    for (const [policy, tool, outputKey] of [
      [CHARTERS_CREATED_TARGET_POLICIES.product, createCharterProductTool, "product"],
      [CHARTERS_CREATED_TARGET_POLICIES.yacht, createCharterYachtTool, "yacht"],
    ] as const) {
      expect(tool.actionPolicyEnforcement).toBe("handler")
      expect(tool.riskPolicy.reversible).toBe(false)
      expect(
        chartersVoyantModule.actions?.find(({ id }) => id === policy.actionName),
      ).toMatchObject({
        targetType: policy.canonicalTargetType,
        reversible: false,
        targetLifecycle: "created",
        createdTarget: {
          commandTargetType: policy.commandTargetType,
          resultReferenceType: policy.resultReferenceType,
          durability: "handler-command-claim-v1",
        },
      })
      expect(
        tool.outputSchema.safeParse({
          status: "created",
          [outputKey]: { id: "generated_1" },
          replayed: false,
        }).success,
      ).toBe(true)
      expect(tool.outputSchema.safeParse({ id: "generated_1", name: "mutable" }).success).toBe(
        false,
      )
    }
    expect(
      createCharterProductTool.inputSchema.safeParse({ slug: "product", name: "Product" }).success,
    ).toBe(true)
    expect(
      createCharterYachtTool.inputSchema.safeParse({
        slug: "yacht",
        name: "Yacht",
        yachtClass: "luxury_motor",
      }).success,
    ).toBe(true)
  })

  it("fingerprints drift and passes the exact executor transaction and Tool capability", async () => {
    const policy = CHARTERS_CREATED_TARGET_POLICIES.product
    const first = await buildChartersCreatedTargetFingerprint(policy, "key", { name: "A" })
    expect(await buildChartersCreatedTargetFingerprint(policy, "key", { name: "A" })).toBe(first)
    expect(await buildChartersCreatedTargetFingerprint(policy, "key", { name: "B" })).not.toBe(
      first,
    )

    const tx = { owned: "executor" } as never
    const admitted = admittedPolicy(chartersHandlerActionPolicyExpectation(policy), "key")
    let createdId: string | undefined
    let mutations = 0
    const routes: Array<string | null | undefined> = []
    const actionIdentities: Array<[string, string, string, string]> = []
    const executor: NonNullable<Parameters<typeof executeChartersCreate>[7]> = async (
      input,
      handlers,
    ) => {
      routes.push(input.admitted.capabilityId)
      actionIdentities.push([
        input.admitted.actionPolicy.capabilityId,
        input.admitted.actionPolicy.version,
        input.admitted.actionPolicy.capabilityId,
        input.admitted.actionPolicy.version,
      ])
      if (!createdId) {
        const mutation = await handlers.create(tx)
        createdId = mutation.targetId
        return {
          replayed: false,
          value: mutation.value,
          result: metadata(policy.resultReferenceType, createdId),
        }
      }
      const result = metadata(policy.resultReferenceType, createdId)
      return { replayed: true, value: await handlers.replay(tx, result), result }
    }
    const create: Parameters<typeof executeChartersCreate>[6] = async (receivedTx) => {
      expect(receivedTx).toBe(tx)
      mutations += 1
      return { id: "product_1" }
    }
    const command = [
      {} as never,
      { userId: "usr_1", callerType: "session", organizationId: "org_1" },
      policy,
      undefined,
      { slug: "product", name: "Product" },
      admitted,
      create,
      executor,
    ] as const
    await expect(executeChartersCreate(...command)).resolves.toMatchObject({
      replayed: false,
      value: { id: "product_1" },
    })
    await expect(executeChartersCreate(...command)).resolves.toMatchObject({
      replayed: true,
      value: { id: "product_1" },
    })
    expect(mutations).toBe(1)
    expect(routes).toEqual([policy.toolCapabilityId, policy.toolCapabilityId])
    expect(actionIdentities).toEqual([
      [policy.capabilityId, policy.actionVersion, policy.capabilityId, policy.actionVersion],
      [policy.capabilityId, policy.actionVersion, policy.capabilityId, policy.actionVersion],
    ])
  })

  it("rejects missing, stale, and excluded-actor admission before service mutation", async () => {
    for (const [policy, tool, input] of [
      [
        CHARTERS_CREATED_TARGET_POLICIES.product,
        createCharterProductTool,
        createCharterProductTool.inputSchema.parse({
          slug: "product",
          name: "Product",
          idempotencyKey: "key",
        }),
      ],
      [
        CHARTERS_CREATED_TARGET_POLICIES.yacht,
        createCharterYachtTool,
        createCharterYachtTool.inputSchema.parse({
          slug: "yacht",
          name: "Yacht",
          yachtClass: "luxury_motor",
          idempotencyKey: "key",
        }),
      ],
    ] as const) {
      const expectation = chartersHandlerActionPolicyExpectation(policy)
      for (const context of [
        toolContext(undefined),
        toolContext(admittedPolicy({ ...expectation, canonicalName: "stale_name" }, "key")),
        toolContext(admittedPolicy(expectation, "key"), "customer"),
      ]) {
        let mutations = 0
        context.charters = {
          async execute() {
            mutations += 1
            return { status: "created", product: { id: "product_1" }, replayed: false }
          },
        }
        await expect(tool.handler(input as never, context)).rejects.toMatchObject({
          code: expect.stringMatching(/ACTION_POLICY_REQUIRED|AUTHORIZATION_DENIED/),
        })
        expect(mutations).toBe(0)
      }
    }
  })

  it("rejects an unknown principal before executor or mutation", async () => {
    const policy = CHARTERS_CREATED_TARGET_POLICIES.yacht
    let executorCalls = 0
    let mutations = 0
    await expect(
      executeChartersCreate(
        {} as never,
        {},
        policy,
        "key",
        { name: "Yacht" },
        admittedPolicy(chartersHandlerActionPolicyExpectation(policy), "key"),
        async () => {
          mutations += 1
          return { id: "never" }
        },
        async () => {
          executorCalls += 1
          throw new Error("must not execute")
        },
      ),
    ).rejects.toThrow("concrete principal")
    expect(executorCalls).toBe(0)
    expect(mutations).toBe(0)
  })
})

function admittedPolicy(expectation: HandlerActionPolicyExpectation, key: string) {
  return {
    capabilityId: expectation.capabilityId,
    capabilityVersion: expectation.capabilityVersion,
    canonicalName: expectation.canonicalName,
    actionPolicy: {
      ...expectation.actionPolicy,
      enforcement: "handler" as const,
      invocation: {
        controlField: "_voyant" as const,
        requiredFields: ["idempotencyKey"] as const,
        optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"] as const,
        fingerprintAlgorithm: "action-ledger-command-v1" as const,
      },
    },
    invocation: { idempotencyKey: key },
  }
}

function toolContext(
  handlerActionPolicy?: ReturnType<typeof admittedPolicy>,
  actor: ToolContext["actor"] = "staff",
): ToolContext & { charters?: ChartersToolServices } {
  return {
    db: {},
    actor,
    audience: actor,
    tenantId: "tenant",
    resolverScope: { locale: "en", market: "default", actor, audience: actor },
    ...(handlerActionPolicy ? { handlerActionPolicy } : {}),
  }
}

function metadata(type: string, id: string) {
  return {
    entry: {} as never,
    reference: { type, id, value: `${type}:${id}` as `${string}:${string}` },
  }
}
