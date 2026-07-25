import type { VoyantGraphRuntimeFactoryContext } from "@voyant-travel/core/project"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { durableTripActionRuntimePort } from "./durable-action-runtime-port.js"
import { tripsDatabaseRuntimePort } from "./runtime-port.js"
import {
  drainTripActionOperations,
  hasRecoverableTripActionOperations,
} from "./service-durable-actions.js"

/** Reconcile due price/reserve operations against the exact selected backend. */
export async function runTripActionJob(context: VoyantGraphRuntimeFactoryContext): Promise<void> {
  const database = await context.getPort(tripsDatabaseRuntimePort)
  const workerDb = database.resolveDb(context.bindings) as PostgresJsDatabase
  if (!context.hasPort(durableTripActionRuntimePort)) {
    if (await hasRecoverableTripActionOperations(workerDb)) {
      throw new Error(
        "Recoverable Trip actions exist but the exact durable provider is unavailable",
      )
    }
    return
  }
  const runtime = await context.getPort(durableTripActionRuntimePort)
  await drainTripActionOperations(workerDb, {
    price: runtime.price,
    reserve: runtime.reserve,
  })
}
