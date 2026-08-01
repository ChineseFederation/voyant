# Product Package Strategy

Status: active v1 strategy. ADR-0005, the frontend package model, and the
package-closure, Interface-proof, schema-move, and migration issues listed in
§8.1 are implemented on `feature/v1-package-restructure`. The beta runtime
package names targeted by this strategy are removed from the v1 workspace
surface rather than shipped as compatibility facades.
Audience: contributors changing package/module shape, starters,
domain vocabulary, or first-party product positioning.

Related:

- [Voyant module, provider, extension, and plugin taxonomy](./module-provider-plugin-taxonomy.md)
- [Catalog architecture](./catalog-architecture.md)
- [Storefront and public contract architecture](./storefront-architecture.md)
- [Schema discipline](./schema-discipline.md)
- [Accommodation resale boundary](./accommodation-resale-boundary.md)
- [Inventory Interface](./inventory-interface.md)
- [Frontend package strategy](../frontend-package-strategy.md)
- [ADR-0002: Pure framework contracts ship as standalone packages](../adr/0002-contract-packages.md)
- [ADR-0018: Proposals are the travel-native bespoke sales artifact](../adr/0018-proposals-as-travel-native-bespoke-sales-artifact.md)
- [ADR-0005: Retire transactions runtime before v1](../adr/0005-retire-transactions-runtime.md)

## 1. Thesis

Voyant should be organized around travel-business modes and product audiences,
not around every internal slice becoming a separately installed package.

The current package graph has too many shallow install seams. The operator
template mounts most domain packages together, and core runtime flows already
cross many packages:

- `storefront` needs catalog, products, availability, pricing, sellability,
  bookings, finance, and customer-facing contracts.
- `sellability` needs products, availability, pricing, markets, distribution,
  and transactions.
- `products-react`, `bookings-react`, and `finance-react` import broad stacks of
  other React packages because real staff workflows do not stop at package
  names.

That is a signal that separate installability is often fictional. Packages that
are normally installed, tested, and reasoned about together should become deeper
Modules with smaller Interfaces and more local Implementation.

This does not mean collapsing Voyant into one package. It means moving from many
thin Modules to fewer, deeper Modules whose seams match real product choices.

## 2. Implementation Modes

Voyant should describe first-party deployments as modes over one shared travel
commerce core.

### Retail OTA / Reseller

An OTA or reseller sells sourced inventory through catalog discovery, live quote,
booking, checkout, finance records, and support workflows.

Typical emphasis:

- sourced inventory and supplier/source adapters
- public storefront and booking sessions
- live price and availability checks
- finance records and customer documents
- support and authenticated storefront account area

Usually optional:

- owned logistics
- ground dispatch
- guide/vehicle/resource assignment
- long-lived room or space blocks

### Tour Operator

A tour operator uses the same commercial core, plus owned products, departures,
local availability, allocations, fulfillment, and operational execution.

Typical emphasis:

- owned products and operated group departures
- availability and allocation
- extras and product-internal add-ons
- bookings, traveler records, rooming lists
- documents, Travel Credits, checkout, finance
- supplier costs and profitability

### B2B DMC

A DMC may sell mostly to other tour operators or travel agents. The customer is
often a business buyer, not the end traveler. The workflow is proposal-first and
logistics-heavy.

Typical emphasis:

- B2B accounts and negotiated commercial terms
- custom Proposal and Proposal Version workflows
- itinerary composition and manual placeholders
- supplier costing and margin control
- local operations: guides, vehicles, transfers, meeting points, allocations
- staged invoices, payment terms, Travel Credits, and operational documents

This is not a separate architecture family from tour operators. It is the same
core with a B2B proposals surface and deeper operations.

### MICE / Corporate Travel

MICE and corporate travel are group/business modes over the same core.

Typical emphasis:

- RFP and bid comparison
- group Programs
- venues, function spaces, room blocks, delegate or attendee rosters
- approvals, budgets, purchase orders, payment terms
- supplier costing and program profitability
- operational run sheets and logistics

MICE should not force a parallel platform. It should be implemented as an
optional `mice` Module with Program as its central entity, reusing Proposals,
Bookings, Operations, Finance, Distribution, Relationships, and Legal through
explicit Interfaces. `corporate` is a bundle/persona label for corporate buyers
and corporate-travel implementations; it is not the Module name.

## 3. Product Audiences

Implementation modes are not the same as audiences. These product audiences are
not raw auth values. Voyant's canonical Actor type vocabulary remains `staff`,
`customer`, `partner`, and `supplier`; product audiences map onto Actor type plus
domain role and relationship context.

| Product audience | Canonical Actor type | Domain role / record | Notes |
| --- | --- | --- | --- |
| Staff | `staff` | Operator User, often linked to a Person | Sales, operations, finance, support, and admin users. |
| Retail customer / traveler | `customer` | Person, Traveler, Participant | A customer buying or managing their own trip. The Traveler may differ from the booker. |
| B2B buyer | `customer` | Organization buyer with Person Participants | Direct B2B commerce with an agency, tour operator, corporate buyer, event organizer, or client organization. |
| Channel / reseller | `partner` | Channel, usually backed by an Organization | Distribution counterparty selling the Operator's inventory onward. |
| Supplier | `supplier` | Supplier and supplier-side Users / contacts | Vendor or operating party delivering inventory or services to the Operator. |
| Delegate / attendee | Usually no standalone Actor type; `customer` only for self-service access | Person, Traveler, Participant, delegate role on a Program | A MICE participant, often distinct from the business buyer and payer. |
| External finance user | Contextual: `customer`, `partner`, or `supplier` | Participant, payer, document recipient, finance contact | Should be workflow-scoped access, not a new auth audience by default. |

The B2B buyer and the Channel are deliberately distinct. A DMC selling to another
tour operator is B2B commerce. It becomes distribution only when the counterparty
is selling the Operator's inventory onward as a Channel.

Do not persist `b2b_buyer`, `delegate`, or `external_finance_user` as new Actor
types without a separate auth/access decision.

External delegate and finance access is a security-sensitive workflow, not just
a package-choice question. Any storefront delegate portal, external finance
document access, supplier self-service, or channel self-service surface must be
gated by the auth/access-control and audit-log work for workflow-scoped access;
this strategy only says those flows should not create new raw Actor types.

## 4. Target Module Map

The target architecture should use fewer, deeper Modules. Domain Modules should
own a real capability with durable records, behavior, routes, and tests.
Surface/runtime Modules such as `admin` and `storefront` own shell integration
and extension Interfaces, not domain records.

| Target Module | Owns | Does not own |
| --- | --- | --- |
| `catalog` | Catalog Item projection/search plane, provenance, overlays, content cache, source freshness, booking snapshot capture, search/indexer contracts | owned product authoring, vertical operational truth, quote-time price formation, checkout, finance documents |
| `inventory` | optional operated-inventory authoring: Product structure, Product Versions, product-internal components, owned inventory publication lifecycle, and future operated-inventory subdomains | sourced catalog projection/search, generic catalog overlays, OTA/reseller default installs, checkout, finance documents |
| `commerce` | commercial decision orchestration for Catalog Items: markets, pricing rules, quote-time FX, promotions, sellability decisions, buyer/channel/audience rules, and commercial snapshots | vertical-native live fare/offer engines, invoices, payments, operated availability/resource truth, catalog indexing |
| `relationships` | Person, Organization, relationship/account records, customer profile context, segments, signals, support activities, proposal-linked activity references | auth/session identity, Proposal / Proposal Version records and state transitions, bookings, finance ledger state |
| `proposals` | Proposal, Proposal Version, proposal lifecycle, B2B proposal pipeline, send/view/accept decisions, accept-to-reserve handoff | Person/Organization master records, Trip Envelope editing internals, legacy transactions Offer/Order records, final financial documents, operational fulfillment |
| `trips` | Trip Envelope draft workspace, component ordering, manual placeholders, catalog-backed component references, traveler party, pricing snapshots, reservation plans, and checkout handoff handles | catalog projection/search, Proposal / Proposal Version records and send/view/accept state, legacy transactions Offer/Order records, final bookings/payments, active reservation orchestration |
| `bookings` | booking sessions, reservation orchestration, booking requirements, travelers, booking items, allocations as commitment records, fulfillment/redemption, customer-safe booking state | slot/resource truth, price-rule authoring |
| `operations` | operated execution: availability, resources, allocation resources, places, ground logistics, guides, vehicles, Room Resource Holds, and Space Resource Holds | sourced catalog discovery, invoices/payments, Proposal / Proposal Version records and state transitions |
| `mice` | MICE Program lifecycle, program requirements, agenda/sessions, delegate/attendee roster, rooming manifest, RFP/bid workflow, Program Room Blocks, Program Space Blocks, program-level status, and links to bookings, proposals, contracts, and invoices | low-level availability/resource/space truth, Room Resource Hold / Space Resource Hold execution, Proposal / Proposal Version lifecycle, booking commitment records, invoices/payments/ledger state, supplier/channel identity |
| `finance` | checkout collection orchestration, payment sessions, payment schedules, invoices, credit notes, tax persistence, supplier invoices, Travel Credits, settlement, profitability | quote-time price-rule selection, catalog content |
| `distribution` | supplier-side and channel-side commercial network: suppliers, channels, source/operator links, external refs, mappings, allotments, channel push, webhooks, reconciliation, and supplier/channel identity links | internal price formation and finance ledger state |
| `legal` | contracts, terms, signatures, templates, legal documents | proposal composition, payments |
| `admin` | packaged staff shell and extension surfaces | domain records |
| `storefront` | public and authenticated customer-facing runtime contracts, booking/checkout/account surfaces, and shell integration | admin CRUD, internal service records, domain records |

