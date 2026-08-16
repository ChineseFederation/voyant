# @voyant-travel/distribution-react

## 0.292.0

### Patch Changes

- Updated dependencies [18212cc]
  - @voyant-travel/i18n@0.127.0
  - @voyant-travel/bookings-react@0.302.0
  - @voyant-travel/inventory-react@0.184.0
  - @voyant-travel/relationships-react@0.302.0

## 0.291.0

### Patch Changes

- @voyant-travel/bookings-react@0.301.0
- @voyant-travel/inventory-react@0.183.0
- @voyant-travel/relationships-react@0.301.0

## 0.290.0

### Patch Changes

- Updated dependencies [2ddcb4b]
  - @voyant-travel/ui@0.112.0
  - @voyant-travel/admin@0.138.0
  - @voyant-travel/bookings-react@0.300.0
  - @voyant-travel/inventory-react@0.182.0
  - @voyant-travel/relationships-react@0.300.0

## 0.289.0

### Patch Changes

- Updated dependencies [46d00dc]
  - @voyant-travel/distribution@0.229.0
  - @voyant-travel/bookings-react@0.299.0
  - @voyant-travel/inventory-react@0.181.0
  - @voyant-travel/react@0.106.4
  - @voyant-travel/relationships-react@0.299.0

## 0.288.0

### Patch Changes

- @voyant-travel/bookings-react@0.298.0
- @voyant-travel/inventory-react@0.180.0
- @voyant-travel/react@0.106.3
- @voyant-travel/relationships-react@0.298.0

## 0.287.0

### Patch Changes

- @voyant-travel/bookings-react@0.297.0
- @voyant-travel/inventory-react@0.179.0
- @voyant-travel/relationships-react@0.297.0

## 0.286.0

### Minor Changes

- 3b9cd41: Show where a supplier is published, on the supplier's own page.

  Supplier-level channel publication already existed end to end — resolver with `supplier_decision` precedence over the default deny, routes, reindex intents, and enforcement at index time through `isOwnedProductStorefrontListable`. It was reachable from exactly one place: Channels, via a per-channel sheet.

  That is the wrong way round for the question an operator arrives with. "Stop putting this supplier on the website" is formed while looking at a supplier, not while looking at a channel. Same authority and the same endpoints; this only puts the control where the intent forms.

  Every channel is listed, including ones with no rule, because "where does this supplier show up?" cannot be answered by a list of only the decided channels. State is three-valued rather than a boolean: **undecided is not excluded**. The resolver defaults to deny, but a product-level rule can still publish an individual product from a supplier nobody has ruled on, so collapsing the two would report a supplier as blocked when nothing about it was ever decided. An inactive channel reports as inactive, which is what the resolver answers before it looks at a rule at all.

### Patch Changes

- @voyant-travel/bookings-react@0.296.0
- @voyant-travel/inventory-react@0.178.0
- @voyant-travel/relationships-react@0.296.0

## 0.285.0

### Patch Changes

- @voyant-travel/bookings-react@0.295.0
- @voyant-travel/inventory-react@0.177.0
- @voyant-travel/relationships-react@0.295.0

## 0.284.0

### Patch Changes

- @voyant-travel/bookings-react@0.294.0
- @voyant-travel/inventory-react@0.176.0
- @voyant-travel/relationships-react@0.294.0

## 0.283.0

### Patch Changes

- Updated dependencies [c6ccc30]
  - @voyant-travel/i18n@0.126.0
  - @voyant-travel/bookings-react@0.293.0
  - @voyant-travel/inventory-react@0.175.0
  - @voyant-travel/relationships-react@0.293.0

## 0.282.0

### Patch Changes

- Updated dependencies [c6b5b12]
  - @voyant-travel/bookings-react@0.292.0
  - @voyant-travel/inventory-react@0.174.0
  - @voyant-travel/relationships-react@0.292.0

## 0.281.0

### Patch Changes

- Updated dependencies [70752e1]
  - @voyant-travel/i18n@0.125.0
  - @voyant-travel/bookings-react@0.291.0
  - @voyant-travel/inventory-react@0.173.0
  - @voyant-travel/relationships-react@0.291.0

## 0.280.0

### Patch Changes

- @voyant-travel/bookings-react@0.290.0
- @voyant-travel/inventory-react@0.172.0
- @voyant-travel/relationships-react@0.290.0

## 0.279.0

### Patch Changes

- @voyant-travel/bookings-react@0.289.0
- @voyant-travel/inventory-react@0.171.0
- @voyant-travel/relationships-react@0.289.0

## 0.278.0

### Patch Changes

- Updated dependencies [e99380d]
  - @voyant-travel/i18n@0.124.0
  - @voyant-travel/inventory-react@0.170.0
  - @voyant-travel/bookings-react@0.288.0
  - @voyant-travel/relationships-react@0.288.0

## 0.277.0

### Patch Changes

- @voyant-travel/react@0.106.2
- @voyant-travel/bookings-react@0.287.0
- @voyant-travel/inventory-react@0.169.0
- @voyant-travel/relationships-react@0.287.0

## 0.276.0

### Patch Changes

- Updated dependencies [8e2133e]
  - @voyant-travel/bookings-react@0.286.0
  - @voyant-travel/inventory-react@0.168.0
  - @voyant-travel/relationships-react@0.286.0

## 0.275.0

### Patch Changes

- Updated dependencies [1858c5b]
  - @voyant-travel/bookings-react@0.285.0
  - @voyant-travel/inventory-react@0.167.0
  - @voyant-travel/relationships-react@0.285.0

## 0.274.0

### Patch Changes

- Updated dependencies [0fe4ce8]
  - @voyant-travel/bookings-react@0.284.0
  - @voyant-travel/inventory-react@0.166.0
  - @voyant-travel/relationships-react@0.284.0

## 0.273.0

### Patch Changes

- @voyant-travel/bookings-react@0.283.0
- @voyant-travel/inventory-react@0.165.0
- @voyant-travel/relationships-react@0.283.0

## 0.272.0

### Patch Changes

- @voyant-travel/bookings-react@0.282.0
- @voyant-travel/inventory-react@0.164.0
- @voyant-travel/relationships-react@0.282.0

## 0.271.0

### Minor Changes

- 1f4e14c: Offer the known networks as a catalog when adding a channel.

  Creating a channel for GetYourGuide meant typing the name, guessing which `kind` it is out of a seven-value enum, and finding the website. Nothing about that was the operator's decision to make — the answers are the same on every deployment.

  `GET /v1/admin/distribution/channels/presets` now serves the catalog: GetYourGuide, Viator, Tripadvisor, Klook, Civitatis, Musement, Airbnb Experiences and Voyant Connect as named networks, plus affiliate / reseller / API partner as shapes to start from. The add-channel sheet offers them and prefills name, kind and website, leaving everything editable.

  They are a catalog and not seeded rows. A `channels` row is a commercial relationship carrying contracts, commission rules and settlement terms, so pre-creating one per network would fill the counterparty list with companies nobody has contracted with, each showing fields that mean nothing until someone signs something. Nothing exists until the operator picks it.

  A row created from a named network records `channels.preset_key`. That is a stable identity a future connector can bind to — "the GetYourGuide channel" — rather than matching on a display name the operator is free to rename, which is what makes per-channel publication addressable by something other than a typeid. The key is unique, so a second channel for the same network is refused with a 409 naming the one that already exists, and it is set once: `updateChannelSchema` drops it, because re-pointing it would silently move whatever had bound to it.

  The partner types deliberately write no key. An operator has many affiliates and none of them is _the_ affiliate, so those presets fill in `kind` and claim no identity.

  Direct is absent from the catalog: it is provisioned by migration and is not a counterparty.

- df9f45b: Provision the Direct channel, and let the public surface resolve to it without being configured.

  Publication is default-deny per channel and every public catalog read resolves a channel before it answers, so serving your own website meant hand-creating a row in `channels` — a table of commercial counterparties, sitting next to `suppliers`, carrying contracts, rate limits and contact projections — that represents yourself, then binding a storefront to it. Nothing provisioned that row on an ongoing basis: a one-shot setup cutover backfilled the storefronts that existed when it ran, and every storefront created afterwards got a 403 on `/settings`, `/departures/*`, `/products/*`, `/offers/*`, `/leads`, `/newsletter/*`, on the anonymous booking-session routes, and on checkout start.

  `channels` now carries a `system_key`, and a migration provisions exactly one row marked `direct`. It adopts before it inserts — the cutover's own `chan_storefront_direct` row first, then the oldest active `direct` channel — because publication rules and storefront bindings are keyed by channel id, and a fresh row beside an existing one would silently unpublish everything already published.

  A storefront with no explicit binding now resolves to that channel instead of to nothing, and so does one whose explicitly bound channel has gone inactive. `StorefrontChannelBindingDto` gains `implicit`, so an admin surface can show the default as a default; clearing a binding means "back to Direct" rather than "off the air". A binding that names another channel still wins, so `affiliate` / `reseller` / `api_partner` keep working.

  The system channel cannot be deleted or moved off `active` through the API (409, not a 404 that reads like the row is gone), and its `kind` is fixed; its name and contact details stay the operator's to edit. `GET /v1/admin/distribution/channels` takes `system=include|exclude|only`, defaulting to `include` — publication and product-mapping pickers read that endpoint and must still be able to target Direct. Only the Distribution counterparty list passes `exclude`.

  Batch update and batch delete now isolate failures per id rather than rejecting the whole batch when one id is refused.

  The storefront admin's channel section stops warning about something that is no longer true. It said "Default-deny is enforced: customer requests are rejected until this storefront is bound to an active channel", in an amber alert, and offered "Clear binding" with a confirmation warning that customer API access would be denied. It now states the default plainly, shows "Publishing to Direct (default)" for an implicit binding, and the clear action reads "Use Direct" and is disabled when Direct is already what you have.

### Patch Changes

- Updated dependencies [1a3ba50]
- Updated dependencies [1f4e14c]
- Updated dependencies [df9f45b]
- Updated dependencies [36f3085]
- Updated dependencies [38531e2]
  - @voyant-travel/i18n@0.123.1
  - @voyant-travel/distribution@0.228.0
  - @voyant-travel/bookings-react@0.281.0
  - @voyant-travel/inventory-react@0.163.0
  - @voyant-travel/react@0.106.1
  - @voyant-travel/relationships-react@0.281.0

## 0.270.0

### Patch Changes

- Updated dependencies [d25f047]
  - @voyant-travel/bookings-react@0.280.0
  - @voyant-travel/inventory-react@0.162.0
  - @voyant-travel/relationships-react@0.280.0

## 0.269.0

### Patch Changes

- Updated dependencies [3ebde50]
- Updated dependencies [f60a572]
- Updated dependencies [3d7ed59]
- Updated dependencies [c911139]
  - @voyant-travel/bookings-react@0.279.0
  - @voyant-travel/relationships-react@0.279.0
  - @voyant-travel/inventory-react@0.161.0

## 0.268.0

### Patch Changes

- f4ac273: Make the operator admin usable on a phone. A measured audit at 390x844 found the
  desktop layout reflowing rather than adapting, with three defects that blocked real
  work: the booking detail header pushed `Cancel booking` and `Delete` entirely
  off-screen (252px of document overflow), four of its eight tabs were unreachable
  because the tab strip was not a scroll container, and hand-rolled tables inside
  `overflow-hidden` wrappers clipped columns with no way to scroll to them — `/suppliers`
  simply lost Country and Currency.

  Fixes stay in the composition layer; the shadcn-style primitives under
  `@voyant-travel/ui/components` are untouched. A new `@voyant-travel/ui/lib/responsive`
  exports the shared class strings.

  - Table wrappers that clipped or could not scroll now scroll horizontally (17 call
    sites across bookings, suppliers, catalog, finance, legal, notifications and
    inventory), and two tables that had no wrapper at all gained one.
  - List tables drop their low-value columns below `md` so the decision-relevant ones
    fit: bookings now shows number/status/total/dates instead of a created-at timestamp
    and an empty payer column, cutting hidden width from 706px to 111px. Products,
    invoices and suppliers get the same treatment, skeleton rows included.
  - The booking detail header wraps its actions and its tab strip scrolls, removing the
    document-level horizontal overflow.
  - The operator shell header is sticky, so the sidebar trigger — the only way to reach
    navigation on a phone — stays reachable on pages several screens tall.
  - Filter popovers cap their height, scroll internally and fit narrow viewports rather
    than running past the bottom of the screen.
  - Side sheets are full-width below `sm` instead of 75%, and touch targets on the
    sidebar trigger and row-selection checkboxes meet the 44px minimum.
  - The settings sub-nav scrolls its active section into view, so you can tell which of
    ~18 sections you are in.

- Updated dependencies [f4ac273]
  - @voyant-travel/ui@0.111.0
  - @voyant-travel/admin@0.137.0
  - @voyant-travel/bookings-react@0.278.0
  - @voyant-travel/inventory-react@0.160.0
  - @voyant-travel/relationships-react@0.278.0

## 0.267.0

### Patch Changes

- @voyant-travel/bookings-react@0.277.0
- @voyant-travel/inventory-react@0.159.0
- @voyant-travel/relationships-react@0.277.0

