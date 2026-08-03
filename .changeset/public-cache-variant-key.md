---
"@voyant-travel/hono": minor
---

Scope shared public cache entries to the storefront that produced them.

`publicResponseCache` keyed entries on the request URL alone, while public
storefront responses are scoped to a sales channel resolved from the `x-api-key`
storefront key. Two storefronts bound to different channels and served from one
origin could be served each other's cached responses — `/products/*`,
`/departures/*`, and `/offers/*` are all channel-gated and shared-cached, and
their publication gate reads `channelId`.

The key now carries a digest of the variant-selecting request headers, named by
the new `keyHeaders` option and defaulting to `["x-api-key"]`. Values are hashed
rather than embedded, so a storefront key never lands in a KV key or a
`kv_store` row, and the variant is never resolved through the database — a hit
still costs no connection, no session lookup, and no module-graph instantiation.

Two related gaps close with it: a response declaring a `Vary` the key does not
model is no longer stored, and a request carrying `Authorization` is neither
served from nor stored into the shared cache.

The key prefix moves to `respcache:v2:`, which strands existing URL-keyed
entries rather than reusing them under the new scoping rules.

See ADR 0021 §3.
