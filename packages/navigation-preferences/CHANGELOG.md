# @voyant-travel/navigation-preferences

## 0.24.10

### Patch Changes

- Updated dependencies [020de35]
  - @voyant-travel/core@0.142.0
  - @voyant-travel/action-ledger@0.115.19
  - @voyant-travel/db@0.122.2
  - @voyant-travel/hono@0.143.1

## 0.24.9

### Patch Changes

- 36f3085: Stamp `x-voyant-key-kind` on every published operation in this package's OpenAPI
  documents.

  These packages own admin-surface documents only, so every operation reads
  `secret`: a publishable storefront key never reaches `/v1/admin/*`. Stating it
  per operation is the point — "which credential does this accept" should not be
  something a reader has to infer from a path prefix.

- Updated dependencies [c805276]
- Updated dependencies [36f3085]
- Updated dependencies [c805276]
- Updated dependencies [36f3085]
  - @voyant-travel/core@0.141.0
  - @voyant-travel/db@0.122.0
  - @voyant-travel/action-ledger@0.115.18
  - @voyant-travel/hono@0.143.0
  - @voyant-travel/types@0.110.0

## 0.24.8

### Patch Changes

- 546f91a: Make approved organization navigation preferences use durable singleton command replay.

## 0.24.7

### Patch Changes

- Updated dependencies [afb6866]
- Updated dependencies [5d1b298]
  - @voyant-travel/db@0.121.0
  - @voyant-travel/hono@0.142.2
  - @voyant-travel/types@0.109.13
  - @voyant-travel/core@0.140.2

## 0.24.6

### Patch Changes

- Updated dependencies [7b8ef95]
  - @voyant-travel/core@0.140.0
  - @voyant-travel/db@0.120.6
  - @voyant-travel/hono@0.142.1

## 0.24.5

### Patch Changes

- Updated dependencies [e8bd000]
  - @voyant-travel/hono@0.142.0

## 0.24.4

### Patch Changes

- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
  - @voyant-travel/core@0.139.0
  - @voyant-travel/hono@0.141.0
  - @voyant-travel/db@0.120.3

## 0.24.3

### Patch Changes

- Updated dependencies [3552f14]
  - @voyant-travel/core@0.138.0
  - @voyant-travel/db@0.120.2
  - @voyant-travel/hono@0.140.1

## 0.24.2

### Patch Changes

- Updated dependencies [c35841b]
  - @voyant-travel/hono@0.140.0
  - @voyant-travel/core@0.137.2

## 0.24.1

### Patch Changes

- Updated dependencies [2bc1570]
- Updated dependencies [2bc1570]
- Updated dependencies [14033fb]
  - @voyant-travel/db@0.120.0
  - @voyant-travel/hono@0.139.0
  - @voyant-travel/types@0.109.12

## 0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [4fe6f79]
- Updated dependencies [276d44d]
- Updated dependencies [0c30250]
  - @voyant-travel/tools@0.10.0
  - @voyant-travel/core@0.137.0
  - @voyant-travel/db@0.119.1
  - @voyant-travel/hono@0.138.1

## 0.22.0

### Patch Changes

- Updated dependencies [e87d4de]
  - @voyant-travel/hono@0.138.0

## 0.21.1

### Patch Changes

- Updated dependencies [fae0f36]
  - @voyant-travel/tools@0.9.0

## 0.21.0

## 0.20.2

### Patch Changes

- Updated dependencies [d92a98a]
  - @voyant-travel/hono@0.137.0

## 0.20.1

### Patch Changes

- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
  - @voyant-travel/hono@0.136.0
  - @voyant-travel/tools@0.8.0

## 0.20.0

### Patch Changes

- Updated dependencies [8adeb23]
- Updated dependencies [6d0b4b4]
- Updated dependencies [7496159]
- Updated dependencies [fa75fe3]
  - @voyant-travel/db@0.119.0
  - @voyant-travel/hono@0.135.0
  - @voyant-travel/types@0.109.10

