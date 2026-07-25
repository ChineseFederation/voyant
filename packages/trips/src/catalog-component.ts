/**
 * Catalog-backed trip-component orchestration — owned by `@voyant-travel/trips`.
 *
 * Trips owns the reserve/checkout flow for catalog-backed components, so the
 * orchestration that turns a `TripComponent` into a catalog booking-engine
 * quote / cancellation lives here rather than in any deployment:
 *   - offer validation (`quote`) + customer-facing tax recompute hand-off,
 *   - fail-closed reservation while Catalog has no durable admitted command,
 *   - hold release (compensation) + cancellation preview + cancel,
 *   - checkout hand-off.
 *
 * WHY SOME PIECES ARE INJECTED (not imported):
 *
 * Trips depends acyclically on `@voyant-travel/catalog` (booking-engine) and
 * `@voyant-travel/bookings` (origin upsert), so those are imported directly.
 * Three things stay deployment-supplied and are injected via `options`:
 *
 *   1. The `SourceAdapterRegistry` / `OwnedBookingHandlerRegistry` — these are
 *      process-local registries assembled from a deployment's installed source
 *      adapters + owned vertical handlers. They live in the deployment.
 *   2. The promotion evaluator — `createCatalogPromotionEvaluator` lives in
 *      `@voyant-travel/commerce`, and `commerce → quotes → trips` would make a
 *      package cycle. So the evaluator is injected.
 *   3. The customer-facing tax recompute (`transformQuoteResult`) — the operator
 *      resolves its own tax settings (a deployment reader) and the transform is
 *      shared with the catalog-booking route module, so it stays in the
 *      deployment and is injected.
 *   4. The checkout starter (`startCatalogCheckout`) — deployment-specific
 *      payment-provider wiring.
 *
 * Catalog booking creation is intentionally unavailable.
 */
import {
  type CancelEntityResult,
  cancelEntity,
  type OwnedBookingHandlerRegistry,
  type PricingBreakdownV1,
  type QuoteEntityDeps,
  type QuoteEntityResult,
  type QuoteResponseV1,
  quoteEntity,
  quoteResponseV1,
  type SourceAdapterRegistry,
} from "@voyant-travel/catalog/booking-engine"
import type { PricingBasis } from "@voyant-travel/catalog/snapshot/schema"
import type { AnyDrizzleDb } from "@voyant-travel/db"

import type {
  CancelComponentInput,
  CancelComponentResult,
  CatalogComponentQuoteInput,
  ComponentCancellationPreview,
  ComponentCancellationPreviewInput,
  ComponentCheckoutInput,
  ComponentCheckoutResult,
  ReleaseReservedComponentInput,
  ReleaseReservedComponentResult,
  ReserveComponentInput,
  ReserveComponentResult,
} from "./service-types.js"

/** Per-request adapter context propagated to the catalog source adapters. */
export interface CatalogAdapterContext {
  connection_id: string
  correlation_id: string
}

/** Deployment-specific checkout hand-off for a reserved component. */
export type StartComponentCheckout = (
  input: ComponentCheckoutInput,
) => Promise<ComponentCheckoutResult>

/**
 * Deployment-supplied, request-scoped readers + registries for the catalog
 * component adapter. These cross the boundaries trips must not import
 * statically (process-local registries, commerce promotions, the deployment's
 * tax recompute + checkout wiring) and so are injected.
 */
export interface CatalogComponentAdapterOptions {
  /** The per-request drizzle handle. */
  db: AnyDrizzleDb
  /** Process-local source-adapter registry (deployment-assembled). */
  registry: SourceAdapterRegistry
  /** Process-local owned-handler registry (deployment-assembled). */
  ownedHandlers: OwnedBookingHandlerRegistry
  /**
   * Promotion evaluator for the quote path. Injected because
   * `createCatalogPromotionEvaluator` lives in commerce, which transitively
   * (optionally) depends on quotes → trips.
   */
  evaluatePromotions: QuoteEntityDeps["evaluatePromotions"]
  /**
   * Customer-facing tax recompute applied to a quote result. Injected because
   * the deployment resolves its own tax settings (a deployment reader) and the
   * transform is shared with the catalog-booking route module.
   */
  transformQuoteResult: (
    result: QuoteEntityResult,
    entityModule: string,
    entityId: string,
    sourceKind: string,
  ) => Promise<QuoteEntityResult>
  /** Builds the per-request adapter context (correlation id, connection id). */
  adapterContext: (connectionId: string | null | undefined) => CatalogAdapterContext
  /** Deployment-specific checkout hand-off (payment-provider wiring). */
  startCheckout: StartComponentCheckout
}

