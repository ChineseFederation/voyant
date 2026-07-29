---
"@voyant-travel/db": patch
---

Close idle postgres-js connections after 30 seconds by default so resident application processes do not prevent serverless Postgres computes from suspending. Applications that deliberately need permanent idle sockets can disable or override the timeout through `nodeIdleTimeoutSeconds`.
