# `@voyant-travel/storefront-sdk`

Framework-agnostic TypeScript client for custom Voyant storefronts.

Booking construction uses the Catalog-owned Booking Session v1 aggregate. A
client creates or resumes a Session, updates its state, quotes, holds, and then
commits. Commit is the only operation that may create a Booking.

```ts
import {
  createBookingSessionCapabilityV1,
  createVoyantStorefrontClient,
} from "@voyant-travel/storefront-sdk"

const voyant = createVoyantStorefrontClient({ baseUrl })
const capability = createBookingSessionCapabilityV1()

const created = await voyant.bookingSessionsV1.create(
  {
    idempotencyKey: `${journeyKey}:create`,
    target: { entityModule: "products", entityId: productId },
  },
  { capability },
)

if (created.kind === "session_created") {
  await voyant.bookingSessionsV1.quote(
    created.session.id,
    {
      expectedRevision: created.session.revision,
      idempotencyKey: `${journeyKey}:quote`,
    },
    { capability },
  )
}
```

The SDK does not own HTTP routes or business state. React consumers should
layer their hooks on this package instead of reimplementing request paths.