/** The catalog component orchestration surface produced by the factory. */
export interface CatalogComponentAdapter {
  quote(input: CatalogComponentQuoteInput): Promise<QuoteResponseV1>
  reserve(input: ReserveComponentInput): Promise<ReserveComponentResult>
  release(input: ReleaseReservedComponentInput): Promise<ReleaseReservedComponentResult>
  previewCancellation(
    input: ComponentCancellationPreviewInput,
  ): Promise<ComponentCancellationPreview>
  cancel(input: CancelComponentInput): Promise<CancelComponentResult>
  startCheckout(input: ComponentCheckoutInput): Promise<ComponentCheckoutResult>
}

/**
 * Build the catalog-backed trip-component orchestration bound to a request's
 * db + deployment registries/readers.
 */
export function createCatalogComponentAdapter(
  options: CatalogComponentAdapterOptions,
): CatalogComponentAdapter {
  const { db, registry, ownedHandlers, evaluatePromotions, transformQuoteResult, adapterContext } =
    options

  async function quote(input: CatalogComponentQuoteInput): Promise<QuoteResponseV1> {
    const component = input.component
    const entityModule = required(component.entityModule, "component.entityModule")
    const entityId = required(component.entityId, "component.entityId")
    const sourceKind = required(component.sourceKind, "component.sourceKind")
    const result = await quoteEntity(
      db,
      {
        registry,
        ownedHandlers,
        evaluatePromotions,
      },
      {
        entityModule,
        entityId,
        sourceKind,
        sourceConnectionId: component.sourceConnectionId ?? undefined,
        sourceRef: component.sourceRef ?? undefined,
        scope: {
          locale: input.scope.locale ?? "en-GB",
          audience: input.scope.audience ?? "staff",
          market: input.scope.market ?? "default",
          currency: input.scope.currency,
        },
        parameters: engineParametersFromBookingDraft(undefined, input.bookingDraft),
        ttlMs: input.ttlMs,
        adapterContext: adapterContext(component.sourceConnectionId ?? sourceKind),
      },
    )
    const transformed = await transformQuoteResult(result, entityModule, entityId, sourceKind)
    return serializeQuoteResult(transformed)
  }

  async function reserve(_input: ReserveComponentInput): Promise<ReserveComponentResult> {
    throw new Error("catalog_booking_commit_not_available")
  }

  async function release(
    input: ReleaseReservedComponentInput,
  ): Promise<ReleaseReservedComponentResult> {
    const component = input.component
    if (!component.bookingId || !component.entityModule || !component.entityId) {
      return { released: false, reason: "missing_component_booking_ref" }
    }

    try {
      const result = await cancelEntity(
        db,
        { registry },
        {
          bookingId: component.bookingId,
          entityModule: component.entityModule,
          entityId: component.entityId,
          reason: "Trips compensation",
          adapterContext: adapterContext(component.sourceConnectionId ?? component.sourceKind),
        },
      )
      return {
        released: result.status === "cancelled",
        reason: result.status === "refused" ? "cancel_refused" : undefined,
      }
    } catch (error) {
      return {
        released: false,
        reason: error instanceof Error ? error.message : "release_failed",
      }
    }
  }

  async function cancel(input: CancelComponentInput): Promise<CancelComponentResult> {
    const component = input.component
    if (!component.bookingId || !component.entityModule || !component.entityId) {
      return { status: "refused", reason: "missing_component_booking_ref" }
    }

    const result = await cancelEntity(
      db,
      { registry },
      {
        bookingId: component.bookingId,
        entityModule: component.entityModule,
        entityId: component.entityId,
        reason: input.reason,
        adapterContext: adapterContext(component.sourceConnectionId ?? component.sourceKind),
      },
    )

    // Catalog adapters can return "pending" when an async cancel was submitted
    // (email/partner-portal/batch) and the inventory hasn't been released yet.
    // The trips's `CancelComponentResult` doesn't model that state;
    // surface it as `refused` with a reason so the trip lands in remediation
    // and the operator follows up out-of-band. `pending_channel` flows through
    // the reason so the UI can show where the request went.
    const status: CancelComponentResult["status"] =
      result.status === "pending" ? "refused" : result.status
    const reason =
      result.status === "cancelled"
        ? undefined
        : result.status === "pending"
          ? `cancel_pending${result.pendingChannel ? `:${result.pendingChannel}` : ""}`
          : `cancel_${result.status}`

    return {
      status,
      refundAmountCents: result.refundAmount,
      refundCurrency: result.refundCurrency,
      reason,
      snapshot: { snapshotId: result.snapshotId },
    }
  }

  function startCheckout(input: ComponentCheckoutInput): Promise<ComponentCheckoutResult> {
    return options.startCheckout(input)
  }

  return { quote, reserve, release, previewCancellation, cancel, startCheckout }
}

