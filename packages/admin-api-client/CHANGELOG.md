# @voyant-travel/admin-api-client

## 0.1.0

### Minor Changes

- d3288fb: Publish the generated API clients.

  `@voyant-travel/public-api-client` is typed from the whole composed public
  surface — 138 operations — and the credential picks the type:
  `createPublicApiClient({ publishableKey })` cannot see a secret-only operation,
  so calling one is a compile error rather than a runtime 403.
  `@voyant-travel/admin-api-client` exposes one typed module per admin document
  and refuses a publishable key at construction.

  The public-API key prefix table moves from `@voyant-travel/core` to
  `@voyant-travel/graph-contracts`, which has no dependencies of its own, so a
  client can classify a token without the framework kernel reaching npm. `core`
  re-exports it and every in-repo import is unchanged.

  The hand-written operation layer that used to ship inside
  `@voyant-travel/public-api-client` has moved to `@voyant-travel/public-api-react`.
  It reached into `bookings`, `finance` and `public-api` for runtime schemas,
  which a published package cannot do.

  These stay on 0.x deliberately; the move to 1.x is a coordinated release across
  every package, not a per-package decision.

### Patch Changes

- Updated dependencies [d3288fb]
  - @voyant-travel/graph-contracts@0.8.0
