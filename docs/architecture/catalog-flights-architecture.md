# Catalog Flights architecture — Phase 3

Status: draft / proposal — Phase 3 of the catalog plane
Audience: anyone designing or implementing the flights vertical of the catalog plane.

This document covers the **Phase 3** work that adds flights as a partial-adoption vertical alongside the catalog foundation defined in [`catalog-architecture.md`](./catalog-architecture.md). It is intentionally separated from the foundation doc because flights are unlike every other vertical (live-API, no editorial overlay, no semantic search) and deserve their own architectural treatment, including the swappable `ReferenceDataProvider` for global reference data.

## 1. Phase relationship

**Prerequisites** (must be live before Phase 3 lands):

- Phase 1 catalog foundation: snapshot graph, source adapter contract, drift events, webhooks, source disconnect lifecycle, provenance shape.
- The in-scope verticals and resale surfaces have adopted Phase 1's contract
  (`products`, `cruises`, accommodation resale, `charters`, `extras`).

**Phase 2 (RAG) is NOT a prerequisite.** Flights explicitly opt out of embeddings and semantic search (see §5); Phase 3 can land before, after, or in parallel with Phase 2.

**What Phase 3 adds:**

- `packages/flights` — a partial-adoption vertical for live-API flight search and booking.
- The `FlightConnectorAdapter` contract, borrowed from voyant-cloud's `connect-flight-contract` (see §2).
- Multi-connection fan-out search with itinerary fingerprint deduplication.
- Booking-time snapshot capture for flight orders (frozen `FlightOffer` + `FlightOrder` + segments + fare breakdown).
- The `ReferenceDataProvider` contract — swappable, with one default implementation (Voyant Data) and plenty of operator-friendly alternatives including in-deployment local Postgres tables (see §6).

**What Phase 3 does NOT change:**

- The Phase 1 field-policy contract is unchanged. Flights don't add fields to the policy registry because flights don't go through the indexer or overlay store at all.
- The in-scope verticals and resale surfaces keep their Phase 1 adoption shape.
- Phase 2 (RAG) is unaffected.

## 2. Why flights are a special case

Flights are unlike the other verticals and resale surfaces (`products`,
`cruises`, accommodation resale, `charters`, `extras`). The catalog plane's
standard machinery — projections, overlays, embeddings, search-index tiers,
drift detection — assumes there's a meaningful body of slow-moving inventory
data to project, merchandise, and retrieve. Flights don't fit that shape:

- **No pre-projectable inventory.** Schedules and prices change continuously; pre-syncing the global flight inventory is neither tractable nor useful for most consumers. The exception (Hisky-style pre-synced availability for a single carrier) is one provider's choice, not the contract.
- **No meaningful editorial overlay.** Marketing does not rewrite "London → JFK on BA177" with SEO copy. There is no "marketing title" for a flight.
- **No semantic search use case at the entry level.** Customers don't browse flights with vector queries; they specify route + dates + passengers and expect live offers ranked by price/duration.
- **Reference data is a separate concern.** Airlines, airports, aircraft are global IATA-coded entities that belong behind a swappable provider contract, not in the catalog plane itself.

The architecture treats flights as a **partial-adoption vertical**, similar to (but more constrained than) `packages/extras` per the foundation doc's §3.3.1. The flight vertical participates in the catalog plane only where doing so adds real value, and it explicitly opts out of the rest.

The contract surface, capability set, and orchestration patterns described below are borrowed from voyant-cloud's mature flight integration (see [`flights-contract-refactor.md`](../../../voyant-cloud/docs/connect/flights-contract-refactor.md) in voyant-cloud). Voyant Catalog re-uses the same shapes — `FlightConnectorAdapter`, `FlightOffer`, `FlightOrder`, `MergedFlightOffer`, capability ids — rather than inventing parallel ones. This keeps adapters portable between Voyant Cloud's `connect-flight-contract` package and a Voyant Catalog flight integration.

## 3. The flight connector contract (borrowed from Connect)

A flight provider integrates by implementing the `FlightConnectorAdapter` interface. **Five core methods** every adapter must implement (these are what "Voyant can sell a flight" means):

```ts
searchFlights(ctx, request) → offers[]      // slice-based search
priceOffer(ctx, request)    → revalidated offer
bookFlight(ctx, request)    → order (held or ticketed depending on paymentIntent)
getOrder(ctx, orderId)      → order
cancelOrder(ctx, orderId)   → cancellation result
```

If any of these cannot be implemented, the connection is not a flight connection.

