---
"@voyant-travel/finance": minor
"@voyant-travel/finance-contracts": minor
"@voyant-travel/finance-react": minor
"@voyant-travel/storefront": minor
"@voyant-travel/trips": patch
---

An embedded checkout handoff now survives from the adapter to the page that
mounts the form, so a storefront can take an in-page payment end to end.

`PaymentHostedCheckout` gained an `embedded` arm, but nothing downstream could
carry it: `payment_sessions.redirect_url` was the only landing slot, so the arm
was flattened to `null` at `applyPaymentAdapterInitiationResult` and the payer
still got redirected. This wires the rest of the path.

**Persistence.** New `payment_sessions.checkout` jsonb column holding the whole
discriminated union. `redirect_url` stays the redirect arm's flattened
projection and the column every existing reader uses, so nothing that reads it
changes. A paid session clears both, which also drops the spent client secret.

**Negotiation is driven by the page, not guessed.** The chain now threads
`acceptedCheckoutHandoffs` inward — landing page → `POST /start-card` →
`PaymentLinkRoutesOptions.startCardPayment` → `CardPaymentStartArgs` →
`adapter.initiate` — and the handoff back out. Every hop defaults to
redirect-only when the field is absent, so a client built before this release
keeps getting a redirect from a processor that has since gained in-page support.

**The UI seam.** `PaymentLinkLandingPageProps.embeddedCheckoutClient` takes a
`ComponentType<PaymentEmbeddedCheckoutClientProps>` — the same
prop-injection shape as `PaymentEmbeddedOnboardingClient` in operator-settings.
Supplying it is what makes the page request the embedded arm at all. This
package still imports no provider SDK: the concrete Stripe Elements / Adyen
Drop-in component belongs to the deployment, code-split at its composition root.
The client secret reaches it through a `fetchClientSecret` callback rather than
a prop, so it is not sitting in the rendered tree.

**Contracts.** `paymentCheckoutSchema` mirrors the port union in zod;
`finance-contracts` depends only on zod, so an annotated projection in finance's
public service pins the mirror to `PaymentHostedCheckout` and fails the build if
the arms drift. `publicPaymentSessionSchema` and the start-card response both
carry `checkout`.

Not covered: the commerce booking-engine checkout still requests redirect-only,
and `POST /payment-sessions/{id}/requires-redirect` is unchanged — it stamps a
URL by name and by contract. Both are safe by the redirect default rather than
by omission.