/**
 * Pure catalog-component cancellation preview. Has no db / registry reads —
 * supplier cancellation previews aren't available, so the cancellation result
 * itself is authoritative. Exported standalone so deployments can preview
 * without constructing a request-scoped adapter.
 */
export function previewCancellation(
  input: ComponentCancellationPreviewInput,
): Promise<ComponentCancellationPreview> {
  const component = input.component
  if (!component.bookingId || !component.entityModule || !component.entityId) {
    return Promise.resolve({
      componentId: component.id,
      action: "staff_remediation",
      currentStatus: component.status,
      staffActionRequired: true,
      reason: "missing_component_booking_ref",
    })
  }

  return Promise.resolve({
    componentId: component.id,
    action: "cancel",
    currentStatus: component.status,
    staffActionRequired: false,
    refundAmountCents: 0,
    refundCurrency: component.componentCurrency ?? undefined,
    penaltyAmountCents: 0,
    policySummary:
      "Supplier cancellation preview is not available; cancellation result is authoritative.",
    snapshot: {
      bookingId: component.bookingId,
      entityModule: component.entityModule,
      entityId: component.entityId,
      sourceKind: component.sourceKind,
    },
  })
}

// ── Pure helpers (vertical-agnostic) ────────────────────────────────────────

function serializeQuoteResult(result: QuoteEntityResult): QuoteResponseV1 {
  return quoteResponseV1.parse({
    ...result,
    quotedAt: result.quotedAt.toISOString(),
    expiresAt: result.expiresAt.toISOString(),
    pricing: toPricingBreakdownV1(result.pricing),
  })
}

function toPricingBreakdownV1(basis: PricingBasis | undefined): PricingBreakdownV1 | undefined {
  if (!basis) return undefined
  if (basis.breakdown) {
    const breakdown = basis.breakdown as PricingBreakdownV1
    if (breakdown.currency && Array.isArray(breakdown.lines) && Array.isArray(breakdown.taxes)) {
      return breakdown
    }
  }

  const lines: PricingBreakdownV1["lines"] = [
    {
      kind: "base",
      label: "Base",
      quantity: 1,
      unitAmount: basis.base_amount,
      totalAmount: basis.base_amount,
    },
  ]
  if (basis.fees > 0) {
    lines.push({ kind: "fee", label: "Fees", unitAmount: basis.fees, totalAmount: basis.fees })
  }
  if (basis.surcharges > 0) {
    lines.push({
      kind: "supplement",
      label: "Surcharges",
      unitAmount: basis.surcharges,
      totalAmount: basis.surcharges,
    })
  }

  const subtotal = basis.base_amount + basis.fees + basis.surcharges
  return {
    currency: basis.currency,
    lines,
    taxes:
      basis.taxes > 0
        ? [
            {
              code: "tax",
              label: "Tax",
              rate: 0,
              amount: basis.taxes,
              base: basis.base_amount,
            },
          ]
        : [],
    subtotal,
    taxTotal: basis.taxes,
    total: subtotal + basis.taxes,
  }
}

function engineParametersFromBookingDraft(
  parameters: Record<string, unknown> | undefined,
  bookingDraftPayload: unknown,
): Record<string, unknown> {
  const bookingDraft = asRecord(bookingDraftPayload)
  const configure = asRecord(bookingDraft?.configure)
  const departureSlotId = stringValue(configure?.departureSlotId)
  const paxCount = sumBookingDraftPax(configure?.pax)
  const next: Record<string, unknown> = {
    ...(parameters ?? {}),
    ...(bookingDraft ? { draft: bookingDraft } : {}),
  }

  if (departureSlotId) {
    if (next.departureSlotId == null) next.departureSlotId = departureSlotId
    if (next.departure_id == null) next.departure_id = departureSlotId
    if (next.slotId == null) next.slotId = departureSlotId
  }
  if (paxCount > 0 && next.paxCount == null) {
    next.paxCount = paxCount
  }

  const promotionCode = stringValue(bookingDraft?.promotionCode)
  if (promotionCode && next.promotionCode == null) {
    next.promotionCode = promotionCode
  }

  return next
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function sumBookingDraftPax(value: unknown): number {
  const pax = asRecord(value)
  if (!pax) return 0
  let total = 0
  for (const count of Object.values(pax)) {
    if (typeof count === "number" && Number.isFinite(count) && count > 0) {
      total += count
    }
  }
  return total
}

function required(value: string | null | undefined, label: string): string {
  if (!value) throw new Error(`${label} is required`)
  return value
}

// Re-exported for the deployment's `CancelComponentResult` mapping symmetry.
export type { CancelEntityResult }
