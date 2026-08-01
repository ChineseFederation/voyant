# @voyant-travel/i18n

## 0.119.2

### Patch Changes

- e65bd25: Rename the bespoke sales Quote domain to Proposals across packages, routes, schemas, migrations, generated graph authorities, and operator surfaces.

  This beta-line release keeps no compatibility aliases, routes, package names, forwarding exports, views, or dual writes for the bespoke sales rename. Existing beta databases that contain the old bespoke quote schema must be dropped and recreated from the clean-slate migrations; there is no in-place migration path and no data-preservation guarantee for those beta databases.

## 0.119.1

### Patch Changes

- 5694a2b: Make the operator profile the source of truth for shared brand appearance, legal links, support contact, and customer-facing locales, including resolvable public branding URLs, safe slot-scoped asset delivery, and settings UI.

## 0.119.0

### Minor Changes

- 7496159: Add a Settings → MCP page. It leads with the one address an operator pastes into Claude or ChatGPT to connect an assistant, lists the assistants they have already connected with a one-click disconnect, and keeps API-token snippets for coding tools (Claude Code, Cursor, VS Code, curl) as a secondary section. The live authorized tool manifest is shown with required scopes and risk posture.

## 0.118.3

### Patch Changes

- 903c754: Restore a first-class manual booking flow for operator staff.

  Bookings now expose a route-backed **New booking** action and a focused form
  that collects the product/departure, billing contact, travelers, payment
  schedule, price, notes, and initial status. The form defaults to `on_hold`,
  requires an explicit review confirmation, and dispatches through Finance's
  durable `create_booking` Tool with an authoritative booking number and a stable
  idempotency key for safe retries.

  Operated product details also expose **Create booking** with the product
  preselected, and the new flow includes English and Romanian operator copy.

## 0.118.2

### Patch Changes

- 6c76de3: Rename the first-party processor to Voyant Pay while accepting legacy provider identifiers, and add readiness-aware active processor selection to managed payment settings.

## 0.118.1

### Patch Changes

- 91f1c80: Resolve departure times in the slot's own timezone on the product detail page.

  A slot's `startsAt`/`endsAt` are true UTC instants — the server validates
  `dateLocal` by converting `startsAt` through the slot's `timezone`. The product
  page ignored that zone on both sides:

  - **Read:** `formatSlotTime` / `formatSlotDate` used `getUTC*`, so a departure
    stored as `2026-11-20T12:00:00Z` in `Europe/Bucharest` rendered as 12:00
    instead of 14:00. The End column was wrong in date as well as time, and
    `formatDuration` inherited the error for itineraries crossing local midnight.
  - **Write:** `combineLocalToIso` committed the operator's entered wall clock
    straight through as UTC, so a departure entered as "14:00, Europe/Bucharest"
    was stored as `14:00Z` and actually ran at 16:00 local.

  The two were wrong in mirror image, so they agreed with each other while the
  Availability page — which converts correctly — showed a different time for the
  same slot. Both now go through `instantToSlotLocal` / `localToInstant` from
  `@voyant-travel/operations/scheduling`. Entering a local time that does not
  exist (the spring-forward gap) is now a field error rather than a silently
  shifted instant.

  `formatSlotTime` and `formatSlotDate` take the slot timezone as a second
  argument.

## 0.118.0

### Minor Changes

- 1873611: Redesign the admin dashboard and integrate the setup checklist as a strip

  The setup checklist rendered as a ~900px stack of nested cards above the KPI
  row and only resolved after the dashboard had already painted, pushing the
  whole page down (measured CLS 0.56). It now renders as a fixed-height strip
  with the step list in a sheet, and the dashboard around it was reworked:

  - `setup-react` replaces the checklist card with a 56px strip (progress ring,
    counts, progress bar, `Continue`, dismiss) that opens a right-hand sheet of
    flat step rows. The strip reserves its box from first paint, and the route
    loader now seeds the widget's query cache so it renders resolved rather than
    resolving a two-round-trip chain post-paint. The `initialize` POST is skipped
    when the state the loader already fetched covers every selected step.
  - The strip's progress bar and percentage track completed **and** skipped steps
    while the label counts completed ones, so a skipped step no longer makes
    "3 of 6 complete" and "50%" contradict each other; skipped steps are now
    reported separately.
  - `admin` gains a dashboard page header (title, description, and a 3/6/12-month
    range control wired through the bookings and finance aggregate queries), and
    the chart/list cards move to matched 7-column grids.
  - `DashboardSkeleton` now mirrors `DashboardPage` box for box — same slots,
    grids, and body heights, shared through `dashboard-layout.ts` — so the
    route-loader pending boundary swap no longer reflows the page.
  - `DashboardEmptyState` accepts `className` so an empty card occupies the same
    box as the chart or list it replaces.
  - The pending boundary reserves the `dashboard.header` strip only when the
    resolved page will fill it. Reserving unconditionally would trade one shift
    for another: a workspace with no contributing extension, with setup
    dismissed, or with every step terminal would lose that box on the swap.
    Widgets record whether they occupy space (`@voyant-travel/admin/dashboard/layout`),
    and the extension registry rules out deployments that contribute no widget.
  - Skipping a setup step no longer hides its description and action. There is no
    unskip control, so a skipped step stayed unreachable even though the shell
    copy promises you can leave and return; only completed steps collapse now.
  - Range-dependent copy follows the selector. The revenue KPI is summed from the
    ranged aggregate response, so it names the range instead of claiming
    "all-time", and the monthly-bookings empty state no longer hardcodes six
    months.

  Fixes several `CardHeader` usages that passed `sm:flex-row sm:items-start
sm:justify-between` without `flex`; `CardHeader` is `display:grid`, so those
  were inert and dropped the dismiss button and status badges into a second row
  instead of aligning them right. The dashboard now uses `CardAction`.

## 0.117.3

### Patch Changes

- 5daf427: Add the managed Voyant Payments transport and honest capability contract, hosted
  Stripe Connect onboarding for operators, and scheduled storefront reconciliation.

  Expose typed fail-closed adapter errors and onboarding state, render embedded
  onboarding with the required narrowly scoped security headers, and keep payment
  authorization distinct from completed settlement.

  Expand the public payment-adapter conformance kit across authorize, capture,
  void, refund, and status, with capability and fixture honesty, strict positive
  minor-unit money, typed fail-closed errors, full idempotency conflict checks,
  callback signature and replay semantics, stable processor identity and
  references, manual capture, partial-operation bounds, and typed health
  diagnostics. Add deterministic conforming and deliberately broken fake adapters
  that exercise every contract case.

