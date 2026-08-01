# API Route Ownership And Runtime Composition

Status: proposal (2026-06-15)

Related:

- [Voyant API Route Authoring](./api-route-authoring.md)
- [Voyant Module, Provider, Extension, And Plugin Taxonomy](./module-provider-plugin-taxonomy.md)
- [Schema discipline](./schema-discipline.md)
- [Migration and Schema Resilience RFC](./migration-resilience-rfc.md)
- [ADR-0001: Tenant scoping is enforced at the deployment boundary](../adr/0001-tenant-scoping.md)
- [ADR-0003: Admin API contract + SDK](../adr/0003-admin-api-contract-sdk.md)
- [Catalog Booking Route Module Plan](./catalog-booking-route-module-plan.md)
- [Route Ownership Inventory](./route-ownership-inventory.md)

## Status update (2026-07-13)

Implemented for the operator starter. The route-ownership checker (Phase 0),
first-class context-preserving lazy contributions including the multi-prefix
`lazyRoutes` variant (Phase 1), and the full route-family migration (Phases 3–4)
have landed. Workflow Runs was the final generic Node host mount during this
migration and was subsequently retired with the workflow product. The Operator
starter and generic Runtime contain no `additionalRoutes` product composition. See
[Route Ownership Inventory](./route-ownership-inventory.md) for the per-family
result.

## Status update (2026-07-21)

The workflow product was subsequently retired. Checkout finalization now uses
Commerce's selected payment subscriber and explicit `finalizeCheckout` domain
operation, ordered by Catalog's in-process saga. References to workflow runtime
code in the migration inventory below describe the pre-removal source shape,
not a current execution surface.

## Summary

Voyant should not require every deployment to rewrite the same HTTP route
interfaces. Reusable route interfaces belong with the module, extension, or
adapter that owns the capability. Deployments should compose those route
interfaces, provide runtime adapters, and declare deployment policy.

Voyant has one server API route interface: package authors export route factories,
`ApiModule`s, or `ApiExtension`s. Hono is the sole implementation of that
interface. It is not an adapter seam and packages must not imply that another
server router can replace it.

The framework does not just have the target shape available — it already runs
it for most of the surface:

- `ApiModule` and `ApiExtension` expose `adminRoutes` and `publicRoutes`.
- `createApp` mounts them under `/v1/admin/{name}` and `/v1/public/{name}`.
- modules can override public mounting with `publicPath` when the URL contract
  is clearer without the package name segment.
- `composeFromManifest(...)` from `@voyant-travel/hono/composition` derives
  runtime modules and extensions from a manifest plus a typed capability
  container. This is not latent: `apps/operator/src/api/composition.ts`
  **already** composes ~20 modules and 6 extensions this way, through
  `OPERATOR_RUNTIME_MANIFEST` + `operatorComposition` + `buildOperatorCapabilities()`.
- the packages behind that manifest already export route-bearing modules — for
  example bookings, finance, inventory, operations, legal, storefront, catalog
  search, and trips — each receiving its deployment adapters through typed
  factory options.

So the clean composition path is the established, in-production pattern, not
something this proposal introduces. The gap is narrow and specific: a set of
route families that bypass the registry and are hand-mounted through
`additionalRoutes` in `app.ts`. For those families `apps/operator/src/api`
carries more than deployment wiring — route handlers, route schemas, path lists,
lazy mounts, payment and checkout route families, flight routes, catalog offer
routes, media routes, proposal routes, and other HTTP contracts that a second
deployment would have to copy or rediscover. For them the deployment interface
is shallow: a caller must understand nearly as much route implementation detail
as the package author.

Read the work this way: it is mostly **moving the `additionalRoutes` stragglers
into the registry that already exists**, not standing up composition from
scratch — which makes it lower-risk than a greenfield reading suggests.

The clean target is:

1. Package route interfaces live in packages.
2. Deployment-specific runtime adapters live in apps/apps.
3. Every route-bearing thing enters through one contribution path:
   `ApiModule` or `ApiExtension`, including deployment-local routes.
4. Runtime composition is manifest-driven, but manifest entries and runtime
   factories are co-located so the two lists cannot drift silently.
5. Public access and transactional DB policy are declared near the owned route
   interface where possible, with deployment overrides only for true local
   exceptions.
6. Lazy loading and route-bundle performance are built into the composition
   layer, not reimplemented by each starter.
7. A checker prevents new framework route contracts from being added under
   `apps/*` without an explicit ownership reason.

## Problem

### Route ownership is split across packages and deployments

The current repo has two route-authoring patterns:

- Package-owned routes, such as `@voyant-travel/bookings`,
  `@voyant-travel/finance`, `@voyant-travel/inventory`, and
  `@voyant-travel/storefront`, export route-bearing `ApiModule`s.
- Operator-owned routes under `apps/operator/src/api` mount either local
  handlers or package route factories through `additionalRoutes`.

The first pattern is reusable. The second pattern works for the operator
deployment, but it makes the starter a source of framework route contracts.
When a package also ships React hooks, SDK clients, workflow helpers, or public
contracts that expect those routes, the route interface should not be hidden in
one starter.

Examples from the current operator starter:

