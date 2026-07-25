# @voyant-travel/operator-settings

## 0.15.1

### Patch Changes

- @voyant-travel/commerce@0.44.4
- @voyant-travel/finance@0.207.0

## 0.15.0

### Minor Changes

- 5daf427: Add the managed Voyant Payments transport and honest capability contract, hosted
  Stripe Connect onboarding for operators, and scheduled storefront reconciliation.

  Expose typed fail-closed adapter errors and onboarding state, render embedded
  onboarding with the required narrowly scoped security headers, and keep payment
  authorization distinct from completed settlement.

  Expand the public payment-adapter conformance kit across authorize, capture,
  void, refund, and status, with capability and fixture honesty, strict positive
  minor-unit money, typed fail-closed errors, full idempotency conflict checks,
  callback signature and replay semantics, stable processor identity and
  references, manual capture, partial-operation bounds, and typed health
  diagnostics. Add deterministic conforming and deliberately broken fake adapters
  that exercise every contract case.

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/payments@0.7.0
  - @voyant-travel/hono@0.134.6
  - @voyant-travel/finance@0.206.0
  - @voyant-travel/commerce@0.44.3

## 0.14.26

### Patch Changes

- Updated dependencies [58baffe]
  - @voyant-travel/finance@0.205.0
  - @voyant-travel/commerce@0.44.2

## 0.14.25

### Patch Changes

- @voyant-travel/finance@0.204.0
- @voyant-travel/commerce@0.44.1

## 0.14.24

### Patch Changes

- Updated dependencies [17f1239]
  - @voyant-travel/finance@0.203.0
  - @voyant-travel/tools@0.7.0
  - @voyant-travel/commerce@0.44.0

## 0.14.23

### Patch Changes

- @voyant-travel/finance@0.202.0
- @voyant-travel/commerce@0.43.3

## 0.14.22

### Patch Changes

- Updated dependencies [a02a76b]
  - @voyant-travel/tools@0.6.0
  - @voyant-travel/commerce@0.43.2
  - @voyant-travel/finance@0.201.1

## 0.14.21

### Patch Changes

- Updated dependencies [5e03ae7]
  - @voyant-travel/finance@0.201.0
  - @voyant-travel/commerce@0.43.1

## 0.14.20

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/commerce@0.43.0
  - @voyant-travel/core@0.136.0
  - @voyant-travel/db@0.118.5
  - @voyant-travel/finance@0.200.0
  - @voyant-travel/hono@0.134.5
  - @voyant-travel/payments@0.6.5

## 0.14.19

### Patch Changes

- Updated dependencies [3651ff7]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/commerce@0.42.2
  - @voyant-travel/db@0.118.4
  - @voyant-travel/finance@0.199.0
  - @voyant-travel/hono@0.134.4
  - @voyant-travel/payments@0.6.4

## 0.14.18

### Patch Changes

- @voyant-travel/finance@0.198.0
- @voyant-travel/commerce@0.42.1

## 0.14.17

### Patch Changes

- Updated dependencies [b07a0a3]
- Updated dependencies [e44781c]
  - @voyant-travel/core@0.134.0
  - @voyant-travel/finance@0.197.0
  - @voyant-travel/tools@0.5.0
  - @voyant-travel/commerce@0.42.0
  - @voyant-travel/db@0.118.3
  - @voyant-travel/hono@0.134.3
  - @voyant-travel/payments@0.6.3

## 0.14.16

### Patch Changes

- Updated dependencies [78423d3]
- Updated dependencies [58020ec]
- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
- Updated dependencies
  - @voyant-travel/commerce@0.41.0
  - @voyant-travel/finance@0.196.0
  - @voyant-travel/core@0.133.0
  - @voyant-travel/tools@0.4.0
  - @voyant-travel/db@0.118.2
  - @voyant-travel/hono@0.134.2
  - @voyant-travel/payments@0.6.2

## 0.14.15

### Patch Changes

- @voyant-travel/commerce@0.40.6
- @voyant-travel/finance@0.195.0

## 0.14.14

### Patch Changes

- Updated dependencies [dd370ca]
  - @voyant-travel/core@0.132.1
  - @voyant-travel/commerce@0.40.5
  - @voyant-travel/finance@0.194.0

## 0.14.13

### Patch Changes

- @voyant-travel/finance@0.193.0
- @voyant-travel/commerce@0.40.4

