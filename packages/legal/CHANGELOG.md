# @voyant-travel/legal

## 0.249.5

### Patch Changes

- 5f6e799: Add a canonical immutable cancellation-policy snapshot, a server-side snapshot producer, and fail-closed evaluation of frozen terms.
- Updated dependencies [5f6e799]
- Updated dependencies [18fef07]
  - @voyant-travel/legal-contracts@0.108.3
  - @voyant-travel/bookings@0.240.7

## 0.249.4

### Patch Changes

- Updated dependencies [8fc2d25]
  - @voyant-travel/commerce@0.49.0
  - @voyant-travel/finance@0.245.2
  - @voyant-travel/bookings@0.240.5

## 0.249.3

### Patch Changes

- Updated dependencies [c8b9c1e]
  - @voyant-travel/finance@0.245.0
  - @voyant-travel/commerce@0.48.12
  - @voyant-travel/distribution@0.227.24

## 0.249.2

### Patch Changes

- Updated dependencies [afb6866]
- Updated dependencies [5d1b298]
  - @voyant-travel/db@0.121.0
  - @voyant-travel/action-ledger@0.115.16
  - @voyant-travel/bookings@0.240.3
  - @voyant-travel/commerce@0.48.11
  - @voyant-travel/distribution@0.227.23
  - @voyant-travel/finance@0.244.3
  - @voyant-travel/hono@0.142.2
  - @voyant-travel/public-document-delivery@0.4.24
  - @voyant-travel/relationships@0.133.20
  - @voyant-travel/types@0.109.13
  - @voyant-travel/core@0.140.2

## 0.249.1

### Patch Changes

- Updated dependencies [484b207]
  - @voyant-travel/finance@0.244.0
  - @voyant-travel/commerce@0.48.7
  - @voyant-travel/distribution@0.227.19

## 0.249.0

### Patch Changes

- Updated dependencies [7b8ef95]
- Updated dependencies [f56d552]
  - @voyant-travel/core@0.140.0
  - @voyant-travel/inventory@0.40.0
  - @voyant-travel/action-ledger@0.115.15
  - @voyant-travel/bookings@0.240.1
  - @voyant-travel/commerce@0.48.6
  - @voyant-travel/db@0.120.6
  - @voyant-travel/distribution@0.227.18
  - @voyant-travel/finance@0.243.1
  - @voyant-travel/hono@0.142.1
  - @voyant-travel/public-document-delivery@0.4.23
  - @voyant-travel/relationships@0.133.19
  - @voyant-travel/storage@0.115.4

## 0.248.1

### Patch Changes

- Updated dependencies [1be6b76]
  - @voyant-travel/finance@0.243.0
  - @voyant-travel/commerce@0.48.5
  - @voyant-travel/distribution@0.227.17

## 0.248.0

### Patch Changes

- Updated dependencies [6c77f7d]
- Updated dependencies [d98648a]
  - @voyant-travel/inventory@0.39.0
  - @voyant-travel/bookings@0.240.0
  - @voyant-travel/finance@0.242.0
  - @voyant-travel/commerce@0.48.4
  - @voyant-travel/distribution@0.227.16
  - @voyant-travel/relationships@0.133.18

## 0.247.0

### Patch Changes

- Updated dependencies [380dad7]
  - @voyant-travel/finance@0.241.0
  - @voyant-travel/inventory@0.38.0
  - @voyant-travel/commerce@0.48.3
  - @voyant-travel/distribution@0.227.15

## 0.246.0

### Minor Changes

- e8bd000: chore: retire compatibility surface nothing reaches

  Fourteen compatibility surfaces in private packages had no caller left anywhere in
  the repository — not in product code, not in tests, and in several cases not
  even a re-export. Each one is now gone rather than carried. Nothing here touches
  a published package, a database column, or an API response an external
  storefront could read; those cases are inventoried for a separate decision.

  - **`@voyant-travel/catalog`** — the `./indexer/contract` subpath and the
    one-line re-export behind it. Every importer in the repository, including
    catalog's own modules, already names
    `@voyant-travel/catalog-contracts/indexer/contract`; the contracts package has
    been the canonical dependency since the engine contracts moved out of the
    runtime. The README and the catalog/promotions architecture docs no longer
    describe the alias.
  - **`@voyant-travel/framework`** — `generateCustomSourcePluginManifests`, an
    alias of `generateCustomSourceExtensionManifests` left over from the "plugin"
    classification retirement, and the `providers` option on
    `VoyantNodeRuntimeOptions` / `createVoyantNodeApp`. The option was merged
    under `resources` on every path; no host, generated artifact or test ever
    passed it.
  - **`@voyant-travel/hono`** — `LIVE_LIMITS`, two constants from the pre-C2
    limiter. Limits are configured per policy through `RateLimitPolicy`; the
    constants were re-exported twice and read nowhere.
  - **`@voyant-travel/legal`** — `contractSeriesService.findSingleActiveByScope`,
    a pass-through to `findDefaultActiveByScope`. Callers and tests already use
    the canonical name.
  - **`@voyant-travel/finance`** — `externalProvider`, `externalNumber` and
    `externalSeriesName` on `InvoiceVoidedEvent`. The single emitter never set
    them and `invoiceVoidedPayloadSchema` is `additionalProperties: false`, so
    they could not travel to a subscriber even if something had.
  - **`@voyant-travel/finance-react`** — the `orderId` filter on
    `FinancePaymentSessionListFilters`. Its only reader was the
    `legacyOrderId ?? orderId` fallback in the query builder, which now reads
    `legacyOrderId` directly.
  - **`@voyant-travel/operations-react`** — `KpiStrip` and
    `aggregateSlotFinancials`. The roll-up summed whatever page of the allocation
    manifest happened to be loaded, using its own paid-amount rule; the departure
    workspace reads whole-departure figures from `GET /slots/{id}/summary`
    instead. `KpiStrip` was not reachable from the package surface at all.

  A second group carried no `@deprecated` tag, only a "back-compat" comment, and
  was equally unreachable:

  - **`@voyant-travel/operations`** — the `UpdateSlotRuntime` alias of
    `SlotMutationRuntime`, left over from when the runtime type covered updates
    only. Zero references, including tests.
  - **`@voyant-travel/inventory`** — the flat `productLinkable` alias of
    `inventoryProductCompatibilityLinkable`, exported from three places. Both real
    callers (inventory's and legal's `standard-links`) import the canonical symbol
    and rename it locally. The compatibility linkable itself stays: it is what
    keeps the `products` module name resolving.
  - **`@voyant-travel/inventory-react`** — `extras-compat.ts`, a forwarder to
    `./extras.js`. Its two importers were both inside the package.
  - **`@voyant-travel/bookings`** — `getLegacyTransactionLinkFromBookingOrigin`
    and `LegacyBookingTransactionLink`, a reader for pre-Voyant transaction ids on
    a booking origin. Nothing called it; its only exercise was a unit test, which
    goes with it. The origin columns and the `legacy_transaction` origin source
    are untouched — this removes a reader, not the data.
  - **`@voyant-travel/bookings-react`, `@voyant-travel/distribution-react`** — slot
    ids re-exported from the detail hosts "for backwards compatibility". Every
    consumer already imports them from the lean `./slots.js` the comment points
    at, which is the whole reason that module exists. The distribution-react one
    was already annotated as an unused export.

  The three deleted files are pinned in `retired-paths.json` so they stay deleted.

### Patch Changes

- Updated dependencies [e8bd000]
  - @voyant-travel/bookings@0.239.0
  - @voyant-travel/finance@0.240.0
  - @voyant-travel/hono@0.142.0
  - @voyant-travel/inventory@0.37.0
  - @voyant-travel/commerce@0.48.2
  - @voyant-travel/distribution@0.227.14
  - @voyant-travel/relationships@0.133.17
  - @voyant-travel/action-ledger@0.115.14

## 0.245.0

### Patch Changes

- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
  - @voyant-travel/inventory@0.36.0
  - @voyant-travel/core@0.139.0
  - @voyant-travel/hono@0.141.0
  - @voyant-travel/bookings@0.238.4
  - @voyant-travel/commerce@0.48.1
  - @voyant-travel/finance@0.239.1
  - @voyant-travel/action-ledger@0.115.13
  - @voyant-travel/db@0.120.3
  - @voyant-travel/distribution@0.227.13
  - @voyant-travel/public-document-delivery@0.4.22
  - @voyant-travel/relationships@0.133.16
  - @voyant-travel/storage@0.115.3

## 0.244.0

### Patch Changes

- Updated dependencies [076c246]
  - @voyant-travel/inventory@0.35.0
  - @voyant-travel/commerce@0.48.0
  - @voyant-travel/distribution@0.227.12

## 0.243.0

### Patch Changes

- Updated dependencies [3d793c1]
  - @voyant-travel/inventory@0.34.0
  - @voyant-travel/commerce@0.47.11

## 0.242.0

### Patch Changes

- Updated dependencies [9b9e8ac]
  - @voyant-travel/inventory@0.33.0
  - @voyant-travel/commerce@0.47.9
  - @voyant-travel/distribution@0.227.7

## 0.241.0

### Patch Changes

- Updated dependencies [da20433]
  - @voyant-travel/inventory@0.32.0
  - @voyant-travel/commerce@0.47.8
  - @voyant-travel/distribution@0.227.6

## 0.240.0

### Patch Changes

- Updated dependencies [d2a571f]
  - @voyant-travel/inventory@0.31.0
  - @voyant-travel/commerce@0.47.7
  - @voyant-travel/distribution@0.227.5

## 0.239.0

### Patch Changes

- Updated dependencies [645a219]
- Updated dependencies [b7bb6c8]
  - @voyant-travel/inventory@0.30.0
  - @voyant-travel/finance@0.239.0
  - @voyant-travel/commerce@0.47.6
  - @voyant-travel/distribution@0.227.4

## 0.238.2

### Patch Changes

- Updated dependencies [3552f14]
  - @voyant-travel/core@0.138.0
  - @voyant-travel/action-ledger@0.115.12
  - @voyant-travel/bookings@0.238.2
  - @voyant-travel/commerce@0.47.5
  - @voyant-travel/db@0.120.2
  - @voyant-travel/distribution@0.227.3
  - @voyant-travel/finance@0.238.1
  - @voyant-travel/hono@0.140.1
  - @voyant-travel/public-document-delivery@0.4.21
  - @voyant-travel/relationships@0.133.15
  - @voyant-travel/storage@0.115.2

## 0.238.1

### Patch Changes

- 7e35584: Give the quotes → proposals rename a migration path for existing deployments.

  The rename was applied by editing shipped baselines in place, so every
  deployment provisioned before it was blocked from upgrading:
  `MigrationImmutabilityError` on the edited files, and
  `proposals/0000_proposals_baseline` either failing the baseline parity gate or
  colliding with the live `quote_*` tables.

  The collector gains **supersession**: a migration may declare the exact retired
  `(source, tag)` ledger rows it replaces, and is recorded rather than executed
  when all of them are present. Each source that owns renamed objects now ships a
  guarded adoption migration that RENAMES its legacy objects in place — tables,
  columns, constraints, indexes, enum types and enum labels — preserving rows,
  foreign keys and column defaults. Values stored as text rather than enums are
  migrated too: `custom_field_definitions.entity_type`, `booking_origins`'
  `accepted_quote_version`, and the `quotes` resource key in
  `user_profiles.permissions` and `apikey.permissions`. Hash equivalence for the
  eight edited files is declared only because those adoption migrations exist.

  Every step is a no-op on a database provisioned after the rename and on a
  re-run. `verify:migration-replay-parity` gains a lane that replays the
  pre-rename package history and fails unless it converges on a fresh replay
  exactly.

- Updated dependencies [7e35584]
  - @voyant-travel/relationships@0.133.14
  - @voyant-travel/bookings@0.238.1
  - @voyant-travel/db@0.120.1

## 0.238.0

### Patch Changes

- Updated dependencies [a3c04c4]
  - @voyant-travel/inventory@0.29.0

## 0.237.0

### Patch Changes

- Updated dependencies [06a79a0]
- Updated dependencies [2df8a92]
- Updated dependencies [06a79a0]
- Updated dependencies [038a576]
  - @voyant-travel/finance@0.238.0
  - @voyant-travel/bookings@0.238.0
  - @voyant-travel/inventory@0.28.0
  - @voyant-travel/commerce@0.47.4
  - @voyant-travel/distribution@0.227.2
  - @voyant-travel/relationships@0.133.13

## 0.236.4

### Patch Changes

- Updated dependencies [c35841b]
  - @voyant-travel/hono@0.140.0
  - @voyant-travel/action-ledger@0.115.11
  - @voyant-travel/bookings@0.237.2
  - @voyant-travel/commerce@0.47.3
  - @voyant-travel/distribution@0.227.1
  - @voyant-travel/finance@0.237.2
  - @voyant-travel/relationships@0.133.12
  - @voyant-travel/core@0.137.2

## 0.236.3

### Patch Changes

- Updated dependencies [4c694f6]
  - @voyant-travel/distribution@0.227.0
  - @voyant-travel/commerce@0.47.2

## 0.236.2

### Patch Changes

- Updated dependencies [2bc1570]
- Updated dependencies [2bc1570]
- Updated dependencies [14033fb]
  - @voyant-travel/utils@0.111.0
  - @voyant-travel/db@0.120.0
  - @voyant-travel/hono@0.139.0
  - @voyant-travel/bookings@0.237.1
  - @voyant-travel/finance@0.237.1
  - @voyant-travel/relationships@0.133.11
  - @voyant-travel/action-ledger@0.115.10
  - @voyant-travel/commerce@0.47.1
  - @voyant-travel/distribution@0.226.2
  - @voyant-travel/public-document-delivery@0.4.20
  - @voyant-travel/types@0.109.12

## 0.236.1

### Patch Changes

- Updated dependencies [f69e880]
  - @voyant-travel/bookings-contracts@0.114.0
  - @voyant-travel/bookings@0.237.0
  - @voyant-travel/commerce@0.47.0
  - @voyant-travel/finance@0.237.0
  - @voyant-travel/distribution@0.226.1
  - @voyant-travel/relationships@0.133.10

## 0.236.0

### Patch Changes

- Updated dependencies [eeaa5b5]
  - @voyant-travel/finance@0.236.0
  - @voyant-travel/commerce@0.46.10
  - @voyant-travel/distribution@0.226.0
  - @voyant-travel/bookings@0.236.0
  - @voyant-travel/relationships@0.133.9

## 0.235.0

### Patch Changes

- @voyant-travel/finance@0.235.0
- @voyant-travel/bookings@0.235.0
- @voyant-travel/distribution@0.225.0
- @voyant-travel/commerce@0.46.9
- @voyant-travel/relationships@0.133.8

## 0.234.0

### Minor Changes

- 9f412dd: Add the Booking Platform v1 action projection: authoritative Catalog, Finance,
  and Legal obligation readers, an Operations work queue with deterministic
  incremental and rebuild jobs, a redacted storefront next-action API, explicit
  Payment Schedule timezones, and reminder scheduling from projected deadlines.

### Patch Changes

- Updated dependencies [46005bf]
- Updated dependencies [c986bd5]
- Updated dependencies [9f412dd]
- Updated dependencies [2ed62d3]
  - @voyant-travel/bookings@0.234.0
  - @voyant-travel/core@0.137.1
  - @voyant-travel/bookings-contracts@0.113.0
  - @voyant-travel/finance@0.234.0
  - @voyant-travel/commerce@0.46.8
  - @voyant-travel/distribution@0.224.0
  - @voyant-travel/relationships@0.133.7
  - @voyant-travel/db@0.119.4
  - @voyant-travel/legal-contracts@0.108.2

## 0.233.0

### Patch Changes

- Updated dependencies [15c1c64]
  - @voyant-travel/bookings@0.233.0
  - @voyant-travel/finance@0.233.0
  - @voyant-travel/commerce@0.46.7
  - @voyant-travel/distribution@0.223.0
  - @voyant-travel/relationships@0.133.6
  - @voyant-travel/db@0.119.3
  - @voyant-travel/legal-contracts@0.108.1

## 0.232.0

### Patch Changes

- @voyant-travel/commerce@0.46.6
- @voyant-travel/distribution@0.222.0
- @voyant-travel/bookings@0.232.0
- @voyant-travel/finance@0.232.0
- @voyant-travel/relationships@0.133.5

## 0.231.0

### Patch Changes

- Updated dependencies [f7adc5b]
- Updated dependencies [f7adc5b]
  - @voyant-travel/distribution@0.221.0
  - @voyant-travel/inventory@0.27.0
  - @voyant-travel/commerce@0.46.5
  - @voyant-travel/bookings@0.231.0
  - @voyant-travel/finance@0.231.0
  - @voyant-travel/relationships@0.133.4

## 0.230.0

### Patch Changes

- Updated dependencies [72c6753]
- Updated dependencies [79606bb]
  - @voyant-travel/finance@0.230.0
  - @voyant-travel/bookings@0.230.0
  - @voyant-travel/commerce@0.46.4
  - @voyant-travel/distribution@0.220.0
  - @voyant-travel/relationships@0.133.3

## 0.229.0

### Patch Changes

- Updated dependencies [5d3b563]
- Updated dependencies [2601445]
  - @voyant-travel/finance@0.229.0
  - @voyant-travel/distribution@0.219.0
  - @voyant-travel/commerce@0.46.2
  - @voyant-travel/bookings@0.229.0
  - @voyant-travel/relationships@0.133.2

## 0.228.0

### Patch Changes

- @voyant-travel/bookings@0.228.0
- @voyant-travel/distribution@0.218.0
- @voyant-travel/finance@0.228.0
- @voyant-travel/commerce@0.46.1
- @voyant-travel/relationships@0.133.1

## 0.227.0

### Minor Changes

- e65bd25: Rename the bespoke sales Quote domain to Proposals across packages, routes, schemas, migrations, generated graph authorities, and operator surfaces.

  This beta-line release keeps no compatibility aliases, routes, package names, forwarding exports, views, or dual writes for the bespoke sales rename. Existing beta databases that contain the old bespoke quote schema must be dropped and recreated from the clean-slate migrations; there is no in-place migration path and no data-preservation guarantee for those beta databases.

### Patch Changes

- Updated dependencies [e65bd25]
  - @voyant-travel/bookings@0.227.0
  - @voyant-travel/commerce@0.46.0
  - @voyant-travel/legal-contracts@0.108.0
  - @voyant-travel/relationships@0.133.0
  - @voyant-travel/distribution@0.217.0
  - @voyant-travel/finance@0.227.0
  - @voyant-travel/inventory@0.26.0
  - @voyant-travel/db@0.119.2

## 0.226.0

### Patch Changes

- Updated dependencies [6beffa2]
  - @voyant-travel/bookings@0.226.0
  - @voyant-travel/finance@0.226.0
  - @voyant-travel/commerce@0.45.6
  - @voyant-travel/distribution@0.216.0
  - @voyant-travel/relationships@0.132.23

## 0.225.0

### Patch Changes

- Updated dependencies [4fe6f79]
- Updated dependencies [276d44d]
- Updated dependencies [0c30250]
  - @voyant-travel/finance@0.225.0
  - @voyant-travel/tools@0.10.0
  - @voyant-travel/core@0.137.0
  - @voyant-travel/commerce@0.45.5
  - @voyant-travel/distribution@0.215.0
  - @voyant-travel/action-ledger@0.115.9
  - @voyant-travel/bookings@0.225.0
  - @voyant-travel/relationships@0.132.22
  - @voyant-travel/db@0.119.1
  - @voyant-travel/hono@0.138.1
  - @voyant-travel/public-document-delivery@0.4.19
  - @voyant-travel/storage@0.115.1

## 0.224.0

### Patch Changes

- Updated dependencies [e87d4de]
  - @voyant-travel/hono@0.138.0
  - @voyant-travel/action-ledger@0.115.8
  - @voyant-travel/bookings@0.224.0
  - @voyant-travel/commerce@0.45.4
  - @voyant-travel/distribution@0.214.0
  - @voyant-travel/finance@0.224.0
  - @voyant-travel/relationships@0.132.21

## 0.223.0

### Patch Changes

- Updated dependencies [fae0f36]
- Updated dependencies [d02a4e8]
- Updated dependencies [d02a4e8]
  - @voyant-travel/tools@0.9.0
  - @voyant-travel/bookings@0.223.0
  - @voyant-travel/inventory@0.25.0
  - @voyant-travel/action-ledger@0.115.7
  - @voyant-travel/commerce@0.45.3
  - @voyant-travel/distribution@0.213.0
  - @voyant-travel/finance@0.223.0
  - @voyant-travel/relationships@0.132.20

## 0.222.0

### Patch Changes

- @voyant-travel/bookings@0.222.0
- @voyant-travel/distribution@0.212.0
- @voyant-travel/finance@0.222.0
- @voyant-travel/commerce@0.45.2
- @voyant-travel/relationships@0.132.19

## 0.221.1

### Patch Changes

- Updated dependencies [c30b6b0]
- Updated dependencies [d92a98a]
  - @voyant-travel/finance@0.221.1
  - @voyant-travel/hono@0.137.0
  - @voyant-travel/action-ledger@0.115.6
  - @voyant-travel/bookings@0.221.1
  - @voyant-travel/commerce@0.45.1
  - @voyant-travel/distribution@0.211.1
  - @voyant-travel/relationships@0.132.18

## 0.221.0

### Patch Changes

- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
  - @voyant-travel/commerce@0.45.0
  - @voyant-travel/action-ledger@0.115.5
  - @voyant-travel/bookings@0.221.0
  - @voyant-travel/finance@0.221.0
  - @voyant-travel/hono@0.136.0
  - @voyant-travel/tools@0.8.0
  - @voyant-travel/inventory@0.24.0
  - @voyant-travel/distribution@0.211.0
  - @voyant-travel/relationships@0.132.17

## 0.220.0

### Patch Changes

- Updated dependencies [8adeb23]
- Updated dependencies [6d0b4b4]
- Updated dependencies [7496159]
- Updated dependencies [fa75fe3]
  - @voyant-travel/bookings@0.220.0
  - @voyant-travel/finance@0.220.0
  - @voyant-travel/action-ledger@0.115.4
  - @voyant-travel/db@0.119.0
  - @voyant-travel/hono@0.135.0
  - @voyant-travel/commerce@0.44.20
  - @voyant-travel/distribution@0.210.0
  - @voyant-travel/inventory@0.23.5
  - @voyant-travel/relationships@0.132.16
  - @voyant-travel/public-document-delivery@0.4.18
  - @voyant-travel/types@0.109.10

## 0.219.0

### Minor Changes

- 6df3ab4: Expose a review-first booking contract workflow to operator tools, including applicable-template prerequisites, immutable draft revisions, exact approved delivery, durable delivery status, audited void handling, authenticated MCP scope propagation, and shared tool context typing.

### Patch Changes

- Updated dependencies [6df3ab4]
  - @voyant-travel/tools@0.7.2
  - @voyant-travel/bookings@0.219.0
  - @voyant-travel/distribution@0.209.0
  - @voyant-travel/finance@0.219.0
  - @voyant-travel/commerce@0.44.19
  - @voyant-travel/inventory@0.23.4
  - @voyant-travel/relationships@0.132.15

## 0.218.0

### Patch Changes

- Updated dependencies [a799849]
  - @voyant-travel/bookings@0.218.0
  - @voyant-travel/commerce@0.44.17
  - @voyant-travel/finance@0.218.0
  - @voyant-travel/distribution@0.208.0
  - @voyant-travel/inventory@0.23.1
  - @voyant-travel/relationships@0.132.14

## 0.217.0

### Patch Changes

- Updated dependencies [d3f16d5]
  - @voyant-travel/inventory@0.23.0
  - @voyant-travel/bookings@0.217.0
  - @voyant-travel/distribution@0.207.0
  - @voyant-travel/finance@0.217.0
  - @voyant-travel/commerce@0.44.16
  - @voyant-travel/relationships@0.132.13

## 0.216.1

### Patch Changes

- a653664: Add a provider-neutral `scale-to-zero` recovery profile for package-owned jobs,
  including channel-push subscribers, and expose safe durable-send,
  payment-reconciliation, promotion-reindex, and channel-push jobs to payload-free
  wakeups.
- Updated dependencies [a653664]
  - @voyant-travel/bookings@0.216.2
  - @voyant-travel/commerce@0.44.15
  - @voyant-travel/db@0.118.6
  - @voyant-travel/distribution@0.206.1

## 0.216.0

### Patch Changes

- Updated dependencies [903c754]
  - @voyant-travel/bookings@0.216.0
  - @voyant-travel/commerce@0.44.14
  - @voyant-travel/distribution@0.206.0
  - @voyant-travel/finance@0.216.0
  - @voyant-travel/inventory@0.22.4
  - @voyant-travel/relationships@0.132.12

## 0.215.1

### Patch Changes

- Updated dependencies [9c2bb8c]
  - @voyant-travel/storage@0.115.0
  - @voyant-travel/finance@0.215.1
  - @voyant-travel/inventory@0.22.3
  - @voyant-travel/public-document-delivery@0.4.17

## 0.215.0

### Patch Changes

- @voyant-travel/finance@0.215.0
- @voyant-travel/inventory@0.22.2
- @voyant-travel/bookings@0.215.0
- @voyant-travel/distribution@0.205.0
- @voyant-travel/commerce@0.44.13
- @voyant-travel/relationships@0.132.11

## 0.214.0

### Patch Changes

- @voyant-travel/bookings@0.214.0
- @voyant-travel/distribution@0.204.0
- @voyant-travel/finance@0.214.0
- @voyant-travel/commerce@0.44.12
- @voyant-travel/inventory@0.22.1
- @voyant-travel/relationships@0.132.10

## 0.213.0

### Patch Changes

- Updated dependencies [9d84e82]
  - @voyant-travel/inventory@0.22.0
  - @voyant-travel/bookings@0.213.0
  - @voyant-travel/distribution@0.203.0
  - @voyant-travel/finance@0.213.0
  - @voyant-travel/commerce@0.44.11
  - @voyant-travel/relationships@0.132.9

## 0.212.0

### Patch Changes

- @voyant-travel/commerce@0.44.10
- @voyant-travel/distribution@0.202.0
- @voyant-travel/inventory@0.21.12
- @voyant-travel/bookings@0.212.0
- @voyant-travel/finance@0.212.0
- @voyant-travel/relationships@0.132.8

## 0.211.0

### Patch Changes

- @voyant-travel/commerce@0.44.9
- @voyant-travel/distribution@0.201.0
- @voyant-travel/inventory@0.21.10
- @voyant-travel/bookings@0.211.0
- @voyant-travel/finance@0.211.0
- @voyant-travel/relationships@0.132.7

## 0.210.0

### Patch Changes

- @voyant-travel/bookings@0.210.0
- @voyant-travel/distribution@0.200.0
- @voyant-travel/finance@0.210.0
- @voyant-travel/commerce@0.44.8
- @voyant-travel/inventory@0.21.9
- @voyant-travel/relationships@0.132.6

## 0.209.0

### Patch Changes

- @voyant-travel/inventory@0.21.8
- @voyant-travel/bookings@0.209.0
- @voyant-travel/distribution@0.199.0
- @voyant-travel/finance@0.209.0
- @voyant-travel/commerce@0.44.7
- @voyant-travel/relationships@0.132.5

## 0.208.0

### Patch Changes

- @voyant-travel/bookings@0.208.0
- @voyant-travel/distribution@0.198.0
- @voyant-travel/finance@0.208.0
- @voyant-travel/commerce@0.44.6
- @voyant-travel/inventory@0.21.7
- @voyant-travel/relationships@0.132.4

## 0.207.1

### Patch Changes

- accb1cf: Declare `availability`/`effectBoundary: "local"` on
  `action.create-contract-draft`, which already claims its command idempotently
  via `executeAdmittedCreatedTargetCommand` (the `handler-command-claim-v1`
  `createdTarget` contract was already declared).

  Quarantine `action.author-contract-template` from agent Tool exposure
  (`availability: unavailable`, `reasonCode: "unsafe-unclaimed-create-target"`)
  instead of migrating it: the action binds two tools with genuinely different
  lifecycles (`create-contract-template` creates a new template with no
  idempotency key or claim protocol; `update-contract-template` mutates an
  existing template by id), so neither `targetLifecycle: "created"` nor
  `"existing"` would honestly describe it as a single action, and the create
  side has no dedup to safely retry. Admin UI template authoring is unaffected;
  only agent Tool exposure is disabled pending a split into separate
  create/update actions with a real created-target claim.

  No runtime changes.

- Updated dependencies [accb1cf]
- Updated dependencies [accb1cf]
- Updated dependencies [accb1cf]
- Updated dependencies [accb1cf]
  - @voyant-travel/commerce@0.44.5
  - @voyant-travel/distribution@0.197.1
  - @voyant-travel/finance@0.207.1
  - @voyant-travel/relationships@0.132.3

