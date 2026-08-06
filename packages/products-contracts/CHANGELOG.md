# @voyant-travel/products-contracts

## 0.110.2

### Patch Changes

- Updated dependencies [56e2050]
  - @voyant-travel/catalog-contracts@0.127.0

## 0.110.1

### Patch Changes

- Updated dependencies [6c77f7d]
  - @voyant-travel/catalog-contracts@0.126.0

## 0.110.0

### Minor Changes

- 3f5ea82: feat(inventory): resolve one operator-facing schedule term (Session/Occurrence/Departure)

  The same Product/Departure model runs sixty-minute recurring Sessions and
  multi-day Departures, so the operator needs to _see_ the right noun without the
  domain forking under it. This adds a single resolver that decides the noun once
  and a localized label the UI reads.

  - **One decision, in one place.** `resolveScheduleTerm` maps a Product's
    already-resolved duration to a `session | occurrence | departure` token: an
    explicit sub-day duration is a **Session** (the 60-minute whale-watch Boat
    Tour, a timed Activity, a scheduled transfer), an explicit full-day-or-longer
    duration or an itinerary-derived day span is a **Departure** (a Day Tour, a
    Multi-day Tour), and an unresolved duration — a single Event date or an
    opening-hours Attraction Admission — is an **Occurrence**. It reads no mutable
    Product truth to decide.
  - **Every surface agrees.** `resolveProductClassification` now carries
    `scheduleTerm`, so the product list/detail read paths, the catalog-plane
    projection, and the legacy Catalog search document all emit it from the same
    resolver. The classification schemas in `products-contracts`,
    `admin-contracts` and the `inventory-react` mirror gain the field.
  - **Presentation only.** A Session, an Occurrence and a Departure are the same
    `availability_slots` row bound to the same Product Version. The operator UI
    maps the token to a localized label (`common.scheduleTermLabels`, en + ro) and
    the product list renders the plural under the family; the domain never forks.

- 3f5ea82: feat(inventory): conservatively backfill legacy families and expose an operator-review queue

  Ambiguous legacy Products must be resolved by a human, not guessed. This adds
  the queue that makes them discoverable and a migration that only classifies what
  is unambiguous.

  - **Discoverable review queue.** The product list read accepts
    `classificationReview=pending | missing_family | unresolved_duration`. The
    predicates are expressed as row-level SQL that mirrors
    `resolveProductClassification` exactly (missing/dangling family; no explicit
    duration and no dated default-itinerary day), so the queue and the rendered
    review badge never disagree.
  - **Conservative backfill migration.** A product with authored itinerary days
    but no family is unambiguously a Tour; the migration assigns the standard
    `tour` family to exactly those rows. It never overwrites an existing family,
    only fires on a strong positive signal, joins to the seeded family (so a
    deployment without it is a no-op), and is idempotent. Duration is not
    materialized — the resolver derives itinerary-derived duration live.
  - **Ambiguous rows are left alone.** A product with neither a family nor a
    resolvable duration is untouched and surfaces in the review queue rather than
    being guessed.
  - Migration-test coverage over a representative beta dataset that includes
    ambiguous rows proves no Product disappears, no capacity claim (availability
    slot) is lost, and only the unambiguous rows are classified.

## 0.109.5

### Patch Changes

- Updated dependencies [076c246]
  - @voyant-travel/catalog-contracts@0.125.0

## 0.109.4

### Patch Changes

- 68d90d9: Declare a day service's own `costCurrency` / `costAmountCents` on the product
  version snapshot reader.

  They were already written into `product_versions.snapshot` and reachable only
  through `passthrough()`. Typing them lets a reader take the frozen commitment
  figures without re-deriving the blob's shape, and keeps them explicitly distinct
  from the driver-scaled `plannedCost` block, which answers a different question.

## 0.109.3

### Patch Changes

- Updated dependencies [9ef6a65]
- Updated dependencies [9ef6a65]
  - @voyant-travel/catalog-contracts@0.124.0

## 0.109.2

### Patch Changes

- Updated dependencies [ef8871d]
  - @voyant-travel/catalog-contracts@0.123.0

## 0.109.1

### Patch Changes

- Updated dependencies [b52433d]
  - @voyant-travel/catalog-contracts@0.122.0

## 0.109.0

### Minor Changes

