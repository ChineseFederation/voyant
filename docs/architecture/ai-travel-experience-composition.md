# AI Travel Experience Composition

Status: implemented foundation / hardening reference
Audience: anyone designing AI-assisted storefront, itinerary planning, package composition, and checkout flows in Voyant.

This document captures the missing product and architecture layer needed for
Voyant to support **AI Travel Experiences**: an operator's customer can chat
with an AI assistant, shape an itinerary, receive hotels, flights, products,
transfers, extras, and other services, then reserve or buy through a clean
checkout path.

The core conclusion is:

**AI should be a caller, not the domain module.** Voyant needs a deterministic
composition module that turns customer intent into a priced, holdable,
checkout-ready itinerary. AI agents, staff quote builders, storefront wizards,
and partner APIs can all call that same module.

Implementation status: `@voyant-travel/trips` now exists as the
deterministic composition package. It has durable Trip Envelope / Trip
Component schema, Zod contracts, trip operations, catalog-backed component
adaptation, aggregate price/tax snapshots, reserve and checkout handoff
workflows, component-level cancellation preview/cancel operations, Cruise
Extension placement helpers, admin/public Hono routes, and AI-safe MCP tools.
`@voyant-travel/trips-react` exposes the corresponding client operations,
query keys/options, provider, and hooks. The remaining work is integration
hardening: deeper vertical holds, generic checkout extraction beyond the
operator starter, public-safe flight booking surfaces, and production admin UI
for support workflows.

Execution plan: use
[`trips-implementation-plan.md`](./trips-implementation-plan.md)
for the feature-branch and PR-by-PR rollout.

Current code alignment, May 2026:

- The single-line booking journey foundation has shipped as Booking Platform
  v1: Booking Sessions, immutable revision-bound Quotes, real-capacity Holds,
  idempotent Commit, React hooks, and storefront/admin route adapters.
- The composer is catalog-first. It selects Catalog Items, not Product tables,
  hotels, or other vertical-owned tables directly. `sourceKind: "owned"` is
  one catalog provenance/fulfillment path: the booking engine calls an internal
  Voyant handler when that module is installed. Sourced rows call the supplier
  or inventory-source adapter. OTA deployments can omit Inventory and still
  compose trips entirely from sourced Catalog inventory.
- Catalog HTTP APIs provide AI-safe discovery and quote access. Agent runtimes
  wrap those APIs as local tools; the first-party `catalog-mcp` package is not
  part of the v1 public surface.
- Flights, Operations ground logistics, Finance checkout, workflows, storefront
  SDK, and public contracts remain separate modules. The composer groups their
  commitments under one customer-facing Trip Envelope, but live flight booking
  is still held behind public-safe flight search/price/reserve/order-status
  surfaces.
- `POST /v1/public/catalog/checkout/start` is working starter-owned storefront
  glue, and the operator composer adapter can call the extracted
  `startCatalogCheckout(...)` function. A generic composer should still depend
  on framework-owned catalog and finance checkout services before non-operator
  templates consume it directly.

## 1. Current foundation

Voyant already has many of the required primitives:

- **Trips** in `@voyant-travel/trips` for Trip Envelopes, Trip
  Components, deterministic create/revise/price/reserve/checkout/cancellation
  operations, Cruise Extension representation, Hono route mounting, and MCP
  tools. It groups multiple component bookings/orders into one customer-facing
  trip without collapsing component-level taxes, cancellation rules, supplier
  references, or support state.
- **Trips React** in `@voyant-travel/trips-react` for admin and
  public client operations, validation-aware fetches, cache writers, query
  options, and hooks.
- **Catalog plane** for normalized discovery across operated and sourced
  inventory, with resolved views, provenance, overlays, search, and booking
  snapshots.
- **Catalog booking engine** in `@voyant-travel/catalog/booking-engine` for
  per-line Booking Session orchestration, Quote/Hold/Commit state,
  source-adapter and owned-handler dispatch, and snapshot capture.
