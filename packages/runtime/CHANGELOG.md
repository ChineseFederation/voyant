# @voyant-travel/runtime

## 0.23.4

### Patch Changes

- Updated dependencies [8413c21]
  - @voyant-travel/framework@0.81.5
  - @voyant-travel/admin-host@0.131.0

## 0.23.3

### Patch Changes

- Updated dependencies [1567d3f]
  - @voyant-travel/framework@0.81.4
  - @voyant-travel/admin-host@0.130.0

## 0.23.2

### Patch Changes

- @voyant-travel/admin-host@0.129.0
- @voyant-travel/apps@0.14.17

## 0.23.1

### Patch Changes

- @voyant-travel/framework@0.81.1
- @voyant-travel/admin-host@0.128.0

## 0.23.0

### Minor Changes

- 51c5d53: Expose provider-neutral, release-scoped attestations for automatic product-job wake producers installed by the active runtime host.

### Patch Changes

- b2c8b94: Reduce production admin-shell startup work by deferring lazy-route dependency preloads, keeping storefront presentation imports off the broad barrel, lazily loading public auth and proposal page implementations, loading Reporting admin routes on demand, and tightening the initial preload budget to 480 KiB gzip.
- c1e6eb9: Reuse the portable full-host SSR handler across document requests.
- c1f23ab: Bound the aggregate Node database socket capacity across retained tenant pools.
- Updated dependencies [a93b626]
- Updated dependencies [51c5d53]
- Updated dependencies [b2c8b94]
- Updated dependencies [9ec0c18]
- Updated dependencies [9576bcc]
- Updated dependencies [c1f23ab]
  - @voyant-travel/framework@0.81.0
  - @voyant-travel/vite-config@0.5.4
  - @voyant-travel/admin-host@0.127.1
  - @voyant-travel/db@0.121.1

## 0.22.7

### Patch Changes

- Updated dependencies [1a244a7]
  - @voyant-travel/apps@0.14.16
  - @voyant-travel/admin-host@0.127.0

## 0.22.6

### Patch Changes

- Updated dependencies [af3996b]
- Updated dependencies [ed455e6]
  - @voyant-travel/vite-config@0.5.1
  - @voyant-travel/framework@0.80.5
  - @voyant-travel/admin-host@0.126.0

## 0.22.5

### Patch Changes

- @voyant-travel/framework@0.80.4
- @voyant-travel/admin-host@0.125.0

## 0.22.4

### Patch Changes

- @voyant-travel/admin-host@0.124.0

## 0.22.3

### Patch Changes

- Updated dependencies [e81dcea]
  - @voyant-travel/framework@0.80.3
  - @voyant-travel/admin-host@0.123.0

## 0.22.2

### Patch Changes

- Updated dependencies [21a28ef]
  - @voyant-travel/core@0.140.3
  - @voyant-travel/framework@0.80.2
  - @voyant-travel/admin-host@0.122.0

## 0.22.1

### Patch Changes

- @voyant-travel/admin-host@0.121.0

## 0.22.0

### Minor Changes

- bd8f49a: Add the versioned authenticated admin shell bootstrap contract, managed-host
  resolver seam, and TanStack Query hydration path for shell-critical state.
- af9e8cd: Add explicit full and API-only Node host profiles for portable admin-shell deployments.

### Patch Changes

- Updated dependencies [bd8f49a]
- Updated dependencies [afb6866]
- Updated dependencies [1e0506f]
- Updated dependencies [c181e4e]
- Updated dependencies [5d1b298]
  - @voyant-travel/admin-host@0.120.0
  - @voyant-travel/auth@0.151.0
  - @voyant-travel/db@0.121.0
  - @voyant-travel/framework@0.80.0
  - @voyant-travel/webhook-delivery@0.6.0
  - @voyant-travel/apps@0.14.14
  - @voyant-travel/hono@0.142.2
  - @voyant-travel/core@0.140.2

## 0.21.44

### Patch Changes

- 3cbf7fb: Bound resident Node database pools to four connections by default, allow an
  explicit `DATABASE_MAX_CONNECTIONS` override, and only attach dashboard cache
  headers after an aggregate response succeeds so transient server errors are not
  cached by browsers.
- Updated dependencies [3cbf7fb]
  - @voyant-travel/db@0.120.7
  - @voyant-travel/framework@0.79.7

## 0.21.43

### Patch Changes

- @voyant-travel/framework@0.79.6
- @voyant-travel/admin-host@0.119.0

## 0.21.42

### Patch Changes

- @voyant-travel/framework@0.79.5
- @voyant-travel/admin-host@0.118.0

## 0.21.41

### Patch Changes

- @voyant-travel/apps@0.14.13
- @voyant-travel/admin-host@0.117.0

## 0.21.40

### Patch Changes

- 2d1005f: Resolve the storefront sales channel on both auth profiles, not just self-host.

  A managed deployment supplies its own `resolveCustomerAuthContext`, which brokers
  storefront credentials through a control plane that has no channel concept. The
  returned context therefore never carried `storefrontChannel`, so every
  `/v1/public/*` catalog read answered `403 Public storefront channel context is
required.` on a guard that profile could never satisfy — while the
  Storefront -> Channel link rows sat unread in the deployment database.

  The runtime now decorates a host-supplied resolver with
  `withResolvedStorefrontChannel`, which reads that binding through the existing
  link-service provider and fills in the channel the host could not know. A
  context that already carries a channel is returned untouched, and a lookup that
  cannot resolve one leaves the host's context alone rather than failing the
  request — the downstream guards still apply.

  Each state in which a public request ends up without a channel (storefront not
  resolved here, no binding, binding inactive) is now logged as a distinguishable
  warning, so the identical 403 they all produce can be told apart from outside.

- Updated dependencies [2d1005f]
  - @voyant-travel/auth@0.150.19

## 0.21.39

### Patch Changes

- Updated dependencies [7b8ef95]
  - @voyant-travel/core@0.140.0
  - @voyant-travel/apps@0.14.12
  - @voyant-travel/auth@0.150.18
  - @voyant-travel/db@0.120.6
  - @voyant-travel/framework@0.79.3
  - @voyant-travel/hono@0.142.1
  - @voyant-travel/storage@0.115.4
  - @voyant-travel/webhook-delivery@0.5.17
  - @voyant-travel/admin-host@0.116.0

## 0.21.38

### Patch Changes

- @voyant-travel/apps@0.14.11
- @voyant-travel/admin-host@0.115.0

## 0.21.37

### Patch Changes

- @voyant-travel/apps@0.14.10
- @voyant-travel/framework@0.79.2
- @voyant-travel/admin-host@0.114.0

## 0.21.36

### Patch Changes

- @voyant-travel/framework@0.79.1
- @voyant-travel/admin-host@0.113.0

## 0.21.35

### Patch Changes

- @voyant-travel/admin-host@0.112.0

## 0.21.34

### Patch Changes

- Updated dependencies [9d18306]
- Updated dependencies [9d18306]
  - @voyant-travel/db@0.120.4
  - @voyant-travel/framework@0.79.0

## 0.21.33

### Patch Changes

- Updated dependencies [e8bd000]
  - @voyant-travel/framework@0.78.0
  - @voyant-travel/hono@0.142.0
  - @voyant-travel/admin-host@0.111.0
  - @voyant-travel/apps@0.14.9
  - @voyant-travel/auth@0.150.16
  - @voyant-travel/webhook-delivery@0.5.16

