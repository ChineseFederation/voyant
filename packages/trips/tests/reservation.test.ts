import type { AnyDrizzleDb } from "@voyant-travel/db"
import { describe, expect, it, vi } from "vitest"
import type {
  NewTripComponentEvent,
  NewTripReservationPlan,
  TripComponent,
  TripEnvelope,
  TripReservationPlan,
} from "../src/schema.js"
import {
  tripComponentEvents,
  tripComponents,
  tripEnvelopes,
  tripReservationPlans,
} from "../src/schema.js"
import {
  assertTripComponentCanBeReserved,
  type ReserveTripDeps,
  reserveResultToComponentPatch,
  shouldReplayReserve,
  TripsInvariantError,
  tripsService,
} from "../src/service.js"
import { reserveTripSchema } from "../src/validation.js"

const completeTravelerParty = {
  billing: {
    personId: "person_billing",
    contact: {
      firstName: "Diego",
      lastName: "Muller",
      email: "diego@example.com",
    },
  },
  travelers: [
    {
      personId: "person_traveler",
      firstName: "Diego",
      lastName: "Muller",
      email: "diego@example.com",
    },
  ],
}

function component(overrides: Partial<TripComponent> = {}): TripComponent {
  return {
    id: "trcp_123",
    envelopeId: "trip_123",
    sequence: 0,
    kind: "catalog_booking",
    status: "priced",
    title: null,
    description: null,
    entityModule: "products",
    entityId: "prod_123",
    sourceKind: "owned",
    sourceConnectionId: null,
    sourceRef: null,
    bookingDraftId: null,
    catalogQuoteId: "quote_123",
    bookingId: null,
    bookingGroupId: null,
    orderId: null,
    paymentSessionId: null,
    providerRef: null,
    supplierRef: null,
    componentCurrency: "EUR",
    componentSubtotalAmountCents: 10000,
    componentTaxAmountCents: 900,
    componentTotalAmountCents: 10900,
    pricingSnapshot: {
      currency: "EUR",
      subtotalAmountCents: 10000,
      taxAmountCents: 900,
      totalAmountCents: 10900,
    },
    taxLines: [],
    cancellationSnapshot: null,
    holdToken: null,
    holdExpiresAt: null,
    priceExpiresAt: new Date("2099-05-20T12:00:00.000Z"),
    warningCodes: [],
    metadata: {},
    createdAt: new Date("2026-05-18T00:00:00.000Z"),
    updatedAt: new Date("2026-05-18T00:00:00.000Z"),
    ...overrides,
  }
}

function envelope(overrides: Partial<TripEnvelope> = {}): TripEnvelope {
  return {
    id: "trip_123",
    status: "priced",
    title: null,
    description: null,
    travelerParty: completeTravelerParty,
    constraints: {},
    aggregateCurrency: "EUR",
    aggregateSubtotalAmountCents: 10000,
    aggregateTaxAmountCents: 900,
    aggregateTotalAmountCents: 10900,
    aggregatePricingSnapshot: null,
    currentPriceExpiresAt: null,
    bookingGroupId: null,
    orderId: null,
    paymentSessionId: null,
    reserveIdempotencyKey: null,
    reserveStartedAt: null,
    reservedAt: null,
    checkoutIdempotencyKey: null,
    checkoutStartedAt: null,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date("2026-05-18T00:00:00.000Z"),
    updatedAt: new Date("2026-05-18T00:00:00.000Z"),
    ...overrides,
  }
}

