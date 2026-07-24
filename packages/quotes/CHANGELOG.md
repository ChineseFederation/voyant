# @voyant-travel/crm

## 0.132.4

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/core@0.136.0
  - @voyant-travel/trips@0.192.0
  - @voyant-travel/operator-settings@0.14.20
  - @voyant-travel/action-ledger@0.113.2
  - @voyant-travel/db@0.118.5
  - @voyant-travel/hono@0.134.5
  - @voyant-travel/relationships@0.131.2

## 0.132.3

### Patch Changes

- Updated dependencies [3651ff7]
- Updated dependencies [c03ff60]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/trips@0.191.0
  - @voyant-travel/action-ledger@0.113.1
  - @voyant-travel/db@0.118.4
  - @voyant-travel/hono@0.134.4
  - @voyant-travel/operator-settings@0.14.19
  - @voyant-travel/relationships@0.131.1

## 0.132.2

### Patch Changes

- Updated dependencies [c7459a2]
  - @voyant-travel/relationships@0.131.0
  - @voyant-travel/trips@0.190.0
  - @voyant-travel/operator-settings@0.14.18

## 0.132.1

### Patch Changes

- Updated dependencies [b07a0a3]
- Updated dependencies [fa1cc2c]
  - @voyant-travel/action-ledger@0.113.0
  - @voyant-travel/core@0.134.0
  - @voyant-travel/tools@0.5.0
  - @voyant-travel/relationships@0.130.0
  - @voyant-travel/trips@0.189.0
  - @voyant-travel/db@0.118.3
  - @voyant-travel/hono@0.134.3
  - @voyant-travel/operator-settings@0.14.17

## 0.132.0

### Minor Changes

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
- Updated dependencies [0190317]
- Updated dependencies [bba4fec]
- Updated dependencies [c1f9cdf]
- Updated dependencies [58020ec]
- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
- Updated dependencies
  - @voyant-travel/trips@0.188.0
  - @voyant-travel/relationships@0.129.0
  - @voyant-travel/action-ledger@0.112.0
  - @voyant-travel/core@0.133.0
  - @voyant-travel/tools@0.4.0
  - @voyant-travel/operator-settings@0.14.16
  - @voyant-travel/db@0.118.2
  - @voyant-travel/hono@0.134.2

## 0.131.40

### Patch Changes

- @voyant-travel/relationships@0.128.36
- @voyant-travel/trips@0.187.0
- @voyant-travel/operator-settings@0.14.15

## 0.131.39

### Patch Changes

- Updated dependencies [dd370ca]
  - @voyant-travel/core@0.132.1
  - @voyant-travel/trips@0.186.0
  - @voyant-travel/relationships@0.128.35
  - @voyant-travel/operator-settings@0.14.14

## 0.131.38

### Patch Changes

- @voyant-travel/trips@0.185.0
- @voyant-travel/relationships@0.128.34
- @voyant-travel/operator-settings@0.14.13

## 0.131.37

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/action-ledger@0.111.14
  - @voyant-travel/db@0.118.1
  - @voyant-travel/hono@0.134.1
  - @voyant-travel/operator-settings@0.14.12
  - @voyant-travel/relationships@0.128.33
  - @voyant-travel/trips@0.184.1

## 0.131.36

### Patch Changes

- Updated dependencies [e68a705]
  - @voyant-travel/trips@0.184.0
  - @voyant-travel/operator-settings@0.14.11
  - @voyant-travel/relationships@0.128.32

## 0.131.35

### Patch Changes

- @voyant-travel/operator-settings@0.14.10
- @voyant-travel/trips@0.183.0
- @voyant-travel/relationships@0.128.31

## 0.131.34

### Patch Changes

- Updated dependencies [f945310]
- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/db@0.118.0
  - @voyant-travel/core@0.131.0
  - @voyant-travel/hono@0.134.0
  - @voyant-travel/relationships@0.128.30
  - @voyant-travel/trips@0.182.0
  - @voyant-travel/operator-settings@0.14.9
  - @voyant-travel/action-ledger@0.111.13
  - @voyant-travel/types@0.109.9

## 0.131.33

### Patch Changes

- @voyant-travel/trips@0.181.0
- @voyant-travel/relationships@0.128.29
- @voyant-travel/operator-settings@0.14.8

