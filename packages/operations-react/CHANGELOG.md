# @voyant-travel/operations-react

## 0.107.0

### Patch Changes

- @voyant-travel/bookings-react@0.226.0
- @voyant-travel/inventory-react@0.108.0

## 0.106.0

### Patch Changes

- Updated dependencies [4fe6f79]
- Updated dependencies [5fa76aa]
  - @voyant-travel/bookings-react@0.225.0
  - @voyant-travel/admin@0.133.0
  - @voyant-travel/inventory-react@0.107.0

## 0.105.0

### Patch Changes

- @voyant-travel/admin@0.132.0
- @voyant-travel/bookings-react@0.224.0
- @voyant-travel/inventory-react@0.106.0

## 0.104.0

### Patch Changes

- @voyant-travel/bookings-react@0.223.0
- @voyant-travel/inventory-react@0.105.0

## 0.103.0

### Patch Changes

- @voyant-travel/bookings-react@0.222.0
- @voyant-travel/inventory-react@0.104.0

## 0.102.0

### Patch Changes

- @voyant-travel/bookings-react@0.221.0
- @voyant-travel/operations@0.11.4
- @voyant-travel/inventory-react@0.103.0

## 0.101.0

### Patch Changes

- Updated dependencies [7496159]
  - @voyant-travel/i18n@0.119.0
  - @voyant-travel/bookings-react@0.220.0
  - @voyant-travel/inventory-react@0.102.0
  - @voyant-travel/operations@0.11.3
  - @voyant-travel/admin@0.131.1

## 0.100.0

### Patch Changes

- @voyant-travel/bookings-react@0.219.0
- @voyant-travel/inventory-react@0.101.0
- @voyant-travel/operations@0.11.2

## 0.99.0

### Patch Changes

- @voyant-travel/bookings-react@0.218.0
- @voyant-travel/inventory-react@0.100.0
- @voyant-travel/operations@0.11.1

## 0.98.0

### Patch Changes

- Updated dependencies [d3f16d5]
  - @voyant-travel/operations@0.11.0
  - @voyant-travel/inventory-react@0.99.0
  - @voyant-travel/bookings-react@0.217.0

## 0.97.0

### Patch Changes

- Updated dependencies [903c754]
  - @voyant-travel/bookings-react@0.216.0
  - @voyant-travel/inventory-react@0.98.0
  - @voyant-travel/i18n@0.118.3
  - @voyant-travel/operations@0.10.7

## 0.96.0

### Patch Changes

- Updated dependencies [6c76de3]
  - @voyant-travel/i18n@0.118.2
  - @voyant-travel/bookings-react@0.215.0
  - @voyant-travel/inventory-react@0.97.0
  - @voyant-travel/operations@0.10.6

## 0.95.0

### Patch Changes

- Updated dependencies [bf20d76]
- Updated dependencies [bf20d76]
  - @voyant-travel/ui@0.110.0
  - @voyant-travel/inventory-react@0.96.0
  - @voyant-travel/admin@0.131.0
  - @voyant-travel/bookings-react@0.214.0
  - @voyant-travel/operations@0.10.5

## 0.94.0

### Patch Changes

- @voyant-travel/bookings-react@0.213.0
- @voyant-travel/inventory-react@0.95.0
- @voyant-travel/operations@0.10.4

## 0.93.0

### Patch Changes

- @voyant-travel/bookings-react@0.212.0
- @voyant-travel/operations@0.10.3
- @voyant-travel/inventory-react@0.94.0

## 0.92.0

### Patch Changes

- @voyant-travel/bookings-react@0.211.0
- @voyant-travel/operations@0.10.2
- @voyant-travel/inventory-react@0.93.0

## 0.91.0

### Patch Changes

- @voyant-travel/bookings-react@0.210.0
- @voyant-travel/inventory-react@0.92.0
- @voyant-travel/operations@0.10.1

## 0.90.0

### Patch Changes

- Updated dependencies [8abbdd6]
  - @voyant-travel/operations@0.10.0
  - @voyant-travel/bookings-react@0.209.0
  - @voyant-travel/inventory-react@0.91.0

## 0.89.0

### Patch Changes

- Updated dependencies [1873611]
- Updated dependencies [7547f67]
  - @voyant-travel/admin@0.130.0
  - @voyant-travel/i18n@0.118.0
  - @voyant-travel/operations@0.9.5
  - @voyant-travel/bookings-react@0.208.0
  - @voyant-travel/inventory-react@0.90.0

## 0.88.0

### Patch Changes

