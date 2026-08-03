# @voyant-travel/bookings-react

The bookings client tier: headless data hooks/clients plus the styled UI
components and page-level compositions (formerly `@voyant-travel/bookings-ui`).

Headless consumers (storefronts, portals) import from the root, `./hooks`,
`./client`, or `./query-keys` — these pull no styling peers. Styled surfaces
live under `./ui`, `./components/*`, `./journey`, `./storefront`, `./admin`, `./i18n`, and
`./styles.css`, whose heavier peers (`@voyant-travel/ui`, `@voyant-travel/admin`,
`@tanstack/react-table`, `lucide-react`, the other modules' `*-react`/`*-ui`
packages) are optional and only needed when you import those subpaths.

`@voyant-travel/bookings-react` provides React Query hooks and provider utilities for Voyant bookings.

It includes public booking-session helpers alongside the admin hooks:


Those helpers target existing public booking sessions for customer-portal
state and room-selection repricing. They do not create bookings.

The `./journey` subpath retains composable booking-draft sections for trip and
staff Booking Session composition. The retired routed admin/storefront creation
shell is not part of the public API. The `./storefront` subpath retains only
contract-variable mapping for customer documents.

## UI components

Importable React UI components for Voyant bookings. Bundler-consumed (Vite, Next.js, webpack, etc.).

### Install

```bash
pnpm add @voyant-travel/bookings-react @voyant-travel/ui @tanstack/react-query react react-dom
```

`@voyant-travel/ui` provides the design-system primitives; the data-layer hooks ship
from this package's root and `./hooks` subpaths.

All components accept a `className` prop and merge it with `cn()`. Wrap or compose to extend; use the registry copy-paste path (`npx shadcn add @voyant/...`) for components you want to fork outright.

Page components render with `p-6` outer padding by default and are intended to
mount directly into an app route outlet. Pass `className` to extend or override
that spacing when a shell owns the page chrome.

### Components

- `BookingsPage`, `BookingDetailPage`
- `BookingList`, `BookingDialog`, `BookingCancellationDialog`, `StatusChangeDialog`
- `TravelerList`, `TravelerDialog`, `BookingItemList`, `BookingGroupSection`
- `BookingPaymentsSummary`, `BookingPaymentScheduleList`, `BookingGuaranteeList`
- `SupplierStatusList`, `BookingActivityTimeline`, `BookingNotes`

`BookingDetailPage` is the canonical multi-tab booking surface (Overview,
Travelers, Payments, Suppliers, Documents, Activity, plus optional `Invoices`
and `Ledger` tabs). Starters inject starter-owned cards via the `slots`
prop and wire router navigation through `onBack`, `onPersonOpen`,
`onOrganizationOpen`, `onCollectPayment`, and `onRecordPayment` callbacks:

```tsx
<BookingDetailPage
  id={bookingId}
  hideBreadcrumb
  onBack={() => router.push("/bookings")}
  onPersonOpen={(personId) => router.push(`/people/${personId}`)}
  onCollectPayment={() => setCollectOpen(true)}
  onRecordPayment={() => setRecordOpen(true)}
  slots={{
    header: (booking) => <WidgetSlot slot="booking.header" props={{ booking }} />,
    overviewStart: () => <CatalogSourceCard bookingId={bookingId} />,
    financeStart: () => <PendingPaymentSessions bookingId={bookingId} />,
    invoicesTab: { content: (booking) => <InvoicesCard booking={booking} /> },
    ledgerTab: { content: <ActionLedgerPanel bookingId={bookingId} /> },
    documents: () => <DocumentsTable bookingId={bookingId} />,
  }}
/>
```

### I18n

Components render English by default. To localize them, wrap your UI in
`BookingsUiMessagesProvider` and import only the locales your app supports.

```tsx
import { BookingsUiMessagesProvider } from "@voyant-travel/bookings-react/ui"
import { bookingsUiEn } from "@voyant-travel/bookings-react/i18n/en"
import { bookingsUiRo } from "@voyant-travel/bookings-react/i18n/ro"
```
