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
})
