# @voyant-travel/custom-fields-contracts

Custom field definition contracts, separated from the custom-fields runtime so
that app publishers and other external consumers can validate definition
payloads without installing Drizzle schema, routes, and services.

Use this package for `customFieldDefinitionInputSchema`,
`updateCustomFieldDefinitionSchema`, `customFieldTypeSchema`, and the
associated inferred types. Use `@voyant-travel/custom-fields` when you also
need schema, routes, API runtime wiring, or the runtime contributor.

An app manifest declares app-owned custom fields by extending
`customFieldDefinitionInputSchema`; see `@voyant-travel/app-manifest`.

## Install

```bash
pnpm add @voyant-travel/custom-fields-contracts zod
```

## Usage

```ts
import {
  customFieldDefinitionInputSchema,
  type CustomFieldDefinitionInput,
} from "@voyant-travel/custom-fields-contracts"
```

Existing `@voyant-travel/custom-fields/contracts` imports continue to work —
that subpath re-exports this package.
