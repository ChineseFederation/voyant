---
"@voyant-travel/storefront": patch
"@voyant-travel/availability": patch
---

Stop advertising the never-maintained `remaining_resources` as live availability.

`availability_slots.remaining_resources` can be seeded once when a slot is
created and is then explicitly stripped on every update. Nothing anywhere
decrements it as bookings, holds, amendments or refunds land, so its value only
ever drifts upward relative to the truth. The storefront read it as a fallback
whenever `remaining_pax` was unset, publishing a stale count on the public
departure list, the product availability summary, and the price-preview
allocation — a number that could only overstate what was left to sell.

Storefront departures now derive capacity through a single
`resolveDepartureCapacity` seam that reads only `remaining_pax`, the projection
the platform actually maintains. When `remaining_pax` is unset the remaining
capacity is reported as unknown (`null`) instead of a fabricated integer.
Unknown degrades safely: `buildAvailabilityState` still derives `sold_out` only
from an explicit `remaining === 0`, so an unknown count is neither presented as
sold out nor as a concrete number of seats left. The column is marked deprecated
on the schema and is no longer read by the storefront at all.
