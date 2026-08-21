# @voyant-travel/insurance

## 0.2.3

### Patch Changes

- Updated dependencies [33cba53]
- Updated dependencies [e3b63b5]
- Updated dependencies [ee1092f]
- Updated dependencies [73a3ca3]
  - @voyant-travel/hono@0.145.0
  - @voyant-travel/commerce@0.56.3
  - @voyant-travel/bookings@0.251.0
  - @voyant-travel/action-ledger@0.115.22

## 0.2.2

### Patch Changes

- 2f5f676: Charge and issue an accepted ancillary offer.

  The checkout ancillary seam was complete on both sides with nothing crossing it:
  `prepare` and `fulfill` had no production caller, the pass-through
  materialization was exercised only by its own unit tests, and the container key
  holding the bound sources was read by nobody. A traveller could accept an
  insurance offer, answer the insurer's questions and acknowledge its disclosures,
  and then the premium never reached the booking and no policy was ever issued.

  Checkout-start is now the seam. It is post-commit and pre-payment, which is
  where an application has to be opened: the Booking exists, nothing has been
  charged, and a failure is still something the traveller can see and retry. It is
  deliberately not the Booking Session commit transaction — `prepare` is an HTTP
  round trip to the third party, and a network call inside that transaction either
  holds it open across the call or fails it after money has moved. Each accepted
  selection is prepared, written onto the Booking as a `pass_through` line at the
  prepared price, and the Booking total re-rolled so the amount the payment
  provider is asked for already contains it.

  After payment, `checkoutFinalizeSaga` gains a `fulfill_ancillaries` step, last
  and after the payment linkage, because it is the only step whose precondition is
  that the money is definitely in and the only one that cannot be taken back. It
  issues, attaches the certificate through the booking-document path, and
  reconciles the issued premium against the charged one. Nothing in it throws for
  a supplier outcome: a refusal leaves `issue_failed` with the reason and raises
  the staff alert, and a premium that does not match is recorded on the booking
  rather than silently absorbed.

- Updated dependencies [2f5f676]
  - @voyant-travel/bookings@0.250.0
  - @voyant-travel/commerce@0.56.0

## 0.2.1

### Patch Changes

- Updated dependencies [d631aa1]
  - @voyant-travel/catalog-contracts@0.138.0
  - @voyant-travel/commerce@0.55.3

## 0.2.0

### Minor Changes

- c5b12ba: Add travel insurance as a sellable ancillary.

  `@voyant-travel/insurance-contracts` is the provider-neutral vocabulary — quote
  requests expressed as ages and dates, quotes carrying eligibility as structured
  reasons rather than exceptions, applications with their own insured persons and
  bounded validity window, issued policies, and the five-method provider port an
  insurer adapter binds. The `insurance` module owns persistence for applications
  and policies, encrypts insured persons' identity data at rest, and fans out
  across every connected insurer.

  Checkout gains a provider-neutral ancillary seam: `commerce.ancillary-offer-source`
  is many-valued, always returns a list, and degrades a slow or failing provider to
  a diagnostic instead of blocking a purchase. Commerce learns nothing about
  insurance — an operator with a direct supplier contract binds their own source.

  A premium is a pass-through line: excluded from operator markup and commission,
  carrying its own tax treatment rather than inheriting the booking's, and
  reconciled against the issued policy so the booking total cannot drift from the
  document the traveller receives.

  The legal module gains acceptance targets for an insurer's product information
  document, its terms pinned to the version in force at the time of sale, and a
  demands-and-needs statement, with the artifact archived rather than re-fetched
  from a URL that will later serve something else.

### Patch Changes

- Updated dependencies [c5b12ba]
  - @voyant-travel/insurance-contracts@0.2.0
  - @voyant-travel/catalog-contracts@0.137.0
  - @voyant-travel/commerce@0.55.0
  - @voyant-travel/bookings@0.249.0
