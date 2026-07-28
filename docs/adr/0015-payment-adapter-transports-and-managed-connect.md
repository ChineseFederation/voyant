# 0015. Payment adapter transports and managed provider connect

- **Status:** Proposed
- **Audience:** framework, payments, finance, Operator, security, and
  voyant-cloud maintainers
- **Decision type:** public runtime and package contract
- **Related:** [`payment-adapter-boundary.md`](../architecture/payment-adapter-boundary.md),
  [`payments-architecture.md`](../architecture/payments-architecture.md),
  [`remote-app-platform-rfc.md`](../architecture/remote-app-platform-rfc.md),
  [`0013-single-server-api-runtime.md`](./0013-single-server-api-runtime.md)

## Context

Payment processors are, and remain, **deployment adapters** — not remote apps.
The Remote App Platform RFC deliberately classifies payment under
*"deployment adapter or provider"* because taking money requires **synchronous
checkout participation** and native-transaction-adjacent trust that the
untrusted, OAuth-gated remote-app model forbids. The canonical adapter contract
already exists in `@voyant-travel/payments` (`PaymentAdapter`,
`paymentAdapterRuntimePort`), and finance owns payment-session, invoice,
payment, and checkout state.

Today a deployment **hard-selects one adapter at build time** through
`deployment.providers.payments` (`voyant-pay` | `netopia` | `custom` |
`none`) and **configures it with environment variables**. There is no way for an
operator to browse available processors and connect one from the admin UI; the
provider is fixed by the deployment graph and its credentials are baked into the
environment.

Two forces make that insufficient:

1. **Operator experience.** Operators expect to pick a payment processor and
   connect it by entering credentials in Settings — "it's connected" — the same
   way they manage every other integration. Not by editing environment
   variables and redeploying.
2. **Scale of the connector catalog.** We (Voyant) will build and maintain
   *first-party* adapters for Voyant Pay, Netopia, Stripe, Adyen, Razorpay,
   and a long tail of country-specific processors — potentially tens of them.
   Bundling every adapter's SDK and code into every Operator build is
   unacceptable bloat, most of it dead weight for any single deployment.

This ADR reconciles both without weakening the trust boundary: the adapter
contract stays the single source of truth, but an adapter **instance** can be
obtained through one of two transports, and a managed deployment can select and
connect a processor at runtime from a first-party catalog.

## Decision

### 1. One contract, two transports

`PaymentAdapter` (`@voyant-travel/payments`) remains **the** contract.
Nothing about the interface changes. What changes is how an implementation is
*obtained*:

| Transport | Used by | Bundled into the Operator |
| --- | --- | --- |
| **In-process** | Self-hosters | The specific `@voyant-travel/<processor>-adapter` npm packages the developer installs (e.g. `@voyant-travel/netopia-adapter`, which already exports a conforming `PaymentAdapter`) |
| **Remote (managed)** | Voyant Cloud tenants | Only a generic `createRemotePaymentAdapter(...)` shim — never any per-processor code or SDK |

Both transports produce a first-party, **trusted** deployment component and are
therefore permitted synchronous checkout participation. The remote transport is
a Voyant-operated adapter reached over a signed, versioned RPC — it is *not* an
installed third-party app, so the remote-app restrictions (no synchronous
checkout, OAuth-only, declarative-only) do not apply.

**Consequence for scale:** adding processor number *N* is "deploy one worker +
publish one registry entry." The Operator bundle does not grow, regardless of
how many processors the catalog offers.

### 2. Provider values and selection

`deployment.providers.payments` gains a new value **`managed`**:

- `managed` — runtime selects the active processor from the database, resolves
  it through the remote transport and the voyant-cloud provider registry. Used
  by Voyant Cloud deployments. Requires a control-plane endpoint + trust token,
  not per-processor secrets.
- `voyant-pay` | `netopia` | `custom` — unchanged. A self-hosted deployment
  pins one in-process adapter and configures it with environment variables, as
  today. `custom` remains for operator-owned adapters that pass the conformance
  kit.
- `none` — unchanged; valid only for deployments without payment-capable graph
  units.

The legacy `voyant-payments` deployment value remains accepted at input
boundaries for existing configurations and is normalized to `voyant-pay` in
canonical deployment output.

Exactly one active adapter per deployment/org is enforced. In `managed` mode
this is a single active configuration row; in the pinned modes it is the graph
selection itself.

### 3. Managed connect: secrets never rest in the Operator

