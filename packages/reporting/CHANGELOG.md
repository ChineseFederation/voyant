# @voyant-travel/reporting

## 0.4.2

### Patch Changes

- Updated dependencies [020de35]
  - @voyant-travel/core@0.142.0
  - @voyant-travel/db@0.122.2
  - @voyant-travel/hono@0.143.1
  - @voyant-travel/reporting-contracts@0.4.2

## 0.4.1

### Patch Changes

- 36f3085: Stamp `x-voyant-key-kind` on every published operation in this package's OpenAPI
  documents.

  These packages own admin-surface documents only, so every operation reads
  `secret`: a publishable storefront key never reaches `/v1/admin/*`. Stating it
  per operation is the point — "which credential does this accept" should not be
  something a reader has to infer from a path prefix.

- Updated dependencies [c805276]
- Updated dependencies [c805276]
- Updated dependencies [36f3085]
  - @voyant-travel/core@0.141.0
  - @voyant-travel/db@0.122.0
  - @voyant-travel/hono@0.143.0
  - @voyant-travel/types@0.110.0
  - @voyant-travel/reporting-contracts@0.4.1

## 0.4.0

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

## 0.3.21

### Patch Changes

- b2c8b94: Reduce production admin-shell startup work by deferring lazy-route dependency preloads, keeping storefront presentation imports off the broad barrel, lazily loading public auth and proposal page implementations, loading Reporting admin routes on demand, and tightening the initial preload budget to 480 KiB gzip.
- Updated dependencies [c1f23ab]
  - @voyant-travel/db@0.121.1

## 0.3.20

### Patch Changes

- Updated dependencies [afb6866]
- Updated dependencies [5d1b298]
  - @voyant-travel/db@0.121.0
  - @voyant-travel/hono@0.142.2
  - @voyant-travel/types@0.109.13
  - @voyant-travel/core@0.140.2

## 0.3.19

### Patch Changes

- Updated dependencies [7b8ef95]
  - @voyant-travel/core@0.140.0
  - @voyant-travel/db@0.120.6
  - @voyant-travel/hono@0.142.1
  - @voyant-travel/reporting-contracts@0.3.10

## 0.3.18

### Patch Changes

- Updated dependencies [e8bd000]
  - @voyant-travel/hono@0.142.0

## 0.3.17

### Patch Changes

- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
  - @voyant-travel/core@0.139.0
  - @voyant-travel/hono@0.141.0
  - @voyant-travel/db@0.120.3
  - @voyant-travel/reporting-contracts@0.3.9

## 0.3.16

### Patch Changes

- Updated dependencies [3552f14]
  - @voyant-travel/core@0.138.0
  - @voyant-travel/db@0.120.2
  - @voyant-travel/hono@0.140.1
  - @voyant-travel/reporting-contracts@0.3.8

## 0.3.15

### Patch Changes

- Updated dependencies [c35841b]
  - @voyant-travel/hono@0.140.0
  - @voyant-travel/core@0.137.2

## 0.3.14

### Patch Changes

- Updated dependencies [2bc1570]
- Updated dependencies [2bc1570]
- Updated dependencies [14033fb]
  - @voyant-travel/db@0.120.0
  - @voyant-travel/hono@0.139.0
  - @voyant-travel/types@0.109.12

## 0.3.13

### Patch Changes

- Updated dependencies [0c30250]
  - @voyant-travel/core@0.137.0
  - @voyant-travel/db@0.119.1
  - @voyant-travel/hono@0.138.1
  - @voyant-travel/reporting-contracts@0.3.7

## 0.3.12

### Patch Changes

- Updated dependencies [e87d4de]
  - @voyant-travel/hono@0.138.0

## 0.3.11

### Patch Changes

- Updated dependencies [d92a98a]
  - @voyant-travel/hono@0.137.0

## 0.3.10

### Patch Changes

- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
  - @voyant-travel/hono@0.136.0

## 0.3.9

### Patch Changes

- Updated dependencies [8adeb23]
- Updated dependencies [6d0b4b4]
- Updated dependencies [7496159]
- Updated dependencies [fa75fe3]
  - @voyant-travel/db@0.119.0
  - @voyant-travel/hono@0.135.0
  - @voyant-travel/types@0.109.10

## 0.3.8

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/core@0.136.0
  - @voyant-travel/db@0.118.5
  - @voyant-travel/hono@0.134.5
  - @voyant-travel/reporting-contracts@0.3.6

## 0.3.7

### Patch Changes

- Updated dependencies [3651ff7]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/db@0.118.4
  - @voyant-travel/hono@0.134.4
  - @voyant-travel/reporting-contracts@0.3.5

## 0.3.6

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/core@0.134.0
  - @voyant-travel/db@0.118.3
  - @voyant-travel/hono@0.134.3
  - @voyant-travel/reporting-contracts@0.3.4

## 0.3.5

### Patch Changes

- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
  - @voyant-travel/core@0.133.0
  - @voyant-travel/db@0.118.2
  - @voyant-travel/hono@0.134.2
  - @voyant-travel/reporting-contracts@0.3.3

## 0.3.4

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/db@0.118.1
  - @voyant-travel/hono@0.134.1
  - @voyant-travel/reporting-contracts@0.3.2

## 0.3.3

### Patch Changes

- Updated dependencies [f945310]
- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/db@0.118.0
  - @voyant-travel/core@0.131.0
  - @voyant-travel/hono@0.134.0
  - @voyant-travel/types@0.109.9
  - @voyant-travel/reporting-contracts@0.3.1

## 0.3.2

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0

## 0.3.1

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0

## 0.3.0

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

## 0.2.3

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/hono@0.131.2
  - @voyant-travel/types@0.109.8

## 0.2.2

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0
  - @voyant-travel/hono@0.131.1
  - @voyant-travel/types@0.109.7

## 0.2.1

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/reporting-contracts@0.2.1
  - @voyant-travel/types@0.109.6

## 0.2.0

### Minor Changes

- b8b25b7: Add the composable reporting platform: module-owned semantic datasets and widget presets,
  cross-module full-page templates, persisted editable report drafts, immutable published versions,
  bounded query parsing and execution, source-scope authorization, and standard Operator selection.
  Bookings and Finance now contribute initial operational reporting content.
- b8b25b7: Connect the generic reporting-react grid to `@voyant-travel/reporting-contracts` and the operator admin app as a cohesive `/reporting` vertical slice: an instance-aware `ReportDraft` model (widget instance id distinct from preset/definition id, full-draft persistence), a revision-guarded autosave document controller with optimistic-conflict resolution, the `/reporting` admin extension (list, create, instantiate-template, open; view/edit toggle; preset + custom-widget catalog; grid editing), a bounded custom-widget query editor over `/queries/parse` and `/queries/preview`, and generic KPI/table/line/bar/pie renderers. The `@voyant-travel/reporting` manifest now declares an admin runtime pointing at `@voyant-travel/reporting-react/admin`, and Reporting is selected in operator-standard.

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/reporting-contracts@0.2.0
  - @voyant-travel/db@0.114.15
  - @voyant-travel/hono@0.130.1
