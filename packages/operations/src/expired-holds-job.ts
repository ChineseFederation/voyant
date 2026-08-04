import type { VoyantGraphRuntimeFactoryContext } from "@voyant-travel/core/project"

import { requestAvailabilityHoldExpiryWake } from "./availability/hold-expiry-wake.js"
import { earliestOutstandingHoldExpiry, releaseExpiredHolds } from "./availability/service-holds.js"
import { operationsExpiredHoldsJobRuntimePort } from "./expired-holds-job-runtime-port.js"

export { operationsExpiredHoldsJobRuntimePort } from "./expired-holds-job-runtime-port.js"

/**
 * Give back the capacity held by abandoned checkout holds.
 *
 * `availability_holds` decrement `availability_slots.remaining_pax` the moment a
 * checkout reserves seats, and only `releaseExpiredHolds` puts them back. That
 * reaper shipped with no scheduler, so every abandoned checkout permanently ate
 * into a departure: the sandbox's 27 Jul departure sat at 1 of 10 seats with
 * only 4 pax genuinely held or confirmed — the other 5 were stuck in four
 * long-expired holds.
 *
 * The job is wake-driven (#4067). Every run ends by arming the next one from
 * the earliest expiry still outstanding, which is both more timely than a poll
 * and free when nothing is held — a tenant with no live holds arms nothing and
 * stops waking its database. The declared cadence remains the backstop for a
 * wake lost to a restart.
 */
export async function runOperationsReleaseExpiredHoldsJob(
  context: VoyantGraphRuntimeFactoryContext,
): Promise<void> {
  const runtime = await context.getPort(operationsExpiredHoldsJobRuntimePort)
  const db = await runtime.resolveDb()
  await releaseExpiredHolds(db)

  const next = await earliestOutstandingHoldExpiry(db)
  if (next) requestAvailabilityHoldExpiryWake(next)
}