## 0.19.0

## 0.18.0

## 0.17.2

### Patch Changes

- f45db1c: Keep MCP catalog composition available for organization API keys when navigation preference Tools have no acting member.

## 0.17.1

### Patch Changes

- cb7221d: Declare `availability`, `effectBoundary: "local"`, and
  `targetLifecycle: "existing"` on `action.set-organization-navigation-preferences`
  and `action.set-my-navigation-preferences`. Both handlers upsert a single
  row via `onConflictDoUpdate`, so this only documents the existing local,
  idempotent behavior in the deployment graph; no runtime changes.

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

## 0.16.6

### Patch Changes

- Updated dependencies [17f1239]
  - @voyant-travel/tools@0.7.0

## 0.16.5

### Patch Changes

- Updated dependencies [a02a76b]
  - @voyant-travel/tools@0.6.0

## 0.16.4

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/core@0.136.0
  - @voyant-travel/db@0.118.5
  - @voyant-travel/hono@0.134.5

## 0.16.3

### Patch Changes

- Updated dependencies [3651ff7]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/db@0.118.4
  - @voyant-travel/hono@0.134.4

## 0.16.2

## 0.16.1

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/core@0.134.0
  - @voyant-travel/tools@0.5.0
  - @voyant-travel/db@0.118.3
  - @voyant-travel/hono@0.134.3

## 0.16.0

### Patch Changes

- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
- Updated dependencies
  - @voyant-travel/core@0.133.0
  - @voyant-travel/tools@0.4.0
  - @voyant-travel/db@0.118.2
  - @voyant-travel/hono@0.134.2

## 0.15.0

## 0.14.5

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/db@0.118.1
  - @voyant-travel/hono@0.134.1

## 0.14.4

### Patch Changes

- Updated dependencies [f945310]
- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/db@0.118.0
  - @voyant-travel/core@0.131.0
  - @voyant-travel/hono@0.134.0
  - @voyant-travel/types@0.109.9

## 0.14.3

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0

## 0.14.2

## 0.14.1

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0

## 0.14.0

## 0.13.2

### Patch Changes

- @voyant-travel/db@0.117.1

## 0.13.1

## 0.13.0

## 0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/hono@0.131.2
  - @voyant-travel/types@0.109.8

## 0.10.0

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0
  - @voyant-travel/hono@0.131.1
  - @voyant-travel/types@0.109.7

## 0.9.0

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/types@0.109.6

## 0.8.1

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/db@0.114.15
  - @voyant-travel/hono@0.130.1

## 0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/core@0.128.0
  - @voyant-travel/hono@0.130.0
  - @voyant-travel/db@0.114.14

## 0.6.3

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0

## 0.6.2

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/db@0.114.13
  - @voyant-travel/hono@0.128.6

## 0.6.1

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/db@0.114.11
  - @voyant-travel/hono@0.128.4

## 0.6.0

## 0.5.3

## 0.5.2

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/core@0.125.0
  - @voyant-travel/db@0.114.9
  - @voyant-travel/hono@0.128.1

## 0.5.1

## 0.5.0

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

## 0.4.0

### Patch Changes

- Updated dependencies [a1842a7]
  - @voyant-travel/hono@0.127.2

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

- 7e9f77a: Add organization defaults and member overrides for stable admin navigation IDs. Apply visibility
  after selected navigation composition without exposing ineligible routes, inherit hidden parent
  state through navigation subtrees, and retain structural parents only when a child is explicitly
  re-enabled. Ship the persistence, admin API, provisioning seam, and settings UI in standard Operator
  deployments, with duplicate settings contributions normalized at the host and core boundaries.

### Patch Changes

- Updated dependencies [7e9f77a]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0
  - @voyant-travel/hono@0.127.0
  - @voyant-travel/db@0.114.6
