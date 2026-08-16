import type { EventBus, EventEnvelope, EventMetadata, OutboxEventStore } from "@voyant-travel/core"
import { generateEventId } from "@voyant-travel/core"
import { eq, sql } from "drizzle-orm"

import { EVENT_DEAD_LETTERED, type EventDeadLetteredEvent } from "./outbox-events.js"
import {
  type EventOutboxRow,
  eventOutboxTable,
  type OutboxAttemptError,
} from "./schema/infra/event_outbox.js"
import type { DrizzleClient } from "./types.js"

// biome-ignore lint/suspicious/noExplicitAny: Drizzle generic inference breaks across client flavors — casts isolated to the query-builder boundary (same pattern as crud.ts) -- owner: db; existing suppression is intentional pending typed cleanup.
type AnyDb = any

/** Base delay before the first retry; doubles per attempt. */
const BACKOFF_BASE_MS = 5_000
/** Retry delay ceiling. */
const BACKOFF_CAP_MS = 15 * 60 * 1000

export interface DrainOutboxOptions {
  /** Max rows claimed per batch. Default 25. */
  limit?: number
  /** Max deliveries in flight at once. Default 5. */
  concurrency?: number
  /** Hard cap on claimed rows per invocation. Default 250. */
  maxEvents?: number
  /** Hard cap on claimed batches per invocation. Default 10. */
  maxBatches?: number
  /** Wall-clock budget for one invocation. Default 30s. */
  timeBudgetMs?: number
  /** Stop claiming this long before the wall-clock budget. Default 2s. */
  budgetReserveMs?: number
  /**
   * How long a claimed row stays invisible to other drains. Must exceed
   * the worst-case delivery time of one event (all subscribers, each
   * bounded by the bus's per-handler timeout). A crashed claimer's rows
   * simply become due again after this window. Default 120s.
   */
  visibilityTimeoutMs?: number
}

export interface DrainOutboxResult {
  claimed: number
  delivered: number
  /**
   * Rows delivered to nobody — no subscriber was registered for the event.
   *
   * Counted within `delivered`, because there is nothing to retry: another
   * attempt cannot summon a subscriber. Counted separately because it is not
   * the same thing as being handled, and reporting only `delivered` is how an
   * event type nobody consumes keeps a clean record indefinitely
   * (voyant#4640).
   */
  unconsumed: number
  retried: number
  /** Failures that were a subscriber timeout rather than a throw. */
  timedOut: number
  deadLettered: number
  batches: number
  durationMs: number
  budgetExhausted: boolean
  /**
   * The distinct event names behind `unconsumed`, so the count names the
   * events rather than only sizing the silence. Bounded by the event types in
   * one drain, not by row count.
   *
   * voyant#4634: a checked-in tenant outbox showed
   * `booking.contract_document.requested` delivered with 0 errors while
   * nothing in the repository subscribed to it. The per-row warning names it
   * in the log; this puts the same names on the drain's own result, which is
   * what the drain job reports.
   */
  unconsumedEventTypes: string[]
}

export {
  EVENT_DEAD_LETTERED,
  type EventDeadLetteredEvent,
} from "./outbox-events.js"

/** Minimal delivery surface needed by the durable outbox drain. */
export type OutboxEventDelivery = Pick<EventBus, "deliver"> & Partial<Pick<EventBus, "emit">>

/**
 * Postgres-backed {@link OutboxEventStore} for `createEventBus`'s durable
 * emit path. `getDb` is called per operation so the store can be bound
 * to a per-request client (Workers) or a long-lived one (Node).
 */
export function createOutboxEventStore(getDb: () => DrizzleClient): OutboxEventStore {
  return {
    async insert(envelope) {
      const rows = (await insertOutboxEvents(getDb(), [envelope])) as EventOutboxRow[]
      const row = rows[0]
      return row ? { id: row.id } : null
    },
    async complete(id) {
      await completeOutboxEvent(getDb(), id)
    },
    async fail(id, error) {
      await failOutboxEvent(getDb(), id, error)
    },
  }
}

/**
 * Persist envelopes as pending outbox rows. Pass a transaction handle to
 * capture events atomically with the domain write ("transactional
 * outbox" proper):
 *
 *     await db.transaction(async (tx) => {
 *       await tx.insert(domainRecords).values(...)
 *       await insertOutboxEvents(tx, [{ name: "domain.created", data, metadata }])
 *     })
 *     // post-commit: the drain (or a waitUntil kick) delivers.
 *
 * Duplicate `metadata.eventId`s are skipped (ON CONFLICT DO NOTHING) —
 * re-emits and webhook redeliveries capture once. Envelopes without an
 * eventId get one stamped here.
 */
