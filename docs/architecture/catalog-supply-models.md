# Catalog supply models — design

Status: proposed (2026-06-05)
Related: [catalog-architecture.md](./catalog-architecture.md), [catalog-booking-engine.md](./catalog-booking-engine.md), [allocation-resources-lifecycle.md](./allocation-resources-lifecycle.md), [accommodation-resale-boundary.md](./accommodation-resale-boundary.md)

## 1. Why this exists

The catalog conflated two fundamentally different ways inventory is sold, and bolted a
date search onto the *detail sheet* — so an operator had to open a product and *then*
search for a departure. That's backwards, and it papered over a real modelling gap.

There are two **supply mechanics**, and they need different search + booking UX:

- **Dynamic** (e.g. TUI flight+hotel for FITs, bedbanks, dynamic packaging): the unit is
  *composed live* for the customer's dates. Any departure date, duration and occupancy;
  price varies by date (a calendar of prices). No local inventory — priced via a live
  upstream search. *Search-first.*
- **Scheduled** (e.g. Pro Travel groups, escorted tours, cruises, owned series): the unit
  is a **seat in a fixed dated departure** drawn from a finite **allotment**. You browse
  the scheduled departures (date · seats left · price) and reserve seats. *Departures-first.*

Cramming a "pick any date" calendar onto a scheduled group (8 fixed dates, 12 seats left)
is as wrong as forcing a dynamic package into a fixed-departure list.

## 2. Two orthogonal axes

The durable, product-agnostic split is the **mechanic**, not the product type. Keep them
separate:

| Axis | Field | Values | Drives |
| --- | --- | --- | --- |
| **Supply mechanic** | `supplyModel` | `dynamic` \| `scheduled` | search + booking UX; which catalog surface |
| **Category** | `category` (existing `productType`/`categories` taxonomy) | `package`, `tour`, `excursion`, `cruise`, `hotel`, … | merchandising, labels, filters |

Examples (the cases the conflated naming broke):

| Thing | `supplyModel` | `category` |
| --- | --- | --- |
| TUI flight+hotel | `dynamic` | `package` |
| TUI hotel-only | `dynamic` | `hotel` |
| Pro Travel escorted group | `scheduled` | `tour` |
| Fixed-date group excursion | `scheduled` | `excursion` |
| Book-any-date excursion (on request) | `dynamic` | `excursion` |
| Cruise sailing | `scheduled` | `cruise` |

`supplyModel` is **currently derived from `bookingMode`**, not an authored field:
`deriveProductSupplyModel(bookingMode)` maps `open`/`stay` → `dynamic` and
`date`/`date_time`/`transfer`/`itinerary`/`other` → `scheduled`. It is still treated as a
real structural classifier — projected as a `source-only`, `indexed-column` field
(facetable) — but one source of truth computes it, so it can't drift from the booking
mechanic. Promotion to a first-class, explicitly authored column is **deferred until a
vertical needs a supply model the derivation can't express** (e.g. an `itinerary` product
sold dynamically). See [ADR-0010](../adr/0010-supply-model-derived-from-booking-mode.md)
for the decision and the touch points a future promotion would change.

### 2.1. Product family and subtype are a third, independent axis

Merchandising classification is a third axis, orthogonal to both `supplyModel`
and `category`: the **Product family** (`tour` \| `activity` \| `attraction` \|
`event` \| `transportation`, stored on `product_types` and referenced by
`products.productTypeId`) and the optional **Product subtype**
(`products.productSubtypeCode`, e.g. `boat-tour`, `day-tour`). Neither is
derived from `supplyModel` or `bookingMode`, and classification is never keyed
to duration — a 60-minute Boat Tour stays in the Tour family; duration only
ever changes `resolveProductDuration`'s output (`durationMinutes` explicit
first, legacy itinerary-day fallback second, otherwise `unresolved` with a
review warning), never the family.

Catalog views facet on the stable family/subtype codes, not on free-text
labels. The standard Tour, Activity, Attraction, Event, and Transportation
views each lock their corresponding `familyCode`; the Boat Tour view locks
`familyCode = tour` plus `subtypeCode = boat-tour`. This is independent of
which surface (§3) the product renders in — a `scheduled` Tour and a `dynamic`
Tour both facet the same way. Excursions remains a contextual compatibility
view for scheduled products and is not primary family navigation.

