# @voyant-travel/core

## 0.137.1

### Patch Changes

- c986bd5: Extract the graph declaration surface into `@voyant-travel/graph-contracts`, so
  an adapter, app, or channel author can declare a package without the runtime
  kernel.

  `defineAdapter`, `defineExtension`, `defineModule`, `defineProvider`,
  `defineProject`, the port helpers, and the graph types move out of
  `@voyant-travel/core`. The new package has no dependencies.
  `@voyant-travel/core/project` re-exports it, so no existing import changes.

  `definePlugin` and `VOYANT_GRAPH_PLUGIN_SCHEMA_VERSION` are deprecated: RFC
  #3395 retired "plugin" as a classification. They still export so external
  adapters keep building while they migrate to `defineAdapter`.

- Updated dependencies [c986bd5]
  - @voyant-travel/graph-contracts@0.1.0

## 0.137.0

### Minor Changes

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

## 0.136.1

### Patch Changes

- 7b60cf5: Attribute trusted managed Max writes to the approving staff user while retaining
  Max provenance in the request context and keeping internal credential scopes as
  a hard authorization cap. Resolve the asserted cloud identity to its
  deployment-local mirror user before exposing it to handlers.

## 0.136.0

### Minor Changes

- 952d817: Replace unsafe booking-contract document generation with the Legal-owned
  durable operation/provider protocol. Legacy generation routes and direct
  generator services and exports are removed. Standard Operator now selects and
  constructs the shipped provider from its exact database, document-storage, and
  renderer bindings; startup and action activation require behavioral provider
  preflight, and pending recovery fails loudly if that provider disappears.
  Local Standard document bytes now require probed, atomic filesystem durability,
  and the bundled renderer embeds a Latin Extended Unicode font. Custom font
  bytes are also supported by the basic PDF utility. Opaque renderer/S3
  transports require explicit backend identity. Remove the
  Notifications document-bundle lifecycle callbacks, fully-paid orchestration
  subscriber, and its Realtime invalidation declaration; document generation is
  available only through admitted Legal actions.

  Recognize transaction-bound outbox appends as durable domain-event emissions
  and publish the existing Trips requirement-sourcing event contracts.

## 0.135.0

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

## 0.134.0

### Minor Changes

- b07a0a3: Add an explicit handler-owned durable result protocol for existing-target Tool
  commands, including atomic package-owned operation intent preparation, exact
  admission, stable replay context, organization-bound approval continuity, and
  framework/runtime contract validation. Existing-target command payloads are
  restricted to immutable, acyclic JSON values so their runtime identity cannot
  diverge from canonical fingerprinting; that sanitized frozen value is the
  authoritative target, fingerprint, claim, and handler snapshot.

## 0.133.0

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

## 0.132.1

### Patch Changes

- dd370ca: Add a provider-agnostic, durable catalog product reindex job that walks canonical inventory
  products in bounded pages and rebuilds their projections through the selected indexer runtime.
  Product job hosts now pass concrete deployment bindings to fixed job runtimes.

## 0.132.0

### Minor Changes

- a668d0d: Add package-declared, bounded scheduling profiles for product jobs. Deployments can select global or per-job profiles without defining handlers, identifiers, payloads, or arbitrary cadences.

## 0.131.0

### Minor Changes

- 9848276: Host package-owned product jobs by default in the standard self-hosted Operator. The Node host consumes the resolved job inventory and fixed runtime handlers, adds authenticated payload-free invocation, schedule recovery, per-job overlap protection, bounded retry, and minimal health state.
- dffbdad: Add package-owned product jobs to the resolved deployment graph. Selected
  modules and plugins can declare fixed scheduled or wakeable jobs with named
  runtime exports, while project config and runtime invocation cannot supply
  arbitrary handlers, payloads, or workflow controls.
- f2c9404: Retire the Voyant workflow product and its workflow-runs administration
  surface. Product-owned background behavior is now represented by jobs and
  subscribers, while in-process compensating domain coordination is exposed as a
  saga. Remove workflow deployment providers, graph facets, source conventions,
  runtime composition, and starter scripts.

## 0.130.0

### Minor Changes

- a160a81: Add isolated customer identities, personal and business buyer accounts, live
  buyer selection, immutable booking ownership, and framework-neutral storefront
  auth clients for B2C, B2B, and hybrid deployments.

## 0.129.0

