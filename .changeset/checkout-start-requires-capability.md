---
"@voyant-travel/commerce": major
"@voyant-travel/catalog": patch
---

Require a booking-scoped capability to start checkout.

`POST /v1/public/catalog/checkout/start` accepted a bare `bookingId` and loaded
the booking with no authorization check, so starting a payment against someone
else's booking was a matter of guessing an id. It now requires the same
`payment:start` capability the Finance collection routes require — the one
booking creation issues and sets as an HttpOnly cookie.

**Breaking.** Any caller that reached this route with only a booking id now
receives 401 (no capability) or 403 (a capability for a different booking).
Storefronts should obtain the capability from the booking-create response,
which returns it in the body and as the `voyant_checkout_session` cookie.
