# ADR-0019: Booking v1 commitment-point policies

- **Status:** Accepted (2026-08-01)
- **Closes:** [#4007](https://github.com/voyant-travel/voyant/issues/4007)
- **Blocks:** [#4009](https://github.com/voyant-travel/voyant/issues/4009)
- **Builds on:** [ADR-0005](./0005-retire-transactions-runtime.md),
  [ADR-0018](./0018-proposals-as-travel-native-bespoke-sales-artifact.md),
  [federated operating mode](../architecture/federated-operating-mode.md)

## Context

Booking Platform v1 needs one exact answer to "when does a Booking exist?"
before the owned-product tracer can implement Session, Quote, Hold, and Commit.
The beta journey has several adjacent facts that can be mistaken for that
moment:

- customer intent, such as opening checkout or accepting a Proposal Version
- payment state, such as a card authorization, guarantee, or pay-later promise
- supplier state, such as an upstream reservation request, timeout, or
  confirmation
- fulfillment state, such as Service Voucher issuance or service delivery

Those facts are real, but none of them is automatically a Booking. A Booking is
the durable first-party commercial commitment and customer-safe operational
record. It starts only at the policy-defined commitment point.

## Decision

Booking Platform v1 supports three commitment policies.

### Owned inventory: atomic Commit

Owned inventory defaults to `owned_atomic_commit`.

Commit is the only event that creates a Booking. It must validate the exact
Booking Session revision supplied by the caller, validate the immutable Quote
bound to that revision, validate a live Hold when the policy requires one,
establish any required payment guarantee, create the Booking, convert the Hold
to an Allocation, and consume the Session and Quote in one transaction.

If any of those validations fail, no Booking, booking number, Booking Item,
Allocation, Finance record, or reporting residue is created for that attempt.
The caller receives a typed outcome with the next action to take.

### Sourced inventory: supplier-first

Sourced inventory defaults to `sourced_supplier_first`.

Commit persists the Commit/Supplier Operation intent before dispatching the
upstream operation. The supplier system remains authoritative for supplier
security. Voyant creates no Booking until the supplier is secured. While the
supplier operation is pending or ambiguous, the result is a typed supplier
outcome, not a draft Booking status.

When the supplier is secured, Voyant creates the Booking and captures the
provider/source order reference as provenance. If the supplier result is
ambiguous, Voyant reports `supplier_in_doubt` and requires reconciliation before
the operator or automation can claim the component is secured.

### Sourced inventory: operator-backed exception

A sourced flow may select `operator_backed_commit` only when an operator policy
deliberately accepts fulfillment risk as an alternative to supplier-first.

That explicit policy may create a Booking before supplier security because the
operator is making the durable commercial commitment and taking responsibility
for fulfillment if the supplier cannot be secured. The supplier operation state
still stays separate from Booking status, and the next action remains to await
or reconcile supplier security.

No sourced flow may infer this exception from UI surface, actor type, channel,
or payment state. It must be selected by commercial policy.

### Payment guarantee

A payment guarantee is a precondition when the selected commercial policy
requires one. A guarantee may be a deposit, pre-authorization, card on file,
agency letter, or equivalent policy-approved assurance.

Pay-later or post-commit collection is allowed only when the selected commercial
policy explicitly authorizes it. Finance state never becomes Booking status:
unpaid, authorized, paid, failed, overdue, scheduled, and invoice states belong
to Finance targets and collection plans. They do not authorize callers to
invent draft, pending-payment, or paid Booking statuses in the v1 commitment
contract.

### Accepted Proposal Version handoff

Accepting a Proposal Version records customer intent and seeds a Booking
Session. It does not itself create a Booking, secure suppliers, preserve a stale
price, or waive availability checks.

The seeded Booking Session must receive fresh Quote and availability validation
before Commit. If material terms change after acceptance, such as dates,
travelers, inclusions, price, cancellation terms, supplier substitution, or
guarantee requirements, the Proposal Version requires renewed acceptance before
Commit may create a Booking.

## Typed outcomes and next actions

The reusable v1 lifecycle outcome vocabulary is:

| Outcome | Next action | Booking creation |
| --- | --- | --- |
| `committed` | `none` | Created exactly once at the policy commitment point. |
| `payment_required` | `establish_payment_guarantee` | No Booking. |
| `supplier_pending` | `await_supplier_operation` or `persist_and_dispatch_supplier_operation` | No Booking under supplier-first; possible only under explicit operator-backed policy. |
| `supplier_in_doubt` | `reconcile_supplier_operation` | No Booking under supplier-first; may include a Booking id only under explicit operator-backed risk acceptance. |
| `revision_mismatch` | `refresh_session_state` | No Booking. |
| `quote_failure` | `request_fresh_quote` | No Booking. |
| `hold_failure` | `request_new_hold` | No Booking. |
| `proposal_acceptance_required` | `renew_proposal_version_acceptance` | No Booking. |
| `idempotent_replay` | `return_idempotent_result` | No new Booking or supplier operation. |

These outcomes are transport-neutral. HTTP routes, SDK clients, admin UI, public
checkout, and later tracers must preserve them rather than translating them into
ad hoc status strings.

## Conformance contract

The machine-checked contract lives in
`@voyant-travel/catalog-contracts/booking-engine/lifecycle-conformance`.

It exports:

- typed policy, input, outcome, next-action, and effect-observation schemas
- `bookingLifecycleConformanceScenariosV1`, the required v1 scenario catalog
- `runBookingLifecycleConformanceV1(...)`, a reusable runner that returns
  per-scenario pass/fail results
- `assertBookingLifecycleConformanceV1(...)`, a test-runner-neutral harness for
  implementations

Every implementation of the v1 commit workflow must pass that conformance
suite, in addition to package-local concurrency and persistence tests. The
scenario catalog is the reusable source for #4009 and later sourced-inventory
tracers.

## Consequences

- Booking Session is pre-commitment state. Abandonment must not leak a Booking;
  pending Finance attempts are terminalized, while captured pre-Booking money
  remains explicitly targeted at the terminal Session for reconciliation.
- Quote is immutable and exact-revision scoped. Re-quoting after a material
  change supersedes prior pricing rather than mutating it.
- Hold is inventory state, not a Booking. Owned Commit converts Hold to
  Allocation atomically.
- Supplier Operation is sourced-inventory state, not a Booking. Supplier
  pending and ambiguity remain typed lifecycle outcomes.
- Finance collection, invoices, schedules, guarantees, and payment sessions use
  explicit Finance targets. They do not define Booking status.
- Fulfillment starts after Booking creation. Service Voucher issuance,
  redemption, delivery, and completion do not decide when the Booking starts.

## Alternatives considered

### Create a draft Booking at Session start

Rejected. It creates commercial residue for abandoned checkout, forces Finance
and reporting to distinguish "not really a booking" rows forever, and conflicts
with the v1 deletion intent for beta shortcuts.

### Create sourced Bookings before supplier confirmation by default

Rejected. That hides upstream uncertainty inside local status strings and
violates federated source authority. The operator-backed exception is explicit
because it is a commercial risk decision, not a technical default.

### Let payment state drive Booking status

Rejected. Payment state belongs to Finance. A paid or authorized payment may
satisfy a Commit precondition, but it is not the durable Booking lifecycle.