## 0.21.32

### Patch Changes

- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
  - @voyant-travel/core@0.139.0
  - @voyant-travel/hono@0.141.0
  - @voyant-travel/apps@0.14.8
  - @voyant-travel/auth@0.150.15
  - @voyant-travel/db@0.120.3
  - @voyant-travel/framework@0.77.0
  - @voyant-travel/storage@0.115.3
  - @voyant-travel/webhook-delivery@0.5.15
  - @voyant-travel/admin-host@0.110.0

## 0.21.31

### Patch Changes

- Updated dependencies [076c246]
  - @voyant-travel/framework@0.76.0
  - @voyant-travel/admin-host@0.109.0

## 0.21.30

### Patch Changes

- @voyant-travel/admin-host@0.108.0

## 0.21.29

### Patch Changes

- @voyant-travel/admin-host@0.107.0

## 0.21.28

### Patch Changes

- @voyant-travel/admin-host@0.106.0

## 0.21.27

### Patch Changes

- @voyant-travel/framework@0.75.7
- @voyant-travel/admin-host@0.105.0

## 0.21.26

### Patch Changes

- @voyant-travel/framework@0.75.6
- @voyant-travel/admin-host@0.104.0

## 0.21.25

### Patch Changes

- @voyant-travel/framework@0.75.5
- @voyant-travel/admin-host@0.103.0

## 0.21.24

### Patch Changes

- @voyant-travel/admin-host@0.102.0

## 0.21.23

### Patch Changes

- @voyant-travel/framework@0.75.4
- @voyant-travel/admin-host@0.101.0

## 0.21.22

### Patch Changes

- @voyant-travel/framework@0.75.3
- @voyant-travel/admin-host@0.100.0

## 0.21.21

### Patch Changes

- @voyant-travel/framework@0.75.2
- @voyant-travel/admin-host@0.99.0

## 0.21.20

### Patch Changes

- @voyant-travel/framework@0.75.1
- @voyant-travel/admin-host@0.98.0

## 0.21.19

### Patch Changes

- @voyant-travel/admin-host@0.97.0

## 0.21.18

### Patch Changes

- @voyant-travel/admin-host@0.96.0

## 0.21.17

### Patch Changes

- 3552f14: Wake the expired-hold reaper instead of polling for it.

  An availability hold records the instant it becomes reapable, so nothing has to
  poll to discover that work. `operations.release-expired-availability-holds` is
  now `wakeup: true`: placing or extending a hold reports the new expiry, the
  reaper re-arms itself from the earliest outstanding expiry after every run, and
  the cron drops to a six-hourly backstop for a wake lost to a restart.

  Hosts gain a target-neutral way to carry that request.
  `VoyantRuntimeHostPrimitives.jobs.wakeAt(jobId, at)` asks the deployment to
  invoke a wakeable job at an instant; the Node host arms one in-process timer per
  job, keeps the earliest pending instant, and declines anything past its horizon.
  A requested wake is a prompt and never durable — the declared cadence stays the
  recovery authority, as it already is for a wake arriving over
  `POST /__voyant/jobs/:id`.

  On a managed deployment this is what stops an idle tenant from paying for its
  database. A tenant with no live holds now arms nothing and never wakes its
  compute for this job; one with holds wakes exactly when there is capacity to
  give back, which is sooner than the fifteen-minute sweep it replaces.

- Updated dependencies [3552f14]
  - @voyant-travel/core@0.138.0
  - @voyant-travel/framework@0.75.0
  - @voyant-travel/apps@0.14.6
  - @voyant-travel/auth@0.150.14
  - @voyant-travel/db@0.120.2
  - @voyant-travel/hono@0.140.1
  - @voyant-travel/storage@0.115.2
  - @voyant-travel/webhook-delivery@0.5.14
  - @voyant-travel/admin-host@0.95.0

## 0.21.16

### Patch Changes

- @voyant-travel/admin-host@0.94.0

## 0.21.15

### Patch Changes

- @voyant-travel/admin-host@0.93.0

## 0.21.14

### Patch Changes

- @voyant-travel/admin-host@0.92.0
- @voyant-travel/framework@0.74.1

## 0.21.13

### Patch Changes

- e4833a1: Make the response-cache posture of a deployment declarable, and report it.

  A route that declares `Cache-Control: public, s-maxage=900` is addressing every
  shared cache at once, but nothing told its author which of them the deployment
  actually has. The standard self-hosted profile selects `cache: "postgres"`, so
  the tier meant to shield the database _is_ the database, with only a per-process
  in-memory cache in front of it whose entries are capped at 60 seconds. Managed
  deployments select Redis and put the Voyant Cloud dispatcher at the edge. The
  two products cached public responses very differently and neither said so.

  `deployment.responseCache` is where a deployment now states how it serves shared
  public responses:

      responseCache: { edge: "declared" | "none" }

  `"declared"` means an HTTP cache in front of the origin honours the route's
  `Cache-Control` — a CDN, a reverse proxy, or the dispatcher. `"none"` means the
  origin is the only shared cache. The field is optional and absent reads as
  `"none"`, never as a tier that might be there.

  It is deliberately not a provider role. Nothing is bound or constructed from it,
  so it has no entry in `VoyantDeploymentProviders` or
  `DEPLOYMENT_PROVIDER_CONTRACTS`. It records the one thing the provider
  selections cannot express — whether anything sits in front of the origin — and
  it travels with the deployment through `defineProject`, the resolved graph, and
  the generated Node artifact.

  The Node runtime reports three postures once at startup, on the console channel
  the generated entrypoint already uses for boot messages:

  - public routes mounted over `cache: "postgres"` with no declared edge tier,
    naming both remedies: a response cache that is not the database, or an edge
    tier the deployment declares;
  - `rateLimit: "memory"`, which keeps counters per process — the runtime cannot
    observe the instance count, so it states the condition rather than guessing
    the multiplier;
  - `sharedState: "memory"`, which is not shared across processes despite the name.

  None of these fail the boot. Every posture is supported; what was not supported
  was the deployment being unable to tell.

  `@voyant-travel/operator-standard` declares `{ edge: "none" }`, which is what it
  already was. Its `cache` provider is unchanged — the point is to make the choice
  visible, not to change it. The guardrail in
  `scripts/check-public-cache-policy.mjs` now asserts that the standard profile
  declares a posture rather than pinning the `cache: "postgres"` literal that kept
  the pattern in place.

  See ADR 0021 section 7 and `docs/architecture/caching-architecture.md` rule 12,
  which documents the two postures a self-hosted deployment can declare to reach
  managed response-caching behaviour without adopting a Voyant-specific component.

- Updated dependencies [c35841b]
- Updated dependencies [e4833a1]
  - @voyant-travel/hono@0.140.0
  - @voyant-travel/framework@0.74.0
  - @voyant-travel/admin-host@0.91.0
  - @voyant-travel/apps@0.14.5
  - @voyant-travel/auth@0.150.12
  - @voyant-travel/webhook-delivery@0.5.13
  - @voyant-travel/core@0.137.2

## 0.21.12

### Patch Changes

- @voyant-travel/auth@0.150.11
- @voyant-travel/admin-host@0.90.0
- @voyant-travel/framework@0.73.1

## 0.21.11

### Patch Changes

