# @voyant-travel/proposals-contracts

Pure validation schemas for proposals, proposal versions, proposal lines, proposal
participants, proposal products, pipelines, stages, and proposal-facing enums,
zod-only, for consumers that validate proposal payloads without depending on the
runtime package.

## Install

```bash
pnpm add @voyant-travel/proposals-contracts zod
```

## Usage

```ts
import {
  entityTypeSchema,
  insertProposalSchema,
  proposalStatusSchema,
} from "@voyant-travel/proposals-contracts"
```

Runtime validation barrels are exposed from `@voyant-travel/proposals/validation`.
