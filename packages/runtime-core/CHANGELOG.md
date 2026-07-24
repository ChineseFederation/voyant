# @voyant-travel/worker-runtime

## 0.6.7

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/utils@0.110.0

## 0.6.6

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/utils@0.109.0

## 0.6.5

### Patch Changes

- 406cebb: Add host-owned app webhook signing-key provisioning, confirmation-gated subscriptions, selected external-event durable intake, app-specific worker composition, a resident Node worker lifecycle, and server-authorized replay.

## 0.6.4

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/utils@0.108.0

## 0.6.3

### Patch Changes

- 8d62a7c: Embed TypeScript sources in published JavaScript source maps so consumer dev servers can resolve
  them without the omitted `src` tree. Stop emitting declaration maps that cannot embed their sources,
  and reject publish tarballs whose maps reference sources that are neither packed nor embedded.
- Updated dependencies [8d62a7c]
  - @voyant-travel/utils@0.107.1

## 0.6.2

### Patch Changes

- cc85042: Make deployment provider selection authoritative for Node storage, cache, shared
  state, and rate limiting. Replace vendor-specific object-store bindings and R2
  shims with logical media/document stores, a memory provider, an AWS SDK v3
  S3-compatible provider, and package-selected custom adapters. Add a portable
  storage provider conformance runner, resolve adapters from the `storage.object`
  graph provider, and make provider config/secret/resource usage explicit. Keep
  distributed shared state and rate-limit KV authoritative by bypassing the
  cache-only process-local L1, and move guest booking lookups onto the selected
  atomic rate-limit store. Remove the former R2/SigV4 exports.

## 0.6.1

### Patch Changes

- Updated dependencies [4d0eeed]
  - @voyant-travel/utils@0.107.0
  - @voyant-travel/storage@0.109.1

## 0.6.0

### Minor Changes

- 282892e: Make `@voyant-travel/runtime` the single public Node project host, move low-level
  host primitives to `@voyant-travel/runtime-core`, and remove the package-owned
  runtime CLI. Rename remaining first-party operator-specific subpaths to generic
  runtime or runtime-support surfaces.

### Patch Changes

- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
  - @voyant-travel/storage@0.109.0

## 0.5.2

### Patch Changes

- Updated dependencies [c66f9a5]
  - @voyant-travel/storage@0.108.0

## 0.5.1

### Patch Changes

- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/storage@0.107.0

## 0.5.0

### Minor Changes

- e232b21: Support stable schedule-id dispatch for scheduled Node runtime hooks.

## 0.4.2

### Patch Changes

- 425f92e: Add Node-native cache and shared-state providers behind the existing KVStore
  surface, including in-process LRU, tiered Redis/Postgres providers, Postgres
  fixed-window rate limiting, Redis rate limiting, and managed-runtime provider
  selection without KV-shaped binding requirements.
- Updated dependencies [425f92e]
  - @voyant-travel/utils@0.106.0

## 0.4.1

### Patch Changes

- e3dd1ff: Tidy a stale `[worker-runtime]` log label in the background-API-warm error path
  to `[runtime]`, matching the package's post-merge name.

## 0.4.0

### Minor Changes

- f945099: Introduce `@voyant-travel/runtime-core`, unifying the app runtime glue into one
  honestly-named package. It merges the former `@voyant-travel/worker-runtime`
  (request dispatch — `createWorkerFetch`, `lazySsr`, `createApiDispatch`,
  SSR-manifest helpers) and the never-released `@voyant-travel/dedicated-runtime`
  (the Node server + real providers — `createNodeServer`, origin-trust,
  `waitUntil` registry, `composeNodeEnv`, `createMemoryKvNamespace`,
  `createMemoryR2Bucket`, S3-backed `createR2BucketShim`). With Node the
  first-class runtime (voyant#2966), "worker"/"dedicated" were both stale names
  for what is simply the runtime.

  BREAKING: `@voyant-travel/worker-runtime` is removed — import from
  `@voyant-travel/runtime-core` instead (same export names and subpaths:
  `./api-dispatch`, `./ssr-manifest`, `./worker-fetch`, `./types`, plus the Node
  subpaths `./node-server`, `./trust`, `./wait-until`, `./env`, `./memory-kv`,
  `./memory-r2`, `./r2`).

## 0.3.0

### Minor Changes

- 5d994d1: Add `lazySsr` so the TanStack Start SSR handler can be loaded behind the
  non-API branch. Statically constructing the start handler in `entry.ts` pulls
  React + `react-dom/server` (~2.2 MB) into the Worker's startup graph, which
  Cloudflare parses on every cold isolate before routing — so even a no-op
  `/api/health` paid the React cold-load and the isolate could not stay warm.
  `lazySsr(() => import("./ssr-handler"))` memoizes the loader and keeps the
  React SSR graph off the startup path, the same win `lazyApp` already gives the
  Hono API. API-only isolates never load `react-dom/server`.

## 0.2.1

### Patch Changes

- 2a9fe00: Keep lean auth dispatch isolated from the full API graph by default. Auth
  requests no longer background-warm `loadApiApp()` unless a host explicitly sets
  `warmApiOnAuth: true`, preventing `/api/auth/*` cold requests from triggering
  the heavy framework module import path.

## 0.2.0

### Minor Changes

- 9a1197b: Move the operator media upload and serve routes off the bare `/v1/*` surface and onto `/v1/admin/*`.

  Uploads now post to `/v1/admin/uploads` and video tickets to `/v1/admin/uploads/video`; stored media is served from `/v1/admin/media/*`. The Hono app no longer mounts the bare `/v1/*` catch-all actor guard, and worker-runtime hosts can use `rewriteAppPath` to preserve compatibility for persisted legacy media URLs.

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