## 0.266.0

### Patch Changes

- @voyant-travel/bookings-react@0.276.0
- @voyant-travel/inventory-react@0.158.0
- @voyant-travel/relationships-react@0.276.0

## 0.265.0

### Patch Changes

- @voyant-travel/bookings-react@0.275.0
- @voyant-travel/inventory-react@0.157.0
- @voyant-travel/relationships-react@0.275.0

## 0.264.0

### Patch Changes

- @voyant-travel/bookings-react@0.274.0
- @voyant-travel/inventory-react@0.156.0
- @voyant-travel/relationships-react@0.274.0

## 0.263.0

### Patch Changes

- Updated dependencies [8fc2d25]
  - @voyant-travel/bookings-react@0.273.0
  - @voyant-travel/inventory-react@0.155.0
  - @voyant-travel/relationships-react@0.273.0

## 0.262.0

### Patch Changes

- @voyant-travel/bookings-react@0.272.0
- @voyant-travel/inventory-react@0.154.0
- @voyant-travel/relationships-react@0.272.0

## 0.261.0

### Patch Changes

- @voyant-travel/bookings-react@0.271.0
- @voyant-travel/inventory-react@0.153.0
- @voyant-travel/relationships-react@0.271.0

## 0.260.0

### Patch Changes

- @voyant-travel/bookings-react@0.270.0
- @voyant-travel/inventory-react@0.152.0
- @voyant-travel/relationships-react@0.270.0

## 0.259.0

### Patch Changes

- Updated dependencies [bd8f49a]
- Updated dependencies [1e0506f]
  - @voyant-travel/admin@0.136.0
  - @voyant-travel/bookings-react@0.269.0
  - @voyant-travel/inventory-react@0.151.0
  - @voyant-travel/relationships-react@0.269.0

## 0.258.0

### Patch Changes

- @voyant-travel/bookings-react@0.268.0
- @voyant-travel/inventory-react@0.150.0
- @voyant-travel/relationships-react@0.268.0

## 0.257.0

### Patch Changes

- @voyant-travel/bookings-react@0.267.0
- @voyant-travel/inventory-react@0.149.0
- @voyant-travel/relationships-react@0.267.0

## 0.256.0

### Patch Changes

- Updated dependencies [484b207]
  - @voyant-travel/bookings-react@0.266.0
  - @voyant-travel/i18n@0.123.0
  - @voyant-travel/inventory-react@0.148.0
  - @voyant-travel/relationships-react@0.266.0

## 0.255.0

### Patch Changes

- Updated dependencies [7b8ef95]
- Updated dependencies [f56d552]
  - @voyant-travel/react@0.106.0
  - @voyant-travel/admin@0.135.0
  - @voyant-travel/inventory-react@0.147.0
  - @voyant-travel/i18n@0.122.1
  - @voyant-travel/bookings-react@0.265.0
  - @voyant-travel/relationships-react@0.265.0

## 0.254.0

### Patch Changes

- Updated dependencies [1be6b76]
  - @voyant-travel/bookings-react@0.264.0
  - @voyant-travel/react@0.105.0
  - @voyant-travel/inventory-react@0.146.0
  - @voyant-travel/relationships-react@0.264.0

## 0.253.0

### Patch Changes

- Updated dependencies [6c77f7d]
  - @voyant-travel/bookings-react@0.263.0
  - @voyant-travel/inventory-react@0.145.0
  - @voyant-travel/relationships-react@0.263.0

## 0.252.0

### Patch Changes

- @voyant-travel/bookings-react@0.262.0
- @voyant-travel/inventory-react@0.144.0
- @voyant-travel/relationships-react@0.262.0

## 0.251.0

### Patch Changes

- @voyant-travel/bookings-react@0.261.0
- @voyant-travel/inventory-react@0.143.0
- @voyant-travel/relationships-react@0.261.0

## 0.250.0

### Minor Changes

- e8bd000: chore: retire compatibility surface nothing reaches

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

### Patch Changes

- Updated dependencies [e8bd000]
  - @voyant-travel/bookings-react@0.260.0
  - @voyant-travel/inventory-react@0.142.0
  - @voyant-travel/relationships-react@0.260.0

## 0.249.0

### Patch Changes

- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
  - @voyant-travel/inventory-react@0.141.0
  - @voyant-travel/bookings-react@0.259.0
  - @voyant-travel/relationships-react@0.259.0

## 0.248.0

### Patch Changes

- Updated dependencies [9b92f12]
  - @voyant-travel/bookings-react@0.258.0
  - @voyant-travel/inventory-react@0.140.0
  - @voyant-travel/relationships-react@0.258.0

## 0.247.0

### Patch Changes

- @voyant-travel/inventory-react@0.139.0
- @voyant-travel/bookings-react@0.257.0
- @voyant-travel/relationships-react@0.257.0

## 0.246.0

### Patch Changes

- Updated dependencies [64df424]
  - @voyant-travel/i18n@0.122.0
  - @voyant-travel/inventory-react@0.138.0
  - @voyant-travel/bookings-react@0.256.0
  - @voyant-travel/relationships-react@0.256.0

## 0.245.0

### Patch Changes

- Updated dependencies [f569b10]
  - @voyant-travel/bookings-react@0.255.0
  - @voyant-travel/inventory-react@0.137.0
  - @voyant-travel/relationships-react@0.255.0

## 0.244.0

### Patch Changes

- Updated dependencies [9ef6a65]
  - @voyant-travel/inventory-react@0.136.0
  - @voyant-travel/bookings-react@0.254.0
  - @voyant-travel/relationships-react@0.254.0

## 0.243.0

### Patch Changes

- Updated dependencies [ef8871d]
  - @voyant-travel/bookings-react@0.253.0
  - @voyant-travel/inventory-react@0.135.0
  - @voyant-travel/relationships-react@0.253.0

## 0.242.0

### Patch Changes

- @voyant-travel/bookings-react@0.252.0
- @voyant-travel/inventory-react@0.134.0
- @voyant-travel/relationships-react@0.252.0

## 0.241.0

### Patch Changes

- Updated dependencies [3d793c1]
  - @voyant-travel/inventory-react@0.133.0
  - @voyant-travel/bookings-react@0.251.0
  - @voyant-travel/relationships-react@0.251.0

## 0.240.0

### Patch Changes

- @voyant-travel/bookings-react@0.250.0
- @voyant-travel/inventory-react@0.132.0
- @voyant-travel/relationships-react@0.250.0

## 0.239.0

### Patch Changes

- Updated dependencies [9b9e8ac]
  - @voyant-travel/inventory-react@0.131.0
  - @voyant-travel/bookings-react@0.249.0
  - @voyant-travel/relationships-react@0.249.0

## 0.238.0

### Patch Changes

- @voyant-travel/bookings-react@0.248.0
- @voyant-travel/inventory-react@0.130.0
- @voyant-travel/relationships-react@0.248.0

## 0.237.0

### Patch Changes

- Updated dependencies [d2a571f]
  - @voyant-travel/bookings-react@0.247.0
  - @voyant-travel/inventory-react@0.129.0
  - @voyant-travel/relationships-react@0.247.0

## 0.236.0

### Patch Changes

- @voyant-travel/inventory-react@0.128.0
- @voyant-travel/bookings-react@0.246.0
- @voyant-travel/relationships-react@0.246.0

## 0.235.0

### Patch Changes

- Updated dependencies [ff0b8cc]
  - @voyant-travel/i18n@0.121.0
  - @voyant-travel/bookings-react@0.245.0
  - @voyant-travel/inventory-react@0.127.0
  - @voyant-travel/relationships-react@0.245.0

## 0.234.0

### Patch Changes

- @voyant-travel/inventory-react@0.126.0
- @voyant-travel/bookings-react@0.244.0
- @voyant-travel/relationships-react@0.244.0

## 0.233.0

### Patch Changes

- @voyant-travel/inventory-react@0.125.0
- @voyant-travel/bookings-react@0.243.0
- @voyant-travel/relationships-react@0.243.0

## 0.232.0

### Patch Changes

- @voyant-travel/inventory-react@0.124.0
- @voyant-travel/bookings-react@0.242.0
- @voyant-travel/relationships-react@0.242.0

## 0.231.0

### Patch Changes

- Updated dependencies [06a79a0]
  - @voyant-travel/bookings-react@0.241.0
  - @voyant-travel/inventory-react@0.123.0
  - @voyant-travel/i18n@0.120.0
  - @voyant-travel/relationships-react@0.241.0

## 0.230.0

### Patch Changes

- @voyant-travel/bookings-react@0.240.0
- @voyant-travel/inventory-react@0.122.0
- @voyant-travel/relationships-react@0.240.0

## 0.229.0

### Minor Changes

- 4c694f6: Gate sourced catalog entries on channel publication, and let operators choose
  which supply sources each channel sells.

  Sourced entries never passed a listability gate: `syncSources` emitted every
  discovered projection into every slice the deployment materialized, so
  attaching a supply connection published that supplier's whole catalogue to the
  operator's live storefront with no publish step. Channel publication could not
  reach them either — its subjects are a product id and a canonical Supplier, and
  a sourced entry has neither.

  `channel_source_publications` adds the missing subject: an include/exclude
  decision on a `(source_kind, source_connection_id)` pair, resolved
  default-deny with connection beating source kind, mirroring the existing
  product-beats-supplier ordering. The discovery sync and the catalog document
  builder both consult it, so revoking publication removes the inventory on the
  next index pass; staff slices stay ungated so operators can still browse a
  connected supplier to decide what to sell. Admin gets a Supply sources tab
  alongside Products and Suppliers, with the same preview-and-confirm step that
  supplier rules use.

  Index documents now carry `isSourced`, `sourceKind`, and `sourceConnectionId`
  in every vertical, so storefronts can scope on ownership directly instead of
  inferring it from `supplyModel` or an id prefix.

  Deployments with inventory already indexed are backfilled with an explicit
  `include` rule per connection per active channel, so nothing disappears from a
  live storefront on upgrade — the status quo becomes something the operator can
  see and revoke rather than something implied by having connected at all.
  Connections attached after this ships are unpublished until chosen.

### Patch Changes

- Updated dependencies [4c694f6]
  - @voyant-travel/distribution@0.227.0
  - @voyant-travel/bookings-react@0.239.0
  - @voyant-travel/inventory-react@0.121.0
  - @voyant-travel/relationships-react@0.239.0

## 0.228.0

### Patch Changes

- @voyant-travel/inventory-react@0.120.0
- @voyant-travel/relationships-react@0.238.0
- @voyant-travel/bookings-react@0.238.0

## 0.227.0

### Patch Changes

- Updated dependencies [f69e880]
  - @voyant-travel/bookings-react@0.237.0
  - @voyant-travel/i18n@0.119.4
  - @voyant-travel/inventory-react@0.119.0
  - @voyant-travel/relationships-react@0.237.0

## 0.226.0

### Patch Changes

- @voyant-travel/bookings-react@0.236.0
- @voyant-travel/distribution@0.226.0
- @voyant-travel/inventory-react@0.118.0
- @voyant-travel/relationships-react@0.236.0

## 0.225.0

### Patch Changes

- @voyant-travel/bookings-react@0.235.0
- @voyant-travel/inventory-react@0.117.0
- @voyant-travel/relationships-react@0.235.0
- @voyant-travel/distribution@0.225.0

## 0.224.0

### Patch Changes

- Updated dependencies [2ed62d3]
  - @voyant-travel/bookings-react@0.234.0
  - @voyant-travel/distribution@0.224.0
  - @voyant-travel/inventory-react@0.116.0
  - @voyant-travel/relationships-react@0.234.0

## 0.223.0

### Patch Changes

- @voyant-travel/bookings-react@0.233.0
- @voyant-travel/distribution@0.223.0
- @voyant-travel/inventory-react@0.115.0
- @voyant-travel/relationships-react@0.233.0

## 0.222.0

### Patch Changes

- @voyant-travel/bookings-react@0.232.0
- @voyant-travel/inventory-react@0.114.0
- @voyant-travel/distribution@0.222.0
- @voyant-travel/relationships-react@0.232.0

## 0.221.0

### Patch Changes

- Updated dependencies [f7adc5b]
- Updated dependencies [f7adc5b]
- Updated dependencies [f7adc5b]
  - @voyant-travel/bookings-react@0.231.0
  - @voyant-travel/inventory-react@0.113.0
  - @voyant-travel/distribution@0.221.0
  - @voyant-travel/i18n@0.119.3
  - @voyant-travel/relationships-react@0.231.0

## 0.220.0

### Patch Changes

- Updated dependencies [72c6753]
  - @voyant-travel/bookings-react@0.230.0
  - @voyant-travel/distribution@0.220.0
  - @voyant-travel/inventory-react@0.112.0
  - @voyant-travel/relationships-react@0.230.0

## 0.219.1

### Patch Changes

- bdc0443: Add admin channel binding and publication management UI.

## 0.219.0

### Patch Changes

- Updated dependencies [2601445]
  - @voyant-travel/distribution@0.219.0
  - @voyant-travel/bookings-react@0.229.0
  - @voyant-travel/inventory-react@0.111.0
  - @voyant-travel/relationships-react@0.229.0