function makeFakeDb(
  state: {
    envelope: TripEnvelope
    components: TripComponent[]
    events?: NewTripComponentEvent[]
    reservationPlans?: TripReservationPlan[]
  },
  options: { failReserveClaim?: boolean } = {},
): AnyDrizzleDb {
  const events = state.events ?? []
  const reservationPlans = state.reservationPlans ?? []

  function applyUpdate(
    table: unknown,
    patch: Partial<TripEnvelope & TripComponent & TripReservationPlan>,
  ) {
    if (table === tripEnvelopes) {
      // Simulate losing the atomic `priced -> reserve_in_progress` claim: a
      // concurrent caller already flipped the envelope, so the CAS matches no
      // rows (returns undefined) and leaves a rival idempotency key behind.
      if (options.failReserveClaim && patch.status === "reserve_in_progress") {
        Object.assign(state.envelope, {
          status: "reserve_in_progress",
          reserveIdempotencyKey: "attempt-other",
          reserveStartedAt: new Date("2026-05-18T10:30:00.000Z"),
          updatedAt: new Date("2026-05-18T10:30:00.000Z"),
        })
        return undefined
      }

      Object.assign(state.envelope, patch)
      return state.envelope
    }

    if (table === tripReservationPlans) {
      const plan = reservationPlans.at(-1)
      if (!plan) return undefined
      Object.assign(plan, patch)
      return plan
    }

    if (table !== tripComponents) return undefined

    const componentToUpdate =
      patch.status === "held" || patch.status === "booked"
        ? state.components.find((item) => item.status === "priced")
        : patch.status === "failed"
          ? state.components.find((item) => item.status === "priced")
          : patch.status === "cancelled"
            ? state.components.find((item) => item.status === "held" || item.status === "booked")
            : state.components[0]

    if (!componentToUpdate) return undefined
    Object.assign(componentToUpdate, patch)
    return componentToUpdate
  }

  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => (table === tripEnvelopes ? [state.envelope] : []),
          orderBy: async () =>
            table === tripComponents
              ? [...state.components].sort((a, b) => a.sequence - b.sequence)
              : [],
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (patch: Partial<TripEnvelope & TripComponent>) => ({
        where: () => {
          const updated = applyUpdate(table, patch)
          return {
            returning: async () => (updated ? [updated] : []),
          }
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (value: NewTripComponentEvent | NewTripReservationPlan) => {
        if (table === tripComponentEvents) events.push(value as NewTripComponentEvent)
        if (table === tripReservationPlans) {
          reservationPlans.push({
            id: `trpl_${reservationPlans.length + 1}`,
            snapshotId: null,
            createdAt: new Date("2026-05-18T00:00:00.000Z"),
            completedAt: null,
            ...value,
          } as TripReservationPlan)
        }
        return {
          returning: async () => (table === tripReservationPlans ? [reservationPlans.at(-1)] : []),
        }
      },
    }),
  } as AnyDrizzleDb
}

