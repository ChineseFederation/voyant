---
"@voyant-travel/cruises-react": minor
"@voyant-travel/cruises": minor
"@voyant-travel/i18n": minor
---

Give ships a surface of their own.

`cruise_ships` already carried the fleet — IMO, decks, cabin and guest capacity, length, cruising speed, year built and refurbished, gallery, deck plan — behind admin and public REST routes, editorial overlays, a field policy and a document builder. There was no way for an operator to look at one.

A vessel is referenced by many sailings and outlives all of them, so Ships browses and reads on its own pages rather than as a tab inside whichever cruise happened to be open: `/catalog/ships` and `/catalog/ships/$shipId`, contributed by `@voyant-travel/cruises-react/admin` and declared on the cruises module's admin facet.

It is a plain list off the ships route rather than an indexed catalog vertical. There is no ships collection in the search index to facet against, and standing one up to power a reference list of a few hundred rows would be a lot of machinery for no gain.

A ship row is sparse in practice — a sourced vessel often arrives with a name, a type and nothing else — so an absent specification is omitted rather than rendered as a dash. Otherwise the page fills with placeholders and buries the two facts that did come through.

`cruises-react`'s tests are now typechecked in CI (the tsconfig split from #4243, so `dist` is unaffected). The destinations test is a compile-time proof, and a proof nothing typechecks proves nothing — `verify:typecheck-coverage`'s baseline shrinks from 56 packages to 55.
