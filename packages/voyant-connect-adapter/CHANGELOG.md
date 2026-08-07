# @voyant-travel/plugin-voyant-connect

## 0.25.0

### Patch Changes

- Updated dependencies [21a28ef]
  - @voyant-travel/catalog-contracts@0.129.0
  - @voyant-travel/catalog@0.252.0

## 0.24.1

### Patch Changes

- Updated dependencies [1e0506f]
  - @voyant-travel/graph-contracts@0.5.0

## 0.24.0

### Patch Changes

- Updated dependencies [688f164]
  - @voyant-travel/catalog-contracts@0.128.0
  - @voyant-travel/catalog@0.251.0

## 0.23.0

### Patch Changes

- Updated dependencies [56e2050]
  - @voyant-travel/catalog-contracts@0.127.0
  - @voyant-travel/catalog@0.250.0

## 0.22.1

### Patch Changes

- Updated dependencies [4f9a097]
  - @voyant-travel/graph-contracts@0.4.0

## 0.22.0

### Patch Changes

- Updated dependencies [7b8ef95]
  - @voyant-travel/catalog@0.249.0

## 0.21.0

### Patch Changes

- Updated dependencies [6c77f7d]
  - @voyant-travel/catalog-contracts@0.126.0
  - @voyant-travel/catalog@0.248.0

## 0.20.0

### Patch Changes

- Updated dependencies [380dad7]
  - @voyant-travel/catalog@0.247.0

## 0.19.0

### Patch Changes

- Updated dependencies [e8bd000]
  - @voyant-travel/catalog@0.246.0

## 0.18.0

### Patch Changes

- Updated dependencies [076c246]
  - @voyant-travel/catalog-contracts@0.125.0
  - @voyant-travel/catalog@0.245.0

## 0.17.0

### Patch Changes

- Updated dependencies [9ef6a65]
- Updated dependencies [9ef6a65]
  - @voyant-travel/catalog-contracts@0.124.0
  - @voyant-travel/catalog@0.244.0

## 0.16.0

### Patch Changes

- Updated dependencies [ef8871d]
  - @voyant-travel/catalog-contracts@0.123.0
  - @voyant-travel/catalog@0.243.0

## 0.15.0

### Patch Changes

- Updated dependencies [b52433d]
  - @voyant-travel/catalog-contracts@0.122.0
  - @voyant-travel/catalog@0.242.0

## 0.14.0

### Patch Changes

- Updated dependencies [0976af1]
  - @voyant-travel/catalog-contracts@0.121.0
  - @voyant-travel/catalog@0.241.0

## 0.13.0

### Patch Changes

- Updated dependencies [9b9e8ac]
  - @voyant-travel/catalog-contracts@0.120.0
  - @voyant-travel/catalog@0.240.0
  - @voyant-travel/cruises@0.238.0

## 0.12.0

### Patch Changes

- Updated dependencies [da20433]
  - @voyant-travel/catalog-contracts@0.119.0
  - @voyant-travel/catalog@0.239.0
  - @voyant-travel/cruises@0.237.0

## 0.11.0

### Patch Changes

- Updated dependencies [d2a571f]
  - @voyant-travel/catalog-contracts@0.118.0
  - @voyant-travel/catalog@0.238.0
  - @voyant-travel/cruises@0.236.0

## 0.10.1

### Patch Changes

- Updated dependencies [d432646]
  - @voyant-travel/graph-contracts@0.3.0

## 0.10.0

### Patch Changes

- Updated dependencies [06a79a0]
  - @voyant-travel/catalog-contracts@0.117.0
  - @voyant-travel/catalog@0.237.0

## 0.9.0

### Patch Changes

- Updated dependencies [c35841b]
- Updated dependencies [e4833a1]
  - @voyant-travel/catalog@0.236.0
  - @voyant-travel/graph-contracts@0.2.0

## 0.8.0

### Patch Changes

- Updated dependencies [4c694f6]
  - @voyant-travel/catalog@0.235.0
  - @voyant-travel/catalog-contracts@0.116.0

## 0.7.0

### Patch Changes

- Updated dependencies [eeaa5b5]
  - @voyant-travel/catalog@0.234.0
  - @voyant-travel/cruises@0.235.0

## 0.6.0

### Patch Changes

- @voyant-travel/catalog@0.233.0
- @voyant-travel/cruises@0.234.0

## 0.5.0

### Minor Changes

