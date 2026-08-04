# Ubiquitous Language

The canonical domain vocabulary for Voyant - an OTA, tour-operator, and DMC
platform. Terms are grouped by subdomain. Use the **bold** term; treat
*italic* aliases as smells.

---

## Actors & people

| Term              | Definition                                                                                            | Aliases to avoid                |
| ----------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------- |
| **Person**        | An individual contact known to the operator — the canonical CRM identity record.                      | *customer, client, contact*     |
| **Organization** | A company or legal entity — represents a buyer, supplier, agency, or other counterparty.             | *account, company, client*      |
| **Traveler**      | A person who actually travels on a booking; carries category (adult/child/infant/senior) and PII.     | *guest, pax, passenger*         |
| **Participant**   | A role-bearer on a Proposal, Proposal Version, Booking, Program, or booking item (traveler, booker, decision-maker, finance). | *contact-on-deal*          |
| **User**          | An authentication identity in the system; orthogonal to Person — staff and customers can both be Users. | *login, account*              |
| **Supplier**      | An operational vendor we contract directly for delivery of owned or assembled products.                | *vendor, provider, source*      |
| **Storefront**    | A concrete customer-facing commerce access identity: one frontend, site, mobile app, or approved public application that authenticates public API access. | *theme, website shell, public channel* |
| **Channel**       | The sales and distribution context that controls assortment and commercial behavior for direct, OTA, affiliate, reseller, marketplace, or API sales. A Channel may serve zero or many Storefronts. | *partner, distributor, storefront* |
| **Actor type**    | The authorization role of the caller: `staff`, `customer`, `partner`, or `supplier`.                  | *role, audience*                |

## Commercial network & sourcing

| Term                 | Definition                                                                                         | Aliases to avoid                    |
| -------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Operator**         | The organization accountable for commercial control and, when applicable, operational fulfillment. | *agency, tenant, seller*            |
| **Reseller**         | A commercial role where an Operator sells inventory another Operator or Supplier fulfills.         | *channel (when used as a role)*     |
| **Operating party**  | The party that actually runs and fulfills the travel service day to day.                           | *supplier (when the party is an operator)* |
| **Inventory Source** | A technical upstream source of inventory data or booking capability (Connect, GDS, direct API, CSV import). | *supplier, provider, feed*   |
| **Operator Link**    | A capability-bearing relationship between an Operator and a counterparty for catalog, availability, booking, or sync. | *connection, partnership* |
| **Distribution**     | The commercial-network subdomain for supplier-side and channel-side counterparties, source/operator links, external refs, mappings, allotments, channel push, webhooks, and reconciliation. | *network, partnerships, outbound-only distribution* |
| **Publication**      | Distribution-owned permission for a Channel to sell a Product. Publication is default-deny; product rules override supplier rules; publication is necessary but not sufficient for sale. | *listing, mapping, visibility* |
| **Channel Product Mapping** | External identifier, routing, and synchronization configuration that relates a Product to a Channel's external product/rate/category records. It is not publication authority. | *publication, listing permission* |
| **Catalog Item**     | A normalized sellable discovery and booking record used by admin search, storefront, composer, or CMS sync regardless of provenance. | *CatalogEntry, product, listing* |
| **Operated Inventory** | Inventory the Operator owns or manages operationally in optional local module-owned records.     | *local product*                      |
| **Sourced Inventory** | Inventory the Operator sells but does not operate, reached through an Inventory Source.           | *external product, imported product* |
| **Catalog Projection** | A derived read model that interleaves Operated Inventory and Sourced Inventory for search and sync. | *master catalog, product table*  |

## Sales pipeline (pre-commitment)

| Term              | Definition                                                                                       | Aliases to avoid       |
| ----------------- | ------------------------------------------------------------------------------------------------ | ---------------------- |
| **Proposal**         | A tracked travel sales pursuit with a Person/Organization; moves through Stages, owns value, participants, activities, and one or more Proposal Versions, and may close won/lost. | *opportunity, deal* |
| **Proposal Version** | An immutable proposal revision or alternative sent to the client; freezes a Trip Envelope snapshot, pricing, validity, and decision state. | *proposal, estimate, package offer* |
| **Pipeline**      | An ordered set of Stages a Proposal moves through.                                                  | *funnel, board*        |
| **Stage**         | A step within a Pipeline (e.g. Qualified -> Proposal -> Negotiation), with win/lost flags.       | *step, status*         |
| **Activity**      | A logged interaction (call, email, meeting, task, follow-up) on a Proposal or Person.               | *event, log entry*     |
| **Segment**       | A named list of People or Organizations grouped by criteria, used for targeting or bulk action.  | *list, group*          |

## Group travel & MICE

