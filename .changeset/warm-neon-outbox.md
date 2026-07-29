---
"@voyant-travel/catalog": patch
"@voyant-travel/db": patch
"@voyant-travel/framework": patch
---

Allow resident Node database clients enough time to reconnect after a suspended
database wakes, deliver durable outbox events through the composed internal
subscriber bus, and reconcile obsolete Lakebase vector storage when a
deployment uses pgvector.