### Minor Changes

- b8b25b7: Add the composable reporting platform: module-owned semantic datasets and widget presets,
  cross-module full-page templates, persisted editable report drafts, immutable published versions,
  bounded query parsing and execution, source-scope authorization, and standard Operator selection.
  Bookings and Finance now contribute initial operational reporting content.

## 0.128.0

### Minor Changes

- f6f22e7: Require independent admin and customer auth secrets, bind provider and bearer identities to their explicit route realm, keep guest checkout capabilities independently configured, and preserve secure cloud-auth state cookies behind TLS termination.

## 0.127.1

### Patch Changes

- 9c06938: Bind managed remote-app OAuth and extension sessions to stable workload environments and per-app contract generations, and allow manifests to disclose publisher-custodied encrypted secrets.

## 0.127.0

### Minor Changes

- 117fa05: Generate managed-deployment contracts from operator-authored default templates and number series without deployment-specific workflows. Add reusable light- and dark-mode horizontal logo and icon assets to Operator Profile, expose them to contract templates, and provide accessible drag-and-drop upload controls. Introduce a shared document-renderer port and zero-code HTTP adapter so managed deployments can use a private platform renderer while self-hosters can swap in their own renderer for contracts and brochures.

## 0.126.1

### Patch Changes

- 07334a7: Split operator and storefront authentication into isolated Better Auth realms,
  add provider-neutral identity adapters, and support managed WorkOS-backed admin
  sessions alongside merchant-configurable customer email and social login.

## 0.126.0

### Minor Changes

- 698ddb6: Add first-class adapter and provider graph-unit kinds while keeping plugin
  manifests recognized for backward compatibility.

## 0.125.2

### Patch Changes

- 3a90c27: Publish the first versioned remote App API surface with app-token routing,
  service-boundary installation and scope checks, custom-field owner isolation,
  finance action approval enforcement, webhook/audit self-read endpoints, and
  runtime app-token resolution.
- 3a90c27: Add remote app OAuth authorization, token, rotation, revocation, and app-token auth context support.

## 0.125.1

### Patch Changes

- 9fc7801: Add remote app OAuth authorization, token, rotation, revocation, and app-token auth context support.

## 0.125.0

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
- 52352c4: Persist custom-field namespace, owner, lifecycle, and provenance metadata.
  Operator definitions use the reserved `custom` namespace, app operations are
  owner-constrained, platform definitions derive ownership from the selected
  target, and Settings renders non-operator definitions as read-only.
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

## 0.124.0

### Minor Changes

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

## 0.123.0

### Minor Changes

- 7e9f77a: Add organization defaults and member overrides for stable admin navigation IDs. Apply visibility
  after selected navigation composition without exposing ineligible routes, inherit hidden parent
  state through navigation subtrees, and retain structural parents only when a child is explicitly
  re-enabled. Ship the persistence, admin API, provisioning seam, and settings UI in standard Operator
  deployments, with duplicate settings contributions normalized at the host and core boundaries.
- 9c85101: Compile one canonical event catalog from selected package manifests and expose it through
  generated deployment artifacts, graph runtimes, a package-owned admin API, and an admin event
  reference page. Reject duplicate event type authorities while preserving legitimate emitters,
  and ratchet persistence mutation coverage in the phase-5 authority checker.

## 0.122.2

### Patch Changes

- 73ab096: Standardize first-party packages on package-owned deployment manifests, provider selection,
  access metadata, concrete event contracts, selected admin navigation, and published runtime
  references. Add Bookings Extras as an independently selected graph unit and remove the central
  admin navigation catalog.
  Link facets now distinguish entity `linkable` metadata from executable `definition` exports, and
  generated Node registries reject malformed definitions before service registration.
  Provider-owned required config and secrets now apply only when that provider is selected, so
  local and in-memory deployments do not require credentials for inactive remote providers.

## 0.122.1

### Patch Changes

- 8d62a7c: Embed TypeScript sources in published JavaScript source maps so consumer dev servers can resolve
  them without the omitted `src` tree. Stop emitting declaration maps that cannot embed their sources,
  and reject publish tarballs whose maps reference sources that are neither packed nor embedded.

## 0.122.0

### Minor Changes

