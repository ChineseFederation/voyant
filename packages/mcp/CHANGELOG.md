# @voyant-travel/mcp

## 0.10.1

### Patch Changes

- Updated dependencies [d92a98a]
  - @voyant-travel/hono@0.137.0

## 0.10.0

### Patch Changes

- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
  - @voyant-travel/hono@0.136.0
  - @voyant-travel/tools@0.8.0
  - @voyant-travel/framework@0.66.0

## 0.9.0

### Patch Changes

- 3ab6a93: Admit both the current framework line and the projected 1.x release line used by the OAuth release plan.
- Updated dependencies [8adeb23]
- Updated dependencies [6d0b4b4]
- Updated dependencies [7496159]
- Updated dependencies [fa75fe3]
  - @voyant-travel/framework@0.65.0
  - @voyant-travel/hono@0.135.0
  - @voyant-travel/types@0.109.10

## 0.8.2

### Patch Changes

- 6df3ab4: Expose a review-first booking contract workflow to operator tools, including applicable-template prerequisites, immutable draft revisions, exact approved delivery, durable delivery status, audited void handling, authenticated MCP scope propagation, and shared tool context typing.
- Updated dependencies [6df3ab4]
  - @voyant-travel/tools@0.7.2
  - @voyant-travel/framework@0.64.24

## 0.8.1

### Patch Changes

- 36db91f: Keep org API-key MCP catalog composition available when team-management has no acting user, and project Date-bearing Tool input schemas to JSON Schema datetime strings so `tools/list` no longer fail-closes for Max discovery.

## 0.8.0

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
  - @voyant-travel/tools@0.7.0
  - @voyant-travel/framework@0.64.5

## 0.7.0

### Minor Changes

- a02a76b: Move generic MCP action targets, idempotency fingerprints, and approval preflight
  behind a discoverable server-owned Tool contract. Migrated packages resolve ledger
  targets from validated input, approval-required calls return structured server-issued
  approval metadata, and exact retries are validated against the stored command and
  principal. Route every handler-created target through the selected Tool admission,
  remove the raw created-target executor from the public package surface, and reject
  future package-level bypasses during manifest convergence. Validate graph risk
  against the loaded Tool tier before release and keep the Operator MCP health check
  from accepting startup failures.

### Patch Changes

- Updated dependencies [a02a76b]
  - @voyant-travel/tools@0.6.0
  - @voyant-travel/framework@0.64.3

## 0.6.1

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/core@0.136.0
  - @voyant-travel/framework@0.64.1
  - @voyant-travel/hono@0.134.5

## 0.6.0

### Minor Changes

- 3651ff7: Add fail-closed provider-conditional action availability. An unavailable action
  may name one-valued typed provider ports with explicit `all` or `any` semantics;
  the resolved graph keeps it provisional even for exactly selected provider declarations.
  Malformed, unknown, or ambiguous conditions fail graph validation, while
  missing or unselected providers keep the action out of Tool imports, MCP,
  action-ledger policy, and enumerable runtime lowering. The framework retains
  activation-only Tool loaders privately, instantiates the exact selected provider
  factory, runs the action owner's imported typed-port conformance kit, and only
  then creates a non-forgeable activated runtime view for composition, direct Tool
  registration, action-ledger lowering, and MCP discovery. MCP now accepts only a
  runtime whose object identity was minted by framework lowering, so a fabricated
  structural graph cannot expose a conditional Tool by claiming it is available.
  Framework lowering first takes a detached, deeply immutable metadata snapshot;
  raw and activated runtimes therefore cannot have actions, provider conditions,
  Tool/reference loaders, or provider selections rewritten after minting.
  The MCP graph adapter declares framework 0.64 as a required peer rather than a
  direct runtime dependency. This keeps the package contract explicit without
  introducing a direct framework → operator distribution → MCP → framework
  runtime dependency cycle.

### Patch Changes

- Updated dependencies [3651ff7]
- Updated dependencies [c03ff60]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/framework@0.64.0
  - @voyant-travel/hono@0.134.4

