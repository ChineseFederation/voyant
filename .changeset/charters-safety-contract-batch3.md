---
"@voyant-travel/charters": patch
---

Declare safety-contract metadata on the six remaining grandfathered charter
actions and remove them from the legacy execute+tools allowlist:

- `action.update-charter-product`, `action.update-charter-voyage`, and
  `action.update-charter-yacht` are plain local Postgres updates against an
  existing `id`, so they declare `commandTargetField: "id"`,
  `targetLifecycle: "existing"`, and `availability`/`effectBoundary: "local"`.
- `action.upsert-charter-voyage` dedupes on the `(productId, departureDate,
  yachtId)` unique index and fully overwrites on a matching retry. It has no
  client-supplied row id, but is anchored to the existing charter product it
  belongs to, so it declares `commandTargetField: "productId"`,
  `targetLifecycle: "existing"`, and `availability`/`effectBoundary: "local"`.
- `action.create-charter-product` and `action.create-charter-yacht` already
  claim their command idempotently via the existing `handler-command-claim-v1`
  `createdTarget` contract; this adds `availability` and `effectBoundary:
  "local"`.

No runtime changes.
