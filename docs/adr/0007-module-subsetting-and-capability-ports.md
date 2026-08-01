# ADR-0007: Module subsetting and required core modules

- **Status:** Superseded by the unified deployment graph (2026-07-12)
- **Relates to:** [consolidated-deployments-rfc](../architecture/consolidated-deployments-rfc.md) (Workstream B / D.1), [ADR-0006](./0006-live-availability-search-contract.md) (capability-gated adapters as precedent), [custom-modules](../architecture/custom-modules.md)
- **Implemented by:** This PR — `createVoyantApp({ exclude })`, `FRAMEWORK_CAPABILITY_GRAPH` (marking the foundational core, incl. CRM, `isRequired`), and the pure `findCapabilityGaps` / `subsetStandardManifest` validators. A pluggable-implementation port (swap a required module for an external one) was considered and rejected for v1 — see Alternatives. Extension-ownership cascade shipped as a follow-up (voyant#2104/#3074); the schema side is decided as no-bundle-partitioning (see Phasing).

> This ADR records the retired runtime-manifest implementation. Standard product
> subtraction, required selections, and extension removal cascades now live in
> `operator-distribution.ts`; package manifests and the resolved deployment graph
> own capabilities and runtime behavior. The framework manifest projections and
> synthetic framework unit generators have been deleted.

## Context

A deployment cannot currently drop or replace a standard module. `createVoyantApp`
always mounts the full `FRAMEWORK_RUNTIME_MANIFEST` and only **appends** the
deployment's local modules (`packages/framework/src/create-app.ts:20-23`,
`packages/framework/src/manifest.ts:11-14`). The D.1 scope froze the standard
profile deliberately to ship Workstream B and punted subsetting to "a later
workstream." This is that workstream.

The forcing use case is **removal**: a deployment that doesn't sell flights (or
trips, or cruises) wants to drop those modules rather than mount dead routes.
*Replacement* — swapping a built-in's implementation for an external system, e.g.
running CRM on HubSpot — was considered and rejected for v1 (Alternatives): it
needs a port + DTO extraction out of `relationships` and a narrowing of every
consumer, a large refactor with no current consumer. Cross-cutting modules like
CRM are instead **required** and extended in place (custom fields).

Two facts from the codebase shape the design:

1. **The mechanism to subset already exists.** `composeFromManifest`
   (`packages/hono/src/composition.ts`) mounts *strictly* what the manifest names
   and throws on a missing factory. Subsetting is "pass a shorter manifest"; the
   registry can stay whole. What is missing is a *safe, config-driven* way to do
   it, and alignment with the schema/migration side.

2. **There are two manifests that can drift.** `voyant.config.ts` `modules` drives
   schema/migration/CLI (`db doctor`, drizzle config), while
   `FRAMEWORK_RUNTIME_MANIFEST` drives runtime mounting. A runtime `exclude`
   un-mounts routes while the monolithic bundle still migrates the dropped module's
   tables — resolved by keeping schema whole + inert and having `db doctor` treat
   it as expected (see Phasing), not by partitioning the bundle.

3. **Some modules can't be dropped safely.** Cross-cutting infrastructure (audit
   ledger, identity, commerce primitives) and CRM are reached by many others, so
   excluding one would break the platform. Without a guard, a bare `exclude` flag
   is a sharper-edged fork: it would boot a broken app. The capability graph marks
   these `isRequired` and turns the mistake into a named boot error.

The model is **default-on with subtract**: built-in modules always mount (the
framework manifest was already designed this way — "a new standard module
auto-joins the default set; the deployment doesn't re-list it"), and a deployment
*removes* what it doesn't run rather than enumerating what it wants. A foundational
core — including CRM — is marked `isRequired` and cannot be removed. Deployments
that need to customize a required module extend it in place (CRM via custom
fields) rather than swapping it. A pluggable-implementation port (swap CRM for an
external system) was considered and **rejected** for v1 as over-engineering — see
Alternatives.

## Decision

The scope is **removal**: a deployment subtracts standard modules it doesn't run;
foundational ones can't be subtracted.

**1. `exclude` removes a module from the default set.** The standard set is the
default; `createVoyantApp` gains one knob:

```ts
createVoyantApp({
  providers,
  exclude: ["@voyant-travel/flights"],   // a module this deployment doesn't run
  modules: deploymentLocalModules,
})
```

`exclude` filters the runtime manifest (and, once the schema side lands, drizzle
generation, so routes **and** tables drop together — `db doctor` validates the
post-subset parity). The registry stays whole; composition mounts strictly from
the manifest, so a dropped specifier simply never builds.

**2. A capability dependency graph, validated at build, makes removal safe.**
`FRAMEWORK_CAPABILITY_GRAPH` marks foundational modules `isRequired`; excluding
one is a **boot error with a named message**, never a runtime 500:

```ts
// FRAMEWORK_CAPABILITY_GRAPH — v1
"@voyant-travel/action-ledger": { isRequired: true }
"@voyant-travel/identity":      { isRequired: true }
"@voyant-travel/commerce":      { isRequired: true }
"@voyant-travel/relationships": { isRequired: true }   // CRM — extend via custom fields
```

`exclude` also throws on a typo (specifier not in the standard set). The graph
type additionally supports `provides`/`requires` capability edges — so that
dropping a depended-on (but non-required) module names its orphaned consumers
rather than 500-ing — but the v1 standard set declares no such edges: every
cross-cutting module is simply `isRequired`. The edges stay available for a future
module that is genuinely optional-with-dependents.

**3. CRM is required, not pluggable.** `relationships` is `isRequired`.
Deployments extend it with persisted custom-field definitions through Settings;
they do not swap it for an external CRM. The cross-module surface a
swap would have to satisfy (person/org read + upsert + travel-snapshot) is small,
but decoupling every consumer (`legal`, storefront customer-portal, the bookings
billing/traveler resolvers) onto a port — and keeping a parallel DTO contract in
sync — is a large refactor whose only payoff is CRM-replacement, which is not a v1
goal. See Alternatives.

## Consequences

- **Removal is safe and config-driven today.** A deployment drops a module it
  doesn't run with one `exclude` line, and a depended-on or required module can't
  be dropped by accident — the graph turns silent runtime breakage into a named
  composition failure listing the unsatisfied consumers.
- **CRM is required, not pluggable.** `relationships` is `isRequired`; deployments
  customize it with custom fields, not by swapping it. This keeps consumers
  (`legal`, storefront customer-portal, the bookings resolvers) free to import
  `relationshipsService` directly without breaking subsetting — no decoupling debt,
  no port to maintain. If an external-CRM requirement ever appears, the seam is
  override-by-capability (Alternatives); it is not built now.
- **Schema for excluded modules stays whole (by design).** The managed migration
  bundle is monolithic and version-pinned, so an excluded module's tables are
  still created but left inert — no routes or admin nav reach them. This keeps the
  fixed-operator and subset paths on the same single-bundle migration model rather
  than partitioning the bundle per subset. `voyant db doctor` treats an excluded
  module's tables as *expected-absent-from-use*, not drift. (Re-selecting the
  module later "just works" with no migration.)