- **Pre-booking holds** through `booking_session_holds` plus
  `availability_holds` for owned product slots. Catalog's Booking Session
  maintenance job expires Sessions and releases abandoned capacity.
- **Catalog semantic search** in `@voyant-travel/catalog` for embedding providers,
  semantic/hybrid search orchestration, model-version helpers, and
  cross-audience federated search.
- **Catalog HTTP APIs** for AI-safe catalog access. Agent runtimes define local
  tool wrappers over `/v1/admin/catalog/search`, `/v1/public/catalog/search`,
  and drill-down APIs instead of depending on a first-party catalog MCP package.
- **Flights vertical** in `@voyant-travel/flights` for live-API flight contracts,
  multi-connection fan-out, itinerary fingerprinting, booking snapshots, and
  reference-data provider contracts. Public/admin route mounting remains a
  template concern.
- **Ground transport** in `@voyant-travel/operations/ground` for operators,
  vehicles, drivers, dispatch, execution, assignments, positions, shifts, and
  related operational records.
- **Booking Sessions** for public booking-session flows and scoped checkout
  capabilities, including storefront bootstrap paths.
- **Finance checkout** in `@voyant-travel/finance` for collection plans,
  bank-transfer/card initiation, and booking-session-backed collection
  bootstrap.
- **Operator storefront checkout wiring** for `POST
  /v1/public/catalog/checkout/start`, including card, bank transfer, inquiry,
  and hold intents. This is currently starter-owned glue, not a reusable
  composer API.
- **Workflows** for durable orchestration, retries, compensation, and the
  booking-engine checkout-finalize flow.
- **Storefront/public contracts** that separate customer-facing routes from
  admin CRUD semantics.
- **React/runtime layers** such as `catalog-react`, `storefront-react`,
  `finance-react` checkout UI, and source-installed UI packages that keep
  public flows reusable without owning the final storefront shell.

The missing piece was not more CRUD around those modules. It was a first-class
**composition layer** between catalog discovery and the commercial ladder. That
layer now exists in foundation form; this document remains the source of truth
for hardening the component boundaries, public surface, and cross-vertical
workflow behavior.

## 2. Desired customer journey

A representative storefront flow:

1. Customer opens chat on an operator storefront.
2. Customer says: "Plan a 9-day Egypt trip in October for two adults, boutique
   hotels, private guides, no overnight trains, budget around EUR 7,000."
3. AI asks only the missing questions needed to produce a useful trip.
4. System creates a trip with day-by-day structure and candidate
   sellable items.
5. Customer revises: "Add one beach day and make the Cairo hotel nicer."
6. System reprices and validates availability.
7. Customer sees a clean itinerary summary with live prices, expiry warnings,
   cancellation/payment terms, and alternatives.
8. Customer clicks **Reserve now** to place time-limited holds or **Buy now** to
   proceed directly to collection.
9. System creates the right Booking / Order / Payment Session records, captures
   catalog snapshots, and starts checkout.

The AI should never invent sellable inventory or mutate bookings directly. It
should call deterministic tools backed by Voyant modules.

## 3. Module

Package name:

`@voyant-travel/trips`

Alternative names:

- `@voyant-travel/itinerary-composer`
- `@voyant-travel/travel-experiences`

Recommendation: use a domain name, not an AI name. The module's job is
composition. AI is one caller.

### 3.1. Responsibility

The composer owns the pre-commitment itinerary composition lifecycle:

- capture customer intent and constraints
- create candidate trips
- attach candidate CatalogEntries and live-API offers
- compare alternatives
- price the full trip
- validate live availability
- reserve the selected trip
- start checkout or convert into the existing commercial ladder

It does not own:

- catalog indexing or semantic search
- catalog MCP discovery tools
- single-line booking journey state
- vertical-specific pricing topology
- payment-provider integration
- final storefront brand/UI shell
- provider-specific source adapters
- LLM prompting as a hard dependency

