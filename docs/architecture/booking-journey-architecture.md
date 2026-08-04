# Booking journey architecture

## Status

Active Booking Platform v1 architecture. The product is currently beta, so v1
is the first stable contract rather than a compatibility layer over the beta
draft APIs.

The commitment semantics are normative in
[ADR 0019](../adr/0019-booking-v1-commitment-point-policies.md). This document
describes the concrete journey and ownership boundaries.

## Domain boundary

A Booking is a commercial commitment. A browsing, configuration, pricing,
availability, payment-establishment, or supplier-preflight attempt is not a
Booking.

Before Commit, the lifecycle is:

1. **Booking Session** — resumable, access-controlled selection state.
2. **Quote** — immutable pricing for one Session revision with a short expiry.
3. **Hold** — temporary capacity attached to one Quote.
4. **Payment Session / Guarantee** — Finance-owned readiness when required.
5. **Supplier Operation** — durable sourced-inventory effect and reconciliation.
6. **Commit** — the single transition that may create a Booking.

After Commit, Booking, Booking Item, Allocation, Finance, supplier operation,
fulfillment, amendment, and audit records own their respective state. Payment
or Hold state never becomes Booking status.

## Booking Requirements

**Booking Requirements** is the server's description of what a booking of one
target requires: which journey steps and sub-steps apply, the pax bands and
their cross-band occupancy rules, and the per-traveler and lead-only fields that
must be answered.

It is server-owned. A host renders it; a host never invents one. A per-vertical
step list built in the client is a second source of truth about what a booking
needs, and the first time a vertical adds a required field the host collects the
old set and commits an incomplete booking.

Three properties make that guarantee hold rather than merely state it:

1. **One derivation.** A vertical's owned booking handler exposes
   `computeRequirements`, and its own `computeQuote` reads that same derivation.
   What a host renders and what a Commit will validate against cannot be two
   code paths. Two of them is precisely the defect behind
   [#4113](https://github.com/voyant-travel/voyant/issues/4113), where a
   descriptor withheld a step the commit required and 13 of 39 product options
   were unbookable for nine days.
2. **It does not depend on price.** Requirements are published on the Booking
   Session, on its Quote, and on the non-binding Offer Preview — and they
   survive an unavailable quote, so a sold-out or unpriced target still renders
   a correct wizard.
3. **It is enforced, not advertised.** The selection is validated against the
   published requirements at quote time and again at Commit, and a Quote carries
   a `requirementsFingerprint` the Commit re-derives and compares. An
   under-collecting host fails loudly with `selection_incomplete` and a
   machine-readable list of what is missing, rather than quietly committing an
   incomplete booking.

Requirements are derived per target **and scope** — labels are locale-derived
and prices market-derived — so a Booking Session fixes its scope at creation and
never changes it.

A requirement the Session cannot carry is a contract error, not a runtime
surprise: the selection projection keeps a deliberately narrow traveler shape,
so a descriptor marking anything outside it required would publish a demand the
buyer can never satisfy. The conformance suite rejects that at development time.

## Canonical API

Catalog owns the Booking Session API on both staff and storefront surfaces, and
the staff-only order, supplier-operation, and maintenance legs alongside it.
This is the complete mounted surface: `verify:route-conformance` compares the
block below against `catalogBookingRoutePaths` in
`packages/catalog/src/booking-engine/operator-routes.ts`, so a route added,
renamed, or removed in code fails the build until this block says so.

<!-- mounted-routes: catalogBookingRoutePaths -->

```text
POST   /v1/{admin,public}/catalog/booking-sessions
GET    /v1/{admin,public}/catalog/booking-sessions/{sessionId}
PATCH  /v1/{admin,public}/catalog/booking-sessions/{sessionId}
POST   /v1/{admin,public}/catalog/booking-sessions/{sessionId}/adopt
POST   /v1/{admin,public}/catalog/booking-sessions/{sessionId}/renew
POST   /v1/{admin,public}/catalog/booking-sessions/{sessionId}/quote
POST   /v1/{admin,public}/catalog/booking-sessions/{sessionId}/hold
POST   /v1/{admin,public}/catalog/booking-sessions/{sessionId}/commit
POST   /v1/{admin,public}/catalog/booking-sessions/{sessionId}/abandon
POST   /v1/{admin,public}/catalog/offers/preview
GET    /v1/{admin,public}/catalog/slots
POST   /v1/admin/catalog/booking-sessions/maintenance/expire
POST   /v1/admin/catalog/booking-sessions/maintenance/purge
GET    /v1/admin/catalog/supplier-operations
GET    /v1/admin/catalog/supplier-operations/{operationId}
POST   /v1/admin/catalog/supplier-operations/{operationId}/reconcile
POST   /v1/admin/catalog/supplier-operations/{operationId}/resolve
GET    /v1/admin/catalog/orders
GET    /v1/admin/catalog/orders/{id}
POST   /v1/admin/catalog/orders/{id}/cancel
GET    /v1/admin/bookings/{id}/catalog-snapshot
```

`/adopt` binds an anonymous Session to an authenticated customer; `/renew`
extends a live Session's capability. `/offers/preview` is a non-binding price
read that creates no Session, Quote, or Hold, so a detail page can show a price
without entering the lifecycle.

There is no parallel `/catalog/drafts`, `/catalog/quote`, or
`/catalog/holds/place` bootstrap lifecycle. Tools and SDKs compose the same
Booking Session operations rather than bypassing them.

Public clients use a storefront identity and channel plus one of:

- authenticated customer ownership; or
- a scoped, hashed Booking Session capability for an anonymous journey.

Staff access is admitted by the Booking Session action policies and scopes.
Both access paths execute the same service and persistence lifecycle.

## Persistence ownership

Catalog owns:

- `booking_sessions`
- `booking_session_quotes`
- `booking_session_holds`
- `booking_session_commits`
- `booking_session_operations`
- `booking_session_audit_events`
- `supplier_operations`
- immutable `booking_session_quotes` and `booking_catalog_snapshot` records used by
  quote computation and committed-order evidence

Finance owns Booking settlement, payment sessions, guarantees, schedules,
invoices, tax lines, and the durable Booking create command. Bookings owns the
committed Booking aggregate. Availability owns capacity rows and pre-commit
capacity locks. Relationships owns buyer identity.

Cross-package writes occur inside one root PostgreSQL transaction for owned
inventory. The operator runtime is Node/Docker and requires a pooled
transaction-capable PostgreSQL adapter for Booking v1 writes. Storefronts and
federated callers may run elsewhere, but call the operator API rather than
owning the transaction.

## Session invariants

- A Session has exactly one target: product, sourced catalog item, owned entity,
  or accepted trip snapshot.
- Selection is server-normalized. Public callers cannot set Booking status,
  prices, internal relationship ids, Booking numbers, or operator-only fields.
- Each mutation carries an idempotency key and request fingerprint.
- Quote is bound to the exact Session revision.
- Hold is bound to that Quote and revision.
- Commit consumes Session, Quote, and Hold exactly once.
- An idempotent Commit retry returns the original durable result.
- Expiry and abandonment release owned capacity; supplier uncertainty is
  represented by Supplier Operation state and reconciled explicitly.
- Terminal Session personal data is purged while audit evidence remains.

## Commit strategies

Owned inventory commits under one database transaction. Finance derives the
Booking command from the server-held Session, Quote, Hold, buyer, and policy
state. The command creates a confirmed Booking; payment readiness remains in
Finance records.

Sourced inventory is supplier-first by default. A durable Supplier Operation
records the command before dispatch. Success is materialized into a Booking;
timeout or uncertain response remains `supplier_in_doubt` and requires
reconciliation. A vertical may use an explicitly documented operator-backed
risk policy, but may not silently treat an uncertain supplier effect as a
Booking.

Accepted bespoke Proposals enter through an immutable Trip Snapshot and the
same Booking Session lifecycle. Proposal is the bespoke sales concept; it does
not become a second Booking implementation.

## Beta data cutover

The v1 cutover migration classifies every beta `booking_drafts` row inside one
PostgreSQL transaction:

- verified consumed rows become redacted Session audit tombstones retaining the
  genuine Booking reference;
- active operator-owned rows become canonical active Sessions and require a
  fresh Quote/Hold;
- expired, anonymous, and otherwise unresumable rows become redacted expiry
  tombstones;
- live owned holds are released and capacity is restored;
- missing Bookings, converted inventory without a consumed draft, and live
  sourced supplier holds fail closed for manual reconciliation.

Only after classification and audit insertion does the migration drop
`booking_drafts`. The old routes, capability cookie, runtime source provider,
and draft reaper are removed in the same release, preventing new beta rows from
appearing after cutover.

The committed-Booking cutover then classifies legacy `draft`, `on_hold`,
`awaiting_payment`, and `expired` Booking rows. First-acceptance timestamps,
settled Finance state, Legal records, Fulfillments, redemptions, Amendments, and
conclusive supplier evidence preserve a genuine commitment. `awaiting_payment`
becomes `confirmed`; an expired genuine commitment becomes `cancelled` history.
Unresolved supplier or provider-payment effects fail closed for explicit
reconciliation. Only evidence-free attempts are deleted, after held/confirmed
Allocations restore their Slot capacity in stable lock order. The same
transaction removes `booking_session_states`, contracts Booking and Booking
Item enums, drops the beta lifecycle columns, and removes both status defaults.

The booking-backed wizard contained neither a v1 target snapshot nor a secure
anonymous capability, so it cannot be made safely resumable. Genuine parent
commitments are preserved; evidence-free rows follow the explicit beta-expiry
policy rather than receiving fabricated credentials.

## Conformance and maintenance

The shared conformance suite in
`@voyant-travel/catalog-contracts/booking-engine/lifecycle-conformance` is the
portable behavioral contract for first-party and third-party verticals.

The Booking Session maintenance job expires due Sessions, releases owned
capacity through the registered handler, and purges terminal personal data
after the configured retention window. It replaces the beta draft reaper.
