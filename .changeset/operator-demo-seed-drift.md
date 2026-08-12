---
"@voyant-travel/example-operator-demo": patch
---

Repair the operator demo seed, which could not run against the current schema. It
imported `@voyant-travel/flights` without declaring it, so it died on
`ERR_MODULE_NOT_FOUND` before touching the database, and it wrote booking statuses
`on_hold` and `draft` — values dropped from the `booking_status` enum, which now holds
`confirmed`, `in_progress`, `completed` and `cancelled` — so it aborted partway through
with a Postgres enum error, leaving a half-populated database.
