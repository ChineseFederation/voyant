# @voyant-travel/ui

## 0.109.6

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/utils@0.110.0

## 0.109.5

### Patch Changes

- e2cb9f5: Match the phone input's border radius to the other form controls. The composed
  `PhoneInput` hard-coded `rounded-lg` on its outer corners (the country-select
  button and the number field), so it looked rounder than the sibling inputs,
  selects and buttons, which all use `rounded-sm`. Align both outer corners to
  `rounded-sm`.
- e2cb9f5: Guarantee the sticky-footer layout for sheets. `SheetContent` is now
  `overflow-hidden` and `SheetHeader`/`SheetFooter` are `shrink-0`, so the header
  stays pinned at the top and the actions stay pinned at the bottom while the
  scrollable `SheetBody` region scrolls between them — regardless of content
  height. This makes the pattern the existing sheets already follow impossible to
  break. Also switch the action-ledger entry sheet from a hard-coded
  `h-[calc(100vh-9rem)]` scroll area to a `flex-1` one so it participates in the
  same frame.
- e2cb9f5: Replace native browser dialogs with styled UI-package dialogs across the admin
  surface. Adds `confirmDialog`/`ConfirmDialogHost` and `promptDialog`/
  `PromptDialogHost` to `@voyant-travel/ui`, mounts both hosts once in the
  operator admin shell, and migrates every `window.confirm`/`window.prompt` call
  and stray `window.alert` in the `*-react` packages to the styled equivalents
  (destructive confirmations rendered with the destructive action variant). Also
  fixes the event-catalog "selected event contracts" count to use ICU plural
  formatting.

## 0.109.4

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/utils@0.109.0

## 0.109.3

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/utils@0.108.0

## 0.109.2

### Patch Changes

- 766d24b: Associate admin form controls with visible labels and validation messages, and add accessible names to phone, channel, product translation, tag, action-menu, and channel-assignment helpers.

## 0.109.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
  - @voyant-travel/utils@0.107.1

## 0.109.0

### Minor Changes

- 8bd906f: Breaking beta cleanup: remove the deprecated `onInsertVariable` and
  `onInsertSnippet` props from `ContractTemplateAuthoringHelp`. The helper only
  supports copying template values and snippets to the clipboard; consumers
  should remove these ignored callbacks. Also remove the inert Legal and
  Notifications caller wiring.

### Patch Changes

- Updated dependencies [4d0eeed]
  - @voyant-travel/utils@0.107.0

## 0.108.11

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/utils@0.106.0

## 0.108.10

### Patch Changes

- b254511: Normalize currency inputs safely and prevent booking header totals from drifting from booking items.

## 0.108.9

### Patch Changes

- 0b57296: Fix the Settings → Price Catalogs create form silently dropping a typed currency. The currency control is a combobox whose committed value only changed when a row was picked from the list, so typing a code like `EUR` and submitting persisted a blank currency. The shared `CurrencyCombobox` now commits a fully-typed ISO code (case-insensitive) even when the matching row is never selected, and the price catalog form reuses that canonical picker instead of a local one that did not bind typed text to the form value. The currency input also forwards an `id`, and the price catalog dialog fields now associate their `<Label htmlFor>` with the inputs.

## 0.108.8

### Patch Changes

- 66ac9f3: Render unbounded numeric inputs as numeric text inputs to avoid invalid accessibility max values.

## 0.108.7

### Patch Changes

- f37a3f1: Expose async combobox search results through the Base UI collection so options are visible to assistive technology.

## 0.108.6

### Patch Changes

- f3fd455: Keep the Trips Cruise embarkation field on the same shared accessible date picker path as Flight, and ensure shared calendar days expose named button controls for assistive tooling.

## 0.108.5

### Patch Changes

- d4f27d5: Remove unused UI package runtime dependencies and declare the PostCSS config type dependency.

## 0.108.4

### Patch Changes

- 72a81df: Compile UI orientation styles against explicit `data-orientation` selectors so
  published starter builds render tabs, sliders, separators, scrollbars, and
  toggle groups correctly even when host stylesheets do not register shorthand
  orientation variants before scanning package classes.

## 0.108.3

### Patch Changes

- 4bf1c7b: Release the sidebar scrollbar styling fix so published consumers receive the
  `no-scrollbar` utility emitted by UI components.

## 0.108.2

### Patch Changes

- Updated dependencies [7cb6fa7]
  - @voyant-travel/i18n@0.109.0

## 0.108.1

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/i18n@0.108.0
  - @voyant-travel/utils@0.105.3

## 0.108.0

### Minor Changes

- a74471e: Re-export sonner's `toast` from the components barrel, so consumers fire toasts via `@voyant-travel/ui` (alongside the already-exported `Toaster`) instead of importing `sonner` directly.

### Patch Changes

- Updated dependencies [a74471e]
  - @voyant-travel/i18n@0.107.0

## 0.107.0

### Minor Changes

- 4f92198: Voyant 1.0 visual refactor of the framework UI.

  - **Tokens** (`@voyant-travel/ui` `globals.css`): warm off-white paper, near-black ink, and a single hot-orange brand accent (`--brand`, new token) reserved for charts/focus/active state. Inter Tight type. Fixed brand chart palette (`--chart-1..5`). A coherent radius system: controls + their dropdowns at `rounded-sm` (4px), cards/table surfaces at `rounded-md` (6px), dialogs/sheets at `rounded-xl`.
  - **`@voyant-travel/ui` components**: new `SegmentedControl`; `Button` gains a `brand` variant; sharper, consistent radii across Button/Input/Select/Combobox/Textarea/Toggle/Tabs/Menus/Command/Card/DataTable/Badge; bordered active sidebar items (primary + sub) and inset-panel border; assorted fixes (Command search-input radius, toggle-group corners, sidebar sub-menu spacing).
  - **`@voyant-travel/admin`**: Voyant 1.0 brand logo lockup (composed mark + wordmark, collapse-to-badge); operator shell defaults to the inset sidebar layout; dashboard KPI cards, brand chart colors, and Figma-matched sidebar (bordered active item, near-black nav text, bordered user card with open-state).
  - **Domain `*-react` packages**: card surfaces normalized to the new `rounded-md` radius; flights search bar (trip-type toggle, route cards, airport dropdown) and the resources tabs aligned to the system.

## 0.106.2

### Patch Changes

- 28898ad: Fix migration-facing publish artifacts by exporting all Distribution-owned supplier and external-reference schemas, republishing contract packages with complete dist files, guarding packed artifacts against legacy package-scope specifiers, and updating Voyant Cloud defaults to `https://api.voyant.travel`.
- Updated dependencies [28898ad]
  - @voyant-travel/utils@0.105.2

## 0.106.1

### Patch Changes

- Updated dependencies [b0f1e21]
  - @voyant-travel/utils@0.105.0

## 0.106.0

### Minor Changes

- 3bd66e9: Packaged-admin RFC notifications pages delivered: the notification admin
  pages move out of `@voyant-travel/ui` into `@voyant-travel/notifications-ui/admin`
  as packaged hosts — `NotificationTemplatesHost`,
  `NotificationTemplateDetailHost`, `NotificationReminderRulesHost`,
  `NotificationReminderRuleDetailHost`, `NotificationDeliveriesHost`,
  `NotificationReminderRunsHost`, `RemindersPreviewHost` and
  `NotificationSettingsHost`, plus the `NotificationTemplateDialog`,
  `NotificationReminderRuleDialog`, `NotificationDeliveryDetailDialog` and
  `NotificationTemplateAuthoringHelp` building blocks. Cross-route links
  resolve through new semantic destination keys (RFC §4.7):
  `notificationTemplate.list`/`notificationTemplate.detail` and
  `notificationReminderRule.list`/`notificationReminderRule.detail`, via
  `useAdminHref` + `useAdminNavigate`. `createNotificationsAdminExtension`
  contributes the eight notifications routes as metadata (no nav — the
  Notifications group is base-nav-owned; no search contracts — every page
  keeps its filter state component-local). The template detail host
  lazy-loads the template dialog so tiptap/prosemirror stays out of the
  detail-page chunk. New notifications-ui peers: `@voyant-travel/admin`,
  `lucide-react`, `react-hook-form`.

  BREAKING for `@voyant-travel/ui`: the notification page components are removed —
  the `./components/notification-template-dialog`,
  `./components/notification-templates-page`,
  `./components/notification-reminder-rule-dialog`,
  `./components/notification-reminder-rules-page`,
  `./components/notification-deliveries-page`,
  `./components/notification-reminder-runs-page` and
  `./components/notification-template-authoring-help` subpath exports are
  gone, as are the wildcard-only
  `./components/notification-template-detail-page` and
  `./components/notification-delivery-detail-dialog` modules. Import the
  hosts from `@voyant-travel/notifications-ui/admin` instead. `@voyant-travel/ui` no
  longer depends on `@voyant-travel/notifications` /
  `@voyant-travel/notifications-react`.

### Patch Changes

- 344e7b6: Packaged-admin RFC §5 deletions: the fork-and-own distribution surfaces are
  retired now that all 10 admin domains ship as versioned packages. `@voyant-travel/ui`
  drops its shadcn registry source (`registry/`, `registry.json`, generated
  `public/r/`) and the `registry:build` script — the package's published
  component/export surface is unchanged and remains the only way to consume it.
  `templates/dmc`, `apps/dev`, and the hosted registry worker (`apps/registry`)
  are deleted from the workspace. `@voyant-travel/core` and `@voyant-travel/products-ui`
  only see stale comment/doc references repointed from the deleted surfaces to
  `templates/operator`.

## 0.105.1

### Patch Changes

- Updated dependencies [7122c2a]
  - @voyant-travel/i18n@0.106.0
  - @voyant-travel/notifications@0.105.2
  - @voyant-travel/notifications-react@0.105.2

## 0.105.0

### Minor Changes

- d1ad572: Rename CRM React hooks, UI components, and registry entries from Opportunity to Quote, with Quote Version surfaces split out for proposal/version workflows.

### Patch Changes

- Updated dependencies [d1ad572]
  - @voyant-travel/i18n@0.105.0
  - @voyant-travel/notifications@0.105.0
  - @voyant-travel/notifications-react@0.105.0

## 0.104.5

### Patch Changes

