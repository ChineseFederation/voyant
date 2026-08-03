/**
 * Live availability-search contract.
 *
 * The cross-vertical search primitive the dynamic-packaging motion is built
 * on. Unlike `liveResolve` (resolve volatile fields for an already-selected
 * entity), `searchAvailability` searches an inventory space — destination +
 * dates + pax → ranked candidates — across one or more suppliers.
 *
 * Capability-gated by `AdapterCapabilities.supportsAvailabilitySearch`.
 *
 * See `docs/architecture/dynamic-packaging-rfc.md` §2 (Gap 1) and §4.
 */

import type { SourceAdapterRequestScope } from "./booking-forwarding.js"

/**
 * One live availability-search request, scoped to a single vertical. The
 * `criteria` bag is vertical-shaped (destination, dateRange, pax, board, …);
 * adapters validate it against `criteriaVersion` before searching.
 */
export interface AvailabilitySearchRequest {
  /** Vertical being searched (e.g. "accommodations", "products", "flights"). */
  vertical: string
  /**
   * Vertical-specific search criteria. Free-form, but adapters recognize
   * well-known keys per vertical (destination, dateRange, pax, board, …).
   */
  criteria: Record<string, unknown>
  /**
   * Monotonic criteria-schema version. Adapters reject criteria shapes they
   * don't recognize rather than silently mis-searching. See RFC §6.
   */
  criteriaVersion: string
  /** Per-request scope. Mirrors `LiveResolveRequest.scope`. */
  scope: SourceAdapterRequestScope
  /**
   * Soft per-adapter deadline in milliseconds. The fan-out also enforces a
   * hard per-connection timeout; this lets a well-behaved adapter return a
   * partial page before the hard cutoff.
   */
  deadlineMs?: number
  /** Opaque pagination cursor from a prior result. */
  cursor?: string
  /** Caller-supplied cap on returned candidates. */
  limit?: number
}

/**
 * Normalized live search result — the cross-vertical unit the composer ranks
 * and (later) attaches to a Trip Requirement as a Trip Candidate.
 *
 * Internal-only economics (net, margin, supplier ref) live under
 * `providerData` and must never appear in public-facing DTOs.
 */
export interface AvailabilityCandidate {
  /**
   * Stable within this search response, used to correlate a pick back to its
   * source. NOT replay-safe for booking — `selection` must be re-resolved
   * against the adapter before reserve.
   */
  candidateRef: string
  /** Vertical that produced this candidate (e.g. "accommodations"). */
  entity_module: string
  /** Entity identifier within the vertical. */
  entity_id: string
  /**
   * Vertical-shaped selection parameters needed to re-resolve and pin this
   * exact candidate at reserve time (e.g. roomTypeId / ratePlanId / board,
   * or departure + pax). Handed back to `liveResolve` / `reserve`.
   */
  selection: Record<string, unknown>
  /**
   * Origin of this candidate, so a selection can be routed back to the right
   * source at reserve time — sourced booking dispatch is keyed by
   * `connectionId`. An adapter that aggregates several upstream connections
   * (e.g. a cross-provider search) sets this per-candidate to the true
   * origin; otherwise the fan-out stamps it from the dispatching connection /
   * owned module. Optional only so adapters need not construct it themselves.
   */
  source?: { kind: "sourced"; connectionId: string } | { kind: "owned"; module: string }
  /** Public-safe price for ranking and display. */
  price: { amount: string; currency: string }
  /**
   * When the candidate's price/availability goes stale. Adapter-internal
   * freshness; the composer persists candidates as resumable trip state and
   * re-validates before commit, so this is a hint, not a contract.
   */
  expiresAt?: Date
  /**
   * Provider-internal data — net cost, margin, supplier ref, raw payload.
   * Opaque round-trip; never serialized into a public DTO.
   */
  providerData?: Record<string, unknown>
}

/** Outcome classification for a single adapter's search response. */
export type AvailabilitySearchStatus = "ok" | "partial" | "empty" | "unsupported"

export interface AvailabilitySearchResult {
  candidates: AvailabilityCandidate[]
  status: AvailabilitySearchStatus
  /** Present when more candidates are available beyond this page. */
  next_cursor?: string
}
