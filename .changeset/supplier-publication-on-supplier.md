---
"@voyant-travel/distribution-react": minor
---

Show where a supplier is published, on the supplier's own page.

Supplier-level channel publication already existed end to end — resolver with `supplier_decision` precedence over the default deny, routes, reindex intents, and enforcement at index time through `isOwnedProductStorefrontListable`. It was reachable from exactly one place: Channels, via a per-channel sheet.

That is the wrong way round for the question an operator arrives with. "Stop putting this supplier on the website" is formed while looking at a supplier, not while looking at a channel. Same authority and the same endpoints; this only puts the control where the intent forms.

Every channel is listed, including ones with no rule, because "where does this supplier show up?" cannot be answered by a list of only the decided channels. State is three-valued rather than a boolean: **undecided is not excluded**. The resolver defaults to deny, but a product-level rule can still publish an individual product from a supplier nobody has ruled on, so collapsing the two would report a supplier as blocked when nothing about it was ever decided. An inactive channel reports as inactive, which is what the resolver answers before it looks at a rule at all.
