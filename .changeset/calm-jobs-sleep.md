---
"@voyant-travel/bookings": patch
"@voyant-travel/catalog": patch
"@voyant-travel/commerce": patch
"@voyant-travel/db": patch
"@voyant-travel/distribution": patch
"@voyant-travel/legal": patch
"@voyant-travel/notifications": patch
"@voyant-travel/operations": patch
"@voyant-travel/storefront": patch
"@voyant-travel/trips": patch
---

Add a provider-neutral `scale-to-zero` recovery profile for package-owned jobs,
including channel-push subscribers, and expose safe durable-send,
payment-reconciliation, promotion-reindex, and channel-push jobs to payload-free
wakeups.
