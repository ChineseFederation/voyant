# @voyant-travel/crm

## 0.133.19

### Patch Changes

- Updated dependencies [7b8ef95]
  - @voyant-travel/core@0.140.0
  - @voyant-travel/action-ledger@0.115.15
  - @voyant-travel/bookings@0.240.1
  - @voyant-travel/custom-fields@0.2.30
  - @voyant-travel/db@0.120.6
  - @voyant-travel/hono@0.142.1
  - @voyant-travel/identity@0.236.6

## 0.133.18

### Patch Changes

- Updated dependencies [6c77f7d]
  - @voyant-travel/bookings@0.240.0

## 0.133.17

### Patch Changes

- Updated dependencies [e8bd000]
  - @voyant-travel/bookings@0.239.0
  - @voyant-travel/hono@0.142.0
  - @voyant-travel/action-ledger@0.115.14
  - @voyant-travel/custom-fields@0.2.29
  - @voyant-travel/identity@0.236.5

## 0.133.16

### Patch Changes

- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
  - @voyant-travel/core@0.139.0
  - @voyant-travel/hono@0.141.0
  - @voyant-travel/bookings@0.238.4
  - @voyant-travel/action-ledger@0.115.13
  - @voyant-travel/custom-fields@0.2.28
  - @voyant-travel/db@0.120.3
  - @voyant-travel/identity@0.236.4

## 0.133.15

### Patch Changes

- Updated dependencies [3552f14]
  - @voyant-travel/core@0.138.0
  - @voyant-travel/action-ledger@0.115.12
  - @voyant-travel/bookings@0.238.2
  - @voyant-travel/custom-fields@0.2.27
  - @voyant-travel/db@0.120.2
  - @voyant-travel/hono@0.140.1
  - @voyant-travel/identity@0.236.3

## 0.133.14

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
  - @voyant-travel/custom-fields@0.2.26
  - @voyant-travel/bookings@0.238.1
  - @voyant-travel/db@0.120.1

## 0.133.13

### Patch Changes

- Updated dependencies [06a79a0]
  - @voyant-travel/bookings@0.238.0

## 0.133.12

### Patch Changes

- Updated dependencies [c35841b]
  - @voyant-travel/hono@0.140.0
  - @voyant-travel/action-ledger@0.115.11
  - @voyant-travel/bookings@0.237.2
  - @voyant-travel/custom-fields@0.2.25
  - @voyant-travel/identity@0.236.2
  - @voyant-travel/core@0.137.2

## 0.133.11

### Patch Changes

- Updated dependencies [2bc1570]
- Updated dependencies [2bc1570]
- Updated dependencies [14033fb]
  - @voyant-travel/utils@0.111.0
  - @voyant-travel/db@0.120.0
  - @voyant-travel/hono@0.139.0
  - @voyant-travel/bookings@0.237.1
  - @voyant-travel/action-ledger@0.115.10
  - @voyant-travel/custom-fields@0.2.24
  - @voyant-travel/identity@0.236.1
  - @voyant-travel/types@0.109.12

## 0.133.10

### Patch Changes

- Updated dependencies [f69e880]
  - @voyant-travel/bookings@0.237.0

## 0.133.9

### Patch Changes

- @voyant-travel/bookings@0.236.0
- @voyant-travel/identity@0.236.0

## 0.133.8

### Patch Changes

- @voyant-travel/bookings@0.235.0
- @voyant-travel/identity@0.235.0

## 0.133.7

### Patch Changes

- Updated dependencies [46005bf]
- Updated dependencies [c986bd5]
- Updated dependencies [9f412dd]
- Updated dependencies [2ed62d3]
  - @voyant-travel/bookings@0.234.0
  - @voyant-travel/core@0.137.1
  - @voyant-travel/db@0.119.4
  - @voyant-travel/relationships-contracts@0.110.2
  - @voyant-travel/identity@0.234.0

## 0.133.6

### Patch Changes

- Updated dependencies [15c1c64]
  - @voyant-travel/bookings@0.233.0
  - @voyant-travel/db@0.119.3
  - @voyant-travel/relationships-contracts@0.110.1
  - @voyant-travel/identity@0.233.0

## 0.133.5

### Patch Changes

- Updated dependencies [ed8610c]
  - @voyant-travel/custom-fields@0.2.23
  - @voyant-travel/bookings@0.232.0
  - @voyant-travel/identity@0.232.0

## 0.133.4

### Patch Changes

- @voyant-travel/bookings@0.231.0
- @voyant-travel/identity@0.231.0

## 0.133.3

### Patch Changes

- Updated dependencies [79606bb]
  - @voyant-travel/bookings@0.230.0
  - @voyant-travel/identity@0.230.0

## 0.133.2

### Patch Changes

- @voyant-travel/bookings@0.229.0
- @voyant-travel/identity@0.229.0

## 0.133.1

### Patch Changes

- @voyant-travel/bookings@0.228.0
- @voyant-travel/identity@0.228.0

## 0.133.0

### Minor Changes

- e65bd25: Rename the bespoke sales Quote domain to Proposals across packages, routes, schemas, migrations, generated graph authorities, and operator surfaces.

  This beta-line release keeps no compatibility aliases, routes, package names, forwarding exports, views, or dual writes for the bespoke sales rename. Existing beta databases that contain the old bespoke quote schema must be dropped and recreated from the clean-slate migrations; there is no in-place migration path and no data-preservation guarantee for those beta databases.

### Patch Changes

- Updated dependencies [e65bd25]
  - @voyant-travel/bookings@0.227.0
  - @voyant-travel/relationships-contracts@0.110.0
  - @voyant-travel/db@0.119.2
  - @voyant-travel/identity@0.227.0

## 0.132.23

### Patch Changes

- Updated dependencies [6beffa2]
  - @voyant-travel/bookings@0.226.0
  - @voyant-travel/identity@0.226.0

## 0.132.22

### Patch Changes

- Updated dependencies [4fe6f79]
- Updated dependencies [276d44d]
- Updated dependencies [0c30250]
  - @voyant-travel/tools@0.10.0
  - @voyant-travel/core@0.137.0
  - @voyant-travel/action-ledger@0.115.9
  - @voyant-travel/bookings@0.225.0
  - @voyant-travel/identity@0.225.0
  - @voyant-travel/custom-fields@0.2.22
  - @voyant-travel/db@0.119.1
  - @voyant-travel/hono@0.138.1

## 0.132.21

### Patch Changes

- Updated dependencies [e87d4de]
  - @voyant-travel/hono@0.138.0
  - @voyant-travel/action-ledger@0.115.8
  - @voyant-travel/bookings@0.224.0
  - @voyant-travel/custom-fields@0.2.21
  - @voyant-travel/identity@0.224.0

## 0.132.20

### Patch Changes

- Updated dependencies [fae0f36]
- Updated dependencies [d02a4e8]
  - @voyant-travel/tools@0.9.0
  - @voyant-travel/bookings@0.223.0
  - @voyant-travel/action-ledger@0.115.7
  - @voyant-travel/identity@0.223.0

## 0.132.19

### Patch Changes

- @voyant-travel/bookings@0.222.0
- @voyant-travel/identity@0.222.0

## 0.132.18

### Patch Changes

- Updated dependencies [d92a98a]
  - @voyant-travel/hono@0.137.0
  - @voyant-travel/action-ledger@0.115.6
  - @voyant-travel/bookings@0.221.1
  - @voyant-travel/custom-fields@0.2.20
  - @voyant-travel/identity@0.221.1

## 0.132.17

### Patch Changes

- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
  - @voyant-travel/action-ledger@0.115.5
  - @voyant-travel/bookings@0.221.0
  - @voyant-travel/hono@0.136.0
  - @voyant-travel/tools@0.8.0
  - @voyant-travel/custom-fields@0.2.19
  - @voyant-travel/identity@0.221.0

## 0.132.16

### Patch Changes

- Updated dependencies [8adeb23]
- Updated dependencies [6d0b4b4]
- Updated dependencies [7496159]
- Updated dependencies [fa75fe3]
  - @voyant-travel/bookings@0.220.0
  - @voyant-travel/action-ledger@0.115.4
  - @voyant-travel/db@0.119.0
  - @voyant-travel/hono@0.135.0
  - @voyant-travel/custom-fields@0.2.18
  - @voyant-travel/identity@0.220.0
  - @voyant-travel/types@0.109.10

## 0.132.15

### Patch Changes

- Updated dependencies [6df3ab4]
  - @voyant-travel/tools@0.7.2
  - @voyant-travel/bookings@0.219.0
  - @voyant-travel/identity@0.219.0

## 0.132.14

### Patch Changes

- Updated dependencies [a799849]
  - @voyant-travel/bookings@0.218.0
  - @voyant-travel/identity@0.218.0

## 0.132.13

### Patch Changes

- @voyant-travel/bookings@0.217.0
- @voyant-travel/identity@0.217.0

## 0.132.12

### Patch Changes

- Updated dependencies [903c754]
  - @voyant-travel/bookings@0.216.0
  - @voyant-travel/identity@0.216.0

## 0.132.11

### Patch Changes

- @voyant-travel/bookings@0.215.0
- @voyant-travel/identity@0.215.0

## 0.132.10

### Patch Changes

- @voyant-travel/bookings@0.214.0
- @voyant-travel/identity@0.214.0

## 0.132.9

### Patch Changes

- @voyant-travel/bookings@0.213.0
- @voyant-travel/identity@0.213.0

## 0.132.8

### Patch Changes

- @voyant-travel/bookings@0.212.0
- @voyant-travel/identity@0.212.0

## 0.132.7

### Patch Changes

- @voyant-travel/bookings@0.211.0
- @voyant-travel/identity@0.211.0

## 0.132.6

### Patch Changes

- @voyant-travel/bookings@0.210.0
- @voyant-travel/identity@0.210.0

## 0.132.5

### Patch Changes

- @voyant-travel/bookings@0.209.0
- @voyant-travel/identity@0.209.0

## 0.132.4

### Patch Changes

- @voyant-travel/bookings@0.208.0
- @voyant-travel/identity@0.208.0

## 0.132.3

### Patch Changes

- accb1cf: Declare safety-contract metadata on the eleven remaining grandfathered
  person/organization CRUD actions and remove them from the legacy
  execute+tools allowlist:

  - `action.add-person-note`, `action.add-organization-note`,
    `action.add-person-contact-method`, `action.add-organization-contact-method`,
    `action.add-person-address`, and `action.add-organization-address` already
    declared `targetLifecycle: "existing"` against the owning person or
    organization (`commandTargetField: "entityId"`); each is a plain local
    Postgres insert (delegating to identity's already-migrated contact-point
    and address services, or a direct notes insert) with no external calls, so
    this adds `availability` and `effectBoundary: "local"`.
  - `action.update-person` and `action.update-organization` are single local
    Postgres updates against an existing row (already declared via
    `commandTargetField: "id"`) that notify an in-process event bus (not a
    durable outbox, unlike `create-person`/`create-organization`), so they
    declare `availability`, `effectBoundary: "local"`, and
    `targetLifecycle: "existing"`.
  - `action.update-relationship-note`, `action.update-relationship-contact-method`,
    and `action.update-relationship-address` are likewise single local Postgres
    updates against an existing row and declare the same three facets.

  No runtime changes.

- Updated dependencies [accb1cf]
  - @voyant-travel/identity@0.207.1

## 0.132.2

### Patch Changes

- Updated dependencies [4979d3b]
  - @voyant-travel/bookings@0.207.0
  - @voyant-travel/identity@0.207.0

## 0.132.1

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/hono@0.134.6
  - @voyant-travel/bookings@0.206.0
  - @voyant-travel/identity@0.206.0

## 0.132.0

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

- @voyant-travel/bookings@0.205.0
- @voyant-travel/identity@0.205.0

## 0.131.7

### Patch Changes

- @voyant-travel/bookings@0.204.0
- @voyant-travel/identity@0.204.0

## 0.131.6

### Patch Changes

- Updated dependencies [17f1239]
  - @voyant-travel/action-ledger@0.115.0
  - @voyant-travel/bookings@0.203.0
  - @voyant-travel/tools@0.7.0
  - @voyant-travel/identity@0.203.0

## 0.131.5

### Patch Changes

- @voyant-travel/bookings@0.202.0
- @voyant-travel/identity@0.202.0

## 0.131.4

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
  - @voyant-travel/identity@0.201.1

## 0.131.3

### Patch Changes

- @voyant-travel/bookings@0.201.0
- @voyant-travel/identity@0.201.0

## 0.131.2

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/core@0.136.0
  - @voyant-travel/utils@0.110.0
  - @voyant-travel/action-ledger@0.113.2
  - @voyant-travel/bookings@0.200.0
  - @voyant-travel/custom-fields@0.2.17
  - @voyant-travel/db@0.118.5
  - @voyant-travel/hono@0.134.5
  - @voyant-travel/identity@0.200.0
  - @voyant-travel/relationships-contracts@0.109.2

## 0.131.1

### Patch Changes

- Updated dependencies [3651ff7]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/action-ledger@0.113.1
  - @voyant-travel/bookings@0.199.0
  - @voyant-travel/custom-fields@0.2.16
  - @voyant-travel/db@0.118.4
  - @voyant-travel/hono@0.134.4
  - @voyant-travel/identity@0.199.0

## 0.131.0

### Minor Changes

- c7459a2: Restore `create_person` as a handler-owned created-target command whose person,
  identity contact points, deterministic `person.changed` outbox event, ledger,
  and immutable result commit atomically.

  The Tool now always creates a new person and returns
  `{ status, person: { id }, replayed }`. It no longer performs implicit
  exact-name reuse or accepts `allowDuplicateName`. See
  `docs/migrations/created-relationships-person.md` for caller guidance.

### Patch Changes

- @voyant-travel/bookings@0.198.0
- @voyant-travel/identity@0.198.0

## 0.130.0

### Minor Changes

- fa1cc2c: Restore `create_organization` as a handler-owned created-target command whose
  organization, optional billing address, deterministic `organization.changed`
  outbox event, ledger, and immutable result commit atomically.

  The Tool now returns `{ status, organization: { id }, replayed }` instead of
  the mutable organization and billing-address rows. See
  `docs/migrations/created-relationships-organization.md` for caller guidance.

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/action-ledger@0.113.0
  - @voyant-travel/bookings@0.197.0
  - @voyant-travel/core@0.134.0
  - @voyant-travel/tools@0.5.0
  - @voyant-travel/identity@0.197.0
  - @voyant-travel/custom-fields@0.2.15
  - @voyant-travel/db@0.118.3
  - @voyant-travel/hono@0.134.3

## 0.129.0

### Minor Changes

- bba4fec: Anchor generated-child actions to stable existing parents so action policy checks
  do not require IDs that only exist after dispatch. Split relationship child
  creation Tools by person and organization so each selected action has one
  unambiguous parent target type. Bind each generic action's policy target to its
  domain parent-id input before ledger, approval, or handler execution.
- 58020ec: Keep first-party Tools with unproven non-transactional external or multi-stage effects out of
  runtime discovery. The affected graph actions remain available as diagnostic metadata with an
  explicit unsafe-effect reason until each package gains tested transactional, outbox, or saga
  durability. This also covers supplier-side flight cancellation and contract execution whose
  post-commit lifecycle event is not yet durably published.

### Patch Changes

- Updated dependencies [c1f9cdf]
- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
- Updated dependencies
  - @voyant-travel/action-ledger@0.112.0
  - @voyant-travel/bookings@0.196.0
  - @voyant-travel/core@0.133.0
  - @voyant-travel/identity@0.196.0
  - @voyant-travel/tools@0.4.0
  - @voyant-travel/custom-fields@0.2.14
  - @voyant-travel/db@0.118.2
  - @voyant-travel/hono@0.134.2

## 0.128.36

### Patch Changes

- Updated dependencies [e3a1e17]
  - @voyant-travel/bookings@0.195.0
  - @voyant-travel/identity@0.195.0

## 0.128.35

### Patch Changes

- Updated dependencies [dd370ca]
  - @voyant-travel/core@0.132.1
  - @voyant-travel/bookings@0.194.0
  - @voyant-travel/identity@0.194.0

## 0.128.34

### Patch Changes

- @voyant-travel/bookings@0.193.0
- @voyant-travel/identity@0.193.0

## 0.128.33

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/action-ledger@0.111.14
  - @voyant-travel/bookings@0.192.1
  - @voyant-travel/custom-fields@0.2.13
  - @voyant-travel/db@0.118.1
  - @voyant-travel/hono@0.134.1
  - @voyant-travel/identity@0.192.1

## 0.128.32

### Patch Changes

- @voyant-travel/bookings@0.192.0
- @voyant-travel/identity@0.192.0

## 0.128.31

### Patch Changes

- @voyant-travel/bookings@0.191.0
- @voyant-travel/identity@0.191.0

## 0.128.30

### Patch Changes

- Updated dependencies [228b57d]
- Updated dependencies [f945310]
- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/bookings@0.190.0
  - @voyant-travel/db@0.118.0
  - @voyant-travel/core@0.131.0
  - @voyant-travel/hono@0.134.0
  - @voyant-travel/action-ledger@0.111.13
  - @voyant-travel/custom-fields@0.2.12
  - @voyant-travel/identity@0.190.0
  - @voyant-travel/types@0.109.9

## 0.128.29

### Patch Changes

- @voyant-travel/bookings@0.189.0
- @voyant-travel/identity@0.189.0

## 0.128.28

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0
  - @voyant-travel/utils@0.109.0
  - @voyant-travel/action-ledger@0.111.11
  - @voyant-travel/bookings@0.188.0
  - @voyant-travel/custom-fields@0.2.11
  - @voyant-travel/identity@0.188.0

