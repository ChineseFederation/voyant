# @voyant-travel/realtime

Provider-agnostic realtime channels for Voyant deployments. Push live updates to
admin and customer-facing UIs instead of polling — without coupling the
framework to any single transport vendor.

Implements [RFC #1695](https://github.com/voyant-travel/voyant/issues/1695).

## What's in the box

- **`RealtimeProvider`** — the transport interface. Voyant Cloud is one
  implementation; any pub/sub backend (Ably, Pusher, Centrifugo, a self-hosted
  WebSocket/SSE service, …) can satisfy it.
- **EventBus bridge** (`createRealtimeBridge`) — deferred, outbox-safe
  subscribers that fan domain events out to channels as **invalidation hints**.
- **Token-mint route** (`createRealtimeRoutes`) — issues short-lived,
  capability-scoped client tokens from the caller's session. Browsers never see
  API keys.
- **`createRealtimeApiModule`** — wires all of the above into a `ApiModule`.

The module owns no schema and is **fully optional**: with no provider
configured, the token route returns `503` and no subscribers register.

## The provider interface (bring your own vendor)

```ts
interface RealtimeProvider {
  readonly name: string
  publish(channel: string, message: { event: string; data: unknown }): Promise<void>
  mintClientToken(input: {
    clientId: string
    capabilities: Record<string, ReadonlyArray<"subscribe" | "publish" | "presence">>
    ttlSeconds?: number
  }): Promise<{ token: string; expiresAt: string }>
}
```

Built-in implementations:

| Factory | Backend | Use |
| --- | --- | --- |
| `createLocalRealtimeProvider()` | in-memory | dev, tests, reference impl |
| `createVoyantCloudRealtimeProvider({ client })` | Voyant Cloud | default cloud transport |

### Implementing your own adapter

`mintClientToken` is the abstraction line: every vendor mints tokens
differently (Ably `TokenRequest`, Pusher auth signature, a self-hosted JWT), but
the token-mint route never knows the vendor.

```ts
import type { RealtimeProvider } from "@voyant-travel/realtime/types"

export function createMyVendorProvider(opts: MyVendorOptions): RealtimeProvider {
  const client = new MyVendorSdk(opts)
  return {
    name: "my-vendor",
    async publish(channel, message) {
      await client.trigger(channel, message.event, message.data)
    },
    async mintClientToken({ clientId, capabilities, ttlSeconds }) {
      const { token, exp } = await client.signToken({ clientId, capabilities, ttlSeconds })
      return { token, expiresAt: new Date(exp * 1000).toISOString() }
    },
  }
}
```

Pass it to `createRealtimeApiModule({ providers: [createMyVendorProvider(...)] })`
and the deployment is live on your backend — no framework changes.

## Wiring it into an app

```ts
import { createRealtimeApiModule } from "@voyant-travel/realtime"
import { createVoyantCloudRealtimeProvider } from "@voyant-travel/realtime/providers/voyant-cloud"

const realtime = createRealtimeApiModule({
  // Resolve the provider from runtime bindings (e.g. a Cloud client from env).
  resolveProviders: (bindings) => [
    createVoyantCloudRealtimeProvider({ client: getCloudClient(bindings) }),
  ],

  // Fan domain events out to channels. Payload is an invalidation hint.
  bridgeRoutes: {
    "booking.confirmed": (e) => ["admin", `booking:${e.bookingId}`],
    "availability.slot.changed": (e) => ({
      channels: ["admin", `product:${e.productId}`],
      hint: { entity: "availability", id: e.productId },
    }),
  },

  // Let portal customers subscribe to the bookings they own.
  resolvePortalScope: async (c) => {
    const personId = await lookupPersonId(c.get("db"), c.get("userId"))
    if (!personId) return null
    return { personId, bookingIds: await ownedBookingIds(c.get("db"), personId) }
  },
})

// Register `realtime` like any other ApiModule. The token route mounts at
// POST /v1/admin/realtime/token and POST /v1/public/realtime/token.
```

## Why invalidation hints, not entities

The bridge's default payload is `{ event, entity, id }`, not the changed record.
The React layer reacts by invalidating matching React Query keys and refetching
over the existing authenticated HTTP path. This keeps HTTP the source of truth,
makes at-most-once delivery acceptable (a missed hint self-heals on the next
refetch/`staleTime` tick), and avoids leaking entity data through channel
capabilities.

Bridge subscribers are **deferred** (`inline: false`) — they run after the HTTP
response via the runtime scheduler (`executionCtx.waitUntil` on Workers) and
never block the emitting transaction. Publish failures are swallowed (routed to
`onPublishError`), because a dropped hint is self-healing.

> **Stronger guarantees?** If a channel ever needs at-least-once delivery, the
> codebase's durable channel-push pattern (write an intent row in a deferred
> subscriber → drain via a workflow) is the upgrade path. This module ships the
> at-most-once tier by design.

## Channel conventions

| Channel | Audience | Capability granted by |
| --- | --- | --- |
| `admin` | all admin users of the deployment | admin session |
| `booking:{bookingId}` | admins; the booking's customer | session + ownership |
| `portal:customer:{personId}` | that customer in the portal | portal session |
| `notifications:user:{userId}` | a specific staff user | admin session |

See `@voyant-travel/realtime-react` for the `useChannel` / `usePresence` /
`useLiveQueries` hooks that consume these channels.
