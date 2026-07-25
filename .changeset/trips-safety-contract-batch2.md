---
"@voyant-travel/trips": patch
---

Declare safety-contract metadata on the four remaining grandfathered trip
actions and remove them from the legacy execute+tools allowlist:

- `action.create-trip` already claims its command idempotently via
  `executeAdmittedCreatedTargetCommand` (the `handler-command-claim-v1`
  `createdTarget` contract was already declared); this adds `availability`
  and `effectBoundary: "local"`.
- `action.add-requirement` already declared `targetLifecycle: "existing"`
  against an existing trip envelope; this adds `availability` and
  `effectBoundary: "local"`.
- `action.revise-trip` adds/removes trip-envelope components with plain
  local Postgres writes against an existing envelope, so it declares
  `commandTargetField: "envelopeId"`, `targetLifecycle: "existing"`, and
  `availability`/`effectBoundary: "local"`.
- `action.select-candidate` promotes a candidate and pins a component on an
  already-existing trip requirement with local Postgres writes, so it
  declares `targetLifecycle: "existing"` plus `availability`/
  `effectBoundary: "local"` against its existing `commandTargetField:
  "requirementId"`.

No runtime changes.