## 0.14.12

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/commerce@0.40.3
  - @voyant-travel/db@0.118.1
  - @voyant-travel/finance@0.192.1
  - @voyant-travel/hono@0.134.1
  - @voyant-travel/payments@0.6.1

## 0.14.11

### Patch Changes

- e68a705: Add processor identity to payment adapter contracts and persist managed payment
  connection ids on finance payment sessions. Payment callbacks now reject
  verified provider/connection mismatches, payment-session provider payload and
  metadata updates merge instead of overwrite, duplicate paid callbacks serialize
  under a row lock, and the public payment-link callback/start-card routes accept
  managed `connectionId` callback forwarding, additive refreshed session
  responses, and non-redirect processor continuations.
  Processor callbacks now compare and adopt identities under the payment-session
  row lock, preserve monotonic session states during concurrent delivery, and
  reject callback-routing metadata and return URLs supplied by public clients.
  Provider-neutral cancel and shipping fields flow through the selected adapter
  contract, with processor return and cancel URLs derived from server-owned
  session and deployment configuration.
  Public payment-session reads can refresh provider status through the selected
  adapter while resending the session's pinned processor identity and preserving
  the same locked monotonic transition rules as callbacks. Persisted, uniquely
  fenced leases bound anonymous status polling, and processor session/payment
  references cannot change after they are first pinned. Card initiation now uses
  a single atomic claim so active or ambiguous attempts cannot create duplicate
  processor payments.
- Updated dependencies [e68a705]
  - @voyant-travel/payments@0.6.0
  - @voyant-travel/finance@0.192.0
  - @voyant-travel/commerce@0.40.2

## 0.14.10

### Patch Changes

- Updated dependencies [f6aa3a1]
  - @voyant-travel/finance@0.191.0
  - @voyant-travel/commerce@0.40.1

## 0.14.9

### Patch Changes

- Updated dependencies [228b57d]
- Updated dependencies [f945310]
- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/commerce@0.40.0
  - @voyant-travel/db@0.118.0
  - @voyant-travel/core@0.131.0
  - @voyant-travel/hono@0.134.0
  - @voyant-travel/finance@0.190.0
  - @voyant-travel/payments@0.5.2

## 0.14.8

### Patch Changes

- @voyant-travel/commerce@0.39.25
- @voyant-travel/finance@0.189.0

## 0.14.7

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0
  - @voyant-travel/commerce@0.39.24
  - @voyant-travel/finance@0.188.0

## 0.14.6

### Patch Changes

- @voyant-travel/finance@0.187.0
- @voyant-travel/commerce@0.39.23

## 0.14.5

### Patch Changes

- @voyant-travel/finance@0.186.0
- @voyant-travel/commerce@0.39.22

## 0.14.4

### Patch Changes

- Updated dependencies [e7e90bf]
  - @voyant-travel/finance@0.185.0
  - @voyant-travel/commerce@0.39.21

## 0.14.3

### Patch Changes

- @voyant-travel/finance@0.184.0
- @voyant-travel/commerce@0.39.20

## 0.14.2

### Patch Changes

- Updated dependencies [8d370ef]
  - @voyant-travel/payments@0.5.0
  - @voyant-travel/finance@0.183.0
  - @voyant-travel/commerce@0.39.19

## 0.14.1

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0
  - @voyant-travel/commerce@0.39.18
  - @voyant-travel/finance@0.182.3

## 0.14.0

### Minor Changes

- 225000a: Make the managed payment registry injectable via a runtime port (the framework-idiomatic seam). `@voyant-travel/payments` defines `paymentProviderRegistryRuntimePort`; `@voyant-travel/operator-settings` gains a graph-runtime-factory (`createOperatorSettingsVoyantRuntime`) that resolves the optional port and, when a deployment provides it, registers the resolver into the module container at bootstrap. The Settings → Payments routes resolve the registry from the container per request, else the default self-host registry. This supersedes the earlier request-context injection seam (which could not fire in the opaque managed runtime).

### Patch Changes

- Updated dependencies [225000a]
  - @voyant-travel/payments@0.4.0
  - @voyant-travel/finance@0.182.2

## 0.13.1

### Patch Changes

- @voyant-travel/finance@0.182.0
- @voyant-travel/commerce@0.39.17

## 0.13.0

### Minor Changes

- 0fa5feb: Add a managed payment registry injection seam. The Settings → Payments routes now resolve their `PaymentProviderRegistry` from a deployment-provided resolver on the request context (`PAYMENT_PROVIDER_REGISTRY_RESOLVER_VAR`), falling back to the default self-host registry. A managed deployment injects a registry that brokers to the payments control plane; the routes keep a single API surface and never learn where the managed registry lives.

