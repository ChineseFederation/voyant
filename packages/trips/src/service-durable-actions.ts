// agent-quality: file-size exception -- owner: trips; admission, immutable operation state, provider reconciliation, leases, and settlement form one protocol.
import {
  type ActionLedgerRequestContextValues,
  type AdmittedExistingTargetCommand,
  type ExistingTargetCommandPayload,
  executeAdmittedExistingTargetCommand,
} from "@voyant-travel/action-ledger"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { insertOutboxEvents } from "@voyant-travel/db/outbox"
import type { ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import { and, eq, inArray, isNull, lte, or } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  assertDurableTripActionResult,
  type DurableTripActionCapability,
  type DurableTripActionCommand,
  type DurableTripActionKind,
} from "./durable-action-runtime-port.js"
import { type TripActionOperation, tripActionOperations, tripEnvelopes } from "./schema.js"
import { TripsInvariantError } from "./service-types.js"

export const TRIP_ACTION_REQUESTED_EVENT = "trip.action-requested"
export const TRIP_ACTION_COMPLETED_EVENT = "trip.action-completed"
export const TRIP_ACTION_DEAD_LETTERED_EVENT = "trip.action-dead-lettered"
export const TRIP_ACTION_STATUS_TOOL = "get_trip_action_operation" as const

const DEFAULT_VISIBILITY_TIMEOUT_MS = 2 * 60_000
const DEFAULT_RETRY_BASE_MS = 5_000

export interface TripActionAcceptedResult extends Record<string, unknown> {
  status: "accepted"
  operationId: string
  action: DurableTripActionKind
  envelopeId: string
  statusTool: typeof TRIP_ACTION_STATUS_TOOL
}

export type TripActionOutcome =
  | {
      status: "completed"
      backendIdentity: string
      providerOperationId: string
      result: Record<string, unknown>
    }
  | { status: "dead_letter"; error: string }

