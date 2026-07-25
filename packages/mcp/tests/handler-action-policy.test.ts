import {
  createToolRegistry,
  defineTool,
  READ_ONLY_RISK,
  type ToolContext,
} from "@voyant-travel/tools"
import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { createMcpApiRoutes } from "../src/index.js"

const accessCatalog = {
  resources: [
    {
      id: "notifications",
      unitId: "@voyant-travel/notifications",
      resource: "notifications",
      label: "Notifications",
      description: "Notifications",
      wildcard: "allow" as const,
      actions: [{ action: "send", label: "Send", description: "Send" }],
    },
  ],
  presets: [],
}

describe("handler-owned MCP action policy", () => {
  it("does not double-gate a Tool that declares package-owned enforcement", async () => {
    const registry = createToolRegistry()
    let handlerCalls = 0
    const handlerContexts: ToolContext[] = []
    registry.register(
      defineTool({
        name: "handler_guarded_write",
        aliases: ["handler_guarded_write_alias"],
        description: "Handler-guarded write",
        inputSchema: z.object({ approvalId: z.string() }),
        outputSchema: z.object({ ok: z.boolean() }),
        requiredScopes: ["notifications:send"],
        tier: "destructive",
        riskPolicy: {
          destructive: true,
          reversible: false,
          dryRunSupported: false,
          confirmationRequired: true,
        },
        actionPolicyEnforcement: "handler",
        async handler(_input, ctx) {
          handlerCalls += 1
          handlerContexts.push(ctx)
          return { ok: true }
        },
      }),
      {
        capabilityId: "@voyant-travel/notifications#tool.handler-guarded-write",
        owner: "@voyant-travel/notifications",
        capabilityVersion: "v1",
        deploymentRisk: "critical",
        actionPolicy: {
          id: "@voyant-travel/notifications#action.handler-guarded-write",
          capabilityId: "@voyant-travel/notifications#action.handler-guarded-write",
          version: "v1",
          kind: "execute",
          targetType: "notification",
          commandTargetField: "approvalId",
          targetLifecycle: "existing",
          existingTarget: { durability: "handler-command-result-v1" },
          risk: "critical",
          ledger: "required",
          approval: "required",
        },
      },
    )
    const mcp = createMcpApiRoutes({
      accessCatalog,
      registry,
      requireActionPolicies: true,
      buildContext: () => buildContext(),
    })
    const outer = new Hono()
    outer.use("*", async (c, next) => {
      c.set("scopes", ["notifications:send"])
      await next()
    })
    outer.route("/", mcp)

    const unconfirmed = await readRpc(
      await outer.request(
        "/",
        rpc("tools/call", {
          name: "handler_guarded_write",
          arguments: {
            approvalId: "approval_1",
            _voyant: {
              idempotencyKey: "command_1",
              approvalId: "approval_1",
              idempotencyFingerprint: "sha256:command-1",
            },
          },
        }),
      ),
    )
    expect((unconfirmed.result as { isError?: boolean }).isError).toBe(true)
    expect(JSON.stringify(unconfirmed)).toContain("CONFIRMATION_REQUIRED")
    expect(handlerCalls).toBe(0)

    const called = await readRpc(
      await outer.request(
        "/",
        rpc("tools/call", {
          name: "handler_guarded_write_alias",
          arguments: {
            approvalId: "approval_1",
            _voyant: {
              confirmed: true,
              idempotencyKey: "command_1",
              approvalId: "approval_1",
              idempotencyFingerprint: "sha256:command-1",
            },
          },
        }),
      ),
    )
    expect((called.result as { structuredContent: unknown }).structuredContent).toEqual({
      ok: true,
    })
    expect(handlerCalls).toBe(1)
    expect(handlerContexts[0]?.handlerActionPolicy).toMatchObject({
      capabilityId: "@voyant-travel/notifications#tool.handler-guarded-write",
      canonicalName: "handler_guarded_write",
      actionPolicy: {
        id: "@voyant-travel/notifications#action.handler-guarded-write",
        approval: "required",
        existingTarget: { durability: "handler-command-result-v1" },
      },
      invocation: {
        confirmed: true,
        idempotencyKey: "command_1",
        approvalId: "approval_1",
        idempotencyFingerprint: "sha256:command-1",
      },
    })
    expect("handlerActionPolicy" in buildContext()).toBe(false)
    const manifest = (await (await outer.request("/manifest")).json()) as {
      tools: Array<{ actionPolicy?: { enforcement: string } }>
    }
    expect(manifest.tools[0]?.actionPolicy).toMatchObject({
      enforcement: "handler",
      existingTarget: { durability: "handler-command-result-v1" },
      invocation: {
        requiredFields: ["confirmed", "idempotencyKey", "approvalId", "idempotencyFingerprint"],
      },
    })
  })

  it("creates isolated handler invocation context without leaking controls between calls", async () => {
    const registry = createToolRegistry()
    const seen: Array<ToolContext["handlerActionPolicy"]> = []
    const receivedApprovalIds: Array<string | undefined> = []
    registry.register(
      defineTool({
        name: "isolated_handler_write",
        description: "Handler-owned write",
        inputSchema: z.object({ value: z.string() }),
        outputSchema: z.object({ ok: z.boolean() }),
        requiredScopes: ["notifications:send"],
        tier: "destructive",
        riskPolicy: {
          destructive: true,
          reversible: false,
          dryRunSupported: false,
          confirmationRequired: true,
        },
        actionPolicyEnforcement: "handler",
        async handler(_input, ctx) {
          seen.push(ctx.handlerActionPolicy)
          receivedApprovalIds.push(ctx.handlerActionPolicy?.invocation.approvalId)
          if (ctx.handlerActionPolicy) {
            const mutableInvocation = ctx.handlerActionPolicy.invocation as {
              approvalId?: string
            }
            mutableInvocation.approvalId = "mutated"
          }
          return { ok: true }
        },
      }),
      {
        capabilityId: "@voyant-travel/notifications#tool.isolated-handler-write",
        owner: "@voyant-travel/notifications",
        capabilityVersion: "v1",
        deploymentRisk: "critical",
        actionPolicy: {
          id: "@voyant-travel/notifications#action.isolated-handler-write",
          capabilityId: "@voyant-travel/notifications#action.isolated-handler-write",
          version: "v1",
          kind: "execute",
          targetType: "notification",
          risk: "critical",
          ledger: "required",
          approval: "required",
        },
      },
    )
    const base = buildContext()
    const mcp = createMcpApiRoutes({
      accessCatalog,
      registry,
      requireActionPolicies: true,
      buildContext: () => base,
    })
    const outer = new Hono()
    outer.use("*", async (c, next) => {
      c.set("scopes", ["notifications:send"])
      await next()
    })
    outer.route("/", mcp)

    for (const approvalId of ["approval_1", "approval_2"]) {
      await outer.request(
        "/",
        rpc("tools/call", {
          name: "isolated_handler_write",
          arguments: {
            value: approvalId,
            _voyant: {
              confirmed: true,
              idempotencyKey: approvalId,
              approvalId,
              idempotencyFingerprint: `sha256:${approvalId}`,
            },
          },
        }),
      )
    }

    expect(seen).toHaveLength(2)
    expect(seen[0]).not.toBe(seen[1])
    expect(seen[0]?.invocation).not.toBe(seen[1]?.invocation)
    expect(receivedApprovalIds).toEqual(["approval_1", "approval_2"])
    expect(base.handlerActionPolicy).toBeUndefined()
  })

  it("strips stale handler policy context from generic and unbound dispatch", async () => {
    const registry = createToolRegistry()
    const seen: Array<ToolContext["handlerActionPolicy"]> = []
    const definition = (name: string) =>
      defineTool({
        name,
        description: "Context visibility probe",
        inputSchema: z.object({}),
        outputSchema: z.object({ ok: z.boolean() }),
        requiredScopes: ["notifications:send"],
        tier: "read",
        riskPolicy: READ_ONLY_RISK,
        async handler(_input, ctx) {
          seen.push(ctx.handlerActionPolicy)
          return { ok: true }
        },
      })
    registry.register(definition("generic_context_probe"), {
      capabilityId: "@voyant-travel/notifications#tool.generic-context-probe",
      owner: "@voyant-travel/notifications",
      capabilityVersion: "v1",
      actionPolicy: {
        id: "@voyant-travel/notifications#action.generic-context-probe",
        capabilityId: "@voyant-travel/notifications#action.generic-context-probe",
        version: "v1",
        kind: "read",
        targetType: "notification",
        risk: "low",
        ledger: "optional",
        approval: "never",
      },
    })
    registry.register(definition("unbound_context_probe"))
    const base = {
      ...buildContext(),
      handlerActionPolicy: { stale: true } as unknown as NonNullable<
        ToolContext["handlerActionPolicy"]
      >,
      toolActionPolicy: {
        async execute<T>(_input: unknown, dispatch: () => Promise<T>) {
          return dispatch()
        },
      },
    } satisfies ToolContext
    const mcp = createMcpApiRoutes({
      accessCatalog,
      registry,
      requireActionPolicies: true,
      buildContext: () => base,
    })
    const outer = new Hono()
    outer.use("*", async (c, next) => {
      c.set("scopes", ["notifications:send"])
      await next()
    })
    outer.route("/", mcp)

    for (const name of ["generic_context_probe", "unbound_context_probe"]) {
      const result = await readRpc(
        await outer.request("/", rpc("tools/call", { name, arguments: {} })),
      )
      expect((result.result as { structuredContent?: unknown }).structuredContent).toEqual({
        ok: true,
      })
    }
    expect(seen).toEqual([undefined, undefined])
    expect(base.handlerActionPolicy).toEqual({ stale: true })
  })

  it("rejects actors excluded by a handler policy before invoking the handler", async () => {
    const registry = createToolRegistry()
    let handlerCalls = 0
    registry.register(
      defineTool({
        name: "staff_only_handler_write",
        description: "Staff-only handler-owned write",
        inputSchema: z.object({}),
        outputSchema: z.object({ ok: z.boolean() }),
        requiredScopes: ["notifications:send"],
        tier: "destructive",
        riskPolicy: {
          destructive: true,
          reversible: false,
          dryRunSupported: false,
          confirmationRequired: true,
        },
        actionPolicyEnforcement: "handler",
        async handler() {
          handlerCalls += 1
          return { ok: true }
        },
      }),
      {
        capabilityId: "@voyant-travel/notifications#tool.staff-only-handler-write",
        owner: "@voyant-travel/notifications",
        capabilityVersion: "v1",
        deploymentRisk: "critical",
        actionPolicy: {
          id: "@voyant-travel/notifications#action.staff-only-handler-write",
          capabilityId: "@voyant-travel/notifications#action.staff-only-handler-write",
          version: "v1",
          kind: "execute",
          targetType: "notification",
          risk: "critical",
          ledger: "required",
          approval: "required",
          allowedActorTypes: ["staff"],
        },
      },
    )
    const mcp = createMcpApiRoutes({
      accessCatalog,
      registry,
      requireActionPolicies: true,
      buildContext: () => buildContext("customer"),
    })
    const outer = new Hono()
    outer.use("*", async (c, next) => {
      c.set("scopes", ["notifications:send"])
      await next()
    })
    outer.route("/", mcp)

    const result = await readRpc(
      await outer.request(
        "/",
        rpc("tools/call", {
          name: "staff_only_handler_write",
          arguments: {
            _voyant: {
              confirmed: true,
              idempotencyKey: "command_1",
              approvalId: "approval_1",
              idempotencyFingerprint: "sha256:command-1",
            },
          },
        }),
      ),
    )

    expect(JSON.stringify(result)).toContain("AUTHORIZATION_DENIED")
    expect(handlerCalls).toBe(0)
  })
})

function buildContext(actor: ToolContext["actor"] = "staff"): ToolContext {
  return {
    db: {},
    actor,
    audience: actor,
    tenantId: "t1",
    resolverScope: { locale: "en-GB", audience: actor, market: "default", actor },
  }
}

function rpc(method: string, params: unknown) {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }
}

async function readRpc(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    const line = text.split("\n").find((value) => value.startsWith("data:"))
    return JSON.parse(line?.slice("data:".length).trim() ?? "{}")
  }
  return JSON.parse(text)
}
