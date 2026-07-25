---
"@voyant-travel/action-ledger": patch
---

Declare the `createdTarget` durable command contract (with `availability` and
`effectBoundary` safety metadata) on `action.request-approval`. The handler
already claims requested actions and approvals idempotently via
`appendEntry`'s fingerprinted replay lookup, so this only makes the existing
claim-safety explicit in the deployment graph; no runtime behavior changes.
