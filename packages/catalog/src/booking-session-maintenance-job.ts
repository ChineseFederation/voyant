import type { VoyantGraphRuntimeFactoryContext } from "@voyant-travel/core/project"

import type { BookingSessionAccessContext } from "./booking-engine/index.js"
import {
  type CatalogBookingSessionMaintenanceJobRuntime,
  catalogBookingSessionMaintenanceJobRuntimePort,
} from "./booking-session-maintenance-job-runtime-port.js"

export {
  type CatalogBookingSessionMaintenanceJobRuntime,
  catalogBookingSessionMaintenanceJobRuntimePort,
} from "./booking-session-maintenance-job-runtime-port.js"

export const DEFAULT_BOOKING_SESSION_TERMINAL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const DEFAULT_BATCH_SIZE = 200

const MAINTENANCE_ACCESS: BookingSessionAccessContext = {
  actorKind: "staff",
  principalId: "system:catalog-booking-session-maintenance",
  staffAuthority: { admitted: true, reason: "scheduled_retention" },
}

export interface BookingSessionMaintenanceResult {
  expired: number
  purged: number
}

export async function runCatalogBookingSessionMaintenanceJob(
  context: VoyantGraphRuntimeFactoryContext,
): Promise<void> {
  await runCatalogBookingSessionMaintenance(
    await context.getPort(catalogBookingSessionMaintenanceJobRuntimePort),
  )
}

export async function runCatalogBookingSessionMaintenance(
  runtime: CatalogBookingSessionMaintenanceJobRuntime,
): Promise<BookingSessionMaintenanceResult> {
  const module = await runtime.resolveModule()
  const limit = Math.max(1, Math.min(runtime.batchSize ?? DEFAULT_BATCH_SIZE, 500))
  const now = runtime.now?.() ?? new Date()
  const retentionMs = Math.max(
    0,
    (await runtime.resolveRetentionMs?.()) ?? DEFAULT_BOOKING_SESSION_TERMINAL_RETENTION_MS,
  )

  let expired = 0
  let purged = 0
  const errors: unknown[] = []
  try {
    const result = await module.expireDueSessions({ limit }, MAINTENANCE_ACCESS)
    expired = result.expired
  } catch (error) {
    errors.push(error)
    runtime.reportFailure(error, { operation: "expire" })
  }
  try {
    const result = await module.purgeTerminalSessions(
      { before: new Date(now.getTime() - retentionMs), limit },
      MAINTENANCE_ACCESS,
    )
    purged = result.purged
  } catch (error) {
    errors.push(error)
    runtime.reportFailure(error, { operation: "purge" })
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, "Booking Session maintenance did not complete.")
  }

  return { expired, purged }
}
