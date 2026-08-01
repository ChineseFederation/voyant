# RFC: Consolidated deployments — deployment-as-config with a seamless upgrade path

- **Status:** Draft
- **Author:** Platform
- **Date:** 2026-06-16
- **Related:** `api-route-ownership-and-composition.md`, `api-route-authoring.md`, ADR-0001 (tenant scoping), [unified-deployment-graph.md](./unified-deployment-graph.md)

> Update: [unified-deployment-graph.md](./unified-deployment-graph.md)
> consolidates the later deployment/profile RFC design notes into the scoped
> explicit-graph plan. Treat it as the controlling document for the v1 graph
> resolver, facet cut, diagnostics model, and phase sequence.

## Summary

Today every client project is a **fork** of `apps/operator`. The fork carries hand-wired framework glue (the composition registry, the admin nav/icon/destination maps, deployment-generated migrations), so upgrading Voyant means a manual merge of that glue per client — and it silently drifts.

This RFC proposes inverting the relationship: the **framework becomes a versioned application** that a deployment consumes through three stable contracts — **config, injected providers, and extensions** — and the deployment owns no framework glue. The result:

- **80% "standard" clients** upgrade by bumping package versions and running migrations. No code merge.
- **20% "custom" clients** layer their customizations through defined extension seams (`src/modules`, `src/api`, `src/admin`, `src/links`, custom fields) and reconcile only *their own* code on upgrade — never framework internals.

The model is the prevailing config-driven, package-owned-module backend-framework pattern, adapted for Voyant's three hard constraints: **Cloudflare Workers** (build-time composition, not Node runtime resolution), **Drizzle** (no cross-package migration discovery out of the box), and **changesets** (already in use).

This RFC supersedes part of the "no central assembly package" decision: that decision correctly rejected a package that *baked provider choices* and shoveled runtime files bottom-up. This proposal keeps providers **injected** (the card-payment / connector seams already shipped) — what moves into versioned packages is the *config-driven assembly*, never the provider choices.

## Goals

1. A standard deployment is **config + provider wiring only** — no hand-maintained composition, nav, or migration glue.
2. Upgrading a standard deployment is `bump versions → migrate → doctor`, with **no merge of framework-owned files**.
3. Custom deployments extend through **first-class seams**, never by editing framework-owned files, so their upgrade path is the standard one plus *their* deltas.
4. Provider specifics (Netopia, connectors, storage) stay **injected** and deployment-owned.

## Non-goals

- Multi-tenancy in-process. Per ADR-0001, one DB + one runtime per client stays. "Not a fork" ≠ "multi-tenant"; it means the per-client deployment is a thin config consumer, not a framework copy.
- Removing the ability to self-host a fully custom stack. The fork remains *possible*; it stops being *mandatory*.

## Where we are today (grounded)

| Concern | Current state | File |
| --- | --- | --- |
| Config manifest | Already config-shaped: `deployment`, `projectConfig`, `admin`, `modules`, `plugins`, `additionalSchemas`, `featureFlags` | `apps/operator/voyant.config.ts` |
| Composition | Hand-written manifest + registry + `buildOperatorCapabilities()` in the deployment | `apps/operator/src/api/composition.ts` |
| Providers | **Injected** via clean seams (card-payment `CardPaymentStarter`, flight connector) | `runtime/card-payment.ts`, `packages/finance/src/card-payment.ts` |
| Admin routes | **Generated** from the manifest by `voyant admin generate --routes` | `src/admin.routes.generated.tsx` |
| Admin destinations | **Generated** by `voyant admin generate --destinations` | `src/admin.destinations.generated.ts` |
| Admin extension factories | **Generated** | `src/admin.extensions.generated.ts` |
| Admin chrome (remaining) | **Hand-wired**: nav icon map + label keys (`route.tsx`) + route message providers (`admin-extensions.tsx:190`) | `src/routes/_workspace/route.tsx`, `src/lib/admin-extensions.tsx` |
| Schemas | **Derived** from `voyant.config` → `drizzle.schemas.generated.ts` (drift-checked) | `apps/operator/drizzle.config.ts` |
| Migrations | **Package-owned** and selected by the admitted graph; the external CLI executes the generated migration plan | package manifests, `.voyant/migration-plan.generated.json`, `voyant migrate` |
| Versioning | changesets with **per-domain `fixed` groups** (`[module, module-react]`); domains version independently | `.changeset/config.json` |
| Drift guard | `voyant db doctor --fail-on-drift` gates CI (manifest resolvability, schema parity, generated-manifest freshness, duplicate prefixes, link-table snapshot) | CLI, `schema-discipline.md` |