| Term              | Definition                                                                                       | Aliases to avoid       |
| ----------------- | ------------------------------------------------------------------------------------------------ | ---------------------- |
| **MICE**          | Meetings, Incentives, Conferences, and Exhibitions: the group/business travel mode built around Programs, delegates, blocks, RFPs, and coordinated operations. | *events platform* |
| **Program**       | The umbrella group engagement for MICE or corporate travel; links buyer organization, dates, requirements, agenda, delegates, blocks, proposals, bookings, contracts, invoices, and operational run sheets. | *event, project, package* |
| **Program Requirement** | A demand record on a Program, such as rooms, function spaces, catering, AV, transfers, staffing, accessibility needs, or session capacity. | *request line* |
| **Program Session** | A timed agenda item within a Program, optionally tied to function space, capacity, track, inclusions, and delegate enrollment. | *event, activity* |
| **Delegate**      | A person participating in a Program with a role and lifecycle status; may later link to a Traveler, Booking, or storefront self-service identity. | *attendee, registrant* |
| **Program Room Block** | Program-level accommodation demand, assignment, and pickup/release tracking; execution truth lives in Room Resource Holds behind Operations. | *room block, hotel allotment when ambiguous* |
| **Program Space Block** | Program-level function-space demand and assignment over dates/times and layouts; execution truth lives in Space Resource Holds behind Operations. | *space block, meeting-room hold when ambiguous* |
| **RFP**           | A request for proposal issued for Program requirements to one or more Suppliers or venues.       | *sourcing request*     |
| **Bid**           | A Supplier or venue response to an RFP, with priced lines, validity, attachments, and evaluation status. | *proposal (when supplier-side)* |

## Catalog (what we sell)

| Term                  | Definition                                                                                       | Aliases to avoid               |
| --------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------ |
| **Product**           | A sellable travel offering — has a lifecycle status, booking mode (date, date-time, open, stay, transfer, itinerary), and capacity mode. It also carries an independent merchandising **Product family** and optional **Product subtype**, both orthogonal to booking mode, capacity mode, duration, supply model, and schedule. An active Product is eligible for sale through a Channel only when an effective Publication permits it. | *tour, trip, experience, package* |
| **Product status**    | The Product lifecycle: **draft**, **active**, or **archived**. Only active Products are eligible for sale; status does not select a sales surface. | *published, visible, activated* |
| **Product family**    | A configurable merchandising classification on a Product, stored as an immutable stable `code` on `product_types` (`products.productTypeId`). Standard first-party deployments seed five families idempotently: **Tour**, **Activity**, **Attraction**, **Event**, **Transportation** (`tour`, `activity`, `attraction`, `event`, `transportation`). Operators may add custom families and rename display labels or deactivate choices; standard and referenced families cannot be deleted. Independent of booking mode, capacity mode, duration, supply model, and schedule. | *category, product type, vertical* |
| **Product subtype**   | An optional, independent stable code on a Product (`products.productSubtypeCode`), e.g. `boat-tour`, `day-tour`. Free-form and never inferred from duration. | *sub-category, tag* |
| **Admission**         | The sellable entry format for the **Attraction** family — a Product whose family is `attraction`. | *ticket, entry, pass* |
| **Product Option**    | A configurable variant of a Product (e.g. "English Guided", "Private Group"); composed of Option Units. | *variant, sub-product*    |
| **Option Unit**       | A pricing/age dimension within an Option (e.g. "Adult", "Child 3–11", "Group 1–4").              | *price band, ticket type*      |
| **Product Day**       | A day in a multi-day Product's itinerary.                                                        | *day, leg*                     |
| **Product Day Service** | A scheduled service on a Product Day (transfer, meal, guided activity, accommodation reference). | *itinerary item*             |
| **Accommodation Component** | A lodging component sold or arranged inside a Product, package, itinerary, cruise extension, or sourced catalog item. | *hotel module, property ops* |
| **Room Option**       | A bookable accommodation option for resale or trip composition, usually with occupancy and board/rate choices. | *room unit (unless physical ops)* |
| **Rate Plan**         | A resale/commercial accommodation price and policy choice, usually from a Supplier or Inventory Source. | *tariff*                      |
| **Board Basis**       | The included-meals tier for an accommodation component (breakfast, half-board, full-board, all-inclusive). | *meal plan (when ambiguous)* |
| **Stay Component**    | A date-range accommodation line within a Product, Proposal Version, Booking, legacy Offer, or sourced Catalog Item. | *hotel reservation*            |
| **Product Version**   | An immutable snapshot of a Product's structure at a point in time.                               | *revision, snapshot*           |
| **Product Media**     | An image, video, or document attached to a Product or one of its Days.                           | *asset, attachment*            |
| **Operated Group Departure** | A fixed Product instance/departure with capacity and product-internal components such as bus transport, stays, included excursions, guide assignment, rooming list, and dependent Extras. | *package when used for the aggregate* |
| **Trip Envelope** | A customer-facing aggregate that groups one or more Component Bookings or provider/source order refs into one itinerary, checkout, support, document, and cancellation-preview experience. Not necessarily one Booking. | *Trip / Package Envelope, Package Envelope, Product, Booking* |
| **Composed FIT Trip** | An individually composed Trip Envelope assembled from independent commitments such as a product, stay, flight, transfer, cruise, or staff-confirmed placeholder. | *custom product, mega-booking* |
| **Component Booking** | One independently committed part of a Trip Envelope, with its own supplier/provider reference or provider/source order ref, cancellation rules, tax treatment, fulfillment state, and operational owner. | *Component Booking / Order, line when lifecycle is independent* |
| **Trip Requirement** | An unresolved customer need on a Trip Envelope ("3-night stay in Cairo, 2 adults") — vertical + criteria — that is sourced into ranked Trip Candidates and resolved by selecting one. A `required` requirement gates reserve until resolved. | *slot, gap, placeholder* |
| **Trip Candidate** | An AvailabilityCandidate attached to a Trip Requirement: ranked, TTL'd, and persisted as resumable trip state (re-validated before commit) — **not** a catalog cache. Selecting one pins a draft Component Booking. | *option, offer, cached result* |
| **Extra** | A child line that modifies or extends a Component Booking and shares that component's lifecycle closely enough to be cancelled, fulfilled, taxed, and supported with it. | *add-on, addon, extension, separate booking when dependent* |
| **Cruise Extension** | A cruise-specific pre/post-cruise hotel or land program. The offer definition can be shared across multiple cruises/sailings; a selected extension is an Extra when cruise-owned and lifecycle-dependent, or a sibling Component Booking when independently supplied, confirmed, cancelled, taxed, or supported. | *generic extension* |