export async function insertOutboxEvents(
  db: DrizzleClient,
  envelopes: ReadonlyArray<
    Pick<EventEnvelope, "name" | "data"> & { metadata?: EventMetadata; emittedAt?: string }
  >,
): Promise<EventOutboxRow[]> {
  if (envelopes.length === 0) return []
  const values = envelopes.map((envelope) => {
    const metadata: EventMetadata = { ...(envelope.metadata ?? {}) }
    if (typeof metadata.eventId !== "string" || metadata.eventId.length === 0) {
      metadata.eventId = generateEventId()
    }
    return {
      eventId: metadata.eventId as string,
      name: envelope.name,
      payload: envelope.data,
      metadata,
    }
  })
  const rows = await (db as AnyDb)
    .insert(eventOutboxTable)
    .values(values)
    .onConflictDoNothing({ target: eventOutboxTable.eventId })
    .returning()
  return rows as EventOutboxRow[]
}

/** Mark a row delivered. */
export async function completeOutboxEvent(db: DrizzleClient, id: string): Promise<void> {
  await (db as AnyDb)
    .update(eventOutboxTable)
    .set({ status: "delivered", deliveredAt: new Date(), lastError: null })
    .where(eq(eventOutboxTable.id, id))
}

/**
 * How many per-attempt verdicts a row retains. Above `max_attempts` on purpose:
 * the history is a diagnostic, not a queue, and a row whose ceiling was raised
 * should not silently lose its early attempts.
 */
const ATTEMPT_ERROR_HISTORY_LIMIT = 20

export interface OutboxFailureResult {
  /** `null` when no row matched the id. */
  status: "pending" | "failed" | null
  /** Every retained verdict for this row, oldest first, including this one. */
  attemptErrors: OutboxAttemptError[]
}

/**
 * Record a failed delivery: reschedules with exponential backoff
 * (5s · 2^attempts, capped at 15min, ±20% jitter) or dead-letters as
 * `failed` once `max_attempts` is exhausted. Single statement — safe on
 * neon-http.
 *
 * Appends this attempt's verdict to `attempt_errors` as well as overwriting
 * `last_error`. The single column was enough while every retry failed for the
 * same reason; it is not enough when they do not, and "did the first attempt
 * fail for the reason the eighth reports?" is the first question asked of a
 * captured payment that never became a Booking (voyant#4692).
 */
export async function failOutboxEvent(
  db: DrizzleClient,
  id: string,
  error: string,
  options: { permanent?: boolean } = {},
): Promise<OutboxFailureResult> {
  // Truncate pathological error strings — this is a diagnostic, not a log sink.
  const lastError = error.length > 2000 ? `${error.slice(0, 2000)}…` : error
  // A permanent failure skips the remaining attempts. They would fail
  // identically, and the last one's message is the one that survives in
  // `last_error` — which is how a configuration fault ends up reported as a
  // timeout (voyant#4639).
  const permanent = options.permanent === true
  const history = sql`coalesce("attempt_errors", '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'attempt', "attempts",
    'error', ${lastError}::text,
    'at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ))`
  const rows = (await (db as AnyDb).execute(sql`
    UPDATE ${eventOutboxTable}
    SET
      "last_error" = ${lastError},
      -- One entry is appended per failure, so dropping the oldest one at a time
      -- is exactly enough to hold the window.
      "attempt_errors" = CASE
        WHEN jsonb_array_length(${history}) > ${ATTEMPT_ERROR_HISTORY_LIMIT}
          THEN ${history} - 0
        ELSE ${history}
      END,
      "status" = CASE WHEN ${permanent} OR "attempts" >= "max_attempts" THEN 'failed' ELSE "status" END,
      "next_attempt_at" = CASE
        WHEN ${permanent} OR "attempts" >= "max_attempts" THEN "next_attempt_at"
        ELSE now() + (
          least(${BACKOFF_BASE_MS} * power(2, "attempts"), ${BACKOFF_CAP_MS})
          * (0.8 + random() * 0.4)
        ) * interval '1 millisecond'
      END
    WHERE ${eventOutboxTable.id} = ${id}
    RETURNING "status", "attempt_errors"
  `)) as unknown
  const list = (Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? [])) as Array<{
    status: "pending" | "failed"
    attempt_errors?: OutboxAttemptError[] | null
    attemptErrors?: OutboxAttemptError[] | null
  }>
  const row = list[0]
  return {
    status: row?.status ?? null,
    attemptErrors: row?.attempt_errors ?? row?.attemptErrors ?? [],
  }
}