## 0.218.0

### Patch Changes

- Updated dependencies [bf71bca]
  - @voyant-travel/admin@0.134.0
  - @voyant-travel/bookings-react@0.228.0
  - @voyant-travel/inventory-react@0.110.0
  - @voyant-travel/relationships-react@0.228.0
  - @voyant-travel/distribution@0.218.0

## 0.217.0

### Patch Changes

- Updated dependencies [e65bd25]
  - @voyant-travel/relationships-react@0.227.0
  - @voyant-travel/i18n@0.119.2
  - @voyant-travel/bookings-react@0.227.0
  - @voyant-travel/distribution@0.217.0
  - @voyant-travel/inventory-react@0.109.0

## 0.216.0

### Patch Changes

- @voyant-travel/bookings-react@0.226.0
- @voyant-travel/distribution@0.216.0
- @voyant-travel/inventory-react@0.108.0
- @voyant-travel/relationships-react@0.226.0

## 0.215.0

### Patch Changes

- Updated dependencies [4fe6f79]
- Updated dependencies [5fa76aa]
  - @voyant-travel/bookings-react@0.225.0
  - @voyant-travel/admin@0.133.0
  - @voyant-travel/distribution@0.215.0
  - @voyant-travel/inventory-react@0.107.0
  - @voyant-travel/relationships-react@0.225.0

## 0.214.0

### Patch Changes

- @voyant-travel/distribution@0.214.0
- @voyant-travel/admin@0.132.0
- @voyant-travel/bookings-react@0.224.0
- @voyant-travel/inventory-react@0.106.0
- @voyant-travel/relationships-react@0.224.0

## 0.213.0

### Patch Changes

- @voyant-travel/distribution@0.213.0
- @voyant-travel/bookings-react@0.223.0
- @voyant-travel/inventory-react@0.105.0
- @voyant-travel/relationships-react@0.223.0

## 0.212.0

### Patch Changes

- @voyant-travel/bookings-react@0.222.0
- @voyant-travel/inventory-react@0.104.0
- @voyant-travel/relationships-react@0.222.0
- @voyant-travel/distribution@0.212.0

## 0.211.1

## 0.211.0

### Patch Changes

- @voyant-travel/bookings-react@0.221.0
- @voyant-travel/distribution@0.211.0
- @voyant-travel/inventory-react@0.103.0
- @voyant-travel/relationships-react@0.221.0

## 0.210.0

### Patch Changes

- Updated dependencies [7496159]
  - @voyant-travel/i18n@0.119.0
  - @voyant-travel/bookings-react@0.220.0
  - @voyant-travel/distribution@0.210.0
  - @voyant-travel/inventory-react@0.102.0
  - @voyant-travel/admin@0.131.1
  - @voyant-travel/relationships-react@0.220.0

## 0.209.0

### Patch Changes

- @voyant-travel/bookings-react@0.219.0
- @voyant-travel/inventory-react@0.101.0
- @voyant-travel/relationships-react@0.219.0
- @voyant-travel/distribution@0.209.0

## 0.208.1

### Patch Changes

- Updated dependencies [fdb2b37]
  - @voyant-travel/distribution@0.208.1

## 0.208.0

### Patch Changes

- @voyant-travel/bookings-react@0.218.0
- @voyant-travel/distribution@0.208.0
- @voyant-travel/inventory-react@0.100.0
- @voyant-travel/relationships-react@0.218.0

## 0.207.0

### Patch Changes

- Updated dependencies [d3f16d5]
  - @voyant-travel/inventory-react@0.99.0
  - @voyant-travel/bookings-react@0.217.0
  - @voyant-travel/relationships-react@0.217.0
  - @voyant-travel/distribution@0.207.0

## 0.206.1

### Patch Changes

- Updated dependencies [a653664]
  - @voyant-travel/distribution@0.206.1
  - @voyant-travel/bookings-react@0.216.2

## 0.206.0

### Patch Changes

- Updated dependencies [903c754]
  - @voyant-travel/bookings-react@0.216.0
  - @voyant-travel/inventory-react@0.98.0
  - @voyant-travel/i18n@0.118.3
  - @voyant-travel/distribution@0.206.0
  - @voyant-travel/relationships-react@0.216.0

## 0.205.0

### Patch Changes

- Updated dependencies [6c76de3]
  - @voyant-travel/i18n@0.118.2
  - @voyant-travel/bookings-react@0.215.0
  - @voyant-travel/inventory-react@0.97.0
  - @voyant-travel/relationships-react@0.215.0
  - @voyant-travel/distribution@0.205.0

## 0.204.0

### Patch Changes

- Updated dependencies [bf20d76]
- Updated dependencies [bf20d76]
  - @voyant-travel/ui@0.110.0
  - @voyant-travel/inventory-react@0.96.0
  - @voyant-travel/admin@0.131.0
  - @voyant-travel/bookings-react@0.214.0
  - @voyant-travel/relationships-react@0.214.0
  - @voyant-travel/distribution@0.204.0

## 0.203.0

### Patch Changes

- @voyant-travel/bookings-react@0.213.0
- @voyant-travel/inventory-react@0.95.0
- @voyant-travel/relationships-react@0.213.0
- @voyant-travel/distribution@0.203.0

## 0.202.0

### Patch Changes

- @voyant-travel/bookings-react@0.212.0
- @voyant-travel/distribution@0.202.0
- @voyant-travel/inventory-react@0.94.0
- @voyant-travel/relationships-react@0.212.0

## 0.201.0

### Patch Changes

- @voyant-travel/bookings-react@0.211.0
- @voyant-travel/distribution@0.201.0
- @voyant-travel/inventory-react@0.93.0
- @voyant-travel/relationships-react@0.211.0

## 0.200.0

### Patch Changes

- @voyant-travel/bookings-react@0.210.0
- @voyant-travel/inventory-react@0.92.0
- @voyant-travel/relationships-react@0.210.0
- @voyant-travel/distribution@0.200.0

## 0.199.0

### Patch Changes

- @voyant-travel/bookings-react@0.209.0
- @voyant-travel/inventory-react@0.91.0
- @voyant-travel/relationships-react@0.209.0
- @voyant-travel/distribution@0.199.0

## 0.198.0

### Patch Changes

- Updated dependencies [1873611]
  - @voyant-travel/admin@0.130.0
  - @voyant-travel/i18n@0.118.0
  - @voyant-travel/bookings-react@0.208.0
  - @voyant-travel/inventory-react@0.90.0
  - @voyant-travel/relationships-react@0.208.0
  - @voyant-travel/distribution@0.198.0

## 0.197.2

### Patch Changes

- Updated dependencies [2cfce32]
  - @voyant-travel/distribution@0.197.2

## 0.197.1

### Patch Changes

- Updated dependencies [accb1cf]
  - @voyant-travel/distribution@0.197.1

## 0.197.0

### Patch Changes

- Updated dependencies [4979d3b]
  - @voyant-travel/bookings-react@0.207.0
  - @voyant-travel/distribution@0.197.0
  - @voyant-travel/inventory-react@0.89.0
  - @voyant-travel/relationships-react@0.207.0

## 0.196.0

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/i18n@0.117.3
  - @voyant-travel/bookings-react@0.206.0
  - @voyant-travel/inventory-react@0.88.0
  - @voyant-travel/relationships-react@0.206.0
  - @voyant-travel/distribution@0.196.0

## 0.195.0

### Patch Changes

- @voyant-travel/bookings-react@0.205.0
- @voyant-travel/relationships-react@0.205.0
- @voyant-travel/inventory-react@0.87.0
- @voyant-travel/distribution@0.195.0

## 0.194.0

### Patch Changes

- Updated dependencies [9e57a5d]
  - @voyant-travel/inventory-react@0.86.0
  - @voyant-travel/bookings-react@0.204.0
  - @voyant-travel/relationships-react@0.204.0
  - @voyant-travel/distribution@0.194.0

## 0.193.0

### Patch Changes

- Updated dependencies [17f1239]
  - @voyant-travel/bookings-react@0.203.0
  - @voyant-travel/distribution@0.193.0
  - @voyant-travel/inventory-react@0.85.0
  - @voyant-travel/relationships-react@0.203.0

## 0.192.0

### Patch Changes

- @voyant-travel/bookings-react@0.202.0
- @voyant-travel/inventory-react@0.84.0
- @voyant-travel/relationships-react@0.202.0
- @voyant-travel/distribution@0.192.0

## 0.191.1

### Patch Changes

- Updated dependencies [a02a76b]
  - @voyant-travel/distribution@0.191.1
  - @voyant-travel/bookings-react@0.201.1

## 0.191.0

### Patch Changes

- @voyant-travel/bookings-react@0.201.0
- @voyant-travel/distribution@0.191.0
- @voyant-travel/inventory-react@0.83.0
- @voyant-travel/relationships-react@0.201.0

## 0.190.0

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/bookings-react@0.200.0
  - @voyant-travel/distribution@0.190.0
  - @voyant-travel/inventory-react@0.82.0
  - @voyant-travel/relationships-react@0.200.0
  - @voyant-travel/ui@0.109.6

## 0.189.0

### Patch Changes

- @voyant-travel/distribution@0.189.0
- @voyant-travel/bookings-react@0.199.0
- @voyant-travel/inventory-react@0.81.0
- @voyant-travel/relationships-react@0.199.0

## 0.188.1

### Patch Changes

- e2cb9f5: Give every admin screen consistent page spacing. Previously each page invented
  its own padding (`p-6`, `px-6 py-6 lg:px-8`, `container mx-auto py-6` with no
  horizontal padding, or none at all), so screens like the booking engine had no
  spacing while others differed.

  The admin workspace layout now wraps the page outlet in a single padded content
  region (`px-4 py-6 md:px-6`), and the per-page root padding was removed so it no
  longer double-pads (max-width caps are kept). The full-height settings two-pane
  bleeds back out of that padding and re-applies its own so it stays edge-to-edge.

- e2cb9f5: Fix double page padding. The admin shell already applies consistent page
  padding around the content area, but a number of page and loading-skeleton
  components still added their own `p-6` on top, pushing their content ~24px
  further in than the page header and leaving pages inconsistently indented.
  Those redundant root paddings are removed so every page's content lines up with
  the header and with each other. Dialog, portal, and card paddings are
  unchanged.
- e2cb9f5: Move heavy multi-field forms from centered dialogs to side sheets. Create/edit
  forms with more than a handful of fields (invoices, bookings, travelers,
  markets, pricing rules, policies, suppliers, resources, legal templates,
  notification templates, and similar) were rendered as centered modals; per the
  dialog-vs-sheet guidance, complex multi-field editing belongs in a side sheet
  that keeps the parent screen visible. Confirmations, media viewers, and short
  one-to-three-field dialogs are unchanged.
- e2cb9f5: Make form-field grids responsive on mobile. Two-column (and three/four-column) field grids that previously rendered multiple columns at every width now stack to a single column on small screens and expand at the `sm`/`lg` breakpoints, so forms and dialogs are no longer cramped on phones.
- e2cb9f5: Plain-language copy pass across the admin UI. Rewrites microcopy on the
  non-developer screens so it reads for travel professionals rather than
  engineers: removes developer jargon (entity, tenant, adapter/connector,
  payload, sync/reconcile internals, raw database column names and code
  fragments), strips internal/roadmap notes that leaked into user copy, cuts
  verbose and redundant helper text, and aligns terminology to the canonical
  Ubiquitous Language (Traveler over pax/guest, Supplier, Quote/Quote Version,
  "record" instead of "entity") with consistent sentence case. English catalog
  copy only; ICU placeholders and en/ro key parity preserved.
- e2cb9f5: Bring the Romanian (ro) admin translations in line with the plain-language
  English copy pass — re-translating the updated strings so the Romanian UI drops
  the same jargon and reads as clearly as the English. Values only; en/ro key
  parity and ICU placeholders preserved.
- e2cb9f5: Align off-scale spacing utilities to the shared scale: gap-5 to gap-4, p-5 to
  p-6, space-y-5 to space-y-4, space-y-8 to space-y-6, p-10/p-12 to p-8, gap-8 to
  gap-6. Keeps spacing on the consistent 1/2/3/4/6/8 scale used across the app.
- e2cb9f5: Replace native browser dialogs with styled UI-package dialogs across the admin
  surface. Adds `confirmDialog`/`ConfirmDialogHost` and `promptDialog`/
  `PromptDialogHost` to `@voyant-travel/ui`, mounts both hosts once in the
  operator admin shell, and migrates every `window.confirm`/`window.prompt` call
  and stray `window.alert` in the `*-react` packages to the styled equivalents
  (destructive confirmations rendered with the destructive action variant). Also
  fixes the event-catalog "selected event contracts" count to use ICU plural
  formatting.
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
  - @voyant-travel/i18n@0.117.2
  - @voyant-travel/inventory-react@0.80.1
  - @voyant-travel/bookings-react@0.198.1
  - @voyant-travel/relationships-react@0.198.1
  - @voyant-travel/admin@0.129.1
  - @voyant-travel/ui@0.109.5
  - @voyant-travel/distribution@0.188.1

## 0.188.0

### Patch Changes

