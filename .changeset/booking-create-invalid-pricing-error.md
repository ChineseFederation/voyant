---
"@voyant-travel/finance": patch
"@voyant-travel/hono": patch
---

Surface a booking-create pricing refusal instead of hiding it behind a bare 500.

`bookingCreateCommandError` had a case for 15 of the 16 `BookingCreateOutcome`
refusals; `invalid_pricing` fell through to `default:` and became "The booking
command failed validation." with its `issues[]` discarded, and the route turned
that into a `500 Internal Server Error`. `invalid_pricing` now formats its
issues like its two siblings, the switch is exhaustive so a new status fails the
build rather than degrading to a generic message, and the six conflict outcomes
name the booking, group or credit they conflict with.

A refusal now states the audience it is written for, because the self-service
entrypoint is reachable from the anonymous public Commit. A customer-facing
refusal may describe the caller's own request and the product they are booking,
but not another party's records or the operator's account state: the
duplicate-booking outcome no longer names the existing booking (its guard
resolves a person from the contact email without checking the caller owns it),
and the monthly-limit outcome no longer reports the operator's plan usage. Staff
keep both in full, and the whole outcome still reaches the server log.

The framework error boundary now answers a client-answerable `ToolError` with
its own status — `INVALID_INPUT` is a `400`, not a `500` — and reflects the
message and next steps. Codes that report a mis-wired deployment or a
server-side defect keep the opaque 500 they have today, and the API error log
records the tool error code for all of them.
