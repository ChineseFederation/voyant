# @voyant-travel/inventory-react

## 0.103.0

### Patch Changes

- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
  - @voyant-travel/finance@0.221.0
  - @voyant-travel/storefront-react@0.223.0
  - @voyant-travel/inventory@0.24.0
  - @voyant-travel/operations@0.11.4
  - @voyant-travel/finance-react@0.221.0
  - @voyant-travel/catalog-react@0.219.0

## 0.102.0

### Patch Changes

- Updated dependencies [8adeb23]
- Updated dependencies [7496159]
  - @voyant-travel/finance@0.220.0
  - @voyant-travel/i18n@0.119.0
  - @voyant-travel/inventory@0.23.5
  - @voyant-travel/finance-react@0.220.0
  - @voyant-travel/operations@0.11.3
  - @voyant-travel/types@0.109.10
  - @voyant-travel/storefront-react@0.222.0
  - @voyant-travel/admin@0.131.1
  - @voyant-travel/catalog-react@0.218.0
  - @voyant-travel/media-react@0.7.2

## 0.101.0

### Patch Changes

- @voyant-travel/storefront-react@0.221.0
- @voyant-travel/finance-react@0.219.0
- @voyant-travel/catalog-react@0.217.0
- @voyant-travel/finance@0.219.0
- @voyant-travel/inventory@0.23.4
- @voyant-travel/operations@0.11.2

## 0.100.0

### Patch Changes

- Updated dependencies [a799849]
  - @voyant-travel/finance@0.218.0
  - @voyant-travel/inventory@0.23.1
  - @voyant-travel/finance-react@0.218.0
  - @voyant-travel/catalog-react@0.216.0
  - @voyant-travel/storefront-react@0.220.0
  - @voyant-travel/operations@0.11.1

## 0.99.0

### Patch Changes

- d3f16d5: Add exhaustive atomic product unit-configuration previews and confirmed applies, make departure creation durably idempotent with immediate projection signals, serialize partial departure timing updates with optional stale-snapshot conflicts while preserving patch compatibility, keep departure product ownership immutable, and label departure times with their configured timezone.
- Updated dependencies [d3f16d5]
  - @voyant-travel/inventory@0.23.0
  - @voyant-travel/operations@0.11.0
  - @voyant-travel/catalog-react@0.215.0
  - @voyant-travel/finance-react@0.217.0
  - @voyant-travel/storefront-react@0.219.0
  - @voyant-travel/finance@0.217.0

## 0.98.0

### Minor Changes

- 903c754: Restore a first-class manual booking flow for operator staff.

  Bookings now expose a route-backed **New booking** action and a focused form
  that collects the product/departure, billing contact, travelers, payment
  schedule, price, notes, and initial status. The form defaults to `on_hold`,
  requires an explicit review confirmation, and dispatches through Finance's
  durable `create_booking` Tool with an authoritative booking number and a stable
  idempotency key for safe retries.

  Operated product details also expose **Create booking** with the product
  preselected, and the new flow includes English and Romanian operator copy.

### Patch Changes

- Updated dependencies [903c754]
  - @voyant-travel/i18n@0.118.3
  - @voyant-travel/finance@0.216.0
  - @voyant-travel/inventory@0.22.4
  - @voyant-travel/finance-react@0.216.0
  - @voyant-travel/catalog-react@0.214.0
  - @voyant-travel/storefront-react@0.218.0
  - @voyant-travel/operations@0.10.7

## 0.97.0

### Patch Changes

- Updated dependencies [6c76de3]
  - @voyant-travel/i18n@0.118.2
  - @voyant-travel/finance@0.215.0
  - @voyant-travel/inventory@0.22.2
  - @voyant-travel/storefront-react@0.217.0
  - @voyant-travel/finance-react@0.215.0
  - @voyant-travel/catalog-react@0.213.0
  - @voyant-travel/operations@0.10.6

## 0.96.0

### Patch Changes

- bf20d76: Add an `Image` component that renders a neutral placeholder icon when a source
  is missing or fails to load, instead of the browser's broken-image glyph and
  leaked file name. Layout classes are applied to the placeholder as well, so a
  missing asset no longer collapses or shifts the surrounding grid.

  Product media surfaces in the admin — the media gallery, tiles, lightbox, day
  media tray, day rows, quick view, editorial overlay previews, and the SEO
  sharing social preview — now render through it.

- bf20d76: Align the SEO & sharing locale row on the product detail page. The content
  locale select and the add-locale field now sit in an even two-column grid that
  spans the section width, so the row lines up with the SEO title, SEO
  description, and Open Graph fields below it instead of stopping short. The
  add-locale input also gains a visible label, and the locale and Open Graph
  labels are now associated with their controls.
- Updated dependencies [bf20d76]
  - @voyant-travel/ui@0.110.0
  - @voyant-travel/admin@0.131.0
  - @voyant-travel/catalog-react@0.212.0
  - @voyant-travel/finance-react@0.214.0
  - @voyant-travel/media-react@0.7.0
  - @voyant-travel/storefront-react@0.216.0
  - @voyant-travel/finance@0.214.0
  - @voyant-travel/inventory@0.22.1
  - @voyant-travel/operations@0.10.5

## 0.95.1

### Patch Changes

- 91f1c80: Resolve departure times in the slot's own timezone on the product detail page.

  A slot's `startsAt`/`endsAt` are true UTC instants — the server validates
  `dateLocal` by converting `startsAt` through the slot's `timezone`. The product
  page ignored that zone on both sides:

  - **Read:** `formatSlotTime` / `formatSlotDate` used `getUTC*`, so a departure
    stored as `2026-11-20T12:00:00Z` in `Europe/Bucharest` rendered as 12:00
    instead of 14:00. The End column was wrong in date as well as time, and
    `formatDuration` inherited the error for itineraries crossing local midnight.
  - **Write:** `combineLocalToIso` committed the operator's entered wall clock
    straight through as UTC, so a departure entered as "14:00, Europe/Bucharest"
    was stored as `14:00Z` and actually ran at 16:00 local.

  The two were wrong in mirror image, so they agreed with each other while the
  Availability page — which converts correctly — showed a different time for the
  same slot. Both now go through `instantToSlotLocal` / `localToInstant` from
  `@voyant-travel/operations/scheduling`. Entering a local time that does not
  exist (the spring-forward gap) is now a field error rather than a silently
  shifted instant.

  `formatSlotTime` and `formatSlotDate` take the slot timezone as a second
  argument.

- Updated dependencies [91f1c80]
  - @voyant-travel/i18n@0.118.1

## 0.95.0

### Patch Changes

- Updated dependencies [9d84e82]
  - @voyant-travel/inventory@0.22.0
  - @voyant-travel/finance-react@0.213.0
  - @voyant-travel/catalog-react@0.211.0
  - @voyant-travel/storefront-react@0.215.0
  - @voyant-travel/finance@0.213.0

## 0.94.0

### Patch Changes

- @voyant-travel/inventory@0.21.12
- @voyant-travel/finance-react@0.212.0
- @voyant-travel/catalog-react@0.210.0
- @voyant-travel/storefront-react@0.214.0
- @voyant-travel/finance@0.212.0

## 0.93.0

### Patch Changes

- @voyant-travel/inventory@0.21.10
- @voyant-travel/finance-react@0.211.0
- @voyant-travel/catalog-react@0.209.0
- @voyant-travel/storefront-react@0.213.0
- @voyant-travel/finance@0.211.0

