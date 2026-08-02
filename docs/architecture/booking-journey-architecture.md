# Unified booking journey — architecture

Status: implemented foundation / execution reference
Audience: anyone designing or implementing the booking flow that commits an inquiry into a booked reservation.

Commitment points for Booking Platform v1 are governed by
[ADR-0019](../adr/0019-booking-v1-commitment-point-policies.md). Older
`bookEntity` wording in this document means the policy-governed Commit
operation, not permission to create a Booking during pre-commitment Session
work.

This document specifies a single multi-step booking journey that works for
**every Catalog Item shape Voyant supports** (single-day excursions, multi-day
tours with accommodation, transfers, accommodation-only stays) and **every
source** (operator-owned inventory, Voyant Connect peers, GDS connectors,
bedbanks, the demo upstream). It supersedes the one-click `Book this` action
shipped in the booking-engine tracer and is the long-term replacement for
vertical-specific booking dialogs.

Current implementation state, August 2026:

- The reusable engine contracts, quote/book routes, draft CRUD routes, hold routes, `catalog_quotes`, and `booking_drafts` are in `@voyant-travel/catalog/booking-engine`.
- The shareable React hooks are in `@voyant-travel/catalog-react/booking-engine`.
- The shareable wizard shell and step components are in `@voyant-travel/bookings-react/journey`.
- The operator starter mounts the shared route family on both `/v1/admin/catalog/*` and `/v1/public/catalog/*`, and wires operator-only slots, order routes, checkout start, tax transforms, and snapshot enrichment locally.
- Catalog Items are the journey input. `sourceKind: "owned"` dispatches to an
  internal Voyant handler when the relevant module is installed; sourced
  inventory dispatches to the source adapter. An OTA deployment can run without
  the products module and still book sourced catalog rows.
- `@voyant-travel/trips` now exists as the multi-line orchestration layer
  above this journey. It owns Trip Envelopes, Trip Components, aggregate
  pricing/reserve/finance/checkout/cancellation operations, and calls this journey's
  single-line catalog booking-engine primitives per component.
- Accepted Proposal Versions seed the same v1 Booking Session lifecycle from a
  frozen Trip Snapshot. Trips coordinates the aggregate while Catalog continues
  to own the per-component Quote, Hold, supplier-operation, and Commit seams.
- Operations projects time-bound Hold, Payment Schedule, Supplier Operation,
  and Contract obligations into one Booking Action work queue. The projection
  is rebuildable and never becomes a second workflow authority: Catalog,
  Finance, and Legal readers always reread their own current rows. Public
  Booking routes expose a redacted next-action shape, and payment reminders use
  the projection's timezone-resolved deadline instant.

### Booking Action projection boundary

`booking_action_projections` is an Operations-owned read model with a stable
`providerId + sourceModule + sourceType + sourceId` identity. Source modules
provide current snapshots through a many-valued runtime port. Duplicate,
delayed, and out-of-order wake-ups converge because snapshots are reread from
source tables, fingerprints make unchanged writes no-ops, and an older
`sourceUpdatedAt` cannot replace a newer projection.

The frequent incremental job uses a bounded overlap window; a daily full
rebuild deterministically rereads every source and marks missing source rows as
`invalid_source`. Neither the staff queue nor the public next-action route has
an edit operation. Satisfaction, cancellation, and supersession must happen in
the authoritative Hold, Payment Schedule, Supplier Operation, or Contract
service and then flow back through projection.

Payment Schedule deadlines are calendar dates with an explicit IANA timezone.
Operations resolves local end-of-day to an instant using the named zone, so DST
and non-UTC operators do not inherit the former implicit `T00:00:00Z`
interpretation. Notifications refresh and consume this projected instant before
evaluating payment reminder stages.

Five load-bearing rules, in order of importance:

1. **One journey, dispatched at the engine layer.** The wizard does not branch on `source.kind` or on whether a Catalog Item is owned vs. sourced. It always speaks to `POST /v1/{admin,public}/catalog/quote` and `POST /v1/{admin,public}/catalog/book`. The engine dispatches via the `SourceAdapterRegistry` (sourced) or optional owned handlers (owned).
2. **The Catalog Item's *shape* drives the UI, not the source.** Every quote response carries a `BookingDraftShape` descriptor — which steps to show, which fields are required per passenger, occupancy bands, Extra catalog references. The same wizard renders a one-page booking for a 2h walking tour and a six-step booking for a 14-day cruise + flight package, by reading the descriptor.
3. **Live pricing is the default, not an afterthought.** Every meaningful input change (pax count, age bands, dates, Extras, billing country for VAT) re-quotes. The total displayed in the sticky footer is always the price the system will commit to. No silent drift between display and commit.
4. **Build the journey once; ship it on every surface.** Operator dashboard, customer storefront, partner portal, embedded white-label widgets — all consume the same wizard shell, the same React hooks, the same UI sections, and the same engine endpoints. Surface differences (CRM picker for operators vs. inline contact for customers, B2B billing default vs. B2C, payment provider hookup) live in injectable slots, not parallel codebases.
5. **The journey is a building block, not the ceiling.** Customer-composed multi-line itineraries (flight + cruise + stay + return flight, all booked together) are explicitly NOT this doc's concern — they are the [trips](./ai-travel-experience-composition.md)'s concern. But the journey's shape is designed so the composer can drive it: per-line drafts, per-line quotes, per-line holds, all coordinated by the composer's saga. Decisions in this doc that block multi-line composition are bugs.

## 0.5. Single-line journey vs. composed itinerary

This doc specifies the **single-line booking journey** - the wizard a user sees
when they're committing to one bookable thing (one tour, one cabin sailing, one
stay, one transfer, one flight). The user picks dates, fills in passengers,
picks Extras, establishes any required guarantee, and commits. One Quote, one
Hold where supported, one Commit.

That covers the high-volume case: a customer browsing a tour catalog and clicking Book. It does NOT cover the case where a customer assembles a custom multi-line itinerary on the fly:

> "Flight Bucharest → Budapest, Danube cruise to Vienna, 3-night stay in Vienna, flight back to Bucharest." Four lines, four verticals, one customer experience, one consolidated payment.

That second case is the [trips](./ai-travel-experience-composition.md)'s job. The composer:

- Holds the user-built itinerary as a Trip Envelope with multiple Trip Components,
  one per line.
- Per Trip Component, calls the engine's `quoteEntity` (the same endpoint this
  journey uses).
- Aggregates per-line prices and tax breakdowns into one consolidated total + one collection plan.
- On Reserve/Buy, runs a saga that calls `bookEntity` (or its hold equivalent) per line in dependency order, with compensation if any line fails.
- Hands off to the existing checkout module with one `payment_session` covering all lines.

One important distinction: a "single line" may itself be a rich operated
product. A fixed group departure can include bus transport, stays, included
excursions, internal allocations, rooming lists, and dependent Extras while
still being one booking journey line. The journey owns that product-internal
bundle because it shares one departure capacity and operational lifecycle.

Customer-composed additions are different. If the same traveler books that
group departure, then adds 3 extra hotel nights and a flight home, those added
stay/flight commitments are sibling components under the trips, not
Extras inside the group-departure booking journey.

**The journey and the composer share primitives, not UI:**

| Primitive | Owned by | Reused by composer? |
|-----------|----------|--------------------|
| `BookingDraftShape` (per-line descriptor) | journey | yes — composer fetches one per Trip Component |
| `BookingDraft` (per-line draft state) | journey | yes — composer can hold N of these through component refs |
| `quoteEntity` / `bookEntity` engine endpoints | catalog booking-engine | yes — composer calls per line |
| `booking_drafts` row + hold | journey (§5.7) | yes - one per `DraftItem` |
| Wizard shell `<BookingJourney />` | journey | **no** — composer renders its own multi-line UI |
| Per-step section components (Travelers, Payment, etc.) | `bookings-ui` | **partially** — composer reuses Billing + Payment for the consolidated view, may also reuse Travelers if travelers are shared across lines |
| `bookingsCreate` atomic transaction | bookings | **mostly no** — composer needs cross-line atomicity that's bigger than one booking-create transaction; the saga model from `@voyant-travel/core/workflows` is the right primitive |

**What the journey's design must NOT lock in:**

