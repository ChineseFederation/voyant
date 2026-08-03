---
"@voyant-travel/finance": minor
"@voyant-travel/bookings": minor
"@voyant-travel/bookings-react": minor
"@voyant-travel/inventory-react": minor
"@voyant-travel/i18n": minor
---

Capture a durable Extra snapshot at Booking, and roll Extras up on the Departure.

Selling an Extra recorded only its sell price. Cost was available on the
matching `extra_price_rules` row and thrown away, and nothing recorded how the
Extra was meant to be collected or fulfilled — so a later edit to the Product's
Extra silently rewrote the terms of a sale that had already happened.

Booking creation now resolves the whole commercial and fulfillment shape in one
pass and freezes it onto the booking item: cost amounts and currency alongside
the sell amounts, plus an `extraSnapshot` recording the price-rule provenance,
name, code, supplier, selection type, collection mode, manifest visibility and
the quantity envelope in force at the moment of sale.

The Departure manifest gains a `summaries` rollup per Extra — units to carry,
selected versus eligible travelers, applicability, cancellations and no-shows,
the collection breakdown, outstanding collections, and whether fulfillment is
complete — surfaced above the per-traveler grid. Each selection row also carries
the `quantity` it was previously missing. Mixed-currency collections report a
null total rather than inventing one.

The Product Extra authoring sheet, which is reached from the Product's Options,
now states the ownership rule where the decision is made: an addition that must
be independently confirmed, cancelled, taxed, fulfilled or supported belongs in
its own Product or Component Booking under the same Trip, not in an Extra.
