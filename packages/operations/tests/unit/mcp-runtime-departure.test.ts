import type { ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import { afterEach, describe, expect, it, vi } from "vitest"

const executeAdmittedCreatedTargetCommand = vi.hoisted(() => vi.fn())

vi.mock("@voyant-travel/action-ledger/created-command", () => ({
  executeAdmittedCreatedTargetCommand,
}))

import { availabilityService } from "../../src/availability/service.js"
import { AvailabilitySlotRevisionConflictError } from "../../src/availability/service-core.js"
import { voyantToolContextContribution } from "../../src/mcp-runtime.js"
import { CREATE_DEPARTURE_HANDLER_POLICY, type OperationsToolServices } from "../../src/tools.js"

/**
 * `ToolContextContribution.contribute` is declared as `Record<string, unknown>`
 * so the tools package needs no dependency on its contributors. That erases the
 * shape every contributor actually returns, so the Operations runtime has to be
 * named here before the tests can exercise it.
 */
async function contributeOperations(
  vars: Record<string, unknown>,
  resources: Record<string, unknown> = {},
): Promise<OperationsToolServices> {
  const contribution = (await voyantToolContextContribution.contribute({
    request: {
      var: vars,
      get: (key: string) => vars[key],
      req: { header: () => null },
    } as never,
    context: { db: {} } as never,
    resources,
  })) as { operations?: OperationsToolServices }
  if (!contribution.operations) throw new Error("missing Operations runtime")
  return contribution.operations
}

afterEach(() => {
  vi.restoreAllMocks()
  executeAdmittedCreatedTargetCommand.mockReset()
})

describe("departure created-target runtime", () => {
  it("creates once, reloads an exact retry, and repairs projection events on replay", async () => {
    const departure = {
      id: "avsl_1",
      productId: "prod_1",
      optionId: null,
      startsAt: new Date("2026-10-12T06:30:00.000Z"),
      remainingPax: 20,
      unlimited: false,
    }
    const create = vi.spyOn(availabilityService, "createSlot").mockResolvedValue(departure as never)
    const reload = vi
      .spyOn(availabilityService, "getSlotById")
      .mockResolvedValue(departure as never)
    let targetId: string | undefined
    executeAdmittedCreatedTargetCommand.mockImplementation(async (_input, handlers) => {
      if (!targetId) {
        const mutation = await handlers.create({})
        targetId = mutation.targetId
        return { replayed: false, value: mutation.value }
      }
      return {
        replayed: true,
        value: await handlers.replay({}, { reference: { id: targetId } }),
      }
    })
    const emit = vi.fn().mockResolvedValue(undefined)
    const operations = await contributeOperations({
      actor: "staff",
      callerType: "agent",
      agentId: "agent_1",
      organizationId: "org_1",
      eventBus: { emit },
    })
    const input = {
      productId: "prod_1",
      dateLocal: "2026-10-12",
      startsAt: "2026-10-12T06:30:00.000Z",
      timezone: "Europe/Bucharest",
      status: "open" as const,
      unlimited: false,
      pastCutoff: false,
      tooEarly: false,
      idempotencyKey: "bucharest-2026-10-12-v1",
    }
    const admitted = {
      actionPolicy: CREATE_DEPARTURE_HANDLER_POLICY.actionPolicy,
      invocation: { idempotencyKey: input.idempotencyKey },
    } as unknown as ToolHandlerActionPolicyContext

    await expect(operations.createDeparture(input, admitted)).resolves.toMatchObject({
      replayed: false,
      departure: { id: "avsl_1" },
    })
    await expect(operations.createDeparture(input, admitted)).resolves.toMatchObject({
      replayed: true,
      departure: { id: "avsl_1" },
    })

    expect(create).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledTimes(2)
    expect(emit).toHaveBeenLastCalledWith(
      "availability.slot.changed",
      expect.objectContaining({ slotId: "avsl_1", productId: "prod_1" }),
      { category: "domain", source: "service" },
    )
  })

  it("returns a structured revision conflict with the current authoritative departure", async () => {
    const current = {
      id: "avsl_1",
      productId: "prod_1",
      status: "cancelled",
      initialPax: 10,
      startsAt: new Date("2026-10-12T06:30:00.000Z"),
      updatedAt: new Date("2026-07-28T13:00:00.000Z"),
      endDateLocal: null,
    }
    vi.spyOn(availabilityService, "updateSlot").mockRejectedValue(
      new AvailabilitySlotRevisionConflictError("2026-07-28T12:00:00.000Z", current as never),
    )
    const operations = await contributeOperations({
      actor: "staff",
      callerType: "agent",
      agentId: "agent_1",
      organizationId: "org_1",
    })

    await expect(
      operations.updateDeparture("avsl_1", {
        updatedAt: "2026-07-28T12:00:00.000Z",
        notes: "Stale edit",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      meta: {
        reason: "revision_conflict",
        expectedUpdatedAt: "2026-07-28T12:00:00.000Z",
        current: {
          id: "avsl_1",
          status: "cancelled",
          initialPax: 10,
          updatedAt: "2026-07-28T13:00:00.000Z",
        },
      },
    })
  })

  it("resolves all selected booking-action sources for a deterministic rebuild", async () => {
    const sourceA = { id: "catalog", sourceModule: "catalog", read: vi.fn() }
    const sourceB = { id: "finance", sourceModule: "finance", read: vi.fn() }
    const synchronize = vi.fn().mockResolvedValue({
      mode: "rebuild",
      providers: 2,
      projected: 4,
      unchanged: 3,
      invalidated: 0,
    })
    const operations = await contributeOperations(
      { actor: "staff" },
      {
        "bookings.booking-action-projection.runtime": {
          create: vi.fn(),
          synchronize,
        },
        "bookings.booking-action-source.runtime": [sourceA, sourceB],
      },
    )

    await expect(operations.rebuildBookingActions()).resolves.toMatchObject({
      mode: "rebuild",
      providers: 2,
    })
    expect(synchronize).toHaveBeenCalledWith([sourceA, sourceB], "rebuild")
  })
})
