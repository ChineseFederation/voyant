# @voyant-travel/finance-contracts

## 0.114.0

### Minor Changes

- 798b05b: Make recording a booking's payment separable from issuing a fiscal document for it.

  Creating a booking with a recorded payment issued an invoice and mirrored it to the operator's accounting provider, and confirming one generated a contract. Both were consequences of the create rather than calls anyone made, so an operator's explicit "do not issue a proforma, invoice or contract" had nowhere to land, and back-filling a booking for an already-invoiced sale filed a second real fiscal document for it.

  - `suppressDocuments` on booking create records the booking without producing documents for it. The invoice is still written, as an unissued draft carrying the payments, so the booking records what was paid. Persisted as `bookings.documents_suppressed` and re-read by contract generation, which runs off an event after the create commits.
  - `documentGeneration.externalInvoice` (and `externalDocument` on `POST /invoices/from-booking`) records the sale against a fiscal document the operator already issued in their provider: the platform's invoice is issued so balances and contracts stay right, the mirror is suppressed, and the invoice's external reference names the operator's document.
  - Issuing from a booking that already carries a live external fiscal document now refuses with `duplicate_external_document` (HTTP 409) instead of sending a duplicate; `acknowledgeExistingExternalDocument: true` overrides it.
  - `POST /invoices/{id}/external-refs/{refId}/supersede` records that a provider document was cancelled outside the platform, keeping the superseded identity, and optionally repoints the reference at its replacement.

## 0.113.0

### Minor Changes

- 484b207: Refunds have a money leg: `refund_settlements` in finance, bound to what the
  refund reverses and to how the customer was actually paid back.

  Finance modelled refunds well as **accounting** and not at all as **money**.
  Credit notes existed, a `finance:refund` capability existed with `risk: critical`
  and `approvalPolicy: required`, booking amendments carried `refundAmountCents`,
  and none of it recorded that anyone had paid the customer. Issuing a credit note
  moves nothing. So a deployment could produce a correct accounting document while
  leaving no trace that money had — or had not — gone back.

  The record is deliberately not card-shaped. `method` is
  `processor_reversal | bank_transfer | cash | cheque | travel_credit | voucher |
counterparty_offset | other`, and a self-hosted deployment with no card processor
  at all can record every one of them except the first.

  **A refund can be owed and not yet paid.** That state had nowhere to live, and it
  is the normal state of a bank-transfer refund for a day or two. `status` is
  `pending | settled | failed`, separate from the credit note's status on purpose:
  the accounting document is issued once, but the money leg can be owed, retried,
  or settled long afterwards. `GET /v1/admin/finance/bookings/{id}/refund-settlements`
  answers what a credit note cannot — whether the booking still owes somebody money.

  **A pending refund keeps holding its amount.** The refundable remainder subtracts
  `pending` alongside `settled`, and only a positive failure gives an amount back.
  That is the whole reason the record has its own status: a processor refund can
  come back indeterminate — a timeout on a refund the processor accepted — and
  freeing its amount would let a retry return the same money twice, which is the
  one error here that trying again cannot undo. The bound is re-read inside the
  write transaction under `SELECT … FOR UPDATE` on the payment, so two concurrent
  refunds cannot both see the same remainder and both pass.

  **`finance:refund` now reaches the payment adapter.** The capability, the
  approval evaluation and the credit note all existed and nothing connected an
  authorized refund to `adapter.refund()`, so even a deployment with a working card
  processor could not return money through it.
  `POST /v1/admin/finance/refund-settlements/{id}/execute` drives a
  `processor_reversal` and records the outcome: `accepted` settles it, `pending`
  leaves it owed, a decline fails it and releases the amount, and a thrown error
  resolves nothing — the row stays `pending`, its amount stays held, and the note
  says the outcome is unknown.

  **Authorization is the existing one, not a second path.** The money leg's
  capability is spread from `finance:refund`, so the grant it demands, its
  `critical` risk and its irreversibility are the same values and cannot drift; it
  carries its own id only because the graph keys one capability per action.

  It differs in exactly one respect, deliberately: `approvalPolicy` is
  `conditional`, not `required`. **A member of staff holding `finance:refund` is
  the authority** — routing them through an approval they would grant themselves
  is not a control, it is a second click plus a screen explaining why the first
  one did nothing. Approval is required for an agent, whatever grant it carries,
  because the point of it is that a person signed off on money leaving. Issuing
  the credit note is unchanged: `required` for everyone.

  The route still preserves the `authorized` / `approval_required` distinction —
  `202` with the pending approval when one is needed, `201` with the settlement
  when it is not — so one endpoint serves both and the UI needs one button rather
  than two flows.

  ## The operator can see it and do it

  Backend-only, this would have been invisible. The money leg is now on the four
  screens where the question comes up:

  - **Booking detail, above the tabs** — a banner when a refund is owed. An issued
    credit note reads identically whether or not the money left, so nothing else
    on that page could say a customer is still waiting.
  - **Booking detail, finance tab** — a **Refunds** section directly under the
    payments summary, with a primary **Refund customer** action, _Still owed_ /
    _Already paid_ totals, and per-refund _Mark as paid_ / _Mark as failed_. Money
    out sits next to money in.
  - **Invoice detail, credit notes** — a _Refund_ column and a per-row **Refund**
    action. The credit note is issued on that screen, so "and did they get the
    money?" belongs there rather than one screen away.
  - **Payment detail** — _Still refundable_, the figure that stops a double
    refund, with a note when a pending refund is holding part of it.

  The dialog asks how the customer was paid back with a **select**, and the fields
  under it change with the answer: a card reversal asks which payment session it
  reverses, a voucher can be worth more than the refund, an offset asks whose
  account is credited. The currency is the payment's whenever there is one — the
  refundable bound is currency-matched server-side — and a currency **picker**
  otherwise, never a typed ISO code. Status badges carry the shared status tones,
  so _Not paid yet_ is amber, _Paid_ green and _Failed_ red wherever they appear.
  Full `en` + `ro` parity.

  Two dimensions come from operator practice rather than the schema:

  - **Credit and voucher are different instruments.** A travel credit is bound to
    the person refunded; a voucher is transferable, carries its own expiry, and is
    frequently worth more than the cash it replaces — 110% in credit to avoid
    paying out 100% is a standard cancellation tactic. They are two `method` values
    rather than one with a flag, and `instrumentAmountCents` records the uplift,
    because a refund settled by an instrument worth more than the amount refunded
    is not an accounting identity and the credit note and the instrument would
    otherwise disagree with no way to tell which was right.
  - **B2B refunds net rather than pay.** Refunding a reseller is usually a credit
    applied against what they owe on other bookings, so the method is
    `counterparty_offset` against a **counterparty balance** — not against another
    booking, which is too narrow to express the case.

  `record_refund_settlement` is the agent-facing Tool, on the same
  `finance:refund` scope and the same approve-then-retry shape as
  `issue_invoice_refund`.