The foundation is much further along than the "fork" framing suggests: config, schema derivation, **route + destination + extension-factory generation**, provider injection, and a CI-gating doctor already exist. The remaining gaps are narrower than first stated and concentrate in **the last hand-wired chrome (icons/labels/message-providers) + `src/admin` discovery**, **migration ownership**, and **version/assembly consolidation**.

## Target model

The deployment shrinks to its identity — config, the providers it chose, and the 20% it added:

```ts
// the entire standard deployment, conceptually
export default createOperatorApp({
  config:     voyantConfig,                                  // branding, locale, modules, flags
  providers:  { card: netopiaCardStart, storage: r2(env), flights: demoConnector(env) },
  extensions: [],                                            // 20% custom — never framework-owned files
})
```

`createOperatorApp` is a **versioned framework package**. It reads `config` to assemble the standard module set (the registry that lives in `composition.ts` today moves here), derives the admin chrome from module-shipped metadata, mounts the generated routes, and wires the deployment's injected providers and extensions. The deployment file becomes ~20 lines and contains no glue that can drift.

## Workstreams

Five workstreams, ordered later by risk and dependency.

### A. A standard product distribution package (NOT global lockstep) — *cheap, decision-led*

**Goal:** a deployment tracks one **framework version** and upgrades atomically, with no per-package compatibility matrix.

**Do NOT use global lockstep.** Forcing every runtime package to the same version requires **republishing unchanged packages** on every release (to bump their number). npm then fires a publish-notification email per package, so a one-line fix produces 100+ emails to every dev. This was tried in Voyant and abandoned — the per-domain `fixed` groups (`[module, module-react]`) exist precisely to avoid it. Collapsing them into one global group walks straight back into the spam; it is **rejected**.

**Use a BOM / meta-package instead** (the Spring/Angular pattern):

- Keep runtime packages **independently versioned** — only *changed* packages republish, so a finance fix is ~2–3 publishes, not 100+. No spam.
- Publish **one thin meta-package** — e.g. `@voyant-travel/framework@X` — whose only content is pinned `dependencies` on the exact tested runtime set:
  ```json
  { "name": "@voyant-travel/framework", "version": "2.4.0",
    "dependencies": { "@voyant-travel/bookings": "0.119.4", "@voyant-travel/finance": "0.104.22", "...": "..." } }
  ```
- A deployment depends on the **meta version only**; `voyant upgrade` bumps it, transitively pinning the whole known-good set. The compatibility matrix is resolved *inside* the BOM — the deployment never sees it.

**The membership set is mechanically defined** from the canonical authored standard Operator distribution and each selected workspace package's `voyant.package.v1` metadata. It is not emitted as a checked-in resolver input. The `check-lockstep-membership` gate verifies authored selections against workspace metadata and prevents generated discovery catalogs from returning, while `generate-standard-product-distribution.mjs` derives `@voyant-travel/operator-standard` publish dependencies from the standard product declaration and its recursive manifest-reference closure.

**Release tooling:** at release time the BOM's `dependencies` are regenerated from the authored distribution and workspace manifests at each package's just-published version, and the BOM version bumps. This generated package metadata is output-only and is never consulted by graph resolution. Only the BOM + actually-changed packages publish — no per-package republish, no spam.

**Effort:** low–medium (the membership checker exists; add BOM generation to the release pipeline + a `voyant upgrade` that bumps the meta).

### B. `createOperatorApp(config, { providers, extensions })` — *medium*