- Updated dependencies [2bc1570]
- Updated dependencies [2bc1570]
- Updated dependencies [14033fb]
  - @voyant-travel/utils@0.111.0
  - @voyant-travel/db@0.120.0
  - @voyant-travel/framework@0.73.0
  - @voyant-travel/hono@0.139.0
  - @voyant-travel/auth@0.150.10
  - @voyant-travel/runtime-core@0.6.8
  - @voyant-travel/apps@0.14.4
  - @voyant-travel/webhook-delivery@0.5.12
  - @voyant-travel/admin-host@0.89.0

## 0.21.10

### Patch Changes

- @voyant-travel/admin-host@0.88.0

## 0.21.9

### Patch Changes

- Updated dependencies [472c829]
  - @voyant-travel/framework@0.72.0
  - @voyant-travel/admin-host@0.87.0
  - @voyant-travel/auth@0.150.9

## 0.21.8

### Patch Changes

- @voyant-travel/admin-host@0.86.0
- @voyant-travel/framework@0.71.8
- @voyant-travel/auth@0.150.8

## 0.21.7

### Patch Changes

- Updated dependencies [c986bd5]
  - @voyant-travel/core@0.137.1
  - @voyant-travel/framework@0.71.7
  - @voyant-travel/apps@0.14.3
  - @voyant-travel/db@0.119.4
  - @voyant-travel/admin-host@0.85.0
  - @voyant-travel/auth@0.150.7

## 0.21.6

### Patch Changes

- Updated dependencies [5ed518e]
  - @voyant-travel/framework@0.71.6
  - @voyant-travel/db@0.119.3
  - @voyant-travel/admin-host@0.84.0
  - @voyant-travel/auth@0.150.6

## 0.21.5

### Patch Changes

- Updated dependencies [ed8610c]
  - @voyant-travel/apps@0.14.2
  - @voyant-travel/webhook-delivery@0.5.11
  - @voyant-travel/admin-host@0.83.0
  - @voyant-travel/framework@0.71.5
  - @voyant-travel/auth@0.150.5

## 0.21.4

### Patch Changes

- @voyant-travel/admin-host@0.82.0
- @voyant-travel/auth@0.150.3
- @voyant-travel/framework@0.71.4

## 0.21.3

### Patch Changes

- @voyant-travel/framework@0.71.3
- @voyant-travel/admin-host@0.81.0
- @voyant-travel/auth@0.150.2

## 0.21.2

### Patch Changes

- @voyant-travel/apps@0.14.1
- @voyant-travel/admin-host@0.80.0
- @voyant-travel/framework@0.71.2

## 0.21.1

### Patch Changes

- Updated dependencies [bf71bca]
  - @voyant-travel/apps@0.14.0
  - @voyant-travel/admin-host@0.79.0
  - @voyant-travel/auth@0.150.0
  - @voyant-travel/framework@0.71.1

## 0.21.0

### Minor Changes

- 28a6fe2: Allow one built Operator artifact to select deployment provider bindings at boot through `VOYANT_DEPLOYMENT_BINDINGS_JSON` while keeping its compiled application graph fixed.

  Model Redis keyspace isolation and network trust as explicit, independent binding constraints. Runtime-selected Redis bindings now require those properties, shared bindings require `REDIS_NAMESPACE`, and untrusted-network bindings require secure transport. Existing generated artifacts keep their previous provider selection and Redis safety behavior when no boot override is supplied.

### Patch Changes

- Updated dependencies [28a6fe2]
  - @voyant-travel/framework@0.71.0

## 0.20.1

### Patch Changes

- Updated dependencies [e65bd25]
  - @voyant-travel/framework@0.70.1
  - @voyant-travel/db@0.119.2
  - @voyant-travel/admin-host@0.78.0

## 0.20.0

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

### Patch Changes

- Updated dependencies [d77269c]
  - @voyant-travel/vite-config@0.5.0
  - @voyant-travel/framework@0.70.0

## 0.19.9

### Patch Changes

- @voyant-travel/admin-host@0.77.0
- @voyant-travel/framework@0.69.1

## 0.19.8

### Patch Changes

- Updated dependencies [0c30250]
- Updated dependencies [5fa76aa]
  - @voyant-travel/core@0.137.0
  - @voyant-travel/framework@0.69.0
  - @voyant-travel/auth@0.149.0
  - @voyant-travel/apps@0.13.0
  - @voyant-travel/db@0.119.1
  - @voyant-travel/hono@0.138.1
  - @voyant-travel/storage@0.115.1
  - @voyant-travel/webhook-delivery@0.5.10
  - @voyant-travel/admin-host@0.76.0

## 0.19.7

### Patch Changes

- @voyant-travel/admin-host@0.75.0

## 0.19.6

### Patch Changes

- Updated dependencies [e87d4de]
  - @voyant-travel/hono@0.138.0
  - @voyant-travel/admin-host@0.74.0
  - @voyant-travel/apps@0.12.17
  - @voyant-travel/auth@0.148.0
  - @voyant-travel/framework@0.68.0
  - @voyant-travel/webhook-delivery@0.5.9

## 0.19.5

### Patch Changes

- @voyant-travel/auth@0.147.1
- @voyant-travel/framework@0.67.2
- @voyant-travel/admin-host@0.73.0

## 0.19.4

### Patch Changes

- @voyant-travel/framework@0.67.1
- @voyant-travel/admin-host@0.72.0
- @voyant-travel/auth@0.147.0

## 0.19.3

### Patch Changes

- Updated dependencies [c30b6b0]
- Updated dependencies [d92a98a]
  - @voyant-travel/apps@0.12.16
  - @voyant-travel/hono@0.137.0
  - @voyant-travel/admin-host@0.71.1
  - @voyant-travel/auth@0.146.2
  - @voyant-travel/framework@0.67.0
  - @voyant-travel/webhook-delivery@0.5.8

## 0.19.2

### Patch Changes

- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
  - @voyant-travel/hono@0.136.0
  - @voyant-travel/admin-host@0.71.0
  - @voyant-travel/apps@0.12.15
  - @voyant-travel/auth@0.146.1
  - @voyant-travel/framework@0.66.0
  - @voyant-travel/webhook-delivery@0.5.7

## 0.19.1

### Patch Changes

- ef80127: Bind durable event delivery to the composed internal subscriber bus without
  making the generic Node host depend on a product package.
- Updated dependencies [ef80127]
  - @voyant-travel/framework@0.65.1

## 0.19.0

### Minor Changes

- 7496159: Add an OAuth 2.1 authorization server so chat assistants can connect to the deployment's MCP endpoint by URL alone.

  Claude and ChatGPT add remote MCP servers by pasting a URL — there is nowhere to supply an API token — so they follow the MCP authorization spec instead: dynamic client registration (RFC 7591), authorization code + PKCE, and a browser consent step. This adds that server on the admin realm via `@better-auth/oauth-provider`, with `oauth_client` / `oauth_access_token` / `oauth_refresh_token` / `oauth_consent` / `jwks` tables.

  The grant is coarse (`mcp:read`, optionally `mcp:write`) because a consent screen cannot ask a travel agent about fifty resource scopes. Effective permissions are re-derived per request from the approving staff member's current role, intersected with the actions their owning packages mark remote-safe and non-sensitive — so a connector never exceeds the person who approved it, and narrowing someone's role immediately narrows every connector they approved.

  Access tokens are signed JWTs verified against the published JWKS. Because a JWT cannot be withdrawn once signed, the resource server also re-checks the connector's consent row on every request, so disconnecting a connector takes effect on its next call rather than whenever its token happens to expire.

  Discovery documents are served at the origin root, with authorization-server endpoints rewritten onto the public API base — the Hono app strips that prefix before the auth handler sees a request, so the URLs Better Auth advertises would otherwise point at the admin SPA instead of the authorization server.