## 0.12.0

### Minor Changes

- 464815c: Operator base currency setting (the FX recording base).

  Add a base-currency selector to Settings → Operator profile. The value is
  persisted on the Finance operator-settings singleton (`booking_tax_settings`
  gains `base_currency`, `fx_commission_bps`, and `fx_commission_invoice_mention`)
  and provided to Finance through the existing operator-settings runtime port, so
  `GET`/`PATCH /v1/admin/finance/invoice-fx-settings` can now read and write it.
  This is the base every invoice and payment records its `base_*_cents` FX
  snapshot against, and the currency reporting consolidates into. Includes the
  en/ro catalog copy for the new section.

### Patch Changes

- Updated dependencies [464815c]
- Updated dependencies [464815c]
  - @voyant-travel/finance@0.181.0
  - @voyant-travel/commerce@0.39.16

## 0.11.0

### Minor Changes

- c2ca4a3: Add a Settings → Payments surface where operators browse first-party payment
  processors and connect one (single active provider per org). Introduces the
  payment provider catalog + credential-field schema + registry port and a remote
  adapter transport in `@voyant-travel/payments`, a `payment_provider_config`
  table, service, and `/v1/admin/settings/payments/*` routes in
  `@voyant-travel/operator-settings`, the Payments settings page in
  `@voyant-travel/operator-settings-react`, the `managed` payments provider value
  in the framework deployment graph, and en/ro catalog strings. Self-host
  deployments configure their processor via environment variables (read-only in
  the UI); managed connect brokering lands in a follow-up.

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/payments@0.3.0
  - @voyant-travel/finance@0.180.1
  - @voyant-travel/db@0.117.1

## 0.10.11

### Patch Changes

- @voyant-travel/finance@0.180.0
- @voyant-travel/commerce@0.39.15

## 0.10.10

### Patch Changes

- @voyant-travel/finance@0.179.0
- @voyant-travel/commerce@0.39.14

## 0.10.9

### Patch Changes

- @voyant-travel/finance@0.178.0
- @voyant-travel/commerce@0.39.13

## 0.10.8

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/commerce@0.39.12
  - @voyant-travel/finance@0.177.0
  - @voyant-travel/hono@0.131.2

## 0.10.7

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0
  - @voyant-travel/commerce@0.39.11
  - @voyant-travel/finance@0.176.0
  - @voyant-travel/hono@0.131.1

## 0.10.6

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/commerce@0.39.10
  - @voyant-travel/finance@0.175.0

## 0.10.5

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/finance@0.174.0
  - @voyant-travel/commerce@0.39.9
  - @voyant-travel/db@0.114.15
  - @voyant-travel/hono@0.130.1

## 0.10.4

### Patch Changes

- @voyant-travel/finance@0.173.0
- @voyant-travel/commerce@0.39.8

## 0.10.3

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/core@0.128.0
  - @voyant-travel/finance@0.172.0
  - @voyant-travel/hono@0.130.0
  - @voyant-travel/commerce@0.39.7
  - @voyant-travel/db@0.114.14

## 0.10.2

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0
  - @voyant-travel/commerce@0.39.6
  - @voyant-travel/finance@0.171.1

## 0.10.1

### Patch Changes

- Updated dependencies [d2d7384]
  - @voyant-travel/finance@0.171.0
  - @voyant-travel/commerce@0.39.5

## 0.10.0

### Minor Changes

- 117fa05: Generate managed-deployment contracts from operator-authored default templates and number series without deployment-specific workflows. Add reusable light- and dark-mode horizontal logo and icon assets to Operator Profile, expose them to contract templates, and provide accessible drag-and-drop upload controls. Introduce a shared document-renderer port and zero-code HTTP adapter so managed deployments can use a private platform renderer while self-hosters can swap in their own renderer for contracts and brochures.

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/commerce@0.39.4
  - @voyant-travel/db@0.114.13
  - @voyant-travel/finance@0.170.0
  - @voyant-travel/hono@0.128.6

## 0.9.2

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/commerce@0.39.3
  - @voyant-travel/db@0.114.11
  - @voyant-travel/finance@0.169.2
  - @voyant-travel/hono@0.128.4

## 0.9.1

### Patch Changes

- Updated dependencies [590d256]
  - @voyant-travel/finance@0.169.0
  - @voyant-travel/commerce@0.39.2

