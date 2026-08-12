# @voyant-travel/admin

## 0.137.0

### Patch Changes

- f4ac273: Make the operator admin usable on a phone. A measured audit at 390x844 found the
  desktop layout reflowing rather than adapting, with three defects that blocked real
  work: the booking detail header pushed `Cancel booking` and `Delete` entirely
  off-screen (252px of document overflow), four of its eight tabs were unreachable
  because the tab strip was not a scroll container, and hand-rolled tables inside
  `overflow-hidden` wrappers clipped columns with no way to scroll to them — `/suppliers`
  simply lost Country and Currency.

  Fixes stay in the composition layer; the shadcn-style primitives under
  `@voyant-travel/ui/components` are untouched. A new `@voyant-travel/ui/lib/responsive`
  exports the shared class strings.

  - Table wrappers that clipped or could not scroll now scroll horizontally (17 call
    sites across bookings, suppliers, catalog, finance, legal, notifications and
    inventory), and two tables that had no wrapper at all gained one.
  - List tables drop their low-value columns below `md` so the decision-relevant ones
    fit: bookings now shows number/status/total/dates instead of a created-at timestamp
    and an empty payer column, cutting hidden width from 706px to 111px. Products,
    invoices and suppliers get the same treatment, skeleton rows included.
  - The booking detail header wraps its actions and its tab strip scrolls, removing the
    document-level horizontal overflow.
  - The operator shell header is sticky, so the sidebar trigger — the only way to reach
    navigation on a phone — stays reachable on pages several screens tall.
  - Filter popovers cap their height, scroll internally and fit narrow viewports rather
    than running past the bottom of the screen.
  - Side sheets are full-width below `sm` instead of 75%, and touch targets on the
    sidebar trigger and row-selection checkboxes meet the 44px minimum.
  - The settings sub-nav scrolls its active section into view, so you can tell which of
    ~18 sections you are in.

- Updated dependencies [f4ac273]
  - @voyant-travel/ui@0.111.0

## 0.136.3

### Patch Changes

- de549da: Allow graph-selected admin modules to expose an import-cheap shell descriptor
  while their route loaders and page implementations remain dynamically loaded,
  and apply the seam to the Operations admin surface.

## 0.136.2

### Patch Changes

- af3996b: Load dashboard charts after aggregate data arrives, defer public finance page bodies until their route is visited, and keep vendor chunks from absorbing shared dependencies so workspace chrome does not wait on Recharts or payment UI.

## 0.136.1

### Patch Changes

- 9daffb1: Boot the portable operator shell without SSR state through the same-origin API contract and expose its pending state accessibly.

## 0.136.0

### Minor Changes

- bd8f49a: Add the versioned authenticated admin shell bootstrap contract, managed-host
  resolver seam, and TanStack Query hydration path for shell-critical state.
- 1e0506f: Add a declarative lazy loading boundary for route-only admin extensions and move
  business-account, custom-field, and webhook settings implementations out of the
  initial operator entry graph.

### Patch Changes

- @voyant-travel/types@0.109.13

## 0.135.1

### Patch Changes

- Updated dependencies [484b207]
  - @voyant-travel/i18n@0.123.0

## 0.135.0

### Minor Changes

- 7b8ef95: Product-analytics events from the booking engine, admin, and customer portal,
  emitted through a vendor-neutral port.

  None of these surfaces emitted any product-analytics signal, so a host could not
  measure where a traveller abandons a booking journey or where staff get stuck in
  the admin. This adds the **vendor-neutral half**: a port, the domain events that
  travel through it, and a conformance check binding the taxonomy to the code. It
  adds no analytics vendor, SDK, key, host, or proxy, and a checker now enforces
  that it never will.

  **`AnalyticsPort`** (`@voyant-travel/core/analytics`) is `track` / `identify` /
  `group`, bound by the host through the existing runtime-contributor mechanism on
  the server and through `<VoyantReactProvider analytics={…}>` (or
  `<VoyantAnalyticsProvider>`) in the browser. Four properties are guaranteed by
  the framework rather than left to each implementation:

  - **Unbound is a supported, silent state.** The default is `noopAnalytics`; a
    deployment that binds nothing behaves exactly as before and pays nothing.
  - **Fire-and-forget.** `track` returns `void`, so nothing can put an analytics
    round-trip on a booking's critical path.
  - **It cannot fail a booking.** `createSafeAnalytics` swallows a provider that
    throws, synchronously or from a returned promise.
  - **No PII in the contract.** Identifiers and enumerations only. `field` carries
    a requirement key, never the value entered against it; `entry_referrer` is
    reduced to an origin; an admin `route` is the matched route pattern, never a
    resolved URL; a search emits its result count and never the query text.

  **Booking engine, server.** `withBookingSessionAnalytics` decorates
  `BookingSessionModule` rather than scattering `track()` through the 2,500-line
  service: every lifecycle method already answers one discriminated
  `bookingSessionOutcomeV1`, so the outcome-to-event mapping is total and
  reviewable in one place, and the decorator returns the service's own value
  untouched.

  `failure_reason` is derived from the contract's own rejection kinds by one rule —
  _when a rejection carries a nested `reason`, that reason is the failure reason_ —
  so it is a closed enumeration rather than a message string. A test asserts the
  enumeration is **exactly** the set of failure outcomes `catalog-contracts` can
  publish, in both directions; a new rejection kind fails there rather than
  arriving in production as an `unknown` bucket. `engine.commit.failed` carries
  `missing_requirements[]` from `selection_incomplete.unsatisfied[]`. A Commit that
  suspends waiting for a payment guarantee or a supplier emits neither `succeeded`
  nor `failed` — it has not failed, and a buyer who never returns arrives as
  `engine.session.abandoned`.

  **Booking engine, client.** `engine.journey.started` fires from
  `useBookingSession().create()`, and `engine.field.errored` — the stuck-point
  signal — fires from `useBookingQuote` and `useCommitBookingSession` whenever the
  server answers `selection_incomplete`, with no host instrumentation at all.
  `engine.step.viewed` / `.completed` are host-driven through
  `useBookingJourneyAnalytics()`, because the Booking Requirements descriptor
  decides which steps exist; the hook derives `duration_ms` and `retries` itself.

  **Admin** events are derived from the operation descriptor in `useAdminQuery` /
  `useAdminMutation`, so every packaged admin read and write is covered without
  per-page work. `admin.nav.viewed` and `admin.extension.opened` come from the
  shell.

  **Customer portal**: `portal.session.started` and `portal.booking.viewed` are
  automatic; `portal.document.downloaded` is a callback, because the package ships
  no download action. `portal.payment.made` and `portal.support.contacted` are
  **deliberately undeclared** — the portal has no payment or support-contact leg to
  emit them from, and an event with no emitter is a dashboard line that reads zero
  forever.

  **Conformance.** `verify:analytics-conformance` is declarative
  (`scripts/checks/analytics/event-catalogue.json`) and asserts three directions
  plus vendor neutrality: the declared catalogue matches
  `docs/architecture/analytics-events.md`, every declared event is emitted by some
  tracked source, no `track()` call names an undeclared event or property, and no
  tracked manifest or emitter imports an analytics vendor. It reads the tracked
  tree via `trackedFilesIn`, and `verify:tracked-tree-scan` holds both halves of
  that line.

  Also removes the dead `POSTHOG_API_KEY` / `POSTHOG_HOST` passthrough from
  `turbo.json`, left over from a retired stack that nothing in this repository
  read.

### Patch Changes

- Updated dependencies [7b8ef95]
- Updated dependencies [f56d552]
  - @voyant-travel/react@0.106.0
  - @voyant-travel/i18n@0.122.1

## 0.134.5

### Patch Changes

- Updated dependencies [1be6b76]
  - @voyant-travel/react@0.105.0

## 0.134.4

### Patch Changes

- Updated dependencies [64df424]
  - @voyant-travel/i18n@0.122.0

## 0.134.3

### Patch Changes

- Updated dependencies [ff0b8cc]
  - @voyant-travel/i18n@0.121.0

## 0.134.2

### Patch Changes

- Updated dependencies [06a79a0]
  - @voyant-travel/i18n@0.120.0

## 0.134.1

### Patch Changes

- f7adc5b: Preserve product and departure context when starting a manual booking, fall back
  to owned inventory when catalog search is unavailable, derive departure end
  times from explicit product duration, and route local operator sign-up through
  the admin authentication realm. Name icon-only combobox controls for assistive
  technology.
- Updated dependencies [f7adc5b]
  - @voyant-travel/i18n@0.119.3

## 0.134.0

### Minor Changes

- bf71bca: Allow installed app pages to declare deterministic navigation order, structural groups, and host-item anchors, and resolve those contributions through the admin shell without changing existing flat appended pages.

## 0.133.0

### Minor Changes

- 5fa76aa: Publish the admin UI extension slot vocabulary from the contract package.

  `ADMIN_UI_EXTENSION_SLOTS` and `AdminUiExtensionSlot` now live in
  `@voyant-travel/admin-extension-sdk`, which is the dependency-free package an
  extension author already installs. `@voyant-travel/admin` and
  `@voyant-travel/apps` derive from it instead of restating it.

  The list was previously maintained twice — once in
  `packages/admin/src/ui-extensions/registry.ts` for the shell that renders the
  slots, and once in `packages/apps/src/contracts.ts` as the enum the manifest
  schema validates against. They agreed only by discipline, and a slot added to
  one would have been rejected by the schema or left unrendered by the shell.

  `@voyant-travel/admin` keeps exporting `ADMIN_UI_EXTENSION_SLOTS`,
  `AdminUiExtensionSlot`, and `isAdminUiExtensionSlot`, and `@voyant-travel/apps`
  keeps exporting `APP_ADMIN_EXTENSION_SLOTS`, so no consumer import changes.

