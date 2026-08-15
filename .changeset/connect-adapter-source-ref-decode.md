---
"@voyant-travel/voyant-connect-adapter": patch
---

Adopt `@voyant-travel/connect-adapter` 0.6.1, which resolves cruises keyed by an encoded SourceRef.

The catalog keys sourced cruises as `crus_sr_<base64url(JSON)>`, but the Connect
adapter only understood the legacy `cruise:<externalId>:<locale>` form, so no
candidate ever reduced to the upstream external id. The per-id lookup 404'd, the
fallback list scan matched nothing, and `getContent` threw
`Connect cruise content not found` — a 500 on every sourced cruise content read,
admin and storefront alike.
