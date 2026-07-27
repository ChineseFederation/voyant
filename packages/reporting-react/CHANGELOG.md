# @voyant-travel/reporting-react

## 0.6.0

### Patch Changes

- Updated dependencies [1873611]
  - @voyant-travel/admin@0.130.0

## 0.5.1

### Patch Changes

- e2cb9f5: Fix double page padding. The admin shell already applies consistent page
  padding around the content area, but a number of page and loading-skeleton
  components still added their own `p-6` on top, pushing their content ~24px
  further in than the page header and leaving pages inconsistently indented.
  Those redundant root paddings are removed so every page's content lines up with
  the header and with each other. Dialog, portal, and card paddings are
  unchanged.
- e2cb9f5: Align off-scale spacing utilities to the shared scale: gap-5 to gap-4, p-5 to
  p-6, space-y-5 to space-y-4, space-y-8 to space-y-6, p-10/p-12 to p-8, gap-8 to
  gap-6. Keeps spacing on the consistent 1/2/3/4/6/8 scale used across the app.
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
  - @voyant-travel/admin@0.129.1
  - @voyant-travel/ui@0.109.5

## 0.5.0

### Patch Changes

- Updated dependencies [90d44c0]
  - @voyant-travel/admin@0.129.0

## 0.4.0

### Minor Changes

- 464815c: Report export, base-currency reporting, and a redesigned builder.

  - Add report export in CSV, XLSX, and visual PDF (charts stay charts; only table
    widgets render as tables) via a new `GET /reports/:id/export` route and a
    client-side visual PDF composer.
  - Remove report versioning (versions/runs routes, tables, and retention): the
    editable draft is the single source of truth. Reporting datasets now expose a
    `defaultDateField` so the page date window applies without a per-report knob.
  - Add a `reportCurrency=base` execution mode: Finance receivables consolidate
    every amount into the operator base currency using the recording-time FX
    snapshot (`base_*_cents`), so a report can show one cross-currency total. The
    query language gains `between` and `in (...)` operators and a typed
    `ReportDatasetQueryError`.
  - Redesign the reporting-react builder to match the admin aesthetic: page date
    window, base-currency toggle, export menu, widget-preview and configuration
    Sheets, a CodeMirror query editor for custom widgets, and a silent autosave
    with an unsaved-changes guard.
  - Fix the Bookings/Finance reporting time-grain grouping (literal `date_trunc`
    grain) that previously errored under `group by`.

### Patch Changes

- Updated dependencies [464815c]
  - @voyant-travel/reporting-contracts@0.3.0

## 0.3.0

### Patch Changes

- Updated dependencies [2bcafc9]
  - @voyant-travel/admin@0.128.0

## 0.2.0

### Minor Changes

- b8b25b7: Connect the generic reporting-react grid to `@voyant-travel/reporting-contracts` and the operator admin app as a cohesive `/reporting` vertical slice: an instance-aware `ReportDraft` model (widget instance id distinct from preset/definition id, full-draft persistence), a revision-guarded autosave document controller with optimistic-conflict resolution, the `/reporting` admin extension (list, create, instantiate-template, open; view/edit toggle; preset + custom-widget catalog; grid editing), a bounded custom-widget query editor over `/queries/parse` and `/queries/preview`, and generic KPI/table/line/bar/pie renderers. The `@voyant-travel/reporting` manifest now declares an admin runtime pointing at `@voyant-travel/reporting-react/admin`, and Reporting is selected in operator-standard.
- b8b25b7: Add the React reporting builder vertical slice (`@voyant-travel/reporting-react`)
  with explicit view and edit modes. View renders only available widgets with no
  authoring handles; edit adds a widget catalog, a 12-column constrained grid, and
  a configuration inspector with drag-by-header, resize, and add/remove.
  Unavailable widgets appear only in edit mode as removable placeholders. Layout
  is stored library-neutrally and driven through a Voyant-owned wrapper over
  `react-grid-layout`, with a deterministic single-column narrow projection, a
  keyboard-accessible move/resize fallback, reduced-motion support, and an
  optimistic local draft with debounced autosave through a typed persistence
  adapter.

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/reporting-contracts@0.2.0