## Inventory & availability

| Term                  | Definition                                                                                       | Aliases to avoid           |
| --------------------- | ------------------------------------------------------------------------------------------------ | -------------------------- |
| **Availability Rule** | A recurring capacity definition (RFC 5545 recurrence) that generates concrete Slots.             | *schedule, recurrence*     |
| **Slot**              | A concrete dated inventory unit (date or date-time) with remaining capacity.                     | *departure, instance, occurrence* |
| **Closeout**          | An explicit block on a date or date range (holiday, maintenance, sold-out override).             | *blackout, exception*      |
| **Allotment**         | A block of inventory reserved for a specific Channel.                                            | *contingent, allocation-to-channel* |
| **Capacity**          | The numeric upper bound on a Slot, Allotment, or Vehicle. Always a quantity, never a status.     | *limit, max*               |
| **Pickup Point**      | A geographic location where Travelers can be collected or dropped off.                           | *stop, meeting place*      |
| **Pickup Group**      | A named cluster of Pickup Points with a kind (`pickup`, `dropoff`, `meeting`).                   | *zone, cluster*            |
| **Room Resource Hold** | Operations-owned execution hold against accommodation capacity or a room allocation source.      | *Program Room Block when used for execution truth* |
| **Space Resource Hold** | Operations-owned execution hold against a function space, venue area, or layout/time allocation. | *Program Space Block when used for execution truth* |
| **AvailabilityCandidate** | A normalized live availability-search result from one source (destination + dates + pax → a ranked option), produced by `searchAvailability` and merged by `fanOutAvailabilitySearch`. Carries a non-replay-safe `candidateRef`, the `selection` needed to re-resolve at reserve, a public `price`, an `expiresAt`, and internal-only `providerData` (net/margin/source ref — never public). | *SourcedOffer, Offer, Slot, Option* |

## Pricing

| Term                   | Definition                                                                                      | Aliases to avoid       |
| ---------------------- | ----------------------------------------------------------------------------------------------- | ---------------------- |
| **Market**             | A geographic + economic region (e.g. "EU", "US East Coast") that anchors currency and pricing.  | *region, territory*    |
| **FX Rate Set**        | A timestamped snapshot of exchange rates used to resolve prices in non-native currency.         | *forex table*          |
| **Price Catalog**      | A versioned master price list.                                                                  | *price book*           |
| **Price Schedule**     | A seasonal/temporal pricing window with effective-from / effective-to.                          | *seasonal price, calendar* |
| **Cost**               | The amount we pay a Supplier — input to margin.                                                 | *buy price, net*       |
| **Rate**               | A Supplier's per-unit tariff (per_person, per_night, per_vehicle, flat).                        | *supplier price*       |
| **Price**              | The customer-facing sell amount.                                                                | *sell, retail*         |
| **Quote**              | An immutable, expiring, server-produced price and terms result for an exact Booking Session revision or equivalent provider pricing request. A Quote is not a sales pursuit and is distinct from Proposal Version. | *proposal, estimate, package offer* |
| **Cancellation Policy** | An ordered rule set defining refund percentages by cutoff window before service date.           | *refund schedule*      |
| **Sellability**        | The resolved answer to "is this Product buyable now for this date / pax / market / channel?" — combines Availability, Pricing, Allotments, and Policies. | *bookability* |

## Commitment chain

There are two canonical commitment flows:

1. Reusable catalog booking: **Product -> Booking Session -> Quote + optional Hold -> Commit -> Booking -> Fulfillment**. A Quote prices an exact Booking Session revision for a short validity window; a Hold claims inventory where the source supports it; Commit creates the durable Booking.
2. Bespoke travel sales: **Proposal -> accepted Proposal Version -> Booking Session -> Quote + optional Hold -> Commit -> Booking / Component Booking -> Fulfillment**. A Proposal Version freezes a bespoke Trip Envelope revision; accepting it marks the customer decision and seeds reservation, but does not by itself confirm suppliers or create a Booking.

Generic first-party **Order** is retired from v1 runtime language by ADR-0005; use Booking, Booking Origin, Finance/Legal target links, or provider/source order refs instead.

