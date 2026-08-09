import type { ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import { afterEach, describe, expect, it, vi } from "vitest"

const executeAdmittedCreatedTargetCommand = vi.hoisted(() => vi.fn())
const executeAdmittedExistingTargetCommand = vi.hoisted(() => vi.fn())

vi.mock("@voyant-travel/action-ledger", () => ({
  executeAdmittedExistingTargetCommand,
}))

vi.mock("@voyant-travel/action-ledger/created-command", () => ({
  executeAdmittedCreatedTargetCommand,
}))

import { availabilityService } from "../../src/availability/service.js"
import * as assignments from "../../src/availability/service-allocation-assignment-batch.js"
import * as allocationAudit from "../../src/availability/service-allocation-audit.js"
import * as resourceLinks from "../../src/availability/service-allocation-resource-link.js"
import * as roomBlocks from "../../src/availability/service-allocation-room-block.js"
import * as travelerPreferences from "../../src/availability/service-allocation-traveler-preferences.js"
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
  executeAdmittedExistingTargetCommand.mockReset()
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
    executeAdmittedExistingTargetCommand.mockImplementation(async (_input, handlers) => {
      await handlers.prepare({})
      return { replayed: false, value: await handlers.execute() }
    })

    await expect(
      operations.updateDeparture(
        "avsl_1",
        {
          updatedAt: "2026-07-28T12:00:00.000Z",
          notes: "Stale edit",
        },
        {} as ToolHandlerActionPolicyContext,
      ),
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

  it("updates once and reloads the authoritative departure on an exact approved retry", async () => {
    const first = { id: "avsl_1", status: "closed", notes: "Weather" }
    const current = { ...first, notes: "Weather confirmed" }
    const update = vi.spyOn(availabilityService, "updateSlot").mockResolvedValue(first as never)
    const reload = vi.spyOn(availabilityService, "getSlotById").mockResolvedValue(current as never)
    let completed = false
    executeAdmittedExistingTargetCommand.mockImplementation(async (_input, handlers) => {
      if (!completed) {
        await handlers.prepare({})
        completed = true
        return { replayed: false, value: await handlers.execute() }
      }
      return { replayed: true, value: await handlers.replay({}) }
    })
    const operations = await contributeOperations({ actor: "staff", organizationId: "org_1" })
    const admitted = {} as ToolHandlerActionPolicyContext

    await expect(
      operations.updateDeparture("avsl_1", { status: "closed" }, admitted),
    ).resolves.toEqual(first)
    await expect(
      operations.updateDeparture("avsl_1", { status: "closed" }, admitted),
    ).resolves.toEqual(current)

    expect(update).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("attaches once and reloads the authoritative fleet link on an exact approved retry", async () => {
    const resource = {
      id: "alrs_1",
      slotId: "avsl_1",
      kind: "vehicle",
      refType: "resource",
      refId: "res_1",
      capacity: 40,
      flags: { resourceAssignmentId: "resa_1" },
    }
    const attach = vi.spyOn(resourceLinks, "attachDepartureResource").mockResolvedValue({
      resource,
      assignmentId: "resa_1",
      created: true,
    } as never)
    const list = vi
      .spyOn(resourceLinks, "listDepartureResourceLinks")
      .mockResolvedValue([resource] as never)
    let completed = false
    executeAdmittedExistingTargetCommand.mockImplementation(async (_input, handlers) => {
      if (!completed) {
        await handlers.prepare({})
        completed = true
        return { replayed: false, value: await handlers.execute() }
      }
      return { replayed: true, value: await handlers.replay() }
    })
    const operations = await contributeOperations({
      actor: "staff",
      organizationId: "org_1",
      userId: "user_1",
    })
    const admitted = {} as ToolHandlerActionPolicyContext

    await expect(
      operations.attachDepartureFleetResource(
        "avsl_1",
        { resourceId: "res_1", flags: {}, sortOrder: 0 },
        admitted,
      ),
    ).resolves.toMatchObject({ created: true, assignmentId: "resa_1" })
    await expect(
      operations.attachDepartureFleetResource(
        "avsl_1",
        { resourceId: "res_1", flags: {}, sortOrder: 0 },
        admitted,
      ),
    ).resolves.toMatchObject({ created: false, assignmentId: "resa_1" })

    expect(attach).toHaveBeenCalledTimes(1)
    expect(list).toHaveBeenCalledTimes(1)
  })

  it("updates rooming preferences once and reloads them on an exact approved retry", async () => {
    const update = vi
      .spyOn(travelerPreferences, "updateTravelerRoomingPreferences")
      .mockResolvedValue({
        travelerId: "trav_1",
        bedPreference: "twin",
        roomTypeId: null,
      })
    const reload = vi
      .spyOn(travelerPreferences, "getTravelerRoomingPreferences")
      .mockResolvedValue({
        travelerId: "trav_1",
        bedPreference: "double",
        roomTypeId: null,
      })
    let completed = false
    executeAdmittedExistingTargetCommand.mockImplementation(async (_input, handlers) => {
      if (!completed) {
        await handlers.prepare({})
        completed = true
        return { replayed: false, value: await handlers.execute() }
      }
      return { replayed: true, value: await handlers.replay() }
    })
    const operations = await contributeOperations({ actor: "staff", organizationId: "org_1" })
    const admitted = {} as ToolHandlerActionPolicyContext

    await expect(
      operations.setDepartureTravelerRoomingPreferences(
        "avsl_1",
        "trav_1",
        { bedPreference: "twin" },
        admitted,
      ),
    ).resolves.toMatchObject({ bedPreference: "twin" })
    await expect(
      operations.setDepartureTravelerRoomingPreferences(
        "avsl_1",
        "trav_1",
        { bedPreference: "twin" },
        admitted,
      ),
    ).resolves.toMatchObject({ bedPreference: "double" })

    expect(update).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("assigns travelers once and reloads their authoritative allocations on retry", async () => {
    const outcome = {
      kind: "room",
      assigned: 1,
      unassigned: 0,
      unchanged: 0,
      travelerIds: ["trav_1"],
      violations: [],
    }
    const assign = vi
      .spyOn(assignments, "assignTravelerAllocationsBatch")
      .mockResolvedValue(outcome)
    const reload = vi
      .spyOn(assignments, "getTravelerAllocationsBatchResult")
      .mockResolvedValue({ ...outcome, unchanged: 1 })
    let completed = false
    executeAdmittedExistingTargetCommand.mockImplementation(async (_input, handlers) => {
      if (!completed) {
        await handlers.prepare({})
        completed = true
        return { replayed: false, value: await handlers.execute() }
      }
      return { replayed: true, value: await handlers.replay() }
    })
    const operations = await contributeOperations({ actor: "staff", organizationId: "org_1" })
    const admitted = {} as ToolHandlerActionPolicyContext
    const input = {
      kind: "room",
      assignments: [{ travelerId: "trav_1", resourceId: "room_1" }],
    }

    await expect(
      operations.setDepartureTravelerAssignments("avsl_1", input, admitted),
    ).resolves.toMatchObject({ unchanged: 0 })
    await expect(
      operations.setDepartureTravelerAssignments("avsl_1", input, admitted),
    ).resolves.toMatchObject({ unchanged: 1 })

    expect(assign).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("materializes rooms once and reloads the authoritative block resources on retry", async () => {
    const outcome = {
      blockId: "block_1",
      kind: "room",
      created: 2,
      skippedExisting: 0,
      roomsPickedUp: 2,
      pickupId: "pickup_1",
      remainingAfter: 3,
      resources: [],
    }
    const materialize = vi
      .spyOn(roomBlocks, "materializeDepartureRoomsFromBlock")
      .mockResolvedValue(outcome)
    const reload = vi
      .spyOn(roomBlocks, "getDepartureRoomBlockMaterializationResult")
      .mockResolvedValue({ ...outcome, created: 0, skippedExisting: 2, roomsPickedUp: 0 })
    let completed = false
    executeAdmittedExistingTargetCommand.mockImplementation(async (_input, handlers) => {
      if (!completed) {
        await handlers.prepare({})
        completed = true
        return { replayed: false, value: await handlers.execute() }
      }
      return { replayed: true, value: await handlers.replay() }
    })
    const operations = await contributeOperations({ actor: "staff", organizationId: "org_1" })
    const admitted = {} as ToolHandlerActionPolicyContext
    const input = { blockId: "block_1", kind: "room", namePattern: "Room {sequence}" }

    await expect(
      operations.materializeDepartureRoomBlock("avsl_1", input, admitted),
    ).resolves.toMatchObject({ created: 2, roomsPickedUp: 2 })
    await expect(
      operations.materializeDepartureRoomBlock("avsl_1", input, admitted),
    ).resolves.toMatchObject({ created: 0, skippedExisting: 2 })

    expect(materialize).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("detaches once and reloads the deletion outcome from its command audit", async () => {
    const outcome = { removedResourceIds: ["seat_1", "coach_1"], assignmentId: "assign_1" }
    const detach = vi.spyOn(resourceLinks, "detachDepartureResource").mockResolvedValue(outcome)
    const audit = vi
      .spyOn(allocationAudit, "findAllocationAuditByCommandClaim")
      .mockResolvedValue(outcome)
    const command = { causation: { claimActionId: "act_claim_1" } }
    let completed = false
    executeAdmittedExistingTargetCommand.mockImplementation(async (_input, handlers) => {
      if (!completed) {
        await handlers.prepare({}, command)
        completed = true
        return { replayed: false, value: await handlers.execute(command) }
      }
      return { replayed: true, value: await handlers.replay(command) }
    })
    const operations = await contributeOperations({ actor: "staff", organizationId: "org_1" })
    const admitted = {} as ToolHandlerActionPolicyContext

    await expect(
      operations.detachDepartureFleetResource("avsl_1", "res_1", { cascade: true }, admitted),
    ).resolves.toEqual(outcome)
    await expect(
      operations.detachDepartureFleetResource("avsl_1", "res_1", { cascade: true }, admitted),
    ).resolves.toEqual(outcome)

    expect(detach).toHaveBeenCalledTimes(1)
    expect(audit).toHaveBeenCalledWith(expect.anything(), {
      slotId: "avsl_1",
      action: "resource.detach",
      commandClaimActionId: "act_claim_1",
    })
  })

  it("releases a room block once and reloads the deletion outcome from its command audit", async () => {
    const outcome = { blockId: "block_1", kind: "room", removed: 2, roomsReleased: 2 }
    const release = vi.spyOn(roomBlocks, "releaseDepartureRoomBlock").mockResolvedValue(outcome)
    const audit = vi
      .spyOn(allocationAudit, "findAllocationAuditByCommandClaim")
      .mockResolvedValue({ removed: 2, roomsReleased: 2 })
    const command = { causation: { claimActionId: "act_claim_2" } }
    let completed = false
    executeAdmittedExistingTargetCommand.mockImplementation(async (_input, handlers) => {
      if (!completed) {
        await handlers.prepare({}, command)
        completed = true
        return { replayed: false, value: await handlers.execute(command) }
      }
      return { replayed: true, value: await handlers.replay(command) }
    })
    const operations = await contributeOperations({ actor: "staff", organizationId: "org_1" })
    const admitted = {} as ToolHandlerActionPolicyContext

    await expect(
      operations.releaseDepartureRoomBlock("avsl_1", "block_1", { kind: "room" }, admitted),
    ).resolves.toEqual(outcome)
    await expect(
      operations.releaseDepartureRoomBlock("avsl_1", "block_1", { kind: "room" }, admitted),
    ).resolves.toEqual(outcome)

    expect(release).toHaveBeenCalledTimes(1)
    expect(audit).toHaveBeenCalledWith(expect.anything(), {
      slotId: "avsl_1",
      action: "resources.release.room-block",
      commandClaimActionId: "act_claim_2",
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