| File | Current shape | Likely owner |
| --- | --- | --- |
| `catalog-booking.ts` | Mounts package booking-engine routes, plus local slots, orders, and snapshot routes. | Shared quote/draft/hold/book routes are already package-owned; remaining routes need classification. |
| `catalog-checkout*.ts` | Checkout start, materialization, tax, finalize, signature, and workflow runtime code. | Composite deployment-coupled workflow; classify after easier route families, not as a simple catalog mount. |
| `catalog-content.ts` | Mounts content route factories from products, cruises, and accommodations. | Vertical packages should expose their own modules or route contributions. |
| `catalog-offers.ts` | Operator admin offer/search/price route family. | Catalog or vertical adapter route module, depending on source ownership. |
| `flights.ts` | Admin flight search, ancillary, seatmap, price, booking, order, and reference routes. | `@voyant-travel/flights` route module with injected connector and payment adapters. |
| `proposal-routes.ts` | Admin proposal-version send and public proposal accept/decline routes. | Proposals lifecycle lifecycle extension, with notification/document adapters injected. |
| `booking-schedule.ts` | Payment schedule regeneration and public payment-policy resolution. | Finance/bookings route extension. |
| `lazy-additional-routes.ts` and `payment-link-routes.ts` | Public payment link and checkout status routes. | Finance checkout/payment-link module. |
| `media-upload-routes.ts` | Product brochure generation, upload tickets, and media serving. | Storage/media infrastructure module plus inventory extension for product brochure generation. |
| `settings.ts` | Operator profile, payment instructions, payment defaults, and public profile/settings routes. | Operator settings/profile infrastructure module or starter-local only if intentionally not reusable. |
| `contract-document-routes.ts` | Booking contract generation and document file serving. | Legal/document-delivery module with deployment storage and generator adapters. |
| `mcp.ts` | Admin agent tool route. | Deployment or agent tooling package, depending on whether the route contract is supported framework surface. |

This is not all accidental. Some route families genuinely combine deployment
choices: storage, payment provider selection, Better Auth integration, provider
credentials, public checkout base URL, generated document storage, or demo
flight connector configuration. The issue is that those deployment choices are
implemented by owning the whole route interface locally, instead of satisfying a
package-owned interface through adapters.

The long-term problem is not only that some routes are in the starter. It is
that there are two doors into the app:

- composed `ApiModule` / `ApiExtension` route contributions.
- arbitrary `additionalRoutes` mutations.

The second door is how route families became local implementation detail. Long
term, even deployment-local diagnostics and product-specific routes should be
wrapped as deployment-local `ApiModule`s or `ApiExtension`s in the composition
registry. `additionalRoutes` should become a migration compatibility escape
hatch, not a normal route authoring surface.

### Route policy is also duplicated

Mounting is not the only repeated decision. The operator starter also owns:

- `publicPaths`, the unauthenticated public path allowlist.
- `dbTransactionalPaths`, extra paths that must use the transactional DB
  factory.
- lazy route path lists for route families under `additionalRoutes`.
- route capability metadata indirectly, through whichever route surfaces are
  mounted.

Some of those decisions are deployment policy. Others are facts about the route
interface. For example, a payment-link landing endpoint being anonymous is a
property of the payment-link contract, not a local operator implementation
detail. A booking route needing interactive transactions is likewise a property
of the flow it runs, not something every deployment should rediscover.

### Shallow deployment interfaces create drift

The deletion test is the clearest signal: if `apps/operator/src/api` route
handlers were deleted, the complexity would not disappear. It would reappear in
every deployment that wants catalog booking, payment links, flights, proposals,
media uploads, or catalog offers. That means the starter is not hiding
complexity behind a deep interface; it is carrying reusable complexity in the
wrong place.

The practical failure modes are:

- A new deployment installs a domain package and its React package but misses
  the HTTP route family the React hooks expect.
- A route bug is fixed in the operator starter but remains absent from another
  deployment that copied an older route body.
- Public auth behavior differs by deployment because anonymous path decisions
  are hand-maintained.
- Transactional DB routing differs by deployment because special paths are
  hand-maintained.
- Admin SDK capability discovery can list modules but cannot fully trust that
  operation routes and route descriptors stay aligned.
- Tests concentrate around the starter instead of package route interfaces, so
  reusable behavior is harder to verify in isolation.

## Ownership Model

### Modules own capability route interfaces

If a package defines a real capability with records and behavior, the module
should own its route interface.

Module-owned route interfaces include:

- core admin CRUD and workflow operations for the module.
- public route contracts expected by module React hooks, SDK clients, or public
  workflows.
- route-level request and response schemas.
- route tests that prove parsing, error normalization, auth assumptions, and
  service/workflow delegation.
- route policy metadata that is intrinsic to the route interface, such as
  anonymous public access or transactional DB requirements.

The module should expose a small interface:

```ts
export function createFlightsApiModule(options: FlightsApiModuleOptions): ApiModule
```

The implementation behind that interface can remain large. The point is depth:
a deployment should learn one typed factory and provide adapters, not copy the
route family.

### Extensions own behavior around an existing module surface

If a route customizes or extends another module without introducing a new
bounded capability, it should be an extension.

Examples:

- booking-specific finance actions mounted under bookings.
- inventory authoring extensions mounted under products.
- distribution channel-push actions mounted under distribution.
- Proposal lifecycle routes if the route interface is primarily an extension of
  Proposal Versions rather than a standalone Proposals module.

The extension should expose `ApiExtension` with `adminRoutes` and/or
`publicRoutes`, and it should depend only on the adapters it needs.

### Adapters own vendor-specific route interfaces

If a package exists primarily to talk to an external system, it is an adapter.
The adapter may still export routes, providers, webhooks, and plugin bundles,
but "adapter" is the runtime role.

