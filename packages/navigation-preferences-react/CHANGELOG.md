# @voyant-travel/navigation-preferences-react

## 0.30.0

### Patch Changes

- Updated dependencies [46d00dc]
  - @voyant-travel/auth-react@0.156.0
  - @voyant-travel/react@0.106.4

## 0.29.3

### Patch Changes

- Updated dependencies [c6ccc30]
  - @voyant-travel/i18n@0.126.0

## 0.29.2

### Patch Changes

- Updated dependencies [70752e1]
  - @voyant-travel/i18n@0.125.0

## 0.29.1

### Patch Changes

- Updated dependencies [e99380d]
  - @voyant-travel/i18n@0.124.0

## 0.29.0

### Patch Changes

- Updated dependencies [1a3ba50]
- Updated dependencies [df9f45b]
- Updated dependencies [36f3085]
  - @voyant-travel/i18n@0.123.1
  - @voyant-travel/auth-react@0.155.0
  - @voyant-travel/react@0.106.1

## 0.28.0

### Patch Changes

- Updated dependencies [c3f440c]
  - @voyant-travel/auth-react@0.154.0

## 0.27.0

### Patch Changes

- Updated dependencies [f4ac273]
  - @voyant-travel/ui@0.111.0
  - @voyant-travel/admin@0.137.0
  - @voyant-travel/auth-react@0.153.0

## 0.26.0

### Patch Changes

- Updated dependencies [bd8f49a]
- Updated dependencies [1e0506f]
  - @voyant-travel/admin@0.136.0
  - @voyant-travel/auth-react@0.152.0

## 0.25.1

### Patch Changes

- Updated dependencies [484b207]
  - @voyant-travel/i18n@0.123.0

## 0.25.0

### Patch Changes

- Updated dependencies [7b8ef95]
- Updated dependencies [f56d552]
  - @voyant-travel/react@0.106.0
  - @voyant-travel/admin@0.135.0
  - @voyant-travel/i18n@0.122.1
  - @voyant-travel/auth-react@0.151.0

## 0.24.4

### Patch Changes

- Updated dependencies [1be6b76]
  - @voyant-travel/react@0.105.0

## 0.24.3

### Patch Changes

- Updated dependencies [64df424]
  - @voyant-travel/i18n@0.122.0

## 0.24.2

### Patch Changes

- Updated dependencies [ff0b8cc]
  - @voyant-travel/i18n@0.121.0

## 0.24.1

### Patch Changes

- Updated dependencies [06a79a0]
  - @voyant-travel/i18n@0.120.0

## 0.24.0

### Patch Changes

- Updated dependencies [bf71bca]
  - @voyant-travel/admin@0.134.0
  - @voyant-travel/auth-react@0.150.0
  - @voyant-travel/navigation-preferences@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [5fa76aa]
  - @voyant-travel/admin@0.133.0
  - @voyant-travel/navigation-preferences@0.23.0
  - @voyant-travel/auth-react@0.149.0

## 0.22.0

### Patch Changes

- @voyant-travel/navigation-preferences@0.22.0
- @voyant-travel/admin@0.132.0
- @voyant-travel/auth-react@0.148.0

## 0.21.1

## 0.21.0

### Patch Changes

- Updated dependencies [90361d6]
  - @voyant-travel/auth-react@0.147.0
  - @voyant-travel/navigation-preferences@0.21.0

## 0.20.2

## 0.20.1

### Patch Changes

- @voyant-travel/navigation-preferences@0.20.1
- @voyant-travel/auth-react@0.146.1

## 0.20.0

### Patch Changes

- Updated dependencies [7496159]
- Updated dependencies [7496159]
  - @voyant-travel/auth-react@0.146.0
  - @voyant-travel/i18n@0.119.0
  - @voyant-travel/navigation-preferences@0.20.0
  - @voyant-travel/admin@0.131.1

## 0.19.0

### Patch Changes

- Updated dependencies [bf20d76]
  - @voyant-travel/ui@0.110.0
  - @voyant-travel/admin@0.131.0
  - @voyant-travel/auth-react@0.145.0
  - @voyant-travel/navigation-preferences@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies [1873611]
  - @voyant-travel/admin@0.130.0
  - @voyant-travel/i18n@0.118.0
  - @voyant-travel/auth-react@0.144.0
  - @voyant-travel/navigation-preferences@0.18.0