- **Excluding a module auto-drops its augmenting extensions** (voyant#2104,
  shipped). An extension's mount prefix (`ApiExtension.extension.module`) is a
  *path*, not a foreign key to a mounted module's `name` — the standard set
  legitimately contains, e.g., a `proposal` extension that mounts under
  `proposal-versions` with no module of that name — so a name-match "orphan" check is
  unsound. Ownership is therefore *declared* in `FRAMEWORK_EXTENSION_OWNERSHIP`
  (co-located with the manifest), and `subsetStandardManifest` cascades exclusion
  from it: dropping `bookings` also drops `finance/bookings-create-extension`
  (which mounts under `/v1/admin/bookings`) with no need to list it. This runs in
  the core primitive, so every `exclude` caller is safe, not just the managed path.

## Phasing

**This PR (shipped).** `createVoyantApp({ exclude })` filtering the runtime
manifest; `FRAMEWORK_CAPABILITY_GRAPH` with `isRequired` (incl. CRM); validated by
`findCapabilityGaps` + `subsetStandardManifest`.

**Extension cascade (shipped, voyant#2104/#3074).** `FRAMEWORK_EXTENSION_OWNERSHIP`
declares module→extension ownership and `subsetStandardManifest` cascades
exclusion from it, closing the partial-surface-leak above.

**Schema-side (decided — no bundle partitioning).** Rather than feeding `exclude`
into drizzle generation to drop tables, the subset leaves the monolithic bundle
whole and inert (see Consequences); the remaining work is `voyant db doctor`
knowing a subset's unselected-module tables are expected-absent-from-use rather
than drift. Admin-UI subsetting + a stable people-picker contract for a substitute
CRM is a separate, demand-driven follow-up (voyant#2107).

Pluggable-implementation ports (swap a required module — e.g. CRM — for an
external system) are **not** on the roadmap; see Alternatives.

## Alternatives considered

- **`include` allowlist instead of default-on + subtract.** Rejected: it inverts
  the framework manifest's deliberate design ("a new standard module auto-joins
  the default set; the deployment doesn't re-list it"), so every new standard
  module would force every deployment to opt in. Voyant is batteries-included —
  the common deployment runs *most* of the set — so a denylist (remove) plus
  override is little boilerplate for the rare case, where an allowlist is much for
  the common one — the conventional choice for batteries-included modular
  frameworks, where built-ins load out of the box and are never enumerated.
- **Pluggable CRM via a `PeopleDirectory` port (bring-your-own-CRM).** Rejected
  for v1 as over-engineering. It would require extracting a port + a neutral DTO
  contract out of `relationships`, retyping the provider slot, and narrowing every
  consumer (`legal`, storefront customer-portal, the bookings billing/traveler
  resolvers) off direct `relationshipsService` imports — a large, schema-adjacent
  refactor whose only payoff is running an external CRM, which no deployment needs.
  CRM is instead `isRequired` and extended via custom fields. If a real
  external-CRM requirement appears, the seam to add is override-*by-capability*
  (name the capability, auto-displace the default provider — one knob, keyed on
  the capability), not a per-module enable/disable flag.
- **Bare `exclude` flag, no dependency graph.** Rejected: it is the hand-filtered
  `createApp` fork with nicer syntax — still 500s in production when a consumer's
  capability vanishes, and lets a deployment foot-gun out a foundational module.
  The graph (`isRequired` + the optional `provides`/`requires` edges) is the point.
- **Two manifests, sync them by tooling.** Rejected: `db doctor` already exists to
  paper over the drift; a config-time subtract that feeds both removes the drift
  at the source instead of detecting it after.
