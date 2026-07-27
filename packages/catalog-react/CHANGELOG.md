# @voyant-travel/catalog-react

## 0.208.0

### Patch Changes

- @voyant-travel/distribution-react@0.200.0
- @voyant-travel/inventory-react@0.92.0
- @voyant-travel/commerce-react@0.92.0

## 0.207.0

### Patch Changes

- @voyant-travel/distribution-react@0.199.0
- @voyant-travel/inventory-react@0.91.0
- @voyant-travel/commerce-react@0.91.0

## 0.206.0

### Patch Changes

- Updated dependencies [1873611]
  - @voyant-travel/admin@0.130.0
  - @voyant-travel/i18n@0.118.0
  - @voyant-travel/commerce-react@0.90.0
  - @voyant-travel/distribution-react@0.198.0
  - @voyant-travel/inventory-react@0.90.0

## 0.205.2

### Patch Changes

- @voyant-travel/distribution-react@0.197.2

## 0.205.1

## 0.205.0

### Patch Changes

- @voyant-travel/distribution-react@0.197.0
- @voyant-travel/commerce-react@0.89.0
- @voyant-travel/inventory-react@0.89.0

## 0.204.0

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/i18n@0.117.3
  - @voyant-travel/inventory-react@0.88.0
  - @voyant-travel/distribution-react@0.196.0
  - @voyant-travel/commerce-react@0.88.0

## 0.203.0

### Patch Changes

- @voyant-travel/inventory-react@0.87.0
- @voyant-travel/distribution-react@0.195.0
- @voyant-travel/commerce-react@0.87.0

## 0.202.0

### Patch Changes

- Updated dependencies [9e57a5d]
  - @voyant-travel/inventory-react@0.86.0
  - @voyant-travel/commerce-react@0.86.0
  - @voyant-travel/distribution-react@0.194.0

## 0.201.0

### Minor Changes

- 17f1239: Replace the inline Finance booking-create HTTP and dual-create surfaces with one
  handler-admitted, idempotent created-target Tool command. Booking rows, dependent
  finance records, the canonical action-ledger result, and domain-event outbox
  entries now settle in one transaction; exact retries resolve the original booking.

  Remove the retired booking-create React mutation, sheet, page, and slot shortcut.
  Unmount the legacy admin new/journey routes and semantic destinations, remove
  catalog and inventory booking actions, and remove the standard storefront
  `/shop/book/:entityModule/:entityId` route plus its booking page/journey exports.
  Catalog browsing, booking read/detail, customer-portal sessions, and reusable
  draft sections remain available; new booking creation is a Finance staff Tool.
  Remove raw Bookings, Charter, and Cruise creation APIs and Tools. Delete the
  dormant Catalog owned-commit contract and Inventory, Accommodations, Cruises,
  Commerce, Storefront, and Storefront SDK booking-row creation bridges rather
  than retaining unavailable legacy mutations. Require registry-minted,
  unforgeable handler admission plus a single-use Finance-specific mutation lease
  for Bookings domain settlement, and remove the Finance command's public
  subpath.

### Patch Changes

- @voyant-travel/inventory-react@0.85.0
- @voyant-travel/distribution-react@0.193.0
- @voyant-travel/commerce-react@0.85.0

## 0.200.0

### Patch Changes

- @voyant-travel/distribution-react@0.192.0
- @voyant-travel/inventory-react@0.84.0
- @voyant-travel/commerce-react@0.84.0

## 0.199.1

### Patch Changes

- @voyant-travel/distribution-react@0.191.1

## 0.199.0

### Patch Changes

- @voyant-travel/inventory-react@0.83.0
- @voyant-travel/distribution-react@0.191.0
- @voyant-travel/commerce-react@0.83.0

## 0.198.0

### Patch Changes

- @voyant-travel/distribution-react@0.190.0
- @voyant-travel/commerce-react@0.82.0
- @voyant-travel/inventory-react@0.82.0
- @voyant-travel/ui@0.109.6

## 0.197.0

### Patch Changes

- @voyant-travel/distribution-react@0.189.0
- @voyant-travel/commerce-react@0.81.0
- @voyant-travel/inventory-react@0.81.0

## 0.196.1

### Patch Changes

- e2cb9f5: Give every admin screen consistent page spacing. Previously each page invented
  its own padding (`p-6`, `px-6 py-6 lg:px-8`, `container mx-auto py-6` with no
  horizontal padding, or none at all), so screens like the booking engine had no
  spacing while others differed.

  The admin workspace layout now wraps the page outlet in a single padded content
  region (`px-4 py-6 md:px-6`), and the per-page root padding was removed so it no
  longer double-pads (max-width caps are kept). The full-height settings two-pane
  bleeds back out of that padding and re-applies its own so it stays edge-to-edge.

- e2cb9f5: Plain-language copy pass across the admin UI. Rewrites microcopy on the
  non-developer screens so it reads for travel professionals rather than
  engineers: removes developer jargon (entity, tenant, adapter/connector,
  payload, sync/reconcile internals, raw database column names and code
  fragments), strips internal/roadmap notes that leaked into user copy, cuts
  verbose and redundant helper text, and aligns terminology to the canonical
  Ubiquitous Language (Traveler over pax/guest, Supplier, Quote/Quote Version,
  "record" instead of "entity") with consistent sentence case. English catalog
  copy only; ICU placeholders and en/ro key parity preserved.
- e2cb9f5: Bring the Romanian (ro) admin translations in line with the plain-language
  English copy pass — re-translating the updated strings so the Romanian UI drops
  the same jargon and reads as clearly as the English. Values only; en/ro key
  parity and ICU placeholders preserved.
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
  - @voyant-travel/i18n@0.117.2
  - @voyant-travel/inventory-react@0.80.1
  - @voyant-travel/commerce-react@0.80.1
  - @voyant-travel/admin@0.129.1
  - @voyant-travel/distribution-react@0.188.1
  - @voyant-travel/ui@0.109.5

## 0.196.0

### Patch Changes

- @voyant-travel/inventory-react@0.80.0
- @voyant-travel/distribution-react@0.188.0
- @voyant-travel/commerce-react@0.80.0

## 0.195.0

### Patch Changes

- @voyant-travel/commerce-react@0.79.0
- @voyant-travel/inventory-react@0.79.0
- @voyant-travel/distribution-react@0.187.0

## 0.194.0

### Patch Changes

- @voyant-travel/distribution-react@0.186.0
- @voyant-travel/inventory-react@0.78.0
- @voyant-travel/commerce-react@0.78.0

## 0.193.0

### Patch Changes

- @voyant-travel/distribution-react@0.185.0
- @voyant-travel/commerce-react@0.77.0
- @voyant-travel/inventory-react@0.77.0

## 0.192.1

## 0.192.0

### Patch Changes

- @voyant-travel/distribution-react@0.184.0
- @voyant-travel/commerce-react@0.76.0
- @voyant-travel/inventory-react@0.76.0

## 0.191.0

### Patch Changes

- Updated dependencies [a43267a]
- Updated dependencies [90d44c0]
  - @voyant-travel/catalog-contracts@0.112.1
  - @voyant-travel/admin@0.129.0
  - @voyant-travel/i18n@0.117.0
  - @voyant-travel/inventory-react@0.75.0
  - @voyant-travel/commerce-react@0.75.0
  - @voyant-travel/distribution-react@0.183.0

## 0.190.1

### Patch Changes

- @voyant-travel/distribution-react@0.182.1

## 0.190.0

### Patch Changes

- @voyant-travel/inventory-react@0.74.0
- @voyant-travel/distribution-react@0.182.0
- @voyant-travel/commerce-react@0.74.0

## 0.189.0

### Patch Changes

- @voyant-travel/inventory-react@0.73.0
- @voyant-travel/distribution-react@0.181.0
- @voyant-travel/commerce-react@0.73.0

## 0.188.0

### Patch Changes

- @voyant-travel/commerce-react@0.72.0
- @voyant-travel/distribution-react@0.180.0
- @voyant-travel/inventory-react@0.72.0

## 0.187.0

### Patch Changes

- Updated dependencies [d9ff078]
  - @voyant-travel/catalog-contracts@0.112.0
  - @voyant-travel/inventory-react@0.71.0
  - @voyant-travel/distribution-react@0.179.0
  - @voyant-travel/commerce-react@0.71.0

## 0.186.0

### Patch Changes

- @voyant-travel/commerce-react@0.70.0
- @voyant-travel/inventory-react@0.70.0
- @voyant-travel/ui@0.109.4
- @voyant-travel/distribution-react@0.178.0

## 0.185.0

### Patch Changes

- Updated dependencies [0b7f213]
  - @voyant-travel/inventory-react@0.69.0
  - @voyant-travel/commerce-react@0.69.0
  - @voyant-travel/distribution-react@0.177.0

## 0.184.0

### Patch Changes

- Updated dependencies [5af8682]
  - @voyant-travel/inventory-react@0.68.0
  - @voyant-travel/commerce-react@0.68.0
  - @voyant-travel/distribution-react@0.176.0

## 0.183.0

### Patch Changes

- @voyant-travel/inventory-react@0.67.0
- @voyant-travel/distribution-react@0.175.0
- @voyant-travel/commerce-react@0.67.0

## 0.182.0

### Patch Changes

