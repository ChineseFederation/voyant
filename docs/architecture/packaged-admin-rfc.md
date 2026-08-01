# Packaged Admin RFC (the admin ships as a versioned app, projects become hosts)

Status: RFC / proposal — tracked in voyant#1643; motivated by voyant#1641
(incident & delivery-model analysis)
Audience: anyone who has shipped a fix to `apps/operator` and realized
existing deployments will never receive it; anyone scaffolding a new client
project and wondering which of the ~40k copied lines they actually own.

Related: [`admin-architecture.md`](./admin-architecture.md) (this RFC revises
Rule 2 — see §7), [`frontend-package-strategy.md`](../frontend-package-strategy.md),
[`migration-resilience-rfc.md`](./migration-resilience-rfc.md) (the same
"one manifest drives everything" principle, applied to the admin surface),
[`adr/0003-admin-api-contract-sdk.md`](../adr/0003-admin-api-contract-sdk.md).

---

## 0. TL;DR

Voyant has **two delivery models** for the same product:

- **Backend:** config-driven. `createApp({ modules, extensions, plugins })`
  plus the `voyant.config.ts` manifest. A fix in `@voyant-travel/hono` or any module
  reaches every deployment as a version bump.
- **Admin frontend + worker infrastructure:** fork-and-own. Every project
  starts as a copy of `apps/operator` and immediately diverges. A fix in
  the template reaches **zero** existing deployments.

