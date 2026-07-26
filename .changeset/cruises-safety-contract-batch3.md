---
"@voyant-travel/cruises": patch
---

Declare safety-contract metadata on the five remaining grandfathered cruise
actions and remove them from the legacy execute+tools allowlist:

- `action.update-cruise`, `action.update-cruise-sailing`, and
  `action.update-cruise-ship` are plain local Postgres updates against an
  existing `id`, so they declare `commandTargetField: "id"`,
  `targetLifecycle: "existing"`, and `availability`/`effectBoundary: "local"`.
- `action.upsert-cruise-sailing` dedupes on the `(cruiseId, departureDate,
  shipId)` unique index and fully overwrites on a matching retry. It has no
  client-supplied row id, but is anchored to the existing cruise it belongs
  to, so it declares `commandTargetField: "cruiseId"`, `targetLifecycle:
  "existing"`, and `availability`/`effectBoundary: "local"`.
- `action.create-cruise-ship` already claims its command idempotently via
  the existing `handler-command-claim-v1` `createdTarget` contract; this
  adds `availability` and `effectBoundary: "local"`.

No runtime changes.