- 07a6ee3: Make `deployment.providers.workflows` authoritative for Node workflow execution and Workflow Runs admin ownership. Self-hosted Operators now use the durable Postgres driver and receive package-owned orchestrator migrations; local mode uses the in-memory adapter, `none` omits workflow composition, and Voyant Cloud fails closed when credentials are missing.

  Scheduled one-shot dispatch disables resident scheduler and time-wheel loops and always shuts down its driver. Managed Cloud snapshots must select `voyant-cloud` before this release is deployed.

  See the [Framework 0.42 migration guide](../docs/migrations/migrating-to-0.42.md) for provider, migration, and rollout steps.

### Patch Changes

- cc85042: Make deployment provider selection authoritative for Node storage, cache, shared
  state, and rate limiting. Replace vendor-specific object-store bindings and R2
  shims with logical media/document stores, a memory provider, an AWS SDK v3
  S3-compatible provider, and package-selected custom adapters. Add a portable
  storage provider conformance runner, resolve adapters from the `storage.object`
  graph provider, and make provider config/secret/resource usage explicit. Keep
  distributed shared state and rate-limit KV authoritative by bypassing the
  cache-only process-local L1, and move guest booking lookups onto the selected
  atomic rate-limit store. Remove the former R2/SigV4 exports.

## 0.121.0

### Minor Changes

- 3f6694b: Select the customer Storefront presentation through the deployment graph. Project resolution now emits a selected presentation factory artifact, and the standard Operator emits Storefront routes only when that presentation is selected.

## 0.120.0

### Minor Changes

- bef5b7c: Remove retired preset lineage metadata from project authoring and resolved deployment graphs.

## 0.119.0

### Minor Changes

- 490d132: Expose the selected graph and runtime-port providers to package runtime factories, then make MCP compose its graph and tool context without Operator-specific wiring.
- 490d132: Add explicit many-valued graph runtime ports and move invoice settlement poller composition into Finance so selected invoicing adapters aggregate deterministically without starter-owned bridges.
- 490d132: Add graph-lowered upgrade and uninstall execution contracts with retry-safe rollback state, explicit resource cleanup, and versioned emitted-event payload schema compatibility validation.
- 047c3f9: Add versioned standard product BOM provenance, inspectable expansion artifacts, and the minimal Node starter contract. Replace the final SmartBill package-ID bridge with its typed Node host port and package-owned runtime, subscribers, and settlement pollers.

### Patch Changes

- 490d132: Move standard cross-package links from the operator starter to package-owned
  manifests and explicit standard-product selections, and generate executable
  links from the selected deployment graph.
- 490d132: Select package-owned Node workflow services through additive graph runtime contributors instead of composing Catalog, Cruises, and DB services in the Operator starter. Notifications keeps its existing package graph bootstrap.
- 490d132: Make package and project declarations the sole selected access authority, removing legacy catalog overlays and runtime synthesis.

## 0.118.0

### Minor Changes

- 8f4c242: Derive anonymous public and transactional path posture from selected deployment graph API bundles, including partial transactional path declarations.
- d771be3: Expose package-scoped project config through the generic graph runtime factory
  context and reuse one typed context across each selected unit's API and
  subscriber facets.
- d26a820: Lower package-owned admin factories from the selected deployment graph into a
  dedicated generated admin bundle, beginning with the action-ledger nav, route,
  lazy page surface, localized Operator label, and standard icon. Selected admin
  factories compose in stable graph-declared order.
- d771be3: Compile selected graph access catalogs, make Bookings the first package-owned access authority, and
  wire exact-pair catalog validation through runtime authorization and permission editors.
- bd7a830: Emit selected-graph OpenAPI documents from route-owned metadata, beginning with
  the identity admin API authority.

### Patch Changes

- 8f537b0: Lower package-owned ordinary subscriber runtime descriptors from the selected deployment graph and move distribution channel-push subscribers out of the Operator hand list.

## 0.117.0

### Minor Changes

- c66f9a5: Add package-owned typed runtime factories and deployment port binding, then migrate storage and realtime away from Operator package-id bindings.

## 0.116.0

### Minor Changes

- 8576451: Remove the legacy core application manifest API so applications use
  `@voyant-travel/framework` `defineConfig` exclusively. Rename standalone
  workflow runtime configuration to `defineWorkflowConfig` and
  `VoyantWorkflowConfig`.

## 0.115.0

### Minor Changes

