---
"@voyant-travel/action-ledger": patch
"@voyant-travel/apps": patch
"@voyant-travel/custom-fields": patch
"@voyant-travel/distribution": patch
"@voyant-travel/event-catalog": patch
"@voyant-travel/flights": patch
"@voyant-travel/identity": patch
"@voyant-travel/mcp": patch
"@voyant-travel/media": patch
"@voyant-travel/mice": patch
"@voyant-travel/navigation-preferences": patch
"@voyant-travel/notifications": patch
"@voyant-travel/operations": patch
"@voyant-travel/relationships": patch
"@voyant-travel/reporting": patch
"@voyant-travel/setup": patch
"@voyant-travel/storage": patch
"@voyant-travel/webhook-delivery": patch
---

Stamp `x-voyant-key-kind` on every published operation in this package's OpenAPI
documents.

These packages own admin-surface documents only, so every operation reads
`secret`: a publishable storefront key never reaches `/v1/admin/*`. Stating it
per operation is the point — "which credential does this accept" should not be
something a reader has to infer from a path prefix.
