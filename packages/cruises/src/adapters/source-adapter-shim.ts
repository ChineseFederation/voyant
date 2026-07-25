// agent-quality: file-size exception -- owner: cruises; existing module stays co-located until a dedicated split preserves behavior and tests.
/**
 * Adapt a vertical-shaped `CruiseAdapter` (with its multi-method
 * `fetchCruise / fetchSailing / fetchShip / fetchSailingItinerary`
 * surface) into a catalog-plane `SourceAdapter` so the cruises module
 * can participate in:
 *
 *   - The catalog plane's discovery / projection-capture pipeline
 *     (`sync.ts` writes a `catalog_sourced_entries` row per emitted
 *     projection), enabling the durable thin-content synthesizer
 *     fallback for cruises (sourced-content §2.5, §3.6).
 *   - The `getCruiseContent` SWR machinery (sourced-content §3.4) —
 *     the shim's `getContent` composes the cruise adapter's per-aspect
 *     fetches into one `CruiseContent` payload.
 *   - Catalog read-side content composition for projection and snapshot
 *     subscribers. Booking creation has no application caller here.
 *
 * Per the doc's Phase E note: the cruise adapter retains its internal
 * multi-call composition; only the public catalog surface narrows.
 *
 * Templates wire the shim by registering it into the catalog
 * `SourceAdapterRegistry` AT PROCESS START, alongside the cruise
 * adapter's own per-vertical registration. Both registrations are
 * cheap — they share the same underlying `CruiseAdapter` instance.
 */

import type {
  AdapterCapabilities,
  CancelRequest,
  CancelResult,
  CatalogProjection,
  ConnectionState,
  DiscoveryCursor,
  DiscoveryPage,
  GetContentRequest,
  GetContentResult,
  LiveResolveRequest,
  LiveResolveResult,
  ReserveRequest,
  ReserveResult,
  SourceAdapter,
  SourceAdapterContext,
} from "@voyant-travel/catalog"
import type { Provenance } from "@voyant-travel/catalog/provenance"

import { CRUISES_CONTENT_SCHEMA_VERSION, type CruiseContent } from "../content-shape.js"
import { decodeSourceRef, encodeSourceRef } from "../lib/key.js"

import type {
  CruiseAdapter,
  CruiseSearchProjectionEntry,
  ExternalCabinCategory,
  ExternalCruise,
  ExternalItineraryDay,
  ExternalSailing,
  ExternalShip,
  SourceRef,
} from "./index.js"

export interface CruiseSourceAdapterShimOptions {
  /**
   * The `source_kind` reported on every projection emitted by the
   * shim. Defaults to `"cruise:" + adapter.name` so multiple cruise
   * adapters (different agencies) coexist in the catalog registry
   * without colliding on `source_kind`.
   */
  sourceKind?: string
  /**
   * Optional translator from `SourceRef` → catalog-side `entity_id`.
   * Catalog `entity_id` is the Voyant-side TypeID; this shim produces
   * one synthetically by hashing the upstream ref so discovery is
   * idempotent. Templates can override when they have an external-id
   * → typeid mapping in their own DB.
   *
   * The default produces stable ids that round-trip across re-syncs:
   * `crus_${slug-of-externalId}`. The catalog plane uses the entity_id
   * as its primary key into `catalog_sourced_entries`, so stability is
   * load-bearing — drift on the id maps to a new entity.
   */
  buildEntityId?: (sourceRef: SourceRef) => string
  /**
   * Pagination batch size for `discover`. Defaults to 200 — large
   * enough to amortize HTTP overhead, small enough to cap memory.
   */
  pageSize?: number
  /**
   * BCP 47 locales the cruise adapter can serve content in. Reported
   * via `capabilities.supportedContentLocales`. Defaults to undefined
   * (unknown — caller probes per-call).
   */
  supportedContentLocales?: ReadonlyArray<string>
  /**
   * When false, declares `supportsContentFetch: false` so the catalog
   * plane skips `getContent` and falls through to the per-vertical
   * thin-content synthesizer (sourced-content §3.6). Defaults to
   * true — the shim composes a real `CruiseContent` payload from the
   * cruise adapter's per-aspect fetches.
   */
  supportsContentFetch?: boolean
}