## 0.207.0

### Patch Changes

- Updated dependencies [4979d3b]
  - @voyant-travel/bookings@0.207.0
  - @voyant-travel/commerce@0.44.4
  - @voyant-travel/distribution@0.197.0
  - @voyant-travel/finance@0.207.0
  - @voyant-travel/inventory@0.21.2
  - @voyant-travel/relationships@0.132.2

## 0.206.0

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/hono@0.134.6
  - @voyant-travel/finance@0.206.0
  - @voyant-travel/inventory@0.21.1
  - @voyant-travel/bookings@0.206.0
  - @voyant-travel/distribution@0.196.0
  - @voyant-travel/commerce@0.44.3
  - @voyant-travel/relationships@0.132.1

## 0.205.0

### Minor Changes

- 58baffe: Remove callable Tool name aliases from the standard Operator graph. MCP and
  other callers must use canonical Tool names only; previous compatibility names
  (for example `crm_*`, `legal_contract_*`, `availability_*`, `dashboard_summary`,
  `read_setup_state`, `products_compose`, `invoices_issue_from_booking`) no longer
  dispatch.

  Stop publicly exporting the deprecated Relationships Tools
  `add_relationship_note`, `add_relationship_contact_method`, and
  `add_relationship_address`. Use the person- or organization-specific add Tools
  selected by the graph instead.

  See the consolidated [caller migration
  page](../docs/migrations/removed-tool-aliases.md) for the complete old →
  canonical name mapping.

### Patch Changes

- Updated dependencies [58baffe]
  - @voyant-travel/relationships@0.132.0
  - @voyant-travel/inventory@0.21.0
  - @voyant-travel/finance@0.205.0
  - @voyant-travel/commerce@0.44.2
  - @voyant-travel/distribution@0.195.0
  - @voyant-travel/bookings@0.205.0

## 0.204.0

### Patch Changes

- @voyant-travel/bookings@0.204.0
- @voyant-travel/distribution@0.194.0
- @voyant-travel/finance@0.204.0
- @voyant-travel/commerce@0.44.1
- @voyant-travel/inventory@0.20.1
- @voyant-travel/relationships@0.131.7

## 0.203.0

### Patch Changes

- Updated dependencies [17f1239]
  - @voyant-travel/finance@0.203.0
  - @voyant-travel/action-ledger@0.115.0
  - @voyant-travel/bookings@0.203.0
  - @voyant-travel/inventory@0.20.0
  - @voyant-travel/tools@0.7.0
  - @voyant-travel/commerce@0.44.0
  - @voyant-travel/distribution@0.193.0
  - @voyant-travel/relationships@0.131.6

## 0.202.0

### Patch Changes

- @voyant-travel/bookings@0.202.0
- @voyant-travel/distribution@0.192.0
- @voyant-travel/finance@0.202.0
- @voyant-travel/commerce@0.43.3
- @voyant-travel/inventory@0.19.6
- @voyant-travel/relationships@0.131.5

## 0.201.1

### Patch Changes

- a02a76b: Move generic MCP action targets, idempotency fingerprints, and approval preflight
  behind a discoverable server-owned Tool contract. Migrated packages resolve ledger
  targets from validated input, approval-required calls return structured server-issued
  approval metadata, and exact retries are validated against the stored command and
  principal. Route every handler-created target through the selected Tool admission,
  remove the raw created-target executor from the public package surface, and reject
  future package-level bypasses during manifest convergence. Validate graph risk
  against the loaded Tool tier before release and keep the Operator MCP health check
  from accepting startup failures.
- Updated dependencies [a02a76b]
  - @voyant-travel/tools@0.6.0
  - @voyant-travel/action-ledger@0.114.0
  - @voyant-travel/bookings@0.201.1
  - @voyant-travel/commerce@0.43.2
  - @voyant-travel/distribution@0.191.1
  - @voyant-travel/finance@0.201.1
  - @voyant-travel/inventory@0.19.5
  - @voyant-travel/relationships@0.131.4

## 0.201.0

### Patch Changes

- Updated dependencies [5e03ae7]
  - @voyant-travel/finance@0.201.0
  - @voyant-travel/commerce@0.43.1
  - @voyant-travel/distribution@0.191.0
  - @voyant-travel/inventory@0.19.4
  - @voyant-travel/bookings@0.201.0
  - @voyant-travel/relationships@0.131.3

## 0.200.0

### Minor Changes

- 952d817: Replace unsafe booking-contract document generation with the Legal-owned
  durable operation/provider protocol. Legacy generation routes and direct
  generator services and exports are removed. Standard Operator now selects and
  constructs the shipped provider from its exact database, document-storage, and
  renderer bindings; startup and action activation require behavioral provider
  preflight, and pending recovery fails loudly if that provider disappears.
  Local Standard document bytes now require probed, atomic filesystem durability,
  and the bundled renderer embeds a Latin Extended Unicode font. Custom font
  bytes are also supported by the basic PDF utility. Opaque renderer/S3
  transports require explicit backend identity. Remove the
  Notifications document-bundle lifecycle callbacks, fully-paid orchestration
  subscriber, and its Realtime invalidation declaration; document generation is
  available only through admitted Legal actions.

  Recognize transaction-bound outbox appends as durable domain-event emissions
  and publish the existing Trips requirement-sourcing event contracts.

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/legal-contracts@0.107.0
  - @voyant-travel/commerce@0.43.0
  - @voyant-travel/core@0.136.0
  - @voyant-travel/storage@0.114.0
  - @voyant-travel/utils@0.110.0
  - @voyant-travel/distribution@0.190.0
  - @voyant-travel/inventory@0.19.3
  - @voyant-travel/action-ledger@0.113.2
  - @voyant-travel/bookings@0.200.0
  - @voyant-travel/db@0.118.5
  - @voyant-travel/finance@0.200.0
  - @voyant-travel/hono@0.134.5
  - @voyant-travel/public-document-delivery@0.4.16
  - @voyant-travel/relationships@0.131.2

## 0.199.0

### Patch Changes

- Updated dependencies [3651ff7]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/action-ledger@0.113.1
  - @voyant-travel/bookings@0.199.0
  - @voyant-travel/commerce@0.42.2
  - @voyant-travel/db@0.118.4
  - @voyant-travel/distribution@0.189.0
  - @voyant-travel/finance@0.199.0
  - @voyant-travel/hono@0.134.4
  - @voyant-travel/inventory@0.19.2
  - @voyant-travel/operator-settings@0.14.19
  - @voyant-travel/public-document-delivery@0.4.15
  - @voyant-travel/relationships@0.131.1
  - @voyant-travel/storage@0.113.6

## 0.198.1

### Patch Changes

- Updated dependencies [e2cb9f5]
  - @voyant-travel/inventory@0.19.1
  - @voyant-travel/bookings@0.198.1
  - @voyant-travel/distribution@0.188.1
  - @voyant-travel/finance@0.198.1

## 0.198.0

### Patch Changes

- Updated dependencies [c7459a2]
  - @voyant-travel/relationships@0.131.0
  - @voyant-travel/inventory@0.19.0
  - @voyant-travel/bookings@0.198.0
  - @voyant-travel/distribution@0.188.0
  - @voyant-travel/finance@0.198.0
  - @voyant-travel/commerce@0.42.1
  - @voyant-travel/operator-settings@0.14.18

## 0.197.0

### Minor Changes

- 26b4c9a: Restore the approved issue, send, and execute contract Tools with an existing-target
  durable command protocol. Each command now commits its action claim, locked contract
  transition, immutable result snapshot, preserved send payload, and deterministic
  lifecycle outbox event atomically; exact retries return the original Tool output
  without repeating state changes or delivery intent.

  This release adds the `contract_lifecycle_command_results` table. Apply the Legal
  package migration before exposing the restored Tools. Its `contract_id` is an
  intentional soft reference so replay history outlives a later permitted contract
  deletion. Existing exported Legal service method signatures and Tool output
  schemas are unchanged.

### Patch Changes

- Updated dependencies [b07a0a3]
- Updated dependencies [e44781c]
- Updated dependencies [fa1cc2c]
  - @voyant-travel/action-ledger@0.113.0
  - @voyant-travel/bookings@0.197.0
  - @voyant-travel/core@0.134.0
  - @voyant-travel/finance@0.197.0
  - @voyant-travel/tools@0.5.0
  - @voyant-travel/commerce@0.42.0
  - @voyant-travel/relationships@0.130.0
  - @voyant-travel/distribution@0.187.0
  - @voyant-travel/inventory@0.18.0
  - @voyant-travel/db@0.118.3
  - @voyant-travel/hono@0.134.3
  - @voyant-travel/operator-settings@0.14.17
  - @voyant-travel/public-document-delivery@0.4.14
  - @voyant-travel/storage@0.113.5

## 0.196.0

### Minor Changes

- 71c08aa: Require `idempotencyKey` for the supplier, distribution-channel, and legal
  contract-draft create Tools. Successful calls now return an immutable created
  target reference (`status`, the target `id`, and `replayed`) instead of a mutable
  full-row snapshot. Equal keys replay the original target; reusing a key with
  different command input fails with an idempotency conflict.
- 58020ec: Keep first-party Tools with unproven non-transactional external or multi-stage effects out of
  runtime discovery. The affected graph actions remain available as diagnostic metadata with an
  explicit unsafe-effect reason until each package gains tested transactional, outbox, or saga
  durability. This also covers supplier-side flight cancellation and contract execution whose
  post-commit lifecycle event is not yet durably published.

### Patch Changes

- bba4fec: Anchor generated-child actions to stable existing parents so action policy checks
  do not require IDs that only exist after dispatch. Split relationship child
  creation Tools by person and organization so each selected action has one
  unambiguous parent target type. Bind each generic action's policy target to its
  domain parent-id input before ledger, approval, or handler execution.
- Updated dependencies [71c08aa]
- Updated dependencies [0190317]
- Updated dependencies [78423d3]
- Updated dependencies [bba4fec]
- Updated dependencies [c1f9cdf]
- Updated dependencies [58020ec]
- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
- Updated dependencies
  - @voyant-travel/distribution@0.186.0
  - @voyant-travel/inventory@0.17.0
  - @voyant-travel/commerce@0.41.0
  - @voyant-travel/relationships@0.129.0
  - @voyant-travel/action-ledger@0.112.0
  - @voyant-travel/finance@0.196.0
  - @voyant-travel/bookings@0.196.0
  - @voyant-travel/core@0.133.0
  - @voyant-travel/tools@0.4.0
  - @voyant-travel/operator-settings@0.14.16
  - @voyant-travel/db@0.118.2
  - @voyant-travel/hono@0.134.2
  - @voyant-travel/public-document-delivery@0.4.13
  - @voyant-travel/storage@0.113.4

## 0.195.0

### Patch Changes

- Updated dependencies [e3a1e17]
  - @voyant-travel/bookings@0.195.0
  - @voyant-travel/commerce@0.40.6
  - @voyant-travel/distribution@0.185.0
  - @voyant-travel/finance@0.195.0
  - @voyant-travel/inventory@0.16.2
  - @voyant-travel/relationships@0.128.36
  - @voyant-travel/operator-settings@0.14.15

## 0.194.0

### Patch Changes

- Updated dependencies [dd370ca]
  - @voyant-travel/core@0.132.1
  - @voyant-travel/inventory@0.16.1
  - @voyant-travel/commerce@0.40.5
  - @voyant-travel/distribution@0.184.0
  - @voyant-travel/bookings@0.194.0
  - @voyant-travel/finance@0.194.0
  - @voyant-travel/relationships@0.128.35
  - @voyant-travel/operator-settings@0.14.14

## 0.193.0

### Patch Changes

- Updated dependencies [a43267a]
- Updated dependencies [90d44c0]
- Updated dependencies [2c79bef]
  - @voyant-travel/inventory@0.16.0
  - @voyant-travel/bookings@0.193.0
  - @voyant-travel/distribution@0.183.0
  - @voyant-travel/finance@0.193.0
  - @voyant-travel/commerce@0.40.4
  - @voyant-travel/relationships@0.128.34
  - @voyant-travel/operator-settings@0.14.13

## 0.192.1

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/action-ledger@0.111.14
  - @voyant-travel/bookings@0.192.1
  - @voyant-travel/commerce@0.40.3
  - @voyant-travel/db@0.118.1
  - @voyant-travel/distribution@0.182.1
  - @voyant-travel/finance@0.192.1
  - @voyant-travel/hono@0.134.1
  - @voyant-travel/inventory@0.15.3
  - @voyant-travel/operator-settings@0.14.12
  - @voyant-travel/public-document-delivery@0.4.12
  - @voyant-travel/relationships@0.128.33
  - @voyant-travel/storage@0.113.3

## 0.192.0

### Patch Changes

- Updated dependencies [e68a705]
  - @voyant-travel/finance@0.192.0
  - @voyant-travel/operator-settings@0.14.11
  - @voyant-travel/bookings@0.192.0
  - @voyant-travel/distribution@0.182.0
  - @voyant-travel/commerce@0.40.2
  - @voyant-travel/inventory@0.15.2
  - @voyant-travel/relationships@0.128.32

## 0.191.0

### Patch Changes

- Updated dependencies [f6aa3a1]
  - @voyant-travel/finance@0.191.0
  - @voyant-travel/commerce@0.40.1
  - @voyant-travel/distribution@0.181.0
  - @voyant-travel/inventory@0.15.1
  - @voyant-travel/operator-settings@0.14.10
  - @voyant-travel/bookings@0.191.0
  - @voyant-travel/relationships@0.128.31

## 0.190.0

### Patch Changes

- Updated dependencies [228b57d]
- Updated dependencies [f945310]
- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
- Updated dependencies [fafc12e]
  - @voyant-travel/bookings@0.190.0
  - @voyant-travel/commerce@0.40.0
  - @voyant-travel/db@0.118.0
  - @voyant-travel/distribution@0.180.0
  - @voyant-travel/inventory@0.15.0
  - @voyant-travel/core@0.131.0
  - @voyant-travel/hono@0.134.0
  - @voyant-travel/finance@0.190.0
  - @voyant-travel/relationships@0.128.30
  - @voyant-travel/operator-settings@0.14.9
  - @voyant-travel/action-ledger@0.111.13
  - @voyant-travel/public-document-delivery@0.4.11
  - @voyant-travel/types@0.109.9
  - @voyant-travel/storage@0.113.2

## 0.189.0

### Patch Changes

- @voyant-travel/commerce@0.39.25
- @voyant-travel/distribution@0.179.0
- @voyant-travel/inventory@0.14.28
- @voyant-travel/bookings@0.189.0
- @voyant-travel/finance@0.189.0
- @voyant-travel/relationships@0.128.29
- @voyant-travel/operator-settings@0.14.8

## 0.188.0

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0
  - @voyant-travel/utils@0.109.0
  - @voyant-travel/action-ledger@0.111.11
  - @voyant-travel/bookings@0.188.0
  - @voyant-travel/commerce@0.39.24
  - @voyant-travel/distribution@0.178.0
  - @voyant-travel/finance@0.188.0
  - @voyant-travel/inventory@0.14.27
  - @voyant-travel/operator-settings@0.14.7
  - @voyant-travel/relationships@0.128.28

## 0.187.1

### Patch Changes

- Updated dependencies [d8a225c]
  - @voyant-travel/storage@0.113.0
  - @voyant-travel/finance@0.187.1
  - @voyant-travel/inventory@0.14.25
  - @voyant-travel/public-document-delivery@0.4.10

## 0.187.0

### Patch Changes

- @voyant-travel/bookings@0.187.0
- @voyant-travel/distribution@0.177.0
- @voyant-travel/finance@0.187.0
- @voyant-travel/commerce@0.39.23
- @voyant-travel/inventory@0.14.24
- @voyant-travel/relationships@0.128.27
- @voyant-travel/operator-settings@0.14.6

## 0.186.0

### Patch Changes

- @voyant-travel/bookings@0.186.0
- @voyant-travel/distribution@0.176.0
- @voyant-travel/finance@0.186.0
- @voyant-travel/commerce@0.39.22
- @voyant-travel/inventory@0.14.22
- @voyant-travel/relationships@0.128.26
- @voyant-travel/operator-settings@0.14.5

## 0.185.0

### Patch Changes

- Updated dependencies [e7e90bf]
  - @voyant-travel/finance@0.185.0
  - @voyant-travel/commerce@0.39.21
  - @voyant-travel/distribution@0.175.0
  - @voyant-travel/inventory@0.14.21
  - @voyant-travel/operator-settings@0.14.4
  - @voyant-travel/bookings@0.185.0
  - @voyant-travel/relationships@0.128.25

## 0.184.0

### Patch Changes

- Updated dependencies [a33c590]
  - @voyant-travel/inventory@0.14.20
  - @voyant-travel/bookings@0.184.0
  - @voyant-travel/distribution@0.174.0
  - @voyant-travel/finance@0.184.0
  - @voyant-travel/commerce@0.39.20
  - @voyant-travel/relationships@0.128.24
  - @voyant-travel/operator-settings@0.14.3

## 0.183.0

### Patch Changes

- @voyant-travel/finance@0.183.0
- @voyant-travel/operator-settings@0.14.2
- @voyant-travel/bookings@0.183.0
- @voyant-travel/distribution@0.173.0
- @voyant-travel/commerce@0.39.19
- @voyant-travel/inventory@0.14.19
- @voyant-travel/relationships@0.128.23

## 0.182.4

### Patch Changes

- @voyant-travel/bookings@0.182.2
- @voyant-travel/distribution@0.172.2
- @voyant-travel/finance@0.182.4

## 0.182.3

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0
  - @voyant-travel/action-ledger@0.111.10
  - @voyant-travel/bookings@0.182.1
  - @voyant-travel/commerce@0.39.18
  - @voyant-travel/distribution@0.172.1
  - @voyant-travel/finance@0.182.3
  - @voyant-travel/inventory@0.14.18
  - @voyant-travel/operator-settings@0.14.1
  - @voyant-travel/relationships@0.128.22

## 0.182.2

### Patch Changes

- Updated dependencies [225000a]
  - @voyant-travel/operator-settings@0.14.0
  - @voyant-travel/finance@0.182.2
  - @voyant-travel/inventory@0.14.17

## 0.182.1

### Patch Changes

- Updated dependencies [bcd7ad0]
  - @voyant-travel/storage@0.112.0
  - @voyant-travel/finance@0.182.1
  - @voyant-travel/inventory@0.14.16
  - @voyant-travel/public-document-delivery@0.4.9

## 0.182.0

### Patch Changes

- @voyant-travel/bookings@0.182.0
- @voyant-travel/distribution@0.172.0
- @voyant-travel/finance@0.182.0
- @voyant-travel/commerce@0.39.17
- @voyant-travel/inventory@0.14.15
- @voyant-travel/relationships@0.128.21
- @voyant-travel/operator-settings@0.13.1

## 0.181.1

### Patch Changes

- Updated dependencies [0fa5feb]
  - @voyant-travel/operator-settings@0.13.0
  - @voyant-travel/inventory@0.14.14

## 0.181.0

### Patch Changes

- Updated dependencies [464815c]
- Updated dependencies [464815c]
  - @voyant-travel/operator-settings@0.12.0
  - @voyant-travel/finance@0.181.0
  - @voyant-travel/bookings@0.181.0
  - @voyant-travel/inventory@0.14.13
  - @voyant-travel/commerce@0.39.16
  - @voyant-travel/distribution@0.171.0
  - @voyant-travel/relationships@0.128.20

## 0.180.1

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/operator-settings@0.11.0
  - @voyant-travel/finance@0.180.1
  - @voyant-travel/inventory@0.14.12
  - @voyant-travel/db@0.117.1
  - @voyant-travel/legal-contracts@0.106.12
  - @voyant-travel/bookings@0.180.1
  - @voyant-travel/distribution@0.170.1

## 0.180.0

### Minor Changes

- ecf1680: Remove the redundant singular storefront branding admin surface and make the
  organization (operator) profile the single home for org brand identity.

  Storefronts are plural (many per org, managed under the top-level "Storefronts"
  surface). The leftover singular "storefront" Settings page edited a separate
  branding blob (logo/favicon/brand mark/colors/languages) that duplicated brand
  identity already modeled on the operator profile. Per-storefront visuals are a
  developer's frontend concern, not an admin one, so the surface and its storage
  schema are dropped.

  - storefront: drop the module `admin` block (branding settings page + branding
    setup step) and remove the `branding` shape from the storefront settings
    schema, service, admin/public routes, and OpenAPI documents. No database
    migration is required — storefront branding was never persisted to a table;
    it lived only in static deployment settings.
  - storefront-react / storefront-sdk: remove `createSelectedStorefrontAdminExtension`,
    the storefront settings page/form, and the `./admin`, `./ui`, and
    `./components/storefront-settings-page` package exports. `StorefrontSettingsRecord`
    and the settings schemas no longer carry `branding`.
  - operator-settings-react / i18n / legal: rename the user-facing "Operator
    profile" label to "Organization" ("Organizație" in Romanian) across the
    settings nav, page title, saved-toast copy, and contract template-authoring
    descriptions. The API path, `operator_profile` table, ids, and query keys are
    unchanged.

### Patch Changes

- @voyant-travel/bookings@0.180.0
- @voyant-travel/distribution@0.170.0
- @voyant-travel/finance@0.180.0
- @voyant-travel/commerce@0.39.15
- @voyant-travel/inventory@0.14.11
- @voyant-travel/relationships@0.128.19
- @voyant-travel/operator-settings@0.10.11

## 0.179.0

### Patch Changes

- @voyant-travel/bookings@0.179.0
- @voyant-travel/distribution@0.169.0
- @voyant-travel/finance@0.179.0
- @voyant-travel/commerce@0.39.14
- @voyant-travel/inventory@0.14.10
- @voyant-travel/relationships@0.128.18
- @voyant-travel/operator-settings@0.10.10

## 0.178.0

### Patch Changes

- @voyant-travel/bookings@0.178.0
- @voyant-travel/distribution@0.168.0
- @voyant-travel/finance@0.178.0
- @voyant-travel/commerce@0.39.13
- @voyant-travel/inventory@0.14.9
- @voyant-travel/relationships@0.128.17
- @voyant-travel/operator-settings@0.10.9

## 0.177.0

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/action-ledger@0.111.9
  - @voyant-travel/bookings@0.177.0
  - @voyant-travel/commerce@0.39.12
  - @voyant-travel/distribution@0.167.0
  - @voyant-travel/finance@0.177.0
  - @voyant-travel/hono@0.131.2
  - @voyant-travel/inventory@0.14.8
  - @voyant-travel/operator-settings@0.10.8
  - @voyant-travel/public-document-delivery@0.4.8
  - @voyant-travel/relationships@0.128.16
  - @voyant-travel/types@0.109.8

## 0.176.0

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0
  - @voyant-travel/action-ledger@0.111.8
  - @voyant-travel/bookings@0.176.0
  - @voyant-travel/commerce@0.39.11
  - @voyant-travel/distribution@0.166.0
  - @voyant-travel/finance@0.176.0
  - @voyant-travel/hono@0.131.1
  - @voyant-travel/inventory@0.14.7
  - @voyant-travel/operator-settings@0.10.7
  - @voyant-travel/public-document-delivery@0.4.7
  - @voyant-travel/relationships@0.128.15
  - @voyant-travel/types@0.109.7

## 0.175.0

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/bookings@0.175.0
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/commerce@0.39.10
  - @voyant-travel/distribution@0.165.0
  - @voyant-travel/finance@0.175.0
  - @voyant-travel/inventory@0.14.6
  - @voyant-travel/relationships@0.128.14
  - @voyant-travel/action-ledger@0.111.7
  - @voyant-travel/operator-settings@0.10.6
  - @voyant-travel/public-document-delivery@0.4.6
  - @voyant-travel/storage@0.111.6
  - @voyant-travel/types@0.109.6

## 0.174.0

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/bookings@0.174.0
  - @voyant-travel/finance@0.174.0
  - @voyant-travel/action-ledger@0.111.6
  - @voyant-travel/commerce@0.39.9
  - @voyant-travel/db@0.114.15
  - @voyant-travel/distribution@0.164.0
  - @voyant-travel/hono@0.130.1
  - @voyant-travel/inventory@0.14.5
  - @voyant-travel/operator-settings@0.10.5
  - @voyant-travel/public-document-delivery@0.4.5
  - @voyant-travel/relationships@0.128.13
  - @voyant-travel/storage@0.111.5

## 0.173.0

### Patch Changes

- @voyant-travel/bookings@0.173.0
- @voyant-travel/distribution@0.163.0
- @voyant-travel/finance@0.173.0
- @voyant-travel/commerce@0.39.8
- @voyant-travel/inventory@0.14.4
- @voyant-travel/relationships@0.128.12
- @voyant-travel/operator-settings@0.10.4

## 0.172.0

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/bookings@0.172.0
  - @voyant-travel/core@0.128.0
  - @voyant-travel/finance@0.172.0
  - @voyant-travel/hono@0.130.0
  - @voyant-travel/utils@0.108.0
  - @voyant-travel/commerce@0.39.7
  - @voyant-travel/distribution@0.162.0
  - @voyant-travel/inventory@0.14.3
  - @voyant-travel/relationships@0.128.11
  - @voyant-travel/action-ledger@0.111.5
  - @voyant-travel/db@0.114.14
  - @voyant-travel/operator-settings@0.10.3
  - @voyant-travel/public-document-delivery@0.4.4
  - @voyant-travel/storage@0.111.4

## 0.171.1

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0
  - @voyant-travel/action-ledger@0.111.4
  - @voyant-travel/bookings@0.171.1
  - @voyant-travel/commerce@0.39.6
  - @voyant-travel/distribution@0.161.1
  - @voyant-travel/finance@0.171.1
  - @voyant-travel/inventory@0.14.2
  - @voyant-travel/operator-settings@0.10.2
  - @voyant-travel/relationships@0.128.10

## 0.171.0

### Patch Changes

- Updated dependencies [d2d7384]
  - @voyant-travel/finance@0.171.0
  - @voyant-travel/commerce@0.39.5
  - @voyant-travel/distribution@0.161.0
  - @voyant-travel/inventory@0.14.1
  - @voyant-travel/operator-settings@0.10.1
  - @voyant-travel/bookings@0.171.0
  - @voyant-travel/relationships@0.128.9

## 0.170.0

### Minor Changes

- 117fa05: Generate managed-deployment contracts from operator-authored default templates and number series without deployment-specific workflows. Add reusable light- and dark-mode horizontal logo and icon assets to Operator Profile, expose them to contract templates, and provide accessible drag-and-drop upload controls. Introduce a shared document-renderer port and zero-code HTTP adapter so managed deployments can use a private platform renderer while self-hosters can swap in their own renderer for contracts and brochures.

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/inventory@0.14.0
  - @voyant-travel/operator-settings@0.10.0
  - @voyant-travel/action-ledger@0.111.3
  - @voyant-travel/bookings@0.170.0
  - @voyant-travel/commerce@0.39.4
  - @voyant-travel/db@0.114.13
  - @voyant-travel/distribution@0.160.0
  - @voyant-travel/finance@0.170.0
  - @voyant-travel/hono@0.128.6
  - @voyant-travel/public-document-delivery@0.4.3
  - @voyant-travel/relationships@0.128.8
  - @voyant-travel/storage@0.111.3

## 0.169.1

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/action-ledger@0.111.2
  - @voyant-travel/bookings@0.169.1
  - @voyant-travel/commerce@0.39.3
  - @voyant-travel/db@0.114.11
  - @voyant-travel/distribution@0.159.1
  - @voyant-travel/finance@0.169.2
  - @voyant-travel/hono@0.128.4
  - @voyant-travel/inventory@0.13.7
  - @voyant-travel/operator-settings@0.9.2
  - @voyant-travel/public-document-delivery@0.4.2
  - @voyant-travel/relationships@0.128.7
  - @voyant-travel/storage@0.111.2

## 0.169.0

### Patch Changes

- Updated dependencies [590d256]
  - @voyant-travel/finance@0.169.0
  - @voyant-travel/commerce@0.39.2
  - @voyant-travel/distribution@0.159.0
  - @voyant-travel/inventory@0.13.6
  - @voyant-travel/bookings@0.169.0
  - @voyant-travel/operator-settings@0.9.1
  - @voyant-travel/relationships@0.128.6

## 0.168.0

### Patch Changes

- Updated dependencies [158c3a0]
  - @voyant-travel/finance@0.168.0
  - @voyant-travel/operator-settings@0.9.0
  - @voyant-travel/commerce@0.39.1
  - @voyant-travel/distribution@0.158.0
  - @voyant-travel/inventory@0.13.5
  - @voyant-travel/bookings@0.168.0
  - @voyant-travel/relationships@0.128.5

