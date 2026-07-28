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
- hosted checkout / redirect initiation;
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

The existing finance `CardPaymentStarter` seam remains as the checkout bridge.
Deployments can adapt a selected `PaymentAdapter` through
`createPaymentAdapterCardPaymentStarter(...)`, and verified callback events are
applied to the finance payment-session state machine through
`applyPaymentAdapterCallbackEvent(...)`.

Finance checkout collection routes also consume the selected
`payments.adapter.runtime` port directly. Clients request a card start without
selecting or naming a processor; a legacy provider hint may be accepted for
compatibility, but it never overrides the deployment-selected adapter.
