import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  admitHandlerActionPolicy,
  assertAuthenticHandlerActionPolicyContext,
  createToolRegistry,
  defineTool,
  type HandlerActionPolicyExpectation,
  type RouteActionBinding,
  type ToolActionPolicyBinding,
  type ToolContext,
} from "../src/index.js"

const ACTION_ID = "@voyant-travel/finance#bookings-create-extension.action.create-booking-self"
const CAPABILITY_ID = "@voyant-travel/finance#bookings-create-extension.route.create-booking-self"

const invocation = {
  controlField: "_voyant",
  requiredFields: ["idempotencyKey"],
  optionalFields: [],
  fingerprintAlgorithm: "action-ledger-command-v1",
} as const

/** Customer-only, reachable only through the route that serves it. */
const routePolicy = {
  id: ACTION_ID,
  capabilityId: ACTION_ID,
  version: "v1",
  kind: "execute",
  targetType: "booking",
  targetLifecycle: "created",
  createdTarget: {
    commandTargetType: "finance_booking_create_command",
    resultReferenceType: "booking",
    durability: "handler-command-claim-v1",
  },
  risk: "high",
  ledger: "required",
  approval: "never",
  reversible: false,
  allowedActorTypes: ["customer"],
  transport: "route",
} satisfies ToolActionPolicyBinding

const routeBinding: RouteActionBinding = {
  capabilityId: CAPABILITY_ID,
  capabilityVersion: "v1",
  canonicalName: "create_booking_self_service",
  actionPolicy: routePolicy,
  invocation,
}

const routeExpectation = {
  capabilityId: CAPABILITY_ID,
  capabilityVersion: "v1",
  canonicalName: "create_booking_self_service",
  actionPolicy: routePolicy,
  transport: "route",
} satisfies HandlerActionPolicyExpectation

describe("route-bound action admission", () => {
  it("mints an authentic admission a route handler accepts", () => {
    const registry = createToolRegistry()
    registry.registerRouteAction(routeBinding)

    const admitted = registry.admitRouteAction(ACTION_ID, {
      actor: "customer",
      invocation: { idempotencyKey: "req_1" },
    })

    expect(() => assertAuthenticHandlerActionPolicyContext(admitted)).not.toThrow()
    expect(admitted.transport).toBe("route")
    expect(admitHandlerActionPolicy(context(admitted), routeExpectation)).toBe(admitted)
  })

  it("refuses a structural clone of a route admission", () => {
    const registry = createToolRegistry()
    registry.registerRouteAction(routeBinding)
    const admitted = registry.admitRouteAction(ACTION_ID, {
      actor: "customer",
      invocation: { idempotencyKey: "req_1" },
    })

    expect(() => admitHandlerActionPolicy(context({ ...admitted }), routeExpectation)).toThrowError(
      expect.objectContaining({ code: "ACTION_POLICY_REQUIRED" }),
    )
  })

  it("refuses an actor the action does not allow", () => {
    const registry = createToolRegistry()
    registry.registerRouteAction(routeBinding)

    expect(() =>
      registry.admitRouteAction(ACTION_ID, {
        actor: "staff",
        invocation: { idempotencyKey: "req_1" },
      }),
    ).toThrowError(expect.objectContaining({ code: "AUTHORIZATION_DENIED" }))
  })

  it("refuses to register an action that does not admit the route transport", () => {
    const registry = createToolRegistry()

    expect(() =>
      registry.registerRouteAction({
        ...routeBinding,
        actionPolicy: { ...routePolicy, transport: "tool" },
      }),
    ).toThrow(/does not admit the route transport/)
  })

  it("refuses to dispatch a route-only action through a Tool", async () => {
    const registry = createToolRegistry()
    registry.register(
      defineTool({
        capabilityId: CAPABILITY_ID,
        capabilityVersion: "v1",
        owner: "@voyant-travel/finance",
        name: "create_booking_self_service",
        description: "Route-only action wrongly exposed as a Tool",
        inputSchema: z.object({}),
        outputSchema: z.object({ ok: z.literal(true) }),
        requiredScopes: [],
        tier: "write",
        riskPolicy: {
          destructive: true,
          reversible: false,
          dryRunSupported: false,
          sideEffects: ["data-write"],
        },
        actionPolicyEnforcement: "handler",
        async handler() {
          throw new Error("route-only action must never reach a Tool handler")
        },
      }),
      { actionPolicy: routePolicy },
    )

    await expect(
      registry.dispatch("create_booking_self_service", {}, toolDispatchContext()),
    ).rejects.toMatchObject({ code: "ACTION_POLICY_REQUIRED" })
  })

  it("refuses a Tool-minted admission for a route-bound handler", async () => {
    const toolPolicy = { ...routePolicy, transport: "tool" as const, allowedActorTypes: ["staff"] }
    let admittedAtToolBoundary: unknown
    const registry = createToolRegistry()
    registry.register(
      defineTool({
        capabilityId: CAPABILITY_ID,
        capabilityVersion: "v1",
        owner: "@voyant-travel/finance",
        name: "create_booking_self_service",
        description: "Tool-bound sibling of the route action",
        inputSchema: z.object({}),
        outputSchema: z.object({ ok: z.literal(true) }),
        requiredScopes: [],
        tier: "write",
        riskPolicy: {
          destructive: true,
          reversible: false,
          dryRunSupported: false,
          sideEffects: ["data-write"],
        },
        actionPolicyEnforcement: "handler",
        async handler(_args, ctx) {
          admittedAtToolBoundary = ctx.handlerActionPolicy
          return { ok: true as const }
        },
      }),
      { actionPolicy: toolPolicy },
    )

    await registry.dispatch("create_booking_self_service", {}, {
      ...toolDispatchContext(),
      handlerActionPolicy: {
        capabilityId: CAPABILITY_ID,
        capabilityVersion: "v1",
        canonicalName: "create_booking_self_service",
        actionPolicy: { ...toolPolicy, enforcement: "handler", invocation },
        invocation: { idempotencyKey: "req_1" },
      },
    } satisfies ToolContext)

    // The Tool boundary minted it, so a handler that only serves the route
    // refuses it even though every other identity field matches.
    expect(() =>
      admitHandlerActionPolicy(
        context(admittedAtToolBoundary as never, "customer"),
        routeExpectation,
      ),
    ).toThrowError(expect.objectContaining({ code: "ACTION_POLICY_REQUIRED" }))
  })
})

function context(
  handlerActionPolicy: ToolContext["handlerActionPolicy"],
  actor: ToolContext["actor"] = "customer",
): ToolContext {
  return {
    db: {},
    actor,
    audience: actor,
    tenantId: "tenant_1",
    resolverScope: { locale: "en-GB", audience: actor, market: "default", actor },
    handlerActionPolicy,
  }
}

function toolDispatchContext(): ToolContext {
  return {
    db: {},
    actor: "staff",
    audience: "staff",
    tenantId: "tenant_1",
    resolverScope: { locale: "en-GB", audience: "staff", market: "default", actor: "staff" },
    handlerActionPolicy: {
      capabilityId: CAPABILITY_ID,
      capabilityVersion: "v1",
      canonicalName: "create_booking_self_service",
      actionPolicy: { ...routePolicy, enforcement: "handler", invocation },
      invocation: { idempotencyKey: "req_1" },
    },
  }
}
