# Unified Deployment Graph

> **Proposed adjacent runtime model:**
> [`remote-app-platform-rfc.md`](./remote-app-platform-rfc.md) keeps this graph
> immutable at runtime and introduces remote OAuth apps as installation data,
> never graph units. Deployment modules, adapters, and providers remain selected
> here; operator-installed apps do not.

Status: accepted architecture rule

Related:

- `voyant#3080` - unified deployment profiles and target adapters
- [ADR-0016 modules as components of one deployable](../adr/0016-modules-as-components-of-one-deployable.md)
- [ADR-0007 module subsetting and capability ports](../adr/0007-module-subsetting-and-capability-ports.md)
  — **superseded**; deployments do not select or drop modules
- [ADR-0008 convention-driven deployment surface](../adr/0008-convention-driven-deployment-surface.md)
- [ADR-0012 application authoring and product defaults](../adr/0012-application-authoring-and-product-defaults.md)
- [deployment targets](./deployment-targets.md)
- [module, provider, extension, and plugin taxonomy](./module-provider-plugin-taxonomy.md)
- [Node runtime authority](./node-runtime-authority.md)

## Rule

**A Voyant application is a versioned, declarative package graph selected at
build time and lowered to one resident Node application.**

Modules are **components of that one deployable, not deployment units.** A
deployment does not drop, subtract, or substitute a standard module; there is no
`exclude` and no capability-port mechanism. See
[ADR-0016](../adr/0016-modules-as-components-of-one-deployable.md).

The authored project describes only differences from the standard product. The
resolved `voyant.resolved-graph.v1` artifact describes the complete application.
Package-owned `voyant.package.v1` manifests are the authority for product
behavior; the project and Node host must not reconstruct that behavior in
parallel catalogs.

This document is normative. Historical phase notes and migration progress belong
in issues, pull requests, and changelogs rather than in this architecture rule.

## Scope

The unified composed application graph is Node-only. Voyant Cloud, Docker,
Cloud Run, Fly.io, Railway, and other hosts are deployment adapters for the same
Node artifact. They are not alternate application runtimes and do not select a
different package graph.

Cloudflare Workers may host separate edge-native storefront or federated
applications. They do not host, statically compose, or constrain the unified
Operator graph.

## Authoring Model

### Project configuration

The public application helper is `defineConfig`. It expands the versioned
`@voyant-travel/operator-standard` product BOM and merges only project-specific
differences:

```ts
import { defineConfig } from "@voyant-travel/framework/project"

export default defineConfig({
  plugins: [
    {
      resolve: "@acme/voyant-payment-provider",
      config: { merchantAccount: "travel" },
    },
  ],
  deployment: {
    target: "node",
    mode: "self-hosted",
    providers: {
      database: "postgres",
      cache: "redis",
    },
  },
})
```

A standard project does not list standard modules, package-owned extensions,
admin pages, API documents, subscribers, jobs, links, migrations, or
runtime bindings. Product defaults change through an explicit distribution
dependency or lockfile change, so graph diffing and migration planning remain
reviewable.

`plugins` contains reusable distribution bundles deliberately installed by the
application. A package-owned extension is not repeated as a project plugin.

### Project-local contributions

All project extension surfaces are optional. A clean application may contain
only `package.json`, `voyant.config.ts`, environment configuration, and the
generic Node bootstrap. Local behavior is added by creating files in the
conventional directories:

```text
src/
  api/
    admin/
    public/
  admin/
  modules/
  extensions/
  subscribers/
  links/
```

The build discovers these paths, assigns deterministic IDs, validates
collisions, and compiles static imports. Runtime directory scanning is not
allowed. Generated routes, router metadata, manifests, and runtime entries live
under `.voyant/` and are disposable build output.

Reusable local modules and external plugins remain explicit selections when
their package identity or configuration must be recorded. A local module owns
its schema and migration directory; a reusable plugin owns migrations in its
package. Deployment-level migration entries are reserved for genuinely
application-owned data changes, not copied package migrations.

## Package Contract

Every selected package publishes import-cheap metadata in `package.json` and a
manifest export:

