---
"@voyant-travel/distribution": patch
---

Declare safety-contract metadata on the six remaining grandfathered
supplier/channel/external-reference actions and remove them from the legacy
execute+tools allowlist:

- `action.create-supplier`, `action.create-channel`, and
  `action.create-external-reference` already claim their command
  idempotently via `admitHandlerActionPolicy` with a
  `handler-command-claim-v1` `createdTarget` contract, backed by plain local
  Postgres inserts (directory profile plus identity-record sync, no external
  network calls); this adds `availability` and `effectBoundary: "local"`.
- `action.update-supplier`, `action.update-channel`, and
  `action.update-external-reference` are single local Postgres updates
  against an existing row (already declared via `commandTargetField: "id"`),
  so they declare `availability`, `effectBoundary: "local"`, and
  `targetLifecycle: "existing"`.

No runtime changes.
