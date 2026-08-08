# @voyant-travel/storefront

Public storefront routes and service helpers for checkout-adjacent product, departure,
offer, and eligibility flows.

## Shopping gateway

`@voyant-travel/storefront/shopping` is the provider-first boundary for a
theme or same-origin storefront BFF. It keeps three different kinds of work
explicit instead of pretending they share one ranking or cursor:

- grouped indexed inspiration for tours, excursions, experiences/activities,
  stays, cruises, and charters; each group owns its result count and cursor;
- discriminated live flight, stay, and flight-plus-stay package searches with
  aggregate partial-provider coverage;
- a separate, stateful Trip-selection seam with opaque references and
  compare-and-swap revisions.

Every browser object is strict. A browser may request only `marketId`, `locale`,
and `currency`; it cannot choose a tenant, organization, storefront, channel,
engine, provider, connection, or source. The host supplies trusted
`storefrontId` and `channelId` context, resolves the request against active
market configuration, and may attach Voyant-managed `userId` and
`buyerAccountId` ownership for a signed-in journey. Those identity values are
nullable/absent for anonymous capability-owned journeys and are never accepted
from the browser body. The runtime returns the selected scope plus the available
values for pickers.

Search prices carry both their supplier-native amount and their one selected
presentation-currency amount. A currency conversion must include the server's
FX authority, rate, and quote time. Themes format these values but never
calculate exchange rates.

Deployments may bind `storefront.shopping.runtime` and
`storefront.trip-selections.runtime`. Both graph ports are optional so an
operator without a provider continues to boot; attempts to use an unbound
capability fail explicitly. Provider implementations keep connection and
supplier identifiers behind the runtime boundary and return only opaque
`offerRef`, `itemRef`, and `selectionRef` capabilities.

## Customer auth client

`@voyant-travel/storefront/customer-auth-client` is the framework-neutral
customer realm client for browser, Next.js, and Astro BFF integrations. It
models configuration, session and buyer-account selection plus open creation,
request/cancel, and business invitation acceptance. Response-preserving
variants are provided for mutations that can rotate cookies so SSR adapters can
forward every `Set-Cookie` header independently.

Storefront customer auth is Better Auth-backed in managed and self-hosted
deployments. WorkOS applies only to managed admin authentication and is not a
customer dependency. See the
[Next.js and Astro integration guide](../../docs/storefront-customer-auth-frameworks.md)
for same-origin proxy and policy examples.

## MCP Tools

`@voyant-travel/storefront/tools` publishes graph-selected, provider-neutral Tools for the
customer portal, payment links, and account verification. Customer self-service capabilities
derive the customer identity and verification destination from the authenticated grant; their
inputs cannot select another user, destination, or verification purpose. Payment-link creation
derives amount and currency from the invoice and requires an idempotency key.

Customer-portal reads and writes retain the same ownership checks, document encryption runtime,
and claim-conflict protections as the public routes. Verification sends retain the route rate
limits and configured notification providers. Sensitive reads and all writes are action-ledger
bound; verification sends and payment-link creation are confirmation-gated.

## Composite Price Preview

`POST /departures/:departureId/price` preserves the original quote fields
(`basePrice`, `taxAmount`, `total`, `notes`, and `lineItems`) and now also
returns the context needed to render a checkout price card in one request:

- `allocation` describes the resolved public departure slot, capacity state,
  requested traveler mix, requested units, and selected rooms.
- `units` and `rooms` expose customer-facing pricing rows for per-person,
  per-unit, or room-based products.
- `extras` lists active product extensions with selection/applicability,
  quantity, unit price, and price impact.
- `offers` lists applicable public offers, selected/applied discounts,
  requested manual offer/code results, and conflict policy.
- `totals` carries base, extras, subtotal, discount, tax, final total,
  per-person, and per-booking amounts in the selected currency.

Request bodies remain compatible with simple price preview calls:

```json
{
  "pax": { "adults": 2, "children": 0, "infants": 0 },
  "rooms": [{ "unitId": "ount_room", "occupancy": 2, "quantity": 1 }],
  "extras": [{ "extraId": "pext_transfer", "quantity": 1 }],
  "offers": [{ "slug": "early-booking" }],
  "offerCode": "SPRING25",
  "locale": "en",
  "market": "default"
}
```

Offer resolution is optional and host-owned. Wire the storefront module with
`offers` or `resolveOffers` resolvers to populate offer applicability and manual
offer/code impacts. Without resolvers, the route still returns allocation,
units, rooms, extras, and final totals with an empty `offers` block.

## Public Intake

Storefront can accept public CRM intake at the public root:

- `POST /leads`
- `POST /newsletter/subscribe`

When mounted through `createStorefrontApiModule`, these become
`/v1/public/leads` and `/v1/public/newsletter/subscribe`.

Both routes create a CRM person and a CRM customer signal. Lead intake accepts
the CRM signal `kind`, `source`, product/option references, bounded payload
metadata, and consent metadata. Newsletter intake records a `notify` signal and
uses `sourceSubmissionId` for idempotency; when omitted, the email address is
used to derive a stable newsletter submission key.

