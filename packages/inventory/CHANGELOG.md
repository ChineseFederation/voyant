# @voyant-travel/inventory

## 0.19.6

### Patch Changes

- @voyant-travel/bookings@0.202.0
- @voyant-travel/catalog@0.200.0
- @voyant-travel/finance@0.202.0
- @voyant-travel/commerce@0.43.3
- @voyant-travel/relationships@0.131.5
- @voyant-travel/operations@0.8.45
- @voyant-travel/operator-settings@0.14.23

## 0.19.5

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
  - @voyant-travel/catalog@0.199.1
  - @voyant-travel/commerce@0.43.2
  - @voyant-travel/finance@0.201.1
  - @voyant-travel/relationships@0.131.4
  - @voyant-travel/operations@0.8.44
  - @voyant-travel/operator-settings@0.14.22

## 0.19.4

### Patch Changes

- Updated dependencies [5e03ae7]
  - @voyant-travel/finance@0.201.0
  - @voyant-travel/catalog@0.199.0
  - @voyant-travel/commerce@0.43.1
  - @voyant-travel/operator-settings@0.14.21
  - @voyant-travel/bookings@0.201.0
  - @voyant-travel/operations@0.8.43
  - @voyant-travel/relationships@0.131.3

## 0.19.3

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/catalog@0.198.0
  - @voyant-travel/commerce@0.43.0
  - @voyant-travel/core@0.136.0
  - @voyant-travel/storage@0.114.0
  - @voyant-travel/utils@0.110.0
  - @voyant-travel/operations@0.8.42
  - @voyant-travel/operator-settings@0.14.20
  - @voyant-travel/action-ledger@0.113.2
  - @voyant-travel/bookings@0.200.0
  - @voyant-travel/db@0.118.5
  - @voyant-travel/finance@0.200.0
  - @voyant-travel/hono@0.134.5
  - @voyant-travel/relationships@0.131.2
  - @voyant-travel/products-contracts@0.107.10

## 0.19.2

### Patch Changes

- Updated dependencies [3651ff7]
- Updated dependencies [c03ff60]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/catalog@0.197.0
  - @voyant-travel/action-ledger@0.113.1
  - @voyant-travel/bookings@0.199.0
  - @voyant-travel/commerce@0.42.2
  - @voyant-travel/db@0.118.4
  - @voyant-travel/finance@0.199.0
  - @voyant-travel/hono@0.134.4
  - @voyant-travel/operations@0.8.41
  - @voyant-travel/operator-settings@0.14.19
  - @voyant-travel/relationships@0.131.1
  - @voyant-travel/storage@0.113.6

## 0.19.1

### Patch Changes