### Patch Changes

- Updated dependencies [8adeb23]
- Updated dependencies [6d0b4b4]
- Updated dependencies [7496159]
- Updated dependencies [fa75fe3]
  - @voyant-travel/db@0.119.0
  - @voyant-travel/framework@0.65.0
  - @voyant-travel/auth@0.146.0
  - @voyant-travel/hono@0.135.0
  - @voyant-travel/apps@0.12.14
  - @voyant-travel/webhook-delivery@0.5.6
  - @voyant-travel/admin-host@0.70.0

## 0.18.20

### Patch Changes

- @voyant-travel/admin-host@0.69.0
- @voyant-travel/framework@0.64.24

## 0.18.19

### Patch Changes

- @voyant-travel/admin-host@0.68.0
- @voyant-travel/framework@0.64.22

## 0.18.18

### Patch Changes

- @voyant-travel/admin-host@0.67.0
- @voyant-travel/framework@0.64.21

## 0.18.17

### Patch Changes

- @voyant-travel/admin-host@0.66.0
- @voyant-travel/framework@0.64.20

## 0.18.16

### Patch Changes

- 9c2bb8c: Derive media delivery URLs at read time instead of persisting a CDN origin

  `media_asset.url` stored a fully-qualified delivery URL captured at upload time,
  so any change to the media CDN hostname invalidated every row at once — the
  bucket, the object keys and `storage_key` stayed correct, but the library
  rendered nothing until the rows were rewritten by hand.

  `storage_key` is now the only durable locator. `StorageProvider` gains an
  optional `publicUrl(key)` that composes the delivery URL from the provider's
  currently configured origin, and `@voyant-travel/media` calls it on every read.
  The wire shape is unchanged: responses still carry `url`, it is just derived
  rather than stored. `url` is `null` when the store exposes no public origin, and
  consumers already fall back to the deployment's own byte-serving route
  (`GET /v1/admin/media/{storageKey}`).

  The gateway provider now derives from a `publicBaseUrl` wired from
  `MEDIA_PUBLIC_BASE_URL`, so the origin lives in one configurable place. **A
  deployment selecting the `gateway` storage provider must set
  `MEDIA_PUBLIC_BASE_URL`** — the gateway mints delivery URLs server-side, so
  there is nothing else to derive from, and falling back to the deployment's own
  `/v1/admin/media/*` route is not viable because that route is staff-guarded and
  storefront guests would render nothing. It fails closed at provider construction
  with an actionable message rather than degrading silently.

  A migration drops the `media_asset.url` column.

- Updated dependencies [9c2bb8c]
  - @voyant-travel/storage@0.115.0
  - @voyant-travel/framework@0.64.19

## 0.18.15

### Patch Changes

- Updated dependencies [6c76de3]
  - @voyant-travel/framework@0.64.18
  - @voyant-travel/admin-host@0.65.0

## 0.18.14

### Patch Changes

- @voyant-travel/admin-host@0.64.0
- @voyant-travel/apps@0.12.13
- @voyant-travel/auth@0.145.0
- @voyant-travel/framework@0.64.17

## 0.18.13

### Patch Changes

- @voyant-travel/admin-host@0.63.0
- @voyant-travel/framework@0.64.16

## 0.18.12

### Patch Changes

- @voyant-travel/admin-host@0.62.0
- @voyant-travel/framework@0.64.15

## 0.18.11

### Patch Changes

- @voyant-travel/admin-host@0.61.0
- @voyant-travel/framework@0.64.14

## 0.18.10

### Patch Changes

- @voyant-travel/admin-host@0.60.0
- @voyant-travel/framework@0.64.13

## 0.18.9

### Patch Changes

- @voyant-travel/admin-host@0.59.0
- @voyant-travel/framework@0.64.12

## 0.18.8

### Patch Changes

- @voyant-travel/admin-host@0.58.0
- @voyant-travel/apps@0.12.12
- @voyant-travel/auth@0.144.0
- @voyant-travel/framework@0.64.11

## 0.18.7

### Patch Changes

- @voyant-travel/framework@0.64.9
- @voyant-travel/admin-host@0.57.0

## 0.18.6

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/hono@0.134.6
  - @voyant-travel/admin-host@0.56.0
  - @voyant-travel/framework@0.64.8

## 0.18.5

### Patch Changes

- @voyant-travel/framework@0.64.7
- @voyant-travel/admin-host@0.55.0

## 0.18.4

### Patch Changes

- @voyant-travel/admin-host@0.54.0
- @voyant-travel/framework@0.64.6

## 0.18.3

### Patch Changes

- @voyant-travel/framework@0.64.5
- @voyant-travel/auth@0.143.6
- @voyant-travel/admin-host@0.53.0

## 0.18.2

### Patch Changes

- @voyant-travel/admin-host@0.52.0
- @voyant-travel/framework@0.64.4

## 0.18.1

### Patch Changes

- Updated dependencies [5e03ae7]
  - @voyant-travel/framework@0.64.2
  - @voyant-travel/admin-host@0.51.0

## 0.18.0

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

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/vite-config@0.4.0
  - @voyant-travel/core@0.136.0
  - @voyant-travel/storage@0.114.0
  - @voyant-travel/utils@0.110.0
  - @voyant-travel/framework@0.64.1
  - @voyant-travel/apps@0.12.11
  - @voyant-travel/auth@0.143.4
  - @voyant-travel/db@0.118.5
  - @voyant-travel/hono@0.134.5
  - @voyant-travel/webhook-delivery@0.5.5
  - @voyant-travel/runtime-core@0.6.7
  - @voyant-travel/admin-host@0.50.0

## 0.17.11

### Patch Changes

- Updated dependencies [3651ff7]
- Updated dependencies [c03ff60]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/framework@0.64.0
  - @voyant-travel/apps@0.12.10
  - @voyant-travel/auth@0.143.3
  - @voyant-travel/db@0.118.4
  - @voyant-travel/hono@0.134.4
  - @voyant-travel/storage@0.113.6
  - @voyant-travel/webhook-delivery@0.5.4
  - @voyant-travel/admin-host@0.49.0

## 0.17.10

### Patch Changes

- @voyant-travel/admin-host@0.48.0
- @voyant-travel/framework@0.63.3

## 0.17.9

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/core@0.134.0
  - @voyant-travel/framework@0.63.2
  - @voyant-travel/apps@0.12.9
  - @voyant-travel/auth@0.143.1
  - @voyant-travel/db@0.118.3
  - @voyant-travel/hono@0.134.3
  - @voyant-travel/storage@0.113.5
  - @voyant-travel/webhook-delivery@0.5.3
  - @voyant-travel/admin-host@0.47.0

## 0.17.8

### Patch Changes

- Updated dependencies [58020ec]
- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
  - @voyant-travel/auth@0.143.0
  - @voyant-travel/core@0.133.0
  - @voyant-travel/framework@0.63.0
  - @voyant-travel/apps@0.12.8
  - @voyant-travel/db@0.118.2
  - @voyant-travel/hono@0.134.2
  - @voyant-travel/storage@0.113.4
  - @voyant-travel/webhook-delivery@0.5.2
  - @voyant-travel/admin-host@0.46.0

