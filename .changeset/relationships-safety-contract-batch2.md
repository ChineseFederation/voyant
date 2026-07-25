---
"@voyant-travel/relationships": patch
---

Declare safety-contract metadata on the eleven remaining grandfathered
person/organization CRUD actions and remove them from the legacy
execute+tools allowlist:

- `action.add-person-note`, `action.add-organization-note`,
  `action.add-person-contact-method`, `action.add-organization-contact-method`,
  `action.add-person-address`, and `action.add-organization-address` already
  declared `targetLifecycle: "existing"` against the owning person or
  organization (`commandTargetField: "entityId"`); each is a plain local
  Postgres insert (delegating to identity's already-migrated contact-point
  and address services, or a direct notes insert) with no external calls, so
  this adds `availability` and `effectBoundary: "local"`.
- `action.update-person` and `action.update-organization` are single local
  Postgres updates against an existing row (already declared via
  `commandTargetField: "id"`) that notify an in-process event bus (not a
  durable outbox, unlike `create-person`/`create-organization`), so they
  declare `availability`, `effectBoundary: "local"`, and
  `targetLifecycle: "existing"`.
- `action.update-relationship-note`, `action.update-relationship-contact-method`,
  and `action.update-relationship-address` are likewise single local Postgres
  updates against an existing row and declare the same three facets.

No runtime changes.