## 0.131.32

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0
  - @voyant-travel/action-ledger@0.111.11
  - @voyant-travel/operator-settings@0.14.7
  - @voyant-travel/relationships@0.128.28
  - @voyant-travel/trips@0.180.0

## 0.131.31

### Patch Changes

- @voyant-travel/trips@0.179.0
- @voyant-travel/relationships@0.128.27
- @voyant-travel/operator-settings@0.14.6

## 0.131.30

### Patch Changes

- Updated dependencies [b27847f]
  - @voyant-travel/trips@0.178.0

## 0.131.29

### Patch Changes

- @voyant-travel/trips@0.177.0
- @voyant-travel/relationships@0.128.26
- @voyant-travel/operator-settings@0.14.5

## 0.131.28

### Patch Changes

- Updated dependencies [e7e90bf]
  - @voyant-travel/trips@0.176.0
  - @voyant-travel/operator-settings@0.14.4
  - @voyant-travel/relationships@0.128.25

## 0.131.27

### Patch Changes

- @voyant-travel/trips@0.175.0
- @voyant-travel/relationships@0.128.24
- @voyant-travel/operator-settings@0.14.3

## 0.131.26

### Patch Changes

- @voyant-travel/operator-settings@0.14.2
- @voyant-travel/trips@0.174.0
- @voyant-travel/relationships@0.128.23

## 0.131.25

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0
  - @voyant-travel/action-ledger@0.111.10
  - @voyant-travel/operator-settings@0.14.1
  - @voyant-travel/relationships@0.128.22
  - @voyant-travel/trips@0.173.2

## 0.131.24

### Patch Changes

- Updated dependencies [225000a]
  - @voyant-travel/operator-settings@0.14.0
  - @voyant-travel/trips@0.173.1

## 0.131.23

### Patch Changes

- @voyant-travel/trips@0.173.0
- @voyant-travel/relationships@0.128.21
- @voyant-travel/operator-settings@0.13.1

## 0.131.22

### Patch Changes

- Updated dependencies [0fa5feb]
  - @voyant-travel/operator-settings@0.13.0
  - @voyant-travel/trips@0.172.1

## 0.131.21

### Patch Changes

- Updated dependencies [464815c]
  - @voyant-travel/operator-settings@0.12.0
  - @voyant-travel/trips@0.172.0
  - @voyant-travel/relationships@0.128.20

## 0.131.20

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/operator-settings@0.11.0
  - @voyant-travel/trips@0.171.1
  - @voyant-travel/db@0.117.1

## 0.131.19

### Patch Changes

- @voyant-travel/trips@0.171.0
- @voyant-travel/relationships@0.128.19
- @voyant-travel/operator-settings@0.10.11

## 0.131.18

### Patch Changes

- @voyant-travel/trips@0.170.0
- @voyant-travel/relationships@0.128.18
- @voyant-travel/operator-settings@0.10.10

## 0.131.17

### Patch Changes

- @voyant-travel/trips@0.169.0
- @voyant-travel/relationships@0.128.17
- @voyant-travel/operator-settings@0.10.9

## 0.131.16

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/action-ledger@0.111.9
  - @voyant-travel/hono@0.131.2
  - @voyant-travel/operator-settings@0.10.8
  - @voyant-travel/relationships@0.128.16
  - @voyant-travel/trips@0.168.0
  - @voyant-travel/types@0.109.8

## 0.131.15

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0
  - @voyant-travel/action-ledger@0.111.8
  - @voyant-travel/hono@0.131.1
  - @voyant-travel/operator-settings@0.10.7
  - @voyant-travel/relationships@0.128.15
  - @voyant-travel/trips@0.167.0
  - @voyant-travel/types@0.109.7

## 0.131.14

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/relationships@0.128.14
  - @voyant-travel/trips@0.166.0
  - @voyant-travel/action-ledger@0.111.7
  - @voyant-travel/operator-settings@0.10.6
  - @voyant-travel/types@0.109.6

## 0.131.13

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/action-ledger@0.111.6
  - @voyant-travel/db@0.114.15
  - @voyant-travel/hono@0.130.1
  - @voyant-travel/operator-settings@0.10.5
  - @voyant-travel/relationships@0.128.13
  - @voyant-travel/trips@0.165.0

## 0.131.12

### Patch Changes

- @voyant-travel/trips@0.164.0
- @voyant-travel/relationships@0.128.12
- @voyant-travel/operator-settings@0.10.4