- 318f65d: Format profitability money values with locale-aware currency formatters and allow sidebar workspace content to shrink without body-level overflow.

## 0.104.4

### Patch Changes

- cfa6af8: feat(finance): accounts-payable supplier invoices, profitability & end-to-end FX

  Adds the full accounts-payable vertical for #1506:

  - **Supplier invoices (AP)**: `supplier_invoices` / `supplier_invoice_lines` /
    `supplier_cost_allocations`, the `supplierInvoicesService` (create/update/
    setLines/setAllocations/payments), attachments, and admin API routes.
  - **Cost allocation**: two-step product → departure picker, configurable cost
    categories (managed under Settings), searchable comboboxes.
  - **Profitability**: per-departure / per-product / per-traveller P&L read model
    - dashboards, cost-by-category breakdown, charts, CSV export.
  - **Accountant share portal**: scoped, revocable token links (no login) exposing
    financials + client/supplier invoices with downloadable attachments, ZIP
    download, and an en/ro language switcher.
  - **End-to-end FX**: supplier invoices and cost allocations snapshot their
    accounting-base value at the FX rate effective on the issue date; the
    profitability rollup sums those recorded snapshots (per-transaction-date
    rates) instead of re-valuing aggregates at the latest rate.

  Supporting additive exports: `availability`/`bookings`/`suppliers` schema and
  linkable exports consumed by the finance read model, and new TypeID prefixes in
  `schema-kit`.

- Updated dependencies [cfa6af8]
  - @voyant-travel/i18n@0.104.2

## 0.104.3

### Patch Changes

- 72d4c0d: Normalize cruise search/catalog from-prices to integer cents, add explicit catalog price-unit metadata for legacy-safe rendering, add departure counts to cruise search rows, and expose `GET /sailings/:key/pricing` for reading sailing pricing directly.

## 0.104.2

### Patch Changes

- 22ff914: Consolidate the richer DatePicker and DateRangePicker API in the shared UI package and use it for product departure and CRM document dates.

## 0.104.1

### Patch Changes

- Updated dependencies [ba5daa6]
  - @voyant-travel/i18n@0.104.1
  - @voyant-travel/notifications@0.104.1
  - @voyant-travel/notifications-react@0.104.1
  - @voyant-travel/utils@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/i18n@0.104.0
- @voyant-travel/notifications@0.104.0
- @voyant-travel/notifications-react@0.104.0
- @voyant-travel/utils@0.104.0

## 0.103.0

### Patch Changes

- Updated dependencies [a02f2f3]
  - @voyant-travel/i18n@0.103.0
  - @voyant-travel/notifications@0.103.0
  - @voyant-travel/notifications-react@0.103.0
  - @voyant-travel/utils@0.103.0

## 0.102.0

### Patch Changes

- Updated dependencies [b6d0673]
  - @voyant-travel/i18n@0.102.0
  - @voyant-travel/notifications@0.102.0
  - @voyant-travel/notifications-react@0.102.0
  - @voyant-travel/utils@0.102.0

## 0.101.2

### Patch Changes

- 577eaf5: Consolidate the operator's forked product-detail page into `@voyant-travel/products-ui` as the canonical, app-agnostic `ProductDetailPage`.

  - `@voyant-travel/products-ui`: new `components/product-detail` module — the full product-detail page (details, in-context translations, itinerary + day sheet, options/pricing, media, departures, schedules, channels, organize, brochure, market rules, payment policy, extras, activity) plus a `ProductDetailHostProvider` that injects everything app-specific (messages, REST client, locale, navigation callbacks, media upload, breadcrumbs, an option-extras slot). Templates mount the page by supplying the host instead of forking it.
  - `@voyant-travel/ui`: `DatePicker`/`DateRangePicker` triggers now forward base-ui's `PopoverTrigger` props so the calendar popover opens on click (fixes a regression where clicking the trigger did nothing).

- Updated dependencies [577eaf5]
  - @voyant-travel/i18n@0.101.2
  - @voyant-travel/notifications@0.101.2
  - @voyant-travel/notifications-react@0.101.2
  - @voyant-travel/utils@0.101.2

## 0.101.1

### Patch Changes

- Updated dependencies [f736ba5]
  - @voyant-travel/i18n@0.101.1
  - @voyant-travel/notifications@0.101.1
  - @voyant-travel/notifications-react@0.101.1
  - @voyant-travel/utils@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/i18n@0.101.0
- @voyant-travel/notifications@0.101.0
- @voyant-travel/notifications-react@0.101.0
- @voyant-travel/utils@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/i18n@0.100.0
- @voyant-travel/notifications@0.100.0
- @voyant-travel/notifications-react@0.100.0
- @voyant-travel/utils@0.100.0

## 0.99.0

### Patch Changes

- @voyant-travel/i18n@0.99.0
- @voyant-travel/notifications@0.99.0
- @voyant-travel/notifications-react@0.99.0
- @voyant-travel/utils@0.99.0

## 0.98.0

### Patch Changes

- Updated dependencies [485da95]
  - @voyant-travel/i18n@0.98.0
  - @voyant-travel/notifications@0.98.0
  - @voyant-travel/notifications-react@0.98.0
  - @voyant-travel/utils@0.98.0

## 0.97.0

### Patch Changes

- @voyant-travel/i18n@0.97.0
- @voyant-travel/notifications@0.97.0
- @voyant-travel/notifications-react@0.97.0
- @voyant-travel/utils@0.97.0

## 0.96.0

### Patch Changes

- @voyant-travel/i18n@0.96.0
- @voyant-travel/notifications@0.96.0
- @voyant-travel/notifications-react@0.96.0
- @voyant-travel/utils@0.96.0

## 0.95.0

### Patch Changes

- @voyant-travel/i18n@0.95.0
- @voyant-travel/notifications@0.95.0
- @voyant-travel/notifications-react@0.95.0
- @voyant-travel/utils@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/i18n@0.94.0
- @voyant-travel/notifications@0.94.0
- @voyant-travel/notifications-react@0.94.0
- @voyant-travel/utils@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/i18n@0.93.0
- @voyant-travel/notifications@0.93.0
- @voyant-travel/notifications-react@0.93.0
- @voyant-travel/utils@0.93.0

## 0.92.0

### Patch Changes

- @voyant-travel/i18n@0.92.0
- @voyant-travel/notifications@0.92.0
- @voyant-travel/notifications-react@0.92.0
- @voyant-travel/utils@0.92.0

## 0.91.0

### Patch Changes

- @voyant-travel/i18n@0.91.0
- @voyant-travel/notifications@0.91.0
- @voyant-travel/notifications-react@0.91.0
- @voyant-travel/utils@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/i18n@0.90.0
- @voyant-travel/notifications@0.90.0
- @voyant-travel/notifications-react@0.90.0
- @voyant-travel/utils@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/i18n@0.89.0
- @voyant-travel/notifications@0.89.0
- @voyant-travel/notifications-react@0.89.0
- @voyant-travel/utils@0.89.0

## 0.88.0

### Patch Changes

- @voyant-travel/i18n@0.88.0
- @voyant-travel/notifications@0.88.0
- @voyant-travel/notifications-react@0.88.0
- @voyant-travel/utils@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/i18n@0.87.1
- @voyant-travel/notifications@0.87.1
- @voyant-travel/notifications-react@0.87.1
- @voyant-travel/utils@0.87.1

## 0.87.0

### Patch Changes

- @voyant-travel/i18n@0.87.0
- @voyant-travel/notifications@0.87.0
- @voyant-travel/notifications-react@0.87.0
- @voyant-travel/utils@0.87.0

## 0.86.0

### Patch Changes

- @voyant-travel/i18n@0.86.0
- @voyant-travel/notifications@0.86.0
- @voyant-travel/notifications-react@0.86.0
- @voyant-travel/utils@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/i18n@0.85.4
- @voyant-travel/notifications@0.85.4
- @voyant-travel/notifications-react@0.85.4
- @voyant-travel/utils@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/i18n@0.85.3
- @voyant-travel/notifications@0.85.3
- @voyant-travel/notifications-react@0.85.3
- @voyant-travel/utils@0.85.3

## 0.85.2

### Patch Changes

- @voyant-travel/i18n@0.85.2
- @voyant-travel/notifications@0.85.2
- @voyant-travel/notifications-react@0.85.2
- @voyant-travel/utils@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/i18n@0.85.1
- @voyant-travel/notifications@0.85.1
- @voyant-travel/notifications-react@0.85.1
- @voyant-travel/utils@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/i18n@0.85.0
- @voyant-travel/notifications@0.85.0
- @voyant-travel/notifications-react@0.85.0
- @voyant-travel/utils@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/i18n@0.84.4
- @voyant-travel/notifications@0.84.4
- @voyant-travel/notifications-react@0.84.4
- @voyant-travel/utils@0.84.4

## 0.84.3

### Patch Changes

- Updated dependencies [9eadf50]
  - @voyant-travel/i18n@0.84.3
  - @voyant-travel/notifications@0.84.3
  - @voyant-travel/notifications-react@0.84.3
  - @voyant-travel/utils@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/i18n@0.84.2
- @voyant-travel/notifications@0.84.2
- @voyant-travel/notifications-react@0.84.2
- @voyant-travel/utils@0.84.2

## 0.84.1

### Patch Changes

- @voyant-travel/i18n@0.84.1
- @voyant-travel/notifications@0.84.1
- @voyant-travel/notifications-react@0.84.1
- @voyant-travel/utils@0.84.1

## 0.84.0

### Patch Changes

- Updated dependencies [5462f07]
  - @voyant-travel/i18n@0.84.0
  - @voyant-travel/notifications@0.84.0
  - @voyant-travel/notifications-react@0.84.0
  - @voyant-travel/utils@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/i18n@0.83.1
- @voyant-travel/notifications@0.83.1
- @voyant-travel/notifications-react@0.83.1
- @voyant-travel/utils@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/i18n@0.83.0
- @voyant-travel/notifications@0.83.0
- @voyant-travel/notifications-react@0.83.0
- @voyant-travel/utils@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/i18n@0.82.1
- @voyant-travel/notifications@0.82.1
- @voyant-travel/notifications-react@0.82.1
- @voyant-travel/utils@0.82.1

## 0.82.0

### Patch Changes