- Updated dependencies [4979d3b]
  - @voyant-travel/bookings-react@0.207.0
  - @voyant-travel/inventory-react@0.89.0
  - @voyant-travel/operations@0.9.2

## 0.87.0

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/i18n@0.117.3
  - @voyant-travel/bookings-react@0.206.0
  - @voyant-travel/inventory-react@0.88.0
  - @voyant-travel/operations@0.9.1

## 0.86.0

### Patch Changes

- Updated dependencies [58baffe]
  - @voyant-travel/operations@0.9.0
  - @voyant-travel/bookings-react@0.205.0
  - @voyant-travel/inventory-react@0.87.0

## 0.85.0

### Patch Changes

- Updated dependencies [9e57a5d]
  - @voyant-travel/inventory-react@0.86.0
  - @voyant-travel/bookings-react@0.204.0
  - @voyant-travel/operations@0.8.47

## 0.84.0

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

- Updated dependencies [17f1239]
  - @voyant-travel/bookings-react@0.203.0
  - @voyant-travel/inventory-react@0.85.0
  - @voyant-travel/operations@0.8.46

## 0.83.0

### Patch Changes

- @voyant-travel/bookings-react@0.202.0
- @voyant-travel/inventory-react@0.84.0
- @voyant-travel/operations@0.8.45

## 0.82.0

### Patch Changes

- @voyant-travel/bookings-react@0.201.0
- @voyant-travel/inventory-react@0.83.0
- @voyant-travel/operations@0.8.43

## 0.81.0

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/bookings-react@0.200.0
  - @voyant-travel/operations@0.8.42
  - @voyant-travel/inventory-react@0.82.0
  - @voyant-travel/ui@0.109.6

## 0.80.0

### Patch Changes

- @voyant-travel/operations@0.8.41
- @voyant-travel/bookings-react@0.199.0
- @voyant-travel/inventory-react@0.81.0

## 0.79.1

### Patch Changes

- e2cb9f5: Give every admin screen consistent page spacing. Previously each page invented
  its own padding (`p-6`, `px-6 py-6 lg:px-8`, `container mx-auto py-6` with no
  horizontal padding, or none at all), so screens like the booking engine had no
  spacing while others differed.

  The admin workspace layout now wraps the page outlet in a single padded content
  region (`px-4 py-6 md:px-6`), and the per-page root padding was removed so it no
  longer double-pads (max-width caps are kept). The full-height settings two-pane
  bleeds back out of that padding and re-applies its own so it stays edge-to-edge.

- e2cb9f5: Fix double page padding. The admin shell already applies consistent page
  padding around the content area, but a number of page and loading-skeleton
  components still added their own `p-6` on top, pushing their content ~24px
  further in than the page header and leaving pages inconsistently indented.
  Those redundant root paddings are removed so every page's content lines up with
  the header and with each other. Dialog, portal, and card paddings are
  unchanged.
- e2cb9f5: Move heavy multi-field forms from centered dialogs to side sheets. Create/edit
  forms with more than a handful of fields (invoices, bookings, travelers,
  markets, pricing rules, policies, suppliers, resources, legal templates,
  notification templates, and similar) were rendered as centered modals; per the
  dialog-vs-sheet guidance, complex multi-field editing belongs in a side sheet
  that keeps the parent screen visible. Confirmations, media viewers, and short
  one-to-three-field dialogs are unchanged.
- e2cb9f5: Make form-field grids responsive on mobile. Two-column (and three/four-column) field grids that previously rendered multiple columns at every width now stack to a single column on small screens and expand at the `sm`/`lg` breakpoints, so forms and dialogs are no longer cramped on phones.
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
- Updated dependencies [e2cb9f5]
  - @voyant-travel/i18n@0.117.2
  - @voyant-travel/inventory-react@0.80.1
  - @voyant-travel/bookings-react@0.198.1
  - @voyant-travel/admin@0.129.1
  - @voyant-travel/ui@0.109.5

## 0.79.0

### Patch Changes

- @voyant-travel/bookings-react@0.198.0
- @voyant-travel/inventory-react@0.80.0
- @voyant-travel/operations@0.8.40

## 0.78.0

### Patch Changes

- @voyant-travel/operations@0.8.39
- @voyant-travel/bookings-react@0.197.0
- @voyant-travel/inventory-react@0.79.0

## 0.77.0

### Patch Changes

- @voyant-travel/bookings-react@0.196.0
- @voyant-travel/inventory-react@0.78.0
- @voyant-travel/operations@0.8.38

## 0.76.0

### Patch Changes

