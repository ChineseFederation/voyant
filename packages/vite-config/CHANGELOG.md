# @voyant-travel/vite-config

## 0.5.3

### Patch Changes

- f772fe7: Co-locate the UI chart bridge with Recharts so portable admin dashboards cannot render an undefined chart component from a circular client-chunk import.

## 0.5.2

### Patch Changes

- 3c86fb1: Co-locate the rich-text editor with its Tiptap vendor graph so portable admin-shell documents cannot observe uninitialized circular imports without increasing the initial preload closure.

## 0.5.1

### Patch Changes

- af3996b: Load dashboard charts after aggregate data arrives, defer public finance page bodies until their route is visited, and keep vendor chunks from absorbing shared dependencies so workspace chrome does not wait on Recharts or payment UI.

## 0.5.0

### Minor Changes

- d77269c: Build and install relocatable workspace packages for production instead of
  inlining their source.

  The operator Docker image built cleanly and had never booted (voyant#3994). The
  root cause was that `ssr.noExternal: [/^@voyant-travel\//]` inlined workspace
  packages from source into the server bundle. That absorbs their **code** but not
  their **dependencies**, and `pnpm deploy --prod` prunes to what the application
  itself declares — so every external dependency reached only through an inlined
  package became undeclared and unresolvable. 36 were, including
  `@pdf-lib/fontkit`, `@aws-sdk/client-s3`, `@neondatabase/serverless`, `exceljs`
  and `liquidjs`. The image would have failed progressively, one feature at a
  time; booting was simply the first path exercised.

  `voyantStartViteConfig` gains `bundleWorkspaceSource` (default `true`). The
  development server keeps inlining from source, because that is what makes a
  `packages/*/src` edit a member of the Vite module graph and therefore
  hot-reloadable. A build now passes `false`, so `@voyant-travel/*` stay external,
  `pnpm deploy` installs them as real packages, and their own dependency trees
  come with them. Both directions are pinned by tests — only one of them is
  visible in a production failure.

  This also makes the complete production artifact explicit:

  - the workspace dists are built before the app build (~7 minutes, ~80MB, once
    per release), with `NODE_OPTIONS=--max-old-space-size=8192` because `tsc`
    needs more than the default 2GB for the larger packages
  - `scripts/apply-publish-config.mjs` runs after `pnpm deploy`, because
    `pnpm deploy` copies workspace manifests verbatim and does **not** apply
    `publishConfig` — a pack/publish-time transform. Our manifests point
    `exports` at `./src/*.ts` while `files: ["dist"]` means `src/` is never
    shipped, so without it every deployed package references files that do not
    exist. The script performs the same substitution npm consumers already get.
  - generated package references use relocatable bare specifiers when the package
    is a declared production dependency, while transitive selections stay
    project-relative to the location selected through the product BOM and prefer
    built `publishConfig` targets. This preserves strict pnpm nesting without
    capturing absolute build-machine paths; generated link definitions are
    compiled into the server alongside the graph runtime
  - TanStack Start's core virtual-module hosts remain bundled so its Vite plugin
    can replace the `#tanstack-*` imports required by the production server
  - the operator manifest declares the product BOM runtime closure as production
    dependencies, and the image includes an explicit graph-native migration
    command for use before rollout

## 0.4.0

### Minor Changes

- 952d817: Replace unsafe booking-contract document generation with the Legal-owned
  durable operation/provider protocol. Legacy generation routes and direct
  generator services and exports are removed. Standard Operator now selects and
  constructs the shipped provider from its exact database, document-storage, and
  renderer bindings; startup and action activation require behavioral provider
  preflight, and pending recovery fails loudly if that provider disappears.
  Local Standard document bytes now require probed, atomic filesystem durability,
  and the bundled renderer embeds a Latin Extended Unicode font. Custom font
  bytes are also supported by the basic PDF utility. Opaque renderer/S3
  transports require explicit backend identity. Remove the
  Notifications document-bundle lifecycle callbacks, fully-paid orchestration
  subscriber, and its Realtime invalidation declaration; document generation is
  available only through admitted Legal actions.

  Recognize transaction-bound outbox appends as durable domain-event emissions
  and publish the existing Trips requirement-sourcing event contracts.

## 0.3.4

### Patch Changes

- 7e9f77a: Reconcile generated route files atomically so concurrent build, test, and architecture checks can
  share one workspace without deleting routes while another process scans them.

## 0.3.3

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.

## 0.3.2

### Patch Changes

- d83d237: Repair packaged consumer development and production startup, keep shared UI
  contexts single-instanced under Vite, make unconfigured realtime quiet, and
  restore narrow client-safe validation and Finance voucher setup exports. Resolve
  legacy frontend imports through product-owned browser facades and allow clean CI
  installs to fetch metadata for external dependencies.

## 0.3.1

### Patch Changes

- 2669577: Start production operator projects through their Vite-built TanStack server
  entry so virtual router imports and the React SSR singleton resolve from the
  generated server graph.

## 0.3.0

### Minor Changes

- c65b05c: Generate standard Operator route registrations under `.voyant`, move public
  Finance and Quotes route behavior into package-owned contributions, and move
  standard route composition into the product distribution so application source
  contains only deployment adapters and local customization.

## 0.2.0

### Minor Changes

- c5a083b: Add a `nodeSsr` option to `voyantStartViteConfig` that folds in the load-bearing
  Node SSR build config — `ssr.target: "node"`, `ssr.noExternal` for
  `@voyant-travel/*` / `@pxmstudio/*`, and `ssr.resolve.conditions` (source-first)
  — which Node-only Voyant apps (voyant#2966) previously hand-merged on top of the
  preset.

  With `nodeSsr: true` a Voyant TanStack Start app's `vite.config.ts` shrinks to a
  single `voyantStartViteConfig(...)` call and copies no build config — the
  last piece the source-free managed admin host (voyant#3044) still duplicated.
  The operator and managed-operator starters adopt it.

## 0.1.3

### Patch Changes

- d2d2a44: Anchor the React vendor chunk heuristic to actual `react`, `react-dom`, and `scheduler` package boundaries so third-party package internals such as Better Auth's `dist/client/react/*` subpaths stay out of the eager React chunk.

## 0.1.2

### Patch Changes

- a155321: Declare `rollup-plugin-visualizer` as an optional peer for the opt-in bundle analysis helper.

## 0.1.1

### Patch Changes

- ecec979: Improve operator bundle boundaries by adding route-local admin message provider support, exposing admin extension route helpers, keeping pending skeletons structural, and tightening Vite route ignores and vendor chunk splitting so heavy admin route dependencies stay out of the initial entry.

## 0.1.0

### Minor Changes

- 2e716a2: New packages — Phase 0 of the packaged-admin RFC (#1643): framework-owned
  Worker infrastructure ships as versioned packages instead of copied template
  files.

  - `@voyant-travel/worker-runtime`: `createApiDispatch` (prefix-routed API/auth
    dispatch with lean-auth cold-start protection and background API warm-up),
    `createWorkerFetch` (API-vs-SSR Worker entrypoint), `lazyApp` (memoized app
    loaders), and `withActiveRouteSsrManifest` (restricts the TanStack Start SSR
    manifest to active route matches).
  - `@voyant-travel/vite-config`: `voyantStartViteConfig` build preset (vendor
    chunking, SSR optimizeDeps, `@` alias, dev-tunnel hosts) plus à-la-carte
    exports (`voyantVendorChunk`, `VOYANT_SSR_OPTIMIZE_DEPS`,
    `VOYANT_ROUTE_FILE_IGNORE_PATTERN`, `createAnalyzePlugin`).

  The operator template consumes both: `entry.ts` shrinks to bindings + factory
  calls (scheduled crons, the workflow Durable Object, and step services remain
  app-owned per RFC §4.4), and `vite.config.ts` shrinks to plugin instantiation.