Target names in this map are the proposed v1 strategy. A later ADR may change
spelling or reject a recommendation, especially where this document explicitly
calls out unresolved Interface proof.

### 4.1 Install Posture

This document uses a stricter test than "does more than one product mode use
it?" A Module stays independently installable when a real deployment mode can
run without it and the Module still has durable behavior behind its Interface.
A package seam is fictional when most deployments install it with its neighbors
and deleting it only moves the same decisions into every caller.

| Posture | Modules | Rule |
| --- | --- | --- |
| Retail commerce spine | `catalog`, `commerce`, `bookings`, `finance`, `distribution`, plus `storefront` / `admin` surfaces where the product assembly needs them | This is a target posture, not the current package closure. A reseller/OTA can omit operated Inventory only after the retail-spine closure gate in §8 passes. |
| Mode-gated domain Modules | `inventory`, `operations`, `relationships`, `proposals`, `trips`, `legal`, `mice` | Installed only when the implementation mode needs their durable behavior: owned authoring, local execution, account/support depth, bespoke proposal pursuit, composition workspace, contracts/signatures, or group-business Programs. |
| Vertical/source Modules | `cruises`, `charters`, `flights`, accommodation resale, source adapters, provider plugins | Kept separate when pricing topology, booking semantics, source contracts, or operational behavior differ enough to justify their own Interface. |
| Infrastructure Modules | `core`, `db`, `hono`, `auth`, `identity`, `workflows`, `storage`, `notifications`, `action-ledger`, shared React/UI/type/build packages | Installed as required by runtime wiring, not by travel-domain mode. |

### 4.2 Interface Depth Requirements

Consolidation is only worthwhile if the target Module exposes a narrower
Interface than the package cluster it replaces. Subpaths such as
`@voyant-travel/commerce/pricing` or `@voyant-travel/operations/resources` are internal
organization by default. They should become public v1 Interfaces only when they
are deliberate extension seams with at least two real adapters or consumers.

Keystone Interface sketches before broad moves:

| Module | Proposed narrow Interface | Must hide |
| --- | --- | --- |
| `commerce` | `evaluateCommercialDecision(input): CommercialDecision` for "can this buyer/channel buy this Catalog Item or vertical item, for this date, pax, market, channel, and currency, and at what price?" | direct Pricing + Markets + Sellability + Promotions choreography, direct Product/Inventory dependency for sourced/vertical items, and vertical-native fare/offer internals |
| `operations` | `checkOperationalAvailability`, `createResourceHold`, `confirmResourceHold`, and `releaseResourceHold` over resources, places, vehicles, guides, Room Resource Holds, and Space Resource Holds | separate availability/resources/ground/facilities choreography |
| `distribution` | `resolveCounterparty`, `linkExternalReference`, `routeCounterpartyEvent`, and `reconcileCounterpartyActivity` across Supplier and Channel roles | separate supplier/channel/external-ref plumbing and adapter reference mapping |

If implementation preserves the old subpackage choreography as public v1 API,
the move has failed the depth test and should remain a package rename rather
than an accepted architecture decision.

The v1 public package surface must not preserve old choreography subpaths as
default API. Each subpath must either be an explicitly justified extension seam
with its own Interface test or remain internal source organization only.

Proposal lifecycle ownership is singular: `proposals` owns Proposal and Proposal Version
records, pipeline/stage movement, send/view/accept decisions, accepted-version
state, and accept-to-reserve handoff. Other Modules may reference proposal ids,
display proposal-linked activity, freeze/read composer snapshots, or react to proposal
events, but they should not mutate proposal lifecycle state except through the
Proposals Interface.

Distribution ownership is consolidated, but Supplier and Channel vocabulary stay
distinct. A Supplier is a delivery, procurement, or source-side counterparty. A
Channel is a resale or outbound distribution counterparty. They share enough
external identity, reference mapping, adapter, webhook, allotment, and
reconciliation machinery to belong behind one Distribution Interface, but they
should not collapse into one role or table shape. In this strategy,
Distribution means the broader supplier-side and channel-side commercial network,
not only outbound resale distribution.

MICE ownership is optional and program-centric. The `mice` Module owns the
Program as the umbrella group engagement and the records that are only coherent
at Program scope: requirements, RFPs, bids, agenda sessions, delegates, rooming
manifests, and program status. It coordinates with other Modules instead of
absorbing them: Proposals owns proposal lifecycle, Operations owns resource and
block execution truth, Bookings owns commitments, Finance owns documents and
ledger state, Distribution owns suppliers/channels/external refs, Relationships
owns Person/Organization records, and Legal owns contracts.

### 4.3 Extras Ownership

`extras` stays the domain term, but it is no longer a standalone runtime Module
target.

Ownership rule:

- `@voyant-travel/inventory/extras` owns operated add-on authoring/configuration:
  `product_extras`, `option_extra_configs`, authoring validation, catalog
  policy/projection helpers, sourced-content cache helpers, and schema-doc /
  reindex participation for product-attached add-ons.
- `@voyant-travel/bookings/extras` owns booking-time extra behavior:
  `booking_extras`, `extra_participant_selections`, booking extra line schemas,
  customer-safe booked state, and the slot extras manifest routes/services.
- Slot extras manifests are Bookings-owned in the current code because they
  display and mutate traveler selections against bookings, booking items, and
  booking allocations. They do not currently create availability/resource
  execution truth or holds. If an extra later changes resource capacity or
  operational fulfillment truth, that execution state belongs behind the
  Operations/Availability Interface and Bookings should read it rather than own
  it.
- Product booking-engine add-on catalog loading remains an injected boundary:
  Products accepts an add-on catalog loader, while templates load booking-facing
  extra data through `@voyant-travel/bookings/extras`. This keeps Products from
  depending on operated Inventory authoring and lets retail/OTA bundles use
  Catalog Item snapshots plus Bookings without installing Inventory.
- `@voyant-travel/extras-contracts` remains separate under ADR-0002 because
  `extras/v1` rich content is a real zod-only external payload seam for source
  adapters. Runtime consolidation does not collapse that contract package.

The old `@voyant-travel/extras` and `@voyant-travel/extras-react` package names are not
part of the v1 workspace surface. The physical Drizzle tables are owner-split
between Inventory and Bookings; template schema manifests and first-party
runtime imports use owner packages directly.

## 5. Concrete Consolidation Candidates

### 5.1 Commerce

Candidate packages:

- `@voyant-travel/pricing`
- `@voyant-travel/pricing-react`
- `@voyant-travel/markets`
- `@voyant-travel/markets-react`
- `@voyant-travel/sellability`
- `@voyant-travel/sellability-react`
- `@voyant-travel/promotions`
- `@voyant-travel/promotions-react`

Problem:

Pricing, markets, and sellability are one quote-time commercial workflow split
across multiple install seams. `sellability` already imports pricing, markets,
availability, products, distribution, and transactions to answer one question:
can this buyer buy this product for this date, pax, market, channel, and
currency?

Solution:

Create `@voyant-travel/commerce` and `@voyant-travel/commerce-react` with internal source
folders such as:

- `src/pricing`
- `src/markets`
- `src/sellability`
- `src/promotions`
- `src/fx`

The public Commerce Interface should be narrower than those subpaths. The
primary Interface is the commercial decision: given buyer/channel/audience
context, Catalog Item or vertical item reference, date/time, party, market, and
currency, answer whether the item is buyable and return the resolved commercial
snapshot. Commerce orchestrates market, pricing-rule, sellability, promotion,
FX, and policy decisions; it does not become a universal fare engine for every
vertical/source adapter. Flights, cruises, charters, and sourced adapters can
keep native live-offer or fare topology behind price-availability adapters that
Commerce calls.

For the React/admin migration, `@voyant-travel/commerce-react` is the target owner
package. The old split commercial React package names are not part of the v1
workspace surface.

Finance consumes the selected commercial snapshot later; it does not own
price-rule selection.

Interface semantics:

- `evaluateCommercialDecision(input)` should be side-effect-free by default: it
  evaluates buyability, price, market, FX, promotion, and policy facts and
  returns a `CommercialDecision`.
- Persisted audit evidence should use an explicit call such as
  `recordCommercialSnapshot(decision, target)` or a caller-owned write path.
- The returned decision must include traceability: buyable/unbuyable reason,
  rule ids, market, promotion ids, adapter calls, source handles, validity, and
  the calculation inputs needed to explain the result.
- Adapter output is part of the decision trace, not Commerce-internal schema.
  Catalog/vertical/source adapters can return live quote or offer handles, but
  Commerce should not import their native fare tables directly.
- Idempotency belongs at the decision/snapshot seam: callers should be able to
  supply an idempotency key or target ref so replaying a decision does not mint
  conflicting commercial evidence.
- Optional Modules, including operated Inventory, register price-availability
  adapters with Commerce at boot. Commerce should treat Inventory the same way
  it treats a sourced vertical adapter, not as a hard schema dependency.

Prerequisite cleanup:

- Stop constructing `transactions` Offers from sellability.
- Feed catalog price/availability responses, Proposal Versions, booking drafts, or
  trips price snapshots instead.
- Decouple offer-oriented sellability state before moving the package seam.
- Make `sellability_policies` real by evaluating them, or remove/defer them.
- Keep snapshots only if they provide audit evidence for what was buyable and
  priced at decision time.