- @voyant-travel/bookings-react@0.195.0
- @voyant-travel/inventory-react@0.77.0
- @voyant-travel/operations@0.8.37

## 0.75.0

### Patch Changes

- @voyant-travel/bookings-react@0.194.0
- @voyant-travel/operations@0.8.36
- @voyant-travel/inventory-react@0.76.0

## 0.74.0

### Patch Changes

- Updated dependencies [90d44c0]
  - @voyant-travel/admin@0.129.0
  - @voyant-travel/i18n@0.117.0
  - @voyant-travel/inventory-react@0.75.0
  - @voyant-travel/bookings-react@0.193.0
  - @voyant-travel/operations@0.8.35

## 0.73.0

### Patch Changes

- @voyant-travel/bookings-react@0.192.0
- @voyant-travel/inventory-react@0.74.0
- @voyant-travel/operations@0.8.33

## 0.72.0

### Patch Changes

- @voyant-travel/bookings-react@0.191.0
- @voyant-travel/inventory-react@0.73.0
- @voyant-travel/operations@0.8.32

## 0.71.0

### Patch Changes

- @voyant-travel/bookings-react@0.190.0
- @voyant-travel/operations@0.8.31
- @voyant-travel/inventory-react@0.72.0

## 0.70.0

### Patch Changes

- @voyant-travel/bookings-react@0.189.0
- @voyant-travel/operations@0.8.30
- @voyant-travel/inventory-react@0.71.0

## 0.69.0

### Patch Changes

- @voyant-travel/operations@0.8.29
- @voyant-travel/inventory-react@0.70.0
- @voyant-travel/ui@0.109.4
- @voyant-travel/bookings-react@0.188.0

## 0.68.0

### Patch Changes

- Updated dependencies [0b7f213]
  - @voyant-travel/inventory-react@0.69.0
  - @voyant-travel/bookings-react@0.187.0
  - @voyant-travel/operations@0.8.28

## 0.67.0

### Patch Changes

- Updated dependencies [5af8682]
  - @voyant-travel/inventory-react@0.68.0
  - @voyant-travel/bookings-react@0.186.0
  - @voyant-travel/operations@0.8.27

## 0.66.0

### Patch Changes

- @voyant-travel/bookings-react@0.185.0
- @voyant-travel/inventory-react@0.67.0
- @voyant-travel/operations@0.8.26

## 0.65.0

### Patch Changes

- Updated dependencies [a33c590]
  - @voyant-travel/inventory-react@0.66.0
  - @voyant-travel/bookings-react@0.184.0
  - @voyant-travel/operations@0.8.25

## 0.64.0

### Patch Changes

- @voyant-travel/bookings-react@0.183.0
- @voyant-travel/inventory-react@0.65.0
- @voyant-travel/operations@0.8.24

## 0.63.1

### Patch Changes

- Updated dependencies [f0f51b4]
  - @voyant-travel/i18n@0.116.0
  - @voyant-travel/admin@0.128.3
  - @voyant-travel/bookings-react@0.182.2
  - @voyant-travel/inventory-react@0.64.1

## 0.63.0

### Patch Changes

- @voyant-travel/bookings-react@0.182.0
- @voyant-travel/inventory-react@0.64.0
- @voyant-travel/operations@0.8.22

## 0.62.0

### Patch Changes

- Updated dependencies [464815c]
  - @voyant-travel/i18n@0.115.1
  - @voyant-travel/bookings-react@0.181.0
  - @voyant-travel/inventory-react@0.63.0
  - @voyant-travel/operations@0.8.21

## 0.61.1

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/i18n@0.115.0
  - @voyant-travel/admin@0.128.2
  - @voyant-travel/bookings-react@0.180.1
  - @voyant-travel/inventory-react@0.62.1

## 0.61.0

### Patch Changes

- Updated dependencies [ecf1680]
  - @voyant-travel/i18n@0.114.0
  - @voyant-travel/bookings-react@0.180.0
  - @voyant-travel/inventory-react@0.62.0
  - @voyant-travel/admin@0.128.1
  - @voyant-travel/operations@0.8.20

## 0.60.0

### Patch Changes

- @voyant-travel/bookings-react@0.179.0
- @voyant-travel/inventory-react@0.61.0
- @voyant-travel/operations@0.8.19

## 0.59.0

### Patch Changes

- Updated dependencies [2bcafc9]
  - @voyant-travel/admin@0.128.0
  - @voyant-travel/i18n@0.113.0
  - @voyant-travel/bookings-react@0.178.0
  - @voyant-travel/inventory-react@0.60.0
  - @voyant-travel/operations@0.8.18

## 0.58.0

