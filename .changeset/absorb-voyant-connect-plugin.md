---
"@voyant-travel/plugin-voyant-connect": patch
"@voyant-travel/catalog": patch
"@voyant-travel/framework": patch
"@voyant-travel/operator-standard": patch
---

Move the Voyant Connect sources plugin into the monorepo at
`packages/plugins/voyant-connect` and consume it as a workspace package.

`packages/catalog` previously depended on the published plugin, whose peer
ranges resolved back to `@voyant-travel/catalog` and `@voyant-travel/cruises`.
That cycle meant the monorepo could not resolve its own lockfile until its own
publish had landed, and it dragged a stale `@voyant-travel/bookings-contracts`
into catalog's resolution — breaking two catalog suites on import. Both are
fixed by the move.

The plugin keeps its registry dependencies on `@voyant-travel/connect-adapter`,
`connect-cruises`, `connect-sdk`, and `data-sdk`: those are Connect's own public
surface and remain in the connect repository.
