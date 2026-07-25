---
"@voyant-travel/trips": major
---

Replace direct Trip pricing and reservation mutations with handler-admitted,
asynchronous durable operations. Deployments can enable the actions only by
selecting an exact provider that passes replay, restart reconciliation, payload
drift, and backend-identity conformance. Add an immutable operation-status Tool
and remove the direct price/reserve HTTP routes plus the transitional
`reserveTripDeps` route authority. `create_trip` now accepts idempotency only
from the admitted `_voyant` invocation instead of a top-level compatibility
field.
