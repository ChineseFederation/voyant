---
"@voyant-travel/graph-contracts": minor
"@voyant-travel/core": patch
---

Extract the graph declaration surface into `@voyant-travel/graph-contracts`, so
an adapter, app, or channel author can declare a package without the runtime
kernel.

`defineAdapter`, `defineExtension`, `defineModule`, `defineProvider`,
`defineProject`, the port helpers, and the graph types move out of
`@voyant-travel/core`. The new package has no dependencies.
`@voyant-travel/core/project` re-exports it, so no existing import changes.

`definePlugin` and `VOYANT_GRAPH_PLUGIN_SCHEMA_VERSION` are deprecated: RFC
#3395 retired "plugin" as a classification. They still export so external
adapters keep building while they migrate to `defineAdapter`.