| Term                    | Definition                                                                                       | Aliases to avoid         |
| ----------------------- | ------------------------------------------------------------------------------------------------ | ------------------------ |
| **Legacy Offer**        | The transactions-package priced proposal primitive for pre-v1 offer-to-order flows; not the bespoke travel sales artifact staff agents call a Proposal. | *proposal, package offer, Offer as new public API* |
| **Legacy Order**        | The transactions-package commitment primitive retained only for migration/compatibility. Do not introduce it in new first-party v1 Interfaces. | *purchase order, generic order* |
| **Provider Order Ref**  | An upstream source/provider identifier for a committed component when the external system uses order language. | *first-party Order* |
| **Booking Session**     | The revisioned, resumable pre-Booking aggregate for one bookable target and selection. Anonymous access uses a hash-at-rest action-scoped capability; authenticated customers may atomically adopt it. Expiry or abandonment makes it unspendable and releases Holds; Commit consumes it. Its identifier is never authorization. | *cart id, checkout id, booking draft when referring to the canonical aggregate* |
| **Booking Requirements** | The server-published description of what a booking of one target actually needs: which journey steps and sub-steps apply, the pax bands and their occupancy rules, and the per-traveler and lead-only fields that must be answered. Derived once per target and scope, published on the Booking Session and on its Quote, and validated against the selection at quote and again at Commit — so what a host renders and what the server enforces are one derivation, never two. A host renders it; a host never invents it. | *draft shape, wizard config, client-side step list* |
| **Booking**             | The durable first-party commercial commitment and customer-safe operational record, created only at the policy-defined Commit point: Travelers, booking items, Allocations, Fulfillments, redemptions, origin/provenance, and state. Distinct from customer intent, payment state, supplier confirmation, and fulfillment. | *reservation, booking-record, Order* |
| **Booking Revision**    | An immutable before or proposed-after snapshot of one stable Booking aggregate. The Booking's integer revision is the optimistic-concurrency token; applying an Amendment advances it without changing Booking identity or reference. | *booking copy, replacement booking* |
| **Booking Amendment**   | The admitted preview → accept when required → apply aggregate for changing an existing Booking. It owns an expiring exact-revision quote, policy decisions, server-calculated price/fee/tax delta, collection/refund consequences, downstream-effect classification, idempotency, supplier-operation links, and immutable Booking Revisions. | *edit booking, cancel-and-rebook, client-calculated adjustment* |
| **Booking Origin**      | Bookings-owned provenance describing how a Booking was created: Proposal Version, Trip snapshot, Catalog price/availability response, provider/source order ref, or legacy transaction id. | *booking_transaction_details, order link* |
| **Booking Action**      | An Operations-owned, server-derived read model of one time-bound obligation associated with a Booking or Booking Session. It identifies the authoritative Finance, Catalog, Supplier Operation, or Legal source and derives due/overdue/escalated state without owning or mutating that source's workflow state. Public APIs expose only the customer-safe action and deadline. | *task as source of truth, editable checklist, booking status* |
| **Booking Item**        | A line item on a Booking (unit, service, extra, fee, tax, discount, accommodation, transport). | *line, row, order item*  |
| **Allocation**          | A capacity hold against a Slot, Pickup, or Resource — `held` → `confirmed` → `fulfilled`.        | *reservation-line, hold-record* |
| **Legacy Order Term**   | A pre-v1 transactions term attached to a Legacy Order. New v1 terms belong to Legal policy/contract targets and Finance collection targets. | *clause, Order Term as new public API* |
| **Hold**                | A temporary, time-limited claim on inventory before Booking confirmation; expires.               | *option, soft-hold*      |
| **Commit**              | The Booking Platform operation that may create a Booking. Owned inventory Commit validates exact Booking Session revision, Quote, live Hold, and required payment guarantee, then creates Booking, converts Hold to Allocation, and consumes Session/Quote in one transaction. Sourced inventory defaults to supplier-first and creates no Booking until supplier security unless an explicit operator-backed policy accepts fulfillment risk. | *checkout submit, book, confirm when ambiguous* |
| **Supplier Operation**  | A persisted sourced-inventory upstream intent and dispatch record for reserve, modify, or cancel. Its subject is either a pre-Booking Booking Session or a post-Booking Booking Amendment linked to the affected Booking Item. It tracks pending, secured, refused, failed, or in-doubt outcomes separately from Booking status. | *draft booking, supplier booking status as booking status* |

A priced traveler add/drop always previews and accepts an exact Booking Revision
before apply. Owned capacity, Allocation, Booking Items, traveler assignments,
the Finance adjustment, and the Booking revision change atomically. Sourced
changes dispatch durable Supplier Operations first; only all-secured operations
may project locally, while pending, in-doubt, refused, and partial outcomes stay
explicit and reconcilable.

## Fulfillment & operations