## 0.131.11

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/core@0.128.0
  - @voyant-travel/hono@0.130.0
  - @voyant-travel/relationships@0.128.11
  - @voyant-travel/trips@0.163.0
  - @voyant-travel/action-ledger@0.111.5
  - @voyant-travel/db@0.114.14
  - @voyant-travel/operator-settings@0.10.3

## 0.131.10

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0
  - @voyant-travel/action-ledger@0.111.4
  - @voyant-travel/operator-settings@0.10.2
  - @voyant-travel/relationships@0.128.10
  - @voyant-travel/trips@0.162.1

## 0.131.9

### Patch Changes

- @voyant-travel/operator-settings@0.10.1
- @voyant-travel/trips@0.162.0
- @voyant-travel/relationships@0.128.9

## 0.131.8

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/operator-settings@0.10.0
  - @voyant-travel/action-ledger@0.111.3
  - @voyant-travel/db@0.114.13
  - @voyant-travel/hono@0.128.6
  - @voyant-travel/relationships@0.128.8
  - @voyant-travel/trips@0.161.0

## 0.131.7

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/action-ledger@0.111.2
  - @voyant-travel/db@0.114.11
  - @voyant-travel/hono@0.128.4
  - @voyant-travel/operator-settings@0.9.2
  - @voyant-travel/relationships@0.128.7
  - @voyant-travel/trips@0.160.1

## 0.131.6

### Patch Changes

- @voyant-travel/trips@0.160.0
- @voyant-travel/operator-settings@0.9.1
- @voyant-travel/relationships@0.128.6

## 0.131.5

### Patch Changes

- Updated dependencies [158c3a0]
  - @voyant-travel/operator-settings@0.9.0
  - @voyant-travel/trips@0.159.0
  - @voyant-travel/relationships@0.128.5

## 0.131.4

### Patch Changes

- Updated dependencies [ca3713e]
  - @voyant-travel/operator-settings@0.8.0
  - @voyant-travel/trips@0.158.0
  - @voyant-travel/relationships@0.128.4

## 0.131.3

### Patch Changes

- Updated dependencies [3062a73]
- Updated dependencies [926ea47]
  - @voyant-travel/operator-settings@0.7.0
  - @voyant-travel/trips@0.157.0
  - @voyant-travel/relationships@0.128.3

## 0.131.2

### Patch Changes

- Updated dependencies [d6a9973]
  - @voyant-travel/operator-settings@0.6.0
  - @voyant-travel/trips@0.156.0
  - @voyant-travel/relationships@0.128.2

## 0.131.1

### Patch Changes

- @voyant-travel/trips@0.155.0
- @voyant-travel/relationships@0.128.1
- @voyant-travel/operator-settings@0.5.2

## 0.131.0

### Minor Changes

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
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/core@0.125.0
  - @voyant-travel/relationships@0.128.0
  - @voyant-travel/trips@0.154.0
  - @voyant-travel/action-ledger@0.111.1
  - @voyant-travel/db@0.114.9
  - @voyant-travel/hono@0.128.1
  - @voyant-travel/operator-settings@0.5.1

## 0.130.1

### Patch Changes

- Updated dependencies [5941d2c]
  - @voyant-travel/action-ledger@0.111.0
  - @voyant-travel/relationships@0.127.1

## 0.130.0

### Minor Changes

- 8f0fa26: Make Hono the explicit sole server API runtime while moving package and
  deployment interfaces to role-based API vocabulary. Replace Hono-prefixed module,
  extension, bundle, lazy-route, and factory names with `Api*` names; move
  router-named domain runtime entry points to `./api-runtime`; and remove the old
  names without compatibility aliases.

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/action-ledger@0.110.0
  - @voyant-travel/hono@0.128.0
  - @voyant-travel/operator-settings@0.5.0
  - @voyant-travel/relationships@0.127.0
  - @voyant-travel/trips@0.153.0
  - @voyant-travel/db@0.114.8

## 0.129.1

### Patch Changes

- Updated dependencies [a1842a7]
- Updated dependencies [85bfe2c]
  - @voyant-travel/hono@0.127.2
  - @voyant-travel/action-ledger@0.109.1
  - @voyant-travel/trips@0.152.0
  - @voyant-travel/operator-settings@0.4.1
  - @voyant-travel/relationships@0.126.1