**Capability-gated methods** sit alongside the core five and are declared per connection. Adapters that don't declare a capability stub the method with `CAPABILITY_NOT_SUPPORTED`. Capabilities ids are namespaced under `flight/*`:

| Capability | Methods |
| --- | --- |
| `flight/holds` | `ticketOrder` (two-step hold-then-ticket flow) |
| `flight/seatmap` | `getSeatMap` |
| `flight/seat-selection` | `selectSeats` |
| `flight/ancillaries` | `getAncillaries`; selected ancillaries are submitted through `bookFlight` |
| `flight/checkin` | `checkIn` |
| `flight/exchange` | `modifyOrder` |
| `flight/refund` | `refundOrder` |
| `flight/void` | `voidOrder` (same-day void) |
| `flight/ssr` | `addSpecialServiceRequest` (meals, wheelchair, infant-on-lap, UM) |
| `flight/branded-fares` | search returns multiple offers per itinerary |

The capability set is open-ended; new capability ids are added when a real provider needs them. This is exactly the "narrow at the edges, broad at the center" shape from the foundation §5.6 — applied to flights specifically.

The package also ships zod runtime schemas for the public flight contract
under `@voyant-travel/flights/contract/schemas`. Any consumer exposing the
adapter contract over HTTP, queues, RPC, or another wire boundary should
validate with those shipped schemas instead of maintaining a parallel local
copy of the contract shape.

**Provider escape hatch.** Each `FlightOffer` and `FlightOrder` carries an opaque `providerData` field. Provider-specific data round-trips through the contract without leaking into the consumer-facing surface. If a consumer needs to read `providerData.amadeusXYZ` to make their integration work, the contract has leaked and needs widening.

### 3.1. Slice-based search and intent-driven booking

Two specific contract shapes from voyant-cloud's flight refactor are worth calling out because they are non-obvious and we adopt them verbatim:

**Slice-based search.** Search requests carry `slices: Array<{ origin, destination, departureDate, departureTimeWindow? }>`. One slice = one-way; two = round-trip; three or more = multi-city / open-jaw. Flat `origin`/`destination`/`returnDate` request shapes can't express multi-city without provider-specific modes; slices generalize cleanly.

**Intent-driven booking.** The book request carries a `paymentIntent` discriminated union:

```ts
bookFlight(... paymentIntent: { type: "hold" })             → status: "confirmed"   // call ticketOrder later
bookFlight(... paymentIntent: { type: "card", ... })        → status: "ticketed"    // done
bookFlight(... paymentIntent: { type: "ticket_on_credit" }) → status: "ticketed"    // GDS agency model
```

Default if omitted: `{ type: "hold" }`. Consumers declare their intent; the system either honors it or rejects (if `flight/holds` is not declared and `{ type: "hold" }` is requested). Consumers do not branch on capability discovery for the common case.

## 4. Multi-connection fan-out and itinerary fingerprinting

The flight orchestration layer fans out across all admitted flight connections in a single search call. Admin composition may choose an operator-scoped connection set, but the public Storefront request never carries connection or provider selectors. Storefront passes only its server-resolved storefront, channel, market, locale, and currency to `FlightsRuntime.listAdmittedShoppingSources`; an empty enumeration is unavailable rather than a fallback to the admin adapter.

```
trusted Storefront context
  -> listAdmittedShoppingSources({ storefrontId, channelId, marketId, locale, currency })
  -> fanOutFlightSearch({ adapters: admittedSources, request: publicFlightIntent })
  -> opaque single-use offer ref containing exact offer/connection ownership
```

The orchestration layer:

- **Filters connections inside the trusted runtime.** Public callers cannot probe cross-tenant connection ids because they cannot submit one.
- **Parallel fan-out** with per-provider timeout (default 5s) and per-provider circuit breaker. One slow/failing provider doesn't tank the whole search.
- **Partial success is the default.** Whatever providers responded come back; the rest are flagged in a `perConnection` status map.
- **Deduplicates by itinerary fingerprint** — a deterministic key derived from segments (carrier codes + flight numbers + departure/arrival airports + times + cabin). Two providers selling the same flight produce identical fingerprints and merge into one `MergedFlightOffer` with a `cheapest` plus `alternates[]` and `sourceConnectionIds[]`.
- **KV-cached at the `(sortedConnectionIds, requestHash)` level** with the `tier` parameter controlling cache participation: `"browse"` (default, ~15 min TTL — forgiving for browse pages) vs `"booking"` (skip cache, fresh prices before `priceOffer` / `bookFlight`).

