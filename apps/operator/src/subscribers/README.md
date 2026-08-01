# Event subscribers

Put bounded application-local event subscribers in `src/subscribers/**/*.ts`.
Each file default-exports a descriptor with literal `id` and `eventType` fields
and a `register` function.

```ts
import type { SubscriberRuntimeDescriptor } from "@voyant-travel/core"

export default {
  id: "loyalty.credit-booking-points",
  eventType: "booking.confirmed",
  register({ eventBus }) {
    eventBus.subscribe("booking.confirmed", async () => {
      // Perform bounded work or record durable intent for a package-owned job.
    })
  },
} satisfies SubscriberRuntimeDescriptor
```

Subscribers must not implement unbounded retries or process-resident queues.
Customer-specific automation should consume Voyant events externally and call
authenticated domain APIs.

The compiler emits `.voyant/runtime/project-subscribers.generated.ts`; do not
register descriptors by side effect at startup.
