# Dynamic packaging — on-demand itineraries on Trips

Status: partially shipped — both keystone gaps landed (P1 #2081, P2 #2082); P3–P5 are follow-ups
Owner: TBD
Tracking: #1600 (closed → split into #2081 + #2082)
Related (current): [`catalog-architecture.md`](./catalog-architecture.md), [`catalog-flights-architecture.md`](./catalog-flights-architecture.md), [`catalog-booking-engine.md`](./catalog-booking-engine.md), [`catalog-supply-models.md`](./catalog-supply-models.md), [ADR-0006](../adr/0006-live-availability-search-contract.md) (availability-search contract), `@voyant-travel/trips`, `@voyant-travel/proposals`, #1541 (Proposals — **shipped**), #1470 (Composite Products — **shipped**)

> **Why this doc was rewritten.** The original RFC (#1600, 2026-06-09) pointed at a `dynamic-packaging-rfc.md` that never landed, named the package `@voyantjs/travel-composer` (now `@voyant-travel/trips`), and phased in work that has since shipped under #1541 and #1470. This version re-bases on the current code and cuts the scope down to the two pieces that genuinely **do not exist yet**.

## 1. What already shipped (no longer in scope)

The original RFC's P0 and most of its "accept → reserve → checkout" spine converged from the Proposals/Trips/Composite-Products direction:

- **P0 — Trip commit backend (DONE).** `@voyant-travel/trips` has Trip Envelope + Trip Components, deterministic `priceTrip` / `reserveTrip` / `startCheckout` / `completeTripCheckout`, per-component compensation, and immutable `tripSnapshots` (`packages/trips/src/service*.ts`, `schema.ts`).
- **PackageOffer → accept → reserve → checkout (SUBSTANTIALLY DONE via #1541).** `@voyant-travel/proposals` models a Proposal (deal) → versioned proposals, each freezing a `TripSnapshot`. Public acceptance is a 3-phase advisory-locked saga (prepare → reserve-outside-txn → finalize) with crash recovery and race cleanup (`packages/proposals/src/proposal-routes.ts`). **#1612** made sourced-catalog acceptance reservation-safe; **#1605** covers concurrent accepts. Proposal Versions already support **alternatives** (`label`) and **revisions** (`supersedesId`).
- **Composite Products (DONE, #1470).** Answers the original "where does `PackageOffer` live" open question for the pre-packaged case.
- **`releaseHold` for owned inventory (DONE).** Now an optional method on the owned booking handler with a grace-deferred reaper (`packages/catalog/src/booking-engine/owned-handler.ts:181`). The RFC's "build it, don't assume it" caveat is resolved for owned rows; **sourced adapters still only expose `cancel`**.

**Net:** the only parts of the original RFC that did *not* get built are exactly the two keystone gaps it identified. Everything else is delivered or is a thin follow-up.

## 2. The two keystone gaps (the entire remaining scope)

Both are still **open**. Nothing dynamic is possible without #1; #2 builds on it.

### Gap 1 — Generalized live availability-search fan-out

Today only flights fan out. `fanOutFlightSearch` (`packages/flights/src/orchestration/fan-out.ts`) parallelizes `searchFlights` across connections, merges by itinerary fingerprint, returns `MergedFlightOffer[]` + per-connection status. **No equivalent exists for non-flight verticals.** The catalog `SourceAdapter` (`packages/catalog-contracts/src/adapter/source-adapter.ts`) exposes `discover` / `liveResolve` / `reserve` / `cancel` — resolve-then-book, never search. There is no `AvailabilityCandidate` type anywhere.

What to add (see §4 for sketches):

- A capability-gated `searchAvailability` on the catalog source-adapter contract.
- A vertical-agnostic `fanOutAvailabilitySearch` mirroring the flights fan-out (per-connection timeout, partial success, ranked merge).
- A normalized `AvailabilityCandidate` shape.
- Flights bridged in via a `MergedFlightOffer → AvailabilityCandidate` mapping (a bridge, not proof the generic contract already fits).
- Owned inventory via an **owned search handler**, mirroring the existing owned-booking-handler vs source-adapter split (`OwnedBookingHandlerRegistry` already exists) — not a fake external provider.
- Voyant Connect as the first non-flight sourced adapter.

### Gap 2 — Requirement / Candidate model in Trips

Trips is strictly pull-only: every component already carries a pinned `entityId` / `selectedOffer` (`packages/trips/src/catalog-component-adapter.ts`, `flight-component.ts`). There is no unresolved requirement, no ranked candidate set, no re-shop.

What to add:

- A **Trip Requirement** — an unresolved customer-facing need ("3-night stay in Cairo, 2 adults") held on an envelope.
- **Trip Candidates** — `AvailabilityCandidate`s attached to a requirement, ranked and TTL'd. These are **resumable trip state**, re-validated before commit — not a catalog cache.
- Services: `addRequirement` / `selectCandidate` (resolves a requirement into a pinned component). Candidate sourcing is admitted by the durable `source_trip_requirement_candidates` Tool and settled by the fixed Trips worker; synchronous sourcing/re-shop services are intentionally absent.
- Invariants: TTL reaper, selected-uniqueness per requirement, required-requirement reserve gate.

This now plugs straight into the **already-shipped** Proposal Version acceptance saga rather than needing its own commit backend.

### 2.1 Contract-first — bring your own connector (Voyant Connect is not required)

The integration point is a **public contract**, not a product. Voyant Connect is *a* provider — the first worked example — and is explicitly non-privileged. The `SourceAdapter` interface documents this directly: *"All implementations satisfy this same surface — no implementer is privileged."* The dependency runs **contract ← Connect**, never the reverse: neither `@voyant-travel/catalog` nor `@voyant-travel/catalog-contracts` depends on the Connect plugin, and `fanOutAvailabilitySearch` never names a provider — it iterates whatever adapters and handlers the **deployment** injects. This is the same stance the rest of the platform takes (provider specifics never live in a shared package; the deployment assembles).

A deployment brings supply two ways, neither involving Voyant Connect:

- **Sourced (external supplier API).** Implement `SourceAdapter.searchAvailability` and declare `supportsAvailabilitySearch`. The capability flag + method presence is the gate; the fan-out flags any adapter that lacks them as `capability_missing` and continues. Example: a bedbank, GDS, or DMC adapter.

  ```ts
  const myBedbank: SourceAdapter = {
    kind: "bedbank:acme",
    capabilities: { verticals: ["accommodations"], supportsAvailabilitySearch: true, /* … */ },
    async searchAvailability(ctx, req) {
      const rooms = await fetchAcme(req.criteria)
      return { status: "ok", candidates: rooms.map(toCandidate) }
    },
  }
  fanOutAvailabilitySearch({
    adapters: [{ connectionId: "acme", adapter: myBedbank }],
    request,
  })
  ```

- **Owned (the operator's own inventory).** Implement `OwnedAvailabilitySearchHandler`, register it, and pass it via `ownedHandlers`. No external provider at all — owned and sourced supply merge into one ranked candidate list.

Two honest caveats on the "BYO-ready" claim:

1. **Proven against two shapes so far** — the flights bridge and an in-test mock adapter. Validating the generic contract against a *real third-party API* (the Voyant Connect follow-up on #2081) is what confirms the shape fits external suppliers; if it doesn't fit cleanly, the contract may need a tweak before it's truly BYO-stable.
2. **Code-wired today** — adapters are injected in deployment code. A config-driven "register your connector" surface (mirroring the existing source-adapter registry) lands with the staff-facing surface in a later slice.

## 3. Terminology

`Slot` is canonical (dated inventory unit); the catalog plane has no generic `Offer`. New terms avoid `Offer` / `Slot` / `Option`:

- **Trip Requirement** — unresolved need on a Trip Envelope.
- **AvailabilityCandidate** — normalized live adapter-search result.
- **Trip Candidate** — an `AvailabilityCandidate` attached to a Requirement; ranked, TTL'd, resumable.

These are added to `UBIQUITOUS_LANGUAGE.md` + an ADR for the contract extension before they become public API. (`PackageOffer` from the original RFC is effectively realized today as the ProposalVersion/TripSnapshot proposal; we do not introduce a second primitive for it.)

## 4. Contract sketches (Gap 1)

Grounded against the current contracts. Catalog uses `snake_case`; flights use `camelCase`. The new types live in `packages/catalog-contracts/src/adapter/`.

```ts
// contract-shared.ts — capability flag (sibling of supportsLiveResolution)
export interface AdapterCapabilities {
  // ...existing...
  /** Whether the adapter can search live availability across an inventory space. */
  supportsAvailabilitySearch?: boolean
}

// new: availability-search.ts
export interface AvailabilitySearchRequest {
  /** Vertical being searched (e.g. "accommodations", "extras"). */
  vertical: string
  /** Vertical-shaped criteria: destination, dateRange, pax, board, etc. */
  criteria: Record<string, unknown>
  /** Monotonic criteria-schema version so adapters can reject unknown shapes. */
  criteriaVersion: string
  /** Mirrors LiveResolveRequest.scope. */
  scope: SourceAdapterRequestScope
  /** Soft per-adapter deadline; the fan-out enforces a hard timeout too. */
  deadlineMs?: number
  cursor?: string
  limit?: number
}

/** Normalized live search result — the cross-vertical unit the composer ranks. */
export interface AvailabilityCandidate {
  /** Stable within this search; NOT replay-safe for booking (re-resolve before reserve). */
  candidateRef: string
  entity_module: string
  entity_id: string
  /** Parameters to hand back to reserve()/liveResolve() to pin this exact selection. */
  selection: Record<string, unknown>
  price: { amount: string; currency: string }
  /** Adapter-internal freshness; the composer persists candidates as trip state, re-validated at commit. */
  expiresAt?: Date
  /** Internal-only fields (net, margin, sourceRef) live here, never in public DTOs. */
  providerData?: Record<string, unknown>
}

export interface AvailabilitySearchResult {
  candidates: AvailabilityCandidate[]
  status: "ok" | "partial" | "empty" | "unsupported"
  next_cursor?: string
}

// source-adapter.ts — new optional method, gated by supportsAvailabilitySearch
export interface SourceAdapter {
  // ...existing...
  searchAvailability?(
    ctx: SourceAdapterContext,
    request: AvailabilitySearchRequest,
  ): Promise<AvailabilitySearchResult>
}
```

```ts
// fan-out: vertical-agnostic, mirrors fanOutFlightSearch's partial-success shape
export interface FanOutAvailabilityResult {
  candidates: AvailabilityCandidate[]            // merged + ranked across connections
  perConnection: ConnectionResult[]              // reuse the flights ConnectionResult shape
}
export function fanOutAvailabilitySearch(opts: {
  adapters: ReadonlyArray<{ connectionId: string; adapter: SourceAdapter }>
  ownedHandlers?: OwnedSearchHandlerRegistry      // owned inventory as a search source
  request: AvailabilitySearchRequest
  perConnectionTimeoutMs?: number
  limit?: number
}): Promise<FanOutAvailabilityResult>

// flights bridge — not a re-implementation
export function mergedFlightOfferToCandidate(o: MergedFlightOffer): AvailabilityCandidate
```

## 5. Phased plan

- **P1 — `searchAvailability` primitive (Gap 1) — SHIPPED (#2081 via PR #2084).** `supportsAvailabilitySearch` + `AvailabilitySearchRequest`/`AvailabilityCandidate`/`AvailabilitySearchResult` on the source-adapter contract, vertical-agnostic `fanOutAvailabilitySearch` (per-source timeout, vertical-gating, ranked merge, per-candidate origin + per-source cursor), owned-search-handler registry, and the flights `MergedFlightOffer → AvailabilityCandidate` bridge. Follow-up: the Voyant Connect `searchAvailability` adapter lives in the `connect-sdk` repo (unblocked once `catalog-contracts` publishes).
- **P2 — Requirement/Candidate in Trips (Gap 2) — SHIPPED (#2082 via PRs #2087, #2088).** `trip_requirements` + `trip_candidates` schema, `addRequirement` / `selectCandidate` (pins a draft component) / `expireStaleTripCandidates`, the three invariants (TTL reaper, selected-uniqueness, required-requirement reserve gate), and durable Tool-admitted candidate sourcing through a fixed Trips worker. Inline HTTP/service fan-out and re-shop mutations were removed when the durable operation replaced them. Resolves into the existing Proposal Version acceptance saga.
- **P3 — package-level markup/pricing.** The only net-new pricing piece; the accept/reserve/checkout/freeze spine already exists in Proposals. Follow-up.
- **P4 — intent-driven auto-assembly + AI.** Max AI tools as callers shipped in `voyant-cloud` (`agent-core` `trips.ts`, platform PR #637) — they drive the P2 endpoints. Rules-based `assembleTrip(intent)` is the remaining follow-up.
- **P5 — booking hardening** (durable saga, sourced-adapter `releaseHold`, cross-supplier drift correlation). Follow-up; owned `releaseHold` already exists.

## 6. Open questions

1. **Criteria-schema governance** — how `criteriaVersion` is versioned/deprecated across many adapters.
2. **Candidate persistence depth** — persist (resume/re-rank/audit) vs cache-only. Lean: persist + reaper.
3. **Sourced `releaseHold`** — sourced adapters only expose `cancel`; compensation falls back to cancel/staff-remediation until a release primitive lands (owned rows already have one).
4. **Atomicity promise** — best-effort + staff remediation vs all-or-nothing. Lean: best-effort with strong compensation.

## 7. Success criteria

- Staff or AI: **intent → live candidates → assembled priced trip → Proposal Version accept → reserve → checkout**, without pre-selecting entities.
- Owned + sourced supply in **one ranked candidate list** per requirement.
- Changing one requirement **re-sources and re-prices**.
- Net/margin/provenance never leak to public DTOs; price re-validated at reserve.
- Partial supplier failure → deterministic compensation or staff remediation, never a half-booked "confirmed" trip.
- Pre-packaged tour (Composite Product) and dynamic FIT trip share the **same primitives** without re-modeling Products.
