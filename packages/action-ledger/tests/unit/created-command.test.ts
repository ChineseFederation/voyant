import type { AnyDrizzleDb } from "@voyant-travel/db"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  ActionLedgerCreatedCommandApprovalError,
  ActionLedgerCreatedCommandFingerprintMismatchError,
  ActionLedgerCreatedCommandProtocolError,
  ActionLedgerCreatedCommandReplayCorruptError,
  ActionLedgerCreatedCommandReplayIncompleteError,
  ActionLedgerCreatedCommandTransactionRequiredError,
  buildCreatedTargetCommandFingerprint,
  buildCreatedTargetIdempotencyScope,
  buildExistingTargetIdempotencyScope,
  type ExecuteAdmittedExistingTargetCommandInput,
  type ExecuteCreatedTargetCommandInput,
  executeAdmittedCreatedTargetCommand,
  executeAdmittedExistingTargetCommand,
  executeCreatedTargetCommand,
} from "../../src/created-command-internal.js"
import { buildActionApprovalCommandFingerprint } from "../../src/fingerprint.js"
import type {
  ActionLedgerEntry,
  ActionMutationDetail,
  NewActionLedgerEntry,
  NewActionMutationDetail,
} from "../../src/schema.js"
import { actionLedgerEntries, actionMutationDetails } from "../../src/schema.js"
import { ActionLedgerIdempotencyConflictError, actionLedgerService } from "../../src/service.js"
import { makeApproval, makeEntry, makeMutationDetail } from "./service-fixtures.js"

afterEach(() => vi.restoreAllMocks())

const POLICY_DRIFTS: Array<[string, Partial<ExecuteCreatedTargetCommandInput>]> = [
  ["capability", { capabilityId: "relationships:person:create:v2" }],
  ["capability version", { capabilityVersion: "v2" }],
  ["risk", { evaluatedRisk: "critical" }],
  ["approval", { approvalPolicy: "conditional" }],
  ["reason", { approvalReasonCode: "different_reason" }],
  ["canonical target", { canonicalTargetType: "relationship-organization" }],
  ["reference type", { resultReferenceType: "wrong-ref" }],
  [
    "parent anchor",
    { parentAnchor: { targetType: "organization", targetIdField: "organizationId" } },
  ],
]

