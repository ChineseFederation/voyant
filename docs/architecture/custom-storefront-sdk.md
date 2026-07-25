# Custom Storefront SDK Architecture

Voyant custom storefronts should consume booking-engine behavior through a
framework-agnostic TypeScript SDK instead of stitching together package-specific
fetch helpers.

## Decision

`@voyant-travel/storefront-sdk` is the supported integration surface for custom
storefront booking UIs.

The SDK wraps existing public contracts from:

- `@voyant-travel/storefront` for public settings, departures, itinerary, offers,
  extensions, availability, and price preview
- `@voyant-travel/bookings` for public booking sessions, wizard state, repricing,
  confirmation, expiration, and overview lookup
- `@voyant-travel/finance/checkout` for public checkout collection preview/initiation and
  collection bootstrap

The SDK does not own routes, persistence, or lifecycle side effects. It is a
typed client facade over the public route contracts those modules already own.

## Layering

Use this stack for custom booking UIs:

1. Public Hono route modules expose `/v1/public/*` capability contracts.
2. `@voyant-travel/storefront-sdk` provides framework-agnostic TypeScript operations
   and a first-class `bookingEngine` facade.
3. `@voyant-travel/storefront-react` provides React Query hooks on top of the SDK.
4. Registry UI blocks and app/starter storefronts provide presentation.

Custom UIs may skip layer 3 when they are not React applications.

## State Model

The SDK exports a customer-facing booking-engine state vocabulary:

- `draft`
- `reserved`
- `billing_completed`
- `travelers_completed`
- `terms_accepted`
- `ready_for_payment`
- `payment_started`
- `payment_pending`
- `confirmed`
- `completed`
- `expired`
- `cancelled`

These states are derived from existing public booking-session snapshots:

- `bookings.status`
- `booking_session_states.completedSteps`
- `booking_session_states.currentStep`
- public session checklist readiness

The state model is intentionally derived rather than persisted. The canonical
backend lifecycle remains the `bookings` status model plus public session state.

## Booking Engine Facade

Custom booking UIs should start from `createVoyantStorefrontClient(...)` and use
the `bookingEngine` property for customer checkout flow code:

```ts
const voyant = createVoyantStorefrontClient({ baseUrl })
const booking = await voyant.bookingEngine.reserve(input)

await voyant.bookingEngine.updateTravelers(booking.session.sessionId, {
  travelers,
})

await voyant.bookingEngine.updateProgress(booking.session.sessionId, {
  currentStep: "terms",
  completedSteps: ["billing", "travelers"],
})

const repriced = await voyant.bookingEngine.reprice(booking.session.sessionId, {
  applyToSession: true,
  selections,
})

const payableSession = repriced.session
if (payableSession?.engine.state === "ready_for_payment") {
  await voyant.bookingEngine.startPayment(payableSession.session.sessionId, {
    method: "card",
  })
}
```

The facade deliberately returns a `{ session, engine }` snapshot for session
reads and mutations. `session` is the public booking-session DTO. `engine` is
the canonical derived state, current step, hold expiry, checklist readiness, and
allowed actions. This lets a custom UI branch on one stable object without
persisting another backend lifecycle field.

The public route family behind the facade remains:

| Flow step | SDK method | Public route |
| --- | --- | --- |
| Resume session | `bookingEngine.getSnapshot` | `GET /v1/public/bookings/sessions/:sessionId` |
| Update travelers/session data | `bookingEngine.updateTravelers`, `bookingEngine.updateSession` | `PATCH /v1/public/bookings/sessions/:sessionId` |
| Persist UI progress | `bookingEngine.updateProgress` | `PUT /v1/public/bookings/sessions/:sessionId/state` |
| Quote or reprice | `bookingEngine.reprice` | `POST /v1/public/bookings/sessions/:sessionId/reprice` |
| Start checkout collection | `bookingEngine.startPayment` | `POST /v1/public/finance/checkout/bookings/:bookingId/initiate-collection` |
| Resume redirect/bootstrap | `bookingEngine.bootstrapPayment` | `POST /v1/public/finance/checkout/collections/bootstrap` |
| Finalize booking | `bookingEngine.confirm` | `POST /v1/public/bookings/sessions/:sessionId/confirm` |
| Expire abandoned hold | `bookingEngine.expire` | `POST /v1/public/bookings/sessions/:sessionId/expire` |
| Success summary | `bookingEngine.getOverview` | `GET /v1/public/bookings/overview` |

Custom storefronts must create bookings through the admitted Finance command.
The SDK intentionally exposes only read/update/reprice/finalize operations for
an existing authorized session; it has no raw reserve or bootstrap fallback.

## Price Preview Contract

Custom storefronts should use `previewStorefrontDeparturePrice(...)` for the
checkout price card instead of stitching separate departure, availability,
extension, and offer reads together. The operation calls
`POST /v1/public/departures/:departureId/price` and returns:

- legacy quote fields for existing consumers: `basePrice`, `taxAmount`,
  `total`, `notes`, and `lineItems`
- `allocation` with the resolved public slot and requested pax/unit/room
  context
- `units`, `rooms`, and `extras` rows with currency, quantity, unit price, and
  total impact
- `offers` with applicable public offers, selected discounts, requested
  manual offer/code results, and conflict policy
- `totals` with base, extras, subtotal, discount, tax, final total, per-person,
  and per-booking amounts

Offer data is populated only when the host app wires storefront offer resolvers.
The SDK treats the composite response as the stable public contract and does not
read module tables directly.

## Errors

`VoyantStorefrontApiError` exposes `normalizedError` when a public route returns
a structured error envelope. Custom booking engines should prefer this field
over parsing raw response bodies.

The booking-engine error vocabulary is exported from
`@voyant-travel/storefront-sdk/errors`:

- `contract_template_missing`
- `reservation_expired`
- `departure_unavailable`
- `invalid_traveler_payload`
- `payment_provider_unavailable`
- `payment_url_missing`
- `payment_webhook_pending`
- `checkout_finalization_failed`

Structured errors use:

```ts
{
  code: "payment_webhook_pending",
  message: "Payment webhook has not finalized the booking yet.",
  recoverable: true,
  nextAction: "poll_payment_status",
}
```

## Rules

1. Do not introduce a `/v1/public/storefront/*` namespace for SDK needs. Keep
   public routes capability-based.
2. Do not move booking, checkout, finance, legal, or notification side effects
   into the SDK. The SDK calls public contracts; modules own behavior.
3. Do not make React a dependency of the SDK. React hooks belong in
   `@voyant-travel/storefront-react`.
4. Add new SDK methods only when they wrap a stable public contract or a stable
   derived client-side helper.
5. When a custom UI needs a new backend behavior, add the public route contract
   to the owning module first, then expose it through the SDK.

## Non-Goals

The SDK is not:

- a complete hosted storefront
- a UI component package
- a backend orchestration engine
- a replacement for module-owned public route contracts
