/**
 * Re-export of the graph declaration surface so existing
 * `@voyant-travel/core/project` imports keep working.
 *
 * The declarations moved to `@voyant-travel/graph-contracts` so an adapter, app,
 * or channel author can declare a package without depending on this runtime
 * kernel — the DI container, registry, event bus, saga, and locking.
 */
export * from "@voyant-travel/graph-contracts"