describe("existing-target durable command protocol", () => {
  it("commits exact admission before dispatch and routes same-command retries to replay", async () => {
    const harness = makeCreatedCommandDb()
    const admitted = makeAdmittedExistingTargetContext()
    const scope = await buildExistingTargetIdempotencyScope({
      actionName: admitted.actionPolicy.capabilityId,
      actionVersion: admitted.actionPolicy.version,
      principalType: "user",
      principalId: "usr_1",
      organizationId: "org_1",
    })
    ;(harness.db as AnyDrizzleDb & { __claimScope?: string }).__claimScope =
      `${scope}:existing-command-claim`
    const execute = vi.fn(async (command) => {
      harness.events.push("domain-execute")
      return { claimId: command.causation.claimActionId }
    })
    const replay = vi.fn(async (command) => {
      harness.events.push("domain-replay")
      return { claimId: command.causation.claimActionId }
    })
    const prepare = vi.fn(async (tx, command, payload) => {
      expect(Object.isFrozen(command)).toBe(true)
      expect(Object.isFrozen(payload)).toBe(true)
      ;(tx as AnyDrizzleDb & { __intents: string[] }).__intents.push(
        `${command.causation.claimActionId}:${payload.currency}`,
      )
      harness.events.push("domain-prepare")
    })
    const run = () =>
      executeAdmittedExistingTargetCommand(existingCommandInput(harness.db, admitted), {
        prepare,
        execute,
        replay,
      })

    const first = await run()
    const second = await run()

    expect(first).toMatchObject({
      replayed: false,
      command: {
        target: { type: "trip", id: "trip_1" },
        idempotency: { key: "price_1" },
        authorization: {
          principalType: "user",
          principalId: "usr_1",
          organizationId: "org_1",
        },
        causation: {
          claimActionId: "alge_1",
          requestedActionId: null,
          approvalId: null,
        },
      },
    })
    expect(second).toMatchObject({
      replayed: true,
      value: { claimId: "alge_1" },
    })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(replay).toHaveBeenCalledTimes(1)
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(harness.intents).toEqual(["alge_1:EUR"])
    expect(harness.events).toEqual([
      "begin",
      "advisory-lock",
      "entry:alge_1:requested",
      "detail:alge_1",
      "domain-prepare",
      "commit",
      "domain-execute",
      "begin",
      "advisory-lock",
      "commit",
      "domain-replay",
    ])
    expect(execute.mock.calls[0]?.[0]).not.toHaveProperty("context")
    expect(execute.mock.calls[0]?.[0]).not.toHaveProperty("sessionId")
  })

  it.each([
    ["payload", { commandInput: { tripId: "trip_1", currency: "USD" } }],
    ["target", { commandInput: { tripId: "trip_2", currency: "EUR" } }],
  ])("conflicts when an admitted key is reused with altered %s", async (_label, patch) => {
    const harness = makeCreatedCommandDb()
    const admitted = makeAdmittedExistingTargetContext()
    const scope = await buildExistingTargetIdempotencyScope({
      actionName: admitted.actionPolicy.capabilityId,
      actionVersion: admitted.actionPolicy.version,
      principalType: "user",
      principalId: "usr_1",
      organizationId: "org_1",
    })
    ;(harness.db as AnyDrizzleDb & { __claimScope?: string }).__claimScope =
      `${scope}:existing-command-claim`
    const handlers = {
      prepare: vi.fn(async () => {}),
      execute: vi.fn(async () => ({ ok: true })),
      replay: vi.fn(),
    }
    await executeAdmittedExistingTargetCommand(existingCommandInput(harness.db, admitted), handlers)

    await expect(
      executeAdmittedExistingTargetCommand(
        { ...existingCommandInput(harness.db, admitted), ...patch },
        handlers,
      ),
    ).rejects.toBeInstanceOf(ActionLedgerIdempotencyConflictError)
    expect(handlers.execute).toHaveBeenCalledTimes(1)
    expect(handlers.replay).not.toHaveBeenCalled()
  })

  it("rejects missing protocol metadata and mismatched stable target before claiming", async () => {
    const harness = makeCreatedCommandDb()
    const admitted = makeAdmittedExistingTargetContext()
    const handlers = { prepare: vi.fn(), execute: vi.fn(), replay: vi.fn() }

    await expect(
      executeAdmittedExistingTargetCommand(
        {
          ...existingCommandInput(harness.db, {
            ...admitted,
            actionPolicy: { ...admitted.actionPolicy, existingTarget: undefined },
          }),
        },
        handlers,
      ),
    ).rejects.toMatchObject({ reason: "admitted_policy_mismatch" })
    await expect(
      executeAdmittedExistingTargetCommand(
        { ...existingCommandInput(harness.db, admitted), targetId: "trip_other" },
        handlers,
      ),
    ).rejects.toMatchObject({ reason: "admitted_policy_mismatch" })
    expect(harness.events).toEqual([])
  })

  it("clones and recursively freezes a nested JSON command payload", async () => {
    const harness = makeCreatedCommandDb()
    const admitted = makeAdmittedExistingTargetContext()
    await configureExistingClaimLookup(harness.db, admitted)
    const commandInput = {
      tripId: "trip_1",
      currency: "EUR",
      pricing: {
        mode: "retail",
        legs: [{ origin: "OTP", destination: "LHR" }],
      },
    }
    let preparedPayload: Readonly<typeof commandInput> | undefined

    await executeAdmittedExistingTargetCommand(
      { ...existingCommandInput(harness.db, admitted), commandInput },
      {
        async prepare(_tx, _command, payload) {
          preparedPayload = payload
          expect(payload).not.toBe(commandInput)
          expect(Object.isFrozen(payload)).toBe(true)
          expect(Object.isFrozen(payload.pricing)).toBe(true)
          expect(Object.isFrozen(payload.pricing.legs)).toBe(true)
          expect(Object.isFrozen(payload.pricing.legs[0])).toBe(true)
          expect(() => {
            ;(payload.pricing as { mode: string }).mode = "wholesale"
          }).toThrow(TypeError)
          expect(() => {
            ;(payload.pricing.legs as Array<{ origin: string }>).push({ origin: "CDG" })
          }).toThrow(TypeError)
        },
        async execute() {
          return { ok: true }
        },
        async replay() {
          return { ok: true }
        },
      },
    )

    commandInput.pricing.mode = "wholesale"
    commandInput.pricing.legs[0]!.origin = "CDG"
    expect(preparedPayload?.pricing).toEqual({
      mode: "retail",
      legs: [{ origin: "OTP", destination: "LHR" }],
    })
  })

  it("normalizes negative zero so fingerprint-equivalent retries cannot reach handlers differently", async () => {
    const harness = makeCreatedCommandDb()
    const admitted = makeAdmittedExistingTargetContext()
    await configureExistingClaimLookup(harness.db, admitted)
    const negativeZeroInput = { tripId: "trip_1", currency: "EUR", adjustment: -0 }
    const zeroInput = { tripId: "trip_1", currency: "EUR", adjustment: 0 }
    const fingerprintInput = {
      actionName: admitted.actionPolicy.capabilityId,
      actionVersion: admitted.actionPolicy.version,
      targetType: "trip",
      targetId: "trip_1",
      approvalPolicy: "none" as const,
      capabilityId: admitted.actionPolicy.capabilityId,
      capabilityVersion: admitted.actionPolicy.version,
      evaluatedRisk: "high" as const,
      reasonCode: null,
    }
    const [negativeZeroFingerprint, zeroFingerprint] = await Promise.all([
      buildActionApprovalCommandFingerprint({
        ...fingerprintInput,
        commandInput: negativeZeroInput,
      }),
      buildActionApprovalCommandFingerprint({ ...fingerprintInput, commandInput: zeroInput }),
    ])
    expect(negativeZeroFingerprint).toBe(zeroFingerprint)
    const observedAdjustments: number[] = []
    const handlers = {
      prepare: vi.fn(async () => {}),
      execute: vi.fn(async (_command, payload) => {
        observedAdjustments.push(payload.adjustment)
        return { path: "execute" }
      }),
      replay: vi.fn(async (_command, payload) => {
        observedAdjustments.push(payload.adjustment)
        return { path: "replay" }
      }),
    }

    await expect(
      executeAdmittedExistingTargetCommand(
        { ...existingCommandInput(harness.db, admitted), commandInput: negativeZeroInput },
        handlers,
      ),
    ).resolves.toMatchObject({ replayed: false })
    await expect(
      executeAdmittedExistingTargetCommand(
        { ...existingCommandInput(harness.db, admitted), commandInput: zeroInput },
        handlers,
      ),
    ).resolves.toMatchObject({ replayed: true })

    expect(observedAdjustments).toEqual([0, 0])
    expect(observedAdjustments.some((value) => Object.is(value, -0))).toBe(false)
    expect(handlers.execute).toHaveBeenCalledTimes(1)
    expect(handlers.replay).toHaveBeenCalledTimes(1)
  })

  it("uses one sanitized payload snapshot for target, fingerprint, claim, and handlers", async () => {
    const harness = makeCreatedCommandDb()
    const admitted = makeAdmittedExistingTargetContext()
    await configureExistingClaimLookup(harness.db, admitted)
    const descriptorReads = { tripId: 0, currency: 0 }
    const unstableInput = new Proxy(
      { tripId: "ignored", currency: "ignored" },
      {
        getOwnPropertyDescriptor(_target, property) {
          if (property === "tripId") {
            descriptorReads.tripId += 1
            return {
              configurable: true,
              enumerable: true,
              writable: true,
              value: descriptorReads.tripId === 1 ? "trip_1" : "trip_changed",
            }
          }
          if (property === "currency") {
            descriptorReads.currency += 1
            return {
              configurable: true,
              enumerable: true,
              writable: true,
              value: descriptorReads.currency === 1 ? "EUR" : "USD",
            }
          }
          return undefined
        },
      },
    )
    const prepare = vi.fn(async (_tx, command, payload) => {
      expect(command.target.id).toBe("trip_1")
      expect(payload).toEqual({ currency: "EUR", tripId: "trip_1" })
    })
    const execute = vi.fn(async (command, payload) => ({
      targetId: command.target.id,
      currency: payload.currency,
    }))

    await expect(
      executeAdmittedExistingTargetCommand(
        {
          ...existingCommandInput(harness.db, admitted),
          commandInput: unstableInput,
        },
        { prepare, execute, replay: vi.fn() },
      ),
    ).resolves.toMatchObject({
      replayed: false,
      value: { targetId: "trip_1", currency: "EUR" },
    })
    expect(descriptorReads).toEqual({ tripId: 1, currency: 1 })
  })

  it.each([
    ["Date (which canonicalizes like an empty record)", new Date("2026-07-24T00:00:00.000Z")],
    ["Map (which canonicalizes like an empty record)", new Map([["currency", "EUR"]])],
    ["Set (which canonicalizes like an empty record)", new Set(["EUR"])],
    ["undefined (which canonicalizes like null)", undefined],
    ["a function", () => "EUR"],
    ["a bigint", 1n],
    ["NaN (which JSON serializes like null)", Number.NaN],
    ["infinity (which JSON serializes like null)", Number.POSITIVE_INFINITY],
    ["a sparse array (whose hole JSON serializes like null)", Array(1)],
  ])("rejects non-JSON command payload value %s before claiming", async (_label, invalid) => {
    const harness = makeCreatedCommandDb()
    const admitted = makeAdmittedExistingTargetContext()
    const handlers = { prepare: vi.fn(), execute: vi.fn(), replay: vi.fn() }

    await expect(
      executeAdmittedExistingTargetCommand(
        {
          ...existingCommandInput(harness.db, admitted),
          commandInput: { tripId: "trip_1", currency: "EUR", invalid } as never,
        },
        handlers,
      ),
    ).rejects.toMatchObject({
      name: ActionLedgerCreatedCommandProtocolError.name,
      reason: "invalid_command_payload",
    })
    expect(harness.events).toEqual([])
    expect(handlers.prepare).not.toHaveBeenCalled()
  })

  it("rejects cyclic and accessor-bearing command payloads before fingerprinting", async () => {
    const harness = makeCreatedCommandDb()
    const admitted = makeAdmittedExistingTargetContext()
    const handlers = { prepare: vi.fn(), execute: vi.fn(), replay: vi.fn() }
    const cyclic: Record<string, unknown> = { tripId: "trip_1", currency: "EUR" }
    cyclic.self = cyclic
    const accessor = { tripId: "trip_1", currency: "EUR" } as Record<string, unknown>
    Object.defineProperty(accessor, "computed", {
      enumerable: true,
      get: () => "ambiguous",
    })
    const decoratedArray = ["EUR"] as string[] & { ignored?: string }
    decoratedArray.ignored = "fingerprint-would-ignore-this"
    const symbolRecord = { tripId: "trip_1", currency: "EUR" } as Record<string | symbol, unknown>
    symbolRecord[Symbol("ignored")] = "fingerprint-would-ignore-this"
    const customPrototype = Object.assign(Object.create({ inherited: true }), {
      tripId: "trip_1",
      currency: "EUR",
    })

    for (const commandInput of [cyclic, accessor, decoratedArray, symbolRecord, customPrototype]) {
      await expect(
        executeAdmittedExistingTargetCommand(
          { ...existingCommandInput(harness.db, admitted), commandInput: commandInput as never },
          handlers,
        ),
      ).rejects.toMatchObject({ reason: "invalid_command_payload" })
    }
    expect(harness.events).toEqual([])
    expect(handlers.prepare).not.toHaveBeenCalled()
  })

  it("binds required approval to the exact target, key, fingerprint, and causation", async () => {
    const harness = makeCreatedCommandDb()
    const commandInput = { tripId: "trip_1", currency: "EUR" }
    const admitted = makeAdmittedExistingTargetContext({ approval: "required" })
    const fingerprint = await buildActionApprovalCommandFingerprint({
      actionName: admitted.actionPolicy.capabilityId,
      actionVersion: admitted.actionPolicy.version,
      targetType: "trip",
      targetId: "trip_1",
      commandInput,
      approvalPolicy: "required",
      capabilityId: admitted.actionPolicy.capabilityId,
      capabilityVersion: admitted.actionPolicy.version,
      evaluatedRisk: "high",
      reasonCode: "operator_approved",
    })
    admitted.invocation = {
      idempotencyKey: "price_1",
      approvalId: "appr_existing",
      idempotencyFingerprint: fingerprint,
      reasonCode: "operator_approved",
    }
    const scope = await buildExistingTargetIdempotencyScope({
      actionName: admitted.actionPolicy.capabilityId,
      actionVersion: admitted.actionPolicy.version,
      principalType: "user",
      principalId: "usr_1",
      organizationId: "org_1",
    })
    ;(harness.db as AnyDrizzleDb & { __claimScope?: string }).__claimScope =
      `${scope}:existing-command-claim`
    mockApprovedExistingCommand(admitted, fingerprint)
    const handlers = {
      prepare: vi.fn(async () => {}),
      execute: vi.fn(async () => ({ ok: true })),
      replay: vi.fn(async () => ({ ok: true })),
    }

    const result = await executeAdmittedExistingTargetCommand(
      existingCommandInput(harness.db, admitted),
      handlers,
    )
    expect(result.command.causation).toEqual({
      claimActionId: "alge_1",
      requestedActionId: "alge_requested_existing",
      approvalId: "appr_existing",
    })
    await expect(
      executeAdmittedExistingTargetCommand(existingCommandInput(harness.db, admitted), handlers),
    ).resolves.toMatchObject({ replayed: true })
    expect(handlers.prepare).toHaveBeenCalledTimes(1)
    expect(handlers.execute).toHaveBeenCalledTimes(1)
    expect(handlers.replay).toHaveBeenCalledTimes(1)

    const changedKey = {
      ...admitted,
      invocation: { ...admitted.invocation, idempotencyKey: "price_other" },
    }
    await expect(
      executeAdmittedExistingTargetCommand(existingCommandInput(harness.db, changedKey), handlers),
    ).rejects.toMatchObject({ reason: "idempotency_key_mismatch" })
  })

  it("rolls back the claim and package intent when intent preparation fails", async () => {
    const harness = makeCreatedCommandDb()
    const admitted = makeAdmittedExistingTargetContext()
    await configureExistingClaimLookup(harness.db, admitted)

    await expect(
      executeAdmittedExistingTargetCommand(existingCommandInput(harness.db, admitted), {
        async prepare(tx) {
          ;(tx as AnyDrizzleDb & { __intents: string[] }).__intents.push("partial-intent")
          throw new Error("intent write failed")
        },
        execute: vi.fn(),
        replay: vi.fn(),
      }),
    ).rejects.toThrow("intent write failed")
    expect(harness.entries).toEqual([])
    expect(harness.intents).toEqual([])
    expect(harness.events.at(-1)).toBe("rollback")
  })

  it("resumes a committed intent after a crash between commit and first execution", async () => {
    const harness = makeCreatedCommandDb()
    const admitted = makeAdmittedExistingTargetContext()
    await configureExistingClaimLookup(harness.db, admitted)
    const prepare = vi.fn(async (tx, command) => {
      ;(tx as AnyDrizzleDb & { __intents: string[] }).__intents.push(
        command.causation.claimActionId,
      )
    })
    const firstHandlers = {
      prepare,
      execute: vi.fn(async () => {
        throw new Error("process crashed after commit")
      }),
      replay: vi.fn(),
    }

    await expect(
      executeAdmittedExistingTargetCommand(
        existingCommandInput(harness.db, admitted),
        firstHandlers,
      ),
    ).rejects.toThrow("process crashed after commit")
    expect(harness.entries).toHaveLength(1)
    expect(harness.intents).toEqual(["alge_1"])

    const replay = vi.fn(async (command) => {
      expect(harness.intents).toContain(command.causation.claimActionId)
      return { resumed: true }
    })
    await expect(
      executeAdmittedExistingTargetCommand(existingCommandInput(harness.db, admitted), {
        prepare,
        execute: vi.fn(),
        replay,
      }),
    ).resolves.toMatchObject({ replayed: true, value: { resumed: true } })
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(replay).toHaveBeenCalledTimes(1)
  })

  it("prepares one intent and classifies a concurrent exact call as replay", async () => {
    const harness = makeCreatedCommandDb()
    const admitted = makeAdmittedExistingTargetContext()
    await configureExistingClaimLookup(harness.db, admitted)
    const prepare = vi.fn(async (tx, command) => {
      ;(tx as AnyDrizzleDb & { __intents: string[] }).__intents.push(
        command.causation.claimActionId,
      )
    })
    const execute = vi.fn(async () => ({ path: "execute" }))
    const replay = vi.fn(async () => ({ path: "replay" }))
    const handlers = { prepare, execute, replay }

    const results = await Promise.all([
      executeAdmittedExistingTargetCommand(existingCommandInput(harness.db, admitted), handlers),
      executeAdmittedExistingTargetCommand(existingCommandInput(harness.db, admitted), handlers),
    ])

    expect(results.map((result) => result.replayed).sort()).toEqual([false, true])
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(harness.intents).toEqual(["alge_1"])
    expect(execute).toHaveBeenCalledTimes(1)
    expect(replay).toHaveBeenCalledTimes(1)
  })

  it("rejects approved execution and replay across organization boundaries", async () => {
    const harness = makeCreatedCommandDb()
    const admitted = await approvedExistingContext()
    await configureExistingClaimLookup(harness.db, admitted)
    const fingerprint = admitted.invocation.idempotencyFingerprint!
    mockApprovedExistingCommand(admitted, fingerprint)
    const handlers = {
      prepare: vi.fn(async () => {}),
      execute: vi.fn(async () => ({ ok: true })),
      replay: vi.fn(async () => ({ ok: true })),
    }
    await executeAdmittedExistingTargetCommand(existingCommandInput(harness.db, admitted), handlers)

    const crossOrganization = existingCommandInput(harness.db, admitted)
    crossOrganization.context = { ...crossOrganization.context, organizationId: "org_2" }
    await configureExistingClaimLookup(harness.db, admitted, "org_2")
    await expect(
      executeAdmittedExistingTargetCommand(crossOrganization, handlers),
    ).rejects.toMatchObject({ reason: "organization_mismatch" })
    expect(handlers.replay).not.toHaveBeenCalled()
  })
})

