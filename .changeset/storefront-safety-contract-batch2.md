---
"@voyant-travel/storefront": patch
---

Declare safety-contract metadata on five of the six grandfathered customer
self-service actions and remove them from the legacy execute+tools
allowlist:

- `action.update-my-customer-portal-profile` is a single local Postgres
  update of the authenticated customer's own profile (target resolved from
  the session, not a client-supplied id), so it declares `availability`,
  `effectBoundary: "local"`, and `targetLifecycle: "existing"`.
- `action.confirm-my-verification` binds two tools that both mutate an
  already-issued verification challenge (matched by destination + purpose +
  code, not a create/update split): a retry with the same code after the
  challenge is already `"verified"` fails closed with a domain conflict
  rather than silently re-verifying. It declares `availability`,
  `effectBoundary: "local"`, and `targetLifecycle: "existing"`.
- `action.create-invoice-payment-link` already declares
  `commandTargetField: "invoiceId"` and `targetLifecycle: "existing"`; its
  `paymentUrl` is a locally built storefront checkout link (no outbound
  provider call at creation time), so this adds `availability` and
  `effectBoundary: "local"`.
- `action.manage-my-customer-portal-companions` and
  `action.manage-my-customer-portal-documents` are quarantined from agent
  Tool exposure instead of migrated (`availability: unavailable`,
  `reasonCode: "unsafe-unclaimed-create-target"`): each binds a create tool
  with no idempotency key alongside update/import tools, so neither
  `targetLifecycle` value would honestly describe the bundle, and the create
  side has no dedup to safely retry. Customer portal UI is unaffected; only
  agent Tool exposure is disabled pending a split into separate create/update
  actions with a real created-target claim.

`action.bootstrap-my-customer-portal` is intentionally left on the
allowlist: its claim-conflict handling is idempotent on the already-linked
path, but the create-new-person branch can leave an orphaned `crm.people`
row if two bootstrap calls race before either commits, so declaring
`handler-command-claim-v1` would overclaim replay safety. Follow-up work,
not part of this batch.

No runtime changes.