## 0.9.0

### Minor Changes

- 158c3a0: Move the finance tax-settings admin surface and drop the operator FX reference-source setting.

  - **Tax settings moved to the finance surface.** `GET`/`PATCH /tax-settings`
    now serve from `/v1/admin/finance/tax-settings` instead of
    `/v1/admin/bookings/tax-settings`. On the managed operator runtime admin
    routes dispatch per-unit with prefix-first-match, so the bookings package's
    `GET /{id}` route was capturing `/tax-settings` (id = "tax-settings") and
    returning 404 — leaving the Settings → Invoicing controls permanently
    disabled. The booking-tax extension now splits into two separate
    extensions — `finance.booking-tax-settings-extension` (module `finance`,
    the `GET`/`PATCH tax-settings` routes on `mount: "finance"`) and
    `finance.booking-tax-preview-extension` (module `bookings`, the
    `POST /v1/admin/bookings/tax-preview` route, where it does not collide and
    `bookings-react` consumes it). They must be distinct extensions because the
    selected-graph composition yields one composed extension per `defineExtension`
    (keyed on localId); collapsing both facets into one extension dropped the
    preview route. The operator standard distribution registers both, attributing
    settings to finance + operator-settings and preview to finance + bookings.
  - **Operator FX reference-source setting removed.** The FX reference _source_
    is not an operator choice: Voyant Cloud serves managed FX by default,
    self-hosters supply their own adapter through the `finance.fx-reference.runtime`
    port, and for jurisdictions like RO the source (BNR) is legally mandated. The
    operator-facing "Reference exchange rates" control, the `fxReferenceSource`
    field on the tax-settings surface, and the `fx_reference_source` column are
    removed (additive drop migration). The `finance.fx-reference.runtime` port and
    its `resolveReferenceRate` helper are kept as the self-host/managed adapter
    seam; the source is now the host adapter's own and reported only as an output
    label on the returned rate.

### Patch Changes

- Updated dependencies [158c3a0]
  - @voyant-travel/finance@0.168.0
  - @voyant-travel/commerce@0.39.1

## 0.8.0

### Minor Changes

