/** Shared source-adapter capability, projection, reservation, and content types. */

import type { Provenance } from "../provenance.js"
import type {
  CancelResult,
  ModifyReservationResult,
  ReserveResult,
  SourceAdapterRequestScope,
} from "./booking-forwarding.js"
import type { ProviderCapabilityDeclaration } from "./provider-contracts.js"

export type {
  CancelRequest,
  CancelResult,
  ModifyReservationRequest,
  ModifyReservationResult,
  ReserveRequest,
  ReserveResult,
  SourceAdapterRequestScope,
} from "./booking-forwarding.js"
export { ReservationDispatchError } from "./booking-forwarding.js"
export type {
  PushAvailabilityRequest,
  PushAvailabilityResult,
  PushBookingRequest,
  PushBookingResult,
  PushContentRequest,
  PushContentResult,
} from "./channel-push-contracts.js"
export type {
  AvailabilityBadge,
  AvailabilityBadgeKind,
  AvailabilityProjection,
  AvailabilityRowKind,
  AvailabilityStatus,
  AvailabilityUnitPrecision,
  CapabilitySupport,
  PromotionApplicability,
  PromotionApplicabilityConstraint,
  PromotionApplicabilityConstraintKind,
  PromotionApplicabilityEvaluation,
  PromotionApplicabilityResolution,
  PromotionDisplayFields,
  PromotionMediaAsset,
  PromotionMediaKind,
  PromotionPriceEffect,
  PromotionStackingSemantics,
  ProviderCapabilityDeclaration,
  ProviderCapabilityKey,
  ProviderPromotion,
} from "./provider-contracts.js"

// ─────────────────────────────────────────────────────────────────────────────
// Reservation retrieval
// ─────────────────────────────────────────────────────────────────────────────

export type GetReservationRequest =
  | {
      upstream_ref: string
      idempotency_key?: never
      scope?: SourceAdapterRequestScope
    }
  | {
      upstream_ref?: never
      idempotency_key: string
      scope?: SourceAdapterRequestScope
    }

export type ReservationStatus =
  | ReserveResult["status"]
  | CancelResult["status"]
  | ModifyReservationResult["status"]
  | "cancelling"

export interface GetReservationResult {
  upstream_ref: string
  status: ReservationStatus
  /** Stable write key of the last upstream mutation, when the source exposes it. */
  last_operation_idempotency_key?: string
  /** Adapter-computed fingerprint of the mutable reservation state. */
  state_fingerprint?: string
  /** When the upstream itself last modified this reservation. */
  source_updated_at?: Date
  /** Opaque per-vertical payload (itinerary, pricing snapshot, traveler details). */
  upstream_payload?: Record<string, unknown>
}

export interface ListReservationsQuery {
  cursor?: DiscoveryCursor
  limit?: number
  /** Filter by status. Empty / omitted means all statuses. */
  status?: ReadonlyArray<ReservationStatus>
  /** Incremental sync helper — return reservations modified since this instant. */
  updated_after?: Date
  scope?: SourceAdapterRequestScope
}