describe("trips reservation helpers", () => {
  it("accepts idempotency keys on reserve requests", () => {
    expect(
      reserveTripSchema.parse({
        envelopeId: "trip_123",
        idempotencyKey: "checkout-attempt-1",
      }),
    ).toEqual({
      envelopeId: "trip_123",
      idempotencyKey: "checkout-attempt-1",
    })
  })

  it("guards reservation to priced catalog-backed components", () => {
    expect(() =>
      assertTripComponentCanBeReserved(component(), new Date("2026-05-18T10:00:00.000Z")),
    ).not.toThrow()

    expect(() => assertTripComponentCanBeReserved(component({ status: "draft" }))).toThrowError(
      TripsInvariantError,
    )
    expect(() =>
      assertTripComponentCanBeReserved(component({ kind: "manual_placeholder" })),
    ).toThrowError(/catalog-backed/)
    expect(() =>
      assertTripComponentCanBeReserved(
        component({ priceExpiresAt: new Date("2026-05-18T09:59:00.000Z") }),
        new Date("2026-05-18T10:00:00.000Z"),
      ),
    ).toThrowError(/expired/)
  })

  it("maps provider reserve output into component refs and hold state", () => {
    expect(
      reserveResultToComponentPatch({
        status: "held",
        bookingId: "book_123",
        bookingGroupId: "bkgrp_123",
        orderId: "ord_123",
        paymentSessionId: "pay_123",
        providerRef: "provider/123",
        supplierRef: "supplier/123",
        holdToken: "hold_123",
        holdExpiresAt: "2026-05-18T12:00:00.000Z",
      }),
    ).toMatchObject({
      status: "held",
      bookingId: "book_123",
      bookingGroupId: "bkgrp_123",
      orderId: "ord_123",
      paymentSessionId: "pay_123",
      providerRef: "provider/123",
      supplierRef: "supplier/123",
      holdToken: "hold_123",
      holdExpiresAt: new Date("2026-05-18T12:00:00.000Z"),
    })
  })

  it("replays only completed reserve attempts with the same key", () => {
    const envelope = {
      status: "reserved",
      reserveIdempotencyKey: "attempt-1",
    } satisfies Pick<TripEnvelope, "status" | "reserveIdempotencyKey">

    expect(shouldReplayReserve(envelope, "attempt-1")).toBe(true)
    expect(shouldReplayReserve({ ...envelope, status: "priced" }, "attempt-1")).toBe(false)
    expect(shouldReplayReserve(envelope, "attempt-2")).toBe(false)
  })

  it("reserves priced catalog components in sequence", async () => {
    const state = {
      envelope: envelope(),
      components: [component({ id: "trcp_1" }), component({ id: "trcp_2", sequence: 1 })],
      events: [],
      reservationPlans: [] as TripReservationPlan[],
    }
    let submittedInputSnapshot: {
      reservationPlanId: string
      reservationPlanStatus: string
      components: Array<{ componentId: string; reservationKind: string }>
    } | null = null
    const submitReservationPlan = vi.fn(
      async (input: Parameters<ReserveTripDeps["submitReservationPlan"]>[0]) => {
        submittedInputSnapshot = {
          reservationPlanId: input.reservationPlan.id,
          reservationPlanStatus: input.reservationPlan.status,
          components: input.components.map((item) => ({
            componentId: item.componentId,
            reservationKind: item.reservationKind,
          })),
        }
        return {
          reservationPlanId: input.reservationPlan.id,
          status: "reserved" as const,
          reserved: input.components.map((item) => ({
            componentId: item.componentId,
            status: "held" as const,
            result: {
              status: "held" as const,
              bookingId: `book_${item.componentId}`,
              bookingGroupId: "bkgrp_123",
              holdToken: `hold_${item.componentId}`,
              holdExpiresAt: "2026-05-18T12:00:00.000Z",
            },
          })),
          failures: [],
          compensations: [],
          warnings: [],
        }
      },
    )

    const result = await tripsService.reserveTrip(
      makeFakeDb(state),
      { envelopeId: state.envelope.id, idempotencyKey: "attempt-1" },
      { submitReservationPlan },
    )

    expect(result.envelope.status).toBe("reserved")
    expect(result.envelope.reserveIdempotencyKey).toBe("attempt-1")
    expect(result.envelope.bookingGroupId).toBe("bkgrp_123")
    expect(result.reservationPlanId).toBe("trpl_1")
    expect(result.failures).toEqual([])
    expect(result.reserved).toEqual([
      { componentId: "trcp_1", status: "held" },
      { componentId: "trcp_2", status: "held" },
    ])
    expect(state.components.map((item) => item.bookingId)).toEqual(["book_trcp_1", "book_trcp_2"])
    expect(submitReservationPlan).toHaveBeenCalledOnce()
    expect(submittedInputSnapshot).toEqual({
      reservationPlanId: "trpl_1",
      reservationPlanStatus: "submitted",
      components: [
        { componentId: "trcp_1", reservationKind: "catalog_backed" },
        { componentId: "trcp_2", reservationKind: "catalog_backed" },
      ],
    })
    expect(state.reservationPlans[0]).toMatchObject({
      id: "trpl_1",
      status: "reserved",
      componentCount: 2,
    })
  })

  it("compensates earlier reserved components when a later reserve fails", async () => {
    const state = {
      envelope: envelope(),
      components: [component({ id: "trcp_1" }), component({ id: "trcp_2", sequence: 1 })],
      events: [],
      reservationPlans: [] as TripReservationPlan[],
    }

    const result = await tripsService.reserveTrip(
      makeFakeDb(state),
      { envelopeId: state.envelope.id },
      {
        submitReservationPlan: async (
          input: Parameters<ReserveTripDeps["submitReservationPlan"]>[0],
        ) => ({
          reservationPlanId: input.reservationPlan.id,
          status: "failed",
          reserved: [
            {
              componentId: "trcp_1",
              status: "held",
              result: {
                status: "held",
                bookingId: "book_trcp_1",
                holdToken: "hold_trcp_1",
              },
            },
          ],
          failures: [{ componentId: "trcp_2", reason: "supplier_hold_failed" }],
          compensations: [{ componentId: "trcp_1", status: "released" }],
          warnings: ["supplier_hold_failed"],
        }),
      },
    )

    expect(result.envelope.status).toBe("failed")
    expect(result.reservationPlanId).toBe("trpl_1")
    expect(result.failures).toEqual([{ componentId: "trcp_2", reason: "supplier_hold_failed" }])
    expect(result.compensations).toEqual([{ componentId: "trcp_1", status: "released" }])
    expect(state.components.map((item) => item.status)).toEqual(["cancelled", "failed"])
    expect(state.reservationPlans[0]).toMatchObject({
      id: "trpl_1",
      status: "failed",
      failures: [{ componentId: "trcp_2", reason: "supplier_hold_failed" }],
      compensations: [{ componentId: "trcp_1", status: "released" }],
    })
  })

  it("sanitizes internal SQL details from submitted reservation failures", async () => {
    const state = {
      envelope: envelope(),
      components: [component({ id: "trcp_1" })],
      events: [],
      reservationPlans: [] as TripReservationPlan[],
    }
    const rawReason =
      'Failed query: insert into "booking_payment_schedules" ("booking_id", "amount_cents") values ($1, $2)\nparams: book_1, 10000'

    const result = await tripsService.reserveTrip(
      makeFakeDb(state),
      { envelopeId: state.envelope.id },
      {
        submitReservationPlan: async (
          input: Parameters<ReserveTripDeps["submitReservationPlan"]>[0],
        ) => ({
          reservationPlanId: input.reservationPlan.id,
          status: "failed",
          reserved: [],
          failures: [{ componentId: "trcp_1", reason: rawReason }],
          compensations: [],
          warnings: [rawReason],
        }),
      },
    )

    expect(result.envelope.status).toBe("failed")
    expect(result.failures).toEqual([
      {
        componentId: "trcp_1",
        reason: "component_reservation_failed",
        code: "component_reservation_failed",
      },
    ])
    expect(result.warnings).toEqual(["component_reservation_failed"])
    expect(state.components[0]?.warningCodes).toEqual(["component_reservation_failed"])
    expect(state.reservationPlans[0]?.failures).toEqual(result.failures)
    expect(JSON.stringify(result)).not.toContain("insert into")
    expect(JSON.stringify(state.reservationPlans[0])).not.toContain("params:")
  })

  it("does not dispatch provider reservations when the envelope reserve claim loses a race", async () => {
    const state = {
      envelope: envelope(),
      components: [component({ id: "trcp_1" })],
      events: [],
      reservationPlans: [] as TripReservationPlan[],
    }
    const submitReservationPlan = vi.fn()

    const result = await tripsService.reserveTrip(
      makeFakeDb(state, { failReserveClaim: true }),
      { envelopeId: state.envelope.id, idempotencyKey: "attempt-2" },
      { submitReservationPlan },
    )

    expect(submitReservationPlan).not.toHaveBeenCalled()
    expect(result.envelope.status).toBe("reserve_in_progress")
    expect(result.failures).toEqual([
      {
        componentId: "trcp_1",
        reason: "reservation_in_progress",
        code: "reservation_in_progress",
      },
    ])
    expect(result.reserved).toEqual([])
    // No reservation plan is created for a lost claim.
    expect(state.reservationPlans).toEqual([])
  })

  it("releases the envelope reserve claim when unavailable preflight fails before provider dispatch", async () => {
    const state = {
      envelope: envelope(),
      components: [component({ id: "trcp_1" })],
      events: [],
      reservationPlans: [] as TripReservationPlan[],
    }
    const submitReservationPlan = vi.fn()

    const result = await tripsService.reserveTrip(
      makeFakeDb(state),
      { envelopeId: state.envelope.id, idempotencyKey: "attempt-3" },
      {
        quoteCatalogComponentBeforeReserve: async () => ({
          binding: false as const,
          available: false,
          requirements: {} as never,
          unavailableReason: "target_not_bookable" as const,
        }),
        submitReservationPlan,
      },
    )

    expect(submitReservationPlan).not.toHaveBeenCalled()
    expect(result.envelope.status).toBe("priced")
    expect(result.envelope.reserveIdempotencyKey).toBeNull()
    expect(result.failures).toEqual([
      expect.objectContaining({
        componentId: "trcp_1",
        reason: "target_not_bookable",
        code: "unavailable",
      }),
    ])
    // The claim is released so a retry can re-enter from `priced`.
    expect(state.envelope.status).toBe("priced")
    expect(state.envelope.reserveIdempotencyKey).toBeNull()
    expect(state.reservationPlans).toEqual([])
  })

  it("releases the envelope reserve claim when preflight throws before provider dispatch", async () => {
    const state = {
      envelope: envelope(),
      components: [component({ id: "trcp_1" })],
      events: [],
      reservationPlans: [] as TripReservationPlan[],
    }
    const submitReservationPlan = vi.fn()

    await expect(
      tripsService.reserveTrip(
        makeFakeDb(state),
        { envelopeId: state.envelope.id, idempotencyKey: "attempt-4" },
        {
          quoteCatalogComponentBeforeReserve: async () => {
            throw new Error("booking_engine_unavailable")
          },
          submitReservationPlan,
        },
      ),
    ).rejects.toThrow("booking_engine_unavailable")

    expect(submitReservationPlan).not.toHaveBeenCalled()
    expect(state.envelope.status).toBe("priced")
    expect(state.envelope.reserveIdempotencyKey).toBeNull()
    expect(state.reservationPlans).toEqual([])
  })

  it("releases the envelope reserve claim when an accommodation component has no date range", async () => {
    const state = {
      envelope: envelope(),
      components: [
        component({
          id: "trcp_stay",
          entityModule: "accommodations",
          entityId: "acc_123",
          metadata: {
            bookingDraftV1: {
              entity: { module: "accommodations", id: "acc_123", sourceKind: "owned" },
              configure: { pax: { adult: 2 } },
            },
          },
        }),
      ],
      events: [],
      reservationPlans: [] as TripReservationPlan[],
    }
    const quoteCatalogComponentBeforeReserve = vi.fn()
    const submitReservationPlan = vi.fn()

    await expect(
      tripsService.reserveTrip(
        makeFakeDb(state),
        { envelopeId: state.envelope.id, idempotencyKey: "attempt-5" },
        {
          quoteCatalogComponentBeforeReserve,
          submitReservationPlan,
        },
      ),
    ).rejects.toThrow(/valid check-in\/check-out date range/)

    expect(quoteCatalogComponentBeforeReserve).not.toHaveBeenCalled()
    expect(submitReservationPlan).not.toHaveBeenCalled()
    expect(state.envelope.status).toBe("priced")
    expect(state.envelope.reserveIdempotencyKey).toBeNull()
    expect(state.reservationPlans).toEqual([])
  })
})
