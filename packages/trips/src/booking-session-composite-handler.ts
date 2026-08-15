// agent-quality: file-size exception -- owner: trips; aggregate quote, hold, commit, compensation, and component projection intentionally remain one composite protocol.
import { bookingsService, setAcceptedProposalBookingOrigin } from "@voyant-travel/bookings"
import type {
  BookingHoldInternalRecord,
  BookingQuoteInternalRecord,
  BookingRequirementsV1,
  BookingSessionCompositeHandler,
  BookingSessionInternalRecord,
  CompositeBookingCommitment,
  PricingBreakdownV1,
} from "@voyant-travel/catalog/booking-engine"
import { partySizeFromSelection } from "@voyant-travel/catalog/booking-engine"
import { policyEvidenceIdentity } from "@voyant-travel/catalog-contracts/booking-engine/pricing-contracts"
import {
  DEFAULT_PAX_BANDS,
  DEFAULT_PAYMENT_INTENTS,
  defaultBookingFields,
  defaultRequirementsFlags,
  defaultTravelerFields,
  paxBandsAllowedTotalFrom,
} from "@voyant-travel/catalog-contracts/booking-engine/requirements-defaults"
import type { BookingSessionTargetV1 } from "@voyant-travel/catalog-contracts/booking-engine/session-contracts"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import {
  bookingDraftFromComponent,
  isCatalogBackedTripComponent,
} from "./catalog-component-adapter.js"
import type { TripComponent, TripSnapshot } from "./schema.js"
import { tripComponents } from "./schema.js"
import { appendWarningCodes, createComponentEvent } from "./service-internals.js"

export interface TripBookingSessionCompositePersistence {
  loadSnapshot(db: PostgresJsDatabase, snapshotId: string): Promise<TripSnapshot | null>
  loadCurrentComponents(db: PostgresJsDatabase, envelopeId: string): Promise<TripComponent[]>
  loadAllocationIds(db: PostgresJsDatabase, bookingId: string): Promise<string[]>
  markManualConfirmationRequired(db: PostgresJsDatabase, component: TripComponent): Promise<void>
  recordComponentCommit(input: {
    db: PostgresJsDatabase
    session: BookingSessionInternalRecord
    snapshot: TripSnapshot
    component: TripComponent
    quote: BookingQuoteInternalRecord
    commitment: CompositeBookingCommitment
  }): Promise<void>
}

import { getTripSnapshotById } from "./service-snapshots.js"

/**
 * Trips-owned coordinator for a Booking Session targeting one frozen Trip
 * Snapshot. Catalog supplies the leaf quote/hold/commit implementation so the
 * coordinator never reimplements a vertical or supplier commitment point.
 */
