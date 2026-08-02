/**
 * Re-export of the publisher-facing compiler so existing
 * `@voyant-travel/apps/compiler` imports keep working.
 *
 * The manifest schema and compiler moved to `@voyant-travel/app-manifest` so a
 * publisher can compile and digest a release without depending on this package,
 * which is the host-side runtime module — routes, services, Drizzle schema,
 * OAuth, and ingestion.
 */
export * from "@voyant-travel/app-manifest/compiler"
