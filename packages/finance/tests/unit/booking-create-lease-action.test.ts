import { createToolRegistry, type ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import { beforeEach, describe, expect, it, vi } from "vitest"

/** What each entrypoint asks the domain to settle under. */
const settleCalls: { actionName?: string }[] = []
/** The identity the action-ledger would mint the lease with. */
const mintedWith: { actionName?: string }[] = []

/**
 * Drive `handlers.create` directly instead of executing the durable command.
 * The real executor needs a live transaction and ledger tables; the thing under
 * test is only which action name the entrypoint hands to settlement, and
 * whether it matches the admitted policy the lease is minted from.
 */
vi.mock("@voyant-travel/action-ledger", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    async executeAdmittedCreatedTargetCommand(
      input: { admitted: { actionPolicy: { id: string } } },
      handlers: { create: (tx: unknown, lease: unknown) => Promise<unknown> },
    ) {
      mintedWith.push({ actionName: input.admitted.actionPolicy.id })
      // Everything after the settle — outbox, consumeSources — needs a real
      // database. The action name has already been captured by then, so let the
      // rest fall away rather than stubbing the whole booking graph.
      await handlers.create({}, {}).catch(() => undefined)
      return { replayed: false, value: { bookingId: "bkg_1" }, result: {} }
    },
  }
})

vi.mock("../../src/service-booking-create.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    createBookingMutation: async (
      _tx: unknown,
      _input: unknown,
      options: { actionName?: string },
    ) => {
      settleCalls.push({ actionName: options.actionName })
      return { status: "ok", result: { booking: { id: "bkg_1" } } }
    },
  }
})

const { executeFinanceSelfServiceBookingCreateCommand } = await import(
  "../../src/booking-create-command.js"
)
const {
  FINANCE_BOOKING_CREATE_ACTION,
  FINANCE_BOOKING_CREATE_SELF_SERVICE_ACTION,
  FINANCE_BOOKING_CREATE_SELF_SERVICE_ROUTE_ACTION,
} = await import("../../src/booking-create-policy.js")

/**
 * Every entrypoint composes the same durable command but admits a DIFFERENT
 * action, and settlement re-checks that name by identity. An entrypoint that
 * leaves it to the default settles against the staff action and fails closed
 * with `invalid_mutation_lease` — at the very last step of the create, after
 * the shopper has verified a contact, chosen a room and been quoted. The staff
 * path matches the default, so nothing surfaces it.
 *
 * voyant#3992 fixed exactly this for `book_product`. The self-service
 * entrypoint was missed, and every guest booking on protravel.ro failed.
 */
describe("booking-create lease action identity", () => {
  beforeEach(() => {
    settleCalls.length = 0
    mintedWith.length = 0
  })

  it("settles self-service under the action it admitted, not the staff default", async () => {
    await executeFinanceSelfServiceBookingCreateCommand({
      db: {} as never,
      context: { actor: "customer", callerType: "session" },
      commandInput: {} as never,
      admitted: selfServiceAdmission(),
      fallbackPrincipalId: "storefront-verification:svch_1",
    } as never)

    expect(settleCalls).toHaveLength(1)
    expect(settleCalls[0]?.actionName).toBe(FINANCE_BOOKING_CREATE_SELF_SERVICE_ACTION)
    expect(settleCalls[0]?.actionName).not.toBe(FINANCE_BOOKING_CREATE_ACTION)
    // The invariant, stated directly: settlement expects the action the ledger
    // minted the lease with. Any entrypoint that breaks this fails closed.
    expect(settleCalls[0]?.actionName).toBe(mintedWith[0]?.actionName)
  })
})

function selfServiceAdmission(): ToolHandlerActionPolicyContext {
  const registry = createToolRegistry()
  registry.registerRouteAction(FINANCE_BOOKING_CREATE_SELF_SERVICE_ROUTE_ACTION)
  return registry.admitRouteAction(
    FINANCE_BOOKING_CREATE_SELF_SERVICE_ROUTE_ACTION.actionPolicy.id,
    {
      actor: "customer",
      invocation: { idempotencyKey: "req_1" },
    },
  )
}