## 0.129.0

### Minor Changes

- 372f4f4: Add a separately selectable Operations-owned dashboard Tool that composes the real aggregate
  services from Bookings, Finance, Inventory, Distribution, and Operations without crossing domain
  persistence boundaries. Require every underlying read scope and return structural source
  projections, KPIs, and bounded alerts.

  Complete the Quotes proposal lifecycle Tool surface with snapshot, send, accept, and decline
  capabilities, structural JSON-safe outputs, compatibility aliases, staff-only grants,
  confirmation, and graph-ledger/approval policy.

### Patch Changes

- f819273: Add the package-owned, exact-idempotent quote snapshot and vetted-template notification workflow, its guarded Tool/action, and the narrow Quotes-to-Notifications runtime port.
- 6604f9e: Expose structural output schemas for every first-party Tool that previously used an opaque runtime-only schema.
- Updated dependencies [cabf662]
- Updated dependencies [b8cef4c]
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
  - @voyant-travel/trips@0.151.0
  - @voyant-travel/operator-settings@0.4.0
  - @voyant-travel/relationships@0.126.0
  - @voyant-travel/db@0.114.7
  - @voyant-travel/hono@0.127.1

## 0.128.8

### Patch Changes

- Updated dependencies [7e9f77a]
- Updated dependencies [b459761]
- Updated dependencies [552acbf]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0
  - @voyant-travel/hono@0.127.0
  - @voyant-travel/trips@0.150.0
  - @voyant-travel/tools@0.2.2
  - @voyant-travel/db@0.114.6
  - @voyant-travel/operator-settings@0.3.14
  - @voyant-travel/relationships@0.125.4

## 0.128.7

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
  - @voyant-travel/core@0.122.2
  - @voyant-travel/db@0.114.5
  - @voyant-travel/operator-settings@0.3.13
  - @voyant-travel/quotes-contracts@0.108.3
  - @voyant-travel/relationships@0.125.3
  - @voyant-travel/trips@0.149.0
  - @voyant-travel/types@0.109.2

## 0.128.6

### Patch Changes

- @voyant-travel/trips@0.148.0
- @voyant-travel/relationships@0.125.2
- @voyant-travel/operator-settings@0.3.12

## 0.128.5

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [8d62a7c]
  - @voyant-travel/core@0.122.1
  - @voyant-travel/db@0.114.4
  - @voyant-travel/types@0.109.1
  - @voyant-travel/hono@0.126.3
  - @voyant-travel/operator-settings@0.3.11
  - @voyant-travel/quotes-contracts@0.108.2
  - @voyant-travel/relationships@0.125.1
  - @voyant-travel/tools@0.2.1
  - @voyant-travel/trips@0.147.1

## 0.128.4

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/relationships@0.125.0
  - @voyant-travel/operator-settings@0.3.10
  - @voyant-travel/trips@0.147.0
  - @voyant-travel/db@0.114.3

## 0.128.3

### Patch Changes

- Updated dependencies [cc85042]
- Updated dependencies [07a6ee3]
  - @voyant-travel/core@0.122.0
  - @voyant-travel/db@0.114.2
  - @voyant-travel/hono@0.126.2
  - @voyant-travel/operator-settings@0.3.9
  - @voyant-travel/relationships@0.124.4
  - @voyant-travel/trips@0.146.1

## 0.128.2

### Patch Changes

- Updated dependencies [3f6694b]
  - @voyant-travel/core@0.121.0
  - @voyant-travel/db@0.114.1
  - @voyant-travel/hono@0.126.1
  - @voyant-travel/operator-settings@0.3.8
  - @voyant-travel/relationships@0.124.3
  - @voyant-travel/trips@0.146.0

## 0.128.1

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [bef5b7c]
  - @voyant-travel/hono@0.126.0
  - @voyant-travel/types@0.109.0
  - @voyant-travel/db@0.114.0
  - @voyant-travel/core@0.120.0
  - @voyant-travel/operator-settings@0.3.7
  - @voyant-travel/relationships@0.124.2
  - @voyant-travel/trips@0.145.0

## 0.128.0

### Minor Changes

- 490d132: Move standard Node runtime construction for Flights, Notifications, and Quotes proposal wiring into their domain packages.
- 490d132: Publish package-owned OpenAPI registries and selected-graph documents for accommodation content, Flights, and public quote proposal APIs.
- 047c3f9: Move Quotes, proposal, quote-version snapshot, and MICE graph runtime assembly behind package-owned typed ports and factories.

