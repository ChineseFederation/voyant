# @voyant-travel/bookings-contracts

## 0.112.0

### Minor Changes

- 15c1c64: Add the Booking v1 priced traveler-roster Amendment lifecycle: immutable and
  expiring exact-revision previews, server-owned price/tax and collection/refund
  consequences, acceptance, transactional owned-capacity projection, durable
  sourced Supplier Operation dispatch and reconciliation, explicit partial and
  uncertain outcomes, and consistent authenticated, storefront, and Tool
  transports.

### Patch Changes

- Updated dependencies [15c1c64]
  - @voyant-travel/schema-kit@0.117.0

## 0.111.1

### Patch Changes

- Updated dependencies [e65bd25]
  - @voyant-travel/schema-kit@0.116.0

## 0.111.0

### Minor Changes

- 8adeb23: Make agent-driven booking create, confirmation, cancellation, passenger capacity, persisted option/unit/extra pricing, invoice reconciliation, approval admission, paid-settlement previews, immediate reads, idempotent lifecycle replay, notification suppression, and required-schema deployment admission coherent.

## 0.110.0

### Minor Changes

- 17f1239: Replace the inline Finance booking-create HTTP and dual-create surfaces with one
  handler-admitted, idempotent created-target Tool command. Booking rows, dependent
  finance records, the canonical action-ledger result, and domain-event outbox
  entries now settle in one transaction; exact retries resolve the original booking.

  Remove the retired booking-create React mutation, sheet, page, and slot shortcut.
  Unmount the legacy admin new/journey routes and semantic destinations, remove
  catalog and inventory booking actions, and remove the standard storefront
  `/shop/book/:entityModule/:entityId` route plus its booking page/journey exports.
  Catalog browsing, booking read/detail, customer-portal sessions, and reusable
  draft sections remain available; new booking creation is a Finance staff Tool.
  Remove raw Bookings, Charter, and Cruise creation APIs and Tools. Delete the
  dormant Catalog owned-commit contract and Inventory, Accommodations, Cruises,
  Commerce, Storefront, and Storefront SDK booking-row creation bridges rather
  than retaining unavailable legacy mutations. Require registry-minted,
  unforgeable handler admission plus a single-use Finance-specific mutation lease
  for Bookings domain settlement, and remove the Finance command's public
  subpath.

## 0.109.2

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/schema-kit@0.115.0

## 0.109.1

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/schema-kit@0.114.0

## 0.109.0

### Minor Changes

- 52352c4: Store custom-field values exclusively as `custom_fields[namespace][key]`.
  Owner-scoped value operations derive namespaces from trusted definition
  context, ordinary entity routes preserve non-operator namespaces, and
  definition rename/delete cleanup is delegated to the package that owns each
  entity table.

### Patch Changes

- Updated dependencies [52352c4]
  - @voyant-travel/schema-kit@0.113.0

## 0.108.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
  - @voyant-travel/schema-kit@0.112.1

## 0.108.0

### Minor Changes

- bbe6396: Replace the overloaded Finance voucher domain with Travel Credits across the
  database schema, APIs, package exports, booking inputs, storefront settings,
  and operator UI. Redemption commands are replay-safe, codes are normalized and
  case-insensitively unique, and legacy records migrate in place without silently
  skipping invalid balances. Keep Promotion Codes in Commerce and move Bookings
  fulfillment to the explicit Service Voucher vocabulary.

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/schema-kit@0.112.0

## 0.107.0

### Minor Changes

