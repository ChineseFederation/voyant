# @voyant-travel/finance

## 0.218.2

### Patch Changes

- d367d9f: Enforce an optional, concurrency-safe monthly booking allowance at every accepted-booking boundary.
- Updated dependencies [d367d9f]
  - @voyant-travel/bookings@0.218.2

## 0.218.1

### Patch Changes

- 87668e8: Make manual booking creation actionable and predictable: submit errors are visible, existing CRM contacts no longer require duplicate data entry, room assignments fill selected capacity, authoritative quotes preserve per-person/per-room pricing, and Finance tool failures explain how to correct invalid room or payment inputs.
- Updated dependencies [87668e8]
  - @voyant-travel/bookings@0.218.1

## 0.218.0

### Minor Changes

- a799849: Expose non-PII booking line details to Tools and add an exact, fingerprinted payer/line/tax preview plus an approval-gated command for atomically issuing a proforma without external synchronization. Serialize checkout tax materialization with approved invoice issuance so the issued tax snapshot cannot drift.

### Patch Changes

- Updated dependencies [a799849]
  - @voyant-travel/bookings@0.218.0

## 0.217.0

### Patch Changes

- @voyant-travel/bookings@0.217.0

## 0.216.0

### Patch Changes

- Updated dependencies [903c754]
  - @voyant-travel/bookings@0.216.0

## 0.215.1

### Patch Changes

- Updated dependencies [9c2bb8c]
  - @voyant-travel/storage@0.115.0
  - @voyant-travel/public-document-delivery@0.4.17

## 0.215.0

### Patch Changes

- Updated dependencies [6c76de3]
  - @voyant-travel/payments@0.8.0
  - @voyant-travel/bookings@0.215.0

## 0.214.0

### Patch Changes

- @voyant-travel/bookings@0.214.0

## 0.213.0

### Patch Changes

- @voyant-travel/bookings@0.213.0

## 0.212.0

### Patch Changes

- @voyant-travel/bookings@0.212.0

## 0.211.1

### Patch Changes

- 83cac31: Make `create_booking`'s billing-party requirement visible in the Tool contract. `personId` and `organizationId` are both structurally optional because either satisfies the rule, and the requirement lived only in a `superRefine` — which does not serialize into the JSON Schema a Tool caller reads. An agent therefore saw two optional fields, omitted both, and hit `Select a billing person or organization` it had no way to predict, then retried the same call until the loop guard stopped it. Both fields now describe the constraint and name the lookup that returns their id (`list_people` for a person, `list_organizations` for an organization), the Tool description states the requirement, and the validation message names the field to set instead of reading as dialog copy. The rule is "at least one" rather than "exactly one": both may be set for a traveller billed through their company, which the create path already stores.

## 0.211.0

### Patch Changes

- @voyant-travel/bookings@0.211.0

## 0.210.0

### Patch Changes

- @voyant-travel/bookings@0.210.0

## 0.209.0

### Patch Changes

- @voyant-travel/bookings@0.209.0

## 0.208.0

### Patch Changes

- @voyant-travel/bookings@0.208.0

## 0.207.3

### Patch Changes

- b2f856a: Refuse to create a booking that reserves nothing, and allocate booking references through a tool.

  `create_booking` used to return a booking id for a command that produced no items whenever the resolved option had several optional units and the caller sent no `itemLines`. The result was a booking holding no inventory, with no price and nothing to invoice, while the caller was told it had succeeded. The create now fails closed before writing anything and explains which choice is missing.

  `generate_booking_number` is the new sanctioned way to allocate the immutable `bookingNumber` that anchors the durable create. Callers previously invented their own reference, which is how agent-authored bookings ended up with references built from the traveller's name.

- Updated dependencies [fef80ef]
- Updated dependencies [b2f856a]
  - @voyant-travel/action-ledger@0.115.3
  - @voyant-travel/bookings@0.207.3

## 0.207.2

### Patch Changes

- fd59cb6: Link a proforma invoice onto schedule-targeted card checkout sessions so paid status can project.

## 0.207.1

### Patch Changes

- accb1cf: Declare safety-contract metadata on the three remaining grandfathered
  invoice actions and remove them from the legacy execute+tools allowlist:

  - `action.void-invoice` runs a single local Postgres transaction guarded by
    invoice status (retrying an already-voided invoice returns `already_void`
    rather than re-mutating), so it declares `availability`,
    `effectBoundary: "local"`, and `targetLifecycle: "existing"` against its
    existing `commandTargetField: "id"`.
  - `action.issue-invoice-refund` and `action.issue-invoice-from-booking`
    already keep their own package-owned two-phase approval and idempotent
    replay guards (`refund-authorization.ts` / `invoice-issue-authorization.ts`
    fingerprint the command against target state and replay the exact prior
    credit-note/invoice result on retry) with `actionPolicyEnforcement:
"handler"` on their Tools, so MCP does not double-gate them. This adds
    `availability`, `effectBoundary: "local"`, `targetLifecycle: "existing"`,
    `existingTarget: { durability: "handler-command-result-v1" }`, and the
    `commandTargetField` naming the pre-existing invoice/booking
    (`invoiceId` / `bookingId`) their handlers already fingerprint on.

  No runtime changes.

## 0.207.0

### Patch Changes

- Updated dependencies [4979d3b]
  - @voyant-travel/bookings@0.207.0

## 0.206.0

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/payments@0.7.0
  - @voyant-travel/hono@0.134.6
  - @voyant-travel/bookings@0.206.0

## 0.205.0

### Minor Changes

- 58baffe: Remove callable Tool name aliases from the standard Operator graph. MCP and
  other callers must use canonical Tool names only; previous compatibility names
  (for example `crm_*`, `legal_contract_*`, `availability_*`, `dashboard_summary`,
  `read_setup_state`, `products_compose`, `invoices_issue_from_booking`) no longer
  dispatch.

  Stop publicly exporting the deprecated Relationships Tools
  `add_relationship_note`, `add_relationship_contact_method`, and
  `add_relationship_address`. Use the person- or organization-specific add Tools
  selected by the graph instead.

  See the consolidated [caller migration
  page](../docs/migrations/removed-tool-aliases.md) for the complete old →
  canonical name mapping.

### Patch Changes

- @voyant-travel/bookings@0.205.0

## 0.204.0

### Patch Changes

- @voyant-travel/bookings@0.204.0

## 0.203.0

### Minor Changes

- 17f1239: Replace the inline Finance booking-create HTTP and dual-create surfaces with one
  handler-admitted, idempotent created-target Tool command. Booking rows, dependent
  finance records, the canonical action-ledger result, and domain-event outbox
  entries now settle in one transaction; exact retries resolve the original booking.

  Remove the retired booking-create React mutation, sheet, page, and slot shortcut.
  Unmount the legacy admin new/journey routes and semantic destinations, remove
  catalog and inventory booking actions, and remove the standard storefront
  `/shop/book/:entityModule/:entityId` route plus its booking page/journey exports.
  Catalog browsing, booking read/detail, customer-portal sessions, and reusable
  draft sections remain available; new booking creation is a Finance staff Tool.
  Remove raw Bookings, Charter, and Cruise creation APIs and Tools. Delete the
  dormant Catalog owned-commit contract and Inventory, Accommodations, Cruises,
  Commerce, Storefront, and Storefront SDK booking-row creation bridges rather
  than retaining unavailable legacy mutations. Require registry-minted,
  unforgeable handler admission plus a single-use Finance-specific mutation lease
  for Bookings domain settlement, and remove the Finance command's public
  subpath.

### Patch Changes

- Updated dependencies [17f1239]
  - @voyant-travel/action-ledger@0.115.0
  - @voyant-travel/bookings@0.203.0
  - @voyant-travel/tools@0.7.0

## 0.202.0

### Patch Changes

- @voyant-travel/bookings@0.202.0

## 0.201.1

### Patch Changes

- a02a76b: Move generic MCP action targets, idempotency fingerprints, and approval preflight
  behind a discoverable server-owned Tool contract. Migrated packages resolve ledger
  targets from validated input, approval-required calls return structured server-issued
  approval metadata, and exact retries are validated against the stored command and
  principal. Route every handler-created target through the selected Tool admission,
  remove the raw created-target executor from the public package surface, and reject
  future package-level bypasses during manifest convergence. Validate graph risk
  against the loaded Tool tier before release and keep the Operator MCP health check
  from accepting startup failures.
- Updated dependencies [a02a76b]
  - @voyant-travel/tools@0.6.0
  - @voyant-travel/action-ledger@0.114.0
  - @voyant-travel/bookings@0.201.1

## 0.201.0

### Minor Changes

- 5e03ae7: Replace every notification mutation path with required-idempotency durable
  admission, outbox publication, leased worker delivery, and canonical provider
  replay. This major release explicitly supersedes the `0.136.0`
  compatibility surface: request-scoped provider sends, `NotificationProvider.send`,
  `NotificationService` exports, generic direct-send routes, bundled local/Cloud
  provider shims, and optional notification idempotency are no longer supported.
  Provider packages now implement the public durable provider port and its
  non-delivering restart/replay/drift conformance probe. The send action becomes
  available only for the exact selected graph provider that passes that behavioral
  contract.

  Framework graph resolution now treats an absent external provider package as a
  valid disabled state for a conditional action. The action remains unavailable;
  selection, typed-port conformance, and ambiguity checks still apply when a
  provider is present.

### Patch Changes

- @voyant-travel/bookings@0.201.0

## 0.200.0

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/core@0.136.0
  - @voyant-travel/storage@0.114.0
  - @voyant-travel/utils@0.110.0
  - @voyant-travel/action-ledger@0.113.2
  - @voyant-travel/bookings@0.200.0
  - @voyant-travel/db@0.118.5
  - @voyant-travel/hono@0.134.5
  - @voyant-travel/payments@0.6.5
  - @voyant-travel/public-document-delivery@0.4.16
  - @voyant-travel/reporting-contracts@0.3.6
  - @voyant-travel/finance-contracts@0.107.3

## 0.199.0

### Patch Changes

- Updated dependencies [3651ff7]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/action-ledger@0.113.1
  - @voyant-travel/bookings@0.199.0
  - @voyant-travel/db@0.118.4
  - @voyant-travel/hono@0.134.4
  - @voyant-travel/payments@0.6.4
  - @voyant-travel/public-document-delivery@0.4.15
  - @voyant-travel/reporting-contracts@0.3.5
  - @voyant-travel/storage@0.113.6

## 0.198.1

### Patch Changes

- @voyant-travel/bookings@0.198.1

## 0.198.0

### Patch Changes

- @voyant-travel/bookings@0.198.0

## 0.197.0

### Patch Changes

- b07a0a3: Add an explicit handler-owned durable result protocol for existing-target Tool
  commands, including atomic package-owned operation intent preparation, exact
  admission, stable replay context, organization-bound approval continuity, and
  framework/runtime contract validation. Existing-target command payloads are
  restricted to immutable, acyclic JSON values so their runtime identity cannot
  diverge from canonical fingerprinting; that sanitized frozen value is the
  authoritative target, fingerprint, claim, and handler snapshot.
- Updated dependencies [b07a0a3]
  - @voyant-travel/action-ledger@0.113.0
  - @voyant-travel/bookings@0.197.0
  - @voyant-travel/core@0.134.0
  - @voyant-travel/tools@0.5.0
  - @voyant-travel/db@0.118.3
  - @voyant-travel/hono@0.134.3
  - @voyant-travel/payments@0.6.3
  - @voyant-travel/public-document-delivery@0.4.14
  - @voyant-travel/reporting-contracts@0.3.4
  - @voyant-travel/storage@0.113.5

## 0.196.0

### Minor Changes

- 58020ec: Keep first-party Tools with unproven non-transactional external or multi-stage effects out of
  runtime discovery. The affected graph actions remain available as diagnostic metadata with an
  explicit unsafe-effect reason until each package gains tested transactional, outbox, or saga
  durability. This also covers supplier-side flight cancellation and contract execution whose
  post-commit lifecycle event is not yet durably published.

### Patch Changes

- Updated dependencies [c1f9cdf]
- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
- Updated dependencies
  - @voyant-travel/action-ledger@0.112.0
  - @voyant-travel/bookings@0.196.0
  - @voyant-travel/core@0.133.0
  - @voyant-travel/tools@0.4.0
  - @voyant-travel/db@0.118.2
  - @voyant-travel/hono@0.134.2
  - @voyant-travel/payments@0.6.2
  - @voyant-travel/public-document-delivery@0.4.13
  - @voyant-travel/reporting-contracts@0.3.3
  - @voyant-travel/storage@0.113.4

## 0.195.0

### Patch Changes

- Updated dependencies [e3a1e17]
  - @voyant-travel/bookings@0.195.0

## 0.194.1

### Patch Changes

- 9ed0a4f: Keep the composed `create_booking` action policy with its Finance handler so the
  generated booking ID remains the single authoritative action-ledger target.

## 0.194.0

### Patch Changes

- Updated dependencies [dd370ca]
  - @voyant-travel/core@0.132.1
  - @voyant-travel/bookings@0.194.0

## 0.193.0

### Patch Changes

- @voyant-travel/bookings@0.193.0

## 0.192.1

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/action-ledger@0.111.14
  - @voyant-travel/bookings@0.192.1
  - @voyant-travel/db@0.118.1
  - @voyant-travel/hono@0.134.1
  - @voyant-travel/payments@0.6.1
  - @voyant-travel/public-document-delivery@0.4.12
  - @voyant-travel/reporting-contracts@0.3.2
  - @voyant-travel/storage@0.113.3

## 0.192.0

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
  - @voyant-travel/finance-contracts@0.107.2
  - @voyant-travel/bookings@0.192.0

## 0.191.0

### Minor Changes

- f6aa3a1: Route Finance checkout collections through the deployment-selected `PaymentAdapter`. Providerless card-start requests now use that adapter, legacy provider hints remain compatible but cannot override deployment selection, and full generic billing metadata reaches hosted-checkout adapters.

### Patch Changes

- @voyant-travel/bookings@0.191.0

## 0.190.0

### Patch Changes

- Updated dependencies [228b57d]
- Updated dependencies [f945310]
- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/bookings@0.190.0
  - @voyant-travel/db@0.118.0
  - @voyant-travel/core@0.131.0
  - @voyant-travel/hono@0.134.0
  - @voyant-travel/action-ledger@0.111.13
  - @voyant-travel/public-document-delivery@0.4.11
  - @voyant-travel/types@0.109.9
  - @voyant-travel/payments@0.5.2
  - @voyant-travel/reporting-contracts@0.3.1
  - @voyant-travel/storage@0.113.2

## 0.189.0

### Patch Changes

- @voyant-travel/bookings@0.189.0

## 0.188.0

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0
  - @voyant-travel/utils@0.109.0
  - @voyant-travel/action-ledger@0.111.11
  - @voyant-travel/bookings@0.188.0

## 0.187.1

### Patch Changes

- Updated dependencies [d8a225c]
  - @voyant-travel/storage@0.113.0
  - @voyant-travel/public-document-delivery@0.4.10

## 0.187.0

### Patch Changes

- @voyant-travel/bookings@0.187.0

## 0.186.0

### Patch Changes

- @voyant-travel/bookings@0.186.0

## 0.185.0

### Minor Changes

- e7e90bf: Pass the deployment's public payment webhook to the card processor as
  `metadata.notifyUrl` when starting a hosted payment. The generic payment
  adapter forwards it to the connected processor worker so redirect processors
  (e.g. Netopia) POST their server-side confirmation (IPN) back to
  `/v1/public/payment-link/callback`, closing the charge-confirmation loop.
  Finance's card-payment starter gains an optional `resolveNotifyUrl(c)`; the
  Storefront-selected trips runtime derives it from the public checkout base URL.

### Patch Changes

- @voyant-travel/bookings@0.185.0

## 0.184.0

### Patch Changes

- @voyant-travel/bookings@0.184.0

## 0.183.0

### Patch Changes

- Updated dependencies [8d370ef]
  - @voyant-travel/payments@0.5.0
  - @voyant-travel/bookings@0.183.0

## 0.182.4

### Patch Changes

- @voyant-travel/bookings@0.182.2

## 0.182.3

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0
  - @voyant-travel/action-ledger@0.111.10
  - @voyant-travel/bookings@0.182.1

## 0.182.2

### Patch Changes

- Updated dependencies [225000a]
  - @voyant-travel/payments@0.4.0

## 0.182.1

### Patch Changes

- Updated dependencies [bcd7ad0]
  - @voyant-travel/storage@0.112.0
  - @voyant-travel/public-document-delivery@0.4.9

## 0.182.0

### Patch Changes

- @voyant-travel/bookings@0.182.0

## 0.181.0

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

- 464815c: Report export, base-currency reporting, and a redesigned builder.

  - Add report export in CSV, XLSX, and visual PDF (charts stay charts; only table
    widgets render as tables) via a new `GET /reports/:id/export` route and a
    client-side visual PDF composer.
  - Remove report versioning (versions/runs routes, tables, and retention): the
    editable draft is the single source of truth. Reporting datasets now expose a
    `defaultDateField` so the page date window applies without a per-report knob.
  - Add a `reportCurrency=base` execution mode: Finance receivables consolidate
    every amount into the operator base currency using the recording-time FX
    snapshot (`base_*_cents`), so a report can show one cross-currency total. The
    query language gains `between` and `in (...)` operators and a typed
    `ReportDatasetQueryError`.
  - Redesign the reporting-react builder to match the admin aesthetic: page date
    window, base-currency toggle, export menu, widget-preview and configuration
    Sheets, a CodeMirror query editor for custom widgets, and a silent autosave
    with an unsaved-changes guard.
  - Fix the Bookings/Finance reporting time-grain grouping (literal `date_trunc`
    grain) that previously errored under `group by`.

### Patch Changes

- Updated dependencies [464815c]
  - @voyant-travel/reporting-contracts@0.3.0
  - @voyant-travel/bookings@0.181.0

## 0.180.1

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/payments@0.3.0
  - @voyant-travel/db@0.117.1
  - @voyant-travel/finance-contracts@0.107.1
  - @voyant-travel/bookings@0.180.1

## 0.180.0

### Patch Changes

- @voyant-travel/bookings@0.180.0

## 0.179.0

### Patch Changes

- @voyant-travel/bookings@0.179.0

## 0.178.0

### Patch Changes

- @voyant-travel/bookings@0.178.0

## 0.177.0

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/action-ledger@0.111.9
  - @voyant-travel/bookings@0.177.0
  - @voyant-travel/hono@0.131.2
  - @voyant-travel/public-document-delivery@0.4.8
  - @voyant-travel/types@0.109.8

## 0.176.0

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0
  - @voyant-travel/action-ledger@0.111.8
  - @voyant-travel/bookings@0.176.0
  - @voyant-travel/hono@0.131.1
  - @voyant-travel/public-document-delivery@0.4.7
  - @voyant-travel/types@0.109.7

## 0.175.0

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/bookings@0.175.0
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/action-ledger@0.111.7
  - @voyant-travel/payments@0.2.6
  - @voyant-travel/public-document-delivery@0.4.6
  - @voyant-travel/reporting-contracts@0.2.1
  - @voyant-travel/storage@0.111.6
  - @voyant-travel/types@0.109.6

## 0.174.0

### Minor Changes

- b8b25b7: Add the composable reporting platform: module-owned semantic datasets and widget presets,
  cross-module full-page templates, persisted editable report drafts, immutable published versions,
  bounded query parsing and execution, source-scope authorization, and standard Operator selection.
  Bookings and Finance now contribute initial operational reporting content.

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/reporting-contracts@0.2.0
  - @voyant-travel/bookings@0.174.0
  - @voyant-travel/action-ledger@0.111.6
  - @voyant-travel/db@0.114.15
  - @voyant-travel/hono@0.130.1
  - @voyant-travel/payments@0.2.5
  - @voyant-travel/public-document-delivery@0.4.5
  - @voyant-travel/storage@0.111.5

## 0.173.0

### Patch Changes

- @voyant-travel/bookings@0.173.0

## 0.172.0

### Minor Changes

- f6f22e7: Require independent admin and customer auth secrets, bind provider and bearer identities to their explicit route realm, keep guest checkout capabilities independently configured, and preserve secure cloud-auth state cookies behind TLS termination.

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/bookings@0.172.0
  - @voyant-travel/core@0.128.0
  - @voyant-travel/hono@0.130.0
  - @voyant-travel/utils@0.108.0
  - @voyant-travel/action-ledger@0.111.5
  - @voyant-travel/db@0.114.14
  - @voyant-travel/payments@0.2.4
  - @voyant-travel/public-document-delivery@0.4.4
  - @voyant-travel/storage@0.111.4

## 0.171.2

### Patch Changes

- 1881293: Require realm-specific Better Auth secrets, remove the legacy shared-secret path, and reject existing customer sessions when customer authentication is disabled.
- Updated dependencies [1881293]
  - @voyant-travel/bookings@0.171.2
  - @voyant-travel/hono@0.129.1

## 0.171.1

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0
  - @voyant-travel/action-ledger@0.111.4
  - @voyant-travel/bookings@0.171.1

## 0.171.0

### Minor Changes

- d2d7384: Expose provider-neutral finance issuance hydration, external-reference writeback,
  and invoice/proforma issuance webhooks through the remote App API boundary.

### Patch Changes

- Updated dependencies [d2d7384]
  - @voyant-travel/finance-contracts@0.107.0
  - @voyant-travel/bookings@0.171.0

## 0.170.0

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/action-ledger@0.111.3
  - @voyant-travel/bookings@0.170.0
  - @voyant-travel/db@0.114.13
  - @voyant-travel/hono@0.128.6
  - @voyant-travel/payments@0.2.3
  - @voyant-travel/public-document-delivery@0.4.3
  - @voyant-travel/storage@0.111.3

## 0.169.2

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/action-ledger@0.111.2
  - @voyant-travel/bookings@0.169.1
  - @voyant-travel/db@0.114.11
  - @voyant-travel/hono@0.128.4
  - @voyant-travel/payments@0.2.2
  - @voyant-travel/public-document-delivery@0.4.2
  - @voyant-travel/storage@0.111.2

## 0.169.1

### Patch Changes

- c013955: Wire the booking-tax settings and preview route options through the runtime
  container so the managed runtime's operator-settings resolvers always reach the
  routes.

  On the managed runtime every runtime export of a graph unit is invoked: the
  `defineGraphRuntimeFactory` export receives the factory context and wires the
  operator-settings port into options, while the plain api-facet export is called
  with no args and therefore saw empty options. Because the api-facet previously
  returned an eager `adminRoutes` set built from those empty options, `PATCH
/v1/admin/finance/tax-settings` failed with `Booking tax settings updates are
not configured`.

  The booking-tax settings/preview extensions now mirror the booking-schedule
  pattern: the graph factory registers the wired options into the shared app
  container under a runtime key during `bootstrap`, and the (now lazy) routes
  resolve those options from the container at request time, falling back to the
  closure options for standard callers that pass real options directly.

## 0.169.0

### Patch Changes

- 590d256: Republish with dependency ranges resolved. The prior tarballs for these packages
  carry raw `workspace:` specifiers (they were published outside the pnpm-aware
  release flow) and cannot be installed by consumers. Also fixes the `runtime`
  package's `prepack`, which rebuilt the entire workspace dependency closure on
  every publish — the slow build stalled the release train's publish step past its
  timeout and wedged the whole batch. `prepack` now builds only the package itself,
  matching every other package.
  - @voyant-travel/bookings@0.169.0

## 0.168.0

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

- @voyant-travel/bookings@0.168.0

## 0.167.0

### Minor Changes