### Patch Changes

- 490d132: Add package-owned runtime contributor APIs for deployment-supplied Bookings, Finance, and Quotes adapters.
- 490d132: Move capability-derived Node runtime binding assembly into package-owned contributors.
- 490d132: Derive travel runtime port bindings from deployment host capabilities.
- 490d132: Move standard first-party admin factories, package copy, slots, contributions, and icons into selected deployment graph composition.
- 490d132: Declare the remaining package-owned OpenAPI documents backed by committed operations and preserve exact graph API ownership at shared route mounts.
- 490d132: Declare package-owned runtime contributors in `voyant.package.v1` metadata and statically lower selected contributors into generated Node graph source. Node hosts now compose one generated contributor set from opaque host resources without enumerating first-party factories or package IDs.
- 490d132: Compose MCP tools and their service context from graph-selected package runtime exports instead of an Operator-owned product catalog.
- 490d132: Compose package runtimes from generic Node primitives and typed graph ports instead of Operator capability wiring.
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
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
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [cda53b6]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
  - @voyant-travel/relationships@0.124.1
  - @voyant-travel/trips@0.144.0
  - @voyant-travel/db@0.113.0
  - @voyant-travel/core@0.119.0
  - @voyant-travel/operator-settings@0.3.6
  - @voyant-travel/tools@0.2.0
  - @voyant-travel/hono@0.125.1
  - @voyant-travel/types@0.108.1

## 0.127.0

### Minor Changes

- 0c19298: Declare the package-owned Quotes admin factory as a selected-graph runtime while
  preserving its existing routes, destinations, localized navigation, icon, copy
  provider, and selection behavior.

### Patch Changes

- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [8f537b0]
- Updated dependencies [d26a820]
- Updated dependencies [d771be3]
- Updated dependencies [bd7a830]
- Updated dependencies [0a7eab6]
- Updated dependencies [d771be3]
  - @voyant-travel/core@0.118.0
  - @voyant-travel/types@0.108.0
  - @voyant-travel/hono@0.125.0
  - @voyant-travel/trips@0.143.0
  - @voyant-travel/db@0.112.2

## 0.126.4

### Patch Changes

- Updated dependencies [c66f9a5]
  - @voyant-travel/core@0.117.0
  - @voyant-travel/db@0.112.1
  - @voyant-travel/hono@0.124.1
  - @voyant-travel/trips@0.142.4

## 0.126.3

### Patch Changes

- Updated dependencies [ca90eb5]
  - @voyant-travel/db@0.112.0
  - @voyant-travel/hono@0.124.0
  - @voyant-travel/trips@0.142.3
  - @voyant-travel/types@0.107.3

## 0.126.2

### Patch Changes

- Updated dependencies [8576451]
  - @voyant-travel/core@0.116.0
  - @voyant-travel/db@0.111.2
  - @voyant-travel/hono@0.123.2
  - @voyant-travel/trips@0.142.2

## 0.126.1

### Patch Changes

- e4e6621: Model package-owned Hono extensions as first-class deployment graph units while keeping externally distributed integrations in the plugin lane.
- Updated dependencies [e4e6621]
- Updated dependencies [953e418]
- Updated dependencies [2153e48]
  - @voyant-travel/core@0.115.0
  - @voyant-travel/hono@0.123.0
  - @voyant-travel/db@0.111.1
  - @voyant-travel/trips@0.142.1

## 0.126.0

### Minor Changes

- a370024: Publish package-owned deployment manifests for booking requirements and the
  bookings, distribution, MICE, and quotes extension surfaces.
- e3dc5a9: Declare package-owned admin route and copy facets for vertical modules with existing public admin extensions.
- e3dc5a9: Declare package-owned Node deployment facets for product events, subscribers, workflows, access resources, tools, actions, and retain-data lifecycle behavior.

### Patch Changes

- a370024: Rehome finance, quote, legal, and storefront bridge graph declarations into their owning packages with executable runtime descriptors.
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/core@0.114.0
  - @voyant-travel/db@0.111.0
  - @voyant-travel/trips@0.142.0
  - @voyant-travel/hono@0.122.4
  - @voyant-travel/types@0.107.2

## 0.125.9

