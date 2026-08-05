---
"@voyant-travel/core": minor
"@voyant-travel/react": minor
"@voyant-travel/catalog": minor
"@voyant-travel/catalog-react": minor
"@voyant-travel/admin": minor
"@voyant-travel/admin-react": minor
"@voyant-travel/storefront-react": minor
---

Product-analytics events from the booking engine, admin, and customer portal,
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
*when a rejection carries a nested `reason`, that reason is the failure reason* —
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
