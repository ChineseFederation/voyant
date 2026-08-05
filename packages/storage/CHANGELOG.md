# @voyant-travel/storage

## 0.115.4

### Patch Changes

- Updated dependencies [7b8ef95]
  - @voyant-travel/core@0.140.0

## 0.115.3

### Patch Changes

- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
  - @voyant-travel/core@0.139.0

## 0.115.2

### Patch Changes

- Updated dependencies [3552f14]
  - @voyant-travel/core@0.138.0

## 0.115.1

### Patch Changes

- Updated dependencies [0c30250]
  - @voyant-travel/core@0.137.0

## 0.115.0

### Minor Changes

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

## 0.114.0

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
  - @voyant-travel/core@0.136.0

## 0.113.6

### Patch Changes

- Updated dependencies [3651ff7]
  - @voyant-travel/core@0.135.0

## 0.113.5

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/core@0.134.0

## 0.113.4

### Patch Changes

- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
  - @voyant-travel/core@0.133.0

## 0.113.3

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0

## 0.113.2

### Patch Changes

- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/core@0.131.0

## 0.113.1

### Patch Changes

- 36b6802: Gateway storage provider: pin a tier prefix per store. `createGatewayStorageProvider` now accepts a `tier` option that is prepended to every object key on the wire (`media/…`, `documents/…`), which the asset-gateway uses to select the target bucket. The prefix is transparent to callers — keys passed in and returned stay un-prefixed, so `upload → get/delete` round-trips no longer double-prefix. `createGatewayGraphStorageProvider` pins `media`/`documents` accordingly. Fixes managed uploads failing with `400 invalid_key` because the media module's `uploads/media/…` keys reached the gateway without a tier segment.

## 0.113.0

### Minor Changes

- d8a225c: Add a selectable `gateway` object-storage provider. Managed deployments can now
  resolve their `media`/`documents` stores through the platform asset-storage
  gateway (via the existing `createGatewayStorageProvider`) instead of holding raw
  bucket credentials: both stores talk to `STORAGE_GATEWAY_ENDPOINT` with a
  workspace-scoped `STORAGE_GATEWAY_TOKEN` bearer token, and the gateway brokers
  R2 access scoped to the caller's `<jurisdiction>/<org>` prefix.

  The storage manifest exposes the provider under `selection { role: "storage",
value: "gateway" }`, and the Node runtime provider plan accepts `storage:
"gateway"` (requiring `STORAGE_GATEWAY_ENDPOINT` + `STORAGE_GATEWAY_TOKEN`) and
  maps it to the `object-storage` deployment resource. Self-hosters are
  unaffected — they continue to use `s3-compatible` or the local memory provider,
  with no token.

## 0.112.0

### Minor Changes

- bcd7ad0: Add a generic `gateway` storage provider: an HTTP client that implements the
  `StorageProvider` interface by calling a configured storage-gateway endpoint
  with a bearer token.

  - `createGatewayStorageProvider({ endpoint, token, fetch?, name? })` speaks a
    small object API under `/v1/objects` — `PUT` to upload, `GET` to fetch bytes
    (404 → `null`), `DELETE` to remove (404 treated as a no-op), and
    `POST .../signed-url` to mint a time-limited download URL.
  - Every request carries `Authorization: Bearer ${token}`. The token is opaque:
    the provider never parses it and leaves scope resolution to the gateway. A
    `401` raises a clear auth error; other non-2xx responses surface the status
    and a body snippet.
  - Path segments are URL-encoded individually so keys containing `/` route
    correctly, while keys are otherwise passed through untouched.
  - The factory and its `GatewayStorageProviderOptions` type are exported from the
    package root and via the `./providers/gateway` subpath.

## 0.111.6

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/core@0.130.0

## 0.111.5

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0

## 0.111.4

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/core@0.128.0

## 0.111.3

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0

## 0.111.2

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0

## 0.111.1

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/core@0.125.0

## 0.111.0

### Minor Changes

- 8f0fa26: Make Hono the explicit sole server API runtime while moving package and
  deployment interfaces to role-based API vocabulary. Replace Hono-prefixed module,
  extension, bundle, lazy-route, and factory names with `Api*` names; move
  router-named domain runtime entry points to `./api-runtime`; and remove the old
  names without compatibility aliases.

## 0.110.2

### Patch Changes

- Updated dependencies [cabf662]
- Updated dependencies [c9b6144]
  - @voyant-travel/core@0.124.0

## 0.110.1

### Patch Changes

- Updated dependencies [7e9f77a]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0

## 0.110.0

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

- Updated dependencies [73ab096]
  - @voyant-travel/core@0.122.2