### Patch Changes

- Updated dependencies [496f2ef]
  - @voyant-travel/core@0.113.0
  - @voyant-travel/trips@0.141.0
  - @voyant-travel/db@0.110.2
  - @voyant-travel/hono@0.122.3

## 0.125.8

### Patch Changes

- 5e1d221: Publish `voyant.package.v1` compatibility metadata from first-party
  schema-owning packages so deployment graph package admission can validate their
  framework, target, and deployment-mode compatibility before runtime imports.
- Updated dependencies [5e1d221]
- Updated dependencies [682d7d0]
  - @voyant-travel/db@0.110.1
  - @voyant-travel/trips@0.140.1
  - @voyant-travel/hono@0.122.2

## 0.125.7

### Patch Changes

- @voyant-travel/trips@0.140.0

## 0.125.6

### Patch Changes

- @voyant-travel/trips@0.139.0

## 0.125.5

### Patch Changes

- @voyant-travel/trips@0.138.0

## 0.125.4

### Patch Changes

- @voyant-travel/trips@0.137.0

## 0.125.3

### Patch Changes

- @voyant-travel/trips@0.136.0

## 0.125.2

### Patch Changes

- @voyant-travel/trips@0.135.0

## 0.125.1

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/db@0.110.0
  - @voyant-travel/hono@0.122.0
  - @voyant-travel/core@0.112.3
  - @voyant-travel/trips@0.134.0
  - @voyant-travel/types@0.107.1

## 0.125.0

### Minor Changes

- 97d1c14: Support package-owned quote-version snapshot routes in source-free managed runtime wiring.

### Patch Changes

- @voyant-travel/trips@0.133.0

## 0.124.2

### Patch Changes

- @voyant-travel/trips@0.132.0

## 0.124.1

### Patch Changes

- @voyant-travel/trips@0.131.0

## 0.124.0

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

- fc71db1: Add write/action + notification agent tools:

  - `@voyant-travel/quotes`: `accept_quote_version` (write, `quotes:write`,
    confirmation-required).
  - `@voyant-travel/finance`: `void_invoice` (destructive, `finance:void`,
    confirmation-required) — the void is a self-contained status transition.
  - `@voyant-travel/notifications`: `list_notification_deliveries` +
    `get_notification_delivery` (read, `notifications:read`).

  The operator registers them on the in-deployment MCP server. A `send_notification`
  tool is deliberately withheld (customer-facing dispatch is an abuse vector and needs
  the provider runtime + rate limiting); booking `cancel` / finance `refund` similarly
  need route-level runtime wiring and will follow as a separate increment.

### Patch Changes

- Updated dependencies [c9a356f]
- Updated dependencies [6474f42]
- Updated dependencies [5786f63]
- Updated dependencies [1655995]
- Updated dependencies [ca14f6f]
  - @voyant-travel/types@0.107.0
  - @voyant-travel/core@0.112.0
  - @voyant-travel/hono@0.121.0
  - @voyant-travel/tools@0.1.0
  - @voyant-travel/trips@0.130.0
  - @voyant-travel/db@0.109.5

## 0.123.14

### Patch Changes

- Updated dependencies [1cb9cba]
- Updated dependencies [131ff9b]
  - @voyant-travel/hono@0.120.0
  - @voyant-travel/trips@0.129.2

## 0.123.13

### Patch Changes

- Updated dependencies [86fbb05]
  - @voyant-travel/hono@0.119.0
  - @voyant-travel/trips@0.129.1

## 0.123.12

### Patch Changes

- @voyant-travel/trips@0.129.0

## 0.123.11

### Patch Changes

- 790a18d: Keep quote version PATCH payloads sparse so omitted status does not trigger lifecycle-only status guards.
- Updated dependencies [790a18d]
  - @voyant-travel/quotes-contracts@0.108.1

## 0.123.10

### Patch Changes

- 7d70797: Validate quote participant person IDs before creating participant records.

## 0.123.9

### Patch Changes

- 5cc83f5: Return actionable 404/409 responses for invalid quote-version parents and blocked pipeline deletes.

## 0.123.8

### Patch Changes

- 23d9ee3: Add public proposal request-edits route support so customers can send non-final feedback on sent proposals.

## 0.123.7

### Patch Changes

- 6d8f054: Normalize quote proposal snapshot currencies so quote-product line items cannot carry a blank or mismatched currency into sent public proposals.