Examples:

- Netopia callback/webhook route wiring.
- SmartBill admin sync route wiring.
- flight connector admin routes if tied to a specific vendor connector.
- CMS sync routes.

Vendor routes should not force every deployment to write vendor-specific Hono
handlers. The deployment supplies credentials, base URLs, and environment
policy; the adapter package owns the route interface.

For SmartBill, `@voyant-travel/plugin-smartbill/voyant` owns the transactional
`/v1/admin/smartbill` declaration and `@voyant-travel/plugin-smartbill/hono`
owns its handler factory. The Operator selected-graph binding adapts that
package module into composition and resolves deployment credentials and
database/storage capabilities; `app.ts` does not mount a SmartBill route or
bundle independently.

### Deployments own composition and local policy

Deployments should own:

- DB factory selection and runtime bindings.
- auth integration and session handling.
- provider selection, credentials, and environment resolution.
- deployment URLs, storage adapters, document generators, notification
  providers, and payment provider adapters.
- public anonymous access overrides that are deployment-specific.
- local diagnostics and smoke-test routes that are not supported framework
  contracts.
- genuinely app-specific composite routes that should not be reused.

Deployments should not own reusable package route schemas or handler bodies
merely because those handlers need deployment adapters.

Deployment-owned routes should still use the same contribution path as package
routes. If a route is genuinely local, wrap it in a small deployment-local
`ApiModule` or `ApiExtension`, mark it in the route ownership inventory, and
compose it through the registry. Do not add new product route families through
`additionalRoutes`.

The operator starter already has evidence for this split. Files such as
`catalog-booking-runtime.ts`, `contract-document-runtime.ts`,
`runtime-adapter.ts`, `trips-runtime.ts`, and
`storefront-intake-runtime.ts` are deployment adapters today. The route
ownership work should deepen that pattern: keep adapter resolution in the
starter, but move reusable route interfaces back to the owning packages.

This respects ADR-0001: tenancy remains a deployment concern. Package route
interfaces should not add in-process tenant scoping or thread organization
filters through domain queries.

## The Server API Route Interface

Voyant standardizes on one Hono-backed package route interface.

That means:

- packages expose route factories, `ApiModule`s, or `ApiExtension`s.
- routes stay relative inside packages and are mounted by `createApp`.
- package tests mount the Hono route interface directly and through
  `createApp`.
- the framework hosts the composed Hono application on Node; there is no
  alternate server-router adapter seam.
- SDK descriptors, OpenAPI exports, and framework-specific wrappers are derived
  or layered on top; they are not the primary route interface.

This avoids a false abstraction. Voyant does not need a route DSL over Hono or
a hypothetical router adapter. The Hono app carries middleware
composition, route matching, typed context, request/response primitives, and a
portable fetch handler. The framework-specific concern is where the Hono app is
hosted, not how each package defines its route family.

The rule for package authors:

```ts
export function createCatalogBookingRoutes(options: CatalogBookingRoutesOptions): Hono

export function createCatalogBookingApiModule(
  options: CatalogBookingRoutesOptions,
): ApiModule
```

The lower-level route factory is useful for tests and advanced composition. The
`ApiModule` or `ApiExtension` is the normal deployment interface.

## Decision Rules

Use these rules when adding or moving a route:

1. If a route is required for a package's React hooks, SDK, workflow, or public
   contract to work, it belongs in that package.
2. If a route exposes a capability with its own records and behavior, it belongs
   in that module.
3. If a route modifies another module's behavior, it belongs in an extension for
   that target module.
4. If a route talks to a vendor system, it belongs in the adapter package unless
   the route contract is truly app-specific.
5. If a route composes multiple modules but represents a stable framework
   workflow, create a small route-owning module or extension and inject the
   module services it needs.
6. If a route exists only because this deployment has a local operational knob,
   diagnostic, or one-off integration, it can stay in the deployment, but it
   still enters as a deployment-local `ApiModule` or `ApiExtension`.
7. If the only reason a route is deployment-owned is access to env vars,
   storage, payment providers, or base URLs, that is a sign to move the route
   into a package and inject those values through options.
8. If a route requires anonymous public access, the route owner may declare that
   requirement, but the deployment must explicitly acknowledge it before the
   auth bypass is active.
9. If a route needs a transactional DB client, declare that through the
   narrowest possible route metadata or through `module.requiresTransactionalDb`
   when the entire module surface truly needs interactive transactions.
10. If route ownership is unclear, keep the first slice small: extract the
    stable route interface and leave app-specific enrichment local behind an
    explicit extension point.
11. Do not add route-bearing code through `additionalRoutes` except as a
    temporary migration bridge with an inventory entry and deletion target.

## Target Runtime Shape

The target shape builds on the current `@voyant-travel/hono` primitives.

The current operator starter keeps the manifest array and factory registry as
separate objects. That works, but it is still two places to touch. The long-term
shape should co-locate a runtime unit's specifier with its factory, then derive
both the manifest and the registry from that one list.