## 0.5.1

### Patch Changes

- b07a0a3: Add an explicit handler-owned durable result protocol for existing-target Tool
  commands, including atomic package-owned operation intent preparation, exact
  admission, stable replay context, organization-bound approval continuity, and
  framework/runtime contract validation. Existing-target command payloads are
  restricted to immutable, acyclic JSON values so their runtime identity cannot
  diverge from canonical fingerprinting; that sanitized frozen value is the
  authoritative target, fingerprint, claim, and handler snapshot.
- Updated dependencies [b07a0a3]
  - @voyant-travel/core@0.134.0
  - @voyant-travel/tools@0.5.0
  - @voyant-travel/hono@0.134.3

## 0.5.0

### Minor Changes

- bf548af: Make generated-child Tool creation retry-safe by binding each command to an
  explicit stable parent anchor, admitting the selected graph action in the
  handler, and atomically persisting the command claim, child row, and canonical
  child reference.
- a6460e2: Add explicit created-target action metadata and fail closed unless handler-owned
  Tools declare a durable command claim, replay, and canonical result-reference
  contract. Adopt the shared transaction-owning created-command executor for
  Bookings reservations, stop asking MCP callers to invent generated target IDs,
  and fail approval-bearing created commands closed until handler control
  propagation exists.
- 8a4f3cd: Add fail-closed graph availability and tested-durability metadata for execute Tool actions.
  Unavailable actions remain diagnosable in resolved graph metadata while their Tool runtime is
  excluded from action-ledger and MCP lowering. Reclassify Trips pricing as a write and keep it
  unavailable until its provider and persistence stages gain tested durable orchestration.

### Patch Changes

- Propagate isolated handler-owned action controls through Tool context and support
  transactionally validated approval-required created-target commands.
- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
- Updated dependencies
  - @voyant-travel/core@0.133.0
  - @voyant-travel/tools@0.4.0
  - @voyant-travel/hono@0.134.2

## 0.4.11

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/hono@0.134.1

## 0.4.10

### Patch Changes

- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/core@0.131.0
  - @voyant-travel/hono@0.134.0
  - @voyant-travel/types@0.109.9

## 0.4.9

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0

## 0.4.8

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0

## 0.4.7

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/core@0.130.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/types@0.109.6

## 0.4.6

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/hono@0.130.1

## 0.4.5

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/core@0.128.0
  - @voyant-travel/hono@0.130.0

## 0.4.4

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0

## 0.4.3

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/hono@0.128.6

## 0.4.2

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/hono@0.128.4

## 0.4.1

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/core@0.125.0
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

## 0.3.0

### Minor Changes

- b8cef4c: Carry stable capability identity, owner, version, aliases, deprecation, audience, deployment
  risk, input/output schemas, and MCP annotations through the Tool registry and standard MCP
  discovery. Graph bindings now check runtime metadata parity, while legacy invocation aliases
  remain callable and exact capability-version lookup fails closed for unsupported versions.
- db5adce: Fail closed before selected graph Tool dispatch by binding each capability to its action-ledger
  policy. Advertise invocation controls in discovery, enforce confirmation, target, idempotency,
  fingerprint, approval, and principal semantics, and record required-ledger execution outcomes.

  Keep the existing package-owned booking cancellation and invoice refund approval workflows as
  explicit handler-enforced policies so their domain-state fingerprints and atomic ledgers are not
  double-gated.

- c9b6144: Add graph-composed, module-owned Tools for navigation preferences and organization setup,
  including exact action policies and owner-scoped project configuration for MCP context wiring.

### Patch Changes

- cabf662: Add the provider-neutral, staff-only action-ledger Tool surface for audit
  entries, target timelines, approvals, delegations, and relay inspection. Add
  guarded approval request/decision Tools whose capability, risk, and policy are
  derived from selected graph actions and whose writes fail closed for missing,
  conditional, expired, misassigned, or no-longer-selected authority. Publish
  selected graph actions to package Tool context contributions. Reversal remains
  inspection-only until a provider-neutral runtime can execute and attest the
  underlying domain reversal command.