## 0.109.4

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
  - @voyant-travel/core@0.122.1

## 0.109.3

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
- Updated dependencies [cc85042]
- Updated dependencies [07a6ee3]
  - @voyant-travel/core@0.122.0

## 0.109.2

### Patch Changes

- Updated dependencies [3f6694b]
  - @voyant-travel/core@0.121.0

## 0.109.1

### Patch Changes

- Updated dependencies [bef5b7c]
  - @voyant-travel/core@0.120.0

## 0.109.0

### Minor Changes

- 490d132: Publish package-owned OpenAPI registries and graph document declarations for storage, realtime, and public document delivery APIs, with exact operation ownership for overlapping route mounts.
- 490d132: Move standard Node media storage, video upload, document delivery, and brochure printing authority into package-owned runtime contributors.

### Patch Changes

- 490d132: Move the final Operator runtime-port registrations into package-owned contributor surfaces.
- 490d132: Declare package-owned runtime contributors in `voyant.package.v1` metadata and statically lower selected contributors into generated Node graph source. Node hosts now compose one generated contributor set from opaque host resources without enumerating first-party factories or package IDs.
- 490d132: Replace target-labelled standard Node runtime entries with neutral package-owned runtime exports and static contributors.
- 490d132: Move platform and operations OpenAPI authority into the owning package manifests and publish their committed documents from package-local exports.
- 490d132: Derive host-service runtime port bindings from deployment capabilities.
- 490d132: Move Inventory workflow and brochure runtime composition behind package-owned typed ports and remove the Operator runtime capability.
- 490d132: Make package and project declarations the sole selected access authority, removing legacy catalog overlays and runtime synthesis.
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
  - @voyant-travel/core@0.119.0

## 0.108.1

### Patch Changes

- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [8f537b0]
- Updated dependencies [d26a820]
- Updated dependencies [d771be3]
- Updated dependencies [bd7a830]
  - @voyant-travel/core@0.118.0

## 0.108.0

### Minor Changes

- c66f9a5: Add package-owned typed runtime factories and deployment port binding, then migrate storage and realtime away from Operator package-id bindings.

### Patch Changes

- Updated dependencies [c66f9a5]
  - @voyant-travel/core@0.117.0

## 0.107.2

### Patch Changes

- Updated dependencies [8576451]
  - @voyant-travel/core@0.116.0

## 0.107.1

### Patch Changes

- Updated dependencies [e4e6621]
- Updated dependencies [953e418]
- Updated dependencies [2153e48]
  - @voyant-travel/core@0.115.0

## 0.107.0

### Minor Changes

- a370024: Publish package-owned deployment manifests for storage media routes and public document delivery.

  Move public document delivery into its own package while retaining the Hono compatibility export,
  and expose storage upload, serve, and video-ticket routes independently from inventory brochures.

- e3dc5a9: Declare package-owned Node application resources, providers, configuration, secrets, events, subscribers, access, and retain-data lifecycle metadata in deployment manifests.

### Patch Changes

- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/core@0.114.0

## 0.106.0

### Minor Changes

- 9a1197b: Move the operator media upload and serve routes off the bare `/v1/*` surface and onto `/v1/admin/*`.

  Uploads now post to `/v1/admin/uploads` and video tickets to `/v1/admin/uploads/video`; stored media is served from `/v1/admin/media/*`. The Hono app no longer mounts the bare `/v1/*` catch-all actor guard, and worker-runtime hosts can use `rewriteAppPath` to preserve compatibility for persisted legacy media URLs.

## 0.105.0

### Minor Changes

- 13fe70b: The storage module now owns the media upload + serve routes: new `@voyant-travel/storage/routes` export (`createMediaRoutes(options)`) with the R2 storage provider and video upload-ticket signer injected as options. Adds `hono`/`zod` as peer/dev deps; depends only on `hono` (not `@voyant-travel/hono`) to avoid a cycle.

## 0.104.1

## 0.104.0

## 0.103.0

## 0.102.0

## 0.101.2

## 0.101.1

## 0.101.0

## 0.100.0

## 0.99.0

## 0.98.0

## 0.97.0

## 0.96.0

## 0.95.0

## 0.94.0

## 0.93.0

## 0.92.0

## 0.91.0

## 0.90.0

## 0.89.0

## 0.88.0

## 0.87.1

## 0.87.0

## 0.86.0

## 0.85.4

## 0.85.3

## 0.85.2

## 0.85.1

## 0.85.0

## 0.84.4

## 0.84.3

## 0.84.2

## 0.84.1

## 0.84.0

## 0.83.1

## 0.83.0

## 0.82.1

## 0.82.0

## 0.81.21

## 0.81.20

## 0.81.19

## 0.81.18

