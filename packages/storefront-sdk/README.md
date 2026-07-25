# `@voyant-travel/storefront-sdk`

Framework-agnostic TypeScript client for custom Voyant storefronts.

The SDK does not own HTTP routes. It wraps the existing public contracts from
`@voyant-travel/storefront`, `@voyant-travel/bookings`, and `@voyant-travel/finance` behind a
single typed client so custom booking UIs can consume Voyant booking logic
without stitching together package-local fetchers.

```ts
import { createVoyantStorefrontClient } from "@voyant-travel/storefront-sdk"

const voyant = createVoyantStorefrontClient({
  baseUrl: "https://operator.example.com",
})

const session = await voyant.booking.getSession("booking_session_123")

const state = voyant.booking.deriveState(session)
```

For custom booking engines, prefer the `bookingEngine` facade. It keeps the
route-shaped public booking and checkout calls behind flow-oriented methods and
returns a canonical engine snapshot alongside session reads and mutations.

```ts
const booking = await voyant.bookingEngine.getSnapshot("booking_session_123")

if (voyant.bookingEngine.canRunAction(booking.engine.state, "start_payment")) {
  await voyant.bookingEngine.startPayment(booking.session.sessionId, {
    method: "card",
  })
}
```

React consumers should layer React Query hooks on top of this package rather
than reimplementing request paths directly.
