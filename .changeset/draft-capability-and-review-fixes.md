---
"@voyant-travel/catalog": major
"@voyant-travel/bookings": minor
"@voyant-travel/finance": minor
"@voyant-travel/hono": minor
---

Scope booking drafts to a capability, and close three more review findings.

**Draft access control (breaking).** A booking draft holds traveller names and
contact details, and its id is supplied by the caller on `PUT /drafts/{id}` —
so anyone who learned or guessed one could read it, overwrite it, delete it, or
book it. Creating a draft now issues a draft-scoped capability, returned in the
response and set as an HttpOnly cookie, and reading, writing, deleting, or
booking that draft requires it. Uses the same capability primitive as checkout.

**Bearer token no longer cached.** The create response carries a checkout
capability, and the idempotency middleware persisted response bodies for 24
hours — putting an HMAC bearer credential at rest in a general-purpose infra
table, and returning it on replay *without* its `Set-Cookie`, silently dropping
the caller's session. The endpoint now opts out of body replay: the durable
command claim still prevents duplicate bookings, and a retry is issued a fresh
capability and cookie.

**A hold is required where the vertical manages inventory.** A draft with no
`hold_expires_at` skipped every hold check, and hold conversion only runs for
slot-backed products — so a slotless one could oversell. Creation now requires
a live hold whenever the vertical implements holds.

**OpenAPI coverage checks parameters.** `diffOpenApiCoverage` compared only
request-body field names, so the bookings document could declare a required
`Idempotency-Key` header the runtime route never did — and the check stayed
green. It now compares parameters by name, location and requiredness, and its
documentation states plainly what it does not verify (responses, security, and
anything behind a `$ref`).
