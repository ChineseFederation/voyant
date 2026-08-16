# Voyant Module, Provider, Extension, And Plugin Taxonomy

[`remote-app-platform-rfc.md`](./remote-app-platform-rfc.md) reserves **app**
for separately deployed OAuth installations. An app may publish an immutable,
declarative release artifact for acquisition, but that artifact is never
executable Operator code or a deployment graph unit. Executable npm bundles are
deployment-time modules, extensions, adapters, or providers.

This guide defines how Voyant should classify reusable packages and extension
surfaces.

The goal is straightforward:

- keep the architecture vocabulary small
- avoid turning every package into a “plugin”
- make the primary customization seams obvious
- keep distribution concerns separate from runtime concerns

Voyant should prefer a few explicit categories over a large generic extension
system.

## Core Rules

### 1. Modules are the main architecture unit

Modules are the primary way Voyant packages business and infrastructure
capabilities.

A module is a **component of one resident deployable**, not a deployment unit. A
deployment cannot drop or replace a standard module, and packaging a domain as a
module does not make it selectable — see
[ADR-0016](../adr/0016-modules-as-components-of-one-deployable.md). Substitution
happens at adapters and providers, never at business modules.

Examples:

- `bookings`
- `inventory`
- `commerce`
- `operations`
- `finance`
- `legal`
- `notifications`

Modules should own:

- their core services
- their data model
- their route surfaces
- their local domain logic

