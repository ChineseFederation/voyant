---
"@voyant-travel/navigation-preferences": patch
---

Declare `availability`, `effectBoundary: "local"`, and
`targetLifecycle: "existing"` on `action.set-organization-navigation-preferences`
and `action.set-my-navigation-preferences`. Both handlers upsert a single
row via `onConflictDoUpdate`, so this only documents the existing local,
idempotent behavior in the deployment graph; no runtime changes.
