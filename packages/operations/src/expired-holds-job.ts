import type { VoyantGraphRuntimeFactoryContext } from "@voyant-travel/core/project"

import { releaseExpiredHolds } from "./availability/service-holds.js"
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
 */
export async function runOperationsReleaseExpiredHoldsJob(
  context: VoyantGraphRuntimeFactoryContext,
): Promise<void> {
  const runtime = await context.getPort(operationsExpiredHoldsJobRuntimePort)
  const db = await runtime.resolveDb()
  await releaseExpiredHolds(db)
}
