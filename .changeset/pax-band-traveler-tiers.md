---
"@voyant-travel/catalog-contracts": patch
---

Let an option sell several tiers of one traveler category.

`deriveTravelerCategory` mapped every age window under 18 onto `child`, and
`loadPaxBands` deduped the product's traveler types by `categoryType`. An
operator selling "Child 6-12" at 13600 and "Child 0-5" at 10400 on one option
therefore got a single `child` stepper in the journey, and only the
first-sorting tier was ever quoted or reserved. #4118 stopped the resulting
double charge by letting one tier claim the contested band; the second tier
stayed unsellable at any pax combination, with no signal to the operator that
it was dead.

A pax band now identifies the traveler type the operator configured. The first
tier of each category keeps its canonical code (`adult`, `child`, …) and every
further tier is qualified by its pricing category
(`child:pricing_categories_01j…`). `loadPaxBands`, `loadPaxBandDependencies`
and `loadResolvedOptionPrice` derive those codes from one shared, ordered
category list, so the code a shopper is offered is the code the price rule is
matched on and the #4118 claim guard becomes a no-op rather than a tie-break.

Keeping the first tier on the bare code is what makes this safe on live data:
a product with one tier per category emits exactly the codes it emitted
before, and a session, accepted quote or traveler row written against `child`
still resolves — to the same tier #4118's tie-break already picked.
`travelerEntryV1.band` widens from an enum to a string for the qualified
codes; every canonical code stays valid. Downstream surfaces typed by
canonical category — booking traveler categories, sourced commitments,
`appliesToBands`, contract `paxAdult`/`paxChild`/`paxInfant` — read the base
code off the band, so a tier rolls up into the category it belongs to.

Products with no configured traveler types are unchanged: they still get the
generic adult / child / infant defaults, and a price row with no pricing
category still resolves its band from the unit's age window.