- Blocker for OTA/reseller optionality: Commerce must depend on Catalog Item
  references, vertical price-availability adapters, and optional Inventory
  adapters instead of directly requiring operated Inventory schemas.
- Do not expose `pricing`, `markets`, `sellability`, `promotions`, and `fx`
  as package exports for the normal public choreography. Public subpaths are
  allowed only for deliberate extension Interfaces.
- Remove `@voyant-travel/commerce/sellability/service-construct-offer`,
  `SellabilityOfferWriter`, and `POST /construct-offer` from the v1 public
  surface. Sellability stops at commercial resolution and persisted decision
  snapshots; Proposal Versions, booking drafts, or Trips snapshots own
  downstream materialization.
- Invert the current `promotions` -> `storefront` edge before Commerce lands.
  Storefront should consume Commerce display contracts/events; Commerce should
  not import Storefront or the merged Module creates a `commerce` <-> `storefront`
  cycle.

### 5.2 Operations

Candidate packages:

- `@voyant-travel/availability`
- `@voyant-travel/availability-react`, including `@voyant-travel/availability-react/allocation`
- retired beta `@voyant-travel/allocation-ui`
- `@voyant-travel/resources`
- `@voyant-travel/resources-react`
- `@voyant-travel/ground`
- `@voyant-travel/ground-react`
- `@voyant-travel/facilities`
- `@voyant-travel/facilities-react`
- `@voyant-travel/places`
- `@voyant-travel/places-react`
- future room-block / space-block execution slices

MICE Program coordination belongs to the optional `mice` Module. Operations
owns the resource, availability, and block execution truth that Programs
coordinate.

Problem:

Tour operators, DMCs, and MICE teams use operated execution as one
workflow: capacity, places, resources, vehicles, guides, dispatch, room blocks,
space blocks, and allocation. Separate packages make internal nouns look like
product-level installation choices.

Solution:

Create `@voyant-travel/operations` and `@voyant-travel/operations-react` with subpaths for
availability, allocation resources, resources, places, and ground.

Current implementation state:

- `@voyant-travel/operations/availability`, `@voyant-travel/operations/resources`,
  `@voyant-travel/operations/ground`, and `@voyant-travel/operations/places` own the
  runtime source.
- `@voyant-travel/operations-react/availability`,
  `@voyant-travel/operations-react/availability/allocation`,
  `@voyant-travel/operations-react/resources`,
  `@voyant-travel/operations-react/ground`, and
  `@voyant-travel/operations-react/places` own the React source.
- The old package names are removed from the v1 workspace surface.
- Operator runtime/admin imports and schema manifests use Operations owner
  paths.

Required cleanup:

- Canonicalize on `Place` and Operations-owned place surfaces. Keep
  `facilityId` only as a table-era field where existing schemas require it.
- Reframe `facilities` as shared places, not property operations.
- Keep hotel/property operations out of first-party scope.
- Keep shared place records in scope: meeting points, pickup/dropoff places,
  airports, stations, ports, attractions, restaurants, supplier bases, venues,
  and accommodation locations.
- Treat current `properties`, `property_groups`, and
  `property_group_members` as deprecated accommodation-resale compatibility
  records. They should move to an accommodation resale owner or be removed
  before v1 if they imply PMS/property operations.
- Remove cross-package FK constraints into old Facilities/Places tables; use
  loose ids and starter-level links where a deployment wants stronger wiring.
- Expose Room Resource Hold and Space Resource Hold execution through Operations
  Interfaces so MICE can coordinate Program-level blocks without owning
  low-level availability or resource truth.
- Keep availability truth separate from booking commitment records.

### 5.3 Relationships And Proposals

Candidate packages:

- `@voyant-travel/relationships`
- `@voyant-travel/proposals`
- `@voyant-travel/relationships-react`
- `@voyant-travel/proposals-react`

Adjacent packages to integrate through an explicit Interface, not fold blindly:

- `@voyant-travel/trips`
- `@voyant-travel/trips-react`

Adjacent legacy packages to decouple and retire through a dedicated ADR:

- `@voyant-travel/transactions`
- `@voyant-travel/transactions-react`

Problem:

`crm` currently contains multiple concerns:

- relationship/account records: Person, Organization, relationships, segments,
  profile context, customer signals, and activities
- proposal pursuit records: Pipeline, Stage, Proposal, Proposal Version
- admin/runtime surfaces for both

Those are domain concerns, not core platform concerns. `core` currently owns
structural primitives such as Module, Extension, Plugin, Link, EventBus,
container, Actor type, query, hooks, and workflow descriptors. Merging CRM into
`core` would force every Voyant installation to carry CRM schemas, routes,
identity dependencies, action-ledger dependencies, and relationship/proposal vocabulary. It
would also create pressure to pull `db`, `hono`, and `identity` into the package
that everything else depends on.

ADR-0018 decides that Proposal is the travel-native sales artifact, while the
repo still contains overlapping Opportunity, CRM Proposal, transactions Offer, and
Trip Envelope concepts.

Solution:

Do not merge CRM into `core`. Keep `core` as the platform kernel.

Instead, split or deepen the current CRM package along two target domain seams:

- a Relationships Module for Person, Organization, relationship/account
  records, profile context, segments, signals, and activities
- a Proposals Module for Proposal as the tracked sales pursuit, Proposal Version as the
  immutable proposal revision or alternative, references to frozen Trip Envelope
  snapshots, accept-to-reserve handoff, B2B buyer context, and RFP-style work
  where needed

Proposals should own the pursuit and proposal lifecycle. It should not own
Person/Organization master records, the whole composer workspace, or
`transactions` Offer.

Target a real split, not a permanent combined CRM Module. Because Voyant is
still beta, this can be a breaking v1 package move: Relationships and Proposals
own their respective runtime and React surfaces. Temporary facades were allowed
only inside the migration branch to keep intermediate commits verifiable; they
must not ship as public v1 API.

Prerequisite cleanup:

- Continue retiring Opportunity vocabulary.
- Target `relationships` for the non-proposal Module name.
- Split Relationships first, then Proposals inside the v1 migration branch. Proposals
  currently reference Person and Organization records; moving schema ownership
  must either preserve those tables in the same package until the split lands or
  convert cross-domain references to schema-discipline-compliant links/plain ids.
- Move React consumers in slices: person/organization pickers and profile UI to
  Relationships React, Proposal boards and proposal UI to Proposals React.
- Treat `transactions` Offer as adjacent legacy, not a Proposals
  consolidation candidate.
- Decouple Proposals from `transactions` Offer first, then retire the runtime
  `transactions` packages per ADR-0005.
- Do not introduce another generic Offer concept.

### 5.4 Transactions Retirement

Candidate packages:

- `@voyant-travel/transactions`
- `@voyant-travel/transactions-react`

Problem:

`transactions` was built as a generic commercial ladder between sellability and
bookings: Offer, Order, travelers/participants, items, contact assignments,
staff assignments, order terms, PII audit, and a booking extension linking
Bookings back to offer/order ids.

ADR-0018 changed the most important part of that ladder: bespoke travel
proposals are now Proposal and Proposal Version, not Transactions Offer. At the same
time, the catalog booking engine already proves that a generic orders table is
not required for cross-vertical booking flows: it writes short-lived pricing
Quote records named `catalog_quotes`, reserves through adapters or
owned handlers, captures `booking_catalog_snapshot`, and exposes its read-side
"orders" from snapshots.

The deletion test says `transactions` is no longer deep enough as a Module. If
deleted, its useful behavior reappears in existing deeper Modules:

- proposal lifecycle belongs in Proposals and Proposal Versions
- quote-time commercial snapshots belong in Commerce and Trips
- promotional offers belong in Commerce/Promotions
- booking commitments, travelers, items, allocations, fulfillment, and
  booking-origin/provenance belong in Bookings
- invoices, payment sessions, schedules, guarantees, settlement, and
  profitability belong in Finance
- legal terms, policy acceptance, contracts, and signatures belong in Legal
- Person/Organization/contact truth belongs in Relationships
- provider/source order ids belong in vertical adapters, Catalog snapshots, or
  Distribution external refs

Keeping a renamed `orders` or `commitments` Module would mostly preserve the
same shallow pass-through seam under a less confusing name. It would also force
Bookings, Finance, Legal, Proposals, Trips, and source adapters to keep
coordinating through a generic record even when their local records already
carry the durable truth.

Solution:

ADR-0005 retires the `transactions` runtime packages before v1. Do not rename
`transactions` to `orders` or `commitments` as a target Module.

ADR-0005 answers the hard replacement question: the generic commercial
commitment role currently played by Transactions Order is replaced by Booking
origin/provenance for durable commitment context, Finance and Legal generic
target links for documents/terms/collection, Trip Component committed refs for
composed-line handles, and vertical/source provider order refs captured in
Catalog or vertical snapshots.

Move the current responsibilities as follows:

- Transactions Offer creation from sellability moves to Commerce outputs:
  catalog price/availability responses, sellability snapshots, Proposal Versions,
  booking drafts, or Trips price snapshots.
- Bespoke proposal state moves to Proposals and Proposal Versions.
- Trip composition and reservation planning stays in Trips; active
  reservation orchestration belongs in Bookings so direct B2C storefront and
  accepted Proposal Version flows use the same reservation path.
- Order-like commitment references become either Booking-owned origin/provenance
  records, Trip Component commitment refs, or vertical/source-specific order ids
  captured in Catalog snapshots.
- `booking_transaction_details` is replaced by a Bookings-owned origin table or
  fields that can reference Proposal Version, Trip snapshot, Catalog quote/snapshot,
  provider order ref, and any legacy migrated transaction ids.
