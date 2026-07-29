import { actionLedgerEntries } from "@voyant-travel/action-ledger/schema"
import {
  createOwnedAvailabilitySearchHandlerRegistry,
  type FanOutAvailabilityResult,
} from "@voyant-travel/catalog"
import { createSourceAdapterRegistry } from "@voyant-travel/catalog/booking-engine"
import type { AvailabilityCandidate, SourceAdapter } from "@voyant-travel/catalog-contracts"
import { createDbClient } from "@voyant-travel/db"
import { eventOutboxTable } from "@voyant-travel/db/schema"
import { cleanupTestDb } from "@voyant-travel/db/test-utils"
import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { and, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import {
  tripCandidates,
  tripEnvelopes,
  tripRequirementSourcingOperations,
  tripRequirements,
} from "../../src/schema.js"
import {
  completedEventId,
  deadLetteredEventId,
  drainTripRequirementSourcing,
  executeDurableTripRequirementSourcingCommand,
  getTripRequirementSourcingOperation,
  requestedEventId,
} from "../../src/service-durable-sourcing.js"
import { createTripRequirementSourcingDeps } from "../../src/sourcing-runtime.js"
import {
  SOURCE_REQUIREMENT_CANDIDATES_HANDLER_POLICY,
  sourceTripRequirementCandidatesTool,
  type TripsToolServices,
} from "../../src/tools.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL
type ClosableTestDb = PostgresJsDatabase & {
  $client: { end(options?: { timeout?: number | null }): Promise<unknown> }
}

describe.skipIf(!DB_AVAILABLE)("Trips durable requirement sourcing", () => {
  let db: ClosableTestDb

  beforeAll(() => {
    db = createDbClient(process.env.TEST_DATABASE_URL as string, {
      adapter: "node",
      nodeMaxConnections: 4,
      timeouts: { statementMs: false, queryMs: false, connectMs: false },
    }) as ClosableTestDb
  })
  // This suite runs late in the shared integration lane. Truncating the full
  // package-union schema can exceed Vitest's 10-second hook default once the
  // preceding suites have populated it.
  beforeEach(() => cleanupTestDb(db), 30_000)
  afterAll(async () => {
    await db.$client.end({ timeout: 0 })
  })

  it("atomically accepts one command, serializes concurrency, and replays exactly", async () => {
    const requirement = await seedRequirementWithCandidate()
    const command = sourcingCommand(requirement.id, "source-command-1")
    let releasePrepare: () => void = () => undefined
    const holdPrepare = new Promise<void>((resolve) => {
      releasePrepare = resolve
    })
    let prepared: () => void = () => undefined
    const preparedSignal = new Promise<void>((resolve) => {
      prepared = resolve
    })
    const firstPromise = executeCommand({
      ...command,
      testHooks: {
        async afterPrepare() {
          prepared()
          await holdPrepare
        },
      },
    })
    await preparedSignal
    let replaySettled = false
    const replayPromise = executeCommand(command).finally(() => {
      replaySettled = true
    })
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(replaySettled).toBe(false)
    releasePrepare()

    const [first, concurrentReplay] = await Promise.all([firstPromise, replayPromise])
    expect(first.replayed).toBe(false)
    expect(concurrentReplay).toEqual({ ...first, replayed: true })
    expect(first.value).toEqual({
      status: "accepted",
      operationId: expect.any(String),
      requirementId: requirement.id,
      statusTool: "get_trip_requirement_sourcing_operation",
    })
    const pending = await getTripRequirementSourcingOperation(db, {
      operationId: first.value.operationId,
      requirementId: requirement.id,
      organizationId: "tenant_1",
    })
    expect(pending).toMatchObject({
      status: "pending",
      result: first.value,
      outcome: null,
      error: null,
      attempts: 0,
    })
    expect(
      await getTripRequirementSourcingOperation(db, {
        operationId: first.value.operationId,
        requirementId: requirement.id,
        organizationId: "tenant_2",
      }),
    ).toBeNull()
    expect(
      await getTripRequirementSourcingOperation(db, {
        operationId: first.value.operationId,
        requirementId: otherRequirementId(requirement.id),
        organizationId: "tenant_1",
      }),
    ).toBeNull()
    expect(
      await getTripRequirementSourcingOperation(db, {
        operationId: first.value.operationId,
        requirementId: requirement.id,
        organizationId: null,
      }),
    ).toBeNull()

    const exactReplay = await executeCommand(command)
    expect(exactReplay).toEqual({ ...first, replayed: true })
    await expect(
      executeCommand({
        ...command,
        input: { ...command.input, limit: 99 },
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      cause: { name: "ActionLedgerIdempotencyConflictError" },
    })

    const other = await seedRequirement()
    await expect(
      executeCommand({
        ...command,
        input: { ...command.input, requirementId: other.id },
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      cause: { name: "ActionLedgerIdempotencyConflictError" },
    })
    await expect(
      executeCommand({
        ...command,
        context: { ...command.context, organizationId: "tenant_2" },
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      cause: {
        message: `Trip requirement ${requirement.id} already has an active sourcing operation`,
      },
    })

    expect(await db.select().from(tripRequirementSourcingOperations)).toHaveLength(1)
    expect(await liveCandidates(requirement.id)).toHaveLength(1)
    expect(await requirementStatus(requirement.id)).toBe("sourcing")
    const outbox = await db.select().from(eventOutboxTable)
    expect(outbox).toContainEqual(
      expect.objectContaining({
        eventId: requestedEventId(first.value.operationId),
        name: "trip.requirement-sourcing-requested",
      }),
    )
  })

  it("replaces candidates only on successful fenced settlement and keeps replay immutable", async () => {
    const requirement = await seedRequirementWithCandidate()
    const command = sourcingCommand(requirement.id, "source-command-complete")
    const accepted = await executeCommand(command)
    const search = vi.fn(async () => sourcedResult("new-candidate"))
    const drained = await drainTripRequirementSourcing(db, { search })

    expect(drained).toEqual({
      claimed: 1,
      completed: 1,
      retried: 0,
      deadLettered: 0,
      leaseLost: 0,
    })
    expect(search).toHaveBeenCalledOnce()
    expect(await requirementStatus(requirement.id)).toBe("candidates_ready")
    expect(await liveCandidates(requirement.id)).toEqual([
      expect.objectContaining({
        candidateRef: "new-candidate",
        status: "ranked",
        rank: 0,
      }),
    ])
    const allCandidates = await db
      .select()
      .from(tripCandidates)
      .where(eq(tripCandidates.requirementId, requirement.id))
    expect(allCandidates).toContainEqual(
      expect.objectContaining({ candidateRef: "old-candidate", status: "discarded" }),
    )
    expect(await executeCommand(command)).toEqual({
      ...accepted,
      replayed: true,
    })
    const operation = await operationById(accepted.value.operationId)
    expect(operation).toMatchObject({
      status: "completed",
      resultSnapshot: accepted.value,
      outcomeSnapshot: {
        status: "completed",
        candidateCount: 1,
        requirementStatus: "candidates_ready",
      },
      attempts: 1,
    })
    expect(
      await getTripRequirementSourcingOperation(db, {
        operationId: accepted.value.operationId,
        requirementId: requirement.id,
        organizationId: "tenant_1",
      }),
    ).toMatchObject({
      status: "completed",
      result: accepted.value,
      outcome: {
        status: "completed",
        candidateCount: 1,
        requirementStatus: "candidates_ready",
      },
      error: null,
    })
    expect(await eventIds()).toContain(completedEventId(accepted.value.operationId))
  })

  it("retains existing candidates through retry and dead-letter recovery", async () => {
    const requirement = await seedRequirementWithCandidate()
    const accepted = await executeCommand(sourcingCommand(requirement.id, "source-command-failure"))
    await db
      .update(tripRequirementSourcingOperations)
      .set({ maxAttempts: 1 })
      .where(eq(tripRequirementSourcingOperations.id, accepted.value.operationId))

    const drained = await drainTripRequirementSourcing(
      db,
      {
        search: async () => {
          throw new Error("provider fan-out unavailable")
        },
      },
      { retryBaseMs: 0 },
    )
    expect(drained.deadLettered).toBe(1)
    expect(await liveCandidates(requirement.id)).toEqual([
      expect.objectContaining({ candidateRef: "old-candidate", status: "ranked" }),
    ])
    expect(await requirementStatus(requirement.id)).toBe("candidates_ready")
    expect(await operationById(accepted.value.operationId)).toMatchObject({
      status: "dead_letter",
      lastError: "provider fan-out unavailable",
      outcomeSnapshot: {
        status: "dead_letter",
        error: "provider fan-out unavailable",
      },
    })
    expect(
      await getTripRequirementSourcingOperation(db, {
        operationId: accepted.value.operationId,
        requirementId: requirement.id,
        organizationId: "tenant_1",
      }),
    ).toMatchObject({
      status: "dead_letter",
      result: accepted.value,
      outcome: {
        status: "dead_letter",
        error: "provider fan-out unavailable",
      },
      error: "provider fan-out unavailable",
    })
    expect(await eventIds()).toContain(deadLetteredEventId(accepted.value.operationId))
  })

  it("treats an all-failed fan-out as retryable and never publishes no-availability", async () => {
    const requirement = await seedRequirementWithCandidate()
    const accepted = await executeCommand(
      sourcingCommand(requirement.id, "source-command-all-failed"),
    )
    const result = await drainTripRequirementSourcing(
      db,
      {
        search: async () => ({
          candidates: [],
          perConnection: [
            {
              source: "provider-1",
              kind: "sourced",
              status: "timeout",
              count: 0,
              latencyMs: 5_000,
            },
          ],
        }),
      },
      { retryBaseMs: 0 },
    )
    expect(result.retried).toBe(1)
    expect(await liveCandidates(requirement.id)).toHaveLength(1)
    expect(await operationById(accepted.value.operationId)).toMatchObject({
      status: "retry",
      attempts: 1,
    })
    expect(
      await getTripRequirementSourcingOperation(db, {
        operationId: accepted.value.operationId,
        requirementId: requirement.id,
        organizationId: "tenant_1",
      }),
    ).toMatchObject({
      status: "retry",
      result: accepted.value,
      outcome: null,
      error: expect.stringContaining("existing candidates were retained"),
      attempts: 1,
    })
  })

  it("sources and settles candidates in an owned-only deployment", async () => {
    const requirement = await seedRequirementWithCandidate()
    await executeCommand(sourcingCommand(requirement.id, "source-command-owned-only"))
    const sourced = createSourceAdapterRegistry()
    const owned = createOwnedAvailabilitySearchHandlerRegistry()
    const ownedSearch = vi.fn(async () => ({
      status: "ok" as const,
      candidates: [availabilityCandidate("owned-only", "120.00")],
    }))
    owned.register({
      entityModule: "accommodations",
      searchAvailability: ownedSearch,
    })

    const result = await drainTripRequirementSourcing(
      db,
      createTripRequirementSourcingDeps(sourced, owned, db),
    )

    expect(result.completed).toBe(1)
    expect(ownedSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterContext: expect.objectContaining({ connection_id: "accommodations" }),
      }),
      expect.any(Object),
    )
    expect(await liveCandidates(requirement.id)).toEqual([
      expect.objectContaining({
        candidateRef: "owned-only",
        sourceKind: "owned",
        sourceModule: "accommodations",
        rank: 0,
      }),
    ])
  })

  it("deterministically merges owned and sourced candidates in one settlement", async () => {
    const requirement = await seedRequirementWithCandidate()
    await executeCommand(sourcingCommand(requirement.id, "source-command-mixed"))
    const sourced = createSourceAdapterRegistry()
    sourced.register(
      "connection-z",
      availabilityAdapter([availabilityCandidate("sourced", "220.00")]),
    )
    const owned = createOwnedAvailabilitySearchHandlerRegistry()
    owned.register({
      entityModule: "accommodations",
      async searchAvailability() {
        return {
          status: "ok",
          candidates: [availabilityCandidate("owned", "110.00")],
        }
      },
    })

    const result = await drainTripRequirementSourcing(
      db,
      createTripRequirementSourcingDeps(sourced, owned, db),
    )

    expect(result.completed).toBe(1)
    expect(await liveCandidates(requirement.id)).toEqual([
      expect.objectContaining({ candidateRef: "owned", sourceKind: "owned", rank: 0 }),
      expect.objectContaining({
        candidateRef: "sourced",
        sourceKind: "sourced",
        sourceConnectionId: "connection-z",
        rank: 1,
      }),
    ])
  })

  it("rolls back candidate replacement and retries when settlement crashes", async () => {
    const requirement = await seedRequirementWithCandidate()
    const accepted = await executeCommand(
      sourcingCommand(requirement.id, "source-command-settle-crash"),
    )
    const search = vi.fn(async () => sourcedResult("safe-retry"))
    const first = await drainTripRequirementSourcing(
      db,
      { search },
      {
        retryBaseMs: 0,
        testHooks: {
          async beforeCompletionEvent() {
            throw new Error("injected settlement crash")
          },
        },
      },
    )
    expect(first.retried).toBe(1)
    expect(await liveCandidates(requirement.id)).toEqual([
      expect.objectContaining({ candidateRef: "old-candidate", status: "ranked" }),
    ])
    expect(await eventIds()).not.toContain(completedEventId(accepted.value.operationId))

    const second = await drainTripRequirementSourcing(
      db,
      { search },
      { now: new Date(Date.now() + 1), retryBaseMs: 0 },
    )
    expect(second.completed).toBe(1)
    expect(search).toHaveBeenCalledTimes(2)
    expect(await liveCandidates(requirement.id)).toEqual([
      expect.objectContaining({ candidateRef: "safe-retry", status: "ranked" }),
    ])
  })

  it("fences an expired worker lease after a replacement worker settles", async () => {
    const requirement = await seedRequirementWithCandidate()
    await executeCommand(sourcingCommand(requirement.id, "source-command-fence"))
    const startedAt = workerNow()
    let releaseFirst: () => void = () => undefined
    const holdFirst = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    let firstStarted: () => void = () => undefined
    const firstSignal = new Promise<void>((resolve) => {
      firstStarted = resolve
    })
    let calls = 0
    const search = async (): Promise<FanOutAvailabilityResult> => {
      calls += 1
      return sourcedResult(calls === 1 ? "stale-worker" : "replacement-worker")
    }

    const stale = drainTripRequirementSourcing(
      db,
      { search },
      {
        now: startedAt,
        visibilityTimeoutMs: 1,
        testHooks: {
          async afterSearch() {
            firstStarted()
            await holdFirst
          },
        },
      },
    )
    await firstSignal
    const replacementDrain = drainTripRequirementSourcing(
      db,
      { search },
      { now: new Date(startedAt.getTime() + 2), visibilityTimeoutMs: 60_000 },
    )
    let timeout: ReturnType<typeof setTimeout> | undefined
    let replacement: Awaited<typeof replacementDrain>
    try {
      replacement = await Promise.race([
        replacementDrain,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("replacement worker did not settle before stale release")),
            5_000,
          )
        }),
      ])
    } finally {
      if (timeout) clearTimeout(timeout)
      releaseFirst()
    }
    expect(replacement.completed).toBe(1)
    expect((await stale).leaseLost).toBe(1)
    expect(await liveCandidates(requirement.id)).toEqual([
      expect.objectContaining({ candidateRef: "replacement-worker", status: "ranked" }),
    ])
  }, 30_000)

  it("dead-letters an abandoned final-attempt lease without calling providers again", async () => {
    const requirement = await seedRequirementWithCandidate()
    const accepted = await executeCommand(
      sourcingCommand(requirement.id, "source-command-abandoned-final"),
    )
    const now = new Date("2026-07-24T12:00:00.000Z")
    await db
      .update(tripRequirementSourcingOperations)
      .set({
        status: "processing",
        attempts: 8,
        maxAttempts: 8,
        leaseVersion: 8,
        leaseExpiresAt: new Date(now.getTime() - 1),
      })
      .where(eq(tripRequirementSourcingOperations.id, accepted.value.operationId))
    const search = vi.fn(async () => sourcedResult("must-not-run"))

    const result = await drainTripRequirementSourcing(db, { search }, { now })

    expect(result).toEqual({
      claimed: 0,
      completed: 0,
      retried: 0,
      deadLettered: 1,
      leaseLost: 0,
    })
    expect(search).not.toHaveBeenCalled()
    expect(await requirementStatus(requirement.id)).toBe("candidates_ready")
    expect(await liveCandidates(requirement.id)).toEqual([
      expect.objectContaining({ candidateRef: "old-candidate", status: "ranked" }),
    ])
    expect(await eventIds()).toContain(deadLetteredEventId(accepted.value.operationId))
  })

  it("rolls back claim, operation, status, and requested event on prepare failure", async () => {
    const requirement = await seedRequirementWithCandidate()
    const command = sourcingCommand(requirement.id, "source-command-rollback")
    await expect(
      executeCommand({
        ...command,
        testHooks: {
          async afterPrepare() {
            throw new Error("injected prepare crash")
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      cause: { message: "injected prepare crash" },
    })

    expect(await db.select().from(tripRequirementSourcingOperations)).toHaveLength(0)
    expect(
      await db
        .select()
        .from(actionLedgerEntries)
        .where(eq(actionLedgerEntries.idempotencyKey, "source-command-rollback")),
    ).toHaveLength(0)
    expect(await eventIds()).toEqual([])
    expect(await requirementStatus(requirement.id)).toBe("candidates_ready")
  })

  async function seedRequirement() {
    const [envelope] = await db.insert(tripEnvelopes).values({ title: "Durable trip" }).returning()
    if (!envelope) throw new Error("failed to seed trip envelope")
    const [requirement] = await db
      .insert(tripRequirements)
      .values({
        envelopeId: envelope.id,
        status: "candidates_ready",
        vertical: "accommodations",
        criteria: { nights: 3, city: "CAI" },
        criteriaVersion: "v1",
      })
      .returning()
    if (!requirement) throw new Error("failed to seed trip requirement")
    return requirement
  }

  async function seedRequirementWithCandidate() {
    const requirement = await seedRequirement()
    await db.insert(tripCandidates).values({
      requirementId: requirement.id,
      envelopeId: requirement.envelopeId,
      rank: 0,
      status: "ranked",
      candidateRef: "old-candidate",
      entityModule: "accommodations",
      entityId: "hotel_old",
      sourceKind: "sourced",
      sourceConnectionId: "provider-1",
      selection: { room: "double" },
      priceCurrency: "EUR",
      priceAmount: "500.00",
    })
    return requirement
  }

  async function executeCommand(
    command: Parameters<typeof executeDurableTripRequirementSourcingCommand>[0],
  ) {
    const registry = createToolRegistry()
    registry.register(sourceTripRequirementCandidatesTool, {
      actionPolicy: SOURCE_REQUIREMENT_CANDIDATES_HANDLER_POLICY.actionPolicy,
    })
    let execution:
      | Awaited<ReturnType<typeof executeDurableTripRequirementSourcingCommand>>
      | undefined
    await registry.dispatch(sourceTripRequirementCandidatesTool.name, command.input, {
      db: command.db,
      actor: command.context.actor,
      audience: command.context.actor,
      tenantId: command.context.organizationId,
      organizationId: command.context.organizationId,
      resolverScope: command.input.scope,
      handlerActionPolicy: command.admitted,
      trips: {
        async acceptRequirementCandidateSourcing(_input, admitted) {
          execution = await executeDurableTripRequirementSourcingCommand({
            ...command,
            admitted,
          })
          return execution.value
        },
      } as TripsToolServices,
    } satisfies ToolContext & { trips: TripsToolServices })
    if (!execution) throw new Error("Trips Tool did not execute its durable sourcing service")
    return execution
  }

  function sourcingCommand(requirementId: string, idempotencyKey: string) {
    return {
      db,
      context: {
        userId: "user_1",
        callerType: "session" as const,
        actor: "staff" as const,
        organizationId: "tenant_1",
      },
      admitted: {
        ...SOURCE_REQUIREMENT_CANDIDATES_HANDLER_POLICY,
        actionPolicy: {
          ...SOURCE_REQUIREMENT_CANDIDATES_HANDLER_POLICY.actionPolicy,
          enforcement: "handler" as const,
          invocation: {
            controlField: "_voyant" as const,
            requiredFields: ["idempotencyKey"] as const,
            optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"] as const,
            fingerprintAlgorithm: "action-ledger-command-v1" as const,
          },
        },
        invocation: { idempotencyKey },
      },
      input: {
        requirementId,
        scope: {
          locale: "en-GB",
          audience: "staff" as const,
          market: "RO",
          currency: "EUR",
        },
        limit: 10,
      },
    }
  }

  function sourcedResult(candidateRef: string): FanOutAvailabilityResult {
    return {
      candidates: [
        {
          candidateRef,
          entity_module: "accommodations",
          entity_id: `hotel_${candidateRef}`,
          source: { kind: "sourced", connectionId: "provider-1" },
          selection: { room: "double" },
          price: { currency: "EUR", amount: "450.00" },
          expiresAt: new Date("2026-07-25T10:00:00.000Z"),
          providerData: { net: "300.00" },
        },
      ],
      perConnection: [
        {
          source: "provider-1",
          kind: "sourced",
          status: "ok",
          count: 1,
          latencyMs: 5,
        },
      ],
    }
  }

  function availabilityCandidate(candidateRef: string, amount: string): AvailabilityCandidate {
    return {
      candidateRef,
      entity_module: "accommodations",
      entity_id: `hotel_${candidateRef}`,
      selection: { room: "double" },
      price: { currency: "EUR", amount },
    }
  }

  function availabilityAdapter(candidates: AvailabilityCandidate[]): SourceAdapter {
    return {
      kind: "test",
      capabilities: {
        verticals: ["accommodations"],
        supportsLiveResolution: true,
        supportsAvailabilitySearch: true,
        supportsDriftDetection: false,
        supportsBookingForwarding: false,
        postBookOperations: [],
      },
      async searchAvailability() {
        return { status: "ok", candidates }
      },
    }
  }

  function otherRequirementId(requirementId: string): string {
    return `${requirementId}_other`
  }

  async function liveCandidates(requirementId: string) {
    return db
      .select()
      .from(tripCandidates)
      .where(
        and(eq(tripCandidates.requirementId, requirementId), eq(tripCandidates.status, "ranked")),
      )
  }

  async function requirementStatus(requirementId: string) {
    const [requirement] = await db
      .select({ status: tripRequirements.status })
      .from(tripRequirements)
      .where(eq(tripRequirements.id, requirementId))
    return requirement?.status
  }

  async function operationById(id: string) {
    const [operation] = await db
      .select()
      .from(tripRequirementSourcingOperations)
      .where(eq(tripRequirementSourcingOperations.id, id))
    return operation
  }

  async function eventIds() {
    return (await db.select({ id: eventOutboxTable.eventId }).from(eventOutboxTable)).map(
      ({ id }) => id,
    )
  }

  function workerNow(offsetMs = 0) {
    return new Date(Date.now() + 60_000 + offsetMs)
  }
})
