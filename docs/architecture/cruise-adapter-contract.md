# External Cruise Adapter Contract

Status: active architecture note
Audience: developers implementing an external adapter package for
`@voyant-travel/cruises`.

This contract keeps the cruises framework provider-neutral. The framework owns
the normalized cruise shapes, route behavior, SourceRef encoding, search-index
projection shape, booking snapshot shape, and compatibility tests. Adapter
packages own upstream clients, credentials, polling, retries, throttling, and
provider-specific mappings.

## Boundary

An adapter package implements `CruiseAdapter` from `@voyant-travel/cruises/adapters`
and registers it at application startup. The framework must not import the
adapter package. The adapter package can depend on `@voyant-travel/cruises` for
types, helpers, and compatibility tests.

```ts
import { memoizeCruiseAdapter, registerCruiseAdapter } from "@voyant-travel/cruises/adapters"
import { createCruiseAdapter } from "external-cruise-adapter"

const adapter = createCruiseAdapter({
  token: process.env.CRUISE_ADAPTER_TOKEN,
  endpoint: process.env.CRUISE_ADAPTER_ENDPOINT,
})

registerCruiseAdapter(memoizeCruiseAdapter(adapter, { ttlMs: 60_000 }))
```

The adapter `name` is the source-provider prefix used in external keys:
`<adapter.name>:<encoded-source-ref>`. Keep it stable for the lifetime of the
deployment.

## SourceRef Semantics

`SourceRef` is identity, not display text:

```ts
type SourceRef = {
  externalId: string
  connectionId?: string
  [key: string]: unknown
}
```

Rules:

- Preserve the full `SourceRef` returned by the upstream adapter across list,
  projection, detail, pricing, booking, and catalog-shim flows.
- Treat `connectionId`, source namespace, market, account, or other adapter
  fields as part of identity. Two refs with the same `externalId` but different
  connection context are different rows.
- Use `makeExternalSourceKey(provider, sourceRef)` or `encodeSourceRef(sourceRef)`
  when building route keys or catalog entity ids. Do not split or slugify a ref
  and then reconstruct `{ externalId }`.
- Return the same full `SourceRef` from `fetchCruise`, `fetchSailing`,
  `fetchShip`, `searchProjection`, `listEntries`, and pricing rows.

## Method Expectations

`listEntries(options)` is a browse method. It returns lightweight summaries for
admin list views and should preserve full source identity. It may be paginated
with an adapter-owned cursor.

`searchProjection(options)` is an index/projection method. It feeds
`cruise_search_index` for storefront list and SEO flows. It should be safe to
run in background jobs and may return cached or replicated data, as long as the
projection is internally consistent and emits full refs.

`fetchCruise`, `fetchSailing`, `fetchSailingPricing`, `fetchSailingItinerary`,
`fetchShip`, and `listSailingsForCruise` are detail reads. They are used by
admin detail routes, storefront detail routes, quote assembly, refresh, detach,
and content composition. They should read authoritative current upstream state
or the adapter package's own normalized live replica.

`createBooking(input)` is the commit boundary. It receives the full sailing ref,
cabin category ref, occupancy, passenger composition, passenger rows, contact,
fare code, fare variant, and booking terms accepted by the caller. It returns an
upstream confirmation reference and any final quote, component, or terms
snapshot the framework should store locally.

Pricing rows should use `fareVariant: "cruise_only"` for the base cruise fare
and `fareVariant: "air_inclusive"` when the row represents the upstream
air-inclusive cabin fare. When an upstream source exposes sale pricing, map the
sell price to `pricePerPerson` and the compare-at price to
`originalPricePerPerson`. Explicit single-occupancy prices should use
`singlePricePerPerson`; percentage-only supplements should continue to use
`singleSupplementPercent`. Optional early-booking signals can be carried through
`earlyBookingDeadline` and `earlyBookingBonusDescription`.

## Catalog SourceAdapter Shim

When a deployment wants catalog-plane content integration for external cruise
rows, wrap the same `CruiseAdapter` with `cruiseAdapterToSourceAdapter(...)` and
register the shim in the catalog `SourceAdapterRegistry`.

The default shim entity id is `crus_${encodeSourceRef(sourceRef)}`. This is
load-bearing: `catalog_sourced_entries`, cruise content routes, admin refresh,
and storefront keys all depend on stable full-ref identity.

The shim currently supports discovery and content fetch. Reservation and
cancellation through the catalog source adapter remain explicit capability
stubs; external cruise booking commits should use the cruises vertical booking
path.

## Refresh And Reindex

External cruise adapters may sync upstream data on their own cadence. Voyant
deployments still need a provider-neutral bridge that reconciles local browse
and catalog search surfaces from adapter projections.

The cruises package exposes `refreshExternalCruiseCatalog(...)` for that bridge.
It performs two independent refreshes:

