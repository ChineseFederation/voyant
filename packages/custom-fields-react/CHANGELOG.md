# @voyant-travel/custom-fields-react

## 0.10.1

### Patch Changes

- Updated dependencies [06a79a0]
  - @voyant-travel/i18n@0.120.0

## 0.10.0

### Patch Changes

- Updated dependencies [bf71bca]
  - @voyant-travel/admin@0.134.0

## 0.9.0

### Patch Changes

- Updated dependencies [5fa76aa]
  - @voyant-travel/admin@0.133.0
  - @voyant-travel/custom-fields@0.2.22

## 0.8.0

### Patch Changes

- @voyant-travel/custom-fields@0.2.21
- @voyant-travel/admin@0.132.0

## 0.7.1

### Patch Changes

- Updated dependencies [7496159]
  - @voyant-travel/i18n@0.119.0
  - @voyant-travel/custom-fields@0.2.18
  - @voyant-travel/types@0.109.10
  - @voyant-travel/admin@0.131.1

## 0.7.0

### Patch Changes

- Updated dependencies [bf20d76]
  - @voyant-travel/ui@0.110.0
  - @voyant-travel/admin@0.131.0

## 0.6.0

### Patch Changes

- Updated dependencies [1873611]
  - @voyant-travel/admin@0.130.0
  - @voyant-travel/i18n@0.118.0

## 0.5.1

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
- e2cb9f5: Align off-scale spacing utilities to the shared scale: gap-5 to gap-4, p-5 to
  p-6, space-y-5 to space-y-4, space-y-8 to space-y-6, p-10/p-12 to p-8, gap-8 to
  gap-6. Keeps spacing on the consistent 1/2/3/4/6/8 scale used across the app.
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
  - @voyant-travel/admin@0.129.1
  - @voyant-travel/ui@0.109.5

## 0.5.0

### Patch Changes

- Updated dependencies [90d44c0]
  - @voyant-travel/admin@0.129.0
  - @voyant-travel/i18n@0.117.0

## 0.4.3

### Patch Changes

- Updated dependencies [f0f51b4]
  - @voyant-travel/i18n@0.116.0
  - @voyant-travel/admin@0.128.3

## 0.4.2

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/i18n@0.115.0
  - @voyant-travel/admin@0.128.2

## 0.4.1

### Patch Changes

- Updated dependencies [ecf1680]
  - @voyant-travel/i18n@0.114.0
  - @voyant-travel/admin@0.128.1

## 0.4.0

### Patch Changes

- Updated dependencies [2bcafc9]
  - @voyant-travel/admin@0.128.0
  - @voyant-travel/i18n@0.113.0

## 0.3.0

### Patch Changes

- Updated dependencies [a461920]
- Updated dependencies [a461920]
  - @voyant-travel/admin@0.127.0

## 0.2.4

### Patch Changes

- Updated dependencies [0868f18]
- Updated dependencies [3062a73]
  - @voyant-travel/admin@0.126.2
  - @voyant-travel/i18n@0.112.0

## 0.2.3

### Patch Changes

- 70a39fc: Declare the repository field so npm provenance verification accepts the publish (0.2.1 was rejected with E422: repository.url "" did not match the GitHub Actions provenance).

## 0.2.2

### Patch Changes

- 207a29c: Declare the repository field so npm provenance verification accepts the publish (0.2.1 was rejected with E422: repository.url "" did not match the GitHub Actions provenance).

## 0.2.1

### Patch Changes

- 1add58a: Republish with compiled output: 0.2.0 was packed without `prepack`, so the tarball shipped no `dist/` and its entry points were unresolvable for consumers.

## 0.2.0

### Minor Changes

- 52352c4: Move custom-field definition Settings ownership to the generic custom-fields
  package. Selected entity manifests now declare the targets and field types that
  the canonical API may accept. The unused Relationships definition API and
  Settings surfaces are removed without compatibility adapters.

  Target capability declarations now constrain searchable, exportable, and
  invoiceable settings end to end, and unsupported flags are stored as false.

- 52352c4: Persist custom-field namespace, owner, lifecycle, and provenance metadata.
  Operator definitions use the reserved `custom` namespace, app operations are
  owner-constrained, platform definitions derive ownership from the selected
  target, and Settings renders non-operator definitions as read-only.

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/custom-fields@0.2.0
