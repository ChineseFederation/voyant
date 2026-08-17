---
"@voyant-travel/bookings": minor
"@voyant-travel/catalog": minor
"@voyant-travel/commerce": minor
"@voyant-travel/insurance": patch
---

Charge and issue an accepted ancillary offer.

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
