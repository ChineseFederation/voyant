import { sql } from "drizzle-orm"
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

import { typeId } from "../../lib/index.js"

/** What one failed delivery attempt decided, retained per attempt. */
export interface OutboxAttemptError {
  /** The row's `attempts` counter at the time this delivery failed. */
  attempt: number
  error: string
  /** ISO instant the failure was recorded. */
  at: string
}

/**
 * Transactional outbox for domain events (RFC voyant#1687 Phase 2.1).
 *
 * An emitted event becomes a durable row BEFORE its subscribers run, so
 * a Worker dying mid-delivery no longer silently loses invoice syncs,
 * channel pushes, or workflow triggers. Services that need write
 * atomicity insert rows inside their own transaction (via
 * `enqueueOutboxEvents(tx, ...)` from `@voyant-travel/db/outbox`); the drain
 * then delivers post-commit.
 *
 * Delivery semantics: **at-least-once**. A row is claimed with a
 * visibility timeout (no separate "processing" status — a crashed
 * claimer's row simply becomes due again), delivered to ALL subscribers,
 * and either completed or rescheduled with exponential backoff until
 * `max_attempts`, after which it dead-letters as `failed`. Subscribers
 * must be idempotent — the workflow forwarder already dedups on
 * `metadata.eventId`, and plugin subscribers key on external refs.
 */
export const eventOutboxTable = pgTable(
  "event_outbox",
  {
    id: typeId("event_outbox"),

    /**
     * Stable envelope id (`metadata.eventId`). Unique — re-emitting the
     * same event (request retry, redelivered webhook) captures once.
     */
    eventId: text("event_id").notNull(),
    /** Event name (`<resource>.<pastTenseAction>`). */
    name: text("name").notNull(),
    /** Envelope `data` payload. */
    payload: jsonb("payload"),
    /** Envelope `metadata` (includes eventId, correlation ids, ...). */
    metadata: jsonb("metadata"),

    /** pending → delivered | failed (dead-lettered). */
    status: text("status", { enum: ["pending", "delivered", "failed"] })
      .notNull()
      .default("pending"),
    /** Delivery attempts so far (incremented at claim time). */
    attempts: integer("attempts").notNull().default(0),
    /** Dead-letter threshold. */
    maxAttempts: integer("max_attempts").notNull().default(8),
    /**
     * When the row is next due. Doubles as the visibility timeout while
     * a claim is in flight and as the backoff schedule after a failure.
     */
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    /**
     * One entry per failed delivery: `{attempt, error, at}`, oldest first.
     *
     * `last_error` keeps a single string, so an eight-attempt chain retains one
     * verdict and a post-mortem cannot tell whether the first attempt failed
     * for the same reason as the last — which is precisely the question asked
     * of a captured payment that never became a Booking (voyant#4692). Kept on
     * delivered rows too: "succeeded on attempt four" is worth as much as the
     * failures that led there.
     */
    attemptErrors: jsonb("attempt_errors").$type<OutboxAttemptError[]>(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("event_outbox_event_id_uniq").on(table.eventId),
    // The drain's working set: due pending rows only. Partial keeps the
    // index tiny once delivered/failed rows accumulate.
    // agent-quality: raw-sql reviewed -- owner: db; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    index("event_outbox_due_idx")
      .on(table.nextAttemptAt, table.id)
      .where(sql`${table.status} = 'pending'`),
    index("event_outbox_pending_created_idx")
      .on(table.createdAt)
      .where(sql`${table.status} = 'pending'`),
    index("event_outbox_failed_created_idx")
      .on(table.createdAt)
      .where(sql`${table.status} = 'failed'`),
    index("event_outbox_delivered_idx")
      .on(table.deliveredAt, table.id)
      .where(sql`${table.status} = 'delivered'`),
    index("event_outbox_pending_intent_idx")
      .on(sql`(${table.payload} ->> 'intentId')`)
      .where(sql`${table.status} = 'pending'`),
    index("event_outbox_created_idx").on(table.createdAt),
  ],
).enableRLS()

export type EventOutboxRow = typeof eventOutboxTable.$inferSelect
export type InsertEventOutboxRow = typeof eventOutboxTable.$inferInsert