- 79ce168: Slot-detail / allocation / booking-sheet UX pass.

  - `AvailabilitySlotDetailPage`: status badge color-coded by tone (open=green, closed/sold-out=red), product-type badge, locale-formatted date range with timezone chip, financial KPI cards (Remaining/Initial Pax, Total, Paid + %, Outstanding + %, per-currency rollup), timeline-style Activity tab, `<dl>`-style Metadata tab, AlertDialog delete confirmation, host-driven Edit / Open Product / Create Booking actions.
  - Slot allocation grid: side-by-side Unallocated + resources layout kicks in at `lg:` instead of `xl:`; payment-status chip palette unchanged but Tailwind source paths now cover `@voyant-travel/allocation-ui` in the operator template so the colors actually render.
  - `AvailabilitySlotsTab`: optional header / `asPanel` / `hideBulkDelete` / `bulkStatusSelect` props let hosts embed the slots table outside of a Tabs shell and replace the bulk Open/Close buttons with a single "Change status" select.
  - Allocation manifest now exposes `sellAmountCents` / `paidAmountCents` per booking (and `derivePaidAmountCents` is exported from `@voyant-travel/availability`). `productOptionSchema` adds `sellCurrency` and `productType` so consumers can drive currency / badge UI off the catalog response.
  - `GET /v1/products/:id` joins `product_types` and returns `productType` alongside the product row via new `productsService.getProductByIdWithType`.
  - `BookingCreateDialog` → `BookingCreateSheet` (file + symbol + registry slug rename). Right-side wide sheet, departure picker disables when opened with a `defaultSlotId`, full-mode payment schedule defaults the due date to the departure day until the operator touches it, payment-schedule currency falls back through product → pricing → placeholder so the server's `invalid_payment_schedules` validator stops rejecting mismatched currencies, slot-allocation cache busted after create so new bookings appear without a manual refresh.
  - `BookingQuickViewSheet`: real Payer section (email/phone/language/website/address), card-per-traveler details (email/phone/language/special-requests/notes), per-traveler document list, and a collapsible "More info" that lazily calls the audit-logged reveal endpoint to surface DOB / nationality / document / dietary / accessibility / bed preference.
  - `ProductQuickViewSheet`: new component in `@voyant-travel/products-ui` mirroring the booking quick view shape — cover image, booking/capacity mode badges, full description, dates, itinerary days (with location + description), options list with status badges, tags, "View full product" footer.
  - `AsyncCombobox` now forwards `disabled` to `ComboboxInput` so disabled comboboxes are actually uneditable.
  - `DataTable` selection checkboxes use bubble-phase `stopPropagation` (wrapped in a `<div>`) instead of `onClickCapture` — fixes the "checkbox doesn't fire" bug under base-ui's checkbox event flow.
  - `useBookingCreateMutation` consumers (sheet) invalidate `availabilityQueryKeys.slots()` after create.
  - `loadProductOptionUnits` in finance booking-create now uses the exported `toRows<T>` normalizer to handle both `drizzle-orm/postgres-js` and `drizzle-orm/node-postgres` return shapes.
  - Operator template: Availability nav item moved directly under Products; slot detail route hosts the new edit dialog, booking quick view, product quick view; Tailwind `@source` scans `@voyant-travel/allocation-ui` dist + src.
  - I18n: en/ro keys added for `tabSlots: "List"` rename, slot detail Activity timeline filters, slot Meta block, "Change status", "Create booking", "Edit slot", traveler reveal labels, booking quick view payer.

- Updated dependencies [79ce168]
  - @voyant-travel/i18n@0.82.0
  - @voyant-travel/notifications@0.82.0
  - @voyant-travel/notifications-react@0.82.0
  - @voyant-travel/utils@0.82.0

## 0.81.21

### Patch Changes

- @voyant-travel/i18n@0.81.21
- @voyant-travel/notifications@0.81.21
- @voyant-travel/notifications-react@0.81.21
- @voyant-travel/utils@0.81.21

## 0.81.20

### Patch Changes

- @voyant-travel/i18n@0.81.20
- @voyant-travel/notifications@0.81.20
- @voyant-travel/notifications-react@0.81.20
- @voyant-travel/utils@0.81.20

## 0.81.19

### Patch Changes

- @voyant-travel/i18n@0.81.19
- @voyant-travel/notifications@0.81.19
- @voyant-travel/notifications-react@0.81.19
- @voyant-travel/utils@0.81.19

## 0.81.18

### Patch Changes

- Updated dependencies [93874e4]
  - @voyant-travel/i18n@0.81.18
  - @voyant-travel/notifications@0.81.18
  - @voyant-travel/notifications-react@0.81.18
  - @voyant-travel/utils@0.81.18

## 0.81.17

### Patch Changes

- Updated dependencies [e31a008]
  - @voyant-travel/i18n@0.81.17
  - @voyant-travel/notifications@0.81.17
  - @voyant-travel/notifications-react@0.81.17
  - @voyant-travel/utils@0.81.17

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
  - @voyant-travel/i18n@0.81.16
  - @voyant-travel/notifications@0.81.16
  - @voyant-travel/notifications-react@0.81.16
  - @voyant-travel/utils@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/i18n@0.81.15
- @voyant-travel/notifications@0.81.15
- @voyant-travel/notifications-react@0.81.15
- @voyant-travel/utils@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/i18n@0.81.14
- @voyant-travel/notifications@0.81.14
- @voyant-travel/notifications-react@0.81.14
- @voyant-travel/utils@0.81.14

## 0.81.13

### Patch Changes

- Updated dependencies [36421aa]
  - @voyant-travel/i18n@0.81.13
  - @voyant-travel/notifications@0.81.13
  - @voyant-travel/notifications-react@0.81.13
  - @voyant-travel/utils@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/i18n@0.81.12
- @voyant-travel/notifications@0.81.12
- @voyant-travel/notifications-react@0.81.12
- @voyant-travel/utils@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/i18n@0.81.11
- @voyant-travel/notifications@0.81.11
- @voyant-travel/notifications-react@0.81.11
- @voyant-travel/utils@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/i18n@0.81.10
- @voyant-travel/notifications@0.81.10
- @voyant-travel/notifications-react@0.81.10
- @voyant-travel/utils@0.81.10

## 0.81.9

### Patch Changes

- @voyant-travel/i18n@0.81.9
- @voyant-travel/notifications@0.81.9
- @voyant-travel/notifications-react@0.81.9
- @voyant-travel/utils@0.81.9

## 0.81.8

### Patch Changes

- @voyant-travel/i18n@0.81.8
- @voyant-travel/notifications@0.81.8
- @voyant-travel/notifications-react@0.81.8
- @voyant-travel/utils@0.81.8

## 0.81.7

### Patch Changes

- @voyant-travel/i18n@0.81.7
- @voyant-travel/notifications@0.81.7
- @voyant-travel/notifications-react@0.81.7
- @voyant-travel/utils@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/i18n@0.81.6
- @voyant-travel/notifications@0.81.6
- @voyant-travel/notifications-react@0.81.6
- @voyant-travel/utils@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/i18n@0.81.5
- @voyant-travel/notifications@0.81.5
- @voyant-travel/notifications-react@0.81.5
- @voyant-travel/utils@0.81.5

## 0.81.4

### Patch Changes

- @voyant-travel/i18n@0.81.4
- @voyant-travel/notifications@0.81.4
- @voyant-travel/notifications-react@0.81.4
- @voyant-travel/utils@0.81.4

## 0.81.3

### Patch Changes

- f157bcd: Split booking traveler draft unit assignment into separate pricing and inventory unit fields.
  - @voyant-travel/i18n@0.81.3
  - @voyant-travel/notifications@0.81.3
  - @voyant-travel/notifications-react@0.81.3
  - @voyant-travel/utils@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/i18n@0.81.2
- @voyant-travel/notifications@0.81.2
- @voyant-travel/notifications-react@0.81.2
- @voyant-travel/utils@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/i18n@0.81.1
- @voyant-travel/notifications@0.81.1
- @voyant-travel/notifications-react@0.81.1
- @voyant-travel/utils@0.81.1

## 0.81.0

### Patch Changes

- @voyant-travel/i18n@0.81.0
- @voyant-travel/notifications@0.81.0
- @voyant-travel/notifications-react@0.81.0
- @voyant-travel/utils@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/i18n@0.80.18
- @voyant-travel/notifications@0.80.18
- @voyant-travel/notifications-react@0.80.18
- @voyant-travel/utils@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/i18n@0.80.17
- @voyant-travel/notifications@0.80.17
- @voyant-travel/notifications-react@0.80.17
- @voyant-travel/utils@0.80.17

## 0.80.16

### Patch Changes

- Updated dependencies [dbcc0da]
  - @voyant-travel/i18n@0.80.16
  - @voyant-travel/notifications@0.80.16
  - @voyant-travel/notifications-react@0.80.16
  - @voyant-travel/utils@0.80.16

## 0.80.15

### Patch Changes

- @voyant-travel/i18n@0.80.15
- @voyant-travel/notifications@0.80.15
- @voyant-travel/notifications-react@0.80.15
- @voyant-travel/utils@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/i18n@0.80.14
- @voyant-travel/notifications@0.80.14
- @voyant-travel/notifications-react@0.80.14
- @voyant-travel/utils@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/i18n@0.80.13
- @voyant-travel/notifications@0.80.13
- @voyant-travel/notifications-react@0.80.13
- @voyant-travel/utils@0.80.13

## 0.80.12

### Patch Changes

- Updated dependencies [5070731]
  - @voyant-travel/i18n@0.80.12
  - @voyant-travel/notifications@0.80.12
  - @voyant-travel/notifications-react@0.80.12
  - @voyant-travel/utils@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/i18n@0.80.11
- @voyant-travel/notifications@0.80.11
- @voyant-travel/notifications-react@0.80.11
- @voyant-travel/utils@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/i18n@0.80.10
- @voyant-travel/notifications@0.80.10
- @voyant-travel/notifications-react@0.80.10
- @voyant-travel/utils@0.80.10

## 0.80.9

### Patch Changes