### Patch Changes

- Updated dependencies [5fa76aa]
  - @voyant-travel/admin-extension-sdk@0.3.0

## 0.132.0

## 0.131.1

### Patch Changes

- Updated dependencies [7496159]
  - @voyant-travel/i18n@0.119.0
  - @voyant-travel/types@0.109.10

## 0.131.0

### Patch Changes

- Updated dependencies [bf20d76]
  - @voyant-travel/ui@0.110.0

## 0.130.0

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

### Patch Changes

- Updated dependencies [1873611]
  - @voyant-travel/i18n@0.118.0

## 0.129.2

### Patch Changes

- 63baa7c: Fold organization setup into a dismissible dashboard widget and remove the dedicated Setup page/nav.

  Caller migration for `@voyant-travel/setup-react`: the public `SetupPage` export and `/setup` route are removed. Use the `SetupDashboardWidget` contribution on `dashboard.header` (via `createSelectedSetupAdminExtension`) instead of mounting a Setup page or linking to `/setup`.

## 0.129.1

### Patch Changes

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
- e2cb9f5: Polish pass on flagged UI issues. The product activity feed no longer shows raw
  principal IDs or camelCase field names (it now shows a readable actor type and
  plain field names). The product "Extras" section header now matches the sibling
  "Rooms & prices" header style. Empty dashboard metrics render a lighter,
  less-prominent placeholder instead of a full-weight dash. And the person and
  organization create/edit forms now open as right-side sheets with a sticky
  footer (matching the convention for larger forms) instead of tall centered
  dialogs.
- e2cb9f5: Fix a stray vertical scrollbar inside the invoice detail tab bar (the horizontal
  scroll container was also allowing a 1px vertical overflow to scroll) by clipping
  the vertical axis. And make the app boot loaders consistent: the initial
  "Loading workspace" spinner and the workspace-bootstrap spinner no longer show
  text, so users see one steady spinner instead of a spinner-with-text that
  flickers into a plain spinner before the shell appears.
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
  - @voyant-travel/i18n@0.117.2
  - @voyant-travel/ui@0.109.5

## 0.129.0

### Minor Changes

- 90d44c0: Add the operator editorial-overlay editor for sourced products: configured-locale switching, side-by-side provider/overlay/effective comparison on wide screens with an accessible tabbed compare on narrow ones, overlay-only translation authoring, media-library-backed image overlays, customer preview, confirmed clear, and optimistic-concurrency conflict reporting.

  The product editorial-overlay admin read model now enumerates every eligible field (not only fields that already carry an overlay) and reports per-field `exact`, `language-fallback`, `source-fallback`, `overlaid`, `overlay-only`, `missing`, `invalid`, and `orphaned` state plus drift against the provider's last source update, the cached source locales, and whether the entity is provider-sourced.

  `useLocale()` now exposes the deployment's `supportedLocales`, and the catalog overlay service exposes `fetchOverlayRowsForEntity` for admin surfaces that need overlay audit columns.

### Patch Changes

- Updated dependencies [90d44c0]
  - @voyant-travel/i18n@0.117.0

## 0.128.3

### Patch Changes

- Updated dependencies [f0f51b4]
  - @voyant-travel/i18n@0.116.0

## 0.128.2

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/i18n@0.115.0

## 0.128.1

### Patch Changes

- Updated dependencies [ecf1680]
  - @voyant-travel/i18n@0.114.0

## 0.128.0

### Minor Changes

- 2bcafc9: Render installed apps' full-page admin surfaces (`admin.pages[]`) as first-class operator sidebar entries with an icon and label, routing to `AppExtensionPage`.

  - Apps: add an optional app-declared nav `icon` (HTTPS-only) to each admin page plus an app-level default `icon` on the manifest, resolved into each page at normalize time; the resolver threads the icon through `ResolvedAppPage`.
  - Admin: add an optional runtime navigation hook (`AdminExtension.useRuntimeNavItems`) merged after static navigation; the shell calls it for every extension in stable order. The UI-extensions factory now contributes app-page nav entries and a single param route (`apps/$installationId/$pageKey`) that renders the matching installed page. Add `createRemoteNavIcon`, which renders the remote icon URL as a hardened `<img>` (no-referrer, lazy, decorative) with a generic lucide fallback on missing/invalid/broken images. The app-page route's "unavailable" copy is localized via the operator admin messages catalog, and its static route title accepts an optional localized `labels` override.
  - i18n: add `appPageTitle` and `appPageUnavailable` operator admin chrome messages (en + ro).

  Pausing or uninstalling an app drops its pages from the resolver, so both the nav entry and the route target disappear on the next query.

### Patch Changes

- Updated dependencies [2bcafc9]
  - @voyant-travel/i18n@0.113.0

## 0.127.0

### Minor Changes

- a461920: Source admin extensions from active app installations and complete the iframe
  session-token host flow (RFC Phase 3). Adds an installation-backed
  `UiExtensionsClient` (`createInstallationUiExtensionsClient`) alongside the
  static one; wires the reserved `request-token` message to an environment token
  broker (host answers `not-supported` without one, `unavailable` on failure);
  passes the resolved app locale + text direction to each frame at init and on
  change; and adds full-page app extensions (`AppExtensionPage`) with navigation
  contributions rendered through the unchanged sandboxed host (no
  `allow-same-origin`). The extension API moves to `1.1.0`.

### Patch Changes

- a461920: Harden the admin session-token broker: drop grant replies once the requesting frame has navigated or unmounted, time out pending `requestToken()` promises instead of hanging, and expose page fetchers from the installation-backed extensions client so full-page app extensions are reachable.
- Updated dependencies [a461920]
- Updated dependencies [a461920]
  - @voyant-travel/admin-extension-sdk@0.2.0

## 0.126.2

### Patch Changes

- 0868f18: Add the app registry foundation with closed manifest validation, deterministic release compilation, protected manifest ingestion, and admin API wiring.
- Updated dependencies [3062a73]
  - @voyant-travel/i18n@0.112.0

## 0.126.1

### Patch Changes

- 7a7fd97: Strengthen the internationalization platform across the operator and package UI.

  Add ICU message formatting, explicit locale and time-zone formatters, hierarchical
  locale fallback, validated runtime overrides, account-authoritative preferences,
  localized setup and navigation surfaces, and fail-closed catalog and UI-literal
  checks. Package message providers now accept an optional time zone and expose the
  shared formatting capabilities to package-owned UI.

- Updated dependencies [7a7fd97]
  - @voyant-travel/i18n@0.111.3

## 0.126.0

### Minor Changes

- c1e37f2: Add the versioned admin UI-extension host: a public slot registry
  (`ADMIN_UI_EXTENSION_SLOTS`), a render-time compatibility check
  (`isUiExtensionCompatible`), a sandboxed-iframe `UiExtensionHost` implementing
  the `postMessage` protocol, and `createUiExtensionsAdminExtension` /
  `createStaticUiExtensionsClient` for mounting installed extensions into every
  slot. Re-exports the contract and version constant from the new
  `@voyant-travel/admin-extension-sdk`.

### Patch Changes

- Updated dependencies [c1e37f2]
  - @voyant-travel/admin-extension-sdk@0.1.0

## 0.125.0

### Minor Changes

- 7e9f77a: Add organization defaults and member overrides for stable admin navigation IDs. Apply visibility
  after selected navigation composition without exposing ineligible routes, inherit hidden parent
  state through navigation subtrees, and retain structural parents only when a child is explicitly
  re-enabled. Ship the persistence, admin API, provisioning seam, and settings UI in standard Operator
  deployments, with duplicate settings contributions normalized at the host and core boundaries.
- 82ffd12: Add persisted organization-level first-run setup guidance composed from the
  selected admin graph. Standard Operator deployments now collect package-owned
  business profile, storefront, market, fiscal, navigation, team, and first-product
  steps while keeping domain mutations in their existing package surfaces.
- 6147b93: Add a package-owned `/settings/team` surface backed by a graph-selected,
  provider-neutral team-management runtime port. Better Auth and Voyant Cloud now
  adapt roster, invitation, role, deactivation, capability, and nullable activity
  data behind the same server-enforced contract. Move the team route, page, copy,
  and icon from the admin shell into Auth and Auth React.

### Patch Changes

- b459761: Accept current Lucide releases in public peer ranges so the standard Operator package closure
  resolves for external npm consumers.
- Updated dependencies [766d24b]
  - @voyant-travel/ui@0.109.2

## 0.124.0

### Minor Changes

- 73ab096: Standardize first-party packages on package-owned deployment manifests, provider selection,
  access metadata, concrete event contracts, selected admin navigation, and published runtime
  references. Add Bookings Extras as an independently selected graph unit and remove the central
  admin navigation catalog.
  Link facets now distinguish entity `linkable` metadata from executable `definition` exports, and
  generated Node registries reject malformed definitions before service registration.
  Provider-owned required config and secrets now apply only when that provider is selected, so
  local and in-memory deployments do not require credentials for inactive remote providers.

### Patch Changes

- Updated dependencies [73ab096]
  - @voyant-travel/types@0.109.2