describe("created-target command protocol", () => {
  it("uses admitted graph identity, Tool route identity, and replays the canonical child reference", async () => {
    const harness = makeCreatedCommandDb()
    const actionName = "inventory:product-extra:create"
    const actionVersion = "v1"
    const scope = await buildCreatedTargetIdempotencyScope({
      actionName,
      actionVersion,
      principalType: "user",
      principalId: "usr_1",
      organizationId: "org_1",
    })
    ;(harness.db as AnyDrizzleDb & { __claimScope?: string }).__claimScope =
      `${scope}:created-command-claim`
    const create = vi.fn(async () => ({
      value: { id: "extra_1", replayed: false },
      targetId: "extra_1",
    }))
    const admitted = makeAdmittedCreatedTargetContext({ actionName, actionVersion })
    const execute = () =>
      executeAdmittedCreatedTargetCommand(
        {
          db: harness.db,
          context: {
            userId: "usr_1",
            organizationId: "org_1",
            actor: "staff",
            callerType: "session",
          },
          admitted,
          idempotencyKey: undefined,
          commandTargetType: "product-extra-create-command",
          canonicalTargetType: "product_extra",
          resultReferenceType: "product_extra",
          commandInput: { productId: "product_1", name: "Transfer" },
          evaluatedRisk: "high",
        },
        {
          create,
          async replay(_tx, completed) {
            return { id: completed.reference.id, replayed: true }
          },
        },
      )

    await expect(execute()).resolves.toMatchObject({
      replayed: false,
      value: { id: "extra_1", replayed: false },
    })
    await expect(execute()).resolves.toMatchObject({
      replayed: true,
      value: { id: "extra_1", replayed: true },
    })
    expect(create).toHaveBeenCalledTimes(1)
    expect(harness.entries[0]).toMatchObject({
      actionName,
      capabilityId: actionName,
      capabilityVersion: actionVersion,
      routeOrToolName: admitted.capabilityId,
      organizationId: "org_1",
    })

    await expect(
      executeAdmittedCreatedTargetCommand(
        {
          db: harness.db,
          context: {
            userId: "usr_1",
            organizationId: "org_1",
            actor: "staff",
            callerType: "session",
          },
          admitted: {
            ...admitted,
            actionPolicy: { ...admitted.actionPolicy, approval: "required" as const },
          },
          idempotencyKey: "key_1",
          commandTargetType: "product-extra-create-command",
          canonicalTargetType: "product_extra",
          resultReferenceType: "product_extra",
          commandInput: { productId: "product_1", name: "Transfer" },
          evaluatedRisk: "high",
        },
        {
          create,
          async replay(_tx, completed) {
            return { id: completed.reference.id, replayed: true }
          },
        },
      ),
    ).rejects.toMatchObject({
      name: ActionLedgerCreatedCommandProtocolError.name,
      reason: "admitted_policy_mismatch",
    })
    expect(create).toHaveBeenCalledTimes(1)
  })

  it("replays a reservation claimed before the admitted-executor upgrade", async () => {
    const harness = makeCreatedCommandDb()
    const context = {
      userId: "usr_1",
      organizationId: "org_1",
      actor: "staff",
      callerType: "session",
    }
    const commandInput = {
      bookingNumber: "BK-UPGRADE-000001",
      sellCurrency: "EUR",
      items: [{ availabilitySlotId: "slot_1", quantity: 1 }],
    }
    const command = {
      actionName: "booking.reserve",
      actionVersion: "v1",
      commandTarget: {
        type: "booking_reservation_command",
        id: commandInput.bookingNumber,
      },
      canonicalTargetType: "booking",
      resultReferenceType: "booking",
      commandInput,
      capabilityId: "bookings:reserve",
      capabilityVersion: "v1",
      evaluatedRisk: "high" as const,
      approvalPolicy: "none" as const,
      approvalReasonCode: null,
    }
    const fingerprint = await buildCreatedTargetCommandFingerprint(command)
    const scope = await buildCreatedTargetIdempotencyScope({
      actionName: command.actionName,
      actionVersion: command.actionVersion,
      principalType: "user",
      principalId: "usr_1",
      organizationId: "org_1",
    })
    ;(harness.db as AnyDrizzleDb & { __claimScope?: string }).__claimScope =
      `${scope}:created-command-claim`

    await executeCreatedTargetCommand(
      harness.db,
      {
        context,
        ...command,
        routeOrToolName: "bookings.reserve_booking",
        authorizationSource: "selected_graph_mcp_handler",
        idempotency: { scope, key: "reserve-command-1", fingerprint },
      },
      {
        async create() {
          return { value: { id: "booking_1" }, targetId: "booking_1" }
        },
        async replay(_tx, completed) {
          return { id: completed.reference.id }
        },
      },
    )

    const baseAdmitted = makeAdmittedCreatedTargetContext({ actionName: "booking.reserve" })
    const admitted = {
      ...baseAdmitted,
      capabilityId: "@voyant-travel/bookings#tool.reserve-booking",
      canonicalName: "reserve_booking",
      actionPolicy: {
        ...baseAdmitted.actionPolicy,
        capabilityId: "bookings:reserve",
        targetType: "booking",
        createdTarget: {
          commandTargetType: "booking_reservation_command",
          resultReferenceType: "booking",
          durability: "handler-command-claim-v1" as const,
        },
      },
      invocation: { idempotencyKey: "reserve-command-1" },
    }
    const create = vi.fn()
    await expect(
      executeAdmittedCreatedTargetCommand(
        {
          db: harness.db,
          context,
          admitted,
          commandTargetType: "booking_reservation_command",
          commandTargetId: commandInput.bookingNumber,
          routeOrToolName: "bookings.reserve_booking",
          canonicalTargetType: "booking",
          resultReferenceType: "booking",
          commandInput,
          evaluatedRisk: "high",
        },
        {
          create,
          async replay(_tx, completed) {
            return { id: completed.reference.id }
          },
        },
      ),
    ).resolves.toMatchObject({
      replayed: true,
      value: { id: "booking_1" },
    })
    expect(create).not.toHaveBeenCalled()
    expect(harness.entries).toHaveLength(2)
    expect(harness.entries[0]).toMatchObject({
      actionName: "booking.reserve",
      targetType: "booking_reservation_command",
      targetId: "BK-UPGRADE-000001",
      routeOrToolName: "bookings.reserve_booking",
      capabilityId: "bookings:reserve",
    })
  })

  it.each([
    ["non-handler enforcement", { enforcement: "generic" as const }, { idempotencyKey: "key_1" }],
    ["optional ledger", { ledger: "optional" as const }, { idempotencyKey: "key_1" }],
    ["non-execute kind", { kind: "read" as const }, { idempotencyKey: "key_1" }],
    ["different admitted key", {}, { idempotencyKey: "key_other" }],
  ])("rejects %s before opening a transaction", async (_label, policyPatch, invocation) => {
    const harness = makeCreatedCommandDb()
    const create = vi.fn()
    const admitted = makeAdmittedCreatedTargetContext()

    await expect(
      executeAdmittedCreatedTargetCommand(
        {
          db: harness.db,
          context: {
            userId: "usr_1",
            organizationId: "org_1",
            actor: "staff",
            callerType: "session",
          },
          admitted: {
            ...admitted,
            actionPolicy: { ...admitted.actionPolicy, ...policyPatch },
            invocation,
          },
          idempotencyKey: "key_1",
          commandTargetType: "product-extra-create-command",
          canonicalTargetType: "product_extra",
          resultReferenceType: "product_extra",
          commandInput: { productId: "product_1", name: "Transfer" },
          evaluatedRisk: "high",
        },
        { create, replay: vi.fn() },
      ),
    ).rejects.toMatchObject({
      name: ActionLedgerCreatedCommandProtocolError.name,
      reason: "admitted_policy_mismatch",
    })
    expect(harness.events).toEqual([])
    expect(create).not.toHaveBeenCalled()
  })

  it.each([
    ["missing parent", { name: "Transfer" }],
    ["blank parent", { productId: "  ", name: "Transfer" }],
  ])("rejects a %s anchor before opening a transaction", async (_label, commandInput) => {
    const harness = makeCreatedCommandDb()
    const create = vi.fn()

    await expect(
      executeAdmittedCreatedTargetCommand(
        {
          db: harness.db,
          context: {
            userId: "usr_1",
            organizationId: "org_1",
            actor: "staff",
            callerType: "session",
          },
          admitted: makeAdmittedCreatedTargetContext(),
          idempotencyKey: "key_1",
          commandTargetType: "product-extra-create-command",
          canonicalTargetType: "product_extra",
          resultReferenceType: "product_extra",
          commandInput,
          evaluatedRisk: "high",
        },
        { create, replay: vi.fn() },
      ),
    ).rejects.toMatchObject({
      name: ActionLedgerCreatedCommandProtocolError.name,
      reason: "invalid_parent_anchor",
    })
    expect(harness.events).toEqual([])
    expect(create).not.toHaveBeenCalled()
  })

  it("requires both polymorphic and related anchors before opening a transaction", async () => {
    const harness = makeCreatedCommandDb()
    const create = vi.fn()
    const admitted = makeAdmittedCreatedTargetContext()
    const createdTarget = admitted.actionPolicy.createdTarget

    await expect(
      executeAdmittedCreatedTargetCommand(
        {
          db: harness.db,
          context: {
            userId: "usr_1",
            organizationId: "org_1",
            actor: "staff",
            callerType: "session",
          },
          admitted: {
            ...admitted,
            actionPolicy: {
              ...admitted.actionPolicy,
              createdTarget: {
                ...createdTarget,
                parentAnchor: {
                  targetTypeField: "entityType",
                  targetIdField: "entityId",
                  relatedTargetIdField: "optionId",
                },
              },
            },
          },
          idempotencyKey: "key_1",
          commandTargetType: "product-extra-create-command",
          canonicalTargetType: "product_extra",
          resultReferenceType: "product_extra",
          commandInput: { entityType: "product", entityId: "product_1" },
          evaluatedRisk: "high",
        },
        { create, replay: vi.fn() },
      ),
    ).rejects.toMatchObject({
      name: ActionLedgerCreatedCommandProtocolError.name,
      reason: "invalid_parent_anchor",
    })
    expect(harness.events).toEqual([])
    expect(create).not.toHaveBeenCalled()
  })

  it("owns claim, domain mutation, and canonical completion in one transaction", async () => {
    const harness = makeCreatedCommandDb()
    const input = await makeInput()

    const result = await executePersonCommand(harness.db, input)

    expect(result).toMatchObject({
      replayed: false,
      value: { id: "person_1" },
      result: {
        entry: {
          status: "succeeded",
          targetType: "relationship-person",
          targetId: "person_1",
          approvalId: null,
          idempotencyFingerprint: input.idempotency.fingerprint,
        },
        reference: {
          type: "relationship-person-ref",
          id: "person_1",
          value: "relationship-person-ref:person_1",
        },
      },
    })
    const claim = harness.entries.find((entry) => entry.status === "requested")
    expect(claim).toMatchObject({
      targetType: "relationship-person-create-command",
      targetId: "command_1",
      causationActionId: "alge_parent",
      approvalId: null,
    })
    expect(result.result.entry.causationActionId).toBe(claim?.id)
    expect(harness.events).toEqual([
      "begin",
      "advisory-lock",
      "entry:alge_1:requested",
      "detail:alge_1",
      "domain-create",
      "entry:alge_2:succeeded",
      "detail:alge_2",
      "commit",
    ])
  })

  it("rolls back the claim when the child mutation fails", async () => {
    const harness = makeCreatedCommandDb()
    const input = await makeInput()

    await expect(
      executeCreatedTargetCommand(harness.db, input, {
        async create() {
          harness.events.push("domain-create-failed")
          throw new Error("child insert failed")
        },
        async replay(_tx, result) {
          return { id: result.reference.id }
        },
      }),
    ).rejects.toThrow("child insert failed")
    expect(harness.events).toEqual([
      "begin",
      "advisory-lock",
      "entry:alge_1:requested",
      "detail:alge_1",
      "domain-create-failed",
      "rollback",
    ])
    expect(harness.events).not.toContain("commit")
  })

  it("replays the typed result without invoking domain creation twice", async () => {
    const harness = makeCreatedCommandDb()
    const input = await makeInput()
    await executePersonCommand(harness.db, input)

    const replay = await executePersonCommand(harness.db, input)

    expect(replay).toMatchObject({
      replayed: true,
      value: { id: "person_1" },
      result: { reference: { id: "person_1" } },
    })
    expect(harness.events.filter((event) => event === "domain-create")).toHaveLength(1)
    expect(harness.events.filter((event) => event === "domain-replay")).toHaveLength(1)
  })

  it("allows exact retries from a new session, correlation, and workflow step", async () => {
    const harness = makeCreatedCommandDb()
    const input = await makeInput()
    await executePersonCommand(harness.db, input)
    const retry = {
      ...input,
      context: {
        ...input.context,
        sessionId: "session_retry",
        correlationId: "correlation_retry",
        workflowStepId: "step_retry",
      },
    }

    await expect(executePersonCommand(harness.db, retry)).resolves.toMatchObject({
      replayed: true,
      result: {
        entry: {
          sessionId: null,
          correlationId: null,
          workflowStepId: null,
        },
      },
    })
  })

  it.each([
    ["principal", { userId: "usr_other" }],
    ["organization", { organizationId: "org_other" }],
  ])("rejects retry when immutable %s identity changes", async (_label, contextPatch) => {
    const harness = makeCreatedCommandDb()
    const input = await makeInput()
    await executePersonCommand(harness.db, input)

    await expect(
      executePersonCommand(harness.db, {
        ...input,
        context: { ...input.context, ...contextPatch },
      }),
    ).rejects.toMatchObject({
      name: ActionLedgerIdempotencyConflictError.name,
      existingActionId: "alge_1",
    })
  })

  it("uses mapped principal semantics and rejects mismatched caller types", async () => {
    const harness = makeCreatedCommandDb()
    const input = await makeInput({
      context: { agentId: "agent_1", callerType: "session" },
    })

    await expect(executePersonCommand(harness.db, input)).rejects.toThrow(
      "requires a concrete request principal",
    )
    expect(harness.events).toEqual([])
  })

  it("rejects API-key identity when callerType does not select API-key mapping", async () => {
    const harness = makeCreatedCommandDb()
    const input = await makeInput({
      context: { apiTokenId: "key_1", callerType: "agent" },
    })

    await expect(executePersonCommand(harness.db, input)).rejects.toThrow(
      "requires a concrete request principal",
    )
    expect(harness.events).toEqual([])
  })

  it.each(
    POLICY_DRIFTS,
  )("rejects %s drift against the supplied fingerprint", async (_label, patch) => {
    const harness = makeCreatedCommandDb()
    const input = await makeInput()

    await expect(executePersonCommand(harness.db, { ...input, ...patch })).rejects.toMatchObject({
      name: ActionLedgerCreatedCommandFingerprintMismatchError.name,
      receivedFingerprint: input.idempotency.fingerprint,
    })
    expect(harness.events).toEqual([])
  })

  it("conflicts when the same scope/key identifies a different exact command", async () => {
    const harness = makeCreatedCommandDb()
    const first = await makeInput()
    await executePersonCommand(harness.db, first)
    const changed = await makeInput({ commandInput: { displayName: "Different person" } })

    await expect(executePersonCommand(harness.db, changed)).rejects.toMatchObject({
      name: ActionLedgerIdempotencyConflictError.name,
      existingActionId: "alge_1",
    })
  })

  it("rejects replay when the stored claim tenant identity drifts", async () => {
    const harness = makeCreatedCommandDb()
    const input = await makeInput()
    await executePersonCommand(harness.db, input)
    const claim = harness.entries.find((entry) => entry.status === "requested")
    if (!claim) throw new Error("missing claim")
    claim.organizationId = "org_other"

    await expect(executePersonCommand(harness.db, input)).rejects.toMatchObject({
      name: ActionLedgerIdempotencyConflictError.name,
      existingActionId: claim.id,
    })
  })

  it("re-reads the opaque claim and fails if domain code changes it", async () => {
    const harness = makeCreatedCommandDb()
    const input = await makeInput()

    await expect(
      executeCreatedTargetCommand(harness.db, input, {
        async create() {
          const claim = harness.entries.find((entry) => entry.status === "requested")
          if (!claim) throw new Error("missing claim")
          claim.organizationId = "org_tampered"
          return { value: { id: "person_1" }, targetId: "person_1" }
        },
        async replay(_tx, result) {
          return { id: result.reference.id }
        },
      }),
    ).rejects.toMatchObject({
      name: ActionLedgerCreatedCommandProtocolError.name,
      reason: "claim_changed_during_mutation",
    })
  })

  it("fails closed if domain code manufactures a result during creation", async () => {
    const harness = makeCreatedCommandDb()
    const input = await makeInput()

    await expect(
      executeCreatedTargetCommand(harness.db, input, {
        async create() {
          const claim = harness.entries.find((entry) => entry.status === "requested")
          if (!claim) throw new Error("missing claim")
          harness.entries.push(
            makeEntry({
              ...claim,
              id: "alge_forged_result",
              status: "succeeded",
              targetType: "relationship-person",
              targetId: "person_1",
              causationActionId: claim.id,
              idempotencyScope: resultScope(input.idempotency.scope),
            }),
          )
          return { value: { id: "person_1" }, targetId: "person_1" }
        },
        async replay(_tx, result) {
          return { id: result.reference.id }
        },
      }),
    ).rejects.toMatchObject({
      name: ActionLedgerCreatedCommandProtocolError.name,
      reason: "result_created_during_mutation",
    })
  })

  it.each([
    ["organizationId", "org_other"],
    ["principalId", "usr_other"],
    ["approvalId", "appr_other"],
    ["capabilityVersion", "v2"],
    ["authorizationSource", "other_source"],
    ["workflowRunId", "workflow_other"],
    ["causationActionId", "alge_other_claim"],
  ] as const)("validates immutable replay continuity for %s", async (field, value) => {
    const harness = makeCreatedCommandDb()
    const input = await makeInput()
    const first = await executePersonCommand(harness.db, input)
    Object.assign(first.result.entry, { [field]: value })

    await expect(executePersonCommand(harness.db, input)).rejects.toMatchObject({
      name: ActionLedgerCreatedCommandReplayCorruptError.name,
      resultActionId: first.result.entry.id,
      reason: "result_identity_mismatch",
    })
  })

  it.each([
    ["leading", "relationship-person-ref: person_1"],
    ["trailing", "relationship-person-ref:person_1 "],
  ])("rejects %s result-reference id whitespace as noncanonical", async (_label, value) => {
    const harness = makeCreatedCommandDb()
    const input = await makeInput()
    const first = await executePersonCommand(harness.db, input)
    const detail = harness.mutationDetails.find((row) => row.actionId === first.result.entry.id)
    if (!detail) throw new Error("missing canonical result detail")
    detail.commandResultRef = value

    await expect(executePersonCommand(harness.db, input)).rejects.toMatchObject({
      name: ActionLedgerCreatedCommandReplayCorruptError.name,
      resultActionId: first.result.entry.id,
      reason: "malformed_result_reference",
    })
  })

  it("distinguishes a committed claim with no canonical result", async () => {
    const harness = makeCreatedCommandDb()
    const input = await makeInput()
    await executePersonCommand(harness.db, input)
    harness.entries.splice(
      harness.entries.findIndex((entry) => entry.status === "succeeded"),
      1,
    )

    await expect(executePersonCommand(harness.db, input)).rejects.toMatchObject({
      name: ActionLedgerCreatedCommandReplayIncompleteError.name,
      claimActionId: "alge_1",
    })
  })

  it("requires a transaction-capable database before claiming", async () => {
    const input = await makeInput()

    await expect(executePersonCommand({} as AnyDrizzleDb, input)).rejects.toMatchObject({
      name: ActionLedgerCreatedCommandTransactionRequiredError.name,
    })
  })

  it("validates an approved request before mutation, links causation, and exactly replays", async () => {
    const harness = makeCreatedCommandDb()
    const input = await makeInput({ approvalPolicy: "required" })
    mockApprovedCommand(input)

    const first = await executePersonCommand(harness.db, input)
    const replay = await executePersonCommand(harness.db, input)

    expect(first.result.entry).toMatchObject({
      approvalId: "appr_created",
      causationActionId: "alge_1",
    })
    const claim = harness.entries.find((entry) => entry.status === "requested")
    expect(claim).toMatchObject({
      approvalId: "appr_created",
      causationActionId: "alge_requested",
    })
    expect(replay.replayed).toBe(true)
    expect(harness.events.filter((event) => event === "domain-create")).toHaveLength(1)
    expect(actionLedgerService.validateApprovedAction).toHaveBeenNthCalledWith(
      1,
      harness.db,
      expect.objectContaining({
        capabilityId: input.capabilityId,
        capabilityVersion: input.capabilityVersion,
        evaluatedRisk: input.evaluatedRisk,
        policyName: input.approvalPolicyName,
        policyVersion: input.actionVersion,
        reasonCode: input.approvalReasonCode,
        idempotencyKey: input.idempotency.key,
        targetType: input.commandTarget.type,
        targetId: input.commandTarget.id,
      }),
    )
    expect(actionLedgerService.validateApprovedAction).toHaveBeenCalledTimes(1)
    expect(actionLedgerService.getApproval).toHaveBeenCalledWith(harness.db, "appr_created")
  })

  it("uses one approval only once when the same exact command changes idempotency scope", async () => {
    const harness = makeCreatedCommandDb()
    const input = await makeInput({ approvalPolicy: "required" })
    mockApprovedCommand(input)
    await executePersonCommand(harness.db, input)

    await expect(
      executePersonCommand(harness.db, {
        ...input,
        idempotency: { ...input.idempotency, scope: "relationships.create_person:other-scope" },
      }),
    ).rejects.toMatchObject({
      name: ActionLedgerCreatedCommandApprovalError.name,
      reason: "already_executed",
    })
    expect(harness.events.filter((event) => event === "domain-create")).toHaveLength(1)
  })

  it.each([
    "expired",
    "principal_mismatch",
    "risk_mismatch",
  ] as const)("rejects %s approval validation before domain mutation", async (reason) => {
    const harness = makeCreatedCommandDb()
    const input = await makeInput({ approvalPolicy: "required" })
    vi.spyOn(actionLedgerService, "validateApprovedAction").mockResolvedValue({
      ok: false,
      reason,
    })

    await expect(executePersonCommand(harness.db, input)).rejects.toMatchObject({
      name: ActionLedgerCreatedCommandApprovalError.name,
      approvalId: "appr_created",
      reason,
    })
    expect(harness.events).toEqual(["begin", "advisory-lock", "advisory-lock", "rollback"])
    expect(harness.events).not.toContain("domain-create")
  })

  it("rejects direct approval or causation fields instead of trusting forged linkage", async () => {
    const harness = makeCreatedCommandDb()
    const input = await makeInput({ approvalPolicy: "required" })

    await expect(
      executePersonCommand(harness.db, { ...input, approvalId: "appr_forged" }),
    ).rejects.toMatchObject({
      name: ActionLedgerCreatedCommandProtocolError.name,
      reason: "forged_approval_linkage",
    })
    await expect(
      executePersonCommand(harness.db, { ...input, causationActionId: "alge_forged" }),
    ).rejects.toMatchObject({
      name: ActionLedgerCreatedCommandProtocolError.name,
      reason: "forged_approval_linkage",
    })
    expect(harness.events).toEqual([])
  })
})