- `order_terms` move to Legal policy acceptance / contract terms, with payment
  terms modeled in Finance where they affect collection.
- Transaction contact/staff assignment snapshots move to Relationships,
  Bookings, Proposals, or Trips depending on lifecycle.
- Transaction PII access logging is replaced by the existing Booking/Proposal PII
  and action-ledger patterns.
- Storefront promotional-offer metadata moves to Commerce/Promotions.
- Future OCTO and other external channel projections read Bookings, booking
  origin/provenance, Catalog snapshots, and vertical/source refs instead of joining
  `transactions.offers` / `transactions.orders`.

Compatibility policy:

- Temporary runtime facades may exist only inside intermediate migration commits
  to keep those commits verifiable.
- No public v1 package should expose `@voyant-travel/transactions` or
  `@voyant-travel/transactions-react` unless a later ADR explicitly reverses
  this retirement plan.
- No public v1 package should expose `@voyant-travel/transactions-contracts`.
  Any useful validation schemas from the retired generic Offer/Order ladder must
  move to the owning package: Proposals, Bookings, Commerce, Finance, Legal,
  Trips, Storefront, or Distribution.

Required cleanup:

- Remove the `@voyant-travel/transactions` dependency from Sellability before
  Commerce consolidation.
- Remove `transactionsApiModule` and `transactionsBookingExtension` from
  template composition after Bookings owns origin/provenance.
- Replace Legal/Finance `orderId` and `offerId` references with Booking, Proposal
  Version, Program, Trip Component, provider order ref, or generic target links
  as appropriate.
- Update `UBIQUITOUS_LANGUAGE.md` to match ADR-0005 so canonical Order/Offer
  language is legacy/provider-scoped rather than first-party v1 Module
  language.

ADR acceptance checklist:

- No non-legacy runtime package imports `@voyant-travel/transactions` or
  `@voyant-travel/transactions-react`.
- Default templates no longer mount `transactionsApiModule`,
  `transactionsBookingExtension`, or transactions link tables.
- Sellability no longer constructs or persists Transactions Offers.
- `booking_transaction_details` is replaced by Bookings-owned
  origin/provenance records or fields.
- Legal policy acceptances and contracts no longer expose generic
  `transactions.offerId` / `transactions.orderId` fields in public v1 contracts;
  they point to Booking, Proposal Version, Program, provider order ref, or a
  generic target shape as appropriate.
- Finance payment authorization and collection surfaces no longer expose
  generic `transactions.orderId` public v1 fields except in explicitly legacy
  compatibility contracts.
- Public v1 contract fields named `offerId` / `orderId` are either
  source/vertical provider identifiers, not Transactions ids, or explicitly
  marked legacy.
- The ADR explicitly decides whether canonical `Order` remains in
  `UBIQUITOUS_LANGUAGE.md`, is narrowed to provider/source order refs, or is
  retired from first-party public Interfaces.
- Generated schema manifests and package-closure checks for default templates
  have no runtime Transactions dependency.
- Old transactions route/unit/integration tests are either ported to the owning
  Modules' Interface tests or removed with documented coverage replacement.

### 5.5 Trips / Proposal Workspace

Candidate packages:

- `@voyant-travel/trips`
- `@voyant-travel/trips-react`

Problem:

The composer is related to Catalog because it searches and references Catalog
Items, but it is not the Catalog Module. Catalog is the projection/search/
overlay/snapshot plane. The composer owns a live Trip Envelope workspace that
can mix catalog-backed components, manual placeholders, flight placeholders,
external order refs, pricing snapshots, reserve state, and checkout handles.

The composer is also related to Proposals because a Proposal Version freezes the result
of that workspace. But the workspace and the proposal pursuit are different
concerns: staff or automation may compose, reprice, and reserve before or after a
Proposal Version exists.

Renaming Trips to `offers` would make the vocabulary worse. ADR-0018
preserves `transactions` Offer as a separate primitive, and vertical/source
packages already use offer nouns for live supplier responses such as flight
offers. The composer output should become a Proposal Version snapshot, booking
draft, reservation, or checkout flow, not another generic Offer.

Solution:

The public package names are `@voyant-travel/trips` and
`@voyant-travel/trips-react`. Keep the composer as a distinct standalone
workspace Module, not a `proposals` subpath. `trips` is precise because the
Module owns the Trip Envelope workspace, and it avoids the vocabulary collision
that `offers` would create. Let Proposals reference frozen composer snapshots
through a narrow Interface; let Catalog provide source/search/price-availability
Interfaces; let Bookings and Finance own final commitment and collection
records.

Required cleanup:

- Keep `catalogQuoteId` for the canonical catalog pricing Quote reference; do
  not reuse it for accepted Proposal Version provenance.
- Make the composer Interface explicit: create, revise, price, freeze proposal
  snapshot, reserve, start checkout.
- Keep manual and dynamic composition in the same workspace if they converge on
  the same Trip Envelope semantics.
- Remove any old `travel-composer` public package names before v1. Temporary
  aliases are acceptable only inside intermediate migration commits if they keep
  those commits verifiable.

Proposal-to-reserve trace:

1. Proposals records that a Proposal Version was accepted. It owns the accepted-version
   state and closes the Proposal won.
2. Proposals calls the Trips Interface with the accepted Proposal Version's
   frozen Trip snapshot reference. Proposals does not reserve inventory directly.
3. Trips asks Commerce to re-evaluate each priced line through the
   Commerce Interface. Commerce returns commercial snapshots and provider or
   adapter quote handles where applicable.
4. Trips submits a reservation plan to the Bookings Interface. Bookings
   owns active reservation orchestration for both direct B2C storefront flows
   and accepted Proposal Version / Trip Envelope flows. Catalog-backed sourced lines
   reserve through Catalog/vertical adapters; operated lines reserve through
   Bookings and Operations Interfaces; manual placeholders enter staff
   confirmation workflow.
5. Bookings owns the durable commitment records: booking origin/provenance,
   booking session or booking items, traveler records, fulfillment state, and
   customer-safe booking status. Trips may keep reservation-plan refs and
   component refs, but not final booking truth.
6. Finance starts collection against Booking, Invoice, Payment Session,
   Schedule, or Guarantee targets. It does not require a generic Transactions
   Order.
7. Legal attaches policy acceptances, contracts, or terms to Booking, Proposal
   Version, Program, provider order ref, or generic target links according to the
   accepted ADR.

Rule for order-like refs: use Booking origin/provenance for the overall
accepted source, Trip Component committed refs for per-component provider
handles, and Catalog/vertical snapshots for source-specific order ids. Do not
recreate a generic Order record.

The accepted Proposal Version reservation proof is captured in
[`accepted-proposal-version-reservation-golden-flow.md`](./accepted-proposal-version-reservation-golden-flow.md).

### 5.6 Bookings

Candidate packages:

- `@voyant-travel/bookings`
- `@voyant-travel/bookings-react`
- `@voyant-travel/booking-requirements`
- `@voyant-travel/booking-requirements-react`
- booking session and journey surfaces currently split across catalog/storefront
  glue

Problem:

Booking requirements are not a separate product decision; they describe what
must be collected to commit a booking. Booking sessions, traveler records,
booking items, requirements, fulfillment, and redemption need one consistent
Interface.

Solution:

Fold requirements and booking journey/session primitives into the Bookings
Module. Bookings should own the unified reservation orchestrator used by direct
B2C checkout, accepted Proposal Versions, and Trip Envelope reservation plans. Keep
Operations-owned resource and availability truth separate.

Required cleanup:

- Keep booking requirements decoupled from operated Inventory. Otherwise the
  move makes Bookings depend on operated Inventory and breaks the retail-spine
  optionality goal.

Implementation note (2026-06): booking requirements now live under the
Bookings package family as `@voyant-travel/bookings/requirements*` and
`@voyant-travel/bookings-react/requirements*`. The standalone beta package names are
removed from the v1 workspace surface. Root `@voyant-travel/bookings` does not
hard-depend on operated Products/Inventory for public transport requirement
summaries; hosts that want product existence, booking mode, and capability
lookup inject a requirements-only product snapshot resolver. The operator
template injects its Inventory-backed resolver while preserving the existing
`/v1/booking-requirements/*` and
`/v1/public/booking-requirements/*` route paths.

### 5.7 Finance

Candidate packages:

- `@voyant-travel/finance`
- `@voyant-travel/finance-react`
- retired `@voyant-travel/checkout`
- retired `@voyant-travel/checkout-react`

Problem:

Checkout is collection orchestration against bookings, invoices, schedules, and
guarantees. It is not a standalone travel-domain concept.

Solution:

Fold checkout into finance as the collection/session subdomain. Keep public
checkout contracts explicit and customer-safe. Implementation status: the
standalone checkout packages have been removed from the v1 branch; Finance owns
the checkout services/routes and Finance React owns the payment hooks/UI.

Required cleanup:

- Keep notification dispatch injected through Finance checkout route options.
  Finance should not import Notifications directly.
- Keep checkout consumers such as payment plugins, `storefront-sdk`, and
  template payment routes on Finance collection/payment-session Interfaces.
- Remove direct Product and operated Availability dependencies from Finance
  where they are only used to derive payment context; use Booking, Invoice,
  Schedule, Guarantee, Catalog snapshot, or CommercialDecision refs instead.

### 5.8 Distribution

Candidate packages:

- `@voyant-travel/distribution`
- `@voyant-travel/distribution-react`
- `@voyant-travel/suppliers`
- `@voyant-travel/suppliers-react`
- `@voyant-travel/external-refs`
- `@voyant-travel/external-refs-react`