### 3.2. Minimal interface

The composer interface stays small and deterministic:

```ts
createTrip(intent)
reviseTrip(tripId, instruction)
priceTrip(tripId)
reserveTrip(tripId)
startCheckout(tripId | bookingId)
```

The implementation behind those calls can be deep: catalog search, vertical
quote calls, hold creation, booking-session writes, workflow orchestration,
checkout bootstrap, audit, and compensation.

## 4. Domain concepts

These terms are mirrored in `UBIQUITOUS_LANGUAGE.md` where they are stable
enough to guide implementation.

### Trip / Package Envelope

The customer-facing aggregate that ties together one travel purchase or
planning session: title, itinerary timeline, traveler party, combined price,
checkout state, documents, support context, and cancellation preview.

It is not necessarily one Booking. It may contain:

- one operated group departure booking
- several independent FIT bookings/orders
- manual placeholders
- future package-level commercial artifacts

The envelope is what the customer experiences as "my trip." The underlying
commitments stay split where their lifecycle differs.

### Operated Group Departure

A fixed operator-sold product with a departure date, capacity, itinerary, and
often internal components such as bus transport, stays, included excursions,
guide assignment, rooming list, and optional Extras.

Example: a 5-day Bucharest to Istanbul group tour. The bus, included stays,
included excursions, and departure capacity are product-internal concerns.
They should remain inside that product/departure booking unless one component
is sold and cancelled independently by a different supplier.

### Composed FIT Trip

An individually composed trip assembled from independent commitments: flight,
stay, tour, transfer, cruise, rail, tickets, or staff-confirmed placeholders.
The customer may build and buy it in one flow, but the backend should keep
independently cancellable/provider-backed commitments as separate
bookings/orders under the Trip / Package Envelope.

Example: book the 5-day Bucharest to Istanbul group departure, then add 3
extra nights in Bucharest, then add a Bucharest to London flight. The group
departure is one component; the post-stay and flight are sibling components in
the same customer-facing trip.

### Component Booking / Order

One independently committed part of a Trip / Package Envelope. It has its own
supplier/provider reference, cancellation rules, tax treatment, fulfillment
state, and operational owner.

The lifecycle boundary rule:

**Split by lifecycle boundary. Nest by dependency. Aggregate by customer
experience.**

Verticals often imply lifecycle boundaries, but not always. Breakfast and
parking depend on the stay; baggage and seats depend on the flight; cruise-line
excursions depend on the cruise booking. A separately operated transfer or
museum ticket is a sibling component, even if the UI offered it as an upsell.

### Extra

A child line that modifies or extends a Component Booking and shares its
supplier lifecycle closely enough to be cancelled, fulfilled, taxed, and
supported with that booking.

Use **Extra** as the canonical domain term because the existing vertical,
schemas, pricing rules, and admin UI are already named `extras`,
`product_extras`, `booking_extras`, and `ExtraPriceRule`. Existing V1 booking
journey contracts still expose `addonGroups` / `AddonsStep`; treat that as
legacy wire/UI naming until a compatibility migration is worth the churn.

Examples:

- hotel room + breakfast + parking = one stay component with Extras
- flight + bags + seats = one flight order with ancillaries
- cruise cabin + cruise-line excursions + cruise-line pre/post Cruise Extension
  = one cruise component when the cruise line owns those services

When an offered Extra is operated by a separate supplier with independent
confirmation or cancellation rules, it is not a child Extra for backend
purposes; it is a sibling Component Booking / Order under the same Trip /
Package Envelope.

Cruise vocabulary exception: **Cruise Extension** is a vertical-specific
category for pre/post-cruise hotel or land programs. It is not a generic
replacement for Extra. The extension's catalog definition can be shared across
multiple cruises or sailings; the selected extension line is what gets nested or
split. Model that selected line as an Extra when it is sold, confirmed, changed,
cancelled, taxed, and supported as part of the cruise booking; model it as a
sibling Component Booking / Order when it has an independent supplier or
lifecycle.