## 0.123.3

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [8d62a7c]
  - @voyant-travel/types@0.109.1
  - @voyant-travel/i18n@0.111.1
  - @voyant-travel/react@0.104.2
  - @voyant-travel/ui@0.109.1

## 0.123.2

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/i18n@0.111.0

## 0.123.1

### Patch Changes

- d83d237: Repair packaged consumer development and production startup, keep shared UI
  contexts single-instanced under Vite, make unconfigured realtime quiet, and
  restore narrow client-safe validation and Finance voucher setup exports. Resolve
  legacy frontend imports through product-owned browser facades and allow clean CI
  installs to fetch metadata for external dependencies.

## 0.123.0

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [8bd906f]
  - @voyant-travel/types@0.109.0
  - @voyant-travel/ui@0.109.0

## 0.122.0

### Minor Changes

- 490d132: Remove the final snapshot-era managed-profile aliases from the admin and migration package surfaces. Admin hosts now consume `AdminAuthRuntime`, `getAdminApiUrl`, and `adminFetcher`; deployment migration collection is exposed as `collectDeploymentMigrationSources`.

### Patch Changes

- 490d132: Move standard first-party admin factories, package copy, slots, contributions, and icons into selected deployment graph composition.
- 490d132: Move Operator Settings and Relationships admin presentation authority into selected package graph factories.
- 490d132: Make package and project declarations the sole selected access authority, removing legacy catalog overlays and runtime synthesis.
- Updated dependencies [490d132]
  - @voyant-travel/types@0.108.1

## 0.121.0

### Minor Changes

- d771be3: Compile selected graph access catalogs, make Bookings the first package-owned access authority, and
  wire exact-pair catalog validation through runtime authorization and permission editors.
- d771be3: Add the uniform selected-admin factory context used by package-owned admin
  cutovers.

### Patch Changes

- Updated dependencies [d771be3]
  - @voyant-travel/types@0.108.0

## 0.120.0

### Minor Changes

- a97e845: Expose the managed profile's active module set at runtime so the source-free
  admin can gate its composition by the deployment's module subset (voyant#3063).

  The managed runtime already honors a profile's `modules: [...]` subset for the
  API (`createVoyantApp({ exclude })`), but the shared, framework-version-tagged
  admin image composed _every_ `create<Module>AdminExtension()` factory
  unconditionally — so every managed operator saw the full nav even when its
  profile activated a subset, with nav entries linking to pages whose API isn't
  mounted (dead links / 404s).

  `@voyant-travel/framework`:

  - Add `resolveActiveModuleIds(project)` (`/profile`) — the resolved module `include`
    set (the same one that drives `createVoyantApp({ exclude })`) as `moduleId`s.
  - `GET /auth/bootstrap-status` now returns `modules` on `ManagedBootstrapStatus`,
    so the workspace bootstrap probe learns what's active for this deployment.

  `@voyant-travel/admin`:

  - `AdminBootstrapStatus` carries an optional `modules` module-id list the
    source-free admin filters its nav/widget composition by (fail-open when
    absent).
  - `AdminWorkspaceShell` accepts `activeModuleIds`; when provided, the packaged
    **base** nav is gated to those modules (`filterAdminNavigationByModules` /
    `OPERATOR_ADMIN_NAV_MODULE_IDS`), so a shared image's static nav (Flights,
    Finance, Legal, …) is hidden for a profile subset — not just
    extension-contributed items. Fail-open when omitted, so self-hosted starters
    are unaffected.

## 0.119.0

### Minor Changes

- 8a665f3: Complete the runtime admin route/navigation composition so a source-free host
  (no generated route module) works end to end (voyant#3044).

  - `buildAdminExtensionRoutes` now builds and attaches a layout contribution's
    nested `children` (e.g. core `/settings/*`) — previously only top-level
    contributions were created, so deep links like `/settings/channels` landed on
    not-found.
  - New `buildAdminExtensionDestinations(extensions)` derives the semantic
    destination resolver map from the registry's route bindings at runtime (the
    analogue of `voyant admin generate --destinations`), so packaged pages'
    `useAdminHref` / `useAdminNavigate` resolve instead of falling back to `#`.
  - `AdminNavigationProvider.resolvers` and `AdminWorkspaceShell.destinations`
    are now `Partial<AdminDestinationResolvers>` — honest, since the provider
    already falls back to `#` for any unbound key (resolvers needing more than
    path interpolation stay host-owned). Full maps remain assignable.

## 0.118.0

## 0.117.0

### Minor Changes

- ecdf0fc: Add the admin auth capability **port** for the managed-profile admin host
  (`ManagedProfileAdminAuthRuntime`, `AdminBootstrapStatus`, `AdminAuthMode` from
  `@voyant-travel/admin/app`) — Phase 2 of voyant#3044.

  Auth is deployment-owned: the packaged admin shell/guard never import a concrete
  auth client; a deployment supplies the port (a managed Voyant Cloud profile
  provides a Cloud-broker impl, a self-host deployment a Better Auth impl).

  `createAdminWorkspaceBeforeLoad` now takes the port (`{ auth }`) instead of a
  bare `{ getCurrentUser }`, and resolves the unauthenticated destination from it:
  `voyant-cloud` mode redirects to the Cloud identity-broker, otherwise to the
  local `signInPath` — removing the previous double-hop through the local sign-in
  page and keeping the packaged admin free of a concrete auth client.

## 0.116.0

### Minor Changes

- 62e87ee: Surface flight orders (bookings/tickets). Adds a Flights → Orders list page (`FlightOrdersPage`) and an order detail route on the packaged flights admin, so a held order — carrying a ticketing deadline — no longer disappears after the confirmation screen. Operators can review orders, filter by status/search, and from the detail view issue tickets (before the deadline) or cancel. Adds a `useFlightOrderTicket` hook and a capability-gated `POST /orders/:orderId/ticket` route to the flights module. The operator admin sidebar now expands Flights into **Search** and **Orders** sub-items (`admin` nav + `i18n` `flightsSearch` label; `flightOrders` label already existed).

### Patch Changes

- Updated dependencies [62e87ee]
  - @voyant-travel/i18n@0.110.0

## 0.115.4

### Patch Changes

- Updated dependencies [c9a356f]
  - @voyant-travel/types@0.107.0

## 0.115.3

### Patch Changes

- 2bb3b18: Keep dashboard booking links route-tree agnostic for reduced starters that do not mount native booking routes.

## 0.115.2

### Patch Changes

- Updated dependencies [7cb6fa7]
  - @voyant-travel/i18n@0.109.0
  - @voyant-travel/ui@0.108.2

## 0.115.1

### Patch Changes

- Updated dependencies [51f7dea]
  - @voyant-travel/types@0.106.0

## 0.115.0

### Minor Changes

