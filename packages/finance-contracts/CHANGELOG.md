# @voyant-travel/finance-contracts

## 0.111.0

### Minor Changes

- d98648a: An embedded checkout handoff now survives from the adapter to the page that
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

## 0.110.0

### Minor Changes

- 9f412dd: Add the Booking Platform v1 action projection: authoritative Catalog, Finance,
  and Legal obligation readers, an Operations work queue with deterministic
  incremental and rebuild jobs, a redacted storefront next-action API, explicit
  Payment Schedule timezones, and reminder scheduling from projected deadlines.

### Patch Changes

- Updated dependencies [9f412dd]
- Updated dependencies [2ed62d3]
  - @voyant-travel/schema-kit@0.118.0

## 0.109.1

### Patch Changes

- Updated dependencies [15c1c64]
  - @voyant-travel/schema-kit@0.117.0

## 0.109.0

### Minor Changes

- 2601445: Continue owned Product Booking Session Commit through an idempotent pre-Booking
  Finance payment session, selected payment adapter, and atomic transfer to the
  created Booking. Expose typed payment-required continuation and recovery through
  the shared route contract, Storefront SDK, and React hooks.

### Patch Changes

- Updated dependencies [5d3b563]
- Updated dependencies [f25ad34]
  - @voyant-travel/schema-kit@0.116.1

## 0.108.1

### Patch Changes

- Updated dependencies [e65bd25]
  - @voyant-travel/schema-kit@0.116.0

## 0.108.0

### Minor Changes

- c30b6b0: Remove the `drizzle-orm` dependency from `@voyant-travel/finance-contracts`.

  `FinanceAppApiRuntime` took a concrete `PostgresJsDatabase` for a handle it only
  ever passes through — it never calls a method on it — which forced a Drizzle
  dependency into a package ADR-0002 requires to stay dependency-light. The handle
  is now a type parameter, `FinanceAppApiRuntime<TDatabase = unknown>`, and the
  implementing runtimes instantiate it as
  `FinanceAppApiRuntime<PostgresJsDatabase>`.

  Consumers that write the bare `FinanceAppApiRuntime` still compile; the handle
  resolves to `unknown` for them, so an implementer relying on the previous
  implicit `PostgresJsDatabase` should instantiate the parameter explicitly.

## 0.107.3

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/schema-kit@0.115.0

## 0.107.2

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

## 0.107.1

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/schema-kit@0.114.0

## 0.107.0

### Minor Changes

- d2d7384: Expose provider-neutral finance issuance hydration, external-reference writeback,
  and invoice/proforma issuance webhooks through the remote App API boundary.

## 0.106.2

### Patch Changes

- Updated dependencies [52352c4]
  - @voyant-travel/schema-kit@0.113.0

## 0.106.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
  - @voyant-travel/schema-kit@0.112.1

## 0.106.0

### Minor Changes

- bbe6396: Replace the overloaded Finance voucher domain with Travel Credits across the
  database schema, APIs, package exports, booking inputs, storefront settings,
  and operator UI. Redemption commands are replay-safe, codes are normalized and
  case-insensitively unique, and legacy records migrate in place without silently
  skipping invalid balances. Keep Promotion Codes in Commerce and move Bookings
  fulfillment to the explicit Service Voucher vocabulary.

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/schema-kit@0.112.0

## 0.105.9

### Patch Changes

- bcd76ae: Reject invalid or dangling pricing and tax reference-data before writing.
  `POST /v1/admin/pricing/price-schedules` now rejects a nonexistent
  `priceCatalogId` with a deterministic `invalid_reference` 400 instead of a 500.
  Tax regime rates are bounded to the 0..100 percent domain (matching the
  booking-tax calculator that divides by 100), and `POST
/v1/admin/finance/tax-policy-rules` rejects dangling `profileId`/`taxRegimeId`
  references with an `invalid_reference` 400 (mirroring the existing tax-class
  regime guard).

## 0.105.8

### Patch Changes

- 3fc4487: Reject invalid booking-item finance subresource states: negative tax-line amounts, incomplete commission value bases, paid commissions without paid metadata, and deletion of active booking guarantees.
- aa0135c: Reject zero-value payment authorization and payment capture requests in payment-processing validation.
- 51003c6: Expose booking voucher redemptions in booking-scoped payment reads as voucher payment rows.

## 0.105.7

### Patch Changes

- d1b4da2: Preserve proforma conversion linkage while checkout finalization issues final invoices so invoice-issued subscribers can convert existing provider estimates instead of creating standalone invoices.

## 0.105.6

### Patch Changes

- 7bdd9cc: Honor `active=false` tax-class list filters and reject tax classes that reference unknown tax regimes.

## 0.105.5

### Patch Changes

- 5d94caa: Republish the validation entrypoints with the payment-processing body schema exports required by finance routes.

## 0.105.4

### Patch Changes

- Updated dependencies [722455d]
  - @voyant-travel/schema-kit@0.111.0

## 0.105.3

### Patch Changes

- Updated dependencies [06cfcf5]
  - @voyant-travel/schema-kit@0.110.0

## 0.105.2

### Patch Changes

- Updated dependencies [787c852]
  - @voyant-travel/schema-kit@0.109.0

## 0.105.1

### Patch Changes

- Updated dependencies [924d201]
- Updated dependencies [f311826]
  - @voyant-travel/schema-kit@0.108.0

## 0.105.0

### Minor Changes

