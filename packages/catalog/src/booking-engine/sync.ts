/**
 * Source discovery sync — pulls projections from every registered
 * `SourceAdapter` and pushes them into the deployment's indexer so
 * sourced inventory shows up in the catalog UI alongside owned rows.
 *
 * Mirrors the deployment tooling's bulk reindex flow for owned rows, except the
 * data comes from `adapter.discover()` instead of a Drizzle table scan.
 *
 * The orchestrator is pure: it takes the registry, the indexer service,
 * and the per-vertical field-policy registries, and returns a summary
 * of what was synced. Templates wire env / Typesense / embeddings; this
 * function only touches what was passed in.
 *
 * Usage pattern (in a template script):
 *
 *   const summary = await syncSources({
 *     registry,
 *     indexerService,
 *     fieldPolicyRegistries,
 *   })
 *
 * Drift events, scheduled re-runs, and concurrency limits are deferred
 * to the catalog plane's normal drift pipeline (foundation §5.5);
 * `syncSources` is a one-shot bulk pass driven by a CLI or cron job.
 */

import type {
  IndexerDocument,
  IndexerSlice,
} from "@voyant-travel/catalog-contracts/indexer/contract"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import type { SourceAdapter, SourceAdapterContext } from "../adapter/contract.js"
import type { FieldPolicyRegistry } from "../contract.js"
import { isOwned } from "../provenance.js"
import type { DocumentBuilder, IndexerService } from "../services/indexer-service.js"
import { buildIndexerDocument } from "../services/indexer-service.js"
import {
  markMissingSourcedEntriesWithdrawn,
  upsertSourcedEntry,
} from "../services/sourced-entry-service.js"

import type { SourceAdapterRegistry } from "./registry.js"

/**
 * Decides whether one sourced entry may be emitted into one slice.
 *
 * Addressed by provenance rather than by entity id: a sourced entry has no
 * owned row to resolve a publication rule against, and its
 * `(source_kind, source_connection_id)` pair is the only durable identity the
 * operator's channel publication rules can name.
 */
export type SourcedEntryListabilityGate = (input: {
  slice: IndexerSlice
  provenance: { sourceKind: string; sourceConnectionId: string | null }
}) => boolean | Promise<boolean>

export interface SyncSourcesOptions {
  /** Booking-engine registry — every registered adapter's `discover` is fanned out. */
  registry: SourceAdapterRegistry
  /** Indexer the projections land in. Caller passes the same instance the live route uses. */
  indexerService: IndexerService
  /**
   * Per-vertical field-policy registries keyed by `entity_module`.
   * Same shape the indexer service is built with; passed separately so
   * the sync can build documents from projections without re-reading
   * the registry from the indexer service.
   */
  fieldPolicyRegistries: ReadonlyMap<string, FieldPolicyRegistry>
  /**
   * Drizzle DB handle. When set, sync upserts a row into
   * `catalog_sourced_entries` for every sourced projection (the durable
   * provenance + projection-capture store, sourced-content §2.5). The
   * upsert is idempotent on `(entity_module, entity_id)` and runs before
   * the indexer write. Owned projections are skipped — they live in the
   * vertical's owned schema, not the sourced-entry store.
   *
   * Optional only because pure-indexer test setups (no DB) want to use
   * `syncSources` for indexer-shape coverage. Production wiring always
   * passes a DB.
   */
  db?: AnyDrizzleDb
  /**
   * Optional adapter context override. Most adapters need at minimum
   * a `connection_id`; the demo plugin doesn't care so the default
   * `{ connection_id: adapter.kind }` is sufficient. Templates with
   * real connections pass their connection id (or build a per-adapter
   * map keyed by `kind`).
   */
  buildAdapterContext?: (adapter: SourceAdapter) => SourceAdapterContext
  /**
   * Optional wrapper around the per-projection `DocumentBuilder` — used
   * to attach embeddings via `withEmbedding` (the operator starter's
   * helper) without coupling this orchestrator to any embedding
   * provider.
   */
  wrapBuilder?: (builder: DocumentBuilder) => DocumentBuilder
  /**
   * Per-slice emission gate for sourced projections. Owned projections are not
   * gated here — they pass through their vertical's own document builder,
   * which consults the equivalent product publication rule.
   *
   * Omitting it emits every sourced projection into every slice, which is what
   * the sync did before #4089 and is retained only for pure-indexer test setups
   * with no publication store. Production wiring always passes a gate;
   * `runCatalogDiscoverySync` supplies the deployment's.
   */
  isSourcedEntryListable?: SourcedEntryListabilityGate
  /** Per-page log hook — called every page so callers can show progress. */
  onProgress?: (event: SyncProgressEvent) => void
  /**
   * Optional vertical allow-list. Scheduled vertical refreshes use this to run
   * only the adapter projections relevant to the current job.
   */
  verticals?: ReadonlyArray<string>
  /**
   * When true, rows from the same source/connection/vertical that were not
   * emitted by a successful discovery pass are marked withdrawn and deleted
   * from catalog search slices. Failed adapter passes never prune.
   */
  pruneMissing?: boolean
  /**
   * Isolate per-connection failures: a `discover()` rejection is recorded on
   * that connection's summary and the fan-out continues with the remaining
   * connections, instead of aborting the whole pass. A failed connection
   * never prunes, so its existing rows survive untouched.
   *
   * Off by default — one-shot callers that want the first failure to surface
   * (the cruise refresh, a CLI) keep the throwing behaviour.
   */
  continueOnError?: boolean
}

