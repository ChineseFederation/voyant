# @voyant-travel/flights

Phase 3 of the catalog plane. The flights vertical is a partial-adoption module
for live-API flight supplier search and booking in OTA, tour-operator, and DMC
deployments.

Flights are modeled as supplier integrations and sourced inventory. Voyant is
not positioned as an airline or flight-operator system.

See [`docs/architecture/catalog-flights-architecture.md`](../../docs/architecture/catalog-flights-architecture.md)
for the full design.

## Install

```bash
pnpm add @voyant-travel/flights
```

## What's in the box

- **`./contract/types`** — `FlightOffer`, `FlightOrder`, `FlightSegment`,
  `FlightSearchRequest`, `FlightBookRequest`, capability ids, `paymentIntent`
  discriminated union. Shapes mirror voyant-cloud's `connect-flight-contract`
  so adapters are portable across `voyant-cloud` and Voyant Catalog.
- **`./contract/adapter`** — `FlightConnectorAdapter` interface (5 core methods
  + optional capability-gated methods for holds, seat maps, post-book seat
  selection, check-in, exchange, refund, void, SSR, ancillaries, and order
  listing). Provider-agnostic; implementations come from Voyant Connect,
  third-party providers, or operator-built adapters.
- **`./contract/schemas`** — zod schemas for the public flight contract
  request, response, enum, and value-object shapes. Use these at HTTP, queue,
  RPC, and adapter boundaries instead of re-declaring runtime validators.
- **`./durable-action-runtime-port`** — deployment-owned crash-safe ticket and
  cancellation capability. The framework activates those mutation Tools only
  after the exact selected provider passes behavioral idempotency and restart
  reconciliation conformance.
- **`./orchestration/fingerprint`** — Itinerary fingerprint helper. Two
  providers selling the same flight produce identical fingerprints.
- **`./orchestration/fan-out`** — Multi-connection fan-out search:
  parallel `searchFlights` across all of an operator's flight connections,
  per-provider timeout + circuit breaker, dedupe by itinerary fingerprint,
  merged result with `cheapest` + `alternates[]`.
- **`./snapshot`** — Booking-time snapshot capture. Builds a
  `CaptureSnapshotInput` for the catalog plane's `captureSnapshot` /
  `captureSnapshotGraph` from a flight `FlightOffer` + `FlightOrder` pair.
- **`./reference/contract`** — `ReferenceDataProvider` contract (airlines,
  airports, aircraft). Implementable at any layer.
- **`./reference/local-postgres`** — Reference data from plain Postgres
  tables in the operator's own database. **No external service, no network
  call.** The simplest deployment option.
- **`./reference/static-bundle`** — Reference data from a bundled JSON / CSV.

## Phase relationship

Phase 3 is independent of Phase 2 (RAG). Either can ship first; both build on
Phase 1 (`@voyant-travel/catalog`).

Flights opt **in** to:
- Booking snapshot graph (the most important participation)
- Provenance shape
- Webhook events
- Source disconnection lifecycle

Flights opt **out** of:
- Search index projection (live fan-out replaces it)
- Editorial overlays (no marketing copy on a flight)
- Embeddings / RAG (Phase 2 explicitly excludes flights)
- Pricing tiers (built into the multi-connection fan-out itself)
- Drift detection (live by definition)

## Usage

### Multi-connection search

```typescript
import { fanOutFlightSearch } from "@voyant-travel/flights/orchestration/fan-out"

const result = await fanOutFlightSearch({
  adapters: [hiskyAdapter, amadeusAdapter, charterConsolidatorAdapter],
  request: {
    slices: [
      { origin: "LHR", destination: "JFK", departureDate: "2026-10-15" },
      { origin: "JFK", destination: "LHR", departureDate: "2026-10-22" },
    ],
    passengers: { adults: 2 },
    cabin: "economy",
  },
  perConnectionTimeoutMs: 5000,
})

// result.offers — merged offers across all connections, deduped by
// itinerary fingerprint, sorted by cheapest price ascending.
// result.perConnection — status + latency per connection.
```

### Runtime validation

```typescript
import { flightBookRequestSchema } from "@voyant-travel/flights/contract/schemas"
import type { FlightBookRequest } from "@voyant-travel/flights/contract/types"

const request: FlightBookRequest = flightBookRequestSchema.parse(await req.json())
```

### Durable supplier mutations

`flights.runtime` remains the provider-neutral connector surface for search,
reads, and admin routes. It does not make supplier mutations safe by itself.
Deployments that expose `ticket_flight_order` or `cancel_flight_order` must
select a provider for `flights.durable-action-runtime`. That provider owns a
stable backend identity, caller-controlled idempotency, reconciliation after
ambiguous responses, immutable organization-scoped provider authority, and an
isolated non-ticketing conformance probe. The host must also schedule
`drainDurableFlightActionOperations`; its leased reconciliation pass recovers
pending or abandoned supplier operations without relying on the original
caller to retain and replay an approval envelope. Operational status can be
read by operation id with `getDurableFlightActionOperation`. Voyant isolates
tenants at the deployment boundary (one database, one runtime per
organization — see ADR-0001), so the package does not filter this lookup by
organization; the stored `organizationId` is supplier metadata, not an
access-control predicate. Without that selected port, both mutation Tools
remain unavailable.

### Reference data — operator's own Postgres tables

```typescript
import {
  createLocalPostgresReferenceProvider,
} from "@voyant-travel/flights/reference/local-postgres"

// Schema lives in the operator's own DB. No external service required.
const reference = createLocalPostgresReferenceProvider({ db })

const ba = await reference.getAirline("BA")
// → { iataCode: "BA", icaoCode: "BAW", name: "British Airways", country: "GB" }
```

The package also owns an optional curated fixture for local and demo deployments:

```typescript
import { seedFlightReferenceFixtures } from "@voyant-travel/flights/reference/fixtures"

await seedFlightReferenceFixtures(db)
```

The insert is idempotent. Consumer projects do not need to copy or maintain the fixture rows.

See `docs/architecture/catalog-flights-architecture.md` for the full design.