### Trip Envelope

The durable customer-facing aggregate for a composed trip. It can contain
freeform narrative, day-by-day structure, candidate sellable items, unresolved
requirements, rejected alternatives, and AI rationale.

It is not a Booking, Order, or Offer. It has not committed inventory until the
reserve/checkout workflow creates the relevant underlying commitments. `draft`
is one lifecycle status of a Trip Envelope, not the object name operators or
customers should see.

### Trip Component

One proposed or committed component of a Trip Envelope. It may reference:

- a CatalogEntry
- a vertical-specific live offer, such as a flight offer
- a Booking Session and its current revision-bound Quote for one bookable line
- a freeform placeholder needing staff action
- an informational/non-sellable activity

Do not overload Booking Session state with the whole multi-line itinerary. A
Booking Session is a per-line, resumable booking attempt. A Trip Envelope is
the multi-line composition aggregate that can point at zero or more Sessions
through its Trip Components.

### Priced Trip

A Trip after live pricing and availability validation. Prices may have expiry
timestamps, warnings, unavailable components, or alternatives.

### Reserved Trip

A Trip whose selected components have been held or booked upstream and converted
into Voyant's Booking Session / Booking / Order structures as appropriate.

A Reserved Trip may resolve to one Booking with many items, multiple Bookings
under a booking group, or component Orders/Bookings under a Proposal Version
snapshot. The composer must keep that grouping decision behind its service
interface so the accepted proposal can preserve the Trip snapshot without
erasing component lifecycle boundaries.

Default grouping decision for cross-vertical composition:

- Use one component booking/order per independently operated or independently
  cancellable commitment.
- Keep product-internal bundles and dependent Extras inside that component.
- Put all components under the Trip / Package Envelope so the customer still
  gets one itinerary, one checkout flow, and one support/cancellation surface.

### Experience Session

The customer-facing planning session: conversation transcript summary,
customer constraints, selected trip, current state, and consent/approval
history. This is the AI/storefront wrapper around one or more Trip Envelopes.

## 5. Relationship to existing architecture

### 5.1. Catalog plane

The composer reads the catalog plane for discovery:

- "find family-friendly Nile cruises"
- "show boutique hotels in Cairo"
- "suggest day tours near Luxor"
- "find alternatives similar to this product"

The catalog plane remains upstream of the commercial ladder. The composer does
not introduce a universal CatalogEntry table or universal pricing engine.

### 5.2. Vertical modules

Each vertical keeps its own truth:

- products resolve product options, units, slots, pricing, and itinerary days
- accommodations resolve room types, rate plans, stay rules, and room-night
  availability
- flights resolve live offers, repricing, booking, and order status through
  adapters
- cruises resolve sailings, cabins, pricing, and itinerary
- charters resolve charter-specific pricing and contracts
- extras attach to a parent booking or product flow

The composer coordinates verticals. It does not flatten them.

### 5.2.1. Group departure vs FIT composition

Do not conflate these axes:

- **Operated group departure**: the operator sells a fixed departure as one
  product with capacity and product-internal components. The booking journey
  commits that product as one component booking.
- **Composed FIT trip**: the customer assembles independent commitments. The
  composer groups them under a Trip / Package Envelope but keeps backend
  commitments split by lifecycle boundary.
- **Combined customer experience**: both cases can present one itinerary, one
  checkout, one document set, and one cancellation preview.

The composer can compose around an operated group product. A customer may book
a 5-day group tour, then add post-stay nights and a flight home. The group tour
remains one booking component; the post-stay and flight become sibling
components in the same envelope.

This distinction prevents two bad extremes:

- exploding an operated group product into unrelated bookings for bus, stays,
  included excursions, and internal allocations
- forcing a customer-composed flight + hotel + tour into one backend booking
  when cancellation, taxes, fulfillment, and provider references differ

### 5.3. Catalog booking engine and Booking Sessions

The single-line booking journey and catalog booking engine now provide the
leaf primitives the composer should reuse:

- The selection contract describes one bookable line's required steps,
  traveler fields, payment intents, accommodation sub-steps, and Extras.
- `booking_sessions` stores the resumable attempt and optimistic revision.
- `booking_session_quotes` stores immutable, short-lived pricing bound to one
  exact Session revision; `booking_session_holds` stores its Holds.
- Commit dispatches to the correct owned handler or source adapter and captures
  the Booking snapshot only at the governed commitment point.

The composer should hold N Trip Components and call those primitives per
component. It should not create a second single-line booking engine, and it
should not force
the booking journey to understand a whole custom itinerary.

Current caveats:

- Quotes are revision-bound. The composer must store Session and Quote
  references per Trip Component, not on the Trip Envelope root.
- The current hold token convention is not yet uniform. Products bridge a
  Booking Session Hold to `availability_holds`; cruises and accommodations
  return placeholder/stamping holds until their inventory models expose real
  locks; sourced adapters still lack a hold-only release primitive.

### 5.4. Commercial ladder

ADR-0018 makes the travel-native bespoke sales flow:

**Proposal -> accepted Proposal Version -> Booking Session -> Quote + optional
Hold -> Commit -> Booking -> Fulfillment**

The composer sits before and around that ladder:

- Trip Envelope in `draft` status is pre-commitment.
- Priced Trip can be frozen into a Proposal Version, which is the sendable,
  acceptable proposal snapshot.
- Accepting a Proposal Version starts the Booking Session / reserve workflow;
  it does not mean every live or manual component is supplier-confirmed.
- The reserve workflow prices the exact Booking Session revision into a Quote
  and creates optional Holds where supported. Commit creates the Booking only at
  the selected policy commitment point from
  [ADR-0019](../adr/0019-booking-v1-commitment-point-policies.md).
- Checkout may establish a required payment guarantee, but Finance state does
  not become Booking status.

Transactions Offer remains only as a legacy transactions-package primitive for
pre-v1 compatibility flows. It is not the bespoke travel proposal artifact for
the composer.

### 5.5. Booking Sessions

Booking Sessions support public customer checkout state after a booking row
exists, protected by a scoped checkout capability. They cannot bootstrap or
create that booking row.

They are too late and too item-concrete to be the full AI planning state. The
composer should create or update Booking Sessions only after a Trip has been
priced and the customer asks to reserve/buy, or when handing a single Trip
Component to the existing booking journey.

### 5.6. Checkout

Checkout remains provider-agnostic. The composer should call checkout once it
has a booking-backed or booking-session-backed target and a clear collection
intent, using the existing collection primitives:

- deposit
- full amount
- schedule line
- exact amount
- bank transfer
- card

The reusable code surface is `previewCheckoutCollection`,
`initiateCheckoutCollection`, and `bootstrapCheckoutCollection`; the current
customer-facing catalog handoff is
`POST /v1/public/catalog/checkout/start` in the operator starter. Before a
generic composer ships, extract the reusable parts of that route into
framework-owned catalog and finance checkout services. The composer should not mint
arbitrary payment amounts in a public flow.

### 5.7. Workflows

Cross-vertical reserve/buy is a saga. Use workflows for:

- live repricing all selected items
- checking availability
- placing holds/bookings
- capturing snapshots
- releasing holds on partial failure
- aligning expiries
- starting checkout
- sending notifications

Do not put cross-item compensation in a prompt, route handler, or React hook.
The reserve/buy path needs an explicit workflow/service boundary with durable
step recording, because partial upstream holds are normal in multi-vertical
travel composition.