- Updated dependencies [a33c590]
  - @voyant-travel/inventory-react@0.66.0
  - @voyant-travel/commerce-react@0.66.0
  - @voyant-travel/distribution-react@0.174.0

## 0.181.0

### Patch Changes

- @voyant-travel/inventory-react@0.65.0
- @voyant-travel/distribution-react@0.173.0
- @voyant-travel/commerce-react@0.65.0

## 0.180.2

### Patch Changes

- Updated dependencies [f0f51b4]
  - @voyant-travel/i18n@0.116.0
  - @voyant-travel/admin@0.128.3
  - @voyant-travel/commerce-react@0.64.1
  - @voyant-travel/distribution-react@0.172.2
  - @voyant-travel/inventory-react@0.64.1

## 0.180.1

### Patch Changes

- @voyant-travel/distribution-react@0.172.1

## 0.180.0

### Patch Changes

- @voyant-travel/inventory-react@0.64.0
- @voyant-travel/distribution-react@0.172.0
- @voyant-travel/commerce-react@0.64.0

## 0.179.0

### Patch Changes

- Updated dependencies [464815c]
  - @voyant-travel/i18n@0.115.1
  - @voyant-travel/inventory-react@0.63.0
  - @voyant-travel/distribution-react@0.171.0
  - @voyant-travel/commerce-react@0.63.0

## 0.178.1

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/i18n@0.115.0
  - @voyant-travel/admin@0.128.2
  - @voyant-travel/commerce-react@0.62.1
  - @voyant-travel/distribution-react@0.170.1
  - @voyant-travel/inventory-react@0.62.1

## 0.178.0

### Patch Changes

- Updated dependencies [ecf1680]
  - @voyant-travel/i18n@0.114.0
  - @voyant-travel/inventory-react@0.62.0
  - @voyant-travel/admin@0.128.1
  - @voyant-travel/commerce-react@0.62.0
  - @voyant-travel/distribution-react@0.170.0

## 0.177.0

### Patch Changes

- @voyant-travel/inventory-react@0.61.0
- @voyant-travel/distribution-react@0.169.0
- @voyant-travel/commerce-react@0.61.0

## 0.176.0

### Patch Changes

- Updated dependencies [2bcafc9]
  - @voyant-travel/admin@0.128.0
  - @voyant-travel/i18n@0.113.0
  - @voyant-travel/commerce-react@0.60.0
  - @voyant-travel/distribution-react@0.168.0
  - @voyant-travel/inventory-react@0.60.0

## 0.175.0

### Patch Changes

- @voyant-travel/inventory-react@0.59.0
- @voyant-travel/distribution-react@0.167.0
- @voyant-travel/commerce-react@0.59.0

## 0.174.0

### Patch Changes

- @voyant-travel/inventory-react@0.58.0
- @voyant-travel/distribution-react@0.166.0
- @voyant-travel/commerce-react@0.58.0

## 0.173.0

### Patch Changes

- @voyant-travel/inventory-react@0.57.0
- @voyant-travel/distribution-react@0.165.0
- @voyant-travel/commerce-react@0.57.0

## 0.172.0

### Patch Changes

- @voyant-travel/inventory-react@0.56.0
- @voyant-travel/distribution-react@0.164.0
- @voyant-travel/commerce-react@0.56.0

## 0.171.0

### Patch Changes

- @voyant-travel/inventory-react@0.55.0
- @voyant-travel/distribution-react@0.163.0
- @voyant-travel/commerce-react@0.55.0

## 0.170.0

### Patch Changes

- @voyant-travel/inventory-react@0.54.0
- @voyant-travel/commerce-react@0.54.0
- @voyant-travel/ui@0.109.3
- @voyant-travel/distribution-react@0.162.0

## 0.169.1

### Patch Changes

- @voyant-travel/distribution-react@0.161.1

## 0.169.0

### Patch Changes

- @voyant-travel/inventory-react@0.53.0
- @voyant-travel/distribution-react@0.161.0
- @voyant-travel/commerce-react@0.53.0

## 0.168.0

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/i18n@0.112.1
  - @voyant-travel/inventory-react@0.52.0
  - @voyant-travel/distribution-react@0.160.0
  - @voyant-travel/commerce-react@0.52.0

## 0.167.1

### Patch Changes

- @voyant-travel/distribution-react@0.159.1

## 0.167.0

### Patch Changes

- Updated dependencies [a461920]
- Updated dependencies [a461920]
  - @voyant-travel/admin@0.127.0
  - @voyant-travel/commerce-react@0.51.0
  - @voyant-travel/distribution-react@0.159.0
  - @voyant-travel/inventory-react@0.51.0

## 0.166.0

### Patch Changes

- @voyant-travel/inventory-react@0.50.0
- @voyant-travel/distribution-react@0.158.0
- @voyant-travel/commerce-react@0.50.0

## 0.165.0

### Patch Changes

- @voyant-travel/commerce-react@0.49.0
- @voyant-travel/inventory-react@0.49.0
- @voyant-travel/distribution-react@0.157.0

## 0.164.0

### Patch Changes

- Updated dependencies [0868f18]
- Updated dependencies [3062a73]
  - @voyant-travel/admin@0.126.2
  - @voyant-travel/i18n@0.112.0
  - @voyant-travel/commerce-react@0.48.0
  - @voyant-travel/inventory-react@0.48.0
  - @voyant-travel/distribution-react@0.156.0

## 0.163.0

### Patch Changes

- @voyant-travel/inventory-react@0.47.0
- @voyant-travel/distribution-react@0.155.0
- @voyant-travel/commerce-react@0.47.0

## 0.162.0

### Patch Changes

- @voyant-travel/distribution-react@0.154.0
- @voyant-travel/commerce-react@0.46.0
- @voyant-travel/inventory-react@0.46.0

## 0.161.0

### Patch Changes

- @voyant-travel/distribution-react@0.153.0
- @voyant-travel/inventory-react@0.45.0
- @voyant-travel/commerce-react@0.45.0

## 0.160.1

### Patch Changes

- 7a7fd97: Strengthen the internationalization platform across the operator and package UI.

  Add ICU message formatting, explicit locale and time-zone formatters, hierarchical
  locale fallback, validated runtime overrides, account-authoritative preferences,
  localized setup and navigation surfaces, and fail-closed catalog and UI-literal
  checks. Package message providers now accept an optional time zone and expose the
  shared formatting capabilities to package-owned UI.

- Updated dependencies [7a7fd97]
  - @voyant-travel/admin@0.126.1
  - @voyant-travel/commerce-react@0.44.1
  - @voyant-travel/distribution-react@0.152.1
  - @voyant-travel/i18n@0.111.3
  - @voyant-travel/inventory-react@0.44.1

## 0.160.0

### Patch Changes

- @voyant-travel/commerce-react@0.44.0
- @voyant-travel/distribution-react@0.152.0
- @voyant-travel/inventory-react@0.44.0

## 0.159.0

### Patch Changes

- Updated dependencies [c1e37f2]
  - @voyant-travel/admin@0.126.0
  - @voyant-travel/commerce-react@0.43.0
  - @voyant-travel/distribution-react@0.151.0
  - @voyant-travel/inventory-react@0.43.0

## 0.158.0

### Patch Changes

- @voyant-travel/inventory-react@0.42.0
- @voyant-travel/commerce-react@0.42.0
- @voyant-travel/distribution-react@0.150.0

## 0.157.0

### Patch Changes

- Updated dependencies [766d24b]
- Updated dependencies [7e9f77a]
- Updated dependencies [49f55d0]
- Updated dependencies [82ffd12]
- Updated dependencies [6147b93]
- Updated dependencies [b459761]
  - @voyant-travel/ui@0.109.2
  - @voyant-travel/distribution-react@0.149.0
  - @voyant-travel/inventory-react@0.41.0
  - @voyant-travel/admin@0.125.0
  - @voyant-travel/catalog-contracts@0.111.1
  - @voyant-travel/commerce-react@0.41.0

## 0.156.0

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
  - @voyant-travel/admin@0.124.0
  - @voyant-travel/distribution-react@0.148.0
  - @voyant-travel/commerce-react@0.40.0
  - @voyant-travel/inventory-react@0.40.0

## 0.155.1

## 0.155.0

### Patch Changes

- 0808b21: Publish canonical catalog search sort resolution, strengthen adapter conformance coverage, verify the Typesense implementation against the public runner, and remove provider-specific UI wording.
- Updated dependencies [0808b21]
  - @voyant-travel/catalog-contracts@0.111.0
  - @voyant-travel/inventory-react@0.39.0
  - @voyant-travel/distribution-react@0.147.0
  - @voyant-travel/commerce-react@0.39.0

## 0.154.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [8d62a7c]
  - @voyant-travel/commerce-react@0.38.1
  - @voyant-travel/admin@0.123.3
  - @voyant-travel/catalog-contracts@0.110.1
  - @voyant-travel/distribution-react@0.146.1
  - @voyant-travel/i18n@0.111.1
  - @voyant-travel/inventory-react@0.38.1
  - @voyant-travel/react@0.104.2
  - @voyant-travel/ui@0.109.1

## 0.154.0

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/catalog-contracts@0.110.0
  - @voyant-travel/i18n@0.111.0
  - @voyant-travel/inventory-react@0.38.0
  - @voyant-travel/distribution-react@0.146.0
  - @voyant-travel/admin@0.123.2
  - @voyant-travel/commerce-react@0.38.0

