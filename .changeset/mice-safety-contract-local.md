---
"@voyant-travel/mice": patch
---

Declare `availability` and `effectBoundary: "local"` on
`action.create-program` and `action.update-program`. Program creation
already claims its command idempotently via
`executeAdmittedCreatedTargetCommand` (the `handler-command-claim-v1`
`createdTarget` contract was already declared); program updates apply a
single local Postgres update against an existing program, so this adds
`targetLifecycle: "existing"`. No runtime changes.
