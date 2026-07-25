# @voyant-travel/bookings-react

## 0.206.0

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/i18n@0.117.3
  - @voyant-travel/finance@0.206.0
  - @voyant-travel/inventory@0.21.1
  - @voyant-travel/storefront-react@0.208.0
  - @voyant-travel/inventory-react@0.88.0
  - @voyant-travel/distribution-react@0.196.0
  - @voyant-travel/finance-react@0.206.0
  - @voyant-travel/identity-react@0.206.0
  - @voyant-travel/legal-react@0.206.0
  - @voyant-travel/operations-react@0.87.0
  - @voyant-travel/catalog-react@0.204.0
  - @voyant-travel/commerce-react@0.88.0
  - @voyant-travel/relationships-react@0.206.0
  - @voyant-travel/bookings@0.206.0
  - @voyant-travel/catalog@0.204.0
  - @voyant-travel/cruises@0.205.0
  - @voyant-travel/accommodations@0.166.0

## 0.205.0

### Patch Changes

- Updated dependencies [58baffe]
  - @voyant-travel/legal-react@0.205.0
  - @voyant-travel/inventory@0.21.0
  - @voyant-travel/finance@0.205.0
  - @voyant-travel/finance-react@0.205.0
  - @voyant-travel/accommodations@0.165.0
  - @voyant-travel/operations-react@0.86.0
  - @voyant-travel/relationships-react@0.205.0
  - @voyant-travel/inventory-react@0.87.0
  - @voyant-travel/catalog@0.203.0
  - @voyant-travel/cruises@0.204.0
  - @voyant-travel/storefront-react@0.207.0
  - @voyant-travel/distribution-react@0.195.0
  - @voyant-travel/identity-react@0.205.0
  - @voyant-travel/catalog-react@0.203.0
  - @voyant-travel/commerce-react@0.87.0
  - @voyant-travel/bookings@0.205.0

## 0.204.0

### Patch Changes

- Updated dependencies [9e57a5d]
  - @voyant-travel/inventory-react@0.86.0
  - @voyant-travel/catalog-react@0.202.0
  - @voyant-travel/commerce-react@0.86.0
  - @voyant-travel/distribution-react@0.194.0
  - @voyant-travel/finance-react@0.204.0
  - @voyant-travel/identity-react@0.204.0
  - @voyant-travel/legal-react@0.204.0
  - @voyant-travel/operations-react@0.85.0
  - @voyant-travel/storefront-react@0.206.0
  - @voyant-travel/relationships-react@0.204.0
  - @voyant-travel/bookings@0.204.0
  - @voyant-travel/catalog@0.202.0
  - @voyant-travel/cruises@0.203.0
  - @voyant-travel/finance@0.204.0
  - @voyant-travel/accommodations@0.164.0
  - @voyant-travel/inventory@0.20.1

## 0.203.0

### Minor Changes

- 17f1239: Replace the inline Finance booking-create HTTP and dual-create surfaces with one
  handler-admitted, idempotent created-target Tool command. Booking rows, dependent
  finance records, the canonical action-ledger result, and domain-event outbox
  entries now settle in one transaction; exact retries resolve the original booking.

  Remove the retired booking-create React mutation, sheet, page, and slot shortcut.
  Unmount the legacy admin new/journey routes and semantic destinations, remove
  catalog and inventory booking actions, and remove the standard storefront
  `/shop/book/:entityModule/:entityId` route plus its booking page/journey exports.
  Catalog browsing, booking read/detail, customer-portal sessions, and reusable
  draft sections remain available; new booking creation is a Finance staff Tool.
  Remove raw Bookings, Charter, and Cruise creation APIs and Tools. Delete the
  dormant Catalog owned-commit contract and Inventory, Accommodations, Cruises,
  Commerce, Storefront, and Storefront SDK booking-row creation bridges rather
  than retaining unavailable legacy mutations. Require registry-minted,
  unforgeable handler admission plus a single-use Finance-specific mutation lease
  for Bookings domain settlement, and remove the Finance command's public
  subpath.

### Patch Changes

- Updated dependencies [17f1239]
  - @voyant-travel/finance@0.203.0
  - @voyant-travel/catalog@0.201.0
  - @voyant-travel/catalog-react@0.201.0
  - @voyant-travel/bookings@0.203.0
  - @voyant-travel/inventory@0.20.0
  - @voyant-travel/operations-react@0.84.0
  - @voyant-travel/cruises@0.202.0
  - @voyant-travel/accommodations@0.163.0
  - @voyant-travel/finance-react@0.203.0
  - @voyant-travel/inventory-react@0.85.0
  - @voyant-travel/storefront-react@0.205.0
  - @voyant-travel/distribution-react@0.193.0
  - @voyant-travel/identity-react@0.203.0
  - @voyant-travel/legal-react@0.203.0
  - @voyant-travel/commerce-react@0.85.0
  - @voyant-travel/relationships-react@0.203.0

## 0.202.0

### Patch Changes

- @voyant-travel/accommodations@0.162.0
- @voyant-travel/storefront-react@0.204.0
- @voyant-travel/distribution-react@0.192.0
- @voyant-travel/finance-react@0.202.0
- @voyant-travel/identity-react@0.202.0
- @voyant-travel/legal-react@0.202.0
- @voyant-travel/operations-react@0.83.0
- @voyant-travel/inventory-react@0.84.0
- @voyant-travel/catalog-react@0.200.0
- @voyant-travel/commerce-react@0.84.0
- @voyant-travel/relationships-react@0.202.0
- @voyant-travel/bookings@0.202.0
- @voyant-travel/catalog@0.200.0
- @voyant-travel/cruises@0.201.0
- @voyant-travel/finance@0.202.0
- @voyant-travel/inventory@0.19.6

## 0.201.1

### Patch Changes

- Updated dependencies [a02a76b]
  - @voyant-travel/accommodations@0.161.1
  - @voyant-travel/bookings@0.201.1
  - @voyant-travel/catalog@0.199.1
  - @voyant-travel/cruises@0.200.1
  - @voyant-travel/finance@0.201.1
  - @voyant-travel/inventory@0.19.5
  - @voyant-travel/catalog-react@0.199.1
  - @voyant-travel/distribution-react@0.191.1
  - @voyant-travel/finance-react@0.201.1
  - @voyant-travel/identity-react@0.201.1
  - @voyant-travel/legal-react@0.201.1
  - @voyant-travel/storefront-react@0.203.1

## 0.201.0

### Patch Changes

- Updated dependencies [5e03ae7]
  - @voyant-travel/finance@0.201.0
  - @voyant-travel/accommodations@0.161.0
  - @voyant-travel/catalog@0.199.0
  - @voyant-travel/cruises@0.200.0
  - @voyant-travel/finance-react@0.201.0
  - @voyant-travel/inventory@0.19.4
  - @voyant-travel/inventory-react@0.83.0
  - @voyant-travel/storefront-react@0.203.0
  - @voyant-travel/distribution-react@0.191.0
  - @voyant-travel/identity-react@0.201.0
  - @voyant-travel/legal-react@0.201.0
  - @voyant-travel/operations-react@0.82.0
  - @voyant-travel/catalog-react@0.199.0
  - @voyant-travel/commerce-react@0.83.0
  - @voyant-travel/relationships-react@0.201.0
  - @voyant-travel/bookings@0.201.0

## 0.200.0

### Minor Changes

- 952d817: Replace unsafe booking-contract document generation with the Legal-owned
  durable operation/provider protocol. Legacy generation routes and direct
  generator services and exports are removed. Standard Operator now selects and
  constructs the shipped provider from its exact database, document-storage, and
  renderer bindings; startup and action activation require behavioral provider
  preflight, and pending recovery fails loudly if that provider disappears.
  Local Standard document bytes now require probed, atomic filesystem durability,
  and the bundled renderer embeds a Latin Extended Unicode font. Custom font
  bytes are also supported by the basic PDF utility. Opaque renderer/S3
  transports require explicit backend identity. Remove the
  Notifications document-bundle lifecycle callbacks, fully-paid orchestration
  subscriber, and its Realtime invalidation declaration; document generation is
  available only through admitted Legal actions.

  Recognize transaction-bound outbox appends as durable domain-event emissions
  and publish the existing Trips requirement-sourcing event contracts.

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/legal-react@0.200.0
  - @voyant-travel/catalog@0.198.0
  - @voyant-travel/distribution-react@0.190.0
  - @voyant-travel/finance-react@0.200.0
  - @voyant-travel/identity-react@0.200.0
  - @voyant-travel/operations-react@0.81.0
  - @voyant-travel/accommodations@0.160.0
  - @voyant-travel/cruises@0.199.0
  - @voyant-travel/inventory@0.19.3
  - @voyant-travel/commerce-react@0.82.0
  - @voyant-travel/bookings@0.200.0
  - @voyant-travel/finance@0.200.0
  - @voyant-travel/inventory-react@0.82.0
  - @voyant-travel/relationships-react@0.200.0
  - @voyant-travel/ui@0.109.6
  - @voyant-travel/storefront-react@0.202.0
  - @voyant-travel/catalog-react@0.198.0

## 0.199.0

### Patch Changes

- Updated dependencies [c03ff60]
  - @voyant-travel/catalog@0.197.0
  - @voyant-travel/accommodations@0.159.0
  - @voyant-travel/bookings@0.199.0
  - @voyant-travel/cruises@0.198.0
  - @voyant-travel/finance@0.199.0
  - @voyant-travel/inventory@0.19.2
  - @voyant-travel/distribution-react@0.189.0
  - @voyant-travel/finance-react@0.199.0
  - @voyant-travel/identity-react@0.199.0
  - @voyant-travel/legal-react@0.199.0
  - @voyant-travel/operations-react@0.80.0
  - @voyant-travel/catalog-react@0.197.0
  - @voyant-travel/commerce-react@0.81.0
  - @voyant-travel/inventory-react@0.81.0
  - @voyant-travel/relationships-react@0.199.0
  - @voyant-travel/storefront-react@0.201.0

## 0.198.1

### Patch Changes

- e2cb9f5: Unify the product booking-mode vocabulary. The products table column, detail
  chips, and the editor picker now all use the same short labels (Multi-day tour,
  Accommodation, Day trip, Timed activity, Transfer, Open-dated voucher, Other)
  instead of the table showing terse words (Itinerary, Date, Stay) while the editor
  showed long descriptive ones. The pricing basis (rooms & nights / per person) is
  kept as a secondary hint shown only inside the picker.
- e2cb9f5: Density-audit copy fixes. The booking detail header now reads "N travelers"
  instead of "N PAX". On the invoice detail, the Booking / Person / Organization
  links no longer display raw record IDs — they show a clear "View booking" /
  "View person" / "View organization" action (matching the payment detail page),
  since the invoice record doesn't carry resolved names.
- e2cb9f5: Clean up misused Card components. Cards that added their own vertical padding on
  top of the Card's built-in padding (double-padded content) now rely on the
  card's spacing, and the booking "Internal notes" card uses a proper card header
  and title instead of a label buried in the body. Empty-state, edge-to-edge, and
  image-tile cards are unchanged.
- e2cb9f5: Give every admin screen consistent page spacing. Previously each page invented
  its own padding (`p-6`, `px-6 py-6 lg:px-8`, `container mx-auto py-6` with no
  horizontal padding, or none at all), so screens like the booking engine had no
  spacing while others differed.

  The admin workspace layout now wraps the page outlet in a single padded content
  region (`px-4 py-6 md:px-6`), and the per-page root padding was removed so it no
  longer double-pads (max-width caps are kept). The full-height settings two-pane
  bleeds back out of that padding and re-applies its own so it stays edge-to-edge.

- e2cb9f5: Fix double page padding. The admin shell already applies consistent page
  padding around the content area, but a number of page and loading-skeleton
  components still added their own `p-6` on top, pushing their content ~24px
  further in than the page header and leaving pages inconsistently indented.
  Those redundant root paddings are removed so every page's content lines up with
  the header and with each other. Dialog, portal, and card paddings are
  unchanged.
- e2cb9f5: Move heavy multi-field forms from centered dialogs to side sheets. Create/edit
  forms with more than a handful of fields (invoices, bookings, travelers,
  markets, pricing rules, policies, suppliers, resources, legal templates,
  notification templates, and similar) were rendered as centered modals; per the
  dialog-vs-sheet guidance, complex multi-field editing belongs in a side sheet
  that keeps the parent screen visible. Confirmations, media viewers, and short
  one-to-three-field dialogs are unchanged.
- e2cb9f5: Make form-field grids responsive on mobile. Two-column (and three/four-column) field grids that previously rendered multiple columns at every width now stack to a single column on small screens and expand at the `sm`/`lg` breakpoints, so forms and dialogs are no longer cramped on phones.
- e2cb9f5: Plain-language copy pass across the admin UI. Rewrites microcopy on the
  non-developer screens so it reads for travel professionals rather than
  engineers: removes developer jargon (entity, tenant, adapter/connector,
  payload, sync/reconcile internals, raw database column names and code
  fragments), strips internal/roadmap notes that leaked into user copy, cuts
  verbose and redundant helper text, and aligns terminology to the canonical
  Ubiquitous Language (Traveler over pax/guest, Supplier, Quote/Quote Version,
  "record" instead of "entity") with consistent sentence case. English catalog
  copy only; ICU placeholders and en/ro key parity preserved.
- e2cb9f5: Bring the Romanian (ro) admin translations in line with the plain-language
  English copy pass — re-translating the updated strings so the Romanian UI drops
  the same jargon and reads as clearly as the English. Values only; en/ro key
  parity and ICU placeholders preserved.
- e2cb9f5: Make form and dialog select triggers full-width. The shared `SelectTrigger`
  defaults to `w-fit`, so selects that sit in a form or dialog next to full-width
  inputs rendered noticeably narrower. Add `w-full` at those call sites (filter
  popovers, dialogs, and stacked form fields). Toolbar and inline selects that
  carry an intentional fixed width are left unchanged.
- e2cb9f5: Align off-scale spacing utilities to the shared scale: gap-5 to gap-4, p-5 to
  p-6, space-y-5 to space-y-4, space-y-8 to space-y-6, p-10/p-12 to p-8, gap-8 to
  gap-6. Keeps spacing on the consistent 1/2/3/4/6/8 scale used across the app.
- e2cb9f5: Replace native browser dialogs with styled UI-package dialogs across the admin
  surface. Adds `confirmDialog`/`ConfirmDialogHost` and `promptDialog`/
  `PromptDialogHost` to `@voyant-travel/ui`, mounts both hosts once in the
  operator admin shell, and migrates every `window.confirm`/`window.prompt` call
  and stray `window.alert` in the `*-react` packages to the styled equivalents
  (destructive confirmations rendered with the destructive action variant). Also
  fixes the event-catalog "selected event contracts" count to use ICU plural
  formatting.
- e2cb9f5: Visual polish pass. Remove duplicated empty-state text in the media library and
  the product media section (the same message no longer appears twice), and clean
  up remaining "CRM" jargon the plain-language pass missed in the person/company
  create dialogs, flight contact picker, and booking traveler picker (now
  "contacts"/"contact" instead of "CRM").
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
  - @voyant-travel/i18n@0.117.2
  - @voyant-travel/inventory-react@0.80.1
  - @voyant-travel/commerce-react@0.80.1
  - @voyant-travel/finance-react@0.198.1
  - @voyant-travel/relationships-react@0.198.1
  - @voyant-travel/legal-react@0.198.1
  - @voyant-travel/storefront-react@0.200.1
  - @voyant-travel/admin@0.129.1
  - @voyant-travel/catalog-react@0.196.1
  - @voyant-travel/distribution-react@0.188.1
  - @voyant-travel/identity-react@0.198.1
  - @voyant-travel/operations-react@0.79.1
  - @voyant-travel/ui@0.109.5
  - @voyant-travel/inventory@0.19.1
  - @voyant-travel/bookings@0.198.1
  - @voyant-travel/catalog@0.196.1
  - @voyant-travel/cruises@0.197.1
  - @voyant-travel/finance@0.198.1

## 0.198.0

### Patch Changes

- @voyant-travel/inventory@0.19.0
- @voyant-travel/relationships-react@0.198.0
- @voyant-travel/inventory-react@0.80.0
- @voyant-travel/legal-react@0.198.0
- @voyant-travel/accommodations@0.158.0
- @voyant-travel/distribution-react@0.188.0
- @voyant-travel/identity-react@0.198.0
- @voyant-travel/storefront-react@0.200.0
- @voyant-travel/finance-react@0.198.0
- @voyant-travel/operations-react@0.79.0
- @voyant-travel/catalog-react@0.196.0
- @voyant-travel/commerce-react@0.80.0
- @voyant-travel/bookings@0.198.0
- @voyant-travel/catalog@0.196.0
- @voyant-travel/cruises@0.197.0
- @voyant-travel/finance@0.198.0

## 0.197.0

### Patch Changes

- Updated dependencies [b07a0a3]
- Updated dependencies [a310395]
  - @voyant-travel/bookings@0.197.0
  - @voyant-travel/finance@0.197.0
  - @voyant-travel/cruises@0.196.0
  - @voyant-travel/accommodations@0.157.0
  - @voyant-travel/inventory@0.18.0
  - @voyant-travel/catalog@0.195.0
  - @voyant-travel/commerce-react@0.79.0
  - @voyant-travel/legal-react@0.197.0
  - @voyant-travel/relationships-react@0.197.0
  - @voyant-travel/inventory-react@0.79.0
  - @voyant-travel/storefront-react@0.199.0
  - @voyant-travel/catalog-react@0.195.0
  - @voyant-travel/distribution-react@0.187.0
  - @voyant-travel/finance-react@0.197.0
  - @voyant-travel/identity-react@0.197.0
  - @voyant-travel/operations-react@0.78.0

## 0.196.0

### Patch Changes

- Updated dependencies [0190317]
- Updated dependencies [78423d3]
- Updated dependencies [58020ec]
- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies
  - @voyant-travel/inventory@0.17.0
  - @voyant-travel/accommodations@0.156.0
  - @voyant-travel/cruises@0.195.0
  - @voyant-travel/catalog@0.194.0
  - @voyant-travel/finance@0.196.0
  - @voyant-travel/bookings@0.196.0
  - @voyant-travel/distribution-react@0.186.0
  - @voyant-travel/legal-react@0.196.0
  - @voyant-travel/inventory-react@0.78.0
  - @voyant-travel/storefront-react@0.198.0
  - @voyant-travel/commerce-react@0.78.0
  - @voyant-travel/relationships-react@0.196.0
  - @voyant-travel/finance-react@0.196.0
  - @voyant-travel/identity-react@0.196.0
  - @voyant-travel/catalog-react@0.194.0
  - @voyant-travel/operations-react@0.77.0

## 0.195.0

### Patch Changes

- Updated dependencies [e3a1e17]
  - @voyant-travel/bookings@0.195.0
  - @voyant-travel/accommodations@0.155.0
  - @voyant-travel/catalog@0.193.0
  - @voyant-travel/cruises@0.194.0
  - @voyant-travel/finance@0.195.0
  - @voyant-travel/inventory@0.16.2
  - @voyant-travel/distribution-react@0.185.0
  - @voyant-travel/finance-react@0.195.0
  - @voyant-travel/identity-react@0.195.0
  - @voyant-travel/legal-react@0.195.0
  - @voyant-travel/operations-react@0.76.0
  - @voyant-travel/catalog-react@0.193.0
  - @voyant-travel/commerce-react@0.77.0
  - @voyant-travel/inventory-react@0.77.0
  - @voyant-travel/relationships-react@0.195.0
  - @voyant-travel/storefront-react@0.197.0

## 0.194.1

### Patch Changes

- 8ef8b37: Keep live booking travelers authoritative at commit time and let room-based journeys reach their option picker before a quote is priceable.
- Updated dependencies [8ef8b37]
  - @voyant-travel/catalog@0.192.1
  - @voyant-travel/bookings@0.194.1
  - @voyant-travel/catalog-react@0.192.1

## 0.194.0

### Patch Changes

- Updated dependencies [dd370ca]
  - @voyant-travel/catalog@0.192.0
  - @voyant-travel/inventory@0.16.1
  - @voyant-travel/accommodations@0.154.0
  - @voyant-travel/cruises@0.193.0
  - @voyant-travel/distribution-react@0.184.0
  - @voyant-travel/finance-react@0.194.0
  - @voyant-travel/identity-react@0.194.0
  - @voyant-travel/legal-react@0.194.0
  - @voyant-travel/operations-react@0.75.0
  - @voyant-travel/catalog-react@0.192.0
  - @voyant-travel/commerce-react@0.76.0
  - @voyant-travel/inventory-react@0.76.0
  - @voyant-travel/relationships-react@0.194.0
  - @voyant-travel/storefront-react@0.196.0
  - @voyant-travel/bookings@0.194.0
  - @voyant-travel/finance@0.194.0

## 0.193.0

### Patch Changes

- Updated dependencies [a43267a]
- Updated dependencies [90d44c0]
- Updated dependencies [2c79bef]
  - @voyant-travel/catalog@0.191.0
  - @voyant-travel/catalog-contracts@0.112.1
  - @voyant-travel/inventory@0.16.0
  - @voyant-travel/admin@0.129.0
  - @voyant-travel/i18n@0.117.0
  - @voyant-travel/inventory-react@0.75.0
  - @voyant-travel/cruises@0.192.0
  - @voyant-travel/accommodations@0.153.0
  - @voyant-travel/catalog-react@0.191.0
  - @voyant-travel/commerce-react@0.75.0
  - @voyant-travel/distribution-react@0.183.0
  - @voyant-travel/finance-react@0.193.0
  - @voyant-travel/legal-react@0.193.0
  - @voyant-travel/operations-react@0.74.0
  - @voyant-travel/relationships-react@0.193.0
  - @voyant-travel/storefront-react@0.195.0
  - @voyant-travel/identity-react@0.193.0
  - @voyant-travel/bookings@0.193.0
  - @voyant-travel/finance@0.193.0

## 0.192.1

### Patch Changes

- @voyant-travel/accommodations@0.152.1
- @voyant-travel/bookings@0.192.1
- @voyant-travel/catalog@0.190.1
- @voyant-travel/cruises@0.191.1
- @voyant-travel/finance@0.192.1
- @voyant-travel/inventory@0.15.3
- @voyant-travel/catalog-react@0.190.1
- @voyant-travel/distribution-react@0.182.1
- @voyant-travel/finance-react@0.192.1
- @voyant-travel/identity-react@0.192.1
- @voyant-travel/legal-react@0.192.1
- @voyant-travel/storefront-react@0.194.1

## 0.192.0

### Patch Changes

- Updated dependencies [e68a705]
  - @voyant-travel/finance@0.192.0
  - @voyant-travel/finance-react@0.192.0
  - @voyant-travel/storefront-react@0.194.0
  - @voyant-travel/inventory-react@0.74.0
  - @voyant-travel/distribution-react@0.182.0
  - @voyant-travel/identity-react@0.192.0
  - @voyant-travel/legal-react@0.192.0
  - @voyant-travel/operations-react@0.73.0
  - @voyant-travel/catalog-react@0.190.0
  - @voyant-travel/commerce-react@0.74.0
  - @voyant-travel/relationships-react@0.192.0
  - @voyant-travel/bookings@0.192.0
  - @voyant-travel/catalog@0.190.0
  - @voyant-travel/cruises@0.191.0
  - @voyant-travel/accommodations@0.152.0
  - @voyant-travel/inventory@0.15.2

## 0.191.0

### Patch Changes

- Updated dependencies [f6aa3a1]
  - @voyant-travel/finance@0.191.0
  - @voyant-travel/accommodations@0.151.0
  - @voyant-travel/catalog@0.189.0
  - @voyant-travel/cruises@0.190.0
  - @voyant-travel/finance-react@0.191.0
  - @voyant-travel/inventory@0.15.1
  - @voyant-travel/inventory-react@0.73.0
  - @voyant-travel/distribution-react@0.181.0
  - @voyant-travel/identity-react@0.191.0
  - @voyant-travel/legal-react@0.191.0
  - @voyant-travel/operations-react@0.72.0
  - @voyant-travel/catalog-react@0.189.0
  - @voyant-travel/commerce-react@0.73.0
  - @voyant-travel/relationships-react@0.191.0
  - @voyant-travel/storefront-react@0.193.0
  - @voyant-travel/bookings@0.191.0

## 0.190.0

### Patch Changes

