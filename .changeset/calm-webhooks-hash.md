---
"@voyant-travel/webhook-delivery": patch
"@voyant-travel/apps": patch
---

Serialize durable webhook payloads canonically so PostgreSQL jsonb key reordering cannot invalidate their persisted integrity hash before delivery.