Self-host and managed differ **only** in credential custody:

- **Self-host** brings its own environment variables. No processor credentials
  are stored in the Operator database. The Settings → Payments page renders a
  **read-only** status ("configured via environment") for the pinned provider.
- **Managed credential providers** store credentials in **voyant-cloud,
  encrypted with GCP KMS**, reusing the existing `connect-utils` KMS envelope
  pattern already used for per-org connector credentials (`"integrations"` key
  type, region-scoped EU/US, `{ enc: <ciphertext> }` envelope). The managed
  connect form posts credentials **directly to the voyant-cloud control
  plane** — they are KMS-encrypted at rest there and decrypted by the
  **stateless** processor worker at call time.
- **Managed hosted-account providers** such as Voyant Pay do not ask the
  operator for a processor API key. Voyant Cloud owns the platform Stripe
  credentials and creates an organization-scoped connected account. Settings
  renders short-lived embedded onboarding and account-management sessions
  issued by the control plane. Client/component secrets are ephemeral,
  redacted, never persisted by the Operator, and never treated as proof that
  onboarding completed.

In both managed methods, the Operator database holds only an opaque immutable
connection reference, the active provider id, connection/account status, mode,
and non-secret readiness/requirements projection. Processor credentials and
platform secrets never transit or rest inside the Operator boundary.

This keeps PCI-DSS scope (Req. 3 stored-data protection, Req. 10 audit) on the
voyant-cloud + worker surface we already operate and audit, and keeps key
custody inside GCP KMS rather than in any application environment.

### 4. Provider registry and credential-field schema

The catalog the operator browses is driven by a **provider registry**. Each
entry is a `PaymentProviderDescriptor`:

- `id`, `displayName`, `description`, `logo`;
- `capabilities` (`PaymentAdapterCapabilities`);
- `connectionMethod` (`credentials | embedded_onboarding | read_only`);
- `credentialFieldSchema` — the declarative field list (key, label, kind
  `text | secret | boolean | select`, validation, help text) that renders the
  connect form when `connectionMethod=credentials`; it is empty for hosted
  account onboarding;
- `regions` / `currencies` support hints;
- `availability` (`available` | `coming_soon`) and `modes`
  (`sandbox` | `live`).

- **Managed:** the registry is served by voyant-cloud (the set of operated
  processor workers).
- **Self-host:** locally installed adapters contribute their own descriptor;
  not-yet-installed processors appear as static `coming_soon` placeholders.

The Operator exposes the catalog and connection state under
`/v1/admin/settings/payments/*`.

### 5. Connect flow

1. Settings → Payments shows the catalog (Netopia `available`, Voyant Pay
   `coming_soon` at launch).
2. Operator selects a provider.
3. For `credentials`, Settings renders `credentialFieldSchema`, submits
   directly to voyant-cloud, which KMS-encrypts the payload and asks the
   processor worker to run `adapter.health()`.
4. For `embedded_onboarding`, Settings asks voyant-cloud to begin or resume an
   organization-scoped account connection. Voyant Cloud returns only the
   publishable configuration and a short-lived embedded component secret.
   Settings mounts the approved component. Its client-secret callback mints a
   fresh AccountSession whenever the component asks to refresh; secrets are
   never cached, persisted, logged, or placed in markup or URLs. Browser back,
   abandonment, and resume are supported.
5. A component `onExit`, redirect, or return to Settings never marks the
   connection healthy. Voyant Cloud projects processor account/capability
   state from verified webhooks and canonical retrieval. The registry exposes
   `pending_requirements`, `pending_verification`, `connected`, `restricted`,
   and `error` readiness with non-secret requirement summaries.
6. Only a healthy/readiness-complete result makes the provider active. The
   previous provider is retired as an immutable connection revision, preserving
   the identity required by existing sessions and callbacks.

Voyant Pay must use `embedded_onboarding`; its catalog entry must not
declare a fake API-key credential. It remains `coming_soon` until the cloud
adapter, embedded components, callback transport, sandbox conformance run, and
operational launch gates are complete.

### 5a. Connected is not active — explicit activation

*Connected/ready* and *active/default* are modeled as independent facts. A
deployment may hold several known connections (across providers, or successive
revisions of one provider) each carrying its own lifecycle/readiness, while at
most one is the **active default** used at checkout. Connecting or completing
onboarding does not silently make a connection active.

The contract additions on `@voyant-travel/payments` (all backward compatible —
existing fields and callers are unchanged):