export interface TripActionOperationView {
  operationId: string
  action: DurableTripActionKind
  envelopeId: string
  status: TripActionOperation["status"]
  result: TripActionAcceptedResult
  outcome: TripActionOutcome | null
  error: string | null
  attempts: number
  maxAttempts: number
  nextAttemptAt: Date
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface ExecuteDurableTripActionInput<TInput extends Record<string, unknown>> {
  db: AnyDrizzleDb
  context: ActionLedgerRequestContextValues
  admitted: ToolHandlerActionPolicyContext
  action: DurableTripActionKind
  backendIdentity: string
  input: TInput
  evaluatedRisk: "high" | "critical"
}

/**
 * Admit one existing Trip command and atomically persist the exact provider
 * identity, immutable request, accepted result, and requested outbox event.
 * Provider code never runs on the request path.
 */
export async function executeDurableTripActionCommand<TInput extends Record<string, unknown>>(
  input: ExecuteDurableTripActionInput<TInput>,
) {
  return executeAdmittedExistingTargetCommand(
    {
      db: input.db,
      context: input.context,
      admitted: input.admitted,
      commandInput: input.input,
      evaluatedRisk: input.evaluatedRisk,
    },
    {
      prepare: (tx, command, payload) =>
        prepareDurableTripAction(
          tx,
          command,
          input.action,
          requiredIdentity(input.backendIdentity),
          payload,
        ),
      execute: (command) => resolveAcceptedResult(input.db, command),
      replay: (command) => resolveAcceptedResult(input.db, command),
    },
  )
}

async function prepareDurableTripAction<TInput extends Record<string, unknown>>(
  tx: AnyDrizzleDb,
  command: AdmittedExistingTargetCommand,
  action: DurableTripActionKind,
  backendIdentity: string,
  input: ExistingTargetCommandPayload<TInput>,
): Promise<void> {
  const [trip] = await tx
    .select({ id: tripEnvelopes.id })
    .from(tripEnvelopes)
    .where(eq(tripEnvelopes.id, command.target.id))
    .for("update")
    .limit(1)
  if (!trip || command.target.type !== "trip") {
    throw new TripsInvariantError(`Trip envelope ${command.target.id} was not found`)
  }
  if (input.envelopeId !== trip.id) {
    throw new TripsInvariantError("Durable Trip command target does not match its input")
  }
  const active = await tx
    .select({ id: tripActionOperations.id })
    .from(tripActionOperations)
    .where(
      and(
        eq(tripActionOperations.targetId, trip.id),
        eq(tripActionOperations.kind, action),
        inArray(tripActionOperations.status, ["pending", "processing", "retry"]),
      ),
    )
    .limit(1)
  if (active.length > 0) {
    throw new TripsInvariantError(`Trip ${trip.id} already has an active ${action} operation`)
  }
  const accepted: TripActionAcceptedResult = {
    status: "accepted",
    operationId: command.causation.claimActionId,
    action,
    envelopeId: trip.id,
    statusTool: TRIP_ACTION_STATUS_TOOL,
  }
  await tx.insert(tripActionOperations).values({
    id: command.causation.claimActionId,
    commandScope: command.idempotency.scope,
    idempotencyKey: command.idempotency.key,
    requestFingerprint: command.idempotency.fingerprint,
    claimActionId: command.causation.claimActionId,
    organizationId: command.authorization.organizationId,
    targetType: command.target.type,
    targetId: command.target.id,
    kind: action,
    backendIdentity,
    requestSnapshot: input,
    resultSnapshot: accepted,
  })
  await insertOutboxEvents(tx, [
    {
      name: TRIP_ACTION_REQUESTED_EVENT,
      data: {
        operationId: command.causation.claimActionId,
        action,
        envelopeId: trip.id,
        backendIdentity,
      },
      metadata: {
        category: "domain",
        source: "service",
        eventId: `${TRIP_ACTION_REQUESTED_EVENT}:${command.causation.claimActionId}`,
        correlationId: command.causation.claimActionId,
      },
    },
  ])
}

async function resolveAcceptedResult(
  db: AnyDrizzleDb,
  command: AdmittedExistingTargetCommand,
): Promise<TripActionAcceptedResult> {
  const [operation] = await db
    .select()
    .from(tripActionOperations)
    .where(
      and(
        eq(tripActionOperations.commandScope, command.idempotency.scope),
        eq(tripActionOperations.idempotencyKey, command.idempotency.key),
      ),
    )
    .limit(1)
  if (
    !operation ||
    operation.requestFingerprint !== command.idempotency.fingerprint ||
    operation.claimActionId !== command.causation.claimActionId ||
    operation.targetId !== command.target.id ||
    operation.organizationId !== command.authorization.organizationId
  ) {
    throw new TripsInvariantError("Durable Trip command state is missing or inconsistent")
  }
  return operation.resultSnapshot as TripActionAcceptedResult
}

export async function getTripActionOperation(
  db: AnyDrizzleDb,
  input: { operationId: string; envelopeId: string; organizationId: string | null },
): Promise<TripActionOperationView | null> {
  const [operation] = await db
    .select()
    .from(tripActionOperations)
    .where(
      and(
        eq(tripActionOperations.id, input.operationId),
        eq(tripActionOperations.targetId, input.envelopeId),
        input.organizationId === null
          ? isNull(tripActionOperations.organizationId)
          : eq(tripActionOperations.organizationId, input.organizationId),
      ),
    )
    .limit(1)
  return operation ? operationView(operation) : null
}

export interface DrainTripActionOperationsOptions {
  limit?: number
  now?: Date
  visibilityTimeoutMs?: number
  retryBaseMs?: number
}

export interface DrainTripActionOperationsResult {
  processed: number
  completed: number
  retried: number
  deadLettered: number
  leaseLost: number
}

export async function hasRecoverableTripActionOperations(db: PostgresJsDatabase): Promise<boolean> {
  const rows = await db
    .select({ id: tripActionOperations.id })
    .from(tripActionOperations)
    .where(inArray(tripActionOperations.status, ["pending", "processing", "retry"]))
    .limit(1)
  return rows.length > 0
}

/** Reconcile or execute due operations using the exact attested backend. */
export async function drainTripActionOperations(
  db: PostgresJsDatabase,
  capabilities: {
    price: DurableTripActionCapability
    reserve: DurableTripActionCapability
  },
  options: DrainTripActionOperationsOptions = {},
): Promise<DrainTripActionOperationsResult> {
  const now = options.now ?? new Date()
  const limit = Math.max(1, Math.min(options.limit ?? 25, 100))
  const visibilityTimeoutMs = options.visibilityTimeoutMs ?? DEFAULT_VISIBILITY_TIMEOUT_MS
  const retryBaseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS
  const claimed = await claimDueOperations(db, now, limit, visibilityTimeoutMs)
  const totals: DrainTripActionOperationsResult = {
    processed: claimed.length,
    completed: 0,
    retried: 0,
    deadLettered: 0,
    leaseLost: 0,
  }
  for (const operation of claimed) {
    const capability = operation.kind === "price-trip" ? capabilities.price : capabilities.reserve
    try {
      if (capability.backendIdentity !== operation.backendIdentity) {
        throw new Error(
          `selected Trips backend changed from "${operation.backendIdentity}" to "${capability.backendIdentity}"`,
        )
      }
      const command = providerCommand(operation)
      const reconciled = await capability.reconcile(command)
      const result = reconciled ?? (await capability.execute(command))
      assertDurableTripActionResult(capability, command, result)
      if (await completeOperation(db, operation, result, now)) totals.completed += 1
      else totals.leaseLost += 1
    } catch (error) {
      const exhausted = operation.attempts >= operation.maxAttempts
      if (await failOperation(db, operation, errorText(error), exhausted, now, retryBaseMs)) {
        if (exhausted) totals.deadLettered += 1
        else totals.retried += 1
      } else {
        totals.leaseLost += 1
      }
    }
  }
  return totals
}

async function claimDueOperations(
  db: PostgresJsDatabase,
  now: Date,
  limit: number,
  visibilityTimeoutMs: number,
): Promise<TripActionOperation[]> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(tripActionOperations)
      .where(
        and(
          inArray(tripActionOperations.status, ["pending", "retry", "processing"]),
          lte(tripActionOperations.nextAttemptAt, now),
          or(
            isNull(tripActionOperations.leaseExpiresAt),
            lte(tripActionOperations.leaseExpiresAt, now),
          ),
        ),
      )
      .orderBy(tripActionOperations.nextAttemptAt, tripActionOperations.createdAt)
      .limit(limit)
      .for("update", { skipLocked: true })
    const claimed: TripActionOperation[] = []
    for (const operation of due) {
      const [updated] = await tx
        .update(tripActionOperations)
        .set({
          status: "processing",
          attempts: operation.attempts + 1,
          leaseVersion: operation.leaseVersion + 1,
          leaseExpiresAt: new Date(now.getTime() + visibilityTimeoutMs),
          updatedAt: now,
        })
        .where(
          and(
            eq(tripActionOperations.id, operation.id),
            eq(tripActionOperations.leaseVersion, operation.leaseVersion),
          ),
        )
        .returning()
      if (updated) claimed.push(updated)
    }
    return claimed
  })
}