export interface SyncProgressEvent {
  adapter: string
  page: number
  pageSize: number
  totalSoFar: number
}

export interface SyncAdapterSummary {
  adapter: string
  /** Registry key this pass ran under — a real connection id, or `default:<kind>`. */
  connectionId: string
  pages: number
  projectionsSynced: number
  /**
   * Verticals the adapter touched, derived from `entity_module` on
   * each projection. Useful for the CLI to print per-vertical counts.
   */
  verticalsTouched: string[]
  /**
   * Projections skipped because no field-policy registry was registered
   * for their `entity_module`. Common when an adapter declares more
   * verticals than the deployment indexes.
   */
  skippedNoRegistry: number
  /**
   * Projections that landed in `catalog_sourced_entries` (sourced rows
   * with a DB handle in scope). Owned projections are not counted —
   * they're not part of the sourced-entry store.
   */
  sourcedEntriesUpserted: number
  /**
   * Owned projections passed through unchanged. Owned-flagged
   * projections via `discover()` are an unusual case (most adapters
   * emit only sourced rows) but the orchestrator still routes them to
   * the indexer.
   */
  ownedProjections: number
  /**
   * Previously active sourced rows that were not emitted by a successful
   * discovery pass, marked withdrawn and removed from search slices.
   */
  withdrawnProjections: number
  /**
   * Set when `continueOnError` isolated a `discover()` rejection for this
   * connection. Partial results already written stay written; pruning is
   * skipped so a failed pass never withdraws rows.
   */
  error?: string
}

export interface SyncSourcesSummary {
  adapters: SyncAdapterSummary[]
  totalProjections: number
  /**
   * Connections skipped before running. Currently the unscoped `default:<kind>`
   * fallback for a kind that also has connection-scoped registrations — see
   * `syncSources` for why discovering through it is never correct.
   */
  skippedConnections: Array<{ connectionId: string; adapter: string; reason: string }>
  /** Connections whose pass failed under `continueOnError`. */
  failures: Array<{ connectionId: string; adapter: string; error: string }>
}

/**
 * Run a one-shot discovery sync against every registered adapter.
 * Throws if an adapter doesn't support `discover` (a contract violation —
 * adapters wishing to participate in the sync must implement it).
 */
