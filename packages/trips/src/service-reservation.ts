// agent-quality: file-size exception -- owner: trips; existing service module stays co-located until a dedicated split preserves behavior and tests.
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { and, eq } from "drizzle-orm"

import {
  assertCatalogComponentBookingDraftReady,
  bookingDraftFromComponent,
  isCatalogBackedTripComponent,
} from "./catalog-component-adapter.js"
import type {
  NewTripEnvelope,
  TripComponent,
  TripEnvelope,
  TripReservationPlan,
  TripReservationPlanComponentSnapshot,
} from "./schema.js"
import { tripComponents, tripEnvelopes, tripReservationPlans } from "./schema.js"
import {
  aggregateComponentPricing,
  assertTripComponentCanBeReserved,
  assertTripComponentCanBeUpdated,
  reserveResultToComponentPatch,
  shouldReplayReserve,
} from "./service-helpers.js"
import {
  appendWarningCodes,
  commonString,
  createComponentEvent,
  markComponentForStaffRemediation,
  minComponentPriceExpiry,
  statusToEventType,
} from "./service-internals.js"
import { applyQuoteToComponent } from "./service-pricing.js"
import { assertEnvelopeRequirementsSatisfied } from "./service-requirements.js"
import { getTrip } from "./service-trips.js"
import type {
  ReserveComponentResult,
  ReserveTripDeps,
  ReserveTripResult,
  SubmitTripReservationPlanComponent,
  Trip,
} from "./service-types.js"
import { TripsInvariantError } from "./service-types.js"
import { assertTripTravelerPartyComplete } from "./traveler-party-validation.js"
import { isAllowedTripComponentStatusTransition, type ReserveTripInput } from "./validation.js"