## 0.167.0

### Patch Changes

- Updated dependencies [ca3713e]
  - @voyant-travel/commerce@0.39.0
  - @voyant-travel/finance@0.167.0
  - @voyant-travel/operator-settings@0.8.0
  - @voyant-travel/inventory@0.13.4
  - @voyant-travel/distribution@0.157.0
  - @voyant-travel/bookings@0.167.0
  - @voyant-travel/relationships@0.128.4

## 0.166.0

### Patch Changes

- Updated dependencies [c3bdcbc]
- Updated dependencies [3062a73]
- Updated dependencies [926ea47]
  - @voyant-travel/commerce@0.38.0
  - @voyant-travel/finance@0.166.0
  - @voyant-travel/operator-settings@0.7.0
  - @voyant-travel/distribution@0.156.0
  - @voyant-travel/inventory@0.13.3
  - @voyant-travel/bookings@0.166.0
  - @voyant-travel/relationships@0.128.3

## 0.165.0

### Patch Changes

- Updated dependencies [d6a9973]
  - @voyant-travel/finance@0.165.0
  - @voyant-travel/operator-settings@0.6.0
  - @voyant-travel/commerce@0.37.3
  - @voyant-travel/distribution@0.155.0
  - @voyant-travel/inventory@0.13.2
  - @voyant-travel/bookings@0.165.0
  - @voyant-travel/relationships@0.128.2

## 0.164.0

### Patch Changes

- @voyant-travel/commerce@0.37.2
- @voyant-travel/distribution@0.154.0
- @voyant-travel/inventory@0.13.1
- @voyant-travel/bookings@0.164.0
- @voyant-travel/finance@0.164.0
- @voyant-travel/relationships@0.128.1
- @voyant-travel/operator-settings@0.5.2

## 0.163.0

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/bookings@0.163.0
  - @voyant-travel/core@0.125.0
  - @voyant-travel/finance@0.163.0
  - @voyant-travel/relationships@0.128.0
  - @voyant-travel/commerce@0.37.1
  - @voyant-travel/distribution@0.153.0
  - @voyant-travel/inventory@0.13.0
  - @voyant-travel/action-ledger@0.111.1
  - @voyant-travel/db@0.114.9
  - @voyant-travel/hono@0.128.1
  - @voyant-travel/operator-settings@0.5.1
  - @voyant-travel/public-document-delivery@0.4.1
  - @voyant-travel/storage@0.111.1
  - @voyant-travel/legal-contracts@0.106.11

## 0.162.2

### Patch Changes

- @voyant-travel/bookings@0.162.2
- @voyant-travel/distribution@0.152.1
- @voyant-travel/finance@0.162.2

## 0.162.1

### Patch Changes

- Updated dependencies [5941d2c]
  - @voyant-travel/action-ledger@0.111.0
  - @voyant-travel/bookings@0.162.1
  - @voyant-travel/finance@0.162.1
  - @voyant-travel/inventory@0.12.1
  - @voyant-travel/relationships@0.127.1

## 0.162.0

### Minor Changes

- 8f0fa26: Make Hono the explicit sole server API runtime while moving package and
  deployment interfaces to role-based API vocabulary. Replace Hono-prefixed module,
  extension, bundle, lazy-route, and factory names with `Api*` names; move
  router-named domain runtime entry points to `./api-runtime`; and remove the old
  names without compatibility aliases.

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/action-ledger@0.110.0
  - @voyant-travel/bookings@0.162.0
  - @voyant-travel/commerce@0.37.0
  - @voyant-travel/distribution@0.152.0
  - @voyant-travel/finance@0.162.0
  - @voyant-travel/hono@0.128.0
  - @voyant-travel/inventory@0.12.0
  - @voyant-travel/operator-settings@0.5.0
  - @voyant-travel/public-document-delivery@0.4.0
  - @voyant-travel/relationships@0.127.0
  - @voyant-travel/storage@0.111.0
  - @voyant-travel/db@0.114.8

## 0.161.0

### Patch Changes

- Updated dependencies [85bfe2c]
- Updated dependencies [a1842a7]
- Updated dependencies [85bfe2c]
  - @voyant-travel/finance@0.161.0
  - @voyant-travel/hono@0.127.2
  - @voyant-travel/action-ledger@0.109.1
  - @voyant-travel/bookings@0.161.0
  - @voyant-travel/distribution@0.151.0
  - @voyant-travel/commerce@0.36.1
  - @voyant-travel/inventory@0.11.1
  - @voyant-travel/operator-settings@0.4.1
  - @voyant-travel/relationships@0.126.1

## 0.160.0

### Minor Changes

- 33cc782: Add typed, staff-only Tools for legal contract, template, policy, term, attachment, and guarded
  lifecycle operations. Add provider-neutral booking-contract preview, generation, and authorized
  delivery Tools without exposing private storage keys or allowing Tools to attest signatures or
  perform destructive void/delete operations. Separate document regeneration behind an explicit
  critical, irreversible, approval-required graph policy.

### Patch Changes

- Updated dependencies [cabf662]
- Updated dependencies [701ccc4]
- Updated dependencies [5f15e2e]
- Updated dependencies [7ac40a0]
- Updated dependencies [372f4f4]
- Updated dependencies [6c8d46a]
- Updated dependencies [a2fd806]
- Updated dependencies [b8cef4c]
- Updated dependencies [7e4ab07]
- Updated dependencies [497dff2]
- Updated dependencies [db5adce]
- Updated dependencies [54be000]
- Updated dependencies [bf19d5a]
- Updated dependencies [c9b6144]
- Updated dependencies [6604f9e]
- Updated dependencies [ff87f68]
  - @voyant-travel/action-ledger@0.109.0
  - @voyant-travel/core@0.124.0
  - @voyant-travel/tools@0.3.0
  - @voyant-travel/bookings@0.160.0
  - @voyant-travel/finance@0.160.0
  - @voyant-travel/commerce@0.36.0
  - @voyant-travel/inventory@0.11.0
  - @voyant-travel/distribution@0.150.0
  - @voyant-travel/operator-settings@0.4.0
  - @voyant-travel/relationships@0.126.0
  - @voyant-travel/db@0.114.7
  - @voyant-travel/hono@0.127.1
  - @voyant-travel/public-document-delivery@0.3.7
  - @voyant-travel/storage@0.110.2

## 0.159.0

### Patch Changes

- Updated dependencies [7e9f77a]
- Updated dependencies [49f55d0]
- Updated dependencies [552acbf]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0
  - @voyant-travel/hono@0.127.0
  - @voyant-travel/bookings@0.159.0
  - @voyant-travel/finance@0.159.0
  - @voyant-travel/inventory@0.10.4
  - @voyant-travel/action-ledger@0.108.6
  - @voyant-travel/commerce@0.35.9
  - @voyant-travel/db@0.114.6
  - @voyant-travel/distribution@0.149.0
  - @voyant-travel/operator-settings@0.3.14
  - @voyant-travel/public-document-delivery@0.3.6
  - @voyant-travel/relationships@0.125.4
  - @voyant-travel/storage@0.110.1

## 0.158.0

### Patch Changes

- 73ab096: Standardize first-party packages on package-owned deployment manifests, provider selection,
  access metadata, concrete event contracts, selected admin navigation, and published runtime
  references. Add Bookings Extras as an independently selected graph unit and remove the central
  admin navigation catalog.
  Link facets now distinguish entity `linkable` metadata from executable `definition` exports, and
  generated Node registries reject malformed definitions before service registration.
  Provider-owned required config and secrets now apply only when that provider is selected, so
  local and in-memory deployments do not require credentials for inactive remote providers.
- Updated dependencies [73ab096]
  - @voyant-travel/bookings@0.158.0
  - @voyant-travel/storage@0.110.0
  - @voyant-travel/action-ledger@0.108.5
  - @voyant-travel/commerce@0.35.8
  - @voyant-travel/core@0.122.2
  - @voyant-travel/db@0.114.5
  - @voyant-travel/distribution@0.148.0
  - @voyant-travel/finance@0.158.0
  - @voyant-travel/inventory@0.10.3
  - @voyant-travel/operator-settings@0.3.13
  - @voyant-travel/public-document-delivery@0.3.5
  - @voyant-travel/relationships@0.125.3
  - @voyant-travel/types@0.109.2

## 0.157.0

### Patch Changes

- @voyant-travel/bookings@0.157.0
- @voyant-travel/distribution@0.147.0
- @voyant-travel/finance@0.157.0
- @voyant-travel/commerce@0.35.7
- @voyant-travel/inventory@0.10.2
- @voyant-travel/relationships@0.125.2
- @voyant-travel/operator-settings@0.3.12

## 0.156.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [8d62a7c]
  - @voyant-travel/core@0.122.1
  - @voyant-travel/db@0.114.4
  - @voyant-travel/types@0.109.1
  - @voyant-travel/utils@0.107.1
  - @voyant-travel/action-ledger@0.108.4
  - @voyant-travel/bookings@0.156.1
  - @voyant-travel/commerce@0.35.6
  - @voyant-travel/distribution@0.146.1
  - @voyant-travel/finance@0.156.1
  - @voyant-travel/hono@0.126.3
  - @voyant-travel/inventory@0.10.1
  - @voyant-travel/legal-contracts@0.106.10
  - @voyant-travel/operator-settings@0.3.11
  - @voyant-travel/public-document-delivery@0.3.4
  - @voyant-travel/relationships@0.125.1
  - @voyant-travel/storage@0.109.4

## 0.156.0

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/finance@0.156.0
  - @voyant-travel/bookings@0.156.0
  - @voyant-travel/inventory@0.10.0
  - @voyant-travel/relationships@0.125.0
  - @voyant-travel/distribution@0.146.0
  - @voyant-travel/commerce@0.35.5
  - @voyant-travel/operator-settings@0.3.10
  - @voyant-travel/db@0.114.3
  - @voyant-travel/legal-contracts@0.106.9

## 0.155.1

### Patch Changes

- cc85042: Make deployment provider selection authoritative for Node storage, cache, shared
  state, and rate limiting. Replace vendor-specific object-store bindings and R2
  shims with logical media/document stores, a memory provider, an AWS SDK v3
  S3-compatible provider, and package-selected custom adapters. Add a portable
  storage provider conformance runner, resolve adapters from the `storage.object`
  graph provider, and make provider config/secret/resource usage explicit. Keep
  distributed shared state and rate-limit KV authoritative by bypassing the
  cache-only process-local L1, and move guest booking lookups onto the selected
  atomic rate-limit store. Remove the former R2/SigV4 exports.
- Updated dependencies [cc85042]
- Updated dependencies [07a6ee3]
  - @voyant-travel/core@0.122.0
  - @voyant-travel/bookings@0.155.1
  - @voyant-travel/db@0.114.2
  - @voyant-travel/finance@0.155.1
  - @voyant-travel/hono@0.126.2
  - @voyant-travel/inventory@0.9.3
  - @voyant-travel/storage@0.109.3
  - @voyant-travel/distribution@0.145.1
  - @voyant-travel/action-ledger@0.108.3
  - @voyant-travel/commerce@0.35.3
  - @voyant-travel/operator-settings@0.3.9
  - @voyant-travel/public-document-delivery@0.3.3
  - @voyant-travel/relationships@0.124.4

## 0.155.0

### Minor Changes

- bb6e890: Remove name-based contract-series selection and require the canonical active
  series identity of `prefix` plus `scope`.

### Patch Changes

- Updated dependencies [3f6694b]
  - @voyant-travel/core@0.121.0
  - @voyant-travel/action-ledger@0.108.2
  - @voyant-travel/bookings@0.155.0
  - @voyant-travel/commerce@0.35.2
  - @voyant-travel/db@0.114.1
  - @voyant-travel/distribution@0.145.0
  - @voyant-travel/finance@0.155.0
  - @voyant-travel/hono@0.126.1
  - @voyant-travel/inventory@0.9.2
  - @voyant-travel/operator-settings@0.3.8
  - @voyant-travel/public-document-delivery@0.3.2
  - @voyant-travel/relationships@0.124.3
  - @voyant-travel/storage@0.109.2

## 0.154.0

### Patch Changes

- 4d0eeed: Remove deprecated beta compatibility surfaces in favor of their canonical APIs.

  - Import Hono transport bundles from `@voyant-travel/hono/bundle` and use
    `HonoBundle`, `defineHonoBundle`, and `expandHonoBundles`.
  - Import public document delivery APIs from
    `@voyant-travel/public-document-delivery`.
  - Use permission-named API key helpers instead of the removed scope aliases.
  - Use `createRedisKvStore` for Redis-backed caching instead of the removed
    no-op Redis compatibility functions.
  - Use `entityTagColumns` instead of `tagsCoreColumns`.

- Updated dependencies [4d0eeed]
- Updated dependencies [bef5b7c]
  - @voyant-travel/hono@0.126.0
  - @voyant-travel/types@0.109.0
  - @voyant-travel/utils@0.107.0
  - @voyant-travel/db@0.114.0
  - @voyant-travel/finance@0.154.0
  - @voyant-travel/core@0.120.0
  - @voyant-travel/action-ledger@0.108.1
  - @voyant-travel/bookings@0.154.0
  - @voyant-travel/commerce@0.35.1
  - @voyant-travel/distribution@0.144.0
  - @voyant-travel/inventory@0.9.1
  - @voyant-travel/operator-settings@0.3.7
  - @voyant-travel/relationships@0.124.2
  - @voyant-travel/public-document-delivery@0.3.1
  - @voyant-travel/storage@0.109.1

## 0.153.0

### Minor Changes

- 490d132: Move standard Node contract document variables, generation, and subscriber provider composition into the Legal domain package.

### Patch Changes

- 047c3f9: Move booking and payment runtime configuration behind package-owned graph factories and typed deployment ports.
- 490d132: Move standard cross-package links from the operator starter to package-owned
  manifests and explicit standard-product selections, and generate executable
  links from the selected deployment graph.
- 490d132: Move standard first-party admin factories, package copy, slots, contributions, and icons into selected deployment graph composition.
- 490d132: Move Commerce runtime composition from the Operator starter into statically selected package contributors and typed domain ports.
- 490d132: Expose package-owned runtime contributor maps for Storefront, Legal, and Inventory deployment adapters.
- 490d132: Declare the remaining package-owned OpenAPI documents backed by committed operations and preserve exact graph API ownership at shared route mounts.
- 490d132: Derive the final package runtime bindings from generic deployment capabilities and primitives, with no product-specific generated runtime host resources.
- 490d132: Move the Finance, Legal, and Trips admin and public API surfaces onto package-owned selected-graph OpenAPI authority.
- 490d132: Declare package-owned runtime contributors in `voyant.package.v1` metadata and statically lower selected contributors into generated Node graph source. Node hosts now compose one generated contributor set from opaque host resources without enumerating first-party factories or package IDs.
- c65b05c: Move standard cross-package link tables and the person directory view into
  upgrade-safe package migration histories, use stable package ledger identities,
  and remove aggregate Drizzle and migration authority from the Operator starter.
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [cda53b6]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [282892e]
- Updated dependencies [490d132]
  - @voyant-travel/bookings@0.153.0
  - @voyant-travel/commerce@0.35.0
  - @voyant-travel/finance@0.153.0
  - @voyant-travel/action-ledger@0.108.0
  - @voyant-travel/distribution@0.143.0
  - @voyant-travel/relationships@0.124.1
  - @voyant-travel/storage@0.109.0
  - @voyant-travel/db@0.113.0
  - @voyant-travel/core@0.119.0
  - @voyant-travel/inventory@0.9.0
  - @voyant-travel/operator-settings@0.3.6
  - @voyant-travel/hono@0.125.1
  - @voyant-travel/types@0.108.1

## 0.152.0

### Patch Changes

- a799a34: Activate Legal booking-contract generation through selected graph composition and Legal-owned typed runtime ports.
- Updated dependencies [d771be3]
- Updated dependencies [60b1970]
- Updated dependencies [977c1bd]
- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [8f537b0]
- Updated dependencies [d26a820]
- Updated dependencies [d771be3]
- Updated dependencies [d771be3]
- Updated dependencies [bd7a830]
  - @voyant-travel/distribution@0.142.0
  - @voyant-travel/finance@0.152.0
  - @voyant-travel/core@0.118.0
  - @voyant-travel/action-ledger@0.107.0
  - @voyant-travel/relationships@0.124.0
  - @voyant-travel/types@0.108.0
  - @voyant-travel/bookings@0.152.0
  - @voyant-travel/hono@0.125.0
  - @voyant-travel/db@0.112.2
  - @voyant-travel/storage@0.108.1
  - @voyant-travel/utils@0.106.1

## 0.151.4

### Patch Changes

- Updated dependencies [e5aa097]
- Updated dependencies [01d5034]
- Updated dependencies [62b68aa]
- Updated dependencies [1081483]
- Updated dependencies [c66f9a5]
  - @voyant-travel/bookings@0.151.5
  - @voyant-travel/distribution@0.141.5
  - @voyant-travel/finance@0.151.4
  - @voyant-travel/core@0.117.0
  - @voyant-travel/storage@0.108.0
  - @voyant-travel/action-ledger@0.106.4
  - @voyant-travel/db@0.112.1
  - @voyant-travel/hono@0.124.1
  - @voyant-travel/relationships@0.123.4

## 0.151.3

### Patch Changes

- Updated dependencies [ca90eb5]
  - @voyant-travel/db@0.112.0
  - @voyant-travel/hono@0.124.0
  - @voyant-travel/action-ledger@0.106.3
  - @voyant-travel/bookings@0.151.4
  - @voyant-travel/distribution@0.141.4
  - @voyant-travel/finance@0.151.3
  - @voyant-travel/relationships@0.123.3
  - @voyant-travel/types@0.107.3

## 0.151.2

### Patch Changes

- Updated dependencies [8576451]
  - @voyant-travel/core@0.116.0
  - @voyant-travel/action-ledger@0.106.2
  - @voyant-travel/bookings@0.151.3
  - @voyant-travel/db@0.111.2
  - @voyant-travel/distribution@0.141.3
  - @voyant-travel/finance@0.151.2
  - @voyant-travel/hono@0.123.2
  - @voyant-travel/relationships@0.123.2
  - @voyant-travel/storage@0.107.2

## 0.151.1

### Patch Changes

- Updated dependencies [e4e6621]
- Updated dependencies [953e418]
- Updated dependencies [2153e48]
  - @voyant-travel/core@0.115.0
  - @voyant-travel/action-ledger@0.106.1
  - @voyant-travel/bookings@0.151.1
  - @voyant-travel/distribution@0.141.1
  - @voyant-travel/finance@0.151.1
  - @voyant-travel/hono@0.123.0
  - @voyant-travel/db@0.111.1
  - @voyant-travel/relationships@0.123.1
  - @voyant-travel/storage@0.107.1

## 0.151.0

### Minor Changes

- a370024: Publish package-owned deployment manifests for legal, storefront, and first-party edge plugins.
- e3dc5a9: Declare the existing customer and commerce admin routes, navigation, slots, copy, and widget contributions in their package-owned Voyant manifests.
- e3dc5a9: Move existing customer and commerce package surfaces into package-owned Voyant manifests, including Node application events, tools, access resources, action metadata, setup migrations, outbound webhooks, and retain-data lifecycle declarations.

### Patch Changes

- a370024: Rehome finance, quote, legal, and storefront bridge graph declarations into their owning packages with executable runtime descriptors.
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/core@0.114.0
  - @voyant-travel/finance@0.151.0
  - @voyant-travel/bookings@0.151.0
  - @voyant-travel/distribution@0.141.0
  - @voyant-travel/action-ledger@0.106.0
  - @voyant-travel/db@0.111.0
  - @voyant-travel/relationships@0.123.0
  - @voyant-travel/storage@0.107.0
  - @voyant-travel/hono@0.122.4
  - @voyant-travel/types@0.107.2

## 0.150.0

### Patch Changes

- Updated dependencies [496f2ef]
  - @voyant-travel/bookings@0.150.0
  - @voyant-travel/core@0.113.0
  - @voyant-travel/distribution@0.140.0
  - @voyant-travel/finance@0.150.0
  - @voyant-travel/action-ledger@0.105.15
  - @voyant-travel/db@0.110.2
  - @voyant-travel/hono@0.122.3
  - @voyant-travel/relationships@0.122.12

## 0.149.1

### Patch Changes

- 5e1d221: Publish `voyant.package.v1` compatibility metadata from first-party
  schema-owning packages so deployment graph package admission can validate their
  framework, target, and deployment-mode compatibility before runtime imports.
- Updated dependencies [5e1d221]
- Updated dependencies [682d7d0]
  - @voyant-travel/action-ledger@0.105.14
  - @voyant-travel/bookings@0.149.1
  - @voyant-travel/db@0.110.1
  - @voyant-travel/distribution@0.139.1
  - @voyant-travel/finance@0.149.1
  - @voyant-travel/relationships@0.122.11
  - @voyant-travel/hono@0.122.2

## 0.149.0

### Patch Changes

- @voyant-travel/bookings@0.149.0
- @voyant-travel/distribution@0.139.0
- @voyant-travel/finance@0.149.0
- @voyant-travel/relationships@0.122.10

## 0.148.0

### Patch Changes

- @voyant-travel/bookings@0.148.0
- @voyant-travel/distribution@0.138.0
- @voyant-travel/finance@0.148.0
- @voyant-travel/relationships@0.122.9

## 0.147.0

### Patch Changes

- @voyant-travel/bookings@0.147.0
- @voyant-travel/distribution@0.137.0
- @voyant-travel/finance@0.147.0
- @voyant-travel/relationships@0.122.8

## 0.146.0

### Patch Changes

- @voyant-travel/bookings@0.146.0
- @voyant-travel/distribution@0.136.0
- @voyant-travel/finance@0.146.0
- @voyant-travel/relationships@0.122.7

## 0.145.0

### Patch Changes

- @voyant-travel/distribution@0.135.0
- @voyant-travel/bookings@0.145.0
- @voyant-travel/finance@0.145.0
- @voyant-travel/relationships@0.122.6

## 0.144.0

### Patch Changes

- Updated dependencies [ba6c30a]
  - @voyant-travel/bookings@0.144.0
  - @voyant-travel/distribution@0.134.0
  - @voyant-travel/finance@0.144.0
  - @voyant-travel/relationships@0.122.5

## 0.143.0

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/utils@0.106.0
  - @voyant-travel/db@0.110.0
  - @voyant-travel/hono@0.122.0
  - @voyant-travel/core@0.112.3
  - @voyant-travel/bookings@0.143.0
  - @voyant-travel/finance@0.143.0
  - @voyant-travel/relationships@0.122.4
  - @voyant-travel/action-ledger@0.105.13
  - @voyant-travel/distribution@0.133.0
  - @voyant-travel/types@0.107.1

## 0.142.0

### Patch Changes

- Updated dependencies [ee09a7f]
  - @voyant-travel/distribution@0.132.0
  - @voyant-travel/bookings@0.142.0
  - @voyant-travel/finance@0.142.0
  - @voyant-travel/relationships@0.122.3

## 0.141.0

### Patch Changes

- @voyant-travel/distribution@0.131.0
- @voyant-travel/bookings@0.141.0
- @voyant-travel/finance@0.141.0
- @voyant-travel/relationships@0.122.2

## 0.140.0

### Patch Changes

- @voyant-travel/bookings@0.140.0
- @voyant-travel/distribution@0.130.0
- @voyant-travel/finance@0.140.0
- @voyant-travel/relationships@0.122.1

## 0.139.0

### Patch Changes

- Updated dependencies [c9a356f]
- Updated dependencies [bf2d4a5]
- Updated dependencies [fc71db1]
- Updated dependencies [fc71db1]
- Updated dependencies [6474f42]
- Updated dependencies [5786f63]
- Updated dependencies [e1290d9]
- Updated dependencies [92e170a]
- Updated dependencies [f3b8bef]
- Updated dependencies [13f21a1]
- Updated dependencies [9f29b74]
- Updated dependencies [fcad28b]
  - @voyant-travel/types@0.107.0
  - @voyant-travel/core@0.112.0
  - @voyant-travel/hono@0.121.0
  - @voyant-travel/relationships@0.122.0
  - @voyant-travel/bookings@0.139.0
  - @voyant-travel/finance@0.139.0
  - @voyant-travel/distribution@0.129.0
  - @voyant-travel/utils@0.105.6
  - @voyant-travel/action-ledger@0.105.12
  - @voyant-travel/db@0.109.5

## 0.138.2

### Patch Changes

- Updated dependencies [1cb9cba]
- Updated dependencies [131ff9b]
  - @voyant-travel/hono@0.120.0
  - @voyant-travel/action-ledger@0.105.11
  - @voyant-travel/bookings@0.138.6
  - @voyant-travel/distribution@0.128.4
  - @voyant-travel/finance@0.138.8
  - @voyant-travel/relationships@0.121.10

## 0.138.1

### Patch Changes

- Updated dependencies [b254511]
- Updated dependencies [141bd2b]
- Updated dependencies [86fbb05]
  - @voyant-travel/bookings@0.138.5
  - @voyant-travel/finance@0.138.7
  - @voyant-travel/hono@0.119.0
  - @voyant-travel/action-ledger@0.105.10
  - @voyant-travel/distribution@0.128.3
  - @voyant-travel/relationships@0.121.9

## 0.138.0

### Patch Changes

- Updated dependencies [2325c93]
  - @voyant-travel/distribution@0.128.0
  - @voyant-travel/bookings@0.138.0
  - @voyant-travel/finance@0.138.0
  - @voyant-travel/relationships@0.121.7

## 0.137.9

### Patch Changes

- 04aa601: Keep booking contract document generation from issuing contract numbers or leaving issued contract rows when the document renderer fails.
  - @voyant-travel/distribution@0.127.3

## 0.137.8

### Patch Changes

- f6c8fcf: Delete contract attachment document storage objects when the attachment row is removed.
- 1d65f48: Preserve omitted contract number series fields during PATCH validation so partial
  updates no longer apply create-time defaults such as `scope: "customer"`.
- Updated dependencies [1d65f48]
  - @voyant-travel/legal-contracts@0.106.8
  - @voyant-travel/bookings@0.137.6

## 0.137.7

### Patch Changes

- 5288b85: Prevent the seeded customer sales agreement traveler heading from rendering the missing-value placeholder when traveler counts are unknown.
- cc29167: Require public document delivery grants for public contract read/sign routes and return signer-safe contract/signature payloads.

## 0.137.6

### Patch Changes

- 5928f32: Fix legal policy PATCH schemas so omitted fields do not receive create defaults, and return a 409 conflict when deleting policies with recorded acceptances.
- Updated dependencies [5928f32]
  - @voyant-travel/legal-contracts@0.106.7

## 0.137.5

### Patch Changes

- 53f949c: Filter legal policy detail acceptances by the current policy so unrelated policy version acceptances are not shown.
- Updated dependencies [fd17317]
- Updated dependencies [53f949c]
  - @voyant-travel/hono@0.118.3
  - @voyant-travel/legal-contracts@0.106.6
  - @voyant-travel/bookings@0.137.5

## 0.137.4

### Patch Changes

- bcea95d: Localize generated contract payment method labels from the contract language instead of title-casing raw payment method enum values.

## 0.137.3

### Patch Changes

- 5145a69: Ignore inactive booking payment schedule rows when resolving contract payment schedule variables, so cancelled or expired deposit and balance rows no longer render as owed.

## 0.137.2

### Patch Changes

- d2df4c1: Add a `forceRecompute` flag to booking contract document generation so issued contracts can refresh stored variables from corrected booking data and replace stale documents.
- Updated dependencies [d2df4c1]
  - @voyant-travel/legal-contracts@0.106.5

## 0.137.1

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/storage@0.106.0
  - @voyant-travel/hono@0.118.0
  - @voyant-travel/finance@0.137.1
  - @voyant-travel/action-ledger@0.105.9
  - @voyant-travel/bookings@0.137.1
  - @voyant-travel/distribution@0.127.1
  - @voyant-travel/relationships@0.121.6

## 0.137.0

### Patch Changes

- Updated dependencies [7c5ee80]
  - @voyant-travel/hono@0.117.0
  - @voyant-travel/action-ledger@0.105.8
  - @voyant-travel/bookings@0.137.0
  - @voyant-travel/distribution@0.127.0
  - @voyant-travel/finance@0.137.0
  - @voyant-travel/relationships@0.121.5

## 0.136.2

### Patch Changes

- 12a1eb2: Expose client-safe subpaths for validation schemas, linkable metadata, template authoring metadata, finance payment-policy primitives, and Hono reporter utilities. Move browser-facing React/operator imports off mixed runtime barrels so client bundles do not pull Hono request context or other server-only runtime code.
- Updated dependencies [12a1eb2]
  - @voyant-travel/bookings@0.136.2
  - @voyant-travel/distribution@0.126.2
  - @voyant-travel/finance@0.136.2
  - @voyant-travel/hono@0.116.2
  - @voyant-travel/relationships@0.121.4

