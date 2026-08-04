# Item 9 — Deep-link profitability rows to the Product & Departure workspaces

## What changed

`packages/finance-react/src/components/profitability-page/sections.tsx` previously
only opened an in-page traveller dialog on a departure-row click, and product
rows had no navigation at all. Now:

- `DepartureTable` accepts `onOpenDeparture(departureId)` and renders an
  external-link action button per row (aria-labelled, en + ro).
- `ProductTable` accepts `onOpenProduct(productId)` with the same affordance.
- `ProfitabilityPage` threads both through as props.
- `packages/finance-react/src/admin/pages/profitability.tsx` wires them to the
  operator admin navigation API:
  - `onOpenDeparture` → `navigateTo("availabilitySlot.detail", { slotId })`
    → `/operations/availability/:slotId` (the Departure workspace)
  - `onOpenProduct` → `navigateTo("product.detail", { productId })`
    → `/products/:productId` (the Product workspace)

`departureId` and `productId` are already on every report row, so no new data was
needed. The two destination keys resolve through the shared `AdminDestinations`
augmentation already bound into this package via `@voyant-travel/bookings-react/admin`.

## Verification performed

1. **Navigation wiring typechecks against the real destination contract.**
   `pnpm -F @voyant-travel/finance-react typecheck` passes with the
   `navigateTo("availabilitySlot.detail", { slotId })` /
   `navigateTo("product.detail", { productId })` calls — proving the keys and
   param shapes match the host resolver map, i.e. the links target the correct
   workspaces.

2. **The row link actually fires the navigation callback with the right id.**
   A jsdom functional test drives a real click on the rendered action button and
   asserts the callback is invoked with the departure/product id, and that no
   link renders when no handler is supplied. See
   `deep-links-test-output.txt` in this folder (3/3 passing).

3. **en + ro i18n parity** for the new `openDeparture` / `openProduct` labels;
   `pnpm i18n:check` passes.

## Why no live-browser screenshot

The operator admin routes are gated behind authenticated `better-auth` admin
sessions (`BETTER_AUTH_ADMIN_SECRET` / `SESSION_CLAIMS_ADMIN_SECRET`), and the
profitability page only renders clickable rows when the database holds a seeded
commercial dataset (products, departures, issued invoices and allocated supplier
costs). Standing up an authenticated operator SSR session plus that dataset was
not reliably achievable in this sandbox within budget, so — rather than a staged
screenshot that would prove nothing — the deep-link behaviour is verified by the
jsdom test above, which exercises the exact rendered components and click path,
and by the typecheck that binds the navigation to the real workspace routes.