export function createTripBookingSessionCompositeHandler(
  overrides: Partial<TripBookingSessionCompositePersistence> = {},
): BookingSessionCompositeHandler {
  const persistence: TripBookingSessionCompositePersistence = {
    loadSnapshot: getTripSnapshotById,
    loadCurrentComponents: currentComponents,
    loadAllocationIds: allocationIdsForBooking,
    markManualConfirmationRequired,
    recordComponentCommit: (input) => recordComponentCommit(input),
    ...overrides,
  }
  const composeRequirements: BookingSessionCompositeHandler["composeRequirements"] = async (
    input,
  ) => {
    {
      const database = input.tx as PostgresJsDatabase
      const snapshot = await loadTargetSnapshot(database, input.session, persistence.loadSnapshot)
      const components = frozenComponents(snapshot)

      // A Trip Snapshot froze its own configuration when the proposal was
      // accepted, so the trip-level wizard has nothing left to configure or
      // to add on to. What it still needs is the union of the components'
      // traveler and booking field requirements, which is what the Travelers
      // and Billing steps render. Component requirements come from the same
      // leaf derivation the components' own quotes use.
      const travelerFields = new Map<string, BookingRequirementsV1["travelerFields"][number]>()
      const bookingFields = new Map<string, BookingRequirementsV1["bookingFields"][number]>()
      let paxBands: BookingRequirementsV1["paxBands"] | undefined
      let paxBandsAllowedTotal: BookingRequirementsV1["paxBandsAllowedTotal"] | undefined

      for (const component of components.values()) {
        if (!isCatalogBackedTripComponent(component)) continue
        const resolved = await input.leaf.composeRequirements({
          session: childSession(input.session, component),
          now: input.now,
          tx: input.tx,
        })
        if (resolved.status === "unavailable") return resolved
        for (const field of resolved.requirements.travelerFields) {
          if (!travelerFields.has(field.key)) travelerFields.set(field.key, field)
        }
        for (const field of resolved.requirements.bookingFields) {
          if (!bookingFields.has(field.key)) bookingFields.set(field.key, field)
        }
        // Party size is one decision across the whole trip. The first
        // catalog-backed component's bands stand for it; a per-component
        // reconciliation belongs with selection validation, not here.
        paxBands ??= resolved.requirements.paxBands
        paxBandsAllowedTotal ??= resolved.requirements.paxBandsAllowedTotal
      }

      return {
        status: "available",
        requirements: {
          ...defaultRequirementsFlags(),
          showsConfigure: false,
          showsAccommodation: false,
          showsAddons: false,
          paxBands: paxBands ?? [...DEFAULT_PAX_BANDS],
          paxBandsAllowedTotal: paxBandsAllowedTotal ?? paxBandsAllowedTotalFrom(DEFAULT_PAX_BANDS),
          travelerFields:
            travelerFields.size > 0 ? [...travelerFields.values()] : defaultTravelerFields(),
          bookingFields:
            bookingFields.size > 0 ? [...bookingFields.values()] : defaultBookingFields(),
          paymentIntents: [...DEFAULT_PAYMENT_INTENTS],
        } as BookingRequirementsV1,
      }
    }
  }

  return {
    composeRequirements,

    async composeQuote(input) {
      const database = input.tx as PostgresJsDatabase
      const snapshot = await loadTargetSnapshot(database, input.session, persistence.loadSnapshot)
      const components = frozenComponents(snapshot)
      // Derived up front so every exit below — priced or not — publishes the
      // trip's own requirements rather than a component's or none at all.
      const derived = await composeRequirements(input)
      const requirements = derived.status === "available" ? derived.requirements : undefined
      const lines: PricingBreakdownV1["lines"] = []
      const taxes: PricingBreakdownV1["taxes"] = []
      const componentPolicies: NonNullable<PricingBreakdownV1["componentPolicies"]> = []

      for (const proposalLine of snapshot.proposal.lines) {
        const component = components.get(proposalLine.componentId)
        if (!component) return { ...unavailable("selection_unavailable"), requirements }
        if (!isCatalogBackedTripComponent(component)) {
          lines.push({
            kind: "base",
            label: proposalLine.description,
            quantity: 1,
            unitAmount: proposalLine.subtotalAmountCents,
            totalAmount: proposalLine.subtotalAmountCents,
            pricingBasis: "per_booking",
            componentId: proposalLine.componentId,
            authority: "accepted_proposal_manual",
          })
          if (proposalLine.taxAmountCents !== 0) {
            taxes.push({
              code: "PROPOSAL_MANUAL_TAX",
              label: `${proposalLine.description} tax`,
              rate: 0,
              amount: proposalLine.taxAmountCents,
              base: proposalLine.subtotalAmountCents,
              componentId: proposalLine.componentId,
            })
          }
          continue
        }

        const child = childSession(input.session, component)
        const quoted = await input.leaf.composeQuote({
          session: child,
          now: input.now,
          tx: input.tx,
        })
        // The component's own descriptor is not the trip's; republish the
        // trip-level one so the host renders the journey it is actually in.
        if (quoted.status === "unavailable") {
          return {
            status: "unavailable",
            requirements,
            reason: quoted.reason,
            nextAction: quoted.nextAction,
          }
        }
        const acceptedPolicy = acceptedPolicyEvidence(component)
        if (!hasRequiredPolicyEvidence(acceptedPolicy, quoted.pricing.policyEvidence)) {
          return { ...unavailable("policy_unavailable"), requirements }
        }
        if (quoted.pricing.policyEvidence) {
          componentPolicies.push({ componentId: component.id, ...quoted.pricing.policyEvidence })
        }
        lines.push(
          ...quoted.pricing.lines.map((line) => ({
            ...line,
            componentId: component.id,
            authority: "booking_quote" as const,
          })),
        )
        taxes.push(
          ...quoted.pricing.taxes.map((tax) => ({
            ...tax,
            componentId: component.id,
          })),
        )
      }

      const pricing = aggregatePricing(snapshot.currency, lines, taxes, componentPolicies)
      if (!requirements) return unavailable("selection_unavailable")
      return { status: "quoted", requirements, pricing }
    },

    async placeCapacityHold(input) {
      const database = input.tx as PostgresJsDatabase
      const snapshot = await loadTargetSnapshot(database, input.session, persistence.loadSnapshot)
      const components = frozenComponents(snapshot)
      const held: Array<{
        session: BookingSessionInternalRecord
        hold: BookingHoldInternalRecord
      }> = []

      for (const proposalLine of snapshot.proposal.lines) {
        const component = components.get(proposalLine.componentId)
        if (!component || !isCatalogBackedTripComponent(component)) continue
        const child = childSession(input.session, component)
        // Supplier-backed components reserve at the durable supplier-operation
        // boundary; a fake pre-hold would be less honest than no Hold.
        if (child.target.kind === "catalog_item") continue
        const pricing = componentPricing(input.quote.pricing, component.id)
        if (!pricing) return "unavailable"
        const hold = childHold(input, child, component.id)
        const result = await input.leaf.placeCapacityHold({
          session: child,
          quote: childQuote(input.quote, pricing),
          holdId: hold.id,
          capacityKey: hold.capacityKey,
          quantity: partySizeFromSelection(child.statePayload),
          expiresAt: hold.expiresAt,
          access: input.access,
          now: input.now,
          tx: input.tx,
        })
        if (result !== "held") {
          for (const acquired of held.reverse()) {
            await input.leaf.releaseCapacityHold({
              session: acquired.session,
              hold: acquired.hold,
              access: input.access,
              now: input.now,
              tx: input.tx,
            })
          }
          return result
        }
        held.push({ session: child, hold })
      }
      return "held"
    },

    async releaseCapacityHold(input) {
      const database = input.tx as PostgresJsDatabase
      const snapshot = await loadTargetSnapshot(database, input.session, persistence.loadSnapshot)
      for (const component of frozenComponents(snapshot).values()) {
        if (!isCatalogBackedTripComponent(component)) continue
        const child = childSession(input.session, component)
        if (child.target.kind !== "product" && child.target.kind !== "owned_entity") continue
        await input.leaf.releaseCapacityHold({
          session: child,
          hold: childHold(input, child, component.id),
          access: input.access,
          now: input.now,
          tx: input.tx,
        })
      }
    },

    async commit(input) {
      const database = input.db as PostgresJsDatabase
      const snapshot = await loadTargetSnapshot(database, input.session, persistence.loadSnapshot)
      if (materialTermsChanged(snapshot, input.quote.pricing)) {
        const proposalOrigin = acceptedProposalOrigin(input.session)
        if (proposalOrigin) {
          return {
            kind: "proposal_acceptance_required",
            nextAction: "renew_proposal_version_acceptance",
            proposalVersionId: proposalOrigin.proposalVersionId,
          }
        }
      }

      if (hasOwnedCapacityComponents(snapshot) && !input.hold) {
        return {
          kind: "hold_failure",
          nextAction: "request_new_hold",
          reason: "missing",
        }
      }

      const frozen = frozenComponents(snapshot)
      const current = new Map(
        (await persistence.loadCurrentComponents(database, snapshot.envelopeId)).map(
          (component) => [component.id, component],
        ),
      )
      const commitments: CompositeBookingCommitment[] = []
      const pending: Array<{
        componentId: string
        state:
          | "booking_confirmed"
          | "supplier_pending"
          | "supplier_in_doubt"
          | "manual_confirmation_required"
        bookingId?: string
        supplierOperationId?: string
      }> = []

      for (const proposalLine of snapshot.proposal.lines) {
        const component = frozen.get(proposalLine.componentId)
        const live = current.get(proposalLine.componentId)
        if (!component || !live) {
          pending.push({
            componentId: proposalLine.componentId,
            state: "manual_confirmation_required",
          })
          continue
        }
        if (live.bookingId) {
          const allocationIds = await persistence.loadAllocationIds(database, live.bookingId)
          commitments.push({ componentId: live.id, bookingId: live.bookingId, allocationIds })
          pending.push({
            componentId: live.id,
            state: "booking_confirmed",
            bookingId: live.bookingId,
          })
          continue
        }
        if (!isCatalogBackedTripComponent(component)) {
          await persistence.markManualConfirmationRequired(database, live)
          pending.push({
            componentId: live.id,
            state: "manual_confirmation_required",
          })
          continue
        }

        const pricing = componentPricing(input.quote.pricing, component.id)
        if (!pricing) {
          throw new Error(`trip_component_quote_missing:${component.id}`)
        }
        const child = childSession(input.session, component)
        const quote = childQuote(input.quote, pricing)
        if (child.target.kind === "product" || child.target.kind === "owned_entity") {
          if (!input.hold) throw new Error("owned inventory hold is not live at commit")
          const hold = childHold({ hold: input.hold, now: input.now }, child, component.id)
          const result = await input.leaf.commitOwned({
            session: child,
            quote,
            hold,
            idempotencyKey: componentCommitKey(input.idempotencyKey, component.id),
            requestFingerprint: componentFingerprint(input.requestFingerprint, component.id),
            access: input.access,
            now: input.now,
            async consumeSources(tx, bookingId, allocationIds) {
              await persistence.recordComponentCommit({
                db: tx as PostgresJsDatabase,
                session: input.session,
                snapshot,
                component: live,
                quote,
                commitment: { componentId: component.id, bookingId, allocationIds },
              })
            },
          })
          const commitment = {
            componentId: component.id,
            bookingId: result.bookingId,
            allocationIds: result.allocationIds,
          }
          commitments.push(commitment)
          pending.push({
            componentId: component.id,
            state: "booking_confirmed",
            bookingId: result.bookingId,
          })
          continue
        }

        const sourced = await input.leaf.commitSourced({
          session: child,
          supplierOperationScope: component.id,
          quote,
          idempotencyKey: componentCommitKey(input.idempotencyKey, component.id),
          requestFingerprint: componentFingerprint(input.requestFingerprint, component.id),
          access: input.access,
          now: input.now,
          async consumeSources(tx, bookingId, allocationIds, supplierOperationId) {
            await persistence.recordComponentCommit({
              db: tx as PostgresJsDatabase,
              session: input.session,
              snapshot,
              component: live,
              quote,
              commitment: {
                componentId: component.id,
                bookingId,
                allocationIds,
                supplierOperationId,
              },
            })
          },
        })
        if (sourced.kind === "committed") {
          const commitment = {
            componentId: component.id,
            bookingId: sourced.bookingId,
            allocationIds: sourced.allocationIds,
            supplierOperationId: sourced.supplierOperationId,
          }
          commitments.push(commitment)
          pending.push({
            componentId: component.id,
            state: "booking_confirmed",
            bookingId: sourced.bookingId,
            supplierOperationId: sourced.supplierOperationId,
          })
        } else {
          pending.push({
            componentId: component.id,
            state: sourced.kind === "supplier_in_doubt" ? "supplier_in_doubt" : "supplier_pending",
            ...(sourced.bookingId ? { bookingId: sourced.bookingId } : {}),
            supplierOperationId: sourced.supplierOperationId,
          })
        }
      }

      if (pending.some((component) => component.state !== "booking_confirmed")) {
        return {
          kind: "component_commit_pending",
          nextAction: "continue_component_commit",
          components: pending,
        }
      }
      await database.transaction((tx) => input.consumeSources(tx, commitments))
      return { kind: "committed", bookings: commitments }
    },
  }
}

