/**
 * `quoteEntity` — the first step in the booking engine lifecycle.
 *
 * Asks the registered adapter "is this row still bookable, and at what
 * price right now?", persists the answer in `catalog_quotes` with an
 * expiry, and returns a stable `quoteId` for an admitted vertical command.
 *
 * Quotes are short-lived (default TTL: 10 minutes) and not de-duped.
 * Re-quoting the same row produces a new quote row so the audit trail
 * shows every quote attempt.
 */

import type { BookingRequirements } from "@voyant-travel/catalog-contracts/booking-engine/requirements"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { newId } from "@voyant-travel/db/lib/typeid"
import type { LiveResolveResult, SourceAdapterContext } from "../adapter/contract.js"
import type { PricingBasis } from "../snapshot/schema.js"
import type {
  ComputeQuoteResult,
  OwnedBookingHandlerRegistry,
  OwnedHandlerContext,
} from "./owned-handler.js"
import { OWNED_SOURCE_KIND } from "./owned-handler.js"
import type {
  CodeStatus,
  PromotionEvaluationInput,
  PromotionEvaluationOutput,
} from "./promotions-contract.js"
import type { SourceAdapterRegistry } from "./registry.js"
import { catalogQuotesTable, type SelectCatalogQuote } from "./schema.js"

/** Default time-to-live for a quote. */
export const DEFAULT_QUOTE_TTL_MS = 10 * 60 * 1000

export interface QuoteScope {
  locale: string
  audience: string
  market: string
  currency?: string
}

export interface QuoteEntityRequest {
  /** The catalog row to quote. */
  entityModule: string
  entityId: string

  /** Source pointer, read from the row's provenance. */
  sourceKind: string
  sourceProvider?: string
  sourceConnectionId?: string
  sourceRef?: string

  /** Variant scope for the quote. */
  scope: QuoteScope

  /** Vertical-specific parameters echoed to the adapter (date range, pax, etc.). */
  parameters?: Record<string, unknown>

  /** Override the TTL (rare — defaults to `DEFAULT_QUOTE_TTL_MS`). */
  ttlMs?: number

  /** Adapter context (connection_id, credentials, correlation_id). */
  adapterContext: SourceAdapterContext
}

export interface QuoteEntityResult {
  quoteId: string
  quotedAt: Date
  expiresAt: Date
  available: boolean
  invalidReason?: string
  pricing?: PricingBasis
  upstreamPayload?: Record<string, unknown>
  /**
   * The journey wizard descriptor — populated when
   * `deps.contentEnricher` is wired and the entity is sourced. Tells
   * the wizard which steps + sub-steps to render. Per
   * `docs/architecture/booking-journey-architecture.md` §3, this is
   * returned alongside the quote so the journey can render the
   * correct shape without a follow-up call.
   *
   * Undefined when no enricher is wired (today's behavior — the
   * journey hardcodes a minimal shape until templates wire content).
   */
  shape?: BookingRequirements
}

export interface QuoteEntityBatchRequest extends QuoteEntityRequest {
  selectionId: string
}

export interface QuoteEntityBatchResult {
  selectionId: string
  result: QuoteEntityResult
}

/**
 * Input the content enricher receives — quote + scope + parameters.
 * The enricher reads cached content for the entity and projects a
 * `BookingRequirements` that drives the wizard. Verticals compose their
 * `build*Requirements` builders into one enricher routed by
 * `entity_module`.
 */
export interface QuoteContentEnrichmentInput {
  db: AnyDrizzleDb
  entityModule: string
  entityId: string
  sourceKind: string
  sourceConnectionId?: string
  sourceRef?: string
  scope: QuoteScope
  parameters?: Record<string, unknown>
  adapterContext: SourceAdapterContext
}

/**
 * Hook called by `quoteEntity` after the live-resolve step succeeds.
 * Receives entity identity + scope; returns a `BookingRequirements` (or
 * null when content is unavailable / the entity is owned and the
 * enricher chooses not to surface a shape).
 *
 * Templates compose this from per-vertical content services, e.g.:
 *
 *   const enricher: QuoteContentEnricher = async (input) => {
 *     const content = await readContentByModule(input)
 *     return content ? buildRequirements(input.entityModule, content, input.scope) : null
 *   }
 */
