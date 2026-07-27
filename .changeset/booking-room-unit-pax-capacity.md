---
"@voyant-travel/bookings": patch
---

Stop spending room and vehicle unit counts against passenger capacity. `availability_slots.remaining_pax` is passenger-denominated, but the auto-seeded slot allocation passed the line quantity straight through — a count of units for anything that is not a person-typed unit. A 2-traveller booking on a "Double" room with `minQuantity` 3 took 3 seats off the departure. The seeded allocation is now passenger-denominated, matching what the hold-conversion path already did.
