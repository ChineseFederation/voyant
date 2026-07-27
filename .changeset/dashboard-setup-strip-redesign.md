---
"@voyant-travel/admin": minor
"@voyant-travel/setup-react": minor
"@voyant-travel/i18n": minor
---

Redesign the admin dashboard and integrate the setup checklist as a strip

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