## 0.17.7

### Patch Changes

- 6b1e647: Add first-class operator webhook subscription settings, delivery history, test and replay actions, permission checks, secret redaction, and protected outbound delivery.

  Start the generic Postgres delivery worker only when the webhook module is selected, and compose the new settings surface into the standard operator package.

- Updated dependencies [6b1e647]
  - @voyant-travel/webhook-delivery@0.5.0
  - @voyant-travel/apps@0.12.7
  - @voyant-travel/framework@0.62.7

## 0.17.6

### Patch Changes

- @voyant-travel/admin-host@0.45.0
- @voyant-travel/framework@0.62.6

## 0.17.5

### Patch Changes

- Updated dependencies [dd370ca]
  - @voyant-travel/core@0.132.1
  - @voyant-travel/framework@0.62.4
  - @voyant-travel/admin-host@0.44.0

## 0.17.4

### Patch Changes

- @voyant-travel/admin-host@0.43.0
- @voyant-travel/apps@0.12.6
- @voyant-travel/auth@0.142.0
- @voyant-travel/framework@0.62.1

## 0.17.3

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/framework@0.62.0
  - @voyant-travel/apps@0.12.5
  - @voyant-travel/auth@0.141.5
  - @voyant-travel/db@0.118.1
  - @voyant-travel/hono@0.134.1
  - @voyant-travel/storage@0.113.3
  - @voyant-travel/webhook-delivery@0.4.9

## 0.17.2

### Patch Changes

- Updated dependencies [e68a705]
  - @voyant-travel/framework@0.61.2
  - @voyant-travel/admin-host@0.42.0

## 0.17.1

### Patch Changes

- @voyant-travel/admin-host@0.41.0
- @voyant-travel/framework@0.61.1

## 0.17.0

### Minor Changes

- f2c9404: Retire the Voyant workflow product and its workflow-runs administration
  surface. Product-owned background behavior is now represented by jobs and
  subscribers, while in-process compensating domain coordination is exposed as a
  saga. Remove workflow deployment providers, graph facets, source conventions,
  runtime composition, and starter scripts.

### Patch Changes

- 9848276: Host package-owned product jobs by default in the standard self-hosted Operator. The Node host consumes the resolved job inventory and fixed runtime handlers, adds authenticated payload-free invocation, schedule recovery, per-job overlap protection, bounded retry, and minimal health state.
- Updated dependencies [f945310]
- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
- Updated dependencies [fafc12e]
  - @voyant-travel/framework@0.61.0
  - @voyant-travel/db@0.118.0
  - @voyant-travel/core@0.131.0
  - @voyant-travel/hono@0.134.0
  - @voyant-travel/apps@0.12.4
  - @voyant-travel/auth@0.141.4
  - @voyant-travel/webhook-delivery@0.4.8
  - @voyant-travel/storage@0.113.2
  - @voyant-travel/admin-host@0.40.0

## 0.16.5

### Patch Changes

- Updated dependencies [d9ff078]
  - @voyant-travel/framework@0.60.0
  - @voyant-travel/admin-host@0.39.0

## 0.16.4

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/framework@0.59.0
  - @voyant-travel/hono@0.133.0
  - @voyant-travel/apps@0.12.2
  - @voyant-travel/auth@0.141.3
  - @voyant-travel/workflow-runs@0.122.18
  - @voyant-travel/runtime-core@0.6.6
  - @voyant-travel/admin-host@0.38.0

## 0.16.3

### Patch Changes

- 406cebb: Add host-owned app webhook signing-key provisioning, confirmation-gated subscriptions, selected external-event durable intake, app-specific worker composition, a resident Node worker lifecycle, and server-authorized replay.
- Updated dependencies [406cebb]
  - @voyant-travel/apps@0.12.0
  - @voyant-travel/framework@0.58.1
  - @voyant-travel/runtime-core@0.6.5

## 0.16.2

### Patch Changes

- Updated dependencies [d8a225c]
  - @voyant-travel/storage@0.113.0
  - @voyant-travel/framework@0.58.0

## 0.16.1

### Patch Changes

- @voyant-travel/admin-host@0.37.0
- @voyant-travel/framework@0.57.6

## 0.16.0

### Minor Changes

- 34ebe16: Persist local (`memory` storage plan) uploads to disk so a self-hosted operator
  running without a configured S3/R2 bucket keeps its media and documents across
  restarts. Previously the in-memory provider dropped all bytes on restart while
  the catalogue rows persisted in Postgres, leaving broken thumbnails. The Node
  runtime now mirrors uploads to `<cwd>/.voyant/storage` (override with
  `STORAGE_LOCAL_DIR`) and falls back to disk on read; writes are best-effort so a
  read-only filesystem degrades to memory-only. The isomorphic `@voyant-travel/storage`
  package is untouched — the `node:fs` decorator lives in the Node-only runtime.

## 0.15.13

### Patch Changes

- @voyant-travel/admin-host@0.36.0
- @voyant-travel/framework@0.57.5

## 0.15.12

### Patch Changes

- @voyant-travel/admin-host@0.35.0
- @voyant-travel/framework@0.57.4

## 0.15.11

### Patch Changes

- @voyant-travel/admin-host@0.34.0
- @voyant-travel/framework@0.57.3

## 0.15.10

### Patch Changes

- @voyant-travel/admin-host@0.33.0
- @voyant-travel/framework@0.57.2

## 0.15.9

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0
  - @voyant-travel/apps@0.11.1
  - @voyant-travel/auth@0.141.1
  - @voyant-travel/framework@0.57.0
  - @voyant-travel/workflow-runs@0.122.15

## 0.15.8

### Patch Changes

- Updated dependencies [bcd7ad0]
  - @voyant-travel/storage@0.112.0
  - @voyant-travel/framework@0.56.3

## 0.15.7

### Patch Changes

- Updated dependencies [f0a0e09]
  - @voyant-travel/auth@0.141.0
  - @voyant-travel/admin-host@0.32.0
  - @voyant-travel/framework@0.56.2

## 0.15.6

### Patch Changes

- @voyant-travel/admin-host@0.31.0
- @voyant-travel/framework@0.56.1

## 0.15.5

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/framework@0.56.0
  - @voyant-travel/db@0.117.1
  - @voyant-travel/auth@0.140.2
  - @voyant-travel/workflow-runs@0.122.14

## 0.15.4

### Patch Changes

- @voyant-travel/admin-host@0.30.0
- @voyant-travel/auth@0.140.1
- @voyant-travel/workflow-runs@0.122.13
- @voyant-travel/framework@0.55.5

## 0.15.3

### Patch Changes

- Updated dependencies [4f34425]
  - @voyant-travel/auth@0.140.0
  - @voyant-travel/admin-host@0.29.0
  - @voyant-travel/framework@0.55.4

## 0.15.2

### Patch Changes

- Updated dependencies [2bcafc9]
  - @voyant-travel/apps@0.11.0
  - @voyant-travel/admin-host@0.28.0
  - @voyant-travel/auth@0.139.0
  - @voyant-travel/workflow-runs@0.122.12
  - @voyant-travel/framework@0.55.3