- Updated dependencies [228b57d]
- Updated dependencies [f945310]
- Updated dependencies [f2c9404]
  - @voyant-travel/bookings@0.190.0
  - @voyant-travel/catalog@0.188.0
  - @voyant-travel/cruises@0.189.0
  - @voyant-travel/inventory@0.15.0
  - @voyant-travel/accommodations@0.150.0
  - @voyant-travel/finance@0.190.0
  - @voyant-travel/commerce-react@0.72.0
  - @voyant-travel/types@0.109.9
  - @voyant-travel/distribution-react@0.180.0
  - @voyant-travel/inventory-react@0.72.0
  - @voyant-travel/storefront-react@0.192.0
  - @voyant-travel/finance-react@0.190.0
  - @voyant-travel/identity-react@0.190.0
  - @voyant-travel/legal-react@0.190.0
  - @voyant-travel/operations-react@0.71.0
  - @voyant-travel/catalog-react@0.188.0
  - @voyant-travel/relationships-react@0.190.0

## 0.189.0

### Patch Changes

- Updated dependencies [d9ff078]
  - @voyant-travel/catalog@0.187.0
  - @voyant-travel/catalog-contracts@0.112.0
  - @voyant-travel/accommodations@0.149.0
  - @voyant-travel/cruises@0.188.0
  - @voyant-travel/inventory@0.14.28
  - @voyant-travel/catalog-react@0.187.0
  - @voyant-travel/inventory-react@0.71.0
  - @voyant-travel/storefront-react@0.191.0
  - @voyant-travel/distribution-react@0.179.0
  - @voyant-travel/finance-react@0.189.0
  - @voyant-travel/identity-react@0.189.0
  - @voyant-travel/legal-react@0.189.0
  - @voyant-travel/operations-react@0.70.0
  - @voyant-travel/commerce-react@0.71.0
  - @voyant-travel/relationships-react@0.189.0
  - @voyant-travel/bookings@0.189.0
  - @voyant-travel/finance@0.189.0

## 0.188.0

### Patch Changes

- @voyant-travel/accommodations@0.148.0
- @voyant-travel/bookings@0.188.0
- @voyant-travel/catalog@0.186.0
- @voyant-travel/cruises@0.187.0
- @voyant-travel/finance@0.188.0
- @voyant-travel/inventory@0.14.27
- @voyant-travel/commerce-react@0.70.0
- @voyant-travel/inventory-react@0.70.0
- @voyant-travel/legal-react@0.188.0
- @voyant-travel/relationships-react@0.188.0
- @voyant-travel/ui@0.109.4
- @voyant-travel/catalog-react@0.186.0
- @voyant-travel/distribution-react@0.178.0
- @voyant-travel/finance-react@0.188.0
- @voyant-travel/identity-react@0.188.0
- @voyant-travel/operations-react@0.69.0
- @voyant-travel/storefront-react@0.190.0

## 0.187.0

### Patch Changes

- Updated dependencies [0b7f213]
  - @voyant-travel/inventory-react@0.69.0
  - @voyant-travel/catalog-react@0.185.0
  - @voyant-travel/commerce-react@0.69.0
  - @voyant-travel/distribution-react@0.177.0
  - @voyant-travel/finance-react@0.187.0
  - @voyant-travel/identity-react@0.187.0
  - @voyant-travel/legal-react@0.187.0
  - @voyant-travel/operations-react@0.68.0
  - @voyant-travel/storefront-react@0.189.0
  - @voyant-travel/relationships-react@0.187.0
  - @voyant-travel/bookings@0.187.0
  - @voyant-travel/catalog@0.185.0
  - @voyant-travel/cruises@0.186.0
  - @voyant-travel/finance@0.187.0
  - @voyant-travel/accommodations@0.147.0
  - @voyant-travel/inventory@0.14.24

## 0.186.1

### Patch Changes

- a9f174d: Don't flag a pristine booking journey as un-priceable. Opening the journey for a product whose price depends on a later selection (a room to pick, travelers to add) showed the "This selection can't be priced right now" banner and a raw `no_sell_amount_configured` engine code on step 1, before the buyer had chosen anything — making a bookable product look broken. The un-priceable banner and side-panel error are now suppressed for that pristine baseline and only surface once a price driver is configured (or for a genuinely un-priceable reason like `rates_missing`); the side panel shows a human-readable message instead of the raw code. Commit gating is unchanged, so an unpriced booking still can't be submitted.
  - @voyant-travel/bookings@0.186.1

## 0.186.0

### Patch Changes

- Updated dependencies [5af8682]
  - @voyant-travel/inventory-react@0.68.0
  - @voyant-travel/catalog-react@0.184.0
  - @voyant-travel/commerce-react@0.68.0
  - @voyant-travel/distribution-react@0.176.0
  - @voyant-travel/finance-react@0.186.0
  - @voyant-travel/identity-react@0.186.0
  - @voyant-travel/legal-react@0.186.0
  - @voyant-travel/operations-react@0.67.0
  - @voyant-travel/storefront-react@0.188.0
  - @voyant-travel/relationships-react@0.186.0
  - @voyant-travel/bookings@0.186.0
  - @voyant-travel/catalog@0.184.0
  - @voyant-travel/cruises@0.185.0
  - @voyant-travel/finance@0.186.0
  - @voyant-travel/accommodations@0.146.0
  - @voyant-travel/inventory@0.14.22

## 0.185.0

### Patch Changes

- Updated dependencies [e7e90bf]
  - @voyant-travel/finance@0.185.0
  - @voyant-travel/accommodations@0.145.0
  - @voyant-travel/catalog@0.183.0
  - @voyant-travel/cruises@0.184.0
  - @voyant-travel/finance-react@0.185.0
  - @voyant-travel/inventory@0.14.21
  - @voyant-travel/inventory-react@0.67.0
  - @voyant-travel/distribution-react@0.175.0
  - @voyant-travel/identity-react@0.185.0
  - @voyant-travel/legal-react@0.185.0
  - @voyant-travel/operations-react@0.66.0
  - @voyant-travel/catalog-react@0.183.0
  - @voyant-travel/commerce-react@0.67.0
  - @voyant-travel/relationships-react@0.185.0
  - @voyant-travel/storefront-react@0.187.0
  - @voyant-travel/bookings@0.185.0

## 0.184.0

### Patch Changes

- Updated dependencies [a33c590]
  - @voyant-travel/inventory-react@0.66.0
  - @voyant-travel/inventory@0.14.20
  - @voyant-travel/catalog-react@0.182.0
  - @voyant-travel/commerce-react@0.66.0
  - @voyant-travel/distribution-react@0.174.0
  - @voyant-travel/finance-react@0.184.0
  - @voyant-travel/identity-react@0.184.0
  - @voyant-travel/legal-react@0.184.0
  - @voyant-travel/operations-react@0.65.0
  - @voyant-travel/storefront-react@0.186.0
  - @voyant-travel/relationships-react@0.184.0
  - @voyant-travel/bookings@0.184.0
  - @voyant-travel/catalog@0.182.0
  - @voyant-travel/cruises@0.183.0
  - @voyant-travel/finance@0.184.0
  - @voyant-travel/accommodations@0.144.0

## 0.183.0

### Patch Changes

- @voyant-travel/finance@0.183.0
- @voyant-travel/storefront-react@0.185.0
- @voyant-travel/inventory-react@0.65.0
- @voyant-travel/distribution-react@0.173.0
- @voyant-travel/finance-react@0.183.0
- @voyant-travel/identity-react@0.183.0
- @voyant-travel/legal-react@0.183.0
- @voyant-travel/operations-react@0.64.0
- @voyant-travel/catalog-react@0.181.0
- @voyant-travel/commerce-react@0.65.0
- @voyant-travel/relationships-react@0.183.0
- @voyant-travel/bookings@0.183.0
- @voyant-travel/catalog@0.181.0
- @voyant-travel/cruises@0.182.0
- @voyant-travel/accommodations@0.143.0
- @voyant-travel/inventory@0.14.19

## 0.182.2

### Patch Changes

- Updated dependencies [f0f51b4]
  - @voyant-travel/i18n@0.116.0
  - @voyant-travel/admin@0.128.3
  - @voyant-travel/catalog-react@0.180.2
  - @voyant-travel/commerce-react@0.64.1
  - @voyant-travel/distribution-react@0.172.2
  - @voyant-travel/finance-react@0.182.4
  - @voyant-travel/identity-react@0.182.2
  - @voyant-travel/inventory-react@0.64.1
  - @voyant-travel/legal-react@0.182.4
  - @voyant-travel/operations-react@0.63.1
  - @voyant-travel/relationships-react@0.182.1
  - @voyant-travel/storefront-react@0.184.2
  - @voyant-travel/bookings@0.182.2
  - @voyant-travel/catalog@0.180.2
  - @voyant-travel/cruises@0.181.2
  - @voyant-travel/finance@0.182.4

## 0.182.1

### Patch Changes

- @voyant-travel/accommodations@0.142.1
- @voyant-travel/bookings@0.182.1
- @voyant-travel/catalog@0.180.1
- @voyant-travel/cruises@0.181.1
- @voyant-travel/finance@0.182.3
- @voyant-travel/inventory@0.14.18
- @voyant-travel/catalog-react@0.180.1
- @voyant-travel/distribution-react@0.172.1
- @voyant-travel/finance-react@0.182.3
- @voyant-travel/identity-react@0.182.1
- @voyant-travel/legal-react@0.182.3
- @voyant-travel/storefront-react@0.184.1

## 0.182.0

### Patch Changes

- @voyant-travel/storefront-react@0.184.0
- @voyant-travel/inventory-react@0.64.0
- @voyant-travel/distribution-react@0.172.0
- @voyant-travel/finance-react@0.182.0
- @voyant-travel/identity-react@0.182.0
- @voyant-travel/legal-react@0.182.0
- @voyant-travel/operations-react@0.63.0
- @voyant-travel/catalog-react@0.180.0
- @voyant-travel/commerce-react@0.64.0
- @voyant-travel/relationships-react@0.182.0
- @voyant-travel/bookings@0.182.0
- @voyant-travel/catalog@0.180.0
- @voyant-travel/cruises@0.181.0
- @voyant-travel/finance@0.182.0
- @voyant-travel/accommodations@0.142.0
- @voyant-travel/inventory@0.14.15

## 0.181.0

### Patch Changes

- Updated dependencies [464815c]
- Updated dependencies [464815c]
  - @voyant-travel/finance@0.181.0
  - @voyant-travel/i18n@0.115.1
  - @voyant-travel/bookings@0.181.0
  - @voyant-travel/inventory@0.14.13
  - @voyant-travel/accommodations@0.141.0
  - @voyant-travel/catalog@0.179.0
  - @voyant-travel/cruises@0.180.0
  - @voyant-travel/finance-react@0.181.0
  - @voyant-travel/inventory-react@0.63.0
  - @voyant-travel/distribution-react@0.171.0
  - @voyant-travel/identity-react@0.181.0
  - @voyant-travel/legal-react@0.181.0
  - @voyant-travel/operations-react@0.62.0
  - @voyant-travel/catalog-react@0.179.0
  - @voyant-travel/commerce-react@0.63.0
  - @voyant-travel/relationships-react@0.181.0
  - @voyant-travel/storefront-react@0.183.0

## 0.180.1

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/i18n@0.115.0
  - @voyant-travel/finance@0.180.1
  - @voyant-travel/inventory@0.14.12
  - @voyant-travel/admin@0.128.2
  - @voyant-travel/catalog-react@0.178.1
  - @voyant-travel/commerce-react@0.62.1
  - @voyant-travel/distribution-react@0.170.1
  - @voyant-travel/finance-react@0.180.1
  - @voyant-travel/identity-react@0.180.1
  - @voyant-travel/inventory-react@0.62.1
  - @voyant-travel/legal-react@0.180.1
  - @voyant-travel/operations-react@0.61.1
  - @voyant-travel/relationships-react@0.180.1
  - @voyant-travel/storefront-react@0.182.1
  - @voyant-travel/bookings@0.180.1
  - @voyant-travel/catalog@0.178.1
  - @voyant-travel/cruises@0.179.1

## 0.180.0

### Patch Changes

- Updated dependencies [ecf1680]
  - @voyant-travel/storefront-react@0.182.0
  - @voyant-travel/i18n@0.114.0
  - @voyant-travel/inventory-react@0.62.0
  - @voyant-travel/admin@0.128.1
  - @voyant-travel/catalog-react@0.178.0
  - @voyant-travel/commerce-react@0.62.0
  - @voyant-travel/distribution-react@0.170.0
  - @voyant-travel/finance-react@0.180.0
  - @voyant-travel/identity-react@0.180.0
  - @voyant-travel/legal-react@0.180.0
  - @voyant-travel/operations-react@0.61.0
  - @voyant-travel/relationships-react@0.180.0
  - @voyant-travel/bookings@0.180.0
  - @voyant-travel/catalog@0.178.0
  - @voyant-travel/cruises@0.179.0
  - @voyant-travel/finance@0.180.0
  - @voyant-travel/accommodations@0.140.0
  - @voyant-travel/inventory@0.14.11

## 0.179.0

### Patch Changes

- @voyant-travel/storefront-react@0.181.0
- @voyant-travel/inventory-react@0.61.0
- @voyant-travel/distribution-react@0.169.0
- @voyant-travel/finance-react@0.179.0
- @voyant-travel/identity-react@0.179.0
- @voyant-travel/legal-react@0.179.0
- @voyant-travel/operations-react@0.60.0
- @voyant-travel/catalog-react@0.177.0
- @voyant-travel/commerce-react@0.61.0
- @voyant-travel/relationships-react@0.179.0
- @voyant-travel/bookings@0.179.0
- @voyant-travel/catalog@0.177.0
- @voyant-travel/cruises@0.178.0
- @voyant-travel/finance@0.179.0
- @voyant-travel/accommodations@0.139.0
- @voyant-travel/inventory@0.14.10

## 0.178.0

### Patch Changes

- Updated dependencies [2bcafc9]
  - @voyant-travel/admin@0.128.0
  - @voyant-travel/i18n@0.113.0
  - @voyant-travel/catalog-react@0.176.0
  - @voyant-travel/commerce-react@0.60.0
  - @voyant-travel/distribution-react@0.168.0
  - @voyant-travel/finance-react@0.178.0
  - @voyant-travel/inventory-react@0.60.0
  - @voyant-travel/legal-react@0.178.0
  - @voyant-travel/operations-react@0.59.0
  - @voyant-travel/relationships-react@0.178.0
  - @voyant-travel/storefront-react@0.180.0
  - @voyant-travel/identity-react@0.178.0
  - @voyant-travel/bookings@0.178.0
  - @voyant-travel/catalog@0.176.0
  - @voyant-travel/cruises@0.177.0
  - @voyant-travel/finance@0.178.0
  - @voyant-travel/accommodations@0.138.0
  - @voyant-travel/inventory@0.14.9

## 0.177.0

### Patch Changes

- @voyant-travel/accommodations@0.137.0
- @voyant-travel/bookings@0.177.0
- @voyant-travel/catalog@0.175.0
- @voyant-travel/cruises@0.176.0
- @voyant-travel/finance@0.177.0
- @voyant-travel/inventory@0.14.8
- @voyant-travel/types@0.109.8
- @voyant-travel/storefront-react@0.179.0
- @voyant-travel/inventory-react@0.59.0
- @voyant-travel/distribution-react@0.167.0
- @voyant-travel/finance-react@0.177.0
- @voyant-travel/identity-react@0.177.0
- @voyant-travel/legal-react@0.177.0
- @voyant-travel/operations-react@0.58.0
- @voyant-travel/catalog-react@0.175.0
- @voyant-travel/commerce-react@0.59.0
- @voyant-travel/relationships-react@0.177.0

## 0.176.0

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/storefront-react@0.178.0
  - @voyant-travel/accommodations@0.136.0
  - @voyant-travel/bookings@0.176.0
  - @voyant-travel/catalog@0.174.0
  - @voyant-travel/cruises@0.175.0
  - @voyant-travel/finance@0.176.0
  - @voyant-travel/inventory@0.14.7
  - @voyant-travel/types@0.109.7
  - @voyant-travel/inventory-react@0.58.0
  - @voyant-travel/distribution-react@0.166.0
  - @voyant-travel/finance-react@0.176.0
  - @voyant-travel/identity-react@0.176.0
  - @voyant-travel/legal-react@0.176.0
  - @voyant-travel/operations-react@0.57.0
  - @voyant-travel/catalog-react@0.174.0
  - @voyant-travel/commerce-react@0.58.0
  - @voyant-travel/relationships-react@0.176.0

## 0.175.0

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/bookings@0.175.0
  - @voyant-travel/storefront-react@0.177.0
  - @voyant-travel/accommodations@0.135.0
  - @voyant-travel/catalog@0.173.0
  - @voyant-travel/cruises@0.174.0
  - @voyant-travel/finance@0.175.0
  - @voyant-travel/inventory@0.14.6
  - @voyant-travel/types@0.109.6
  - @voyant-travel/inventory-react@0.57.0
  - @voyant-travel/distribution-react@0.165.0
  - @voyant-travel/finance-react@0.175.0
  - @voyant-travel/identity-react@0.175.0
  - @voyant-travel/legal-react@0.175.0
  - @voyant-travel/operations-react@0.56.0
  - @voyant-travel/catalog-react@0.173.0
  - @voyant-travel/commerce-react@0.57.0
  - @voyant-travel/relationships-react@0.175.0

## 0.174.0

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/bookings@0.174.0
  - @voyant-travel/finance@0.174.0
  - @voyant-travel/accommodations@0.134.0
  - @voyant-travel/catalog@0.172.0
  - @voyant-travel/cruises@0.173.0
  - @voyant-travel/inventory@0.14.5
  - @voyant-travel/finance-react@0.174.0
  - @voyant-travel/inventory-react@0.56.0
  - @voyant-travel/distribution-react@0.164.0
  - @voyant-travel/identity-react@0.174.0
  - @voyant-travel/legal-react@0.174.0
  - @voyant-travel/operations-react@0.55.0
  - @voyant-travel/catalog-react@0.172.0
  - @voyant-travel/commerce-react@0.56.0
  - @voyant-travel/storefront-react@0.176.0
  - @voyant-travel/relationships-react@0.174.0

## 0.173.0

### Patch Changes

- @voyant-travel/storefront-react@0.175.0
- @voyant-travel/inventory-react@0.55.0
- @voyant-travel/distribution-react@0.163.0
- @voyant-travel/finance-react@0.173.0
- @voyant-travel/identity-react@0.173.0
- @voyant-travel/legal-react@0.173.0
- @voyant-travel/operations-react@0.54.0
- @voyant-travel/catalog-react@0.171.0
- @voyant-travel/commerce-react@0.55.0
- @voyant-travel/relationships-react@0.173.0
- @voyant-travel/bookings@0.173.0
- @voyant-travel/catalog@0.171.0
- @voyant-travel/cruises@0.172.0
- @voyant-travel/finance@0.173.0
- @voyant-travel/accommodations@0.133.0
- @voyant-travel/inventory@0.14.4

## 0.172.0

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/bookings@0.172.0
  - @voyant-travel/finance@0.172.0
  - @voyant-travel/accommodations@0.132.0
  - @voyant-travel/catalog@0.170.0
  - @voyant-travel/cruises@0.171.0
  - @voyant-travel/inventory@0.14.3
  - @voyant-travel/finance-react@0.172.0
  - @voyant-travel/inventory-react@0.54.0
  - @voyant-travel/storefront-react@0.174.0
  - @voyant-travel/commerce-react@0.54.0
  - @voyant-travel/legal-react@0.172.0
  - @voyant-travel/relationships-react@0.172.0
  - @voyant-travel/ui@0.109.3
  - @voyant-travel/distribution-react@0.162.0
  - @voyant-travel/identity-react@0.172.0
  - @voyant-travel/operations-react@0.53.0
  - @voyant-travel/catalog-react@0.170.0

## 0.171.2

### Patch Changes

- Updated dependencies [1881293]
  - @voyant-travel/bookings@0.171.2
  - @voyant-travel/finance@0.171.2
  - @voyant-travel/finance-react@0.171.2

## 0.171.1

### Patch Changes

- @voyant-travel/accommodations@0.131.1
- @voyant-travel/bookings@0.171.1
- @voyant-travel/catalog@0.169.1
- @voyant-travel/cruises@0.170.1
- @voyant-travel/finance@0.171.1
- @voyant-travel/inventory@0.14.2
- @voyant-travel/catalog-react@0.169.1
- @voyant-travel/distribution-react@0.161.1
- @voyant-travel/finance-react@0.171.1
- @voyant-travel/identity-react@0.171.1
- @voyant-travel/legal-react@0.171.1
- @voyant-travel/storefront-react@0.173.1

## 0.171.0

### Patch Changes

- Updated dependencies [d2d7384]
  - @voyant-travel/finance@0.171.0
  - @voyant-travel/accommodations@0.131.0
  - @voyant-travel/catalog@0.169.0
  - @voyant-travel/cruises@0.170.0
  - @voyant-travel/finance-react@0.171.0
  - @voyant-travel/inventory@0.14.1
  - @voyant-travel/inventory-react@0.53.0
  - @voyant-travel/distribution-react@0.161.0
  - @voyant-travel/identity-react@0.171.0
  - @voyant-travel/legal-react@0.171.0
  - @voyant-travel/operations-react@0.52.0
  - @voyant-travel/catalog-react@0.169.0
  - @voyant-travel/commerce-react@0.53.0
  - @voyant-travel/relationships-react@0.171.0
  - @voyant-travel/storefront-react@0.173.0
  - @voyant-travel/bookings@0.171.0

## 0.170.0

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/i18n@0.112.1
  - @voyant-travel/inventory@0.14.0
  - @voyant-travel/legal-react@0.170.0
  - @voyant-travel/accommodations@0.130.0
  - @voyant-travel/bookings@0.170.0
  - @voyant-travel/catalog@0.168.0
  - @voyant-travel/cruises@0.169.0
  - @voyant-travel/finance@0.170.0
  - @voyant-travel/inventory-react@0.52.0
  - @voyant-travel/storefront-react@0.172.0
  - @voyant-travel/distribution-react@0.160.0
  - @voyant-travel/finance-react@0.170.0
  - @voyant-travel/identity-react@0.170.0
  - @voyant-travel/operations-react@0.51.0
  - @voyant-travel/catalog-react@0.168.0
  - @voyant-travel/commerce-react@0.52.0
  - @voyant-travel/relationships-react@0.170.0

## 0.169.1

### Patch Changes

- @voyant-travel/accommodations@0.129.1
- @voyant-travel/bookings@0.169.1
- @voyant-travel/catalog@0.167.1
- @voyant-travel/cruises@0.168.1
- @voyant-travel/finance@0.169.2
- @voyant-travel/inventory@0.13.7
- @voyant-travel/catalog-react@0.167.1
- @voyant-travel/distribution-react@0.159.1
- @voyant-travel/finance-react@0.169.2
- @voyant-travel/identity-react@0.169.1
- @voyant-travel/legal-react@0.169.1
- @voyant-travel/storefront-react@0.171.1

## 0.169.0

### Patch Changes

- Updated dependencies [a461920]
- Updated dependencies [a461920]
- Updated dependencies [590d256]
  - @voyant-travel/admin@0.127.0
  - @voyant-travel/finance@0.169.0
  - @voyant-travel/inventory@0.13.6
  - @voyant-travel/catalog-react@0.167.0
  - @voyant-travel/commerce-react@0.51.0
  - @voyant-travel/distribution-react@0.159.0
  - @voyant-travel/finance-react@0.169.0
  - @voyant-travel/inventory-react@0.51.0
  - @voyant-travel/legal-react@0.169.0
  - @voyant-travel/operations-react@0.50.0
  - @voyant-travel/relationships-react@0.169.0
  - @voyant-travel/storefront-react@0.171.0
  - @voyant-travel/identity-react@0.169.0
  - @voyant-travel/bookings@0.169.0
  - @voyant-travel/catalog@0.167.0
  - @voyant-travel/cruises@0.168.0
  - @voyant-travel/accommodations@0.129.0

## 0.168.0

### Patch Changes

- Updated dependencies [158c3a0]
  - @voyant-travel/finance@0.168.0
  - @voyant-travel/finance-react@0.168.0
  - @voyant-travel/accommodations@0.128.0
  - @voyant-travel/catalog@0.166.0
  - @voyant-travel/cruises@0.167.0
  - @voyant-travel/inventory@0.13.5
  - @voyant-travel/inventory-react@0.50.0
  - @voyant-travel/distribution-react@0.158.0
  - @voyant-travel/identity-react@0.168.0
  - @voyant-travel/legal-react@0.168.0
  - @voyant-travel/operations-react@0.49.0
  - @voyant-travel/catalog-react@0.166.0
  - @voyant-travel/commerce-react@0.50.0
  - @voyant-travel/relationships-react@0.168.0
  - @voyant-travel/storefront-react@0.170.0
  - @voyant-travel/bookings@0.168.0

