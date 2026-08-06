---
"@voyant-travel/catalog-contracts": minor
"@voyant-travel/catalog-react": minor
"@voyant-travel/catalog": minor
---

A Booking Session commit can state which checkout handoffs the storefront can
render, and forwards it to the payment adapter.

The payment port gained an `embedded` handoff and
`PaymentInitiationInput.acceptedCheckoutHandoffs` to negotiate it, but nothing
connected a Booking Session to either: `commitBookingSessionV1.payment` carried
only `returnUrl` and `cancelUrl`, and the commit never set
`acceptedCheckoutHandoffs` on the initiation. So the negotiation had no caller —
a control plane could implement the embedded arm in full and still only ever be
asked for a redirect.

- `commitBookingSessionV1.payment.acceptedCheckoutHandoffs` is an ordered
  preference, most-preferred first. Absent means `["redirect"]`, so an existing
  storefront keeps getting a hosted page rather than a client secret it cannot
  mount.
- The commit forwards it verbatim. It interprets none of it: the storefront is
  the only party that knows what it can render, and an adapter without
  `embeddedCheckout` still answers a client that prefers `embedded` with a
  redirect through the existing `negotiatePaymentCheckoutHandoff`.
- `returnUrl` stays optional and is still accepted alongside an `embedded`
  preference — the shopper is not sent anywhere, but an issuer authentication
  step still wants a URL to return to.

The `payment_required` outcome continues to project `redirectUrl` rather than
the handoff union, so a storefront that asked for `embedded` reads the handoff
back from `GET /v1/public/finance/payment-sessions/{id}`. `redirectUrl` is
`null` for that arm, so `commitBookingSessionJourneyV1`'s `payment_required`
result now also carries `paymentSessionId` — without it the preference the
helper can now state would have nowhere to land.
