# @voyant-travel/mcp

## 0.18.0

### Patch Changes

- Updated dependencies [e8bd000]
  - @voyant-travel/framework@0.78.0
  - @voyant-travel/hono@0.142.0

## 0.17.0

### Patch Changes

- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
  - @voyant-travel/core@0.139.0
  - @voyant-travel/hono@0.141.0
  - @voyant-travel/framework@0.77.0

## 0.16.0

### Patch Changes

- Updated dependencies [076c246]
  - @voyant-travel/framework@0.76.0

## 0.15.12

### Patch Changes

- @voyant-travel/framework@0.75.7

## 0.15.11

### Patch Changes

- @voyant-travel/framework@0.75.6

## 0.15.10

### Patch Changes

- @voyant-travel/framework@0.75.5

## 0.15.9

### Patch Changes

- @voyant-travel/framework@0.75.4

## 0.15.8

### Patch Changes

- @voyant-travel/framework@0.75.3

## 0.15.7

### Patch Changes

- @voyant-travel/framework@0.75.2

## 0.15.6

### Patch Changes

- @voyant-travel/framework@0.75.1

## 0.15.5

### Patch Changes

- 7de4013: Define every app compatibility version once, in the package a publisher can install.

  `VOYANT_APP_CONTRACT_VERSIONS` collects the versions an app declares itself
  compatible with — the dated `/v1/app/*` surface, the manifest schema, the admin
  extension protocol major, and the event catalog — each derived from the constant
  that owns it rather than restated as a literal. They were previously written out
  by hand wherever a check needed them, including in another repository, so
  nothing connected a bump to the checks meant to enforce it.

  `APP_API_VERSION` moves here from `@voyant-travel/apps` and is re-exported from
  its old path. The old home is a private package: a publisher pinning
  `appApiVersions` could not read the contract they were pinning to.

## 0.15.4

### Patch Changes

- Updated dependencies [3552f14]
  - @voyant-travel/core@0.138.0
  - @voyant-travel/hono@0.140.1

## 0.15.3

### Patch Changes

- Updated dependencies [c35841b]
  - @voyant-travel/hono@0.140.0
  - @voyant-travel/core@0.137.2

## 0.15.2

### Patch Changes

- Updated dependencies [2bc1570]
- Updated dependencies [14033fb]
  - @voyant-travel/hono@0.139.0
  - @voyant-travel/types@0.109.12

## 0.15.1

### Patch Changes

- e65bd25: Rename the bespoke sales Quote domain to Proposals across packages, routes, schemas, migrations, generated graph authorities, and operator surfaces.

  This beta-line release keeps no compatibility aliases, routes, package names, forwarding exports, views, or dual writes for the bespoke sales rename. Existing beta databases that contain the old bespoke quote schema must be dropped and recreated from the clean-slate migrations; there is no in-place migration path and no data-preservation guarantee for those beta databases.

## 0.15.0

### Minor Changes

- 276d44d: Three fixes found by driving the MCP surface as a real client rather than a
  scripted one.

  `ToolDefinition` gains `resolvesIdempotencyKeyServerSide`. A handler-enforced
  ledgered `execute` previously advertised `idempotencyKey` as caller-required
  unconditionally, so `book_product` — whose purpose is that no token crosses
  calls — told agents to supply the very thing it resolves for them.

  A `<domain>_query` result now applies the concise projection to
  `structuredContent`, not only the text block. Query tools advertise a permissive
  output schema, so trimming cannot fail validation; a client reading structured
  content previously saw none of the concise saving. Measured 52% smaller.

  Server instructions distinguish a key that authorizes nothing from a read-only
  one, instead of claiming reads work when every query returns empty.