function makeAdmittedExistingTargetContext(
  input: { approval?: "never" | "required" } = {},
): ExecuteAdmittedExistingTargetCommandInput["admitted"] {
  const approval = input.approval ?? "never"
  return {
    capabilityId: "@voyant-travel/trips#tool.price-trip",
    capabilityVersion: "v1",
    canonicalName: "price_trip",
    actionPolicy: {
      id: "@voyant-travel/trips#action.price-trip",
      capabilityId: "@voyant-travel/trips#action.price-trip",
      version: "v1",
      kind: "execute",
      targetType: "trip",
      commandTargetField: "tripId",
      targetLifecycle: "existing",
      existingTarget: { durability: "handler-command-result-v1" },
      risk: "high",
      ledger: "required",
      approval,
      ...(approval === "required" ? { policy: "trips-price-policy" } : {}),
      reversible: true,
      enforcement: "handler",
      invocation: {
        controlField: "_voyant",
        requiredFields:
          approval === "required"
            ? ["idempotencyKey", "approvalId", "idempotencyFingerprint"]
            : ["idempotencyKey"],
        optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"],
        fingerprintAlgorithm: "action-ledger-command-v1",
      },
    },
    invocation: { idempotencyKey: "price_1" },
  }
}

function existingCommandInput(
  db: AnyDrizzleDb,
  admitted: ExecuteAdmittedExistingTargetCommandInput["admitted"],
): ExecuteAdmittedExistingTargetCommandInput<{ tripId: string; currency: string }> {
  ;(db as AnyDrizzleDb & { __claimKey?: string }).__claimKey = admitted.invocation.idempotencyKey
  return {
    db,
    context: {
      userId: "usr_1",
      organizationId: "org_1",
      actor: "staff",
      callerType: "session",
      sessionId: "session_current",
    },
    admitted,
    commandInput: { tripId: "trip_1", currency: "EUR" },
    evaluatedRisk: "high",
  }
}

