---
"@voyant-travel/commerce": patch
---

Declare safety-contract metadata on the six remaining grandfathered
pricing/promotions actions and remove them from the legacy execute+tools
allowlist:

- `action.create-cancellation-policy` and `action.create-price-catalog`
  already claim their command idempotently via `executeCommerceCreate`
  (the shared `handler-command-claim-v1` `createdTarget` contract), with a
  plain local Postgres insert and no outbox write, so they declare
  `availability` and `effectBoundary: "local"`.
- `action.update-cancellation-policy`, `action.update-price-catalog`,
  `action.update-promotion`, and `action.archive-promotion` are single
  local Postgres updates against an existing policy/catalog/promotion id
  (already declared via `commandTargetField: "id"`); the two promotion
  actions notify an in-process event bus (not a durable outbox, unlike
  `create-promotion`), so all four declare `availability`,
  `effectBoundary: "local"`, and `targetLifecycle: "existing"`.

No runtime changes.
