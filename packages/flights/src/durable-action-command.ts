// agent-quality: file-size exception -- owner: flights; admission, durable intent, leases, provider reconciliation, and settlement form one protocol.
import {
  type ActionLedgerRequestContextValues,
  type AdmittedExistingTargetCommand,
  type ExistingTargetCommandPayload,
  executeAdmittedExistingTargetCommand,
} from "@voyant-travel/action-ledger"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import {
  flightCancelResponseSchema,
  flightGetOrderResponseSchema,
} from "@voyant-travel/flights-contracts/contract/schemas"
import type { ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  assertDurableFlightActionResult,
  type DurableFlightActionCapability,
  type DurableFlightActionCommand,
  type DurableFlightActionKind,
  type DurableFlightActionResult,
  type DurableFlightActionRuntime,
} from "./durable-action-runtime-port.js"
import { flightActionOperations } from "./reference/local-postgres.js"

const DEFAULT_VISIBILITY_TIMEOUT_MS = 2 * 60_000
const DEFAULT_RETRY_BASE_MS = 5_000

type FlightActionOperation = typeof flightActionOperations.$inferSelect

export interface ExecuteDurableFlightActionInput {
  db: AnyDrizzleDb
  context: ActionLedgerRequestContextValues
  admitted: ToolHandlerActionPolicyContext
  action: DurableFlightActionKind
  capability: DurableFlightActionCapability
  input: Readonly<Record<string, unknown>> & { orderId: string }
}

export interface DrainDurableFlightActionOperationsOptions {
  limit?: number
  now?: Date
  visibilityTimeoutMs?: number
  retryBaseMs?: number
}

export interface DrainDurableFlightActionOperationsResult {
  processed: number
  completed: number
  retried: number
  leaseLost: number
}

