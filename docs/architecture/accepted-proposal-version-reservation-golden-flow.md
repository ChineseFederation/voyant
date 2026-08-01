# Accepted Proposal Version Reservation Golden Flow

Status: active architecture proof for
[#1793](https://github.com/voyant-travel/voyant/issues/1793). This note narrows the
proposal-to-reserve trace from ADR-0018, ADR-0005, and the product package
strategy into a testable ownership contract.

## Scope

This proof covers the happy path where a client accepts one Proposal Version and
the system prepares and submits a reservation plan. It does not retire the
legacy Transactions runtime, migrate existing `booking_transaction_details`
tables, or implement the final target schemas for every module. Those broader
schema moves remain owned by their follow-up issues.

## Sequence

| Step | Owner | Module Interface called | Durable owner record created or updated |
| --- | --- | --- | --- |
| 1 | Proposals | `Proposals.acceptProposalVersion` | `proposal_versions.status = accepted`, sibling `proposal_versions.status`, `proposals.acceptedVersionId`, `proposals.status = won` |
| 2 | Trips | `Trips.prepareReservationPlanForAcceptedProposalVersion` | Reads the accepted Version's `proposal_versions.tripSnapshotId`; creates `trip_reservation_plans` as the reservation-plan input record |
| 3 | Commerce | `Commerce.evaluateCommercialDecision` | No write by default; returns a `CommercialDecision` for each priced line |
| 4 | Commerce | `Commerce.recordCommercialSnapshot` | `commercial_snapshots` against the Trip Component or equivalent explicit target |
| 5 | Bookings | `Bookings.submitReservationPlan` | `booking_origins`, `bookings`, `booking_items`, `booking_travelers`, `booking_allocations`, and fulfillment state |
| 6 | Finance | `Finance.startCollection` | `payment_sessions`, payment schedules, invoices, or guarantees against explicit targets such as Booking or Invoice |
| 7 | Legal | `Legal.attachPolicyAndTermsTargets` | `policy_acceptances`, terms targets, contracts, signatures, or legal documents against explicit targets such as Booking or Proposal Version |

## Invariants

- Proposals accepts exactly one Proposal Version for a Proposal, closes the Proposal won,
  and hands off only the frozen Trip snapshot reference. Proposals does not reserve
  inventory.
- Trips owns Trip snapshots, reservation-plan inputs, and component
  commitment refs. It re-evaluates priced lines through the Commerce Interface
  before submitting the plan.
- Bookings owns active reservation orchestration for both direct B2C checkout
  and accepted Proposal Version flows.
- Bookings writes durable origin/provenance under Bookings ownership. The target
  replacement is `booking_origins`; new v1 flow contracts must not write
  `booking_transaction_details`.
- Finance collection starts from explicit targets such as Booking, Invoice,
  Payment Session, Schedule, or Guarantee. It must not require a generic
  Transactions Order id.
- Legal attaches terms, policy acceptance, contracts, and signatures to
  explicit targets such as Booking, Proposal Version, Program, or provider/source
  refs. It must not require a generic Transactions Offer or Order id.

The executable proof is
`packages/bookings/tests/unit/accepted-proposal-version-reservation-golden-flow.test.ts`.