## 0.153.2

### Patch Changes

- Updated dependencies [df3e4ec]
  - @voyant-travel/catalog-contracts@0.109.1

## 0.153.1

### Patch Changes

- @voyant-travel/distribution-react@0.145.1

## 0.153.0

### Patch Changes

- @voyant-travel/inventory-react@0.37.0
- @voyant-travel/distribution-react@0.145.0
- @voyant-travel/commerce-react@0.37.0

## 0.152.0

### Patch Changes

- Updated dependencies [8bd906f]
  - @voyant-travel/ui@0.109.0
  - @voyant-travel/admin@0.123.0
  - @voyant-travel/commerce-react@0.36.0
  - @voyant-travel/distribution-react@0.144.0
  - @voyant-travel/inventory-react@0.36.0

## 0.151.2

## 0.151.1

## 0.151.0

### Minor Changes

- 490d132: Expose package-owned storefront browse, content resolution, slot selection, and
  product, accommodation, and cruise detail components.

### Patch Changes

- 490d132: Remove the final Operator admin factory compatibility registry by composing cross-domain behavior through package-owned selected graph slots and contributions.
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
  - @voyant-travel/admin@0.122.0
  - @voyant-travel/commerce-react@0.35.0
  - @voyant-travel/distribution-react@0.143.0
  - @voyant-travel/inventory-react@0.35.0

## 0.150.0

### Patch Changes

- Updated dependencies [d771be3]
- Updated dependencies [d771be3]
  - @voyant-travel/admin@0.121.0
  - @voyant-travel/commerce-react@0.34.0
  - @voyant-travel/distribution-react@0.142.0
  - @voyant-travel/inventory-react@0.34.0

## 0.149.4

### Patch Changes

- @voyant-travel/distribution-react@0.141.5

## 0.149.3

### Patch Changes

- @voyant-travel/distribution-react@0.141.4

## 0.149.2

### Patch Changes

- @voyant-travel/distribution-react@0.141.3

## 0.149.1

### Patch Changes

- @voyant-travel/distribution-react@0.141.1

## 0.149.0

### Patch Changes

- @voyant-travel/commerce-react@0.33.0
- @voyant-travel/inventory-react@0.33.0
- @voyant-travel/distribution-react@0.141.0

## 0.148.0

### Patch Changes

- @voyant-travel/distribution-react@0.140.0
- @voyant-travel/commerce-react@0.32.0
- @voyant-travel/inventory-react@0.32.0

## 0.147.1

### Patch Changes

- @voyant-travel/distribution-react@0.139.1

## 0.147.0

### Patch Changes

- Updated dependencies [a97e845]
  - @voyant-travel/admin@0.120.0
  - @voyant-travel/commerce-react@0.31.0
  - @voyant-travel/distribution-react@0.139.0
  - @voyant-travel/inventory-react@0.31.0

## 0.146.0

### Patch Changes

- Updated dependencies [8a665f3]
  - @voyant-travel/admin@0.119.0
  - @voyant-travel/commerce-react@0.30.0
  - @voyant-travel/distribution-react@0.138.0
  - @voyant-travel/inventory-react@0.30.0

## 0.145.0

### Patch Changes

- @voyant-travel/admin@0.118.0
- @voyant-travel/commerce-react@0.29.0
- @voyant-travel/distribution-react@0.137.0
- @voyant-travel/inventory-react@0.29.0

## 0.144.0

### Patch Changes

- Updated dependencies [ecdf0fc]
  - @voyant-travel/admin@0.117.0
  - @voyant-travel/commerce-react@0.28.0
  - @voyant-travel/distribution-react@0.136.0
  - @voyant-travel/inventory-react@0.28.0

## 0.143.0

### Patch Changes

- Updated dependencies [4829ef3]
  - @voyant-travel/catalog-contracts@0.109.0
  - @voyant-travel/distribution-react@0.135.0
  - @voyant-travel/inventory-react@0.27.0
  - @voyant-travel/commerce-react@0.27.0

## 0.142.0

### Patch Changes

- @voyant-travel/distribution-react@0.134.0
- @voyant-travel/commerce-react@0.26.0
- @voyant-travel/inventory-react@0.26.0

## 0.141.0

### Patch Changes

- @voyant-travel/commerce-react@0.25.0
- @voyant-travel/inventory-react@0.25.0
- @voyant-travel/ui@0.108.11
- @voyant-travel/distribution-react@0.133.0

## 0.140.0

### Patch Changes

- @voyant-travel/commerce-react@0.24.0
- @voyant-travel/distribution-react@0.132.0
- @voyant-travel/inventory-react@0.24.0

## 0.139.0

### Minor Changes

- 6711f4c: Add channel-scoped catalog search slices so storefront and partner surfaces can query separate per-channel index collections.

### Patch Changes

- @voyant-travel/inventory-react@0.23.0
- @voyant-travel/distribution-react@0.131.0
- @voyant-travel/commerce-react@0.23.0

## 0.138.0

### Patch Changes

- Updated dependencies [62e87ee]
  - @voyant-travel/admin@0.116.0
  - @voyant-travel/i18n@0.110.0
  - @voyant-travel/commerce-react@0.22.0
  - @voyant-travel/distribution-react@0.130.0
  - @voyant-travel/inventory-react@0.22.0

## 0.137.1

## 0.137.0

### Patch Changes

- Updated dependencies [7d4a405]
- Updated dependencies [2613dfb]
- Updated dependencies [a45a0d3]
- Updated dependencies [f3b8bef]
- Updated dependencies [fcad28b]
  - @voyant-travel/commerce-react@0.21.0
  - @voyant-travel/distribution-react@0.129.0
  - @voyant-travel/admin@0.115.4
  - @voyant-travel/inventory-react@0.21.0

## 0.136.4

### Patch Changes

- 7f8f45a: Avoid pinning unscoped Voyant Connect source kinds into admin booking journey links, and keep booking Confirm disabled until live pricing returns a quote id.

## 0.136.3

### Patch Changes

- Updated dependencies [f1090b7]
- Updated dependencies [42f662c]
  - @voyant-travel/i18n@0.109.8
  - @voyant-travel/distribution-react@0.128.4

## 0.136.2

### Patch Changes

- Updated dependencies [b254511]
  - @voyant-travel/ui@0.108.10
  - @voyant-travel/distribution-react@0.128.3

## 0.136.1

### Patch Changes

- Updated dependencies [2d3b039]
  - @voyant-travel/catalog-contracts@0.108.1

## 0.136.0

### Patch Changes

- @voyant-travel/distribution-react@0.128.0
- @voyant-travel/commerce-react@0.20.0
- @voyant-travel/inventory-react@0.20.0

## 0.135.8

### Patch Changes

- cb8df9c: Thread pricing/content scope through the booking journey. `BookingJourney` now accepts an optional `scope` (`market`/`currency`/`locale`/`audience`) and forwards it to its live quote, and `useBookingQuote` includes scope in its React Query key so changing the selected market/currency re-quotes instead of showing a stale price. Storefronts pass the shopper's selected scope so checkout prices in the same market/currency as browse and detail (voyant#2643). Omitting `scope` keeps the previous per-surface default behavior, so admin surfaces are unaffected.

## 0.135.7

### Patch Changes

- c1d45bc: Normalize booking journey quote shapes before rendering so missing or malformed descriptor slices fall back safely instead of crashing storefront booking flows.
- Updated dependencies [66ac9f3]
- Updated dependencies [16ec0cb]
  - @voyant-travel/ui@0.108.8
  - @voyant-travel/inventory-react@0.19.3
  - @voyant-travel/i18n@0.109.4

## 0.135.6

## 0.135.5

### Patch Changes

- Updated dependencies [d4f27d5]
  - @voyant-travel/ui@0.108.5

## 0.135.4

### Patch Changes

- 598be39: Route generic Packages product detail pages through sourced catalog content and slots instead of the Connect package-detail endpoint.

## 0.135.3

### Patch Changes

- 61410dd: Preserve catalog sourced-entry provenance when packaged detail pages start the booking journey.

## 0.135.2

## 0.135.1

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/inventory-react@0.19.1
  - @voyant-travel/distribution-react@0.127.1

## 0.135.0

### Patch Changes

- @voyant-travel/commerce-react@0.19.0
- @voyant-travel/distribution-react@0.127.0
- @voyant-travel/inventory-react@0.19.0

## 0.134.1

### Patch Changes

- Updated dependencies [7cb6fa7]
  - @voyant-travel/i18n@0.109.0
  - @voyant-travel/admin@0.115.2
  - @voyant-travel/commerce-react@0.18.1
  - @voyant-travel/distribution-react@0.126.1
  - @voyant-travel/inventory-react@0.18.1
  - @voyant-travel/ui@0.108.2

## 0.134.0

### Patch Changes

- @voyant-travel/distribution-react@0.126.0
- @voyant-travel/inventory-react@0.18.0
- @voyant-travel/commerce-react@0.18.0

## 0.133.0

### Patch Changes

- @voyant-travel/distribution-react@0.125.0
- @voyant-travel/inventory-react@0.17.0
- @voyant-travel/commerce-react@0.17.0

## 0.132.1

### Patch Changes

- @voyant-travel/distribution-react@0.124.1

