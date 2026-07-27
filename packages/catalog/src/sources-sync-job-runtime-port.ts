import { definePort } from "@voyant-travel/core/project"
import type { AnyDrizzleDb } from "@voyant-travel/db"

import type { SourceAdapterRegistry, SyncProgressEvent } from "./booking-engine/index.js"
import type { CatalogRuntimeServices } from "./runtime-contracts.js"

/**
 * Host-supplied pieces the discovery sync needs but cannot resolve itself:
 * the deployment env (indexer + embedding + Connect wiring), a database
 * handle, and the composed catalog runtime services. Deployments never build
 * `services` by hand — the catalog runtime contributor provides this port.
 */
export interface CatalogSourcesSyncJobRuntime {
  withDb<T>(operation: (db: AnyDrizzleDb) => Promise<T>): Promise<T>
  resolveServices(): CatalogRuntimeServices | Promise<CatalogRuntimeServices>
  resolveEnv(): Readonly<Record<string, unknown>>
  /**
   * Re-enumerate upstream connections and return the current registry. The
   * request-path warm is memoized for the life of the isolate, so a resident
   * deployment would otherwise keep syncing the connection set it saw first —
   * the discovery sync exists precisely to pick up connections added since.
   */
  refreshSourceRegistry(): Promise<SourceAdapterRegistry>
  reportProgress?(event: SyncProgressEvent): void
}

export const catalogSourcesSyncJobRuntimePort = definePort<CatalogSourcesSyncJobRuntime>({
  id: "catalog.sources-sync-job",
  test(runtime) {
    if (
      !runtime ||
      typeof runtime.withDb !== "function" ||
      typeof runtime.resolveServices !== "function" ||
      typeof runtime.resolveEnv !== "function" ||
      typeof runtime.refreshSourceRegistry !== "function"
    ) {
      throw new Error("catalog.sources-sync-job provider is incomplete.")
    }
  },
})