export async function reserveTrip(
  db: AnyDrizzleDb,
  input: ReserveTripInput,
  deps: ReserveTripDeps,
): Promise<ReserveTripResult> {
  let trip = await getTrip(db, input.envelopeId)
  if (!trip) {
    throw new TripsInvariantError(`Trip envelope ${input.envelopeId} was not found`)
  }

  if (shouldReplayReserve(trip.envelope, input.idempotencyKey)) {
    return reserveReplayResult(trip)
  }

  // Reserve gate: every required requirement must be resolved (selected) first.
  await assertEnvelopeRequirementsSatisfied(db, input.envelopeId)

  if (trip.envelope.status !== "priced") {
    return reserveClaimConflictResult(trip)
  }

  assertTripTravelerPartyComplete(trip.envelope.travelerParty, "Trip reserve")

  // Atomically claim the envelope before any provider dispatch. Public proposal
  // accept now runs reserveTrip OUTSIDE a wrapping transaction, so this
  // compare-and-set is the serialization point: only one concurrent caller can
  // flip `priced` -> `reserve_in_progress` and create sourced upstream holds.
  const [claimedEnvelope] = (await db
    .update(tripEnvelopes)
    .set({
      status: "reserve_in_progress",
      reserveIdempotencyKey: input.idempotencyKey ?? null,
      reserveStartedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(tripEnvelopes.id, input.envelopeId), eq(tripEnvelopes.status, "priced")))
    .returning()) as TripEnvelope[]

  if (!claimedEnvelope) {
    const refreshed = await getTrip(db, input.envelopeId)
    if (!refreshed) {
      throw new TripsInvariantError(`Trip envelope ${input.envelopeId} was not found`)
    }
    if (shouldReplayReserve(refreshed.envelope, input.idempotencyKey)) {
      return reserveReplayResult(refreshed)
    }
    return reserveClaimConflictResult(refreshed)
  }

  trip = { envelope: claimedEnvelope, components: trip.components }

  // Release the claim if preflight rejects or throws before provider dispatch,
  // otherwise a booking-engine/network error would strand the envelope in
  // `reserve_in_progress` and block every retry with `reservation_in_progress`.
  let preflight: Awaited<ReturnType<typeof refreshComponentsBeforeReserve>>
  try {
    preflight = await refreshComponentsBeforeReserve(db, trip, input, deps)
  } catch (error) {
    await releaseReserveClaimAfterPreflightFailure(db, input, trip)
    throw error
  }
  if (preflight.failures.length > 0) {
    const envelope = await releaseReserveClaimAfterPreflightFailure(db, input, preflight.trip)
    return {
      envelope,
      components: preflight.trip.components,
      reservationPlanId: null,
      reserved: [],
      failures: preflight.failures,
      compensations: [],
      warnings: preflight.warnings,
    }
  }
  trip = preflight.trip

  const planComponents = prepareReservationPlanComponents(trip.components)
  const reservationPlan = await createReservationPlan(db, trip, input)

  const warnings = new Set(preflight.warnings)
  const componentsById = new Map(trip.components.map((component) => [component.id, component]))

  if (planComponents.failures.length > 0) {
    const failedResult = await failReservationPlanBeforeSubmission(
      db,
      input.envelopeId,
      reservationPlan.id,
      planComponents.failures,
      warnings,
      componentsById,
    )
    return { ...failedResult, reservationPlanId: reservationPlan.id }
  }

  const submitted = await deps.submitReservationPlan({
    reservationPlan,
    envelope: trip.envelope,
    components: planComponents.components,
    idempotencyKey: input.idempotencyKey ?? null,
  })
  const submittedFailures = sanitizeReservationFailures(submitted.failures)
  const submittedCompensations = sanitizeReservationCompensations(submitted.compensations)

  for (const warning of submitted.warnings) warnings.add(sanitizeReservationText(warning))

  for (const item of submitted.reserved) {
    const component = componentsById.get(item.componentId)
    if (!component) continue
    const updated = await applyReserveResultToComponent(db, component, item.result)
    componentsById.set(updated.id, updated)
  }

  for (const failure of submittedFailures) {
    const component = componentsById.get(failure.componentId)
    if (!component) continue
    const failed = await applyReservationFailureToComponent(db, component, failure.reason)
    componentsById.set(failed.id, failed)
  }

  await applyReservationPlanCompensations(db, componentsById, submittedCompensations)

  if (submitted.status === "failed" || submittedFailures.length > 0) {
    await updateReservationPlanResult(db, reservationPlan.id, {
      status: "failed",
      failures: submittedFailures,
      compensations: submittedCompensations,
      warnings: [...warnings],
    })

    const [failedEnvelope] = (await db
      .update(tripEnvelopes)
      .set({
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(tripEnvelopes.id, input.envelopeId))
      .returning()) as TripEnvelope[]

    if (!failedEnvelope) {
      throw new Error("reserveTrip: failed envelope update returned no rows")
    }

    const refreshed = await getTrip(db, input.envelopeId)

    return {
      envelope: failedEnvelope,
      components: refreshed?.components ?? [...componentsById.values()],
      reservationPlanId: reservationPlan.id,
      reserved: submitted.reserved.map((item) => ({
        componentId: item.componentId,
        status: item.status,
      })),
      failures: submittedFailures,
      compensations: submittedCompensations,
      warnings: [...warnings],
    }
  }

  await updateReservationPlanResult(db, reservationPlan.id, {
    status: "reserved",
    failures: [],
    compensations: [],
    warnings: [...warnings],
  })

  const refs = commonEnvelopeRefs(submitted.reserved.map(({ result }) => result))
  const [envelope] = (await db
    .update(tripEnvelopes)
    .set({
      status: "reserved",
      ...refs,
      reservedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tripEnvelopes.id, input.envelopeId))
    .returning()) as TripEnvelope[]

  if (!envelope) {
    throw new Error("reserveTrip: envelope update returned no rows")
  }

  const refreshed = await getTrip(db, input.envelopeId)

  return {
    envelope,
    components: refreshed?.components ?? [...componentsById.values()],
    reservationPlanId: reservationPlan.id,
    reserved: submitted.reserved.map((item) => ({
      componentId: item.componentId,
      status: item.status,
    })),
    failures: [],
    compensations: [],
    warnings: [...warnings],
  }
}

function reserveReplayResult(trip: Trip): ReserveTripResult {
  return {
    envelope: trip.envelope,
    components: trip.components,
    reservationPlanId: null,
    reserved: trip.components
      .filter(isReservedTripComponent)
      .map((component) => ({ componentId: component.id, status: component.status })),
    failures: [],
    compensations: [],
    warnings: ["idempotent_replay"],
  }
}

function reserveClaimConflictResult(trip: Trip): ReserveTripResult {
  const reason = reserveClaimConflictReason(trip.envelope)
  const componentId = reserveClaimConflictComponentId(trip)

  return {
    envelope: trip.envelope,
    components: trip.components,
    reservationPlanId: null,
    reserved: trip.components
      .filter(isReservedTripComponent)
      .map((component) => ({ componentId: component.id, status: component.status })),
    failures: [{ componentId, reason, code: reason }],
    compensations: [],
    warnings: [reason],
  }
}

function reserveClaimConflictReason(envelope: TripEnvelope): string {
  if (envelope.status === "reserve_in_progress") return "reservation_in_progress"
  if (["reserved", "checkout_started", "booked"].includes(envelope.status)) {
    return "reservation_already_completed"
  }
  return `trip_${envelope.status}_cannot_be_reserved`
}

function reserveClaimConflictComponentId(trip: Trip): string {
  return (
    trip.components.find(
      (component) => component.status !== "removed" && component.status !== "cancelled",
    )?.id ?? trip.envelope.id
  )
}

async function releaseReserveClaimAfterPreflightFailure(
  db: AnyDrizzleDb,
  input: ReserveTripInput,
  trip: Trip,
): Promise<TripEnvelope> {
  const [envelope] = (await db
    .update(tripEnvelopes)
    .set({
      status: "priced",
      reserveIdempotencyKey: null,
      reserveStartedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(tripEnvelopes.id, input.envelopeId), eq(tripEnvelopes.status, "reserve_in_progress")),
    )
    .returning()) as TripEnvelope[]

  return envelope ?? trip.envelope
}

function prepareReservationPlanComponents(components: TripComponent[]): {
  components: SubmitTripReservationPlanComponent[]
  failures: ReserveTripResult["failures"]
} {
  const prepared: SubmitTripReservationPlanComponent[] = []
  const failures: ReserveTripResult["failures"] = []

  for (const component of activeReservationComponents(components)) {
    if (isCatalogBackedTripComponent(component)) {
      try {
        assertTripComponentCanBeReserved(component)
        assertCatalogComponentBookingDraftReady(component)
      } catch (error) {
        failures.push({
          componentId: component.id,
          reason: error instanceof Error ? error.message : "reservation_not_allowed",
        })
        continue
      }
    }

    prepared.push({
      componentId: component.id,
      reservationKind: isCatalogBackedTripComponent(component) ? "catalog_backed" : "non_catalog",
      component,
    })
  }

  return { components: prepared, failures }
}

const reservationFailureMessage = "component_reservation_failed"

type ReservationFailure = ReserveTripResult["failures"][number]
type ReservationCompensation = ReserveTripResult["compensations"][number]

function sanitizeReservationFailures(failures: ReservationFailure[]): ReservationFailure[] {
  return failures.map((failure) => {
    const reason = sanitizeReservationText(failure.reason)
    const code = failure.code ? sanitizeReservationText(failure.code) : failure.code
    if (reason === failure.reason && code === failure.code) return failure
    return {
      componentId: failure.componentId,
      reason,
      code: code ?? reservationFailureMessage,
    }
  })
}

function sanitizeReservationCompensations(
  compensations: ReservationCompensation[],
): ReservationCompensation[] {
  return compensations.map((compensation) => {
    if (!compensation.reason) return compensation
    const reason = sanitizeReservationText(compensation.reason)
    return reason === compensation.reason ? compensation : { ...compensation, reason }
  })
}

function sanitizeReservationText(value: string): string {
  return isInternalSqlErrorText(value) ? reservationFailureMessage : value
}

function isInternalSqlErrorText(value: string): boolean {
  const normalized = value.toLowerCase()
  return (
    normalized.includes("failed query:") ||
    normalized.includes("params:") ||
    normalized.includes("drizzlequeryerror") ||
    normalized.includes("postgre") ||
    /insert\s+into\s+["\w.]+/.test(normalized) ||
    /update\s+["\w.]+\s+set/.test(normalized) ||
    normalized.includes("violates not-null constraint") ||
    normalized.includes("violates foreign key constraint") ||
    normalized.includes("duplicate key value violates")
  )
}

async function createReservationPlan(
  db: AnyDrizzleDb,
  trip: Trip,
  input: ReserveTripInput,
): Promise<TripReservationPlan> {
  const componentSnapshots = activeReservationComponents(trip.components).map(
    reservationPlanComponentSnapshot,
  )
  const now = new Date()
  const [plan] = (await db
    .insert(tripReservationPlans)
    .values({
      envelopeId: trip.envelope.id,
      status: "submitted",
      idempotencyKey: input.idempotencyKey ?? null,
      refreshScope: input.refreshScope ?? null,
      componentCount: componentSnapshots.length,
      components: componentSnapshots,
      failures: [],
      compensations: [],
      warnings: [],
      submittedAt: now,
      updatedAt: now,
    })
    .returning()) as TripReservationPlan[]

  if (!plan) {
    throw new Error("createReservationPlan: insert returned no row")
  }

  return plan
}

function activeReservationComponents(components: TripComponent[]): TripComponent[] {
  return components.filter(
    (component) => component.status !== "removed" && component.status !== "cancelled",
  )
}

function reservationPlanComponentSnapshot(
  component: TripComponent,
): TripReservationPlanComponentSnapshot {
  return {
    componentId: component.id,
    sequence: component.sequence,
    kind: component.kind,
    status: component.status,
    catalogBacked: isCatalogBackedTripComponent(component),
    entityModule: component.entityModule,
    entityId: component.entityId,
    sourceKind: component.sourceKind,
    sourceConnectionId: component.sourceConnectionId,
    sourceRef: component.sourceRef,
    bookingDraftId: component.bookingDraftId,
    catalogQuoteId: component.catalogQuoteId,
    currency: component.componentCurrency,
    totalAmountCents: component.componentTotalAmountCents,
    priceExpiresAt: component.priceExpiresAt?.toISOString() ?? null,
    warningCodes: component.warningCodes,
  }
}

async function failReservationPlanBeforeSubmission(
  db: AnyDrizzleDb,
  envelopeId: string,
  reservationPlanId: string,
  failures: ReserveTripResult["failures"],
  warnings: Set<string>,
  componentsById: Map<string, TripComponent>,
): Promise<ReserveTripResult> {
  for (const failure of failures) {
    warnings.add(failure.reason)
    const component = componentsById.get(failure.componentId)
    if (!component) continue
    const failed = await applyReservationFailureToComponent(db, component, failure.reason)
    componentsById.set(failed.id, failed)
  }

  await updateReservationPlanResult(db, reservationPlanId, {
    status: "failed",
    failures,
    compensations: [],
    warnings: [...warnings],
  })

  const [failedEnvelope] = (await db
    .update(tripEnvelopes)
    .set({ status: "failed", updatedAt: new Date() })
    .where(eq(tripEnvelopes.id, envelopeId))
    .returning()) as TripEnvelope[]

  if (!failedEnvelope) {
    throw new Error("reserveTrip: failed envelope update returned no rows")
  }

  const refreshed = await getTrip(db, envelopeId)
  return {
    envelope: failedEnvelope,
    components: refreshed?.components ?? [...componentsById.values()],
    reserved: [],
    failures,
    compensations: [],
    warnings: [...warnings],
  }
}

async function updateReservationPlanResult(
  db: AnyDrizzleDb,
  reservationPlanId: string,
  result: {
    status: "reserved" | "failed"
    failures: ReserveTripResult["failures"]
    compensations: ReserveTripResult["compensations"]
    warnings: string[]
  },
): Promise<void> {
  await db
    .update(tripReservationPlans)
    .set({
      status: result.status,
      failures: result.failures,
      compensations: result.compensations,
      warnings: result.warnings,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tripReservationPlans.id, reservationPlanId))
}

async function applyReservationPlanCompensations(
  db: AnyDrizzleDb,
  componentsById: Map<string, TripComponent>,
  compensations: ReserveTripResult["compensations"],
): Promise<void> {
  for (const compensation of compensations) {
    const component = componentsById.get(compensation.componentId)
    if (!component) continue

    if (compensation.status === "released") {
      if (!isReservedTripComponent(component)) continue
      const released = await markReservedComponentReleased(db, component)
      componentsById.set(released.id, released)
      continue
    }

    const updated = await markComponentForStaffRemediation(
      db,
      component,
      compensation.reason ?? compensation.status,
    )
    componentsById.set(updated.id, updated)
  }
}

async function refreshComponentsBeforeReserve(
  db: AnyDrizzleDb,
  trip: Trip,
  input: ReserveTripInput,
  deps: ReserveTripDeps,
): Promise<{
  trip: Trip
  failures: ReserveTripResult["failures"]
  warnings: string[]
}> {
  const warnings = new Set<string>()
  const failures: ReserveTripResult["failures"] = []
  let changed = false
  const componentsById = new Map(trip.components.map((component) => [component.id, component]))

  for (const component of trip.components) {
    if (component.status === "removed" || component.status === "cancelled") continue

    if (isCatalogBackedTripComponent(component)) {
      const bookingDraft = bookingDraftFromComponent(component)
      assertCatalogComponentBookingDraftReady(component, bookingDraft)
      if (!deps.quoteCatalogComponentBeforeReserve) continue
      const quote = await deps.quoteCatalogComponentBeforeReserve({
        component,
        bookingDraft,
        scope: input.refreshScope ?? defaultReserveRefreshScope(trip.envelope),
      })
      const updated = await applyQuoteToComponent(db, component, quote)
      componentsById.set(updated.id, updated)
      changed = true

      if (!quote.available || !quote.pricing) {
        const reason = quote.unavailableReason ?? "quote_unavailable"
        warnings.add(reason)
        failures.push({
          componentId: component.id,
          reason,
          code: "unavailable",
        })
        continue
      }

      if (componentPricingChanged(component, updated)) {
        warnings.add("price_changed")
        failures.push({
          componentId: component.id,
          reason: "price_changed",
          code: "price_changed",
          details: pricingChangeDetails(component, updated),
        })
      }
      continue
    }

    const result = await deps.validateNonCatalogComponentBeforeReserve?.({
      envelope: trip.envelope,
      component,
    })
    if (!result || result.status === "ok") {
      for (const warning of result?.warnings ?? []) warnings.add(warning)
      continue
    }

    const reason = result.reason ?? result.status
    warnings.add(reason)
    failures.push({
      componentId: component.id,
      reason,
      code: result.status,
      details: result.details,
    })
  }

  if (changed || failures.length > 0) {
    const components = [...componentsById.values()]
    const aggregate = aggregateComponentPricing(
      components,
      input.refreshScope?.currency ?? trip.envelope.aggregateCurrency ?? undefined,
    )
    const [envelope] = (await db
      .update(tripEnvelopes)
      .set({
        // Preserve the caller's claimed status (`reserve_in_progress` once the
        // reserve claim has been taken) instead of forcing back to `priced`.
        status: trip.envelope.status,
        aggregateCurrency: aggregate.currency,
        aggregateSubtotalAmountCents: aggregate.subtotalAmountCents,
        aggregateTaxAmountCents: aggregate.taxAmountCents,
        aggregateTotalAmountCents: aggregate.totalAmountCents,
        aggregatePricingSnapshot: aggregate,
        currentPriceExpiresAt: minComponentPriceExpiry(components),
        updatedAt: new Date(),
      })
      .where(eq(tripEnvelopes.id, trip.envelope.id))
      .returning()) as TripEnvelope[]

    const refreshed = await getTrip(db, trip.envelope.id)
    return {
      trip: refreshed ?? { envelope: envelope ?? trip.envelope, components },
      failures,
      warnings: [...warnings, ...(aggregate.warnings ?? [])],
    }
  }

  return { trip, failures, warnings: [...warnings] }
}

function defaultReserveRefreshScope(
  envelope: TripEnvelope,
): NonNullable<ReserveTripInput["refreshScope"]> {
  return {
    locale: "en-US",
    audience: "staff",
    market: "default",
    currency: envelope.aggregateCurrency ?? undefined,
  }
}

function componentPricingChanged(before: TripComponent, after: TripComponent): boolean {
  return (
    before.componentCurrency !== after.componentCurrency ||
    before.componentSubtotalAmountCents !== after.componentSubtotalAmountCents ||
    before.componentTaxAmountCents !== after.componentTaxAmountCents ||
    before.componentTotalAmountCents !== after.componentTotalAmountCents
  )
}

function pricingChangeDetails(
  before: TripComponent,
  after: TripComponent,
): Record<string, unknown> {
  return {
    previous: {
      currency: before.componentCurrency,
      subtotalAmountCents: before.componentSubtotalAmountCents,
      taxAmountCents: before.componentTaxAmountCents,
      totalAmountCents: before.componentTotalAmountCents,
    },
    current: {
      currency: after.componentCurrency,
      subtotalAmountCents: after.componentSubtotalAmountCents,
      taxAmountCents: after.componentTaxAmountCents,
      totalAmountCents: after.componentTotalAmountCents,
    },
  }
}

async function applyReserveResultToComponent(
  db: AnyDrizzleDb,
  component: TripComponent,
  result: ReserveComponentResult,
): Promise<TripComponent> {
  assertTripComponentCanBeUpdated(component, { status: result.status })

  const [updated] = (await db
    .update(tripComponents)
    .set({
      ...reserveResultToComponentPatch(result),
      warningCodes: appendWarningCodes(component.warningCodes, result.warnings ?? []),
      updatedAt: new Date(),
    })
    .where(eq(tripComponents.id, component.id))
    .returning()) as TripComponent[]

  if (!updated) {
    throw new Error(`applyReserveResultToComponent: update returned no row for ${component.id}`)
  }

  await createComponentEvent(db, {
    envelopeId: updated.envelopeId,
    componentId: updated.id,
    eventType: statusToEventType(updated.status),
    fromStatus: component.status,
    toStatus: updated.status,
    payload: {
      bookingId: updated.bookingId,
      bookingGroupId: updated.bookingGroupId,
      orderId: updated.orderId,
      paymentSessionId: updated.paymentSessionId,
      providerRef: updated.providerRef,
      supplierRef: updated.supplierRef,
      holdExpiresAt: updated.holdExpiresAt?.toISOString(),
    },
  })

  return updated
}

async function applyReservationFailureToComponent(
  db: AnyDrizzleDb,
  component: TripComponent,
  reason: string,
): Promise<TripComponent> {
  if (!isAllowedTripComponentStatusTransition(component.status, "failed")) {
    return markComponentForStaffRemediation(db, component, reason)
  }

  const [updated] = (await db
    .update(tripComponents)
    .set({
      status: "failed",
      warningCodes: appendWarningCodes(component.warningCodes, [reason]),
      updatedAt: new Date(),
    })
    .where(eq(tripComponents.id, component.id))
    .returning()) as TripComponent[]

  if (!updated) {
    throw new Error(
      `applyReservationFailureToComponent: update returned no row for ${component.id}`,
    )
  }

  await createComponentEvent(db, {
    envelopeId: updated.envelopeId,
    componentId: updated.id,
    eventType: "failed",
    fromStatus: component.status,
    toStatus: updated.status,
    payload: { reason },
  })

  return updated
}

async function markReservedComponentReleased(
  db: AnyDrizzleDb,
  component: TripComponent,
): Promise<TripComponent> {
  const [updated] = (await db
    .update(tripComponents)
    .set({
      status: "cancelled",
      warningCodes: appendWarningCodes(component.warningCodes, ["reservation_released"]),
      updatedAt: new Date(),
    })
    .where(eq(tripComponents.id, component.id))
    .returning()) as TripComponent[]

  if (!updated) {
    throw new Error(`markReservedComponentReleased: update returned no row for ${component.id}`)
  }

  await createComponentEvent(db, {
    envelopeId: updated.envelopeId,
    componentId: updated.id,
    eventType: "cancelled",
    fromStatus: component.status,
    toStatus: updated.status,
    payload: { reason: "reservation_released" },
  })

  return updated
}

function isReservedTripComponent(
  component: TripComponent,
): component is TripComponent & { status: "held" | "booked" } {
  return component.status === "held" || component.status === "booked"
}

function commonEnvelopeRefs(results: ReserveComponentResult[]): Partial<NewTripEnvelope> {
  const refs: Partial<NewTripEnvelope> = {}
  const bookingGroupId = commonString(results.map((result) => result.bookingGroupId))
  const orderId = commonString(results.map((result) => result.orderId))
  const paymentSessionId = commonString(results.map((result) => result.paymentSessionId))

  if (bookingGroupId) refs.bookingGroupId = bookingGroupId
  if (orderId) refs.orderId = orderId
  if (paymentSessionId) refs.paymentSessionId = paymentSessionId

  return refs
}