## 0.167.0

### Patch Changes

- Updated dependencies [ca3713e]
  - @voyant-travel/finance@0.167.0
  - @voyant-travel/commerce-react@0.49.0
  - @voyant-travel/inventory@0.13.4
  - @voyant-travel/accommodations@0.127.0
  - @voyant-travel/catalog@0.165.0
  - @voyant-travel/cruises@0.166.0
  - @voyant-travel/finance-react@0.167.0
  - @voyant-travel/inventory-react@0.49.0
  - @voyant-travel/catalog-react@0.165.0
  - @voyant-travel/legal-react@0.167.0
  - @voyant-travel/distribution-react@0.157.0
  - @voyant-travel/identity-react@0.167.0
  - @voyant-travel/operations-react@0.48.0
  - @voyant-travel/storefront-react@0.169.0
  - @voyant-travel/relationships-react@0.167.0
  - @voyant-travel/bookings@0.167.0

## 0.166.0

### Patch Changes

- Updated dependencies [c3bdcbc]
- Updated dependencies [0868f18]
- Updated dependencies [3062a73]
- Updated dependencies [926ea47]
  - @voyant-travel/finance@0.166.0
  - @voyant-travel/admin@0.126.2
  - @voyant-travel/finance-react@0.166.0
  - @voyant-travel/i18n@0.112.0
  - @voyant-travel/commerce-react@0.48.0
  - @voyant-travel/inventory@0.13.3
  - @voyant-travel/accommodations@0.126.0
  - @voyant-travel/catalog@0.164.0
  - @voyant-travel/cruises@0.165.0
  - @voyant-travel/inventory-react@0.48.0
  - @voyant-travel/catalog-react@0.164.0
  - @voyant-travel/distribution-react@0.156.0
  - @voyant-travel/identity-react@0.166.0
  - @voyant-travel/legal-react@0.166.0
  - @voyant-travel/operations-react@0.47.0
  - @voyant-travel/relationships-react@0.166.0
  - @voyant-travel/storefront-react@0.168.0
  - @voyant-travel/bookings@0.166.0

## 0.165.0

### Patch Changes

- Updated dependencies [d6a9973]
  - @voyant-travel/finance@0.165.0
  - @voyant-travel/accommodations@0.125.0
  - @voyant-travel/catalog@0.163.0
  - @voyant-travel/cruises@0.164.0
  - @voyant-travel/finance-react@0.165.0
  - @voyant-travel/inventory@0.13.2
  - @voyant-travel/inventory-react@0.47.0
  - @voyant-travel/distribution-react@0.155.0
  - @voyant-travel/identity-react@0.165.0
  - @voyant-travel/legal-react@0.165.0
  - @voyant-travel/operations-react@0.46.0
  - @voyant-travel/catalog-react@0.163.0
  - @voyant-travel/commerce-react@0.47.0
  - @voyant-travel/relationships-react@0.165.0
  - @voyant-travel/storefront-react@0.167.0
  - @voyant-travel/bookings@0.165.0

## 0.164.0

### Patch Changes

- Updated dependencies [fc3224a]
  - @voyant-travel/catalog@0.162.0
  - @voyant-travel/accommodations@0.124.0
  - @voyant-travel/cruises@0.163.0
  - @voyant-travel/inventory@0.13.1
  - @voyant-travel/distribution-react@0.154.0
  - @voyant-travel/finance-react@0.164.0
  - @voyant-travel/identity-react@0.164.0
  - @voyant-travel/legal-react@0.164.0
  - @voyant-travel/operations-react@0.45.0
  - @voyant-travel/catalog-react@0.162.0
  - @voyant-travel/commerce-react@0.46.0
  - @voyant-travel/inventory-react@0.46.0
  - @voyant-travel/relationships-react@0.164.0
  - @voyant-travel/storefront-react@0.166.0
  - @voyant-travel/bookings@0.164.0
  - @voyant-travel/finance@0.164.0

## 0.163.0

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/bookings@0.163.0
  - @voyant-travel/finance@0.163.0
  - @voyant-travel/relationships-react@0.163.0
  - @voyant-travel/accommodations@0.123.0
  - @voyant-travel/catalog@0.161.0
  - @voyant-travel/cruises@0.162.0
  - @voyant-travel/inventory@0.13.0
  - @voyant-travel/distribution-react@0.153.0
  - @voyant-travel/identity-react@0.163.0
  - @voyant-travel/legal-react@0.163.0
  - @voyant-travel/finance-react@0.163.0
  - @voyant-travel/operations-react@0.44.0
  - @voyant-travel/inventory-react@0.45.0
  - @voyant-travel/storefront-react@0.165.0
  - @voyant-travel/catalog-react@0.161.0
  - @voyant-travel/commerce-react@0.45.0

## 0.162.2

### Patch Changes

- 7a7fd97: Strengthen the internationalization platform across the operator and package UI.

  Add ICU message formatting, explicit locale and time-zone formatters, hierarchical
  locale fallback, validated runtime overrides, account-authoritative preferences,
  localized setup and navigation surfaces, and fail-closed catalog and UI-literal
  checks. Package message providers now accept an optional time zone and expose the
  shared formatting capabilities to package-owned UI.

- Updated dependencies [7a7fd97]
  - @voyant-travel/admin@0.126.1
  - @voyant-travel/catalog-react@0.160.1
  - @voyant-travel/commerce-react@0.44.1
  - @voyant-travel/distribution-react@0.152.1
  - @voyant-travel/finance-react@0.162.2
  - @voyant-travel/i18n@0.111.3
  - @voyant-travel/identity-react@0.162.1
  - @voyant-travel/inventory-react@0.44.1
  - @voyant-travel/legal-react@0.162.2
  - @voyant-travel/operations-react@0.43.1
  - @voyant-travel/relationships-react@0.162.1
  - @voyant-travel/bookings@0.162.2
  - @voyant-travel/catalog@0.160.1
  - @voyant-travel/cruises@0.161.1
  - @voyant-travel/finance@0.162.2

## 0.162.1

### Patch Changes

- Updated dependencies [5941d2c]
  - @voyant-travel/i18n@0.111.2
  - @voyant-travel/bookings@0.162.1
  - @voyant-travel/finance@0.162.1
  - @voyant-travel/inventory@0.12.1
  - @voyant-travel/finance-react@0.162.1
  - @voyant-travel/legal-react@0.162.1

## 0.162.0

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/accommodations@0.122.0
  - @voyant-travel/bookings@0.162.0
  - @voyant-travel/catalog@0.160.0
  - @voyant-travel/cruises@0.161.0
  - @voyant-travel/finance@0.162.0
  - @voyant-travel/inventory@0.12.0
  - @voyant-travel/storefront-react@0.164.0
  - @voyant-travel/commerce-react@0.44.0
  - @voyant-travel/distribution-react@0.152.0
  - @voyant-travel/finance-react@0.162.0
  - @voyant-travel/inventory-react@0.44.0
  - @voyant-travel/identity-react@0.162.0
  - @voyant-travel/legal-react@0.162.0
  - @voyant-travel/operations-react@0.43.0
  - @voyant-travel/relationships-react@0.162.0
  - @voyant-travel/catalog-react@0.160.0

## 0.161.0

### Patch Changes

- Updated dependencies [c1e37f2]
- Updated dependencies [85bfe2c]
  - @voyant-travel/admin@0.126.0
  - @voyant-travel/finance@0.161.0
  - @voyant-travel/catalog-react@0.159.0
  - @voyant-travel/commerce-react@0.43.0
  - @voyant-travel/distribution-react@0.151.0
  - @voyant-travel/finance-react@0.161.0
  - @voyant-travel/inventory-react@0.43.0
  - @voyant-travel/legal-react@0.161.0
  - @voyant-travel/operations-react@0.42.0
  - @voyant-travel/relationships-react@0.161.0
  - @voyant-travel/storefront-react@0.163.0
  - @voyant-travel/identity-react@0.161.0
  - @voyant-travel/bookings@0.161.0
  - @voyant-travel/catalog@0.159.0
  - @voyant-travel/cruises@0.160.0
  - @voyant-travel/accommodations@0.121.0
  - @voyant-travel/inventory@0.11.1

## 0.160.0

### Patch Changes

- Updated dependencies [5617f37]
- Updated dependencies [701ccc4]
- Updated dependencies [5f15e2e]
- Updated dependencies [7ac40a0]
- Updated dependencies [372f4f4]
- Updated dependencies [a2fd806]
- Updated dependencies [7e4ab07]
- Updated dependencies [497dff2]
- Updated dependencies [db5adce]
- Updated dependencies [6604f9e]
- Updated dependencies [0297ef5]
  - @voyant-travel/accommodations@0.120.0
  - @voyant-travel/bookings@0.160.0
  - @voyant-travel/finance@0.160.0
  - @voyant-travel/catalog@0.158.0
  - @voyant-travel/inventory@0.11.0
  - @voyant-travel/cruises@0.159.0
  - @voyant-travel/storefront-react@0.162.0
  - @voyant-travel/finance-react@0.160.0
  - @voyant-travel/inventory-react@0.42.0
  - @voyant-travel/commerce-react@0.42.0
  - @voyant-travel/operations-react@0.41.0
  - @voyant-travel/distribution-react@0.150.0
  - @voyant-travel/identity-react@0.160.0
  - @voyant-travel/legal-react@0.160.0
  - @voyant-travel/relationships-react@0.160.0
  - @voyant-travel/catalog-react@0.158.0

## 0.159.0

### Patch Changes

- 49f55d0: Keep catalog booking and checkout as a two-phase flow, and atomically convert
  owned-product availability holds into on-hold booking allocations without
  consuming capacity twice. Hold placement and release are now idempotent across
  retries and duplicate tokens, converted holds retain an audit link to their
  booking allocation, and checkout-only intents receive structured validation
  errors from the reservation route.
- b459761: Accept current Lucide releases in public peer ranges so the standard Operator package closure
  resolves for external npm consumers.
- Updated dependencies [766d24b]
- Updated dependencies [7e9f77a]
- Updated dependencies [49f55d0]
- Updated dependencies [82ffd12]
- Updated dependencies [552acbf]
- Updated dependencies [9c85101]
- Updated dependencies [6147b93]
- Updated dependencies [b459761]
  - @voyant-travel/ui@0.109.2
  - @voyant-travel/distribution-react@0.149.0
  - @voyant-travel/inventory-react@0.41.0
  - @voyant-travel/admin@0.125.0
  - @voyant-travel/bookings@0.159.0
  - @voyant-travel/catalog@0.157.0
  - @voyant-travel/catalog-contracts@0.111.1
  - @voyant-travel/finance@0.159.0
  - @voyant-travel/inventory@0.10.4
  - @voyant-travel/commerce-react@0.41.0
  - @voyant-travel/finance-react@0.159.0
  - @voyant-travel/storefront-react@0.161.0
  - @voyant-travel/operations-react@0.40.0
  - @voyant-travel/catalog-react@0.157.0
  - @voyant-travel/identity-react@0.159.0
  - @voyant-travel/legal-react@0.159.0
  - @voyant-travel/relationships-react@0.159.0
  - @voyant-travel/accommodations@0.119.0
  - @voyant-travel/cruises@0.158.0

## 0.158.0

### Patch Changes

- 73ab096: Standardize first-party packages on package-owned deployment manifests, provider selection,
  access metadata, concrete event contracts, selected admin navigation, and published runtime
  references. Add Bookings Extras as an independently selected graph unit and remove the central
  admin navigation catalog.
  Link facets now distinguish entity `linkable` metadata from executable `definition` exports, and
  generated Node registries reject malformed definitions before service registration.
  Provider-owned required config and secrets now apply only when that provider is selected, so
  local and in-memory deployments do not require credentials for inactive remote providers.
- Updated dependencies [73ab096]
  - @voyant-travel/admin@0.124.0
  - @voyant-travel/bookings@0.158.0
  - @voyant-travel/distribution-react@0.148.0
  - @voyant-travel/finance-react@0.158.0
  - @voyant-travel/accommodations@0.118.0
  - @voyant-travel/catalog@0.156.0
  - @voyant-travel/catalog-react@0.156.0
  - @voyant-travel/commerce-react@0.40.0
  - @voyant-travel/cruises@0.157.0
  - @voyant-travel/finance@0.158.0
  - @voyant-travel/identity-react@0.158.0
  - @voyant-travel/inventory@0.10.3
  - @voyant-travel/inventory-react@0.40.0
  - @voyant-travel/legal-react@0.158.0
  - @voyant-travel/operations-react@0.39.0
  - @voyant-travel/relationships-react@0.158.0
  - @voyant-travel/types@0.109.2
  - @voyant-travel/storefront-react@0.160.0

## 0.157.0

### Patch Changes

- Updated dependencies [0808b21]
  - @voyant-travel/catalog-contracts@0.111.0
  - @voyant-travel/catalog@0.155.0
  - @voyant-travel/catalog-react@0.155.0
  - @voyant-travel/storefront-react@0.159.0
  - @voyant-travel/inventory-react@0.39.0
  - @voyant-travel/distribution-react@0.147.0
  - @voyant-travel/finance-react@0.157.0
  - @voyant-travel/identity-react@0.157.0
  - @voyant-travel/legal-react@0.157.0
  - @voyant-travel/operations-react@0.38.0
  - @voyant-travel/commerce-react@0.39.0
  - @voyant-travel/relationships-react@0.157.0
  - @voyant-travel/bookings@0.157.0
  - @voyant-travel/cruises@0.156.0
  - @voyant-travel/finance@0.157.0
  - @voyant-travel/accommodations@0.117.0
  - @voyant-travel/inventory@0.10.2

## 0.156.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [7916020]
- Updated dependencies [8d62a7c]
  - @voyant-travel/commerce-react@0.38.1
  - @voyant-travel/types@0.109.1
  - @voyant-travel/catalog@0.154.1
  - @voyant-travel/accommodations@0.116.1
  - @voyant-travel/admin@0.123.3
  - @voyant-travel/bookings@0.156.1
  - @voyant-travel/catalog-contracts@0.110.1
  - @voyant-travel/catalog-react@0.154.1
  - @voyant-travel/cruises@0.155.1
  - @voyant-travel/distribution-react@0.146.1
  - @voyant-travel/finance@0.156.1
  - @voyant-travel/finance-react@0.156.1
  - @voyant-travel/i18n@0.111.1
  - @voyant-travel/identity-react@0.156.1
  - @voyant-travel/inventory@0.10.1
  - @voyant-travel/inventory-react@0.38.1
  - @voyant-travel/legal-react@0.156.1
  - @voyant-travel/operations-react@0.37.1
  - @voyant-travel/react@0.104.2
  - @voyant-travel/relationships-react@0.156.1
  - @voyant-travel/storefront-react@0.158.1
  - @voyant-travel/ui@0.109.1

## 0.156.0

### Minor Changes

- bbe6396: Replace the overloaded Finance voucher domain with Travel Credits across the
  database schema, APIs, package exports, booking inputs, storefront settings,
  and operator UI. Redemption commands are replay-safe, codes are normalized and
  case-insensitively unique, and legacy records migrate in place without silently
  skipping invalid balances. Keep Promotion Codes in Commerce and move Bookings
  fulfillment to the explicit Service Voucher vocabulary.

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/finance@0.156.0
  - @voyant-travel/finance-react@0.156.0
  - @voyant-travel/bookings@0.156.0
  - @voyant-travel/catalog-contracts@0.110.0
  - @voyant-travel/inventory@0.10.0
  - @voyant-travel/i18n@0.111.0
  - @voyant-travel/storefront-react@0.158.0
  - @voyant-travel/accommodations@0.116.0
  - @voyant-travel/catalog@0.154.0
  - @voyant-travel/cruises@0.155.0
  - @voyant-travel/inventory-react@0.38.0
  - @voyant-travel/distribution-react@0.146.0
  - @voyant-travel/identity-react@0.156.0
  - @voyant-travel/legal-react@0.156.0
  - @voyant-travel/operations-react@0.37.0
  - @voyant-travel/catalog-react@0.154.0
  - @voyant-travel/admin@0.123.2
  - @voyant-travel/commerce-react@0.38.0
  - @voyant-travel/relationships-react@0.156.0

## 0.155.2

### Patch Changes

- Updated dependencies [d83d237]
  - @voyant-travel/admin@0.123.1
  - @voyant-travel/bookings@0.155.2
  - @voyant-travel/finance@0.155.2
  - @voyant-travel/storefront-react@0.157.2
  - @voyant-travel/finance-react@0.155.2

## 0.155.1

### Patch Changes

- Updated dependencies [cc85042]
  - @voyant-travel/bookings@0.155.1
  - @voyant-travel/finance@0.155.1
  - @voyant-travel/inventory@0.9.3
  - @voyant-travel/accommodations@0.115.1
  - @voyant-travel/catalog@0.153.1
  - @voyant-travel/cruises@0.154.1
  - @voyant-travel/catalog-react@0.153.1
  - @voyant-travel/distribution-react@0.145.1
  - @voyant-travel/finance-react@0.155.1
  - @voyant-travel/identity-react@0.155.1
  - @voyant-travel/legal-react@0.155.1
  - @voyant-travel/storefront-react@0.157.1

## 0.155.0

### Patch Changes

- @voyant-travel/legal-react@0.155.0
- @voyant-travel/accommodations@0.115.0
- @voyant-travel/bookings@0.155.0
- @voyant-travel/catalog@0.153.0
- @voyant-travel/cruises@0.154.0
- @voyant-travel/finance@0.155.0
- @voyant-travel/inventory@0.9.2
- @voyant-travel/storefront-react@0.157.0
- @voyant-travel/inventory-react@0.37.0
- @voyant-travel/distribution-react@0.145.0
- @voyant-travel/finance-react@0.155.0
- @voyant-travel/identity-react@0.155.0
- @voyant-travel/operations-react@0.36.0
- @voyant-travel/catalog-react@0.153.0
- @voyant-travel/commerce-react@0.37.0
- @voyant-travel/relationships-react@0.155.0

## 0.154.0

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [8bd906f]
  - @voyant-travel/types@0.109.0
  - @voyant-travel/finance@0.154.0
  - @voyant-travel/ui@0.109.0
  - @voyant-travel/legal-react@0.154.0
  - @voyant-travel/accommodations@0.114.0
  - @voyant-travel/bookings@0.154.0
  - @voyant-travel/catalog@0.152.0
  - @voyant-travel/cruises@0.153.0
  - @voyant-travel/inventory@0.9.1
  - @voyant-travel/admin@0.123.0
  - @voyant-travel/commerce-react@0.36.0
  - @voyant-travel/distribution-react@0.144.0
  - @voyant-travel/finance-react@0.154.0
  - @voyant-travel/identity-react@0.154.0
  - @voyant-travel/inventory-react@0.36.0
  - @voyant-travel/operations-react@0.35.0
  - @voyant-travel/relationships-react@0.154.0
  - @voyant-travel/catalog-react@0.152.0
  - @voyant-travel/storefront-react@0.156.0

## 0.153.0

### Minor Changes

- 490d132: Add a package-owned storefront booking journey with public checkout, contract
  preview, payment-policy resolution, route callbacks, localized messages, and
  market scope inputs.

### Patch Changes

- 490d132: Move the customer booking page and vertical summary orchestration into the package-owned storefront surface.
- 490d132: Remove the final Operator admin factory compatibility registry by composing cross-domain behavior through package-owned selected graph slots and contributions.
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [282892e]
- Updated dependencies [490d132]
  - @voyant-travel/bookings@0.153.0
  - @voyant-travel/finance@0.153.0
  - @voyant-travel/cruises@0.152.0
  - @voyant-travel/accommodations@0.113.0
  - @voyant-travel/inventory@0.9.0
  - @voyant-travel/catalog@0.151.0
  - @voyant-travel/admin@0.122.0
  - @voyant-travel/commerce-react@0.35.0
  - @voyant-travel/distribution-react@0.143.0
  - @voyant-travel/finance-react@0.153.0
  - @voyant-travel/legal-react@0.153.0
  - @voyant-travel/operations-react@0.34.0
  - @voyant-travel/relationships-react@0.153.0
  - @voyant-travel/storefront-react@0.155.0
  - @voyant-travel/catalog-react@0.151.0
  - @voyant-travel/inventory-react@0.35.0
  - @voyant-travel/types@0.108.1
  - @voyant-travel/identity-react@0.153.0

## 0.152.0

### Patch Changes

- Updated dependencies [d771be3]
- Updated dependencies [d771be3]
  - @voyant-travel/types@0.108.0
  - @voyant-travel/bookings@0.152.0
  - @voyant-travel/admin@0.121.0
  - @voyant-travel/commerce-react@0.34.0
  - @voyant-travel/relationships-react@0.152.0
  - @voyant-travel/distribution-react@0.142.0
  - @voyant-travel/finance-react@0.152.0
  - @voyant-travel/identity-react@0.152.0
  - @voyant-travel/inventory-react@0.34.0
  - @voyant-travel/legal-react@0.152.0
  - @voyant-travel/operations-react@0.33.0
  - @voyant-travel/catalog-react@0.150.0

## 0.151.5

### Patch Changes

- Updated dependencies [e5aa097]
- Updated dependencies [01d5034]
  - @voyant-travel/bookings@0.151.5
  - @voyant-travel/catalog-react@0.149.4
  - @voyant-travel/distribution-react@0.141.5
  - @voyant-travel/finance-react@0.151.4
  - @voyant-travel/identity-react@0.151.4
  - @voyant-travel/legal-react@0.151.4

## 0.151.4

### Patch Changes

- @voyant-travel/bookings@0.151.4
- @voyant-travel/types@0.107.3
- @voyant-travel/catalog-react@0.149.3
- @voyant-travel/distribution-react@0.141.4
- @voyant-travel/finance-react@0.151.3
- @voyant-travel/identity-react@0.151.3
- @voyant-travel/legal-react@0.151.3

## 0.151.3

### Patch Changes

- @voyant-travel/bookings@0.151.3
- @voyant-travel/catalog-react@0.149.2
- @voyant-travel/distribution-react@0.141.3
- @voyant-travel/finance-react@0.151.2
- @voyant-travel/identity-react@0.151.2
- @voyant-travel/legal-react@0.151.2

## 0.151.2

### Patch Changes

- @voyant-travel/bookings@0.151.2
- @voyant-travel/distribution-react@0.141.2

## 0.151.1

### Patch Changes

- Updated dependencies [e4e6621]
  - @voyant-travel/bookings@0.151.1
  - @voyant-travel/catalog-react@0.149.1
  - @voyant-travel/distribution-react@0.141.1
  - @voyant-travel/finance-react@0.151.1
  - @voyant-travel/identity-react@0.151.1
  - @voyant-travel/legal-react@0.151.1

## 0.151.0

### Patch Changes

- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/bookings@0.151.0
  - @voyant-travel/commerce-react@0.33.0
  - @voyant-travel/inventory-react@0.33.0
  - @voyant-travel/legal-react@0.151.0
  - @voyant-travel/finance-react@0.151.0
  - @voyant-travel/distribution-react@0.141.0
  - @voyant-travel/types@0.107.2
  - @voyant-travel/relationships-react@0.151.0
  - @voyant-travel/operations-react@0.32.0
  - @voyant-travel/identity-react@0.151.0
  - @voyant-travel/catalog-react@0.149.0

## 0.150.0

### Patch Changes

- Updated dependencies [496f2ef]
  - @voyant-travel/bookings@0.150.0
  - @voyant-travel/distribution-react@0.140.0
  - @voyant-travel/finance-react@0.150.0
  - @voyant-travel/identity-react@0.150.0
  - @voyant-travel/legal-react@0.150.0
  - @voyant-travel/operations-react@0.31.0
  - @voyant-travel/catalog-react@0.148.0
  - @voyant-travel/commerce-react@0.32.0
  - @voyant-travel/inventory-react@0.32.0
  - @voyant-travel/relationships-react@0.150.0

## 0.149.1

### Patch Changes

- Updated dependencies [5e1d221]
  - @voyant-travel/bookings@0.149.1
  - @voyant-travel/catalog-react@0.147.1
  - @voyant-travel/distribution-react@0.139.1
  - @voyant-travel/finance-react@0.149.1
  - @voyant-travel/identity-react@0.149.1
  - @voyant-travel/legal-react@0.149.1

## 0.149.0

### Patch Changes