function hasOwnedCapacityComponents(snapshot: TripSnapshot): boolean {
  return [...frozenComponents(snapshot).values()].some(
    (component) =>
      isCatalogBackedTripComponent(component) &&
      component.sourceKind === "owned" &&
      component.entityModule === "products",
  )
}

async function loadTargetSnapshot(
  db: PostgresJsDatabase,
  session: BookingSessionInternalRecord,
  loadSnapshot: TripBookingSessionCompositePersistence["loadSnapshot"],
): Promise<TripSnapshot> {
  if (session.target.kind !== "trip_snapshot") throw new Error("trip_snapshot_target_required")
  const snapshot = await loadSnapshot(db, session.target.tripSnapshotId)
  if (!snapshot || snapshot.envelopeId !== session.target.tripEnvelopeId) {
    throw new Error("trip_snapshot_target_not_found")
  }
  return snapshot
}

function frozenComponents(snapshot: TripSnapshot): Map<string, TripComponent> {
  return new Map(
    snapshot.frozenComponents.map((value) => {
      // agent-quality: unsafe-cast reviewed -- owner: trips; immutable snapshots store the validated TripComponent projection as JSON records.
      const component = { ...value } as TripComponent
      return [component.id, component]
    }),
  )
}

function childSession(
  parent: BookingSessionInternalRecord,
  component: TripComponent,
): BookingSessionInternalRecord {
  const draft = bookingDraftFromComponent(component)
  const parentBilling = record(parent.statePayload.billing)
  const parentTravelers = Array.isArray(parent.statePayload.travelers)
    ? parent.statePayload.travelers
    : undefined
  return {
    ...parent,
    target: componentTarget(component),
    sourcedTargetPin:
      component.sourceKind !== "owned" && component.sourceConnectionId && component.sourceRef
        ? {
            entityModule: required(component.entityModule, "component.entityModule"),
            entityId: required(component.entityId, "component.entityId"),
            sourceKind: required(component.sourceKind, "component.sourceKind"),
            sourceProvider: componentSourceProvider(component),
            sourceConnectionId: component.sourceConnectionId,
            sourceRef: component.sourceRef,
            projection: compact({
              title: component.title,
              description: component.description,
            }),
            title:
              component.title ??
              `Sourced ${required(component.entityModule, "component.entityModule")}`,
          }
        : undefined,
    statePayload: compact({
      configure: draft.configure,
      billing: parentBilling ?? draft.billing,
      travelers: parentTravelers ?? draft.travelers,
      accommodation: draft.accommodation,
      addons: draft.addons,
      payment: draft.payment,
      promotionCode: draft.promotionCode,
    }),
  }
}