Move the standard composition (`OPERATOR_RUNTIME_MANIFEST` + `operatorComposition` registry) out of the deployment and into a versioned framework package, **driven by `voyant.config`**. `buildOperatorCapabilities()` splits cleanly:

- **Config-derived** wiring (which modules, mount order, surfaces) → framework, derived from `config.modules`.
- **Provider/deployment** wiring (db, env, KMS, the injected `CardPaymentStarter`, connectors) → stays in the deployment, passed as `providers`.

**Ownership classification (prerequisite, not an afterthought).** The registry today contains many deployment-local families under `operator/*` — e.g. `operator/mcp`, `operator/invitations`, `operator/catalog-booking`, `operator/catalog-content`, `operator/media`, `operator/payment-link`, `operator/operator-settings`, `operator/contract-document`, and extensions `operator/booking-schedule-extension`, `operator/proposal-version-snapshot-extension`, `operator/booking-maintenance-extension`, `operator/action-ledger-health-extension`, `operator/proposal-extension`, `operator/catalog-offers-extension`, `operator/catalog-checkout-extension`. Before any relocation, each registry entry must be classified:

- **Standard framework module** — belongs to a package, becomes part of the `createOperatorApp` default set (e.g. payment-link, contract-document, media if they generalize).
- **Deployment-local extension** — operator-specific wiring that stays in the deployment and is passed via `extensions` (e.g. `operator/invitations` Better-Auth glue, `operator/operator-settings`).

Produce this classification table as the **first deliverable of Workstream B**. Relocating before classifying is exactly how operator-specific choices get baked into the framework package — the failure mode this RFC exists to avoid.

This is *not* the rejected "kit": providers are injected, not baked, and the assembly is config-driven rather than a bottom-up file dump. Keep composition **build-time** (Workers constraint — see E).

**Effort:** medium. The manifest/registry already exist; this relocates and parameterizes the *classified-as-standard* subset.

### C. Admin chrome derivation + `src/admin` discovery — *medium*

**Current (corrected):** admin **routes, destinations, and extension factories are already generated** (`admin.routes.generated.tsx`, `admin.destinations.generated.ts`, `admin.extensions.generated.ts`). The remaining hand-wired surface in `src/routes/_workspace/route.tsx` is narrow: the **nav icon map**, the **i18n label keys** passed to the extension factory, and the **route message providers**. So this workstream is mostly *finishing* an existing trajectory, not building it.

**Target (remaining gaps only):**
1. **Modules ship the last metadata** — nav icon + label key (+ message provider) move into each module's packaged admin metadata so they're generated like destinations/extensions already are. Adding a module to `config.modules` then auto-contributes its full nav entry; the icon map and label list leave `route.tsx`.
2. **`src/admin/` discovery for the 20%** — custom admin pages (UI routes with `{ label, icon }` config) and widgets (injected into named zones) auto-discovered from the deployment's `src/admin/`, mirroring the existing generated mechanism. Nav for custom pages is derived from their config, never hand-registered.
3. **Checker hardening** — extend `voyant db doctor`/`admin generate` drift checks so a module present in `config.modules` but missing an icon/label/destination (or vice-versa) fails CI. This is what makes upgrades safe: a new upstream domain can't silently vanish from the nav.

**Effort:** medium, trending low — the generated-routes/destinations/extensions machinery already proves feasibility; this extends it to the last metadata + a `src/admin` discovery pass + checker coverage.

### D. Versioned migrations — app-owned bundle first, package-owned later — *hard (the crux)*

This is the section that decides whether "seamless upgrade" is real, and the one delta the reference framework gets for free from its ORM that Voyant must **build** on Drizzle. It is staged into a low-risk first step and a heavier, optional second step.

**Current:** the deployment generates one combined migration folder + journal from the *aggregate* schema (module closures + `additionalSchemas` + starter-local `schemas` + the **deployment-generated cross-module link tables**). Upgrading a module changes its schema, but new migrations do **not** ship with the deployment's framework dependency — the *fork* regenerates. That fork-regeneration is the upgrade tax.