## 0.128.27

### Patch Changes

- @voyant-travel/bookings@0.187.0
- @voyant-travel/identity@0.187.0

## 0.128.26

### Patch Changes

- @voyant-travel/bookings@0.186.0
- @voyant-travel/identity@0.186.0

## 0.128.25

### Patch Changes

- @voyant-travel/bookings@0.185.0
- @voyant-travel/identity@0.185.0

## 0.128.24

### Patch Changes

- @voyant-travel/bookings@0.184.0
- @voyant-travel/identity@0.184.0

## 0.128.23

### Patch Changes

- @voyant-travel/bookings@0.183.0
- @voyant-travel/identity@0.183.0

## 0.128.22

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0
  - @voyant-travel/action-ledger@0.111.10
  - @voyant-travel/bookings@0.182.1
  - @voyant-travel/custom-fields@0.2.10
  - @voyant-travel/identity@0.182.1

## 0.128.21

### Patch Changes

- @voyant-travel/bookings@0.182.0
- @voyant-travel/identity@0.182.0

## 0.128.20

### Patch Changes

- Updated dependencies [464815c]
  - @voyant-travel/bookings@0.181.0
  - @voyant-travel/identity@0.181.0

## 0.128.19

### Patch Changes

- @voyant-travel/bookings@0.180.0
- @voyant-travel/identity@0.180.0

## 0.128.18

### Patch Changes

- @voyant-travel/bookings@0.179.0
- @voyant-travel/identity@0.179.0

## 0.128.17

### Patch Changes

- @voyant-travel/bookings@0.178.0
- @voyant-travel/identity@0.178.0

## 0.128.16

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/action-ledger@0.111.9
  - @voyant-travel/bookings@0.177.0
  - @voyant-travel/custom-fields@0.2.9
  - @voyant-travel/hono@0.131.2
  - @voyant-travel/identity@0.177.0
  - @voyant-travel/types@0.109.8

## 0.128.15

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0
  - @voyant-travel/action-ledger@0.111.8
  - @voyant-travel/bookings@0.176.0
  - @voyant-travel/custom-fields@0.2.8
  - @voyant-travel/hono@0.131.1
  - @voyant-travel/identity@0.176.0
  - @voyant-travel/types@0.109.7

## 0.128.14

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/bookings@0.175.0
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/action-ledger@0.111.7
  - @voyant-travel/custom-fields@0.2.7
  - @voyant-travel/identity@0.175.0
  - @voyant-travel/types@0.109.6

## 0.128.13

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/bookings@0.174.0
  - @voyant-travel/action-ledger@0.111.6
  - @voyant-travel/custom-fields@0.2.6
  - @voyant-travel/db@0.114.15
  - @voyant-travel/hono@0.130.1
  - @voyant-travel/identity@0.174.0

## 0.128.12

### Patch Changes

- @voyant-travel/bookings@0.173.0
- @voyant-travel/identity@0.173.0

## 0.128.11

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/bookings@0.172.0
  - @voyant-travel/core@0.128.0
  - @voyant-travel/hono@0.130.0
  - @voyant-travel/utils@0.108.0
  - @voyant-travel/action-ledger@0.111.5
  - @voyant-travel/custom-fields@0.2.5
  - @voyant-travel/db@0.114.14
  - @voyant-travel/identity@0.172.0

## 0.128.10

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0
  - @voyant-travel/action-ledger@0.111.4
  - @voyant-travel/bookings@0.171.1
  - @voyant-travel/custom-fields@0.2.4
  - @voyant-travel/identity@0.171.1

## 0.128.9

### Patch Changes

- @voyant-travel/bookings@0.171.0
- @voyant-travel/identity@0.171.0

## 0.128.8

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/action-ledger@0.111.3
  - @voyant-travel/bookings@0.170.0
  - @voyant-travel/custom-fields@0.2.3
  - @voyant-travel/db@0.114.13
  - @voyant-travel/hono@0.128.6
  - @voyant-travel/identity@0.170.0

## 0.128.7

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/action-ledger@0.111.2
  - @voyant-travel/bookings@0.169.1
  - @voyant-travel/custom-fields@0.2.2
  - @voyant-travel/db@0.114.11
  - @voyant-travel/hono@0.128.4
  - @voyant-travel/identity@0.169.1

## 0.128.6

### Patch Changes

- @voyant-travel/bookings@0.169.0
- @voyant-travel/identity@0.169.0

## 0.128.5

### Patch Changes

- @voyant-travel/bookings@0.168.0
- @voyant-travel/identity@0.168.0

## 0.128.4

### Patch Changes

- @voyant-travel/bookings@0.167.0
- @voyant-travel/identity@0.167.0

## 0.128.3

### Patch Changes

- @voyant-travel/bookings@0.166.0
- @voyant-travel/identity@0.166.0

## 0.128.2

### Patch Changes

- @voyant-travel/bookings@0.165.0
- @voyant-travel/identity@0.165.0

## 0.128.1

### Patch Changes

- @voyant-travel/bookings@0.164.0
- @voyant-travel/identity@0.164.0

## 0.128.0

### Minor Changes

- 52352c4: Move custom-field definition Settings ownership to the generic custom-fields
  package. Selected entity manifests now declare the targets and field types that
  the canonical API may accept. The unused Relationships definition API and
  Settings surfaces are removed without compatibility adapters.

  Target capability declarations now constrain searchable, exportable, and
  invoiceable settings end to end, and unsupported flags are stored as false.

- 52352c4: Store custom-field values exclusively as `custom_fields[namespace][key]`.
  Owner-scoped value operations derive namespaces from trusted definition
  context, ordinary entity routes preserve non-operator namespaces, and
  definition rename/delete cleanup is delegated to the package that owns each
  entity table.
- 52352c4: Remove project-local TypeScript custom-field declarations, discovery globs,
  executable validation callbacks, and code/database merge helpers. The generic
  custom-fields package now owns canonical value routes and dispatches operations
  to selected entity-owning packages through typed runtime contributions, with no
  Relationships compatibility adapter.

### Patch Changes

- 52352c4: Resolve custom-field definitions exclusively from persisted Settings records.
  Bookings and Relationships now share the package-owned database resolver.
  Project-local TypeScript authoring is removed by the completed custom-fields
  cutline.
- 52352c4: Persist custom-field namespace, owner, lifecycle, and provenance metadata.
  Operator definitions use the reserved `custom` namespace, app operations are
  owner-constrained, platform definitions derive ownership from the selected
  target, and Settings renders non-operator definitions as read-only.
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/bookings@0.163.0
  - @voyant-travel/core@0.125.0
  - @voyant-travel/relationships-contracts@0.109.0
  - @voyant-travel/custom-fields@0.2.0
  - @voyant-travel/action-ledger@0.111.1
  - @voyant-travel/db@0.114.9
  - @voyant-travel/hono@0.128.1
  - @voyant-travel/identity@0.163.0

## 0.127.1

### Patch Changes

- Updated dependencies [5941d2c]
  - @voyant-travel/action-ledger@0.111.0
  - @voyant-travel/bookings@0.162.1

## 0.127.0

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
  - @voyant-travel/hono@0.128.0
  - @voyant-travel/identity@0.162.0
  - @voyant-travel/db@0.114.8

## 0.126.1

### Patch Changes

- Updated dependencies [a1842a7]
- Updated dependencies [85bfe2c]
  - @voyant-travel/hono@0.127.2
  - @voyant-travel/action-ledger@0.109.1
  - @voyant-travel/bookings@0.161.0
  - @voyant-travel/identity@0.161.0

## 0.126.0

### Minor Changes

- bf19d5a: Add staff-only, typed CRM lifecycle Tools for creating and updating people and organizations and
  for listing, adding, and updating notes, contact methods, and addresses. Add compatibility aliases,
  request-scoped service wiring, sensitive-data risk metadata, and ledgered graph action bindings.

### Patch Changes

- Updated dependencies [cabf662]
- Updated dependencies [701ccc4]
- Updated dependencies [5f15e2e]
- Updated dependencies [372f4f4]
- Updated dependencies [b8cef4c]
- Updated dependencies [d9e8984]
- Updated dependencies [db5adce]
- Updated dependencies [c9b6144]
- Updated dependencies [6604f9e]
- Updated dependencies [ff87f68]
  - @voyant-travel/action-ledger@0.109.0
  - @voyant-travel/core@0.124.0
  - @voyant-travel/tools@0.3.0
  - @voyant-travel/bookings@0.160.0
  - @voyant-travel/identity@0.160.0
  - @voyant-travel/db@0.114.7
  - @voyant-travel/hono@0.127.1

## 0.125.4

### Patch Changes

- Updated dependencies [7e9f77a]
- Updated dependencies [49f55d0]
- Updated dependencies [552acbf]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0
  - @voyant-travel/hono@0.127.0
  - @voyant-travel/bookings@0.159.0
  - @voyant-travel/tools@0.2.2
  - @voyant-travel/action-ledger@0.108.6
  - @voyant-travel/db@0.114.6
  - @voyant-travel/identity@0.159.0

## 0.125.3

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
  - @voyant-travel/action-ledger@0.108.5
  - @voyant-travel/core@0.122.2
  - @voyant-travel/db@0.114.5
  - @voyant-travel/identity@0.158.0
  - @voyant-travel/types@0.109.2

## 0.125.2

### Patch Changes

- @voyant-travel/bookings@0.157.0
- @voyant-travel/identity@0.157.0

## 0.125.1

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
  - @voyant-travel/hono@0.126.3
  - @voyant-travel/identity@0.156.1
  - @voyant-travel/relationships-contracts@0.108.13
  - @voyant-travel/tools@0.2.1

## 0.125.0

### Minor Changes

- bbe6396: Replace the overloaded Finance voucher domain with Travel Credits across the
  database schema, APIs, package exports, booking inputs, storefront settings,
  and operator UI. Redemption commands are replay-safe, codes are normalized and
  case-insensitively unique, and legacy records migrate in place without silently
  skipping invalid balances. Keep Promotion Codes in Commerce and move Bookings
  fulfillment to the explicit Service Voucher vocabulary.

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/bookings@0.156.0
  - @voyant-travel/db@0.114.3
  - @voyant-travel/relationships-contracts@0.108.12
  - @voyant-travel/identity@0.156.0

## 0.124.4

### Patch Changes

- Updated dependencies [cc85042]
- Updated dependencies [07a6ee3]
  - @voyant-travel/core@0.122.0
  - @voyant-travel/bookings@0.155.1
  - @voyant-travel/db@0.114.2
  - @voyant-travel/hono@0.126.2
  - @voyant-travel/action-ledger@0.108.3
  - @voyant-travel/identity@0.155.1

## 0.124.3

### Patch Changes

- Updated dependencies [3f6694b]
  - @voyant-travel/core@0.121.0
  - @voyant-travel/action-ledger@0.108.2
  - @voyant-travel/bookings@0.155.0
  - @voyant-travel/db@0.114.1
  - @voyant-travel/hono@0.126.1
  - @voyant-travel/identity@0.155.0

## 0.124.2

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [bef5b7c]
  - @voyant-travel/hono@0.126.0
  - @voyant-travel/types@0.109.0
  - @voyant-travel/utils@0.107.0
  - @voyant-travel/db@0.114.0
  - @voyant-travel/core@0.120.0
  - @voyant-travel/action-ledger@0.108.1
  - @voyant-travel/bookings@0.154.0
  - @voyant-travel/identity@0.154.0

## 0.124.1

### Patch Changes

- 490d132: Move the final Operator runtime-port registrations into package-owned contributor surfaces.
- c65b05c: Move the legacy custom-field EAV backfill into an automatic, data-safe package migration. The migration preserves values already written through the unified JSON path and refuses retirement when any legacy row cannot be accounted for.
- 490d132: Move capability-derived Node runtime binding assembly into package-owned contributors.
- 490d132: Move standard first-party admin factories, package copy, slots, contributions, and icons into selected deployment graph composition.
- 490d132: Declare Action Ledger, Distribution, MICE, and Relationships OpenAPI documents in their package-owned deployment manifests and ship their committed admin contracts from the owning packages.
- 490d132: Declare package-owned runtime contributors in `voyant.package.v1` metadata and statically lower selected contributors into generated Node graph source. Node hosts now compose one generated contributor set from opaque host resources without enumerating first-party factories or package IDs.
- 490d132: Compose MCP tools and their service context from graph-selected package runtime exports instead of an Operator-owned product catalog.
- 490d132: Move runtime construction into BOM-selected domain contributors and replace the Finance target package with typed graph ports while keeping package dependencies acyclic.
- 490d132: Move Operator Settings and Relationships admin presentation authority into selected package graph factories.
- c65b05c: Move standard cross-package link tables and the person directory view into
  upgrade-safe package migration histories, use stable package ledger identities,
  and remove aggregate Drizzle and migration authority from the Operator starter.
- 490d132: Compose package runtimes from generic Node primitives and typed graph ports instead of Operator capability wiring.
- cda53b6: Preserve legacy migration and route behavior in the unified Node host, align generated admin assets with their graph artifacts, restore auth email and media compatibility, and publish the selected-graph OpenAPI entry.
- 490d132: Compose Storefront runtime behavior through static package-owned graph ports and remove the Operator runtime loader.
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
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
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
  - @voyant-travel/bookings@0.153.0
  - @voyant-travel/action-ledger@0.108.0
  - @voyant-travel/db@0.113.0
  - @voyant-travel/core@0.119.0
  - @voyant-travel/tools@0.2.0
  - @voyant-travel/hono@0.125.1
  - @voyant-travel/types@0.108.1
  - @voyant-travel/identity@0.153.0

## 0.124.0

### Minor Changes

- d771be3: Move Relationships graph runtime composition behind a package-owned typed port and runtime factory.

### Patch Changes

- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [8f537b0]
- Updated dependencies [d26a820]
- Updated dependencies [d771be3]
- Updated dependencies [bd7a830]
  - @voyant-travel/core@0.118.0
  - @voyant-travel/action-ledger@0.107.0
  - @voyant-travel/types@0.108.0
  - @voyant-travel/hono@0.125.0
  - @voyant-travel/identity@0.152.0
  - @voyant-travel/db@0.112.2
  - @voyant-travel/utils@0.106.1

## 0.123.4

### Patch Changes

- Updated dependencies [c66f9a5]
  - @voyant-travel/core@0.117.0
  - @voyant-travel/action-ledger@0.106.4
  - @voyant-travel/db@0.112.1
  - @voyant-travel/hono@0.124.1
  - @voyant-travel/identity@0.151.4

## 0.123.3

### Patch Changes

- Updated dependencies [ca90eb5]
  - @voyant-travel/db@0.112.0
  - @voyant-travel/hono@0.124.0
  - @voyant-travel/action-ledger@0.106.3
  - @voyant-travel/identity@0.151.3
  - @voyant-travel/types@0.107.3

## 0.123.2

### Patch Changes

- Updated dependencies [8576451]
  - @voyant-travel/core@0.116.0
  - @voyant-travel/action-ledger@0.106.2
  - @voyant-travel/db@0.111.2
  - @voyant-travel/hono@0.123.2
  - @voyant-travel/identity@0.151.2

## 0.123.1

### Patch Changes

- Updated dependencies [e4e6621]
- Updated dependencies [953e418]
- Updated dependencies [2153e48]
  - @voyant-travel/core@0.115.0
  - @voyant-travel/action-ledger@0.106.1
  - @voyant-travel/hono@0.123.0
  - @voyant-travel/db@0.111.1
  - @voyant-travel/identity@0.151.1

## 0.123.0

### Minor Changes

- e3dc5a9: Declare the existing customer and commerce admin routes, navigation, slots, copy, and widget contributions in their package-owned Voyant manifests.
- a370024: Publish package-owned deployment manifests for identity, relationships, finance,
  and operations graph surfaces.
- e3dc5a9: Move existing customer and commerce package surfaces into package-owned Voyant manifests, including Node application events, tools, access resources, action metadata, setup migrations, outbound webhooks, and retain-data lifecycle declarations.

### Patch Changes

- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
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
  - @voyant-travel/core@0.114.0
  - @voyant-travel/action-ledger@0.106.0
  - @voyant-travel/db@0.111.0
  - @voyant-travel/identity@0.151.0
  - @voyant-travel/hono@0.122.4
  - @voyant-travel/types@0.107.2

## 0.122.12

### Patch Changes

- Updated dependencies [496f2ef]
  - @voyant-travel/core@0.113.0
  - @voyant-travel/action-ledger@0.105.15
  - @voyant-travel/db@0.110.2
  - @voyant-travel/hono@0.122.3
  - @voyant-travel/identity@0.150.0

## 0.122.11

### Patch Changes

- 5e1d221: Publish `voyant.package.v1` compatibility metadata from first-party
  schema-owning packages so deployment graph package admission can validate their
  framework, target, and deployment-mode compatibility before runtime imports.
- Updated dependencies [5e1d221]
- Updated dependencies [682d7d0]
  - @voyant-travel/action-ledger@0.105.14
  - @voyant-travel/db@0.110.1
  - @voyant-travel/identity@0.149.1
  - @voyant-travel/hono@0.122.2

## 0.122.10

### Patch Changes

- @voyant-travel/identity@0.149.0

## 0.122.9

### Patch Changes

- @voyant-travel/identity@0.148.0

## 0.122.8

### Patch Changes

- @voyant-travel/identity@0.147.0

## 0.122.7

### Patch Changes

- @voyant-travel/identity@0.146.0