async function approvedExistingContext() {
  const admitted = makeAdmittedExistingTargetContext({ approval: "required" })
  admitted.invocation = {
    idempotencyKey: "price_1",
    approvalId: "appr_existing",
    idempotencyFingerprint: await buildActionApprovalCommandFingerprint({
      actionName: admitted.actionPolicy.capabilityId,
      actionVersion: admitted.actionPolicy.version,
      targetType: "trip",
      targetId: "trip_1",
      commandInput: { tripId: "trip_1", currency: "EUR" },
      approvalPolicy: "required",
      capabilityId: admitted.actionPolicy.capabilityId,
      capabilityVersion: admitted.actionPolicy.version,
      evaluatedRisk: "high",
      reasonCode: "operator_approved",
    }),
    reasonCode: "operator_approved",
  }
  return admitted
}

async function configureExistingClaimLookup(
  db: AnyDrizzleDb,
  admitted: ExecuteAdmittedExistingTargetCommandInput["admitted"],
  organizationId = "org_1",
) {
  const scope = await buildExistingTargetIdempotencyScope({
    actionName: admitted.actionPolicy.capabilityId,
    actionVersion: admitted.actionPolicy.version,
    principalType: "user",
    principalId: "usr_1",
    organizationId,
  })
  const store = db as AnyDrizzleDb & { __claimScope?: string; __claimKey?: string }
  store.__claimScope = `${scope}:existing-command-claim`
  store.__claimKey = admitted.invocation.idempotencyKey
}

