---
"@voyant-travel/bookings": minor
"@voyant-travel/commerce": patch
"@voyant-travel/finance": minor
---

Expose non-PII booking line details to Tools and add an exact, fingerprinted payer/line/tax preview plus an approval-gated command for atomically issuing a proforma without external synchronization. Serialize checkout tax materialization with approved invoice issuance so the issued tax snapshot cannot drift.