```json
{
  "voyant": {
    "schemaVersion": "voyant.package.v1",
    "kind": "module",
    "manifest": "./voyant",
    "runtime": {
      "entry": "./runtime-contributor",
      "export": "createRuntimePortContribution"
    },
    "compatibleWith": {
      "targets": ["node"]
    }
  }
}
```

The manifest exports one or more `defineModule`, `defineExtension`, or
`definePlugin` declarations. A graph unit may own only the facets it needs:

- capabilities and typed runtime ports
- API bundles and their OpenAPI document membership
- schemas, migrations, links, and setup migrations
- package-owned product jobs, schedules, subscribers, and events
- admin routes, pages, slots, and contributions
- reporting datasets, preset widgets, and cross-module grid templates
- access resources, tools, webhooks, actions, and lifecycle metadata
- configuration, secrets, resources, and provider requirements

Executable code is referenced through symbolic package exports and remains
behind lazy imports. Importing `./voyant` must not load route trees, schemas, UI,
job implementations, or infrastructure clients.

Reporting declarations follow the same boundary. Dataset descriptors, preset
queries, visualizations, and grid templates are source-free JSON metadata;
dataset execution is a named lazy runtime reference owned by the contributing
package. The resolved graph composes a deterministic reporting catalog. A
widget or template whose dataset or widget requirement is not selected remains
in that catalog as unavailable metadata instead of invalidating the deployment,
so persisted customer layouts can omit or remove unavailable widget instances.

Link declarations are closed metadata: `kind: "linkable"` advertises an entity
that can participate in links, while `kind: "definition"` identifies an
executable `LinkDefinition` and requires a package `source` plus named `export`.
The runtime lowering stage must never infer executable definitions merely from
the presence of an export.

### Uniform first-party declarations

First-party modules use the same public declaration contract that reusable
third-party modules use. Core product packages are not allowed a smaller,
central, or host-only metadata path. Each selected first-party package must:

- publish a `voyant.package.v1` package envelope and an import-cheap `./voyant`
  export
- declare every selected module and extension with `defineModule` or
  `defineExtension`
- attach executable APIs to symbolic package runtime exports
- keep schema and migration ownership together, with explicit dependencies for
  submodules that execute against a parent module's schema
- describe each access resource and action, mark privileged actions as
  sensitive, and ensure every protected API and tool scope is grantable from
  the selected access catalog
- declare an explicit risk for each tool and bind high- or critical-risk tools
  to graph action policy
- pair external events with outbound webhook declarations and webhook APIs with
  inbound webhook declarations
- expose package runtime contributors and provider factories only through
  published package exports
- declare every port returned by a package runtime contributor in
  `provides.ports` on the exact module or extension that owns the output
- declare frontend presentation factories in `presentations`; hosts may emit
  route files only for presentation IDs selected by the resolved graph

Facets are evidence of real owned behavior, not a completeness checklist. A
package without tools, webhooks, events, admin UI, or persistence omits those
facets. Empty placeholders and speculative declarations are invalid because
they create false authority. Likewise, a compatibility export that delegates
to another package's implementation does not become a second graph unit.

`pnpm verify:first-party-manifest-convergence` enforces the standard Operator
BOM, package envelopes, runtime export validity, access/API/tool authority,
tool-definition parity, event/webhook parity, and stateful ownership rules.

### Identity

Canonical graph IDs are globally stable package IDs, with a package-scoped
fragment when one package exports multiple units or entities:

```text
@voyant-travel/bookings
@acme/voyant-suite#loyalty
@voyant-travel/bookings#api.admin
@voyant-travel/bookings#migrations
```

Bare first-party names are not canonical resolved identities. Array position,
file order, and profile lineage are never identity. V1 admits one selected
instance per graph unit ID; repeated configured instances require a future
explicit instance model.

## Resolution And Artifacts

Resolution has one authority chain:

1. `defineConfig` expands the standard product BOM and explicit project
   selections.
2. Convention discovery adds project-local contributions.
3. Package metadata is inspected before executable package code is imported.
4. Compatibility, provenance, capabilities, ports, duplicate IDs, and route
   collisions are validated.
