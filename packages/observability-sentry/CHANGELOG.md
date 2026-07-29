# @voyant-travel/observability-sentry

## 0.21.0

### Patch Changes

- Updated dependencies [6d0b4b4]
- Updated dependencies [7496159]
  - @voyant-travel/hono@0.135.0

## 0.20.0

### Patch Changes

- Updated dependencies [f2c9404]
  - @voyant-travel/hono@0.134.0

## 0.19.0

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0

## 0.18.0

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0

## 0.17.0

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/hono@0.131.0

## 0.16.0

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/hono@0.130.0

## 0.15.0

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0

## 0.14.0

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/hono@0.128.0

## 0.13.0

### Patch Changes

- Updated dependencies [7e9f77a]
  - @voyant-travel/hono@0.127.0

## 0.12.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
  - @voyant-travel/hono@0.126.3

## 0.12.0

### Patch Changes

- Updated dependencies [4d0eeed]
  - @voyant-travel/hono@0.126.0

## 0.11.0

### Patch Changes

- Updated dependencies [d771be3]
  - @voyant-travel/hono@0.125.0

## 0.10.0

### Patch Changes

- Updated dependencies [ca90eb5]
  - @voyant-travel/hono@0.124.0

## 0.9.0

### Patch Changes

- Updated dependencies [953e418]
  - @voyant-travel/hono@0.123.0

## 0.8.0

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/hono@0.122.0

## 0.7.0

### Patch Changes

- Updated dependencies [c9a356f]
- Updated dependencies [6474f42]
- Updated dependencies [5786f63]
  - @voyant-travel/hono@0.121.0

## 0.6.0

### Patch Changes

- Updated dependencies [1cb9cba]
- Updated dependencies [131ff9b]
  - @voyant-travel/hono@0.120.0

## 0.5.0

### Patch Changes

- Updated dependencies [86fbb05]
  - @voyant-travel/hono@0.119.0

## 0.4.0

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/hono@0.118.0

## 0.3.0

### Patch Changes

- Updated dependencies [7c5ee80]
  - @voyant-travel/hono@0.117.0

## 0.2.1

### Patch Changes

- 12a1eb2: Expose client-safe subpaths for validation schemas, linkable metadata, template authoring metadata, finance payment-policy primitives, and Hono reporter utilities. Move browser-facing React/operator imports off mixed runtime barrels so client bundles do not pull Hono request context or other server-only runtime code.
- Updated dependencies [12a1eb2]
  - @voyant-travel/hono@0.116.2

## 0.2.0

### Patch Changes

- Updated dependencies [684b321]
- Updated dependencies [2542715]
  - @voyant-travel/hono@0.116.0

## 0.1.0

### Minor Changes

- 479c191: Add `@voyant-travel/observability-sentry`: a first-party Sentry adapter for the observability `Reporter` seam (RFC voyant#1553). `sentryReporter(sentry)` forwards normalized error events to an already-initialized Sentry client — tagging each with the user-facing `requestId` and flushing via the framework's `waitUntil` — without this package depending on any Sentry SDK (it binds to a structural `SentryLike` interface).

### Patch Changes

- Updated dependencies [04b257c]
- Updated dependencies [78c15fa]
  - @voyant-travel/hono@0.115.0
