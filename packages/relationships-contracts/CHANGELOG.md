# @voyant-travel/relationships-contracts

## 0.111.1

### Patch Changes

- 38531e2: Advertise email fields with a regex a strict-schema LLM client can parse.

  Zod's default `z.email()` pattern opens with `^(?!\.)(?!.*\.\.)`, and providers
  that validate tool schemas with an RE2-style engine reject regex lookaround
  outright. A client sends every authorized tool schema in one model call, so the
  18 affected fields took down every turn of a conversation, including questions
  that never touched the Tools carrying them.

  `@voyant-travel/schema-kit/email` now exports `emailAddress()`, which says
  exactly what zod's default says but structurally: the local part is
  dot-separated runs of non-dot characters, which is what "no leading dot, no
  consecutive dots, no trailing dot" means. A differential fuzz against
  `z.regexes.email` over 700k inputs found zero classification differences, so no
  field's verdict changes. At 84 characters it is also shorter than the 96-char
  default it replaces, which matters because these patterns ship inside every
  advertised Tool schema.

- Updated dependencies [38531e2]
  - @voyant-travel/schema-kit@0.118.9

## 0.111.0

### Minor Changes

- f60a572: Fold a confirmed booking into the customer's CRM record. Until now a customer booking created a person row carrying a name, an email and a phone number, and nothing else — Activities, Addresses, Relationships and Communications all stayed empty unless an operator filled them in by hand.

  A `booking.confirmed` subscriber in relationships now writes a timeline activity linked to both the person and the booking, saves the billing address the checkout already collected (it was being parsed into the booking's contact columns and then dropped), and links co-travelers to the booker as travel companions. The pass is idempotent, so a redelivered event is a no-op, and it runs off the commit transaction so a CRM failure can never roll back a paid booking.

  The Communications tab now also lists messages the deployment actually delivered to the person, read from the notification delivery record rather than copied into `communication_log`, and each entry reports whether it was logged by staff or sent automatically.

  Bookings gains a `bookings.crm-snapshot.runtime` port so CRM can read a booking without importing its tables, and `entity_type` gains a `booking` member so an activity can name the booking it came from.

## 0.110.2

### Patch Changes

- Updated dependencies [9f412dd]
- Updated dependencies [2ed62d3]
  - @voyant-travel/schema-kit@0.118.0

## 0.110.1

### Patch Changes

- Updated dependencies [15c1c64]
  - @voyant-travel/schema-kit@0.117.0

## 0.110.0

### Minor Changes

- e65bd25: Rename the bespoke sales Quote domain to Proposals across packages, routes, schemas, migrations, generated graph authorities, and operator surfaces.

  This beta-line release keeps no compatibility aliases, routes, package names, forwarding exports, views, or dual writes for the bespoke sales rename. Existing beta databases that contain the old bespoke quote schema must be dropped and recreated from the clean-slate migrations; there is no in-place migration path and no data-preservation guarantee for those beta databases.

### Patch Changes

- Updated dependencies [e65bd25]
  - @voyant-travel/schema-kit@0.116.0

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

- 52352c4: Move custom-field definition Settings ownership to the generic custom-fields
  package. Selected entity manifests now declare the targets and field types that
  the canonical API may accept. The unused Relationships definition API and
  Settings surfaces are removed without compatibility adapters.

  Target capability declarations now constrain searchable, exportable, and
  invoiceable settings end to end, and unsupported flags are stored as false.

- 52352c4: Store custom-field values exclusively as `custom_fields[namespace][key]`.
  Owner-scoped value operations derive namespaces from trusted definition
  context, ordinary entity routes preserve non-operator namespaces, and
  definition rename/delete cleanup is delegated to the package that owns each
  entity table.
- 52352c4: Remove project-local TypeScript custom-field declarations, discovery globs,
  executable validation callbacks, and code/database merge helpers. The generic
  custom-fields package now owns canonical value routes and dispatches operations
  to selected entity-owning packages through typed runtime contributions, with no
  Relationships compatibility adapter.

### Patch Changes

- 52352c4: Resolve custom-field definitions exclusively from persisted Settings records.
  Bookings and Relationships now share the package-owned database resolver.
  Project-local TypeScript authoring is removed by the completed custom-fields
  cutline.
- Updated dependencies [52352c4]
  - @voyant-travel/schema-kit@0.113.0

## 0.108.13

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
  - @voyant-travel/schema-kit@0.112.1

## 0.108.12

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/schema-kit@0.112.0

## 0.108.11

### Patch Changes

- bf2d4a5: Reject invalid communication `sentAt` values during request validation instead of failing during persistence.

## 0.108.10

### Patch Changes

- 5e6a2ff: Expose person payment methods and communication logs on the person detail UI, add React hooks for those person-scoped resources, and enforce kind-specific payment method validation for cards versus bank transfers.
- 92bac99: Validate person document issue/expiry date ranges and expose add and primary actions in the person detail documents tab.
- c7bd13f: Reject reversed person relationship date ranges and return stable conflicts for duplicate creates.

## 0.108.9

### Patch Changes

- e002da8: Preserve existing person fields when PATCH requests omit create-defaulted status and tags.

## 0.108.8

### Patch Changes

- 1fec6bd: Validate organization default currency codes and cap payment terms.

## 0.108.7

### Patch Changes

- 46d7d52: Keep organization PATCH requests partial by avoiding create defaults on update
  payloads, so omitted fields such as status and tags remain unchanged.

## 0.108.6

### Patch Changes

- Updated dependencies [722455d]
  - @voyant-travel/schema-kit@0.111.0

## 0.108.5

### Patch Changes

- Updated dependencies [06cfcf5]
  - @voyant-travel/schema-kit@0.110.0

## 0.108.4

### Patch Changes

- Updated dependencies [787c852]
  - @voyant-travel/schema-kit@0.109.0

## 0.108.3

### Patch Changes

- Updated dependencies [924d201]
- Updated dependencies [f311826]
  - @voyant-travel/schema-kit@0.108.0

## 0.108.2

### Patch Changes

- Updated dependencies [b68d6a7]
  - @voyant-travel/schema-kit@0.107.0

## 0.108.1

### Patch Changes

- Updated dependencies [a74471e]
  - @voyant-travel/schema-kit@0.106.0

## 0.108.0

### Minor Changes

- 9c3fe53: Custom-fields unification (phase 2 — person/organization adopt the `custom_fields` column). Both `people` and `organizations` gain a `custom_fields jsonb default '{}'` column (framework bundle migration `0002`), and their create/update routes validate `customFields` at the write boundary against the resolved registry (code ∪ runtime `custom_field_definitions`):

  - `relationships`: `RelationshipsRouteRuntime(+Options).customFields` resolver; a `validateRelationshipsCustomFields(c, entity, data)` helper on the accounts route (its `Env` now exposes `container`); person/org writes persist the cleaned value.
  - `relationships-contracts`: `customFields` added to the person/organization core schemas.
  - `framework`: the relationships factory moves Tier 1 → 2 to receive `capabilities.customFields`.

  Values now live on the entity row for `booking`, `person`, and `organization`. Still ahead: repoint the EAV value API to the column + backfill `custom_field_values` → jsonb, then retire the side table. Oracle-verified (bundle + links == live schema).

## 0.107.0

### Minor Changes

- c8189fc: Split the legacy `@voyant-travel/crm-contracts` package into
  `@voyant-travel/relationships-contracts` and
  `@voyant-travel/quotes-contracts`. Runtime packages and public validation
  imports now depend on the domain-specific contract packages.

### Patch Changes

- Updated dependencies [e80e3d3]
  - @voyant-travel/schema-kit@0.105.3

## 0.106.1

### Patch Changes

- db9c5cd: Split oversized CRM account tests, contract validation, React detail surfaces, and locale dictionaries into smaller internal modules while preserving existing public exports and behavior.

## 0.106.0

### Minor Changes

- d1ad572: Rename CRM sales artifacts from Opportunities to Quotes, split Quote Versions into their own schema/API surface, and update the corresponding TypeID prefixes.
- d1ad572: Add Quote Version send, view, decline, and expiry lifecycle APIs with a public proposal read model.
- d1ad572: Add Quote Version accept lifecycle contracts and CRM state transition for accepted proposal versions.
- d1ad572: Add composer-owned Trip snapshot freezing and read APIs for Quote Version proposal snapshots.

### Patch Changes

- Updated dependencies [d1ad572]
- Updated dependencies [d1ad572]
  - @voyant-travel/schema-kit@0.105.0

## 0.105.0

### Minor Changes

- 6949669: Add CRM people and organization merge contracts, routes, React mutations, and detail-page UI actions.

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
