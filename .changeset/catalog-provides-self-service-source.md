---
"@voyant-travel/catalog": minor
---

Provide `finance.self-service-booking-source.runtime` from the catalog booking
engine, so a deployment that selects catalog gets public self-service booking
creation without extra wiring.

The provider resolves the owned-handler registry per request, matching how the
draft reaper already reaches it. `SelfServiceBookingSourceProviderDeps` now
takes `resolveOwnedHandlers()` rather than a pre-built registry.

No billing-person resolver is wired yet: an authenticated customer can book
(they already are the billing party), while a verified guest is rejected as
`incomplete_draft` until a deployment supplies one.
