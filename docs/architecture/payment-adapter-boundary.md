# Payment adapter boundary

Payment processors are deployment adapters, not remote apps. The canonical
adapter contract lives in `@voyant-travel/payments`, while finance remains the
owner of payment-session, invoice, payment, and checkout state.

The deployment selects one active adapter through
`deployment.providers.payments`. The provider values are:

- `managed`
- `voyant-pay`
- `netopia`
- `custom`
- `none`

The legacy `voyant-payments` value remains accepted at deployment input
boundaries and is normalized to the canonical `voyant-pay` value in generated
deployment output.

For the pinned values (`voyant-pay`, `netopia`, `custom`), environment
variables configure the selected adapter; their presence never selects a
processor. This is the self-host path: one in-process adapter package, pinned by
the graph, configured through the environment.

`managed` selects the active processor at runtime from the database and resolves
it through the remote transport and the voyant-cloud provider registry, so an
operator can browse and connect a processor from Settings → Payments. Processor
credentials in managed mode are stored in voyant-cloud under GCP KMS and never
rest inside the Operator boundary. See
[ADR 0015](../adr/0015-payment-adapter-transports-and-managed-connect.md) for
the two-transport model (in-process vs remote), the managed connect flow, and
the credential-custody rules.

`none` is valid only for deployments without payment-capable graph units.
Payment-capable graphs, including finance payment-session capability, must
select exactly one active adapter. `custom` is reserved for operator-owned
adapters that satisfy the public conformance kit.

Adapter packages expose a provider facet with `selection.role: "payments"` and
the matching `selection.value`. The graph resolver rejects zero or multiple
matching provider facets for a concrete selected adapter.

`@voyant-travel/payments` exports:

- the runtime adapter port;
- declared processor capabilities;
- hosted checkout / redirect / embedded initiation (see below);
- authorize, capture, void, refund, and status operation contracts;
- callback signature verification and canonical event mapping;
- idempotency and retry expectations;
- health diagnostics and sandbox/test-mode declaration;
- conformance helpers for money handling, state transitions, duplicate/replay
  callbacks, signature failure, idempotency, and failure posture;
- the provider selection/connection layer: `PaymentProviderDescriptor`,
  `PaymentProviderRegistry`, connection identity/summary/readiness types, and
  the `activate` contract for explicit processor activation (see
  [ADR 0015 §5a](../adr/0015-payment-adapter-transports-and-managed-connect.md)).
  Connected/ready and active/default are independent facts; only a ready
  connection may be made the active default, and the authoritative registry
  enforces that gate. The default/self-host registry is read-only for activation
  and fails closed.

## Checkout handoff

`PaymentInitiationResult.checkout` is a discriminated union over how the shopper
reaches the processor, not a URL with a label:

| arm | `kind` | carries |
|---|---|---|
| redirect | `hosted_checkout`, `redirect` | `url` — the shopper leaves the storefront |
| embedded | `embedded` | `clientSecret`, `publishableKey`, optional `providerAccountId` — the page mounts the provider's own form |

Both arms carry an optional `expiresAt`. The embedded arm exists because
in-page providers (Stripe Elements, Adyen Drop-in, Braintree Hosted Fields) hand
back a per-session credential plus a publishable identifier, and a union that
requires a `url` cannot express that — the shopper gets redirected off the
storefront at the last step of the funnel no matter which adapter is configured.
The runtime forwards those credentials opaquely and never learns what the front
end does with them.

The two sides negotiate, so gaining an arm never takes one away:

- an adapter advertises `capabilities.embeddedCheckout` alongside the existing
  `hostedCheckout` / `redirectCheckout` flags. It is optional, and absent means
  `false`, so an adapter written against the earlier contract keeps its meaning;
- a caller declares `PaymentInitiationInput.acceptedCheckoutHandoffs` — the arms
  it can render, most-preferred first. **Omitting it means `["redirect"]`**: a
  caller that has not opted in is never handed a form it cannot mount;
- `negotiatePaymentCheckoutHandoff(capabilities, input)` resolves the pair, and
  `paymentCheckoutRedirectUrl(checkout)` is how a redirect-only caller reads a
  URL without narrowing the union itself.

The conformance kit covers both arms and the downgrade: an adapter declaring
`embeddedCheckout` must return a well-formed `embedded` arm to a caller that
accepts one (`embeddedInitiation` fixture), and *every* adapter must keep serving
a caller that only accepts `redirect`.

Finance's `CardPaymentStarter` is a redirect-only caller today: it never requests
the embedded arm, and `payment_sessions.redirect_url` stays the persisted
projection. Persisting an embedded handoff so a storefront can mount a form is
the follow-on work, not part of the port.

The existing finance `CardPaymentStarter` seam remains as the checkout bridge.
Deployments can adapt a selected `PaymentAdapter` through
`createPaymentAdapterCardPaymentStarter(...)`, and verified callback events are
applied to the finance payment-session state machine through
`applyPaymentAdapterCallbackEvent(...)`.

Finance checkout collection routes also consume the selected
`payments.adapter.runtime` port directly. Clients request a card start without
selecting or naming a processor; a legacy provider hint may be accepted for
compatibility, but it never overrides the deployment-selected adapter.
