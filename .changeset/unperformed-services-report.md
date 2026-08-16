---
"@voyant-travel/reporting-contracts": minor
"@voyant-travel/reporting": minor
"@voyant-travel/reporting-react": minor
"@voyant-travel/graph-contracts": minor
"@voyant-travel/framework": minor
"@voyant-travel/finance": minor
---

Ship the periodic return on contracts in progress and unperformed services as a
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