- e4e6621: Model package-owned Hono extensions as first-class deployment graph units while keeping externally distributed integrations in the plugin lane.
- 953e418: Add the application-local API route authoring contract, method-aware graph metadata, and build-time convention compiler.
- 2153e48: Add unit-level graph runtime references for single-entry application modules and extensions while retaining route runtime fallback.

## 0.114.0

### Minor Changes

- a370024: Accept package, package-subpath, and local-path project selections, retain
  serializable selection config and provenance, and replace admitted selections
  with package-owned `./voyant` manifests.
- e3dc5a9: Generate executable Node schema and setup migration plans with idempotency ledgers, and run the finance voucher backfill through its package-owned setup migration reference.
- e3dc5a9: Add the import-cheap project deployment authoring contract and framework-owned
  project resolver with deterministic target-neutral graph, runtime, and migration
  artifacts for CLI lifecycle commands.
- e3dc5a9: Load package-owned workflow and subscriber runtime references from the selected Node deployment graph, and move the commerce promotion reindex workflow and event filter out of framework-owned catalogs.
- e3dc5a9: Restrict the legacy deployment target hint to the unified Node runtime. Separate edge applications no longer identify Cloudflare Workers as a Voyant deployment target.
- a370024: Add the dependency-light package-owned deployment manifest authoring interface,
  publish the bookings manifest through `./voyant`, and let framework graph
  resolution consume the same contract.
- e3dc5a9: Promote package-owned config, secrets, resources, providers, access, admin, tools, webhooks, actions, setup migrations, and lifecycle metadata into the deployment graph contract.
- e3dc5a9: Add explicit deployment provider selection and lazy, redacted graph provider resolution, with the Node Postgres database provider as the first end-to-end declaration and factory.
- e3dc5a9: Derive the bookings graph action manifest and canonical action-ledger registry
  from one package-owned declaration source, preserving persisted capability
  identity, established graph action names, and policy metadata with an end-to-end
  parity test.

## 0.113.0

### Minor Changes

- 496f2ef: Add the dependency-light package-owned deployment manifest authoring interface,
  publish the bookings manifest through `./voyant`, and let framework graph
  resolution consume the same contract.

## 0.112.3

### Patch Changes

- 425f92e: Add Node-native cache and shared-state providers behind the existing KVStore
  surface, including in-process LRU, tiered Redis/Postgres providers, Postgres
  fixed-window rate limiting, Redis rate limiting, and managed-runtime provider
  selection without KV-shaped binding requirements.

## 0.112.2

### Patch Changes

- 621f989: Allow modules to register workflow and event-filter manifest metadata without importing run-bearing workflow definitions into request-serving apps.

## 0.112.1

### Patch Changes

- 3713e10: Expose a scheduler-scoped event bus to event handlers so inline subscribers can emit nested events without forcing deferrable downstream subscribers onto the caller path.

## 0.112.0

### Minor Changes

- c9a356f: Extend the api-key permission grammar for fine-grained agent operations and carry
  an audience on the key grant.

  - `@voyant-travel/types`: add `cancel`/`refund`/`void`/`publish`/`send` actions and
    `dashboard`/`content`/`media`/`bookings-pii` resources (with descriptor groups);
    PII resources are never satisfied by the `*` wildcard; add `assertKnownPermissions`
    and `API_KEY_GRANT_PRESETS` (a scope subset bundled with an audience).
  - `@voyant-travel/core`: add `audience` to `VoyantAuthContext`.
  - `@voyant-travel/hono`: derive an API key's audience from its grant metadata and let
    the request actor follow it (replacing the hardcoded staff default).
  - `@voyant-travel/auth`: validate permission strings and audience at key-mint time and
    resolve grant presets.

## 0.111.1

### Patch Changes

- 88edbe6: Keep durable event outbox rows tied to subscriber delivery when request schedulers fail after capture.

## 0.111.0

### Minor Changes

