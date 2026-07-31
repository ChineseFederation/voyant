# ADR-0016: Modules are components of one deployable; enforce the boundary that already exists

- **Status:** Proposed (2026-07-30). Substantially revised after adversarial review — see
  [Corrections](#corrections-from-review). **Amended 2026-07-31** after the deploy-and-use
  product pivot invalidated part of Decision 3 — see [Amendment](#amendment-the-deploy-and-use-pivot).
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

> **Amended.** This test is weaker than it reads. *Outside the operator graph* and *outside the
> company* are different things, and every consumer it was written to protect turns out to be
> first-party. See [Amendment](#amendment-the-deploy-and-use-pivot) — the rule as stated defends
> the package count rather than questioning it.

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

**Correction (measured after the review): the `*Ref` pattern is sound.** The review
reported it as "undocumented and demonstrably drifted", and the first draft of this decision
repeated that as a correctness hazard. Measuring all 31 mirrors against their owning tables
does not support it:

- **Zero mirrors declare a column their owner does not have.** That is the only difference
  that breaks at query time, and there are none.
- 19 mirrors do differ from their owners, but every difference is the weakening a read-only
  partial view requires. `typeId()` and `typeIdRef()` are *literally* `text()`
  (`packages/db/src/lib/typeid-column.ts:32,70`), so a mirror declaring `text()` has the same
  SQL column and merely omits the primary key and id default — correct, since a mirror must
  not generate ids. The remaining 23 are enum columns mirrored as `text()`, which avoids
  importing the owner's `pgEnum` and reintroducing the very cross-module schema dependency
  the mirror exists to prevent.
- "Two mirrors of one table disagree" is true and benign: they are two partial views, each
  declaring the columns its own module reads.

What the review got right is that the pattern was **undocumented** — no mention in `docs/`,
`AGENTS.md`, or any checker. That is fixed: the convention is described in
`scripts/checks/schema/ref-mirrors.ts` and enforced by `verify:ref-mirrors`, which asserts the
one property that matters — a mirror may declare fewer columns than its owner, never
different ones. It runs strict at zero violations across 31 mirrors.

**Consequence: table privacy is no longer blocked on `*Ref` remediation.** The prerequisite
this decision imposed is discharged. What remains for table privacy is the static-analysis
difficulty described above — `pgSchema().table()`, re-export aliasing, and cross-package
`export *` — which is unchanged and still needs a TypeScript program rather than a grep.

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

## Amendment: the deploy-and-use pivot

*Added 2026-07-31. Recorded here because this ADR is otherwise cited in good faith to defend a
package count the product no longer needs.*

### The product changed

Voyant began as something you **build with**. That proved needlessly complicated, and the product
pivoted to something you **deploy and use** — a cohesive system customised through custom fields,
apps, extensions, and the API/webhook surface, not by compiling against framework packages.
Platform and self-hosters are intended to run the **same image**, differing only by configuration.

### What that invalidates

This ADR justifies the package split on three clauses, of which the first is now wrong:

**Clause 1 — a third-party consumer.** The evidence cited was `plugin-netopia`, `connect-sdk`,
`hisky-connector`, `algolia-adapter`, and `plugin-smartbill`. **Every one is first-party**
(`voyant-travel/*`). The measurement was right; the framing was not — first-party repositories
were counted as external consumers, so "the plugin and connector boundary is load-bearing" is a
statement about our own build coordination, not about a public surface.

**There is exactly one genuine third-party consumer:** `pxmstudio/voyant-smartbill-app`, an
agency-built app. Its declared dependencies and its imports are exactly
`@voyant-travel/admin-extension-sdk`, `@voyant-travel/apps`, and `@voyant-travel/ui` — three
packages, none of them a framework or domain package.

That is stronger evidence than the absence of consumers would have been. The only external party
building on Voyant already restricts itself to the extension surface, unprompted.

**Clause 3 — source-free managed delivery.** Still true, and now carrying nearly the whole
justification: roughly 84 of 110 packages exist because the managed runtime installs them
individually. That is a platform pipeline decision, not an architectural property. If managed
delivery ever consumed a composed image instead, those packages lose their stated reason to exist.

### What survives unchanged

**The monolith conclusion, reinforced.** One resident Node application, modules as components, no
subsetting. The pivot does not change the runtime shape — it removes the last justification for
*distributing* that runtime as 107 separate packages.

Decisions 1, 2, 4, 5, 6 and 7 are unaffected, as are all six checkers built from them. The
boundary rules describe how the code fits together, which is orthogonal to how it is shipped.

### The revised package-ness test

Package-ness should be judged against the **public** surface, which under the pivot is:

| Audience | Surface |
|---|---|
| Platform and self-hosters | the image, config-driven |
| First-party adapters and connectors | build coordination — private registry, monorepo, or git deps |
| Third-party app and extension developers | `admin-extension-sdk`, `apps`, `ui` |
| Third-party Connect connector developers | a contract surface, shape still to be determined |

Plausibly **under ten packages published publicly**, against 107 today.

Superseding work is tracked in [#3976](https://github.com/voyant-travel/voyant/issues/3976). Until
that lands, Decision 3 stands as written for practical purposes — but it should not be quoted as
evidence that the package split is justified by third-party demand, because it is not.

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

1. **DONE** — `dependency-cruiser` encoding decision 2 (browser safety) and the ADR-0002 arrow.
   Strict, no ratchet: 47 packages, zero violations. See Implementation notes.
2. **DONE** — `finance-contracts`'s `drizzle-orm` dependency removed (#3911).
3. **Retire the subsetting narrative** in `packages/hono/src` and the architecture docs.
4. **Re-derive the checker consolidation** by reading all 47, then collapse them under the
   naming convention agreed in #3902 item 1.
5. **DONE** — `*Ref` mirrors measured and found sound; the convention is documented and
   enforced by `verify:ref-mirrors`. No remediation was required.
6. **Table privacy**, now unblocked. The remaining difficulty is static analysis, not the
   mirror pattern.

Connect's ADR-0002 migration (#3898 W3) is tracked separately: `connect-cruises`,
`connect-adapter`, and `plugin-voyant-connect` live in `../connect-sdk`, carry no
`voyant.package.v1` manifest, and none of the checkers added here will see them.

## Implementation notes

Recorded because three of these are the difference between a checker that works and one that
reports success while measuring nothing.

**Workspace `exports` maps point at TypeScript source.** `packages/operations/package.json`
resolves `./validation` to `./src/validation.ts` in-repo (`publishConfig.exports` swaps to
`dist` on publish). dependency-cruiser's resolver will not follow a `.ts` target by default, so
without `enhancedResolveOptions` every cross-package import resolves to **`unknown`**, the graph
dead-ends at the package boundary, and every reachability rule passes vacuously. Verified
directly: before configuring the resolver, `@voyant-travel/operations/validation` resolved to
`unknown`; after, to `packages/operations/src/validation.ts`. Note `symlinks` is rejected by
dependency-cruiser's config schema — the accepted keys are `extensions`, `conditionNames`,
`exportsFields`, and `mainFields`.

**`tsPreCompilationDeps: false` is what implements type erasure.** With it, only dependencies
that survive compilation are in the graph, so `import type` edges are excluded — exactly the
rule this ADR states. Flipping it to `true` silently converts the browser-safety rule into
something much stricter that the codebase does not satisfy.

**`packages/db` is deliberately not in the forbidden set.** The first draft of the rule named it
and immediately produced violations against `packages/db/src/helpers.ts`, which is
dependency-light by design: it imports Drizzle with `import type` only and re-exports its single
value from `@voyant-travel/schema-kit` — "pure, below the data layer", per its own comment.
Naming the package forbids a legitimate entry point. The rule names `drizzle-orm` and `hono` and
lets the graph decide, which is the property we actually care about.

**A `no-unresolvable` rule is part of the boundary, not a nicety.** An import that does not
resolve is invisible to every reachability rule, so it turns a red check green. It earned its
place immediately by catching a stray probe file left behind during development.

**The checker cruises one package at a time.** A single whole-graph reachability pass over all
browser packages exhausts a 12 GB heap. Per-package keeps each graph small, names the offending
package in the failure, and takes ~80s for 47 packages; `--only <pkg>` narrows it to ~5s.

**`scripts/tests/boundary-checker.test.mjs` guards against vacuity.** It asserts the checker
still goes red: a value import reaching Drizzle fails, the same import as `import type` passes,
an unresolvable import fails, and a contracts package importing its runtime sibling fails. A
green `verify:boundary` only means something if it can still fail.

## Corrections from review

Recorded because the first draft was confidently wrong in ways worth remembering.

| Claim | Correction |
|---|---|
| Four ordered tiers, `hono` in Composition | Structurally unsatisfiable — 36 packages depend on `hono`. Foundation layer added. |
| Default Tier 1 + ratchet | Produced ~162 day-one violations, ~75% artefacts of the bad default. |
| Package-ness by three clauses | Cannot reject any package. Restored to clause-1-only for new packages. |
| Tier declared in `package.json` | ~110 patch bumps. Moved to a sidecar. |
| Table privacy is v1-checkable | Defeated by `pgSchema().table()`, re-export aliasing, and cross-package `export *`. Deferred. |
| `*Ref` is a sanctioned escape hatch | Half right. It WAS undocumented, now fixed and enforced by `verify:ref-mirrors`. But the "already drifted" claim, which this ADR repeated from the review, does not survive measurement: zero mirrors declare a column their owner lacks, and every observed difference is the weakening a read-only partial view requires. |
| 22 checkers assert one identical rule | Only 19 overlap; several assert ~15 distinct things. Estimate withdrawn. |
| `verify:v1-package-cleanup` is a ratchet precedent | It is a hardcoded allowlist and currently a no-op. |
| No `VOYANT_GRAPH_*` code expresses prohibition | False; several do. Argument withdrawn. |
| `identity-contracts` is the one prune candidate | It has two consumers. |
| 118 packages | 110; 8 directories contain only `node_modules`. |
| Export subpaths are sprawl | They are the mechanism by which dependency weight is controlled. |
