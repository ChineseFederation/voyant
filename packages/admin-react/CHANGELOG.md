# @voyant-travel/admin-react

## 0.136.0

### Minor Changes

- 7b8ef95: Product-analytics events from the booking engine, admin, and customer portal,
  emitted through a vendor-neutral port.

  None of these surfaces emitted any product-analytics signal, so a host could not
  measure where a traveller abandons a booking journey or where staff get stuck in
  the admin. This adds the **vendor-neutral half**: a port, the domain events that
  travel through it, and a conformance check binding the taxonomy to the code. It
  adds no analytics vendor, SDK, key, host, or proxy, and a checker now enforces
  that it never will.

  **`AnalyticsPort`** (`@voyant-travel/core/analytics`) is `track` / `identify` /
  `group`, bound by the host through the existing runtime-contributor mechanism on
  the server and through `<VoyantReactProvider analytics={…}>` (or
  `<VoyantAnalyticsProvider>`) in the browser. Four properties are guaranteed by
  the framework rather than left to each implementation:

  - **Unbound is a supported, silent state.** The default is `noopAnalytics`; a
    deployment that binds nothing behaves exactly as before and pays nothing.
  - **Fire-and-forget.** `track` returns `void`, so nothing can put an analytics
    round-trip on a booking's critical path.
  - **It cannot fail a booking.** `createSafeAnalytics` swallows a provider that
    throws, synchronously or from a returned promise.
  - **No PII in the contract.** Identifiers and enumerations only. `field` carries
    a requirement key, never the value entered against it; `entry_referrer` is
    reduced to an origin; an admin `route` is the matched route pattern, never a
    resolved URL; a search emits its result count and never the query text.

  **Booking engine, server.** `withBookingSessionAnalytics` decorates
  `BookingSessionModule` rather than scattering `track()` through the 2,500-line
  service: every lifecycle method already answers one discriminated
  `bookingSessionOutcomeV1`, so the outcome-to-event mapping is total and
  reviewable in one place, and the decorator returns the service's own value
  untouched.

  `failure_reason` is derived from the contract's own rejection kinds by one rule —
  _when a rejection carries a nested `reason`, that reason is the failure reason_ —
  so it is a closed enumeration rather than a message string. A test asserts the
  enumeration is **exactly** the set of failure outcomes `catalog-contracts` can
  publish, in both directions; a new rejection kind fails there rather than
  arriving in production as an `unknown` bucket. `engine.commit.failed` carries
  `missing_requirements[]` from `selection_incomplete.unsatisfied[]`. A Commit that
  suspends waiting for a payment guarantee or a supplier emits neither `succeeded`
  nor `failed` — it has not failed, and a buyer who never returns arrives as
  `engine.session.abandoned`.

  **Booking engine, client.** `engine.journey.started` fires from
  `useBookingSession().create()`, and `engine.field.errored` — the stuck-point
  signal — fires from `useBookingQuote` and `useCommitBookingSession` whenever the
  server answers `selection_incomplete`, with no host instrumentation at all.
  `engine.step.viewed` / `.completed` are host-driven through
  `useBookingJourneyAnalytics()`, because the Booking Requirements descriptor
  decides which steps exist; the hook derives `duration_ms` and `retries` itself.

  **Admin** events are derived from the operation descriptor in `useAdminQuery` /
  `useAdminMutation`, so every packaged admin read and write is covered without
  per-page work. `admin.nav.viewed` and `admin.extension.opened` come from the
  shell.

  **Customer portal**: `portal.session.started` and `portal.booking.viewed` are
  automatic; `portal.document.downloaded` is a callback, because the package ships
  no download action. `portal.payment.made` and `portal.support.contacted` are
  **deliberately undeclared** — the portal has no payment or support-contact leg to
  emit them from, and an event with no emitter is a dashboard line that reads zero
  forever.

  **Conformance.** `verify:analytics-conformance` is declarative
  (`scripts/checks/analytics/event-catalogue.json`) and asserts three directions
  plus vendor neutrality: the declared catalogue matches
  `docs/architecture/analytics-events.md`, every declared event is emitted by some
  tracked source, no `track()` call names an undeclared event or property, and no
  tracked manifest or emitter imports an analytics vendor. It reads the tracked
  tree via `trackedFilesIn`, and `verify:tracked-tree-scan` holds both halves of
  that line.

  Also removes the dead `POSTHOG_API_KEY` / `POSTHOG_HOST` passthrough from
  `turbo.json`, left over from a retired stack that nothing in this repository
  read.

