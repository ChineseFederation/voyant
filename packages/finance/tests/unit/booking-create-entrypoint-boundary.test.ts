import { createToolRegistry, type ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"
import {
  executeFinanceSelfServiceBookingCreateCommand,
  executeFinanceStaffBookingCreateCommand,
} from "../../src/booking-create-command.js"
import {
  FINANCE_BOOKING_CREATE_HANDLER_POLICY,
  FINANCE_BOOKING_CREATE_SELF_SERVICE_ROUTE_ACTION,
} from "../../src/booking-create-policy.js"

/**
 * Both entrypoints compose the same durable command, so the only thing keeping
 * one from acting as the other is the static policy each pins. These assert
 * that boundary directly: each refuses the other's admission before it can
 * reach a database.
 */
describe("booking-create entrypoint boundary", () => {
  const command = {
    db: unusableDb(),
    context: { userId: "usr_1", organizationId: "org_1", actor: "staff" },
    commandInput: {} as never,
  }

  it("refuses a self-service admission at the staff entrypoint", async () => {
    await expect(
      executeFinanceStaffBookingCreateCommand({ ...command, admitted: selfServiceAdmission() }),
    ).rejects.toMatchObject({ code: "ACTION_POLICY_REQUIRED" })
  })

  it("refuses a staff-shaped admission at the self-service entrypoint", async () => {
    await expect(
      executeFinanceSelfServiceBookingCreateCommand({
        ...command,
        admitted: forgedStaffAdmission(),
        fallbackPrincipalId: "storefront-verification:svch_1",
      }),
    ).rejects.toMatchObject({ code: "ACTION_POLICY_REQUIRED" })
  })

  it("refuses an unminted structural clone at the self-service entrypoint", async () => {
    await expect(
      executeFinanceSelfServiceBookingCreateCommand({
        ...command,
        admitted: { ...selfServiceAdmission() },
        fallbackPrincipalId: "storefront-verification:svch_1",
      }),
    ).rejects.toMatchObject({ code: "ACTION_POLICY_REQUIRED" })
  })
})

/** An authentic route-minted self-service admission. */
function selfServiceAdmission(): ToolHandlerActionPolicyContext {
  const registry = createToolRegistry()
  registry.registerRouteAction(FINANCE_BOOKING_CREATE_SELF_SERVICE_ROUTE_ACTION)
  return registry.admitRouteAction(
    FINANCE_BOOKING_CREATE_SELF_SERVICE_ROUTE_ACTION.actionPolicy.id,
    { actor: "customer", invocation: { idempotencyKey: "req_1" } },
  )
}

/** Staff policy shape without registry provenance — must be rejected outright. */
function forgedStaffAdmission(): ToolHandlerActionPolicyContext {
  return {
    capabilityId: FINANCE_BOOKING_CREATE_HANDLER_POLICY.capabilityId,
    capabilityVersion: FINANCE_BOOKING_CREATE_HANDLER_POLICY.capabilityVersion,
    canonicalName: FINANCE_BOOKING_CREATE_HANDLER_POLICY.canonicalName,
    actionPolicy: {
      ...FINANCE_BOOKING_CREATE_HANDLER_POLICY.actionPolicy,
      enforcement: "handler",
      invocation: {
        controlField: "_voyant",
        requiredFields: ["idempotencyKey"],
        optionalFields: [],
        fingerprintAlgorithm: "action-ledger-command-v1",
      },
    },
    invocation: { idempotencyKey: "req_1" },
  }
}

/** Any database access means admission checking failed to fail closed. */
function unusableDb() {
  return new Proxy(
    {},
    {
      get() {
        throw new Error("admission must be rejected before any database access")
      },
    },
  ) as never
}
