---
"@voyant-travel/finance": minor
"@voyant-travel/finance-react": minor
---

Surface the under-allocated remainder of a supplier invoice.

Allocating a supplier invoice has always permitted under-allocation, and the
invariant docs said the leftover "is reported as `unattributed` by the read
model". It was not. The profitability read model's unattributed figure sums
`supplier_cost_allocations` rows whose `targetType` is `unattributed`, so it
answers "how much did someone deliberately mark as belonging to no departure" —
a remainder nobody allocated has no row at all and could never appear. An
invoice of 1000 with 600 allocated reported 600 of cost and nothing else; the
missing 400 quietly inflated margin everywhere the read model is read.

The departure and product reports now carry a second, separate figure,
`unallocated` (and `unallocatedCents` in the accounting-base rollup): per
invoice, its total minus every allocation row against it. The two are not
merged, because "we decided this cost belongs to no departure" and "nobody has
allocated this yet" are different signals and only the second is a backlog. The
remainder gets the same FX treatment as the rest of the model — pro-rated from
the invoice's own issue-date base snapshot, with only un-snapshotted legacy
rows converted at a fallback rate — and void and soft-deleted invoices are
excluded, as in the neighbouring queries.

Both CSV exports gain a trailing per-currency block listing the two kinds of
unaccounted cost. It is emitted only when there is something to report, so an
export from a fully allocated ledger is unchanged.
