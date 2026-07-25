# @voyant-travel/quotes

Quotes owns pipelines, stages, quotes, quote versions, quote participants,
quote products, quote version lines, proposal lifecycle decisions, and the
public proposal and booking quote details extensions.

People and organizations are referenced by plain ids. This package does not
import Relationships schema tables or own relationship lifecycle state.

## Install

```bash
pnpm add @voyant-travel/quotes
```

## Usage

```typescript
import { quotesModule } from "@voyant-travel/quotes"
import { createApp } from "@voyant-travel/hono"

const app = createApp({
  modules: [quotesModule],
})
```

## Exports

| Entry | Description |
| --- | --- |
| `.` | Module export, services, public types, linkables |
| `./schema` | Quotes-owned Drizzle tables |
| `./validation` | Quote lifecycle validation schemas |
| `./routes` | Hono routes for pipelines, stages, quotes, and quote versions |
| `./booking-extension` | Booking quote details extension |
| `./runtime-port` | Narrow Notifications delivery contract used by the proposal composer |
| `./tools` | Typed quote reads and guarded proposal snapshot/delivery/decision Tools |

## Agent Tools

`@voyant-travel/quotes/tools` exposes staff-only quote reads plus the complete proposal lifecycle:
snapshot the current quote lines, mark a draft version sent, and record accept or decline. These
Tools call the existing atomic quote services and return structural, JSON-safe quote/version
records. Snapshot, send, accept, and decline require confirmation and action-ledger recording;
acceptance additionally requires graph approval because it wins the quote and closes competing
versions.

The proposal extension additionally owns `snapshot_and_send_quote`: one confirmation- and
approval-gated command snapshots the current quote, renders a public proposal link through a
vetted Notifications template, atomically enqueues the delivery, and marks that exact version
sent. Idempotency and approval come exclusively from the admitted `_voyant` invocation. The quote
snapshot, action claim, exact selected notification provider, durable delivery operation, and
replay result commit together; provider code runs only in Notifications' worker.

The action is unavailable by default and becomes available only when the deployment selects a
`notifications.durable-provider` implementation that passes replay, restart, accepted-count, and
payload-drift conformance. Missing or non-conformant providers fail closed.

Public proposal acceptance records the customer's Quotes-owned lifecycle decision only. It does
not reserve a Trip, cancel supplier holds, start checkout, or resolve deployment mutation
adapters. Reservation and checkout remain separate approved domain actions.

`send_quote_version` remains the state-only primitive;
`snapshot_and_send_quote` is the composed customer-delivery flow. Historical
hosted invocation aliases are not published; callers use the canonical Tool
names and stable capability IDs.

## License

Apache-2.0