export interface DurableFlightActionOperationView {
  operationId: string
  action: DurableFlightActionKind
  organizationId: string
  orderId: string
  status: string
  providerOperationId: string | null
  outcome: Readonly<Record<string, unknown>> | null
  error: string | null
  attempts: number
  nextAttemptAt: Date
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Commit the immutable ledger claim and Flights-owned operation intent before
 * crossing the supplier boundary. Request execution uses a fenced lease; a
 * deployment worker can recover any abandoned or failed operation without the
 * original caller retaining its approval envelope.
 */
export async function executeDurableFlightAction(input: ExecuteDurableFlightActionInput) {
  const result = await executeAdmittedExistingTargetCommand(
    {
      db: input.db,
      context: input.context,
      admitted: input.admitted,
      commandInput: input.input,
      evaluatedRisk: "critical",
    },
    {
      prepare: (tx, command, payload) =>
        prepareOperation(
          tx,
          command,
          input.action,
          requiredIdentity(input.capability.backendIdentity),
          payload,
        ),
      execute: (command) => resumeOperation(input.db, input.capability, command),
      replay: (command) => resumeOperation(input.db, input.capability, command),
    },
  )
  return result.value
}

/**
 * Voyant isolates tenants at the deployment boundary (one database, one
 * runtime per organization — see ADR-0001), so this lookup is scoped only by
 * operation id. It does not filter by organization: that would be in-process
 * tenant partitioning, which the framework does not do.
 */
export async function getDurableFlightActionOperation(
  db: AnyDrizzleDb,
  input: { operationId: string },
): Promise<DurableFlightActionOperationView | null> {
  const [operation] = await db
    .select()
    .from(flightActionOperations)
    .where(eq(flightActionOperations.id, input.operationId))
    .limit(1)
  return operation ? operationView(operation) : null
}

/**
 * Recover due ticket/cancel operations. Hosts selecting the durable Flights
 * port MUST schedule this drain so a process crash does not require caller
 * replay. Each provider call is preceded by reconcile and fenced by a lease.
 */
export async function drainDurableFlightActionOperations(
  db: PostgresJsDatabase,
  runtime: DurableFlightActionRuntime,
  options: DrainDurableFlightActionOperationsOptions = {},
): Promise<DrainDurableFlightActionOperationsResult> {
  const now = options.now ?? new Date()
  const visibilityTimeoutMs = options.visibilityTimeoutMs ?? DEFAULT_VISIBILITY_TIMEOUT_MS
  const retryBaseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS
  const claimed = await claimDueOperations(
    db,
    now,
    Math.max(1, Math.min(options.limit ?? 25, 100)),
    visibilityTimeoutMs,
  )
  const totals: DrainDurableFlightActionOperationsResult = {
    processed: claimed.length,
    completed: 0,
    retried: 0,
    leaseLost: 0,
  }
  for (const operation of claimed) {
    const capability = capabilityFor(runtime, operation)
    try {
      await executeClaimedOperation(db, capability, operation)
      totals.completed += 1
    } catch (error) {
      if (await releaseOperationAfterFailure(db, operation, error, now, retryBaseMs)) {
        totals.retried += 1
      } else {
        totals.leaseLost += 1
      }
    }
  }
  return totals
}

async function prepareOperation(
  tx: AnyDrizzleDb,
  command: AdmittedExistingTargetCommand,
  action: DurableFlightActionKind,
  backendIdentity: string,
  payload: ExistingTargetCommandPayload<ExecuteDurableFlightActionInput["input"]>,
): Promise<void> {
  if (command.target.type !== "flight-order" || payload.orderId !== command.target.id) {
    throw new Error("Durable Flights command target does not match its admitted input")
  }
  const organizationId = command.authorization.organizationId
  if (!organizationId?.trim()) {
    throw new Error("Durable Flights supplier actions require an organization tenant")
  }
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`${organizationId}:flight-order:${command.target.id}`}))`,
  )
  const active = await tx
    .select({ id: flightActionOperations.id })
    .from(flightActionOperations)
    .where(
      and(
        eq(flightActionOperations.targetType, command.target.type),
        eq(flightActionOperations.targetId, command.target.id),
        inArray(flightActionOperations.status, ["pending", "processing"]),
      ),
    )
    .limit(1)
  if (active.length > 0) {
    throw new Error(`Flight order ${command.target.id} already has an active supplier mutation`)
  }
  await tx.insert(flightActionOperations).values({
    id: command.causation.claimActionId,
    commandScope: command.idempotency.scope,
    idempotencyKey: command.idempotency.key,
    requestFingerprint: command.idempotency.fingerprint,
    claimActionId: command.causation.claimActionId,
    organizationId,
    targetType: command.target.type,
    targetId: command.target.id,
    kind: action,
    backendIdentity,
    requestSnapshot: payload,
  })
}

async function resumeOperation(
  db: AnyDrizzleDb,
  capability: DurableFlightActionCapability,
  command: AdmittedExistingTargetCommand,
): Promise<Readonly<Record<string, unknown>>> {
  const operation = await loadExactOperation(db, command)
  if (operation.backendIdentity !== requiredIdentity(capability.backendIdentity)) {
    throw new Error(
      `Selected Flights backend changed from "${operation.backendIdentity}" to "${capability.backendIdentity}"`,
    )
  }
  if (operation.status === "completed") return completedOutcome(operation)

  const now = new Date()
  const claimed = await claimOperation(
    db,
    operation,
    now,
    new Date(now.getTime() + DEFAULT_VISIBILITY_TIMEOUT_MS),
  )
  if (!claimed) {
    const current = await loadExactOperation(db, command)
    if (current.status === "completed") return completedOutcome(current)
    throw new Error(`Durable Flights operation ${operation.id} is already being processed`)
  }
  try {
    return await executeClaimedOperation(db, capability, claimed)
  } catch (error) {
    await releaseOperationAfterFailure(db, claimed, error, now, DEFAULT_RETRY_BASE_MS)
    throw error
  }
}

async function executeClaimedOperation(
  db: AnyDrizzleDb,
  capability: DurableFlightActionCapability,
  operation: FlightActionOperation,
): Promise<Readonly<Record<string, unknown>>> {
  if (operation.backendIdentity !== requiredIdentity(capability.backendIdentity)) {
    throw new Error(
      `Selected Flights backend changed from "${operation.backendIdentity}" to "${capability.backendIdentity}"`,
    )
  }
  const providerInput = providerCommand(operation)
  const reconciled = await capability.reconcile(providerInput)
  const providerResult = reconciled ?? (await capability.execute(providerInput))
  assertDurableFlightActionResult(capability, providerInput, providerResult)
  const validatedResult: DurableFlightActionResult = {
    ...providerResult,
    outcome:
      operation.kind === "ticket-order"
        ? flightGetOrderResponseSchema.parse(providerResult.outcome)
        : flightCancelResponseSchema.parse(providerResult.outcome),
  }
  if (!(await settleOperation(db, operation, validatedResult))) {
    const current = await loadOperationById(db, operation.id)
    if (current?.status === "completed") return completedOutcome(current)
    throw new Error(`Durable Flights operation ${operation.id} lost its execution lease`)
  }
  return completedOutcome(await requiredOperationById(db, operation.id))
}

async function claimOperation(
  db: AnyDrizzleDb,
  operation: FlightActionOperation,
  now: Date,
  leaseExpiresAt: Date,
): Promise<FlightActionOperation | null> {
  const [claimed] = await db
    .update(flightActionOperations)
    .set({
      status: "processing",
      attempts: operation.attempts + 1,
      leaseVersion: operation.leaseVersion + 1,
      leaseExpiresAt,
      lastError: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(flightActionOperations.id, operation.id),
        eq(flightActionOperations.leaseVersion, operation.leaseVersion),
        inArray(flightActionOperations.status, ["pending", "processing"]),
        or(
          eq(flightActionOperations.status, "pending"),
          isNull(flightActionOperations.leaseExpiresAt),
          lte(flightActionOperations.leaseExpiresAt, now),
        ),
      ),
    )
    .returning()
  return claimed ?? null
}

async function claimDueOperations(
  db: PostgresJsDatabase,
  now: Date,
  limit: number,
  visibilityTimeoutMs: number,
): Promise<FlightActionOperation[]> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(flightActionOperations)
      .where(
        and(
          inArray(flightActionOperations.status, ["pending", "processing"]),
          lte(flightActionOperations.nextAttemptAt, now),
          or(
            eq(flightActionOperations.status, "pending"),
            isNull(flightActionOperations.leaseExpiresAt),
            lte(flightActionOperations.leaseExpiresAt, now),
          ),
        ),
      )
      .orderBy(flightActionOperations.nextAttemptAt, flightActionOperations.createdAt)
      .limit(limit)
      .for("update", { skipLocked: true })
    const claimed: FlightActionOperation[] = []
    for (const operation of due) {
      const row = await claimOperation(
        tx,
        operation,
        now,
        new Date(now.getTime() + visibilityTimeoutMs),
      )
      if (row) claimed.push(row)
    }
    return claimed
  })
}

async function settleOperation(
  db: AnyDrizzleDb,
  operation: FlightActionOperation,
  result: DurableFlightActionResult,
): Promise<boolean> {
  const now = new Date()
  const [updated] = await db
    .update(flightActionOperations)
    .set({
      status: "completed",
      providerOperationId: result.providerOperationId,
      outcomeSnapshot: result.outcome,
      leaseExpiresAt: null,
      lastError: null,
      updatedAt: now,
      completedAt: now,
    })
    .where(leaseFence(operation))
    .returning()
  return !!updated
}

async function releaseOperationAfterFailure(
  db: AnyDrizzleDb,
  operation: FlightActionOperation,
  error: unknown,
  now: Date,
  retryBaseMs: number,
): Promise<boolean> {
  const [updated] = await db
    .update(flightActionOperations)
    .set({
      status: "pending",
      nextAttemptAt: new Date(
        now.getTime() + retryBaseMs * 2 ** Math.min(Math.max(0, operation.attempts - 1), 10),
      ),
      leaseExpiresAt: null,
      lastError: errorText(error),
      updatedAt: now,
    })
    .where(leaseFence(operation))
    .returning()
  return !!updated
}

function leaseFence(operation: FlightActionOperation) {
  return and(
    eq(flightActionOperations.id, operation.id),
    eq(flightActionOperations.status, "processing"),
    eq(flightActionOperations.leaseVersion, operation.leaseVersion),
  )
}

async function loadExactOperation(db: AnyDrizzleDb, command: AdmittedExistingTargetCommand) {
  const [operation] = await db
    .select()
    .from(flightActionOperations)
    .where(
      and(
        eq(flightActionOperations.commandScope, command.idempotency.scope),
        eq(flightActionOperations.idempotencyKey, command.idempotency.key),
      ),
    )
    .limit(1)
  if (
    !operation ||
    operation.requestFingerprint !== command.idempotency.fingerprint ||
    operation.claimActionId !== command.causation.claimActionId ||
    operation.organizationId !== command.authorization.organizationId ||
    operation.targetType !== command.target.type ||
    operation.targetId !== command.target.id
  ) {
    throw new Error("Durable Flights command state is missing or inconsistent")
  }
  return operation
}

async function loadOperationById(
  db: AnyDrizzleDb,
  operationId: string,
): Promise<FlightActionOperation | null> {
  const [operation] = await db
    .select()
    .from(flightActionOperations)
    .where(eq(flightActionOperations.id, operationId))
    .limit(1)
  return operation ?? null
}

async function requiredOperationById(
  db: AnyDrizzleDb,
  operationId: string,
): Promise<FlightActionOperation> {
  const operation = await loadOperationById(db, operationId)
  if (!operation) throw new Error(`Durable Flights operation ${operationId} was not found`)
  return operation
}

function providerCommand(operation: FlightActionOperation): DurableFlightActionCommand {
  if (operation.kind !== "ticket-order" && operation.kind !== "cancel-order") {
    throw new Error(`Durable Flights operation ${operation.id} has an invalid action`)
  }
  if (!operation.organizationId?.trim()) {
    throw new Error(`Durable Flights operation ${operation.id} has no tenant authority`)
  }
  const { orderId: _orderId, ...providerInput } = operation.requestSnapshot
  return {
    operationId: operation.id,
    action: operation.kind,
    organizationId: operation.organizationId,
    idempotencyKey: `${operation.commandScope}:${operation.idempotencyKey}`,
    requestFingerprint: operation.requestFingerprint,
    orderId: operation.targetId,
    input: Object.freeze(providerInput),
  }
}

function capabilityFor(
  runtime: DurableFlightActionRuntime,
  operation: FlightActionOperation,
): DurableFlightActionCapability {
  if (operation.kind === "ticket-order") return runtime.ticket
  if (operation.kind === "cancel-order") return runtime.cancel
  throw new Error(`Durable Flights operation ${operation.id} has an invalid action`)
}

function completedOutcome(operation: FlightActionOperation): Readonly<Record<string, unknown>> {
  if (
    operation.status !== "completed" ||
    !operation.providerOperationId?.trim() ||
    !operation.outcomeSnapshot
  ) {
    throw new Error(`Durable Flights operation ${operation.id} has no immutable outcome`)
  }
  return operation.outcomeSnapshot
}

function operationView(operation: FlightActionOperation): DurableFlightActionOperationView {
  if (!operation.organizationId) {
    throw new Error(`Durable Flights operation ${operation.id} has no tenant authority`)
  }
  return {
    operationId: operation.id,
    action: operation.kind as DurableFlightActionKind,
    organizationId: operation.organizationId,
    orderId: operation.targetId,
    status: operation.status,
    providerOperationId: operation.providerOperationId,
    outcome: operation.outcomeSnapshot,
    error: operation.lastError,
    attempts: operation.attempts,
    nextAttemptAt: operation.nextAttemptAt,
    completedAt: operation.completedAt,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
  }
}

function requiredIdentity(value: string): string {
  if (!value.trim() || value !== value.trim()) {
    throw new Error("Durable Flights provider backend identity must be non-empty and canonical")
  }
  return value
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 2_000) : String(error).slice(0, 2_000)
}