function mockApprovedExistingCommand(
  admitted: ExecuteAdmittedExistingTargetCommandInput["admitted"],
  fingerprint: string,
) {
  const approval = makeApproval({
    id: "appr_existing",
    requestedActionId: "alge_requested_existing",
    status: "approved",
    requestedByPrincipalId: "usr_1",
    assignedToPrincipalId: "usr_approver",
    decidedByPrincipalId: "usr_approver",
    policyName: "trips-price-policy",
    policyVersion: "v1",
    riskSnapshot: "high",
    reasonCode: "operator_approved",
    expiresAt: null,
  })
  const requestedAction = makeEntry({
    id: "alge_requested_existing",
    actionName: admitted.actionPolicy.capabilityId,
    actionVersion: admitted.actionPolicy.version,
    actionKind: "execute",
    status: "awaiting_approval",
    evaluatedRisk: "high",
    principalType: "user",
    principalId: "usr_1",
    organizationId: "org_1",
    targetType: "trip",
    targetId: "trip_1",
    routeOrToolName: admitted.capabilityId,
    capabilityId: admitted.actionPolicy.capabilityId,
    capabilityVersion: admitted.actionPolicy.version,
    approvalId: "appr_existing",
    idempotencyKey: "price_1",
    idempotencyFingerprint: fingerprint,
  })
  vi.spyOn(actionLedgerService, "validateApprovedAction").mockImplementation(async (_db, input) =>
    input.organizationId !== requestedAction.organizationId
      ? {
          ok: false,
          reason: "organization_mismatch",
          approval,
          requestedAction,
        }
      : input.idempotencyKey !== requestedAction.idempotencyKey
        ? {
            ok: false,
            reason: "idempotency_key_mismatch",
            approval,
            requestedAction,
          }
        : {
            ok: true,
            approval,
            requestedAction,
            idempotencyFingerprint: fingerprint,
          },
  )
  vi.spyOn(actionLedgerService, "getApproval").mockResolvedValue({
    approval,
    requestedAction: {
      entry: requestedAction,
      mutationDetail: null,
      sensitiveReadDetail: null,
      payloads: [],
    },
  })
}

