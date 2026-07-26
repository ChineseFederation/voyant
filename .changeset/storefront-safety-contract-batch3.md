---
"@voyant-travel/storefront": patch
---

Quarantine `action.bootstrap-my-customer-portal` and remove it from the
legacy execute+tools allowlist: it can create the customer's `crm.people`
row on a branch that later fails, and a retry with no claim registry can
orphan that row rather than converging on the same profile. Declares
`availability: { status: "unavailable", reasonCode:
"unsafe-unclaimed-create-target" }`. No runtime changes.