Problem:

Supplier and Channel are distinct domain roles, but the package split makes
shared external counterparty plumbing look like separate product Modules.
Distribution already needs suppliers, sourced inventory links, channel mappings,
allotments, push/reconciliation, webhooks, and external references to operate as
one workflow.

Solution:

Fold supplier runtime and external reference runtime into Distribution in the v1
package move. The old supplier and external-ref package names are removed from
the v1 workspace surface. Keep Supplier and Channel distinct inside the
Distribution domain: Supplier is
procurement/source/delivery-side, while Channel is outbound resale or
distribution-side. The shared Module should own external identity, mappings,
source/operator links, adapter-facing references, channel push, allotments, and
reconciliation.

The name `distribution` only works if Voyant defines it as the broader
commercial network Module, not just the outbound sales-channel Module. Current
`suppliers` scope includes procurement-side services, rates, availability,
contracts, payment terms, and facility links. Those concerns should be split by
durable owner during the move: supplier identity, services, source links,
external references, and counterparty mappings belong in Distribution; supplier
invoices, settlement, and ledger state belong in Finance; legal contract
documents and signatures belong in Legal; facility/place references move through
Operations or plain links according to schema discipline.

If the broader definition remains confusing in review, rename the target Module
to `counterparties` or `commercial-network` instead of forcing supplier-side
procurement language into an outbound-only Distribution meaning.

Required cleanup:

- Keep `@voyant-travel/suppliers-contracts` separate unless ADR-0002 changes.
- Move schema/template manifest ownership only through the migration contract
  below; do not strand supplier or external-ref tables behind deleted package
  names.
- Replace broad external-ref and supplier imports in first-party
  runtime/template code with Distribution React owner paths or narrow extension
  points.
- Keep supplier costing and invoices in Finance; Distribution can reference
  them but should not own ledger state.
- Update `UBIQUITOUS_LANGUAGE.md` so Distribution clearly covers supplier-side
  and channel-side commercial network concerns.

Schema migration plan:

- Move supplier identity and directory records (`suppliers`,
  `supplier_directory_projections`, contact projections, external refs, and
  source/operator links) behind Distribution.
- Move supplier service catalog records that describe counterparty capability
  (`supplier_services`, high-level service availability, adapter-facing service
  refs) behind Distribution, but keep low-level operated resource truth in
  Operations.
- Split supplier rate/cost semantics deliberately: supplier tariff/rate inputs
  used for quoting can be Distribution or Commerce inputs, but supplier invoices,
  payments, settlement, AP state, and profitability belong in Finance.
- Move supplier contract documents, signatures, terms templates, and policy
  acceptances to Legal. Distribution can retain contract metadata needed for
  routing or commercial-network rules, but not legal document truth.
- Convert facility/place references to Operations place/resource links; do not
  keep cross-package FKs to old Facilities tables.
- Replace Product-specific mappings and commission scopes with Catalog Item,
  vertical/source, or optional Inventory adapter refs so Distribution does not
  force operated Inventory into the retail spine.
- Keep channel push, channel reconciliation, channel allotments, and external ref
  mapping in Distribution, but route accounting postings and ledger effects
  through Finance Interfaces.

### 5.9 MICE / Programs

Future packages:

- `@voyant-travel/mice`
- `@voyant-travel/mice-react`

Problem:

MICE and corporate travel are not just operations. A Program starts before
execution, often as an RFP or Proposal pursuit, and continues through planning,
contracting, room/space blocks, delegate management, bookings, invoices, and
on-site fulfillment. Folding Program into Operations would make Operations own
sales/planning records that Proposals, Finance, Legal, Relationships, and Bookings
all need to reference.

Solution:

Create an optional `mice` Module for full MICE support. Name the Module after
the product mode and make Program the central entity inside it. Do not name the
Module `corporate`: corporate travel is broader than MICE, and corporate buyer
workflows should mostly be expressed through Relationships, Proposals, Finance,
Bookings, and Storefront account surfaces. A Program is the umbrella group
engagement, such as a corporate meeting, incentive trip, conference, exhibition,
or complex group travel event.

The `mice` Module should own:

- Program records: buyer organization, primary contacts, dates, destination,
  status, budget, owner, and high-level lifecycle.
- Program Requirements: demand such as rooms, function spaces, catering, AV,
  transfers, sessions, staffing, and accessibility needs.
- RFP and Bid workflow: supplier invitations, bid lines, comparison, scoring,
  award decisions, and handoff to Legal, Distribution, Operations, and Finance.
- Agenda / Sessions: timed program activities, tracks, capacity, space
  references, inclusions, and session enrollment.
- Delegates / Attendees: roster, role, status, arrival/departure context,
  session enrollment, badge/check-in state, and links to Person/Traveler records.
- Rooming manifest: rooming assignments and sharing groups at Program scope,
  linked to Bookings and room blocks where applicable.
- Program-level orchestration: status rollups, milestone tracking, run sheets,
  program P&L views, and links to Proposal Versions, bookings, contracts, invoices,
  suppliers, and operational blocks.

MICE passes the deletion test only if Program owns real behavior, not merely a
join table over other Modules. The first implementation slice must include at
least one durable Program behavior such as RFP/bid scoring and award workflow,
rooming-manifest conflict detection and assignment rules, agenda/session
capacity enrollment, delegate lifecycle/check-in, or Program P&L/status rollups.
If the implementation is only cross-module links plus a status field, keep it as
template/application composition until the deeper Program behavior exists.

The `mice` Module should not own:

- Person/Organization master data; that belongs to Relationships.
- Proposal and Proposal Version lifecycle; that belongs to Proposals.
- Low-level resource, availability, guide, vehicle, room, or function-space
  truth; that belongs to Operations.
- Booking commitments, traveler fulfillment, or redemption; those belong to
  Bookings.
- Invoices, payment schedules, payments, tax, supplier invoices, settlement, or
  ledger state; those belong to Finance.
- Supplier/channel identity, mappings, and external refs; those belong to
  Distribution.
- Contract documents, signatures, and terms templates; those belong to Legal.

Required cleanup:

- Treat the existing MICE RFC as the product-mode design input, but align table
  ownership with the target Module map before implementation.
- Use `mice` as the package name while Program remains the central entity.
  Keep `corporate` as a bundle/persona label, not a Module name. Use `programs`
  only if Program becomes a broader non-MICE concept.
- Use Program Room Block and Program Space Block for MICE demand, assignments,
  and rollups. Keep Room Resource Hold and Space Resource Hold execution behind
  Operations Interfaces.
- Keep delegate self-service inside Storefront surfaces; MICE owns delegate
  records and workflow, not the public runtime shell.
- Keep Program, Delegate, Program Room Block, Program Space Block, Room Resource
  Hold, Space Resource Hold, RFP, and Bid aligned with
  `UBIQUITOUS_LANGUAGE.md` as implementation details sharpen.

### 5.10 Catalog And Inventory

Candidate packages:

- `@voyant-travel/catalog`
- `@voyant-travel/catalog-react`
- `@voyant-travel/catalog-authoring`
- `@voyant-travel/products`
- `@voyant-travel/products-react`
- `@voyant-travel/extras`
- `@voyant-travel/extras-react`
- vertical runtime packages where their differences are real

Problem:

Products are operated inventory, but "product" is overloaded across catalog,
commerce, storefront, and vertical packages. Catalog is the cross-vertical
projection, search, overlay, and snapshot plane. Many implementations need both,
and the current naming can make Products look like the whole catalog or Catalog
look like the owner of inventory authoring.

Solution:

Keep the catalog architecture decision: Catalog Item is a projection/contract
shape, not a root table, and Catalog is not a vertical Module. Move owned
product authoring toward an optional `inventory` Module, with current
`products` surfaces becoming Inventory subpaths/packages in the v1 move. Do not
overload `catalog` or keep `products` as the long-term public Module name.
The first implementation slice creates `@voyant-travel/inventory` and
`@voyant-travel/inventory-react` as operated authoring entrypoints over the existing
implementation; the remaining physical file/table move is tracked as follow-up
work behind the documented Inventory Interface.
During that transition, template runtime manifests and hand-written UI imports
should move to `inventory` / `inventory-react` owner paths, while
`voyant.config.ts` schema entries may stay on `products` until generated schema
parity proves an explicit schema move.

`inventory` must remain an optional operated-inventory Module, not a default
dependency of Catalog or reseller/OTA starter bundles. OTA/reseller deployments
should be able to install Catalog, Commerce, Bookings, Finance, Distribution, and
Storefront without carrying product-authoring routes, schemas, or staff UI.
They should opt into Inventory only when they own or operate inventory.

The name `inventory` is risky because travel systems also use "inventory" for
availability, allotments, sourced inventory, and resource capacity. If the v1
package name stays `@voyant-travel/inventory`, public docs should consistently call
the domain "operated Inventory authoring" and avoid using unqualified Inventory
for Operations availability/resource truth, Distribution allotments, or sourced
Catalog inventory.

`catalog-authoring` is classified as operated-inventory authoring for the current
compose/duplicate product-graph implementation. That implementation should live
behind `@voyant-travel/inventory/authoring`. Keep or recreate a narrow Catalog
merchandising surface only for real
Catalog overlay/source-governance authoring: editorial overlays, source
governance, freshness controls, search projection metadata, and index
governance. That surface may be named `catalog-merchandising`,
`catalog-overlays`, or a narrowed `catalog-authoring`, but it must stay
installable for OTA/reseller staff who curate sourced inventory without operated
Inventory. If overlay authoring is not real yet, do not keep a separate public
`catalog-authoring` name just for continuity.

