---
"@voyant-travel/trips": minor
---

Add `list_trips` and `get_trip` Tools.

The Trips tool surface was write-only: `create_trip`, `revise_trip`,
`price_trip` and `reserve_trip` all take an envelope id, and nothing could
produce one. Of 124 read-shaped Tools on the surface, none read a trip — the
two `get_trip_*` Tools read a pricing/sourcing *operation*, not the trip.

So a trip id was only ever knowable inside the conversation that created it,
which made the composed-itinerary flow impossible to resume and left Max
unable to read back its own work.

`listTripsQuerySchema`, `listTripsRoute` and `getTripRoute` already existed and
the admin Trips page uses them; only the Tool declarations were missing. The
list Tool mirrors the HTTP filters without the query-string coercion — a
`z.coerce.boolean()` parameter would publish untyped and treat any non-empty
string as true, which is the wrong contract for a model composing arguments.