- 3d793c1: feat: materialize Product Day Services into Departure operations (spine)

  The spine of the multi-day tracer (voyant#4035). A Product's day services were a
  costing list with no operational shape, `product_versions.snapshot` had zero
  readers, and a departure had no per-day structure. This wires the first path
  from a frozen Product Version to immutable per-departure service lines.

  - **A typed snapshot reader** (`@voyant-travel/products-contracts`):
    `parseProductVersionSnapshot` validates the frozen `product_versions.snapshot`
    shape and fails loudly on anything it does not recognise rather than returning
    an empty itinerary. Pure zod, reusable by inventory and operations (and
    voyant#4189).
  - **Operational fields on `product_day_services`**: local start/end time and
    duration, a Place/facility reference, an `inclusion_role`
    (`included` | `optional`), traveller applicability, and a supplier reference
    alongside the existing loose `supplier_service_id`. Propagated through
    validation, service, admin routes, and the inventory-react authoring form.
  - **A `departure_service_operations` table** (`@voyant-travel/operations`) with
    its own `departure_service_operation_status` enum
    (`planned` → … → `completed`, plus `cancelled` / `exception`) and a transition
    guard — deliberately not overloading the capacity-shaped
    `availability_slot_status`.
  - **Idempotent materialization** from the frozen snapshot, mapping day N to the
    departure date + (N-1) in the slot timezone, keyed on
    `(slot_id, source_day_service_id)`. Wired into both slot-creation paths. A
    later Product edit does not mutate an already-materialized departure — proven
    by an integration test.

  Spine only: no run-sheet UI and no supplier-operations changes, which are
  follow-ups.

### Patch Changes

- Updated dependencies [3d793c1]
  - @voyant-travel/schema-kit@0.118.4

## 0.108.10

### Patch Changes

- Updated dependencies [0976af1]
  - @voyant-travel/catalog-contracts@0.121.0

## 0.108.9

### Patch Changes

- Updated dependencies [9b9e8ac]
  - @voyant-travel/catalog-contracts@0.120.0

## 0.108.8

### Patch Changes

- Updated dependencies [da20433]
  - @voyant-travel/catalog-contracts@0.119.0

## 0.108.7

### Patch Changes

- Updated dependencies [d2a571f]
  - @voyant-travel/catalog-contracts@0.118.0

## 0.108.6

### Patch Changes

- Updated dependencies [06a79a0]
  - @voyant-travel/catalog-contracts@0.117.0

## 0.108.5

### Patch Changes

- Updated dependencies [4c694f6]
  - @voyant-travel/catalog-contracts@0.116.0
  - @voyant-travel/schema-kit@0.118.3

## 0.108.4

### Patch Changes

- dcda88d: Describe every package on the public surface.

  The npm assembly path is now private — the deployment ships as an image — so the
  published surface is the fourteen packages an external adapter, connector, or
  extension author builds against. Each now says what it is for.

- Updated dependencies [dcda88d]
  - @voyant-travel/catalog-contracts@0.115.2
  - @voyant-travel/schema-kit@0.118.2

## 0.108.3

### Patch Changes

- Updated dependencies [9f412dd]
- Updated dependencies [2ed62d3]
  - @voyant-travel/schema-kit@0.118.0

## 0.108.2

### Patch Changes

- Updated dependencies [15c1c64]
  - @voyant-travel/schema-kit@0.117.0

## 0.108.1

### Patch Changes

- Updated dependencies [e93c0a7]
  - @voyant-travel/catalog-contracts@0.115.0

## 0.108.0

### Minor Changes

- f7adc5b: Add configurable Product families, stable subtypes, explicit minute durations, family-first quick starts, and standard family Catalog views.

### Patch Changes

- f7adc5b: Make Product status the lifecycle authority and active Channel assignments the distribution authority, while retaining legacy visibility fields as deprecated API compatibility data.

## 0.107.13

### Patch Changes

- Updated dependencies [79606bb]
  - @voyant-travel/catalog-contracts@0.114.0
  - @voyant-travel/schema-kit@0.116.3

## 0.107.12

### Patch Changes

- Updated dependencies [5d3b563]
- Updated dependencies [f25ad34]
- Updated dependencies [2601445]
  - @voyant-travel/catalog-contracts@0.113.0
  - @voyant-travel/schema-kit@0.116.1

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
