---
"@voyant-travel/catalog-contracts": minor
"@voyant-travel/catalog-react": minor
"@voyant-travel/catalog": minor
"@voyant-travel/finance": patch
---

The negotiated checkout handoff reaches the storefront that asked for it.

The previous release let a Booking Session Commit state
`payment.acceptedCheckoutHandoffs` and forwarded it to the adapter. Nothing
carried the answer back: `payment_required.paymentSession` projected
`redirectUrl`, which is only the redirect arm's flattened value and is `null`
for an embedded one. So a storefront could ask for an in-page form, have the
preference honoured all the way to the adapter, and be handed a
`payment_required` with a null URL and no client secret — the token dying
between the adapter and the only outcome the storefront reads. Half the path was
inert.

- `payment_required.paymentSession` gains `checkout`, the whole
  `PaymentHostedCheckout` union, alongside the unchanged `redirectUrl`. It is
  required-and-nullable like `redirectUrl`, so a lifecycle implementor that
  omits it fails to parse rather than silently starving the storefront.
- The schema is re-exported from `@voyant-travel/finance-contracts` as
  `bookingPaymentCheckoutV1` rather than mirrored a third time. It is finance's
  object and that mirror is already pinned to the port by an annotated
  projection in finance's public service; a private copy here would be the drift
  the pin exists to prevent. Both are zod-only packages, so nothing
  runtime-shaped enters the closure.
- `commitBookingSessionJourneyV1`'s `payment_required` result carries
  `paymentSessionId` and `checkout`.
- An initiation that produces an embedded arm is recorded as `pending`, not
  `requires_redirect`. That state asserts there is somewhere to send the shopper
  and this arm has nowhere, so the two columns contradicted each other and every
  reader keyed on it — the status pollers, the pending aggregates, the reuse
  arms — would wait on a return trip nobody was sent on. `PaymentSessionState`
  is the framework's vocabulary and the conformance kit pins no state to the
  arm, so the framework settles it rather than trusting each adapter to.