- Updated dependencies [a97e845]
  - @voyant-travel/admin@0.120.0
  - @voyant-travel/catalog-react@0.147.0
  - @voyant-travel/commerce-react@0.31.0
  - @voyant-travel/distribution-react@0.139.0
  - @voyant-travel/finance-react@0.149.0
  - @voyant-travel/inventory-react@0.31.0
  - @voyant-travel/legal-react@0.149.0
  - @voyant-travel/operations-react@0.30.0
  - @voyant-travel/relationships-react@0.149.0
  - @voyant-travel/identity-react@0.149.0
  - @voyant-travel/bookings@0.149.0

## 0.148.0

### Patch Changes

- Updated dependencies [8a665f3]
  - @voyant-travel/admin@0.119.0
  - @voyant-travel/catalog-react@0.146.0
  - @voyant-travel/commerce-react@0.30.0
  - @voyant-travel/distribution-react@0.138.0
  - @voyant-travel/finance-react@0.148.0
  - @voyant-travel/inventory-react@0.30.0
  - @voyant-travel/legal-react@0.148.0
  - @voyant-travel/operations-react@0.29.0
  - @voyant-travel/relationships-react@0.148.0
  - @voyant-travel/identity-react@0.148.0
  - @voyant-travel/bookings@0.148.0

## 0.147.0

### Patch Changes

- @voyant-travel/admin@0.118.0
- @voyant-travel/catalog-react@0.145.0
- @voyant-travel/commerce-react@0.29.0
- @voyant-travel/distribution-react@0.137.0
- @voyant-travel/finance-react@0.147.0
- @voyant-travel/inventory-react@0.29.0
- @voyant-travel/legal-react@0.147.0
- @voyant-travel/operations-react@0.28.0
- @voyant-travel/relationships-react@0.147.0
- @voyant-travel/identity-react@0.147.0
- @voyant-travel/bookings@0.147.0

## 0.146.0

### Patch Changes

- Updated dependencies [ecdf0fc]
  - @voyant-travel/admin@0.117.0
  - @voyant-travel/catalog-react@0.144.0
  - @voyant-travel/commerce-react@0.28.0
  - @voyant-travel/distribution-react@0.136.0
  - @voyant-travel/finance-react@0.146.0
  - @voyant-travel/inventory-react@0.28.0
  - @voyant-travel/legal-react@0.146.0
  - @voyant-travel/operations-react@0.27.0
  - @voyant-travel/relationships-react@0.146.0
  - @voyant-travel/identity-react@0.146.0
  - @voyant-travel/bookings@0.146.0

## 0.145.0

### Patch Changes

- Updated dependencies [4829ef3]
  - @voyant-travel/catalog-contracts@0.109.0
  - @voyant-travel/catalog-react@0.143.0
  - @voyant-travel/bookings@0.145.0
  - @voyant-travel/distribution-react@0.135.0
  - @voyant-travel/inventory-react@0.27.0
  - @voyant-travel/finance-react@0.145.0
  - @voyant-travel/identity-react@0.145.0
  - @voyant-travel/legal-react@0.145.0
  - @voyant-travel/operations-react@0.26.0
  - @voyant-travel/commerce-react@0.27.0
  - @voyant-travel/relationships-react@0.145.0

## 0.144.0

### Patch Changes

- Updated dependencies [ba6c30a]
  - @voyant-travel/bookings@0.144.0
  - @voyant-travel/distribution-react@0.134.0
  - @voyant-travel/finance-react@0.144.0
  - @voyant-travel/identity-react@0.144.0
  - @voyant-travel/legal-react@0.144.0
  - @voyant-travel/operations-react@0.25.0
  - @voyant-travel/catalog-react@0.142.0
  - @voyant-travel/commerce-react@0.26.0
  - @voyant-travel/inventory-react@0.26.0
  - @voyant-travel/relationships-react@0.144.0

## 0.143.0

### Patch Changes

- @voyant-travel/bookings@0.143.0
- @voyant-travel/commerce-react@0.25.0
- @voyant-travel/inventory-react@0.25.0
- @voyant-travel/legal-react@0.143.0
- @voyant-travel/relationships-react@0.143.0
- @voyant-travel/ui@0.108.11
- @voyant-travel/types@0.107.1
- @voyant-travel/catalog-react@0.141.0
- @voyant-travel/distribution-react@0.133.0
- @voyant-travel/finance-react@0.143.0
- @voyant-travel/identity-react@0.143.0
- @voyant-travel/operations-react@0.24.0

## 0.142.1

### Patch Changes

- 14432a7: Make the booking journey's default phone country configurable via a new `defaultPhoneCountry` prop, with a locale-derived region fallback and GB only as the last resort instead of always defaulting to the UK.
  - @voyant-travel/bookings@0.142.1

## 0.142.0

### Patch Changes

- @voyant-travel/commerce-react@0.24.0
- @voyant-travel/catalog-react@0.140.0
- @voyant-travel/legal-react@0.142.0
- @voyant-travel/distribution-react@0.132.0
- @voyant-travel/finance-react@0.142.0
- @voyant-travel/identity-react@0.142.0
- @voyant-travel/operations-react@0.23.0
- @voyant-travel/inventory-react@0.24.0
- @voyant-travel/relationships-react@0.142.0
- @voyant-travel/bookings@0.142.0

## 0.141.3

### Patch Changes

- 161dedf: Format the booking journey side panel stay date range and check-in/check-out rows with locale-aware dates instead of raw ISO strings
  - @voyant-travel/bookings@0.141.3

## 0.141.2

### Patch Changes

- e6cad60: Route reusable upload and payment-link actions through the Voyant React provider API base and fetcher so split-origin deployments do not fall back to relative `/api` URLs.
- Updated dependencies [e6cad60]
  - @voyant-travel/finance-react@0.141.1
  - @voyant-travel/inventory-react@0.23.1
  - @voyant-travel/bookings@0.141.2

## 0.141.1

### Patch Changes

- aa27c44: Reject malformed booking draft email addresses in contracts and gate the booking journey when billing or traveler emails are syntactically invalid.
- Updated dependencies [aa27c44]
  - @voyant-travel/catalog-contracts@0.108.2
  - @voyant-travel/bookings@0.141.1

## 0.141.0

### Patch Changes

- Updated dependencies [6711f4c]
  - @voyant-travel/catalog-react@0.139.0
  - @voyant-travel/inventory-react@0.23.0
  - @voyant-travel/distribution-react@0.131.0
  - @voyant-travel/finance-react@0.141.0
  - @voyant-travel/identity-react@0.141.0
  - @voyant-travel/legal-react@0.141.0
  - @voyant-travel/operations-react@0.22.0
  - @voyant-travel/commerce-react@0.23.0
  - @voyant-travel/relationships-react@0.141.0
  - @voyant-travel/bookings@0.141.0

## 0.140.0

### Patch Changes

- Updated dependencies [62e87ee]
  - @voyant-travel/admin@0.116.0
  - @voyant-travel/i18n@0.110.0
  - @voyant-travel/catalog-react@0.138.0
  - @voyant-travel/commerce-react@0.22.0
  - @voyant-travel/distribution-react@0.130.0
  - @voyant-travel/finance-react@0.140.0
  - @voyant-travel/inventory-react@0.22.0
  - @voyant-travel/legal-react@0.140.0
  - @voyant-travel/operations-react@0.21.0
  - @voyant-travel/relationships-react@0.140.0
  - @voyant-travel/identity-react@0.140.0
  - @voyant-travel/bookings@0.140.0

## 0.139.5

### Patch Changes

- ebadd97: Show an explicit settlement-review notice when cancelling bookings that already have recorded payments.
  - @voyant-travel/bookings@0.139.5

## 0.139.4

### Patch Changes

- Updated dependencies [9678a59]
  - @voyant-travel/bookings@0.139.4

## 0.139.3

### Patch Changes

- Updated dependencies [386595a]
  - @voyant-travel/bookings@0.139.3

## 0.139.2

### Patch Changes

- Updated dependencies [ecff8cf]
  - @voyant-travel/bookings@0.139.2

## 0.139.1

### Patch Changes

- a69f820: Snapshot accepted bank-transfer checkout payment terms into booking activity and show pre-payment checkout lifecycle rows in the admin activity timeline.
  - @voyant-travel/bookings@0.139.1

## 0.139.0

### Patch Changes

- Updated dependencies [c9a356f]
- Updated dependencies [fc71db1]
- Updated dependencies [7d4a405]
- Updated dependencies [2613dfb]
- Updated dependencies [a45a0d3]
- Updated dependencies [f3b8bef]
- Updated dependencies [fcad28b]
  - @voyant-travel/types@0.107.0
  - @voyant-travel/bookings@0.139.0
  - @voyant-travel/commerce-react@0.21.0
  - @voyant-travel/distribution-react@0.129.0
  - @voyant-travel/relationships-react@0.139.0
  - @voyant-travel/admin@0.115.4
  - @voyant-travel/finance-react@0.139.0
  - @voyant-travel/identity-react@0.139.0
  - @voyant-travel/inventory-react@0.21.0
  - @voyant-travel/legal-react@0.139.0
  - @voyant-travel/operations-react@0.20.0
  - @voyant-travel/catalog-react@0.137.0

## 0.138.10

### Patch Changes

- 7f8f45a: Avoid pinning unscoped Voyant Connect source kinds into admin booking journey links, and keep booking Confirm disabled until live pricing returns a quote id.
- Updated dependencies [7f8f45a]
- Updated dependencies [5e6a2ff]
- Updated dependencies [92bac99]
- Updated dependencies [5fa49b1]
  - @voyant-travel/catalog-react@0.136.4
  - @voyant-travel/relationships-react@0.138.2
  - @voyant-travel/bookings@0.138.10

## 0.138.9

### Patch Changes

- 8d090aa: Limit the packaged admin booking journey to hold-only commits until tokenized card, bank-transfer, and agency-credit checkout flows are wired.
- b91f9ac: Persist and display the selected B2B organization as the booking contact when the admin booking journey uses company-only billing.
  - @voyant-travel/bookings@0.138.9

## 0.138.8

### Patch Changes

- f9c3449: Require an explicit payment date when booking payment schedules are marked already paid.
- Updated dependencies [1c7bbdb]
  - @voyant-travel/relationships-react@0.138.1
  - @voyant-travel/identity-react@0.138.3
  - @voyant-travel/bookings@0.138.8
  - @voyant-travel/finance-react@0.138.9

## 0.138.7

### Patch Changes

- 9f3ffdf: Preserve the hydrated `items`/`travelers`/`documents` collections on the
  `useBooking` detail read.

  The admin booking detail (`GET /v1/admin/bookings/:id`) hydrates its
  bookings-owned child collections inline, but `getBookingQueryOptions` parsed the
  response with the flat list record schema (`bookingRecordSchema`) — which
  carries only an optional summary `items` and no `travelers`/`documents` — so Zod
  silently stripped the newly-hydrated collections for `bookings-react` consumers.

  Adds a `bookingDetailSchema` (record + full `items`, `travelers`, and
  `documents`) and a dedicated `bookingDetailResponse` that the detail query now
  uses. Travelers accept both the redacted and reveal shapes so an inline
  `travelDetails` is preserved. `bookingSingleResponse` stays on the flat record
  schema because it is shared by the mutation hooks (create/update/convert/
  status/cancel), whose endpoints return a flat booking with no child collections.

- 3e81078: Clear company billing state when switching booking journeys back to individual buyers and clarify the traveler add action.
- Updated dependencies [3a14bd5]
  - @voyant-travel/operations-react@0.19.2
  - @voyant-travel/bookings@0.138.7

## 0.138.6

### Patch Changes

- Updated dependencies [f1090b7]
- Updated dependencies [42f662c]
  - @voyant-travel/operations-react@0.19.1
  - @voyant-travel/i18n@0.109.8
  - @voyant-travel/bookings@0.138.6
  - @voyant-travel/catalog-react@0.136.3
  - @voyant-travel/distribution-react@0.128.4
  - @voyant-travel/finance-react@0.138.8
  - @voyant-travel/identity-react@0.138.2
  - @voyant-travel/legal-react@0.138.2

## 0.138.5

### Patch Changes

- b254511: Normalize currency inputs safely and prevent booking header totals from drifting from booking items.
- 141bd2b: Reconcile draft booking items when overriding a booking to confirmed, block item mutations for cancelled bookings, and validate cost currency when cost amounts are entered.
- Updated dependencies [b254511]
- Updated dependencies [141bd2b]
  - @voyant-travel/bookings@0.138.5
  - @voyant-travel/ui@0.108.10
  - @voyant-travel/catalog-react@0.136.2
  - @voyant-travel/distribution-react@0.128.3
  - @voyant-travel/finance-react@0.138.7
  - @voyant-travel/identity-react@0.138.1
  - @voyant-travel/legal-react@0.138.1

## 0.138.4

### Patch Changes

- 1544a59: Keep booking detail traveler additions in sync with booking pax, traveler category,
  and existing booking item traveler assignments. The traveler dialog now exposes
  category assignment, and the traveler table reflects revealed travel-document
  details when no uploaded document rows exist.
- 2d3b039: Offer bank transfer and inquiry on owned-product storefront checkout.

  The owned-product booking draft shape hardcoded `paymentIntents: ["hold",
"card"]`, so the storefront Payment step collapsed to card-only for owned
  products even though the deployment advertised bank transfer and inquiry
  (sourced products already offered all three). Both product draft shapes now
  declare the full engine allow list via a shared `DEFAULT_PAYMENT_INTENTS`
  constant, and deployment/surface `PaymentProviderCapabilities` narrow it at
  render time — so owned and sourced products offer the same payment paths. The
  `/checkout/start` flow already handled bank transfer and inquiry generically on
  the booking row, so no server change was needed.

- Updated dependencies [1544a59]
- Updated dependencies [2d3b039]
- Updated dependencies [37e7758]
  - @voyant-travel/bookings@0.138.4
  - @voyant-travel/catalog-contracts@0.108.1
  - @voyant-travel/finance-react@0.138.6
  - @voyant-travel/catalog-react@0.136.1

## 0.138.3

### Patch Changes

- c081c71: Keep booking activity and metadata current for note, document, supplier, invoice, and payment child mutations.
- bd00f36: Improve booking Documents tab guidance by disabling traveler document submission until a file upload exists, clearing upload form state when the selected file is removed, aligning empty-state copy with the Add contract action, and explaining unavailable generated-contract preview setup.
- 51003c6: Expose booking voucher redemptions in booking-scoped payment reads as voucher payment rows.
- Updated dependencies [c081c71]
- Updated dependencies [bd00f36]
  - @voyant-travel/bookings@0.138.3
  - @voyant-travel/finance-react@0.138.3
  - @voyant-travel/i18n@0.109.7

## 0.138.2

### Patch Changes

- d388565: Refresh booking detail caches after booking item mutations and record booking item deletions in the booking activity log.
- Updated dependencies [d388565]
  - @voyant-travel/bookings@0.138.2
  - @voyant-travel/finance-react@0.138.2

## 0.138.1

### Patch Changes

- Updated dependencies [a5dfd8f]
  - @voyant-travel/bookings@0.138.1
  - @voyant-travel/distribution-react@0.128.2

## 0.138.0

### Patch Changes

- @voyant-travel/distribution-react@0.128.0
- @voyant-travel/catalog-react@0.136.0
- @voyant-travel/commerce-react@0.20.0
- @voyant-travel/finance-react@0.138.0
- @voyant-travel/identity-react@0.138.0
- @voyant-travel/legal-react@0.138.0
- @voyant-travel/operations-react@0.19.0
- @voyant-travel/inventory-react@0.20.0
- @voyant-travel/relationships-react@0.138.0
- @voyant-travel/bookings@0.138.0

## 0.137.7

### Patch Changes