### Patch Changes

- @voyant-travel/operations@0.8.17
- @voyant-travel/bookings-react@0.177.0
- @voyant-travel/inventory-react@0.59.0

## 0.57.0

### Patch Changes

- @voyant-travel/operations@0.8.16
- @voyant-travel/bookings-react@0.176.0
- @voyant-travel/inventory-react@0.58.0

## 0.56.0

### Patch Changes

- @voyant-travel/bookings-react@0.175.0
- @voyant-travel/operations@0.8.15
- @voyant-travel/inventory-react@0.57.0

## 0.55.0

### Patch Changes

- @voyant-travel/operations@0.8.14
- @voyant-travel/bookings-react@0.174.0
- @voyant-travel/inventory-react@0.56.0

## 0.54.0

### Patch Changes

- @voyant-travel/bookings-react@0.173.0
- @voyant-travel/inventory-react@0.55.0
- @voyant-travel/operations@0.8.13

## 0.53.0

### Patch Changes

- @voyant-travel/bookings-react@0.172.0
- @voyant-travel/operations@0.8.12
- @voyant-travel/inventory-react@0.54.0
- @voyant-travel/ui@0.109.3

## 0.52.0

### Patch Changes

- @voyant-travel/bookings-react@0.171.0
- @voyant-travel/inventory-react@0.53.0
- @voyant-travel/operations@0.8.10

## 0.51.0

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/i18n@0.112.1
  - @voyant-travel/operations@0.8.9
  - @voyant-travel/bookings-react@0.170.0
  - @voyant-travel/inventory-react@0.52.0

## 0.50.0

### Patch Changes

- Updated dependencies [a461920]
- Updated dependencies [a461920]
- Updated dependencies [590d256]
  - @voyant-travel/admin@0.127.0
  - @voyant-travel/operations@0.8.7
  - @voyant-travel/bookings-react@0.169.0
  - @voyant-travel/inventory-react@0.51.0

## 0.49.0

### Patch Changes

- @voyant-travel/bookings-react@0.168.0
- @voyant-travel/inventory-react@0.50.0
- @voyant-travel/operations@0.8.6

## 0.48.0

### Patch Changes

- @voyant-travel/bookings-react@0.167.0
- @voyant-travel/inventory-react@0.49.0
- @voyant-travel/operations@0.8.5

## 0.47.0

### Patch Changes

- Updated dependencies [0868f18]
- Updated dependencies [3062a73]
  - @voyant-travel/admin@0.126.2
  - @voyant-travel/i18n@0.112.0
  - @voyant-travel/bookings-react@0.166.0
  - @voyant-travel/inventory-react@0.48.0
  - @voyant-travel/operations@0.8.4

## 0.46.0

### Patch Changes

- @voyant-travel/bookings-react@0.165.0
- @voyant-travel/inventory-react@0.47.0
- @voyant-travel/operations@0.8.3

## 0.45.0

### Patch Changes

- @voyant-travel/bookings-react@0.164.0
- @voyant-travel/operations@0.8.2
- @voyant-travel/inventory-react@0.46.0

## 0.44.0

### Patch Changes

- @voyant-travel/bookings-react@0.163.0
- @voyant-travel/operations@0.8.1
- @voyant-travel/inventory-react@0.45.0

## 0.43.1

### Patch Changes

- 7a7fd97: Strengthen the internationalization platform across the operator and package UI.

  Add ICU message formatting, explicit locale and time-zone formatters, hierarchical
  locale fallback, validated runtime overrides, account-authoritative preferences,
  localized setup and navigation surfaces, and fail-closed catalog and UI-literal
  checks. Package message providers now accept an optional time zone and expose the
  shared formatting capabilities to package-owned UI.

- Updated dependencies [7a7fd97]
  - @voyant-travel/admin@0.126.1
  - @voyant-travel/bookings-react@0.162.2
  - @voyant-travel/i18n@0.111.3
  - @voyant-travel/inventory-react@0.44.1

## 0.43.0

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/operations@0.8.0
  - @voyant-travel/bookings-react@0.162.0
  - @voyant-travel/inventory-react@0.44.0

## 0.42.0

### Patch Changes

- Updated dependencies [c1e37f2]
  - @voyant-travel/admin@0.126.0
  - @voyant-travel/bookings-react@0.161.0
  - @voyant-travel/inventory-react@0.43.0
  - @voyant-travel/operations@0.7.1

## 0.41.0

### Patch Changes

- Updated dependencies [372f4f4]
- Updated dependencies [90e8d6d]
  - @voyant-travel/operations@0.7.0
  - @voyant-travel/bookings-react@0.160.0
  - @voyant-travel/inventory-react@0.42.0