## 0.117.2

### Patch Changes

- e2cb9f5: Unify the product booking-mode vocabulary. The products table column, detail
  chips, and the editor picker now all use the same short labels (Multi-day tour,
  Accommodation, Day trip, Timed activity, Transfer, Open-dated voucher, Other)
  instead of the table showing terse words (Itinerary, Date, Stay) while the editor
  showed long descriptive ones. The pricing basis (rooms & nights / per person) is
  kept as a secondary hint shown only inside the picker.
- e2cb9f5: On the operator invoice detail page, the Person and Organization links no longer
  show the raw record id — they now show a "View person" / "View organization"
  action, matching the Booking link. Adds the corresponding labels to the shared
  admin finance messages.
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
- e2cb9f5: Visual polish pass. Remove duplicated empty-state text in the media library and
  the product media section (the same message no longer appears twice), and clean
  up remaining "CRM" jargon the plain-language pass missed in the person/company
  create dialogs, flight contact picker, and booking traveler picker (now
  "contacts"/"contact" instead of "CRM").

## 0.117.1

### Patch Changes

- 6b1e647: Add first-class operator webhook subscription settings, delivery history, test and replay actions, permission checks, secret redaction, and protected outbound delivery.

  Start the generic Postgres delivery worker only when the webhook module is selected, and compose the new settings surface into the standard operator package.

## 0.117.0

### Minor Changes

- 90d44c0: Add the operator editorial-overlay editor for sourced products: configured-locale switching, side-by-side provider/overlay/effective comparison on wide screens with an accessible tabbed compare on narrow ones, overlay-only translation authoring, media-library-backed image overlays, customer preview, confirmed clear, and optimistic-concurrency conflict reporting.

  The product editorial-overlay admin read model now enumerates every eligible field (not only fields that already carry an overlay) and reports per-field `exact`, `language-fallback`, `source-fallback`, `overlaid`, `overlay-only`, `missing`, `invalid`, and `orphaned` state plus drift against the provider's last source update, the cached source locales, and whether the entity is provider-sourced.

  `useLocale()` now exposes the deployment's `supportedLocales`, and the catalog overlay service exposes `fetchOverlayRowsForEntity` for admin surfaces that need overlay audit columns.

## 0.116.1

### Patch Changes

- 130f62c: Expose owned-product SEO metadata and Open Graph images through the product admin and storefront surfaces.

## 0.116.0

### Minor Changes

- f0f51b4: Add the Media library admin navigation surface. The media deployment manifest
  now declares an `admin` block with a runtime factory, route, and navigation
  entry, and `@voyant-travel/media-react/admin` exposes
  `createSelectedMediaAdminExtension`, which contributes a "Media library"
  navigation item plus a route that renders the `<MediaLibrary>` browse surface.
  The operator navigation catalogue gains the `mediaLibrary` label in English and
  Romanian.

## 0.115.1

### Patch Changes

- 464815c: Operator base currency setting (the FX recording base).

  Add a base-currency selector to Settings → Operator profile. The value is
  persisted on the Finance operator-settings singleton (`booking_tax_settings`
  gains `base_currency`, `fx_commission_bps`, and `fx_commission_invoice_mention`)
  and provided to Finance through the existing operator-settings runtime port, so
  `GET`/`PATCH /v1/admin/finance/invoice-fx-settings` can now read and write it.
  This is the base every invoice and payment records its `base_*_cents` FX
  snapshot against, and the currency reporting consolidates into. Includes the
  en/ro catalog copy for the new section.

## 0.115.0

### Minor Changes

- c2ca4a3: Add a Settings → Payments surface where operators browse first-party payment
  processors and connect one (single active provider per org). Introduces the
  payment provider catalog + credential-field schema + registry port and a remote
  adapter transport in `@voyant-travel/payments`, a `payment_provider_config`
  table, service, and `/v1/admin/settings/payments/*` routes in
  `@voyant-travel/operator-settings`, the Payments settings page in
  `@voyant-travel/operator-settings-react`, the `managed` payments provider value
  in the framework deployment graph, and en/ro catalog strings. Self-host
  deployments configure their processor via environment variables (read-only in
  the UI); managed connect brokering lands in a follow-up.

## 0.114.0

### Minor Changes

- ecf1680: Remove the redundant singular storefront branding admin surface and make the
  organization (operator) profile the single home for org brand identity.

  Storefronts are plural (many per org, managed under the top-level "Storefronts"
  surface). The leftover singular "storefront" Settings page edited a separate
  branding blob (logo/favicon/brand mark/colors/languages) that duplicated brand
  identity already modeled on the operator profile. Per-storefront visuals are a
  developer's frontend concern, not an admin one, so the surface and its storage
  schema are dropped.

  - storefront: drop the module `admin` block (branding settings page + branding
    setup step) and remove the `branding` shape from the storefront settings
    schema, service, admin/public routes, and OpenAPI documents. No database
    migration is required — storefront branding was never persisted to a table;
    it lived only in static deployment settings.
  - storefront-react / storefront-sdk: remove `createSelectedStorefrontAdminExtension`,
    the storefront settings page/form, and the `./admin`, `./ui`, and
    `./components/storefront-settings-page` package exports. `StorefrontSettingsRecord`
    and the settings schemas no longer carry `branding`.
  - operator-settings-react / i18n / legal: rename the user-facing "Operator
    profile" label to "Organization" ("Organizație" in Romanian) across the
    settings nav, page title, saved-toast copy, and contract template-authoring
    descriptions. The API path, `operator_profile` table, ids, and query keys are
    unchanged.

## 0.113.0

### Minor Changes

- 2bcafc9: Render installed apps' full-page admin surfaces (`admin.pages[]`) as first-class operator sidebar entries with an icon and label, routing to `AppExtensionPage`.

  - Apps: add an optional app-declared nav `icon` (HTTPS-only) to each admin page plus an app-level default `icon` on the manifest, resolved into each page at normalize time; the resolver threads the icon through `ResolvedAppPage`.
  - Admin: add an optional runtime navigation hook (`AdminExtension.useRuntimeNavItems`) merged after static navigation; the shell calls it for every extension in stable order. The UI-extensions factory now contributes app-page nav entries and a single param route (`apps/$installationId/$pageKey`) that renders the matching installed page. Add `createRemoteNavIcon`, which renders the remote icon URL as a hardened `<img>` (no-referrer, lazy, decorative) with a generic lucide fallback on missing/invalid/broken images. The app-page route's "unavailable" copy is localized via the operator admin messages catalog, and its static route title accepts an optional localized `labels` override.
  - i18n: add `appPageTitle` and `appPageUnavailable` operator admin chrome messages (en + ro).

  Pausing or uninstalling an app drops its pages from the resolver, so both the nav entry and the route target disappear on the next query.