## 0.136.1

### Patch Changes

- @voyant-travel/bookings@0.136.1
- @voyant-travel/distribution@0.126.1
- @voyant-travel/finance@0.136.1

## 0.136.0

### Patch Changes

- Updated dependencies [293e5e4]
  - @voyant-travel/hono@0.116.1
  - @voyant-travel/db@0.109.2
  - @voyant-travel/legal-contracts@0.106.2
  - @voyant-travel/bookings@0.136.0
  - @voyant-travel/distribution@0.126.0
  - @voyant-travel/finance@0.136.0
  - @voyant-travel/relationships@0.121.3

## 0.135.0

### Patch Changes

- @voyant-travel/db@0.109.1
- @voyant-travel/legal-contracts@0.106.1
- @voyant-travel/bookings@0.135.0
- @voyant-travel/distribution@0.125.0
- @voyant-travel/finance@0.135.0
- @voyant-travel/relationships@0.121.2

## 0.134.1

### Patch Changes

- Updated dependencies [684b321]
- Updated dependencies [2542715]
  - @voyant-travel/hono@0.116.0
  - @voyant-travel/action-ledger@0.105.7
  - @voyant-travel/bookings@0.134.1
  - @voyant-travel/distribution@0.124.1
  - @voyant-travel/finance@0.134.1
  - @voyant-travel/relationships@0.121.1

## 0.134.0

### Minor Changes

