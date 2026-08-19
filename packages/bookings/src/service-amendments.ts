// agent-quality: file-size exception -- owner: bookings; preview, acceptance, supplier settlement, reconciliation, and atomic projection form one Amendment protocol with shared invariants.
import type {
  BookingAmendment,
  BookingAmendmentFinancialConsequences,
  BookingAmendmentPrice,
  BookingItemAddition,
  BookingItemMove,
  BookingItemMoveRefundHandling,
  BookingRevisionSnapshot,
  PreviewBookingItemAdditionInput,
  PreviewBookingItemMoveInput,
  PreviewTravelerCorrectionInput,
  PreviewTravelerRosterChangeInput,
  TravelerCorrectionPatch,
} from "@voyant-travel/bookings-contracts"
import {
  ACTIVE_BOOKING_ALLOCATION_STATUSES,
  isActiveBookingAllocationStatus,
} from "@voyant-travel/bookings-contracts"
import { newId } from "@voyant-travel/db/lib/typeid"
import { and, asc, eq, inArray, or, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { availabilitySlotsRef } from "./availability-ref.js"
import { productsRef } from "./products-ref.js"
import type { BookingsFinanceRuntime, BookingsSupplierAmendmentRuntime } from "./runtime-port.js"
import {
  bookingActivityLog,
  bookingAllocations,
  bookingAmendments,
  bookingItems,
  bookingItemTravelers,
  bookingRevisions,
  bookings,
  bookingTravelers,
} from "./schema.js"
import type {
  BookingAmendmentActor,
  BookingAmendmentEffects,
  BookingAmendmentItemAddPlan,
  BookingAmendmentItemMovePlan,
  BookingAmendmentPolicyDecision,
  BookingAmendmentRosterItemPlan,
  BookingAmendmentRow,
  BookingRevisionRow,
} from "./schema-amendments.js"
import { isItemAddPlan, isItemMovePlan } from "./schema-amendments.js"
import { resolveBookingItemSnapshot } from "./service-core.js"
import { resolveSessionPricingSnapshot } from "./service-public-core.js"

const TRAVELER_IDENTITY_FIELDS = new Set<keyof TravelerCorrectionPatch>(["firstName", "lastName"])
export const DEFAULT_BOOKING_AMENDMENT_QUOTE_TTL_MS = 30 * 60 * 1_000

const ZERO_PRICE = (currency: string): BookingAmendmentPrice => ({
  currency,
  subtotalDeltaCents: 0,
  feeDeltaCents: 0,
  taxDeltaCents: 0,
  amountCents: 0,
  collectionAmountCents: 0,
  refundAmountCents: 0,
  taxLines: [],
})

const NO_FINANCIAL_CONSEQUENCES: BookingAmendmentFinancialConsequences = {
  collection: "not_required",
  refund: "not_required",
  invoice: "not_required",
  creditNote: "not_required",
  paymentSchedule: "not_required",
}

const NO_EXTERNAL_EFFECTS: BookingAmendmentEffects = {
  finance: "not_required",
  legal: "not_required",
  documents: "not_required",
  fulfillment: "not_required",
  supplier: "not_required",
  allocation: "not_required",
}

export interface BookingAmendmentCommandContext {
  actor: BookingAmendmentActor
  actorId?: string | null
  idempotencyKey: string
}

export interface BookingAmendmentServiceDependencies {
  finance?: BookingsFinanceRuntime
  supplier?: BookingsSupplierAmendmentRuntime
  now?: () => Date
  quoteTtlMs?: number
}

export type PreviewTravelerCorrectionResult =
  | { status: "ok"; amendment: BookingAmendment }
  | { status: "no_op"; bookingId: string; travelerId: string; bookingRevision: number }
  | { status: "not_found" }
  | { status: "idempotency_conflict" }
  | { status: "stale_revision"; currentBookingRevision: number }

export type PreviewTravelerRosterChangeResult =
  | { status: "ok"; amendment: BookingAmendment }
  | { status: "not_found" | "idempotency_conflict" }
  | { status: "unsupported_configuration"; reason: string }
  | { status: "availability_changed"; bookingItemId: string }
  | { status: "stale_revision"; currentBookingRevision: number }

export type AcceptBookingAmendmentResult =
  | { status: "ok"; amendment: BookingAmendment }
  | { status: "not_found" | "revision_mismatch" | "acceptance_not_required" | "quote_expired" }
  | { status: "already_applied"; amendment: BookingAmendment }
  | { status: "stale_revision"; currentBookingRevision: number }

export type ApplyBookingAmendmentResult =
  | { status: "ok"; amendment: BookingAmendment }
  | {
      status: "supplier_pending" | "supplier_in_doubt" | "supplier_refused" | "manual_review"
      amendment: BookingAmendment
    }
  | {
      status:
        | "not_found"
        | "revision_mismatch"
        | "acceptance_required"
        | "invalid_state"
        | "idempotency_conflict"
        | "quote_expired"
        | "unsupported_capability"
    }
  | { status: "availability_changed"; bookingItemId: string }
  | { status: "stale_revision"; currentBookingRevision: number }

type BookingRow = typeof bookings.$inferSelect
type TravelerRow = typeof bookingTravelers.$inferSelect
type ItemRow = typeof bookingItems.$inferSelect
type AllocationRow = typeof bookingAllocations.$inferSelect

interface SnapshotState {
  travelers: TravelerRow[]
  items: ItemRow[]
  allocations: AllocationRow[]
  travelerIdsByItem: Map<string, string[]>
}

class RosterPlanError extends Error {
  constructor(
    readonly code: "not_found" | "unsupported_configuration" | "availability_changed",
    message: string,
    readonly bookingItemId?: string,
  ) {
    super(message)
  }
}

function serializeRevision(row: BookingRevisionRow) {
  return {
    id: row.id,
    amendmentId: row.amendmentId,
    bookingId: row.bookingId,
    bookingRevision: row.bookingRevision,
    role: row.role,
    snapshot: row.snapshot,
    changedFields: row.changedFields,
    authorizedBy: row.authorizedBy,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  }
}

function nextActionsFor(row: BookingAmendmentRow) {
  const nextActions: BookingAmendment["nextActions"] = []
  if (row.status === "proposed") nextActions.push(row.acceptanceRequired ? "accept" : "apply")
  if (row.status === "accepted") nextActions.push("apply")
  if (row.status === "applying") nextActions.push("wait_supplier")
  if (row.status === "in_doubt") nextActions.push("reconcile_supplier")
  if (row.status === "manual_review") nextActions.push("manual_review")
  if (row.status === "applied") {
    if (row.collectionAmountCents > 0) nextActions.push("collect_payment")
    if (row.refundAmountCents > 0) nextActions.push("issue_refund")
    if (row.effects.documents === "reissue_required") nextActions.push("reissue_documents")
  }
  return nextActions
}

function serializeAmendment(row: BookingAmendmentRow, revisions: BookingRevisionRow[]) {
  return {
    id: row.id,
    bookingId: row.bookingId,
    travelerId: row.travelerId,
    kind: row.kind,
    status: row.status,
    baseBookingRevision: row.baseBookingRevision,
    resultBookingRevision: row.resultBookingRevision,
    acceptanceRequired: row.acceptanceRequired,
    policyDecisions: row.policyDecisions,
    priceDelta: {
      currency: row.priceCurrency,
      subtotalDeltaCents: row.subtotalDeltaCents,
      feeDeltaCents: row.feeDeltaCents,
      taxDeltaCents: row.taxDeltaCents,
      amountCents: row.priceDeltaCents,
      collectionAmountCents: row.collectionAmountCents,
      refundAmountCents: row.refundAmountCents,
      taxLines: row.taxLines,
    },
    financialConsequences: row.financialConsequences,
    effects: row.effects,
    nextActions: nextActionsFor(row),
    quotedAt: row.quotedAt.toISOString(),
    quoteExpiresAt: row.quoteExpiresAt?.toISOString() ?? null,
    supplierOperationIds: row.supplierOperationIds,
    failureCode: row.failureCode,
    requestedBy: row.requestedBy,
    requestedActor: row.requestedActor,
    reason: row.reason,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    acceptedBy: row.acceptedBy,
    acceptedActor: row.acceptedActor,
    appliedAt: row.appliedAt?.toISOString() ?? null,
    appliedBy: row.appliedBy,
    appliedActor: row.appliedActor,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    revisions: revisions.map(serializeRevision),
  } satisfies BookingAmendment
}

async function hydrateAmendment(db: PostgresJsDatabase, row: BookingAmendmentRow) {
  const revisions = await db
    .select()
    .from(bookingRevisions)
    .where(eq(bookingRevisions.amendmentId, row.id))
    .orderBy(asc(bookingRevisions.createdAt), asc(bookingRevisions.id))
  return serializeAmendment(row, revisions)
}

function snapshotTraveler(row: TravelerRow) {
  return {
    id: row.id,
    personId: row.personId,
    participantType: row.participantType,
    travelerCategory: row.travelerCategory,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    preferredLanguage: row.preferredLanguage,
    isPrimary: row.isPrimary,
  }
}

async function loadSnapshotState(
  db: PostgresJsDatabase,
  bookingId: string,
): Promise<SnapshotState> {
  const [travelers, items, allocations, participants] = await Promise.all([
    db
      .select()
      .from(bookingTravelers)
      .where(eq(bookingTravelers.bookingId, bookingId))
      .orderBy(asc(bookingTravelers.createdAt), asc(bookingTravelers.id)),
    db
      .select()
      .from(bookingItems)
      .where(eq(bookingItems.bookingId, bookingId))
      .orderBy(asc(bookingItems.createdAt), asc(bookingItems.id)),
    db
      .select()
      .from(bookingAllocations)
      .where(eq(bookingAllocations.bookingId, bookingId))
      .orderBy(asc(bookingAllocations.createdAt), asc(bookingAllocations.id)),
    db
      .select({
        bookingItemId: bookingItemTravelers.bookingItemId,
        travelerId: bookingItemTravelers.travelerId,
      })
      .from(bookingItemTravelers)
      .innerJoin(bookingItems, eq(bookingItems.id, bookingItemTravelers.bookingItemId))
      .where(eq(bookingItems.bookingId, bookingId)),
  ])
  const travelerIdsByItem = new Map<string, string[]>()
  for (const participant of participants) {
    const ids = travelerIdsByItem.get(participant.bookingItemId) ?? []
    ids.push(participant.travelerId)
    travelerIdsByItem.set(participant.bookingItemId, ids)
  }
  for (const ids of travelerIdsByItem.values()) ids.sort()
  return { travelers, items, allocations, travelerIdsByItem }
}

function snapshotBooking(
  booking: BookingRow,
  revision: number,
  state: SnapshotState,
  overrides: {
    travelers?: ReturnType<typeof snapshotTraveler>[]
    itemQuantityDelta?: Map<string, number>
    itemTravelerIds?: Map<string, string[]>
    allocationQuantityDelta?: Map<string, number>
    sellAmountDeltaCents?: number
    paxDelta?: number
    /**
     * Items the Amendment will create. They have no row yet, so they
     * cannot come from `state` — the proposed snapshot has to be told
     * about them or it would show the booking without the very service
     * being added.
     */
    addedItems?: BookingRevisionSnapshot["items"]
    /**
     * Absolute new total for an item, keyed by id. A move reprices the line
     * outright rather than nudging it by a delta, so the proposed snapshot
     * needs the number itself.
     */
    itemTotalOverride?: Map<string, number>
  } = {},
): BookingRevisionSnapshot {
  const itemQuantityDelta = overrides.itemQuantityDelta ?? new Map()
  const itemTravelerIds = overrides.itemTravelerIds ?? state.travelerIdsByItem
  const allocationQuantityDelta = overrides.allocationQuantityDelta ?? new Map()
  return {
    bookingId: booking.id,
    bookingNumber: booking.bookingNumber,
    revision,
    sellAmountCents:
      booking.sellAmountCents == null
        ? null
        : booking.sellAmountCents + (overrides.sellAmountDeltaCents ?? 0),
    pax: booking.pax == null ? null : Math.max(0, booking.pax + (overrides.paxDelta ?? 0)),
    travelers: overrides.travelers ?? state.travelers.map(snapshotTraveler),
    items: [
      ...state.items.map((item) => ({
        id: item.id,
        quantity: item.quantity + (itemQuantityDelta.get(item.id) ?? 0),
        totalSellAmountCents:
          overrides.itemTotalOverride?.get(item.id) ??
          (item.totalSellAmountCents == null
            ? null
            : item.totalSellAmountCents +
              (itemQuantityDelta.get(item.id) ?? 0) * (item.unitSellAmountCents ?? 0)),
        travelerIds: [...(itemTravelerIds.get(item.id) ?? [])].sort(),
        allocations: state.allocations
          .filter((allocation) => allocation.bookingItemId === item.id)
          .map((allocation) => ({
            id: allocation.id,
            quantity: allocation.quantity + (allocationQuantityDelta.get(allocation.id) ?? 0),
            status: allocation.status,
          })),
      })),
      ...(overrides.addedItems ?? []),
    ],
  }
}

function changedTravelerFields(traveler: TravelerRow, patch: TravelerCorrectionPatch) {
  return (Object.keys(patch) as (keyof TravelerCorrectionPatch)[])
    .filter((field) => patch[field] !== traveler[field])
    .sort()
}

function sameTravelerPatch(left: TravelerCorrectionPatch, right: TravelerCorrectionPatch) {
  const fields = new Set([
    ...(Object.keys(left) as (keyof TravelerCorrectionPatch)[]),
    ...(Object.keys(right) as (keyof TravelerCorrectionPatch)[]),
  ])
  return [...fields].every(
    (field) =>
      Object.hasOwn(left, field) === Object.hasOwn(right, field) && left[field] === right[field],
  )
}

function correctionPolicy(input: {
  actor: BookingAmendmentActor
  changedFields: (keyof TravelerCorrectionPatch)[]
}): { acceptanceRequired: boolean; decisions: BookingAmendmentPolicyDecision[] } {
  const changesIdentity = input.changedFields.some((field) => TRAVELER_IDENTITY_FIELDS.has(field))
  const acceptanceRequired = input.actor === "customer" && changesIdentity
  return {
    acceptanceRequired,
    decisions: [
      {
        code: "traveler-correction",
        version: "v1",
        decision: acceptanceRequired ? "acceptance_required" : "allowed",
        reason: acceptanceRequired
          ? "Customer-authorized identity corrections require explicit acceptance."
          : "The admitted correction has no price or external-system consequence.",
      },
    ],
  }
}

function rosterPolicy(financePolicyVersion: string): BookingAmendmentPolicyDecision[] {
  return [
    {
      code: "priced-traveler-roster-change",
      version: "v1",
      decision: "acceptance_required",
      reason: "Traveler roster changes alter price, inventory, or supplier state.",
    },
    {
      code: "booking-amendment-finance",
      version: financePolicyVersion,
      decision: "acceptance_required",
      reason: "The exact server-calculated financial delta is bound to this Booking revision.",
    },
  ]
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === "string" && value.length > 0 ? value : null
}

function supplierPassenger(traveler: ReturnType<typeof snapshotTraveler>) {
  return {
    id: traveler.id,
    first_name: traveler.firstName,
    last_name: traveler.lastName,
    ...(traveler.travelerCategory ? { category: traveler.travelerCategory } : {}),
    ...(traveler.email ? { email: traveler.email } : {}),
    ...(traveler.phone ? { phone: traveler.phone } : {}),
  }
}

async function buildRosterPlans(
  db: PostgresJsDatabase,
  booking: BookingRow,
  state: SnapshotState,
  input: PreviewTravelerRosterChangeInput,
  travelerId: string,
) {
  const selectedIds = new Set(input.change.bookingItemIds)
  const selectedItems = state.items.filter((item) => selectedIds.has(item.id))
  if (selectedItems.length !== selectedIds.size) {
    throw new RosterPlanError("not_found", "One or more Booking Items do not exist")
  }
  const existingTraveler = state.travelers.find((traveler) => traveler.id === travelerId)
  if (input.change.type === "traveler_drop" && !existingTraveler) {
    throw new RosterPlanError("not_found", "Traveler does not exist")
  }
  if (input.change.type === "traveler_drop") {
    const assignedItemIds = [...state.travelerIdsByItem]
      .filter(([, travelerIds]) => travelerIds.includes(travelerId))
      .map(([itemId]) => itemId)
      .sort()
    const selectedItemIds = [...input.change.bookingItemIds].sort()
    if (assignedItemIds.join("\u0000") !== selectedItemIds.join("\u0000")) {
      throw new RosterPlanError(
        "unsupported_configuration",
        "Dropping a traveler must include every Booking Item currently assigned to that traveler",
      )
    }
  }

  const proposedTravelers =
    input.change.type === "traveler_add"
      ? [
          ...state.travelers.map(snapshotTraveler),
          {
            id: travelerId,
            personId: input.change.traveler.personId ?? null,
            participantType: input.change.traveler.participantType,
            travelerCategory: input.change.traveler.travelerCategory ?? null,
            firstName: input.change.traveler.firstName,
            lastName: input.change.traveler.lastName,
            email: input.change.traveler.email ?? null,
            phone: input.change.traveler.phone ?? null,
            preferredLanguage: input.change.traveler.preferredLanguage ?? null,
            isPrimary: false,
          },
        ]
      : state.travelers.map(snapshotTraveler).filter((traveler) => traveler.id !== travelerId)

  const proposedTravelerIdsByItem = new Map(
    [...state.travelerIdsByItem].map(([itemId, ids]) => [itemId, [...ids]]),
  )
  for (const item of selectedItems) {
    const currentIds = proposedTravelerIdsByItem.get(item.id) ?? []
    if (input.change.type === "traveler_drop" && !currentIds.includes(travelerId)) {
      throw new RosterPlanError(
        "unsupported_configuration",
        "Traveler is not assigned to every selected Booking Item",
        item.id,
      )
    }
    proposedTravelerIdsByItem.set(
      item.id,
      input.change.type === "traveler_add"
        ? [...currentIds, travelerId].sort()
        : currentIds.filter((id) => id !== travelerId),
    )
  }

  const quantityDelta = input.change.type === "traveler_add" ? (1 as const) : (-1 as const)
  const plans: BookingAmendmentRosterItemPlan[] = []
  for (const item of selectedItems) {
    if (item.status !== "confirmed") {
      throw new RosterPlanError(
        "unsupported_configuration",
        "Only active Booking Items can change traveler roster",
        item.id,
      )
    }
    if (
      item.sellCurrency !== booking.sellCurrency ||
      item.unitSellAmountCents == null ||
      item.totalSellAmountCents == null
    ) {
      throw new RosterPlanError(
        "unsupported_configuration",
        "Booking Item has no authoritative per-traveler price in the Booking currency",
        item.id,
      )
    }
    const activeAllocations = state.allocations.filter(
      (allocation) =>
        allocation.bookingItemId === item.id &&
        (allocation.status === "held" || allocation.status === "confirmed"),
    )
    if (activeAllocations.length !== 1) {
      throw new RosterPlanError(
        "unsupported_configuration",
        "Traveler roster changes require exactly one active capacity allocation per Booking Item",
        item.id,
      )
    }
    const allocation = activeAllocations[0]!
    if (!allocation.availabilitySlotId && allocation.quantity + quantityDelta < 0) {
      throw new RosterPlanError(
        "unsupported_configuration",
        "Allocation quantity cannot become negative",
        item.id,
      )
    }
    const allocationMetadata = asRecord(allocation.metadata)
    const itemMetadata = asRecord(item.metadata)
    const sourceConnectionId = stringField(allocationMetadata, "sourceConnectionId")
    const upstreamRef =
      stringField(allocationMetadata, "upstreamRef") ?? stringField(itemMetadata, "upstreamRef")
    const sourceKind = stringField(allocationMetadata, "sourceKind")
    const sourced = Boolean(sourceConnectionId || upstreamRef || sourceKind)
    if (sourced && (!sourceConnectionId || !upstreamRef || !sourceKind)) {
      throw new RosterPlanError(
        "unsupported_configuration",
        "Sourced allocation provenance is incomplete",
        item.id,
      )
    }
    if (!sourced && !allocation.availabilitySlotId) {
      throw new RosterPlanError(
        "unsupported_configuration",
        "Owned allocation has no authoritative availability slot",
        item.id,
      )
    }
    if (quantityDelta > 0 && allocation.availabilitySlotId) {
      const [slot] = await db
        .select({
          status: availabilitySlotsRef.status,
          unlimited: availabilitySlotsRef.unlimited,
          remainingPax: availabilitySlotsRef.remainingPax,
          pastCutoff: availabilitySlotsRef.pastCutoff,
          tooEarly: availabilitySlotsRef.tooEarly,
        })
        .from(availabilitySlotsRef)
        .where(eq(availabilitySlotsRef.id, allocation.availabilitySlotId))
        .limit(1)
      if (
        slot?.status !== "open" ||
        slot.pastCutoff ||
        slot.tooEarly ||
        (!slot.unlimited && (slot.remainingPax ?? 0) < 1)
      ) {
        throw new RosterPlanError("availability_changed", "Availability changed", item.id)
      }
    }
    const desiredPassengers = (proposedTravelerIdsByItem.get(item.id) ?? []).flatMap((id) => {
      const traveler = proposedTravelers.find((candidate) => candidate.id === id)
      return traveler ? [supplierPassenger(traveler)] : []
    })
    const desiredState = {
      parameters: { quantity: item.quantity + quantityDelta },
      party: { passengers: desiredPassengers },
    }
    plans.push({
      bookingItemId: item.id,
      quantityDelta,
      unitSellAmountCents: item.unitSellAmountCents,
      allocationId: allocation.id,
      allocationQuantityBefore: allocation.quantity,
      availabilitySlotId: allocation.availabilitySlotId,
      supplierOperation: sourced
        ? {
            entityModule: stringField(itemMetadata, "entityModule") ?? "catalog",
            entityId: stringField(itemMetadata, "entityId") ?? item.productId ?? item.id,
            sourceKind: sourceKind!,
            sourceConnectionId: sourceConnectionId!,
            sourceRef: item.sourceOfferId ?? item.id,
            upstreamRef: upstreamRef!,
            desiredState,
            requestFingerprint: await stableFingerprint(desiredState),
          }
        : null,
    })
  }
  return { plans, proposedTravelers, proposedTravelerIdsByItem }
}

function rosterEffects(
  kind: "traveler_add" | "traveler_drop",
  price: BookingAmendmentPrice,
  supplierRequired: boolean,
): BookingAmendmentEffects {
  return {
    finance:
      price.collectionAmountCents > 0
        ? "collection_required"
        : price.refundAmountCents > 0
          ? "refund_required"
          : "not_required",
    legal: "not_required",
    documents: "reissue_required",
    fulfillment: "reissue_required",
    supplier: supplierRequired ? "modify_required" : "not_required",
    allocation: kind === "traveler_add" ? "increase_required" : "release_required",
  }
}

function mapPlanError(error: RosterPlanError): PreviewTravelerRosterChangeResult {
  if (error.code === "not_found") return { status: "not_found" }
  if (error.code === "availability_changed") {
    return { status: "availability_changed", bookingItemId: error.bookingItemId ?? "unknown" }
  }
  return { status: "unsupported_configuration", reason: error.message }
}

/**
 * Resolve what a requested addition actually costs and whether it can be
 * held, from the catalog rather than from the caller.
 *
 * The price comes from `resolveSessionPricingSnapshot` — the same authority
 * the storefront prices against — so an operator adding a service mid-trip
 * quotes the number the catalog says, not one they typed. Anything the
 * catalog cannot answer is refused rather than guessed.
 *
 * Sourced (supplier) products are refused outright: adding a service the
 * supplier has never heard of needs a supplier *create* call, and the
 * supplier amendment port only knows how to modify an operation that
 * already has an `upstreamRef`. Quoting one would promise capacity nobody
 * reserved.
 */
/**
 * Load the departure an addition targets, scoped to the product that
 * claims it.
 *
 * Scoping is the point. Looking a slot up by id alone lets a caller pair
 * product A with a departure belonging to product B: apply would then
 * decrement B's capacity while writing an item and allocation that say A,
 * corrupting both inventory views at once. Not found and wrong-product are
 * deliberately the same answer.
 */
async function loadAdditionSlot(db: PostgresJsDatabase, slotId: string, productId: string) {
  const [slot] = await db
    .select({
      id: availabilitySlotsRef.id,
      status: availabilitySlotsRef.status,
      unlimited: availabilitySlotsRef.unlimited,
      remainingPax: availabilitySlotsRef.remainingPax,
      pastCutoff: availabilitySlotsRef.pastCutoff,
      tooEarly: availabilitySlotsRef.tooEarly,
    })
    .from(availabilitySlotsRef)
    .where(and(eq(availabilitySlotsRef.id, slotId), eq(availabilitySlotsRef.productId, productId)))
    .limit(1)
  if (!slot) {
    throw new RosterPlanError("not_found", "Departure does not exist for this product")
  }
  return slot
}

/**
 * The catalog price for `quantity` of a unit, honouring quantity tiers.
 *
 * Tiers are ordered by the pricing snapshot; the matching one is the tier
 * whose `[minQuantity, maxQuantity]` window contains the requested
 * quantity. With no tiers — or none that match — the rule's own price
 * stands.
 */
function resolveTieredUnitPrice(
  unitPrice: {
    sellAmountCents: number | null
    tiers?: Array<{
      minQuantity: number
      maxQuantity: number | null
      sellAmountCents: number | null
    }>
  },
  quantity: number,
): number | null {
  const tier = (unitPrice.tiers ?? []).find(
    (entry) =>
      quantity >= entry.minQuantity &&
      (entry.maxQuantity == null || quantity <= entry.maxQuantity) &&
      entry.sellAmountCents != null,
  )
  return tier?.sellAmountCents ?? unitPrice.sellAmountCents ?? null
}

async function buildItemAddPlan(
  db: PostgresJsDatabase,
  booking: BookingRow,
  addition: BookingItemAddition,
): Promise<BookingAmendmentItemAddPlan> {
  const [product] = await db
    .select({
      id: productsRef.id,
      name: productsRef.name,
      status: productsRef.status,
      sellCurrency: productsRef.sellCurrency,
      sellAmountCents: productsRef.sellAmountCents,
      costAmountCents: productsRef.costAmountCents,
      supplierId: productsRef.supplierId,
    })
    .from(productsRef)
    .where(eq(productsRef.id, addition.productId))
    .limit(1)
  if (!product) throw new RosterPlanError("not_found", "Product does not exist")
  if (product.status !== "active") {
    throw new RosterPlanError("unsupported_configuration", "Product is not active")
  }
  if (product.sellCurrency !== booking.sellCurrency) {
    throw new RosterPlanError(
      "unsupported_configuration",
      "Product is priced in a different currency from the Booking",
    )
  }

  // The departure has to be resolved BEFORE pricing: a slot can carry
  // `departure_price_overrides`, and quoting without it charges the base
  // catalog rate for a date the operator has deliberately repriced.
  const slot = addition.availabilitySlotId
    ? await loadAdditionSlot(db, addition.availabilitySlotId, addition.productId)
    : null

  if (!slot) {
    // A product that sells by departure has no meaning without one:
    // writing an item with a null slot would consume no capacity while
    // looking confirmed. Treat "this product has bookable departures" as
    // the signal, since that is the same thing the booking-create flow
    // requires the operator to pick from.
    const [anySlot] = await db
      .select({ id: availabilitySlotsRef.id })
      .from(availabilitySlotsRef)
      .where(
        and(
          eq(availabilitySlotsRef.productId, addition.productId),
          eq(availabilitySlotsRef.status, "open"),
        ),
      )
      .limit(1)
    if (anySlot) {
      throw new RosterPlanError(
        "unsupported_configuration",
        "This product sells by departure — pick one for the added service",
      )
    }
  }

  const pricing = await resolveSessionPricingSnapshot(db, addition.productId, {
    optionId: addition.optionId ?? undefined,
    departureId: addition.availabilitySlotId ?? undefined,
    requirePublicProduct: false,
  })
  if (!pricing) {
    throw new RosterPlanError("unsupported_configuration", "Product has no resolvable pricing")
  }
  if (pricing.catalog.currencyCode && pricing.catalog.currencyCode !== booking.sellCurrency) {
    throw new RosterPlanError(
      "unsupported_configuration",
      "Price catalog is in a different currency from the Booking",
    )
  }

  const option = addition.optionId
    ? (pricing.options.find((entry) => entry.id === addition.optionId) ?? null)
    : (pricing.options[0] ?? null)

  let unitSellAmountCents: number | null = null
  let unitName: string | null = null
  if (addition.optionUnitId) {
    const unitPrice = pricing.unitPrices.find((entry) => entry.unitId === addition.optionUnitId)
    if (!unitPrice) {
      throw new RosterPlanError("unsupported_configuration", "Unit has no price in this catalog")
    }
    // A unit may only be sold in the quantities the catalog permits.
    if (unitPrice.minQuantity != null && addition.quantity < unitPrice.minQuantity) {
      throw new RosterPlanError(
        "unsupported_configuration",
        `This unit sells in quantities of at least ${unitPrice.minQuantity}`,
      )
    }
    if (unitPrice.maxQuantity != null && addition.quantity > unitPrice.maxQuantity) {
      throw new RosterPlanError(
        "unsupported_configuration",
        `This unit sells in quantities of at most ${unitPrice.maxQuantity}`,
      )
    }
    // Quantity tiers are the authoritative price when one matches — the
    // rule's own `sellAmountCents` is the untiered fallback, and quoting
    // it for a group-sized addition would charge the wrong rate.
    unitSellAmountCents = resolveTieredUnitPrice(unitPrice, addition.quantity)
    unitName = unitPrice.unitName
  } else {
    const rule =
      pricing.rules.find((entry) => entry.optionId === option?.id) ?? pricing.rules[0] ?? null
    unitSellAmountCents = rule?.baseSellAmountCents ?? product.sellAmountCents ?? null
  }
  if (unitSellAmountCents == null) {
    throw new RosterPlanError(
      "unsupported_configuration",
      "Selection has no authoritative sell price",
    )
  }

  const capacityClaimQuantity = Math.max(booking.pax ?? addition.quantity, 0)
  if (slot) {
    const existingAllocations = await db
      .select({ quantity: bookingAllocations.quantity })
      .from(bookingAllocations)
      .where(
        and(
          eq(bookingAllocations.bookingId, booking.id),
          eq(bookingAllocations.availabilitySlotId, slot.id),
          inArray(bookingAllocations.status, ACTIVE_BOOKING_ALLOCATION_STATUSES),
        ),
      )
    const existingClaim = existingAllocations.reduce(
      (sum, allocation) => sum + allocation.quantity,
      0,
    )
    const additionalClaim = Math.max(capacityClaimQuantity - existingClaim, 0)
    const room = slot.unlimited || (slot.remainingPax ?? 0) >= additionalClaim
    if (slot.status !== "open" || slot.pastCutoff || slot.tooEarly || !room) {
      throw new RosterPlanError("availability_changed", "Departure cannot take this addition")
    }
  }

  const snapshot = await resolveBookingItemSnapshot(db, {
    productId: addition.productId,
    optionId: addition.optionId ?? null,
    optionUnitId: addition.optionUnitId ?? null,
    availabilitySlotId: addition.availabilitySlotId ?? null,
  })

  const quantity = addition.quantity
  const unitCostAmountCents =
    product.costAmountCents != null ? Math.floor(product.costAmountCents) : null

  return {
    kind: "item_add",
    productId: addition.productId,
    optionId: addition.optionId ?? option?.id ?? null,
    optionUnitId: addition.optionUnitId ?? null,
    availabilitySlotId: addition.availabilitySlotId ?? null,
    capacityClaimQuantity,
    quantity,
    title: addition.title ?? unitName ?? option?.name ?? product.name,
    sellCurrency: booking.sellCurrency,
    unitSellAmountCents,
    totalSellAmountCents: unitSellAmountCents * quantity,
    costCurrency: unitCostAmountCents == null ? null : product.sellCurrency,
    unitCostAmountCents,
    totalCostAmountCents: unitCostAmountCents == null ? null : unitCostAmountCents * quantity,
    serviceDate: snapshot.serviceDate,
    productNameSnapshot: snapshot.productName ?? product.name,
    optionNameSnapshot: snapshot.optionName ?? option?.name ?? null,
    unitNameSnapshot: snapshot.unitName ?? unitName,
    departureLabelSnapshot: snapshot.departureLabel,
  }
}

/**
 * Resolve what moving a Booking Item to another departure costs, and whether
 * the target can actually take it.
 *
 * Capacity is a precondition, not a warning: a departure without room for
 * this item's quantity is refused here, and the same check is re-run
 * atomically at apply. The operator-facing picker only offers departures
 * with room, so reaching this refusal normally means the target filled up
 * while the sheet was open.
 *
 * The new fare comes from the catalog for the *target* date — including its
 * departure price override and quantity tier — so moving onto a peak week
 * costs what that week costs. The change fee is the operator's, added on
 * top as its own line.
 */
async function buildItemMovePlan(
  db: PostgresJsDatabase,
  booking: BookingRow,
  state: SnapshotState,
  move: BookingItemMove,
): Promise<BookingAmendmentItemMovePlan> {
  const item = state.items.find((candidate) => candidate.id === move.bookingItemId)
  if (!item) throw new RosterPlanError("not_found", "Booking Item does not exist")
  if (item.status !== "confirmed") {
    throw new RosterPlanError(
      "unsupported_configuration",
      "Only a confirmed service can be moved",
      item.id,
    )
  }
  if (!item.productId) {
    throw new RosterPlanError(
      "unsupported_configuration",
      "This line is not linked to a product, so there is nothing to move it between",
      item.id,
    )
  }
  if (item.sellCurrency !== booking.sellCurrency) {
    throw new RosterPlanError(
      "unsupported_configuration",
      "Booking Item is priced in a different currency from the Booking",
      item.id,
    )
  }
  if (item.totalSellAmountCents == null) {
    throw new RosterPlanError(
      "unsupported_configuration",
      "Booking Item has no authoritative price to compare the new date against",
      item.id,
    )
  }
  if (item.availabilitySlotId === move.availabilitySlotId) {
    throw new RosterPlanError(
      "unsupported_configuration",
      "That is the departure this service is already on",
      item.id,
    )
  }

  // Scoped to the item's own product for the same reason `item_add` is: a
  // slot looked up by id alone lets a caller move onto another product's
  // departure, which would decrement capacity nobody is travelling on.
  const target = await loadAdditionSlot(db, move.availabilitySlotId, item.productId)
  const capacityClaimQuantity = Math.max(booking.pax ?? item.quantity, 0)
  const sourceClaimAllocations = state.allocations.filter(
    (allocation) =>
      allocation.availabilitySlotId === item.availabilitySlotId &&
      isActiveBookingAllocationStatus(allocation.status),
  )
  const sourceClaimPeers = state.allocations.filter(
    (allocation) =>
      allocation.bookingItemId !== item.id &&
      allocation.availabilitySlotId === item.availabilitySlotId &&
      isActiveBookingAllocationStatus(allocation.status),
  )
  const targetClaimPeers = state.allocations.filter(
    (allocation) =>
      allocation.availabilitySlotId === move.availabilitySlotId &&
      isActiveBookingAllocationStatus(allocation.status),
  )
  const toCapacityQuantity = targetClaimPeers.length === 0 ? capacityClaimQuantity : 0
  const sourceClaimAfterMove = sourceClaimPeers.length === 0 ? 0 : capacityClaimQuantity
  const fromCapacityQuantity = Math.max(
    sourceClaimAllocations.reduce((sum, allocation) => sum + allocation.quantity, 0) -
      sourceClaimAfterMove,
    0,
  )
  const room = target.unlimited || (target.remainingPax ?? 0) >= toCapacityQuantity
  if (target.status !== "open" || target.pastCutoff || target.tooEarly || !room) {
    throw new RosterPlanError(
      "availability_changed",
      "That departure cannot take this booking",
      item.id,
    )
  }

  const pricing = await resolveSessionPricingSnapshot(db, item.productId, {
    optionId: item.optionId ?? undefined,
    departureId: move.availabilitySlotId,
    requirePublicProduct: false,
  })
  if (!pricing) {
    throw new RosterPlanError(
      "unsupported_configuration",
      "The target departure has no resolvable price",
      item.id,
    )
  }

  let unitSellAmountCents: number | null = null
  if (item.optionUnitId) {
    const unitPrice = pricing.unitPrices.find((entry) => entry.unitId === item.optionUnitId)
    if (!unitPrice) {
      throw new RosterPlanError(
        "unsupported_configuration",
        "This unit is not priced on the target departure",
        item.id,
      )
    }
    unitSellAmountCents = resolveTieredUnitPrice(unitPrice, item.quantity)
  } else {
    const rule =
      pricing.rules.find((entry) => entry.optionId === item.optionId) ?? pricing.rules[0] ?? null
    unitSellAmountCents = rule?.baseSellAmountCents ?? item.unitSellAmountCents ?? null
  }
  if (unitSellAmountCents == null) {
    throw new RosterPlanError(
      "unsupported_configuration",
      "The target departure has no authoritative sell price",
      item.id,
    )
  }

  const totalSellAmountCents = unitSellAmountCents * item.quantity
  const fareDeltaCents = totalSellAmountCents - item.totalSellAmountCents
  // Capped at the increase. Absorbing more than the move costs would turn a
  // pricier date into a payout, which is a refund decision rather than a
  // discount one — `refundHandling` is where that lives.
  const fareDiscountCents = Math.min(move.fareDiscountCents, Math.max(fareDeltaCents, 0))

  const snapshot = await resolveBookingItemSnapshot(db, {
    productId: item.productId,
    optionId: item.optionId ?? null,
    optionUnitId: item.optionUnitId ?? null,
    availabilitySlotId: move.availabilitySlotId,
  })

  const activeAllocations = state.allocations.filter(
    (allocation) =>
      allocation.bookingItemId === item.id &&
      (allocation.status === "held" || allocation.status === "confirmed"),
  )
  // Exactly one, not "at most one". A move is an inventory operation before
  // it is a price one: apply restores the old departure's capacity and claims
  // the target's, and both halves are only true of a line that actually holds
  // an allocation. Moving one that does not would credit the old departure a
  // seat it never consumed and leave the target's decrement with no row
  // pointing at it, so cancelling later would never give it back.
  //
  // The state is reachable — `updateItem` still lets an operator schedule a
  // product-linked line without claiming capacity — so this refuses rather
  // than silently inventing an allocation the operator never asked for.
  if (activeAllocations.length !== 1) {
    throw new RosterPlanError(
      "unsupported_configuration",
      activeAllocations.length === 0
        ? "This service holds no seat on its current departure, so there is nothing to move. Set its departure directly instead."
        : "Moving a service requires exactly one active capacity allocation",
      item.id,
    )
  }
  const allocation = activeAllocations[0]!

  const itemMetadata = asRecord(item.metadata)
  const allocationMetadata = asRecord(allocation?.metadata)
  const sourceConnectionId = stringField(allocationMetadata, "sourceConnectionId")
  const upstreamRef =
    stringField(allocationMetadata, "upstreamRef") ?? stringField(itemMetadata, "upstreamRef")
  const sourceKind = stringField(allocationMetadata, "sourceKind")
  const sourced = Boolean(sourceConnectionId || upstreamRef || sourceKind)
  if (sourced && (!sourceConnectionId || !upstreamRef || !sourceKind)) {
    throw new RosterPlanError(
      "unsupported_configuration",
      "Sourced allocation provenance is incomplete",
      item.id,
    )
  }

  // A date change on sourced inventory is exactly what the supplier port
  // exists for: it carries the existing reservation's `upstreamRef` and a
  // free-form parameter bag, and the connector answers `refused` when it
  // cannot move the booking. The passenger list is unchanged — only when
  // it travels moves.
  const desiredState = {
    parameters: {
      availabilitySlotId: move.availabilitySlotId,
      serviceDate: snapshot.serviceDate,
      startsAt: snapshot.startsAt ? snapshot.startsAt.toISOString() : null,
    },
    party: {
      passengers: (state.travelerIdsByItem.get(item.id) ?? []).flatMap((id) => {
        const traveler = state.travelers.find((candidate) => candidate.id === id)
        return traveler ? [supplierPassenger(snapshotTraveler(traveler))] : []
      }),
    },
  }

  return {
    kind: "item_move",
    bookingItemId: item.id,
    allocationId: allocation.id,
    quantity: item.quantity,
    fromCapacityQuantity,
    toCapacityQuantity,
    sourceClaimCarrierAllocationId: sourceClaimPeers[0]?.id ?? null,
    productId: item.productId,
    fromAvailabilitySlotId: item.availabilitySlotId ?? null,
    toAvailabilitySlotId: move.availabilitySlotId,
    unitSellAmountCents,
    totalSellAmountCents,
    fareDeltaCents,
    fareDiscountCents,
    changeFeeCents: move.changeFeeCents,
    refundHandling: move.refundHandling,
    serviceDate: snapshot.serviceDate,
    startsAt: snapshot.startsAt ? snapshot.startsAt.toISOString() : null,
    endsAt: snapshot.endsAt ? snapshot.endsAt.toISOString() : null,
    departureLabelSnapshot: snapshot.departureLabel,
    supplierOperation: sourced
      ? {
          entityModule: stringField(itemMetadata, "entityModule") ?? "catalog",
          entityId: stringField(itemMetadata, "entityId") ?? item.productId,
          sourceKind: sourceKind!,
          sourceConnectionId: sourceConnectionId!,
          sourceRef: item.sourceOfferId ?? item.id,
          upstreamRef: upstreamRef!,
          desiredState,
          requestFingerprint: await stableFingerprint(desiredState),
        }
      : null,
  }
}

function itemMoveEffects(price: BookingAmendmentPrice, sourced: boolean): BookingAmendmentEffects {
  return {
    finance:
      price.collectionAmountCents > 0
        ? "collection_required"
        : price.refundAmountCents > 0
          ? "refund_required"
          : "not_required",
    legal: "not_required",
    // The travel dates on every document and ticket just changed.
    documents: "reissue_required",
    fulfillment: "reissue_required",
    supplier: sourced ? "modify_required" : "not_required",
    allocation: "move_required",
  }
}

function itemAddEffects(price: BookingAmendmentPrice): BookingAmendmentEffects {
  return {
    finance:
      price.collectionAmountCents > 0
        ? "collection_required"
        : price.refundAmountCents > 0
          ? "refund_required"
          : "not_required",
    legal: "not_required",
    documents: "reissue_required",
    fulfillment: "reissue_required",
    supplier: "not_required",
    allocation: "increase_required",
  }
}

export const bookingAmendmentService = {
  async previewTravelerCorrection(
    db: PostgresJsDatabase,
    bookingId: string,
    input: PreviewTravelerCorrectionInput,
    context: BookingAmendmentCommandContext,
    dependencies: BookingAmendmentServiceDependencies = {},
  ): Promise<PreviewTravelerCorrectionResult> {
    return db.transaction(async (rawTx) => {
      const tx = rawTx as PostgresJsDatabase
      const [booking] = await tx
        .select()
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .for("update")
        .limit(1)
      if (!booking) return { status: "not_found" as const }

      const [existing] = await tx
        .select()
        .from(bookingAmendments)
        .where(
          and(
            eq(bookingAmendments.bookingId, booking.id),
            eq(bookingAmendments.previewIdempotencyKey, context.idempotencyKey),
          ),
        )
        .limit(1)
      if (existing) {
        const requested = existing.requestedChange
        const sameRequest =
          requested.type === "traveler_correction" &&
          requested.travelerId === input.travelerId &&
          existing.baseBookingRevision === input.expectedBookingRevision &&
          existing.reason === input.reason &&
          sameTravelerPatch(requested.patch, input.patch)
        if (!sameRequest) return { status: "idempotency_conflict" as const }
        return { status: "ok" as const, amendment: await hydrateAmendment(tx, existing) }
      }
      if (booking.revision !== input.expectedBookingRevision) {
        return { status: "stale_revision" as const, currentBookingRevision: booking.revision }
      }
      const [traveler] = await tx
        .select()
        .from(bookingTravelers)
        .where(
          and(
            eq(bookingTravelers.id, input.travelerId),
            eq(bookingTravelers.bookingId, booking.id),
          ),
        )
        .limit(1)
      if (!traveler) return { status: "not_found" as const }
      const changedFields = changedTravelerFields(traveler, input.patch)
      if (changedFields.length === 0) {
        return {
          status: "no_op" as const,
          bookingId: booking.id,
          travelerId: traveler.id,
          bookingRevision: booking.revision,
        }
      }
      const state = await loadSnapshotState(tx, booking.id)
      const before = snapshotBooking(booking, booking.revision, state)
      const proposedTravelers = state.travelers.map((row) =>
        row.id === traveler.id
          ? { ...snapshotTraveler(row), ...input.patch }
          : snapshotTraveler(row),
      )
      const proposed = snapshotBooking(booking, booking.revision + 1, state, {
        travelers: proposedTravelers,
      })
      const policy = correctionPolicy({ actor: context.actor, changedFields })
      const amendmentId = newId("booking_amendments")
      const now = dependencies.now?.() ?? new Date()
      const price = ZERO_PRICE(booking.sellCurrency)
      const [amendment] = await tx
        .insert(bookingAmendments)
        .values({
          id: amendmentId,
          bookingId: booking.id,
          travelerId: traveler.id,
          kind: "traveler_correction",
          baseBookingRevision: booking.revision,
          resultBookingRevision: booking.revision + 1,
          requestedChange: {
            type: "traveler_correction",
            travelerId: traveler.id,
            patch: input.patch,
          },
          acceptanceRequired: policy.acceptanceRequired,
          policyDecisions: policy.decisions,
          subtotalDeltaCents: price.subtotalDeltaCents,
          feeDeltaCents: price.feeDeltaCents,
          taxDeltaCents: price.taxDeltaCents,
          priceDeltaCents: price.amountCents,
          priceCurrency: price.currency,
          collectionAmountCents: 0,
          refundAmountCents: 0,
          taxLines: [],
          financialConsequences: NO_FINANCIAL_CONSEQUENCES,
          effects: NO_EXTERNAL_EFFECTS,
          quotedAt: now,
          previewIdempotencyKey: context.idempotencyKey,
          requestedBy: context.actorId ?? null,
          requestedActor: context.actor,
          reason: input.reason,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      if (!amendment) throw new Error("Booking Amendment insert did not return a row")
      const revisions = await insertRevisions(tx, amendmentId, booking.id, [before, proposed], {
        changedFields,
        authorizedBy: context.actorId ?? null,
        reason: input.reason,
        now,
      })
      return { status: "ok" as const, amendment: serializeAmendment(amendment, revisions) }
    })
  },

  async previewTravelerRosterChange(
    db: PostgresJsDatabase,
    bookingId: string,
    input: PreviewTravelerRosterChangeInput,
    context: BookingAmendmentCommandContext,
    dependencies: BookingAmendmentServiceDependencies,
  ): Promise<PreviewTravelerRosterChangeResult> {
    if (!dependencies.finance) {
      return {
        status: "unsupported_configuration",
        reason: "Finance runtime is required for priced Booking Amendments",
      }
    }
    const finance = dependencies.finance
    return db.transaction(async (rawTx) => {
      const tx = rawTx as PostgresJsDatabase
      const [booking] = await tx
        .select()
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .for("update")
        .limit(1)
      if (!booking) return { status: "not_found" as const }
      const [existing] = await tx
        .select()
        .from(bookingAmendments)
        .where(
          and(
            eq(bookingAmendments.bookingId, booking.id),
            eq(bookingAmendments.previewIdempotencyKey, context.idempotencyKey),
          ),
        )
        .limit(1)
      if (existing) {
        if (!sameRosterRequest(existing, input)) return { status: "idempotency_conflict" as const }
        return { status: "ok" as const, amendment: await hydrateAmendment(tx, existing) }
      }
      if (booking.revision !== input.expectedBookingRevision) {
        return { status: "stale_revision" as const, currentBookingRevision: booking.revision }
      }
      const state = await loadSnapshotState(tx, booking.id)
      const travelerId =
        input.change.type === "traveler_add" ? newId("booking_travelers") : input.change.travelerId
      let roster: Awaited<ReturnType<typeof buildRosterPlans>>
      try {
        roster = await buildRosterPlans(tx, booking, state, input, travelerId)
      } catch (error) {
        if (error instanceof RosterPlanError) return mapPlanError(error)
        throw error
      }
      const financeQuote = await finance.quoteBookingAmendment(tx, {
        bookingId: booking.id,
        currency: booking.sellCurrency,
        lines: roster.plans.map((plan) => ({
          bookingItemId: plan.bookingItemId,
          productId: state.items.find((item) => item.id === plan.bookingItemId)?.productId ?? null,
          subtotalDeltaCents: plan.unitSellAmountCents * plan.quantityDelta,
        })),
      })
      const now = dependencies.now?.() ?? new Date()
      const quoteExpiresAt = new Date(
        now.getTime() + (dependencies.quoteTtlMs ?? DEFAULT_BOOKING_AMENDMENT_QUOTE_TTL_MS),
      )
      const itemQuantityDelta = new Map(
        roster.plans.map((plan) => [plan.bookingItemId, plan.quantityDelta]),
      )
      const allocationQuantityDelta = new Map(
        roster.plans.map((plan) => [plan.allocationId, plan.quantityDelta]),
      )
      const before = snapshotBooking(booking, booking.revision, state)
      const proposed = snapshotBooking(booking, booking.revision + 1, state, {
        travelers: roster.proposedTravelers,
        itemQuantityDelta,
        itemTravelerIds: roster.proposedTravelerIdsByItem,
        allocationQuantityDelta,
        sellAmountDeltaCents: financeQuote.price.amountCents,
        paxDelta: input.change.type === "traveler_add" ? 1 : -1,
      })
      const effects = rosterEffects(
        input.change.type,
        financeQuote.price,
        roster.plans.some((plan) => plan.supplierOperation !== null),
      )
      const amendmentId = newId("booking_amendments")
      const [amendment] = await tx
        .insert(bookingAmendments)
        .values({
          id: amendmentId,
          bookingId: booking.id,
          travelerId,
          kind: input.change.type,
          baseBookingRevision: booking.revision,
          resultBookingRevision: booking.revision + 1,
          requestedChange: { ...input.change, travelerId },
          acceptanceRequired: true,
          policyDecisions: rosterPolicy(financeQuote.policyVersion),
          subtotalDeltaCents: financeQuote.price.subtotalDeltaCents,
          feeDeltaCents: financeQuote.price.feeDeltaCents,
          taxDeltaCents: financeQuote.price.taxDeltaCents,
          priceDeltaCents: financeQuote.price.amountCents,
          priceCurrency: financeQuote.price.currency,
          collectionAmountCents: financeQuote.price.collectionAmountCents,
          refundAmountCents: financeQuote.price.refundAmountCents,
          taxLines: financeQuote.price.taxLines,
          financialConsequences: financeQuote.consequences,
          effects,
          quotedAt: now,
          quoteExpiresAt,
          operationPlan: roster.plans,
          previewIdempotencyKey: context.idempotencyKey,
          requestedBy: context.actorId ?? null,
          requestedActor: context.actor,
          reason: input.reason,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      if (!amendment) throw new Error("Booking Amendment insert did not return a row")
      const changedFields = [
        "travelers",
        ...roster.plans.flatMap((plan) => [
          `items.${plan.bookingItemId}.quantity`,
          `items.${plan.bookingItemId}.travelers`,
          `allocations.${plan.allocationId}.quantity`,
        ]),
        "sellAmountCents",
        "pax",
      ]
      const revisions = await insertRevisions(tx, amendmentId, booking.id, [before, proposed], {
        changedFields,
        authorizedBy: context.actorId ?? null,
        reason: input.reason,
        now,
      })
      return { status: "ok" as const, amendment: serializeAmendment(amendment, revisions) }
    })
  },

  /**
   * Quote adding a catalog-linked service to a booking that already exists.
   *
   * Same protocol as a roster change — preview, accept, apply — so the
   * price, the departure check, and the money that follows all behave the
   * way an operator has already learned they do. Nothing is written to the
   * booking here; the plan is stored on the Amendment and replayed at apply.
   */
  async previewItemAddition(
    db: PostgresJsDatabase,
    bookingId: string,
    input: PreviewBookingItemAdditionInput,
    context: BookingAmendmentCommandContext,
    dependencies: BookingAmendmentServiceDependencies = {},
  ): Promise<PreviewTravelerRosterChangeResult> {
    if (!dependencies.finance) {
      return {
        status: "unsupported_configuration",
        reason: "Finance runtime is required for priced Booking Amendments",
      }
    }
    const finance = dependencies.finance
    return db.transaction(async (rawTx) => {
      const tx = rawTx as PostgresJsDatabase
      const [booking] = await tx
        .select()
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .for("update")
        .limit(1)
      if (!booking) return { status: "not_found" as const }

      const [existing] = await tx
        .select()
        .from(bookingAmendments)
        .where(
          and(
            eq(bookingAmendments.bookingId, booking.id),
            eq(bookingAmendments.previewIdempotencyKey, context.idempotencyKey),
          ),
        )
        .limit(1)
      if (existing) {
        if (!sameItemAdditionRequest(existing, input)) {
          return { status: "idempotency_conflict" as const }
        }
        return { status: "ok" as const, amendment: await hydrateAmendment(tx, existing) }
      }
      if (booking.revision !== input.expectedBookingRevision) {
        return { status: "stale_revision" as const, currentBookingRevision: booking.revision }
      }
      if (booking.status !== "confirmed" && booking.status !== "in_progress") {
        return {
          status: "unsupported_configuration" as const,
          reason: "Only a live Booking can take an added service",
        }
      }

      let plan: BookingAmendmentItemAddPlan
      try {
        plan = await buildItemAddPlan(tx, booking, input.addition)
      } catch (error) {
        if (error instanceof RosterPlanError) return mapPlanError(error)
        throw error
      }

      const state = await loadSnapshotState(tx, booking.id)
      const financeQuote = await finance.quoteBookingAmendment(tx, {
        bookingId: booking.id,
        currency: booking.sellCurrency,
        lines: [
          {
            // The Booking Item does not exist yet, so there is no id to
            // quote against. Finance only uses it to attribute tax lines;
            // the placeholder is replaced at apply time.
            bookingItemId: PENDING_ITEM_ID,
            productId: plan.productId,
            subtotalDeltaCents: plan.totalSellAmountCents,
          },
        ],
      })

      const now = dependencies.now?.() ?? new Date()
      const quoteExpiresAt = new Date(
        now.getTime() + (dependencies.quoteTtlMs ?? DEFAULT_BOOKING_AMENDMENT_QUOTE_TTL_MS),
      )
      const before = snapshotBooking(booking, booking.revision, state)
      const proposed = snapshotBooking(booking, booking.revision + 1, state, {
        sellAmountDeltaCents: financeQuote.price.amountCents,
        addedItems: [
          {
            id: PENDING_ITEM_ID,
            quantity: plan.quantity,
            totalSellAmountCents: plan.totalSellAmountCents,
            travelerIds: [],
            allocations: [],
          },
        ],
      })

      const amendmentId = newId("booking_amendments")
      const [amendment] = await tx
        .insert(bookingAmendments)
        .values({
          id: amendmentId,
          bookingId: booking.id,
          travelerId: null,
          kind: "item_add",
          baseBookingRevision: booking.revision,
          resultBookingRevision: booking.revision + 1,
          requestedChange: input.addition,
          acceptanceRequired: true,
          policyDecisions: rosterPolicy(financeQuote.policyVersion),
          subtotalDeltaCents: financeQuote.price.subtotalDeltaCents,
          feeDeltaCents: financeQuote.price.feeDeltaCents,
          taxDeltaCents: financeQuote.price.taxDeltaCents,
          priceDeltaCents: financeQuote.price.amountCents,
          priceCurrency: financeQuote.price.currency,
          collectionAmountCents: financeQuote.price.collectionAmountCents,
          refundAmountCents: financeQuote.price.refundAmountCents,
          taxLines: financeQuote.price.taxLines,
          financialConsequences: financeQuote.consequences,
          effects: itemAddEffects(financeQuote.price),
          quotedAt: now,
          quoteExpiresAt,
          operationPlan: [plan],
          previewIdempotencyKey: context.idempotencyKey,
          requestedBy: context.actorId ?? null,
          requestedActor: context.actor,
          reason: input.reason,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      if (!amendment) throw new Error("Booking Amendment insert did not return a row")

      const revisions = await insertRevisions(tx, amendmentId, booking.id, [before, proposed], {
        changedFields: ["items", "sellAmountCents"],
        authorizedBy: context.actorId ?? null,
        reason: input.reason,
        now,
      })
      return { status: "ok" as const, amendment: serializeAmendment(amendment, revisions) }
    })
  },

  /**
   * Quote moving a Booking Item to a different departure.
   *
   * Prices the target date from the catalog, adds the operator's change fee,
   * and settles a negative result per the caller's `refundHandling`. As with
   * every other Amendment nothing is written to the booking here — the plan
   * is stored and replayed at apply, so the number accepted is the number
   * applied.
   */
  async previewItemMove(
    db: PostgresJsDatabase,
    bookingId: string,
    input: PreviewBookingItemMoveInput,
    context: BookingAmendmentCommandContext,
    dependencies: BookingAmendmentServiceDependencies = {},
  ): Promise<PreviewTravelerRosterChangeResult> {
    if (!dependencies.finance) {
      return {
        status: "unsupported_configuration",
        reason: "Finance runtime is required for priced Booking Amendments",
      }
    }
    const finance = dependencies.finance
    return db.transaction(async (rawTx) => {
      const tx = rawTx as PostgresJsDatabase
      const [booking] = await tx
        .select()
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .for("update")
        .limit(1)
      if (!booking) return { status: "not_found" as const }

      const [existing] = await tx
        .select()
        .from(bookingAmendments)
        .where(
          and(
            eq(bookingAmendments.bookingId, booking.id),
            eq(bookingAmendments.previewIdempotencyKey, context.idempotencyKey),
          ),
        )
        .limit(1)
      if (existing) {
        if (!sameItemMoveRequest(existing, input)) {
          return { status: "idempotency_conflict" as const }
        }
        return { status: "ok" as const, amendment: await hydrateAmendment(tx, existing) }
      }
      if (booking.revision !== input.expectedBookingRevision) {
        return { status: "stale_revision" as const, currentBookingRevision: booking.revision }
      }
      if (booking.status !== "confirmed" && booking.status !== "in_progress") {
        return {
          status: "unsupported_configuration" as const,
          reason: "Only a live Booking can be moved",
        }
      }

      const state = await loadSnapshotState(tx, booking.id)
      let plan: BookingAmendmentItemMovePlan
      try {
        plan = await buildItemMovePlan(tx, booking, state, input.move)
      } catch (error) {
        if (error instanceof RosterPlanError) return mapPlanError(error)
        throw error
      }

      const financeQuote = await finance.quoteBookingAmendment(tx, {
        bookingId: booking.id,
        currency: booking.sellCurrency,
        lines: [
          {
            bookingItemId: plan.bookingItemId,
            productId: plan.productId,
            // Discounted before quoting: tax follows what the customer is
            // actually charged, not the list difference.
            subtotalDeltaCents: plan.fareDeltaCents - plan.fareDiscountCents,
          },
        ],
        // The change fee is not a fare, so it is quoted as a fee rather than
        // folded into the subtotal — the customer-facing record has to show
        // "the new date costs more" separately from "we charge to change".
        feeDeltaCents: plan.changeFeeCents,
      })

      const settled = settleMoveDirection(financeQuote.price, plan.refundHandling)
      const now = dependencies.now?.() ?? new Date()
      const quoteExpiresAt = new Date(
        now.getTime() + (dependencies.quoteTtlMs ?? DEFAULT_BOOKING_AMENDMENT_QUOTE_TTL_MS),
      )
      const before = snapshotBooking(booking, booking.revision, state)
      const proposed = snapshotBooking(booking, booking.revision + 1, state, {
        sellAmountDeltaCents: settled.amountCents,
        itemTotalOverride: new Map([[plan.bookingItemId, plan.totalSellAmountCents]]),
      })

      const amendmentId = newId("booking_amendments")
      const [amendment] = await tx
        .insert(bookingAmendments)
        .values({
          id: amendmentId,
          bookingId: booking.id,
          travelerId: null,
          kind: "item_move",
          baseBookingRevision: booking.revision,
          resultBookingRevision: booking.revision + 1,
          requestedChange: input.move,
          acceptanceRequired: true,
          policyDecisions: rosterPolicy(financeQuote.policyVersion),
          subtotalDeltaCents: settled.subtotalDeltaCents,
          feeDeltaCents: settled.feeDeltaCents,
          taxDeltaCents: settled.taxDeltaCents,
          priceDeltaCents: settled.amountCents,
          priceCurrency: settled.currency,
          collectionAmountCents: settled.collectionAmountCents,
          refundAmountCents: settled.refundAmountCents,
          taxLines: settled.taxLines,
          financialConsequences: financeQuote.consequences,
          effects: itemMoveEffects(settled, plan.supplierOperation !== null),
          quotedAt: now,
          quoteExpiresAt,
          operationPlan: [plan],
          previewIdempotencyKey: context.idempotencyKey,
          requestedBy: context.actorId ?? null,
          requestedActor: context.actor,
          reason: input.reason,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      if (!amendment) throw new Error("Booking Amendment insert did not return a row")

      const revisions = await insertRevisions(tx, amendmentId, booking.id, [before, proposed], {
        changedFields: [
          `items.${plan.bookingItemId}.availabilitySlotId`,
          `items.${plan.bookingItemId}.totalSellAmountCents`,
          "sellAmountCents",
        ],
        authorizedBy: context.actorId ?? null,
        reason: input.reason,
        now,
      })
      return { status: "ok" as const, amendment: serializeAmendment(amendment, revisions) }
    })
  },

  async accept(
    db: PostgresJsDatabase,
    amendmentId: string,
    proposedRevisionId: string,
    context: BookingAmendmentCommandContext,
    dependencies: BookingAmendmentServiceDependencies = {},
  ): Promise<AcceptBookingAmendmentResult> {
    return db.transaction(async (rawTx) => {
      const tx = rawTx as PostgresJsDatabase
      const locked = await lockAmendment(tx, amendmentId)
      if (!locked) return { status: "not_found" as const }
      const { booking, amendment } = locked
      const proposed = await findProposedRevision(tx, amendment.id, proposedRevisionId)
      if (!proposed) return { status: "revision_mismatch" as const }
      if (amendment.status === "applied") {
        return {
          status: "already_applied" as const,
          amendment: await hydrateAmendment(tx, amendment),
        }
      }
      if (booking.revision !== amendment.baseBookingRevision) {
        return { status: "stale_revision" as const, currentBookingRevision: booking.revision }
      }
      const now = dependencies.now?.() ?? new Date()
      if (amendment.quoteExpiresAt && amendment.quoteExpiresAt <= now) {
        return { status: "quote_expired" as const }
      }
      if (!amendment.acceptanceRequired) return { status: "acceptance_not_required" as const }
      if (amendment.status !== "proposed" && amendment.status !== "accepted") {
        return { status: "not_found" as const }
      }
      if (
        amendment.status === "accepted" &&
        amendment.acceptIdempotencyKey !== context.idempotencyKey
      ) {
        return { status: "revision_mismatch" as const }
      }
      const [accepted] =
        amendment.status === "accepted"
          ? [amendment]
          : await tx
              .update(bookingAmendments)
              .set({
                status: "accepted",
                acceptIdempotencyKey: context.idempotencyKey,
                acceptedAt: now,
                acceptedBy: context.actorId ?? null,
                acceptedActor: context.actor,
                updatedAt: now,
              })
              .where(eq(bookingAmendments.id, amendment.id))
              .returning()
      if (!accepted) throw new Error("Booking Amendment acceptance did not return a row")
      return { status: "ok" as const, amendment: await hydrateAmendment(tx, accepted) }
    })
  },

  async apply(
    db: PostgresJsDatabase,
    amendmentId: string,
    input: { expectedBookingRevision: number; proposedRevisionId: string },
    context: BookingAmendmentCommandContext,
    dependencies: BookingAmendmentServiceDependencies = {},
  ): Promise<ApplyBookingAmendmentResult> {
    const staged = await stageApply(db, amendmentId, input, context, dependencies)
    if (staged.status !== "staged") return staged.result
    if (staged.amendment.kind === "traveler_correction") {
      return applyCorrection(db, staged.amendment.id, context, dependencies)
    }
    if (staged.amendment.kind === "item_add") {
      return finalizeItemAddApply(db, staged.amendment.id, context, dependencies)
    }
    const supplierPlans = staged.amendment.operationPlan.flatMap((plan) =>
      // Item-add plans carry no supplier operation — only owned inventory
      // can be added this way, which `buildItemAddPlan` enforces. A move
      // can carry one, because changing the date of an existing supplier
      // reservation is a modify the port already expresses.
      isItemAddPlan(plan) || !plan.supplierOperation
        ? []
        : [{ ...plan.supplierOperation, bookingItemId: plan.bookingItemId }],
    )
    if (supplierPlans.length === 0) {
      return finalizeApplyForKind(staged.amendment.kind)(
        db,
        staged.amendment.id,
        context,
        dependencies,
      )
    }
    if (!dependencies.supplier) {
      await setAmendmentFailure(
        db,
        staged.amendment.id,
        "failed",
        "supplier_runtime_unavailable",
        dependencies.now?.() ?? new Date(),
      )
      return { status: "unsupported_capability" }
    }
    const now = dependencies.now?.() ?? new Date()
    const outcomes = await dependencies.supplier.dispatch({
      db,
      amendmentId: staged.amendment.id,
      bookingId: staged.amendment.bookingId,
      idempotencyKey: context.idempotencyKey,
      operations: supplierPlans,
      now,
    })
    const supplierResult = await persistSupplierOutcomes(db, staged.amendment.id, outcomes, now)
    if (supplierResult === "secured") {
      return finalizeApplyForKind(staged.amendment.kind)(
        db,
        staged.amendment.id,
        context,
        dependencies,
      )
    }
    if (supplierResult === "idempotency_conflict") return { status: "idempotency_conflict" }
    const amendment = await this.get(db, staged.amendment.bookingId, staged.amendment.id)
    if (!amendment) return { status: "not_found" }
    return { status: supplierResult, amendment }
  },

  async reconcile(
    db: PostgresJsDatabase,
    bookingId: string,
    amendmentId: string,
    context: BookingAmendmentCommandContext,
    dependencies: BookingAmendmentServiceDependencies,
  ): Promise<ApplyBookingAmendmentResult> {
    const amendment = await this.get(db, bookingId, amendmentId)
    if (!amendment) return { status: "not_found" }
    if (amendment.status === "applied") return { status: "ok", amendment }
    if (!dependencies.supplier || amendment.supplierOperationIds.length === 0) {
      return { status: "unsupported_capability" }
    }
    const now = dependencies.now?.() ?? new Date()
    const outcomes = await dependencies.supplier.reconcile({
      db,
      supplierOperationIds: amendment.supplierOperationIds,
      now,
    })
    const supplierResult = await persistSupplierOutcomes(db, amendmentId, outcomes, now)
    if (supplierResult === "secured") {
      return finalizeApplyForKind(amendment.kind)(db, amendmentId, context, dependencies)
    }
    if (supplierResult === "idempotency_conflict") return { status: "idempotency_conflict" }
    const current = await this.get(db, bookingId, amendmentId)
    return current ? { status: supplierResult, amendment: current } : { status: "not_found" }
  },

  async get(db: PostgresJsDatabase, bookingId: string, amendmentId: string) {
    const [row] = await db
      .select()
      .from(bookingAmendments)
      .where(and(eq(bookingAmendments.id, amendmentId), eq(bookingAmendments.bookingId, bookingId)))
      .limit(1)
    return row ? hydrateAmendment(db, row) : null
  },

  async list(db: PostgresJsDatabase, bookingId: string) {
    const rows = await db
      .select()
      .from(bookingAmendments)
      .where(eq(bookingAmendments.bookingId, bookingId))
      .orderBy(asc(bookingAmendments.createdAt), asc(bookingAmendments.id))
    return Promise.all(rows.map((row) => hydrateAmendment(db, row)))
  },

  async customerCanAccess(
    db: PostgresJsDatabase,
    bookingId: string,
    identity: { personId?: string | null; organizationId?: string | null },
  ) {
    if (!identity.personId && !identity.organizationId) return false
    const ownerConditions = []
    if (identity.personId) {
      ownerConditions.push(eq(bookings.personId, identity.personId))
      ownerConditions.push(
        and(
          eq(bookingTravelers.bookingId, bookings.id),
          eq(bookingTravelers.personId, identity.personId),
        ),
      )
    }
    if (identity.organizationId)
      ownerConditions.push(eq(bookings.organizationId, identity.organizationId))
    const [row] = await db
      .selectDistinct({ id: bookings.id })
      .from(bookings)
      .leftJoin(bookingTravelers, eq(bookingTravelers.bookingId, bookings.id))
      .where(and(eq(bookings.id, bookingId), or(...ownerConditions)))
      .limit(1)
    return Boolean(row)
  },
}

async function insertRevisions(
  tx: PostgresJsDatabase,
  amendmentId: string,
  bookingId: string,
  snapshots: [BookingRevisionSnapshot, BookingRevisionSnapshot],
  input: { changedFields: string[]; authorizedBy: string | null; reason: string; now: Date },
) {
  return tx
    .insert(bookingRevisions)
    .values(
      snapshots.map((snapshot, index) => ({
        id: newId("booking_revisions"),
        amendmentId,
        bookingId,
        bookingRevision: snapshot.revision,
        role: index === 0 ? ("before" as const) : ("proposed_after" as const),
        snapshot,
        changedFields: input.changedFields,
        authorizedBy: input.authorizedBy,
        reason: input.reason,
        createdAt: input.now,
      })),
    )
    .returning()
}

/**
 * Stands in for the Booking Item an `item_add` will create, in the quote
 * and in the proposed revision snapshot. The row does not exist until
 * apply, but the snapshot has to show the service being bought.
 */
const PENDING_ITEM_ID = "pending"

/**
 * Whether a replayed preview describes the same addition as the stored one.
 *
 * Compared field by field rather than by serialising both sides: the stored
 * copy has been through `jsonb`, which normalises key order, so two
 * identical requests would not produce identical JSON strings and every
 * replay would look like a conflict.
 */
/**
 * Apply the operator's chosen handling for a move that came out cheaper.
 *
 * `waive` is the only one that changes the money: the customer keeps the
 * original price, so the delta is floored at zero rather than recorded as
 * something owed back. `refund` and `travel_credit` both leave the amount
 * intact — they differ in what finance does with it at apply, not in what
 * the move costs.
 */
function settleMoveDirection(
  price: BookingAmendmentPrice,
  handling: BookingItemMoveRefundHandling,
): BookingAmendmentPrice {
  // Tested on the fare alone, not on the net. `amountCents` already has the
  // change fee folded in, so a 1,000-cent cheaper departure carrying a
  // 1,500-cent fee nets +500 and would have read as "not a reduction" — the
  // waive silently dropped, charging 500 where the fee alone is payable.
  // Finance taxes only the fare lines, so subtracting the fee leaves exactly
  // the fare-and-tax component.
  const fareComponentCents = price.amountCents - price.feeDeltaCents
  if (handling !== "waive" || fareComponentCents >= 0) return price
  const feeOnlyCents = Math.max(price.feeDeltaCents, 0)
  return {
    ...price,
    subtotalDeltaCents: 0,
    taxDeltaCents: 0,
    amountCents: feeOnlyCents,
    collectionAmountCents: feeOnlyCents,
    refundAmountCents: 0,
    taxLines: [],
  }
}

function sameItemMoveRequest(row: BookingAmendmentRow, input: PreviewBookingItemMoveInput) {
  const requested = row.requestedChange
  if (requested.type !== "item_move") return false
  if (row.baseBookingRevision !== input.expectedBookingRevision || row.reason !== input.reason) {
    return false
  }
  // Field by field, not JSON.stringify: the stored copy has been through
  // jsonb, which normalises key order.
  return (
    requested.bookingItemId === input.move.bookingItemId &&
    requested.availabilitySlotId === input.move.availabilitySlotId &&
    requested.changeFeeCents === input.move.changeFeeCents &&
    requested.fareDiscountCents === input.move.fareDiscountCents &&
    requested.refundHandling === input.move.refundHandling
  )
}

function sameItemAdditionRequest(row: BookingAmendmentRow, input: PreviewBookingItemAdditionInput) {
  const requested = row.requestedChange
  if (requested.type !== "item_add") return false
  if (row.baseBookingRevision !== input.expectedBookingRevision || row.reason !== input.reason) {
    return false
  }
  const addition = input.addition
  return (
    requested.productId === addition.productId &&
    (requested.optionId ?? null) === (addition.optionId ?? null) &&
    (requested.optionUnitId ?? null) === (addition.optionUnitId ?? null) &&
    (requested.availabilitySlotId ?? null) === (addition.availabilitySlotId ?? null) &&
    requested.quantity === addition.quantity &&
    (requested.title ?? null) === (addition.title ?? null)
  )
}

/**
 * The traveler a non-`item_add` Amendment concerns.
 *
 * `traveler_id` is nullable only so `item_add` can leave it unset; the
 * `ck_booking_amendments_traveler_required` constraint guarantees every
 * other kind has one. Throwing here reports a violated invariant instead
 * of silently querying `id = NULL` and finding nothing.
 */
function requireAmendmentTravelerId(amendment: BookingAmendmentRow): string {
  if (!amendment.travelerId) {
    throw new Error(`Booking Amendment ${amendment.id} of kind ${amendment.kind} has no traveler`)
  }
  return amendment.travelerId
}

function sameRosterRequest(row: BookingAmendmentRow, input: PreviewTravelerRosterChangeInput) {
  const requested = row.requestedChange
  if (requested.type !== input.change.type) return false
  if (row.baseBookingRevision !== input.expectedBookingRevision || row.reason !== input.reason) {
    return false
  }
  if (requested.bookingItemIds.join("\u0000") !== input.change.bookingItemIds.join("\u0000")) {
    return false
  }
  if (requested.type === "traveler_drop" && input.change.type === "traveler_drop") {
    return requested.travelerId === input.change.travelerId
  }
  return (
    requested.type === "traveler_add" &&
    input.change.type === "traveler_add" &&
    JSON.stringify(requested.traveler) === JSON.stringify(input.change.traveler)
  )
}

async function lockAmendment(db: PostgresJsDatabase, amendmentId: string) {
  const [candidate] = await db
    .select({ bookingId: bookingAmendments.bookingId })
    .from(bookingAmendments)
    .where(eq(bookingAmendments.id, amendmentId))
    .limit(1)
  if (!candidate) return null
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, candidate.bookingId))
    .for("update")
    .limit(1)
  if (!booking) return null
  const [amendment] = await db
    .select()
    .from(bookingAmendments)
    .where(eq(bookingAmendments.id, amendmentId))
    .for("update")
    .limit(1)
  return amendment ? { booking, amendment } : null
}

async function lockApplicableAvailabilitySlot(
  db: PostgresJsDatabase,
  input: {
    slotId: string
    productId: string | null
    requiredQuantity: number
    bookingItemId: string
  },
) {
  const [slot] = await db
    .select({
      id: availabilitySlotsRef.id,
      unlimited: availabilitySlotsRef.unlimited,
      remainingPax: availabilitySlotsRef.remainingPax,
    })
    .from(availabilitySlotsRef)
    .where(
      and(
        eq(availabilitySlotsRef.id, input.slotId),
        ...(input.productId ? [eq(availabilitySlotsRef.productId, input.productId)] : []),
        eq(availabilitySlotsRef.status, "open"),
        eq(availabilitySlotsRef.pastCutoff, false),
        eq(availabilitySlotsRef.tooEarly, false),
      ),
    )
    .for("update")
    .limit(1)
  if (
    !slot ||
    (!slot.unlimited && (slot.remainingPax ?? 0) < Math.max(input.requiredQuantity, 0))
  ) {
    throw new RosterPlanError(
      "availability_changed",
      "The target departure is no longer available",
      input.bookingItemId,
    )
  }
  return slot
}

async function findProposedRevision(
  db: PostgresJsDatabase,
  amendmentId: string,
  revisionId: string,
) {
  const [proposed] = await db
    .select()
    .from(bookingRevisions)
    .where(
      and(
        eq(bookingRevisions.id, revisionId),
        eq(bookingRevisions.amendmentId, amendmentId),
        eq(bookingRevisions.role, "proposed_after"),
      ),
    )
    .limit(1)
  return proposed ?? null
}

async function stageApply(
  db: PostgresJsDatabase,
  amendmentId: string,
  input: { expectedBookingRevision: number; proposedRevisionId: string },
  context: BookingAmendmentCommandContext,
  dependencies: BookingAmendmentServiceDependencies,
): Promise<
  | { status: "staged"; amendment: BookingAmendmentRow }
  | { status: "result"; result: ApplyBookingAmendmentResult }
> {
  return db.transaction(async (rawTx) => {
    const tx = rawTx as PostgresJsDatabase
    const locked = await lockAmendment(tx, amendmentId)
    if (!locked) return { status: "result", result: { status: "not_found" } }
    const { booking, amendment } = locked
    const proposed = await findProposedRevision(tx, amendment.id, input.proposedRevisionId)
    if (!proposed) return { status: "result", result: { status: "revision_mismatch" } }
    if (amendment.status === "applied") {
      return {
        status: "result",
        result: { status: "ok", amendment: await hydrateAmendment(tx, amendment) },
      }
    }
    if (
      booking.revision !== input.expectedBookingRevision ||
      booking.revision !== amendment.baseBookingRevision
    ) {
      return {
        status: "result",
        result: { status: "stale_revision", currentBookingRevision: booking.revision },
      }
    }
    if (amendment.acceptanceRequired && amendment.status === "proposed") {
      return { status: "result", result: { status: "acceptance_required" } }
    }
    if (amendment.status === "manual_review") {
      return {
        status: "result",
        result: { status: "manual_review", amendment: await hydrateAmendment(tx, amendment) },
      }
    }
    if (!["proposed", "accepted", "applying", "in_doubt", "failed"].includes(amendment.status)) {
      return { status: "result", result: { status: "invalid_state" } }
    }
    if (amendment.applyIdempotencyKey && amendment.applyIdempotencyKey !== context.idempotencyKey) {
      return { status: "result", result: { status: "idempotency_conflict" } }
    }
    const now = dependencies.now?.() ?? new Date()
    if (!amendment.applyStartedAt && amendment.quoteExpiresAt && amendment.quoteExpiresAt <= now) {
      return { status: "result", result: { status: "quote_expired" } }
    }
    const [staged] = await tx
      .update(bookingAmendments)
      .set({
        status: "applying",
        applyIdempotencyKey: context.idempotencyKey,
        applyStartedAt: amendment.applyStartedAt ?? now,
        failureCode: null,
        updatedAt: now,
      })
      .where(eq(bookingAmendments.id, amendment.id))
      .returning()
    if (!staged) throw new Error("Booking Amendment apply stage did not return a row")
    return { status: "staged", amendment: staged }
  })
}

async function applyCorrection(
  db: PostgresJsDatabase,
  amendmentId: string,
  context: BookingAmendmentCommandContext,
  dependencies: BookingAmendmentServiceDependencies,
): Promise<ApplyBookingAmendmentResult> {
  return db.transaction(async (rawTx) => {
    const tx = rawTx as PostgresJsDatabase
    const locked = await lockAmendment(tx, amendmentId)
    if (!locked) return { status: "not_found" as const }
    const { booking, amendment } = locked
    if (amendment.status === "applied") {
      return { status: "ok" as const, amendment: await hydrateAmendment(tx, amendment) }
    }
    if (booking.revision !== amendment.baseBookingRevision) {
      return { status: "stale_revision" as const, currentBookingRevision: booking.revision }
    }
    const requested = amendment.requestedChange
    if (requested.type !== "traveler_correction") return { status: "invalid_state" as const }
    const amendmentTravelerId = requireAmendmentTravelerId(amendment)
    const [traveler] = await tx
      .update(bookingTravelers)
      .set({ ...requested.patch, updatedAt: dependencies.now?.() ?? new Date() })
      .where(
        and(
          eq(bookingTravelers.id, amendmentTravelerId),
          eq(bookingTravelers.bookingId, booking.id),
        ),
      )
      .returning({ id: bookingTravelers.id })
    if (!traveler) throw new Error("Booking Amendment traveler disappeared while locked")
    const now = dependencies.now?.() ?? new Date()
    await advanceBookingRevision(tx, booking.id, amendment.baseBookingRevision, {
      revision: amendment.resultBookingRevision,
      updatedAt: now,
    })
    const applied = await markApplied(tx, amendment, context, now, {
      ...amendment.effects,
      finance: "not_required",
    })
    await writeActivity(tx, amendment, context, "Traveler correction applied", now)
    return { status: "ok", amendment: await hydrateAmendment(tx, applied) }
  })
}

/**
 * Which projection writes the change once any supplier leg has secured.
 *
 * Kept as one lookup rather than a branch at each call site: apply reaches
 * the finalizer through three paths (no supplier, supplier secured on
 * dispatch, supplier secured on reconcile) and a new kind that is wired
 * into only two of them fails in exactly the case that is hardest to test.
 */
function finalizeApplyForKind(kind: BookingAmendmentRow["kind"]) {
  return kind === "item_move" ? finalizeItemMoveApply : finalizeRosterApply
}

async function finalizeRosterApply(
  db: PostgresJsDatabase,
  amendmentId: string,
  context: BookingAmendmentCommandContext,
  dependencies: BookingAmendmentServiceDependencies,
): Promise<ApplyBookingAmendmentResult> {
  if (!dependencies.finance) return { status: "unsupported_capability" }
  const finance = dependencies.finance
  try {
    return await db.transaction(async (rawTx) => {
      const tx = rawTx as PostgresJsDatabase
      const locked = await lockAmendment(tx, amendmentId)
      if (!locked) return { status: "not_found" as const }
      const { booking, amendment } = locked
      if (amendment.status === "applied") {
        return { status: "ok" as const, amendment: await hydrateAmendment(tx, amendment) }
      }
      if (booking.revision !== amendment.baseBookingRevision) {
        return { status: "stale_revision" as const, currentBookingRevision: booking.revision }
      }
      if (amendment.kind !== "traveler_add" && amendment.kind !== "traveler_drop") {
        return { status: "invalid_state" as const }
      }
      if (
        amendment.effects.supplier !== "not_required" &&
        amendment.effects.supplier !== "secured"
      ) {
        return { status: "invalid_state" as const }
      }
      const now = dependencies.now?.() ?? new Date()
      // A roster Amendment only ever carries roster plans; `item_add` is
      // dispatched to its own finalizer well before this point.
      const rosterPlans = amendment.operationPlan.filter(
        (plan): plan is BookingAmendmentRosterItemPlan => !isItemAddPlan(plan),
      )
      await applyCapacityAndAllocationPlan(tx, rosterPlans, booking.pax, now)
      const amendmentTravelerId = requireAmendmentTravelerId(amendment)
      const requested = amendment.requestedChange
      if (requested.type === "traveler_add") {
        await tx.insert(bookingTravelers).values({
          id: amendmentTravelerId,
          bookingId: booking.id,
          personId: requested.traveler.personId ?? null,
          participantType: requested.traveler.participantType,
          travelerCategory: requested.traveler.travelerCategory ?? null,
          firstName: requested.traveler.firstName,
          lastName: requested.traveler.lastName,
          email: requested.traveler.email ?? null,
          phone: requested.traveler.phone ?? null,
          preferredLanguage: requested.traveler.preferredLanguage ?? null,
          isPrimary: false,
          createdAt: now,
          updatedAt: now,
        })
        await tx.insert(bookingItemTravelers).values(
          requested.bookingItemIds.map((bookingItemId) => ({
            id: newId("booking_item_travelers"),
            bookingItemId,
            travelerId: amendmentTravelerId,
            role: "traveler" as const,
            isPrimary: false,
            createdAt: now,
          })),
        )
      } else if (requested.type === "traveler_drop") {
        await tx
          .delete(bookingItemTravelers)
          .where(
            and(
              eq(bookingItemTravelers.travelerId, amendmentTravelerId),
              inArray(bookingItemTravelers.bookingItemId, requested.bookingItemIds),
            ),
          )
        const [remainingAssignment] = await tx
          .select({ id: bookingItemTravelers.id })
          .from(bookingItemTravelers)
          .where(eq(bookingItemTravelers.travelerId, amendmentTravelerId))
          .limit(1)
        if (!remainingAssignment) {
          await tx
            .delete(bookingTravelers)
            .where(
              and(
                eq(bookingTravelers.id, amendmentTravelerId),
                eq(bookingTravelers.bookingId, booking.id),
              ),
            )
        }
      } else {
        return { status: "invalid_state" as const }
      }
      for (const plan of rosterPlans) {
        await tx
          .update(bookingItems)
          // agent-quality: raw-sql reviewed -- owner: bookings; integer deltas are server-derived from the immutable Amendment plan and Drizzle binds them.
          .set({
            quantity: sql`${bookingItems.quantity} + ${plan.quantityDelta}`,
            totalSellAmountCents: sql`${bookingItems.totalSellAmountCents} + ${plan.unitSellAmountCents * plan.quantityDelta}`,
            updatedAt: now,
          })
          .where(
            and(eq(bookingItems.id, plan.bookingItemId), eq(bookingItems.bookingId, booking.id)),
          )
      }
      const price = priceFromRow(amendment)
      await finance.recordBookingAmendment(tx, {
        amendmentId: amendment.id,
        bookingId: booking.id,
        idempotencyKey: context.idempotencyKey,
        price,
        consequences: amendment.financialConsequences,
        reason: amendment.reason,
        now,
      })
      await advanceBookingRevision(tx, booking.id, amendment.baseBookingRevision, {
        revision: amendment.resultBookingRevision,
        sellAmountCents:
          booking.sellAmountCents == null
            ? amendment.priceDeltaCents
            : booking.sellAmountCents + amendment.priceDeltaCents,
        pax: Math.max(0, (booking.pax ?? 0) + (amendment.kind === "traveler_add" ? 1 : -1)),
        updatedAt: now,
      })
      const applied = await markApplied(tx, amendment, context, now, {
        ...amendment.effects,
        finance: "recorded",
        supplier: amendment.effects.supplier === "not_required" ? "not_required" : "secured",
        allocation: "applied",
      })
      await writeActivity(tx, amendment, context, "Priced traveler roster change applied", now)
      return { status: "ok", amendment: await hydrateAmendment(tx, applied) }
    })
  } catch (error) {
    if (error instanceof RosterPlanError && error.code === "availability_changed") {
      const [current] = await db
        .select()
        .from(bookingAmendments)
        .where(eq(bookingAmendments.id, amendmentId))
        .limit(1)
      const supplierAlreadySecured = current?.effects.supplier === "secured"
      await setAmendmentFailure(
        db,
        amendmentId,
        supplierAlreadySecured ? "manual_review" : "failed",
        supplierAlreadySecured
          ? "local_projection_failed_after_supplier_secured"
          : "availability_changed",
        dependencies.now?.() ?? new Date(),
      )
      if (supplierAlreadySecured && current) {
        const [failed] = await db
          .select()
          .from(bookingAmendments)
          .where(eq(bookingAmendments.id, amendmentId))
          .limit(1)
        if (!failed) return { status: "not_found" }
        const amendment = await hydrateAmendment(db, failed)
        return { status: "manual_review", amendment }
      }
      return { status: "availability_changed", bookingItemId: error.bookingItemId ?? "unknown" }
    }
    throw error
  }
}

/**
 * Write the service the Amendment quoted: the Booking Item, its capacity
 * allocation, and the departure decrement — then advance the revision and
 * hand finance the delta to collect.
 *
 * The slot decrement is a conditional UPDATE guarded on the departure still
 * being open, in-window, and having room, exactly as the roster path does.
 * A departure that filled up between the quote and the apply fails the
 * guard and the whole transaction rolls back rather than overselling.
 */
/**
 * Carry the Booking Item onto its new departure: give the old one's
 * capacity back, take the new one's, and reprice the line to the fare that
 * was quoted.
 *
 * Both capacity legs happen in one transaction, and the acquire is the same
 * conditional UPDATE the other paths use — guarded on the target still being
 * open, in-window, and having room. A departure that filled up between quote
 * and commit fails the guard and the whole move rolls back, so the booking
 * is never left holding neither date.
 *
 * The release is deliberately unguarded on status: giving a seat back to a
 * departure that has since closed is always safe, and refusing it would
 * strand capacity on exactly the dates operators most often move away from.
 */
async function finalizeItemMoveApply(
  db: PostgresJsDatabase,
  amendmentId: string,
  context: BookingAmendmentCommandContext,
  dependencies: BookingAmendmentServiceDependencies,
): Promise<ApplyBookingAmendmentResult> {
  if (!dependencies.finance) return { status: "unsupported_capability" }
  const finance = dependencies.finance
  try {
    return await db.transaction(async (rawTx) => {
      const tx = rawTx as PostgresJsDatabase
      const locked = await lockAmendment(tx, amendmentId)
      if (!locked) return { status: "not_found" as const }
      const { booking, amendment } = locked
      if (amendment.status === "applied") {
        return { status: "ok" as const, amendment: await hydrateAmendment(tx, amendment) }
      }
      if (booking.revision !== amendment.baseBookingRevision) {
        return { status: "stale_revision" as const, currentBookingRevision: booking.revision }
      }
      const plan = amendment.operationPlan.find(isItemMovePlan)
      if (!plan) return { status: "invalid_state" as const }

      const now = dependencies.now?.() ?? new Date()
      const toCapacityQuantity = plan.toCapacityQuantity ?? plan.quantity
      const fromCapacityQuantity = plan.fromCapacityQuantity ?? plan.quantity

      // Revalidate even when another line already carries this booking's
      // target claim. Capacity may be zero while the departure itself has
      // closed or crossed its booking window since preview.
      await lockApplicableAvailabilitySlot(tx, {
        slotId: plan.toAvailabilitySlotId,
        productId: plan.productId ?? null,
        requiredQuantity: toCapacityQuantity,
        bookingItemId: plan.bookingItemId,
      })

      // Take the new departure's capacity first. The locked validation above
      // makes this update safe without repeating status predicates.
      if (toCapacityQuantity > 0) {
        await tx
          .update(availabilitySlotsRef)
          // agent-quality: raw-sql reviewed -- owner: bookings; capacity decrement uses the locked, revalidated slot and server-owned plan data.
          .set({
            remainingPax: sql`CASE WHEN ${availabilitySlotsRef.unlimited} THEN ${availabilitySlotsRef.remainingPax} ELSE ${availabilitySlotsRef.remainingPax} - ${toCapacityQuantity} END`,
            updatedAt: now,
          })
          .where(eq(availabilitySlotsRef.id, plan.toAvailabilitySlotId))
      }

      if (plan.fromAvailabilitySlotId && fromCapacityQuantity > 0) {
        await tx
          .update(availabilitySlotsRef)
          // agent-quality: raw-sql reviewed -- owner: bookings; capacity restore uses locked, server-owned plan data and Drizzle identifiers.
          .set({
            remainingPax: sql`CASE WHEN ${availabilitySlotsRef.unlimited} THEN ${availabilitySlotsRef.remainingPax} ELSE ${availabilitySlotsRef.remainingPax} + ${fromCapacityQuantity} END`,
            // A departure that sold out only because of this booking becomes
            // sellable again the moment the booking leaves it.
            status: sql`CASE WHEN ${availabilitySlotsRef.status} = 'sold_out' THEN 'open' ELSE ${availabilitySlotsRef.status} END`,
            updatedAt: now,
          })
          .where(eq(availabilitySlotsRef.id, plan.fromAvailabilitySlotId))
      }

      if (plan.sourceClaimCarrierAllocationId) {
        await tx
          .update(bookingAllocations)
          .set({ quantity: Math.max(booking.pax ?? plan.quantity, 0), updatedAt: now })
          .where(eq(bookingAllocations.id, plan.sourceClaimCarrierAllocationId))
      }

      await tx
        .update(bookingAllocations)
        .set({
          availabilitySlotId: plan.toAvailabilitySlotId,
          quantity: toCapacityQuantity,
          updatedAt: now,
        })
        .where(eq(bookingAllocations.id, plan.allocationId))

      await tx
        .update(bookingItems)
        .set({
          availabilitySlotId: plan.toAvailabilitySlotId,
          unitSellAmountCents: plan.unitSellAmountCents,
          totalSellAmountCents: plan.totalSellAmountCents,
          serviceDate: plan.serviceDate,
          startsAt: plan.startsAt ? new Date(plan.startsAt) : null,
          endsAt: plan.endsAt ? new Date(plan.endsAt) : null,
          departureLabelSnapshot: plan.departureLabelSnapshot,
          updatedAt: now,
        })
        .where(and(eq(bookingItems.id, plan.bookingItemId), eq(bookingItems.bookingId, booking.id)))

      const price = priceFromRow(amendment)
      await finance.recordBookingAmendment(tx, {
        amendmentId: amendment.id,
        bookingId: booking.id,
        idempotencyKey: context.idempotencyKey,
        price,
        consequences: amendment.financialConsequences,
        reason: amendment.reason,
        now,
        refundHandling: plan.refundHandling,
        issuedToPersonId: booking.personId,
      })
      await advanceBookingRevision(tx, booking.id, amendment.baseBookingRevision, {
        revision: amendment.resultBookingRevision,
        sellAmountCents:
          booking.sellAmountCents == null
            ? amendment.priceDeltaCents
            : booking.sellAmountCents + amendment.priceDeltaCents,
        updatedAt: now,
      })
      const applied = await markApplied(tx, amendment, context, now, {
        ...amendment.effects,
        finance: "recorded",
        supplier: amendment.effects.supplier === "not_required" ? "not_required" : "secured",
        allocation: "applied",
      })
      await writeActivity(
        tx,
        amendment,
        context,
        `Service moved to ${plan.departureLabelSnapshot ?? plan.toAvailabilitySlotId}`,
        now,
      )
      return { status: "ok" as const, amendment: await hydrateAmendment(tx, applied) }
    })
  } catch (error) {
    if (error instanceof RosterPlanError && error.code === "availability_changed") {
      const [current] = await db
        .select()
        .from(bookingAmendments)
        .where(eq(bookingAmendments.id, amendmentId))
        .limit(1)
      // A supplier that already moved the reservation while the local
      // projection failed is not something to retry blindly.
      const supplierAlreadySecured = current?.effects.supplier === "secured"
      await setAmendmentFailure(
        db,
        amendmentId,
        supplierAlreadySecured ? "manual_review" : "failed",
        supplierAlreadySecured
          ? "local_projection_failed_after_supplier_secured"
          : "availability_changed",
        dependencies.now?.() ?? new Date(),
      )
      if (supplierAlreadySecured && current) {
        // Re-read rather than hydrating `current`: it was loaded before
        // `setAmendmentFailure` wrote the new status, so returning it would
        // hand back a `manual_review` result whose embedded amendment still
        // says `applying` and carries no failure code.
        const [failed] = await db
          .select()
          .from(bookingAmendments)
          .where(eq(bookingAmendments.id, amendmentId))
          .limit(1)
        if (!failed) return { status: "not_found" }
        const amendment = await hydrateAmendment(db, failed)
        return { status: "manual_review", amendment }
      }
      return { status: "availability_changed", bookingItemId: error.bookingItemId ?? "unknown" }
    }
    throw error
  }
}

async function finalizeItemAddApply(
  db: PostgresJsDatabase,
  amendmentId: string,
  context: BookingAmendmentCommandContext,
  dependencies: BookingAmendmentServiceDependencies,
): Promise<ApplyBookingAmendmentResult> {
  if (!dependencies.finance) return { status: "unsupported_capability" }
  const finance = dependencies.finance
  try {
    return await db.transaction(async (rawTx) => {
      const tx = rawTx as PostgresJsDatabase
      const locked = await lockAmendment(tx, amendmentId)
      if (!locked) return { status: "not_found" as const }
      const { booking, amendment } = locked
      if (amendment.status === "applied") {
        return { status: "ok" as const, amendment: await hydrateAmendment(tx, amendment) }
      }
      if (booking.revision !== amendment.baseBookingRevision) {
        return { status: "stale_revision" as const, currentBookingRevision: booking.revision }
      }
      const plan = amendment.operationPlan.find(isItemAddPlan)
      if (!plan) return { status: "invalid_state" as const }

      const now = dependencies.now?.() ?? new Date()
      const capacityClaimQuantity =
        plan.capacityClaimQuantity ?? Math.max(booking.pax ?? plan.quantity, 0)
      let existingSlotAllocations: AllocationRow[] = []

      if (plan.availabilitySlotId) {
        existingSlotAllocations = await tx
          .select()
          .from(bookingAllocations)
          .where(
            and(
              eq(bookingAllocations.bookingId, booking.id),
              eq(bookingAllocations.availabilitySlotId, plan.availabilitySlotId),
              inArray(bookingAllocations.status, ACTIVE_BOOKING_ALLOCATION_STATUSES),
            ),
          )
          .orderBy(asc(bookingAllocations.createdAt), asc(bookingAllocations.id))
          .for("update")

        const existingClaim = existingSlotAllocations.reduce(
          (sum, allocation) => sum + allocation.quantity,
          0,
        )
        const capacityDelta = capacityClaimQuantity - existingClaim
        await lockApplicableAvailabilitySlot(tx, {
          slotId: plan.availabilitySlotId,
          productId: plan.productId,
          requiredQuantity: Math.max(capacityDelta, 0),
          bookingItemId: PENDING_ITEM_ID,
        })
        if (capacityDelta > 0) {
          await tx
            .update(availabilitySlotsRef)
            // agent-quality: raw-sql reviewed -- owner: bookings; the server-owned claim is applied to the locked, revalidated slot.
            .set({
              remainingPax: sql`CASE WHEN ${availabilitySlotsRef.unlimited} THEN ${availabilitySlotsRef.remainingPax} ELSE ${availabilitySlotsRef.remainingPax} - ${capacityDelta} END`,
              updatedAt: now,
            })
            .where(eq(availabilitySlotsRef.id, plan.availabilitySlotId))
        } else if (capacityDelta < 0) {
          await tx
            .update(availabilitySlotsRef)
            // agent-quality: raw-sql reviewed -- owner: bookings; normalizing an over-counted booking claim returns only the server-derived excess.
            .set({
              remainingPax: sql`CASE WHEN ${availabilitySlotsRef.unlimited} THEN ${availabilitySlotsRef.remainingPax} ELSE ${availabilitySlotsRef.remainingPax} + ${-capacityDelta} END`,
              updatedAt: now,
            })
            .where(eq(availabilitySlotsRef.id, plan.availabilitySlotId))
        }

        if (existingSlotAllocations.length > 0) {
          const [carrier, ...duplicates] = existingSlotAllocations
          await tx
            .update(bookingAllocations)
            .set({ quantity: capacityClaimQuantity, updatedAt: now })
            .where(eq(bookingAllocations.id, carrier!.id))
          if (duplicates.length > 0) {
            await tx
              .update(bookingAllocations)
              .set({ quantity: 0, updatedAt: now })
              .where(
                inArray(
                  bookingAllocations.id,
                  duplicates.map((allocation) => allocation.id),
                ),
              )
          }
        }
      }

      const [item] = await tx
        .insert(bookingItems)
        .values({
          bookingId: booking.id,
          title: plan.title,
          itemType: "unit",
          status: "confirmed",
          quantity: plan.quantity,
          sellCurrency: plan.sellCurrency,
          unitSellAmountCents: plan.unitSellAmountCents,
          totalSellAmountCents: plan.totalSellAmountCents,
          costCurrency: plan.costCurrency,
          unitCostAmountCents: plan.unitCostAmountCents,
          totalCostAmountCents: plan.totalCostAmountCents,
          serviceDate: plan.serviceDate,
          productId: plan.productId,
          optionId: plan.optionId,
          optionUnitId: plan.optionUnitId,
          availabilitySlotId: plan.availabilitySlotId,
          productNameSnapshot: plan.productNameSnapshot,
          optionNameSnapshot: plan.optionNameSnapshot,
          unitNameSnapshot: plan.unitNameSnapshot,
          departureLabelSnapshot: plan.departureLabelSnapshot,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      if (!item) throw new Error("Booking Item insert did not return a row")

      await tx.insert(bookingAllocations).values({
        bookingId: booking.id,
        bookingItemId: item.id,
        productId: plan.productId,
        optionId: plan.optionId,
        optionUnitId: plan.optionUnitId,
        availabilitySlotId: plan.availabilitySlotId,
        quantity: existingSlotAllocations.length > 0 ? 0 : capacityClaimQuantity,
        allocationType: "unit",
        status: "confirmed",
        confirmedAt: now,
        createdAt: now,
        updatedAt: now,
      })

      const price = priceFromRow(amendment)
      await finance.recordBookingAmendment(tx, {
        amendmentId: amendment.id,
        bookingId: booking.id,
        idempotencyKey: context.idempotencyKey,
        price,
        consequences: amendment.financialConsequences,
        reason: amendment.reason,
        now,
      })
      await advanceBookingRevision(tx, booking.id, amendment.baseBookingRevision, {
        revision: amendment.resultBookingRevision,
        sellAmountCents:
          booking.sellAmountCents == null
            ? amendment.priceDeltaCents
            : booking.sellAmountCents + amendment.priceDeltaCents,
        updatedAt: now,
      })
      const applied = await markApplied(tx, amendment, context, now, {
        ...amendment.effects,
        finance: "recorded",
        allocation: "applied",
      })
      await writeActivity(tx, amendment, context, `Service "${plan.title}" added`, now)
      return { status: "ok" as const, amendment: await hydrateAmendment(tx, applied) }
    })
  } catch (error) {
    if (error instanceof RosterPlanError && error.code === "availability_changed") {
      await setAmendmentFailure(
        db,
        amendmentId,
        "failed",
        "availability_changed",
        dependencies.now?.() ?? new Date(),
      )
      return { status: "availability_changed", bookingItemId: error.bookingItemId ?? "unknown" }
    }
    throw error
  }
}

async function applyCapacityAndAllocationPlan(
  tx: PostgresJsDatabase,
  plans: BookingAmendmentRosterItemPlan[],
  bookingPaxBefore: number | null,
  now: Date,
) {
  const lockedAllocations = new Map<string, AllocationRow>()
  for (const plan of plans) {
    const [allocation] = await tx
      .select()
      .from(bookingAllocations)
      .where(eq(bookingAllocations.id, plan.allocationId))
      .for("update")
      .limit(1)
    if (!allocation || allocation.quantity !== plan.allocationQuantityBefore) {
      throw new RosterPlanError("availability_changed", "Allocation changed", plan.bookingItemId)
    }
    lockedAllocations.set(plan.allocationId, allocation)
  }

  const slotPlans = new Map<string, BookingAmendmentRosterItemPlan>()
  for (const plan of plans) {
    if (plan.availabilitySlotId && !slotPlans.has(plan.availabilitySlotId)) {
      slotPlans.set(plan.availabilitySlotId, plan)
    }
  }

  for (const [slotId, plan] of slotPlans) {
    const allocation = lockedAllocations.get(plan.allocationId)!
    const liveAllocations = await tx
      .select()
      .from(bookingAllocations)
      .where(
        and(
          eq(bookingAllocations.bookingId, allocation.bookingId),
          eq(bookingAllocations.availabilitySlotId, slotId),
          inArray(bookingAllocations.status, ACTIVE_BOOKING_ALLOCATION_STATUSES),
        ),
      )
      .orderBy(asc(bookingAllocations.createdAt), asc(bookingAllocations.id))
      .for("update")
    const currentClaim = liveAllocations.reduce((sum, candidate) => sum + candidate.quantity, 0)
    const desiredClaim = Math.max((bookingPaxBefore ?? currentClaim) + plan.quantityDelta, 0)
    const capacityDelta = desiredClaim - currentClaim
    if (capacityDelta > 0) {
      const [updated] = await tx
        .update(availabilitySlotsRef)
        // agent-quality: raw-sql reviewed -- owner: bookings; one passenger-denominated claim delta is applied per booking/departure, regardless of priced line count.
        .set({
          remainingPax: sql`CASE WHEN ${availabilitySlotsRef.unlimited} THEN ${availabilitySlotsRef.remainingPax} ELSE ${availabilitySlotsRef.remainingPax} - ${capacityDelta} END`,
          updatedAt: now,
        })
        .where(
          and(
            eq(availabilitySlotsRef.id, slotId),
            eq(availabilitySlotsRef.status, "open"),
            eq(availabilitySlotsRef.pastCutoff, false),
            eq(availabilitySlotsRef.tooEarly, false),
            or(
              eq(availabilitySlotsRef.unlimited, true),
              sql`${availabilitySlotsRef.remainingPax} >= ${capacityDelta}`,
            ),
          ),
        )
        .returning({ id: availabilitySlotsRef.id })
      if (!updated) {
        throw new RosterPlanError(
          "availability_changed",
          "Availability changed",
          plan.bookingItemId,
        )
      }
    }
    if (capacityDelta < 0) {
      await tx
        .update(availabilitySlotsRef)
        // agent-quality: raw-sql reviewed -- owner: bookings; the server-derived passenger claim reduction is returned to the slot.
        .set({
          remainingPax: sql`CASE WHEN ${availabilitySlotsRef.unlimited} THEN ${availabilitySlotsRef.remainingPax} ELSE COALESCE(${availabilitySlotsRef.remainingPax}, 0) + ${-capacityDelta} END`,
          updatedAt: now,
        })
        .where(eq(availabilitySlotsRef.id, slotId))
    }

    const [carrier, ...duplicates] = liveAllocations
    if (carrier) {
      await tx
        .update(bookingAllocations)
        .set({ quantity: desiredClaim, updatedAt: now })
        .where(eq(bookingAllocations.id, carrier.id))
    }
    if (duplicates.length > 0) {
      await tx
        .update(bookingAllocations)
        .set({ quantity: 0, updatedAt: now })
        .where(
          inArray(
            bookingAllocations.id,
            duplicates.map((candidate) => candidate.id),
          ),
        )
    }
  }

  for (const plan of plans.filter((candidate) => !candidate.availabilitySlotId)) {
    const allocation = lockedAllocations.get(plan.allocationId)!
    const [updatedAllocation] = await tx
      .update(bookingAllocations)
      .set({ quantity: allocation.quantity + plan.quantityDelta, updatedAt: now })
      .where(eq(bookingAllocations.id, allocation.id))
      .returning({ id: bookingAllocations.id })
    if (!updatedAllocation) {
      throw new RosterPlanError("availability_changed", "Allocation changed", plan.bookingItemId)
    }
  }
}

function priceFromRow(row: BookingAmendmentRow): BookingAmendmentPrice {
  return {
    currency: row.priceCurrency,
    subtotalDeltaCents: row.subtotalDeltaCents,
    feeDeltaCents: row.feeDeltaCents,
    taxDeltaCents: row.taxDeltaCents,
    amountCents: row.priceDeltaCents,
    collectionAmountCents: row.collectionAmountCents,
    refundAmountCents: row.refundAmountCents,
    taxLines: row.taxLines,
  }
}

async function advanceBookingRevision(
  tx: PostgresJsDatabase,
  bookingId: string,
  baseRevision: number,
  values: Partial<typeof bookings.$inferInsert>,
) {
  const [updated] = await tx
    .update(bookings)
    .set(values)
    .where(and(eq(bookings.id, bookingId), eq(bookings.revision, baseRevision)))
    .returning({ id: bookings.id })
  if (!updated) throw new Error("Booking Amendment revision advance failed while locked")
}

async function markApplied(
  tx: PostgresJsDatabase,
  amendment: BookingAmendmentRow,
  context: BookingAmendmentCommandContext,
  now: Date,
  effects: BookingAmendmentEffects,
) {
  const [applied] = await tx
    .update(bookingAmendments)
    .set({
      status: "applied",
      effects,
      appliedAt: now,
      appliedBy: context.actorId ?? null,
      appliedActor: context.actor,
      failureCode: null,
      updatedAt: now,
    })
    .where(eq(bookingAmendments.id, amendment.id))
    .returning()
  if (!applied) throw new Error("Booking Amendment apply did not return a row")
  return applied
}

async function writeActivity(
  tx: PostgresJsDatabase,
  amendment: BookingAmendmentRow,
  context: BookingAmendmentCommandContext,
  description: string,
  now: Date,
) {
  await tx.insert(bookingActivityLog).values({
    bookingId: amendment.bookingId,
    actorId: context.actorId ?? null,
    activityType: "traveler_update",
    description,
    metadata: {
      amendmentId: amendment.id,
      travelerId: amendment.travelerId,
      bookingRevision: amendment.resultBookingRevision,
      reason: amendment.reason,
      actor: context.actor,
      appliedAt: now.toISOString(),
    },
  })
}

async function setAmendmentFailure(
  db: PostgresJsDatabase,
  amendmentId: string,
  status: "failed" | "in_doubt" | "manual_review",
  failureCode: string,
  now: Date,
) {
  await db
    .update(bookingAmendments)
    .set({ status, failureCode, updatedAt: now })
    .where(eq(bookingAmendments.id, amendmentId))
}

async function persistSupplierOutcomes(
  db: PostgresJsDatabase,
  amendmentId: string,
  outcomes: Awaited<ReturnType<BookingsSupplierAmendmentRuntime["dispatch"]>>,
  now: Date,
): Promise<
  | "secured"
  | "supplier_pending"
  | "supplier_in_doubt"
  | "supplier_refused"
  | "manual_review"
  | "idempotency_conflict"
> {
  const operationIds = outcomes.flatMap((outcome) =>
    outcome.supplierOperationId ? [outcome.supplierOperationId] : [],
  )
  const secured = outcomes.filter((outcome) => outcome.outcome === "secured").length
  const hasConflict = outcomes.some((outcome) => outcome.outcome === "idempotency_conflict")
  const hasInDoubt = outcomes.some((outcome) => outcome.outcome === "in_doubt")
  const hasPending = outcomes.some((outcome) => outcome.outcome === "pending")
  const hasRefused = outcomes.some((outcome) => outcome.outcome === "refused")
  const partial = secured > 0 && secured < outcomes.length
  const result = hasConflict
    ? ("idempotency_conflict" as const)
    : partial
      ? ("manual_review" as const)
      : hasInDoubt
        ? ("supplier_in_doubt" as const)
        : hasPending
          ? ("supplier_pending" as const)
          : hasRefused
            ? ("supplier_refused" as const)
            : ("secured" as const)
  const status =
    result === "secured"
      ? ("applying" as const)
      : result === "supplier_pending"
        ? ("applying" as const)
        : result === "supplier_in_doubt"
          ? ("in_doubt" as const)
          : result === "supplier_refused"
            ? ("failed" as const)
            : ("manual_review" as const)
  const supplierEffect =
    result === "secured"
      ? ("secured" as const)
      : result === "supplier_pending"
        ? ("pending" as const)
        : result === "supplier_in_doubt"
          ? ("in_doubt" as const)
          : result === "supplier_refused"
            ? ("refused" as const)
            : ("manual_review" as const)
  const [current] = await db
    .select({ effects: bookingAmendments.effects })
    .from(bookingAmendments)
    .where(eq(bookingAmendments.id, amendmentId))
    .limit(1)
  await db
    .update(bookingAmendments)
    .set({
      status,
      supplierOperationIds: operationIds,
      effects: { ...(current?.effects ?? NO_EXTERNAL_EFFECTS), supplier: supplierEffect },
      failureCode: result === "secured" || result === "supplier_pending" ? null : result,
      updatedAt: now,
    })
    .where(eq(bookingAmendments.id, amendmentId))
  return result
}

async function stableFingerprint(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(sortForStableJson(value))),
  )
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function sortForStableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForStableJson)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortForStableJson(entry)]),
  )
}