export type QuoteContentEnricher = (
  input: QuoteContentEnrichmentInput,
) => Promise<BookingRequirements | null>

export interface QuoteEntityDeps {
  registry: SourceAdapterRegistry
  /**
   * Owned-arm dispatch — when set and the request's source kind is
   * `"owned"`, the engine routes to a handler keyed by
   * `entityModule` instead of the SourceAdapterRegistry. Per
   * booking-journey-architecture §6.
   *
   * Templates that ship owned products MUST wire this; templates
   * that only proxy sourced rows can leave it undefined and the
   * engine falls through to the legacy adapter path.
   */
  ownedHandlers?: OwnedBookingHandlerRegistry
  /**
   * Optional content-aware enricher. When wired, called after the
   * adapter's `liveResolve` step succeeds; the returned
   * `BookingRequirements` is attached to the quote result so the
   * journey wizard can render the correct shape without a follow-up
   * call.
   *
   * When not wired (today's default), the quote response omits
   * `shape` and the journey falls back to its hardcoded minimal
   * descriptor.
   *
   * Errors from the enricher are caught and logged via
   * `onEnricherError` (defaults to silent) — they MUST NOT fail the
   * quote because the wizard can render the minimal shape on its
   * own.
   */
  contentEnricher?: QuoteContentEnricher
  /** Optional sink for enricher errors. */
  onEnricherError?: (event: { entityModule: string; entityId: string; reason: string }) => void
  /**
   * Optional promotion-evaluator hook. When wired, called after the
   * adapter's `liveResolve` succeeds (only for `entity_module ==
   * "products"` in v1). Discounts apply to `pricing.base_amount`
   * pre-tax; the operator starter's `applyOperatorTaxToQuoteResult`
   * step downstream recomputes taxes against the new base.
   *
   * When the customer-supplied code fails validation, the engine
   * surfaces the result as a `code_*` `invalidReason` on the quote
   * (`code_not_found`, `code_expired`, `code_not_yet_valid`,
   * `code_not_applicable`). Auto offers do NOT apply when a bad code
   * is supplied — the quote is short-circuited to unavailable so the
   * customer gets clear feedback.
   *
   * Per `docs/architecture/promotions-architecture.md` §3.6 + §7.1.
   */
  evaluatePromotions?: (input: PromotionEvaluationInput) => Promise<PromotionEvaluationOutput>
}

/**
 * Quote the row. Calls `adapter.liveResolve` (sourced) or interprets
 * `available = true` from a stub (owned, when no adapter is registered
 * for the `"owned"` kind in this MVP cut).
 *
 * Throws `NoAdapterRegisteredError` if the registry has no entry for
 * `sourceKind`. Persists the quote either way — a `failed` lookup is
 * still recorded so subsequent diagnostics can see the attempt.
 */
export async function quoteEntity(
  db: AnyDrizzleDb,
  deps: QuoteEntityDeps,
  request: QuoteEntityRequest,
): Promise<QuoteEntityResult> {
  const [first] = await quoteEntitiesBatch(db, deps, [{ ...request, selectionId: "selection_0" }])
  if (!first) throw new Error("quoteEntity: batch returned no rows")
  return first.result
}

export async function quoteEntitiesBatch(
  db: AnyDrizzleDb,
  deps: QuoteEntityDeps,
  requests: ReadonlyArray<QuoteEntityBatchRequest>,
): Promise<QuoteEntityBatchResult[]> {
  const computedBySelection = await computeRawQuotes(db, deps, requests)
  const results: QuoteEntityBatchResult[] = []
  for (const request of requests) {
    const computed = computedBySelection.get(request.selectionId)
    if (!computed) {
      throw new Error(`quoteEntitiesBatch: missing computed result ${request.selectionId}`)
    }
    results.push({
      selectionId: request.selectionId,
      result: await persistComputedQuote(db, deps, request, computed),
    })
  }
  return results
}

interface RawQuoteComputation {
  available: boolean
  failedReason?: string
  pricing?: PricingBasis
  upstreamPayload?: Record<string, unknown>
  ownedShape?: BookingRequirements
}