## 0.15.1

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/auth@0.138.0
  - @voyant-travel/apps@0.10.4
  - @voyant-travel/framework@0.55.2
  - @voyant-travel/hono@0.131.2
  - @voyant-travel/webhook-delivery@0.4.7
  - @voyant-travel/workflow-runs@0.122.11
  - @voyant-travel/admin-host@0.27.0

## 0.15.0

### Minor Changes

- abc32b6: Add customer business-account onboarding contracts, durable request workflows,
  deployment-composed runtime wiring, staff-guarded administration, Better Auth
  organization invitation acceptance, the framework-neutral storefront client,
  React provider operations, and the capability-gated operator page.

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/auth@0.137.0
  - @voyant-travel/db@0.116.0
  - @voyant-travel/apps@0.10.3
  - @voyant-travel/framework@0.55.1
  - @voyant-travel/hono@0.131.1
  - @voyant-travel/webhook-delivery@0.4.6
  - @voyant-travel/workflow-runs@0.122.10
  - @voyant-travel/admin-host@0.26.0

## 0.14.2

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/auth@0.136.0
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/apps@0.10.2
  - @voyant-travel/framework@0.55.0
  - @voyant-travel/storage@0.111.6
  - @voyant-travel/webhook-delivery@0.4.5
  - @voyant-travel/workflow-runs@0.122.9
  - @voyant-travel/admin-host@0.25.0

## 0.14.1

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/framework@0.54.0
  - @voyant-travel/apps@0.10.1
  - @voyant-travel/auth@0.135.1
  - @voyant-travel/db@0.114.15
  - @voyant-travel/hono@0.130.1
  - @voyant-travel/storage@0.111.5
  - @voyant-travel/webhook-delivery@0.4.4
  - @voyant-travel/workflow-runs@0.122.8
  - @voyant-travel/admin-host@0.24.0

## 0.14.0

### Minor Changes

- 16e2c2c: Mount the isolated customer Better Auth realm in managed Node runtimes while keeping Voyant Cloud as the admin broker. Resolve managed storefront auth configuration asynchronously, use its public API base for OAuth callbacks and password-reset links, and export the standard Voyant Cloud auth email sender for host composition.

### Patch Changes

- Updated dependencies [16e2c2c]
  - @voyant-travel/auth@0.135.0
  - @voyant-travel/framework@0.53.0
  - @voyant-travel/admin-host@0.23.0

## 0.13.1

### Patch Changes

- Updated dependencies [6ccc360]
  - @voyant-travel/apps@0.10.0

## 0.13.0

### Minor Changes

- f6f22e7: Require independent admin and customer auth secrets, bind provider and bearer identities to their explicit route realm, keep guest checkout capabilities independently configured, and preserve secure cloud-auth state cookies behind TLS termination.

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/auth@0.134.0
  - @voyant-travel/core@0.128.0
  - @voyant-travel/framework@0.52.0
  - @voyant-travel/hono@0.130.0
  - @voyant-travel/apps@0.9.1
  - @voyant-travel/db@0.114.14
  - @voyant-travel/storage@0.111.4
  - @voyant-travel/webhook-delivery@0.4.3
  - @voyant-travel/workflow-runs@0.122.7
  - @voyant-travel/runtime-core@0.6.4
  - @voyant-travel/admin-host@0.22.0

## 0.12.2

### Patch Changes

- Updated dependencies [9c06938]
  - @voyant-travel/apps@0.9.0
  - @voyant-travel/core@0.127.1
  - @voyant-travel/hono@0.129.2

## 0.12.1

### Patch Changes

- 1881293: Require realm-specific Better Auth secrets, remove the legacy shared-secret path, and reject existing customer sessions when customer authentication is disabled.
- Updated dependencies [1881293]
  - @voyant-travel/auth@0.133.5
  - @voyant-travel/framework@0.51.1
  - @voyant-travel/hono@0.129.1

## 0.12.0

### Minor Changes

- 96c91b9: Compose provider-neutral remote-app OAuth and session exchange from host-owned
  runtime inputs, add exact client-authenticated route posture, and augment app
  access-token resolution without replacing staff authentication.

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/apps@0.8.0
  - @voyant-travel/framework@0.51.0
  - @voyant-travel/hono@0.129.0
  - @voyant-travel/auth@0.133.4
  - @voyant-travel/workflow-runs@0.122.6

## 0.11.17

### Patch Changes

- Updated dependencies [d2d7384]
  - @voyant-travel/apps@0.7.0
  - @voyant-travel/admin-host@0.21.0
  - @voyant-travel/framework@0.50.3

## 0.11.16

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/apps@0.6.3
  - @voyant-travel/auth@0.133.3
  - @voyant-travel/db@0.114.13
  - @voyant-travel/framework@0.50.2
  - @voyant-travel/hono@0.128.6
  - @voyant-travel/storage@0.111.3
  - @voyant-travel/webhook-delivery@0.4.2
  - @voyant-travel/workflow-runs@0.122.5
  - @voyant-travel/admin-host@0.20.0

## 0.11.15

### Patch Changes

- 07334a7: Split operator and storefront authentication into isolated Better Auth realms,
  add provider-neutral identity adapters, and support managed WorkOS-backed admin
  sessions alongside merchant-configurable customer email and social login.
- Updated dependencies [07334a7]
  - @voyant-travel/auth@0.133.2
  - @voyant-travel/core@0.126.1
  - @voyant-travel/db@0.114.12
  - @voyant-travel/framework@0.50.1
  - @voyant-travel/hono@0.128.5

## 0.11.14

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/framework@0.50.0
  - @voyant-travel/apps@0.6.2
  - @voyant-travel/auth@0.133.1
  - @voyant-travel/db@0.114.11
  - @voyant-travel/hono@0.128.4
  - @voyant-travel/storage@0.111.2
  - @voyant-travel/webhook-delivery@0.4.1
  - @voyant-travel/workflow-runs@0.122.4

## 0.11.13

### Patch Changes

- Updated dependencies [5fe9918]
- Updated dependencies [5fe9918]
- Updated dependencies [5fe9918]
  - @voyant-travel/apps@0.6.0

## 0.11.12

### Patch Changes

- 590d256: Republish with dependency ranges resolved. The prior tarballs for these packages
  carry raw `workspace:` specifiers (they were published outside the pnpm-aware
  release flow) and cannot be installed by consumers. Also fixes the `runtime`
  package's `prepack`, which rebuilt the entire workspace dependency closure on
  every publish — the slow build stalled the release train's publish step past its
  timeout and wedged the whole batch. `prepack` now builds only the package itself,
  matching every other package.
- Updated dependencies [a461920]
  - @voyant-travel/apps@0.5.0
  - @voyant-travel/admin-host@0.19.0
  - @voyant-travel/auth@0.133.0
  - @voyant-travel/framework@0.49.4

## 0.11.11

### Patch Changes

- 3a90c27: Publish the first versioned remote App API surface with app-token routing,
  service-boundary installation and scope checks, custom-field owner isolation,
  finance action approval enforcement, webhook/audit self-read endpoints, and
  runtime app-token resolution.
- Updated dependencies [3a90c27]
- Updated dependencies [3a90c27]
- Updated dependencies [3a90c27]
  - @voyant-travel/apps@0.4.0
  - @voyant-travel/core@0.125.2
  - @voyant-travel/framework@0.49.3
  - @voyant-travel/hono@0.128.3

## 0.11.10

### Patch Changes

