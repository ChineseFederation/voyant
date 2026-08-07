# @voyant-travel/admin-contracts

## 0.107.4

### Patch Changes

- Updated dependencies [8fc2d25]
  - @voyant-travel/products-contracts@0.111.0

## 0.107.3

### Patch Changes

- Updated dependencies [484b207]
  - @voyant-travel/finance-contracts@0.113.0

## 0.107.2

### Patch Changes

- Updated dependencies [1be6b76]
  - @voyant-travel/finance-contracts@0.112.0

## 0.107.1

### Patch Changes

- Updated dependencies [d98648a]
  - @voyant-travel/finance-contracts@0.111.0
  - @voyant-travel/products-contracts@0.110.1

## 0.107.0

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

### Patch Changes

- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
  - @voyant-travel/products-contracts@0.110.0

## 0.106.1

### Patch Changes

- Updated dependencies [3d793c1]
  - @voyant-travel/products-contracts@0.109.0

## 0.106.0

### Minor Changes

- f69e880: Make commercial commitment the sole Booking creation boundary for Booking
  Platform v1.

  Bookings now use only `confirmed`, `in_progress`, `completed`, and `cancelled`
  states. Quote, Hold, supplier-operation, and payment lifecycles remain owned by
  their respective domains. The beta-data migration preserves evidenced
  commitments, fails closed on ambiguous external effects, restores capacity for
  abandoned attempts, and removes the obsolete Booking-backed session state.

### Patch Changes

- Updated dependencies [f69e880]
  - @voyant-travel/bookings-contracts@0.114.0

## 0.105.2

### Patch Changes

- Updated dependencies [9f412dd]
- Updated dependencies [2ed62d3]
  - @voyant-travel/bookings-contracts@0.113.0
  - @voyant-travel/finance-contracts@0.110.0
  - @voyant-travel/legal-contracts@0.108.2
  - @voyant-travel/products-contracts@0.108.3
  - @voyant-travel/relationships-contracts@0.110.2

## 0.105.1

### Patch Changes

- Updated dependencies [15c1c64]
  - @voyant-travel/bookings-contracts@0.112.0
  - @voyant-travel/finance-contracts@0.109.1
  - @voyant-travel/legal-contracts@0.108.1
  - @voyant-travel/products-contracts@0.108.2
  - @voyant-travel/relationships-contracts@0.110.1

## 0.105.0

### Minor Changes

- f7adc5b: Add configurable Product families, stable subtypes, explicit minute durations, family-first quick starts, and standard family Catalog views.

### Patch Changes

- Updated dependencies [f7adc5b]
- Updated dependencies [f7adc5b]
  - @voyant-travel/products-contracts@0.108.0

## 0.104.21

### Patch Changes

- Updated dependencies [2601445]
  - @voyant-travel/finance-contracts@0.109.0
  - @voyant-travel/products-contracts@0.107.12

## 0.104.20

### Patch Changes

- Updated dependencies [e65bd25]
  - @voyant-travel/legal-contracts@0.108.0
  - @voyant-travel/relationships-contracts@0.110.0
  - @voyant-travel/bookings-contracts@0.111.1
  - @voyant-travel/finance-contracts@0.108.1
  - @voyant-travel/products-contracts@0.107.11

## 0.104.19

### Patch Changes

- 0f7888e: Fold `@voyant-travel/admin-client` into `@voyant-travel/admin-react`.

  The client was a single-export package whose only consumer was `admin-react`,
  which already re-exported all of it — so the split cost a package and a
  published version line without giving anyone a smaller surface to depend on.

  Its modules now live at `@voyant-travel/admin-react/client`, and the root export
  is unchanged: everything previously reachable from `@voyant-travel/admin-react`
  still is, including the `@voyant-travel/admin-contracts` surface the client
  re-exported.

  **`@voyant-travel/admin-client` will no longer be published.** Anything importing
  it should import `@voyant-travel/admin-react` (same surface) or
  `@voyant-travel/admin-react/client` for just the HTTP client and auth.

## 0.104.18

### Patch Changes

- Updated dependencies [c30b6b0]
  - @voyant-travel/finance-contracts@0.108.0

## 0.104.17

### Patch Changes

- Updated dependencies [8adeb23]
  - @voyant-travel/bookings-contracts@0.111.0

## 0.104.16

### Patch Changes

- Updated dependencies [17f1239]
  - @voyant-travel/bookings-contracts@0.110.0

## 0.104.15

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/legal-contracts@0.107.0
  - @voyant-travel/bookings-contracts@0.109.2
  - @voyant-travel/finance-contracts@0.107.3
  - @voyant-travel/products-contracts@0.107.10
  - @voyant-travel/relationships-contracts@0.109.2

## 0.104.14

### Patch Changes

- Updated dependencies [d2d7384]
  - @voyant-travel/finance-contracts@0.107.0

