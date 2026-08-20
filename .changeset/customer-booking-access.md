---
"@voyant-travel/auth": patch
"@voyant-travel/bookings": patch
"@voyant-travel/catalog": patch
"@voyant-travel/finance": patch
"@voyant-travel/identity": patch
"@voyant-travel/public-api": patch
"@voyant-travel/relationships": patch
"@voyant-travel/schema-kit": patch
---

Add Buyer Account-owned Booking access grants, atomic authenticated Commit grants,
enumeration-safe Booking claim APIs, audited staff remediation, and an evidence-only
legacy backfill. Customer Booking authorization no longer treats matching contact
data as identity proof, while Business Buyer Accounts preserve multi-member access
and future reseller delegation remains a separate authority layer.