- 0979758: Preserve complete Zod input contracts through standard MCP discovery and invocation, keep
  structured output envelopes aligned with their advertised schemas, and reject requests whose
  authenticated actor or audience grant claims are missing.
- ff87f68: Add staff-only workflow-run Tools for typed run inspection, registered workflow
  triggering, and rerun/resume retries. Writes require strict explicit scopes,
  confirmation, approval, action-ledger recording, and a graph-selected
  self-hosted workflow provider. Pass selected provider roles to package Tool
  context contributions so management operations fail closed when deployment
  authority is absent. Trigger and retry use a worst-case critical risk because
  the runner port has no per-workflow side-effect descriptors. Cancellation
  remains unavailable until the
  provider-neutral runner port exposes a real cancellation capability.
- Updated dependencies [cabf662]
- Updated dependencies [b8cef4c]
- Updated dependencies [db5adce]
- Updated dependencies [c9b6144]
- Updated dependencies [ff87f68]
  - @voyant-travel/core@0.124.0
  - @voyant-travel/tools@0.3.0
  - @voyant-travel/hono@0.127.1

## 0.2.6

### Patch Changes

- Updated dependencies [7e9f77a]
- Updated dependencies [552acbf]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0
  - @voyant-travel/hono@0.127.0
  - @voyant-travel/tools@0.2.2

## 0.2.5

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
  - @voyant-travel/types@0.109.2

## 0.2.4

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [8d62a7c]
  - @voyant-travel/core@0.122.1
  - @voyant-travel/types@0.109.1
  - @voyant-travel/hono@0.126.3
  - @voyant-travel/tools@0.2.1

## 0.2.3

### Patch Changes

- Updated dependencies [cc85042]
- Updated dependencies [07a6ee3]
  - @voyant-travel/core@0.122.0
  - @voyant-travel/hono@0.126.2

## 0.2.2

### Patch Changes

- Updated dependencies [3f6694b]
  - @voyant-travel/core@0.121.0
  - @voyant-travel/hono@0.126.1

## 0.2.1

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [bef5b7c]
  - @voyant-travel/hono@0.126.0
  - @voyant-travel/types@0.109.0
  - @voyant-travel/core@0.120.0

## 0.2.0

### Minor Changes

- 490d132: Expose the selected graph and runtime-port providers to package runtime factories, then make MCP compose its graph and tool context without Operator-specific wiring.
- 490d132: Compose MCP tools and their service context from graph-selected package runtime exports instead of an Operator-owned product catalog.
- 490d132: Move Commerce, Catalog, Finance, Legal, and Storage runtime authority out of the
  resident Node compatibility provider container. Compose selected routes through
  package graph factories and typed runtime ports, and resolve Catalog and Finance
  MCP services through package-owned tool-context contributions.

### Patch Changes

- 490d132: Make package and project declarations the sole selected access authority, removing legacy catalog overlays and runtime synthesis.
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
  - @voyant-travel/core@0.119.0
  - @voyant-travel/tools@0.2.0
  - @voyant-travel/hono@0.125.1
  - @voyant-travel/types@0.108.1

## 0.1.1

### Patch Changes

- Updated dependencies [d771be3]
  - @voyant-travel/types@0.108.0

## 0.1.0

### Minor Changes

- 1655995: Publish the agent tool library (`@voyant-travel/tools`) and the in-deployment MCP
  server (`@voyant-travel/mcp`). `@voyant-travel/tools` is the transport-neutral,
  headless tool contract (`defineTool`, `createToolRegistry`, risk metadata);
  `@voyant-travel/mcp` exposes a tool registry as a Model Context Protocol server
  mounted at `/v1/admin/mcp`.

### Patch Changes

- Updated dependencies [c9a356f]
- Updated dependencies [1655995]
  - @voyant-travel/types@0.107.0
  - @voyant-travel/tools@0.1.0