function componentTarget(component: TripComponent): BookingSessionTargetV1 {
  if (component.sourceKind === "owned") {
    const entityModule = required(component.entityModule, "component.entityModule")
    const entityId = required(component.entityId, "component.entityId")
    return entityModule === "products"
      ? { kind: "product", productId: entityId }
      : { kind: "owned_entity", entityModule, entityId }
  }
  return { kind: "catalog_item", catalogItemId: required(component.entityId, "component.entityId") }
}

function childQuote(
  parent: BookingQuoteInternalRecord,
  pricing: PricingBreakdownV1,
): BookingQuoteInternalRecord {
  return { ...parent, pricing, priceFingerprint: "aggregate_component_quote" }
}

function childHold(
  input: { hold: BookingHoldInternalRecord; now: Date },
  session: BookingSessionInternalRecord,
  componentId: string,
): BookingHoldInternalRecord
function childHold(
  input: {
    holdId: string
    quote: BookingQuoteInternalRecord
    expiresAt: Date
    now: Date
  },
  session: BookingSessionInternalRecord,
  componentId: string,
): BookingHoldInternalRecord
function childHold(
  input:
    | { hold: BookingHoldInternalRecord; now: Date }
    | {
        holdId: string
        quote: BookingQuoteInternalRecord
        expiresAt: Date
        now: Date
      },
  session: BookingSessionInternalRecord,
  componentId: string,
): BookingHoldInternalRecord {
  const id = `${"hold" in input ? input.hold.id : input.holdId}:${componentId}`
  return {
    id,
    sessionId: session.id,
    quoteId: "hold" in input ? input.hold.quoteId : input.quote.id,
    target: session.target,
    quantity: partySizeFromSelection(session.statePayload),
    state: "active",
    capacityKey: componentCapacityKey(session.target, componentId),
    expiresAt: "hold" in input ? input.hold.expiresAt : input.expiresAt,
    createdAt: "hold" in input ? input.hold.createdAt : input.now,
  }
}