| Term                  | Definition                                                                                       | Aliases to avoid              |
| --------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------- |
| **Fulfillment**       | Issuance of a deliverable artifact (Service Voucher, ticket, PDF, QR, barcode) for a Booking Item.       | *ticket-event, issuance*      |
| **Service Voucher** | A fulfillment artifact a Traveler presents to consume a booked supplier service. It carries no stored monetary balance. | *voucher, confirmation, travel credit* |
| **Redemption**        | The act of consuming a Fulfillment at the point of service (scan, manual check-in).              | *check-in, scan*              |
| **Dispatch**          | An operational order in Ground to move passengers from A to B at a time, assigned to a Driver and Vehicle. | *job, run*           |
| **Vehicle**           | A transport asset (car, van, bus, coach) with capacity, class, and accessibility flags.          | *car, unit*                   |
| **Driver**            | A crew member assigned to Vehicles and Dispatches.                                               | *operator, chauffeur*         |
| **Resource**          | A finite assignable asset (guide, equipment, room, driver, vehicle) with a type and availability. | *asset, person-resource*     |
| **Resource Pool**     | A named collection of interchangeable Resources (e.g. "French-speaking guides – Cairo").         | *team, group*                 |
| **Place**             | A shared physical place used by OTA, tour-operator, DMC, and MICE workflows: meeting points, pickup/dropoff places, airports, stations, ports, attractions, restaurants, supplier bases, venues, and accommodation locations. | *facility as product term, generic location* |
| **Rooming List**      | Traveler-to-room grouping or assignment data for a Booking.                                      | *hotel room management*       |
| **Legacy Facility**   | The table-era name for Place rows and `facilityId` fields. Use Place / Operations-owned places for new domain language; do not reintroduce first-party facility packages. | *first-party facility operations* |
| **Accommodation Location** | A Place used to locate lodging content or a Stay Component for resale/trip composition. It is not a hotel/PMS/property-operations record. | *property ops, hotel operations* |

## Money

| Term                  | Definition                                                                                       | Aliases to avoid              |
| --------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------- |
| **Invoice**           | A billing document issued to a payer; lifecycle `draft → sent → partially_paid / paid / overdue / void`. | *bill*                |
| **Invoice Number Series** | A configured numbering sequence (per legal entity / year / type) Invoices draw from.         | *sequence*                    |
| **Credit Note**       | A reversal or adjustment document referencing an Invoice.                                        | *refund-doc, reversal*        |
| **Payment**           | A recorded inbound transfer of money (bank transfer, card, cash, Travel Credit, direct bill).    | *receipt, transaction*        |
| **Travel Credit**     | Currency-denominated stored value issued by Finance and consumed through an immutable redemption ledger. | *voucher, coupon, promo code* |
| **Promotion Code**    | A customer-entered Commerce code that activates a Promotion and changes price; it never carries a balance. | *voucher, travel credit* |
| **Supplier Payment**  | A recorded outbound transfer to a Supplier.                                                      | *payout, AP*                  |
| **Payment Schedule**  | An installment plan attached to a Booking (deposit, installment, balance, hold) with due dates.  | *plan, instalments*           |
| **Guarantee**         | A security hold (deposit, pre-auth, card-on-file, agency letter, or Service Voucher) ensuring eventual payment. When required by commercial policy, it is a Commit precondition; pay-later is allowed only when policy explicitly authorizes it. | *deposit (overloaded)* |
| **Payment Session**   | An active payment attempt against a target (Booking, Invoice, Schedule line, Guarantee, Program, or explicit legacy/provider reference). | *checkout, intent*            |
| **Collection Plan**   | A preview of what will be collected from the customer and when.                                  | *quote-of-collections (technical alias only)* |

## Distribution

| Term                       | Definition                                                                                       | Aliases to avoid           |
| -------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------- |
| **Channel Contract**       | The agreed terms with a Channel.                                                                 | *agreement*                |
| **Commission Rule**        | A scoped (booking / product / rate / category) fixed-or-percentage rule for what a Channel earns. | *cut, fee-rule*           |
| **Settlement**             | An accounting run reconciling Booking-side amounts owed to or from a Channel.                    | *payout-run*               |
| **Reconciliation**         | Comparison of expected vs. actual Bookings/amounts against a Channel; produces Issues.           | *audit, match*             |
| **Reconciliation Issue**   | A flagged mismatch (`missing_booking`, `status_mismatch`, `amount_mismatch`, `cancel_mismatch`, `missing_payout`). | *discrepancy* |

## Legal & compliance

| Term                  | Definition                                                                                       | Aliases to avoid          |
| --------------------- | ------------------------------------------------------------------------------------------------ | ------------------------- |
| **Contract**          | A signed legal document instance bound to a Booking, Proposal Version, Program, Product, Supplier/Channel relationship, or explicit provider/source ref. | *agreement (overloaded)*  |
| **Contract Template** | A reusable contract form with variable placeholders, rendered per instance.                      | *form, boilerplate*       |
| **Signature**         | A record of a Contract being signed (signer, method, IP, timestamp).                             | *sign-event*              |
| **Policy**            | A scoped rule set (cancellation, payment, T&C, guarantee, commission); versioned.                | *terms*                   |
| **Policy Version**    | An immutable snapshot of a Policy's rules — `published` or `retired`.                            | *revision*                |
| **Policy Acceptance** | A recorded confirmation that a Person or Booking accepted a specific Policy Version.             | *consent, sign-off*       |
| **PII**               | Personally Identifiable Information; reads/writes to PII fields are audit-logged.                | *personal data (loose)*   |

## Identity & external references

| Term                | Definition                                                                                       | Aliases to avoid          |
| ------------------- | ------------------------------------------------------------------------------------------------ | ------------------------- |
| **Contact Point**   | An email, phone, or website attached to a Person, Organization, or Supplier.                     | *contact (overloaded)*    |
| **Address**         | A postal address attached to a Person or Organization.                                           | —                         |
| **Named Contact**   | A titled point-of-contact role at an Organization (e.g. "Procurement Manager Jane Doe").         | *role-contact*            |
| **External Ref**    | A mapping between a Voyant entity and an ID in a third-party system (PMS, OTA, channel manager). | *external id, sync key*   |
| **Brand Asset**     | An Operator-owned visual identity file. The standard set is a horizontal Logo and compact Icon, each with light-mode and dark-mode variants. | *contract logo, document logo* |
| **Document Renderer** | A deployment-supplied capability that turns operator-rendered HTML into an output document such as PDF. The selected binding may provide an in-process renderer or an HTTP endpoint. | *Cloudflare renderer, contract renderer* |