5. Admitted package manifests are loaded and normalized.
6. The resolver emits canonical JSON plus static generated entry modules under
   `.voyant/`.
7. Vite builds the generated Node server and admin application.
8. The resident Node host validates the artifacts and deployment requirements
   before serving traffic or running migrations.

Convention discovery is filesystem-only and import-cheap. Static TypeScript
analysis runs only for project-local source contributions that discovery
actually found. A source-free or dist-only application composes from published
package manifests and still receives deterministic empty project-local
artifacts; it must not require the TypeScript compiler in its production
dependency graph.

Canonical graph JSON has stable ordering, no timestamps or host-specific
absolute paths, and a content hash calculated over the canonical data. Generated
entry modules carry the same hash. The same project and lockfile must therefore
produce the same graph.

The graph must be inspectable without becoming hand-authored application
configuration. `doctor`, graph checks, builds, migration planning, deployment,
and runtime boot all consume the same resolved artifact.

Generated runtime metadata is the only input to runtime lowering. Every
runtime-backed API route carries an admitted `referenceId`, and every unit
carries complete `selectedIds` for its selected runtime facets. Lowering
validates and normalizes those values; it never reconstructs runtime references,
infers selections from package metadata, or falls back to a legacy identifier.

## Runtime And Provider Ownership

The Node host owns infrastructure and process lifecycle. It supplies
domain-neutral primitives for environment, database, storage, events, and
configuration. It also owns HTTP serving, admin SSR/static delivery, auth host
integration, scheduled dispatch, origin trust, and graceful shutdown.

For product jobs, the host consumes exactly two outputs of the admitted graph:
`provisioning.jobs` is its immutable inventory and `runtime.jobs` supplies the
matching fixed callable exports. Boot fails when those inventories differ.
The same composed runtime ports used by API and subscriber contributors are
passed to job handlers; the host never creates per-run bindings or input.

Packages own product runtime composition. A selected package declares the ports
its runtime factory requires and publishes a package-owned runtime contributor.
Generated composition loads contributors from selected packages, runs port
conformance checks, and passes only the declared providers to each package
factory.

The host binds implementations by typed port ID, never by first-party package
ID. The host must not choose Bookings, Finance, Catalog, or any other product
implementation. Conversely, packages must not reach into a deployment container
for undeclared services. Infrastructure follows the same authority
rule: `deployment.providers` selects storage, cache, shared state, rate limit,
job and delivery implementations; environment values only configure the
selected implementation.

Object storage is exposed as a vendor-neutral logical-store resolver. The Node
host provides `memory`, an AWS SDK v3-backed `s3-compatible` adapter, or an
adapter-package `custom` provider selected on the `storage.object` graph port.
Modules request logical `media` or `documents` stores and never consume
S3/R2/GCS bucket bindings directly. Signing is an optional provider capability,
and custom adapters can run the published storage conformance suite. Direct host
injection is reserved for embedded runtimes and tests.

Provider declarations explicitly list the unit-owned config, secret, and
resource IDs their factories consume. Resolving one provider port validates only
those declarations; unrelated providers in the same plugin package remain lazy.

Provider selection is explicit in the resolved deployment. Environment variables
satisfy the selected provider; their presence must not silently change provider
choice. `managed-cloud`, `self-hosted`, and `local` are deployment modes for the
same graph contract, not product profiles.

## Cloud Export And Self-Host Projection

The portability boundary is a versioned export bundle containing an admitted
`voyant.resolved-graph.v1`, its content hash and product BOM, the framework
version, Postgres dump metadata, and an object-storage manifest. A serialized
managed/operator profile is not an application authority and must not be
restored as an export format.

`@voyant-travel/framework/self-host-export` validates the duplicated graph/hash/
BOM evidence and projects deployment authority to self-hosted Node. Projection
preserves selected graph IDs and package-scoped config only after recursively
rejecting secret-like fields and values. It remaps Cloud substrate providers
through `deployment.providers`, recomputes resource requirements and the graph
hash, and reports unsupported providers or non-portable packages as explicit
diagnostics. It does not rediscover package facets or maintain a central package
catalog.