#### D.1 — App/framework-owned aggregate migration bundle (recommended first step)

Do **not** start with per-module migrations. The lower-risk move that removes the fork upgrade tax while **preserving the current single-history discipline**: the versioned `createOperatorApp` **standard profile ships one aggregate migration history** (generated from the standard profile's aggregate schema, exactly as today — just *owned and shipped by the framework package* instead of regenerated in each fork). A standard deployment applies the framework's bundled migrations, then its own `src/migrations`.

- **Single history is preserved** (#1608's model stays intact); only *ownership* moves from the fork to the framework package. This is a **lighter amendment** to `migration-resilience-rfc.md`, not a replacement of its model.
- **Scope:** clean for the **standard profile's fixed module set**. A deployment that mounts exactly the standard modules upgrades by bumping the framework version and applying the shipped bundle. Custom deployments apply framework-bundle-first, then `src/migrations`.
- **Limitation (the honest edge):** because the bundle is generated from a *fixed* aggregate schema, a deployment that **adds or removes modules** (diverges from the standard profile) has an aggregate that no longer matches the shipped bundle. Those deployments either pin to the standard profile or move to D.2. This limitation is exactly what motivates — and gates — D.2.

> **Supersession (explicit).** D.1 **amends** the "Migration generation & ordering" section of `schema-discipline.md` / `migration-resilience-rfc.md` (#1608) by moving history *ownership* deployment → framework package while keeping it single + aggregate-generated. D.2 below would **supersede** the single-history model and therefore needs its own ADR (supersede-or-reject) before any ticket.

#### D.2 — Package-owned migrations + collector (only if arbitrary module subsets are required)

If deployments need arbitrary module add/remove (not just the standard profile), move to package-owned migrations. This is the heavier model that requires the standalone ADR to fix, concretely:

1. **Stable, version-independent ledger keys.** Key each migration by `(sourceName, tag, contentHash)` — `sourceName` = the package name (e.g. `@voyant-travel/bookings`) or `deployment`, **never the version**. A bump that re-ships historical files (`bookings@1.0/0001` → `bookings@1.1/0001`) must resolve to the *same* key (else every old migration re-runs); `introducedInVersion` is metadata only. `contentHash` (**immutable** once shipped) flags a *changed* migration under a reused tag as a hard error.
2. **Ordering model.** Drizzle's per-folder journal has no cross-package order. Choose: **release epoch + dependency-topological order + in-package sequence** — order by `(release-epoch, topo-rank of the owning module, in-package sequence)`. The BOM/framework version (Workstream A) supplies the shared release epoch.
3. **Deployment-owned schema stays deployment-owned, anchored last.** Starter-local `schemas` (`src/db/schema.ts`) and the **generated link tables** (`drizzle.links.generated.ts`) span modules and can't be package-owned; they remain a deployment source applied *after* the framework set (links reference module tables).
4. **Custom-migration anchoring.** `src/migrations` anchor after the framework set by default, optionally pinned after a specific package's migrations for backfills.
5. **Aggregate replay as the oracle.** Keep the aggregate `drizzle.schemas.generated.ts`: an **aggregate replay test** applies *all* collected migrations onto a fresh DB and asserts equality with the aggregate-schema snapshot — catching cross-package drift per-module generation can't.
6. **`voyant db doctor` extends, not replaces** — adds ledger consistency, ordering determinism, hash immutability, and the replay test to today's checks.

**Effort:** D.1 medium (move ownership of the existing bundle into the framework package + framework-first apply order). D.2 high (standalone ADR + multi-source runner + replay test).

### E. Node artifact / build-time composition — *cross-cutting constraint*

Voyant deployments run as Node applications but still compose at **build time**
to produce deterministic, inspectable artifacts. The manifest/registry,
generated routes, and lazy-route context bridging already lean into this model.
`createOperatorApp` therefore assembles from a statically known, config-derived
registry with no runtime discovery of arbitrary packages. Lazy loading remains
useful for boot weight, but Cloudflare Worker constraints are not part of this
deployment model.

## The 20% — extension seam catalog

A custom client must be able to do all of the following **without editing a framework-owned file**:

| Need | Seam | Status |
| --- | --- | --- |
| Custom domain/entity | custom module in `src/modules`, auto-discovered + auto-migrated | **done** — `src/modules/<name>` discovery (`modulesFromGlob`) + deployment-source migrations (`db:generate:deployment`); see `custom-modules.md` |
| Custom route on an existing module | `ApiExtension` in `src/extensions`, auto-discovered + auto-migrated | **done** — `src/extensions/<name>` discovery (`extensionsFromGlob`) + deployment-source migrations; see `custom-modules.md` |
| Custom association | `defineLink` in `src/links` | exists |
| Extra admin page / widget | `src/admin/<name>` discovery → `AdminExtension` (page + widget + nav) | **done** — `adminExtensionsFromGlob` + `buildAdminExtensionRoutes`; see `custom-modules.md` |
| Override a packaged admin page | declarative page-override seam (`detailPageComponent`, `extraPages`) | exists but undiscoverable; document + standardize |
| Custom fields on core entities | database-owned registry (`@voyant-travel/core/custom-fields`) + typed JSON | **shipped** — Settings-managed definitions, registry/validation/visibility, and entity JSONB storage. See `custom-fields.md` |
| Provider choice (payment, storage, connector) | injected `providers` | **done** (card-payment seam, connectors) |

The discovery seams for custom modules, APIs, admin pages/widgets/nav remain
build-time project extensions. Custom-field definitions are different: Settings
persists them in the database, which is the sole runtime authority consumed by
write validation and export/invoice/search readers.

**Custom-fields design (recommended).** Custom fields are the single most common client ask and today force a side-table that export/invoicing/search don't see. Commit to a **registered extension-field API backed by typed JSONB** on selected core entities (bookings, people/organizations, products):

- A **field registry** declares each custom field's: entity, key, type + **validation** (zod), **label/i18n**, and **visibility policy** — whether it surfaces in exports, invoices, and search — plus a **PII/encryption policy** (encrypt-at-rest via the existing KMS path for sensitive fields like passport numbers).
- Values live in a **typed JSONB column** on the entity (not a per-field column, not an out-of-band side table), so they ride along with the row and are visible to the services that read it. Export/invoice/search consult the registry to decide inclusion — closing the "the side table isn't seen" failure mode by construction.
- **Side tables only** for genuinely relational or high-cardinality custom data (e.g. a custom 1\:N collection), which the registry can also model as a declared link.

This keeps custom fields on the supported path and upgrade-safe (the registry is deployment config; the JSONB column is schema-stable).

## `voyant doctor` — the de-risking tool

A single preflight that closes the two cheapest risks and makes upgrades safe to run:

- **Env/bindings/secrets preflight** — validate required environment at startup instead of failing at first use. Replace placeholder detection (e.g. `replace-with-...` KV ids in `wrangler.jsonc`).
- **Composition drift** — assert `config.modules` ↔ mounted registry ↔ derived nav/icons/destinations ↔ generated routes are all in sync, and that every installed module's migrations are applied. Extends today's `voyant db doctor` schema-parity check.

`voyant doctor` is cheap, high-value, and independent of the harder workstreams — it should land first.

## Upgrade path (the actual ask)

- **Standard (80%):** `voyant upgrade && voyant db migrate && voyant doctor`. `voyant upgrade` bumps the **standard product distribution** (`@voyant-travel/operator-standard`) to one version, which transitively pins the tested product closure. It is not a `@voyant-travel/*` glob: project/bootstrap packages and opt-in integrations remain direct dependencies on their own cadence. No code merge is required; config and provider wiring remain stable contracts.
- **Custom (20%):** identical, then reconcile only *their own* `src/` extensions if a seam contract changed — and semver (A) signals when. They never merge framework internals because they hold none.

## Phased plan

1. **Phase 0 — `voyant doctor` + standard product distribution (A + the doctor).** Cheap, independent, immediately de-risks Acme-class engagements. Introduce `@voyant-travel/operator-standard` plus dependency generation in the release pipeline (NOT collapsed `fixed` groups, which re-introduce npm-publish spam).
2. **Phase 1 — chrome derivation + `src/admin` discovery (C).** Removes the biggest silent-drift source; modules ship nav metadata; the hand-wired maps leave the deployment.
3. **Phase 2 — `createOperatorApp` (B).** Relocate the config-driven composition into the framework; deployment collapses to config + providers + extensions.
4. **Phase 3 — app-owned aggregate migration bundle (D.1).** The recommended migration step: move the existing single aggregate history into the framework package for the standard profile; deployments apply framework-bundle-first, then `src/migrations`. Preserves the single-history discipline, removes the fork upgrade tax, and needs only a *light* amendment to #1608 — no heavy ADR. This is what makes "bump + migrate" true for the 80% standard profile.
5. **Phase 4 — package-owned migrations + collector (D.2), only if needed.** Heavier; **gated behind a standalone ADR** that supersedes the single-history model. Required only when deployments need arbitrary module add/remove beyond the standard profile. Deferrable or rejectable without unwinding A–C or D.1.
6. **Phase 5 — custom-fields pattern + seam documentation.** Close the last 20%-without-forking gap (see the custom-fields design below).

The heavy migration step (D.2) is deliberately last and optional; D.1 delivers the standard-profile upgrade win earlier, and A–C deliver deployment-as-config without either.

## Risks & open questions

- **Migrations** — D.1 (app-owned aggregate bundle) is low-risk and unblocks the standard-profile upgrade without a heavy decision. The blocker is **D.2** (package-owned), needed only for arbitrary module subsets: it changes the source of truth set by #1608 and needs a **standalone ADR** (supersede or reject) before any ticket — ordering (release-epoch + topo + sequence), version-independent ledger keys + hash immutability, deployment-owned-schema anchoring, and the aggregate replay oracle all decided there.
- **BOM approach** (A) — the meta-package preserves per-domain independent releases (no spam) while giving atomic upgrades. Open: the meta-package name (`@voyant-travel/framework`?) and wiring BOM-`dependencies` regeneration into the release pipeline. (Global lockstep is rejected — it was tried and spammed every dev with 100+ npm emails per release.)
- **Custom-fields design** — recommendation set (registered extension-field API + typed JSONB; side tables only for relational/high-cardinality). Open: exact registry shape and the export/invoice/search inclusion hooks.
- **Transition** — keep the combined-folder path working, and add a **baseline/import** step: an existing deployment marks the framework migrations "through version X" as already represented (so D.1/D.2 don't try to re-apply history it already has), and **`voyant doctor` proves schema parity *before* switching runners**. Both the legacy and new paths coexist during the cutover so forks aren't stranded.
- **Backwards compatibility for existing forks** — provide a `voyant migrate-deployment` codemod that converts a fork into the thin `createOperatorApp` shape.

## Relationship to prior decisions

This reconciles with — does not reverse — the "no central assembly/kit" decision. That decision rejected a package that *baked provider choices* and dumped runtime files bottom-up. Here, providers stay **injected** and deployment-owned; what moves into versioned packages is **config-driven assembly, module-owned admin metadata, and framework-owned migrations** (module-owned only if the D.2 ADR lands). The deployment still chooses everything (modules, providers, extensions) — it just stops *hand-maintaining the assembly mechanics*.

It also touches two existing migration docs — `migration-resilience-rfc.md` (voyant#1608) and the "Migration generation & ordering" section of `schema-discipline.md` — at two different weights. **D.1 (app-owned aggregate bundle) is a *light amendment*:** it moves history *ownership* from the fork to the framework package while keeping the single, aggregate-generated history those docs define — no heavy ADR needed. **D.2 (package-owned migrations) would *supersede* the single-history model** and is therefore gated behind a standalone ADR. Until/unless D.2's ADR lands, the single-history model stays authoritative and Workstreams A–C + D.1 are built on top of it unchanged.