## 6. AI tool surface

The existing MCP catalog tools are necessary but not sufficient.

Already shipped catalog tools:

- `search_catalog`
- `get_entity`
- `suggest_alternatives`
- `check_availability`
- `get_quote`

AI Travel Experiences need composition tools on top of those catalog tools.

Candidate tools:

- `create_experience_session`
- `update_traveler_intent`
- `create_trip`
- `revise_trip`
- `search_catalog`
- `suggest_alternatives`
- `check_availability`
- `price_trip`
- `explain_itinerary_terms`
- `reserve_trip`
- `start_checkout`
- `handoff_to_staff`

Tool rule:

**Tools mutate only through deterministic domain services.** The LLM proposes
intent and choices; services validate, price, reserve, and persist.

## 7. Safety and control policy

The system needs a policy layer before any AI-controlled action can reserve or
collect money.

Required controls:

- **Inventory provenance**: every sellable item must resolve to a CatalogEntry,
  source adapter offer, or explicitly marked manual placeholder.
- **Freshness**: live prices and availability must be checked immediately
  before reserve/buy.
- **Expiry disclosure**: customer-facing UI must show quote/hold expiry.
- **Budget guardrails**: price increases beyond a configured tolerance require
  customer confirmation.
- **Terms disclosure**: cancellation, payment, guarantee, baggage/fare, and
  supplier terms must be surfaced before reserve/buy.
- **PII boundaries**: collect traveler PII only when required, store it through
  existing booking/customer-profile paths, and avoid embedding it.
- **Tool audit**: record AI-requested actions, tool inputs, service results,
  and user confirmations.
- **Human handoff**: unsupported, ambiguous, high-value, or policy-blocked
  trips can become staff tasks instead of failed chats.

The policy should be deterministic and testable. It should not live in prompts.

## 8. Storefront and developer experience

Voyant should not ship a closed turnkey AI storefront. It should ship reusable
pieces that developers can compose into an operator-owned storefront.

Framework-owned:

- public contracts for experience sessions and trips
- React hooks for composer state
- local tool definitions for composer operations, layered above catalog HTTP
  APIs when catalog search is needed
- workflow helpers
- default policy implementation
- source-installed UI blocks for chat, itinerary cards, alternative selection,
  price/expiry badges, and checkout handoff

Template/app-owned:

- final brand expression
- page routes and layout
- model provider choice
- prompting/personality
- lead-capture and marketing integrations
- staff escalation workflow details

## 9. Data model sketch

Possible tables, subject to refinement:

```txt
experience_sessions
  id
  actor_type
  customer_user_id
  person_id
  organization_id
  locale
  market
  channel
  status
  intent_summary
  constraints_json
  selected_trip_envelope_id
  created_at
  updated_at

trip_envelopes
  id
  experience_session_id
  status
  title
  start_date
  end_date
  pax
  currency
  total_amount_cents
  pricing_status
  reserved_booking_id
  reserved_booking_group_id
  checkout_session_id
  checkout_collection_id
  created_at
  updated_at

trip_days
  id
  trip_envelope_id
  day_number
  date
  title
  summary

trip_components
  id
  trip_envelope_id
  day_id
  item_kind
  vertical
  entity_id
  booking_draft_id
  quote_id
  booking_id
  booking_item_id
  hold_token
  hold_expires_at
  source_offer_id
  source_snapshot_id
  title
  quantity
  status
  price_json
  availability_json
  terms_json
  metadata

experience_tool_events
  id
  experience_session_id
  trip_envelope_id
  tool_name
  requested_by
  input_json
  result_json
  created_at
```

Do not commit to this schema prematurely. The important decision is the seam:
multi-line planning state is separate from per-line Booking Session state until
the customer asks to reserve or buy.

Avoid making the Trip Envelope depend on exactly one Booking. Multi-line
composition may need one Booking with many items, several Bookings under a
group, or several component Orders/Bookings under an accepted Proposal Version.
The schema should preserve line-level commit references and an optional
aggregate reference.