export async function syncSources(options: SyncSourcesOptions): Promise<SyncSourcesSummary> {
  const verticalFilter = options.verticals ? new Set(options.verticals) : undefined
  // Iterate every registered (connection_id, adapter) pair — multiple
  // connections of the same kind each get their own discovery pass.
  // Skip adapters that don't implement `discover` (outbound-only
  // channel-push adapters).
  const candidates = options.registry
    .connections()
    .map((connectionId) => ({
      connectionId,
      adapter: options.registry.resolveByConnectionOrThrow(connectionId),
    }))
    .filter((e) => typeof e.adapter.discover === "function")
    .filter(
      (e) =>
        !verticalFilter ||
        e.adapter.capabilities.verticals.some((vertical) => verticalFilter.has(vertical)),
    )
  const skippedConnections: SyncSourcesSummary["skippedConnections"] = []
  const failures: SyncSourcesSummary["failures"] = []
  const entries = candidates.filter((entry) => {
    if (!isUnscopedRegistration(entry.connectionId, entry.adapter.kind)) return true
    // A kind registered both unscoped and per-connection (the Voyant Connect
    // cold-window fallback plus its warmed connections) would otherwise run a
    // pass keyed by the synthetic `default:<kind>` id. Adapters forward that id
    // upstream as a real connection id, and it lands in provenance as
    // `source_connection_id` on any projection missing one — which then fails
    // to resolve on the live-book path. The scoped registrations cover the same
    // upstream, so the fallback pass is dropped.
    if (
      !candidates.some(
        (other) =>
          !isUnscopedRegistration(other.connectionId, other.adapter.kind) &&
          other.adapter.kind === entry.adapter.kind,
      )
    ) {
      return true
    }
    skippedConnections.push({
      connectionId: entry.connectionId,
      adapter: entry.adapter.kind,
      reason: "unscoped-fallback-superseded-by-connection-scoped-adapter",
    })
    return false
  })
  const adapterSummaries: SyncAdapterSummary[] = []
  let totalProjections = 0

  for (const { connectionId, adapter } of entries) {
    const adapterCtx = options.buildAdapterContext?.(adapter) ?? {
      connection_id: connectionId,
    }
    const summary: SyncAdapterSummary = {
      adapter: adapter.kind,
      connectionId,
      pages: 0,
      projectionsSynced: 0,
      verticalsTouched: [],
      skippedNoRegistry: 0,
      sourcedEntriesUpserted: 0,
      ownedProjections: 0,
      withdrawnProjections: 0,
    }
    const verticals = new Set<string>()
    const seenBySource = new Map<string, SourcedSeenSet>()

    try {
      let cursor: string | undefined
      do {
        // `discover` is optional in the contract; the filter above
        // ensures we only iterate adapters that implement it.
        const page = await adapter.discover?.(adapterCtx, cursor)
        if (!page) break
        summary.pages += 1
        options.onProgress?.({
          adapter: adapter.kind,
          page: summary.pages,
          pageSize: page.projections.length,
          totalSoFar: summary.projectionsSynced + page.projections.length,
        })

        for (const projection of page.projections) {
          if (verticalFilter && !verticalFilter.has(projection.entity_module)) {
            continue
          }
          const registry = options.fieldPolicyRegistries.get(projection.entity_module)
          if (!registry) {
            summary.skippedNoRegistry += 1
            continue
          }

          verticals.add(projection.entity_module)

          // Durable sourced-entry capture (sourced-content §2.5.2).
          // Owned projections skip — they live in the vertical's owned
          // schema. Sourced projections upsert before the indexer write so
          // the sourced-entry store is the canonical local copy of what
          // discover() said for downstream synthesizer reads.
          if (isOwned(projection.provenance)) {
            summary.ownedProjections += 1
          } else if (options.db) {
            await upsertSourcedEntry(options.db, { projection })
            summary.sourcedEntriesUpserted += 1
            if (options.pruneMissing) {
              trackSeenSourcedProjection(seenBySource, {
                entityModule: projection.entity_module,
                entityId: projection.entity_id,
                sourceKind: projection.provenance.source_kind,
                sourceConnectionId: projection.provenance.source_connection_id,
              })
            }
          }

          const projectionMap = toProjectionMap(projection.fields)
          const gate = isOwned(projection.provenance) ? undefined : options.isSourcedEntryListable
          const baseBuilder: DocumentBuilder = async (
            _entityId: string,
            slice: IndexerSlice,
          ): Promise<IndexerDocument | null> => {
            // Returning null is the emission gate: `reindexEntity` treats it as
            // "this entry does not belong in this slice" and deletes any
            // document already there, so revoking publication takes effect on
            // the next pass without a separate teardown path.
            if (
              gate &&
              !(await gate({
                slice,
                provenance: {
                  sourceKind: projection.provenance.source_kind,
                  sourceConnectionId: projection.provenance.source_connection_id ?? null,
                },
              }))
            ) {
              return null
            }
            return buildIndexerDocument(registry, projectionMap, slice, projection.entity_id, {
              sourceKind: projection.provenance.source_kind,
              sourceConnectionId: projection.provenance.source_connection_id ?? null,
            })
          }
          const builder = options.wrapBuilder ? options.wrapBuilder(baseBuilder) : baseBuilder

          await options.indexerService.reindexEntity(
            projection.entity_module,
            projection.entity_id,
            builder,
          )
          summary.projectionsSynced += 1
          totalProjections += 1
        }

        cursor = page.next_cursor
      } while (cursor)

      if (options.pruneMissing && options.db) {
        ensureAdapterVerticalPruneScopes(seenBySource, adapter, connectionId, verticalFilter)
        for (const seen of seenBySource.values()) {
          const withdrawn = await markMissingSourcedEntriesWithdrawn(options.db, {
            entityModule: seen.entityModule,
            sourceKind: seen.sourceKind,
            sourceConnectionId: seen.sourceConnectionId,
            seenEntityIds: seen.entityIds,
          })
          for (const row of withdrawn) {
            await options.indexerService.deleteEntity(row.entity_module, row.entity_id)
          }
          summary.withdrawnProjections += withdrawn.length
        }
      }
    } catch (error) {
      if (!options.continueOnError) throw error
      // Partial writes stay written; pruning above is skipped for this
      // connection so a failed pass never withdraws its existing rows.
      const message = error instanceof Error ? error.message : String(error)
      summary.error = message
      failures.push({ connectionId, adapter: adapter.kind, error: message })
    }

    summary.verticalsTouched = [...verticals]
    adapterSummaries.push(summary)
  }

  return { adapters: adapterSummaries, totalProjections, skippedConnections, failures }
}