## 3. Two catalog surfaces (split on the mechanic)

`category` is a facet *inside* each surface; the surface itself is chosen by `supplyModel`.

### 3.1 Dynamic (search-first)
- **Search bar** drives the page: origin (optional) + destination + dates (±flex) +
  duration + occupancy → live offers via the upstream package/stay search.
- **Results**: dated offers (hotel + flights + board + per-person price), refined by the
  filter rail (board / rating / price / airline / facilities) and `category`.
- **Individual page** (route): Overview · **Dates & Flights** (calendar of prices) ·
  Room & Board · Facilities · Reviews → book a composed offer.
- **Booking**: lock/confirm a live offer (`offer.id` → lock → book).

### 3.2 Scheduled (departures-first)
- **Browse**: indexed cards (tours/cruises/groups) with next departure + price-from +
  a seats indicator; filters by destination / `category` / theme / month / duration / price.
- **Individual page** (route): itinerary + a **departures table** (date · seats left ·
  price · book) + room/cabin options.
- **Booking**: hold/allocate seats against `availability_slots` + `allocation_resources`.

The date search lives at the **page top** in both surfaces — never inside a card.

## 4. Mapping existing inventory

| Source / vertical | `supplyModel` | Surface |
| --- | --- | --- |
| TUI packages (`tui-pkg:*`) | `dynamic` | Dynamic |
| Sourced hotel-only (stays) | `dynamic` | Dynamic |
| Cruises (sailings) | `scheduled` | Scheduled |
| Owned series / scheduled departures | `scheduled` | Scheduled |
| Owned single-date / open products | per product | by `supplyModel` |

The existing per-vertical index slices stay; each surface queries the verticals whose rows
carry the matching `supplyModel`. (A later consolidation into a category facet over a
unified slice is possible but out of scope here.)

## 5. Data + live-search primitives (already present)

- **Dynamic pricing/offers**: Voyant Connect `POST /connect/v1/connections/{id}/packages/search`
  (flight+hotel offers) and `stays/search` (hotel-only). Returns `offer.id`, `stay`
  (room/board/checkIn/checkOut), `flights[]`, `pricing` (perPerson/total), `cancellationPolicy`.
  Calendar-of-prices = the same search over a month for one accommodation.
- **Scheduled inventory**: `availability_slots` (dated departures, `remaining`/`capacity`) +
  `allocation_resources` (seat/cabin allotment) — already used by cruise sailings.

So the mechanics map onto primitives that already exist; the work is the **surface fork**
(search/list/detail/booking) over the `supplyModel` classifier (derived from `bookingMode`
today — see [ADR-0010](../adr/0010-supply-model-derived-from-booking-mode.md)).

## 6. Phased plan

1. **Foundation** — derive `supplyModel` from `bookingMode` (`deriveProductSupplyModel`) and
   project it through the catalog field policy as an indexed classifier; TUI (`open`/`stay`)
   → `dynamic`, cruises/series (`date`/`date_time`) → `scheduled`. No stored column — see
   [ADR-0010](../adr/0010-supply-model-derived-from-booking-mode.md). *(Done.)*
2. **Dynamic surface** — top search bar → `packages/search` (by destination) → results +
   filter rail + **individual page** with calendar-of-prices. Buildable now on TUI.
3. **Scheduled surface** — departures-first list + **individual page** with departures +
   seats. Cruises first (real data); Pro Travel groups when that source is connected.
4. **Booking forks** — Dynamic: lock/confirm offer. Scheduled: allocate seats.

## 7. Open questions

- Operator-facing nav labels for the two surfaces (internal mechanic stays `dynamic`/`scheduled`).
- Whether to eventually collapse the per-vertical slices into one with `category` as a facet.
- When to promote `supplyModel` from derived to a first-class authored column — the trigger and
  touch points are recorded in [ADR-0010](../adr/0010-supply-model-derived-from-booking-mode.md)
  (fires when a vertical needs a supply model `bookingMode` can't express).
