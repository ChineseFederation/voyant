import { beforeAll, describe, expect, it, vi } from "vitest"

import {
  assertAuthenticHandlerActionPolicyContext,
  assertSingleToolsPackageInstance,
  createToolRegistry,
  isToolError,
  isToolsPackageDuplicated,
  loadedToolsPackageInstanceCount,
  type RouteActionBinding,
  TOOLS_PACKAGE_INSTANCE,
  type ToolActionPolicyBinding,
  ToolError,
  type ToolHandlerActionPolicyContext,
  toToolError,
} from "../src/index.js"

const ACTION_ID = "@voyant-travel/finance#bookings-create-extension.action.create-booking-self"
const CAPABILITY_ID = "@voyant-travel/finance#bookings-create-extension.route.create-booking-self"
const CANONICAL_NAME = "create_booking_self_service"

const invocation = {
  controlField: "_voyant",
  requiredFields: ["idempotencyKey"],
  optionalFields: [],
  fingerprintAlgorithm: "action-ledger-command-v1",
} as const

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
  canonicalName: CANONICAL_NAME,
  actionPolicy: routePolicy,
  invocation,
}

const identity = { capabilityId: CAPABILITY_ID, canonicalName: CANONICAL_NAME }

function mintHere(): ToolHandlerActionPolicyContext {
  const registry = createToolRegistry()
  registry.registerRouteAction(routeBinding)
  return registry.admitRouteAction(ACTION_ID, {
    actor: "customer",
    invocation: { idempotencyKey: "req_1" },
  })
}

function thrownBy(admitted: unknown, hint?: typeof identity): ToolError {
  try {
    assertAuthenticHandlerActionPolicyContext(admitted, hint)
  } catch (err) {
    return err as ToolError
  }
  throw new Error("expected the authenticity assertion to throw")
}

describe("handler admission authenticity diagnostics", () => {
  it("names the action and the reason when no admission was supplied", () => {
    const err = thrownBy(undefined, identity)

    expect(err.code).toBe("ACTION_POLICY_REQUIRED")
    expect(err.message).toContain(CANONICAL_NAME)
    expect(err.meta).toMatchObject({
      reason: "admission-absent",
      capabilityId: CAPABILITY_ID,
      canonicalName: CANONICAL_NAME,
      assertedBy: TOOLS_PACKAGE_INSTANCE,
    })
  })

  it("distinguishes a structural lookalike from a missing admission", () => {
    const err = thrownBy({ ...mintHere() }, identity)

    expect(err.meta).toMatchObject({
      reason: "admission-not-minted",
      capabilityId: CAPABILITY_ID,
      // The clone's own claim, reported separately from the pinned expectation.
      claimedCapabilityId: CAPABILITY_ID,
      claimedActionId: ACTION_ID,
    })
  })

  it("still reports the claimed identity when the caller pins no expectation", () => {
    const err = thrownBy({ ...mintHere() })

    expect(err.message).toContain(CAPABILITY_ID)
    expect(err.meta).toMatchObject({ reason: "admission-not-minted" })
    expect(err.meta).not.toHaveProperty("capabilityId")
  })

  it("accepts an admission minted by this copy of the package", () => {
    expect(() => assertAuthenticHandlerActionPolicyContext(mintHere(), identity)).not.toThrow()
  })
})

describe("duplicate package instances", () => {
  /** A second, independently evaluated copy of this package. */
  let second: typeof import("../src/index.js")

  beforeAll(async () => {
    vi.resetModules()
    second = await import("../src/index.js")
    vi.resetModules()
  })

  it("gives each loaded copy a distinct identity", () => {
    expect(second.TOOLS_PACKAGE_INSTANCE.instance).not.toBe(TOOLS_PACKAGE_INSTANCE.instance)
    expect(loadedToolsPackageInstanceCount()).toBeGreaterThan(1)
    expect(isToolsPackageDuplicated()).toBe(true)
  })

  it("reports a cross-copy admission as a packaging fault, not a forgery", () => {
    const registry = second.createToolRegistry()
    registry.registerRouteAction(routeBinding as never)
    const foreign = registry.admitRouteAction(ACTION_ID, {
      actor: "customer",
      invocation: { idempotencyKey: "req_1" },
    })

    // Authentic to the copy that minted it...
    expect(() => second.assertAuthenticHandlerActionPolicyContext(foreign, identity)).not.toThrow()

    // ...and refused by this copy, but named for what it is.
    const err = thrownBy(foreign, identity)
    expect(err.meta).toMatchObject({
      reason: "admission-minted-by-another-package-instance",
      mintedBy: second.TOOLS_PACKAGE_INSTANCE,
      assertedBy: TOOLS_PACKAGE_INSTANCE,
    })
    expect(err.message).toContain("packaging fault")
    expect(err.nextSteps.join(" ")).toContain("Deduplicate the install")
  })

  it("keeps the mint brand off the admission's enumerable shape", () => {
    const admitted = mintHere()

    expect(Object.keys(admitted)).not.toContain("package")
    expect(JSON.parse(JSON.stringify(admitted))).toEqual({
      capabilityId: CAPABILITY_ID,
      capabilityVersion: "v1",
      canonicalName: CANONICAL_NAME,
      actionPolicy: { ...routePolicy, enforcement: "handler", invocation },
      invocation: { idempotencyKey: "req_1" },
      transport: "route",
    })
  })

  it("reports the duplicate once, at registry construction", async () => {
    vi.resetModules()
    const third = await import("../src/index.js")
    vi.resetModules()
    const reported = vi.spyOn(console, "error").mockImplementation(() => {})

    third.createToolRegistry()
    third.createToolRegistry()

    expect(reported).toHaveBeenCalledTimes(1)
    expect(reported.mock.calls[0]?.[0]).toContain("copies of this package are loaded")
    reported.mockRestore()
  })

  it("fails loudly when a deployment asserts a single instance", () => {
    expect(() => assertSingleToolsPackageInstance()).toThrowError(/copies of @voyant-travel\/tools/)
  })
})

describe("cross-copy ToolError recognition", () => {
  it("recognises and preserves a ToolError raised by another copy", async () => {
    vi.resetModules()
    const second = await import("../src/index.js")
    vi.resetModules()

    const foreign = new second.ToolError("Approval is required.", "APPROVAL_REQUIRED", {
      actionId: ACTION_ID,
    })

    expect(foreign instanceof ToolError).toBe(false)
    expect(isToolError(foreign)).toBe(true)

    const normalized = toToolError(foreign)
    expect(normalized).toBeInstanceOf(ToolError)
    expect(normalized.code).toBe("APPROVAL_REQUIRED")
    expect(normalized.message).toBe("Approval is required.")
    expect(normalized.meta).toEqual({ actionId: ACTION_ID })
    expect(normalized.nextSteps).toEqual(foreign.nextSteps)
  })

  it("maps an unrecognised throw to the terminal provider default", () => {
    const normalized = toToolError(new Error("boom"))

    expect(normalized.code).toBe("PROVIDER_ERROR")
    expect(normalized.retryable).toBe(false)
  })
})
