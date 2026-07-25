---
"@voyant-travel/finance": patch
---

Declare safety-contract metadata on the three remaining grandfathered
invoice actions and remove them from the legacy execute+tools allowlist:

- `action.void-invoice` runs a single local Postgres transaction guarded by
  invoice status (retrying an already-voided invoice returns `already_void`
  rather than re-mutating), so it declares `availability`,
  `effectBoundary: "local"`, and `targetLifecycle: "existing"` against its
  existing `commandTargetField: "id"`.
- `action.issue-invoice-refund` and `action.issue-invoice-from-booking`
  already keep their own package-owned two-phase approval and idempotent
  replay guards (`refund-authorization.ts` / `invoice-issue-authorization.ts`
  fingerprint the command against target state and replay the exact prior
  credit-note/invoice result on retry) with `actionPolicyEnforcement:
  "handler"` on their Tools, so MCP does not double-gate them. This adds
  `availability`, `effectBoundary: "local"`, `targetLifecycle: "existing"`,
  `existingTarget: { durability: "handler-command-result-v1" }`, and the
  `commandTargetField` naming the pre-existing invoice/booking
  (`invoiceId` / `bookingId`) their handlers already fingerprint on.

No runtime changes.
