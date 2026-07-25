---
"@voyant-travel/operator-settings": patch
---

Declare `availability`, `effectBoundary: "local"`, and
`targetLifecycle: "existing"` on `action.update-operator-settings`. The
handler upserts the operator's own profile, payment instruction, and
payment default rows in Postgres with no external calls, so this only
documents the existing local behavior in the deployment graph; no runtime
changes.
