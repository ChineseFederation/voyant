---
"@voyant-travel/action-ledger": patch
---

Fix `decideApproval` to replay an already-settled decision instead of
throwing a conflict when the retry's requested status matches the approval's
current status and its own idempotent ledger entry (matched by scope + key,
the same lookup `appendEntry` uses) already exists. A genuinely different
requested status, or no matching prior entry, still raises
`ActionApprovalDecisionConflictError`.

Declare `targetLifecycle: "existing"` with the `existingTarget` durable
result contract (plus `availability` and `effectBoundary: "local"` safety
metadata) on `action.approve-approval` and `action.deny-approval`, now that
the decision handler is truly idempotent on replay.
