# @voyant-travel/graph-contracts

## 0.8.0

### Minor Changes

- d3288fb: Publish the generated API clients.

  `@voyant-travel/public-api-client` is typed from the whole composed public
  surface — 138 operations — and the credential picks the type:
  `createPublicApiClient({ publishableKey })` cannot see a secret-only operation,
  so calling one is a compile error rather than a runtime 403.
  `@voyant-travel/admin-api-client` exposes one typed module per admin document
  and refuses a publishable key at construction.

  The public-API key prefix table moves from `@voyant-travel/core` to
  `@voyant-travel/graph-contracts`, which has no dependencies of its own, so a
  client can classify a token without the framework kernel reaching npm. `core`
  re-exports it and every in-repo import is unchanged.

  The hand-written operation layer that used to ship inside
  `@voyant-travel/public-api-client` has moved to `@voyant-travel/public-api-react`.
  It reached into `bookings`, `finance` and `public-api` for runtime schemas,
  which a published package cannot do.

  These stay on 0.x deliberately; the move to 1.x is a coordinated release across
  every package, not a per-package decision.

## 0.7.0

### Minor Changes

- b78b724: Ship the periodic return on contracts in progress and unperformed services as a
  template operators add to their own reports.

  Romanian tour operators file a periodic return on contracts in progress: how
  many, what they are worth in lei, and how much has been collected against them.
  The platform held every structural input and had no report, so assembling one
  month took a full day of reading figures off PDFs.

  It arrives as **one dataset, five widgets and one template** on the existing
  reports surface — not a new page. Custom widgets, saved reports, template
  instantiation and csv/xlsx/pdf export already shipped; what was missing was data
  those widgets could ask for. The only dataset in the repo was invoice-grain, and
  the query language has no joins, so no amount of query authoring could reach
  booking value, service dates and collections at once.

  **`finance.unperformed-services`** is a booking-grain modelled view: contracts
  concluded by period end whose services run on or after period start, with
  collections pre-aggregated and refunds netted. It exposes both readings of an
  "advance" — money against a balance still owed, and all collections on a running
  contract — labelled and side by side, because they differ materially and an
  operator filing a return should choose knowingly. The line list carries one row
  per contract with the rate applied, since an inspector asks about a single
  contract rather than a sum.

  Values come from the rate each contract's own documents were stamped with. A
  contract nothing has stamped reports `null` and the result carries a warning,
  rather than being converted at a rate looked up now — read-time conversion is
  what the FX capture work exists to prevent, and a total that silently omits rows
  reads as complete when it is short.

  Three changes to the reporting feature itself, without which a parameterised
  template is not usable:

  - **Template parameters are descriptors, not names.** `parameters` was
    `string[]`, so nothing could render a period picker: no type, label, default,
    or required flag. It is now `{ id, label, description?, valueType, required,
defaultValue? }`, carried through to the deployment graph — whose validator
    accepts and checks the descriptor shape — and instantiating a template seeds
    its declared defaults so the report opens showing something.
  - **Export accepts parameters from the caller.** The export route passed an
    empty bag, so exporting a different period meant editing and saving the report
    first — leaving it permanently describing whichever period was exported last.
  - **The report builder renders a template's declared parameters.** It knew only
    the reserved `dateFrom`/`dateTo`, so a period-scoped template landed as a
    report whose every widget errored on a missing parameter with nowhere to say
    which period. Declared parameters now render as labelled, typed inputs, and
    the export carries them.
  - **A dataset may own its period.** The page-level date window is one field with
    both bounds; this period is two fields with opposite open bounds. Datasets that
    do not fit it declare no `defaultDateField` and read their own parameters,
    failing when absent rather than silently covering all time. Written up in
    `docs/architecture/reporting-datasets.md`.

  Finance's report query compiler is now shared between both datasets rather than
  copied, so grouping, aliasing and filter rules cannot drift apart one fix at a
  time. What a dataset owns is its relation, its fields and its own answerability
  rule.

  Two known gaps this works around rather than fixes, both filed separately:
  contracts are not first-class (so the count is booking-derived, and every label
  says booking), and "performed" is not modelled (so it is derived from service
  dates, in the dataset, once).

## 0.6.0

### Minor Changes

