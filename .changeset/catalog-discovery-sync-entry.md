---
"@voyant-travel/catalog": minor
---

Expose a deployment-callable catalog discovery sync so sourced inventory reaches
catalog browse.

`syncSources()` needed the composed catalog `services` — the resolved indexer
provider, field-policy registries, slice set, embedding provider, and a warmed
source registry. That composition lives inside the framework runtime host, so a
managed deployment could resolve Connect connections for live booking but had no
supported way to index their catalog. Connectors showed 0 results in admin
browse.

- New `@voyant-travel/catalog/sources-sync-job` entry: `runCatalogDiscoverySync(
  { env, db, services }, options)` composes the indexer stack the same way the
  projection/reindex path does and runs one discovery pass.
- New `catalog.sync-sources` job — scheduled hourly (with eager/economical
  profiles) and `wakeup: true`, so adding a connection can trigger an immediate
  pass.
- New `catalog.sources-sync-job` runtime port, provided by the catalog runtime
  contributor; deployments never assemble `services` by hand.

Discovered projections land in every slice the deployment materializes, which
always includes the `market: "default"` / `locale: "en-GB"` staff and customer
slices the admin browse queries. Withdrawal pruning is opt-in (`pruneMissing`)
so a partial pass can never empty the browse index.

`syncSources` gains two related fixes, both reached through the new entry:

- It no longer discovers through an unscoped `default:<kind>` registration when
  the same kind also has connection-scoped adapters. Adapters forward that
  synthetic key upstream as a real connection id, and it lands in provenance as
  `source_connection_id` on projections missing one — which then fails to
  resolve on the live-book path. Reported as `summary.skippedConnections`.
- New `continueOnError` option isolates a per-connection `discover()` rejection
  (recorded in `summary.failures`) instead of aborting the fan-out, so one
  unhealthy supplier cannot starve every other catalog. Off by default, so the
  cruise refresh and CLI callers keep surfacing the first failure.

`SyncAdapterSummary` gains `connectionId` and an optional `error`;
`SyncSourcesSummary` gains `skippedConnections` and `failures`.

The scheduled job re-enumerates connections via a new
`refreshBookingEngineConnectSources` rather than reusing the memoized
per-isolate warm — otherwise a resident Node deployment would keep syncing the
connection set it saw first, and the connection-add wakeup would do nothing
until restart.
