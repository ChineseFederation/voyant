# @voyant-travel/cruises-contracts

## 0.105.31

### Patch Changes

- Updated dependencies [c164b40]
  - @voyant-travel/catalog-contracts@0.132.0

## 0.105.30

### Patch Changes

- Updated dependencies [b95e995]
- Updated dependencies [b760ac6]
  - @voyant-travel/catalog-contracts@0.131.0

## 0.105.29

### Patch Changes

- Updated dependencies [6b672c0]
- Updated dependencies [03a91d0]
  - @voyant-travel/catalog-contracts@0.130.0

## 0.105.28

### Patch Changes

- Updated dependencies [21a28ef]
  - @voyant-travel/catalog-contracts@0.129.0

## 0.105.27

### Patch Changes

- Updated dependencies [688f164]
  - @voyant-travel/catalog-contracts@0.128.0

## 0.105.26

### Patch Changes

- Updated dependencies [56e2050]
  - @voyant-travel/catalog-contracts@0.127.0

## 0.105.25

### Patch Changes

- Updated dependencies [6c77f7d]
  - @voyant-travel/catalog-contracts@0.126.0

## 0.105.24

### Patch Changes

- Updated dependencies [076c246]
  - @voyant-travel/catalog-contracts@0.125.0

## 0.105.23

### Patch Changes

- Updated dependencies [9ef6a65]
- Updated dependencies [9ef6a65]
  - @voyant-travel/catalog-contracts@0.124.0

## 0.105.22

### Patch Changes

- Updated dependencies [ef8871d]
  - @voyant-travel/catalog-contracts@0.123.0

## 0.105.21

### Patch Changes

- Updated dependencies [b52433d]
  - @voyant-travel/catalog-contracts@0.122.0

## 0.105.20

### Patch Changes

- Updated dependencies [0976af1]
  - @voyant-travel/catalog-contracts@0.121.0

## 0.105.19

### Patch Changes

- Updated dependencies [9b9e8ac]
  - @voyant-travel/catalog-contracts@0.120.0

## 0.105.18

### Patch Changes

- Updated dependencies [da20433]
  - @voyant-travel/catalog-contracts@0.119.0

## 0.105.17

### Patch Changes

- Updated dependencies [d2a571f]
  - @voyant-travel/catalog-contracts@0.118.0

## 0.105.16

### Patch Changes

- Updated dependencies [06a79a0]
  - @voyant-travel/catalog-contracts@0.117.0

## 0.105.15

### Patch Changes

- Updated dependencies [4c694f6]
  - @voyant-travel/catalog-contracts@0.116.0

## 0.105.14

### Patch Changes

- dcda88d: Describe every package on the public surface.

  The npm assembly path is now private — the deployment ships as an image — so the
  published surface is the fourteen packages an external adapter, connector, or
  extension author builds against. Each now says what it is for.

- Updated dependencies [dcda88d]
  - @voyant-travel/catalog-contracts@0.115.2

## 0.105.13

### Patch Changes

- Updated dependencies [e93c0a7]
  - @voyant-travel/catalog-contracts@0.115.0

## 0.105.12

### Patch Changes

- Updated dependencies [79606bb]
  - @voyant-travel/catalog-contracts@0.114.0

## 0.105.11

### Patch Changes

- Updated dependencies [5d3b563]
- Updated dependencies [f25ad34]
- Updated dependencies [2601445]
  - @voyant-travel/catalog-contracts@0.113.0

## 0.105.10

### Patch Changes

- 6da86c6: Move the pure `MemoizeOptions` type into `@voyant-travel/cruises-contracts` and
  `@voyant-travel/charters-contracts` so external consumers can reference the
  adapter cache option shape without taking a runtime dependency on the cruises
  or charters modules (ADR-0002).

  The `@voyant-travel/cruises` and `@voyant-travel/charters` runtimes re-export
  `MemoizeOptions` from their contracts package, so existing importers keep
  working — no breaking change.

## 0.105.9

### Patch Changes

- Updated dependencies [d9ff078]
  - @voyant-travel/catalog-contracts@0.112.0

## 0.105.8

### Patch Changes

- Updated dependencies [0808b21]
  - @voyant-travel/catalog-contracts@0.111.0

## 0.105.7

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
  - @voyant-travel/catalog-contracts@0.110.1

## 0.105.6

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/catalog-contracts@0.110.0

## 0.105.5

### Patch Changes

- Updated dependencies [4829ef3]
  - @voyant-travel/catalog-contracts@0.109.0

## 0.105.4

### Patch Changes

- Updated dependencies [6a0edd2]
  - @voyant-travel/catalog-contracts@0.108.0

## 0.105.3

### Patch Changes

- fe6af54: Defer the cross-package `boardBasisSchema` dereference in the product and cruise `content-shape` schemas with `z.lazy(() => boardBasisSchema)`.

  It was dereferenced at module-evaluation time, so app worker bundles (rolldown/vite) that split it into a circular chunk observed it `undefined` and threw `TypeError: Cannot read properties of undefined (reading 'nullable')`, 500ing every catalog read. No change to validation behavior or inferred types.

## 0.105.2

### Patch Changes

- Updated dependencies [e3fa849]
  - @voyant-travel/catalog-contracts@0.107.0

## 0.105.1

### Patch Changes

