# @voyant-travel/distribution

Distribution module for Voyant. Distribution owns the broader commercial
network: channels, suppliers, source/operator links, external refs, mappings,
allotments, channel push, webhooks, and reconciliation for OTA,
tour-operator, and DMC deployments.

Distribution is cross-cutting channel support. It is not a separate
implementation scenario or user base.

## The Direct channel is not a counterparty

`channels` is a table of parties an operator distributes through — it carries
contracts, commissions, rate limits and contact projections, and it sits next to
`suppliers`. Exactly one row is not like that: the one the deployment publishes
its own surfaces to.

A migration provisions it and marks it `system_key = 'direct'`. It is the
channel a public request resolves to when nothing names another one, which is
why it cannot be deleted or moved off `active` (both answer `409`) and why its
`kind` is fixed. Its name and contact details remain the operator's to edit.

The marker is a column rather than a `metadata` key because it has to be
unforgeable: `metadata` is editable through the ordinary channel `PATCH`, so a
flag there could be cleared and the row the public API depends on then deleted.

`GET /channels` takes `system=include|exclude|only` and **defaults to
`include`**. Publication and product-mapping surfaces read the same endpoint and
must be able to target Direct — default-hiding it would make the channel
everything publishes to the one channel nothing can be published to. Only the
counterparty list passes `exclude`.

Resolution lives with the consumer, not here: `@voyant-travel/auth` reads the
row directly in `public surface-channel-binding-provider.ts` (raw SQL, so
Distribution's tables are not imported into Auth). It prefers the system row and
falls back to the oldest active `direct` channel, so a deployment whose operator
hand-created a self-representing channel before this existed keeps resolving to
the row its publication rules are already keyed by.

## Install

```bash
pnpm add @voyant-travel/distribution
```

## Usage

```typescript
import { distributionModule } from "@voyant-travel/distribution"
import { createApp } from "@voyant-travel/hono"

const app = createApp({
  modules: [distributionModule],
  // ...
})
```

## Exports

| Entry | Description |
| --- | --- |
| `.` | Module export |
| `./channel-push-jobs` | Package-owned channel-push job handlers |
| `./channel-push-runtime` | Runtime port and host composition for channel push |
| `./channel-push-subscribers` | Domain-event subscribers that record channel-push intent |
| `./schema` | Drizzle tables |
| `./validation` | Zod schemas |
| `./routes` | Hono routes |
| `./suppliers` | Supplier identity, services, rates, notes, routes, validation, and schema owner path |
| `./external-refs` | External reference routes, service, validation, and schema owner path |
| `./tools` | Guarded supplier, channel, and external-reference Tool definitions |
| `./mcp-runtime` | Tool definitions plus the package-owned runtime context contributor |

The Tool surface provides staff-scoped list, detail, create, and update
capabilities for supplier profiles, distribution channels, and external
references. Destructive deletes remain outside the Tool surface until a
deployment selects an explicit destructive-action policy.

Selecting the package's channel-push extension selects its subscribers and
jobs. Their schedules come from the package manifest; applications do not
redeclare them through environment flags or project-local job definitions.

## License

Apache-2.0
