---
"@voyant-travel/catalog": patch
---

Declare safety-contract metadata on `booking-engine#action.quote-catalog-entity`
and remove it from the legacy execute+tools allowlist. Each call persists a
fresh short-lived quote row (10-minute expiry) with no client-supplied
target id or claim-registry backing for a "created" contract, but a
duplicate quote from a blind retry is harmless, so it declares
`availability`, `effectBoundary: "local"`, and a lightweight
`targetLifecycle: "existing"`. No runtime changes.
