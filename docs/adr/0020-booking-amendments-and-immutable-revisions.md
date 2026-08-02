# ADR-0020: Booking Amendments and immutable Booking revisions

- **Status:** Accepted (2026-08-02)
- **Closes:** [#4014](https://github.com/voyant-travel/voyant/issues/4014), [#4015](https://github.com/voyant-travel/voyant/issues/4015)
- **Builds on:** [ADR-0019](./0019-booking-v1-commitment-point-policies.md)

## Context

A confirmed Booking is a stable commercial record. Mutating a traveler in
place without preserving the authorized before/after state loses history;
cancel-and-rebook breaks the Booking identity and is not a general change
mechanism. Customer and staff transports must also not grow separate mutation
semantics.

## Decision

Every v1 change to an existing Booking goes through a Booking Amendment. The
first tracers are a traveler contact/name correction with no external effects
and a priced traveler add/drop that changes the exact item roster, allocation,
price, Finance consequences, supplier desired state, documents, and
fulfillment follow-up.

The Booking owns a positive integer `revision`. Every mutation of the Booking
aggregate or its operational child state advances that token, including the
existing beta and cross-module write paths. Preview locks the Booking, checks
the caller's expected revision, resolves policy, and persists an Amendment plus
immutable `before` and `proposed_after` Booking Revision snapshots. A proposed
snapshot includes the stable Booking id and booking number and the complete
amendment-visible traveler identity/contact projection for that revision.

Applying locks the Booking first, then the Amendment. It rejects a stale base
revision or a missing required acceptance, updates the current traveler
projection, advances the Booking revision by exactly one, and marks the
Amendment applied in the same PostgreSQL transaction. Two Amendments may be
previewed from the same base revision, but at most one can apply; every later
attempt observes `stale_revision`.

The v1 lifecycle is `proposed → accepted → applying → applied` for priced or
supplier-affecting changes and `proposed → applied` when policy admits direct
application. `failed`, `in_doubt`, and `manual_review` are explicit outcomes;
they are never collapsed into Booking status.

### Priced traveler roster changes

Preview binds a server-calculated price, fee, tax, collection/refund amounts,
Finance consequences, exact Booking revision, proposed traveler/item/allocation
snapshot, and a short expiry to the Amendment. The client supplies requested
intent, never monetary deltas. Add/drop always requires acceptance of the
specific proposed Booking Revision before expiry.

For owned inventory, apply locks the Booking and Allocation, conditionally
changes capacity, updates traveler assignments and item quantities, records the
Finance adjustment, advances the Booking revision, and marks the Amendment
applied in one PostgreSQL transaction. A capacity or revision race rolls the
whole projection back.

For sourced inventory, the immutable Amendment operation plan is first
dispatched through durable Supplier Operations outside the Booking transaction.
Only an all-secured result may enter the local transaction. Pending and
in-doubt operations remain reconcilable; refusal is explicit; mixed outcomes
stop in manual review. Reconciliation reads the same durable operations rather
than creating a second upstream intent. Supplier calls are never made while a
Booking database transaction is open.

Finance owns price/tax policy and persists one idempotent Amendment adjustment.
Catalog owns supplier dispatch and reconciliation. Bookings owns the Amendment
aggregate and atomically projects the accepted result. These dependencies enter
Bookings through runtime ports, avoiding package cycles and transport-specific
implementations.

Preview, acceptance, and apply are idempotent admitted commands. Anonymous
customers use a Booking-scoped action capability, authenticated customers use
their Bookings-owned Person/Organization relationship, and staff uses the
admin transport. All transports invoke the same Bookings service.

## PII and audit

Revision snapshots contain the same contact-class PII already stored on
`booking_travelers`; they do not contain the encrypted passport, identity
document, operational notes, dietary, or accessibility envelope. Historical
reads use the same capability/ownership checks and staff redaction rules as the
current traveler projection and append to the Booking PII access log. Each
Amendment records the requester, accepting actor, applying actor, reason,
timestamps, changed fields, and the immutable snapshots.

## Consequences

- Booking id and booking number never change during an Amendment.
- Direct beta traveler mutation routes remain migration surfaces only; new v1
  callers use Amendment preview/accept/apply. Until those routes are retired,
  they advance the same Booking revision so outstanding previews become stale.
- Name/contact corrections always have a zero price delta and
  explicitly report every downstream effect as `not_required`.
- Priced roster changes expose follow-up actions for collection/refund and
  document reissue after the Booking projection commits; payment state and
  document state remain owned by their respective modules.
- Unsupported allocation shapes or incomplete supplier provenance fail closed
  at preview rather than guessing how to mutate inventory.
- Revision snapshots are immutable. The current Booking and traveler tables
  remain the operational projection.

## Alternatives considered

### Update the traveler row and write only an activity message

Rejected. A prose audit message cannot prove the exact before/after state or
provide optimistic concurrency.

### Create a replacement Booking

Rejected. It changes customer-visible identity, fragments Finance and
fulfillment history, and turns ordinary corrections into cancellation.

### Let each transport implement correction rules

Rejected. Authentication changes admission, not the meaning of Booking,
Amendment, revision, acceptance, or apply.
