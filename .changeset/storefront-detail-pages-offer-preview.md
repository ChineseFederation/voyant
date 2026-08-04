---
"@voyant-travel/catalog-contracts": minor
"@voyant-travel/catalog": minor
"@voyant-travel/catalog-react": minor
"@voyant-travel/storefront-react": minor
"@voyant-travel/cruises-react": minor
"@voyant-travel/inventory-react": minor
---

Price storefront detail pages through the non-binding Offer Preview.

The product, accommodation and cruise detail pages still called
`useBookingQuote`, which POSTs to `/v1/{surface}/catalog/quote` — a route v1
deleted. All three have been 404ing in production: no price, no availability,
a sidebar stuck on "pricing pending". They now call
`POST /v1/{surface}/catalog/offers/preview`.

**Why not just open a Booking Session.** A shopper nudging a pax stepper has
not attempted to book anything. Sessions are persisted, revisioned,
capability-bearing, expiring rows that a sweep has to reap; minting one per
keystroke floods `booking_sessions` at real traffic, and it also asserts
something untrue — that this shopper has started a booking. A price probe is a
read. The preview mints no identifier, persists nothing, and says
`binding: false`.

**The preview target union is wider than the Session-create one, deliberately.**
`offerPreviewTargetV1` admits `product | catalog_item | owned_entity`;
`createBookingSessionTargetV1` still admits only `product | catalog_item`. A
preview is a read, so it admits any bookable target. Creating a Session is a
write that allocates capability and capacity, so it stays narrower. The
practical consequence: accommodations and cruises are `owned_entity` targets,
and without the widening two of the three shipped detail pages could not ask
what anything costs. The members are reused from `bookingSessionTargetV1`
rather than redeclared so the two unions cannot drift field by field;
`trip_snapshot` is excluded, being composed server-side from an accepted
Proposal and never what a detail page points at.

**`useOfferPreview`** (`@voyant-travel/catalog-react/booking-engine`) is the
client. It keeps the parts of `useBookingQuote` that encode fixed bugs: the
250ms debounce, the pricing-significant signature so a cosmetic edit costs no
round trip, `placeholderData` so the price swaps in place instead of blanking,
and — the voyant#2643 case — dropping the previous result on a scope change, so
a stale-market price can never be shown while the re-scoped read is in flight.
A rejected outcome raises `OfferPreviewRejectedError` rather than arriving as
data, keeping "there is no preview" distinct from "here is a preview that says
unavailable"; the latter is a normal renderable result.

**Detail pages now render the server's requirements, not their own guesses.**
The preview returns `requirements` even when there is no price, so `PaxBlock`
takes each band's real `minCount`/`maxCount` from `requirements.paxBands`
instead of the hardcoded "8 adults, 6 children, 4 infants" that was true of no
product in particular, and the cruise occupancy stepper takes its bounds from
the sailing's adult band. Tier-qualified band codes
(`"child:pricing_categories_…"`) collapse onto their canonical code. The
hardcoded values survive only as the fallback covering the moment before the
first preview lands.

`BookingSidebar` takes `preview` / `isPreviewing` in place of `quoteData` /
`isQuoting`, and translates the preview's five-member `unavailableReason`
vocabulary (en + ro) instead of beta's open per-vertical strings — which would
otherwise have reached shoppers as raw enum members.

`useBookingQuote`, `useBookingDraft` and `useBookingHold` are untouched; two
other hosts still use them.