```ts
import { composeFromManifest } from "@voyant-travel/hono/composition"

export const operatorRuntimeUnits = [
  defineRuntimeModule("@voyant-travel/flights", ({ capabilities }) =>
    createFlightsApiModule(createOperatorFlightsOptions(capabilities)),
  ),
] satisfies RuntimeCompositionUnit[]

export const OPERATOR_RUNTIME_MANIFEST = manifestFromRuntimeUnits(operatorRuntimeUnits)
export const operatorComposition = registryFromRuntimeUnits(operatorRuntimeUnits)
const capabilities = buildOperatorCapabilities()

const { modules, extensions } = composeFromManifest(
  OPERATOR_RUNTIME_MANIFEST,
  operatorComposition,
  capabilities,
)

export const app = createApp({
  db,
  dbTransactional,
  modules,
  extensions,
  plugins,
  auth,
})
```

This keeps the schema/migration manifest model intact while reducing authoring
ceremony: adding a route-bearing module is one runtime unit entry, and tooling
derives the manifest and registry views that `createApp`, `voyant.config.ts`,
and `voyant db doctor` need.

Until the co-located form exists, `diffManifestRegistry(...)` and `voyant db
doctor` parity must be a hard CI gate for deployment manifests and runtime
registries, not an optional report. A clean import experience cannot rely on
humans remembering to update parallel lists.

The runtime unit still maps to an explicit package factory:

```ts
export const operatorComposition = {
  modules: {
    "@voyant-travel/flights": ({ capabilities }) =>
      createFlightsApiModule(createOperatorFlightsOptions(capabilities)),
  },
}
```

The package route module owns:

- relative routes such as `/search`, `/price`, `/book`, `/orders/:id`.
- JSON and query schemas using `parseJsonBody(...)` and `parseQuery(...)`.
- error normalization.
- response DTO shape.
- package-level route tests.
- optional route policy metadata.

The deployment owns:

- which adapter satisfies `resolveFlightAdapter`.
- which payment starter is enabled.
- which base URLs and credentials come from bindings.
- whether the module is installed at all.

## Capability Containers And Module Options

The deployment capability container should be a gathering point, not the module
interface.

Today `OperatorCapabilities` gathers many deployment resolvers and factories.
That is useful locality, but it can become a god-object if module factories
reach into it directly. The clean contract for a second deployment is the
package option interface:

```ts
export interface FlightsApiModuleOptions {
  resolveFlightAdapter: ResolveFlightAdapter
  resolveReferenceProvider: ResolveFlightReferenceProvider
  resolvePaymentStarter: ResolveFlightPaymentStarter
}
```

The deployment can still gather raw capabilities centrally:

```ts
export interface OperatorCapabilities {
  resolveFlightAdapter: ResolveFlightAdapter
  resolveFlightReferenceProvider: ResolveFlightReferenceProvider
  resolveFlightPaymentStarter: ResolveFlightPaymentStarter
}
```

But factories should convert that gathering point into typed module options
before calling the package:

```ts
function createOperatorFlightsOptions(
  capabilities: OperatorCapabilities,
): FlightsApiModuleOptions {
  return {
    resolveFlightAdapter: capabilities.resolveFlightAdapter,
    resolveReferenceProvider: capabilities.resolveFlightReferenceProvider,
    resolvePaymentStarter: capabilities.resolveFlightPaymentStarter,
  }
}
```

Rules:

- package factories accept their own option interfaces, not the deployment
  capability container.
- deployment registries may use the container to build those options.
- option builders should live near deployment composition so dependencies are
  visible at the module entry.
- `OperatorCapabilities` should not become a service locator passed through to
  packages.

## Route Policy Metadata

The existing `ApiModule` and `ApiExtension` interface has route mounts but not
enough route policy metadata to eliminate all deployment path lists. We should
extend the model incrementally, but the first version must avoid two traps:

- anonymous public access cannot widen silently when a package is installed.
- route policy should not restate absolute URL contracts in a second, drifting
  place.

The preferred shape is a route contribution object that keeps Hono routes,
lazy-loading metadata, relative path matchers, and policy together:

```ts
interface RoutePolicy {
  /**
   * Declares that these public relative paths require anonymous access.
   * The deployment must acknowledge the resolved absolute paths before they
   * are folded into the auth bypass list.
   */
  requiresAnonymousPublicAccess?: readonly string[]
  /**
   * Declares the narrowest relative paths that must use the transactional DB
   * factory. Use "/" only when the whole mounted contribution needs it.
   */
  requiresTransactionalDb?: readonly string[]
}

interface ApiRouteContribution {
  routes?: Hono
  lazy?: LazyApiRoutes
  paths?: readonly string[]
  policy?: RoutePolicy
}

interface ApiModule {
  adminContribution?: ApiRouteContribution
  publicContribution?: ApiRouteContribution
  /** Existing compatibility surface. */
  adminRoutes?: Hono
  publicRoutes?: Hono
}

interface ApiExtension {
  adminContribution?: ApiRouteContribution
  publicContribution?: ApiRouteContribution
  /** Existing compatibility surface. */
  adminRoutes?: Hono
  publicRoutes?: Hono
}
```

Semantics:

- `paths` and policy paths are relative to the contribution's mounted surface.
  `createApp` resolves them using the module/extension name and `publicPath`.
- `requiresAnonymousPublicAccess` is a package-declared requirement, not an
  automatic auth bypass. The deployment must include the resolved paths in
  `acknowledgedAnonymousPublicPaths`; deployment-only anonymous exceptions stay
  in `publicPaths`.
- tooling should print the package-declared anonymous paths and the effective
  acknowledged anonymous paths. In strict mode, unacknowledged package-declared
  anonymous paths should fail.
- the capabilities endpoint or a companion diagnostic route should expose the
  effective anonymous list so the unauthenticated surface remains auditable.