/**
 * Atomically claim due pending rows: bumps `attempts` and pushes
 * `next_attempt_at` past the visibility timeout so concurrent drains
 * (and a crashed claimer's successor) never double-claim. One statement
 * (`FOR UPDATE SKIP LOCKED` inside the subquery) — safe on neon-http.
 */
export async function claimDueOutboxEvents(
  db: DrizzleClient,
  options: DrainOutboxOptions = {},
): Promise<EventOutboxRow[]> {
  const limit = positiveInteger(options.limit, 25, "limit")
  const visibilityMs = positiveInteger(options.visibilityTimeoutMs, 120_000, "visibilityTimeoutMs")
  const result = (await (db as AnyDb).execute(sql`
    UPDATE ${eventOutboxTable}
    SET
      "attempts" = "attempts" + 1,
      "next_attempt_at" = now() + (${visibilityMs} * interval '1 millisecond')
    WHERE "id" IN (
      SELECT "id" FROM ${eventOutboxTable}
      WHERE "status" = 'pending' AND "next_attempt_at" <= now()
      ORDER BY "next_attempt_at" ASC, "id" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `)) as unknown
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
  return rows.map(normalizeClaimedRow)
}

/**
 * `db.execute` returns snake_case column names (raw SQL bypasses
 * drizzle's column mapping) — normalize to the drizzle row shape.
 */
function normalizeClaimedRow(raw: unknown): EventOutboxRow {
  const row = raw as Record<string, unknown>
  return {
    id: row.id,
    eventId: row.event_id ?? row.eventId,
    name: row.name,
    payload: row.payload,
    metadata: row.metadata,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts ?? row.maxAttempts,
    nextAttemptAt: coerceDate(row.next_attempt_at ?? row.nextAttemptAt),
    lastError: (row.last_error ?? row.lastError ?? null) as string | null,
    attemptErrors: (row.attempt_errors ?? row.attemptErrors ?? null) as OutboxAttemptError[] | null,
    createdAt: coerceDate(row.created_at ?? row.createdAt),
    deliveredAt:
      (row.delivered_at ?? row.deliveredAt) == null
        ? null
        : coerceDate(row.delivered_at ?? row.deliveredAt),
  } as EventOutboxRow
}

function coerceDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value))
}

/** Rebuild the bus envelope from a stored row. */
export function outboxRowToEnvelope(row: EventOutboxRow): EventEnvelope {
  return {
    name: row.name,
    data: row.payload,
    metadata: { ...((row.metadata as EventMetadata | null) ?? {}), eventId: row.eventId },
    emittedAt: row.createdAt.toISOString(),
  }
}

/**
 * Repeatedly claim bounded batches and redeliver them through the bus with
 * bounded concurrency, stopping when no row is due or a work/time budget is
 * reached. Call from a scheduled handler
 * (cron), a `waitUntil` kick after emit, or a long-running Node loop.
 * Safe to run concurrently from multiple isolates (SKIP LOCKED claim).
 */