- @voyant-travel/framework@0.49.2
- @voyant-travel/admin-host@0.18.0

## 0.11.9

### Patch Changes

- @voyant-travel/admin-host@0.17.0
- @voyant-travel/framework@0.49.1

## 0.11.8

### Patch Changes

- Updated dependencies [04b031d]
- Updated dependencies [926ea47]
  - @voyant-travel/webhook-delivery@0.4.0
  - @voyant-travel/framework@0.49.0
  - @voyant-travel/admin-host@0.16.0
  - @voyant-travel/auth@0.132.5
  - @voyant-travel/workflow-runs@0.122.3

## 0.11.7

### Patch Changes

- @voyant-travel/admin-host@0.15.0
- @voyant-travel/framework@0.48.3

## 0.11.6

### Patch Changes

- Updated dependencies [4b6145d]
  - @voyant-travel/framework@0.48.1
  - @voyant-travel/admin-host@0.14.0

## 0.11.5

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/core@0.125.0
  - @voyant-travel/framework@0.48.0
  - @voyant-travel/auth@0.132.3
  - @voyant-travel/db@0.114.9
  - @voyant-travel/hono@0.128.1
  - @voyant-travel/storage@0.111.1
  - @voyant-travel/webhook-delivery@0.3.4
  - @voyant-travel/workflow-runs@0.122.2
  - @voyant-travel/admin-host@0.13.0

## 0.11.4

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/framework@0.47.0
  - @voyant-travel/hono@0.128.0
  - @voyant-travel/storage@0.111.0
  - @voyant-travel/workflow-runs@0.122.0
  - @voyant-travel/auth@0.132.1
  - @voyant-travel/admin-host@0.12.0
  - @voyant-travel/db@0.114.8

## 0.11.3

### Patch Changes

- Updated dependencies [a1842a7]
  - @voyant-travel/hono@0.127.2
  - @voyant-travel/admin-host@0.11.0
  - @voyant-travel/auth@0.132.0
  - @voyant-travel/framework@0.46.2

## 0.11.2

### Patch Changes

- Updated dependencies [cabf662]
- Updated dependencies [848b581]
- Updated dependencies [c9b6144]
- Updated dependencies [ff87f68]
  - @voyant-travel/core@0.124.0
  - @voyant-travel/auth@0.131.0
  - @voyant-travel/framework@0.46.1
  - @voyant-travel/workflow-runs@0.121.0
  - @voyant-travel/db@0.114.7
  - @voyant-travel/hono@0.127.1
  - @voyant-travel/storage@0.110.2
  - @voyant-travel/webhook-delivery@0.3.3
  - @voyant-travel/admin-host@0.10.0

## 0.11.1

### Patch Changes

- Updated dependencies [7e9f77a]
- Updated dependencies [7e9f77a]
- Updated dependencies [75494ca]
- Updated dependencies [82ffd12]
- Updated dependencies [a98ec27]
- Updated dependencies [9c85101]
- Updated dependencies [6147b93]
  - @voyant-travel/vite-config@0.3.4
  - @voyant-travel/admin-host@0.9.0
  - @voyant-travel/core@0.123.0
  - @voyant-travel/framework@0.46.0
  - @voyant-travel/hono@0.127.0
  - @voyant-travel/auth@0.130.0
  - @voyant-travel/db@0.114.6
  - @voyant-travel/storage@0.110.1
  - @voyant-travel/webhook-delivery@0.3.2
  - @voyant-travel/workflow-runs@0.120.4

## 0.11.0

### Minor Changes

- 73ab096: Standardize first-party packages on package-owned deployment manifests, provider selection,
  access metadata, concrete event contracts, selected admin navigation, and published runtime
  references. Add Bookings Extras as an independently selected graph unit and remove the central
  admin navigation catalog.
  Link facets now distinguish entity `linkable` metadata from executable `definition` exports, and
  generated Node registries reject malformed definitions before service registration.
  Provider-owned required config and secrets now apply only when that provider is selected, so
  local and in-memory deployments do not require credentials for inactive remote providers.

### Patch Changes

- Updated dependencies [46e7edf]
- Updated dependencies [73ab096]
  - @voyant-travel/framework@0.45.0
  - @voyant-travel/auth@0.129.0
  - @voyant-travel/storage@0.110.0
  - @voyant-travel/core@0.122.2
  - @voyant-travel/db@0.114.5
  - @voyant-travel/workflow-runs@0.120.3
  - @voyant-travel/admin-host@0.8.0

## 0.10.5

### Patch Changes

- f9a2d77: Keep deployment search selection authoritative while allowing custom hosts to
  supply either a catalog indexer adapter or provider through one shared runtime
  port.

## 0.10.4

### Patch Changes

- @voyant-travel/admin-host@0.7.0
- @voyant-travel/framework@0.44.4

## 0.10.3

### Patch Changes

- 8d62a7c: Embed TypeScript sources in published JavaScript source maps so consumer dev servers can resolve
  them without the omitted `src` tree. Stop emitting declaration maps that cannot embed their sources,
  and reject publish tarballs whose maps reference sources that are neither packed nor embedded.
- Updated dependencies [8d62a7c]
- Updated dependencies [8d62a7c]
  - @voyant-travel/auth@0.128.3
  - @voyant-travel/core@0.122.1
  - @voyant-travel/db@0.114.4
  - @voyant-travel/runtime-core@0.6.3
  - @voyant-travel/webhook-delivery@0.3.1
  - @voyant-travel/admin-host@0.6.1
  - @voyant-travel/framework@0.44.3
  - @voyant-travel/hono@0.126.3
  - @voyant-travel/storage@0.109.4
  - @voyant-travel/vite-config@0.3.3
  - @voyant-travel/workflow-runs@0.120.2

## 0.10.2

### Patch Changes

- @voyant-travel/db@0.114.3
- @voyant-travel/admin-host@0.6.0
- @voyant-travel/auth@0.128.2
- @voyant-travel/workflow-runs@0.120.1
- @voyant-travel/framework@0.44.2

## 0.10.1

### Patch Changes

- d83d237: Repair packaged consumer development and production startup, keep shared UI
  contexts single-instanced under Vite, make unconfigured realtime quiet, and
  restore narrow client-safe validation and Finance voucher setup exports. Resolve
  legacy frontend imports through product-owned browser facades and allow clean CI
  installs to fetch metadata for external dependencies.
- Updated dependencies [d83d237]
  - @voyant-travel/admin-host@0.5.1
  - @voyant-travel/framework@0.44.1
  - @voyant-travel/vite-config@0.3.2

## 0.10.0

### Minor Changes

- df3e4ec: Publish the engine-neutral catalog indexer adapter and provider contracts under
  `./indexer/contract`, including optional admin lifecycle operations. Add the
  framework-neutral `./indexer/conformance` kit for external adapter packages.

  Make `deployment.providers.search` authoritative through the `catalog.indexer`
  runtime port, ship Typesense as the selected first-party provider, support
  explicit project-owned overrides, and remove direct Typesense search and
  maintenance bypasses.

### Patch Changes

- Updated dependencies [df3e4ec]
  - @voyant-travel/framework@0.44.0

## 0.9.0

### Minor Changes