- `requiresTransactionalDb` is folded into the transactional DB selector because
  it is a correctness requirement, but it must use the narrowest possible
  prefixes.
- `module.requiresTransactionalDb` remains a broadening flag. If it is set, the
  whole module surface uses the transactional factory; route-level metadata
  cannot narrow it. Prefer route-level metadata when only a few routes need
  transactions.
- deployment-level `publicPaths` and `dbTransactionalPaths` remain escape
  hatches for local exceptions.

This keeps route policy close to the route interface while preserving deployment
control over the security-sensitive anonymous surface. It also makes the
performance-sensitive transactional surface reviewable: package authors can
declare correctness needs, but review should reject broad transactional prefixes
unless the whole route contribution genuinely calls interactive transactions.

## Built-In Lazy Loading And Performance

**Status: shipped (minimal form).** `@voyant-travel/hono` now exposes
`lazyAdminRoutes` / `lazyPublicRoutes` on `ApiModule` and `ApiExtension`: a
loader `() => Promise<Hono>` returning the same relative routes an eager
`adminRoutes` / `publicRoutes` would. `createApp` mounts each at the surface
prefix (`/v1/admin/{name}`, `/v1/public/{publicPath ?? name}`), dynamically
imports the bundle on first matching request, and caches it per isolate. So a
package can ship a heavy route family that loads on demand, and the deployment
gets it just by composing the module — no route authoring, no starter wiring.

### Context preservation is the hard part (and the reason the starter helper was insufficient)

Eager routes mounted via `app.route(...)` share the request context, so they see
`c.var.db`, `c.var.container`, the resolved actor, etc. that the `createApp`
middleware pipeline set. The starter's `mountLazyRouteApp(...)` forwards via
`subApp.fetch(c.req.raw, c.env)`, which builds a **fresh** Hono context and drops
every `c.var`. This was verified empirically: a forwarded sub-app reads
`c.var.db === undefined`. That is a latent bug for any lazy family that relies on
request-scoped state — including the operator's lazy `flights.ts`, whose
`getDb(c)` reads `c.var.db`. Such families work only by accident (paths that
never touch the dropped vars).

The first-class implementation fixes this by bridging context across the forward:
it snapshots `c.var`, carries it on the forwarded `env` under a private symbol,
and a wrapper middleware re-hydrates it onto the loaded sub-app before the real
routes run. The db lease is **carried, not re-acquired**, so the outer `db`
middleware keeps sole ownership of dispose (no double-release). Actor guards and
auth still run on the outer pipeline before the lazy proxy, so a rejected request
never imports the bundle. Failed loads are not cached, so a transient
import/config error recovers on the next request. All of this is covered by
`packages/hono/tests/unit/app-lazy-routes.test.ts`.

Migrating the existing lazy families (`flights`, `media`, `catalog-booking`, …)
off the starter's `mountLazyRouteApp` onto `lazyAdminRoutes`/`lazyPublicRoutes`
both removes their `additionalRoutes` hops and fixes the dropped-context bug.
Those migrations are per-family work that still needs integration verification.

### Future: richer lazy metadata

The minimal form intentionally omits per-route policy metadata. A later
extension could carry path/policy/preload hints alongside the loader:

```ts
interface LazyApiRoutes {
  paths: readonly string[]
  load: () => Promise<Hono>
  preload?: "startup" | "ready" | "first-request"
}

interface ApiRouteContribution {
  paths: readonly string[]
  routes?: Hono
  lazy?: LazyApiRoutes
  policy?: RoutePolicy
}

interface ApiModule {
  adminContribution?: ApiRouteContribution
  publicContribution?: ApiRouteContribution
}

interface ApiExtension {
  adminContribution?: ApiRouteContribution
  publicContribution?: ApiRouteContribution
}
```

Semantics:

- `paths` declares the route matchers up front so `createApp` can install a
  lightweight dispatcher without importing the route bundle.
- `load()` dynamically imports or constructs the Hono sub-app and returns
  relative routes for that surface.
- the loaded sub-app promise is cached per isolate/process, so the route bundle
  is loaded once and reused.
- `preload` lets a deployment choose whether a route bundle is cold-loaded on
  first request, warmed during `app.ready()`, or loaded at startup.
- route policy metadata stays with the lazy route owner; anonymous access
  requirements and transactional path requirements are available before the
  heavy route bundle is imported.
- eager `adminRoutes` and `publicRoutes` remain the simple default for small
  route families.

This gives package authors a performance path without changing route ownership.
A heavy package such as flights, media, catalog offers, document generation, or
checkout can export a lazy route contribution; the deployment composes the
module normally and gets consistent route matching, policy, and auth behavior.

Heavy route extraction should not regress into eager module imports. First-class
lazy route contributions should land before or alongside the first heavy
extraction, with flights as the initial proving slice.

Performance guardrails should be part of the implementation:

- route loaders must not run during module import unless `preload: "startup"` is
  explicitly chosen.
- the lazy dispatcher should preserve the original request and Hono context
  variables when forwarding into the loaded sub-app.
- loader failures should return a structured 500 and cache only successful
  loads, so transient import/config failures can recover.
- route metadata should be inspectable by tooling, including route ownership
  checks and admin operation descriptor checks.
- package tests should verify both eager and lazy mounting paths where a module
  exports both.

## Migration Plan

### Phase 0: Inventory and freeze new drift

Create a route ownership inventory for `apps/operator/src/api`:

- package-owned and already reusable.
- package-owned but still mounted manually.
- mixed reusable plus operator-specific.
- intentionally deployment-owned.
- deprecated or diagnostic.

Add a checker or lint rule that flags new route-bearing code outside the
composition path, including direct Hono route definitions under
`apps/*/src/api`:

- `hono.get("/v1/...")`
- `hono.post("/v1/...")`
- `hono.put("/v1/...")`
- `hono.patch("/v1/...")`
- `hono.delete("/v1/...")`
- `additionalRoutes: (hono) => { ... }` route families

The checker should allow an explicit local-route annotation, for example:

```ts
// voyant-route-owner: deployment-local-diagnostic
```

or a small allowlist file. Existing routes start as a baseline. New
route-bearing code must enter as a package module, package extension, or
deployment-local module/extension. Phase 0 is the most important slice because
it stops the second route door from growing while extraction proceeds.

### Phase 1: Add first-class lazy route contributions and policy reporting

Move the starter-only lazy route dispatch pattern into `@voyant-travel/hono`
before the first heavy extraction.

The first implementation should:

- add route contribution fields to `ApiModule` and `ApiExtension`.
- mount lazy admin/public routes under the same surface prefixes as eager
  routes.
- cache successful route loads.
- support `preload` during startup, `app.ready()`, or first request.
- keep route policy metadata available before the route bundle loads.
- report package-declared anonymous public paths separately from the
  deployment-acknowledged effective anonymous list.
- fold transactional path requirements into the DB selector using the narrowest
  resolved prefixes.
- add tests for lazy admin routes, lazy public routes, loader failure, cached
  load behavior, preload, and policy reporting.

Heavy route families should not be extracted as eager modules while this is
missing. Flights is the first proving slice for lazy extraction.

### Phase 2: Co-locate runtime specifiers, factories, and option builders

Introduce a co-located runtime unit list for the operator deployment.

This phase should:

- define one entry per module/extension with its manifest specifier, factory,
  and typed option builder.
- derive `OPERATOR_RUNTIME_MANIFEST` from that list.
- derive `operatorComposition` from that list.
- update `voyant.config.ts` or generated config inputs to consume the same
  manifest entries where practical.
- make `diffManifestRegistry(...)` / `voyant db doctor` parity a hard CI gate
  before any route extraction depends on manual manifest/registry sync.
- keep `OperatorCapabilities` as a gathering point, but require each runtime
  entry to call a typed per-module option builder before invoking the package
  factory.

This is the clean-import slice: adding a module should mean adding one runtime
unit entry plus any required deployment adapters, not editing an array, a
registry map, and a capabilities bag in unrelated places.

### Phase 3: Move mount-only package factories into composition

Start with routes where the reusable factory already exists.

Candidates:

- `catalog-booking.ts`: the shared quote/draft/hold/book route factory already
  exists in `@voyant-travel/catalog/booking-engine`. Move the reusable
  `createCatalogBookingApiModule(...)` entry into `operatorComposition`; keep
  slots, order management, and snapshot enrichment local until classified.
- `booking-tax-preview.ts`: `@voyant-travel/finance` already exports
  `mountBookingTaxRoutes(...)`, which mounts under `/v1/admin/bookings` — finance
  behavior on the bookings surface, i.e. an extension, not a standalone module.
  Finance is **already** a composed module in `OPERATOR_RUNTIME_MANIFEST`, so add
  this as a new finance extension entry rather than a new module.
- `channel-push.ts`: `@voyant-travel/distribution` already owns
  `createChannelPushAdminRoutes()`. Distribution is **already** composed (a module
  plus `distributionBookingExtension`), so fold this in as one more distribution
  extension entry rather than introducing a new owner.
- `catalog-content.ts`: product, cruise, and accommodation content route
  factories already exist. Promote each vertical to export a API module or
  extension so the operator does not manually route each vertical.

This phase should mostly delete manual mounts without redesigning route bodies.

Catalog booking is the easy catalog slice because the reusable route factory
already exists. Catalog checkout is not part of this phase: checkout start,
materialization, tax, finalize, signature, and workflow runtime code are a
composite route family and should be classified after simpler extractions.

### Phase 4: Extract stable route families from starter implementation

Promote route families whose contracts are reusable but whose current
implementation uses deployment adapters.

Candidates:

- `flights.ts` -> `@voyant-travel/flights` route module.
  - Options: flight adapter resolver, reference data provider, payment session
    starter, order payment session helper, actor/correlation resolver.
  - Keep connector selection outside the Flights domain package.
  - Use a lazy route contribution so the extraction preserves the Worker
    cold-start and bundle-size behavior of the current starter.
- `payment-link-routes.ts` and `lazy-additional-routes.ts` -> public routes on
  the **existing** finance module (or a `@voyant-travel/finance/checkout`
  sub-module), not a new sibling module. Finance is already composed and already
  receives `resolvePaymentStarters`, `resolvePublicCheckoutBaseUrl`, and
  `resolveBankTransferDetails`, so this is a public route contribution on a
  module that exists.
  - Options (already wired into finance today): payment providers, public
    checkout base URL, bank-transfer settings, notification dispatcher.
- `proposal-routes.ts` -> Proposals lifecycle route module or Proposal
  presentation extension.
  - Options: notification provider, public proposal URL signer, acceptance
    workflow callbacks.
