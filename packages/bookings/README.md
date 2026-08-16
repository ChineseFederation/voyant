# @voyant-travel/bookings

Bookings module for Voyant. Manages booking lifecycle with travelers, supplier statuses, activity log, and notes. Uses `personId` + `organizationId` from CRM as client snapshot.

## Install

```bash
pnpm add @voyant-travel/bookings
```

## Usage

```typescript
import { bookingsModule } from "@voyant-travel/bookings"
import { createApp } from "@voyant-travel/hono"

const app = createApp({
  modules: [bookingsModule],
  // ...
})
```

## Public public surface flow

Bookings exposes committed-reservation reads:

- `GET /v1/public/bookings/overview`
- `POST /v1/public/bookings/guest-lookup`

Pre-commit construction belongs exclusively to Catalog Booking Session v1.
There is no provisional Booking session or low-level public Booking create API.

## Origin and provenance

Bookings owns durable booking origin records in `booking_origins`. The origin
row is keyed by `booking_id` and can point at accepted Proposal Versions, Trip
snapshots, reservation plans, Catalog price/availability responses, Catalog
booking snapshots, provider/source order refs, and legacy migrated transaction
ids. New booking flows should write this owner path instead of
the retired booking-to-transaction detail join.

## Action-ledger approvals

Agent/workflow booking status mutations that require approval return `202` with
the requested action and approval ids. These approval-required requests must
send `Idempotency-Key`; the key is fingerprinted with the command input and
approval policy inputs, so replaying the key with different input returns a
conflict.

After an approval is approved, execute the same status mutation again with the
`ACTION_LEDGER_APPROVAL_ID_HEADER` header from `@voyant-travel/action-ledger`. The
route validates that the approval is approved, unexpired, linked to the same
requested action and current principal, and command-equivalent to the original
request before it mutates the booking. Approved execution ledger fields are
stamped through `buildActionLedgerApprovedExecutionFields(...)` so execution
entries consistently link back to the requested action and approval.

## Agent Tools

The selected deployment graph exposes package-owned Tools from
`@voyant-travel/bookings/tools`:

- `cancel_booking` always enters the action-ledger approval flow for agent
  callers. Its first call returns a pending approval; execution requires the
  approved id and the same command, principal, target snapshot, and
  idempotency fingerprint. The successful cancellation ledger entry links to
  that requested action and approval, including financial-settlement hooks.
- `@voyant-travel/bookings#extras` owns booking-extra reads and non-destructive
  lifecycle writes plus staff-only departure manifests, traveler selections,
  and collection-state updates. Manifest reads require both `bookings:read` and
  `bookings-pii:read`; high-risk writes require explicit confirmation and are
  ledgered by their selected graph actions.
- `@voyant-travel/bookings#requirements` owns product/option requirement,
  question, choice, trigger, and booking-answer reads and non-destructive
  writes. Booking-answer reads require the explicit booking PII scope.
- `get_public_transport_requirements` is the public-safe requirements summary
  for staff or customer grants. It resolves the selected Inventory runtime port
  instead of importing or selecting a deployment provider directly.

Delete operations remain API-only until a deployment selects a destructive
Tool policy. Every Tool uses the request-scoped database/service contribution;
missing services or runtime ports fail closed.

## Entities

- **Bookings** (`book`)
- **Booking travelers** (`bkps`)
- **Booking origins** (`booking_origins`)
- **Booking supplier statuses** (`bkss`)
- **Booking activity log** (`bkal`)
- **Booking notes** (`bnot`)

## Exports

| Entry | Description |
| --- | --- |
| `.` | Module export + service |
| `./schema` | Drizzle tables |
| `./validation` | Zod schemas |
| `./routes` | Hono routes |
| `./requirements` | Booking requirements service and routes |
| `./tools` | Selected base, extras, and requirements Tool runtime |

## License

Apache-2.0