1. **Per-line `bookings` rows.** A composed itinerary may be one `bookings` row with N dependent `bookingItems`, or N bookings/orders under one trip/package envelope — the composer decides. Default for FIT cross-vertical composition is split backend commitments grouped under one customer-facing envelope; default for product-internal bundles and dependent Extras is one booking with child items. The journey commits ONE bookable component; the composer's saga decides how to group components.
2. **Single-quote-per-draft assumption.** The journey's `booking_drafts.current_quote_id` is one-to-one. The composer's `ItineraryDraft` carries N quote ids (one per line). Don't add cross-line constraints to `booking_drafts`.
3. **Per-line payment.** The journey's Payment step assumes one payment for one line. The composer skips the journey's Payment step and runs a consolidated payment off the aggregated total. Solution: make the Payment step optional in the descriptor (see §3 — it already is).
4. **Auth scope.** The composer needs to span multiple verticals, including some that are admin-only today (flights). The journey's public/admin route split must extend to all verticals the composer might compose, including flights — that's a follow-up on flights, not this doc.

The journey is a **leaf node** in the composer's call graph. Build it leaf-first, validate it on the high-volume single-line case, then the composer builds itinerary orchestration on top without re-implementing per-line booking. The owned-arm dispatch is now in place for products, accommodations, and cruises; composer work should call those single-line quote/book primitives instead of reaching into vertical services directly.

## 0.7. Reuse-before-add: existing primitives this doc explicitly composes

Before specifying anything new, this doc commits to reusing the following primitives where they already cover the problem. Several pieces of the journey were designed earlier and partially shipped; treating them as ground truth keeps the new work focused.

| Concern | Existing primitive | This doc's stance |
|---------|---------------------|--------------------|
| Encrypted PII (passport, DOB, dietary, accessibility) | `booking_traveler_travel_details` with `KmsEnvelope` columns (`identityEncrypted`, `dietaryEncrypted`, `accessibilityEncrypted`) — `packages/bookings/src/schema/travel-details.ts` | **Reuse.** Per-traveler document fields collected in the Travelers step flow through this envelope; no parallel `bookingTravelers.documents jsonb`. The Travelers step's *transient* draft state may carry plaintext during the journey, but authorized settlement encrypts it. |
| Tax-regime catalog (jurisdiction × rate) | `tax_regimes` table — `packages/finance/src/schema.ts` | **Reuse.** New `tax_classes` (this doc, §9) carries the per-product tax-treatment decision and *resolves to* a `tax_regimes` row at quote time. They stack, not overlap. |
| Per-occupancy pricing for cruises | `cruise_prices.occupancy` column + `cruisePrices` table — `packages/cruises/src/schema-pricing.ts` | **Reuse for cruises.** The new `product_pax_pricing_tiers` (§9) is for non-cruise verticals that need single-supplement / triple-share. Cruises keep their specialized table; the engine reads from the right place per vertical. |
| Payment-collection UI (saved cards, new card, processor flow) | Finance React checkout UI's `PaymentStep` — `packages/finance-react/src/checkout-components/payment-step.tsx` | **Compose.** The journey's "Payment" step picks **intent + schedule** (hold vs card vs ticket-on-credit; deposit vs full vs split) — that's a journey concern. Actual provider mechanics (Netopia tokenization, Stripe Elements, etc.) hand off to Finance React checkout UI after authorized booking settlement. The journey shell does not introduce a new payment-provider seam. |
| Quantity-tier pricing (more units → cheaper per-unit) | `option_unit_tiers` — `packages/commerce/src/pricing/schema-option-rules.ts` | **Reuse.** Quantity tiers are an orthogonal axis to per-occupancy tiers; the engine consults both when pricing an option. |
| Snapshot graph | `booking_catalog_snapshot` + `captureSnapshot` / `captureSnapshotGraph` — `packages/catalog/src/services/snapshot-service.ts` | **Reuse.** Snapshot capture cannot create a booking row. |
| Atomic booking creation | admitted Finance command + lease-gated Bookings settlement | **Single authority.** Vertical handlers quote and hold only; they do not expose a second commit bridge. ADR-0019 requires owned Commit to validate exact Session revision, Quote, live Hold, and payment guarantee before creating Booking and Allocation in one transaction. |
| Public booking sessions (existing model) | `booking_session_states` keyed by an existing `booking_id` - `packages/bookings/src/schema-operations.ts`. Public routes read/update/reprice/confirm/expire that existing session. | **Legacy sibling, not v1 replacement.** V1 Booking Session initialization does not create a booking. The journey's `booking_drafts` (§5.7) is pre-booking state that may *never* be consumed (abandonment is the common case). |

The rule of thumb: if a reasonable read of "I need X" finds an existing primitive in the table above, the new code uses it. Adding a parallel primitive needs a one-paragraph justification in this doc.

### 0.8. Canonical Booking Session access and retention

The v1 `booking_sessions` aggregate is the authoritative pre-Booking journey
record. Its identifier is only a locator and never an access credential.

- An anonymous caller creates and resumes a Session with a client-generated,
  256-bit capability sent in the
  `Voyant-Booking-Session-Capability` header. The database stores only its hash
  and an explicit action-scope list. Cookies and URL parameters are not accepted
  capability transports.
- Customer authentication and Session capability proof are independent. An
  authenticated customer adopts an anonymous Session in place: one locked
  transaction changes ownership, revokes capability access, increments the
  revision, and writes the audit event. It never copies the journey into a
  second aggregate.
- Staff access is not implied by a staff actor alone. Reads and overrides require
  explicit admitted authority with an audit reason; staff reads omit the
  selection payload by default.
- Update, adopt, renew, and abandon require the exact current revision. Renewal
  is bounded by extension and absolute-lifetime policies and explicitly
  supersedes Quotes and releases Holds; it never extends their authority.
- Expiry and abandonment synchronously fence Commit and release live Holds in
  the same PostgreSQL transaction. Purge later removes the selection payload and
  anonymous capability material while retaining non-sensitive lifecycle audit
  metadata. A required, non-overlapping Node job expires due Sessions and purges
  terminal payloads in bounded batches after a 30-day default retention window;
  deployments may shorten or lengthen that policy explicitly with
  `BOOKING_SESSION_TERMINAL_RETENTION_DAYS`. Passport-class data remains outside
  the Session payload and enters
  the established encrypted post-Commit travel-details path.

These invariants run on the transaction-capable Node/PostgreSQL authority
described in `deployment-targets.md`. Only contracts, SDK helpers, and React
hooks are browser/edge-portable.

### 0.9. Bespoke Proposal entry into the canonical journey

Proposal and Proposal Version remain bespoke sales concepts. Once a customer
accepts a version backed by a frozen Trip Snapshot, acceptance and Booking
Session creation occur in the same PostgreSQL transaction. Replaying acceptance
identifies the same Session. The Session records Proposal provenance, but the
accepted Proposal amount is not silently promoted into a Booking Quote.

The first Quote after acceptance refreshes every Catalog-backed component using
the same leaf engine used by public single-item and staff booking journeys.
Manual lines keep the accepted amount only as an explicitly labeled manual
pricing authority. Material commercial drift requires renewed acceptance;
availability failure requires a new selection. When commercial terms are
unchanged, the existing acceptance remains sufficient.

Commit may produce several Component Bookings under the one Trip Envelope. It
can also stop at an explicit partial state when a supplier is pending, in doubt,
or needs manual confirmation. Continuation uses the same Session and Commit key,
does not recreate confirmed components, and consumes the aggregate Session only
when every component commitment is complete. Public Proposal acceptance,
authenticated staff continuation, and reference-client status reads are route
adapters over this one workflow rather than separate booking implementations.

## 1. What's already in place

A short inventory so we don't reinvent (full survey lives in the agent reports cited in the PR description):