async function computeRawQuotes(
  db: AnyDrizzleDb,
  deps: QuoteEntityDeps,
  requests: ReadonlyArray<QuoteEntityBatchRequest>,
): Promise<Map<string, RawQuoteComputation>> {
  const results = new Map<string, RawQuoteComputation>()
  const fallback: QuoteEntityBatchRequest[] = []
  const groups = new Map<string, QuoteEntityBatchRequest[]>()

  for (const request of requests) {
    if (request.sourceKind !== OWNED_SOURCE_KIND || !deps.ownedHandlers) {
      fallback.push(request)
      continue
    }
    const handler = deps.ownedHandlers.resolveOrThrow(request.entityModule)
    if (!handler.computeQuotes) {
      fallback.push(request)
      continue
    }
    const key = [
      request.entityModule,
      request.scope.locale,
      request.scope.audience,
      request.scope.market,
      request.scope.currency ?? "",
      request.adapterContext.connection_id,
    ].join("\u001f")
    const group = groups.get(key) ?? []
    group.push(request)
    groups.set(key, group)
  }

  for (const group of groups.values()) {
    const first = group[0]
    if (!first || first.sourceKind !== OWNED_SOURCE_KIND || !deps.ownedHandlers) continue
    const handler = deps.ownedHandlers.resolveOrThrow(first.entityModule)
    const ctx: OwnedHandlerContext = { db, adapterContext: first.adapterContext }
    const batch = await handler.computeQuotes?.(ctx, {
      entityModule: first.entityModule,
      scope: first.scope,
      selections: group.map((request) => ({
        selectionId: request.selectionId,
        entityId: request.entityId,
        parameters: request.parameters,
        draft: (request.parameters as { draft?: unknown } | undefined)?.draft,
      })),
    })
    const returned = new Set<string>()
    for (const item of batch ?? []) {
      returned.add(item.selectionId)
      results.set(item.selectionId, rawFromOwnedResult(item.result))
    }
    for (const request of group) {
      if (!returned.has(request.selectionId)) fallback.push(request)
    }
  }

  await Promise.all(
    fallback.map(async (request) => {
      results.set(request.selectionId, await computeRawQuote(db, deps, request))
    }),
  )

  return results
}

async function computeRawQuote(
  db: AnyDrizzleDb,
  deps: QuoteEntityDeps,
  request: QuoteEntityRequest,
): Promise<RawQuoteComputation> {
  // Two dispatch arms:
  //   - Owned: handler registry keyed by entity_module. Returns a
  //     ComputeQuoteResult directly — pricing, shape, availability.
  //   - Sourced: SourceAdapterRegistry keyed by connection_id (with
  //     a kind-only fallback for legacy single-connection-per-kind).
  let available: boolean
  let failedReason: string | undefined
  let pricing: PricingBasis | undefined
  let upstreamPayload: Record<string, unknown> | undefined
  let ownedShape: BookingRequirements | undefined

  if (request.sourceKind === OWNED_SOURCE_KIND && deps.ownedHandlers) {
    const handler = deps.ownedHandlers.resolveOrThrow(request.entityModule)
    const result = await handler.computeQuote(
      { db, adapterContext: request.adapterContext },
      {
        entityModule: request.entityModule,
        entityId: request.entityId,
        scope: request.scope,
        parameters: request.parameters,
        draft: (request.parameters as { draft?: unknown } | undefined)?.draft,
      },
    )
    available = result.available
    failedReason = result.invalidReason
    pricing = result.pricing
    upstreamPayload = result.upstreamPayload
    ownedShape = result.requirements
  } else {
    const adapter = request.sourceConnectionId
      ? (deps.registry.resolveByConnection(request.sourceConnectionId) ??
        deps.registry.resolveOrThrow(request.sourceKind))
      : deps.registry.resolveOrThrow(request.sourceKind)

    let liveResolve: LiveResolveResult = { values: {} }
    if (adapter.liveResolve) {
      liveResolve = await adapter.liveResolve(request.adapterContext, {
        ids: [request.entityId],
        scope: {
          locale: request.scope.locale,
          audience: request.scope.audience,
          market: request.scope.market,
          currency: request.scope.currency,
        },
        parameters: request.parameters,
      })
    }

    failedReason = liveResolve.failed?.[request.entityId]
    const liveValues = liveResolve.values[request.entityId]
    available = !failedReason && liveValues !== undefined
    pricing = available ? liveValuesToPricing(liveValues, request.scope.currency) : undefined
    upstreamPayload = liveValues as Record<string, unknown> | undefined
  }

  return { available, failedReason, pricing, upstreamPayload, ownedShape }
}