## 0.81.17

## 0.81.16

## 0.81.15

## 0.81.14

## 0.81.13

## 0.81.12

## 0.81.11

## 0.81.10

## 0.81.9

## 0.81.8

## 0.81.7

## 0.81.6

## 0.81.5

## 0.81.4

## 0.81.3

## 0.81.2

## 0.81.1

## 0.81.0

## 0.80.18

## 0.80.17

## 0.80.16

## 0.80.15

## 0.80.14

## 0.80.13

## 0.80.12

## 0.80.11

## 0.80.10

## 0.80.9

## 0.80.8

## 0.80.7

## 0.80.6

## 0.80.5

## 0.80.4

## 0.80.3

## 0.80.2

## 0.80.1

## 0.80.0

## 0.79.0

## 0.78.0

## 0.77.13

## 0.77.12

## 0.77.11

## 0.77.10

## 0.77.9

## 0.77.8

## 0.77.7

## 0.77.6

## 0.77.5

## 0.77.4

## 0.77.3

## 0.77.2

## 0.77.1

## 0.77.0

## 0.76.0

## 0.75.7

## 0.75.6

## 0.75.5

## 0.75.4

## 0.75.3

## 0.75.2

## 0.75.1

## 0.75.0

## 0.74.2

### Patch Changes

- 37c08cd: Throw from the R2 provider's `signedUrl` when neither a signer nor public base URL is configured instead of returning the raw storage key.

## 0.74.1

## 0.74.0

## 0.73.1

## 0.73.0

## 0.72.0

## 0.71.0

## 0.70.0

## 0.69.1

## 0.69.0

## 0.68.0

## 0.67.0

## 0.66.6

## 0.66.5

## 0.66.4

## 0.66.3

## 0.66.2

## 0.66.1

## 0.66.0

## 0.65.0

## 0.64.1

## 0.64.0

## 0.63.1

## 0.63.0

## 0.62.3

## 0.62.2

## 0.62.1

## 0.62.0

## 0.61.0

## 0.60.0

## 0.59.0

## 0.58.0

## 0.57.0

## 0.56.0

## 0.55.1

## 0.55.0

## 0.54.0

## 0.53.2

## 0.53.1

## 0.53.0

## 0.52.4

## 0.52.3

## 0.52.2

## 0.52.1

## 0.52.0

## 0.51.1

## 0.51.0

## 0.50.8

## 0.50.7

## 0.50.6

## 0.50.5

## 0.50.4

## 0.50.3

## 0.50.2

## 0.50.1

## 0.50.0

## 0.49.0

## 0.48.0

## 0.47.0

## 0.46.0

## 0.45.0

## 0.44.0

## 0.43.0

## 0.42.0

## 0.41.3

## 0.41.2

## 0.41.1

## 0.41.0

## 0.40.1

## 0.40.0

## 0.39.0

## 0.38.2

## 0.38.1

## 0.38.0

## 0.37.1

## 0.37.0

## 0.36.0

## 0.35.0

## 0.34.0

## 0.33.1

## 0.33.0

## 0.32.3

## 0.32.2

## 0.32.1

## 0.32.0

## 0.31.4

## 0.31.3

## 0.31.2

## 0.31.1

## 0.31.0

## 0.30.7

## 0.30.6

## 0.30.5

## 0.30.4

## 0.30.3

## 0.30.2

## 0.30.1

## 0.30.0

## 0.29.0

## 0.28.3

## 0.28.2

## 0.28.1

## 0.28.0

## 0.27.0

## 0.26.9

## 0.26.8

## 0.26.7

## 0.26.6

## 0.26.5

## 0.26.4

## 0.26.3

## 0.26.2

## 0.26.1

## 0.26.0

## 0.25.0

## 0.24.3

## 0.24.2

## 0.24.1

## 0.24.0

## 0.23.0

## 0.22.0

## 0.21.1

## 0.21.0

## 0.20.0

## 0.19.0

## 0.18.0

## 0.17.0

## 0.16.0

## 0.15.0

## 0.14.0

## 0.13.0

## 0.12.0

## 0.11.0

## 0.10.0

## 0.9.0

## 0.8.0

## 0.7.0

## 0.6.9

## 0.6.8

## 0.6.7

## 0.6.6

## 0.6.5

## 0.6.4

## 0.6.3

## 0.6.2

## 0.6.1

## 0.6.0

## 0.5.0

## 0.4.5

## 0.4.4

## 0.4.3

## 0.4.2

## 0.4.1

## 0.4.0

### Patch Changes

- 2d5f323: Promote `@voyant-travel/storage` into the public release train so storage-backed legal, finance, and product document workflows can publish cleanly.