---

## Agent tooling & MCP

See [agent tool library](docs/architecture/agent-tool-library.md) and
[ADR-0011](docs/adr/0011-agent-tool-library-and-mcp.md).

| Term               | Definition                                                                                                                            | Aliases to avoid            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **Tool**           | An authored-once, headless, scope-gated capability an agent can invoke; validates input + output and returns typed **pure data**.       | *command, action, function* |
| **Tool Registry**  | The in-deployment collection of registered Tools; dispatches by name and emits the discovery manifest. Holds no authorization logic.    | *tool list*                 |
| **Tool Manifest**  | The contract-versioned, pure-data description of available Tools (name, JSON-Schema input, `requiredScopes`, risk) for remote agents.   | *tool catalog, schema dump* |
| **MCP Server**     | The in-deployment Model Context Protocol adapter (`/v1/admin/mcp`) exposing the Tool Registry to external agent clients. Not an agent.  | *agent, bot, tool worker*   |
| **Risk Tier**      | A Tool's coarse risk class: `read`, `write`, `sensitive`, or `destructive`. Paired with a declarative **Risk Policy**.                  | *permission level*          |
| **Required Scopes**| The `resource:action` scopes a caller must hold (AND) to invoke a Tool — the finer-grained gate above the coarse route guard.           | *tool permission*           |
| **Audience grant** | The `staff`/`customer`/`partner`/`supplier` value carried on an API-key grant (not inferred from scopes), resolved into a resolver scope.| *role, actor (overloaded)*  |

---

## Lifecycle verbs (canonical actions)

| Verb           | Meaning                                                                                          | Used on                                  |
| -------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| **Hold**       | Place a time-limited pre-Commit claim on inventory.                                              | Booking Session, inventory capacity      |
| **Confirm**    | Record a binding supplier or allocation result. A Booking itself is created confirmed by Commit rather than confirmed later. | Allocation, Supplier status |
| **Start**      | Mark a confirmed Booking as in-progress — service is underway.                                   | Booking                                  |
| **Complete**   | Mark an in-progress Booking as fully delivered.                                                  | Booking                                  |
| **Issue**      | Produce a deliverable artifact (Service Voucher, invoice, contract, policy version).             | Fulfillment, Invoice, Contract, Policy Version |
| **Fulfill**    | Mark operational delivery complete.                                                              | Booking Item, Allocation                 |
| **Deliver**    | Push an issued artifact to the recipient over a channel (email, download, wallet, API).          | Fulfillment, Notification                |
| **Accept**     | Record that the client chose a Proposal Version or accepted required commercial/legal terms; does not by itself mean every supplier component is confirmed. | Proposal Version, Policy Version, Contract, legacy Offer |
| **Redeem**     | Consume a Fulfillment at point of service.                                                       | Fulfillment                              |
| **Cancel**     | Operationally reverse a commitment.                                                              | Booking, Allocation, Supplier status |
| **Void**       | Financially reverse a document — distinct from Cancel.                                           | Invoice, Payment                         |
| **Close**      | End a Proposal with an outcome (won/lost/archived).                                                 | Proposal                                    |
| **Convert**    | Promote one entity to the next on the commitment ladder.                                         | Proposal Version -> reserve workflow, Product/Catalog Item -> Booking, legacy Offer -> legacy Order |
| **Commit**     | Execute the policy-defined Booking Platform commitment point.                                    | Booking Session -> Booking, Hold -> Allocation |
| **Reconcile**  | Compare expected vs. actual and emit Issues.                                                     | Channel Settlement                       |
| **Settle**     | Post the financial outcome of Reconciliation.                                                    | Channel Settlement                       |
| **Override**   | Manually set a Booking's status, bypassing the transition graph. Admin-only; always audit-logged with a required reason. | Booking |

## Relationships (the domain laws)