- e2cb9f5: Expand the products list Filters with Type, Booking mode, Visibility, Tag, and a
  Departure window. Type/Booking mode/Visibility/Tag reuse query params the list
  endpoint already supported; the Departure window is a new `departureFrom`/
  `departureTo` query param that keeps only products with an upcoming open
  departure whose date falls in the chosen range (filtered on availability slots,
  independent of the product's own start date).
- Updated dependencies [e2cb9f5]
  - @voyant-travel/products-contracts@0.107.9
  - @voyant-travel/bookings@0.198.1
  - @voyant-travel/catalog@0.196.1
  - @voyant-travel/finance@0.198.1

## 0.19.0

### Patch Changes

- Updated dependencies [c7459a2]
  - @voyant-travel/relationships@0.131.0
  - @voyant-travel/bookings@0.198.0
  - @voyant-travel/catalog@0.196.0
  - @voyant-travel/finance@0.198.0
  - @voyant-travel/commerce@0.42.1
  - @voyant-travel/operations@0.8.40
  - @voyant-travel/operator-settings@0.14.18

## 0.18.0

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
  - @voyant-travel/catalog@0.195.0
  - @voyant-travel/db@0.118.3
  - @voyant-travel/hono@0.134.3
  - @voyant-travel/operations@0.8.39
  - @voyant-travel/operator-settings@0.14.17
  - @voyant-travel/storage@0.113.5

## 0.17.0

### Minor Changes

- 0190317: Make product, product-composition, MICE-program, trip, and room-block creation
  Tools use handler-owned atomic created-target command claims with exact replay
  and drift conflicts.
- bf548af: Make generated-child Tool creation retry-safe by binding each command to an
  explicit stable parent anchor, admitting the selected graph action in the
  handler, and atomically persisting the command claim, child row, and canonical
  child reference.

### Patch Changes

- Updated dependencies [78423d3]
- Updated dependencies [bba4fec]
- Updated dependencies [c1f9cdf]
- Updated dependencies [58020ec]
- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
- Updated dependencies
  - @voyant-travel/commerce@0.41.0
  - @voyant-travel/relationships@0.129.0
  - @voyant-travel/action-ledger@0.112.0
  - @voyant-travel/catalog@0.194.0
  - @voyant-travel/finance@0.196.0
  - @voyant-travel/bookings@0.196.0
  - @voyant-travel/core@0.133.0
  - @voyant-travel/tools@0.4.0
  - @voyant-travel/operator-settings@0.14.16
  - @voyant-travel/operations@0.8.38
  - @voyant-travel/db@0.118.2
  - @voyant-travel/hono@0.134.2
  - @voyant-travel/storage@0.113.4

## 0.16.2

### Patch Changes

- Updated dependencies [e3a1e17]
  - @voyant-travel/bookings@0.195.0
  - @voyant-travel/catalog@0.193.0
  - @voyant-travel/commerce@0.40.6
  - @voyant-travel/finance@0.195.0
  - @voyant-travel/relationships@0.128.36
  - @voyant-travel/operations@0.8.37
  - @voyant-travel/operator-settings@0.14.15

## 0.16.1

### Patch Changes

- dd370ca: Add a provider-agnostic, durable catalog product reindex job that walks canonical inventory
  products in bounded pages and rebuilds their projections through the selected indexer runtime.
  Product job hosts now pass concrete deployment bindings to fixed job runtimes.
- Updated dependencies [dd370ca]
  - @voyant-travel/catalog@0.192.0
  - @voyant-travel/core@0.132.1
  - @voyant-travel/commerce@0.40.5
  - @voyant-travel/operations@0.8.36
  - @voyant-travel/bookings@0.194.0
  - @voyant-travel/finance@0.194.0
  - @voyant-travel/relationships@0.128.35
  - @voyant-travel/operator-settings@0.14.14

## 0.16.0

### Minor Changes

- 90d44c0: Add the operator editorial-overlay editor for sourced products: configured-locale switching, side-by-side provider/overlay/effective comparison on wide screens with an accessible tabbed compare on narrow ones, overlay-only translation authoring, media-library-backed image overlays, customer preview, confirmed clear, and optimistic-concurrency conflict reporting.

  The product editorial-overlay admin read model now enumerates every eligible field (not only fields that already carry an overlay) and reports per-field `exact`, `language-fallback`, `source-fallback`, `overlaid`, `overlay-only`, `missing`, `invalid`, and `orphaned` state plus drift against the provider's last source update, the cached source locales, and whether the entity is provider-sourced.

  `useLocale()` now exposes the deployment's `supportedLocales`, and the catalog overlay service exposes `fetchOverlayRowsForEntity` for admin surfaces that need overlay audit columns.

### Patch Changes

- a43267a: Add node-aware localized editorial overlays for sourced product content, including stable content-node targeting, optimistic overlay versions, audit history, product admin read/write/clear routes, and public provenance redaction.

  Tighten editorial overlay scope isolation for product content reads and writes, require admin overlay mutations to carry an authenticated user id, and make overlay mutations/history atomic with race-safe optimistic version checks.

- 2c79bef: Add referenced presentation-subject overlay support for cruise ships and accommodation properties.
- Updated dependencies [a43267a]
- Updated dependencies [90d44c0]
- Updated dependencies [2c79bef]
  - @voyant-travel/catalog@0.191.0
  - @voyant-travel/products-contracts@0.107.8
  - @voyant-travel/bookings@0.193.0
  - @voyant-travel/finance@0.193.0
  - @voyant-travel/commerce@0.40.4
  - @voyant-travel/operations@0.8.35
  - @voyant-travel/relationships@0.128.34
  - @voyant-travel/operator-settings@0.14.13

## 0.15.4

### Patch Changes

- 130f62c: Expose owned-product SEO metadata and Open Graph images through the product admin and storefront surfaces.
- Updated dependencies [130f62c]
  - @voyant-travel/products-contracts@0.107.7

## 0.15.3

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/action-ledger@0.111.14
  - @voyant-travel/bookings@0.192.1
  - @voyant-travel/catalog@0.190.1
  - @voyant-travel/commerce@0.40.3
  - @voyant-travel/db@0.118.1
  - @voyant-travel/finance@0.192.1
  - @voyant-travel/hono@0.134.1
  - @voyant-travel/operations@0.8.34
  - @voyant-travel/operator-settings@0.14.12
  - @voyant-travel/relationships@0.128.33
  - @voyant-travel/storage@0.113.3

## 0.15.2

### Patch Changes

- Updated dependencies [e68a705]
  - @voyant-travel/finance@0.192.0
  - @voyant-travel/operator-settings@0.14.11
  - @voyant-travel/bookings@0.192.0
  - @voyant-travel/catalog@0.190.0
  - @voyant-travel/commerce@0.40.2
  - @voyant-travel/relationships@0.128.32
  - @voyant-travel/operations@0.8.33

## 0.15.1

### Patch Changes

- Updated dependencies [f6aa3a1]
  - @voyant-travel/finance@0.191.0
  - @voyant-travel/catalog@0.189.0
  - @voyant-travel/commerce@0.40.1
  - @voyant-travel/operator-settings@0.14.10
  - @voyant-travel/bookings@0.191.0
  - @voyant-travel/operations@0.8.32
  - @voyant-travel/relationships@0.128.31

## 0.15.0

### Minor Changes

- f945310: Migrate the event outbox, channel push, promotion reindex, and product PDF
  surfaces away from general workflows. Package-owned jobs are payload-free and
  recover from durable domain records; product PDF generation remains an
  authenticated, idempotent brochure command. The Node job host now exposes an
  origin-trusted immutable inventory and best-effort terminal health reporting.

### Patch Changes

- Updated dependencies [228b57d]
- Updated dependencies [f945310]
- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/bookings@0.190.0
  - @voyant-travel/catalog@0.188.0
  - @voyant-travel/commerce@0.40.0
  - @voyant-travel/db@0.118.0
  - @voyant-travel/core@0.131.0
  - @voyant-travel/hono@0.134.0
  - @voyant-travel/finance@0.190.0
  - @voyant-travel/relationships@0.128.30
  - @voyant-travel/operations@0.8.31
  - @voyant-travel/operator-settings@0.14.9
  - @voyant-travel/action-ledger@0.111.13
  - @voyant-travel/types@0.109.9
  - @voyant-travel/storage@0.113.2

## 0.14.28

### Patch Changes

- Updated dependencies [d9ff078]
  - @voyant-travel/catalog@0.187.0
  - @voyant-travel/commerce@0.39.25
  - @voyant-travel/operations@0.8.30
  - @voyant-travel/products-contracts@0.107.6
  - @voyant-travel/bookings@0.189.0
  - @voyant-travel/finance@0.189.0
  - @voyant-travel/relationships@0.128.29
  - @voyant-travel/operator-settings@0.14.8

## 0.14.27

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0
  - @voyant-travel/utils@0.109.0
  - @voyant-travel/action-ledger@0.111.11
  - @voyant-travel/bookings@0.188.0
  - @voyant-travel/catalog@0.186.0
  - @voyant-travel/commerce@0.39.24
  - @voyant-travel/finance@0.188.0
  - @voyant-travel/operations@0.8.29
  - @voyant-travel/operator-settings@0.14.7
  - @voyant-travel/relationships@0.128.28
  - @voyant-travel/workflows@0.122.18

## 0.14.26

### Patch Changes

- 406cebb: Persist accepted owned-product quote amounts on booking item lines so invoice generation receives an exact non-zero line total, including add-ons, tax modes, overrides, and cent rounding.

## 0.14.25

### Patch Changes

- Updated dependencies [d8a225c]
  - @voyant-travel/storage@0.113.0
  - @voyant-travel/finance@0.187.1

## 0.14.24

### Patch Changes

- @voyant-travel/bookings@0.187.0
- @voyant-travel/catalog@0.185.0
- @voyant-travel/finance@0.187.0
- @voyant-travel/commerce@0.39.23
- @voyant-travel/relationships@0.128.27
- @voyant-travel/operations@0.8.28
- @voyant-travel/operator-settings@0.14.6

## 0.14.23

### Patch Changes

- 11f58b0: Price rooms whose unit price is set per traveler category. The product editor's "Rooms & prices" matrix stores a room's price per traveler type (e.g. Double / Adult), and the booking engine previously dropped every unit-price row that carried a `pricingCategoryId` — so such products quoted `no_sell_amount_configured` and could not be priced or booked through the journey. Per-category room prices now resolve to their band and charge per person (`pax[band] × price`); category-less room prices, pax tiers, and the product-base fallback are unchanged.

## 0.14.22

### Patch Changes

- @voyant-travel/bookings@0.186.0
- @voyant-travel/catalog@0.184.0
- @voyant-travel/finance@0.186.0
- @voyant-travel/commerce@0.39.22
- @voyant-travel/relationships@0.128.26
- @voyant-travel/operations@0.8.27
- @voyant-travel/operator-settings@0.14.5

## 0.14.21

### Patch Changes

- Updated dependencies [e7e90bf]
  - @voyant-travel/finance@0.185.0
  - @voyant-travel/catalog@0.183.0
  - @voyant-travel/commerce@0.39.21
  - @voyant-travel/operator-settings@0.14.4
  - @voyant-travel/bookings@0.185.0
  - @voyant-travel/operations@0.8.26
  - @voyant-travel/relationships@0.128.25

## 0.14.20

### Patch Changes

- a33c590: Add a "Choose from Media Library" action to the product media section so
  operators can attach existing library assets to a product or itinerary day
  instead of only uploading new files. Product media now records the source
  asset reference (`assetId`) alongside the derived byte URL, kind, mime type,
  and size.
- Updated dependencies [a33c590]
  - @voyant-travel/products-contracts@0.107.5
  - @voyant-travel/bookings@0.184.0
  - @voyant-travel/catalog@0.182.0
  - @voyant-travel/finance@0.184.0
  - @voyant-travel/commerce@0.39.20
  - @voyant-travel/relationships@0.128.24
  - @voyant-travel/operations@0.8.25
  - @voyant-travel/operator-settings@0.14.3

## 0.14.19

### Patch Changes

- @voyant-travel/finance@0.183.0
- @voyant-travel/operator-settings@0.14.2
- @voyant-travel/bookings@0.183.0
- @voyant-travel/catalog@0.181.0
- @voyant-travel/commerce@0.39.19
- @voyant-travel/relationships@0.128.23
- @voyant-travel/operations@0.8.24

## 0.14.18

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0
  - @voyant-travel/action-ledger@0.111.10
  - @voyant-travel/bookings@0.182.1
  - @voyant-travel/catalog@0.180.1
  - @voyant-travel/commerce@0.39.18
  - @voyant-travel/finance@0.182.3
  - @voyant-travel/operations@0.8.23
  - @voyant-travel/operator-settings@0.14.1
  - @voyant-travel/relationships@0.128.22
  - @voyant-travel/workflows@0.122.15

## 0.14.17

### Patch Changes

- Updated dependencies [225000a]
  - @voyant-travel/operator-settings@0.14.0
  - @voyant-travel/finance@0.182.2

## 0.14.16

### Patch Changes

- Updated dependencies [bcd7ad0]
  - @voyant-travel/storage@0.112.0
  - @voyant-travel/finance@0.182.1

## 0.14.15

### Patch Changes

- @voyant-travel/bookings@0.182.0
- @voyant-travel/catalog@0.180.0
- @voyant-travel/finance@0.182.0
- @voyant-travel/commerce@0.39.17
- @voyant-travel/relationships@0.128.21
- @voyant-travel/operations@0.8.22
- @voyant-travel/operator-settings@0.13.1

## 0.14.14

### Patch Changes

- Updated dependencies [0fa5feb]
  - @voyant-travel/operator-settings@0.13.0

## 0.14.13

### Patch Changes

- Updated dependencies [464815c]
- Updated dependencies [464815c]
  - @voyant-travel/operator-settings@0.12.0
  - @voyant-travel/finance@0.181.0
  - @voyant-travel/bookings@0.181.0
  - @voyant-travel/catalog@0.179.0
  - @voyant-travel/commerce@0.39.16
  - @voyant-travel/relationships@0.128.20
  - @voyant-travel/operations@0.8.21

## 0.14.12

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/operator-settings@0.11.0
  - @voyant-travel/finance@0.180.1
  - @voyant-travel/db@0.117.1
  - @voyant-travel/products-contracts@0.107.4
  - @voyant-travel/bookings@0.180.1
  - @voyant-travel/catalog@0.178.1
  - @voyant-travel/workflows@0.122.14

## 0.14.11

### Patch Changes

- @voyant-travel/bookings@0.180.0
- @voyant-travel/catalog@0.178.0
- @voyant-travel/finance@0.180.0
- @voyant-travel/workflows@0.122.13
- @voyant-travel/commerce@0.39.15
- @voyant-travel/relationships@0.128.19
- @voyant-travel/operations@0.8.20
- @voyant-travel/operator-settings@0.10.11

## 0.14.10

### Patch Changes

- @voyant-travel/bookings@0.179.0
- @voyant-travel/catalog@0.177.0
- @voyant-travel/finance@0.179.0
- @voyant-travel/commerce@0.39.14
- @voyant-travel/relationships@0.128.18
- @voyant-travel/operations@0.8.19
- @voyant-travel/operator-settings@0.10.10

## 0.14.9

### Patch Changes

- @voyant-travel/bookings@0.178.0
- @voyant-travel/catalog@0.176.0
- @voyant-travel/finance@0.178.0
- @voyant-travel/workflows@0.122.12
- @voyant-travel/commerce@0.39.13
- @voyant-travel/relationships@0.128.17
- @voyant-travel/operations@0.8.18
- @voyant-travel/operator-settings@0.10.9

## 0.14.8

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/action-ledger@0.111.9
  - @voyant-travel/bookings@0.177.0
  - @voyant-travel/catalog@0.175.0
  - @voyant-travel/commerce@0.39.12
  - @voyant-travel/finance@0.177.0
  - @voyant-travel/hono@0.131.2
  - @voyant-travel/operations@0.8.17
  - @voyant-travel/operator-settings@0.10.8
  - @voyant-travel/relationships@0.128.16
  - @voyant-travel/types@0.109.8
  - @voyant-travel/workflows@0.122.11

## 0.14.7

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0
  - @voyant-travel/action-ledger@0.111.8
  - @voyant-travel/bookings@0.176.0
  - @voyant-travel/catalog@0.174.0
  - @voyant-travel/commerce@0.39.11
  - @voyant-travel/finance@0.176.0
  - @voyant-travel/hono@0.131.1
  - @voyant-travel/operations@0.8.16
  - @voyant-travel/operator-settings@0.10.7
  - @voyant-travel/relationships@0.128.15
  - @voyant-travel/types@0.109.7
  - @voyant-travel/workflows@0.122.10

## 0.14.6

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/bookings@0.175.0
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/catalog@0.173.0
  - @voyant-travel/commerce@0.39.10
  - @voyant-travel/finance@0.175.0
  - @voyant-travel/relationships@0.128.14
  - @voyant-travel/action-ledger@0.111.7
  - @voyant-travel/operations@0.8.15
  - @voyant-travel/operator-settings@0.10.6
  - @voyant-travel/storage@0.111.6
  - @voyant-travel/types@0.109.6
  - @voyant-travel/workflows@0.122.9

## 0.14.5

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/bookings@0.174.0
  - @voyant-travel/finance@0.174.0
  - @voyant-travel/action-ledger@0.111.6
  - @voyant-travel/catalog@0.172.0
  - @voyant-travel/commerce@0.39.9
  - @voyant-travel/db@0.114.15
  - @voyant-travel/hono@0.130.1
  - @voyant-travel/operations@0.8.14
  - @voyant-travel/operator-settings@0.10.5
  - @voyant-travel/relationships@0.128.13
  - @voyant-travel/storage@0.111.5
  - @voyant-travel/workflows@0.122.8

## 0.14.4

### Patch Changes

- @voyant-travel/bookings@0.173.0
- @voyant-travel/catalog@0.171.0
- @voyant-travel/finance@0.173.0
- @voyant-travel/commerce@0.39.8
- @voyant-travel/relationships@0.128.12
- @voyant-travel/operations@0.8.13
- @voyant-travel/operator-settings@0.10.4

## 0.14.3

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/bookings@0.172.0
  - @voyant-travel/core@0.128.0
  - @voyant-travel/finance@0.172.0
  - @voyant-travel/hono@0.130.0
  - @voyant-travel/utils@0.108.0
  - @voyant-travel/catalog@0.170.0
  - @voyant-travel/commerce@0.39.7
  - @voyant-travel/relationships@0.128.11
  - @voyant-travel/action-ledger@0.111.5
  - @voyant-travel/db@0.114.14
  - @voyant-travel/operations@0.8.12
  - @voyant-travel/operator-settings@0.10.3
  - @voyant-travel/storage@0.111.4
  - @voyant-travel/workflows@0.122.7

## 0.14.2

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0
  - @voyant-travel/action-ledger@0.111.4
  - @voyant-travel/bookings@0.171.1
  - @voyant-travel/catalog@0.169.1
  - @voyant-travel/commerce@0.39.6
  - @voyant-travel/finance@0.171.1
  - @voyant-travel/operations@0.8.11
  - @voyant-travel/operator-settings@0.10.2
  - @voyant-travel/relationships@0.128.10
  - @voyant-travel/workflows@0.122.6

## 0.14.1

### Patch Changes

- Updated dependencies [d2d7384]
  - @voyant-travel/finance@0.171.0
  - @voyant-travel/catalog@0.169.0
  - @voyant-travel/commerce@0.39.5
  - @voyant-travel/operator-settings@0.10.1
  - @voyant-travel/bookings@0.171.0
  - @voyant-travel/operations@0.8.10
  - @voyant-travel/relationships@0.128.9

## 0.14.0

### Minor Changes

- 117fa05: Generate managed-deployment contracts from operator-authored default templates and number series without deployment-specific workflows. Add reusable light- and dark-mode horizontal logo and icon assets to Operator Profile, expose them to contract templates, and provide accessible drag-and-drop upload controls. Introduce a shared document-renderer port and zero-code HTTP adapter so managed deployments can use a private platform renderer while self-hosters can swap in their own renderer for contracts and brochures.

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/operator-settings@0.10.0
  - @voyant-travel/action-ledger@0.111.3
  - @voyant-travel/bookings@0.170.0
  - @voyant-travel/catalog@0.168.0
  - @voyant-travel/commerce@0.39.4
  - @voyant-travel/db@0.114.13
  - @voyant-travel/finance@0.170.0
  - @voyant-travel/hono@0.128.6
  - @voyant-travel/operations@0.8.9
  - @voyant-travel/relationships@0.128.8
  - @voyant-travel/storage@0.111.3
  - @voyant-travel/workflows@0.122.5

## 0.13.7

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/action-ledger@0.111.2
  - @voyant-travel/bookings@0.169.1
  - @voyant-travel/catalog@0.167.1
  - @voyant-travel/commerce@0.39.3
  - @voyant-travel/db@0.114.11
  - @voyant-travel/finance@0.169.2
  - @voyant-travel/hono@0.128.4
  - @voyant-travel/operations@0.8.8
  - @voyant-travel/operator-settings@0.9.2
  - @voyant-travel/relationships@0.128.7
  - @voyant-travel/storage@0.111.2
  - @voyant-travel/workflows@0.122.4

## 0.13.6

### Patch Changes

- 590d256: Republish with dependency ranges resolved. The prior tarballs for these packages
  carry raw `workspace:` specifiers (they were published outside the pnpm-aware
  release flow) and cannot be installed by consumers. Also fixes the `runtime`
  package's `prepack`, which rebuilt the entire workspace dependency closure on
  every publish — the slow build stalled the release train's publish step past its
  timeout and wedged the whole batch. `prepack` now builds only the package itself,
  matching every other package.
- Updated dependencies [590d256]
  - @voyant-travel/finance@0.169.0
  - @voyant-travel/commerce@0.39.2
  - @voyant-travel/operations@0.8.7
  - @voyant-travel/bookings@0.169.0
  - @voyant-travel/catalog@0.167.0
  - @voyant-travel/operator-settings@0.9.1
  - @voyant-travel/relationships@0.128.6

## 0.13.5

### Patch Changes

- Updated dependencies [158c3a0]
  - @voyant-travel/finance@0.168.0
  - @voyant-travel/operator-settings@0.9.0
  - @voyant-travel/catalog@0.166.0
  - @voyant-travel/commerce@0.39.1
  - @voyant-travel/bookings@0.168.0
  - @voyant-travel/operations@0.8.6
  - @voyant-travel/relationships@0.128.5

## 0.13.4

### Patch Changes

- Updated dependencies [ca3713e]
  - @voyant-travel/commerce@0.39.0
  - @voyant-travel/finance@0.167.0
  - @voyant-travel/operator-settings@0.8.0
  - @voyant-travel/catalog@0.165.0
  - @voyant-travel/bookings@0.167.0
  - @voyant-travel/operations@0.8.5
  - @voyant-travel/relationships@0.128.4

## 0.13.3

### Patch Changes

- Updated dependencies [c3bdcbc]
- Updated dependencies [3062a73]
- Updated dependencies [926ea47]
  - @voyant-travel/commerce@0.38.0
  - @voyant-travel/finance@0.166.0
  - @voyant-travel/operator-settings@0.7.0
  - @voyant-travel/catalog@0.164.0
  - @voyant-travel/bookings@0.166.0
  - @voyant-travel/workflows@0.122.3
  - @voyant-travel/operations@0.8.4
  - @voyant-travel/relationships@0.128.3

## 0.13.2

### Patch Changes

- Updated dependencies [d6a9973]
  - @voyant-travel/finance@0.165.0
  - @voyant-travel/operator-settings@0.6.0
  - @voyant-travel/catalog@0.163.0
  - @voyant-travel/commerce@0.37.3
  - @voyant-travel/bookings@0.165.0
  - @voyant-travel/operations@0.8.3
  - @voyant-travel/relationships@0.128.2

## 0.13.1

### Patch Changes

- Updated dependencies [fc3224a]
  - @voyant-travel/catalog@0.162.0
  - @voyant-travel/commerce@0.37.2
  - @voyant-travel/operations@0.8.2
  - @voyant-travel/bookings@0.164.0
  - @voyant-travel/finance@0.164.0
  - @voyant-travel/relationships@0.128.1
  - @voyant-travel/operator-settings@0.5.2

## 0.13.0

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
  - @voyant-travel/catalog@0.161.0
  - @voyant-travel/commerce@0.37.1
  - @voyant-travel/action-ledger@0.111.1
  - @voyant-travel/db@0.114.9
  - @voyant-travel/hono@0.128.1
  - @voyant-travel/operations@0.8.1
  - @voyant-travel/operator-settings@0.5.1
  - @voyant-travel/storage@0.111.1
  - @voyant-travel/products-contracts@0.107.3
  - @voyant-travel/workflows@0.122.2

## 0.12.1

### Patch Changes

- Updated dependencies [5941d2c]
  - @voyant-travel/action-ledger@0.111.0
  - @voyant-travel/bookings@0.162.1
  - @voyant-travel/finance@0.162.1
  - @voyant-travel/relationships@0.127.1

## 0.12.0

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
  - @voyant-travel/catalog@0.160.0
  - @voyant-travel/commerce@0.37.0
  - @voyant-travel/finance@0.162.0
  - @voyant-travel/hono@0.128.0
  - @voyant-travel/operations@0.8.0
  - @voyant-travel/operator-settings@0.5.0
  - @voyant-travel/relationships@0.127.0
  - @voyant-travel/storage@0.111.0
  - @voyant-travel/workflows@0.122.0
  - @voyant-travel/db@0.114.8

## 0.11.1

### Patch Changes

- Updated dependencies [85bfe2c]
- Updated dependencies [a1842a7]
- Updated dependencies [85bfe2c]
  - @voyant-travel/finance@0.161.0
  - @voyant-travel/hono@0.127.2
  - @voyant-travel/action-ledger@0.109.1
  - @voyant-travel/bookings@0.161.0
  - @voyant-travel/catalog@0.159.0
  - @voyant-travel/commerce@0.36.1
  - @voyant-travel/operator-settings@0.4.1
  - @voyant-travel/relationships@0.126.1
  - @voyant-travel/operations@0.7.1

## 0.11.0

### Minor Changes

- a2fd806: Add package-owned MCP Tools for atomic product composition, composed booking creation,
  and approval-gated invoice/proforma issue from bookings. Reuse the existing domain
  orchestrators, structural schemas, mutation ledgers, and post-commit events, and make
  approved invoice execution exactly idempotent.
- 7e4ab07: Add guarded MCP Tools for product extras and option-level extra configuration.

### Patch Changes

- 372f4f4: Add a separately selectable Operations-owned dashboard Tool that composes the real aggregate
  services from Bookings, Finance, Inventory, Distribution, and Operations without crossing domain
  persistence boundaries. Require every underlying read scope and return structural source
  projections, KPIs, and bounded alerts.

  Complete the Quotes proposal lifecycle Tool surface with snapshot, send, accept, and decline
  capabilities, structural JSON-safe outputs, compatibility aliases, staff-only grants,
  confirmation, and graph-ledger/approval policy.

- 497dff2: Add governed product authoring, lifecycle, and composed-content read Tools plus provider-neutral trip requirement, candidate sourcing, selection, and re-shop Tools.
- 6604f9e: Expose structural output schemas for every first-party Tool that previously used an opaque runtime-only schema.
- Updated dependencies [cabf662]
- Updated dependencies [701ccc4]
- Updated dependencies [5f15e2e]
- Updated dependencies [7ac40a0]
- Updated dependencies [372f4f4]
- Updated dependencies [a2fd806]
- Updated dependencies [b8cef4c]
- Updated dependencies [db5adce]
- Updated dependencies [90e8d6d]
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
  - @voyant-travel/catalog@0.158.0
  - @voyant-travel/commerce@0.36.0
  - @voyant-travel/operations@0.7.0
  - @voyant-travel/operator-settings@0.4.0
  - @voyant-travel/relationships@0.126.0
  - @voyant-travel/db@0.114.7
  - @voyant-travel/hono@0.127.1
  - @voyant-travel/storage@0.110.2
  - @voyant-travel/workflows@0.121.0

## 0.10.4

### Patch Changes

- 49f55d0: Keep catalog booking and checkout as a two-phase flow, and atomically convert
  owned-product availability holds into on-hold booking allocations without
  consuming capacity twice. Hold placement and release are now idempotent across
  retries and duplicate tokens, converted holds retain an audit link to their
  booking allocation, and checkout-only intents receive structured validation
  errors from the reservation route.
- Updated dependencies [7e9f77a]
- Updated dependencies [49f55d0]
- Updated dependencies [552acbf]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0
  - @voyant-travel/hono@0.127.0
  - @voyant-travel/bookings@0.159.0
  - @voyant-travel/catalog@0.157.0
  - @voyant-travel/finance@0.159.0
  - @voyant-travel/operations@0.6.14
  - @voyant-travel/tools@0.2.2
  - @voyant-travel/action-ledger@0.108.6
  - @voyant-travel/commerce@0.35.9
  - @voyant-travel/db@0.114.6
  - @voyant-travel/operator-settings@0.3.14
  - @voyant-travel/relationships@0.125.4
  - @voyant-travel/storage@0.110.1
  - @voyant-travel/workflows@0.120.4

## 0.10.3

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
  - @voyant-travel/catalog@0.156.0
  - @voyant-travel/commerce@0.35.8
  - @voyant-travel/core@0.122.2
  - @voyant-travel/db@0.114.5
  - @voyant-travel/finance@0.158.0
  - @voyant-travel/operations@0.6.13
  - @voyant-travel/operator-settings@0.3.13
  - @voyant-travel/relationships@0.125.3
  - @voyant-travel/types@0.109.2
  - @voyant-travel/workflows@0.120.3

## 0.10.2

### Patch Changes

- Updated dependencies [0808b21]
  - @voyant-travel/catalog@0.155.0
  - @voyant-travel/products-contracts@0.107.2
  - @voyant-travel/bookings@0.157.0
  - @voyant-travel/finance@0.157.0
  - @voyant-travel/commerce@0.35.7
  - @voyant-travel/operations@0.6.12
  - @voyant-travel/relationships@0.125.2
  - @voyant-travel/operator-settings@0.3.12

## 0.10.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [7916020]
- Updated dependencies [8d62a7c]
  - @voyant-travel/core@0.122.1
  - @voyant-travel/db@0.114.4
  - @voyant-travel/types@0.109.1
  - @voyant-travel/utils@0.107.1
  - @voyant-travel/catalog@0.154.1
  - @voyant-travel/action-ledger@0.108.4
  - @voyant-travel/bookings@0.156.1
  - @voyant-travel/commerce@0.35.6
  - @voyant-travel/extras-contracts@0.104.3
  - @voyant-travel/finance@0.156.1
  - @voyant-travel/hono@0.126.3
  - @voyant-travel/operations@0.6.11
  - @voyant-travel/operator-settings@0.3.11
  - @voyant-travel/products-contracts@0.107.1
  - @voyant-travel/relationships@0.125.1
  - @voyant-travel/storage@0.109.4
  - @voyant-travel/tools@0.2.1
  - @voyant-travel/workflows@0.120.2

## 0.10.0

### Minor Changes

- bbe6396: Replace the overloaded Finance voucher domain with Travel Credits across the
  database schema, APIs, package exports, booking inputs, storefront settings,
  and operator UI. Redemption commands are replay-safe, codes are normalized and
  case-insensitively unique, and legacy records migrate in place without silently
  skipping invalid balances. Keep Promotion Codes in Commerce and move Bookings
  fulfillment to the explicit Service Voucher vocabulary.

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/finance@0.156.0
  - @voyant-travel/bookings@0.156.0
  - @voyant-travel/products-contracts@0.107.0
  - @voyant-travel/relationships@0.125.0
  - @voyant-travel/catalog@0.154.0
  - @voyant-travel/commerce@0.35.5
  - @voyant-travel/operator-settings@0.3.10
  - @voyant-travel/db@0.114.3
  - @voyant-travel/workflows@0.120.1
  - @voyant-travel/operations@0.6.10

## 0.9.3

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
- Updated dependencies [818ea84]
- Updated dependencies [cc85042]
- Updated dependencies [07a6ee3]
  - @voyant-travel/workflows@0.120.0
  - @voyant-travel/core@0.122.0
  - @voyant-travel/bookings@0.155.1
  - @voyant-travel/db@0.114.2
  - @voyant-travel/finance@0.155.1
  - @voyant-travel/hono@0.126.2
  - @voyant-travel/storage@0.109.3
  - @voyant-travel/action-ledger@0.108.3
  - @voyant-travel/catalog@0.153.1
  - @voyant-travel/commerce@0.35.3
  - @voyant-travel/operations@0.6.9
  - @voyant-travel/operator-settings@0.3.9
  - @voyant-travel/relationships@0.124.4

## 0.9.2

### Patch Changes

- Updated dependencies [3f6694b]
  - @voyant-travel/core@0.121.0
  - @voyant-travel/action-ledger@0.108.2
  - @voyant-travel/bookings@0.155.0
  - @voyant-travel/catalog@0.153.0
  - @voyant-travel/commerce@0.35.2
  - @voyant-travel/db@0.114.1
  - @voyant-travel/finance@0.155.0
  - @voyant-travel/hono@0.126.1
  - @voyant-travel/operations@0.6.8
  - @voyant-travel/operator-settings@0.3.8
  - @voyant-travel/relationships@0.124.3
  - @voyant-travel/storage@0.109.2
  - @voyant-travel/workflows@0.119.0

## 0.9.1

### Patch Changes

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
  - @voyant-travel/catalog@0.152.0
  - @voyant-travel/commerce@0.35.1
  - @voyant-travel/operations@0.6.7
  - @voyant-travel/operator-settings@0.3.7
  - @voyant-travel/relationships@0.124.2
  - @voyant-travel/storage@0.109.1
  - @voyant-travel/workflows@0.118.0

## 0.9.0

### Minor Changes

- 047c3f9: Add package-owned graph runtime factories and typed deployment ports for Catalog search, booking, and offers; Inventory core, content, and brochures; Accommodations and Cruises content; and Action Ledger health.
- 490d132: Move owned product, accommodation, and cruise booking runtime behavior out of the Operator starter and into package-owned runtime surfaces.
- 490d132: Move standard Node media storage, video upload, document delivery, and brochure printing authority into package-owned runtime contributors.
- 282892e: Make `@voyant-travel/runtime` the single public Node project host, move low-level
  host primitives to `@voyant-travel/runtime-core`, and remove the package-owned
  runtime CLI. Rename remaining first-party operator-specific subpaths to generic
  runtime or runtime-support surfaces.

### Patch Changes

- 490d132: Move standard cross-package links from the operator starter to package-owned
  manifests and explicit standard-product selections, and generate executable
  links from the selected deployment graph.
- 490d132: Move Trips lifecycle composition, checkout FX handling, payment-policy readers, and workflow effects from the Operator starter into package-owned runtime surfaces.
- 490d132: Move Commerce runtime composition from the Operator starter into statically selected package contributors and typed domain ports.
- 490d132: Expose package-owned runtime contributor maps for Storefront, Legal, and Inventory deployment adapters.
- 490d132: Derive the final package runtime bindings from generic deployment capabilities and primitives, with no product-specific generated runtime host resources.
- 490d132: Declare package-owned runtime contributors in `voyant.package.v1` metadata and statically lower selected contributors into generated Node graph source. Node hosts now compose one generated contributor set from opaque host resources without enumerating first-party factories or package IDs.
- 490d132: Compose MCP tools and their service context from graph-selected package runtime exports instead of an Operator-owned product catalog.
- 490d132: Move runtime construction into BOM-selected domain contributors and replace the Finance target package with typed graph ports while keeping package dependencies acyclic.
- 490d132: Move catalog content configuration, booking financial lifecycle behavior, and catalog/commerce scheduled work behind package-owned graph factories and workflows.
- c65b05c: Move standard cross-package link tables and the person directory view into
  upgrade-safe package migration histories, use stable package ledger identities,
  and remove aggregate Drizzle and migration authority from the Operator starter.
- 490d132: Move Inventory workflow and brochure runtime composition behind package-owned typed ports and remove the Operator runtime capability.
- 490d132: Move the Catalog, Commerce, and Inventory OpenAPI surfaces to exact selected-graph API ownership, including overlapping package extensions.
- 490d132: Compose Action Ledger health from typed Bookings, Finance, and Inventory graph ports, consolidate Distribution channel-push composition into its domain package, and make Workflow Runs own runner registration authority.
- 490d132: Make package and project declarations the sole selected access authority, removing legacy catalog overlays and runtime synthesis.
- 490d132: Remove the final Operator admin factory compatibility registry by composing cross-domain behavior through package-owned selected graph slots and contributions.
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
- Updated dependencies [490d132]
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
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
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
  - @voyant-travel/relationships@0.124.1
  - @voyant-travel/storage@0.109.0
  - @voyant-travel/db@0.113.0
  - @voyant-travel/core@0.119.0
  - @voyant-travel/catalog@0.151.0
  - @voyant-travel/operations@0.6.6
  - @voyant-travel/operator-settings@0.3.6
  - @voyant-travel/tools@0.2.0
  - @voyant-travel/hono@0.125.1
  - @voyant-travel/types@0.108.1
  - @voyant-travel/workflows@0.117.0

## 0.8.6

### Patch Changes

- 8f4c242: Derive anonymous public and transactional path posture from selected deployment graph API bundles, including partial transactional path declarations.
- Updated dependencies [e68bdc1]
- Updated dependencies [d771be3]
- Updated dependencies [8e67fe8]
- Updated dependencies [26fe0e5]
- Updated dependencies [d771be3]
- Updated dependencies [18d8aa0]
- Updated dependencies [9b15ebe]
- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [8f537b0]
- Updated dependencies [d26a820]
- Updated dependencies [d771be3]
- Updated dependencies [bd7a830]
  - @voyant-travel/catalog@0.150.0
  - @voyant-travel/commerce@0.34.0
  - @voyant-travel/core@0.118.0
  - @voyant-travel/action-ledger@0.107.0
  - @voyant-travel/types@0.108.0
  - @voyant-travel/hono@0.125.0
  - @voyant-travel/operations@0.6.5
  - @voyant-travel/db@0.112.2
  - @voyant-travel/storage@0.108.1
  - @voyant-travel/utils@0.106.1
  - @voyant-travel/workflows@0.116.0

## 0.8.5

### Patch Changes

- e5aa097: Activate package-owned workflow declarations through the generated deployment graph and deployment-supplied Node runtime services.
- 2ec05ae: Publish the product PDF workflow deployment runtime service contract for graph activation.
- Updated dependencies [c66f9a5]
  - @voyant-travel/core@0.117.0
  - @voyant-travel/storage@0.108.0
  - @voyant-travel/action-ledger@0.106.4
  - @voyant-travel/catalog@0.149.4
  - @voyant-travel/commerce@0.33.5
  - @voyant-travel/db@0.112.1
  - @voyant-travel/hono@0.124.1
  - @voyant-travel/operations@0.6.4
  - @voyant-travel/workflows@0.115.2

## 0.8.4

### Patch Changes

- Updated dependencies [ca90eb5]
  - @voyant-travel/db@0.112.0
  - @voyant-travel/hono@0.124.0
  - @voyant-travel/action-ledger@0.106.3
  - @voyant-travel/catalog@0.149.3
  - @voyant-travel/commerce@0.33.4
  - @voyant-travel/operations@0.6.3
  - @voyant-travel/types@0.107.3
  - @voyant-travel/workflows@0.115.1

## 0.8.3

### Patch Changes

- Updated dependencies [8576451]
  - @voyant-travel/core@0.116.0
  - @voyant-travel/workflows@0.115.0
  - @voyant-travel/action-ledger@0.106.2
  - @voyant-travel/catalog@0.149.2
  - @voyant-travel/commerce@0.33.3
  - @voyant-travel/db@0.111.2
  - @voyant-travel/hono@0.123.2
  - @voyant-travel/operations@0.6.2
  - @voyant-travel/storage@0.107.2

## 0.8.2

### Patch Changes

- Updated dependencies [d41872a]
  - @voyant-travel/workflows@0.114.0
  - @voyant-travel/commerce@0.33.2
  - @voyant-travel/hono@0.123.1

## 0.8.1

### Patch Changes

- e4e6621: Model package-owned Hono extensions as first-class deployment graph units while keeping externally distributed integrations in the plugin lane.
- Updated dependencies [e4e6621]
- Updated dependencies [953e418]
- Updated dependencies [2153e48]
- Updated dependencies [ec75753]
  - @voyant-travel/core@0.115.0
  - @voyant-travel/action-ledger@0.106.1
  - @voyant-travel/catalog@0.149.1
  - @voyant-travel/commerce@0.33.1
  - @voyant-travel/hono@0.123.0
  - @voyant-travel/workflows@0.113.0
  - @voyant-travel/db@0.111.1
  - @voyant-travel/operations@0.6.1
  - @voyant-travel/storage@0.107.1

## 0.8.0

### Minor Changes

- a370024: Publish package-owned deployment manifests for catalog, commerce, and inventory
  runtime, persistence, orchestration, and extension surfaces.
- a370024: Publish package-owned deployment declarations and configurable runtime factories for vertical
  content, brochure, booking-extension, base API, and scheduled workflow surfaces.
- e3dc5a9: Declare package-owned admin route and copy facets for vertical modules with existing public admin extensions.
- e3dc5a9: Declare package-owned Node deployment facets for product events, subscribers, workflows, access resources, tools, actions, and retain-data lifecycle behavior.

### Patch Changes

- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
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
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/core@0.114.0
  - @voyant-travel/catalog@0.149.0
  - @voyant-travel/commerce@0.33.0
  - @voyant-travel/action-ledger@0.106.0
  - @voyant-travel/db@0.111.0
  - @voyant-travel/operations@0.6.0
  - @voyant-travel/storage@0.107.0
  - @voyant-travel/hono@0.122.4
  - @voyant-travel/types@0.107.2
  - @voyant-travel/workflows@0.112.0

## 0.7.11

### Patch Changes

- Updated dependencies [496f2ef]
  - @voyant-travel/core@0.113.0
  - @voyant-travel/commerce@0.32.0
  - @voyant-travel/action-ledger@0.105.15
  - @voyant-travel/catalog@0.148.0
  - @voyant-travel/db@0.110.2
  - @voyant-travel/hono@0.122.3
  - @voyant-travel/operations@0.5.23

## 0.7.10

### Patch Changes

- 5e1d221: Publish `voyant.package.v1` compatibility metadata from first-party
  schema-owning packages so deployment graph package admission can validate their
  framework, target, and deployment-mode compatibility before runtime imports.
- Updated dependencies [5e1d221]
- Updated dependencies [682d7d0]
  - @voyant-travel/action-ledger@0.105.14
  - @voyant-travel/catalog@0.147.1
  - @voyant-travel/commerce@0.31.1
  - @voyant-travel/db@0.110.1
  - @voyant-travel/operations@0.5.22
  - @voyant-travel/hono@0.122.2

## 0.7.9

### Patch Changes

- @voyant-travel/catalog@0.147.0
- @voyant-travel/commerce@0.31.0
- @voyant-travel/operations@0.5.21

## 0.7.8

### Patch Changes

- @voyant-travel/catalog@0.146.0
- @voyant-travel/commerce@0.30.0
- @voyant-travel/operations@0.5.20

## 0.7.7

### Patch Changes

- @voyant-travel/catalog@0.145.0
- @voyant-travel/commerce@0.29.0
- @voyant-travel/operations@0.5.19

## 0.7.6

### Patch Changes

- @voyant-travel/catalog@0.144.0
- @voyant-travel/commerce@0.28.0
- @voyant-travel/operations@0.5.18

## 0.7.5

### Patch Changes

- Updated dependencies [4829ef3]
  - @voyant-travel/catalog@0.143.0
  - @voyant-travel/commerce@0.27.0
  - @voyant-travel/operations@0.5.17
  - @voyant-travel/products-contracts@0.106.1

## 0.7.4

### Patch Changes

- @voyant-travel/commerce@0.26.0
- @voyant-travel/catalog@0.142.0
- @voyant-travel/operations@0.5.16

## 0.7.3

### Patch Changes

- 425f92e: Add Node-native cache and shared-state providers behind the existing KVStore
  surface, including in-process LRU, tiered Redis/Postgres providers, Postgres
  fixed-window rate limiting, Redis rate limiting, and managed-runtime provider
  selection without KV-shaped binding requirements.
- Updated dependencies [425f92e]
  - @voyant-travel/utils@0.106.0
  - @voyant-travel/db@0.110.0
  - @voyant-travel/hono@0.122.0
  - @voyant-travel/core@0.112.3
  - @voyant-travel/action-ledger@0.105.13
  - @voyant-travel/catalog@0.141.0
  - @voyant-travel/commerce@0.25.0
  - @voyant-travel/operations@0.5.15
  - @voyant-travel/types@0.107.1

## 0.7.2

### Patch Changes

- Updated dependencies [05c10f2]
  - @voyant-travel/commerce@0.24.0
  - @voyant-travel/catalog@0.140.0
  - @voyant-travel/operations@0.5.14

## 0.7.1

### Patch Changes

- Updated dependencies [6711f4c]
  - @voyant-travel/catalog@0.139.0
  - @voyant-travel/commerce@0.23.0
  - @voyant-travel/operations@0.5.13

## 0.7.0

### Minor Changes

- 8405bee: Fold the product's default itinerary into the catalog product read-model document.

  `getCatalogProductById` (and the `/v1/public/products/:id` + `/slug/:slug`
  read-through documents) can now include the product's default day-by-day
  itinerary — days and day-services with `product_day_translations` /
  `product_day_service_translations` resolved by the document's locale, plus a
  per-day thumbnail. It is opt-in via `?include=itinerary`, encoded in the
  read-model variant so itinerary and non-itinerary documents cache — and warm on
  mutation — independently. Only the product default itinerary is folded;
  departure-specific overrides stay on the departure itinerary endpoint.

  The itinerary update/delete/duplicate admin routes (keyed on the itinerary id,
  not the product id) now trigger read-model recompute so the folded itinerary
  stays fresh.

### Patch Changes

- Updated dependencies [8405bee]
  - @voyant-travel/products-contracts@0.106.0
  - @voyant-travel/commerce@0.22.0
  - @voyant-travel/catalog@0.138.0
  - @voyant-travel/operations@0.5.12

## 0.6.1

### Patch Changes

- 4504abb: Export product read-model helpers and the public product read service, and add a write-time warm path for product read-model recomputation after inventory mutations.

## 0.6.0

### Minor Changes

- 77f139b: Add read-only agent tools for the products domain at
  `@voyant-travel/inventory/tools`: `list_products` and `get_product`, exposed as
  headless `defineTool`s over the existing products service (`products:read` scope,
  read tier). The operator registers them on the in-deployment MCP server alongside
  the trips tools — establishing the module-owned-tools pattern for the remaining
  domains.

### Patch Changes

- Updated dependencies [c9a356f]
- Updated dependencies [689a289]
- Updated dependencies [6474f42]
- Updated dependencies [5786f63]
- Updated dependencies [0c75844]
- Updated dependencies [1655995]
- Updated dependencies [22f0457]
  - @voyant-travel/types@0.107.0
  - @voyant-travel/core@0.112.0
  - @voyant-travel/hono@0.121.0
  - @voyant-travel/catalog@0.137.0
  - @voyant-travel/commerce@0.21.0
  - @voyant-travel/tools@0.1.0
  - @voyant-travel/operations@0.5.10
  - @voyant-travel/utils@0.105.6
  - @voyant-travel/action-ledger@0.105.12
  - @voyant-travel/db@0.109.5

## 0.5.18

### Patch Changes

- ae115de: Use owned product option-unit pax pricing tiers when booking journey quotes include explicit unit selections.

## 0.5.17

### Patch Changes

- Updated dependencies [1cb9cba]
- Updated dependencies [131ff9b]
- Updated dependencies [f1090b7]
- Updated dependencies [42f662c]
- Updated dependencies [fead555]
  - @voyant-travel/hono@0.120.0
  - @voyant-travel/operations@0.5.9
  - @voyant-travel/action-ledger@0.105.11
  - @voyant-travel/catalog@0.136.3
  - @voyant-travel/commerce@0.20.5

## 0.5.16

### Patch Changes

- Updated dependencies [86fbb05]
  - @voyant-travel/hono@0.119.0
  - @voyant-travel/action-ledger@0.105.10
  - @voyant-travel/catalog@0.136.2
  - @voyant-travel/commerce@0.20.4
  - @voyant-travel/operations@0.5.8

## 0.5.15

### Patch Changes

- 2d3b039: Offer bank transfer and inquiry on owned-product storefront checkout.

  The owned-product booking draft shape hardcoded `paymentIntents: ["hold",
"card"]`, so the storefront Payment step collapsed to card-only for owned
  products even though the deployment advertised bank transfer and inquiry
  (sourced products already offered all three). Both product draft shapes now
  declare the full engine allow list via a shared `DEFAULT_PAYMENT_INTENTS`
  constant, and deployment/surface `PaymentProviderCapabilities` narrow it at
  render time — so owned and sourced products offer the same payment paths. The
  `/checkout/start` flow already handled bank transfer and inquiry generically on
  the booking row, so no server change was needed.

- Updated dependencies [dd03968]
- Updated dependencies [2d3b039]
- Updated dependencies [bcd76ae]
  - @voyant-travel/operations@0.5.7
  - @voyant-travel/catalog@0.136.1
  - @voyant-travel/commerce@0.20.3

## 0.5.14

### Patch Changes

- 9ebd8e8: Owned product booking commit now resolves (or creates) a CRM person from the
  billing contact when the commit carries no `personId`/`organizationId` — the
  anonymous storefront checkout case. `createProductsBookingHandler` accepts a new
  optional `resolveBillingPerson` bridge (wired by the template to
  `relationshipsService.upsertPersonFromContact`), mirroring the sourced/session
  arm's `resolveBillingPerson` hook. This fixes anonymous storefront checkout for
  owned public products, which previously failed with a 400 "Select a billing
  person or organization".

## 0.5.13

### Patch Changes

- @voyant-travel/commerce@0.20.0
- @voyant-travel/catalog@0.136.0
- @voyant-travel/operations@0.5.6

## 0.5.12

### Patch Changes

- c5cd9cd: Return structured 409 conflicts for duplicate inventory taxonomy and product translation creates.
- Updated dependencies [fd17317]
  - @voyant-travel/hono@0.118.3

## 0.5.11

### Patch Changes

- 5c1294f: Reject inverted inventory product dates, option availability dates, option-unit quantity bounds, and duplicate itinerary day numbers.
- Updated dependencies [5c1294f]
  - @voyant-travel/products-contracts@0.105.17

## 0.5.10

### Patch Changes

- a10b9ba: Return deterministic 503 responses when product brochure generation cannot upload to configured storage or resolve a brochure URL.
- e005c4d: Reject inverted product option-unit age ranges and commerce pricing ranges across schemas and service mutations.
- ad02eae: Reject non-image product media as cover media and surface brochure generation failures in the product detail UI.
- Updated dependencies [ed5463f]
- Updated dependencies [e005c4d]
  - @voyant-travel/operations@0.5.5
  - @voyant-travel/products-contracts@0.105.16
  - @voyant-travel/commerce@0.19.4

## 0.5.9

### Patch Changes

- 61410dd: Preserve catalog sourced-entry provenance when packaged detail pages start the booking journey.
- Updated dependencies [61410dd]
  - @voyant-travel/catalog@0.135.3

## 0.5.8

### Patch Changes

- 98e270c: Add a public-audience listability predicate to the product document builder so deployments can tombstone non-listable customer catalog documents.
- Updated dependencies [d2351e0]
  - @voyant-travel/catalog@0.135.2

## 0.5.7

### Patch Changes

- fcb8b88: Add catalog-authoring validation for transfer pickup/dropoff rules, block static availability for dynamic products, and require scheduled products to have a future open departure before publishing.
- Updated dependencies [fcb8b88]
  - @voyant-travel/operations@0.5.4

## 0.5.6

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/storage@0.106.0
  - @voyant-travel/hono@0.118.0
  - @voyant-travel/action-ledger@0.105.9
  - @voyant-travel/catalog@0.135.1
  - @voyant-travel/commerce@0.19.1
  - @voyant-travel/operations@0.5.3

## 0.5.5

### Patch Changes

- Updated dependencies [7c5ee80]
  - @voyant-travel/hono@0.117.0
  - @voyant-travel/commerce@0.19.0
  - @voyant-travel/action-ledger@0.105.8
  - @voyant-travel/catalog@0.135.0
  - @voyant-travel/operations@0.5.2

## 0.5.4

### Patch Changes

- 12a1eb2: Expose client-safe subpaths for validation schemas, linkable metadata, template authoring metadata, finance payment-policy primitives, and Hono reporter utilities. Move browser-facing React/operator imports off mixed runtime barrels so client bundles do not pull Hono request context or other server-only runtime code.
- Updated dependencies [12a1eb2]
  - @voyant-travel/commerce@0.18.1
  - @voyant-travel/hono@0.116.2
  - @voyant-travel/operations@0.5.1

## 0.5.3

### Patch Changes

- Updated dependencies [787c852]
- Updated dependencies [293e5e4]
  - @voyant-travel/operations@0.5.0
  - @voyant-travel/hono@0.116.1
  - @voyant-travel/db@0.109.2
  - @voyant-travel/products-contracts@0.105.12
  - @voyant-travel/catalog@0.134.0
  - @voyant-travel/commerce@0.18.0

## 0.5.2

### Patch Changes

- Updated dependencies [924d201]
- Updated dependencies [f311826]
  - @voyant-travel/operations@0.4.0
  - @voyant-travel/db@0.109.1
  - @voyant-travel/products-contracts@0.105.11
  - @voyant-travel/catalog@0.133.0
  - @voyant-travel/commerce@0.17.0

## 0.5.1

### Patch Changes

- Updated dependencies [684b321]
- Updated dependencies [2542715]
  - @voyant-travel/hono@0.116.0
  - @voyant-travel/action-ledger@0.105.7
  - @voyant-travel/catalog@0.132.1
  - @voyant-travel/commerce@0.16.1
  - @voyant-travel/operations@0.3.1

## 0.5.0

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
  - @voyant-travel/commerce@0.16.0
  - @voyant-travel/operations@0.3.0
  - @voyant-travel/action-ledger@0.105.6
  - @voyant-travel/catalog@0.132.0
  - @voyant-travel/utils@0.105.4

## 0.4.7

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/hono@0.114.0
  - @voyant-travel/db@0.109.0
  - @voyant-travel/utils@0.105.3
  - @voyant-travel/action-ledger@0.105.5
  - @voyant-travel/catalog@0.131.0
  - @voyant-travel/commerce@0.15.0
  - @voyant-travel/operations@0.2.8
  - @voyant-travel/products-contracts@0.105.10

## 0.4.6

### Patch Changes

- Updated dependencies [6a0edd2]
  - @voyant-travel/catalog@0.130.0
  - @voyant-travel/products-contracts@0.105.9
  - @voyant-travel/commerce@0.14.0
  - @voyant-travel/operations@0.2.7

## 0.4.5

### Patch Changes

- Updated dependencies [021ec00]
  - @voyant-travel/hono@0.113.0
  - @voyant-travel/core@0.111.0
  - @voyant-travel/action-ledger@0.105.4
  - @voyant-travel/catalog@0.129.1
  - @voyant-travel/commerce@0.13.1
  - @voyant-travel/operations@0.2.6
  - @voyant-travel/db@0.108.5

## 0.4.4

### Patch Changes

- fcd2e0b: Add itinerary and day-service translation authoring surfaces, and localize owned itinerary content projection for translated days and service labels.
- Updated dependencies [fcd2e0b]
  - @voyant-travel/products-contracts@0.105.8

## 0.4.3

### Patch Changes

- @voyant-travel/catalog@0.129.0
- @voyant-travel/commerce@0.13.0
- @voyant-travel/operations@0.2.4

## 0.4.2

### Patch Changes

- @voyant-travel/catalog@0.128.0
- @voyant-travel/commerce@0.12.0
- @voyant-travel/operations@0.2.3

## 0.4.1

### Patch Changes

- Updated dependencies [7779772]
  - @voyant-travel/catalog@0.127.0
  - @voyant-travel/commerce@0.11.0
  - @voyant-travel/operations@0.2.2

## 0.4.0

### Minor Changes

- 9c47b00: Add a themed product brochure HTML renderer and printer decorator. Brochure
  template context now includes product media and pax pricing tiers so custom
  brochure layouts can render covers, galleries, and pricing tables without
  extra app-local queries, while still replacing the section set for fully custom
  brochure designs. The themed printer requires an HTML-capable browser printer
  and guards against accidental composition with the built-in basic PDF printer.

### Patch Changes

- @voyant-travel/catalog@0.126.0
- @voyant-travel/commerce@0.10.0
- @voyant-travel/operations@0.2.1

## 0.3.9

### Patch Changes

- Updated dependencies [435a5d1]
  - @voyant-travel/operations@0.2.0
  - @voyant-travel/commerce@0.9.0
  - @voyant-travel/catalog@0.125.0

## 0.3.8

### Patch Changes

- fc678e9: Align public product slug lookups with catalog search locale fallback so exact fallback slugs resolve product details.

## 0.3.7

### Patch Changes

- 1841ce2: D.2 slice 1 (batch 2) — 14 more packages own + ship their migration history (db, relationships, quotes, identity, distribution, inventory, commerce, catalog, finance, notifications, legal, storefront, charters, cruises). Each baseline reproduces the framework bundle's tables column-for-column, and all package sources now apply together (fresh-D.2 union) without collision.

  Shared enums: the codebase inlines copies of some enums to avoid cross-package schema imports (e.g. `service_type` in distribution + inventory, `entity_type` in relationships + quotes). Per-package generation would emit duplicate `CREATE TYPE`, colliding on a fresh D.2 database. All package migrations now wrap `CREATE TYPE … AS ENUM(…)` in an idempotent `DO`-block guard (subset-safe; whichever source applies first creates the type, the rest no-op). The db package additionally owns the shared Postgres extensions (pg_trgm / unaccent) that downstream trigram indexes need on a fresh D.2 database (the retired bundle injected them; per-package sources did not). The batch-1 packages (operator-settings, action-ledger, workflow-runs, trips) get the same guard for uniformity. No runtime change. See `docs/architecture/migration-collector-d2.md`.

- Updated dependencies [1841ce2]
- Updated dependencies [4893352]
  - @voyant-travel/db@0.108.4
  - @voyant-travel/commerce@0.8.1
  - @voyant-travel/catalog@0.124.1
  - @voyant-travel/action-ledger@0.105.3
  - @voyant-travel/operations@0.1.7

## 0.3.6

### Patch Changes

- @voyant-travel/commerce@0.8.0
- @voyant-travel/catalog@0.124.0
- @voyant-travel/operations@0.1.6

## 0.3.5

### Patch Changes

- @voyant-travel/db@0.108.3
- @voyant-travel/products-contracts@0.105.6
- @voyant-travel/commerce@0.7.0
- @voyant-travel/catalog@0.123.0
- @voyant-travel/operations@0.1.5
- @voyant-travel/hono@0.112.2

## 0.3.4

### Patch Changes

- @voyant-travel/hono@0.112.1
- @voyant-travel/catalog@0.122.0
- @voyant-travel/commerce@0.6.0
- @voyant-travel/operations@0.1.4

## 0.3.3

### Patch Changes

- Updated dependencies [98f4a40]
- Updated dependencies [a3bd51c]
- Updated dependencies [3b27dcc]
- Updated dependencies [39d48fe]
- Updated dependencies [d222e9f]
  - @voyant-travel/core@0.110.0
  - @voyant-travel/hono@0.112.0
  - @voyant-travel/commerce@0.5.0
  - @voyant-travel/action-ledger@0.105.1
  - @voyant-travel/catalog@0.121.0
  - @voyant-travel/db@0.108.2
  - @voyant-travel/operations@0.1.3

## 0.3.2

### Patch Changes

- a9dcf89: Fix catalog browse defaults so product projections expose supply models for scheduled/dynamic locks and embedded catalog admins resolve locale from the loaded operator market.
  - @voyant-travel/catalog@0.120.1

## 0.3.1

### Patch Changes

- @voyant-travel/commerce@0.4.0
- @voyant-travel/catalog@0.120.0
- @voyant-travel/operations@0.1.2

## 0.3.0

### Minor Changes

- 13fe70b: The inventory module now owns the product brochure route: new `@voyant-travel/inventory/routes-brochure` export (`createProductBrochureRoutes(options)`) with the object storage provider injected as an option.

### Patch Changes

- Updated dependencies [13fe70b]
- Updated dependencies [11095db]
- Updated dependencies [13fe70b]
- Updated dependencies [13fe70b]
- Updated dependencies [9ea7220]
- Updated dependencies [13fe70b]
  - @voyant-travel/action-ledger@0.105.0
  - @voyant-travel/catalog@0.119.0
  - @voyant-travel/commerce@0.3.0
  - @voyant-travel/hono@0.111.0
  - @voyant-travel/storage@0.105.0
  - @voyant-travel/operations@0.1.1

## 0.2.0

### Minor Changes

- 3cc83b6: Move extras runtime and React source behind Inventory and Bookings owner
  subpaths. The old runtime and React extras package names are removed from v1;
  first-party imports use the Inventory and Bookings owner paths.
- 7ea516a: Move product graph compose/duplicate authoring behind
  `@voyant-travel/inventory/authoring`. `@voyant-travel/catalog-authoring` now delegates to
  the Inventory owner path during the v1 restructure.
- 65b3782: Add optional Inventory package entrypoints for operated product authoring and
  Inventory React authoring UI surfaces.
- a101971: Move the main operated Product route/service/schema/runtime and React
  authoring source under Inventory owner paths. The old Products runtime package
  names are removed from the v1 workspace surface, while the operator keeps
  stable `/products` API URLs backed by Inventory.

### Patch Changes

- 3408b2a: Move availability, allocation UI, resources, ground logistics, and places source
  under Operations owner paths. The old operated-execution package names are
  removed from the v1 workspace surface while first-party runtime, React, and
  operator imports use `@voyant-travel/operations` and `@voyant-travel/operations-react`
  surfaces.
- 47fef18: Retarget first-party imports from the removed beta package names to their owner
  packages. Operated product UI now imports Inventory React, commercial UI imports
  Commerce React, supplier UI imports Distribution React, checkout UI imports
  Finance React, and operated place/availability schema references import
  Operations owner paths.
- Updated dependencies [c9ec9f8]
- Updated dependencies [e388bc9]
- Updated dependencies [6bff46f]
- Updated dependencies [a4e0909]
- Updated dependencies [eb17d3d]
- Updated dependencies [3cc83b6]
- Updated dependencies [3408b2a]
- Updated dependencies [47fef18]
- Updated dependencies [063f2b5]
  - @voyant-travel/catalog@0.118.0
  - @voyant-travel/commerce@0.2.0
  - @voyant-travel/hono@0.110.0
  - @voyant-travel/operations@0.1.0
  - @voyant-travel/extras-contracts@0.104.2
  - @voyant-travel/action-ledger@0.104.11