- 021ec00: Add vendor-neutral observability primitives (RFC voyant#1553).

  - **Request-id async context** — the `requestId` middleware now stores the correlation id on the `requestId` context variable and runs the request inside an `AsyncLocalStorage`, so any downstream code (services, subscribers, reporters) can read it via the new `getRequestId()` export — no header threading or `Context` access required. Error responses now also carry the `X-Request-Id` header. New exports: `getRequestId`, `runWithRequestId` (from the package root and `@voyant-travel/hono/observability`).
  - **Pluggable error `Reporter`** — `VoyantAppConfig` gains `reporter` and `appName`. Unhandled 5xx exceptions at the `fetch` catch point emit a normalized `{ requestId, app, error, context }` event to the configured `Reporter`, where `requestId` is the same id surfaced to the user. The default is a no-op (zero vendor coupling); a built-in `consoleReporter` is provided, and Sentry/OpenTelemetry backends can be wired as opt-in adapters implementing the exported `Reporter` interface. Capture is best-effort — it never throws and async reporters are flushed via `waitUntil`. New exports: `Reporter`, `ErrorEvent`, `noopReporter`, `consoleReporter`, `safeCaptureException`.
  - **Standard catch points beyond HTTP** — the reporter is now also wired into the non-request runtime catch points the RFC named, so background/async faults aren't an observability blind spot: app **bootstrap** (module/plugin/extension `bootstrap` failures), the **workflow forwarder** (EventBus→driver ingest), and **EventBus subscriber dispatch** errors. `@voyant-travel/core`'s `createEventBus` gains an optional `onSubscriberError(event, error)` hook (the bus stays vendor-neutral; the framework routes it to the reporter). Intentional fail-open paths (cache, metrics, rate-limit, workflow compensation) stay silent by design.

  The framework owns the id, the catch points, and the event shape; the backend stays a deployment choice. Deployments that don't set `reporter` keep the no-op default — the only behavioral change is the new runtime prerequisite below.

  **Runtime requirement (Cloudflare Workers):** the request-id async context uses `AsyncLocalStorage` (`node:async_hooks`), which requires the `nodejs_compat` (or `nodejs_als`) compatibility flag — now on the always-used request path, not just when a `reporter` is configured. This is already standard for Voyant Worker deployments (the operator starter and templates set `nodejs_compat`); Node deployments need nothing. Add `"compatibility_flags": ["nodejs_compat"]` to `wrangler.jsonc` if your Worker doesn't already have it.

## 0.110.0

### Minor Changes

- 98f4a40: Add `@voyant-travel/core/custom-fields` — a typed, validated, visibility-aware extension-field registry for core entities (the "custom fields without forking" seam). Dependency-free (no zod/drizzle):

  - `defineCustomField` / `createCustomFieldRegistry` — declare fields (`entity`, `key`, `type` of text/number/boolean/date/select, `required`, `options`, `validate`, `visibility`, `pii`).
  - `validateCustomFields(registry, entity, input)` — validate a write payload (rejects unknown keys, missing required, wrong type/option, custom rule); returns the cleaned value to persist.
  - `customFieldsVisibleIn(registry, entity, channel)` — fields to surface in `export` (default on) / `invoice` / `search` (default off), so those readers consult the registry instead of dumping or hiding everything.
  - `customFieldsFromGlob(glob)` — discover deployment-local field declarations from a Vite `import.meta.glob` of `src/custom-fields/*`.

  This is the registry primitive; per-entity column adoption (write-validation + export/invoice/search consumption on bookings/people/products) follows. See `docs/architecture/custom-fields.md`.

- 3b27dcc: Custom-fields unification (phase 1a — type model + merge). Grow `@voyant-travel/core/custom-fields` toward one system that absorbs the relationships EAV custom-fields feature (see `docs/architecture/custom-fields-unification-adr.md`):

  - `CustomFieldType` becomes the canonical superset — adds `multiselect` (a subset of `options`, stored `string[]`), `monetary` (`{ amountCents, currency }`, new `CustomFieldMonetaryValue` type), and `json` (arbitrary, also the home for `address`/`phone`). `validateCustomFields` validates each. Purely additive — existing `text`/`number`/`boolean`/`date`/`select` fields are unchanged.
  - `mergeCustomFieldDefinitions(sources, onShadow?)` — dedupes `(entity, key)` across sources, earlier source winning (code-declared before runtime/DB-defined), with a shadow callback. Feed its result to `createCustomFieldRegistry` to build one registry from both a code source and the runtime `custom_field_definitions` table.

  Storage migration (values → entity `custom_fields` jsonb, retiring `custom_field_values`) and the DB-backed registry loader land in the following phases.

- 39d48fe: Custom-fields unification (phase 1b — DB-backed definitions + per-request resolver). The custom-field registry is now resolved per request from two sources, so runtime-defined fields participate alongside code-declared ones (ADR: `docs/architecture/custom-fields-unification-adr.md`):

  - `core`: new `CustomFieldRegistryResolver = (db) => CustomFieldRegistry | Promise<…>` type.
  - `relationships`: `loadCustomFieldDefinitions(db)` reads the runtime `custom_field_definitions` table and maps it to registry definitions (`varchar`→`text`, `double`→`number`, `enum`→`select`, `set`→`multiselect`, `address`/`phone`→`json`; `isSearchable`→`visibility.search`).
  - `bookings`: the `customFields` route-runtime option is now a resolver; the write-validation helper resolves the registry from the request `db` (so it sees both code- and DB-defined fields). The operator wires a resolver that merges its code-declared fields with `loadCustomFieldDefinitions(db)` (code wins), cached per isolate.

  No storage change yet — values still go to the entity `custom_fields` jsonb (booking) / the EAV table (person/org). Subsequent phases add the person/org column, repoint the value API, and backfill `custom_field_values` → jsonb.

## 0.109.0

### Minor Changes

- b7056f1: Transactional-outbox support in the event bus (RFC #1687 Phase 2.1). `EmitOptions` gains `store` (an `OutboxEventStore`): when present, the envelope is persisted BEFORE any handler runs and the row is completed/failed after all handlers settle — a crash mid-delivery leaves a pending row for redelivery instead of a lost event. Duplicate `metadata.eventId`s skip delivery (idempotent capture). New `EventBus.deliver(envelope)` runs all subscribers with per-handler failure reporting (used by outbox drains for redelivery; optional on the interface). `emit` now always stamps `metadata.eventId` (`generateEventId()`, exported) when the caller didn't supply one — additive, and the workflow forwarder's idempotency derivation keys on it.

## 0.108.0

### Minor Changes

- 7255353: `queryGraph` resolves each relation with ONE batched link lookup instead of one `LinkService.list` call per base record — listing 50 products with `category.*` previously fired 50 link-table queries (each a subrequest + roundtrip on Workers + neon-http); it now fires 1. Attach semantics are unchanged: list sides still attach as arrays, non-list sides as object-or-null, target IDs are deduped before hydration, and per-base target order is preserved (rows arrive in the link service's `created_at ASC` order and are grouped locally). To support this, the `LinkService` interface's `list` filter is now the new exported `LinkListFilter` type, which adds optional `leftIds`/`rightIds` arrays (matched as one batched query) next to the existing singular fields — existing implementations remain assignable, but custom `LinkService` implementations and test mocks must handle the plural fields to be queried by `queryGraph`.

### Patch Changes

- 7255353: `Extension` gains an optional `requiresTransactionalDb` flag. Extensions mount under their target module's path prefix, so a transacting extension (e.g. catalog-authoring's compose/duplicate routes under `/v1/admin/products`) must be able to force the transaction-capable db client onto that surface when an app splits db factories per surface.

## 0.107.0

### Minor Changes

- 418fa82: EventBus: handlers now run **in parallel** (behavior change — previously sequential in subscription order; subscribers are independent observers by contract, so one slow handler no longer serializes the rest) and each handler is bounded by a per-handler timeout (`createEventBus({ handlerTimeoutMs })`, default 15s, `false` to disable — on timeout the handler is logged and no longer awaited, not cancelled). New `SubscribeOptions` (`subscribe(event, handler, { inline: true })`) and `EmitOptions` (`emit(event, data, metadata, { schedule })`): when an emitter supplies `schedule`, non-`inline` handlers are handed to it as one promise and `emit()` resolves after the `inline` handlers only — this is how `@voyant-travel/hono` defers subscriber work past the HTTP response. Plugin `Subscriber` gains the matching optional `inline` flag, threaded through `registerPlugins`. Existing call sites are source-compatible (new parameters are optional).

## 0.106.0

### Minor Changes

- eeb23df: Packaged-admin RFC §4.8 (route assembly, increment 1) — framework half of
  `voyant admin generate --routes`:

  - `@voyant-travel/admin` exports `requireAdminRoute(extension, routeId)` (plus the
    `BindableAdminRoute` type): looks up a route contribution by id and asserts
    it carries a component, so generated thin route files fail loudly at module
    evaluation when an extension stops shipping the route they bind.
    `AdminRouteRuntime.fetcher` is narrowed to the string-URL `VoyantFetcher`
    convention every `*-react` data client uses, so host fetchers (and the
    global `fetch`) bind directly into generated loaders.
  - `@voyant-travel/core` manifest grows `admin.routes` (`AdminRoutesConfig`): the
    host route-tree directory and the runtime-import bindings (`apiUrlModule`/
    `apiUrlExport`, `fetcherModule`/`fetcherExport`) the route generator emits,
    with operator-convention defaults. Validated by `validateVoyantConfig`.

  The operator's promotions index route is now generated output of the new
  command (byte-for-byte reproducible from `@voyant-travel/promotions-ui/admin`).

## 0.105.1

### Patch Changes

- 344e7b6: Packaged-admin RFC §5 deletions: the fork-and-own distribution surfaces are
  retired now that all 10 admin domains ship as versioned packages. `@voyant-travel/ui`
  drops its shadcn registry source (`registry/`, `registry.json`, generated
  `public/r/`) and the `registry:build` script — the package's published
  component/export surface is unchanged and remains the only way to consume it.
  `templates/dmc`, `apps/dev`, and the hosted registry worker (`apps/registry`)
  are deleted from the workspace. `@voyant-travel/core` and `@voyant-travel/products-ui`
  only see stale comment/doc references repointed from the deleted surfaces to
  `templates/operator`.

## 0.105.0

### Minor Changes

- c2aef18: Manifest-driven migration schema resolution (#1608).

  - `@voyant-travel/core` `VoyantConfig` gains `additionalSchemas`, `extensions`, and `schemas` fields (with validation) so a template's migrated schema set is derived from `voyant.config.ts`.
  - `catalog`, `flights`, `travel-composer`, and `workflow-runs` declare `package.json#voyant` schema metadata so they resolve into the generated schema manifest (flights pins its non-standard `./reference/local-postgres` subpath).

## 0.104.1

## 0.104.0

## 0.103.0

## 0.102.0

## 0.101.2

## 0.101.1

## 0.101.0

## 0.100.0

## 0.99.0

## 0.98.0

## 0.97.0

## 0.96.0

## 0.95.0

## 0.94.0

## 0.93.0

## 0.92.0

## 0.91.0

## 0.90.0

## 0.89.0

## 0.88.0

## 0.87.1

## 0.87.0

## 0.86.0

## 0.85.4

## 0.85.3

## 0.85.2

## 0.85.1

## 0.85.0

## 0.84.4

## 0.84.3

## 0.84.2

## 0.84.1

## 0.84.0

## 0.83.1

## 0.83.0

## 0.82.1

## 0.82.0

## 0.81.21

## 0.81.20

## 0.81.19

## 0.81.18

## 0.81.17

## 0.81.16

## 0.81.15

## 0.81.14

## 0.81.13

## 0.81.12

## 0.81.11

## 0.81.10

## 0.81.9

## 0.81.8

## 0.81.7

## 0.81.6

## 0.81.5

## 0.81.4

## 0.81.3

## 0.81.2

## 0.81.1

## 0.81.0

## 0.80.18

## 0.80.17

## 0.80.16

## 0.80.15

## 0.80.14

## 0.80.13

## 0.80.12

## 0.80.11

## 0.80.10

## 0.80.9

## 0.80.8

## 0.80.7

## 0.80.6

## 0.80.5

## 0.80.4

## 0.80.3

## 0.80.2

## 0.80.1

## 0.80.0

## 0.79.0

## 0.78.0

## 0.77.13

## 0.77.12

## 0.77.11

## 0.77.10

## 0.77.9

## 0.77.8

## 0.77.7

## 0.77.6

## 0.77.5

## 0.77.4

## 0.77.3

## 0.77.2

## 0.77.1

## 0.77.0

## 0.76.0

## 0.75.7

## 0.75.6

## 0.75.5

## 0.75.4

## 0.75.3

## 0.75.2

## 0.75.1

## 0.75.0

## 0.74.2

## 0.74.1

## 0.74.0

## 0.73.1

## 0.73.0

## 0.72.0

## 0.71.0

## 0.70.0

## 0.69.1

## 0.69.0

## 0.68.0

## 0.67.0

## 0.66.6

## 0.66.5

## 0.66.4

## 0.66.3

## 0.66.2

## 0.66.1

## 0.66.0

## 0.65.0

## 0.64.1

## 0.64.0

### Minor Changes

- 6d0c8f3: Extract `withOptionalTransaction` into `@voyant-travel/db/transaction` so the soft-fallback helper that action-ledger has used since 0.62.0 can be shared by any package that needs it. Add `Module.requiresTransactionalDb` so modules whose write paths use interactive transactions declare it, and have `createApp()` assert on first request that the resolved db adapter supports `db.transaction(async (tx) => …)`. With the neon-http (edge) adapter that assertion now throws an actionable error pointing at `createServerlessDbClient` (neon-serverless / WebSocket) or `createDbClient(url, { adapter: "node" })` — instead of the cryptic "No transactions support in neon-http driver" exception thrown on first write.

## 0.63.1

## 0.63.0

## 0.62.3

## 0.62.2

## 0.62.1

## 0.62.0

### Patch Changes

- 77aad68: Add a transaction-capable Neon serverless database adapter and make action-ledger skip Neon HTTP transactions safely.

## 0.61.0

## 0.60.0

## 0.59.0

## 0.58.0

## 0.57.0

## 0.56.0

## 0.55.1

## 0.55.0

## 0.54.0

## 0.53.2

## 0.53.1

## 0.53.0

## 0.52.4

## 0.52.3

## 0.52.2

## 0.52.1

## 0.52.0

## 0.51.1

## 0.51.0

## 0.50.8

## 0.50.7

## 0.50.6

## 0.50.5

## 0.50.4

## 0.50.3

## 0.50.2

## 0.50.1

## 0.50.0

## 0.49.0

## 0.48.0

## 0.47.0

## 0.46.0

## 0.45.0

## 0.44.0

## 0.43.0

### Minor Changes

- d07215e: Add first-class API token rotation and audit-facing token context. The auth facade now supports `POST /auth/api-tokens/:keyId/rotate`, the React hooks and UI expose rotation, and Hono request context includes `apiTokenId` for downstream audit log writers.

## 0.42.0

## 0.41.3

## 0.41.2

## 0.41.1

## 0.41.0

## 0.40.1

## 0.40.0

## 0.39.0

## 0.38.2

## 0.38.1

## 0.38.0

## 0.37.1

## 0.37.0

## 0.36.0

## 0.35.0

## 0.34.0

## 0.33.1

## 0.33.0

## 0.32.3

## 0.32.2

## 0.32.1

## 0.32.0

## 0.31.4

## 0.31.3

## 0.31.2

## 0.31.1

## 0.31.0

## 0.30.7

## 0.30.6

## 0.30.5

## 0.30.4

## 0.30.3

## 0.30.2

## 0.30.1

## 0.30.0

## 0.29.0

## 0.28.3

## 0.28.2

## 0.28.1

## 0.28.0

## 0.27.0

## 0.26.9

## 0.26.8

## 0.26.7

## 0.26.6

## 0.26.5

## 0.26.4

## 0.26.3

## 0.26.2

## 0.26.1

## 0.26.0

## 0.25.0

## 0.24.3

## 0.24.2

## 0.24.1

## 0.24.0

## 0.23.0

## 0.22.0

## 0.21.1

## 0.21.0

## 0.20.0

## 0.19.0

## 0.18.0

## 0.17.0

### Patch Changes

- 66d722d: Align dependency versions and peer ranges across the workspace to reduce duplicated transitive installs and make consumer `pnpm install` reproducible.

## 0.16.0

## 0.15.0

## 0.14.0

## 0.13.0

## 0.12.0

## 0.11.0

## 0.10.0

## 0.9.0

## 0.8.0

## 0.7.0

## 0.6.9

## 0.6.8

## 0.6.7

## 0.6.6

## 0.6.5

## 0.6.4

## 0.6.3

### Patch Changes

- d3c6937: Add a narrow execution lock surface and use it to serialize worker-driven notification reminder sweeps across processes.

## 0.6.2

## 0.6.1

## 0.6.0

## 0.5.0

## 0.4.5

### Patch Changes

- e3f6e72: Standardize TypeID prefixes to a first-N-chars convention for better DX.

  Root entities now use the shortest unambiguous first-N chars of the entity name
  (e.g. `pers` instead of `prsn`, `org` instead of `orgn`). Child entities use a
  2-char module code plus 2-char suffix. 19 prefixes renamed in total.

## 0.4.4

## 0.4.3

## 0.4.2

## 0.4.1

## 0.4.0

## 0.3.1

## 0.3.0

## 0.2.0

## 0.1.1