Selected modules publish this ownership through the same import-cheap
`voyant.package.v1` manifest contract, whether the module is first-party,
third-party, or project-local. First-party product code does not use a parallel
central catalog for API, admin, access, tool, event, webhook, schema, migration,
or runtime authority. See
[`unified-deployment-graph.md`](./unified-deployment-graph.md#uniform-first-party-declarations).
Runtime contributors must declare every returned port on the exact owning graph
unit, and package frontend routes enter hosts only through graph-selected
presentation declarations.

Rule:

If a package defines a real capability with its own records and behavior, it is
usually a module first.

### 2. Travel modules and infrastructure modules are different

Voyant modules fall into two broad categories:

- travel/domain modules
- infrastructure modules

Travel modules define the travel language of the framework:

- bookings
- departures
- pricing
- suppliers
- finance
- legal

Infrastructure modules provide technical support capabilities:

- notifications
- auth/identity
- storage
- verification

Rule:

Business capabilities should be treated as travel modules. Technical support
capabilities should be treated as infrastructure modules.

### 3. Providers are the main swap point

Providers are the primary way to make concrete implementations replaceable.

Examples:

- payment providers
- notification providers
- storage providers
- bank-transfer instruction resolvers

Providers should:

- implement a narrow contract
- stay focused on one execution seam
- hide vendor-specific details behind that contract

Providers are first-class deployment graph units. Provider packages declare
`package.json#voyant.kind: "provider"` and their graph manifests use
`schemaVersion: "voyant.provider.v1"`.

Object storage is one provider role, not one role per vendor. Its built-in
values are `memory` and `s3-compatible`; AWS S3, Cloudflare R2, Google Cloud
Storage's XML API, MinIO, and similar services configure the latter through
endpoint and credential settings. A custom adapter package declares a selected
`storage.object` provider factory and returns the same logical-store resolver
contract. Application modules resolve `media` and `documents`, never vendor
buckets or bindings.

Rule:

If the question is “how do I swap one implementation for another?”, the answer
should usually be a provider, not a plugin.

### 4. Adapters connect Voyant to external systems

Adapters are integration packages that connect Voyant capabilities to external
vendors or services.

Examples:

- Netopia
- SmartBill
- CMS sync packages

An adapter may expose:

- one or more providers
- a small extension
- route or webhook wiring
- subscriber or job wiring owned by the integration package

Adapters are first-class deployment graph units. Adapter packages declare
`package.json#voyant.kind: "adapter"` and their graph manifests use
`schemaVersion: "voyant.adapter.v1"`.

Rule:

If a package exists primarily to talk to an external system, treat it as an
adapter package even if it also exports a plugin bundle.

In federated operating mode, an adapter may connect Voyant to a system that
remains authoritative for selected data or operations. See
[`federated-operating-mode.md`](./federated-operating-mode.md) for the
source-of-truth modes, source connection expectations, and when an adapter needs
a provider, extension, module, or plugin bundle around it.

### 5. Extensions customize existing module behavior

Extensions add or modify behavior around existing module surfaces.

Examples:

- finance sync hooks
- supplier-specific booking logic
- custom link/query hydration
- admin widgets for an existing module

Extensions should not be treated as new domain modules unless they introduce a
new bounded capability with its own records and lifecycle.

Rule:

If the package customizes an existing module rather than defining a new
capability, it is an extension.

### 6. The plugin graph kind is retired in this repository

**No workspace package declares `voyant.kind: "plugin"`.** The migration
described below is complete, and `pnpm verify:deprecated-graph-kinds` is now a
**denial**: a workspace package under `packages/`, `apps/`, or `examples/` that
declares the kind fails `verify:architecture`. It is no longer warn-only.

Historical plugin packages migrated to their correct target:

- payment, search, and storage integrations became adapters or providers
- CRM, accounting, and remote-sync integrations became remote apps where they
  can operate through scoped APIs, events, webhooks, app-owned custom fields,
  and remote admin UI

What remains, deliberately:

- `VoyantGraphUnitKind` in `@voyant-travel/graph-contracts` still includes
  `"plugin"`, and the `voyant.plugin.v1` lowering path still resolves. That is
  for **external** packages that have not migrated — deleting the kind from the
  graph contract is a separate, breaking change, not part of this rule.
- Authored `plugins` entries in a deployment config remain legacy compatibility
  inputs for those external packages.

Rule:

Do not introduce plugin graph units. A new executable npm package declares its
actual deployment role: module, extension, adapter, or provider.

Package-owned extensions remain extension contributions in the resolved graph.
They do not become plugins merely because the runtime lowers them to an
extension factory. A standard application does not list these contributions in
its authored `plugins` array; the selected product distribution and package
manifests provide them. Authored `plugins` entries are legacy compatibility
inputs for packages that have not yet migrated to `adapters` or `providers`.

## Decision Rules

### 7. Start with the narrowest category that fits

When introducing a new package or extension point, choose the narrowest correct
classification first.

Use this order:

1. provider
2. adapter
3. extension
4. module
5. legacy plugin bundle

That keeps the architecture honest and avoids inflating simple seams into a
meta-framework.

Rule:

Do not start with “plugin”. Start with the smallest seam that actually matches
the job.

### 8. Keep distribution separate from runtime semantics

The runtime question is:

- module?
- provider?
- extension?
- adapter?

The compatibility question is:

- does an existing package still need the legacy plugin lane until migration?

Those are not the same decision.

Rule:

A package should declare the graph kind that matches its runtime role. The
legacy plugin lane is not a substitute for adapter or provider declarations.

### 9. Avoid leaking internal implementation structure as public API

Packages may contain many internal helpers and supporting services.

That does not mean every internal part should become part of the supported
cross-package surface.

Modules should expose one main public service surface where possible.
Providers should expose one narrow contract.
Extensions should expose the specific registration points they need.

Rule:

Keep the public package surface smaller than the internal implementation
surface.

## Packaging Guidance

### 9a. Keep provider and plugin runtime graphs lazy when they are request-owned

Provider and plugin seams are also performance boundaries. If a provider or
plugin imports a large service graph but is only used by request handlers,
webhooks, subscribers, or bootstrap work, register it lazily instead of
constructing the concrete value in the deployment's app module.

Rules:

- Provider containers may use `lazyProvider(() => import(...))` for service
  objects or async provider functions whose first real use happens inside a
  request/event path.
- `lazyProvider(...)` is only valid for async functions or object surfaces whose
  consumed members are async methods. Do not use it for plain properties,
  sync-returning methods, query builders, or mixed service objects; narrow the
  provider contract first.
- API bundles that would import heavy adapter code may use
  `defineLazyApiBundle(...)` with eager metadata (`name`, `anonymous`, and
  absolute route matchers) plus a lazy `load` factory.
- Anonymous webhook/callback paths must stay eager metadata on the lazy bundle,
  so the first inbound unauthenticated request is admitted before the bundle is
  imported.
- Transactional lazy bundle surfaces must declare eager
  `transactionalModules` or `transactionalPaths` metadata. The app selects the
  request DB before lazy route handlers run, so transaction ownership cannot be
  discovered from the loaded bundle on the first request.
- Lazy bundles that must register subscribers, container
  services, or bootstrap work before a bundle-owned route is hit must opt into
  app bootstrap loading with `loadOnBootstrap`.

Rule:

Do not statically import a heavy provider/plugin implementation in the
deployment app closure when the framework can mount a lazy provider or lazy
bundle seam with the same runtime behavior.

Verification:

- After building a deployment, measure the static closure of the generated API
  app chunk with `node scripts/measure-static-import-closure.mjs <dist/server/assets/app-*.js>`.
  The script walks static imports and stops at dynamic `import(...)` boundaries.

### 9b. Declare additive provider ports explicitly

Most runtime ports have exactly one statically selected contributor. A module
that intentionally accepts additive providers declares its runtime port with
`cardinality: "many"` and reads it with `getPorts(...)`. Generated composition
preserves selected contributor order for these ports and continues to reject
duplicate contributors for ordinary one-valued ports.

The owning module must then aggregate provider identities deterministically and
fail on duplicate identities. Deployment starters must not translate selected
adapter packages into a mutable registry or config-injected provider map.

Rule:

Use a many-valued runtime port only when independently selected packages are
genuinely additive. Keep replaceable single-provider seams one-valued.

### 10. Prefer clear names that reveal the package role

Prefer names that reveal whether the package is:

- a core module
- a provider/adapter
- a frontend runtime package
- a UI/block package

Examples:

- `@voyant-travel/bookings`
- `@voyant-travel/public-api-react`
- `@voyant-travel/admin`
- `@voyant-travel/plugin-netopia`

The package name does not have to carry the full taxonomy, but it should not
hide the package’s role either.

Rule:

Package naming should reinforce the architecture, not blur it.

### 11. Plugin authoring should stay lightweight

When a reusable bundle does need to ship as a plugin, Voyant should keep the
authoring model simple:

- clear exports
- clear allowed bundle contents
- lightweight scaffold path
- predictable registration shape

Do not turn plugin authoring into a second framework within the framework.

Rule:

Plugin packaging should be deliberate and ergonomic, not magical.

## Practical Checklist

When classifying a new reusable capability:

1. Ask whether it is defining a real capability or only swapping an
   implementation.
2. If it swaps an implementation, prefer a provider.
3. If it connects to an external vendor, treat it as an adapter package.
4. If it customizes existing module behavior, treat it as an extension.
5. If it introduces a new bounded capability, make it a module.
6. Only wrap the result as a plugin when you need to distribute a reusable
   bundle across projects.

## Non-Goals

This guide does not introduce:

- a universal plugin system
- a requirement that every reusable package ship as a plugin
- a ban on bundled packages that combine multiple seams

The point is clear package taxonomy, not extra ceremony.
