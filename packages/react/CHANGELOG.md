# @voyant-travel/react

## 0.106.2

### Patch Changes

- Updated dependencies [020de35]
  - @voyant-travel/core@0.142.0

## 0.106.1

### Patch Changes

- Updated dependencies [c805276]
- Updated dependencies [c805276]
- Updated dependencies [36f3085]
  - @voyant-travel/core@0.141.0

## 0.106.0

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
  - @voyant-travel/core@0.140.0

## 0.105.0

### Minor Changes

- 1be6b76: A card dispute has somewhere to land: `payment_disputes` in finance, bound to
  the payment session it contests and reachable from the booking.

  There was no card-dispute model. The `disputed` value that existed is a
  **supplier-invoice** status — an accounts-payable state for a bill the operator
  is contesting — and is unrelated to a customer charging back a payment. So when a
  traveller disputed a card payment the runtime had nowhere to record it: the
  booking kept reading as paid, the money was gone or frozen, and the only trace
  lived in whatever processor console the operator happened to check.

  A chargeback is a generic commerce event, not a property of any one processor.
  Every card processor produces them with the same shape, so the record belongs in
  the framework and nothing in it names a processor — `provider`,
  `processor_reference` and `reason_code` are opaque strings stored and handed back
  verbatim.

  **The model.** `payment_disputes` carries the contested amount and currency
  (which may be partial), the lifecycle status, `opened_at` and the processor's
  `respond_by` deadline where it supplies one, an opaque processor reference,
  `resolved_at`, and `evidence_submitted_at`. `PaymentDisputeStatus` is the
  framework's vocabulary — `opened`, `under_review`, `won`, `lost`, `withdrawn` —
  and an adapter maps its own stage names onto it. The last three are terminal and
  each names the resolution; there is no separate outcome column, because one
  could only ever disagree with the status.

  **Terminal is absorbing.** A processor that contests a payment again issues a new
  dispute rather than reviving a resolved one, so a replayed or out-of-order
  callback can never walk a resolution backwards. The ingest path tolerates such a
  report rather than failing — a webhook that 500s is retried forever — while the
  deliberate `PATCH` rejects an illegal transition with `409`.

  **A second dispute does not overwrite the first.** The record is idempotent on
  `(payment_session_id, processor_reference)`: a repeat report advances the dispute
  it already made, a different reference opens a second row. A hand-entered dispute
  with no reference always opens a new record, which is the safe default — two rows
  are recoverable, a silently overwritten dispute is not. The unresolved contested
  total is capped at the payment it contests.

  **The booking can tell the truth.** `GET /v1/admin/finance/bookings/{bookingId}/disputes`
  answers what payments and sessions cannot: a contested payment still reads
  `paid`, so `hasOpenDispute`, the per-currency contested total, and the soonest
  `respondBy` are how a caller distinguishes a cleanly paid booking from one whose
  money is being taken back. Plus `GET`/`POST /v1/admin/finance/payment-disputes`
  and `GET`/`PATCH .../{id}`.

  **The callback contract can deliver one.** `PaymentCallbackEvent` gains an
  optional `dispute` alongside `nextState` rather than inside it: a chargeback does
  not move the payment's own lifecycle — the session stays `paid`, which is exactly
  the problem — so the event reports the session's current state and puts what
  changed in `dispute`. The conformance kit validates the signal's shape and folds
  it into the duplicate-callback identity, so an adapter cannot vary a dispute
  across a replay.

  **An agent can record one too.** `record_payment_dispute` fronts the dispute
  endpoints for an agent reconciling a processor console. It declares its
  `adminWrites` rather than leaning on the name match, because `/finance/payments`
  and `/finance/invoices/{id}/payments` share the trailing noun `payment` and the
  inference would have reported _recording a payment_ as covered by a Tool that
  only records a dispute against one.

  **The banner degrades, it does not crash.** `BookingDisputeBanner` renders on the
  booking detail page whether or not the host asked for it, so it reads the finance
  context through the new `useOptionalVoyantReactContext`: a host that has not
  mounted `VoyantFinanceProvider` gets no banner rather than a crashed page. Every
  other finance hook stays strict — they are the point of the screen they are on.

  **Deliberately not in scope.** Payouts acquire no model here — money moving from
  a processor to the operator's bank is not the booking ledger's concern. Evidence
  assembly and submission stay behind the adapter port, where they belong; the
  framework records only that evidence was submitted and when, without knowing what
  was in it.

## 0.104.2

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.

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

## 0.3.1

## 0.3.0

### Minor Changes

- e57725d: Flatten frontend provider wiring around a shared `@voyant-travel/react` config provider so module react packages can share one app-level Voyant context.
