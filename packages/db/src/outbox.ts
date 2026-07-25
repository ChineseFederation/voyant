import type { EventBus, EventEnvelope, EventMetadata, OutboxEventStore } from "@voyant-travel/core"
import { generateEventId } from "@voyant-travel/core"
import { eq, sql } from "drizzle-orm"

import { type EventOutboxRow, eventOutboxTable } from "./schema/infra/event_outbox.js"
import type { DrizzleClient } from "./types.js"

// biome-ignore lint/suspicious/noExplicitAny: Drizzle generic inference breaks across client flavors — casts isolated to the query-builder boundary (same pattern as crud.ts) -- owner: db; existing suppression is intentional pending typed cleanup.
type AnyDb = any

/** Base delay before the first retry; doubles per attempt. */
const BACKOFF_BASE_MS = 5_000
/** Retry delay ceiling. */
const BACKOFF_CAP_MS = 15 * 60 * 1000

export interface DrainOutboxOptions {
  /** Max rows claimed per drain pass. Default 25. */
  limit?: number
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
  retried: number
  deadLettered: number
}

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
 * Record a failed delivery: reschedules with exponential backoff
 * (5s · 2^attempts, capped at 15min, ±20% jitter) or dead-letters as
 * `failed` once `max_attempts` is exhausted. Single statement — safe on
 * neon-http. Returns the resulting status when the row exists.
 */
export async function failOutboxEvent(
  db: DrizzleClient,
  id: string,
  error: string,
): Promise<"pending" | "failed" | null> {
  // Truncate pathological error strings — this is a diagnostic, not a log sink.
  const lastError = error.length > 2000 ? `${error.slice(0, 2000)}…` : error
  const rows = (await (db as AnyDb).execute(sql`
    UPDATE ${eventOutboxTable}
    SET
      "last_error" = ${lastError},
      "status" = CASE WHEN "attempts" >= "max_attempts" THEN 'failed' ELSE "status" END,
      "next_attempt_at" = CASE
        WHEN "attempts" >= "max_attempts" THEN "next_attempt_at"
        ELSE now() + (
          least(${BACKOFF_BASE_MS} * power(2, "attempts"), ${BACKOFF_CAP_MS})
          * (0.8 + random() * 0.4)
        ) * interval '1 millisecond'
      END
    WHERE ${eventOutboxTable.id} = ${id}
    RETURNING "status"
  `)) as Array<{ status: "pending" | "failed" }> | { rows: Array<{ status: "pending" | "failed" }> }
  const list = Array.isArray(rows) ? rows : rows.rows
  return list[0]?.status ?? null
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
  const limit = options.limit ?? 25
  const visibilityMs = options.visibilityTimeoutMs ?? 120_000
  const result = (await (db as AnyDb).execute(sql`
    UPDATE ${eventOutboxTable}
    SET
      "attempts" = "attempts" + 1,
      "next_attempt_at" = now() + (${visibilityMs} * interval '1 millisecond')
    WHERE "id" IN (
      SELECT "id" FROM ${eventOutboxTable}
      WHERE "status" = 'pending' AND "next_attempt_at" <= now()
      ORDER BY "next_attempt_at" ASC
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
 * One drain pass: claim due rows, redeliver each through the bus, mark
 * delivered / reschedule / dead-letter. Call from a scheduled handler
 * (cron), a `waitUntil` kick after emit, or a long-running Node loop.
 * Safe to run concurrently from multiple isolates (SKIP LOCKED claim).
 */
export async function drainOutbox(
  db: DrizzleClient,
  bus: OutboxEventDelivery,
  options: DrainOutboxOptions = {},
): Promise<DrainOutboxResult> {
  const claimed = await claimDueOutboxEvents(db, options)
  const result: DrainOutboxResult = {
    claimed: claimed.length,
    delivered: 0,
    retried: 0,
    deadLettered: 0,
  }
  if (claimed.length === 0) return result

  await Promise.all(
    claimed.map(async (row) => {
      const envelope = outboxRowToEnvelope(row)
      let failedCount = 0
      let errors: string[] = []
      try {
        if (bus.deliver) {
          const delivery = await bus.deliver(envelope)
          failedCount = delivery.failed
          errors = delivery.errors
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
        return
      }
      const status = await failOutboxEvent(db, row.id, errors.join("; "))
      if (status === "failed") result.deadLettered += 1
      else result.retried += 1
    }),
  )

  return result
}

/**
 * Delete delivered rows past the retention window (delivered rows are
 * receipts, not a log sink — long-term archival belongs elsewhere).
 * Dead-lettered (`failed`) rows are NOT pruned: they represent lost
 * deliveries until a human resolves them. Returns the deleted count.
 */
export async function pruneDeliveredOutboxEvents(
  db: DrizzleClient,
  options: { olderThanDays?: number } = {},
): Promise<number> {
  const days = options.olderThanDays ?? 14
  const result = (await (db as AnyDb).execute(sql`
    DELETE FROM ${eventOutboxTable}
    WHERE "status" = 'delivered'
      AND "delivered_at" < now() - (${days} * interval '1 day')
    RETURNING "id"
  `)) as unknown
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
  return rows.length
}

/** Row counts by status — observability for dashboards/health checks. */
export async function getOutboxStats(
  db: DrizzleClient,
): Promise<{ pending: number; delivered: number; failed: number; dueNow: number }> {
  const result = (await (db as AnyDb).execute(sql`
    SELECT
      count(*) FILTER (WHERE "status" = 'pending')::int AS pending,
      count(*) FILTER (WHERE "status" = 'delivered')::int AS delivered,
      count(*) FILTER (WHERE "status" = 'failed')::int AS failed,
      count(*) FILTER (WHERE "status" = 'pending' AND "next_attempt_at" <= now())::int AS due_now
    FROM ${eventOutboxTable}
  `)) as unknown
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
  const row = (rows[0] ?? {}) as Record<string, number>
  return {
    pending: row.pending ?? 0,
    delivered: row.delivered ?? 0,
    failed: row.failed ?? 0,
    dueNow: row.due_now ?? 0,
  }
}