## 0.132.0

### Patch Changes

- Updated dependencies [51f7dea]
  - @voyant-travel/commerce-react@0.16.0
  - @voyant-travel/distribution-react@0.124.0
  - @voyant-travel/inventory-react@0.16.0
  - @voyant-travel/admin@0.115.1

## 0.131.0

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/admin@0.115.0
  - @voyant-travel/i18n@0.108.0
  - @voyant-travel/commerce-react@0.15.0
  - @voyant-travel/distribution-react@0.123.0
  - @voyant-travel/inventory-react@0.15.0
  - @voyant-travel/ui@0.108.1

## 0.130.0

### Patch Changes

- Updated dependencies [6a0edd2]
  - @voyant-travel/catalog-contracts@0.108.0
  - @voyant-travel/distribution-react@0.122.0
  - @voyant-travel/inventory-react@0.14.0
  - @voyant-travel/commerce-react@0.14.0

## 0.129.1

### Patch Changes

- @voyant-travel/distribution-react@0.121.1

## 0.129.0

### Patch Changes

- Updated dependencies [310565b]
  - @voyant-travel/i18n@0.107.3
  - @voyant-travel/distribution-react@0.121.0
  - @voyant-travel/inventory-react@0.13.0
  - @voyant-travel/commerce-react@0.13.0

## 0.128.0

### Patch Changes

- Updated dependencies [dbea53e]
  - @voyant-travel/i18n@0.107.2
  - @voyant-travel/distribution-react@0.120.0
  - @voyant-travel/inventory-react@0.12.0
  - @voyant-travel/commerce-react@0.12.0

## 0.127.0

### Patch Changes

- @voyant-travel/distribution-react@0.119.0
- @voyant-travel/inventory-react@0.11.0
- @voyant-travel/commerce-react@0.11.0

## 0.126.0

### Patch Changes

- @voyant-travel/inventory-react@0.10.0
- @voyant-travel/commerce-react@0.10.0
- @voyant-travel/distribution-react@0.118.0

## 0.125.0

### Patch Changes

- @voyant-travel/distribution-react@0.117.0
- @voyant-travel/inventory-react@0.9.0
- @voyant-travel/commerce-react@0.9.0

## 0.124.1

### Patch Changes

- @voyant-travel/distribution-react@0.116.1

## 0.124.0

### Patch Changes

- @voyant-travel/commerce-react@0.8.0
- @voyant-travel/distribution-react@0.116.0
- @voyant-travel/inventory-react@0.8.0

## 0.123.1

### Patch Changes