- **`packages/bookings/`** — `bookings`, `bookingTravelers`, `bookingItems`, `bookingAllocations`, `bookingGroups` schemas. Booking states: `draft`/`on_hold`/`confirmed`/`in_progress`/`completed`/`expired`/`cancelled`.
- **`packages/bookings-react/`** — composable sections: `ProductPickerSection`, `RoomsStepperSection`, `PersonPickerSection`, `PassengersSection`, `PaymentScheduleSection`, `SharedRoomSection`, `TravelCreditPickerSection`, `PriceBreakdownSection`. Each carries a `value` / `onChange` contract, parent owns state.
- **`packages/operations/src/availability/`** — `availabilitySlots`, `useSlots`, `useSlotUnitAvailability`. Departure pickers for date / time / slot.
- **`packages/commerce/src/pricing/`** — per-unit tier matching, `optionPriceRules` and `optionUnitPriceRules`. No unified `computeTotal()` exists yet.
- **`packages/bookings/src/requirements/`** — `productContactRequirements`, `bookingQuestions`. Per-product per-field booking requirements (passport, dietary, etc.) with `scope` (booking/lead/traveler/booker), `isRequired`, `perTraveler`. **This is the canonical source of "what fields to collect" — the wizard reads from it.**
- **Booking and Inventory extras owner paths** — Extras schema (selection types, pricing modes). The journey has a generic Extras step; vertical handlers still need richer commit wiring for selected Extras.
- **Accommodation resale / trip composition** — stay-item shape (check-in/out, room option, occupancy, daily rates) for sourced accommodation or package components. Hotel/property operations are outside the booking journey scope.
- **`packages/finance/`** — tax regimes, Travel Credit redemption, checkout collection primitives. Product quote tax is wired through the operator starter's quote transform; broader per-line tax class support remains a handler-deepening task.
- **`bookingsCreateExtension`** — `POST /v1/admin/bookings/create`. One-shot atomic transaction creating booking + travelers + payment schedules + Travel Credit redemption + group membership. The products owned handler uses it as a bridge where the draft shape fits.
- **`packages/catalog/src/booking-engine/`** — `quoteEntity`, `bookEntity`, `cancelEntity`, `SourceAdapterRegistry`, `OwnedBookingHandlerRegistry`, `catalog_quotes`, `booking_drafts`, route factories, and V1 contracts. Dispatches sourced rows through adapters and owned rows through registered handlers.

Remaining execution gaps are narrower than the original proposal:

- Broaden the products handler beyond the current booking-create bridge where Extras, encrypted travel details, and richer tax/snapshot semantics need first-class commit support.
- Replace best-effort accommodation and cruise hold tokens with supplier/room/cabin inventory locks where the upstream or vertical inventory model supports them.
- Make sourced soft-hold release a real `SourceAdapter` primitive; the reaper can read grace periods today but cannot release a sourced pre-booking hold without overloading cancel.
- Keep moving starter-local checkout-start behavior into reusable framework services before a generic composer package depends on it.
- Harden browser and contract tests around both admin and public journey wrappers.

## 2. Patterns we've validated elsewhere

We've shipped production booking engines in adjacent codebases that we control. Without naming them, four shape decisions from those projects have proven to work in the real world and we're adopting them here:

- **Linear wizard with conditional steps**, not a single mega-form. Steps you don't need are visually skipped, not hidden mid-form.
- **Per-passenger `dateOfBirth` and document fields collected inline** at the passengers step — not deferred to a "documents" step. ID/passport requirements come from the product config; the form widens accordingly.
- **Live pricing on every input change**, with the total shown in a sticky footer. The pricing endpoint is the source of truth — the client never computes its own total.
- **Session-bound hold**: when the journey starts, the engine reserves inventory; if the user abandons or expires, the hold drops.

We're **not** adopting:

- Astro / Payload split. We stay on TanStack Start + Hono + drizzle.
- Form state via local React Context with manual serialization. We use a single source-of-truth `BookingDraft` object held at the journey root, shared with sub-steps via render props or context as suits the codebase.
- **Per-step booking creation.** Draft PUTs and hold calls are pre-booking
  state changes only. They never insert a booking; creation is a separate
  admitted Finance command.

## 3. Step model

The wizard renders only the steps the product's `BookingDraftShape` says are relevant. **Every step is optional in principle** — the descriptor controls visibility. A walking tour might use steps 1, 3, 6, 7. A 14-day cruise uses all of them, with sub-steps inside §1 and §4.

```
1. Configure        ← departure / date+time / pax bands / variant
                      sub-steps may include: cabin category → cabin number
                      (cruises), date-range + occupancy (hotels)
2. Billing          ← lead contact + B2C/B2B + address + VAT
3. Travelers        ← per-passenger fields incl. DOB + documents
4. Accommodation    ← rooms / occupancy assignment / shared-room
                      OR pre/post-cruise Extensions (cruises)
5. Extras           ← Extras catalog with stepper. Per-port excursions
                      (cruises) render here as a grouped sub-section.
6. Payment          ← payment intent + schedule (deposit / full / split)
                      includes insurance offer for verticals that ship one
7. Review & confirm ← final price recap + commit
```

Side panel (always visible, not a step) holds the live `PriceBreakdownSection` with line items + taxes + total. On wide screens it floats right; on narrow it collapses to the sticky footer.

Step navigation is linear with a stepper header — you can go back to any visited step, forward only one at a time and only when current-step validation passes. Step 7 is non-skippable; the Confirm button lives there, not in the footer's primary action.

### 3.1. Sub-steps and per-vertical composition

Within a single wizard step, **sub-steps** absorb vertical-specific complexity without bloating the top-level navigation. Sub-steps are inline (no route change), validated as a unit, and reflected in the side-panel pricing as they're filled in:

- **Configure (cruises)** — pick category (Inside / Oceanview / Balcony / Suite) → pick a specific cabin number from the available pool → confirm guest count. Two-level selection because category drives pricing, cabin number drives inventory hold.
- **Configure (hotels)** — date range + occupancy upfront, then the Accommodation step drills into specific room types within that property. The descriptor decides where the date picker sits.
- **Accommodation (cruises)** — pre/post-cruise Extensions are picked here (one pre, one post; per-pax pricing by default). A Cruise Extension catalog definition can be linked to multiple cruises/sailings; the selected extension line follows the lifecycle rule: nested when cruise-owned, split when independently supplied/cancellable.
- **Extras (cruises)** — per-port excursions render as a grouped list (`groupBy: "port"`) with a per-guest selection toggle so guest 1 can take a beach day while guest 2 takes a museum tour. Insurance offer also slots in here for verticals that ship one (it's just an Extra with `kind: "insurance"`).

Terminology note: **Extra** is the canonical domain term. Existing V1 contracts
and components still expose names such as `addonGroups`, `showsAddons`,
`addons`, `AddonOffer`, and `AddonsStep`; treat those as compatibility names
until a planned API migration is worth the churn.

The descriptor encodes which sub-steps to render, never the wizard:

```ts
interface BookingDraftShape {
  // ...
  configureSubSteps?: ReadonlyArray<
    | { kind: "departure"; required: true }
    | { kind: "cabin-category"; categories: ReadonlyArray<CabinCategory> }
    | { kind: "cabin-number"; perCategory: Record<string, CabinNumberOption[]> }
    | { kind: "date-range"; minNights: number; maxNights: number }
    | { kind: "occupancy"; bands: PaxBandSpec[] }
  >
  accommodationSubSteps?: ReadonlyArray<
    | { kind: "rooms"; options: RoomOption[]; sharedRoomAllowed: boolean }
    | { kind: "extensions"; options: ExtensionOption[]; allowsPre: boolean; allowsPost: boolean }
  >
  addonGroups?: ReadonlyArray<{
    kind: "extras" | "excursions" | "insurance"
    label: string
    groupBy?: "port" | "day" | undefined
    perGuestSelection: boolean
    items: AddonOffer[]
  }>
}
```

This keeps the wizard shell thin: it loops over sub-steps and renders the right component per `kind`. Adding a new sub-step kind is a one-place change in the descriptor + one component in the shell, not a fork in the navigation logic.

## 4. Source of truth: the `BookingDraft` and its shape

Two distinct shapes, both lifted out of any sub-step:

```ts
interface BookingDraftShape {
  // Each flag controls whether the corresponding wizard step renders.
  // Returned as part of the quote response — the engine knows the shape
  // because it has the product / sourced row in front of it.
  showsConfigure: boolean
  showsBilling: boolean       // always true today; future: SSO / saved billing skips
  showsTravelers: boolean     // false only for non-named-passenger products (rare)
  showsAccommodation: boolean // true for stay-attached products, multi-day tours w/ rooms
  showsAddons: boolean        // true when extras catalog is non-empty
  showsPayment: boolean       // false only when paymentIntent is locked upstream
  showsReview: true           // always

  paxBands: ReadonlyArray<{
    code: "adult" | "child" | "infant"     // future: senior, student, etc.
    label: string
    minAge?: number
    maxAge?: number
    minCount: number
    maxCount: number
  }>
  paxBandsAllowedTotal: { min: number; max: number }

  // Per-traveler field requirements. Drives PassengersSection's columns.
  travelerFields: ReadonlyArray<TravelerFieldRequirement>
  // Lead-only fields appended to the billing step (e.g. company VAT for B2B).
  bookingFields: ReadonlyArray<BookingFieldRequirement>

  accommodation?: {
    roomOptions: ReadonlyArray<RoomOption>
    sharedRoomAllowed: boolean
  }

  addons?: { catalog: ReadonlyArray<AddonOffer> }

  paymentIntents: ReadonlyArray<"hold" | "card" | "ticket_on_credit">
}

interface BookingDraft {
  // What's being booked — populated from the catalog row and never mutated by the wizard.
  entity: { module: string; id: string; sourceKind: string; sourceRef?: string }

  // Step 1 — Configure
  configure: {
    departureSlotId?: string
    departureDate?: string  // ISO yyyy-MM-dd
    departureTime?: string  // ISO HH:mm
    pax: Record<"adult" | "child" | "infant", number>  // counts per band
    variantId?: string  // e.g. cruise cabin class, charter package tier
  }

  // Step 2 — Billing
  billing: {
    buyerType: "B2C" | "B2B"
    contact: { firstName: string; lastName: string; email: string; phone?: string }
    address: { line1?: string; line2?: string; city?: string; postal?: string; country?: string }
    company?: { name: string; vatId?: string; registrationNumber?: string }
    saveAsDefault?: boolean
  }

  // Step 3 — Travelers
  travelers: ReadonlyArray<TravelerEntry>

  // Step 4 — Accommodation
  accommodation?: {
    rooms: ReadonlyArray<{ optionUnitId: string; quantity: number }>
    travelerAssignments: Record<string /* travelerRowId */, string /* roomUnitId */>
    sharedRoom?: { mode: "create" | "join"; groupId?: string; label?: string }
  }

  // Step 5 — Add-ons
  addons: ReadonlyArray<{ extraId: string; quantity: number }>

  // Step 6 — Payment
  payment: {
    intent: "hold" | "card" | "ticket_on_credit"
    schedule: PaymentScheduleValue  // re-uses bookings-ui's existing shape
  }

  // Optional cross-step
  travelCreditRedemption?: { travelCreditId: string; amountCents: number }
  promotionCode?: string
  internalNotes?: string

  // Engine-controlled — written when /quote returns
  quoteId?: string
  quoteExpiresAt?: string
  pricing?: PricingBreakdown
}
```

`TravelerEntry` widens beyond what `PassengersSection` carries today — it gets `dateOfBirth`, `band` ("adult" / "child" / "infant"), and an open-shape `documents` map (passport, national ID, dietary, accessibility) populated according to `BookingDraftShape.travelerFields[]`.

Admin booking-create keeps the same invariant even while it still renders as a
single dialog:

- traveler age/pricing band, sellable option unit, room/accommodation
  assignment, and explicit "no room" intent are separate draft concepts;
- preview totals and submit payloads must be derived from the same draft
  resolver (`@voyant-travel/bookings/pricing-assignment` → `resolveBookingDraft`);
- item and extra line applicability is persisted through
  `booking_item_travelers`, not inferred later from display labels or raw
  traveler counts.

See voyant-travel/voyant#1267 for the implementation history.

## 4.5. Pricing tiers — single supplement, triple share

Cruises (and to a lesser extent stays / multi-pax tours) price per-pax with explicit per-occupancy tiers. Real-world cruise systems treat this as a fundamental shape, not an afterthought:

```ts
interface CabinTypePricing {
  single_price_pp:  number   // 1 guest in cabin → higher per-pax rate
  double_price_pp:  number   // 2 guests → lower per-pax rate (the "default")
  triple_price_pp?: number   // 3 guests → fold-down third bed
  quad_price_pp?:   number   // 4 guests → uncommon, suite-class
  promo_*_pp?:      number   // promotional override per tier
  taxes:            number   // fixed, applied per pax regardless of tier
  taxes_text?:      string   // e.g. "Port charges + onboard gratuities"
}
```

The engine selects the tier based on `configure.pax` total per cabin, not by computing a "supplement" delta. The pricing breakdown's `lines[]` carries the tier label so the user can see *why* the per-pax rate is higher for a single occupant.

For owned products that don't have explicit tiers, the engine falls back to a single rate. The shape is the same; tiers are an opt-in axis the descriptor can populate.

## 5. Live pricing & taxes

Every meaningful state change debounces a `POST /v1/admin/catalog/quote` call (debounce: ~250ms). The `quoteEntity` request body now carries the full `BookingDraft` (minus `quoteId`) so the engine can compute pricing from the actual selection — pax counts, age bands, Extras, accommodation, billing country (for VAT), departure (for seasonal pricing).

The response carries:

```ts
interface PricingBreakdown {
  currency: string
  lines: ReadonlyArray<{
    kind: "base" | "addon" | "accommodation" | "supplement" | "discount" | "fee"
    label: string
    quantity?: number
    unitAmount: number   // cents
    totalAmount: number  // cents (quantity × unitAmount, after discounts)
    taxIncluded?: boolean
  }>
  taxes: ReadonlyArray<{
    code: string         // e.g. "vat-ro-19"
    label: string
    rate: number         // 0..1
    amount: number       // cents
    base: number         // cents, the line subtotal the tax applies to
  }>
  subtotal: number       // cents (sum of lines, pre-tax)
  taxTotal: number       // cents
  total: number          // cents (subtotal + taxTotal)
  // Optional structured pre-tax / tax columns for the snapshot row.
  basis?: PricingBasis
}
```

**Tax computation lives inside the engine, not the client.** The owned arm consults:

1. The product's tax class (a new column / lookup on `products` — see §9).
2. The supplier's tax behavior (e.g. Art. 311 margin scheme already present in `packages/finance/`).
3. The market's tax regime keyed off `billing.address.country` + `billing.buyerType`.

The sourced arm trusts the adapter — it returns `taxes[]` already broken down by jurisdiction. The engine normalizes both shapes into the same `PricingBreakdown`.

A quote always carries an `expiresAt` (default 10 min). Today, Confirm validates that the selected quote exists, is unexpired, and matches the entity before commit. A final re-quote-and-drift threshold (`QUOTE_DRIFT`) remains a hardening task for high-volatility sources.

### 5.7. Resumable drafts and the hold lifecycle

Cruise (and complex tour) bookings span minutes-to-hours of operator effort: contacting the lead, collecting passport scans, proposing alternatives. Two production systems we've shipped have converged on the same contract worth adopting — one materializes the booking row at step 1 and mutates it through subsequent steps, the other carries an explicit `booking-sessions` row with `expiresAt`. Both share the load-bearing idea:

> Every meaningful journey has server-side draft state and, where needed, a
> hold. The draft survives refresh, tab loss, and short walk-aways. It does not
> itself create a booking.

We introduce `booking_drafts`:

```sql
booking_drafts
  id                  text pk        -- typeid: bdrf
  entity_module       text not null
  entity_id           text not null
  source_kind         text not null
  source_connection_id text
  source_ref          text
  draft_payload       jsonb not null -- the full BookingDraft minus pricing
  current_step        text           -- "configure" | "billing" | ... | "review"
  current_quote_id    text           -- fk-by-text into catalog_quotes
  hold_expires_at     timestamptz    -- adapter-driven; null when no hold
  consumed_booking_id text           -- set on successful commit
  created_at          timestamptz
  updated_at          timestamptz
  expires_at          timestamptz    -- session abandonment ttl, default 24h
  created_by          text           -- staff user or anonymous session token
```

The wizard PUTs to `/v1/{admin,public}/catalog/drafts/:id` on every step transition. It places or refreshes a hold through `/v1/{admin,public}/catalog/holds/place` once the user advances past Configure with enough inventory-specific input. For owned products, the current real lock is `availability_holds`, which decrements `availability_slots.remainingPax` and is tied to the `booking_drafts` row. Products, accommodations, and cruises all expose the handler methods; only products currently lock real capacity. For sourced rows, the route surface exists but sourced hold release remains a contract gap: the reaper can honor `AdapterCapabilities.holdReleaseGraceMs`, but it no-ops release because `SourceAdapter` still has no hold-only release method.

Quote and hold routes may accept a `draftId`. They load
`booking_drafts.current_quote_id` and thread the draft payload into the
provider-neutral pricing/hold operation. Booking creation is not part of this
route family. A caller may stamp `consumed_booking_id` only after the admitted
Finance command returns the canonical booking reference.

Drafts older than `expires_at` are reaped by the operator starter's hourly scheduled job (`apps/operator/src/api/draft-reaper-scheduled.ts`); their owned holds are released first. Orphaned drafts (where the hold expired but the draft didn't) remain a recovery-surface gap rather than a shipped operator view.