## 0.17.2

### Patch Changes

- Updated dependencies [f45db1c]
  - @voyant-travel/navigation-preferences@0.17.2

## 0.17.1

### Patch Changes

- Updated dependencies [cb7221d]
  - @voyant-travel/navigation-preferences@0.17.1
  - @voyant-travel/auth-react@0.143.7

## 0.17.0

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
  - @voyant-travel/navigation-preferences@0.17.0

## 0.16.6

### Patch Changes

- @voyant-travel/navigation-preferences@0.16.6
- @voyant-travel/auth-react@0.143.6

## 0.16.5

### Patch Changes

- @voyant-travel/navigation-preferences@0.16.5
- @voyant-travel/auth-react@0.143.5

## 0.16.4

### Patch Changes

- @voyant-travel/navigation-preferences@0.16.4
- @voyant-travel/ui@0.109.6
- @voyant-travel/auth-react@0.143.4

## 0.16.3

### Patch Changes

- @voyant-travel/navigation-preferences@0.16.3
- @voyant-travel/auth-react@0.143.3

## 0.16.2

### Patch Changes

- e2cb9f5: Give every admin screen consistent page spacing. Previously each page invented
  its own padding (`p-6`, `px-6 py-6 lg:px-8`, `container mx-auto py-6` with no
  horizontal padding, or none at all), so screens like the booking engine had no
  spacing while others differed.

  The admin workspace layout now wraps the page outlet in a single padded content
  region (`px-4 py-6 md:px-6`), and the per-page root padding was removed so it no
  longer double-pads (max-width caps are kept). The full-height settings two-pane
  bleeds back out of that padding and re-applies its own so it stays edge-to-edge.

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
  - @voyant-travel/auth-react@0.143.2
  - @voyant-travel/admin@0.129.1
  - @voyant-travel/ui@0.109.5
  - @voyant-travel/navigation-preferences@0.16.2

## 0.16.1

### Patch Changes

- @voyant-travel/navigation-preferences@0.16.1
- @voyant-travel/auth-react@0.143.1

## 0.16.0

### Patch Changes

- @voyant-travel/auth-react@0.143.0
- @voyant-travel/navigation-preferences@0.16.0

## 0.15.0

### Patch Changes

- Updated dependencies [90d44c0]
  - @voyant-travel/admin@0.129.0
  - @voyant-travel/i18n@0.117.0
  - @voyant-travel/auth-react@0.142.0
  - @voyant-travel/navigation-preferences@0.15.0

## 0.14.5

### Patch Changes

- @voyant-travel/navigation-preferences@0.14.5
- @voyant-travel/auth-react@0.141.5

## 0.14.4

### Patch Changes

- @voyant-travel/navigation-preferences@0.14.4
- @voyant-travel/auth-react@0.141.4

## 0.14.3

### Patch Changes

- @voyant-travel/navigation-preferences@0.14.3
- @voyant-travel/ui@0.109.4
- @voyant-travel/auth-react@0.141.3

## 0.14.2

### Patch Changes

- Updated dependencies [f0f51b4]
  - @voyant-travel/i18n@0.116.0
  - @voyant-travel/admin@0.128.3
  - @voyant-travel/auth-react@0.141.2
  - @voyant-travel/navigation-preferences@0.14.2

## 0.14.1

### Patch Changes

- @voyant-travel/navigation-preferences@0.14.1
- @voyant-travel/auth-react@0.141.1

## 0.14.0

### Patch Changes

- @voyant-travel/auth-react@0.141.0
- @voyant-travel/navigation-preferences@0.14.0

## 0.13.2

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/i18n@0.115.0
  - @voyant-travel/admin@0.128.2
  - @voyant-travel/auth-react@0.140.2
  - @voyant-travel/navigation-preferences@0.13.2

## 0.13.1

### Patch Changes