## 0.112.2

### Patch Changes

- b2212ac: Fix `formatDateTime` crashing with `Invalid option : option` when called with individual date-part component options.

  `createLocaleFormatters().formatDateTime` unconditionally merged its default `dateStyle`/`timeStyle` on top of the caller's options. `Intl.DateTimeFormat` forbids combining `dateStyle`/`timeStyle` with individual component options (`year`, `month`, `day`, `hour`, `minute`, …), so callers passing component options threw a `TypeError`. This took down the Apps admin surfaces (installed apps list and marketplace consent screen) whenever an app was installed. The default styles are now only applied when the caller hasn't specified a shape of their own (`timeZone` alone does not count as a shape).

## 0.112.1

### Patch Changes

- 117fa05: Generate managed-deployment contracts from operator-authored default templates and number series without deployment-specific workflows. Add reusable light- and dark-mode horizontal logo and icon assets to Operator Profile, expose them to contract templates, and provide accessible drag-and-drop upload controls. Introduce a shared document-renderer port and zero-code HTTP adapter so managed deployments can use a private platform renderer while self-hosters can swap in their own renderer for contracts and brochures.

## 0.112.0

### Minor Changes

- 3062a73: Add an operator-configurable official FX reference-rate source and a dedicated
  Invoicing settings page.

  A new finance operator setting `fx.referenceSource` (`ecb` | `bnr`, default
  `ecb`) lives on the finance operator-settings row, is normalized on read, exposed
  through the finance operator-settings runtime port, and surfaced on the
  `/tax-settings` admin GET/PATCH schema.

  Finance also gains a `finance.fx-reference.runtime` port plus a typed
  `resolveReferenceRate({ base, quote, date })` helper that reads the operator's
  configured source and delegates to a host-provided implementation; hosts wire it
  to their own FX data source. When no provider is wired, an explicit reference-rate
  request throws a typed `FinanceFxReferenceSourceUnavailableError`. No existing
  invoice math is wired to it — this ships the setting and seam only, with zero
  behaviour change for existing deployments.

  Invoicing configuration moves off the Taxes settings page onto a new dedicated
  **Invoicing** settings page (registered in the admin settings navigation the same
  way Taxes is). The invoicing-mode section moves there and the new reference-rate
  Select is added alongside it (EN + RO); both read/write the shared `/tax-settings`
  surface. The Taxes page returns to purely tax content.

## 0.111.3

### Patch Changes

- 7a7fd97: Strengthen the internationalization platform across the operator and package UI.

  Add ICU message formatting, explicit locale and time-zone formatters, hierarchical
  locale fallback, validated runtime overrides, account-authoritative preferences,
  localized setup and navigation surfaces, and fail-closed catalog and UI-literal
  checks. Package message providers now accept an optional time zone and expose the
  shared formatting capabilities to package-owned UI.

## 0.111.2

### Patch Changes

- 5941d2c: Remove the unused action-ledger relay outbox schema, service, HTTP route, tool,
  and entry-detail UI. Ledger canaries now verify the append-only write path, and
  future exports/projections use cursor checkpoints while work-queue consumers use
  the framework's generic durable event outbox.

## 0.111.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.

## 0.111.0

### Minor Changes

- bbe6396: Replace the overloaded Finance voucher domain with Travel Credits across the
  database schema, APIs, package exports, booking inputs, storefront settings,
  and operator UI. Redemption commands are replay-safe, codes are normalized and
  case-insensitively unique, and legacy records migrate in place without silently
  skipping invalid balances. Keep Promotion Codes in Commerce and move Bookings
  fulfillment to the explicit Service Voucher vocabulary.

## 0.110.0

### Minor Changes

- 62e87ee: Surface flight orders (bookings/tickets). Adds a Flights → Orders list page (`FlightOrdersPage`) and an order detail route on the packaged flights admin, so a held order — carrying a ticketing deadline — no longer disappears after the confirmation screen. Operators can review orders, filter by status/search, and from the detail view issue tickets (before the deadline) or cancel. Adds a `useFlightOrderTicket` hook and a capability-gated `POST /orders/:orderId/ticket` route to the flights module. The operator admin sidebar now expands Flights into **Search** and **Orders** sub-items (`admin` nav + `i18n` `flightsSearch` label; `flightOrders` label already existed).

## 0.109.8

### Patch Changes

- f1090b7: Align resource assignment detail schemas around `assignedAt`, reject orphan or incoherent slot assignment lifecycle payloads, and surface assignment target validation in the admin UI.
- 42f662c: Reject inverted, duplicate, and overlapping resource closeout windows and surface matching admin form validation.

## 0.109.7

### Patch Changes

- bd00f36: Improve booking Documents tab guidance by disabling traveler document submission until a file upload exists, clearing upload form state when the selected file is removed, aligning empty-state copy with the Add contract action, and explaining unavailable generated-contract preview setup.

## 0.109.6

### Patch Changes

- 14845ee: Rename the operator Channel sync surface to Distribution and clarify setup, monitoring, retry, reconcile, and delivery messaging.

## 0.109.5

### Patch Changes

- ad02eae: Reject non-image product media as cover media and surface brochure generation failures in the product detail UI.

## 0.109.4

### Patch Changes

- 16ec0cb: Render saved additional rate-plan room/category prices in the admin product detail grid and label the price controls for assistive technology.

## 0.109.3

### Patch Changes

- b1f90b0: Block trip component mutations after checkout has started and surface the locked state in the admin composer.
- c1d8f71: Return failed trip reservations as conflict responses, hide internal SQL details from reservation failures, and persist the admin draft-booking toggle before reserve.

## 0.109.2

### Patch Changes

- a96ce05: Recompute Trips reserve validation when component payment schedule mode changes and show payment schedule validation reasons before reserve.

## 0.109.1

### Patch Changes

- c6acfa5: Exclude cancelled and removed trip components from active trip aggregate totals, refresh those totals after component cancellation, and label active versus cancelled component value in the admin trip detail.

## 0.109.0

### Minor Changes

