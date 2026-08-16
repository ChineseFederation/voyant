# @voyant-travel/flights-react

The flights client tier: headless data hooks/clients plus the styled UI
components and page compositions (formerly `@voyant-travel/flights-ui`).

Headless consumers (public surfaces, portals) import from the root, `./hooks`,
`./client`, or `./query-keys` — these pull no styling peers. Styled surfaces
live under `./ui`, `./components/*`, `./i18n`, and `./styles.css`, whose
heavier peers (`@voyant-travel/ui`, `@voyant-travel/relationships-react`, `@voyant-travel/finance-react/checkout-ui`,
`@tanstack/react-table`) are optional and only needed when you import those
subpaths.

## Install

```bash
pnpm add @voyant-travel/flights-react @voyant-travel/flights @voyant-travel/relationships-react @voyant-travel/ui @tanstack/react-query react react-dom
```

`@voyant-travel/ui` provides the design-system primitives. The root and `./hooks`
subpaths provide the data-layer hooks. CRM-backed contact and billing pickers
use `@voyant-travel/relationships-react`.

## Pages

`FlightsPage` renders the search, filter, per-leg round-trip picker, offer
detail sheet, and booking handoff. The route owns URL validation and navigation:

```tsx
import { FlightsPage } from "@voyant-travel/flights-react/ui"

<FlightsPage
  search={search}
  onSearchChange={(next, options) => updateRouteSearch(next, options)}
  onBookOffer={({ outboundOfferId, returnOfferId, passengers, cabin }) =>
    goToBooking({ outboundOfferId, returnOfferId, passengers, cabin })
  }
/>
```

`FlightBookingPage` renders the repricing, ancillaries, seat-map, passenger,
billing, payment, and confirmation flow around `FlightBookingShell`. The route
or app supplies booking and navigation callbacks:

```tsx
import { FlightBookingPage } from "@voyant-travel/flights-react/ui"

<FlightBookingPage
  outboundOfferId={offerId}
  returnOfferId={returnOfferId}
  passengers={{ adults: 1, children: 0, infants: 0 }}
  paymentCapabilities={{ chargeSavedCard: false, newCard: false }}
  onBackToSearch={() => navigateToFlights()}
  onBook={(request) => bookFlight(request)}
  onBooked={(order) => navigateToBooking(order.orderId)}
/>
```

Router behavior, booking submission, payment capabilities, billing-default
persistence, and contact creation are callbacks or slots so applications keep
deployment-specific ownership.

## I18n

Components render English by default. To localize them, wrap your UI in
`FlightsUiMessagesProvider` and import only the locales your app supports.

```tsx
import { FlightsUiMessagesProvider } from "@voyant-travel/flights-react/ui"
import { flightsUiEn } from "@voyant-travel/flights-react/i18n/en"
import { flightsUiRo } from "@voyant-travel/flights-react/i18n/ro"
```

English-only apps should import only `./i18n/en`. Bilingual apps can import
`./i18n/en` and `./i18n/ro`.
