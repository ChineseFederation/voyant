# Reporting datasets

The reports surface is a builder, not a set of fixed dashboards. Operators
author custom widgets, save them as reports, and add packaged templates to their
own collection. What a module contributes is the **data** those widgets can ask
for — a dataset — plus, optionally, preset widgets and a template that assembles
them.

The query language is deliberately small: `from … where … group by … select …
order by … limit …`, with **no joins, subqueries, statements or table access**.
That constraint is the reason the notes below matter.

## A dataset is a modelled view, not a table projection

Because there are no joins, a widget can only ever see one dataset. Anything a
report needs to combine must already be combined inside it.

`finance.unperformed-services` spans three grains — booking (contract value),
booking item (service dates), payment (collections) — and exposes them at
booking grain with the collections pre-aggregated. A caller cannot join its way
there, so the dataset does it.

State the grain in the `grain` field, in a sentence. It is the only place a
report author can read what one row means.

## A dataset may own its period

A dataset that declares `defaultDateField` gets a page-level date range injected
into every widget over it, preset and custom:

```
field >= dateFrom AND field <= dateTo
```

One field, both bounds. That fits most datasets and should be used where it
does.

It does not fit every period. `finance.unperformed-services` selects contracts
**concluded on or before period end** (no lower bound) whose **services run on
or after period start** (no upper bound) — two fields, opposite open bounds.
Wiring that to `defaultDateField` would answer a different question while
looking like it answered this one, and no error would say so.

So a dataset whose period is not a single symmetric window:

- declares **no** `defaultDateField` — no page filter beats one that quietly
  means something else
- reads its own parameters in `execute(context, { query, parameters })`, which
  receives the full bag
- **fails** when they are absent, rather than defaulting to all time

The last point is the one worth insisting on. A period report that silently
covers all time returns a plausible number that is wrong by an amount nobody can
see.

## Money columns carry their own presentation

A renderer has a value and a value type. It has no way to tell whether `351533`
is 351,533 or 3,515.33, and no way to tell what currency it is in. A `currency`
column must therefore declare `minorUnit` and point `currencyField` at an output
column carrying the ISO code — which means the query has to select that column.

This is why the unperformed-services widgets group by `reportingCurrency` rather
than assuming a single one: it gives every money column a currency to render
with, and a deployment whose documents were stamped in more than one reporting
currency gets two honest rows instead of one wrong total.

## Convert at write time, report what was written

A dataset reports what documents recorded; it does not convert at read time.

Foreign-currency documents are stamped with the rate of their own date when they
are written (`docs/adr` and voyant#4703). A report that instead looked a rate up
now would restate a March contract at today's rate — across one month of BNR
quotes that is worth about 1.8%, and the figure would move every time the report
was run.

Where nothing has stamped a record, the honest output is `null` plus a warning
on the result, not a rate invented at read time. `ReportResult.warnings` exists
for this: a total that silently omits unconvertible rows reads as complete when
it is short.
