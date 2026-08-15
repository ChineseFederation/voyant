---
"@voyant-travel/operations": minor
"@voyant-travel/operations-react": minor
"@voyant-travel/i18n": minor
---

Group the departure traveler roster by reservation, and stop asking departures that allocate nothing about rooms and seats.

The roster was a flat table that repeated the booking number on every row, so who travelled together had to be reconstructed by matching strings by eye. Each reservation is now its own group carrying what belongs to the party — who booked it, its status, whether it is paid, and how many of its sold seats have names yet — with the traveler rows underneath.

The departure summary now reports whether a departure allocates positions at all (`allocation.planned`, derived from the resources laid out on it and the resource templates its option declares, alongside a new `allocation.templated` count). A day excursion has neither, so its Seated / Not seated counters, its Seat / room column and its allocation manager no longer render, and `allocation_resources_missing` and `travelers_unassigned` are no longer raised against a rooming plan that was never going to exist. Departures whose catalog does declare resources are unaffected.