async function completeOperation(
  db: PostgresJsDatabase,
  operation: TripActionOperation,
  result: {
    backendIdentity: string
    providerOperationId: string
    outcome: Readonly<Record<string, unknown>>
  },
  now: Date,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const outcome: TripActionOutcome = {
      status: "completed",
      backendIdentity: result.backendIdentity,
      providerOperationId: result.providerOperationId,
      result: { ...result.outcome },
    }
    const [updated] = await tx
      .update(tripActionOperations)
      .set({
        status: "completed",
        outcomeSnapshot: outcome,
        providerOperationId: result.providerOperationId,
        completedAt: now,
        leaseExpiresAt: null,
        lastError: null,
        updatedAt: now,
      })
      .where(leaseFence(operation))
      .returning({ id: tripActionOperations.id })
    if (!updated) return false
    await insertOutboxEvents(tx, [
      {
        name: TRIP_ACTION_COMPLETED_EVENT,
        data: {
          operationId: operation.id,
          action: operation.kind,
          envelopeId: operation.targetId,
          backendIdentity: result.backendIdentity,
          providerOperationId: result.providerOperationId,
        },
        metadata: {
          category: "domain",
          source: "service",
          eventId: `${TRIP_ACTION_COMPLETED_EVENT}:${operation.id}`,
          correlationId: operation.claimActionId,
        },
      },
    ])
    return true
  })
}

async function failOperation(
  db: PostgresJsDatabase,
  operation: TripActionOperation,
  error: string,
  exhausted: boolean,
  now: Date,
  retryBaseMs: number,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tripActionOperations)
      .set({
        status: exhausted ? "dead_letter" : "retry",
        outcomeSnapshot: exhausted ? { status: "dead_letter", error } : null,
        lastError: error,
        completedAt: exhausted ? now : null,
        leaseExpiresAt: null,
        nextAttemptAt: exhausted
          ? now
          : new Date(now.getTime() + retryBaseMs * 2 ** Math.max(0, operation.attempts - 1)),
        updatedAt: now,
      })
      .where(leaseFence(operation))
      .returning({ id: tripActionOperations.id })
    if (!updated) return false
    if (exhausted) {
      await insertOutboxEvents(tx, [
        {
          name: TRIP_ACTION_DEAD_LETTERED_EVENT,
          data: {
            operationId: operation.id,
            action: operation.kind,
            envelopeId: operation.targetId,
            attempts: operation.attempts,
            error,
          },
          metadata: {
            category: "domain",
            source: "service",
            eventId: `${TRIP_ACTION_DEAD_LETTERED_EVENT}:${operation.id}`,
            correlationId: operation.claimActionId,
          },
        },
      ])
    }
    return true
  })
}

function leaseFence(operation: TripActionOperation) {
  return and(
    eq(tripActionOperations.id, operation.id),
    eq(tripActionOperations.status, "processing"),
    eq(tripActionOperations.leaseVersion, operation.leaseVersion),
  )
}

function providerCommand(operation: TripActionOperation): DurableTripActionCommand {
  return {
    operationId: operation.id,
    action: operation.kind,
    idempotencyKey: operation.idempotencyKey,
    requestFingerprint: operation.requestFingerprint,
    targetId: operation.targetId,
    input: operation.requestSnapshot,
  }
}

function operationView(operation: TripActionOperation): TripActionOperationView {
  return {
    operationId: operation.id,
    action: operation.kind,
    envelopeId: operation.targetId,
    status: operation.status,
    result: operation.resultSnapshot as TripActionAcceptedResult,
    outcome: operation.outcomeSnapshot as TripActionOutcome | null,
    error: operation.lastError,
    attempts: operation.attempts,
    maxAttempts: operation.maxAttempts,
    nextAttemptAt: operation.nextAttemptAt,
    completedAt: operation.completedAt,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
  }
}

function requiredIdentity(value: string): string {
  const identity = value.trim()
  if (!identity) throw new TypeError("Durable Trips provider identity is required")
  return identity
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 2_000) : String(error).slice(0, 2_000)
}
