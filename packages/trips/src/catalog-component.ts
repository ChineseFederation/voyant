/**
 * Catalog-backed trip-component orchestration — owned by `@voyant-travel/trips`.
 *
 * Trips owns the reserve/checkout flow for catalog-backed components, so the
 * orchestration that turns a `TripComponent` into a catalog price / cancellation
 * lives here rather than in any deployment:
 *   - non-binding pricing (`quote`) through the v1 Offer Preview,
 *   - fail-closed reservation while Catalog has no durable admitted command,
 *   - hold release (compensation) + cancellation preview + cancel,
 *   - checkout hand-off.
 *
 * PRICING RUNS ON THE V1 SESSION LIFECYCLE (voyant#4188)
 *
 * The beta `quoteEntity` path this used to call — which minted a `catalog_quotes`
 * row per repricing pass and returned `quoteResponseV1` — is deleted. Composing a
 * trip is browsing, not booking: a component being repriced has not yet been
 * accepted onto a Proposal, so it must not open a Booking Session or burn a
 * Quote. Offer Preview is exactly that read, and it reaches the SAME
 * `composeRequirements` / `composeQuote` ports the Session lifecycle uses, so a
 * composer price cannot disagree with the price the booking wizard later quotes.
 *
 * The binding price arrives later and elsewhere: when a Proposal version is
 * accepted, `booking-session-composite-handler.ts` composes the frozen Trip
 * Snapshot's components through those same ports inside a real Session.
 *
 * WHY SOME PIECES ARE INJECTED (not imported):
 *
 * Trips depends acyclically on `@voyant-travel/catalog` (booking-engine) and
 * `@voyant-travel/bookings` (origin upsert), so those are imported directly.
 * Three things stay deployment-supplied and are injected via `options`:
 *
 *   1. The `SourceAdapterRegistry` — a process-local registry assembled from a
 *      deployment's installed source adapters. It lives in the deployment.
 *   2. The Offer Preview read — the Booking Session module is assembled by the
 *      catalog runtime from the deployment's registries, repository and finance
 *      wiring, so trips is handed the resolved read rather than reassembling it.
 *   3. The checkout starter (`startCatalogCheckout`) — deployment-specific
 *      payment-provider wiring.
 *
 * Catalog booking creation is intentionally unavailable.
 */
import {
  type CancelEntityResult,
  cancelEntity,
  type SourceAdapterRegistry,
} from "@voyant-travel/catalog/booking-engine"
import { bookingSelectionPublicV1 } from "@voyant-travel/catalog/booking-engine/contracts"
import type {
  OfferPreviewOutcomeV1,
  OfferPreviewRequestV1,
  OfferPreviewResultV1,
  OfferPreviewTargetV1,
} from "@voyant-travel/catalog-contracts/booking-engine/preview-contracts"
import type { AnyDrizzleDb } from "@voyant-travel/db"

import type { TripComponent } from "./schema.js"
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
  /**
   * The v1 Offer Preview read, bound to this request. Injected because the
   * Booking Session module it runs on is assembled by the catalog runtime from
   * the deployment's repository, registries and finance wiring — reassembling
   * it here would be a second lifecycle.
   */
  previewOffer: (input: OfferPreviewRequestV1) => Promise<OfferPreviewOutcomeV1>
  /** Builds the per-request adapter context (correlation id, connection id). */
  adapterContext: (connectionId: string | null | undefined) => CatalogAdapterContext
  /** Deployment-specific checkout hand-off (payment-provider wiring). */
  startCheckout: StartComponentCheckout
}

/** The catalog component orchestration surface produced by the factory. */
export interface CatalogComponentAdapter {
  quote(input: CatalogComponentQuoteInput): Promise<OfferPreviewResultV1>
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
  const { db, registry, adapterContext } = options

  async function quote(input: CatalogComponentQuoteInput): Promise<OfferPreviewResultV1> {
    const component = input.component
    const outcome = await options.previewOffer({
      target: catalogComponentPreviewTarget(component),
      scope: {
        locale: input.scope.locale ?? "en-GB",
        market: input.scope.market ?? "default",
        ...(input.scope.currency ? { currency: input.scope.currency } : {}),
      },
      // Projected onto the public selection: the composer edits a full
      // `bookingSelectionV1`, but the Session plane's normalizer rejects
      // engine-owned and staff-only keys from any payload it did not admit
      // through the staff booking authority. Preview must ask about the same
      // selection a shopper could send, or it would price something unbuyable.
      selection: bookingSelectionPublicV1.parse(input.bookingDraft),
    })
    if (outcome.kind === "offer_preview") return outcome.preview
    throw new CatalogComponentPreviewError(outcome.error)
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

/**
 * Name a catalog-backed component for Offer Preview.
 *
 * The same three-member mapping `booking-session-composite-handler.ts` uses to
 * build a child Session target, so a component previewed in the composer and
 * the same component quoted inside an accepted-Proposal Session resolve to the
 * same target — a divergence here would price two different things.
 */
export function catalogComponentPreviewTarget(
  component: Pick<TripComponent, "entityModule" | "entityId" | "sourceKind">,
): OfferPreviewTargetV1 {
  const entityId = required(component.entityId, "component.entityId")
  if (component.sourceKind !== "owned") return { kind: "catalog_item", catalogItemId: entityId }
  const entityModule = required(component.entityModule, "component.entityModule")
  return entityModule === "products"
    ? { kind: "product", productId: entityId }
    : { kind: "owned_entity", entityModule, entityId }
}

function required(value: string | null | undefined, label: string): string {
  if (!value) throw new Error(`${label} is required`)
  return value
}

/**
 * A preview the Session plane refused outright — an unauthorized caller or a
 * selection it will not admit. Distinct from `available: false`, which is a
 * *successful* preview of an unbookable target and still carries requirements.
 */
export class CatalogComponentPreviewError extends Error {
  constructor(readonly error: Extract<OfferPreviewOutcomeV1, { kind: "rejected" }>["error"]) {
    super(`catalog_component_preview_rejected:${error.kind}`)
    this.name = "CatalogComponentPreviewError"
  }
}

// Re-exported for the deployment's `CancelComponentResult` mapping symmetry.
export type { CancelEntityResult }
