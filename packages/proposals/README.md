# @voyant-travel/proposals

Proposals owns pipelines, stages, proposals, proposal versions, proposal participants,
proposal products, proposal version lines, proposal lifecycle decisions, and the
public proposal and booking proposal details extensions.

People and organizations are referenced by plain ids. This package does not
import Relationships schema tables or own relationship lifecycle state.

## Install

```bash
pnpm add @voyant-travel/proposals
```

## Usage

```typescript
import { proposalsModule } from "@voyant-travel/proposals"
import { createApp } from "@voyant-travel/hono"

const app = createApp({
  modules: [proposalsModule],
})
```

## Exports

| Entry | Description |
| --- | --- |
| `.` | Module export, services, public types, linkables |
| `./schema` | Proposals-owned Drizzle tables |
| `./validation` | Proposal lifecycle validation schemas |
| `./routes` | Hono routes for pipelines, stages, proposals, and proposal versions |
| `./booking-extension` | Booking proposal details extension |
| `./runtime-port` | Narrow Notifications delivery contract used by the proposal composer |
| `./tools` | Typed proposal reads and guarded proposal snapshot/delivery/decision Tools |

## Agent Tools

`@voyant-travel/proposals/tools` exposes staff-only proposal reads plus the complete proposal lifecycle:
snapshot the current proposal lines, mark a draft version sent, and record accept or decline. These
Tools call the existing atomic proposal services and return structural, JSON-safe proposal/version
records. Snapshot, send, accept, and decline require confirmation and action-ledger recording;
acceptance additionally requires graph approval because it wins the proposal and closes competing
versions.

The proposal extension additionally owns `snapshot_and_send_proposal`: one confirmation- and
approval-gated command snapshots the current proposal, renders a public proposal link through a
vetted Notifications template, atomically enqueues the delivery, and marks that exact version
sent. Idempotency and approval come exclusively from the admitted `_voyant` invocation. The proposal
snapshot, action claim, exact selected notification provider, durable delivery operation, and
replay result commit together; provider code runs only in Notifications' worker.

The action is unavailable by default and becomes available only when the deployment selects a
`notifications.durable-provider` implementation that passes replay, restart, accepted-count, and
payload-drift conformance. Missing or non-conformant providers fail closed.

Public proposal acceptance records the customer's Proposals-owned lifecycle decision only. It does
not reserve a Trip, cancel supplier holds, start checkout, or resolve deployment mutation
adapters. Reservation and checkout remain separate approved domain actions.

`send_proposal_version` remains the state-only primitive;
`snapshot_and_send_proposal` is the composed customer-delivery flow. Historical
hosted invocation aliases are not published; callers use the canonical Tool
names and stable capability IDs.

## License

Apache-2.0
