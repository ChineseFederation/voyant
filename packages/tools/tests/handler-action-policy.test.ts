import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  admitHandlerActionPolicy,
  createToolRegistry,
  defineTool,
  type HandlerActionPolicyExpectation,
  type ToolContext,
  type ToolError,
} from "../src/index.js"

const expected = {
  capabilityId: "@voyant-travel/legal#tool.issue-document",
  capabilityVersion: "v1",
  canonicalName: "legal_issue_document",
  actionPolicy: {
    id: "@voyant-travel/legal#action.issue-document",
    capabilityId: "@voyant-travel/legal#action.issue-document",
    version: "v1",
    kind: "execute",
    targetType: "legal-document-command",
    targetLifecycle: "created",
    createdTarget: {
      commandTargetType: "legal-document-command",
      resultReferenceType: "legal-document",
      durability: "handler-command-claim-v1",
      parentAnchor: { targetType: "contract", targetIdField: "contractId" },
    },
    risk: "high",
    ledger: "required",
    approval: "required",
    allowedActorTypes: ["staff"],
  },
} satisfies HandlerActionPolicyExpectation

const invocationPolicy = {
  controlField: "_voyant",
  requiredFields: ["confirmed", "idempotencyKey", "approvalId", "idempotencyFingerprint"],
  optionalFields: ["reasonCode"],
  fingerprintAlgorithm: "action-ledger-command-v1",
} as const

describe("admitHandlerActionPolicy", () => {
  it("rejects a forged structural clone", () => {
    expect(() => admitHandlerActionPolicy(context(), expected)).toThrowError(
      expect.objectContaining<Partial<ToolError>>({ code: "ACTION_POLICY_REQUIRED" }),
    )
  })

  it("accepts an admission minted by real registry dispatch", async () => {
    const registry = createRegistry()
    await expect(registry.dispatch("legal_issue_document", {}, context())).resolves.toEqual({
      canonicalName: "legal_issue_document",
    })
  })

  it("rejects stale identity before minting or mutation", async () => {
    let mutations = 0
    const registry = createRegistry(() => {
      mutations += 1
    })
    const stale = context()
    if (!stale.handlerActionPolicy) throw new Error("missing test policy")
    stale.handlerActionPolicy.canonicalName = "legal_issue_document_alias"

    await expect(registry.dispatch("legal_issue_document", {}, stale)).rejects.toMatchObject({
      code: "ACTION_POLICY_REQUIRED",
    })
    expect(mutations).toBe(0)
  })
})

function createRegistry(beforeAdmit?: () => void) {
  const registry = createToolRegistry()
  registry.register(
    defineTool({
      capabilityId: expected.capabilityId,
      capabilityVersion: expected.capabilityVersion,
      owner: "@voyant-travel/legal",
      name: expected.canonicalName,
      description: "Test authentic handler admission",
      inputSchema: z.object({}),
      outputSchema: z.object({ canonicalName: z.string() }),
      requiredScopes: [],
      tier: "write",
      riskPolicy: {
        destructive: false,
        reversible: true,
        dryRunSupported: false,
        sideEffects: ["legal-document-write"],
      },
      actionPolicyEnforcement: "handler",
      async handler(_args, ctx) {
        beforeAdmit?.()
        const admitted = admitHandlerActionPolicy(ctx, expected)
        return { canonicalName: admitted.canonicalName }
      },
    }),
    { actionPolicy: expected.actionPolicy },
  )
  return registry
}

function context(actor: ToolContext["actor"] = "staff"): ToolContext {
  return {
    db: {},
    actor,
    audience: actor,
    tenantId: "tenant_1",
    resolverScope: { locale: "en-GB", audience: actor, market: "default", actor },
    handlerActionPolicy: {
      capabilityId: expected.capabilityId,
      capabilityVersion: expected.capabilityVersion,
      canonicalName: expected.canonicalName,
      actionPolicy: {
        ...expected.actionPolicy,
        enforcement: "handler",
        invocation: invocationPolicy,
      },
      invocation: {
        confirmed: true,
        idempotencyKey: "command_1",
        approvalId: "approval_1",
        idempotencyFingerprint: "sha256:command-1",
      },
    },
  }
}
