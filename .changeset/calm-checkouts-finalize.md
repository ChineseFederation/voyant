---
"@voyant-travel/commerce": patch
---

Run paid-checkout finalization on the primary database without a saga-wide transaction so each durable finance and legal step can read its committed checkpoint and release locks before the next step.
