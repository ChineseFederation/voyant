# Public API checkout flow

This document describes the current checkout finalization path shared by the
public surface, Commerce, Catalog, Bookings, Finance, and Legal packages.

## Ownership

- Public API starts checkout and records the customer's payment intent.
- Finance owns payment sessions, authorizations, captures, payments, and
  invoices.
- Bookings owns booking state and confirmation.
- Catalog owns the in-process `checkoutFinalizeSaga` that orders the domain
  operations.
- Commerce wires the selected payment subscriber and exposes the callable
  `finalizeCheckout` operation.
- Legal may contribute contract PDF generation through a runtime port.

## Finalization sequence

1. A payment provider integration records a successful payment and emits the
   versioned `payment.completed` domain event.
2. Commerce's selected `payment.completed` subscriber ignores events without a
   booking and invokes `finalizeCheckout` inline with the delivery-scoped event
   bus.
3. `finalizeCheckout({ db, eventBus, input, generateContractPdf? })` builds the
   package dependencies and runs Catalog's in-process checkout saga.
4. The saga confirms the booking. A paid booking whose hold expired is recovered
   through the explicit late-payment recovery operation instead of being lost.
5. It converts an existing paid proforma or issues the fiscal invoice directly.
6. It links paid payment sessions to the invoice, records completed payments,
   and settles covered booking payment schedules.
7. When the selected product supplies the Legal runtime port, it regenerates the
   contract PDF with final payment state.

The operation is idempotent at its domain boundaries. It does not create a
generic run record, persist a step graph, or accept arbitrary execution
definitions.

## Failure and recovery

The payment event is delivered through the durable event-outbox path. The
subscriber deliberately lets that delivery mechanism own retries; it does not
create a second queue or workflow run. Every invoked domain operation must
therefore tolerate replay.

After payment succeeds, invoice or document failure must not roll the booking
back to `awaiting_payment`. The money and booking are real. The operation leaves
the booking confirmed, reports the failure through normal delivery/job health,
and retries only the unfinished idempotent work.

## Extension rules

- Add bounded reactions to the relevant domain event as subscribers.
- Put required deferred or scheduled product work in a package-owned job backed
  by domain-owned durable intent.
- Put customer-specific orchestration in an external automation that consumes
  events and calls authenticated domain commands.
- Do not add checkout-specific handlers, schedules, or execution graphs through
  `voyant.config.ts`.
