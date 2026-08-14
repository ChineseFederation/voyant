# @voyant-travel/schema-kit

## 0.118.9

### Patch Changes

- 38531e2: Advertise email fields with a regex a strict-schema LLM client can parse.

  Zod's default `z.email()` pattern opens with `^(?!\.)(?!.*\.\.)`, and providers
  that validate tool schemas with an RE2-style engine reject regex lookaround
  outright. A client sends every authorized tool schema in one model call, so the
  18 affected fields took down every turn of a conversation, including questions
  that never touched the Tools carrying them.

  `@voyant-travel/schema-kit/email` now exports `emailAddress()`, which says
  exactly what zod's default says but structurally: the local part is
  dot-separated runs of non-dot characters, which is what "no leading dot, no
  consecutive dots, no trailing dot" means. A differential fuzz against
  `z.regexes.email` over 700k inputs found zero classification differences, so no
  field's verdict changes. At 84 characters it is also shorter than the 96-char
  default it replaces, which matters because these patterns ship inside every
  advertised Tool schema.

## 0.118.8

### Patch Changes

- d7b824d: Persist idempotent booking inquiries and route them through the existing durable staff-alert delivery lifecycle.

## 0.118.7

### Patch Changes

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

## 0.118.6

### Patch Changes

- 5825546: Add staff event notifications: pre-baked React Email alerts on existing domain events

  Notifications has only ever mailed customers. Staff found out that a booking was
  confirmed, a payment landed, or an enquiry arrived by opening the admin and
  looking. This adds the staff side.

  Two preference layers land as `staff_alert_settings` (admin-owned, one row per
  alert, carrying routing) and `staff_alert_preferences` (per staff user).
  Absence of a preference row means _inherit_, never _off_, so a staff member who
  has never opened the preferences page still receives what the deployment
  enables.

  Six alerts ship, all subscribing to events the graph already declares:
  `booking.confirmed`, `booking.cancelled`, `payment.completed`,
  `invoice.settled`, `contract.signed`, and `customer.signal.created`. All default
  to off — upgrading does not start mailing an operator who never asked for it.

  Templates are code, not content: a new `@voyant-travel/notifications/emails`
  entry point renders React Email components against the operator's brand colour,
  corner radius and logo. Customer-facing templates stay operator-editable Liquid
  in `notification_templates`; staff alerts are product surface and are not
  editable. The subpath keeps React out of the package's main entry.

  Because every domain event payload is id-shaped, the data an email needs is
  supplied by deployment-registered resolvers rather than fetched here — reading
  another module's tables would open table-privacy pairs that do not exist.

  `@voyant-travel/schema-kit` gains the `staff_alert_settings` and
  `staff_alert_preferences` TypeID prefixes.

## 0.118.5

### Patch Changes

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

## 0.118.4

### Patch Changes

- 3d793c1: feat: materialize Product Day Services into Departure operations (spine)

  The spine of the multi-day tracer (voyant#4035). A Product's day services were a
  costing list with no operational shape, `product_versions.snapshot` had zero
  readers, and a departure had no per-day structure. This wires the first path
  from a frozen Product Version to immutable per-departure service lines.

  - **A typed snapshot reader** (`@voyant-travel/products-contracts`):
    `parseProductVersionSnapshot` validates the frozen `product_versions.snapshot`
    shape and fails loudly on anything it does not recognise rather than returning
    an empty itinerary. Pure zod, reusable by inventory and operations (and
    voyant#4189).
  - **Operational fields on `product_day_services`**: local start/end time and
    duration, a Place/facility reference, an `inclusion_role`
    (`included` | `optional`), traveller applicability, and a supplier reference
    alongside the existing loose `supplier_service_id`. Propagated through
    validation, service, admin routes, and the inventory-react authoring form.
  - **A `departure_service_operations` table** (`@voyant-travel/operations`) with
    its own `departure_service_operation_status` enum
    (`planned` → … → `completed`, plus `cancelled` / `exception`) and a transition
    guard — deliberately not overloading the capacity-shaped
    `availability_slot_status`.
  - **Idempotent materialization** from the frozen snapshot, mapping day N to the
    departure date + (N-1) in the slot timezone, keyed on
    `(slot_id, source_day_service_id)`. Wired into both slot-creation paths. A
    later Product edit does not mutate an already-materialized departure — proven
    by an integration test.

  Spine only: no run-sheet UI and no supplier-operations changes, which are
  follow-ups.

## 0.118.3

### Patch Changes

- 4c694f6: Gate sourced catalog entries on channel publication, and let operators choose
  which supply sources each channel sells.

  Sourced entries never passed a listability gate: `syncSources` emitted every
  discovered projection into every slice the deployment materialized, so
  attaching a supply connection published that supplier's whole catalogue to the
  operator's live storefront with no publish step. Channel publication could not
  reach them either — its subjects are a product id and a canonical Supplier, and
  a sourced entry has neither.

  `channel_source_publications` adds the missing subject: an include/exclude
  decision on a `(source_kind, source_connection_id)` pair, resolved
  default-deny with connection beating source kind, mirroring the existing
  product-beats-supplier ordering. The discovery sync and the catalog document
  builder both consult it, so revoking publication removes the inventory on the
  next index pass; staff slices stay ungated so operators can still browse a
  connected supplier to decide what to sell. Admin gets a Supply sources tab
  alongside Products and Suppliers, with the same preview-and-confirm step that
  supplier rules use.

  Index documents now carry `isSourced`, `sourceKind`, and `sourceConnectionId`
  in every vertical, so storefronts can scope on ownership directly instead of
  inferring it from `supplyModel` or an id prefix.

  Deployments with inventory already indexed are backfilled with an explicit
  `include` rule per connection per active channel, so nothing disappears from a
  live storefront on upgrade — the status quo becomes something the operator can
  see and revoke rather than something implied by having connected at all.
  Connections attached after this ships are unpublished until chosen.

## 0.118.2

### Patch Changes

- dcda88d: Describe every package on the public surface.

  The npm assembly path is now private — the deployment ships as an image — so the
  published surface is the fourteen packages an external adapter, connector, or
  extension author builds against. Each now says what it is for.

## 0.118.1

### Patch Changes

- eeaa5b5: Make Booking Sessions the sole Booking Platform v1 pre-commit lifecycle.

  The transactional beta-data cutover verifies genuine commitments, releases
  owned capacity, preserves resumable staff attempts as canonical Sessions,
  redacts disposable attempts into audited tombstones, and then removes
  `booking_drafts`. The duplicate quote/draft/hold routes, draft capability,
  reaper, low-level quote tool, and deployment source-provider gate are removed.

## 0.118.0

### Minor Changes

- 9f412dd: Add the Booking Platform v1 action projection: authoritative Catalog, Finance,
  and Legal obligation readers, an Operations work queue with deterministic
  incremental and rebuild jobs, a redacted storefront next-action API, explicit
  Payment Schedule timezones, and reminder scheduling from projected deadlines.
- 2ed62d3: Remove the beta Booking-backed session and low-level public Booking creation
  surfaces. Custom storefronts now construct reservations exclusively through
  Catalog Booking Session v1, while Bookings exposes only committed-reservation
  overview and guest-access routes.

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
