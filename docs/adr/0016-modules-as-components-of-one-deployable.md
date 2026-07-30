# ADR-0016: Modules are components of one deployable; enforce the boundary that already exists

- **Status:** Proposed (2026-07-30). Substantially revised after adversarial review — see
  [Corrections](#corrections-from-review).
- **Relates to:** [#3898](https://github.com/voyant-travel/voyant/issues/3898),
  [#3902](https://github.com/voyant-travel/voyant/issues/3902),
  [ADR-0002](./0002-contract-packages.md) (contract packages — upheld),
  [ADR-0007](./0007-module-subsetting-and-capability-ports.md) (superseded — this ADR records
  the consequence),
  [unified-deployment-graph](../architecture/unified-deployment-graph.md),
  [module-provider-plugin-taxonomy](../architecture/module-provider-plugin-taxonomy.md),
  [packaged-admin-rfc](../architecture/packaged-admin-rfc.md),
  [managed-profile-runtime](../architecture/managed-profile-runtime.md)

## Context

The package-per-module layout was adopted on the premise that **deployments would select
modules**. That premise no longer holds:

- One starter remains; `starters/federated-operator` is absent from `pnpm-workspace.yaml` and
  contains only `dist/` and `node_modules/`.
- `exclude` is not a member of `CreateVoyantAppConfig` at all
  (`packages/framework/src/create-app.ts:19-27`) — the option was deleted, not merely unused.
  Residual prose survives at `packages/hono/src/composition.ts:111,131`.
- ADR-0007 is superseded; its runtime-manifest implementation and synthetic unit generators
  were deleted.
- `packages/framework/src/operator-distribution.ts` is a one-line re-export.
- `unified-deployment-graph.md` states the outcome: *"lowered to one resident Node application."*

Enforcement was attempted imperatively and per-module: **47 scripts matching `*authority*`,
5,578 lines**, chained into a 62-link `&&` chain in `verify:architecture`, written against
hardcoded package arrays. **38 of 47 assert via `.includes()` substring matching on source
text; none reads the resolved graph.** That approach does not generalise — a new module means a
new script.

There are **110 real packages** (118 directories, 8 of which contain only `node_modules`).

### What the codebase already does right

The original draft of this ADR proposed inventing a boundary. That was wrong: **the boundary
already exists, is consistently followed, and currently has zero violations.** It operates at
**entry-point granularity**, not package granularity.

- Contracts packages hold the pure schemas and types.
- Runtime packages re-export them through dependency-light subpaths —
  `flights/contract/types` → `flights-contracts`, `legal/contracts/validation` →
  `legal-contracts`, `bookings/validation` → `bookings-contracts`.
- Browser-bound packages (`-react`) **value-import only those light subpaths**, and use root
  barrels only for `import type`.

Measured across `packages/*-react`: **31 value imports, every one resolving to a genuinely
dependency-light entry point**, verified by walking each entry point's runtime module graph
with erased `import type` edges excluded. **Zero browser-unsafe value imports.** No `-react`
package contains `pgTable`, Hono, or Drizzle.

The concept is already named in the tree. `packages/db/src/helpers.ts`:

> `booleanQueryParam` now lives in `@voyant-travel/schema-kit` (pure, below the data layer).
> Re-exported here to keep the `@voyant-travel/db/helpers` import path stable.

This ADR therefore **codifies and enforces an existing convention** rather than imposing a new
model. That is a smaller, cheaper, and more honest change.

## Decision

### 1. Layers, with a Foundation that everything may use

Packages fall into five layers. Crucially — and unlike the first draft — **Foundation is
depended upon by every other layer**, so the ordering is not a simple descending chain.

| Layer | Contents | May depend on |
|---|---|---|
| **Foundation** | `hono`, `core`, `db`, `utils`, `types`, `i18n`, `react`, `schema-kit`, `templating`, `runtime-core` | Foundation |
| **Contracts** | `*-contracts` — pure schemas, types, vocabularies | Foundation, Contracts |
| **Domain runtime** | tables, services, routes, workflows | Foundation, Contracts, Domain runtime |
| **Presentation** | `*-react`, `ui`, admin surfaces, extension SDK | Foundation, Contracts, Presentation |
| **Composition** | `framework`, `operator-standard`, `runtime`, the starter | everything |

A Foundation layer is not optional. **36 packages declare a dependency on
`@voyant-travel/hono`** — a package that owns routes cannot avoid the HTTP kernel. The first
draft placed `hono` in Composition, which made its own headline invariant structurally
unsatisfiable by every domain package in the repo.

This layer map is **coarse classification for reporting and for the ADR-0002 arrow**. It is
deliberately *not* the load-bearing runtime invariant — that is decision 2.

### 2. The load-bearing invariant: browser safety, computed at entry-point granularity

> **A browser-bound package may not, through value imports, transitively reach Drizzle, Hono,
> or `@voyant-travel/db` runtime. Type-only imports are unrestricted — they are erased and
> contribute nothing to a bundle.**

Properties that make this the right rule:

- **It is computed, not declared.** An entry point's weight is derived by walking its runtime
  module graph. No per-package authoring, no 110-manifest migration.
- **It is at the correct granularity.** `@voyant-travel/operations/validation` is light while
  `@voyant-travel/operations` is not; a package-level rule cannot express that, and the
  codebase already relies on the distinction.
- **It ships strict on day one at zero violations** — a regression guard, not a migration.
- **It targets real harm.** Bundle weight and browser incompatibility are concrete; abstract
  layer ordering is not.

The layer map of decision 1 additionally yields the ADR-0002 arrow as a static rule: a
`*-contracts` package must not depend on its runtime sibling.

### 3. Package-ness: the gate binds on new packages only

A **new** `packages/*` entry requires a **named consumer outside the operator graph** — a
plugin, connector, adapter, edge worker, admin extension, or sibling repo — stated in the PR
description.

Existing packages are grandfathered by **source-free managed delivery**
(`packaged-admin-rfc.md`: *"there is no source-installed layer anymore"*;
`voyant-operator-runtime` installs 87 published packages at 86 exact pins).

The first draft offered that delivery clause as a general test. It is not one: it covers 84 of
110 packages, and any new module satisfies it the moment it is wired into the graph. **A rule
that cannot reject anything is not a rule.** Issue #3898 W4 proposed the narrower gate; this
ADR restores it.

### 4. Use off-the-shelf tooling where it fits

Adopt **`dependency-cruiser`** for the import rules in decisions 1 and 2. It provides
TypeScript-resolver-accurate module resolution (so it follows `export *` and `exports` maps
correctly), a `dependencyTypes: ["type-only"]` discriminator — which decision 2 requires — and a
generated `known-violations` baseline.

The first draft cited *"no generic dependency-boundary tooling is installed"* as evidence that
bespoke tooling was needed. That is evidence for the opposite conclusion. Bespoke work is
reserved for rules no general tool expresses.

Note also that the repo has **no ratchet precedent**: `scripts/check-v1-package-cleanup.ts:51-83`
is a hardcoded 30-row allowlist inside the script, and `--fail-on-temporary` is an
all-or-nothing flag rather than a decreasing counter. Every listed package has since been
removed, so it is currently a no-op. Building a ratchet is new work, not a reuse.

### 5. Declarations live in a sidecar, not `package.json`

Any classification that must be declared goes in a sidecar (`voyant.boundary.json`, excluded
from `files`) rather than in `package.json#voyant`.

`.husky/pre-commit` requires a changeset for any changed published package, so editing ~110
manifests is **~110 patch bumps** — the notification flood that caused global lockstep to be
abandoned, and the same hazard #3902 item 5 identifies for adding `description` fields. A
sidecar has zero release cost and lets a misclassification be corrected without a semver event.
It also avoids a full cold rebuild via Turbo's `$TURBO_DEFAULT$` inputs.

### 6. Two runtime shapes, not three

**Operator** — one resident Node app, whole graph, no subsetting. **Edge apps** (storefront,
federated, portal, site) — Workers consuming light entry points and the storefront SDK. Remove
the residue of the third, phantom shape from `packages/hono/src` and the architecture docs.

### 7. Substitution lives at adapters and providers, permanently

Ports exist where a vendor exists: payments, connectors/fulfillment, indexer/search, storage,
notifications, cache, database. **No ports for business modules.** A standing rule, not a
deferral.

### 8. Table privacy is DEFERRED, and the `*Ref` pattern must be fixed first

The first draft made table privacy the v1 deliverable, on the grounds that tables are
mechanically identifiable and the `*Ref = pgTable(...)` pattern is a sanctioned escape hatch.
Both premises fail inspection.

**Not statically decidable as specified:**
- 9 tables are declared via `pgSchema("customer_auth").table(...)`
  (`packages/db/src/schema/iam/customer_auth.ts`), which a `pgTable(` rule silently exempts.
- Tables are re-exported under different names —
  `packages/operations/src/places/index.ts:64-76` exports `facilities as places`. A
  name-matching checker finds no `pgTable("places")` anywhere.
- `packages/operations/src/schema.ts:1` is `export * from "@voyant-travel/availability/schema"`
  — a star export *across a package boundary*, so a checker must resolve a third package's
  `exports` map mid-chain to determine ownership.
- Of 464 `pgTable` textual matches, 17 are JSDoc lines and 31 are `*Ref` mirrors.

This requires a full TypeScript program with export-star flattening and *type*-based
identification, not a grep.

**And the prescribed remediation is unsafe.** The 31 `*Ref` mirrors are undocumented — zero
mentions in `docs/`, `AGENTS.md`, or any of the 125 `scripts/check-*` — and have already
silently diverged from their sources:

- `priceCatalogsRef` (`bookings/src/pricing-ref.ts:4`) is missing 4 columns versus
  `commerce/src/pricing/schema-catalogs.ts:16`, and types `catalogType` as `text()` where the
  owner uses an enum with a default.
- `availabilitySlotsRef` (`bookings/src/availability-ref.ts:15`) is missing `itineraryId`, two
  FKs, and nine indexes versus `availability/src/schema-core.ts:102`.
- **Two mirrors of the same table disagree with each other**: `productExtrasRef` in
  `storefront/` is missing 6 columns that the `bookings/` mirror has.
- `bookings/src/availability-ref.ts:9` cites `scripts/check-retail-spine-closure.mjs` as its
  enforcement; that script only reads `package.json` dependency lists and has no knowledge of
  the pattern.

Directing ~137 cross-package table import sites into a hand-maintained mirror pattern that
already disagrees with itself would institutionalise silent schema drift. **Prerequisite:**
either generate `*Ref` declarations from the owning table with a drift check, or abandon the
pattern and make the service call the only sanctioned route. Table privacy is revisited after
that lands.

## Capability tokens cannot carry layer semantics

Settled by inspection; three independent reasons.

1. **Wrong logical shape.** `validateCapabilityClosure`
   (`packages/framework/src/deployment-graph.ts:4199`) computes
   `providers = new Set(units.flatMap((unit) => unit.provides.capabilities))` and checks subset
   membership. That is *existential* — "something provides this." A layer rule is *pairwise and
   directional*. A `tier.1` token would assert only that something in the graph is Tier 1,
   which is always true.
2. **Wrong input domain.** Capabilities are declared per graph *unit* and evaluated over
   *selected units at composition time*. `VoyantGraphPackageMetadata` carries `requires?` but no
   `provides` at all. The rule must be evaluated against the static import graph, which the
   resolver never reads.
3. **Attribution is destroyed downstream.** The resolved artifact flattens to
   `capabilities: { provided: string[], required: string[] }` — a union with no record of which
   unit provided what.

The correct precedent is `requiresSchemas`: declared per package, validated as canonical
package names (`packages/framework/src/project-resolver.ts:1251`), and consumed as a
cycle-guarded DAG (`packages/framework-migrations/src/discover.ts:143`). **32 packages declare
it.** Per decision 5, however, new boundary declarations go in a sidecar rather than alongside
it.

> A fourth argument in the first draft — that no `VOYANT_GRAPH_*` code expresses prohibition —
> was **wrong** and is withdrawn. `VOYANT_GRAPH_PACKAGE_SOURCE_UNADMITTED`
> (`deployment-graph.ts:4474`), `VOYANT_GRAPH_RUNTIME_PACKAGE_UNADMITTED`, and
> `VOYANT_GRAPH_MANIFEST_OWNERSHIP_MISMATCH` are all prohibition-polarity.

## Consequences

- **The v1 deliverable is a regression guard at zero violations**, not a migration. It ships
  immediately and strictly.
- **No manifest migration and no release wave** — weight is computed and declarations are
  sidecar-only.
- **Package count is not the deliverable.** Realistic pruning is small, and the four packages
  with genuinely zero in-repo dependents are `charters-react`, `observability-sentry`,
  `plugin-sanity-cms`, and `storefront-sdk` — not `identity-contracts`, which is consumed via
  `export *` at `packages/identity/src/validation.ts:1`.
- **Checker consolidation proceeds, but its size is unknown.** The first draft's "22 scripts
  assert one identical rule" does not survive reading them: only 19 mention both
  `runtime-contributor` and `deployment-resources`, and
  `scripts/check-catalog-runtime-authority.mjs` asserts roughly fifteen distinct things
  including verbatim source-text pins and `pnpm-lock.yaml` content. 36 of 47 contain
  absence pins interleaved with other checks, so the categories overlap rather than partition.
  **The consolidation estimate must be re-derived by reading all 47**, and the residual is
  larger than "~8 checks."
- **ADR-0002 is upheld and finally enforced.** `finance-contracts` declaring `drizzle-orm`
  (`packages/finance-contracts/package.json`) is a conformance defect to fix, not a
  counterexample.
- The managed-delivery dependency is explicit: if source-free delivery changes, the
  grandfathering rationale for ~84 packages needs rewriting.

## Alternatives considered

**Full module isolation with substitution ports.** Rejected, restating ADR-0007: *"decoupling
every consumer onto a port — and keeping a parallel DTO contract in sync — is a large refactor
whose only payoff is CRM-replacement, which is not a v1 goal."* Isolation buys substitution;
there are no substituters for business modules.

**Package-granular ordered tiers** (the first draft). Rejected: structurally unsatisfiable
without a Foundation layer, and at the wrong granularity — the real invariant lives at entry
points.

**Collapse to a single package.** Rejected; the publishing boundary is load-bearing for
source-free managed delivery and for version-pinned third parties.

**Status quo.** Rejected; the checker count grows linearly with modules and does not catch the
defect class it exists to prevent.

## Sequencing

1. **`dependency-cruiser` with a generated baseline**, encoding decision 2 (browser safety) and
   the ADR-0002 arrow. Strict, no ratchet needed for decision 2 — it is already clean.
2. **Fix `finance-contracts`'s `drizzle-orm` dependency.**
3. **Retire the subsetting narrative** in `packages/hono/src` and the architecture docs.
4. **Re-derive the checker consolidation** by reading all 47, then collapse them under the
   naming convention agreed in #3902 item 1.
5. **`*Ref` remediation** — generate-and-drift-check, or abandon the pattern.
6. **Table privacy**, only after step 5.

Connect's ADR-0002 migration (#3898 W3) is tracked separately: `connect-cruises`,
`connect-adapter`, and `plugin-voyant-connect` live in `../connect-sdk`, carry no
`voyant.package.v1` manifest, and none of the checkers added here will see them.

## Corrections from review

Recorded because the first draft was confidently wrong in ways worth remembering.

| Claim | Correction |
|---|---|
| Four ordered tiers, `hono` in Composition | Structurally unsatisfiable — 36 packages depend on `hono`. Foundation layer added. |
| Default Tier 1 + ratchet | Produced ~162 day-one violations, ~75% artefacts of the bad default. |
| Package-ness by three clauses | Cannot reject any package. Restored to clause-1-only for new packages. |
| Tier declared in `package.json` | ~110 patch bumps. Moved to a sidecar. |
| Table privacy is v1-checkable | Defeated by `pgSchema().table()`, re-export aliasing, and cross-package `export *`. Deferred. |
| `*Ref` is a sanctioned escape hatch | Undocumented and already drifted; two mirrors of one table disagree. Must be fixed first. |
| 22 checkers assert one identical rule | Only 19 overlap; several assert ~15 distinct things. Estimate withdrawn. |
| `verify:v1-package-cleanup` is a ratchet precedent | It is a hardcoded allowlist and currently a no-op. |
| No `VOYANT_GRAPH_*` code expresses prohibition | False; several do. Argument withdrawn. |
| `identity-contracts` is the one prune candidate | It has two consumers. |
| 118 packages | 110; 8 directories contain only `node_modules`. |
| Export subpaths are sprawl | They are the mechanism by which dependency weight is controlled. |