External generators consume that projection and the versioned
`STANDARD_NODE_STARTER` contract. The starter carries exact coordinates for
every runtime and development dependency; generators may not resolve absent
coordinates through registry tags. Projected registry package installs preserve
their exact version, lockfile/npm reference, and sha512 integrity for deterministic
verification. Package manifests remain the sole composition path.

The restored database retains the shared `drizzle._voyant_migrations` lineage.
The public projection's migration policy identifies entries by `(source, tag)`,
skips matching entries without replay, applies only absent entries, and rejects
an immutable-content hash mismatch as drift. Self-host-only additions continue
in that same journal. Operational steps live in
[Exporting From Voyant Cloud](../exporting-from-voyant-cloud.md).

## Facet Ownership

### API and OpenAPI

API bundles declare a stable ID, surface (`admin`, `public`, `webhook`, or
`internal`), mount, runtime export, access posture, and OpenAPI document slug.
The build collects operations from selected bundles only. Every generated
operation retains exact unit, package, and API ownership.

Package-owned OpenAPI JSON may be committed as a contract snapshot or published
asset. There is no central full-product OpenAPI package or hand-maintained
document membership catalog. A deployment may aggregate selected package
documents for serving, but aggregation is generated from the graph and is not a
second source of truth.

### Admin

Packages own standard admin navigation, pages, copy, icons, slots, and
cross-package contributions. Project-local admin entries use the same generated
composition path. The starter owns only the generic router and shell bootstrap;
it does not keep a first-party route, copy, icon, or extension registry.

### Events, subscribers, and webhooks

Packages declare emitted event contracts, payload schemas, visibility, audit
metadata, and package subscribers. External webhook delivery is deny-by-default:
only selected events marked external and carrying an admissible payload schema
may be delivered. Project-local subscribers are compiled into the graph rather
than registered by the starter.

One domain package owns each `eventType` contract. Other selected packages may
legitimately emit that type, but must not repeat its manifest declaration.
Resolution rejects duplicate selected `eventType` authorities even when their
versions or schemas differ. The owning graph unit may publish multiple versions
of its event type; each version has a unique `eventType@version` catalog key.

Resolution compiles every complete selected event declaration into the canonical
`voyant.event-catalog.v1` catalog, keyed by `eventType@version` and retaining
unit/package provenance, payload schema, visibility, audit metadata, and derived
redacted field paths. The catalog is part of the hashed graph, deployment artifact
manifest, generated runtime, and graph runtime factory context. It is never a
hand-maintained list.

`@voyant-travel/event-catalog` owns the read-only admin API and
`@voyant-travel/event-catalog-react` owns its selected admin reference page. These
surfaces return and render the lowered catalog without importing package manifests
or rebuilding contracts. Product distributions select the infrastructure module;
settings packages and application hosts do not own or reconstruct the catalog.

### Jobs and schedules

Selected packages may own product jobs required by their capabilities. Each job
has a stable ID, a package-owned schedule or wakeup marker, and a named symbolic
runtime export. The resolved graph is the only job inventory consumed by a
deployment host. Job declarations cannot carry execution payloads, steps, waits,
or generic run controls; durable work state belongs to the owning domain.

Projects cannot author product-job declarations in `voyant.config.ts` or
through a product-job source convention. Selecting a package selects its jobs.
Customer-specific scheduled automation runs outside Voyant and integrates
through events and domain commands.

The standard self-hosted Operator selects `node-cron` and starts this job host
by default. It serializes each job in-process, coalesces at most one queued
invocation when requested, and retries failures with bounded exponential
backoff. Schedules support five-field numeric cron expressions and `every`
durations; cron day-of-month/day-of-week follow standard OR semantics. Product
jobs cannot opt into concurrent overlap within one host.

