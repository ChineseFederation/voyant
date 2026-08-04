---
"@voyant-travel/inventory": minor
"@voyant-travel/finance": minor
---

Stop the product cost roll-up adding minor units across currencies.

`product_day_services.cost_currency` is a required per-row column, so a single
itinerary routinely mixes currencies — EUR coach hire next to TRY hotel nights
on the same Turkish tour. The roll-up behind `products.cost_amount_cents` summed
those rows with no `GROUP BY` and no FX, producing an integer that belonged to
no currency, and then derived `products.margin_percent` from it against a sell
amount quoted in a third.

The roll-up now totals each source currency separately and restates every
non-sell currency into the product's sell currency — which is what the column
already meant to its consumers, since the operator product page formats it with
`sellCurrency` — through the same FX resolution finance uses for invoices.
Following the profitability read model, a source currency with no resolvable
rate is reported rather than guessed at; because a single scalar cannot say
"everything except the lira", the total and the margin are withheld (`null`)
instead of under-reporting cost and over-reporting margin.

`POST /v1/admin/products/{id}/recalculate` now answers with the sell `currency`,
the per-source-currency subtotals it was built from, and the currencies it could
not convert. `costAmountCents` and `marginPercent` are nullable in that
response. `margin_percent` is also null, rather than `0`, for a product with no
sell amount — a product that is not priced has no margin.

`resolveFxMoneyBaseAmount` is now exported from `@voyant-travel/finance` so
modules outside finance can restate an amount without reimplementing rate
lookup.
