# @voyant-travel/setup

## 0.7.10

### Patch Changes

- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
  - @voyant-travel/core@0.139.0
  - @voyant-travel/hono@0.141.0
  - @voyant-travel/db@0.120.3

## 0.7.9

### Patch Changes

- Updated dependencies [3552f14]
  - @voyant-travel/core@0.138.0
  - @voyant-travel/db@0.120.2
  - @voyant-travel/hono@0.140.1

## 0.7.8

### Patch Changes

- Updated dependencies [c35841b]
  - @voyant-travel/hono@0.140.0
  - @voyant-travel/core@0.137.2

## 0.7.7

### Patch Changes

- Updated dependencies [2bc1570]
- Updated dependencies [2bc1570]
- Updated dependencies [14033fb]
  - @voyant-travel/db@0.120.0
  - @voyant-travel/hono@0.139.0
  - @voyant-travel/types@0.109.12

## 0.7.6

### Patch Changes

- Updated dependencies [4fe6f79]
- Updated dependencies [276d44d]
- Updated dependencies [0c30250]
  - @voyant-travel/tools@0.10.0
  - @voyant-travel/core@0.137.0
  - @voyant-travel/db@0.119.1
  - @voyant-travel/hono@0.138.1

## 0.7.5

### Patch Changes

- Updated dependencies [e87d4de]
  - @voyant-travel/hono@0.138.0

## 0.7.4

### Patch Changes

- Updated dependencies [fae0f36]
  - @voyant-travel/tools@0.9.0

## 0.7.3

### Patch Changes

- Updated dependencies [d92a98a]
  - @voyant-travel/hono@0.137.0

## 0.7.2

### Patch Changes

- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
  - @voyant-travel/hono@0.136.0
  - @voyant-travel/tools@0.8.0

## 0.7.1

### Patch Changes

- Updated dependencies [8adeb23]
- Updated dependencies [6d0b4b4]
- Updated dependencies [7496159]
- Updated dependencies [fa75fe3]
  - @voyant-travel/db@0.119.0
  - @voyant-travel/hono@0.135.0
  - @voyant-travel/types@0.109.10

## 0.7.0

### Minor Changes

- 63baa7c: Fold organization setup into a dismissible dashboard widget and remove the dedicated Setup page/nav.

  Caller migration for `@voyant-travel/setup-react`: the public `SetupPage` export and `/setup` route are removed. Use the `SetupDashboardWidget` contribution on `dashboard.header` (via `createSelectedSetupAdminExtension`) instead of mounting a Setup page or linking to `/setup`.

## 0.6.1

### Patch Changes

- cb7221d: Declare `availability`, `effectBoundary: "local"`, and
  `targetLifecycle: "existing"` on `action.complete-setup-step` and
  `action.skip-setup-step`. Both handlers apply a single conditional update to
  an already-created setup step row, so this only documents the existing
  local, replay-safe behavior in the deployment graph; no runtime changes.

## 0.6.0

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

## 0.5.5

### Patch Changes

- Updated dependencies [17f1239]
  - @voyant-travel/tools@0.7.0

## 0.5.4

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

## 0.5.3

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/core@0.136.0
  - @voyant-travel/db@0.118.5
  - @voyant-travel/hono@0.134.5

## 0.5.2

### Patch Changes

- Updated dependencies [3651ff7]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/db@0.118.4
  - @voyant-travel/hono@0.134.4

## 0.5.1

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/core@0.134.0
  - @voyant-travel/tools@0.5.0
  - @voyant-travel/db@0.118.3
  - @voyant-travel/hono@0.134.3

## 0.5.0

### Minor Changes

- 58020ec: Keep first-party Tools with unproven non-transactional external or multi-stage effects out of
  runtime discovery. The affected graph actions remain available as diagnostic metadata with an
  explicit unsafe-effect reason until each package gains tested transactional, outbox, or saga
  durability. This also covers supplier-side flight cancellation and contract execution whose
  post-commit lifecycle event is not yet durably published.

### Patch Changes

- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
- Updated dependencies
  - @voyant-travel/core@0.133.0
  - @voyant-travel/tools@0.4.0
  - @voyant-travel/db@0.118.2
  - @voyant-travel/hono@0.134.2

## 0.4.13

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/db@0.118.1
  - @voyant-travel/hono@0.134.1

## 0.4.12

### Patch Changes

- Updated dependencies [f945310]
- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/db@0.118.0
  - @voyant-travel/core@0.131.0
  - @voyant-travel/hono@0.134.0
  - @voyant-travel/types@0.109.9

## 0.4.11

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0

## 0.4.10

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0

## 0.4.9

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/hono@0.131.2
  - @voyant-travel/types@0.109.8

## 0.4.8

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0
  - @voyant-travel/hono@0.131.1
  - @voyant-travel/types@0.109.7

## 0.4.7

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/types@0.109.6

## 0.4.6

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/db@0.114.15
  - @voyant-travel/hono@0.130.1

## 0.4.5

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/core@0.128.0
  - @voyant-travel/hono@0.130.0
  - @voyant-travel/db@0.114.14

## 0.4.4

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0

## 0.4.3

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/db@0.114.13
  - @voyant-travel/hono@0.128.6

## 0.4.2

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/db@0.114.11
  - @voyant-travel/hono@0.128.4

## 0.4.1

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/core@0.125.0
  - @voyant-travel/db@0.114.9
  - @voyant-travel/hono@0.128.1

## 0.4.0

### Minor Changes

- 8f0fa26: Make Hono the explicit sole server API runtime while moving package and
  deployment interfaces to role-based API vocabulary. Replace Hono-prefixed module,
  extension, bundle, lazy-route, and factory names with `Api*` names; move
  router-named domain runtime entry points to `./api-runtime`; and remove the old
  names without compatibility aliases.

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/hono@0.128.0
  - @voyant-travel/db@0.114.8

## 0.3.0

### Minor Changes

- c9b6144: Add graph-composed, module-owned Tools for navigation preferences and organization setup,
  including exact action policies and owner-scoped project configuration for MCP context wiring.

### Patch Changes

- Updated dependencies [cabf662]
- Updated dependencies [b8cef4c]
- Updated dependencies [db5adce]
- Updated dependencies [c9b6144]
- Updated dependencies [ff87f68]
  - @voyant-travel/core@0.124.0
  - @voyant-travel/tools@0.3.0
  - @voyant-travel/db@0.114.7
  - @voyant-travel/hono@0.127.1

## 0.2.0

### Minor Changes

- 82ffd12: Add persisted organization-level first-run setup guidance composed from the
  selected admin graph. Standard Operator deployments now collect package-owned
  business profile, storefront, market, fiscal, navigation, team, and first-product
  steps while keeping domain mutations in their existing package surfaces.

### Patch Changes

- Updated dependencies [7e9f77a]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0
  - @voyant-travel/hono@0.127.0
  - @voyant-travel/db@0.114.6