Catalog AI access should also collapse into Catalog rather than survive as a
separate first-party Module. Semantic/vector retrieval, compact agent result
shapes, and hybrid keyword/semantic/BYO-vector search are Catalog search
capabilities exposed through Catalog HTTP APIs and supported Catalog Interfaces.
First-party MCP wrappers should not be a package boundary; if an application
needs MCP, it can wrap the same HTTP APIs at the app/runtime edge.

Required cleanup:

- Rename legacy `CatalogEntry` documentation wording to canonical Catalog Item
  terminology. There is no broad `CatalogEntry` public code identifier to alias;
  the existing projection contract is `CatalogProjection`, so the migration
  issue should reconcile docs, comments, and any stray `CatalogItem` identifiers
  against the actual Catalog Projection Interface instead of inventing a
  compatibility alias.
- Fold extras into the product/booking flow if they remain dependent add-ons.
- Avoid promoting non-sellable shared reference entities into Catalog Items.
- Keep sourced vertical contract packages where ADR-0002 requires them.

## 6. What Should Stay Separate

Some packages represent real seams and should not be collapsed merely to reduce
package count:

- `*-contracts` packages where ADR-0002 requires zod-only external contracts.
  Keeping the contract seam separate does not freeze legacy domain names; a
  runtime package move can still require renamed, split, or legacy-only contract
  packages.
- Provider/adapter packages such as payment, accounting, source, and channel
  adapters.
- External or sibling SDK packages such as `@voyant-travel/data-sdk`,
  `@voyant-travel/cloud-sdk`, `@voyant-travel/connect-sdk`,
  `@voyant-travel/connect-adapter`, and `@voyant-travel/connect-cruises` are out of scope
  for this workspace package topology unless they are moved into this repo.
- `core`, `db`, `hono`, `storage`, `auth`, `identity`, `workflows`, and other
  infrastructure Modules.
- Domain packages such as `crm` should not merge into `core`; if they are too
  broad, split their domain seams instead.
- `legal`, unless future evidence shows it is only a finance or proposals helper.
- Vertical runtime packages where the vertical has genuinely distinct schemas,
  live pricing topology, booking semantics, or adapter contracts.

The goal is not fewer names at any cost. The goal is deeper Modules with real
Interfaces.

## 7. Product Modes Versus Package Bundles

Voyant should ship product bundles around implementation modes while keeping the
runtime Module seams explicit.

Possible starter bundles:

| Bundle | Includes |
| --- | --- |
| `reseller` / `ota` | catalog, commerce, bookings, finance, distribution, storefront, admin; inventory only if owned inventory is sold |
| `tour-operator` | reseller bundle plus inventory, operations, and owned product authoring |
| `dmc-b2b` | relationships, proposals, commerce, operations, bookings, distribution, finance, legal, admin; storefront optional |
| `mice` / `corporate` | dmc-b2b bundle plus `mice`, Program lifecycle, room/space block coordination, delegates, rooming, agenda, RFP/bid workflows |

These bundles are distribution choices. They should not force every underlying
slice to be an installable Module.

Authenticated account, support, and profile-heavy reseller deployments should
add Relationships explicitly. Contract-heavy reseller deployments should add
Legal explicitly. The starter bundle stays lean unless those workflows are part
of the implementation mode.

Retail-spine package closure is now a normal architecture gate. The
Catalog + Commerce + Bookings + Finance + Distribution + Storefront + Admin
runtime closure must have no hard dependency on `@voyant-travel/products`,
`@voyant-travel/products-react`, operated Availability/Operations schemas,
Relationships/Proposals runtime packages, or runtime Transactions except through
deliberate optional adapters.

