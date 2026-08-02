# @voyant-travel/schema-kit

## 0.117.0

### Minor Changes

- 15c1c64: Add the Booking v1 priced traveler-roster Amendment lifecycle: immutable and
  expiring exact-revision previews, server-owned price/tax and collection/refund
  consequences, acceptance, transactional owned-capacity projection, durable
  sourced Supplier Operation dispatch and reconciliation, explicit partial and
  uncertain outcomes, and consistent authenticated, storefront, and Tool
  transports.

## 0.116.3

### Patch Changes

- 79606bb: Add Booking Platform v1 supplier-first Commit orchestration with durable
  Supplier Operations, typed pending and ambiguous outcomes, operator
  reconciliation and manual resolution, and a replay-safe sourced cruise tracer.

## 0.116.2

### Patch Changes

- bdc0443: Add Distribution-owned channel publication contracts, persistence, TypeID prefixes, exact cutover snapshots, effective publication resolver primitives, and provider-neutral runtime wiring for Storefront and Commerce.

## 0.116.1

### Patch Changes

- 5d3b563: Complete the Booking Session v1 owned Product tracer with server-derived access context,
  creation-only anonymous capability material, idempotent Quote/Hold/update/abandon/Commit
  operations, and production Commit wiring through the admitted Finance self-service create
  transaction callback.
- f25ad34: Add the Booking Platform v1 lifecycle commitment-policy schemas and reusable conformance scenarios.

  Implement the first owned Product Booking Session v1 tracer with exact-revision
  Quote, capability-gated public mutations, real-capacity Hold, atomic Commit
  outcome, persistent repository adapter, Storefront SDK, and React hook surfaces.

## 0.116.0

### Minor Changes

- e65bd25: Rename the bespoke sales Quote domain to Proposals across packages, routes, schemas, migrations, generated graph authorities, and operator surfaces.

  This beta-line release keeps no compatibility aliases, routes, package names, forwarding exports, views, or dual writes for the bespoke sales rename. Existing beta databases that contain the old bespoke quote schema must be dropped and recreated from the clean-slate migrations; there is no in-place migration path and no data-preservation guarantee for those beta databases.

## 0.115.0

### Minor Changes

- 952d817: Replace unsafe booking-contract document generation with the Legal-owned
  durable operation/provider protocol. Legacy generation routes and direct
  generator services and exports are removed. Standard Operator now selects and
  constructs the shipped provider from its exact database, document-storage, and
  renderer bindings; startup and action activation require behavioral provider
  preflight, and pending recovery fails loudly if that provider disappears.
  Local Standard document bytes now require probed, atomic filesystem durability,
  and the bundled renderer embeds a Latin Extended Unicode font. Custom font
  bytes are also supported by the basic PDF utility. Opaque renderer/S3
  transports require explicit backend identity. Remove the
  Notifications document-bundle lifecycle callbacks, fully-paid orchestration
  subscriber, and its Realtime invalidation declaration; document generation is
  available only through admitted Legal actions.

  Recognize transaction-bound outbox appends as durable domain-event emissions
  and publish the existing Trips requirement-sourcing event contracts.

## 0.114.1

### Patch Changes

- a4cf038: Add the package-owned durable operation required to restore the approved
  `send_notification` action: exact command replay, transactional
  requested/completed events, leased retries, dead-letter visibility, and
  provider-side idempotency plus reconciliation. Notification providers can now
  declare the optional `notification-provider-idempotency-v1` capability;
  providers without it fail closed for agent sends while retaining their existing
  request-scoped behavior. The action remains quarantined until a production
  provider can satisfy the new contract.

  The agent Tool now targets the existing active notification template for
  approval/audit instead of writing the email address or phone number into the
  action ledger, and returns an immutable accepted/pending delivery snapshot.
  Delivery happens asynchronously; poll `get_notification_delivery` with the
  returned id for the mutable sent/failed state.

## 0.114.0

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

## 0.113.4

### Patch Changes