### Patch Changes

- Updated dependencies [484b207]
  - @voyant-travel/schema-kit@0.118.7

## 0.112.0

### Minor Changes

- 1be6b76: A card dispute has somewhere to land: `payment_disputes` in finance, bound to
  the payment session it contests and reachable from the booking.

  There was no card-dispute model. The `disputed` value that existed is a
  **supplier-invoice** status — an accounts-payable state for a bill the operator
  is contesting — and is unrelated to a customer charging back a payment. So when a
  traveller disputed a card payment the runtime had nowhere to record it: the
  booking kept reading as paid, the money was gone or frozen, and the only trace
  lived in whatever processor console the operator happened to check.

  A chargeback is a generic commerce event, not a property of any one processor.
  Every card processor produces them with the same shape, so the record belongs in
  the framework and nothing in it names a processor — `provider`,
  `processor_reference` and `reason_code` are opaque strings stored and handed back
  verbatim.

  **The model.** `payment_disputes` carries the contested amount and currency
  (which may be partial), the lifecycle status, `opened_at` and the processor's
  `respond_by` deadline where it supplies one, an opaque processor reference,
  `resolved_at`, and `evidence_submitted_at`. `PaymentDisputeStatus` is the
  framework's vocabulary — `opened`, `under_review`, `won`, `lost`, `withdrawn` —
  and an adapter maps its own stage names onto it. The last three are terminal and
  each names the resolution; there is no separate outcome column, because one
  could only ever disagree with the status.

  **Terminal is absorbing.** A processor that contests a payment again issues a new
  dispute rather than reviving a resolved one, so a replayed or out-of-order
  callback can never walk a resolution backwards. The ingest path tolerates such a
  report rather than failing — a webhook that 500s is retried forever — while the
  deliberate `PATCH` rejects an illegal transition with `409`.

  **A second dispute does not overwrite the first.** The record is idempotent on
  `(payment_session_id, processor_reference)`: a repeat report advances the dispute
  it already made, a different reference opens a second row. A hand-entered dispute
  with no reference always opens a new record, which is the safe default — two rows
  are recoverable, a silently overwritten dispute is not. The unresolved contested
  total is capped at the payment it contests.

  **The booking can tell the truth.** `GET /v1/admin/finance/bookings/{bookingId}/disputes`
  answers what payments and sessions cannot: a contested payment still reads
  `paid`, so `hasOpenDispute`, the per-currency contested total, and the soonest
  `respondBy` are how a caller distinguishes a cleanly paid booking from one whose
  money is being taken back. Plus `GET`/`POST /v1/admin/finance/payment-disputes`
  and `GET`/`PATCH .../{id}`.

  **The callback contract can deliver one.** `PaymentCallbackEvent` gains an
  optional `dispute` alongside `nextState` rather than inside it: a chargeback does
  not move the payment's own lifecycle — the session stays `paid`, which is exactly
  the problem — so the event reports the session's current state and puts what
  changed in `dispute`. The conformance kit validates the signal's shape and folds
  it into the duplicate-callback identity, so an adapter cannot vary a dispute
  across a replay.

  **An agent can record one too.** `record_payment_dispute` fronts the dispute
  endpoints for an agent reconciling a processor console. It declares its
  `adminWrites` rather than leaning on the name match, because `/finance/payments`
  and `/finance/invoices/{id}/payments` share the trailing noun `payment` and the
  inference would have reported _recording a payment_ as covered by a Tool that
  only records a dispute against one.

  **The banner degrades, it does not crash.** `BookingDisputeBanner` renders on the
  booking detail page whether or not the host asked for it, so it reads the finance
  context through the new `useOptionalVoyantReactContext`: a host that has not
  mounted `VoyantFinanceProvider` gets no banner rather than a crashed page. Every
  other finance hook stays strict — they are the point of the screen they are on.

  **Deliberately not in scope.** Payouts acquire no model here — money moving from
  a processor to the operator's bank is not the booking ledger's concern. Evidence
  assembly and submission stay behind the adapter port, where they belong; the
  framework records only that evidence was submitted and when, without knowing what
  was in it.

### Patch Changes

- Updated dependencies [1be6b76]
  - @voyant-travel/schema-kit@0.118.5

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