- `media-upload-routes.ts` -> storage/media infrastructure module plus
  inventory brochure extension.
  - Options: object storage adapter, upload ticket signer, media public URL
    policy.
- `contract-document-routes.ts` -> legal/document delivery route module.
  - Options: document generator, storage, download URL resolver.
- `catalog-offers.ts` -> catalog offer/search route module or adapter extension.
  - Split reusable catalog offer contract from operator-only search enrichment.
- `catalog-checkout*.ts` stays out of the first extraction wave.
  - Treat checkout as a composite workflow extraction once the route
    contribution, lazy-loading, and policy metadata model has proven itself.

Each extraction should follow the same shape:

1. define package route options.
2. move request schemas near the package route module.
3. move route tests into the package.
4. keep the existing URL contract stable.
5. update the operator runtime unit to build typed package options from
   deployment capabilities.
6. delete the operator-owned handler body.

### Phase 5: Classify starter-local settings, diagnostics, and hard composites

Some routes may remain deployment-owned:

- action ledger synthetic health checks.
- one-off migration repair routes.
- local operational settings whose schema lives only in the starter.
- MCP routes if the framework does not intend to support them as a reusable
  package interface.
- catalog checkout routes until their workflow and materialization ownership is
  intentionally split.

For each remaining route, document why it is deployment-owned. If the reason is
"uses a starter-local table", decide whether that table is part of a reusable
operator settings module. If yes, promote the table and routes together. If no,
keep it local, wrap it as a deployment-local module/extension, and annotate it
in the ownership inventory.

### Phase 6: Tighten route policy checks

After the first extractions, turn route policy reporting into enforceable
checks:

- package-declared anonymous public paths must be acknowledged by the
  deployment before they become auth bypasses.
- the effective anonymous public list should be visible in capabilities or a
  diagnostic report.
- transactional prefixes must be narrow; broad prefixes such as `/` require a
  documented reason or the broader `module.requiresTransactionalDb` flag.
- route contribution path metadata should be checked against mounted routes so
  policy does not drift from the Hono route definition.

### Phase 7: Assert route descriptors against mounted routes

ADR-0003 introduces admin operation descriptors and a capabilities endpoint.
Those descriptors become more valuable if they can be checked against mounted
routes.

Add a CI checker that asserts:

- every operation descriptor path belongs to a mounted module or extension.
- every mounted supported admin operation has a descriptor or an explicit
  internal-only annotation.
- descriptor method/path metadata stays in sync with route tests.

This should be a follow-up after route ownership is clarified. Do not make the
descriptor system responsible for fixing route ownership.

## Verification Strategy

For every extraction:

- run the package test and typecheck lanes for the route owner.
- run the operator typecheck.
- run route shape tests that mount the package module through `createApp`, not
  only by mounting the raw Hono sub-app.
- run existing starter tests for any route family that moved.
- run `pnpm verify:package-exports` if package exports change.
- run `pnpm verify:fast` for broad changes touching shared Hono behavior.

Recommended package test pattern:

1. invalid JSON returns the shared validation shape.
2. invalid query returns the shared validation shape.
3. route delegates to the injected adapter/service with resolved context.
4. route maps known domain errors to stable HTTP responses.
5. admin/public mount paths are covered through `createApp`.
6. route policy metadata resolves to expected transactional prefixes and reports
   anonymous requirements separately from deployment acknowledgements.

## Acceptance Criteria

This proposal is complete when:

- New reusable route interfaces are added to packages, not starters.
- Route-bearing deployment-local code enters through `ApiModule` or
  `ApiExtension`, not `additionalRoutes`.
- The operator starter's `additionalRoutes` contains only temporary migration
  bridges with deletion targets, or disappears entirely.
- A second deployment can install a module, add it to the manifest, supply the
  required adapters, and get the expected route interface without copying
  starter route handlers.
- Runtime module specifiers and factories are co-located, or parity between the
  manifest and registry is a hard CI gate.
- Deployment capability containers are converted into typed per-module options
  before calling package factories.
- Package routes can declare anonymous public access requirements, but the
  deployment must explicitly acknowledge the effective auth bypass list.
- Transactional DB requirements for package routes use narrow route
  contribution prefixes unless the whole module sets `requiresTransactionalDb`.
- Heavy route families can be lazy-loaded through `@voyant-travel/hono` without
  being mounted through starter-local helper code.
- Route tests live with the package that owns the route interface.
- A checker prevents new `/v1/*` route handlers under `apps/*` without an
  explicit ownership annotation.

## Non-Goals

- Do not introduce a new routing framework.
- Do not wrap Hono in a custom route DSL just to make it look framework-neutral.
- Do not make plugins the default runtime abstraction.
- Do not move every route out of the operator starter in one PR.
- Do not add in-process tenant scoping to packages.
- Do not force every package to expose public routes.
- Do not expose internal helpers as public package exports just because a route
  uses them.
- Do not replace app-specific routes with artificial modules when the route is
  truly local.

## Recommended Answers

### Route contribution shape

Use `adminContribution` and `publicContribution` as the long-term interface.
Keep `adminRoutes` and `publicRoutes` as compatibility shorthands that
`createApp` internally normalizes into contributions.

Do not add `lazyAdminRoutes` and `lazyPublicRoutes` as the long-term shape.
Those names solve only loading mode, while the real interface also needs route
matchers, policy metadata, preload behavior, and diagnostics. A single
`ApiRouteContribution` keeps eager routes, lazy routes, route policy, and
tooling metadata at the same seam.

