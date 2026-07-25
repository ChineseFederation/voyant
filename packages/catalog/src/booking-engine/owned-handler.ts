/**
 * `OwnedBookingHandler` + `OwnedBookingHandlerRegistry` — the
 * dispatch seam for owned-arm bookings.
 *
 * Per `docs/architecture/booking-journey-architecture.md` §6, the
 * catalog booking engine has two dispatch axes:
 *
 *   - Sourced rows go through `SourceAdapterRegistry` keyed by
 *     `connection_id` (one adapter per upstream connection).
 *   - Owned rows go through `OwnedBookingHandlerRegistry` keyed by
 *     `entity_module` (one handler per vertical — products,
 *     accommodations, cruises, etc.).
 *
 * The two registries live side-by-side, never wrap each other. The
 * dispatch direction inverts: instead of `@voyant-travel/catalog`
 * importing every vertical, each vertical imports this interface
 * and provides an implementation. Catalog stays a contract package;
 * verticals stay self-contained.
 *
 * Phase A (per doc §10) ships the registry + interface + the first
 * vertical handler (products). Subsequent phases land accommodations,
 * cruises, etc. against the same interface without re-architecting
 * the dispatch.
 */

import type { AnyDrizzleDb } from "@voyant-travel/db"

import type { SourceAdapterContext } from "../adapter/contract.js"
import type { PricingBasis } from "../snapshot/schema.js"

import type { BookingDraftShape } from "./draft-shape.js"
import { NoOwnedHandlerRegisteredError } from "./errors.js"

// ─────────────────────────────────────────────────────────────────────
// Handler-side context + request/result shapes
// ─────────────────────────────────────────────────────────────────────

export interface OwnedHandlerContext {
  db: AnyDrizzleDb
  /** Echoed through from the engine — handlers may use it for audit. */
  adapterContext: SourceAdapterContext
}

export interface OwnedQuoteScope {
  locale: string
  audience: string
  market: string
  currency?: string
}

export interface ComputeQuoteRequest {
  entityModule: string
  entityId: string
  scope: OwnedQuoteScope
  /**
   * Vertical-specific parameters echoed by callers. Free-form today;
   * Phase B adds a typed `BookingDraft` payload that supersedes this.
   */
  parameters?: Record<string, unknown>
  /**
   * Optional partial draft state — used when the wizard re-quotes
   * mid-journey. Owned handlers read pax counts, addons, accommodation
   * picks, billing country off this to compute the correct price.
   *
   * Typed as `unknown` here so Phase A doesn't pin the schema in the
   * catalog package; Phase B replaces with a Zod-validated
   * `BookingDraftV1` (see §8.5 of the doc).
   */
  draft?: unknown
}

export interface ComputeQuoteResult {
  available: boolean
  invalidReason?: string
  pricing?: PricingBasis
  /**
   * Per-quote journey descriptor. Owned handlers return this when
   * they have enough context (always, for products in Phase A; the
   * journey falls back to defaults when omitted).
   */
  shape?: BookingDraftShape
  /** Echoed back into `catalog_quotes.upstream_payload` for audit. */
  upstreamPayload?: Record<string, unknown>
}

export interface ComputeQuoteBatchSelection {
  selectionId: string
  entityId: string
  parameters?: Record<string, unknown>
  draft?: unknown
}

export interface ComputeQuotesRequest {
  entityModule: string
  scope: OwnedQuoteScope
  selections: ReadonlyArray<ComputeQuoteBatchSelection>
}

export interface ComputeQuoteBatchResult {
  selectionId: string
  result: ComputeQuoteResult
}

export interface HoldRequest {
  entityModule: string
  entityId: string
  /** Caller-supplied draft id; handlers tie holds to the draft so
   *  abandonment is observable. */
  draftId?: string
  ttlMs: number
  parameters?: Record<string, unknown>
}

export interface HoldResult {
  holdToken: string
  expiresAt: Date
}

// ─────────────────────────────────────────────────────────────────────
// Handler interface
// ─────────────────────────────────────────────────────────────────────

export interface OwnedBookingHandler {
  /** Vertical this handler claims. One handler per `entity_module`. */
  readonly entityModule: string

  /**
   * Per-vertical hold-release grace period in milliseconds. The
   * reaper defers calling `releaseHold` for `grace` past a draft's
   * expiry. Default `0` (immediate release).
   *
   * Mirrors `AdapterCapabilities.holdReleaseGraceMs` for sourced
   * holds. Per booking-journey-architecture §12.9.
   */
  readonly holdReleaseGraceMs?: number

  /**
   * Live-quote an owned row for a draft. The engine calls this on
   * every meaningful input change. Returns shape + pricing +
   * availability.
   *
   * Implementations should be idempotent — the same input must
   * produce the same output (modulo time-sensitive fields like
   * promo windows, which are explicitly OK to vary).
   */
  computeQuote(ctx: OwnedHandlerContext, request: ComputeQuoteRequest): Promise<ComputeQuoteResult>

  /**
   * Optional batch quote primitive for verticals that can share availability
   * and rate reads across selections. The engine falls back to `computeQuote`
   * for handlers that do not implement it.
   */
  computeQuotes?(
    ctx: OwnedHandlerContext,
    request: ComputeQuotesRequest,
  ): Promise<ReadonlyArray<ComputeQuoteBatchResult>>

  /** Optional: place / extend / release a soft hold on the row. */
  placeHold?(ctx: OwnedHandlerContext, request: HoldRequest): Promise<HoldResult>
  extendHold?(
    ctx: OwnedHandlerContext,
    holdToken: string,
    request?: Pick<HoldRequest, "ttlMs" | "parameters">,
  ): Promise<HoldResult>
  releaseHold?(ctx: OwnedHandlerContext, holdToken: string): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────

export interface OwnedBookingHandlerRegistry {
  /** Register a handler. Re-registering the same `entityModule`
   *  replaces the previous handler. */
  register(handler: OwnedBookingHandler): void
  resolve(entityModule: string): OwnedBookingHandler | undefined
  resolveOrThrow(entityModule: string): OwnedBookingHandler
  has(entityModule: string): boolean
  modules(): ReadonlyArray<string>
}

export function createOwnedBookingHandlerRegistry(): OwnedBookingHandlerRegistry {
  const byModule = new Map<string, OwnedBookingHandler>()

  return {
    register(handler) {
      byModule.set(handler.entityModule, handler)
    },
    resolve(entityModule) {
      return byModule.get(entityModule)
    },
    resolveOrThrow(entityModule) {
      const handler = byModule.get(entityModule)
      if (!handler) throw new NoOwnedHandlerRegisteredError(entityModule)
      return handler
    },
    has(entityModule) {
      return byModule.has(entityModule)
    },
    modules() {
      return [...byModule.keys()]
    },
  }
}

/** Stable string the engine inspects when deciding which arm to use. */
export const OWNED_SOURCE_KIND = "owned" as const