This split — **`catalog_quotes` for the live-pricing snapshot, `booking_drafts` for the session-bound hold** — is implemented. Quotes are short-lived and engine-internal; drafts are user-facing and resumable.

## 6. Owned-arm dispatch

The catalog booking engine has an owned arm via an **injected handler registry**, not by having `packages/catalog` import every vertical directly. This mirrors the existing `SourceAdapterRegistry` pattern and keeps the catalog package light:

```ts
// packages/catalog/src/booking-engine/owned-handler.ts

export interface OwnedBookingHandler {
  /** Vertical this handler claims. One handler per entity_module. */
  readonly entityModule: string

  /**
   * Live-quote an owned row for a draft. Engine calls this on every
   * meaningful input change. Returns shape + pricing + availability.
   */
  computeQuote(ctx: OwnedHandlerContext, request: ComputeQuoteRequest): Promise<ComputeQuoteResult>

  /** Optional: place / extend / release a soft hold on the row. */
  placeHold?(ctx: OwnedHandlerContext, request: HoldRequest): Promise<HoldResult>
  extendHold?(ctx: OwnedHandlerContext, holdToken: string): Promise<HoldResult>
  releaseHold?(ctx: OwnedHandlerContext, holdToken: string): Promise<void>
}

export interface OwnedBookingHandlerRegistry {
  register(handler: OwnedBookingHandler): void
  resolveOrThrow(entityModule: string): OwnedBookingHandler
  has(entityModule: string): boolean
  modules(): ReadonlyArray<string>
}
```

The dispatch becomes:

```
quoteEntity({ entity, draft, scope })
  ├── if entity.sourceKind === "owned"
  │     → ownedHandlerRegistry.resolveOrThrow(entity.module).computeQuote(...)
  └── else
        → sourceAdapterRegistry.resolveOrThrow(entity.sourceKind).liveResolve(...)

placeHold({ entity, draft })
  ├── owned:    ownedHandlerRegistry.resolveOrThrow(entity.module).placeHold(...)
  └── sourced:  provider-specific hold operation where supported
```

**Where the handlers live.** Each vertical owns its handler:

- `packages/inventory/src/booking-engine/handler.ts` -> `createProductsBookingHandler({ db })`. Composes Inventory product pricing, availability, and holds.
- Accommodation resale handler -> daily-rate computation and room-option availability for sourced or packaged accommodation. This should not include hotel/property operations.
- `packages/cruises/src/booking-engine/handler.ts` → uses `cruise_prices.occupancy` for tiers, sailing-level holds.
- And so on per vertical.

Templates wire the registry at boot, the same way they wire the `SourceAdapterRegistry`:

```ts
const ownedRegistry = createOwnedBookingHandlerRegistry()
ownedRegistry.register(createProductsBookingHandler({ db }))
ownedRegistry.register(createAccommodationResaleBookingHandler({ db }))
// ... per vertical the deployment uses
```

This inverts the dependency direction: instead of `@voyant-travel/catalog` importing every vertical, each vertical imports the handler interface from `@voyant-travel/catalog/booking-engine` and provides an implementation. Catalog stays a contract package; verticals stay self-contained.

This is now the live dispatch shape. The operator starter registers products,
accommodations, and cruises handlers in
`apps/operator/src/api/lib/booking-engine-runtime.ts`. Products has the
most complete owned path and can bridge to `bookingsCreate` plus real
availability holds. Accommodations and cruises expose the same handler interface
with vertical commit bridges, descriptor builders, and quote/pricing logic;
their supplier-grade hold behavior still needs deeper inventory integration.

## 7. Per-product variation — concrete examples

The same wizard handles each of these by reading the descriptor; no special-case code paths in the UI:

- **Walking tour** (single-day, fixed departure, no rooms, no Extras):
  - `showsAccommodation: false`, `showsAddons: false`
  - `paxBands: [{ code: "adult", min: 1, max: 8 }]`
  - `travelerFields: [{ field: "name", required: true }]` only
  - Steps shown: Configure (date+time pick), Billing, Travelers (just names), Payment, Review.

- **3-day Paris package** with optional rooms and excursions:
  - `showsAccommodation: true`, `accommodation.roomOptions = [single, double, family]`
  - `showsAddons: true`, Extra catalog includes "Eiffel skip-the-line", "champagne welcome"
  - `paxBands: [adult, child]`, `child.maxAge: 11`
  - `travelerFields: [name, dateOfBirth (perTraveler), passport (perTraveler when international)]`
  - Steps shown: all seven.

- **Airport transfer** (origin + destination + pickup time):
  - `showsAccommodation: false`, `showsAddons: false` (or just "child seat" Extra)
  - `bookingFields: [pickupAddress, dropoffAddress, flightNumber]` shown on the Configure step
  - Steps shown: Configure (with extra fields), Billing, Travelers (names), Payment, Review.

- **Hotel-only stay** (check-in / check-out, room type):
  - The "product" is a room type from the accommodations vertical
  - Configure step shows date-range picker + occupancy
  - Accommodation step is folded into Configure (single room type, but with meal-plan / rate-plan picks)
  - `addons` may contain Extras such as "breakfast included" or "spa credit"

- **Sourced (TUI / Voyant Connect)**:
  - The adapter returns a `BookingDraftShape` that mirrors the upstream's expected booking shape.
  - The wizard renders the same way; only the `bookEntity` dispatch differs.

- **Cruise** (the most demanding shape — drives every descriptor field):
  - `configureSubSteps`: `departure` (sailing date) → `cabin-category` (Inside / Oceanview / Balcony / Suite) → `cabin-number` (specific cabin from the available pool) → `occupancy` (1-4 guests, drives the per-pax pricing tier).
  - `paxBands`: adult / child / infant with cruise-line-specific age cutoffs (e.g. infant ≤ 2, child 3-11, adult 12+); pricing is per-band per-tier.
  - `travelerFields`: name, DOB (required), passport (required for international sailings — driven by `productContactRequirements`), preferred name, frequent-cruiser number, gender, nationality.
  - `accommodationSubSteps`: `extensions` with `allowsPre` and `allowsPost` true, options pulled from the cruise line's pre/post-cruise Extension catalog. The same Extension offer may be linked to multiple cruises/sailings. Per-pax pricing.
  - `addonGroups`: an `excursions` group with `groupBy: "port"` and `perGuestSelection: true` (so guest 1 takes a beach day, guest 2 takes a museum tour), plus an `insurance` group with one offer per traveler.
  - Payment intent: cruises typically take a deposit at book and balance closer to sail date — the Payment step shows two scheduled installments.
  - Air arrangements (cruise-line-arranged or independent flights) are NOT modeled here in v1. They live in the flights vertical and would compose as a separate booking line in a v2+ multi-line booking.
  - This shape stresses every axis (sub-steps, pricing tiers, per-port grouped Extras, multi-installment payment). If the descriptor and the wizard handle this cleanly, simpler products fall out for free.

## 8. UI composition: reuse vs. new

| Step | Existing component to reuse | New component / change needed |
|------|------------------------------|-------------------------------|
| Configure | `useSlots`, `useSlotUnitAvailability` from `@voyant-travel/operations-react/availability` | New `DepartureStep` (date + time + variant + pax bands) |
| Billing | `PersonPickerSection` (CRM picker pattern) | New `BillingStep` with B2C/B2B toggle, address, VAT — generalize beyond the existing PersonPicker |
| Travelers | `PassengersSection` | Widen with `dateOfBirth`, `band`, `documents` driven by `travelerFields[]` |
| Accommodation | `RoomsStepperSection`, `SharedRoomSection` | Compose into a single `AccommodationStep` |
| Extras | — | New `AddonsStep` with quantity stepper per Extra (per-pax / per-booking semantics); component name is legacy-compatible |
| Payment | `PaymentScheduleSection` (intent + schedule shape) + **compose Finance React checkout UI's `PaymentStep`** (provider mechanics) | Thin wrapper that picks intent/schedule, then mounts Finance React checkout UI's `PaymentStep` at commit transition. No new provider seam in the journey shell. |
| Review | — | New `ReviewStep` showing the full draft + final pricing |
| Side panel | `PriceBreakdownSection` | Adapt to consume the new `PricingBreakdown` shape |

