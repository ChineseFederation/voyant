---
"@voyant-travel/quotes": patch
---

Declare `availability`, `effectBoundary: "local"`, and (where missing)
`targetLifecycle: "existing"` on the four quote-version lifecycle actions
(`snapshot-quote-version`, `send-quote-version`, `accept-quote-version`,
`decline-quote-version`) and remove them from the legacy execute+tools
allowlist. Each is a single local Postgres transaction guarded by the quote
or quote-version's current status against an already-existing target
(`commandTargetField` was already declared for all four); `accept` already
replays the same result when retried after success, and the others reject a
mismatched-state retry with a domain conflict error rather than silently
double-processing. No runtime changes.