```ts
import { createStorefrontApiModule } from "@voyant-travel/storefront"

createStorefrontApiModule({
  intake: {
    guard({ body, context }) {
      // Install host-owned rate-limit, captcha, signature, or abuse checks.
      if (!isCaptchaValid(body, context)) {
        return { allowed: false, status: 429, error: "Captcha required" }
      }
    },
    async requestNewsletterDoubleOptIn({ email, signalId }) {
      await sendDoubleOptInEmail(email, { signalId })
    },
  },
})
```

Accepted intake emits `customer.signal.created` on the app event bus with
`metadata.category: "domain"` and an `intake` payload describing whether the
signal came from `lead` or `newsletter` intake. Notification adapters can
subscribe to that event to send CRM email, Slack, or other operator alerts.

## Verification

Storefront owns public email and SMS verification challenges for customer-facing
checkout and account flows.

```ts
import { createStorefrontVerificationApiModule } from "@voyant-travel/storefront/verification"

const storefrontVerification = createStorefrontVerificationApiModule({
  resolveProviders: (bindings) => [
    // return notification-compatible providers for email and/or sms
  ],
  email: {
    subject: "Your verification code",
  },
})
```

Mount the returned module in the same app that exposes the public route:

```ts
createApp({
  publicPaths: ["/v1/public/storefront-verification"],
  modules: [storefrontVerification],
})
```

The route module serves:

- `POST /v1/public/storefront-verification/email/start`
- `POST /v1/public/storefront-verification/email/confirm`
- `POST /v1/public/storefront-verification/sms/start`
- `POST /v1/public/storefront-verification/sms/confirm`

The verification schema lives at
`@voyant-travel/storefront/verification/schema` and stores challenge rows in
`storefront_verification_challenges`. Apps that maintain an explicit Drizzle
schema array must include:

```ts
export default defineConfig({
  schema: [
    "../../packages/db/src/schema/index.ts",
    "../../packages/storefront/src/verification/schema.ts",
  ],
})
```

For package-based tooling, `@voyant-travel/storefront` declares its schema as
`./verification/schema` with `@voyant-travel/db` as the required base schema.

## Guest Booking Lookup

Use the bookings public guest lookup endpoint before rendering booking overview
or payment pages for guests:

- `POST /v1/public/bookings/guest-lookup` with `bookingCode` and `email`
- `GET /v1/public/bookings/overview?bookingCode=...` with the issued guest
  access cookie or `X-Voyant-Guest-Booking-Access` header

The lookup endpoint verifies the email against booking participants, issues a
short-lived `voyant_guest_booking` HttpOnly cookie, and returns the same scoped
token for non-browser clients. When composition injects a rate-limit store,
lookups are throttled per client IP and booking code.

```ts
import { createGuestBookingGuard } from "@voyant-travel/storefront"

const guestBooking = createGuestBookingGuard()

if (!guestBooking.hasAccess(request)) {
  return fetch(guestBooking.lookupPath, guestBooking.createLookupRequest({
    bookingCode: form.bookingCode,
    email: form.email,
  }))
}

return fetch(guestBooking.overviewUrl(form.bookingCode), {
  headers: { Cookie: request.headers.get("Cookie") ?? "" },
})
```

## Transport Eligibility

Storefronts can check whether traveler document facts satisfy departure-level
transport rules before checkout confirmation.

```ts
import { createStorefrontPublicRoutes } from "@voyant-travel/storefront"

createStorefrontPublicRoutes({
  transportEligibilityRules: [
    {
      id: "egypt-passport-validity",
      label: "Egypt passport validity",
      productId: "prod_123",
      destinationCountries: ["EG"],
      nationalityCountries: ["RO"],
      requiredDocumentType: "passport",
      minValidityDaysAfterReturn: 180,
      visaRequired: true,
    },
  ],
})
```

Schemas and the standalone evaluator are exported from
`@voyant-travel/storefront/transport-eligibility`.

The public API is available at:

- `POST /departures/:departureId/eligibility`
- `POST /products/:productId/departures/:departureId/eligibility`

Request bodies contain only eligibility facts:

```json
{
  "travelStartsOn": "2026-08-01",
  "travelEndsOn": "2026-08-08",
  "travelers": [
    {
      "travelerRef": "traveler_1",
      "nationalityCountry": "RO",
      "dateOfBirth": "1990-01-01",
      "documents": [
        {
          "type": "passport",
          "issuingCountry": "RO",
          "expiresOn": "2027-03-01"
        }
      ],
      "hasVisa": true
    }
  ]
}
```

Responses return a top-level `eligible` flag plus traveler-specific blocking
issues and warnings. Supported rule dimensions are product, departure,
destination country, nationality country, required document type, minimum
validity after return, age range, visa requirement, minor consent requirement,
and warning/blocking severity.

Do not send or store raw passport numbers through this surface. The route and
schemas only model document type, issuing country, expiry date, nationality,
birth date, and boolean evidence such as `hasVisa`.

This first slice is API-only. Admin CRUD and operator UI for managing transport
rules should persist normalized rule objects and can call the same public
eligibility service once added.