- c64d288: Fix Romanian i18n gaps on operator admin surfaces.

  - `@voyant-travel/catalog-react`: the cruises and accommodations browse pages rendered the static English route `title` prop as their heading; they now read the localized label from `useOperatorAdminMessages().nav.*`, matching the other catalog verticals.
  - `@voyant-travel/i18n`: corrected the quotes terminology in Romanian (operator nav + CRM org-detail) from "Cotatii" to "Oferte" so it matches the quotes package, and added a `trips.list.composeTrip` label (used by the operator's "Compose trip" action on the bookings list).

- Updated dependencies [c64d288]
  - @voyant-travel/i18n@0.107.1

## 0.123.0

### Patch Changes

- Updated dependencies [a74471e]
- Updated dependencies [a74471e]
  - @voyant-travel/i18n@0.107.0
  - @voyant-travel/ui@0.108.0
  - @voyant-travel/admin@0.114.0
  - @voyant-travel/commerce-react@0.7.0
  - @voyant-travel/distribution-react@0.115.0
  - @voyant-travel/inventory-react@0.7.0

## 0.122.0

### Patch Changes

- 4f92198: Voyant 1.0 visual refactor of the framework UI.

  - **Tokens** (`@voyant-travel/ui` `globals.css`): warm off-white paper, near-black ink, and a single hot-orange brand accent (`--brand`, new token) reserved for charts/focus/active state. Inter Tight type. Fixed brand chart palette (`--chart-1..5`). A coherent radius system: controls + their dropdowns at `rounded-sm` (4px), cards/table surfaces at `rounded-md` (6px), dialogs/sheets at `rounded-xl`.
  - **`@voyant-travel/ui` components**: new `SegmentedControl`; `Button` gains a `brand` variant; sharper, consistent radii across Button/Input/Select/Combobox/Textarea/Toggle/Tabs/Menus/Command/Card/DataTable/Badge; bordered active sidebar items (primary + sub) and inset-panel border; assorted fixes (Command search-input radius, toggle-group corners, sidebar sub-menu spacing).
  - **`@voyant-travel/admin`**: Voyant 1.0 brand logo lockup (composed mark + wordmark, collapse-to-badge); operator shell defaults to the inset sidebar layout; dashboard KPI cards, brand chart colors, and Figma-matched sidebar (bordered active item, near-black nav text, bordered user card with open-state).
  - **Domain `*-react` packages**: card surfaces normalized to the new `rounded-md` radius; flights search bar (trip-type toggle, route cards, airport dropdown) and the resources tabs aligned to the system.

- Updated dependencies [4f92198]
  - @voyant-travel/ui@0.107.0
  - @voyant-travel/admin@0.113.0
  - @voyant-travel/commerce-react@0.6.0
  - @voyant-travel/distribution-react@0.114.0
  - @voyant-travel/inventory-react@0.6.0

## 0.121.0

### Patch Changes

- Updated dependencies [94890c3]
- Updated dependencies [cb9b04b]
  - @voyant-travel/admin@0.112.0
  - @voyant-travel/commerce-react@0.5.0
  - @voyant-travel/distribution-react@0.113.0
  - @voyant-travel/inventory-react@0.5.0

## 0.120.2

### Patch Changes

- 4353c6f: Use the operator default market scope for embedded catalog browse requests so hidden market selectors do not fall back to the hardcoded default locale or omit the market.

## 0.120.1

### Patch Changes

- a9dcf89: Fix catalog browse defaults so product projections expose supply models for scheduled/dynamic locks and embedded catalog admins resolve locale from the loaded operator market.

## 0.120.0

### Patch Changes

- @voyant-travel/inventory-react@0.4.0
- @voyant-travel/commerce-react@0.4.0
- @voyant-travel/distribution-react@0.112.0

## 0.119.0

### Patch Changes

- @voyant-travel/commerce-react@0.3.0
- @voyant-travel/inventory-react@0.3.0
- @voyant-travel/distribution-react@0.111.0

## 0.118.1

### Patch Changes

- eef1a00: Republish notification and UI consumer packages so stale beta artifacts no longer reference legacy notification package specifiers.
- Updated dependencies [eef1a00]
  - @voyant-travel/admin@0.111.2
  - @voyant-travel/commerce-react@0.2.1
  - @voyant-travel/distribution-react@0.110.4
  - @voyant-travel/inventory-react@0.2.1

## 0.118.0

### Patch Changes

- 47fef18: Retarget first-party imports from the removed beta package names to their owner
  packages. Operated product UI now imports Inventory React, commercial UI imports
  Commerce React, supplier UI imports Distribution React, checkout UI imports
  Finance React, and operated place/availability schema references import
  Operations owner paths.
- Updated dependencies [dd71543]
- Updated dependencies [97d520c]
- Updated dependencies [85f9ce1]
- Updated dependencies [3cc83b6]
- Updated dependencies [3408b2a]
- Updated dependencies [3e160d3]
- Updated dependencies [65b3782]
- Updated dependencies [a101971]
- Updated dependencies [47fef18]
  - @voyant-travel/admin@0.111.1
  - @voyant-travel/commerce-react@0.2.0
  - @voyant-travel/inventory-react@0.2.0
  - @voyant-travel/distribution-react@0.110.0

## 0.117.2

### Patch Changes

- bd74fb0: Split oversized catalog React, booking route, and contract modules into focused internal files while preserving existing public exports and behavior.
- Updated dependencies [e6d9a61]
- Updated dependencies [bd74fb0]
  - @voyant-travel/products-react@0.119.3
  - @voyant-travel/catalog-contracts@0.107.1

## 0.117.1

### Patch Changes

- @voyant-travel/markets-react@0.107.5
- @voyant-travel/products-react@0.119.1
- @voyant-travel/suppliers-react@0.111.6

## 0.117.0

### Patch Changes

- @voyant-travel/products-react@0.119.0
- @voyant-travel/ui@0.106.1
- @voyant-travel/markets-react@0.107.4
- @voyant-travel/suppliers-react@0.111.5

## 0.116.0

### Patch Changes

- @voyant-travel/products-react@0.118.0
- @voyant-travel/suppliers-react@0.111.4

## 0.115.1

### Patch Changes

- @voyant-travel/markets-react@0.107.3
- @voyant-travel/products-react@0.117.1
- @voyant-travel/suppliers-react@0.111.3

## 0.115.0

### Patch Changes

- @voyant-travel/markets-react@0.107.2
- @voyant-travel/products-react@0.117.0
- @voyant-travel/suppliers-react@0.111.2

## 0.114.0

### Patch Changes

- @voyant-travel/products-react@0.116.0
- @voyant-travel/markets-react@0.107.1
- @voyant-travel/suppliers-react@0.111.1

## 0.113.0

### Minor Changes

- 41b08db: Packaged-admin final sweep: the CORE admin pages ship from
  `@voyant-travel/admin-app` as a built-in extension, and index redirects become
  contribution-driven. The operator deleted its last 18 core route files
  (12 settings files, `/account`, the dashboard host, and the 4 domain index
  redirects) plus the superseded settings/account components.

  - `@voyant-travel/admin`: `AdminUiRouteContribution` grows `redirectTo?: string`
    (a redirect contribution counts as implemented on its own — host binders
    emit a before-load redirect, which also covers SSR) and `children?:
AdminUiRouteContribution[]` (nested child contributions under a layout
    contribution; child paths are parent-relative, `"/"` is the index). New
    `findAdminRouteContribution` does the depth-first lookup;
    `requireImplementedAdminRoute` accepts redirect contributions and
    resolves nested children.
  - `@voyant-travel/admin-app`: new `createAdminCoreExtension(options)` (exported
    from the root and `./core-extension`) — the `core` extension contributing
    `/` (the dashboard page behind a lazy chunk; hosts supply an SSR
    aggregates loader via `dashboard.loader`), `/account` (auth-react's
    packaged `AccountPage`), and the `/settings` area: a packaged layout
    (grouped sub-nav + outlet, labels resolved reactively from the operator
    admin messages) with nested children — an index redirect (default
    `/settings/channels`) and the nine built-in pages (team, API tokens,
    channels, taxes, cost categories, pricing categories, price catalogs,
    product types, product tags). Surfaces eject with `false`; built-in
    settings pages drop via `settings.omit`; app-custom settings pages splice
    in via `settings.extraPages` (the operator's Operator Profile page uses
    this). The binder gains redirect support (`beforeLoad` throwing the
    router redirect) and `adminExtensionChildRoutes(...)` for binding
    runtime-known children the generated route module cannot emit
    statically. The new domain peers (auth/distribution/finance/pricing/
    products react) are optional and only loaded by the lazy page/loader
    chunks.
  - `@voyant-travel/catalog-react` / `@voyant-travel/finance-react` /
    `@voyant-travel/legal-react` / `@voyant-travel/notifications-react`: the admin
    extensions contribute their index redirect (`/catalog` →
    `/catalog/products`, `/finance` → `/finance/invoices`, `/legal` →
    `/legal/contracts`, `/notifications` → `/notifications/templates`),
    replacing the operator's redirect route files.
  - Host typed-link merge note: extension routes now REPLACE file routes on
    key conflicts in the merged route-type maps (`Omit` before the
    intersection) — the pathless workspace layout claims `/` in the generated
    file types once the index file route is deleted, while at runtime `/` is
    the core extension's dashboard route.

### Patch Changes

- Updated dependencies [41b08db]
- Updated dependencies [6d496d0]
  - @voyant-travel/admin@0.111.0
  - @voyant-travel/products-react@0.115.0
  - @voyant-travel/suppliers-react@0.111.0

## 0.112.0

### Patch Changes

- @voyant-travel/products-react@0.114.0
- @voyant-travel/suppliers-react@0.110.1

## 0.111.0

### Patch Changes

- Updated dependencies [9c909e2]
  - @voyant-travel/admin@0.110.0
  - @voyant-travel/suppliers-react@0.110.0
  - @voyant-travel/products-react@0.113.0

## 0.110.0

### Minor Changes

- 279f97c: Slim the admin entry barrels so the host's workspace-chrome chunk stops pinning domain data layers and page hosts (operator client entry: 3.74 MB → 1.83 MB).

  - Route contribution loaders now resolve query options / page-data helpers via dynamic `import()` inside the loader body, keeping clients + response schemas (and the backend validation graphs they pull) out of the eagerly evaluated entry chunk.
  - `@voyant-travel/<domain>-react/admin` barrels no longer re-export page/host/dialog/widget component **values** (packaged-admin RFC §4.8 endgame rule: specific modules, never barrels). Their prop **types** still re-export from the barrels; import component values from their specific modules instead (e.g. `@voyant-travel/bookings-react/admin/booking-detail-host`). New `./admin/*` subpath exports on `@voyant-travel/bookings-react` and `@voyant-travel/availability-react` cover the known host-side imports.
  - Widget slot ids moved into lean `admin/slots` modules (`bookings-react`, `crm-react`, `suppliers-react`); the host modules re-export them, so existing imports keep working.
  - Widget contributions (`PersonBookingsWidget`, the four finance cards) now mount through Suspense-wrapped `React.lazy` loaders, so their chunks fetch when the slot actually renders.
  - Search schemas stay synchronous: `catalogSearchSchema` re-exports from the schema-only `catalog-search-params` module instead of the catalog main barrel; the bookings search contracts already lived in the admin entry.
  - Resources detail-page skeletons extracted to `components/resource-detail-skeletons` (re-exported from the page modules) so `pendingComponent`s no longer pin the detail pages into the entry graph.

### Patch Changes

- Updated dependencies [279f97c]
- Updated dependencies [faec538]
  - @voyant-travel/suppliers-react@0.109.0
  - @voyant-travel/admin@0.109.0
  - @voyant-travel/products-react@0.112.0

## 0.109.0

### Minor Changes

- 478aa7c: Packaged-admin RFC §4.8 endgame — the code-assembled extension route tree.
  Package-delivered admin pages exist as NO per-route files in the host: the
  operator deleted ~50 thin host route files across all 10 admin domains; the
  route tree for extension routes is assembled in code from the contributions
  and grafted under the file-based workspace layout, with typed links intact.

  - `@voyant-travel/admin`: `AdminUiRouteContribution` grows `page?: () =>
Promise<AdminRoutePageModule>` — a lazy page-module loader (pages stay
    code-split, hover/intent preloading fetches the chunk ahead of
    navigation). The resolved component receives `AdminRoutePageProps`
    (`params`/`search`/`updateSearch`/`title`), dissolving the old "zero-prop
    components only" restriction — param-taking detail pages need no host
    route file. `AdminRouteLoaderContext` gains `params`. New helpers:
    `requireImplementedAdminRoute` (loud failure at module evaluation when a
    bound contribution loses its implementation) and `adminRoutePageModule`
    (adapter for zero-prop / all-optional-prop hosts).
  - `@voyant-travel/admin-app`: new binder — `adminExtensionRouteOptions(extension,
routeId, runtime)` returns router-facing route options (lazy component,
    loader bound to `{ queryClient, runtime, params }`, per-route `ssr`,
    boundaries) ready to spread into a code-based `createRoute({...})`, and
    `attachAdminExtensionRoutes(routeTree, parentRoute, routes)` grafts the
    built routes under the workspace layout idempotently (replace-by-path,
    dev-server re-evaluation safe).
  - All 10 `*-react` admin extensions now carry full route implementations:
    lazy `page` loaders (dynamic imports of the specific host modules, never
    the admin barrel), loaders moved verbatim from the operator route files
    (SSR modes preserved exactly, `data-only` included), pending skeletons,
    and search contracts. Bookings adds host-composition options
    (`indexHeaderActions`, `detailPageComponent` + exported
    `BookingDetailPageComponentProps`) so app-owned composition rides through
    the factory instead of a route file. Finance's supplier-invoices pages
    stay metadata-only (app-owned upload/supplier-picker/cross-domain search
    wiring) and remain host route files.

  Hosts bind everything in one checked-in generated module
  (`src/admin.routes.generated.tsx`): per route a `createRoute` call with the
  path literal + typed search schema, spreading the binder options, plus
  `AdminExtensionRoutesBy*` typed-link maps that `router.tsx` merges with the
  generated `FileRouteTypes` via `_addFileTypes` — `Link`/`navigate` stay
  fully typed for file routes and extension routes alike.

### Patch Changes

- Updated dependencies [478aa7c]
  - @voyant-travel/admin@0.108.0
  - @voyant-travel/suppliers-react@0.108.0
  - @voyant-travel/products-react@0.111.0

## 0.108.1

### Patch Changes

- e3fa849: Move shared booking-engine client/server types into `@voyant-travel/catalog-contracts`.

  `BookingDraftShape` and the draft-shape descriptor types + defaults (`PaxBandSpec`, `PaxBandDependency`, `DEFAULT_PAX_BANDS`, `defaultDraftShapeFlags`, `defaultTravelerFields`, `defaultBookingFields`, `paxBandsAllowedTotalFrom`, …) now live at `@voyant-travel/catalog-contracts/booking-engine/draft-shape`, and `BookingPaymentIntent` joins the V1 wire contracts at `@voyant-travel/catalog-contracts/booking-engine/contracts`. This removes the layering leak where client packages (`@voyant-travel/bookings-react`, `@voyant-travel/catalog-react`) imported contract types from the backend `@voyant-travel/catalog/booking-engine` entry — both now depend on `@voyant-travel/catalog-contracts` instead and no longer depend on `@voyant-travel/catalog` at all.

  `@voyant-travel/catalog/booking-engine` re-exports all moved symbols, so existing backend importers keep working with zero changes.

- Updated dependencies [e3fa849]
  - @voyant-travel/catalog-contracts@0.107.0

## 0.108.0

### Minor Changes

- 6c27159: Merge each module's `*-ui` package into its `*-react` sibling (#1652). The
  `*-react` package is now the whole client tier: the headless exports (root,
  `./hooks`, `./client`, `./provider`) are unchanged, and the styled tier moves
  in under new subpaths — `./ui` (the old `*-ui` root barrel), `./components/*`,
  `./admin`, `./i18n`, `./i18n/en`, `./i18n/ro`, and `./styles.css`.

  Migration from `@voyant-travel/<module>-ui`:

  - `@voyant-travel/<module>-ui` → `@voyant-travel/<module>-react/ui`
  - `@voyant-travel/<module>-ui/<subpath>` → `@voyant-travel/<module>-react/<subpath>`
  - package.json: drop the `-ui` dependency; `-react` covers both tiers.

  Styled-tier peers (`@voyant-travel/ui`, `@voyant-travel/admin`, `@tanstack/react-table`,
  `sonner`, `react-hook-form`, sibling `*-react` hooks packages) are optional
  peers — headless consumers that only import the root/`hooks`/`client` subpaths
  do not need them. The 27 `@voyant-travel/*-ui` packages are deprecated on npm in
  favor of these subpaths; `@voyant-travel/allocation-ui` and
  `@voyant-travel/workflow-runs-ui` (no `-react` sibling) are unaffected.

### Patch Changes

- Updated dependencies [6c27159]
- Updated dependencies [eeb23df]
  - @voyant-travel/markets-react@0.107.0
  - @voyant-travel/products-react@0.110.0
  - @voyant-travel/suppliers-react@0.107.0
  - @voyant-travel/admin@0.107.0
  - @voyant-travel/catalog@0.108.0

## 0.107.0

### Patch Changes

- @voyant-travel/catalog@0.107.0

## 0.106.0

### Patch Changes

- Updated dependencies [7122c2a]
  - @voyant-travel/catalog@0.106.0

## 0.105.1

### Patch Changes

- @voyant-travel/catalog@0.105.1

## 0.105.0

### Patch Changes

- Updated dependencies [c2aef18]
  - @voyant-travel/catalog@0.105.0

## 0.104.7

### Patch Changes

- Updated dependencies [0bd9900]
  - @voyant-travel/catalog@0.104.7

## 0.104.6

### Patch Changes

- Updated dependencies [372295b]
  - @voyant-travel/catalog@0.104.6

## 0.104.5

### Patch Changes

- @voyant-travel/catalog@0.104.5

## 0.104.4

### Patch Changes

- @voyant-travel/catalog@0.104.4

## 0.104.3

### Patch Changes

- Updated dependencies [5c467ab]
  - @voyant-travel/catalog@0.104.3

## 0.104.2

### Patch Changes

- @voyant-travel/catalog@0.104.2

## 0.104.1

### Patch Changes

- @voyant-travel/catalog@0.104.1
- @voyant-travel/react@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/catalog@0.104.0
- @voyant-travel/react@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/catalog@0.103.0
- @voyant-travel/react@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/catalog@0.102.0
- @voyant-travel/react@0.102.0

## 0.101.2

### Patch Changes

- @voyant-travel/catalog@0.101.2
- @voyant-travel/react@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/catalog@0.101.1
- @voyant-travel/react@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/catalog@0.101.0
- @voyant-travel/react@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/catalog@0.100.0
- @voyant-travel/react@0.100.0

## 0.99.0

### Patch Changes

- @voyant-travel/catalog@0.99.0
- @voyant-travel/react@0.99.0

## 0.98.0

### Patch Changes

- @voyant-travel/catalog@0.98.0
- @voyant-travel/react@0.98.0

## 0.97.0

### Patch Changes

- Updated dependencies [2555264]
  - @voyant-travel/catalog@0.97.0
  - @voyant-travel/react@0.97.0

## 0.96.0

### Patch Changes

- Updated dependencies [2d8d59b]
  - @voyant-travel/catalog@0.96.0
  - @voyant-travel/react@0.96.0

## 0.95.0

### Patch Changes

- Updated dependencies [a8d3a3f]
  - @voyant-travel/catalog@0.95.0
  - @voyant-travel/react@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/catalog@0.94.0
- @voyant-travel/react@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/catalog@0.93.0
- @voyant-travel/react@0.93.0

## 0.92.0

### Patch Changes

- Updated dependencies [5de3d72]
  - @voyant-travel/catalog@0.92.0
  - @voyant-travel/react@0.92.0

## 0.91.0

### Patch Changes

- @voyant-travel/catalog@0.91.0
- @voyant-travel/react@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/catalog@0.90.0
- @voyant-travel/react@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/catalog@0.89.0
- @voyant-travel/react@0.89.0

## 0.88.0

### Patch Changes

- Updated dependencies [27afa4b]
  - @voyant-travel/catalog@0.88.0
  - @voyant-travel/react@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/catalog@0.87.1
- @voyant-travel/react@0.87.1

## 0.87.0

### Patch Changes

- Updated dependencies [85505e6]
  - @voyant-travel/catalog@0.87.0
  - @voyant-travel/react@0.87.0

## 0.86.0

### Minor Changes

- ddf4a19: Add typed catalog search sort options and an optional storefront card projection for public listing pages.

### Patch Changes

- Updated dependencies [ddf4a19]
  - @voyant-travel/catalog@0.86.0
  - @voyant-travel/react@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/catalog@0.85.4
- @voyant-travel/react@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/catalog@0.85.3
- @voyant-travel/react@0.85.3

## 0.85.2

### Patch Changes

- @voyant-travel/catalog@0.85.2
- @voyant-travel/react@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/catalog@0.85.1
- @voyant-travel/react@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/catalog@0.85.0
- @voyant-travel/react@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/catalog@0.84.4
- @voyant-travel/react@0.84.4

## 0.84.3

### Patch Changes

- @voyant-travel/catalog@0.84.3
- @voyant-travel/react@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/catalog@0.84.2
- @voyant-travel/react@0.84.2

## 0.84.1

### Patch Changes

- @voyant-travel/catalog@0.84.1
- @voyant-travel/react@0.84.1

## 0.84.0

### Patch Changes

- @voyant-travel/catalog@0.84.0
- @voyant-travel/react@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/catalog@0.83.1
- @voyant-travel/react@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/catalog@0.83.0
- @voyant-travel/react@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/catalog@0.82.1
- @voyant-travel/react@0.82.1

## 0.82.0

### Patch Changes

- @voyant-travel/catalog@0.82.0
- @voyant-travel/react@0.82.0

## 0.81.21

### Patch Changes

- @voyant-travel/catalog@0.81.21
- @voyant-travel/react@0.81.21

## 0.81.20

### Patch Changes

- @voyant-travel/catalog@0.81.20
- @voyant-travel/react@0.81.20

## 0.81.19

### Patch Changes

- @voyant-travel/catalog@0.81.19
- @voyant-travel/react@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/catalog@0.81.18
- @voyant-travel/react@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/catalog@0.81.17
- @voyant-travel/react@0.81.17

## 0.81.16

### Patch Changes

- Updated dependencies [0a617cc]
  - @voyant-travel/catalog@0.81.16
  - @voyant-travel/react@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/catalog@0.81.15
- @voyant-travel/react@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/catalog@0.81.14
- @voyant-travel/react@0.81.14

## 0.81.13

### Patch Changes

- @voyant-travel/catalog@0.81.13
- @voyant-travel/react@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/catalog@0.81.12
- @voyant-travel/react@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/catalog@0.81.11
- @voyant-travel/react@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/catalog@0.81.10
- @voyant-travel/react@0.81.10

## 0.81.9

### Patch Changes

- @voyant-travel/catalog@0.81.9
- @voyant-travel/react@0.81.9

## 0.81.8

### Patch Changes

- @voyant-travel/catalog@0.81.8
- @voyant-travel/react@0.81.8

## 0.81.7

### Patch Changes

- @voyant-travel/catalog@0.81.7
- @voyant-travel/react@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/catalog@0.81.6
- @voyant-travel/react@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/catalog@0.81.5
- @voyant-travel/react@0.81.5

## 0.81.4

### Patch Changes

- @voyant-travel/catalog@0.81.4
- @voyant-travel/react@0.81.4

## 0.81.3

### Patch Changes

- @voyant-travel/catalog@0.81.3
- @voyant-travel/react@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/catalog@0.81.2
- @voyant-travel/react@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/catalog@0.81.1
- @voyant-travel/react@0.81.1

## 0.81.0

### Patch Changes

- @voyant-travel/catalog@0.81.0
- @voyant-travel/react@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/catalog@0.80.18
- @voyant-travel/react@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/catalog@0.80.17
- @voyant-travel/react@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/catalog@0.80.16
- @voyant-travel/react@0.80.16

## 0.80.15

### Patch Changes

- @voyant-travel/catalog@0.80.15
- @voyant-travel/react@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/catalog@0.80.14
- @voyant-travel/react@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/catalog@0.80.13
- @voyant-travel/react@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/catalog@0.80.12
- @voyant-travel/react@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/catalog@0.80.11
- @voyant-travel/react@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/catalog@0.80.10
- @voyant-travel/react@0.80.10

## 0.80.9

### Patch Changes

- @voyant-travel/catalog@0.80.9
- @voyant-travel/react@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/catalog@0.80.8
- @voyant-travel/react@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/catalog@0.80.7
- @voyant-travel/react@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/catalog@0.80.6
- @voyant-travel/react@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/catalog@0.80.5
- @voyant-travel/react@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/catalog@0.80.4
- @voyant-travel/react@0.80.4

## 0.80.3

### Patch Changes

- @voyant-travel/catalog@0.80.3
- @voyant-travel/react@0.80.3

## 0.80.2

### Patch Changes

- @voyant-travel/catalog@0.80.2
- @voyant-travel/react@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/catalog@0.80.1
- @voyant-travel/react@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/catalog@0.80.0
- @voyant-travel/react@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/catalog@0.79.0
- @voyant-travel/react@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/catalog@0.78.0
- @voyant-travel/react@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/catalog@0.77.13
- @voyant-travel/react@0.77.13

## 0.77.12

### Patch Changes

- @voyant-travel/catalog@0.77.12
- @voyant-travel/react@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/catalog@0.77.11
- @voyant-travel/react@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/catalog@0.77.10
- @voyant-travel/react@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/catalog@0.77.9
- @voyant-travel/react@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/catalog@0.77.8
- @voyant-travel/react@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/catalog@0.77.7
- @voyant-travel/react@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/catalog@0.77.6
- @voyant-travel/react@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/catalog@0.77.5
- @voyant-travel/react@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/catalog@0.77.4
- @voyant-travel/react@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/catalog@0.77.3
- @voyant-travel/react@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/catalog@0.77.2
- @voyant-travel/react@0.77.2

## 0.77.1

### Patch Changes

- @voyant-travel/catalog@0.77.1
- @voyant-travel/react@0.77.1

## 0.77.0

### Patch Changes

- @voyant-travel/catalog@0.77.0
- @voyant-travel/react@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/catalog@0.76.0
- @voyant-travel/react@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/catalog@0.75.7
- @voyant-travel/react@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/catalog@0.75.6
- @voyant-travel/react@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/catalog@0.75.5
- @voyant-travel/react@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/catalog@0.75.4
- @voyant-travel/react@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/catalog@0.75.3
- @voyant-travel/react@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/catalog@0.75.2
- @voyant-travel/react@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/catalog@0.75.1
- @voyant-travel/react@0.75.1

## 0.75.0

### Patch Changes

- @voyant-travel/catalog@0.75.0
- @voyant-travel/react@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/catalog@0.74.2
- @voyant-travel/react@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/catalog@0.74.1
- @voyant-travel/react@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/catalog@0.74.0
- @voyant-travel/react@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/catalog@0.73.1
- @voyant-travel/react@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/catalog@0.73.0
- @voyant-travel/react@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/catalog@0.72.0
- @voyant-travel/react@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/catalog@0.71.0
- @voyant-travel/react@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/catalog@0.70.0
- @voyant-travel/react@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/catalog@0.69.1
- @voyant-travel/react@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/catalog@0.69.0
- @voyant-travel/react@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/catalog@0.68.0
- @voyant-travel/react@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/catalog@0.67.0
- @voyant-travel/react@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/catalog@0.66.6
- @voyant-travel/react@0.66.6

## 0.66.5

### Patch Changes

- @voyant-travel/catalog@0.66.5
- @voyant-travel/react@0.66.5

## 0.66.4

### Patch Changes

- @voyant-travel/catalog@0.66.4
- @voyant-travel/react@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/catalog@0.66.3
- @voyant-travel/react@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/catalog@0.66.2
- @voyant-travel/react@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/catalog@0.66.1
- @voyant-travel/react@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/catalog@0.66.0
- @voyant-travel/react@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/catalog@0.65.0
- @voyant-travel/react@0.65.0

## 0.64.1

### Patch Changes

- @voyant-travel/catalog@0.64.1
- @voyant-travel/react@0.64.1

## 0.64.0

### Patch Changes

- @voyant-travel/catalog@0.64.0
- @voyant-travel/react@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/catalog@0.63.1
- @voyant-travel/react@0.63.1

## 0.63.0

### Patch Changes

- @voyant-travel/catalog@0.63.0
- @voyant-travel/react@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/catalog@0.62.3
- @voyant-travel/react@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/catalog@0.62.2
- @voyant-travel/react@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/catalog@0.62.1
- @voyant-travel/react@0.62.1

## 0.62.0

### Patch Changes

- @voyant-travel/catalog@0.62.0
- @voyant-travel/react@0.62.0

## 0.61.0

### Patch Changes

- @voyant-travel/catalog@0.61.0
- @voyant-travel/react@0.61.0

## 0.60.0

### Patch Changes

- @voyant-travel/catalog@0.60.0
- @voyant-travel/react@0.60.0

## 0.59.0

### Patch Changes

- Updated dependencies [48927be]
  - @voyant-travel/catalog@0.59.0
  - @voyant-travel/react@0.59.0

## 0.58.0

### Patch Changes

- Updated dependencies [5b21488]
  - @voyant-travel/catalog@0.58.0
  - @voyant-travel/react@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/catalog@0.57.0
- @voyant-travel/react@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/catalog@0.56.0
- @voyant-travel/react@0.56.0

## 0.55.1

### Patch Changes

- Updated dependencies [819c847]
  - @voyant-travel/catalog@0.55.1
  - @voyant-travel/react@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/catalog@0.55.0
- @voyant-travel/react@0.55.0

## 0.54.0

### Patch Changes

- @voyant-travel/catalog@0.54.0
- @voyant-travel/react@0.54.0

## 0.53.2

### Patch Changes

- @voyant-travel/catalog@0.53.2
- @voyant-travel/react@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/catalog@0.53.1
- @voyant-travel/react@0.53.1

## 0.53.0

### Patch Changes

- @voyant-travel/catalog@0.53.0
- @voyant-travel/react@0.53.0

## 0.52.4

### Patch Changes

- @voyant-travel/catalog@0.52.4
- @voyant-travel/react@0.52.4

## 0.52.3

### Patch Changes

- @voyant-travel/catalog@0.52.3
- @voyant-travel/react@0.52.3

## 0.52.2

### Patch Changes

- @voyant-travel/catalog@0.52.2
- @voyant-travel/react@0.52.2

## 0.52.1

### Patch Changes

- @voyant-travel/catalog@0.52.1
- @voyant-travel/react@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/catalog@0.52.0
- @voyant-travel/react@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/catalog@0.51.1
- @voyant-travel/react@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/catalog@0.51.0
- @voyant-travel/react@0.51.0

## 0.50.8

### Patch Changes

- @voyant-travel/catalog@0.50.8
- @voyant-travel/react@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/catalog@0.50.7
- @voyant-travel/react@0.50.7

## 0.50.6

### Patch Changes

- @voyant-travel/catalog@0.50.6
- @voyant-travel/react@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/catalog@0.50.5
- @voyant-travel/react@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/catalog@0.50.4
- @voyant-travel/react@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/catalog@0.50.3
- @voyant-travel/react@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/catalog@0.50.2
- @voyant-travel/react@0.50.2

## 0.50.1

### Patch Changes

- @voyant-travel/catalog@0.50.1
- @voyant-travel/react@0.50.1

## 0.50.0

### Patch Changes

- @voyant-travel/catalog@0.50.0
- @voyant-travel/react@0.50.0

## 0.49.0

### Patch Changes

- @voyant-travel/catalog@0.49.0
- @voyant-travel/react@0.49.0

## 0.48.0

### Patch Changes

- @voyant-travel/catalog@0.48.0
- @voyant-travel/react@0.48.0

## 0.47.0

### Patch Changes

- @voyant-travel/catalog@0.47.0
- @voyant-travel/react@0.47.0

## 0.46.0

### Patch Changes

- @voyant-travel/catalog@0.46.0
- @voyant-travel/react@0.46.0

## 0.45.0

### Patch Changes

- @voyant-travel/catalog@0.45.0
- @voyant-travel/react@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/catalog@0.44.0
- @voyant-travel/react@0.44.0

## 0.43.0

### Patch Changes

- @voyant-travel/catalog@0.43.0
- @voyant-travel/react@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/catalog@0.42.0
- @voyant-travel/react@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/catalog@0.41.3
- @voyant-travel/react@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/catalog@0.41.2
- @voyant-travel/react@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/catalog@0.41.1
- @voyant-travel/react@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/catalog@0.41.0
- @voyant-travel/react@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/catalog@0.40.1
- @voyant-travel/react@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/catalog@0.40.0
- @voyant-travel/react@0.40.0

## 0.39.0

### Patch Changes

- @voyant-travel/catalog@0.39.0
- @voyant-travel/react@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/catalog@0.38.2
- @voyant-travel/react@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/catalog@0.38.1
- @voyant-travel/react@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/catalog@0.38.0
- @voyant-travel/react@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/catalog@0.37.1
- @voyant-travel/react@0.37.1

## 0.37.0

### Patch Changes

- @voyant-travel/catalog@0.37.0
- @voyant-travel/react@0.37.0

## 0.36.0

### Patch Changes

- @voyant-travel/catalog@0.36.0
- @voyant-travel/react@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/catalog@0.35.0
- @voyant-travel/react@0.35.0

## 0.34.0

### Patch Changes

- @voyant-travel/catalog@0.34.0
- @voyant-travel/react@0.34.0

## 0.33.1

### Patch Changes

- @voyant-travel/catalog@0.33.1
- @voyant-travel/react@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/catalog@0.33.0
- @voyant-travel/react@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/catalog@0.32.3
- @voyant-travel/react@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/catalog@0.32.2
- @voyant-travel/react@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/catalog@0.32.1
- @voyant-travel/react@0.32.1

## 0.32.0

### Patch Changes

- @voyant-travel/catalog@0.32.0
- @voyant-travel/react@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/catalog@0.31.4
- @voyant-travel/react@0.31.4

## 0.31.3

### Patch Changes

- @voyant-travel/catalog@0.31.3
- @voyant-travel/react@0.31.3

## 0.31.2

### Patch Changes

- @voyant-travel/catalog@0.31.2
- @voyant-travel/react@0.31.2

## 0.31.1

### Patch Changes

- @voyant-travel/catalog@0.31.1
- @voyant-travel/react@0.31.1

## 0.31.0

### Patch Changes

- @voyant-travel/catalog@0.31.0
- @voyant-travel/react@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/catalog@0.30.7
- @voyant-travel/react@0.30.7

## 0.30.6

### Patch Changes

- @voyant-travel/catalog@0.30.6
- @voyant-travel/react@0.30.6

## 0.30.5

### Patch Changes

- @voyant-travel/catalog@0.30.5
- @voyant-travel/react@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/catalog@0.30.4
- @voyant-travel/react@0.30.4

## 0.30.3

### Patch Changes

- @voyant-travel/catalog@0.30.3
- @voyant-travel/react@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/catalog@0.30.2
- @voyant-travel/react@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/catalog@0.30.1
- @voyant-travel/react@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/catalog@0.30.0
- @voyant-travel/react@0.30.0

## 0.29.0

### Patch Changes

- 583326e: PR4 of #497: booking-engine + storefront integration.

  Customers can now enter a promotion code at checkout, see the discount applied to the pre-tax base on the quote, complete the booking, and end up with a redemption row recorded by the post-commit subscriber. Storefront's `/v1/public/products/:productId/offers` and `/v1/public/offers/:slug` endpoints (previously empty) now return real data.

  **`@voyant-travel/catalog`** —

  - **Field rename**: `BookingDraft.voucher: { code }` → `BookingDraft.promotionCode: string`. Avoids permanent collision with the finance `vouchers` domain. Single live consumer (`@voyant-travel/catalog-react`'s `useBookingQuote` hook) updated.
  - **New `./booking-engine` exports**: `AppliedOffer`, `CodeStatus`, `PromotionEvaluationInput`, `PromotionEvaluationOutput` — the contract types templates implement to wire promotions. Catalog stays decoupled from `@voyant-travel/promotions`.
  - **`QuoteEntityDeps.evaluatePromotions`** — optional async hook called inside `quoteEntity` after the adapter returns pricing (only for `entity_module === "products"` in v1). Discounts apply to `pricing.base_amount` pre-tax so the operator template's `applyOperatorTaxToQuoteResult` step downstream recomputes taxes against the new base. Bad-code outcomes surface as `code_*` `invalidReason` on the quote (`code_not_found`, `code_expired`, `code_not_yet_valid`, `code_not_applicable`).
  - **`CatalogBookingRoutesOptions.resolveEvaluatePromotions`** — per-request callback templates wire so the hook closes over the request's `db`.
  - **Schema additions**:
    - `catalog_quotes.pricing_applied_offers` (JSONB, typed `AppliedOffer[]`).
    - `booking_catalog_snapshot.pricing_applied_offers` (JSONB) — frozen for audit; survives source-offer mutation.
    - Index `idx_catalog_quotes_consumed_booking` on `consumed_booking_id` for the post-commit subscriber's lookup.
  - **`PricingBasis.appliedOffers?: AppliedOffer[]`** added in-memory; `readPricingBasis`, `readPricingFromQuote`, `snapshotToPricing`, `captureSnapshot`, and `captureSnapshotGraph` all updated to round-trip the field.

  **`@voyant-travel/promotions`** —

  - **`./service-catalog-evaluator`** — `createCatalogPromotionEvaluator(db)` adapter factory. Bridges catalog's `PromotionEvaluationInput` / `PromotionEvaluationOutput` to the package's internal evaluator (PR2). Operator template wires it via `resolveEvaluatePromotions`.
  - **`./service-booking-confirmed`** — `recordPromotionRedemptionsForBooking(db, bookingId)`. Reads `pricing_applied_offers` from `catalog_quotes` joined to the booking via `consumed_booking_id` (NOT from the snapshot, to avoid an ordering race with `captureSnapshotGraph`). Aggregates per-offer (sums `discount_applied_cents` across multiple line-item snapshots; first non-null `appliedCode` wins). Idempotent upsert into `promotional_offer_redemptions` via `(offer_id, booking_id)` unique index — replay-safe.
  - **`./service-storefront`** — `createPromotionsStorefrontResolvers()` returning `StorefrontOfferResolvers`. Maps offer rows to the `StorefrontPromotionalOffer` DTO (single `discountValue` string for both `percentage` and `fixed_amount` flavors; `applicableDepartureIds: []` per v1 limitation).
  - New deps: `@voyant-travel/catalog`, `@voyant-travel/storefront` (workspace).

  **Operator template** —

  - `catalog-booking.ts` wires `resolveEvaluatePromotions: ({ db }) => createCatalogPromotionEvaluator(db)` so the hook fires for every quote.
  - `app.ts` wires `createPromotionsStorefrontResolvers()` into `createStorefrontHonoModule({ offers })`.
  - `catalog-bridge.ts` registers a second `booking.confirmed` subscriber alongside the existing snapshot capture; the new subscriber calls `recordPromotionRedemptionsForBooking`. Failure logs but doesn't rethrow (sibling subscribers shouldn't be blocked); ops can backfill from snapshot's `pricing_applied_offers`.
  - Drizzle migration `0008_white_bucky.sql` generated for the column + index additions.

  **Validation**:

  - `pnpm -F (@voyant-travel/catalog, @voyant-travel/promotions, @voyant-travel/storefront, operator) typecheck` — clean (operator runs with `NODE_OPTIONS=--max-old-space-size=8192` due to large workspace heap requirements).
  - `pnpm -F @voyant-travel/promotions test` — 84 unit tests pass; 32 integration tests skip without `TEST_DATABASE_URL` (added 6 new for the redemption recorder, 8 new for storefront resolver).
  - Biome lint clean across all touched files.

  **Honest about what the post-commit pattern guarantees**: `bookEntity` doesn't have a single enclosing transaction, so the redemption subscriber accepts a small audit gap on permanent failure (mitigated by `pricing_applied_offers` on the snapshot enabling backfill, and idempotent upsert handling subscriber retries). This was the explicit decision in §15.2 of the architecture doc.

- Updated dependencies [583326e]
  - @voyant-travel/catalog@0.29.0
  - @voyant-travel/react@0.29.0

## 0.28.3

### Patch Changes

- @voyant-travel/catalog@0.28.3
- @voyant-travel/react@0.28.3

## 0.28.2

### Patch Changes

- @voyant-travel/catalog@0.28.2
- @voyant-travel/react@0.28.2

## 0.28.1

### Patch Changes

- @voyant-travel/catalog@0.28.1
- @voyant-travel/react@0.28.1

## 0.28.0

### Patch Changes

- @voyant-travel/catalog@0.28.0
- @voyant-travel/react@0.28.0

## 0.27.0

### Patch Changes

- @voyant-travel/catalog@0.27.0
- @voyant-travel/react@0.27.0

## 0.26.9

### Patch Changes

- @voyant-travel/catalog@0.26.9
- @voyant-travel/react@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/catalog@0.26.8
- @voyant-travel/react@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/catalog@0.26.7
- @voyant-travel/react@0.26.7

## 0.26.6

### Patch Changes

- @voyant-travel/catalog@0.26.6
- @voyant-travel/react@0.26.6

## 0.26.5

### Patch Changes

- @voyant-travel/catalog@0.26.5
- @voyant-travel/react@0.26.5

## 0.26.4

### Patch Changes

- @voyant-travel/catalog@0.26.4
- @voyant-travel/react@0.26.4

## 0.26.3

### Patch Changes

- @voyant-travel/catalog@0.26.3
- @voyant-travel/react@0.26.3

## 0.26.2

### Patch Changes

- @voyant-travel/catalog@0.26.2
- @voyant-travel/react@0.26.2

## 0.26.1

### Patch Changes

- @voyant-travel/catalog@0.26.1
- @voyant-travel/react@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/catalog@0.26.0
- @voyant-travel/react@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/catalog@0.25.0
- @voyant-travel/react@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/catalog@0.24.3
- @voyant-travel/react@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies [bec0471]
  - @voyant-travel/catalog@0.24.2
  - @voyant-travel/react@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies [2d6297d]
  - @voyant-travel/catalog@0.24.1
  - @voyant-travel/react@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/catalog@0.24.0
- @voyant-travel/react@0.24.0

## 0.23.0

### Patch Changes

- @voyant-travel/catalog@0.23.0
- @voyant-travel/react@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/catalog@0.22.0
- @voyant-travel/react@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/catalog@0.21.1
- @voyant-travel/react@0.21.1

## 0.21.0

### Patch Changes

- Updated dependencies [6427bad]
  - @voyant-travel/catalog@0.21.0
  - @voyant-travel/react@0.21.0

## 0.20.0

### Patch Changes

- @voyant-travel/catalog@0.20.0
- @voyant-travel/react@0.20.0