This is the missing piece that makes "one API, many providers" true at the call level rather than just at the contract level. An agency wired to Hisky + Amadeus + a charter consolidator gets one merged result set without writing fan-out, dedupe, or partial-failure handling themselves.

## 5. Catalog plane participation

Flights opt in to a narrow slice of the cross-cutting infrastructure — and explicitly opt out of the rest.

### 5.1. What flights participate in

- **Booking snapshot graph (foundation §5.3).** Every booked flight produces a `booking_catalog_snapshot` row with `entity_module: "flights"`, the frozen `FlightOffer` and `FlightOrder` payloads, the `PNR`, the segments at book time, the fare breakdown, and the source pointer (`source_kind: "voyant-connect"`, `source_connection_id`, `source_ref` = adapter's `orderId`). This is the only catalog-plane surface flights *fully* adopt — and it's the most important one, because refunds, exchanges, and audit eight months later need the frozen offer/order.
- **Provenance shape (foundation §5.1).** Every flight order carries the standard provenance tuple. `source_kind` is typically `"voyant-connect"` with the provider identified through the connection id; direct adapter implementations (an operator's GDS integration) use their own kind.
- **Webhook events (foundation §5.8).** `catalog.booking.committed` / `.cancelled` fire on flight booking events same as for any other vertical. Cross-deployment subscribers (an OBT integrating with the operator) get notified via the standard webhook pipeline, with payloads visibility-filtered per foundation §5.8.4.
- **Source disconnection lifecycle (foundation §5.10).** If a flight provider connection is hard-disconnected (Hisky credentials revoked, Amadeus contract terminated), preserved booking snapshots stay queryable for refund/audit. Live capability against that source obviously stops; that's the point of disconnection.

### 5.2. What flights do NOT participate in

- **Search index projection (foundation §5.4).** Flights are not indexed in Typesense / Algolia / etc. Search goes through the flight orchestration layer's live fan-out, not through the catalog index. The reasons: pre-projection isn't tractable, indexed prices would be perpetually stale, and live multi-connection fan-out is what the contract is designed for.
- **Editorial overlays (foundation §5.2).** No marketing rewrites a flight's title or description. There's nothing to overlay. The overlay store has no flight rows.
- **Embeddings / semantic search (see [`catalog-architecture.md`](./catalog-architecture.md)).** Vector search over flights doesn't help any user. Customers know what airports and dates they want; they don't browse semantically. Flights' contribution to AI agents is the live `searchFlights` API, not embedded text. Flights explicitly opt out of catalog embeddings.
- **Pricing tiers (foundation §5.4.3).** Tier 1 indexed price summaries don't apply — flights have no indexed price summary. Tier 2 rerank is *built into* the multi-connection fan-out itself (the dedupe + cheapest-by-fingerprint sort is the rerank). Tier 3 date-bucketed cached pricing also doesn't fit; the `tier: "browse"` KV cache plays an analogous role at a different layer.
- **Drift detection (foundation §5.5).** Drift detection compares cached source state against current source state. Flight data is live by definition; there's no cached state to drift against. The closest analog is the `tier: "booking"` cache-skipping mode that guarantees fresh prices before book.

This is a smaller participation surface than any other vertical, and that is correct. Forcing flights through the full catalog-plane stack would produce strain everywhere and value nowhere.

## 6. Reference data — separate concern, swappable provider

Airlines, airports, aircraft, currencies, country codes are not flight catalog data — they are global reference data with stable IATA / ISO codes. They live behind a **`ReferenceDataProvider` contract** — provider-agnostic, with one default implementation and pluggable alternatives, following the same pattern as the rest of the catalog plane (`IndexerAdapter` in foundation §5.4.2, `EmbeddingProvider` in Phase 2 §6, source adapters in foundation §5.6).

The contract surface is intentionally small:

```ts
interface ReferenceDataProvider {
  getAirline(iataCode: string): Promise<Airline | null>
  getAirport(iataCode: string): Promise<Airport | null>
  getAircraft(iataCode: string): Promise<Aircraft | null>
  // batch variants for efficient hydration
  getAirlines(iataCodes: string[]): Promise<Map<string, Airline>>
  getAirports(iataCodes: string[]): Promise<Map<string, Airport>>
  getAircraftBatch(iataCodes: string[]): Promise<Map<string, Aircraft>>
  // capability declaration
  capabilities: {
    coversAirlines: boolean
    coversAirports: boolean
    coversAircraft: boolean
    coversCurrencies: boolean
    coversCountries: boolean
    isReadOnly: boolean              // true for hosted, false for ones that allow upserts
    refreshCadence: "static" | "weekly" | "daily" | "on-demand"
  }
}
```

Provider adapters emit codes (`carrierCode: "BA"`, `iataCode: "LHR"`); they do not extract or upsert reference rows. The catalog plane has no `flight_airlines` / `flight_airports` / `flight_aircraft` tables. Whichever `ReferenceDataProvider` is configured handles hydration when an offer or order is rendered.

### 6.1. Default: Voyant Data

Voyant ships a default `ReferenceDataProvider` backed by Voyant Data (see [`product.md`](../../../voyant-cloud/docs/data/product.md) in voyant-cloud), which uses D1 + embedded bundles for the small catalogs and a public-dataset sync pipeline for refresh. Most deployments use this without thinking about it.

### 6.2. Swap-in alternatives

The contract is implementable at any layer — local SQL queries, in-memory bundles, internal data lakes, third-party services, GDS feeds. There is no requirement to call out to a hosted Voyant service, no network hop, no external dependency unless the operator wants one. Listed roughly in increasing complexity:

- **In-deployment local table (the simplest case).** Run `reference_airlines`, `reference_airports`, `reference_aircraft`, etc. as ordinary tables in the operator's own Voyant Postgres database. Populate them however suits the deployment — a one-time seed migration from a public IATA dataset, a weekly batch refresh, a manually curated list, a CSV import script. The `ReferenceDataProvider` implementation is a thin Drizzle service wrapping `SELECT * FROM reference_airlines WHERE iata_code = $1` and friends. No external service, no network call, no infrastructure beyond what the deployment already runs. This is a fully valid first-party implementation; it is not a fallback or a degraded mode.
- **Static bundle.** Ship a JSON or CSV file with the deployment, load it into memory at startup, serve from a `Map`. Even less infrastructure than a local table — appropriate for small operators with stable, narrow geographic scope and no need for refresh.
- **Internal data lake / warehouse.** An operator with existing analytics or data-engineering infrastructure (Snowflake, BigQuery, internal Postgres) can wrap their existing reference-data tables behind the contract. Common for established operators whose data team has been curating IATA enrichments and proprietary airport metadata for years.
- **Third-party data services.** Providers like OAG, Cirium, RouteHappy, or an internal data warehouse can be wrapped as `ReferenceDataProvider` implementations.
- **GDS-bundled reference data.** Operators who already pay for Amadeus / Sabre / Travelport reference subscriptions can wrap the GDS's own data feed instead of duplicating data anywhere.
- **Voyant Data (the hosted default).** What ships when an operator doesn't configure anything else. Backed by Voyant Cloud's Voyant Data service. Convenient zero-setup option for operators who don't want to think about reference data.

The swap is per-deployment, declared at template setup, the same way storage / notifications / indexer providers are declared. No source adapter, no flight adapter, and no consumer-facing route is aware of which `ReferenceDataProvider` is underneath — they all hydrate codes through the same interface.

This separation is load-bearing for three reasons: it lets a flight adapter from a third-party provider work without reaching into any specific reference dataset; it ensures reference data updates (a new airport opening, an airline rebranding, an aircraft type retiring) don't ripple into provider-specific code; and — most importantly for operator independence — it lets an operator run a fully self-contained Voyant deployment with all reference data living in their own database, with zero dependency on Voyant Cloud, Voyant Data, or any third-party service.

## 7. Package layout

```
packages/flights                    operator-facing flight vertical:
  src/contract.ts                     re-exports FlightConnectorAdapter and friends
                                      from voyant-cloud's connect-flight-contract,
                                      OR depends on the published version
  src/orchestration/multi-search.ts   multi-connection fan-out, fingerprint dedupe,
                                      KV cache with tier handling
  src/orchestration/dispatch.ts       per-connection adapter routing (Hisky, Amadeus,
                                      Duffel, Sabre, Travelport NDC, custom GDS)
  src/snapshot.ts                     booking-time snapshot capture: writes
                                      booking_catalog_snapshot rows with the frozen
                                      FlightOffer + FlightOrder
  src/reference/                      ReferenceDataProvider contract + default provider
    contract.ts                       ReferenceDataProvider type
    local-postgres.ts                 in-deployment local tables provider
    static-bundle.ts                  JSON/CSV bundle provider
    voyant-data.ts                    hosted Voyant Data provider (default)
  src/routes.ts                       /v1/{admin,public}/flights/search and
                                      /v1/{admin,public}/flights/orders/* routes,
                                      mounted by templates that need flights
```

Templates that need flights (a tour-package vertical, a corporate-travel storefront, a luxury-cruise reseller offering coordinated flights) opt in by registering `packages/flights`. Templates that don't need flights skip it entirely — same opt-in posture as `packages/charters`, `packages/cruises`, etc.

Flight adapters (Hisky, Amadeus, Duffel, Sabre, Travelport NDC, an operator-built GDS connector) live in their own packages — `@voyant-travel/voyant-flight-adapter-hisky`, `@voyant-travel/voyant-flight-adapter-amadeus`, etc. — or come through Voyant Connect's existing flight connector ecosystem. Same as for source adapters generally (foundation §5.6), no implementer is privileged.

## 8. Open questions

1. **Whether to maintain a forked copy of voyant-cloud's `connect-flight-contract` inside the catalog plane, or depend on it directly.** Direct dependency keeps the contract definitions in one place and prevents drift; forked copy gives the catalog plane independent versioning. Lean toward direct dependency unless a release-cycle conflict appears.
2. **Whether an `IndexerAdapter` capability flag should advertise that flights are not indexed at all** (`supportsVerticals: string[]` excluding `"flights"`), or whether the `flights` vertical itself is structurally absent from any indexer-side code path. Lean toward the latter — flights bypass the indexer entirely; no flag is needed.
3. **Pricing-cache TTL semantics under heavy regulatory variance.** The `tier: "browse"` 15-min TTL is borrowed from Connect's defaults. Markets with rapid currency or fare-rule shifts (e.g. competitive long-haul) may need shorter TTLs. Defer to deployment configuration.
4. **First-party shipped `ReferenceDataProvider` implementations.** v1 of Phase 3 ships at minimum the in-deployment local-Postgres provider, the static-bundle provider, and the Voyant Data provider. Whether to ship a Cirium / OAG provider as first-party depends on whether operators commonly use those services; defer until concrete deployments demand it.

## 9. Glossary (Phase 3-specific)

- **`FlightConnectorAdapter`** — the provider-agnostic adapter interface for flight integrations, borrowed verbatim from voyant-cloud's `connect-flight-contract`. Five core methods plus capability-gated extras.
- **Slice** — a single leg of a flight search request (`{ origin, destination, departureDate }`). One slice = one-way; two = round-trip; three or more = multi-city.
- **Itinerary fingerprint** — deterministic hash derived from a `FlightOffer`'s segments (carrier codes + flight numbers + airports + times + cabin), used to deduplicate when the same flight is sold by multiple connections. Two providers selling the same flight produce identical fingerprints.
- **`MergedFlightOffer`** — the deduplicated result of multi-connection fan-out: one `cheapest` offer plus `alternates[]` from other connections selling the same itinerary, with aggregate `sourceConnectionIds[]` for traceability and exact aligned ownership (`cheapestSourceConnectionId` / `alternateSourceConnectionIds`) for opaque downstream offer resolution.
- **`paymentIntent`** — discriminated union on `bookFlight` requests: `hold` / `card` / `ticket_on_credit`. Determines whether the booking returns held or ticketed.
- **`ReferenceDataProvider`** — the swappable contract for global reference data (airlines, airports, aircraft, currencies, countries). Implementable at any layer, including the simplest case of plain Postgres tables in the operator's own Voyant database with no external dependency. Voyant Data is the hosted default; in-deployment local tables, static bundles, internal data lakes, third-party services (OAG, Cirium), and GDS-bundled implementations are all first-class alternatives. No implementer is privileged.

## 10. Related documents

- [`catalog-architecture.md`](./catalog-architecture.md) — the Phase 1 foundation. Phase 3 flights depend on its snapshot graph, source adapter contract, webhook taxonomy, and disconnect lifecycle.
- [`catalog-architecture.md`](./catalog-architecture.md) — the catalog plane and semantic-search boundary. Flights opt out of embeddings.
- voyant-cloud `docs/connect/flights-contract-refactor.md` — the upstream design of the flight connector contract that `packages/flights` adopts verbatim.
- voyant-cloud `docs/data/product.md` — the design of Voyant Data, the **default** `ReferenceDataProvider` implementation. Operators may substitute their own implementation (in-deployment local table, static bundle, internal data lake, third-party service, GDS-bundled) and bypass Voyant Data entirely.
