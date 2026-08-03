---
"@voyant-travel/catalog": minor
"@voyant-travel/plugin-voyant-connect": minor
---

Resolve the catalog's inventory channel through a runtime port instead of
importing Voyant Connect.

`CatalogSourcesRuntimeExtension` is the channel contract — `registerFallback`
for the synchronous cold window, `warm` for per-connection enumeration, and
`resolveDestinationNames`. It is optional: a deployment may bind no channel.

Voyant Connect now provides that port rather than being imported by the catalog
spine, so it is one channel implementation and a self-hosted integration can
provide its own. This also removes the
`catalog -> plugin-voyant-connect -> cruises -> catalog` dependency cycle, which
had been hiding as a build-ordering race.
