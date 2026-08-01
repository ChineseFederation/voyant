# @voyant-travel/products-contracts

## 0.107.11

### Patch Changes

- Updated dependencies [e65bd25]
  - @voyant-travel/schema-kit@0.116.0

## 0.107.10

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/schema-kit@0.115.0

## 0.107.9

### Patch Changes

- e2cb9f5: Expand the products list Filters with Type, Booking mode, Visibility, Tag, and a
  Departure window. Type/Booking mode/Visibility/Tag reuse query params the list
  endpoint already supported; the Departure window is a new `departureFrom`/
  `departureTo` query param that keeps only products with an upcoming open
  departure whose date falls in the chosen range (filtered on availability slots,
  independent of the product's own start date).

## 0.107.8

### Patch Changes

- a43267a: Add node-aware localized editorial overlays for sourced product content, including stable content-node targeting, optimistic overlay versions, audit history, product admin read/write/clear routes, and public provenance redaction.

  Tighten editorial overlay scope isolation for product content reads and writes, require admin overlay mutations to carry an authenticated user id, and make overlay mutations/history atomic with race-safe optimistic version checks.

- Updated dependencies [a43267a]
  - @voyant-travel/catalog-contracts@0.112.1

## 0.107.7

### Patch Changes

- 130f62c: Expose owned-product SEO metadata and Open Graph images through the product admin and storefront surfaces.

## 0.107.6

### Patch Changes

- Updated dependencies [d9ff078]
  - @voyant-travel/catalog-contracts@0.112.0

## 0.107.5

### Patch Changes

- a33c590: Add a "Choose from Media Library" action to the product media section so
  operators can attach existing library assets to a product or itinerary day
  instead of only uploading new files. Product media now records the source
  asset reference (`assetId`) alongside the derived byte URL, kind, mime type,
  and size.

## 0.107.4

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/schema-kit@0.114.0

## 0.107.3

### Patch Changes

- Updated dependencies [52352c4]
  - @voyant-travel/schema-kit@0.113.0

## 0.107.2

### Patch Changes

- Updated dependencies [0808b21]
  - @voyant-travel/catalog-contracts@0.111.0

## 0.107.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
  - @voyant-travel/catalog-contracts@0.110.1
  - @voyant-travel/schema-kit@0.112.1

## 0.107.0

### Minor Changes

- bbe6396: Replace the overloaded Finance voucher domain with Travel Credits across the
  database schema, APIs, package exports, booking inputs, storefront settings,
  and operator UI. Redemption commands are replay-safe, codes are normalized and
  case-insensitively unique, and legacy records migrate in place without silently
  skipping invalid balances. Keep Promotion Codes in Commerce and move Bookings
  fulfillment to the explicit Service Voucher vocabulary.

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/catalog-contracts@0.110.0
  - @voyant-travel/schema-kit@0.112.0

## 0.106.1

### Patch Changes

- Updated dependencies [4829ef3]
  - @voyant-travel/catalog-contracts@0.109.0

## 0.106.0

### Minor Changes

- 8405bee: Fold the product's default itinerary into the catalog product read-model document.

  `getCatalogProductById` (and the `/v1/public/products/:id` + `/slug/:slug`
  read-through documents) can now include the product's default day-by-day
  itinerary — days and day-services with `product_day_translations` /
  `product_day_service_translations` resolved by the document's locale, plus a
  per-day thumbnail. It is opt-in via `?include=itinerary`, encoded in the
  read-model variant so itinerary and non-itinerary documents cache — and warm on
  mutation — independently. Only the product default itinerary is folded;
  departure-specific overrides stay on the departure itinerary endpoint.

  The itinerary update/delete/duplicate admin routes (keyed on the itinerary id,
  not the product id) now trigger read-model recompute so the folded itinerary
  stays fresh.

## 0.105.17

### Patch Changes

- 5c1294f: Reject inverted inventory product dates, option availability dates, option-unit quantity bounds, and duplicate itinerary day numbers.

## 0.105.16

### Patch Changes

- e005c4d: Reject inverted product option-unit age ranges and commerce pricing ranges across schemas and service mutations.

## 0.105.15

### Patch Changes

- db1acc4: Prevent partial product option and option unit update schemas from reapplying insert defaults to omitted fields.

## 0.105.14

### Patch Changes

- Updated dependencies [722455d]
  - @voyant-travel/schema-kit@0.111.0

## 0.105.13

### Patch Changes

- Updated dependencies [06cfcf5]
  - @voyant-travel/schema-kit@0.110.0

## 0.105.12

### Patch Changes

- Updated dependencies [787c852]
  - @voyant-travel/schema-kit@0.109.0

## 0.105.11

### Patch Changes

- Updated dependencies [924d201]
- Updated dependencies [f311826]
  - @voyant-travel/schema-kit@0.108.0

## 0.105.10

### Patch Changes

- Updated dependencies [b68d6a7]
  - @voyant-travel/schema-kit@0.107.0

## 0.105.9

### Patch Changes

- Updated dependencies [6a0edd2]
  - @voyant-travel/catalog-contracts@0.108.0

## 0.105.8

### Patch Changes

- fcd2e0b: Add itinerary and day-service translation authoring surfaces, and localize owned itinerary content projection for translated days and service labels.
- Updated dependencies [fcd2e0b]
  - @voyant-travel/schema-kit@0.106.1

## 0.105.7

### Patch Changes

- fe6af54: Defer the cross-package `boardBasisSchema` dereference in the product and cruise `content-shape` schemas with `z.lazy(() => boardBasisSchema)`.

  It was dereferenced at module-evaluation time, so app worker bundles (rolldown/vite) that split it into a circular chunk observed it `undefined` and threw `TypeError: Cannot read properties of undefined (reading 'nullable')`, 500ing every catalog read. No change to validation behavior or inferred types.

## 0.105.6

### Patch Changes

- Updated dependencies [a74471e]
  - @voyant-travel/schema-kit@0.106.0

## 0.105.5

### Patch Changes

- 28898ad: Fix migration-facing publish artifacts by exporting all Distribution-owned supplier and external-reference schemas, republishing contract packages with complete dist files, guarding packed artifacts against legacy package-scope specifiers, and updating Voyant Cloud defaults to `https://api.voyant.travel`.

## 0.105.4

### Patch Changes

- Updated dependencies [e3fa849]
  - @voyant-travel/catalog-contracts@0.107.0

## 0.105.3

### Patch Changes

- Updated dependencies [7122c2a]
  - @voyant-travel/catalog-contracts@0.106.0

## 0.105.2

### Patch Changes

- 54d529e: Include product inclusions, exclusions, and terms HTML fields in public catalog product response schemas.

## 0.105.1

### Patch Changes

- Updated dependencies [d1ad572]
- Updated dependencies [d1ad572]
  - @voyant-travel/schema-kit@0.105.0

## 0.105.0

### Minor Changes

- 921f4fc: Add a canonical board-basis contract enum and reuse it across accommodation meal plans, product options, and cruise sailings.

### Patch Changes

- Updated dependencies [921f4fc]
  - @voyant-travel/catalog-contracts@0.105.0

## 0.104.1

### Patch Changes

- @voyant-travel/schema-kit@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/schema-kit@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/schema-kit@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/schema-kit@0.102.0

## 0.101.2

### Patch Changes

- 577eaf5: Add in-context translations for products and itinerary days.

  - `@voyant-travel/products`: add a `products.default_language_tag` column (the language the base name/description columns are written in) and a new `product_day_translations` table (per-language title/description/location) with CRUD service methods and routes under `/v1/products/:id/days/:dayId/translations`.
  - `@voyant-travel/products-contracts`: validation schemas for the product default language and itinerary-day translations.
  - `@voyant-travel/products-react`: `useProductDayTranslations` / `useProductDayTranslationMutation` hooks, record/response schemas, and query keys; the product record now exposes `defaultLanguageTag`.
  - `@voyant-travel/schema-kit`: `product_day_translations` TypeID prefix (`pdtr`).
  - `@voyant-travel/i18n`: operator labels for the content-language switcher, default language, itinerary-day sheet, and market-rule columns.

- Updated dependencies [577eaf5]
  - @voyant-travel/schema-kit@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/schema-kit@0.101.1

## 0.101.0

### Minor Changes

- 8e7b56a: Extract products validation into the pure `@voyant-travel/products-contracts` package
  and complete the products admin SDK surface.

  - **products-contracts:** now owns the products validation cluster
    (`validation`, `validation-core`, `validation-public`, `validation-shared`,
    `validation-config`, `validation-content`, `validation-catalog`), moved out of
    the runtime `@voyant-travel/products` package. Its only external imports — the two
    `@voyant-travel/db` helpers — are repointed to `@voyant-travel/schema-kit`, so the
    package stays zero-runtime (zod + schema-kit). Mirrors the
    bookings/finance/crm/legal split.
  - **products:** the moved files become one-line re-export stubs, so every
    existing import path (`@voyant-travel/products/validation`,
    `@voyant-travel/products/public-validation`, and internal `./validation-*`) keeps
    working unchanged.
  - **admin-contracts:** products gains its write descriptors —
    `products.create`/`update`/`delete` deriving from `insertProductSchema`/
    `updateProductSchema`, and `products.list` now derives from
    `productListQuerySchema` — all from the newly-pure `@voyant-travel/products-contracts`.
  - **admin-client:** typed `products.create`/`update`/`delete` methods.

### Patch Changes

- @voyant-travel/schema-kit@0.101.0

## 0.100.0

## 0.99.0

## 0.98.0

## 0.97.0

## 0.96.0

### Minor Changes

- 465fb31: Extend the lightweight contract-package pattern to the remaining content
  verticals.

  `@voyant-travel/accommodations-contracts`, `@voyant-travel/products-contracts`,
  `@voyant-travel/extras-contracts`, and `@voyant-travel/charters-contracts` now own their
  respective `<vertical>/v1` rich content schema, version constant, types, and
  validator as zod-only packages, so external consumers (Voyant Connect, adapter
  authors, the Admin API SDK) can validate content payloads without installing the
  framework runtime.

  The runtime `@voyant-travel/accommodations`, `@voyant-travel/products`,
  `@voyant-travel/extras`, and `@voyant-travel/charters` packages re-export their content
  shape from the matching contract package, so existing
  `@voyant-travel/<vertical>/content-shape` import paths are unchanged. The
  `mergeOverlaysInto<Vertical>Content` overlay composition stays in the runtime
  package.

  See `docs/adr/0002-contract-packages.md` for the codified pattern.