export interface ListReservationsPage {
  reservations: GetReservationResult[]
  next_cursor: DiscoveryCursor
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection lifecycle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Capability declaration. Adapters return their capabilities at registration
 * so the catalog plane can route operations correctly and fail fast on
 * unsupported actions rather than producing wrong results silently.
 *
 * Adapters can be inbound-only (sourcing inventory we sell), outbound-only
 * (channels where we syndicate our owned products), or bidirectional. The
 * `supports*` flags below cover both directions; inbound flags gate
 * `liveResolve`/`getContent`/`reserve`/`cancel`, outbound flags gate
 * `pushBooking`/`pushAvailability`/`pushContent`.
 *
 * See `docs/architecture/channel-push-architecture.md` §3.
 */
export interface AdapterCapabilities {
  /** Verticals this adapter feeds (e.g. ["products", "accommodations"]). */
  verticals: string[]
  /** Whether the adapter can resolve volatile-live fields on demand. */
  supportsLiveResolution: boolean
  /**
   * Whether the adapter can search live availability across an inventory
   * space (destination + dates + pax → ranked candidates), as opposed to
   * resolving volatile fields for an already-selected entity. Gates
   * `searchAvailability`.
   *
   * See `docs/architecture/dynamic-packaging-rfc.md` §2 (Gap 1).
   */
  supportsAvailabilitySearch?: boolean
  /** Whether the adapter can emit drift events. */
  supportsDriftDetection: boolean
  /** Whether the adapter forwards bookings to the upstream source. */
  supportsBookingForwarding: boolean
  /**
   * Whether the adapter can retrieve upstream reservations on demand.
   * Gates `getReservation` and `listReservations`.
   */
  supportsReservationRetrieval?: boolean
  /** Whether `getReservation` accepts the original stable write key. */
  supportsReservationLookupByIdempotencyKey?: boolean
  /**
   * Whether `cancel` returns a terminal upstream status synchronously.
   * When false, the adapter may return `status: "pending"` and drive the
   * final transition later through drift, polling, or connector-specific
   * reconciliation.
   */
  supportsSyncCancellation?: boolean
  /** Post-book operations the adapter supports (modify, cancel, status, refund). */
  postBookOperations: ReadonlyArray<"modify" | "cancel" | "status" | "refund" | "exchange" | "void">
  /**
   * Optional internal-cache TTL hint in seconds. Source adapters may cache
   * volatile-live calls inside themselves; declaring the TTL lets the
   * catalog plane fail soft on staleness expectations without prescribing
   * the cache mechanism.
   */
  cacheTtlSeconds?: number | null
  /**
   * Whether the adapter implements `getContent` (rich detail-page content
   * for sourced rows: itinerary, media, options, terms). When false, the
   * catalog plane synthesizes thin content from the indexed projection +
   * editorial overlay instead of calling the adapter.
   *
   * See `docs/architecture/catalog-sourced-content.md` §3.1.
   */
  supportsContentFetch?: boolean
  /**
   * BCP 47 language tags this connection can serve content in. The catalog
   * plane uses this to plan backfills (preload deployment-configured
   * locales) and to render an empty-state when the requested locale is not
   * supported. Empty / absent → unknown; the plane probes per-call.
   */
  supportedContentLocales?: ReadonlyArray<string>
  /**
   * When true, the adapter owns its content cache. The catalog plane treats
   * `getContent` as pass-through: reads call the adapter directly, skip
   * `*_sourced_content` cache reads/writes, and do not serve SWR fallback rows.
   *
   * Default false: the catalog plane owns the sourced-content cache.
   */
  ownsContentCache?: boolean
  /**
   * When true, the adapter owns its availability / live-resolve cache. The
   * catalog plane treats `liveResolve` as pass-through and must not memoize
   * live availability results.
   *
   * Default false.
   */
  ownsAvailabilityCache?: boolean

  /**
   * Per-supplier hold-release grace period in milliseconds. When the
   * booking-journey reaper finds an expired draft, it defers calling
   * the supplier's release primitive until `expires_at + grace` has
   * passed.
   *
   * Cruise lines and luxury suppliers commonly hold capacity for
   * 24–72h after a journey times out to handle "I'll be right back"
   * scenarios; mass-market verticals release immediately.
   *
   * Per booking-journey-architecture §12.9. Default `0` (immediate
   * release).
   */
  holdReleaseGraceMs?: number

  // ── Outbound (channel push) ───────────────────────────────────────────
  // Per channel-push-architecture §3. Three independent flags so an
  // adapter can opt into each push direction independently.

  /** Whether the adapter accepts booking commits pushed from us. */
  supportsBookingPush?: boolean
  /** Whether the adapter accepts availability changes pushed from us. */
  supportsAvailabilityPush?: boolean
  /** Whether the adapter accepts content updates pushed from us. */
  supportsContentPush?: boolean