export async function drainOutbox(
  db: DrizzleClient,
  bus: OutboxEventDelivery,
  options: DrainOutboxOptions = {},
): Promise<DrainOutboxResult> {
  const startedAt = Date.now()
  const batchSize = positiveInteger(options.limit, 25, "limit")
  const concurrency = Math.min(batchSize, positiveInteger(options.concurrency, 5, "concurrency"))
  const maxEvents = positiveInteger(options.maxEvents, 250, "maxEvents")
  const maxBatches = positiveInteger(options.maxBatches, 10, "maxBatches")
  const timeBudgetMs = positiveInteger(options.timeBudgetMs, 30_000, "timeBudgetMs")
  const budgetReserveMs = nonNegativeInteger(options.budgetReserveMs, 2_000, "budgetReserveMs")
  const claimDeadline = startedAt + Math.max(0, timeBudgetMs - budgetReserveMs)
  const result: DrainOutboxResult = {
    claimed: 0,
    delivered: 0,
    unconsumed: 0,
    retried: 0,
    timedOut: 0,
    deadLettered: 0,
    batches: 0,
    durationMs: 0,
    budgetExhausted: false,
    unconsumedEventTypes: [],
  }
  const unconsumedEventTypes = new Set<string>()

  while (result.batches < maxBatches && result.claimed < maxEvents) {
    if (Date.now() >= claimDeadline) {
      result.budgetExhausted = true
      break
    }

    const claimed = await claimDueOutboxEvents(db, {
      limit: Math.min(batchSize, maxEvents - result.claimed),
      visibilityTimeoutMs: options.visibilityTimeoutMs,
    })
    if (claimed.length === 0) break
    result.batches += 1
    result.claimed += claimed.length

    await forEachConcurrent(claimed, concurrency, async (row) => {
      const envelope = outboxRowToEnvelope(row)
      let failedCount = 0
      let errors: string[] = []
      let attempted = -1
      let timedOutCount = 0
      let permanentCount = 0
      try {
        if (bus.deliver) {
          const delivery = await bus.deliver(envelope)
          failedCount = delivery.failed
          errors = delivery.errors
          attempted = delivery.attempted
          timedOutCount = delivery.timedOut ?? 0
          permanentCount = delivery.permanent ?? 0
        } else if (bus.emit) {
          // Third-party bus without failure reporting: emit is
          // fire-and-forget; count as success.
          await bus.emit(envelope.name, envelope.data, envelope.metadata as EventMetadata)
        } else {
          throw new Error("Outbox delivery runtime provides neither deliver() nor emit().")
        }
      } catch (err) {
        failedCount = 1
        errors = [err instanceof Error ? err.message : String(err)]
      }

      if (failedCount === 0) {
        await completeOutboxEvent(db, row.id)
        result.delivered += 1
        if (attempted === 0) {
          result.unconsumed += 1
          unconsumedEventTypes.add(envelope.name)
          console.warn(
            `[outbox] "${envelope.name}" has no subscriber; delivered to nobody (${row.id})`,
          )
        }
        return
      }
      result.timedOut += timedOutCount
      const error = errors.join("; ")
      const { status, attemptErrors } = await failOutboxEvent(db, row.id, error, {
        permanent: permanentCount > 0,
      })
      if (status !== "failed") {
        result.retried += 1
        return
      }
      result.deadLettered += 1
      // Announce the loss. Never for the announcement itself, which would
      // dead-letter in turn and re-announce forever.
      if (envelope.name === EVENT_DEAD_LETTERED) return
      const announcement: EventEnvelope<EventDeadLetteredEvent> = {
        name: EVENT_DEAD_LETTERED,
        data: {
          outboxId: row.id,
          eventId: row.eventId,
          name: envelope.name,
          // The claim already bumped `attempts`, so this is the count
          // including the delivery that just failed.
          attempts: Number(row.attempts ?? 0),
          error,
          // What each attempt decided, not only the last. A subscriber deciding
          // what this loss is worth — the stranded-payment staff alert, above
          // all — needs to know whether the chain failed one way throughout or
          // changed its answer partway (voyant#4692).
          attemptErrors,
          payload: envelope.data,
        },
        metadata: { category: "internal", source: "system", eventId: generateEventId() },
        emittedAt: new Date().toISOString(),
      }
      try {
        // `deliver` first: the drain runtime supplies only that, so announcing
        // through `emit` alone would have been a subscriber nothing ever calls.
        // Delivered rather than emitted on purpose — the announcement must not
        // enter the outbox it is reporting on.
        if (bus.deliver) await bus.deliver(announcement as EventEnvelope)
        else await bus.emit?.(announcement.name, announcement.data, announcement.metadata)
      } catch (err) {
        // The drain's job is the queue, not the announcement. A subscriber that
        // cannot be told must not turn a dead-lettered row into a stuck drain.
        console.error("[outbox] dead-letter announcement failed", err)
      }
    })
  }

  result.budgetExhausted ||=
    result.claimed >= maxEvents || result.batches >= maxBatches || Date.now() >= claimDeadline
  result.unconsumedEventTypes = [...unconsumedEventTypes].sort()
  result.durationMs = Date.now() - startedAt
  return result
}

async function forEachConcurrent<T>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<void>,
): Promise<void> {
  let cursor = 0
  const worker = async () => {
    while (cursor < values.length) {
      const value = values[cursor]
      cursor += 1
      if (value !== undefined) await operation(value)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker))
}

/**
 * Delete delivered rows past the retention window (delivered rows are
 * receipts, not a log sink — long-term archival belongs elsewhere).
 * Dead-lettered (`failed`) rows are NOT pruned: they represent lost
 * deliveries until a human resolves them. Returns the deleted count.
 */
