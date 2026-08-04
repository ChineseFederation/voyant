# @voyant-travel/flights-contracts

## 0.104.18

### Patch Changes

- Updated dependencies [d2a571f]
  - @voyant-travel/catalog-contracts@0.118.0

## 0.104.17

### Patch Changes

- Updated dependencies [06a79a0]
  - @voyant-travel/catalog-contracts@0.117.0

## 0.104.16

### Patch Changes

- Updated dependencies [4c694f6]
  - @voyant-travel/catalog-contracts@0.116.0

## 0.104.15

### Patch Changes

- dcda88d: Describe every package on the public surface.

  The npm assembly path is now private — the deployment ships as an image — so the
  published surface is the fourteen packages an external adapter, connector, or
  extension author builds against. Each now says what it is for.

- Updated dependencies [dcda88d]
  - @voyant-travel/catalog-contracts@0.115.2

## 0.104.14

### Patch Changes

- Updated dependencies [e93c0a7]
  - @voyant-travel/catalog-contracts@0.115.0

## 0.104.13

### Patch Changes

- Updated dependencies [79606bb]
  - @voyant-travel/catalog-contracts@0.114.0

## 0.104.12

### Patch Changes

- Updated dependencies [5d3b563]
- Updated dependencies [f25ad34]
- Updated dependencies [2601445]
  - @voyant-travel/catalog-contracts@0.113.0

## 0.104.11

### Patch Changes

- Updated dependencies [d9ff078]
  - @voyant-travel/catalog-contracts@0.112.0

## 0.104.10

### Patch Changes

- Updated dependencies [0808b21]
  - @voyant-travel/catalog-contracts@0.111.0

## 0.104.9

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
  - @voyant-travel/catalog-contracts@0.110.1

## 0.104.8

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/catalog-contracts@0.110.0

## 0.104.7

### Patch Changes

- Updated dependencies [4829ef3]
  - @voyant-travel/catalog-contracts@0.109.0

## 0.104.6

### Patch Changes

- 2427218: Create flight order payment sessions for bank-transfer booking intents.

## 0.104.5

### Patch Changes

- Updated dependencies [6a0edd2]
  - @voyant-travel/catalog-contracts@0.108.0

## 0.104.4

### Patch Changes

- Updated dependencies [e3fa849]
  - @voyant-travel/catalog-contracts@0.107.0

## 0.104.3

### Patch Changes

- Updated dependencies [7122c2a]
  - @voyant-travel/catalog-contracts@0.106.0

## 0.104.2

### Patch Changes

- Updated dependencies [921f4fc]
  - @voyant-travel/catalog-contracts@0.105.0

## 0.104.1

### Patch Changes

- @voyant-travel/catalog-contracts@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/catalog-contracts@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/catalog-contracts@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/catalog-contracts@0.102.0

## 0.101.2

### Patch Changes

- @voyant-travel/catalog-contracts@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/catalog-contracts@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/catalog-contracts@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/catalog-contracts@0.100.0

## 0.99.0

### Minor Changes

- c893886: Complete `flights-contracts` by moving the flight snapshot builder into it.

  `@voyant-travel/catalog-contracts` now exports `./snapshot` with `PricingBasis` and
  `CaptureSnapshotInput` — pure shapes that were embedded in catalog runtime files
  (`services/snapshot-service.ts`, `snapshot/schema.ts`). `@voyant-travel/catalog`
  re-exports them from their original paths, so every consumer
  (accommodations/charters/cruises/extras/products, catalog-ui) is unchanged.

  `@voyant-travel/flights-contracts` now owns `snapshot.ts` (importing the snapshot
  types from `@voyant-travel/catalog-contracts/snapshot`), so the flight snapshot
  builder no longer needs the catalog runtime. `@voyant-travel/flights/snapshot`
  re-exports it. Resolves #1449.

### Patch Changes

- Updated dependencies [c893886]
  - @voyant-travel/catalog-contracts@0.99.0

## 0.98.0

## 0.97.0

### Minor Changes

- 2555264: Extract two more contract surfaces into lightweight packages, closing the
  remaining gaps in the `*-contracts` pattern (ADR-0002 / ADR-0003).

  `@voyant-travel/flights-contracts` (new, zod-only) now owns the pure flight
  `SourceAdapter` contract, request/response schemas, post-book types, and the
  reference-data shapes (`contract/{types,adapter,schemas,post-book-types}`,
  `reference/{contract,static-bundle}`), so flight-provider adapter authors and
  external consumers can integrate without the flights runtime (Drizzle/DB).

  `@voyant-travel/catalog-contracts` gains the pure booking-engine contracts —
  `booking-engine/contracts` (the `BookingDraft` + V1 engine schemas) and
  `booking-engine/promotions-contract` — which were previously trapped in the
  catalog runtime.

  The runtime `@voyant-travel/flights` and `@voyant-travel/catalog` packages re-export from
  the contract packages, so existing `@voyant-travel/flights/contract/*`,
  `@voyant-travel/flights/reference/*`, and `@voyant-travel/catalog/booking-engine/*` import
  paths are unchanged.

  Note: `@voyant-travel/flights`' `snapshot.ts` stays in the runtime for now — it
  depends on catalog's `CaptureSnapshotInput` / `PricingBasis`, which still live in
  catalog runtime files (`services/snapshot-service.ts`, `snapshot/schema.ts`).
  Carving those pure shapes into `catalog-contracts` (which would let the flight
  snapshot move too) is a tracked follow-up.
