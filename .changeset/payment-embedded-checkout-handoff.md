---
"@voyant-travel/payments": minor
"@voyant-travel/finance": patch
"@voyant-travel/operator-settings": patch
---

`PaymentInitiationResult.checkout` is a discriminated union with a `redirect` arm
and an `embedded` arm, so the port can express an in-page payment.

`PaymentHostedCheckout` was a `url` with a label: `kind` was
`"hosted_checkout" | "redirect"`, `url` was required, and both values mean "send
the shopper somewhere else". A provider that supports in-page payment (Stripe
Elements, Adyen Drop-in, Braintree Hosted Fields) hands back a per-session client
secret plus a publishable key and the page mounts the form itself — there was no
arm of the union that could carry that, so no adapter could offer it and the
shopper was redirected off the storefront at the last step of the funnel.

The union is now:

- `PaymentRedirectCheckout` — `kind: "hosted_checkout" | "redirect"`, `url`
  required. Today's behaviour, unchanged.
- `PaymentEmbeddedCheckout` — `kind: "embedded"`, carrying the opaque
  `clientSecret`, the `publishableKey`, and an optional `providerAccountId` for
  platform-scoped providers. No `url`. The runtime forwards these and never
  learns what the front end does with them.

Both arms keep `expiresAt`.

The two sides negotiate, so gaining an arm never takes one away. An adapter
advertises `capabilities.embeddedCheckout`; a caller declares
`PaymentInitiationInput.acceptedCheckoutHandoffs`, the arms it can render in
preference order. **Omitting it means `["redirect"]`** — a caller that has not
opted in is never handed a form it cannot mount. `embeddedCheckout` is optional
and absent means `false`, so an existing redirect adapter needs no change.

New helpers: `isRedirectPaymentCheckout`, `isEmbeddedPaymentCheckout`,
`paymentCheckoutHandoff`, `paymentCheckoutRedirectUrl`,
`supportedPaymentCheckoutHandoffs`, `acceptedPaymentCheckoutHandoffs`, and
`negotiatePaymentCheckoutHandoff`.

The conformance kit covers both arms and the downgrade. An adapter declaring
`embeddedCheckout` must return a well-formed `embedded` arm to a caller that
accepts one, supplied through the new `embeddedInitiation` fixture, and *every*
adapter is now probed with a redirect-only caller — a storefront that only knows
how to redirect must not break when an adapter gains in-page support.

Finance is a redirect-only caller: `startPaymentAdapterCardPayment` and
`applyPaymentAdapterInitiationResult` read the URL through
`paymentCheckoutRedirectUrl(...)` rather than `checkout?.url`, and never request
the embedded arm. Persisting an embedded handoff so a storefront can mount a form
is follow-on work, not part of the port.