## 0.122.6

### Patch Changes

- @voyant-travel/identity@0.145.0

## 0.122.5

### Patch Changes

- @voyant-travel/identity@0.144.0

## 0.122.4

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/utils@0.106.0
  - @voyant-travel/db@0.110.0
  - @voyant-travel/hono@0.122.0
  - @voyant-travel/core@0.112.3
  - @voyant-travel/action-ledger@0.105.13
  - @voyant-travel/identity@0.143.0
  - @voyant-travel/types@0.107.1

## 0.122.3

### Patch Changes

- @voyant-travel/identity@0.142.0

## 0.122.2

### Patch Changes

- @voyant-travel/identity@0.141.0

## 0.122.1

### Patch Changes

- @voyant-travel/identity@0.140.0

## 0.122.0

### Minor Changes

- fc71db1: Add read-only agent tools (`./tools`) for four more domains, following the
  module-owned-tools pattern over each package's existing service:

  - `@voyant-travel/bookings`: `list_bookings` + `get_booking` (non-PII, `bookings:read`).
  - `@voyant-travel/finance`: `list_invoices` + `get_invoice` (`finance:read`).
  - `@voyant-travel/quotes`: `list_quotes` + `get_quote` (`quotes:read`).
  - `@voyant-travel/relationships`: `list_people` / `get_person` / `list_organizations` /
    `get_organization` (`crm:read`).

  The operator registers them on the in-deployment MCP server, so `/v1/admin/mcp` now
  serves trips, products, bookings, finance, quotes, and CRM tools, each gated per-tool
  by scope + audience.

### Patch Changes

- bf2d4a5: Reject invalid communication `sentAt` values during request validation instead of failing during persistence.
- e1290d9: Allow People nested contact method and address creates to derive identity ownership from the route path, and reject creates for missing people.
- Updated dependencies [c9a356f]
- Updated dependencies [bf2d4a5]
- Updated dependencies [6474f42]
- Updated dependencies [5786f63]
- Updated dependencies [1655995]
  - @voyant-travel/types@0.107.0
  - @voyant-travel/core@0.112.0
  - @voyant-travel/hono@0.121.0
  - @voyant-travel/relationships-contracts@0.108.11
  - @voyant-travel/tools@0.1.0
  - @voyant-travel/identity@0.139.0
  - @voyant-travel/utils@0.105.6
  - @voyant-travel/action-ledger@0.105.12
  - @voyant-travel/db@0.109.5

## 0.121.14

### Patch Changes

- 5e6a2ff: Expose person payment methods and communication logs on the person detail UI, add React hooks for those person-scoped resources, and enforce kind-specific payment method validation for cards versus bank transfers.
- 92bac99: Validate person document issue/expiry date ranges and expose add and primary actions in the person detail documents tab.
- 5fa49b1: Keep person relationship auto-inverse pairs synchronized when either side is updated or deleted.
- c7bd13f: Reject reversed person relationship date ranges and return stable conflicts for duplicate creates.
- Updated dependencies [5e6a2ff]
- Updated dependencies [92bac99]
- Updated dependencies [c7bd13f]
  - @voyant-travel/relationships-contracts@0.108.10

## 0.121.13

### Patch Changes

- 7df89ab: Reject organization deletion with linked people instead of silently unlinking those people.
- 8cb2124: Accept natural payloads on organization nested contact/address routes and prevent dangling identity rows for missing organizations.
- e002da8: Preserve existing person fields when PATCH requests omit create-defaulted status and tags.
- Updated dependencies [e002da8]
  - @voyant-travel/relationships-contracts@0.108.9

## 0.121.12

### Patch Changes

- b615127: Validate activity links to relationship-owned entity types before creating link rows.
  - @voyant-travel/identity@0.138.3

## 0.121.11

### Patch Changes

- 46d7d52: Keep organization PATCH requests partial by avoiding create defaults on update
  payloads, so omitted fields such as status and tags remain unchanged.
- Updated dependencies [46d7d52]
  - @voyant-travel/relationships-contracts@0.108.7

## 0.121.10

### Patch Changes

- Updated dependencies [1cb9cba]
- Updated dependencies [131ff9b]
  - @voyant-travel/hono@0.120.0
  - @voyant-travel/action-ledger@0.105.11
  - @voyant-travel/identity@0.138.2

## 0.121.9

### Patch Changes

- Updated dependencies [86fbb05]
  - @voyant-travel/hono@0.119.0
  - @voyant-travel/action-ledger@0.105.10
  - @voyant-travel/identity@0.138.1

## 0.121.8

### Patch Changes

- 569e2a0: Settings reference-data creates now return a deterministic 409 conflict on
  duplicate unique keys instead of a generic 500, so the admin UI can render an
  inline field error. `POST /v1/admin/pricing/price-catalogs` maps a duplicate
  `code` to `duplicate_price_catalog_code`, and
  `POST /v1/admin/relationships/custom-fields` maps a duplicate `(entityType,
key)` to `duplicate_custom_field_key`. Both use `onConflictDoNothing` and throw
  a 409 `ApiHttpError` carrying `details.fields` / `details.issues`, matching the
  existing product-type / product-tag duplicate-error shape.

## 0.121.7

### Patch Changes

- @voyant-travel/identity@0.138.0

## 0.121.6

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/hono@0.118.0
  - @voyant-travel/action-ledger@0.105.9
  - @voyant-travel/identity@0.137.1

## 0.121.5

### Patch Changes

- Updated dependencies [7c5ee80]
  - @voyant-travel/hono@0.117.0
  - @voyant-travel/action-ledger@0.105.8
  - @voyant-travel/identity@0.137.0

## 0.121.4

### Patch Changes

- 12a1eb2: Expose client-safe subpaths for validation schemas, linkable metadata, template authoring metadata, finance payment-policy primitives, and Hono reporter utilities. Move browser-facing React/operator imports off mixed runtime barrels so client bundles do not pull Hono request context or other server-only runtime code.
- Updated dependencies [12a1eb2]
  - @voyant-travel/hono@0.116.2
  - @voyant-travel/identity@0.136.2

## 0.121.3

### Patch Changes

- Updated dependencies [293e5e4]
  - @voyant-travel/hono@0.116.1
  - @voyant-travel/db@0.109.2
  - @voyant-travel/relationships-contracts@0.108.4
  - @voyant-travel/identity@0.136.0

## 0.121.2

### Patch Changes

- @voyant-travel/db@0.109.1
- @voyant-travel/relationships-contracts@0.108.3
- @voyant-travel/identity@0.135.0

## 0.121.1

### Patch Changes

- Updated dependencies [684b321]
- Updated dependencies [2542715]
  - @voyant-travel/hono@0.116.0
  - @voyant-travel/action-ledger@0.105.7
  - @voyant-travel/identity@0.134.1

## 0.121.0

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
  - @voyant-travel/identity@0.134.0
  - @voyant-travel/action-ledger@0.105.6
  - @voyant-travel/utils@0.105.4

## 0.120.13

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/hono@0.114.0
  - @voyant-travel/db@0.109.0
  - @voyant-travel/utils@0.105.3
  - @voyant-travel/action-ledger@0.105.5
  - @voyant-travel/identity@0.133.0
  - @voyant-travel/relationships-contracts@0.108.2

## 0.120.12

### Patch Changes

- @voyant-travel/identity@0.132.0

## 0.120.11

### Patch Changes

- Updated dependencies [021ec00]
  - @voyant-travel/hono@0.113.0
  - @voyant-travel/core@0.111.0
  - @voyant-travel/action-ledger@0.105.4
  - @voyant-travel/identity@0.131.1
  - @voyant-travel/db@0.108.5

## 0.120.10

### Patch Changes

- @voyant-travel/identity@0.131.0

## 0.120.9

### Patch Changes

- @voyant-travel/identity@0.130.0

## 0.120.8

### Patch Changes

