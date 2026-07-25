# @voyant-travel/catalog-react

The catalog client tier: headless data hooks/clients plus the styled UI
primitives and page-level compositions (formerly `@voyant-travel/catalog-ui`).

Headless consumers (storefronts, portals) import from the root, `./hooks`,
`./client`, or `./booking-engine` — these pull no styling peers. Styled
surfaces live under `./ui`, `./components/*`, `./admin`, `./i18n`, and
`./styles.css`, whose heavier peers (`@voyant-travel/ui`, `@voyant-travel/admin`,
`@tanstack/react-table`, `sonner`) are optional and only needed when you
import those subpaths.

## Page Compositions

`CatalogPage` owns the tabbed catalog search layout and default vertical columns.
Apps provide routing and deployment-specific behavior through callbacks:

- `search`, `onTabChange`, `onQueryChange`, and `onPageChange` for URL state.
- `formatSupplier` for supplier id labels.
- `onOpenProductEditor` and `onLoadProductDetail` for route transitions and
  content APIs.
- `detailSheetWidth`, `detailHeaderExtras`, `renderDetailBrochure`,
  `renderDetailMedia`, `renderDetailItineraryDay`, and
  `renderDetailExtraSections` for consumer-specific catalog detail sections
  such as brochure downloads, print actions, provenance cards, and richer
  media or itinerary layouts.

The package no longer exposes a routed quote-to-book page. Quote and draft
hooks remain available for explicitly composed staff tools.

## I18n

The package exports `CatalogUiMessagesProvider`, `catalogUiEn`, and
`catalogUiRo` from `@voyant-travel/catalog-react/i18n`. Components fall back to English
when no provider is mounted.