- a461920: Add the iframe admin session-token broker (RFC Phase 3): HKDF-signed,
  context-separated short-lived session tokens carrying issuer, app audience,
  installation, deployment, viewer, entity/slot context, iat/exp, and a unique
  token id. Issuance records the token id and audits it; the backend exchange
  verifies audience/deployment binding, consumes the token id once (rejecting
  replay, expiry, and context mismatch), and swaps it for online actor access via
  the existing OAuth actor-token-exchange primitive bounded by viewer ∩ app
  grants. Adds the `app_session_tokens` table (migration idx 4) and its TypeID
  prefix.

## 0.113.3

### Patch Changes

- 3a90c27: Add remote app OAuth authorization, token, rotation, revocation, and app-token auth context support.

## 0.113.2

### Patch Changes

- 9fc7801: Add remote app OAuth authorization, token, rotation, revocation, and app-token auth context support.

## 0.113.1

### Patch Changes

- 0868f18: Add the app registry foundation with closed manifest validation, deterministic release compilation, protected manifest ingestion, and admin API wiring.
- 027ca08: Add the app installation aggregate, lifecycle service, reconciliation tables, and TypeID prefixes for app installation records.

## 0.113.0

### Minor Changes

- 52352c4: Remove project-local TypeScript custom-field declarations, discovery globs,
  executable validation callbacks, and code/database merge helpers. The generic
  custom-fields package now owns canonical value routes and dispatches operations
  to selected entity-owning packages through typed runtime contributions, with no
  Relationships compatibility adapter.

## 0.112.2

### Patch Changes

- 5941d2c: Remove the unused action-ledger relay outbox schema, service, HTTP route, tool,
  and entry-detail UI. Ledger canaries now verify the append-only write path, and
  future exports/projections use cursor checkpoints while work-queue consumers use
  the framework's generic durable event outbox.

## 0.112.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.

## 0.112.0

### Minor Changes

- bbe6396: Replace the overloaded Finance voucher domain with Travel Credits across the
  database schema, APIs, package exports, booking inputs, storefront settings,
  and operator UI. Redemption commands are replay-safe, codes are normalized and
  case-insensitively unique, and legacy records migrate in place without silently
  skipping invalid balances. Keep Promotion Codes in Commerce and move Bookings
  fulfillment to the explicit Service Voucher vocabulary.

## 0.111.1

### Patch Changes

- 6d3e0a5: Add first-party owned accommodation daily rates, room-night inventory, and a service-backed booking/search quote path.

## 0.111.0

### Minor Changes

