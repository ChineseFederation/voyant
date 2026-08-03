---
"@voyant-travel/catalog-contracts": minor
"@voyant-travel/catalog": minor
"@voyant-travel/catalog-react": minor
"@voyant-travel/inventory": minor
"@voyant-travel/trips-react": minor
---

Stop treating Extras as independently sellable catalog inventory.

An Extra — an optional lunch, an attraction ticket — is lifecycle-dependent on
the Product Booking that carries it. It is authored on the Product's Plan and
Options, selected while the Booking is made, and fulfilled on the Departure. It
was nonetheless still modelled as a first-class catalog vertical: it had a
browse tab, filters, an entry in `DEFAULT_CATALOG_VERTICALS`, and document
builders that could write it into the search index.

`PRODUCT_OWNED_VERTICALS` in `@voyant-travel/catalog-contracts/indexer/contract`
now names the verticals that exist only so their parent can freeze a booking
snapshot, with `isProductOwnedVertical` / `owningVerticalFor` to read it.
Consequently:

- `extras` leaves `DEFAULT_CATALOG_VERTICALS`, so no extras slice or collection
  is provisioned and nothing can be indexed into one.
- `POST /v1/{admin,public}/catalog/search` answers a product-owned vertical with
  `400 { reason: "not_independently_sellable", ownedBy }` instead of silently
  returning nothing, so an old deep link can explain itself.
- The shared Catalog page drops the Extras tab, its columns and its filters, and
  renders a compatibility notice for `?tab=extras` pointing at the owning
  Product rather than falling through to a different result set.
- `@voyant-travel/inventory/extras` no longer exports `createExtraDocumentBuilder`
  or `createExtraDocumentEmitter`; every extras field policy is now
  `reindex: "none"`. Snapshot and provenance helpers are unchanged — they are how
  the owning Product records what it sold.
- `CatalogVertical` in the Trip composer no longer admits `extras`.

`verify:extras-lifecycle` holds the line, and also refuses any migration that
would promote an existing Extra into a Product or Component Booking — that is a
commercial decision an operator makes deliberately, not a backfill.
