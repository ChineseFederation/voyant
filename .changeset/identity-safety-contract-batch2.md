---
"@voyant-travel/identity": patch
---

Declare safety-contract metadata on the six grandfathered contact-point,
address, and named-contact actions and remove them from the legacy
execute+tools allowlist:

- `action.create-contact-point`, `action.create-address`, and
  `action.create-named-contact` already claim their command idempotently via
  `admitHandlerActionPolicy` with a `handler-command-claim-v1` `createdTarget`
  contract, backed by plain local Postgres inserts against the owning
  entity; this adds `availability` and `effectBoundary: "local"`.
- `action.update-contact-point`, `action.update-address`, and
  `action.update-named-contact` are single local Postgres updates against an
  existing row (already declared via `commandTargetField: "id"`), so they
  declare `availability`, `effectBoundary: "local"`, and
  `targetLifecycle: "existing"`.

No runtime changes.