## 0.92.0

### Patch Changes

- @voyant-travel/storefront-react@0.212.0
- @voyant-travel/finance-react@0.210.0
- @voyant-travel/catalog-react@0.208.0
- @voyant-travel/finance@0.210.0
- @voyant-travel/inventory@0.21.9

## 0.91.0

### Patch Changes

- @voyant-travel/inventory@0.21.8
- @voyant-travel/finance-react@0.209.0
- @voyant-travel/catalog-react@0.207.0
- @voyant-travel/storefront-react@0.211.0
- @voyant-travel/finance@0.209.0

## 0.90.0

### Patch Changes

- Updated dependencies [1873611]
  - @voyant-travel/admin@0.130.0
  - @voyant-travel/i18n@0.118.0
  - @voyant-travel/catalog-react@0.206.0
  - @voyant-travel/finance-react@0.208.0
  - @voyant-travel/media-react@0.6.0
  - @voyant-travel/storefront-react@0.210.0
  - @voyant-travel/finance@0.208.0
  - @voyant-travel/inventory@0.21.7

## 0.89.0

### Patch Changes

- @voyant-travel/finance@0.207.0
- @voyant-travel/inventory@0.21.2
- @voyant-travel/finance-react@0.207.0
- @voyant-travel/catalog-react@0.205.0
- @voyant-travel/storefront-react@0.209.0

## 0.88.0

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/i18n@0.117.3
  - @voyant-travel/finance@0.206.0
  - @voyant-travel/inventory@0.21.1
  - @voyant-travel/storefront-react@0.208.0
  - @voyant-travel/finance-react@0.206.0
  - @voyant-travel/catalog-react@0.204.0

## 0.87.0

### Patch Changes

- Updated dependencies [58baffe]
  - @voyant-travel/inventory@0.21.0
  - @voyant-travel/finance@0.205.0
  - @voyant-travel/finance-react@0.205.0
  - @voyant-travel/storefront-react@0.207.0
  - @voyant-travel/catalog-react@0.203.0

## 0.86.0

### Patch Changes

- 9e57a5d: Add localized alt text, canonical delivery URLs, and an optional authenticated
  site/CMS bridge to the shared media library.
- Updated dependencies [9e57a5d]
  - @voyant-travel/media-react@0.5.0
  - @voyant-travel/catalog-react@0.202.0
  - @voyant-travel/finance-react@0.204.0
  - @voyant-travel/storefront-react@0.206.0
  - @voyant-travel/finance@0.204.0
  - @voyant-travel/inventory@0.20.1

## 0.85.0

### Patch Changes

- Updated dependencies [17f1239]
  - @voyant-travel/finance@0.203.0
  - @voyant-travel/catalog-react@0.201.0
  - @voyant-travel/inventory@0.20.0
  - @voyant-travel/finance-react@0.203.0
  - @voyant-travel/storefront-react@0.205.0

## 0.84.0

### Patch Changes

- @voyant-travel/storefront-react@0.204.0
- @voyant-travel/finance-react@0.202.0
- @voyant-travel/catalog-react@0.200.0
- @voyant-travel/finance@0.202.0
- @voyant-travel/inventory@0.19.6

## 0.83.0

### Patch Changes

- Updated dependencies [5e03ae7]
  - @voyant-travel/finance@0.201.0
  - @voyant-travel/finance-react@0.201.0
  - @voyant-travel/inventory@0.19.4
  - @voyant-travel/storefront-react@0.203.0
  - @voyant-travel/catalog-react@0.199.0

## 0.82.0

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/utils@0.110.0
  - @voyant-travel/finance-react@0.200.0
  - @voyant-travel/inventory@0.19.3
  - @voyant-travel/finance@0.200.0
  - @voyant-travel/ui@0.109.6
  - @voyant-travel/storefront-react@0.202.0
  - @voyant-travel/catalog-react@0.198.0

## 0.81.0

### Patch Changes

- @voyant-travel/finance@0.199.0
- @voyant-travel/inventory@0.19.2
- @voyant-travel/finance-react@0.199.0
- @voyant-travel/catalog-react@0.197.0
- @voyant-travel/storefront-react@0.201.0

## 0.80.1

### Patch Changes

- e2cb9f5: Unify the product booking-mode vocabulary. The products table column, detail
  chips, and the editor picker now all use the same short labels (Multi-day tour,
  Accommodation, Day trip, Timed activity, Transfer, Open-dated voucher, Other)
  instead of the table showing terse words (Itinerary, Date, Stay) while the editor
  showed long descriptive ones. The pricing basis (rooms & nights / per person) is
  kept as a secondary hint shown only inside the picker.
- e2cb9f5: Give every admin screen consistent page spacing. Previously each page invented
  its own padding (`p-6`, `px-6 py-6 lg:px-8`, `container mx-auto py-6` with no
  horizontal padding, or none at all), so screens like the booking engine had no
  spacing while others differed.

  The admin workspace layout now wraps the page outlet in a single padded content
  region (`px-4 py-6 md:px-6`), and the per-page root padding was removed so it no
  longer double-pads (max-width caps are kept). The full-height settings two-pane
  bleeds back out of that padding and re-applies its own so it stays edge-to-edge.

- e2cb9f5: Fix double page padding. The admin shell already applies consistent page
  padding around the content area, but a number of page and loading-skeleton
  components still added their own `p-6` on top, pushing their content ~24px
  further in than the page header and leaving pages inconsistently indented.
  Those redundant root paddings are removed so every page's content lines up with
  the header and with each other. Dialog, portal, and card paddings are
  unchanged.
- e2cb9f5: Move heavy multi-field forms from centered dialogs to side sheets. Create/edit
  forms with more than a handful of fields (invoices, bookings, travelers,
  markets, pricing rules, policies, suppliers, resources, legal templates,
  notification templates, and similar) were rendered as centered modals; per the
  dialog-vs-sheet guidance, complex multi-field editing belongs in a side sheet
  that keeps the parent screen visible. Confirmations, media viewers, and short
  one-to-three-field dialogs are unchanged.
- e2cb9f5: Make form-field grids responsive on mobile. Two-column (and three/four-column) field grids that previously rendered multiple columns at every width now stack to a single column on small screens and expand at the `sm`/`lg` breakpoints, so forms and dialogs are no longer cramped on phones.
- e2cb9f5: Plain-language copy pass across the admin UI. Rewrites microcopy on the
  non-developer screens so it reads for travel professionals rather than
  engineers: removes developer jargon (entity, tenant, adapter/connector,
  payload, sync/reconcile internals, raw database column names and code
  fragments), strips internal/roadmap notes that leaked into user copy, cuts
  verbose and redundant helper text, and aligns terminology to the canonical
  Ubiquitous Language (Traveler over pax/guest, Supplier, Quote/Quote Version,
  "record" instead of "entity") with consistent sentence case. English catalog
  copy only; ICU placeholders and en/ro key parity preserved.
- e2cb9f5: Polish pass on flagged UI issues. The product activity feed no longer shows raw
  principal IDs or camelCase field names (it now shows a readable actor type and
  plain field names). The product "Extras" section header now matches the sibling
  "Rooms & prices" header style. Empty dashboard metrics render a lighter,
  less-prominent placeholder instead of a full-weight dash. And the person and
  organization create/edit forms now open as right-side sheets with a sticky
  footer (matching the convention for larger forms) instead of tall centered
  dialogs.
