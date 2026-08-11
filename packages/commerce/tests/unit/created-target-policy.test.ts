import type { HandlerActionPolicyExpectation, ToolContext } from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"

import {
  buildCommerceCreatedTargetFingerprint,
  COMMERCE_CREATED_TARGET_POLICIES,
  commerceHandlerActionPolicyExpectation,
} from "../../src/created-target-policy.js"
import { executeCommerceCreate } from "../../src/mcp-runtime.js"
import {
  type CommerceToolServices,
  createCancellationPolicyTool,
  createPriceCatalogTool,
  createPromotionTool,
  createSellabilityPolicyTool,
} from "../../src/tools.js"
import { commerceVoyantModule } from "../../src/voyant.js"

describe("commerce created-target commands", () => {
  it("declares handler-owned generated targets with immutable outputs", () => {
    for (const [policy, tool, outputKey] of [
      [
        COMMERCE_CREATED_TARGET_POLICIES.sellabilityPolicy,
        createSellabilityPolicyTool,
        "sellabilityPolicy",
      ],
      [
        COMMERCE_CREATED_TARGET_POLICIES.cancellationPolicy,
        createCancellationPolicyTool,
        "cancellationPolicy",
      ],
      [COMMERCE_CREATED_TARGET_POLICIES.priceCatalog, createPriceCatalogTool, "priceCatalog"],
      [COMMERCE_CREATED_TARGET_POLICIES.promotion, createPromotionTool, "promotion"],
    ] as const) {
      expect(tool.actionPolicyEnforcement).toBe("handler")
      expect(tool.riskPolicy.reversible).toBe(false)
      expect(
        commerceVoyantModule.actions?.find(({ id }) => id === policy.actionName),
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
    expect(createCancellationPolicyTool.inputSchema.safeParse({ name: "Policy" }).success).toBe(
      true,
    )
    expect(createSellabilityPolicyTool.inputSchema.safeParse({ name: "Adults only" }).success).toBe(
      true,
    )
    expect(
      createPriceCatalogTool.inputSchema.safeParse({ code: "PUBLIC", name: "Public" }).success,
    ).toBe(true)
    expect(
      createPromotionTool.inputSchema.safeParse({
        name: "Summer",
        slug: "summer",
        discountType: "percentage",
        discountPercent: 10,
        scope: { kind: "global" },
      }).success,
    ).toBe(true)
  })

  it("fingerprints exact same-key commands and detects drift", async () => {
    const policy = COMMERCE_CREATED_TARGET_POLICIES.priceCatalog
    const first = await buildCommerceCreatedTargetFingerprint(policy, "same-key", {
      code: "PUBLIC",
      name: "Public",
    })
    expect(
      await buildCommerceCreatedTargetFingerprint(policy, "same-key", {
        code: "PUBLIC",
        name: "Public",
      }),
    ).toBe(first)
    expect(
      await buildCommerceCreatedTargetFingerprint(policy, "same-key", {
        code: "PRIVATE",
        name: "Private",
      }),
    ).not.toBe(first)
  })

  it("uses the executor transaction, canonical Tool capability, and immutable replay id", async () => {
    const tx = { owned: "executor" } as never
    const policy = COMMERCE_CREATED_TARGET_POLICIES.priceCatalog
    const admitted = admittedPolicy(commerceHandlerActionPolicyExpectation(policy), "same-key")
    let createdId: string | undefined
    let mutations = 0
    const routes: Array<string | null | undefined> = []
    const actionIdentities: Array<[string, string, string, string]> = []
    const executor: NonNullable<Parameters<typeof executeCommerceCreate>[7]> = async (
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
        return result(false, policy.resultReferenceType, createdId, mutation.value)
      }
      const replayResult = resultMetadata(policy.resultReferenceType, createdId)
      return {
        replayed: true,
        value: await handlers.replay(tx, replayResult),
        result: replayResult,
      }
    }
    const create: Parameters<typeof executeCommerceCreate>[6] = async (receivedTx) => {
      expect(receivedTx).toBe(tx)
      mutations += 1
      return { id: "catalog_1" }
    }
    const args = [
      {} as never,
      { userId: "usr_1", callerType: "session", organizationId: "org_1" },
      policy,
      undefined,
      { code: "PUBLIC", name: "Public" },
      admitted,
      create,
      executor,
    ] as const
    const fresh = await executeCommerceCreate(...args)
    const replay = await executeCommerceCreate(...args)
    expect(fresh).toMatchObject({ replayed: false, value: { id: "catalog_1" } })
    expect(replay).toMatchObject({ replayed: true, value: { id: "catalog_1" } })
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
        COMMERCE_CREATED_TARGET_POLICIES.sellabilityPolicy,
        createSellabilityPolicyTool,
        createSellabilityPolicyTool.inputSchema.parse({
          name: "Adults only",
        }),
      ],
      [
        COMMERCE_CREATED_TARGET_POLICIES.cancellationPolicy,
        createCancellationPolicyTool,
        createCancellationPolicyTool.inputSchema.parse({
          name: "Policy",
          idempotencyKey: "key",
        }),
      ],
      [
        COMMERCE_CREATED_TARGET_POLICIES.priceCatalog,
        createPriceCatalogTool,
        createPriceCatalogTool.inputSchema.parse({
          code: "PUBLIC",
          name: "Public",
          idempotencyKey: "key",
        }),
      ],
      [
        COMMERCE_CREATED_TARGET_POLICIES.promotion,
        createPromotionTool,
        createPromotionTool.inputSchema.parse({
          name: "Summer",
          slug: "summer",
          discountType: "percentage",
          discountPercent: 10,
          scope: { kind: "global" },
          idempotencyKey: "key",
        }),
      ],
    ] as const) {
      const expectation = commerceHandlerActionPolicyExpectation(policy)
      for (const context of [
        toolContext(undefined),
        toolContext(admittedPolicy({ ...expectation, canonicalName: "stale_name" }, "key")),
        toolContext(admittedPolicy(expectation, "key"), "customer"),
      ]) {
        let mutations = 0
        context.commerce = serviceStub(async () => {
          mutations += 1
        })
        await expect(tool.handler(input as never, context)).rejects.toMatchObject({
          code: expect.stringMatching(/ACTION_POLICY_REQUIRED|AUTHORIZATION_DENIED/),
        })
        expect(mutations).toBe(0)
      }
    }
  })

  it("rejects an unknown principal before executor or mutation", async () => {
    let executorCalls = 0
    let mutations = 0
    const policy = COMMERCE_CREATED_TARGET_POLICIES.priceCatalog
    await expect(
      executeCommerceCreate(
        {} as never,
        {},
        policy,
        "key",
        { code: "PUBLIC" },
        admittedPolicy(commerceHandlerActionPolicyExpectation(policy), "key"),
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
): ToolContext & { commerce?: CommerceToolServices } {
  return {
    db: {},
    actor,
    audience: actor,
    tenantId: "tenant",
    resolverScope: { locale: "en", market: "default", actor, audience: actor },
    ...(handlerActionPolicy ? { handlerActionPolicy } : {}),
  }
}

function serviceStub(onCreate: () => Promise<void>): CommerceToolServices {
  return new Proxy(
    {},
    {
      get() {
        return async () => {
          await onCreate()
          return { status: "created", priceCatalog: { id: "catalog_1" }, replayed: false }
        }
      },
    },
  ) as CommerceToolServices
}

function resultMetadata(type: string, id: string) {
  return {
    entry: {} as never,
    reference: { type, id, value: `${type}:${id}` as `${string}:${string}` },
  }
}

function result(replayed: false, type: string, id: string, value: { id: string }) {
  return { replayed, value, result: resultMetadata(type, id) }
}