## 0.123.6

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/hono@0.118.0
  - @voyant-travel/trips@0.128.1

## 0.123.5

### Patch Changes

- Updated dependencies [7c5ee80]
  - @voyant-travel/hono@0.117.0
  - @voyant-travel/trips@0.128.0

## 0.123.4

### Patch Changes

- 12a1eb2: Expose client-safe subpaths for validation schemas, linkable metadata, template authoring metadata, finance payment-policy primitives, and Hono reporter utilities. Move browser-facing React/operator imports off mixed runtime barrels so client bundles do not pull Hono request context or other server-only runtime code.
- Updated dependencies [12a1eb2]
  - @voyant-travel/hono@0.116.2

## 0.123.3

### Patch Changes

- Updated dependencies [293e5e4]
  - @voyant-travel/hono@0.116.1
  - @voyant-travel/db@0.109.2
  - @voyant-travel/trips@0.127.0

## 0.123.2

### Patch Changes

- @voyant-travel/db@0.109.1
- @voyant-travel/trips@0.126.0

## 0.123.1

### Patch Changes

- Updated dependencies [684b321]
- Updated dependencies [2542715]
  - @voyant-travel/hono@0.116.0
  - @voyant-travel/trips@0.125.1

## 0.123.0

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
  - @voyant-travel/trips@0.125.0

## 0.122.11

### Patch Changes

- Updated dependencies [4abf9a2]
- Updated dependencies [b68d6a7]
- Updated dependencies [bba70ee]
  - @voyant-travel/hono@0.114.0
  - @voyant-travel/db@0.109.0
  - @voyant-travel/trips@0.124.0

## 0.122.10

### Patch Changes

- @voyant-travel/trips@0.123.0

## 0.122.9

### Patch Changes

- Updated dependencies [021ec00]
  - @voyant-travel/hono@0.113.0
  - @voyant-travel/core@0.111.0
  - @voyant-travel/trips@0.122.1
  - @voyant-travel/db@0.108.5

## 0.122.8

### Patch Changes

- @voyant-travel/trips@0.122.0

## 0.122.7

### Patch Changes

- @voyant-travel/trips@0.121.0

## 0.122.6

### Patch Changes

- c5416cb: Make public proposal acceptance reservation-safe for sourced catalog components.

  - `reserveTrip` now atomically claims the envelope (`priced` → `reserve_in_progress`) before any provider dispatch, so concurrent reserves are serialized and only one caller can create upstream supplier holds. A lost claim returns a `reservation_in_progress` conflict without dispatching, and the claim is released back to `priced` if preflight rejects or throws.
  - Public proposal accept is split into prepare (under the quote-accept lock) → reserve (outside any transaction) → finalize (under the lock). Sourced catalog components are no longer rejected, and a reservation is released via `cancelComponents` if final CRM acceptance loses a race (guarding idempotent replays).

- Updated dependencies [c5416cb]
  - @voyant-travel/trips@0.120.1

## 0.122.5

### Patch Changes

- @voyant-travel/trips@0.120.0

## 0.122.4

### Patch Changes

- @voyant-travel/trips@0.119.0

## 0.122.3

### Patch Changes

- @voyant-travel/trips@0.118.0

## 0.122.2

### Patch Changes

- 1841ce2: D.2 slice 1 (batch 2) — 14 more packages own + ship their migration history (db, relationships, quotes, identity, distribution, inventory, commerce, catalog, finance, notifications, legal, storefront, charters, cruises). Each baseline reproduces the framework bundle's tables column-for-column, and all package sources now apply together (fresh-D.2 union) without collision.

  Shared enums: the codebase inlines copies of some enums to avoid cross-package schema imports (e.g. `service_type` in distribution + inventory, `entity_type` in relationships + quotes). Per-package generation would emit duplicate `CREATE TYPE`, colliding on a fresh D.2 database. All package migrations now wrap `CREATE TYPE … AS ENUM(…)` in an idempotent `DO`-block guard (subset-safe; whichever source applies first creates the type, the rest no-op). The db package additionally owns the shared Postgres extensions (pg_trgm / unaccent) that downstream trigram indexes need on a fresh D.2 database (the retired bundle injected them; per-package sources did not). The batch-1 packages (operator-settings, action-ledger, workflow-runs, trips) get the same guard for uniformity. No runtime change. See `docs/architecture/migration-collector-d2.md`.