- A **Person** may belong to zero or more **Organizations**; both can appear on Proposals, Programs, and Bookings.
- A **Proposal** belongs to one Person and/or Organization, moves through a Pipeline, and produces zero or more **Proposal Versions**.
- A **Proposal Version** freezes a Trip Envelope snapshot; editing a sent Version creates another Version.
- Accepting a **Proposal Version** marks that Version accepted, closes the Proposal won, and seeds a Booking Session / reserve workflow; it does not create a Booking and does not mean every live or manual component is supplier-confirmed.
- A pricing **Quote** belongs to the Booking Platform pricing flow; it may precede an optional Hold and Commit/Booking, but it is not a Proposal Version and does not own sales-pipeline state.
- A transactions **Legacy Offer** may still convert to a **Legacy Order** only in migration/compatibility flows; it is not the bespoke travel sales artifact called Proposal.
- A **Booking Origin** records whether a Booking came from an accepted Proposal Version, Trip snapshot, Catalog price/availability response, provider/source order ref, or legacy transaction id.
- A **Booking** is the first-party durable commitment record; do not require a generic first-party Order to create one.
- A **Booking** is distinct from Finance collection state and Supplier Operation state; required guarantees and supplier security may be Commit preconditions or follow-up actions, but they do not become Booking status.
- Owned-inventory **Commit** creates Booking and converts Hold to Allocation atomically. Sourced-inventory **Commit** defaults to supplier-first: persist Supplier Operation intent before dispatch and create no Booking until supplier security, unless an explicit operator-backed policy accepts fulfillment risk.
- A **Booking** holds **Allocations** against **Slots** (or Pickups, or Resources); each Allocation belongs to exactly one Booking Item.
- Accommodation may be sold as **Sourced Inventory** or as a component of a **Product**, and may reference a **Place** for where the stay happens, but hotel/property operations are not a first-party implementation scenario.
- A **Booking Item** produces zero or more **Fulfillments**; each Fulfillment is delivered over exactly one channel.
- An **Invoice** targets a Booking, Program, Organization, Supplier/Channel relationship, Schedule line, or explicit legacy/provider reference. It does not require a generic first-party Order.
- A **Payment Schedule** belongs to a Booking; each schedule line resolves via a **Payment Session** to one or more **Payments**.
- A **Storefront** binds to exactly one **Channel** after migration; public request context derives Channel from Storefront identity, never from caller-submitted parameters.
- A **Channel** sells via **Publication** (assortment permission), **Allotment** (reserved inventory), and **Commission Rules**; **Settlement** runs reconcile its activity.
- **Publication** is separate from **Channel Product Mapping**. A Publication without a mapping can sell through a direct Storefront; a Mapping without Publication cannot expose or push a Product after cutover.
- A Product-specific Publication decision overrides a Supplier-specific Publication decision. If neither exists, the Product is unpublished.
- A **Policy** is assigned by scope (Product, Channel, Market, Booking); a **Policy Acceptance** binds a specific Policy Version to a Person or Booking.
- **Cost** ≠ **Rate** ≠ **Price**: Cost is what we pay, Rate is the Supplier's per-unit tariff input, Price is what the customer sees.
- A **Product** is canonical module-owned truth; a **Catalog Item** is a derived sellable read model that may resolve to a Product or to Sourced Inventory.
- An **Operator Link** grants one or more capabilities (catalog, availability, booking, sync) between counterparties; an **Inventory Source** is one technical adapter behind that link.
- An Operator can be both an **Operating party** for some inventory and a **Reseller** for other inventory at the same time.
- A **Trip Envelope** groups Component Bookings and provider/source refs for customer experience and checkout; it does not erase the lifecycle boundaries of those components.
- Product-internal bundles and dependent **Extras** stay inside their Component Booking. Customer-composed additions with independent supplier/cancellation/tax/fulfillment state become sibling Component Bookings under the same Trip Envelope.
- A **Cruise Extension** is a vertical-specific category, not a generic synonym for Extra. Its catalog definition may be reused across cruises; apply the same lifecycle boundary rule to the selected extension to decide whether it is nested under the cruise booking or split into its own Component Booking.

## Example dialogue

> **Sales agent:** "I've got a hot **Proposal** with the Henderson family — eight **Travelers**, two weeks in Egypt. I sent them a **Proposal Version** last week."

> **Operations manager:** "Good. If they accept that Version, run reserve. Live lines must recheck **Sellability** and **Cost** from our Cairo **Suppliers**; manual lines move into supplier confirmation."

> **Sales agent:** "And the **Booking** is created immediately?"

> **Operations manager:** "Only after reserve can secure the component commitments. The **Booking** is operational: it holds **Allocations** against the **Slots** for each guided day, includes a **Stay Component** in Aswan, and sets up **Dispatches** with **Vehicles** and **Drivers** for the transfers."

> **Sales agent:** "What about the cancellation thing they asked about?"

> **Operations manager:** "That's the **Cancellation Policy** assigned to the Product. We'll record a **Policy Acceptance** against the specific **Policy Version** when they sign the **Contract**. If they later cancel, we **Cancel** the Booking — that's an operational reversal — and **Void** any Invoices that were never paid. If they paid, we issue a **Credit Note** instead."

> **Finance:** "Don't forget the **Payment Schedule**. Deposit at booking, balance 30 days out. The deposit is also our **Guarantee**. Each line goes through a **Payment Session** when collected."

> **Sales agent:** "What about the Viking sailings we're selling but not actually operating? They don't feel like our own **Products**."

> **Operations manager:** "Right — those are **Sourced Inventory**. Viking is the **Operating party**, we are the **Reseller**, and the feed comes through an **Inventory Source** behind an **Operator Link**."

> **Sales agent:** "So what shows up in search and in the storefront?"

> **Operations manager:** "A **Catalog Item**. For our own tours the Catalog Item resolves to a local **Product**. For Viking it resolves to sourced inventory. Same discovery surface, different source of truth."

## Flagged ambiguities

These terms are used loosely in conversation. Pick the canonical form below; treat the rest as smells when you see them in code or docs.

