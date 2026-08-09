---
"@voyant-travel/catalog": patch
---

Reduce booking-session mutation database round trips by reusing the transaction-locked Session and superseding active Quotes with one set-based write.