## 0.40.0

### Patch Changes

- b459761: Accept current Lucide releases in public peer ranges so the standard Operator package closure
  resolves for external npm consumers.
- Updated dependencies [766d24b]
- Updated dependencies [7e9f77a]
- Updated dependencies [49f55d0]
- Updated dependencies [82ffd12]
- Updated dependencies [6147b93]
- Updated dependencies [b459761]
  - @voyant-travel/ui@0.109.2
  - @voyant-travel/inventory-react@0.41.0
  - @voyant-travel/admin@0.125.0
  - @voyant-travel/bookings-react@0.159.0
  - @voyant-travel/operations@0.6.14

## 0.39.0

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
  - @voyant-travel/bookings-react@0.158.0
  - @voyant-travel/inventory-react@0.40.0
  - @voyant-travel/operations@0.6.13

## 0.38.0

### Patch Changes

- @voyant-travel/bookings-react@0.157.0
- @voyant-travel/inventory-react@0.39.0
- @voyant-travel/operations@0.6.12

## 0.37.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
  - @voyant-travel/admin@0.123.3
  - @voyant-travel/bookings-react@0.156.1
  - @voyant-travel/i18n@0.111.1
  - @voyant-travel/inventory-react@0.38.1
  - @voyant-travel/operations@0.6.11
  - @voyant-travel/react@0.104.2
  - @voyant-travel/ui@0.109.1

## 0.37.0

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/bookings-react@0.156.0
  - @voyant-travel/i18n@0.111.0
  - @voyant-travel/inventory-react@0.38.0
  - @voyant-travel/admin@0.123.2
  - @voyant-travel/operations@0.6.10

## 0.36.0

### Patch Changes

- @voyant-travel/operations@0.6.8
- @voyant-travel/bookings-react@0.155.0
- @voyant-travel/inventory-react@0.37.0

## 0.35.0

### Patch Changes

- Updated dependencies [8bd906f]
  - @voyant-travel/ui@0.109.0
  - @voyant-travel/operations@0.6.7
  - @voyant-travel/admin@0.123.0
  - @voyant-travel/bookings-react@0.154.0
  - @voyant-travel/inventory-react@0.36.0

## 0.34.0

### Patch Changes

- 490d132: Move standard first-party admin factories, package copy, slots, contributions, and icons into selected deployment graph composition.
- 490d132: Remove the final Operator admin factory compatibility registry by composing cross-domain behavior through package-owned selected graph slots and contributions.
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
  - @voyant-travel/bookings-react@0.153.0
  - @voyant-travel/admin@0.122.0
  - @voyant-travel/operations@0.6.6
  - @voyant-travel/inventory-react@0.35.0

## 0.33.0

### Patch Changes

- Updated dependencies [d771be3]
- Updated dependencies [d771be3]
  - @voyant-travel/admin@0.121.0
  - @voyant-travel/operations@0.6.5
  - @voyant-travel/bookings-react@0.152.0
  - @voyant-travel/inventory-react@0.34.0

## 0.32.0

### Patch Changes

- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/operations@0.6.0
  - @voyant-travel/inventory-react@0.33.0
  - @voyant-travel/bookings-react@0.151.0

## 0.31.0

### Patch Changes

- @voyant-travel/bookings-react@0.150.0
- @voyant-travel/operations@0.5.23
- @voyant-travel/inventory-react@0.32.0

## 0.30.0

### Patch Changes

- Updated dependencies [a97e845]
  - @voyant-travel/admin@0.120.0
  - @voyant-travel/bookings-react@0.149.0
  - @voyant-travel/inventory-react@0.31.0
  - @voyant-travel/operations@0.5.21

## 0.29.0

### Patch Changes

- Updated dependencies [8a665f3]
  - @voyant-travel/admin@0.119.0
  - @voyant-travel/bookings-react@0.148.0
  - @voyant-travel/inventory-react@0.30.0
  - @voyant-travel/operations@0.5.20

## 0.28.0

### Patch Changes

- @voyant-travel/admin@0.118.0
- @voyant-travel/bookings-react@0.147.0
- @voyant-travel/inventory-react@0.29.0
- @voyant-travel/operations@0.5.19

## 0.27.0

### Patch Changes

- Updated dependencies [ecdf0fc]
  - @voyant-travel/admin@0.117.0
  - @voyant-travel/bookings-react@0.146.0
  - @voyant-travel/inventory-react@0.28.0
  - @voyant-travel/operations@0.5.18