- `PaymentConnectionIdentity { providerId, connectionId }` — the stable identity
  of one connection, structurally aligned with `PaymentProcessorIdentity` so a
  selected connection threads onto initiation/callback events.
- `PaymentConnectionSummary` — a deliberately **non-sensitive** per-connection
  projection: identity, `state`, `readiness` (`ready | not_ready | unknown`),
  `mode`, `active`, non-secret `requirements`, and `readOnly`. It never carries
  credentials, KMS references, or platform tokens.
- `PaymentConnectionStatus` gains optional `activeConnectionId` and
  `connections: PaymentConnectionSummary[]`, so the active default and the list
  of known connections + readiness are reported separately.
- `paymentConnectionReadiness(state)` / `isPaymentConnectionReady(state)` — the
  single readiness rule: only the `connected` lifecycle state is `ready`.
- `PaymentProviderRegistry.activate?(input): PaymentActivationResult` — an
  **optional** method that promotes an already-known, ready connection to the
  active default. `activate` requires an exact `{ providerId, connectionId }`
  identity (never "the provider's latest") and reports success/failure
  explicitly via `ok`; the absence of an error is not success.

The Operator exposes this as `POST /v1/admin/settings/payments/activate`
(validated `{ providerId, connectionId }`), which delegates generically to the
resolved registry.

**Behavior by transport:**

- **Self-host (default registry):** activation is **read-only** and fails closed
  — the processor is pinned via environment variables and there is no second
  connection to promote. The route/registry never reports `ok: true` for a
  switch it did not perform.
- **Managed default (this repo, no live control plane yet):** activation fails
  closed with "not yet available"; the default registry has no authority over
  managed connection records and must not invent an activation.
- **Managed control plane (separate platform repo):** owns the real
  implementation — it enforces the readiness gate server-side (rejecting a
  not-ready connection regardless of any client gating), performs the atomic
  one-active-per-org switch, retires the previous connection as an immutable
  revision (preserving the identity existing sessions/callbacks depend on), and
  returns the updated `PaymentConnectionStatus`. A registry that does not
  implement `activate` is treated as "activation unsupported" and fails closed
  at the route.

Readiness gating is enforced in depth: the UI only offers "Make active" for
ready, inactive, writable connections, and the authoritative registry re-checks
readiness before switching. Client gating is a convenience, never the security
boundary.

### 6. Runtime resolution seam

The existing finance seam is reused unchanged:
`createPaymentAdapterCardPaymentStarter(adapter, { resolveContext })`. In
`managed` mode:

- the active `PaymentAdapter` is a `createRemotePaymentAdapter(...)` instance
  pointed at the selected processor worker;
- `resolveContext` supplies the connection reference (not raw secrets) so the
  worker resolves credentials from KMS on its side.

In pinned self-host mode the adapter is the in-process package and
`resolveContext` defaults to the request env, exactly as today. Checkout
surfaces (flights, trips checkout, payment links, catalog) are unaffected — they
route through the same `CardPaymentStarter`.

### 7. Callbacks

In managed mode the processor's callback URL points at the **processor worker**,
which owns that processor's signature verification, maps the event to the
canonical `PaymentCallbackEvent`, and forwards it — signed with the Operator
trust token — to the Operator's finance callback endpoint, where
`applyPaymentAdapterCallbackEvent(...)` advances the payment-session state
machine. Processor-specific signature code never enters the Operator. In
self-host mode the in-process adapter verifies callbacks locally, as today.

### 8. Processor identity on payment sessions

Managed transports must preserve the actual processor identity separately from
the generic remote adapter id. `@voyant-travel/payments` exposes
`PaymentProcessorIdentity { providerId, connectionId }` on initiation,
operation/status, and callback event contracts. Finance stores `provider` as
the processor provider id and `provider_connection_id` as the opaque managed
connection id on `payment_sessions`.

Managed callback forwarding appends the selected connection reference to the
public payment-link callback as the camel-case `connectionId` query parameter;
the Operator maps that value to `PaymentCallbackRequest.connectionId` before
delegating verification to the selected adapter.

Self-hosted adapters remain compatible: when no processor identity is supplied,
finance records the in-process adapter id as `provider` and leaves
`provider_connection_id` null. Verified callbacks that do supply a processor
identity are rejected before state mutation when the provider id or connection
id conflicts with the stored session identity.

## Non-goals

