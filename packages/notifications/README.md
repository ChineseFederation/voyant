# @voyant-travel/notifications

Notifications owns templates, durable delivery admission and retry state,
delivery history, reminder rules, and notification outbox events.

Every notification mutation is admitted before provider delivery. Admission
requires a stable idempotency key, fingerprints the exact rendered provider
request, and atomically records the delivery, worker operation, and
`notification.send-requested` event. A leased package-owned worker performs the
only provider mutation. Replays return the original delivery; reusing a key with
different input fails.

## Durable providers

This package intentionally ships no local, Cloud-specific, or request-scoped
send adapter. A deployment provider package implements `NotificationProvider`
and exposes a `DurableNotificationProviderRuntime` through the package-owned
`notifications.durable-provider` graph port:

```ts
import { defineProvider, providePort } from "@voyant-travel/core/project"
import {
  durableNotificationProviderPort,
  type DurableNotificationProviderRuntime,
} from "@voyant-travel/notifications/durable-provider-port"

export const emailProvider = defineProvider({
  id: "@example/voyant-email-provider",
  provides: { ports: [providePort(durableNotificationProviderPort)] },
  providers: [
    {
      id: "@example/voyant-email-provider#provider.email",
      port: durableNotificationProviderPort.id,
      selection: { role: "notifications", value: "email" },
      runtime: {
        entry: "@example/voyant-email-provider",
        export: "createEmailNotificationProvider",
      },
    },
  ],
})

export function createEmailNotificationProvider(): DurableNotificationProviderRuntime {
  // Return the selected delivery provider plus an isolated, non-delivering
  // conformance probe backed by the same implementation and backend contract.
  return { providers: [provider], createIsolatedProbe }
}
```

The provider's one `durableDelivery.send(payload, { idempotencyKey })` mutation
must satisfy `notification-provider-idempotency-v1`: the same key and payload
return one canonical result across retries and process restarts, while payload
drift is rejected.

The isolated probe must cover the exact selected provider names and channels.
Package-owned port conformance performs an exact replay, invokes the probe's
`restart()` boundary, requires newly created provider instances, replays again,
verifies `acceptedCount === 1`, and verifies drift rejection without delivering
a real notification.

`@voyant-travel/notifications#action.send-notification` is unavailable by
default. Graph composition makes it available only when the exact selected
provider runtime passes this conformance. A missing or non-conformant provider
fails closed.

## Agent sends

The `send_notification` Tool accepts a vetted active template and returns the
immutable pending delivery snapshot. It never calls provider code in the
request. Poll `get_notification_delivery` to observe the later `sent` or
`failed` state.

Approval and audit target the template slug. The action ledger's approved
command fingerprint binds the recipient and every other argument, while the
Notifications operation binds the fully rendered provider request and its
stable provider delivery key.

## Domain sends

Finance, Quotes, booking-document, and reminder flows call narrow package ports.
Their sends also require idempotency and use the same durable admission and
worker protocol. The admin API retains domain routes such as:

- `POST /payment-sessions/:id/send`
- `POST /invoices/:id/send`
- `POST /bookings/:id/send-documents`
- `POST /deliveries/:id/resend`

These routes enqueue durable work; there is no generic direct-send route and no
exported notification dispatcher or transport service.

## Exports

| Entry | Description |
| --- | --- |
| `.` | Module factories, schema, validation, and durable provider contracts |
| `./durable-provider-port` | Selected provider runtime and conformance port |
| `./runtime-port` | Deployment-owned Notifications host services |
| `./schema` | Drizzle tables and module declaration |
| `./validation` | Template, delivery, and reminder schemas |
| `./routes` | Admin API route factory |
| `./tasks` | Reminder task helpers |
| `./reminder-job` | Durable send and reminder worker |
| `./tools` | MCP Tool runtime |
| `./voyant` | Import-cheap deployment manifest |

## License

Apache-2.0