## 0.104.13

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/relationships-contracts@0.109.0
  - @voyant-travel/bookings-contracts@0.109.0
  - @voyant-travel/finance-contracts@0.106.2
  - @voyant-travel/legal-contracts@0.106.11
  - @voyant-travel/products-contracts@0.107.3

## 0.104.12

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
  - @voyant-travel/bookings-contracts@0.108.1
  - @voyant-travel/finance-contracts@0.106.1
  - @voyant-travel/legal-contracts@0.106.10
  - @voyant-travel/products-contracts@0.107.1
  - @voyant-travel/relationships-contracts@0.108.13

## 0.104.11

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/finance-contracts@0.106.0
  - @voyant-travel/bookings-contracts@0.108.0
  - @voyant-travel/products-contracts@0.107.0
  - @voyant-travel/legal-contracts@0.106.9
  - @voyant-travel/relationships-contracts@0.108.12

## 0.104.10

### Patch Changes

- Updated dependencies [ba6c30a]
  - @voyant-travel/bookings-contracts@0.107.0

## 0.104.9

### Patch Changes

- Updated dependencies [8405bee]
  - @voyant-travel/products-contracts@0.106.0

## 0.104.8

### Patch Changes

- Updated dependencies [51f7dea]
  - @voyant-travel/finance-contracts@0.105.0
  - @voyant-travel/legal-contracts@0.106.0

## 0.104.7

### Patch Changes

- Updated dependencies [04681f3]
- Updated dependencies [9c3fe53]
  - @voyant-travel/bookings-contracts@0.106.0
  - @voyant-travel/relationships-contracts@0.108.0

## 0.104.6

### Patch Changes

- eef1a00: Republish notification and UI consumer packages so stale beta artifacts no longer reference legacy notification package specifiers.

## 0.104.5

### Patch Changes

- c8189fc: Split the legacy `@voyant-travel/crm-contracts` package into
  `@voyant-travel/relationships-contracts` and
  `@voyant-travel/quotes-contracts`. Runtime packages and public validation
  imports now depend on the domain-specific contract packages.
- Updated dependencies [9e970a5]
- Updated dependencies [b711b04]
- Updated dependencies [c3f4fa0]
- Updated dependencies [2c9c4a4]
- Updated dependencies [c8189fc]
  - @voyant-travel/finance-contracts@0.104.5
  - @voyant-travel/legal-contracts@0.105.0
  - @voyant-travel/bookings-contracts@0.105.0
  - @voyant-travel/relationships-contracts@0.107.0

## 0.104.4

### Patch Changes

- Updated dependencies [d1ad572]
- Updated dependencies [d1ad572]
- Updated dependencies [d1ad572]
- Updated dependencies [d1ad572]
  - @voyant-travel/crm-contracts@0.106.0
  - @voyant-travel/bookings-contracts@0.104.2
  - @voyant-travel/finance-contracts@0.104.4
  - @voyant-travel/legal-contracts@0.104.2
  - @voyant-travel/products-contracts@0.105.1

## 0.104.3

### Patch Changes

- Updated dependencies [6949669]
  - @voyant-travel/crm-contracts@0.105.0

## 0.104.2

### Patch Changes

- Updated dependencies [921f4fc]
  - @voyant-travel/products-contracts@0.105.0

## 0.104.1

### Patch Changes

- @voyant-travel/bookings-contracts@0.104.1
- @voyant-travel/crm-contracts@0.104.1
- @voyant-travel/finance-contracts@0.104.1
- @voyant-travel/legal-contracts@0.104.1
- @voyant-travel/products-contracts@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/bookings-contracts@0.104.0
- @voyant-travel/crm-contracts@0.104.0
- @voyant-travel/finance-contracts@0.104.0
- @voyant-travel/legal-contracts@0.104.0
- @voyant-travel/products-contracts@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/bookings-contracts@0.103.0
- @voyant-travel/crm-contracts@0.103.0
- @voyant-travel/finance-contracts@0.103.0
- @voyant-travel/legal-contracts@0.103.0
- @voyant-travel/products-contracts@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/bookings-contracts@0.102.0
- @voyant-travel/crm-contracts@0.102.0
- @voyant-travel/finance-contracts@0.102.0
- @voyant-travel/legal-contracts@0.102.0
- @voyant-travel/products-contracts@0.102.0

## 0.101.2

### Patch Changes

- Updated dependencies [577eaf5]
- Updated dependencies [577eaf5]
  - @voyant-travel/bookings-contracts@0.101.2
  - @voyant-travel/crm-contracts@0.101.2
  - @voyant-travel/finance-contracts@0.101.2
  - @voyant-travel/legal-contracts@0.101.2
  - @voyant-travel/products-contracts@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/bookings-contracts@0.101.1
