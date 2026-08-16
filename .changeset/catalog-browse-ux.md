---
"@voyant-travel/catalog-react": minor
"@voyant-travel/i18n": minor
---

Make the catalog browse surfaces read in the operator's language rather than the index's.

- **A family page names its schedule entries correctly.** `scheduleTerm` is resolved once upstream and carried on the catalog document, but the card ignored it and called everything a departure. A timed Activity now has sessions and an Event has dates.
- **A timed product shows its time.** An instant carries an hour, which is what distinguishes a 09:00 sailing from an 18:00 one; the card showed only the calendar day. Hovering gives the same instant in the departure's zone and the reader's, and offers nothing when there is nothing to convert — a bare calendar date, or a reader already in that zone.
- **A one-day product reads `1d`, not `1d / 0n`.** Zero nights is the absence of an overnight, not a measurement worth printing.
- **Facet values are labels, not codes.** The rail leaned on CSS `capitalize`, which does not treat `_` as a word break, so `free_sale` reached the operator as "Free_sale". Codes are now read as sentences: "Free sale".
- **A surface no longer offers the facet it pins.** A family view is `familyCode = tour`; rendering that in the rail as a checked box with a Clear link advertised a choice the surface does not allow and restated the page title. `hiddenFilterFields` on `CatalogPage` drops it; the filter still applies.
- **Booking mode is no longer a filter.** It is a derived integration mechanic (ADR-0010), not something anyone browses by.
- **Family pages have search.** They embed the browse grid, which suppresses its own search box so there is one search per page — but nothing supplied that one, so a family view had no free-text search at all. `CatalogSearchInput` is now shared by both surfaces, which also removes the duplicated typing-buffer and debounce from `CatalogSearchPage`.
- **Family taglines say what belongs in the family** instead of restating the heading ("Products in the Activity family.").
