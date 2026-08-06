# @voyant-travel/db

Database layer for Voyant. Drizzle-based schemas for IAM + infra, runtime adapters for edge, serverless, and Node.js, TypeID columns, CRUD factory, and the runtime LinkService.

## Install

```bash
pnpm add @voyant-travel/db drizzle-orm
```

## Usage

```typescript
import { createDbClient, createServerlessDbClient } from "@voyant-travel/db"

// Edge reads / no interactive transactions — Neon HTTP adapter
const db = createDbClient(url)

// Cloudflare Workers with real transactions — Neon WebSocket adapter.
// Create inside the request and dispose through the Hono db middleware.
const { db: transactionalDb, dispose } = createServerlessDbClient(url)

// Node.js (workers, scripts) — Postgres.js adapter
const nodeDb = createDbClient(url, { adapter: "node" })
```

```typescript
import { createCrudService } from "@voyant-travel/db/crud"
import { createLinkService, syncLinks } from "@voyant-travel/db/links"
import { newId } from "@voyant-travel/db/lib/typeid"
```

## Schema Imports

Import from exported schema namespaces, not the root barrel:

```typescript
import { apikeyTable } from "@voyant-travel/db/schema/iam"
import { webhookSubscriptionsTable } from "@voyant-travel/db/schema/infra"
```

## Exports

| Entry | Description |
| --- | --- |
| `.` | `createDbClient`, adapter factories |
| `./lib/typeid` | `newId(prefix)` TypeID generator |
| `./lib/typeid-column` | Drizzle column helper for TypeID |
| `./columns` | Reusable column definitions |
| `./primitives` | Shared primitive tables (catalog, offers, etc.) |
| `./crud` | `createCrudService` — list/retrieve/create/update/delete factory |
| `./links` | `createLinkService`, `syncLinks` runtime link management |
| `./outbox` | Transactional event capture, bounded drain, retry, pruning, and backlog statistics |
| `./transaction-capability` | Transaction/disposal metadata helpers for runtime database clients |
| `./schema/iam` | IAM schemas — Better Auth, users, API keys, KMS, roles |
| `./schema/infra` | Infra schemas — webhooks, domains, email domain records |
| `./test-utils` | `createTestDb`, `cleanupTestDb` for integration tests |

## Transactional outbox operations

`drainOutbox` repeatedly claims due rows with `FOR UPDATE SKIP LOCKED` until the
queue is empty or its configurable batch, event, batch-count, or time budget is
reached. `limit` bounds each claim and `concurrency` bounds simultaneous
subscriber delivery; a visibility lease makes a crashed worker's rows eligible
for at-least-once redelivery without changing their stable event IDs.

The always-on `infrastructure.event-outbox-drain` job is both wakeable and
scheduled. Every run emits a structured log with claimed, delivered, retried,
dead-lettered, remaining backlog (with a cap flag), oldest pending age, and
duration. The schedule remains the recovery path when an immediate wake is
missed.

Maintenance and telemetry queries are intentionally bounded:

- delivered receipts are pruned oldest-first with a row limit;
- stale write intents expire oldest-first with a row limit;
- backlog/dead-letter counts inspect at most `scanLimit + 1` rows and report
  whether the displayed count is a lower bound.

The query plans rely on partial indexes whose predicates match the SQL exactly:
`event_outbox_due_idx` for ordered claims and due counts,
`event_outbox_pending_created_idx` for backlog age/counts,
`event_outbox_failed_created_idx` for dead-letter counts,
`event_outbox_delivered_idx` for retention pruning, and
`event_outbox_pending_intent_idx` for the pending-intent safeguard. The write
intent candidate scan uses `write_intents_pending_idx`.

## License

Apache-2.0