- 0c30250: Make `createStandardOperatorRouteFiles` a pure function of resolved
  deployment-graph data (voyant#3976 item 10.1).

  The standard operator route generator previously hardcoded the presentation
  IDs and route tables for auth, storefront, finance, quotes, and MCP consent, so
  a package could not get admin routes emitted without editing
  `@voyant-travel/operator-standard`. Each presentation now declares its own
  route contribution on its `presentations` graph entry via `contribution` and
  `routes`, and the generator emits from those declarations.

  `VoyantGraphPresentationDeclaration` gains optional `contribution` and `routes`
  fields (`VoyantGraphPresentationRouteDeclaration`), validated in the deployment
  graph: when `routes` is non-empty, `contribution` must be a non-empty string,
  each `route` must start with `/`, and each `member` must be a non-empty string.
  The product BOM now carries the full presentation declarations rather than just
  their IDs. This is a behaviour-preserving refactor — the emitted route-file set
  is byte-identical to before.

### Patch Changes

- Updated dependencies [4fe6f79]
- Updated dependencies [276d44d]
- Updated dependencies [0c30250]
  - @voyant-travel/tools@0.10.0
  - @voyant-travel/core@0.137.0
  - @voyant-travel/hono@0.138.1

## 0.14.0

### Minor Changes

- d91da47: Collapse the read tool surface into per-domain query tools (layered read
  projection, voyant#3932).

  **Breaking change.** The ~133 flat read tools (`get_*`, `list_*`, `search_*`)
  are removed as individually discoverable or callable MCP tools. Each domain's
  reads are now reached through one `<domain>_query` tool whose input is a
  discriminated union on `resource` — `inventory_query({ resource: "products",
… })`, `bookings_query({ resource: "booking", bookingId })`. The projection is
  pure transport-layer: no domain `tools.ts` changed, grouping is derived from the
  `owner` each `ToolManifestEntry` already carries.

  Scope filtering prunes resources WITHIN a group, so an unauthorized read is
  neither a discoverable resource nor a callable one — its query tool simply omits
  it, and a group with no authorized read never appears. Writes are NOT collapsed:
  their per-action risk, confirmation, ledger and approval policy stay one Tool
  each. `GET /v1/admin/mcp/manifest` stays fine-grained — it is the capability
  index, not the agent surface.

  Migration: replace a flat read call `list_products({ status })` with
  `inventory_query({ resource: "products", status })`; discover the query tool for
  a record with `search_tools` (search the record noun, e.g. `products`,
  `bookings`) and read its discriminated-union schema with `describe_tool`.

  This measurably lowers agent discovery cost on the real composed graph: the
  six-journey real-surface discovery eval drops from ~48,553 to ~36,974 tokens,
  and the aggregate describe schema of the read surface falls from ~433,234 to
  ~115,559 bytes.

- 53d0cc5: Rate-limit the MCP JSON-RPC endpoint (`/v1/admin/mcp`) per caller. Every request
  is sorted into a `read` bucket (discovery and read-only `tools/call`) or a
  tighter `write` bucket (`tools/call` on a non-`read` tier, a `destructive` risk
  policy, or an action-ledgered capability), keyed independently so a read burst
  never starves writes. Classification reads only existing manifest metadata
  (`tier` / `riskPolicy` / `actionPolicy`).

  Limits, the window, the per-caller key derivation, and the backing store are
  deployment-configurable via the new `rateLimit` option on `createMcpApiRoutes`
  and `createGraphMcpApiRoutes` (pass `false` to disable); they default to safe
  values (120 reads and 20 writes per key per minute). Exposes
  `createMcpRateLimiter`, `isRestrictedTool`, `DEFAULT_MCP_RATE_LIMIT`, and the
  `McpRateLimitOptions` / `McpRateLimitBucket` types. This wires the previously
  unused `hono-rate-limiter` dependency.

### Patch Changes

- 18a2e0a: Upgrade `@modelcontextprotocol/sdk` to `^1.30.0` (from `^1.29.0`) and add a
  protocol-version negotiation test.

  1.30.0 is the latest published SDK; it negotiates protocol `2025-11-25` over our
  stateless transport. It shipped one day before the 2026-07-28 spec revision, so
  none of that revision's features (cacheable list results, MRTR
  `input_required`, the tasks extension, `Mcp-Method`/`Mcp-Name` header routing)
  are implemented yet. `tests/protocol-version.test.ts` pins the negotiated
  version so a future SDK bump that advances it is visible rather than silent, and
  `docs/architecture/mcp-2026-07-28-spec-adoption.md` tracks the features to adopt
  as the SDK ships them — including the constraint that Sampling, Roots, and
  Logging are now deprecated and must not be built on.

  No behaviour change.

## 0.13.0

### Minor Changes

- a180f00: Add an MCP guide layer: the server now advertises `instructions` on `initialize`
  and registers read-only guide Tools (`voyant_guide`, `voyant_glossary`). The
  instructions explain that the deployment is a travel-operator platform and how
  to discover capabilities via `tools/list` / the manifest; the guide Tools cover
  the booking journey and supply models, quote versioning (acceptance is not
  confirmation), product authoring vs publication, room/unit/traveller vocabulary,
  and the `_voyant` confirmation/approval protocol. All content is sourced from
  `docs/architecture/` and `UBIQUITOUS_LANGUAGE.md`, and the guidance is
  scope-aware so a read-only key is never shown write workflows as available.
- a1d8160: Progressive disclosure for the MCP tool surface (voyant#3927). `tools/list` used
  to serialize every authorized tool on every connection — 264 tools / ~310 KB /
  ~78k tokens — before the agent had read the request. It now advertises only a
  tier-0 of three meta-tools and discovers the long tail on demand:

  - `search_tools(query, domain)` — names + one-line descriptions (no schemas).
  - `describe_tool(name)` — the full projected input schema, output contract, and
    discovery metadata for one tool.
  - `call_tool(name, args)` — dispatch a tool that is not eagerly registered.

  Flat-name `tools/call` still dispatches the full authorized surface, so existing
  clients keep working unchanged. Authorization is re-checked at both the index
  (`search_tools` / `describe_tool`) and the dispatch (`call_tool` / flat name)
  layers: an unauthorized tool is neither discoverable nor callable. The
  scope-filtered `GET /manifest` index stays fine-grained. Measured for a full-scope
  staff key, `tools/list` drops to ~1.5 KB / ~370 tokens (a ~210x reduction).

  `McpApiRoutesOptions` gains an optional `eagerToolNames` allowlist to promote
  specific tools into the resident tier-0 surface; it defaults to empty.

  `ToolError` no longer throws when constructed with a `code` outside the documented
  set — it falls back to the terminal `PROVIDER_ERROR` remediation instead of
  crashing while computing `retryable`/`nextSteps`.

- fc45425: Response budgets, `response_format`, and guided truncation for the MCP tool
  surface (voyant#3928, RFC voyant#3921 Finding 7). Tool responses used to be
  uncapped — a single `list_bookings` at the maximum page size could put more into
  an agent's context than the entire tool catalog, and unlike the catalog that cost
  is charged on every call.

  - **Transport-level response budget.** `dispatchToResult` now enforces a
    serialized byte ceiling on every tool result, so the cap covers every tool
    uniformly instead of relying on each domain. Configurable through
    `McpApiRoutesOptions.responseBudgetBytes` / `GraphMcpApiRoutesOptions`;
    defaults to `DEFAULT_RESPONSE_BUDGET_BYTES` (~24 KB).

  - **Guided truncation, never silent.** An over-budget list result has whole rows
    dropped until it fits, and the result states how many of the total it is
    showing and which of the tool's own input filters would narrow it (e.g.
    "narrow with `status`, `dateFrom`"). The `content` text and `structuredContent`
    are trimmed to the same row set, `structuredContent` stays valid against the
    untouched output schema, `_meta["voyant.travel/truncation"]` records what was
    withheld, and the call remains a success.

  - **`response_format: "concise" | "detailed"`** is advertised on list-shaped
    tools and defaults to `concise`, which renders the text content as compact rows
    projected to their populated scalar fields; `detailed` renders the full nested
    records. `structuredContent` always carries the full-field rows. Measured on a
    booking-shaped list: detailed ~255 tokens/row vs concise ~109 tokens/row — 57%
    smaller — on the `content` block agents read.

  Also documents in `@voyant-travel/types` `paginationSchema` that a row count is
  not a payload budget (200 bookings and 200 contact points are not the same
  bytes): `limit` stays a page-size ergonomic while the MCP byte budget is the real
  ceiling on what a response costs an agent's context.

### Patch Changes

- Updated dependencies [a1d8160]
- Updated dependencies [fc45425]
  - @voyant-travel/tools@0.9.2
  - @voyant-travel/types@0.109.11

## 0.12.1

### Patch Changes

- Updated dependencies [e87d4de]
  - @voyant-travel/hono@0.138.0

## 0.12.0

### Minor Changes

- fae0f36: Make tool errors actionable. `ToolError` now carries `retryable`, `nextSteps`,
  and optional `candidates`/`didYouMean` alongside the existing `code`/`meta`. Each
  `ToolErrorCode` has a documented remediation and defensible retry semantics
  (`AUTHORIZATION_DENIED`, `INVALID_INPUT`, `NOT_FOUND`, a permanent
  `PROVIDER_ERROR` and the rest are terminal; only the new transient
  `PROVIDER_UNAVAILABLE` is retryable), so a caller can tell "retry" from "stop".
  The fields default per code, so existing throw sites stay valid.

  `APPROVAL_REQUIRED` and `CONFIRMATION_REQUIRED` now state their exact
  remediations ("request approval via request_action_approval, then re-call with
  \_voyant.approvalId" / "re-call with \_voyant.confirmed=true"). The storefront
  verification rate limit now reports the transient, retryable
  `PROVIDER_UNAVAILABLE` instead of `PROVIDER_ERROR`.

  The MCP error envelope in `dispatchToResult` surfaces `retryable`, `nextSteps`,
  `candidates`, and `didYouMean` as first-class properties, not buried in `meta`.

- 682ba21: Instrument the MCP transport so agent behaviour is observable. A new
  `observability.ts` hangs off the shipped vendor-neutral Reporter seam
  (`@voyant-travel/hono/observability`, RFC #1553) — no new logging framework, no
  vendor SDK, no `console.log`. The `POST /` handler now emits one structured
  event per `tools/call` carrying the tool name, caller identity, granted scopes,
  duration, outcome, and — on failure — the error code. Unknown-tool and
  argument-validation failures are captured as distinct outcomes (`unknown_tool`,
  `validation_error`) rather than blurring into a successful call, and both
  `tools/list` and `GET /manifest` emit the served payload size.

  Telemetry carries shapes, names, and codes only — never argument or result
  payloads (`docs/architecture/booking-pii.md`), covered by a test. Instrumentation
  is best-effort and can never break a `tools/call`. `createMcpApiRoutes` and
  `createGraphMcpApiRoutes` accept an optional `reporter` and `appName`, defaulting
  to the no-op reporter so the behaviour is opt-in.

### Patch Changes

- 1cc6c25: Split the MCP transport into focused modules. `server.ts` was 939 lines holding
  route wiring, authorization, registration, dispatch, the action-policy gate, and
  Zod schema projection in one file. It now owns route wiring and graph
  composition, delegating to `authorization.ts`, `register.ts`, `dispatch.ts`,
  `schema-projection.ts`, and `graph-composition.ts`.

  No behaviour change and no change to the package's public surface — the option
  and identity types moved to `types.ts` and are re-exported from `server.ts`.

- Updated dependencies [fae0f36]
  - @voyant-travel/tools@0.9.0

## 0.11.0

### Minor Changes

- 90361d6: Ship the MCP connector consent screen in every admin auth mode.

  `/mcp-consent` was contributed as part of the local-auth presentation, alongside
  `sign-in`, `sign-up`, and the password-reset pages. A deployment running
  `VOYANT_ADMIN_AUTH_MODE=voyant-cloud` deliberately does not select that
  contribution, so it shipped no consent page: an MCP connector registered and
  authorized successfully, then landed on a 404 at the last step before the grant.

  That was a miscategorisation. The consent screen is not a local-auth page — it
  is an OAuth authorization decision point, and the authorization server issuing
  connector grants is local to the deployment in every auth mode, which is why
  `/auth/oauth2/consent` and `/auth/oauth2/get-client` are already reachable in
  cloud mode.

  The screen now has its own presentation, `@voyant-travel/mcp#presentation.consent`,
  declared by the MCP module and mounted from a new
  `@voyant-travel/auth-react/mcp-consent-routes` export. It ships whenever the MCP
  transport ships, and a broker-authenticated Operator gets it without also
  getting a local sign-in and sign-up page. `createLocalAuthRouteContribution` no
  longer returns an `mcpConsent` route, and the generated route host moved from
  `(auth)/mcp-consent.tsx` to `(mcp)/mcp-consent.tsx`; the public path
  `/mcp-consent` is unchanged.

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
