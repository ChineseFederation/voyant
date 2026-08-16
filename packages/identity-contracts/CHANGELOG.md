# @voyant-travel/identity-contracts

## 0.104.18

### Patch Changes

- Updated dependencies [46d00dc]
  - @voyant-travel/schema-kit@0.119.0

## 0.104.17

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

## 0.104.16

### Patch Changes

- Updated dependencies [9f412dd]
- Updated dependencies [2ed62d3]
  - @voyant-travel/schema-kit@0.118.0

## 0.104.15

### Patch Changes

- Updated dependencies [15c1c64]
  - @voyant-travel/schema-kit@0.117.0

## 0.104.14

### Patch Changes

- Updated dependencies [e65bd25]
  - @voyant-travel/schema-kit@0.116.0

## 0.104.13

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/schema-kit@0.115.0

## 0.104.12

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/schema-kit@0.114.0

## 0.104.11

### Patch Changes

- Updated dependencies [52352c4]
  - @voyant-travel/schema-kit@0.113.0

## 0.104.10

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
  - @voyant-travel/schema-kit@0.112.1

## 0.104.9

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/schema-kit@0.112.0

## 0.104.8

### Patch Changes

- Updated dependencies [722455d]
  - @voyant-travel/schema-kit@0.111.0

## 0.104.7

### Patch Changes

- Updated dependencies [06cfcf5]
  - @voyant-travel/schema-kit@0.110.0

## 0.104.6

### Patch Changes

- Updated dependencies [787c852]
  - @voyant-travel/schema-kit@0.109.0

## 0.104.5

### Patch Changes

- Updated dependencies [924d201]
- Updated dependencies [f311826]
  - @voyant-travel/schema-kit@0.108.0

## 0.104.4

### Patch Changes

- Updated dependencies [b68d6a7]
  - @voyant-travel/schema-kit@0.107.0

## 0.104.3

### Patch Changes

- Updated dependencies [a74471e]
  - @voyant-travel/schema-kit@0.106.0

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