function componentPricing(
  aggregate: PricingBreakdownV1,
  componentId: string,
): PricingBreakdownV1 | null {
  const lines = aggregate.lines.filter((line) => line.componentId === componentId)
  if (lines.length === 0) return null
  const taxes = aggregate.taxes.filter((tax) => tax.componentId === componentId)
  const subtotal = lines.reduce((sum, line) => sum + line.totalAmount, 0)
  const taxTotal = taxes.reduce((sum, tax) => sum + tax.amount, 0)
  return {
    currency: aggregate.currency,
    lines,
    taxes,
    subtotal,
    taxTotal,
    total: subtotal + taxTotal,
  }
}

function aggregatePricing(
  currency: string,
  lines: PricingBreakdownV1["lines"],
  taxes: PricingBreakdownV1["taxes"],
  componentPolicies: NonNullable<PricingBreakdownV1["componentPolicies"]>,
): PricingBreakdownV1 {
  const subtotal = lines.reduce((sum, line) => sum + line.totalAmount, 0)
  const taxTotal = taxes.reduce((sum, tax) => sum + tax.amount, 0)
  return {
    currency,
    lines,
    taxes,
    subtotal,
    taxTotal,
    total: subtotal + taxTotal,
    ...(componentPolicies.length > 0 ? { componentPolicies } : {}),
  }
}

