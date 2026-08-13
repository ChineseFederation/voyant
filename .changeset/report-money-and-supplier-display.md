---
"@voyant-travel/reporting-contracts": minor
"@voyant-travel/reporting": minor
"@voyant-travel/reporting-react": minor
"@voyant-travel/finance": minor
"@voyant-travel/finance-react": minor
"@voyant-travel/bookings": minor
---

Stop three admin screens from reporting something that is not true.

A custom report widget summing a money column rendered `$351,533.00` on a row whose own grouping column said `EUR`. Two separate inventions: the renderer defaulted an absent currency to `USD`, and it attached a symbol and two decimals to an integer it had not scaled — the real balance was €3,515.33. Every money field these datasets expose is a `*Cents` measure with no major-unit alternative to select, so an unscaled currency format was wrong on all of them, and the symbol is what made it believable.

A report column now carries the two presentation facts only the dataset that produced it can know — `minorUnit`, and the output column holding the row's ISO currency code — and Finance declares both. Where they are absent the amount is written as a plain number rather than borrowing a symbol from a default. This applies to the widget renderer and to PDF export, which had the same `|| "USD"` fallback.

The same widget's header showed `Outstanding balance` for a column the query named `as owed`. Finance and Bookings now honour a selection's alias as its header. An alias that merely restates the field id is the query language's mandatory output name rather than a name the author chose, so those keep the dataset's own label and the preset widgets read as before.

In the supplier invoice **Add allocation** dialog, the Departure picker returned an empty list until something was typed: its resolver closes over the chosen product, but the combobox only re-ran on the query, so it kept results resolved before a product existed. `AsyncCombobox` takes a `searchKey` for whatever else its resolver depends on, and drops stale options the moment it changes.

Supplier invoices showed `supp_01kz…` where the supplier's name belongs, in the list column and the detail header. The name is resolved on read and the id stays available on hover.
