---
"@voyant-travel/inventory": patch
---

Derive booking item lines from pax bands so person-priced products can be
booked from the storefront.

A product whose selected option carried more than one `person` unit and flagged
none of them `is_required` could be quoted, held and filled in, and then failed
closed on `POST /v1/public/bookings` with "Several units are available and none
is required, so the booking would reserve nothing." Adult / Child 6-12 /
Child 0-5 is an ordinary per-person price structure, so this took out whole
catalogues rather than an edge case (voyant#4113).

Two halves of the booking engine disagreed about who names the units.
`buildOwnedProductDraftShape` adds the journey's `option-units` step only for
options that sell room or vehicle inventory — a person-only product prices by
pax band alone — so the draft never carried `configure.optionSelections`.
`deriveSelfServiceCommand` then derived its item lines from those selections
alone, and the command reached booking creation with none. The refusal itself
was right: a booking with no items reserves nothing. The storefront was simply
incapable of supplying what the commit required for this product shape.

Derivation now falls back to the pax bands, which is the only thing the shopper
was actually asked for. The preferred source is the option price rule's
per-band unit prices, shared with `priceQuote` through one
`paxBandUnitCharges` function so the quote and the commit cannot drift about
which units a person-priced product reserves: each item line corresponds 1:1 to
an accepted quote base line. Amounts stay unset and are filled from the
accepted quote, so the price the shopper saw still wins over a resolver reading
taken at commit time.

When the option's price lives at the option or product level and there are no
per-band unit prices to derive from, the units are mapped onto the bands by
their own age window instead. Two units deriving the same band — "Child 6-12"
and "Child 0-5" both derive `child` — give the count to the first in sort order
rather than each reserving the party in full.

Quote band lines now also carry their `optionId` / `optionUnitId`, the same
provenance the unit-selection path already emitted, so the commit matches item
lines back to quote lines by unit rather than by position.