function materialTermsChanged(snapshot: TripSnapshot, pricing: PricingBreakdownV1): boolean {
  return (
    pricing.currency !== snapshot.currency ||
    pricing.subtotal !== snapshot.subtotalAmountCents ||
    pricing.taxTotal !== snapshot.taxAmountCents ||
    pricing.total !== snapshot.totalAmountCents ||
    materialComponentPricingChanged(snapshot, pricing) ||
    materialPolicyChanged(snapshot, pricing)
  )
}

function materialComponentPricingChanged(
  snapshot: TripSnapshot,
  pricing: PricingBreakdownV1,
): boolean {
  return snapshot.proposal.lines.some((line) => {
    const current = componentPricing(pricing, line.componentId)
    return (
      !current ||
      current.currency !== line.currency ||
      current.subtotal !== line.subtotalAmountCents ||
      current.taxTotal !== line.taxAmountCents ||
      current.total !== line.totalAmountCents
    )
  })
}

function materialPolicyChanged(snapshot: TripSnapshot, pricing: PricingBreakdownV1): boolean {
  const current = new Map(
    (pricing.componentPolicies ?? []).map((policy) => [policy.componentId, policy]),
  )
  for (const component of frozenComponents(snapshot).values()) {
    if (!isCatalogBackedTripComponent(component)) continue
    const accepted = acceptedPolicyEvidence(component)
    const fresh = current.get(component.id)
    // Compared on identity, not on the instant each side was read. The accepted
    // snapshot was captured when the traveller accepted the proposal and the
    // fresh one moments ago, so their `capturedAt` always differ - which used to
    // report every catalog-backed component as materially changed and demand a
    // re-acceptance no traveller could ever clear (voyant#4689).
    if (accepted?.cancellation !== undefined || fresh?.cancellation !== undefined) {
      if (
        stableJson(policyEvidenceIdentity(accepted?.cancellation)) !==
        stableJson(policyEvidenceIdentity(fresh?.cancellation))
      ) {
        return true
      }
    }
    if (accepted?.bookingTerms !== undefined || fresh?.bookingTerms !== undefined) {
      if (
        stableJson(policyEvidenceIdentity(accepted?.bookingTerms)) !==
        stableJson(policyEvidenceIdentity(fresh?.bookingTerms))
      ) {
        return true
      }
    }
  }
  return false
}

function acceptedPolicyEvidence(component: TripComponent) {
  const bookingTerms = component.metadata.bookingTerms ?? component.metadata.booking_terms
  if (component.cancellationSnapshot == null && bookingTerms === undefined) return undefined
  return {
    ...(component.cancellationSnapshot != null
      ? { cancellation: component.cancellationSnapshot }
      : {}),
    ...(bookingTerms !== undefined ? { bookingTerms } : {}),
  }
}

function hasRequiredPolicyEvidence(
  accepted: ReturnType<typeof acceptedPolicyEvidence>,
  fresh: PricingBreakdownV1["policyEvidence"],
) {
  if (!accepted) return true
  if (accepted.cancellation !== undefined && fresh?.cancellation === undefined) return false
  if (accepted.bookingTerms !== undefined && fresh?.bookingTerms === undefined) return false
  return true
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value))
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJson(item)]),
  )
}

