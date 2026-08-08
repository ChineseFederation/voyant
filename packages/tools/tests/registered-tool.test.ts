import { describe, expect, it } from "vitest"
import { z } from "zod"

import { createToolRegistry, defineTool } from "../src/index.js"

describe("server-resolved idempotency keys", () => {
  it("does not advertise idempotencyKey as caller-required when the handler mints it", () => {
    // book_product exists so the caller carries no token across calls. Advertising
    // idempotencyKey as required told an agent to supply the very thing the Tool
    // resolves for it — the manifest contradicting the description.
    const registry = createToolRegistry()
    registry.register(
      defineTool({
        capabilityId: "@test#tool.intent",
        owner: "@test",
        name: "intent_tool",
        description: "Intent-level tool that mints its own key.",
        inputSchema: z.object({ productId: z.string() }),
        outputSchema: z.object({ id: z.string() }),
        requiredScopes: [],
        tier: "destructive",
        riskPolicy: {
          destructive: true,
          reversible: false,
          dryRunSupported: false,
          confirmationRequired: true,
          sideEffects: ["data-write"],
        },
        actionPolicyEnforcement: "handler",
        resolvesIdempotencyKeyServerSide: true,
        async handler() {
          return { id: "x" }
        },
      }),
      {
        actionPolicy: {
          id: "@test#action.intent",
          capabilityId: "@test#action.intent",
          version: "v1",
          kind: "execute",
          targetType: "thing",
          targetLifecycle: "created",
          risk: "high",
          ledger: "required",
          approval: "never",
          reversible: false,
          createdTarget: {
            commandTargetType: "thing_create_command",
            resultReferenceType: "thing",
            durability: "handler-command-claim-v1",
          },
        },
      },
    )

    const entry = registry.list().find(({ name }) => name === "intent_tool")
    const required = entry?.actionPolicy?.invocation.requiredFields ?? []

    expect(required).toContain("confirmed")
    expect(required).not.toContain("idempotencyKey")
  })

  it("advertises an approval id without making callers echo the server fingerprint", () => {
    const registry = createToolRegistry()
    registry.register(
      defineTool({
        capabilityId: "@test#tool.cancel",
        owner: "@test",
        name: "cancel_thing",
        description: "Cancel one existing thing after approval.",
        inputSchema: z.object({ id: z.string() }),
        outputSchema: z.object({ id: z.string() }),
        requiredScopes: [],
        tier: "destructive",
        riskPolicy: {
          destructive: true,
          reversible: false,
          dryRunSupported: false,
          confirmationRequired: true,
          sideEffects: ["data-write"],
        },
        actionPolicyEnforcement: "handler",
        resolvesIdempotencyKeyServerSide: true,
        async handler({ id }) {
          return { id }
        },
      }),
      {
        actionPolicy: {
          id: "@test#action.cancel",
          capabilityId: "@test#action.cancel",
          version: "v1",
          kind: "execute",
          targetType: "thing",
          commandTargetField: "id",
          targetLifecycle: "existing",
          risk: "high",
          ledger: "required",
          approval: "required",
          policy: "thing-cancellation-v1",
          reversible: false,
          existingTarget: { durability: "handler-command-result-v1" },
        },
      },
    )

    const required =
      registry.list().find(({ name }) => name === "cancel_thing")?.actionPolicy?.invocation
        .requiredFields ?? []

    expect(required).toContain("confirmed")
    expect(required).toContain("approvalId")
    expect(required).not.toContain("idempotencyKey")
    expect(required).not.toContain("idempotencyFingerprint")
  })
})
