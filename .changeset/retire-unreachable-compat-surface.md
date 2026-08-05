---
"@voyant-travel/bookings": minor
"@voyant-travel/bookings-react": minor
"@voyant-travel/catalog": minor
"@voyant-travel/distribution-react": minor
"@voyant-travel/finance": minor
"@voyant-travel/finance-react": minor
"@voyant-travel/framework": minor
"@voyant-travel/hono": minor
"@voyant-travel/inventory": minor
"@voyant-travel/inventory-react": minor
"@voyant-travel/legal": minor
"@voyant-travel/operations": minor
"@voyant-travel/operations-react": minor
---

chore: retire compatibility surface nothing reaches

Fourteen compatibility surfaces in private packages had no caller left anywhere in
the repository — not in product code, not in tests, and in several cases not
even a re-export. Each one is now gone rather than carried. Nothing here touches
a published package, a database column, or an API response an external
storefront could read; those cases are inventoried for a separate decision.

- **`@voyant-travel/catalog`** — the `./indexer/contract` subpath and the
  one-line re-export behind it. Every importer in the repository, including
  catalog's own modules, already names
  `@voyant-travel/catalog-contracts/indexer/contract`; the contracts package has
  been the canonical dependency since the engine contracts moved out of the
  runtime. The README and the catalog/promotions architecture docs no longer
  describe the alias.
- **`@voyant-travel/framework`** — `generateCustomSourcePluginManifests`, an
  alias of `generateCustomSourceExtensionManifests` left over from the "plugin"
  classification retirement, and the `providers` option on
  `VoyantNodeRuntimeOptions` / `createVoyantNodeApp`. The option was merged
  under `resources` on every path; no host, generated artifact or test ever
  passed it.
- **`@voyant-travel/hono`** — `LIVE_LIMITS`, two constants from the pre-C2
  limiter. Limits are configured per policy through `RateLimitPolicy`; the
  constants were re-exported twice and read nowhere.
- **`@voyant-travel/legal`** — `contractSeriesService.findSingleActiveByScope`,
  a pass-through to `findDefaultActiveByScope`. Callers and tests already use
  the canonical name.
- **`@voyant-travel/finance`** — `externalProvider`, `externalNumber` and
  `externalSeriesName` on `InvoiceVoidedEvent`. The single emitter never set
  them and `invoiceVoidedPayloadSchema` is `additionalProperties: false`, so
  they could not travel to a subscriber even if something had.
- **`@voyant-travel/finance-react`** — the `orderId` filter on
  `FinancePaymentSessionListFilters`. Its only reader was the
  `legacyOrderId ?? orderId` fallback in the query builder, which now reads
  `legacyOrderId` directly.
- **`@voyant-travel/operations-react`** — `KpiStrip` and
  `aggregateSlotFinancials`. The roll-up summed whatever page of the allocation
  manifest happened to be loaded, using its own paid-amount rule; the departure
  workspace reads whole-departure figures from `GET /slots/{id}/summary`
  instead. `KpiStrip` was not reachable from the package surface at all.

A second group carried no `@deprecated` tag, only a "back-compat" comment, and
was equally unreachable:

- **`@voyant-travel/operations`** — the `UpdateSlotRuntime` alias of
  `SlotMutationRuntime`, left over from when the runtime type covered updates
  only. Zero references, including tests.
- **`@voyant-travel/inventory`** — the flat `productLinkable` alias of
  `inventoryProductCompatibilityLinkable`, exported from three places. Both real
  callers (inventory's and legal's `standard-links`) import the canonical symbol
  and rename it locally. The compatibility linkable itself stays: it is what
  keeps the `products` module name resolving.
- **`@voyant-travel/inventory-react`** — `extras-compat.ts`, a forwarder to
  `./extras.js`. Its two importers were both inside the package.
- **`@voyant-travel/bookings`** — `getLegacyTransactionLinkFromBookingOrigin`
  and `LegacyBookingTransactionLink`, a reader for pre-Voyant transaction ids on
  a booking origin. Nothing called it; its only exercise was a unit test, which
  goes with it. The origin columns and the `legacy_transaction` origin source
  are untouched — this removes a reader, not the data.
- **`@voyant-travel/bookings-react`, `@voyant-travel/distribution-react`** — slot
  ids re-exported from the detail hosts "for backwards compatibility". Every
  consumer already imports them from the lean `./slots.js` the comment points
  at, which is the whole reason that module exists. The distribution-react one
  was already annotated as an unused export.

The three deleted files are pinned in `retired-paths.json` so they stay deleted.