- ba6c30a: Add a vertical enrichment seam to the public guest-booking overview so
  storefront "manage my booking" / confirmation surfaces can render
  accommodation specifics from the public API alone (issue #2969).

  Deployments can register a per-`booking_item_type` enricher via the new
  `overviewItemEnrichers` option on the bookings route runtime. Each enricher
  receives the overview items of its type and returns an opaque `details`
  block that is attached to the matching overview item, keyed by booking item
  id. Enrichment is best-effort — a failing enricher is skipped rather than
  failing the guest-authorized overview.

  `@voyant-travel/accommodations` ships the first enricher
  (`enrichStayBookingOverviewItems`, exported from
  `@voyant-travel/accommodations/booking-overview-enricher`), contributing
  property, room type, rate plan, meal plan and per-night rate details. The
  framework composition wires it to the `accommodation` item type.

## 0.106.7

### Patch Changes

- 141bd2b: Reconcile draft booking items when overriding a booking to confirmed, block item mutations for cancelled bookings, and validate cost currency when cost amounts are entered.

## 0.106.6

### Patch Changes

- Updated dependencies [722455d]
  - @voyant-travel/schema-kit@0.111.0

## 0.106.5

### Patch Changes

- Updated dependencies [06cfcf5]
  - @voyant-travel/schema-kit@0.110.0

## 0.106.4

### Patch Changes

- Updated dependencies [787c852]
  - @voyant-travel/schema-kit@0.109.0

## 0.106.3

### Patch Changes

- Updated dependencies [924d201]
- Updated dependencies [f311826]
  - @voyant-travel/schema-kit@0.108.0

## 0.106.2

### Patch Changes

- Updated dependencies [b68d6a7]
  - @voyant-travel/schema-kit@0.107.0

## 0.106.1

### Patch Changes

- Updated dependencies [a74471e]
  - @voyant-travel/schema-kit@0.106.0

## 0.106.0

### Minor Changes

- 04681f3: Adopt custom fields on `booking` — the first entity consumer of the `@voyant-travel/core/custom-fields` registry.

  - A `custom_fields jsonb default '{}'` column on `bookings` (framework bundle migration `0001`).
  - Booking create/update routes validate the `customFields` payload at the boundary against the deployment's injected registry (`validateBookingCustomFields`): unknown keys, missing required, and wrong types are rejected 400; only registry-approved values are persisted. Writes that carry `customFields` when the deployment declares none are rejected.
  - The registry is injected through `BookingRouteRuntimeOptions.customFields` → `createBookingsHonoModule` → a new optional `FrameworkProviders.customFields` provider, which a deployment supplies (the operator wires its discovered `operatorCustomFields`).

  Read paths return `custom_fields` as part of the booking row. Oracle-verified (`bundle + links == live schema`). Per-entity adoption continues with `person`/`product`; export/invoice/search consumption of `customFieldsVisibleIn` is a follow-up. See `docs/architecture/custom-fields.md`.

## 0.105.0

### Minor Changes

- 2c9c4a4: Retire the runtime Transactions packages before v1. The default Bookings/OCTO
  bridge now reads booking origin/provenance records instead of the legacy
  booking-to-transaction detail table, and the public `@voyant-travel/transactions`
  and `@voyant-travel/transactions-react` workspaces have been removed. The
  legacy `@voyant-travel/transactions-contracts` workspace is removed as well;
  use the owning domain contract/runtime package for replacement validation
  schemas.

### Patch Changes

- Updated dependencies [e80e3d3]
  - @voyant-travel/schema-kit@0.105.3

## 0.104.3

### Patch Changes

- 658aa37: Refactor bookings backend validation, pricing assignment, route, service, and integration coverage modules into smaller compatibility-preserving entrypoints.

## 0.104.2

### Patch Changes

- Updated dependencies [d1ad572]
- Updated dependencies [d1ad572]
  - @voyant-travel/schema-kit@0.105.0

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

- Updated dependencies [577eaf5]
  - @voyant-travel/schema-kit@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/schema-kit@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/schema-kit@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/schema-kit@0.100.0

## 0.99.0

### Patch Changes

- @voyant-travel/schema-kit@0.99.0

## 0.98.0

### Patch Changes

- @voyant-travel/schema-kit@0.98.0

## 0.97.0

### Minor Changes

- 7094c8e: Add `@voyant-travel/schema-kit` and extend the `*-contracts` pattern to the
  operational modules.

  `@voyant-travel/schema-kit` (pure: zod + typeid-js) is the new foundational home for
  schema primitives shared by the runtime and the contract packages — the TypeID
  system (prefix registry, id generation, zod validators), `booleanQueryParam`,
  and `kmsEnvelopeSchema`. These moved out of `@voyant-travel/db` (which now re-exports
  them from their original paths, so every call-site is unchanged) so they sit
  below the data layer and the contract packages can depend on them without
  pulling Drizzle.

  New zod-only contract packages own each module's validation surface (schemas +
  enums): `@voyant-travel/bookings-contracts`, `@voyant-travel/finance-contracts`,
  `@voyant-travel/crm-contracts`, `@voyant-travel/transactions-contracts`,
  `@voyant-travel/suppliers-contracts`, `@voyant-travel/identity-contracts`, and
  `@voyant-travel/legal-contracts`. Each runtime module re-exports from its contracts
  package, so existing `@voyant-travel/<module>/validation` import paths are unchanged.
  Shared primitives come from `@voyant-travel/schema-kit`, keeping the contract
  packages free of the data layer.

  (`legal-contracts` still transitively depends on `@voyant-travel/utils` for the
  template-syntax validator used by contract validation — a tracked follow-up
  would purify it.)

### Patch Changes

- Updated dependencies [7094c8e]
  - @voyant-travel/schema-kit@0.97.0