For MVP, bias toward several component bookings/orders under one envelope for
FIT composition, while allowing a component itself to contain child booking
items/Extras when they share lifecycle. This keeps cancellation and tax
materialization line-specific without sacrificing the unified customer
experience.

## 10. Reserve / buy workflow

High-level reserve flow:

1. Load selected Trip Envelope.
2. Validate required customer and traveler information.
3. For every selected Trip Component, create/update a per-line booking draft
   where the catalog booking journey applies.
4. Reprice every selected item through `quoteEntity`, the relevant
   vertical/source adapter, or flight repricing.
5. Check availability for every selected item.
6. Apply policy gates: budget, terms, expiry, PII, unsupported items.
7. Place Holds and Supplier Operations in dependency order.
8. On partial failure, release successful holds and return alternatives.
9. Create or update Booking Session structures and Commit only when the selected
   commitment policy authorizes Booking creation.
10. Capture catalog snapshots for committed items.
11. Return checkout-ready target and hold expiry summary.

Reservation and cancellation should run at component level. The composer may
show one Reserve/Buy/Cancel action, but the workflow must record which
component bookings/orders succeeded, failed, or require staff remediation.

High-level buy flow:

1. Run reserve flow or reuse an unexpired Reserved Trip.
2. Compute collection plan.
3. Start checkout collection bootstrap/initiation against the booking or
   booking session.
4. Return provider redirect / payment session / bank transfer instructions.
5. Continue fulfillment through existing booking, finance, legal, and
   notification workflows.

## 11. Open questions

1. **Where to store conversation state.** The composer should store structured
   summaries and decisions, not raw prompt dependence. Raw transcript retention
   may be app-owned or configurable.
2. **Staff handoff shape.** Could use Proposal, Proposal Activity, or a dedicated
   support task depending on operator workflow.
3. **Public vs admin AI tools.** Customer agents need strict customer-audience
   access. Staff agents may federate across audience pools and see operational
   fields.
4. **Flights in public surface.** The `@voyant-travel/flights` package now provides
   contracts, fan-out, snapshots, and reference-data providers, but AI
   storefront use still needs public-safe route mounting for search, price,
   reserve, and order-status surfaces. The operator starter has flight UI/API
   wiring, but the composer should not assume a customer-safe flight route
   family exists yet.
5. **Manual placeholders.** Real operators often need "we will confirm this
   hotel manually." The composer should support placeholders without pretending
   they are live inventory.
6. **Ground transport boundary.** `@voyant-travel/operations/ground` is operational
   execution state. The composer still needs a sellable transfer/search surface
   before it can treat ground services like normal Trip Components.
7. **Hold-release primitive for sourced Sessions.** Booking Session maintenance
   can release owned holds through owned handlers and can honor
   `AdapterCapabilities.holdReleaseGraceMs`. Sourced adapters currently expose
   `cancel`, not a hold-only release primitive, so sourced soft-hold cleanup
   still needs a SourceAdapter contract addition before broad multi-source
   reserve flows are safe.
8. **Aggregate commit shape.** Decide whether MVP reserve produces one Booking
   with many Booking Items, several Bookings in a booking group, or several
   component Orders/Bookings under an accepted Proposal Version. Current default:
   several component bookings/orders under one Trip / Package Envelope for FIT
   composition; one booking with child items/Extras for operated products and
   dependent upsells. The composer interface can hide this, but checkout,
   documents, cancellation, and support UI need a consistent target.
9. **Template-owned checkout extraction.** `POST
    /v1/public/catalog/checkout/start` exists in the operator starter. The
    current operator adapter can call the extracted `startCatalogCheckout(...)`
    service from that template, which is enough for the integration branch.
    Before shipping the composer as a generic package, move the reusable
    checkout-start pieces into framework-owned catalog and finance checkout
    services so non-operator starters do not depend on operator-local code.