function makeAdmittedCreatedTargetContext(
  input: { actionName?: string; actionVersion?: string } = {},
) {
  const actionName = input.actionName ?? "inventory:product-extra:create"
  const actionVersion = input.actionVersion ?? "v1"
  return {
    capabilityId: "@voyant-travel/inventory#extras.tool.create-product-extra",
    capabilityVersion: "v1",
    canonicalName: "create_product_extra",
    actionPolicy: {
      id: actionName,
      capabilityId: actionName,
      version: actionVersion,
      kind: "execute" as const,
      targetType: "product_extra",
      targetLifecycle: "created" as const,
      createdTarget: {
        commandTargetType: "product-extra-create-command",
        resultReferenceType: "product_extra",
        durability: "handler-command-claim-v1" as const,
        parentAnchor: { targetType: "product", targetIdField: "productId" },
      },
      risk: "high" as const,
      ledger: "required" as const,
      approval: "never" as const,
      reversible: false,
      enforcement: "handler" as const,
      invocation: {
        controlField: "_voyant" as const,
        requiredFields: ["idempotencyKey"] as const,
        optionalFields: [] as const,
        fingerprintAlgorithm: "action-ledger-command-v1" as const,
      },
    },
    invocation: { idempotencyKey: "key_1" },
  }
}

async function executePersonCommand(db: AnyDrizzleDb, input: ExecuteCreatedTargetCommandInput) {
  const harness = db as AnyDrizzleDb & { __claimScope?: string }
  harness.__claimScope = `${input.idempotency.scope}:created-command-claim`
  return executeCreatedTargetCommand(db, input, {
    async create() {
      const harness = db as AnyDrizzleDb & { __events?: string[] }
      harness.__events?.push("domain-create")
      return { value: { id: "person_1" }, targetId: "person_1" }
    },
    async replay(_tx, result) {
      const harness = db as AnyDrizzleDb & { __events?: string[] }
      harness.__events?.push("domain-replay")
      return { id: result.reference.id }
    },
  })
}