`pnpm verify:architecture` runs `pnpm verify:retail-spine-closure`, the pre-v1
package-closure gate introduced for
[#1791](https://github.com/voyant-travel/voyant/issues/1791). The command computes
the current manifest closure from the retail-spine package candidates, reports
hard runtime blockers with package paths and dependency edges, and keeps
optional adapter/shim exceptions as edge-specific allowlist entries.

Temporary wrapper cleanup is also a normal architecture gate.
`pnpm verify:architecture` runs `pnpm verify:v1-package-cleanup`. Normal mode
rejects retired package re-entry and unclassified old owner-path subpath exports.
The final v1 public-surface cut passes
`pnpm verify:v1-package-cleanup:strict`: no temporary package names and no
temporary owner subpath exports remain.

## 8. Migration Strategy

1. File the required migration issues before broad package moves: retail-spine
   closure, Commerce Interface proof, reservation choreography coverage, and
   schema-move issues for each affected Module.
2. Update `UBIQUITOUS_LANGUAGE.md` with implementation modes, audiences, and
   Inventory/Product wording.
3. Complete the legacy `CatalogEntry` wording cleanup and reconcile
   Catalog Item language with the existing `CatalogProjection` Interface before
   new public package Interfaces depend on those names.
4. Implement `commerce` first, because it has the clearest package-cluster
   evidence.
5. Migrate `pricing`, `markets`, `sellability`, and promotions under commerce
   subpaths/packages as a breaking v1 package move.
6. Rework sellability to feed catalog price/availability responses, booking
   drafts, Proposal Versions, or trips price snapshots instead of
   transactions Offers.
7. Create the optional `inventory` target Interface and classify
   `catalog-authoring`; then move `products` and dependent extras toward
   Inventory without adding Inventory to OTA/reseller bundles by default.
8. Implement `operations` next, starting with availability/allocation/resources
   and the facilities-to-places reframing.
9. Implement optional `mice` as the MICE/corporate group-business Module, with
   Program as its central entity and explicit Interfaces to Proposals, Operations,
   Bookings, Finance, Distribution, Relationships, and Legal.
10. Retire `@voyant-travel/transactions` and `@voyant-travel/transactions-react` as
   public v1 runtime packages per ADR-0005. Move each
   durable concern into Proposals, Commerce, Trips, Bookings, Finance,
   Legal, Relationships, Distribution, or vertical adapters as described in
   §5.4.
11. Keep standalone `@voyant-travel/trips` and
   `@voyant-travel/trips-react` as the public v1 package names; do not expose
   the composer as a `proposals` subpath and do not rename it to `offers`.
12. Fold suppliers and external-refs into distribution as the external
   counterparty/integration Module, while preserving Supplier and Channel as
   distinct roles.
13. Fold checkout into finance.
14. Fold booking requirements into bookings.
15. Apply the frontend package strategy before relying on UI package moves:
    `*-react` owns hooks, clients, providers, query keys, view-model helpers,
    and reusable module components; separate `*-ui` packages are not a target
    v1 layer; `admin` and `storefront` own shell/application composition;
    retired registry/source-installed block wording must be removed from
    architecture docs.
16. Consolidate React packages after backend Module seams settle, folding any
    historical `*-ui` package contents into the corresponding `*-react`
    package.
17. Remove old public package names before v1 unless a package has a deliberate
    adapter, contract, or external-compatibility reason to survive.
18. Update template manifests only after the new Module exports and schema
    manifests are stable.

Critical path:

- Gating: retail-spine package closure must prove sourced-only reseller bundles
  can install without operated Inventory; Commerce must lose direct
  Product/Inventory dependency; Booking Requirements must lose direct Product
  dependency before folding into Bookings; Storefront must lose hard CRM/Product
  edges; Distribution and Finance must lose direct Product/operated Availability
  edges where the target bundle omits Inventory/Operations; Sellability must stop
  constructing Transactions Offers; target Module Interface tests must exist
  before old package tests are deleted; template schema parity must be proven
  before template manifests move.
- Invert central cycles before package consolidation: Commerce must not import
  Storefront after Promotions moves, and Finance must not import Notifications
  through Checkout while Notifications imports Finance. Use events, provider
  adapters, or surface-owned subscribers instead of hard package edges.
- Frontend package ownership is gating for public package names: `-react` owns
  runtime hooks/view-models and reusable module components, while
  Admin/Storefront own shell/page composition.
- Parallel after Interfaces exist: Operations/facilities reframing,
  Distribution supplier/external-ref migration, admin/storefront package
  rationalization, and contract-package rename/legacy-contract planning.
- Deferred if time-boxed: optional MICE can wait unless v1 explicitly ships MICE
  support; no public v1 package should expose the old `travel-composer` name. Do
  not ship half-moved public packages: either finish the target move or defer
  the move behind an explicit issue.

### 8.1 Execution Tracking

The issues in this section are closed on `feature/v1-package-restructure`; the
list remains as the implementation audit trail for the package move.

Readiness gates:

- [#1791: v1 packages: add retail-spine package-closure gate](https://github.com/voyant-travel/voyant/issues/1791)
- [#1792: commerce: define CommercialDecision Interface before consolidation](https://github.com/voyant-travel/voyant/issues/1792)
- [#1793: bookings: add accepted Proposal Version to reservation golden flow](https://github.com/voyant-travel/voyant/issues/1793)

Schema and package moves:

- [#1794: commerce: move pricing, markets, sellability, and promotions under Commerce](https://github.com/voyant-travel/voyant/issues/1794)
- [#1795: inventory: move operated product authoring into optional Inventory](https://github.com/voyant-travel/voyant/issues/1795)
- [#1796: relationships/proposals: split CRM into Relationships and Proposals](https://github.com/voyant-travel/voyant/issues/1796)
- [#1797: bookings: own requirements, extras runtime, and booking origin/provenance](https://github.com/voyant-travel/voyant/issues/1797)
- [#1798: finance: fold checkout into Finance and replace transaction order refs](https://github.com/voyant-travel/voyant/issues/1798)
- [#1799: legal: replace order terms and transaction refs with target-linked legal records](https://github.com/voyant-travel/voyant/issues/1799)
- [#1800: distribution: fold suppliers and external refs into Distribution](https://github.com/voyant-travel/voyant/issues/1800)
- [#1801: operations: consolidate availability, resources, allocation, ground, and places](https://github.com/voyant-travel/voyant/issues/1801)
- [#1802: trips: rename Travel Composer and own reservation plans](https://github.com/voyant-travel/voyant/issues/1802)

Existing package-scope issues that now fit this strategy:

- [#1709: catalog: collapse AI access around HTTP APIs; remove catalog-mcp and fold catalog-rag into catalog](https://github.com/voyant-travel/voyant/issues/1709)
- [#1786: Fold allocation UI into availability-react](https://github.com/voyant-travel/voyant/issues/1786)
- [#1787: Rationalize admin package boundaries](https://github.com/voyant-travel/voyant/issues/1787)
- [#1788: Fold booking-requirements into bookings package family](https://github.com/voyant-travel/voyant/issues/1788)
- [#1789: Move extras into Inventory and Bookings; retire standalone extras packages](https://github.com/voyant-travel/voyant/issues/1789)
- [#1790: Reframe facilities as shared places/locations](https://github.com/voyant-travel/voyant/issues/1790)

Migration contract:

- Create target packages and subpath exports first; move callers only after the
  new Interface exists.
- Schema ownership stays with the original package until a specific migration
  issue or ADR moves the owning tables, Drizzle schemas, migrations, and schema
  docs.
- Retired package names, orphan wrappers, old-package runtime exports, and
  temporary subpath exports must stay listed in the v1 package cleanup gate as
  forbidden re-entry points. Reintroducing one requires updating that gate with
  an accepted owner/removal rationale, and the v1 public surface must pass the
  strict cleanup gate.
- A schema move is complete only after generated manifest parity is proven for
  the affected templates, including `drizzle.schemas.generated.ts` and link
  table generation where applicable.
- A behavior move is complete only after old package tests are ported to target
  Module Interface tests, replaced by equivalent coverage, or explicitly removed
  with a documented reason.
- Template manifests move after schema parity is proven. Starter
  `voyant.config.ts` entries should point at owner packages for v1.
- Cross-package references continue to follow schema discipline: cross-domain
  associations go through links unless a documented vertical-extension
  exception applies.
- Because `@voyant-travel/*` beta packages are already published, removed public
  package names need an external-consumer policy: changelog entry, migration
  target, and npm deprecation notice where appropriate. The v1 workspace should
  not keep runtime compatibility facades solely for beta import paths.

## 9. Implemented Target Recommendations

The strategic review questions raised during drafting are answered below as
current target recommendations. The v1 restructure branch implements these
decisions; later reversals should go through a follow-up ADR or explicit
migration issue rather than reopening the package move implicitly.

| Topic | Recommendation | Implementation follow-up |
| --- | --- | --- |
| Products / Inventory | Owned product authoring/runtime source lives in optional `inventory` packages or subpaths. Do not install Inventory by default for OTA/reseller bundles. | Main Product routes/services/schema/UI source and compose/duplicate product graph authoring are Inventory-owned. The old Products runtime package names are removed from v1; template schema specifiers use Inventory directly. Keep `@voyant-travel/catalog-authoring` only if a real Catalog overlay/source-governance surface is split out. |
| Commerce | Use `commerce` as the target Module. Fold `pricing`, `markets`, `sellability`, and promotions into Commerce. | Commerce owns the public commercial runtime surface. Sellability no longer constructs Transactions Offers; callers use commerce outputs, Proposal Versions, booking drafts, or trips price snapshots. Old public subpath exports are removed from v1. |
| CRM | Replace current `crm` packages with `relationships` plus `proposals` in the big-bang v1 package move. Do not ship a public v1 `crm` facade. | Move Person/Organization/account surfaces to Relationships and Proposal/Proposal Version/pipeline surfaces to Proposals. Temporary facades are allowed only inside intermediate migration commits. |
| Distribution | Fold `suppliers` and `external-refs` into `distribution`, while preserving Supplier and Channel as distinct domain roles. | Move supplier/channel/external-ref schemas, routes, and mappings behind Distribution Interfaces without flattening Supplier and Channel vocabulary. |
| MICE / Corporate | Implement optional `mice` as the group-business Module. Use Program as the central entity. Keep `corporate` as a bundle/persona label, not the Module name. | Start from one vertical slice: Program plus group block coordination, delegate/rooming workflow, or RFP/bid workflow. Keep low-level resource truth in Operations and connect through explicit Interfaces. |
| Catalog Item | Use canonical Catalog Item terminology in docs and product language while preserving the actual Catalog Projection Interface where that is the supported code contract. | Do not invent a `CatalogEntry` compatibility alias; reconcile docs/comments and any stray `CatalogItem` identifiers with `CatalogProjection` intentionally. |
| Trips | Use standalone `trips`. Do not expose it as a `proposals` subpath and do not rename it to `offers`. | Keep package names, route prefixes, admin extension ids, tests, and template manifests on the Trips vocabulary. |
| Transactions | Retire runtime `transactions` packages per ADR-0005. Do not rename them to `orders` or `commitments`, and do not ship `transactions-contracts` in the v1 workspace surface. | Replace `booking_transaction_details`, remove Sellability's Offer construction, and move remaining order/term references to their owning Modules as described in §5.4. |

## 10. Current Package Disposition

This section records the proposed direction for the current package set. It is
not an implementation plan by itself and does not override the ADR follow-ups
above; it prevents the strategy from silently assuming that unmentioned packages
stay unchanged.

### 10.1 Travel Runtime Packages

| Current package(s) | Direction | Notes |
| --- | --- | --- |
| `@voyant-travel/catalog`, `@voyant-travel/catalog-react` | Keep as the catalog projection/search/overlay/snapshot plane. | Catalog remains a contract/infrastructure plane, not a universal root table and not owned product authoring. |
| `@voyant-travel/catalog-authoring` | Keep only if it owns real overlay/source-governance behavior; otherwise operated authoring belongs to `@voyant-travel/inventory/authoring`. | The current compose/duplicate product graph authoring implementation is operated-inventory authoring. |
| retired beta Products packages | Removed from the v1 workspace surface. | Products are operated inventory. Runtime, schema, and React authoring imports use `@voyant-travel/inventory` and `@voyant-travel/inventory-react`. |
| `@voyant-travel/accommodations` | Keep as a vertical runtime for accommodation resale where the schema/booking semantics are real. | Do not revive hotel/property operations. Room-block work may be Operations/Program-facing while accommodation resale remains vertical. |
| `@voyant-travel/cruises`, `@voyant-travel/cruises-react` | Keep as a vertical runtime package. | Cruises have distinct content, sailing, cabin, fare, itinerary, and booking semantics. They should participate in catalog, commerce, bookings, and operations rather than be folded into any one of them. |
| `@voyant-travel/charters`, `@voyant-travel/charters-react` | Keep as a vertical runtime package. | Yacht/charter contracts, APA, suite/whole-vessel pricing, and booking semantics are distinct enough to keep a vertical seam. |
| `@voyant-travel/flights`, `@voyant-travel/flights-react` | Keep as a vertical/source runtime package. | Flights are live-offer/source-adapter driven and intentionally do not behave like owned product inventory. |
| retired beta Extras packages | Removed from the v1 workspace surface. | Extras are dependent add-ons discovered through a parent, not independently sellable inventory. Inventory owns product extras, option configs, content/projection helpers, and authoring UI; Bookings owns booking extras, participant selections, slot manifests, and booking-time UI. |
| retired beta OCTO package | Removed from the v1 workspace surface. | No deployment consumed the speculative compatibility package. Introduce OCTO later as a demand-driven Distribution adapter or plugin, backed by a production integration and certification harness. |

### 10.2 Commercial Runtime Packages

| Current package(s) | Direction | Notes |
| --- | --- | --- |
| retired beta Commercial packages | Removed from the v1 workspace surface. | Pricing, markets, sellability, and promotions runtime/React source now belong to Commerce and Commerce React. Commerce exposes the narrowed commercial decision surface rather than the old package choreography. |

### 10.3 Relationships, Proposals, Booking, And Commitment Packages

| Current package(s) | Direction | Notes |
| --- | --- | --- |
| `@voyant-travel/relationships`, `@voyant-travel/relationships-react`, `@voyant-travel/proposals`, `@voyant-travel/proposals-react` | Keep as the split Relationships and Proposals runtime surfaces for v1. | ADR-0018 moves supported bespoke sales language to Proposal. Customer/account records belong to Relationships; proposal pursuit belongs to Proposals. |
| `@voyant-travel/transactions`, `@voyant-travel/transactions-react` | Retire as public v1 runtime packages per ADR-0005. | Do not rename to `orders` or `commitments`. Move proposal state to Proposals, pricing Quote commercial snapshots to Commerce/Trips, booking origin/provenance to Bookings, terms to Legal/Finance, promotional offers to Commerce/Promotions, and provider order refs to vertical adapters/Catalog snapshots/Distribution external refs. |
| `@voyant-travel/trips`, `@voyant-travel/trips-react` | Keep as the standalone Trips packages. | Keep it as a standalone workspace Module. It reads Catalog and feeds Proposals, Bookings, and Finance, but does not belong wholly to any of them. Do not expose it as a `proposals` subpath and do not rename it to `offers` while `transactions` Offer and vertical live-offer vocabulary still exist. |
| `@voyant-travel/bookings`, `@voyant-travel/bookings-react` | Keep as the Bookings Module and deepen it. | Booking sessions, booking items, travelers, booking requirements, fulfillment, and commitment records belong here. |
| retired beta Booking Requirements packages | Removed from the v1 workspace surface. | Requirements define what must be collected to commit a booking; runtime and React imports use Bookings owner paths. |
| `@voyant-travel/checkout`, `@voyant-travel/checkout-react` | Removed from the v1 workspace package surface; Finance / Finance React are the owner paths. | Checkout is collection orchestration against booking, invoice, schedule, and guarantee targets. Published beta names should be npm-deprecated to the Finance owner paths. |

### 10.4 Operations Packages

| Current package(s) | Direction | Notes |
| --- | --- | --- |
| `@voyant-travel/operations`, `@voyant-travel/operations-react` | Target owner packages. | Runtime source includes availability, resources, ground, and places; React owner paths mirror them, including availability allocation UI. |
| retired beta Operations-slice packages | Removed from the v1 workspace surface. | Availability, resources, ground, places, facilities, and allocation UI imports use Operations owner packages. |
| Future `@voyant-travel/mice`, `@voyant-travel/mice-react` | Create as an optional MICE/corporate group-business Module. | Program is the central entity. The Module owns Program lifecycle, requirements, agenda, delegates, rooming, and RFP/bid workflow while reusing Proposals, Operations, Bookings, Finance, Distribution, Relationships, and Legal. |

### 10.5 Finance, Legal, Distribution, And Counterparty Packages

| Current package(s) | Direction | Notes |
| --- | --- | --- |
| `@voyant-travel/finance`, `@voyant-travel/finance-react` | Keep as Finance and deepen it with checkout. | Finance owns invoices, payments, payment sessions, tax persistence, supplier invoices, Travel Credits, settlement, and profitability. |
| `@voyant-travel/legal`, `@voyant-travel/legal-react` | Keep separate. | Legal documents, contracts, terms, templates, signatures, and legal workflows cut across proposals, bookings, Distribution, and finance. |
| `@voyant-travel/distribution`, `@voyant-travel/distribution-react` | Keep as the proposed Distribution Module name and absorb supplier/external-ref scope if the broader commercial-network definition is accepted. | Distribution owns supplier-side and channel-side commercial network concerns: Suppliers, Channels, mappings, allotments, channel push, source/operator links, reconciliation, and integration-facing references. |
| retired beta Supplier and External Ref packages | Removed from the v1 workspace surface. | Supplier remains a distinct role/entity inside Distribution; external refs are shared integration plumbing for channels, suppliers, sourced inventory, and external systems. |

### 10.6 Admin And Surface Packages

| Current package(s) | Direction | Notes |
| --- | --- | --- |
| `@voyant-travel/admin` | Keep as packaged staff shell and extension surface. | Admin is a surface/extension host, not a domain Module. App-shell exports live under `@voyant-travel/admin/app/*`. |
| `@voyant-travel/admin-app` | Keep as the first-party admin composition package until the domain-backed core extension can be inverted. | It re-exports the shell helpers for compatibility and owns `core-extension`, because that bundle imports domain React packages that depend back on `@voyant-travel/admin`. First-party shell imports should still move to `@voyant-travel/admin/app/*`. |
| `@voyant-travel/admin-client`, `@voyant-travel/admin-contracts` | Keep if the framework-neutral admin client contract remains useful. | This is a client/contract seam, not a domain seam. |
| `@voyant-travel/admin-react` | Keep separate only as the React Query adapter over `admin-client`; fold before v1 if no independent React SDK consumers are confirmed. | It is not part of the packaged shell/runtime surface moved into `admin`. |
| `@voyant-travel/storefront`, `@voyant-travel/storefront-react` | Keep as the customer-facing runtime/surface concept. | Storefront composes public and authenticated customer flows; it should not own product, price, booking, or finance truth. |
| retired beta Customer Portal packages | Removed from the v1 workspace surface. | Storefront owns authenticated account/after-booking surfaces through `@voyant-travel/storefront/customer-portal` and `@voyant-travel/storefront-react/customer-portal`. |
| `@voyant-travel/storefront-sdk` | Keep as a framework-agnostic facade if public flows stay cross-module. | SDK shape may simplify once commerce/bookings/finance consolidate. |
| retired beta Storefront Verification package | Removed from the v1 workspace surface. | Storefront owns public email/SMS challenge flows through `@voyant-travel/storefront/verification`. |

### 10.7 Infrastructure, Platform, And Cross-Cutting Packages

| Current package(s) | Direction | Notes |
| --- | --- | --- |
| `@voyant-travel/core`, `@voyant-travel/db`, `@voyant-travel/hono` | Keep separate. | Core framework, database helpers, and the concrete server API runtime are real infrastructure seams. `@voyant-travel/hono` stays explicit because it owns Hono-dependent implementation and sits below domain packages; it is not a swappable adapter. |
| `@voyant-travel/auth`, `@voyant-travel/auth-react`, `@voyant-travel/identity`, `@voyant-travel/identity-react` | Keep separate, but keep audience/customer terminology aligned. | Auth/session identity and contact/person identity are cross-cutting infrastructure. |
| `@voyant-travel/action-ledger`, `@voyant-travel/action-ledger-react` | Keep separate as an infrastructure/audit Module. | Audit/action timelines cut across domains. |
| `@voyant-travel/notifications`, `@voyant-travel/notifications-react` | Keep separate. | Notifications are infrastructure with provider/adapters and domain event consumers. |
| `@voyant-travel/storage` | Keep separate. | Storage is infrastructure. |
| Retired workflow infrastructure packages | Remove. | Product-owned background behavior uses package jobs and subscribers; customer-specific orchestration runs outside Voyant. |
| `@voyant-travel/catalog-rag`, `@voyant-travel/catalog-mcp` | Fold Catalog retrieval into `catalog` and remove first-party `catalog-mcp`. | Semantic/vector/hybrid search and compact agent results are Catalog API capabilities; MCP wrappers belong at the application/runtime edge when needed. |
| `@voyant-travel/ui`, `@voyant-travel/react`, `@voyant-travel/i18n` | Keep separate. | Shared frontend/runtime infrastructure. |
| `@voyant-travel/schema-kit`, `@voyant-travel/types`, `@voyant-travel/utils`, `@voyant-travel/templating` | Keep separate. | Shared type, TypeID, formatting, templating, and utility infrastructure. |
| `@voyant-travel/voyant-test-utils`, `@voyant-travel/voyant-typescript-config`, `@voyant-travel/vite-config`, `@voyant-travel/runtime-core` | Keep separate. | Test/build/runtime support packages. |

### 10.8 Contract Packages

| Current package(s) | Direction | Notes |
| --- | --- | --- |
| `@voyant-travel/accommodations-contracts`, `@voyant-travel/bookings-contracts`, `@voyant-travel/catalog-contracts`, `@voyant-travel/charters-contracts`, `@voyant-travel/cruises-contracts`, `@voyant-travel/extras-contracts`, `@voyant-travel/finance-contracts`, `@voyant-travel/flights-contracts`, `@voyant-travel/identity-contracts`, `@voyant-travel/legal-contracts`, `@voyant-travel/products-contracts`, `@voyant-travel/proposals-contracts`, `@voyant-travel/relationships-contracts`, `@voyant-travel/suppliers-contracts` | Keep the zod-only contract seam separate unless ADR-0002 is replaced. | Runtime consolidation does not automatically collapse contract packages, but v1 package moves can still rename, split, or retire legacy contract names. The legacy `crm-contracts` seam is split into Relationships and Proposals contracts for v1. `transactions-contracts` is removed with the retired Transactions runtime; useful schemas must live with their owning Modules. Treat `products-contracts`, `suppliers-contracts`, and `extras-contracts` as migration/compatibility concerns for their target Modules, not as proof that old runtime Module names should survive. |

### 10.9 Plugin Packages

| Current package(s) | Direction | Notes |
| --- | --- | --- |
| `@voyant-travel/plugin-netopia` | Keep as a finance/payment plugin. | Payment-provider logic belongs outside Finance core and should attach through provider/plugin seams. |
| `@voyant-travel/plugin-smartbill` | Keep as a finance/accounting plugin. | Accounting-provider logic belongs outside Finance core and should attach through provider/plugin seams. |
| `@voyant-travel/plugin-sanity-cms` plus external `@voyant-travel/plugin-payload-cms` | Keep as content/source plugins. | CMS-specific implementation should stay outside catalog core and expose provider/plugin integration points. |

### 10.10 Apps And Templates

| Workspace package(s) | Direction | Notes |
| --- | --- | --- |
| `operator` template | Keep as the reference product assembly. | The template should change after package seams settle, because it is the proof that product modes compose cleanly. |
| Internal dev-agent tooling | Keep outside the Voyant workspace. | Agent queue, remote sandbox, browser evidence, and code-execution tooling lives in `../internal-dev-agent`, not in the product monorepo. |
| `examples/operator-demo` | Keep as a private example fixture. | Product-specific seed data is not standard starter or product package authority. |
| `catalog-demo-api`, `flights-demo-api` | Keep as demo applications. | These may need dependency updates after Catalog, Inventory, or Flights package moves, but they should not drive Module boundaries. |
| Retired workflow dashboard/self-host example apps | Deleted. | Voyant no longer ships a workflow runner or workflow-run dashboard. |