  /**
   * Provider-specific capability and limitation facts that are more granular
   * than method-level gates. These rows are advisory but explicit: a provider
   * can declare category inventory counts as supported while declaring exact
   * physical inventory units as unsupported.
   */
  providerCapabilities?: ReadonlyArray<ProviderCapabilityDeclaration>
}

/** Connection lifecycle state. Aligned with §5.10's two-mode disconnect model. */
export type ConnectionState = "active" | "paused" | "disconnected" | "error"

/**
 * Context passed to every adapter call. Identifies the connection and may
 * carry credentials, tenant scope, and tracing identifiers.
 */
export interface SourceAdapterContext {
  /** Connection identifier (typed-id pointing at the connection record). */
  connection_id: string
  /**
   * Credentials bag, keyed by adapter convention. Templates pass these in;
   * adapters decode per their needs.
   */
  credentials?: Record<string, string>
  /** Optional tenant identifier when the adapter serves multiple tenants. */
  tenant_id?: string
  /** Correlation id for tracing across the catalog pipeline. */
  correlation_id?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Discovery and projection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One emitted CatalogEntry projection. Carries provenance, the vertical's
 * shape, and the field-keyed values the adapter discovered.
 */
export interface CatalogProjection {
  entity_module: string
  entity_id: string
  provenance: Provenance
  /** Field-keyed source values (matches the vertical's field-policy paths). */
  fields: Record<string, unknown>
}

/**
 * Discovery cursor. Adapters with paginated upstreams use this to checkpoint
 * progress; opaque to the catalog plane.
 */
export type DiscoveryCursor = string | undefined

/** Discovery result page. */
export interface DiscoveryPage {
  projections: CatalogProjection[]
  next_cursor: DiscoveryCursor
}

// ─────────────────────────────────────────────────────────────────────────────
// Live resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Live-resolve request. Carries enough context for the adapter to fetch
 * volatile-live values for one or more entities.
 */
export interface LiveResolveRequest {
  ids: string[]
  /** Server-resolved durable upstream identity keyed by local entity id. */
  source_refs?: Record<string, string>
  /** Variant scope for the request (mirrors the resolver's scope). */
  scope: SourceAdapterRequestScope
  /**
   * Date range or other vertical-specific parameters. Adapters recognize
   * well-known keys such as date/pax fields and, for sourced stays/packages,
   * `roomTypeId` / `ratePlanId` / `board` to re-resolve the exact room + rate
   * the operator picked.
   */
  parameters?: Record<string, unknown>
}

export interface LiveResolveResult {
  /** Entity-keyed live field values. */
  values: Record<string, Record<string, unknown>>
  /** Entities the adapter could not resolve, with reason codes. */
  failed?: Record<
    string,
    | "timeout"
    | "not_found"
    | "unavailable"
    | "departure_not_found"
    | "departure_unavailable"
    | "unsupported"
    | "error"
  >
}

// ─────────────────────────────────────────────────────────────────────────────
// Rich content
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get-content request. Asks the adapter for one entity's full detail-page
 * content (itinerary, media, options, terms, room types, departures) in one
 * locale. Distinct from `liveResolve` — this returns durable content, not
 * volatile-live values.
 *
 * The catalog plane's content cache calls this on a refresh cadence (TTL or
 * drift event) and stores the result in the per-vertical, per-locale
 * content table.
 *
 * See `docs/architecture/catalog-sourced-content.md` §3.1.
 */
export interface GetContentRequest {
  entity_module: string
  entity_id: string
  /**
   * BCP 47 language tag (e.g. "ro-RO", "de-DE", "en-GB"). Required —
   * locale is load-bearing in this contract. Adapters that genuinely have
   * only one locale accept any value and return their canonical content
   * with `returned_locale` pointing at what they actually have. The
   * contract is "tell me your best for this locale" — never "give me
   * whatever you have."
   */
  locale: string
  /** Other scope axes — kept separate from locale for clarity. */
  market?: string
  currency?: string
}

export interface GetContentResult {
  entity_module: string
  entity_id: string
  source_ref: string
  /**
   * The locale this payload is in. May differ from `request.locale` when
   * the upstream did its own fallback (e.g. requested ro-RO, returned
   * en-GB because it had no Romanian content). The catalog plane records
   * this so subsequent fallback decisions know what's actually cached vs.
   * what was requested.
   */
  returned_locale: string
  /**
   * True when the upstream marks the payload as machine-translated (rather
   * than authored content). Read paths can opt out of machine-translated
   * rows for ops-side views.
   */
  machine_translated?: boolean
  /**
   * Vertical-specific content payload. The catalog plane treats it as
   * opaque; the vertical's content service knows how to read it (and
   * validates against `content_schema_version` before writing to the
   * cache). The shape is the vertical's existing owned-content shape (e.g.
   * for products: `{ product, options[], days[], media[] }`).
   */
  content: unknown
  /**
   * Vertical-managed schema version of the `content` payload (e.g.
   * "products/v3", "cruises/v1"). Cache writes are gated on the vertical's
   * validator for this version; cache reads ignore rows with an unknown /
   * older version. Lets us evolve content shapes without invalidating /
   * mass-rewriting cache rows.
   */
  content_schema_version: string
  /**
   * When the upstream itself last modified this content (their
   * `updated_at`, ETag-derived timestamp, etc.). Used by the reconciler /
   * drift detector and by snapshot audit trails.
   */
  source_updated_at?: Date
  /**
   * When the upstream considers this content fresh until. Hint for the
   * catalog plane's cache; not load-bearing if absent.
   */
  fresh_until?: Date
  /** ETag-style marker for HTTP-cache revalidation on the next pull. */
  etag?: string
}