export interface CruiseSourceAdapterShim extends SourceAdapter {
  /** The wrapped vertical adapter — exposed for diagnostics / tests. */
  readonly cruiseAdapter: CruiseAdapter
}

/**
 * Wrap a `CruiseAdapter` as a catalog `SourceAdapter`. The wrapped
 * adapter is shared by reference — its internal state (HTTP clients,
 * caches, credentials) is not duplicated.
 */
export function cruiseAdapterToSourceAdapter(
  cruiseAdapter: CruiseAdapter,
  options: CruiseSourceAdapterShimOptions = {},
): CruiseSourceAdapterShim {
  const sourceKind = options.sourceKind ?? `cruise:${cruiseAdapter.name}`
  const buildEntityId = options.buildEntityId ?? defaultBuildEntityId
  const pageSize = options.pageSize ?? 200
  const supportsContentFetch = options.supportsContentFetch ?? true

  const capabilities: AdapterCapabilities = {
    verticals: ["cruises"],
    supportsLiveResolution: true,
    supportsDriftDetection: false,
    supportsBookingForwarding: true,
    postBookOperations: ["cancel", "status"],
    supportsContentFetch,
    supportedContentLocales: options.supportedContentLocales,
  }

  return {
    cruiseAdapter,
    kind: sourceKind,
    capabilities,

    async connect(_ctx: SourceAdapterContext): Promise<void> {
      // CruiseAdapter has no explicit connect — the underlying HTTP
      // client is constructed at adapter creation time.
    },

    async pause(_ctx: SourceAdapterContext): Promise<void> {
      // No-op for the shim. Pause for cruise adapters typically means
      // "stop the polling loop", which is template-orchestrated.
    },

    async disconnect(_ctx: SourceAdapterContext): Promise<void> {
      // No-op. Templates revoke credentials at the cruise-adapter
      // layer, not via the catalog-plane shim.
    },

    async getState(_ctx: SourceAdapterContext): Promise<ConnectionState> {
      // CruiseAdapter doesn't surface state. Default to "active";
      // catalog-side disconnect detection happens through drift
      // events, not state polling.
      return "active"
    },

    async discover(_ctx: SourceAdapterContext, cursor?: DiscoveryCursor): Promise<DiscoveryPage> {
      // Use `searchProjection` (the cruise vertical's bulk-stream
      // surface) and translate each entry to a catalog
      // `CatalogProjection`. Cursor handling is opaque — the shim
      // walks the iterable up to `pageSize` items per page and
      // encodes a small JSON cursor with the offset.
      const offset = parseCursor(cursor)
      const projections: CatalogProjection[] = []
      let scanned = 0
      let nextCursor: DiscoveryCursor

      const iterator = cruiseAdapter.searchProjection({})[Symbol.asyncIterator]()
      // Skip past `offset` items so re-pagination is consistent.
      for (let i = 0; i < offset; i += 1) {
        const skip = await iterator.next()
        if (skip.done) {
          // Cursor advanced past end → return empty page.
          return { projections: [], next_cursor: undefined }
        }
      }

      while (scanned < pageSize) {
        const next = await iterator.next()
        if (next.done) break
        const entry = next.value as CruiseSearchProjectionEntry
        projections.push(toCatalogProjection(entry, sourceKind, buildEntityId))
        scanned += 1
      }

      const peek = await iterator.next()
      if (!peek.done) {
        nextCursor = encodeCursor(offset + scanned)
      }
      return { projections, next_cursor: nextCursor }
    },

    async liveResolve(
      _ctx: SourceAdapterContext,
      _request: LiveResolveRequest,
    ): Promise<LiveResolveResult> {
      // Cruise pricing flows through `fetchSailingPricing` per
      // sailing — but the catalog `LiveResolveRequest` is keyed by
      // entity_id (the cruise typeid), not by sailing. v1 leaves
      // this as an explicit not-supported: callers should use the
      // cruises module's per-sailing pricing routes directly. The
      // catalog plane's quote engine still works because cruises'
      // own quote path is exercised through the vertical's routes.
      return {
        values: {},
        failed: {
          /* nothing — empty result is the contract */
        },
      }
    },

    async getContent(
      _ctx: SourceAdapterContext,
      request: GetContentRequest,
    ): Promise<GetContentResult> {
      // Compose the cruise adapter's per-aspect fetches into one
      // `CruiseContent` payload. Itinerary is per-sailing, so it stays
      // attached to each sailing instead of being flattened onto the cruise.
      const sourceRef = entityIdToSourceRef(request.entity_id)
      const cruise = await cruiseAdapter.fetchCruise(sourceRef)
      if (!cruise) {
        throw new Error(
          `cruise content unavailable for ${request.entity_id} (adapter ${cruiseAdapter.name} returned null)`,
        )
      }

      const ship = cruise.defaultShipRef
        ? await cruiseAdapter.fetchShip(cruise.defaultShipRef)
        : null
      const sailings = await cruiseAdapter.listSailingsForCruise(cruise.sourceRef)
      const sailingsWithItinerary = await Promise.all(
        sailings.map(async (sailing) =>
          cruiseSailingFrom(sailing, await cruiseAdapter.fetchSailingItinerary(sailing.sourceRef)),
        ),
      )

      const content: CruiseContent = {
        cruise: cruiseSummaryFrom(cruise),
        ship: ship ? cruiseShipFrom(ship) : null,
        sailings: sailingsWithItinerary,
        cabin_categories: ship?.categories?.map(cruiseCabinCategoryFrom) ?? [],
        itinerary_stops: [],
        policies: cruisePoliciesFrom(cruise),
      }

      return {
        entity_module: "cruises",
        entity_id: request.entity_id,
        source_ref: encodeSourceRef(cruise.sourceRef),
        returned_locale: request.locale,
        content,
        content_schema_version: CRUISES_CONTENT_SCHEMA_VERSION,
      }
    },

    async reserve(_ctx: SourceAdapterContext, _request: ReserveRequest): Promise<ReserveResult> {
      // Cruise reservations require per-sailing context (cabin
      // category, occupancy, fare code, passengers). The catalog
      // `ReserveRequest` doesn't carry that level of detail, so v1
      // leaves cruise booking on the vertical's own commit path
      // (`POST /v1/admin/cruises/:key/booking`). When the journey
      // standardizes the descriptor, this shim can route through.
      throw new Error(
        `cruise booking via catalog SourceAdapter is not supported in v1 — call the cruises vertical's commit path directly (POST /v1/admin/cruises/:key/booking)`,
      )
    },

    async cancel(_ctx: SourceAdapterContext, _request: CancelRequest): Promise<CancelResult> {
      // Same reasoning as reserve — cancellation goes through the
      // cruise vertical's own routes for now.
      throw new Error("cruise cancellation via catalog SourceAdapter is not supported in v1")
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Translators — External* shapes → CruiseContent fields
// ─────────────────────────────────────────────────────────────────────────────

function cruiseSummaryFrom(c: ExternalCruise): CruiseContent["cruise"] {
  return {
    id: defaultBuildEntityId(c.sourceRef),
    name: c.name,
    status: c.status,
    description: c.description ?? c.shortDescription ?? null,
    cruise_type: c.cruiseType,
    hero_image_url: c.heroImageUrl ?? null,
    highlights: c.highlights ?? [],
    cruise_line: c.lineName,
    duration_nights: c.nights,
    embarkation_port: c.embarkPortName ?? null,
    disembarkation_port: c.disembarkPortName ?? null,
  }
}

function cruiseShipFrom(s: ExternalShip): NonNullable<CruiseContent["ship"]> {
  return {
    id: defaultBuildEntityId(s.sourceRef),
    name: s.name,
    ship_type: s.shipType ?? null,
    description: s.description ?? null,
    deck_plan_url: s.deckPlanUrl ?? null,
    deck_plans:
      s.decks?.map((deck) => ({
        name: deck.name,
        level: deck.level ?? null,
        image_url: deck.planImageUrl ?? null,
      })) ?? [],
    capacity: s.capacityGuests ?? null,
    decks: s.deckCount ?? null,
    year_built: s.yearBuilt ?? null,
    gallery: s.gallery ?? [],
  }
}

function cruiseSailingFrom(
  sail: ExternalSailing,
  itinerary: ReadonlyArray<ExternalItineraryDay> = [],
): CruiseContent["sailings"][number] {
  // Sailing duration: derived from departure→return when both are
  // present. Handles the common case where the upstream ships dates
  // but no explicit duration_nights.
  const start = new Date(sail.departureDate)
  const end = new Date(sail.returnDate)
  const durationNights =
    Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
      ? Math.max(0, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)))
      : null

  // The content schema requires lowest_price_cents + currency to be both-or-
  // neither. Some adapters surface a price without its currency (or vice versa);
  // an indicative "from" price without a currency isn't displayable anyway, so
  // drop the pair rather than fail validation. Accurate per-cabin pricing comes
  // from the live pricing endpoint, not this cached hint.
  const hasPricePair = sail.lowestPriceCents != null && sail.currency != null

  return {
    id: defaultBuildEntityId(sail.sourceRef),
    source_ref: sail.sourceRef.externalId,
    start_date: sail.departureDate,
    end_date: sail.returnDate,
    duration_nights: durationNights,
    status: sail.salesStatus ?? null,
    embarkation_port: sail.embarkPortName ?? null,
    disembarkation_port: sail.disembarkPortName ?? null,
    itinerary_stops: itinerary.map((day) => cruiseItineraryStopFrom(day)),
    lowest_price_cents: hasPricePair ? (sail.lowestPriceCents ?? null) : null,
    currency: hasPricePair ? (sail.currency ?? null) : null,
  }
}

function cruiseCabinCategoryFrom(
  cat: ExternalCabinCategory,
): CruiseContent["cabin_categories"][number] {
  return {
    id: defaultBuildEntityId(cat.sourceRef),
    code: cat.code,
    name: cat.name,
    description: cat.description ?? null,
    type: cat.roomType,
    capacity_min: cat.minOccupancy,
    capacity_max: cat.maxOccupancy,
    images: cat.images ?? [],
    floorplan_images: cat.floorplanImages ?? [],
    square_feet: cat.squareFeet ?? null,
    grade_codes: cat.gradeCodes ?? [],
    wheelchair_accessible: cat.wheelchairAccessible ?? false,
    inclusions: cat.amenities ?? [],
    feature_codes: cat.featureCodes ?? [],
    bed_configurations: cat.bedConfigurations ?? [],
    accessibility_features: cat.accessibilityFeatures ?? [],
    view_type: cat.viewType ?? null,
  }
}

function cruisePoliciesFrom(c: ExternalCruise): CruiseContent["policies"] {
  // ExternalCruise carries `inclusionsHtml` / `exclusionsHtml` as
  // free-form HTML. Map to supplier_notes — the doc's CruisePolicy
  // shape doesn't have a dedicated "inclusions" kind, and these
  // fields are typically displayed as supplemental text rather than
  // structural rules.
  const out: CruiseContent["policies"] = []
  if (c.inclusionsHtml) {
    out.push({ kind: "supplier_notes", body: c.inclusionsHtml })
  }
  if (c.exclusionsHtml) {
    out.push({ kind: "supplier_notes", body: c.exclusionsHtml })
  }
  return out
}

// Itinerary translator — exposed for tests / future per-sailing
// composition. The shim's `getContent` doesn't currently call this
// (itinerary is per-sailing), but verticals that wire a sailing-aware
// content path can use it.
export function cruiseItineraryStopFrom(
  day: ExternalItineraryDay,
  date?: string | null,
): CruiseContent["itinerary_stops"][number] {
  return {
    day_number: day.dayNumber,
    date: date ?? null,
    port_name: day.portName ?? "",
    arrival_time: day.arrivalTime ?? null,
    departure_time: day.departureTime ?? null,
    description: day.description ?? null,
    is_at_sea: day.isSeaDay ?? false,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Discovery → CatalogProjection
// ─────────────────────────────────────────────────────────────────────────────

function toCatalogProjection(
  entry: CruiseSearchProjectionEntry,
  sourceKind: string,
  buildEntityId: (ref: SourceRef) => string,
): CatalogProjection {
  const provenance: Provenance = {
    source_kind: sourceKind,
    source_provider:
      typeof entry.sourceRef.provider === "string"
        ? entry.sourceRef.provider
        : entry.sourceRef.connectionId,
    source_connection_id: entry.sourceRef.connectionId,
    source_ref: encodeSourceRef(entry.sourceRef),
    source_freshness: "sync",
    last_sourced_at: new Date(),
  }

  return {
    entity_module: "cruises",
    entity_id: buildEntityId(entry.sourceRef),
    provenance,
    fields: {
      // Provenance — mirrors the owned-cruise builder (`cruiseRowToProjection`)
      // so the catalog's Source column + sourced-row bookkeeping behave the
      // same for owned and sourced cruises.
      "source.kind": sourceKind,
      "source.ref": encodeSourceRef(entry.sourceRef),
      id: buildEntityId(entry.sourceRef),
      name: entry.name,
      slug: entry.slug,
      // Structural scalars — keys MUST match the cruise field policy
      // (`catalog-policy.ts`) and the catalog-ui columns, which are camelCase.
      // The indexer drops any field whose key isn't a policy path, so emitting
      // snake_case here silently blanked Type/Nights/etc. (issue #1466).
      cruiseType: entry.cruiseType,
      status: entry.salesStatus ?? null,
      nights: entry.nights,
      // Supplier / Ship columns facet on ids. connect-cruises ≥0.3.0 surfaces
      // the upstream external ids; map them onto the policy's id fields (#1466
      // fix 2). Falls back to null on older adapters that only carry names.
      lineSupplierId: entry.lineExternalId ?? null,
      defaultShipId: entry.shipExternalId ?? null,
      heroImageUrl: entry.heroImageUrl ?? null,
      thumbnailUrl: entry.heroImageUrl ?? null,
      embarkPortFacilityId: entry.embarkPortFacilityId ?? null,
      embarkPortCanonicalPlaceId: entry.embarkPortCanonicalPlaceId ?? null,
      disembarkPortFacilityId: entry.disembarkPortFacilityId ?? null,
      disembarkPortCanonicalPlaceId: entry.disembarkPortCanonicalPlaceId ?? null,
      // Canonical geography — the policy paths for these arrays are snake_case
      // (`region_ids[]` …), so the keys stay snake_case here (issue #1466).
      region_ids: entry.regionIds ?? [],
      waterway_ids: entry.waterwayIds ?? [],
      port_ids: entry.portIds ?? [],
      country_iso: entry.countryIso ?? [],
      regions: entry.regions ?? [],
      waterways: entry.waterways ?? [],
      ports: entry.ports ?? [],
      countries: entry.countries ?? [],
      themes: entry.themes ?? [],
      // Browse-time price + departure-window hints (Tier-1 indexed summaries;
      // quote-time price is volatile-live and resolved elsewhere).
      lowestPriceCached: entry.lowestPriceCents ?? null,
      lowestPriceCurrencyCached: entry.lowestPriceCurrency ?? null,
      lowestPriceUnit: "minor",
      earliestDepartureCached: entry.earliestDeparture ?? null,
      latestDepartureCached: entry.latestDeparture ?? null,
      // Departure month facet + count — populated by the source enrichment
      // (per-cruise sailing rollup). Default empty/null on adapters that
      // don't supply them so the field is simply absent from the index doc.
      departureMonths: entry.departureMonths ?? [],
      departureCount: entry.departureCount ?? null,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cursor encoding / entity-id translation
// ─────────────────────────────────────────────────────────────────────────────

function parseCursor(cursor: DiscoveryCursor): number {
  if (!cursor) return 0
  try {
    const parsed = JSON.parse(cursor)
    if (parsed && typeof parsed === "object" && typeof parsed.offset === "number") {
      return parsed.offset
    }
  } catch {
    // fall through
  }
  return 0
}

function encodeCursor(offset: number): DiscoveryCursor {
  return JSON.stringify({ offset })
}

/**
 * Default `entity_id` builder. Produces a stable URL-safe id that embeds the
 * full SourceRef. Stability is load-bearing: `catalog_sourced_entries` is keyed
 * on `entity_id`, so drift on the id maps to a new sourced row.
 */
function defaultBuildEntityId(sourceRef: SourceRef): string {
  return `crus_${encodeSourceRef(sourceRef)}`
}

/**
 * Inverse of `defaultBuildEntityId`. The legacy `crus_<slug>` fallback keeps
 * pre-encoded sourced rows readable, but new rows preserve the exact SourceRef.
 */
function entityIdToSourceRef(entityId: string): SourceRef {
  const raw = entityId.startsWith("crus_") ? entityId.slice("crus_".length) : entityId
  const decoded = decodeSourceRef(raw)
  if (decoded) return decoded
  const externalId = raw
  return { externalId }
}
