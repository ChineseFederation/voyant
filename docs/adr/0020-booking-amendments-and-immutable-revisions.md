# ADR-0020: Booking Amendments and immutable Booking revisions

- **Status:** Accepted (2026-08-02)
- **Closes:** [#4014](https://github.com/voyant-travel/voyant/issues/4014)
- **Builds on:** [ADR-0019](./0019-booking-v1-commitment-point-policies.md)

## Context

A confirmed Booking is a stable commercial record. Mutating a traveler in
place without preserving the authorized before/after state loses history;
cancel-and-rebook breaks the Booking identity and is not a general change
mechanism. Customer and staff transports must also not grow separate mutation
semantics.

## Decision

Every v1 change to an existing Booking goes through a Booking Amendment. The
first complete tracer is a traveler contact/name correction with no price,
supplier, Finance, Legal, document, or fulfillment effect.

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

The v1 lifecycle is `proposed → accepted → applied` when acceptance is required
and `proposed → applied` when policy admits direct application. `rejected` and
`failed` are reserved terminal states for the supplier-affecting workflow in
#4015; this tracer does not manufacture transitions it cannot yet execute.

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
- Name/contact corrections in this tracer always have a zero price delta and
  explicitly report every downstream effect as `not_required`.
- Any change that may affect supplier inventory, price, fees, documents, or
  fulfillment must use the priced supplier-affecting Amendment workflow in
  #4015 rather than widening this tracer's policy.
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
