# Product Analytics

Voyant emits product-analytics events through a **vendor-neutral port**. This
repository owns the port and the events; it owns no analytics vendor, SDK, key,
host, or proxy, and it never will.

## Why a port

The framework is self-hostable. Hardcoding an analytics SDK into `catalog-react`
or `admin-react` would be wrong twice over: it forces a vendor on self-hosters,
and it puts a network client inside packages that are consumed in environments
with no egress at all. The host binds an implementation instead — Voyant Cloud
binds one, a self-hoster binds anything or nothing.

`AnalyticsPort` follows the existing `runtime-port.ts` / `runtime-contributor.ts`
pattern rather than inventing a mechanism, because that pattern already solves
exactly this shape for every other host-supplied capability.

```ts
interface AnalyticsPort {
  track(event: string, properties?: Record<string, unknown>): void
  identify(id: string, properties?: Record<string, unknown>): void
  group(type: string, key: string, properties?: Record<string, unknown>): void
}
```

Four properties are guaranteed by `@voyant-travel/core/analytics` rather than
left to each implementation:

1. **Unbound is a supported, silent state.** The default is `noopAnalytics`. A
   library consumer that binds nothing behaves exactly as it did before the port
   existed and pays nothing for it — no network call, no error, no measurable
   overhead.

   A *served deployment* is different, and voyant#4682 is what taught us the
   difference: because unbound was silent and nothing in the repository ever
   bound the port, every deployment ran with the whole catalogue going nowhere.
   A storefront checkout rejected 30 holds in eleven minutes, emitted
   `engine.hold.failed` 30 times into the no-op, and the operator found out when
   the customer wrote in (voyant#4655). So `@voyant-travel/runtime` binds
   `consoleAnalytics` — one JSON line per event on stdout — unless the project
   supplies its own `analytics.runtime`. A deployment that wants silence back
   binds `noopAnalytics` explicitly, which is a decision rather than a default.
2. **Fire-and-forget.** `track` returns `void`. There is nothing to await, so
   no caller can put an analytics round-trip on a booking's critical path.
3. **It cannot fail a booking.** `createSafeAnalytics` swallows a provider that
   throws, synchronously or from a returned promise. Measuring the funnel must
   never be able to break the funnel.
4. **No PII in the contract.** Callers pass identifiers and enumerations. Never
   a traveller name, an email address, a document number, or free text a buyer
   or a staff member typed. See `booking-pii.md`.

Where the binding is made:

| Surface | Bind through |
|---|---|
| Server | `requirePort(analyticsPort, { optional: true })`, resolved by the package's runtime contributor |
| Deployment | `createVoyantProjectServerEntry({ host: { runtimePorts: { "analytics.runtime": … } } })` — overrides the built-in stdout sink |
| Browser | `<VoyantReactProvider analytics={…}>`, or `<VoyantAnalyticsProvider>` for a surface with its own provider |

Exceptions travel the other seam. `Reporter` is `captureException` only, and a
rejected Hold is a typed outcome on a *successful* response — so a rejection is
invisible to it by construction, no matter which vendor is bound. That seam is
`host.reporter` (default `consoleReporter`, RFC voyant#1553); this one is where
a failing checkout shows up.

`useVoyantAnalytics()` never throws and never returns null: outside a provider
it returns the no-op, because a component that emits an event still renders
perfectly well without a vendor.

## `failure_reason`

The single most valuable property here, and the reason the effort exists.

It is a **closed enumeration**, never a message string, and it is derived from
the Booking Session contract's own rejection kinds — the values the API already
returned to the caller. One rule produces it, not a list of exceptions:

> When a rejection carries a nested `reason`, that reason **is** the failure
> reason; otherwise the rejection `kind` is.

`quote_unavailable` alone says only "it did not work"; `price_unavailable` says
which of five distinct things went wrong. The nested vocabularies do not
collide with each other or with the wrapping kinds, so the enumeration stays
flat and a breakdown needs no second dimension.

This is what turns "conversion dropped" into "13 of 39 product options are
unbookable because a descriptor withheld a step the commit required" — the
class of defect described in `booking-journey-architecture.md` and voyant#4113,
which went undetected for nine days. With this breakdown it is visible on day
one.

`packages/catalog/src/booking-engine/analytics.test.ts` asserts the enumeration
is **exactly** the set of failure outcomes `@voyant-travel/catalog-contracts`
can publish, in both directions. A rejection kind added to the contract fails
there rather than arriving in production as an `unknown` bucket nobody notices.

## The event catalogue

`verify:analytics-conformance` compares the block below against
`ANALYTICS_EVENT_CATALOGUE` in `packages/core/src/analytics-events.ts`, and
against the `track()` calls in tracked package sources. An event added,
renamed, or removed in code fails the build until this block says so — and an
event named here that nothing emits fails it too.

Each line is `event.name` followed by its properties.

<!-- analytics-events: ANALYTICS_EVENT_CATALOGUE -->

```text
engine.offer.previewed       target_id, target_type, priced, available
engine.session.created       booking_session_id, scope, market, channel
engine.quote.requested       booking_session_id
engine.quote.succeeded       booking_session_id, duration_ms, total, currency
engine.quote.failed          booking_session_id, failure_reason
engine.quote.expired         booking_session_id, seconds_since_issue
engine.hold.requested        booking_session_id
engine.hold.succeeded        booking_session_id, duration_ms
engine.hold.failed           booking_session_id, failure_reason
engine.commit.attempted      booking_session_id
engine.commit.succeeded      booking_session_id, booking_id, duration_ms
engine.commit.failed         booking_session_id, failure_reason, missing_requirements
engine.session.abandoned     booking_session_id, last_step, age_seconds
engine.journey.started       entry_referrer, channel, target_type
engine.step.viewed           booking_session_id, step, step_index, requirement_count
engine.step.completed        booking_session_id, step, duration_ms, retries
engine.field.errored         booking_session_id, step, field, error_code
admin.nav.viewed             route, module
admin.resource.created       resource_type
admin.resource.updated       resource_type
admin.resource.deleted       resource_type
admin.action.failed          action, error_code
admin.search.performed       result_count
admin.extension.opened       extension_id
portal.session.started       booking_count
portal.booking.viewed        booking_id
portal.document.downloaded   document_type
```

### Booking engine, server

Emitted by `packages/catalog/src/booking-engine/analytics.ts`, a decorator over
`BookingSessionModule` rather than `track()` calls scattered through the
2,500-line service. Every lifecycle method already answers one discriminated
`bookingSessionOutcomeV1`, so the outcome-to-event mapping is total and
reviewable in one place, and instrumentation cannot change behaviour: the
decorator returns the service's own value untouched.

`missing_requirements[]` on `engine.commit.failed` carries the same
machine-readable list the API returns to the caller — the requirement keys from
`selection_incomplete.unsatisfied[]`.

**Commit resolves three ways, not two.** A Commit that suspends waiting for a
payment guarantee or a supplier (`payment_required`, `supplier_pending`,
`component_commit_pending`) emits neither `succeeded` nor `failed`: it has not
failed, and reporting it either way would misstate the funnel. A buyer who
never returns arrives as `engine.session.abandoned`, which is what actually
happened.

`last_step` and `seconds_since_issue` are best-effort and in-process. They come
from a bounded LRU of Sessions the emitting process has observed, because a
Session's furthest step and its live Quote's issue time are not on the record
the outcome carries. Paying a database read to sharpen them would put analytics
on the booking path, which the port forbids.

### Booking engine, client

`engine.field.errored` is the stuck-point signal and the one worth the most: it
names the specific required field blocking travellers, per step. `field` is a
requirement **key** (`traveler.0.passportNumber`), never the value entered
against it — the hook reads `selection_incomplete.unsatisfied[]`, which carries
keys and reasons only, and so has no access to entered values by construction.

Two of the four client events are automatic:

- `engine.journey.started` fires from `useBookingSession().create()`, **before**
  the request. A Create that never answers is still a journey somebody started.
- `engine.field.errored` fires from `useBookingQuote` and
  `useCommitBookingSession` whenever the server answers `selection_incomplete`,
  with no host instrumentation at all.

`engine.step.viewed` / `engine.step.completed` are host-driven through
`useBookingJourneyAnalytics()`, because the step model belongs to the host: the
Booking Requirements descriptor decides which steps exist. `duration_ms` and
`retries` are derived by the hook from the `viewed` calls that preceded a
`completed`, not supplied — a host counting its own retries would count them
differently per host.

`entry_referrer` is reduced to the referrer's **origin** before it is emitted. A
full referrer URL carries a query string, and a query string carries whatever
the previous page put in it.

### Admin

Derived from the operation descriptor, not annotated per call site, because
every admin read and write already goes through one:

- `resource_type` is the leading dotted segments of the operation id
  (`finance.invoices.issue` → `finance.invoices`).
- The write event follows the method: POST → created, PATCH/PUT → updated,
  DELETE → deleted. A POST action route (`bookings.cancel`) is counted as a
  creation; the alternative is a per-operation annotation list that would be
  wrong the first time someone forgot to extend it, and `resource_type` keeps
  the two separable in a breakdown anyway.
- `error_code` on `admin.action.failed` is the server code or `http_<status>`.
  Never the message: a message is locale-dependent, changes with copy edits,
  and turns a breakdown into a text search.
- `admin.search.performed` fires from `useAdminQuery` when an operation's input
  carries a non-empty `search`/`q`/`query`. **Only the count is emitted, never
  the query text** — a staff search box is regularly typed a customer name into.
  Zero-result searches are a direct product-gap signal and do not need the words
  to say so.
- `route` on `admin.nav.viewed` is the router's matched **route pattern**
  (`/bookings/$bookingId`), never the resolved URL. A resolved URL would put a
  booking id into an analytics property and shatter the page dimension into one
  bucket per record.

### Customer portal

`portal.session.started` and `portal.booking.viewed` are automatic — in the
portal, the reads are the visits — and are keyed on data arriving rather than
on mount, so a load that never resolves is not counted as a healthy visit.
`portal.document.downloaded` is a callback on `useCustomerPortalAnalytics()`,
because the package ships no download action: a document is a `fileUrl` the
host renders as a link.

**`portal.payment.made` and `portal.support.contacted` are deliberately absent.**
The portal serves profile, companions, documents and bookings; it has no payment
leg and no support-contact leg to emit them from. They are undeclared rather
than stubbed, because an event with no emitter is a line in a dashboard that
silently reads zero forever. They belong here the day those surfaces exist.

## Out of scope for this repository

All of the following belong to the cloud platform:

- Any analytics vendor dependency, SDK, key, host, or proxy
- Session replay, masking configuration, and PII policy for hosted surfaces
- Dashboards, funnels, and alerting
- Tenant/organization grouping and identity stitching across hosted surfaces
- CSP changes for the managed admin

`verify:analytics-conformance` is what keeps the first line true from this side:
nothing in `packages/` may import an analytics vendor, and no `track()` call may
name an event this document does not.
