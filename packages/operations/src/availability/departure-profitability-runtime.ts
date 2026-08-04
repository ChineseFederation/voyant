/**
 * Finance seam for the departure workspace.
 *
 * The workspace has to show what a departure is worth, and Operations must not
 * work that out. Money is Finance's: revenue attribution, planned-versus-actual
 * cost, FX, and the base-currency rollup all live in
 * `getDepartureProfitability`. Operations reads the answer and never
 * recomputes it.
 *
 * Reaching it as a graph runtime port rather than a package dependency keeps
 * `@voyant-travel/operations` free of `@voyant-travel/finance` — only the
 * import-cheap declaration in `@voyant-travel/finance-contracts` is depended
 * on. The port is **optional**: a deployment assembled without Finance binds
 * nothing, the channel stays unset, and the summary simply carries no money.
 *
 * The channel is a module-level binding for the same reason
 * `hold-expiry-wake.ts` is: the availability routes are module-level constants
 * mounted on two surfaces (legacy `/v1/operations/*` and admin
 * `/v1/admin/operations/*`), so there is no single construction site to thread
 * an option through. The Operations graph runtime factory — the only place
 * that can resolve a port — binds it once at composition.
 */

import type {
  FinanceDepartureProfitabilityQuery,
  FinanceDepartureProfitabilityReport,
} from "@voyant-travel/finance-contracts/runtime-port"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

export type DepartureProfitabilityReader = (
  db: PostgresJsDatabase,
  query: FinanceDepartureProfitabilityQuery,
) => Promise<FinanceDepartureProfitabilityReport>

let readDepartureProfitability: DepartureProfitabilityReader | undefined

/**
 * Bind the deployment's Finance profitability reader. Called once by the
 * Operations graph runtime factory, which is the only place that can resolve a
 * runtime port. Passing `undefined` is the "Finance is not deployed" case and
 * is not an error.
 */
export function configureDepartureProfitabilityReader(
  reader: DepartureProfitabilityReader | undefined,
): void {
  readDepartureProfitability = reader
}

/** Test seam: drop the bound reader so a suite cannot leak into the next one. */
export function resetDepartureProfitabilityReader(): void {
  readDepartureProfitability = undefined
}

/** Whether a Finance provider is bound in this deployment. */
export function hasDepartureProfitabilityReader(): boolean {
  return readDepartureProfitability !== undefined
}

/**
 * Read one departure's P&L, or `undefined` when no Finance provider is bound.
 *
 * A Finance failure is not allowed to take the whole workspace down with it:
 * the rest of the summary is operational truth the operator still needs at the
 * gate. The caller sees `undefined` and renders the money section as
 * unavailable.
 */
export async function readDepartureProfitabilityReport(
  db: PostgresJsDatabase,
  query: FinanceDepartureProfitabilityQuery,
): Promise<FinanceDepartureProfitabilityReport | undefined> {
  if (!readDepartureProfitability) return undefined
  try {
    return await readDepartureProfitability(db, query)
  } catch {
    return undefined
  }
}
