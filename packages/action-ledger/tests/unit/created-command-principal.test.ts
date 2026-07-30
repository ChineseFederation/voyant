import {
  createToolRegistry,
  defineTool,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  buildCreatedTargetIdempotencyScope,
  executeAdmittedCreatedTargetCommand,
} from "../../src/created-command-internal.js"
import { mapActionLedgerRequestContext } from "../../src/request-context.js"
import { drizzleDb } from "./service-fixtures.js"

const CHALLENGE_ID = "svch_1"
const GUEST_PRINCIPAL_ID = `storefront-verification:${CHALLENGE_ID}`

/**
 * A verified storefront guest: authorized as a customer, but audited as a
 * challenge-derived non-user principal. `userId` is deliberately absent so the
 * synthetic identity cannot reach `createdByUserId` downstream.
 */
const GUEST_CONTEXT = {
  organizationId: "org_1",
  actor: "customer",
  callerType: "session",
  principalSubtype: "verified_guest",
  sessionId: CHALLENGE_ID,
} as const

/** Thrown from the db double to prove execution got past principal mapping. */
class ReachedTransaction extends Error {}

function transactionOnlyDb() {
  return drizzleDb({
    transaction() {
      throw new ReachedTransaction("reached the command transaction")
    },
  })
}

function commandInput(admitted: ToolHandlerActionPolicyContext, fallbackPrincipalId?: string) {
  return {
    db: transactionOnlyDb(),
    context: GUEST_CONTEXT,
    admitted,
    ...(fallbackPrincipalId ? { fallbackPrincipalId } : {}),
    commandTargetType: "product-extra-create-command",
    canonicalTargetType: "product_extra",
    resultReferenceType: "product_extra",
    commandInput: { productId: "product_1" },
    evaluatedRisk: "high" as const,
  }
}

const handlers = {
  async create() {
    throw new Error("unexpected create")
  },
  async replay() {
    throw new Error("unexpected replay")
  },
}

describe("created-target command principal identity", () => {
  it("carries a non-user fallback principal through to the command", async () => {
    const admitted = await mintAdmission()

    // Reaching the transaction means principal mapping resolved a concrete
    // principal. Without the fallback being forwarded, the command rejects
    // before ever opening one (asserted by the next test).
    await expect(
      executeAdmittedCreatedTargetCommand(commandInput(admitted, GUEST_PRINCIPAL_ID), handlers),
    ).rejects.toThrow(ReachedTransaction)
  })

  it("refuses a command whose request has no concrete principal", async () => {
    const admitted = await mintAdmission()

    await expect(
      executeAdmittedCreatedTargetCommand(commandInput(admitted), handlers),
    ).rejects.toThrow("requires a concrete request principal")
  })

  it("audits the guest as a system principal without populating userId", () => {
    const actor = mapActionLedgerRequestContext(GUEST_CONTEXT, {
      fallbackPrincipalId: GUEST_PRINCIPAL_ID,
    })

    expect(actor).toMatchObject({
      actorType: "customer",
      principalType: "system",
      principalId: GUEST_PRINCIPAL_ID,
      principalSubtype: "verified_guest",
      sessionId: CHALLENGE_ID,
    })
  })

  it("never lets the fallback displace an authenticated account", () => {
    const actor = mapActionLedgerRequestContext(
      { ...GUEST_CONTEXT, userId: "usr_1" },
      { fallbackPrincipalId: GUEST_PRINCIPAL_ID },
    )

    expect(actor).toMatchObject({ principalType: "user", principalId: "usr_1" })
  })

  it("scopes guest idempotency to the challenge rather than to a shared realm", async () => {
    const scopeFor = (principalId: string) =>
      buildCreatedTargetIdempotencyScope({
        actionName: "@voyant-travel/finance#bookings-create-extension.action.create-booking",
        actionVersion: "v1",
        principalType: "system",
        principalId,
        organizationId: "org_1",
      })

    const [first, second, repeat] = await Promise.all([
      scopeFor(GUEST_PRINCIPAL_ID),
      scopeFor("storefront-verification:svch_2"),
      scopeFor(GUEST_PRINCIPAL_ID),
    ])

    expect(first).not.toBe(second)
    expect(repeat).toBe(first)
  })
})

/** Mint an authentic admission the only way callers can: real Tool dispatch. */
async function mintAdmission(): Promise<ToolHandlerActionPolicyContext> {
  const actionName = "inventory:product-extra:create"
  const actionPolicy = {
    id: actionName,
    capabilityId: actionName,
    version: "v1",
    kind: "execute" as const,
    targetType: "product_extra",
    targetLifecycle: "created" as const,
    createdTarget: {
      commandTargetType: "product-extra-create-command",
      resultReferenceType: "product_extra",
      durability: "handler-command-claim-v1" as const,
    },
    risk: "high" as const,
    ledger: "required" as const,
    approval: "never" as const,
    reversible: false,
    enforcement: "handler" as const,
    invocation: {
      controlField: "_voyant" as const,
      requiredFields: ["idempotencyKey"] as const,
      optionalFields: [] as const,
      fingerprintAlgorithm: "action-ledger-command-v1" as const,
    },
  }
  const candidate: ToolHandlerActionPolicyContext = {
    capabilityId: "@voyant-travel/inventory#extras.tool.create-product-extra",
    capabilityVersion: "v1",
    canonicalName: "create_product_extra",
    actionPolicy,
    invocation: { idempotencyKey: "key_1" },
  }

  let admitted: ToolHandlerActionPolicyContext | undefined
  const registry = createToolRegistry()
  registry.register(
    defineTool({
      capabilityId: candidate.capabilityId,
      capabilityVersion: candidate.capabilityVersion,
      owner: "@voyant-travel/action-ledger-test",
      name: candidate.canonicalName,
      description: "Mint an authentic admission through real Tool dispatch",
      inputSchema: z.object({}),
      outputSchema: z.object({ ok: z.literal(true) }),
      requiredScopes: [],
      tier: "write",
      riskPolicy: {
        destructive: false,
        reversible: true,
        dryRunSupported: false,
        sideEffects: ["test"],
      },
      actionPolicyEnforcement: "handler",
      async handler(_args, context) {
        admitted = context.handlerActionPolicy
        return { ok: true as const }
      },
    }),
    { actionPolicy },
  )
  await registry.dispatch(
    candidate.canonicalName,
    {},
    {
      db: {},
      actor: "staff",
      audience: "staff",
      tenantId: "org_1",
      resolverScope: { locale: "en-GB", audience: "staff", market: "default", actor: "staff" },
      handlerActionPolicy: candidate,
    },
  )
  if (!admitted) throw new Error("Tool registry did not mint a handler admission")
  return admitted
}