- @voyant-travel/relationships-react@0.198.0
- @voyant-travel/bookings-react@0.198.0
- @voyant-travel/inventory-react@0.80.0
- @voyant-travel/distribution@0.188.0

## 0.187.0

### Patch Changes

- @voyant-travel/distribution@0.187.0
- @voyant-travel/bookings-react@0.197.0
- @voyant-travel/relationships-react@0.197.0
- @voyant-travel/inventory-react@0.79.0

## 0.186.0

### Patch Changes

- Updated dependencies [71c08aa]
- Updated dependencies [bf548af]
  - @voyant-travel/distribution@0.186.0
  - @voyant-travel/bookings-react@0.196.0
  - @voyant-travel/inventory-react@0.78.0
  - @voyant-travel/relationships-react@0.196.0

## 0.185.1

### Patch Changes

- Updated dependencies [6b1e647]
  - @voyant-travel/i18n@0.117.1
  - @voyant-travel/distribution@0.185.1

## 0.185.0

### Patch Changes

- @voyant-travel/bookings-react@0.195.0
- @voyant-travel/distribution@0.185.0
- @voyant-travel/inventory-react@0.77.0
- @voyant-travel/relationships-react@0.195.0

## 0.184.0

### Patch Changes

- @voyant-travel/bookings-react@0.194.0
- @voyant-travel/distribution@0.184.0
- @voyant-travel/inventory-react@0.76.0
- @voyant-travel/relationships-react@0.194.0

## 0.183.0

### Patch Changes

- Updated dependencies [90d44c0]
  - @voyant-travel/admin@0.129.0
  - @voyant-travel/i18n@0.117.0
  - @voyant-travel/inventory-react@0.75.0
  - @voyant-travel/bookings-react@0.193.0
  - @voyant-travel/relationships-react@0.193.0
  - @voyant-travel/distribution@0.183.0

## 0.182.1

### Patch Changes

- @voyant-travel/distribution@0.182.1
- @voyant-travel/bookings-react@0.192.1

## 0.182.0

### Patch Changes

- @voyant-travel/bookings-react@0.192.0
- @voyant-travel/inventory-react@0.74.0
- @voyant-travel/relationships-react@0.192.0
- @voyant-travel/distribution@0.182.0

## 0.181.0

### Patch Changes

- @voyant-travel/bookings-react@0.191.0
- @voyant-travel/distribution@0.181.0
- @voyant-travel/inventory-react@0.73.0
- @voyant-travel/relationships-react@0.191.0

## 0.180.0

### Patch Changes

- Updated dependencies [f945310]
- Updated dependencies [fafc12e]
  - @voyant-travel/distribution@0.180.0
  - @voyant-travel/bookings-react@0.190.0
  - @voyant-travel/inventory-react@0.72.0
  - @voyant-travel/relationships-react@0.190.0

## 0.179.0

### Patch Changes

- @voyant-travel/bookings-react@0.189.0
- @voyant-travel/distribution@0.179.0
- @voyant-travel/inventory-react@0.71.0
- @voyant-travel/relationships-react@0.189.0

## 0.178.0

### Patch Changes

- @voyant-travel/distribution@0.178.0
- @voyant-travel/inventory-react@0.70.0
- @voyant-travel/relationships-react@0.188.0
- @voyant-travel/ui@0.109.4
- @voyant-travel/bookings-react@0.188.0

## 0.177.0

### Patch Changes

- Updated dependencies [0b7f213]
  - @voyant-travel/inventory-react@0.69.0
  - @voyant-travel/bookings-react@0.187.0
  - @voyant-travel/relationships-react@0.187.0
  - @voyant-travel/distribution@0.177.0

## 0.176.0

### Patch Changes

- Updated dependencies [5af8682]
  - @voyant-travel/inventory-react@0.68.0
  - @voyant-travel/bookings-react@0.186.0
  - @voyant-travel/relationships-react@0.186.0
  - @voyant-travel/distribution@0.176.0

## 0.175.0

### Patch Changes

- @voyant-travel/bookings-react@0.185.0
- @voyant-travel/distribution@0.175.0
- @voyant-travel/inventory-react@0.67.0
- @voyant-travel/relationships-react@0.185.0

## 0.174.0

### Patch Changes

- Updated dependencies [a33c590]
  - @voyant-travel/inventory-react@0.66.0
  - @voyant-travel/bookings-react@0.184.0
  - @voyant-travel/relationships-react@0.184.0
  - @voyant-travel/distribution@0.174.0

## 0.173.0

### Patch Changes

- @voyant-travel/bookings-react@0.183.0
- @voyant-travel/inventory-react@0.65.0
- @voyant-travel/relationships-react@0.183.0
- @voyant-travel/distribution@0.173.0

## 0.172.2

### Patch Changes

- Updated dependencies [f0f51b4]
  - @voyant-travel/i18n@0.116.0
  - @voyant-travel/admin@0.128.3
  - @voyant-travel/bookings-react@0.182.2
  - @voyant-travel/inventory-react@0.64.1
  - @voyant-travel/relationships-react@0.182.1
  - @voyant-travel/distribution@0.172.2

## 0.172.1

### Patch Changes

- @voyant-travel/distribution@0.172.1
- @voyant-travel/bookings-react@0.182.1

## 0.172.0

### Patch Changes

- @voyant-travel/bookings-react@0.182.0
- @voyant-travel/inventory-react@0.64.0
- @voyant-travel/relationships-react@0.182.0
- @voyant-travel/distribution@0.172.0

## 0.171.0

### Patch Changes

- Updated dependencies [464815c]
  - @voyant-travel/i18n@0.115.1
  - @voyant-travel/bookings-react@0.181.0
  - @voyant-travel/distribution@0.171.0
  - @voyant-travel/inventory-react@0.63.0
  - @voyant-travel/relationships-react@0.181.0

## 0.170.1

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/i18n@0.115.0
  - @voyant-travel/admin@0.128.2
  - @voyant-travel/bookings-react@0.180.1
  - @voyant-travel/inventory-react@0.62.1
  - @voyant-travel/relationships-react@0.180.1
  - @voyant-travel/distribution@0.170.1

## 0.170.0

### Patch Changes

- Updated dependencies [ecf1680]
  - @voyant-travel/i18n@0.114.0
  - @voyant-travel/bookings-react@0.180.0
  - @voyant-travel/inventory-react@0.62.0
  - @voyant-travel/admin@0.128.1
  - @voyant-travel/relationships-react@0.180.0
  - @voyant-travel/distribution@0.170.0

## 0.169.0

### Patch Changes

- @voyant-travel/bookings-react@0.179.0
- @voyant-travel/inventory-react@0.61.0
- @voyant-travel/relationships-react@0.179.0
- @voyant-travel/distribution@0.169.0

## 0.168.0

### Patch Changes

- Updated dependencies [2bcafc9]
  - @voyant-travel/admin@0.128.0
  - @voyant-travel/i18n@0.113.0
  - @voyant-travel/bookings-react@0.178.0
  - @voyant-travel/inventory-react@0.60.0
  - @voyant-travel/relationships-react@0.178.0
  - @voyant-travel/distribution@0.168.0

## 0.167.0

### Patch Changes

- @voyant-travel/distribution@0.167.0
- @voyant-travel/bookings-react@0.177.0
- @voyant-travel/inventory-react@0.59.0
- @voyant-travel/relationships-react@0.177.0

## 0.166.0

### Patch Changes

- @voyant-travel/distribution@0.166.0
- @voyant-travel/bookings-react@0.176.0
- @voyant-travel/inventory-react@0.58.0
- @voyant-travel/relationships-react@0.176.0

## 0.165.0

### Patch Changes

- @voyant-travel/bookings-react@0.175.0
- @voyant-travel/distribution@0.165.0
- @voyant-travel/inventory-react@0.57.0
- @voyant-travel/relationships-react@0.175.0

## 0.164.0

### Patch Changes

- @voyant-travel/distribution@0.164.0
- @voyant-travel/bookings-react@0.174.0
- @voyant-travel/inventory-react@0.56.0
- @voyant-travel/relationships-react@0.174.0

## 0.163.0

### Patch Changes

- @voyant-travel/bookings-react@0.173.0
- @voyant-travel/inventory-react@0.55.0
- @voyant-travel/relationships-react@0.173.0
- @voyant-travel/distribution@0.163.0

## 0.162.0

### Patch Changes

- @voyant-travel/bookings-react@0.172.0
- @voyant-travel/distribution@0.162.0
- @voyant-travel/inventory-react@0.54.0
- @voyant-travel/relationships-react@0.172.0
- @voyant-travel/ui@0.109.3

## 0.161.1

### Patch Changes

- @voyant-travel/distribution@0.161.1
- @voyant-travel/bookings-react@0.171.1

## 0.161.0

### Patch Changes

- @voyant-travel/bookings-react@0.171.0
- @voyant-travel/distribution@0.161.0
- @voyant-travel/inventory-react@0.53.0
- @voyant-travel/relationships-react@0.171.0

## 0.160.0

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/i18n@0.112.1
  - @voyant-travel/distribution@0.160.0
  - @voyant-travel/bookings-react@0.170.0
  - @voyant-travel/inventory-react@0.52.0
  - @voyant-travel/relationships-react@0.170.0

## 0.159.1

### Patch Changes

- @voyant-travel/distribution@0.159.1
- @voyant-travel/bookings-react@0.169.1

## 0.159.0

### Patch Changes

- Updated dependencies [a461920]
- Updated dependencies [a461920]
- Updated dependencies [590d256]
  - @voyant-travel/admin@0.127.0
  - @voyant-travel/distribution@0.159.0
  - @voyant-travel/bookings-react@0.169.0
  - @voyant-travel/inventory-react@0.51.0
  - @voyant-travel/relationships-react@0.169.0

## 0.158.0

### Patch Changes

- @voyant-travel/bookings-react@0.168.0
- @voyant-travel/distribution@0.158.0
- @voyant-travel/inventory-react@0.50.0
- @voyant-travel/relationships-react@0.168.0

## 0.157.0

### Patch Changes

- @voyant-travel/bookings-react@0.167.0
- @voyant-travel/distribution@0.157.0
- @voyant-travel/inventory-react@0.49.0
- @voyant-travel/relationships-react@0.167.0

## 0.156.0

### Patch Changes

- Updated dependencies [0868f18]
- Updated dependencies [3062a73]
  - @voyant-travel/admin@0.126.2
  - @voyant-travel/i18n@0.112.0
  - @voyant-travel/distribution@0.156.0
  - @voyant-travel/bookings-react@0.166.0
  - @voyant-travel/inventory-react@0.48.0
  - @voyant-travel/relationships-react@0.166.0

## 0.155.0

### Patch Changes

- @voyant-travel/bookings-react@0.165.0
- @voyant-travel/distribution@0.155.0
- @voyant-travel/inventory-react@0.47.0
- @voyant-travel/relationships-react@0.165.0

## 0.154.0

### Patch Changes

- @voyant-travel/bookings-react@0.164.0
- @voyant-travel/distribution@0.154.0
- @voyant-travel/inventory-react@0.46.0
- @voyant-travel/relationships-react@0.164.0

## 0.153.0

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/relationships-react@0.163.0
  - @voyant-travel/bookings-react@0.163.0
  - @voyant-travel/distribution@0.153.0
  - @voyant-travel/inventory-react@0.45.0

## 0.152.1

### Patch Changes

- 7a7fd97: Strengthen the internationalization platform across the operator and package UI.

  Add ICU message formatting, explicit locale and time-zone formatters, hierarchical
  locale fallback, validated runtime overrides, account-authoritative preferences,
  localized setup and navigation surfaces, and fail-closed catalog and UI-literal
  checks. Package message providers now accept an optional time zone and expose the
  shared formatting capabilities to package-owned UI.

- Updated dependencies [7a7fd97]
  - @voyant-travel/admin@0.126.1
  - @voyant-travel/bookings-react@0.162.2
  - @voyant-travel/i18n@0.111.3
  - @voyant-travel/inventory-react@0.44.1
  - @voyant-travel/relationships-react@0.162.1
  - @voyant-travel/distribution@0.152.1

## 0.152.0

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/distribution@0.152.0
  - @voyant-travel/bookings-react@0.162.0
  - @voyant-travel/inventory-react@0.44.0
  - @voyant-travel/relationships-react@0.162.0

## 0.151.0

### Patch Changes

- Updated dependencies [c1e37f2]
  - @voyant-travel/admin@0.126.0
  - @voyant-travel/bookings-react@0.161.0
  - @voyant-travel/inventory-react@0.43.0
  - @voyant-travel/relationships-react@0.161.0
  - @voyant-travel/distribution@0.151.0

## 0.150.0

### Patch Changes

- Updated dependencies [372f4f4]
- Updated dependencies [6c8d46a]
  - @voyant-travel/distribution@0.150.0
  - @voyant-travel/bookings-react@0.160.0
  - @voyant-travel/inventory-react@0.42.0
  - @voyant-travel/relationships-react@0.160.0

## 0.149.0

### Patch Changes

