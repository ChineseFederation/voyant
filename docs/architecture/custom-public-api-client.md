# Custom Public API SDK Architecture

Voyant custom public surfaces consume booking behavior through the framework-agnostic
`@voyant-travel/public-api-client` package. They do not assemble a checkout from
package-internal routes or create provisional Booking records.

## Decision

`bookingSessionsV1` is the sole supported construction API. A Booking Session is
the pre-commit aggregate; a Booking is created only when Session Commit succeeds.

A browser-resident public surface uses a **publishable** (`vpk_`) key, which reaches
the Booking Session flow because the session's own capability, revision and
idempotency key are the authority — not the key. Anything outside the declared
publishable set needs a **secret** (`vsk_`) key from a server you control. See
[`public-api-key-capability-line.md`](./public-api-key-capability-line.md).

The SDK wraps public contracts from:

- `@voyant-travel/catalog-contracts` for Booking Session v1
- `@voyant-travel/public-api` for public discovery, availability, and price preview
- `@voyant-travel/bookings` for committed Booking overview lookup
- `@voyant-travel/finance` for post-commit collection operations

The SDK owns no routes, persistence, or lifecycle effects. React integrations
belong in `@voyant-travel/public-api-react` or a consumer application.

## Construction Flow

```ts
const voyant = createVoyantPublicApiClient({ baseUrl })
const capability = createBookingSessionCapabilityV1()

const created = await voyant.bookingSessionsV1.create(
  {
    idempotencyKey: `${journeyKey}:create`,
    target: { entityModule: "products", entityId: productId },
  },
  { capability },
)

if (created.kind !== "session_created") throw new Error(created.kind)

const quoted = await voyant.bookingSessionsV1.quote(
  created.session.id,
  {
    expectedRevision: created.session.revision,
    idempotencyKey: `${journeyKey}:quote`,
  },
  { capability },
)
```

Clients retain the anonymous capability and send it on every later request.
Authenticated users may adopt an anonymous Session. Mutations use an expected
revision and an idempotency key so retries are deterministic.

The route family is:

| Operation | SDK method | Public route |
| --- | --- | --- |
| Create | `bookingSessionsV1.create` | `POST /v1/public/catalog/booking-sessions` |
| Resume | `bookingSessionsV1.resume` | `GET /v1/public/catalog/booking-sessions/:id` |
| Adopt | `bookingSessionsV1.adopt` | `POST /v1/public/catalog/booking-sessions/:id/adopt` |
| Renew | `bookingSessionsV1.renew` | `POST /v1/public/catalog/booking-sessions/:id/renew` |
| Update selection and traveler state | `bookingSessionsV1.update` | `PATCH /v1/public/catalog/booking-sessions/:id` |
| Quote | `bookingSessionsV1.quote` | `POST /v1/public/catalog/booking-sessions/:id/quote` |
| Hold | `bookingSessionsV1.hold` | `POST /v1/public/catalog/booking-sessions/:id/hold` |
| Commit | `bookingSessionsV1.commit` | `POST /v1/public/catalog/booking-sessions/:id/commit` |
| Abandon | `bookingSessionsV1.abandon` | `POST /v1/public/catalog/booking-sessions/:id/abandon` |

`commit` is the only transition that may create a Booking. Payment, inventory,
supplier, and fulfillment state stays on the aggregate that owns it; public surfaces
branch on the typed Session outcome rather than a synthetic client lifecycle.

After commit, `booking.getOverview` reads the committed Booking. Checkout
collection methods operate on that Booking and never serve as an alternative
construction path.

## Price Preview

Use `previewPublicApiDeparturePrice(...)` for discovery-time price cards. A
Booking Session Quote remains authoritative for commit. Public surfaces must not
copy price-preview results into low-level Booking create payloads.

## Errors

`VoyantPublicApiError` exposes `normalizedError` for structured public-route
failures. Booking Session operations additionally return the discriminated v1
outcome contract, including revision conflicts, unavailable inventory, expired
Sessions, payment requirements, and commit results.

## Rules

1. Keep public routes capability-based under their owning module.
2. Do not put booking, payment, legal, supplier, or notification effects in the SDK.
3. Do not add a second Booking construction facade or raw create operation.
4. Do not persist UI-only progress in the committed Booking aggregate.
5. Add backend behavior to the owning v1 contract before exposing an SDK method.

## Non-Goals

The SDK is not a hosted public surface, UI component library, persistence layer, or
replacement for module-owned public contracts.