- Updated dependencies [7122c2a]
  - @voyant-travel/catalog-contracts@0.106.0

## 0.105.0

### Minor Changes

- 921f4fc: Add a canonical board-basis contract enum and reuse it across accommodation meal plans, product options, and cruise sailings.

### Patch Changes

- Updated dependencies [921f4fc]
  - @voyant-travel/catalog-contracts@0.105.0

## 0.104.2

### Patch Changes

- 23a3dad: Thread rich cruise cabin and ship media through the sourced content contract and catalog detail UI.

## 0.104.1

## 0.104.0

## 0.103.0

## 0.102.0

## 0.101.2

## 0.101.1

### Patch Changes

- 26c6908: Fix sourced cruises rendering blank in the catalog (#1466).

  - `@voyant-travel/cruises`: the catalog source-adapter shim (`toCatalogProjection`) now emits the field-policy keys the indexer and catalog UI expect (`cruiseType`, `nights`, `status`, `heroImageUrl`/`thumbnailUrl`, `lowestPriceCached`, `lineSupplierId`/`defaultShipId`, `source.kind`/`source.ref`) instead of unrecognized snake*case keys that were silently dropped — so sourced cruises carry Type/Nights/Status/Supplier/Ship/Price/Source into the index. `CruiseSearchProjectionEntry` gains `lineExternalId`/`shipExternalId` (surfaced by `@voyant-travel/connect-cruises` ≥0.3.1). The content route (`GET /:key/content`) and `parseUnifiedKey` now accept the catalog sourced entity-id form (`crus_sr*<base64>`) via the new `isEncodedSourceEntityId`helper, and dispatch sourced ids without the owned-key opt-in — previously they returned`400 invalid_key`, leaving the detail sheet empty. Adds `getCruiseSailingPricing`+ a`GET /:key/sailings/:sailingExternalId/pricing`content route serving live per-cabin pricing for sourced sailings (volatile-live, fetched fresh — never cached). The source-adapter shim now drops a sailing's`lowest_price_cents`/`currency` unless both are present (the content schema requires both-or-neither) so an adapter that surfaces a price without its currency can't fail content validation.
  - `@voyant-travel/catalog-ui`: `createCatalogEnrichmentFetchers` routes the detail-content fetch per vertical via `contentBasePathByVertical`, and `CatalogPage` wires `onLoadDetail` on every vertical tab (not just products) so non-product detail sheets (cruises, etc.) actually fetch their enrichment from the correct content route. Adds `loadDeparturePricing` (lazy per-cabin pricing fetched on departure-row expand, matched to cabins by code → per-cabin price + availability). The detail sheet labels the cruise options tab "Cabins", renders the entity id as a compact copyable chip, falls back the Itinerary tab to the first sailing's stops, and sanitizes cabin names + descriptions (strips HTML tags and decodes entities like `&nbsp;`). Cabin cards are redesigned as a photo gallery (new `MediaGallery` — a carousel thumbnail that opens a full-screen lightbox carousel on click) alongside size (sqft), capacity, description, and de-duplicated amenity chips. The Overview drops the canonical-geography id columns (`country_iso`/`region_ids`/`port_ids`/`waterway_ids`) and empty array rows, and adds a media gallery (cruise cover + cabin photos) when imagery is available.
  - `@voyant-travel/catalog-ui`: the cruise detail sheet gains a **Ship** tab showing the vessel the cruise sails on — gallery (carousel + lightbox), name/type, key specs (capacity, decks, year built) and description.
  - `@voyant-travel/catalog-ui`: for the cruises vertical the detail sheet's **Departures** tab is relabeled **Sailings** (industry term), along with its empty-state and filtered no-results copy — other verticals keep "Departures".
  - `@voyant-travel/cruises-contracts`: the cabin-category content shape gains `images` + `square_feet` so cabin photos and size flow end-to-end (the cruise shim maps them from the adapter's `images`/`floorplanImages`/`squareFeet`; the data was previously dropped). The ship content shape gains `ship_type` + `gallery` so the vessel's class and photos reach the Ship tab.

## 0.101.0

## 0.100.0

## 0.99.0

## 0.98.0

## 0.97.0

## 0.96.0

### Minor Changes

- 2d8d59b: Add lightweight catalog and cruises contract packages for external consumers.

  `@voyant-travel/catalog-contracts` now owns the pure catalog adapter contracts,
  adapter Zod schemas, field-policy contracts, provenance, drift event payloads,
  and pure content locale/overlay helpers. `@voyant-travel/cruises-contracts` now owns
  the `cruises/v1` rich content schema (including the cabin feature, bed,
  accessibility, and view-type facet vocabularies), version, types, and validator.

  The pure content primitives (`isStale`, `pickBestCachedLocale`, the JSON-pointer
  overlay applier, and `mergeOverlaysIntoContent`) now have a single source of
  truth in `@voyant-travel/catalog-contracts`; `@voyant-travel/catalog`'s content service
  re-exports them and retains only the runtime-bound (Drizzle/Postgres) primitives.
  The cruise cabin facet vocabularies likewise live in `@voyant-travel/cruises-contracts`
  and are re-exported from `@voyant-travel/cruises`.

  The existing `@voyant-travel/catalog` and `@voyant-travel/cruises` contract import paths
  remain available through compatibility re-exports.
