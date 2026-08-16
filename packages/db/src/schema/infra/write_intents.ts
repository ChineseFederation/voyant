import { sql } from "drizzle-orm"
import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

import { typeId } from "../../lib/index.js"

/**
 * Async write intents (RFC voyant#1687 Phase 3.2 — the queued write
 * pipeline's result mailbox).
 *
 * An intent is "a write the caller asked for but didn't wait for": the
 * route validates the payload, stores it here, durably emits a
 * `<kind>.requested` event (transactional outbox), and answers
 * **202 + a status URL**. The outbox delivers the event to the intent's
 * handler — with the outbox's at-least-once retries, backoff, and
 * dead-lettering — and the handler writes the outcome back onto the
 * row. Under a payday spike, callers get instant 202s and the work
 * drains at the outbox's controlled pace instead of thundering-herding
 * the booking transaction.
 *
 * Dedup: `idempotency_key` is unique — a retried POST with the same key
 * returns the SAME intent rather than enqueueing twice.
 *
 * Status semantics: `pending` until a handler settles it. Handlers
 * distinguish FINAL business outcomes (capacity conflict → `failed`
 * with a result payload, never retried) from infra errors (thrown →
 * the outbox retries). A stale sweep fails intents whose event
 * dead-lettered.
 */
export const writeIntentsTable = pgTable(
  "write_intents",
  {
    id: typeId("write_intents"),
    /** Handler routing key, e.g. "public-api.booking.bootstrap". */
    kind: text("kind").notNull(),
    /** The validated request payload the handler will execute. */
    payload: jsonb("payload").notNull(),
    /** Client-supplied (Idempotency-Key) or generated. Unique. */
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status", { enum: ["pending", "succeeded", "failed"] })
      .notNull()
      .default("pending"),
    /** Handler outcome payload (success result OR final-failure detail). */
    result: jsonb("result"),
    /** Infra/dead-letter error detail for failed intents. */
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("write_intents_idempotency_key_uniq").on(table.idempotencyKey),
    // Stale-sweep working set; partial keeps it tiny.
    // agent-quality: raw-sql reviewed -- owner: db; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    index("write_intents_pending_idx")
      .on(table.createdAt, table.id)
      .where(sql`${table.status} = 'pending'`),
  ],
).enableRLS()

export type WriteIntentRow = typeof writeIntentsTable.$inferSelect