- 766d24b: Associate admin form controls with visible labels and validation messages, and add accessible names to phone, channel, product translation, tag, action-menu, and channel-assignment helpers.
- Updated dependencies [766d24b]
- Updated dependencies [7e9f77a]
- Updated dependencies [49f55d0]
- Updated dependencies [82ffd12]
- Updated dependencies [6147b93]
- Updated dependencies [b459761]
  - @voyant-travel/ui@0.109.2
  - @voyant-travel/inventory-react@0.41.0
  - @voyant-travel/admin@0.125.0
  - @voyant-travel/bookings-react@0.159.0
  - @voyant-travel/relationships-react@0.159.0
  - @voyant-travel/distribution@0.149.0

## 0.148.0

### Minor Changes

- 73ab096: Standardize first-party packages on package-owned deployment manifests, provider selection,
  access metadata, concrete event contracts, selected admin navigation, and published runtime
  references. Add Bookings Extras as an independently selected graph unit and remove the central
  admin navigation catalog.
  Link facets now distinguish entity `linkable` metadata from executable `definition` exports, and
  generated Node registries reject malformed definitions before service registration.
  Provider-owned required config and secrets now apply only when that provider is selected, so
  local and in-memory deployments do not require credentials for inactive remote providers.

### Patch Changes

- Updated dependencies [73ab096]
  - @voyant-travel/admin@0.124.0
  - @voyant-travel/bookings-react@0.158.0
  - @voyant-travel/distribution@0.148.0
  - @voyant-travel/inventory-react@0.40.0
  - @voyant-travel/relationships-react@0.158.0

## 0.147.0

### Patch Changes

- @voyant-travel/bookings-react@0.157.0
- @voyant-travel/inventory-react@0.39.0
- @voyant-travel/relationships-react@0.157.0
- @voyant-travel/distribution@0.147.0

## 0.146.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
  - @voyant-travel/admin@0.123.3
  - @voyant-travel/bookings-react@0.156.1
  - @voyant-travel/distribution@0.146.1
  - @voyant-travel/i18n@0.111.1
  - @voyant-travel/inventory-react@0.38.1
  - @voyant-travel/react@0.104.2
  - @voyant-travel/relationships-react@0.156.1
  - @voyant-travel/ui@0.109.1

## 0.146.0

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/bookings-react@0.156.0
  - @voyant-travel/i18n@0.111.0
  - @voyant-travel/distribution@0.146.0
  - @voyant-travel/inventory-react@0.38.0
  - @voyant-travel/admin@0.123.2
  - @voyant-travel/relationships-react@0.156.0

## 0.145.1

### Patch Changes

- @voyant-travel/distribution@0.145.1
- @voyant-travel/bookings-react@0.155.1

## 0.145.0

### Patch Changes

- @voyant-travel/distribution@0.145.0
- @voyant-travel/bookings-react@0.155.0
- @voyant-travel/inventory-react@0.37.0
- @voyant-travel/relationships-react@0.155.0

## 0.144.0

### Patch Changes

- Updated dependencies [8bd906f]
  - @voyant-travel/ui@0.109.0
  - @voyant-travel/distribution@0.144.0
  - @voyant-travel/admin@0.123.0
  - @voyant-travel/bookings-react@0.154.0
  - @voyant-travel/inventory-react@0.36.0
  - @voyant-travel/relationships-react@0.154.0

## 0.143.0

### Patch Changes

- 490d132: Move standard first-party admin factories, package copy, slots, contributions, and icons into selected deployment graph composition.
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
  - @voyant-travel/distribution@0.143.0
  - @voyant-travel/bookings-react@0.153.0
  - @voyant-travel/admin@0.122.0
  - @voyant-travel/relationships-react@0.153.0
  - @voyant-travel/inventory-react@0.35.0

## 0.142.0

### Patch Changes

- Updated dependencies [d771be3]
- Updated dependencies [8f537b0]
- Updated dependencies [d771be3]
- Updated dependencies [d771be3]
  - @voyant-travel/distribution@0.142.0
  - @voyant-travel/admin@0.121.0
  - @voyant-travel/relationships-react@0.152.0
  - @voyant-travel/bookings-react@0.152.0
  - @voyant-travel/inventory-react@0.34.0

## 0.141.5

### Patch Changes

- Updated dependencies [e5aa097]
- Updated dependencies [62b68aa]
  - @voyant-travel/distribution@0.141.5
  - @voyant-travel/bookings-react@0.151.5

## 0.141.4

### Patch Changes

- @voyant-travel/distribution@0.141.4
- @voyant-travel/bookings-react@0.151.4

## 0.141.3

### Patch Changes

- @voyant-travel/distribution@0.141.3
- @voyant-travel/bookings-react@0.151.3

## 0.141.2

### Patch Changes

- @voyant-travel/distribution@0.141.2
- @voyant-travel/bookings-react@0.151.2

## 0.141.1

### Patch Changes

- Updated dependencies [e4e6621]
  - @voyant-travel/distribution@0.141.1
  - @voyant-travel/bookings-react@0.151.1

## 0.141.0

### Patch Changes

- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/distribution@0.141.0
  - @voyant-travel/inventory-react@0.33.0
  - @voyant-travel/bookings-react@0.151.0
  - @voyant-travel/relationships-react@0.151.0

## 0.140.0

### Patch Changes

- @voyant-travel/bookings-react@0.150.0
- @voyant-travel/distribution@0.140.0
- @voyant-travel/inventory-react@0.32.0
- @voyant-travel/relationships-react@0.150.0

## 0.139.1

### Patch Changes

- Updated dependencies [5e1d221]
  - @voyant-travel/distribution@0.139.1
  - @voyant-travel/bookings-react@0.149.1

## 0.139.0

### Patch Changes

- Updated dependencies [a97e845]
  - @voyant-travel/admin@0.120.0
  - @voyant-travel/bookings-react@0.149.0
  - @voyant-travel/inventory-react@0.31.0
  - @voyant-travel/relationships-react@0.149.0
  - @voyant-travel/distribution@0.139.0

## 0.138.0

### Patch Changes

- Updated dependencies [8a665f3]
  - @voyant-travel/admin@0.119.0
  - @voyant-travel/bookings-react@0.148.0
  - @voyant-travel/inventory-react@0.30.0
  - @voyant-travel/relationships-react@0.148.0
  - @voyant-travel/distribution@0.138.0

## 0.137.0

### Patch Changes

- @voyant-travel/admin@0.118.0
- @voyant-travel/bookings-react@0.147.0
- @voyant-travel/inventory-react@0.29.0
- @voyant-travel/relationships-react@0.147.0
- @voyant-travel/distribution@0.137.0

## 0.136.0

### Patch Changes

- Updated dependencies [ecdf0fc]
  - @voyant-travel/admin@0.117.0
  - @voyant-travel/bookings-react@0.146.0
  - @voyant-travel/inventory-react@0.28.0
  - @voyant-travel/relationships-react@0.146.0
  - @voyant-travel/distribution@0.136.0

## 0.135.0

### Patch Changes

- @voyant-travel/distribution@0.135.0
- @voyant-travel/bookings-react@0.145.0
- @voyant-travel/inventory-react@0.27.0
- @voyant-travel/relationships-react@0.145.0

## 0.134.0

### Patch Changes

- @voyant-travel/bookings-react@0.144.0
- @voyant-travel/distribution@0.134.0
- @voyant-travel/inventory-react@0.26.0
- @voyant-travel/relationships-react@0.144.0

## 0.133.0

### Patch Changes

- @voyant-travel/inventory-react@0.25.0
- @voyant-travel/relationships-react@0.143.0
- @voyant-travel/ui@0.108.11
- @voyant-travel/distribution@0.133.0
- @voyant-travel/bookings-react@0.143.0

## 0.132.0

### Patch Changes

- Updated dependencies [ee09a7f]
  - @voyant-travel/distribution@0.132.0
  - @voyant-travel/bookings-react@0.142.0
  - @voyant-travel/inventory-react@0.24.0
  - @voyant-travel/relationships-react@0.142.0

## 0.131.0

### Patch Changes

- @voyant-travel/distribution@0.131.0
- @voyant-travel/bookings-react@0.141.0
- @voyant-travel/inventory-react@0.23.0
- @voyant-travel/relationships-react@0.141.0

## 0.130.0

### Patch Changes

- Updated dependencies [62e87ee]
  - @voyant-travel/admin@0.116.0
  - @voyant-travel/i18n@0.110.0
  - @voyant-travel/bookings-react@0.140.0
  - @voyant-travel/inventory-react@0.22.0
  - @voyant-travel/relationships-react@0.140.0
  - @voyant-travel/distribution@0.130.0

## 0.129.0

### Minor Changes

- a45a0d3: Add supplier detail management for API-backed contact points, named contacts, addresses, availability, and contracts.

### Patch Changes

- 2613dfb: Replace native date inputs with shared date picker components in supplier and relationship UI.
- f3b8bef: Reject supplier default currency values unless they are exactly three uppercase letters.
- fcad28b: Reject reversed supplier rate and contract ranges. Rate date and pax bounds must be ordered, contract end dates must not precede start dates, and renewal dates must stay within bounded contract terms.

  Supplier UI forms now block those invalid ranges and persisted invalid rate rows are flagged in the rate table.

- Updated dependencies [2613dfb]
- Updated dependencies [92e170a]
- Updated dependencies [f3b8bef]
- Updated dependencies [13f21a1]
- Updated dependencies [9f29b74]
- Updated dependencies [fcad28b]
  - @voyant-travel/relationships-react@0.139.0
  - @voyant-travel/distribution@0.129.0
  - @voyant-travel/admin@0.115.4
  - @voyant-travel/bookings-react@0.139.0
  - @voyant-travel/inventory-react@0.21.0

## 0.128.4

### Patch Changes

- Updated dependencies [f1090b7]
- Updated dependencies [42f662c]
  - @voyant-travel/i18n@0.109.8
  - @voyant-travel/distribution@0.128.4
  - @voyant-travel/bookings-react@0.138.6

## 0.128.3

### Patch Changes

- Updated dependencies [b254511]
- Updated dependencies [141bd2b]
  - @voyant-travel/bookings-react@0.138.5
  - @voyant-travel/ui@0.108.10
  - @voyant-travel/distribution@0.128.3

## 0.128.2

### Patch Changes

- Updated dependencies [3cacf39]
- Updated dependencies [3757b75]
  - @voyant-travel/distribution@0.128.2
  - @voyant-travel/bookings-react@0.138.1

## 0.128.1

### Patch Changes

- bd59b12: Surface actionable channel sync retry and reconcile outcomes in the operator UI.
- Updated dependencies [bd59b12]
  - @voyant-travel/distribution@0.128.1

## 0.128.0

### Patch Changes

- Updated dependencies [2325c93]
  - @voyant-travel/distribution@0.128.0
  - @voyant-travel/bookings-react@0.138.0
  - @voyant-travel/inventory-react@0.20.0
  - @voyant-travel/relationships-react@0.138.0

## 0.127.3

### Patch Changes

- 14845ee: Rename the operator Channel sync surface to Distribution and clarify setup, monitoring, retry, reconcile, and delivery messaging.
- Updated dependencies [14845ee]
  - @voyant-travel/i18n@0.109.6
  - @voyant-travel/distribution@0.127.3

## 0.127.2

### Patch Changes

- ddab21f: Point the channel sync UI at the package-owned channel-push admin routes for links, throttling, deliveries, retry, and reconcile requests.
  - @voyant-travel/distribution@0.127.2

## 0.127.1

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/bookings-react@0.137.1
  - @voyant-travel/inventory-react@0.19.1
  - @voyant-travel/distribution@0.127.1

## 0.127.0

### Patch Changes

- @voyant-travel/distribution@0.127.0
- @voyant-travel/bookings-react@0.137.0
- @voyant-travel/inventory-react@0.19.0
- @voyant-travel/relationships-react@0.137.0

## 0.126.2

### Patch Changes

- 12a1eb2: Expose client-safe subpaths for validation schemas, linkable metadata, template authoring metadata, finance payment-policy primitives, and Hono reporter utilities. Move browser-facing React/operator imports off mixed runtime barrels so client bundles do not pull Hono request context or other server-only runtime code.
- Updated dependencies [12a1eb2]
  - @voyant-travel/distribution@0.126.2
  - @voyant-travel/inventory-react@0.18.2
  - @voyant-travel/bookings-react@0.136.2

## 0.126.1

### Patch Changes

- Updated dependencies [7cb6fa7]
  - @voyant-travel/i18n@0.109.0
  - @voyant-travel/admin@0.115.2
  - @voyant-travel/bookings-react@0.136.1
  - @voyant-travel/inventory-react@0.18.1
  - @voyant-travel/relationships-react@0.136.1
  - @voyant-travel/ui@0.108.2
  - @voyant-travel/distribution@0.126.1

## 0.126.0

### Patch Changes

- @voyant-travel/bookings-react@0.136.0
- @voyant-travel/inventory-react@0.18.0
- @voyant-travel/relationships-react@0.136.0
- @voyant-travel/distribution@0.126.0

## 0.125.0

### Patch Changes

- @voyant-travel/bookings-react@0.135.0
- @voyant-travel/inventory-react@0.17.0
- @voyant-travel/relationships-react@0.135.0
- @voyant-travel/distribution@0.125.0