### Patch Changes

- Updated dependencies [7b8ef95]
  - @voyant-travel/react@0.106.0

## 0.135.1

### Patch Changes

- Updated dependencies [3f5ea82]
  - @voyant-travel/admin-contracts@0.107.0

## 0.135.0

### Minor Changes

- f69e880: Make commercial commitment the sole Booking creation boundary for Booking
  Platform v1.

  Bookings now use only `confirmed`, `in_progress`, `completed`, and `cancelled`
  states. Quote, Hold, supplier-operation, and payment lifecycles remain owned by
  their respective domains. The beta-data migration preserves evidenced
  commitments, fails closed on ambiguous external effects, restores capacity for
  abandoned attempts, and removes the obsolete Booking-backed session state.

### Patch Changes

- Updated dependencies [f69e880]
  - @voyant-travel/admin-contracts@0.106.0

## 0.134.1

### Patch Changes

- Updated dependencies [f7adc5b]
  - @voyant-travel/admin-contracts@0.105.0

## 0.134.0

## 0.133.0

## 0.132.0

### Minor Changes

- 0f7888e: Fold `@voyant-travel/admin-client` into `@voyant-travel/admin-react`.

  The client was a single-export package whose only consumer was `admin-react`,
  which already re-exported all of it — so the split cost a package and a
  published version line without giving anyone a smaller surface to depend on.

  Its modules now live at `@voyant-travel/admin-react/client`, and the root export
  is unchanged: everything previously reachable from `@voyant-travel/admin-react`
  still is, including the `@voyant-travel/admin-contracts` surface the client
  re-exported.

  **`@voyant-travel/admin-client` will no longer be published.** Anything importing
  it should import `@voyant-travel/admin-react` (same surface) or
  `@voyant-travel/admin-react/client` for just the HTTP client and auth.

### Patch Changes

- Updated dependencies [0f7888e]
  - @voyant-travel/admin-contracts@0.104.19

## 0.131.1

### Patch Changes

- @voyant-travel/admin-client@0.131.1

## 0.131.0

### Patch Changes

- @voyant-travel/admin-client@0.131.0

## 0.130.0

### Patch Changes

- @voyant-travel/admin-client@0.130.0

## 0.129.2

### Patch Changes

- @voyant-travel/admin-client@0.129.2

## 0.129.1

### Patch Changes

- @voyant-travel/admin-client@0.129.1

## 0.129.0

### Patch Changes

- @voyant-travel/admin-client@0.129.0

## 0.128.3

### Patch Changes

- @voyant-travel/admin-client@0.128.3

## 0.128.2

### Patch Changes

- @voyant-travel/admin-client@0.128.2

## 0.128.1

### Patch Changes

- @voyant-travel/admin-client@0.128.1

## 0.128.0

### Patch Changes

- @voyant-travel/admin-client@0.128.0

## 0.127.0

### Patch Changes

- @voyant-travel/admin-client@0.127.0

## 0.126.2

### Patch Changes

- @voyant-travel/admin-client@0.126.2

## 0.126.1

### Patch Changes

- @voyant-travel/admin-client@0.126.1

## 0.126.0

### Patch Changes

- @voyant-travel/admin-client@0.126.0

## 0.125.0

### Patch Changes

- @voyant-travel/admin-client@0.125.0

## 0.124.0

### Patch Changes

- @voyant-travel/admin-client@0.124.0

## 0.123.3

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
  - @voyant-travel/admin-client@0.123.3

## 0.123.2

### Patch Changes

- @voyant-travel/admin-client@0.123.2

## 0.123.1

### Patch Changes

- @voyant-travel/admin-client@0.123.1

## 0.123.0

### Patch Changes

- @voyant-travel/admin-client@0.123.0

## 0.122.0

### Minor Changes

- 490d132: Package reusable admin host destinations, dashboard and extension composition,
  current-user bindings, and realtime invalidation presentation.

### Patch Changes

- @voyant-travel/admin-client@0.122.0

## 0.121.0

### Patch Changes

- @voyant-travel/admin-client@0.121.0

## 0.120.0

### Patch Changes

- @voyant-travel/admin-client@0.120.0

## 0.119.0

### Patch Changes

- @voyant-travel/admin-client@0.119.0

## 0.118.0

### Minor Changes

