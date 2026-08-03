# @voyant-travel/graph-contracts

How a package declares itself into a Voyant deployment graph — `defineAdapter`,
`defineExtension`, `defineModule`, `defineProvider`, `defineProject`, the port
helpers, and the graph types they produce.

This package exists so an adapter, app, or channel author can declare a package
**without depending on the runtime kernel**. These declarations previously lived
in `@voyant-travel/core`, which meant an external adapter needed the DI
container, registry, event bus, saga, and locking in order to describe itself —
and, where it was a peer dependency, so did everyone installing that adapter.

It has no dependencies at all.

## Install

```bash
pnpm add @voyant-travel/graph-contracts
```

## Declaring an adapter

```ts
import { defineAdapter } from "@voyant-travel/graph-contracts"

export default defineAdapter({
  id: "@acme/algolia-adapter",
  packageName: "@acme/algolia-adapter",
  localId: "algolia-adapter",
  config: [{ id: "@acme/algolia-adapter#config.app-id", key: "ALGOLIA_APP_ID", required: true }],
  secrets: [{ id: "@acme/algolia-adapter#secret.api-key", key: "ALGOLIA_API_KEY", required: true }],
  providers: [
    {
      id: "@acme/algolia-adapter#provider.algolia",
      port: "catalog.indexer",
      selection: { role: "search", value: "algolia" },
      runtime: { entry: "@acme/algolia-adapter/provider", export: "createAlgoliaIndexer" },
    },
  ],
})
```

Point your package manifest at it:

```json
{ "voyant": { "schemaVersion": "voyant.package.v1", "kind": "adapter", "manifest": "./voyant" } }
```

## Choosing a helper

| Helper | For |
|---|---|
| `defineAdapter` | a vendor or channel integration — search, payments, inventory sources |
| `defineExtension` | a first-party contribution to an existing module's graph |
| `defineModule` | a domain module that owns schema and routes |
| `defineProvider` | an implementation bound to a declared port |
| `defineProject` | a deployment's own graph |

`definePlugin` is **deprecated**. RFC #3395 retired "plugin" as a
classification; integrations are apps or adapters. It still exports so existing
adapters keep building while they migrate to `defineAdapter`.

## Related

- `@voyant-travel/catalog-contracts` — implement an inventory channel:
  `SourceAdapter` to receive, `PushBooking`/`PushAvailability`/`PushContent` to push
- `@voyant-travel/app-manifest` — declare a marketplace app release
- `@voyant-travel/core` — the runtime kernel, which you should not need for a
  declaration. `@voyant-travel/core/project` re-exports this package.
