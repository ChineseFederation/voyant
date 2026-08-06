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

Finance, Proposals, booking-document, and reminder flows call narrow package ports.
The Proposals adapter is contributed only when `notifications.durable-provider` is
actually selected, and it closes over that exact provider set. It never
re-resolves delivery providers from host configuration.
Their sends also require idempotency and use the same durable admission and
worker protocol. The admin API retains domain routes such as:

- `POST /payment-sessions/:id/send`
- `POST /invoices/:id/send`
- `POST /bookings/:id/send-documents`
- `POST /deliveries/:id/resend`

These routes enqueue durable work; there is no generic direct-send route and no
exported notification dispatcher or transport service.

## Staff alerts

Everything above mails the **customer**. Staff alerts mail the **operator's own
team** when something happens they need to act on. The two share domain events
but never a recipient, and they subscribe independently.

The split that matters is template ownership. Customer templates are content:
Liquid in `notification_templates`, editable in the admin. Staff templates are
product surface: React Email components under `./emails`, not editable, because
an operator editing one would break the layout without gaining anything they
wanted.

Two preference layers decide who hears about what. `staff_alert_settings` is
admin-owned — one row per alert, carrying whether it fires and how it routes.
`staff_alert_preferences` is per staff user. **Absence of a preference row means
inherit, never off**; building the recipient list from opt-INS instead would
send to nobody, because a user who has never opened the preferences page has no
row.

### Why the data comes from outside this package

Every declared domain event is id-shaped. `booking.confirmed` carries
`{bookingId, bookingNumber, actorId}`; `customer.signal.created` carries
`{id, personId, kind, source, status}`. Neither renders an email worth reading.

This package cannot fetch the rest. `verify:table-privacy` records
`notifications->bookings` and `notifications->finance` as pairs that may shrink
but never grow, and there is no `notifications->relationships` pair at all.
ADR-0016 decision 7 rules out a port for business modules. So the deployment
registers a `StaffAlertContextResolver` per event, calling the owning module's
service, plus a brand resolver — `operator_profile` belongs to
`operator-settings`, so reading it here would open another pair.

### Assignee routing works for one alert

`customer_signals.assigned_to_user_id` is the only real staff-assignment column
in the product. `booking_staff_assignments` looks like a match and is not one:
it holds tour guides and service assignees (first/last name, CRM `person_id`),
not staff logins. A booking's only staff identity is the event's `actorId`,
which is *who just did it* — mailing them says nothing they do not know.

So booking and finance alerts route by role and explicit address only, and
`supportsAssigneeRouting` is false for them so the settings UI can hide a
control that would do nothing. Finer routing needs a booking owner column to
exist first.

### Role routing is coarse on local deployments

Local staff carry a scope set on `user_profiles.permissions` and nothing else —
the Better Auth `member` table is empty because the operator realm has no
organization. Local users therefore resolve to two levels: unrestricted scopes
read as `admin`, anything else as `member`. Voyant Cloud deployments match
`cloud_auth_user_links.role_slug` exactly. Both realms are queried and unioned,
so no auth-mode flag has to be threaded down.

## Exports

| Entry | Description |
| --- | --- |
| `.` | Module factories, schema, validation, and durable provider contracts |
| `./emails` | React Email staff alert templates and brand helpers |
| `./staff-alert-subscriber` | Staff alert subscriber descriptors |
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
