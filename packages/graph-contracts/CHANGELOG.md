# @voyant-travel/graph-contracts

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