- 051e6e3: Resolve the catalog's inventory channel through a runtime port instead of
  importing Voyant Connect.

  `CatalogSourcesRuntimeExtension` is the channel contract — `registerFallback`
  for the synchronous cold window, `warm` for per-connection enumeration, and
  `resolveDestinationNames`. It is optional: a deployment may bind no channel.

  Voyant Connect now provides that port rather than being imported by the catalog
  spine, so it is one channel implementation and a self-hosted integration can
  provide its own. This also removes the
  `catalog -> plugin-voyant-connect -> cruises -> catalog` dependency cycle, which
  had been hiding as a build-ordering race.

- 536ebfc: Remove the last vendor references from the catalog spine.

  `offers-runtime` resolved its offers client by importing
  `@voyant-travel/connect-sdk` directly, contradicting the design already stated
  in `offers/operator-routes.ts` — _"the package never imports
  `@voyant-travel/connect-sdk`"_. The channel now supplies that client through
  `CatalogSourcesRuntimeExtension.createOffersClient`, and catalog no longer
  depends on the SDK.

  `BookingEngineEnv` named seven `VOYANT_*`/`VOYANT_CONNECT_*` variables that
  nothing in catalog read; they were passed straight to the channel. It is now an
  opaque environment record.

### Patch Changes

- Updated dependencies [051e6e3]
- Updated dependencies [536ebfc]
- Updated dependencies [c986bd5]
- Updated dependencies [9f412dd]
  - @voyant-travel/catalog@0.232.0
  - @voyant-travel/graph-contracts@0.1.0
  - @voyant-travel/cruises@0.233.0

## 0.4.0

### Patch Changes

- 5ed518e: Move the Voyant Connect sources plugin into the monorepo at
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

- Updated dependencies [5ed518e]
- Updated dependencies [15c1c64]
  - @voyant-travel/catalog@0.231.0
  - @voyant-travel/cruises@0.232.0

## 0.3.3

### Patch Changes

- Updated dependencies [50f382f]
- Updated dependencies [c256cfc]
  - @voyant-travel/connect-adapter@0.5.0
  - @voyant-travel/connect-sdk@0.10.0
  - @voyant-travel/connect-cruises@0.6.2

## 0.3.2

### Patch Changes

- Updated dependencies [909e371]
  - @voyant-travel/connect-adapter@0.4.0

## 0.3.1

### Patch Changes

- 1205cf7: `listVoyantConnectSourceConnections` no longer issues a redundant per-connection
  `get()` to enrich each row. `connections.list` already returns the full
  `ConnectionSummary` (`id`/`status`/`providerKey`/`supplierName`) — the same shape
  `get` returns — so enumeration is now a single round-trip instead of `1 + N`,
  shedding N requests against the Connect control plane per warm. No behavior or
  API change.

## 0.3.0

### Minor Changes

- dd463c1: `prepareVoyantConnectSources` can now build enumerate-path sources without a
  network connection enumeration, and threads cruise read memoization through both
  planes (#94):

  - `connections` — pass a pre-fetched connection list to skip the `list()` call.
  - `connectionCache` — a read-through `{ get, set }` hook (e.g. backed by Workers
    KV) so a cold isolate can reuse the serializable connection list.
  - `cruise` — forwarded to both the default and per-connection sources, so
    `cruise.memoize` wraps cruise reads consistently across both.

  All additive; existing callers are unaffected.

## 0.2.3

### Patch Changes

- 0130564: Relicense the public Connect packages from `FSL-1.1-Apache-2.0` to `Apache-2.0`.
  The root `LICENSE` is replaced with the standard Apache License 2.0 text.
- Updated dependencies [0130564]
  - @voyant-travel/connect-sdk@0.9.1
  - @voyant-travel/connect-adapter@0.3.2
  - @voyant-travel/connect-cruises@0.6.1

## 0.2.2

### Patch Changes

- 8ebf113: Move `@voyant-travel/plugin-voyant-connect` into the Connect repo alongside the
  other public Connect packages. It now consumes `@voyant-travel/connect-sdk`,
  `@voyant-travel/connect-adapter`, and `@voyant-travel/connect-cruises` from the
  workspace, and declares `@voyant-travel/catalog`, `@voyant-travel/cruises`, and
  `@voyant-travel/data-sdk` as peer dependencies provided by the host deployment.

  Because `connect-cruises` now returns vertical-conformant ship shapes, the
  internal `conformConnectCruiseAdapter` bridge and the `as CruiseAdapter` cast in
  the cruise source are removed — `createConnectCruiseAdapter` is used directly.

- Updated dependencies [dbfe4c2]
  - @voyant-travel/connect-cruises@0.6.0
