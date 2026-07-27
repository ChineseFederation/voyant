# @voyant-travel/admin-client

## 0.130.0

## 0.129.2

## 0.129.1

## 0.129.0

## 0.128.3

## 0.128.2

## 0.128.1

## 0.128.0

## 0.127.0

## 0.126.2

## 0.126.1

## 0.126.0

## 0.125.0

## 0.124.0

## 0.123.3

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
  - @voyant-travel/admin-contracts@0.104.12

## 0.123.2

### Patch Changes

- @voyant-travel/admin-contracts@0.104.11

## 0.123.1

## 0.123.0

## 0.122.0

## 0.121.0

## 0.120.0

## 0.119.0

## 0.118.0

## 0.117.0

## 0.116.0

### Patch Changes

- @voyant-travel/admin-contracts@0.104.9

## 0.115.4

## 0.115.3

## 0.115.2

## 0.115.1

### Patch Changes

- @voyant-travel/admin-contracts@0.104.8

## 0.115.0

## 0.114.0

## 0.113.0

## 0.112.0

### Patch Changes

- @voyant-travel/admin-contracts@0.104.7

## 0.111.5

## 0.111.4

## 0.111.3

## 0.111.2

### Patch Changes

- eef1a00: Republish notification and UI consumer packages so stale beta artifacts no longer reference legacy notification package specifiers.
- Updated dependencies [eef1a00]
  - @voyant-travel/admin-contracts@0.104.6

## 0.111.1

### Patch Changes

- Updated dependencies [c8189fc]
  - @voyant-travel/admin-contracts@0.104.5

## 0.111.0

## 0.110.0

## 0.109.0

## 0.108.0

## 0.107.0

## 0.106.0

## 0.105.2

## 0.105.1

## 0.105.0

### Patch Changes

- @voyant-travel/admin-contracts@0.104.4

## 0.104.2

## 0.104.1

### Patch Changes

- @voyant-travel/admin-contracts@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/admin-contracts@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/admin-contracts@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/admin-contracts@0.102.0

## 0.101.2

### Patch Changes

- @voyant-travel/admin-contracts@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/admin-contracts@0.101.1

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
  - @voyant-travel/admin-contracts@0.101.0

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

- Updated dependencies [061bef2]
  - @voyant-travel/admin-contracts@0.100.0

## 0.99.0

### Patch Changes

- Updated dependencies [cb22020]
  - @voyant-travel/admin-contracts@0.99.0

## 0.98.0

### Patch Changes

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

- Updated dependencies [161222e]
  - @voyant-travel/admin-contracts@0.98.0

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

### Patch Changes

- Updated dependencies [aa73935]
  - @voyant-travel/admin-contracts@0.97.0