- 722455d: RFP → bid → award sourcing funnel (Phase 4).

  - mice: `mice_rfps` + `mice_rfp_invitations` + `mice_bids` + `mice_bid_lines` +
    `mice_bid_evaluations` — multi-supplier bid solicitation, comparison, and
    scoring (the gap CRM quote/opportunity didn't cover). `awardRfp` atomically
    accepts the winning bid, rejects the rest, and moves the RFP to `awarded`.
    Service + admin routes + rfp/bid linkables; supplier-FK refs handled.
  - schema-kit: TypeID prefixes mrfp/mrfi/mbid/mbln/mbev.
  - Deployment link: bid↔supplier.

  Follow-up (workflow): the `mice.rfp.awarded` subscriber that auto-spawns the
  legal contract + provisional room block + booking is operator-side automation,
  deferred to a workflow PR.

## 0.110.0

### Minor Changes

- 06cfcf5: Delegate registry + rooming manifest + booking extension (Phase 3).

  - mice: `mice_program_delegates` (role + lifecycle status; PII stays on the
    linked CRM person/booking per §9-Q7) + `mice_delegate_session_enrollments`
    (idempotent per delegate+session); first-class rooming manifest
    (`mice_rooming_assignments` + `mice_rooming_assignment_delegates` join for
    shared rooms, §9-Q5); `booking_mice_details` HonoExtension on bookings.
    Services + admin routes + delegate/rooming linkables. FK refs validated
    up-front (4xx, not FK 500).
  - schema-kit: TypeID prefixes mpdl/mdse/mrma/mrad/bkmd.
  - Deployment links: delegate↔person, delegate↔booking, rooming↔roomBlock.

## 0.109.0

### Minor Changes

- 787c852: Space blocks + shared allotment-lifecycle primitive (Phase 2b).

  - New `@voyant-travel/allotments`: the canonical allotment lifecycle contract
    (status state machine, counter math, pickup-progress derivation, slot
    enumeration) — one contract reused by type-specific tables (RFC §9-Q2).
  - accommodations: room-block service refactored onto the shared primitive
    (behavior-preserving; enum values unchanged, no migration).
  - operations: `space_blocks` / `space_block_slots` / `space_block_pickups` —
    held function-space inventory over a date range, the 2nd allotment consumer;
    transactional pickup/reversal/cutoff service + admin routes + `spaceBlockLinkable`.
  - schema-kit: TypeID prefixes `spbl` / `spsl` / `sppu`.

## 0.108.0

### Minor Changes

- 924d201: Room-block allotment (Phase 1) + MICE program spine.

  - accommodations: `room_blocks` / `room_block_nights` / `room_block_pickups` with
    per-night counters, CHECK invariants, an append-only pickup ledger, and a
    transactional pickup/reversal/cutoff-release service; first
    `accommodationsHonoModule` (registered in the framework standard set) +
    `roomBlockLinkable`.
  - operations: `property` / `facility` linkable definitions.
  - mice (new): `mice_programs` umbrella + admin routes + `programLinkable`,
    mounted operator-local.
  - schema-kit: TypeID prefixes `hrbn` / `hrbp` / `prog`.

- f311826: Function spaces + capacity-by-layout (operations) and agenda sessions (mice) — Phase 2.

  - operations: `function_spaces` (venue sub-spaces, nestable via `parentSpaceId`
    for combinable rooms / exhibition booths) + `function_space_capacities`
    (per-layout headcount: theater / classroom / banquet / cabaret / boardroom /
    u_shape / reception / hollow_square); service + admin routes + `functionSpaceLinkable`.
  - mice: `mice_program_sessions` (timed, capacity-bound agenda items with
    session type + optional function-space link) + `mice_session_inclusions`
    (F&B / AV / materials / signage); service + admin routes + `sessionLinkable`.
  - schema-kit: TypeID prefixes `fnsp` / `fnsc` / `mpss` / `mssi`.

## 0.107.0

### Minor Changes

- b68d6a7: Add the dynamic-packaging requirement/candidate model to Trips (voyant#2082 / voyant#1600) — keystone gap 2.

  - **`@voyant-travel/trips`** — new `trip_requirements` (unresolved customer need on an envelope: vertical + criteria + criteriaVersion mirroring the catalog `AvailabilitySearchRequest`) and `trip_candidates` (a normalized `AvailabilityCandidate` attached to a requirement: rank, status, origin, decimal price, TTL, internal `providerData`) tables, with enums, relations, and migration `0001`. Service operations: `addRequirement`, `sourceRequirementCandidates` (runs a deployment-injected availability fan-out, persists the ranked set), `selectCandidate` (enforces selected-uniqueness, pins a draft catalog component the existing price/reserve pipeline re-validates), `reshopRequirement` / `reshopTrip`, and `expireStaleTripCandidates` (TTL reaper). `reserveTrip` now gates on all required requirements being resolved. The fan-out is injected (`SourceRequirementCandidatesDeps`), never a named provider.
  - **`@voyant-travel/schema-kit`** — register TypeID prefixes `trrq` (trip_requirements) and `trcd` (trip_candidates).

  Additive; no behavioral change to existing trip flows (an envelope with no requirements reserves exactly as before).

## 0.106.2

### Patch Changes

- e799cea: Fix duplicate TypeID prefix `pdst`: `product_day_service_translations` (added in #2067) collided with the existing `product_destinations`. Re-prefix the day-service-translations table to `pdsr` so prefix→table lookup is unambiguous and the `db` "no duplicate prefix" test passes.

## 0.106.1

### Patch Changes

- fcd2e0b: Add itinerary and day-service translation authoring surfaces, and localize owned itinerary content projection for translated days and service labels.

## 0.106.0

### Minor Changes

- a74471e: Register the `quote_media` TypeID prefix (`qmed`) for quote images/attachments.

## 0.105.3

### Patch Changes

- e80e3d3: Add Trips reservation plans and route active plan submission through Bookings.

## 0.105.2

### Patch Changes

- f25e790: New `@voyant-travel/db/write-intents` + `write_intents` table (TypeID prefix `wint`) — the queued write pipeline's result mailbox (RFC #1687 Phase 3.2). **Requires the `write_intents` migration.** `enqueueWriteIntent` dedups on `idempotencyKey` (a retried POST returns the SAME intent), `settleWriteIntent` only transitions pending rows (at-least-once redelivery after success is a no-op), and `expireStaleWriteIntents` backstops intents whose event dead-lettered in the outbox.

## 0.105.1

### Patch Changes

- b7056f1: New `@voyant-travel/db/outbox` module + `event_outbox` table (`schema/infra`, TypeID prefix `evob`) — the Postgres half of the transactional outbox (RFC #1687 Phase 2.1). **Requires the `event_outbox` migration.**

  - `createOutboxEventStore(getDb)` — plugs into `createEventBus`'s durable emit.
  - `insertOutboxEvents(dbOrTx, envelopes)` — atomic capture inside a domain transaction ("transactional outbox" proper); dedups on `metadata.eventId`.
  - `claimDueOutboxEvents` — visibility-timeout claiming (single statement, `FOR UPDATE SKIP LOCKED` subquery — safe on neon-http and under concurrent drains; a crashed claimer's rows simply become due again).
  - `drainOutbox(db, bus, opts)` — claim → redeliver via `bus.deliver` → complete / reschedule with exponential backoff (5s·2^attempts, 15min cap, jitter) / dead-letter after `max_attempts`.
  - `pruneDeliveredOutboxEvents`, `getOutboxStats`.

  Delivery is **at-least-once**: subscribers must be idempotent (the workflow forwarder already dedups on eventId; plugin subscribers key on external refs).

  Also: `createTestDb()` disables the Phase-1 default statement/query timeouts for test clients — `cleanupTestDb`'s full-schema TRUNCATE could exceed the 10s production default and kill integration-suite setup.

## 0.105.0

### Minor Changes

- d1ad572: Rename CRM sales artifacts from Opportunities to Quotes, split Quote Versions into their own schema/API surface, and update the corresponding TypeID prefixes.
- d1ad572: Add composer-owned Trip snapshot freezing and read APIs for Quote Version proposal snapshots.

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

## 0.104.1

## 0.104.0

## 0.103.0

## 0.102.0

## 0.101.2

### Patch Changes

- 577eaf5: Add in-context translations for products and itinerary days.

  - `@voyant-travel/products`: add a `products.default_language_tag` column (the language the base name/description columns are written in) and a new `product_day_translations` table (per-language title/description/location) with CRUD service methods and routes under `/v1/products/:id/days/:dayId/translations`.
  - `@voyant-travel/products-contracts`: validation schemas for the product default language and itinerary-day translations.
  - `@voyant-travel/products-react`: `useProductDayTranslations` / `useProductDayTranslationMutation` hooks, record/response schemas, and query keys; the product record now exposes `defaultLanguageTag`.
  - `@voyant-travel/schema-kit`: `product_day_translations` TypeID prefix (`pdtr`).
  - `@voyant-travel/i18n`: operator labels for the content-language switcher, default language, itinerary-day sheet, and market-rule columns.

## 0.101.1

## 0.101.0

## 0.100.0

## 0.99.0

## 0.98.0

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