- 4abf9a2: Deployment team management + granular member RBAC (voyant#2085).

  - `@voyant-travel/types`: `member-roles` (preset bundles reusing the API-key permission catalog) + `settings`/`team` resources.
  - `@voyant-travel/auth`: `cloud-broker` member-management client + assertion `scopes`.
  - `@voyant-travel/hono`: opt-in staff-session scope enforcement in `requireActor` (`VOYANT_RBAC_ENFORCE`) + `isStaffRbacEnforced`.
  - `@voyant-travel/admin`: auth-mode-aware `TeamSettingsPage` with a granular permission editor.
  - `@voyant-travel/bookings`/`legal`: PII reveal gated on `bookings-pii:read` under enforcement.
  - `@voyant-travel/db`: `user_profiles.permissions` + `cloud_auth_user_links.scopes`.

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/types@0.105.0
  - @voyant-travel/i18n@0.108.0
  - @voyant-travel/ui@0.108.1

## 0.114.0

### Patch Changes

- Updated dependencies [a74471e]
- Updated dependencies [a74471e]
  - @voyant-travel/i18n@0.107.0
  - @voyant-travel/ui@0.108.0

## 0.113.0

### Minor Changes

- 4f92198: Voyant 1.0 visual refactor of the framework UI.

  - **Tokens** (`@voyant-travel/ui` `globals.css`): warm off-white paper, near-black ink, and a single hot-orange brand accent (`--brand`, new token) reserved for charts/focus/active state. Inter Tight type. Fixed brand chart palette (`--chart-1..5`). A coherent radius system: controls + their dropdowns at `rounded-sm` (4px), cards/table surfaces at `rounded-md` (6px), dialogs/sheets at `rounded-xl`.
  - **`@voyant-travel/ui` components**: new `SegmentedControl`; `Button` gains a `brand` variant; sharper, consistent radii across Button/Input/Select/Combobox/Textarea/Toggle/Tabs/Menus/Command/Card/DataTable/Badge; bordered active sidebar items (primary + sub) and inset-panel border; assorted fixes (Command search-input radius, toggle-group corners, sidebar sub-menu spacing).
  - **`@voyant-travel/admin`**: Voyant 1.0 brand logo lockup (composed mark + wordmark, collapse-to-badge); operator shell defaults to the inset sidebar layout; dashboard KPI cards, brand chart colors, and Figma-matched sidebar (bordered active item, near-black nav text, bordered user card with open-state).
  - **Domain `*-react` packages**: card surfaces normalized to the new `rounded-md` radius; flights search bar (trip-type toggle, route cards, airport dropdown) and the resources tabs aligned to the system.

### Patch Changes

- Updated dependencies [4f92198]
  - @voyant-travel/ui@0.107.0

## 0.112.0

### Minor Changes

- 94890c3: Add `adminExtensionsFromGlob` + `buildAdminExtensionRoutes` — the admin-UI half of the "extend without forking" seam (Workstream C). A deployment drops an `AdminExtension` (page + widget + nav, via the existing `defineAdminExtension`) into `src/admin/<name>/index.tsx` and it's auto-discovered from a Vite `import.meta.glob` and composed into the shell:

  - `adminExtensionsFromGlob(glob)` collects the default-exported `AdminExtension`s in stable order; append them to the shell's extension registry so their `navigation` and `widgets` resolve through `resolveAdminNavigation`/`resolveAdminWidgets`.
  - `buildAdminExtensionRoutes(extensions, getParentRoute, runtime)` builds top-level TanStack routes from the extensions' `routes` contributions at runtime (mirrors the generated `admin.routes.generated.tsx` loop) for grafting via `attachAdminExtensionRoutes`. Discovered pages are reachable by string navigation (no typed-link map entry).

  See `docs/architecture/custom-modules.md`.

- cb9b04b: New `defaultOperatorNavIcons` export — the standard operator nav icon set (the 15 standard lucide icons), shipped by the framework so deployments stop hand-wiring lucide imports + an icon map. Use `icons={defaultOperatorNavIcons}` directly, or spread to override a single entry (`{ ...defaultOperatorNavIcons, finance: MyIcon }`). First slice of consolidated-deployments Workstream C (admin chrome derivation).

## 0.111.5

### Patch Changes

- c38f00a: Add a default admin router pending fallback so package-owned admin apps show a loading state while route guards and loaders resolve.

## 0.111.4

### Patch Changes

- 8fd3d68: Expose AdminWorkspaceShell header slots and add the workspace.header.actions widget slot.

## 0.111.3

### Patch Changes

- ecec979: Improve operator bundle boundaries by adding route-local admin message provider support, exposing admin extension route helpers, keeping pending skeletons structural, and tightening Vite route ignores and vendor chunk splitting so heavy admin route dependencies stay out of the initial entry.

## 0.111.2

### Patch Changes

- eef1a00: Republish notification and UI consumer packages so stale beta artifacts no longer reference legacy notification package specifiers.

## 0.111.1

### Patch Changes

- dd71543: Move the packaged admin app shell into `@voyant-travel/admin/app/*` and keep
  `@voyant-travel/admin-app` as a compatibility shim over the new exports.

## 0.111.0

### Minor Changes

- 41b08db: Packaged-admin final sweep: the CORE admin pages ship from
  `@voyant-travel/admin-app` as a built-in extension, and index redirects become
  contribution-driven. The operator deleted its last 18 core route files
  (12 settings files, `/account`, the dashboard host, and the 4 domain index
  redirects) plus the superseded settings/account components.

  - `@voyant-travel/admin`: `AdminUiRouteContribution` grows `redirectTo?: string`
    (a redirect contribution counts as implemented on its own — host binders
    emit a before-load redirect, which also covers SSR) and `children?:
AdminUiRouteContribution[]` (nested child contributions under a layout
    contribution; child paths are parent-relative, `"/"` is the index). New
    `findAdminRouteContribution` does the depth-first lookup;
    `requireImplementedAdminRoute` accepts redirect contributions and
    resolves nested children.
  - `@voyant-travel/admin-app`: new `createAdminCoreExtension(options)` (exported
    from the root and `./core-extension`) — the `core` extension contributing
    `/` (the dashboard page behind a lazy chunk; hosts supply an SSR
    aggregates loader via `dashboard.loader`), `/account` (auth-react's
    packaged `AccountPage`), and the `/settings` area: a packaged layout
    (grouped sub-nav + outlet, labels resolved reactively from the operator
    admin messages) with nested children — an index redirect (default
    `/settings/channels`) and the nine built-in pages (team, API tokens,
    channels, taxes, cost categories, pricing categories, price catalogs,
    product types, product tags). Surfaces eject with `false`; built-in
    settings pages drop via `settings.omit`; app-custom settings pages splice
    in via `settings.extraPages` (the operator's Operator Profile page uses
    this). The binder gains redirect support (`beforeLoad` throwing the
    router redirect) and `adminExtensionChildRoutes(...)` for binding
    runtime-known children the generated route module cannot emit
    statically. The new domain peers (auth/distribution/finance/pricing/
    products react) are optional and only loaded by the lazy page/loader
    chunks.
  - `@voyant-travel/catalog-react` / `@voyant-travel/finance-react` /
    `@voyant-travel/legal-react` / `@voyant-travel/notifications-react`: the admin
    extensions contribute their index redirect (`/catalog` →
    `/catalog/products`, `/finance` → `/finance/invoices`, `/legal` →
    `/legal/contracts`, `/notifications` → `/notifications/templates`),
    replacing the operator's redirect route files.
  - Host typed-link merge note: extension routes now REPLACE file routes on
    key conflicts in the merged route-type maps (`Omit` before the
    intersection) — the pathless workspace layout claims `/` in the generated
    file types once the index file route is deleted, while at runtime `/` is
    the core extension's dashboard route.

## 0.110.0

### Minor Changes

- 9c909e2: Package-deliver the booking-flow admin surfaces (packaged-admin final sweep)

  - **bookings-react**: `createBookingsAdminExtension` now contributes the whole booking flow — three new route contributions alongside list/detail: `bookings-new` (`/bookings/new` owned-product picker that forwards into the unified journey; route-backed `booking.create` destination), `bookings-compose` (`/bookings/compose` legacy alias forwarding to the new `trip.create` destination), and `bookings-journey` (`/catalog/journey/$entityModule/$entityId`, the unified `BookingJourney` host with CRM-backed lead/traveler pickers, departure/units/voucher pickers, duplicate-departure warning, B2B default, and commit→`booking.detail` / cancel→`catalog.browse` navigation via semantic destinations). New exports: `bookingNewSearchSchema`, `bookingJourneySearchSchema` (+ param types) and the `BookingJourneyHost` admin module (`/admin/booking-journey-host`). Declares the `trip.create` destination key.
  - **admin**: `useAdminNavigate` accepts an optional `AdminNavigateOptions` (`{ replace?: boolean }`) third argument, forwarded to the host-injected navigate so packaged redirect pages keep route-redirect history semantics.
  - **admin-app**: the workspace shell's injected destination navigate maps `replace` onto the router's history-replace mode.

## 0.109.0

### Minor Changes

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

## 0.108.0

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

## 0.107.0

### Minor Changes

- eeb23df: Packaged-admin RFC §4.8 (route assembly, increment 1) — framework half of
  `voyant admin generate --routes`:

  - `@voyant-travel/admin` exports `requireAdminRoute(extension, routeId)` (plus the
    `BindableAdminRoute` type): looks up a route contribution by id and asserts
    it carries a component, so generated thin route files fail loudly at module
    evaluation when an extension stops shipping the route they bind.
    `AdminRouteRuntime.fetcher` is narrowed to the string-URL `VoyantFetcher`
    convention every `*-react` data client uses, so host fetchers (and the
    global `fetch`) bind directly into generated loaders.
  - `@voyant-travel/core` manifest grows `admin.routes` (`AdminRoutesConfig`): the
    host route-tree directory and the runtime-import bindings (`apiUrlModule`/
    `apiUrlExport`, `fetcherModule`/`fetcherExport`) the route generator emits,
    with operator-convention defaults. Validated by `validateVoyantConfig`.

  The operator's promotions index route is now generated output of the new
  command (byte-for-byte reproducible from `@voyant-travel/promotions-ui/admin`).

## 0.106.0

### Minor Changes

- 4ade734: Semantic admin navigation destinations (packaged-admin RFC §4.7): packaged
  admin pages navigate to routes they don't own (booking journey, supplier
  detail, product editor) without importing a host route tree.

  - `@voyant-travel/admin`: new `AdminDestinations` interface (augmented by domain
    packages via `declare module "@voyant-travel/admin"`), `AdminNavigationProvider`,
    and `useAdminHref`/`useAdminNavigate`. Unresolvable keys warn once per key
    and degrade to `"#"`/no-op — never a throw in render paths.
  - `@voyant-travel/admin-app`: `AdminWorkspaceShell` accepts a `destinations`
    resolver map (`satisfies AdminDestinationResolvers` for exhaustiveness) and
    mounts the provider wired to the app router via `router.navigate({ href })`.
  - `@voyant-travel/catalog-ui`: declares the catalog destination keys
    (`bookingJourney.start`, `catalog.browse`, `catalog.detail`,
    `product.detail`, `supplier.detail`) covering every cross-route target the
    operator's catalog wrappers navigate to.