- ca3713e: Scope the operator invoicing mode to the deferred bank-transfer payment path.

  Payment method now determines the document flow. Card payments always issue the fiscal invoice at checkout finalize and never consult `invoicing.mode`. Bank transfer (deferred payment) is the configurable path: `proforma-first` (now the default, matching the platform's historical behaviour) issues a proforma at order placement and mints the fiscal invoice on settlement; `direct` issues the fiscal invoice at order placement and collects the transfer against it.

  The mode consult that PR #3462 added to the checkout finalize saga is removed — finalize once again always issues the fiscal invoice (or converts an existing proforma). The mode is instead wired at the bank-transfer issuance site, and its default flips from `direct` to `proforma-first` (schema default, normalization, and an additive migration that also backfills existing rows). The finance proforma-conversion subscriber no longer gates on the mode: any fully-paid proforma converts, which is correct in every mode and avoids stranding a proforma left outstanding across a mode switch.

### Patch Changes

- @voyant-travel/bookings@0.167.0

## 0.166.0

### Minor Changes

- c3bdcbc: Wire checkout finalization to the operator invoicing mode. When an operator runs `proforma-first`, a fresh checkout now issues a proforma instead of a fiscal invoice; the fiscal invoice is minted later once the proforma settles. `direct` mode is unchanged, an explicitly requested proforma conversion always wins over the mode default, and deployments without an operator-settings runtime fall back to `direct`.
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

- 926ea47: Add the canonical payment adapter contract and public conformance kit, expose the payments deployment provider role, and route card-payment seams through explicit deployment adapter selection instead of processor package identity.

### Patch Changes

- Updated dependencies [926ea47]
  - @voyant-travel/payments@0.2.0
  - @voyant-travel/bookings@0.166.0

## 0.165.0

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

- @voyant-travel/bookings@0.165.0

## 0.164.0

### Patch Changes

- @voyant-travel/bookings@0.164.0

## 0.163.0

### Patch Changes

- 52352c4: Resolve custom-field definitions exclusively from persisted Settings records.
  Bookings and Relationships now share the package-owned database resolver.
  Project-local TypeScript authoring is removed by the completed custom-fields
  cutline.
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/bookings@0.163.0
  - @voyant-travel/core@0.125.0
  - @voyant-travel/action-ledger@0.111.1
  - @voyant-travel/db@0.114.9
  - @voyant-travel/hono@0.128.1
  - @voyant-travel/public-document-delivery@0.4.1
  - @voyant-travel/storage@0.111.1
  - @voyant-travel/finance-contracts@0.106.2

## 0.162.2

### Patch Changes

- @voyant-travel/bookings@0.162.2

## 0.162.1

### Patch Changes

- Updated dependencies [5941d2c]
  - @voyant-travel/action-ledger@0.111.0
  - @voyant-travel/bookings@0.162.1

## 0.162.0

### Minor Changes

- 8f0fa26: Make Hono the explicit sole server API runtime while moving package and
  deployment interfaces to role-based API vocabulary. Replace Hono-prefixed module,
  extension, bundle, lazy-route, and factory names with `Api*` names; move
  router-named domain runtime entry points to `./api-runtime`; and remove the old
  names without compatibility aliases.

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/action-ledger@0.110.0
  - @voyant-travel/bookings@0.162.0
  - @voyant-travel/hono@0.128.0
  - @voyant-travel/public-document-delivery@0.4.0
  - @voyant-travel/storage@0.111.0
  - @voyant-travel/db@0.114.8

## 0.161.0

### Patch Changes

- 85bfe2c: Return previously issued invoice credit notes when an approved refund command is retried exactly.
- Updated dependencies [a1842a7]
- Updated dependencies [85bfe2c]
  - @voyant-travel/hono@0.127.2
  - @voyant-travel/action-ledger@0.109.1
  - @voyant-travel/bookings@0.161.0

## 0.160.0

### Minor Changes

- 701ccc4: Add approval-gated agent Tools for booking cancellation and invoice refunds issued as credit notes, with exact command fingerprint validation and linked action-ledger execution records.
- a2fd806: Add package-owned MCP Tools for atomic product composition, composed booking creation,
  and approval-gated invoice/proforma issue from bookings. Reuse the existing domain
  orchestrators, structural schemas, mutation ledgers, and post-commit events, and make
  approved invoice execution exactly idempotent.

### Patch Changes

- 372f4f4: Add a separately selectable Operations-owned dashboard Tool that composes the real aggregate
  services from Bookings, Finance, Inventory, Distribution, and Operations without crossing domain
  persistence boundaries. Require every underlying read scope and return structural source
  projections, KPIs, and bounded alerts.

  Complete the Quotes proposal lifecycle Tool surface with snapshot, send, accept, and decline
  capabilities, structural JSON-safe outputs, compatibility aliases, staff-only grants,
  confirmation, and graph-ledger/approval policy.

- db5adce: Fail closed before selected graph Tool dispatch by binding each capability to its action-ledger
  policy. Advertise invocation controls in discovery, enforce confirmation, target, idempotency,
  fingerprint, approval, and principal semantics, and record required-ledger execution outcomes.

  Keep the existing package-owned booking cancellation and invoice refund approval workflows as
  explicit handler-enforced policies so their domain-state fingerprints and atomic ledgers are not
  double-gated.

- 6604f9e: Expose structural output schemas for every first-party Tool that previously used an opaque runtime-only schema.
- Updated dependencies [cabf662]
- Updated dependencies [701ccc4]
- Updated dependencies [5f15e2e]
- Updated dependencies [372f4f4]
- Updated dependencies [b8cef4c]
- Updated dependencies [db5adce]
- Updated dependencies [c9b6144]
- Updated dependencies [6604f9e]
- Updated dependencies [ff87f68]
  - @voyant-travel/action-ledger@0.109.0
  - @voyant-travel/core@0.124.0
  - @voyant-travel/tools@0.3.0
  - @voyant-travel/bookings@0.160.0
  - @voyant-travel/db@0.114.7
  - @voyant-travel/hono@0.127.1
  - @voyant-travel/public-document-delivery@0.3.7
  - @voyant-travel/storage@0.110.2

## 0.159.0

### Patch Changes

- 49f55d0: Keep catalog booking and checkout as a two-phase flow, and atomically convert
  owned-product availability holds into on-hold booking allocations without
  consuming capacity twice. Hold placement and release are now idempotent across
  retries and duplicate tokens, converted holds retain an audit link to their
  booking allocation, and checkout-only intents receive structured validation
  errors from the reservation route.
- 9c85101: Compile one canonical event catalog from selected package manifests and expose it through
  generated deployment artifacts, graph runtimes, a package-owned admin API, and an admin event
  reference page. Reject duplicate event type authorities while preserving legitimate emitters,
  and ratchet persistence mutation coverage in the phase-5 authority checker.
- Updated dependencies [7e9f77a]
- Updated dependencies [49f55d0]
- Updated dependencies [552acbf]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0
  - @voyant-travel/hono@0.127.0
  - @voyant-travel/bookings@0.159.0
  - @voyant-travel/tools@0.2.2
  - @voyant-travel/action-ledger@0.108.6
  - @voyant-travel/db@0.114.6
  - @voyant-travel/public-document-delivery@0.3.6
  - @voyant-travel/storage@0.110.1

## 0.158.0

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
  - @voyant-travel/bookings@0.158.0
  - @voyant-travel/storage@0.110.0
  - @voyant-travel/action-ledger@0.108.5
  - @voyant-travel/core@0.122.2
  - @voyant-travel/db@0.114.5
  - @voyant-travel/public-document-delivery@0.3.5
  - @voyant-travel/types@0.109.2

## 0.157.0

### Patch Changes

- @voyant-travel/bookings@0.157.0

## 0.156.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [8d62a7c]
  - @voyant-travel/core@0.122.1
  - @voyant-travel/db@0.114.4
  - @voyant-travel/types@0.109.1
  - @voyant-travel/utils@0.107.1
  - @voyant-travel/action-ledger@0.108.4
  - @voyant-travel/bookings@0.156.1
  - @voyant-travel/finance-contracts@0.106.1
  - @voyant-travel/hono@0.126.3
  - @voyant-travel/public-document-delivery@0.3.4
  - @voyant-travel/storage@0.109.4
  - @voyant-travel/tools@0.2.1

## 0.156.0

### Minor Changes

- bbe6396: Replace the overloaded Finance voucher domain with Travel Credits across the
  database schema, APIs, package exports, booking inputs, storefront settings,
  and operator UI. Redemption commands are replay-safe, codes are normalized and
  case-insensitively unique, and legacy records migrate in place without silently
  skipping invalid balances. Keep Promotion Codes in Commerce and move Bookings
  fulfillment to the explicit Service Voucher vocabulary.

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/finance-contracts@0.106.0
  - @voyant-travel/bookings@0.156.0
  - @voyant-travel/db@0.114.3

## 0.155.2

### Patch Changes

- d83d237: Repair packaged consumer development and production startup, keep shared UI
  contexts single-instanced under Vite, make unconfigured realtime quiet, and
  restore narrow client-safe validation and Finance voucher setup exports. Resolve
  legacy frontend imports through product-owned browser facades and allow clean CI
  installs to fetch metadata for external dependencies.
- Updated dependencies [d83d237]
  - @voyant-travel/bookings@0.155.2

## 0.155.1

### Patch Changes

- cc85042: Make deployment provider selection authoritative for Node storage, cache, shared
  state, and rate limiting. Replace vendor-specific object-store bindings and R2
  shims with logical media/document stores, a memory provider, an AWS SDK v3
  S3-compatible provider, and package-selected custom adapters. Add a portable
  storage provider conformance runner, resolve adapters from the `storage.object`
  graph provider, and make provider config/secret/resource usage explicit. Keep
  distributed shared state and rate-limit KV authoritative by bypassing the
  cache-only process-local L1, and move guest booking lookups onto the selected
  atomic rate-limit store. Remove the former R2/SigV4 exports.
- Updated dependencies [cc85042]
- Updated dependencies [07a6ee3]
  - @voyant-travel/core@0.122.0
  - @voyant-travel/bookings@0.155.1
  - @voyant-travel/db@0.114.2
  - @voyant-travel/hono@0.126.2
  - @voyant-travel/storage@0.109.3
  - @voyant-travel/action-ledger@0.108.3
  - @voyant-travel/public-document-delivery@0.3.3

## 0.155.0

### Patch Changes

- Updated dependencies [3f6694b]
  - @voyant-travel/core@0.121.0
  - @voyant-travel/action-ledger@0.108.2
  - @voyant-travel/bookings@0.155.0
  - @voyant-travel/db@0.114.1
  - @voyant-travel/hono@0.126.1
  - @voyant-travel/public-document-delivery@0.3.2
  - @voyant-travel/storage@0.109.2

## 0.154.0

### Patch Changes

- 4d0eeed: Remove deprecated beta compatibility surfaces in favor of their canonical APIs.

  - Import Hono transport bundles from `@voyant-travel/hono/bundle` and use
    `HonoBundle`, `defineHonoBundle`, and `expandHonoBundles`.
  - Import public document delivery APIs from
    `@voyant-travel/public-document-delivery`.
  - Use permission-named API key helpers instead of the removed scope aliases.
  - Use `createRedisKvStore` for Redis-backed caching instead of the removed
    no-op Redis compatibility functions.
  - Use `entityTagColumns` instead of `tagsCoreColumns`.

- Updated dependencies [4d0eeed]
- Updated dependencies [bef5b7c]
  - @voyant-travel/hono@0.126.0
  - @voyant-travel/types@0.109.0
  - @voyant-travel/utils@0.107.0
  - @voyant-travel/db@0.114.0
  - @voyant-travel/core@0.120.0
  - @voyant-travel/action-ledger@0.108.1
  - @voyant-travel/bookings@0.154.0
  - @voyant-travel/public-document-delivery@0.3.1
  - @voyant-travel/storage@0.109.1

## 0.153.0

### Minor Changes

- 490d132: Add explicit many-valued graph runtime ports and move invoice settlement poller composition into Finance so selected invoicing adapters aggregate deterministically without starter-owned bridges.

### Patch Changes

- 047c3f9: Move booking and payment runtime configuration behind package-owned graph factories and typed deployment ports.
- 490d132: Add package-owned runtime contributor APIs for deployment-supplied Bookings, Finance, and Quotes adapters.
- 490d132: Move Trips lifecycle composition, checkout FX handling, payment-policy readers, and workflow effects from the Operator starter into package-owned runtime surfaces.
- 490d132: Move standard first-party admin factories, package copy, slots, contributions, and icons into selected deployment graph composition.
- 490d132: Declare the remaining package-owned OpenAPI documents backed by committed operations and preserve exact graph API ownership at shared route mounts.
- 490d132: Derive the final package runtime bindings from generic deployment capabilities and primitives, with no product-specific generated runtime host resources.
- 490d132: Move the Finance, Legal, and Trips admin and public API surfaces onto package-owned selected-graph OpenAPI authority.
- 490d132: Declare package-owned runtime contributors in `voyant.package.v1` metadata and statically lower selected contributors into generated Node graph source. Node hosts now compose one generated contributor set from opaque host resources without enumerating first-party factories or package IDs.
- 490d132: Compose MCP tools and their service context from graph-selected package runtime exports instead of an Operator-owned product catalog.
- 490d132: Move runtime construction into BOM-selected domain contributors and replace the Finance target package with typed graph ports while keeping package dependencies acyclic.
- 490d132: Move catalog content configuration, booking financial lifecycle behavior, and catalog/commerce scheduled work behind package-owned graph factories and workflows.
- 490d132: Compose Action Ledger health from typed Bookings, Finance, and Inventory graph ports, consolidate Distribution channel-push composition into its domain package, and make Workflow Runs own runner registration authority.
- 490d132: Make package and project declarations the sole selected access authority, removing legacy catalog overlays and runtime synthesis.
- 490d132: Remove the final Operator admin factory compatibility registry by composing cross-domain behavior through package-owned selected graph slots and contributions.
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
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
  - @voyant-travel/bookings@0.153.0
  - @voyant-travel/action-ledger@0.108.0
  - @voyant-travel/storage@0.109.0
  - @voyant-travel/db@0.113.0
  - @voyant-travel/core@0.119.0
  - @voyant-travel/tools@0.2.0
  - @voyant-travel/hono@0.125.1
  - @voyant-travel/types@0.108.1

## 0.152.0

### Patch Changes

- 60b1970: Activate the package-owned booking-schedule subscriber through selected graph lowering and shared host-provided runtime capabilities.
- 977c1bd: Declare the inert Finance booking-schedule subscriber contract and publish its package-owned runtime factory for a later duplicate-free graph activation.
- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [8f537b0]
- Updated dependencies [d26a820]
- Updated dependencies [d771be3]
- Updated dependencies [bd7a830]
  - @voyant-travel/core@0.118.0
  - @voyant-travel/action-ledger@0.107.0
  - @voyant-travel/types@0.108.0
  - @voyant-travel/bookings@0.152.0
  - @voyant-travel/hono@0.125.0
  - @voyant-travel/db@0.112.2
  - @voyant-travel/storage@0.108.1
  - @voyant-travel/utils@0.106.1

## 0.151.4

### Patch Changes

- 1081483: Declare the payment-session and notification-delivery capabilities required by Netopia's package-owned Voyant manifest.
- Updated dependencies [e5aa097]
- Updated dependencies [01d5034]
- Updated dependencies [c66f9a5]
  - @voyant-travel/bookings@0.151.5
  - @voyant-travel/core@0.117.0
  - @voyant-travel/storage@0.108.0
  - @voyant-travel/action-ledger@0.106.4
  - @voyant-travel/db@0.112.1
  - @voyant-travel/hono@0.124.1

## 0.151.3

### Patch Changes

- Updated dependencies [ca90eb5]
  - @voyant-travel/db@0.112.0
  - @voyant-travel/hono@0.124.0
  - @voyant-travel/action-ledger@0.106.3
  - @voyant-travel/bookings@0.151.4
  - @voyant-travel/types@0.107.3

## 0.151.2

### Patch Changes

- Updated dependencies [8576451]
  - @voyant-travel/core@0.116.0
  - @voyant-travel/action-ledger@0.106.2
  - @voyant-travel/bookings@0.151.3
  - @voyant-travel/db@0.111.2
  - @voyant-travel/hono@0.123.2
  - @voyant-travel/storage@0.107.2

## 0.151.1

### Patch Changes

- e4e6621: Model package-owned Hono extensions as first-class deployment graph units while keeping externally distributed integrations in the plugin lane.
- Updated dependencies [e4e6621]
- Updated dependencies [953e418]
- Updated dependencies [2153e48]
  - @voyant-travel/core@0.115.0
  - @voyant-travel/action-ledger@0.106.1
  - @voyant-travel/bookings@0.151.1
  - @voyant-travel/hono@0.123.0
  - @voyant-travel/db@0.111.1
  - @voyant-travel/storage@0.107.1

## 0.151.0

### Minor Changes

- e3dc5a9: Generate executable Node schema and setup migration plans with idempotency ledgers, and run the finance voucher backfill through its package-owned setup migration reference.
- e3dc5a9: Declare the existing customer and commerce admin routes, navigation, slots, copy, and widget contributions in their package-owned Voyant manifests.
- a370024: Publish package-owned deployment manifests for identity, relationships, finance,
  and operations graph surfaces.
- e3dc5a9: Move existing customer and commerce package surfaces into package-owned Voyant manifests, including Node application events, tools, access resources, action metadata, setup migrations, outbound webhooks, and retain-data lifecycle declarations.

### Patch Changes

- a370024: Rehome finance, quote, legal, and storefront bridge graph declarations into their owning packages with executable runtime descriptors.
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
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
  - @voyant-travel/bookings@0.151.0
  - @voyant-travel/action-ledger@0.106.0
  - @voyant-travel/db@0.111.0
  - @voyant-travel/storage@0.107.0
  - @voyant-travel/hono@0.122.4
  - @voyant-travel/types@0.107.2

## 0.150.0

### Patch Changes

- Updated dependencies [496f2ef]
  - @voyant-travel/bookings@0.150.0
  - @voyant-travel/core@0.113.0
  - @voyant-travel/action-ledger@0.105.15
  - @voyant-travel/db@0.110.2
  - @voyant-travel/hono@0.122.3

## 0.149.1

### Patch Changes

- 5e1d221: Publish `voyant.package.v1` compatibility metadata from first-party
  schema-owning packages so deployment graph package admission can validate their
  framework, target, and deployment-mode compatibility before runtime imports.
- Updated dependencies [5e1d221]
- Updated dependencies [682d7d0]
  - @voyant-travel/action-ledger@0.105.14
  - @voyant-travel/bookings@0.149.1
  - @voyant-travel/db@0.110.1
  - @voyant-travel/hono@0.122.2

## 0.149.0

### Patch Changes

- @voyant-travel/bookings@0.149.0

## 0.148.0

### Patch Changes

- @voyant-travel/bookings@0.148.0

## 0.147.0

### Patch Changes

- @voyant-travel/bookings@0.147.0

## 0.146.0

### Patch Changes

- @voyant-travel/bookings@0.146.0

## 0.145.0

### Patch Changes

- @voyant-travel/bookings@0.145.0

## 0.144.0

### Patch Changes

- Updated dependencies [ba6c30a]
  - @voyant-travel/bookings@0.144.0

## 0.143.0

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/utils@0.106.0
  - @voyant-travel/db@0.110.0
  - @voyant-travel/hono@0.122.0
  - @voyant-travel/core@0.112.3
  - @voyant-travel/bookings@0.143.0
  - @voyant-travel/action-ledger@0.105.13
  - @voyant-travel/types@0.107.1

## 0.142.0

### Patch Changes

- @voyant-travel/bookings@0.142.0

## 0.141.1

### Patch Changes

- @voyant-travel/bookings@0.141.2

## 0.141.0

### Patch Changes

- @voyant-travel/bookings@0.141.0

## 0.140.0

### Patch Changes

- @voyant-travel/bookings@0.140.0

## 0.139.3

### Patch Changes

- 32d0e1c: Split the framework standard runtime composition into lightweight per-module
  lazy route loaders, and allow overlapping lazy route mounts to fall through on
  wrapper route misses so lazy modules/extensions preserve eager route composition
  semantics without swallowing handler-authored 404 responses.
- Updated dependencies [32d0e1c]
  - @voyant-travel/hono@0.121.1

## 0.139.2

### Patch Changes

- 79cc498: Normalize legacy customer payment policy JSON so operator settings and payment policy forms do not crash on existing rows.

## 0.139.1

### Patch Changes

- bbc2334: Expose booking tax settings through the finance admin route mount so local starters can reach `/v1/admin/finance/tax-settings` without the bookings detail route capturing the request.

## 0.139.0

### Minor Changes

- fc71db1: Add read-only agent tools (`./tools`) for four more domains, following the
  module-owned-tools pattern over each package's existing service:

  - `@voyant-travel/bookings`: `list_bookings` + `get_booking` (non-PII, `bookings:read`).
  - `@voyant-travel/finance`: `list_invoices` + `get_invoice` (`finance:read`).
  - `@voyant-travel/quotes`: `list_quotes` + `get_quote` (`quotes:read`).
  - `@voyant-travel/relationships`: `list_people` / `get_person` / `list_organizations` /
    `get_organization` (`crm:read`).

  The operator registers them on the in-deployment MCP server, so `/v1/admin/mcp` now
  serves trips, products, bookings, finance, quotes, and CRM tools, each gated per-tool
  by scope + audience.

- fc71db1: Add write/action + notification agent tools:

  - `@voyant-travel/quotes`: `accept_quote_version` (write, `quotes:write`,
    confirmation-required).
  - `@voyant-travel/finance`: `void_invoice` (destructive, `finance:void`,
    confirmation-required) — the void is a self-contained status transition.
  - `@voyant-travel/notifications`: `list_notification_deliveries` +
    `get_notification_delivery` (read, `notifications:read`).

  The operator registers them on the in-deployment MCP server. A `send_notification`
  tool is deliberately withheld (customer-facing dispatch is an abuse vector and needs
  the provider runtime + rate limiting); booking `cancel` / finance `refund` similarly
  need route-level runtime wiring and will follow as a separate increment.

### Patch Changes

- Updated dependencies [c9a356f]
- Updated dependencies [fc71db1]
- Updated dependencies [6474f42]
- Updated dependencies [5786f63]
- Updated dependencies [1655995]
  - @voyant-travel/types@0.107.0
  - @voyant-travel/core@0.112.0
  - @voyant-travel/hono@0.121.0
  - @voyant-travel/bookings@0.139.0
  - @voyant-travel/tools@0.1.0
  - @voyant-travel/utils@0.105.6
  - @voyant-travel/action-ledger@0.105.12
  - @voyant-travel/db@0.109.5

## 0.138.9

### Patch Changes

- f9c3449: Require an explicit payment date when booking payment schedules are marked already paid.
  - @voyant-travel/bookings@0.138.8

## 0.138.8

### Patch Changes

- Updated dependencies [1cb9cba]
- Updated dependencies [131ff9b]
  - @voyant-travel/hono@0.120.0
  - @voyant-travel/action-ledger@0.105.11
  - @voyant-travel/bookings@0.138.6

## 0.138.7

### Patch Changes

- 141bd2b: Reconcile draft booking items when overriding a booking to confirmed, block item mutations for cancelled bookings, and validate cost currency when cost amounts are entered.
- Updated dependencies [b254511]
- Updated dependencies [141bd2b]
- Updated dependencies [86fbb05]
  - @voyant-travel/bookings@0.138.5
  - @voyant-travel/hono@0.119.0
  - @voyant-travel/action-ledger@0.105.10

## 0.138.6

### Patch Changes

- bcd76ae: Reject invalid or dangling pricing and tax reference-data before writing.
  `POST /v1/admin/pricing/price-schedules` now rejects a nonexistent
  `priceCatalogId` with a deterministic `invalid_reference` 400 instead of a 500.
  Tax regime rates are bounded to the 0..100 percent domain (matching the
  booking-tax calculator that divides by 100), and `POST
/v1/admin/finance/tax-policy-rules` rejects dangling `profileId`/`taxRegimeId`
  references with an `invalid_reference` 400 (mirroring the existing tax-class
  regime guard).
- 37e7758: Reject invalid supplier-invoice payable states: missing supplier ids, negative AP totals or line money values, line totals that do not match quantity times unit amount plus tax, and completed supplier payments above the payable balance. Supplier-invoice UI dialogs now derive line totals and block above-balance payment submissions.
- Updated dependencies [1544a59]
- Updated dependencies [bcd76ae]
  - @voyant-travel/bookings@0.138.4
  - @voyant-travel/finance-contracts@0.105.9

## 0.138.5

### Patch Changes

- ec41b3e: Harden customer invoice accounting invariants in finance routes. Direct invoice creation now handles duplicate invoice numbers and missing booking/person/organization references as structured 4xx responses, invoice and credit-note line totals are validated against quantity and unit amount, completed payments cannot overpay invoices, and credit notes cannot exceed the invoice balance due.

## 0.138.4

### Patch Changes

- a424cae: Show a clear checkout-provider configuration error when payment-link generation is attempted without a registered checkout runtime, and label the booking payment-link full-amount selector with user-facing copy instead of its internal sentinel.

## 0.138.3

### Patch Changes

- c081c71: Keep booking activity and metadata current for note, document, supplier, invoice, and payment child mutations.
- 3fc4487: Reject invalid booking-item finance subresource states: negative tax-line amounts, incomplete commission value bases, paid commissions without paid metadata, and deletion of active booking guarantees.
- aa0135c: Reject zero-value payment authorization and payment capture requests in payment-processing validation.
- 51003c6: Expose booking voucher redemptions in booking-scoped payment reads as voucher payment rows.
- Updated dependencies [c081c71]
- Updated dependencies [3fc4487]
- Updated dependencies [aa0135c]
- Updated dependencies [51003c6]
  - @voyant-travel/bookings@0.138.3
  - @voyant-travel/finance-contracts@0.105.8

## 0.138.2

### Patch Changes

- d1b4da2: Preserve proforma conversion linkage while checkout finalization issues final invoices so invoice-issued subscribers can convert existing provider estimates instead of creating standalone invoices.
- Updated dependencies [d388565]
- Updated dependencies [d1b4da2]
  - @voyant-travel/bookings@0.138.2
  - @voyant-travel/finance-contracts@0.105.7

## 0.138.1

### Patch Changes

- ee4cbf0: Emit an `invoice.payment.recorded` domain event when a completed customer payment is recorded against an invoice.

## 0.138.0

### Patch Changes

- @voyant-travel/bookings@0.138.0

## 0.137.8

### Patch Changes

- 7bdd9cc: Honor `active=false` tax-class list filters and reject tax classes that reference unknown tax regimes.
- Updated dependencies [7bdd9cc]
  - @voyant-travel/finance-contracts@0.105.6

## 0.137.7

## 0.137.6

### Patch Changes

- 2427218: Create flight order payment sessions for bank-transfer booking intents.

## 0.137.5

### Patch Changes

- 0108ccf: Harden booking-confirmed side effects for at-least-once event delivery.

  Catalog now exposes an idempotent booking snapshot graph capture helper for
  event subscribers, so duplicate `booking.confirmed` deliveries observe existing
  snapshot rows instead of surfacing unique constraint errors. Finance now treats
  malformed payment-policy JSON as unset and falls back through the cascade,
  preventing schedule generation from throwing on missing `deposit.kind`.

## 0.137.4

### Patch Changes

- 951409a: Read raw Postgres execute row results when allocating local invoice numbers so active default series resolve correctly during bank-transfer checkout.
- Updated dependencies [24413e3]
  - @voyant-travel/hono@0.118.2

## 0.137.3

### Patch Changes

- 154a6c2: Add an authenticated R2 document download resolver helper for private Worker-route downloads.
- Updated dependencies [154a6c2]
  - @voyant-travel/hono@0.118.1

## 0.137.2

### Patch Changes

- 4eda12a: Republish finance with the current finance-contracts dependency floor so payment-processing schema exports resolve from fresh standalone installs.

## 0.137.1

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/storage@0.106.0
  - @voyant-travel/hono@0.118.0
  - @voyant-travel/action-ledger@0.105.9
  - @voyant-travel/bookings@0.137.1

## 0.137.0

### Patch Changes

- Updated dependencies [7c5ee80]
  - @voyant-travel/hono@0.117.0
  - @voyant-travel/action-ledger@0.105.8
  - @voyant-travel/bookings@0.137.0

## 0.136.2

### Patch Changes

- 12a1eb2: Expose client-safe subpaths for validation schemas, linkable metadata, template authoring metadata, finance payment-policy primitives, and Hono reporter utilities. Move browser-facing React/operator imports off mixed runtime barrels so client bundles do not pull Hono request context or other server-only runtime code.
- Updated dependencies [12a1eb2]
  - @voyant-travel/bookings@0.136.2
  - @voyant-travel/hono@0.116.2

## 0.136.1

### Patch Changes

- @voyant-travel/bookings@0.136.1

## 0.136.0

### Patch Changes

- Updated dependencies [293e5e4]
  - @voyant-travel/hono@0.116.1
  - @voyant-travel/db@0.109.2
  - @voyant-travel/finance-contracts@0.105.2
  - @voyant-travel/bookings@0.136.0

## 0.135.0

### Patch Changes

- @voyant-travel/db@0.109.1
- @voyant-travel/finance-contracts@0.105.1
- @voyant-travel/bookings@0.135.0

## 0.134.1

### Patch Changes

- Updated dependencies [684b321]
- Updated dependencies [2542715]
  - @voyant-travel/hono@0.116.0
  - @voyant-travel/action-ledger@0.105.7
  - @voyant-travel/bookings@0.134.1

## 0.134.0

### Minor Changes

- 51f7dea: Share one list-response contract instead of per-module copies (voyant#2109).

  `@voyant-travel/types` now owns the canonical offset-paginated list envelope: the `ListResponse<T>` type + `listResponse(data, { total, limit, offset })` builder, plus the zod `paginationSchema` (coerced `limit` 1–200 default 50, `offset` ≥0 default 0) and the `listResponseSchema(item)` factory. Both server services and `*-react` clients import from this single source.

  Server side: every module's local `paginate()` / inline `{ data, total, limit, offset }` construction now routes through the shared `listResponse` builder, and the count read is standardized on `count` internally — fixing the drift where finance, notifications and the legal contracts/policies services read `countResult[0]?.total` while every other module read `countResult[0]?.count` (their `count(*)` selects were aliased `total`; they are now aliased `count`). The returned shape is byte-for-byte identical.

  Client side: the ~23 copied `paginatedEnvelope` zod schemas across the `*-react` packages are replaced by re-exporting the shared `listResponseSchema` factory under the same `paginatedEnvelope` name, so consumers are unchanged.

  Input alignment: `finance-contracts` and `legal-contracts` pagination `limit` caps were raised from `.max(100)` to `.max(200)` to match the framework-wide max.

  Additive and non-breaking.

### Patch Changes

- Updated dependencies [04b257c]
- Updated dependencies [78c15fa]
- Updated dependencies [51f7dea]
  - @voyant-travel/hono@0.115.0
  - @voyant-travel/types@0.106.0
  - @voyant-travel/bookings@0.134.0
  - @voyant-travel/finance-contracts@0.105.0
  - @voyant-travel/action-ledger@0.105.6
  - @voyant-travel/utils@0.105.4

## 0.133.0

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/hono@0.114.0
  - @voyant-travel/bookings@0.133.0
  - @voyant-travel/db@0.109.0
  - @voyant-travel/utils@0.105.3
  - @voyant-travel/action-ledger@0.105.5
  - @voyant-travel/finance-contracts@0.104.7

## 0.132.0

### Patch Changes

- @voyant-travel/bookings@0.132.0

## 0.131.2

### Patch Changes

- Updated dependencies [021ec00]
  - @voyant-travel/hono@0.113.0
  - @voyant-travel/core@0.111.0
  - @voyant-travel/action-ledger@0.105.4
  - @voyant-travel/bookings@0.131.1
  - @voyant-travel/db@0.108.5

## 0.131.1

### Patch Changes

- 8c9a402: Make invoice issuance endpoints return the issued row immediately while document sync and PDF attachment work continues asynchronously.

## 0.131.0

### Patch Changes

- @voyant-travel/bookings@0.131.0

## 0.130.0

### Patch Changes

- @voyant-travel/bookings@0.130.0

## 0.129.0

### Patch Changes

- @voyant-travel/bookings@0.129.0

## 0.128.0

### Patch Changes

- @voyant-travel/bookings@0.128.0

## 0.127.0

### Patch Changes

- Updated dependencies [435a5d1]
  - @voyant-travel/bookings@0.127.0

## 0.126.1

### Patch Changes

- 1841ce2: D.2 slice 1 (batch 2) — 14 more packages own + ship their migration history (db, relationships, quotes, identity, distribution, inventory, commerce, catalog, finance, notifications, legal, storefront, charters, cruises). Each baseline reproduces the framework bundle's tables column-for-column, and all package sources now apply together (fresh-D.2 union) without collision.

  Shared enums: the codebase inlines copies of some enums to avoid cross-package schema imports (e.g. `service_type` in distribution + inventory, `entity_type` in relationships + quotes). Per-package generation would emit duplicate `CREATE TYPE`, colliding on a fresh D.2 database. All package migrations now wrap `CREATE TYPE … AS ENUM(…)` in an idempotent `DO`-block guard (subset-safe; whichever source applies first creates the type, the rest no-op). The db package additionally owns the shared Postgres extensions (pg_trgm / unaccent) that downstream trigram indexes need on a fresh D.2 database (the retired bundle injected them; per-package sources did not). The batch-1 packages (operator-settings, action-ledger, workflow-runs, trips) get the same guard for uniformity. No runtime change. See `docs/architecture/migration-collector-d2.md`.

- Updated dependencies [1841ce2]
  - @voyant-travel/db@0.108.4
  - @voyant-travel/action-ledger@0.105.3

## 0.126.0

### Patch Changes

- @voyant-travel/bookings@0.126.0

## 0.125.0

### Patch Changes

- @voyant-travel/db@0.108.3
- @voyant-travel/finance-contracts@0.104.6
- @voyant-travel/bookings@0.125.0
- @voyant-travel/hono@0.112.2

## 0.124.0

### Patch Changes

- @voyant-travel/hono@0.112.1
- @voyant-travel/bookings@0.124.0

## 0.123.0

### Minor Changes

- e9d9dbb: Custom-fields unification (invoice consumption seam). `InvoiceDocumentRuntimeOptions` gains an optional `resolveCustomFields(db, invoice)` hook; when wired, its result is exposed to the invoice template as the `customFields` variable (`{{customFields.<key>}}`). Finance stays decoupled from `relationships` — the deployment provides the resolver where it builds the invoice-generation runtime (it holds the custom-field registry and reads the entity's `custom_fields` column, filtering with `customFieldsVisibleIn(registry, entity, "invoice")`). Completes the reader-consumption trio (export + search are package-side; invoice is deployment-rendered, so finance exposes the hook). See `docs/architecture/custom-fields-unification-adr.md`.

### Patch Changes

- Updated dependencies [04681f3]
- Updated dependencies [98f4a40]
- Updated dependencies [a3bd51c]
- Updated dependencies [3b27dcc]
- Updated dependencies [39d48fe]
- Updated dependencies [d222e9f]
  - @voyant-travel/bookings@0.123.0
  - @voyant-travel/core@0.110.0
  - @voyant-travel/hono@0.112.0
  - @voyant-travel/action-ledger@0.105.1
  - @voyant-travel/db@0.108.2

## 0.122.1

### Patch Changes

- fe775da: Allow card checkout invoice-target collections to use the planned document type so operators can choose proforma anchors before payment capture.

## 0.122.0

### Minor Changes

- c9de9c4: Provider-agnostic card-payment seam: `@voyant-travel/finance` defines the `CardPaymentStarter` contract (`./card-payment`), `@voyant-travel/plugin-netopia` provides `netopiaCardPaymentStarter()`, and the deployment selects its processor in one place. Swapping card processors is a one-line change; checkout surfaces (flights, trips, payment links, catalog) route through the interface.
- 14f4234: New generic order-payment-session service: `createOrderPaymentSessions({ targetType })` → `{ ensureSession, fetchSessions }` (from `@voyant-travel/finance` and `./order-payment-sessions`). Owns the "find live/settled session or create one, then optionally start the provider" logic generically over a target type, so deployments don't reimplement it per order kind.
- 89d4ca9: `@voyant-travel/finance` now owns the payment-policy cascade orchestration: new `createPaymentPolicyCascade(options)` (from `@voyant-travel/finance` and `./payment-policy-cascade`) composes the supplier → category → listing → operator-default precedence, with the vertical schema-walk readers injected (finance must not import the verticals per the retail-spine gate). The bookings-only `__payment_policy_source__` marker protocol (`stampPolicySourceOnBooking` / `readPolicySourceFromInternalNotes`) and the canonical `PaymentPolicyEntityContext` type also move to finance, de-duplicating the prior definition in `payment-schedule/routes.ts`.

### Patch Changes

- 51dd276: `createOrderPaymentSessions` no longer hard-codes `provider: "netopia"` / `paymentMethod: "credit_card"` when creating a session. Sessions are now provider-agnostic by default (both `null`) so the injected starter claims the provider when it runs — correct for Stripe/Adyen/bank-transfer deployments. A deployment may opt into stamping a default via the new `provider` / `paymentMethod` options on `createOrderPaymentSessions`.
  - @voyant-travel/bookings@0.122.0

## 0.121.0

### Minor Changes

- 13fe70b: The finance module now owns the booking payment-schedule routes: new exports `createBookingScheduleAdminRoutes(options)`, `createPaymentPolicyPublicRoutes(options)`, and `generatePaymentScheduleForBooking`, with the policy cascade resolvers + operator default injected as options. Also drops two unused dev-only workspace deps (inventory, operations) that finance never imported.

### Patch Changes

- Updated dependencies [13fe70b]
- Updated dependencies [9ea7220]
- Updated dependencies [13fe70b]
  - @voyant-travel/action-ledger@0.105.0
  - @voyant-travel/hono@0.111.0
  - @voyant-travel/storage@0.105.0
  - @voyant-travel/bookings@0.121.0

## 0.120.2

### Patch Changes

- @voyant-travel/bookings@0.120.3

## 0.120.1

### Patch Changes

- @voyant-travel/bookings@0.120.1

## 0.120.0

### Minor Changes

- 9e970a5: Move checkout collection orchestration and React payment collection surfaces
  behind Finance owner paths. The old Checkout workspace packages are removed
  from the v1 branch while payment plugins, storefront SDK helpers, and the
  operator starter retarget Finance checkout interfaces.

### Patch Changes

- 0fa993c: Remove Finance runtime dependencies on Product and Availability schemas for tax
  facts and profitability/allocation labels. Finance now uses reviewed SQL
  boundary reads for those read-model lookups, keeping Product and Availability as
  dev/test-only dependencies.
- b711b04: Reject generic payment `orderId` request fields and keep legacy order references behind explicit `legacyOrderId` targets.
- 47fef18: Retarget first-party imports from the removed beta package names to their owner
  packages. Operated product UI now imports Inventory React, commercial UI imports
  Commerce React, supplier UI imports Distribution React, checkout UI imports
  Finance React, and operated place/availability schema references import
  Operations owner paths.
- 6196b3b: Move customer portal runtime and React surfaces under Storefront owner paths and
  remove the old customer-portal workspace packages. Remove the retired Checkout
  workspace packages now that Finance and Finance React own checkout collection
  services, hooks, and UI.
- Updated dependencies [2f1228a]
- Updated dependencies [efc803c]
- Updated dependencies [d92d1a8]
- Updated dependencies [6bff46f]
- Updated dependencies [3cc83b6]
- Updated dependencies [9e970a5]
- Updated dependencies [b711b04]
- Updated dependencies [44c3875]
- Updated dependencies [47fef18]
- Updated dependencies [2c9c4a4]
- Updated dependencies [e80e3d3]
  - @voyant-travel/bookings@0.120.0
  - @voyant-travel/hono@0.110.0
  - @voyant-travel/finance-contracts@0.104.5
  - @voyant-travel/action-ledger@0.104.11

## 0.119.5

### Patch Changes

- 434e96d: Split the finance service rollup into operation-focused modules while preserving the existing public service API and behavior.

## 0.119.4

## 0.119.3

### Patch Changes

- @voyant-travel/bookings@0.119.2
- @voyant-travel/products@0.119.3

## 0.119.2

### Patch Changes

- 3f52991: Split finance schema and admin route internals into smaller domain modules while preserving the public package exports.
- Updated dependencies [d097ac1]
  - @voyant-travel/products@0.119.2

## 0.119.1

### Patch Changes

- Updated dependencies [f25e790]
  - @voyant-travel/db@0.108.0
  - @voyant-travel/action-ledger@0.104.9
  - @voyant-travel/availability@0.116.1
  - @voyant-travel/bookings@0.119.1
  - @voyant-travel/hono@0.109.1
  - @voyant-travel/products@0.119.1

## 0.119.0

### Patch Changes

- Updated dependencies [b0f1e21]
- Updated dependencies [b0f1e21]
  - @voyant-travel/hono@0.109.0
  - @voyant-travel/utils@0.105.0
  - @voyant-travel/action-ledger@0.104.8
  - @voyant-travel/availability@0.116.0
  - @voyant-travel/bookings@0.119.0
  - @voyant-travel/products@0.119.0

## 0.118.0

### Patch Changes

- Updated dependencies [004fc38]
  - @voyant-travel/products@0.118.0
  - @voyant-travel/availability@0.115.0
  - @voyant-travel/bookings@0.118.0

## 0.117.1

### Patch Changes

- b7056f1: `GET /aggregates` (admin dashboard KPIs) is now served through a read-through TTL snapshot (`readThroughAggregateSnapshot` from `@voyant-travel/db/aggregate-snapshots`, 60s TTL, keyed by endpoint + query params): the first request computes and stores, subsequent requests within the TTL are ONE indexed read instead of the full aggregate fan-out (finance alone was ~11 queries per dashboard load). Response shapes are unchanged. `Cache-Control` on these endpoints tightened from `private, max-age=60` to `private, max-age=30` (availability gains the header for the first time). Requires the `aggregate_snapshots` table from the upcoming @voyant-travel/db migration — until it is applied, endpoints transparently fall back to live computation.
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
  - @voyant-travel/bookings@0.117.1
  - @voyant-travel/products@0.117.1
  - @voyant-travel/availability@0.114.1
  - @voyant-travel/core@0.109.0
  - @voyant-travel/db@0.107.0
  - @voyant-travel/hono@0.108.0
  - @voyant-travel/action-ledger@0.104.7

## 0.117.0

### Patch Changes

- 7255353: Index pass for the hot finance read paths: `supplier_invoices` hot list/filter indexes (`supplier_id`, `(supplier_id, created_at)`, `status`, `(status, created_at)`, `due_date`) are now partial on `deleted_at IS NULL` — every supplier-invoice read path filters soft-deleted rows, so the indexes shrink and stay usable for all of those queries (same index names, definition change only). New `idx_invoices_created` on `invoices(created_at)` backs the dashboard's monthly rollups, which filter a bare `created_at` range.
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
  - @voyant-travel/bookings@0.117.0
  - @voyant-travel/core@0.108.0
  - @voyant-travel/db@0.106.0
  - @voyant-travel/hono@0.107.0
  - @voyant-travel/availability@0.114.0
  - @voyant-travel/products@0.117.0
  - @voyant-travel/action-ledger@0.104.6

## 0.116.0

### Patch Changes

- Updated dependencies [418fa82]
- Updated dependencies [418fa82]
- Updated dependencies [418fa82]
- Updated dependencies [418fa82]
  - @voyant-travel/core@0.107.0
  - @voyant-travel/db@0.105.0
  - @voyant-travel/hono@0.106.0
  - @voyant-travel/products@0.116.0
  - @voyant-travel/action-ledger@0.104.5
  - @voyant-travel/availability@0.113.0
  - @voyant-travel/bookings@0.116.0

## 0.115.0

### Patch Changes

- @voyant-travel/availability@0.112.0
- @voyant-travel/bookings@0.115.0
- @voyant-travel/products@0.115.0

## 0.114.0

### Patch Changes

- @voyant-travel/availability@0.111.0
- @voyant-travel/bookings@0.114.0
- @voyant-travel/products@0.114.0

## 0.113.0

### Patch Changes

- @voyant-travel/availability@0.110.0
- @voyant-travel/bookings@0.113.0
- @voyant-travel/products@0.113.0

## 0.112.0

### Patch Changes

- @voyant-travel/availability@0.109.0
- @voyant-travel/bookings@0.112.0
- @voyant-travel/products@0.112.0

## 0.111.0

### Patch Changes

- @voyant-travel/availability@0.108.0
- @voyant-travel/bookings@0.111.0
- @voyant-travel/products@0.111.0

## 0.110.0

### Patch Changes

- Updated dependencies [eeb23df]
  - @voyant-travel/core@0.106.0
  - @voyant-travel/action-ledger@0.104.4
  - @voyant-travel/availability@0.107.0
  - @voyant-travel/bookings@0.110.0
  - @voyant-travel/db@0.104.4
  - @voyant-travel/hono@0.105.3
  - @voyant-travel/products@0.110.0

## 0.109.0

### Patch Changes

- Updated dependencies [344e7b6]
  - @voyant-travel/core@0.105.1
  - @voyant-travel/availability@0.106.0
  - @voyant-travel/bookings@0.109.0
  - @voyant-travel/products@0.109.0
  - @voyant-travel/hono@0.105.2

## 0.108.1

### Patch Changes

- 92af490: Parallelize operator dashboard aggregate queries and emit short-lived private cache headers for aggregate responses. Finance also adds an invoice index for outstanding-balance dashboard queries.
- Updated dependencies [92af490]
  - @voyant-travel/bookings@0.108.1
  - @voyant-travel/products@0.108.1

## 0.108.0

### Patch Changes

- Updated dependencies [7122c2a]
  - @voyant-travel/products@0.108.0
  - @voyant-travel/availability@0.105.2
  - @voyant-travel/bookings@0.108.0

## 0.107.1

### Patch Changes

- Updated dependencies [656b25d]
  - @voyant-travel/hono@0.105.0
  - @voyant-travel/action-ledger@0.104.3
  - @voyant-travel/availability@0.105.1
  - @voyant-travel/bookings@0.107.1
  - @voyant-travel/products@0.107.1

## 0.107.0

### Patch Changes

- Updated dependencies [c2aef18]
  - @voyant-travel/core@0.105.0
  - @voyant-travel/db@0.104.3
  - @voyant-travel/finance-contracts@0.104.4
  - @voyant-travel/action-ledger@0.104.2
  - @voyant-travel/availability@0.105.0
  - @voyant-travel/bookings@0.107.0
  - @voyant-travel/hono@0.104.2
  - @voyant-travel/products@0.107.0

## 0.106.7

### Patch Changes

- 9c22b6b: Cancel SmartBill invoices when Voyant invoices are voided and persist the external reference cancellation state.

## 0.106.6

### Patch Changes

- b19888a: Make invoice payment recording idempotent with optional request keys and stable server-derived replay keys.
- Updated dependencies [b19888a]
  - @voyant-travel/finance-contracts@0.104.3

## 0.106.5

### Patch Changes

- 3198c8e: Record `booking.create` action-ledger entries for successful booking creation and duplicate-create rejections.

## 0.106.4

### Patch Changes

- ee93be5: Reject booking-create requests when selected or implicitly seeded room units cannot seat the booking pax.

## 0.106.3

## 0.106.2

### Patch Changes

- 83ff6fd: Detect duplicate invoice number errors across nested Neon/serverless driver error shapes so invoice-from-booking returns a typed invoice number conflict.

## 0.106.1

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
  - @voyant-travel/finance-contracts@0.104.2
  - @voyant-travel/availability@0.104.2
  - @voyant-travel/bookings@0.106.2

## 0.106.0

### Patch Changes

- @voyant-travel/bookings@0.106.0
- @voyant-travel/products@0.106.0

## 0.105.0

### Patch Changes

- Updated dependencies [921f4fc]
  - @voyant-travel/products@0.105.0
  - @voyant-travel/bookings@0.105.0

## 0.104.2

### Patch Changes

- 75a6336: Add an overridable duplicate guard for booking create requests.
  - @voyant-travel/bookings@0.104.2

## 0.104.1

### Patch Changes

- @voyant-travel/action-ledger@0.104.1
- @voyant-travel/bookings@0.104.1
- @voyant-travel/core@0.104.1
- @voyant-travel/db@0.104.1
- @voyant-travel/finance-contracts@0.104.1
- @voyant-travel/hono@0.104.1
- @voyant-travel/products@0.104.1
- @voyant-travel/storage@0.104.1
- @voyant-travel/utils@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/action-ledger@0.104.0
- @voyant-travel/bookings@0.104.0
- @voyant-travel/core@0.104.0
- @voyant-travel/db@0.104.0
- @voyant-travel/finance-contracts@0.104.0
- @voyant-travel/hono@0.104.0
- @voyant-travel/products@0.104.0
- @voyant-travel/storage@0.104.0
- @voyant-travel/utils@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/action-ledger@0.103.0
- @voyant-travel/bookings@0.103.0
- @voyant-travel/core@0.103.0
- @voyant-travel/db@0.103.0
- @voyant-travel/finance-contracts@0.103.0
- @voyant-travel/hono@0.103.0
- @voyant-travel/products@0.103.0
- @voyant-travel/storage@0.103.0
- @voyant-travel/utils@0.103.0

## 0.102.0

### Patch Changes

- Updated dependencies [b6d0673]
  - @voyant-travel/action-ledger@0.102.0
  - @voyant-travel/bookings@0.102.0
  - @voyant-travel/core@0.102.0
  - @voyant-travel/db@0.102.0
  - @voyant-travel/finance-contracts@0.102.0
  - @voyant-travel/hono@0.102.0
  - @voyant-travel/products@0.102.0
  - @voyant-travel/storage@0.102.0
  - @voyant-travel/utils@0.102.0

## 0.101.2

### Patch Changes

- 577eaf5: Republish finance and legal contract packages with the next release so exact internal package dependencies resolve from the public registry.
- Updated dependencies [577eaf5]
- Updated dependencies [577eaf5]
  - @voyant-travel/action-ledger@0.101.2
  - @voyant-travel/bookings@0.101.2
  - @voyant-travel/core@0.101.2
  - @voyant-travel/db@0.101.2
  - @voyant-travel/finance-contracts@0.101.2
  - @voyant-travel/hono@0.101.2
  - @voyant-travel/products@0.101.2
  - @voyant-travel/storage@0.101.2
  - @voyant-travel/utils@0.101.2

## 0.101.1

### Patch Changes

- Updated dependencies [f736ba5]
  - @voyant-travel/action-ledger@0.101.1
  - @voyant-travel/bookings@0.101.1
  - @voyant-travel/core@0.101.1
  - @voyant-travel/db@0.101.1
  - @voyant-travel/finance-contracts@0.101.1
  - @voyant-travel/hono@0.101.1
  - @voyant-travel/products@0.101.1
  - @voyant-travel/storage@0.101.1
  - @voyant-travel/utils@0.101.1

## 0.101.0

### Patch Changes

- Updated dependencies [8e7b56a]
  - @voyant-travel/action-ledger@0.101.0
  - @voyant-travel/bookings@0.101.0
  - @voyant-travel/core@0.101.0
  - @voyant-travel/db@0.101.0
  - @voyant-travel/finance-contracts@0.101.0
  - @voyant-travel/hono@0.101.0
  - @voyant-travel/products@0.101.0
  - @voyant-travel/storage@0.101.0
  - @voyant-travel/utils@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/action-ledger@0.100.0
- @voyant-travel/bookings@0.100.0
- @voyant-travel/core@0.100.0
- @voyant-travel/db@0.100.0
- @voyant-travel/finance-contracts@0.100.0
- @voyant-travel/hono@0.100.0
- @voyant-travel/products@0.100.0
- @voyant-travel/storage@0.100.0
- @voyant-travel/utils@0.100.0

## 0.99.0

### Patch Changes

- Updated dependencies [b7dde79]
  - @voyant-travel/action-ledger@0.99.0
  - @voyant-travel/bookings@0.99.0
  - @voyant-travel/core@0.99.0
  - @voyant-travel/db@0.99.0
  - @voyant-travel/finance-contracts@0.99.0
  - @voyant-travel/hono@0.99.0
  - @voyant-travel/products@0.99.0
  - @voyant-travel/storage@0.99.0
  - @voyant-travel/utils@0.99.0

## 0.98.0

### Patch Changes

- Updated dependencies [485da95]
  - @voyant-travel/action-ledger@0.98.0
  - @voyant-travel/bookings@0.98.0
  - @voyant-travel/core@0.98.0
  - @voyant-travel/db@0.98.0
  - @voyant-travel/finance-contracts@0.98.0
  - @voyant-travel/hono@0.98.0
  - @voyant-travel/products@0.98.0
  - @voyant-travel/storage@0.98.0
  - @voyant-travel/utils@0.98.0

## 0.97.0

### Patch Changes

- Updated dependencies [7094c8e]
  - @voyant-travel/action-ledger@0.97.0
  - @voyant-travel/bookings@0.97.0
  - @voyant-travel/core@0.97.0
  - @voyant-travel/db@0.97.0
  - @voyant-travel/finance-contracts@0.97.0
  - @voyant-travel/hono@0.97.0
  - @voyant-travel/products@0.97.0
  - @voyant-travel/storage@0.97.0
  - @voyant-travel/utils@0.97.0

## 0.96.0

### Patch Changes

- Updated dependencies [465fb31]
  - @voyant-travel/action-ledger@0.96.0
  - @voyant-travel/bookings@0.96.0
  - @voyant-travel/core@0.96.0
  - @voyant-travel/db@0.96.0
  - @voyant-travel/hono@0.96.0
  - @voyant-travel/products@0.96.0
  - @voyant-travel/storage@0.96.0
  - @voyant-travel/utils@0.96.0

## 0.95.0

### Patch Changes

- @voyant-travel/action-ledger@0.95.0
- @voyant-travel/bookings@0.95.0
- @voyant-travel/core@0.95.0
- @voyant-travel/db@0.95.0
- @voyant-travel/hono@0.95.0
- @voyant-travel/products@0.95.0
- @voyant-travel/storage@0.95.0
- @voyant-travel/utils@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/action-ledger@0.94.0
- @voyant-travel/bookings@0.94.0
- @voyant-travel/core@0.94.0
- @voyant-travel/db@0.94.0
- @voyant-travel/hono@0.94.0
- @voyant-travel/products@0.94.0
- @voyant-travel/storage@0.94.0
- @voyant-travel/utils@0.94.0

## 0.93.0

### Patch Changes

- Updated dependencies [5df6824]
  - @voyant-travel/action-ledger@0.93.0
  - @voyant-travel/bookings@0.93.0
  - @voyant-travel/core@0.93.0
  - @voyant-travel/db@0.93.0
  - @voyant-travel/hono@0.93.0
  - @voyant-travel/products@0.93.0
  - @voyant-travel/storage@0.93.0
  - @voyant-travel/utils@0.93.0

## 0.92.0

### Patch Changes

- @voyant-travel/action-ledger@0.92.0
- @voyant-travel/bookings@0.92.0
- @voyant-travel/core@0.92.0
- @voyant-travel/db@0.92.0
- @voyant-travel/hono@0.92.0
- @voyant-travel/products@0.92.0
- @voyant-travel/storage@0.92.0
- @voyant-travel/utils@0.92.0

## 0.91.0

### Patch Changes

- Updated dependencies [dc8554b]
  - @voyant-travel/action-ledger@0.91.0
  - @voyant-travel/bookings@0.91.0
  - @voyant-travel/core@0.91.0
  - @voyant-travel/db@0.91.0
  - @voyant-travel/hono@0.91.0
  - @voyant-travel/products@0.91.0
  - @voyant-travel/storage@0.91.0
  - @voyant-travel/utils@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/action-ledger@0.90.0
- @voyant-travel/bookings@0.90.0
- @voyant-travel/core@0.90.0
- @voyant-travel/db@0.90.0
- @voyant-travel/hono@0.90.0
- @voyant-travel/products@0.90.0
- @voyant-travel/storage@0.90.0
- @voyant-travel/utils@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/action-ledger@0.89.0
- @voyant-travel/bookings@0.89.0
- @voyant-travel/core@0.89.0
- @voyant-travel/db@0.89.0
- @voyant-travel/hono@0.89.0
- @voyant-travel/products@0.89.0
- @voyant-travel/storage@0.89.0
- @voyant-travel/utils@0.89.0

## 0.88.0

### Patch Changes

- @voyant-travel/action-ledger@0.88.0
- @voyant-travel/bookings@0.88.0
- @voyant-travel/core@0.88.0
- @voyant-travel/db@0.88.0
- @voyant-travel/hono@0.88.0
- @voyant-travel/products@0.88.0
- @voyant-travel/storage@0.88.0
- @voyant-travel/utils@0.88.0

## 0.87.1

### Patch Changes

- 5be088f: Use booking item product names and service dates for invoice-from-booking fallback line descriptions.
  - @voyant-travel/action-ledger@0.87.1
  - @voyant-travel/bookings@0.87.1
  - @voyant-travel/core@0.87.1
  - @voyant-travel/db@0.87.1
  - @voyant-travel/hono@0.87.1
  - @voyant-travel/products@0.87.1
  - @voyant-travel/storage@0.87.1
  - @voyant-travel/utils@0.87.1

## 0.87.0

### Patch Changes

- @voyant-travel/action-ledger@0.87.0
- @voyant-travel/bookings@0.87.0
- @voyant-travel/core@0.87.0
- @voyant-travel/db@0.87.0
- @voyant-travel/hono@0.87.0
- @voyant-travel/products@0.87.0
- @voyant-travel/storage@0.87.0
- @voyant-travel/utils@0.87.0

## 0.86.0

### Patch Changes

- @voyant-travel/action-ledger@0.86.0
- @voyant-travel/bookings@0.86.0
- @voyant-travel/core@0.86.0
- @voyant-travel/db@0.86.0
- @voyant-travel/hono@0.86.0
- @voyant-travel/products@0.86.0
- @voyant-travel/storage@0.86.0
- @voyant-travel/utils@0.86.0

## 0.85.4

### Patch Changes

- bed4a3f: Expose invoice-from-booking due-date resolver hooks for schedule-derived documents and clamp overdue schedule dates in operator runtimes.
  - @voyant-travel/action-ledger@0.85.4
  - @voyant-travel/bookings@0.85.4
  - @voyant-travel/core@0.85.4
  - @voyant-travel/db@0.85.4
  - @voyant-travel/hono@0.85.4
  - @voyant-travel/products@0.85.4
  - @voyant-travel/storage@0.85.4
  - @voyant-travel/utils@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/action-ledger@0.85.3
- @voyant-travel/bookings@0.85.3
- @voyant-travel/core@0.85.3
- @voyant-travel/db@0.85.3
- @voyant-travel/hono@0.85.3
- @voyant-travel/products@0.85.3
- @voyant-travel/storage@0.85.3
- @voyant-travel/utils@0.85.3

## 0.85.2

### Patch Changes

- Updated dependencies [2aac1f9]
  - @voyant-travel/action-ledger@0.85.2
  - @voyant-travel/bookings@0.85.2
  - @voyant-travel/core@0.85.2
  - @voyant-travel/db@0.85.2
  - @voyant-travel/hono@0.85.2
  - @voyant-travel/products@0.85.2
  - @voyant-travel/storage@0.85.2
  - @voyant-travel/utils@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/action-ledger@0.85.1
- @voyant-travel/bookings@0.85.1
- @voyant-travel/core@0.85.1
- @voyant-travel/db@0.85.1
- @voyant-travel/hono@0.85.1
- @voyant-travel/products@0.85.1
- @voyant-travel/storage@0.85.1
- @voyant-travel/utils@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/action-ledger@0.85.0
- @voyant-travel/bookings@0.85.0
- @voyant-travel/core@0.85.0
- @voyant-travel/db@0.85.0
- @voyant-travel/hono@0.85.0
- @voyant-travel/products@0.85.0
- @voyant-travel/storage@0.85.0
- @voyant-travel/utils@0.85.0

## 0.84.4

### Patch Changes

- f3f8de1: Return a structured conflict response when proforma conversion attempts to reuse an active final invoice number, preserving the original proforma instead of surfacing a generic server error.
  - @voyant-travel/action-ledger@0.84.4
  - @voyant-travel/bookings@0.84.4
  - @voyant-travel/core@0.84.4
  - @voyant-travel/db@0.84.4
  - @voyant-travel/hono@0.84.4
  - @voyant-travel/products@0.84.4
  - @voyant-travel/storage@0.84.4
  - @voyant-travel/utils@0.84.4

## 0.84.3

### Patch Changes

- Updated dependencies [9eadf50]
  - @voyant-travel/action-ledger@0.84.3
  - @voyant-travel/bookings@0.84.3
  - @voyant-travel/core@0.84.3
  - @voyant-travel/db@0.84.3
  - @voyant-travel/hono@0.84.3
  - @voyant-travel/products@0.84.3
  - @voyant-travel/storage@0.84.3
  - @voyant-travel/utils@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/action-ledger@0.84.2
- @voyant-travel/bookings@0.84.2
- @voyant-travel/core@0.84.2
- @voyant-travel/db@0.84.2
- @voyant-travel/hono@0.84.2
- @voyant-travel/products@0.84.2
- @voyant-travel/storage@0.84.2
- @voyant-travel/utils@0.84.2

## 0.84.1

### Patch Changes

- Updated dependencies [b9ef614]
  - @voyant-travel/action-ledger@0.84.1
  - @voyant-travel/bookings@0.84.1
  - @voyant-travel/core@0.84.1
  - @voyant-travel/db@0.84.1
  - @voyant-travel/hono@0.84.1
  - @voyant-travel/products@0.84.1
  - @voyant-travel/storage@0.84.1
  - @voyant-travel/utils@0.84.1

## 0.84.0

### Minor Changes

- 4ea42b3: Add tokenized public document delivery grants, a public document download route, and opt-in public download envelopes for generated finance and legal documents.

### Patch Changes

- Updated dependencies [4ea42b3]
  - @voyant-travel/action-ledger@0.84.0
  - @voyant-travel/bookings@0.84.0
  - @voyant-travel/core@0.84.0
  - @voyant-travel/db@0.84.0
  - @voyant-travel/hono@0.84.0
  - @voyant-travel/products@0.84.0
  - @voyant-travel/storage@0.84.0
  - @voyant-travel/utils@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/action-ledger@0.83.1
- @voyant-travel/bookings@0.83.1
- @voyant-travel/core@0.83.1
- @voyant-travel/db@0.83.1
- @voyant-travel/hono@0.83.1
- @voyant-travel/products@0.83.1
- @voyant-travel/storage@0.83.1
- @voyant-travel/utils@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/action-ledger@0.83.0
- @voyant-travel/bookings@0.83.0
- @voyant-travel/core@0.83.0
- @voyant-travel/db@0.83.0
- @voyant-travel/hono@0.83.0
- @voyant-travel/products@0.83.0
- @voyant-travel/storage@0.83.0
- @voyant-travel/utils@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/action-ledger@0.82.1
- @voyant-travel/bookings@0.82.1
- @voyant-travel/core@0.82.1
- @voyant-travel/db@0.82.1
- @voyant-travel/hono@0.82.1
- @voyant-travel/products@0.82.1
- @voyant-travel/storage@0.82.1
- @voyant-travel/utils@0.82.1

## 0.82.0

### Patch Changes

- 79ce168: Slot-detail / allocation / booking-sheet UX pass.

  - `AvailabilitySlotDetailPage`: status badge color-coded by tone (open=green, closed/sold-out=red), product-type badge, locale-formatted date range with timezone chip, financial KPI cards (Remaining/Initial Pax, Total, Paid + %, Outstanding + %, per-currency rollup), timeline-style Activity tab, `<dl>`-style Metadata tab, AlertDialog delete confirmation, host-driven Edit / Open Product / Create Booking actions.
  - Slot allocation grid: side-by-side Unallocated + resources layout kicks in at `lg:` instead of `xl:`; payment-status chip palette unchanged but Tailwind source paths now cover `@voyant-travel/allocation-ui` in the operator template so the colors actually render.
  - `AvailabilitySlotsTab`: optional header / `asPanel` / `hideBulkDelete` / `bulkStatusSelect` props let hosts embed the slots table outside of a Tabs shell and replace the bulk Open/Close buttons with a single "Change status" select.
  - Allocation manifest now exposes `sellAmountCents` / `paidAmountCents` per booking (and `derivePaidAmountCents` is exported from `@voyant-travel/availability`). `productOptionSchema` adds `sellCurrency` and `productType` so consumers can drive currency / badge UI off the catalog response.
  - `GET /v1/products/:id` joins `product_types` and returns `productType` alongside the product row via new `productsService.getProductByIdWithType`.
  - `BookingCreateDialog` → `BookingCreateSheet` (file + symbol + registry slug rename). Right-side wide sheet, departure picker disables when opened with a `defaultSlotId`, full-mode payment schedule defaults the due date to the departure day until the operator touches it, payment-schedule currency falls back through product → pricing → placeholder so the server's `invalid_payment_schedules` validator stops rejecting mismatched currencies, slot-allocation cache busted after create so new bookings appear without a manual refresh.
  - `BookingQuickViewSheet`: real Payer section (email/phone/language/website/address), card-per-traveler details (email/phone/language/special-requests/notes), per-traveler document list, and a collapsible "More info" that lazily calls the audit-logged reveal endpoint to surface DOB / nationality / document / dietary / accessibility / bed preference.
  - `ProductQuickViewSheet`: new component in `@voyant-travel/products-ui` mirroring the booking quick view shape — cover image, booking/capacity mode badges, full description, dates, itinerary days (with location + description), options list with status badges, tags, "View full product" footer.
  - `AsyncCombobox` now forwards `disabled` to `ComboboxInput` so disabled comboboxes are actually uneditable.
  - `DataTable` selection checkboxes use bubble-phase `stopPropagation` (wrapped in a `<div>`) instead of `onClickCapture` — fixes the "checkbox doesn't fire" bug under base-ui's checkbox event flow.
  - `useBookingCreateMutation` consumers (sheet) invalidate `availabilityQueryKeys.slots()` after create.
  - `loadProductOptionUnits` in finance booking-create now uses the exported `toRows<T>` normalizer to handle both `drizzle-orm/postgres-js` and `drizzle-orm/node-postgres` return shapes.
  - Operator template: Availability nav item moved directly under Products; slot detail route hosts the new edit dialog, booking quick view, product quick view; Tailwind `@source` scans `@voyant-travel/allocation-ui` dist + src.
  - I18n: en/ro keys added for `tabSlots: "List"` rename, slot detail Activity timeline filters, slot Meta block, "Change status", "Create booking", "Edit slot", traveler reveal labels, booking quick view payer.

- Updated dependencies [79ce168]
  - @voyant-travel/action-ledger@0.82.0
  - @voyant-travel/bookings@0.82.0
  - @voyant-travel/core@0.82.0
  - @voyant-travel/db@0.82.0
  - @voyant-travel/hono@0.82.0
  - @voyant-travel/products@0.82.0
  - @voyant-travel/storage@0.82.0
  - @voyant-travel/utils@0.82.0

## 0.81.21

### Patch Changes

- Updated dependencies [b9fb5b0]
  - @voyant-travel/action-ledger@0.81.21
  - @voyant-travel/bookings@0.81.21
  - @voyant-travel/core@0.81.21
  - @voyant-travel/db@0.81.21
  - @voyant-travel/hono@0.81.21
  - @voyant-travel/products@0.81.21
  - @voyant-travel/storage@0.81.21
  - @voyant-travel/utils@0.81.21

## 0.81.20

### Patch Changes

- Updated dependencies [e60a50d]
  - @voyant-travel/action-ledger@0.81.20
  - @voyant-travel/bookings@0.81.20
  - @voyant-travel/core@0.81.20
  - @voyant-travel/db@0.81.20
  - @voyant-travel/hono@0.81.20
  - @voyant-travel/products@0.81.20
  - @voyant-travel/storage@0.81.20
  - @voyant-travel/utils@0.81.20

## 0.81.19

### Patch Changes

- Updated dependencies [62e4be5]
  - @voyant-travel/action-ledger@0.81.19
  - @voyant-travel/bookings@0.81.19
  - @voyant-travel/core@0.81.19
  - @voyant-travel/db@0.81.19
  - @voyant-travel/hono@0.81.19
  - @voyant-travel/products@0.81.19
  - @voyant-travel/storage@0.81.19
  - @voyant-travel/utils@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/action-ledger@0.81.18
- @voyant-travel/bookings@0.81.18
- @voyant-travel/core@0.81.18
- @voyant-travel/db@0.81.18
- @voyant-travel/hono@0.81.18
- @voyant-travel/products@0.81.18
- @voyant-travel/storage@0.81.18
- @voyant-travel/utils@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/action-ledger@0.81.17
- @voyant-travel/bookings@0.81.17
- @voyant-travel/core@0.81.17
- @voyant-travel/db@0.81.17
- @voyant-travel/hono@0.81.17
- @voyant-travel/products@0.81.17
- @voyant-travel/storage@0.81.17
- @voyant-travel/utils@0.81.17

## 0.81.16

### Patch Changes

- 0a617cc: Operator-dashboard booking-detail UX polish + finance refactors.

  **Booking list & detail**

  - Bookings index hides `draft` + `expired` by default; new `excludeStatuses` filter on the bookings list endpoint + react query keys.
  - Booking-detail subtitle now shows `Billing person / Product / Dates / PAX` with clickable links to the CRM person, product, and availability slot; product title truncates at 18rem with full-text tooltip.
  - Header action menu replaced by inline outline buttons (Edit / Change status / Cancel / Delete). Delete uses a proper `AlertDialog` instead of `window.confirm`.
  - Stat-card currency layout is now `<symbol> <amount> <code>` for every currency except RON (collapses to `<amount> RON`).
  - Items table dates use the active locale (`formatDateTime` from i18n provider) and show start → end when both timestamps exist.
  - Tabs reordered: Documents now precedes Suppliers.

  **Tab refactors (Items / Travelers / Payments / Invoices / Documents / Suppliers / Payment-schedule)**

  - All seven tabs migrated off `<Card>` + raw `<table>` onto the shared `<div data-slot>` + `DataTable` + `IconActionButton` + `StatusBadge` + `AlertDialog` pattern.
  - Snapshots opened in a `<Sheet>` so operators stay on the booking page.

  **Invoices tab**

  - New `BookingInvoiceDialog` (Dialog, not Sheet) for "New Invoice": Type segmented (Invoice / Proforma), Source segmented (Schedule / Custom), schedule-driven prefill that auto-derives net unit amount, tax%, due date; manual line items with add/remove; auto-derived Subtotal/Tax/Total (always read-only); SmartBill sync toggle (defaults on); Mark as paid switch with method + date pickers; attachment uploader when sync is off; sandboxed iframe contract preview.
  - Generate-from-schedule line items now back the tax out of the gross schedule amount (no more 21% inflation on top).
  - Server omits `subtotalCents/taxCents/totalCents` cross-check when client doesn't pre-compute totals.

  **Add-contract dialog (new)**

  - `BookingContractDialog` replaces the per-row "Generate contract" button. Two modes — Generate (default, preselected) renders an iframe preview via a new `?preview=true` branch on `/v1/admin/bookings/:id/generate-contract`, and Upload (title + PDF) creates a `signed`-status contract row + attaches the file.
  - Legal `autoGenerateContractForBooking` gains a `previewMode` option that stops after rendering HTML without persisting.

  **Payment schedule**

  - Switched `PaymentScheduleValue` from fixed slots to a `installments: PaymentInstallment[]` array. Mode-switch prefills due dates between today and **one day before departure** (clamps to today when lead time ≤ 1 day) and distributes amounts evenly. Add/remove redistributes amounts so the rows always sum to the booking total.
  - New Invoice column on the schedule table links to the invoice/proforma covering each row.
  - Generate-invoice / Generate-proforma actions hide when an invoice (or proforma) already covers the row, preventing accidental duplicate documents.
  - Server-side `assertBookingPaymentScheduleHasPaymentCoverage` no longer requires session-linked payments — it sums every completed payment under the booking's invoices (with FX-equivalent amounts via `baseAmountCents`) and subtracts other schedules already paid, so manually-recorded payments can mark a schedule paid.
  - Schedule edit dialog now surfaces server validation errors inline instead of swallowing them.

  **Record payment dialog**

  - "Convert proforma to invoice" switch shown when the selected invoice is a proforma + status is Completed. Default off; auto-flips on only when the entered amount (directly or via FX) covers the invoice's remaining balance. Heuristic freezes once the operator toggles. Conversion fires post-create so a failure surfaces without rolling back the payment.
  - `useInvoicePaymentMutation` now invalidates the booking-scoped payment lists (`admin-booking-payments`) so the table refreshes after recording.

  **Proforma → invoice linkage**

  - `getInvoiceById` returns `convertedToInvoiceId` + `convertedToInvoiceNumber` (the inverse of `convertedFromInvoiceId`). The invoice sheet shows a green "Invoiced" / "Facturat" status with a deep link to the final invoice when a void proforma was converted. Converted proformas are filtered out of the invoices table on the booking detail page.

  **New booking dialog**

  - The three document-related checkboxes (Generate contract / Generate invoice / Create as draft) collapse into two mutually-exclusive options: "Generate proforma" and "Generate invoice and contract". `invoiceType` plumbs through the catalog booking-engine contract, products handler, finance service, and react hook.

  **Misc**

  - SmartBill plugin honors a new `skipExternalSync` flag on `invoice.issued` / `invoice.proforma.issued` so per-invoice opt-out from external sync is possible.
  - SmartBill rate-limit date parser now anchors `24/05/2026 09:32:48`-style timestamps to UTC instead of the JS host's local time. The instant decoded from the same response is now identical on CI (UTC) and on developer machines in non-UTC zones (e.g. Europe/Bucharest, EEST). Fixes a pre-existing test failure when running locally outside UTC.
  - Bookings list excludeStatuses filter (string-or-array) parsed by `bookingListQuerySchema`.
  - `BookingPaymentsSummary` adds an FX equivalent column with `baseCurrency` + `baseAmountCents` plumbed through `publicFinanceBookingPaymentSchema` and the operator `useAdminBookingPayments` projection.
  - Currency combobox now correctly disables (forwards `disabled` to the inner input and hides the clear button when disabled).
  - New shared primitives in `@voyant-travel/bookings-ui`: `IconActionButton` (icon button with built-in tooltip) and `StatusBadge` (semantic tone mapping for status strings) — exported from the package root.

- Updated dependencies [0a617cc]
  - @voyant-travel/action-ledger@0.81.16
  - @voyant-travel/bookings@0.81.16
  - @voyant-travel/core@0.81.16
  - @voyant-travel/db@0.81.16
  - @voyant-travel/hono@0.81.16
  - @voyant-travel/products@0.81.16
  - @voyant-travel/storage@0.81.16
  - @voyant-travel/utils@0.81.16

## 0.81.15

### Patch Changes

- b6bc138: Add invoice-from-booking schedule line description format options for product-first and product-only legal line names.
  - @voyant-travel/action-ledger@0.81.15
  - @voyant-travel/bookings@0.81.15
  - @voyant-travel/core@0.81.15
  - @voyant-travel/db@0.81.15
  - @voyant-travel/hono@0.81.15
  - @voyant-travel/products@0.81.15
  - @voyant-travel/storage@0.81.15
  - @voyant-travel/utils@0.81.15

## 0.81.14

### Patch Changes

- 0a77ff9: Preserve booking item display context for invoice-from-booking payment schedule lines and expose invoice line description resolution through finance route runtime options.
  - @voyant-travel/action-ledger@0.81.14
  - @voyant-travel/bookings@0.81.14
  - @voyant-travel/core@0.81.14
  - @voyant-travel/db@0.81.14
  - @voyant-travel/hono@0.81.14
  - @voyant-travel/products@0.81.14
  - @voyant-travel/storage@0.81.14
  - @voyant-travel/utils@0.81.14

## 0.81.13

### Patch Changes

- Updated dependencies [28dca55]
  - @voyant-travel/action-ledger@0.81.13
  - @voyant-travel/bookings@0.81.13
  - @voyant-travel/core@0.81.13
  - @voyant-travel/db@0.81.13
  - @voyant-travel/hono@0.81.13
  - @voyant-travel/products@0.81.13
  - @voyant-travel/storage@0.81.13
  - @voyant-travel/utils@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/action-ledger@0.81.12
- @voyant-travel/bookings@0.81.12
- @voyant-travel/core@0.81.12
- @voyant-travel/db@0.81.12
- @voyant-travel/hono@0.81.12
- @voyant-travel/products@0.81.12
- @voyant-travel/storage@0.81.12
- @voyant-travel/utils@0.81.12

## 0.81.11

### Patch Changes

- ef079f4: Allow voided invoices to release external invoice numbers for reissue and surface external allocation writeback conflicts on SmartBill refs.
  - @voyant-travel/action-ledger@0.81.11
  - @voyant-travel/bookings@0.81.11
  - @voyant-travel/core@0.81.11
  - @voyant-travel/db@0.81.11
  - @voyant-travel/hono@0.81.11
  - @voyant-travel/products@0.81.11
  - @voyant-travel/storage@0.81.11
  - @voyant-travel/utils@0.81.11

## 0.81.10

### Patch Changes

- 6c6a008: Preserve booking payment schedule context on invoice line items and issued invoice events.
  - @voyant-travel/action-ledger@0.81.10
  - @voyant-travel/bookings@0.81.10
  - @voyant-travel/core@0.81.10
  - @voyant-travel/db@0.81.10
  - @voyant-travel/hono@0.81.10
  - @voyant-travel/products@0.81.10
  - @voyant-travel/storage@0.81.10
  - @voyant-travel/utils@0.81.10

## 0.81.9

### Patch Changes

- 1a58939: Preserve billing contact address line 2 on booking snapshots and downstream documents.
- Updated dependencies [1a58939]
  - @voyant-travel/action-ledger@0.81.9
  - @voyant-travel/bookings@0.81.9
  - @voyant-travel/core@0.81.9
  - @voyant-travel/db@0.81.9
  - @voyant-travel/hono@0.81.9
  - @voyant-travel/products@0.81.9
  - @voyant-travel/storage@0.81.9
  - @voyant-travel/utils@0.81.9

## 0.81.8

### Patch Changes

- Updated dependencies [688ac4f]
  - @voyant-travel/action-ledger@0.81.8
  - @voyant-travel/bookings@0.81.8
  - @voyant-travel/core@0.81.8
  - @voyant-travel/db@0.81.8
  - @voyant-travel/hono@0.81.8
  - @voyant-travel/products@0.81.8
  - @voyant-travel/storage@0.81.8
  - @voyant-travel/utils@0.81.8

## 0.81.7

### Patch Changes

- Updated dependencies [410cd17]
  - @voyant-travel/action-ledger@0.81.7
  - @voyant-travel/bookings@0.81.7
  - @voyant-travel/core@0.81.7
  - @voyant-travel/db@0.81.7
  - @voyant-travel/hono@0.81.7
  - @voyant-travel/products@0.81.7
  - @voyant-travel/storage@0.81.7
  - @voyant-travel/utils@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/action-ledger@0.81.6
- @voyant-travel/bookings@0.81.6
- @voyant-travel/core@0.81.6
- @voyant-travel/db@0.81.6
- @voyant-travel/hono@0.81.6
- @voyant-travel/products@0.81.6
- @voyant-travel/storage@0.81.6
- @voyant-travel/utils@0.81.6

## 0.81.5

### Patch Changes

- 7d8a977: Normalize legacy person-keyed accommodation booking-create item lines onto their inventory unit before item insertion, linking, and server-side draft verification.
  - @voyant-travel/action-ledger@0.81.5
  - @voyant-travel/bookings@0.81.5
  - @voyant-travel/core@0.81.5
  - @voyant-travel/db@0.81.5
  - @voyant-travel/hono@0.81.5
  - @voyant-travel/products@0.81.5
  - @voyant-travel/storage@0.81.5
  - @voyant-travel/utils@0.81.5

## 0.81.4

### Patch Changes

- 6daefc4: Add stable booking-create traveler keys for item and extra line traveler linkage, while keeping deprecated position-based traveler indexes as a transition fallback.
- Updated dependencies [6daefc4]
  - @voyant-travel/action-ledger@0.81.4
  - @voyant-travel/bookings@0.81.4
  - @voyant-travel/core@0.81.4
  - @voyant-travel/db@0.81.4
  - @voyant-travel/hono@0.81.4
  - @voyant-travel/products@0.81.4
  - @voyant-travel/storage@0.81.4
  - @voyant-travel/utils@0.81.4

## 0.81.3

### Patch Changes

- Updated dependencies [f157bcd]
  - @voyant-travel/action-ledger@0.81.3
  - @voyant-travel/bookings@0.81.3
  - @voyant-travel/core@0.81.3
  - @voyant-travel/db@0.81.3
  - @voyant-travel/hono@0.81.3
  - @voyant-travel/products@0.81.3
  - @voyant-travel/storage@0.81.3
  - @voyant-travel/utils@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/action-ledger@0.81.2
- @voyant-travel/bookings@0.81.2
- @voyant-travel/core@0.81.2
- @voyant-travel/db@0.81.2
- @voyant-travel/hono@0.81.2
- @voyant-travel/products@0.81.2
- @voyant-travel/storage@0.81.2
- @voyant-travel/utils@0.81.2

## 0.81.1

### Patch Changes

- 2ce08ff: Emit a distinct proforma conversion event, convert SmartBill estimates into invoices instead of issuing duplicates, and reject new payments against void invoices.
  - @voyant-travel/action-ledger@0.81.1
  - @voyant-travel/bookings@0.81.1
  - @voyant-travel/core@0.81.1
  - @voyant-travel/db@0.81.1
  - @voyant-travel/hono@0.81.1
  - @voyant-travel/products@0.81.1
  - @voyant-travel/storage@0.81.1
  - @voyant-travel/utils@0.81.1

## 0.81.0

### Minor Changes

- f35e63c: Separate inventory units (rooms, vehicles) from pricing tiers (Adult / Child / Infant) in the booking-create flow. RFC voyant-travel/voyant#1267.

  ## What changed

  ### `@voyant-travel/bookings` — new `./pricing-assignment` sub-path

  Single source of truth for traveler→option-unit mapping, transport-agnostic. The booking-create dialog (preview + submit) is the only call site today; the server-side submit validation pathway is a follow-up — but the module is now placed where that wiring is straightforward:

  ```ts
  import {
    resolveBookingDraft,
    resolveBookingExtraLines,
  } from "@voyant-travel/bookings/pricing-assignment";
  ```

  `resolveBookingDraft` distinguishes **person-priced options** (excursions — line quantities derive from travelers) from **accommodation options** (rooms — quantities stay as the operator picked them). Returns `{ quantities, travelers, travelerIndexesByUnitId }` so submit can write `booking_item_travelers` linkage.

  `resolveBookingExtraLines` normalizes per-person extras to charged traveler quantity and stamps `travelerIndexes` so each extra line gets linked to the travelers it applies to.

  A new `roomUnitAssignmentSource: "auto" | "manual" | "none"` enum on the in-memory traveler tracks operator intent declaratively (was a one-shot `useRef` ratchet). `none` = explicit "No room" survives resolver re-runs; `auto` is re-derived; `manual` is preserved while the unit is still in the current option set.

  ### Wire format additions on `BookingCreateItemLineInput` / `BookingCreateExtraLineInput`

  - `clientLineKey?: string | null` — stable client-side key the server stamps into `booking_items.metadata.bookingCreateLineKey` for post-insert lookup.
  - `travelerIndexes?: number[] | null` — indexes (into the request's `travelers` array) the item/extra applies to. Server inserts one row in the existing `booking_item_travelers` join table per (item, traveler) pair.

  `roomUnitId` on each traveler is unchanged on the wire — current dialogs keep working without modification.

  ### `@voyant-travel/finance` — orchestrator links items to travelers

  `POST /v1/bookings/create`: after travelers + items are inserted, the orchestrator looks up each item by its stamped `metadata.bookingCreateLineKey` and writes one `booking_item_travelers` row per requested traveler. Idempotent (dedupes by `(item_id, traveler_id)`), skips silently when the converter didn't produce an item for that key.

  ### `@voyant-travel/bookings-ui` — resolver-driven dialog

  - Dropped the locally-defined `pickUnitForAge` / `redistributeByAge` (moved to the assignment module in Phase 2).
  - `displayQuantities` + submit both go through `resolveBookingDraft`. `displayExtraLines` (preview) + submit extras both go through `resolveBookingExtraLines`. No more drift.
  - The submit pipeline sends `clientLineKey` + `travelerIndexes` on every item and per-person extra so the server can link them.
  - `TravelerEntry` gains `roomUnitAssignmentSource`; category/Room/person-picker handlers set it explicitly (`manual` / `none` / `auto`).
  - Dropped the one-shot hydration `useRef` from #1265 — the source enum + resolver re-derivation handle the race + "No room" disambiguation declaratively.

  ### Architecture doc

  `docs/architecture/booking-journey-architecture.md` now codifies the invariant: traveler age/pricing band, sellable option unit, room/accommodation assignment, and explicit "no room" intent are separate draft concepts; preview totals and submit payloads must be derived from the same resolver; item/extra applicability is persisted through `booking_item_travelers`, not inferred from labels or counts. This prevents future regressions of the bug class behind #1234 / #1239 / #1262.

  ## Why this shape (vs. adding columns to `booking_travelers`)

  The `booking_item_travelers` join table already existed for participant↔item linkage. Using it for unit assignment leverages a tool that was already in the codebase — no schema migration needed, and the model naturally handles cases where one traveler is linked to several items (room + per-pax extra + ...). Adding `pricing_unit_id` / `inventory_unit_id` columns directly to `booking_travelers` (the original plan in #1267 / earlier iterations of this PR) would have been a denormalization of what the join table already expresses.

  ## Backwards compatibility

  - Existing wire-format clients that send `roomUnitId` on each traveler keep working — the server still accepts it (round-trips through, no behavioral change).
  - New clients should send `pricingUnitId` semantics through `itemLines[].travelerIndexes` (the join-table model). The current dialog still uses `roomUnitId` internally; that's fine, the resolver bridges.
  - No database migration. Pre-existing `booking_item_travelers` data is unaffected.

### Patch Changes

- Updated dependencies [f35e63c]
  - @voyant-travel/action-ledger@0.81.0
  - @voyant-travel/bookings@0.81.0
  - @voyant-travel/core@0.81.0
  - @voyant-travel/db@0.81.0
  - @voyant-travel/hono@0.81.0
  - @voyant-travel/products@0.81.0
  - @voyant-travel/storage@0.81.0
  - @voyant-travel/utils@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/action-ledger@0.80.18
- @voyant-travel/bookings@0.80.18
- @voyant-travel/core@0.80.18
- @voyant-travel/db@0.80.18
- @voyant-travel/hono@0.80.18
- @voyant-travel/products@0.80.18
- @voyant-travel/storage@0.80.18
- @voyant-travel/utils@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/action-ledger@0.80.17
- @voyant-travel/bookings@0.80.17
- @voyant-travel/core@0.80.17
- @voyant-travel/db@0.80.17
- @voyant-travel/hono@0.80.17
- @voyant-travel/products@0.80.17
- @voyant-travel/storage@0.80.17
- @voyant-travel/utils@0.80.17

## 0.80.16

### Patch Changes

- dbcc0da: Add admin invoice voiding and route finance admin clients through `/v1/admin/finance`.
  - @voyant-travel/action-ledger@0.80.16
  - @voyant-travel/bookings@0.80.16
  - @voyant-travel/core@0.80.16
  - @voyant-travel/db@0.80.16
  - @voyant-travel/hono@0.80.16
  - @voyant-travel/products@0.80.16
  - @voyant-travel/storage@0.80.16
  - @voyant-travel/utils@0.80.16

## 0.80.15

### Patch Changes

- Updated dependencies [0d8d14e]
  - @voyant-travel/action-ledger@0.80.15
  - @voyant-travel/bookings@0.80.15
  - @voyant-travel/core@0.80.15
  - @voyant-travel/db@0.80.15
  - @voyant-travel/hono@0.80.15
  - @voyant-travel/products@0.80.15
  - @voyant-travel/storage@0.80.15
  - @voyant-travel/utils@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/action-ledger@0.80.14
- @voyant-travel/bookings@0.80.14
- @voyant-travel/core@0.80.14
- @voyant-travel/db@0.80.14
- @voyant-travel/hono@0.80.14
- @voyant-travel/products@0.80.14
- @voyant-travel/storage@0.80.14
- @voyant-travel/utils@0.80.14

## 0.80.13

### Patch Changes

- 55d99af: Assert invoice line item persistence when creating invoices from bookings.
  - @voyant-travel/action-ledger@0.80.13
  - @voyant-travel/bookings@0.80.13
  - @voyant-travel/core@0.80.13
  - @voyant-travel/db@0.80.13
  - @voyant-travel/hono@0.80.13
  - @voyant-travel/products@0.80.13
  - @voyant-travel/storage@0.80.13
  - @voyant-travel/utils@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/action-ledger@0.80.12
- @voyant-travel/bookings@0.80.12
- @voyant-travel/core@0.80.12
- @voyant-travel/db@0.80.12
- @voyant-travel/hono@0.80.12
- @voyant-travel/products@0.80.12
- @voyant-travel/storage@0.80.12
- @voyant-travel/utils@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/action-ledger@0.80.11
- @voyant-travel/bookings@0.80.11
- @voyant-travel/core@0.80.11
- @voyant-travel/db@0.80.11
- @voyant-travel/hono@0.80.11
- @voyant-travel/products@0.80.11
- @voyant-travel/storage@0.80.11
- @voyant-travel/utils@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/action-ledger@0.80.10
- @voyant-travel/bookings@0.80.10
- @voyant-travel/core@0.80.10
- @voyant-travel/db@0.80.10
- @voyant-travel/hono@0.80.10
- @voyant-travel/products@0.80.10
- @voyant-travel/storage@0.80.10
- @voyant-travel/utils@0.80.10

## 0.80.9

### Patch Changes

- Updated dependencies [37aa8b6]
  - @voyant-travel/action-ledger@0.80.9
  - @voyant-travel/bookings@0.80.9
  - @voyant-travel/core@0.80.9
  - @voyant-travel/db@0.80.9
  - @voyant-travel/hono@0.80.9
  - @voyant-travel/products@0.80.9
  - @voyant-travel/storage@0.80.9
  - @voyant-travel/utils@0.80.9

## 0.80.8

### Patch Changes

- 6ba4515: Allow invoice-from-booking requests to pre-seed invoice external refs before issued events run.
  - @voyant-travel/action-ledger@0.80.8
  - @voyant-travel/bookings@0.80.8
  - @voyant-travel/core@0.80.8
  - @voyant-travel/db@0.80.8
  - @voyant-travel/hono@0.80.8
  - @voyant-travel/products@0.80.8
  - @voyant-travel/storage@0.80.8
  - @voyant-travel/utils@0.80.8

## 0.80.7

### Patch Changes

- e16eb2f: Allow invoice-from-booking requests to override invoice currency and line items while validating external fiscal totals.
  - @voyant-travel/action-ledger@0.80.7
  - @voyant-travel/bookings@0.80.7
  - @voyant-travel/core@0.80.7
  - @voyant-travel/db@0.80.7
  - @voyant-travel/hono@0.80.7
  - @voyant-travel/products@0.80.7
  - @voyant-travel/storage@0.80.7
  - @voyant-travel/utils@0.80.7

## 0.80.6

### Patch Changes

- f7df51b: Bump the Voyant Data SDK dependency to avoid the consumer-side global this runtime issue.
  - @voyant-travel/action-ledger@0.80.6
  - @voyant-travel/bookings@0.80.6
  - @voyant-travel/core@0.80.6
  - @voyant-travel/db@0.80.6
  - @voyant-travel/hono@0.80.6
  - @voyant-travel/products@0.80.6
  - @voyant-travel/storage@0.80.6
  - @voyant-travel/utils@0.80.6

## 0.80.5

### Patch Changes

- f27b01f: Validate booking-create payment schedule currencies and confirmed totals before persisting schedules.
- d1ae342: Auto-compute base amounts for cross-currency finance records using configured FX commission and persisted rate-set links.
  - @voyant-travel/action-ledger@0.80.5
  - @voyant-travel/bookings@0.80.5
  - @voyant-travel/core@0.80.5
  - @voyant-travel/db@0.80.5
  - @voyant-travel/hono@0.80.5
  - @voyant-travel/products@0.80.5
  - @voyant-travel/storage@0.80.5
  - @voyant-travel/utils@0.80.5

## 0.80.4

### Patch Changes

- a411b1c: Use `@voyant-travel/data-sdk` for the Voyant Data FX resolver and expose optional FX provenance fields.
  - @voyant-travel/action-ledger@0.80.4
  - @voyant-travel/bookings@0.80.4
  - @voyant-travel/core@0.80.4
  - @voyant-travel/db@0.80.4
  - @voyant-travel/hono@0.80.4
  - @voyant-travel/products@0.80.4
  - @voyant-travel/storage@0.80.4
  - @voyant-travel/utils@0.80.4

## 0.80.3

### Patch Changes

- 6d816bb: Add `Idempotency-Key` replay support to admin create routes for CRM people and organizations, finance invoices, and legal contracts.
- Updated dependencies [6d816bb]
  - @voyant-travel/action-ledger@0.80.3
  - @voyant-travel/bookings@0.80.3
  - @voyant-travel/core@0.80.3
  - @voyant-travel/db@0.80.3
  - @voyant-travel/hono@0.80.3
  - @voyant-travel/products@0.80.3
  - @voyant-travel/storage@0.80.3
  - @voyant-travel/utils@0.80.3

## 0.80.2

### Patch Changes

- Updated dependencies [7a94871]
- Updated dependencies [9d6be13]
  - @voyant-travel/action-ledger@0.80.2
  - @voyant-travel/bookings@0.80.2
  - @voyant-travel/core@0.80.2
  - @voyant-travel/db@0.80.2
  - @voyant-travel/hono@0.80.2
  - @voyant-travel/products@0.80.2
  - @voyant-travel/storage@0.80.2
  - @voyant-travel/utils@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/action-ledger@0.80.1
- @voyant-travel/bookings@0.80.1
- @voyant-travel/core@0.80.1
- @voyant-travel/db@0.80.1
- @voyant-travel/hono@0.80.1
- @voyant-travel/products@0.80.1
- @voyant-travel/storage@0.80.1
- @voyant-travel/utils@0.80.1

## 0.80.0

### Minor Changes

- 9473eb8: Add booking checkout URL helpers and operator-facing URL template labels for booking checkout/payment links.

### Patch Changes

- @voyant-travel/action-ledger@0.80.0
- @voyant-travel/bookings@0.80.0
- @voyant-travel/core@0.80.0
- @voyant-travel/db@0.80.0
- @voyant-travel/hono@0.80.0
- @voyant-travel/products@0.80.0
- @voyant-travel/storage@0.80.0
- @voyant-travel/utils@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/action-ledger@0.79.0
- @voyant-travel/bookings@0.79.0
- @voyant-travel/core@0.79.0
- @voyant-travel/db@0.79.0
- @voyant-travel/hono@0.79.0
- @voyant-travel/products@0.79.0
- @voyant-travel/storage@0.79.0
- @voyant-travel/utils@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/action-ledger@0.78.0
- @voyant-travel/bookings@0.78.0
- @voyant-travel/core@0.78.0
- @voyant-travel/db@0.78.0
- @voyant-travel/hono@0.78.0
- @voyant-travel/products@0.78.0
- @voyant-travel/storage@0.78.0
- @voyant-travel/utils@0.78.0

## 0.77.13

### Patch Changes

- 70a32ab: Add SmartBill admin invoice sync helpers, Hono routes, and default invoice panel actions.
  - @voyant-travel/action-ledger@0.77.13
  - @voyant-travel/bookings@0.77.13
  - @voyant-travel/core@0.77.13
  - @voyant-travel/db@0.77.13
  - @voyant-travel/hono@0.77.13
  - @voyant-travel/products@0.77.13
  - @voyant-travel/storage@0.77.13
  - @voyant-travel/utils@0.77.13

## 0.77.12

### Patch Changes

- bf74cd4: Rename the invoice issuance status from `sent` to `issued`.
  - @voyant-travel/action-ledger@0.77.12
  - @voyant-travel/bookings@0.77.12
  - @voyant-travel/core@0.77.12
  - @voyant-travel/db@0.77.12
  - @voyant-travel/hono@0.77.12
  - @voyant-travel/products@0.77.12
  - @voyant-travel/storage@0.77.12
  - @voyant-travel/utils@0.77.12

## 0.77.11

### Patch Changes

- 437fb58: Allow invoice numbers to repeat across distinct finance document types while preserving same-type uniqueness.
  - @voyant-travel/action-ledger@0.77.11
  - @voyant-travel/bookings@0.77.11
  - @voyant-travel/core@0.77.11
  - @voyant-travel/db@0.77.11
  - @voyant-travel/hono@0.77.11
  - @voyant-travel/products@0.77.11
  - @voyant-travel/storage@0.77.11
  - @voyant-travel/utils@0.77.11

## 0.77.10

### Patch Changes

- 5751c4e: Let schedule-row invoice actions use server-side invoice number allocation and return conflicts for duplicate manual invoice numbers.
  - @voyant-travel/action-ledger@0.77.10
  - @voyant-travel/bookings@0.77.10
  - @voyant-travel/core@0.77.10
  - @voyant-travel/db@0.77.10
  - @voyant-travel/hono@0.77.10
  - @voyant-travel/products@0.77.10
  - @voyant-travel/storage@0.77.10
  - @voyant-travel/utils@0.77.10

## 0.77.9

### Patch Changes

- 10e3ed5: Create booking invoices from a targeted payment schedule row when one is provided.
  - @voyant-travel/action-ledger@0.77.9
  - @voyant-travel/bookings@0.77.9
  - @voyant-travel/core@0.77.9
  - @voyant-travel/db@0.77.9
  - @voyant-travel/hono@0.77.9
  - @voyant-travel/products@0.77.9
  - @voyant-travel/storage@0.77.9
  - @voyant-travel/utils@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/action-ledger@0.77.8
- @voyant-travel/bookings@0.77.8
- @voyant-travel/core@0.77.8
- @voyant-travel/db@0.77.8
- @voyant-travel/hono@0.77.8
- @voyant-travel/products@0.77.8
- @voyant-travel/storage@0.77.8
- @voyant-travel/utils@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/action-ledger@0.77.7
- @voyant-travel/bookings@0.77.7
- @voyant-travel/core@0.77.7
- @voyant-travel/db@0.77.7
- @voyant-travel/hono@0.77.7
- @voyant-travel/products@0.77.7
- @voyant-travel/storage@0.77.7
- @voyant-travel/utils@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/action-ledger@0.77.6
- @voyant-travel/bookings@0.77.6
- @voyant-travel/core@0.77.6
- @voyant-travel/db@0.77.6
- @voyant-travel/hono@0.77.6
- @voyant-travel/products@0.77.6
- @voyant-travel/storage@0.77.6
- @voyant-travel/utils@0.77.6

## 0.77.5

### Patch Changes

- 6e522cb: Carry resolved tax names and regime codes on issued invoice event line items for downstream integrations.
  - @voyant-travel/action-ledger@0.77.5
  - @voyant-travel/bookings@0.77.5
  - @voyant-travel/core@0.77.5
  - @voyant-travel/db@0.77.5
  - @voyant-travel/hono@0.77.5
  - @voyant-travel/products@0.77.5
  - @voyant-travel/storage@0.77.5
  - @voyant-travel/utils@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/action-ledger@0.77.4
- @voyant-travel/bookings@0.77.4
- @voyant-travel/core@0.77.4
- @voyant-travel/db@0.77.4
- @voyant-travel/hono@0.77.4
- @voyant-travel/products@0.77.4
- @voyant-travel/storage@0.77.4
- @voyant-travel/utils@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/action-ledger@0.77.3
- @voyant-travel/bookings@0.77.3
- @voyant-travel/core@0.77.3
- @voyant-travel/db@0.77.3
- @voyant-travel/hono@0.77.3
- @voyant-travel/products@0.77.3
- @voyant-travel/storage@0.77.3
- @voyant-travel/utils@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/action-ledger@0.77.2
- @voyant-travel/bookings@0.77.2
- @voyant-travel/core@0.77.2
- @voyant-travel/db@0.77.2
- @voyant-travel/hono@0.77.2
- @voyant-travel/products@0.77.2
- @voyant-travel/storage@0.77.2
- @voyant-travel/utils@0.77.2

## 0.77.1

### Patch Changes

- 574684d: Derive booking-create pax from supplied travelers when pax is omitted, while preserving explicit pax values.
- Updated dependencies [574684d]
  - @voyant-travel/action-ledger@0.77.1
  - @voyant-travel/bookings@0.77.1
  - @voyant-travel/core@0.77.1
  - @voyant-travel/db@0.77.1
  - @voyant-travel/hono@0.77.1
  - @voyant-travel/products@0.77.1
  - @voyant-travel/storage@0.77.1
  - @voyant-travel/utils@0.77.1

## 0.77.0

### Minor Changes

- 1da934d: Share stored-document download envelope resolution and include signed download envelopes with filenames in finance and legal document-generation responses.

### Patch Changes

- Updated dependencies [1da934d]
  - @voyant-travel/action-ledger@0.77.0
  - @voyant-travel/bookings@0.77.0
  - @voyant-travel/core@0.77.0
  - @voyant-travel/db@0.77.0
  - @voyant-travel/hono@0.77.0
  - @voyant-travel/products@0.77.0
  - @voyant-travel/storage@0.77.0
  - @voyant-travel/utils@0.77.0

## 0.76.0

### Minor Changes

- abf673d: Add bounded invoice rendition wait responses with inline document download URLs for interactive finance flows.

### Patch Changes

- @voyant-travel/action-ledger@0.76.0
- @voyant-travel/bookings@0.76.0
- @voyant-travel/core@0.76.0
- @voyant-travel/db@0.76.0
- @voyant-travel/hono@0.76.0
- @voyant-travel/products@0.76.0
- @voyant-travel/storage@0.76.0
- @voyant-travel/utils@0.76.0

## 0.75.7

### Patch Changes

- 827c25e: Allow invoice-from-booking calls to omit `invoiceNumber`, allocate numbers from active/default series, and hand external-provider series to SmartBill-style adapters for provider-owned numbering.
  - @voyant-travel/action-ledger@0.75.7
  - @voyant-travel/bookings@0.75.7
  - @voyant-travel/core@0.75.7
  - @voyant-travel/db@0.75.7
  - @voyant-travel/hono@0.75.7
  - @voyant-travel/products@0.75.7
  - @voyant-travel/storage@0.75.7
  - @voyant-travel/utils@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/action-ledger@0.75.6
- @voyant-travel/bookings@0.75.6
- @voyant-travel/core@0.75.6
- @voyant-travel/db@0.75.6
- @voyant-travel/hono@0.75.6
- @voyant-travel/products@0.75.6
- @voyant-travel/storage@0.75.6
- @voyant-travel/utils@0.75.6

## 0.75.5

### Patch Changes

- 84a32bb: Require linked completed payment coverage before booking payment schedules can become paid.
- 192c9aa: Allow booking creation payloads with a billing person to use a phone number as the required contact channel when no real email is available.
  - @voyant-travel/action-ledger@0.75.5
  - @voyant-travel/bookings@0.75.5
  - @voyant-travel/core@0.75.5
  - @voyant-travel/db@0.75.5
  - @voyant-travel/hono@0.75.5
  - @voyant-travel/products@0.75.5
  - @voyant-travel/storage@0.75.5
  - @voyant-travel/utils@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/action-ledger@0.75.4
- @voyant-travel/bookings@0.75.4
- @voyant-travel/core@0.75.4
- @voyant-travel/db@0.75.4
- @voyant-travel/hono@0.75.4
- @voyant-travel/products@0.75.4
- @voyant-travel/storage@0.75.4
- @voyant-travel/utils@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/action-ledger@0.75.3
- @voyant-travel/bookings@0.75.3
- @voyant-travel/core@0.75.3
- @voyant-travel/db@0.75.3
- @voyant-travel/hono@0.75.3
- @voyant-travel/products@0.75.3
- @voyant-travel/storage@0.75.3
- @voyant-travel/utils@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/action-ledger@0.75.2
- @voyant-travel/bookings@0.75.2
- @voyant-travel/core@0.75.2
- @voyant-travel/db@0.75.2
- @voyant-travel/hono@0.75.2
- @voyant-travel/products@0.75.2
- @voyant-travel/storage@0.75.2
- @voyant-travel/utils@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/action-ledger@0.75.1
- @voyant-travel/bookings@0.75.1
- @voyant-travel/core@0.75.1
- @voyant-travel/db@0.75.1
- @voyant-travel/hono@0.75.1
- @voyant-travel/products@0.75.1
- @voyant-travel/storage@0.75.1
- @voyant-travel/utils@0.75.1

## 0.75.0

### Patch Changes

- Updated dependencies [1eab599]
  - @voyant-travel/action-ledger@0.75.0
  - @voyant-travel/bookings@0.75.0
  - @voyant-travel/core@0.75.0
  - @voyant-travel/db@0.75.0
  - @voyant-travel/hono@0.75.0
  - @voyant-travel/products@0.75.0
  - @voyant-travel/storage@0.75.0
  - @voyant-travel/utils@0.75.0

## 0.74.2

### Patch Changes

- Updated dependencies [37c08cd]
  - @voyant-travel/action-ledger@0.74.2
  - @voyant-travel/bookings@0.74.2
  - @voyant-travel/core@0.74.2
  - @voyant-travel/db@0.74.2
  - @voyant-travel/hono@0.74.2
  - @voyant-travel/products@0.74.2
  - @voyant-travel/storage@0.74.2
  - @voyant-travel/utils@0.74.2

## 0.74.1

### Patch Changes

- 225a483: Auto-fill cross-currency booking payment FX rates from the configured Voyant Data FX resolver.
  - @voyant-travel/action-ledger@0.74.1
  - @voyant-travel/bookings@0.74.1
  - @voyant-travel/core@0.74.1
  - @voyant-travel/db@0.74.1
  - @voyant-travel/hono@0.74.1
  - @voyant-travel/products@0.74.1
  - @voyant-travel/storage@0.74.1
  - @voyant-travel/utils@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/action-ledger@0.74.0
- @voyant-travel/bookings@0.74.0
- @voyant-travel/core@0.74.0
- @voyant-travel/db@0.74.0
- @voyant-travel/hono@0.74.0
- @voyant-travel/products@0.74.0
- @voyant-travel/storage@0.74.0
- @voyant-travel/utils@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/action-ledger@0.73.1
- @voyant-travel/bookings@0.73.1
- @voyant-travel/core@0.73.1
- @voyant-travel/db@0.73.1
- @voyant-travel/hono@0.73.1
- @voyant-travel/products@0.73.1
- @voyant-travel/storage@0.73.1
- @voyant-travel/utils@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/action-ledger@0.73.0
- @voyant-travel/bookings@0.73.0
- @voyant-travel/core@0.73.0
- @voyant-travel/db@0.73.0
- @voyant-travel/hono@0.73.0
- @voyant-travel/products@0.73.0
- @voyant-travel/storage@0.73.0
- @voyant-travel/utils@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/action-ledger@0.72.0
- @voyant-travel/bookings@0.72.0
- @voyant-travel/core@0.72.0
- @voyant-travel/db@0.72.0
- @voyant-travel/hono@0.72.0
- @voyant-travel/products@0.72.0
- @voyant-travel/storage@0.72.0
- @voyant-travel/utils@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/action-ledger@0.71.0
- @voyant-travel/bookings@0.71.0
- @voyant-travel/core@0.71.0
- @voyant-travel/db@0.71.0
- @voyant-travel/hono@0.71.0
- @voyant-travel/products@0.71.0
- @voyant-travel/storage@0.71.0
- @voyant-travel/utils@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/action-ledger@0.70.0
- @voyant-travel/bookings@0.70.0
- @voyant-travel/core@0.70.0
- @voyant-travel/db@0.70.0
- @voyant-travel/hono@0.70.0
- @voyant-travel/products@0.70.0
- @voyant-travel/storage@0.70.0
- @voyant-travel/utils@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/action-ledger@0.69.1
- @voyant-travel/bookings@0.69.1
- @voyant-travel/core@0.69.1
- @voyant-travel/db@0.69.1
- @voyant-travel/hono@0.69.1
- @voyant-travel/products@0.69.1
- @voyant-travel/storage@0.69.1
- @voyant-travel/utils@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/action-ledger@0.69.0
- @voyant-travel/bookings@0.69.0
- @voyant-travel/core@0.69.0
- @voyant-travel/db@0.69.0
- @voyant-travel/hono@0.69.0
- @voyant-travel/products@0.69.0
- @voyant-travel/storage@0.69.0
- @voyant-travel/utils@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/action-ledger@0.68.0
- @voyant-travel/bookings@0.68.0
- @voyant-travel/core@0.68.0
- @voyant-travel/db@0.68.0
- @voyant-travel/hono@0.68.0
- @voyant-travel/products@0.68.0
- @voyant-travel/storage@0.68.0
- @voyant-travel/utils@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/action-ledger@0.67.0
- @voyant-travel/bookings@0.67.0
- @voyant-travel/core@0.67.0
- @voyant-travel/db@0.67.0
- @voyant-travel/hono@0.67.0
- @voyant-travel/products@0.67.0
- @voyant-travel/storage@0.67.0
- @voyant-travel/utils@0.67.0

## 0.66.6

### Patch Changes

- 2a40d26: Add operator-configurable invoice FX settings, data FX exchange-rate resolution helpers, non-fatal invoice FX resolver error handling, invoice-issued event enrichment, and SmartBill exchange-rate mapping.
- Updated dependencies [f6634ff]
  - @voyant-travel/action-ledger@0.66.6
  - @voyant-travel/bookings@0.66.6
  - @voyant-travel/core@0.66.6
  - @voyant-travel/db@0.66.6
  - @voyant-travel/hono@0.66.6
  - @voyant-travel/products@0.66.6
  - @voyant-travel/storage@0.66.6
  - @voyant-travel/utils@0.66.6

## 0.66.5

### Patch Changes

- Updated dependencies [ee36ef5]
  - @voyant-travel/action-ledger@0.66.5
  - @voyant-travel/bookings@0.66.5
  - @voyant-travel/core@0.66.5
  - @voyant-travel/db@0.66.5
  - @voyant-travel/hono@0.66.5
  - @voyant-travel/products@0.66.5
  - @voyant-travel/storage@0.66.5
  - @voyant-travel/utils@0.66.5

## 0.66.4

### Patch Changes

- Updated dependencies [83ff2de]
  - @voyant-travel/action-ledger@0.66.4
  - @voyant-travel/bookings@0.66.4
  - @voyant-travel/core@0.66.4
  - @voyant-travel/db@0.66.4
  - @voyant-travel/hono@0.66.4
  - @voyant-travel/products@0.66.4
  - @voyant-travel/storage@0.66.4
  - @voyant-travel/utils@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/action-ledger@0.66.3
- @voyant-travel/bookings@0.66.3
- @voyant-travel/core@0.66.3
- @voyant-travel/db@0.66.3
- @voyant-travel/hono@0.66.3
- @voyant-travel/products@0.66.3
- @voyant-travel/storage@0.66.3
- @voyant-travel/utils@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/action-ledger@0.66.2
- @voyant-travel/bookings@0.66.2
- @voyant-travel/core@0.66.2
- @voyant-travel/db@0.66.2
- @voyant-travel/hono@0.66.2
- @voyant-travel/products@0.66.2
- @voyant-travel/storage@0.66.2
- @voyant-travel/utils@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/action-ledger@0.66.1
- @voyant-travel/bookings@0.66.1
- @voyant-travel/core@0.66.1
- @voyant-travel/db@0.66.1
- @voyant-travel/hono@0.66.1
- @voyant-travel/products@0.66.1
- @voyant-travel/storage@0.66.1
- @voyant-travel/utils@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/action-ledger@0.66.0
- @voyant-travel/bookings@0.66.0
- @voyant-travel/core@0.66.0
- @voyant-travel/db@0.66.0
- @voyant-travel/hono@0.66.0
- @voyant-travel/products@0.66.0
- @voyant-travel/storage@0.66.0
- @voyant-travel/utils@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/action-ledger@0.65.0
- @voyant-travel/bookings@0.65.0
- @voyant-travel/core@0.65.0
- @voyant-travel/db@0.65.0
- @voyant-travel/hono@0.65.0
- @voyant-travel/products@0.65.0
- @voyant-travel/storage@0.65.0
- @voyant-travel/utils@0.65.0

## 0.64.1

### Patch Changes

- 572dde4: Add configurable customer-facing payment-link base URLs for generated links and notification template context.
  - @voyant-travel/action-ledger@0.64.1
  - @voyant-travel/bookings@0.64.1
  - @voyant-travel/core@0.64.1
  - @voyant-travel/db@0.64.1
  - @voyant-travel/hono@0.64.1
  - @voyant-travel/products@0.64.1
  - @voyant-travel/storage@0.64.1
  - @voyant-travel/utils@0.64.1

## 0.64.0

### Patch Changes

- 6d0c8f3: Extract `withOptionalTransaction` into `@voyant-travel/db/transaction` so the soft-fallback helper that action-ledger has used since 0.62.0 can be shared by any package that needs it. Add `Module.requiresTransactionalDb` so modules whose write paths use interactive transactions declare it, and have `createApp()` assert on first request that the resolved db adapter supports `db.transaction(async (tx) => …)`. With the neon-http (edge) adapter that assertion now throws an actionable error pointing at `createServerlessDbClient` (neon-serverless / WebSocket) or `createDbClient(url, { adapter: "node" })` — instead of the cryptic "No transactions support in neon-http driver" exception thrown on first write.
- Updated dependencies [6d0c8f3]
  - @voyant-travel/action-ledger@0.64.0
  - @voyant-travel/bookings@0.64.0
  - @voyant-travel/core@0.64.0
  - @voyant-travel/db@0.64.0
  - @voyant-travel/hono@0.64.0
  - @voyant-travel/products@0.64.0
  - @voyant-travel/storage@0.64.0
  - @voyant-travel/utils@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/action-ledger@0.63.1
- @voyant-travel/bookings@0.63.1
- @voyant-travel/core@0.63.1
- @voyant-travel/db@0.63.1
- @voyant-travel/hono@0.63.1
- @voyant-travel/products@0.63.1
- @voyant-travel/storage@0.63.1
- @voyant-travel/utils@0.63.1

## 0.63.0

### Patch Changes

- 5bff9c3: Split "Collect payment" from "Generate payment link"; fix payment-schedule create; unblock admin-shared `/pay/:sessionId` links.

  `@voyant-travel/finance-ui`

  - New `RecordBookingPaymentDialog` — bookkeeping flow for a payment that already happened (bank transfer, cash, cheque, manual card). Fetches the booking's open invoices via `useInvoices({ bookingId })`, auto-picks the only outstanding one, pre-fills amount with `balanceDueCents`. Fields: invoice picker, amount, payment date, status, method (full backend enum), reference, notes. POSTs via `useInvoicePaymentMutation`. New i18n group `recordBookingPaymentDialog` in EN + RO.
  - New `BookingInvoiceSheet` — slide-in (`@voyant-travel/ui` `Sheet`) invoice creator scoped to a single booking. Pre-fills currency / subtotal / total from the booking and snapshots `personId` / `organizationId`. Auto-generates an invoice number. Reuses the existing `invoiceDialog.*` i18n keys.

  `@voyant-travel/checkout-ui`

  - `CollectPaymentDialog` simplified: dropped the `<PaymentStep>` "pick a method" block and the `pickHold` validation — bookings are already on hold from creation, so the dialog goes straight from amount to "Generate link". Added a schedule picker above the amount input that fetches open `pending` / `due` schedules via `useBookingPaymentSchedules(bookingId)` and pre-fills the amount when a schedule is picked. Manual amount edit detaches from the picked schedule. Default title remains "Generate payment link". New i18n keys: `scheduleLabel`, `scheduleHelp`, `scheduleFullAmount` template, `scheduleTypeLabels` (deposit / installment / balance / hold / other) in EN + RO. Removed `validation.pickHold`.

  `@voyant-travel/checkout-react`

  - `useCollectPayment` no longer issues `startProvider` for the `hold` choice. Processors (Netopia) require a real billing block at provider-start time which the admin doesn't have; the customer-facing `/pay/:sessionId` lazy-start endpoint owns provider start with synthesized placeholder billing. The admin path now only creates the payment session + plan, and the link works on first customer click.

  `@voyant-travel/finance-react`

  - New canonical `paymentMethodSchema` (full 9-value backend enum: `bank_transfer`, `credit_card`, `debit_card`, `cash`, `cheque`, `wallet`, `direct_bill`, `voucher`, `other`) and `paymentStatusSchema` (with `PaymentMethod` / `PaymentStatus` type exports) — mirrors `@voyant-travel/finance/validation-shared` without dragging the server bundle into the browser.
  - `CreateInvoicePaymentInput.paymentMethod` / `status` reference the shared types (was a narrower hand-rolled union missing 4 methods).
  - `useBookingPaymentScheduleMutation` create/update fix: response schema was wrapping the already-enveloped server response, leaving every record field "undefined" to the parser and tripping a wall of Zod errors on success responses. Now uses `singleEnvelope(bookingPaymentScheduleRecordSchema)` like every other mutation hook.

  `@voyant-travel/finance`

  - `GET /v1/public/finance/payment-sessions/:sessionId` no longer requires a `payment:read` capability when the session has a `bookingId`. The session id is the bearer credential (it's an opaque TypeID in a customer-shared link), and the public projection is already redacted to fields the customer already has. Brings booking-attached sessions to parity with trip sessions, which never had this requirement.

- Updated dependencies [5bff9c3]
  - @voyant-travel/action-ledger@0.63.0
  - @voyant-travel/bookings@0.63.0
  - @voyant-travel/core@0.63.0
  - @voyant-travel/db@0.63.0
  - @voyant-travel/hono@0.63.0
  - @voyant-travel/products@0.63.0
  - @voyant-travel/storage@0.63.0
  - @voyant-travel/utils@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/action-ledger@0.62.3
- @voyant-travel/bookings@0.62.3
- @voyant-travel/core@0.62.3
- @voyant-travel/db@0.62.3
- @voyant-travel/hono@0.62.3
- @voyant-travel/products@0.62.3
- @voyant-travel/storage@0.62.3
- @voyant-travel/utils@0.62.3

## 0.62.2

### Patch Changes

- Updated dependencies [4a87635]
  - @voyant-travel/action-ledger@0.62.2
  - @voyant-travel/bookings@0.62.2
  - @voyant-travel/core@0.62.2
  - @voyant-travel/db@0.62.2
  - @voyant-travel/hono@0.62.2
  - @voyant-travel/products@0.62.2
  - @voyant-travel/storage@0.62.2
  - @voyant-travel/utils@0.62.2

## 0.62.1

### Patch Changes

- Updated dependencies [ebbeab8]
  - @voyant-travel/action-ledger@0.62.1
  - @voyant-travel/bookings@0.62.1
  - @voyant-travel/core@0.62.1
  - @voyant-travel/db@0.62.1
  - @voyant-travel/hono@0.62.1
  - @voyant-travel/products@0.62.1
  - @voyant-travel/storage@0.62.1
  - @voyant-travel/utils@0.62.1

## 0.62.0

### Patch Changes

- Updated dependencies [77aad68]
  - @voyant-travel/action-ledger@0.62.0
  - @voyant-travel/bookings@0.62.0
  - @voyant-travel/core@0.62.0
  - @voyant-travel/db@0.62.0
  - @voyant-travel/hono@0.62.0
  - @voyant-travel/products@0.62.0
  - @voyant-travel/storage@0.62.0
  - @voyant-travel/utils@0.62.0

## 0.61.0

### Patch Changes

- Updated dependencies [89f033e]
  - @voyant-travel/action-ledger@0.61.0
  - @voyant-travel/bookings@0.61.0
  - @voyant-travel/core@0.61.0
  - @voyant-travel/db@0.61.0
  - @voyant-travel/hono@0.61.0
  - @voyant-travel/products@0.61.0
  - @voyant-travel/storage@0.61.0
  - @voyant-travel/utils@0.61.0

## 0.60.0

### Patch Changes

- Updated dependencies [4ff7f15]
  - @voyant-travel/action-ledger@0.60.0
  - @voyant-travel/bookings@0.60.0
  - @voyant-travel/core@0.60.0
  - @voyant-travel/db@0.60.0
  - @voyant-travel/hono@0.60.0
  - @voyant-travel/products@0.60.0
  - @voyant-travel/storage@0.60.0
  - @voyant-travel/utils@0.60.0

## 0.59.0

### Patch Changes

- Updated dependencies [48927be]
  - @voyant-travel/action-ledger@0.59.0
  - @voyant-travel/bookings@0.59.0
  - @voyant-travel/core@0.59.0
  - @voyant-travel/db@0.59.0
  - @voyant-travel/hono@0.59.0
  - @voyant-travel/products@0.59.0
  - @voyant-travel/storage@0.59.0
  - @voyant-travel/utils@0.59.0

## 0.58.0

### Patch Changes

- @voyant-travel/action-ledger@0.58.0
- @voyant-travel/bookings@0.58.0
- @voyant-travel/core@0.58.0
- @voyant-travel/db@0.58.0
- @voyant-travel/hono@0.58.0
- @voyant-travel/products@0.58.0
- @voyant-travel/storage@0.58.0
- @voyant-travel/utils@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/action-ledger@0.57.0
- @voyant-travel/bookings@0.57.0
- @voyant-travel/core@0.57.0
- @voyant-travel/db@0.57.0
- @voyant-travel/hono@0.57.0
- @voyant-travel/products@0.57.0
- @voyant-travel/storage@0.57.0
- @voyant-travel/utils@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/action-ledger@0.56.0
- @voyant-travel/bookings@0.56.0
- @voyant-travel/core@0.56.0
- @voyant-travel/db@0.56.0
- @voyant-travel/hono@0.56.0
- @voyant-travel/products@0.56.0
- @voyant-travel/storage@0.56.0
- @voyant-travel/utils@0.56.0

## 0.55.1

### Patch Changes

- 819c847: Ship the composed trip admin workflow and booking extras integration.

  Admin surfaces now include trip list/detail/composer routes, catalog-backed
  trip assembly, aggregate checkout handoff, payment-link trip summaries, and
  trip-aware navigation. Booking journeys and regular booking creation can route
  operators into the composer when the customer is building a multi-component
  itinerary.

  Catalog booking draft shapes now expose richer add-on offers, and owned product
  booking handlers can price and commit selected extras. Product detail pages can
  manage extras, booking create can select extras, and finance booking creation
  persists selected extras as booking items so invoices and payment links include
  them.

  Checkout payment pages now render clearer trip summaries, flight booking UI
  supports the refined baggage/one-way behavior used by the composer, shared UI
  exports the date-time field, and i18n includes the new trip admin copy.

- Updated dependencies [819c847]
  - @voyant-travel/action-ledger@0.55.1
  - @voyant-travel/bookings@0.55.1
  - @voyant-travel/core@0.55.1
  - @voyant-travel/db@0.55.1
  - @voyant-travel/hono@0.55.1
  - @voyant-travel/products@0.55.1
  - @voyant-travel/storage@0.55.1
  - @voyant-travel/utils@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/action-ledger@0.55.0
- @voyant-travel/bookings@0.55.0
- @voyant-travel/core@0.55.0
- @voyant-travel/db@0.55.0
- @voyant-travel/hono@0.55.0
- @voyant-travel/products@0.55.0
- @voyant-travel/storage@0.55.0
- @voyant-travel/utils@0.55.0

## 0.54.0

### Minor Changes

- 3117d27: Extract booking sell-side tax-preview helpers and route mounting into `@voyant-travel/finance`.

### Patch Changes

- @voyant-travel/action-ledger@0.54.0
- @voyant-travel/bookings@0.54.0
- @voyant-travel/core@0.54.0
- @voyant-travel/db@0.54.0
- @voyant-travel/hono@0.54.0
- @voyant-travel/products@0.54.0
- @voyant-travel/storage@0.54.0
- @voyant-travel/utils@0.54.0

## 0.53.2

### Patch Changes

- @voyant-travel/action-ledger@0.53.2
- @voyant-travel/bookings@0.53.2
- @voyant-travel/core@0.53.2
- @voyant-travel/db@0.53.2
- @voyant-travel/hono@0.53.2
- @voyant-travel/storage@0.53.2
- @voyant-travel/utils@0.53.2

## 0.53.1

### Patch Changes

- Updated dependencies [8ebac16]
  - @voyant-travel/action-ledger@0.53.1
  - @voyant-travel/bookings@0.53.1
  - @voyant-travel/core@0.53.1
  - @voyant-travel/db@0.53.1
  - @voyant-travel/hono@0.53.1
  - @voyant-travel/storage@0.53.1
  - @voyant-travel/utils@0.53.1

## 0.53.0

### Patch Changes

- Updated dependencies [a315df6]
  - @voyant-travel/action-ledger@0.53.0
  - @voyant-travel/bookings@0.53.0
  - @voyant-travel/core@0.53.0
  - @voyant-travel/db@0.53.0
  - @voyant-travel/hono@0.53.0
  - @voyant-travel/storage@0.53.0
  - @voyant-travel/utils@0.53.0

## 0.52.4

### Patch Changes

- Updated dependencies [5d3c119]
  - @voyant-travel/action-ledger@0.52.4
  - @voyant-travel/bookings@0.52.4
  - @voyant-travel/core@0.52.4
  - @voyant-travel/db@0.52.4
  - @voyant-travel/hono@0.52.4
  - @voyant-travel/storage@0.52.4
  - @voyant-travel/utils@0.52.4

## 0.52.3

### Patch Changes

- 9679a57: Add the initial action ledger package with append-only ledger schemas, TypeID prefixes, canonical idempotency fingerprints, capability registry and guard helpers, query helpers, request-context ledger helpers, shared target timeline serialization, payload/relay append support, booking PII sensitive-read ledgering, booking traveler and travel-detail mutation ledgering, booking item/note/payment-policy mutation ledgering, booking action capability declarations and approval decision routing, booking action-ledger drift checks and dry-run remediation planning, finance invoice issuance/update/delete, invoice line-item ledgering, payment-session creation/update/lifecycle completion/failure/cancellation/expiration, payment instrument and authorization/capture ledgering, booking payment schedule and guarantee/default-plan ledgering, manual payment, supplier payment, and credit-note plus credit-note line-item ledgering, product create/update/delete ledgering with changed-field summaries and product timelines, nested product option, option-unit, translation, itinerary, day, day-service, media, brochure, feature, FAQ, location, taxonomy-link, destination-link, activation-setting, ticket-setting, visibility-setting, capability, and delivery-format mutation ledgering, product action-ledger drift checks, product admin route module splitting, admin list/detail routes with expanded filters and time windows plus payload and relay refs, relay outbox health listing with time windows and lifecycle helpers, runtime schema/route mounting, finance React client hooks for invoice and payment-session action ledger timelines, operator invoice/payment-session timeline mounting, product React client hooks and product detail activity UI, drift/canary health helpers and operator health endpoints, reversal recording support, route schema module split, client-safe React validation subpath imports, and reusable finance UI action ledger cards.
- Updated dependencies [9679a57]
  - @voyant-travel/action-ledger@0.52.3
  - @voyant-travel/bookings@0.52.3
  - @voyant-travel/core@0.52.3
  - @voyant-travel/db@0.52.3
  - @voyant-travel/hono@0.52.3
  - @voyant-travel/storage@0.52.3
  - @voyant-travel/utils@0.52.3

## 0.52.2

### Patch Changes

- 3e09123: Finance: tax-on-issue + invoice flow refresh.

  - `finance/service-issue.ts` is the new home for the invoice-issue pipeline: it computes line-level tax at issue time, snapshots the resolved tax regime onto the invoice, and emits the events expected by the SmartBill plugin.
  - `service-booking-create.ts` and `service.ts` route through the issue service so converting a booking to an invoice picks up the same tax/regime logic as a direct issue.
  - New route added to expose the tax-preview surface consumed by `useBookingTaxPreview`.
  - `useInvoiceMutation` refreshes the booking invoices/pricing caches after issue/void/refund so detail pages no longer go stale.
  - `PaymentsPage` styling and empty-state polish; new i18n strings for the issue/preview flow (EN + RO via `i18n/admin/finance`).

- Updated dependencies [3e09123]
  - @voyant-travel/bookings@0.52.2
  - @voyant-travel/core@0.52.2
  - @voyant-travel/db@0.52.2
  - @voyant-travel/hono@0.52.2
  - @voyant-travel/storage@0.52.2
  - @voyant-travel/utils@0.52.2

## 0.52.1

### Patch Changes

- Updated dependencies [335d277]
  - @voyant-travel/bookings@0.52.1
  - @voyant-travel/core@0.52.1
  - @voyant-travel/db@0.52.1
  - @voyant-travel/hono@0.52.1
  - @voyant-travel/storage@0.52.1
  - @voyant-travel/utils@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/bookings@0.52.0
- @voyant-travel/core@0.52.0
- @voyant-travel/db@0.52.0
- @voyant-travel/hono@0.52.0
- @voyant-travel/storage@0.52.0
- @voyant-travel/utils@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/bookings@0.51.1
- @voyant-travel/core@0.51.1
- @voyant-travel/db@0.51.1
- @voyant-travel/hono@0.51.1
- @voyant-travel/storage@0.51.1
- @voyant-travel/utils@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/bookings@0.51.0
- @voyant-travel/core@0.51.0
- @voyant-travel/db@0.51.0
- @voyant-travel/hono@0.51.0
- @voyant-travel/storage@0.51.0
- @voyant-travel/utils@0.51.0

## 0.50.8

### Patch Changes

- Updated dependencies [f35014f]
  - @voyant-travel/bookings@0.50.8
  - @voyant-travel/core@0.50.8
  - @voyant-travel/db@0.50.8
  - @voyant-travel/hono@0.50.8
  - @voyant-travel/storage@0.50.8
  - @voyant-travel/utils@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/bookings@0.50.7
- @voyant-travel/core@0.50.7
- @voyant-travel/db@0.50.7
- @voyant-travel/hono@0.50.7
- @voyant-travel/storage@0.50.7
- @voyant-travel/utils@0.50.7

## 0.50.6

### Patch Changes

- c14f0a8: Fix the booking-create flow: scrollable dialog content with reachable actions, normalized product search, future departure lookup, shared-room clearing, explicit item lines, selectable traveler people including the payer, already-paid schedule rows, and booking-create naming throughout the API/registry surface.
- Updated dependencies [c14f0a8]
  - @voyant-travel/bookings@0.50.6
  - @voyant-travel/core@0.50.6
  - @voyant-travel/db@0.50.6
  - @voyant-travel/hono@0.50.6
  - @voyant-travel/storage@0.50.6
  - @voyant-travel/utils@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/bookings@0.50.5
- @voyant-travel/core@0.50.5
- @voyant-travel/db@0.50.5
- @voyant-travel/hono@0.50.5
- @voyant-travel/storage@0.50.5
- @voyant-travel/utils@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/bookings@0.50.4
- @voyant-travel/core@0.50.4
- @voyant-travel/db@0.50.4
- @voyant-travel/hono@0.50.4
- @voyant-travel/storage@0.50.4
- @voyant-travel/utils@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/bookings@0.50.3
- @voyant-travel/core@0.50.3
- @voyant-travel/db@0.50.3
- @voyant-travel/hono@0.50.3
- @voyant-travel/storage@0.50.3
- @voyant-travel/utils@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/bookings@0.50.2
- @voyant-travel/core@0.50.2
- @voyant-travel/db@0.50.2
- @voyant-travel/hono@0.50.2
- @voyant-travel/storage@0.50.2
- @voyant-travel/utils@0.50.2

## 0.50.1

### Patch Changes

- 7b768c5: Add storefront intake SDK helpers, expand storefront payment settings with split schedules and bank-transfer account metadata, and extend finance admin aggregates with dashboard counts, totals, and filters.
  - @voyant-travel/bookings@0.50.1
  - @voyant-travel/core@0.50.1
  - @voyant-travel/db@0.50.1
  - @voyant-travel/hono@0.50.1
  - @voyant-travel/storage@0.50.1
  - @voyant-travel/utils@0.50.1

## 0.50.0

### Patch Changes

- @voyant-travel/bookings@0.50.0
- @voyant-travel/core@0.50.0
- @voyant-travel/db@0.50.0
- @voyant-travel/hono@0.50.0
- @voyant-travel/storage@0.50.0
- @voyant-travel/utils@0.50.0

## 0.49.0

### Patch Changes

- @voyant-travel/bookings@0.49.0
- @voyant-travel/core@0.49.0
- @voyant-travel/db@0.49.0
- @voyant-travel/hono@0.49.0
- @voyant-travel/storage@0.49.0
- @voyant-travel/utils@0.49.0

## 0.48.0

### Patch Changes

- @voyant-travel/bookings@0.48.0
- @voyant-travel/core@0.48.0
- @voyant-travel/db@0.48.0
- @voyant-travel/hono@0.48.0
- @voyant-travel/storage@0.48.0
- @voyant-travel/utils@0.48.0

## 0.47.0

### Minor Changes

- 65408c6: Add stable legal document operation routes for contract template previews, stored document attachment, and PDF regeneration, plus booking-scoped customer-safe finance document lookup by reference.

### Patch Changes

- @voyant-travel/bookings@0.47.0
- @voyant-travel/core@0.47.0
- @voyant-travel/db@0.47.0
- @voyant-travel/hono@0.47.0
- @voyant-travel/storage@0.47.0
- @voyant-travel/utils@0.47.0

## 0.46.0

### Patch Changes

- @voyant-travel/bookings@0.46.0
- @voyant-travel/core@0.46.0
- @voyant-travel/db@0.46.0
- @voyant-travel/hono@0.46.0
- @voyant-travel/storage@0.46.0
- @voyant-travel/utils@0.46.0

## 0.45.0

### Patch Changes

- @voyant-travel/bookings@0.45.0
- @voyant-travel/core@0.45.0
- @voyant-travel/db@0.45.0
- @voyant-travel/hono@0.45.0
- @voyant-travel/storage@0.45.0
- @voyant-travel/utils@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/bookings@0.44.0
- @voyant-travel/core@0.44.0
- @voyant-travel/db@0.44.0
- @voyant-travel/hono@0.44.0
- @voyant-travel/storage@0.44.0
- @voyant-travel/utils@0.44.0

## 0.43.0

### Patch Changes

- Updated dependencies [d07215e]
  - @voyant-travel/bookings@0.43.0
  - @voyant-travel/core@0.43.0
  - @voyant-travel/db@0.43.0
  - @voyant-travel/hono@0.43.0
  - @voyant-travel/storage@0.43.0
  - @voyant-travel/utils@0.43.0

## 0.42.0

### Minor Changes

- 786945f: Add `financeService.bindInvoiceRendition` for transactional ready-rendition binding and emit the metadata-only `invoice.rendered` event after successful invoice document rendition completion.

### Patch Changes

- @voyant-travel/bookings@0.42.0
- @voyant-travel/core@0.42.0
- @voyant-travel/db@0.42.0
- @voyant-travel/hono@0.42.0
- @voyant-travel/storage@0.42.0
- @voyant-travel/utils@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/bookings@0.41.3
- @voyant-travel/core@0.41.3
- @voyant-travel/db@0.41.3
- @voyant-travel/hono@0.41.3
- @voyant-travel/storage@0.41.3
- @voyant-travel/utils@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/bookings@0.41.2
- @voyant-travel/core@0.41.2
- @voyant-travel/db@0.41.2
- @voyant-travel/hono@0.41.2
- @voyant-travel/storage@0.41.2
- @voyant-travel/utils@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/bookings@0.41.1
- @voyant-travel/core@0.41.1
- @voyant-travel/db@0.41.1
- @voyant-travel/hono@0.41.1
- @voyant-travel/storage@0.41.1
- @voyant-travel/utils@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/bookings@0.41.0
- @voyant-travel/core@0.41.0
- @voyant-travel/db@0.41.0
- @voyant-travel/hono@0.41.0
- @voyant-travel/storage@0.41.0
- @voyant-travel/utils@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/bookings@0.40.1
- @voyant-travel/core@0.40.1
- @voyant-travel/db@0.40.1
- @voyant-travel/hono@0.40.1
- @voyant-travel/storage@0.40.1
- @voyant-travel/utils@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/bookings@0.40.0
- @voyant-travel/core@0.40.0
- @voyant-travel/db@0.40.0
- @voyant-travel/hono@0.40.0
- @voyant-travel/storage@0.40.0
- @voyant-travel/utils@0.40.0

## 0.39.0

### Patch Changes

- 2297949: Enrich `invoice.issued` and `invoice.proforma.issued` event payloads with booking contact fields, issue/due dates, and persisted invoice line items so billing adapter default mappers can build complete invoice bodies.
- Updated dependencies [f4235ea]
  - @voyant-travel/bookings@0.39.0
  - @voyant-travel/core@0.39.0
  - @voyant-travel/db@0.39.0
  - @voyant-travel/hono@0.39.0
  - @voyant-travel/storage@0.39.0
  - @voyant-travel/utils@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/bookings@0.38.2
- @voyant-travel/core@0.38.2
- @voyant-travel/db@0.38.2
- @voyant-travel/hono@0.38.2
- @voyant-travel/storage@0.38.2
- @voyant-travel/utils@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/bookings@0.38.1
- @voyant-travel/core@0.38.1
- @voyant-travel/db@0.38.1
- @voyant-travel/hono@0.38.1
- @voyant-travel/storage@0.38.1
- @voyant-travel/utils@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/bookings@0.38.0
- @voyant-travel/core@0.38.0
- @voyant-travel/db@0.38.0
- @voyant-travel/hono@0.38.0
- @voyant-travel/storage@0.38.0
- @voyant-travel/utils@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/bookings@0.37.1
- @voyant-travel/core@0.37.1
- @voyant-travel/db@0.37.1
- @voyant-travel/hono@0.37.1
- @voyant-travel/storage@0.37.1
- @voyant-travel/utils@0.37.1

## 0.37.0

### Minor Changes

- dc29b79: Persist operator-confirmed booking totals from the create dialog and audit manual price overrides with a required reason.

### Patch Changes

- f014fd2: Capture manual base-currency settlement amounts for cross-currency customer and supplier payments, and settle invoice balances from the base invoice amount.
- Updated dependencies [4c93561]
- Updated dependencies [dc29b79]
  - @voyant-travel/bookings@0.37.0
  - @voyant-travel/core@0.37.0
  - @voyant-travel/db@0.37.0
  - @voyant-travel/hono@0.37.0
  - @voyant-travel/storage@0.37.0
  - @voyant-travel/utils@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies [15e6953]
  - @voyant-travel/bookings@0.36.0
  - @voyant-travel/core@0.36.0
  - @voyant-travel/db@0.36.0
  - @voyant-travel/hono@0.36.0
  - @voyant-travel/storage@0.36.0
  - @voyant-travel/utils@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/bookings@0.35.0
- @voyant-travel/core@0.35.0
- @voyant-travel/db@0.35.0
- @voyant-travel/hono@0.35.0
- @voyant-travel/storage@0.35.0
- @voyant-travel/utils@0.35.0

## 0.34.0

### Patch Changes

- 9095837: Emit a first-class booking payment schedule paid event when schedule-backed payment sessions complete, and include target metadata on generic payment completion events.
- Updated dependencies [a37d4af]
  - @voyant-travel/bookings@0.34.0
  - @voyant-travel/core@0.34.0
  - @voyant-travel/db@0.34.0
  - @voyant-travel/hono@0.34.0
  - @voyant-travel/storage@0.34.0
  - @voyant-travel/utils@0.34.0

## 0.33.1

### Patch Changes

- Updated dependencies [9bee9aa]
  - @voyant-travel/bookings@0.33.1
  - @voyant-travel/core@0.33.1
  - @voyant-travel/db@0.33.1
  - @voyant-travel/hono@0.33.1
  - @voyant-travel/storage@0.33.1
  - @voyant-travel/utils@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/bookings@0.33.0
- @voyant-travel/core@0.33.0
- @voyant-travel/db@0.33.0
- @voyant-travel/hono@0.33.0
- @voyant-travel/storage@0.33.0
- @voyant-travel/utils@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/bookings@0.32.3
- @voyant-travel/core@0.32.3
- @voyant-travel/db@0.32.3
- @voyant-travel/hono@0.32.3
- @voyant-travel/storage@0.32.3
- @voyant-travel/utils@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/bookings@0.32.2
- @voyant-travel/core@0.32.2
- @voyant-travel/db@0.32.2
- @voyant-travel/hono@0.32.2
- @voyant-travel/storage@0.32.2
- @voyant-travel/utils@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/bookings@0.32.1
- @voyant-travel/core@0.32.1
- @voyant-travel/db@0.32.1
- @voyant-travel/hono@0.32.1
- @voyant-travel/storage@0.32.1
- @voyant-travel/utils@0.32.1

## 0.32.0

### Minor Changes

- 6ea6ded: Harden public checkout sessions with scoped signed capabilities. Public booking-session creation now returns a short-lived checkout capability and sets an HttpOnly SameSite cookie; PII-bearing session reads, session mutations, repricing/finalization, and public finance payment bootstrap/read routes require that booking-scoped capability. Public mutable checkout/payment routes also accept the shared `Idempotency-Key` retry middleware where it was missing.

### Patch Changes

- Updated dependencies [6ea6ded]
  - @voyant-travel/bookings@0.32.0
  - @voyant-travel/core@0.32.0
  - @voyant-travel/db@0.32.0
  - @voyant-travel/hono@0.32.0
  - @voyant-travel/storage@0.32.0
  - @voyant-travel/utils@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/bookings@0.31.4
- @voyant-travel/core@0.31.4
- @voyant-travel/db@0.31.4
- @voyant-travel/hono@0.31.4
- @voyant-travel/storage@0.31.4
- @voyant-travel/utils@0.31.4

## 0.31.3

### Patch Changes

- 5f974dd: Add first-class invoice attachment persistence, admin routes, React hooks, and invoice detail UI.
- Updated dependencies [5f974dd]
  - @voyant-travel/bookings@0.31.3
  - @voyant-travel/core@0.31.3
  - @voyant-travel/db@0.31.3
  - @voyant-travel/hono@0.31.3
  - @voyant-travel/storage@0.31.3
  - @voyant-travel/utils@0.31.3

## 0.31.2

### Patch Changes

- Updated dependencies [54ddc93]
  - @voyant-travel/bookings@0.31.2
  - @voyant-travel/core@0.31.2
  - @voyant-travel/db@0.31.2
  - @voyant-travel/hono@0.31.2
  - @voyant-travel/storage@0.31.2
  - @voyant-travel/utils@0.31.2

## 0.31.1

### Patch Changes

- @voyant-travel/bookings@0.31.1
- @voyant-travel/core@0.31.1
- @voyant-travel/db@0.31.1
- @voyant-travel/hono@0.31.1
- @voyant-travel/storage@0.31.1
- @voyant-travel/utils@0.31.1

## 0.31.0

### Patch Changes

- @voyant-travel/bookings@0.31.0
- @voyant-travel/core@0.31.0
- @voyant-travel/db@0.31.0
- @voyant-travel/hono@0.31.0
- @voyant-travel/storage@0.31.0
- @voyant-travel/utils@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/bookings@0.30.7
- @voyant-travel/core@0.30.7
- @voyant-travel/db@0.30.7
- @voyant-travel/hono@0.30.7
- @voyant-travel/storage@0.30.7
- @voyant-travel/utils@0.30.7

## 0.30.6

### Patch Changes

- Updated dependencies [5a4c592]
  - @voyant-travel/bookings@0.30.6
  - @voyant-travel/core@0.30.6
  - @voyant-travel/db@0.30.6
  - @voyant-travel/hono@0.30.6
  - @voyant-travel/storage@0.30.6
  - @voyant-travel/utils@0.30.6

## 0.30.5

### Patch Changes

- Updated dependencies [3f323e9]
  - @voyant-travel/bookings@0.30.5
  - @voyant-travel/core@0.30.5
  - @voyant-travel/db@0.30.5
  - @voyant-travel/hono@0.30.5
  - @voyant-travel/storage@0.30.5
  - @voyant-travel/utils@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/bookings@0.30.4
- @voyant-travel/core@0.30.4
- @voyant-travel/db@0.30.4
- @voyant-travel/hono@0.30.4
- @voyant-travel/storage@0.30.4
- @voyant-travel/utils@0.30.4

## 0.30.3

### Patch Changes

- Updated dependencies [05a1b19]
  - @voyant-travel/bookings@0.30.3
  - @voyant-travel/core@0.30.3
  - @voyant-travel/db@0.30.3
  - @voyant-travel/hono@0.30.3
  - @voyant-travel/storage@0.30.3
  - @voyant-travel/utils@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/bookings@0.30.2
- @voyant-travel/core@0.30.2
- @voyant-travel/db@0.30.2
- @voyant-travel/hono@0.30.2
- @voyant-travel/storage@0.30.2
- @voyant-travel/utils@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/bookings@0.30.1
- @voyant-travel/core@0.30.1
- @voyant-travel/db@0.30.1
- @voyant-travel/hono@0.30.1
- @voyant-travel/storage@0.30.1
- @voyant-travel/utils@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/bookings@0.30.0
- @voyant-travel/core@0.30.0
- @voyant-travel/db@0.30.0
- @voyant-travel/hono@0.30.0
- @voyant-travel/storage@0.30.0
- @voyant-travel/utils@0.30.0

## 0.29.0

### Patch Changes

- Updated dependencies [3420711]
- Updated dependencies [583326e]
- Updated dependencies [583326e]
- Updated dependencies [4a6523e]
- Updated dependencies [db51715]
  - @voyant-travel/bookings@0.29.0
  - @voyant-travel/core@0.29.0
  - @voyant-travel/db@0.29.0
  - @voyant-travel/hono@0.29.0
  - @voyant-travel/storage@0.29.0
  - @voyant-travel/utils@0.29.0

## 0.28.3

### Patch Changes

- 60ef432: Add a unified payments listing that joins customer and supplier payments into a single feed, and split the operator finance area into separate Invoices and Payments pages.

  `@voyant-travel/finance`:

  - New routes `GET /v1/admin/finance/payments` and `GET /v1/admin/finance/payments/:id`. The list endpoint accepts a `kind` filter (`customer` | `supplier`) plus the usual `status` / `paymentMethod` / `currency` / `invoiceId` / `bookingId` / `supplierId` / `paymentDateFrom` / `paymentDateTo` / `search` filters and `sortBy` (`amountCents` | `status` | `paymentDate` | `createdAt`) / `sortDir`. The detail endpoint dispatches by typeid prefix — `pay_*` resolves to a customer payment, `spay_*` resolves to a supplier payment. `bookingId` is applied to both branches: directly to `supplier_payments.booking_id` on the supplier side and via `invoices.booking_id` (joined as `i`) on the customer side, so a booking-scoped query no longer returns unrelated customer rows.
  - `financeService.listAllPayments(db, query)` and `financeService.getPaymentById(db, id)` return a `UnifiedPaymentRow` shape with normalized fields (`personName`, `organizationName`, `supplierName`, `invoiceNumber`, `bookingNumber`) joined in via SQL so the operator UI doesn't need follow-up lookups.
  - New exports: `UnifiedPaymentRow` (service.ts) and `paymentKindSchema` / `paymentListQuerySchema` / `paymentListSortFieldSchema` / `paymentListSortDirSchema` (validation-payments.ts).

  `@voyant-travel/finance-react`:

  - New hooks: `useAllPayments(filters)` and `usePayment(id)` plus the underlying `getAllPaymentsQueryOptions` / `getPaymentQueryOptions` query-options factories.
  - New types: `FinancePaymentKind`, `FinanceAllPaymentsListFilters`, `FinanceAllPaymentsListSortField`, `FinanceAllPaymentsListSortDir`.
  - New schemas: `paymentKindSchema`, `unifiedPaymentRecordSchema`, `allPaymentsListResponse`, `paymentSingleResponse`, plus matching `UnifiedPaymentRecord` type.
  - New invoice-payment-mutation invalidation now also invalidates `financeQueryKeys.allPayments()` so the unified feed stays in sync with single-invoice payment flows.

  `@voyant-travel/admin`:

  - Operator nav `finance` entry now points at `/finance/invoices` and exposes an `items` sub-nav with `invoices` and `payments` links, matching the new operator page split.

  `@voyant-travel/i18n`:

  - Operator nav messages add `invoices` and `payments` (en + ro).
  - Admin finance messages add `invoicesPageTitle`/`invoicesPageDescription`, `paymentsPageTitle`/`paymentsPageDescription`, `recordPayment`, `searchPaymentsPlaceholder`, `kindColumn`/`kindCustomer`/`kindSupplier`/`partyColumn`/`filtersKindLabel`/`filtersKindAll`, plus the `paymentDetail` and `recordPaymentDialog` message groups (en + ro).
  - @voyant-travel/bookings@0.28.3
  - @voyant-travel/core@0.28.3
  - @voyant-travel/db@0.28.3
  - @voyant-travel/hono@0.28.3
  - @voyant-travel/storage@0.28.3
  - @voyant-travel/utils@0.28.3

## 0.28.2

### Patch Changes

- @voyant-travel/bookings@0.28.2
- @voyant-travel/core@0.28.2
- @voyant-travel/db@0.28.2
- @voyant-travel/hono@0.28.2
- @voyant-travel/storage@0.28.2
- @voyant-travel/utils@0.28.2

## 0.28.1

### Patch Changes

- @voyant-travel/bookings@0.28.1
- @voyant-travel/core@0.28.1
- @voyant-travel/db@0.28.1
- @voyant-travel/hono@0.28.1
- @voyant-travel/storage@0.28.1
- @voyant-travel/utils@0.28.1

## 0.28.0

### Patch Changes

- @voyant-travel/bookings@0.28.0
- @voyant-travel/core@0.28.0
- @voyant-travel/db@0.28.0
- @voyant-travel/hono@0.28.0
- @voyant-travel/storage@0.28.0
- @voyant-travel/utils@0.28.0

## 0.27.0

### Patch Changes

- @voyant-travel/bookings@0.27.0
- @voyant-travel/core@0.27.0
- @voyant-travel/db@0.27.0
- @voyant-travel/hono@0.27.0
- @voyant-travel/storage@0.27.0
- @voyant-travel/utils@0.27.0

## 0.26.9

### Patch Changes

- @voyant-travel/bookings@0.26.9
- @voyant-travel/core@0.26.9
- @voyant-travel/db@0.26.9
- @voyant-travel/hono@0.26.9
- @voyant-travel/storage@0.26.9
- @voyant-travel/utils@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/bookings@0.26.8
- @voyant-travel/core@0.26.8
- @voyant-travel/db@0.26.8
- @voyant-travel/hono@0.26.8
- @voyant-travel/storage@0.26.8
- @voyant-travel/utils@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/bookings@0.26.7
- @voyant-travel/core@0.26.7
- @voyant-travel/db@0.26.7
- @voyant-travel/hono@0.26.7
- @voyant-travel/storage@0.26.7
- @voyant-travel/utils@0.26.7

## 0.26.6

### Patch Changes

- 571e340: Server-side dashboard aggregates: add `totalPax` and `upcomingDepartures.items` to `getBookingAggregates`, and `outstandingTopN` to `getFinanceAggregates` (closes #437).

  The operator dashboard previously sampled the first 100 bookings / invoices through the list endpoints and derived KPIs in the browser. With more than a handful of rows, "total pax", "upcoming departures", and "outstanding invoices" silently drifted from the truth.

  Bookings:

  - `BookingAggregates.totalPax` sums `pax` across active-status bookings in the requested range (cancelled excluded; null pax = 0).
  - `BookingAggregates.upcomingDepartures` is now `{ count, items }`. `items` is a bounded slice of soonest-departing bookings ordered by `start_date` asc, excluding cancelled and past departures. Bound via the new `upcomingLimit` query parameter (default 8, max 20).

  Finance:

  - `FinanceAggregates.outstandingTopN` returns the top-N outstanding invoices (`sent | partially_paid | overdue` with `balance_due_cents > 0`), ordered by `due_date` (nulls last), then `issue_date`, then `id`. Bound via the new `outstandingTopLimit` query parameter (default 5, max 20).

  The operator dashboard is rewired to consume these aggregates directly — KPI cards, the upcoming-departures list, and the "needs collection" panel are now exact rather than sample-derived. The dashboard also fixes a pre-existing bug where the outstanding panel summed `total_amount_cents` instead of `balance_due_cents`.

- Updated dependencies [571e340]
  - @voyant-travel/bookings@0.26.6
  - @voyant-travel/core@0.26.6
  - @voyant-travel/db@0.26.6
  - @voyant-travel/hono@0.26.6
  - @voyant-travel/storage@0.26.6
  - @voyant-travel/utils@0.26.6

## 0.26.5

### Patch Changes

- Updated dependencies [7a92aba]
  - @voyant-travel/bookings@0.26.5
  - @voyant-travel/core@0.26.5
  - @voyant-travel/db@0.26.5
  - @voyant-travel/hono@0.26.5
  - @voyant-travel/storage@0.26.5
  - @voyant-travel/utils@0.26.5

## 0.26.4

### Patch Changes

- Updated dependencies [6493f62]
  - @voyant-travel/bookings@0.26.4
  - @voyant-travel/core@0.26.4
  - @voyant-travel/db@0.26.4
  - @voyant-travel/hono@0.26.4
  - @voyant-travel/storage@0.26.4
  - @voyant-travel/utils@0.26.4

## 0.26.3

### Patch Changes

- Updated dependencies [372cad5]
  - @voyant-travel/bookings@0.26.3
  - @voyant-travel/core@0.26.3
  - @voyant-travel/db@0.26.3
  - @voyant-travel/hono@0.26.3
  - @voyant-travel/storage@0.26.3
  - @voyant-travel/utils@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies [ffdb485]
  - @voyant-travel/bookings@0.26.2
  - @voyant-travel/core@0.26.2
  - @voyant-travel/db@0.26.2
  - @voyant-travel/hono@0.26.2
  - @voyant-travel/storage@0.26.2
  - @voyant-travel/utils@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies [c0507a6]
  - @voyant-travel/bookings@0.26.1
  - @voyant-travel/core@0.26.1
  - @voyant-travel/db@0.26.1
  - @voyant-travel/hono@0.26.1
  - @voyant-travel/storage@0.26.1
  - @voyant-travel/utils@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/bookings@0.26.0
- @voyant-travel/core@0.26.0
- @voyant-travel/db@0.26.0
- @voyant-travel/hono@0.26.0
- @voyant-travel/storage@0.26.0
- @voyant-travel/utils@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/bookings@0.25.0
- @voyant-travel/core@0.25.0
- @voyant-travel/db@0.25.0
- @voyant-travel/hono@0.25.0
- @voyant-travel/storage@0.25.0
- @voyant-travel/utils@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/bookings@0.24.3
- @voyant-travel/core@0.24.3
- @voyant-travel/db@0.24.3
- @voyant-travel/hono@0.24.3
- @voyant-travel/storage@0.24.3
- @voyant-travel/utils@0.24.3

## 0.24.2

### Patch Changes

- @voyant-travel/bookings@0.24.2
- @voyant-travel/core@0.24.2
- @voyant-travel/db@0.24.2
- @voyant-travel/hono@0.24.2
- @voyant-travel/storage@0.24.2
- @voyant-travel/utils@0.24.2

## 0.24.1

### Patch Changes

- @voyant-travel/bookings@0.24.1
- @voyant-travel/core@0.24.1
- @voyant-travel/db@0.24.1
- @voyant-travel/hono@0.24.1
- @voyant-travel/storage@0.24.1
- @voyant-travel/utils@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/bookings@0.24.0
- @voyant-travel/core@0.24.0
- @voyant-travel/db@0.24.0
- @voyant-travel/hono@0.24.0
- @voyant-travel/storage@0.24.0
- @voyant-travel/utils@0.24.0

## 0.23.0

### Patch Changes

- @voyant-travel/bookings@0.23.0
- @voyant-travel/core@0.23.0
- @voyant-travel/db@0.23.0
- @voyant-travel/hono@0.23.0
- @voyant-travel/storage@0.23.0
- @voyant-travel/utils@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/bookings@0.22.0
- @voyant-travel/core@0.22.0
- @voyant-travel/db@0.22.0
- @voyant-travel/hono@0.22.0
- @voyant-travel/storage@0.22.0
- @voyant-travel/utils@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/bookings@0.21.1
- @voyant-travel/core@0.21.1
- @voyant-travel/db@0.21.1
- @voyant-travel/hono@0.21.1
- @voyant-travel/storage@0.21.1
- @voyant-travel/utils@0.21.1

## 0.21.0

### Minor Changes

- 6427bad: Release the booking journey architecture train.

  This adds booking hold policy support, richer traveler and booking journey flows, operator tax policy configuration, finance billing and tax policy APIs, notification reminder target and delivery tooling, and the template/runtime wiring needed for the operator storefront checkout flow.

### Patch Changes

- Updated dependencies [6427bad]
  - @voyant-travel/bookings@0.21.0
  - @voyant-travel/core@0.21.0
  - @voyant-travel/db@0.21.0
  - @voyant-travel/hono@0.21.0
  - @voyant-travel/storage@0.21.0
  - @voyant-travel/utils@0.21.0

## 0.20.0

### Minor Changes

- cc3eddd: **Checkout layering: rename `payments-ui` → `checkout-ui`, add `checkout-react`, and centralise the universal payment UX on top of the existing checkout/finance stack.**

  The "payments" domain previously had a single `@voyant-travel/payments-ui` component package with no matching backend or hooks layer, while orchestration already lived in `@voyant-travel/checkout` and state in `@voyant-travel/finance`. The naming was confusing (no `payments` package to match `payments-ui`) and verticals had to hand-roll fetch calls for the admin "Collect payment" and customer landing flows. This release rationalises the stack:

  - **Renamed** `@voyant-travel/payments-ui` → `@voyant-travel/checkout-ui`. Same components (`<PaymentStep>`, `<PaymentLinkLandingPage>`) plus a new `<CollectPaymentDialog>`. Old name is gone — update imports.
  - **New** `@voyant-travel/checkout-react` package: `useInitiateCheckoutCollection`, `usePreviewCheckoutCollection`, `useCheckoutPaymentLinkConfig`, and a higher-level `useCollectPayment(bookingId)` that maps a `PaymentChoice` to the right `initiateCheckoutCollection` request body. Re-exports the public-side `usePublicPaymentSession` / `usePublicBookingPaymentOptions` from `finance-react` so consumers don't need a second import. Owns the canonical `PaymentChoice`, `PaymentStepCapabilities`, `SavedPaymentAccount` types (re-exported by `checkout-ui` for backward-compatible single-import).
  - **`createCheckoutAdminRoutes(options)`** now mounts `collection-plan`, `initiate-collection`, and `collections/bootstrap` alongside the existing `reminder-runs` route, so admin (`actor=staff`) callers don't need a hand-rolled proxy. The public surface is unchanged.
  - **`<PaymentStep>`** simplified: dropped `send_link` and `bank_transfer` from `PaymentChoice` and the corresponding capability flags. The customer's card-vs-bank-transfer decision happens on the public `/pay/:sessionId` landing page, not on the admin picker. Admin choices are now `saved_method | new_card | extra | hold`. `hold` is the universal "create a payment session and share the link" path; vertical extras (e.g. flights' "Issue on agency credit") render unchanged.
  - **`useCollectPayment`** accepts `payerLanguage`, `returnUrl`, `cancelUrl`, `notes` per call so the processor's hosted page renders in the customer's locale and lands them back on the right confirmation route. The Netopia plugin honors all four via `startProvider.payload`.
  - **`<PaymentLinkLandingPage>`** gains an `onRetry` slot. Failed/expired sessions get a `Try again` button that calls the parent's retry handler (the operator template wires it to `POST /v1/public/payment-link/:sessionId/retry`, which mints a fresh session for the same target). Also surfaces `session.notes` as a subtitle so the customer sees what they're paying for.
  - **`PublicPaymentSession`** schema (`@voyant-travel/finance/public-validation`) gains a `notes: string | null` field. The public projection passes through whatever was stored on the session at creation.
  - **Netopia callback (`@voyant-travel/plugin-netopia`)** drops the strict amount/currency-equality check. Netopia auto-converts non-RON orders to RON for processing, so an EUR session legitimately receives a RON-denominated callback — the previous check rejected every cross-currency payment as `amount_or_currency_mismatch`. Status is the trustworthy field (matches `protravel-v3`'s production handler).
  - **`NETOPIA_MODE=sandbox|live`** replaces hard-coded `NETOPIA_URL`. Defaults to sandbox. `NETOPIA_API_BASES` exports the resolved hosts; `NETOPIA_URL` is now an optional override for staging proxies.
  - **`<FlightPaymentStep>`** updated for the simpler `PaymentChoice` shape. Drops the obsolete `onRequestPaymentLink` callback (Hold IS that flow now). The flight booking shell's `paymentCapabilities` only needs `chargeSavedCard` / `newCard` now.

  Migration: imports of `@voyant-travel/payments-ui` → `@voyant-travel/checkout-ui`. If you used `paymentCapabilities.sendLink` or `bankTransfer`, drop those — they're no longer in the type. If you wired `onRequestPaymentLink`, point that callback's behavior into the `hold` choice instead.

### Patch Changes

- @voyant-travel/bookings@0.20.0
- @voyant-travel/core@0.20.0
- @voyant-travel/db@0.20.0
- @voyant-travel/hono@0.20.0
- @voyant-travel/storage@0.20.0
- @voyant-travel/utils@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [714c544]
  - @voyant-travel/bookings@0.19.0
  - @voyant-travel/core@0.19.0
  - @voyant-travel/db@0.19.0
  - @voyant-travel/hono@0.19.0
  - @voyant-travel/storage@0.19.0
  - @voyant-travel/utils@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies [8932f60]
  - @voyant-travel/bookings@0.18.0
  - @voyant-travel/core@0.18.0
  - @voyant-travel/db@0.18.0
  - @voyant-travel/hono@0.18.0
  - @voyant-travel/storage@0.18.0
  - @voyant-travel/utils@0.18.0

## 0.17.0

### Patch Changes

- 66d722d: `financeService.completePaymentSession` now accepts a 4th `runtime: { eventBus? }` parameter and emits `invoice.settled` after the transaction commits when a payment is applied to an invoice. Closes a fan-out gap where plugin callbacks (Netopia and friends) had to either run a separate poller or wrap each provider callback to manually trigger `pollInvoiceSettlement`. The Netopia plugin's callback route now resolves the finance runtime from the container and threads the eventBus through `handleCallback`.

  Default callers (no runtime) remain unchanged. `pollInvoiceSettlement` continues to emit independently — no double-emit, since it goes through `createPayment`, not `completePaymentSession`.

- Updated dependencies [66d722d]
- Updated dependencies [66d722d]
- Updated dependencies [66d722d]
  - @voyant-travel/bookings@0.17.0
  - @voyant-travel/core@0.17.0
  - @voyant-travel/db@0.17.0
  - @voyant-travel/hono@0.17.0
  - @voyant-travel/storage@0.17.0
  - @voyant-travel/utils@0.17.0

## 0.16.0

### Patch Changes

- @voyant-travel/bookings@0.16.0
- @voyant-travel/core@0.16.0
- @voyant-travel/db@0.16.0
- @voyant-travel/hono@0.16.0
- @voyant-travel/storage@0.16.0
- @voyant-travel/utils@0.16.0

## 0.15.0

### Patch Changes

- @voyant-travel/bookings@0.15.0
- @voyant-travel/core@0.15.0
- @voyant-travel/db@0.15.0
- @voyant-travel/hono@0.15.0
- @voyant-travel/storage@0.15.0
- @voyant-travel/utils@0.15.0

## 0.14.0

### Patch Changes

- @voyant-travel/bookings@0.14.0
- @voyant-travel/core@0.14.0
- @voyant-travel/db@0.14.0
- @voyant-travel/hono@0.14.0
- @voyant-travel/storage@0.14.0
- @voyant-travel/utils@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [7dfbc05]
- Updated dependencies [15dda79]
  - @voyant-travel/bookings@0.13.0
  - @voyant-travel/core@0.13.0
  - @voyant-travel/db@0.13.0
  - @voyant-travel/hono@0.13.0
  - @voyant-travel/storage@0.13.0
  - @voyant-travel/utils@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies [944d244]
- Updated dependencies [cc561ce]
  - @voyant-travel/bookings@0.12.0
  - @voyant-travel/core@0.12.0
  - @voyant-travel/db@0.12.0
  - @voyant-travel/hono@0.12.0
  - @voyant-travel/storage@0.12.0
  - @voyant-travel/utils@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [fe905b0]
  - @voyant-travel/bookings@0.11.0
  - @voyant-travel/core@0.11.0
  - @voyant-travel/db@0.11.0
  - @voyant-travel/hono@0.11.0
  - @voyant-travel/storage@0.11.0
  - @voyant-travel/utils@0.11.0

## 0.10.0

### Patch Changes

- 29a581a: Add Postgres `CHECK` constraints across finance, bookings, and transactions schemas to enforce: if any `*_amount_cents` column is set, its companion currency column must also be set.

  Two flavours, depending on column shape:

  - **Strict XNOR** (`(currency IS NULL) = (amount IS NULL)`) — one currency to one amount: `booking_guarantees`, `booking_item_commissions`, `payments` (base).
  - **Implication** (`(amounts NULL) OR (currency NOT NULL)`) — one currency covering multiple amount columns: `bookings.base_currency`, `booking_items.cost_currency`, `offer_items.cost_currency`, `order_items.cost_currency`, `invoices.base_currency`.

  The implication form intentionally allows "currency without amount" because the currency may be pre-declared before line items roll up.

- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [b7f0501]
  - @voyant-travel/bookings@0.10.0
  - @voyant-travel/core@0.10.0
  - @voyant-travel/db@0.10.0
  - @voyant-travel/hono@0.10.0
  - @voyant-travel/storage@0.10.0
  - @voyant-travel/utils@0.10.0

## 0.9.0

### Patch Changes

- @voyant-travel/bookings@0.9.0
- @voyant-travel/core@0.9.0
- @voyant-travel/db@0.9.0
- @voyant-travel/hono@0.9.0
- @voyant-travel/storage@0.9.0
- @voyant-travel/utils@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [24dc253]
  - @voyant-travel/bookings@0.8.0
  - @voyant-travel/core@0.8.0
  - @voyant-travel/db@0.8.0
  - @voyant-travel/hono@0.8.0
  - @voyant-travel/storage@0.8.0
  - @voyant-travel/utils@0.8.0

## 0.7.0

### Minor Changes

- 96612b3: Bookings-create composition surface (#223) and vouchers-as-first-class (#227) — the packages on the release train all move together, so this covers the batch.

  **Atomic booking create (#263, #264, #265, #266)**

  - `POST /v1/admin/bookings/quick-create` — one-shot endpoint that converts a product, inserts travelers + payment schedules, redeems a voucher, and creates/joins a `booking_group` inside a single DB transaction. `quickCreateBooking(db, input, { userId, runtime })` service in `@voyant-travel/finance`; `useBookingQuickCreateMutation` in `@voyant-travel/bookings-react`.
  - `POST /v1/admin/bookings/dual-create` — partaj flow: two bookings + one shared-room group, also atomic. `dualCreateBooking` service, `useBookingDualCreateMutation` hook.
  - `booking.quick-created` and `booking.dual-created` events emitted post-commit when a runtime eventBus is wired.
  - `QuickBookDialog` now mounts all nine picker sections (product, departure, rooms, person, shared-room, passengers, price breakdown, voucher, payment schedule) and submits via quick-create. Post-create "Confirm & notify traveler" toggle uses the new `useBookingStatusByIdMutation` to transition the fresh booking to `confirmed` — which (when `autoConfirmAndDispatch` is on) fires the doc bundle + traveler email through the existing `booking.confirmed` subscriber.
  - Bookings fix: `productDaysRef` / `getConvertProductData` now join through `product_itineraries` to match the real products schema; the existing `POST /v1/bookings/from-product` convert path works again.

  **Vouchers as first-class financial instruments (#262, #267)**

  - One-shot data migration: `migrateVouchersFromPaymentInstruments(db, opts)` in `@voyant-travel/finance` (CLI wrapper `pnpm -F @voyant-travel/finance migrate:vouchers`, `--dry-run` supported). Idempotent; pulls code, currency, amount, expiry from legacy JSONB metadata into the new `vouchers` table.
  - `vouchers.validFrom` (start-of-validity, maps to OpenTravel `Finance.Voucher.effectiveDate`) and `vouchers.seriesCode` (batch/campaign id, maps to `Finance.Voucher.seriesCode`) columns added. Redeem guard returns `voucher_not_started` when now < validFrom; the public `validateVoucher` `not_started` branch is now reachable. `seriesCode` exposed as a list filter. Migration pulls both from legacy metadata (honouring OpenTravel's `effectiveDate` alias).

### Patch Changes

- Updated dependencies [96612b3]
  - @voyant-travel/bookings@0.7.0
  - @voyant-travel/core@0.7.0
  - @voyant-travel/db@0.7.0
  - @voyant-travel/hono@0.7.0
  - @voyant-travel/storage@0.7.0
  - @voyant-travel/utils@0.7.0

## 0.6.9

### Patch Changes

- Updated dependencies [7619ef0]
  - @voyant-travel/bookings@0.6.9
  - @voyant-travel/core@0.6.9
  - @voyant-travel/db@0.6.9
  - @voyant-travel/hono@0.6.9
  - @voyant-travel/storage@0.6.9
  - @voyant-travel/utils@0.6.9

## 0.6.8

### Patch Changes

- b218885: Align finance child-list indexes with the existing parent-and-sort query shapes for booking payment schedules, guarantees, tax lines, commissions, invoice lines, payments, credit notes, credit note lines, finance notes, invoice renditions, and invoice external references.
- b218885: Align the remaining finance admin and document root-list indexes with their recency-sorted query shapes.
- b218885: Align finance payment root-list indexes with the current recency-sorted payment admin query shapes.
- Updated dependencies [b218885]
- Updated dependencies [b218885]
  - @voyant-travel/bookings@0.6.8
  - @voyant-travel/core@0.6.8
  - @voyant-travel/db@0.6.8
  - @voyant-travel/hono@0.6.8
  - @voyant-travel/storage@0.6.8
  - @voyant-travel/utils@0.6.8

## 0.6.7

### Patch Changes

- @voyant-travel/bookings@0.6.7
- @voyant-travel/core@0.6.7
- @voyant-travel/db@0.6.7
- @voyant-travel/hono@0.6.7
- @voyant-travel/storage@0.6.7
- @voyant-travel/utils@0.6.7

## 0.6.6

### Patch Changes

- @voyant-travel/bookings@0.6.6
- @voyant-travel/core@0.6.6
- @voyant-travel/db@0.6.6
- @voyant-travel/hono@0.6.6
- @voyant-travel/storage@0.6.6
- @voyant-travel/utils@0.6.6

## 0.6.5

### Patch Changes

- Updated dependencies [ae9933b]
  - @voyant-travel/bookings@0.6.5
  - @voyant-travel/core@0.6.5
  - @voyant-travel/db@0.6.5
  - @voyant-travel/hono@0.6.5
  - @voyant-travel/storage@0.6.5
  - @voyant-travel/utils@0.6.5

## 0.6.4

### Patch Changes

- @voyant-travel/bookings@0.6.4
- @voyant-travel/core@0.6.4
- @voyant-travel/db@0.6.4
- @voyant-travel/hono@0.6.4
- @voyant-travel/storage@0.6.4
- @voyant-travel/utils@0.6.4

## 0.6.3

### Patch Changes

- Updated dependencies [d3c6937]
  - @voyant-travel/bookings@0.6.3
  - @voyant-travel/core@0.6.3
  - @voyant-travel/db@0.6.3
  - @voyant-travel/hono@0.6.3
  - @voyant-travel/storage@0.6.3
  - @voyant-travel/utils@0.6.3

## 0.6.2

### Patch Changes

- @voyant-travel/bookings@0.6.2
- @voyant-travel/core@0.6.2
- @voyant-travel/db@0.6.2
- @voyant-travel/hono@0.6.2
- @voyant-travel/storage@0.6.2
- @voyant-travel/utils@0.6.2

## 0.6.1

### Patch Changes

- @voyant-travel/bookings@0.6.1
- @voyant-travel/core@0.6.1
- @voyant-travel/db@0.6.1
- @voyant-travel/hono@0.6.1
- @voyant-travel/storage@0.6.1
- @voyant-travel/utils@0.6.1

## 0.6.0

### Patch Changes

- @voyant-travel/bookings@0.6.0
- @voyant-travel/core@0.6.0
- @voyant-travel/db@0.6.0
- @voyant-travel/hono@0.6.0
- @voyant-travel/storage@0.6.0
- @voyant-travel/utils@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [ce72e29]
  - @voyant-travel/bookings@0.5.0
  - @voyant-travel/core@0.5.0
  - @voyant-travel/db@0.5.0
  - @voyant-travel/hono@0.5.0
  - @voyant-travel/storage@0.5.0
  - @voyant-travel/utils@0.5.0

## 0.4.5

### Patch Changes

- e3f6e72: Standardize TypeID prefixes to a first-N-chars convention for better DX.

  Root entities now use the shortest unambiguous first-N chars of the entity name
  (e.g. `pers` instead of `prsn`, `org` instead of `orgn`). Child entities use a
  2-char module code plus 2-char suffix. 19 prefixes renamed in total.

- Updated dependencies [e3f6e72]
  - @voyant-travel/bookings@0.4.5
  - @voyant-travel/core@0.4.5
  - @voyant-travel/db@0.4.5
  - @voyant-travel/hono@0.4.5
  - @voyant-travel/storage@0.4.5
  - @voyant-travel/utils@0.4.5

## 0.4.4

### Patch Changes

- @voyant-travel/bookings@0.4.4
- @voyant-travel/core@0.4.4
- @voyant-travel/db@0.4.4
- @voyant-travel/hono@0.4.4
- @voyant-travel/storage@0.4.4
- @voyant-travel/utils@0.4.4

## 0.4.3

### Patch Changes

- @voyant-travel/bookings@0.4.3
- @voyant-travel/core@0.4.3
- @voyant-travel/db@0.4.3
- @voyant-travel/hono@0.4.3
- @voyant-travel/storage@0.4.3
- @voyant-travel/utils@0.4.3

## 0.4.2

### Patch Changes

- 8de4602: Add optional event-bus hooks around document primitives.

  - `@voyant-travel/legal` contract document generation routes/services can now emit
    `contract.document.generated`
  - `@voyant-travel/finance` invoice document generation can emit
    `invoice.document.generated`, and settlement reconciliation can emit
    `invoice.settled`
  - `@voyant-travel/notifications` booking document sends can emit
    `booking.documents.sent`

  These stay at the primitive layer so apps can orchestrate their own document
  policies without Voyant owning the full workflow.

  - @voyant-travel/bookings@0.4.2
  - @voyant-travel/core@0.4.2
  - @voyant-travel/db@0.4.2
  - @voyant-travel/hono@0.4.2
  - @voyant-travel/storage@0.4.2
  - @voyant-travel/utils@0.4.2

## 0.4.1

### Patch Changes

- a49630a: Extend the public finance surface with customer-safe document lookup by reference
  and add typed organization member/invitation exports in `@voyant-travel/auth-react`
  for shared team-management UIs.
- Updated dependencies [4c4ea3c]
  - @voyant-travel/bookings@0.4.1
  - @voyant-travel/core@0.4.1
  - @voyant-travel/db@0.4.1
  - @voyant-travel/hono@0.4.1
  - @voyant-travel/storage@0.4.1
  - @voyant-travel/utils@0.4.1

## 0.4.0

### Patch Changes

- e84fe0f: Add built-in PDF document adapters for legal and finance workflows.

  `@voyant-travel/utils` now exports `renderPdfDocument()` as a shared basic PDF
  renderer for rendered text content. `@voyant-travel/legal` and `@voyant-travel/finance`
  now expose bundled PDF serializers and generator helpers on top of their
  storage-backed document workflows, so apps can generate readable PDF artifacts
  without wiring a custom browser renderer for the common case.

- e84fe0f: Add a first-class invoice and proforma document generation workflow.

  - add configurable admin routes for `generate-document` and
    `regenerate-document`
  - add `createFinanceHonoModule()` so apps can mount finance with an invoice
    document generator
  - generate ready `invoice_renditions` and mark prior renditions of the same
    format as `stale`
  - expose the new document-generation schemas and route factories from the
    package entrypoint

- e84fe0f: Add first-class invoice settlement polling and reconciliation.

  - add `POST /v1/admin/finance/invoices/:id/poll-settlement` with typed polling
    and reconciliation results
  - sync provider settlement state back onto `invoice_external_refs`
  - reconcile newly observed paid amounts into completed Voyant payments without
    over-applying across multiple provider refs
  - add `createSmartbillInvoiceSettlementPoller()` in
    `@voyant-travel/plugin-smartbill`

- e84fe0f: Add a public booking payment-history route and matching React helpers so
  storefronts can read booking-scoped payments with invoice context from
  `/v1/public/finance/bookings/:bookingId/payments`.
- e84fe0f: Upgrade legal and finance template rendering to support Liquid-style control
  flow.

  - add a shared structured template renderer in `@voyant-travel/utils`
  - keep simple `{{path}}` interpolation compatibility for existing templates
  - support Liquid loops, conditionals, and filters in legal and finance
    html/markdown templates
  - support Liquid rendering inside lexical text nodes for legal and finance
    template bodies

- e84fe0f: Add storage-backed document generator helpers for legal and finance workflows.

  `@voyant-travel/legal` now exports `createStorageBackedContractDocumentGenerator()`
  and `defaultStorageBackedContractDocumentSerializer()` so rendered contract
  artifacts can be uploaded through Voyant storage providers without custom
  generator plumbing.

  `@voyant-travel/finance` now exports
  `createStorageBackedInvoiceDocumentGenerator()` and
  `defaultStorageBackedInvoiceDocumentSerializer()` for the same workflow on
  invoice/proforma renditions, with built-in support for html/json/xml artifact
  uploads and explicit opt-in for custom PDF serializers.

- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
- Updated dependencies [2d5f323]
- Updated dependencies [e84fe0f]
  - @voyant-travel/bookings@0.4.0
  - @voyant-travel/core@0.4.0
  - @voyant-travel/db@0.4.0
  - @voyant-travel/hono@0.4.0
  - @voyant-travel/storage@0.4.0
  - @voyant-travel/utils@0.4.0

## 0.3.1

### Patch Changes

- 8566f2d: Add a booking-scoped public finance document surface for invoice and proforma
  downloads.

  `@voyant-travel/finance` now exposes a public booking documents route that returns
  customer-safe invoice and proforma document metadata, including the best
  available rendition status and download URL when a ready rendition has a public
  or signed URL. `@voyant-travel/finance-react` now exposes matching schemas, query
  keys, query options, operations, and a `usePublicBookingDocuments` hook.

- 8566f2d: Republish the public storefront package surfaces so published tarballs match the
  current source tree. This release restores the public finance schemas needed by
  `@voyant-travel/finance-react`, publishes the public booking and product service
  exports already present in source, and ships the day/version/media product React
  exports from the package root.
- Updated dependencies [8566f2d]
- Updated dependencies [8566f2d]
- Updated dependencies [8566f2d]
  - @voyant-travel/bookings@0.3.1
  - @voyant-travel/core@0.3.1
  - @voyant-travel/db@0.3.1
  - @voyant-travel/hono@0.3.1

## 0.3.0

### Patch Changes

- @voyant-travel/bookings@0.3.0
- @voyant-travel/core@0.3.0
- @voyant-travel/db@0.3.0
- @voyant-travel/hono@0.3.0

## 0.2.0

### Patch Changes

- @voyant-travel/bookings@0.2.0
- @voyant-travel/core@0.2.0
- @voyant-travel/db@0.2.0
- @voyant-travel/hono@0.2.0

## 0.1.1

### Patch Changes

- @voyant-travel/bookings@0.1.1
- @voyant-travel/core@0.1.1
- @voyant-travel/db@0.1.1
- @voyant-travel/hono@0.1.1