The wizard shell itself (`<BookingJourney />`) is new — a route component at `/catalog/book/$entityModule/$entityId` (operator) and `/book/$entityModule/$entityId` (customer storefront, future). Step navigation, validation, draft persistence (URL + sessionStorage), and quote orchestration live there.

### 8.1. Package layout — share by default

Per Rule 4 (§overview), every piece of the journey except the wired-up route component lives in a publishable package and is consumed identically by every surface (operator dashboard, customer storefront, partner portal, embedded widgets). New code lands in packages; templates wire it. **No journey logic in template src/ directories.**

| Concern | Package | New / Existing |
|---------|---------|----------------|
| Engine endpoints + types (`POST /quote`, draft/hold routes, `BookingDraftShape`, `PricingBreakdown`) | `@voyant-travel/catalog/booking-engine` | Existing — extend |
| React hooks (`useBookingDraft`, `useBookingQuote`, `useBookingDraftShape`, `useBookingHold`) | `@voyant-travel/catalog-react/booking-engine` *(new sub-path)* | New |
| Wizard shell (`<BookingJourney />`, step navigation, sticky footer, draft persistence) | `@voyant-travel/bookings-react/journey` | **New** — the missing piece. Modeled on `@voyant-travel/flights-react/ui`'s `FlightBookingShell`. |
| Step section components (Configure, Billing, Travelers, Accommodation, Add-ons, Payment, Review) | `@voyant-travel/bookings-react/journey` | New, with renderers per sub-step `kind` |
| Reusable form sections that pre-date the journey | `@voyant-travel/bookings-react/ui` (PassengersSection, PaymentScheduleSection, RoomsStepperSection, SharedRoomSection, VoucherPickerSection, PriceBreakdownSection) | Existing — widen as §8 table notes |
| Owned-handler interface + registry (`OwnedBookingHandler`, `OwnedBookingHandlerRegistry`) | `@voyant-travel/catalog/booking-engine` | New (interface only — no vertical imports) |
| Per-vertical owned handlers (e.g. `createProductsBookingHandler`) | each vertical's `<vertical>/src/booking-engine/handler.ts` | New per vertical, lands incrementally per phase |
| Adapter contract bits not already in `SourceAdapter` (`describeShape`, hold metadata) | `@voyant-travel/catalog/adapter` | Existing — extend |
| Per-vertical descriptor builders (e.g. cruise-specific shape construction) | each vertical's `service-catalog-plane.ts` (cruises, products, accommodations, etc.) | Existing — extend |
| Standalone upstream contract fixture | `apps/catalog-demo-api` | Existing; not part of the product graph |

#### Slot injection — the seam between operator and storefront

The wizard shell takes render-prop slots for the bits that legitimately differ between surfaces. The shell never branches on "am I in operator or storefront" — it just calls the slot the consumer passed:

```tsx
<BookingJourney
  entityModule={...}
  entityId={...}
  // Operator: pulls from CRM. Storefront: bare inline form.
  renderLeadContactPicker={(apply) => <CrmPersonPicker apply={apply} />}
  renderTravelerContactPicker={(apply) => <CrmPersonPicker apply={apply} />}
  // Operator: B2B default with VAT lookup. Storefront: B2C default.
  defaultBuyerType="B2B"
  // Operator: "Send confirmation to customer". Storefront: hand off to checkout/payment.
  onCommitted={(booking) => navigate({ to: "/orders/catalog" })}
  // Optional: payment-provider mechanics live in Finance React checkout UI. The
  // journey hands the chosen intent + schedule to Finance React checkout UI's
  // PaymentStep at commit time; the slot below lets the template pass
  // a pre-configured PaymentStep with its capabilities + saved methods.
  renderPaymentProviderStep={(intent, schedule, capabilities) => (
    <CheckoutPaymentStep value={...} onChange={...} capabilities={capabilities} />
  )}
/>
```

Slots are render-props (function children), not config flags. New slots are added to the prop type as `optional` so existing callers don't break. The shell renders a sensible default when a slot is absent — e.g. a plain inline `<Input>` for the contact pickers when no `renderLeadContactPicker` is passed (which is the storefront's default).

#### What Starters Own

Starters wire the shell, the auth posture, the route tree, the API base URL, and the slot implementations. The operator starter already wires both admin and storefront-flavored wrappers:

```
operator (admin):
  apps/operator/src/routes/_workspace/catalog_.book.$entityModule.$entityId.tsx
  apps/operator/src/components/voyant/catalog/operator-booking-journey.tsx
    → wraps <BookingJourney /> with operator slots:
      - apiBase: getApiUrl()  → /v1/admin/...
      - renderLeadContactPicker: CRM-backed PersonPicker
      - defaultBuyerType: "B2B"
      - onCommitted: navigate to /orders/catalog
      - renderPaymentProviderStep: composes Finance React checkout UI's PaymentStep
        with operator capabilities + Netopia (when configured)

storefront (customer):
  apps/storefront/src/routes/book/$entityModule/$entityId.tsx
  apps/storefront/src/components/voyant/catalog/storefront-booking-journey.tsx
    → wraps <BookingJourney /> with storefront slots:
      - apiBase: storefront's public-base URL → /v1/public/...
      - renderLeadContactPicker: omitted (default = inline contact form)
                                 OR a "Sign in to use saved details" stub
                                 that swaps to CRM picker on auth
      - defaultBuyerType: "B2C"
      - onCommitted: navigate to /confirmation/$bookingId
      - renderPaymentProviderStep: composes Finance React checkout UI's PaymentStep
        with the storefront's payment-provider capabilities
```

Same shell, same hooks, same engine — different chrome. **Adding a new template (a partner portal, a white-label embed) is a single wiring file plus its own auth.**

## 8.5. Versioned engine contracts

The current package exports explicit V1 contracts as Zod schemas from
`@voyant-travel/catalog/booking-engine`. The engine service functions still accept
the lower-level `QuoteEntityRequest` / `BookEntityRequest` shapes internally,
but the shared route module and React hooks speak the V1 HTTP contract:

```ts
// Names suffixed with V1 — bumped in lockstep when fields drift in
// breaking ways. Adapters and handlers declare which version they
// speak via a capability flag.

const QuoteRequestV1 = z.object({
  entityModule: z.string(),
  entityId: z.string(),
  sourceKind: z.string(),
  sourceRef: z.string().optional(),
  scope: z.object({
    locale: z.string(),
    audience: z.enum(["staff", "customer", "partner", "supplier"]),
    market: z.string(),
    currency: z.string().optional(),
  }),
  draft: BookingDraftV1.optional(),  // present once the journey has data; quote echoes shape
  ttlMs: z.number().int().positive().optional(),
  // Engine-injected; adapters / handlers don't see this.
  adapterContext: SourceAdapterContextV1,
})

const QuoteResponseV1 = z.object({
  quoteId: z.string(),
  quotedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  available: z.boolean(),
  invalidReason: z.string().optional(),
  shape: BookingDraftShapeV1.optional(),  // engine fills in for owned; adapter returns for sourced
  pricing: PricingBreakdownV1.optional(),
  upstreamPayload: z.record(z.string(), z.unknown()).optional(),
})

const BookRequestV1 = z.object({
  // Either-or: a quoteId for the single-shot flow, or a draftId for
  // the draft-first journey. The route resolves the most recent
  // quote off the draft before calling bookEntity.
  quoteId: z.string().optional(),
  draftId: z.string().optional(),
  bookingId: z.string().optional(),  // existing or newly-created bookings row
  party: PartyV1.optional(),
  paymentIntent: PaymentIntentV1.optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  // Idempotency — same key in 24h returns the existing booking.
  idempotencyKey: z.string().min(8).max(128).optional(),
  adapterContext: SourceAdapterContextV1,
}).refine((v) => v.quoteId || v.draftId, {
  message: "either quoteId or draftId must be provided",
})

const BookResponseV1 = z.object({
  bookingId: z.string(),
  orderRef: z.string(),
  status: z.enum(["held", "confirmed", "ticketed", "failed"]),
  snapshotId: z.string(),
  pricing: PricingBreakdownV1.optional(),
  upstreamPayload: z.record(z.string(), z.unknown()).optional(),
})

// Hold lifecycle as separate operations — earlier drafts buried this
// inside reserve/cancel; making it explicit lets adapters expose
// extend semantics without faking a full reserve.
const HoldExtendRequestV1 = z.object({ holdToken: z.string() })
const HoldReleaseRequestV1 = z.object({ holdToken: z.string() })
```