## 0.124.1

### Patch Changes

- @voyant-travel/distribution@0.124.1
- @voyant-travel/bookings-react@0.134.1

## 0.124.0

### Minor Changes

- 51f7dea: Share one list-response contract instead of per-module copies (voyant#2109).

  `@voyant-travel/types` now owns the canonical offset-paginated list envelope: the `ListResponse<T>` type + `listResponse(data, { total, limit, offset })` builder, plus the zod `paginationSchema` (coerced `limit` 1–200 default 50, `offset` ≥0 default 0) and the `listResponseSchema(item)` factory. Both server services and `*-react` clients import from this single source.

  Server side: every module's local `paginate()` / inline `{ data, total, limit, offset }` construction now routes through the shared `listResponse` builder, and the count read is standardized on `count` internally — fixing the drift where finance, notifications and the legal contracts/policies services read `countResult[0]?.total` while every other module read `countResult[0]?.count` (their `count(*)` selects were aliased `total`; they are now aliased `count`). The returned shape is byte-for-byte identical.

  Client side: the ~23 copied `paginatedEnvelope` zod schemas across the `*-react` packages are replaced by re-exporting the shared `listResponseSchema` factory under the same `paginatedEnvelope` name, so consumers are unchanged.

  Input alignment: `finance-contracts` and `legal-contracts` pagination `limit` caps were raised from `.max(100)` to `.max(200)` to match the framework-wide max.

  Additive and non-breaking.

### Patch Changes

- Updated dependencies [51f7dea]
  - @voyant-travel/distribution@0.124.0
  - @voyant-travel/bookings-react@0.134.0
  - @voyant-travel/inventory-react@0.16.0
  - @voyant-travel/relationships-react@0.134.0
  - @voyant-travel/admin@0.115.1

## 0.123.0

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/admin@0.115.0
  - @voyant-travel/i18n@0.108.0
  - @voyant-travel/distribution@0.123.0
  - @voyant-travel/bookings-react@0.133.0
  - @voyant-travel/inventory-react@0.15.0
  - @voyant-travel/relationships-react@0.133.0
  - @voyant-travel/ui@0.108.1

## 0.122.0

### Patch Changes

- @voyant-travel/bookings-react@0.132.0
- @voyant-travel/distribution@0.122.0
- @voyant-travel/inventory-react@0.14.0
- @voyant-travel/relationships-react@0.132.0

## 0.121.1

### Patch Changes

- @voyant-travel/distribution@0.121.1
- @voyant-travel/bookings-react@0.131.1

## 0.121.0

### Patch Changes

- Updated dependencies [310565b]
  - @voyant-travel/i18n@0.107.3
  - @voyant-travel/bookings-react@0.131.0
  - @voyant-travel/inventory-react@0.13.0
  - @voyant-travel/relationships-react@0.131.0
  - @voyant-travel/distribution@0.121.0

## 0.120.0

### Patch Changes

- Updated dependencies [dbea53e]
  - @voyant-travel/i18n@0.107.2
  - @voyant-travel/bookings-react@0.130.0
  - @voyant-travel/inventory-react@0.12.0
  - @voyant-travel/relationships-react@0.130.0
  - @voyant-travel/distribution@0.120.0

## 0.119.1

### Patch Changes

- Updated dependencies [e014a02]
  - @voyant-travel/distribution@0.119.1

## 0.119.0

### Patch Changes

- @voyant-travel/distribution@0.119.0
- @voyant-travel/bookings-react@0.129.0
- @voyant-travel/inventory-react@0.11.0
- @voyant-travel/relationships-react@0.129.0

## 0.118.0

### Patch Changes

- @voyant-travel/inventory-react@0.10.0
- @voyant-travel/bookings-react@0.128.0
- @voyant-travel/relationships-react@0.128.0
- @voyant-travel/distribution@0.118.0

## 0.117.0

### Patch Changes

- @voyant-travel/bookings-react@0.127.0
- @voyant-travel/distribution@0.117.0
- @voyant-travel/inventory-react@0.9.0
- @voyant-travel/relationships-react@0.127.0

## 0.116.1

### Patch Changes

- Updated dependencies [1841ce2]
  - @voyant-travel/distribution@0.116.1

## 0.116.0

### Patch Changes

- @voyant-travel/bookings-react@0.126.0
- @voyant-travel/inventory-react@0.8.0
- @voyant-travel/relationships-react@0.126.0
- @voyant-travel/distribution@0.116.0

## 0.115.0

### Patch Changes

- Updated dependencies [a74471e]
- Updated dependencies [a74471e]
  - @voyant-travel/i18n@0.107.0
  - @voyant-travel/ui@0.108.0
  - @voyant-travel/admin@0.114.0
  - @voyant-travel/bookings-react@0.125.0
  - @voyant-travel/inventory-react@0.7.0
  - @voyant-travel/relationships-react@0.125.0
  - @voyant-travel/distribution@0.115.0

## 0.114.0

### Patch Changes

- 4f92198: Voyant 1.0 visual refactor of the framework UI.

  - **Tokens** (`@voyant-travel/ui` `globals.css`): warm off-white paper, near-black ink, and a single hot-orange brand accent (`--brand`, new token) reserved for charts/focus/active state. Inter Tight type. Fixed brand chart palette (`--chart-1..5`). A coherent radius system: controls + their dropdowns at `rounded-sm` (4px), cards/table surfaces at `rounded-md` (6px), dialogs/sheets at `rounded-xl`.
  - **`@voyant-travel/ui` components**: new `SegmentedControl`; `Button` gains a `brand` variant; sharper, consistent radii across Button/Input/Select/Combobox/Textarea/Toggle/Tabs/Menus/Command/Card/DataTable/Badge; bordered active sidebar items (primary + sub) and inset-panel border; assorted fixes (Command search-input radius, toggle-group corners, sidebar sub-menu spacing).
  - **`@voyant-travel/admin`**: Voyant 1.0 brand logo lockup (composed mark + wordmark, collapse-to-badge); operator shell defaults to the inset sidebar layout; dashboard KPI cards, brand chart colors, and Figma-matched sidebar (bordered active item, near-black nav text, bordered user card with open-state).
  - **Domain `*-react` packages**: card surfaces normalized to the new `rounded-md` radius; flights search bar (trip-type toggle, route cards, airport dropdown) and the resources tabs aligned to the system.

- Updated dependencies [4f92198]
  - @voyant-travel/ui@0.107.0
  - @voyant-travel/admin@0.113.0
  - @voyant-travel/inventory-react@0.6.0
  - @voyant-travel/bookings-react@0.124.0
  - @voyant-travel/relationships-react@0.124.0
  - @voyant-travel/distribution@0.114.0

## 0.113.0

### Patch Changes

- Updated dependencies [94890c3]
- Updated dependencies [cb9b04b]
  - @voyant-travel/admin@0.112.0
  - @voyant-travel/bookings-react@0.123.0
  - @voyant-travel/inventory-react@0.5.0
  - @voyant-travel/relationships-react@0.123.0
  - @voyant-travel/distribution@0.113.0

## 0.112.2

### Patch Changes

- Updated dependencies [027347f]
  - @voyant-travel/distribution@0.112.2

## 0.112.1

### Patch Changes

- Updated dependencies [62b712a]
  - @voyant-travel/distribution@0.112.1

## 0.112.0

### Patch Changes

- @voyant-travel/inventory-react@0.4.0
- @voyant-travel/bookings-react@0.122.0
- @voyant-travel/relationships-react@0.122.0
- @voyant-travel/distribution@0.112.0

## 0.111.0

### Patch Changes

- @voyant-travel/distribution@0.111.0
- @voyant-travel/inventory-react@0.3.0
- @voyant-travel/bookings-react@0.121.0
- @voyant-travel/relationships-react@0.121.0

## 0.110.5

### Patch Changes

- ecec979: Improve operator bundle boundaries by adding route-local admin message provider support, exposing admin extension route helpers, keeping pending skeletons structural, and tightening Vite route ignores and vendor chunk splitting so heavy admin route dependencies stay out of the initial entry.
- Updated dependencies [ecec979]
  - @voyant-travel/admin@0.111.3
  - @voyant-travel/bookings-react@0.120.3
  - @voyant-travel/inventory-react@0.2.2
  - @voyant-travel/relationships-react@0.120.2
  - @voyant-travel/distribution@0.110.5

## 0.110.4

### Patch Changes

- eef1a00: Republish notification and UI consumer packages so stale beta artifacts no longer reference legacy notification package specifiers.
- Updated dependencies [eef1a00]
  - @voyant-travel/admin@0.111.2
  - @voyant-travel/bookings-react@0.120.1
  - @voyant-travel/inventory-react@0.2.1
  - @voyant-travel/relationships-react@0.120.1
  - @voyant-travel/distribution@0.110.4

## 0.110.3

### Patch Changes

- Updated dependencies [28898ad]
  - @voyant-travel/distribution@0.110.3
  - @voyant-travel/ui@0.106.2

## 0.110.2

### Patch Changes

- @voyant-travel/distribution@0.110.2

## 0.110.1

### Patch Changes

- @voyant-travel/distribution@0.110.1

## 0.110.0

### Minor Changes

- 3e160d3: Move supplier and external-reference runtime and React implementation under
  Distribution owner paths. The old supplier and external-ref package names are
  removed from v1 while operator runtime and legal schema imports use
  Distribution-owned surfaces.

### Patch Changes

- 47fef18: Retarget first-party imports from the removed beta package names to their owner
  packages. Operated product UI now imports Inventory React, commercial UI imports
  Commerce React, supplier UI imports Distribution React, checkout UI imports
  Finance React, and operated place/availability schema references import
  Operations owner paths.
- Updated dependencies [dd71543]
- Updated dependencies [081e310]
- Updated dependencies [eb17d3d]
- Updated dependencies [3cc83b6]
- Updated dependencies [44c3875]
- Updated dependencies [3408b2a]
- Updated dependencies [3e160d3]
- Updated dependencies [65b3782]
- Updated dependencies [a101971]
- Updated dependencies [47fef18]
  - @voyant-travel/admin@0.111.1
  - @voyant-travel/distribution@0.110.0
  - @voyant-travel/inventory-react@0.2.0
  - @voyant-travel/bookings-react@0.120.0
  - @voyant-travel/relationships-react@0.120.0

## 0.109.8

### Patch Changes

- 9162394: Split oversized distribution service, route, booking-push, integration test, and channel sync UI modules into smaller focused files while preserving existing behavior and exports.
- Updated dependencies [9162394]
  - @voyant-travel/distribution@0.109.8

## 0.109.7

### Patch Changes

- Updated dependencies [a224ef6]
  - @voyant-travel/distribution@0.109.7

## 0.109.6

### Patch Changes

- @voyant-travel/distribution@0.109.6

## 0.109.5

### Patch Changes

- @voyant-travel/distribution@0.109.5
- @voyant-travel/ui@0.106.1

## 0.109.4

### Patch Changes

- @voyant-travel/distribution@0.109.4

## 0.109.3

### Patch Changes

- @voyant-travel/distribution@0.109.3

## 0.109.2

### Patch Changes

- @voyant-travel/distribution@0.109.2

## 0.109.1

### Patch Changes

- @voyant-travel/distribution@0.109.1

## 0.109.0

### Patch Changes

- Updated dependencies [41b08db]
  - @voyant-travel/admin@0.111.0
  - @voyant-travel/distribution@0.109.0

## 0.108.0

### Minor Changes

- f7bd971: Three more operator surfaces become package-delivered admin contributions (packaged-admin RFC §4.8):

  - `@voyant-travel/flights-react/admin` (new entry): `createFlightsAdminExtension` ships the flight search page and the booking wizard as full route contributions — package-owned search contracts (`flightsIndexSearchSchema`, `flightsBookSearchSchema`), lazy page modules, and semantic destinations (`flight.search` route-backed; `flightBooking.start` declared for the host's hand-written resolver; post-booking lands on the shared `booking.detail`). The wizard mounts as a flat sibling of the search route, reproducing the old file-based `flights_.book` section-chrome escape exactly.
  - `@voyant-travel/distribution-react/admin` (new entry): `createDistributionAdminExtension` ships the channel-sync page as a lazy route contribution; the page reads `baseUrl` + credentialed fetcher from the shared provider context, so the host needs no props and no route file.
  - `@voyant-travel/finance-react/admin`: the two supplier-invoices contributions graduate from metadata-only to full implementations. The previously app-owned wiring travels package-side: attachment uploads post to the template-level `/v1/uploads` through the finance provider context (the `BookingInvoicesWidget` precedent), inline supplier creation rides `useSupplierMutation().create` from `@voyant-travel/suppliers-react`, and the allocation dialog's cross-domain target search composes `getProductsQueryOptions` / `getBookingsQueryOptions` / `getSlotsQueryOptions` through the same context client (new optional peers: `@voyant-travel/products-react`, `@voyant-travel/availability-react`). New route-backed destinations: `supplierInvoice.list`, `supplierInvoice.detail`.

### Patch Changes

- @voyant-travel/distribution@0.108.0

## 0.107.3

### Patch Changes

- @voyant-travel/distribution@0.107.3

## 0.107.2

### Patch Changes

- @voyant-travel/distribution@0.107.2

## 0.107.1

### Patch Changes

- @voyant-travel/distribution@0.107.1

## 0.107.0

### Minor Changes

- 6c27159: Merge each module's `*-ui` package into its `*-react` sibling (#1652). The
  `*-react` package is now the whole client tier: the headless exports (root,
  `./hooks`, `./client`, `./provider`) are unchanged, and the styled tier moves
  in under new subpaths — `./ui` (the old `*-ui` root barrel), `./components/*`,
  `./admin`, `./i18n`, `./i18n/en`, `./i18n/ro`, and `./styles.css`.

  Migration from `@voyant-travel/<module>-ui`:

  - `@voyant-travel/<module>-ui` → `@voyant-travel/<module>-react/ui`
  - `@voyant-travel/<module>-ui/<subpath>` → `@voyant-travel/<module>-react/<subpath>`
  - package.json: drop the `-ui` dependency; `-react` covers both tiers.

  Styled-tier peers (`@voyant-travel/ui`, `@voyant-travel/admin`, `@tanstack/react-table`,
  `sonner`, `react-hook-form`, sibling `*-react` hooks packages) are optional
  peers — headless consumers that only import the root/`hooks`/`client` subpaths
  do not need them. The 27 `@voyant-travel/*-ui` packages are deprecated on npm in
  favor of these subpaths; `@voyant-travel/allocation-ui` and
  `@voyant-travel/workflow-runs-ui` (no `-react` sibling) are unaffected.

### Patch Changes

- @voyant-travel/distribution@0.107.0

## 0.106.0

### Patch Changes

- @voyant-travel/distribution@0.106.0

## 0.105.2

### Patch Changes

- @voyant-travel/distribution@0.105.2

## 0.105.1

### Patch Changes

- @voyant-travel/distribution@0.105.1

## 0.105.0

### Patch Changes

- @voyant-travel/distribution@0.105.0

## 0.104.3

### Patch Changes

- @voyant-travel/distribution@0.104.3

## 0.104.2

### Patch Changes

- @voyant-travel/distribution@0.104.2

## 0.104.1

### Patch Changes

- @voyant-travel/distribution@0.104.1
- @voyant-travel/react@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/distribution@0.104.0
- @voyant-travel/react@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/distribution@0.103.0
- @voyant-travel/react@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/distribution@0.102.0
- @voyant-travel/react@0.102.0

## 0.101.2

### Patch Changes

- @voyant-travel/distribution@0.101.2
- @voyant-travel/react@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/distribution@0.101.1
- @voyant-travel/react@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/distribution@0.101.0
- @voyant-travel/react@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/distribution@0.100.0
- @voyant-travel/react@0.100.0

## 0.99.0

### Patch Changes

- @voyant-travel/distribution@0.99.0
- @voyant-travel/react@0.99.0

## 0.98.0

### Patch Changes

- @voyant-travel/distribution@0.98.0
- @voyant-travel/react@0.98.0

## 0.97.0

### Patch Changes

- @voyant-travel/distribution@0.97.0
- @voyant-travel/react@0.97.0

## 0.96.0

### Patch Changes

- @voyant-travel/distribution@0.96.0
- @voyant-travel/react@0.96.0

## 0.95.0

### Patch Changes

- @voyant-travel/distribution@0.95.0
- @voyant-travel/react@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/distribution@0.94.0
- @voyant-travel/react@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/distribution@0.93.0
- @voyant-travel/react@0.93.0

## 0.92.0

### Patch Changes

- @voyant-travel/distribution@0.92.0
- @voyant-travel/react@0.92.0

## 0.91.0

### Patch Changes

- @voyant-travel/distribution@0.91.0
- @voyant-travel/react@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/distribution@0.90.0
- @voyant-travel/react@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/distribution@0.89.0
- @voyant-travel/react@0.89.0

## 0.88.0

### Patch Changes

- @voyant-travel/distribution@0.88.0
- @voyant-travel/react@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/distribution@0.87.1
- @voyant-travel/react@0.87.1

## 0.87.0

### Patch Changes

- @voyant-travel/distribution@0.87.0
- @voyant-travel/react@0.87.0

## 0.86.0

### Patch Changes

- @voyant-travel/distribution@0.86.0
- @voyant-travel/react@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/distribution@0.85.4
- @voyant-travel/react@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/distribution@0.85.3
- @voyant-travel/react@0.85.3

## 0.85.2

### Patch Changes

- @voyant-travel/distribution@0.85.2
- @voyant-travel/react@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/distribution@0.85.1
- @voyant-travel/react@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/distribution@0.85.0
- @voyant-travel/react@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/distribution@0.84.4
- @voyant-travel/react@0.84.4

## 0.84.3

### Patch Changes

- @voyant-travel/distribution@0.84.3
- @voyant-travel/react@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/distribution@0.84.2
- @voyant-travel/react@0.84.2

## 0.84.1

### Patch Changes

- @voyant-travel/distribution@0.84.1
- @voyant-travel/react@0.84.1

## 0.84.0

### Patch Changes

- @voyant-travel/distribution@0.84.0
- @voyant-travel/react@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/distribution@0.83.1
- @voyant-travel/react@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/distribution@0.83.0
- @voyant-travel/react@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/distribution@0.82.1
- @voyant-travel/react@0.82.1

## 0.82.0

### Patch Changes

- @voyant-travel/distribution@0.82.0
- @voyant-travel/react@0.82.0

## 0.81.21

### Patch Changes

- @voyant-travel/distribution@0.81.21
- @voyant-travel/react@0.81.21

## 0.81.20

### Patch Changes

- @voyant-travel/distribution@0.81.20
- @voyant-travel/react@0.81.20

## 0.81.19

### Patch Changes

- @voyant-travel/distribution@0.81.19
- @voyant-travel/react@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/distribution@0.81.18
- @voyant-travel/react@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/distribution@0.81.17
- @voyant-travel/react@0.81.17

## 0.81.16

### Patch Changes

- @voyant-travel/distribution@0.81.16
- @voyant-travel/react@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/distribution@0.81.15
- @voyant-travel/react@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/distribution@0.81.14
- @voyant-travel/react@0.81.14

## 0.81.13

### Patch Changes

- @voyant-travel/distribution@0.81.13
- @voyant-travel/react@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/distribution@0.81.12
- @voyant-travel/react@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/distribution@0.81.11
- @voyant-travel/react@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/distribution@0.81.10
- @voyant-travel/react@0.81.10

## 0.81.9

### Patch Changes

- @voyant-travel/distribution@0.81.9
- @voyant-travel/react@0.81.9

## 0.81.8

### Patch Changes

- @voyant-travel/distribution@0.81.8
- @voyant-travel/react@0.81.8

## 0.81.7

### Patch Changes

- @voyant-travel/distribution@0.81.7
- @voyant-travel/react@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/distribution@0.81.6
- @voyant-travel/react@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/distribution@0.81.5
- @voyant-travel/react@0.81.5

## 0.81.4

### Patch Changes

- @voyant-travel/distribution@0.81.4
- @voyant-travel/react@0.81.4

## 0.81.3

### Patch Changes

- @voyant-travel/distribution@0.81.3
- @voyant-travel/react@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/distribution@0.81.2
- @voyant-travel/react@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/distribution@0.81.1
- @voyant-travel/react@0.81.1

## 0.81.0

### Patch Changes

- @voyant-travel/distribution@0.81.0
- @voyant-travel/react@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/distribution@0.80.18
- @voyant-travel/react@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/distribution@0.80.17
- @voyant-travel/react@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/distribution@0.80.16
- @voyant-travel/react@0.80.16

## 0.80.15

### Patch Changes

- @voyant-travel/distribution@0.80.15
- @voyant-travel/react@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/distribution@0.80.14
- @voyant-travel/react@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/distribution@0.80.13
- @voyant-travel/react@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/distribution@0.80.12
- @voyant-travel/react@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/distribution@0.80.11
- @voyant-travel/react@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/distribution@0.80.10
- @voyant-travel/react@0.80.10

## 0.80.9

### Patch Changes

- @voyant-travel/distribution@0.80.9
- @voyant-travel/react@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/distribution@0.80.8
- @voyant-travel/react@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/distribution@0.80.7
- @voyant-travel/react@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/distribution@0.80.6
- @voyant-travel/react@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/distribution@0.80.5
- @voyant-travel/react@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/distribution@0.80.4
- @voyant-travel/react@0.80.4

## 0.80.3

### Patch Changes

- @voyant-travel/distribution@0.80.3
- @voyant-travel/react@0.80.3

## 0.80.2

### Patch Changes

- @voyant-travel/distribution@0.80.2
- @voyant-travel/react@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/distribution@0.80.1
- @voyant-travel/react@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/distribution@0.80.0
- @voyant-travel/react@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/distribution@0.79.0
- @voyant-travel/react@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/distribution@0.78.0
- @voyant-travel/react@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/distribution@0.77.13
- @voyant-travel/react@0.77.13

## 0.77.12

### Patch Changes

- @voyant-travel/distribution@0.77.12
- @voyant-travel/react@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/distribution@0.77.11
- @voyant-travel/react@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/distribution@0.77.10
- @voyant-travel/react@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/distribution@0.77.9
- @voyant-travel/react@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/distribution@0.77.8
- @voyant-travel/react@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/distribution@0.77.7
- @voyant-travel/react@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/distribution@0.77.6
- @voyant-travel/react@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/distribution@0.77.5
- @voyant-travel/react@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/distribution@0.77.4
- @voyant-travel/react@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/distribution@0.77.3
- @voyant-travel/react@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/distribution@0.77.2
- @voyant-travel/react@0.77.2

## 0.77.1

### Patch Changes

- @voyant-travel/distribution@0.77.1
- @voyant-travel/react@0.77.1

## 0.77.0

### Patch Changes

- @voyant-travel/distribution@0.77.0
- @voyant-travel/react@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/distribution@0.76.0
- @voyant-travel/react@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/distribution@0.75.7
- @voyant-travel/react@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/distribution@0.75.6
- @voyant-travel/react@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/distribution@0.75.5
- @voyant-travel/react@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/distribution@0.75.4
- @voyant-travel/react@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/distribution@0.75.3
- @voyant-travel/react@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/distribution@0.75.2
- @voyant-travel/react@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/distribution@0.75.1
- @voyant-travel/react@0.75.1

## 0.75.0

### Patch Changes

- @voyant-travel/distribution@0.75.0
- @voyant-travel/react@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/distribution@0.74.2
- @voyant-travel/react@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/distribution@0.74.1
- @voyant-travel/react@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/distribution@0.74.0
- @voyant-travel/react@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/distribution@0.73.1
- @voyant-travel/react@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/distribution@0.73.0
- @voyant-travel/react@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/distribution@0.72.0
- @voyant-travel/react@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/distribution@0.71.0
- @voyant-travel/react@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/distribution@0.70.0
- @voyant-travel/react@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/distribution@0.69.1
- @voyant-travel/react@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/distribution@0.69.0
- @voyant-travel/react@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/distribution@0.68.0
- @voyant-travel/react@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/distribution@0.67.0
- @voyant-travel/react@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/distribution@0.66.6
- @voyant-travel/react@0.66.6

## 0.66.5

### Patch Changes

- @voyant-travel/distribution@0.66.5
- @voyant-travel/react@0.66.5

## 0.66.4

### Patch Changes

- @voyant-travel/distribution@0.66.4
- @voyant-travel/react@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/distribution@0.66.3
- @voyant-travel/react@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/distribution@0.66.2
- @voyant-travel/react@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/distribution@0.66.1
- @voyant-travel/react@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/distribution@0.66.0
- @voyant-travel/react@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/distribution@0.65.0
- @voyant-travel/react@0.65.0

## 0.64.1

### Patch Changes

- @voyant-travel/distribution@0.64.1
- @voyant-travel/react@0.64.1

## 0.64.0

### Patch Changes

- @voyant-travel/distribution@0.64.0
- @voyant-travel/react@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/distribution@0.63.1
- @voyant-travel/react@0.63.1

## 0.63.0

### Patch Changes

- @voyant-travel/distribution@0.63.0
- @voyant-travel/react@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/distribution@0.62.3
- @voyant-travel/react@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/distribution@0.62.2
- @voyant-travel/react@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/distribution@0.62.1
- @voyant-travel/react@0.62.1

## 0.62.0

### Patch Changes

- @voyant-travel/distribution@0.62.0
- @voyant-travel/react@0.62.0

## 0.61.0

### Patch Changes

- @voyant-travel/distribution@0.61.0
- @voyant-travel/react@0.61.0

## 0.60.0

### Patch Changes

- @voyant-travel/distribution@0.60.0
- @voyant-travel/react@0.60.0

## 0.59.0

### Patch Changes

- @voyant-travel/distribution@0.59.0
- @voyant-travel/react@0.59.0

## 0.58.0

### Patch Changes

- @voyant-travel/distribution@0.58.0
- @voyant-travel/react@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/distribution@0.57.0
- @voyant-travel/react@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/distribution@0.56.0
- @voyant-travel/react@0.56.0

## 0.55.1

### Patch Changes

- @voyant-travel/distribution@0.55.1
- @voyant-travel/react@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/distribution@0.55.0
- @voyant-travel/react@0.55.0

## 0.54.0

### Patch Changes

- @voyant-travel/distribution@0.54.0
- @voyant-travel/react@0.54.0

## 0.53.2

### Patch Changes

- @voyant-travel/distribution@0.53.2
- @voyant-travel/react@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/distribution@0.53.1
- @voyant-travel/react@0.53.1

## 0.53.0

### Patch Changes

- @voyant-travel/distribution@0.53.0
- @voyant-travel/react@0.53.0

## 0.52.4

### Patch Changes

- @voyant-travel/distribution@0.52.4
- @voyant-travel/react@0.52.4

## 0.52.3

### Patch Changes

- @voyant-travel/distribution@0.52.3
- @voyant-travel/react@0.52.3

## 0.52.2

### Patch Changes

- @voyant-travel/distribution@0.52.2
- @voyant-travel/react@0.52.2

## 0.52.1

### Patch Changes

- @voyant-travel/distribution@0.52.1
- @voyant-travel/react@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/distribution@0.52.0
- @voyant-travel/react@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/distribution@0.51.1
- @voyant-travel/react@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/distribution@0.51.0
- @voyant-travel/react@0.51.0

## 0.50.8

### Patch Changes

- @voyant-travel/distribution@0.50.8
- @voyant-travel/react@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/distribution@0.50.7
- @voyant-travel/react@0.50.7

## 0.50.6

### Patch Changes

- @voyant-travel/distribution@0.50.6
- @voyant-travel/react@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/distribution@0.50.5
- @voyant-travel/react@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/distribution@0.50.4
- @voyant-travel/react@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/distribution@0.50.3
- @voyant-travel/react@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/distribution@0.50.2
- @voyant-travel/react@0.50.2

## 0.50.1

### Patch Changes

- @voyant-travel/distribution@0.50.1
- @voyant-travel/react@0.50.1

## 0.50.0

### Patch Changes

- @voyant-travel/distribution@0.50.0
- @voyant-travel/react@0.50.0

## 0.49.0

### Patch Changes

- @voyant-travel/distribution@0.49.0
- @voyant-travel/react@0.49.0

## 0.48.0

### Patch Changes

- @voyant-travel/distribution@0.48.0
- @voyant-travel/react@0.48.0

## 0.47.0

### Patch Changes

- @voyant-travel/distribution@0.47.0
- @voyant-travel/react@0.47.0

## 0.46.0

### Patch Changes

- @voyant-travel/distribution@0.46.0
- @voyant-travel/react@0.46.0

## 0.45.0

### Patch Changes

- @voyant-travel/distribution@0.45.0
- @voyant-travel/react@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/distribution@0.44.0
- @voyant-travel/react@0.44.0

## 0.43.0

### Patch Changes

- @voyant-travel/distribution@0.43.0
- @voyant-travel/react@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/distribution@0.42.0
- @voyant-travel/react@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/distribution@0.41.3
- @voyant-travel/react@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/distribution@0.41.2
- @voyant-travel/react@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/distribution@0.41.1
- @voyant-travel/react@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/distribution@0.41.0
- @voyant-travel/react@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/distribution@0.40.1
- @voyant-travel/react@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/distribution@0.40.0
- @voyant-travel/react@0.40.0

## 0.39.0

### Patch Changes

- @voyant-travel/distribution@0.39.0
- @voyant-travel/react@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/distribution@0.38.2
- @voyant-travel/react@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/distribution@0.38.1
- @voyant-travel/react@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/distribution@0.38.0
- @voyant-travel/react@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/distribution@0.37.1
- @voyant-travel/react@0.37.1

## 0.37.0

### Patch Changes

- @voyant-travel/distribution@0.37.0
- @voyant-travel/react@0.37.0

## 0.36.0

### Patch Changes

- @voyant-travel/distribution@0.36.0
- @voyant-travel/react@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/distribution@0.35.0
- @voyant-travel/react@0.35.0

## 0.34.0

### Patch Changes

- @voyant-travel/distribution@0.34.0
- @voyant-travel/react@0.34.0

## 0.33.1

### Patch Changes

- @voyant-travel/distribution@0.33.1
- @voyant-travel/react@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/distribution@0.33.0
- @voyant-travel/react@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/distribution@0.32.3
- @voyant-travel/react@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/distribution@0.32.2
- @voyant-travel/react@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/distribution@0.32.1
- @voyant-travel/react@0.32.1

## 0.32.0

### Patch Changes

- @voyant-travel/distribution@0.32.0
- @voyant-travel/react@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/distribution@0.31.4
- @voyant-travel/react@0.31.4

## 0.31.3

### Patch Changes

- @voyant-travel/distribution@0.31.3
- @voyant-travel/react@0.31.3

## 0.31.2

### Patch Changes

- @voyant-travel/distribution@0.31.2
- @voyant-travel/react@0.31.2

## 0.31.1

### Patch Changes

- @voyant-travel/distribution@0.31.1
- @voyant-travel/react@0.31.1

## 0.31.0

### Patch Changes

- @voyant-travel/distribution@0.31.0
- @voyant-travel/react@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/distribution@0.30.7
- @voyant-travel/react@0.30.7

## 0.30.6

### Patch Changes

- @voyant-travel/distribution@0.30.6
- @voyant-travel/react@0.30.6

## 0.30.5

### Patch Changes

- @voyant-travel/distribution@0.30.5
- @voyant-travel/react@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/distribution@0.30.4
- @voyant-travel/react@0.30.4

## 0.30.3

### Patch Changes

- @voyant-travel/distribution@0.30.3
- @voyant-travel/react@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/distribution@0.30.2
- @voyant-travel/react@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/distribution@0.30.1
- @voyant-travel/react@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/distribution@0.30.0
- @voyant-travel/react@0.30.0

## 0.29.0

### Patch Changes

- @voyant-travel/distribution@0.29.0
- @voyant-travel/react@0.29.0

## 0.28.3

### Patch Changes

- @voyant-travel/distribution@0.28.3
- @voyant-travel/react@0.28.3

## 0.28.2

### Patch Changes

- @voyant-travel/distribution@0.28.2
- @voyant-travel/react@0.28.2

## 0.28.1

### Patch Changes

- @voyant-travel/distribution@0.28.1
- @voyant-travel/react@0.28.1

## 0.28.0

### Patch Changes

- @voyant-travel/distribution@0.28.0
- @voyant-travel/react@0.28.0

## 0.27.0

### Patch Changes

- @voyant-travel/distribution@0.27.0
- @voyant-travel/react@0.27.0

## 0.26.9

### Patch Changes

- @voyant-travel/distribution@0.26.9
- @voyant-travel/react@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/distribution@0.26.8
- @voyant-travel/react@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/distribution@0.26.7
- @voyant-travel/react@0.26.7

## 0.26.6

### Patch Changes

- @voyant-travel/distribution@0.26.6
- @voyant-travel/react@0.26.6

## 0.26.5

### Patch Changes

- @voyant-travel/distribution@0.26.5
- @voyant-travel/react@0.26.5

## 0.26.4

### Patch Changes

- @voyant-travel/distribution@0.26.4
- @voyant-travel/react@0.26.4

## 0.26.3

### Patch Changes

- @voyant-travel/distribution@0.26.3
- @voyant-travel/react@0.26.3

## 0.26.2

### Patch Changes

- @voyant-travel/distribution@0.26.2
- @voyant-travel/react@0.26.2

## 0.26.1

### Patch Changes

- @voyant-travel/distribution@0.26.1
- @voyant-travel/react@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/distribution@0.26.0
- @voyant-travel/react@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/distribution@0.25.0
- @voyant-travel/react@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/distribution@0.24.3
- @voyant-travel/react@0.24.3

## 0.24.2

### Patch Changes

- @voyant-travel/distribution@0.24.2
- @voyant-travel/react@0.24.2

## 0.24.1

### Patch Changes

- @voyant-travel/distribution@0.24.1
- @voyant-travel/react@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/distribution@0.24.0
- @voyant-travel/react@0.24.0

## 0.23.0

### Patch Changes

- @voyant-travel/distribution@0.23.0
- @voyant-travel/react@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/distribution@0.22.0
- @voyant-travel/react@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/distribution@0.21.1
- @voyant-travel/react@0.21.1

## 0.21.0

### Patch Changes

- Updated dependencies [6427bad]
  - @voyant-travel/distribution@0.21.0
  - @voyant-travel/react@0.21.0

## 0.20.0

### Patch Changes

- @voyant-travel/distribution@0.20.0
- @voyant-travel/react@0.20.0

## 0.19.0

### Patch Changes

- @voyant-travel/distribution@0.19.0
- @voyant-travel/react@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies [8932f60]
  - @voyant-travel/distribution@0.18.0
  - @voyant-travel/react@0.18.0

## 0.17.0

### Patch Changes

- @voyant-travel/distribution@0.17.0
- @voyant-travel/react@0.17.0

## 0.16.0

### Patch Changes

- @voyant-travel/distribution@0.16.0
- @voyant-travel/react@0.16.0

## 0.15.0

### Patch Changes

- @voyant-travel/distribution@0.15.0
- @voyant-travel/react@0.15.0

## 0.14.0

### Patch Changes

- @voyant-travel/distribution@0.14.0
- @voyant-travel/react@0.14.0

## 0.13.0

### Patch Changes

- @voyant-travel/distribution@0.13.0
- @voyant-travel/react@0.13.0

## 0.12.0

### Patch Changes

- @voyant-travel/distribution@0.12.0
- @voyant-travel/react@0.12.0

## 0.11.0

### Patch Changes

- @voyant-travel/distribution@0.11.0
- @voyant-travel/react@0.11.0

## 0.10.0

### Minor Changes

- 29a581a: Add `connect` value to `channelKindEnum` for partners running Voyant Connect (the inbound API integration surface where operators publish into a third-party network using Voyant infrastructure). Distinguishes from `api_partner`, which remains a generic third-party API integration.

  Synchronised across pgEnum, Zod validation, React schemas / constants / hooks, registry dialogs, en/ro i18n labels, and template copies in `templates/dmc`, `templates/operator`, and `apps/dev`.

### Patch Changes

- Updated dependencies [29a581a]
  - @voyant-travel/distribution@0.10.0
  - @voyant-travel/react@0.10.0

## 0.9.0

### Patch Changes

- @voyant-travel/distribution@0.9.0
- @voyant-travel/react@0.9.0

## 0.8.0

### Patch Changes

- @voyant-travel/distribution@0.8.0
- @voyant-travel/react@0.8.0

## 0.7.0

### Patch Changes

- @voyant-travel/distribution@0.7.0
- @voyant-travel/react@0.7.0

## 0.6.9

### Patch Changes

- @voyant-travel/distribution@0.6.9
- @voyant-travel/react@0.6.9

## 0.6.8

### Patch Changes

- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
  - @voyant-travel/distribution@0.6.8
  - @voyant-travel/react@0.6.8

## 0.6.7

### Patch Changes

- Updated dependencies [7f10cfa]
  - @voyant-travel/distribution@0.6.7
  - @voyant-travel/react@0.6.7

## 0.6.6

### Patch Changes

- @voyant-travel/distribution@0.6.6
- @voyant-travel/react@0.6.6

## 0.6.5

### Patch Changes

- @voyant-travel/distribution@0.6.5
- @voyant-travel/react@0.6.5

## 0.6.4

### Patch Changes

- @voyant-travel/distribution@0.6.4
- @voyant-travel/react@0.6.4

## 0.6.3

### Patch Changes

- @voyant-travel/distribution@0.6.3
- @voyant-travel/react@0.6.3

## 0.6.2

### Patch Changes

- @voyant-travel/distribution@0.6.2
- @voyant-travel/react@0.6.2

## 0.6.1

### Patch Changes

- @voyant-travel/distribution@0.6.1
- @voyant-travel/react@0.6.1

## 0.6.0

### Patch Changes

- @voyant-travel/distribution@0.6.0
- @voyant-travel/react@0.6.0

## 0.5.0

### Patch Changes

- @voyant-travel/distribution@0.5.0
- @voyant-travel/react@0.5.0

## 0.4.5

### Patch Changes

- @voyant-travel/distribution@0.4.5
- @voyant-travel/react@0.4.5

## 0.4.4

### Patch Changes

- @voyant-travel/distribution@0.4.4
- @voyant-travel/react@0.4.4

## 0.4.3

### Patch Changes

- @voyant-travel/distribution@0.4.3
- @voyant-travel/react@0.4.3

## 0.4.2

### Patch Changes

- @voyant-travel/distribution@0.4.2
- @voyant-travel/react@0.4.2

## 0.4.1

### Patch Changes

- @voyant-travel/distribution@0.4.1
- @voyant-travel/react@0.4.1

## 0.4.0

### Patch Changes

- @voyant-travel/distribution@0.4.0
- @voyant-travel/react@0.4.0

## 0.3.1

### Patch Changes

- @voyant-travel/distribution@0.3.1
- @voyant-travel/react@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [e57725d]
  - @voyant-travel/distribution@0.3.0
  - @voyant-travel/react@0.3.0