- 2cc954a: Make outbound webhook enqueue authority an explicit deployment provider. Standard Operator and managed-cloud deployments select `outboundWebhooks: "postgres"`; projects may instead select `"host"` with an injected `host.deliverEvent`, or `"none"` to omit graph outbound composition. `@voyant-travel/webhook-delivery` now owns provider resolution and the Postgres enqueuer adapter, while generic Runtime no longer calls the concrete Postgres enqueue function. Regenerate graphs so the provider role is present. See [Migrating to Framework 0.42](../docs/migrations/migrating-to-0.42.md#outbound-webhook-enqueue-provider).
- 07a6ee3: Make `deployment.providers.workflows` authoritative for Node workflow execution and Workflow Runs admin ownership. Self-hosted Operators now use the durable Postgres driver and receive package-owned orchestrator migrations; local mode uses the in-memory adapter, `none` omits workflow composition, and Voyant Cloud fails closed when credentials are missing.

  Scheduled one-shot dispatch disables resident scheduler and time-wheel loops and always shuts down its driver. Managed Cloud snapshots must select `voyant-cloud` before this release is deployed.

  See the [Framework 0.42 migration guide](../docs/migrations/migrating-to-0.42.md) for provider, migration, and rollout steps.

### Patch Changes

- 2669577: Start production operator projects through their Vite-built TanStack server
  entry so virtual router imports and the React SSR singleton resolve from the
  generated server graph.
- cc85042: Make deployment provider selection authoritative for Node storage, cache, shared
  state, and rate limiting. Replace vendor-specific object-store bindings and R2
  shims with logical media/document stores, a memory provider, an AWS SDK v3
  S3-compatible provider, and package-selected custom adapters. Add a portable
  storage provider conformance runner, resolve adapters from the `storage.object`
  graph provider, and make provider config/secret/resource usage explicit. Keep
  distributed shared state and rate-limit KV authoritative by bypassing the
  cache-only process-local L1, and move guest booking lookups onto the selected
  atomic rate-limit store. Remove the former R2/SigV4 exports.
- Updated dependencies [2669577]
- Updated dependencies [2cc954a]
- Updated dependencies [cc85042]
- Updated dependencies [07a6ee3]
  - @voyant-travel/framework@0.43.0
  - @voyant-travel/vite-config@0.3.1
  - @voyant-travel/webhook-delivery@0.3.0
  - @voyant-travel/core@0.122.0
  - @voyant-travel/db@0.114.2
  - @voyant-travel/hono@0.126.2
  - @voyant-travel/runtime-core@0.6.2
  - @voyant-travel/storage@0.109.3
  - @voyant-travel/workflow-runs@0.120.0
  - @voyant-travel/auth@0.128.1

## 0.8.0

### Minor Changes

- 3f6694b: Select the customer Storefront presentation through the deployment graph. Project resolution now emits a selected presentation factory artifact, and the standard Operator emits Storefront routes only when that presentation is selected.
- 37031e9: Move Workflow Runs registry and route composition behind its selected-graph runtime port. The generic Node runtime no longer mounts Workflow Runs routes when the module is not selected.

  Direct applications can continue to instantiate `WorkflowRunnerRegistry` and call `mountWorkflowRunsAdminRoutes`. Runtime-port implementations must now expose both `register()` and `get()`.

  See the [Workflow Runs 0.119 migration guide](../docs/migrations/migrating-to-0.119.md) for the custom provider update.

### Patch Changes

- Updated dependencies [4bc540f]
- Updated dependencies [318ca57]
- Updated dependencies [3f6694b]
- Updated dependencies [37031e9]
  - @voyant-travel/auth@0.128.0
  - @voyant-travel/framework@0.42.0
  - @voyant-travel/core@0.121.0
  - @voyant-travel/workflow-runs@0.119.0
  - @voyant-travel/db@0.114.1
  - @voyant-travel/hono@0.126.1
  - @voyant-travel/webhook-delivery@0.2.2
  - @voyant-travel/admin-host@0.5.0

## 0.7.4

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [abbb9cd]
- Updated dependencies [bef5b7c]
- Updated dependencies [d4fa159]
  - @voyant-travel/hono@0.126.0
  - @voyant-travel/db@0.114.0
  - @voyant-travel/framework@0.41.0
  - @voyant-travel/core@0.120.0
  - @voyant-travel/auth@0.127.0
  - @voyant-travel/workflow-runs@0.118.0
  - @voyant-travel/admin-host@0.4.0
  - @voyant-travel/runtime-core@0.6.1
  - @voyant-travel/webhook-delivery@0.2.1

## 0.7.3

### Patch Changes

- a5d25ea: Keep project Vite configuration from redirecting the lifecycle-owned Node distribution output.

## 0.7.2

### Patch Changes

- a7d14cd: Load an optional project-root Vite configuration during both development and production builds.

## 0.7.1

### Patch Changes

- 0ddd848: Build every Vite application environment for clean projects so `voyant build`
  emits both the client assets and the TanStack Start Node server.

## 0.7.0

### Minor Changes

- c65b05c: Move the complete graph-native Node application host into runtime,
  including generated graph admission, local and managed auth, API/admin serving,
  workflow services and schedules, outbound delivery, links, and runtime ports.
  Move the generic Postgres webhook enqueue boundary out of Distribution and into
  the neutral webhook-delivery package.
- 1f6effe: Add the versioned `@voyant-travel/runtime/tooling` project build and development server API for external CLI consumers, and keep generated standard frontend routes resolvable through the selected product distribution.
- 490d132: Add the graph-native generic Node runtime API and boot generated project and
  deployment artifacts without constructing or reading a managed-profile
  compatibility snapshot.
- 047c3f9: Release the generic Node operator host and minimal project authoring surface, with standard product
  BOM expansion, convention-driven project runtime adapters, and an independently bootable starter.
- 490d132: Boot packaged Operator projects with the statically selected package runtime contributors and reusable generic Node host primitives instead of fail-on-use runtime port stubs.
- 282892e: Make `@voyant-travel/runtime` the single public Node project host, move low-level
  host primitives to `@voyant-travel/runtime-core`, and remove the package-owned
  runtime CLI. Rename remaining first-party operator-specific subpaths to generic
  runtime or runtime-support surfaces.

### Patch Changes

- c65b05c: Generate standard Operator TypeScript, environment, Vite, and Vitest metadata beneath `.voyant` instead of shipping copied starter configuration.
- c65b05c: Move generic selected-graph OpenAPI host assembly out of the Operator starter and into the Node runtime package.
- cda53b6: Preserve legacy migration and route behavior in the unified Node host, align generated admin assets with their graph artifacts, restore auth email and media compatibility, and publish the selected-graph OpenAPI entry.
- c65b05c: Validate required auth secrets at the Operator auth boundary, adapt the generic
  Node host contracts to auth, webhook, and scheduled workflow runtimes, and
  exclude test sources from the published package build.
- c65b05c: Own generic Operator deployment-resource composition in the runtime package so projects inject only concrete Node primitives and generated graph ports.
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [cda53b6]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [282892e]
  - @voyant-travel/auth@0.126.0
  - @voyant-travel/framework@0.40.0
  - @voyant-travel/workflow-runs@0.117.0
  - @voyant-travel/admin-host@0.3.0
  - @voyant-travel/db@0.113.0
  - @voyant-travel/core@0.119.0
  - @voyant-travel/webhook-delivery@0.2.0
  - @voyant-travel/vite-config@0.3.0
  - @voyant-travel/hono@0.125.1
  - @voyant-travel/runtime-core@0.6.0
