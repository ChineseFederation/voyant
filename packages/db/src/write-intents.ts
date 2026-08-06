import { newId } from "@voyant-travel/schema-kit/typeid"
import { eq, sql } from "drizzle-orm"

import { eventOutboxTable } from "./schema/infra/event_outbox.js"
import { type WriteIntentRow, writeIntentsTable } from "./schema/infra/write_intents.js"
import type { DrizzleClient } from "./types.js"

// biome-ignore lint/suspicious/noExplicitAny: Drizzle generic inference breaks across client flavors — casts isolated to the query-builder boundary (same pattern as crud.ts/outbox.ts) -- owner: db; existing suppression is intentional pending typed cleanup.
type AnyDb = any

/**
 * Enqueue an async write intent, deduped on `idempotencyKey`: a retried
 * request with the same key returns the EXISTING intent (whatever its
 * status), so clients can safely re-POST and re-poll. Returns the row
 * plus whether this call created it — only the creator should emit the
 * `<kind>.requested` event.
 */
export async function enqueueWriteIntent(
  db: DrizzleClient,
  input: { kind: string; payload: unknown; idempotencyKey?: string },
): Promise<{ intent: WriteIntentRow; created: boolean }> {
  const idempotencyKey = input.idempotencyKey ?? newId("write_intents")
  const inserted = (await (db as AnyDb)
    .insert(writeIntentsTable)
    .values({ kind: input.kind, payload: input.payload, idempotencyKey })
    .onConflictDoNothing({ target: writeIntentsTable.idempotencyKey })
    .returning()) as WriteIntentRow[]
  const row = inserted[0]
  if (row) return { intent: row, created: true }

  const existing = (await (db as AnyDb)
    .select()
    .from(writeIntentsTable)
    .where(eq(writeIntentsTable.idempotencyKey, idempotencyKey))
    .limit(1)) as WriteIntentRow[]
  const intent = existing[0]
  if (!intent) {
    throw new Error("write intent insert conflicted but the existing row was not found")
  }
  return { intent, created: false }
}

export async function getWriteIntent(
  db: DrizzleClient,
  id: string,
): Promise<WriteIntentRow | null> {
  const rows = (await (db as AnyDb)
    .select()
    .from(writeIntentsTable)
    .where(eq(writeIntentsTable.id, id))
    .limit(1)) as WriteIntentRow[]
  return rows[0] ?? null
}

/**
 * Settle an intent. Only pending rows transition (handlers are invoked
 * at-least-once by the outbox — a redelivery after success is a no-op).
 * Returns whether this call performed the transition.
 */
export async function settleWriteIntent(
  db: DrizzleClient,
  id: string,
  outcome:
    | { status: "succeeded"; result: unknown }
    | { status: "failed"; result?: unknown; error: string },
): Promise<boolean> {
  const rows = (await (db as AnyDb)
    .update(writeIntentsTable)
    .set({
      status: outcome.status,
      result: outcome.status === "succeeded" ? outcome.result : (outcome.result ?? null),
      error: outcome.status === "failed" ? outcome.error.slice(0, 2000) : null,
      completedAt: new Date(),
    })
    // agent-quality: raw-sql reviewed -- owner: db; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    .where(sql`${writeIntentsTable.id} = ${id} AND ${writeIntentsTable.status} = 'pending'`)
    .returning({ id: writeIntentsTable.id })) as Array<{ id: string }>
  return rows.length > 0
}

/**
 * Fail pending intents older than the window whose delivery can no
 * longer happen — the backstop for dead-lettered or never-emitted
 * events. Run from the same cron as the outbox drain.
 *
 * An old intent is NOT expired while a PENDING outbox event still
 * references it (`event_outbox.payload->>'intentId'`): during a spike
 * the outbox drains a bounded batch per tick, so a deep backlog can
 * legitimately hold valid intents past the age window — sweeping those
 * would fail exactly the requests the queue exists to protect, and the
 * eventual delivery would then skip the no-longer-pending intent. This
 * is why intent events MUST carry `{ intentId }` in their payload (the
 * storefront handler's contract).
 *
 * Returns the failed count.
 */
export async function expireStaleWriteIntents(
  db: DrizzleClient,
  options: { olderThanMinutes?: number; limit?: number } = {},
): Promise<number> {
  const minutes = options.olderThanMinutes ?? 30
  const limit = options.limit ?? 250
  if (!Number.isSafeInteger(minutes) || minutes <= 0) {
    throw new RangeError("olderThanMinutes must be a positive integer")
  }
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new RangeError("limit must be a positive integer")
  }
  const result = (await (db as AnyDb).execute(sql`
    WITH candidates AS (
      SELECT ${writeIntentsTable.id}
      FROM ${writeIntentsTable}
      WHERE ${writeIntentsTable.status} = 'pending'
        AND ${writeIntentsTable.createdAt} < now() - (${minutes} * interval '1 minute')
        AND NOT EXISTS (
          SELECT 1 FROM ${eventOutboxTable}
          WHERE ${eventOutboxTable.status} = 'pending'
            AND ${eventOutboxTable.payload} ->> 'intentId' = ${writeIntentsTable.id}
        )
      ORDER BY ${writeIntentsTable.createdAt} ASC, ${writeIntentsTable.id} ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE ${writeIntentsTable}
    SET "status" = 'failed',
        "error" = 'intent expired before a handler settled it',
        "completed_at" = now()
    WHERE ${writeIntentsTable.id} IN (SELECT "id" FROM candidates)
    RETURNING "id"
  `)) as unknown
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
  return rows.length
}
