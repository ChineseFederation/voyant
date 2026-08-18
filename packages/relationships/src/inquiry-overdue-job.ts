import type { VoyantGraphRuntimeFactoryContext } from "@voyant-travel/core/project"
import { insertOutboxEvents } from "@voyant-travel/db/outbox"
import { and, isNull, lt, notInArray } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { INQUIRY_FIRST_RESPONSE_OVERDUE_EVENT } from "./events.js"
import { relationshipsInquiryOverdueJobRuntimePort } from "./inquiry-overdue-job-runtime-port.js"
import { inquiries, inquirySlaEvents } from "./schema.js"

export { relationshipsInquiryOverdueJobRuntimePort } from "./inquiry-overdue-job-runtime-port.js"

type InsertEvents = typeof insertOutboxEvents

export async function emitFirstResponseOverdueEvents(
  db: PostgresJsDatabase,
  now = new Date(),
  insertEvents: InsertEvents = insertOutboxEvents,
): Promise<number> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: inquiries.id, firstResponseDueAt: inquiries.firstResponseDueAt })
      .from(inquiries)
      .where(
        and(
          isNull(inquiries.firstRespondedAt),
          lt(inquiries.firstResponseDueAt, now),
          notInArray(inquiries.status, ["converted", "closed"]),
        ),
      )
      // Serialize against the record-first-response command, which locks the
      // same Inquiry before stamping it. Concurrent scans skip one another.
      .for("update", { skipLocked: true })

    const candidates = rows.filter(
      (row): row is { id: string; firstResponseDueAt: Date } =>
        row.firstResponseDueAt instanceof Date,
    )
    if (candidates.length === 0) return 0

    // Claim the derived SLA edge and enqueue its outbox envelope in one
    // transaction. A failed outbox insert rolls back the claim so the next
    // scheduled scan can retry it.
    const due = await tx
      .insert(inquirySlaEvents)
      .values(
        candidates.map(({ id, firstResponseDueAt }) => ({
          inquiryId: id,
          eventType: INQUIRY_FIRST_RESPONSE_OVERDUE_EVENT,
          dueAt: firstResponseDueAt,
          occurredAt: now,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: inquirySlaEvents.inquiryId, firstResponseDueAt: inquirySlaEvents.dueAt })
    if (due.length === 0) return 0

    const inserted = await insertEvents(
      tx,
      due.map((inquiry) => ({
        name: INQUIRY_FIRST_RESPONSE_OVERDUE_EVENT,
        data: {
          id: inquiry.id,
          firstResponseDueAt: inquiry.firstResponseDueAt.toISOString(),
        },
        metadata: {
          eventId: `inquiry-first-response-overdue:${inquiry.id}:${inquiry.firstResponseDueAt.toISOString()}`,
        },
      })),
    )
    return inserted.length
  })
}

/** Emits each overdue SLA edge once; the deterministic outbox id makes retries safe. */
export async function runRelationshipsInquiryOverdueJob(
  context: VoyantGraphRuntimeFactoryContext,
): Promise<void> {
  const runtime = await context.getPort(relationshipsInquiryOverdueJobRuntimePort)
  await runtime.withDb(context.bindings, (db) => emitFirstResponseOverdueEvents(db))
}
