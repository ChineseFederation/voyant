---
"@voyant-travel/storage": minor
"@voyant-travel/media": minor
"@voyant-travel/runtime": patch
---

Derive media delivery URLs at read time instead of persisting a CDN origin

`media_asset.url` stored a fully-qualified delivery URL captured at upload time,
so any change to the media CDN hostname invalidated every row at once — the
bucket, the object keys and `storage_key` stayed correct, but the library
rendered nothing until the rows were rewritten by hand.

`storage_key` is now the only durable locator. `StorageProvider` gains an
optional `publicUrl(key)` that composes the delivery URL from the provider's
currently configured origin, and `@voyant-travel/media` calls it on every read.
The wire shape is unchanged: responses still carry `url`, it is just derived
rather than stored. `url` is `null` when the store exposes no public origin, and
consumers already fall back to the deployment's own byte-serving route
(`GET /v1/admin/media/{storageKey}`).

The gateway provider now derives from a `publicBaseUrl` wired from
`MEDIA_PUBLIC_BASE_URL`, so the origin lives in one configurable place. **A
deployment selecting the `gateway` storage provider must set
`MEDIA_PUBLIC_BASE_URL`** — the gateway mints delivery URLs server-side, so
there is nothing else to derive from, and falling back to the deployment's own
`/v1/admin/media/*` route is not viable because that route is staff-guarded and
storefront guests would render nothing. It fails closed at provider construction
with an actionable message rather than degrading silently.

A migration drops the `media_asset.url` column.
