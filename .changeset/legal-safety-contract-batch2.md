---
"@voyant-travel/legal": patch
---

Declare `availability`/`effectBoundary: "local"` on
`action.create-contract-draft`, which already claims its command idempotently
via `executeAdmittedCreatedTargetCommand` (the `handler-command-claim-v1`
`createdTarget` contract was already declared).

Quarantine `action.author-contract-template` from agent Tool exposure
(`availability: unavailable`, `reasonCode: "unsafe-unclaimed-create-target"`)
instead of migrating it: the action binds two tools with genuinely different
lifecycles (`create-contract-template` creates a new template with no
idempotency key or claim protocol; `update-contract-template` mutates an
existing template by id), so neither `targetLifecycle: "created"` nor
`"existing"` would honestly describe it as a single action, and the create
side has no dedup to safely retry. Admin UI template authoring is unaffected;
only agent Tool exposure is disabled pending a split into separate
create/update actions with a real created-target claim.

No runtime changes.
