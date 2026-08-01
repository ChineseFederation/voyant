# Admin Host - Historical Source-Free Design

- **Status:** Superseded by the graph-native Node runtime and generic admin host
  (2026-07-12). Retained below as a design record.
- **Tracks:** voyant#3044 · Parent: voyant#2983 · Sibling: voyant#2987 (API runtime entry, shipped)
- **Related:** Packaged Admin RFC (#1643/#1649), `@voyant-travel/vite-config`, platform#953/#954

## Implementation status

The operator starter is the single reference deployment surface. Its resolved
graph, artifact manifest, and runtime modules are disposable generated outputs;
it no longer emits or boots from a profile snapshot.

Shipped:

- **Serving seam** - `@voyant-travel/admin-host` (`serveAdminHost`,
  `createAdminSsrHandler`). Snapshot-era compatibility names and their subpath
  have been removed.
- **Runtime glue** — `@voyant-travel/admin-app/runtime` (`adminFetcher`,
  `getAdminApiUrl`,
  admin-path normalize) — #3048.
- **Auth port** — `AdminAuthRuntime` in `@voyant-travel/admin/app`;
  `createAdminWorkspaceBeforeLoad` consumes it — #3051.
- **User provider** — `@voyant-travel/admin-react/user` — #3053.
- **Source-free host + runtime composition** — packaged serving seams, the
  code-based router pattern, and the runtime route/destination builders
  (`buildAdminExtensionRoutes` incl. layout children, `buildAdminExtensionDestinations`)
  — #3055.
- **Packaged build config** — `voyantStartViteConfig({ nodeSsr: true })` folds in
  the Node SSR target/`noExternal`/resolve-conditions; the app `vite.config.ts`
  copies **no** build config — #3057.
- **Unified deployment graph artifacts** - the operator starter emits and checks
  graph-native artifacts from the same deployment surface.

**Key finding that changed the plan:** the cross-repo `voyant admin generate`
codegen is **not** needed. `buildAdminExtensionRoutes` builds the whole admin
route tree at runtime from the packaged `create<Module>AdminExtension` factories,
so the entire goal is voyant-repo-only. The codegen remains a compile-time
typed-link DX nicety for source-backed hosts, not a runtime requirement.

Remaining (non-blocking): compose the real `/api` (`loadManagedProfileRuntime`,
#2987) with admin serving in one process; widget-slot cross-package wiring;
snapshot module-subsetting (#2104/#2107); extract a thin Cloud-image template
from the unified operator graph artifacts if platform#954 still needs one.

The phased plan below describes the superseded snapshot-era design. Its names
are historical, not current API guidance.

## Module-subset composition

The deployment graph resolves the active module and extension set before the
admin host is built. Each selected package contributes its own admin factory,
and only those factories are lowered into the generated route tree,
destinations, navigation, and widgets. The workspace shell therefore receives
an already-selected extension list; it does not accept module ids or apply a
second, fail-open visibility policy at runtime.

API and admin selection share the same graph authority. A module excluded from
the graph contributes neither routes nor navigation, including for direct URL
resolution. Hosts must not restore a full first-party registry or infer
selection from bootstrap payloads.

## Problem

`loadManagedProfileRuntime` (`@voyant-travel/framework/managed-runtime`, #2987)
gives Cloud a **source-free API** runtime entry: it boots `createVoyantApp` from
a serialized profile snapshot with no `apps/operator` import. There is no
equivalent for the **admin UI**. To put the admin into
`voyant-runtime:<framework-version>` (platform#954), Cloud must today
copy `apps/operator/src/*` (route tree, providers, TanStack Start server
entry, generated files) and its `vite.config.ts` (chunking + SSR config). That
copied build config is load-bearing and diverges — the exact
"copied-build-config-diverges" failure class the Packaged Admin RFC calls out
(module-init ordering: `Cannot read properties of undefined (reading
'createContext')`, SSR externalization interop breakage).

**Goal:** a framework-owned, source-free admin host Cloud can package next to
the API runtime entry, serving the standard admin (SSR + client assets) from
published packages + a profile snapshot, with **no** `apps/operator/src/*`
and **no** copied `vite.config.ts`.

## Naming: profile-agnostic, not "operator"-bound

The host is named for the **managed-profile** contract, not the `operator`
profile. `profile` is a field on the snapshot (`operator` today; a future PMS or
other product profile is just another value — Voyant is not a PMS, but a PMS
product would reuse this same managed-profile architecture from published
packages). The API side already models it this way — `loadManagedProfileRuntime`
/ `createManagedProfileApp`, keyed on the snapshot, never "operator" in an
identifier. This plan follows suit:

- **Package:** `@voyant-travel/admin-host` — a generic, profile-agnostic admin
  serving layer, sitting alongside the packaged admin surfaces (`admin`,
  `admin-app`, `admin-react`). **Not** `@voyant-travel/framework/operator-admin`
  and **not** `operator-admin-host` — no product/profile name in the package.
- **Factory:** `createManagedProfileAdmin(...)`, mirroring
  `createManagedProfileApp`. The profile is read from the snapshot.
- It stays a **dedicated package**, not folded into `@voyant-travel/framework`:
  the React SSR graph must not enter the framework's API-only cold-start closure
  (cf. #2915). Optionally re-exported lazily via a framework subpath.

## Current architecture (what's packaged vs starter-owned)

Packaged already (RFC #1649):

- **Surfaces** — `@voyant-travel/admin/app` (`createAdminRouter`,
  `attachAdminExtensionRoutes`, `buildAdminExtensionRoutes`, `AdminRootShell`,
  `AdminWorkspaceShell`), `@voyant-travel/admin-app`
  (`adminExtensionChildRoutes`, `adminExtensionRouteOptions`, `core-extension`),
  and per-domain pages under `@voyant-travel/<domain>-react/admin`.
- **Build config** — `@voyant-travel/vite-config` `voyantStartViteConfig(...)`
  owns vendor chunking (`manualChunks`), SSR `optimizeDeps`, the `@` alias, and
  dev-tunnel hosts, and — via `nodeSsr: true` (#3057) — the Node `ssr`
  target/`noExternal`/resolve-conditions. The app `vite.config.ts` only
  instantiates plugins; it copies no build config.

Still starter-owned (blocks source-free):

| Piece | File(s) | Lines | Role |
|---|---|---|---|
| Route-tree codegen | `src/admin.routes.generated.tsx`, `src/admin.extensions.generated.ts`, `src/admin.destinations.generated.tsx` | ~1067+ | Code-assembled admin routes from packaged surfaces, **driven by `voyant.config` modules** — but referencing starter-local `@/lib/*` and `@/routes/_workspace`. |
| File-route shell | `src/routes/(auth)/*`, `src/routes/_workspace/route.tsx`, `src/routes/__root.tsx` → `src/routeTree.gen.ts` | ~610 | Admin app-shell + auth routes (storefront/pay/proposal routes are a **separate** concern — non-goal). |
| Router assembly | `src/router.tsx` | 73 | Merges file routes + generated extension routes + discovered local routes; typed-link merge. |
| SSR handler | `src/ssr-handler.ts` | 22 | `createStartHandler(withActiveRouteSsrManifest(defaultStreamHandler))`. |
| Start config | `src/start.ts` | 39 | `createStart({ defaultSsr:false })` + CSRF middleware. |
| Node host | `src/server.ts` | 193 | Static asset serving + `createNodeServer` boot + env/stores compose. |
| Fetch entry | `src/entry.ts` | 92 | `createWorkerFetch({ api, ssr: lazySsr(...) })` + scheduled. |
| Glue | `src/lib/*` (~30) | — | `env.getApiUrl`, `voyant-fetcher`, `admin-extensions` registry, `current-user`, i18n, observability. |

Key facts that shape the design:

1. **Codegen is already config-driven.** `voyant admin generate` emits the
   `admin.*.generated.*` files from the `voyant.config` `modules` list — which is
   exactly the profile snapshot's `modules`. Source-free = generate into a
   package (or at build time from the snapshot), not commit into starter `src`.
2. **The generated files' only starter coupling is the `@/lib/*` glue and
   `@/routes/_workspace` import.** If that glue is packaged (or injected), the
   generated tree is package-portable.
3. **SSR + Node host are thin** (`ssr-handler.ts` 22 lines, host boot in
   `server.ts`) and already lean on `@voyant-travel/runtime-core`
   (`createWorkerFetch`, `lazySsr`, `createNodeServer`, `withActiveRouteSsrManifest`).
   The serving layer is a small, well-bounded extraction.
4. **The app-shell file-routes** (`_workspace`, `(auth)`, `__root`) are the one
   piece that is genuinely UI and must move into a package to be source-free.

## Target seam

Mirror `loadManagedProfileRuntime`. A framework-owned host composes the packaged
surfaces for a snapshot and serves SSR + client assets in the same Node process
as `/api`:

```ts
// @voyant-travel/admin-host
import { createManagedProfileAdmin } from "@voyant-travel/admin-host"

const admin = createManagedProfileAdmin({
  project,                 // parsed profile snapshot (its `profile`+`modules` drive the subset)
  apiBaseUrl: "/api",      // API served by loadManagedProfileRuntime (#2987)
  clientAssetsDir,         // built client bundle
})
// admin.fetch(request, env, ctx)  -> SSR + static assets
// admin.router  / admin.ssrHandler for embedding
```

The load-bearing vite/route-tree/SSR config ships with the package; a Cloud
image needs no copied `vite.config.ts`, route tree, providers, or server entry.

## Phased plan

### Phase 1 — Admin host serving seam (router + SSR + Node static host)

Package the **serving** layer that is currently `router.tsx` + `ssr-handler.ts` +
the static-serving/host half of `server.ts`, as `@voyant-travel/admin-host` the
starter adopts. Does **not** yet move the file-route shell or make codegen
source-free — it proves the seam and shrinks host glue.

- New package `@voyant-travel/admin-host`:
  - `createManagedProfileAdminRouter({ routeTree, apiBaseUrl, fetcher, extensions })`
    — wraps `createAdminRouter` + `attachAdminExtensionRoutes`, taking the glue
    (fetcher, api-url, extensions registry) as **injected options** instead of
    `@/lib/*` imports.
  - `createManagedProfileAdminSsrHandler()` — the `createStartHandler(...)` wrap.
  - `serveManagedProfileAdmin({ clientAssetsDir })` — the Hono static-serving +
    SSR fall-through (`web` in `server.ts`), returning a `fetch`.
- Starter adopts: `router.tsx`/`ssr-handler.ts` shrink to a call into the
  package passing the still-local generated tree + glue.
- **Acceptance:** operator builds + serves admin unchanged; `router.tsx` +
  `ssr-handler.ts` no longer contain host logic (only wiring); package unit +
  SSR smoke test (render the document shell for `/`).

### Phase 2 — Packaged app-shell routes + generated route map as a build artifact

Move the admin app-shell (`__root`, `_workspace/route`, `(auth)/*`) into a
package. Crucially, the **profile-specific generated route map is a build
artifact derived from the snapshot — not a published npm package of
tenant/profile-specific generated files.** The reusable *shell* and *host* live
in packages; the *route map* is emitted per build.

> **Investigation findings (2026-07-08) that refine this phase:**
> - **The glue is client/isomorphic, so it lives in a client package — NOT the
>   server `@voyant-travel/admin-host`.** The starter fetcher
>   (`lib/voyant-fetcher.ts`) is a `createIsomorphicFn` over `defaultFetcher`
>   (canonical in `@voyant-travel/react` `./provider`) plus an admin-path
>   normalizer (`/v1/<module>` → `/v1/admin/<module>`, generic not
>   operator-specific). Home: a new `@voyant-travel/admin-app/runtime` subpath
>   (`createManagedProfileAdminRuntime` / `createManagedProfileAdminFetcher` /
>   `normalizeAdminApiUrl`).
> - **The codegen is a separate repo.** `voyant admin generate` lives in
>   `@voyant-travel/cli` (sibling `cli/` repo, bin `voyant`:
>   `src/commands/admin-generate.ts` + `src/lib/admin-routes.ts`), config-driven
>   off `voyant.config` `modules`. `scripts/check-admin-composition-drift.mjs`
>   in THIS repo only *validates* the committed output. So the managed
>   route-map slice is **cross-repo** (voyant + cli), sequenced after the
>   voyant-repo glue/shell/auth slices.
> - **Auth is a thick starter-local stack**, not a thin `getCurrentUser`. The
>   `_workspace` shell already consumes `createAdminWorkspaceBeforeLoad({
>   getCurrentUser })`, but `getCurrentUser` (`lib/current-user.ts`) is a
>   TanStack server-fn wrapping cloud-auth start, bootstrap status, and a
>   browser-evidence fallback, and the shell also calls `useSignOut`
>   (`lib/auth.ts`, Better Auth client). The `ManagedProfileAdminAuthRuntime`
>   seam must wrap all three, injected — not baked.

- **Shell in a package.** New `@voyant-travel/admin-app/shell` (or extend
  `admin-app`) exporting `__root`/`_workspace`/auth route definitions as
  factories parametrized by injected glue (fetcher, api-url, auth seam).
- **Auth as a capability seam, not baked.** Define a profile-agnostic
  `ManagedProfileAdminAuthRuntime` — `getCurrentUser`, `signIn`, `signOut`,
  `invite`/`reset`, cookie-forwarding fetch — and feed it through the existing
  `createAdminWorkspaceBeforeLoad({ getCurrentUser })` seam
  (`packages/admin/src/app/workspace.tsx:59`). Do **not** bake `lib/auth.ts` /
  Better Auth into the shell: managed Cloud auth and self-host auth each
  implement the seam.
- **Codegen: cross-repo, dual-mode it.** The generator is `@voyant-travel/cli`'s
  `admin generate` (separate `cli/` repo). Keep **starter-local** generation for
  self-host; add a **managed** mode that emits the profile route map into a
  scratch build directory (or a Vite virtual-module namespace — no
  virtual-module precedent in-repo yet), derived from the snapshot `modules`
  (ties to #2107 subsetting — excluded modules contribute no route/extension).
  Update `scripts/check-admin-composition-drift.mjs` (voyant repo) to understand
  both outputs.

**Voyant-repo slices, sequenced (each independently mergeable):**
1. **Runtime glue** → `@voyant-travel/admin-app/runtime`
   (`createManagedProfileAdminRuntime`: isomorphic fetcher + api-url +
   `normalizeAdminApiUrl`); starter's `lib/voyant-fetcher.ts`/`env.ts`/
   `operator-admin-api-paths.ts` become thin adopters. Lowest risk; unblocks the
   shell move.
2. **Auth capability seam** → `ManagedProfileAdminAuthRuntime` wrapping
   getCurrentUser/signOut/bootstrap; starter provides the Better-Auth impl.
3. **Packaged app-shell routes** (`__root`/`_workspace`/`(auth)`) as
   glue+auth-injected factories.
4. **(cross-repo)** managed codegen mode in `@voyant-travel/cli` + drift-checker
   dual-mode + framework build wiring (overlaps Phase 3).
- **Typed links stay first-class generated exports.** The generated module
  exports the profile-specific `AdminExtensionRoutesBy*` maps; the **host
  package** provides the merge helper (the `MergeRouteTypeMaps` /
  `_addFileTypes` contract in `router.tsx:22`). The typed-link contract for
  package-delivered pages must survive the boundary intact.
- **Glue in a package.** `createManagedProfileAdminRuntime({ apiBaseUrl })`
  provides the isomorphic fetcher (cookie-forwarding SSR variant) + env, so
  `getApiUrl`/`voyant-fetcher` are no longer starter-local.
- **Acceptance:** a fixture composes the full admin route tree from packages +
  a snapshot with **zero** `src/routes/**` and **zero** `@/lib/*` (the generated
  map living in a scratch build dir, not a committed/published file); typed links
  preserved; the starter still works by consuming the packaged shell + local
  generation.

### Phase 3 — Framework-owned build entry (no copied vite config)

Produce the admin client + SSR bundle from packages with no copied build config.

- **Shipped (#3057):** `@voyant-travel/vite-config`'s `voyantStartViteConfig`
  gained `nodeSsr: true`, which folds in the Node `ssr`
  target/`noExternal`/resolve-conditions the app previously hand-merged. The
  operator's disposable `.voyant/vite.config.ts` is generated as a single
  `voyantStartViteConfig(...)` call, so the checked-in starter copies no build
  config. (Route source is the code-based router, not a
  "packaged shell" — see the status section; the earlier
  `voyantManagedProfileAdminViteConfig` idea was unnecessary.)
- **Remaining:** a thin, profile-agnostic build entry (`index.html` +
  `__root.tsx` + `src/{router,server,entry,start}.ts`) that Cloud
  copies **verbatim** (or a generator emits) — carrying no app logic, only the
  packaged-config instantiation. That template must be derived from the unified
  operator graph contract, not kept as a second workspace starter.
- **Acceptance:** `createManagedProfileAdmin` end-to-end — a build in a scratch
  dir with only published packages + a snapshot + the thin entry produces
  `dist/client` + `dist/server`, and `node server.js` serves SSR admin + `/api`
  in one process. No `apps/operator/src/*` in the build graph.
- **SSR-manifest acceptance is a test, not a theory.** `withActiveRouteSsrManifest`
  restricts preloads to active routes; the scratch-admin build must **prove**
  chunk/preload selection still maps to the generated route tree. Smoke: build
  the scratch admin, render several SSR routes asserting no missing
  preload/module errors, and open it in a browser (chrome-devtools) asserting
  clean hydration — no `createContext`/`.create`-on-undefined console errors —
  plus `/api/health` 200.

## Ownership split (who owns what)

- `@voyant-travel/admin` (`/app`, components) — admin **UI primitives** (router
  factory, root/workspace shells, nav, widget slots).
- `@voyant-travel/admin-app` (`/shell`) — the **app-shell routes**
  (`__root`/`_workspace`/`(auth)`), as glue-injected factories.
- `@voyant-travel/admin-host` — **SSR + static + Node serving** and the
  typed-link merge helper (`createManagedProfileAdmin` and friends).
- `@voyant-travel/vite-config` — **build config** (chunking, SSR target,
  optimizeDeps).
- **Generated route map** — a **profile build artifact** derived from the
  snapshot (scratch dir / virtual module), owned by the `voyant admin generate`
  codegen, *not* a published package.

## Risks / open questions

- **Framework server-graph weight.** The React SSR graph must stay out of
  `@voyant-travel/framework`'s API-only startup closure (cf. #2915) — hence the
  dedicated `@voyant-travel/admin-host` package (depending on the admin
  surfaces), consumed lazily like `entry.ts`'s `lazySsr` today. `framework` may
  expose a tiny lazy adapter later, but the SSR dependency owner is the host
  package, never a static `framework` subpath.
- **App-shell routes are genuinely UI + auth.** `_workspace`/`(auth)` carry
  auth-client wiring (Better Auth). Phase 2 injects a
  `ManagedProfileAdminAuthRuntime` capability through the existing
  `createAdminWorkspaceBeforeLoad({ getCurrentUser })` seam
  (`packages/admin/src/app/workspace.tsx:59`) — it does **not** bake the
  starter's `lib/auth.ts`. Managed Cloud auth and self-host auth each implement
  the seam.
- **Codegen home.** Confirm where `voyant admin generate` lives and retarget its
  output package + glue imports (Phase 2). Keep `check-admin-composition-drift`
  green.
- **Typed links across the package boundary.** The `AdminExtensionRoutesBy*`
  typed-link merge in `router.tsx` must survive the move (Phase 2) — export the
  generated type maps from the package.
- **SSR manifest.** `withActiveRouteSsrManifest` restricts preloads to active
  routes; verify it composes from the packaged route tree (Phase 3 build).

## Non-goals (per #3044)

- Storefront/site bundling — separate Cloud apps consuming the Voyant API.
- Source-backed custom admin pages/widgets — the deployment-local `src/admin/*`
  extension path stays for self-host; managed profiles use the packaged set.
- Removing self-host/starter usage — the starter remains the reference for
  source-backed/self-host and is the first consumer of each phase's package.
