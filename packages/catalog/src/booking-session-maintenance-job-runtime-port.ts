import { definePort } from "@voyant-travel/core/project"

import type { BookingSessionModule } from "./booking-engine/index.js"

export interface CatalogBookingSessionMaintenanceJobRuntime {
  resolveModule(): BookingSessionModule | Promise<BookingSessionModule>
  reportFailure(error: unknown, context: { operation: "expire" | "purge" }): void
  now?(): Date
  resolveRetentionMs?(): number | Promise<number>
  batchSize?: number
}

export const catalogBookingSessionMaintenanceJobRuntimePort =
  definePort<CatalogBookingSessionMaintenanceJobRuntime>({
    id: "catalog.booking-session-maintenance-job",
    test(runtime) {
      if (
        !runtime ||
        typeof runtime.resolveModule !== "function" ||
        typeof runtime.reportFailure !== "function"
      ) {
        throw new Error("catalog.booking-session-maintenance-job provider is incomplete.")
      }
    },
  })
