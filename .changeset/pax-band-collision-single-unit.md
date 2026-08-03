---
"@voyant-travel/inventory": patch
---

Charge and reserve one unit when several option units collapse onto the same
pax band.

`deriveTravelerCategory` maps every age tier under 18 onto `child`, so an
operator selling "Child 6-12" alongside "Child 0-5" has two units competing for
one band. `paxBandUnitCharges` had no record of which bands were already
spoken for, so each unit contributed a full line carrying the whole band count.
For `pax = { adult: 1, child: 1 }` against units priced 16000 / 13600 / 10400,
the quote totalled 40000 for two travelers, and since voyant#4117 the commit
also wrote three booking item lines and reserved three seats (voyant#4118).

The overcharge predates voyant#4117 — `priceQuote` always had the ungated loop —
but that change propagated it from the price into the reservation, which is the
part that consumes departure capacity.

A band is now claimed by exactly one unit, which is the rule the room path has
always applied: `priceOptionSelections` keys its per-band prices on
`option + band` and takes the first. The person-priced path was the outlier.

The operator's `option_units.sort_order` decides the winner, so a contested band
resolves to something the operator controls rather than to an accident of query
planning. `sort_order` now travels on `ResolvedUnitPrice` and the charge list is
sorted by it, with `unitId` breaking ties. This matters for correctness, not
just predictability: `option_unit_price_rules` is selected with no `ORDER BY`,
and the quote and the commit resolve prices in two separate calls, so a
first-row-wins rule over unsorted rows could have picked one tier when quoting
and another when committing.

A zero-priced unit still does not claim a band. Free units produced no quote
line and no reservation before this change, and letting one win a contested band
would have quietly stopped charging for that band altogether.

This does not make an operator with several child tiers expressible. The journey
still collects one `child` count, so which tier the traveler belongs to remains
unknown and the price for a contested band is still a guess — it is simply the
operator's guess now, made once, instead of every tier being billed at once.
Collecting pax per tier is the real fix and is tracked separately.
