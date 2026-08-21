# @voyant-travel/admin-api-client

## 0.2.0

### Minor Changes

- e3b63b5: Add the first-class Inquiry aggregate, lifecycle contracts and admin API for
  capturing, assigning, triaging, working, closing and reopening agency customer
  requests. Reserve `inquiry.created` for the Relationships-owned aggregate by
  removing Commerce's unused, conflicting event authority.
- 8311f44: Rename the materialized Inquiry target kind `option_unit` to `departure`, and stop
  losing a storefront submission when a target cannot be resolved.

  The kind named `option_unit` resolved an availability slot: its authority is the
  Availability slot reader, its link is the departure linkable, and legacy Booking
  Inquiries populate it from `departureId`. A caller passing a real option-unit id
  was refused, and because the refusal escaped the intake transaction the guarded
  public intake and the legacy Booking Inquiry adapter both answered 500 with the
  customer's inquiry rolled back.

  Target references are now resolved through their owning module before the write,
  and any the owner cannot resolve are retained on the Inquiry as
  `customFields.relationships.unresolvedTargets` instead of aborting the
  submission. `addInquiryTarget` no longer pre-checks the id's prefix — existence
  is the owning module's call through `validateTarget`, which the prefix guard
  duplicated while refusing ids the owner would have resolved.

- 0646a63: Add the durable, idempotent Inquiry-to-Proposal conversion coordinator, persistence, admin API, runtime-port requirement, and transactional conversion event.

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