- 7929dae: Stop relationships people reads/updates from breaking when `person_directory` is missing (fixes #1971).

  `personDirectoryView` is a `pgView(...).existing()`, so drizzle-kit never emits its DDL — neither the per-package relationships migration source nor `drizzle-kit push` materialises it. A schema-derived operator DB therefore lacked the view, and every relationships read that hydrates contact points failed with Postgres `42P01`: list people degraded to un-hydrated rows, while get/create/update person 500'd.

  - The view is now created by the deployment migration source (it spans the relationships `people` and identity `identity_contact_points` tables, so — like the cross-module link tables — it ships in the deployment folder the collector applies last, after both owning packages' tables exist).
  - Defense-in-depth: the by-id read path (and CSV export) now degrade to base rows on hydration failure, matching the list path, instead of 500ing.
  - `updatePerson` no longer backfills omitted identity fields from the hydrated read before syncing — a partial PATCH that omits email/phone/website now leaves those contact points untouched instead of deleting them when the directory read has degraded. `syncPersonIdentity` treats an omitted (`undefined`) field as "leave unchanged"; only an explicit null/empty value clears it.
  - Fixed the stale schema comment that pointed at the wrong migration.

## 0.120.7

### Patch Changes

- @voyant-travel/identity@0.129.0

## 0.120.6

### Patch Changes

- @voyant-travel/identity@0.128.0

## 0.120.5

### Patch Changes

- @voyant-travel/identity@0.127.0

## 0.120.4

### Patch Changes

- 1841ce2: D.2 slice 1 (batch 2) — 14 more packages own + ship their migration history (db, relationships, quotes, identity, distribution, inventory, commerce, catalog, finance, notifications, legal, storefront, charters, cruises). Each baseline reproduces the framework bundle's tables column-for-column, and all package sources now apply together (fresh-D.2 union) without collision.

  Shared enums: the codebase inlines copies of some enums to avoid cross-package schema imports (e.g. `service_type` in distribution + inventory, `entity_type` in relationships + quotes). Per-package generation would emit duplicate `CREATE TYPE`, colliding on a fresh D.2 database. All package migrations now wrap `CREATE TYPE … AS ENUM(…)` in an idempotent `DO`-block guard (subset-safe; whichever source applies first creates the type, the rest no-op). The db package additionally owns the shared Postgres extensions (pg_trgm / unaccent) that downstream trigram indexes need on a fresh D.2 database (the retired bundle injected them; per-package sources did not). The batch-1 packages (operator-settings, action-ledger, workflow-runs, trips) get the same guard for uniformity. No runtime change. See `docs/architecture/migration-collector-d2.md`.

- Updated dependencies [1841ce2]
  - @voyant-travel/db@0.108.4
  - @voyant-travel/identity@0.126.1
  - @voyant-travel/action-ledger@0.105.3

## 0.120.3

### Patch Changes

- @voyant-travel/identity@0.126.0

## 0.120.2

### Patch Changes

- @voyant-travel/db@0.108.3
- @voyant-travel/relationships-contracts@0.108.1
- @voyant-travel/identity@0.125.0
- @voyant-travel/hono@0.112.2

## 0.120.1

### Patch Changes

- @voyant-travel/hono@0.112.1
- @voyant-travel/identity@0.124.0

## 0.120.0

### Minor Changes

- 170388e: Custom-fields unification (phase 4b — export consumption). The people CSV export now surfaces custom fields: `exportPeopleCsv` appends a column per **export-visible** custom field (`customFieldsVisibleIn(registry, "person", "export")`, resolved per-request from the route runtime), with the field label as the header and the stored value as the cell (objects/arrays as JSON). This is the visibility payoff of the unified registry — a field declared `visibility.export` shows up in the export by construction, unlike the old side-table values that readers couldn't see. Invoice + search follow the same `customFieldsVisibleIn` pattern in their packages.
- 9c3fe53: Custom-fields unification (phase 2 — person/organization adopt the `custom_fields` column). Both `people` and `organizations` gain a `custom_fields jsonb default '{}'` column (framework bundle migration `0002`), and their create/update routes validate `customFields` at the write boundary against the resolved registry (code ∪ runtime `custom_field_definitions`):

  - `relationships`: `RelationshipsRouteRuntime(+Options).customFields` resolver; a `validateRelationshipsCustomFields(c, entity, data)` helper on the accounts route (its `Env` now exposes `container`); person/org writes persist the cleaned value.
  - `relationships-contracts`: `customFields` added to the person/organization core schemas.
  - `framework`: the relationships factory moves Tier 1 → 2 to receive `capabilities.customFields`.

  Values now live on the entity row for `booking`, `person`, and `organization`. Still ahead: repoint the EAV value API to the column + backfill `custom_field_values` → jsonb, then retire the side table. Oracle-verified (bundle + links == live schema).

- d29dd47: Custom-fields unification (phase 3a — `custom_fields` column on quote + activity). `activities` (relationships) and `quotes` gain a `custom_fields jsonb default '{}'` column (framework bundle migration `0003`), completing entity coverage for all four EAV entity types (person, organization, quote, activity) ahead of repointing the value API to the column. Additive — no behavior change yet. Oracle-verified.
- ce2a568: Custom-fields unification (phase 4a — retire `custom_field_values`). The EAV value side table is removed; values live solely on each entity's `custom_fields` jsonb column.

  - The table + its types/relations are dropped from the schema; the person/org merge flow now merges `custom_fields` (keeper wins) instead of value rows.
  - A **guarded** retirement migration (framework bundle `0004`) drops the table but **RAISES if it still has rows**, so a deployment that hasn't run the backfill fails the migration loudly instead of losing data. The backfill script gains `--clear` to copy values into the columns and then empty the table.

  **Upgrade order:** `tsx scripts/backfill-custom-fields.ts --clear` (copies + empties), then `voyant db migrate` (the guarded drop). Verified: guard refuses with rows, drops when empty; oracle balances.

- 3aa90b4: Custom-fields unification (search consumption). The people search now matches **search-visible** custom fields: `listPeople`/`buildPersonSearchCondition` accept the search-visible field set (`customFieldsVisibleIn(registry, "person", "search")`, resolved per-request from the route runtime) and OR a `custom_fields ->> key ILIKE term` condition per field into the query. So a custom field declared `visibility.search` becomes findable in the people search — the search payoff of the unified registry. Mirrors the export consumption; invoice follows the same pattern in finance.
- 39d48fe: Custom-fields unification (phase 1b — DB-backed definitions + per-request resolver). The custom-field registry is now resolved per request from two sources, so runtime-defined fields participate alongside code-declared ones (ADR: `docs/architecture/custom-fields-unification-adr.md`):

  - `core`: new `CustomFieldRegistryResolver = (db) => CustomFieldRegistry | Promise<…>` type.
  - `relationships`: `loadCustomFieldDefinitions(db)` reads the runtime `custom_field_definitions` table and maps it to registry definitions (`varchar`→`text`, `double`→`number`, `enum`→`select`, `set`→`multiselect`, `address`/`phone`→`json`; `isSearchable`→`visibility.search`).
  - `bookings`: the `customFields` route-runtime option is now a resolver; the write-validation helper resolves the registry from the request `db` (so it sees both code- and DB-defined fields). The operator wires a resolver that merges its code-declared fields with `loadCustomFieldDefinitions(db)` (code wins), cached per isolate.

  No storage change yet — values still go to the entity `custom_fields` jsonb (booking) / the EAV table (person/org). Subsequent phases add the person/org column, repoint the value API, and backfill `custom_field_values` → jsonb.

- 9616f1f: Custom-fields unification (phase 3b/3c — repoint the value API to the entity column + backfill). The runtime custom-field value API now reads/writes the entity's `custom_fields` jsonb column instead of the `custom_field_values` side table, so admin-set custom fields are visible to export/invoice/search like every other field:

  - `upsertCustomFieldValue` / `listCustomFieldValues` / `deleteCustomFieldValue` operate on the column. The admin API contract is preserved via **synthetic value-ids** (`entityType::entityId::definitionId`) and a faithful, round-trip-tested mapping between the EAV typed columns and the single jsonb value (`enum`→string, `monetary`→`{amountCents,currency}`, `set`→array, …). `phone` now maps to `text` (a string) for consistency with the entity-update path.
  - A one-time idempotent backfill (`apps/operator/scripts/backfill-custom-fields.ts`, merge-safe `backfilled || current`) moves existing `custom_field_values` rows into the columns. **Run it once during the upgrade** (after `db migrate` + deploying this), else historical custom fields stay invisible until then.

  Validated with unit round-trips + a live integration round-trip (upsert→list→delete) and a live backfill. `custom_field_values` is retired next (phase 4) once baked.

### Patch Changes

- Updated dependencies [98f4a40]
- Updated dependencies [a3bd51c]
- Updated dependencies [9c3fe53]
- Updated dependencies [3b27dcc]
- Updated dependencies [39d48fe]
- Updated dependencies [d222e9f]
  - @voyant-travel/core@0.110.0
  - @voyant-travel/hono@0.112.0
  - @voyant-travel/relationships-contracts@0.108.0
  - @voyant-travel/action-ledger@0.105.1
  - @voyant-travel/db@0.108.2
  - @voyant-travel/identity@0.123.0

## 0.119.5

### Patch Changes

- @voyant-travel/identity@0.122.0

## 0.119.4

### Patch Changes

- Updated dependencies [13fe70b]
- Updated dependencies [9ea7220]
  - @voyant-travel/action-ledger@0.105.0
  - @voyant-travel/hono@0.111.0
  - @voyant-travel/identity@0.121.0

## 0.119.3

### Patch Changes

- c8189fc: Split the legacy `@voyant-travel/crm-contracts` package into
  `@voyant-travel/relationships-contracts` and
  `@voyant-travel/quotes-contracts`. Runtime packages and public validation
  imports now depend on the domain-specific contract packages.
- Updated dependencies [6bff46f]
- Updated dependencies [c8189fc]
  - @voyant-travel/hono@0.110.0
  - @voyant-travel/relationships-contracts@0.107.0
  - @voyant-travel/action-ledger@0.104.11
  - @voyant-travel/identity@0.120.0

## 0.119.2

### Patch Changes

- db9c5cd: Split oversized CRM account tests, contract validation, React detail surfaces, and locale dictionaries into smaller internal modules while preserving existing public exports and behavior.
- Updated dependencies [db9c5cd]
  - @voyant-travel/crm-contracts@0.106.1

## 0.119.1

### Patch Changes

- Updated dependencies [f25e790]
  - @voyant-travel/db@0.108.0
  - @voyant-travel/action-ledger@0.104.9
  - @voyant-travel/hono@0.109.1
  - @voyant-travel/identity@0.119.1

## 0.119.0

### Patch Changes

- Updated dependencies [b0f1e21]
- Updated dependencies [b0f1e21]
  - @voyant-travel/hono@0.109.0
  - @voyant-travel/utils@0.105.0
  - @voyant-travel/action-ledger@0.104.8
  - @voyant-travel/identity@0.119.0

## 0.118.0

### Patch Changes

- @voyant-travel/identity@0.118.0

## 0.117.1

### Patch Changes

- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
  - @voyant-travel/core@0.109.0
  - @voyant-travel/db@0.107.0
  - @voyant-travel/hono@0.108.0
  - @voyant-travel/action-ledger@0.104.7
  - @voyant-travel/identity@0.117.1

## 0.117.0

### Patch Changes

- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
  - @voyant-travel/core@0.108.0
  - @voyant-travel/db@0.106.0
  - @voyant-travel/hono@0.107.0
  - @voyant-travel/action-ledger@0.104.6
  - @voyant-travel/identity@0.117.0

## 0.116.0

### Patch Changes

- Updated dependencies [418fa82]
- Updated dependencies [418fa82]
- Updated dependencies [418fa82]
  - @voyant-travel/core@0.107.0
  - @voyant-travel/db@0.105.0
  - @voyant-travel/hono@0.106.0
  - @voyant-travel/action-ledger@0.104.5
  - @voyant-travel/identity@0.116.0

## 0.115.0

### Patch Changes

- @voyant-travel/identity@0.115.0

## 0.114.0

### Patch Changes

- @voyant-travel/identity@0.114.0

## 0.113.0

### Patch Changes

- @voyant-travel/identity@0.113.0

## 0.112.0

### Patch Changes

- @voyant-travel/identity@0.112.0

## 0.111.0

### Patch Changes

- @voyant-travel/identity@0.111.0

## 0.110.0

### Patch Changes

- Updated dependencies [eeb23df]
  - @voyant-travel/core@0.106.0
  - @voyant-travel/action-ledger@0.104.4
  - @voyant-travel/db@0.104.4
  - @voyant-travel/hono@0.105.3
  - @voyant-travel/identity@0.110.0

## 0.109.0

### Patch Changes

- Updated dependencies [344e7b6]
  - @voyant-travel/core@0.105.1
  - @voyant-travel/identity@0.109.0
  - @voyant-travel/hono@0.105.2

## 0.108.0

### Patch Changes

- @voyant-travel/identity@0.108.0

## 0.107.1

### Patch Changes

- Updated dependencies [656b25d]
  - @voyant-travel/hono@0.105.0
  - @voyant-travel/action-ledger@0.104.3
  - @voyant-travel/identity@0.107.1

## 0.107.0

### Minor Changes

- d1ad572: Rename CRM sales artifacts from Opportunities to Quotes, split Quote Versions into their own schema/API surface, and update the corresponding TypeID prefixes.
- d1ad572: Add Quote Version send, view, decline, and expiry lifecycle APIs with a public proposal read model.
- d1ad572: Rename cross-package Quote reference fields so `quoteId` points at the CRM deal and `quoteVersionId` points at the versioned proposal snapshot.
- d1ad572: Add Quote Version accept lifecycle contracts and CRM state transition for accepted proposal versions.
- d1ad572: Add composer-owned Trip snapshot freezing and read APIs for Quote Version proposal snapshots.

### Patch Changes

- Updated dependencies [d1ad572]
- Updated dependencies [d1ad572]
- Updated dependencies [c2aef18]
- Updated dependencies [d1ad572]
- Updated dependencies [d1ad572]
  - @voyant-travel/crm-contracts@0.106.0
  - @voyant-travel/core@0.105.0
  - @voyant-travel/db@0.104.3
  - @voyant-travel/action-ledger@0.104.2
  - @voyant-travel/hono@0.104.2
  - @voyant-travel/identity@0.107.0

## 0.106.1

### Patch Changes

- a0ddf5e: Keep CRM people list responses available when identity hydration fails by returning base people rows with empty inline identity fields.

## 0.106.0

### Minor Changes

- 6949669: Add CRM people and organization merge contracts, routes, React mutations, and detail-page UI actions.

### Patch Changes

- Updated dependencies [6949669]
  - @voyant-travel/crm-contracts@0.105.0
  - @voyant-travel/identity@0.106.0

## 0.105.1

### Patch Changes

- e096b99: Make CRM people search tokenize whitespace-separated names and compare unaccented person fields so family-first names and diacritic variants match.
- Updated dependencies [e096b99]
  - @voyant-travel/db@0.104.2

## 0.105.0

### Patch Changes

- @voyant-travel/identity@0.105.0

## 0.104.2

## 0.104.1

### Patch Changes

- @voyant-travel/action-ledger@0.104.1
- @voyant-travel/core@0.104.1
- @voyant-travel/crm-contracts@0.104.1
- @voyant-travel/db@0.104.1
- @voyant-travel/hono@0.104.1
- @voyant-travel/identity@0.104.1
- @voyant-travel/utils@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/action-ledger@0.104.0
- @voyant-travel/core@0.104.0
- @voyant-travel/crm-contracts@0.104.0
- @voyant-travel/db@0.104.0
- @voyant-travel/hono@0.104.0
- @voyant-travel/identity@0.104.0
- @voyant-travel/utils@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/action-ledger@0.103.0
- @voyant-travel/core@0.103.0
- @voyant-travel/crm-contracts@0.103.0
- @voyant-travel/db@0.103.0
- @voyant-travel/hono@0.103.0
- @voyant-travel/identity@0.103.0
- @voyant-travel/utils@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/action-ledger@0.102.0
- @voyant-travel/core@0.102.0
- @voyant-travel/crm-contracts@0.102.0
- @voyant-travel/db@0.102.0
- @voyant-travel/hono@0.102.0
- @voyant-travel/identity@0.102.0
- @voyant-travel/utils@0.102.0

## 0.101.2

### Patch Changes

- @voyant-travel/action-ledger@0.101.2
- @voyant-travel/core@0.101.2
- @voyant-travel/crm-contracts@0.101.2
- @voyant-travel/db@0.101.2
- @voyant-travel/hono@0.101.2
- @voyant-travel/identity@0.101.2
- @voyant-travel/utils@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/action-ledger@0.101.1
- @voyant-travel/core@0.101.1
- @voyant-travel/crm-contracts@0.101.1
- @voyant-travel/db@0.101.1
- @voyant-travel/hono@0.101.1
- @voyant-travel/identity@0.101.1
- @voyant-travel/utils@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/action-ledger@0.101.0
- @voyant-travel/core@0.101.0
- @voyant-travel/crm-contracts@0.101.0
- @voyant-travel/db@0.101.0
- @voyant-travel/hono@0.101.0
- @voyant-travel/identity@0.101.0
- @voyant-travel/utils@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/action-ledger@0.100.0
- @voyant-travel/core@0.100.0
- @voyant-travel/crm-contracts@0.100.0
- @voyant-travel/db@0.100.0
- @voyant-travel/hono@0.100.0
- @voyant-travel/identity@0.100.0
- @voyant-travel/utils@0.100.0

## 0.99.0

### Patch Changes

- Updated dependencies [b7dde79]
  - @voyant-travel/action-ledger@0.99.0
  - @voyant-travel/core@0.99.0
  - @voyant-travel/crm-contracts@0.99.0
  - @voyant-travel/db@0.99.0
  - @voyant-travel/hono@0.99.0
  - @voyant-travel/identity@0.99.0
  - @voyant-travel/utils@0.99.0

## 0.98.0

### Patch Changes

- Updated dependencies [485da95]
  - @voyant-travel/action-ledger@0.98.0
  - @voyant-travel/core@0.98.0
  - @voyant-travel/crm-contracts@0.98.0
  - @voyant-travel/db@0.98.0
  - @voyant-travel/hono@0.98.0
  - @voyant-travel/identity@0.98.0
  - @voyant-travel/utils@0.98.0

## 0.97.0

### Patch Changes

- Updated dependencies [7094c8e]
  - @voyant-travel/action-ledger@0.97.0
  - @voyant-travel/core@0.97.0
  - @voyant-travel/crm-contracts@0.97.0
  - @voyant-travel/db@0.97.0
  - @voyant-travel/hono@0.97.0
  - @voyant-travel/identity@0.97.0
  - @voyant-travel/utils@0.97.0

## 0.96.0

### Patch Changes

- @voyant-travel/action-ledger@0.96.0
- @voyant-travel/core@0.96.0
- @voyant-travel/db@0.96.0
- @voyant-travel/hono@0.96.0
- @voyant-travel/identity@0.96.0
- @voyant-travel/utils@0.96.0

## 0.95.0

### Patch Changes

- @voyant-travel/action-ledger@0.95.0
- @voyant-travel/core@0.95.0
- @voyant-travel/db@0.95.0
- @voyant-travel/hono@0.95.0
- @voyant-travel/identity@0.95.0
- @voyant-travel/utils@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/action-ledger@0.94.0
- @voyant-travel/core@0.94.0
- @voyant-travel/db@0.94.0
- @voyant-travel/hono@0.94.0
- @voyant-travel/identity@0.94.0
- @voyant-travel/utils@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/action-ledger@0.93.0
- @voyant-travel/core@0.93.0
- @voyant-travel/db@0.93.0
- @voyant-travel/hono@0.93.0
- @voyant-travel/identity@0.93.0
- @voyant-travel/utils@0.93.0

## 0.92.0

### Patch Changes

- @voyant-travel/action-ledger@0.92.0
- @voyant-travel/core@0.92.0
- @voyant-travel/db@0.92.0
- @voyant-travel/hono@0.92.0
- @voyant-travel/identity@0.92.0
- @voyant-travel/utils@0.92.0

## 0.91.0

### Patch Changes

- Updated dependencies [dc8554b]
  - @voyant-travel/action-ledger@0.91.0
  - @voyant-travel/core@0.91.0
  - @voyant-travel/db@0.91.0
  - @voyant-travel/hono@0.91.0
  - @voyant-travel/identity@0.91.0
  - @voyant-travel/utils@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/action-ledger@0.90.0
- @voyant-travel/core@0.90.0
- @voyant-travel/db@0.90.0
- @voyant-travel/hono@0.90.0
- @voyant-travel/identity@0.90.0
- @voyant-travel/utils@0.90.0

## 0.89.0

### Minor Changes

- ed45995: Rename CRM organization `vatNumber` to `taxId` and support exact organization lookup by tax id.

### Patch Changes

- @voyant-travel/action-ledger@0.89.0
- @voyant-travel/core@0.89.0
- @voyant-travel/db@0.89.0
- @voyant-travel/hono@0.89.0
- @voyant-travel/identity@0.89.0
- @voyant-travel/utils@0.89.0

## 0.88.0

### Patch Changes

- @voyant-travel/action-ledger@0.88.0
- @voyant-travel/core@0.88.0
- @voyant-travel/db@0.88.0
- @voyant-travel/hono@0.88.0
- @voyant-travel/identity@0.88.0
- @voyant-travel/utils@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/action-ledger@0.87.1
- @voyant-travel/core@0.87.1
- @voyant-travel/db@0.87.1
- @voyant-travel/hono@0.87.1
- @voyant-travel/identity@0.87.1
- @voyant-travel/utils@0.87.1

## 0.87.0

### Patch Changes

- @voyant-travel/action-ledger@0.87.0
- @voyant-travel/core@0.87.0
- @voyant-travel/db@0.87.0
- @voyant-travel/hono@0.87.0
- @voyant-travel/identity@0.87.0
- @voyant-travel/utils@0.87.0

## 0.86.0

### Patch Changes

- @voyant-travel/action-ledger@0.86.0
- @voyant-travel/core@0.86.0
- @voyant-travel/db@0.86.0
- @voyant-travel/hono@0.86.0
- @voyant-travel/identity@0.86.0
- @voyant-travel/utils@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/action-ledger@0.85.4
- @voyant-travel/core@0.85.4
- @voyant-travel/db@0.85.4
- @voyant-travel/hono@0.85.4
- @voyant-travel/identity@0.85.4
- @voyant-travel/utils@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/action-ledger@0.85.3
- @voyant-travel/core@0.85.3
- @voyant-travel/db@0.85.3
- @voyant-travel/hono@0.85.3
- @voyant-travel/identity@0.85.3
- @voyant-travel/utils@0.85.3

## 0.85.2

### Patch Changes

- 2aac1f9: Prevent public booking session state saves from repeatedly resolving position-matched traveler people, and add a CRM option to skip creating people for name-only contact snapshots.
  - @voyant-travel/action-ledger@0.85.2
  - @voyant-travel/core@0.85.2
  - @voyant-travel/db@0.85.2
  - @voyant-travel/hono@0.85.2
  - @voyant-travel/identity@0.85.2
  - @voyant-travel/utils@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/action-ledger@0.85.1
- @voyant-travel/core@0.85.1
- @voyant-travel/db@0.85.1
- @voyant-travel/hono@0.85.1
- @voyant-travel/identity@0.85.1
- @voyant-travel/utils@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/action-ledger@0.85.0
- @voyant-travel/core@0.85.0
- @voyant-travel/db@0.85.0
- @voyant-travel/hono@0.85.0
- @voyant-travel/identity@0.85.0
- @voyant-travel/utils@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/action-ledger@0.84.4
- @voyant-travel/core@0.84.4
- @voyant-travel/db@0.84.4
- @voyant-travel/hono@0.84.4
- @voyant-travel/identity@0.84.4
- @voyant-travel/utils@0.84.4

## 0.84.3

### Patch Changes

- @voyant-travel/action-ledger@0.84.3
- @voyant-travel/core@0.84.3
- @voyant-travel/db@0.84.3
- @voyant-travel/hono@0.84.3
- @voyant-travel/identity@0.84.3
- @voyant-travel/utils@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/action-ledger@0.84.2
- @voyant-travel/core@0.84.2
- @voyant-travel/db@0.84.2
- @voyant-travel/hono@0.84.2
- @voyant-travel/identity@0.84.2
- @voyant-travel/utils@0.84.2

## 0.84.1

### Patch Changes

- Updated dependencies [b9ef614]
  - @voyant-travel/action-ledger@0.84.1
  - @voyant-travel/core@0.84.1
  - @voyant-travel/db@0.84.1
  - @voyant-travel/hono@0.84.1
  - @voyant-travel/identity@0.84.1
  - @voyant-travel/utils@0.84.1

## 0.84.0

### Patch Changes

- Updated dependencies [4ea42b3]
  - @voyant-travel/action-ledger@0.84.0
  - @voyant-travel/core@0.84.0
  - @voyant-travel/db@0.84.0
  - @voyant-travel/hono@0.84.0
  - @voyant-travel/identity@0.84.0
  - @voyant-travel/utils@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/action-ledger@0.83.1
- @voyant-travel/core@0.83.1
- @voyant-travel/db@0.83.1
- @voyant-travel/hono@0.83.1
- @voyant-travel/identity@0.83.1
- @voyant-travel/utils@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/action-ledger@0.83.0
- @voyant-travel/core@0.83.0
- @voyant-travel/db@0.83.0
- @voyant-travel/hono@0.83.0
- @voyant-travel/identity@0.83.0
- @voyant-travel/utils@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/action-ledger@0.82.1
- @voyant-travel/core@0.82.1
- @voyant-travel/db@0.82.1
- @voyant-travel/hono@0.82.1
- @voyant-travel/identity@0.82.1
- @voyant-travel/utils@0.82.1

## 0.82.0

### Patch Changes

- @voyant-travel/action-ledger@0.82.0
- @voyant-travel/core@0.82.0
- @voyant-travel/db@0.82.0
- @voyant-travel/hono@0.82.0
- @voyant-travel/identity@0.82.0
- @voyant-travel/utils@0.82.0

## 0.81.21

### Patch Changes

- @voyant-travel/action-ledger@0.81.21
- @voyant-travel/core@0.81.21
- @voyant-travel/db@0.81.21
- @voyant-travel/hono@0.81.21
- @voyant-travel/identity@0.81.21
- @voyant-travel/utils@0.81.21

## 0.81.20

### Patch Changes

- @voyant-travel/action-ledger@0.81.20
- @voyant-travel/core@0.81.20
- @voyant-travel/db@0.81.20
- @voyant-travel/hono@0.81.20
- @voyant-travel/identity@0.81.20
- @voyant-travel/utils@0.81.20

## 0.81.19

### Patch Changes

- @voyant-travel/action-ledger@0.81.19
- @voyant-travel/core@0.81.19
- @voyant-travel/db@0.81.19
- @voyant-travel/hono@0.81.19
- @voyant-travel/identity@0.81.19
- @voyant-travel/utils@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/action-ledger@0.81.18
- @voyant-travel/core@0.81.18
- @voyant-travel/db@0.81.18
- @voyant-travel/hono@0.81.18
- @voyant-travel/identity@0.81.18
- @voyant-travel/utils@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/action-ledger@0.81.17
- @voyant-travel/core@0.81.17
- @voyant-travel/db@0.81.17
- @voyant-travel/hono@0.81.17
- @voyant-travel/identity@0.81.17
- @voyant-travel/utils@0.81.17

## 0.81.16

### Patch Changes

- @voyant-travel/action-ledger@0.81.16
- @voyant-travel/core@0.81.16
- @voyant-travel/db@0.81.16
- @voyant-travel/hono@0.81.16
- @voyant-travel/identity@0.81.16
- @voyant-travel/utils@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/action-ledger@0.81.15
- @voyant-travel/core@0.81.15
- @voyant-travel/db@0.81.15
- @voyant-travel/hono@0.81.15
- @voyant-travel/identity@0.81.15
- @voyant-travel/utils@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/action-ledger@0.81.14
- @voyant-travel/core@0.81.14
- @voyant-travel/db@0.81.14
- @voyant-travel/hono@0.81.14
- @voyant-travel/identity@0.81.14
- @voyant-travel/utils@0.81.14

## 0.81.13

### Patch Changes

- @voyant-travel/action-ledger@0.81.13
- @voyant-travel/core@0.81.13
- @voyant-travel/db@0.81.13
- @voyant-travel/hono@0.81.13
- @voyant-travel/identity@0.81.13
- @voyant-travel/utils@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/action-ledger@0.81.12
- @voyant-travel/core@0.81.12
- @voyant-travel/db@0.81.12
- @voyant-travel/hono@0.81.12
- @voyant-travel/identity@0.81.12
- @voyant-travel/utils@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/action-ledger@0.81.11
- @voyant-travel/core@0.81.11
- @voyant-travel/db@0.81.11
- @voyant-travel/hono@0.81.11
- @voyant-travel/identity@0.81.11
- @voyant-travel/utils@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/action-ledger@0.81.10
- @voyant-travel/core@0.81.10
- @voyant-travel/db@0.81.10
- @voyant-travel/hono@0.81.10
- @voyant-travel/identity@0.81.10
- @voyant-travel/utils@0.81.10

## 0.81.9

### Patch Changes

- @voyant-travel/action-ledger@0.81.9
- @voyant-travel/core@0.81.9
- @voyant-travel/db@0.81.9
- @voyant-travel/hono@0.81.9
- @voyant-travel/identity@0.81.9
- @voyant-travel/utils@0.81.9

## 0.81.8

### Patch Changes

- 688ac4f: Generalize booking traveler identity snapshots from passport-only fields to typed identity documents.
  - @voyant-travel/action-ledger@0.81.8
  - @voyant-travel/core@0.81.8
  - @voyant-travel/db@0.81.8
  - @voyant-travel/hono@0.81.8
  - @voyant-travel/identity@0.81.8
  - @voyant-travel/utils@0.81.8

## 0.81.7

### Patch Changes

- @voyant-travel/action-ledger@0.81.7
- @voyant-travel/core@0.81.7
- @voyant-travel/db@0.81.7
- @voyant-travel/hono@0.81.7
- @voyant-travel/identity@0.81.7
- @voyant-travel/utils@0.81.7

## 0.81.6

### Patch Changes

- f92c593: Include person email and phone contact points in CRM people search, with phone digit matching tolerant of formatting differences.
  - @voyant-travel/action-ledger@0.81.6
  - @voyant-travel/core@0.81.6
  - @voyant-travel/db@0.81.6
  - @voyant-travel/hono@0.81.6
  - @voyant-travel/identity@0.81.6
  - @voyant-travel/utils@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/action-ledger@0.81.5
- @voyant-travel/core@0.81.5
- @voyant-travel/db@0.81.5
- @voyant-travel/hono@0.81.5
- @voyant-travel/identity@0.81.5
- @voyant-travel/utils@0.81.5

## 0.81.4

### Patch Changes

- @voyant-travel/action-ledger@0.81.4
- @voyant-travel/core@0.81.4
- @voyant-travel/db@0.81.4
- @voyant-travel/hono@0.81.4
- @voyant-travel/identity@0.81.4
- @voyant-travel/utils@0.81.4

## 0.81.3

### Patch Changes

- @voyant-travel/action-ledger@0.81.3
- @voyant-travel/core@0.81.3
- @voyant-travel/db@0.81.3
- @voyant-travel/hono@0.81.3
- @voyant-travel/identity@0.81.3
- @voyant-travel/utils@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/action-ledger@0.81.2
- @voyant-travel/core@0.81.2
- @voyant-travel/db@0.81.2
- @voyant-travel/hono@0.81.2
- @voyant-travel/identity@0.81.2
- @voyant-travel/utils@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/action-ledger@0.81.1
- @voyant-travel/core@0.81.1
- @voyant-travel/db@0.81.1
- @voyant-travel/hono@0.81.1
- @voyant-travel/identity@0.81.1
- @voyant-travel/utils@0.81.1

## 0.81.0

### Patch Changes

- @voyant-travel/action-ledger@0.81.0
- @voyant-travel/core@0.81.0
- @voyant-travel/db@0.81.0
- @voyant-travel/hono@0.81.0
- @voyant-travel/identity@0.81.0
- @voyant-travel/utils@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/action-ledger@0.80.18
- @voyant-travel/core@0.80.18
- @voyant-travel/db@0.80.18
- @voyant-travel/hono@0.80.18
- @voyant-travel/identity@0.80.18
- @voyant-travel/utils@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/action-ledger@0.80.17
- @voyant-travel/core@0.80.17
- @voyant-travel/db@0.80.17
- @voyant-travel/hono@0.80.17
- @voyant-travel/identity@0.80.17
- @voyant-travel/utils@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/action-ledger@0.80.16
- @voyant-travel/core@0.80.16
- @voyant-travel/db@0.80.16
- @voyant-travel/hono@0.80.16
- @voyant-travel/identity@0.80.16
- @voyant-travel/utils@0.80.16

## 0.80.15

### Patch Changes

- @voyant-travel/action-ledger@0.80.15
- @voyant-travel/core@0.80.15
- @voyant-travel/db@0.80.15
- @voyant-travel/hono@0.80.15
- @voyant-travel/identity@0.80.15
- @voyant-travel/utils@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/action-ledger@0.80.14
- @voyant-travel/core@0.80.14
- @voyant-travel/db@0.80.14
- @voyant-travel/hono@0.80.14
- @voyant-travel/identity@0.80.14
- @voyant-travel/utils@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/action-ledger@0.80.13
- @voyant-travel/core@0.80.13
- @voyant-travel/db@0.80.13
- @voyant-travel/hono@0.80.13
- @voyant-travel/identity@0.80.13
- @voyant-travel/utils@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/action-ledger@0.80.12
- @voyant-travel/core@0.80.12
- @voyant-travel/db@0.80.12
- @voyant-travel/hono@0.80.12
- @voyant-travel/identity@0.80.12
- @voyant-travel/utils@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/action-ledger@0.80.11
- @voyant-travel/core@0.80.11
- @voyant-travel/db@0.80.11
- @voyant-travel/hono@0.80.11
- @voyant-travel/identity@0.80.11
- @voyant-travel/utils@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/action-ledger@0.80.10
- @voyant-travel/core@0.80.10
- @voyant-travel/db@0.80.10
- @voyant-travel/hono@0.80.10
- @voyant-travel/identity@0.80.10
- @voyant-travel/utils@0.80.10

## 0.80.9

### Patch Changes

- @voyant-travel/action-ledger@0.80.9
- @voyant-travel/core@0.80.9
- @voyant-travel/db@0.80.9
- @voyant-travel/hono@0.80.9
- @voyant-travel/identity@0.80.9
- @voyant-travel/utils@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/action-ledger@0.80.8
- @voyant-travel/core@0.80.8
- @voyant-travel/db@0.80.8
- @voyant-travel/hono@0.80.8
- @voyant-travel/identity@0.80.8
- @voyant-travel/utils@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/action-ledger@0.80.7
- @voyant-travel/core@0.80.7
- @voyant-travel/db@0.80.7
- @voyant-travel/hono@0.80.7
- @voyant-travel/identity@0.80.7
- @voyant-travel/utils@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/action-ledger@0.80.6
- @voyant-travel/core@0.80.6
- @voyant-travel/db@0.80.6
- @voyant-travel/hono@0.80.6
- @voyant-travel/identity@0.80.6
- @voyant-travel/utils@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/action-ledger@0.80.5
- @voyant-travel/core@0.80.5
- @voyant-travel/db@0.80.5
- @voyant-travel/hono@0.80.5
- @voyant-travel/identity@0.80.5
- @voyant-travel/utils@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/action-ledger@0.80.4
- @voyant-travel/core@0.80.4
- @voyant-travel/db@0.80.4
- @voyant-travel/hono@0.80.4
- @voyant-travel/identity@0.80.4
- @voyant-travel/utils@0.80.4

## 0.80.3

### Patch Changes

- 6d816bb: Add `Idempotency-Key` replay support to admin create routes for CRM people and organizations, finance invoices, and legal contracts.
- Updated dependencies [6d816bb]
  - @voyant-travel/action-ledger@0.80.3
  - @voyant-travel/core@0.80.3
  - @voyant-travel/db@0.80.3
  - @voyant-travel/hono@0.80.3
  - @voyant-travel/identity@0.80.3
  - @voyant-travel/utils@0.80.3

## 0.80.2

### Patch Changes

- @voyant-travel/action-ledger@0.80.2
- @voyant-travel/core@0.80.2
- @voyant-travel/db@0.80.2
- @voyant-travel/hono@0.80.2
- @voyant-travel/identity@0.80.2
- @voyant-travel/utils@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/action-ledger@0.80.1
- @voyant-travel/core@0.80.1
- @voyant-travel/db@0.80.1
- @voyant-travel/hono@0.80.1
- @voyant-travel/identity@0.80.1
- @voyant-travel/utils@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/action-ledger@0.80.0
- @voyant-travel/core@0.80.0
- @voyant-travel/db@0.80.0
- @voyant-travel/hono@0.80.0
- @voyant-travel/identity@0.80.0
- @voyant-travel/utils@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/action-ledger@0.79.0
- @voyant-travel/core@0.79.0
- @voyant-travel/db@0.79.0
- @voyant-travel/hono@0.79.0
- @voyant-travel/identity@0.79.0
- @voyant-travel/utils@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/action-ledger@0.78.0
- @voyant-travel/core@0.78.0
- @voyant-travel/db@0.78.0
- @voyant-travel/hono@0.78.0
- @voyant-travel/identity@0.78.0
- @voyant-travel/utils@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/action-ledger@0.77.13
- @voyant-travel/core@0.77.13
- @voyant-travel/db@0.77.13
- @voyant-travel/hono@0.77.13
- @voyant-travel/identity@0.77.13
- @voyant-travel/utils@0.77.13

## 0.77.12

### Patch Changes

- @voyant-travel/action-ledger@0.77.12
- @voyant-travel/core@0.77.12
- @voyant-travel/db@0.77.12
- @voyant-travel/hono@0.77.12
- @voyant-travel/identity@0.77.12
- @voyant-travel/utils@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/action-ledger@0.77.11
- @voyant-travel/core@0.77.11
- @voyant-travel/db@0.77.11
- @voyant-travel/hono@0.77.11
- @voyant-travel/identity@0.77.11
- @voyant-travel/utils@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/action-ledger@0.77.10
- @voyant-travel/core@0.77.10
- @voyant-travel/db@0.77.10
- @voyant-travel/hono@0.77.10
- @voyant-travel/identity@0.77.10
- @voyant-travel/utils@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/action-ledger@0.77.9
- @voyant-travel/core@0.77.9
- @voyant-travel/db@0.77.9
- @voyant-travel/hono@0.77.9
- @voyant-travel/identity@0.77.9
- @voyant-travel/utils@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/action-ledger@0.77.8
- @voyant-travel/core@0.77.8
- @voyant-travel/db@0.77.8
- @voyant-travel/hono@0.77.8
- @voyant-travel/identity@0.77.8
- @voyant-travel/utils@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/action-ledger@0.77.7
- @voyant-travel/core@0.77.7
- @voyant-travel/db@0.77.7
- @voyant-travel/hono@0.77.7
- @voyant-travel/identity@0.77.7
- @voyant-travel/utils@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/action-ledger@0.77.6
- @voyant-travel/core@0.77.6
- @voyant-travel/db@0.77.6
- @voyant-travel/hono@0.77.6
- @voyant-travel/identity@0.77.6
- @voyant-travel/utils@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/action-ledger@0.77.5
- @voyant-travel/core@0.77.5
- @voyant-travel/db@0.77.5
- @voyant-travel/hono@0.77.5
- @voyant-travel/identity@0.77.5
- @voyant-travel/utils@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/action-ledger@0.77.4
- @voyant-travel/core@0.77.4
- @voyant-travel/db@0.77.4
- @voyant-travel/hono@0.77.4
- @voyant-travel/identity@0.77.4
- @voyant-travel/utils@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/action-ledger@0.77.3
- @voyant-travel/core@0.77.3
- @voyant-travel/db@0.77.3
- @voyant-travel/hono@0.77.3
- @voyant-travel/identity@0.77.3
- @voyant-travel/utils@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/action-ledger@0.77.2
- @voyant-travel/core@0.77.2
- @voyant-travel/db@0.77.2
- @voyant-travel/hono@0.77.2
- @voyant-travel/identity@0.77.2
- @voyant-travel/utils@0.77.2

## 0.77.1

### Patch Changes

- @voyant-travel/action-ledger@0.77.1
- @voyant-travel/core@0.77.1
- @voyant-travel/db@0.77.1
- @voyant-travel/hono@0.77.1
- @voyant-travel/identity@0.77.1
- @voyant-travel/utils@0.77.1

## 0.77.0

### Patch Changes

- Updated dependencies [1da934d]
  - @voyant-travel/action-ledger@0.77.0
  - @voyant-travel/core@0.77.0
  - @voyant-travel/db@0.77.0
  - @voyant-travel/hono@0.77.0
  - @voyant-travel/identity@0.77.0
  - @voyant-travel/utils@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/action-ledger@0.76.0
- @voyant-travel/core@0.76.0
- @voyant-travel/db@0.76.0
- @voyant-travel/hono@0.76.0
- @voyant-travel/identity@0.76.0
- @voyant-travel/utils@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/action-ledger@0.75.7
- @voyant-travel/core@0.75.7
- @voyant-travel/db@0.75.7
- @voyant-travel/hono@0.75.7
- @voyant-travel/identity@0.75.7
- @voyant-travel/utils@0.75.7

## 0.75.6

### Patch Changes

- 347fbd2: Allow CRM person validation to treat an empty email string as absent while still validating non-empty email values.
  - @voyant-travel/action-ledger@0.75.6
  - @voyant-travel/core@0.75.6
  - @voyant-travel/db@0.75.6
  - @voyant-travel/hono@0.75.6
  - @voyant-travel/identity@0.75.6
  - @voyant-travel/utils@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/action-ledger@0.75.5
- @voyant-travel/core@0.75.5
- @voyant-travel/db@0.75.5
- @voyant-travel/hono@0.75.5
- @voyant-travel/identity@0.75.5
- @voyant-travel/utils@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/action-ledger@0.75.4
- @voyant-travel/core@0.75.4
- @voyant-travel/db@0.75.4
- @voyant-travel/hono@0.75.4
- @voyant-travel/identity@0.75.4
- @voyant-travel/utils@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/action-ledger@0.75.3
- @voyant-travel/core@0.75.3
- @voyant-travel/db@0.75.3
- @voyant-travel/hono@0.75.3
- @voyant-travel/identity@0.75.3
- @voyant-travel/utils@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/action-ledger@0.75.2
- @voyant-travel/core@0.75.2
- @voyant-travel/db@0.75.2
- @voyant-travel/hono@0.75.2
- @voyant-travel/identity@0.75.2
- @voyant-travel/utils@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/action-ledger@0.75.1
- @voyant-travel/core@0.75.1
- @voyant-travel/db@0.75.1
- @voyant-travel/hono@0.75.1
- @voyant-travel/identity@0.75.1
- @voyant-travel/utils@0.75.1

## 0.75.0

### Patch Changes

- @voyant-travel/action-ledger@0.75.0
- @voyant-travel/core@0.75.0
- @voyant-travel/db@0.75.0
- @voyant-travel/hono@0.75.0
- @voyant-travel/identity@0.75.0
- @voyant-travel/utils@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/action-ledger@0.74.2
- @voyant-travel/core@0.74.2
- @voyant-travel/db@0.74.2
- @voyant-travel/hono@0.74.2
- @voyant-travel/identity@0.74.2
- @voyant-travel/utils@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/action-ledger@0.74.1
- @voyant-travel/core@0.74.1
- @voyant-travel/db@0.74.1
- @voyant-travel/hono@0.74.1
- @voyant-travel/identity@0.74.1
- @voyant-travel/utils@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/action-ledger@0.74.0
- @voyant-travel/core@0.74.0
- @voyant-travel/db@0.74.0
- @voyant-travel/hono@0.74.0
- @voyant-travel/identity@0.74.0
- @voyant-travel/utils@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/action-ledger@0.73.1
- @voyant-travel/core@0.73.1
- @voyant-travel/db@0.73.1
- @voyant-travel/hono@0.73.1
- @voyant-travel/identity@0.73.1
- @voyant-travel/utils@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/action-ledger@0.73.0
- @voyant-travel/core@0.73.0
- @voyant-travel/db@0.73.0
- @voyant-travel/hono@0.73.0
- @voyant-travel/identity@0.73.0
- @voyant-travel/utils@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/action-ledger@0.72.0
- @voyant-travel/core@0.72.0
- @voyant-travel/db@0.72.0
- @voyant-travel/hono@0.72.0
- @voyant-travel/identity@0.72.0
- @voyant-travel/utils@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/action-ledger@0.71.0
- @voyant-travel/core@0.71.0
- @voyant-travel/db@0.71.0
- @voyant-travel/hono@0.71.0
- @voyant-travel/identity@0.71.0
- @voyant-travel/utils@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/action-ledger@0.70.0
- @voyant-travel/core@0.70.0
- @voyant-travel/db@0.70.0
- @voyant-travel/hono@0.70.0
- @voyant-travel/identity@0.70.0
- @voyant-travel/utils@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/action-ledger@0.69.1
- @voyant-travel/core@0.69.1
- @voyant-travel/db@0.69.1
- @voyant-travel/hono@0.69.1
- @voyant-travel/identity@0.69.1
- @voyant-travel/utils@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/action-ledger@0.69.0
- @voyant-travel/core@0.69.0
- @voyant-travel/db@0.69.0
- @voyant-travel/hono@0.69.0
- @voyant-travel/identity@0.69.0
- @voyant-travel/utils@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/action-ledger@0.68.0
- @voyant-travel/core@0.68.0
- @voyant-travel/db@0.68.0
- @voyant-travel/hono@0.68.0
- @voyant-travel/identity@0.68.0
- @voyant-travel/utils@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/action-ledger@0.67.0
- @voyant-travel/core@0.67.0
- @voyant-travel/db@0.67.0
- @voyant-travel/hono@0.67.0
- @voyant-travel/identity@0.67.0
- @voyant-travel/utils@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/action-ledger@0.66.6
- @voyant-travel/core@0.66.6
- @voyant-travel/db@0.66.6
- @voyant-travel/hono@0.66.6
- @voyant-travel/identity@0.66.6
- @voyant-travel/utils@0.66.6

## 0.66.5

### Patch Changes

- @voyant-travel/action-ledger@0.66.5
- @voyant-travel/core@0.66.5
- @voyant-travel/db@0.66.5
- @voyant-travel/hono@0.66.5
- @voyant-travel/identity@0.66.5
- @voyant-travel/utils@0.66.5

## 0.66.4

### Patch Changes

- @voyant-travel/action-ledger@0.66.4
- @voyant-travel/core@0.66.4
- @voyant-travel/db@0.66.4
- @voyant-travel/hono@0.66.4
- @voyant-travel/identity@0.66.4
- @voyant-travel/utils@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/action-ledger@0.66.3
- @voyant-travel/core@0.66.3
- @voyant-travel/db@0.66.3
- @voyant-travel/hono@0.66.3
- @voyant-travel/identity@0.66.3
- @voyant-travel/utils@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/action-ledger@0.66.2
- @voyant-travel/core@0.66.2
- @voyant-travel/db@0.66.2
- @voyant-travel/hono@0.66.2
- @voyant-travel/identity@0.66.2
- @voyant-travel/utils@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/action-ledger@0.66.1
- @voyant-travel/core@0.66.1
- @voyant-travel/db@0.66.1
- @voyant-travel/hono@0.66.1
- @voyant-travel/identity@0.66.1
- @voyant-travel/utils@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/action-ledger@0.66.0
- @voyant-travel/core@0.66.0
- @voyant-travel/db@0.66.0
- @voyant-travel/hono@0.66.0
- @voyant-travel/identity@0.66.0
- @voyant-travel/utils@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/action-ledger@0.65.0
- @voyant-travel/core@0.65.0
- @voyant-travel/db@0.65.0
- @voyant-travel/hono@0.65.0
- @voyant-travel/identity@0.65.0
- @voyant-travel/utils@0.65.0

## 0.64.1

### Patch Changes

- @voyant-travel/action-ledger@0.64.1
- @voyant-travel/core@0.64.1
- @voyant-travel/db@0.64.1
- @voyant-travel/hono@0.64.1
- @voyant-travel/identity@0.64.1
- @voyant-travel/utils@0.64.1

## 0.64.0

### Patch Changes

- 6d0c8f3: Extract `withOptionalTransaction` into `@voyant-travel/db/transaction` so the soft-fallback helper that action-ledger has used since 0.62.0 can be shared by any package that needs it. Add `Module.requiresTransactionalDb` so modules whose write paths use interactive transactions declare it, and have `createApp()` assert on first request that the resolved db adapter supports `db.transaction(async (tx) => …)`. With the neon-http (edge) adapter that assertion now throws an actionable error pointing at `createServerlessDbClient` (neon-serverless / WebSocket) or `createDbClient(url, { adapter: "node" })` — instead of the cryptic "No transactions support in neon-http driver" exception thrown on first write.
- Updated dependencies [6d0c8f3]
  - @voyant-travel/action-ledger@0.64.0
  - @voyant-travel/core@0.64.0
  - @voyant-travel/db@0.64.0
  - @voyant-travel/hono@0.64.0
  - @voyant-travel/identity@0.64.0
  - @voyant-travel/utils@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/action-ledger@0.63.1
- @voyant-travel/core@0.63.1
- @voyant-travel/db@0.63.1
- @voyant-travel/hono@0.63.1
- @voyant-travel/identity@0.63.1
- @voyant-travel/utils@0.63.1

## 0.63.0

### Minor Changes

- 5bff9c3: Person detail page consolidates onto the canonical surface; identity-document reveal/edit/delete with audit.

  `@voyant-travel/crm-ui`

  - `PersonDetailPage` cleanup: removed the 4 header metric cards, the "Fields update on the left panel" hint, and the "Travel profile" overview card (along with the `travelSnapshot` / `travelSnapshotPending` props on `PersonMain` and the internal `usePersonTravelSnapshot` fetch).
  - New `addresses` tab between Documents and the optional commercial tabs — renders `<PersonAddressesSection personId={person.id} />` by default. Tab union extended; new `tabs.addresses` i18n key in EN ("Addresses") + RO ("Adrese").
  - Relationships now show the related person's display name (hydrated via `usePerson`) instead of the raw TypeID. New optional `onPersonOpen` prop on `PersonDetailPage` and `PersonRelationshipsPanel` — when provided, the name renders as a button (`hover:underline`) that calls the callback so the host can route to the related person's detail page.
  - `PersonDocumentsPanel` accepts an optional `personId`. When provided, each row gets:
    - Eye toggle that lazily calls the new reveal hook and shows the decrypted document number inline (or a destructive error caption when blocked).
    - Pencil that opens the new `PersonDocumentDialog` (form fields: type, number, issuing country, issuing authority, issue + expiry date, primary toggle, notes).
    - "Delete" `ConfirmActionButton` wired to `usePersonDocumentMutation().remove`.
  - New `PersonDocumentDialog` (`@voyant-travel/crm-ui/components/person-document-dialog`) — exports `PersonDocumentDialogProps` + `PersonDocumentDialogDocument`. Uses `useRevealPersonDocument` on open to pre-fill the number; saves via `usePersonDocumentMutation().updateFromPlaintext`.

  `@voyant-travel/crm-react`

  - New hook `useRevealPersonDocument(documentId, { enabled })` — lazy `useQuery` against `GET /v1/crm/person-documents/:id/reveal`. `staleTime: 0` + `gcTime: 0` so every render with `enabled: true` is a fresh audit-logged disclosure on the server. Returns the document id + decrypted number (`null` when no number is on file).
  - New `personDocumentRevealSchema`, `personDocumentRevealResponse`, `PersonDocumentReveal` exports.
  - New `crmQueryKeys.personDocumentReveal(id)`.

  `@voyant-travel/crm`

  - New dependency on `@voyant-travel/action-ledger` (kept at `workspace:*`).
  - New `action-ledger-capabilities.ts` exports `PERSON_DOCUMENT_REVEAL_CAPABILITY` (resource: `person_document`, action: `read`, risk: `high`, required grant `crm-pii:read`) plus action-name / version / authorization-source / decision-policy constants.
  - New route `GET /person-documents/:id/reveal` — gates on the capability (operator's staff sessions with `scopes: ["*"]` satisfy it), KMS-required (503 when not wired), 404 when the document is missing. Wraps the decrypt with `ledgerSensitiveRead` so every reveal writes an action-ledger row tagged `crm.person_document.reveal` with `targetType: "person_document"`.
  - New service method `revealPersonDocumentNumber(db, documentId, { kms, keyRef? })` — pure KMS unwrap; returns `{ documentId, number: string | null }` (the number is `null` when the doc has no `numberEncrypted`). Authorization + audit logging stay in the route layer.

### Patch Changes

- @voyant-travel/action-ledger@0.63.0
- @voyant-travel/core@0.63.0
- @voyant-travel/db@0.63.0
- @voyant-travel/hono@0.63.0
- @voyant-travel/identity@0.63.0
- @voyant-travel/utils@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/core@0.62.3
- @voyant-travel/db@0.62.3
- @voyant-travel/hono@0.62.3
- @voyant-travel/identity@0.62.3
- @voyant-travel/utils@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/core@0.62.2
- @voyant-travel/db@0.62.2
- @voyant-travel/hono@0.62.2
- @voyant-travel/identity@0.62.2
- @voyant-travel/utils@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/core@0.62.1
- @voyant-travel/db@0.62.1
- @voyant-travel/hono@0.62.1
- @voyant-travel/identity@0.62.1
- @voyant-travel/utils@0.62.1

## 0.62.0

### Patch Changes

- Updated dependencies [77aad68]
  - @voyant-travel/core@0.62.0
  - @voyant-travel/db@0.62.0
  - @voyant-travel/hono@0.62.0
  - @voyant-travel/identity@0.62.0
  - @voyant-travel/utils@0.62.0

## 0.61.0

### Patch Changes

- @voyant-travel/core@0.61.0
- @voyant-travel/db@0.61.0
- @voyant-travel/hono@0.61.0
- @voyant-travel/identity@0.61.0
- @voyant-travel/utils@0.61.0

## 0.60.0

### Patch Changes

- Updated dependencies [4ff7f15]
  - @voyant-travel/core@0.60.0
  - @voyant-travel/db@0.60.0
  - @voyant-travel/hono@0.60.0
  - @voyant-travel/identity@0.60.0
  - @voyant-travel/utils@0.60.0

## 0.59.0

### Patch Changes

- @voyant-travel/core@0.59.0
- @voyant-travel/db@0.59.0
- @voyant-travel/hono@0.59.0
- @voyant-travel/identity@0.59.0
- @voyant-travel/utils@0.59.0

## 0.58.0

### Patch Changes

- @voyant-travel/core@0.58.0
- @voyant-travel/db@0.58.0
- @voyant-travel/hono@0.58.0
- @voyant-travel/identity@0.58.0
- @voyant-travel/utils@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/core@0.57.0
- @voyant-travel/db@0.57.0
- @voyant-travel/hono@0.57.0
- @voyant-travel/identity@0.57.0
- @voyant-travel/utils@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/core@0.56.0
- @voyant-travel/db@0.56.0
- @voyant-travel/hono@0.56.0
- @voyant-travel/identity@0.56.0
- @voyant-travel/utils@0.56.0

## 0.55.1

### Patch Changes

- Updated dependencies [819c847]
  - @voyant-travel/core@0.55.1
  - @voyant-travel/db@0.55.1
  - @voyant-travel/hono@0.55.1
  - @voyant-travel/identity@0.55.1
  - @voyant-travel/utils@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/core@0.55.0
- @voyant-travel/db@0.55.0
- @voyant-travel/hono@0.55.0
- @voyant-travel/identity@0.55.0
- @voyant-travel/utils@0.55.0

## 0.54.0

### Patch Changes

- @voyant-travel/core@0.54.0
- @voyant-travel/db@0.54.0
- @voyant-travel/hono@0.54.0
- @voyant-travel/identity@0.54.0
- @voyant-travel/utils@0.54.0

## 0.53.2

### Patch Changes

- @voyant-travel/core@0.53.2
- @voyant-travel/db@0.53.2
- @voyant-travel/hono@0.53.2
- @voyant-travel/identity@0.53.2
- @voyant-travel/utils@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/core@0.53.1
- @voyant-travel/db@0.53.1
- @voyant-travel/hono@0.53.1
- @voyant-travel/identity@0.53.1
- @voyant-travel/utils@0.53.1

## 0.53.0

### Minor Changes

- a315df6: Add CRM person resolution to the storefront booking flow (issue #961).

  Before this change, `publicBookingsService.createSession` and `updateSessionState` never created or linked a CRM `people` row. Storefront bookings landed with `bookings.person_id = NULL` and `booking_travelers.person_id = NULL`, so customers who completed a booking ended up outside the CRM even though the same package's lead/newsletter intake (`createStorefrontLeadSignal` / `subscribeStorefrontNewsletter`) did upsert people. Every operator-side repo had to wire its own `booking.confirmed` subscriber to bridge contact → person, racing with the next lead form that created duplicates.

  **`@voyant-travel/crm`** — new resolution primitives, exported from the package root and rolled into `crmService`:

  - `personNameFromContact(contact)` — derives `{ firstName, lastName }` from a partial contact snapshot. Prefers explicit first/last, then a `name` split, then the email local-part. Never inserts the literal `"Unknown"` (acceptance criterion from the issue); falls back to `"Customer" / "Guest"` only when there is nothing else to work with.
  - `findPersonByContactPoint(db, { kind, value })` — looks a person up by normalized email/phone/website via `identity_contact_points`.
  - `upsertPersonFromContact(db, contact, { source, sourceRef })` — finds-or-creates a CRM person. Lookup order: email → phone. Creates with the supplied source/sourceRef so the audit trail mirrors lead/newsletter signals.

  **`@voyant-travel/bookings`** — wires CRM-free resolver hooks through `BookingRouteRuntime` (mirrors the existing `ResolveBookingTravelSnapshot` pattern, so the bookings package stays free of any direct CRM dependency):

  - New runtime fields: `resolveBillingPerson` and `resolveTravelerPerson`. Templates supply them via `createBookingsHonoModule({ resolveBillingPerson, resolveTravelerPerson })` — typically wired to `crmService.upsertPersonFromContact`.
  - `publicBookingsService.createSession` / `updateSession` / `updateSessionState` now accept an optional `PublicBookingsServiceResolvers` arg. Public routes pull the resolvers from the runtime container and pass them through.
  - `createSession` and `updateSession` resolve a CRM person per traveler before inserting `booking_travelers` rows.
  - `updateSessionState` resolves a CRM person from the billing contact when the wizard's billing payload first arrives, and stamps `bookings.person_id`. Existing `bookings.person_id` values are never overwritten.
  - Resolver failures are caught and logged; the booking still lands without a person link rather than aborting the flow.
  - Default behaviour (resolvers omitted) is unchanged — bookings continue to land with `person_id = NULL`, so the feature is opt-in via template wiring.

  **Tests** — five unit tests for `personNameFromContact`, plus DB-gated integration tests for `findPersonByContactPoint` / `upsertPersonFromContact` covering the dedupe-vs-create path and the email-local-part fallback from the issue acceptance criteria.

### Patch Changes

- @voyant-travel/core@0.53.0
- @voyant-travel/db@0.53.0
- @voyant-travel/hono@0.53.0
- @voyant-travel/identity@0.53.0
- @voyant-travel/utils@0.53.0

## 0.52.4

### Patch Changes

- @voyant-travel/core@0.52.4
- @voyant-travel/db@0.52.4
- @voyant-travel/hono@0.52.4
- @voyant-travel/identity@0.52.4
- @voyant-travel/utils@0.52.4

## 0.52.3

### Patch Changes

- Updated dependencies [9679a57]
  - @voyant-travel/core@0.52.3
  - @voyant-travel/db@0.52.3
  - @voyant-travel/hono@0.52.3
  - @voyant-travel/identity@0.52.3
  - @voyant-travel/utils@0.52.3

## 0.52.2

### Patch Changes

- 3e09123: Expand the CRM person form and detail surface.

  - `PersonForm` gains addresses and relationships subforms with full add/remove/edit affordances; `OrganizationForm` picks up the same address widgets.
  - New exported sections `PersonAddressesSection` and `PersonRelationshipsSection` so the person detail page can render addresses/relationships outside the edit form (e.g. on the read-only detail view).
  - i18n strings for the new sections (EN + RO).
  - `@voyant-travel/crm` service/validation: rename the legacy `birthday` field to `dateOfBirth` to match the rest of identity; migrations `0028_rename_birthday.sql` (dev), `0010_rename_birthday.sql` (dmc), and `0018_rename_birthday.sql` (operator) handle the column rename.
  - Document-attach service tightens its validation around the renamed field.
  - @voyant-travel/core@0.52.2
  - @voyant-travel/db@0.52.2
  - @voyant-travel/hono@0.52.2
  - @voyant-travel/identity@0.52.2
  - @voyant-travel/utils@0.52.2

## 0.52.1

### Patch Changes

- @voyant-travel/core@0.52.1
- @voyant-travel/db@0.52.1
- @voyant-travel/hono@0.52.1
- @voyant-travel/identity@0.52.1
- @voyant-travel/utils@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/core@0.52.0
- @voyant-travel/db@0.52.0
- @voyant-travel/hono@0.52.0
- @voyant-travel/identity@0.52.0
- @voyant-travel/utils@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/core@0.51.1
- @voyant-travel/db@0.51.1
- @voyant-travel/hono@0.51.1
- @voyant-travel/identity@0.51.1
- @voyant-travel/utils@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/core@0.51.0
- @voyant-travel/db@0.51.0
- @voyant-travel/hono@0.51.0
- @voyant-travel/identity@0.51.0
- @voyant-travel/utils@0.51.0

## 0.50.8

### Patch Changes

- @voyant-travel/core@0.50.8
- @voyant-travel/db@0.50.8
- @voyant-travel/hono@0.50.8
- @voyant-travel/identity@0.50.8
- @voyant-travel/utils@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/core@0.50.7
- @voyant-travel/db@0.50.7
- @voyant-travel/hono@0.50.7
- @voyant-travel/identity@0.50.7
- @voyant-travel/utils@0.50.7

## 0.50.6

### Patch Changes

- @voyant-travel/core@0.50.6
- @voyant-travel/db@0.50.6
- @voyant-travel/hono@0.50.6
- @voyant-travel/identity@0.50.6
- @voyant-travel/utils@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/core@0.50.5
- @voyant-travel/db@0.50.5
- @voyant-travel/hono@0.50.5
- @voyant-travel/identity@0.50.5
- @voyant-travel/utils@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/core@0.50.4
- @voyant-travel/db@0.50.4
- @voyant-travel/hono@0.50.4
- @voyant-travel/identity@0.50.4
- @voyant-travel/utils@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/core@0.50.3
- @voyant-travel/db@0.50.3
- @voyant-travel/hono@0.50.3
- @voyant-travel/identity@0.50.3
- @voyant-travel/utils@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/core@0.50.2
- @voyant-travel/db@0.50.2
- @voyant-travel/hono@0.50.2
- @voyant-travel/identity@0.50.2
- @voyant-travel/utils@0.50.2

## 0.50.1

### Patch Changes

- @voyant-travel/core@0.50.1
- @voyant-travel/db@0.50.1
- @voyant-travel/hono@0.50.1
- @voyant-travel/identity@0.50.1
- @voyant-travel/utils@0.50.1

## 0.50.0

### Patch Changes

- @voyant-travel/core@0.50.0
- @voyant-travel/db@0.50.0
- @voyant-travel/hono@0.50.0
- @voyant-travel/identity@0.50.0
- @voyant-travel/utils@0.50.0

## 0.49.0

### Patch Changes

- @voyant-travel/core@0.49.0
- @voyant-travel/db@0.49.0
- @voyant-travel/hono@0.49.0
- @voyant-travel/identity@0.49.0
- @voyant-travel/utils@0.49.0

## 0.48.0

### Minor Changes

- 9132fcf: Add public storefront lead and newsletter intake backed by CRM customer signals, including host-owned spam guard hooks, newsletter double-opt-in callback wiring, and a documented `customer.signal.created` event.

### Patch Changes

- @voyant-travel/core@0.48.0
- @voyant-travel/db@0.48.0
- @voyant-travel/hono@0.48.0
- @voyant-travel/identity@0.48.0
- @voyant-travel/utils@0.48.0

## 0.47.0

### Patch Changes

- @voyant-travel/core@0.47.0
- @voyant-travel/db@0.47.0
- @voyant-travel/hono@0.47.0
- @voyant-travel/identity@0.47.0
- @voyant-travel/utils@0.47.0

## 0.46.0

### Patch Changes

- @voyant-travel/core@0.46.0
- @voyant-travel/db@0.46.0
- @voyant-travel/hono@0.46.0
- @voyant-travel/identity@0.46.0
- @voyant-travel/utils@0.46.0

## 0.45.0

### Patch Changes

- @voyant-travel/core@0.45.0
- @voyant-travel/db@0.45.0
- @voyant-travel/hono@0.45.0
- @voyant-travel/identity@0.45.0
- @voyant-travel/utils@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/core@0.44.0
- @voyant-travel/db@0.44.0
- @voyant-travel/hono@0.44.0
- @voyant-travel/identity@0.44.0
- @voyant-travel/utils@0.44.0

## 0.43.0

### Patch Changes

- Updated dependencies [d07215e]
  - @voyant-travel/core@0.43.0
  - @voyant-travel/db@0.43.0
  - @voyant-travel/hono@0.43.0
  - @voyant-travel/identity@0.43.0
  - @voyant-travel/utils@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/core@0.42.0
- @voyant-travel/db@0.42.0
- @voyant-travel/hono@0.42.0
- @voyant-travel/identity@0.42.0
- @voyant-travel/utils@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/core@0.41.3
- @voyant-travel/db@0.41.3
- @voyant-travel/hono@0.41.3
- @voyant-travel/identity@0.41.3
- @voyant-travel/utils@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/core@0.41.2
- @voyant-travel/db@0.41.2
- @voyant-travel/hono@0.41.2
- @voyant-travel/identity@0.41.2
- @voyant-travel/utils@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/core@0.41.1
- @voyant-travel/db@0.41.1
- @voyant-travel/hono@0.41.1
- @voyant-travel/identity@0.41.1
- @voyant-travel/utils@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/core@0.41.0
- @voyant-travel/db@0.41.0
- @voyant-travel/hono@0.41.0
- @voyant-travel/identity@0.41.0
- @voyant-travel/utils@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/core@0.40.1
- @voyant-travel/db@0.40.1
- @voyant-travel/hono@0.40.1
- @voyant-travel/identity@0.40.1
- @voyant-travel/utils@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/core@0.40.0
- @voyant-travel/db@0.40.0
- @voyant-travel/hono@0.40.0
- @voyant-travel/identity@0.40.0
- @voyant-travel/utils@0.40.0

## 0.39.0

### Patch Changes

- @voyant-travel/core@0.39.0
- @voyant-travel/db@0.39.0
- @voyant-travel/hono@0.39.0
- @voyant-travel/identity@0.39.0
- @voyant-travel/utils@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/core@0.38.2
- @voyant-travel/db@0.38.2
- @voyant-travel/hono@0.38.2
- @voyant-travel/identity@0.38.2
- @voyant-travel/utils@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/core@0.38.1
- @voyant-travel/db@0.38.1
- @voyant-travel/hono@0.38.1
- @voyant-travel/identity@0.38.1
- @voyant-travel/utils@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/core@0.38.0
- @voyant-travel/db@0.38.0
- @voyant-travel/hono@0.38.0
- @voyant-travel/identity@0.38.0
- @voyant-travel/utils@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/core@0.37.1
- @voyant-travel/db@0.37.1
- @voyant-travel/hono@0.37.1
- @voyant-travel/identity@0.37.1
- @voyant-travel/utils@0.37.1

## 0.37.0

### Patch Changes

- @voyant-travel/core@0.37.0
- @voyant-travel/db@0.37.0
- @voyant-travel/hono@0.37.0
- @voyant-travel/identity@0.37.0
- @voyant-travel/utils@0.37.0

## 0.36.0

### Patch Changes

- @voyant-travel/core@0.36.0
- @voyant-travel/db@0.36.0
- @voyant-travel/hono@0.36.0
- @voyant-travel/identity@0.36.0
- @voyant-travel/utils@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/core@0.35.0
- @voyant-travel/db@0.35.0
- @voyant-travel/hono@0.35.0
- @voyant-travel/identity@0.35.0
- @voyant-travel/utils@0.35.0

## 0.34.0

### Patch Changes

- Updated dependencies [a37d4af]
  - @voyant-travel/core@0.34.0
  - @voyant-travel/db@0.34.0
  - @voyant-travel/hono@0.34.0
  - @voyant-travel/identity@0.34.0
  - @voyant-travel/utils@0.34.0

## 0.33.1

### Patch Changes

- @voyant-travel/core@0.33.1
- @voyant-travel/db@0.33.1
- @voyant-travel/hono@0.33.1
- @voyant-travel/identity@0.33.1
- @voyant-travel/utils@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/core@0.33.0
- @voyant-travel/db@0.33.0
- @voyant-travel/hono@0.33.0
- @voyant-travel/identity@0.33.0
- @voyant-travel/utils@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/core@0.32.3
- @voyant-travel/db@0.32.3
- @voyant-travel/hono@0.32.3
- @voyant-travel/identity@0.32.3
- @voyant-travel/utils@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/core@0.32.2
- @voyant-travel/db@0.32.2
- @voyant-travel/hono@0.32.2
- @voyant-travel/identity@0.32.2
- @voyant-travel/utils@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/core@0.32.1
- @voyant-travel/db@0.32.1
- @voyant-travel/hono@0.32.1
- @voyant-travel/identity@0.32.1
- @voyant-travel/utils@0.32.1

## 0.32.0

### Patch Changes

- Updated dependencies [6ea6ded]
  - @voyant-travel/core@0.32.0
  - @voyant-travel/db@0.32.0
  - @voyant-travel/hono@0.32.0
  - @voyant-travel/identity@0.32.0
  - @voyant-travel/utils@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/core@0.31.4
- @voyant-travel/db@0.31.4
- @voyant-travel/hono@0.31.4
- @voyant-travel/identity@0.31.4
- @voyant-travel/utils@0.31.4

## 0.31.3

### Patch Changes

- Updated dependencies [5f974dd]
  - @voyant-travel/core@0.31.3
  - @voyant-travel/db@0.31.3
  - @voyant-travel/hono@0.31.3
  - @voyant-travel/identity@0.31.3
  - @voyant-travel/utils@0.31.3

## 0.31.2

### Patch Changes

- Updated dependencies [54ddc93]
  - @voyant-travel/core@0.31.2
  - @voyant-travel/db@0.31.2
  - @voyant-travel/hono@0.31.2
  - @voyant-travel/identity@0.31.2
  - @voyant-travel/utils@0.31.2

## 0.31.1

### Patch Changes

- @voyant-travel/core@0.31.1
- @voyant-travel/db@0.31.1
- @voyant-travel/hono@0.31.1
- @voyant-travel/identity@0.31.1
- @voyant-travel/utils@0.31.1

## 0.31.0

### Patch Changes

- @voyant-travel/core@0.31.0
- @voyant-travel/db@0.31.0
- @voyant-travel/hono@0.31.0
- @voyant-travel/identity@0.31.0
- @voyant-travel/utils@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/core@0.30.7
- @voyant-travel/db@0.30.7
- @voyant-travel/hono@0.30.7
- @voyant-travel/identity@0.30.7
- @voyant-travel/utils@0.30.7

## 0.30.6

### Patch Changes

- Updated dependencies [5a4c592]
  - @voyant-travel/core@0.30.6
  - @voyant-travel/db@0.30.6
  - @voyant-travel/hono@0.30.6
  - @voyant-travel/identity@0.30.6
  - @voyant-travel/utils@0.30.6

## 0.30.5

### Patch Changes

- Updated dependencies [3f323e9]
  - @voyant-travel/core@0.30.5
  - @voyant-travel/db@0.30.5
  - @voyant-travel/hono@0.30.5
  - @voyant-travel/identity@0.30.5
  - @voyant-travel/utils@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/core@0.30.4
- @voyant-travel/db@0.30.4
- @voyant-travel/hono@0.30.4
- @voyant-travel/identity@0.30.4
- @voyant-travel/utils@0.30.4

## 0.30.3

### Patch Changes

- Updated dependencies [05a1b19]
  - @voyant-travel/core@0.30.3
  - @voyant-travel/db@0.30.3
  - @voyant-travel/hono@0.30.3
  - @voyant-travel/identity@0.30.3
  - @voyant-travel/utils@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/core@0.30.2
- @voyant-travel/db@0.30.2
- @voyant-travel/hono@0.30.2
- @voyant-travel/identity@0.30.2
- @voyant-travel/utils@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/core@0.30.1
- @voyant-travel/db@0.30.1
- @voyant-travel/hono@0.30.1
- @voyant-travel/identity@0.30.1
- @voyant-travel/utils@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/core@0.30.0
- @voyant-travel/db@0.30.0
- @voyant-travel/hono@0.30.0
- @voyant-travel/identity@0.30.0
- @voyant-travel/utils@0.30.0

## 0.29.0

### Patch Changes

- 3420711: Fix #501: cross-package schema init cycle that caused chunk-splitting bundlers (Vite 8 / Rolldown) to crash with `Cannot read properties of undefined (reading 'optional')` at module-evaluation time.

  Root cause: schema files in 4 packages dereferenced a Zod schema imported from another `@voyant-travel/*` package at module top level. When the bundler placed the producer (`kmsEnvelopeSchema` from `@voyant-travel/db`, `availabilitySlotStatusSchema` from `@voyant-travel/availability`, `extraPricingModeSchema` from `@voyant-travel/extras`) into a different chunk than the consumer, ESM live-binding init order didn't guarantee producer-before-consumer evaluation — the consumer hit the producer's TDZ and threw.

  Fix: wrap every cross-package top-level schema reference with `z.lazy(() => Schema)` so the schema is dereferenced at first parse rather than at module evaluation. This is the smallest change per the issue's suggested fixes (Option 1) and protects against the same hazard in any future bundler chunking.

  Sites updated:

  - `@voyant-travel/bookings/schema/travel-details` — 3 `kmsEnvelopeSchema` fields (`identityEncrypted`, `dietaryEncrypted`, `accessibilityEncrypted`)
  - `@voyant-travel/crm/validation` — 5 `kmsEnvelopeSchema` fields (`accessibilityEncrypted`, `dietaryEncrypted`, `loyaltyEncrypted`, `insuranceEncrypted`, `numberEncrypted` on personDocuments)
  - `@voyant-travel/transactions/schema/participant-identity` — 1 `kmsEnvelopeSchema` field (`identityEncrypted`)
  - `@voyant-travel/storefront/validation` — `availabilitySlotStatusSchema` + `extraPricingModeSchema` on the storefront departure / extension schemas

  Behavior unchanged: `z.lazy(fn).optional().nullable()` parses identically to `Schema.optional().nullable()` for valid and invalid payloads. Regression test in `packages/bookings/tests/unit/travel-details-schema.test.ts` asserts both the happy path (valid envelope round-trips) and the error path (empty `enc` violates the producer's `min(1)` validation) continue to work through the lazy wrap.

  No schema migration required, no behavior change for consumers — purely a build-time / module-init shape fix.

- Updated dependencies [583326e]
- Updated dependencies [583326e]
- Updated dependencies [4a6523e]
- Updated dependencies [db51715]
  - @voyant-travel/core@0.29.0
  - @voyant-travel/db@0.29.0
  - @voyant-travel/hono@0.29.0
  - @voyant-travel/identity@0.29.0
  - @voyant-travel/utils@0.29.0

## 0.28.3

### Patch Changes

- @voyant-travel/core@0.28.3
- @voyant-travel/db@0.28.3
- @voyant-travel/hono@0.28.3
- @voyant-travel/identity@0.28.3
- @voyant-travel/utils@0.28.3

## 0.28.2

### Patch Changes

- @voyant-travel/core@0.28.2
- @voyant-travel/db@0.28.2
- @voyant-travel/hono@0.28.2
- @voyant-travel/identity@0.28.2
- @voyant-travel/utils@0.28.2

## 0.28.1

### Patch Changes

- @voyant-travel/core@0.28.1
- @voyant-travel/db@0.28.1
- @voyant-travel/hono@0.28.1
- @voyant-travel/identity@0.28.1
- @voyant-travel/utils@0.28.1

## 0.28.0

### Patch Changes

- @voyant-travel/core@0.28.0
- @voyant-travel/db@0.28.0
- @voyant-travel/hono@0.28.0
- @voyant-travel/identity@0.28.0
- @voyant-travel/utils@0.28.0

## 0.27.0

### Patch Changes

- @voyant-travel/core@0.27.0
- @voyant-travel/db@0.27.0
- @voyant-travel/hono@0.27.0
- @voyant-travel/identity@0.27.0
- @voyant-travel/utils@0.27.0

## 0.26.9

### Patch Changes

- @voyant-travel/core@0.26.9
- @voyant-travel/db@0.26.9
- @voyant-travel/hono@0.26.9
- @voyant-travel/identity@0.26.9
- @voyant-travel/utils@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/core@0.26.8
- @voyant-travel/db@0.26.8
- @voyant-travel/hono@0.26.8
- @voyant-travel/identity@0.26.8
- @voyant-travel/utils@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/core@0.26.7
- @voyant-travel/db@0.26.7
- @voyant-travel/hono@0.26.7
- @voyant-travel/identity@0.26.7
- @voyant-travel/utils@0.26.7

## 0.26.6

### Patch Changes

- @voyant-travel/core@0.26.6
- @voyant-travel/db@0.26.6
- @voyant-travel/hono@0.26.6
- @voyant-travel/identity@0.26.6
- @voyant-travel/utils@0.26.6

## 0.26.5

### Patch Changes

- 7a92aba: Replace the `person_directory_projections` cache table with a Postgres view (closes #446).

  The projection table existed to avoid `LATERAL` joins on every people list read, but no current consumer pushes the projection to a search index — it was pure overhead with a rebuild step on every contact-point change. The new `person_directory` view computes the same `(email, phone, website)` triple per person on demand via `LATERAL` lookups against `identity_contact_points`, leaning on the existing `idx_identity_contact_points_entity_kind_primary_created` index.

  Net effect:

  - `crm.people` list reads now flow through the view; `hydratePeople` returns the same shape it always did.
  - The rebuild path is gone — `syncPersonIdentity` no longer calls `rebuildPersonDirectoryProjection`, and the `rebuildPersonDirectoryProjection(s)` exports are removed.
  - Stale-cache risk is eliminated: edits to `identity_contact_points` flow through immediately on the next read.

  Migration: `templates/operator/migrations/0028_person_directory_view.sql` drops the projection table and creates the view; registered in `meta/_journal.json`.

  Out of scope (deferred): if a future Typesense / search pipeline needs materialized snapshots, it can build a `MATERIALIZED VIEW` or its own table from `person_directory` rather than reusing the deprecated projection.

- Updated dependencies [7a92aba]
  - @voyant-travel/core@0.26.5
  - @voyant-travel/db@0.26.5
  - @voyant-travel/hono@0.26.5
  - @voyant-travel/identity@0.26.5
  - @voyant-travel/utils@0.26.5

## 0.26.4

### Patch Changes

- 6493f62: Add `customer_signals` table for the pre-pipeline interest surface (closes #444).

  Customer signals are the lighter-than-opportunities, heavier-than-segments space — wishlist entries, "notify when this departure opens", inquiry calls captured by an operator, abandoned-cart recovery, request-offer leads. The new `crm.customer_signals` table records:

  - `kind` — `wishlist | notify | inquiry | request_offer | referral`.
  - `source` — `form | phone | admin | abandoned_cart | website | booking`.
  - `status` — `new | contacted | qualified | converted | lost | expired`, default `new`.
  - `priority` (text, validation-layer enum `low | normal | high | urgent`), `notes`, `tags`, `assignedToUserId`, `followUpAt`, `sourceSubmissionId`, `metadata`.
  - `productId`, `optionUnitId`, `resolvedBookingId` as plain `text()` columns — cross-module references stay loose per the project FK rule.

  API:

  - `crmService.listCustomerSignals(db, { personId?, assignedToUserId?, status?, kind?, productId?, search? })` paginated.
  - `crmService.listSignalsForPerson(db, personId)` chronological convenience.
  - CRUD + `crmService.resolveCustomerSignalToBooking(db, signalId, bookingId)` which marks the signal `converted` and pins the bookingId.
  - Admin routes: `GET/POST /v1/admin/crm/customer-signals`, `GET/PATCH/DELETE /v1/admin/crm/customer-signals/:id`, `POST /v1/admin/crm/customer-signals/:id/resolve`, `GET /v1/admin/crm/people/:id/signals`.
  - React hooks: `useCustomerSignals(filters)`, `useCustomerSignalsForPerson(personId)`, `useCustomerSignal(id)`, `useCustomerSignalMutation()` returning `{ create, update, remove, resolve }`.

  Migration: `templates/operator/migrations/0027_customer_signals.sql`, registered in `meta/_journal.json`.

  Out of scope (deferred): full "create booking from signal" orchestration UI; auto-expiry cron that sweeps stale signals to `expired`. The data layer supports both.

- Updated dependencies [6493f62]
  - @voyant-travel/core@0.26.4
  - @voyant-travel/db@0.26.4
  - @voyant-travel/hono@0.26.4
  - @voyant-travel/identity@0.26.4
  - @voyant-travel/utils@0.26.4

## 0.26.3

### Patch Changes

- 372cad5: Add person-to-person relationships table for kinship, emergency contacts, and travel companions (closes #442).

  New `crm.person_relationships` table records directed `fromPerson → toPerson` edges of one of eleven kinds (`spouse`, `partner`, `parent`, `child`, `sibling`, `guardian`, `ward`, `emergency_contact`, `friend`, `travel_companion`, `other`). The optional `inverseKind` lets the service auto-write the symmetric edge in the same transaction (parent↔child, guardian↔ward, etc.) so operator UIs don't have to maintain both sides; the auto-inverse path is idempotent on retry. `(from_person_id, to_person_id, kind)` is uniquely indexed and a CHECK constraint rejects self-edges. Migration: `templates/operator/migrations/0026_person_relationships.sql` (registered in `meta/_journal.json`).

  API surface:

  - `crmService.listPersonRelationships(db, personId, { direction?: "from" | "to" | "both" })` — defaults to `both` so the typical "Jane's family" view returns the union.
  - `crmService.createPersonRelationship(db, fromPersonId, { toPersonId, kind, inverseKind?, autoInverse? })`
  - `crmService.getPersonRelationship` / `updatePersonRelationship` / `deletePersonRelationship`
  - Admin routes: `GET/POST /v1/admin/crm/people/:id/relationships`, `GET/PATCH/DELETE /v1/admin/crm/person-relationships/:id`.
  - React hooks: `usePersonRelationships(personId, { direction, kind })`, `usePersonRelationshipMutation(personId)` returning `{ create, update, remove }`.

  Out of scope (deferred): UI components for the relationship graph; phone-keyed emergency-contact convenience helpers (use `metadata` for now). The data layer is ready for both.

- Updated dependencies [372cad5]
  - @voyant-travel/core@0.26.3
  - @voyant-travel/db@0.26.3
  - @voyant-travel/hono@0.26.3
  - @voyant-travel/identity@0.26.3
  - @voyant-travel/utils@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies [ffdb485]
  - @voyant-travel/core@0.26.2
  - @voyant-travel/db@0.26.2
  - @voyant-travel/hono@0.26.2
  - @voyant-travel/identity@0.26.2
  - @voyant-travel/utils@0.26.2

## 0.26.1

### Patch Changes

- c0507a6: Move toxic PII to `crm.people` and add structured `person_documents` (closes #440 and #443).

  `user_profiles` is no longer the home for encrypted PII. The four free-text slots (accessibility / dietary / loyalty / insurance) move to `crm.people` so operator-managed humans without auth accounts can carry them, and identity documents graduate to a structured `person_documents` table with type / expiry / issuing authority / attachment + a partial unique index pinning a single primary doc per type per person.

  Booking travelers now snapshot dietary, accessibility, and the primary passport from the linked person record at create time (snapshot-on-create, explicit input always wins) via a new `POST /v1/admin/bookings/:id/travelers/with-travel-details` route. Templates wire the snapshot via `createBookingsHonoModule({ resolveTravelSnapshot })` delegating to `crmService.loadPersonTravelSnapshot` — bookings stays free of any direct CRM dependency.

  Customer portal exposes plaintext `accessibility/dietary/loyalty/insurance` on `/me` plus full CRUD over `/me/documents`. CRM admin gains server-side encrypt/decrypt endpoints (`travel-snapshot`, `profile-pii`, `*/from-plaintext`) so the operator booking-traveler dialog can pre-fill from profile and push diverging values back without the browser holding KMS material. The dialog itself now ships a "Travel details" section with passport / dietary / accessibility fields, plus "Pre-fill from profile" and "Save to profile" affordances when a CRM person is linked.

  Breaking changes (intentionally landed pre-1.0):

  - `user_profiles.documentsEncrypted/accessibilityEncrypted/dietaryEncrypted/loyaltyEncrypted/insuranceEncrypted` columns are removed. Migration ships `templates/operator/migrations/0024_people_pii_documents.sql`.
  - `customerPortalProfileSchema.documents` (array) replaced with separate `accessibility/dietary/loyalty/insurance` plaintext string fields. Document CRUD lives at `/v1/public/customer-portal/me/documents`.
  - `bookingsHonoModule` and `crmHonoModule` are still exported but the env-driven default factory `createBookingsHonoModule()` / `createCrmHonoModule()` is the new recommended entry point.

- Updated dependencies [c0507a6]
  - @voyant-travel/core@0.26.1
  - @voyant-travel/db@0.26.1
  - @voyant-travel/hono@0.26.1
  - @voyant-travel/identity@0.26.1
  - @voyant-travel/utils@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/core@0.26.0
- @voyant-travel/db@0.26.0
- @voyant-travel/hono@0.26.0
- @voyant-travel/identity@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/core@0.25.0
- @voyant-travel/db@0.25.0
- @voyant-travel/hono@0.25.0
- @voyant-travel/identity@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/core@0.24.3
- @voyant-travel/db@0.24.3
- @voyant-travel/hono@0.24.3
- @voyant-travel/identity@0.24.3

## 0.24.2

### Patch Changes

- @voyant-travel/core@0.24.2
- @voyant-travel/db@0.24.2
- @voyant-travel/hono@0.24.2
- @voyant-travel/identity@0.24.2

## 0.24.1

### Patch Changes

- @voyant-travel/core@0.24.1
- @voyant-travel/db@0.24.1
- @voyant-travel/hono@0.24.1
- @voyant-travel/identity@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/core@0.24.0
- @voyant-travel/db@0.24.0
- @voyant-travel/hono@0.24.0
- @voyant-travel/identity@0.24.0

## 0.23.0

### Patch Changes

- @voyant-travel/core@0.23.0
- @voyant-travel/db@0.23.0
- @voyant-travel/hono@0.23.0
- @voyant-travel/identity@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/core@0.22.0
- @voyant-travel/db@0.22.0
- @voyant-travel/hono@0.22.0
- @voyant-travel/identity@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/core@0.21.1
- @voyant-travel/db@0.21.1
- @voyant-travel/hono@0.21.1
- @voyant-travel/identity@0.21.1

## 0.21.0

### Patch Changes

- Updated dependencies [6427bad]
  - @voyant-travel/core@0.21.0
  - @voyant-travel/db@0.21.0
  - @voyant-travel/hono@0.21.0
  - @voyant-travel/identity@0.21.0

## 0.20.0

### Patch Changes

- @voyant-travel/core@0.20.0
- @voyant-travel/db@0.20.0
- @voyant-travel/hono@0.20.0
- @voyant-travel/identity@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [714c544]
  - @voyant-travel/core@0.19.0
  - @voyant-travel/db@0.19.0
  - @voyant-travel/hono@0.19.0
  - @voyant-travel/identity@0.19.0

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
  - @voyant-travel/core@0.18.0
  - @voyant-travel/db@0.18.0
  - @voyant-travel/hono@0.18.0
  - @voyant-travel/identity@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [66d722d]
- Updated dependencies [66d722d]
  - @voyant-travel/core@0.17.0
  - @voyant-travel/db@0.17.0
  - @voyant-travel/hono@0.17.0
  - @voyant-travel/identity@0.17.0

## 0.16.0

### Patch Changes

- @voyant-travel/core@0.16.0
- @voyant-travel/db@0.16.0
- @voyant-travel/hono@0.16.0
- @voyant-travel/identity@0.16.0

## 0.15.0

### Patch Changes

- @voyant-travel/core@0.15.0
- @voyant-travel/db@0.15.0
- @voyant-travel/hono@0.15.0
- @voyant-travel/identity@0.15.0

## 0.14.0

### Patch Changes

- @voyant-travel/core@0.14.0
- @voyant-travel/db@0.14.0
- @voyant-travel/hono@0.14.0
- @voyant-travel/identity@0.14.0

## 0.13.0

### Patch Changes

- @voyant-travel/core@0.13.0
- @voyant-travel/db@0.13.0
- @voyant-travel/hono@0.13.0
- @voyant-travel/identity@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies [944d244]
- Updated dependencies [cc561ce]
  - @voyant-travel/core@0.12.0
  - @voyant-travel/db@0.12.0
  - @voyant-travel/hono@0.12.0
  - @voyant-travel/identity@0.12.0

## 0.11.0

### Patch Changes

- @voyant-travel/core@0.11.0
- @voyant-travel/db@0.11.0
- @voyant-travel/hono@0.11.0
- @voyant-travel/identity@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [29a581a]
- Updated dependencies [b7f0501]
  - @voyant-travel/core@0.10.0
  - @voyant-travel/db@0.10.0
  - @voyant-travel/hono@0.10.0
  - @voyant-travel/identity@0.10.0

## 0.9.0

### Patch Changes

- @voyant-travel/core@0.9.0
- @voyant-travel/db@0.9.0
- @voyant-travel/hono@0.9.0
- @voyant-travel/identity@0.9.0

## 0.8.0

### Patch Changes

- @voyant-travel/core@0.8.0
- @voyant-travel/db@0.8.0
- @voyant-travel/hono@0.8.0
- @voyant-travel/identity@0.8.0

## 0.7.0

### Patch Changes

- @voyant-travel/core@0.7.0
- @voyant-travel/db@0.7.0
- @voyant-travel/hono@0.7.0
- @voyant-travel/identity@0.7.0

## 0.6.9

### Patch Changes

- @voyant-travel/core@0.6.9
- @voyant-travel/db@0.6.9
- @voyant-travel/hono@0.6.9
- @voyant-travel/identity@0.6.9

## 0.6.8

### Patch Changes

- b218885: Add composite indexes for CRM communication history lists scoped by person and
  for the segment recency list.
- b218885: Add a composite index for custom field value admin lists filtered by entity type
  and ordered by update time.
- b218885: Add a CRM-owned person directory projection so person list, detail, and export
  reads no longer hydrate email, phone, website, and primary address fields
  directly from identity tables on every read. Also align CRM child-list indexes
  with the actual parent-and-sort query shapes used for notes, communications,
  pipelines, stages, activity links/participants, opportunity participants and
  products, and quote lines.
- b218885: Add global sort indexes for CRM pipeline and stage admin lists that order by
  sort position and creation time without a parent filter.
- b218885: add crm root admin list composite indexes
- Updated dependencies [b218885]
- Updated dependencies [b218885]
  - @voyant-travel/core@0.6.8
  - @voyant-travel/db@0.6.8
  - @voyant-travel/hono@0.6.8
  - @voyant-travel/identity@0.6.8

## 0.6.7

### Patch Changes

- @voyant-travel/core@0.6.7
- @voyant-travel/db@0.6.7
- @voyant-travel/hono@0.6.7
- @voyant-travel/identity@0.6.7

## 0.6.6

### Patch Changes

- @voyant-travel/core@0.6.6
- @voyant-travel/db@0.6.6
- @voyant-travel/hono@0.6.6
- @voyant-travel/identity@0.6.6

## 0.6.5

### Patch Changes

- @voyant-travel/core@0.6.5
- @voyant-travel/db@0.6.5
- @voyant-travel/hono@0.6.5
- @voyant-travel/identity@0.6.5

## 0.6.4

### Patch Changes

- @voyant-travel/core@0.6.4
- @voyant-travel/db@0.6.4
- @voyant-travel/hono@0.6.4
- @voyant-travel/identity@0.6.4

## 0.6.3

### Patch Changes

- Updated dependencies [d3c6937]
  - @voyant-travel/core@0.6.3
  - @voyant-travel/db@0.6.3
  - @voyant-travel/hono@0.6.3
  - @voyant-travel/identity@0.6.3

## 0.6.2

### Patch Changes

- @voyant-travel/core@0.6.2
- @voyant-travel/db@0.6.2
- @voyant-travel/hono@0.6.2
- @voyant-travel/identity@0.6.2

## 0.6.1

### Patch Changes

- @voyant-travel/core@0.6.1
- @voyant-travel/db@0.6.1
- @voyant-travel/hono@0.6.1
- @voyant-travel/identity@0.6.1

## 0.6.0

### Patch Changes

- @voyant-travel/core@0.6.0
- @voyant-travel/db@0.6.0
- @voyant-travel/hono@0.6.0
- @voyant-travel/identity@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [ce72e29]
  - @voyant-travel/core@0.5.0
  - @voyant-travel/db@0.5.0
  - @voyant-travel/hono@0.5.0
  - @voyant-travel/identity@0.5.0

## 0.4.5

### Patch Changes

- e3f6e72: Standardize TypeID prefixes to a first-N-chars convention for better DX.

  Root entities now use the shortest unambiguous first-N chars of the entity name
  (e.g. `pers` instead of `prsn`, `org` instead of `orgn`). Child entities use a
  2-char module code plus 2-char suffix. 19 prefixes renamed in total.

- Updated dependencies [e3f6e72]
  - @voyant-travel/core@0.4.5
  - @voyant-travel/db@0.4.5
  - @voyant-travel/hono@0.4.5
  - @voyant-travel/identity@0.4.5

## 0.4.4

### Patch Changes

- @voyant-travel/core@0.4.4
- @voyant-travel/db@0.4.4
- @voyant-travel/hono@0.4.4
- @voyant-travel/identity@0.4.4

## 0.4.3

### Patch Changes

- @voyant-travel/core@0.4.3
- @voyant-travel/db@0.4.3
- @voyant-travel/hono@0.4.3
- @voyant-travel/identity@0.4.3

## 0.4.2

### Patch Changes

- @voyant-travel/core@0.4.2
- @voyant-travel/db@0.4.2
- @voyant-travel/hono@0.4.2
- @voyant-travel/identity@0.4.2

## 0.4.1

### Patch Changes

- @voyant-travel/core@0.4.1
- @voyant-travel/db@0.4.1
- @voyant-travel/hono@0.4.1
- @voyant-travel/identity@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies [e84fe0f]
  - @voyant-travel/core@0.4.0
  - @voyant-travel/db@0.4.0
  - @voyant-travel/hono@0.4.0
  - @voyant-travel/identity@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies [8566f2d]
- Updated dependencies [8566f2d]
  - @voyant-travel/core@0.3.1
  - @voyant-travel/db@0.3.1
  - @voyant-travel/hono@0.3.1
  - @voyant-travel/identity@0.3.1

## 0.3.0

### Patch Changes

- @voyant-travel/core@0.3.0
- @voyant-travel/db@0.3.0
- @voyant-travel/hono@0.3.0
- @voyant-travel/identity@0.3.0

## 0.2.0

### Patch Changes

- @voyant-travel/core@0.2.0
- @voyant-travel/db@0.2.0
- @voyant-travel/hono@0.2.0
- @voyant-travel/identity@0.2.0

## 0.1.1

### Patch Changes

- @voyant-travel/core@0.1.1
- @voyant-travel/db@0.1.1
- @voyant-travel/hono@0.1.1
- @voyant-travel/identity@0.1.1
