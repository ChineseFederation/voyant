# ADR-0005: Retire transactions runtime before v1

- **Status:** Accepted (2026-06-13)
- **Relates to:** [ADR-0018](./0018-proposals-as-travel-native-bespoke-sales-artifact.md), [product package strategy](../architecture/product-package-strategy.md)
- **Builds on:** [ADR-0001](./0001-tenant-scoping.md), [ADR-0002](./0002-contract-packages.md)

## Context

ADR-0018 makes Proposal and Proposal Version the travel-native sales artifacts, and ADR-0004
intentionally did not retire the existing Transactions Offer primitive. The
repository still has a generic `transactions` runtime package that sits between
sellability and bookings with Offer, Order, participants, items, contact/staff
assignments, order terms, PII audit, and booking extension links.

That generic ladder is now the wrong seam for v1:

- bespoke proposal lifecycle belongs in Proposals and Proposal Versions
- quote-time commercial decisions belong in Commerce and Trips snapshots
- active reservation orchestration belongs in Bookings
- payment, invoice, settlement, and collection state belongs in Finance
- terms, policy acceptance, contracts, and signatures belong in Legal
- Person, Organization, account, and contact context belongs in Relationships
- source/provider confirmation ids belong in vertical adapters, Catalog
  snapshots, or Distribution external references

Keeping a renamed `orders` or `commitments` package would preserve the same
shallow pass-through Module. It would force deeper Modules to coordinate through
a generic record even when their local records already carry the durable truth.

## Decision

Retire `@voyant-travel/transactions` and `@voyant-travel/transactions-react` as public v1
runtime packages.

Do not replace them with a new first-party `orders` or `commitments` Module.
The generic commercial commitment role currently played by Transactions Order is
replaced by:

- Bookings-owned origin/provenance for durable commitment context
- Booking sessions, booking items, traveler records, allocation/fulfillment
  state, and customer-safe booking state in Bookings
- Trips reservation plans and Trip Component commitment refs for
  composed trips before and during reserve
- Finance target links for payment sessions, schedules, invoices, credit notes,
  supplier invoices, settlement, guarantees, and profitability
- Legal target links for policy acceptances, terms, contracts, signatures, and
  legal documents
- provider/source order refs captured by vertical adapters, Catalog snapshots,
  or Distribution external references when an upstream system uses order
  language

Transactions Offer becomes legacy compatibility language only. Commerce must not
construct or persist Transactions Offers as its normal sellability output.
Commerce returns commercial decisions, price/availability responses, commercial
snapshots, proposal-version pricing inputs, booking drafts, or Trips price
snapshots depending on the caller.

`@voyant-travel/transactions-contracts` is also removed from the v1 workspace
surface. Useful validation schemas from the retired generic Offer/Order ladder
must move to the owning package instead of preserving a standalone Transactions
contract seam.

## Required v1 ownership

- Proposals owns Proposal, Proposal Version, proposal lifecycle, send/view/accept
  decisions, accepted-version state, and accept-to-reserve handoff.
- Trips owns Trip Envelope draft workspaces, frozen trip snapshots,
  reservation plans, and checkout handoff handles.
- Bookings owns active reservation orchestration for direct B2C checkout and
  accepted Proposal Version flows.
- Bookings owns the replacement for `booking_transaction_details`: origin and
  provenance records or fields that can reference Proposal Version, Trip snapshot,
  Catalog price/availability response, Catalog snapshot, provider/source order
  ref, and legacy migrated transaction ids.
- Finance owns payment and invoice targets through generic target references,
  not generic Transactions Order ids.
- Legal owns policy acceptance, contract, and terms targets through generic
  target references, not generic Transactions Offer/Order ids.
- Distribution and vertical/source adapters own external reference mapping for
  upstream order ids.

## Proposal-to-reserve sequence

1. Proposals records that a Proposal Version was accepted, closes the Proposal won, and
   emits or calls an accept-to-reserve handoff.
2. Trips receives the accepted Proposal Version's frozen Trip snapshot and
   prepares a reservation plan.
3. Trips asks Commerce to re-evaluate priced lines through the Commerce
   Interface. Commerce returns commercial snapshots and source/provider handles
   where applicable.
4. Trips submits the reservation plan to Bookings.
5. Bookings performs active reservation orchestration. Catalog-backed sourced
   lines reserve through Catalog or vertical adapters; operated lines reserve
   through Bookings and Operations Interfaces; manual placeholders enter staff
   confirmation workflow.
6. Bookings persists durable booking origin/provenance, booking sessions or
   booking items, traveler records, allocations, fulfillment state, and
   customer-safe booking state.
7. Finance creates collection/payment/invoice targets against Booking,
   Schedule, Invoice, Guarantee, Program, or other explicit target refs.
8. Legal attaches policy acceptance, terms, contracts, and signatures against
   Booking, Proposal Version, Program, provider/source ref, or other explicit target
   refs.

## Consequences

### Positive

- V1 removes a shallow package seam instead of renaming it.
- Proposal, reservation, booking, finance, and legal state live in the Modules
  that actually own their behavior.
- Direct B2C checkout and accepted Proposal Version flows share Bookings
  reservation orchestration instead of creating two reserve paths.
- External order language remains available for provider/source systems without
  becoming a first-party generic Order Module.

### Negative

- This is a broad breaking migration across runtime imports, routes, generated
  schema manifests, templates, contracts, tests, and documentation.
- Existing public fields named `offerId` or `orderId` must be audited because
  they may mean Transactions ids, provider/source ids, or legacy compatibility.
- Finance and Legal need explicit target-link models before generic
  `orderId`/`offerId` fields can be removed cleanly.

## Migration gates

Before removing the runtime package from templates:

- no non-legacy runtime package imports `@voyant-travel/transactions` or
  `@voyant-travel/transactions-react`
- default templates no longer mount `transactionsApiModule`,
  `transactionsBookingExtension`, or transactions link tables
- Sellability no longer constructs or persists Transactions Offers
- `booking_transaction_details` is replaced by Bookings-owned
  origin/provenance records or fields
- Legal policy acceptance, contracts, and terms do not expose generic
  Transactions `offerId` / `orderId` fields in public v1 contracts
- Finance payment authorization and collection surfaces do not expose generic
  Transactions `orderId` fields in public v1 contracts
- public v1 fields named `offerId` / `orderId` are either provider/source
  identifiers or explicitly legacy compatibility fields
- generated schema manifests and package-closure checks for default templates
  have no runtime Transactions dependency
- old transactions tests are ported to the owning Modules' Interface tests or
  removed with documented replacement coverage

## Alternatives considered

### Rename transactions to orders

Rejected. The name is clearer than `transactions`, but the Module would still be
a generic coordination record between Proposals, Bookings, Finance, Legal,
Distribution, and vertical adapters. That preserves the shallow seam.

### Keep Transactions Offer only

Rejected for v1 runtime. ADR-0018 moves travel-native bespoke sales language to
Proposal and Proposal Version. Commerce and Trips need commercial snapshots and
price/availability responses, not another public Offer primitive.

### Keep transactions as a compatibility runtime package

Rejected for default v1 bundles. Temporary runtime facades are acceptable inside
the migration branch if they keep intermediate commits verifiable, but they
should not ship as public v1 API.