- 36f3085: Enforce the PK/SK capability line on the public API, and give secret keys scopes.

  `vpk_`/`vsk_` existed at issuance, in storage and on an admin label, and nothing
  branched on them for authorization: no route required a secret key and none was
  denied to a publishable one, so a leaked `vpk_` could commit bookings and open
  payment sessions — bounded only by an `Origin` header, which any non-browser
  client sets freely.

  - Every `/v1/public/*` API bundle now declares `publishable` (and
    `guardedIntake`, for routes that capture person data with nothing challenging
    the submitter). One middleware enforces it, and **an undeclared route is
    secret-key-only** — silence is a denial, not an omission.
  - Every published operation carries `x-voyant-key-kind: publishable | secret`,
    derived from the same declaration the middleware reads.
  - Origin handling is split by kind: a publishable key still requires an origin
    (it is the only thing narrowing where a browser-resident credential may be
    used); a secret key no longer does, so a genuine server-to-server caller can
    use the API without a BFF forwarding a synthetic header. An origin that IS
    presented is still checked, whichever kind sent it. Dynamic CORS applies to
    the publishable path only.
  - A secret key now authenticates `/v1/admin/*` and carries a scope grant in the
    deployment's own access-catalog vocabulary, defaulting to a commerce-shaped
    set at mint. `{"*": ["*"]}` is an explicit opt-in and is called out in the
    admin surface.
  - The `voy_` deployment API key on `/v1/admin/*` is deprecated. It still works
    and now logs on use; close the window with
    `VOYANT_DEPLOYMENT_API_KEY_MODE=disabled`, which stops minting as well as
    authenticating. Admin sessions are unaffected, as are `voy_` keys with a
    customer, partner or supplier audience.

  **Breaking for custom public routes.** A deployment-authored `ApiModule` that
  mounts `/v1/public/*` routes must declare `publishable` for browser clients to
  reach them; without it the routes are secret-key-only. First-party modules are
  already declared. See `docs/architecture/storefront-key-capability-line.md`.

## 0.5.2

### Patch Changes

- 900c452: Keep production runtime-port startup preflight side-effect free while retaining exhaustive behavioral provider verification for CI and release gates.

## 0.5.1

### Patch Changes

- de549da: Allow graph-selected admin modules to expose an import-cheap shell descriptor
  while their route loaders and page implementations remain dynamically loaded,
  and apply the seam to the Operations admin surface.

## 0.5.0

### Minor Changes

- 1e0506f: Add a declarative lazy loading boundary for route-only admin extensions and move
  business-account, custom-field, and webhook settings implementations out of the
  initial operator entry graph.

## 0.4.0

### Minor Changes

- 4f9a097: The retired ledger sources a package absorbed are declared in `package.json`, so
  the source-free managed image can see them.

  A module consolidation moves another package's migration tags under a new ledger
  source name. The ledger is keyed `(source, tag)`, so a database that already
  applied them looks for `availability/0000_availability_baseline` while the plan
  offers `operations/0000_availability_baseline` — nothing matches, and the moved
  baseline re-runs against the tables the retired package built.

  `MigrationSource.legacyNames` is the mapping, and the previous release made it
  authorable as `legacySources` on the graph migration facet. That declaration is
  invisible to the managed image, which is **source-free**: it resolves a module by
  package NAME, reads its committed `migrations/` folder, and never resolves a
  graph. So every deployment carrying the retired history was blocked, and only
  those — a fresh database has nothing to adopt, which is why CI did not see it.

  The declaration therefore moves to package metadata, `voyant.legacyMigrationSources`,
  next to `requiresSchemas` and for the same reason:

  - `loadModuleBundleSource` reads it, so the managed runtime adopts the identities
    without a graph;
  - `buildMigrationPlan` resolves it from the same package record, so the
    graph-driven plan reads one declaration rather than a second one that can drift;
  - `VoyantGraphMigrationFacet.legacySources` is removed — a facet field that only
    half the callers can read is worse than none.

  `verify:migration-cutline` now fails when a source the cutline manifest records
  as absorbed is not claimed by the absorbing package, and when a claimed source
  still ships its own migrations folder.

  Unchanged: this is for a pure ownership move, where the tags carry over
  byte-identical and their content hashes still match. Changed SQL is still
  rejected.

  Fixes voyant#4330.

## 0.3.2

### Patch Changes

- f0da92f: A migration facet may declare `legacySources`, the retired ledger source names it
  absorbed.

  The migration ledger is keyed `(source, tag)`, where `source` is the unscoped
  package name. When one package absorbs another's migration history — a module
  consolidation — the tags move to a new source name, so a database that already
  applied them no longer finds them and re-runs their SQL against objects that
  exist. `legacySources` names the retired sources, and the ledger lookup checks
  all of them.

  Additive and optional: `VoyantGraphMigrationFacet` extends
  `VoyantGraphFacetEntity`, and a manifest that does not declare it behaves exactly
  as before. The underlying alias already existed in
  `@voyant-travel/framework-migrations` (`MigrationSource.legacyNames`); this makes
  it authorable from a package manifest rather than only derivable.

  This is for a pure ownership move, where the tags carry over byte-identical and
  their content hashes still match. Changed SQL is still rejected — absorbing a
  history is not a way past the immutability gate. A migration that supersedes
  several retired tags with one new baseline is a different problem; see
  `SUPERSEDED_LEDGER_IDENTITIES`.

## 0.3.1