- ee5b530: Packaged-admin RFC Phase 2 pilot (#1643): packages can ship admin pages.

  - `@voyant-travel/admin`: `AdminUiRouteContribution` grows from metadata-only to
    the full route contract — optional `component`, `loader` (receives
    `{ queryClient, runtime }` with the host's baseUrl/fetcher),
    `validateSearch`, `ssr`, pending/error components, `capability`, and
    `preload`. Metadata-only contributions remain valid. New types
    `AdminRouteRuntime` and `AdminRouteLoaderContext`.
  - `@voyant-travel/promotions-ui`: first `@voyant-travel/<domain>-ui/admin` entrypoint.
    `createPromotionsAdminExtension({ label, icon, order, path })` contributes
    the nav entry AND the route implementation (PromotionsPage +
    loadPromotionsPage + SSR mode); the host supplies only label, icon, and
    runtime.

  The operator template consumes both: the local promotions extension is now a
  thin call into the package, and the promotions route file is a thin host that
  binds the package-owned page/loader to the file-based route tree (per-route
  provider removed — the shell's VoyantReactProvider already supplies the same
  context).

### Patch Changes

- Updated dependencies [3bd66e9]
- Updated dependencies [344e7b6]
  - @voyant-travel/ui@0.106.0

## 0.105.2

### Patch Changes

- 65183fe: Expose stable dashboard aggregate query keys and the default dashboard date window so server-rendered admin apps can preload dashboard data through direct service access while keeping client query hydration aligned.

## 0.105.1

### Patch Changes

- Updated dependencies [7122c2a]
  - @voyant-travel/i18n@0.106.0
  - @voyant-travel/ui@0.105.1

## 0.105.0

### Patch Changes

- Updated dependencies [d1ad572]
  - @voyant-travel/i18n@0.105.0
  - @voyant-travel/ui@0.105.0

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

- Updated dependencies [cfa6af8]
  - @voyant-travel/i18n@0.104.2
  - @voyant-travel/ui@0.104.4

## 0.104.1

### Patch Changes

- @voyant-travel/i18n@0.104.1
- @voyant-travel/react@0.104.1
- @voyant-travel/ui@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/i18n@0.104.0
- @voyant-travel/react@0.104.0
- @voyant-travel/ui@0.104.0

## 0.103.0

### Patch Changes

- Updated dependencies [a02f2f3]
  - @voyant-travel/i18n@0.103.0
  - @voyant-travel/react@0.103.0
  - @voyant-travel/ui@0.103.0

## 0.102.0

### Patch Changes

- Updated dependencies [b6d0673]
  - @voyant-travel/i18n@0.102.0
  - @voyant-travel/react@0.102.0
  - @voyant-travel/ui@0.102.0

## 0.101.2

### Patch Changes

- Updated dependencies [577eaf5]
- Updated dependencies [577eaf5]
  - @voyant-travel/i18n@0.101.2
  - @voyant-travel/react@0.101.2
  - @voyant-travel/ui@0.101.2

## 0.101.1

### Patch Changes

- Updated dependencies [f736ba5]
  - @voyant-travel/i18n@0.101.1
  - @voyant-travel/react@0.101.1
  - @voyant-travel/ui@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/i18n@0.101.0
- @voyant-travel/react@0.101.0
- @voyant-travel/ui@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/i18n@0.100.0
- @voyant-travel/react@0.100.0
- @voyant-travel/ui@0.100.0

## 0.99.0

### Patch Changes

- @voyant-travel/i18n@0.99.0
- @voyant-travel/react@0.99.0
- @voyant-travel/ui@0.99.0

## 0.98.0

### Patch Changes

- @voyant-travel/i18n@0.98.0
- @voyant-travel/react@0.98.0
- @voyant-travel/ui@0.98.0

## 0.97.0

### Patch Changes

- @voyant-travel/i18n@0.97.0
- @voyant-travel/react@0.97.0
- @voyant-travel/ui@0.97.0

## 0.96.0

### Patch Changes

- @voyant-travel/i18n@0.96.0
- @voyant-travel/react@0.96.0
- @voyant-travel/ui@0.96.0

## 0.95.0

### Patch Changes

- @voyant-travel/i18n@0.95.0
- @voyant-travel/react@0.95.0
- @voyant-travel/ui@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/i18n@0.94.0
- @voyant-travel/react@0.94.0
- @voyant-travel/ui@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/i18n@0.93.0
- @voyant-travel/react@0.93.0
- @voyant-travel/ui@0.93.0

## 0.92.0

### Patch Changes

- @voyant-travel/i18n@0.92.0
- @voyant-travel/react@0.92.0
- @voyant-travel/ui@0.92.0

## 0.91.0

### Patch Changes

- @voyant-travel/i18n@0.91.0
- @voyant-travel/react@0.91.0
- @voyant-travel/ui@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/i18n@0.90.0
- @voyant-travel/react@0.90.0
- @voyant-travel/ui@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/i18n@0.89.0
- @voyant-travel/react@0.89.0
- @voyant-travel/ui@0.89.0

## 0.88.0

### Patch Changes

- @voyant-travel/i18n@0.88.0
- @voyant-travel/react@0.88.0
- @voyant-travel/ui@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/i18n@0.87.1
- @voyant-travel/react@0.87.1
- @voyant-travel/ui@0.87.1

## 0.87.0

### Patch Changes

- @voyant-travel/i18n@0.87.0
- @voyant-travel/react@0.87.0
- @voyant-travel/ui@0.87.0

## 0.86.0

### Patch Changes

- @voyant-travel/i18n@0.86.0
- @voyant-travel/react@0.86.0
- @voyant-travel/ui@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/i18n@0.85.4
- @voyant-travel/react@0.85.4
- @voyant-travel/ui@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/i18n@0.85.3
- @voyant-travel/react@0.85.3
- @voyant-travel/ui@0.85.3

## 0.85.2

### Patch Changes

- @voyant-travel/i18n@0.85.2
- @voyant-travel/react@0.85.2
- @voyant-travel/ui@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/i18n@0.85.1
- @voyant-travel/react@0.85.1
- @voyant-travel/ui@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/i18n@0.85.0
- @voyant-travel/react@0.85.0
- @voyant-travel/ui@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/i18n@0.84.4
- @voyant-travel/react@0.84.4
- @voyant-travel/ui@0.84.4

## 0.84.3

### Patch Changes

- Updated dependencies [9eadf50]
  - @voyant-travel/i18n@0.84.3
  - @voyant-travel/react@0.84.3
  - @voyant-travel/ui@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/i18n@0.84.2
- @voyant-travel/react@0.84.2
- @voyant-travel/ui@0.84.2

## 0.84.1

### Patch Changes

- @voyant-travel/i18n@0.84.1
- @voyant-travel/react@0.84.1
- @voyant-travel/ui@0.84.1

## 0.84.0

### Patch Changes

- Updated dependencies [5462f07]
  - @voyant-travel/i18n@0.84.0
  - @voyant-travel/react@0.84.0
  - @voyant-travel/ui@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/i18n@0.83.1
- @voyant-travel/react@0.83.1
- @voyant-travel/ui@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/i18n@0.83.0
- @voyant-travel/react@0.83.0
- @voyant-travel/ui@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/i18n@0.82.1
- @voyant-travel/react@0.82.1
- @voyant-travel/ui@0.82.1

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
  - @voyant-travel/react@0.82.0
  - @voyant-travel/ui@0.82.0

## 0.81.21

### Patch Changes

- @voyant-travel/i18n@0.81.21
- @voyant-travel/react@0.81.21
- @voyant-travel/ui@0.81.21

## 0.81.20

### Patch Changes

- @voyant-travel/i18n@0.81.20
- @voyant-travel/react@0.81.20
- @voyant-travel/ui@0.81.20

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
  - @voyant-travel/i18n@0.81.19
  - @voyant-travel/react@0.81.19
  - @voyant-travel/ui@0.81.19

## 0.81.18

### Patch Changes

- Updated dependencies [93874e4]
  - @voyant-travel/i18n@0.81.18
  - @voyant-travel/react@0.81.18
  - @voyant-travel/ui@0.81.18

## 0.81.17

### Patch Changes

- Updated dependencies [e31a008]
  - @voyant-travel/i18n@0.81.17
  - @voyant-travel/react@0.81.17
  - @voyant-travel/ui@0.81.17

## 0.81.16

### Patch Changes

- Updated dependencies [0a617cc]
  - @voyant-travel/i18n@0.81.16
  - @voyant-travel/react@0.81.16
  - @voyant-travel/ui@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/i18n@0.81.15
- @voyant-travel/react@0.81.15
- @voyant-travel/ui@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/i18n@0.81.14
- @voyant-travel/react@0.81.14
- @voyant-travel/ui@0.81.14

## 0.81.13

### Patch Changes

- Updated dependencies [36421aa]
  - @voyant-travel/i18n@0.81.13
  - @voyant-travel/react@0.81.13
  - @voyant-travel/ui@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/i18n@0.81.12
- @voyant-travel/react@0.81.12
- @voyant-travel/ui@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/i18n@0.81.11
- @voyant-travel/react@0.81.11
- @voyant-travel/ui@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/i18n@0.81.10
- @voyant-travel/react@0.81.10
- @voyant-travel/ui@0.81.10

## 0.81.9

### Patch Changes

- @voyant-travel/i18n@0.81.9
- @voyant-travel/react@0.81.9
- @voyant-travel/ui@0.81.9

## 0.81.8

### Patch Changes

- @voyant-travel/i18n@0.81.8
- @voyant-travel/react@0.81.8
- @voyant-travel/ui@0.81.8

## 0.81.7

### Patch Changes

- @voyant-travel/i18n@0.81.7
- @voyant-travel/react@0.81.7
- @voyant-travel/ui@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/i18n@0.81.6
- @voyant-travel/react@0.81.6
- @voyant-travel/ui@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/i18n@0.81.5
- @voyant-travel/react@0.81.5
- @voyant-travel/ui@0.81.5

## 0.81.4

### Patch Changes

- @voyant-travel/i18n@0.81.4
- @voyant-travel/react@0.81.4
- @voyant-travel/ui@0.81.4

## 0.81.3

### Patch Changes

- Updated dependencies [f157bcd]
  - @voyant-travel/i18n@0.81.3
  - @voyant-travel/react@0.81.3
  - @voyant-travel/ui@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/i18n@0.81.2
- @voyant-travel/react@0.81.2
- @voyant-travel/ui@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/i18n@0.81.1
- @voyant-travel/react@0.81.1
- @voyant-travel/ui@0.81.1

## 0.81.0

### Patch Changes

- @voyant-travel/i18n@0.81.0
- @voyant-travel/react@0.81.0
- @voyant-travel/ui@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/i18n@0.80.18
- @voyant-travel/react@0.80.18
- @voyant-travel/ui@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/i18n@0.80.17
- @voyant-travel/react@0.80.17
- @voyant-travel/ui@0.80.17

## 0.80.16

### Patch Changes

- Updated dependencies [dbcc0da]
  - @voyant-travel/i18n@0.80.16
  - @voyant-travel/react@0.80.16
  - @voyant-travel/ui@0.80.16

## 0.80.15

### Patch Changes

- @voyant-travel/i18n@0.80.15
- @voyant-travel/react@0.80.15
- @voyant-travel/ui@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/i18n@0.80.14
- @voyant-travel/react@0.80.14
- @voyant-travel/ui@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/i18n@0.80.13
- @voyant-travel/react@0.80.13
- @voyant-travel/ui@0.80.13

## 0.80.12

### Patch Changes

- 5070731: Add finance invoice number series admin UI and localize issue-document allocation errors.
- Updated dependencies [5070731]
  - @voyant-travel/i18n@0.80.12
  - @voyant-travel/react@0.80.12
  - @voyant-travel/ui@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/i18n@0.80.11
- @voyant-travel/react@0.80.11
- @voyant-travel/ui@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/i18n@0.80.10
- @voyant-travel/react@0.80.10
- @voyant-travel/ui@0.80.10

## 0.80.9

### Patch Changes

- @voyant-travel/i18n@0.80.9
- @voyant-travel/react@0.80.9
- @voyant-travel/ui@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/i18n@0.80.8
- @voyant-travel/react@0.80.8
- @voyant-travel/ui@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/i18n@0.80.7
- @voyant-travel/react@0.80.7
- @voyant-travel/ui@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/i18n@0.80.6
- @voyant-travel/react@0.80.6
- @voyant-travel/ui@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/i18n@0.80.5
- @voyant-travel/react@0.80.5
- @voyant-travel/ui@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/i18n@0.80.4
- @voyant-travel/react@0.80.4
- @voyant-travel/ui@0.80.4

## 0.80.3

### Patch Changes

- @voyant-travel/i18n@0.80.3
- @voyant-travel/react@0.80.3
- @voyant-travel/ui@0.80.3

## 0.80.2

### Patch Changes

- @voyant-travel/i18n@0.80.2
- @voyant-travel/react@0.80.2
- @voyant-travel/ui@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/i18n@0.80.1
- @voyant-travel/react@0.80.1
- @voyant-travel/ui@0.80.1

## 0.80.0

### Patch Changes

- Updated dependencies [9473eb8]
  - @voyant-travel/i18n@0.80.0
  - @voyant-travel/react@0.80.0
  - @voyant-travel/ui@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/i18n@0.79.0
- @voyant-travel/react@0.79.0
- @voyant-travel/ui@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/i18n@0.78.0
- @voyant-travel/react@0.78.0
- @voyant-travel/ui@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/i18n@0.77.13
- @voyant-travel/react@0.77.13
- @voyant-travel/ui@0.77.13

## 0.77.12

### Patch Changes

- Updated dependencies [bf74cd4]
  - @voyant-travel/i18n@0.77.12
  - @voyant-travel/react@0.77.12
  - @voyant-travel/ui@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/i18n@0.77.11
- @voyant-travel/react@0.77.11
- @voyant-travel/ui@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/i18n@0.77.10
- @voyant-travel/react@0.77.10
- @voyant-travel/ui@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/i18n@0.77.9
- @voyant-travel/react@0.77.9
- @voyant-travel/ui@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/i18n@0.77.8
- @voyant-travel/react@0.77.8
- @voyant-travel/ui@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/i18n@0.77.7
- @voyant-travel/react@0.77.7
- @voyant-travel/ui@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/i18n@0.77.6
- @voyant-travel/react@0.77.6
- @voyant-travel/ui@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/i18n@0.77.5
- @voyant-travel/react@0.77.5
- @voyant-travel/ui@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/i18n@0.77.4
- @voyant-travel/react@0.77.4
- @voyant-travel/ui@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/i18n@0.77.3
- @voyant-travel/react@0.77.3
- @voyant-travel/ui@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/i18n@0.77.2
- @voyant-travel/react@0.77.2
- @voyant-travel/ui@0.77.2

## 0.77.1

### Patch Changes

- @voyant-travel/i18n@0.77.1
- @voyant-travel/react@0.77.1
- @voyant-travel/ui@0.77.1

## 0.77.0

### Patch Changes

- @voyant-travel/i18n@0.77.0
- @voyant-travel/react@0.77.0
- @voyant-travel/ui@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/i18n@0.76.0
- @voyant-travel/react@0.76.0
- @voyant-travel/ui@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/i18n@0.75.7
- @voyant-travel/react@0.75.7
- @voyant-travel/ui@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/i18n@0.75.6
- @voyant-travel/react@0.75.6
- @voyant-travel/ui@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/i18n@0.75.5
- @voyant-travel/react@0.75.5
- @voyant-travel/ui@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/i18n@0.75.4
- @voyant-travel/react@0.75.4
- @voyant-travel/ui@0.75.4

## 0.75.3

### Patch Changes

- Updated dependencies [38167cd]
  - @voyant-travel/i18n@0.75.3
  - @voyant-travel/react@0.75.3
  - @voyant-travel/ui@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/i18n@0.75.2
- @voyant-travel/react@0.75.2
- @voyant-travel/ui@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/i18n@0.75.1
- @voyant-travel/react@0.75.1
- @voyant-travel/ui@0.75.1

## 0.75.0

### Patch Changes

- @voyant-travel/i18n@0.75.0
- @voyant-travel/react@0.75.0
- @voyant-travel/ui@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/i18n@0.74.2
- @voyant-travel/react@0.74.2
- @voyant-travel/ui@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/i18n@0.74.1
- @voyant-travel/react@0.74.1
- @voyant-travel/ui@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/i18n@0.74.0
- @voyant-travel/react@0.74.0
- @voyant-travel/ui@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/i18n@0.73.1
- @voyant-travel/react@0.73.1
- @voyant-travel/ui@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/i18n@0.73.0
- @voyant-travel/react@0.73.0
- @voyant-travel/ui@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/i18n@0.72.0
- @voyant-travel/react@0.72.0
- @voyant-travel/ui@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/i18n@0.71.0
- @voyant-travel/react@0.71.0
- @voyant-travel/ui@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/i18n@0.70.0
- @voyant-travel/react@0.70.0
- @voyant-travel/ui@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/i18n@0.69.1
- @voyant-travel/react@0.69.1
- @voyant-travel/ui@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/i18n@0.69.0
- @voyant-travel/react@0.69.0
- @voyant-travel/ui@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/i18n@0.68.0
- @voyant-travel/react@0.68.0
- @voyant-travel/ui@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/i18n@0.67.0
- @voyant-travel/react@0.67.0
- @voyant-travel/ui@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/i18n@0.66.6
- @voyant-travel/react@0.66.6
- @voyant-travel/ui@0.66.6

## 0.66.5

### Patch Changes

- @voyant-travel/i18n@0.66.5
- @voyant-travel/react@0.66.5
- @voyant-travel/ui@0.66.5

## 0.66.4

### Patch Changes

- @voyant-travel/i18n@0.66.4
- @voyant-travel/react@0.66.4
- @voyant-travel/ui@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/i18n@0.66.3
- @voyant-travel/react@0.66.3
- @voyant-travel/ui@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/i18n@0.66.2
- @voyant-travel/react@0.66.2
- @voyant-travel/ui@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/i18n@0.66.1
- @voyant-travel/react@0.66.1
- @voyant-travel/ui@0.66.1

## 0.66.0

### Patch Changes

- Updated dependencies [a74089c]
  - @voyant-travel/i18n@0.66.0
  - @voyant-travel/react@0.66.0
  - @voyant-travel/ui@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/i18n@0.65.0
- @voyant-travel/react@0.65.0
- @voyant-travel/ui@0.65.0

## 0.64.1

### Patch Changes

- @voyant-travel/i18n@0.64.1
- @voyant-travel/react@0.64.1
- @voyant-travel/ui@0.64.1

## 0.64.0

### Patch Changes

- @voyant-travel/i18n@0.64.0
- @voyant-travel/react@0.64.0
- @voyant-travel/ui@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/i18n@0.63.1
- @voyant-travel/react@0.63.1
- @voyant-travel/ui@0.63.1

## 0.63.0

### Patch Changes

- @voyant-travel/i18n@0.63.0
- @voyant-travel/react@0.63.0
- @voyant-travel/ui@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/i18n@0.62.3
- @voyant-travel/react@0.62.3
- @voyant-travel/ui@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/i18n@0.62.2
- @voyant-travel/react@0.62.2
- @voyant-travel/ui@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/i18n@0.62.1
- @voyant-travel/react@0.62.1
- @voyant-travel/ui@0.62.1

## 0.62.0

### Patch Changes

- @voyant-travel/i18n@0.62.0
- @voyant-travel/react@0.62.0
- @voyant-travel/ui@0.62.0

## 0.61.0

### Patch Changes

- Updated dependencies [89f033e]
  - @voyant-travel/i18n@0.61.0
  - @voyant-travel/react@0.61.0
  - @voyant-travel/ui@0.61.0

## 0.60.0

### Patch Changes

- @voyant-travel/i18n@0.60.0
- @voyant-travel/react@0.60.0
- @voyant-travel/ui@0.60.0

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

- Updated dependencies [48927be]
  - @voyant-travel/i18n@0.59.0
  - @voyant-travel/react@0.59.0
  - @voyant-travel/ui@0.59.0

## 0.58.0

### Patch Changes

- @voyant-travel/i18n@0.58.0
- @voyant-travel/react@0.58.0
- @voyant-travel/ui@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/i18n@0.57.0
- @voyant-travel/react@0.57.0
- @voyant-travel/ui@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/i18n@0.56.0
- @voyant-travel/react@0.56.0
- @voyant-travel/ui@0.56.0

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
  - @voyant-travel/react@0.55.1
  - @voyant-travel/ui@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/i18n@0.55.0
- @voyant-travel/react@0.55.0
- @voyant-travel/ui@0.55.0

## 0.54.0

### Patch Changes

- @voyant-travel/i18n@0.54.0
- @voyant-travel/react@0.54.0
- @voyant-travel/ui@0.54.0

## 0.53.2

### Patch Changes

- @voyant-travel/i18n@0.53.2
- @voyant-travel/react@0.53.2
- @voyant-travel/ui@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/i18n@0.53.1
- @voyant-travel/react@0.53.1
- @voyant-travel/ui@0.53.1

## 0.53.0

### Patch Changes

- @voyant-travel/i18n@0.53.0
- @voyant-travel/react@0.53.0
- @voyant-travel/ui@0.53.0

## 0.52.4

### Patch Changes

- Updated dependencies [5d3c119]
  - @voyant-travel/i18n@0.52.4
  - @voyant-travel/react@0.52.4
  - @voyant-travel/ui@0.52.4

## 0.52.3

### Patch Changes

- @voyant-travel/i18n@0.52.3
- @voyant-travel/react@0.52.3
- @voyant-travel/ui@0.52.3

## 0.52.2

### Patch Changes

- 3e09123: Admin shell + dashboard refresh.

  - New `AdminBreadcrumbs` primitive (exported from the package root) with a context-based registry so nested layouts can contribute crumbs without prop-drilling.
  - `DashboardPage` revenue/booking charts: keep raw status keys so `ChartContainer`'s config resolves the right localized labels for both legend and tooltip, and let the chart card span the full grid width with the empty-state branch rendered consistently with the other KPI cards.
  - `OperatorAdminSidebar` cleanup: navigation items and statuses (`COMING_SOON` / `BETA`) now flow through the shared `operator-navigation` config so the sidebar, command menu, and breadcrumbs stay in sync.
  - `dashboard-query-options` exposes the bookings/finance KPI keys consumed by the new dashboard layout.

- Updated dependencies [3e09123]
- Updated dependencies [6bdfcbc]
- Updated dependencies [3e09123]
  - @voyant-travel/i18n@0.52.2
  - @voyant-travel/react@0.52.2
  - @voyant-travel/ui@0.52.2

## 0.52.1

### Patch Changes

- @voyant-travel/i18n@0.52.1
- @voyant-travel/react@0.52.1
- @voyant-travel/ui@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/i18n@0.52.0
- @voyant-travel/react@0.52.0
- @voyant-travel/ui@0.52.0

## 0.51.1

### Patch Changes

- Updated dependencies [deaacb3]
  - @voyant-travel/i18n@0.51.1
  - @voyant-travel/react@0.51.1
  - @voyant-travel/ui@0.51.1

## 0.51.0

### Patch Changes

- Updated dependencies [2316791]
  - @voyant-travel/i18n@0.51.0
  - @voyant-travel/react@0.51.0
  - @voyant-travel/ui@0.51.0

## 0.50.8

### Patch Changes

- @voyant-travel/i18n@0.50.8
- @voyant-travel/react@0.50.8
- @voyant-travel/ui@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/i18n@0.50.7
- @voyant-travel/react@0.50.7
- @voyant-travel/ui@0.50.7

## 0.50.6

### Patch Changes

- Updated dependencies [c14f0a8]
  - @voyant-travel/i18n@0.50.6
  - @voyant-travel/react@0.50.6
  - @voyant-travel/ui@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/i18n@0.50.5
- @voyant-travel/react@0.50.5
- @voyant-travel/ui@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/i18n@0.50.4
- @voyant-travel/react@0.50.4
- @voyant-travel/ui@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/i18n@0.50.3
- @voyant-travel/react@0.50.3
- @voyant-travel/ui@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/i18n@0.50.2
- @voyant-travel/react@0.50.2
- @voyant-travel/ui@0.50.2

## 0.50.1

### Patch Changes

- @voyant-travel/i18n@0.50.1
- @voyant-travel/react@0.50.1
- @voyant-travel/ui@0.50.1

## 0.50.0

### Patch Changes

- @voyant-travel/i18n@0.50.0
- @voyant-travel/react@0.50.0
- @voyant-travel/ui@0.50.0

## 0.49.0

### Patch Changes

- @voyant-travel/i18n@0.49.0
- @voyant-travel/react@0.49.0
- @voyant-travel/ui@0.49.0

## 0.48.0

### Patch Changes

- @voyant-travel/i18n@0.48.0
- @voyant-travel/react@0.48.0
- @voyant-travel/ui@0.48.0

## 0.47.0

### Patch Changes

- @voyant-travel/i18n@0.47.0
- @voyant-travel/react@0.47.0
- @voyant-travel/ui@0.47.0

## 0.46.0

### Patch Changes

- @voyant-travel/i18n@0.46.0
- @voyant-travel/react@0.46.0
- @voyant-travel/ui@0.46.0

## 0.45.0

### Patch Changes

- @voyant-travel/i18n@0.45.0
- @voyant-travel/react@0.45.0
- @voyant-travel/ui@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/i18n@0.44.0
- @voyant-travel/react@0.44.0
- @voyant-travel/ui@0.44.0

## 0.43.0

### Patch Changes

- @voyant-travel/i18n@0.43.0
- @voyant-travel/react@0.43.0
- @voyant-travel/ui@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/i18n@0.42.0
- @voyant-travel/react@0.42.0
- @voyant-travel/ui@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/i18n@0.41.3
- @voyant-travel/react@0.41.3
- @voyant-travel/ui@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/i18n@0.41.2
- @voyant-travel/react@0.41.2
- @voyant-travel/ui@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/i18n@0.41.1
- @voyant-travel/react@0.41.1
- @voyant-travel/ui@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/i18n@0.41.0
- @voyant-travel/react@0.41.0
- @voyant-travel/ui@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/i18n@0.40.1
- @voyant-travel/react@0.40.1
- @voyant-travel/ui@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/i18n@0.40.0
- @voyant-travel/react@0.40.0
- @voyant-travel/ui@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [f4235ea]
  - @voyant-travel/i18n@0.39.0
  - @voyant-travel/react@0.39.0
  - @voyant-travel/ui@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/i18n@0.38.2
- @voyant-travel/react@0.38.2
- @voyant-travel/ui@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/i18n@0.38.1
- @voyant-travel/react@0.38.1
- @voyant-travel/ui@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/i18n@0.38.0
- @voyant-travel/react@0.38.0
- @voyant-travel/ui@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/i18n@0.37.1
- @voyant-travel/react@0.37.1
- @voyant-travel/ui@0.37.1

## 0.37.0

### Patch Changes

- 712a441: Add an operator admin page shell with breadcrumb, action, sidebar trigger, and padded content slots.
- Updated dependencies [dc29b79]
- Updated dependencies [f014fd2]
- Updated dependencies [0c9b884]
  - @voyant-travel/i18n@0.37.0
  - @voyant-travel/react@0.37.0
  - @voyant-travel/ui@0.37.0

## 0.36.0

### Patch Changes

- @voyant-travel/i18n@0.36.0
- @voyant-travel/react@0.36.0
- @voyant-travel/ui@0.36.0

## 0.35.0

### Patch Changes

- Updated dependencies [baa6134]
  - @voyant-travel/i18n@0.35.0
  - @voyant-travel/react@0.35.0
  - @voyant-travel/ui@0.35.0

## 0.34.0

### Minor Changes

- 74f0331: Add locale-aware admin page metadata helpers and derive workspace titles from navigation.
- 6ad175a: Add dashboard empty states, KPI empty hints, and localized first-run onboarding copy.

### Patch Changes

- Updated dependencies [6ad175a]
- Updated dependencies [70ee277]
- Updated dependencies [f2d4802]
  - @voyant-travel/i18n@0.34.0
  - @voyant-travel/react@0.34.0
  - @voyant-travel/ui@0.34.0

## 0.33.1

### Patch Changes

- @voyant-travel/i18n@0.33.1
- @voyant-travel/react@0.33.1
- @voyant-travel/ui@0.33.1

## 0.33.0

### Patch Changes

- Updated dependencies [db46afc]
  - @voyant-travel/i18n@0.33.0
  - @voyant-travel/react@0.33.0
  - @voyant-travel/ui@0.33.0

## 0.32.3

### Patch Changes

- Updated dependencies [7632a66]
  - @voyant-travel/i18n@0.32.3
  - @voyant-travel/react@0.32.3
  - @voyant-travel/ui@0.32.3

## 0.32.2

### Patch Changes

- 778d35e: Align OperatorAdminWorkspaceLayout with the shadcn sidebar composition by using SidebarInset, exposing sidebar variant controls, adding a visible sidebar trigger, and shaping the default brand as a SidebarMenuButton.
- c1de5a1: Ship reusable Voyant mark and wordmark SVG components and use them in the default operator admin sidebar brand.
  - @voyant-travel/i18n@0.32.2
  - @voyant-travel/react@0.32.2
  - @voyant-travel/ui@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/i18n@0.32.1
- @voyant-travel/react@0.32.1
- @voyant-travel/ui@0.32.1

## 0.32.0

### Patch Changes

- @voyant-travel/i18n@0.32.0
- @voyant-travel/react@0.32.0
- @voyant-travel/ui@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/i18n@0.31.4
- @voyant-travel/react@0.31.4
- @voyant-travel/ui@0.31.4

## 0.31.3

### Patch Changes

- @voyant-travel/i18n@0.31.3
- @voyant-travel/react@0.31.3
- @voyant-travel/ui@0.31.3

## 0.31.2

### Patch Changes

- Updated dependencies [54ddc93]
  - @voyant-travel/i18n@0.31.2
  - @voyant-travel/react@0.31.2
  - @voyant-travel/ui@0.31.2

## 0.31.1

### Patch Changes

- Updated dependencies [00f7c4f]
  - @voyant-travel/i18n@0.31.1
  - @voyant-travel/react@0.31.1
  - @voyant-travel/ui@0.31.1

## 0.31.0

### Minor Changes

- ee75afb: Publish the operator dashboard page composition, dashboard skeletons, and aggregate query helpers from `@voyant-travel/admin`.
- ee75afb: Publish reusable TaxesPage and TeamSettingsPage settings compositions from their owning UI packages.

### Patch Changes

- @voyant-travel/i18n@0.31.0
- @voyant-travel/react@0.31.0
- @voyant-travel/ui@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/i18n@0.30.7
- @voyant-travel/react@0.30.7
- @voyant-travel/ui@0.30.7

## 0.30.6

### Patch Changes

- @voyant-travel/i18n@0.30.6
- @voyant-travel/react@0.30.6
- @voyant-travel/ui@0.30.6

## 0.30.5

### Patch Changes

- @voyant-travel/i18n@0.30.5
- @voyant-travel/react@0.30.5
- @voyant-travel/ui@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/i18n@0.30.4
- @voyant-travel/react@0.30.4
- @voyant-travel/ui@0.30.4

## 0.30.3

### Patch Changes

- @voyant-travel/i18n@0.30.3
- @voyant-travel/react@0.30.3
- @voyant-travel/ui@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/i18n@0.30.2
- @voyant-travel/react@0.30.2
- @voyant-travel/ui@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/i18n@0.30.1
- @voyant-travel/react@0.30.1
- @voyant-travel/ui@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/i18n@0.30.0
- @voyant-travel/react@0.30.0
- @voyant-travel/ui@0.30.0

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

- Updated dependencies [4a6523e]
- Updated dependencies [4a6523e]
- Updated dependencies [4a6523e]
- Updated dependencies [4a6523e]
  - @voyant-travel/i18n@0.29.0
  - @voyant-travel/react@0.29.0
  - @voyant-travel/ui@0.29.0

## 0.28.3

### Patch Changes

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

- Updated dependencies [60ef432]
- Updated dependencies [60ef432]
- Updated dependencies [60ef432]
- Updated dependencies [60ef432]
  - @voyant-travel/i18n@0.28.3
  - @voyant-travel/react@0.28.3
  - @voyant-travel/ui@0.28.3

## 0.28.2

### Patch Changes

- @voyant-travel/i18n@0.28.2
- @voyant-travel/react@0.28.2
- @voyant-travel/ui@0.28.2

## 0.28.1

### Patch Changes

- Updated dependencies [9d88eae]
  - @voyant-travel/i18n@0.28.1
  - @voyant-travel/react@0.28.1
  - @voyant-travel/ui@0.28.1

## 0.28.0

### Patch Changes

- @voyant-travel/i18n@0.28.0
- @voyant-travel/react@0.28.0
- @voyant-travel/ui@0.28.0

## 0.27.0

### Patch Changes

- Updated dependencies [dc46e37]
  - @voyant-travel/i18n@0.27.0
  - @voyant-travel/react@0.27.0
  - @voyant-travel/ui@0.27.0

## 0.26.9

### Patch Changes

- Updated dependencies [24a121e]
  - @voyant-travel/i18n@0.26.9
  - @voyant-travel/react@0.26.9
  - @voyant-travel/ui@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/i18n@0.26.8
- @voyant-travel/react@0.26.8
- @voyant-travel/ui@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/i18n@0.26.7
- @voyant-travel/react@0.26.7
- @voyant-travel/ui@0.26.7

## 0.26.6

### Patch Changes

- @voyant-travel/i18n@0.26.6
- @voyant-travel/react@0.26.6
- @voyant-travel/ui@0.26.6

## 0.26.5

### Patch Changes

- @voyant-travel/i18n@0.26.5
- @voyant-travel/react@0.26.5
- @voyant-travel/ui@0.26.5

## 0.26.4

### Patch Changes

- @voyant-travel/i18n@0.26.4
- @voyant-travel/react@0.26.4
- @voyant-travel/ui@0.26.4

## 0.26.3

### Patch Changes

- @voyant-travel/i18n@0.26.3
- @voyant-travel/react@0.26.3
- @voyant-travel/ui@0.26.3

## 0.26.2

### Patch Changes

- @voyant-travel/i18n@0.26.2
- @voyant-travel/react@0.26.2
- @voyant-travel/ui@0.26.2

## 0.26.1

### Patch Changes

- @voyant-travel/i18n@0.26.1
- @voyant-travel/react@0.26.1
- @voyant-travel/ui@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/i18n@0.26.0
- @voyant-travel/react@0.26.0
- @voyant-travel/ui@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/i18n@0.25.0
- @voyant-travel/react@0.25.0
- @voyant-travel/ui@0.25.0

## 0.24.3

### Patch Changes

- c112761: Add a single-tenant-first operator admin bootstrap gate and update first-party
  templates to render authenticated shells from current-user readiness instead of
  workspace or organization bootstrap state.
  - @voyant-travel/i18n@0.24.3
  - @voyant-travel/react@0.24.3
  - @voyant-travel/ui@0.24.3

## 0.24.2

### Patch Changes

- @voyant-travel/i18n@0.24.2
- @voyant-travel/react@0.24.2
- @voyant-travel/ui@0.24.2

## 0.24.1

### Patch Changes

- ed635c7: Expose consistent Tailwind v4 style helper imports across admin and UI packages,
  and document single-tenant auth shell bootstrap without mandatory workspace
  organization routes.
- Updated dependencies [ed635c7]
  - @voyant-travel/i18n@0.24.1
  - @voyant-travel/react@0.24.1
  - @voyant-travel/ui@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/i18n@0.24.0
- @voyant-travel/react@0.24.0
- @voyant-travel/ui@0.24.0

## 0.23.0

### Patch Changes

- @voyant-travel/i18n@0.23.0
- @voyant-travel/react@0.23.0
- @voyant-travel/ui@0.23.0

## 0.22.0

### Minor Changes

- 930ec96: Package reusable operator admin shell composition and availability UI surfaces.

  `@voyant-travel/admin` now exports reusable operator shell providers, navigation helpers, sidebar/workspace layout components, widget slot rendering, locale preference sync, and operator message provider utilities.

  `@voyant-travel/availability-ui` now provides reusable availability overview, tab panels, dialogs with app-owned mutation adapters, table column builders, status helpers, loading skeletons, section headers, and selection-label formatting for operator apps.

### Patch Changes

- @voyant-travel/i18n@0.22.0
- @voyant-travel/react@0.22.0
- @voyant-travel/ui@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/i18n@0.21.1

## 0.21.0

### Patch Changes

- Updated dependencies [6427bad]
  - @voyant-travel/i18n@0.21.0

## 0.20.0

### Patch Changes

- @voyant-travel/i18n@0.20.0

## 0.19.0

### Patch Changes

- @voyant-travel/i18n@0.19.0

## 0.18.0

### Patch Changes

- @voyant-travel/i18n@0.18.0

## 0.17.0

### Minor Changes

- 66d722d: Published `@voyant-travel/admin` (renamed from the previously-private `@voyant-travel/voyant-admin`). The redundant scope/prefix was inconsistent with the rest of the workspace (`@voyant-travel/auth`, `@voyant-travel/crm`, …). Templates that referenced `@voyant-travel/voyant-admin` as `workspace:*` now use `@voyant-travel/admin` and resolve to the published package on scaffold.

  Includes the full publish setup: `tsconfig.build.json`, `build` / `prepack` scripts, `files: ["dist"]`, `publishConfig.exports` for all 9 subpaths (`.`, `./extensions`, `./providers/{theme,locale,query-client,admin-provider}`, `./lib/{i18n,initials}`, `./types`).

### Patch Changes

- Updated dependencies [66d722d]
  - @voyant-travel/i18n@0.17.0