- 7cb6fa7: Package-delivered MICE admin surface (`@voyant-travel/mice-react/admin`).

  - New `./admin` entry exporting `createMiceAdminExtension` — contributes the
    Programs nav item (spliced after Bookings) plus the route implementations for
    the programs list (`/mice`) and a program's detail (`/mice/$id`, where the
    per-currency cost sheet lives). Picked up by `voyant admin generate` via the
    `<module>-react/admin` convention; resolves the `mice.program.list` /
    `mice.program.detail` semantic destinations.
  - `@voyant-travel/i18n`: new `nav.mice` operator-admin label (en "Programs",
    ro "Programe").

## 0.108.0

### Minor Changes

- 4abf9a2: Deployment team management + granular member RBAC (voyant#2085).

  - `@voyant-travel/types`: `member-roles` (preset bundles reusing the API-key permission catalog) + `settings`/`team` resources.
  - `@voyant-travel/auth`: `cloud-broker` member-management client + assertion `scopes`.
  - `@voyant-travel/hono`: opt-in staff-session scope enforcement in `requireActor` (`VOYANT_RBAC_ENFORCE`) + `isStaffRbacEnforced`.
  - `@voyant-travel/admin`: auth-mode-aware `TeamSettingsPage` with a granular permission editor.
  - `@voyant-travel/bookings`/`legal`: PII reveal gated on `bookings-pii:read` under enforcement.
  - `@voyant-travel/db`: `user_profiles.permissions` + `cloud_auth_user_links.scopes`.

## 0.107.4

### Patch Changes

- ba89f0b: Let admin departure edits choose and persist a product option so existing departures with a missing option can be repaired from the UI. Explicit slot option links are now validated against the slot product while product-level generated slots can still omit an option.

## 0.107.3

### Patch Changes

- 310565b: Surface a missing-option warning in the departures (availability slots) list (#2062).

  The slots table now has an Option column that shows each departure's option name
  and flags — with an amber badge + tooltip — any slot that has no option on a
  product that actually has options (i.e. an unpriceable departure that should be
  repaired via the option picker). Products without options are not flagged. The
  column resolves names from one capped active-options query per visible product,
  so a missing linkage is discoverable from the list, not just inside the edit
  dialog.

## 0.107.2

### Patch Changes

- dbea53e: Add an option picker to the admin departure (availability slot) form (#2059).

  The slot create/edit dialog now lets an operator choose which of the product's
  active options a departure belongs to — populated from the product's options
  (default marked), required when the product has options, and pre-selected from
  the slot's current `optionId` on edit so an unpriceable/incorrect slot can be
  repaired through the UI. Selecting a different product clears the stale option.
  This complements the pricing-correctness fixes in #2058: a departure's price is
  derived from its option's rate plans, so a slot must point at an option.

## 0.107.1

### Patch Changes

- c64d288: Fix Romanian i18n gaps on operator admin surfaces.

  - `@voyant-travel/catalog-react`: the cruises and accommodations browse pages rendered the static English route `title` prop as their heading; they now read the localized label from `useOperatorAdminMessages().nav.*`, matching the other catalog verticals.
  - `@voyant-travel/i18n`: corrected the quotes terminology in Romanian (operator nav + CRM org-detail) from "Cotatii" to "Oferte" so it matches the quotes package, and added a `trips.list.composeTrip` label (used by the operator's "Compose trip" action on the bookings list).

## 0.107.0

### Minor Changes

- a74471e: Quotes admin surface. A pipeline board (`/quotes`) plus a full quote workspace (`/quotes/$id`): editable deal fields, client (person and/or organization — B2C/B2B), travelers with an explicit PAX count, line items, tags, owner, the activity timeline, and the quote's versions nested inline. The quote value is derived from its line items and recomputed server-side on every change. Saving snapshots the current line items into a new proposal version that supersedes the prior one (one current version at a time); versions show a sequential number, Active/Expired status, and an editable valid-until on the active version. Adds `quotes.paxCount` plus `createdBy`/`updatedBy` audit fields (stamped from the acting user), an owner picker sourced from team members (falling back to the current user), and the `nav.quotes` operator label. The detail is a staged editor (edit freely; Save commits everything + snapshots a proposal version), with a quote description and images shown on the client proposal, and a "Send to client" action that surfaces the shareable proposal link (re-copying resolves the deployment's public proposal URL, not the admin origin). Products-based versions can be sent for review without a Trip snapshot; since acceptance reserves a frozen Trip, the public proposal exposes an `acceptable` flag and hides Accept (keeping Decline) for product-only proposals so clients never hit a guaranteed 409. All new copy is in en + ro.

## 0.106.1

### Patch Changes

- 0b10029: Split oversized shared service, UI, locale, and reference-data modules into focused internal files while preserving the existing public exports and runtime behavior.

## 0.106.0

### Minor Changes

- 7122c2a: Admin booking journey overhaul + unified new-booking + reusable catalog UI (#1625)

  - **bookings-ui**: the operator books on a single stacked, guided accordion (progressive unlock, auto-advance) instead of the wizard; storefront keeps the wizard. Travelers as add-rows + per-traveler type + CRM linking, Configure with departure-first + nested rooms + occupancy-dependency rules, price override + voucher in the side panel, single payment-link checkbox, notes/docs block, save-as-draft / confirmed-if-paid status, duplicate-departure warning, commit lands on the booking detail. Journey steps split into per-step modules. B2B billing is satisfied by a picked organization; switching the product option clears stale room selections.
  - **catalog / catalog-react / catalog-ui**: the operator catalog browse/detail UI moves into the shared `@voyant-travel/catalog-ui` + `@voyant-travel/catalog-react` packages (detail pages, browse/dynamic/scheduled, gallery, calendar, sheet, enrichment, catalog i18n) so other templates can reuse them; booking-engine commit path returns the booking id and lands on detail.
  - **catalog-contracts**: adds pax-band occupancy dependencies, the option-units configure sub-step, and the sourced stays/package rate pin (`roomTypeId` / `ratePlanId` / `board`) to the booking-engine draft + adapter contracts.
  - **products / i18n**: products booking handler forwards the slot id + breakdown currency; admin booking-journey i18n strings.

## 0.105.0

### Minor Changes

- d1ad572: Rename CRM React hooks, UI components, and registry entries from Opportunity to Quote, with Quote Version surfaces split out for proposal/version workflows.

## 0.104.2

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

## 0.104.1

## 0.104.0

## 0.103.0

### Minor Changes

- a02f2f3: Follow-up polish for the operator product detail, from client review:

  - **Inclusions / exclusions / terms are now editable in the product sheet — and localizable.** The whole stack already carried `inclusionsHtml`/`exclusionsHtml`/`termsHtml` (product + `product_translations` columns, validation, react schemas, services); the form just never exposed them, so clients forked their own UI. They're now three rich-text `TranslatableField`s that switch with the language switcher and persist to the base columns + per-language translation rows.
  - **Traveler-type columns are editable/removable.** Hovering an Adult / Child column header reveals edit (opens the category dialog pre-filled) and remove (deletes a product/option-owned category, or just drops its prices for a shared global one). `TravelerCategoryDialog` is now edit-capable.
  - **Extras define + price in one place.** The standalone product-level "Extra" card is removed; each booking option's pricing has a single Extras section that both defines (new reusable `ProductExtraDialog`) and prices each add-on (per the option's rate plan), with edit/delete.

## 0.102.0

### Minor Changes

- b6d0673: Redesign the operator's **Booking options & prices** for low-tech travel agents and close the inventory/allocation gaps it exposed.

  - `@voyant-travel/products-ui`: each option now renders **one adaptive table** — a rooms grid (rooms × traveler types) or a per-person seats list — derived from the product's inventory (rooms always win over booking mode). The rate-plan layer is hidden behind an **Advanced** disclosure (a single default plan is auto-managed); the default plan's matrix is no longer duplicated there. Single-option products show the table directly with no chrome. The unit form pins its type in the contextual add ("Add room" can't create a vehicle) and uses type-aware quantity/occupancy labels; the price dialog uses the design-system currency input and pricing-mode-aware quantity labels. New departures pre-fill **Capacity (pax)** from the configured inventory (overridable).
  - `@voyant-travel/products`: `createProduct` seeds a default `Standard` option so new products open straight into the pricing table; the day-translation create route now verifies the day belongs to the product.
  - `@voyant-travel/availability` + `@voyant-travel/availability-react`: departure inventory templates can be **generated from the option's rooms** and **applied to existing open departures** (new bulk endpoint + hook). The full-inventory materializer now works for product-level departures (no `optionId`), so auto-seed on publish and bulk apply create the full room set. New per-slot `materialize-templates` endpoint.
  - `@voyant-travel/allocation-ui`: a slot's **Generate resources** now materializes the full configured inventory across all kinds in one click, instead of the pax-derived single-kind path.

## 0.101.2

### Patch Changes

- 577eaf5: Add in-context translations for products and itinerary days.

  - `@voyant-travel/products`: add a `products.default_language_tag` column (the language the base name/description columns are written in) and a new `product_day_translations` table (per-language title/description/location) with CRUD service methods and routes under `/v1/products/:id/days/:dayId/translations`.
  - `@voyant-travel/products-contracts`: validation schemas for the product default language and itinerary-day translations.
  - `@voyant-travel/products-react`: `useProductDayTranslations` / `useProductDayTranslationMutation` hooks, record/response schemas, and query keys; the product record now exposes `defaultLanguageTag`.
  - `@voyant-travel/schema-kit`: `product_day_translations` TypeID prefix (`pdtr`).
  - `@voyant-travel/i18n`: operator labels for the content-language switcher, default language, itinerary-day sheet, and market-rule columns.

## 0.101.1

### Patch Changes

- f736ba5: Improve product booking configuration for room-based travel products.

  - `@voyant-travel/products-ui`: rename the product setup UI around booking options, room inventory, traveler prices, and departure room inventory; hide traveler-age controls for room inventory units; add setup guardrails so room-based products cannot mix the legacy one-option-per-room shape with the canonical single-option/multiple-room-units shape.
  - `@voyant-travel/bookings` and `@voyant-travel/bookings-react`: preserve selected room/category refs through booking creation and quote travelers against the selected room plus traveler pricing category instead of falling back to unrelated rates.
  - `@voyant-travel/bookings-ui`: let agents select both the room and the traveler pricing category for each traveler when the selected room exposes category-specific prices, enforce room occupancy in the booking flow, and keep the booking summary aligned with the selected room.
  - `@voyant-travel/availability-react`: expose the additional resource template fields needed by room inventory setup.
  - `@voyant-travel/i18n`: add Romanian product-management labels for the renamed booking option and inventory concepts.
  - `@voyant-travel/catalog-ui`: localize ship-spec labels used by the catalog detail sheet.

## 0.101.0

## 0.100.0

## 0.99.0

## 0.98.0

## 0.97.0

## 0.96.0

## 0.95.0

## 0.94.0

## 0.93.0

## 0.92.0

## 0.91.0

## 0.90.0

## 0.89.0

## 0.88.0

## 0.87.1

## 0.87.0

## 0.86.0

## 0.85.4

## 0.85.3

## 0.85.2

## 0.85.1

## 0.85.0

## 0.84.4

## 0.84.3

### Patch Changes

- 9eadf50: Release booking billing party snapshots so existing bookings can store individual or company billing details, including VAT/tax ID, and the billing dialog can prefill from CRM people or organizations.

## 0.84.2

## 0.84.1

## 0.84.0

### Patch Changes

- 5462f07: Rename the remaining active trip composer stay filters from hospitality to accommodations and add a Cloudflare startup profile summary lane.

## 0.83.1

## 0.83.0

## 0.82.1

## 0.82.0

### Minor Changes

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

## 0.81.21

## 0.81.20

## 0.81.19

## 0.81.18

### Patch Changes

- 93874e4: Follow-ups to the booking-detail UX overhaul (#1332):

  - **Status change dialog (`@voyant-travel/bookings-ui`)**: surface the existing `suppressNotifications` API as a switch in `StatusChangeDialog`. The toggle only appears when the target status is `confirmed` (the only transition that honors the flag server-side per `status-dispatch.ts`) and routes the value through to `useBookingStatusMutation`. Lets operators confirm a booking silently — no confirmation email, no document bundle. EN/RO labels added.
  - **Booking documents tab (`templates/operator`)**: contracts table now has an "Open contract page" icon action linking to `/legal/contracts/$id`. EN/RO copy added under `bookings.detail.documentsTable.contractOpenTooltip`.
  - **Contract detail page (`@voyant-travel/legal-ui`)**: delete button now renders for `void` contracts too, not just drafts.
  - **Contract delete API (`@voyant-travel/legal`)**: `deleteContract` accepts `draft | void` (was draft-only). Returns `not_deletable` instead of `not_draft`; route error message updated to "Only draft or void contracts can be deleted".
  - **Contract auto-generation (issue #1335, `@voyant-travel/legal`)**: `issueContract` now allocates the series number **before** rendering and merges it into the render variables, so templates that print `{{ contract.number }}` / `{{ contract.contractNumber }}` resolve on the first issued PDF. The allocated number is also persisted back into `contract.variables` so regenerations stay consistent. Same merge applied in `ensureRenderedContract` for the deferred-render fallback path. New `mergeContractNumberIntoVariables` helper (exported) + 4 unit tests.

## 0.81.17

### Patch Changes

- e31a008: Follow-up to the booking-detail UX overhaul (#1332): satisfy the `i18n:check:ui-literals` CI scan.

  - `PaymentScheduleSection`: drop the unreachable `?? "Remove"` / `?? "Add installment"` fallbacks on the add / remove installment controls — the canonical `messages.paymentScheduleSection.labels` declares both keys as required, so the fallbacks were dead code that just tripped the linter.
  - `BookingInvoiceDialog`: mark the `SCHEDULE_DESCRIPTION_FALLBACK` entries (`"Deposit"`, `"Installment"`, `"Balance"`, `"Hold"`, `"Payment"`) with `i18n-literal-ok`. These persist as the invoice's line-item description and ship with the PDF — operator-managed copy intentionally English at the data layer.
  - Operator `BookingInvoiceSheet` had a literal `Download` button label on the attachment row. New nested key `bookings.detail.invoiceSheet.attachmentDownload` (`Download` / `Descarca`) threaded through as a `downloadLabel` prop so the helper stays hook-free.

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

## 0.81.15

## 0.81.14

## 0.81.13

### Patch Changes

- 36421aa: Persist contract document generation failure details on contract metadata and surface operator-facing failure labels.

## 0.81.12

## 0.81.11

## 0.81.10

## 0.81.9

## 0.81.8

## 0.81.7

## 0.81.6

## 0.81.5

## 0.81.4

## 0.81.3

## 0.81.2

## 0.81.1

## 0.81.0

## 0.80.18

## 0.80.17

## 0.80.16

### Patch Changes

- dbcc0da: Add admin invoice voiding and route finance admin clients through `/v1/admin/finance`.

## 0.80.15

## 0.80.14

## 0.80.13

## 0.80.12

### Patch Changes

- 5070731: Add finance invoice number series admin UI and localize issue-document allocation errors.

## 0.80.11

## 0.80.10

## 0.80.9

## 0.80.8

## 0.80.7

## 0.80.6

## 0.80.5

## 0.80.4

## 0.80.3

## 0.80.2

## 0.80.1

## 0.80.0

### Patch Changes

- 9473eb8: Add booking checkout URL helpers and operator-facing URL template labels for booking checkout/payment links.

## 0.79.0

## 0.78.0

## 0.77.13

## 0.77.12

### Patch Changes

- bf74cd4: Rename the invoice issuance status from `sent` to `issued`.

## 0.77.11

## 0.77.10

## 0.77.9

## 0.77.8

## 0.77.7

## 0.77.6

## 0.77.5

## 0.77.4

## 0.77.3

## 0.77.2

## 0.77.1

## 0.77.0

## 0.76.0

## 0.75.7

## 0.75.6

## 0.75.5

## 0.75.4

## 0.75.3

### Patch Changes

- 38167cd: Allow manually numbered legal contracts and update operator contract dialog copy for template-free uploads.

## 0.75.2

## 0.75.1

## 0.75.0

## 0.74.2

## 0.74.1

## 0.74.0

## 0.73.1

## 0.73.0

## 0.72.0

## 0.71.0

## 0.70.0

## 0.69.1

## 0.69.0

## 0.68.0

## 0.67.0

## 0.66.6

## 0.66.5

## 0.66.4

## 0.66.3

## 0.66.2

## 0.66.1

## 0.66.0

### Minor Changes

- a74089c: Add operator admin message keys across the trips, bookings, legal, products, settings, action-ledger, availability, and resources bundles (en + ro) to back the operator template's voyant components subtree. All additions are additive — existing keys are unchanged.

## 0.65.0

## 0.64.1

## 0.64.0

## 0.63.1

## 0.63.0

## 0.62.3

## 0.62.2

## 0.62.1

## 0.62.0

## 0.61.0

### Patch Changes

- 89f033e: Add product-level terms and conditions fields to products and product translations. The products API, React runtime schemas, and products UI now expose product terms content, and deployment migrations add `terms_html` plus `terms_show_on_contract`.

## 0.60.0

## 0.59.0

## 0.58.0

## 0.57.0

## 0.56.0

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

## 0.55.0

## 0.54.0

## 0.53.2

## 0.53.1

## 0.53.0

## 0.52.4

## 0.52.3

## 0.52.2

### Patch Changes

- 3e09123: Quiet/auxiliary updates.

  - `@voyant-travel/notifications`: `booking.confirmed` subscriber honors a new `suppressNotifications` flag on the event payload so operators can confirm a booking without firing the customer-facing email/doc bundle (data corrections, manual hand-offs).
  - `@voyant-travel/customer-portal`: public service + validation tightened around the new booking tax-preview shape; integration tests updated to assert the new response.
  - `@voyant-travel/i18n`: new admin strings for the bookings billing dialog, finance tax-preview labels, CRM operator screens, and products operator surface (EN + RO).

## 0.52.1

## 0.52.0

## 0.51.1

### Patch Changes

- deaacb3: Add a `manageAvailabilityAction` message under `products.products` (en + ro) used by the dmc product detail page's new "Manage availability" button (which deep-links into `/availability?productId=…`).

## 0.51.0

### Patch Changes

- 2316791: Redesign `AvailabilitySlotDetailPage` from a debug-dump card stack into a tabbed workspace.

  - One compact header (product name + date range + nights + status pills) replaces the start-date-concatenated-with-itself title and the three "Unlimited / Past Cutoff / Too Early : Yes/No" rows.
  - 4-cell **KPI strip** (pax remaining/initial, product, date, notes).
  - 5-tab body: **Allocation** (default) · **Pickup** · **Closeouts** · **Activity** · **Meta**. Counts render as badges on the tab triggers; empty tabs show one inline message instead of a full empty card. Activity bundles the audit log + resource-assignment list; Meta holds identifiers + lifecycle timestamps.
  - Null detail rows (rule / start time / ends at / initial pickups / remaining pickups / remaining resources) hide instead of rendering a dash.
  - New slot props on the package:
    - `breadcrumb?: ReactNode` — host renders breadcrumbs in its own chrome (sidebar inset top bar).
    - `headerActions?: ReactNode` — host can override the in-page Open product / Delete buttons and render them elsewhere.
    - `renderAllocation?: ({ slotId, productId }) => ReactNode` — host mounts the allocation manager (keeps `availability-ui` free of any runtime dependency on `allocation-ui`).
  - Product / start time rows in the Meta tab are real links via the existing `onOpenProduct` / `onOpenStartTime` callbacks.

  `@voyant-travel/i18n`: new keys under `availability.details.tabs.*` for the detail page's tabbed body (en + ro).

## 0.50.8

## 0.50.7

## 0.50.6

## 0.50.5

## 0.50.4

## 0.50.3

## 0.50.2

## 0.50.1

## 0.50.0

## 0.49.0

## 0.48.0

## 0.47.0

## 0.46.0

## 0.45.0

## 0.44.0

## 0.43.0

## 0.42.0

## 0.41.3

## 0.41.2

## 0.41.1

## 0.41.0

## 0.40.1

## 0.40.0

## 0.39.0

## 0.38.2

## 0.38.1

## 0.38.0

## 0.37.1

## 0.37.0

### Patch Changes

- dc29b79: Persist operator-confirmed booking totals from the create dialog and audit manual price overrides with a required reason.
- f014fd2: Capture manual base-currency settlement amounts for cross-currency customer and supplier payments, and settle invoice balances from the base invoice amount.

## 0.36.0

## 0.35.0

## 0.34.0

### Patch Changes

- 6ad175a: Add dashboard empty states, KPI empty hints, and localized first-run onboarding copy.

## 0.33.1

## 0.33.0

## 0.32.3

## 0.32.2

## 0.32.1

## 0.32.0

## 0.31.4

## 0.31.3

## 0.31.2

### Patch Changes

- 54ddc93: Add API token management powered by Better Auth API keys, including reusable React hooks, a shared auth UI package, canonical permission presets, and API-key route permission guards.

## 0.31.1

## 0.31.0

## 0.30.7

## 0.30.6

## 0.30.5

## 0.30.4

## 0.30.3

## 0.30.2

## 0.30.1

## 0.30.0

## 0.29.0

### Patch Changes

- 4a6523e: Reminder sequences UI (#488).

  New `@voyant-travel/notifications-ui` package with the reminder-sequence editing surface:

  - `<StageList />` — ordered stages per rule, with reorder + delete and an embedded channel list.
  - `<StageEditorDialog />` — anchor / window / cadence (`once` | `every_n_days` | `escalating(buckets[])`) / `maxSendsInStage` / `respectQuietHours`.
  - `<StageChannelList />` + `<StageChannelEditorDialog />` — per-stage multi-channel rows (channel, template, recipient kind, optional role).
  - `<NotificationSettingsForm />` — quiet hours / blackout dates / weekend skip / recipient daily cap / suppression window.
  - `<RemindersPreviewList />` — read-only "what would fire on this date" table with reasoning per row.
  - Full en/ro i18n with `NotificationsUiMessagesProvider`.

  Hooks added to `@voyant-travel/notifications-react`:

  - `useReminderRuleStages`, `useReminderRuleStageMutation` (create, update, delete, reorder)
  - `useReminderStageChannels`, `useReminderStageChannelMutation`
  - `useNotificationSettings`, `useNotificationSettingsMutation`
  - `useRemindersPreview`

  Operator template wires up three new routes (`/notifications/reminder-rules/:id`, `/notifications/preview`, `/notifications/settings`) and the operator nav gains Preview + Settings entries.

## 0.28.3

### Patch Changes

- 60ef432: Let templates lift the search + filter row out of the overview cards and into the page header (matching the rest of the operator shell), and accept a per-tab toolbar slot.

  `@voyant-travel/availability-ui`:

  - `<AvailabilityOverview />` accepts `showFilters?: boolean` (default `true`). When `false`, the inline search input + product filter + clear-filters button row is hidden so the consuming page can render the same controls in its own header without duplication. KPI cards and the rest of the overview still render unchanged.
  - `<AvailabilitySlotsTab />`, `<AvailabilityRulesTab />`, `<AvailabilityStartTimesTab />`, `<AvailabilityCloseoutsTab />`, `<AvailabilityPickupPointsTab />` each accept an optional `toolbar?: ReactNode` rendered between the selection action bar and the data table — for tab-scoped filter chips, pickers, etc.

  `@voyant-travel/availability-react`:

  - `ProductListFilters` now accepts an optional `search` string, threaded through `getProductsQueryOptions` as a `?search=` query-string parameter so product pickers can autocomplete server-side.

  `@voyant-travel/resources-ui`:

  - `<ResourcesOverview />` accepts `showFilters?: boolean` (default `true`) with the same semantics as the availability overview — hides the inline search + kind-filter row when the consuming page surfaces those controls in its header.

  `@voyant-travel/i18n`:

  - Admin resources messages add `filtersButton`, `filtersKindLabel`, `filtersSupplierLabel` / `filtersSupplierAny` / `filtersSupplierEmpty`, `filtersProductLabel` / `filtersProductAny` / `filtersProductEmpty` (en + ro) for the new header-level filter popover.

- 60ef432: Add a unified payments listing that joins customer and supplier payments into a single feed, and split the operator finance area into separate Invoices and Payments pages.

  `@voyant-travel/finance`:

  - New routes `GET /v1/admin/finance/payments` and `GET /v1/admin/finance/payments/:id`. The list endpoint accepts a `kind` filter (`customer` | `supplier`) plus the usual `status` / `paymentMethod` / `currency` / `invoiceId` / `bookingId` / `supplierId` / `paymentDateFrom` / `paymentDateTo` / `search` filters and `sortBy` (`amountCents` | `status` | `paymentDate` | `createdAt`) / `sortDir`. The detail endpoint dispatches by typeid prefix — `pay_*` resolves to a customer payment, `spay_*` resolves to a supplier payment. `bookingId` is applied to both branches: directly to `supplier_payments.booking_id` on the supplier side and via `invoices.booking_id` (joined as `i`) on the customer side, so a booking-scoped query no longer returns unrelated customer rows.
  - `financeService.listAllPayments(db, query)` and `financeService.getPaymentById(db, id)` return a `UnifiedPaymentRow` shape with normalized fields (`personName`, `organizationName`, `supplierName`, `invoiceNumber`, `bookingNumber`) joined in via SQL so the operator UI doesn't need follow-up lookups.
  - New exports: `UnifiedPaymentRow` (service.ts) and `paymentKindSchema` / `paymentListQuerySchema` / `paymentListSortFieldSchema` / `paymentListSortDirSchema` (validation-payments.ts).

  `@voyant-travel/finance-react`:

  - New hooks: `useAllPayments(filters)` and `usePayment(id)` plus the underlying `getAllPaymentsQueryOptions` / `getPaymentQueryOptions` query-options factories.
  - New types: `FinancePaymentKind`, `FinanceAllPaymentsListFilters`, `FinanceAllPaymentsListSortField`, `FinanceAllPaymentsListSortDir`.
  - New schemas: `paymentKindSchema`, `unifiedPaymentRecordSchema`, `allPaymentsListResponse`, `paymentSingleResponse`, plus matching `UnifiedPaymentRecord` type.
  - New invoice-payment-mutation invalidation now also invalidates `financeQueryKeys.allPayments()` so the unified feed stays in sync with single-invoice payment flows.

  `@voyant-travel/admin`:

  - Operator nav `finance` entry now points at `/finance/invoices` and exposes an `items` sub-nav with `invoices` and `payments` links, matching the new operator page split.

  `@voyant-travel/i18n`:

  - Operator nav messages add `invoices` and `payments` (en + ro).
  - Admin finance messages add `invoicesPageTitle`/`invoicesPageDescription`, `paymentsPageTitle`/`paymentsPageDescription`, `recordPayment`, `searchPaymentsPlaceholder`, `kindColumn`/`kindCustomer`/`kindSupplier`/`partyColumn`/`filtersKindLabel`/`filtersKindAll`, plus the `paymentDetail` and `recordPaymentDialog` message groups (en + ro).

- 60ef432: Reject the contradictory combination of `option_price_rules.pricing_mode = "per_booking"` and child per-unit prices, and stop the admin UI from offering the unit-pricing matrix on a per-booking rule (#482).

  Before: an `option_price_rule` with `pricingMode = "per_booking"` could carry rows in `option_unit_price_rules`. The storefront totaller in `service-departures.ts` switches on the _unit-level_ `pricingMode`, so the rule-level `per_booking` badge was effectively cosmetic — the rule said "single flat amount per booking", the math actually multiplied per-unit prices by quantity. Operators saw "Per Booking" and reasonably expected a flat charge; the system did something different.

  After:

  - `pricingService.createOptionUnitPriceRule` rejects (400) creating a unit-price row whose parent rule has `pricingMode = "per_booking"`.
  - `pricingService.updateOptionPriceRule` rejects (400) flipping a rule to `pricingMode = "per_booking"` when child unit-price rows already exist.
  - The product-options pricing form in the operator template and apps/dev hides the unit-pricing matrix when the rule is per-booking and shows a helper pointing the user at Per Person / Starting From if they want unit-level prices.
  - New i18n key `priceRules.perBookingFlatHint` (en + ro).

  Choosing one mode over the other isn't lossy — operators on rules currently configured as `per_booking` with unit prices were already getting the unit-level math; the badge will now match the math after they switch the rule's mode (typically to `per_person` or `per_unit` at the unit level).

## 0.28.2

## 0.28.1

## 0.28.0

## 0.27.0

### Patch Changes

- dc46e37: First-class per-departure price overrides (#467).

  Operators can now opt a single departure out of the seasonal `priceSchedule` layer by setting an explicit per-unit price. Resolved at snapshot time before option price rules: a unit with an active override on a given departure gets that override's amount; units without an override fall through to the schedule-matched rule.

  **`@voyant-travel/pricing`**

  - New `departure_price_overrides` table (TypeID prefix `dpov`). One row per `(departureId × optionUnitId × priceCatalogId)` with `sellAmountCents`, optional `costAmountCents`, `active` flag, `notes`, `metadata`.
  - Service + admin REST CRUD at `/v1/admin/pricing/departure-overrides`.
  - New `loadDeparturePriceOverrides` helper in `service-rule-resolver`.
  - Public pricing snapshot consumes overrides when `departureId` is passed: per-unit `sellAmountCents` is replaced for matching units. Backward-compatible — without `departureId`, the snapshot is unchanged.
  - Migrations shipped for the `operator` and `dmc` templates.
  - 5 integration tests covering: override beats unit price for the targeted unit, falls through when absent, respects `active=false`, multi-unit overrides coexist, no overrides applied when `departureId` is omitted.

  **`@voyant-travel/pricing-react`**

  - New hooks: `useDeparturePriceOverrides`, `useDeparturePriceOverride`, `useDeparturePriceOverrideMutation`.
  - New query options: `getDeparturePriceOverridesQueryOptions`, `getDeparturePriceOverrideQueryOptions`.
  - New record schema + paginated/single response envelopes.

  **`@voyant-travel/i18n`**

  - Admin strings for the operator template's "Override pricing" affordance and "Custom price" badge (EN + RO).

## 0.26.9

### Patch Changes

- 24a121e: Add admin strings for the simplified per-unit pricing table (#466).

  The operator UI now hides the unit×category pricing matrix when a price rule uses `pricingMode = "per_person"` and `allPricingCategories = true` — the pax-bucket unit (Adult / Child / Infant) already encodes the differentiation, so the 12-column room/group/category matrix is just noise on day-trip products. Three new strings power the simplified table:

  - `products.operations.priceRules.unitPricingTitle` — section title when the simple table renders
  - `products.operations.priceRules.tableSell` — Sell column header
  - `products.operations.priceRules.tableCost` — Cost column header (reserved for future per-unit cost editing)

  Existing `unitCategoryTitle` and `tableUnit` strings still drive the full matrix when `allPricingCategories` is off.

## 0.26.8

## 0.26.7

## 0.26.6

## 0.26.5

## 0.26.4

## 0.26.3

## 0.26.2

## 0.26.1

## 0.26.0

## 0.25.0

## 0.24.3

## 0.24.2

## 0.24.1

## 0.24.0

## 0.23.0

## 0.22.0

## 0.21.1

## 0.21.0

### Minor Changes

- 6427bad: Release the booking journey architecture train.

  This adds booking hold policy support, richer traveler and booking journey flows, operator tax policy configuration, finance billing and tax policy APIs, notification reminder target and delivery tooling, and the template/runtime wiring needed for the operator storefront checkout flow.

## 0.20.0

## 0.19.0

## 0.18.0

## 0.17.0

### Minor Changes

- 66d722d: Complete the UI i18n rollout: every `*-ui` package now ships locale-aware messages with English + Romanian definitions, a `MessagesProvider`, and a parity test harness. New packages adding UI components should mirror the same shape (see `packages/suppliers-ui` as the reference).
