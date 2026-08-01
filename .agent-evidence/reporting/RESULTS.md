# Reporting Admin UI — Browser Verification Results

Task: browser-verify the completed composable reporting admin UI
(`packages/reporting-react`) on the current feature snapshot. No redesign or
scope broadening. No product change was made — no defect was found.

Date: 2026-07-18
Branch: `feature/reporting-module`

## How it was run

The real operator route (`/reporting` inside `apps/operator`) could not be
driven end-to-end in this environment: the operator boots the full Voyant
runtime (Postgres, Better Auth admin sign-in, KMS, the `voyant build`
artifact/route-generation pipeline, and Cloud-owned config). Standing that up
required real secrets and a seeded auth session, which this task explicitly
forbids inventing. So, per the task's sanctioned fallback, the **real
reporting-react components were mounted directly** in the smallest possible
untracked harness (Vite dev server), wired to a **contract-faithful in-memory
backend**:

- Components under test are imported from source, unmodified:
  `ReportsIndexPage`, `ReportDetailPage` → `ReportBuilderAdmin` →
  `ReportCanvas` / `VoyantGrid` (react-grid-layout) / `WidgetFrame` /
  `CustomWidgetEditor` / `ReportWidgetView`, plus the real
  `useReportDocument` / grid-model / report-document state layer.
- The backend validates every PATCH body with the **real
  `reporting-contracts` zod schemas** (`updateReportDefinitionSchema`,
  `reportDraftSchema`) and compiles custom queries with the **real bounded
  parser** (`parseReportQuery`). Only storage and query execution are faked.
- State lives in the dev-server process, so a browser refresh re-fetches
  persisted state — real refresh persistence.

Harness location (untracked, NOT committed):
`apps/operator/.agent-harness/`. To reproduce:
`cd apps/operator && node_modules/.bin/vite --config .agent-harness/vite.config.mts`

URL exercised: `http://localhost:41739/#/reporting` (list) and
`http://localhost:41739/#/reporting/rpt-overview` (detail).

## Interactions exercised and results

| # | Interaction | Result |
|---|---|---|
| 1 | `/reporting` list renders (reports + templates) | PASS — "Sales overview" report + "Starter dashboard" template listed from real `getReportsQueryOptions`/`getCatalogQueryOptions`. |
| 2 | Open report detail, View mode | PASS — only the available widget renders. |
| 3 | Missing widget omitted in View mode | PASS — seeded preset `legacy-removed-widget` (absent from catalog) is not rendered in view mode. |
| 4 | Toggle to Edit mode | PASS — widget catalog, 3-column builder, drag/resize handles, Configure panel appear. |
| 5 | Missing widget removable in Edit mode | PASS — it appears as a "Widget unavailable" placeholder with a Remove control, and removing it persisted. |
| 6 | Add a preset | PASS — "Bookings by status" added, auto-selected, rendered a live bar chart from `/queries/preview`. |
| 7 | Add / open the bounded custom query editor | PASS — opened editor, entered `from bookings where status = 'confirmed' select sum(amount) as revenue`, Parse (real parser → "Parsed query against dataset bookings"), Preview, Add widget → custom "Confirmed revenue" widget added and rendered. |
| 8 | Move / reorder widget on the 12-column grid | PASS — keyboard move (ArrowDown) on the drag handle moved "Total bookings"; persisted `y: 0 → 2` (then compacted). |
| 9 | Resize widget on the 12-column grid | PASS — Shift+ArrowRight / Shift+ArrowDown resized it; persisted `width 3 → 4`, `height 2 → 3`. |
| 10 | Remove a widget | PASS — removed "Bookings by status" preset via its Remove control; persisted. |
| 11 | Refresh persistence | PASS — page reload re-fetched the persisted draft: only "Total bookings" (w4×h3) and the custom "Confirmed revenue" survived; removed/missing widgets stayed gone. Autosave used revision-guarded PATCHes (revision advanced 1 → 10). |

## Console & network

- Console: clean. Only Vite HMR debug lines and the React DevTools info notice.
  No React errors/warnings from the components.
  - One benign non-component note on the list page: browser a11y hint "A form
    field element should have an id or name attribute" for the New-report
    input (it has an `aria-label`, so it has an accessible name). Not a defect.
- Network: all reporting API calls returned 200 (GET catalog, GET reports,
  GET report, POST queries/parse, POST queries/preview, PATCH report).
  The only non-200 was `GET /favicon.ico → 404` (harness has no favicon;
  unrelated to the product).

## Corroboration

- `pnpm --filter @voyant-travel/reporting-react test` → 8 files, 52 tests passed.

## What remains blocked (not verified here)

These are the only aspects the harness does not cover; all are infrastructure,
not reporting-react component behaviour:

- The real operator HTTP transport: cookie/session auth on the admin API, the
  server-side reporting routes/persistence in `packages/reporting`, and the
  TanStack admin route loaders/navigation shell. The harness reproduces the
  request/response contract these implement but not their server code.
- Real dataset query execution (`/queries/preview` returns synthetic,
  schema-valid rows here).

## Screenshots

- `01-list.png` — `/reporting` list rendered by the real components with seeded harness data.
- `02-edit-initial.png` — Edit mode; missing-widget placeholder removable.
- `03-edit-added-widgets.png` — after adding preset + custom widget.
- `04-after-move-resize.png` — after keyboard move + resize.
- `final.png` — post-refresh state re-opened in Edit mode (persistence proven).
