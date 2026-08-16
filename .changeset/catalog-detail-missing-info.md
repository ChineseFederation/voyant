---
"@voyant-travel/catalog-react": patch
"@voyant-travel/cruises": patch
"@voyant-travel/inventory": patch
---

Restore the content catalog detail pages were dropping.

Resolve a sourced cruise's adapter by its own `source_kind` scoped to the
connection before falling back to the bare connection id. A channel registers
several adapters per connection and keys them apart by suffixing the registry
key (`<connectionId>:cruises`), so resolving by connection alone returned the
connection's *generic* adapter. That adapter carries no `cruiseAdapter`, so
`getCruiseSailingPricing` reached through it for nothing and every
connection-scoped cruise reported no cabin pricing at all.

Read the projection's own camelCase keys in the cruise content synthesizer. It
read the snake_case names of the content shape it produces, which overlapped the
shim's projection on `id`/`name`/`status` and nothing else, so the fallback
rendered blank even when discovery had captured the data.

Stamp the provider key rather than the connection id as a sourced cruise's
`source_provider`, and project the cruise line, ship and port display names
alongside their faceted ids. The shim read `sourceRef.provider` while Voyant
Connect writes `providerKey`, so the fallback fired every time and a raw
`conn_…` string surfaced as the cruise line on the detail page.

Read the indexed document by id on the URL-addressable vertical detail pages.
Entered by id there is no result row to carry the index projection, so price,
offers, status, categories, destinations and the whole Attributes tab were
dropped — the same record showed far more when opened as a sheet from the list.
The supplier formatter is now held by ref so the supplier directory settling no
longer rebuilds the fetchers and re-requests the record (one page load issued the
content route three times).

Fall back to an itinerary-day image for an owned product's hero when it has no
product-level image, instead of reporting no hero while the same image sits in
`content.media`.

Degrade to the synthesizer when a cruise adapter's `getContent` fails, rather
than letting the throw escape and 500 the detail route. We hold a durable
sourced-entry projection and §3.6 defines the synthesizer as exactly that
degraded read, so an upstream miss should not blank the page. On sandbox,
`resolveCruiseRow` in `@voyant-travel/connect-adapter` throws
`Connect cruise content not found` for cruises discovery has already indexed,
which turned every concurrent cruise detail open into a 500. The failure is
reported through the new `onContentFetchError` option (defaulting to
`console.warn`) so an upstream outage stays visible instead of silently
degrading every cruise to a stub.