- 51f7dea: Share one list-response contract instead of per-module copies (voyant#2109).

  `@voyant-travel/types` now owns the canonical offset-paginated list envelope: the `ListResponse<T>` type + `listResponse(data, { total, limit, offset })` builder, plus the zod `paginationSchema` (coerced `limit` 1–200 default 50, `offset` ≥0 default 0) and the `listResponseSchema(item)` factory. Both server services and `*-react` clients import from this single source.

  Server side: every module's local `paginate()` / inline `{ data, total, limit, offset }` construction now routes through the shared `listResponse` builder, and the count read is standardized on `count` internally — fixing the drift where finance, notifications and the legal contracts/policies services read `countResult[0]?.total` while every other module read `countResult[0]?.count` (their `count(*)` selects were aliased `total`; they are now aliased `count`). The returned shape is byte-for-byte identical.

  Client side: the ~23 copied `paginatedEnvelope` zod schemas across the `*-react` packages are replaced by re-exporting the shared `listResponseSchema` factory under the same `paginatedEnvelope` name, so consumers are unchanged.

  Input alignment: `finance-contracts` and `legal-contracts` pagination `limit` caps were raised from `.max(100)` to `.max(200)` to match the framework-wide max.

  Additive and non-breaking.

## 0.104.7

### Patch Changes

- Updated dependencies [b68d6a7]
  - @voyant-travel/schema-kit@0.107.0

## 0.104.6

### Patch Changes

- Updated dependencies [a74471e]
  - @voyant-travel/schema-kit@0.106.0

## 0.104.5

### Patch Changes

- 9e970a5: Move checkout collection orchestration and React payment collection surfaces
  behind Finance owner paths. The old Checkout workspace packages are removed
  from the v1 branch while payment plugins, storefront SDK helpers, and the
  operator starter retarget Finance checkout interfaces.
- b711b04: Reject generic payment `orderId` request fields and keep legacy order references behind explicit `legacyOrderId` targets.
- Updated dependencies [e80e3d3]
  - @voyant-travel/schema-kit@0.105.3

## 0.104.4

### Patch Changes

- Updated dependencies [d1ad572]
- Updated dependencies [d1ad572]
  - @voyant-travel/schema-kit@0.105.0

## 0.104.3

### Patch Changes

- b19888a: Make invoice payment recording idempotent with optional request keys and stable server-derived replay keys.

## 0.104.2

### Patch Changes

- cfa6af8: feat(finance): accounts-payable supplier invoices, profitability & end-to-end FX

  Adds the full accounts-payable vertical for #1506:

  - **Supplier invoices (AP)**: `supplier_invoices` / `supplier_invoice_lines` /
    `supplier_cost_allocations`, the `supplierInvoicesService` (create/update/
    setLines/setAllocations/payments), attachments, and admin API routes.
  - **Cost allocation**: two-step product → departure picker, configurable cost
    categories (managed under Settings), searchable comboboxes.
  - **Profitability**: per-departure / per-product / per-traveller P&L read model
    - dashboards, cost-by-category breakdown, charts, CSV export.
  - **Accountant share portal**: scoped, revocable token links (no login) exposing
    financials + client/supplier invoices with downloadable attachments, ZIP
    download, and an en/ro language switcher.
  - **End-to-end FX**: supplier invoices and cost allocations snapshot their
    accounting-base value at the FX rate effective on the issue date; the
    profitability rollup sums those recorded snapshots (per-transaction-date
    rates) instead of re-valuing aggregates at the latest rate.

  Supporting additive exports: `availability`/`bookings`/`suppliers` schema and
  linkable exports consumed by the finance read model, and new TypeID prefixes in
  `schema-kit`.

- Updated dependencies [cfa6af8]
  - @voyant-travel/schema-kit@0.104.2

## 0.104.1

### Patch Changes

- @voyant-travel/schema-kit@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/schema-kit@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/schema-kit@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/schema-kit@0.102.0

## 0.101.2

### Patch Changes

- 577eaf5: Republish finance and legal contract packages with the next release so exact internal package dependencies resolve from the public registry.
- Updated dependencies [577eaf5]
  - @voyant-travel/schema-kit@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/schema-kit@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/schema-kit@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/schema-kit@0.100.0

## 0.99.0

### Patch Changes

- @voyant-travel/schema-kit@0.99.0

## 0.98.0

### Patch Changes

- @voyant-travel/schema-kit@0.98.0

## 0.97.0

### Minor Changes

- 7094c8e: Add `@voyant-travel/schema-kit` and extend the `*-contracts` pattern to the
  operational modules.

  `@voyant-travel/schema-kit` (pure: zod + typeid-js) is the new foundational home for
  schema primitives shared by the runtime and the contract packages — the TypeID
  system (prefix registry, id generation, zod validators), `booleanQueryParam`,
  and `kmsEnvelopeSchema`. These moved out of `@voyant-travel/db` (which now re-exports
  them from their original paths, so every call-site is unchanged) so they sit
  below the data layer and the contract packages can depend on them without
  pulling Drizzle.

  New zod-only contract packages own each module's validation surface (schemas +
  enums): `@voyant-travel/bookings-contracts`, `@voyant-travel/finance-contracts`,
  `@voyant-travel/crm-contracts`, `@voyant-travel/transactions-contracts`,
  `@voyant-travel/suppliers-contracts`, `@voyant-travel/identity-contracts`, and
  `@voyant-travel/legal-contracts`. Each runtime module re-exports from its contracts
  package, so existing `@voyant-travel/<module>/validation` import paths are unchanged.
  Shared primitives come from `@voyant-travel/schema-kit`, keeping the contract
  packages free of the data layer.

  (`legal-contracts` still transitively depends on `@voyant-travel/utils` for the
  template-syntax validator used by contract validation — a tracked follow-up
  would purify it.)

### Patch Changes

- Updated dependencies [7094c8e]
  - @voyant-travel/schema-kit@0.97.0