### Patch Changes

- 02bffc3: feat(graph-contracts): let a Tool declare the admin write endpoints it fronts

  `VoyantGraphToolDeclaration` gains an optional `adminWrites`, the list of admin
  OpenAPI paths a Tool is the agent surface for.

  Admin write coverage is otherwise inferred from a Tool's name, and that
  inference reads the resource's trailing noun. Two resources whose noun is the
  same word are therefore indistinguishable: `attach_departure_fleet_resource`,
  which links an existing fleet record to one departure, also satisfied
  `/v1/admin/operations/resources` — create, rename and delete of the coach
  itself. Where the colliding word _is_ the noun there is no name that avoids it,
  so the Tool states its endpoints instead. A declaration is exhaustive: a Tool
  that declares covers the resources behind those paths and no others.

## 0.3.0

### Minor Changes

- d432646: Let a composing deployment contribute per-unit runtime options.

  A runtime factory could read everything the graph declared and nothing the host
  knew. That was fine while every option-bearing composition site was called by a
  host that constructed modules itself, and wrong for the deployment shape the
  image standardised on: a graph-composed host had no channel into a unit's
  options at all. The monthly booking allowance is the case that surfaced it — a
  managed tenant whose plan changed mid-process kept the boot-time allowance,
  silently, in the direction that costs money.

  `VoyantGraphRuntimeFactoryContext` gains `hostOptions`: the slice of options the
  deployment supplied for this unit, keyed by stable graph unit id one layer up.
  It is empty when the deployment supplied nothing, so a factory can spread it
  unconditionally, and it is merged into the default factory invocation rather
  than replacing it — a host contributing one option keeps every other default
  and stays on the default path as the package evolves.

  Ports remain the seam for behaviour a package declares it needs from elsewhere
  in the graph; they are declared, typed, conformance-tested, and visible to
  `verify:graph-conformance`. Host options are none of those things and exist for
  what the graph cannot supply at all, because it is a property of the
  deployment's own runtime state. See `docs/architecture/graph-host-options.md`.

  `hostOptions` is required rather than optional on the context, since composition
  always supplies it and a factory should be able to read a field off it without
  guarding. That is breaking only for code constructing the context itself, which
  in this repository is exclusively test fixtures.

## 0.2.0

### Minor Changes

- e4833a1: Make the response-cache posture of a deployment declarable, and report it.

  A route that declares `Cache-Control: public, s-maxage=900` is addressing every
  shared cache at once, but nothing told its author which of them the deployment
  actually has. The standard self-hosted profile selects `cache: "postgres"`, so
  the tier meant to shield the database _is_ the database, with only a per-process
  in-memory cache in front of it whose entries are capped at 60 seconds. Managed
  deployments select Redis and put the Voyant Cloud dispatcher at the edge. The
  two products cached public responses very differently and neither said so.

  `deployment.responseCache` is where a deployment now states how it serves shared
  public responses:

      responseCache: { edge: "declared" | "none" }

  `"declared"` means an HTTP cache in front of the origin honours the route's
  `Cache-Control` — a CDN, a reverse proxy, or the dispatcher. `"none"` means the
  origin is the only shared cache. The field is optional and absent reads as
  `"none"`, never as a tier that might be there.

  It is deliberately not a provider role. Nothing is bound or constructed from it,
  so it has no entry in `VoyantDeploymentProviders` or
  `DEPLOYMENT_PROVIDER_CONTRACTS`. It records the one thing the provider
  selections cannot express — whether anything sits in front of the origin — and
  it travels with the deployment through `defineProject`, the resolved graph, and
  the generated Node artifact.

  The Node runtime reports three postures once at startup, on the console channel
  the generated entrypoint already uses for boot messages:

  - public routes mounted over `cache: "postgres"` with no declared edge tier,
    naming both remedies: a response cache that is not the database, or an edge
    tier the deployment declares;
  - `rateLimit: "memory"`, which keeps counters per process — the runtime cannot
    observe the instance count, so it states the condition rather than guessing
    the multiplier;
  - `sharedState: "memory"`, which is not shared across processes despite the name.

  None of these fail the boot. Every posture is supported; what was not supported
  was the deployment being unable to tell.

  `@voyant-travel/operator-standard` declares `{ edge: "none" }`, which is what it
  already was. Its `cache` provider is unchanged — the point is to make the choice
  visible, not to change it. The guardrail in
  `scripts/check-public-cache-policy.mjs` now asserts that the standard profile
  declares a posture rather than pinning the `cache: "postgres"` literal that kept
  the pattern in place.

  See ADR 0021 section 7 and `docs/architecture/caching-architecture.md` rule 12,
  which documents the two postures a self-hosted deployment can declare to reach
  managed response-caching behaviour without adopting a Voyant-specific component.

## 0.1.0

### Minor Changes

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