The package exports `ENGINE_CONTRACT_V1` and V1 schemas as the current public wire contract. Runtime capability negotiation for V2 is not implemented yet; when V2 lands, add explicit adapter/handler version declaration and keep V1 callable for one full minor-version cycle of every vertical that adopted it.

**Why this matters now.** The journey shell typechecks against the response
shape; multiple adapters and owned handlers agree on what "available" means;
the composer needs the same contract to call N journeys' worth of quotes. V1
is the execution contract until a concrete V2 migration is opened.

## 9. Schema additions

Each addition is justified against §0.7's reuse table — the question we
answered for each is "why not extend an existing primitive?". Where extending
was simpler, we did. Implementation notes below reflect the current codebase,
not just the original proposal.

1. **`products.tax_class_id`** — text reference to a `tax_classes` row. Drives the engine's tax computation for owned products. (Default `null` → falls through to a market-level default.) **Why new:** today there is no per-product link from `products` to `tax_regimes`; tax is computed only at invoice time.
2. **`tax_classes`** — `{ id, code, label, default_regime_id, lines: [{ regime_id, applies_to: "base"|"extra"|"all" }] }`. Lives in `packages/finance/`. **Why not extend `tax_regimes`:** `tax_regimes` is the jurisdictional rate catalog (RO 19% VAT, EU rates, etc.) and stays as-is. `tax_classes` is the *per-product treatment decision* — "this product applies the standard VAT regime; that one is exempt under Art. 311 margin scheme; the third applies a reduced regime in DE only." A product points at a class; the class points at a regime row keyed off buyer country. The two stack.
3. **`booking_drafts`** — shipped in `packages/catalog/src/booking-engine/drafts-schema.ts`; see §5.7. **Why not extend `booking_session_states`:** the existing model is keyed by an existing `booking_id` (it wraps a materialized booking). The journey needs a *pre-booking-row* hold so abandoned drafts don't litter `bookings`.
4. **`product_extra_offers` view** — convenience view over Inventory extras + `option_extra_configs` that the engine queries to populate `BookingDraftShape.addonGroups`. View, not a table; no source-of-truth change. If an older implementation creates `product_addon_offers`, keep it as a legacy alias rather than the canonical name.
5. **`product_pax_pricing_tiers`** — per-product per-occupancy rate tier table **for non-cruise verticals**. Columns: `product_id`, `option_unit_id`, `tier_pax` (1, 2, 3, 4), `price_per_pax_cents`, `promo_price_per_pax_cents`, `effective_from`, `effective_to`. Falls back to `option_unit_tiers` (quantity, not occupancy) when no occupancy tiers exist. **Why not generalize `cruise_prices`:** cruises have specialized columns (`fareCode`, `secondGuestPricePerPerson`, `singleSupplementPercent`) the rest of the catalog doesn't need. Cruises keep `cruise_prices`; the engine reads from `cruise_prices` for cruise rows and `product_pax_pricing_tiers` for everyone else. The handler dispatches.
6. **`product_excursion_offers`** — for cruise/tour products with per-port excursion catalogs. Columns: `product_id`, `port_facility_id` or `day_number`, `excursion_extra_id` (fk into Inventory extras so we don't fork the Extras model), `pricing_kind`, `availability_kind`. Lets the descriptor's `addonGroups` carry a grouped excursion section without a new Extra table.
7. **`availability_holds`** — shipped in `packages/operations/src/availability/schema.ts`. The original doc sketched owned holds as `bookingAllocations`, but allocations require a materialized `booking_id`. Journey holds are pre-booking, so Operations availability owns a dedicated soft-hold table keyed by draft id and slot id. The Inventory owned handler is wired to it; accommodations/cruises still use handler-level placeholder holds until their inventory models expose equivalent locks.

**Removed from earlier drafts (do not add):**

- ~~**`bookingTravelers.documents jsonb`**~~ — would have been a plaintext PII regression. The existing `booking_traveler_travel_details` table holds passport / DOB / dietary / accessibility in `KmsEnvelope` columns (per §0.7). The Travelers step's transient draft state may carry plaintext while the journey is open; the commit path encrypts through the existing service.

**Optional but recommended:**

- **`bookingTravelers.pax_band`** — explicit `"adult" | "child" | "infant"` enum so per-band pricing has a stable join key. Today `travelerCategory` is close but not enforced as the pricing axis.

## 10. Execution state and next slices

The original Phase A-F rollout has mostly landed as foundation work. Treat this
section as the current execution map.

**Done enough to build on:**

- `OwnedBookingHandler` and `OwnedBookingHandlerRegistry` are exported from
  `@voyant-travel/catalog/booking-engine`.
- `createCatalogBookingRoutes()` and `createCatalogBookingApiModule()` are
  exported from `@voyant-travel/catalog/booking-engine`; the operator starter uses
  the shared route factory for the reusable quote/draft/hold family.
- `BookingDraftV1`, `BookingDraftShapeV1`, `QuoteResponseV1`,
  `BookResponseV1`, and `PricingBreakdownV1` are exported as Zod contracts.
- `@voyant-travel/catalog-react/booking-engine` ships `useBookingDraft`,
  `useBookingQuote`, `useBookingDraftShape`, and `useBookingHold`.
- `@voyant-travel/bookings-react/journey` ships `<BookingJourney />`, the step header,
  side panel, and Configure/Billing/Travelers/Accommodation/Add-ons/Payment/
  Review steps.
- Products, accommodations, and cruises all have owned handlers and descriptor
  builders. Products has real `availability_holds`; accommodations and cruises
  need deeper inventory-lock integration.
- The operator starter wires admin and storefront journey wrappers:
  `apps/operator/src/components/voyant/booking-journey/operator-booking-journey.tsx`
  and `apps/operator/src/components/voyant/booking-journey/storefront-booking-journey.tsx`.
- Storefront checkout handoff exists at
  `POST /v1/public/catalog/finance/checkout/start`, but it is still starter-owned.

**Next execution slice 1 — make the single-line journey production-hard:**

- Add focused tests for the shared route module, hooks, and journey shell around
  draft-first booking, idempotency, quote expiry, public/admin path selection,
  and hold place/release.
- Replace remaining route-body parsing in starter-owned catalog order and
  checkout routes with shared `parseJsonBody(...)` / schema validation where
  the route remains local.
- Verify and document which journey entry points are canonical versus legacy
  `BookingCreateDialog` paths, then retire or wrap the dialog intentionally.

**Next execution slice 2 — deepen vertical handlers:**

- Products: commit Extras, descriptor-driven traveler fields, encrypted travel
  details, and quote tax lines through explicit owned-handler inputs instead of
  relying on bridge-friendly subsets.
- Accommodations: quote from actual room/rate-plan inventory, lock room/rate
  availability on hold, and commit selected rate plans without heuristic daily
  rates.
- Cruises: wire real cabin/sailing holds, supplier-specific pax bands,
  per-port excursions, pre/post Cruise Extensions, and two-installment schedules.

**Next execution slice 3 — extract checkout start for composer reuse:**

- Move reusable parts of `POST /v1/public/catalog/finance/checkout/start` out of the
  operator starter into framework-owned checkout/catalog services.
- Keep deployment-specific payment provider configuration, contract template
  choice, CRM Quote creation, and bank-transfer details in templates.
- Expose a callable service the future composer can use without importing
  template code.

**Next execution slice 4 — sourced hold lifecycle:**

- Add a hold-only source-adapter primitive or a clearly named optional method
  so sourced pre-booking holds can be released without overloading post-book
  cancel.
- Persist the actual hold token on `booking_drafts` or in a dedicated hold
  table when adapters return a supplier token different from the draft id.
- Update the draft reaper to release sourced holds through that primitive.

## 11. Non-goals (v1)

- **Multi-line / composed itineraries** (flight + hotel + tour, cruise + air, customer-built routes across verticals). This is explicitly the [trips](./ai-travel-experience-composition.md)'s job, not the journey's. The journey commits ONE bookable component; the composer orchestrates N journeys-worth of quote/hold/book primitives into one customer experience with one consolidated checkout. See §0.5 for the seam. The journey's design (per-line draft, per-line quote, optional Payment step, multi-vertical descriptor) is intentionally non-blocking for the composer; building the composer is a separate body of work.
- **Customer group bookings** beyond shared-room (corporate event, school trip). This is not the same as an operated group departure product. An operated group departure can still be one journey line when the product/departure owns capacity, allocations, included services, and dependent Extras.
- **Loyalty program** integration (frequent-cruiser numbers are stored as a traveler field but don't drive pricing or perks in v1).
- **Partial cancellations** (cancel only some travelers from a booking).
- **Wizard for accommodations direct-from-search** without going through the catalog page. Stage 1 entry point is the Catalog UI's "Book this".
- **Multi-cabin cruise parties** (one booking, two cabins, party split). v1 is single-cabin-per-booking; multi-cabin is a v2 feature that materializes as N drafts under a `bookingGroups` row.
- **Cruise-line-arranged air** (CL-FLIGHT). Air is a separate vertical; v1 cruise bookings don't include flights. Customer adds them as a second booking against the flights vertical.

**Moved out of non-goals — these ARE v1 (specified in sibling docs):**

- ~~**Channel manager push**~~ — promoted to v1. Real deployments integrate with TUI, Voyant Connect peers, OTAs, and similar channels from day one; the journey isn't useful without it. Specified in [`channel-push-architecture.md`](./channel-push-architecture.md). The journey doesn't drive the push (post-commit subscriber territory) but the engine's `bookEntity` commit fires the events that channel push consumes.
- ~~**Rich content for sourced rows**~~ — promoted to v1 prerequisite and now partially implemented through the sourced-content services and template content enricher hooks. The journey's Configure / Accommodation / Add-ons steps still depend on vertical content coverage being present for the selected source.

## 12. Open questions for design / product

Most original questions are resolved by the current foundation. Strikethroughs
record resolved decisions; unstruck items remain execution choices for
vertical hardening or composer work.

1. ~~**Storefront vs. operator-only for v1.**~~ **Resolved:** both surfaces use the same wizard shell, hooks, and sections; differences land in slot implementations per surface (Rule 4 + §8.1).
2. ~~**Where does Configure live for accommodation resale?**~~ **Resolved:** date-range + occupancy stay in the dedicated Configure step on both surfaces (storefront's catalog browser may pre-fill them via search params, but the journey still owns them). Rate-plan and board-basis picks live in the Accommodation step — they're per-room choices that depend on room-option selection, so folding them into Configure would force the storefront catalog filters to also pick a rate plan, which is the wrong granularity. The accommodation descriptor's `RoomOption.ratePlans` is the seam.
3. ~~**Single quote table or split.**~~ **Resolved (§5.7):** keep `catalog_quotes` for the live-pricing snapshot; introduce `booking_drafts` for the resumable session-bound hold. Two tables, two lifetimes.
4. ~~**Per-band pricing rules — adult vs child vs infant — does pricing live with the band declaration, or with the optionUnit row?**~~ **Resolved: band-based is canonical; count-based is a per-band transformation.** The descriptor's `paxBands[]` carries `code` ("adult" / "child" / "infant" / vertical-specific) as the unit of pricing; per-product per-occupancy tables (`product_pax_pricing_tiers`, `cruise_prices`) are read keyed by `(option_unit_id|sailing_id, occupancy_count)` and then *broken down* into per-band charges that the wizard can render in the breakdown.
5. ~~**Validation depth.**~~ **Resolved:** hard reject only on physically-required-to-commit fields (firstName, lastName, pax band totals); everything else is a soft warning surfaced inline above the Next button. The shell's `canAdvanceFromStep` enforces hard rules; `warningsForStep` renders the soft hints. Per-product rules ride on the descriptor's `travelerFields[].required` flag.
6. ~~**Idempotency.**~~ **Resolved:** booking creation idempotency belongs to
   the admitted Finance command and its action-ledger claim. Catalog quote and
   hold routes do not create booking rows.
7. **Cabin number selection — actual deck plan or numbered grid?** A numbered grid is the simpler affordance and what production cruise systems we've shipped converged on; a deck plan (visual) is richer but takes a CMS and SVG assets per ship. v1 should ship the grid; deck plan is a follow-up that's purely a presentation swap (descriptor unchanged).
8. **Per-guest excursion selection vs party-level.** Per-guest selection (each guest can pick different excursions) is what production cruise systems we've shipped use; some cruise lines mandate party-level. The descriptor's `addonGroups[].perGuestSelection` boolean already covers this — but who declares the value? Probably the supplier, surfaced via supplier metadata on the cruise's catalog row.
9. ~~**Hold release semantics.**~~ **Resolved:** immediate release on `expires_at` for v1. The reaper job (`/api/draft-reaper-scheduled` cron) lists expired drafts hourly and calls each handler's `releaseHold`. Per-supplier grace periods are a follow-up that lives on adapter metadata (the contract takes a `releaseHold(token)` method that adapters can implement to delay the upstream release).
10. ~~**Extend `booking_session_states` vs. ship `booking_drafts`.**~~ **Resolved (option B):** `booking_drafts` shipped as a sibling table. `booking_session_states` stays untouched (post-booking-row session lifecycle); `booking_drafts` carries pre-booking-row resumable state. Two tables, two lifetimes.

## 13. Related documents

- [`catalog-architecture.md`](./catalog-architecture.md) — the Phase 1 foundation (provenance, snapshot graph, source-adapter contract).
- [`catalog-booking-engine.md`](./catalog-booking-engine.md) — the cross-vertical lifecycle (quote / book / cancel) the wizard speaks to.
- [`catalog-sourced-content.md`](./catalog-sourced-content.md) — specifies the rich-content layer for sourced rows (itinerary / media / departures / options / terms) so the journey's Configure / Accommodation / Add-ons steps work for sourced rows the way they work for owned products.
- [`channel-push-architecture.md`](./channel-push-architecture.md) — outbound supplier integration. The journey's commit triggers the booking-push subscriber where configured.
- [`catalog-flights-architecture.md`](./catalog-flights-architecture.md) — the flights vertical's specialized booking flow. The wizard described here borrows shape but does not replace it; flights stays special-case.
- [`payments-architecture.md`](./payments-architecture.md) — payment intent + schedule. The Payment step calls into the same primitives.
- [`ai-travel-experience-composition.md`](./ai-travel-experience-composition.md) — the proposed trips module that orchestrates multi-line itineraries. The single-line journey designed here is one of the composer's leaf primitives (§0.5). Don't ship architectural decisions in this doc that block what the composer needs.

### Patterns from systems we've shipped

This doc consolidates patterns we've validated in production booking engines we built and continue to maintain in adjacent codebases. We're not naming the projects here, but the concrete shape decisions were borrowed from:

- A general-purpose travel booking engine (Astro + React + react-hook-form + Zod). Source of: linear wizard with conditional steps, per-passenger DOB + document fields collected inline at the passengers step, live pricing on every input change with sticky-footer total, session-bound inventory hold via a session token.
- A luxury cruise booking engine (Next.js + Zustand + Supabase). Source of: cabin-category → cabin-number two-step selection, per-occupancy pricing tiers (single/double/triple/quad), pre/post-cruise Extensions separate from generic Extras, per-port excursions with per-guest selection, resumable booking-row-as-draft model that informs §5.7's `booking_drafts` design.
# Status: routed creation UI retired

The packaged admin and standard storefront no longer mount the single-line
booking-creation journey described below. Catalog and inventory detail surfaces
are read-only, and the standard storefront has no `/shop/book/...` route.
Booking creation is admitted through the Finance staff Tool. Booking detail,
customer-portal sessions, catalog quote/draft contracts, and reusable draft
sections remain supported where they serve existing bookings or explicit
tool/trip composition.

The remainder of this document is retained as historical design context. Route
and public-shell examples below are not current product authority.
