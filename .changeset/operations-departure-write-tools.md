---
"@voyant-travel/operations": minor
---

Add `create_departure` and `update_departure` agent tools.

Operations shipped eight tools, all read-only, while its manifest declared `operations:write` and `operations:delete` scopes that nothing consumed. `compose_product` deliberately leaves departures out, so an agent could compose a product and then had no way to make it sellable — asked for "a tour running every Saturday in September", it created the product and reported that it had no tool for the departures. Both actions are ledgered and reversible.