### Admin mount paths

Do not add general `adminPath` symmetry with `publicPath`.

Admin route paths should remain tied to the module or extension name:
`/v1/admin/{module}`. That keeps admin URLs, permission resource derivation,
transactional DB routing, and admin operation descriptors predictable. Public
routes need `publicPath` because customer-facing URLs sometimes need cleaner
capability names or root mounting; admin routes optimize for operator
debuggability and stable ownership.

If a framework route truly needs a root-scoped admin URL, make it a built-in
framework route such as `/v1/admin/_meta/*`, not a module-level `adminPath`
escape hatch.

### Lazy route matchers

Declare lazy route `paths` explicitly in the route contribution.

`createApp` needs matchers before the lazy bundle is imported; deriving them
from the Hono app at runtime would defeat lazy loading. To avoid drift, keep the
paths co-located with the route factory and add tests/checkers that assert:

- every declared lazy path reaches a handler after loading.
- every supported operation descriptor path is covered by a mounted
  contribution.
- stale declared paths fail package tests or architecture checks.

Descriptors can generate or validate paths later, but the first-class runtime
input should be explicit static metadata.

### Preload modes

Keep the first implementation to three modes:

- `startup`
- `ready`
- `first-request`

Do not add route-level priorities yet. The manifest already gives stable module
order, and route-priority scheduling adds complexity before there is evidence
that it improves Worker cold-start behavior. If preloading contention becomes a
measured problem, add a small priority field later with data from bundle timing
and request traces.

### Anonymous public acknowledgements

Add a separate deployment acknowledgement list, tentatively named
`acknowledgedAnonymousPublicPaths`.

Do not overload `publicPaths` for package-declared anonymous requirements.
Keeping two lists makes review clearer:

- package contributions declare `requiresAnonymousPublicAccess`.
- deployments acknowledge those framework/package requirements in
  `acknowledgedAnonymousPublicPaths`.
- deployment-only anonymous exceptions stay in `publicPaths`.

`createApp` should use the union as the effective auth bypass list, but tooling
should report the two sources separately. In strict mode, a package-declared
anonymous path that is not acknowledged should fail.

### Route ownership inventory

Use both Markdown and machine-readable data.

The source of truth should be a small checked-in JSON file consumed by the
route-ownership checker. The Markdown doc should summarize the categories and
link to the generated/report output for human review. This avoids a doc-only
inventory drifting from enforcement while keeping architectural intent readable.

Recommended JSON shape:

```json
{
  "apps/operator/src/api/flights.ts": {
    "owner": "candidate-package",
    "target": "@voyant-travel/flights",
    "notes": "Extract through lazy API route contribution."
  }
}
```

### Operator settings ownership

Treat operator settings as a framework module unless a specific setting is
provably starter-only.

The current settings surface includes operator profile, payment instructions,
payment defaults, and public operator profile/settings reads. Those are not just
local UI preferences; they are part of booking, checkout, legal document, and
public storefront behavior. Long term, they should move into an
operator-profile or operator-settings infrastructure module with a Hono route
contribution and schema ownership.

Starter-local settings should be limited to deployment knobs that have no
portable product meaning, such as local dev toggles or diagnostics.

## First Five PRs

1. Add the route ownership checker. **(done — this PR)**
   - `scripts/check-route-ownership.mjs`, wired as `pnpm verify:route-ownership`,
     scans `apps/*​/src/api` for direct `/v1/*` route definitions and new
     `additionalRoutes` usage.
   - The current 15 route-bearing files are baselined in
     `scripts/route-ownership-baseline.json` (per-file `/v1/` route counts).
   - It fails only on new drift: a new route-bearing starter file, a count above
     baseline, or a new `additionalRoutes` block — and warns (non-blocking) when
     a file drops below baseline so extractions keep the baseline honest.
   - A `// voyant-route-owner: <reason>` annotation marks an explicit
     deployment-local decision and exempts a file from baseline enforcement.
   - `--report` runs report-only (never fails) for the initial soak period.
   - Classification of every file lives in
     [Route Ownership Inventory](./route-ownership-inventory.md).

2. Add first-class lazy API route contributions.
   - Implement `adminContribution` and `publicContribution` in
     `@voyant-travel/hono`, with `adminRoutes` / `publicRoutes` normalized as
     compatibility shorthands.
   - Preserve the current `mountLazyRouteApp(...)` behavior behind package-owned
     route metadata.
   - Add tests for first-request loading, cached loading, preload,
     transactional path selection, and anonymous-path reporting.

3. Co-locate operator runtime entries.
   - Introduce a runtime unit list that pairs each specifier with its factory
     and typed option builder.
   - Derive the runtime manifest and composition registry from that list.
   - Make manifest/registry parity a hard CI gate until the derived form fully
     replaces the parallel lists.
   - Keep `OperatorCapabilities` as a gathering point but stop exposing it as a
     package module interface.

4. Move mount-only reusable route factories into manifest composition.
   - Start with catalog booking shared routes and channel push.
   - Preserve the current URLs.
   - Leave mixed local routes in place with ownership comments.

5. Extract `@voyant-travel/flights` Hono routes.
   - This is a useful vertical slice because the package already exists and the
     starter route file is a self-contained route family.
   - Use the lazy route contribution path so the Worker cold-start and
     bundle-size behavior does not regress.
   - The deployment supplies the demo connector and payment integration through
     route options.
   - Package tests prove route shape and adapter delegation.