- ca3713e: Scope the operator invoicing mode to the deferred bank-transfer payment path.

  Payment method now determines the document flow. Card payments always issue the fiscal invoice at checkout finalize and never consult `invoicing.mode`. Bank transfer (deferred payment) is the configurable path: `proforma-first` (now the default, matching the platform's historical behaviour) issues a proforma at order placement and mints the fiscal invoice on settlement; `direct` issues the fiscal invoice at order placement and collects the transfer against it.

  The mode consult that PR #3462 added to the checkout finalize saga is removed — finalize once again always issues the fiscal invoice (or converts an existing proforma). The mode is instead wired at the bank-transfer issuance site, and its default flips from `direct` to `proforma-first` (schema default, normalization, and an additive migration that also backfills existing rows). The finance proforma-conversion subscriber no longer gates on the mode: any fully-paid proforma converts, which is correct in every mode and avoids stranding a proforma left outstanding across a mode switch.

### Patch Changes

- Updated dependencies [ca3713e]
  - @voyant-travel/commerce@0.39.0
  - @voyant-travel/finance@0.167.0

## 0.7.0

### Minor Changes

- 3062a73: Add an operator-configurable official FX reference-rate source and a dedicated
  Invoicing settings page.

  A new finance operator setting `fx.referenceSource` (`ecb` | `bnr`, default
  `ecb`) lives on the finance operator-settings row, is normalized on read, exposed
  through the finance operator-settings runtime port, and surfaced on the
  `/tax-settings` admin GET/PATCH schema.

  Finance also gains a `finance.fx-reference.runtime` port plus a typed
  `resolveReferenceRate({ base, quote, date })` helper that reads the operator's
  configured source and delegates to a host-provided implementation; hosts wire it
  to their own FX data source. When no provider is wired, an explicit reference-rate
  request throws a typed `FinanceFxReferenceSourceUnavailableError`. No existing
  invoice math is wired to it — this ships the setting and seam only, with zero
  behaviour change for existing deployments.

  Invoicing configuration moves off the Taxes settings page onto a new dedicated
  **Invoicing** settings page (registered in the admin settings navigation the same
  way Taxes is). The invoicing-mode section moves there and the new reference-rate
  Select is added alongside it (EN + RO); both read/write the shared `/tax-settings`
  surface. The Taxes page returns to purely tax content.

### Patch Changes

- Updated dependencies [c3bdcbc]
- Updated dependencies [3062a73]
- Updated dependencies [926ea47]
  - @voyant-travel/commerce@0.38.0
  - @voyant-travel/finance@0.166.0

## 0.6.0

### Minor Changes

- d6a9973: Add proforma-first invoicing as standard finance behaviour. A new operator
  setting `invoicing.mode` (`direct` | `proforma-first`, default `direct`) lives on
  the finance operator-settings row and is exposed through the finance
  operator-settings runtime port. In `proforma-first` mode the finance
  proforma-conversion subscriber automatically mints the fiscal invoice from a
  proforma once it is fully settled (`invoice.settled` / `invoice.payment.recorded`),
  copying lines, assigning the fiscal number, linking both documents, and voiding
  the proforma. The admin invoices list shows a proforma kind badge and the tax
  settings page exposes the invoicing-mode toggle. Fiscal-provider sync stays in
  plugins. `direct` mode is unchanged — zero behaviour change for existing
  deployments.

### Patch Changes

- Updated dependencies [d6a9973]
  - @voyant-travel/finance@0.165.0
  - @voyant-travel/commerce@0.37.3

## 0.5.2

### Patch Changes

- @voyant-travel/commerce@0.37.2
- @voyant-travel/finance@0.164.0

## 0.5.1

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/core@0.125.0
  - @voyant-travel/finance@0.163.0
  - @voyant-travel/commerce@0.37.1
  - @voyant-travel/db@0.114.9
  - @voyant-travel/hono@0.128.1

## 0.5.0

### Minor Changes

- 8f0fa26: Make Hono the explicit sole server API runtime while moving package and
  deployment interfaces to role-based API vocabulary. Replace Hono-prefixed module,
  extension, bundle, lazy-route, and factory names with `Api*` names; move
  router-named domain runtime entry points to `./api-runtime`; and remove the old
  names without compatibility aliases.

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/commerce@0.37.0
  - @voyant-travel/finance@0.162.0
  - @voyant-travel/hono@0.128.0
  - @voyant-travel/db@0.114.8

## 0.4.1

### Patch Changes

- Updated dependencies [85bfe2c]
- Updated dependencies [a1842a7]
  - @voyant-travel/finance@0.161.0
  - @voyant-travel/hono@0.127.2
  - @voyant-travel/commerce@0.36.1

## 0.4.0

### Minor Changes

- 54be000: Expose framework-owned read and guarded update Tools for the combined operator settings aggregate through the selected MCP runtime.

### Patch Changes

- Updated dependencies [cabf662]
- Updated dependencies [701ccc4]
- Updated dependencies [7ac40a0]
- Updated dependencies [372f4f4]
- Updated dependencies [a2fd806]
- Updated dependencies [b8cef4c]
- Updated dependencies [db5adce]
- Updated dependencies [c9b6144]
- Updated dependencies [6604f9e]
- Updated dependencies [ff87f68]
  - @voyant-travel/core@0.124.0
  - @voyant-travel/tools@0.3.0
  - @voyant-travel/finance@0.160.0
  - @voyant-travel/commerce@0.36.0
  - @voyant-travel/db@0.114.7
  - @voyant-travel/hono@0.127.1

## 0.3.14

### Patch Changes

- Updated dependencies [7e9f77a]
- Updated dependencies [49f55d0]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0
  - @voyant-travel/hono@0.127.0
  - @voyant-travel/finance@0.159.0
  - @voyant-travel/commerce@0.35.9
  - @voyant-travel/db@0.114.6

## 0.3.13

### Patch Changes

- 73ab096: Standardize first-party packages on package-owned deployment manifests, provider selection,
  access metadata, concrete event contracts, selected admin navigation, and published runtime
  references. Add Bookings Extras as an independently selected graph unit and remove the central
  admin navigation catalog.
  Link facets now distinguish entity `linkable` metadata from executable `definition` exports, and
  generated Node registries reject malformed definitions before service registration.
  Provider-owned required config and secrets now apply only when that provider is selected, so
  local and in-memory deployments do not require credentials for inactive remote providers.
- Updated dependencies [73ab096]
  - @voyant-travel/commerce@0.35.8
  - @voyant-travel/core@0.122.2
  - @voyant-travel/db@0.114.5
  - @voyant-travel/finance@0.158.0

## 0.3.12

### Patch Changes

- @voyant-travel/finance@0.157.0
- @voyant-travel/commerce@0.35.7

## 0.3.11

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [8d62a7c]
  - @voyant-travel/core@0.122.1
  - @voyant-travel/db@0.114.4
  - @voyant-travel/commerce@0.35.6
  - @voyant-travel/finance@0.156.1
  - @voyant-travel/hono@0.126.3

## 0.3.10

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/finance@0.156.0
  - @voyant-travel/commerce@0.35.5
  - @voyant-travel/db@0.114.3

## 0.3.9

### Patch Changes

- Updated dependencies [cc85042]
- Updated dependencies [07a6ee3]
  - @voyant-travel/core@0.122.0
  - @voyant-travel/db@0.114.2
  - @voyant-travel/finance@0.155.1
  - @voyant-travel/hono@0.126.2
  - @voyant-travel/commerce@0.35.3

## 0.3.8

### Patch Changes

- Updated dependencies [3f6694b]
  - @voyant-travel/core@0.121.0
  - @voyant-travel/commerce@0.35.2
  - @voyant-travel/db@0.114.1
  - @voyant-travel/finance@0.155.0
  - @voyant-travel/hono@0.126.1

## 0.3.7

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [bef5b7c]
  - @voyant-travel/hono@0.126.0
  - @voyant-travel/db@0.114.0
  - @voyant-travel/finance@0.154.0
  - @voyant-travel/core@0.120.0
  - @voyant-travel/commerce@0.35.1

## 0.3.6

### Patch Changes

- 490d132: Move Commerce runtime composition from the Operator starter into statically selected package contributors and typed domain ports.
- 490d132: Move runtime construction into BOM-selected domain contributors and replace the Finance target package with typed graph ports while keeping package dependencies acyclic.
- 490d132: Move Operator Settings and Relationships admin presentation authority into selected package graph factories.
- 490d132: Move platform and operations OpenAPI authority into the owning package manifests and publish their committed documents from package-local exports.
- 490d132: Make package and project declarations the sole selected access authority, removing legacy catalog overlays and runtime synthesis.
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
  - @voyant-travel/commerce@0.35.0
  - @voyant-travel/finance@0.153.0
  - @voyant-travel/db@0.113.0
  - @voyant-travel/core@0.119.0
  - @voyant-travel/hono@0.125.1

## 0.3.5

### Patch Changes

- Updated dependencies [60b1970]
- Updated dependencies [977c1bd]
- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [8f537b0]
- Updated dependencies [d26a820]
- Updated dependencies [d771be3]
- Updated dependencies [bd7a830]
  - @voyant-travel/finance@0.152.0
  - @voyant-travel/core@0.118.0
  - @voyant-travel/hono@0.125.0
  - @voyant-travel/db@0.112.2

## 0.3.4

### Patch Changes

- Updated dependencies [1081483]
- Updated dependencies [c66f9a5]
  - @voyant-travel/finance@0.151.4
  - @voyant-travel/core@0.117.0
  - @voyant-travel/db@0.112.1
  - @voyant-travel/hono@0.124.1

## 0.3.3

### Patch Changes

- Updated dependencies [ca90eb5]
  - @voyant-travel/db@0.112.0
  - @voyant-travel/hono@0.124.0
  - @voyant-travel/finance@0.151.3

## 0.3.2

### Patch Changes

- Updated dependencies [8576451]
  - @voyant-travel/core@0.116.0
  - @voyant-travel/db@0.111.2
  - @voyant-travel/finance@0.151.2
  - @voyant-travel/hono@0.123.2

## 0.3.1

### Patch Changes

- Updated dependencies [e4e6621]
- Updated dependencies [953e418]
- Updated dependencies [2153e48]
  - @voyant-travel/core@0.115.0
  - @voyant-travel/finance@0.151.1
  - @voyant-travel/hono@0.123.0
  - @voyant-travel/db@0.111.1

## 0.3.0

### Minor Changes

- a370024: Publish package-owned deployment manifests for action ledger, notifications,
  operator settings, and realtime.
- e3dc5a9: Declare package-owned Node application resources, providers, configuration, secrets, events, subscribers, access, and retain-data lifecycle metadata in deployment manifests.

### Patch Changes

- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/core@0.114.0
  - @voyant-travel/finance@0.151.0
  - @voyant-travel/db@0.111.0
  - @voyant-travel/hono@0.122.4

## 0.2.35

### Patch Changes

- @voyant-travel/finance@0.150.0
- @voyant-travel/db@0.110.2
- @voyant-travel/hono@0.122.3

## 0.2.34

### Patch Changes

- 5e1d221: Publish `voyant.package.v1` compatibility metadata from first-party
  schema-owning packages so deployment graph package admission can validate their
  framework, target, and deployment-mode compatibility before runtime imports.
- Updated dependencies [5e1d221]
- Updated dependencies [682d7d0]
  - @voyant-travel/db@0.110.1
  - @voyant-travel/finance@0.149.1
  - @voyant-travel/hono@0.122.2

## 0.2.33

### Patch Changes

- @voyant-travel/finance@0.149.0

## 0.2.32

### Patch Changes

- @voyant-travel/finance@0.148.0

## 0.2.31

### Patch Changes

- @voyant-travel/finance@0.147.0

## 0.2.30

### Patch Changes

- @voyant-travel/finance@0.146.0

## 0.2.29

### Patch Changes

- @voyant-travel/finance@0.145.0

## 0.2.28

### Patch Changes

- @voyant-travel/finance@0.144.0

## 0.2.27

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/db@0.110.0
  - @voyant-travel/hono@0.122.0
  - @voyant-travel/finance@0.143.0

## 0.2.26

### Patch Changes

- @voyant-travel/finance@0.142.0

## 0.2.25

### Patch Changes

- @voyant-travel/finance@0.141.0

## 0.2.24

### Patch Changes

- @voyant-travel/finance@0.140.0

## 0.2.23

### Patch Changes

- Updated dependencies [c9a356f]
- Updated dependencies [fc71db1]
- Updated dependencies [fc71db1]
- Updated dependencies [6474f42]
- Updated dependencies [5786f63]
  - @voyant-travel/hono@0.121.0
  - @voyant-travel/finance@0.139.0
  - @voyant-travel/db@0.109.5

## 0.2.22

### Patch Changes

- Updated dependencies [1cb9cba]
- Updated dependencies [131ff9b]
  - @voyant-travel/hono@0.120.0
  - @voyant-travel/finance@0.138.8

## 0.2.21

### Patch Changes

- Updated dependencies [141bd2b]
- Updated dependencies [86fbb05]
  - @voyant-travel/finance@0.138.7
  - @voyant-travel/hono@0.119.0

## 0.2.20

### Patch Changes

- @voyant-travel/finance@0.138.0

## 0.2.19

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/hono@0.118.0
  - @voyant-travel/finance@0.137.1

## 0.2.18

### Patch Changes

- Updated dependencies [7c5ee80]
  - @voyant-travel/hono@0.117.0
  - @voyant-travel/finance@0.137.0

## 0.2.17

### Patch Changes

- Updated dependencies [293e5e4]
  - @voyant-travel/hono@0.116.1
  - @voyant-travel/db@0.109.2
  - @voyant-travel/finance@0.136.0

## 0.2.16

### Patch Changes

- @voyant-travel/db@0.109.1
- @voyant-travel/finance@0.135.0

## 0.2.15

### Patch Changes

- Updated dependencies [684b321]
- Updated dependencies [2542715]
  - @voyant-travel/hono@0.116.0
  - @voyant-travel/finance@0.134.1

## 0.2.14

### Patch Changes

- Updated dependencies [04b257c]
- Updated dependencies [78c15fa]
- Updated dependencies [51f7dea]
  - @voyant-travel/hono@0.115.0
  - @voyant-travel/finance@0.134.0

## 0.2.13

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/hono@0.114.0
  - @voyant-travel/db@0.109.0
  - @voyant-travel/finance@0.133.0

## 0.2.12

### Patch Changes

- @voyant-travel/finance@0.132.0

## 0.2.11

### Patch Changes

- Updated dependencies [021ec00]
  - @voyant-travel/hono@0.113.0
  - @voyant-travel/finance@0.131.2
  - @voyant-travel/db@0.108.5

## 0.2.10

### Patch Changes

- @voyant-travel/finance@0.131.0

## 0.2.9

### Patch Changes

- @voyant-travel/finance@0.130.0

## 0.2.8

### Patch Changes

- @voyant-travel/finance@0.129.0

## 0.2.7

### Patch Changes

- @voyant-travel/finance@0.128.0

## 0.2.6

### Patch Changes

- @voyant-travel/finance@0.127.0

## 0.2.5

### Patch Changes

- 1841ce2: D.2 slice 1 (batch 2) — 14 more packages own + ship their migration history (db, relationships, quotes, identity, distribution, inventory, commerce, catalog, finance, notifications, legal, storefront, charters, cruises). Each baseline reproduces the framework bundle's tables column-for-column, and all package sources now apply together (fresh-D.2 union) without collision.

  Shared enums: the codebase inlines copies of some enums to avoid cross-package schema imports (e.g. `service_type` in distribution + inventory, `entity_type` in relationships + quotes). Per-package generation would emit duplicate `CREATE TYPE`, colliding on a fresh D.2 database. All package migrations now wrap `CREATE TYPE … AS ENUM(…)` in an idempotent `DO`-block guard (subset-safe; whichever source applies first creates the type, the rest no-op). The db package additionally owns the shared Postgres extensions (pg_trgm / unaccent) that downstream trigram indexes need on a fresh D.2 database (the retired bundle injected them; per-package sources did not). The batch-1 packages (operator-settings, action-ledger, workflow-runs, trips) get the same guard for uniformity. No runtime change. See `docs/architecture/migration-collector-d2.md`.

- Updated dependencies [1841ce2]
  - @voyant-travel/db@0.108.4
  - @voyant-travel/finance@0.126.1

## 0.2.4

### Patch Changes

- @voyant-travel/finance@0.126.0

## 0.2.3

### Patch Changes

- e89640b: D.2 slice 1 — these packages now own and ship their migration history. Each gains a `drizzle.migrations.config.ts`, a `db:generate` script, and a generated `migrations/` folder (baseline) included in the published tarball (`files`). A D.2 deployment collects each package's folder as its migration source; existing D.1 databases import-baseline the bundle-covered baseline. No runtime behavior change. See `docs/architecture/migration-collector-d2.md`.

## 0.2.2

### Patch Changes

- @voyant-travel/db@0.108.3
- @voyant-travel/finance@0.125.0
- @voyant-travel/hono@0.112.2

## 0.2.1

### Patch Changes

- @voyant-travel/hono@0.112.1
- @voyant-travel/finance@0.124.0

## 0.2.0

### Minor Changes

- 6d75244: New package `@voyant-travel/operator-settings` — the operator-tenant settings domain (profile + payment instructions/defaults + booking-tax configuration). Owns the 5 tables (`./schema`, TypeID prefixes `opst/oppf/opin/opdp/btxs` unchanged) + the transport-agnostic readers/writers/validation (`./service`).

  This is Stage 1 of the Workstream B step-4 extraction (see `docs/architecture/operator-settings-extraction.md`): the schema + data access move from the operator starter into a standard package, wired via `voyant.config` `additionalSchemas` (folded into the deployment's single combined migration history — no new migration; tables are byte-identical and already in snapshot 0067). The deployment's runtime wiring imports the readers directly from the package; `src/api/routes/settings.ts` keeps only the HTTP layer. The package is `additionalSchemas`-only (not a mounted module), so it stays out of the runtime/BOM lockstep set.

- cc82783: Promote `@voyant-travel/operator-settings` to a standard mounted module (Workstream B step 4, Stage 2b — completes the extraction).

  - The package gains a HonoModule: `./hono-module` (`createOperatorSettingsHonoModule()`, lazyRoutes at the stable absolute paths `/v1/admin/settings/*`, `/v1/public/operator-profile`, `/v1/public/settings/operator`) + `./routes` (the handlers). New deps: `@voyant-travel/hono` + `hono`.
  - It moves from `voyant.config` `additionalSchemas` → `modules`, so it joins the runtime/BOM **lockstep set (16 → 17)** and is added to the framework BOM `dependencies`. `FRAMEWORK_RUNTIME_MANIFEST` + `frameworkComposition` own its factory.
  - The deployment drops `operator/operator-settings` from `deploymentLocalModules` (now only `invitations` remains) and **deletes** `src/api/routes/settings.ts` — the settings routes are package-owned.

  Migration parity holds (schema byte-identical, already in snapshot 0067; `additionalSchemas`→`modules` only changes the schema's position in the drizzle list, not its DDL). Composed module/extension counts are unchanged (29 / 34 / 15) — the module just moved framework-owned. `check-public-cache-policy` updated to the package's new routes path.

### Patch Changes

- Updated dependencies [a3bd51c]
- Updated dependencies [e9d9dbb]
- Updated dependencies [d222e9f]
  - @voyant-travel/hono@0.112.0
  - @voyant-travel/finance@0.123.0
  - @voyant-travel/db@0.108.2