/**
 * True for the registry's synthetic key for an adapter registered without a
 * connection record (`register(adapter)` stores `default:<kind>`).
 */
function isUnscopedRegistration(connectionId: string, kind: string): boolean {
  return connectionId === `default:${kind}`
}

function toProjectionMap(fields: Record<string, unknown>): ReadonlyMap<string, unknown> {
  return new Map(Object.entries(fields))
}

type SourcedSeenSet = {
  entityModule: string
  sourceKind: string
  sourceConnectionId?: string | null
  entityIds: Set<string>
}

function trackSeenSourcedProjection(
  seenBySource: Map<string, SourcedSeenSet>,
  input: {
    entityModule: string
    entityId: string
    sourceKind: string
    sourceConnectionId?: string | null
  },
): void {
  const key = sourceScopeKey(input)
  let seen = seenBySource.get(key)
  if (!seen) {
    seen = {
      entityModule: input.entityModule,
      sourceKind: input.sourceKind,
      sourceConnectionId: input.sourceConnectionId,
      entityIds: new Set(),
    }
    seenBySource.set(key, seen)
  }
  seen.entityIds.add(input.entityId)
}

function ensureAdapterVerticalPruneScopes(
  seenBySource: Map<string, SourcedSeenSet>,
  adapter: SourceAdapter,
  connectionId: string,
  verticalFilter: Set<string> | undefined,
): void {
  const verticals = adapter.capabilities.verticals.filter(
    (vertical) => !verticalFilter || verticalFilter.has(vertical),
  )
  for (const entityModule of verticals) {
    const input = {
      entityModule,
      sourceKind: adapter.kind,
      sourceConnectionId: connectionId,
    }
    const key = sourceScopeKey(input)
    if (seenBySource.has(key)) continue
    seenBySource.set(key, {
      ...input,
      entityIds: new Set(),
    })
  }
}

function sourceScopeKey(input: {
  entityModule: string
  sourceKind: string
  sourceConnectionId?: string | null
}): string {
  return `${input.entityModule}\u0000${input.sourceKind}\u0000${input.sourceConnectionId ?? ""}`
}
