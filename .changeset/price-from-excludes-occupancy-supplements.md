---
"@voyant-travel/commerce": patch
"@voyant-travel/inventory": patch
---

Keep occupancy supplements out of the projected "price from" amount. A room price only contributes to the MIN when its rule prices the room all-in; under a `supplement` basis — explicit, or unset while the rule still prices a traveler — the amount is a surcharge on top of the fare, so the traveler fare becomes the "from" value instead. Storefronts were advertising a 100 EUR single supplement as the headline price of a 165 EUR tour.