- `cruise_search_index`: drains each registered `CruiseAdapter.searchProjection()`
  stream, upserts emitted rows, then removes rows for that adapter that were not
  emitted by the successful run.
- Catalog plane: when the caller supplies a catalog `SourceAdapterRegistry`,
  `IndexerService`, and field-policy registries, it runs `syncSources(...)` for
  the `cruises` vertical, upserts `catalog_sourced_entries`, reindexes configured
  catalog search slices, and marks missing sourced rows withdrawn.

Pruning only runs after an adapter finishes successfully. A failed adapter is
reported in the refresh summary and leaves existing indexed rows in place.
Multiple connections stay isolated by full source identity: `cruise_search_index`
matches by provider plus full `SourceRef`, while catalog rows prune by
`source_kind`, `source_connection_id`, and `entity_module`.

Manual operator refresh paths:

- `POST /v1/admin/cruises/search-index/rebuild` refreshes the cruise vertical
  browse index from registered cruise adapters.
- Deployment tooling may compose `syncSources(...)` from selected catalog source
  adapters to refresh sourced entries and search slices. That command belongs to
  the external CLI, not the standard project starter.

Scheduled refresh in `apps/operator` runs daily at `30 3 * * *` via
the `external-cruise-catalog-refresh` package workflow schedule. Deployments can
add adapter-specific webhook/event handlers that call the same
`refreshExternalCruiseCatalog(...)` service for targeted near-real-time
refreshes without coupling the framework to any provider.

## Compatibility Tests

External adapter packages can run the framework compatibility fixture in their
own test suite:

```ts
import { describe, it } from "vitest"
import { assertCruiseAdapterCompatibility } from "@voyant-travel/cruises/adapters"
import { createCruiseAdapter } from "../src/index.js"

describe("cruise adapter contract", () => {
  it("satisfies @voyant-travel/cruises", async () => {
    const adapter = createCruiseAdapter({ mode: "sandbox" })

    await assertCruiseAdapterCompatibility(adapter, {
      primaryCruiseRef: {
        externalId: "fixture-cruise",
        connectionId: "sandbox-a",
      },
      alternateCruiseRef: {
        externalId: "fixture-cruise",
        connectionId: "sandbox-b",
      },
      sailingRef: {
        externalId: "fixture-sailing",
        connectionId: "sandbox-a",
      },
      shipRef: {
        externalId: "fixture-ship",
        connectionId: "sandbox-a",
      },
      cabinCategoryRef: {
        externalId: "fixture-cabin",
        connectionId: "sandbox-a",
      },
      minimumItineraryDays: 1,
      passengerComposition: { adults: 2 },
      fareCode: "FLEX",
      fareVariant: "cruise_only",
      bookingInput: {
        sailingRef: { externalId: "fixture-sailing", connectionId: "sandbox-a" },
        cabinCategoryRef: { externalId: "fixture-cabin", connectionId: "sandbox-a" },
        occupancy: 2,
        passengerComposition: { adults: 2 },
        fareCode: "FLEX",
        fareVariant: "cruise_only",
        passengers: [
          { firstName: "Test", lastName: "One", travelerCategory: "adult", isPrimary: true },
          { firstName: "Test", lastName: "Two", travelerCategory: "adult" },
        ],
        contact: { firstName: "Test", lastName: "One", email: "test@example.test" },
      },
    })
  })
})
```

The fixture checks:

- full `SourceRef` round-tripping through `listEntries` and `searchProjection`;
- multi-connection identity with two refs sharing the same `externalId`;
- cruise, sailing, itinerary, ship, and cruise-to-sailings detail lookup;
- sailing pricing lookup by cabin ref, passenger composition, fare code, and
  fare variant when supplied;
- booking commit payload acceptance and upstream confirmation return.

Adapter packages should run this fixture against a sandbox data set where the
two cruise refs intentionally share the same upstream id and differ only by
connection/source context. The primary cruise should expose the fixture sailing
through both `fetchSailing(...)` and `listSailingsForCruise(...)`, and the
fixture sailing should expose at least `minimumItineraryDays` itinerary days.
That catches the most common integration bug: collapsing identity to
`externalId`.

## Provider-Neutrality Checklist

- The framework package imports only framework code and shared types.
- Adapter packages keep credentials, HTTP clients, OAuth flows, throttling, and
  provider mappings outside `@voyant-travel/cruises`.
- Route keys, catalog entity ids, search-index identity, and booking snapshots
  use full refs.
- Projection methods can be scheduled or replicated by the adapter package;
  live detail and booking methods must be current enough for user-facing quote
  and booking flows.
- The adapter package owns any destructive upstream operation. The framework
  stores the resulting local booking snapshot and connector confirmation refs.
