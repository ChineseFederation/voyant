// agent-quality: file-size exception -- owner: flights; live Postgres proves authentic admission, tenant scope, leases, restart recovery, and settlement.
import { randomUUID } from "node:crypto"

import {
  type ActionLedgerRequestContextValues,
  buildActionApprovalCommandFingerprint,
  decideActionLedgerApproval,
  requestActionLedgerApproval,
} from "@voyant-travel/action-ledger"
import { createDbClient } from "@voyant-travel/db"
import { cleanupTestDb } from "@voyant-travel/db/test-utils"
import {
  createToolRegistry,
  type ToolContext,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import {
  drainDurableFlightActionOperations,
  executeDurableFlightAction,
} from "../../src/durable-action-command.js"
import {
  DURABLE_FLIGHT_ACTION_PROTOCOL,
  type DurableFlightActionCapability,
  type DurableFlightActionCommand,
  type DurableFlightActionResult,
  type DurableFlightActionRuntime,
} from "../../src/durable-action-runtime-port.js"
import { flightActionOperations } from "../../src/reference/local-postgres.js"
import {
  type FlightsToolServices,
  TICKET_FLIGHT_ORDER_HANDLER_POLICY,
  ticketFlightOrderTool,
} from "../../src/tools.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL
type ClosableTestDb = PostgresJsDatabase & {
  $client: { end(options?: { timeout?: number | null }): Promise<unknown> }
}

describe.skipIf(!DB_AVAILABLE)("durable Flights supplier actions", () => {
  let db: ClosableTestDb

  beforeAll(() => {
    db = createDbClient(process.env.TEST_DATABASE_URL as string, {
      adapter: "node",
      nodeMaxConnections: 4,
      timeouts: { statementMs: false, queryMs: false, connectMs: false },
    }) as ClosableTestDb
  })
  beforeEach(() => cleanupTestDb(db))
  afterAll(async () => {
    await db.$client.end({ timeout: 0 })
  })

  it("persists one tenant-scoped intent and reconciles exact command replay", async () => {
    const capability = memoryCapability()
    const command = await approvedTicketCommand(`ticket-${randomUUID()}`)
    const first = await executeToolCommand(command, capability)
    const replay = await executeToolCommand(command, capability)

    expect(replay).toEqual(first)
    expect(capability.execute).toHaveBeenCalledTimes(1)
    expect(capability.reconcile).toHaveBeenCalledTimes(1)
    expect(capability.commands[0]).toMatchObject({
      organizationId: command.context.organizationId,
      orderId: command.input.orderId,
    })
    expect(await db.select().from(flightActionOperations)).toHaveLength(1)
    expect((await db.select().from(flightActionOperations))[0]).toMatchObject({
      organizationId: command.context.organizationId,
      targetType: "flight-order",
      targetId: command.input.orderId,
      kind: "ticket-order",
      backendIdentity: capability.backendIdentity,
      status: "completed",
      outcomeSnapshot: first,
    })
  })

  it("recovers an ambiguous supplier acceptance without caller replay", async () => {
    const capability = memoryCapability({ failAfterFirstAcceptance: true })
    const command = await approvedTicketCommand(`ambiguous-${randomUUID()}`)
    await expect(executeToolCommand(command, capability)).rejects.toThrow("ambiguous transport")
    expect((await db.select().from(flightActionOperations))[0]).toMatchObject({
      status: "pending",
      lastError: "ambiguous transport",
    })

    const drained = await drainDurableFlightActionOperations(db, runtime(capability), {
      now: new Date(Date.now() + 60_000),
    })
    expect(drained).toEqual({ processed: 1, completed: 1, retried: 0, leaseLost: 0 })
    expect(capability.execute).toHaveBeenCalledTimes(1)
    expect(capability.reconcile).toHaveBeenCalledTimes(2)
    expect((await db.select().from(flightActionOperations))[0]).toMatchObject({
      status: "completed",
    })
  })

  it("does not settle invalid supplier output and recovers once reconciliation is valid", async () => {
    const capability = memoryCapability({ invalidFirstOutcome: true })
    const command = await approvedTicketCommand(`invalid-${randomUUID()}`)
    await expect(executeToolCommand(command, capability)).rejects.toThrow()
    expect((await db.select().from(flightActionOperations))[0]).toMatchObject({
      status: "pending",
      providerOperationId: null,
      outcomeSnapshot: null,
    })

    capability.repairOutcome()
    await expect(
      drainDurableFlightActionOperations(db, runtime(capability), {
        now: new Date(Date.now() + 60_000),
      }),
    ).resolves.toMatchObject({ completed: 1 })
    expect((await db.select().from(flightActionOperations))[0]).toMatchObject({
      status: "completed",
      outcomeSnapshot: validTicketOutcome(command.input.orderId),
    })
  })

  it("fences concurrent exact replay and never regresses completed state", async () => {
    let releaseProvider!: () => void
    const providerGate = new Promise<void>((resolve) => {
      releaseProvider = resolve
    })
    const capability = memoryCapability({ providerGate })
    const command = await approvedTicketCommand(`concurrent-${randomUUID()}`)
    const first = executeToolCommand(command, capability)
    await capability.accepted
    await expect(executeToolCommand(command, capability)).rejects.toThrow(/already being processed/)
    releaseProvider()
    await expect(first).resolves.toMatchObject({ order: { orderId: command.input.orderId } })
    expect((await db.select().from(flightActionOperations))[0]).toMatchObject({
      status: "completed",
      leaseVersion: 1,
    })
  })

  it("rejects command and backend drift before a second supplier mutation", async () => {
    const capability = memoryCapability({ failAfterFirstAcceptance: true })
    const command = await approvedTicketCommand(`drift-${randomUUID()}`)
    await expect(executeToolCommand(command, capability)).rejects.toThrow("ambiguous transport")

    await expect(
      executeToolCommand(
        { ...command, input: { orderId: `${command.input.orderId}-other` } },
        capability,
      ),
    ).rejects.toThrow()
    const changedBackend = memoryCapability({ backendIdentity: "flights-backend:v2" })
    await expect(executeToolCommand(command, changedBackend)).rejects.toThrow(/backend changed/)
    expect(changedBackend.execute).not.toHaveBeenCalled()
  })

  async function executeToolCommand(
    command: Awaited<ReturnType<typeof approvedTicketCommand>>,
    capability: ReturnType<typeof memoryCapability>,
  ) {
    const registry = createToolRegistry()
    registry.register(ticketFlightOrderTool, {
      actionPolicy: TICKET_FLIGHT_ORDER_HANDLER_POLICY.actionPolicy,
    })
    const toolContext: ToolContext & { flights: FlightsToolServices } = {
      db,
      actor: "staff",
      audience: "staff",
      tenantId: command.context.organizationId ?? "",
      organizationId: command.context.organizationId ?? "",
      resolverScope: {
        locale: "en-GB",
        audience: "staff",
        market: "default",
        actor: "staff",
      },
      handlerActionPolicy: command.admitted,
      flights: {
        async ticketOrder(orderId, admitted) {
          return executeDurableFlightAction({
            db,
            context: command.context,
            admitted,
            action: "ticket-order",
            capability,
            input: { orderId },
          })
        },
      } as FlightsToolServices,
    }
    const output = await registry.dispatch(ticketFlightOrderTool.name, command.input, toolContext)
    return output as Readonly<Record<string, unknown>>
  }

  async function approvedTicketCommand(idempotencyKey: string) {
    const context: ActionLedgerRequestContextValues = {
      userId: "user_flights",
      callerType: "session",
      actor: "staff",
      organizationId: "org_flights",
    }
    const input = { orderId: `ord_${randomUUID()}` }
    const policy = TICKET_FLIGHT_ORDER_HANDLER_POLICY.actionPolicy
    const reasonCode = "approved_flight_ticket"
    const fingerprint = await buildActionApprovalCommandFingerprint({
      actionName: policy.capabilityId,
      actionVersion: policy.version,
      targetType: policy.targetType,
      targetId: input.orderId,
      commandInput: input,
      approvalPolicy: "required",
      capabilityId: policy.capabilityId,
      capabilityVersion: policy.version,
      evaluatedRisk: "critical",
      reasonCode,
    })
    const requested = await requestActionLedgerApproval(db, {
      context,
      actionName: policy.capabilityId,
      actionVersion: policy.version,
      actionKind: "execute",
      evaluatedRisk: "critical",
      targetType: policy.targetType,
      targetId: input.orderId,
      routeOrToolName: TICKET_FLIGHT_ORDER_HANDLER_POLICY.capabilityId,
      capabilityId: policy.capabilityId,
      capabilityVersion: policy.version,
      authorizationSource: "integration_test",
      idempotencyScope: `org_flights:ticket-approval:${idempotencyKey}`,
      idempotencyKey,
      idempotencyFingerprint: fingerprint,
      approval: {
        assignedToPrincipalId: "user_flights",
        policyName: "flight-ticket",
        policyVersion: policy.version,
        riskSnapshot: "critical",
        reasonCode,
        expiresAt: new Date(Date.now() + 60_000),
      },
    })
    await decideActionLedgerApproval(db, {
      context,
      id: requested.approval.id,
      status: "approved",
      actionName: "flights.approval.decision",
      actionVersion: "v1",
      evaluatedRisk: "critical",
      organizationId: "org_flights",
    })
    const registry = createToolRegistry()
    registry.register(ticketFlightOrderTool, {
      actionPolicy: TICKET_FLIGHT_ORDER_HANDLER_POLICY.actionPolicy,
    })
    const manifest = registry.list()[0]
    if (!manifest?.actionPolicy) throw new Error("Ticket Tool action policy is missing")
    const admitted: ToolHandlerActionPolicyContext = {
      capabilityId: manifest.capabilityId,
      capabilityVersion: manifest.capabilityVersion,
      canonicalName: manifest.name,
      actionPolicy: manifest.actionPolicy,
      invocation: {
        confirmed: true,
        idempotencyKey,
        approvalId: requested.approval.id,
        idempotencyFingerprint: fingerprint,
        reasonCode,
      },
    }
    return { context, admitted, input }
  }
})

function memoryCapability(
  options: {
    backendIdentity?: string
    failAfterFirstAcceptance?: boolean
    invalidFirstOutcome?: boolean
    providerGate?: Promise<void>
  } = {},
): DurableFlightActionCapability & {
  execute: ReturnType<typeof vi.fn>
  reconcile: ReturnType<typeof vi.fn>
  commands: DurableFlightActionCommand[]
  accepted: Promise<void>
  repairOutcome(): void
} {
  const backendIdentity = options.backendIdentity ?? "flights-backend:v1"
  const accepted = new Map<
    string,
    {
      organizationId: string
      fingerprint: string
      result: DurableFlightActionResult
    }
  >()
  const commands: DurableFlightActionCommand[] = []
  let failed = false
  let repaired = !options.invalidFirstOutcome
  let announceAccepted!: () => void
  const acceptedPromise = new Promise<void>((resolve) => {
    announceAccepted = resolve
  })
  const execute = vi.fn(async (command: DurableFlightActionCommand) => {
    commands.push(command)
    const existing = accepted.get(command.idempotencyKey)
    if (existing) {
      assertSameCommand(existing, command)
      return existing.result
    }
    const result: DurableFlightActionResult = {
      backendIdentity,
      providerOperationId: `provider:${command.operationId}`,
      outcome: repaired ? validTicketOutcome(command.orderId) : { invalid: true },
    }
    accepted.set(command.idempotencyKey, {
      organizationId: command.organizationId,
      fingerprint: command.requestFingerprint,
      result,
    })
    announceAccepted()
    if (options.providerGate) await options.providerGate
    if (options.failAfterFirstAcceptance && !failed) {
      failed = true
      throw new Error("ambiguous transport")
    }
    return result
  })
  const reconcile = vi.fn(async (command: DurableFlightActionCommand) => {
    commands.push(command)
    const existing = accepted.get(command.idempotencyKey)
    if (!existing) return null
    assertSameCommand(existing, command)
    if (repaired && "invalid" in existing.result.outcome) {
      existing.result = {
        ...existing.result,
        outcome: validTicketOutcome(command.orderId),
      }
    }
    return existing.result
  })
  return {
    protocol: DURABLE_FLIGHT_ACTION_PROTOCOL,
    backendIdentity,
    execute,
    reconcile,
    commands,
    accepted: acceptedPromise,
    repairOutcome() {
      repaired = true
    },
  }
}

function runtime(capability: DurableFlightActionCapability): DurableFlightActionRuntime {
  return {
    ticket: capability,
    cancel: capability,
    async createIsolatedProbe() {
      throw new Error("not used by the operation drain")
    },
  }
}

function assertSameCommand(
  existing: { organizationId: string; fingerprint: string },
  command: DurableFlightActionCommand,
) {
  if (
    existing.organizationId !== command.organizationId ||
    existing.fingerprint !== command.requestFingerprint
  ) {
    throw new Error("payload or tenant drift")
  }
}

function validTicketOutcome(orderId: string): Readonly<Record<string, unknown>> {
  const totalPrice = { amount: "600.00", currency: "USD" }
  return {
    order: {
      orderId,
      status: "ticketed",
      offer: {
        offerId: "offer_1",
        source: "durable-test",
        itineraries: [
          {
            segments: [
              {
                segmentId: "seg_1",
                carrierCode: "BA",
                flightNumber: "177",
                departure: { iataCode: "LHR", at: "2026-10-15T11:00:00Z" },
                arrival: { iataCode: "JFK", at: "2026-10-15T19:00:00Z" },
                cabin: "economy",
              },
            ],
          },
        ],
        fareBreakdowns: [
          {
            passengerType: "adult",
            passengerCount: 1,
            baseFare: { amount: "500.00", currency: "USD" },
            taxes: { amount: "100.00", currency: "USD" },
            total: totalPrice,
          },
        ],
        totalPrice,
      },
      passengers: [
        {
          passengerId: "pax_1",
          type: "adult",
          firstName: "Ada",
          lastName: "Lovelace",
          dateOfBirth: "1980-01-01",
        },
      ],
      totalPrice,
      createdAt: "2026-10-01T10:00:00Z",
    },
  }
}