voyant#1641 documents what that costs: the #1636 outage ("admin never loads")
was fixed by #1638, whose package half shipped automatically and whose template
half (`entry.ts` / `api-dispatch.ts`) had to be hand-ported into every
diverged project. Same fix, two delivery models, and the load-bearing half was
the manual one. The same pattern recurs with every starter-level improvement
(#1631/#1637 cold-start chunking, #1642 SSR preloads).

The fork surface today, measured on `apps/operator`:

| Surface | Size | Delivery today |
| --- | --- | --- |
| Route files (`src/routes/**`) | 103 files, ~8,100 LOC | copied, diverges |
| Components (`src/components/**`) | 158 files, ~33,200 LOC | copied, diverges |
| Worker entry + dispatch (`entry.ts`, `api-dispatch.ts`) | ~380 LOC | copied, diverges |
| Build config (`vite.config.ts` incl. chunking, SSR preloads) | copied, diverges |
| Backend wiring (`createApp` + manifest) | config | ✅ version bump |

**Proposal: invert ownership of the admin.** The admin becomes a versioned
application delivered by `@voyant-travel/admin` (`createAdminApp(...)`). Domain
packages contribute their pages, navigation, and widgets through the
`AdminExtension` seam that already exists and that `apps/operator`
already uses for promotions, trips, and the action ledger. The worker dispatch
and build preset become packages. A project shrinks to:

1. `voyant.config.ts` — the manifest (modules, extensions, plugins, admin config)
2. thin entry files that call package factories
3. `src/admin/` — genuinely custom pages, widgets, and overrides

This is the model mature platform products converged on: the dashboard arrives
as a dependency, customization happens through sanctioned extension points,
and upgrading the admin is a dependency bump. The invariant we are adopting:

> **A project's copied surface must equal its genuinely custom code.**
> Everything load-bearing arrives through a version bump.

Consequences we are accepting up front:

- `templates/dmc` and `apps/dev` are **deleted**. They are stale forks of the
  same surface (we only use `apps/operator`), and they are the first
  victims of the model this RFC removes.
- **Fork-and-own is retired entirely — including the source-installed
  (registry) UI strategy.** There are exactly two ways to consume Voyant:
  build on it (manifest + extension points + imported `@voyant-travel/ui` /
  `*-ui` packages) or fork the repository and own everything. No partial
  forks via copied files or registry-installed component source. `*-ui`
  packages become ordinary versioned dependencies; the shadcn-style registry
  (`apps/registry`, per-package `registry/` dirs) is removed.
- `admin-architecture.md` Rule 2 ("keep the final admin shell starter-owned")
  is **superseded**, and so are Rules 8–9 (the source-installed UI block
  layer): the shell becomes framework-owned; projects own composition via
  config and extensions, not via copied shell or component code.
- No template-upgrade/codemod tooling. We are going straight to the packaged
  model; the template that remains is thin enough that "upgrading" it is not a
  meaningful operation.

---

## 1. The problem: template-delivered infrastructure cannot receive fixes

### 1.1 Two delivery models for one product

When a fix spans a package and the template, downstream projects get exactly
half of it:

| Change (from #1638) | Lives in | Downstream delivery |
| --- | --- | --- |
| CORS preflight fix | `@voyant-travel/hono` | ✅ version bump |
| Lean `/api/auth/*` dispatch | template `entry.ts` / `api-dispatch.ts` | ❌ hand-port |

A missed hand-port is invisible until it breaks, and template code is exactly
the load-bearing infrastructure (auth dispatch, cold-start chunking, SSR
preload policy) where a miss is severe. #1636 was a hard production outage.

### 1.2 The fork tax compounds per project

Every client project re-pays the port cost for every template fix, forever.
This actively discourages keeping projects current — each upgrade is manual
surgery on diverged files — which means the gap between "what Voyant ships"
and "what deployments run" only grows. For enterprise projects, where
stability and a credible upgrade story are procurement requirements, this is
disqualifying.

### 1.3 We are our own first victim

`templates/dmc` and `apps/dev` are in-repo forks of the same admin surface
(`apps/dev` overlaps `templates/dmc` by ~60–70% with dozens of extra diverged
routes). Fixes landed in one and missed the others routinely. The repo
demonstrates the failure mode before any client does.

---

## 2. Principles

1. **One delivery model.** Framework-owned code ships in versioned packages —
   frontend and worker infrastructure included, not just backend modules.
2. **Copied surface = custom code.** If a file in a project is not custom
   business logic or custom UI, it should not exist in the project.
3. **Extension points before overrides.** Customization flows through typed,
   sanctioned seams (routes, navigation, widget slots, component overrides).
   Overriding a framework-owned page is an explicit, registered act — never
   silent file divergence.
4. **Two consumption modes, nothing in between.** Build on Voyant (manifest +
   extensions + imported UI packages, everything upgradeable) or fork the
   repository and own the whole stack. A partial fork — copied template
   files, registry-installed component source — combines the upgrade story of
   a fork with the expectations of a dependency, and is exactly what produced
   the incident class in §1. It is no longer a supported mode.
5. **The manifest drives composition.** `voyant.config.ts` already lists
   modules/plugins and is becoming the source of truth for migrations
   (migration-resilience RFC). The admin reads from the same composition: the
   modules you mount determine the pages, nav, and widgets you get.
6. **The admin is a product surface, not a starter.** It has a version, a
   changelog, and a compatibility contract — like every other package.

---

## 3. Current state: most of the machinery already exists

What we have (and is already exercised in `apps/operator`):

- **`@voyant-travel/admin`** — shell primitives, providers (query/theme/locale/i18n),
  navigation resolution, dashboard page, and the extension system:
  `AdminExtension`, `defineAdminExtension()`, `createAdminExtensionRegistry()`,
  `resolveAdminNavigation()`, `resolveAdminWidgets()`, `AdminWidgetSlot`.
- **Live extension usage** — `apps/operator/src/lib/admin-extensions.tsx`
  registers three extensions (promotions, trips, action-ledger).
  Today they contribute **navigation only** (the route components behind
  those nav entries are still starter-local route files), and 7 widget
  slots are exposed (`dashboard.header`, `dashboard.after-kpis`,
  `dashboard.footer`, `booking.details.header`,
  `booking.details.after-summary`, `invoice.details.header`,
  `invoice.details.after-summary`) with renderers in the booking and
  invoice detail pages.
- **42 `@voyant-travel/*-react` / `*-ui` packages** already imported by the
  operator — the domain UI largely lives in packages; the template wraps it
  in locally-owned pages.
- **`voyant.config.ts`** — manifest with `admin: { enabled, path }`, the
  module list, plugins, and feature flags; `composeFromManifest(...)` already
  drives backend composition.
- **Typed admin API surface** — ADR-0003's `admin-contracts` / `admin-client`.

What is missing — the actual gap this RFC closes:

- **Nobody owns the route tree but the template.** `AdminUiRouteContribution`
  is metadata-only by design (`{ id, path, title }` —
  `packages/admin/src/extensions.ts`); the 103 route files and the TanStack
  Router tree are starter-local. A package cannot ship a page.
- **No `*-ui` package exposes an admin entrypoint.** There is no
  `@voyant-travel/<domain>-ui/admin` export anywhere today; §4.2's extension
  exports are new surface that each domain package must grow.
- **Nothing ties the manifest to the admin.** Mounting a module in
  `voyant.config.ts` does not produce (or verify) its admin pages/nav — the
  same two-place-registration trap the migration-resilience RFC closes for
  schemas exists for the admin surface.
- **The shell composition is template code.** Providers, auth flows, nav
  shell, and layout wiring are copied per project.
- **Worker dispatch and build config are copied files**, not package exports.

---

## 4. Design

### 4.1 `createAdminApp` — the admin as a package-owned application

`@voyant-travel/admin` owns the packaged staff shell through app-oriented subpaths
(`@voyant-travel/admin/app/*`). During the package-boundary migration,
`@voyant-travel/admin-app` re-exports those shell helpers for compatibility and owns
the domain-backed core extension bundle; that bundle imports first-party domain
React packages that depend back on the admin extension surface, so it must not
sit in `@voyant-travel/admin`.
A future factory can still consolidate the host wiring:

```ts
// src/admin/index.ts in a project — illustrative, not final API
import { createAdminApp } from "@voyant-travel/admin/app";
// generated from voyant.config.ts — see "manifest-driven composition" below
import { adminExtensions } from "./admin.extensions.generated";
import { customExtensions } from "./extensions";

export const admin = createAdminApp({
  basePath: "/app",
  extensions: [...adminExtensions, ...customExtensions],
  branding: { name: "Acme Travel", logo: AcmeLogo },
  navigation: { /* optional ordering / grouping overrides */ },
  locale: { default: "en" },
});
```

The factory owns: the route tree, the auth flows (sign-in/up, reset, invites,
onboarding — today ~8 copied route files backed by `@voyant-travel/auth-react/ui`), the
provider stack, the nav shell, error/loading boundaries, and the dashboard.
All of it versioned, none of it copied.

**Manifest-driven composition.** Hand-importing one extension per mounted
domain recreates the two-place-registration trap (mount the module, forget
the admin) that the migration-resilience RFC eliminates for schemas. We apply
its exact mechanism here:

- Each domain package declares its admin entry — convention
  `@voyant-travel/<domain>-ui/admin` (a new export none of the `*-ui` packages
  has today), discoverable via a `package.json#voyant.adminEntry` field for
  non-conventional cases.
- The CLI generates a committed `admin.extensions.generated.ts` from
  `voyant.config.ts`: for every mounted module, resolve its admin entry (if
  it has one) and emit the import + registration. Static imports, so
  bundling/tree-shaking and route code-splitting still work — generated, not
  dynamic.
- **Parity check** (the `voyant doctor` family, run in CI): for every mounted
  module with an admin entry, the resolved extension set must contain it;
  for every registered extension, its nav entries must resolve to routes the
  assembled tree actually contains. Mounted module ↔ admin extension ↔
  route/nav entries — a mismatch is an un-mergeable error, not a 404 found
  in production.

### 4.2 Packages ship pages: route contributions become real components

`AdminExtension` grows from route *metadata* (`{ id, path, title }` today) to
route *implementations*. A bare `{ path, component }` pair is not enough to
replace the 103 starter route files — those files currently carry loaders,
search-param validation, SSR decisions, and boundaries. The contribution
contract has to carry everything a route file can express today, or Phase 2
stalls on the first non-trivial page:

```ts
// inside @voyant-travel/bookings-react — illustrative shape, not final API
export const bookingsAdmin = defineAdminExtension({
  id: "bookings",
  navigation: [{ to: "/bookings", label: "Bookings", icon: CalendarCheck, order: 20 }],
  routes: [
    {
      path: "/bookings/$bookingId",
      component: BookingDetailPage,        // lazy-importable for code-splitting
      loader: bookingDetailLoader,         // data loading (admin-client based)
      validateSearch: bookingSearchSchema, // typed search params
      ssr: true,                           // per-route SSR/CSR/data-only mode
      pendingComponent: BookingDetailSkeleton,
      errorComponent: BookingDetailError,  // defaults from the shell if omitted
      head: bookingDetailHead,             // title/meta
      capability: "bookings.read",         // permission/capability gate,
                                           // enforced by the shell before render
      i18n: bookingsAdminMessages,         // namespaced locale bundles
      preload: "intent",                   // preload policy, feeds the SSR
                                           // manifest restriction (#1642)
    },
  ],
  widgets: [/* contributions into other domains' slots */],
});
```

Phase 2 must-haves: `component` (lazy), `loader`, `validateSearch`, `ssr`,
pending/error boundaries, `head`, `capability`, and the i18n bundle — these
are the features the existing operator route files actually use. `preload`
tuning and anything beyond can follow. The deliberate non-goal: the contract
mirrors what route files express, it does not invent a new abstraction over
the router — `createAdminApp` maps contributions ~1:1 onto code-based route
definitions.

**Routing mechanics.** File-based routing cannot express package-contributed
pages, so `createAdminApp` assembles a **code-based TanStack Router tree** from
the extension list. TanStack Router supports this fully; we trade file-based
codegen for config-driven assembly — which is the entire point. A build-time
generation step (a Vite plugin emitting a typed route tree from the resolved
extension list, restoring fully typed `Link`s across packages) is a Phase-2+
optimization, not a prerequisite.

**SSR/preload policy** (the #1642 class of fix) moves inside the factory: the
package knows the active route set because it built the tree.

**Implementation findings** (from the Phase 3 domain migrations):

- *Zero-prop components only — since dissolved.* The original
  `AdminUiRouteContribution.component` attached cleanly only when the host
  was a zero-prop component, so param-taking detail hosts stayed bound by
  thin starter route files. The §4.8 endgame replaced that contract with
  lazy `page` modules receiving `AdminRoutePageProps`
  (`params`/`search`/`updateSearch`/`title`), so param-taking pages bind
  without any host route file.
- *Destination shape convention.* Destinations re-declare only closed,
  stable shapes. Keys whose param unions still evolve — e.g.
  `booking.detail`'s tab union — type-only-import the union from the owning
  package instead of copying it, so the declaration cannot drift.

### 4.3 Navigation and widgets: the existing seam becomes the only path

Nothing new to design — `resolveAdminNavigation` and `AdminWidgetSlot` exist
and work. The change is policy: the template's hand-rolled sidebar and nav
constants are deleted; navigation is the merge of extension contributions plus
the project's `navigation` overrides in `createAdminApp`. Widget slots stay
intentional and few (per `admin-architecture.md` Rule 7) but the slot catalog
becomes a documented, versioned contract of the admin package.

### 4.4 Worker runtime and build preset become packages

Directly per voyant#1641's suggested directions:

- **`@voyant-travel/runtime-core`** (or an export of `@voyant-travel/hono`):
  `createWorkerFetch({ ssrHandler, authApp, apiApp })` — the current
  `api-dispatch.ts` (97 LOC) plus the **fetch-side** parts of `entry.ts`:
  API/auth/SSR dispatch and the SSR-manifest-restriction logic (#1642).
  Scoping is deliberate: `entry.ts` (287 LOC) also owns the cron
  `scheduled()` handler, lazy workflow-runtime loading, and the workflow
  step-service registry. Those are
  app-specific composition (which crons exist, which services steps may
  resolve) and **stay app-owned in Phase 0** — Phase 0 packages only the
  load-bearing dispatch logic that caused the #1636 incident class. A fuller
  `defineWorkerRuntime({ fetch, scheduled, durableObjects })` that also
  standardizes cron registration and workflow-DO wiring is a candidate
  follow-up, tracked as an open question (§8), not a Phase 0 deliverable.
- **`@voyant-travel/vite-config`**: `voyantAdminPreset()` carrying the manual-chunk
  / cold-start tuning and SSR preload configuration. A project's
  `vite.config.ts` becomes preset + project-specific additions.

These two are independent of everything else in this RFC, are small, and would
have prevented the #1636 incident class outright. They go first (Phase 0).

### 4.5 The customization model (what enterprises get instead of a fork)

In order of preference, all typed and all upgrade-safe:

1. **Config** — branding, locale, nav ordering/grouping, feature toggles via
   `createAdminApp` options and `voyant.config.ts`.
2. **Widget slots** — inject cards/panels/actions into the documented slots.
3. **Custom extensions** — full custom pages + nav entries via
   `defineAdminExtension` in project code (`src/admin/`), exactly like the
   operator's promotions/trips/action-ledger extensions today.
4. **Component overrides** — a registered override map for specific
   framework-owned pages or blocks (`overrides: { "bookings.detail": MyPage }`).
   This is the escape hatch: explicit, named, visible in one place, and
   greppable when upgrading — the opposite of silent file divergence. An
   override is built the same way framework pages are built: by composing the
   exported components, hooks, and primitives of `@voyant-travel/ui` and the
   domain `*-react` / `*-ui` packages — not by copying their source. If the
   exported surface is not rich enough to build a needed override, that is a
   gap in the package's public API and gets fixed there, where the fix
   benefits every project.

### 4.6 What a project looks like after

```
acme-travel/
  voyant.config.ts          # modules, plugins, admin config — the manifest
  wrangler.jsonc            # bindings
  vite.config.ts            # voyantAdminPreset() + ~nothing
  src/
    entry.ts                # createWorkerFetch(...) — thin wiring
    api/app.ts              # createApp / composeFromManifest — already thin
    admin/
      index.ts              # createAdminApp({ extensions, branding, ... })
      extensions/           # custom pages, widgets, overrides (CUSTOM CODE)
  drizzle/                  # migrations (per migration-resilience RFC)
```

Every file is either the manifest, thin wiring, or genuinely custom code.
A dispatch fix, a cold-start fix, a new bookings page, an admin shell fix —
all arrive with `pnpm update`.

### 4.7 Navigation injection: semantic destinations

The catalog pilot surfaced a blocker the §4.2 route contract alone does not
solve: **interlinked pages cannot leave the template while they import the
host's typed router.** The operator's catalog wrappers exist almost entirely
to inject `useNavigate` calls into packaged pages — into the booking journey,
the supplier page, the product editor — and every one of those calls is typed
against the app's generated route tree. A package cannot ship a page that
links to a route it does not own.

The fix makes navigation an injected capability, the way data fetching
already is. Packages express navigation as **semantic destination keys**;
the host resolves keys to hrefs exactly once:

- `@voyant-travel/admin` ships an empty `AdminDestinations` interface plus
  `AdminNavigationProvider`, `useAdminHref`, and `useAdminNavigate`. The
  hooks never throw in render paths: an unresolvable key warns once and
  degrades to `"#"` (href) or a no-op (navigate).
- A domain package declares the destinations its pages need via declaration
  merging — `declare module "@voyant-travel/admin"` adding e.g.
  `"supplier.detail": { supplierId: string }`. Naming convention:
  `<entity>.<action>` (`"product.detail"`, `"catalog.detail"`).
- The host registers one resolver map and hands it to the workspace shell
  (`AdminWorkspaceShell destinations={...}` in `@voyant-travel/admin/app/workspace`), which
  injects router navigation behind the provider. `satisfies
  AdminDestinationResolvers` makes the map exhaustive: mounting a package
  that declares a new destination fails the host's typecheck until the key
  resolves.

This is the same `Register`-style declaration merging TanStack Router uses
for its route tree, applied to cross-domain links: typed keys, no runtime
registry.

**Endgame — delivered: generated resolver maps.** A destination is
ROUTE-BACKED when its semantics map 1:1 onto one contributed route's path
with only param interpolation (`"supplier.detail"` → `/suppliers/$id`). The
binding is DECLARED, never inferred: `AdminUiRouteContribution` carries
`destination?: AdminDestinationKey` (plus `destinationParams?:
Record<string, string>` for route-param → destination-param renames, e.g.
`{ id: "supplierId" }`), and domain packages annotate the route that
satisfies each key. `voyant admin generate --destinations` statically scans
the annotations and emits the committed
`src/admin.destinations.generated.ts` — one `encodeURIComponent`
path-interpolation resolver per binding, `satisfies
Partial<AdminDestinationResolvers>`, with the usual generated header +
ejection contract and `--check` drift gate. The host map shrinks to
`{ ...generatedAdminDestinations, ...custom } satisfies
AdminDestinationResolvers`: of the operator's 36 destination keys, 29 are
generated; hand-written are only the genuinely custom seven — search-param
construction (`booking.detail`, `catalog.detail`), the multi-route
`catalog.browse`, and host-owned pages (`product.detail`, `legal.home`).
`voyant admin doctor`'s Finding D is now
two-tier: the GENERATED portion is a gate (annotated destination missing
from the generated module, generated resolver whose annotation vanished, or
content drift → exit 1, aligned with `--check`), while custom-resolver
parity against the declared keys stays report-only.

### 4.8 Route assembly, endgame: the code-assembled extension route tree

**Delivered.** Extension-contributed admin routes exist as **no per-route
files** in the host. The operator's file-based tree retains only the shell
(`__root`, the `_workspace` layout, auth/storefront routes), genuinely
custom pages, and index redirects; all ~49 package-delivered routes across
the 10 admin domains are assembled in code from the extension contributions.

**Why grafting, not virtual file routes.** Both candidate mechanisms were
evaluated against the shipped TanStack Router/Start versions:

- *Virtual file routes* (`@tanstack/virtual-file-routes` +
  `router.virtualRouteConfig`) cannot make package routes fileless: the
  generator derives each route's identifier from its **file path**
  (`routePathToVariable(removeExt(filePath))`), so N virtual routes sharing
  one binder file collide in `routeTree.gen.ts`, and the generator rewrites
  the shared file's `createFileRoute("<id>")` literal to each route's id in
  turn, thrashing the file on every regen. One binder file per route is the
  only supported shape — which is still a per-route file.
- *Code-based grafting* is fully supported: `ssr` is a plain per-route
  option (the per-route SSR semantics survive verbatim), `addChildren`
  mutates and returns the same route instance, and `_addFileTypes<T>()` is a
  type-only re-stamp of the whole tree. The last one is what rescues typed
  links — TanStack resolves `Link`/`navigate` types through
  `InferFileRouteTypes<TRouteTree>` when the tree carries file-route types,
  so a merged interface restores full typed links for grafted routes.

**The contribution carries the page — lazily.** `AdminUiRouteContribution`
grew `page?: () => Promise<AdminRoutePageModule>`: a lazy module loader the
host binder wraps in the router's lazy-component machinery, so every
packaged page stays in its own chunk (the cold-start discipline of
#1631/#1637) and hover/intent preloading fetches it ahead of navigation.
The resolved component receives `AdminRoutePageProps` —
`{ params, search, updateSearch, title }` — which dissolves the old
"zero-prop components only" restriction: a param-taking detail page is just
a page that reads `params` from props. `AdminRouteLoaderContext` gained
`params` for the same reason. Loader helpers co-located with page modules
are dynamically imported *inside* the loader so they cannot pin the page
chunk into the host's entry graph; loader + page resolve the same chunk,
fetched once.

**The host side.** `@voyant-travel/admin/app` exports the binder:

- `adminExtensionRouteOptions(extension, routeId, runtime)` resolves a
  contribution (via `requireImplementedAdminRoute`, which fails at module
  evaluation if an extension stops shipping a bound route) and returns the
  router-facing options — lazy component, loader bound to
  `{ queryClient, runtime, params }`, per-route `ssr`, boundaries — ready to
  spread into a code-based `createRoute({...})`.
- `attachAdminExtensionRoutes(routeTree, parentRoute, routes)` grafts the
  built routes under the file-based workspace layout, idempotently
  (replace-by-path), so dev-server module re-evaluation never duplicates
  children. The file-route generation watcher is untouched — it only scans
  `src/routes`, and the grafted routes are invisible to it.

The host keeps one checked-in generated module
(`src/admin.routes.generated.tsx`, the `voyant admin generate --routes`
emission target): per extension route, a `createRoute` call carrying the
**path literal** and the **typed search schema import** — the two things
that must stay literal for typed links — plus the spread binder options.
The module also emits the three typed-link maps
(`AdminExtensionRoutesByFullPath`/`ByTo`/`ById`); `router.tsx` merges them
with `routeTree.gen.ts`'s `FileRouteTypes` and re-stamps the grafted tree
via `_addFileTypes<OperatorFileRouteTypes>()`. Typed `Link`/`navigate` to
extension routes (params *and* search) work exactly as they did for the
file routes. Extension instances are resolved from the host-owned registry
(`src/lib/admin-extensions.tsx`), so app-supplied factory options compose
into the assembled routes — the sanctioned seam replacing app-local route
files (e.g. bookings' `indexHeaderActions` and `detailPageComponent`, which
injects the operator's payment-dialog wrapper without a package cycle).

**Ejection semantics carry forward.** The generated module opens with the
`// GENERATED by voyant admin generate --routes` header; ejecting a route
means removing it from the module (and its map entries) and adding a
hand-written route file — explicit and greppable, same contract as the
generated-file increment.

**What stays a file (and why).** Beyond the shell and genuinely custom
pages (trips, action-ledger, settings, account, flights, channel-sync,
products editor, compose/journey pages, index redirects), two extension
routes remain host route files: `finance/supplier-invoices/` index + detail.
Their pages are wired to app-owned capabilities the contribution contract
does not carry yet — direct file uploads to the app's `/v1/admin/uploads`, inline
supplier creation, and cross-domain target search — so their contributions
stay metadata-only until the finance package API can express that wiring.
`/bookings/new` is a new app-custom file (the owned-product picker +
journey redirect formerly embedded in the bookings detail route file).

**Remaining horizon.**

1. ~~**Generated resolver maps** (§4.7 endgame's second half).~~
   **Delivered** — `destination:` annotations on route contributions drive
   `voyant admin generate --destinations`, the hand-maintained map shrank to
   the genuinely custom resolvers, and Finding D gates the generated portion
   (see §4.7).
2. ~~**CLI emission.**~~ **Delivered** — `voyant admin generate --routes`
   emits the code-assembled module + typed-link maps (the legacy per-route
   thin files remain behind `--routes --files`), and `voyant admin doctor`'s
   Finding C accepts the fileless shape: a contribution path bound by an
   entry in the generated module passes without any route file on disk.
3. **Route-level i18n.** The assembled routes are built once per router from
   default-label extension instances; nav labels stay localized (the
   workspace shell resolves its own localized instances), but contribution
   `title`s rendered by packaged pages currently use factory defaults.

---

## 5. What we delete

- **`templates/dmc`** — superseded fork; we only use `apps/operator`.
- **`apps/dev`** — near-duplicate of dmc with extra diverged routes. Its role
  (UI playground against a real DB) is taken over by the thinned
  `apps/operator`, which becomes both the reference host and the proving
  ground: if the operator's local pages can't be expressed through the
  extension surface, neither can a client's.
- **The shadcn-style registry** — `apps/registry` (the registry host worker),
  the `registry/` directories inside `*-ui` packages, and the
  `registry:build` tooling. `*-ui` packages are consumed as ordinary
  versioned dependencies with a public component/export surface. Projects
  that want source-level ownership fork the repository.

`apps/operator` survives as the reference host and the `voyant new`
scaffold source — but its `src/` shrinks from ~40k LOC toward the §4.6 shape.

---

## 6. Phased plan

### Phase 0 — package the fetch dispatch + build preset (incident-class fix)

Extract `createWorkerFetch` (fetch/API/auth/SSR dispatch only — scheduled
crons, the workflow DO, and step services stay in the app's `entry.ts`, see
§4.4) and `voyantAdminPreset`; operator consumes both. Small, independent,
immediately closes the #1636/#1638 delivery gap for the most load-bearing
code path. No admin UI changes.

### Phase 1 — `createAdminApp` owns shell, providers, auth, navigation

The factory renders the shell + auth flows + nav from the extension registry;
operator deletes its copied providers/nav/auth route files and mounts the
factory. Domain routes remain starter-local behind a transitional
`localRoutes` option — the tree is assembled by the package either way.

### Phase 2 — packages ship pages; pilot one domain

Extend `AdminExtension` routes to carry the full §4.2 contract; pilot with a
domain whose UI already lives in packages (catalog or promotions —
promotions is already extension-shaped). This phase also introduces the
`@voyant-travel/<domain>-ui/admin` entrypoint convention, the
`admin.extensions.generated.ts` generator, and the manifest↔extension↔route
parity check in report-only mode. Validate: code-based route tree, loaders +
search validation + boundaries through the contract, SSR preloads, typed
navigation, i18n bundle merging.

### Phase 3 — migrate all domains; delete the forks

Move the remaining domain pages from `apps/operator/src/components/voyant`
+ `src/routes` into their `*-ui` packages' admin extensions, one domain per
PR. The parity check flips from report-only to a CI gate once the majority
of domains are migrated. When the operator's local routes are only genuinely
custom pages, delete `templates/dmc`, `apps/dev`, and the registry
(`apps/registry` + per-package `registry/` dirs + `registry:build` tooling).

### Phase 4 — contract hardening

Versioning policy (peer ranges between the admin app package and `*-ui`
admin extensions; changesets already in place), the documented widget-slot and
override catalogs, and revision of `admin-architecture.md` (§7).

---

## 7. Revisions to existing guidance

`admin-architecture.md` Rule 2 ("Keep the final admin shell starter-owned")
is superseded: the shell is framework-owned; projects own **composition**
(config + extensions + overrides), not shell code. Rules 8–9 (the
source-installed UI block layer and the registry strategy) are also
superseded: there is no source-installed layer anymore; `*-ui` packages are
imported, not copied. Rules 4–7 (explicit extension points, narrow nav
contributions, selective widget slots) are unchanged and become load-bearing —
they are the customization surface that replaces forking.

`frontend-package-strategy.md` is revised accordingly: the "shadcn registry
blocks" layer is retired; the remaining layers are domain packages,
framework-agnostic SDKs, `*-react` runtime packages, and `*-ui` component
packages consumed as dependencies.

The "Non-Goals" caveat against "a fully closed admin product" still holds:
§4.5's override registry is the explicit escape hatch that keeps the admin
open without reintroducing silent divergence — and a full repository fork
remains available to anyone who genuinely wants to own the stack.

---

## 8. Decisions made & open questions

Decided:

- No template-upgrade/codemod tooling — straight to the packaged model.
- `templates/dmc` and `apps/dev` are deleted (Phase 3).
- Fork-and-own is retired, including the shadcn-style registry
  (`apps/registry` + per-package `registry/` source). Build on Voyant via
  extensions + imported packages, or fork the repository — nothing between.
- Code-based route assembly first; build-time typed-tree generation later.
- The existing `AdminExtension` seam is the foundation — extended, not replaced.
- Cross-package navigation goes through semantic destination keys:
  `AdminDestinations` declaration merging in domain packages plus a host
  resolver map injected via the workspace shell (§4.7). Packages never import
  a host route tree.

Open:

1. **Package shape:** resolved for the v1 cleanup direction by moving app-shell
   exports into `@voyant-travel/admin/app/*`; `@voyant-travel/admin-app` remains the
   first-party composition package for the domain-backed core extension plus
   compatibility re-exports. A later full `createAdminApp` factory can build on
   those subpaths without re-splitting the package.
2. **Typed links across packages:** how much route-path type safety do we
   accept losing in Phase 2 before the generated tree lands?
3. **Auth route ownership:** the auth flows are framework-owned in §4.1 —
   confirm `@voyant-travel/auth-react/ui` covers all current operator auth routes
   (incl. accept-invite/onboarding) or extend it first.
4. **Storefront routes:** `apps/operator` also hosts `(storefront)/*`
   pages. Same model eventually (a `createStorefrontApp`), but explicitly out
   of scope for this RFC.
5. **i18n:** merge strategy for extension-contributed admin locale bundles
   (the `catalogBrowser` namespace pattern suggests per-extension namespaces).
6. **Admin version ↔ module version compatibility:** do `*-ui` admin
   extensions declare a peer range on the admin app package only, or also on
   their backend module (so a page never renders against an API surface that
   lacks its endpoints)?
7. **Worker runtime beyond fetch:** does a later `defineWorkerRuntime` also
   standardize `scheduled()` cron registration and workflow-DO/step-service
   wiring (per §4.4), or do those remain permanently app-owned composition?
8. **Where the parity check lives:** a dedicated `voyant admin doctor`, or
   one `voyant doctor` umbrella shared with the migration-resilience RFC's
   schema checks?

---

## 9. Success criteria

1. A fix of the #1636/#1638 class (dispatch, chunking, preloads, shell, auth
   flow, domain page) ships to every project as a version bump. Zero
   hand-ports. **Met** — all 10 admin domains are package-delivered; domain
   fixes land in the `*-ui` package and reach hosts as a version bump.
2. A new project scaffold contains no framework infrastructure: manifest,
   thin entries, empty `src/admin/extensions/`.
3. `apps/operator/src/routes` + `src/components` shrink from ~41k LOC to
   only genuinely custom pages (target: under ~3k LOC). **Met** — the domain
   migrations removed ~18k LOC of operator-local UI across the 10 domains;
   what remains is host wiring and genuinely custom pages.
4. `templates/dmc` and `apps/dev` no longer exist. **Met by this PR.**
5. An enterprise customization (new page, injected widget, overridden detail
   page) is expressible without modifying any framework-owned file.
6. No source-installed component copies remain: `apps/registry` and the
   `registry/` directories are gone, and every `*-ui` consumer imports the
   package instead of owning a copy of its source. **Met by this PR.**