- @voyant-travel/i18n@0.80.9
- @voyant-travel/notifications@0.80.9
- @voyant-travel/notifications-react@0.80.9
- @voyant-travel/utils@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/i18n@0.80.8
- @voyant-travel/notifications@0.80.8
- @voyant-travel/notifications-react@0.80.8
- @voyant-travel/utils@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/i18n@0.80.7
- @voyant-travel/notifications@0.80.7
- @voyant-travel/notifications-react@0.80.7
- @voyant-travel/utils@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/i18n@0.80.6
- @voyant-travel/notifications@0.80.6
- @voyant-travel/notifications-react@0.80.6
- @voyant-travel/utils@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/i18n@0.80.5
- @voyant-travel/notifications@0.80.5
- @voyant-travel/notifications-react@0.80.5
- @voyant-travel/utils@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/i18n@0.80.4
- @voyant-travel/notifications@0.80.4
- @voyant-travel/notifications-react@0.80.4
- @voyant-travel/utils@0.80.4

## 0.80.3

### Patch Changes

- @voyant-travel/i18n@0.80.3
- @voyant-travel/notifications@0.80.3
- @voyant-travel/notifications-react@0.80.3
- @voyant-travel/utils@0.80.3

## 0.80.2

### Patch Changes

- @voyant-travel/i18n@0.80.2
- @voyant-travel/notifications@0.80.2
- @voyant-travel/notifications-react@0.80.2
- @voyant-travel/utils@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/i18n@0.80.1
- @voyant-travel/notifications@0.80.1
- @voyant-travel/notifications-react@0.80.1
- @voyant-travel/utils@0.80.1

## 0.80.0

### Patch Changes

- Updated dependencies [9473eb8]
  - @voyant-travel/i18n@0.80.0
  - @voyant-travel/notifications@0.80.0
  - @voyant-travel/notifications-react@0.80.0
  - @voyant-travel/utils@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/i18n@0.79.0
- @voyant-travel/notifications@0.79.0
- @voyant-travel/notifications-react@0.79.0
- @voyant-travel/utils@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/i18n@0.78.0
- @voyant-travel/notifications@0.78.0
- @voyant-travel/notifications-react@0.78.0
- @voyant-travel/utils@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/i18n@0.77.13
- @voyant-travel/notifications@0.77.13
- @voyant-travel/notifications-react@0.77.13
- @voyant-travel/utils@0.77.13

## 0.77.12

### Patch Changes

- Updated dependencies [bf74cd4]
  - @voyant-travel/i18n@0.77.12
  - @voyant-travel/notifications@0.77.12
  - @voyant-travel/notifications-react@0.77.12
  - @voyant-travel/utils@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/i18n@0.77.11
- @voyant-travel/notifications@0.77.11
- @voyant-travel/notifications-react@0.77.11
- @voyant-travel/utils@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/i18n@0.77.10
- @voyant-travel/notifications@0.77.10
- @voyant-travel/notifications-react@0.77.10
- @voyant-travel/utils@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/i18n@0.77.9
- @voyant-travel/notifications@0.77.9
- @voyant-travel/notifications-react@0.77.9
- @voyant-travel/utils@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/i18n@0.77.8
- @voyant-travel/notifications@0.77.8
- @voyant-travel/notifications-react@0.77.8
- @voyant-travel/utils@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/i18n@0.77.7
- @voyant-travel/notifications@0.77.7
- @voyant-travel/notifications-react@0.77.7
- @voyant-travel/utils@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/i18n@0.77.6
- @voyant-travel/notifications@0.77.6
- @voyant-travel/notifications-react@0.77.6
- @voyant-travel/utils@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/i18n@0.77.5
- @voyant-travel/notifications@0.77.5
- @voyant-travel/notifications-react@0.77.5
- @voyant-travel/utils@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/i18n@0.77.4
- @voyant-travel/notifications@0.77.4
- @voyant-travel/notifications-react@0.77.4
- @voyant-travel/utils@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/i18n@0.77.3
- @voyant-travel/notifications@0.77.3
- @voyant-travel/notifications-react@0.77.3
- @voyant-travel/utils@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/i18n@0.77.2
- @voyant-travel/notifications@0.77.2
- @voyant-travel/notifications-react@0.77.2
- @voyant-travel/utils@0.77.2

## 0.77.1

### Patch Changes

- @voyant-travel/i18n@0.77.1
- @voyant-travel/notifications@0.77.1
- @voyant-travel/notifications-react@0.77.1
- @voyant-travel/utils@0.77.1

## 0.77.0

### Patch Changes

- @voyant-travel/i18n@0.77.0
- @voyant-travel/notifications@0.77.0
- @voyant-travel/notifications-react@0.77.0
- @voyant-travel/utils@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/i18n@0.76.0
- @voyant-travel/notifications@0.76.0
- @voyant-travel/notifications-react@0.76.0
- @voyant-travel/utils@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/i18n@0.75.7
- @voyant-travel/notifications@0.75.7
- @voyant-travel/notifications-react@0.75.7
- @voyant-travel/utils@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/i18n@0.75.6
- @voyant-travel/notifications@0.75.6
- @voyant-travel/notifications-react@0.75.6
- @voyant-travel/utils@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/i18n@0.75.5
- @voyant-travel/notifications@0.75.5
- @voyant-travel/notifications-react@0.75.5
- @voyant-travel/utils@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/i18n@0.75.4
- @voyant-travel/notifications@0.75.4
- @voyant-travel/notifications-react@0.75.4
- @voyant-travel/utils@0.75.4

## 0.75.3

### Patch Changes

- Updated dependencies [38167cd]
  - @voyant-travel/i18n@0.75.3
  - @voyant-travel/notifications@0.75.3
  - @voyant-travel/notifications-react@0.75.3
  - @voyant-travel/utils@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/i18n@0.75.2
- @voyant-travel/notifications@0.75.2
- @voyant-travel/notifications-react@0.75.2
- @voyant-travel/utils@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/i18n@0.75.1
- @voyant-travel/notifications@0.75.1
- @voyant-travel/notifications-react@0.75.1
- @voyant-travel/utils@0.75.1

## 0.75.0

### Patch Changes

- @voyant-travel/i18n@0.75.0
- @voyant-travel/notifications@0.75.0
- @voyant-travel/notifications-react@0.75.0
- @voyant-travel/utils@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/i18n@0.74.2
- @voyant-travel/notifications@0.74.2
- @voyant-travel/notifications-react@0.74.2
- @voyant-travel/utils@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/i18n@0.74.1
- @voyant-travel/notifications@0.74.1
- @voyant-travel/notifications-react@0.74.1
- @voyant-travel/utils@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/i18n@0.74.0
- @voyant-travel/notifications@0.74.0
- @voyant-travel/notifications-react@0.74.0
- @voyant-travel/utils@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/i18n@0.73.1
- @voyant-travel/notifications@0.73.1
- @voyant-travel/notifications-react@0.73.1
- @voyant-travel/utils@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/i18n@0.73.0
- @voyant-travel/notifications@0.73.0
- @voyant-travel/notifications-react@0.73.0
- @voyant-travel/utils@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/i18n@0.72.0
- @voyant-travel/notifications@0.72.0
- @voyant-travel/notifications-react@0.72.0
- @voyant-travel/utils@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/i18n@0.71.0
- @voyant-travel/notifications@0.71.0
- @voyant-travel/notifications-react@0.71.0
- @voyant-travel/utils@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/i18n@0.70.0
- @voyant-travel/notifications@0.70.0
- @voyant-travel/notifications-react@0.70.0
- @voyant-travel/utils@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/i18n@0.69.1
- @voyant-travel/notifications@0.69.1
- @voyant-travel/notifications-react@0.69.1
- @voyant-travel/utils@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/i18n@0.69.0
- @voyant-travel/notifications@0.69.0
- @voyant-travel/notifications-react@0.69.0
- @voyant-travel/utils@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/i18n@0.68.0
- @voyant-travel/notifications@0.68.0
- @voyant-travel/notifications-react@0.68.0
- @voyant-travel/utils@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/i18n@0.67.0
- @voyant-travel/notifications@0.67.0
- @voyant-travel/notifications-react@0.67.0
- @voyant-travel/utils@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/i18n@0.66.6
- @voyant-travel/notifications@0.66.6
- @voyant-travel/notifications-react@0.66.6
- @voyant-travel/utils@0.66.6

## 0.66.5

### Patch Changes

- @voyant-travel/i18n@0.66.5
- @voyant-travel/notifications@0.66.5
- @voyant-travel/notifications-react@0.66.5
- @voyant-travel/utils@0.66.5

## 0.66.4

### Patch Changes

- @voyant-travel/i18n@0.66.4
- @voyant-travel/notifications@0.66.4
- @voyant-travel/notifications-react@0.66.4
- @voyant-travel/utils@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/i18n@0.66.3
- @voyant-travel/notifications@0.66.3
- @voyant-travel/notifications-react@0.66.3
- @voyant-travel/utils@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/i18n@0.66.2
- @voyant-travel/notifications@0.66.2
- @voyant-travel/notifications-react@0.66.2
- @voyant-travel/utils@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/i18n@0.66.1
- @voyant-travel/notifications@0.66.1
- @voyant-travel/notifications-react@0.66.1
- @voyant-travel/utils@0.66.1

## 0.66.0

### Patch Changes

- Updated dependencies [a74089c]
  - @voyant-travel/i18n@0.66.0
  - @voyant-travel/notifications@0.66.0
  - @voyant-travel/notifications-react@0.66.0
  - @voyant-travel/utils@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/i18n@0.65.0
- @voyant-travel/notifications@0.65.0
- @voyant-travel/notifications-react@0.65.0
- @voyant-travel/utils@0.65.0

## 0.64.1

### Patch Changes

- Updated dependencies [572dde4]
  - @voyant-travel/i18n@0.64.1
  - @voyant-travel/notifications@0.64.1
  - @voyant-travel/notifications-react@0.64.1
  - @voyant-travel/utils@0.64.1

## 0.64.0

### Patch Changes

- Updated dependencies [6d0c8f3]
  - @voyant-travel/i18n@0.64.0
  - @voyant-travel/notifications@0.64.0
  - @voyant-travel/notifications-react@0.64.0
  - @voyant-travel/utils@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/i18n@0.63.1
- @voyant-travel/notifications@0.63.1
- @voyant-travel/notifications-react@0.63.1
- @voyant-travel/utils@0.63.1

## 0.63.0

### Patch Changes

