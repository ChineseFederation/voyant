# @voyant-travel/reporting-react

## 0.16.0

### Patch Changes

- Updated dependencies [2ddcb4b]
  - @voyant-travel/ui@0.112.0
  - @voyant-travel/admin@0.138.0

## 0.15.0

### Minor Changes

- b78b724: Ship the periodic return on contracts in progress and unperformed services as a
  template operators add to their own reports.

  Romanian tour operators file a periodic return on contracts in progress: how
  many, what they are worth in lei, and how much has been collected against them.
  The platform held every structural input and had no report, so assembling one
  month took a full day of reading figures off PDFs.

  It arrives as **one dataset, five widgets and one template** on the existing
  reports surface — not a new page. Custom widgets, saved reports, template
  instantiation and csv/xlsx/pdf export already shipped; what was missing was data
  those widgets could ask for. The only dataset in the repo was invoice-grain, and
  the query language has no joins, so no amount of query authoring could reach
  booking value, service dates and collections at once.

  **`finance.unperformed-services`** is a booking-grain modelled view: contracts
  concluded by period end whose services run on or after period start, with
  collections pre-aggregated and refunds netted. It exposes both readings of an
  "advance" — money against a balance still owed, and all collections on a running
  contract — labelled and side by side, because they differ materially and an
  operator filing a return should choose knowingly. The line list carries one row
  per contract with the rate applied, since an inspector asks about a single
  contract rather than a sum.

  Values come from the rate each contract's own documents were stamped with. A
  contract nothing has stamped reports `null` and the result carries a warning,
  rather than being converted at a rate looked up now — read-time conversion is
  what the FX capture work exists to prevent, and a total that silently omits rows
  reads as complete when it is short.

  Three changes to the reporting feature itself, without which a parameterised
  template is not usable:

  - **Template parameters are descriptors, not names.** `parameters` was
    `string[]`, so nothing could render a period picker: no type, label, default,
    or required flag. It is now `{ id, label, description?, valueType, required,
defaultValue? }`, carried through to the deployment graph — whose validator
    accepts and checks the descriptor shape — and instantiating a template seeds
    its declared defaults so the report opens showing something.
  - **Export accepts parameters from the caller.** The export route passed an
    empty bag, so exporting a different period meant editing and saving the report
    first — leaving it permanently describing whichever period was exported last.
  - **The report builder renders a template's declared parameters.** It knew only
    the reserved `dateFrom`/`dateTo`, so a period-scoped template landed as a
    report whose every widget errored on a missing parameter with nowhere to say
    which period. Declared parameters now render as labelled, typed inputs, and
    the export carries them.
  - **A dataset may own its period.** The page-level date window is one field with
    both bounds; this period is two fields with opposite open bounds. Datasets that
    do not fit it declare no `defaultDateField` and read their own parameters,
    failing when absent rather than silently covering all time. Written up in
    `docs/architecture/reporting-datasets.md`.

  Finance's report query compiler is now shared between both datasets rather than
  copied, so grouping, aliasing and filter rules cannot drift apart one fix at a
  time. What a dataset owns is its relation, its fields and its own answerability
  rule.

  Two known gaps this works around rather than fixes, both filed separately:
  contracts are not first-class (so the count is booking-derived, and every label
  says booking), and "performed" is not modelled (so it is derived from service
  dates, in the dataset, once).

### Patch Changes

- Updated dependencies [b78b724]
  - @voyant-travel/reporting-contracts@0.5.0

## 0.14.0

### Minor Changes

- 8c38592: Stop three admin screens from reporting something that is not true.

  A custom report widget summing a money column rendered `$351,533.00` on a row whose own grouping column said `EUR`. Two separate inventions: the renderer defaulted an absent currency to `USD`, and it attached a symbol and two decimals to an integer it had not scaled — the real balance was €3,515.33. Every money field these datasets expose is a `*Cents` measure with no major-unit alternative to select, so an unscaled currency format was wrong on all of them, and the symbol is what made it believable.

  A report column now carries the two presentation facts only the dataset that produced it can know — `minorUnit`, and the output column holding the row's ISO currency code — and Finance declares both. Where they are absent the amount is written as a plain number rather than borrowing a symbol from a default. This applies to the widget renderer and to PDF export, which had the same `|| "USD"` fallback.

  The same widget's header showed `Outstanding balance` for a column the query named `as owed`. Finance and Bookings now honour a selection's alias as its header. An alias that merely restates the field id is the query language's mandatory output name rather than a name the author chose, so those keep the dataset's own label and the preset widgets read as before.

  In the supplier invoice **Add allocation** dialog, the Departure picker returned an empty list until something was typed: its resolver closes over the chosen product, but the combobox only re-ran on the query, so it kept results resolved before a product existed. `AsyncCombobox` takes a `searchKey` for whatever else its resolver depends on, and drops stale options the moment it changes.

  Supplier invoices showed `supp_01kz…` where the supplier's name belongs, in the list column and the detail header. The name is resolved on read and the id stays available on hover.

### Patch Changes

- Updated dependencies [8c38592]
  - @voyant-travel/reporting-contracts@0.4.0

## 0.13.0

### Patch Changes

- Updated dependencies [f4ac273]
  - @voyant-travel/ui@0.111.0
  - @voyant-travel/admin@0.137.0

## 0.12.0

### Patch Changes

- Updated dependencies [bd8f49a]
- Updated dependencies [1e0506f]
  - @voyant-travel/admin@0.136.0

## 0.11.0

### Patch Changes

- Updated dependencies [7b8ef95]
  - @voyant-travel/react@0.106.0
  - @voyant-travel/admin@0.135.0
  - @voyant-travel/reporting-contracts@0.3.10

## 0.10.1

### Patch Changes

- Updated dependencies [1be6b76]
  - @voyant-travel/react@0.105.0

## 0.10.0

### Patch Changes

- Updated dependencies [bf71bca]
  - @voyant-travel/admin@0.134.0

## 0.9.0

### Patch Changes

- Updated dependencies [5fa76aa]
  - @voyant-travel/admin@0.133.0
  - @voyant-travel/reporting-contracts@0.3.7

## 0.8.0

### Patch Changes

- @voyant-travel/admin@0.132.0

## 0.7.0

### Patch Changes

- Updated dependencies [bf20d76]
  - @voyant-travel/ui@0.110.0
  - @voyant-travel/admin@0.131.0

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
