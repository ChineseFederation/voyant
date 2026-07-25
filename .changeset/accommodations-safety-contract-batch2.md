---
"@voyant-travel/accommodations": patch
---

Declare safety-contract metadata on three room-block actions and remove them
from the legacy execute+tools allowlist:

- `action.create-room-block` already claims its command idempotently via
  `executeAdmittedCreatedTargetCommand` (the `handler-command-claim-v1`
  `createdTarget` contract was already declared); this adds `availability`
  and `effectBoundary: "local"`.
- `action.set-room-block-nights` upserts the night rows for an existing
  block (`onConflictDoUpdate`, deterministic final state), so it declares
  `targetLifecycle: "existing"` plus `availability`/`effectBoundary: "local"`.
- `action.reverse-room-block-pickup` runs a single row-locked transaction
  that reverses an already-recorded pickup on an existing block; it declares
  `targetLifecycle: "existing"` plus `availability`/`effectBoundary: "local"`.

`action.pickup-room-block` is intentionally left on the allowlist: its
natural-key dedup on `stayBookingItemId` returns the prior pickup on retry,
but it does not reject a same-key retry whose room count or date range
differs from the original, so declaring the `handler-command-claim-v1`
created-target contract would overclaim replay safety. Wiring it through
`executeAdmittedCreatedTargetCommand` (like `create-room-block`) is follow-up
work, not part of this batch.

No runtime changes.