- Updated dependencies [ecf1680]
  - @voyant-travel/i18n@0.114.0
  - @voyant-travel/admin@0.128.1
  - @voyant-travel/auth-react@0.140.1
  - @voyant-travel/navigation-preferences@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [4f34425]
  - @voyant-travel/auth-react@0.140.0
  - @voyant-travel/navigation-preferences@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies [2bcafc9]
  - @voyant-travel/admin@0.128.0
  - @voyant-travel/i18n@0.113.0
  - @voyant-travel/auth-react@0.139.0
  - @voyant-travel/navigation-preferences@0.12.0

## 0.11.0

### Patch Changes

- @voyant-travel/navigation-preferences@0.11.0
- @voyant-travel/auth-react@0.138.0

## 0.10.0

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/auth-react@0.137.0
  - @voyant-travel/navigation-preferences@0.10.0

## 0.9.0

### Patch Changes

- @voyant-travel/auth-react@0.136.0
- @voyant-travel/navigation-preferences@0.9.0

## 0.8.1

### Patch Changes

- @voyant-travel/navigation-preferences@0.8.1
- @voyant-travel/auth-react@0.135.1

## 0.8.0

### Patch Changes

- @voyant-travel/auth-react@0.135.0
- @voyant-travel/navigation-preferences@0.8.0

## 0.7.0

### Patch Changes

- @voyant-travel/auth-react@0.134.0
- @voyant-travel/navigation-preferences@0.7.0
- @voyant-travel/ui@0.109.3

## 0.6.3

### Patch Changes

- @voyant-travel/navigation-preferences@0.6.3
- @voyant-travel/auth-react@0.133.4

## 0.6.2

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/i18n@0.112.1
  - @voyant-travel/navigation-preferences@0.6.2
  - @voyant-travel/auth-react@0.133.3

## 0.6.1

### Patch Changes

- @voyant-travel/navigation-preferences@0.6.1
- @voyant-travel/auth-react@0.133.1

## 0.6.0

### Patch Changes

- Updated dependencies [a461920]
- Updated dependencies [a461920]
  - @voyant-travel/admin@0.127.0
  - @voyant-travel/auth-react@0.133.0
  - @voyant-travel/navigation-preferences@0.6.0

## 0.5.3

### Patch Changes

- Updated dependencies [0868f18]
- Updated dependencies [3062a73]
  - @voyant-travel/admin@0.126.2
  - @voyant-travel/i18n@0.112.0
  - @voyant-travel/auth-react@0.132.5
  - @voyant-travel/navigation-preferences@0.5.3

## 0.5.2

### Patch Changes

- @voyant-travel/navigation-preferences@0.5.2
- @voyant-travel/auth-react@0.132.3

## 0.5.1

### Patch Changes

- 7a7fd97: Strengthen the internationalization platform across the operator and package UI.

  Add ICU message formatting, explicit locale and time-zone formatters, hierarchical
  locale fallback, validated runtime overrides, account-authoritative preferences,
  localized setup and navigation surfaces, and fail-closed catalog and UI-literal
  checks. Package message providers now accept an optional time zone and expose the
  shared formatting capabilities to package-owned UI.

- Updated dependencies [7a7fd97]
  - @voyant-travel/admin@0.126.1
  - @voyant-travel/auth-react@0.132.2
  - @voyant-travel/i18n@0.111.3
  - @voyant-travel/navigation-preferences@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/navigation-preferences@0.5.0
  - @voyant-travel/auth-react@0.132.1

## 0.4.0

### Patch Changes

- Updated dependencies [c1e37f2]
  - @voyant-travel/admin@0.126.0
  - @voyant-travel/auth-react@0.132.0
  - @voyant-travel/navigation-preferences@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [c9b6144]
  - @voyant-travel/navigation-preferences@0.3.0
  - @voyant-travel/auth-react@0.131.0

## 0.2.0

### Minor Changes

- 7e9f77a: Add organization defaults and member overrides for stable admin navigation IDs. Apply visibility
  after selected navigation composition without exposing ineligible routes, inherit hidden parent
  state through navigation subtrees, and retain structural parents only when a child is explicitly
  re-enabled. Ship the persistence, admin API, provisioning seam, and settings UI in standard Operator
  deployments, with duplicate settings contributions normalized at the host and core boundaries.
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
  - @voyant-travel/navigation-preferences@0.2.0
  - @voyant-travel/auth-react@0.130.0