- 8fca06e: Add `@voyant-travel/admin-react/user` — a reusable current-user context
  (`UserProvider` / `useUser`) for the managed-profile admin host (Phase 2 of
  voyant#3044).

  The provider reads the current user via React Query and takes `getCurrentUser`
  injected (typically the deployment's auth-runtime port), so it carries no
  auth-client dependency and is shared by managed and self-host admin hosts. It
  lifts the operator starter's local `UserProvider`/`useUser` into a package; the
  starter's provider becomes a thin adopter that wires its auth runtime.

### Patch Changes

- @voyant-travel/admin-client@0.118.0

## 0.117.0

### Patch Changes

- @voyant-travel/admin-client@0.117.0

## 0.116.0

### Patch Changes

- @voyant-travel/admin-client@0.116.0

## 0.115.4

### Patch Changes

- @voyant-travel/admin-client@0.115.4

## 0.115.3

### Patch Changes

- @voyant-travel/admin-client@0.115.3

## 0.115.2

### Patch Changes

- @voyant-travel/admin-client@0.115.2

## 0.115.1

### Patch Changes

- @voyant-travel/admin-client@0.115.1

## 0.115.0

### Patch Changes

- @voyant-travel/admin-client@0.115.0

## 0.114.0

### Patch Changes

- @voyant-travel/admin-client@0.114.0

## 0.113.0

### Patch Changes

- @voyant-travel/admin-client@0.113.0

## 0.112.0

### Patch Changes

- @voyant-travel/admin-client@0.112.0

## 0.111.5

### Patch Changes

- @voyant-travel/admin-client@0.111.5

## 0.111.4

### Patch Changes

- @voyant-travel/admin-client@0.111.4

## 0.111.3

### Patch Changes

- @voyant-travel/admin-client@0.111.3

## 0.111.2

### Patch Changes

- eef1a00: Republish notification and UI consumer packages so stale beta artifacts no longer reference legacy notification package specifiers.
- Updated dependencies [eef1a00]
  - @voyant-travel/admin-client@0.111.2

## 0.111.1

### Patch Changes

- @voyant-travel/admin-client@0.111.1

## 0.111.0

### Patch Changes

- @voyant-travel/admin-client@0.111.0

## 0.110.0

### Patch Changes

- @voyant-travel/admin-client@0.110.0

## 0.109.0

### Patch Changes

- @voyant-travel/admin-client@0.109.0

## 0.108.0

### Patch Changes

- @voyant-travel/admin-client@0.108.0

## 0.107.0

### Patch Changes

- @voyant-travel/admin-client@0.107.0

## 0.106.0

### Patch Changes

- @voyant-travel/admin-client@0.106.0

## 0.105.2

### Patch Changes

- @voyant-travel/admin-client@0.105.2

## 0.105.1

### Patch Changes

- @voyant-travel/admin-client@0.105.1

## 0.105.0

### Patch Changes

- @voyant-travel/admin-client@0.105.0

## 0.104.2

### Patch Changes

- @voyant-travel/admin-client@0.104.2

## 0.104.1

### Patch Changes

- @voyant-travel/admin-client@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/admin-client@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/admin-client@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/admin-client@0.102.0

## 0.101.2

### Patch Changes

- @voyant-travel/admin-client@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/admin-client@0.101.1

## 0.101.0

### Patch Changes

- Updated dependencies [8e7b56a]
  - @voyant-travel/admin-client@0.101.0

## 0.100.0

### Minor Changes

- 061bef2: Expand the Admin API SDK (#1411).

  - **admin-contracts (5.2):** add operation descriptors for CRM (people +
    organizations CRUD, plus the PII-gated person-document reveal), legal
    (contracts CRUD + issue/void, policies CRUD + cancellation evaluation), and
    products (read surface: list/get). Inputs derive from the canonical
    `@voyant-travel/crm-contracts` / `@voyant-travel/legal-contracts` route schemas; outputs
    are loose client-facing projections. Scopes follow the path+method convention
    `requireActor` enforces (GET→`:read`, POST/PATCH→`:write`, DELETE→`:delete`).
  - **admin-client:** typed `crm`, `legal`, and `products` namespaces over the new
    descriptors.
  - **admin-react (5.3):** new package — a generic React Query adapter over the
    admin client. `AdminClientProvider`/`useAdminClient`, plus descriptor-driven
    `useAdminQuery`, `useAdminMutation`, and `useCapabilities`. Works for any
    operation descriptor (current or future) rather than bespoke per-screen hooks.

### Patch Changes

- Updated dependencies [061bef2]
  - @voyant-travel/admin-client@0.100.0