- @voyant-travel/crm-contracts@0.101.1
- @voyant-travel/finance-contracts@0.101.1
- @voyant-travel/legal-contracts@0.101.1
- @voyant-travel/products-contracts@0.101.1

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

- Updated dependencies [8e7b56a]
  - @voyant-travel/bookings-contracts@0.101.0
  - @voyant-travel/crm-contracts@0.101.0
  - @voyant-travel/finance-contracts@0.101.0
  - @voyant-travel/legal-contracts@0.101.0
  - @voyant-travel/products-contracts@0.101.0

## 0.100.0

### Minor Changes

- 061bef2: Expand the Admin API SDK (#1411).

  - **admin-contracts (5.2):** add operation descriptors for CRM (people +
    organizations CRUD, plus the PII-gated person-document reveal), legal
    (contracts CRUD + issue/void, policies CRUD + cancellation evaluation), and
    products (read surface: list/get). Inputs derive from the canonical
    `@voyant-travel/crm-contracts` / `@voyant-travel/legal-contracts` route schemas; outputs
    are loose client-facing projections. Scopes follow the path+method convention
    `requireActor` enforces (GET→`:read`, POST/PATCH→`:write`, DELETE→`:delete`).
  - **admin-client:** typed `crm`, `legal`, and `products` namespaces over the new
    descriptors.
  - **admin-react (5.3):** new package — a generic React Query adapter over the
    admin client. `AdminClientProvider`/`useAdminClient`, plus descriptor-driven
    `useAdminQuery`, `useAdminMutation`, and `useCapabilities`. Works for any
    operation descriptor (current or future) rather than bespoke per-screen hooks.

### Patch Changes

- @voyant-travel/bookings-contracts@0.100.0
- @voyant-travel/crm-contracts@0.100.0
- @voyant-travel/finance-contracts@0.100.0
- @voyant-travel/legal-contracts@0.100.0

## 0.99.0

### Patch Changes

- cb22020: Add a descriptor consistency guard (test): asserts every admin operation
  descriptor is well-formed and internally consistent — unique ids, an
  `/v1/admin/<domain>` path matching the operation's id prefix, a valid
  method/classification, `resource:action` scopes, and a `path()` builder that
  substitutes every template param. Catches the authoring-drift class that makes a
  descriptor diverge from the API surface. (The complementary live route-existence
  check belongs in a deployment test; #1411 5.4.)
  - @voyant-travel/bookings-contracts@0.99.0
  - @voyant-travel/finance-contracts@0.99.0

## 0.98.0

### Minor Changes

- 161222e: Derive admin operation inputs from the module contracts (single source of truth).

  `@voyant-travel/admin-contracts` now derives its operation **input** schemas from the
  canonical route validation in `@voyant-travel/bookings-contracts` and
  `@voyant-travel/finance-contracts` instead of re-declaring them:

  - `recordPaymentInput` / `createPaymentLinkInput` are now `.pick()`ed from the
    finance route schemas (removing the duplicated `PAYMENT_METHODS` enum), and
    `confirmBookingInput` / `cancelBookingInput` reuse the bookings route schemas.
    This eliminates the descriptor↔route drift class by construction — the SDK
    input is the route's schema.
  - Output DTOs (`BookingSummary`, `InvoiceSummary`, `Payment`) stay curated and
    loose (`status: z.string()`) for forward-compatibility with server-added enum
    values.

  `InferInput` now resolves to `z.input` (the caller-facing, pre-parse type) so
  schema defaults (e.g. a payment `status` that defaults to `"pending"`) are
  optional for the caller rather than required.

### Patch Changes

- @voyant-travel/bookings-contracts@0.98.0
- @voyant-travel/finance-contracts@0.98.0

## 0.97.0

### Minor Changes

- aa73935: Introduce the Admin API contract + SDK (first slice).

  `@voyant-travel/admin-contracts` defines admin operations as typed, versioned,
  transport-agnostic descriptors — `OperationDescriptor` + `defineOperation()`,
  action classification (`read | routine_write | destructive |
requires_confirmation`), shared error/pagination envelopes, and a
  capability-discovery descriptor. It ships the first operation catalogue for
  bookings (list/get/confirm/cancel) and finance (invoice list/get, record
  payment, create payment link). Pure and zod-only.

  `@voyant-travel/admin-client` is a framework-neutral client (`createAdminClient`)
  that executes those descriptors from Expo, Node, Workers, and Max/AI tools — no
  React or framework runtime deps. It handles auth (API key / bearer / custom),
  typed `AdminApiError`s, pagination, idempotency keys, and capability discovery.

  The architecture, package boundaries, and roadmap (server `_meta/capabilities`
  route, more domains, React/Expo adapters, Max-tool wrappers) are documented in
  `docs/adr/0003-admin-api-contract-sdk.md`. Web admin, mobile, Max tools, and
  brokers consume one surface, keeping permission and audit semantics consistent.