- @voyant-travel/i18n@0.63.0
- @voyant-travel/notifications@0.63.0
- @voyant-travel/notifications-react@0.63.0
- @voyant-travel/utils@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/i18n@0.62.3
- @voyant-travel/notifications@0.62.3
- @voyant-travel/notifications-react@0.62.3
- @voyant-travel/utils@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/i18n@0.62.2
- @voyant-travel/notifications@0.62.2
- @voyant-travel/notifications-react@0.62.2
- @voyant-travel/utils@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/i18n@0.62.1
- @voyant-travel/notifications@0.62.1
- @voyant-travel/notifications-react@0.62.1
- @voyant-travel/utils@0.62.1

## 0.62.0

### Patch Changes

- @voyant-travel/i18n@0.62.0
- @voyant-travel/notifications@0.62.0
- @voyant-travel/notifications-react@0.62.0
- @voyant-travel/utils@0.62.0

## 0.61.0

### Patch Changes

- Updated dependencies [89f033e]
  - @voyant-travel/i18n@0.61.0
  - @voyant-travel/notifications@0.61.0
  - @voyant-travel/notifications-react@0.61.0
  - @voyant-travel/utils@0.61.0

## 0.60.0

### Patch Changes

- Updated dependencies [4ff7f15]
  - @voyant-travel/i18n@0.60.0
  - @voyant-travel/notifications@0.60.0
  - @voyant-travel/notifications-react@0.60.0
  - @voyant-travel/utils@0.60.0

## 0.59.0

### Minor Changes

