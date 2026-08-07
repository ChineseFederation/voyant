import type { DeliveryResult, EventEnvelope } from "@voyant-travel/core"
import { definePort } from "@voyant-travel/core/project"

import type { DrizzleClient } from "./types.js"

/** The only host capabilities admitted to the database-owned outbox job. */
export interface EventOutboxJobRuntime {
  withDb<T>(operation: (db: DrizzleClient) => Promise<T>): Promise<T>
  deliver(envelope: EventEnvelope): Promise<DeliveryResult>
  /** Healthy-run operational telemetry; older hosts fall back to warn(). */
  log?(message: string): void
  warn(message: string): void
}

export const eventOutboxJobRuntimePort = definePort<EventOutboxJobRuntime>({
  id: "infrastructure.event-outbox-delivery",
  test(runtime) {
    for (const method of ["withDb", "deliver", "warn"] as const) {
      if (!runtime || typeof runtime[method] !== "function") {
        throw new Error(`infrastructure.event-outbox-delivery provider must implement ${method}().`)
      }
    }
  },
})