At process start, every scheduled job receives one explicit recovery sweep.
This is intentionally stronger than guessing whether a tick was missed: job
operations must be idempotent and claim domain-owned durable work, so the sweep
repairs missed scheduler delivery without making host memory authoritative.
After that sweep, resident cadence dispatch observes cron and `every` metadata.
External scheduler and wakeup calls use the fixed
`POST /__voyant/jobs/:jobId` endpoint, require origin-trust authentication, and
accept no body or query input. The host exposes only in-memory job health (last
attempt, success, failure, and retry exhaustion), not generic run controls.

### Tools, access, actions, and audit

Tool and MCP eligibility, required scopes, access resources, actions, and audit
metadata come from selected graph facets. The host may provide request-scoped
resources, but it does not enumerate product tools or rebuild an access catalog
from package names.

The repository coverage checker may read package-owned `meta.agentTools` posture
declarations for modules that currently have no Tools. These declarations document a
planned or intentionally absent agent interface; they are not executable eligibility
metadata and do not replace the selected graph's `tools` facets.

### Data and lifecycle

Schema, link, and migration ownership follows the package or local module that
owns the data. Install, upgrade, and uninstall are graph transitions, not opaque
package hooks. Lifecycle plans use stable idempotency keys, run admitted
migrations, detach removed runtime surfaces, and retain durable data by default.
Destructive purge requires a separate explicit contract.

## Forbidden Parallel Authorities

The following are architecture violations, even when generated output happens
to match the package graph:

- first-party package lists in `voyant.config.ts` or the starter bootstrap
- central composition, lazy-composition, runtime-binding, admin, subscriber,
  schedule, migration, tool, access, event, or OpenAPI catalogs
- package-specific runtime branches in the generic Node host
- copied package routes, OpenAPI files, links, or migrations in the starter
- compatibility generators that remain after package-owned parity is proven
- runtime filesystem scanning, runtime `require`, or mutable `install(app)` hooks
- separate managed and self-hosted product compositions
- serialized managed/operator profiles or profile-to-project compatibility paths
- export generators that copy a central package catalog instead of consuming the admitted graph
- a Cloudflare Worker target for the unified composed application

Temporary bridges must be named, mechanically detected, and paired with a
deletion condition. A bridge is complete only when direct package resolution
produces the required behavior and the bridge has been removed.

## Acceptance Gate

The unification is complete only when all of these statements are true:

1. A standard project's config does not repeat standard modules or extensions.
2. The Operator starter contains only generic Node/admin bootstrap code and
   optional project contribution directories.
3. No first-party package ID appears in starter composition code.
4. Every selected reusable package publishes `voyant.package.v1` metadata and
   owns each facet it activates.
5. API, admin, OpenAPI, events, subscribers, jobs, schedules, tools,
   access, actions, links, schemas, and migrations are selected-graph derived.
6. Runtime behavior is assembled from package-owned contributors and explicit
   typed ports over domain-neutral host primitives.
7. Central composition and OpenAPI catalogs, package-keyed runtime bindings, and
   compatibility registries are absent.
8. Adding a local route, admin page, module, subscriber, or link
   requires adding a file in the corresponding directory, not forking a
   standard package.
9. Generated artifacts are deterministic, hash-consistent, and rejected when
   stale or incomplete.
10. A starter snapshot and Node smoke test enforce the small project shape and
    boot the generated application.
11. Boot time, server bundle size, and admin chunking remain measured so the
    clean authoring model does not hide a performance regression.

## Validation

Use the smallest applicable checks while iterating. The principal architecture
gates are:

```sh
pnpm verify:deployment-graph
pnpm verify:standard-distribution-authority
pnpm verify:operator-application
pnpm verify:generic-node-bootstrap-authority
pnpm verify:node-runtime-product-authority
pnpm verify:operator-openapi-authority
pnpm verify:admin-composition-drift
pnpm --filter operator graph:check
```

Run `pnpm verify:architecture` for the complete architecture lane and
`pnpm verify:full` for release confidence. Broad lanes are not substitutes for
package-scoped checks during development.

## Non-Goals

- Runtime package installation or mutation.
- Opaque lifecycle callbacks.
- Multiple configured instances of one graph unit in v1.
- Treating every external system adapter as a plugin or every extension as a
  project plugin.
- Making the unified Operator graph portable to Workers.
