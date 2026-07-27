---
"@voyant-travel/hono": patch
---

Recognise unbranded `ApiHttpError` instances thrown by a pre-brand copy of this
package, so validation failures return `400 invalid_request` in a partly
upgraded dependency graph instead of waiting for every module package to be
re-released. Matched by class name plus a numeric status — never by status
alone, which would reflect internal messages.
