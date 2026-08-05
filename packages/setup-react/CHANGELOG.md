# @voyant-travel/setup-react

## 0.17.0

### Patch Changes

- Updated dependencies [1be6b76]
  - @voyant-travel/react@0.105.0

## 0.16.0

### Patch Changes

- Updated dependencies [bf71bca]
  - @voyant-travel/admin@0.134.0

## 0.15.0

### Patch Changes

- Updated dependencies [5fa76aa]
  - @voyant-travel/admin@0.133.0

## 0.14.0

### Patch Changes

- @voyant-travel/admin@0.132.0

## 0.13.0

### Patch Changes

- Updated dependencies [bf20d76]
  - @voyant-travel/ui@0.110.0
  - @voyant-travel/admin@0.131.0

## 0.12.0

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
  - @voyant-travel/admin@0.130.0

## 0.11.0

### Minor Changes

- 63baa7c: Fold organization setup into a dismissible dashboard widget and remove the dedicated Setup page/nav.

  Caller migration for `@voyant-travel/setup-react`: the public `SetupPage` export and `/setup` route are removed. Use the `SetupDashboardWidget` contribution on `dashboard.header` (via `createSelectedSetupAdminExtension`) instead of mounting a Setup page or linking to `/setup`.

### Patch Changes

- Updated dependencies [63baa7c]
  - @voyant-travel/setup@0.7.0
  - @voyant-travel/admin@0.129.2

## 0.10.0

### Patch Changes

- Updated dependencies [58baffe]
  - @voyant-travel/setup@0.6.0

## 0.9.1

### Patch Changes

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
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
  - @voyant-travel/admin@0.129.1
  - @voyant-travel/ui@0.109.5

## 0.9.0

### Patch Changes

- Updated dependencies [58020ec]
  - @voyant-travel/setup@0.5.0

## 0.8.0

### Patch Changes

- Updated dependencies [90d44c0]
  - @voyant-travel/admin@0.129.0

## 0.7.0

### Patch Changes

- Updated dependencies [2bcafc9]
  - @voyant-travel/admin@0.128.0

## 0.6.0

### Patch Changes

- Updated dependencies [a461920]
- Updated dependencies [a461920]
  - @voyant-travel/admin@0.127.0

## 0.5.0

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/setup@0.4.0

## 0.4.0

### Patch Changes

- Updated dependencies [c1e37f2]
  - @voyant-travel/admin@0.126.0

## 0.3.0

### Patch Changes

- Updated dependencies [c9b6144]
  - @voyant-travel/setup@0.3.0

## 0.2.0

### Minor Changes

- 82ffd12: Add persisted organization-level first-run setup guidance composed from the
  selected admin graph. Standard Operator deployments now collect package-owned
  business profile, storefront, market, fiscal, navigation, team, and first-product
  steps while keeping domain mutations in their existing package surfaces.

### Patch Changes

- Updated dependencies [766d24b]
- Updated dependencies [7e9f77a]
- Updated dependencies [82ffd12]
- Updated dependencies [6147b93]
- Updated dependencies [b459761]
  - @voyant-travel/ui@0.109.2
  - @voyant-travel/admin@0.125.0
  - @voyant-travel/setup@0.2.0