export async function pruneDeliveredOutboxEvents(
  db: DrizzleClient,
  options: { olderThanDays?: number; limit?: number } = {},
): Promise<number> {
  const days = positiveInteger(options.olderThanDays, 14, "olderThanDays")
  const limit = positiveInteger(options.limit, 500, "limit")
  const result = (await (db as AnyDb).execute(sql`
    WITH candidates AS (
      SELECT "id" FROM ${eventOutboxTable}
      WHERE "status" = 'delivered'
        AND "delivered_at" < now() - (${days} * interval '1 day')
      ORDER BY "delivered_at" ASC, "id" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM ${eventOutboxTable}
    WHERE "id" IN (SELECT "id" FROM candidates)
    RETURNING "id"
  `)) as unknown
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
  return rows.length
}

export interface BoundedOutboxStats {
  pending: number
  pendingCapped: boolean
  delivered: number
  deliveredCapped: boolean
  dueNow: number
  dueNowCapped: boolean
  failed: number
  failedCapped: boolean
  oldestPendingAt: Date | null
}

/**
 * Bounded operational snapshot for wake/schedule logs. Counts stop at
 * `scanLimit`; the matching `*Capped` flag means the reported value is a lower
 * bound. Dedicated partial indexes keep every subquery proportional to that
 * limit even when delivered history or pending backlog is large.
 */
export async function getBoundedOutboxStats(
  db: DrizzleClient,
  options: { scanLimit?: number } = {},
): Promise<BoundedOutboxStats> {
  const scanLimit = positiveInteger(options.scanLimit, 10_000, "scanLimit")
  const sampleLimit = scanLimit + 1
  const result = (await (db as AnyDb).execute(sql`
    SELECT
      (SELECT count(*)::int FROM (
        SELECT 1 FROM ${eventOutboxTable}
        WHERE "status" = 'pending'
        ORDER BY "created_at" ASC
        LIMIT ${sampleLimit}
      ) pending_sample) AS pending,
      (SELECT count(*)::int FROM (
        SELECT 1 FROM ${eventOutboxTable}
        WHERE "status" = 'pending' AND "next_attempt_at" <= now()
        ORDER BY "next_attempt_at" ASC, "id" ASC
        LIMIT ${sampleLimit}
      ) due_sample) AS due_now,
      (SELECT count(*)::int FROM (
        SELECT 1 FROM ${eventOutboxTable}
        WHERE "status" = 'failed'
        ORDER BY "created_at" ASC
        LIMIT ${sampleLimit}
      ) failed_sample) AS failed,
      (SELECT count(*)::int FROM (
        SELECT 1 FROM ${eventOutboxTable}
        WHERE "status" = 'delivered'
        ORDER BY "delivered_at" ASC, "id" ASC
        LIMIT ${sampleLimit}
      ) delivered_sample) AS delivered,
      (SELECT "created_at" FROM ${eventOutboxTable}
        WHERE "status" = 'pending'
        ORDER BY "created_at" ASC
        LIMIT 1) AS oldest_pending_at
  `)) as unknown
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
  const row = (rows[0] ?? {}) as Record<string, unknown>
  const pendingSample = Number(row.pending ?? 0)
  const dueSample = Number(row.due_now ?? 0)
  const failedSample = Number(row.failed ?? 0)
  const deliveredSample = Number(row.delivered ?? 0)
  return {
    pending: Math.min(pendingSample, scanLimit),
    pendingCapped: pendingSample > scanLimit,
    delivered: Math.min(deliveredSample, scanLimit),
    deliveredCapped: deliveredSample > scanLimit,
    dueNow: Math.min(dueSample, scanLimit),
    dueNowCapped: dueSample > scanLimit,
    failed: Math.min(failedSample, scanLimit),
    failedCapped: failedSample > scanLimit,
    oldestPendingAt: row.oldest_pending_at == null ? null : coerceDate(row.oldest_pending_at),
  }
}

/**
 * Backward-compatible name for the bounded operational snapshot. Consumers
 * needing an exact historical delivered count should use an offline reporting
 * query rather than adding full-table work to a wake path.
 */
export async function getOutboxStats(
  db: DrizzleClient,
  options: { scanLimit?: number } = {},
): Promise<BoundedOutboxStats> {
  return getBoundedOutboxStats(db, options)
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new RangeError(`${name} must be a positive integer`)
  }
  return resolved
}

function nonNegativeInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new RangeError(`${name} must be a non-negative integer`)
  }
  return resolved
}