## 0.26.0

### Patch Changes

- @voyant-travel/operations@0.5.17
- @voyant-travel/bookings-react@0.145.0
- @voyant-travel/inventory-react@0.27.0

## 0.25.0

### Patch Changes

- @voyant-travel/bookings-react@0.144.0
- @voyant-travel/inventory-react@0.26.0
- @voyant-travel/operations@0.5.16

## 0.24.0

### Patch Changes

- @voyant-travel/inventory-react@0.25.0
- @voyant-travel/ui@0.108.11
- @voyant-travel/operations@0.5.15
- @voyant-travel/bookings-react@0.143.0

## 0.23.0

### Patch Changes

- @voyant-travel/bookings-react@0.142.0
- @voyant-travel/inventory-react@0.24.0
- @voyant-travel/operations@0.5.14

## 0.22.0

### Patch Changes

- @voyant-travel/operations@0.5.13
- @voyant-travel/bookings-react@0.141.0
- @voyant-travel/inventory-react@0.23.0

## 0.21.0

### Patch Changes

- Updated dependencies [62e87ee]
  - @voyant-travel/admin@0.116.0
  - @voyant-travel/i18n@0.110.0
  - @voyant-travel/bookings-react@0.140.0
  - @voyant-travel/inventory-react@0.22.0
  - @voyant-travel/operations@0.5.12

## 0.20.0

### Patch Changes

- @voyant-travel/admin@0.115.4
- @voyant-travel/bookings-react@0.139.0
- @voyant-travel/inventory-react@0.21.0
- @voyant-travel/operations@0.5.10

## 0.19.2

### Patch Changes

- 3a14bd5: Expose resources admin edit and pool membership workflows, preserve resources list state across detail navigation, and improve assignment slot labels with product context.
- Updated dependencies [9f3ffdf]
- Updated dependencies [3e81078]
  - @voyant-travel/bookings-react@0.138.7

## 0.19.1

### Patch Changes

- f1090b7: Align resource assignment detail schemas around `assignedAt`, reject orphan or incoherent slot assignment lifecycle payloads, and surface assignment target validation in the admin UI.
- 42f662c: Reject inverted, duplicate, and overlapping resource closeout windows and surface matching admin form validation.
- Updated dependencies [f1090b7]
- Updated dependencies [42f662c]
- Updated dependencies [fead555]
  - @voyant-travel/operations@0.5.9
  - @voyant-travel/i18n@0.109.8
  - @voyant-travel/bookings-react@0.138.6

## 0.19.0

### Patch Changes

- @voyant-travel/bookings-react@0.138.0
- @voyant-travel/inventory-react@0.20.0
- @voyant-travel/operations@0.5.6

## 0.18.1

### Patch Changes

- fe6d8cf: Use the mounted availability product route prefix for resource-template mutations and open-slot materialization.

## 0.18.0

### Patch Changes

- @voyant-travel/operations@0.5.2
- @voyant-travel/bookings-react@0.137.0
- @voyant-travel/inventory-react@0.19.0

## 0.17.2

### Patch Changes

- 12a1eb2: Expose client-safe subpaths for validation schemas, linkable metadata, template authoring metadata, finance payment-policy primitives, and Hono reporter utilities. Move browser-facing React/operator imports off mixed runtime barrels so client bundles do not pull Hono request context or other server-only runtime code.
- Updated dependencies [12a1eb2]
  - @voyant-travel/inventory-react@0.18.2
  - @voyant-travel/operations@0.5.1
  - @voyant-travel/bookings-react@0.136.2

## 0.17.1

### Patch Changes

- Updated dependencies [7cb6fa7]
  - @voyant-travel/i18n@0.109.0
  - @voyant-travel/admin@0.115.2
  - @voyant-travel/bookings-react@0.136.1
  - @voyant-travel/inventory-react@0.18.1
  - @voyant-travel/ui@0.108.2

## 0.17.0

### Patch Changes

- Updated dependencies [787c852]
  - @voyant-travel/operations@0.5.0
  - @voyant-travel/bookings-react@0.136.0
  - @voyant-travel/inventory-react@0.18.0

## 0.16.0

### Patch Changes

- Updated dependencies [924d201]
- Updated dependencies [f311826]
  - @voyant-travel/operations@0.4.0
  - @voyant-travel/bookings-react@0.135.0
  - @voyant-travel/inventory-react@0.17.0

## 0.15.0

### Minor Changes