- e2cb9f5: Expand the products list Filters with Type, Booking mode, Visibility, Tag, and a
  Departure window. Type/Booking mode/Visibility/Tag reuse query params the list
  endpoint already supported; the Departure window is a new `departureFrom`/
  `departureTo` query param that keeps only products with an upcoming open
  departure whose date falls in the chosen range (filtered on availability slots,
  independent of the product's own start date).
- e2cb9f5: Bring the Romanian (ro) admin translations in line with the plain-language
  English copy pass — re-translating the updated strings so the Romanian UI drops
  the same jargon and reads as clearly as the English. Values only; en/ro key
  parity and ICU placeholders preserved.
- e2cb9f5: Make form and dialog select triggers full-width. The shared `SelectTrigger`
  defaults to `w-fit`, so selects that sit in a form or dialog next to full-width
  inputs rendered noticeably narrower. Add `w-full` at those call sites (filter
  popovers, dialogs, and stacked form fields). Toolbar and inline selects that
  carry an intentional fixed width are left unchanged.
- e2cb9f5: Align off-scale spacing utilities to the shared scale: gap-5 to gap-4, p-5 to
  p-6, space-y-5 to space-y-4, space-y-8 to space-y-6, p-10/p-12 to p-8, gap-8 to
  gap-6. Keeps spacing on the consistent 1/2/3/4/6/8 scale used across the app.
- e2cb9f5: Replace native browser dialogs with styled UI-package dialogs across the admin
  surface. Adds `confirmDialog`/`ConfirmDialogHost` and `promptDialog`/
  `PromptDialogHost` to `@voyant-travel/ui`, mounts both hosts once in the
  operator admin shell, and migrates every `window.confirm`/`window.prompt` call
  and stray `window.alert` in the `*-react` packages to the styled equivalents
  (destructive confirmations rendered with the destructive action variant). Also
  fixes the event-catalog "selected event contracts" count to use ICU plural
  formatting.
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
  - @voyant-travel/i18n@0.117.2
  - @voyant-travel/finance-react@0.198.1
  - @voyant-travel/storefront-react@0.200.1
  - @voyant-travel/admin@0.129.1
  - @voyant-travel/catalog-react@0.196.1
  - @voyant-travel/media-react@0.4.1
  - @voyant-travel/ui@0.109.5
  - @voyant-travel/inventory@0.19.1
  - @voyant-travel/finance@0.198.1

## 0.80.0

### Patch Changes

- @voyant-travel/inventory@0.19.0
- @voyant-travel/storefront-react@0.200.0
- @voyant-travel/finance-react@0.198.0
- @voyant-travel/catalog-react@0.196.0
- @voyant-travel/finance@0.198.0

## 0.79.0

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/finance@0.197.0
  - @voyant-travel/inventory@0.18.0
  - @voyant-travel/storefront-react@0.199.0
  - @voyant-travel/catalog-react@0.195.0
  - @voyant-travel/finance-react@0.197.0

## 0.78.0

### Patch Changes

- Updated dependencies [0190317]
- Updated dependencies [58020ec]
- Updated dependencies [bf548af]
  - @voyant-travel/inventory@0.17.0
  - @voyant-travel/finance@0.196.0
  - @voyant-travel/storefront-react@0.198.0
  - @voyant-travel/finance-react@0.196.0
  - @voyant-travel/catalog-react@0.194.0

## 0.77.0

### Patch Changes

- @voyant-travel/finance@0.195.0
- @voyant-travel/inventory@0.16.2
- @voyant-travel/finance-react@0.195.0
- @voyant-travel/catalog-react@0.193.0
- @voyant-travel/storefront-react@0.197.0

## 0.76.0

### Patch Changes

- Updated dependencies [dd370ca]
  - @voyant-travel/inventory@0.16.1
  - @voyant-travel/finance-react@0.194.0
  - @voyant-travel/catalog-react@0.192.0
  - @voyant-travel/storefront-react@0.196.0
  - @voyant-travel/finance@0.194.0

## 0.75.0

### Minor Changes

- 90d44c0: Add the operator editorial-overlay editor for sourced products: configured-locale switching, side-by-side provider/overlay/effective comparison on wide screens with an accessible tabbed compare on narrow ones, overlay-only translation authoring, media-library-backed image overlays, customer preview, confirmed clear, and optimistic-concurrency conflict reporting.

  The product editorial-overlay admin read model now enumerates every eligible field (not only fields that already carry an overlay) and reports per-field `exact`, `language-fallback`, `source-fallback`, `overlaid`, `overlay-only`, `missing`, `invalid`, and `orphaned` state plus drift against the provider's last source update, the cached source locales, and whether the entity is provider-sourced.

  `useLocale()` now exposes the deployment's `supportedLocales`, and the catalog overlay service exposes `fetchOverlayRowsForEntity` for admin surfaces that need overlay audit columns.

### Patch Changes

- Updated dependencies [a43267a]
- Updated dependencies [90d44c0]
- Updated dependencies [2c79bef]
  - @voyant-travel/catalog-contracts@0.112.1
  - @voyant-travel/inventory@0.16.0
  - @voyant-travel/admin@0.129.0
  - @voyant-travel/i18n@0.117.0
  - @voyant-travel/catalog-react@0.191.0
  - @voyant-travel/finance-react@0.193.0
  - @voyant-travel/media-react@0.4.0
  - @voyant-travel/storefront-react@0.195.0
  - @voyant-travel/finance@0.193.0

## 0.74.1

### Patch Changes

- 130f62c: Expose owned-product SEO metadata and Open Graph images through the product admin and storefront surfaces.
- Updated dependencies [130f62c]
  - @voyant-travel/inventory@0.15.4
  - @voyant-travel/i18n@0.116.1

## 0.74.0

### Patch Changes

- Updated dependencies [e68a705]
  - @voyant-travel/finance@0.192.0
  - @voyant-travel/finance-react@0.192.0
  - @voyant-travel/storefront-react@0.194.0
  - @voyant-travel/catalog-react@0.190.0
  - @voyant-travel/inventory@0.15.2

## 0.73.0

### Patch Changes

- Updated dependencies [f6aa3a1]
  - @voyant-travel/finance@0.191.0
  - @voyant-travel/finance-react@0.191.0
  - @voyant-travel/inventory@0.15.1
  - @voyant-travel/catalog-react@0.189.0
  - @voyant-travel/storefront-react@0.193.0

## 0.72.0

### Patch Changes

- Updated dependencies [f945310]
  - @voyant-travel/inventory@0.15.0
  - @voyant-travel/finance@0.190.0
  - @voyant-travel/types@0.109.9
  - @voyant-travel/storefront-react@0.192.0
  - @voyant-travel/finance-react@0.190.0
  - @voyant-travel/catalog-react@0.188.0

## 0.71.0

### Patch Changes

- Updated dependencies [d9ff078]
  - @voyant-travel/catalog-contracts@0.112.0
  - @voyant-travel/inventory@0.14.28
  - @voyant-travel/catalog-react@0.187.0
  - @voyant-travel/storefront-react@0.191.0
  - @voyant-travel/finance-react@0.189.0
  - @voyant-travel/finance@0.189.0

## 0.70.0

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/utils@0.109.0
  - @voyant-travel/finance@0.188.0
  - @voyant-travel/inventory@0.14.27
  - @voyant-travel/ui@0.109.4
  - @voyant-travel/catalog-react@0.186.0
  - @voyant-travel/finance-react@0.188.0
  - @voyant-travel/storefront-react@0.190.0

## 0.69.0

### Minor Changes

- 0b7f213: Wire the media library into product and itinerary-day media management. The
  "Upload" action on the product detail gallery and the itinerary-day media tray
  now opens the media library picker — a dialog where you can select existing
  assets or upload new ones — instead of a bare file input. Selected assets are
  linked to the product/day (`assetId`) and served through the shared media
  byte route so uploads surface in the library and vice versa.

### Patch Changes

- @voyant-travel/catalog-react@0.185.0
- @voyant-travel/finance-react@0.187.0
- @voyant-travel/storefront-react@0.189.0
- @voyant-travel/finance@0.187.0
- @voyant-travel/inventory@0.14.24

## 0.68.0

### Minor Changes

- 5af8682: Route inline product-media uploads through the Media Library. Uploading a file
  from the product media section or an itinerary day now creates a library asset
  (so it appears in the Media Library) and attaches it to the product via
  `assetId`, mirroring the byte-URL convention used by library-picked assets. The
  host-provided `uploadMedia` storage handler stays supported as an optional
  legacy fallback.

### Patch Changes

- @voyant-travel/catalog-react@0.184.0
- @voyant-travel/finance-react@0.186.0
- @voyant-travel/storefront-react@0.188.0
- @voyant-travel/finance@0.186.0
- @voyant-travel/inventory@0.14.22

## 0.67.0

### Patch Changes

- Updated dependencies [e7e90bf]
  - @voyant-travel/finance@0.185.0
  - @voyant-travel/finance-react@0.185.0
  - @voyant-travel/inventory@0.14.21
  - @voyant-travel/catalog-react@0.183.0
  - @voyant-travel/storefront-react@0.187.0

## 0.66.0

### Minor Changes

- a33c590: Add a "Choose from Media Library" action to the product media section so
  operators can attach existing library assets to a product or itinerary day
  instead of only uploading new files. Product media now records the source
  asset reference (`assetId`) alongside the derived byte URL, kind, mime type,
  and size.

### Patch Changes

- Updated dependencies [a33c590]
  - @voyant-travel/inventory@0.14.20
  - @voyant-travel/catalog-react@0.182.0
  - @voyant-travel/finance-react@0.184.0
  - @voyant-travel/storefront-react@0.186.0
  - @voyant-travel/finance@0.184.0

## 0.65.0

### Patch Changes

- @voyant-travel/finance@0.183.0
- @voyant-travel/storefront-react@0.185.0
- @voyant-travel/finance-react@0.183.0
- @voyant-travel/catalog-react@0.181.0
- @voyant-travel/inventory@0.14.19

## 0.64.1

### Patch Changes

- Updated dependencies [f0f51b4]
  - @voyant-travel/i18n@0.116.0
  - @voyant-travel/admin@0.128.3
  - @voyant-travel/catalog-react@0.180.2
  - @voyant-travel/finance-react@0.182.4
  - @voyant-travel/storefront-react@0.184.2
  - @voyant-travel/finance@0.182.4

## 0.64.0

### Patch Changes

- @voyant-travel/storefront-react@0.184.0
- @voyant-travel/finance-react@0.182.0
- @voyant-travel/catalog-react@0.180.0
- @voyant-travel/finance@0.182.0
- @voyant-travel/inventory@0.14.15

## 0.63.0

### Patch Changes

- Updated dependencies [464815c]
- Updated dependencies [464815c]
  - @voyant-travel/finance@0.181.0
  - @voyant-travel/i18n@0.115.1
  - @voyant-travel/inventory@0.14.13
  - @voyant-travel/finance-react@0.181.0
  - @voyant-travel/catalog-react@0.179.0
  - @voyant-travel/storefront-react@0.183.0

## 0.62.1

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/i18n@0.115.0
  - @voyant-travel/finance@0.180.1
  - @voyant-travel/inventory@0.14.12
  - @voyant-travel/admin@0.128.2
  - @voyant-travel/catalog-react@0.178.1
  - @voyant-travel/finance-react@0.180.1
  - @voyant-travel/storefront-react@0.182.1

## 0.62.0

### Patch Changes

- Updated dependencies [ecf1680]
  - @voyant-travel/storefront-react@0.182.0
  - @voyant-travel/i18n@0.114.0
  - @voyant-travel/admin@0.128.1
  - @voyant-travel/catalog-react@0.178.0
  - @voyant-travel/finance-react@0.180.0
  - @voyant-travel/finance@0.180.0
  - @voyant-travel/inventory@0.14.11

## 0.61.0

### Patch Changes

- @voyant-travel/storefront-react@0.181.0
- @voyant-travel/finance-react@0.179.0
- @voyant-travel/catalog-react@0.177.0
- @voyant-travel/finance@0.179.0
- @voyant-travel/inventory@0.14.10

## 0.60.0

### Patch Changes

- Updated dependencies [2bcafc9]
  - @voyant-travel/admin@0.128.0
  - @voyant-travel/i18n@0.113.0
  - @voyant-travel/catalog-react@0.176.0
  - @voyant-travel/finance-react@0.178.0
  - @voyant-travel/storefront-react@0.180.0
  - @voyant-travel/finance@0.178.0
  - @voyant-travel/inventory@0.14.9

## 0.59.0

### Patch Changes

- @voyant-travel/finance@0.177.0
- @voyant-travel/inventory@0.14.8
- @voyant-travel/types@0.109.8
- @voyant-travel/storefront-react@0.179.0
- @voyant-travel/finance-react@0.177.0
- @voyant-travel/catalog-react@0.175.0

## 0.58.0

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/storefront-react@0.178.0
  - @voyant-travel/finance@0.176.0
  - @voyant-travel/inventory@0.14.7
  - @voyant-travel/types@0.109.7
  - @voyant-travel/finance-react@0.176.0
  - @voyant-travel/catalog-react@0.174.0

## 0.57.0

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/storefront-react@0.177.0
  - @voyant-travel/finance@0.175.0
  - @voyant-travel/inventory@0.14.6
  - @voyant-travel/types@0.109.6
  - @voyant-travel/finance-react@0.175.0
  - @voyant-travel/catalog-react@0.173.0

## 0.56.0

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/finance@0.174.0
  - @voyant-travel/inventory@0.14.5
  - @voyant-travel/finance-react@0.174.0
  - @voyant-travel/catalog-react@0.172.0
  - @voyant-travel/storefront-react@0.176.0

## 0.55.0

### Patch Changes

- @voyant-travel/storefront-react@0.175.0
- @voyant-travel/finance-react@0.173.0
- @voyant-travel/catalog-react@0.171.0
- @voyant-travel/finance@0.173.0
- @voyant-travel/inventory@0.14.4

## 0.54.0

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/finance@0.172.0
  - @voyant-travel/utils@0.108.0
  - @voyant-travel/inventory@0.14.3
  - @voyant-travel/finance-react@0.172.0
  - @voyant-travel/storefront-react@0.174.0
  - @voyant-travel/ui@0.109.3
  - @voyant-travel/catalog-react@0.170.0

## 0.53.0

### Patch Changes

- Updated dependencies [d2d7384]
  - @voyant-travel/finance@0.171.0
  - @voyant-travel/finance-react@0.171.0
  - @voyant-travel/inventory@0.14.1
  - @voyant-travel/catalog-react@0.169.0
  - @voyant-travel/storefront-react@0.173.0

## 0.52.0

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/i18n@0.112.1
  - @voyant-travel/inventory@0.14.0
  - @voyant-travel/finance@0.170.0
  - @voyant-travel/storefront-react@0.172.0
  - @voyant-travel/finance-react@0.170.0
  - @voyant-travel/catalog-react@0.168.0

## 0.51.0

### Patch Changes

- Updated dependencies [a461920]
- Updated dependencies [a461920]
- Updated dependencies [590d256]
  - @voyant-travel/admin@0.127.0
  - @voyant-travel/finance@0.169.0
  - @voyant-travel/inventory@0.13.6
  - @voyant-travel/catalog-react@0.167.0
  - @voyant-travel/finance-react@0.169.0
  - @voyant-travel/storefront-react@0.171.0

## 0.50.0

### Patch Changes

- Updated dependencies [158c3a0]
  - @voyant-travel/finance@0.168.0
  - @voyant-travel/finance-react@0.168.0
  - @voyant-travel/inventory@0.13.5
  - @voyant-travel/catalog-react@0.166.0
  - @voyant-travel/storefront-react@0.170.0

## 0.49.0

### Patch Changes

- Updated dependencies [ca3713e]
  - @voyant-travel/finance@0.167.0
  - @voyant-travel/inventory@0.13.4
  - @voyant-travel/finance-react@0.167.0
  - @voyant-travel/catalog-react@0.165.0
  - @voyant-travel/storefront-react@0.169.0

## 0.48.0

### Patch Changes

- Updated dependencies [c3bdcbc]
- Updated dependencies [0868f18]
- Updated dependencies [3062a73]
- Updated dependencies [926ea47]
  - @voyant-travel/finance@0.166.0
  - @voyant-travel/admin@0.126.2
  - @voyant-travel/finance-react@0.166.0
  - @voyant-travel/i18n@0.112.0
  - @voyant-travel/inventory@0.13.3
  - @voyant-travel/catalog-react@0.164.0
  - @voyant-travel/storefront-react@0.168.0

## 0.47.0

### Patch Changes

- Updated dependencies [d6a9973]
  - @voyant-travel/finance@0.165.0
  - @voyant-travel/finance-react@0.165.0
  - @voyant-travel/inventory@0.13.2
  - @voyant-travel/catalog-react@0.163.0
  - @voyant-travel/storefront-react@0.167.0

## 0.46.0

### Patch Changes

- @voyant-travel/inventory@0.13.1
- @voyant-travel/finance-react@0.164.0
- @voyant-travel/catalog-react@0.162.0
- @voyant-travel/storefront-react@0.166.0
- @voyant-travel/finance@0.164.0

## 0.45.0

### Patch Changes

- Updated dependencies [52352c4]
  - @voyant-travel/finance@0.163.0
  - @voyant-travel/inventory@0.13.0
  - @voyant-travel/finance-react@0.163.0
  - @voyant-travel/storefront-react@0.165.0
  - @voyant-travel/catalog-react@0.161.0

## 0.44.1

### Patch Changes

- 7a7fd97: Strengthen the internationalization platform across the operator and package UI.

  Add ICU message formatting, explicit locale and time-zone formatters, hierarchical
  locale fallback, validated runtime overrides, account-authoritative preferences,
  localized setup and navigation surfaces, and fail-closed catalog and UI-literal
  checks. Package message providers now accept an optional time zone and expose the
  shared formatting capabilities to package-owned UI.

- Updated dependencies [7a7fd97]
  - @voyant-travel/admin@0.126.1
  - @voyant-travel/catalog-react@0.160.1
  - @voyant-travel/finance-react@0.162.2
  - @voyant-travel/i18n@0.111.3
  - @voyant-travel/finance@0.162.2

## 0.44.0

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/finance@0.162.0
  - @voyant-travel/inventory@0.12.0
  - @voyant-travel/storefront-react@0.164.0
  - @voyant-travel/finance-react@0.162.0
  - @voyant-travel/catalog-react@0.160.0

## 0.43.0

### Patch Changes

- Updated dependencies [c1e37f2]
- Updated dependencies [85bfe2c]
  - @voyant-travel/admin@0.126.0
  - @voyant-travel/finance@0.161.0
  - @voyant-travel/catalog-react@0.159.0
  - @voyant-travel/finance-react@0.161.0
  - @voyant-travel/storefront-react@0.163.0
  - @voyant-travel/inventory@0.11.1

## 0.42.0

### Patch Changes

- Updated dependencies [701ccc4]
- Updated dependencies [372f4f4]
- Updated dependencies [a2fd806]
- Updated dependencies [7e4ab07]
- Updated dependencies [497dff2]
- Updated dependencies [db5adce]
- Updated dependencies [6604f9e]
  - @voyant-travel/finance@0.160.0
  - @voyant-travel/inventory@0.11.0
  - @voyant-travel/storefront-react@0.162.0
  - @voyant-travel/finance-react@0.160.0
  - @voyant-travel/catalog-react@0.158.0

## 0.41.0

### Minor Changes

- 82ffd12: Add persisted organization-level first-run setup guidance composed from the
  selected admin graph. Standard Operator deployments now collect package-owned
  business profile, storefront, market, fiscal, navigation, team, and first-product
  steps while keeping domain mutations in their existing package surfaces.

### Patch Changes

- 766d24b: Associate admin form controls with visible labels and validation messages, and add accessible names to phone, channel, product translation, tag, action-menu, and channel-assignment helpers.
- Updated dependencies [766d24b]
- Updated dependencies [7e9f77a]
- Updated dependencies [49f55d0]
- Updated dependencies [82ffd12]
- Updated dependencies [9c85101]
- Updated dependencies [6147b93]
- Updated dependencies [b459761]
  - @voyant-travel/ui@0.109.2
  - @voyant-travel/admin@0.125.0
  - @voyant-travel/catalog-contracts@0.111.1
  - @voyant-travel/finance@0.159.0
  - @voyant-travel/inventory@0.10.4
  - @voyant-travel/finance-react@0.159.0
  - @voyant-travel/storefront-react@0.161.0
  - @voyant-travel/catalog-react@0.157.0

## 0.40.0

### Patch Changes

- 73ab096: Standardize first-party packages on package-owned deployment manifests, provider selection,
  access metadata, concrete event contracts, selected admin navigation, and published runtime
  references. Add Bookings Extras as an independently selected graph unit and remove the central
  admin navigation catalog.
  Link facets now distinguish entity `linkable` metadata from executable `definition` exports, and
  generated Node registries reject malformed definitions before service registration.
  Provider-owned required config and secrets now apply only when that provider is selected, so
  local and in-memory deployments do not require credentials for inactive remote providers.
- Updated dependencies [73ab096]
  - @voyant-travel/admin@0.124.0
  - @voyant-travel/finance-react@0.158.0
  - @voyant-travel/catalog-react@0.156.0
  - @voyant-travel/finance@0.158.0
  - @voyant-travel/inventory@0.10.3
  - @voyant-travel/types@0.109.2
  - @voyant-travel/storefront-react@0.160.0

## 0.39.0

### Patch Changes

- Updated dependencies [0808b21]
  - @voyant-travel/catalog-contracts@0.111.0
  - @voyant-travel/catalog-react@0.155.0
  - @voyant-travel/storefront-react@0.159.0
  - @voyant-travel/finance-react@0.157.0
  - @voyant-travel/finance@0.157.0
  - @voyant-travel/inventory@0.10.2

## 0.38.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [8d62a7c]
  - @voyant-travel/types@0.109.1
  - @voyant-travel/utils@0.107.1
  - @voyant-travel/admin@0.123.3
  - @voyant-travel/catalog-contracts@0.110.1
  - @voyant-travel/catalog-react@0.154.1
  - @voyant-travel/finance@0.156.1
  - @voyant-travel/finance-react@0.156.1
  - @voyant-travel/i18n@0.111.1
  - @voyant-travel/inventory@0.10.1
  - @voyant-travel/react@0.104.2
  - @voyant-travel/storefront-react@0.158.1
  - @voyant-travel/ui@0.109.1

## 0.38.0

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/finance@0.156.0
  - @voyant-travel/finance-react@0.156.0
  - @voyant-travel/catalog-contracts@0.110.0
  - @voyant-travel/inventory@0.10.0
  - @voyant-travel/i18n@0.111.0
  - @voyant-travel/storefront-react@0.158.0
  - @voyant-travel/catalog-react@0.154.0
  - @voyant-travel/admin@0.123.2

## 0.37.0

### Patch Changes

- @voyant-travel/finance@0.155.0
- @voyant-travel/inventory@0.9.2
- @voyant-travel/storefront-react@0.157.0
- @voyant-travel/finance-react@0.155.0
- @voyant-travel/catalog-react@0.153.0

## 0.36.0

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [8bd906f]
  - @voyant-travel/types@0.109.0
  - @voyant-travel/utils@0.107.0
  - @voyant-travel/finance@0.154.0
  - @voyant-travel/ui@0.109.0
  - @voyant-travel/inventory@0.9.1
  - @voyant-travel/admin@0.123.0
  - @voyant-travel/finance-react@0.154.0
  - @voyant-travel/catalog-react@0.152.0
  - @voyant-travel/storefront-react@0.156.0

## 0.35.0

### Minor Changes

- 490d132: Expose package-owned storefront browse, content resolution, slot selection, and
  product, accommodation, and cruise detail components.

### Patch Changes

- 490d132: Remove the final Operator admin factory compatibility registry by composing cross-domain behavior through package-owned selected graph slots and contributions.
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [282892e]
- Updated dependencies [490d132]
  - @voyant-travel/finance@0.153.0
  - @voyant-travel/inventory@0.9.0
  - @voyant-travel/admin@0.122.0
  - @voyant-travel/finance-react@0.153.0
  - @voyant-travel/storefront-react@0.155.0
  - @voyant-travel/catalog-react@0.151.0
  - @voyant-travel/types@0.108.1

## 0.34.0

### Patch Changes

- Updated dependencies [60b1970]
- Updated dependencies [977c1bd]
- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [d771be3]
  - @voyant-travel/finance@0.152.0
  - @voyant-travel/inventory@0.8.6
  - @voyant-travel/types@0.108.0
  - @voyant-travel/admin@0.121.0
  - @voyant-travel/finance-react@0.152.0
  - @voyant-travel/utils@0.106.1
  - @voyant-travel/catalog-react@0.150.0

## 0.33.0

### Patch Changes

- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/inventory@0.8.0
  - @voyant-travel/finance@0.151.0
  - @voyant-travel/finance-react@0.151.0
  - @voyant-travel/types@0.107.2
  - @voyant-travel/catalog-react@0.149.0

## 0.32.0

### Patch Changes

- @voyant-travel/finance@0.150.0
- @voyant-travel/inventory@0.7.11
- @voyant-travel/finance-react@0.150.0
- @voyant-travel/catalog-react@0.148.0

## 0.31.0

### Patch Changes

- Updated dependencies [a97e845]
  - @voyant-travel/admin@0.120.0
  - @voyant-travel/catalog-react@0.147.0
  - @voyant-travel/finance-react@0.149.0
  - @voyant-travel/finance@0.149.0
  - @voyant-travel/inventory@0.7.9

## 0.30.0

### Patch Changes

- Updated dependencies [8a665f3]
  - @voyant-travel/admin@0.119.0
  - @voyant-travel/catalog-react@0.146.0
  - @voyant-travel/finance-react@0.148.0
  - @voyant-travel/finance@0.148.0
  - @voyant-travel/inventory@0.7.8

## 0.29.0

### Patch Changes

- @voyant-travel/admin@0.118.0
- @voyant-travel/catalog-react@0.145.0
- @voyant-travel/finance-react@0.147.0
- @voyant-travel/finance@0.147.0
- @voyant-travel/inventory@0.7.7

## 0.28.0

### Patch Changes

- Updated dependencies [ecdf0fc]
  - @voyant-travel/admin@0.117.0
  - @voyant-travel/catalog-react@0.144.0
  - @voyant-travel/finance-react@0.146.0
  - @voyant-travel/finance@0.146.0
  - @voyant-travel/inventory@0.7.6

## 0.27.0

### Patch Changes

- @voyant-travel/inventory@0.7.5
- @voyant-travel/catalog-react@0.143.0
- @voyant-travel/finance-react@0.145.0
- @voyant-travel/finance@0.145.0

## 0.26.0

### Patch Changes

- @voyant-travel/finance@0.144.0
- @voyant-travel/finance-react@0.144.0
- @voyant-travel/catalog-react@0.142.0
- @voyant-travel/inventory@0.7.4

## 0.25.0

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/utils@0.106.0
  - @voyant-travel/inventory@0.7.3
  - @voyant-travel/finance@0.143.0
  - @voyant-travel/ui@0.108.11
  - @voyant-travel/types@0.107.1
  - @voyant-travel/catalog-react@0.141.0
  - @voyant-travel/finance-react@0.143.0

## 0.24.0

### Patch Changes

- @voyant-travel/inventory@0.7.2
- @voyant-travel/catalog-react@0.140.0
- @voyant-travel/finance-react@0.142.0
- @voyant-travel/finance@0.142.0

## 0.23.1

### Patch Changes

- e6cad60: Route reusable upload and payment-link actions through the Voyant React provider API base and fetcher so split-origin deployments do not fall back to relative `/api` URLs.
- Updated dependencies [e6cad60]
  - @voyant-travel/finance-react@0.141.1
  - @voyant-travel/finance@0.141.1

## 0.23.0

### Patch Changes

- Updated dependencies [6711f4c]
  - @voyant-travel/catalog-react@0.139.0
  - @voyant-travel/inventory@0.7.1
  - @voyant-travel/finance-react@0.141.0
  - @voyant-travel/finance@0.141.0

## 0.22.0

### Patch Changes

- Updated dependencies [62e87ee]
- Updated dependencies [8405bee]
  - @voyant-travel/admin@0.116.0
  - @voyant-travel/i18n@0.110.0
  - @voyant-travel/inventory@0.7.0
  - @voyant-travel/catalog-react@0.138.0
  - @voyant-travel/finance-react@0.140.0
  - @voyant-travel/finance@0.140.0

## 0.21.0

### Patch Changes

- Updated dependencies [c9a356f]
- Updated dependencies [fc71db1]
- Updated dependencies [fc71db1]
- Updated dependencies [77f139b]
  - @voyant-travel/types@0.107.0
  - @voyant-travel/finance@0.139.0
  - @voyant-travel/inventory@0.6.0
  - @voyant-travel/admin@0.115.4
  - @voyant-travel/finance-react@0.139.0
  - @voyant-travel/utils@0.105.6
  - @voyant-travel/catalog-react@0.137.0

## 0.20.0

### Patch Changes

- @voyant-travel/catalog-react@0.136.0
- @voyant-travel/finance-react@0.138.0
- @voyant-travel/finance@0.138.0
- @voyant-travel/inventory@0.5.13

## 0.19.5

### Patch Changes

- ea21ebc: Start product detail summaries on the product default/base language instead of
  auto-selecting the first or operator-locale translation.
- Updated dependencies [5c1294f]
  - @voyant-travel/inventory@0.5.11

## 0.19.4

### Patch Changes

- ad02eae: Reject non-image product media as cover media and surface brochure generation failures in the product detail UI.
- Updated dependencies [a10b9ba]
- Updated dependencies [e005c4d]
- Updated dependencies [ad02eae]
  - @voyant-travel/inventory@0.5.10
  - @voyant-travel/i18n@0.109.5

## 0.19.3

### Patch Changes

- 16ec0cb: Render saved additional rate-plan room/category prices in the admin product detail grid and label the price controls for assistive technology.
- Updated dependencies [66ac9f3]
- Updated dependencies [16ec0cb]
- Updated dependencies [c1d45bc]
- Updated dependencies [7bdd9cc]
  - @voyant-travel/ui@0.108.8
  - @voyant-travel/i18n@0.109.4
  - @voyant-travel/catalog-react@0.135.7
  - @voyant-travel/finance@0.137.8
  - @voyant-travel/finance-react@0.137.8

## 0.19.2

### Patch Changes

- cbd5046: Republish the product-detail entrypoint with the canonical query-option exports in the published package.

## 0.19.1

### Patch Changes

- 9a1197b: Move the operator media upload and serve routes off the bare `/v1/*` surface and onto `/v1/admin/*`.

  Uploads now post to `/v1/admin/uploads` and video tickets to `/v1/admin/uploads/video`; stored media is served from `/v1/admin/media/*`. The Hono app no longer mounts the bare `/v1/*` catch-all actor guard, and worker-runtime hosts can use `rewriteAppPath` to preserve compatibility for persisted legacy media URLs.

- Updated dependencies [9a1197b]
  - @voyant-travel/finance-react@0.137.1
  - @voyant-travel/finance@0.137.1
  - @voyant-travel/inventory@0.5.6
  - @voyant-travel/catalog-react@0.135.1

## 0.19.0

### Patch Changes

- @voyant-travel/finance@0.137.0
- @voyant-travel/inventory@0.5.5
- @voyant-travel/catalog-react@0.135.0
- @voyant-travel/finance-react@0.137.0

## 0.18.2

### Patch Changes

- 12a1eb2: Expose client-safe subpaths for validation schemas, linkable metadata, template authoring metadata, finance payment-policy primitives, and Hono reporter utilities. Move browser-facing React/operator imports off mixed runtime barrels so client bundles do not pull Hono request context or other server-only runtime code.
- Updated dependencies [12a1eb2]
  - @voyant-travel/finance@0.136.2
  - @voyant-travel/finance-react@0.136.2
  - @voyant-travel/inventory@0.5.4

## 0.18.1

### Patch Changes

- Updated dependencies [7cb6fa7]
  - @voyant-travel/i18n@0.109.0
  - @voyant-travel/admin@0.115.2
  - @voyant-travel/catalog-react@0.134.1
  - @voyant-travel/finance-react@0.136.1
  - @voyant-travel/ui@0.108.2
  - @voyant-travel/finance@0.136.1

## 0.18.0

### Patch Changes

- @voyant-travel/inventory@0.5.3
- @voyant-travel/finance-react@0.136.0
- @voyant-travel/catalog-react@0.134.0
- @voyant-travel/finance@0.136.0

## 0.17.0

### Patch Changes

- @voyant-travel/inventory@0.5.2
- @voyant-travel/finance-react@0.135.0
- @voyant-travel/catalog-react@0.133.0
- @voyant-travel/finance@0.135.0

## 0.16.1

### Patch Changes

- ba91645: Fix the product translation language picker so the "Add language" search box
  filters as you type. `LanguageCombobox` now feeds its options to the underlying
  combobox via `items` + `ComboboxCollection` with a `filter` that matches on both
  the language name and code, instead of rendering the full unfiltered list.

## 0.16.0

### Minor Changes

- 51f7dea: Share one list-response contract instead of per-module copies (voyant#2109).

  `@voyant-travel/types` now owns the canonical offset-paginated list envelope: the `ListResponse<T>` type + `listResponse(data, { total, limit, offset })` builder, plus the zod `paginationSchema` (coerced `limit` 1–200 default 50, `offset` ≥0 default 0) and the `listResponseSchema(item)` factory. Both server services and `*-react` clients import from this single source.

  Server side: every module's local `paginate()` / inline `{ data, total, limit, offset }` construction now routes through the shared `listResponse` builder, and the count read is standardized on `count` internally — fixing the drift where finance, notifications and the legal contracts/policies services read `countResult[0]?.total` while every other module read `countResult[0]?.count` (their `count(*)` selects were aliased `total`; they are now aliased `count`). The returned shape is byte-for-byte identical.

  Client side: the ~23 copied `paginatedEnvelope` zod schemas across the `*-react` packages are replaced by re-exporting the shared `listResponseSchema` factory under the same `paginatedEnvelope` name, so consumers are unchanged.

  Input alignment: `finance-contracts` and `legal-contracts` pagination `limit` caps were raised from `.max(100)` to `.max(200)` to match the framework-wide max.

  Additive and non-breaking.

### Patch Changes

- Updated dependencies [51f7dea]
- Updated dependencies [0a0a014]
  - @voyant-travel/types@0.106.0
  - @voyant-travel/finance@0.134.0
  - @voyant-travel/inventory@0.5.0
  - @voyant-travel/finance-react@0.134.0
  - @voyant-travel/admin@0.115.1
  - @voyant-travel/utils@0.105.4
  - @voyant-travel/catalog-react@0.132.0

## 0.15.0

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/admin@0.115.0
  - @voyant-travel/i18n@0.108.0
  - @voyant-travel/utils@0.105.3
  - @voyant-travel/finance@0.133.0
  - @voyant-travel/inventory@0.4.7
  - @voyant-travel/catalog-react@0.131.0
  - @voyant-travel/finance-react@0.133.0
  - @voyant-travel/ui@0.108.1

## 0.14.0

### Patch Changes

- @voyant-travel/catalog-react@0.130.0
- @voyant-travel/inventory@0.4.6
- @voyant-travel/finance-react@0.132.0
- @voyant-travel/finance@0.132.0

## 0.13.2

### Patch Changes

- ba89f0b: Let admin departure edits choose and persist a product option so existing departures with a missing option can be repaired from the UI. Explicit slot option links are now validated against the slot product while product-level generated slots can still omit an option.
- Updated dependencies [ba89f0b]
  - @voyant-travel/i18n@0.107.4

## 0.13.1

### Patch Changes

- fcd2e0b: Add itinerary and day-service translation authoring surfaces, and localize owned itinerary content projection for translated days and service labels.
- Updated dependencies [fcd2e0b]
  - @voyant-travel/inventory@0.4.4

## 0.13.0

### Patch Changes

- Updated dependencies [310565b]
  - @voyant-travel/i18n@0.107.3
  - @voyant-travel/finance-react@0.131.0
  - @voyant-travel/catalog-react@0.129.0
  - @voyant-travel/finance@0.131.0
  - @voyant-travel/inventory@0.4.3

## 0.12.0

### Patch Changes

- Updated dependencies [dbea53e]
  - @voyant-travel/i18n@0.107.2
  - @voyant-travel/finance-react@0.130.0
  - @voyant-travel/catalog-react@0.128.0
  - @voyant-travel/finance@0.130.0
  - @voyant-travel/inventory@0.4.2

## 0.11.0

### Patch Changes

- @voyant-travel/inventory@0.4.1
- @voyant-travel/catalog-react@0.127.0
- @voyant-travel/finance-react@0.129.0
- @voyant-travel/finance@0.129.0

## 0.10.0

### Patch Changes

- Updated dependencies [9c47b00]
  - @voyant-travel/inventory@0.4.0
  - @voyant-travel/catalog-react@0.126.0
  - @voyant-travel/finance-react@0.128.0
  - @voyant-travel/finance@0.128.0

## 0.9.0

### Patch Changes

- @voyant-travel/inventory@0.3.9
- @voyant-travel/finance@0.127.0
- @voyant-travel/finance-react@0.127.0
- @voyant-travel/catalog-react@0.125.0

## 0.8.0

### Patch Changes

- @voyant-travel/inventory@0.3.6
- @voyant-travel/catalog-react@0.124.0
- @voyant-travel/finance-react@0.126.0
- @voyant-travel/finance@0.126.0

## 0.7.0

### Patch Changes

- Updated dependencies [a74471e]
- Updated dependencies [a74471e]
  - @voyant-travel/i18n@0.107.0
  - @voyant-travel/ui@0.108.0
  - @voyant-travel/admin@0.114.0
  - @voyant-travel/catalog-react@0.123.0
  - @voyant-travel/finance-react@0.125.0
  - @voyant-travel/inventory@0.3.5
  - @voyant-travel/finance@0.125.0

## 0.6.0

### Patch Changes

- 4f92198: Voyant 1.0 visual refactor of the framework UI.

  - **Tokens** (`@voyant-travel/ui` `globals.css`): warm off-white paper, near-black ink, and a single hot-orange brand accent (`--brand`, new token) reserved for charts/focus/active state. Inter Tight type. Fixed brand chart palette (`--chart-1..5`). A coherent radius system: controls + their dropdowns at `rounded-sm` (4px), cards/table surfaces at `rounded-md` (6px), dialogs/sheets at `rounded-xl`.
  - **`@voyant-travel/ui` components**: new `SegmentedControl`; `Button` gains a `brand` variant; sharper, consistent radii across Button/Input/Select/Combobox/Textarea/Toggle/Tabs/Menus/Command/Card/DataTable/Badge; bordered active sidebar items (primary + sub) and inset-panel border; assorted fixes (Command search-input radius, toggle-group corners, sidebar sub-menu spacing).
  - **`@voyant-travel/admin`**: Voyant 1.0 brand logo lockup (composed mark + wordmark, collapse-to-badge); operator shell defaults to the inset sidebar layout; dashboard KPI cards, brand chart colors, and Figma-matched sidebar (bordered active item, near-black nav text, bordered user card with open-state).
  - **Domain `*-react` packages**: card surfaces normalized to the new `rounded-md` radius; flights search bar (trip-type toggle, route cards, airport dropdown) and the resources tabs aligned to the system.

- Updated dependencies [4f92198]
- Updated dependencies [4f92198]
  - @voyant-travel/finance-react@0.124.0
  - @voyant-travel/ui@0.107.0
  - @voyant-travel/admin@0.113.0
  - @voyant-travel/catalog-react@0.122.0
  - @voyant-travel/finance@0.124.0
  - @voyant-travel/inventory@0.3.4

## 0.5.0

### Patch Changes

- Updated dependencies [94890c3]
- Updated dependencies [e9d9dbb]
- Updated dependencies [cb9b04b]
  - @voyant-travel/admin@0.112.0
  - @voyant-travel/finance@0.123.0
  - @voyant-travel/catalog-react@0.121.0
  - @voyant-travel/finance-react@0.123.0
  - @voyant-travel/inventory@0.3.3

## 0.4.0

### Patch Changes

- Updated dependencies [c9de9c4]
- Updated dependencies [14f4234]
- Updated dependencies [89d4ca9]
- Updated dependencies [51dd276]
  - @voyant-travel/finance@0.122.0
  - @voyant-travel/finance-react@0.122.0
  - @voyant-travel/inventory@0.3.1
  - @voyant-travel/catalog-react@0.120.0

## 0.3.0

### Patch Changes

- Updated dependencies [13fe70b]
- Updated dependencies [13fe70b]
  - @voyant-travel/finance@0.121.0
  - @voyant-travel/inventory@0.3.0
  - @voyant-travel/finance-react@0.121.0
  - @voyant-travel/catalog-react@0.119.0

## 0.2.2

### Patch Changes

- ecec979: Improve operator bundle boundaries by adding route-local admin message provider support, exposing admin extension route helpers, keeping pending skeletons structural, and tightening Vite route ignores and vendor chunk splitting so heavy admin route dependencies stay out of the initial entry.
- Updated dependencies [ecec979]
  - @voyant-travel/admin@0.111.3
  - @voyant-travel/finance-react@0.120.2
  - @voyant-travel/finance@0.120.2

## 0.2.1

### Patch Changes

- eef1a00: Republish notification and UI consumer packages so stale beta artifacts no longer reference legacy notification package specifiers.
- Updated dependencies [eef1a00]
  - @voyant-travel/admin@0.111.2
  - @voyant-travel/catalog-react@0.118.1
  - @voyant-travel/finance-react@0.120.1
  - @voyant-travel/finance@0.120.1

## 0.2.0

### Minor Changes

- 3cc83b6: Move extras runtime and React source behind Inventory and Bookings owner
  subpaths. The old runtime and React extras package names are removed from v1;
  first-party imports use the Inventory and Bookings owner paths.
- 65b3782: Add optional Inventory package entrypoints for operated product authoring and
  Inventory React authoring UI surfaces.
- a101971: Move the main operated Product route/service/schema/runtime and React
  authoring source under Inventory owner paths. The old Products runtime package
  names are removed from the v1 workspace surface, while the operator keeps
  stable `/products` API URLs backed by Inventory.

### Patch Changes

- 3408b2a: Move availability, allocation UI, resources, ground logistics, and places source
  under Operations owner paths. The old operated-execution package names are
  removed from the v1 workspace surface while first-party runtime, React, and
  operator imports use `@voyant-travel/operations` and `@voyant-travel/operations-react`
  surfaces.
- 47fef18: Retarget first-party imports from the removed beta package names to their owner
  packages. Operated product UI now imports Inventory React, commercial UI imports
  Commerce React, supplier UI imports Distribution React, checkout UI imports
  Finance React, and operated place/availability schema references import
  Operations owner paths.
- Updated dependencies [dd71543]
- Updated dependencies [3cc83b6]
- Updated dependencies [0fa993c]
- Updated dependencies [9e970a5]
- Updated dependencies [b711b04]
- Updated dependencies [3408b2a]
- Updated dependencies [7ea516a]
- Updated dependencies [65b3782]
- Updated dependencies [a101971]
- Updated dependencies [47fef18]
- Updated dependencies [6196b3b]
  - @voyant-travel/admin@0.111.1
  - @voyant-travel/inventory@0.2.0
  - @voyant-travel/finance@0.120.0
  - @voyant-travel/finance-react@0.120.0
  - @voyant-travel/catalog-react@0.118.0