async function persistComputedQuote(
  db: AnyDrizzleDb,
  deps: QuoteEntityDeps,
  request: QuoteEntityRequest,
  computed: RawQuoteComputation,
): Promise<QuoteEntityResult> {
  const ttlMs = request.ttlMs ?? DEFAULT_QUOTE_TTL_MS
  const quotedAt = new Date()
  const expiresAt = new Date(quotedAt.getTime() + ttlMs)
  let available = computed.available
  let failedReason = computed.failedReason
  const pricing = computed.pricing
  const upstreamPayload = computed.upstreamPayload
  const ownedShape = computed.ownedShape

  // Promotion evaluation — runs only for the products vertical in v1
  // (other verticals would need their own bridge to the evaluator).
  // Discounts apply to `pricing.base_amount` pre-tax; operator starter
  // tax recompute downstream picks up the new base.
  let appliedOffers: PromotionEvaluationOutput["applied"] | undefined
  if (deps.evaluatePromotions && available && pricing && request.entityModule === "products") {
    const params = request.parameters as Record<string, unknown> | undefined
    const promotionCode = readString(params?.promotionCode)
    // Read `paxCount` first — the Booking Session selection bridge writes the
    // summed traveler count under that key, and the products owned handler
    // reads it too. Fall back to `pax` for lower-level callers that construct
    // quote parameters directly.
    const pax = readNumber(params?.paxCount) ?? readNumber(params?.pax)
    const offerEval = await deps.evaluatePromotions({
      productId: request.entityId,
      slice: { audience: narrowAudience(request.scope.audience), market: request.scope.market },
      pax,
      date: quotedAt,
      code: promotionCode,
      basePriceCents: Math.round(pricing.base_amount),
      baseCurrency: pricing.currency,
    })

    const codeStatus = offerEval.codeStatus
    if (codeStatus && codeStatus.kind !== "code_valid") {
      // Customer-supplied code failed validation. Surface as a quote-
      // level invalidReason and short-circuit; auto offers don't apply
      // either, so the customer gets unambiguous feedback.
      available = false
      failedReason = codeStatusToReason(codeStatus)
    } else if (offerEval.applied.length > 0) {
      // Subtract the discount from base_amount in cents. The operator
      // template's `applyOperatorTaxToQuoteResult` step downstream
      // sees the new base and recomputes taxes accordingly.
      pricing.base_amount = Math.round(pricing.base_amount) - offerEval.total.discountAppliedCents
      pricing.appliedOffers = offerEval.applied
      appliedOffers = offerEval.applied
      // Invalidate any taxes / breakdown that the source (sourced
      // adapter or owned handler) computed against the un-discounted
      // base — they're stale now. Setting `taxes = 0` and clearing
      // `breakdown` is the explicit signal the operator-side transform
      // (`applyOperatorTaxToQuoteResult`) reads to recompute. Without
      // this, the API serializer would echo a breakdown total that
      // doesn't match `appliedOffers`.
      pricing.taxes = 0
      pricing.breakdown = undefined
    }
  }

  const quoteId = newId("catalog_quotes")
  const inserted = (await db
    .insert(catalogQuotesTable)
    .values({
      id: quoteId,
      entity_module: request.entityModule,
      entity_id: request.entityId,
      source_kind: request.sourceKind,
      source_provider: request.sourceProvider,
      source_connection_id: request.sourceConnectionId,
      source_ref: request.sourceRef,
      available,
      invalid_reason: failedReason,
      locale: request.scope.locale,
      audience: request.scope.audience,
      market: request.scope.market,
      currency: request.scope.currency,
      pricing_base_amount: pricing?.base_amount != null ? String(pricing.base_amount) : undefined,
      pricing_taxes: pricing?.taxes != null ? String(pricing.taxes) : undefined,
      pricing_fees: pricing?.fees != null ? String(pricing.fees) : undefined,
      pricing_surcharges: pricing?.surcharges != null ? String(pricing.surcharges) : undefined,
      pricing_currency: pricing?.currency,
      pricing_breakdown: pricing?.breakdown,
      pricing_applied_offers: appliedOffers,
      upstream_payload: upstreamPayload ?? null,
      created_at: quotedAt,
      expires_at: expiresAt,
    })
    .returning()) as SelectCatalogQuote[]

  if (!inserted[0]) throw new Error("quoteEntity: insert returned no rows")

  // Optional content enrichment — per booking-journey-architecture
  // §3, the quote response carries a BookingRequirements descriptor
  // when the engine has the content in front of it. When the hook
  // throws, we swallow the error (the wizard's minimal-shape fallback
  // covers it) but surface via onEnricherError for diagnostics.
  //
  // Owned handlers are authoritative for their own products — when
  // they returned a shape, the enricher is not consulted.
  let shape: BookingRequirements | undefined = ownedShape
  if (!shape && deps.contentEnricher && available) {
    try {
      const enriched = await deps.contentEnricher({
        db,
        entityModule: request.entityModule,
        entityId: request.entityId,
        sourceKind: request.sourceKind,
        sourceConnectionId: request.sourceConnectionId,
        sourceRef: request.sourceRef,
        scope: request.scope,
        parameters: request.parameters,
        adapterContext: request.adapterContext,
      })
      shape = enriched ?? undefined
    } catch (err) {
      deps.onEnricherError?.({
        entityModule: request.entityModule,
        entityId: request.entityId,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return {
    quoteId,
    quotedAt,
    expiresAt,
    available,
    invalidReason: failedReason,
    pricing,
    upstreamPayload,
    shape,
  }
}

function rawFromOwnedResult(result: ComputeQuoteResult): RawQuoteComputation {
  return {
    available: result.available,
    failedReason: result.invalidReason,
    pricing: result.pricing,
    upstreamPayload: result.upstreamPayload,
    ownedShape: result.requirements,
  }
}

/**
 * Convert an adapter's per-entity `liveResolve` value into the catalog
 * plane's `PricingBasis` shape. The adapter's payload is opaque, so this
 * helper looks for the conventional fields (`priceCents`, `currency`,
 * `taxesCents`, `feesCents`, `surchargesCents`) and falls back to a
 * single-line "all in base_amount" basis when only a price is provided.
 */
function liveValuesToPricing(
  values: Record<string, unknown> | undefined,
  fallbackCurrency?: string,
): PricingBasis | undefined {
  if (!values) return undefined
  const priceCents = readNumber(values.priceCents) ?? readNumber(values.price)
  if (priceCents == null) return undefined
  const currency = readString(values.currency) ?? fallbackCurrency
  if (!currency) return undefined
  return {
    base_amount: priceCents,
    taxes: readNumber(values.taxesCents) ?? 0,
    fees: readNumber(values.feesCents) ?? 0,
    surcharges: readNumber(values.surchargesCents) ?? 0,
    currency,
  }
}

function readNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = Number.parseFloat(v)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

function readString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined
}

const KNOWN_AUDIENCES = new Set(["staff", "customer", "partner", "supplier"] as const)
type Visibility = "staff" | "customer" | "partner" | "supplier"

/**
 * Narrow the QuoteScope.audience (typed `string` for legacy reasons)
 * to the evaluator's `Visibility` enum. Unknown audiences fall back to
 * `"customer"` — the most permissive storefront default; exotic audience
 * tokens (e.g., `"staff-admin"`) get no special treatment beyond visibility
 * rules the offer's scope already encodes.
 */
function narrowAudience(audience: string): Visibility {
  if (audience === "staff-admin") return "staff"
  return KNOWN_AUDIENCES.has(audience as Visibility) ? (audience as Visibility) : "customer"
}

/**
 * Map a non-valid `CodeStatus` to a quote `invalidReason` string. The
 * `code_valid` case is filtered upstream so this only sees the failure
 * variants.
 */
function codeStatusToReason(
  codeStatus: NonNullable<CodeStatus> & {
    kind: Exclude<NonNullable<CodeStatus>["kind"], "code_valid">
  },
): string {
  return codeStatus.kind
}