- **Customer / client / buyer** — none are first-class entities. The canonical CRM record is **Person** (with optional **Organization**). On a Booking, the buyer is captured as `personId` + `organizationId` snapshot fields. Avoid "customer" / "client" except in UI copy facing the operator's own staff.
- **Tour / experience** — usually collapse to **Product**. **Trip** and **package** are overloaded: use **Product** for an operator-sold offering, **Operated Group Departure** for a fixed-capacity product instance, and **Trip Envelope** for a customer-facing aggregate of multiple component commitments.
- **Excursion** — contextual vocabulary only. It is not a **Product family** and must not be equated with a `<= 1-day` product or with booking mode `date`/`date_time`. A short trip conversationally called an "excursion" still classifies under whichever **Product family** and **Product subtype** actually apply (often Tour).
- **Package** — a derived compliance/composition classification computed from a Product's structure, not a hand-authored **Product family**. Don't add "package" as a family code.
- **Tour / Activity / Attraction / Event / Transportation** — the five standard seeded **Product family** codes (`tour`, `activity`, `attraction`, `event`, `transportation`). **Day Tour** and **Multi-day Tour** are formats of the **Tour** family, not separate families. **Admission** is the sellable entry format of the **Attraction** family. Duration never reclassifies a family — a 60-minute Boat Tour stays a Tour.
- **Place vs. legacy Facility** — use **Place** for shared physical places in new code and docs. `Facility` and `facilityId` remain compatibility names for current tables, routes, and public consumers.
- **Accommodation vs. hotel operations** — accommodation is valid as catalog inventory, sourced resale, trip composition, or as a Place reference. Hotel/property operations are not a first-party Voyant implementation scenario.
- **Proposal vs. Opportunity** — the canonical sales pursuit is **Proposal**. Opportunity is the old generic CRM name and should not appear in new public package surfaces.
- **Proposal Version vs. Legacy Offer** — both look like "a price proposal". **Proposal Version** is the travel-native proposal revision or alternative that freezes a Trip Envelope snapshot and can be accepted into reserve. **Legacy Offer** is the transactions-package primitive for pre-v1 compatibility flows. They are not synonyms.
- **Legacy Order / Provider Order Ref vs. Booking** — **Legacy Order** is a transactions compatibility primitive, and **Provider Order Ref** is an upstream identifier. **Booking** is the first-party durable commitment and operational record. Do not recreate a generic first-party Order when Booking origin/provenance or provider refs carry the needed meaning.
- **Reservation** — overloaded between "Hold" (a temporary inventory claim) and "Booking" (the persistent record). Use **Hold** or **Booking** — never "Reservation".
- **Cancel vs. Void vs. Close** — different verbs for different domains. **Cancel** = operational reversal (Booking, Allocation). **Void** = financial reversal (Invoice, Payment). **Close** = end a Proposal with an outcome. Don't blend them.
- **Hold vs. Allocation vs. Reservation** — **Hold** is the temporal status of a Booking before confirmation (`hold_expires_at`). **Allocation** is the inventory-line entity (`held` → `confirmed` → `fulfilled`). Avoid "Reservation".
- **Supplier vs. Partner vs. Provider** — **Supplier** is the entity that sells us services. **Partner** is a relationship type on Organizations. **Provider** is for tech integrations (notification provider, storage provider) — do not call a hotel a "provider".
- **Storefront vs. Channel** — **Storefront** is the authenticated customer-facing access identity. **Channel** is the sales/distribution context and assortment authority. Do not let frontend composition or public request parameters choose publication authority.
- **Channel vs. Distribution vs. Partner** — **Channel** is the sales/distribution context (direct, OTA, affiliate, marketplace, or API). **Distribution** is the broader commercial-network subdomain covering Channel and Supplier-side connectivity. Don't say "Partner" when you mean Channel, and don't use Distribution as the name of a counterparty record.
- **Supplier vs. Operator vs. Inventory Source** — **Supplier** is an operational vendor in local managed operations. **Operator** is the principal commercial/operational party in the network. **Inventory Source** is the technical integration path. TUI or Viking may be the upstream Operating party while Connect or a GDS is only the Inventory Source.
- **Product vs. Catalog Item** — **Product** is canonical local truth with admin ownership and operational modeling. **Catalog Item** is the normalized discovery projection that can represent either a local Product or Sourced Inventory. Do not import external inventory into Product just to make it searchable.
- **Reseller vs. Channel** — **Reseller** is a role an Operator can play relative to inventory. **Channel** is a distribution entity that sells our inventory. They overlap in commerce but are not the same record.
- **Contact** — too overloaded to use raw. Pick: **Person** (CRM record), **Contact Point** (email/phone/website on identity), **Named Contact** (titled role at an Organization), or **Participant** (role on a deal/order/booking).
- **Traveler vs. Participant vs. Guest** — **Traveler** is the person actually traveling (booking_travelers, with category and PII). **Participant** is the broader role-bearer on a transaction (booker, decision-maker, finance, traveler). Avoid "Guest"; use **Traveler** in bookings and rooming lists.
- **Capacity** is always a number, never a status. Slots have a capacity *and* a status — don't conflate them.
- **Cost / Rate / Price** — three distinct money concepts. **Cost** = our outflow to a Supplier. **Rate** = the Supplier's per-unit tariff (per_person, per_night, etc.). **Price** = what the customer pays. Never use them interchangeably even when numerically equal.
- **Issue vs. Fulfill vs. Deliver** — **Issue** = produce the artifact (Fulfillment, Invoice, Contract). **Fulfill** = mark operational completion of a Booking Item or Allocation. **Deliver** = transmit an issued artifact over a channel (email, download, wallet, API). Three steps, not synonyms.