async function makeInput(
  options: {
    context?: ExecuteCreatedTargetCommandInput["context"]
    commandInput?: unknown
    approvalPolicy?: ExecuteCreatedTargetCommandInput["approvalPolicy"]
  } = {},
): Promise<ExecuteCreatedTargetCommandInput> {
  const commandInput = options.commandInput ?? { displayName: "Example person" }
  const fingerprintInput = {
    actionName: "relationship.person.create",
    actionVersion: "v1",
    commandTarget: {
      type: "relationship-person-create-command",
      id: "command_1",
    },
    canonicalTargetType: "relationship-person",
    resultReferenceType: "relationship-person-ref",
    commandInput,
    capabilityId: "relationships:person:create",
    capabilityVersion: "v1",
    evaluatedRisk: "high" as const,
    approvalPolicy: options.approvalPolicy ?? ("none" as const),
    approvalReasonCode: "agent_created_person",
  }
  const fingerprint = await buildCreatedTargetCommandFingerprint(fingerprintInput)
  const approvalRequired = fingerprintInput.approvalPolicy === "required"
  return {
    context:
      options.context ??
      ({
        userId: "usr_1",
        callerType: "session",
        actor: "staff",
        organizationId: "org_1",
        workflowRunId: "workflow_1",
      } satisfies ExecuteCreatedTargetCommandInput["context"]),
    ...fingerprintInput,
    routeOrToolName: "relationships.create_person",
    authorizationSource: "relationships.create_person.handler",
    ...(approvalRequired
      ? {
          approvalPolicyName: "relationships-create-policy",
          approvalControls: {
            approvalId: "appr_created",
            idempotencyKey: "idem_1",
            idempotencyFingerprint: fingerprint,
            reasonCode: "agent_created_person",
          },
        }
      : { causationActionId: "alge_parent" }),
    idempotency: {
      scope: "relationships.create_person:usr_1",
      key: "idem_1",
      fingerprint,
    },
  }
}

function mockApprovedCommand(input: ExecuteCreatedTargetCommandInput) {
  const result = {
    ok: true,
    approval: makeApproval({
      id: "appr_created",
      requestedActionId: "alge_requested",
      status: "approved",
      requestedByPrincipalId: "usr_1",
      assignedToPrincipalId: "usr_approver",
      decidedByPrincipalId: "usr_approver",
      policyName: "relationships-create-policy",
      policyVersion: "v1",
      riskSnapshot: "high",
      reasonCode: input.approvalReasonCode,
      expiresAt: null,
    }),
    requestedAction: makeEntry({
      id: "alge_requested",
      actionName: input.actionName,
      actionVersion: input.actionVersion,
      actionKind: "execute",
      status: "awaiting_approval",
      evaluatedRisk: input.evaluatedRisk,
      principalType: "user",
      principalId: "usr_1",
      organizationId: "org_1",
      targetType: input.commandTarget.type,
      targetId: input.commandTarget.id,
      routeOrToolName: input.routeOrToolName ?? null,
      capabilityId: input.capabilityId,
      capabilityVersion: input.capabilityVersion,
      approvalId: "appr_created",
      idempotencyKey: input.idempotency.key,
      idempotencyFingerprint: input.idempotency.fingerprint,
    }),
    idempotencyFingerprint: input.idempotency.fingerprint,
  } as const
  vi.spyOn(actionLedgerService, "getApproval").mockResolvedValue({
    approval: result.approval,
    requestedAction: {
      entry: result.requestedAction,
      mutationDetail: null,
      sensitiveReadDetail: null,
      payloads: [],
    },
  })
  return vi.spyOn(actionLedgerService, "validateApprovedAction").mockResolvedValue(result)
}

function makeCreatedCommandDb() {
  const entries: ActionLedgerEntry[] = []
  const mutationDetails: ActionMutationDetail[] = []
  const events: string[] = []
  const intents: string[] = []
  let transactionTail = Promise.resolve()

  const db = {
    __events: events,
    __intents: intents,
    __claimScope: "relationships.create_person:usr_1:created-command-claim",
    __claimKey: undefined as string | undefined,
    async transaction<T>(callback: (tx: AnyDrizzleDb) => Promise<T>) {
      const previous = transactionTail
      let release!: () => void
      transactionTail = new Promise<void>((resolve) => {
        release = resolve
      })
      await previous
      const entryCount = entries.length
      const detailCount = mutationDetails.length
      const intentCount = intents.length
      events.push("begin")
      try {
        const result = await callback(db as unknown as AnyDrizzleDb)
        events.push("commit")
        return result
      } catch (error) {
        entries.splice(entryCount)
        mutationDetails.splice(detailCount)
        intents.splice(intentCount)
        events.push("rollback")
        throw error
      } finally {
        release()
      }
    },
    execute() {
      events.push("advisory-lock")
      return Promise.resolve([])
    },
    select(selection?: Record<string, unknown>) {
      return {
        from(table: unknown) {
          return {
            where() {
              return {
                limit() {
                  if (table === actionLedgerEntries && selection && "claim" in selection) {
                    const claim = entries.find(
                      (entry) =>
                        entry.idempotencyScope === db.__claimScope &&
                        (db.__claimKey === undefined || entry.idempotencyKey === db.__claimKey),
                    )
                    return Promise.resolve(claim ? [{ claim }] : [])
                  }
                  if (table === actionLedgerEntries && selection && "approvedClaim" in selection) {
                    const approvedClaim = entries.find((entry) => entry.status === "requested")
                    return Promise.resolve(approvedClaim ? [{ approvedClaim }] : [])
                  }
                  if (table === actionLedgerEntries && selection && "result" in selection) {
                    const result = entries.find((entry) =>
                      entry.idempotencyScope?.endsWith(":created-command-result"),
                    )
                    return Promise.resolve(result ? [{ result }] : [])
                  }
                  if (
                    table === actionMutationDetails &&
                    selection &&
                    "commandResultRef" in selection
                  ) {
                    const result = entries.find((entry) =>
                      entry.idempotencyScope?.endsWith(":created-command-result"),
                    )
                    const detail = mutationDetails.find((row) => row.actionId === result?.id)
                    return Promise.resolve(
                      detail ? [{ commandResultRef: detail.commandResultRef }] : [],
                    )
                  }
                  return Promise.resolve([])
                },
              }
            },
          }
        },
      }
    },
    insert(table: unknown) {
      return {
        values(values: NewActionLedgerEntry | NewActionMutationDetail) {
          if (table === actionLedgerEntries) {
            return {
              returning() {
                const input = values as NewActionLedgerEntry
                const entry = makeEntry({
                  ...input,
                  id: `alge_${entries.length + 1}`,
                  occurredAt: input.occurredAt ?? new Date("2026-07-23T10:00:00.000Z"),
                  createdAt: new Date("2026-07-23T10:00:00.000Z"),
                  actorType: input.actorType ?? null,
                  principalSubtype: input.principalSubtype ?? null,
                  sessionId: input.sessionId ?? null,
                  apiTokenId: input.apiTokenId ?? null,
                  delegatedByPrincipalType: input.delegatedByPrincipalType ?? null,
                  delegatedByPrincipalId: input.delegatedByPrincipalId ?? null,
                  delegationId: input.delegationId ?? null,
                  callerType: input.callerType ?? null,
                  organizationId: input.organizationId ?? null,
                  routeOrToolName: input.routeOrToolName ?? null,
                  workflowRunId: input.workflowRunId ?? null,
                  workflowStepId: input.workflowStepId ?? null,
                  correlationId: input.correlationId ?? null,
                  causationActionId: input.causationActionId ?? null,
                  idempotencyScope: input.idempotencyScope ?? null,
                  idempotencyKey: input.idempotencyKey ?? null,
                  idempotencyFingerprint: input.idempotencyFingerprint ?? null,
                  capabilityId: input.capabilityId ?? null,
                  capabilityVersion: input.capabilityVersion ?? null,
                  authorizationSource: input.authorizationSource ?? null,
                  approvalId: input.approvalId ?? null,
                  amendsActionId: input.amendsActionId ?? null,
                })
                entries.push(entry)
                events.push(`entry:${entry.id}:${entry.status}`)
                return Promise.resolve([entry])
              },
            }
          }
          const input = values as NewActionMutationDetail
          const detail = makeMutationDetail({
            ...input,
            commandInputRef: input.commandInputRef ?? null,
            commandResultRef: input.commandResultRef ?? null,
            summary: input.summary ?? null,
            reversalKind: input.reversalKind ?? "none",
          })
          mutationDetails.push(detail)
          events.push(`detail:${detail.actionId}`)
          return {}
        },
      }
    },
  } as unknown as AnyDrizzleDb & { __events: string[] }

  return { db, entries, mutationDetails, events, intents }
}

function resultScope(scope: string): string {
  return `${scope}:created-command-result`
}
