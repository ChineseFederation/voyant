---
"@voyant-travel/payments": minor
"@voyant-travel/operator-settings": minor
"@voyant-travel/operator-settings-react": minor
"@voyant-travel/storefront": minor
"@voyant-travel/hono": patch
"@voyant-travel/admin-host": patch
"@voyant-travel/i18n": patch
"@voyant-travel/trips": patch
---

Add the managed Voyant Payments transport and honest capability contract, hosted
Stripe Connect onboarding for operators, and scheduled storefront reconciliation.

Expose typed fail-closed adapter errors and onboarding state, render embedded
onboarding with the required narrowly scoped security headers, and keep payment
authorization distinct from completed settlement.

Expand the public payment-adapter conformance kit across authorize, capture,
void, refund, and status, with capability and fixture honesty, strict positive
minor-unit money, typed fail-closed errors, full idempotency conflict checks,
callback signature and replay semantics, stable processor identity and
references, manual capture, partial-operation bounds, and typed health
diagnostics. Add deterministic conforming and deliberately broken fake adapters
that exercise every contract case.
