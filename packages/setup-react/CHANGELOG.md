# @voyant-travel/setup-react

## 0.11.0

### Minor Changes

- 63baa7c: Fold organization setup into a dismissible dashboard widget and remove the dedicated Setup page/nav.

  Caller migration for `@voyant-travel/setup-react`: the public `SetupPage` export and `/setup` route are removed. Use the `SetupDashboardWidget` contribution on `dashboard.header` (via `createSelectedSetupAdminExtension`) instead of mounting a Setup page or linking to `/setup`.

### Patch Changes

- Updated dependencies [63baa7c]
  - @voyant-travel/setup@0.7.0
  - @voyant-travel/admin@0.129.2

## 0.10.0

### Patch Changes

- Updated dependencies [58baffe]
  - @voyant-travel/setup@0.6.0

## 0.9.1

### Patch Changes

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
  - @voyant-travel/admin@0.129.1
  - @voyant-travel/ui@0.109.5

## 0.9.0

### Patch Changes

- Updated dependencies [58020ec]
  - @voyant-travel/setup@0.5.0

## 0.8.0

### Patch Changes

- Updated dependencies [90d44c0]
  - @voyant-travel/admin@0.129.0

## 0.7.0

### Patch Changes

- Updated dependencies [2bcafc9]
  - @voyant-travel/admin@0.128.0

## 0.6.0

### Patch Changes

- Updated dependencies [a461920]
- Updated dependencies [a461920]
  - @voyant-travel/admin@0.127.0

## 0.5.0

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/setup@0.4.0

## 0.4.0

### Patch Changes

- Updated dependencies [c1e37f2]
  - @voyant-travel/admin@0.126.0

## 0.3.0

### Patch Changes

- Updated dependencies [c9b6144]
  - @voyant-travel/setup@0.3.0

## 0.2.0

### Minor Changes

- 82ffd12: Add persisted organization-level first-run setup guidance composed from the
  selected admin graph. Standard Operator deployments now collect package-owned
  business profile, storefront, market, fiscal, navigation, team, and first-product
  steps while keeping domain mutations in their existing package surfaces.

### Patch Changes

- Updated dependencies [766d24b]
- Updated dependencies [7e9f77a]
- Updated dependencies [82ffd12]
- Updated dependencies [6147b93]
- Updated dependencies [b459761]
  - @voyant-travel/ui@0.109.2
  - @voyant-travel/admin@0.125.0
  - @voyant-travel/setup@0.2.0
