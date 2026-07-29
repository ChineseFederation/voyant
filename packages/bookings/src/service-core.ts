// agent-quality: file-size exception -- Bookings service keeps legacy booking lifecycle, traveler, allocation, and accounting workflows together until service modules are split by domain operation.
import {
  type ActionLedgerRequestContextValues,
  appendActionLedgerMutation,
  type CreatedTargetMutationLease,
  consumeCreatedTargetMutationLease,
} from "@voyant-travel/action-ledger"
import type { EventBus } from "@voyant-travel/core"
import type { NamespacedCustomFieldValues } from "@voyant-travel/core/custom-fields"
import { newId } from "@voyant-travel/db/lib/typeid"
import { insertOutboxEvents } from "@voyant-travel/db/outbox"
import { authUser } from "@voyant-travel/db/schema/iam"
import {
  and,
  asc,
  desc,
  eq,
  exists,
  getTableColumns,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  notInArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { z } from "zod"

import { BOOKING_STATUS_CAPABILITIES } from "./action-ledger-capabilities.js"
import { availabilityHoldsRef, availabilitySlotsRef } from "./availability-ref.js"
import { exchangeRatesRef } from "./markets-ref.js"
import {
  applyTravelDetailSnapshot,
  type BookingPiiService,
  type BookingTravelerSnapshot,
  type UpsertBookingTravelerTravelDetailInput,
} from "./pii.js"
import {
  bookingItemProductDetailsRef,
  bookingProductDetailsRef,
  optionUnitsRef,
  productCategoryProductsRef,
  productDayServicesRef,
  productDaysRef,
  productItinerariesRef,
  productOptionsRef,
  productsRef,
  productTicketSettingsRef,
  suppliersRef,
} from "./products-ref.js"
import { bookingTravelerTravelDetails } from "./schema/travel-details.js"
import {
  bookingActivityLog,
  bookingAllocations,
  bookingDocuments,
  bookingFulfillments,
  bookingItems,
  bookingItemTravelers,
  bookingNotes,
  bookingRedemptionEvents,
  bookingSupplierStatuses,
  bookings,
  bookingTravelers,
} from "./schema.js"
import { cleanupGroupOnBookingCancelled } from "./service-groups.js"
import { type BookingStatus, canTransitionBooking, transitionBooking } from "./state-machine.js"
import { BOOKING_RESOURCE_CAPACITY_STATUSES } from "./status.js"
import type {
  bookingListQuerySchema,
  cancelBookingSchema,
  completeBookingSchema,
  confirmBookingSchema,
  convertProductSchema,
  createTravelerWithTravelDetailsSchema,
  expireBookingSchema,
  expireStaleBookingsSchema,
  extendBookingHoldSchema,
  insertBookingDocumentSchema,
  insertBookingFulfillmentSchema,
  insertBookingItemParticipantSchema,
  insertBookingItemSchema,
  insertBookingNoteSchema,
  insertTravelerRecordSchema,
  insertTravelerSchema,
  overrideBookingStatusSchema,
  recordBookingRedemptionSchema,
  startBookingSchema,
  updateBookingFulfillmentSchema,
  updateBookingItemSchema,
  updateBookingNoteSchema,
  updateBookingSchema,
  updateTravelerRecordSchema,
  updateTravelerSchema,
  updateTravelerWithTravelDetailsSchema,
} from "./validation.js"

/**
 * Emit `ARRAY[$1, $2, …]::text[]` instead of the naive
 * `${jsArray}::text[]` form. drizzle's `sql` template spreads JS
 * arrays into a row constructor (`($1, $2)`) which Postgres refuses
 * to cast to `text[]` — see issue #952.
 */
function sqlTextArray(values: readonly string[]): SQL {
  if (values.length === 0) return sql`ARRAY[]::text[]`
  // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
  return sql`ARRAY[${sql.join(
    // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    values.map((value) => sql`${value}`),
    sql.raw(", "),
  )}]::text[]`
}

function sqlValueList(values: readonly string[]): SQL {
  // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding.
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )
}

function buildBookingSearchCondition(search: string): SQL | undefined {
  const trimmed = search.trim()
  if (!trimmed) return undefined

  const term = `%${trimmed}%`
  const normalizedPhoneTerm = trimmed.replace(/\D/g, "")
  const shouldSearchNormalizedPhone =
    normalizedPhoneTerm.length >= 7 && /^[+\d\s().-]+$/.test(trimmed)
  const searchConditions: SQL[] = [
    ilike(bookings.bookingNumber, term),
    ilike(bookings.externalBookingRef, term),
    ilike(bookings.internalNotes, term),
    ilike(bookings.contactFirstName, term),
    ilike(bookings.contactLastName, term),
    ilike(bookings.contactTaxId, term),
    // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    sql`concat_ws(' ', ${bookings.contactFirstName}, ${bookings.contactLastName}) ilike ${term}`,
    ilike(bookings.contactEmail, term),
    ilike(bookings.contactPhone, term),
    ilike(bookings.contactCountry, term),
    ilike(bookings.contactRegion, term),
    ilike(bookings.contactCity, term),
    ilike(bookings.contactAddressLine1, term),
    ilike(bookings.contactAddressLine2, term),
    ilike(bookings.contactPostalCode, term),
    // Match line-item title + product-name snapshot so operators can
    // find "all bookings on Paris Sunset & Seine" from the search box
    // instead of having to open the product filter popover.
    sql`exists (
      select 1 from ${bookingItems}
      where ${bookingItems.bookingId} = ${bookings.id}
        and (
          ${bookingItems.title} ilike ${term}
          or ${bookingItems.productNameSnapshot} ilike ${term}
        )
    )`,
  ]

  if (shouldSearchNormalizedPhone) {
    searchConditions.push(
      // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      sql`regexp_replace(coalesce(${bookings.contactPhone}, ''), '[^0-9]+', '', 'g') like ${`%${normalizedPhoneTerm}%`}`,
    )
  }

  return or(...searchConditions)
}

type BookingListQuery = z.infer<typeof bookingListQuerySchema>
type ConvertProductInput = z.infer<typeof convertProductSchema>
type UpdateBookingInput = z.infer<typeof updateBookingSchema>
type ExtendBookingHoldInput = z.infer<typeof extendBookingHoldSchema>
type ConfirmBookingInput = z.infer<typeof confirmBookingSchema>
type CancelBookingInput = z.infer<typeof cancelBookingSchema>
type ExpireBookingInput = z.infer<typeof expireBookingSchema>
type ExpireStaleBookingsInput = z.infer<typeof expireStaleBookingsSchema>
type StartBookingInput = z.infer<typeof startBookingSchema>
type CompleteBookingInput = z.infer<typeof completeBookingSchema>
type OverrideBookingStatusInput = z.infer<typeof overrideBookingStatusSchema>
type CreateTravelerInput = z.infer<typeof insertTravelerSchema>
type UpdateTravelerInput = z.infer<typeof updateTravelerSchema>
type CreateTravelerRecordInput = z.infer<typeof insertTravelerRecordSchema>
type UpdateTravelerRecordInput = z.infer<typeof updateTravelerRecordSchema>
export type CreateTravelerWithTravelDetailsInput = z.infer<
  typeof createTravelerWithTravelDetailsSchema
>
export type UpdateTravelerWithTravelDetailsInput = z.infer<
  typeof updateTravelerWithTravelDetailsSchema
>

export function normalizeBookingBillingPartyUpdate(data: UpdateBookingInput): UpdateBookingInput {
  if (data.personId) {
    return { ...data, organizationId: null }
  }

  if (data.organizationId) {
    return { ...data, personId: null }
  }

  return data
}

function pickTravelDetailFields(
  data: CreateTravelerWithTravelDetailsInput | UpdateTravelerWithTravelDetailsInput,
): UpsertBookingTravelerTravelDetailInput {
  return {
    nationality: data.nationality,
    documentType: data.documentType,
    documentNumber: data.documentNumber,
    documentExpiry: data.documentExpiry,
    documentIssuingCountry: data.documentIssuingCountry,
    documentIssuingAuthority: data.documentIssuingAuthority,
    documentPersonDocumentId: data.documentPersonDocumentId,
    dateOfBirth: data.dateOfBirth,
    dietaryRequirements: data.dietaryRequirements,
    accessibilityNeeds: data.accessibilityNeeds,
    isLeadTraveler: data.isLeadTraveler,
    sharingGroupId: data.sharingGroupId,
    roomTypeId: data.roomTypeId,
    bedPreference: data.bedPreference,
    allocations: data.allocations,
  }
}
type CreateBookingItemInput = z.infer<typeof insertBookingItemSchema>
type UpdateBookingItemInput = z.infer<typeof updateBookingItemSchema>
type CreateBookingItemParticipantInput = z.infer<typeof insertBookingItemParticipantSchema>
type CreateBookingNoteInput = z.infer<typeof insertBookingNoteSchema>
type UpdateBookingNoteInput = z.infer<typeof updateBookingNoteSchema>
type CreateBookingDocumentInput = z.infer<typeof insertBookingDocumentSchema>
type CreateBookingFulfillmentInput = z.infer<typeof insertBookingFulfillmentSchema>
type UpdateBookingFulfillmentInput = z.infer<typeof updateBookingFulfillmentSchema>
type RecordBookingRedemptionInput = z.infer<typeof recordBookingRedemptionSchema>
type BookingItemStatus = NonNullable<CreateBookingItemInput["status"]>
type BookingAllocationStatus = NonNullable<(typeof bookingAllocations.$inferInsert)["status"]>

function allocationStatusForBookingItemStatus(status: BookingItemStatus): BookingAllocationStatus {
  if (status === "confirmed") return "confirmed"
  if (status === "fulfilled") return "fulfilled"
  if (status === "cancelled") return "cancelled"
  if (status === "expired") return "expired"
  return "held"
}

function terminalBookingItemStatusForOverride(status: BookingStatus): BookingItemStatus | null {
  if (status === "cancelled") return "cancelled"
  if (status === "expired") return "expired"
  if (status === "completed") return "fulfilled"
  return null
}

function terminalBookingAllocationStatusForOverride(
  status: BookingStatus,
): BookingAllocationStatus | null {
  if (status === "cancelled") return "cancelled"
  if (status === "expired") return "expired"
  if (status === "completed") return "fulfilled"
  return null
}

function allocationStatusConsumesSlotCapacity(status: BookingAllocationStatus) {
  return status === "held" || status === "confirmed" || status === "fulfilled"
}

function bookingAllowsItemMutation(status: BookingStatus) {
  return status !== "cancelled"
}

/**
 * Raised when a product booking would end up with no items at all — the caller
 * sent no `itemLines` and the resolved option has no single obvious unit to seed
 * (several optional units, or none). Creating the booking anyway yields a shell
 * that holds no inventory and carries no price, so the create fails closed and
 * the caller is told to name the units it wants.
 */
export class BookingItemsUnresolvedError extends Error {
  readonly productId: string
  readonly optionId: string | null
  readonly candidateUnitCount: number

  constructor(productId: string, optionId: string | null, candidateUnitCount: number) {
    super(
      candidateUnitCount === 0
        ? "This product has no bookable units on the selected option, so the booking would reserve nothing."
        : "Several units are available and none is required, so the booking would reserve nothing. Choose which units to book.",
    )
    this.name = "BookingItemsUnresolvedError"
    this.productId = productId
    this.optionId = optionId
    this.candidateUnitCount = candidateUnitCount
  }
}

/** Product data needed for convertProductToBooking — supplied by the caller (template). */
export interface ConvertProductData {
  product: {
    id: string
    name: string
    description: string | null
    sellCurrency: string
    sellAmountCents: number | null
    costAmountCents: number | null
    marginPercent: number | null
    startDate: string | null
    endDate: string | null
    pax: number | null
  }
  option: { id: string; name: string } | null
  /**
   * Availability slot the caller chose, if any. When set, the resulting booking
   * pins its startDate/endDate to the slot so recurring/scheduled products don't
   * land with null dates.
   */
  slot?: {
    id: string
    dateLocal: string
    startsAt: Date
    endsAt: Date | null
    timezone: string
  } | null
  dayServices: Array<{
    supplierServiceId: string | null
    name: string
    costCurrency: string
    costAmountCents: number
  }>
  units: Array<{
    id: string
    optionId: string
    name: string
    description: string | null
    unitType: string | null
    isRequired: boolean
    minQuantity: number | null
    sortOrder: number
  }>
}

type ProductOptionReference = typeof productOptionsRef.$inferSelect
type OptionUnitReference = typeof optionUnitsRef.$inferSelect

/**
 * Optional runtime hooks for status-transition flows. Keeps the service
 * decoupled from delivery concerns — bookings only has to emit, never know
 * what listens.
 */
export interface BookingServiceRuntime {
  eventBus?: EventBus
  actionLedgerContext?: ActionLedgerRequestContextValues
  actionLedgerAuthorizationSource?: string | null
  actionLedgerCausationActionId?: string | null
  actionLedgerApprovalId?: string | null
  actionLedgerIdempotencyScope?: string | null
  actionLedgerIdempotencyKey?: string | null
  actionLedgerIdempotencyFingerprint?: string | null
  actionLedgerRouteOrToolName?: string | null
  expirePaymentSessionsForBooking?: (
    db: PostgresJsDatabase,
    bookingId: string,
  ) => Promise<void> | void
  closePaymentSchedulesForBooking?: (
    db: PostgresJsDatabase,
    bookingId: string,
    status: Extract<BookingStatus, "cancelled" | "expired">,
  ) => Promise<void> | void
  recordCancellationFinancialSettlement?: (
    db: PostgresJsDatabase,
    input: {
      bookingId: string
      bookingNumber: string
      previousStatus: BookingCancelledEvent["previousStatus"]
      reason: string | null
      actorId: string
    },
  ) =>
    | Promise<Record<string, unknown> | null | undefined>
    | Record<string, unknown>
    | null
    | undefined
}

export function bookingLifecycleOutboxEventId(
  transition: "confirmed" | "cancelled",
  bookingId: string,
  runtime: Pick<
    BookingServiceRuntime,
    "actionLedgerCausationActionId" | "actionLedgerIdempotencyScope" | "actionLedgerIdempotencyKey"
  > = {},
  persistedTransitionAt?: Date | string | null,
) {
  const commandIdentity =
    runtime.actionLedgerCausationActionId ??
    (runtime.actionLedgerIdempotencyKey
      ? `${runtime.actionLedgerIdempotencyScope ?? "booking"}_${runtime.actionLedgerIdempotencyKey}`
      : persistedTransitionAt
        ? `${transition}_${new Date(persistedTransitionAt).toISOString()}`
        : null)
  if (!commandIdentity) {
    throw new Error(`Missing booking lifecycle command identity for ${transition} transition`)
  }
  return `evt_booking_${transition}_${bookingId}_${encodeEventIdPart(commandIdentity)}`
}

function encodeEventIdPart(value: string) {
  return [...new TextEncoder().encode(value)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

type BookingStatusActionName =
  | "booking.status.confirm"
  | "booking.status.expire"
  | "booking.status.cancel"
  | "booking.status.start"
  | "booking.status.complete"
  | "booking.status.override"

async function appendBookingStatusMutationLedger(
  db: PostgresJsDatabase,
  runtime: BookingServiceRuntime,
  input: {
    actionName: BookingStatusActionName
    routeOrToolName: string
    capabilityId: string
    bookingId: string
    fromStatus: BookingStatus
    toStatus: BookingStatus
    evaluatedRisk?: "medium" | "high" | "critical"
  },
) {
  if (!runtime.actionLedgerContext) return

  await appendActionLedgerMutation(db, {
    context: runtime.actionLedgerContext,
    actionName: input.actionName,
    actionVersion: "v1",
    actionKind: "update",
    status: "succeeded",
    evaluatedRisk: input.evaluatedRisk ?? "medium",
    targetType: "booking",
    targetId: input.bookingId,
    routeOrToolName: input.routeOrToolName,
    capabilityId: input.capabilityId,
    capabilityVersion: "v1",
    authorizationSource: runtime.actionLedgerAuthorizationSource ?? "bookings.status.route",
    causationActionId: runtime.actionLedgerCausationActionId ?? null,
    approvalId: runtime.actionLedgerApprovalId ?? null,
    idempotencyScope: runtime.actionLedgerIdempotencyScope ?? null,
    idempotencyKey: runtime.actionLedgerIdempotencyKey ?? null,
    idempotencyFingerprint: runtime.actionLedgerIdempotencyFingerprint ?? null,
    mutationDetail: {
      commandInputRef: `booking:${input.bookingId}:status:${input.toStatus}`,
      commandResultRef: `booking:${input.bookingId}`,
      summary: `Booking status changed from ${input.fromStatus} to ${input.toStatus}`,
      reversalKind: "none",
    },
  })
}

/**
 * Payload shape for `availability.slot.changed`. Mirrors the canonical
 * `AvailabilitySlotChangedEvent` from `@voyant-travel/operations` — defined
 * locally to avoid a runtime dep on operations (we already mirror its
 * schema via `availabilitySlotsRef` for the same reason). Subscribers
 * (e.g. channel-push) can import the canonical type directly.
 *
 * Per docs/architecture/channel-push-architecture.md §5.1.
 */
export interface AvailabilitySlotChangedEventPayload {
  slotId: string
  productId: string
  optionId: string | null
  startsAt: Date | string
  remainingPax: number | null
  unlimited: boolean
  source: "booking" | "cancel" | "expire" | "modify" | "manual" | "refresh"
}

/** Stable string identifier for the event. */
export const AVAILABILITY_SLOT_CHANGED_EVENT = "availability.slot.changed" as const

/**
 * Emit a batch of slot-change events through the runtime's EventBus.
 * No-op when no event bus is wired (the common test path). Each emit is
 * fire-and-forget per the EventBus contract — subscriber errors are
 * logged, not rethrown — but we await to keep ordering deterministic in
 * tests that drain the bus before assertions.
 */
async function emitSlotChanges(
  runtime: BookingServiceRuntime,
  changes: ReadonlyArray<AvailabilitySlotChangedEventPayload>,
): Promise<void> {
  const eventBus = runtime.eventBus
  if (!eventBus || changes.length === 0) return
  for (const change of changes) {
    await eventBus.emit(AVAILABILITY_SLOT_CHANGED_EVENT, change, {
      category: "domain",
      source: "service",
    })
  }
}

/**
 * Payload shape for `booking.confirmed`. Subscribers should treat unknown
 * fields as forward-compatible additions.
 */
export interface BookingConfirmedEvent {
  bookingId: string
  bookingNumber: string
  actorId: string | null
  /**
   * When true, customer-facing notification subscribers (e.g. the
   * notifications module's `autoConfirmAndDispatch`) should skip
   * dispatch for this event. Set by callers that want to confirm a
   * booking silently — e.g. operator-side data correction or
   * confirming a booking on behalf of a customer who's already been
   * notified out-of-band.
   */
  suppressNotifications?: boolean
}

/**
 * Payload for `booking.cancelled`. `previousStatus` is the state the booking
 * transitioned *out of* — useful for subscribers that care about cancelling a
 * confirmed booking (refund flow) vs cancelling a draft/hold (no side effects).
 */
export interface BookingCancelledEvent {
  bookingId: string
  bookingNumber: string
  previousStatus: "draft" | "on_hold" | "awaiting_payment" | "confirmed" | "in_progress"
  reason?: string | null
  actorId: string | null
  suppressNotifications?: boolean
}

/**
 * Payload for `booking.expired`. Fires when an on-hold booking's timer runs
 * out. `cause` flags whether it was the explicit route call or the sweep job —
 * subscribers that want to email the customer should probably skip
 * sweep-originated events to avoid pager noise during backfills.
 */
export interface BookingExpiredEvent {
  bookingId: string
  bookingNumber: string
  cause: "route" | "sweep"
  actorId: string | null
}

/** Payload for `booking.started` — confirmed → in_progress. */
export interface BookingStartedEvent {
  bookingId: string
  bookingNumber: string
  actorId: string | null
}

/** Payload for `booking.completed` — in_progress → completed. */
export interface BookingCompletedEvent {
  bookingId: string
  bookingNumber: string
  actorId: string | null
}

/**
 * Payload for `booking.status_overridden`. Fires when an admin bypasses the
 * transition graph. Subscribers should treat this as a privileged audit signal
 * distinct from the normal lifecycle events — e.g. compliance dashboards.
 */
export interface BookingStatusOverriddenEvent {
  bookingId: string
  bookingNumber: string
  fromStatus: BookingStatus
  toStatus: BookingStatus
  reason: string
  actorId: string | null
}

export interface BookingTravelerSharingGroupMember {
  id: string
  bookingId: string
  bookingNumber: string
  participantType: string
  travelerCategory: string | null
  personId: string | null
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  preferredLanguage: string | null
  specialRequests: string | null
  isPrimary: boolean
  notes: string | null
  isLeadTraveler: boolean
  sharingGroupId: string
  roomTypeId: string | null
  bedPreference: string | null
  allocations: Record<string, string>
  createdAt: Date
  updatedAt: Date
}

export interface BookingTravelerSharingGroupSummary {
  id: string
  label: string
  occupancy: number
  roomTypeId: string | null
  bookingIds: string[]
}

const travelerParticipantTypes = ["traveler", "occupant"] as const
type TravelerParticipantType = (typeof travelerParticipantTypes)[number]
const sharingGroupBookingStatuses = [
  "draft",
  "on_hold",
  "confirmed",
  "in_progress",
  "completed",
] as const
const sharingGroupAllocationStatuses = ["held", "confirmed", "fulfilled"] as const

class BookingServiceError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code)
    this.name = "BookingServiceError"
  }
}