## 12. MVP slices

### Slice 0: choose a deliberately narrow first vertical set

For the first composer demo, use only lines that can already be priced and
committed through today's deterministic services. Recommended first set:

- products
- accommodations, if the selected property/rate-plan path has a real commit
  bridge in the target template
- cruises only when the target template wires the cruise commit bridge and the
  demo accepts placeholder holds
- manual placeholders for ground transfers and staff-confirmed services
- flights excluded unless the work also includes public-safe flight search,
  price, reserve, and order-status routes

This keeps the first slice honest: every sellable line either resolves to a
catalog booking-engine quote or is explicitly marked as a manual placeholder.

For the first aggregate shape, use a Trip / Package Envelope with component
bookings/orders. Do not force cross-vertical FIT composition into one booking
row. Keep Extras inside the component booking only when they share
that component's supplier lifecycle.

### Slice 1: extract checkout-start behavior

- Extract reusable checkout-start orchestration from
  `apps/operator/src/api/catalog-checkout.ts` into a callable service.
  The integration branch may keep the callable service in the operator starter
  while the adapter wiring is proven; the hardening slice should move the
  generic parts into framework-owned catalog/checkout services.
- Preserve template ownership of Netopia config, bank details, contract template
  choice, CRM Proposal creation, and storefront URLs.
- Expose a service-level `startCheckout({ bookingId, paymentIntent, ... })`
  that the composer can call after reserve.

### Slice 2: introduce Trip Envelopes

- Add `@voyant-travel/trips` with Trip Envelope, Trip Day, and Trip
  Component contracts.
- Support create/read/revise operations against structured intent and
  constraints.
- Keep all mutation deterministic and service-validated.
- Store per-line references to Booking Sessions and Quotes, flight offers/orders,
  and placeholders. Do not merge the itinerary envelope into Booking Session
  state.

### Slice 3: price a trip

- Add `priceTrip`.
- For catalog-backed items, call the booking-engine quote route/service with a
  per-line `BookingDraftV1`.
- For flights, use the flight adapter repricing path only if the deployment has
  customer-safe access to it; otherwise require a manual placeholder.
- Return warnings, expiries, unavailable items, partial failures, and suggested
  alternatives.
- Add tests for stale price, unavailable item, mixed manual/live items, and
  partial quote failure.

### Slice 4: reserve a trip with workflows

- Add workflow-backed `reserveTrip`.
- Create or update per-line booking drafts where the single-line journey
  applies.
- Place holds/bookings in dependency order, with compensation on partial
  failure.
- Preserve line-level references and optional aggregate references
  (`bookingId`, `bookingGroupId`, or accepted Proposal Version).
- Cover owned-hold release, quote expiry, one-line success, one-line failure,
  and sourced-hold unsupported behavior in tests.

### Slice 5: checkout handoff

- Add composer-level `startCheckout`.
- Use the extracted checkout-start service and existing checkout collection
  primitives for deposit/full/exact-amount collection.
- Return UI-ready output for "Reserve now" and "Buy now": checkout target,
  provider redirect/payment session/bank instructions, hold expiry summary, and
  terms disclosure state.

### Slice 6: ship a reference storefront block

- Chat panel
- Itinerary timeline/cards
- Alternative selector
- Manual-placeholder state
- Live price and expiry badges
- Reserve/buy CTA
- Staff handoff state

## 13. Success criteria

The architecture is working when a developer can build this without inventing
app-local glue:

```txt
Customer intent
  -> AI tool calls
  -> Trip Envelope
  -> Priced Trip
  -> Reserved Trip / Booking Session
  -> checkout bootstrap
  -> Booking / Order / Payment Session
```

The same composer should also support non-AI callers. If a staff proposal builder
or conventional storefront wizard can use the same module, the seam is in the
right place.
