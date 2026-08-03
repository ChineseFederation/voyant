# @voyant-travel/admin-contracts

The Admin API contract layer for Voyant — typed, versioned, transport-agnostic
descriptors for the operations an authenticated operator can perform against a
Voyant-powered admin deployment. Web admin, the Expo mobile admin, Max/AI tool
wrappers, and Voyant Cloud brokers all consume the same descriptors, so
permission and audit semantics stay identical across callers.

Pure and `zod`-only. No framework runtime (Drizzle/Hono/DB), no React, no
web-UI dependencies. See [`docs/adr/0003-admin-api-contract-sdk.md`](../../docs/adr/0003-admin-api-contract-sdk.md).

## What's here

- **Core** — `OperationDescriptor` + `defineOperation()`, action classification
  (`read | routine_write | destructive | requires_confirmation`), the shared
  error and pagination envelopes, and the capability-discovery descriptor.
- **Operation catalogues** — `bookingsOperations`, `financeOperations`
  (first slice: list/get/cancel and invoice list/get, record payment,
  create payment link).

Execute these with [`@voyant-travel/admin-client`](../admin-client/README.md).

## Usage

```ts
import { bookingsOperations, type InferInput } from "@voyant-travel/admin-contracts"

const op = bookingsOperations.cancel
op.id            // "bookings.cancel"
op.classification // "requires_confirmation"
op.scopes        // ["bookings:write"]
op.path({ id: "book_123" }) // "/v1/admin/bookings/book_123/cancel"
type CancelInput = InferInput<typeof op>
```

The descriptors are data: the client turns them into typed calls, a Max-tool
wrapper turns them into agent tools with risk gating from `classification`, and
the capabilities endpoint lists them.