function toTimestamp(value?: string | null) {
  return value ? new Date(value) : null
}

function confirmedAtForStatus(status: BookingStatus, value: Date | null, now = new Date()) {
  if (status !== "confirmed") return null
  return value ?? now
}

function confirmedAtForBookingUpdate(
  currentStatus: BookingStatus,
  data: UpdateBookingInput,
  now = new Date(),
) {
  const nextStatus = data.status ?? currentStatus
  if (nextStatus !== "confirmed") return null
  if (data.confirmedAt !== undefined)
    return confirmedAtForStatus(nextStatus, toTimestamp(data.confirmedAt), now)
  return currentStatus === "confirmed" ? undefined : now
}

function toDateValue(value: Date | string) {
  return value instanceof Date ? value : new Date(value)
}

function toDateValueOrNull(value: Date | string | null) {
  if (!value) return null
  return value instanceof Date ? value : new Date(value)
}

function isPaxParticipantType(value: string): value is TravelerParticipantType {
  return travelerParticipantTypes.includes(value as TravelerParticipantType)
}

function toTravelerResponse(participant: typeof bookingTravelers.$inferSelect) {
  return {
    id: participant.id,
    bookingId: participant.bookingId,
    participantType: participant.participantType,
    travelerCategory: participant.travelerCategory,
    firstName: participant.firstName,
    lastName: participant.lastName,
    email: participant.email,
    phone: participant.phone,
    preferredLanguage: participant.preferredLanguage,
    specialRequests: participant.specialRequests,
    isPrimary: participant.isPrimary,
    notes: participant.notes,
    createdAt: participant.createdAt,
    updatedAt: participant.updatedAt,
  }
}

function normalizeTravelerAllocationMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  const out: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string") out[key] = raw
  }
  return out
}

async function ensureParticipantFlags(
  db: PostgresJsDatabase,
  bookingId: string,
  travelerId: string,
  data: { isPrimary?: boolean | null },
) {
  if (data.isPrimary) {
    await db
      .update(bookingTravelers)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(and(eq(bookingTravelers.bookingId, bookingId), ne(bookingTravelers.id, travelerId)))
  }
}

async function recomputeBookingPaxFromTravelers(db: PostgresJsDatabase, bookingId: string) {
  const [row] = await db
    .select({ pax: sql<number>`count(*)::int` })
    .from(bookingTravelers)
    .where(
      and(
        eq(bookingTravelers.bookingId, bookingId),
        inArray(bookingTravelers.participantType, [...travelerParticipantTypes]),
      ),
    )

  const pax = row?.pax ?? 0
  await db
    .update(bookings)
    .set({ pax: pax > 0 ? pax : null, updatedAt: new Date() })
    .where(eq(bookings.id, bookingId))
}

async function assignTravelerToExistingBookingItems(
  db: PostgresJsDatabase,
  bookingId: string,
  traveler: Pick<typeof bookingTravelers.$inferSelect, "id" | "participantType" | "isPrimary">,
) {
  if (!isPaxParticipantType(traveler.participantType)) return

  const items = await db
    .select({ id: bookingItems.id })
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, bookingId))

  if (items.length === 0) return

  const itemIds = items.map((item) => item.id)
  if (traveler.isPrimary) {
    await db
      .update(bookingItemTravelers)
      .set({ isPrimary: false })
      .where(inArray(bookingItemTravelers.bookingItemId, itemIds))
  }

  await db.insert(bookingItemTravelers).values(
    items.map((item) => ({
      bookingItemId: item.id,
      travelerId: traveler.id,
      role: traveler.participantType,
      isPrimary: traveler.isPrimary,
    })),
  )
}

async function ensureBookingScopedLinks(
  db: PostgresJsDatabase,
  bookingId: string,
  data: { bookingItemId?: string | null; travelerId?: string | null },
) {
  if (data.bookingItemId) {
    const [item] = await db
      .select({ id: bookingItems.id })
      .from(bookingItems)
      .where(and(eq(bookingItems.id, data.bookingItemId), eq(bookingItems.bookingId, bookingId)))
      .limit(1)

    if (!item) {
      return { ok: false as const, reason: "booking_item_not_found" as const }
    }
  }

  if (data.travelerId) {
    const [traveler] = await db
      .select({ id: bookingTravelers.id })
      .from(bookingTravelers)
      .where(
        and(eq(bookingTravelers.id, data.travelerId), eq(bookingTravelers.bookingId, bookingId)),
      )
      .limit(1)

    if (!traveler) {
      return { ok: false as const, reason: "traveler_not_found" as const }
    }
  }

  return { ok: true as const }
}

function mapDeliveryFormatToFulfillment(format: string) {
  switch (format) {
    case "pdf":
      return { fulfillmentType: "pdf" as const, deliveryChannel: "download" as const }
    case "qr_code":
      return { fulfillmentType: "qr_code" as const, deliveryChannel: "download" as const }
    case "barcode":
      return { fulfillmentType: "barcode" as const, deliveryChannel: "download" as const }
    case "mobile":
      return { fulfillmentType: "mobile" as const, deliveryChannel: "wallet" as const }
    case "email":
      return { fulfillmentType: "service_voucher" as const, deliveryChannel: "email" as const }
    case "ticket":
      return { fulfillmentType: "ticket" as const, deliveryChannel: "download" as const }
    default:
      return { fulfillmentType: "service_voucher" as const, deliveryChannel: "download" as const }
  }
}

async function touchBookingUpdatedAt(db: PostgresJsDatabase, bookingId: string, now = new Date()) {
  await db.update(bookings).set({ updatedAt: now }).where(eq(bookings.id, bookingId))
}

async function getConvertProductData(
  db: PostgresJsDatabase,
  data: ConvertProductInput,
): Promise<ConvertProductData | null> {
  const [product] = await db
    .select()
    .from(productsRef)
    .where(eq(productsRef.id, data.productId))
    .limit(1)

  if (!product) {
    return null
  }

  const itemLines = data.itemLines ?? []
  const requestedLineOptionIds = [
    ...new Set(
      itemLines
        .map((line) => line.optionId ?? null)
        .filter((optionId): optionId is string => optionId !== null),
    ),
  ]
  const requestedUnitIds = [...new Set(itemLines.map((line) => line.optionUnitId))]
  let lineOptions: ProductOptionReference[] = []
  if (requestedLineOptionIds.length > 0) {
    lineOptions = await db
      .select()
      .from(productOptionsRef)
      .where(
        and(
          eq(productOptionsRef.productId, product.id),
          inArray(productOptionsRef.id, requestedLineOptionIds),
        ),
      )

    if (lineOptions.length !== requestedLineOptionIds.length) {
      return null
    }
  }

  let option: ProductOptionReference | null = null
  if (data.optionId) {
    const [selectedOption] = await db
      .select()
      .from(productOptionsRef)
      .where(
        and(eq(productOptionsRef.id, data.optionId), eq(productOptionsRef.productId, product.id)),
      )
      .limit(1)

    if (!selectedOption) {
      return null
    }

    option = selectedOption
  } else if (requestedLineOptionIds.length === 1) {
    option = lineOptions[0] ?? null
  } else if (requestedLineOptionIds.length > 1) {
    option = null
  } else {
    const [defaultOption] = await db
      .select()
      .from(productOptionsRef)
      .where(eq(productOptionsRef.productId, product.id))
      .orderBy(
        desc(productOptionsRef.isDefault),
        asc(productOptionsRef.sortOrder),
        asc(productOptionsRef.createdAt),
      )
      .limit(1)

    option = defaultOption ?? null
  }

  // product_days is keyed by itinerary_id (products re-parented days onto
  // product_itineraries); getConvertProductData joins through the itinerary
  // ref so the per-product day lookup still works for converts that want to
  // seed booking supplier statuses from the product's day services.
  const days = await db
    .select({ id: productDaysRef.id, dayNumber: productDaysRef.dayNumber })
    .from(productDaysRef)
    .innerJoin(productItinerariesRef, eq(productDaysRef.itineraryId, productItinerariesRef.id))
    .where(eq(productItinerariesRef.productId, product.id))
    .orderBy(asc(productDaysRef.dayNumber))

  const dayServices = days.length
    ? await db
        .select({
          supplierServiceId: productDayServicesRef.supplierServiceId,
          name: productDayServicesRef.name,
          costCurrency: productDayServicesRef.costCurrency,
          costAmountCents: productDayServicesRef.costAmountCents,
        })
        .from(productDayServicesRef)
        .where(
          // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
          sql`${productDayServicesRef.dayId} IN (
            SELECT ${productDaysRef.id}
            FROM ${productDaysRef}
            INNER JOIN ${productItinerariesRef}
              ON ${productDaysRef.itineraryId} = ${productItinerariesRef.id}
            WHERE ${productItinerariesRef.productId} = ${product.id}
          )`,
        )
        .orderBy(asc(productDayServicesRef.sortOrder), asc(productDayServicesRef.id))
    : []

  let units: OptionUnitReference[] = []
  if (requestedUnitIds.length > 0) {
    const unitRows = await db
      .select({ unit: optionUnitsRef })
      .from(optionUnitsRef)
      .innerJoin(productOptionsRef, eq(optionUnitsRef.optionId, productOptionsRef.id))
      .where(
        and(
          eq(productOptionsRef.productId, product.id),
          inArray(optionUnitsRef.id, requestedUnitIds),
        ),
      )
      .orderBy(asc(optionUnitsRef.sortOrder), asc(optionUnitsRef.createdAt))

    units = unitRows.map((row) => row.unit)
  } else if (option !== null) {
    units = await db
      .select()
      .from(optionUnitsRef)
      .where(eq(optionUnitsRef.optionId, option.id))
      .orderBy(asc(optionUnitsRef.sortOrder), asc(optionUnitsRef.createdAt))
  }

  let slot: ConvertProductData["slot"] = null
  if (data.slotId) {
    const [selectedSlot] = await db
      .select()
      .from(availabilitySlotsRef)
      .where(
        and(
          eq(availabilitySlotsRef.id, data.slotId),
          eq(availabilitySlotsRef.productId, product.id),
        ),
      )
      .limit(1)

    if (!selectedSlot) {
      return null
    }

    if (option && selectedSlot.optionId && selectedSlot.optionId !== option.id) {
      return null
    }
    // Note: per-line `optionId` is intentionally NOT required to match
    // `selectedSlot.optionId`. A slot's `option_id` marks which option
    // owns the slot's per-unit allocation tracking; other options on the
    // same product are still bookable on the same departure (e.g. a
    // tour-operator bus + hotel allotment selling SGL/DBL/TWN/TPL on one
    // slot). Line options are validated to live on the product above
    // (the `lineOptions.length !== requestedLineOptionIds.length` guard),
    // and `adjustSlotCapacity` enforces total pax server-side at booking
    // time. See issue #960.

    slot = {
      id: selectedSlot.id,
      dateLocal: selectedSlot.dateLocal,
      startsAt: selectedSlot.startsAt,
      endsAt: selectedSlot.endsAt,
      timezone: selectedSlot.timezone,
    }
  }

  return {
    product: {
      id: product.id,
      name: product.name,
      description: product.description,
      sellCurrency: product.sellCurrency,
      sellAmountCents: product.sellAmountCents,
      costAmountCents: product.costAmountCents,
      marginPercent: product.marginPercent,
      startDate: product.startDate,
      endDate: product.endDate,
      pax: product.pax,
    },
    option: option ? { id: option.id, name: option.name } : null,
    slot,
    dayServices,
    units: units.map((unit) => ({
      id: unit.id,
      optionId: unit.optionId,
      name: unit.name,
      description: unit.description,
      unitType: unit.unitType,
      isRequired: unit.isRequired,
      minQuantity: unit.minQuantity,
      sortOrder: unit.sortOrder,
    })),
  }
}

const DEFAULT_HOLD_MINUTES = 30

function positiveHoldMinutes(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null
}

function isUndefinedTableError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "42P01"
  )
}

/**
 * Catalog enrichment for a booking item, taken at item-create time so
 * the snapshot is authoritative. Each lookup is independently
 * try/catch'd so a missing catalog/availability table (catalog-less
 * OTA deployment) just yields `null` for that piece — the caller's
 * explicit values still win.
 */
async function resolveBookingItemSnapshot(
  db: PostgresJsDatabase,
  input: {
    productId: string | null
    optionId: string | null
    optionUnitId: string | null
    availabilitySlotId: string | null
  },
): Promise<{
  productName: string | null
  optionName: string | null
  unitName: string | null
  departureLabel: string | null
  startsAt: Date | null
  endsAt: Date | null
  serviceDate: string | null
}> {
  const result = {
    productName: null as string | null,
    optionName: null as string | null,
    unitName: null as string | null,
    departureLabel: null as string | null,
    startsAt: null as Date | null,
    endsAt: null as Date | null,
    serviceDate: null as string | null,
  }

  if (input.productId) {
    try {
      const [row] = await db
        .select({ name: productsRef.name })
        .from(productsRef)
        .where(eq(productsRef.id, input.productId))
        .limit(1)
      if (row) result.productName = row.name
    } catch (error) {
      if (!isUndefinedTableError(error)) throw error
    }
  }

  if (input.optionId) {
    try {
      const [row] = await db
        .select({ name: productOptionsRef.name })
        .from(productOptionsRef)
        .where(eq(productOptionsRef.id, input.optionId))
        .limit(1)
      if (row) result.optionName = row.name
    } catch (error) {
      if (!isUndefinedTableError(error)) throw error
    }
  }

  if (input.optionUnitId) {
    try {
      const [row] = await db
        .select({ name: optionUnitsRef.name })
        .from(optionUnitsRef)
        .where(eq(optionUnitsRef.id, input.optionUnitId))
        .limit(1)
      if (row) result.unitName = row.name
    } catch (error) {
      if (!isUndefinedTableError(error)) throw error
    }
  }

  if (input.availabilitySlotId) {
    try {
      const [slot] = await db
        .select({
          startsAt: availabilitySlotsRef.startsAt,
          endsAt: availabilitySlotsRef.endsAt,
          dateLocal: availabilitySlotsRef.dateLocal,
          timezone: availabilitySlotsRef.timezone,
        })
        .from(availabilitySlotsRef)
        .where(eq(availabilitySlotsRef.id, input.availabilitySlotId))
        .limit(1)
      if (slot) {
        result.startsAt = slot.startsAt
        result.endsAt = slot.endsAt
        result.serviceDate = slot.dateLocal
        result.departureLabel = formatDepartureLabel(slot.startsAt, slot.timezone)
      }
    } catch (error) {
      if (!isUndefinedTableError(error)) throw error
    }
  }

  return result
}

function formatDepartureLabel(startsAt: Date | null, timezone: string | null): string | null {
  if (!startsAt) return null
  try {
    const formatter = new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone ?? undefined,
      timeZoneName: timezone ? "short" : undefined,
    })
    return formatter.format(startsAt)
  } catch {
    return startsAt.toISOString()
  }
}

async function resolvePolicyHoldMinutes(
  db: PostgresJsDatabase,
  items: ReadonlyArray<{
    productId?: string | null
    availabilitySlotId?: string | null
    slotId?: string | null
  }>,
) {
  const productIds = new Set<string>()
  const slotIds = new Set<string>()

  for (const item of items) {
    if (item.productId) productIds.add(item.productId)
    const slotId = item.availabilitySlotId ?? item.slotId
    if (slotId) slotIds.add(slotId)
  }

  if (slotIds.size > 0) {
    const slotRows = await db
      .select({ productId: availabilitySlotsRef.productId })
      .from(availabilitySlotsRef)
      .where(inArray(availabilitySlotsRef.id, [...slotIds]))

    for (const slot of slotRows) {
      if (slot.productId) productIds.add(slot.productId)
    }
  }

  if (productIds.size === 0) {
    return DEFAULT_HOLD_MINUTES
  }

  const productRows = await db
    .select({
      id: productsRef.id,
      supplierId: productsRef.supplierId,
      reservationTimeoutMinutes: productsRef.reservationTimeoutMinutes,
    })
    .from(productsRef)
    .where(inArray(productsRef.id, [...productIds]))
    .catch((error: unknown) => {
      if (isUndefinedTableError(error)) return []
      throw error
    })

  const supplierIds = [
    ...new Set(productRows.map((product) => product.supplierId).filter(Boolean) as string[]),
  ]
  const supplierRows =
    supplierIds.length > 0
      ? await db
          .select({
            id: suppliersRef.id,
            reservationTimeoutMinutes: suppliersRef.reservationTimeoutMinutes,
          })
          .from(suppliersRef)
          .where(inArray(suppliersRef.id, supplierIds))
          .catch((error: unknown) => {
            if (isUndefinedTableError(error)) return []
            throw error
          })
      : []

  const supplierTimeouts = new Map(
    supplierRows.map((supplier) => [
      supplier.id,
      positiveHoldMinutes(supplier.reservationTimeoutMinutes),
    ]),
  )
  const candidates: number[] = []

  for (const product of productRows) {
    const productMinutes = positiveHoldMinutes(product.reservationTimeoutMinutes)
    if (productMinutes !== null) {
      candidates.push(productMinutes)
      continue
    }

    const supplierMinutes = product.supplierId ? supplierTimeouts.get(product.supplierId) : null
    if (supplierMinutes !== null && supplierMinutes !== undefined) {
      candidates.push(supplierMinutes)
    }
  }

  return candidates.length > 0 ? Math.min(...candidates) : DEFAULT_HOLD_MINUTES
}

async function listBookingItemsForSummaries(db: PostgresJsDatabase, bookingIds: string[]) {
  if (bookingIds.length === 0) return []

  // `productName` prefers the snapshot (authoritative — what was sold)
  // and falls back to the current catalog name only when the snapshot
  // is missing (legacy rows pre-dating the snapshot columns). Same
  // catalog-less fallback as before via the 42P01 catch.
  return db
    .select({
      id: bookingItems.id,
      bookingId: bookingItems.bookingId,
      title: bookingItems.title,
      itemType: bookingItems.itemType,
      productId: bookingItems.productId,
      productName: sql<
        string | null
      >`coalesce(${bookingItems.productNameSnapshot}, ${productsRef.name})`,
      startsAt: bookingItems.startsAt,
      endsAt: bookingItems.endsAt,
    })
    .from(bookingItems)
    .leftJoin(productsRef, eq(productsRef.id, bookingItems.productId))
    .where(inArray(bookingItems.bookingId, bookingIds))
    .orderBy(asc(bookingItems.createdAt))
    .catch(async (error: unknown) => {
      if (!isUndefinedTableError(error)) throw error

      return db
        .select({
          id: bookingItems.id,
          bookingId: bookingItems.bookingId,
          title: bookingItems.title,
          itemType: bookingItems.itemType,
          productId: bookingItems.productId,
          productName: bookingItems.productNameSnapshot,
          startsAt: bookingItems.startsAt,
          endsAt: bookingItems.endsAt,
        })
        .from(bookingItems)
        .where(inArray(bookingItems.bookingId, bookingIds))
        .orderBy(asc(bookingItems.createdAt))
    })
}

async function computeHoldExpiresAt(
  db: PostgresJsDatabase,
  input: { holdMinutes?: number; holdExpiresAt?: string | null },
  items: ReadonlyArray<{
    productId?: string | null
    availabilitySlotId?: string | null
    slotId?: string | null
  }> = [],
) {
  if (input.holdExpiresAt) {
    return new Date(input.holdExpiresAt)
  }
  const minutes = input.holdMinutes ?? (await resolvePolicyHoldMinutes(db, items))
  return new Date(Date.now() + minutes * 60 * 1000)
}

/**
 * Walk a booking's items, convert each line into the booking's
 * `baseCurrency` via the booking's `fxRateSetId`, sum.
 *
 * Returns:
 * - `{ status: "ok", baseSellAmountCents, baseCostAmountCents }` when
 *   every item's currency was either already in `baseCurrency` or had
 *   a rate row in the rate set
 * - `{ status: "missing_rate", currency }` when an item's
 *   `sellCurrency` had no rate in the rate set; caller treats as
 *   "leave base totals untouched, surface to ops"
 * - `{ status: "skipped" }` when the booking has no `fxRateSetId`
 *   (multi-currency conversion isn't possible without one)
 *
 * Pure conversion math. Caller controls persistence.
 */
async function rollupBaseTotals(
  db: PostgresJsDatabase,
  bookingId: string,
  baseCurrency: string,
): Promise<
  | { status: "ok"; baseSellAmountCents: number; baseCostAmountCents: number }
  | { status: "missing_rate"; currency: string }
  | { status: "skipped" }