- Replacing the `PaymentAdapter` interface or finance's ownership of payment
  state. This ADR adds transports, selection/connect surfaces, and additive
  identity fields on the existing contract.
- Making payment processors installable "apps." Payments remain trusted
  deployment adapters per the Remote App Platform RFC.
- Storing processor credentials in the Operator database in any mode. Self-host
  uses environment variables; managed credential providers use voyant-cloud +
  GCP KMS; managed hosted-account providers use platform-owned credentials that
  remain exclusively in voyant-cloud.
- A public/third-party processor marketplace. All adapters are first-party,
  built and maintained by Voyant.
- Multi-processor routing per `PaymentRequest`. One active provider per org for
  now; a `PaymentRouter` remains a future extension.

## Security and compliance

- Managed credentials are encrypted with **GCP KMS** (hardware-backed KEK,
  centralized rotation, per-key IAM, Cloud Audit Logs on every decrypt) via the
  audited `connect-utils` pattern — not app-level symmetric encryption whose key
  would sit in an application environment.
- Hosted-account platform credentials remain exclusively in voyant-cloud.
  Account and component session creation is organization-, environment-, and
  role-scoped. Sensitive embedded component features are authorized on the
  server, not merely hidden in the UI.
- Raw processor credentials are confined to voyant-cloud and the stateless
  workers; the Operator holds only opaque references, shrinking PCI scope.
- Remote transport traffic is signed and versioned; callback forwarding is
  signed with the Operator trust token; SSRF/HTTPS protections apply to all
  outbound worker and control-plane calls.
- Health-check-on-connect prevents marking a misconfigured processor as
  connected.

## Phasing

- **Phase 1 (this branch, `voyant` repo):** this ADR + boundary/architecture doc
  updates; `@voyant-travel/payments` contract additions
  (`PaymentProviderDescriptor`, `PaymentCredentialFieldSchema`, remote-transport
  wire schemas, `createRemotePaymentAdapter` skeleton, a `PaymentProviderRegistry`
  port); Operator payments settings surface (config row: active provider,
  status, mode, connection reference — no secrets; service; `/v1/admin/settings/
  payments/*` routes); Settings → Payments page + i18n (en + ro), with Netopia
  `available` and Voyant Pay `coming_soon`; `managed` provider value in the
  framework deployment types + requirements. The registry/connect calls are
  wired against the `PaymentProviderRegistry` port with a first-party catalog so
  the UI is real; live voyant-cloud wiring is Phase 2.
- **Phase 2 (`voyant-cloud`):** processor worker protocol + first worker
  (Netopia), the provider registry endpoint, KMS-backed credential storage
  reusing `connect-utils`, dispatcher routing, and signed callback forwarding —
  making managed connect function end to end.
- **Phase 3:** the Voyant Pay worker, then Stripe / Adyen / Razorpay and
  country-specific processors as pure worker + registry-entry additions with no
  Operator bundle change.

## Consequences

### Benefits

- Operators connect a processor from the admin UI; no env editing or redeploy.
- Operator bundle size is independent of catalog size.
- One adapter contract and one checkout seam serve both transports.
- Processor credentials stay out of the Operator boundary in managed mode, with
  KMS-grade custody and PCI-scope reduction.
- New processors ship without touching the Operator.

### Costs

- Managed payments introduce a network hop and remote failure modes on the
  checkout path (mitigated by health checks, idempotency, and the existing
  bank-transfer fallback).
- Environment-pinned credentials, managed KMS credentials, and hosted-account
  onboarding must each be maintained and tested.
- voyant-cloud operates the registry, workers, KMS storage, and callback
  forwarding.

## Verification

- Architecture check: no per-processor adapter package is a hard dependency of
  the Operator build in `managed` mode.
- Contract: `createRemotePaymentAdapter(...)` satisfies `paymentAdapterRuntimePort`
  conformance.
- Self-host regression: pinned `netopia` continues to resolve from environment
  variables with no DB credential storage; a fake Voyant Pay API key does
  not invent a hosted-account connection.
- Credential connect flow: selecting a credential provider and submitting valid
  credentials runs `health()` and transitions to `connected`; invalid
  credentials do not.
- One-active-per-org invariant holds across provider switches.
- Callback forwarding is signature-verified end to end.
- Hosted onboarding: the Operator never receives platform credentials; expired
  component sessions fail closed; exit/return does not activate the connection;
  verified account readiness does.
</content>
</invoke>
