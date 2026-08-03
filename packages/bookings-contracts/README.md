# @voyant-travel/bookings-contracts

Pure bookings validation schemas, status enums, and traveler primitives —
zod-only — for consumers (the Admin SDK, Voyant Connect) that validate booking
payloads without the bookings runtime (Drizzle/Hono/DB).

Use this for the booking input/validation schemas (`createBookingSchema`,
`cancelBookingSchema`, status enums, etc.) and the shared traveler schemas
(`bookingTravelerBedPreferenceSchema`, `travelerAllocationMapSchema`). Use
`@voyant-travel/bookings` when you also need the Drizzle schema, routes, services, or
booking engine — it re-exports these so existing import paths are unchanged.

Shared schema primitives (TypeID validators, query-param helpers) come from
`@voyant-travel/schema-kit`, keeping this package free of the data layer.