> {
  const [booking] = await db
    .select({ fxRateSetId: bookings.fxRateSetId })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1)
  if (!booking?.fxRateSetId) {
    return { status: "skipped" }
  }
  // Cache for the closure — TypeScript can't narrow `booking` after
  // the closure boundary, so capture the id in a local.
  const fxRateSetId = booking.fxRateSetId

  const items = await db
    .select({
      sellCurrency: bookingItems.sellCurrency,
      totalSellAmountCents: bookingItems.totalSellAmountCents,
      costCurrency: bookingItems.costCurrency,
      totalCostAmountCents: bookingItems.totalCostAmountCents,
    })
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, bookingId))

  // Cache rates we look up to avoid N+1 within one booking.
  const rateCache = new Map<string, number | null>() // key: `${from}->${to}`, value: decimal rate or null

  async function rate(from: string, to: string): Promise<number | null> {
    if (from === to) return 1
    const key = `${from}->${to}`
    if (rateCache.has(key)) return rateCache.get(key) ?? null
    const [direct] = await db
      .select({ rate: exchangeRatesRef.rateDecimal })
      .from(exchangeRatesRef)
      .where(
        and(
          eq(exchangeRatesRef.fxRateSetId, fxRateSetId),
          eq(exchangeRatesRef.baseCurrency, from),
          eq(exchangeRatesRef.quoteCurrency, to),
        ),
      )
      .limit(1)
    if (direct) {
      const value = Number.parseFloat(direct.rate)
      rateCache.set(key, value)
      return value
    }
    // Try the inverse
    const [inverse] = await db
      .select({ rate: exchangeRatesRef.inverseRateDecimal })
      .from(exchangeRatesRef)
      .where(
        and(
          eq(exchangeRatesRef.fxRateSetId, fxRateSetId),
          eq(exchangeRatesRef.baseCurrency, to),
          eq(exchangeRatesRef.quoteCurrency, from),
        ),
      )
      .limit(1)
    if (inverse?.rate) {
      const value = Number.parseFloat(inverse.rate)
      rateCache.set(key, value)
      return value
    }
    rateCache.set(key, null)
    return null
  }

  let baseSellAmountCents = 0
  let baseCostAmountCents = 0

  for (const item of items) {
    if (item.totalSellAmountCents !== null) {
      const r = await rate(item.sellCurrency, baseCurrency)
      if (r === null) {
        return { status: "missing_rate", currency: item.sellCurrency }
      }
      baseSellAmountCents += Math.round(item.totalSellAmountCents * r)
    }
    if (item.totalCostAmountCents !== null && item.costCurrency) {
      const r = await rate(item.costCurrency, baseCurrency)
      if (r === null) {
        return { status: "missing_rate", currency: item.costCurrency }
      }
      baseCostAmountCents += Math.round(item.totalCostAmountCents * r)
    }
  }

  return { status: "ok", baseSellAmountCents, baseCostAmountCents }
}

async function lockAvailabilitySlot(db: PostgresJsDatabase, slotId: string) {
  const rows = await db.execute(
    sql`SELECT id, product_id, option_id, date_local, starts_at, ends_at, timezone, status, unlimited, remaining_pax
        FROM ${availabilitySlotsRef}
        WHERE ${availabilitySlotsRef.id} = ${slotId}
        FOR UPDATE`,
  )

  const row = toRows<{
    id: string
    product_id: string
    option_id: string | null
    date_local: string
    starts_at: Date
    ends_at: Date | null
    timezone: string
    status: string
    unlimited: boolean
    remaining_pax: number | null
  }>(rows)[0]

  if (!row) {
    return null
  }

  return {
    ...row,
    starts_at: toDateValue(row.starts_at),
    ends_at: toDateValueOrNull(row.ends_at),
  }
}

type SlotChangeSource = AvailabilitySlotChangedEventPayload["source"]

function buildSlotChange(
  slot: {
    id: string
    product_id: string
    option_id: string | null
    starts_at: Date | string
    unlimited: boolean
  },
  remainingPax: number | null,
  source: SlotChangeSource,
): AvailabilitySlotChangedEventPayload {
  return {
    slotId: slot.id,
    productId: slot.product_id,
    optionId: slot.option_id,
    startsAt: slot.starts_at,
    remainingPax: slot.unlimited ? null : remainingPax,
    unlimited: slot.unlimited,
    source,
  }
}

async function adjustSlotCapacity(
  db: PostgresJsDatabase,
  slotId: string,
  delta: number,
  source: SlotChangeSource = "booking",
  options: { allowTerminalCapacityRelease?: boolean } = {},
) {
  const locked = await lockAvailabilitySlot(db, slotId)
  if (!locked) {
    return { status: "slot_not_found" as const }
  }

  const terminalCapacityRelease =
    options.allowTerminalCapacityRelease === true &&
    (locked.status === "closed" || locked.status === "cancelled") &&
    delta >= 0
  if (locked.status !== "open" && locked.status !== "sold_out" && !terminalCapacityRelease) {
    return { status: "slot_unavailable" as const, slot: locked }
  }

  // A cancelled departure is terminal: freeing a booking must not reopen it
  // or require a capacity mutation that no longer has operational meaning.
  if (locked.status === "cancelled" && terminalCapacityRelease) {
    return {
      status: "ok" as const,
      slot: locked,
      remainingPax: locked.remaining_pax,
      slotChange: undefined,
    }
  }

  if (locked.unlimited) {
    return {
      status: "ok" as const,
      slot: locked,
      remainingPax: locked.remaining_pax,
      slotChange: buildSlotChange(locked, locked.remaining_pax, source),
    }
  }

  const currentRemaining = locked.remaining_pax ?? 0
  const nextRemaining = currentRemaining + delta

  if (nextRemaining < 0) {
    return {
      status: "insufficient_capacity" as const,
      slot: locked,
      remainingPax: currentRemaining,
    }
  }

  let nextStatus = locked.status as "open" | "closed" | "sold_out" | "cancelled"
  if (nextRemaining === 0 && locked.status === "open") {
    nextStatus = "sold_out"
  } else if (nextRemaining > 0 && locked.status === "sold_out") {
    nextStatus = "open"
  }

  await db
    .update(availabilitySlotsRef)
    .set({
      remainingPax: nextRemaining,
      status: nextStatus,
      updatedAt: new Date(),
    })
    .where(eq(availabilitySlotsRef.id, slotId))

  return {
    status: "ok" as const,
    slot: locked,
    remainingPax: nextRemaining,
    slotChange: buildSlotChange(locked, nextRemaining, source),
  }
}

interface AvailabilityHoldConversion {
  id: string
  holdToken: string
  paxCount: number
}

async function prepareAvailabilityHoldConversion(
  db: PostgresJsDatabase,
  input: { holdToken: string; productId: string; slotId: string },
): Promise<AvailabilityHoldConversion | null> {
  const holds = await db
    .select()
    .from(availabilityHoldsRef)
    .where(
      and(
        eq(availabilityHoldsRef.holdToken, input.holdToken),
        isNull(availabilityHoldsRef.releasedAt),
        isNull(availabilityHoldsRef.convertedAt),
      ),
    )
    .orderBy(asc(availabilityHoldsRef.slotId), asc(availabilityHoldsRef.createdAt))
    .for("update")

  if (holds.length === 0) return null

  const now = new Date()
  const canonical =
    holds.find(
      (hold) =>
        hold.productId === input.productId &&
        hold.slotId === input.slotId &&
        hold.expiresAt.getTime() > now.getTime(),
    ) ?? null
  const releases = canonical ? holds.filter((hold) => hold.id !== canonical.id) : holds

  if (releases.length > 0) {
    const paxBySlot = new Map<string, number>()
    for (const hold of releases) {
      paxBySlot.set(hold.slotId, (paxBySlot.get(hold.slotId) ?? 0) + hold.paxCount)
    }
    for (const [slotId, paxCount] of paxBySlot) {
      const restored = await adjustSlotCapacity(db, slotId, paxCount, "booking")
      if (restored.status !== "ok") {
        throw new BookingServiceError(restored.status)
      }
    }
    await db
      .update(availabilityHoldsRef)
      .set({ releasedAt: now, updatedAt: now })
      .where(
        inArray(
          availabilityHoldsRef.id,
          releases.map((hold) => hold.id),
        ),
      )
  }

  return canonical
    ? { id: canonical.id, holdToken: canonical.holdToken, paxCount: canonical.paxCount }
    : null
}

/**
 * Per-resource capacity check used when a traveler is being assigned
 * to one or more allocation_resources via `travelDetails.allocations`.
 *
 * The slot-level pax check (`adjustSlotCapacity`) only enforces total
 * pax against `availability_slots.remaining_pax` — it cannot tell
 * that a request fits in the slot's room total but oversells the DBL
 * bucket. This helper walks each requested (kind, resourceId) pair,
 * loads the resource, and counts other travelers already assigned to
 * it across live bookings on the same slot. If the new traveler would
 * push that count above the resource's `capacity`, we throw
 * `resource_capacity_exhausted` citing the offending resource so
 * the caller can surface a useful error to the client.
 *
 * Implemented with raw SQL because @voyant-travel/bookings deliberately
 * has no runtime dep on @voyant-travel/operations (see the module-
 * decoupling notes in CLAUDE.md / MEMORY.md). The schema is stable —
 * `allocation_resources` and `booking_traveler_travel_details.allocations`
 * are migration-frozen.
 */
export interface BookingResourceCapacityViolation {
  slotId: string
  resourceId: string
  kind: string
  capacity: number
  existingAssigned: number
}

type AllocationResourceLockRow = {
  id: string
  kind: string
  capacity: number
  slot_id: string
}

function parseAllocationResourceLockRow(row: Record<string, unknown>): AllocationResourceLockRow {
  if (
    typeof row.id !== "string" ||
    typeof row.kind !== "string" ||
    typeof row.capacity !== "number" ||
    typeof row.slot_id !== "string"
  ) {
    throw new Error("allocation resource lock query returned an unexpected row shape")
  }
  return {
    id: row.id,
    kind: row.kind,
    capacity: row.capacity,
    slot_id: row.slot_id,
  }
}

/**
 * Exported for unit tests — production callers go through
 * `assertResourceCapacityForAllocations` /
 * `persistTravelDetailsWithCapacityCheck` below.
 */
export async function loadResourceCapacityViolations(
  db: PostgresJsDatabase,
  travelerId: string,
  allocations: Record<string, string>,
): Promise<BookingResourceCapacityViolation[]> {
  const entries = Object.entries(allocations ?? {}).filter(
    ([kind, resourceId]) => kind && resourceId,
  )
  if (entries.length === 0) return []

  const resourceIds = entries.map(([, resourceId]) => resourceId)
  // Lock the targeted allocation_resources rows so concurrent
  // assignments to the same resource serialise — otherwise two
  // requests can both see one seat free and both write, leaving the
  // resource over capacity. The caller is responsible for invoking
  // this inside a transaction; outside one this lock degrades to a
  // single-statement no-op which is the same race we had before.
  const resources = await db.execute(sql`
    SELECT id, kind, capacity, slot_id
    FROM allocation_resources
    WHERE id = ANY(${sqlTextArray(resourceIds)})
    FOR UPDATE
  `)
  const resourceList = Array.from(resources, parseAllocationResourceLockRow)

  const resourceById = new Map(resourceList.map((row) => [row.id, row]))

  // Entries whose resource exists under the requested kind need a traveler
  // count; the rest (missing resource / kind mismatch) are violations
  // outright and never had a count in the per-resource form either.
  const countedChecks: Array<{ kind: string; resourceId: string; slotId: string }> = []
  for (const [kind, resourceId] of entries) {
    const resource = resourceById.get(resourceId)
    if (resource && resource.kind === kind) {
      countedChecks.push({ kind, resourceId, slotId: resource.slot_id })
    }
  }

  // ONE grouped count for all checked (kind, resource) pairs. `kind` varies
  // per entry (it is the jsonb key inside `btd.allocations`), so a plain
  // GROUP BY over a static column can't express the check — instead a
  // VALUES join carries each pair's kind + resource + slot and the jsonb
  // lookup joins against it. Replaces the COUNT-per-resource loop this
  // function used to run (N round trips for N allocation entries).
  const assignedByCheck = new Map<string, number>()
  if (countedChecks.length > 0) {
    const checkTuples = sql.join(
      countedChecks.map(
        // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
        (check) => sql`(${check.kind}::text, ${check.resourceId}::text, ${check.slotId}::text)`,
      ),
      sql.raw(", "),
    )
    const counts = await db.execute(sql`
      SELECT checks.kind AS kind,
             checks.resource_id AS resource_id,
             COUNT(DISTINCT btd.traveler_id)::int AS count
      FROM (VALUES ${checkTuples}) AS checks(kind, resource_id, slot_id)
      JOIN booking_traveler_travel_details btd
        ON btd.allocations ->> checks.kind = checks.resource_id
      JOIN booking_travelers bt ON bt.id = btd.traveler_id
      JOIN booking_allocations ba
        ON ba.booking_id = bt.booking_id
       AND ba.availability_slot_id = checks.slot_id
      JOIN bookings b ON b.id = bt.booking_id
      WHERE b.status IN (${sqlValueList(BOOKING_RESOURCE_CAPACITY_STATUSES)})
        AND ba.status IN ('held', 'confirmed', 'fulfilled')
        AND btd.traveler_id <> ${travelerId}
      GROUP BY checks.kind, checks.resource_id
    `)
    for (const row of toRows<{ kind: string; resource_id: string; count: number | null }>(counts)) {
      assignedByCheck.set(`${row.kind}\u0000${row.resource_id}`, row.count ?? 0)
    }
  }

  const violations: BookingResourceCapacityViolation[] = []
  for (const [kind, resourceId] of entries) {
    const resource = resourceById.get(resourceId)
    if (!resource) {
      violations.push({
        slotId: "",
        resourceId,
        kind,
        capacity: 0,
        existingAssigned: 0,
      })
      continue
    }
    if (resource.kind !== kind) {
      violations.push({
        slotId: resource.slot_id,
        resourceId,
        kind,
        capacity: resource.capacity,
        existingAssigned: 0,
      })
      continue
    }

    // Pairs with no live assignments produce no group row — that is the
    // zero count, same as the old per-resource COUNT returning 0.
    const existingAssigned = assignedByCheck.get(`${kind}\u0000${resourceId}`) ?? 0
    if (existingAssigned + 1 > resource.capacity) {
      violations.push({
        slotId: resource.slot_id,
        resourceId,
        kind,
        capacity: resource.capacity,
        existingAssigned,
      })
    }
  }
  return violations
}

async function assertResourceCapacityForAllocations(
  db: PostgresJsDatabase,
  travelerId: string,
  allocations: Record<string, string> | undefined | null,
): Promise<void> {
  if (!allocations) return
  const violations = await loadResourceCapacityViolations(db, travelerId, allocations)
  if (violations.length > 0) {
    throw new BookingServiceError(
      "resource_capacity_exhausted",
      `Allocation resource over capacity: ${violations
        .map((v) => `${v.kind}=${v.resourceId} (cap ${v.capacity}, assigned ${v.existingAssigned})`)
        .join(", ")}`,
    )
  }
}

/**
 * Lock the targeted resource rows, validate, and write in one
 * transaction so two concurrent assignments to the last seat in a
 * resource cannot both pass a stale capacity check. When there are no
 * allocations to enforce, we skip the wrapping transaction entirely —
 * avoids the round trip for the common path and keeps the unit-test
 * mocks (which don't stub `db.transaction`) working unchanged.
 */
async function persistTravelDetailsWithCapacityCheck(
  db: PostgresJsDatabase,
  travelerId: string,
  input: UpsertBookingTravelerTravelDetailInput,
  opts: { pii: BookingPiiService; actorId?: string | null },
) {
  const allocations = input.allocations
  const hasAllocations =
    allocations != null && Object.values(allocations).some((value) => Boolean(value))

  if (!hasAllocations) {
    return opts.pii.upsertTravelerTravelDetails(db, travelerId, input, opts.actorId)
  }

  return db.transaction(async (tx) => {
    await assertResourceCapacityForAllocations(tx as PostgresJsDatabase, travelerId, allocations)
    return opts.pii.upsertTravelerTravelDetails(
      tx as PostgresJsDatabase,
      travelerId,
      input,
      opts.actorId,
    )
  })
}

async function releaseAllocationCapacity(
  db: PostgresJsDatabase,
  allocation: Pick<
    typeof bookingAllocations.$inferSelect,
    "availabilitySlotId" | "bookingId" | "quantity" | "status" | "id"
  >,
  source: SlotChangeSource = "cancel",
): Promise<AvailabilitySlotChangedEventPayload | undefined> {
  if (!allocation.availabilitySlotId) {
    return undefined
  }

  if (!allocationStatusConsumesSlotCapacity(allocation.status)) {
    return undefined
  }

  const result = await adjustSlotCapacity(
    db,
    allocation.availabilitySlotId,
    allocation.quantity,
    source,
    { allowTerminalCapacityRelease: source === "cancel" || source === "expire" },
  )
  if (result.status === "slot_not_found") {
    await db.insert(bookingActivityLog).values({
      bookingId: allocation.bookingId,
      actorId: "system",
      activityType: "system_action",
      description: "Allocation capacity release requires reconciliation: availability slot missing",
      metadata: {
        kind: "allocation_capacity_release_reconciliation",
        allocationId: allocation.id,
        availabilitySlotId: allocation.availabilitySlotId,
        source,
        problem: "slot_not_found",
      },
    })
    return undefined
  }
  if (result.status !== "ok") {
    throw new BookingServiceError(result.status)
  }
  return result.slotChange
}