- 48927be: Release the changes accumulated on main since 0.58.0 that landed without
  their own changesets.

  - **products / products-react / products-ui** — add `inclusionsHtml` and
    `exclusionsHtml` rich-text fields on `ProductRecord` plus the supporting
    product-form + product-detail UI (#994). Consumer test fixtures may need
    `inclusionsHtml: null, exclusionsHtml: null` added.
  - **catalog** — widen `CancelResult.status` to include `"pending"` for
    adapters that submit async cancellations (email / partner portal / batch)
    with a `pending_channel` (#991). Downstream consumers using the narrow
    `"cancelled" | "refused" | "failed"` union need to either widen their
    surface or map `"pending"` at the boundary.
  - **ui** — drop heavy passthrough re-exports from `@voyant-travel/ui/components`
    barrel: `RichTextEditor`, `chart`, `dashboard-widgets`, `phone-input`,
    and all `NotificationTemplate*` / `notification-template-dialog` /
    `notification-{deliveries,reminder-rules,reminder-runs}-page` entries.
    Import these via subpath from `@voyant-travel/ui/components/<file>` instead
    (e.g. `@voyant-travel/ui/components/rich-text-editor`). Was leaking ~600 KB
    of tiptap/prosemirror, ~390 KB of recharts, and ~200 KB of
    libphonenumber-js into every barrel consumer.
  - **admin** — drop `DashboardPage` from the `@voyant-travel/admin` barrel for
    the same reason (recharts leakage). Import from
    `@voyant-travel/admin/dashboard` instead.

### Patch Changes

- @voyant-travel/i18n@0.59.0
- @voyant-travel/notifications@0.59.0
- @voyant-travel/notifications-react@0.59.0
- @voyant-travel/utils@0.59.0

## 0.58.0

### Patch Changes

- @voyant-travel/i18n@0.58.0
- @voyant-travel/notifications@0.58.0
- @voyant-travel/notifications-react@0.58.0
- @voyant-travel/utils@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/i18n@0.57.0
- @voyant-travel/notifications@0.57.0
- @voyant-travel/notifications-react@0.57.0
- @voyant-travel/utils@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/i18n@0.56.0
- @voyant-travel/notifications@0.56.0
- @voyant-travel/notifications-react@0.56.0
- @voyant-travel/utils@0.56.0

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
  - @voyant-travel/i18n@0.55.1
  - @voyant-travel/notifications@0.55.1
  - @voyant-travel/notifications-react@0.55.1
  - @voyant-travel/utils@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/i18n@0.55.0
- @voyant-travel/notifications@0.55.0
- @voyant-travel/notifications-react@0.55.0
- @voyant-travel/utils@0.55.0

## 0.54.0

### Patch Changes

- @voyant-travel/i18n@0.54.0
- @voyant-travel/notifications@0.54.0
- @voyant-travel/notifications-react@0.54.0
- @voyant-travel/utils@0.54.0

## 0.53.2

### Patch Changes

- @voyant-travel/i18n@0.53.2
- @voyant-travel/notifications@0.53.2
- @voyant-travel/notifications-react@0.53.2
- @voyant-travel/utils@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/i18n@0.53.1
- @voyant-travel/notifications@0.53.1
- @voyant-travel/notifications-react@0.53.1
- @voyant-travel/utils@0.53.1

## 0.53.0

### Patch Changes

- @voyant-travel/i18n@0.53.0
- @voyant-travel/notifications@0.53.0
- @voyant-travel/notifications-react@0.53.0
- @voyant-travel/utils@0.53.0

## 0.52.4

### Patch Changes

- 5d3c119: Fix `packages/ui/registry.json` so the bookings stepper entry points at `option-units-stepper-section.tsx` (and exposes it as `voyant-bookings-option-units-stepper-section`). The previous 0.52.1 release renamed the file but left the registry source-of-truth pointing at the old `rooms-stepper-section.tsx` path, which caused `shadcn build` to ENOENT in the release workflow.
  - @voyant-travel/i18n@0.52.4
  - @voyant-travel/notifications@0.52.4
  - @voyant-travel/notifications-react@0.52.4
  - @voyant-travel/utils@0.52.4

## 0.52.3

### Patch Changes

- @voyant-travel/i18n@0.52.3
- @voyant-travel/notifications@0.52.3
- @voyant-travel/notifications-react@0.52.3
- @voyant-travel/utils@0.52.3

## 0.52.2

### Patch Changes

- 6bdfcbc: Fix `packages/ui/registry.json` so the bookings stepper entry points at `option-units-stepper-section.tsx` (and exposes it as `voyant-bookings-option-units-stepper-section`). The previous 0.52.1 release renamed the file but left the registry source-of-truth pointing at the old `rooms-stepper-section.tsx` path, which caused `shadcn build` to ENOENT in the release workflow.
- 3e09123: UI primitives: `DatePicker` and `Select` polish.

  - `DatePicker` / `DateRangePicker` default to `captionLayout="dropdown"` and ship a 100-year `startMonth`/`endMonth` window (`-90 → +10`). Without these, react-day-picker's year dropdown only listed the current year, so DOB pickers across the CRM/auth surfaces were unusable. Per-callsite overrides still work.
  - `Select` styling polish: trigger switches to `rounded-lg`, drops the redundant `shadow-xs`/`transition-[color,box-shadow]`, and aligns sm/default heights with the rest of the input set. Marked with `"use client"` so it works in RSC-first stacks (Next.js App Router examples). The `collectSelectItems` child-walker stays in place — base-ui still relies on the `items` map to render localized labels for child-driven `<Select>`s.

- Updated dependencies [3e09123]
  - @voyant-travel/i18n@0.52.2
  - @voyant-travel/notifications@0.52.2
  - @voyant-travel/notifications-react@0.52.2
  - @voyant-travel/utils@0.52.2

## 0.52.1

### Patch Changes

- @voyant-travel/i18n@0.52.1
- @voyant-travel/notifications@0.52.1
- @voyant-travel/notifications-react@0.52.1
- @voyant-travel/utils@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/i18n@0.52.0
- @voyant-travel/notifications@0.52.0
- @voyant-travel/notifications-react@0.52.0
- @voyant-travel/utils@0.52.0

## 0.51.1

### Patch Changes

- Updated dependencies [deaacb3]
  - @voyant-travel/i18n@0.51.1
  - @voyant-travel/notifications@0.51.1
  - @voyant-travel/notifications-react@0.51.1
  - @voyant-travel/utils@0.51.1

## 0.51.0

### Patch Changes

- Updated dependencies [2316791]
  - @voyant-travel/i18n@0.51.0
  - @voyant-travel/notifications@0.51.0
  - @voyant-travel/notifications-react@0.51.0
  - @voyant-travel/utils@0.51.0

## 0.50.8

### Patch Changes

- @voyant-travel/i18n@0.50.8
- @voyant-travel/notifications@0.50.8
- @voyant-travel/notifications-react@0.50.8
- @voyant-travel/utils@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/i18n@0.50.7
- @voyant-travel/notifications@0.50.7
- @voyant-travel/notifications-react@0.50.7
- @voyant-travel/utils@0.50.7

## 0.50.6

### Patch Changes

- c14f0a8: Fix the booking-create flow: scrollable dialog content with reachable actions, normalized product search, future departure lookup, shared-room clearing, explicit item lines, selectable traveler people including the payer, already-paid schedule rows, and booking-create naming throughout the API/registry surface.
  - @voyant-travel/i18n@0.50.6
  - @voyant-travel/notifications@0.50.6
  - @voyant-travel/notifications-react@0.50.6
  - @voyant-travel/utils@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/i18n@0.50.5
- @voyant-travel/notifications@0.50.5
- @voyant-travel/notifications-react@0.50.5
- @voyant-travel/utils@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/i18n@0.50.4
- @voyant-travel/notifications@0.50.4
- @voyant-travel/notifications-react@0.50.4
- @voyant-travel/utils@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/i18n@0.50.3
- @voyant-travel/notifications@0.50.3
- @voyant-travel/notifications-react@0.50.3
- @voyant-travel/utils@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/i18n@0.50.2
- @voyant-travel/notifications@0.50.2
- @voyant-travel/notifications-react@0.50.2
- @voyant-travel/utils@0.50.2

## 0.50.1

### Patch Changes

- @voyant-travel/i18n@0.50.1
- @voyant-travel/notifications@0.50.1
- @voyant-travel/notifications-react@0.50.1
- @voyant-travel/utils@0.50.1

## 0.50.0

### Patch Changes

- @voyant-travel/i18n@0.50.0
- @voyant-travel/notifications@0.50.0
- @voyant-travel/notifications-react@0.50.0
- @voyant-travel/utils@0.50.0

## 0.49.0

### Patch Changes

- Updated dependencies [3029f10]
  - @voyant-travel/i18n@0.49.0
  - @voyant-travel/notifications@0.49.0
  - @voyant-travel/notifications-react@0.49.0
  - @voyant-travel/utils@0.49.0

## 0.48.0

### Patch Changes

- @voyant-travel/i18n@0.48.0
- @voyant-travel/notifications@0.48.0
- @voyant-travel/notifications-react@0.48.0
- @voyant-travel/utils@0.48.0

## 0.47.0

### Patch Changes

- @voyant-travel/i18n@0.47.0
- @voyant-travel/notifications@0.47.0
- @voyant-travel/notifications-react@0.47.0
- @voyant-travel/utils@0.47.0

## 0.46.0

### Patch Changes

- @voyant-travel/i18n@0.46.0
- @voyant-travel/notifications@0.46.0
- @voyant-travel/notifications-react@0.46.0
- @voyant-travel/utils@0.46.0

## 0.45.0

### Patch Changes

- @voyant-travel/i18n@0.45.0
- @voyant-travel/notifications@0.45.0
- @voyant-travel/notifications-react@0.45.0
- @voyant-travel/utils@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/i18n@0.44.0
- @voyant-travel/notifications@0.44.0
- @voyant-travel/notifications-react@0.44.0
- @voyant-travel/utils@0.44.0

## 0.43.0

### Patch Changes

- @voyant-travel/i18n@0.43.0
- @voyant-travel/notifications@0.43.0
- @voyant-travel/notifications-react@0.43.0
- @voyant-travel/utils@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/i18n@0.42.0
- @voyant-travel/notifications@0.42.0
- @voyant-travel/notifications-react@0.42.0
- @voyant-travel/utils@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/i18n@0.41.3
- @voyant-travel/notifications@0.41.3
- @voyant-travel/notifications-react@0.41.3
- @voyant-travel/utils@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/i18n@0.41.2
- @voyant-travel/notifications@0.41.2
- @voyant-travel/notifications-react@0.41.2
- @voyant-travel/utils@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/i18n@0.41.1
- @voyant-travel/notifications@0.41.1
- @voyant-travel/notifications-react@0.41.1
- @voyant-travel/utils@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/i18n@0.41.0
- @voyant-travel/notifications@0.41.0
- @voyant-travel/notifications-react@0.41.0
- @voyant-travel/utils@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/i18n@0.40.1
- @voyant-travel/notifications@0.40.1
- @voyant-travel/notifications-react@0.40.1
- @voyant-travel/utils@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/i18n@0.40.0
- @voyant-travel/notifications@0.40.0
- @voyant-travel/notifications-react@0.40.0
- @voyant-travel/utils@0.40.0

## 0.39.0

### Minor Changes

- f4235ea: Finish the bookings passenger-to-traveler rename across the React/UI layer and shadcn registry.

  `@voyant-travel/bookings-ui` now exposes `TravelersSection` and traveler-first section value/types. `@voyant-travel/bookings-react` uses traveler hooks/query helpers over the traveler endpoints. The bookings activity enum now emits `traveler_update`; dev/operator/DMC migrations rename existing `passenger_update` activity rows.

  The shadcn registry now publishes `voyant-bookings-travelers-section` and removes the stale passenger dialog/list/section registry artifacts.

### Patch Changes

- @voyant-travel/i18n@0.39.0
- @voyant-travel/notifications@0.39.0
- @voyant-travel/notifications-react@0.39.0
- @voyant-travel/utils@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/i18n@0.38.2
- @voyant-travel/notifications@0.38.2
- @voyant-travel/notifications-react@0.38.2
- @voyant-travel/utils@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/i18n@0.38.1
- @voyant-travel/notifications@0.38.1
- @voyant-travel/notifications-react@0.38.1
- @voyant-travel/utils@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/i18n@0.38.0
- @voyant-travel/notifications@0.38.0
- @voyant-travel/notifications-react@0.38.0
- @voyant-travel/utils@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/i18n@0.37.1
- @voyant-travel/notifications@0.37.1
- @voyant-travel/notifications-react@0.37.1
- @voyant-travel/utils@0.37.1

## 0.37.0

### Patch Changes

- 0c9b884: Route remaining reusable UI literals through package i18n providers and add the UI literal scan to the shared i18n CI check.
- Updated dependencies [dc29b79]
- Updated dependencies [f014fd2]
  - @voyant-travel/i18n@0.37.0
  - @voyant-travel/notifications@0.37.0
  - @voyant-travel/notifications-react@0.37.0
  - @voyant-travel/utils@0.37.0

## 0.36.0

### Patch Changes

- @voyant-travel/i18n@0.36.0
- @voyant-travel/notifications@0.36.0
- @voyant-travel/notifications-react@0.36.0
- @voyant-travel/utils@0.36.0

## 0.35.0

### Patch Changes

- baa6134: Replace the tabbed product detail page with the sectioned operator layout and upgrade product media management from a table to a gallery with preview, cover selection, and reorder controls.
  - @voyant-travel/i18n@0.35.0
  - @voyant-travel/notifications@0.35.0
  - @voyant-travel/notifications-react@0.35.0
  - @voyant-travel/utils@0.35.0

## 0.34.0

### Patch Changes

- 70ee277: Add a shared CurrencyInput and use it for editable operator money fields so forms display decimal amounts with the currency symbol and code while still submitting minor units.
- f2d4802: Replace native date and datetime inputs with shared DatePicker and DateTimePicker controls.
- Updated dependencies [6ad175a]
- Updated dependencies [a37d4af]
  - @voyant-travel/i18n@0.34.0
  - @voyant-travel/notifications@0.34.0
  - @voyant-travel/notifications-react@0.34.0
  - @voyant-travel/utils@0.34.0

## 0.33.1

### Patch Changes

- @voyant-travel/i18n@0.33.1
- @voyant-travel/notifications@0.33.1
- @voyant-travel/notifications-react@0.33.1
- @voyant-travel/utils@0.33.1

## 0.33.0

### Minor Changes

- db46afc: Breaking change: `@voyant-travel/ui` now declares `recharts` as a peer dependency instead of installing its own runtime copy, so chart wrappers share the consuming app's Recharts instance and avoid duplicate chart context.

  Consumers that use `@voyant-travel/ui/components` or any chart primitives must install `recharts` directly, for example `pnpm add recharts@^3.0.0`. If chart cards render headers with blank bodies, run `pnpm -r why recharts` and confirm the app resolves a single Recharts version.

### Patch Changes

- @voyant-travel/i18n@0.33.0
- @voyant-travel/notifications@0.33.0
- @voyant-travel/notifications-react@0.33.0
- @voyant-travel/utils@0.33.0

## 0.32.3

### Patch Changes

- 7632a66: Export all first-class component modules from the `@voyant-travel/ui/components` barrel and add a verifier to prevent future drift.
  - @voyant-travel/i18n@0.32.3
  - @voyant-travel/notifications@0.32.3
  - @voyant-travel/notifications-react@0.32.3
  - @voyant-travel/utils@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/i18n@0.32.2
- @voyant-travel/notifications@0.32.2
- @voyant-travel/notifications-react@0.32.2
- @voyant-travel/utils@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/i18n@0.32.1
- @voyant-travel/notifications@0.32.1
- @voyant-travel/notifications-react@0.32.1
- @voyant-travel/utils@0.32.1

## 0.32.0

### Patch Changes

- @voyant-travel/i18n@0.32.0
- @voyant-travel/notifications@0.32.0
- @voyant-travel/notifications-react@0.32.0
- @voyant-travel/utils@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/i18n@0.31.4
- @voyant-travel/notifications@0.31.4
- @voyant-travel/notifications-react@0.31.4
- @voyant-travel/utils@0.31.4

## 0.31.3

### Patch Changes

- @voyant-travel/i18n@0.31.3
- @voyant-travel/notifications@0.31.3
- @voyant-travel/notifications-react@0.31.3
- @voyant-travel/utils@0.31.3

## 0.31.2

### Patch Changes

- Updated dependencies [54ddc93]
  - @voyant-travel/i18n@0.31.2
  - @voyant-travel/notifications@0.31.2
  - @voyant-travel/notifications-react@0.31.2
  - @voyant-travel/utils@0.31.2

## 0.31.1

### Patch Changes

- 00f7c4f: Render product itinerary day descriptions with the shared rich text editor so imported HTML content can be edited without exposing raw markup.

  Add link support to the shared rich text editor, including safe URL handling and toolbar actions for adding or removing links.

  - @voyant-travel/i18n@0.31.1
  - @voyant-travel/notifications@0.31.1
  - @voyant-travel/notifications-react@0.31.1
  - @voyant-travel/utils@0.31.1

## 0.31.0

### Patch Changes

- @voyant-travel/i18n@0.31.0
- @voyant-travel/notifications@0.31.0
- @voyant-travel/notifications-react@0.31.0
- @voyant-travel/utils@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/i18n@0.30.7
- @voyant-travel/notifications@0.30.7
- @voyant-travel/notifications-react@0.30.7
- @voyant-travel/utils@0.30.7

## 0.30.6

### Patch Changes

- @voyant-travel/i18n@0.30.6
- @voyant-travel/notifications@0.30.6
- @voyant-travel/notifications-react@0.30.6
- @voyant-travel/utils@0.30.6

## 0.30.5

### Patch Changes

- @voyant-travel/i18n@0.30.5
- @voyant-travel/notifications@0.30.5
- @voyant-travel/notifications-react@0.30.5
- @voyant-travel/utils@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/i18n@0.30.4
- @voyant-travel/notifications@0.30.4
- @voyant-travel/notifications-react@0.30.4
- @voyant-travel/utils@0.30.4

## 0.30.3

### Patch Changes

- @voyant-travel/i18n@0.30.3
- @voyant-travel/notifications@0.30.3
- @voyant-travel/notifications-react@0.30.3
- @voyant-travel/utils@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/i18n@0.30.2
- @voyant-travel/notifications@0.30.2
- @voyant-travel/notifications-react@0.30.2
- @voyant-travel/utils@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/i18n@0.30.1
- @voyant-travel/notifications@0.30.1
- @voyant-travel/notifications-react@0.30.1
- @voyant-travel/utils@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/i18n@0.30.0
- @voyant-travel/notifications@0.30.0
- @voyant-travel/notifications-react@0.30.0
- @voyant-travel/utils@0.30.0

## 0.29.0

### Minor Changes

- 4a6523e: Reminder sequences UI cleanup (#488):

  - `NotificationSettingsForm` drops the holiday-calendar combobox section. The
    DB column stays in place (nullable) for forward-compat, but the UI no longer
    exposes it — proper holiday handling needs a real public-holidays source and
    is out of scope.
  - `NotificationReminderRulesPage` gains a per-row **Manage stages** link that
    points at `/notifications/reminder-rules/<id>` and accepts a
    `manageStagesHref` prop so consumers can override the URL pattern. The
    legacy "Timing" column is removed because timing is owned by stages now.
  - `NotificationReminderRuleDialog` drops the `Send timing` field and the
    payload always writes `relativeDaysFromDueDate: 0`. New rules are expected
    to define their timing via stages; the dialog's purpose is now creating the
    rule shell + picking a default template + assigning a channel. A help line
    on the create form points the user at "Manage stages" as the next step.
  - Adds a perf migration (`0002_reminder_dispatcher_perf`) with partial / composite
    indexes targeting the new dispatcher's hot queries: open invoices by
    `due_date`, open payment schedules by `due_date`, reminder runs by
    `(rule, target, scheduled_for)`, and reminder runs by
    `(recipient, status, processed_at)` for suppression / rate-limit lookups.

### Patch Changes

- 4a6523e: Reminder rule dialog: make the default template optional (#488).

  Stage channels carry their own templates and override the rule-level default,
  so the legacy rule-creation dialog no longer needs to require a template at
  form-submit time. Without this, clicking **Create Rule** with no template
  selected silently failed Zod validation and the dialog appeared frozen.

  Backend `insertNotificationReminderRuleSchema` and
  `updateNotificationReminderRuleSchema` drop the `templateId || templateSlug`
  refinement to match.

  Also narrows the dispatcher's per-target booking lookup from a full-row
  `select()` to the columns actually used by recipient resolution. This avoids
  projecting every column declared in the bookings schema and tolerates
  deployments / test stubs that lag the latest column set.

- 4a6523e: Drop legacy single-offset reminder path; polish channel editor (#488).

  Stage channel editor:

  - Replaces the two free-text "Template id / Template slug" fields with
    a single async `<TemplatePicker>` (typeahead via `AsyncCombobox`)
    filtered by the channel selected at the top of the dialog. Picking
    a template now resolves to the template id directly — no more
    guessing slugs. Switching channel clears the picked template since
    the next list will be filtered.
  - Provider becomes a `<Select>` with **Automatic** / **Resend
    (email)** / **Twilio (SMS)** options. "Automatic" maps to `null`
    (use the deployment default for that channel).
  - Drops the freeform "Recipient role" field. Recipient resolution is
    driven by the booking's primary contact / first traveler today;
    the role tag wasn't actually consulted by the dispatcher.

  Backend cleanup (we're in beta — no users, no compat needed):

  - Drops the `relative_days_from_due_date` column from
    `notification_reminder_rules` (migration
    `0003_drop_legacy_columns.sql`).
  - Drops the `holiday_calendar` column from `notification_settings`
    (UI was already gone; the underlying public-holidays integration is
    out of scope for this iteration).
  - Removes the legacy single-offset dispatcher path entirely:
    `queueDueReminders` and `runDueReminders` now delegate straight to
    the stage-aware versions, and the four legacy helpers
    (`queueBookingPaymentScheduleReminder`,
    `queueInvoiceReminder`, `sendBookingPaymentScheduleReminder`,
    `sendInvoiceReminder`) plus the `ruleHasStages` skip check are
    deleted. Net ~500 lines removed from `service-reminders.ts`.
  - `relativeDaysFromDueDate` removed from validation, the run-summary
    schema, the notifications-react record schema, the operator
    template detail page, the legacy rule dialog, and the checkout
    service's reminder-runs join projection.
  - Legacy integration tests `reminders.test.ts` and
    `reminder-tasks.test.ts` are deleted; the stage-based
    `reminder-sequences.test.ts` covers the path that survives.

- Updated dependencies [4a6523e]
- Updated dependencies [4a6523e]
- Updated dependencies [4a6523e]
- Updated dependencies [4a6523e]
- Updated dependencies [4a6523e]
- Updated dependencies [4a6523e]
  - @voyant-travel/i18n@0.29.0
  - @voyant-travel/notifications@0.29.0
  - @voyant-travel/notifications-react@0.29.0
  - @voyant-travel/utils@0.29.0

## 0.28.3

### Patch Changes

- 60ef432: Add a `big-calendar` primitive — full-screen month / week / day calendar view with header, navigation, and event interaction primitives — exposed at the new `@voyant-travel/ui/components/big-calendar` subpath export.

  Also adds a `bg-calendar-disabled-hour` Tailwind utility (uses `color-mix(in oklab, var(--muted) 35%, transparent)`) for shading out-of-business hours in the week / day views, so consumers don't need to hand-roll the rgba.

- Updated dependencies [60ef432]
- Updated dependencies [60ef432]
- Updated dependencies [60ef432]
  - @voyant-travel/i18n@0.28.3
  - @voyant-travel/notifications@0.28.3
  - @voyant-travel/notifications-react@0.28.3
  - @voyant-travel/utils@0.28.3

## 0.28.2

### Patch Changes

- @voyant-travel/i18n@0.28.2
- @voyant-travel/notifications@0.28.2
- @voyant-travel/notifications-react@0.28.2
- @voyant-travel/utils@0.28.2

## 0.28.1

### Patch Changes

- 9d88eae: Fix #479: `priceCatalogRecordSchema.currencyCode` is now `z.string().nullable()`, matching the DB column, the server-side core schema, and the `#462` "NULL means follow `product.sellCurrency`" semantics. Operators using a single default public catalog with `currency_code = NULL` no longer hit `Voyant API response failed validation` on the catalog-settings page or the departure-pricing-override dialog.

  `PriceCatalogRecord["currencyCode"]` is now `string | null`. Registry components in `@voyant-travel/ui` (`price-catalogs-page`, `price-catalog-dialog`) render the NULL case as `—` and load it as `""` into the form. Direct consumers of `record.currencyCode` should add a similar fallback.

  - @voyant-travel/i18n@0.28.1
  - @voyant-travel/notifications@0.28.1
  - @voyant-travel/notifications-react@0.28.1
  - @voyant-travel/utils@0.28.1

## 0.28.0

### Patch Changes

- @voyant-travel/i18n@0.28.0
- @voyant-travel/notifications@0.28.0
- @voyant-travel/notifications-react@0.28.0
- @voyant-travel/utils@0.28.0

## 0.27.0

### Patch Changes

- Updated dependencies [dc46e37]
  - @voyant-travel/i18n@0.27.0
  - @voyant-travel/notifications@0.27.0
  - @voyant-travel/notifications-react@0.27.0
  - @voyant-travel/utils@0.27.0

## 0.26.9

### Patch Changes

- Updated dependencies [24a121e]
  - @voyant-travel/i18n@0.26.9
  - @voyant-travel/notifications@0.26.9
  - @voyant-travel/notifications-react@0.26.9
  - @voyant-travel/utils@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/i18n@0.26.8
- @voyant-travel/notifications@0.26.8
- @voyant-travel/notifications-react@0.26.8
- @voyant-travel/utils@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/i18n@0.26.7
- @voyant-travel/notifications@0.26.7
- @voyant-travel/notifications-react@0.26.7
- @voyant-travel/utils@0.26.7

## 0.26.6

### Patch Changes

- @voyant-travel/i18n@0.26.6
- @voyant-travel/notifications@0.26.6
- @voyant-travel/notifications-react@0.26.6
- @voyant-travel/utils@0.26.6

## 0.26.5

### Patch Changes

- @voyant-travel/i18n@0.26.5
- @voyant-travel/notifications@0.26.5
- @voyant-travel/notifications-react@0.26.5
- @voyant-travel/utils@0.26.5

## 0.26.4

### Patch Changes

- @voyant-travel/i18n@0.26.4
- @voyant-travel/notifications@0.26.4
- @voyant-travel/notifications-react@0.26.4
- @voyant-travel/utils@0.26.4

## 0.26.3

### Patch Changes

- @voyant-travel/i18n@0.26.3
- @voyant-travel/notifications@0.26.3
- @voyant-travel/notifications-react@0.26.3
- @voyant-travel/utils@0.26.3

## 0.26.2

### Patch Changes

- @voyant-travel/i18n@0.26.2
- @voyant-travel/notifications@0.26.2
- @voyant-travel/notifications-react@0.26.2
- @voyant-travel/utils@0.26.2

## 0.26.1

### Patch Changes

- @voyant-travel/i18n@0.26.1
- @voyant-travel/notifications@0.26.1
- @voyant-travel/notifications-react@0.26.1
- @voyant-travel/utils@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/i18n@0.26.0
- @voyant-travel/notifications@0.26.0
- @voyant-travel/notifications-react@0.26.0
- @voyant-travel/utils@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/i18n@0.25.0
- @voyant-travel/notifications@0.25.0
- @voyant-travel/notifications-react@0.25.0
- @voyant-travel/utils@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/i18n@0.24.3
- @voyant-travel/notifications@0.24.3
- @voyant-travel/notifications-react@0.24.3
- @voyant-travel/utils@0.24.3

## 0.24.2

### Patch Changes

- @voyant-travel/i18n@0.24.2
- @voyant-travel/notifications@0.24.2
- @voyant-travel/notifications-react@0.24.2
- @voyant-travel/utils@0.24.2

## 0.24.1

### Patch Changes

- ed635c7: Expose consistent Tailwind v4 style helper imports across admin and UI packages,
  and document single-tenant auth shell bootstrap without mandatory workspace
  organization routes.
  - @voyant-travel/i18n@0.24.1
  - @voyant-travel/notifications@0.24.1
  - @voyant-travel/notifications-react@0.24.1
  - @voyant-travel/utils@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/i18n@0.24.0
- @voyant-travel/notifications@0.24.0
- @voyant-travel/notifications-react@0.24.0
- @voyant-travel/utils@0.24.0

## 0.23.0

### Patch Changes

- @voyant-travel/i18n@0.23.0
- @voyant-travel/notifications@0.23.0
- @voyant-travel/notifications-react@0.23.0
- @voyant-travel/utils@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/i18n@0.22.0
- @voyant-travel/notifications@0.22.0
- @voyant-travel/notifications-react@0.22.0
- @voyant-travel/utils@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/i18n@0.21.1
- @voyant-travel/notifications@0.21.1
- @voyant-travel/notifications-react@0.21.1
- @voyant-travel/utils@0.21.1

## 0.21.0

### Minor Changes

- 6427bad: Release the booking journey architecture train.

  This adds booking hold policy support, richer traveler and booking journey flows, operator tax policy configuration, finance billing and tax policy APIs, notification reminder target and delivery tooling, and the template/runtime wiring needed for the operator storefront checkout flow.

### Patch Changes

- Updated dependencies [6427bad]
  - @voyant-travel/i18n@0.21.0
  - @voyant-travel/notifications@0.21.0
  - @voyant-travel/notifications-react@0.21.0
  - @voyant-travel/utils@0.21.0

## 0.20.0

### Patch Changes

- @voyant-travel/i18n@0.20.0
- @voyant-travel/notifications@0.20.0
- @voyant-travel/notifications-react@0.20.0
- @voyant-travel/utils@0.20.0

## 0.19.0

### Patch Changes

- @voyant-travel/i18n@0.19.0
- @voyant-travel/notifications@0.19.0
- @voyant-travel/notifications-react@0.19.0
- @voyant-travel/utils@0.19.0

## 0.18.0

### Patch Changes

- @voyant-travel/i18n@0.18.0
- @voyant-travel/notifications@0.18.0
- @voyant-travel/notifications-react@0.18.0
- @voyant-travel/utils@0.18.0

## 0.17.0

### Minor Changes

- 66d722d: Charters pricing was built around four hardcoded "first-class" currencies (USD/EUR/GBP/AUD). Adding a new currency required schema, validation, service, adapter, React, and UI changes — a domain constraint, not an i18n concern. This release replaces the column-per-currency shape with `pricesByCurrency: Record<currency, amount>` jsonb maps so adding a new currency is a content change, not a migration.

  **Schema:**

  - `charter_suites.{price,port_fee}_{usd,eur,gbp,aud}` (8 cols) → `prices_by_currency` + `port_fees_by_currency` (2 jsonb cols).
  - `charter_voyages.whole_yacht_price_{usd,eur,gbp,aud}` (4 cols) → `whole_yacht_prices_by_currency` (1 jsonb col).
  - `charter_products.lowest_price_cached_usd` → `lowest_price_cached_amount` + `lowest_price_cached_currency` (deployment-chosen browse currency).

  **API surface:** Removed `FIRST_CLASS_CURRENCIES`, `firstClassCurrencySchema`, `FirstClassCurrency`. Hook request types `currency: "USD"|"EUR"|"GBP"|"AUD"` → `currency: string`. `ExternalCharterProductSummary.lowestPriceUSD` → `lowestPriceAmount` + `lowestPriceCurrency`. `pricingService.lowestSuitePriceUSD` → `lowestSuitePriceForCurrency(db, voyageId, currency)`. `recomputeProductAggregates(db, productId, { browseCurrency? })` accepts an explicit browse currency; defaults to `"USD"` for backward compatibility.

  **Migration:** Existing deployments need a one-shot SQL backfill of the new jsonb columns from the old per-currency columns before the column drop lands. See PR #355 description for a sketch.

- 66d722d: Complete the UI i18n rollout: every `*-ui` package now ships locale-aware messages with English + Romanian definitions, a `MessagesProvider`, and a parity test harness. New packages adding UI components should mirror the same shape (see `packages/suppliers-ui` as the reference).

### Patch Changes

- Updated dependencies [66d722d]
- Updated dependencies [66d722d]
- Updated dependencies [66d722d]
- Updated dependencies [66d722d]
  - @voyant-travel/i18n@0.17.0
  - @voyant-travel/notifications@0.17.0
  - @voyant-travel/notifications-react@0.17.0
  - @voyant-travel/utils@0.17.0

## 0.16.0

### Patch Changes

- @voyant-travel/notifications@0.16.0
- @voyant-travel/notifications-react@0.16.0
- @voyant-travel/utils@0.16.0

## 0.15.0

### Minor Changes

- 361c8c5: Add `DateTimePicker` primitive (`@/components/ui/date-time-picker`) and migrate every remaining `<Input type="datetime-local">` in the registry.

  - Registered as `voyant-date-time-picker` in `packages/ui/registry.json` (`type: "registry:ui"`) so external consumers can install via `shadcn add voyant-date-time-picker`.
  - Composes Calendar + an `HH:mm` time input inside a Popover, with the value serialized as `"YYYY-MM-DDTHH:mm"` — drop-in compatible with the native `<input type="datetime-local">` contract.
  - Picking a new day preserves the existing time-of-day; clearing the time falls back to `00:00`.
  - Supports the same `disabled` / `dateDisabled` / `clearable` props as the enhanced DatePicker.
  - Migrated 6 sites across 4 registry files (booking guarantee, distribution sync + webhook dialogs, legal contract dialog), plus template copies in `templates/dmc`, `templates/operator`, `apps/dev`.

- 24869f4: UI consistency sweep across every registry dialog and form:

  - **New primitive**: `CurrencyCombobox` (`@/components/ui/currency-combobox`) — searchable currency picker backed by the canonical `currencies` list from `@voyant-travel/utils`. Trigger renders `CODE (symbol)`; items render `CODE — Name (symbol)`. Registered in `packages/ui/registry.json` as `voyant-currency-combobox` with `type: "registry:ui"` so external consumers can install via `shadcn add voyant-currency-combobox`.
  - **DatePicker enhancement**: added first-class `disabled?: boolean` (disables the entire picker) and `dateDisabled` (day-level matcher, forwards to underlying Calendar) props. Replaces prior ambiguity where `disabled` collided with react-day-picker's Matcher type.
  - **Swept every registry dialog + form**:
    - Native `<Input type="date">` → `<DatePicker>` (56 sites across bookings, finance, transactions, hospitality, legal, distribution, products).
    - Currency `<Input maxLength={3}>` → `<CurrencyCombobox>` (18 sites across the same domains).
    - Bare `<SelectTrigger>` → `<SelectTrigger className="w-full">` so the trigger fills its form column (~118 sites across every domain).
  - Template copies in `templates/dmc`, `templates/operator`, and `apps/dev` synced with the registry source.

- cccc905: `@voyant-travel/ui` is now publishable. Consumers can `pnpm add @voyant-travel/ui` and import primitives directly instead of copying them via the shadcn registry — updates flow with version bumps. The registry path remains for components you intend to fork.

  **What changed:**

  - `private: true` flipped to publishable; package removed from changesets `ignore` and added to the linked release group.
  - New `tsconfig.build.json` emits `dist/` (JS + `.d.ts` + declaration maps) under `module: ESNext` / `moduleResolution: Bundler`. The package is bundler-consumed by design.
  - New `build`, `clean`, `prepack`, `typecheck` scripts. `prepack` runs the build so `pnpm pack` produces a complete tarball.
  - `publishConfig.exports` mirrors the dev `exports` map but points at `./dist/*.js` + `./dist/*.d.ts`. Workspace consumers continue to resolve `./src/*` directly; only published consumers see the dist paths.
  - `files: ["dist", "src/styles", "postcss.config.mjs"]` — `globals.css` ships as-is for consumers to import.
  - Editor `tsconfig.json` aligned to `Bundler` resolution to match the build (avoids extensionless-import false positives in `tsc --noEmit`).
  - One latent type bug in `input-group.tsx` fixed (`querySelector` lacked an explicit element-type narrowing).

  **Tree-shaking:** `sideEffects: false` is set across all UI/react packages in this repo, so unused named exports drop through barrels in modern bundlers.

### Patch Changes

- cccc905: Bulk-extract per-domain importable UI packages, mirroring the `*-react` split. 17 new `*-ui` packages shipping a combined 137 components; primitives package `voyant-ui` gains 3 promoted shared primitives (`currency-combobox`, `date-time-picker`, `country-combobox`).

  **New `*-ui` packages**: `booking-requirements`, `bookings`, `charters`, `cruises`, `distribution`, `external-refs`, `extras`, `finance`, `hospitality`, `identity`, `legal`, `markets`, `pricing`, `products`, `resources`, `sellability`, `suppliers`. (Already shipped in prior commit: `crm-ui`.)

  **`voyant-ui` additions**: `CurrencyCombobox`, `DateTimePicker`, `CountryCombobox` — promoted from registry/template-local sources because they're shared primitives that 21 domain components depend on. Adds `@voyant-travel/utils` to dependencies.

  **Two distribution modes for every domain**:

  - Importable: `pnpm add @voyant-travel/<domain>-ui` — version-tracked, updates flow with bumps
  - Registry: `npx shadcn add @voyant/<component>` — copy + own, fork-friendly

  **Components NOT in importable packages** (registry-only):

  - Router-coupled components (TanStack Router): legal `quotes-page`, `create-quote-dialog`, etc.
  - Template-local-helper-coupled: `@/components/voyant/crm/*` deps, `@/lib/api-client` deps
  - Components with pre-existing latent bugs surfaced by per-package compilation: API drift against `*-react` hooks (e.g., `useBookingItemParticipants` no longer exists), loose typing that worked under permissive consumer tsconfigs but not under strict library compilation, broken imports to skipped sibling components

  The full coupling-and-bug list is preserved in each package's README. These components remain consumable via the shadcn registry path; they can be promoted into the importable packages when their underlying issues are fixed.

  **Domains with no importable surface** (all components either failed to compile or were registry-only by design): `auth`, `ground`, `notifications`, `transactions`. Their components remain available via the registry.

  **Tree-shaking**: `sideEffects: false` is set across all packages. With ESM + Bundler-resolution, modern bundlers (Vite, webpack, Next.js) drop unused named exports through barrels.

- e84fe0f: Add shared upload-aware media workflows to the product registry components.

  `product-media-section` now supports optional file upload handlers and compact
  embedded rendering for day-level media management. `product-itinerary-section`
  now renders the shared day-media section directly inside expanded itinerary day
  rows, so apps no longer need a local wrapper just to manage day media uploads.

  - @voyant-travel/notifications@0.15.0
  - @voyant-travel/notifications-react@0.15.0
  - @voyant-travel/utils@0.15.0