async function currentComponents(db: PostgresJsDatabase, envelopeId: string) {
  const rows = await db
    .select()
    .from(tripComponents)
    .where(eq(tripComponents.envelopeId, envelopeId))
  return rows
}

async function allocationIdsForBooking(db: PostgresJsDatabase, bookingId: string) {
  const rows = await bookingsService.listAllocations(db, bookingId)
  return rows.map((row) => row.id)
}

async function markManualConfirmationRequired(db: PostgresJsDatabase, component: TripComponent) {
  const warningCodes = appendWarningCodes(component.warningCodes, [
    "manual_supplier_confirmation_required",
  ])
  await db
    .update(tripComponents)
    .set({ status: "held", warningCodes, updatedAt: new Date() })
    .where(eq(tripComponents.id, component.id))
  await createComponentEvent(db, {
    envelopeId: component.envelopeId,
    componentId: component.id,
    eventType: "staff_remediation_required",
    fromStatus: component.status,
    toStatus: "held",
    payload: {
      reason: "manual_supplier_confirmation_required",
      proposedAmountPreserved: true,
    },
  })
}

async function recordComponentCommit(input: {
  db: PostgresJsDatabase
  session: BookingSessionInternalRecord
  snapshot: TripSnapshot
  component: TripComponent
  quote: BookingQuoteInternalRecord
  commitment: CompositeBookingCommitment
}) {
  const { db, session, snapshot, component, quote, commitment } = input
  const [updated] = await db
    .update(tripComponents)
    .set({
      status: "booked",
      bookingId: commitment.bookingId,
      updatedAt: new Date(),
    })
    .where(eq(tripComponents.id, component.id))
    .returning()
  if (!updated) throw new Error(`trip_component_commit_update_failed:${component.id}`)
  await createComponentEvent(db, {
    envelopeId: component.envelopeId,
    componentId: component.id,
    eventType: "booked",
    fromStatus: component.status,
    toStatus: "booked",
    payload: {
      bookingId: commitment.bookingId,
      supplierOperationId: commitment.supplierOperationId,
      bookingSessionId: session.id,
      bookingSessionQuoteId: quote.id,
    },
  })
  const origin = acceptedProposalOrigin(session)
  if (origin) {
    await setAcceptedProposalBookingOrigin(db, {
      bookingId: commitment.bookingId,
      proposalId: origin.proposalId,
      proposalVersionId: origin.proposalVersionId,
      tripEnvelopeId: snapshot.envelopeId,
      tripSnapshotId: snapshot.id,
      tripComponentId: component.id,
      bookingSessionId: session.id,
      bookingSessionQuoteId: quote.id,
      supplierOperationId: commitment.supplierOperationId,
    })
  }
}

function acceptedProposalOrigin(session: BookingSessionInternalRecord) {
  return session.origin?.kind === "accepted_proposal_version" ? session.origin : undefined
}

function componentCapacityKey(target: BookingSessionTargetV1, componentId: string) {
  if (target.kind === "product") return `product:${target.productId}:${componentId}`
  if (target.kind === "owned_entity") {
    return `owned_entity:${target.entityModule}:${target.entityId}:${componentId}`
  }
  if (target.kind === "catalog_item") return `catalog_item:${target.catalogItemId}:${componentId}`
  return `trip_snapshot:${target.tripSnapshotId}:${componentId}`
}

function componentCommitKey(parent: string, componentId: string) {
  return `${parent}:${componentId}`.slice(0, 128)
}

function componentFingerprint(parent: string, componentId: string) {
  return `${parent}:${componentId}`
}

function unavailable(reason: "selection_unavailable" | "policy_unavailable") {
  return {
    status: "unavailable" as const,
    reason,
    nextAction:
      reason === "policy_unavailable"
        ? ("contact_operator" as const)
        : ("update_selection" as const),
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
}

function required(value: string | null | undefined, label: string): string {
  if (!value) throw new Error(`${label} is required`)
  return value
}

function componentSourceProvider(component: TripComponent): string | null {
  const value = component.metadata.sourceProvider
  return typeof value === "string" && value.length > 0 ? value : null
}
