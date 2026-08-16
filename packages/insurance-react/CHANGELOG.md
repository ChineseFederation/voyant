# @voyant-travel/insurance-react

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