- 51f7dea: Share one list-response contract instead of per-module copies (voyant#2109).

  `@voyant-travel/types` now owns the canonical offset-paginated list envelope: the `ListResponse<T>` type + `listResponse(data, { total, limit, offset })` builder, plus the zod `paginationSchema` (coerced `limit` 1–200 default 50, `offset` ≥0 default 0) and the `listResponseSchema(item)` factory. Both server services and `*-react` clients import from this single source.

  Server side: every module's local `paginate()` / inline `{ data, total, limit, offset }` construction now routes through the shared `listResponse` builder, and the count read is standardized on `count` internally — fixing the drift where finance, notifications and the legal contracts/policies services read `countResult[0]?.total` while every other module read `countResult[0]?.count` (their `count(*)` selects were aliased `total`; they are now aliased `count`). The returned shape is byte-for-byte identical.

  Client side: the ~23 copied `paginatedEnvelope` zod schemas across the `*-react` packages are replaced by re-exporting the shared `listResponseSchema` factory under the same `paginatedEnvelope` name, so consumers are unchanged.

  Input alignment: `finance-contracts` and `legal-contracts` pagination `limit` caps were raised from `.max(100)` to `.max(200)` to match the framework-wide max.

  Additive and non-breaking.

### Patch Changes

- Updated dependencies [04b257c]
- Updated dependencies [78c15fa]
- Updated dependencies [51f7dea]
  - @voyant-travel/hono@0.115.0
  - @voyant-travel/types@0.106.0
  - @voyant-travel/bookings@0.134.0
  - @voyant-travel/distribution@0.124.0
  - @voyant-travel/finance@0.134.0
  - @voyant-travel/legal-contracts@0.106.0
  - @voyant-travel/relationships@0.121.0
  - @voyant-travel/action-ledger@0.105.6
  - @voyant-travel/utils@0.105.4

## 0.133.0

### Minor Changes

- 4abf9a2: Deployment team management + granular member RBAC (voyant#2085).

  - `@voyant-travel/types`: `member-roles` (preset bundles reusing the API-key permission catalog) + `settings`/`team` resources.
  - `@voyant-travel/auth`: `cloud-broker` member-management client + assertion `scopes`.
  - `@voyant-travel/hono`: opt-in staff-session scope enforcement in `requireActor` (`VOYANT_RBAC_ENFORCE`) + `isStaffRbacEnforced`.
  - `@voyant-travel/admin`: auth-mode-aware `TeamSettingsPage` with a granular permission editor.
  - `@voyant-travel/bookings`/`legal`: PII reveal gated on `bookings-pii:read` under enforcement.
  - `@voyant-travel/db`: `user_profiles.permissions` + `cloud_auth_user_links.scopes`.

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/hono@0.114.0
  - @voyant-travel/bookings@0.133.0
  - @voyant-travel/db@0.109.0
  - @voyant-travel/utils@0.105.3
  - @voyant-travel/action-ledger@0.105.5
  - @voyant-travel/distribution@0.123.0
  - @voyant-travel/finance@0.133.0
  - @voyant-travel/relationships@0.120.13
  - @voyant-travel/legal-contracts@0.105.2

## 0.132.0

### Patch Changes

- @voyant-travel/distribution@0.122.0
- @voyant-travel/bookings@0.132.0
- @voyant-travel/finance@0.132.0
- @voyant-travel/relationships@0.120.12

## 0.131.1

### Patch Changes

- Updated dependencies [021ec00]
  - @voyant-travel/hono@0.113.0
  - @voyant-travel/core@0.111.0
  - @voyant-travel/action-ledger@0.105.4
  - @voyant-travel/bookings@0.131.1
  - @voyant-travel/distribution@0.121.1
  - @voyant-travel/finance@0.131.2
  - @voyant-travel/relationships@0.120.11
  - @voyant-travel/db@0.108.5

## 0.131.0

### Patch Changes

- @voyant-travel/bookings@0.131.0
- @voyant-travel/distribution@0.121.0
- @voyant-travel/finance@0.131.0
- @voyant-travel/relationships@0.120.10

## 0.130.0

### Patch Changes

- @voyant-travel/bookings@0.130.0
- @voyant-travel/distribution@0.120.0
- @voyant-travel/finance@0.130.0
- @voyant-travel/relationships@0.120.9

## 0.129.1

### Patch Changes

- 466e576: Stop contract generation from breaking when the `option_unit_type` enum lacks `accommodation`.

  The contract-variable resolver filtered `option_units` with `unit_type IN ('room', 'accommodation')`. `accommodation` is not a member of the `option_unit_type` enum on every deployment, so Postgres rejected the statement with `invalid input value for enum option_unit_type: "accommodation"` before it ran — taking down _all_ contract generation (admin preview and `POST /v1/admin/legal/contracts/bookings/:id/generate-document`) on any lagging deployment, not just bookings with accommodation units. The column is now compared as text (`unit_type::text IN (...)`), so a value the enum doesn't have simply never matches instead of throwing.

## 0.129.0

### Patch Changes

- @voyant-travel/distribution@0.119.0
- @voyant-travel/bookings@0.129.0
- @voyant-travel/finance@0.129.0
- @voyant-travel/relationships@0.120.7

## 0.128.0

### Patch Changes

- @voyant-travel/bookings@0.128.0
- @voyant-travel/distribution@0.118.0
- @voyant-travel/finance@0.128.0
- @voyant-travel/relationships@0.120.6

## 0.127.0

### Patch Changes

- Updated dependencies [435a5d1]
  - @voyant-travel/bookings@0.127.0
  - @voyant-travel/distribution@0.117.0
  - @voyant-travel/finance@0.127.0
  - @voyant-travel/relationships@0.120.5

## 0.126.1

### Patch Changes

- 1841ce2: D.2 slice 1 (batch 2) — 14 more packages own + ship their migration history (db, relationships, quotes, identity, distribution, inventory, commerce, catalog, finance, notifications, legal, storefront, charters, cruises). Each baseline reproduces the framework bundle's tables column-for-column, and all package sources now apply together (fresh-D.2 union) without collision.

  Shared enums: the codebase inlines copies of some enums to avoid cross-package schema imports (e.g. `service_type` in distribution + inventory, `entity_type` in relationships + quotes). Per-package generation would emit duplicate `CREATE TYPE`, colliding on a fresh D.2 database. All package migrations now wrap `CREATE TYPE … AS ENUM(…)` in an idempotent `DO`-block guard (subset-safe; whichever source applies first creates the type, the rest no-op). The db package additionally owns the shared Postgres extensions (pg_trgm / unaccent) that downstream trigram indexes need on a fresh D.2 database (the retired bundle injected them; per-package sources did not). The batch-1 packages (operator-settings, action-ledger, workflow-runs, trips) get the same guard for uniformity. No runtime change. See `docs/architecture/migration-collector-d2.md`.

- Updated dependencies [1841ce2]
  - @voyant-travel/db@0.108.4
  - @voyant-travel/relationships@0.120.4
  - @voyant-travel/distribution@0.116.1
  - @voyant-travel/finance@0.126.1
  - @voyant-travel/action-ledger@0.105.3

## 0.126.0

### Minor Changes

- 84b9d4b: legal: remove cross-package foreign-key constraints from `contracts` and `contract_signatures` (`person_id → relationships.people`, `organization_id → relationships.organizations`, `supplier_id → distribution.suppliers`). These horizontal cross-module associations now follow the module-decoupling pattern — plain id columns + `defineLink` at the deployment (person/organization/supplier ↔ contract) + service-layer validation — instead of hard cross-package FKs. The `person_id`/`organization_id`/`supplier_id` columns and their indexes are unchanged; only the FK constraints are dropped. `createContract`/`updateContract` now validate that referenced person/organization/supplier ids exist (400 on a stale/mistyped id), preserving the integrity the FK used to enforce.

  framework-migrations: bundle migration drops the four legal cross-package FK constraints so the shipped bundle matches the decoupled schema. (The deployment migrate runner's baseline-import guard now also verifies dropped constraints are actually gone before importing — so existing deployments can't silently baseline this constraint drop without applying it.)

### Patch Changes

- @voyant-travel/bookings@0.126.0
- @voyant-travel/distribution@0.116.0
- @voyant-travel/finance@0.126.0
- @voyant-travel/relationships@0.120.3

## 0.125.0

### Patch Changes

- @voyant-travel/db@0.108.3
- @voyant-travel/legal-contracts@0.105.1
- @voyant-travel/bookings@0.125.0
- @voyant-travel/distribution@0.115.0
- @voyant-travel/finance@0.125.0
- @voyant-travel/relationships@0.120.2
- @voyant-travel/hono@0.112.2

## 0.124.0

### Patch Changes

- @voyant-travel/hono@0.112.1
- @voyant-travel/bookings@0.124.0
- @voyant-travel/distribution@0.114.0
- @voyant-travel/finance@0.124.0
- @voyant-travel/relationships@0.120.1

## 0.123.0

### Patch Changes

- Updated dependencies [04681f3]
- Updated dependencies [98f4a40]
- Updated dependencies [a3bd51c]
- Updated dependencies [170388e]
- Updated dependencies [e9d9dbb]
- Updated dependencies [9c3fe53]
- Updated dependencies [d29dd47]
- Updated dependencies [ce2a568]
- Updated dependencies [3aa90b4]
- Updated dependencies [3b27dcc]
- Updated dependencies [39d48fe]
- Updated dependencies [9616f1f]
- Updated dependencies [d222e9f]
  - @voyant-travel/bookings@0.123.0
  - @voyant-travel/core@0.110.0
  - @voyant-travel/hono@0.112.0
  - @voyant-travel/relationships@0.120.0
  - @voyant-travel/finance@0.123.0
  - @voyant-travel/distribution@0.113.0
  - @voyant-travel/action-ledger@0.105.1
  - @voyant-travel/db@0.108.2

## 0.122.0

### Minor Changes

- 85caeef: The legal module now owns the contract-PDF generation orchestration: new exports `createContractDocumentService(options)` (+ `ensureDefaultContractSeries`, `resetContractDocumentForBooking`) from `@voyant-travel/legal` and `./contract-document`. Template resolution → variable binding → PDF render → contract-record persistence now live in the package; the deployment injects only its PDF engine, document storage, and PII providers.
- 85a13d3: The legal module now owns contract-template variable building: new export
  `buildContractVariableBindings(options)` (from `@voyant-travel/legal` and
  `./contract-variables`). The deployment injects only its operator-settings reads
  (operator profile / payment instructions / policy source); the cross-module
  variable assembly (payment schedule, rooms summary, customer hydration) no longer
  lives in the deployment.

### Patch Changes

- Updated dependencies [c9de9c4]
- Updated dependencies [14f4234]
- Updated dependencies [89d4ca9]
- Updated dependencies [51dd276]
  - @voyant-travel/finance@0.122.0
  - @voyant-travel/bookings@0.122.0
  - @voyant-travel/distribution@0.112.0
  - @voyant-travel/relationships@0.119.5

## 0.121.0

### Minor Changes

- 503a634: The legal module now owns the contract-document routes. New exports:
  `createContractDocumentRoutes(options)`, `CONTRACT_DOCUMENT_ROUTE_PATHS`, and
  `ContractDocumentRoutesOptions` (from `@voyant-travel/legal` and
  `@voyant-travel/legal/contract-document-routes`). The deployment injects the
  contract generator and document storage; the route implementations
  (generate-contract, private document file serving + scriptable-mime safety) no
  longer live in the deployment.

### Patch Changes

- Updated dependencies [13fe70b]
- Updated dependencies [13fe70b]
- Updated dependencies [9ea7220]
- Updated dependencies [13fe70b]
  - @voyant-travel/action-ledger@0.105.0
  - @voyant-travel/finance@0.121.0
  - @voyant-travel/hono@0.111.0
  - @voyant-travel/storage@0.105.0
  - @voyant-travel/bookings@0.121.0
  - @voyant-travel/relationships@0.119.4
  - @voyant-travel/distribution@0.111.0

## 0.120.2

### Patch Changes

- 756213e: Add public cache policy headers for cacheable public read routes and expose public response cache configuration typing.
- Updated dependencies [756213e]
  - @voyant-travel/bookings@0.120.2
  - @voyant-travel/hono@0.110.3

## 0.120.1

### Patch Changes

- @voyant-travel/bookings@0.120.1
- @voyant-travel/distribution@0.110.4
- @voyant-travel/finance@0.120.1

## 0.120.0

### Minor Changes

- c3f4fa0: Move Legal acceptance, contract, and term records to target refs with explicit legacy transaction compatibility fields.

### Patch Changes

- 3e160d3: Move supplier and external-reference runtime and React implementation under
  Distribution owner paths. The old supplier and external-ref package names are
  removed from v1 while operator runtime and legal schema imports use
  Distribution-owned surfaces.
- Updated dependencies [2f1228a]
- Updated dependencies [efc803c]
- Updated dependencies [d92d1a8]
- Updated dependencies [6bff46f]
- Updated dependencies [081e310]
- Updated dependencies [eb17d3d]
- Updated dependencies [3cc83b6]
- Updated dependencies [0fa993c]
- Updated dependencies [9e970a5]
- Updated dependencies [b711b04]
- Updated dependencies [44c3875]
- Updated dependencies [3e160d3]
- Updated dependencies [c3f4fa0]
- Updated dependencies [47fef18]
- Updated dependencies [2c9c4a4]
- Updated dependencies [c8189fc]
- Updated dependencies [6196b3b]
- Updated dependencies [e80e3d3]
  - @voyant-travel/bookings@0.120.0
  - @voyant-travel/hono@0.110.0
  - @voyant-travel/distribution@0.110.0
  - @voyant-travel/finance@0.120.0
  - @voyant-travel/legal-contracts@0.105.0
  - @voyant-travel/relationships@0.119.3
  - @voyant-travel/action-ledger@0.104.11

## 0.119.2

### Patch Changes

- b402bcd: Split oversized legal contract generation and dialog modules into smaller internal files while preserving existing public exports and behavior.

## 0.119.1

### Patch Changes

- Updated dependencies [f25e790]
  - @voyant-travel/db@0.108.0
  - @voyant-travel/action-ledger@0.104.9
  - @voyant-travel/bookings@0.119.1
  - @voyant-travel/crm@0.119.1
  - @voyant-travel/finance@0.119.1
  - @voyant-travel/hono@0.109.1
  - @voyant-travel/suppliers@0.111.6

## 0.119.0

### Patch Changes

- Updated dependencies [b0f1e21]
- Updated dependencies [b0f1e21]
  - @voyant-travel/hono@0.109.0
  - @voyant-travel/utils@0.105.0
  - @voyant-travel/action-ledger@0.104.8
  - @voyant-travel/bookings@0.119.0
  - @voyant-travel/crm@0.119.0
  - @voyant-travel/finance@0.119.0
  - @voyant-travel/suppliers@0.111.5

## 0.118.0

### Patch Changes

- @voyant-travel/bookings@0.118.0
- @voyant-travel/finance@0.118.0
- @voyant-travel/crm@0.118.0
- @voyant-travel/suppliers@0.111.4

## 0.117.1

### Patch Changes

- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
  - @voyant-travel/bookings@0.117.1
  - @voyant-travel/suppliers@0.111.3
  - @voyant-travel/finance@0.117.1
  - @voyant-travel/core@0.109.0
  - @voyant-travel/db@0.107.0
  - @voyant-travel/hono@0.108.0
  - @voyant-travel/action-ledger@0.104.7
  - @voyant-travel/crm@0.117.1

## 0.117.0

### Patch Changes

- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
  - @voyant-travel/bookings@0.117.0
  - @voyant-travel/core@0.108.0
  - @voyant-travel/db@0.106.0
  - @voyant-travel/hono@0.107.0
  - @voyant-travel/finance@0.117.0
  - @voyant-travel/action-ledger@0.104.6
  - @voyant-travel/crm@0.117.0
  - @voyant-travel/suppliers@0.111.2

## 0.116.0

### Patch Changes

- Updated dependencies [418fa82]
- Updated dependencies [418fa82]
- Updated dependencies [418fa82]
  - @voyant-travel/core@0.107.0
  - @voyant-travel/db@0.105.0
  - @voyant-travel/hono@0.106.0
  - @voyant-travel/action-ledger@0.104.5
  - @voyant-travel/bookings@0.116.0
  - @voyant-travel/crm@0.116.0
  - @voyant-travel/finance@0.116.0
  - @voyant-travel/suppliers@0.111.1

## 0.115.0

### Patch Changes

- @voyant-travel/bookings@0.115.0
- @voyant-travel/crm@0.115.0
- @voyant-travel/finance@0.115.0
- @voyant-travel/suppliers@0.111.0

## 0.114.0

### Patch Changes

- @voyant-travel/bookings@0.114.0
- @voyant-travel/crm@0.114.0
- @voyant-travel/finance@0.114.0
- @voyant-travel/suppliers@0.110.1

## 0.113.0

### Patch Changes

- @voyant-travel/bookings@0.113.0
- @voyant-travel/crm@0.113.0
- @voyant-travel/finance@0.113.0
- @voyant-travel/suppliers@0.110.0

## 0.112.0

### Patch Changes

- @voyant-travel/bookings@0.112.0
- @voyant-travel/crm@0.112.0
- @voyant-travel/finance@0.112.0
- @voyant-travel/suppliers@0.109.0

## 0.111.0

### Patch Changes

- @voyant-travel/bookings@0.111.0
- @voyant-travel/crm@0.111.0
- @voyant-travel/finance@0.111.0
- @voyant-travel/suppliers@0.108.0

## 0.110.0

### Patch Changes

- Updated dependencies [eeb23df]
  - @voyant-travel/core@0.106.0
  - @voyant-travel/action-ledger@0.104.4
  - @voyant-travel/bookings@0.110.0
  - @voyant-travel/crm@0.110.0
  - @voyant-travel/db@0.104.4
  - @voyant-travel/finance@0.110.0
  - @voyant-travel/hono@0.105.3
  - @voyant-travel/suppliers@0.107.0

## 0.109.0

### Patch Changes

- Updated dependencies [344e7b6]
  - @voyant-travel/core@0.105.1
  - @voyant-travel/bookings@0.109.0
  - @voyant-travel/crm@0.109.0
  - @voyant-travel/finance@0.109.0
  - @voyant-travel/suppliers@0.106.0
  - @voyant-travel/hono@0.105.2

## 0.108.0

### Patch Changes

- @voyant-travel/bookings@0.108.0
- @voyant-travel/finance@0.108.0
- @voyant-travel/crm@0.108.0
- @voyant-travel/suppliers@0.105.2

## 0.107.1

### Patch Changes

- Updated dependencies [656b25d]
  - @voyant-travel/hono@0.105.0
  - @voyant-travel/action-ledger@0.104.3
  - @voyant-travel/bookings@0.107.1
  - @voyant-travel/crm@0.107.1
  - @voyant-travel/finance@0.107.1
  - @voyant-travel/suppliers@0.105.1

## 0.107.0

### Patch Changes

- Updated dependencies [d1ad572]
- Updated dependencies [d1ad572]
- Updated dependencies [d1ad572]
- Updated dependencies [c2aef18]
- Updated dependencies [d1ad572]
- Updated dependencies [d1ad572]
  - @voyant-travel/crm@0.107.0
  - @voyant-travel/core@0.105.0
  - @voyant-travel/db@0.104.3
  - @voyant-travel/legal-contracts@0.104.2
  - @voyant-travel/action-ledger@0.104.2
  - @voyant-travel/bookings@0.107.0
  - @voyant-travel/finance@0.107.0
  - @voyant-travel/hono@0.104.2
  - @voyant-travel/suppliers@0.105.0

## 0.106.3

### Patch Changes

- 801b3e8: Add paid-in-full and amount-due contract variables, and clarify scheduled payment aliases.

## 0.106.2

### Patch Changes

- b743087: Populate auto-generated contract booking payment schedule aliases and room summaries from persisted booking data.

## 0.106.1

### Patch Changes

- 8f2a93c: Populate booking-derived contract variables for product, destination, departure slot, and traveler identity snapshots.

## 0.106.0

### Patch Changes

- Updated dependencies [6949669]
  - @voyant-travel/crm@0.106.0
  - @voyant-travel/bookings@0.106.0
  - @voyant-travel/finance@0.106.0
  - @voyant-travel/suppliers@0.104.3

## 0.105.0

### Patch Changes

- @voyant-travel/bookings@0.105.0
- @voyant-travel/finance@0.105.0
- @voyant-travel/crm@0.105.0
- @voyant-travel/suppliers@0.104.2

## 0.104.1

### Patch Changes

- @voyant-travel/bookings@0.104.1
- @voyant-travel/core@0.104.1
- @voyant-travel/crm@0.104.1
- @voyant-travel/db@0.104.1
- @voyant-travel/finance@0.104.1
- @voyant-travel/hono@0.104.1
- @voyant-travel/legal-contracts@0.104.1
- @voyant-travel/storage@0.104.1
- @voyant-travel/suppliers@0.104.1
- @voyant-travel/utils@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/bookings@0.104.0
- @voyant-travel/core@0.104.0
- @voyant-travel/crm@0.104.0
- @voyant-travel/db@0.104.0
- @voyant-travel/finance@0.104.0
- @voyant-travel/hono@0.104.0
- @voyant-travel/legal-contracts@0.104.0
- @voyant-travel/storage@0.104.0
- @voyant-travel/suppliers@0.104.0
- @voyant-travel/utils@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/bookings@0.103.0
- @voyant-travel/core@0.103.0
- @voyant-travel/crm@0.103.0
- @voyant-travel/db@0.103.0
- @voyant-travel/finance@0.103.0
- @voyant-travel/hono@0.103.0
- @voyant-travel/legal-contracts@0.103.0
- @voyant-travel/storage@0.103.0
- @voyant-travel/suppliers@0.103.0
- @voyant-travel/utils@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/bookings@0.102.0
- @voyant-travel/core@0.102.0
- @voyant-travel/crm@0.102.0
- @voyant-travel/db@0.102.0
- @voyant-travel/finance@0.102.0
- @voyant-travel/hono@0.102.0
- @voyant-travel/legal-contracts@0.102.0
- @voyant-travel/storage@0.102.0
- @voyant-travel/suppliers@0.102.0
- @voyant-travel/utils@0.102.0

## 0.101.2

### Patch Changes

- 577eaf5: Republish finance and legal contract packages with the next release so exact internal package dependencies resolve from the public registry.
- Updated dependencies [577eaf5]
  - @voyant-travel/bookings@0.101.2
  - @voyant-travel/core@0.101.2
  - @voyant-travel/crm@0.101.2
  - @voyant-travel/db@0.101.2
  - @voyant-travel/finance@0.101.2
  - @voyant-travel/hono@0.101.2
  - @voyant-travel/legal-contracts@0.101.2
  - @voyant-travel/storage@0.101.2
  - @voyant-travel/suppliers@0.101.2
  - @voyant-travel/utils@0.101.2

## 0.101.1

### Patch Changes

- Updated dependencies [f736ba5]
  - @voyant-travel/bookings@0.101.1
  - @voyant-travel/core@0.101.1
  - @voyant-travel/crm@0.101.1
  - @voyant-travel/db@0.101.1
  - @voyant-travel/finance@0.101.1
  - @voyant-travel/hono@0.101.1
  - @voyant-travel/legal-contracts@0.101.1
  - @voyant-travel/storage@0.101.1
  - @voyant-travel/suppliers@0.101.1
  - @voyant-travel/utils@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/bookings@0.101.0
- @voyant-travel/core@0.101.0
- @voyant-travel/crm@0.101.0
- @voyant-travel/db@0.101.0
- @voyant-travel/finance@0.101.0
- @voyant-travel/hono@0.101.0
- @voyant-travel/legal-contracts@0.101.0
- @voyant-travel/storage@0.101.0
- @voyant-travel/suppliers@0.101.0
- @voyant-travel/utils@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/bookings@0.100.0
- @voyant-travel/core@0.100.0
- @voyant-travel/crm@0.100.0
- @voyant-travel/db@0.100.0
- @voyant-travel/finance@0.100.0
- @voyant-travel/hono@0.100.0
- @voyant-travel/legal-contracts@0.100.0
- @voyant-travel/storage@0.100.0
- @voyant-travel/suppliers@0.100.0
- @voyant-travel/utils@0.100.0

## 0.99.0

### Patch Changes

- Updated dependencies [b7dde79]
  - @voyant-travel/bookings@0.99.0
  - @voyant-travel/core@0.99.0
  - @voyant-travel/crm@0.99.0
  - @voyant-travel/db@0.99.0
  - @voyant-travel/finance@0.99.0
  - @voyant-travel/hono@0.99.0
  - @voyant-travel/legal-contracts@0.99.0
  - @voyant-travel/storage@0.99.0
  - @voyant-travel/suppliers@0.99.0
  - @voyant-travel/utils@0.99.0

## 0.98.0

### Patch Changes

- Updated dependencies [485da95]
  - @voyant-travel/bookings@0.98.0
  - @voyant-travel/core@0.98.0
  - @voyant-travel/crm@0.98.0
  - @voyant-travel/db@0.98.0
  - @voyant-travel/finance@0.98.0
  - @voyant-travel/hono@0.98.0
  - @voyant-travel/legal-contracts@0.98.0
  - @voyant-travel/storage@0.98.0
  - @voyant-travel/suppliers@0.98.0
  - @voyant-travel/utils@0.98.0

## 0.97.0

### Patch Changes

- Updated dependencies [7094c8e]
  - @voyant-travel/bookings@0.97.0
  - @voyant-travel/core@0.97.0
  - @voyant-travel/crm@0.97.0
  - @voyant-travel/db@0.97.0
  - @voyant-travel/finance@0.97.0
  - @voyant-travel/hono@0.97.0
  - @voyant-travel/legal-contracts@0.97.0
  - @voyant-travel/storage@0.97.0
  - @voyant-travel/suppliers@0.97.0
  - @voyant-travel/utils@0.97.0

## 0.96.0

### Patch Changes

- @voyant-travel/bookings@0.96.0
- @voyant-travel/core@0.96.0
- @voyant-travel/crm@0.96.0
- @voyant-travel/db@0.96.0
- @voyant-travel/finance@0.96.0
- @voyant-travel/hono@0.96.0
- @voyant-travel/storage@0.96.0
- @voyant-travel/suppliers@0.96.0
- @voyant-travel/utils@0.96.0

## 0.95.0

### Patch Changes

- @voyant-travel/bookings@0.95.0
- @voyant-travel/core@0.95.0
- @voyant-travel/crm@0.95.0
- @voyant-travel/db@0.95.0
- @voyant-travel/finance@0.95.0
- @voyant-travel/hono@0.95.0
- @voyant-travel/storage@0.95.0
- @voyant-travel/suppliers@0.95.0
- @voyant-travel/utils@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/bookings@0.94.0
- @voyant-travel/core@0.94.0
- @voyant-travel/crm@0.94.0
- @voyant-travel/db@0.94.0
- @voyant-travel/finance@0.94.0
- @voyant-travel/hono@0.94.0
- @voyant-travel/storage@0.94.0
- @voyant-travel/suppliers@0.94.0
- @voyant-travel/utils@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/bookings@0.93.0
- @voyant-travel/core@0.93.0
- @voyant-travel/crm@0.93.0
- @voyant-travel/db@0.93.0
- @voyant-travel/finance@0.93.0
- @voyant-travel/hono@0.93.0
- @voyant-travel/storage@0.93.0
- @voyant-travel/suppliers@0.93.0
- @voyant-travel/utils@0.93.0

## 0.92.0

### Patch Changes

- @voyant-travel/bookings@0.92.0
- @voyant-travel/core@0.92.0
- @voyant-travel/crm@0.92.0
- @voyant-travel/db@0.92.0
- @voyant-travel/finance@0.92.0
- @voyant-travel/hono@0.92.0
- @voyant-travel/storage@0.92.0
- @voyant-travel/suppliers@0.92.0
- @voyant-travel/utils@0.92.0

## 0.91.0

### Patch Changes

- Updated dependencies [dc8554b]
  - @voyant-travel/bookings@0.91.0
  - @voyant-travel/core@0.91.0
  - @voyant-travel/crm@0.91.0
  - @voyant-travel/db@0.91.0
  - @voyant-travel/finance@0.91.0
  - @voyant-travel/hono@0.91.0
  - @voyant-travel/storage@0.91.0
  - @voyant-travel/suppliers@0.91.0
  - @voyant-travel/utils@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/bookings@0.90.0
- @voyant-travel/core@0.90.0
- @voyant-travel/crm@0.90.0
- @voyant-travel/db@0.90.0
- @voyant-travel/finance@0.90.0
- @voyant-travel/hono@0.90.0
- @voyant-travel/storage@0.90.0
- @voyant-travel/suppliers@0.90.0
- @voyant-travel/utils@0.90.0

## 0.89.0

### Patch Changes

- Updated dependencies [ed45995]
  - @voyant-travel/bookings@0.89.0
  - @voyant-travel/core@0.89.0
  - @voyant-travel/crm@0.89.0
  - @voyant-travel/db@0.89.0
  - @voyant-travel/finance@0.89.0
  - @voyant-travel/hono@0.89.0
  - @voyant-travel/storage@0.89.0
  - @voyant-travel/suppliers@0.89.0
  - @voyant-travel/utils@0.89.0

## 0.88.0

### Patch Changes

- @voyant-travel/bookings@0.88.0
- @voyant-travel/core@0.88.0
- @voyant-travel/crm@0.88.0
- @voyant-travel/db@0.88.0
- @voyant-travel/finance@0.88.0
- @voyant-travel/hono@0.88.0
- @voyant-travel/storage@0.88.0
- @voyant-travel/suppliers@0.88.0
- @voyant-travel/utils@0.88.0

## 0.87.1

### Patch Changes

- Updated dependencies [5be088f]
  - @voyant-travel/bookings@0.87.1
  - @voyant-travel/core@0.87.1
  - @voyant-travel/crm@0.87.1
  - @voyant-travel/db@0.87.1
  - @voyant-travel/finance@0.87.1
  - @voyant-travel/hono@0.87.1
  - @voyant-travel/storage@0.87.1
  - @voyant-travel/suppliers@0.87.1
  - @voyant-travel/utils@0.87.1

## 0.87.0

### Patch Changes

- @voyant-travel/bookings@0.87.0
- @voyant-travel/core@0.87.0
- @voyant-travel/crm@0.87.0
- @voyant-travel/db@0.87.0
- @voyant-travel/finance@0.87.0
- @voyant-travel/hono@0.87.0
- @voyant-travel/storage@0.87.0
- @voyant-travel/suppliers@0.87.0
- @voyant-travel/utils@0.87.0

## 0.86.0

### Patch Changes

- @voyant-travel/bookings@0.86.0
- @voyant-travel/core@0.86.0
- @voyant-travel/crm@0.86.0
- @voyant-travel/db@0.86.0
- @voyant-travel/finance@0.86.0
- @voyant-travel/hono@0.86.0
- @voyant-travel/storage@0.86.0
- @voyant-travel/suppliers@0.86.0
- @voyant-travel/utils@0.86.0

## 0.85.4

### Patch Changes

- Updated dependencies [bed4a3f]
  - @voyant-travel/bookings@0.85.4
  - @voyant-travel/core@0.85.4
  - @voyant-travel/crm@0.85.4
  - @voyant-travel/db@0.85.4
  - @voyant-travel/finance@0.85.4
  - @voyant-travel/hono@0.85.4
  - @voyant-travel/storage@0.85.4
  - @voyant-travel/suppliers@0.85.4
  - @voyant-travel/utils@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/bookings@0.85.3
- @voyant-travel/core@0.85.3
- @voyant-travel/crm@0.85.3
- @voyant-travel/db@0.85.3
- @voyant-travel/finance@0.85.3
- @voyant-travel/hono@0.85.3
- @voyant-travel/storage@0.85.3
- @voyant-travel/suppliers@0.85.3
- @voyant-travel/utils@0.85.3

## 0.85.2

### Patch Changes

- Updated dependencies [2aac1f9]
  - @voyant-travel/bookings@0.85.2
  - @voyant-travel/core@0.85.2
  - @voyant-travel/crm@0.85.2
  - @voyant-travel/db@0.85.2
  - @voyant-travel/finance@0.85.2
  - @voyant-travel/hono@0.85.2
  - @voyant-travel/storage@0.85.2
  - @voyant-travel/suppliers@0.85.2
  - @voyant-travel/utils@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/bookings@0.85.1
- @voyant-travel/core@0.85.1
- @voyant-travel/crm@0.85.1
- @voyant-travel/db@0.85.1
- @voyant-travel/finance@0.85.1
- @voyant-travel/hono@0.85.1
- @voyant-travel/storage@0.85.1
- @voyant-travel/suppliers@0.85.1
- @voyant-travel/utils@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/bookings@0.85.0
- @voyant-travel/core@0.85.0
- @voyant-travel/crm@0.85.0
- @voyant-travel/db@0.85.0
- @voyant-travel/finance@0.85.0
- @voyant-travel/hono@0.85.0
- @voyant-travel/storage@0.85.0
- @voyant-travel/suppliers@0.85.0
- @voyant-travel/utils@0.85.0

## 0.84.4

### Patch Changes

- Updated dependencies [f3f8de1]
  - @voyant-travel/bookings@0.84.4
  - @voyant-travel/core@0.84.4
  - @voyant-travel/crm@0.84.4
  - @voyant-travel/db@0.84.4
  - @voyant-travel/finance@0.84.4
  - @voyant-travel/hono@0.84.4
  - @voyant-travel/storage@0.84.4
  - @voyant-travel/suppliers@0.84.4
  - @voyant-travel/utils@0.84.4

## 0.84.3

### Patch Changes

- Updated dependencies [9eadf50]
  - @voyant-travel/bookings@0.84.3
  - @voyant-travel/core@0.84.3
  - @voyant-travel/crm@0.84.3
  - @voyant-travel/db@0.84.3
  - @voyant-travel/finance@0.84.3
  - @voyant-travel/hono@0.84.3
  - @voyant-travel/storage@0.84.3
  - @voyant-travel/suppliers@0.84.3
  - @voyant-travel/utils@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/bookings@0.84.2
- @voyant-travel/core@0.84.2
- @voyant-travel/crm@0.84.2
- @voyant-travel/db@0.84.2
- @voyant-travel/finance@0.84.2
- @voyant-travel/hono@0.84.2
- @voyant-travel/storage@0.84.2
- @voyant-travel/suppliers@0.84.2
- @voyant-travel/utils@0.84.2

## 0.84.1

### Patch Changes

- Updated dependencies [b9ef614]
  - @voyant-travel/bookings@0.84.1
  - @voyant-travel/core@0.84.1
  - @voyant-travel/crm@0.84.1
  - @voyant-travel/db@0.84.1
  - @voyant-travel/finance@0.84.1
  - @voyant-travel/hono@0.84.1
  - @voyant-travel/storage@0.84.1
  - @voyant-travel/suppliers@0.84.1
  - @voyant-travel/utils@0.84.1

## 0.84.0

### Minor Changes

- 4ea42b3: Add tokenized public document delivery grants, a public document download route, and opt-in public download envelopes for generated finance and legal documents.

### Patch Changes

- Updated dependencies [4ea42b3]
  - @voyant-travel/bookings@0.84.0
  - @voyant-travel/core@0.84.0
  - @voyant-travel/crm@0.84.0
  - @voyant-travel/db@0.84.0
  - @voyant-travel/finance@0.84.0
  - @voyant-travel/hono@0.84.0
  - @voyant-travel/storage@0.84.0
  - @voyant-travel/suppliers@0.84.0
  - @voyant-travel/utils@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/bookings@0.83.1
- @voyant-travel/core@0.83.1
- @voyant-travel/crm@0.83.1
- @voyant-travel/db@0.83.1
- @voyant-travel/finance@0.83.1
- @voyant-travel/hono@0.83.1
- @voyant-travel/storage@0.83.1
- @voyant-travel/suppliers@0.83.1
- @voyant-travel/utils@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/bookings@0.83.0
- @voyant-travel/core@0.83.0
- @voyant-travel/crm@0.83.0
- @voyant-travel/db@0.83.0
- @voyant-travel/finance@0.83.0
- @voyant-travel/hono@0.83.0
- @voyant-travel/storage@0.83.0
- @voyant-travel/suppliers@0.83.0
- @voyant-travel/utils@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/bookings@0.82.1
- @voyant-travel/core@0.82.1
- @voyant-travel/crm@0.82.1
- @voyant-travel/db@0.82.1
- @voyant-travel/finance@0.82.1
- @voyant-travel/hono@0.82.1
- @voyant-travel/storage@0.82.1
- @voyant-travel/suppliers@0.82.1
- @voyant-travel/utils@0.82.1

## 0.82.0

### Patch Changes

- 577f909: Expose booking settlement variables for generated contracts from finance invoices and completed payments, including latest completed payment metadata for templates.
- Updated dependencies [79ce168]
  - @voyant-travel/bookings@0.82.0
  - @voyant-travel/core@0.82.0
  - @voyant-travel/crm@0.82.0
  - @voyant-travel/db@0.82.0
  - @voyant-travel/finance@0.82.0
  - @voyant-travel/hono@0.82.0
  - @voyant-travel/storage@0.82.0
  - @voyant-travel/suppliers@0.82.0
  - @voyant-travel/utils@0.82.0

## 0.81.21

### Patch Changes

- Updated dependencies [b9fb5b0]
  - @voyant-travel/bookings@0.81.21
  - @voyant-travel/core@0.81.21
  - @voyant-travel/crm@0.81.21
  - @voyant-travel/db@0.81.21
  - @voyant-travel/hono@0.81.21
  - @voyant-travel/storage@0.81.21
  - @voyant-travel/suppliers@0.81.21
  - @voyant-travel/utils@0.81.21

## 0.81.20

### Patch Changes

- Updated dependencies [e60a50d]
  - @voyant-travel/bookings@0.81.20
  - @voyant-travel/core@0.81.20
  - @voyant-travel/crm@0.81.20
  - @voyant-travel/db@0.81.20
  - @voyant-travel/hono@0.81.20
  - @voyant-travel/storage@0.81.20
  - @voyant-travel/suppliers@0.81.20
  - @voyant-travel/utils@0.81.20

## 0.81.19

### Patch Changes

- Updated dependencies [62e4be5]
  - @voyant-travel/bookings@0.81.19
  - @voyant-travel/core@0.81.19
  - @voyant-travel/crm@0.81.19
  - @voyant-travel/db@0.81.19
  - @voyant-travel/hono@0.81.19
  - @voyant-travel/storage@0.81.19
  - @voyant-travel/suppliers@0.81.19
  - @voyant-travel/utils@0.81.19

## 0.81.18

### Patch Changes

- 93874e4: Follow-ups to the booking-detail UX overhaul (#1332):

  - **Status change dialog (`@voyant-travel/bookings-ui`)**: surface the existing `suppressNotifications` API as a switch in `StatusChangeDialog`. The toggle only appears when the target status is `confirmed` (the only transition that honors the flag server-side per `status-dispatch.ts`) and routes the value through to `useBookingStatusMutation`. Lets operators confirm a booking silently — no confirmation email, no document bundle. EN/RO labels added.
  - **Booking documents tab (`templates/operator`)**: contracts table now has an "Open contract page" icon action linking to `/legal/contracts/$id`. EN/RO copy added under `bookings.detail.documentsTable.contractOpenTooltip`.
  - **Contract detail page (`@voyant-travel/legal-ui`)**: delete button now renders for `void` contracts too, not just drafts.
  - **Contract delete API (`@voyant-travel/legal`)**: `deleteContract` accepts `draft | void` (was draft-only). Returns `not_deletable` instead of `not_draft`; route error message updated to "Only draft or void contracts can be deleted".
  - **Contract auto-generation (issue #1335, `@voyant-travel/legal`)**: `issueContract` now allocates the series number **before** rendering and merges it into the render variables, so templates that print `{{ contract.number }}` / `{{ contract.contractNumber }}` resolve on the first issued PDF. The allocated number is also persisted back into `contract.variables` so regenerations stay consistent. Same merge applied in `ensureRenderedContract` for the deferred-render fallback path. New `mergeContractNumberIntoVariables` helper (exported) + 4 unit tests.
  - @voyant-travel/bookings@0.81.18
  - @voyant-travel/core@0.81.18
  - @voyant-travel/crm@0.81.18
  - @voyant-travel/db@0.81.18
  - @voyant-travel/hono@0.81.18
  - @voyant-travel/storage@0.81.18
  - @voyant-travel/suppliers@0.81.18
  - @voyant-travel/utils@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/bookings@0.81.17
- @voyant-travel/core@0.81.17
- @voyant-travel/crm@0.81.17
- @voyant-travel/db@0.81.17
- @voyant-travel/hono@0.81.17
- @voyant-travel/storage@0.81.17
- @voyant-travel/suppliers@0.81.17
- @voyant-travel/utils@0.81.17

## 0.81.16

### Patch Changes

- 0a617cc: Operator-dashboard booking-detail UX polish + finance refactors.

  **Booking list & detail**

  - Bookings index hides `draft` + `expired` by default; new `excludeStatuses` filter on the bookings list endpoint + react query keys.
  - Booking-detail subtitle now shows `Billing person / Product / Dates / PAX` with clickable links to the CRM person, product, and availability slot; product title truncates at 18rem with full-text tooltip.
  - Header action menu replaced by inline outline buttons (Edit / Change status / Cancel / Delete). Delete uses a proper `AlertDialog` instead of `window.confirm`.
  - Stat-card currency layout is now `<symbol> <amount> <code>` for every currency except RON (collapses to `<amount> RON`).
  - Items table dates use the active locale (`formatDateTime` from i18n provider) and show start → end when both timestamps exist.
  - Tabs reordered: Documents now precedes Suppliers.

  **Tab refactors (Items / Travelers / Payments / Invoices / Documents / Suppliers / Payment-schedule)**

  - All seven tabs migrated off `<Card>` + raw `<table>` onto the shared `<div data-slot>` + `DataTable` + `IconActionButton` + `StatusBadge` + `AlertDialog` pattern.
  - Snapshots opened in a `<Sheet>` so operators stay on the booking page.

  **Invoices tab**

  - New `BookingInvoiceDialog` (Dialog, not Sheet) for "New Invoice": Type segmented (Invoice / Proforma), Source segmented (Schedule / Custom), schedule-driven prefill that auto-derives net unit amount, tax%, due date; manual line items with add/remove; auto-derived Subtotal/Tax/Total (always read-only); SmartBill sync toggle (defaults on); Mark as paid switch with method + date pickers; attachment uploader when sync is off; sandboxed iframe contract preview.
  - Generate-from-schedule line items now back the tax out of the gross schedule amount (no more 21% inflation on top).
  - Server omits `subtotalCents/taxCents/totalCents` cross-check when client doesn't pre-compute totals.

  **Add-contract dialog (new)**

  - `BookingContractDialog` replaces the per-row "Generate contract" button. Two modes — Generate (default, preselected) renders an iframe preview via a new `?preview=true` branch on `/v1/admin/bookings/:id/generate-contract`, and Upload (title + PDF) creates a `signed`-status contract row + attaches the file.
  - Legal `autoGenerateContractForBooking` gains a `previewMode` option that stops after rendering HTML without persisting.

  **Payment schedule**

  - Switched `PaymentScheduleValue` from fixed slots to a `installments: PaymentInstallment[]` array. Mode-switch prefills due dates between today and **one day before departure** (clamps to today when lead time ≤ 1 day) and distributes amounts evenly. Add/remove redistributes amounts so the rows always sum to the booking total.
  - New Invoice column on the schedule table links to the invoice/proforma covering each row.
  - Generate-invoice / Generate-proforma actions hide when an invoice (or proforma) already covers the row, preventing accidental duplicate documents.
  - Server-side `assertBookingPaymentScheduleHasPaymentCoverage` no longer requires session-linked payments — it sums every completed payment under the booking's invoices (with FX-equivalent amounts via `baseAmountCents`) and subtracts other schedules already paid, so manually-recorded payments can mark a schedule paid.
  - Schedule edit dialog now surfaces server validation errors inline instead of swallowing them.

  **Record payment dialog**

  - "Convert proforma to invoice" switch shown when the selected invoice is a proforma + status is Completed. Default off; auto-flips on only when the entered amount (directly or via FX) covers the invoice's remaining balance. Heuristic freezes once the operator toggles. Conversion fires post-create so a failure surfaces without rolling back the payment.
  - `useInvoicePaymentMutation` now invalidates the booking-scoped payment lists (`admin-booking-payments`) so the table refreshes after recording.

  **Proforma → invoice linkage**

  - `getInvoiceById` returns `convertedToInvoiceId` + `convertedToInvoiceNumber` (the inverse of `convertedFromInvoiceId`). The invoice sheet shows a green "Invoiced" / "Facturat" status with a deep link to the final invoice when a void proforma was converted. Converted proformas are filtered out of the invoices table on the booking detail page.

  **New booking dialog**

  - The three document-related checkboxes (Generate contract / Generate invoice / Create as draft) collapse into two mutually-exclusive options: "Generate proforma" and "Generate invoice and contract". `invoiceType` plumbs through the catalog booking-engine contract, products handler, finance service, and react hook.

  **Misc**

  - SmartBill plugin honors a new `skipExternalSync` flag on `invoice.issued` / `invoice.proforma.issued` so per-invoice opt-out from external sync is possible.
  - SmartBill rate-limit date parser now anchors `24/05/2026 09:32:48`-style timestamps to UTC instead of the JS host's local time. The instant decoded from the same response is now identical on CI (UTC) and on developer machines in non-UTC zones (e.g. Europe/Bucharest, EEST). Fixes a pre-existing test failure when running locally outside UTC.
  - Bookings list excludeStatuses filter (string-or-array) parsed by `bookingListQuerySchema`.
  - `BookingPaymentsSummary` adds an FX equivalent column with `baseCurrency` + `baseAmountCents` plumbed through `publicFinanceBookingPaymentSchema` and the operator `useAdminBookingPayments` projection.
  - Currency combobox now correctly disables (forwards `disabled` to the inner input and hides the clear button when disabled).
  - New shared primitives in `@voyant-travel/bookings-ui`: `IconActionButton` (icon button with built-in tooltip) and `StatusBadge` (semantic tone mapping for status strings) — exported from the package root.

- Updated dependencies [0a617cc]
  - @voyant-travel/bookings@0.81.16
  - @voyant-travel/core@0.81.16
  - @voyant-travel/crm@0.81.16
  - @voyant-travel/db@0.81.16
  - @voyant-travel/hono@0.81.16
  - @voyant-travel/storage@0.81.16
  - @voyant-travel/suppliers@0.81.16
  - @voyant-travel/utils@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/bookings@0.81.15
- @voyant-travel/core@0.81.15
- @voyant-travel/crm@0.81.15
- @voyant-travel/db@0.81.15
- @voyant-travel/hono@0.81.15
- @voyant-travel/storage@0.81.15
- @voyant-travel/suppliers@0.81.15
- @voyant-travel/utils@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/bookings@0.81.14
- @voyant-travel/core@0.81.14
- @voyant-travel/crm@0.81.14
- @voyant-travel/db@0.81.14
- @voyant-travel/hono@0.81.14
- @voyant-travel/storage@0.81.14
- @voyant-travel/suppliers@0.81.14
- @voyant-travel/utils@0.81.14

## 0.81.13

### Patch Changes

- 36421aa: Persist contract document generation failure details on contract metadata and surface operator-facing failure labels.
- Updated dependencies [28dca55]
  - @voyant-travel/bookings@0.81.13
  - @voyant-travel/core@0.81.13
  - @voyant-travel/crm@0.81.13
  - @voyant-travel/db@0.81.13
  - @voyant-travel/hono@0.81.13
  - @voyant-travel/storage@0.81.13
  - @voyant-travel/suppliers@0.81.13
  - @voyant-travel/utils@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/bookings@0.81.12
- @voyant-travel/core@0.81.12
- @voyant-travel/crm@0.81.12
- @voyant-travel/db@0.81.12
- @voyant-travel/hono@0.81.12
- @voyant-travel/storage@0.81.12
- @voyant-travel/suppliers@0.81.12
- @voyant-travel/utils@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/bookings@0.81.11
- @voyant-travel/core@0.81.11
- @voyant-travel/crm@0.81.11
- @voyant-travel/db@0.81.11
- @voyant-travel/hono@0.81.11
- @voyant-travel/storage@0.81.11
- @voyant-travel/suppliers@0.81.11
- @voyant-travel/utils@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/bookings@0.81.10
- @voyant-travel/core@0.81.10
- @voyant-travel/crm@0.81.10
- @voyant-travel/db@0.81.10
- @voyant-travel/hono@0.81.10
- @voyant-travel/storage@0.81.10
- @voyant-travel/suppliers@0.81.10
- @voyant-travel/utils@0.81.10

## 0.81.9

### Patch Changes

- 1a58939: Preserve billing contact address line 2 on booking snapshots and downstream documents.
- Updated dependencies [1a58939]
  - @voyant-travel/bookings@0.81.9
  - @voyant-travel/core@0.81.9
  - @voyant-travel/crm@0.81.9
  - @voyant-travel/db@0.81.9
  - @voyant-travel/hono@0.81.9
  - @voyant-travel/storage@0.81.9
  - @voyant-travel/suppliers@0.81.9
  - @voyant-travel/utils@0.81.9

## 0.81.8

### Patch Changes

- Updated dependencies [688ac4f]
  - @voyant-travel/bookings@0.81.8
  - @voyant-travel/core@0.81.8
  - @voyant-travel/crm@0.81.8
  - @voyant-travel/db@0.81.8
  - @voyant-travel/hono@0.81.8
  - @voyant-travel/storage@0.81.8
  - @voyant-travel/suppliers@0.81.8
  - @voyant-travel/utils@0.81.8

## 0.81.7

### Patch Changes

- Updated dependencies [410cd17]
  - @voyant-travel/bookings@0.81.7
  - @voyant-travel/core@0.81.7
  - @voyant-travel/crm@0.81.7
  - @voyant-travel/db@0.81.7
  - @voyant-travel/hono@0.81.7
  - @voyant-travel/storage@0.81.7
  - @voyant-travel/suppliers@0.81.7
  - @voyant-travel/utils@0.81.7

## 0.81.6

### Patch Changes

- Updated dependencies [f92c593]
  - @voyant-travel/bookings@0.81.6
  - @voyant-travel/core@0.81.6
  - @voyant-travel/crm@0.81.6
  - @voyant-travel/db@0.81.6
  - @voyant-travel/hono@0.81.6
  - @voyant-travel/storage@0.81.6
  - @voyant-travel/suppliers@0.81.6
  - @voyant-travel/utils@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/bookings@0.81.5
- @voyant-travel/core@0.81.5
- @voyant-travel/crm@0.81.5
- @voyant-travel/db@0.81.5
- @voyant-travel/hono@0.81.5
- @voyant-travel/storage@0.81.5
- @voyant-travel/suppliers@0.81.5
- @voyant-travel/utils@0.81.5

## 0.81.4

### Patch Changes

- Updated dependencies [6daefc4]
  - @voyant-travel/bookings@0.81.4
  - @voyant-travel/core@0.81.4
  - @voyant-travel/crm@0.81.4
  - @voyant-travel/db@0.81.4
  - @voyant-travel/hono@0.81.4
  - @voyant-travel/storage@0.81.4
  - @voyant-travel/suppliers@0.81.4
  - @voyant-travel/utils@0.81.4

## 0.81.3

### Patch Changes

- Updated dependencies [f157bcd]
  - @voyant-travel/bookings@0.81.3
  - @voyant-travel/core@0.81.3
  - @voyant-travel/crm@0.81.3
  - @voyant-travel/db@0.81.3
  - @voyant-travel/hono@0.81.3
  - @voyant-travel/storage@0.81.3
  - @voyant-travel/suppliers@0.81.3
  - @voyant-travel/utils@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/bookings@0.81.2
- @voyant-travel/core@0.81.2
- @voyant-travel/crm@0.81.2
- @voyant-travel/db@0.81.2
- @voyant-travel/hono@0.81.2
- @voyant-travel/storage@0.81.2
- @voyant-travel/suppliers@0.81.2
- @voyant-travel/utils@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/bookings@0.81.1
- @voyant-travel/core@0.81.1
- @voyant-travel/crm@0.81.1
- @voyant-travel/db@0.81.1
- @voyant-travel/hono@0.81.1
- @voyant-travel/storage@0.81.1
- @voyant-travel/suppliers@0.81.1
- @voyant-travel/utils@0.81.1

## 0.81.0

### Patch Changes

- Updated dependencies [f35e63c]
  - @voyant-travel/bookings@0.81.0
  - @voyant-travel/core@0.81.0
  - @voyant-travel/crm@0.81.0
  - @voyant-travel/db@0.81.0
  - @voyant-travel/hono@0.81.0
  - @voyant-travel/storage@0.81.0
  - @voyant-travel/suppliers@0.81.0
  - @voyant-travel/utils@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/bookings@0.80.18
- @voyant-travel/core@0.80.18
- @voyant-travel/crm@0.80.18
- @voyant-travel/db@0.80.18
- @voyant-travel/hono@0.80.18
- @voyant-travel/storage@0.80.18
- @voyant-travel/suppliers@0.80.18
- @voyant-travel/utils@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/bookings@0.80.17
- @voyant-travel/core@0.80.17
- @voyant-travel/crm@0.80.17
- @voyant-travel/db@0.80.17
- @voyant-travel/hono@0.80.17
- @voyant-travel/storage@0.80.17
- @voyant-travel/suppliers@0.80.17
- @voyant-travel/utils@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/bookings@0.80.16
- @voyant-travel/core@0.80.16
- @voyant-travel/crm@0.80.16
- @voyant-travel/db@0.80.16
- @voyant-travel/hono@0.80.16
- @voyant-travel/storage@0.80.16
- @voyant-travel/suppliers@0.80.16
- @voyant-travel/utils@0.80.16

## 0.80.15

### Patch Changes

- Updated dependencies [0d8d14e]
  - @voyant-travel/bookings@0.80.15
  - @voyant-travel/core@0.80.15
  - @voyant-travel/crm@0.80.15
  - @voyant-travel/db@0.80.15
  - @voyant-travel/hono@0.80.15
  - @voyant-travel/storage@0.80.15
  - @voyant-travel/suppliers@0.80.15
  - @voyant-travel/utils@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/bookings@0.80.14
- @voyant-travel/core@0.80.14
- @voyant-travel/crm@0.80.14
- @voyant-travel/db@0.80.14
- @voyant-travel/hono@0.80.14
- @voyant-travel/storage@0.80.14
- @voyant-travel/suppliers@0.80.14
- @voyant-travel/utils@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/bookings@0.80.13
- @voyant-travel/core@0.80.13
- @voyant-travel/crm@0.80.13
- @voyant-travel/db@0.80.13
- @voyant-travel/hono@0.80.13
- @voyant-travel/storage@0.80.13
- @voyant-travel/suppliers@0.80.13
- @voyant-travel/utils@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/bookings@0.80.12
- @voyant-travel/core@0.80.12
- @voyant-travel/crm@0.80.12
- @voyant-travel/db@0.80.12
- @voyant-travel/hono@0.80.12
- @voyant-travel/storage@0.80.12
- @voyant-travel/suppliers@0.80.12
- @voyant-travel/utils@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/bookings@0.80.11
- @voyant-travel/core@0.80.11
- @voyant-travel/crm@0.80.11
- @voyant-travel/db@0.80.11
- @voyant-travel/hono@0.80.11
- @voyant-travel/storage@0.80.11
- @voyant-travel/suppliers@0.80.11
- @voyant-travel/utils@0.80.11

## 0.80.10

### Patch Changes

- 97cae5e: Add default-aware contract number series selection for booking contract auto-generation.
  - @voyant-travel/bookings@0.80.10
  - @voyant-travel/core@0.80.10
  - @voyant-travel/crm@0.80.10
  - @voyant-travel/db@0.80.10
  - @voyant-travel/hono@0.80.10
  - @voyant-travel/storage@0.80.10
  - @voyant-travel/suppliers@0.80.10
  - @voyant-travel/utils@0.80.10

## 0.80.9

### Patch Changes

- Updated dependencies [37aa8b6]
  - @voyant-travel/bookings@0.80.9
  - @voyant-travel/core@0.80.9
  - @voyant-travel/crm@0.80.9
  - @voyant-travel/db@0.80.9
  - @voyant-travel/hono@0.80.9
  - @voyant-travel/storage@0.80.9
  - @voyant-travel/suppliers@0.80.9
  - @voyant-travel/utils@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/bookings@0.80.8
- @voyant-travel/core@0.80.8
- @voyant-travel/crm@0.80.8
- @voyant-travel/db@0.80.8
- @voyant-travel/hono@0.80.8
- @voyant-travel/storage@0.80.8
- @voyant-travel/suppliers@0.80.8
- @voyant-travel/utils@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/bookings@0.80.7
- @voyant-travel/core@0.80.7
- @voyant-travel/crm@0.80.7
- @voyant-travel/db@0.80.7
- @voyant-travel/hono@0.80.7
- @voyant-travel/storage@0.80.7
- @voyant-travel/suppliers@0.80.7
- @voyant-travel/utils@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/bookings@0.80.6
- @voyant-travel/core@0.80.6
- @voyant-travel/crm@0.80.6
- @voyant-travel/db@0.80.6
- @voyant-travel/hono@0.80.6
- @voyant-travel/storage@0.80.6
- @voyant-travel/suppliers@0.80.6
- @voyant-travel/utils@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/bookings@0.80.5
- @voyant-travel/core@0.80.5
- @voyant-travel/crm@0.80.5
- @voyant-travel/db@0.80.5
- @voyant-travel/hono@0.80.5
- @voyant-travel/storage@0.80.5
- @voyant-travel/suppliers@0.80.5
- @voyant-travel/utils@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/bookings@0.80.4
- @voyant-travel/core@0.80.4
- @voyant-travel/crm@0.80.4
- @voyant-travel/db@0.80.4
- @voyant-travel/hono@0.80.4
- @voyant-travel/storage@0.80.4
- @voyant-travel/suppliers@0.80.4
- @voyant-travel/utils@0.80.4

## 0.80.3

### Patch Changes

- 6d816bb: Add `Idempotency-Key` replay support to admin create routes for CRM people and organizations, finance invoices, and legal contracts.
- Updated dependencies [6d816bb]
  - @voyant-travel/bookings@0.80.3
  - @voyant-travel/core@0.80.3
  - @voyant-travel/crm@0.80.3
  - @voyant-travel/db@0.80.3
  - @voyant-travel/hono@0.80.3
  - @voyant-travel/storage@0.80.3
  - @voyant-travel/suppliers@0.80.3
  - @voyant-travel/utils@0.80.3

## 0.80.2

### Patch Changes

- Updated dependencies [7a94871]
- Updated dependencies [9d6be13]
  - @voyant-travel/bookings@0.80.2
  - @voyant-travel/core@0.80.2
  - @voyant-travel/crm@0.80.2
  - @voyant-travel/db@0.80.2
  - @voyant-travel/hono@0.80.2
  - @voyant-travel/storage@0.80.2
  - @voyant-travel/suppliers@0.80.2
  - @voyant-travel/utils@0.80.2

## 0.80.1

### Patch Changes

- 9a71c89: Treat empty strings for optional legal contract fields as omitted during create/update validation.
  - @voyant-travel/bookings@0.80.1
  - @voyant-travel/core@0.80.1
  - @voyant-travel/crm@0.80.1
  - @voyant-travel/db@0.80.1
  - @voyant-travel/hono@0.80.1
  - @voyant-travel/storage@0.80.1
  - @voyant-travel/suppliers@0.80.1
  - @voyant-travel/utils@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/bookings@0.80.0
- @voyant-travel/core@0.80.0
- @voyant-travel/crm@0.80.0
- @voyant-travel/db@0.80.0
- @voyant-travel/hono@0.80.0
- @voyant-travel/storage@0.80.0
- @voyant-travel/suppliers@0.80.0
- @voyant-travel/utils@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/bookings@0.79.0
- @voyant-travel/core@0.79.0
- @voyant-travel/crm@0.79.0
- @voyant-travel/db@0.79.0
- @voyant-travel/hono@0.79.0
- @voyant-travel/storage@0.79.0
- @voyant-travel/suppliers@0.79.0
- @voyant-travel/utils@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/bookings@0.78.0
- @voyant-travel/core@0.78.0
- @voyant-travel/crm@0.78.0
- @voyant-travel/db@0.78.0
- @voyant-travel/hono@0.78.0
- @voyant-travel/storage@0.78.0
- @voyant-travel/suppliers@0.78.0
- @voyant-travel/utils@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/bookings@0.77.13
- @voyant-travel/core@0.77.13
- @voyant-travel/crm@0.77.13
- @voyant-travel/db@0.77.13
- @voyant-travel/hono@0.77.13
- @voyant-travel/storage@0.77.13
- @voyant-travel/suppliers@0.77.13
- @voyant-travel/utils@0.77.13

## 0.77.12

### Patch Changes

- @voyant-travel/bookings@0.77.12
- @voyant-travel/core@0.77.12
- @voyant-travel/crm@0.77.12
- @voyant-travel/db@0.77.12
- @voyant-travel/hono@0.77.12
- @voyant-travel/storage@0.77.12
- @voyant-travel/suppliers@0.77.12
- @voyant-travel/utils@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/bookings@0.77.11
- @voyant-travel/core@0.77.11
- @voyant-travel/crm@0.77.11
- @voyant-travel/db@0.77.11
- @voyant-travel/hono@0.77.11
- @voyant-travel/storage@0.77.11
- @voyant-travel/suppliers@0.77.11
- @voyant-travel/utils@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/bookings@0.77.10
- @voyant-travel/core@0.77.10
- @voyant-travel/crm@0.77.10
- @voyant-travel/db@0.77.10
- @voyant-travel/hono@0.77.10
- @voyant-travel/storage@0.77.10
- @voyant-travel/suppliers@0.77.10
- @voyant-travel/utils@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/bookings@0.77.9
- @voyant-travel/core@0.77.9
- @voyant-travel/crm@0.77.9
- @voyant-travel/db@0.77.9
- @voyant-travel/hono@0.77.9
- @voyant-travel/storage@0.77.9
- @voyant-travel/suppliers@0.77.9
- @voyant-travel/utils@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/bookings@0.77.8
- @voyant-travel/core@0.77.8
- @voyant-travel/crm@0.77.8
- @voyant-travel/db@0.77.8
- @voyant-travel/hono@0.77.8
- @voyant-travel/storage@0.77.8
- @voyant-travel/suppliers@0.77.8
- @voyant-travel/utils@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/bookings@0.77.7
- @voyant-travel/core@0.77.7
- @voyant-travel/crm@0.77.7
- @voyant-travel/db@0.77.7
- @voyant-travel/hono@0.77.7
- @voyant-travel/storage@0.77.7
- @voyant-travel/suppliers@0.77.7
- @voyant-travel/utils@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/bookings@0.77.6
- @voyant-travel/core@0.77.6
- @voyant-travel/crm@0.77.6
- @voyant-travel/db@0.77.6
- @voyant-travel/hono@0.77.6
- @voyant-travel/storage@0.77.6
- @voyant-travel/suppliers@0.77.6
- @voyant-travel/utils@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/bookings@0.77.5
- @voyant-travel/core@0.77.5
- @voyant-travel/crm@0.77.5
- @voyant-travel/db@0.77.5
- @voyant-travel/hono@0.77.5
- @voyant-travel/storage@0.77.5
- @voyant-travel/suppliers@0.77.5
- @voyant-travel/utils@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/bookings@0.77.4
- @voyant-travel/core@0.77.4
- @voyant-travel/crm@0.77.4
- @voyant-travel/db@0.77.4
- @voyant-travel/hono@0.77.4
- @voyant-travel/storage@0.77.4
- @voyant-travel/suppliers@0.77.4
- @voyant-travel/utils@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/bookings@0.77.3
- @voyant-travel/core@0.77.3
- @voyant-travel/crm@0.77.3
- @voyant-travel/db@0.77.3
- @voyant-travel/hono@0.77.3
- @voyant-travel/storage@0.77.3
- @voyant-travel/suppliers@0.77.3
- @voyant-travel/utils@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/bookings@0.77.2
- @voyant-travel/core@0.77.2
- @voyant-travel/crm@0.77.2
- @voyant-travel/db@0.77.2
- @voyant-travel/hono@0.77.2
- @voyant-travel/storage@0.77.2
- @voyant-travel/suppliers@0.77.2
- @voyant-travel/utils@0.77.2

## 0.77.1

### Patch Changes

- Updated dependencies [574684d]
  - @voyant-travel/bookings@0.77.1
  - @voyant-travel/core@0.77.1
  - @voyant-travel/crm@0.77.1
  - @voyant-travel/db@0.77.1
  - @voyant-travel/hono@0.77.1
  - @voyant-travel/storage@0.77.1
  - @voyant-travel/suppliers@0.77.1
  - @voyant-travel/utils@0.77.1

## 0.77.0

### Minor Changes

- 1da934d: Share stored-document download envelope resolution and include signed download envelopes with filenames in finance and legal document-generation responses.

### Patch Changes

- Updated dependencies [1da934d]
  - @voyant-travel/bookings@0.77.0
  - @voyant-travel/core@0.77.0
  - @voyant-travel/crm@0.77.0
  - @voyant-travel/db@0.77.0
  - @voyant-travel/hono@0.77.0
  - @voyant-travel/storage@0.77.0
  - @voyant-travel/suppliers@0.77.0
  - @voyant-travel/utils@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/bookings@0.76.0
- @voyant-travel/core@0.76.0
- @voyant-travel/crm@0.76.0
- @voyant-travel/db@0.76.0
- @voyant-travel/hono@0.76.0
- @voyant-travel/storage@0.76.0
- @voyant-travel/suppliers@0.76.0
- @voyant-travel/utils@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/bookings@0.75.7
- @voyant-travel/core@0.75.7
- @voyant-travel/crm@0.75.7
- @voyant-travel/db@0.75.7
- @voyant-travel/hono@0.75.7
- @voyant-travel/storage@0.75.7
- @voyant-travel/suppliers@0.75.7
- @voyant-travel/utils@0.75.7

## 0.75.6

### Patch Changes

- Updated dependencies [347fbd2]
  - @voyant-travel/bookings@0.75.6
  - @voyant-travel/core@0.75.6
  - @voyant-travel/crm@0.75.6
  - @voyant-travel/db@0.75.6
  - @voyant-travel/hono@0.75.6
  - @voyant-travel/storage@0.75.6
  - @voyant-travel/suppliers@0.75.6
  - @voyant-travel/utils@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/bookings@0.75.5
- @voyant-travel/core@0.75.5
- @voyant-travel/crm@0.75.5
- @voyant-travel/db@0.75.5
- @voyant-travel/hono@0.75.5
- @voyant-travel/storage@0.75.5
- @voyant-travel/suppliers@0.75.5
- @voyant-travel/utils@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/bookings@0.75.4
- @voyant-travel/core@0.75.4
- @voyant-travel/crm@0.75.4
- @voyant-travel/db@0.75.4
- @voyant-travel/hono@0.75.4
- @voyant-travel/storage@0.75.4
- @voyant-travel/suppliers@0.75.4
- @voyant-travel/utils@0.75.4

## 0.75.3

### Patch Changes

- 38167cd: Allow manually numbered legal contracts and update operator contract dialog copy for template-free uploads.
  - @voyant-travel/bookings@0.75.3
  - @voyant-travel/core@0.75.3
  - @voyant-travel/crm@0.75.3
  - @voyant-travel/db@0.75.3
  - @voyant-travel/hono@0.75.3
  - @voyant-travel/storage@0.75.3
  - @voyant-travel/suppliers@0.75.3
  - @voyant-travel/utils@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/bookings@0.75.2
- @voyant-travel/core@0.75.2
- @voyant-travel/crm@0.75.2
- @voyant-travel/db@0.75.2
- @voyant-travel/hono@0.75.2
- @voyant-travel/storage@0.75.2
- @voyant-travel/suppliers@0.75.2
- @voyant-travel/utils@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/bookings@0.75.1
- @voyant-travel/core@0.75.1
- @voyant-travel/crm@0.75.1
- @voyant-travel/db@0.75.1
- @voyant-travel/hono@0.75.1
- @voyant-travel/storage@0.75.1
- @voyant-travel/suppliers@0.75.1
- @voyant-travel/utils@0.75.1

## 0.75.0

### Patch Changes

- Updated dependencies [1eab599]
  - @voyant-travel/bookings@0.75.0
  - @voyant-travel/core@0.75.0
  - @voyant-travel/crm@0.75.0
  - @voyant-travel/db@0.75.0
  - @voyant-travel/hono@0.75.0
  - @voyant-travel/storage@0.75.0
  - @voyant-travel/suppliers@0.75.0
  - @voyant-travel/utils@0.75.0

## 0.74.2

### Patch Changes

- Updated dependencies [37c08cd]
  - @voyant-travel/bookings@0.74.2
  - @voyant-travel/core@0.74.2
  - @voyant-travel/crm@0.74.2
  - @voyant-travel/db@0.74.2
  - @voyant-travel/hono@0.74.2
  - @voyant-travel/storage@0.74.2
  - @voyant-travel/suppliers@0.74.2
  - @voyant-travel/utils@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/bookings@0.74.1
- @voyant-travel/core@0.74.1
- @voyant-travel/crm@0.74.1
- @voyant-travel/db@0.74.1
- @voyant-travel/hono@0.74.1
- @voyant-travel/storage@0.74.1
- @voyant-travel/suppliers@0.74.1
- @voyant-travel/utils@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/bookings@0.74.0
- @voyant-travel/core@0.74.0
- @voyant-travel/crm@0.74.0
- @voyant-travel/db@0.74.0
- @voyant-travel/hono@0.74.0
- @voyant-travel/storage@0.74.0
- @voyant-travel/suppliers@0.74.0
- @voyant-travel/utils@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/bookings@0.73.1
- @voyant-travel/core@0.73.1
- @voyant-travel/crm@0.73.1
- @voyant-travel/db@0.73.1
- @voyant-travel/hono@0.73.1
- @voyant-travel/storage@0.73.1
- @voyant-travel/suppliers@0.73.1
- @voyant-travel/utils@0.73.1

## 0.73.0

### Minor Changes

- 856da86: Add a package-level booking contract generation endpoint and wire the booking contract card to generate from the default template and active number series.

### Patch Changes

- @voyant-travel/bookings@0.73.0
- @voyant-travel/core@0.73.0
- @voyant-travel/crm@0.73.0
- @voyant-travel/db@0.73.0
- @voyant-travel/hono@0.73.0
- @voyant-travel/storage@0.73.0
- @voyant-travel/suppliers@0.73.0
- @voyant-travel/utils@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/bookings@0.72.0
- @voyant-travel/core@0.72.0
- @voyant-travel/crm@0.72.0
- @voyant-travel/db@0.72.0
- @voyant-travel/hono@0.72.0
- @voyant-travel/storage@0.72.0
- @voyant-travel/suppliers@0.72.0
- @voyant-travel/utils@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/bookings@0.71.0
- @voyant-travel/core@0.71.0
- @voyant-travel/crm@0.71.0
- @voyant-travel/db@0.71.0
- @voyant-travel/hono@0.71.0
- @voyant-travel/storage@0.71.0
- @voyant-travel/suppliers@0.71.0
- @voyant-travel/utils@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/bookings@0.70.0
- @voyant-travel/core@0.70.0
- @voyant-travel/crm@0.70.0
- @voyant-travel/db@0.70.0
- @voyant-travel/hono@0.70.0
- @voyant-travel/storage@0.70.0
- @voyant-travel/suppliers@0.70.0
- @voyant-travel/utils@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/bookings@0.69.1
- @voyant-travel/core@0.69.1
- @voyant-travel/crm@0.69.1
- @voyant-travel/db@0.69.1
- @voyant-travel/hono@0.69.1
- @voyant-travel/storage@0.69.1
- @voyant-travel/suppliers@0.69.1
- @voyant-travel/utils@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/bookings@0.69.0
- @voyant-travel/core@0.69.0
- @voyant-travel/crm@0.69.0
- @voyant-travel/db@0.69.0
- @voyant-travel/hono@0.69.0
- @voyant-travel/storage@0.69.0
- @voyant-travel/suppliers@0.69.0
- @voyant-travel/utils@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/bookings@0.68.0
- @voyant-travel/core@0.68.0
- @voyant-travel/crm@0.68.0
- @voyant-travel/db@0.68.0
- @voyant-travel/hono@0.68.0
- @voyant-travel/storage@0.68.0
- @voyant-travel/suppliers@0.68.0
- @voyant-travel/utils@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/bookings@0.67.0
- @voyant-travel/core@0.67.0
- @voyant-travel/crm@0.67.0
- @voyant-travel/db@0.67.0
- @voyant-travel/hono@0.67.0
- @voyant-travel/storage@0.67.0
- @voyant-travel/suppliers@0.67.0
- @voyant-travel/utils@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/bookings@0.66.6
- @voyant-travel/core@0.66.6
- @voyant-travel/crm@0.66.6
- @voyant-travel/db@0.66.6
- @voyant-travel/hono@0.66.6
- @voyant-travel/storage@0.66.6
- @voyant-travel/suppliers@0.66.6
- @voyant-travel/utils@0.66.6

## 0.66.5

### Patch Changes

- Updated dependencies [ee36ef5]
  - @voyant-travel/bookings@0.66.5
  - @voyant-travel/core@0.66.5
  - @voyant-travel/crm@0.66.5
  - @voyant-travel/db@0.66.5
  - @voyant-travel/hono@0.66.5
  - @voyant-travel/storage@0.66.5
  - @voyant-travel/suppliers@0.66.5
  - @voyant-travel/utils@0.66.5

## 0.66.4

### Patch Changes

- Updated dependencies [83ff2de]
  - @voyant-travel/bookings@0.66.4
  - @voyant-travel/core@0.66.4
  - @voyant-travel/crm@0.66.4
  - @voyant-travel/db@0.66.4
  - @voyant-travel/hono@0.66.4
  - @voyant-travel/storage@0.66.4
  - @voyant-travel/suppliers@0.66.4
  - @voyant-travel/utils@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/bookings@0.66.3
- @voyant-travel/core@0.66.3
- @voyant-travel/crm@0.66.3
- @voyant-travel/db@0.66.3
- @voyant-travel/hono@0.66.3
- @voyant-travel/storage@0.66.3
- @voyant-travel/suppliers@0.66.3
- @voyant-travel/utils@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/bookings@0.66.2
- @voyant-travel/core@0.66.2
- @voyant-travel/crm@0.66.2
- @voyant-travel/db@0.66.2
- @voyant-travel/hono@0.66.2
- @voyant-travel/storage@0.66.2
- @voyant-travel/suppliers@0.66.2
- @voyant-travel/utils@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/bookings@0.66.1
- @voyant-travel/core@0.66.1
- @voyant-travel/crm@0.66.1
- @voyant-travel/db@0.66.1
- @voyant-travel/hono@0.66.1
- @voyant-travel/storage@0.66.1
- @voyant-travel/suppliers@0.66.1
- @voyant-travel/utils@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/bookings@0.66.0
- @voyant-travel/core@0.66.0
- @voyant-travel/crm@0.66.0
- @voyant-travel/db@0.66.0
- @voyant-travel/hono@0.66.0
- @voyant-travel/storage@0.66.0
- @voyant-travel/suppliers@0.66.0
- @voyant-travel/utils@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/bookings@0.65.0
- @voyant-travel/core@0.65.0
- @voyant-travel/crm@0.65.0
- @voyant-travel/db@0.65.0
- @voyant-travel/hono@0.65.0
- @voyant-travel/storage@0.65.0
- @voyant-travel/suppliers@0.65.0
- @voyant-travel/utils@0.65.0

## 0.64.1

### Patch Changes

- @voyant-travel/bookings@0.64.1
- @voyant-travel/core@0.64.1
- @voyant-travel/crm@0.64.1
- @voyant-travel/db@0.64.1
- @voyant-travel/hono@0.64.1
- @voyant-travel/storage@0.64.1
- @voyant-travel/suppliers@0.64.1
- @voyant-travel/utils@0.64.1

## 0.64.0

### Patch Changes

- 6d0c8f3: Extract `withOptionalTransaction` into `@voyant-travel/db/transaction` so the soft-fallback helper that action-ledger has used since 0.62.0 can be shared by any package that needs it. Add `Module.requiresTransactionalDb` so modules whose write paths use interactive transactions declare it, and have `createApp()` assert on first request that the resolved db adapter supports `db.transaction(async (tx) => …)`. With the neon-http (edge) adapter that assertion now throws an actionable error pointing at `createServerlessDbClient` (neon-serverless / WebSocket) or `createDbClient(url, { adapter: "node" })` — instead of the cryptic "No transactions support in neon-http driver" exception thrown on first write.
- Updated dependencies [6d0c8f3]
  - @voyant-travel/bookings@0.64.0
  - @voyant-travel/core@0.64.0
  - @voyant-travel/crm@0.64.0
  - @voyant-travel/db@0.64.0
  - @voyant-travel/hono@0.64.0
  - @voyant-travel/storage@0.64.0
  - @voyant-travel/suppliers@0.64.0
  - @voyant-travel/utils@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/bookings@0.63.1
- @voyant-travel/core@0.63.1
- @voyant-travel/crm@0.63.1
- @voyant-travel/db@0.63.1
- @voyant-travel/hono@0.63.1
- @voyant-travel/storage@0.63.1
- @voyant-travel/suppliers@0.63.1
- @voyant-travel/utils@0.63.1

## 0.63.0

### Patch Changes

- Updated dependencies [5bff9c3]
- Updated dependencies [5bff9c3]
  - @voyant-travel/bookings@0.63.0
  - @voyant-travel/core@0.63.0
  - @voyant-travel/crm@0.63.0
  - @voyant-travel/db@0.63.0
  - @voyant-travel/hono@0.63.0
  - @voyant-travel/storage@0.63.0
  - @voyant-travel/suppliers@0.63.0
  - @voyant-travel/utils@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/bookings@0.62.3
- @voyant-travel/core@0.62.3
- @voyant-travel/crm@0.62.3
- @voyant-travel/db@0.62.3
- @voyant-travel/hono@0.62.3
- @voyant-travel/storage@0.62.3
- @voyant-travel/suppliers@0.62.3
- @voyant-travel/utils@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/bookings@0.62.2
- @voyant-travel/core@0.62.2
- @voyant-travel/crm@0.62.2
- @voyant-travel/db@0.62.2
- @voyant-travel/hono@0.62.2
- @voyant-travel/storage@0.62.2
- @voyant-travel/suppliers@0.62.2
- @voyant-travel/utils@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/bookings@0.62.1
- @voyant-travel/core@0.62.1
- @voyant-travel/crm@0.62.1
- @voyant-travel/db@0.62.1
- @voyant-travel/hono@0.62.1
- @voyant-travel/storage@0.62.1
- @voyant-travel/suppliers@0.62.1
- @voyant-travel/utils@0.62.1

## 0.62.0

### Patch Changes

- Updated dependencies [77aad68]
  - @voyant-travel/bookings@0.62.0
  - @voyant-travel/core@0.62.0
  - @voyant-travel/crm@0.62.0
  - @voyant-travel/db@0.62.0
  - @voyant-travel/hono@0.62.0
  - @voyant-travel/storage@0.62.0
  - @voyant-travel/suppliers@0.62.0
  - @voyant-travel/utils@0.62.0

## 0.61.0

### Patch Changes

- @voyant-travel/bookings@0.61.0
- @voyant-travel/core@0.61.0
- @voyant-travel/crm@0.61.0
- @voyant-travel/db@0.61.0
- @voyant-travel/hono@0.61.0
- @voyant-travel/storage@0.61.0
- @voyant-travel/suppliers@0.61.0
- @voyant-travel/utils@0.61.0

## 0.60.0

### Patch Changes

- Updated dependencies [4ff7f15]
  - @voyant-travel/bookings@0.60.0
  - @voyant-travel/core@0.60.0
  - @voyant-travel/crm@0.60.0
  - @voyant-travel/db@0.60.0
  - @voyant-travel/hono@0.60.0
  - @voyant-travel/storage@0.60.0
  - @voyant-travel/suppliers@0.60.0
  - @voyant-travel/utils@0.60.0

## 0.59.0

### Patch Changes

- @voyant-travel/bookings@0.59.0
- @voyant-travel/core@0.59.0
- @voyant-travel/crm@0.59.0
- @voyant-travel/db@0.59.0
- @voyant-travel/hono@0.59.0
- @voyant-travel/storage@0.59.0
- @voyant-travel/suppliers@0.59.0
- @voyant-travel/utils@0.59.0

## 0.58.0

### Patch Changes

- @voyant-travel/bookings@0.58.0
- @voyant-travel/core@0.58.0
- @voyant-travel/crm@0.58.0
- @voyant-travel/db@0.58.0
- @voyant-travel/hono@0.58.0
- @voyant-travel/storage@0.58.0
- @voyant-travel/suppliers@0.58.0
- @voyant-travel/utils@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/bookings@0.57.0
- @voyant-travel/core@0.57.0
- @voyant-travel/crm@0.57.0
- @voyant-travel/db@0.57.0
- @voyant-travel/hono@0.57.0
- @voyant-travel/storage@0.57.0
- @voyant-travel/suppliers@0.57.0
- @voyant-travel/utils@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/bookings@0.56.0
- @voyant-travel/core@0.56.0
- @voyant-travel/crm@0.56.0
- @voyant-travel/db@0.56.0
- @voyant-travel/hono@0.56.0
- @voyant-travel/storage@0.56.0
- @voyant-travel/suppliers@0.56.0
- @voyant-travel/utils@0.56.0

## 0.55.1

### Patch Changes

- Updated dependencies [819c847]
  - @voyant-travel/bookings@0.55.1
  - @voyant-travel/core@0.55.1
  - @voyant-travel/crm@0.55.1
  - @voyant-travel/db@0.55.1
  - @voyant-travel/hono@0.55.1
  - @voyant-travel/storage@0.55.1
  - @voyant-travel/suppliers@0.55.1
  - @voyant-travel/utils@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/bookings@0.55.0
- @voyant-travel/core@0.55.0
- @voyant-travel/crm@0.55.0
- @voyant-travel/db@0.55.0
- @voyant-travel/hono@0.55.0
- @voyant-travel/storage@0.55.0
- @voyant-travel/suppliers@0.55.0
- @voyant-travel/utils@0.55.0

## 0.54.0

### Patch Changes

- @voyant-travel/bookings@0.54.0
- @voyant-travel/core@0.54.0
- @voyant-travel/crm@0.54.0
- @voyant-travel/db@0.54.0
- @voyant-travel/hono@0.54.0
- @voyant-travel/storage@0.54.0
- @voyant-travel/suppliers@0.54.0
- @voyant-travel/utils@0.54.0

## 0.53.2

### Patch Changes

- @voyant-travel/bookings@0.53.2
- @voyant-travel/core@0.53.2
- @voyant-travel/crm@0.53.2
- @voyant-travel/db@0.53.2
- @voyant-travel/hono@0.53.2
- @voyant-travel/storage@0.53.2
- @voyant-travel/suppliers@0.53.2
- @voyant-travel/utils@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/bookings@0.53.1
- @voyant-travel/core@0.53.1
- @voyant-travel/crm@0.53.1
- @voyant-travel/db@0.53.1
- @voyant-travel/hono@0.53.1
- @voyant-travel/storage@0.53.1
- @voyant-travel/suppliers@0.53.1
- @voyant-travel/utils@0.53.1

## 0.53.0

### Patch Changes

- Updated dependencies [a315df6]
  - @voyant-travel/bookings@0.53.0
  - @voyant-travel/core@0.53.0
  - @voyant-travel/crm@0.53.0
  - @voyant-travel/db@0.53.0
  - @voyant-travel/hono@0.53.0
  - @voyant-travel/storage@0.53.0
  - @voyant-travel/suppliers@0.53.0
  - @voyant-travel/utils@0.53.0

## 0.52.4

### Patch Changes

- Updated dependencies [5d3c119]
  - @voyant-travel/bookings@0.52.4
  - @voyant-travel/core@0.52.4
  - @voyant-travel/crm@0.52.4
  - @voyant-travel/db@0.52.4
  - @voyant-travel/hono@0.52.4
  - @voyant-travel/storage@0.52.4
  - @voyant-travel/suppliers@0.52.4
  - @voyant-travel/utils@0.52.4

## 0.52.3

### Patch Changes

- Updated dependencies [9679a57]
  - @voyant-travel/bookings@0.52.3
  - @voyant-travel/core@0.52.3
  - @voyant-travel/crm@0.52.3
  - @voyant-travel/db@0.52.3
  - @voyant-travel/hono@0.52.3
  - @voyant-travel/storage@0.52.3
  - @voyant-travel/suppliers@0.52.3
  - @voyant-travel/utils@0.52.3

## 0.52.2

### Patch Changes

- 3e09123: Contracts/templates UI refresh.

  - `ContractDetailPage`, `ContractsPage`, `PoliciesPage`, and `TemplatesPage` rebuilt around the shared table primitives with sort/filter/empty-state parity. Detail page now surfaces lifecycle actions inline rather than in a side panel.
  - New `ContractSendDialog` for kicking off the contract-send flow with recipient/CC selection and i18n strings (EN + RO).
  - `useContractMutation` invalidates the contract list + detail queries after lifecycle transitions so list rows reflect the new state immediately.
  - `@voyant-travel/legal` lifecycle/routes/service updated to expose the data the new dialog needs (recipient hydration, send payload) and to surface lifecycle validation errors with structured codes.

- Updated dependencies [3e09123]
- Updated dependencies [3e09123]
  - @voyant-travel/bookings@0.52.2
  - @voyant-travel/core@0.52.2
  - @voyant-travel/crm@0.52.2
  - @voyant-travel/db@0.52.2
  - @voyant-travel/hono@0.52.2
  - @voyant-travel/storage@0.52.2
  - @voyant-travel/suppliers@0.52.2
  - @voyant-travel/utils@0.52.2

## 0.52.1

### Patch Changes

- Updated dependencies [335d277]
  - @voyant-travel/bookings@0.52.1
  - @voyant-travel/core@0.52.1
  - @voyant-travel/crm@0.52.1
  - @voyant-travel/db@0.52.1
  - @voyant-travel/hono@0.52.1
  - @voyant-travel/storage@0.52.1
  - @voyant-travel/suppliers@0.52.1
  - @voyant-travel/utils@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/bookings@0.52.0
- @voyant-travel/core@0.52.0
- @voyant-travel/crm@0.52.0
- @voyant-travel/db@0.52.0
- @voyant-travel/hono@0.52.0
- @voyant-travel/storage@0.52.0
- @voyant-travel/suppliers@0.52.0
- @voyant-travel/utils@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/bookings@0.51.1
- @voyant-travel/core@0.51.1
- @voyant-travel/crm@0.51.1
- @voyant-travel/db@0.51.1
- @voyant-travel/hono@0.51.1
- @voyant-travel/storage@0.51.1
- @voyant-travel/suppliers@0.51.1
- @voyant-travel/utils@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/bookings@0.51.0
- @voyant-travel/core@0.51.0
- @voyant-travel/crm@0.51.0
- @voyant-travel/db@0.51.0
- @voyant-travel/hono@0.51.0
- @voyant-travel/storage@0.51.0
- @voyant-travel/suppliers@0.51.0
- @voyant-travel/utils@0.51.0

## 0.50.8

### Patch Changes

- Updated dependencies [f35014f]
  - @voyant-travel/bookings@0.50.8
  - @voyant-travel/core@0.50.8
  - @voyant-travel/crm@0.50.8
  - @voyant-travel/db@0.50.8
  - @voyant-travel/hono@0.50.8
  - @voyant-travel/storage@0.50.8
  - @voyant-travel/suppliers@0.50.8
  - @voyant-travel/utils@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/bookings@0.50.7
- @voyant-travel/core@0.50.7
- @voyant-travel/crm@0.50.7
- @voyant-travel/db@0.50.7
- @voyant-travel/hono@0.50.7
- @voyant-travel/storage@0.50.7
- @voyant-travel/suppliers@0.50.7
- @voyant-travel/utils@0.50.7

## 0.50.6

### Patch Changes

- Updated dependencies [c14f0a8]
  - @voyant-travel/bookings@0.50.6
  - @voyant-travel/core@0.50.6
  - @voyant-travel/crm@0.50.6
  - @voyant-travel/db@0.50.6
  - @voyant-travel/hono@0.50.6
  - @voyant-travel/storage@0.50.6
  - @voyant-travel/suppliers@0.50.6
  - @voyant-travel/utils@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/bookings@0.50.5
- @voyant-travel/core@0.50.5
- @voyant-travel/crm@0.50.5
- @voyant-travel/db@0.50.5
- @voyant-travel/hono@0.50.5
- @voyant-travel/storage@0.50.5
- @voyant-travel/suppliers@0.50.5
- @voyant-travel/utils@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/bookings@0.50.4
- @voyant-travel/core@0.50.4
- @voyant-travel/crm@0.50.4
- @voyant-travel/db@0.50.4
- @voyant-travel/hono@0.50.4
- @voyant-travel/storage@0.50.4
- @voyant-travel/suppliers@0.50.4
- @voyant-travel/utils@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/bookings@0.50.3
- @voyant-travel/core@0.50.3
- @voyant-travel/crm@0.50.3
- @voyant-travel/db@0.50.3
- @voyant-travel/hono@0.50.3
- @voyant-travel/storage@0.50.3
- @voyant-travel/suppliers@0.50.3
- @voyant-travel/utils@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/bookings@0.50.2
- @voyant-travel/core@0.50.2
- @voyant-travel/crm@0.50.2
- @voyant-travel/db@0.50.2
- @voyant-travel/hono@0.50.2
- @voyant-travel/storage@0.50.2
- @voyant-travel/suppliers@0.50.2
- @voyant-travel/utils@0.50.2

## 0.50.1

### Patch Changes

- @voyant-travel/bookings@0.50.1
- @voyant-travel/core@0.50.1
- @voyant-travel/crm@0.50.1
- @voyant-travel/db@0.50.1
- @voyant-travel/hono@0.50.1
- @voyant-travel/storage@0.50.1
- @voyant-travel/suppliers@0.50.1
- @voyant-travel/utils@0.50.1

## 0.50.0

### Minor Changes

- 140d0ad: Add an opinionated contract lifecycle with stage history, transition validation, and domain events for issue/send/sign/execute/void transitions.

### Patch Changes

- @voyant-travel/bookings@0.50.0
- @voyant-travel/core@0.50.0
- @voyant-travel/crm@0.50.0
- @voyant-travel/db@0.50.0
- @voyant-travel/hono@0.50.0
- @voyant-travel/storage@0.50.0
- @voyant-travel/suppliers@0.50.0
- @voyant-travel/utils@0.50.0

## 0.49.0

### Patch Changes

- @voyant-travel/bookings@0.49.0
- @voyant-travel/core@0.49.0
- @voyant-travel/crm@0.49.0
- @voyant-travel/db@0.49.0
- @voyant-travel/hono@0.49.0
- @voyant-travel/storage@0.49.0
- @voyant-travel/suppliers@0.49.0
- @voyant-travel/utils@0.49.0

## 0.48.0

### Patch Changes

- Updated dependencies [9132fcf]
  - @voyant-travel/bookings@0.48.0
  - @voyant-travel/core@0.48.0
  - @voyant-travel/crm@0.48.0
  - @voyant-travel/db@0.48.0
  - @voyant-travel/hono@0.48.0
  - @voyant-travel/storage@0.48.0
  - @voyant-travel/suppliers@0.48.0
  - @voyant-travel/utils@0.48.0

## 0.47.0

### Minor Changes

- 65408c6: Add stable legal document operation routes for contract template previews, stored document attachment, and PDF regeneration, plus booking-scoped customer-safe finance document lookup by reference.

### Patch Changes

- @voyant-travel/bookings@0.47.0
- @voyant-travel/core@0.47.0
- @voyant-travel/crm@0.47.0
- @voyant-travel/db@0.47.0
- @voyant-travel/hono@0.47.0
- @voyant-travel/storage@0.47.0
- @voyant-travel/suppliers@0.47.0
- @voyant-travel/utils@0.47.0

## 0.46.0

### Minor Changes

- 72b99b2: Add explicit default storefront contract templates with optional channel scoping and selector fallback support.

### Patch Changes

- @voyant-travel/bookings@0.46.0
- @voyant-travel/core@0.46.0
- @voyant-travel/crm@0.46.0
- @voyant-travel/db@0.46.0
- @voyant-travel/hono@0.46.0
- @voyant-travel/storage@0.46.0
- @voyant-travel/suppliers@0.46.0
- @voyant-travel/utils@0.46.0

## 0.45.0

### Patch Changes

- @voyant-travel/bookings@0.45.0
- @voyant-travel/core@0.45.0
- @voyant-travel/crm@0.45.0
- @voyant-travel/db@0.45.0
- @voyant-travel/hono@0.45.0
- @voyant-travel/storage@0.45.0
- @voyant-travel/suppliers@0.45.0
- @voyant-travel/utils@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/bookings@0.44.0
- @voyant-travel/core@0.44.0
- @voyant-travel/crm@0.44.0
- @voyant-travel/db@0.44.0
- @voyant-travel/hono@0.44.0
- @voyant-travel/storage@0.44.0
- @voyant-travel/suppliers@0.44.0
- @voyant-travel/utils@0.44.0

## 0.43.0

### Patch Changes

- Updated dependencies [d07215e]
  - @voyant-travel/bookings@0.43.0
  - @voyant-travel/core@0.43.0
  - @voyant-travel/crm@0.43.0
  - @voyant-travel/db@0.43.0
  - @voyant-travel/hono@0.43.0
  - @voyant-travel/storage@0.43.0
  - @voyant-travel/suppliers@0.43.0
  - @voyant-travel/utils@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/bookings@0.42.0
- @voyant-travel/core@0.42.0
- @voyant-travel/crm@0.42.0
- @voyant-travel/db@0.42.0
- @voyant-travel/hono@0.42.0
- @voyant-travel/storage@0.42.0
- @voyant-travel/suppliers@0.42.0
- @voyant-travel/utils@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/bookings@0.41.3
- @voyant-travel/core@0.41.3
- @voyant-travel/crm@0.41.3
- @voyant-travel/db@0.41.3
- @voyant-travel/hono@0.41.3
- @voyant-travel/storage@0.41.3
- @voyant-travel/suppliers@0.41.3
- @voyant-travel/utils@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/bookings@0.41.2
- @voyant-travel/core@0.41.2
- @voyant-travel/crm@0.41.2
- @voyant-travel/db@0.41.2
- @voyant-travel/hono@0.41.2
- @voyant-travel/storage@0.41.2
- @voyant-travel/suppliers@0.41.2
- @voyant-travel/utils@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/bookings@0.41.1
- @voyant-travel/core@0.41.1
- @voyant-travel/crm@0.41.1
- @voyant-travel/db@0.41.1
- @voyant-travel/hono@0.41.1
- @voyant-travel/storage@0.41.1
- @voyant-travel/suppliers@0.41.1
- @voyant-travel/utils@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/bookings@0.41.0
- @voyant-travel/core@0.41.0
- @voyant-travel/crm@0.41.0
- @voyant-travel/db@0.41.0
- @voyant-travel/hono@0.41.0
- @voyant-travel/storage@0.41.0
- @voyant-travel/suppliers@0.41.0
- @voyant-travel/utils@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/bookings@0.40.1
- @voyant-travel/core@0.40.1
- @voyant-travel/crm@0.40.1
- @voyant-travel/db@0.40.1
- @voyant-travel/hono@0.40.1
- @voyant-travel/storage@0.40.1
- @voyant-travel/suppliers@0.40.1
- @voyant-travel/utils@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/bookings@0.40.0
- @voyant-travel/core@0.40.0
- @voyant-travel/crm@0.40.0
- @voyant-travel/db@0.40.0
- @voyant-travel/hono@0.40.0
- @voyant-travel/storage@0.40.0
- @voyant-travel/suppliers@0.40.0
- @voyant-travel/utils@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [f4235ea]
  - @voyant-travel/bookings@0.39.0
  - @voyant-travel/core@0.39.0
  - @voyant-travel/crm@0.39.0
  - @voyant-travel/db@0.39.0
  - @voyant-travel/hono@0.39.0
  - @voyant-travel/storage@0.39.0
  - @voyant-travel/suppliers@0.39.0
  - @voyant-travel/utils@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/bookings@0.38.2
- @voyant-travel/core@0.38.2
- @voyant-travel/crm@0.38.2
- @voyant-travel/db@0.38.2
- @voyant-travel/hono@0.38.2
- @voyant-travel/storage@0.38.2
- @voyant-travel/suppliers@0.38.2
- @voyant-travel/utils@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/bookings@0.38.1
- @voyant-travel/core@0.38.1
- @voyant-travel/crm@0.38.1
- @voyant-travel/db@0.38.1
- @voyant-travel/hono@0.38.1
- @voyant-travel/storage@0.38.1
- @voyant-travel/suppliers@0.38.1
- @voyant-travel/utils@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/bookings@0.38.0
- @voyant-travel/core@0.38.0
- @voyant-travel/crm@0.38.0
- @voyant-travel/db@0.38.0
- @voyant-travel/hono@0.38.0
- @voyant-travel/storage@0.38.0
- @voyant-travel/suppliers@0.38.0
- @voyant-travel/utils@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/bookings@0.37.1
- @voyant-travel/core@0.37.1
- @voyant-travel/crm@0.37.1
- @voyant-travel/db@0.37.1
- @voyant-travel/hono@0.37.1
- @voyant-travel/storage@0.37.1
- @voyant-travel/suppliers@0.37.1
- @voyant-travel/utils@0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies [4c93561]
- Updated dependencies [dc29b79]
  - @voyant-travel/bookings@0.37.0
  - @voyant-travel/core@0.37.0
  - @voyant-travel/crm@0.37.0
  - @voyant-travel/db@0.37.0
  - @voyant-travel/hono@0.37.0
  - @voyant-travel/storage@0.37.0
  - @voyant-travel/suppliers@0.37.0
  - @voyant-travel/utils@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies [15e6953]
  - @voyant-travel/bookings@0.36.0
  - @voyant-travel/core@0.36.0
  - @voyant-travel/crm@0.36.0
  - @voyant-travel/db@0.36.0
  - @voyant-travel/hono@0.36.0
  - @voyant-travel/storage@0.36.0
  - @voyant-travel/suppliers@0.36.0
  - @voyant-travel/utils@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/bookings@0.35.0
- @voyant-travel/core@0.35.0
- @voyant-travel/crm@0.35.0
- @voyant-travel/db@0.35.0
- @voyant-travel/hono@0.35.0
- @voyant-travel/storage@0.35.0
- @voyant-travel/suppliers@0.35.0
- @voyant-travel/utils@0.35.0

## 0.34.0

### Minor Changes

- 24b6624: Add person-aware contract list search, hydrate contract person details, and expose a ContractsPage person filter.

### Patch Changes

- 6e4a90f: Polish the contract detail page with a clearer header, tabbed document and signature sections, and a file-first attachment dialog.
- a37d4af: Validate Liquid syntax in legal contract template bodies before save or preview so rich-text-split tags return structured template errors instead of render-time failures.
- Updated dependencies [a37d4af]
  - @voyant-travel/bookings@0.34.0
  - @voyant-travel/core@0.34.0
  - @voyant-travel/crm@0.34.0
  - @voyant-travel/db@0.34.0
  - @voyant-travel/hono@0.34.0
  - @voyant-travel/storage@0.34.0
  - @voyant-travel/suppliers@0.34.0
  - @voyant-travel/utils@0.34.0

## 0.33.1

### Patch Changes

- Updated dependencies [9bee9aa]
  - @voyant-travel/bookings@0.33.1
  - @voyant-travel/core@0.33.1
  - @voyant-travel/crm@0.33.1
  - @voyant-travel/db@0.33.1
  - @voyant-travel/hono@0.33.1
  - @voyant-travel/storage@0.33.1
  - @voyant-travel/suppliers@0.33.1
  - @voyant-travel/utils@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/bookings@0.33.0
- @voyant-travel/core@0.33.0
- @voyant-travel/crm@0.33.0
- @voyant-travel/db@0.33.0
- @voyant-travel/hono@0.33.0
- @voyant-travel/storage@0.33.0
- @voyant-travel/suppliers@0.33.0
- @voyant-travel/utils@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/bookings@0.32.3
- @voyant-travel/core@0.32.3
- @voyant-travel/crm@0.32.3
- @voyant-travel/db@0.32.3
- @voyant-travel/hono@0.32.3
- @voyant-travel/storage@0.32.3
- @voyant-travel/suppliers@0.32.3
- @voyant-travel/utils@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/bookings@0.32.2
- @voyant-travel/core@0.32.2
- @voyant-travel/crm@0.32.2
- @voyant-travel/db@0.32.2
- @voyant-travel/hono@0.32.2
- @voyant-travel/storage@0.32.2
- @voyant-travel/suppliers@0.32.2
- @voyant-travel/utils@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/bookings@0.32.1
- @voyant-travel/core@0.32.1
- @voyant-travel/crm@0.32.1
- @voyant-travel/db@0.32.1
- @voyant-travel/hono@0.32.1
- @voyant-travel/storage@0.32.1
- @voyant-travel/suppliers@0.32.1
- @voyant-travel/utils@0.32.1

## 0.32.0

### Patch Changes

- Updated dependencies [6ea6ded]
  - @voyant-travel/bookings@0.32.0
  - @voyant-travel/core@0.32.0
  - @voyant-travel/crm@0.32.0
  - @voyant-travel/db@0.32.0
  - @voyant-travel/hono@0.32.0
  - @voyant-travel/storage@0.32.0
  - @voyant-travel/suppliers@0.32.0
  - @voyant-travel/utils@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/bookings@0.31.4
- @voyant-travel/core@0.31.4
- @voyant-travel/crm@0.31.4
- @voyant-travel/db@0.31.4
- @voyant-travel/hono@0.31.4
- @voyant-travel/storage@0.31.4
- @voyant-travel/suppliers@0.31.4
- @voyant-travel/utils@0.31.4

## 0.31.3

### Patch Changes

- Updated dependencies [5f974dd]
  - @voyant-travel/bookings@0.31.3
  - @voyant-travel/core@0.31.3
  - @voyant-travel/crm@0.31.3
  - @voyant-travel/db@0.31.3
  - @voyant-travel/hono@0.31.3
  - @voyant-travel/storage@0.31.3
  - @voyant-travel/suppliers@0.31.3
  - @voyant-travel/utils@0.31.3

## 0.31.2

### Patch Changes

- Updated dependencies [54ddc93]
  - @voyant-travel/bookings@0.31.2
  - @voyant-travel/core@0.31.2
  - @voyant-travel/crm@0.31.2
  - @voyant-travel/db@0.31.2
  - @voyant-travel/hono@0.31.2
  - @voyant-travel/storage@0.31.2
  - @voyant-travel/suppliers@0.31.2
  - @voyant-travel/utils@0.31.2

## 0.31.1

### Patch Changes

- @voyant-travel/bookings@0.31.1
- @voyant-travel/core@0.31.1
- @voyant-travel/crm@0.31.1
- @voyant-travel/db@0.31.1
- @voyant-travel/hono@0.31.1
- @voyant-travel/storage@0.31.1
- @voyant-travel/suppliers@0.31.1
- @voyant-travel/utils@0.31.1

## 0.31.0

### Patch Changes

- @voyant-travel/bookings@0.31.0
- @voyant-travel/core@0.31.0
- @voyant-travel/crm@0.31.0
- @voyant-travel/db@0.31.0
- @voyant-travel/hono@0.31.0
- @voyant-travel/storage@0.31.0
- @voyant-travel/suppliers@0.31.0
- @voyant-travel/utils@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/bookings@0.30.7
- @voyant-travel/core@0.30.7
- @voyant-travel/crm@0.30.7
- @voyant-travel/db@0.30.7
- @voyant-travel/hono@0.30.7
- @voyant-travel/storage@0.30.7
- @voyant-travel/suppliers@0.30.7
- @voyant-travel/utils@0.30.7

## 0.30.6

### Patch Changes

- Updated dependencies [5a4c592]
  - @voyant-travel/bookings@0.30.6
  - @voyant-travel/core@0.30.6
  - @voyant-travel/crm@0.30.6
  - @voyant-travel/db@0.30.6
  - @voyant-travel/hono@0.30.6
  - @voyant-travel/storage@0.30.6
  - @voyant-travel/suppliers@0.30.6
  - @voyant-travel/utils@0.30.6

## 0.30.5

### Patch Changes

- Updated dependencies [3f323e9]
  - @voyant-travel/bookings@0.30.5
  - @voyant-travel/core@0.30.5
  - @voyant-travel/crm@0.30.5
  - @voyant-travel/db@0.30.5
  - @voyant-travel/hono@0.30.5
  - @voyant-travel/storage@0.30.5
  - @voyant-travel/suppliers@0.30.5
  - @voyant-travel/utils@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/bookings@0.30.4
- @voyant-travel/core@0.30.4
- @voyant-travel/crm@0.30.4
- @voyant-travel/db@0.30.4
- @voyant-travel/hono@0.30.4
- @voyant-travel/storage@0.30.4
- @voyant-travel/suppliers@0.30.4
- @voyant-travel/utils@0.30.4

## 0.30.3

### Patch Changes

- Updated dependencies [05a1b19]
  - @voyant-travel/bookings@0.30.3
  - @voyant-travel/core@0.30.3
  - @voyant-travel/crm@0.30.3
  - @voyant-travel/db@0.30.3
  - @voyant-travel/hono@0.30.3
  - @voyant-travel/storage@0.30.3
  - @voyant-travel/suppliers@0.30.3
  - @voyant-travel/utils@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/bookings@0.30.2
- @voyant-travel/core@0.30.2
- @voyant-travel/crm@0.30.2
- @voyant-travel/db@0.30.2
- @voyant-travel/hono@0.30.2
- @voyant-travel/storage@0.30.2
- @voyant-travel/suppliers@0.30.2
- @voyant-travel/utils@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/bookings@0.30.1
- @voyant-travel/core@0.30.1
- @voyant-travel/crm@0.30.1
- @voyant-travel/db@0.30.1
- @voyant-travel/hono@0.30.1
- @voyant-travel/storage@0.30.1
- @voyant-travel/suppliers@0.30.1
- @voyant-travel/utils@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/bookings@0.30.0
- @voyant-travel/core@0.30.0
- @voyant-travel/crm@0.30.0
- @voyant-travel/db@0.30.0
- @voyant-travel/hono@0.30.0
- @voyant-travel/storage@0.30.0
- @voyant-travel/suppliers@0.30.0
- @voyant-travel/utils@0.30.0

## 0.29.0

### Patch Changes

- 3af39d1: Fix #489: enforce uniqueness on `contract_number_series.(prefix, scope) WHERE active`.

  Adds a partial unique index `uidx_contract_number_series_prefix_scope_active` so consumers can rely on a deterministic active-series-per-(prefix, scope) and seed scripts can use `ON CONFLICT` keys instead of racy SELECT-then-INSERT patterns.

  Service changes in `contractSeriesService`:

  - `findActiveByPrefixScope(db, prefix, scope)` — new lookup keyed on the natural unique pair. Throws `ContractSeriesAmbiguousError` if the index is bypassed and >1 active row exists (defense in depth).
  - `upsertByPrefixScope(db, data)` — new idempotent create-or-update for consumer seed scripts; uses the partial unique index as the conflict target.
  - `findSeriesByName(db, name)` — `@deprecated`; now throws `ContractSeriesAmbiguousError` on multi-match instead of silently picking the most-recently-updated row. Existing callers that rely on this resolution should migrate to `findActiveByPrefixScope` or archive duplicates (`active = false`).

  `autoGenerateContractForBooking` accepts a new `seriesPrefixScope: { prefix, scope }` option that takes precedence over the now-`@deprecated` `seriesName`.

  Migration shipped in `templates/dmc/migrations/0001_*.sql` and `templates/operator/migrations/0004_*.sql`. Deployments with existing duplicates must archive the older active rows (`active=false`) before applying or the migration will fail loudly — which is the intended signal.

- Updated dependencies [3420711]
- Updated dependencies [583326e]
- Updated dependencies [583326e]
- Updated dependencies [4a6523e]
- Updated dependencies [db51715]
  - @voyant-travel/bookings@0.29.0
  - @voyant-travel/core@0.29.0
  - @voyant-travel/crm@0.29.0
  - @voyant-travel/db@0.29.0
  - @voyant-travel/hono@0.29.0
  - @voyant-travel/storage@0.29.0
  - @voyant-travel/suppliers@0.29.0
  - @voyant-travel/utils@0.29.0

## 0.28.3

### Patch Changes

- @voyant-travel/bookings@0.28.3
- @voyant-travel/core@0.28.3
- @voyant-travel/crm@0.28.3
- @voyant-travel/db@0.28.3
- @voyant-travel/hono@0.28.3
- @voyant-travel/storage@0.28.3
- @voyant-travel/suppliers@0.28.3
- @voyant-travel/utils@0.28.3

## 0.28.2

### Patch Changes

- @voyant-travel/bookings@0.28.2
- @voyant-travel/core@0.28.2
- @voyant-travel/crm@0.28.2
- @voyant-travel/db@0.28.2
- @voyant-travel/hono@0.28.2
- @voyant-travel/storage@0.28.2
- @voyant-travel/suppliers@0.28.2
- @voyant-travel/utils@0.28.2

## 0.28.1

### Patch Changes

- @voyant-travel/bookings@0.28.1
- @voyant-travel/core@0.28.1
- @voyant-travel/crm@0.28.1
- @voyant-travel/db@0.28.1
- @voyant-travel/hono@0.28.1
- @voyant-travel/storage@0.28.1
- @voyant-travel/suppliers@0.28.1
- @voyant-travel/utils@0.28.1

## 0.28.0

### Patch Changes

- @voyant-travel/bookings@0.28.0
- @voyant-travel/core@0.28.0
- @voyant-travel/crm@0.28.0
- @voyant-travel/db@0.28.0
- @voyant-travel/hono@0.28.0
- @voyant-travel/storage@0.28.0
- @voyant-travel/suppliers@0.28.0
- @voyant-travel/utils@0.28.0

## 0.27.0

### Patch Changes

- @voyant-travel/bookings@0.27.0
- @voyant-travel/core@0.27.0
- @voyant-travel/crm@0.27.0
- @voyant-travel/db@0.27.0
- @voyant-travel/hono@0.27.0
- @voyant-travel/storage@0.27.0
- @voyant-travel/suppliers@0.27.0
- @voyant-travel/utils@0.27.0

## 0.26.9

### Patch Changes

- @voyant-travel/bookings@0.26.9
- @voyant-travel/core@0.26.9
- @voyant-travel/crm@0.26.9
- @voyant-travel/db@0.26.9
- @voyant-travel/hono@0.26.9
- @voyant-travel/storage@0.26.9
- @voyant-travel/suppliers@0.26.9
- @voyant-travel/utils@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/bookings@0.26.8
- @voyant-travel/core@0.26.8
- @voyant-travel/crm@0.26.8
- @voyant-travel/db@0.26.8
- @voyant-travel/hono@0.26.8
- @voyant-travel/storage@0.26.8
- @voyant-travel/suppliers@0.26.8
- @voyant-travel/utils@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/bookings@0.26.7
- @voyant-travel/core@0.26.7
- @voyant-travel/crm@0.26.7
- @voyant-travel/db@0.26.7
- @voyant-travel/hono@0.26.7
- @voyant-travel/storage@0.26.7
- @voyant-travel/suppliers@0.26.7
- @voyant-travel/utils@0.26.7

## 0.26.6

### Patch Changes

- Updated dependencies [571e340]
  - @voyant-travel/bookings@0.26.6
  - @voyant-travel/core@0.26.6
  - @voyant-travel/crm@0.26.6
  - @voyant-travel/db@0.26.6
  - @voyant-travel/hono@0.26.6
  - @voyant-travel/storage@0.26.6
  - @voyant-travel/suppliers@0.26.6
  - @voyant-travel/utils@0.26.6

## 0.26.5

### Patch Changes

- Updated dependencies [7a92aba]
  - @voyant-travel/bookings@0.26.5
  - @voyant-travel/core@0.26.5
  - @voyant-travel/crm@0.26.5
  - @voyant-travel/db@0.26.5
  - @voyant-travel/hono@0.26.5
  - @voyant-travel/storage@0.26.5
  - @voyant-travel/suppliers@0.26.5
  - @voyant-travel/utils@0.26.5

## 0.26.4

### Patch Changes

- Updated dependencies [6493f62]
  - @voyant-travel/bookings@0.26.4
  - @voyant-travel/core@0.26.4
  - @voyant-travel/crm@0.26.4
  - @voyant-travel/db@0.26.4
  - @voyant-travel/hono@0.26.4
  - @voyant-travel/storage@0.26.4
  - @voyant-travel/suppliers@0.26.4
  - @voyant-travel/utils@0.26.4

## 0.26.3

### Patch Changes

- Updated dependencies [372cad5]
  - @voyant-travel/bookings@0.26.3
  - @voyant-travel/core@0.26.3
  - @voyant-travel/crm@0.26.3
  - @voyant-travel/db@0.26.3
  - @voyant-travel/hono@0.26.3
  - @voyant-travel/storage@0.26.3
  - @voyant-travel/suppliers@0.26.3
  - @voyant-travel/utils@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies [ffdb485]
  - @voyant-travel/bookings@0.26.2
  - @voyant-travel/core@0.26.2
  - @voyant-travel/crm@0.26.2
  - @voyant-travel/db@0.26.2
  - @voyant-travel/hono@0.26.2
  - @voyant-travel/storage@0.26.2
  - @voyant-travel/suppliers@0.26.2
  - @voyant-travel/utils@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies [c0507a6]
  - @voyant-travel/bookings@0.26.1
  - @voyant-travel/core@0.26.1
  - @voyant-travel/crm@0.26.1
  - @voyant-travel/db@0.26.1
  - @voyant-travel/hono@0.26.1
  - @voyant-travel/storage@0.26.1
  - @voyant-travel/suppliers@0.26.1
  - @voyant-travel/utils@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/bookings@0.26.0
- @voyant-travel/core@0.26.0
- @voyant-travel/crm@0.26.0
- @voyant-travel/db@0.26.0
- @voyant-travel/hono@0.26.0
- @voyant-travel/storage@0.26.0
- @voyant-travel/suppliers@0.26.0
- @voyant-travel/utils@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/bookings@0.25.0
- @voyant-travel/core@0.25.0
- @voyant-travel/crm@0.25.0
- @voyant-travel/db@0.25.0
- @voyant-travel/hono@0.25.0
- @voyant-travel/storage@0.25.0
- @voyant-travel/suppliers@0.25.0
- @voyant-travel/utils@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/bookings@0.24.3
- @voyant-travel/core@0.24.3
- @voyant-travel/crm@0.24.3
- @voyant-travel/db@0.24.3
- @voyant-travel/hono@0.24.3
- @voyant-travel/storage@0.24.3
- @voyant-travel/suppliers@0.24.3
- @voyant-travel/utils@0.24.3

## 0.24.2

### Patch Changes

- @voyant-travel/bookings@0.24.2
- @voyant-travel/core@0.24.2
- @voyant-travel/crm@0.24.2
- @voyant-travel/db@0.24.2
- @voyant-travel/hono@0.24.2
- @voyant-travel/storage@0.24.2
- @voyant-travel/suppliers@0.24.2
- @voyant-travel/utils@0.24.2

## 0.24.1

### Patch Changes

- @voyant-travel/bookings@0.24.1
- @voyant-travel/core@0.24.1
- @voyant-travel/crm@0.24.1
- @voyant-travel/db@0.24.1
- @voyant-travel/hono@0.24.1
- @voyant-travel/storage@0.24.1
- @voyant-travel/suppliers@0.24.1
- @voyant-travel/utils@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/bookings@0.24.0
- @voyant-travel/core@0.24.0
- @voyant-travel/crm@0.24.0
- @voyant-travel/db@0.24.0
- @voyant-travel/hono@0.24.0
- @voyant-travel/storage@0.24.0
- @voyant-travel/suppliers@0.24.0
- @voyant-travel/utils@0.24.0

## 0.23.0

### Patch Changes

- @voyant-travel/bookings@0.23.0
- @voyant-travel/core@0.23.0
- @voyant-travel/crm@0.23.0
- @voyant-travel/db@0.23.0
- @voyant-travel/hono@0.23.0
- @voyant-travel/storage@0.23.0
- @voyant-travel/suppliers@0.23.0
- @voyant-travel/utils@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/bookings@0.22.0
- @voyant-travel/core@0.22.0
- @voyant-travel/crm@0.22.0
- @voyant-travel/db@0.22.0
- @voyant-travel/hono@0.22.0
- @voyant-travel/storage@0.22.0
- @voyant-travel/suppliers@0.22.0
- @voyant-travel/utils@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/bookings@0.21.1
- @voyant-travel/core@0.21.1
- @voyant-travel/crm@0.21.1
- @voyant-travel/db@0.21.1
- @voyant-travel/hono@0.21.1
- @voyant-travel/storage@0.21.1
- @voyant-travel/suppliers@0.21.1
- @voyant-travel/utils@0.21.1

## 0.21.0

### Minor Changes

- 6427bad: Release the booking journey architecture train.

  This adds booking hold policy support, richer traveler and booking journey flows, operator tax policy configuration, finance billing and tax policy APIs, notification reminder target and delivery tooling, and the template/runtime wiring needed for the operator storefront checkout flow.

### Patch Changes

- Updated dependencies [6427bad]
  - @voyant-travel/bookings@0.21.0
  - @voyant-travel/core@0.21.0
  - @voyant-travel/crm@0.21.0
  - @voyant-travel/db@0.21.0
  - @voyant-travel/hono@0.21.0
  - @voyant-travel/storage@0.21.0
  - @voyant-travel/suppliers@0.21.0
  - @voyant-travel/utils@0.21.0

## 0.20.0

### Patch Changes

- @voyant-travel/bookings@0.20.0
- @voyant-travel/core@0.20.0
- @voyant-travel/crm@0.20.0
- @voyant-travel/db@0.20.0
- @voyant-travel/hono@0.20.0
- @voyant-travel/storage@0.20.0
- @voyant-travel/suppliers@0.20.0
- @voyant-travel/utils@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [714c544]
  - @voyant-travel/bookings@0.19.0
  - @voyant-travel/core@0.19.0
  - @voyant-travel/crm@0.19.0
  - @voyant-travel/db@0.19.0
  - @voyant-travel/hono@0.19.0
  - @voyant-travel/storage@0.19.0
  - @voyant-travel/suppliers@0.19.0
  - @voyant-travel/utils@0.19.0

## 0.18.0

### Minor Changes

- 8932f60: Make schema discovery declarative and unblock downstream `drizzle-kit generate` against published packages.

  **Exports — `default` condition added everywhere (fixes #380)**

  Every `@voyant-travel/*` package's `publishConfig.exports` previously declared only `types` and `import`. drizzle-kit (and any CJS-based resolver) walked the `require` branch, hit nothing, and threw `ERR_PACKAGE_PATH_NOT_EXPORTED` on subpaths like `@voyant-travel/db/schema`. Each subpath now also declares a `default` condition pointing at the same `.js` file, so downstream consumers can resolve subpaths and run their own `drizzle-kit generate` against the canonical runtime schema.

  **Operator template baseline regenerated (fixes #378, #379)**

  `templates/operator/migrations/0000_striped_jubilee.sql` was missing `bookings.fx_rate_set_id` (causing `GET /v1/admin/bookings` to 500), and `@voyant-travel/cruises`'s 14 tables had never made it into any baseline. Added `@voyant-travel/cruises` to `templates/operator/drizzle.config.ts` and emitted `0004_steady_molten_man.sql` covering all drift (cruise tables/enums, the missing `fx_rate_set_id`, idempotency keys, vouchers, voucher redemptions, the `accessibility_needs` → encrypted-jsonb move, several check constraints, new enum values). Pruned 7 stale orphan migrations that were on disk but not in `_journal.json`. Schema baseline + runtime now match — `drizzle-kit generate` against a freshly migrated DB returns "No schema changes".

  **One `./schema` per module — sub-paths removed (BREAKING)**

  Each module now exposes exactly one schema entrypoint, `./schema`, that re-exports everything DB-related the module owns. Granular sub-paths are deleted from `exports` and `publishConfig.exports`:

  - `@voyant-travel/bookings/schema/travel-details` → fold into `@voyant-travel/bookings/schema`
  - `@voyant-travel/legal/contracts/schema` and `@voyant-travel/legal/policies/schema` → fold into the new `@voyant-travel/legal/schema`
  - `@voyant-travel/{products,crm,cruises,distribution,transactions,charters}/schema` now also re-export the pgTables declared inside `./booking-extension`. The runtime `./booking-extension` HonoExtension export is unchanged.

  Consumers importing from any of the removed sub-paths must switch to the consolidated `./schema` import.

  **Declarative dependency graph in `package.json`**

  Every module package gained a `voyant: { schema, requiresSchemas: [...] }` block declaring its schema entrypoint and the other modules' schemas it needs at the SQL level (e.g. `hospitality` requires `facilities` and `bookings`; `ground` requires `facilities` and `identity`; `suppliers` requires `facilities`; everyone implicitly requires `db`). The CLI reads this block to compute the dependency closure for a project.

  **`@voyant-travel/cli` — `resolveSchemas` helper + `voyant db schemas` command**

  New `@voyant-travel/cli/drizzle` entrypoint exporting `resolveSchemas(config, options?)` — walks `voyant.requiresSchemas` transitively from the modules listed in `voyant.config.ts`, dedupes, returns specifier strings (default) or absolute file paths (`style: "file"`). Throws on circular dependencies. New `voyant db schemas` debug command prints the resolved closure.

  ```ts
  // drizzle.config.ts
  import { defineConfig } from "drizzle-kit";
  import { resolveSchemas } from "@voyant-travel/cli/drizzle";
  import voyantConfig from "./voyant.config";

  export default defineConfig({
    schema: resolveSchemas(voyantConfig),
    out: "./migrations",
    dialect: "postgresql",
    dbCredentials: { url: process.env.DATABASE_URL! },
  });
  ```

  Adding a new module to `voyant.config.ts` now picks up its schema (and transitive schema deps) automatically — no more manual schema lists, no forgotten modules.

  **Migration impact for existing operator deployments**

  Apply `0004_steady_molten_man.sql` (column + new tables, non-destructive aside from the deliberate `accessibility_needs` text → encrypted-jsonb move) and `0005_condemned_nomad.sql` (cruise booking-extension tables — only relevant when the cruises module is mounted).

### Patch Changes

- Updated dependencies [8932f60]
  - @voyant-travel/bookings@0.18.0
  - @voyant-travel/core@0.18.0
  - @voyant-travel/crm@0.18.0
  - @voyant-travel/db@0.18.0
  - @voyant-travel/hono@0.18.0
  - @voyant-travel/storage@0.18.0
  - @voyant-travel/suppliers@0.18.0
  - @voyant-travel/utils@0.18.0

## 0.17.0

### Minor Changes

- 66d722d: `resolveDb` callbacks in `createNotificationsHonoModule` and `createLegalHonoModule` now return `AnyDrizzleDb` (the `PostgresJsDatabase | NeonHttpDatabase` union from `@voyant-travel/db`) instead of strictly `PostgresJsDatabase`. Templates wiring `getDbFromHyperdrive` no longer need the `as unknown as PostgresJsDatabase` apology cast.

  New shared type alias `AnyDrizzleDb` exported from `@voyant-travel/db`. Also normalized three `bindings: unknown` parameter types to `bindings: Record<string, unknown>` in `packages/legal/src/contracts/routes.ts` (`resolveDocumentGenerator`, `resolveDocumentDownloadUrl`, `resolveEventBus`) — was previously inconsistent with the rest of the workspace.

### Patch Changes

- Updated dependencies [66d722d]
- Updated dependencies [66d722d]
- Updated dependencies [66d722d]
  - @voyant-travel/bookings@0.17.0
  - @voyant-travel/core@0.17.0
  - @voyant-travel/crm@0.17.0
  - @voyant-travel/db@0.17.0
  - @voyant-travel/hono@0.17.0
  - @voyant-travel/storage@0.17.0
  - @voyant-travel/suppliers@0.17.0
  - @voyant-travel/utils@0.17.0

## 0.16.0

### Patch Changes

- @voyant-travel/bookings@0.16.0
- @voyant-travel/core@0.16.0
- @voyant-travel/crm@0.16.0
- @voyant-travel/db@0.16.0
- @voyant-travel/hono@0.16.0
- @voyant-travel/storage@0.16.0
- @voyant-travel/suppliers@0.16.0
- @voyant-travel/utils@0.16.0

## 0.15.0

### Patch Changes

- @voyant-travel/bookings@0.15.0
- @voyant-travel/core@0.15.0
- @voyant-travel/crm@0.15.0
- @voyant-travel/db@0.15.0
- @voyant-travel/hono@0.15.0
- @voyant-travel/storage@0.15.0
- @voyant-travel/suppliers@0.15.0
- @voyant-travel/utils@0.15.0

## 0.14.0

### Patch Changes

- @voyant-travel/bookings@0.14.0
- @voyant-travel/core@0.14.0
- @voyant-travel/crm@0.14.0
- @voyant-travel/db@0.14.0
- @voyant-travel/hono@0.14.0
- @voyant-travel/storage@0.14.0
- @voyant-travel/suppliers@0.14.0
- @voyant-travel/utils@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [7dfbc05]
- Updated dependencies [15dda79]
  - @voyant-travel/bookings@0.13.0
  - @voyant-travel/core@0.13.0
  - @voyant-travel/crm@0.13.0
  - @voyant-travel/db@0.13.0
  - @voyant-travel/hono@0.13.0
  - @voyant-travel/storage@0.13.0
  - @voyant-travel/suppliers@0.13.0
  - @voyant-travel/utils@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies [944d244]
- Updated dependencies [cc561ce]
  - @voyant-travel/bookings@0.12.0
  - @voyant-travel/core@0.12.0
  - @voyant-travel/crm@0.12.0
  - @voyant-travel/db@0.12.0
  - @voyant-travel/hono@0.12.0
  - @voyant-travel/storage@0.12.0
  - @voyant-travel/suppliers@0.12.0
  - @voyant-travel/utils@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [fe905b0]
  - @voyant-travel/bookings@0.11.0
  - @voyant-travel/core@0.11.0
  - @voyant-travel/crm@0.11.0
  - @voyant-travel/db@0.11.0
  - @voyant-travel/hono@0.11.0
  - @voyant-travel/storage@0.11.0
  - @voyant-travel/suppliers@0.11.0
  - @voyant-travel/utils@0.11.0

## 0.10.0

### Minor Changes

- 29a581a: Add per-segment cancellation policy fan-out for multi-segment bookings (e.g. mid-stay room change with one flexible rate plan + one non-refundable rate plan).

  Ships:

  - `evaluateSegmentedCancellation(input)` — pure function, no I/O.
  - `policiesService.evaluateMultiPolicyCancellation(db, segments, input)` — DB variant that resolves each segment's rules from a `policyId` (deduplicated; one query per unique policy).
  - Types: `CancellationSegment`, `SegmentedCancellationInput`, `SegmentedCancellationResult` — aggregate totals + per-segment breakdown + `refundType` of `"mixed"` when segments resolve to different refund types (e.g. one full + one none).

  Single-policy `evaluateCancellationPolicy` couldn't represent the "partial refund per segment" case; this resolves it without touching the existing API.

### Patch Changes

- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [b7f0501]
  - @voyant-travel/bookings@0.10.0
  - @voyant-travel/core@0.10.0
  - @voyant-travel/crm@0.10.0
  - @voyant-travel/db@0.10.0
  - @voyant-travel/hono@0.10.0
  - @voyant-travel/storage@0.10.0
  - @voyant-travel/suppliers@0.10.0
  - @voyant-travel/utils@0.10.0

## 0.9.0

### Patch Changes

- @voyant-travel/bookings@0.9.0
- @voyant-travel/core@0.9.0
- @voyant-travel/crm@0.9.0
- @voyant-travel/db@0.9.0
- @voyant-travel/hono@0.9.0
- @voyant-travel/storage@0.9.0
- @voyant-travel/suppliers@0.9.0
- @voyant-travel/utils@0.9.0

## 0.8.0

### Minor Changes

- 24dc253: End-to-end contract generation workflow for the operator template. Four-PR batch riding together on the fixed train:

  **Template renderer filters (#270)** — Three new Liquid filters registered on `@voyant-travel/utils`' shared template engine: `currency`, `cents` (integer cents → currency string), `format_date` with short/medium/long/iso presets. Picked up automatically by `renderStructuredTemplate` consumers (`@voyant-travel/legal`, `@voyant-travel/notifications`).

  **Auto-generate on booking.confirmed (#271)** — `createLegalHonoModule` now accepts `autoGenerateContractOnConfirmed`: an opt-in subscriber that, on every `booking.confirmed` event, creates a contract against the configured template slug, renders its Liquid body with booking + traveler variables, and delegates to the configured PDF generator. Discriminated outcome (`template_not_found` / `template_version_missing` / `booking_not_found` / `contract_create_failed` / `document_failed` / `ok`) surfaces misconfigs at bootstrap. New `findTemplateBySlug` + `findSeriesByName` helpers on the template/series services. `@voyant-travel/legal` now depends on `@voyant-travel/bookings` (no cycle).

  **Booking contract card hook plumbing (#272)** — `@voyant-travel/legal-react` gains `generateDocument` + `regenerateDocument` mutations on `useLegalContractMutation`, `LegalContractsListFilters` now carries `bookingId` / `personId` / `organizationId` (already server-side-supported), new `legalContractGenerateDocumentResponse` schema. Paired registry component `voyant-legal-booking-contract-card` lists contracts for a booking with download + regenerate actions.

  **Operator wiring (#273)** — Operator template now resolves a PDF document generator from the `DOCUMENTS_BUCKET` R2 binding, enables `autoGenerateContractOnConfirmed` against slug `customer-sales-agreement`, and its seed script now writes a proper Liquid-templated contract body + a `contract_template_versions` row so the auto-generate flow resolves end-to-end from first confirm.

### Patch Changes

- Updated dependencies [24dc253]
  - @voyant-travel/bookings@0.8.0
  - @voyant-travel/core@0.8.0
  - @voyant-travel/crm@0.8.0
  - @voyant-travel/db@0.8.0
  - @voyant-travel/hono@0.8.0
  - @voyant-travel/storage@0.8.0
  - @voyant-travel/suppliers@0.8.0
  - @voyant-travel/utils@0.8.0

## 0.7.0

### Patch Changes

- @voyant-travel/core@0.7.0
- @voyant-travel/crm@0.7.0
- @voyant-travel/db@0.7.0
- @voyant-travel/hono@0.7.0
- @voyant-travel/storage@0.7.0
- @voyant-travel/suppliers@0.7.0
- @voyant-travel/utils@0.7.0

## 0.6.9

### Patch Changes

- @voyant-travel/core@0.6.9
- @voyant-travel/crm@0.6.9
- @voyant-travel/db@0.6.9
- @voyant-travel/hono@0.6.9
- @voyant-travel/storage@0.6.9
- @voyant-travel/suppliers@0.6.9
- @voyant-travel/utils@0.6.9

## 0.6.8

### Patch Changes

- b218885: Align legal child-list indexes with the active parent-and-sort query shapes for policy rules, contract signatures, and contract attachments.
- b218885: add legal root and admin list composite indexes
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
  - @voyant-travel/core@0.6.8
  - @voyant-travel/crm@0.6.8
  - @voyant-travel/db@0.6.8
  - @voyant-travel/hono@0.6.8
  - @voyant-travel/storage@0.6.8
  - @voyant-travel/suppliers@0.6.8
  - @voyant-travel/utils@0.6.8

## 0.6.7

### Patch Changes

- @voyant-travel/core@0.6.7
- @voyant-travel/crm@0.6.7
- @voyant-travel/db@0.6.7
- @voyant-travel/hono@0.6.7
- @voyant-travel/storage@0.6.7
- @voyant-travel/suppliers@0.6.7
- @voyant-travel/utils@0.6.7

## 0.6.6

### Patch Changes

- @voyant-travel/core@0.6.6
- @voyant-travel/crm@0.6.6
- @voyant-travel/db@0.6.6
- @voyant-travel/hono@0.6.6
- @voyant-travel/storage@0.6.6
- @voyant-travel/suppliers@0.6.6
- @voyant-travel/utils@0.6.6

## 0.6.5

### Patch Changes

- @voyant-travel/core@0.6.5
- @voyant-travel/crm@0.6.5
- @voyant-travel/db@0.6.5
- @voyant-travel/hono@0.6.5
- @voyant-travel/storage@0.6.5
- @voyant-travel/suppliers@0.6.5
- @voyant-travel/utils@0.6.5

## 0.6.4

### Patch Changes

- Updated dependencies [d6c4022]
  - @voyant-travel/core@0.6.4
  - @voyant-travel/crm@0.6.4
  - @voyant-travel/db@0.6.4
  - @voyant-travel/hono@0.6.4
  - @voyant-travel/storage@0.6.4
  - @voyant-travel/suppliers@0.6.4
  - @voyant-travel/utils@0.6.4

## 0.6.3

### Patch Changes

- Updated dependencies [d3c6937]
  - @voyant-travel/core@0.6.3
  - @voyant-travel/crm@0.6.3
  - @voyant-travel/db@0.6.3
  - @voyant-travel/hono@0.6.3
  - @voyant-travel/storage@0.6.3
  - @voyant-travel/suppliers@0.6.3
  - @voyant-travel/utils@0.6.3

## 0.6.2

### Patch Changes

- @voyant-travel/core@0.6.2
- @voyant-travel/crm@0.6.2
- @voyant-travel/db@0.6.2
- @voyant-travel/hono@0.6.2
- @voyant-travel/storage@0.6.2
- @voyant-travel/suppliers@0.6.2
- @voyant-travel/utils@0.6.2

## 0.6.1

### Patch Changes

- @voyant-travel/core@0.6.1
- @voyant-travel/crm@0.6.1
- @voyant-travel/db@0.6.1
- @voyant-travel/hono@0.6.1
- @voyant-travel/storage@0.6.1
- @voyant-travel/suppliers@0.6.1
- @voyant-travel/utils@0.6.1

## 0.6.0

### Patch Changes

- @voyant-travel/core@0.6.0
- @voyant-travel/crm@0.6.0
- @voyant-travel/db@0.6.0
- @voyant-travel/hono@0.6.0
- @voyant-travel/storage@0.6.0
- @voyant-travel/suppliers@0.6.0
- @voyant-travel/utils@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [ce72e29]
  - @voyant-travel/core@0.5.0
  - @voyant-travel/crm@0.5.0
  - @voyant-travel/db@0.5.0
  - @voyant-travel/hono@0.5.0
  - @voyant-travel/storage@0.5.0
  - @voyant-travel/suppliers@0.5.0
  - @voyant-travel/utils@0.5.0

## 0.4.5

### Patch Changes

- e3f6e72: Standardize TypeID prefixes to a first-N-chars convention for better DX.

  Root entities now use the shortest unambiguous first-N chars of the entity name
  (e.g. `pers` instead of `prsn`, `org` instead of `orgn`). Child entities use a
  2-char module code plus 2-char suffix. 19 prefixes renamed in total.

- Updated dependencies [e3f6e72]
  - @voyant-travel/core@0.4.5
  - @voyant-travel/crm@0.4.5
  - @voyant-travel/db@0.4.5
  - @voyant-travel/hono@0.4.5
  - @voyant-travel/storage@0.4.5
  - @voyant-travel/suppliers@0.4.5
  - @voyant-travel/utils@0.4.5

## 0.4.4

### Patch Changes

- @voyant-travel/core@0.4.4
- @voyant-travel/crm@0.4.4
- @voyant-travel/db@0.4.4
- @voyant-travel/hono@0.4.4
- @voyant-travel/storage@0.4.4
- @voyant-travel/suppliers@0.4.4
- @voyant-travel/utils@0.4.4

## 0.4.3

### Patch Changes

- @voyant-travel/core@0.4.3
- @voyant-travel/crm@0.4.3
- @voyant-travel/db@0.4.3
- @voyant-travel/hono@0.4.3
- @voyant-travel/storage@0.4.3
- @voyant-travel/suppliers@0.4.3
- @voyant-travel/utils@0.4.3

## 0.4.2

### Patch Changes

- 8de4602: Add optional event-bus hooks around document primitives.

  - `@voyant-travel/legal` contract document generation routes/services can now emit
    `contract.document.generated`
  - `@voyant-travel/finance` invoice document generation can emit
    `invoice.document.generated`, and settlement reconciliation can emit
    `invoice.settled`
  - `@voyant-travel/notifications` booking document sends can emit
    `booking.documents.sent`

  These stay at the primitive layer so apps can orchestrate their own document
  policies without Voyant owning the full workflow.

  - @voyant-travel/core@0.4.2
  - @voyant-travel/crm@0.4.2
  - @voyant-travel/db@0.4.2
  - @voyant-travel/hono@0.4.2
  - @voyant-travel/storage@0.4.2
  - @voyant-travel/suppliers@0.4.2
  - @voyant-travel/utils@0.4.2

## 0.4.1

### Patch Changes

- @voyant-travel/core@0.4.1
- @voyant-travel/crm@0.4.1
- @voyant-travel/db@0.4.1
- @voyant-travel/hono@0.4.1
- @voyant-travel/storage@0.4.1
- @voyant-travel/suppliers@0.4.1
- @voyant-travel/utils@0.4.1

## 0.4.0

### Patch Changes

- e84fe0f: Add built-in PDF document adapters for legal and finance workflows.

  `@voyant-travel/utils` now exports `renderPdfDocument()` as a shared basic PDF
  renderer for rendered text content. `@voyant-travel/legal` and `@voyant-travel/finance`
  now expose bundled PDF serializers and generator helpers on top of their
  storage-backed document workflows, so apps can generate readable PDF artifacts
  without wiring a custom browser renderer for the common case.

- e84fe0f: Add a first-class contract document generation workflow to legal.

  - add configurable admin routes for `generate-document` and
    `regenerate-document`
  - add `createLegalHonoModule()` so apps can mount legal with a document
    generator
  - generate and replace canonical `contract_attachments` rows for rendered
    contract artifacts
  - expose the new document-generation schemas and route factories from the
    package entrypoint

- e84fe0f: Upgrade legal and finance template rendering to support Liquid-style control
  flow.

  - add a shared structured template renderer in `@voyant-travel/utils`
  - keep simple `{{path}}` interpolation compatibility for existing templates
  - support Liquid loops, conditionals, and filters in legal and finance
    html/markdown templates
  - support Liquid rendering inside lexical text nodes for legal and finance
    template bodies

- e84fe0f: Add storage-backed document generator helpers for legal and finance workflows.

  `@voyant-travel/legal` now exports `createStorageBackedContractDocumentGenerator()`
  and `defaultStorageBackedContractDocumentSerializer()` so rendered contract
  artifacts can be uploaded through Voyant storage providers without custom
  generator plumbing.

  `@voyant-travel/finance` now exports
  `createStorageBackedInvoiceDocumentGenerator()` and
  `defaultStorageBackedInvoiceDocumentSerializer()` for the same workflow on
  invoice/proforma renditions, with built-in support for html/json/xml artifact
  uploads and explicit opt-in for custom PDF serializers.

- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
- Updated dependencies [2d5f323]
- Updated dependencies [e84fe0f]
  - @voyant-travel/core@0.4.0
  - @voyant-travel/crm@0.4.0
  - @voyant-travel/db@0.4.0
  - @voyant-travel/hono@0.4.0
  - @voyant-travel/storage@0.4.0
  - @voyant-travel/suppliers@0.4.0
  - @voyant-travel/utils@0.4.0

## 0.3.1

### Patch Changes

- 8566f2d: Advance the public storefront surface with phone contact-exists support in the
  customer portal, default-template and preview helpers in legal, localized slug
  and SEO catalog fields in products, and a new config-backed storefront settings
  module for booking/account pages.
- Updated dependencies [8566f2d]
- Updated dependencies [8566f2d]
  - @voyant-travel/core@0.3.1
  - @voyant-travel/crm@0.3.1
  - @voyant-travel/db@0.3.1
  - @voyant-travel/hono@0.3.1
  - @voyant-travel/suppliers@0.3.1

## 0.3.0

### Patch Changes

- @voyant-travel/core@0.3.0
- @voyant-travel/crm@0.3.0
- @voyant-travel/db@0.3.0
- @voyant-travel/hono@0.3.0
- @voyant-travel/suppliers@0.3.0

## 0.2.0

### Patch Changes

- @voyant-travel/core@0.2.0
- @voyant-travel/crm@0.2.0
- @voyant-travel/db@0.2.0
- @voyant-travel/hono@0.2.0
- @voyant-travel/suppliers@0.2.0

## 0.1.1

### Patch Changes

- @voyant-travel/core@0.1.1
- @voyant-travel/crm@0.1.1
- @voyant-travel/db@0.1.1
- @voyant-travel/hono@0.1.1
- @voyant-travel/suppliers@0.1.1
