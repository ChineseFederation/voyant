# @voyant-travel/media

## 0.6.13

### Patch Changes

- 36f3085: Stamp `x-voyant-key-kind` on every published operation in this package's OpenAPI
  documents.

  These packages own admin-surface documents only, so every operation reads
  `secret`: a publishable storefront key never reaches `/v1/admin/*`. Stating it
  per operation is the point — "which credential does this accept" should not be
  something a reader has to infer from a path prefix.

- Updated dependencies [c805276]
- Updated dependencies [36f3085]
- Updated dependencies [c805276]
- Updated dependencies [36f3085]
  - @voyant-travel/core@0.141.0
  - @voyant-travel/db@0.122.0
  - @voyant-travel/storage@0.115.6
  - @voyant-travel/hono@0.143.0
  - @voyant-travel/types@0.110.0

## 0.6.12

### Patch Changes

- Updated dependencies [afb6866]
- Updated dependencies [5d1b298]
  - @voyant-travel/db@0.121.0
  - @voyant-travel/hono@0.142.2
  - @voyant-travel/types@0.109.13
  - @voyant-travel/core@0.140.2

## 0.6.11

### Patch Changes

- Updated dependencies [7b8ef95]
  - @voyant-travel/core@0.140.0
  - @voyant-travel/db@0.120.6
  - @voyant-travel/hono@0.142.1
  - @voyant-travel/storage@0.115.4

## 0.6.10

### Patch Changes

- Updated dependencies [e8bd000]
  - @voyant-travel/hono@0.142.0

## 0.6.9

### Patch Changes

- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
  - @voyant-travel/core@0.139.0
  - @voyant-travel/hono@0.141.0
  - @voyant-travel/db@0.120.3
  - @voyant-travel/storage@0.115.3

## 0.6.8

### Patch Changes

- Updated dependencies [3552f14]
  - @voyant-travel/core@0.138.0
  - @voyant-travel/db@0.120.2
  - @voyant-travel/hono@0.140.1
  - @voyant-travel/storage@0.115.2

## 0.6.7

### Patch Changes

- Updated dependencies [c35841b]
  - @voyant-travel/hono@0.140.0
  - @voyant-travel/core@0.137.2

## 0.6.6

### Patch Changes

- Updated dependencies [2bc1570]
- Updated dependencies [2bc1570]
- Updated dependencies [14033fb]
  - @voyant-travel/db@0.120.0
  - @voyant-travel/hono@0.139.0
  - @voyant-travel/types@0.109.12

## 0.6.5

### Patch Changes

- Updated dependencies [0c30250]
  - @voyant-travel/core@0.137.0
  - @voyant-travel/db@0.119.1
  - @voyant-travel/hono@0.138.1
  - @voyant-travel/storage@0.115.1

## 0.6.4

### Patch Changes

- Updated dependencies [e87d4de]
  - @voyant-travel/hono@0.138.0

## 0.6.3

### Patch Changes

- Updated dependencies [d92a98a]
  - @voyant-travel/hono@0.137.0

## 0.6.2

### Patch Changes

- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
  - @voyant-travel/hono@0.136.0

## 0.6.1

### Patch Changes

- Updated dependencies [8adeb23]
- Updated dependencies [6d0b4b4]
- Updated dependencies [7496159]
- Updated dependencies [fa75fe3]
  - @voyant-travel/db@0.119.0
  - @voyant-travel/hono@0.135.0
  - @voyant-travel/types@0.109.10

## 0.6.0

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

### Patch Changes

- Updated dependencies [9c2bb8c]
  - @voyant-travel/storage@0.115.0

## 0.5.0

### Minor Changes

- 9e57a5d: Add localized alt text, canonical delivery URLs, and an optional authenticated
  site/CMS bridge to the shared media library.

## 0.4.9

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/core@0.136.0
  - @voyant-travel/storage@0.114.0
  - @voyant-travel/db@0.118.5
  - @voyant-travel/hono@0.134.5

## 0.4.8

### Patch Changes

- Updated dependencies [3651ff7]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/db@0.118.4
  - @voyant-travel/hono@0.134.4
  - @voyant-travel/storage@0.113.6

## 0.4.7

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/core@0.134.0
  - @voyant-travel/db@0.118.3
  - @voyant-travel/hono@0.134.3
  - @voyant-travel/storage@0.113.5

## 0.4.6

### Patch Changes

- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
  - @voyant-travel/core@0.133.0
  - @voyant-travel/db@0.118.2
  - @voyant-travel/hono@0.134.2
  - @voyant-travel/storage@0.113.4

## 0.4.5

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/db@0.118.1
  - @voyant-travel/hono@0.134.1
  - @voyant-travel/storage@0.113.3

## 0.4.4

### Patch Changes

- Updated dependencies [f945310]
- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/db@0.118.0
  - @voyant-travel/core@0.131.0
  - @voyant-travel/hono@0.134.0
  - @voyant-travel/types@0.109.9
  - @voyant-travel/storage@0.113.2

## 0.4.3

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0

## 0.4.2

### Patch Changes

- Updated dependencies [d8a225c]
  - @voyant-travel/storage@0.113.0

## 0.4.1

### Patch Changes

- ff02608: Media library polish:

  - Rename the admin route from `/media-library` to `/media` (nav + default host base path).
  - Move folder creation from an inline sidebar form into a dialog.
  - Give uploaded objects a file extension in their storage key so the byte-serving route (which sends `X-Content-Type-Options: nosniff`) infers the correct `Content-Type` — raster images and PDFs now render instead of downloading as `application/octet-stream`.

## 0.4.0

### Minor Changes

- f0f51b4: Add the Media library admin navigation surface. The media deployment manifest
  now declares an `admin` block with a runtime factory, route, and navigation
  entry, and `@voyant-travel/media-react/admin` exposes
  `createSelectedMediaAdminExtension`, which contributes a "Media library"
  navigation item plus a route that renders the `<MediaLibrary>` browse surface.
  The operator navigation catalogue gains the `mediaLibrary` label in English and
  Romanian.

## 0.3.0

### Minor Changes

- 05aa1d5: Mount the media-library admin surface into the standard operator distribution.
  The media package now ships a deployment manifest and graph runtime factory that
  resolve the `"media"` object-storage provider through the storage runtime port
  and inject it into the media-library routes, and the standard operator
  distribution selects the module so `/v1/admin/media-library/*` is served.

### Patch Changes

- 05aa1d5: Declare the media module's `meta.agentTools` posture as `not-applicable`. The
  media library exposes an admin catalogue surface only; byte upload/serve
  mechanics and any future media Tools remain owned by `@voyant-travel/storage`,
  so the module carries no agent Tools. This satisfies the agent-tool-coverage
  check, which requires every Tool-less module to declare an explicit posture and
  rationale.
- 05aa1d5: Exclude test files from the build so `dist` no longer emits `*.test.*` outputs.

## 0.2.2

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0

## 0.2.1

### Patch Changes

- Updated dependencies [bcd7ad0]
  - @voyant-travel/storage@0.112.0

## 0.2.0

### Minor Changes

- 819bf6b: Scaffold the `@voyant-travel/media` library foundation: the `media_asset`,
  `media_folder`, `media_folder_member`, and `asset_usage` schema, a
  transport-agnostic service (content-checksum dedup, list/search, folder CRUD +
  membership, usage tracking with a delete-in-use guard), and the media library
  admin API routes under `/v1/admin/media-library/*`, all built on
  the existing `@voyant-travel/storage` byte seam. Backend/domain foundation only.
