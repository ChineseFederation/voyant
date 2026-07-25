---
"@voyant-travel/setup": patch
---

Declare `availability`, `effectBoundary: "local"`, and
`targetLifecycle: "existing"` on `action.complete-setup-step` and
`action.skip-setup-step`. Both handlers apply a single conditional update to
an already-created setup step row, so this only documents the existing
local, replay-safe behavior in the deployment graph; no runtime changes.