- 51f7dea: Share one list-response contract instead of per-module copies (voyant#2109).

  `@voyant-travel/types` now owns the canonical offset-paginated list envelope: the `ListResponse<T>` type + `listResponse(data, { total, limit, offset })` builder, plus the zod `paginationSchema` (coerced `limit` 1–200 default 50, `offset` ≥0 default 0) and the `listResponseSchema(item)` factory. Both server services and `*-react` clients import from this single source.

  Server side: every module's local `paginate()` / inline `{ data, total, limit, offset }` construction now routes through the shared `listResponse` builder, and the count read is standardized on `count` internally — fixing the drift where finance, notifications and the legal contracts/policies services read `countResult[0]?.total` while every other module read `countResult[0]?.count` (their `count(*)` selects were aliased `total`; they are now aliased `count`). The returned shape is byte-for-byte identical.

  Client side: the ~23 copied `paginatedEnvelope` zod schemas across the `*-react` packages are replaced by re-exporting the shared `listResponseSchema` factory under the same `paginatedEnvelope` name, so consumers are unchanged.

  Input alignment: `finance-contracts` and `legal-contracts` pagination `limit` caps were raised from `.max(100)` to `.max(200)` to match the framework-wide max.

  Additive and non-breaking.

### Patch Changes

- Updated dependencies [51f7dea]
  - @voyant-travel/operations@0.3.0
  - @voyant-travel/bookings-react@0.134.0
  - @voyant-travel/inventory-react@0.16.0
  - @voyant-travel/admin@0.115.1

## 0.14.0

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/admin@0.115.0
  - @voyant-travel/i18n@0.108.0
  - @voyant-travel/operations@0.2.8
  - @voyant-travel/bookings-react@0.133.0
  - @voyant-travel/inventory-react@0.15.0
  - @voyant-travel/ui@0.108.1

## 0.13.0

### Patch Changes

- @voyant-travel/bookings-react@0.132.0
- @voyant-travel/operations@0.2.7
- @voyant-travel/inventory-react@0.14.0

## 0.12.0

### Minor Changes

- 310565b: Surface a missing-option warning in the departures (availability slots) list (#2062).

  The slots table now has an Option column that shows each departure's option name
  and flags — with an amber badge + tooltip — any slot that has no option on a
  product that actually has options (i.e. an unpriceable departure that should be
  repaired via the option picker). Products without options are not flagged. The
  column resolves names from one capped active-options query per visible product,
  so a missing linkage is discoverable from the list, not just inside the edit
  dialog.

### Patch Changes

- Updated dependencies [310565b]
  - @voyant-travel/i18n@0.107.3
  - @voyant-travel/bookings-react@0.131.0
  - @voyant-travel/inventory-react@0.13.0
  - @voyant-travel/operations@0.2.4

## 0.11.0

### Minor Changes

- dbea53e: Add an option picker to the admin departure (availability slot) form (#2059).

  The slot create/edit dialog now lets an operator choose which of the product's
  active options a departure belongs to — populated from the product's options
  (default marked), required when the product has options, and pre-selected from
  the slot's current `optionId` on edit so an unpriceable/incorrect slot can be
  repaired through the UI. Selecting a different product clears the stale option.
  This complements the pricing-correctness fixes in #2058: a departure's price is
  derived from its option's rate plans, so a slot must point at an option.

### Patch Changes

- Updated dependencies [dbea53e]
  - @voyant-travel/i18n@0.107.2
  - @voyant-travel/bookings-react@0.130.0
  - @voyant-travel/inventory-react@0.12.0
  - @voyant-travel/operations@0.2.3

## 0.10.0

### Patch Changes

- @voyant-travel/operations@0.2.2
- @voyant-travel/bookings-react@0.129.0
- @voyant-travel/inventory-react@0.11.0

## 0.9.0

### Patch Changes

- @voyant-travel/inventory-react@0.10.0
- @voyant-travel/bookings-react@0.128.0
- @voyant-travel/operations@0.2.1

## 0.8.0

### Patch Changes

- Updated dependencies [435a5d1]
  - @voyant-travel/operations@0.2.0
  - @voyant-travel/bookings-react@0.127.0
  - @voyant-travel/inventory-react@0.9.0

## 0.7.0

### Patch Changes

- @voyant-travel/bookings-react@0.126.0
- @voyant-travel/inventory-react@0.8.0
- @voyant-travel/operations@0.1.6

## 0.6.0

### Patch Changes

- Updated dependencies [a74471e]
- Updated dependencies [a74471e]
  - @voyant-travel/i18n@0.107.0
  - @voyant-travel/ui@0.108.0
  - @voyant-travel/admin@0.114.0
  - @voyant-travel/bookings-react@0.125.0
  - @voyant-travel/inventory-react@0.7.0
  - @voyant-travel/operations@0.1.5

## 0.5.0

### Patch Changes

- 4f92198: Voyant 1.0 visual refactor of the framework UI.

  - **Tokens** (`@voyant-travel/ui` `globals.css`): warm off-white paper, near-black ink, and a single hot-orange brand accent (`--brand`, new token) reserved for charts/focus/active state. Inter Tight type. Fixed brand chart palette (`--chart-1..5`). A coherent radius system: controls + their dropdowns at `rounded-sm` (4px), cards/table surfaces at `rounded-md` (6px), dialogs/sheets at `rounded-xl`.
  - **`@voyant-travel/ui` components**: new `SegmentedControl`; `Button` gains a `brand` variant; sharper, consistent radii across Button/Input/Select/Combobox/Textarea/Toggle/Tabs/Menus/Command/Card/DataTable/Badge; bordered active sidebar items (primary + sub) and inset-panel border; assorted fixes (Command search-input radius, toggle-group corners, sidebar sub-menu spacing).
  - **`@voyant-travel/admin`**: Voyant 1.0 brand logo lockup (composed mark + wordmark, collapse-to-badge); operator shell defaults to the inset sidebar layout; dashboard KPI cards, brand chart colors, and Figma-matched sidebar (bordered active item, near-black nav text, bordered user card with open-state).
  - **Domain `*-react` packages**: card surfaces normalized to the new `rounded-md` radius; flights search bar (trip-type toggle, route cards, airport dropdown) and the resources tabs aligned to the system.

- Updated dependencies [4f92198]
  - @voyant-travel/ui@0.107.0
  - @voyant-travel/admin@0.113.0
  - @voyant-travel/inventory-react@0.6.0
  - @voyant-travel/bookings-react@0.124.0
  - @voyant-travel/operations@0.1.4

## 0.4.0

### Patch Changes

- Updated dependencies [94890c3]
- Updated dependencies [cb9b04b]
  - @voyant-travel/admin@0.112.0
  - @voyant-travel/bookings-react@0.123.0
  - @voyant-travel/inventory-react@0.5.0
  - @voyant-travel/operations@0.1.3

## 0.3.0

### Patch Changes

- @voyant-travel/inventory-react@0.4.0
- @voyant-travel/bookings-react@0.122.0
- @voyant-travel/operations@0.1.2

## 0.2.0

### Patch Changes

- @voyant-travel/operations@0.1.1
- @voyant-travel/inventory-react@0.3.0
- @voyant-travel/bookings-react@0.121.0

## 0.1.2

### Patch Changes

- ecec979: Improve operator bundle boundaries by adding route-local admin message provider support, exposing admin extension route helpers, keeping pending skeletons structural, and tightening Vite route ignores and vendor chunk splitting so heavy admin route dependencies stay out of the initial entry.
- Updated dependencies [ecec979]
  - @voyant-travel/admin@0.111.3
  - @voyant-travel/bookings-react@0.120.3
  - @voyant-travel/inventory-react@0.2.2

## 0.1.1

### Patch Changes

- eef1a00: Republish notification and UI consumer packages so stale beta artifacts no longer reference legacy notification package specifiers.
- Updated dependencies [eef1a00]
  - @voyant-travel/admin@0.111.2
  - @voyant-travel/bookings-react@0.120.1
  - @voyant-travel/inventory-react@0.2.1

## 0.1.0

### Minor Changes

- 3408b2a: Move availability, allocation UI, resources, ground logistics, and places source
  under Operations owner paths. The old operated-execution package names are
  removed from the v1 workspace surface while first-party runtime, React, and
  operator imports use `@voyant-travel/operations` and `@voyant-travel/operations-react`
  surfaces.

### Patch Changes

- 47fef18: Retarget first-party imports from the removed beta package names to their owner
  packages. Operated product UI now imports Inventory React, commercial UI imports
  Commerce React, supplier UI imports Distribution React, checkout UI imports
  Finance React, and operated place/availability schema references import
  Operations owner paths.
- Updated dependencies [dd71543]
- Updated dependencies [eb17d3d]
- Updated dependencies [3cc83b6]
- Updated dependencies [44c3875]
- Updated dependencies [3408b2a]
- Updated dependencies [65b3782]
- Updated dependencies [a101971]
- Updated dependencies [47fef18]
  - @voyant-travel/admin@0.111.1
  - @voyant-travel/operations@0.1.0
  - @voyant-travel/inventory-react@0.2.0
  - @voyant-travel/bookings-react@0.120.0
