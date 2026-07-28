---
"@voyant-travel/core": patch
"@voyant-travel/hono": patch
---

Attribute trusted managed Max writes to the approving staff user while retaining
Max provenance in the request context and keeping internal credential scopes as
a hard authorization cap. Resolve the asserted cloud identity to its
deployment-local mirror user before exposing it to handlers.