- Updated dependencies [1841ce2]
  - @voyant-travel/db@0.108.4
  - @voyant-travel/trips@0.117.1

## 0.122.1

### Patch Changes

- @voyant-travel/trips@0.117.0

## 0.122.0

### Minor Changes

- a74471e: Quotes admin surface. A pipeline board (`/quotes`) plus a full quote workspace (`/quotes/$id`): editable deal fields, client (person and/or organization — B2C/B2B), travelers with an explicit PAX count, line items, tags, owner, the activity timeline, and the quote's versions nested inline. The quote value is derived from its line items and recomputed server-side on every change. Saving snapshots the current line items into a new proposal version that supersedes the prior one (one current version at a time); versions show a sequential number, Active/Expired status, and an editable valid-until on the active version. Adds `quotes.paxCount` plus `createdBy`/`updatedBy` audit fields (stamped from the acting user), an owner picker sourced from team members (falling back to the current user), and the `nav.quotes` operator label. The detail is a staged editor (edit freely; Save commits everything + snapshots a proposal version), with a quote description and images shown on the client proposal, and a "Send to client" action that surfaces the shareable proposal link (re-copying resolves the deployment's public proposal URL, not the admin origin). Products-based versions can be sent for review without a Trip snapshot; since acceptance reserves a frozen Trip, the public proposal exposes an `acceptable` flag and hides Accept (keeping Decline) for product-only proposals so clients never hit a guaranteed 409. All new copy is in en + ro.

### Patch Changes

- Updated dependencies [a74471e]
  - @voyant-travel/quotes-contracts@0.108.0
  - @voyant-travel/db@0.108.3
  - @voyant-travel/trips@0.116.0
  - @voyant-travel/hono@0.112.2

## 0.121.1

### Patch Changes

- @voyant-travel/hono@0.112.1
- @voyant-travel/trips@0.115.0

## 0.121.0

### Minor Changes

- d29dd47: Custom-fields unification (phase 3a — `custom_fields` column on quote + activity). `activities` (relationships) and `quotes` gain a `custom_fields jsonb default '{}'` column (framework bundle migration `0003`), completing entity coverage for all four EAV entity types (person, organization, quote, activity) ahead of repointing the value API to the column. Additive — no behavior change yet. Oracle-verified.

### Patch Changes

- Updated dependencies [98f4a40]
- Updated dependencies [a3bd51c]
- Updated dependencies [3b27dcc]
- Updated dependencies [39d48fe]
- Updated dependencies [d222e9f]
  - @voyant-travel/core@0.110.0
  - @voyant-travel/hono@0.112.0
  - @voyant-travel/trips@0.114.0
  - @voyant-travel/db@0.108.2

## 0.120.1

### Patch Changes

- Updated dependencies [bf2e822]
  - @voyant-travel/trips@0.113.0

## 0.120.0

### Minor Changes

- a860e15: The quotes module now owns the quote-version proposal + Trip-snapshot routes.
  New exports (from `@voyant-travel/quotes` and `@voyant-travel/quotes/proposal-routes`):
  `createQuoteProposalAdminRoutes`, `createQuoteProposalPublicRoutes`,
  `createQuoteVersionSnapshotRoutes`, `tripSnapshotToQuoteVersionApply`,
  `buildQuoteVersionProposalUrl`, and `QuoteProposalRoutesOptions`. The deployment
  injects db, public proposal base URL, and the trip reserve/checkout deps; the
  route implementations (send, public accept/decline, snapshot freeze) no longer
  live in the deployment. Adds `@voyant-travel/trips` as a dependency.

### Patch Changes

- Updated dependencies [9ea7220]
- Updated dependencies [13fe70b]
  - @voyant-travel/hono@0.111.0
  - @voyant-travel/trips@0.112.0

## 0.119.3

### Patch Changes

- c8189fc: Split the legacy `@voyant-travel/crm-contracts` package into
  `@voyant-travel/relationships-contracts` and
  `@voyant-travel/quotes-contracts`. Runtime packages and public validation
  imports now depend on the domain-specific contract packages.
- Updated dependencies [6bff46f]
- Updated dependencies [c8189fc]
  - @voyant-travel/hono@0.110.0
  - @voyant-travel/quotes-contracts@0.107.0

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