async function autoIssueFulfillmentsForBooking(
  db: PostgresJsDatabase,
  bookingId: string,
  userId?: string,
) {
  const [booking] = await db
    .select({
      id: bookings.id,
      bookingNumber: bookings.bookingNumber,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1)

  if (!booking) {
    return
  }

  const existingFulfillment = await db
    .select({ id: bookingFulfillments.id })
    .from(bookingFulfillments)
    .where(eq(bookingFulfillments.bookingId, bookingId))
    .limit(1)

  if (existingFulfillment.length > 0) {
    return
  }

  const items = await db
    .select()
    .from(bookingItems)
    // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    .where(and(eq(bookingItems.bookingId, bookingId), sql`${bookingItems.productId} IS NOT NULL`))
    .orderBy(asc(bookingItems.createdAt))

  if (items.length === 0) {
    return
  }

  const productIds = [
    ...new Set(
      items.map((item) => item.productId).filter((value): value is string => Boolean(value)),
    ),
  ]
  if (productIds.length === 0) {
    return
  }

  const settings = await db
    .select()
    .from(productTicketSettingsRef)
    .where(inArray(productTicketSettingsRef.productId, productIds))

  const settingsByProductId = new Map(settings.map((setting) => [setting.productId, setting]))
  const travelerParticipants = await db
    .select()
    .from(bookingTravelers)
    .where(
      and(
        eq(bookingTravelers.bookingId, bookingId),
        or(
          eq(bookingTravelers.participantType, "traveler"),
          eq(bookingTravelers.participantType, "occupant"),
        ),
      ),
    )
    .orderBy(desc(bookingTravelers.isPrimary), asc(bookingTravelers.createdAt))

  const participantLinks = await db
    .select()
    .from(bookingItemTravelers)
    .where(
      // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      sql`${bookingItemTravelers.bookingItemId} IN (
        SELECT ${bookingItems.id}
        FROM ${bookingItems}
        WHERE ${bookingItems.bookingId} = ${bookingId}
      )`,
    )

  const participantLinksByItemId = new Map<string, typeof participantLinks>()
  for (const link of participantLinks) {
    const links = participantLinksByItemId.get(link.bookingItemId) ?? []
    links.push(link)
    participantLinksByItemId.set(link.bookingItemId, links)
  }

  const fulfillmentsToInsert: Array<typeof bookingFulfillments.$inferInsert> = []
  const now = new Date()

  for (const item of items) {
    const productId = item.productId
    if (!productId) {
      continue
    }

    const setting = settingsByProductId.get(productId)
    if (
      !setting ||
      setting.fulfillmentMode === "none" ||
      setting.defaultDeliveryFormat === "none"
    ) {
      continue
    }

    const delivery = mapDeliveryFormatToFulfillment(setting.defaultDeliveryFormat)
    const payloadBase = {
      bookingId,
      bookingNumber: booking.bookingNumber,
      productId,
      bookingItemId: item.id,
    }

    if (setting.fulfillmentMode === "per_booking") {
      if (
        fulfillmentsToInsert.some(
          (row) => row.bookingItemId === item.id || row.bookingItemId === null,
        )
      ) {
        continue
      }

      fulfillmentsToInsert.push({
        bookingId,
        bookingItemId: item.id,
        travelerId: null,
        fulfillmentType: delivery.fulfillmentType,
        deliveryChannel: delivery.deliveryChannel,
        status: "issued",
        payload: { ...payloadBase, scope: "booking" },
        issuedAt: now,
      })
      continue
    }

    if (setting.fulfillmentMode === "per_item") {
      fulfillmentsToInsert.push({
        bookingId,
        bookingItemId: item.id,
        travelerId: null,
        fulfillmentType: delivery.fulfillmentType,
        deliveryChannel: delivery.deliveryChannel,
        status: "issued",
        payload: { ...payloadBase, scope: "item" },
        issuedAt: now,
      })
      continue
    }

    const linkedParticipants =
      participantLinksByItemId
        .get(item.id)
        ?.map((link) =>
          travelerParticipants.find((participant) => participant.id === link.travelerId),
        )
        .filter((participant): participant is typeof bookingTravelers.$inferSelect =>
          Boolean(participant),
        ) ?? []

    const participantsForItem =
      linkedParticipants.length > 0 ? linkedParticipants : travelerParticipants

    for (const participant of participantsForItem) {
      fulfillmentsToInsert.push({
        bookingId,
        bookingItemId: item.id,
        travelerId: participant.id,
        fulfillmentType: delivery.fulfillmentType,
        deliveryChannel: delivery.deliveryChannel,
        status: "issued",
        payload: {
          ...payloadBase,
          travelerId: participant.id,
          scope: "participant",
        },
        issuedAt: now,
      })
    }
  }

  if (fulfillmentsToInsert.length === 0) {
    return
  }

  await db.insert(bookingFulfillments).values(fulfillmentsToInsert)

  await db.insert(bookingActivityLog).values({
    bookingId,
    actorId: userId ?? "system",
    activityType: "fulfillment_issued",
    description: `${fulfillmentsToInsert.length} fulfillment artifact(s) issued automatically`,
    metadata: { count: fulfillmentsToInsert.length },
  })
}

/**
 * Booking statuses that count as "active" for aggregate purposes (matches the
 * slot-unit-availability counting rules — cancelled and expired drop out).
 */
const AGGREGATE_ACTIVE_STATUSES: readonly BookingStatus[] = [
  "draft",
  "on_hold",
  "confirmed",
  "in_progress",
  "completed",
]

export interface BookingAggregateUpcomingDeparture {
  id: string
  bookingNumber: string | null
  status: BookingStatus
  startDate: string | null
  endDate: string | null
  pax: number | null
  sellCurrency: string | null
  sellAmountCents: number | null
}

export interface BookingAggregates {
  /** Total bookings across all statuses in range. */
  total: number
  /**
   * Sum of `pax` across active-status bookings in range. Null pax
   * rows count as zero. Used by the operator dashboard's
   * "total travelers" KPI.
   */
  totalPax: number
  /** One row per booking status (including zero counts for active statuses). */
  countsByStatus: Array<{ status: BookingStatus; count: number }>
  /** Booking counts bucketed by YYYY-MM (UTC), oldest first. */
  monthlyCounts: Array<{ yearMonth: string; count: number }>
  /**
   * Sell revenue bucketed by YYYY-MM (UTC), grouped by currency. Null currency
   * rows are dropped since a booking without a sell currency is malformed.
   */
  monthlyRevenue: Array<{ yearMonth: string; currency: string; sellAmountCents: number }>
  /**
   * Active bookings with `startDate >= today`: the total count plus a
   * bounded slice of the soonest-departing rows (default 8, max 20)
   * so the dashboard can render the upcoming list without a second
   * round-trip.
   */
  upcomingDepartures: {
    count: number
    items: BookingAggregateUpcomingDeparture[]
  }
}

/**
 * Normalize `db.execute(sql)` results across drizzle drivers.
 * `drizzle-orm/postgres-js` returns rows directly (an array); the
 * `node-postgres` + `neon-serverless` drivers (used by the operator
 * template against local pg and Neon WS respectively) wrap them in a
 * `QueryResult<T>` object with `.rows`. Casting straight to
 * `Array<T>` and indexing produced silent `undefined`s on the wrapped
 * shape — the symptom was "Booking not found" on freshly-created
 * bookings whose status-change followup hit a FOR UPDATE SELECT.
 */
function toRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows: unknown }).rows
    return Array.isArray(rows) ? (rows as T[]) : []
  }
  return []
}

const bookingsServiceInternal = {
  /**
   * Pre-aggregated dashboard numbers for the admin bookings surface. Replaces
   * the pattern of fetching a large `listBookings` page and deriving KPIs
   * client-side — which broke past the page limit and disagreed across apps
   * on which statuses count.
   *
   * All ranges are UTC-based.
   */
  async getBookingAggregates(
    db: PostgresJsDatabase,
    options: { from?: string; to?: string; upcomingLimit?: number } = {},
  ): Promise<BookingAggregates> {
    const upcomingLimit = Math.max(0, Math.min(options.upcomingLimit ?? 8, 20))
    const fromDate = options.from ? new Date(options.from) : undefined
    const toDate = options.to ? new Date(options.to) : undefined

    const rangeConditions = []
    // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    if (fromDate) rangeConditions.push(sql`${bookings.createdAt} >= ${fromDate.toISOString()}`)
    // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    if (toDate) rangeConditions.push(sql`${bookings.createdAt} < ${toDate.toISOString()}`)
    const rangeWhere = rangeConditions.length ? and(...rangeConditions) : undefined

    const todayUtc = new Date()
    todayUtc.setUTCHours(0, 0, 0, 0)
    const todayDateString = todayUtc.toISOString().slice(0, 10)

    const upcomingFilter = and(
      inArray(bookings.status, [...AGGREGATE_ACTIVE_STATUSES]),
      // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      sql`${bookings.startDate} >= ${todayDateString}`,
    )

    const [
      [totalRow],
      [totalPaxRow],
      statusRows,
      monthlyCountsRows,
      monthlyRevenueRows,
      [upcomingRow],
      upcomingItems,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(bookings).where(rangeWhere),
      db
        .select({
          totalPax: sql<number>`coalesce(sum(${bookings.pax}), 0)::bigint`,
        })
        .from(bookings)
        .where(
          and(
            ...(rangeConditions.length ? rangeConditions : []),
            inArray(bookings.status, [...AGGREGATE_ACTIVE_STATUSES]),
          ),
        ),
      db
        .select({
          status: bookings.status,
          count: sql<number>`count(*)::int`,
        })
        .from(bookings)
        .where(rangeWhere)
        .groupBy(bookings.status),
      db
        .select({
          yearMonth: sql<string>`to_char(${bookings.createdAt} at time zone 'UTC', 'YYYY-MM')`,
          count: sql<number>`count(*)::int`,
        })
        .from(bookings)
        .where(rangeWhere)
        // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
        .groupBy(sql`to_char(${bookings.createdAt} at time zone 'UTC', 'YYYY-MM')`)
        // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
        .orderBy(sql`to_char(${bookings.createdAt} at time zone 'UTC', 'YYYY-MM')`),
      db
        .select({
          yearMonth: sql<string>`to_char(${bookings.createdAt} at time zone 'UTC', 'YYYY-MM')`,
          currency: bookings.sellCurrency,
          sellAmountCents: sql<number>`coalesce(sum(${bookings.sellAmountCents}), 0)::bigint`,
        })
        .from(bookings)
        .where(
          and(
            ...(rangeConditions.length ? rangeConditions : []),
            // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
            sql`${bookings.sellAmountCents} IS NOT NULL`,
            inArray(bookings.status, [...AGGREGATE_ACTIVE_STATUSES]),
          ),
        )
        .groupBy(
          // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
          sql`to_char(${bookings.createdAt} at time zone 'UTC', 'YYYY-MM')`,
          bookings.sellCurrency,
        )
        .orderBy(
          // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
          sql`to_char(${bookings.createdAt} at time zone 'UTC', 'YYYY-MM')`,
          bookings.sellCurrency,
        ),
      db.select({ count: sql<number>`count(*)::int` }).from(bookings).where(upcomingFilter),
      upcomingLimit === 0
        ? Promise.resolve([] as BookingAggregateUpcomingDeparture[])
        : db
            .select({
              id: bookings.id,
              bookingNumber: bookings.bookingNumber,
              status: bookings.status,
              startDate: bookings.startDate,
              endDate: bookings.endDate,
              pax: bookings.pax,
              sellCurrency: bookings.sellCurrency,
              sellAmountCents: bookings.sellAmountCents,
            })
            .from(bookings)
            .where(upcomingFilter)
            .orderBy(asc(bookings.startDate), asc(bookings.id))
            .limit(upcomingLimit),
    ])

    const countsByStatusMap = new Map<BookingStatus, number>(
      statusRows.map((row) => [row.status, row.count]),
    )

    return {
      total: totalRow?.count ?? 0,
      totalPax: Number(totalPaxRow?.totalPax ?? 0),
      countsByStatus: AGGREGATE_ACTIVE_STATUSES.concat(["expired", "cancelled"]).map((status) => ({
        status,
        count: countsByStatusMap.get(status) ?? 0,
      })),
      monthlyCounts: monthlyCountsRows.map((row) => ({
        yearMonth: row.yearMonth,
        count: row.count,
      })),
      monthlyRevenue: monthlyRevenueRows.map((row) => ({
        yearMonth: row.yearMonth,
        currency: row.currency,
        sellAmountCents: Number(row.sellAmountCents),
      })),
      upcomingDepartures: {
        count: upcomingRow?.count ?? 0,
        items: upcomingItems,
      },
    }
  },

  async listBookings(db: PostgresJsDatabase, query: BookingListQuery) {
    const conditions = []

    if (query.status) {
      conditions.push(eq(bookings.status, query.status))
    }

    const excludeStatuses = query.excludeStatuses
      ? Array.isArray(query.excludeStatuses)
        ? query.excludeStatuses
        : [query.excludeStatuses]
      : []
    if (excludeStatuses.length > 0) {
      conditions.push(notInArray(bookings.status, excludeStatuses))
    }

    if (query.search) {
      const searchCondition = buildBookingSearchCondition(query.search)
      if (searchCondition) {
        conditions.push(searchCondition)
      }
    }

    if (query.personId) {
      conditions.push(eq(bookings.personId, query.personId))
    }

    if (query.organizationId) {
      conditions.push(eq(bookings.organizationId, query.organizationId))
    }

    if (query.dateFrom) {
      conditions.push(gte(bookings.startDate, query.dateFrom))
    }

    if (query.dateTo) {
      conditions.push(lte(bookings.startDate, query.dateTo))
    }

    if (query.paxMin !== undefined) {
      conditions.push(gte(bookings.pax, query.paxMin))
    }

    if (query.paxMax !== undefined) {
      conditions.push(lte(bookings.pax, query.paxMax))
    }

    if (
      query.productId ||
      query.optionId ||
      query.supplierId ||
      query.productCategoryId ||
      query.availabilitySlotId
    ) {
      const itemConditions = [eq(bookingItems.bookingId, bookings.id)]
      if (query.productId) {
        itemConditions.push(eq(bookingItems.productId, query.productId))
      }
      if (query.optionId) {
        itemConditions.push(eq(bookingItems.optionId, query.optionId))
      }
      if (query.availabilitySlotId) {
        itemConditions.push(eq(bookingItems.availabilitySlotId, query.availabilitySlotId))
      }
      if (query.supplierId) {
        itemConditions.push(
          exists(
            db
              .select({ one: sql`1` })
              .from(productsRef)
              .where(
                and(
                  eq(productsRef.id, bookingItems.productId),
                  eq(productsRef.supplierId, query.supplierId),
                ),
              ),
          ),
        )
      }
      if (query.productCategoryId) {
        itemConditions.push(
          exists(
            db
              .select({ one: sql`1` })
              .from(productCategoryProductsRef)
              .where(
                and(
                  eq(productCategoryProductsRef.productId, bookingItems.productId),
                  eq(productCategoryProductsRef.categoryId, query.productCategoryId),
                ),
              ),
          ),
        )
      }
      conditions.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(bookingItems)
            .where(and(...itemConditions)),
        ),
      )
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const sortColumn = (() => {
      switch (query.sortBy) {
        case "bookingNumber":
          return bookings.bookingNumber
        case "status":
          return bookings.status
        case "sellAmount":
          return bookings.sellAmountCents
        case "pax":
          return bookings.pax
        case "startDate":
          return bookings.startDate
        case "endDate":
          return bookings.endDate
        default:
          return bookings.createdAt
      }
    })()
    const sortFn = query.sortDir === "asc" ? asc : desc

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(bookings)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(sortFn(sortColumn), desc(bookings.createdAt)),
      db.select({ count: sql<number>`count(*)::int` }).from(bookings).where(where),
    ])
    const bookingIds = rows.map((row) => row.id)
    const items = await listBookingItemsForSummaries(db, bookingIds)

    const ranges = new Map<string, { startsAt: Date | null; endsAt: Date | null }>()
    const itemSummariesByBooking = new Map<
      string,
      Array<{
        id: string
        title: string
        itemType: string
        productId: string | null
        productName: string | null
        startsAt: string | null
        endsAt: string | null
      }>
    >()
    for (const item of items) {
      const current = ranges.get(item.bookingId) ?? { startsAt: null, endsAt: null }
      if (item.startsAt && (!current.startsAt || item.startsAt < current.startsAt)) {
        current.startsAt = item.startsAt
      }
      if (item.endsAt && (!current.endsAt || item.endsAt > current.endsAt)) {
        current.endsAt = item.endsAt
      }
      ranges.set(item.bookingId, current)

      const list = itemSummariesByBooking.get(item.bookingId) ?? []
      list.push({
        id: item.id,
        title: item.title,
        itemType: item.itemType,
        productId: item.productId,
        productName: item.productName,
        startsAt: item.startsAt?.toISOString() ?? null,
        endsAt: item.endsAt?.toISOString() ?? null,
      })
      itemSummariesByBooking.set(item.bookingId, list)
    }

    return {
      data: rows.map((row) => {
        const range = ranges.get(row.id)
        return {
          ...row,
          startsAt: range?.startsAt?.toISOString() ?? null,
          endsAt: range?.endsAt?.toISOString() ?? null,
          items: itemSummariesByBooking.get(row.id) ?? [],
        }
      }),
      total: countResult[0]?.count ?? 0,
      limit: query.limit,
      offset: query.offset,
    }
  },

  async convertProductToBooking(
    db: PostgresJsDatabase,
    data: ConvertProductInput,
    productData: ConvertProductData,
    userId?: string,
    options: { availabilityHoldToken?: string } = {},
  ) {
    const { product, option, slot, dayServices, units } = productData

    // Slot dates win over product dates so scheduled/recurring products don't
    // land with null dates. endsAt is a timestamp; fall back to the slot's
    // dateLocal when the slot has no explicit end timestamp.
    const startDate = slot?.dateLocal ?? product.startDate
    const endDate = slot
      ? slot.endsAt
        ? slot.endsAt.toISOString().slice(0, 10)
        : slot.dateLocal
      : product.endDate

    // Caller-supplied `sellAmountCentsOverride` lets the catalog booking-
    // engine pass the promotion-discounted base through to the booking
    // row so the customer is charged the post-discount amount, not the
    // product's list price. Per docs/architecture/promotions-architecture.md §7.1.
    const explicitManualPriceOverride = data.manualPriceOverride
    const confirmedSellAmountCents =
      explicitManualPriceOverride?.amountCents ?? data.confirmedSellAmountCents ?? null
    const catalogSellAmountCents = explicitManualPriceOverride
      ? product.sellAmountCents
      : (data.catalogSellAmountCents ?? product.sellAmountCents)
    const effectiveSellAmountCents =
      confirmedSellAmountCents != null
        ? confirmedSellAmountCents
        : data.sellAmountCentsOverride != null
          ? data.sellAmountCentsOverride
          : product.sellAmountCents
    const priceOverrideReason =
      explicitManualPriceOverride?.reason.trim() ?? data.priceOverrideReason?.trim() ?? null
    const isManualPriceOverride =
      confirmedSellAmountCents != null && confirmedSellAmountCents !== catalogSellAmountCents
    const priceOverride = isManualPriceOverride
      ? {
          isManual: true as const,
          originalAmountCents: catalogSellAmountCents,
          overriddenAmountCents: confirmedSellAmountCents,
          currency: product.sellCurrency,
          reason: priceOverrideReason ?? "Manual price override",
          overriddenBy: userId ?? "system",
          overriddenAt: new Date().toISOString(),
        }
      : null

    const selectedUnits =
      data.itemLines && data.itemLines.length > 0 ? units : option === null ? [] : units
    const unitById = new Map(selectedUnits.map((unit) => [unit.id, unit]))
    const requestedItemLines =
      data.itemLines
        ?.map((line) => {
          const unit = unitById.get(line.optionUnitId)
          if (!unit) return null
          if (line.optionId && line.optionId !== unit.optionId) return null
          if (data.optionId && data.optionId !== unit.optionId) return null
          return { line, unit }
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null) ?? []
    if (data.itemLines && requestedItemLines.length !== data.itemLines.length) {
      return null
    }

    const unitsToSeed =
      selectedUnits.filter((unit) => unit.isRequired).length > 0
        ? selectedUnits.filter((unit) => unit.isRequired)
        : selectedUnits.length === 1
          ? selectedUnits
          : []

    // A booking with no items reserves nothing: it holds no inventory, carries
    // no price, and cannot be invoiced. That used to be created silently
    // whenever the resolved option had several optional units and the caller
    // sent no `itemLines` — the caller got a booking id back and believed the
    // places were held. Refuse instead, before anything is written.
    if (requestedItemLines.length === 0 && unitsToSeed.length === 0) {
      throw new BookingItemsUnresolvedError(product.id, option?.id ?? null, selectedUnits.length)
    }

    const initialStatus = data.initialStatus ?? "draft"
    const bookingPax = Object.hasOwn(data, "pax") ? (data.pax ?? null) : product.pax
    // Map the booking lifecycle status onto the booking-item lifecycle.
    // Items don't have an `awaiting_payment` state — when the booking is
    // committed (confirmed / awaiting payment / in progress) the items
    // are sold, so they land in `confirmed`. Holds, cancellations,
    // expirations, and completions cascade their analog. Draft falls
    // through as draft.
    const initialItemStatus:
      | "draft"
      | "on_hold"
      | "confirmed"
      | "cancelled"
      | "expired"
      | "fulfilled" =
      initialStatus === "on_hold"
        ? "on_hold"
        : initialStatus === "confirmed" ||
            initialStatus === "in_progress" ||
            initialStatus === "awaiting_payment"
          ? "confirmed"
          : initialStatus === "cancelled"
            ? "cancelled"
            : initialStatus === "expired"
              ? "expired"
              : initialStatus === "completed"
                ? "fulfilled"
                : "draft"
    const now = new Date()
    const [booking] = await db
      .insert(bookings)
      .values({
        bookingNumber: data.bookingNumber,
        status: initialStatus,
        // Mirror the lifecycle timestamps that overrideBookingStatus
        // stamps when the status transition happens after-the-fact, so
        // a booking that lands in `confirmed` straight from create is
        // indistinguishable downstream from one that was flipped via
        // the verb endpoint.
        confirmedAt: initialStatus === "confirmed" ? now : null,
        personId: data.personId ?? null,
        organizationId: data.organizationId ?? null,
        // Billing-contact snapshot — captured at create time so the
        // booking detail page renders the right payer even if the
        // CRM person/org record changes (or is deleted) later.
        contactFirstName: data.contactFirstName ?? null,
        contactLastName: data.contactLastName ?? null,
        contactPartyType: data.contactPartyType ?? null,
        contactTaxId: data.contactTaxId ?? null,
        contactEmail: data.contactEmail ?? null,
        contactPhone: data.contactPhone ?? null,
        contactPreferredLanguage: data.contactPreferredLanguage ?? null,
        contactCountry: data.contactCountry ?? null,
        contactRegion: data.contactRegion ?? null,
        contactCity: data.contactCity ?? null,
        contactAddressLine1: data.contactAddressLine1 ?? null,
        contactAddressLine2: data.contactAddressLine2 ?? null,
        contactPostalCode: data.contactPostalCode ?? null,
        sellCurrency: product.sellCurrency,
        sellAmountCents: effectiveSellAmountCents,
        priceOverride,
        costAmountCents: product.costAmountCents,
        marginPercent: product.marginPercent,
        startDate,
        endDate,
        pax: bookingPax,
        internalNotes: data.internalNotes ?? null,
        notificationsSuppressed: data.suppressNotifications === true,
      })
      .returning()

    if (!booking) {
      return null
    }

    if (dayServices.length > 0) {
      await db.insert(bookingSupplierStatuses).values(
        dayServices.map((service) => ({
          bookingId: booking.id,
          supplierServiceId: service.supplierServiceId,
          serviceName: service.name,
          status: "pending" as const,
          costCurrency: service.costCurrency,
          costAmountCents: service.costAmountCents,
        })),
      )
    }

    // Slot-derived columns + catalog snapshot. `availabilitySlotId`
    // and `departureLabelSnapshot` carry the departure forward so the
    // booking detail page can show "Dates" without a JOIN — and the
    // snapshot survives even if the slot row is later deleted.
    // `metadata.availabilitySlotId` is kept for backwards compatibility
    // with the older write path; new readers should prefer the column.
    const slotFields = slot
      ? {
          serviceDate: slot.dateLocal,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          availabilitySlotId: slot.id,
          departureLabelSnapshot: formatDepartureLabel(slot.startsAt, slot.timezone),
          metadata: { availabilitySlotId: slot.id } as Record<string, unknown>,
        }
      : {
          availabilitySlotId: null as string | null,
          departureLabelSnapshot: null as string | null,
          metadata: null as Record<string, unknown> | null,
        }
    // Catalog snapshot shared across every item row (product + option
    // names are the same for the whole booking; the per-row unit name
    // is filled in below).
    const productOptionSnapshot = {
      productNameSnapshot: product.name,
      optionNameSnapshot: option?.name ?? null,
    } as const
    // Stamp the wire-format `clientLineKey` into the inserted item's
    // metadata so the booking-create orchestrator can find the row
    // afterward and write `booking_item_travelers` linkages. The
    // existing slot metadata (when present) is preserved.
    const itemLineMetadata = (clientLineKey: string | null | undefined) => {
      const slotMetadata = (slotFields.metadata ?? {}) as Record<string, unknown>
      return clientLineKey
        ? { ...slotMetadata, bookingCreateLineKey: clientLineKey }
        : slotFields.metadata
    }

    // Seeded line-item totals must match the booking's `sellAmountCents`
    // so checkout / payment / invoicing don't see a list-price item beneath
    // a discounted booking header.
    const itemRows =
      requestedItemLines.length > 0
        ? requestedItemLines.map(({ line, unit }) => {
            const totalSellAmountCents =
              line.totalSellAmountCents ??
              (line.unitSellAmountCents != null ? line.unitSellAmountCents * line.quantity : null)
            return {
              bookingId: booking.id,
              title: line.title?.trim() || unit.name,
              description: line.description ?? unit.description,
              itemType: "unit" as const,
              status: initialItemStatus,
              quantity: line.quantity,
              sellCurrency: product.sellCurrency,
              unitSellAmountCents: line.unitSellAmountCents ?? null,
              totalSellAmountCents,
              costCurrency: null,
              unitCostAmountCents: null,
              totalCostAmountCents: null,
              productId: product.id,
              optionId: unit.optionId,
              optionUnitId: unit.id,
              ...productOptionSnapshot,
              unitNameSnapshot: unit.name,
              ...slotFields,
              metadata: itemLineMetadata(line.clientLineKey),
            }
          })
        : unitsToSeed.length > 0
          ? unitsToSeed.map((unit, index) => {
              const quantity =
                unit.unitType === "person" && bookingPax
                  ? bookingPax
                  : unit.minQuantity && unit.minQuantity > 0
                    ? unit.minQuantity
                    : 1
              const singleSeedItem = unitsToSeed.length === 1 && index === 0
              return {
                bookingId: booking.id,
                title: unit.name,
                description: unit.description,
                itemType: "unit" as const,
                status: initialItemStatus,
                quantity,
                sellCurrency: product.sellCurrency,
                unitSellAmountCents:
                  singleSeedItem &&
                  effectiveSellAmountCents !== null &&
                  effectiveSellAmountCents !== undefined
                    ? Math.floor(effectiveSellAmountCents / quantity)
                    : null,
                totalSellAmountCents: singleSeedItem ? (effectiveSellAmountCents ?? null) : null,
                costCurrency: singleSeedItem ? product.sellCurrency : null,
                unitCostAmountCents:
                  singleSeedItem &&
                  product.costAmountCents !== null &&
                  product.costAmountCents !== undefined
                    ? Math.floor(product.costAmountCents / quantity)
                    : null,
                totalCostAmountCents: singleSeedItem ? (product.costAmountCents ?? null) : null,
                productId: product.id,
                optionId: option?.id ?? null,
                optionUnitId: unit.id,
                ...productOptionSnapshot,
                unitNameSnapshot: unit.name,
                ...slotFields,
              }
            })
          : [
              {
                bookingId: booking.id,
                title: option?.name ?? product.name,
                description: product.description,
                itemType: "unit" as const,
                status: initialItemStatus,
                quantity: 1,
                sellCurrency: product.sellCurrency,
                unitSellAmountCents: effectiveSellAmountCents ?? null,
                totalSellAmountCents: effectiveSellAmountCents ?? null,
                costCurrency: product.sellCurrency,
                unitCostAmountCents: product.costAmountCents ?? null,
                totalCostAmountCents: product.costAmountCents ?? null,
                productId: product.id,
                optionId: option?.id ?? null,
                optionUnitId: null,
                ...productOptionSnapshot,
                unitNameSnapshot: null,
                ...slotFields,
              },
            ]

    const insertedItems = await db.insert(bookingItems).values(itemRows).returning()
    // `availability_slots.remaining_pax` is passenger-denominated, and a slot
    // allocation's quantity is what gets subtracted from it. For a person-typed
    // unit the line quantity already *is* the traveller count, but for a room or
    // vehicle it is a count of units, so passing it through spent the wrong
    // currency: a 2-traveller booking on a "Double" room whose `minQuantity` is 3
    // took 3 seats off the departure. The hold-conversion branch below has always
    // used `paxCount` for exactly this reason.
    //
    // Only the auto-seeded single line is corrected here. When the caller supplied
    // explicit `itemLines` it chose the units and quantities deliberately, and
    // second-guessing that would change committed booking behaviour.
    const seededSingleUnit =
      requestedItemLines.length === 0 && unitsToSeed.length === 1 ? unitsToSeed[0] : null
    const singleSelectedUnit =
      insertedItems.length === 1
        ? (selectedUnits.find((unit) => unit.id === insertedItems[0]?.optionUnitId) ?? null)
        : null
    const slotAllocationQuantity = (item: (typeof insertedItems)[number]): number => {
      const unit = seededSingleUnit ?? singleSelectedUnit
      if (!unit || unit.unitType === "person") return item.quantity
      if (!bookingPax || bookingPax <= 0) return item.quantity
      return bookingPax
    }
    const allocationRows = insertedItems
      .filter((item) => item.availabilitySlotId)
      .map((item) => ({
        bookingId: booking.id,
        bookingItemId: item.id,
        productId: item.productId ?? null,
        optionId: item.optionId ?? null,
        optionUnitId: item.optionUnitId ?? null,
        pricingCategoryId: item.pricingCategoryId ?? null,
        availabilitySlotId: item.availabilitySlotId,
        quantity: slotAllocationQuantity(item),
        allocationType: "unit" as const,
        status: allocationStatusForBookingItemStatus(item.status),
        holdExpiresAt: null,
        metadata: item.metadata ?? null,
      }))

    const convertibleSlotId = slot?.id ?? null
    const convertedHold =
      options.availabilityHoldToken && convertibleSlotId
        ? await prepareAvailabilityHoldConversion(db, {
            holdToken: options.availabilityHoldToken,
            productId: product.id,
            slotId: convertibleSlotId,
          })
        : null
    const convertedAllocationId = convertedHold ? newId("booking_allocations") : null
    const rowsToInsert = convertedHold
      ? allocationRows.flatMap((allocation, index) => {
          if (allocation.availabilitySlotId !== convertibleSlotId) return [allocation]
          if (
            index !==
            allocationRows.findIndex((row) => row.availabilitySlotId === convertibleSlotId)
          ) {
            return []
          }
          return [
            {
              ...allocation,
              id: convertedAllocationId ?? undefined,
              quantity: convertedHold.paxCount,
              metadata: {
                ...(allocation.metadata ?? {}),
                availabilityHoldId: convertedHold.id,
                availabilityHoldToken: convertedHold.holdToken,
              },
            },
          ]
        })
      : allocationRows

    if (rowsToInsert.length > 0) {
      for (const allocation of rowsToInsert) {
        const isConvertedAllocation =
          convertedHold && allocation.metadata?.availabilityHoldId === convertedHold.id
        if (
          !allocation.availabilitySlotId ||
          !allocationStatusConsumesSlotCapacity(allocation.status) ||
          isConvertedAllocation
        ) {
          continue
        }

        const capacity = await adjustSlotCapacity(
          db,
          allocation.availabilitySlotId,
          -allocation.quantity,
          "booking",
        )

        if (capacity.status === "slot_not_found") {
          throw new BookingServiceError("slot_not_found")
        }
        if (capacity.status === "slot_unavailable") {
          throw new BookingServiceError("slot_unavailable")
        }
        if (capacity.status === "insufficient_capacity") {
          throw new BookingServiceError("insufficient_capacity")
        }
      }

      await db.insert(bookingAllocations).values(rowsToInsert)
    }

    if (convertedHold && convertedAllocationId) {
      await db
        .update(availabilityHoldsRef)
        .set({
          convertedAt: now,
          convertedBookingId: booking.id,
          convertedAllocationId,
          updatedAt: now,
        })
        .where(eq(availabilityHoldsRef.id, convertedHold.id))
    }

    await db
      .insert(bookingProductDetailsRef)
      .values({
        bookingId: booking.id,
        productId: product.id,
        optionId: option?.id ?? null,
      })
      .onConflictDoUpdate({
        target: bookingProductDetailsRef.bookingId,
        set: {
          productId: product.id,
          optionId: option?.id ?? null,
          updatedAt: new Date(),
        },
      })

    if (insertedItems.length > 0) {
      await db.insert(bookingItemProductDetailsRef).values(
        insertedItems.map((item) => ({
          bookingItemId: item.id,
          productId: item.productId ?? null,
          optionId: item.optionId ?? null,
          unitId: item.optionUnitId ?? null,
          supplierServiceId: null,
        })),
      )
    }

    await db.insert(bookingActivityLog).values({
      bookingId: booking.id,
      actorId: userId ?? "system",
      activityType: "booking_converted",
      description: `Booking converted from product "${product.name}"`,
      metadata: {
        productId: product.id,
        productName: product.name,
        optionId: option?.id ?? null,
        slotId: slot?.id ?? null,
        ...(convertedHold
          ? {
              availabilityHoldId: convertedHold.id,
              availabilityHoldToken: convertedHold.holdToken,
              availabilityHoldPax: convertedHold.paxCount,
            }
          : {}),
      },
    })

    if (priceOverride) {
      await db.insert(bookingActivityLog).values({
        bookingId: booking.id,
        actorId: userId ?? "system",
        activityType: "system_action",
        description: "Booking sell total manually overridden during create",
        metadata: { kind: "booking_price_overridden", ...priceOverride },
      })
    }

    return booking
  },

  async getBookingById(db: PostgresJsDatabase, id: string) {
    const [row] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1)
    return row ?? null
  },

  listAllocations(db: PostgresJsDatabase, bookingId: string) {
    return db
      .select()
      .from(bookingAllocations)
      .where(eq(bookingAllocations.bookingId, bookingId))
      .orderBy(asc(bookingAllocations.createdAt))
  },

  async updateBooking(db: PostgresJsDatabase, id: string, data: UpdateBookingInput) {
    const normalizedData = normalizeBookingBillingPartyUpdate(data)
    const includesDirectTotalUpdate =
      data.sellAmountCents !== undefined ||
      data.baseSellAmountCents !== undefined ||
      data.costAmountCents !== undefined ||
      data.baseCostAmountCents !== undefined

    return db.transaction(async (tx) => {
      const rows = await tx.execute(
        sql`SELECT status, custom_fields
            FROM ${bookings}
            WHERE ${bookings.id} = ${id}
            FOR UPDATE`,
      )
      const existing = toRows<{
        status: BookingStatus
        custom_fields: NamespacedCustomFieldValues
      }>(rows)[0]

      if (!existing) return null

      let updateData = normalizedData
      let shouldRecomputeTotals = false
      if (includesDirectTotalUpdate) {
        const [itemCount] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(bookingItems)
          .where(eq(bookingItems.bookingId, id))

        if ((itemCount?.count ?? 0) > 0) {
          const rest = { ...normalizedData }
          delete rest.sellAmountCents
          delete rest.baseSellAmountCents
          delete rest.costAmountCents
          delete rest.baseCostAmountCents
          if (data.baseCurrency === null) {
            rest.baseSellAmountCents = null
            rest.baseCostAmountCents = null
          } else {
            if (data.baseSellAmountCents === null) rest.baseSellAmountCents = null
            if (data.baseCostAmountCents === null) rest.baseCostAmountCents = null
          }
          updateData = rest
          shouldRecomputeTotals = true
        }
      }
      if (updateData.customFields !== undefined) {
        updateData = {
          ...updateData,
          customFields: {
            ...existing.custom_fields,
            custom: updateData.customFields.custom ?? {},
          },
        }
      }

      const [row] = await tx
        .update(bookings)
        .set({
          ...updateData,
          contactFirstName:
            data.contactFirstName === undefined ? undefined : (data.contactFirstName ?? null),
          contactLastName:
            data.contactLastName === undefined ? undefined : (data.contactLastName ?? null),
          contactPartyType:
            data.contactPartyType === undefined ? undefined : (data.contactPartyType ?? null),
          contactTaxId: data.contactTaxId === undefined ? undefined : (data.contactTaxId ?? null),
          contactEmail: data.contactEmail === undefined ? undefined : (data.contactEmail ?? null),
          contactPhone: data.contactPhone === undefined ? undefined : (data.contactPhone ?? null),
          contactPreferredLanguage:
            data.contactPreferredLanguage === undefined
              ? undefined
              : (data.contactPreferredLanguage ?? null),
          contactCountry:
            data.contactCountry === undefined ? undefined : (data.contactCountry ?? null),
          contactRegion:
            data.contactRegion === undefined ? undefined : (data.contactRegion ?? null),
          contactCity: data.contactCity === undefined ? undefined : (data.contactCity ?? null),
          contactAddressLine1:
            data.contactAddressLine1 === undefined ? undefined : (data.contactAddressLine1 ?? null),
          contactAddressLine2:
            data.contactAddressLine2 === undefined ? undefined : (data.contactAddressLine2 ?? null),
          contactPostalCode:
            data.contactPostalCode === undefined ? undefined : (data.contactPostalCode ?? null),
          holdExpiresAt:
            data.holdExpiresAt === undefined ? undefined : toTimestamp(data.holdExpiresAt),
          confirmedAt: confirmedAtForBookingUpdate(existing.status, data),
          expiredAt: data.expiredAt === undefined ? undefined : toTimestamp(data.expiredAt),
          cancelledAt: data.cancelledAt === undefined ? undefined : toTimestamp(data.cancelledAt),
          completedAt: data.completedAt === undefined ? undefined : toTimestamp(data.completedAt),
          redeemedAt: data.redeemedAt === undefined ? undefined : toTimestamp(data.redeemedAt),
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, id))
        .returning()

      if (!row || !shouldRecomputeTotals) return row ?? null

      await bookingsService.recomputeBookingTotal(tx as PostgresJsDatabase, id)
      const [freshRow] = await tx.select().from(bookings).where(eq(bookings.id, id)).limit(1)
      return freshRow ?? row
    })
  },

  async deleteBooking(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .delete(bookings)
      .where(eq(bookings.id, id))
      .returning({ id: bookings.id })

    return row ?? null
  },

  async confirmBooking(
    db: PostgresJsDatabase,
    id: string,
    data: ConfirmBookingInput,
    userId?: string,
    runtime: BookingServiceRuntime = {},
  ) {
    try {
      const result = await db.transaction(async (tx) => {
        const rows = await tx.execute(
          sql`SELECT id, booking_number, status, hold_expires_at, notifications_suppressed
              FROM ${bookings}
              WHERE ${bookings.id} = ${id}
              FOR UPDATE`,
        )
        const booking = toRows<{
          id: string
          booking_number: string
          status: BookingStatus
          hold_expires_at: Date | null
          notifications_suppressed: boolean
        }>(rows)[0]

        if (!booking) {
          throw new BookingServiceError("not_found")
        }
        if (!canTransitionBooking(booking.status, "confirmed")) {
          throw new BookingServiceError("invalid_transition")
        }
        // Accept both the staff-brokered "on_hold" and the customer
        // checkout flow's "awaiting_payment". Other statuses (draft,
        // already-confirmed, expired, cancelled) reject — the state
        // machine catches the rest, but we explicitly forbid the
        // states that would skip a step in the lifecycle.
        if (booking.status !== "on_hold" && booking.status !== "awaiting_payment") {
          throw new BookingServiceError("invalid_transition")
        }
        if (booking.hold_expires_at && booking.hold_expires_at < new Date()) {
          throw new BookingServiceError("hold_expired")
        }

        const patch = transitionBooking(booking.status, "confirmed")
        const suppressNotifications =
          booking.notifications_suppressed || data.suppressNotifications === true

        await tx
          .update(bookingAllocations)
          .set({
            status: "confirmed",
            confirmedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(eq(bookingAllocations.bookingId, id), eq(bookingAllocations.status, "held")))

        await tx
          .update(bookingItems)
          .set({ status: "confirmed", updatedAt: new Date() })
          .where(
            and(eq(bookingItems.bookingId, id), inArray(bookingItems.status, ["draft", "on_hold"])),
          )

        const [row] = await tx
          .update(bookings)
          .set({
            ...patch,
            holdExpiresAt: null,
            notificationsSuppressed: suppressNotifications,
            updatedAt: new Date(),
          })
          .where(eq(bookings.id, id))
          .returning()

        await autoIssueFulfillmentsForBooking(tx as PostgresJsDatabase, id, userId)

        await tx.insert(bookingActivityLog).values({
          bookingId: id,
          actorId: userId ?? "system",
          activityType: "booking_confirmed",
          description: `Booking ${booking.booking_number} confirmed`,
        })

        if (data.note) {
          await tx.insert(bookingNotes).values({
            bookingId: id,
            authorId: userId ?? "system",
            content: data.note,
          })
        }

        await appendBookingStatusMutationLedger(tx as PostgresJsDatabase, runtime, {
          actionName: "booking.status.confirm",
          routeOrToolName: runtime.actionLedgerRouteOrToolName ?? "bookings.confirm",
          capabilityId: BOOKING_STATUS_CAPABILITIES.confirm.id,
          bookingId: id,
          fromStatus: booking.status,
          toStatus: "confirmed",
        })

        if (row) {
          await insertOutboxEvents(tx as PostgresJsDatabase, [
            {
              name: "booking.confirmed",
              data: {
                bookingId: row.id,
                bookingNumber: row.bookingNumber,
                actorId: userId ?? null,
                suppressNotifications: row.notificationsSuppressed,
              } satisfies BookingConfirmedEvent,
              metadata: {
                category: "domain",
                source: "service",
                eventId: bookingLifecycleOutboxEventId(
                  "confirmed",
                  row.id,
                  runtime,
                  row.confirmedAt,
                ),
              },
            },
          ])
        }

        return { status: "ok" as const, booking: row ?? null }
      })

      return result
    } catch (error) {
      if (error instanceof BookingServiceError) {
        return { status: error.code as Exclude<string, "ok"> }
      }
      throw error
    }
  },

  async recoverExpiredPaidBooking(
    db: PostgresJsDatabase,
    id: string,
    data: ConfirmBookingInput = {},
    userId?: string,
    runtime: BookingServiceRuntime = {},
  ) {
    const slotChanges: AvailabilitySlotChangedEventPayload[] = []
    try {
      const result = await db.transaction(async (tx) => {
        const rows = await tx.execute(
          sql`SELECT id, booking_number, status
              FROM ${bookings}
              WHERE ${bookings.id} = ${id}
              FOR UPDATE`,
        )
        const booking = toRows<{
          id: string
          booking_number: string
          status: BookingStatus
        }>(rows)[0]

        if (!booking) {
          throw new BookingServiceError("not_found")
        }
        if (booking.status !== "awaiting_payment" && booking.status !== "expired") {
          throw new BookingServiceError("invalid_transition")
        }

        const allocations = await tx
          .select()
          .from(bookingAllocations)
          .where(eq(bookingAllocations.bookingId, id))

        for (const allocation of allocations) {
          if (allocation.status === "confirmed") {
            continue
          }
          if (allocation.status !== "held" && allocation.status !== "expired") {
            throw new BookingServiceError("invalid_transition")
          }
          if (!allocation.availabilitySlotId || allocation.status === "held") {
            continue
          }

          const capacity = await adjustSlotCapacity(
            tx as PostgresJsDatabase,
            allocation.availabilitySlotId,
            -allocation.quantity,
            "booking",
          )
          if (capacity.status === "slot_not_found") {
            throw new BookingServiceError("slot_not_found")
          }
          if (capacity.status === "slot_unavailable") {
            throw new BookingServiceError("slot_unavailable")
          }
          if (capacity.status === "insufficient_capacity") {
            throw new BookingServiceError("insufficient_capacity")
          }
          if (capacity.slotChange) slotChanges.push(capacity.slotChange)
        }

        const now = new Date()
        await tx
          .update(bookingAllocations)
          .set({
            status: "confirmed",
            confirmedAt: now,
            releasedAt: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(bookingAllocations.bookingId, id),
              inArray(bookingAllocations.status, ["held", "expired"]),
            ),
          )

        await tx
          .update(bookingItems)
          .set({ status: "confirmed", updatedAt: now })
          .where(
            and(
              eq(bookingItems.bookingId, id),
              inArray(bookingItems.status, ["draft", "on_hold", "expired"]),
            ),
          )

        const [row] = await tx
          .update(bookings)
          .set({
            status: "confirmed",
            confirmedAt: now,
            paidAt: now,
            expiredAt: null,
            holdExpiresAt: null,
            updatedAt: now,
          })
          .where(eq(bookings.id, id))
          .returning()

        await autoIssueFulfillmentsForBooking(tx as PostgresJsDatabase, id, userId)

        await tx.insert(bookingActivityLog).values({
          bookingId: id,
          actorId: userId ?? "system",
          activityType: "booking_confirmed",
          description: `Late payment recovered and booking ${booking.booking_number} confirmed`,
          metadata: { recoveredFromStatus: booking.status },
        })

        if (data.note) {
          await tx.insert(bookingNotes).values({
            bookingId: id,
            authorId: userId ?? "system",
            content: data.note,
          })
        }

        await appendBookingStatusMutationLedger(tx as PostgresJsDatabase, runtime, {
          actionName: "booking.status.expire",
          routeOrToolName: "bookings.expire",
          capabilityId: BOOKING_STATUS_CAPABILITIES.expire.id,
          bookingId: id,
          fromStatus: booking.status,
          toStatus: "expired",
        })

        return { status: "ok" as const, booking: row ?? null }
      })

      if (result.status === "ok" && result.booking) {
        await runtime.eventBus?.emit(
          "booking.confirmed",
          {
            bookingId: result.booking.id,
            bookingNumber: result.booking.bookingNumber,
            actorId: userId ?? null,
          } satisfies BookingConfirmedEvent,
          { category: "domain", source: "service" },
        )
        await emitSlotChanges(runtime, slotChanges)
      }

      return result
    } catch (error) {
      if (error instanceof BookingServiceError) {
        return { status: error.code as Exclude<string, "ok"> }
      }
      throw error
    }
  },

  async extendBookingHold(
    db: PostgresJsDatabase,
    id: string,
    data: ExtendBookingHoldInput,
    userId?: string,
  ) {
    try {
      return await db.transaction(async (tx) => {
        const rows = await tx.execute(
          sql`SELECT id, status, hold_expires_at
              FROM ${bookings}
              WHERE ${bookings.id} = ${id}
              FOR UPDATE`,
        )
        const booking = toRows<{
          id: string
          status: BookingStatus
          hold_expires_at: Date | null
        }>(rows)[0]

        if (!booking) {
          throw new BookingServiceError("not_found")
        }
        if (booking.status !== "on_hold" && booking.status !== "awaiting_payment") {
          throw new BookingServiceError("invalid_transition")
        }
        if (booking.hold_expires_at && booking.hold_expires_at < new Date()) {
          throw new BookingServiceError("hold_expired")
        }

        const holdExpiresAt = await computeHoldExpiresAt(tx as PostgresJsDatabase, data)

        await tx
          .update(bookingAllocations)
          .set({
            holdExpiresAt,
            updatedAt: new Date(),
          })
          .where(and(eq(bookingAllocations.bookingId, id), eq(bookingAllocations.status, "held")))

        const [row] = await tx
          .update(bookings)
          .set({
            holdExpiresAt,
            updatedAt: new Date(),
          })
          .where(eq(bookings.id, id))
          .returning()

        await tx.insert(bookingActivityLog).values({
          bookingId: id,
          actorId: userId ?? "system",
          activityType: "hold_extended",
          description: "Booking hold extended",
          metadata: { holdExpiresAt: holdExpiresAt.toISOString() },
        })

        return { status: "ok" as const, booking: row ?? null }
      })
    } catch (error) {
      if (error instanceof BookingServiceError) {
        return { status: error.code as Exclude<string, "ok"> }
      }
      throw error
    }
  },

  async expireBooking(
    db: PostgresJsDatabase,
    id: string,
    data: ExpireBookingInput,
    userId?: string,
    runtime: BookingServiceRuntime & { cause?: "route" | "sweep" } = {},
  ) {
    const slotChanges: AvailabilitySlotChangedEventPayload[] = []
    try {
      const result = await db.transaction(async (tx) => {
        const rows = await tx.execute(
          sql`SELECT id, status, hold_expires_at
              FROM ${bookings}
              WHERE ${bookings.id} = ${id}
              FOR UPDATE`,
        )
        const booking = toRows<{
          id: string
          status: BookingStatus
          hold_expires_at: Date | null
        }>(rows)[0]

        if (!booking) {
          throw new BookingServiceError("not_found")
        }
        if (!canTransitionBooking(booking.status, "expired")) {
          throw new BookingServiceError("invalid_transition")
        }
        if (booking.status !== "on_hold") {
          throw new BookingServiceError("invalid_transition")
        }

        const patch = transitionBooking(booking.status, "expired")

        const allocations = await tx
          .select()
          .from(bookingAllocations)
          .where(eq(bookingAllocations.bookingId, id))

        for (const allocation of allocations) {
          const change = await releaseAllocationCapacity(
            tx as PostgresJsDatabase,
            allocation,
            "expire",
          )
          if (change) slotChanges.push(change)
        }

        await tx
          .update(bookingAllocations)
          .set({
            status: "expired",
            releasedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(eq(bookingAllocations.bookingId, id), eq(bookingAllocations.status, "held")))

        await tx
          .update(bookingItems)
          .set({ status: "expired", updatedAt: new Date() })
          .where(and(eq(bookingItems.bookingId, id), eq(bookingItems.status, "on_hold")))

        const [row] = await tx
          .update(bookings)
          .set({
            ...patch,
            holdExpiresAt: null,
            updatedAt: new Date(),
          })
          .where(eq(bookings.id, id))
          .returning()

        await runtime.closePaymentSchedulesForBooking?.(tx as PostgresJsDatabase, id, "expired")

        await tx.insert(bookingActivityLog).values({
          bookingId: id,
          actorId: userId ?? "system",
          activityType: "hold_expired",
          description: "Booking hold expired",
        })

        if (data.note) {
          await tx.insert(bookingNotes).values({
            bookingId: id,
            authorId: userId ?? "system",
            content: data.note,
          })
        }

        return { status: "ok" as const, booking: row ?? null }
      })

      if (result.status === "ok" && result.booking) {
        await runtime.eventBus?.emit(
          "booking.expired",
          {
            bookingId: result.booking.id,
            bookingNumber: result.booking.bookingNumber,
            cause: runtime.cause ?? "route",
            actorId: userId ?? null,
          } satisfies BookingExpiredEvent,
          { category: "domain", source: "service" },
        )
        await emitSlotChanges(runtime, slotChanges)
        await runtime.expirePaymentSessionsForBooking?.(db, result.booking.id)
      }

      return result
    } catch (error) {
      if (error instanceof BookingServiceError) {
        return { status: error.code as Exclude<string, "ok"> }
      }
      throw error
    }
  },

  async expireStaleBookings(
    db: PostgresJsDatabase,
    data: ExpireStaleBookingsInput,
    userId?: string,
    runtime: BookingServiceRuntime = {},
  ) {
    const cutoff = data.before ? new Date(data.before) : new Date()
    const staleBookings = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(
          inArray(bookings.status, ["on_hold", "awaiting_payment"]),
          // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
          sql`${bookings.holdExpiresAt} IS NOT NULL`,
          lte(bookings.holdExpiresAt, cutoff),
        ),
      )
      .orderBy(asc(bookings.holdExpiresAt), asc(bookings.createdAt))

    const expiredIds: string[] = []

    for (const booking of staleBookings) {
      const result = await this.expireBooking(
        db,
        booking.id,
        { note: data.note ?? "Hold expired by sweep" },
        userId,
        { ...runtime, cause: "sweep" },
      )

      if ("booking" in result && result.booking) {
        expiredIds.push(result.booking.id)
      }
    }

    return {
      expiredIds,
      count: expiredIds.length,
      cutoff,
    }
  },

  async cancelBooking(
    db: PostgresJsDatabase,
    id: string,
    data: CancelBookingInput,
    userId?: string,
    runtime: BookingServiceRuntime = {},
  ) {
    const slotChanges: AvailabilitySlotChangedEventPayload[] = []
    try {
      const result = await db.transaction(async (tx) => {
        const rows = await tx.execute(
          sql`SELECT id, status, booking_number, notifications_suppressed
              FROM ${bookings}
              WHERE ${bookings.id} = ${id}
              FOR UPDATE`,
        )
        const booking = toRows<{
          id: string
          status: BookingStatus
          booking_number: string
          notifications_suppressed: boolean
        }>(rows)[0]

        if (!booking) {
          throw new BookingServiceError("not_found")
        }
        if (!canTransitionBooking(booking.status, "cancelled")) {
          throw new BookingServiceError("invalid_transition")
        }

        const patch = transitionBooking(booking.status, "cancelled")
        const previousStatus = booking.status as BookingCancelledEvent["previousStatus"]
        const cancellationReason = data.note?.trim() || null
        const suppressNotifications =
          booking.notifications_suppressed || data.suppressNotifications === true

        const allocations = await tx
          .select()
          .from(bookingAllocations)
          .where(eq(bookingAllocations.bookingId, id))

        for (const allocation of allocations) {
          const change = await releaseAllocationCapacity(
            tx as PostgresJsDatabase,
            allocation,
            "cancel",
          )
          if (change) slotChanges.push(change)
        }

        await tx
          .update(bookingAllocations)
          .set({
            status: "cancelled",
            releasedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(bookingAllocations.bookingId, id),
              or(eq(bookingAllocations.status, "held"), eq(bookingAllocations.status, "confirmed")),
            ),
          )

        await tx
          .update(bookingItems)
          .set({
            status: "cancelled",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(bookingItems.bookingId, id),
              or(
                eq(bookingItems.status, "draft"),
                eq(bookingItems.status, "on_hold"),
                eq(bookingItems.status, "confirmed"),
              ),
            ),
          )

        const [row] = await tx
          .update(bookings)
          .set({
            ...patch,
            holdExpiresAt: null,
            notificationsSuppressed: suppressNotifications,
            updatedAt: new Date(),
          })
          .where(eq(bookings.id, id))
          .returning()

        await runtime.closePaymentSchedulesForBooking?.(tx as PostgresJsDatabase, id, "cancelled")
        const financialSettlement = await runtime.recordCancellationFinancialSettlement?.(
          tx as PostgresJsDatabase,
          {
            bookingId: id,
            bookingNumber: booking.booking_number,
            previousStatus,
            reason: cancellationReason,
            actorId: userId ?? "system",
          },
        )
        const financialSettlementMessage =
          typeof financialSettlement?.message === "string" ? financialSettlement.message : null
        const cancellationDescription = [
          cancellationReason
            ? `Booking cancelled from ${booking.status}: ${cancellationReason}`
            : `Booking cancelled from ${booking.status}`,
          financialSettlementMessage,
        ]
          .filter(Boolean)
          .join(" ")

        await tx.insert(bookingActivityLog).values({
          bookingId: id,
          actorId: userId ?? "system",
          activityType: "status_change",
          description: cancellationDescription,
          metadata: {
            oldStatus: booking.status,
            newStatus: "cancelled",
            reason: cancellationReason,
            ...(financialSettlement ? { financialSettlement } : {}),
          },
        })

        if (cancellationReason) {
          await tx.insert(bookingNotes).values({
            bookingId: id,
            authorId: userId ?? "system",
            content: cancellationReason,
          })
        }

        // Clean up any booking-group membership (dissolve if ≤1 active members remain).
        await cleanupGroupOnBookingCancelled(tx as PostgresJsDatabase, id)

        await appendBookingStatusMutationLedger(tx as PostgresJsDatabase, runtime, {
          actionName: "booking.status.cancel",
          routeOrToolName: runtime.actionLedgerRouteOrToolName ?? "bookings.cancel",
          capabilityId: BOOKING_STATUS_CAPABILITIES.cancel.id,
          bookingId: id,
          fromStatus: booking.status,
          toStatus: "cancelled",
          evaluatedRisk: "critical",
        })

        if (row) {
          await insertOutboxEvents(tx as PostgresJsDatabase, [
            {
              name: "booking.cancelled",
              data: {
                bookingId: row.id,
                bookingNumber: row.bookingNumber,
                previousStatus,
                reason: cancellationReason,
                actorId: userId ?? null,
                suppressNotifications: row.notificationsSuppressed,
              } satisfies BookingCancelledEvent,
              metadata: {
                category: "domain",
                source: "service",
                eventId: bookingLifecycleOutboxEventId(
                  "cancelled",
                  row.id,
                  runtime,
                  row.cancelledAt,
                ),
              },
            },
          ])
        }

        return { status: "ok" as const, booking: row ?? null, previousStatus }
      })

      if (result.status === "ok" && result.booking) {
        await emitSlotChanges(runtime, slotChanges)
      }

      return { status: result.status, booking: result.booking }
    } catch (error) {
      if (error instanceof BookingServiceError) {
        return { status: error.code as Exclude<string, "ok"> }
      }
      throw error
    }
  },

  async startBooking(
    db: PostgresJsDatabase,
    id: string,
    data: StartBookingInput,
    userId?: string,
    runtime: BookingServiceRuntime = {},
  ) {
    try {
      const result = await db.transaction(async (tx) => {
        const rows = await tx.execute(
          sql`SELECT id, booking_number, status
              FROM ${bookings}
              WHERE ${bookings.id} = ${id}
              FOR UPDATE`,
        )
        const booking = toRows<{
          id: string
          booking_number: string
          status: BookingStatus
        }>(rows)[0]

        if (!booking) {
          throw new BookingServiceError("not_found")
        }
        if (!canTransitionBooking(booking.status, "in_progress")) {
          throw new BookingServiceError("invalid_transition")
        }

        const patch = transitionBooking(booking.status, "in_progress")

        const [row] = await tx
          .update(bookings)
          .set({
            ...patch,
            updatedAt: new Date(),
          })
          .where(eq(bookings.id, id))
          .returning()

        await tx.insert(bookingActivityLog).values({
          bookingId: id,
          actorId: userId ?? "system",
          activityType: "booking_started",
          description: `Booking ${booking.booking_number} started`,
        })

        if (data.note) {
          await tx.insert(bookingNotes).values({
            bookingId: id,
            authorId: userId ?? "system",
            content: data.note,
          })
        }

        await appendBookingStatusMutationLedger(tx as PostgresJsDatabase, runtime, {
          actionName: "booking.status.start",
          routeOrToolName: "bookings.start",
          capabilityId: BOOKING_STATUS_CAPABILITIES.start.id,
          bookingId: id,
          fromStatus: booking.status,
          toStatus: "in_progress",
        })

        return { status: "ok" as const, booking: row ?? null }
      })

      if (result.status === "ok" && result.booking) {
        await runtime.eventBus?.emit(
          "booking.started",
          {
            bookingId: result.booking.id,
            bookingNumber: result.booking.bookingNumber,
            actorId: userId ?? null,
          } satisfies BookingStartedEvent,
          { category: "domain", source: "service" },
        )
      }

      return result
    } catch (error) {
      if (error instanceof BookingServiceError) {
        return { status: error.code as Exclude<string, "ok"> }
      }
      throw error
    }
  },

  async completeBooking(
    db: PostgresJsDatabase,
    id: string,
    data: CompleteBookingInput,
    userId?: string,
    runtime: BookingServiceRuntime = {},
  ) {
    try {
      const result = await db.transaction(async (tx) => {
        const rows = await tx.execute(
          sql`SELECT id, booking_number, status
              FROM ${bookings}
              WHERE ${bookings.id} = ${id}
              FOR UPDATE`,
        )
        const booking = toRows<{
          id: string
          booking_number: string
          status: BookingStatus
        }>(rows)[0]

        if (!booking) {
          throw new BookingServiceError("not_found")
        }
        if (!canTransitionBooking(booking.status, "completed")) {
          throw new BookingServiceError("invalid_transition")
        }

        const patch = transitionBooking(booking.status, "completed")

        await tx
          .update(bookingAllocations)
          .set({ status: "fulfilled", updatedAt: new Date() })
          .where(
            and(eq(bookingAllocations.bookingId, id), eq(bookingAllocations.status, "confirmed")),
          )

        await tx
          .update(bookingItems)
          .set({ status: "fulfilled", updatedAt: new Date() })
          .where(and(eq(bookingItems.bookingId, id), eq(bookingItems.status, "confirmed")))

        const [row] = await tx
          .update(bookings)
          .set({
            ...patch,
            updatedAt: new Date(),
          })
          .where(eq(bookings.id, id))
          .returning()

        await tx.insert(bookingActivityLog).values({
          bookingId: id,
          actorId: userId ?? "system",
          activityType: "booking_completed",
          description: `Booking ${booking.booking_number} completed`,
        })

        if (data.note) {
          await tx.insert(bookingNotes).values({
            bookingId: id,
            authorId: userId ?? "system",
            content: data.note,
          })
        }

        await appendBookingStatusMutationLedger(tx as PostgresJsDatabase, runtime, {
          actionName: "booking.status.complete",
          routeOrToolName: "bookings.complete",
          capabilityId: BOOKING_STATUS_CAPABILITIES.complete.id,
          bookingId: id,
          fromStatus: booking.status,
          toStatus: "completed",
        })

        return { status: "ok" as const, booking: row ?? null }
      })

      if (result.status === "ok" && result.booking) {
        await runtime.eventBus?.emit(
          "booking.completed",
          {
            bookingId: result.booking.id,
            bookingNumber: result.booking.bookingNumber,
            actorId: userId ?? null,
          } satisfies BookingCompletedEvent,
          { category: "domain", source: "service" },
        )
      }

      return result
    } catch (error) {
      if (error instanceof BookingServiceError) {
        return { status: error.code as Exclude<string, "ok"> }
      }
      throw error
    }
  },

  /**
   * Admin-only force: bypasses the transition graph. Terminal overrides
   * cascade to items and allocations so reporting and capacity stay
   * consistent; non-terminal overrides remain booking-row data correction.
   */
  async overrideBookingStatus(
    db: PostgresJsDatabase,
    id: string,
    data: OverrideBookingStatusInput,
    userId?: string,
    runtime: BookingServiceRuntime = {},
  ) {
    const slotChanges: AvailabilitySlotChangedEventPayload[] = []
    try {
      const result = await db.transaction(async (tx) => {
        const rows = await tx.execute(
          sql`SELECT id, booking_number, status
              FROM ${bookings}
              WHERE ${bookings.id} = ${id}
              FOR UPDATE`,
        )
        const booking = toRows<{
          id: string
          booking_number: string
          status: BookingStatus
        }>(rows)[0]

        if (!booking) {
          throw new BookingServiceError("not_found")
        }

        const now = new Date()
        const terminalItemStatus = terminalBookingItemStatusForOverride(data.status)
        const terminalAllocationStatus = terminalBookingAllocationStatusForOverride(data.status)
        const updates: Record<string, unknown> = {
          status: data.status,
          confirmedAt: confirmedAtForStatus(data.status, null, now),
          updatedAt: now,
        }
        if (data.suppressNotifications === true) {
          updates.notificationsSuppressed = true
        }
        if (data.status === "expired") updates.expiredAt = now
        if (data.status === "cancelled") updates.cancelledAt = now
        if (data.status === "completed") updates.completedAt = now

        if (terminalItemStatus && terminalAllocationStatus) {
          if (data.status === "cancelled" || data.status === "expired") {
            const allocations = await tx
              .select()
              .from(bookingAllocations)
              .where(
                and(
                  eq(bookingAllocations.bookingId, id),
                  or(
                    eq(bookingAllocations.status, "held"),
                    eq(bookingAllocations.status, "confirmed"),
                    eq(bookingAllocations.status, "fulfilled"),
                  ),
                ),
              )

            for (const allocation of allocations) {
              const change = await releaseAllocationCapacity(
                tx as PostgresJsDatabase,
                allocation,
                data.status === "expired" ? "expire" : "cancel",
              )
              if (change) slotChanges.push(change)
            }
          }

          const allocationUpdates: Record<string, unknown> = {
            status: terminalAllocationStatus,
            updatedAt: now,
          }
          if (data.status === "cancelled" || data.status === "expired") {
            allocationUpdates.releasedAt = now
          }

          await tx
            .update(bookingAllocations)
            .set(allocationUpdates)
            .where(
              and(
                eq(bookingAllocations.bookingId, id),
                or(
                  eq(bookingAllocations.status, "held"),
                  eq(bookingAllocations.status, "confirmed"),
                  eq(bookingAllocations.status, "fulfilled"),
                ),
              ),
            )

          await tx
            .update(bookingItems)
            .set({ status: terminalItemStatus, updatedAt: now })
            .where(
              and(
                eq(bookingItems.bookingId, id),
                or(
                  eq(bookingItems.status, "draft"),
                  eq(bookingItems.status, "on_hold"),
                  eq(bookingItems.status, "confirmed"),
                  eq(bookingItems.status, "fulfilled"),
                ),
              ),
            )
        } else if (data.status === "confirmed") {
          await tx
            .update(bookingItems)
            .set({ status: "confirmed", updatedAt: now })
            .where(
              and(
                eq(bookingItems.bookingId, id),
                inArray(bookingItems.status, ["draft", "on_hold", "expired"]),
              ),
            )
        }

        const [row] = await tx.update(bookings).set(updates).where(eq(bookings.id, id)).returning()
        if (data.status === "cancelled" || data.status === "expired") {
          await runtime.closePaymentSchedulesForBooking?.(tx as PostgresJsDatabase, id, data.status)
        }

        await tx.insert(bookingActivityLog).values({
          bookingId: id,
          actorId: userId ?? "system",
          activityType: "status_overridden",
          description: `Booking status overridden from ${booking.status} to ${data.status}`,
          metadata: {
            oldStatus: booking.status,
            newStatus: data.status,
            reason: data.reason,
          },
        })

        if (data.note) {
          await tx.insert(bookingNotes).values({
            bookingId: id,
            authorId: userId ?? "system",
            content: data.note,
          })
        }

        await appendBookingStatusMutationLedger(tx as PostgresJsDatabase, runtime, {
          actionName: "booking.status.override",
          routeOrToolName: "bookings.override-status",
          capabilityId: BOOKING_STATUS_CAPABILITIES.override.id,
          bookingId: id,
          fromStatus: booking.status,
          toStatus: data.status,
          evaluatedRisk: "high",
        })

        return {
          status: "ok" as const,
          booking: row ?? null,
          fromStatus: booking.status,
          toStatus: data.status,
        }
      })

      if (result.status === "ok" && result.booking) {
        await runtime.eventBus?.emit(
          "booking.status_overridden",
          {
            bookingId: result.booking.id,
            bookingNumber: result.booking.bookingNumber,
            fromStatus: result.fromStatus,
            toStatus: result.toStatus,
            reason: data.reason,
            actorId: userId ?? null,
          } satisfies BookingStatusOverriddenEvent,
          { category: "domain", source: "service" },
        )
        // Keep draft → confirmed overrides compatible with the create dialog,
        // but let data-correction callers preserve the audit event without
        // re-running the full confirm lifecycle.
        if (result.toStatus === "confirmed" && data.suppressLifecycleEvents !== true) {
          await runtime.eventBus?.emit(
            "booking.confirmed",
            {
              bookingId: result.booking.id,
              bookingNumber: result.booking.bookingNumber,
              actorId: userId ?? null,
              suppressNotifications: data.suppressNotifications === true,
            } satisfies BookingConfirmedEvent,
            { category: "domain", source: "service" },
          )
        }
        await emitSlotChanges(runtime, slotChanges)
      }

      return { status: result.status, booking: result.booking }
    } catch (error) {
      if (error instanceof BookingServiceError) {
        return { status: error.code as Exclude<string, "ok"> }
      }
      throw error
    }
  },

  listTravelerRecords(db: PostgresJsDatabase, bookingId: string) {
    return db
      .select()
      .from(bookingTravelers)
      .where(eq(bookingTravelers.bookingId, bookingId))
      .orderBy(desc(bookingTravelers.isPrimary), asc(bookingTravelers.createdAt))
  },

  async getTravelerRecordById(db: PostgresJsDatabase, bookingId: string, travelerId: string) {
    const [row] = await db
      .select()
      .from(bookingTravelers)
      .where(and(eq(bookingTravelers.id, travelerId), eq(bookingTravelers.bookingId, bookingId)))
      .limit(1)

    return row ?? null
  },

  async createTravelerRecord(
    db: PostgresJsDatabase,
    bookingId: string,
    data: CreateTravelerRecordInput,
    userId?: string,
  ) {
    const [booking] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1)

    if (!booking) {
      return null
    }

    const participantType = data.participantType
    const travelerCategory =
      data.travelerCategory == null && isPaxParticipantType(participantType)
        ? "adult"
        : (data.travelerCategory ?? null)

    const [row] = await db
      .insert(bookingTravelers)
      .values({
        bookingId,
        personId: data.personId ?? null,
        participantType,
        travelerCategory,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email ?? null,
        phone: data.phone ?? null,
        preferredLanguage: data.preferredLanguage ?? null,
        specialRequests: data.specialRequests ?? null,
        isPrimary: data.isPrimary ?? false,
        notes: data.notes ?? null,
      })
      .returning()

    if (!row) {
      return null
    }

    await ensureParticipantFlags(db, bookingId, row.id, data)
    await assignTravelerToExistingBookingItems(db, bookingId, row)
    await recomputeBookingPaxFromTravelers(db, bookingId)

    await db.insert(bookingActivityLog).values({
      bookingId,
      actorId: userId ?? "system",
      activityType: "traveler_update",
      description: `Traveler ${data.firstName} ${data.lastName} added`,
      metadata: { travelerId: row.id, participantType },
    })

    return row
  },

  async updateTravelerRecord(
    db: PostgresJsDatabase,
    travelerId: string,
    data: UpdateTravelerRecordInput,
  ) {
    const [row] = await db
      .update(bookingTravelers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(bookingTravelers.id, travelerId))
      .returning()

    if (!row) {
      return null
    }

    await ensureParticipantFlags(db, row.bookingId, row.id, data)
    await recomputeBookingPaxFromTravelers(db, row.bookingId)

    return row
  },

  /**
   * Create a traveler row and persist the encrypted travel-details envelope in
   * a single call. Migration boundary helper for consumers coming from the
   * pre-0.10 `createTravelerRecord({ ..., accessibilityNeeds, ... })` shape:
   * the storage split (plaintext columns + encrypted bucket) is preserved, but
   * the call ergonomics collapse back to one flat payload. Plaintext fields go
   * to `createTravelerRecord`; encrypted fields are forwarded to
   * `pii.upsertTravelerTravelDetails`. Operations are sequential, not
   * transactional — a failure in the encrypted-fields write leaves the
   * plaintext row in place (matching the pre-helper two-call protocol).
   */
  async createTravelerWithTravelDetails(
    db: PostgresJsDatabase,
    bookingId: string,
    data: CreateTravelerWithTravelDetailsInput,
    opts: {
      pii: BookingPiiService
      userId?: string
      actorId?: string | null
      /**
       * Optional resolver invoked when `data.personId` is set. Returns
       * a plaintext snapshot of dietary / accessibility / primary
       * passport from the linked person record. Snapshot fields fill
       * gaps in `data` only — explicit input always wins. Templates
       * wire this from `relationshipsService.loadPersonTravelSnapshot`.
       */
      resolveTravelSnapshot?: (personId: string) => Promise<BookingTravelerSnapshot | null>
    },
  ) {
    const traveler = await this.createTravelerRecord(
      db,
      bookingId,
      {
        personId: data.personId,
        participantType: data.participantType,
        travelerCategory: data.travelerCategory,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        preferredLanguage: data.preferredLanguage,
        specialRequests: data.specialRequests,
        isPrimary: data.isPrimary,
        notes: data.notes,
      },
      opts.userId,
    )
    if (!traveler) {
      return null
    }

    let travelDetailInput = pickTravelDetailFields(data)
    if (data.personId && opts.resolveTravelSnapshot) {
      const snapshot = await opts.resolveTravelSnapshot(data.personId)
      travelDetailInput = applyTravelDetailSnapshot(travelDetailInput, snapshot)
    }

    const travelDetails = await persistTravelDetailsWithCapacityCheck(
      db,
      traveler.id,
      travelDetailInput,
      opts,
    )

    return { traveler, travelDetails }
  },

  /**
   * Update a traveler row and (re-)upsert the encrypted travel-details
   * envelope in a single call. Same migration-ergonomics motivation as
   * `createTravelerWithTravelDetails`. Undefined fields are not written;
   * `null` clears a column / encrypted field.
   */
  async updateTravelerWithTravelDetails(
    db: PostgresJsDatabase,
    travelerId: string,
    data: UpdateTravelerWithTravelDetailsInput,
    opts: {
      pii: BookingPiiService
      actorId?: string | null
    },
  ) {
    const traveler = await this.updateTravelerRecord(db, travelerId, {
      personId: data.personId,
      participantType: data.participantType,
      travelerCategory: data.travelerCategory,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      preferredLanguage: data.preferredLanguage,
      specialRequests: data.specialRequests,
      isPrimary: data.isPrimary,
      notes: data.notes,
    })
    if (!traveler) {
      return null
    }

    const travelDetailInput = pickTravelDetailFields(data)
    const travelDetails = await persistTravelDetailsWithCapacityCheck(
      db,
      traveler.id,
      travelDetailInput,
      opts,
    )

    return { traveler, travelDetails }
  },

  async deleteTravelerRecord(db: PostgresJsDatabase, travelerId: string) {
    const [row] = await db
      .delete(bookingTravelers)
      .where(eq(bookingTravelers.id, travelerId))
      .returning({ id: bookingTravelers.id, bookingId: bookingTravelers.bookingId })

    if (row) await recomputeBookingPaxFromTravelers(db, row.bookingId)

    return row ?? null
  },

  listTravelers(db: PostgresJsDatabase, bookingId: string) {
    return db
      .select()
      .from(bookingTravelers)
      .where(
        and(
          eq(bookingTravelers.bookingId, bookingId),
          or(...travelerParticipantTypes.map((type) => eq(bookingTravelers.participantType, type))),
        ),
      )
      .orderBy(asc(bookingTravelers.createdAt))
      .then((rows) => rows.map(toTravelerResponse))
  },

  async listSharingGroupsForSlot(
    db: PostgresJsDatabase,
    slotId: string,
  ): Promise<BookingTravelerSharingGroupSummary[]> {
    const rows = await db
      .select({
        id: bookingTravelerTravelDetails.sharingGroupId,
        occupancy: sql<number>`count(distinct ${bookingTravelers.id})::int`,
        roomTypeId: sql<string | null>`
          case
            when count(distinct ${bookingTravelerTravelDetails.roomTypeId})
              filter (where ${bookingTravelerTravelDetails.roomTypeId} is not null) = 1
            then min(${bookingTravelerTravelDetails.roomTypeId})
            else null
          end
        `,
        bookingIds: sql<string[]>`
          array_agg(distinct ${bookingTravelers.bookingId} order by ${bookingTravelers.bookingId})
        `,
      })
      .from(bookingTravelerTravelDetails)
      .innerJoin(bookingTravelers, eq(bookingTravelers.id, bookingTravelerTravelDetails.travelerId))
      .innerJoin(bookings, eq(bookings.id, bookingTravelers.bookingId))
      .innerJoin(bookingAllocations, eq(bookingAllocations.bookingId, bookings.id))
      .where(
        and(
          eq(bookingAllocations.availabilitySlotId, slotId),
          isNotNull(bookingTravelerTravelDetails.sharingGroupId),
          ne(bookingTravelerTravelDetails.sharingGroupId, ""),
          inArray(bookings.status, sharingGroupBookingStatuses),
          inArray(bookingAllocations.status, sharingGroupAllocationStatuses),
          or(...travelerParticipantTypes.map((type) => eq(bookingTravelers.participantType, type))),
        ),
      )
      .groupBy(bookingTravelerTravelDetails.sharingGroupId)
      .orderBy(asc(bookingTravelerTravelDetails.sharingGroupId))

    return rows.flatMap((row) => {
      if (!row.id) return []
      return [
        {
          id: row.id,
          label: row.id,
          occupancy: row.occupancy,
          roomTypeId: row.roomTypeId,
          bookingIds: row.bookingIds,
        },
      ]
    })
  },

  async listTravelersBySharingGroup(
    db: PostgresJsDatabase,
    slotId: string,
    sharingGroupId: string,
  ): Promise<BookingTravelerSharingGroupMember[]> {
    const rows = await db
      .selectDistinct({
        id: bookingTravelers.id,
        bookingId: bookingTravelers.bookingId,
        bookingNumber: bookings.bookingNumber,
        participantType: bookingTravelers.participantType,
        travelerCategory: bookingTravelers.travelerCategory,
        personId: bookingTravelers.personId,
        firstName: bookingTravelers.firstName,
        lastName: bookingTravelers.lastName,
        email: bookingTravelers.email,
        phone: bookingTravelers.phone,
        preferredLanguage: bookingTravelers.preferredLanguage,
        specialRequests: bookingTravelers.specialRequests,
        isPrimary: bookingTravelers.isPrimary,
        notes: bookingTravelers.notes,
        isLeadTraveler: bookingTravelerTravelDetails.isLeadTraveler,
        sharingGroupId: bookingTravelerTravelDetails.sharingGroupId,
        roomTypeId: bookingTravelerTravelDetails.roomTypeId,
        bedPreference: bookingTravelerTravelDetails.bedPreference,
        allocations: bookingTravelerTravelDetails.allocations,
        createdAt: bookingTravelers.createdAt,
        updatedAt: bookingTravelers.updatedAt,
      })
      .from(bookingTravelers)
      .innerJoin(
        bookingTravelerTravelDetails,
        eq(bookingTravelerTravelDetails.travelerId, bookingTravelers.id),
      )
      .innerJoin(bookings, eq(bookings.id, bookingTravelers.bookingId))
      .innerJoin(bookingAllocations, eq(bookingAllocations.bookingId, bookings.id))
      .where(
        and(
          eq(bookingAllocations.availabilitySlotId, slotId),
          eq(bookingTravelerTravelDetails.sharingGroupId, sharingGroupId),
          inArray(bookings.status, sharingGroupBookingStatuses),
          inArray(bookingAllocations.status, sharingGroupAllocationStatuses),
          or(...travelerParticipantTypes.map((type) => eq(bookingTravelers.participantType, type))),
        ),
      )
      .orderBy(
        asc(bookings.bookingNumber),
        desc(bookingTravelers.isPrimary),
        asc(bookingTravelers.createdAt),
      )

    return rows.flatMap((row) => {
      if (!row.sharingGroupId) return []
      return [
        {
          ...row,
          isLeadTraveler: row.isLeadTraveler,
          sharingGroupId: row.sharingGroupId,
          allocations: normalizeTravelerAllocationMap(row.allocations),
        },
      ]
    })
  },

  async createTraveler(
    db: PostgresJsDatabase,
    bookingId: string,
    data: CreateTravelerInput,
    userId?: string,
  ) {
    const row = await this.createTravelerRecord(
      db,
      bookingId,
      {
        participantType: "traveler",
        travelerCategory: data.travelerCategory ?? null,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email ?? null,
        phone: data.phone ?? null,
        preferredLanguage: data.preferredLanguage ?? null,
        specialRequests: data.specialRequests ?? null,
        isPrimary: data.isPrimary ?? false,
        notes: data.notes ?? null,
      },
      userId,
    )
    return row ? toTravelerResponse(row) : null
  },

  async updateTraveler(db: PostgresJsDatabase, travelerId: string, data: UpdateTravelerInput) {
    const row = await this.updateTravelerRecord(db, travelerId, {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email ?? null,
      phone: data.phone ?? null,
      preferredLanguage: data.preferredLanguage ?? null,
      specialRequests: data.specialRequests ?? null,
      travelerCategory: data.travelerCategory ?? null,
      isPrimary: data.isPrimary ?? undefined,
      notes: data.notes ?? null,
    })
    return row ? toTravelerResponse(row) : null
  },

  async deleteTraveler(db: PostgresJsDatabase, travelerId: string) {
    return this.deleteTravelerRecord(db, travelerId)
  },

  /**
   * Lists booking items. Snapshot columns
   * (`productNameSnapshot`/`optionNameSnapshot`/`unitNameSnapshot`/
   * `departureLabelSnapshot`) travel with the row, so consumers see
   * exactly what was sold at booking time — no JOIN required, works in
   * catalog-less deployments, survives product deletion or renames.
   */
  listItems(db: PostgresJsDatabase, bookingId: string) {
    return db
      .select()
      .from(bookingItems)
      .where(eq(bookingItems.bookingId, bookingId))
      .orderBy(asc(bookingItems.createdAt))
  },

  /**
   * Re-derive `bookings.sellAmountCents` / `costAmountCents` from
   * `Σ(booking_items.total*AmountCents)`, plus — when the booking
   * declares a `baseCurrency` and `fxRateSetId` — re-derive
   * `baseSellAmountCents` / `baseCostAmountCents` by converting each
   * item's total via the FX rate set.
   *
   * Called automatically inside the item-mutation methods so callers
   * that go through `createItem` / `updateItem` / `deleteItem` never
   * have to remember to roll the parent. Public so external flows
   * (saga compensations, ad-hoc fix-ups) can also invoke it.
   *
   * Pass a tx-bound `db` to compose with an existing transaction; this
   * method does NOT wrap its own transaction.
   *
   * **FX rollup behaviour**:
   *
   * - Single-currency booking (every item's `sellCurrency === baseCurrency`,
   *   or `baseCurrency === sellCurrency` on the parent): `base*Cents`
   *   equal `sell*Cents` / `cost*Cents` directly. No FX lookup needed.
   * - Multi-currency booking with `fxRateSetId`: every item is
   *   converted to `baseCurrency` via `exchange_rates`. If any item's
   *   currency is missing from the rate set, the FX rollup short-circuits
   *   with `fxStatus: "missing_rate"` and `base*Cents` are LEFT
   *   UNCHANGED on the parent (caller chooses whether to abort).
   * - No `baseCurrency` configured: FX rollup is skipped entirely
   *   (`fxStatus: "skipped"`), and `base*Cents` stay null.
   *
   * Returns `{ sellAmountCents, costAmountCents, baseSellAmountCents,
   * baseCostAmountCents, fxStatus, missingCurrency? }` or `null` for a
   * missing booking.
   */
  async recomputeBookingTotal(db: PostgresJsDatabase, bookingId: string) {
    const [booking] = await db
      .select({
        id: bookings.id,
        sellCurrency: bookings.sellCurrency,
        baseCurrency: bookings.baseCurrency,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1)
    if (!booking) {
      return null
    }

    const [totals] = await db
      .select({
        sellAmountCents: sql<number>`coalesce(sum(${bookingItems.totalSellAmountCents}), 0)::int`,
        costAmountCents: sql<number>`coalesce(sum(${bookingItems.totalCostAmountCents}), 0)::int`,
      })
      .from(bookingItems)
      .where(eq(bookingItems.bookingId, bookingId))

    const sellAmountCents = totals?.sellAmountCents ?? 0
    const costAmountCents = totals?.costAmountCents ?? 0

    // We need fxRateSetId from the bookings row plus per-item currency
    // for the FX rollup. Refetch with those columns.
    const [bookingForFx] = await db
      .select({
        baseCurrency: bookings.baseCurrency,
        sellCurrency: bookings.sellCurrency,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1)

    let fxStatus: "ok" | "skipped" | "missing_rate" = "skipped"
    let baseSellAmountCents: number | null = null
    let baseCostAmountCents: number | null = null
    let missingCurrency: string | null = null

    const baseCurrency = bookingForFx?.baseCurrency ?? null
    if (baseCurrency) {
      const fxResult = await rollupBaseTotals(db, bookingId, baseCurrency)
      if (fxResult.status === "ok") {
        fxStatus = "ok"
        baseSellAmountCents = fxResult.baseSellAmountCents
        baseCostAmountCents = fxResult.baseCostAmountCents
      } else if (fxResult.status === "missing_rate") {
        fxStatus = "missing_rate"
        missingCurrency = fxResult.currency
      }
    }

    const patch: Record<string, unknown> = {
      sellAmountCents,
      costAmountCents,
      updatedAt: new Date(),
    }
    if (fxStatus === "ok") {
      patch.baseSellAmountCents = baseSellAmountCents
      patch.baseCostAmountCents = baseCostAmountCents
    }

    await db.update(bookings).set(patch).where(eq(bookings.id, bookingId))

    return {
      sellAmountCents,
      costAmountCents,
      baseSellAmountCents,
      baseCostAmountCents,
      fxStatus,
      ...(missingCurrency ? { missingCurrency } : {}),
    }
  },

  async createItem(
    db: PostgresJsDatabase,
    bookingId: string,
    data: CreateBookingItemInput,
    userId?: string,
  ) {
    return db.transaction(async (tx) => {
      const [booking] = await tx
        .select({ id: bookings.id, sellCurrency: bookings.sellCurrency, status: bookings.status })
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .limit(1)

      if (!booking || !bookingAllowsItemMutation(booking.status)) {
        return null
      }

      // Look up catalog/availability data for snapshotting + auto-fill.
      // Explicit input values win — callers in catalog-less deployments
      // (OTA) pass their own snapshots/timings and we don't touch them.
      const enrichment = await resolveBookingItemSnapshot(tx as PostgresJsDatabase, {
        productId: data.productId ?? null,
        optionId: data.optionId ?? null,
        optionUnitId: data.optionUnitId ?? null,
        availabilitySlotId: data.availabilitySlotId ?? null,
      })

      const startsAtInput =
        data.startsAt !== undefined ? toTimestamp(data.startsAt) : enrichment.startsAt
      const endsAtInput = data.endsAt !== undefined ? toTimestamp(data.endsAt) : enrichment.endsAt
      const serviceDateInput =
        data.serviceDate !== undefined ? data.serviceDate : enrichment.serviceDate

      const [row] = await tx
        .insert(bookingItems)
        .values({
          bookingId,
          title: data.title,
          description: data.description ?? null,
          itemType: data.itemType,
          status: data.status,
          serviceDate: serviceDateInput ?? null,
          startsAt: startsAtInput,
          endsAt: endsAtInput,
          quantity: data.quantity,
          sellCurrency: data.sellCurrency ?? booking.sellCurrency,
          unitSellAmountCents: data.unitSellAmountCents ?? null,
          totalSellAmountCents: data.totalSellAmountCents ?? null,
          costCurrency: data.costCurrency ?? null,
          unitCostAmountCents: data.unitCostAmountCents ?? null,
          totalCostAmountCents: data.totalCostAmountCents ?? null,
          notes: data.notes ?? null,
          productId: data.productId ?? null,
          optionId: data.optionId ?? null,
          optionUnitId: data.optionUnitId ?? null,
          pricingCategoryId: data.pricingCategoryId ?? null,
          availabilitySlotId: data.availabilitySlotId ?? null,
          productNameSnapshot: data.productNameSnapshot ?? enrichment.productName ?? null,
          optionNameSnapshot: data.optionNameSnapshot ?? enrichment.optionName ?? null,
          unitNameSnapshot: data.unitNameSnapshot ?? enrichment.unitName ?? null,
          departureLabelSnapshot: data.departureLabelSnapshot ?? enrichment.departureLabel ?? null,
          sourceSnapshotId: data.sourceSnapshotId ?? null,
          sourceOfferId: data.sourceOfferId ?? null,
          metadata: data.metadata ?? null,
        })
        .returning()

      if (!row) {
        return null
      }

      await tx.insert(bookingActivityLog).values({
        bookingId,
        actorId: userId ?? "system",
        activityType: "item_update",
        description: `Booking item "${data.title}" added`,
        metadata: { bookingItemId: row.id, itemType: data.itemType },
      })

      await bookingsService.recomputeBookingTotal(tx as PostgresJsDatabase, bookingId)

      return row
    })
  },

  async updateItem(db: PostgresJsDatabase, itemId: string, data: UpdateBookingItemInput) {
    return db.transaction(async (tx) => {
      const [parent] = await tx
        .select({ status: bookings.status })
        .from(bookingItems)
        .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
        .where(eq(bookingItems.id, itemId))
        .limit(1)

      if (!parent || !bookingAllowsItemMutation(parent.status)) {
        return null
      }

      // Refresh snapshots only when the foreign IDs change. Existing
      // snapshots are the historical record — overwriting them when
      // the catalog gets renamed would defeat their purpose. Callers
      // that want a manual re-snapshot can pass the `*Snapshot` fields
      // explicitly.
      const refreshing =
        data.productId !== undefined ||
        data.optionId !== undefined ||
        data.optionUnitId !== undefined ||
        data.availabilitySlotId !== undefined

      const snapshotUpdates: {
        productNameSnapshot?: string | null
        optionNameSnapshot?: string | null
        unitNameSnapshot?: string | null
        departureLabelSnapshot?: string | null
        startsAt?: Date | null
        endsAt?: Date | null
        serviceDate?: string | null
      } = {}

      if (refreshing) {
        const [current] = await tx
          .select({
            productId: bookingItems.productId,
            optionId: bookingItems.optionId,
            optionUnitId: bookingItems.optionUnitId,
            availabilitySlotId: bookingItems.availabilitySlotId,
          })
          .from(bookingItems)
          .where(eq(bookingItems.id, itemId))
          .limit(1)

        if (current) {
          const enrichment = await resolveBookingItemSnapshot(tx as PostgresJsDatabase, {
            productId: data.productId !== undefined ? (data.productId ?? null) : current.productId,
            optionId: data.optionId !== undefined ? (data.optionId ?? null) : current.optionId,
            optionUnitId:
              data.optionUnitId !== undefined ? (data.optionUnitId ?? null) : current.optionUnitId,
            availabilitySlotId:
              data.availabilitySlotId !== undefined
                ? (data.availabilitySlotId ?? null)
                : current.availabilitySlotId,
          })
          if (data.productNameSnapshot !== undefined) {
            snapshotUpdates.productNameSnapshot = data.productNameSnapshot
          } else if (enrichment.productName !== null) {
            snapshotUpdates.productNameSnapshot = enrichment.productName
          }
          if (data.optionNameSnapshot !== undefined) {
            snapshotUpdates.optionNameSnapshot = data.optionNameSnapshot
          } else if (enrichment.optionName !== null) {
            snapshotUpdates.optionNameSnapshot = enrichment.optionName
          }
          if (data.unitNameSnapshot !== undefined) {
            snapshotUpdates.unitNameSnapshot = data.unitNameSnapshot
          } else if (enrichment.unitName !== null) {
            snapshotUpdates.unitNameSnapshot = enrichment.unitName
          }
          if (data.departureLabelSnapshot !== undefined) {
            snapshotUpdates.departureLabelSnapshot = data.departureLabelSnapshot
          } else if (enrichment.departureLabel !== null) {
            snapshotUpdates.departureLabelSnapshot = enrichment.departureLabel
          }
          // If the caller didn't override timing and a slot was
          // (re)assigned, mirror the slot's timing onto the item.
          if (data.availabilitySlotId !== undefined && enrichment.startsAt) {
            if (data.startsAt === undefined) snapshotUpdates.startsAt = enrichment.startsAt
            if (data.endsAt === undefined) snapshotUpdates.endsAt = enrichment.endsAt
            if (data.serviceDate === undefined) snapshotUpdates.serviceDate = enrichment.serviceDate
          }
        }
      }

      const [row] = await tx
        .update(bookingItems)
        .set({
          ...data,
          ...snapshotUpdates,
          startsAt:
            snapshotUpdates.startsAt !== undefined
              ? snapshotUpdates.startsAt
              : data.startsAt === undefined
                ? undefined
                : toTimestamp(data.startsAt),
          endsAt:
            snapshotUpdates.endsAt !== undefined
              ? snapshotUpdates.endsAt
              : data.endsAt === undefined
                ? undefined
                : toTimestamp(data.endsAt),
          updatedAt: new Date(),
        })
        .where(eq(bookingItems.id, itemId))
        .returning()

      if (!row) return null

      await bookingsService.recomputeBookingTotal(tx as PostgresJsDatabase, row.bookingId)
      return row
    })
  },

  async deleteItem(db: PostgresJsDatabase, itemId: string, userId?: string) {
    return db.transaction(async (tx) => {
      // Look up the parent booking BEFORE the delete so we can roll up
      // afterwards.
      const [item] = await tx
        .select({
          bookingId: bookingItems.bookingId,
          title: bookingItems.title,
          itemType: bookingItems.itemType,
          bookingStatus: bookings.status,
        })
        .from(bookingItems)
        .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
        .where(eq(bookingItems.id, itemId))
        .limit(1)

      if (!item || !bookingAllowsItemMutation(item.bookingStatus)) {
        return null
      }

      const [row] = await tx
        .delete(bookingItems)
        .where(eq(bookingItems.id, itemId))
        .returning({ id: bookingItems.id })

      if (item && row) {
        await bookingsService.recomputeBookingTotal(tx as PostgresJsDatabase, item.bookingId)
        await tx.insert(bookingActivityLog).values({
          bookingId: item.bookingId,
          actorId: userId ?? "system",
          activityType: "item_update",
          description: `Booking item "${item.title}" deleted`,
          metadata: { bookingItemId: itemId, itemType: item.itemType },
        })
      }

      return row ?? null
    })
  },

  listItemParticipants(db: PostgresJsDatabase, itemId: string) {
    return db
      .select()
      .from(bookingItemTravelers)
      .where(eq(bookingItemTravelers.bookingItemId, itemId))
      .orderBy(desc(bookingItemTravelers.isPrimary), asc(bookingItemTravelers.createdAt))
  },

  async addItemParticipant(
    db: PostgresJsDatabase,
    itemId: string,
    data: CreateBookingItemParticipantInput,
  ) {
    const [item] = await db
      .select({ id: bookingItems.id })
      .from(bookingItems)
      .where(eq(bookingItems.id, itemId))
      .limit(1)

    if (!item) {
      return null
    }

    const [traveler] = await db
      .select({ id: bookingTravelers.id })
      .from(bookingTravelers)
      .where(eq(bookingTravelers.id, data.travelerId))
      .limit(1)

    if (!traveler) {
      return null
    }

    if (data.isPrimary) {
      await db
        .update(bookingItemTravelers)
        .set({ isPrimary: false })
        .where(eq(bookingItemTravelers.bookingItemId, itemId))
    }

    const [row] = await db
      .insert(bookingItemTravelers)
      .values({
        bookingItemId: itemId,
        travelerId: data.travelerId,
        role: data.role,
        isPrimary: data.isPrimary ?? false,
      })
      .returning()

    return row
  },

  async removeItemParticipant(db: PostgresJsDatabase, linkId: string) {
    const [row] = await db
      .delete(bookingItemTravelers)
      .where(eq(bookingItemTravelers.id, linkId))
      .returning({ id: bookingItemTravelers.id })

    return row ?? null
  },

  listSupplierStatuses(db: PostgresJsDatabase, bookingId: string) {
    return db
      .select()
      .from(bookingSupplierStatuses)
      .where(eq(bookingSupplierStatuses.bookingId, bookingId))
      .orderBy(asc(bookingSupplierStatuses.createdAt))
  },

  async createSupplierStatus(
    db: PostgresJsDatabase,
    bookingId: string,
    data: {
      supplierServiceId?: string | null
      supplierId?: string | null
      serviceName: string
      status?: "pending" | "confirmed" | "rejected" | "cancelled"
      supplierReference?: string | null
      costCurrency: string
      costAmountCents: number
      supplierInvoiceLineId?: string | null
      notes?: string | null
    },
    userId?: string,
  ) {
    const [booking] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1)

    if (!booking) {
      return null
    }

    const [row] = await db
      .insert(bookingSupplierStatuses)
      .values({
        bookingId,
        supplierServiceId: data.supplierServiceId ?? null,
        supplierId: data.supplierId ?? null,
        serviceName: data.serviceName,
        status: data.status ?? "pending",
        supplierReference: data.supplierReference ?? null,
        costCurrency: data.costCurrency,
        costAmountCents: data.costAmountCents,
        supplierInvoiceLineId: data.supplierInvoiceLineId ?? null,
        notes: data.notes ?? null,
        confirmedAt: data.status === "confirmed" ? new Date() : null,
      })
      .returning()

    await db.insert(bookingActivityLog).values({
      bookingId,
      actorId: userId ?? "system",
      activityType: "supplier_update",
      description: `Supplier status for "${data.serviceName}" added`,
    })
    await touchBookingUpdatedAt(db, bookingId)

    return row ?? null
  },

  async updateSupplierStatus(
    db: PostgresJsDatabase,
    bookingId: string,
    statusId: string,
    data: {
      supplierServiceId?: string | null
      supplierId?: string | null
      serviceName?: string
      status?: "pending" | "confirmed" | "rejected" | "cancelled"
      supplierReference?: string | null
      costCurrency?: string
      costAmountCents?: number
      supplierInvoiceLineId?: string | null
      notes?: string | null
      confirmedAt?: string | null
    },
    userId?: string,
  ) {
    const updateData: Record<string, unknown> = {
      ...data,
      supplierServiceId: data.supplierServiceId ?? undefined,
      supplierReference: data.supplierReference ?? undefined,
      confirmedAt:
        data.confirmedAt !== undefined
          ? toTimestamp(data.confirmedAt)
          : data.status === "confirmed"
            ? new Date()
            : undefined,
      updatedAt: new Date(),
    }

    const [row] = await db
      .update(bookingSupplierStatuses)
      .set(updateData)
      .where(eq(bookingSupplierStatuses.id, statusId))
      .returning()

    if (!row) {
      return null
    }

    if (data.status) {
      await db.insert(bookingActivityLog).values({
        bookingId,
        actorId: userId ?? "system",
        activityType: "supplier_update",
        description: `Supplier "${row.serviceName}" status updated to ${data.status}`,
        metadata: { supplierStatusId: statusId, newStatus: data.status },
      })
    }
    await touchBookingUpdatedAt(db, bookingId)

    return row
  },

  listFulfillments(db: PostgresJsDatabase, bookingId: string) {
    return db
      .select()
      .from(bookingFulfillments)
      .where(eq(bookingFulfillments.bookingId, bookingId))
      .orderBy(desc(bookingFulfillments.createdAt))
  },

  async issueFulfillment(
    db: PostgresJsDatabase,
    bookingId: string,
    data: CreateBookingFulfillmentInput,
    userId?: string,
  ) {
    const [booking] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1)

    if (!booking) {
      return null
    }

    const scoped = await ensureBookingScopedLinks(db, bookingId, data)
    if (!scoped.ok) {
      return null
    }

    const status = data.status ?? "issued"
    const issuedAt =
      data.issuedAt !== undefined
        ? toTimestamp(data.issuedAt)
        : status === "issued" || status === "reissued"
          ? new Date()
          : null
    const revokedAt =
      data.revokedAt !== undefined
        ? toTimestamp(data.revokedAt)
        : status === "revoked"
          ? new Date()
          : null

    const [row] = await db
      .insert(bookingFulfillments)
      .values({
        bookingId,
        bookingItemId: data.bookingItemId ?? null,
        travelerId: data.travelerId ?? null,
        fulfillmentType: data.fulfillmentType,
        deliveryChannel: data.deliveryChannel,
        status,
        artifactUrl: data.artifactUrl ?? null,
        payload: data.payload ?? null,
        issuedAt,
        revokedAt,
      })
      .returning()

    await db.insert(bookingActivityLog).values({
      bookingId,
      actorId: userId ?? "system",
      activityType: "fulfillment_issued",
      description: `Booking fulfillment issued as ${data.fulfillmentType}`,
      metadata: {
        fulfillmentId: row?.id ?? null,
        bookingItemId: data.bookingItemId ?? null,
        travelerId: data.travelerId ?? null,
        status,
      },
    })

    return row ?? null
  },

  async updateFulfillment(
    db: PostgresJsDatabase,
    bookingId: string,
    fulfillmentId: string,
    data: UpdateBookingFulfillmentInput,
    userId?: string,
  ) {
    const [existing] = await db
      .select({ id: bookingFulfillments.id })
      .from(bookingFulfillments)
      .where(
        and(
          eq(bookingFulfillments.id, fulfillmentId),
          eq(bookingFulfillments.bookingId, bookingId),
        ),
      )
      .limit(1)

    if (!existing) {
      return null
    }

    const scoped = await ensureBookingScopedLinks(db, bookingId, data)
    if (!scoped.ok) {
      return null
    }

    const nextStatus = data.status
    const [row] = await db
      .update(bookingFulfillments)
      .set({
        bookingItemId: data.bookingItemId === undefined ? undefined : (data.bookingItemId ?? null),
        travelerId: data.travelerId === undefined ? undefined : (data.travelerId ?? null),
        fulfillmentType: data.fulfillmentType,
        deliveryChannel: data.deliveryChannel,
        status: nextStatus,
        artifactUrl: data.artifactUrl === undefined ? undefined : (data.artifactUrl ?? null),
        payload: data.payload === undefined ? undefined : (data.payload ?? null),
        issuedAt:
          data.issuedAt !== undefined
            ? toTimestamp(data.issuedAt)
            : nextStatus === "issued" || nextStatus === "reissued"
              ? new Date()
              : undefined,
        revokedAt:
          data.revokedAt !== undefined
            ? toTimestamp(data.revokedAt)
            : nextStatus === "revoked"
              ? new Date()
              : undefined,
        updatedAt: new Date(),
      })
      .where(eq(bookingFulfillments.id, fulfillmentId))
      .returning()

    if (row) {
      await db.insert(bookingActivityLog).values({
        bookingId,
        actorId: userId ?? "system",
        activityType: "fulfillment_updated",
        description: `Booking fulfillment ${fulfillmentId} updated`,
        metadata: {
          fulfillmentId,
          bookingItemId: row.bookingItemId,
          travelerId: row.travelerId,
          status: row.status,
        },
      })
    }

    return row ?? null
  },

  listRedemptionEvents(db: PostgresJsDatabase, bookingId: string) {
    return db
      .select()
      .from(bookingRedemptionEvents)
      .where(eq(bookingRedemptionEvents.bookingId, bookingId))
      .orderBy(desc(bookingRedemptionEvents.redeemedAt), desc(bookingRedemptionEvents.createdAt))
  },

  async recordRedemption(
    db: PostgresJsDatabase,
    bookingId: string,
    data: RecordBookingRedemptionInput,
    userId?: string,
  ) {
    return db.transaction(async (tx) => {
      const [booking] = await tx
        .select({
          id: bookings.id,
          redeemedAt: bookings.redeemedAt,
        })
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .limit(1)

      if (!booking) {
        return null
      }

      const scoped = await ensureBookingScopedLinks(tx as PostgresJsDatabase, bookingId, data)
      if (!scoped.ok) {
        return null
      }

      const redeemedAt = toTimestamp(data.redeemedAt) ?? new Date()

      const [event] = await tx
        .insert(bookingRedemptionEvents)
        .values({
          bookingId,
          bookingItemId: data.bookingItemId ?? null,
          travelerId: data.travelerId ?? null,
          redeemedAt,
          redeemedBy: data.redeemedBy ?? userId ?? null,
          location: data.location ?? null,
          method: data.method,
          metadata: data.metadata ?? null,
        })
        .returning()

      if (!booking.redeemedAt || booking.redeemedAt < redeemedAt) {
        await tx
          .update(bookings)
          .set({
            redeemedAt,
            updatedAt: new Date(),
          })
          .where(eq(bookings.id, bookingId))
      }

      if (data.bookingItemId) {
        await tx
          .update(bookingItems)
          .set({
            status: "fulfilled",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(bookingItems.id, data.bookingItemId),
              eq(bookingItems.bookingId, bookingId),
              or(
                eq(bookingItems.status, "confirmed"),
                eq(bookingItems.status, "on_hold"),
                eq(bookingItems.status, "draft"),
              ),
            ),
          )

        await tx
          .update(bookingAllocations)
          .set({
            status: "fulfilled",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(bookingAllocations.bookingId, bookingId),
              eq(bookingAllocations.bookingItemId, data.bookingItemId),
              or(eq(bookingAllocations.status, "held"), eq(bookingAllocations.status, "confirmed")),
            ),
          )
      }

      await tx.insert(bookingActivityLog).values({
        bookingId,
        actorId: userId ?? "system",
        activityType: "redemption_recorded",
        description: "Booking redemption recorded",
        metadata: {
          redemptionEventId: event?.id ?? null,
          bookingItemId: data.bookingItemId ?? null,
          travelerId: data.travelerId ?? null,
          redeemedAt: redeemedAt.toISOString(),
          method: data.method,
        },
      })

      return event ?? null
    })
  },

  listActivity(db: PostgresJsDatabase, bookingId: string) {
    // Surface a hydrated actor display name + email so the activity
    // timeline can render "By {name}" / "By {email}" instead of the raw
    // user id. `actorId` may be null (system events) or reference a
    // deleted user, both of which leave the join columns null.
    return db
      .select({
        ...getTableColumns(bookingActivityLog),
        actorName: authUser.name,
        actorEmail: authUser.email,
      })
      .from(bookingActivityLog)
      .leftJoin(authUser, eq(bookingActivityLog.actorId, authUser.id))
      .where(eq(bookingActivityLog.bookingId, bookingId))
      .orderBy(desc(bookingActivityLog.createdAt))
  },

  listNotes(db: PostgresJsDatabase, bookingId: string) {
    return db
      .select({
        ...getTableColumns(bookingNotes),
        authorName: authUser.name,
        authorEmail: authUser.email,
      })
      .from(bookingNotes)
      .leftJoin(authUser, eq(bookingNotes.authorId, authUser.id))
      .where(eq(bookingNotes.bookingId, bookingId))
      .orderBy(bookingNotes.createdAt)
  },

  async createNote(
    db: PostgresJsDatabase,
    bookingId: string,
    userId: string,
    data: CreateBookingNoteInput,
  ) {
    const [booking] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1)

    if (!booking) {
      return null
    }

    const [row] = await db
      .insert(bookingNotes)
      .values({
        bookingId,
        authorId: userId,
        content: data.content,
      })
      .returning()

    if (!row) {
      return null
    }

    await db.insert(bookingActivityLog).values({
      bookingId,
      actorId: userId,
      activityType: "note_added",
      description: "Note added",
      metadata: { noteId: row.id },
    })
    await touchBookingUpdatedAt(db, bookingId)

    return row
  },

  async updateNote(
    db: PostgresJsDatabase,
    bookingId: string,
    noteId: string,
    userId: string,
    data: UpdateBookingNoteInput,
  ) {
    // Scope the update to (booking, note) so a stale / cross-booking
    // note id can't mutate another booking's note while the route
    // records an audit entry under the wrong `bookingId`. Returns null
    // → route responds 404.
    const [row] = await db
      .update(bookingNotes)
      .set({ content: data.content })
      .where(and(eq(bookingNotes.id, noteId), eq(bookingNotes.bookingId, bookingId)))
      .returning()

    if (row) {
      await db.insert(bookingActivityLog).values({
        bookingId,
        actorId: userId,
        activityType: "note_added",
        description: "Note updated",
        metadata: { noteId },
      })
      await touchBookingUpdatedAt(db, bookingId)
    }

    return row ?? null
  },

  async deleteNote(db: PostgresJsDatabase, bookingId: string, noteId: string, userId: string) {
    // Same scoping as `updateNote` — guards against deleting a note
    // that belongs to a different booking when the audit entry would
    // get filed under the route's `:id`.
    const [row] = await db
      .delete(bookingNotes)
      .where(and(eq(bookingNotes.id, noteId), eq(bookingNotes.bookingId, bookingId)))
      .returning({ id: bookingNotes.id, authorId: bookingNotes.authorId })

    if (row) {
      await db.insert(bookingActivityLog).values({
        bookingId,
        actorId: userId,
        activityType: "note_added",
        description: "Note deleted",
        metadata: { noteId },
      })
      await touchBookingUpdatedAt(db, bookingId)
    }

    return row ?? null
  },

  listDocuments(db: PostgresJsDatabase, bookingId: string) {
    return db
      .select()
      .from(bookingDocuments)
      .where(eq(bookingDocuments.bookingId, bookingId))
      .orderBy(bookingDocuments.createdAt)
  },

  async createDocument(
    db: PostgresJsDatabase,
    bookingId: string,
    data: CreateBookingDocumentInput,
  ) {
    const [booking] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1)

    if (!booking) {
      return null
    }

    const [row] = await db
      .insert(bookingDocuments)
      .values({
        bookingId,
        travelerId: data.travelerId ?? null,
        type: data.type,
        fileName: data.fileName,
        fileUrl: data.fileUrl,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        notes: data.notes ?? null,
      })
      .returning()

    if (row) {
      await touchBookingUpdatedAt(db, bookingId)
    }

    return row
  },

  async deleteDocument(db: PostgresJsDatabase, documentId: string) {
    const [row] = await db
      .delete(bookingDocuments)
      .where(eq(bookingDocuments.id, documentId))
      .returning({ id: bookingDocuments.id, bookingId: bookingDocuments.bookingId })

    if (row) {
      await touchBookingUpdatedAt(db, row.bookingId)
    }

    return row ?? null
  },
}

const { convertProductToBooking: _commandOnlyCreate, ...bookingsService } = bookingsServiceInternal

export { bookingsService }

/**
 * Command-only booking-domain settlement. The runtime lease is minted by the
 * action-ledger created-target state machine and is bound to this exact
 * transaction, so callers cannot invoke the mutation outside the admitted
 * Finance command.
 */
export async function settleBookingCreateDomain(
  lease: CreatedTargetMutationLease,
  tx: PostgresJsDatabase,
  commandIdempotencyKey: string,
  data: ConvertProductInput,
  userId?: string,
  options: { availabilityHoldToken?: string } = {},
) {
  consumeCreatedTargetMutationLease(lease, tx, {
    actionName: "@voyant-travel/finance#bookings-create-extension.action.create-booking",
    actionVersion: "v1",
    commandTarget: {
      type: "finance_booking_create_command",
      id: commandIdempotencyKey,
    },
    canonicalTargetType: "booking",
    resultReferenceType: "booking",
  })
  const productData = await getConvertProductData(tx, data)
  if (!productData) return null
  return bookingsServiceInternal.convertProductToBooking(tx, data, productData, userId, options)
}
