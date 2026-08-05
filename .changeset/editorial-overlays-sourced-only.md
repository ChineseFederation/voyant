---
"@voyant-travel/inventory": minor
"@voyant-travel/inventory-react": minor
"@voyant-travel/accommodations": patch
"@voyant-travel/i18n": patch
---

Editorial overlays are sourced-only. An owned product no longer has an overlay
collection at all, and the operator's product page no longer offers one.

An overlay exists to restate content the operator does not control — provider
copy from a Connect package, a bedbank, a GDS. An owned product's copy is
authored in `product_translations`, `product_day_translations`, and the
option/service equivalents, which the operator edits directly. Layering an
overlay on top gave one field two authoring surfaces, with the overlay the
silent winner and no indication in the editor that it had shadowed the row.

In the operator UI this never worked at all. Every row in `products` is owned by
construction — sourced products live in `catalog_sourced_entries` and surface at
`/catalog/products/:id`, not in the products table — so `/products/:id` mounted
an editor whose subject could not exist. The read model's `sourced` flag was
supposed to hide it, but the flag only arrives if the fetch succeeds, so what an
operator actually saw was a red "Failed to load editorial content" card wedged
between Media and Itinerary.

What changed:

- `getProductContent` and `getAccommodationContent` serve the owned branch as
  authored and never read the overlay store. The sourced branches
  (`sourced-cache`, `sourced-fresh`, `synthesized`) merge overlays exactly as
  before.
- `readProductEditorialOverlayState`, `writeProductEditorialOverlay`,
  `clearProductEditorialOverlay`, and `listProductEditorialOverlayHistory` throw
  the new `OwnedProductNotOverlayableError` for an owned subject. Ownership is
  the absence of a `catalog_sourced_entries` row.
- `GET`, `PUT`, `DELETE`, and `GET .../history` on
  `/v1/admin/products/{id}/editorial-overlays` answer `404 not_overlayable`
  rather than 500-ing, or writing a row that read-time merge would now ignore.
- `ProductEditorialOverlaySection` is no longer mounted on the owned product
  detail page. It stays exported as the authoring surface for sourced product
  content; the operator has no host for that today.
- The read model drops `sourced` from its payload — it is `true` on every
  response the endpoint can now produce. `contentSource` still reports which
  sourced branch served the comparison.

The ownership check reaches `readSourcedEntry` through
`@voyant-travel/catalog/services/sourced-entry` rather than the package barrel.
`service-editorial-overlays.ts` sits in the admin route graph, and the barrel
pulls the whole catalog plane in behind it — enough to roughly double transform
and import time for anything that loads those routes.

No data migration ships with this. The editor returned `null` for owned
subjects from the day it landed, so no owned overlay was ever authored through
it; any row that predates that is inert rather than wrong, and `catalog_overlay`
keeps its history.
