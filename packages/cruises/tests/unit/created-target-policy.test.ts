import type { HandlerActionPolicyExpectation, ToolContext } from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"

import {
  buildCruiseCreatedTargetFingerprint,
  buildCruiseShipCreatedTargetFingerprint,
  CRUISE_CREATED_TARGET_POLICY,
  CRUISE_HANDLER_ACTION_POLICY,
  CRUISE_SHIP_CREATED_TARGET_POLICY,
  CRUISE_SHIP_HANDLER_ACTION_POLICY,
} from "../../src/created-target-policy.js"
import { executeCruiseShipCreate } from "../../src/mcp-runtime.js"
import {
  type CruisesToolServices,
  createCruiseShipTool,
  createCruiseTool,
} from "../../src/tools.js"
import { cruisesVoyantModule } from "../../src/voyant.js"

describe("cruise ship created-target command", () => {
  it("declares an immutable handler-owned generated target", () => {
    const policy = CRUISE_SHIP_CREATED_TARGET_POLICY
    expect(createCruiseShipTool.actionPolicyEnforcement).toBe("handler")
    expect(createCruiseShipTool.riskPolicy.reversible).toBe(false)
    expect(cruisesVoyantModule.actions?.find(({ id }) => id === policy.actionName)).toMatchObject({
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
      createCruiseShipTool.inputSchema.safeParse({
        slug: "ship",
        name: "Ship",
        shipType: "ocean",
      }).success,
    ).toBe(true)
    expect(
      createCruiseShipTool.outputSchema.safeParse({
        status: "created",
        ship: { id: "ship_1" },
        replayed: false,
      }).success,
    ).toBe(true)
    expect(
      createCruiseShipTool.outputSchema.safeParse({ id: "ship_1", name: "mutable" }).success,
    ).toBe(false)
  })

  it("fingerprints drift and passes the exact executor transaction and Tool capability", async () => {
    const policy = CRUISE_SHIP_CREATED_TARGET_POLICY
    const first = await buildCruiseShipCreatedTargetFingerprint("key", { name: "A" })
    expect(await buildCruiseShipCreatedTargetFingerprint("key", { name: "A" })).toBe(first)
    expect(await buildCruiseShipCreatedTargetFingerprint("key", { name: "B" })).not.toBe(first)

    const tx = { owned: "executor" } as never
    const admitted = admittedPolicy(CRUISE_SHIP_HANDLER_ACTION_POLICY, "key")
    let createdId: string | undefined
    let mutations = 0
    const routes: Array<string | null | undefined> = []
    const actionIdentities: Array<[string, string, string, string]> = []
    const executor: NonNullable<Parameters<typeof executeCruiseShipCreate>[6]> = async (
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
    const create: Parameters<typeof executeCruiseShipCreate>[5] = async (receivedTx) => {
      expect(receivedTx).toBe(tx)
      mutations += 1
      return { id: "ship_1" }
    }
    const command = [
      {} as never,
      { userId: "usr_1", callerType: "session", organizationId: "org_1" },
      undefined,
      { slug: "ship", name: "Ship", shipType: "ocean" },
      admitted,
      create,
      executor,
    ] as const
    await expect(executeCruiseShipCreate(...command)).resolves.toMatchObject({
      replayed: false,
      value: { id: "ship_1" },
    })
    await expect(executeCruiseShipCreate(...command)).resolves.toMatchObject({
      replayed: true,
      value: { id: "ship_1" },
    })
    expect(mutations).toBe(1)
    expect(routes).toEqual([policy.toolCapabilityId, policy.toolCapabilityId])
    expect(actionIdentities).toEqual([
      [policy.capabilityId, policy.actionVersion, policy.capabilityId, policy.actionVersion],
      [policy.capabilityId, policy.actionVersion, policy.capabilityId, policy.actionVersion],
    ])
  })

  it("rejects missing, stale, and excluded-actor admission before service mutation", async () => {
    const input = createCruiseShipTool.inputSchema.parse({
      slug: "ship",
      name: "Ship",
      shipType: "ocean",
      idempotencyKey: "key",
    })
    for (const context of [
      toolContext(undefined),
      toolContext(
        admittedPolicy(
          { ...CRUISE_SHIP_HANDLER_ACTION_POLICY, canonicalName: "stale_name" },
          "key",
        ),
      ),
      toolContext(admittedPolicy(CRUISE_SHIP_HANDLER_ACTION_POLICY, "key"), "customer"),
    ]) {
      let mutations = 0
      context.cruises = {
        async execute() {
          mutations += 1
          return { status: "created", ship: { id: "ship_1" }, replayed: false }
        },
      }
      await expect(createCruiseShipTool.handler(input, context)).rejects.toMatchObject({
        code: expect.stringMatching(/ACTION_POLICY_REQUIRED|AUTHORIZATION_DENIED/),
      })
      expect(mutations).toBe(0)
    }
  })

  it("rejects an unknown principal before executor or mutation", async () => {
    let executorCalls = 0
    let mutations = 0
    await expect(
      executeCruiseShipCreate(
        {} as never,
        {},
        "key",
        { name: "Ship" },
        admittedPolicy(CRUISE_SHIP_HANDLER_ACTION_POLICY, "key"),
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

describe("cruise created-target command", () => {
  it("declares an available immutable handler-owned command with tested outbox durability", () => {
    const policy = CRUISE_CREATED_TARGET_POLICY
    expect(createCruiseTool.actionPolicyEnforcement).toBe("handler")
    expect(createCruiseTool.riskPolicy.reversible).toBe(false)
    expect(cruisesVoyantModule.actions?.find(({ id }) => id === policy.actionName)).toMatchObject({
      availability: { status: "available" },
      targetType: policy.canonicalTargetType,
      targetLifecycle: "created",
      effectBoundary: "multistage",
      durability: {
        strategy: "outbox",
        testReference: "tests/integration/created-target-tools.test.ts",
      },
      reversible: false,
      createdTarget: {
        commandTargetType: policy.commandTargetType,
        resultReferenceType: policy.resultReferenceType,
        durability: "handler-command-claim-v1",
      },
    })
    expect(
      createCruiseTool.inputSchema.safeParse({
        slug: "cruise",
        name: "Cruise",
        cruiseType: "ocean",
        nights: 7,
      }).success,
    ).toBe(true)
    expect(
      createCruiseTool.outputSchema.safeParse({
        status: "created",
        cruise: { id: "cruise_1" },
        replayed: false,
      }).success,
    ).toBe(true)
    expect(
      createCruiseTool.outputSchema.safeParse({ id: "cruise_1", name: "mutable" }).success,
    ).toBe(false)
    expect(CRUISE_HANDLER_ACTION_POLICY.actionPolicy.capabilityId).toBe(policy.capabilityId)
  })

  it("fingerprints exact input and rejects drift", async () => {
    const first = await buildCruiseCreatedTargetFingerprint("key", { name: "A" })
    expect(await buildCruiseCreatedTargetFingerprint("key", { name: "A" })).toBe(first)
    expect(await buildCruiseCreatedTargetFingerprint("key", { name: "B" })).not.toBe(first)
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
): ToolContext & { cruises?: CruisesToolServices } {
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
