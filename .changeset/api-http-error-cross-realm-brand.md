---
"@voyant-travel/hono": patch
"@voyant-travel/inventory": patch
---

Identify `ApiHttpError` by a registry symbol instead of `instanceof`, so
validation failures keep returning `400 invalid_request` when the throwing
module and the error boundary loaded different copies of `@voyant-travel/hono`.
`ZodError` and `HTTPException` are matched structurally for the same reason.