- f6fd0b1: Block booking commit on un-priceable quotes and surface checkout failures.

  The booking journey now treats a settled quote that reports an `invalidReason`
  (e.g. the owned accommodation handler's `rates_missing`) or is explicitly
  unavailable as un-priceable: Next, contract acceptance, and Confirm are gated
  and a clear "adjust your selection" message is shown, instead of letting the
  buyer commit an unpriced booking that fails with a 502 `RESERVE_FAILED` at
  `/book`. A checkout handler that throws (e.g. the storefront `/book` +
  `/checkout/start` flow) now renders a visible error in the checkout UI rather
  than dropping the customer back on Review with only a console log.

  - @voyant-travel/bookings@0.137.7

## 0.137.6

### Patch Changes

- cb8df9c: Thread pricing/content scope through the booking journey. `BookingJourney` now accepts an optional `scope` (`market`/`currency`/`locale`/`audience`) and forwards it to its live quote, and `useBookingQuote` includes scope in its React Query key so changing the selected market/currency re-quotes instead of showing a stale price. Storefronts pass the shopper's selected scope so checkout prices in the same market/currency as browse and detail (voyant#2643). Omitting `scope` keeps the previous per-surface default behavior, so admin surfaces are unaffected.
- Updated dependencies [cb8df9c]
  - @voyant-travel/catalog-react@0.135.8
  - @voyant-travel/bookings@0.137.6
  - @voyant-travel/legal-react@0.137.8

## 0.137.5

### Patch Changes

- 7ee0420: Handle live-quote failures in the storefront booking journey. When a connected supplier product's quote request errors (e.g. the connector adapter returns 500), the journey previously let the shopper reach Review with a stale/absent price, and `Confirm booking` became a silent no-op. It now surfaces a recoverable inline error with a retry action, blocks Next/Confirm while the quote is failing, and shows an explicit message instead of silently swallowing the Confirm click. Also fixes a render-phase `setDraft` in `PaymentStep` that triggered React's "Cannot update a component while rendering a different component" warning by moving the intent-snap into an effect.
- Updated dependencies [7b82e5a]
- Updated dependencies [8466f47]
- Updated dependencies [8f2a6d9]
- Updated dependencies [53f949c]
- Updated dependencies [0b57296]
  - @voyant-travel/legal-react@0.137.5
  - @voyant-travel/commerce-react@0.19.1
  - @voyant-travel/ui@0.108.9
  - @voyant-travel/bookings@0.137.5

## 0.137.4

### Patch Changes

- 61410dd: Preserve catalog sourced-entry provenance when packaged detail pages start the booking journey.
- Updated dependencies [61410dd]
  - @voyant-travel/catalog-react@0.135.3
  - @voyant-travel/bookings@0.137.4

## 0.137.3

### Patch Changes

- 8ced473: Fix the admin booking activity timeline so payment events load through the admin finance payments endpoint instead of the public checkout endpoint.
  - @voyant-travel/bookings@0.137.3

## 0.137.2

### Patch Changes

- c6e872d: Fix the admin bookings list so the all-status UI sentinel is omitted from route search state and admin API requests.
  - @voyant-travel/bookings@0.137.2

## 0.137.1

### Patch Changes

- 9a1197b: Move the operator media upload and serve routes off the bare `/v1/*` surface and onto `/v1/admin/*`.

  Uploads now post to `/v1/admin/uploads` and video tickets to `/v1/admin/uploads/video`; stored media is served from `/v1/admin/media/*`. The Hono app no longer mounts the bare `/v1/*` catch-all actor guard, and worker-runtime hosts can use `rewriteAppPath` to preserve compatibility for persisted legacy media URLs.

- Updated dependencies [9a1197b]
  - @voyant-travel/finance-react@0.137.1
  - @voyant-travel/inventory-react@0.19.1
  - @voyant-travel/bookings@0.137.1
  - @voyant-travel/catalog-react@0.135.1
  - @voyant-travel/distribution-react@0.127.1
  - @voyant-travel/identity-react@0.137.1
  - @voyant-travel/legal-react@0.137.1

## 0.137.0

### Patch Changes

- @voyant-travel/bookings@0.137.0
- @voyant-travel/commerce-react@0.19.0
- @voyant-travel/catalog-react@0.135.0
- @voyant-travel/legal-react@0.137.0
- @voyant-travel/distribution-react@0.127.0
- @voyant-travel/finance-react@0.137.0
- @voyant-travel/identity-react@0.137.0
- @voyant-travel/operations-react@0.18.0
- @voyant-travel/inventory-react@0.19.0
- @voyant-travel/relationships-react@0.137.0

## 0.136.2

### Patch Changes

- Updated dependencies [12a1eb2]
  - @voyant-travel/bookings@0.136.2
  - @voyant-travel/commerce-react@0.18.2
  - @voyant-travel/distribution-react@0.126.2
  - @voyant-travel/finance-react@0.136.2
  - @voyant-travel/identity-react@0.136.2
  - @voyant-travel/inventory-react@0.18.2
  - @voyant-travel/legal-react@0.136.2
  - @voyant-travel/operations-react@0.17.2

## 0.136.1

### Patch Changes

- Updated dependencies [7cb6fa7]
  - @voyant-travel/i18n@0.109.0
  - @voyant-travel/admin@0.115.2
  - @voyant-travel/catalog-react@0.134.1
  - @voyant-travel/commerce-react@0.18.1
  - @voyant-travel/distribution-react@0.126.1
  - @voyant-travel/finance-react@0.136.1
  - @voyant-travel/identity-react@0.136.1
  - @voyant-travel/inventory-react@0.18.1
  - @voyant-travel/legal-react@0.136.1
  - @voyant-travel/operations-react@0.17.1
  - @voyant-travel/relationships-react@0.136.1
  - @voyant-travel/ui@0.108.2
  - @voyant-travel/bookings@0.136.1

## 0.136.0

### Patch Changes

- @voyant-travel/operations-react@0.17.0
- @voyant-travel/finance-react@0.136.0
- @voyant-travel/distribution-react@0.126.0
- @voyant-travel/identity-react@0.136.0
- @voyant-travel/legal-react@0.136.0
- @voyant-travel/inventory-react@0.18.0
- @voyant-travel/catalog-react@0.134.0
- @voyant-travel/commerce-react@0.18.0
- @voyant-travel/relationships-react@0.136.0
- @voyant-travel/bookings@0.136.0

## 0.135.0

### Patch Changes

- @voyant-travel/operations-react@0.16.0
- @voyant-travel/finance-react@0.135.0
- @voyant-travel/distribution-react@0.125.0
- @voyant-travel/identity-react@0.135.0
- @voyant-travel/legal-react@0.135.0
- @voyant-travel/inventory-react@0.17.0
- @voyant-travel/catalog-react@0.133.0
- @voyant-travel/commerce-react@0.17.0
- @voyant-travel/relationships-react@0.135.0
- @voyant-travel/bookings@0.135.0

## 0.134.1

### Patch Changes

- @voyant-travel/bookings@0.134.1
- @voyant-travel/catalog-react@0.132.1
- @voyant-travel/distribution-react@0.124.1
- @voyant-travel/finance-react@0.134.1
- @voyant-travel/identity-react@0.134.1
- @voyant-travel/legal-react@0.134.1

## 0.134.0

### Minor Changes

- 51f7dea: Share one list-response contract instead of per-module copies (voyant#2109).

  `@voyant-travel/types` now owns the canonical offset-paginated list envelope: the `ListResponse<T>` type + `listResponse(data, { total, limit, offset })` builder, plus the zod `paginationSchema` (coerced `limit` 1–200 default 50, `offset` ≥0 default 0) and the `listResponseSchema(item)` factory. Both server services and `*-react` clients import from this single source.

  Server side: every module's local `paginate()` / inline `{ data, total, limit, offset }` construction now routes through the shared `listResponse` builder, and the count read is standardized on `count` internally — fixing the drift where finance, notifications and the legal contracts/policies services read `countResult[0]?.total` while every other module read `countResult[0]?.count` (their `count(*)` selects were aliased `total`; they are now aliased `count`). The returned shape is byte-for-byte identical.

  Client side: the ~23 copied `paginatedEnvelope` zod schemas across the `*-react` packages are replaced by re-exporting the shared `listResponseSchema` factory under the same `paginatedEnvelope` name, so consumers are unchanged.

  Input alignment: `finance-contracts` and `legal-contracts` pagination `limit` caps were raised from `.max(100)` to `.max(200)` to match the framework-wide max.

  Additive and non-breaking.

### Patch Changes

- Updated dependencies [51f7dea]
- Updated dependencies [0a0a014]
  - @voyant-travel/types@0.106.0
  - @voyant-travel/bookings@0.134.0
  - @voyant-travel/commerce-react@0.16.0
  - @voyant-travel/distribution-react@0.124.0
  - @voyant-travel/finance-react@0.134.0
  - @voyant-travel/identity-react@0.134.0
  - @voyant-travel/inventory-react@0.16.0
  - @voyant-travel/legal-react@0.134.0
  - @voyant-travel/operations-react@0.15.0
  - @voyant-travel/relationships-react@0.134.0
  - @voyant-travel/admin@0.115.1
  - @voyant-travel/catalog-react@0.132.0

## 0.133.0

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/admin@0.115.0
  - @voyant-travel/i18n@0.108.0
  - @voyant-travel/bookings@0.133.0
  - @voyant-travel/catalog-react@0.131.0
  - @voyant-travel/commerce-react@0.15.0
  - @voyant-travel/distribution-react@0.123.0
  - @voyant-travel/finance-react@0.133.0
  - @voyant-travel/inventory-react@0.15.0
  - @voyant-travel/legal-react@0.133.0
  - @voyant-travel/operations-react@0.14.0
  - @voyant-travel/relationships-react@0.133.0
  - @voyant-travel/identity-react@0.133.0
  - @voyant-travel/ui@0.108.1

## 0.132.0

### Patch Changes

- Updated dependencies [6a0edd2]
  - @voyant-travel/catalog-contracts@0.108.0
  - @voyant-travel/catalog-react@0.130.0
  - @voyant-travel/bookings@0.132.0
  - @voyant-travel/distribution-react@0.122.0
  - @voyant-travel/inventory-react@0.14.0
  - @voyant-travel/finance-react@0.132.0
  - @voyant-travel/identity-react@0.132.0
  - @voyant-travel/legal-react@0.132.0
  - @voyant-travel/operations-react@0.13.0
  - @voyant-travel/commerce-react@0.14.0
  - @voyant-travel/relationships-react@0.132.0

## 0.131.1

### Patch Changes

- @voyant-travel/bookings@0.131.1
- @voyant-travel/catalog-react@0.129.1
- @voyant-travel/distribution-react@0.121.1
- @voyant-travel/finance-react@0.131.2
- @voyant-travel/identity-react@0.131.1
- @voyant-travel/legal-react@0.131.1

## 0.131.0

### Patch Changes

- Updated dependencies [310565b]
  - @voyant-travel/operations-react@0.12.0
  - @voyant-travel/i18n@0.107.3
  - @voyant-travel/finance-react@0.131.0
  - @voyant-travel/distribution-react@0.121.0
  - @voyant-travel/identity-react@0.131.0
  - @voyant-travel/legal-react@0.131.0
  - @voyant-travel/inventory-react@0.13.0
  - @voyant-travel/catalog-react@0.129.0
  - @voyant-travel/commerce-react@0.13.0
  - @voyant-travel/relationships-react@0.131.0
  - @voyant-travel/bookings@0.131.0

## 0.130.0

### Patch Changes

- Updated dependencies [dbea53e]
  - @voyant-travel/operations-react@0.11.0
  - @voyant-travel/i18n@0.107.2
  - @voyant-travel/finance-react@0.130.0
  - @voyant-travel/distribution-react@0.120.0
  - @voyant-travel/identity-react@0.130.0
  - @voyant-travel/legal-react@0.130.0
  - @voyant-travel/inventory-react@0.12.0
  - @voyant-travel/catalog-react@0.128.0
  - @voyant-travel/commerce-react@0.12.0
  - @voyant-travel/relationships-react@0.130.0
  - @voyant-travel/bookings@0.130.0

## 0.129.1

### Patch Changes

- Updated dependencies [4a6d62f]
  - @voyant-travel/bookings@0.129.1

## 0.129.0

### Patch Changes

- @voyant-travel/catalog-react@0.127.0
- @voyant-travel/distribution-react@0.119.0
- @voyant-travel/inventory-react@0.11.0
- @voyant-travel/finance-react@0.129.0
- @voyant-travel/identity-react@0.129.0
- @voyant-travel/legal-react@0.129.0
- @voyant-travel/operations-react@0.10.0
- @voyant-travel/commerce-react@0.11.0
- @voyant-travel/relationships-react@0.129.0
- @voyant-travel/bookings@0.129.0

## 0.128.0

### Patch Changes

- @voyant-travel/inventory-react@0.10.0
- @voyant-travel/catalog-react@0.126.0
- @voyant-travel/commerce-react@0.10.0
- @voyant-travel/distribution-react@0.118.0
- @voyant-travel/finance-react@0.128.0
- @voyant-travel/identity-react@0.128.0
- @voyant-travel/legal-react@0.128.0
- @voyant-travel/operations-react@0.9.0
- @voyant-travel/relationships-react@0.128.0
- @voyant-travel/bookings@0.128.0

## 0.127.0

### Patch Changes

- Updated dependencies [435a5d1]
  - @voyant-travel/bookings@0.127.0
  - @voyant-travel/operations-react@0.8.0
  - @voyant-travel/finance-react@0.127.0
  - @voyant-travel/distribution-react@0.117.0
  - @voyant-travel/identity-react@0.127.0
  - @voyant-travel/legal-react@0.127.0
  - @voyant-travel/inventory-react@0.9.0
  - @voyant-travel/catalog-react@0.125.0
  - @voyant-travel/commerce-react@0.9.0
  - @voyant-travel/relationships-react@0.127.0

## 0.126.0

### Patch Changes

- @voyant-travel/legal-react@0.126.0
- @voyant-travel/commerce-react@0.8.0
- @voyant-travel/catalog-react@0.124.0
- @voyant-travel/distribution-react@0.116.0
- @voyant-travel/finance-react@0.126.0
- @voyant-travel/identity-react@0.126.0
- @voyant-travel/operations-react@0.7.0
- @voyant-travel/inventory-react@0.8.0
- @voyant-travel/relationships-react@0.126.0
- @voyant-travel/bookings@0.126.0

## 0.125.0

### Patch Changes

- Updated dependencies [a74471e]
- Updated dependencies [a74471e]
  - @voyant-travel/i18n@0.107.0
  - @voyant-travel/ui@0.108.0
  - @voyant-travel/admin@0.114.0
  - @voyant-travel/catalog-react@0.123.0
  - @voyant-travel/commerce-react@0.7.0
  - @voyant-travel/distribution-react@0.115.0
  - @voyant-travel/finance-react@0.125.0
  - @voyant-travel/identity-react@0.125.0
  - @voyant-travel/inventory-react@0.7.0
  - @voyant-travel/legal-react@0.125.0
  - @voyant-travel/operations-react@0.6.0
  - @voyant-travel/relationships-react@0.125.0
  - @voyant-travel/bookings@0.125.0

## 0.124.0

### Patch Changes

- Updated dependencies [4f92198]
- Updated dependencies [4f92198]
  - @voyant-travel/finance-react@0.124.0
  - @voyant-travel/ui@0.107.0
  - @voyant-travel/admin@0.113.0
  - @voyant-travel/catalog-react@0.122.0
  - @voyant-travel/commerce-react@0.6.0
  - @voyant-travel/distribution-react@0.114.0
  - @voyant-travel/inventory-react@0.6.0
  - @voyant-travel/operations-react@0.5.0
  - @voyant-travel/identity-react@0.124.0
  - @voyant-travel/legal-react@0.124.0
  - @voyant-travel/relationships-react@0.124.0
  - @voyant-travel/bookings@0.124.0

## 0.123.0

### Patch Changes

- Updated dependencies [94890c3]
- Updated dependencies [04681f3]
- Updated dependencies [39d48fe]
- Updated dependencies [cb9b04b]
  - @voyant-travel/admin@0.112.0
  - @voyant-travel/bookings@0.123.0
  - @voyant-travel/catalog-react@0.121.0
  - @voyant-travel/commerce-react@0.5.0
  - @voyant-travel/distribution-react@0.113.0
  - @voyant-travel/finance-react@0.123.0
  - @voyant-travel/inventory-react@0.5.0
  - @voyant-travel/legal-react@0.123.0
  - @voyant-travel/operations-react@0.4.0
  - @voyant-travel/relationships-react@0.123.0
  - @voyant-travel/identity-react@0.123.0

## 0.122.2

### Patch Changes

- 274b92d: Allow admin booking B2C billing contacts with a phone number and no email to unlock the travelers step.
  - @voyant-travel/bookings@0.122.2

## 0.122.1

### Patch Changes

- Updated dependencies [832ac35]
  - @voyant-travel/bookings@0.122.1

## 0.122.0

### Patch Changes

- @voyant-travel/finance-react@0.122.0
- @voyant-travel/inventory-react@0.4.0
- @voyant-travel/legal-react@0.122.0
- @voyant-travel/commerce-react@0.4.0
- @voyant-travel/catalog-react@0.120.0
- @voyant-travel/distribution-react@0.112.0
- @voyant-travel/identity-react@0.122.0
- @voyant-travel/operations-react@0.3.0
- @voyant-travel/relationships-react@0.122.0
- @voyant-travel/bookings@0.122.0

## 0.121.0

### Patch Changes

- @voyant-travel/bookings@0.121.0
- @voyant-travel/commerce-react@0.3.0
- @voyant-travel/finance-react@0.121.0
- @voyant-travel/inventory-react@0.3.0
- @voyant-travel/legal-react@0.121.0
- @voyant-travel/catalog-react@0.119.0
- @voyant-travel/distribution-react@0.111.0
- @voyant-travel/identity-react@0.121.0
- @voyant-travel/operations-react@0.2.0
- @voyant-travel/relationships-react@0.121.0

## 0.120.3

### Patch Changes

- ecec979: Improve operator bundle boundaries by adding route-local admin message provider support, exposing admin extension route helpers, keeping pending skeletons structural, and tightening Vite route ignores and vendor chunk splitting so heavy admin route dependencies stay out of the initial entry.
- Updated dependencies [ecec979]
  - @voyant-travel/admin@0.111.3
  - @voyant-travel/distribution-react@0.110.5
  - @voyant-travel/finance-react@0.120.2
  - @voyant-travel/inventory-react@0.2.2
  - @voyant-travel/operations-react@0.1.2
  - @voyant-travel/relationships-react@0.120.2
  - @voyant-travel/bookings@0.120.3

## 0.120.2

### Patch Changes

- Updated dependencies [756213e]
  - @voyant-travel/bookings@0.120.2
  - @voyant-travel/legal-react@0.120.2

## 0.120.1

### Patch Changes

- eef1a00: Republish notification and UI consumer packages so stale beta artifacts no longer reference legacy notification package specifiers.
- Updated dependencies [eef1a00]
  - @voyant-travel/admin@0.111.2
  - @voyant-travel/catalog-react@0.118.1
  - @voyant-travel/commerce-react@0.2.1
  - @voyant-travel/distribution-react@0.110.4
  - @voyant-travel/finance-react@0.120.1
  - @voyant-travel/identity-react@0.120.1
  - @voyant-travel/inventory-react@0.2.1
  - @voyant-travel/legal-react@0.120.1
  - @voyant-travel/operations-react@0.1.1
  - @voyant-travel/relationships-react@0.120.1
  - @voyant-travel/bookings@0.120.1

## 0.120.0

### Minor Changes

- 3cc83b6: Move extras runtime and React source behind Inventory and Bookings owner
  subpaths. The old runtime and React extras package names are removed from v1;
  first-party imports use the Inventory and Bookings owner paths.

### Patch Changes

- 44c3875: Move booking requirements backend and React surfaces under the Bookings package
  family. New imports are available from `@voyant-travel/bookings/requirements*` and
  `@voyant-travel/bookings-react/requirements*`; the old standalone package names are
  removed from v1. Existing
  `/v1/booking-requirements/*` and `/v1/public/booking-requirements/*` API paths
  continue to be mounted by the operator starter.
- 3408b2a: Move availability, allocation UI, resources, ground logistics, and places source
  under Operations owner paths. The old operated-execution package names are
  removed from the v1 workspace surface while first-party runtime, React, and
  operator imports use `@voyant-travel/operations` and `@voyant-travel/operations-react`
  surfaces.
- 47fef18: Retarget first-party imports from the removed beta package names to their owner
  packages. Operated product UI now imports Inventory React, commercial UI imports
  Commerce React, supplier UI imports Distribution React, checkout UI imports
  Finance React, and operated place/availability schema references import
  Operations owner paths.
- Updated dependencies [dd71543]
- Updated dependencies [2f1228a]
- Updated dependencies [efc803c]
- Updated dependencies [d92d1a8]
- Updated dependencies [97d520c]
- Updated dependencies [85f9ce1]
- Updated dependencies [6bff46f]
- Updated dependencies [3cc83b6]
- Updated dependencies [9e970a5]
- Updated dependencies [44c3875]
- Updated dependencies [3408b2a]
- Updated dependencies [3e160d3]
- Updated dependencies [65b3782]
- Updated dependencies [a101971]
- Updated dependencies [c3f4fa0]
- Updated dependencies [47fef18]
- Updated dependencies [2c9c4a4]
- Updated dependencies [6196b3b]
- Updated dependencies [e80e3d3]
  - @voyant-travel/admin@0.111.1
  - @voyant-travel/bookings@0.120.0
  - @voyant-travel/commerce-react@0.2.0
  - @voyant-travel/inventory-react@0.2.0
  - @voyant-travel/finance-react@0.120.0
  - @voyant-travel/operations-react@0.1.0
  - @voyant-travel/distribution-react@0.110.0
  - @voyant-travel/legal-react@0.120.0
  - @voyant-travel/catalog-react@0.118.0
  - @voyant-travel/identity-react@0.120.0
  - @voyant-travel/relationships-react@0.120.0

## 0.119.3

### Patch Changes

- Updated dependencies [658aa37]
  - @voyant-travel/bookings@0.119.3

## 0.119.2

### Patch Changes

- f1c05dc: Split oversized booking React, journey, traveler, and i18n surfaces into smaller internal modules without changing public exports.
- Updated dependencies [e6d9a61]
- Updated dependencies [bd74fb0]
- Updated dependencies [b66b155]
  - @voyant-travel/products-react@0.119.3
  - @voyant-travel/catalog-react@0.117.2
  - @voyant-travel/catalog-contracts@0.107.1
  - @voyant-travel/finance-react@0.119.3
  - @voyant-travel/bookings@0.119.2

## 0.119.1

### Patch Changes

- @voyant-travel/bookings@0.119.1
- @voyant-travel/availability-react@0.116.1
- @voyant-travel/catalog-react@0.117.1
- @voyant-travel/crm-react@0.119.1
- @voyant-travel/extras-react@0.119.1
- @voyant-travel/finance-react@0.119.1
- @voyant-travel/identity-react@0.119.1
- @voyant-travel/legal-react@0.119.1
- @voyant-travel/pricing-react@0.119.1
- @voyant-travel/products-react@0.119.1
- @voyant-travel/suppliers-react@0.111.6

## 0.119.0

### Patch Changes

- @voyant-travel/bookings@0.119.0
- @voyant-travel/crm-react@0.119.0
- @voyant-travel/legal-react@0.119.0
- @voyant-travel/pricing-react@0.119.0
- @voyant-travel/products-react@0.119.0
- @voyant-travel/ui@0.106.1
- @voyant-travel/availability-react@0.116.0
- @voyant-travel/catalog-react@0.117.0
- @voyant-travel/extras-react@0.119.0
- @voyant-travel/finance-react@0.119.0
- @voyant-travel/identity-react@0.119.0
- @voyant-travel/suppliers-react@0.111.5

## 0.118.0

### Patch Changes

- @voyant-travel/bookings@0.118.0
- @voyant-travel/products-react@0.118.0
- @voyant-travel/availability-react@0.115.0
- @voyant-travel/catalog-react@0.116.0
- @voyant-travel/extras-react@0.118.0
- @voyant-travel/finance-react@0.118.0
- @voyant-travel/identity-react@0.118.0
- @voyant-travel/legal-react@0.118.0
- @voyant-travel/pricing-react@0.118.0
- @voyant-travel/crm-react@0.118.0
- @voyant-travel/suppliers-react@0.111.4

## 0.117.1

### Patch Changes

- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
  - @voyant-travel/bookings@0.117.1
  - @voyant-travel/availability-react@0.114.1
  - @voyant-travel/catalog-react@0.115.1
  - @voyant-travel/crm-react@0.117.1
  - @voyant-travel/extras-react@0.117.1
  - @voyant-travel/finance-react@0.117.1
  - @voyant-travel/identity-react@0.117.1
  - @voyant-travel/legal-react@0.117.1
  - @voyant-travel/pricing-react@0.117.1
  - @voyant-travel/products-react@0.117.1
  - @voyant-travel/suppliers-react@0.111.3

## 0.117.0

### Patch Changes

- Updated dependencies [7255353]
  - @voyant-travel/bookings@0.117.0
  - @voyant-travel/availability-react@0.114.0
  - @voyant-travel/catalog-react@0.115.0
  - @voyant-travel/crm-react@0.117.0
  - @voyant-travel/extras-react@0.117.0
  - @voyant-travel/finance-react@0.117.0
  - @voyant-travel/identity-react@0.117.0
  - @voyant-travel/legal-react@0.117.0
  - @voyant-travel/pricing-react@0.117.0
  - @voyant-travel/products-react@0.117.0
  - @voyant-travel/suppliers-react@0.111.2

## 0.116.0

### Patch Changes

- @voyant-travel/bookings@0.116.0
- @voyant-travel/products-react@0.116.0
- @voyant-travel/availability-react@0.113.0
- @voyant-travel/catalog-react@0.114.0
- @voyant-travel/extras-react@0.116.0
- @voyant-travel/finance-react@0.116.0
- @voyant-travel/identity-react@0.116.0
- @voyant-travel/legal-react@0.116.0
- @voyant-travel/pricing-react@0.116.0
- @voyant-travel/crm-react@0.116.0
- @voyant-travel/suppliers-react@0.111.1

## 0.115.0

### Patch Changes

- Updated dependencies [41b08db]
- Updated dependencies [6d496d0]
  - @voyant-travel/admin@0.111.0
  - @voyant-travel/catalog-react@0.113.0
  - @voyant-travel/finance-react@0.115.0
  - @voyant-travel/legal-react@0.115.0
  - @voyant-travel/products-react@0.115.0
  - @voyant-travel/availability-react@0.112.0
  - @voyant-travel/crm-react@0.115.0
  - @voyant-travel/suppliers-react@0.111.0
  - @voyant-travel/extras-react@0.115.0
  - @voyant-travel/identity-react@0.115.0
  - @voyant-travel/pricing-react@0.115.0
  - @voyant-travel/bookings@0.115.0

## 0.114.0

### Patch Changes

- Updated dependencies [f7bd971]
  - @voyant-travel/finance-react@0.114.0
  - @voyant-travel/legal-react@0.114.0
  - @voyant-travel/products-react@0.114.0
  - @voyant-travel/availability-react@0.111.0
  - @voyant-travel/identity-react@0.114.0
  - @voyant-travel/catalog-react@0.112.0
  - @voyant-travel/extras-react@0.114.0
  - @voyant-travel/pricing-react@0.114.0
  - @voyant-travel/crm-react@0.114.0
  - @voyant-travel/bookings@0.114.0
  - @voyant-travel/suppliers-react@0.110.1

## 0.113.0

### Minor Changes

- 9c909e2: Package-deliver the booking-flow admin surfaces (packaged-admin final sweep)

  - **bookings-react**: `createBookingsAdminExtension` now contributes the whole booking flow — three new route contributions alongside list/detail: `bookings-new` (`/bookings/new` owned-product picker that forwards into the unified journey; route-backed `booking.create` destination), `bookings-compose` (`/bookings/compose` legacy alias forwarding to the new `trip.create` destination), and `bookings-journey` (`/catalog/journey/$entityModule/$entityId`, the unified `BookingJourney` host with CRM-backed lead/traveler pickers, departure/units/voucher pickers, duplicate-departure warning, B2B default, and commit→`booking.detail` / cancel→`catalog.browse` navigation via semantic destinations). New exports: `bookingNewSearchSchema`, `bookingJourneySearchSchema` (+ param types) and the `BookingJourneyHost` admin module (`/admin/booking-journey-host`). Declares the `trip.create` destination key.
  - **admin**: `useAdminNavigate` accepts an optional `AdminNavigateOptions` (`{ replace?: boolean }`) third argument, forwarded to the host-injected navigate so packaged redirect pages keep route-redirect history semantics.
  - **admin-app**: the workspace shell's injected destination navigate maps `replace` onto the router's history-replace mode.

### Patch Changes

- Updated dependencies [9c909e2]
  - @voyant-travel/admin@0.110.0
  - @voyant-travel/availability-react@0.110.0
  - @voyant-travel/finance-react@0.113.0
  - @voyant-travel/identity-react@0.113.0
  - @voyant-travel/legal-react@0.113.0
  - @voyant-travel/catalog-react@0.111.0
  - @voyant-travel/crm-react@0.113.0
  - @voyant-travel/suppliers-react@0.110.0
  - @voyant-travel/products-react@0.113.0
  - @voyant-travel/extras-react@0.113.0
  - @voyant-travel/pricing-react@0.113.0
  - @voyant-travel/bookings@0.113.0

## 0.112.0

### Minor Changes

- 279f97c: Slim the admin entry barrels so the host's workspace-chrome chunk stops pinning domain data layers and page hosts (operator client entry: 3.74 MB → 1.83 MB).

  - Route contribution loaders now resolve query options / page-data helpers via dynamic `import()` inside the loader body, keeping clients + response schemas (and the backend validation graphs they pull) out of the eagerly evaluated entry chunk.
  - `@voyant-travel/<domain>-react/admin` barrels no longer re-export page/host/dialog/widget component **values** (packaged-admin RFC §4.8 endgame rule: specific modules, never barrels). Their prop **types** still re-export from the barrels; import component values from their specific modules instead (e.g. `@voyant-travel/bookings-react/admin/booking-detail-host`). New `./admin/*` subpath exports on `@voyant-travel/bookings-react` and `@voyant-travel/availability-react` cover the known host-side imports.
  - Widget slot ids moved into lean `admin/slots` modules (`bookings-react`, `crm-react`, `suppliers-react`); the host modules re-export them, so existing imports keep working.
  - Widget contributions (`PersonBookingsWidget`, the four finance cards) now mount through Suspense-wrapped `React.lazy` loaders, so their chunks fetch when the slot actually renders.
  - Search schemas stay synchronous: `catalogSearchSchema` re-exports from the schema-only `catalog-search-params` module instead of the catalog main barrel; the bookings search contracts already lived in the admin entry.
  - Resources detail-page skeletons extracted to `components/resource-detail-skeletons` (re-exported from the page modules) so `pendingComponent`s no longer pin the detail pages into the entry graph.

- faec538: Generated destination resolver maps (packaged-admin RFC §4.7 endgame).

  `AdminUiRouteContribution` gains `destination?: AdminDestinationKey` +
  `destinationParams?: Record<string, string>`: a route contribution now
  DECLARES which semantic destination key its path satisfies by pure param
  interpolation (e.g. `/suppliers/$id` satisfying
  `"supplier.detail": { supplierId: string }` via `{ id: "supplierId" }`).
  The eight domain packages annotate their 29 route-backed destinations, so
  `voyant admin generate --destinations` can emit the host's resolver map
  instead of the host hand-writing it — the operator's map shrank to
  `{ ...generatedAdminDestinations, ...custom }` with only seven genuinely
  custom resolvers (search-param construction, multi-route targets, and
  host-owned pages), and `voyant admin doctor` gates on drift between the
  annotations and the generated module.

### Patch Changes

- Updated dependencies [279f97c]
- Updated dependencies [faec538]
  - @voyant-travel/availability-react@0.109.0
  - @voyant-travel/catalog-react@0.110.0
  - @voyant-travel/crm-react@0.112.0
  - @voyant-travel/finance-react@0.112.0
  - @voyant-travel/legal-react@0.112.0
  - @voyant-travel/suppliers-react@0.109.0
  - @voyant-travel/admin@0.109.0
  - @voyant-travel/products-react@0.112.0
  - @voyant-travel/identity-react@0.112.0
  - @voyant-travel/extras-react@0.112.0
  - @voyant-travel/pricing-react@0.112.0
  - @voyant-travel/bookings@0.112.0

## 0.111.0

### Minor Changes

- 478aa7c: Packaged-admin RFC §4.8 endgame — the code-assembled extension route tree.
  Package-delivered admin pages exist as NO per-route files in the host: the
  operator deleted ~50 thin host route files across all 10 admin domains; the
  route tree for extension routes is assembled in code from the contributions
  and grafted under the file-based workspace layout, with typed links intact.

  - `@voyant-travel/admin`: `AdminUiRouteContribution` grows `page?: () =>
Promise<AdminRoutePageModule>` — a lazy page-module loader (pages stay
    code-split, hover/intent preloading fetches the chunk ahead of
    navigation). The resolved component receives `AdminRoutePageProps`
    (`params`/`search`/`updateSearch`/`title`), dissolving the old "zero-prop
    components only" restriction — param-taking detail pages need no host
    route file. `AdminRouteLoaderContext` gains `params`. New helpers:
    `requireImplementedAdminRoute` (loud failure at module evaluation when a
    bound contribution loses its implementation) and `adminRoutePageModule`
    (adapter for zero-prop / all-optional-prop hosts).
  - `@voyant-travel/admin-app`: new binder — `adminExtensionRouteOptions(extension,
routeId, runtime)` returns router-facing route options (lazy component,
    loader bound to `{ queryClient, runtime, params }`, per-route `ssr`,
    boundaries) ready to spread into a code-based `createRoute({...})`, and
    `attachAdminExtensionRoutes(routeTree, parentRoute, routes)` grafts the
    built routes under the workspace layout idempotently (replace-by-path,
    dev-server re-evaluation safe).
  - All 10 `*-react` admin extensions now carry full route implementations:
    lazy `page` loaders (dynamic imports of the specific host modules, never
    the admin barrel), loaders moved verbatim from the operator route files
    (SSR modes preserved exactly, `data-only` included), pending skeletons,
    and search contracts. Bookings adds host-composition options
    (`indexHeaderActions`, `detailPageComponent` + exported
    `BookingDetailPageComponentProps`) so app-owned composition rides through
    the factory instead of a route file. Finance's supplier-invoices pages
    stay metadata-only (app-owned upload/supplier-picker/cross-domain search
    wiring) and remain host route files.

  Hosts bind everything in one checked-in generated module
  (`src/admin.routes.generated.tsx`): per route a `createRoute` call with the
  path literal + typed search schema, spreading the binder options, plus
  `AdminExtensionRoutesBy*` typed-link maps that `router.tsx` merges with the
  generated `FileRouteTypes` via `_addFileTypes` — `Link`/`navigate` stay
  fully typed for file routes and extension routes alike.

### Patch Changes

- Updated dependencies [478aa7c]
  - @voyant-travel/admin@0.108.0
  - @voyant-travel/availability-react@0.108.0
  - @voyant-travel/catalog-react@0.109.0
  - @voyant-travel/crm-react@0.111.0
  - @voyant-travel/finance-react@0.111.0
  - @voyant-travel/legal-react@0.111.0
  - @voyant-travel/suppliers-react@0.108.0
  - @voyant-travel/products-react@0.111.0
  - @voyant-travel/identity-react@0.111.0
  - @voyant-travel/extras-react@0.111.0
  - @voyant-travel/pricing-react@0.111.0
  - @voyant-travel/bookings@0.111.0

## 0.110.1

### Patch Changes

- e3fa849: Move shared booking-engine client/server types into `@voyant-travel/catalog-contracts`.

  `BookingDraftShape` and the draft-shape descriptor types + defaults (`PaxBandSpec`, `PaxBandDependency`, `DEFAULT_PAX_BANDS`, `defaultDraftShapeFlags`, `defaultTravelerFields`, `defaultBookingFields`, `paxBandsAllowedTotalFrom`, …) now live at `@voyant-travel/catalog-contracts/booking-engine/draft-shape`, and `BookingPaymentIntent` joins the V1 wire contracts at `@voyant-travel/catalog-contracts/booking-engine/contracts`. This removes the layering leak where client packages (`@voyant-travel/bookings-react`, `@voyant-travel/catalog-react`) imported contract types from the backend `@voyant-travel/catalog/booking-engine` entry — both now depend on `@voyant-travel/catalog-contracts` instead and no longer depend on `@voyant-travel/catalog` at all.

  `@voyant-travel/catalog/booking-engine` re-exports all moved symbols, so existing backend importers keep working with zero changes.

- Updated dependencies [e3fa849]
  - @voyant-travel/catalog-contracts@0.107.0
  - @voyant-travel/catalog-react@0.108.1
  - @voyant-travel/bookings@0.110.1

## 0.110.0

### Minor Changes

- 6c27159: Merge each module's `*-ui` package into its `*-react` sibling (#1652). The
  `*-react` package is now the whole client tier: the headless exports (root,
  `./hooks`, `./client`, `./provider`) are unchanged, and the styled tier moves
  in under new subpaths — `./ui` (the old `*-ui` root barrel), `./components/*`,
  `./admin`, `./i18n`, `./i18n/en`, `./i18n/ro`, and `./styles.css`.

  Migration from `@voyant-travel/<module>-ui`:

  - `@voyant-travel/<module>-ui` → `@voyant-travel/<module>-react/ui`
  - `@voyant-travel/<module>-ui/<subpath>` → `@voyant-travel/<module>-react/<subpath>`
  - package.json: drop the `-ui` dependency; `-react` covers both tiers.

  Styled-tier peers (`@voyant-travel/ui`, `@voyant-travel/admin`, `@tanstack/react-table`,
  `sonner`, `react-hook-form`, sibling `*-react` hooks packages) are optional
  peers — headless consumers that only import the root/`hooks`/`client` subpaths
  do not need them. The 27 `@voyant-travel/*-ui` packages are deprecated on npm in
  favor of these subpaths; `@voyant-travel/allocation-ui` and
  `@voyant-travel/workflow-runs-ui` (no `-react` sibling) are unaffected.

### Patch Changes

- Updated dependencies [6c27159]
- Updated dependencies [eeb23df]
  - @voyant-travel/availability-react@0.107.0
  - @voyant-travel/catalog-react@0.108.0
  - @voyant-travel/crm-react@0.110.0
  - @voyant-travel/extras-react@0.110.0
  - @voyant-travel/finance-react@0.110.0
  - @voyant-travel/identity-react@0.110.0
  - @voyant-travel/legal-react@0.110.0
  - @voyant-travel/pricing-react@0.110.0
  - @voyant-travel/products-react@0.110.0
  - @voyant-travel/suppliers-react@0.107.0
  - @voyant-travel/admin@0.107.0
  - @voyant-travel/bookings@0.110.0
  - @voyant-travel/catalog@0.108.0

## 0.109.0

### Minor Changes

- 8638834: Packaged-admin RFC booking-detail close-out: the operator's last
  booking-detail wrappers move into the packages, backed by new client hooks
  for existing server endpoints. `@voyant-travel/bookings-react` gains
  `useBookingActionLedger` (cursor-paged
  `GET /v1/admin/bookings/:id/action-ledger` feed with traveler labels) and
  `useBookingContractGenerationMutation` (preview + generate modes of
  `POST /v1/admin/bookings/:id/generate-contract`).
  `@voyant-travel/finance-react` gains `usePaymentSessions`
  (`GET /v1/admin/finance/payment-sessions` with booking/status filters),
  `usePaymentSessionMutation` (`POST …/payment-sessions/:id/complete` and
  `/cancel`) and `useBookingPaymentScheduleRegenerateMutation`
  (`POST /v1/admin/bookings/:bookingId/payment-schedule/regenerate`), plus the
  matching payment-session / payment-policy schemas and
  `financeQueryKeys.paymentSessions*` keys.

  On top of those hooks, `@voyant-travel/bookings-ui/admin` now owns the unified
  Documents tab (`BookingDocumentsTable` + `BookingContractDialog`, linking
  contract rows through a shape-locked `contract.detail` destination and the
  legal provider context's `baseUrl`) and merges the booking's central
  action-ledger entries into the Activity timeline natively
  (`useBookingActionLedgerEvents`); `BookingDetailHost` renders the Documents
  tab by default, exposes two new widget slots —
  `booking.details.finance-start` / `booking.details.finance-end`
  (`bookingDetailFinanceStartSlot` / `bookingDetailFinanceEndSlot`) — and
  forwards a new `onGenerateLink` host prop through
  `BookingDetailHostSlotContext`. `@voyant-travel/finance-ui/admin` contributes the
  finance-tab cards onto those slots (RFC §4.7 cycle resolution, same as the
  invoices tab): `BookingPendingPaymentSessionsWidget` (pending payment links
  with copy/mark-received/cancel) and `BookingPaymentPolicyWidget` (cascade
  trace + booking-level override + schedule regenerate). The operator's
  booking-detail wrapper shrinks to the two payment dialogs
  (`CollectPaymentDialog` / `RecordBookingPaymentDialog`), which stay
  app-side because `@voyant-travel/checkout-ui` / `@voyant-travel/finance-ui` depend on
  `bookings-ui`; the dead `booking-catalog-source-card`,
  `booking-pricing-summary-card`, `booking-paid-payment-sessions` and
  `booking-note-dialog` wrappers are deleted.

### Patch Changes

- @voyant-travel/bookings@0.109.0

## 0.108.1

### Patch Changes

- Updated dependencies [92af490]
  - @voyant-travel/bookings@0.108.1

## 0.108.0

### Patch Changes

- @voyant-travel/bookings@0.108.0

## 0.107.1

### Patch Changes

- @voyant-travel/bookings@0.107.1

## 0.107.0

### Patch Changes

- @voyant-travel/bookings@0.107.0

## 0.106.2

### Patch Changes

- Updated dependencies [cfa6af8]
  - @voyant-travel/bookings@0.106.2

## 0.106.1

### Patch Changes

- Updated dependencies [a0e117b]
  - @voyant-travel/bookings@0.106.1

## 0.106.0

### Patch Changes

- @voyant-travel/bookings@0.106.0

## 0.105.0

### Patch Changes

- @voyant-travel/bookings@0.105.0

## 0.104.2

### Patch Changes

- 75a6336: Add an overridable duplicate guard for booking create requests.
  - @voyant-travel/bookings@0.104.2

## 0.104.1

### Patch Changes

- @voyant-travel/bookings@0.104.1
- @voyant-travel/react@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/bookings@0.104.0
- @voyant-travel/react@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/bookings@0.103.0
- @voyant-travel/react@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/bookings@0.102.0
- @voyant-travel/react@0.102.0

## 0.101.2

### Patch Changes

- @voyant-travel/bookings@0.101.2
- @voyant-travel/react@0.101.2

## 0.101.1

### Patch Changes

- f736ba5: Improve product booking configuration for room-based travel products.

  - `@voyant-travel/products-ui`: rename the product setup UI around booking options, room inventory, traveler prices, and departure room inventory; hide traveler-age controls for room inventory units; add setup guardrails so room-based products cannot mix the legacy one-option-per-room shape with the canonical single-option/multiple-room-units shape.
  - `@voyant-travel/bookings` and `@voyant-travel/bookings-react`: preserve selected room/category refs through booking creation and quote travelers against the selected room plus traveler pricing category instead of falling back to unrelated rates.
  - `@voyant-travel/bookings-ui`: let agents select both the room and the traveler pricing category for each traveler when the selected room exposes category-specific prices, enforce room occupancy in the booking flow, and keep the booking summary aligned with the selected room.
  - `@voyant-travel/availability-react`: expose the additional resource template fields needed by room inventory setup.
  - `@voyant-travel/i18n`: add Romanian product-management labels for the renamed booking option and inventory concepts.
  - `@voyant-travel/catalog-ui`: localize ship-spec labels used by the catalog detail sheet.

- Updated dependencies [f736ba5]
  - @voyant-travel/bookings@0.101.1
  - @voyant-travel/react@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/bookings@0.101.0
- @voyant-travel/react@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/bookings@0.100.0
- @voyant-travel/react@0.100.0

## 0.99.0

### Patch Changes

- @voyant-travel/bookings@0.99.0
- @voyant-travel/react@0.99.0

## 0.98.0

### Patch Changes

- @voyant-travel/bookings@0.98.0
- @voyant-travel/react@0.98.0

## 0.97.0

### Patch Changes

- @voyant-travel/bookings@0.97.0
- @voyant-travel/react@0.97.0

## 0.96.0

### Patch Changes

- @voyant-travel/bookings@0.96.0
- @voyant-travel/react@0.96.0

## 0.95.0

### Patch Changes

- @voyant-travel/bookings@0.95.0
- @voyant-travel/react@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/bookings@0.94.0
- @voyant-travel/react@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/bookings@0.93.0
- @voyant-travel/react@0.93.0

## 0.92.0

### Patch Changes

- @voyant-travel/bookings@0.92.0
- @voyant-travel/react@0.92.0

## 0.91.0

### Patch Changes

- @voyant-travel/bookings@0.91.0
- @voyant-travel/react@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/bookings@0.90.0
- @voyant-travel/react@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/bookings@0.89.0
- @voyant-travel/react@0.89.0

## 0.88.0

### Patch Changes

- @voyant-travel/bookings@0.88.0
- @voyant-travel/react@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/bookings@0.87.1
- @voyant-travel/react@0.87.1

## 0.87.0

### Patch Changes

- @voyant-travel/bookings@0.87.0
- @voyant-travel/react@0.87.0

## 0.86.0

### Patch Changes

- @voyant-travel/bookings@0.86.0
- @voyant-travel/react@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/bookings@0.85.4
- @voyant-travel/react@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/bookings@0.85.3
- @voyant-travel/react@0.85.3

## 0.85.2

### Patch Changes

- Updated dependencies [2aac1f9]
  - @voyant-travel/bookings@0.85.2
  - @voyant-travel/react@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/bookings@0.85.1
- @voyant-travel/react@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/bookings@0.85.0
- @voyant-travel/react@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/bookings@0.84.4
- @voyant-travel/react@0.84.4

## 0.84.3

### Patch Changes

- 9eadf50: Release booking billing party snapshots so existing bookings can store individual or company billing details, including VAT/tax ID, and the billing dialog can prefill from CRM people or organizations.
- Updated dependencies [9eadf50]
  - @voyant-travel/bookings@0.84.3
  - @voyant-travel/react@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/bookings@0.84.2
- @voyant-travel/react@0.84.2

## 0.84.1

### Patch Changes

- @voyant-travel/bookings@0.84.1
- @voyant-travel/react@0.84.1

## 0.84.0

### Patch Changes

- @voyant-travel/bookings@0.84.0
- @voyant-travel/react@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/bookings@0.83.1
- @voyant-travel/react@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/bookings@0.83.0
- @voyant-travel/react@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/bookings@0.82.1
- @voyant-travel/react@0.82.1

## 0.82.0

### Patch Changes

- @voyant-travel/bookings@0.82.0
- @voyant-travel/react@0.82.0

## 0.81.21

### Patch Changes

- Updated dependencies [b9fb5b0]
  - @voyant-travel/bookings@0.81.21
  - @voyant-travel/react@0.81.21

## 0.81.20

### Patch Changes

- Updated dependencies [e60a50d]
  - @voyant-travel/bookings@0.81.20
  - @voyant-travel/react@0.81.20

## 0.81.19

### Patch Changes

- 62e4be5: Booking detail / list overhaul, part 2:

  **Activity tab**

  - Notes moved to the top, redesigned as a card grid (no more table). Add/edit via a new `BookingNoteDialog`; delete via `AlertDialog`. New backend endpoint `PATCH /v1/bookings/:id/notes/:noteId` + `bookingsService.updateNote` + `updateBookingNoteSchema` + `update` mutation on `useBookingNoteMutation`.
  - Activity timeline refactored to match the section-header pattern (no `Card` wrapper, `h2` + `Activity` icon + filter chips). Accepts `additionalEvents` + `footer` so action-ledger entries merge into the same chronological feed. New `action` filter chip surfaces only when ledger events are present.
  - Notes + activity entries now expose hydrated `authorName` / `actorName` (+ email fallback) via a server-side `LEFT JOIN auth.user` in `listNotes` / `listActivity`. UI renders name → email → id.
  - Client-side pagination on the timeline using the design-system `Pagination` / `PaginationLink` / `PaginationNext` primitives. Default page size 10, resets to page 1 on filter change.

  **Ledger tab removed** — entries flow into the unified Activity timeline via the new `useBookingActionLedgerEvents` hook (operator template), which keeps the cursor-based "Load more" pager rendered as the timeline's `footer`. `ledgerTab` slot + `tabLedger` i18n key dropped.

  **Metadata tab**

  - Tab renamed from "Meta" → "Metadata" (`tabMetadata`, value `metadata`).
  - Content redesigned as a definition-list of label-left / value-right rows surfacing booking id, booking number, status, communication language, created, updated. Uses the same `h2` + `Info` icon header as the rest.

  **Tab URL state**

  - `BookingDetailPage` accepts `activeTab` + `onTabChange` props (typed via new exported `BookingDetailTabValue`). Operator route wires these to a `tab` enum on its `validateSearch` schema. Refreshing or sharing `/bookings/:id?tab=activity` lands on the right tab.
  - Renamed `overview` tab value → `items` to match the (already-shipped) label.

  **Bookings list filters in URL**

  - New exported `BookingListFiltersState` shape. `BookingList` + `BookingsPage` accept `initialFilters?: Partial<BookingListFiltersState>` + `onFiltersChange?: (filters) => void`. Internal state collapsed into a single state object; every change emits a snapshot.
  - Operator route wires it through `validateSearch` (status, ids, dates, pax, sort, offset). URL stays clean: defaults are stripped before push, `navigate({ replace: true })` avoids history churn.
  - Bug fix: stripping `undefined` from the partial initial filters so an empty `/bookings` URL no longer clobbers the `BOOKING_STATUS_ALL` default and shows a phantom "Filters 2" badge on first land.

  **Bookings list table polish**

  - Columns reordered: `Booking # → Created → Payer → Items → Status → Total → Pax → Dates`.
  - `Sell amount` renamed to `Total`; `Start date/time` → `Dates`; `Lead` → `Payer`; search placeholder advertises what's matched (`"Search by booking #, payer, email, phone, or item…"`).
  - Backend search additionally matches item title + product-name snapshot (`exists (select 1 from booking_items …)`).
  - New compact, locale-aware `formatBookingDateRange` collapses shared month/year — `"Jun 15 – 20, 2026"` in en, `"15 – 20 iun., 2026"` in ro (uses `Intl.DateTimeFormat.formatToParts` to detect day-first order). Avoids the `Intl` `{day,year}` nonsense output by always building from named parts.
  - Primary item label includes a muted `({count} days)` tag computed from `startsAt` / `endsAt` (added to `bookingRecordItemSummarySchema` + server projection).
  - Hand-rolled prev/next pagination replaced with the design-system `Pagination` primitives (`BookingListPagination`), with ellipsis-windowed page numbers via `computePageWindow`.

  **Admin sidebar (`@voyant-travel/admin`)**

  - `DefaultOperatorAdminBrand` adds `group-data-[collapsible=icon]:justify-center` so the brand mark centres correctly when the sidebar is collapsed to icon-only.

- Updated dependencies [62e4be5]
  - @voyant-travel/bookings@0.81.19
  - @voyant-travel/react@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/bookings@0.81.18
- @voyant-travel/react@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/bookings@0.81.17
- @voyant-travel/react@0.81.17

## 0.81.16

### Patch Changes

- 0a617cc: Operator-dashboard booking-detail UX polish + finance refactors.

  **Booking list & detail**

  - Bookings index hides `draft` + `expired` by default; new `excludeStatuses` filter on the bookings list endpoint + react query keys.
  - Booking-detail subtitle now shows `Billing person / Product / Dates / PAX` with clickable links to the CRM person, product, and availability slot; product title truncates at 18rem with full-text tooltip.
  - Header action menu replaced by inline outline buttons (Edit / Change status / Cancel / Delete). Delete uses a proper `AlertDialog` instead of `window.confirm`.
  - Stat-card currency layout is now `<symbol> <amount> <code>` for every currency except RON (collapses to `<amount> RON`).
  - Items table dates use the active locale (`formatDateTime` from i18n provider) and show start → end when both timestamps exist.
  - Tabs reordered: Documents now precedes Suppliers.

  **Tab refactors (Items / Travelers / Payments / Invoices / Documents / Suppliers / Payment-schedule)**

  - All seven tabs migrated off `<Card>` + raw `<table>` onto the shared `<div data-slot>` + `DataTable` + `IconActionButton` + `StatusBadge` + `AlertDialog` pattern.
  - Snapshots opened in a `<Sheet>` so operators stay on the booking page.

  **Invoices tab**

  - New `BookingInvoiceDialog` (Dialog, not Sheet) for "New Invoice": Type segmented (Invoice / Proforma), Source segmented (Schedule / Custom), schedule-driven prefill that auto-derives net unit amount, tax%, due date; manual line items with add/remove; auto-derived Subtotal/Tax/Total (always read-only); SmartBill sync toggle (defaults on); Mark as paid switch with method + date pickers; attachment uploader when sync is off; sandboxed iframe contract preview.
  - Generate-from-schedule line items now back the tax out of the gross schedule amount (no more 21% inflation on top).
  - Server omits `subtotalCents/taxCents/totalCents` cross-check when client doesn't pre-compute totals.

  **Add-contract dialog (new)**

  - `BookingContractDialog` replaces the per-row "Generate contract" button. Two modes — Generate (default, preselected) renders an iframe preview via a new `?preview=true` branch on `/v1/admin/bookings/:id/generate-contract`, and Upload (title + PDF) creates a `signed`-status contract row + attaches the file.
  - Legal `autoGenerateContractForBooking` gains a `previewMode` option that stops after rendering HTML without persisting.

  **Payment schedule**

  - Switched `PaymentScheduleValue` from fixed slots to a `installments: PaymentInstallment[]` array. Mode-switch prefills due dates between today and **one day before departure** (clamps to today when lead time ≤ 1 day) and distributes amounts evenly. Add/remove redistributes amounts so the rows always sum to the booking total.
  - New Invoice column on the schedule table links to the invoice/proforma covering each row.
  - Generate-invoice / Generate-proforma actions hide when an invoice (or proforma) already covers the row, preventing accidental duplicate documents.
  - Server-side `assertBookingPaymentScheduleHasPaymentCoverage` no longer requires session-linked payments — it sums every completed payment under the booking's invoices (with FX-equivalent amounts via `baseAmountCents`) and subtracts other schedules already paid, so manually-recorded payments can mark a schedule paid.
  - Schedule edit dialog now surfaces server validation errors inline instead of swallowing them.

  **Record payment dialog**

  - "Convert proforma to invoice" switch shown when the selected invoice is a proforma + status is Completed. Default off; auto-flips on only when the entered amount (directly or via FX) covers the invoice's remaining balance. Heuristic freezes once the operator toggles. Conversion fires post-create so a failure surfaces without rolling back the payment.
  - `useInvoicePaymentMutation` now invalidates the booking-scoped payment lists (`admin-booking-payments`) so the table refreshes after recording.

  **Proforma → invoice linkage**

  - `getInvoiceById` returns `convertedToInvoiceId` + `convertedToInvoiceNumber` (the inverse of `convertedFromInvoiceId`). The invoice sheet shows a green "Invoiced" / "Facturat" status with a deep link to the final invoice when a void proforma was converted. Converted proformas are filtered out of the invoices table on the booking detail page.

  **New booking dialog**

  - The three document-related checkboxes (Generate contract / Generate invoice / Create as draft) collapse into two mutually-exclusive options: "Generate proforma" and "Generate invoice and contract". `invoiceType` plumbs through the catalog booking-engine contract, products handler, finance service, and react hook.

  **Misc**

  - SmartBill plugin honors a new `skipExternalSync` flag on `invoice.issued` / `invoice.proforma.issued` so per-invoice opt-out from external sync is possible.
  - SmartBill rate-limit date parser now anchors `24/05/2026 09:32:48`-style timestamps to UTC instead of the JS host's local time. The instant decoded from the same response is now identical on CI (UTC) and on developer machines in non-UTC zones (e.g. Europe/Bucharest, EEST). Fixes a pre-existing test failure when running locally outside UTC.
  - Bookings list excludeStatuses filter (string-or-array) parsed by `bookingListQuerySchema`.
  - `BookingPaymentsSummary` adds an FX equivalent column with `baseCurrency` + `baseAmountCents` plumbed through `publicFinanceBookingPaymentSchema` and the operator `useAdminBookingPayments` projection.
  - Currency combobox now correctly disables (forwards `disabled` to the inner input and hides the clear button when disabled).
  - New shared primitives in `@voyant-travel/bookings-ui`: `IconActionButton` (icon button with built-in tooltip) and `StatusBadge` (semantic tone mapping for status strings) — exported from the package root.

- Updated dependencies [0a617cc]
  - @voyant-travel/bookings@0.81.16
  - @voyant-travel/react@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/bookings@0.81.15
- @voyant-travel/react@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/bookings@0.81.14
- @voyant-travel/react@0.81.14

## 0.81.13

### Patch Changes

- Updated dependencies [28dca55]
  - @voyant-travel/bookings@0.81.13
  - @voyant-travel/react@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/bookings@0.81.12
- @voyant-travel/react@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/bookings@0.81.11
- @voyant-travel/react@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/bookings@0.81.10
- @voyant-travel/react@0.81.10

## 0.81.9

### Patch Changes

- 1a58939: Preserve billing contact address line 2 on booking snapshots and downstream documents.
- Updated dependencies [1a58939]
  - @voyant-travel/bookings@0.81.9
  - @voyant-travel/react@0.81.9

## 0.81.8

### Patch Changes

- 688ac4f: Generalize booking traveler identity snapshots from passport-only fields to typed identity documents.
- Updated dependencies [688ac4f]
  - @voyant-travel/bookings@0.81.8
  - @voyant-travel/react@0.81.8

## 0.81.7

### Patch Changes

- Updated dependencies [410cd17]
  - @voyant-travel/bookings@0.81.7
  - @voyant-travel/react@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/bookings@0.81.6
- @voyant-travel/react@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/bookings@0.81.5
- @voyant-travel/react@0.81.5

## 0.81.4

### Patch Changes

- 6daefc4: Add stable booking-create traveler keys for item and extra line traveler linkage, while keeping deprecated position-based traveler indexes as a transition fallback.
- Updated dependencies [6daefc4]
  - @voyant-travel/bookings@0.81.4
  - @voyant-travel/react@0.81.4

## 0.81.3

### Patch Changes

- Updated dependencies [f157bcd]
  - @voyant-travel/bookings@0.81.3
  - @voyant-travel/react@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/bookings@0.81.2
- @voyant-travel/react@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/bookings@0.81.1
- @voyant-travel/react@0.81.1

## 0.81.0

### Minor Changes

- f35e63c: Separate inventory units (rooms, vehicles) from pricing tiers (Adult / Child / Infant) in the booking-create flow. RFC voyant-travel/voyant#1267.

  ## What changed

  ### `@voyant-travel/bookings` — new `./pricing-assignment` sub-path

  Single source of truth for traveler→option-unit mapping, transport-agnostic. The booking-create dialog (preview + submit) is the only call site today; the server-side submit validation pathway is a follow-up — but the module is now placed where that wiring is straightforward:

  ```ts
  import {
    resolveBookingDraft,
    resolveBookingExtraLines,
  } from "@voyant-travel/bookings/pricing-assignment";
  ```

  `resolveBookingDraft` distinguishes **person-priced options** (excursions — line quantities derive from travelers) from **accommodation options** (rooms — quantities stay as the operator picked them). Returns `{ quantities, travelers, travelerIndexesByUnitId }` so submit can write `booking_item_travelers` linkage.

  `resolveBookingExtraLines` normalizes per-person extras to charged traveler quantity and stamps `travelerIndexes` so each extra line gets linked to the travelers it applies to.

  A new `roomUnitAssignmentSource: "auto" | "manual" | "none"` enum on the in-memory traveler tracks operator intent declaratively (was a one-shot `useRef` ratchet). `none` = explicit "No room" survives resolver re-runs; `auto` is re-derived; `manual` is preserved while the unit is still in the current option set.

  ### Wire format additions on `BookingCreateItemLineInput` / `BookingCreateExtraLineInput`

  - `clientLineKey?: string | null` — stable client-side key the server stamps into `booking_items.metadata.bookingCreateLineKey` for post-insert lookup.
  - `travelerIndexes?: number[] | null` — indexes (into the request's `travelers` array) the item/extra applies to. Server inserts one row in the existing `booking_item_travelers` join table per (item, traveler) pair.

  `roomUnitId` on each traveler is unchanged on the wire — current dialogs keep working without modification.

  ### `@voyant-travel/finance` — orchestrator links items to travelers

  `POST /v1/bookings/create`: after travelers + items are inserted, the orchestrator looks up each item by its stamped `metadata.bookingCreateLineKey` and writes one `booking_item_travelers` row per requested traveler. Idempotent (dedupes by `(item_id, traveler_id)`), skips silently when the converter didn't produce an item for that key.

  ### `@voyant-travel/bookings-ui` — resolver-driven dialog

  - Dropped the locally-defined `pickUnitForAge` / `redistributeByAge` (moved to the assignment module in Phase 2).
  - `displayQuantities` + submit both go through `resolveBookingDraft`. `displayExtraLines` (preview) + submit extras both go through `resolveBookingExtraLines`. No more drift.
  - The submit pipeline sends `clientLineKey` + `travelerIndexes` on every item and per-person extra so the server can link them.
  - `TravelerEntry` gains `roomUnitAssignmentSource`; category/Room/person-picker handlers set it explicitly (`manual` / `none` / `auto`).
  - Dropped the one-shot hydration `useRef` from #1265 — the source enum + resolver re-derivation handle the race + "No room" disambiguation declaratively.

  ### Architecture doc

  `docs/architecture/booking-journey-architecture.md` now codifies the invariant: traveler age/pricing band, sellable option unit, room/accommodation assignment, and explicit "no room" intent are separate draft concepts; preview totals and submit payloads must be derived from the same resolver; item/extra applicability is persisted through `booking_item_travelers`, not inferred from labels or counts. This prevents future regressions of the bug class behind #1234 / #1239 / #1262.

  ## Why this shape (vs. adding columns to `booking_travelers`)

  The `booking_item_travelers` join table already existed for participant↔item linkage. Using it for unit assignment leverages a tool that was already in the codebase — no schema migration needed, and the model naturally handles cases where one traveler is linked to several items (room + per-pax extra + ...). Adding `pricing_unit_id` / `inventory_unit_id` columns directly to `booking_travelers` (the original plan in #1267 / earlier iterations of this PR) would have been a denormalization of what the join table already expresses.

  ## Backwards compatibility

  - Existing wire-format clients that send `roomUnitId` on each traveler keep working — the server still accepts it (round-trips through, no behavioral change).
  - New clients should send `pricingUnitId` semantics through `itemLines[].travelerIndexes` (the join-table model). The current dialog still uses `roomUnitId` internally; that's fine, the resolver bridges.
  - No database migration. Pre-existing `booking_item_travelers` data is unaffected.

### Patch Changes

- Updated dependencies [f35e63c]
  - @voyant-travel/bookings@0.81.0
  - @voyant-travel/react@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/bookings@0.80.18
- @voyant-travel/react@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/bookings@0.80.17
- @voyant-travel/react@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/bookings@0.80.16
- @voyant-travel/react@0.80.16

## 0.80.15

### Patch Changes

- Updated dependencies [0d8d14e]
  - @voyant-travel/bookings@0.80.15
  - @voyant-travel/react@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/bookings@0.80.14
- @voyant-travel/react@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/bookings@0.80.13
- @voyant-travel/react@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/bookings@0.80.12
- @voyant-travel/react@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/bookings@0.80.11
- @voyant-travel/react@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/bookings@0.80.10
- @voyant-travel/react@0.80.10

## 0.80.9

### Patch Changes

- Updated dependencies [37aa8b6]
  - @voyant-travel/bookings@0.80.9
  - @voyant-travel/react@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/bookings@0.80.8
- @voyant-travel/react@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/bookings@0.80.7
- @voyant-travel/react@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/bookings@0.80.6
- @voyant-travel/react@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/bookings@0.80.5
- @voyant-travel/react@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/bookings@0.80.4
- @voyant-travel/react@0.80.4

## 0.80.3

### Patch Changes

- @voyant-travel/bookings@0.80.3
- @voyant-travel/react@0.80.3

## 0.80.2

### Patch Changes

- 9d6be13: Allow booking status overrides to suppress confirmed lifecycle events while preserving audit events.
- Updated dependencies [7a94871]
- Updated dependencies [9d6be13]
  - @voyant-travel/bookings@0.80.2
  - @voyant-travel/react@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/bookings@0.80.1
- @voyant-travel/react@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/bookings@0.80.0
- @voyant-travel/react@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/bookings@0.79.0
- @voyant-travel/react@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/bookings@0.78.0
- @voyant-travel/react@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/bookings@0.77.13
- @voyant-travel/react@0.77.13

## 0.77.12

### Patch Changes

- @voyant-travel/bookings@0.77.12
- @voyant-travel/react@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/bookings@0.77.11
- @voyant-travel/react@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/bookings@0.77.10
- @voyant-travel/react@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/bookings@0.77.9
- @voyant-travel/react@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/bookings@0.77.8
- @voyant-travel/react@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/bookings@0.77.7
- @voyant-travel/react@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/bookings@0.77.6
- @voyant-travel/react@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/bookings@0.77.5
- @voyant-travel/react@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/bookings@0.77.4
- @voyant-travel/react@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/bookings@0.77.3
- @voyant-travel/react@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/bookings@0.77.2
- @voyant-travel/react@0.77.2

## 0.77.1

### Patch Changes

- Updated dependencies [574684d]
  - @voyant-travel/bookings@0.77.1
  - @voyant-travel/react@0.77.1

## 0.77.0

### Patch Changes

- @voyant-travel/bookings@0.77.0
- @voyant-travel/react@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/bookings@0.76.0
- @voyant-travel/react@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/bookings@0.75.7
- @voyant-travel/react@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/bookings@0.75.6
- @voyant-travel/react@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/bookings@0.75.5
- @voyant-travel/react@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/bookings@0.75.4
- @voyant-travel/react@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/bookings@0.75.3
- @voyant-travel/react@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/bookings@0.75.2
- @voyant-travel/react@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/bookings@0.75.1
- @voyant-travel/react@0.75.1

## 0.75.0

### Patch Changes

- Updated dependencies [1eab599]
  - @voyant-travel/bookings@0.75.0
  - @voyant-travel/react@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/bookings@0.74.2
- @voyant-travel/react@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/bookings@0.74.1
- @voyant-travel/react@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/bookings@0.74.0
- @voyant-travel/react@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/bookings@0.73.1
- @voyant-travel/react@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/bookings@0.73.0
- @voyant-travel/react@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/bookings@0.72.0
- @voyant-travel/react@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/bookings@0.71.0
- @voyant-travel/react@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/bookings@0.70.0
- @voyant-travel/react@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/bookings@0.69.1
- @voyant-travel/react@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/bookings@0.69.0
- @voyant-travel/react@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/bookings@0.68.0
- @voyant-travel/react@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/bookings@0.67.0
- @voyant-travel/react@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/bookings@0.66.6
- @voyant-travel/react@0.66.6

## 0.66.5

### Patch Changes

- Updated dependencies [ee36ef5]
  - @voyant-travel/bookings@0.66.5
  - @voyant-travel/react@0.66.5

## 0.66.4

### Patch Changes

- Updated dependencies [83ff2de]
  - @voyant-travel/bookings@0.66.4
  - @voyant-travel/react@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/bookings@0.66.3
- @voyant-travel/react@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/bookings@0.66.2
- @voyant-travel/react@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/bookings@0.66.1
- @voyant-travel/react@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/bookings@0.66.0
- @voyant-travel/react@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/bookings@0.65.0
- @voyant-travel/react@0.65.0

## 0.64.1

### Patch Changes

- @voyant-travel/bookings@0.64.1
- @voyant-travel/react@0.64.1

## 0.64.0

### Patch Changes

- Updated dependencies [6d0c8f3]
  - @voyant-travel/bookings@0.64.0
  - @voyant-travel/react@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/bookings@0.63.1
- @voyant-travel/react@0.63.1

## 0.63.0

### Minor Changes

- 5bff9c3: Booking detail page becomes the canonical layout; booking items keep a catalog snapshot.

  `@voyant-travel/bookings-ui`

  - `BookingDetailPage` now hosts the full operator-grade layout: action menu (edit / change status / cancel / delete), summary card (sell / cost+margin / dates / travelers / person / organization / created / updated), tabs (Overview, Travelers, Payments, optional Invoices, Suppliers, Documents, Activity, optional Ledger). New slot props `header`, `afterSummary`, `overviewStart`, `overviewEnd`, `travelersStart`, `financeStart`, `financeEnd`, `documents`, `activityEnd`, plus `invoicesTab` / `ledgerTab` (`{ label?, content }`) — templates compose template-owned cards via these slots. New callbacks `onPersonOpen`, `onOrganizationOpen`, `onRecordPayment` and a `hideBreadcrumb` flag for hosts that own their own breadcrumb chrome.
  - `BookingBillingContextCard` now hydrates from CRM (`usePerson` / `useOrganization`) when the booking's contact snapshot is empty, and renders its own `Edit` button wired to `BookingBillingDialog`.
  - `BookingItemList` shows `productNameSnapshot` as the row title with `optionNameSnapshot · unitNameSnapshot` as the subtitle, and `departureLabelSnapshot` wins over derived date formatting. The `Assigned travelers` panel was removed from the expanded row (the Travelers tab already covers it).
  - `SupplierStatusList` deduplicates visually identical rows (same `supplierServiceId` / `serviceName` / `status` / cost) and shows `× N` with a summed cost; edit pencil opens the head row.
  - Default tab label change: "Finance" → "Payments". New `tabInvoices` / `tabLedger` keys. Inline breadcrumb suppressible via `hideBreadcrumb`.
  - `BookingWorkspacePage` removed (no consumers; the canonical detail page now covers the same surface).
  - New: `BookingDetailTabSlot` type export.

  `@voyant-travel/bookings`

  - `booking_items` gains catalog snapshot columns (all `text`, nullable, FK-less): `product_name_snapshot`, `option_name_snapshot`, `unit_name_snapshot`, `departure_label_snapshot`, and a decoupled `availability_slot_id` reference. Snapshots are written at create time so operators can always see "what the customer bought" — even on catalog-less deployments (OTA), and even if the catalog row is later deleted or renamed.
  - `convertProductToBooking` populates the snapshot columns and slot-id from `productsRef` / `productOptionsRef` / `optionUnitsRef` / `availabilitySlotsRef`. Caller-supplied `*Snapshot` / timing values win for OTA flows that bring their own data.
  - `createItem` / `updateItem` (template add-item path) resolve snapshots via a new internal helper. `updateItem` only refreshes snapshots when a foreign id changes — existing snapshots are the historical record and aren't overwritten on catalog renames.
  - `listItems` returns the snapshot fields with a plain select (no JOIN). `listBookingItemsForSummaries` (powers the bookings list) now COALESCEs the snapshot over the current catalog name.
  - `BOOKING_ITEM_MUTATION_FIELDS` allowlist extended for the new columns.

  `@voyant-travel/bookings-react`

  - `BookingItemRecord` exposes `availabilitySlotId`, `productNameSnapshot`, `optionNameSnapshot`, `unitNameSnapshot`, `departureLabelSnapshot`.
  - `BookingsListFilters` adds `availabilitySlotId` so the list page can filter to a specific departure.

  Bookings list page (`BookingList` + `BookingListFiltersPopover`)

  - New **Lead** column (booking's `contactFirstName contactLastName`, falls back to `contactEmail`) and **Created** column (`createdAt`, sortable). `createdAt` joins the sortable-fields union (was previously omitted).
  - New **Departure** filter scoped to the selected product. Picker pulls slots via `useSlots({ productId, limit: 50 })` and labels them with `Intl.DateTimeFormat` in the slot's own timezone so the operator sees what the customer sees. Disabled until a product is picked; auto-clears when the product changes. New i18n keys: `columns.lead`, `columns.createdAt`, `filters.departureLabel` / `departure` / `departureEmpty` / `departureNeedsProduct` (EN + RO).
  - `bookingListQuerySchema` accepts an `availabilitySlotId` query param (server); `listBookings` ANDs it into the per-item EXISTS subquery via `booking_items.availability_slot_id` (relies on the snapshot column added by the same release).

  Templates that own a booking_items table must add the new columns: see `templates/operator/migrations/0026_booking_item_snapshots.sql` for the canonical migration shape (plus optional backfill migrations 0027 + 0028 to populate snapshots from the catalog and from `metadata.availabilitySlotId` for existing rows).

### Patch Changes

- Updated dependencies [5bff9c3]
  - @voyant-travel/bookings@0.63.0
  - @voyant-travel/react@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/bookings@0.62.3
- @voyant-travel/react@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/bookings@0.62.2
- @voyant-travel/react@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/bookings@0.62.1
- @voyant-travel/react@0.62.1

## 0.62.0

### Patch Changes

- @voyant-travel/bookings@0.62.0
- @voyant-travel/react@0.62.0

## 0.61.0

### Patch Changes

- @voyant-travel/bookings@0.61.0
- @voyant-travel/react@0.61.0

## 0.60.0

### Patch Changes

- @voyant-travel/bookings@0.60.0
- @voyant-travel/react@0.60.0

## 0.59.0

### Patch Changes

- @voyant-travel/bookings@0.59.0
- @voyant-travel/react@0.59.0

## 0.58.0

### Patch Changes

- @voyant-travel/bookings@0.58.0
- @voyant-travel/react@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/bookings@0.57.0
- @voyant-travel/react@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/bookings@0.56.0
- @voyant-travel/react@0.56.0

## 0.55.1

### Patch Changes

- 819c847: Ship the composed trip admin workflow and booking extras integration.

  Admin surfaces now include trip list/detail/composer routes, catalog-backed
  trip assembly, aggregate checkout handoff, payment-link trip summaries, and
  trip-aware navigation. Booking journeys and regular booking creation can route
  operators into the composer when the customer is building a multi-component
  itinerary.

  Catalog booking draft shapes now expose richer add-on offers, and owned product
  booking handlers can price and commit selected extras. Product detail pages can
  manage extras, booking create can select extras, and finance booking creation
  persists selected extras as booking items so invoices and payment links include
  them.

  Checkout payment pages now render clearer trip summaries, flight booking UI
  supports the refined baggage/one-way behavior used by the composer, shared UI
  exports the date-time field, and i18n includes the new trip admin copy.

- Updated dependencies [819c847]
  - @voyant-travel/bookings@0.55.1
  - @voyant-travel/react@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/bookings@0.55.0
- @voyant-travel/react@0.55.0

## 0.54.0

### Patch Changes

- 3117d27: Extract booking sell-side tax-preview helpers and route mounting into `@voyant-travel/finance`.
  - @voyant-travel/bookings@0.54.0
  - @voyant-travel/react@0.54.0

## 0.53.2

### Patch Changes

- @voyant-travel/bookings@0.53.2
- @voyant-travel/react@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/bookings@0.53.1
- @voyant-travel/react@0.53.1

## 0.53.0

### Patch Changes

- Updated dependencies [a315df6]
  - @voyant-travel/bookings@0.53.0
  - @voyant-travel/react@0.53.0

## 0.52.4

### Patch Changes

- Updated dependencies [5d3c119]
  - @voyant-travel/bookings@0.52.4
  - @voyant-travel/react@0.52.4

## 0.52.3

### Patch Changes

- Updated dependencies [9679a57]
  - @voyant-travel/bookings@0.52.3
  - @voyant-travel/react@0.52.3

## 0.52.2

### Patch Changes

- 3e09123: Booking create + detail flow overhaul.

  - Rename `RoomsStepperSection` → `OptionUnitsStepperSection` across `@voyant-travel/bookings-ui` and the `@voyant-travel/ui` registry. The old name implied hospitality-only usage; the same stepper now drives any product option (rooms, cabins, vehicles, seats). Re-export kept under the new name only — consumers must update imports.
  - Rebuild `BookingCreateDialog` around the new option-units stepper, person picker, travelers section, and price-breakdown card so room/cabin/seat selection, traveler capture, and price preview share state correctly. Travelers section gains contact-points support and consistent validation messages.
  - New `BookingBillingDialog` for editing the billing person/organization + billing address on an existing booking.
  - New `useBookingTaxPreview` hook + `booking.taxPreview` query option for previewing tax breakdowns on draft bookings before issuing an invoice. Exposes a new `bookingTaxPreviewSchema` from `@voyant-travel/bookings-react/schemas`.
  - `useBookingCreateMutation`, `useBookingMutation`, and `useBookingStatusMutation` invalidate the new tax-preview and finance keys so price/invoice cards stay in sync after status transitions.
  - `@voyant-travel/bookings` service: extend `validation` with the billing-update schema, wire `status-dispatch` to the new finance.issue payload, and add a tax-preview entrypoint consumed by the operator template.
  - i18n: new `bookings-ui` and `i18n/admin/bookings` strings for the billing dialog, tax preview, option-units copy, and status-change confirmations (EN + RO).

- Updated dependencies [3e09123]
  - @voyant-travel/bookings@0.52.2
  - @voyant-travel/react@0.52.2

## 0.52.1

### Patch Changes

- Updated dependencies [335d277]
  - @voyant-travel/bookings@0.52.1
  - @voyant-travel/react@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/bookings@0.52.0
- @voyant-travel/react@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/bookings@0.51.1
- @voyant-travel/react@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/bookings@0.51.0
- @voyant-travel/react@0.51.0

## 0.50.8

### Patch Changes

- Updated dependencies [f35014f]
  - @voyant-travel/bookings@0.50.8
  - @voyant-travel/react@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/bookings@0.50.7
- @voyant-travel/react@0.50.7

## 0.50.6

### Patch Changes

- c14f0a8: Fix the booking-create flow: scrollable dialog content with reachable actions, normalized product search, future departure lookup, shared-room clearing, explicit item lines, selectable traveler people including the payer, already-paid schedule rows, and booking-create naming throughout the API/registry surface.
- Updated dependencies [c14f0a8]
  - @voyant-travel/bookings@0.50.6
  - @voyant-travel/react@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/bookings@0.50.5
- @voyant-travel/react@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/bookings@0.50.4
- @voyant-travel/react@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/bookings@0.50.3
- @voyant-travel/react@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/bookings@0.50.2
- @voyant-travel/react@0.50.2

## 0.50.1

### Patch Changes

- @voyant-travel/bookings@0.50.1
- @voyant-travel/react@0.50.1

## 0.50.0

### Patch Changes

- @voyant-travel/bookings@0.50.0
- @voyant-travel/react@0.50.0

## 0.49.0

### Patch Changes

- @voyant-travel/bookings@0.49.0
- @voyant-travel/react@0.49.0

## 0.48.0

### Patch Changes

- @voyant-travel/bookings@0.48.0
- @voyant-travel/react@0.48.0

## 0.47.0

### Patch Changes

- @voyant-travel/bookings@0.47.0
- @voyant-travel/react@0.47.0

## 0.46.0

### Patch Changes

- @voyant-travel/bookings@0.46.0
- @voyant-travel/react@0.46.0

## 0.45.0

### Patch Changes

- @voyant-travel/bookings@0.45.0
- @voyant-travel/react@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/bookings@0.44.0
- @voyant-travel/react@0.44.0

## 0.43.0

### Patch Changes

- @voyant-travel/bookings@0.43.0
- @voyant-travel/react@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/bookings@0.42.0
- @voyant-travel/react@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/bookings@0.41.3
- @voyant-travel/react@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/bookings@0.41.2
- @voyant-travel/react@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/bookings@0.41.1
- @voyant-travel/react@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/bookings@0.41.0
- @voyant-travel/react@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/bookings@0.40.1
- @voyant-travel/react@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/bookings@0.40.0
- @voyant-travel/react@0.40.0

## 0.39.0

### Minor Changes

- f4235ea: Finish the bookings passenger-to-traveler rename across the React/UI layer and shadcn registry.

  `@voyant-travel/bookings-ui` now exposes `TravelersSection` and traveler-first section value/types. `@voyant-travel/bookings-react` uses traveler hooks/query helpers over the traveler endpoints. The bookings activity enum now emits `traveler_update`; dev/operator/DMC migrations rename existing `passenger_update` activity rows.

  The shadcn registry now publishes `voyant-bookings-travelers-section` and removes the stale passenger dialog/list/section registry artifacts.

### Patch Changes

- Updated dependencies [f4235ea]
  - @voyant-travel/bookings@0.39.0
  - @voyant-travel/react@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/bookings@0.38.2
- @voyant-travel/react@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/bookings@0.38.1
- @voyant-travel/react@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/bookings@0.38.0
- @voyant-travel/react@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/bookings@0.37.1
- @voyant-travel/react@0.37.1

## 0.37.0

### Minor Changes

- 4c93561: Add supplier, product category, option, person, and organization filters to the bookings list API and UI.
- dc29b79: Persist operator-confirmed booking totals from the create dialog and audit manual price overrides with a required reason.

### Patch Changes

- Updated dependencies [4c93561]
- Updated dependencies [dc29b79]
  - @voyant-travel/bookings@0.37.0
  - @voyant-travel/react@0.37.0

## 0.36.0

### Minor Changes

- 15e6953: Expose slot-scoped traveler sharing groups through bookings routes and React hooks, and wire traveler allocation metadata through travel-details validation.

### Patch Changes

- Updated dependencies [15e6953]
  - @voyant-travel/bookings@0.36.0
  - @voyant-travel/react@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/bookings@0.35.0
- @voyant-travel/react@0.35.0

## 0.34.0

### Patch Changes

- @voyant-travel/bookings@0.34.0
- @voyant-travel/react@0.34.0

## 0.33.1

### Patch Changes

- 9bee9aa: Hydrate booking list item summaries with product names and prefer those names in the Bookings list "What booked" column.
- Updated dependencies [9bee9aa]
  - @voyant-travel/bookings@0.33.1
  - @voyant-travel/react@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/bookings@0.33.0
- @voyant-travel/react@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/bookings@0.32.3
- @voyant-travel/react@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/bookings@0.32.2
- @voyant-travel/react@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/bookings@0.32.1
- @voyant-travel/react@0.32.1

## 0.32.0

### Patch Changes

- Updated dependencies [6ea6ded]
  - @voyant-travel/bookings@0.32.0
  - @voyant-travel/react@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/bookings@0.31.4
- @voyant-travel/react@0.31.4

## 0.31.3

### Patch Changes

- @voyant-travel/bookings@0.31.3
- @voyant-travel/react@0.31.3

## 0.31.2

### Patch Changes

- @voyant-travel/bookings@0.31.2
- @voyant-travel/react@0.31.2

## 0.31.1

### Patch Changes

- @voyant-travel/bookings@0.31.1
- @voyant-travel/react@0.31.1

## 0.31.0

### Patch Changes

- @voyant-travel/bookings@0.31.0
- @voyant-travel/react@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/bookings@0.30.7
- @voyant-travel/react@0.30.7

## 0.30.6

### Patch Changes

- @voyant-travel/bookings@0.30.6
- @voyant-travel/react@0.30.6

## 0.30.5

### Patch Changes

- @voyant-travel/bookings@0.30.5
- @voyant-travel/react@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/bookings@0.30.4
- @voyant-travel/react@0.30.4

## 0.30.3

### Patch Changes

- @voyant-travel/bookings@0.30.3
- @voyant-travel/react@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/bookings@0.30.2
- @voyant-travel/react@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/bookings@0.30.1
- @voyant-travel/react@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/bookings@0.30.0
- @voyant-travel/react@0.30.0

## 0.29.0

### Patch Changes

- Updated dependencies [3420711]
  - @voyant-travel/bookings@0.29.0
  - @voyant-travel/react@0.29.0

## 0.28.3

### Patch Changes

- @voyant-travel/bookings@0.28.3
- @voyant-travel/react@0.28.3

## 0.28.2

### Patch Changes

- @voyant-travel/bookings@0.28.2
- @voyant-travel/react@0.28.2

## 0.28.1

### Patch Changes

- @voyant-travel/bookings@0.28.1
- @voyant-travel/react@0.28.1

## 0.28.0

### Patch Changes

- @voyant-travel/bookings@0.28.0
- @voyant-travel/react@0.28.0

## 0.27.0

### Patch Changes

- @voyant-travel/bookings@0.27.0
- @voyant-travel/react@0.27.0

## 0.26.9

### Patch Changes

- @voyant-travel/bookings@0.26.9
- @voyant-travel/react@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/bookings@0.26.8
- @voyant-travel/react@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/bookings@0.26.7
- @voyant-travel/react@0.26.7

## 0.26.6

### Patch Changes

- Updated dependencies [571e340]
  - @voyant-travel/bookings@0.26.6
  - @voyant-travel/react@0.26.6

## 0.26.5

### Patch Changes

- @voyant-travel/bookings@0.26.5
- @voyant-travel/react@0.26.5

## 0.26.4

### Patch Changes

- @voyant-travel/bookings@0.26.4
- @voyant-travel/react@0.26.4

## 0.26.3

### Patch Changes

- @voyant-travel/bookings@0.26.3
- @voyant-travel/react@0.26.3

## 0.26.2

### Patch Changes

- @voyant-travel/bookings@0.26.2
- @voyant-travel/react@0.26.2

## 0.26.1

### Patch Changes

- c0507a6: Move toxic PII to `crm.people` and add structured `person_documents` (closes #440 and #443).

  `user_profiles` is no longer the home for encrypted PII. The four free-text slots (accessibility / dietary / loyalty / insurance) move to `crm.people` so operator-managed humans without auth accounts can carry them, and identity documents graduate to a structured `person_documents` table with type / expiry / issuing authority / attachment + a partial unique index pinning a single primary doc per type per person.

  Booking travelers now snapshot dietary, accessibility, and the primary passport from the linked person record at create time (snapshot-on-create, explicit input always wins) via a new `POST /v1/admin/bookings/:id/travelers/with-travel-details` route. Templates wire the snapshot via `createBookingsHonoModule({ resolveTravelSnapshot })` delegating to `crmService.loadPersonTravelSnapshot` — bookings stays free of any direct CRM dependency.

  Customer portal exposes plaintext `accessibility/dietary/loyalty/insurance` on `/me` plus full CRUD over `/me/documents`. CRM admin gains server-side encrypt/decrypt endpoints (`travel-snapshot`, `profile-pii`, `*/from-plaintext`) so the operator booking-traveler dialog can pre-fill from profile and push diverging values back without the browser holding KMS material. The dialog itself now ships a "Travel details" section with passport / dietary / accessibility fields, plus "Pre-fill from profile" and "Save to profile" affordances when a CRM person is linked.

  Breaking changes (intentionally landed pre-1.0):

  - `user_profiles.documentsEncrypted/accessibilityEncrypted/dietaryEncrypted/loyaltyEncrypted/insuranceEncrypted` columns are removed. Migration ships `templates/operator/migrations/0024_people_pii_documents.sql`.
  - `customerPortalProfileSchema.documents` (array) replaced with separate `accessibility/dietary/loyalty/insurance` plaintext string fields. Document CRUD lives at `/v1/public/customer-portal/me/documents`.
  - `bookingsHonoModule` and `crmHonoModule` are still exported but the env-driven default factory `createBookingsHonoModule()` / `createCrmHonoModule()` is the new recommended entry point.

- Updated dependencies [c0507a6]
  - @voyant-travel/bookings@0.26.1
  - @voyant-travel/react@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/bookings@0.26.0
- @voyant-travel/react@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/bookings@0.25.0
- @voyant-travel/react@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/bookings@0.24.3
- @voyant-travel/react@0.24.3

## 0.24.2

### Patch Changes

- @voyant-travel/bookings@0.24.2
- @voyant-travel/react@0.24.2

## 0.24.1

### Patch Changes

- @voyant-travel/bookings@0.24.1
- @voyant-travel/react@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/bookings@0.24.0
- @voyant-travel/react@0.24.0

## 0.23.0

### Patch Changes

- @voyant-travel/bookings@0.23.0
- @voyant-travel/react@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/bookings@0.22.0
- @voyant-travel/react@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/bookings@0.21.1
- @voyant-travel/react@0.21.1

## 0.21.0

### Minor Changes

- 6427bad: Release the booking journey architecture train.

  This adds booking hold policy support, richer traveler and booking journey flows, operator tax policy configuration, finance billing and tax policy APIs, notification reminder target and delivery tooling, and the template/runtime wiring needed for the operator storefront checkout flow.

### Patch Changes

- Updated dependencies [6427bad]
  - @voyant-travel/bookings@0.21.0
  - @voyant-travel/react@0.21.0

## 0.20.0

### Patch Changes

- @voyant-travel/bookings@0.20.0
- @voyant-travel/react@0.20.0

## 0.19.0

### Patch Changes

- @voyant-travel/bookings@0.19.0
- @voyant-travel/react@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies [8932f60]
  - @voyant-travel/bookings@0.18.0
  - @voyant-travel/react@0.18.0

## 0.17.0

### Patch Changes

- 66d722d: `CreateBookingItemInput` and `UpdateBookingItemInput` are now derived from the server's `insertBookingItemSchema` / `updateBookingItemSchema` via `z.input<typeof …>` — eliminating drift between the client type and the server's accepted shape. Picks up 7 fields the hand-rolled interface had missed: `productId`, `optionId`, `optionUnitId`, `pricingCategoryId`, `sourceSnapshotId`, `sourceOfferId`, `metadata`. Consumers building "custom itinerary" admin UIs can now pass `productId` / `optionId` to `useBookingItemMutation().create.mutateAsync(...)` without a type assertion.
- Updated dependencies [66d722d]
  - @voyant-travel/bookings@0.17.0
  - @voyant-travel/react@0.17.0

## 0.16.0

### Patch Changes

- @voyant-travel/bookings@0.16.0
- @voyant-travel/react@0.16.0

## 0.15.0

### Patch Changes

- @voyant-travel/bookings@0.15.0
- @voyant-travel/react@0.15.0

## 0.14.0

### Patch Changes

- @voyant-travel/bookings@0.14.0
- @voyant-travel/react@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [7dfbc05]
- Updated dependencies [15dda79]
  - @voyant-travel/bookings@0.13.0
  - @voyant-travel/react@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies [944d244]
- Updated dependencies [cc561ce]
  - @voyant-travel/bookings@0.12.0
  - @voyant-travel/react@0.12.0

## 0.11.0

### Minor Changes

- fe905b0: **BREAKING:** privatize the Booking state machine; add Start, Complete, and Override verbs.

  The transition graph (`BOOKING_TRANSITIONS`, `canTransitionBooking`, `transitionBooking`, `BookingStatusPatch`, `BookingTransitionError`) is no longer part of the `@voyant-travel/bookings` public surface. The lifecycle laws live behind the service-verb seam — callers cross it via named verbs in the ubiquitous language. `BookingStatus` stays exported (it's data).

  **HTTP — verb routes replace the generic status PATCH:**

  - `PATCH /:id/status` is **removed**.
  - `POST /:id/start` — confirmed → in_progress (new). Emits `booking.started`.
  - `POST /:id/complete` — in_progress → completed (new). Emits `booking.completed`. Cascades confirmed allocations + items to `fulfilled`.
  - `POST /:id/override-status` — admin override that bypasses the transition graph (new). Updates the Booking row only; does **not** cascade. Requires a non-empty `reason`. Emits `booking.status_overridden` as a privileged audit signal distinct from the normal lifecycle events.

  `POST /:id/confirm`, `/:id/cancel`, `/:id/expire`, `/:id/extend-hold` are unchanged.

  **Service:**

  - `bookingsService.updateBookingStatus(...)` is **removed**.
  - `bookingsService.startBooking(...)`, `.completeBooking(...)`, `.overrideBookingStatus(...)` are added.
  - `updateBookingStatusSchema` is removed; `startBookingSchema`, `completeBookingSchema`, `overrideBookingStatusSchema` are added.
  - Activity-type enum gains `booking_started`, `booking_completed`, `status_overridden`. Run `drizzle-kit push` to sync.

  **React (`@voyant-travel/bookings-react`):**

  `useBookingStatusMutation` / `useBookingStatusByIdMutation` now require `currentStatus` in their input. The hook dispatches client-side to the right verb endpoint; non-adjacent jumps fall through to `/override-status`, using the operator's note as the reason. The `<StatusChangeDialog>` UX is unchanged — pass the booking's current status from props.

  **Domain language:** `Start`, `Complete`, and `Override` are added to UBIQUITOUS_LANGUAGE.md as Booking-scoped lifecycle verbs.

  **Migration:**

  - Remove imports of `BOOKING_TRANSITIONS` / `canTransitionBooking` / `transitionBooking` / `BookingTransitionError` / `BookingStatusPatch` from `@voyant-travel/bookings` — call the service verbs instead. Internal callers (within this monorepo) had none.
  - Replace `PATCH /v1/bookings/:id/status` calls with the matching verb endpoint, or `/override-status` with a `reason`.
  - Update calls to the React status hooks to pass `currentStatus`.

### Patch Changes

- Updated dependencies [fe905b0]
  - @voyant-travel/bookings@0.11.0
  - @voyant-travel/react@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
  - @voyant-travel/bookings@0.10.0
  - @voyant-travel/react@0.10.0

## 0.9.0

### Minor Changes

- 3a6a4db: **Rename**: `QuickBookDialog` → `BookingCreateDialog` across the registry, operator, and dmc templates. The dialog was originally a lightweight create alternative to a flat-form CTA, but since the composition slice landed (#264 — product / departure / rooms / person / shared-room / passengers / price breakdown / voucher / payment schedule all wired through the atomic `/quick-create` endpoint) it IS the booking-create workflow. Keeping "Quick Book" in the name actively misled operators.

  **Bumped via this changeset but not code-changed on npm**: this package is on the fixed release train with everything else, so it ships the version bump alongside the others. The actual rename lives in `@voyant-travel/ui` (registry, in the ignore list), `@voyant-travel/i18n` (private), and the templates — consumers see the effect via fresh starter archives (`voyant new`) or the next `shadcn add`.

  Breaking for consumers who copied the registry component earlier:

  - `QuickBookDialog` → `BookingCreateDialog` (symbol)
  - `quick-book-dialog.tsx` → `booking-create-dialog.tsx` (file path)
  - Registry entry `voyant-bookings-quick-book-dialog` → `voyant-bookings-booking-create-dialog`
  - i18n namespace `bookings.quickBook` → `bookings.create`; `bookings.list.quickBook` removed (booking list now has a single "+ New Booking" CTA)
  - `BookingDialog` now declares `voyant-bookings-booking-create-dialog` as a registry dep, so `shadcn add voyant-bookings-booking-dialog` pulls both in automatically

  Consumers who migrated the files locally can drop the old `QuickBookDialog` copy and regenerate via the registry, or run the equivalent of `grep -rl 'QuickBookDialog\|quick-book-dialog\|bookings\\.quickBook' | xargs sed -i ''` on their app.

### Patch Changes

- @voyant-travel/bookings@0.9.0
- @voyant-travel/react@0.9.0

## 0.8.0

### Patch Changes

- @voyant-travel/bookings@0.8.0
- @voyant-travel/react@0.8.0

## 0.7.0

### Minor Changes

- 96612b3: Bookings-create composition surface (#223) and vouchers-as-first-class (#227) — the packages on the release train all move together, so this covers the batch.

  **Atomic booking create (#263, #264, #265, #266)**

  - `POST /v1/admin/bookings/quick-create` — one-shot endpoint that converts a product, inserts travelers + payment schedules, redeems a voucher, and creates/joins a `booking_group` inside a single DB transaction. `quickCreateBooking(db, input, { userId, runtime })` service in `@voyant-travel/finance`; `useBookingQuickCreateMutation` in `@voyant-travel/bookings-react`.
  - `POST /v1/admin/bookings/dual-create` — partaj flow: two bookings + one shared-room group, also atomic. `dualCreateBooking` service, `useBookingDualCreateMutation` hook.
  - `booking.quick-created` and `booking.dual-created` events emitted post-commit when a runtime eventBus is wired.
  - `QuickBookDialog` now mounts all nine picker sections (product, departure, rooms, person, shared-room, passengers, price breakdown, voucher, payment schedule) and submits via quick-create. Post-create "Confirm & notify traveler" toggle uses the new `useBookingStatusByIdMutation` to transition the fresh booking to `confirmed` — which (when `autoConfirmAndDispatch` is on) fires the doc bundle + traveler email through the existing `booking.confirmed` subscriber.
  - Bookings fix: `productDaysRef` / `getConvertProductData` now join through `product_itineraries` to match the real products schema; the existing `POST /v1/bookings/from-product` convert path works again.

  **Vouchers as first-class financial instruments (#262, #267)**

  - One-shot data migration: `migrateVouchersFromPaymentInstruments(db, opts)` in `@voyant-travel/finance` (CLI wrapper `pnpm -F @voyant-travel/finance migrate:vouchers`, `--dry-run` supported). Idempotent; pulls code, currency, amount, expiry from legacy JSONB metadata into the new `vouchers` table.
  - `vouchers.validFrom` (start-of-validity, maps to OpenTravel `Finance.Voucher.effectiveDate`) and `vouchers.seriesCode` (batch/campaign id, maps to `Finance.Voucher.seriesCode`) columns added. Redeem guard returns `voucher_not_started` when now < validFrom; the public `validateVoucher` `not_started` branch is now reachable. `seriesCode` exposed as a list filter. Migration pulls both from legacy metadata (honouring OpenTravel's `effectiveDate` alias).

### Patch Changes

- Updated dependencies [96612b3]
  - @voyant-travel/bookings@0.7.0
  - @voyant-travel/react@0.7.0

## 0.6.9

### Patch Changes

- 7619ef0: Continue the traveler-first booking contract cleanup across the published booking surfaces while preserving compatibility aliases.

  - `@voyant-travel/bookings`: add traveler-first public aliases for booking travel details, group traveler routes, public booking-session traveler input, and traveler-facing validation/error wording while keeping legacy participant/passenger compatibility routes and schemas.
  - `@voyant-travel/bookings-react`: make traveler hooks, query options, schemas, and exports the primary surface again; keep passenger/item-participant names as compatibility aliases instead of separate primaries.
  - `@voyant-travel/customer-portal` and `@voyant-travel/customer-portal-react`: move booking import schemas, operations, and exports to traveler-first names while preserving legacy participant aliases and routes.
  - `@voyant-travel/transactions`: expose traveler-first request/response aliases and traveler route aliases for offer/order traveler and item-traveler flows while preserving legacy participant compatibility endpoints.
  - `@voyant-travel/auth-react`: add exported query keys, query options, and schemas for current workspace, organization members, and organization invitations so app surfaces can consume the auth workspace contract directly.
  - `@voyant-travel/products` and `@voyant-travel/products-react`: tighten the itinerary-facing public surface and query/schema exports used by the shared product itinerary UI.
  - `@voyant-travel/legal` and `@voyant-travel/notifications`: keep template authoring and Liquid exports available from the package roots while aligning the notification/template surface with the updated booking traveler contract.
  - Supporting packages and tests also picked up repo-wide import-order, lint, and small compatibility cleanups across auth, booking requirements, checkout, octo, pricing, sellability, storefront, and utilities as part of bringing the whole worktree back to a green release state.
  - Align the touched app/template compatibility wrappers with the new primary traveler and workspace surfaces, and keep repo `typecheck` / `lint` green after the broader cleanup.

- Updated dependencies [7619ef0]
  - @voyant-travel/bookings@0.6.9
  - @voyant-travel/react@0.6.9

## 0.6.8

### Patch Changes

- Updated dependencies [b218885]
  - @voyant-travel/bookings@0.6.8
  - @voyant-travel/react@0.6.8

## 0.6.7

### Patch Changes

- @voyant-travel/bookings@0.6.7
- @voyant-travel/react@0.6.7

## 0.6.6

### Patch Changes

- @voyant-travel/bookings@0.6.6
- @voyant-travel/react@0.6.6

## 0.6.5

### Patch Changes

- Updated dependencies [ae9933b]
  - @voyant-travel/bookings@0.6.5
  - @voyant-travel/react@0.6.5

## 0.6.4

### Patch Changes

- @voyant-travel/bookings@0.6.4
- @voyant-travel/react@0.6.4

## 0.6.3

### Patch Changes

- @voyant-travel/bookings@0.6.3
- @voyant-travel/react@0.6.3

## 0.6.2

### Patch Changes

- @voyant-travel/bookings@0.6.2
- @voyant-travel/react@0.6.2

## 0.6.1

### Patch Changes

- @voyant-travel/bookings@0.6.1
- @voyant-travel/react@0.6.1

## 0.6.0

### Minor Changes

- b7d56c5: Add `useBookingPrimaryProduct(bookingId)` hook and make `BookingCancellationDialog` + `BookingGroupSection` self-resolve `productId` (and `optionUnitId`) from the booking's items.

  The hook returns `{ productId, optionUnitId, isPending, isLoading }`, using the canonical "first item with a non-null productId" rule — the same heuristic every consumer was duplicating. Components auto-resolve by default when the prop is `undefined`; pass an explicit string or `null` as an override for multi-product bookings or to force the non-product-scoped policy.

  This fixes a quiet correctness regression where callers who forgot to wire `productId` silently fell back to the default cancellation policy instead of the product-scoped one.

- 521147e: Add canonical booking status presentation helpers to `@voyant-travel/bookings-react`:

  - `bookingStatusBadgeVariant: Record<BookingStatus, 'default' | 'secondary' | 'outline' | 'destructive'>` — exhaustive (not `Record<string, …>`), so adding a new booking status becomes a compile error here instead of a silent UX miss in every app.
  - `formatBookingStatus(status)` — humanized label (`"in_progress"` → `"In Progress"`).
  - `bookingStatuses` / `bookingStatusOptions` — status list derived from the Zod schema, ready for Select pickers.
  - `BookingStatus` type (now exported from `./schemas`).

  Registry components in `@voyant-travel/ui` (`booking-list`, `booking-detail-page` copies, `status-change-dialog`) drop their duplicated local `statusVariant` / `formatStatus` / `BOOKING_STATUSES` constants and consume these instead — single source of truth.

### Patch Changes

- @voyant-travel/bookings@0.6.0
- @voyant-travel/react@0.6.0

## 0.5.0

### Minor Changes

- ce72e29: Flesh out the operator booking workspace with React hooks for the sections that already existed on the backend.

  - `@voyant-travel/bookings-react`: add hooks for booking items (`useBookingItems`, `useBookingItemMutation`), item-traveler assignment (`useBookingItemTravelers` / `useBookingItemTravelerMutation`), documents (`useBookingDocuments`, `useBookingDocumentMutation`), cancellation (`useBookingCancelMutation`), and convert-from-product (`useBookingConvertMutation`).
  - `@voyant-travel/finance-react`: add hooks for booking payment schedules (`useBookingPaymentSchedules`, `useBookingPaymentScheduleMutation`) and booking guarantees (`useBookingGuarantees`, `useBookingGuaranteeMutation`).
  - `@voyant-travel/legal-react`: add policy resolution (`useResolvePolicy`) and cancellation evaluation (`useEvaluateCancellation`) hooks that power the structured booking cancellation workflow.

- ce72e29: Add a shared-room / split-booking group model

  Multiple separate bookings can now intentionally share one room/accommodation while each booking keeps its own finance + traveler records. Inspired by the ProTravel v3 `sharing_groups` pattern: flat peer bookings, a lightweight `booking_groups` + `booking_group_members` schema, smart cleanup on cancellation.

  `@voyant-travel/bookings`: new `bookingGroups` and `bookingGroupMembers` tables (TypeID prefixes `bkgr` / `bkgm`), service functions for CRUD plus reverse lookup, unified traveler list across members, and automatic group dissolution when a cancellation leaves ≤1 active members. New routes under `/v1/bookings/groups` plus the REST-nested `GET /v1/bookings/:id/group`.

  `@voyant-travel/bookings-react`: hooks for `useBookingGroups`, `useBookingGroup`, `useBookingGroupForBooking`, `useBookingGroupMutation`, and `useBookingGroupMemberMutation` (stateless — accepts `groupId` per-call so create-then-add flows work with a single hook instance).

  `@voyant-travel/db`: register TypeID prefixes `bkgr` (booking_groups) and `bkgm` (booking_group_members).

### Patch Changes

- Updated dependencies [ce72e29]
  - @voyant-travel/bookings@0.5.0
  - @voyant-travel/react@0.5.0

## 0.4.5

### Patch Changes

- @voyant-travel/bookings@0.4.5
- @voyant-travel/react@0.4.5

## 0.4.4

### Patch Changes

- @voyant-travel/bookings@0.4.4
- @voyant-travel/react@0.4.4

## 0.4.3

### Patch Changes

- @voyant-travel/bookings@0.4.3
- @voyant-travel/react@0.4.3

## 0.4.2

### Patch Changes

- @voyant-travel/bookings@0.4.2
- @voyant-travel/react@0.4.2

## 0.4.1

### Patch Changes

- Updated dependencies [4c4ea3c]
  - @voyant-travel/bookings@0.4.1
  - @voyant-travel/react@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies [e84fe0f]
  - @voyant-travel/bookings@0.4.0
  - @voyant-travel/react@0.4.0

## 0.3.1

### Patch Changes

- 8566f2d: Add first-class public booking-session wizard state and storefront repricing.

  `@voyant-travel/bookings` now persists wizard session state in `booking_session_states`,
  includes that state in public session reads, exposes public state read/write
  routes, and adds `POST /v1/public/bookings/sessions/:sessionId/reprice` for
  previewing or applying room/unit repricing back onto the booking session.

  `@voyant-travel/bookings-react` now exports public session/state query helpers and a
  mutation helper for session state updates and repricing.

- Updated dependencies [8566f2d]
- Updated dependencies [8566f2d]
  - @voyant-travel/bookings@0.3.1
  - @voyant-travel/react@0.3.1

## 0.3.0

### Patch Changes

- 90bcdb1: Add reusable query-option builders for bookings data so TanStack route loaders can prefetch bookings pages against the shared React Query cache.
- e57725d: Flatten frontend provider wiring around a shared `@voyant-travel/react` config provider so module react packages can share one app-level Voyant context.
- Updated dependencies [e57725d]
  - @voyant-travel/bookings@0.3.0
  - @voyant-travel/react@0.3.0
