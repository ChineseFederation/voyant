import type { VoyantGraphRuntimeFactoryContext } from "@voyant-travel/core/project"

import { drainOutbox, getBoundedOutboxStats, pruneDeliveredOutboxEvents } from "./outbox.js"
import { eventOutboxJobRuntimePort } from "./outbox-job-runtime-port.js"
import { expireStaleWriteIntents } from "./write-intents.js"

export { type EventOutboxJobRuntime, eventOutboxJobRuntimePort } from "./outbox-job-runtime-port.js"

/** Drain durable outbox/write-intent state without accepting invocation input. */
export async function runEventOutboxDrainJob(
  context: VoyantGraphRuntimeFactoryContext,
): Promise<void> {
  const runtime = await context.getPort(eventOutboxJobRuntimePort)
  await runtime.withDb(async (db) => {
    const result = await drainOutbox(
      db,
      { deliver: (envelope) => runtime.deliver(envelope) },
      {
        limit: 50,
        concurrency: 5,
        maxEvents: 500,
        maxBatches: 10,
        timeBudgetMs: 50_000,
        budgetReserveMs: 5_000,
        visibilityTimeoutMs: 120_000,
      },
    )
    const pruned = await pruneDeliveredOutboxEvents(db, { olderThanDays: 14, limit: 500 })
    const expiredIntents = await expireStaleWriteIntents(db, {
      olderThanMinutes: 30,
      limit: 250,
    })
    if (expiredIntents > 0) {
      runtime.warn(`[outbox-drain] expired ${expiredIntents} stale write intent(s)`)
    }
    const stats = await getBoundedOutboxStats(db, { scanLimit: 10_000 })
    const oldestPendingAgeMs = stats.oldestPendingAt
      ? Math.max(0, Date.now() - stats.oldestPendingAt.getTime())
      : null
    const log = runtime.log ?? runtime.warn
    log(
      `[outbox-drain] ${JSON.stringify({
        claimed: result.claimed,
        delivered: result.delivered,
        retried: result.retried,
        deadLettered: result.deadLettered,
        batches: result.batches,
        budgetExhausted: result.budgetExhausted,
        remainingBacklog: stats.pending,
        remainingBacklogCapped: stats.pendingCapped,
        dueNow: stats.dueNow,
        dueNowCapped: stats.dueNowCapped,
        failed: stats.failed,
        failedCapped: stats.failedCapped,
        oldestPendingAgeMs,
        drainDurationMs: result.durationMs,
        pruned,
        expiredIntents,
      })}`,
    )
    if (stats.failed > 0) {
      runtime.warn(`[outbox-drain] ${stats.failed} dead-lettered event(s) need attention`)
    }
    if (result.deadLettered > 0) {
      runtime.warn(`[outbox-drain] ${result.deadLettered} event(s) exhausted delivery attempts`)
    }
  })
}
