/**
 * Catalog discovery sync — the single deployment-facing entry that composes
 * the catalog `services` exactly like the projection/reindex path does and
 * fans every registered `SourceAdapter.discover()` into the deployment's
 * indexer, so sourced inventory (Voyant Connect connections, the sandbox demo
 * connector, cruise shims) shows up in catalog browse alongside owned rows.
 *
 * `syncSources` itself is pure — it wants a resolved `IndexerService`, the
 * per-vertical field-policy registries, and a warmed source registry. Building
 * those means touching the indexer provider, the embedding provider, the
 * market/locale slice set, and the Connect connection warm; all of that lives
 * inside the framework runtime host. Deployment templates get
 * `runCatalogDiscoverySync` instead of re-assembling framework internals.
 *
 * Three call shapes, cheapest first:
 *
 *   - `catalog.sync-sources` runs on its package-owned schedule.
 *   - The same job is `wakeup: true`, so adding a Connect connection can wake
 *     an immediate pass instead of waiting for the next tick.
 *   - `runCatalogDiscoverySync(...)` is callable directly when a host already
 *     holds `env`, a db handle, and the composed services (warmup indexing).
 */

import type { VoyantGraphRuntimeFactoryContext } from "@voyant-travel/core/project"
import type { AnyDrizzleDb } from "@voyant-travel/db"

import {
  type SourceAdapterRegistry,
  type SyncProgressEvent,
  type SyncSourcesSummary,
  syncSources,
} from "./booking-engine/index.js"
import type { CatalogRuntimeServices } from "./runtime-contracts.js"
import { createIndexerService } from "./services/indexer-service.js"
import {
  type CatalogSourcesSyncJobRuntime,
  catalogSourcesSyncJobRuntimePort,
} from "./sources-sync-job-runtime-port.js"

export {
  type CatalogSourcesSyncJobRuntime,
  catalogSourcesSyncJobRuntimePort,
} from "./sources-sync-job-runtime-port.js"

export interface CatalogDiscoverySyncOptions {
  /** Vertical allow-list. Omit to sync every vertical the adapters declare. */
  verticals?: readonly string[]
  /**
   * Mark previously-active sourced rows that a successful discovery pass did
   * not re-emit as withdrawn, and drop them from the search slices. Defaults
   * to `false`: a partial pass (warmup, connection-add, a supplier returning
   * an empty page) must never empty the browse index.
   */
  pruneMissing?: boolean
  /**
   * Isolate per-connection `discover()` failures instead of aborting the pass,
   * so one unhealthy supplier cannot starve every other connection. Defaults to
   * `true` — a fan-out across independent suppliers has no reason to be
   * all-or-nothing. Inspect `summary.failures` for what was skipped.
   */
  continueOnError?: boolean
  onProgress?: (event: SyncProgressEvent) => void
}

export interface CatalogDiscoverySyncDependencies {
  /** Deployment env — resolves the indexer, embeddings, and Connect wiring. */
  env: Readonly<Record<string, unknown>>
  db: AnyDrizzleDb
  /** Composed catalog services; the same object the projection runtime is built from. */
  services: CatalogRuntimeServices
  /**
   * Pre-resolved source registry. Callers that need connections added since the
   * process warmed (any scheduled or wakeup-driven pass) must pass a freshly
   * enumerated registry — `services.ensureSourceRegistry` reuses the memoized
   * per-isolate warm and would return the stale set.
   */
  registry?: SourceAdapterRegistry
}

/**
 * Compose the catalog indexer stack and run one discovery pass.
 *
 * Discovered projections land in every staff slice the deployment
 * materializes, which always includes the `market: "default"` /
 * `locale: "en-GB"` slice the admin browse queries — sourced rows are never
 * filtered out for lacking a market of their own. Customer-facing slices are
 * gated on the connection's channel publication rule, so connecting a supplier
 * does not merchandise it (#4089).
 */
export async function runCatalogDiscoverySync(
  dependencies: CatalogDiscoverySyncDependencies,
  options: CatalogDiscoverySyncOptions = {},
): Promise<SyncSourcesSummary> {
  const { env, db, services, registry } = dependencies
  const embeddings = services.buildEmbeddingProvider(env)
  const adapter = services.buildIndexer(env, embeddings)
  if (!adapter) {
    throw new Error("Catalog discovery sync requires a configured catalog indexer.")
  }
  const fieldPolicyRegistries = services.fieldPolicyRegistries()
  const indexerService = createIndexerService({
    adapter,
    slices: await services.loadSlices(db),
    registries: fieldPolicyRegistries,
  })
  await indexerService.ensureCollections()

  return syncSources({
    registry: registry ?? (await services.ensureSourceRegistry(env)),
    indexerService,
    fieldPolicyRegistries,
    db,
    isSourcedEntryListable: (input) => services.isSourcedEntryListable({ db, ...input }),
    pruneMissing: options.pruneMissing ?? false,
    continueOnError: options.continueOnError ?? true,
    wrapBuilder: (builder) => services.withEmbedding(builder, embeddings),
    ...(options.verticals ? { verticals: options.verticals } : {}),
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
  })
}

/** Graph job entry for `catalog.sync-sources`. */
export async function runCatalogSourcesSyncJob(
  context: VoyantGraphRuntimeFactoryContext,
): Promise<void> {
  await runCatalogSourcesSync(await context.getPort(catalogSourcesSyncJobRuntimePort))
}

/**
 * Resolve the host pieces from the job runtime and run one pass. Deployments
 * that select `search: "none"` have no indexer to project into, so the pass is
 * skipped rather than failing the schedule every tick.
 */
export async function runCatalogSourcesSync(
  runtime: CatalogSourcesSyncJobRuntime,
  options: CatalogDiscoverySyncOptions = {},
): Promise<SyncSourcesSummary> {
  const services = await runtime.resolveServices()
  const env = runtime.resolveEnv()
  if (!services.buildIndexer(env, services.buildEmbeddingProvider(env))) {
    console.warn("[catalog-sources-sync] no catalog indexer configured; skipping discovery sync.")
    return { adapters: [], totalProjections: 0, skippedConnections: [], failures: [] }
  }
  // Re-enumerate rather than reuse the memoized request-path warm: picking up
  // connections added since the process started is the point of this job.
  const registry = await runtime.refreshSourceRegistry()
  const onProgress = options.onProgress ?? runtime.reportProgress?.bind(runtime)
  const summary = await runtime.withDb((db) =>
    runCatalogDiscoverySync(
      { env, db, services, registry },
      {
        ...options,
        ...(onProgress ? { onProgress } : {}),
      },
    ),
  )
  for (const failure of summary.failures) {
    console.error(
      `[catalog-sources-sync] connection ${failure.connectionId} (${failure.adapter}) failed: ${failure.error}`,
    )
  }
  return summary
}
