import { describe, expect, it, vi } from "vitest"

import type { FlightConnectorAdapter } from "./contract/adapter.js"
import type { FlightOffer, FlightOrder } from "./contract/types.js"
import { FLIGHT_CAPABILITIES } from "./contract/types.js"
import {
  type BoundPublicApiFlightOffer,
  createProviderFirstFlightBookingLifecycle,
  PublicApiFlightLifecycleError,
  type PublicApiFlightMutationOutcome,
  type PublicApiFlightOperationClaimInput,
  type PublicApiFlightOperationStore,
} from "./public-api-booking-lifecycle.js"

const now = new Date("2030-01-01T00:00:00.000Z")
const authority = {
  channelId: "channel_web",
  marketId: "market_ro",
  locale: "ro-RO",
  currency: "EUR",
}

describe("provider-first Storefront flight booking lifecycle", () => {
  it("requotes only the exact admitted offer/connection binding and rejects scope drift", async () => {
    const adapter = adapterStub()
    const list = vi.fn(async () => [
      {
        connectionId: "connection_exact",
        adapter,
        context: { connectionId: "attacker_override" } as never,
      },
    ])
    const assertActivePublicApiScope = vi.fn(async () => {})
    const lifecycle = createProviderFirstFlightBookingLifecycle({
      assertActivePublicApiScope,
      listAdmittedShoppingSources: list,
      operations: operationStore(),
      now: () => now,
    })

    const lock = await lifecycle.requote({
      context: authority,
      binding: binding(),
      expectedRevision: 0,
    })

    expect(assertActivePublicApiScope).toHaveBeenCalledWith(authority)
    expect(list).toHaveBeenCalledWith(authority)
    expect(adapter.priceOffer).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: "connection_exact" }),
      { offerId: "offer_secret", offer: offer() },
    )
    expect(lock).toMatchObject({
      authority,
      connectionId: "connection_exact",
      revision: 1,
      expiresAt: "2030-01-01T00:10:00.000Z",
    })

    await expect(
      lifecycle.requote({
        context: { ...authority, marketId: "market_other" },
        binding: binding(),
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ code: "flight_scope_mismatch" })
    expect(adapter.priceOffer).toHaveBeenCalledTimes(1)
  })

  it("holds with a hard-coded provider intent and replays the durable outcome", async () => {
    const adapter = adapterStub()
    const operations = operationStore()
    const lifecycle = lifecycleFor(adapter, operations)
    const lock = await lifecycle.requote({
      context: authority,
      binding: binding(),
      expectedRevision: 0,
    })
    const request = {
      context: authority,
      lock,
      expectedRevision: 1,
      idempotencyKey: "hold_once",
      passengers: [
        {
          passengerId: "pax_1",
          type: "adult" as const,
          firstName: "Ana",
          lastName: "Test",
          dateOfBirth: "1990-01-01",
        },
      ],
    }

    const first = await lifecycle.hold(request)
    const replay = await lifecycle.hold(request)

    expect(first).toMatchObject({
      kind: "held",
      hold: { orderId: "order_1", revision: 2, connectionId: "connection_exact" },
    })
    expect(replay).toEqual(first)
    expect(adapter.bookFlight).toHaveBeenCalledTimes(1)
    expect(adapter.bookFlight).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "connection_exact",
        idempotencyKey: "hold_once",
      }),
      expect.objectContaining({
        offerId: "offer_secret",
        offer: offer(),
        paymentIntent: { type: "hold" },
      }),
    )
  })

  it("fails closed when the provider cannot hold and compensates an invalid hold", async () => {
    const unsupported = adapterStub({ holds: false })
    const unsupportedLifecycle = lifecycleFor(unsupported, operationStore())
    const unsupportedLock = await unsupportedLifecycle.requote({
      context: authority,
      binding: binding(),
      expectedRevision: 0,
    })
    await expect(
      unsupportedLifecycle.hold({
        context: authority,
        lock: unsupportedLock,
        expectedRevision: 1,
        idempotencyKey: "unsupported",
        passengers: [passenger()],
      }),
    ).rejects.toMatchObject({ code: "flight_hold_unsupported" })
    expect(unsupported.bookFlight).not.toHaveBeenCalled()

    const invalid = adapterStub({ order: ticketedOrder() })
    const invalidLifecycle = lifecycleFor(invalid, operationStore())
    const invalidLock = await invalidLifecycle.requote({
      context: authority,
      binding: binding(),
      expectedRevision: 0,
    })
    await expect(
      invalidLifecycle.hold({
        context: authority,
        lock: invalidLock,
        expectedRevision: 1,
        idempotencyKey: "invalid_hold",
        passengers: [passenger()],
      }),
    ).resolves.toEqual({
      kind: "compensated",
      reason: "provider_did_not_return_a_live_hold",
    })
    expect(invalid.cancelOrder).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: "connection_exact" }),
      "order_1",
      "operational",
    )
  })

  it("commits the exact held order idempotently and reconciles an ambiguous provider response", async () => {
    const ticketed = ticketedOrder()
    const adapter = adapterStub({
      ticketError: new TypeError("network"),
      getOrderResult: ticketed,
    })
    const operations = operationStore()
    const lifecycle = lifecycleFor(adapter, operations)
    const lock = await lifecycle.requote({
      context: authority,
      binding: binding(),
      expectedRevision: 0,
    })
    const held = await lifecycle.hold({
      context: authority,
      lock,
      expectedRevision: 1,
      idempotencyKey: "hold_1",
      passengers: [passenger()],
    })
    if (held.kind !== "held") throw new Error("expected held fixture")

    const first = await lifecycle.commit({
      context: authority,
      hold: held.hold,
      expectedRevision: 2,
      idempotencyKey: "commit_1",
    })
    const replay = await lifecycle.commit({
      context: authority,
      hold: held.hold,
      expectedRevision: 2,
      idempotencyKey: "commit_1",
    })

    expect(first).toEqual({ kind: "committed", order: ticketed })
    expect(replay).toEqual(first)
    expect(adapter.ticketOrder).toHaveBeenCalledTimes(1)
    expect(adapter.getOrder).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: "connection_exact" }),
      "order_1",
    )
  })

  it("rejects revision and idempotency drift before a second supplier mutation", async () => {
    const adapter = adapterStub()
    const operations = operationStore()
    const lifecycle = lifecycleFor(adapter, operations)
    const lock = await lifecycle.requote({
      context: authority,
      binding: binding(),
      expectedRevision: 0,
    })
    await lifecycle.hold({
      context: authority,
      lock,
      expectedRevision: 1,
      idempotencyKey: "same_key",
      passengers: [passenger()],
    })

    await expect(
      lifecycle.hold({
        context: authority,
        lock,
        expectedRevision: 1,
        idempotencyKey: "same_key",
        passengers: [{ ...passenger(), lastName: "Changed" }],
      }),
    ).rejects.toMatchObject({ code: "flight_idempotency_conflict" })
    await expect(
      lifecycle.hold({
        context: authority,
        lock,
        expectedRevision: 0,
        idempotencyKey: "other_key",
        passengers: [passenger()],
      }),
    ).rejects.toBeInstanceOf(PublicApiFlightLifecycleError)
    expect(adapter.bookFlight).toHaveBeenCalledTimes(1)
  })
})

function lifecycleFor(adapter: FlightConnectorAdapter, operations: PublicApiFlightOperationStore) {
  return createProviderFirstFlightBookingLifecycle({
    assertActivePublicApiScope: async () => {},
    listAdmittedShoppingSources: async () => [{ connectionId: "connection_exact", adapter }],
    operations,
    now: () => now,
  })
}

function binding(): BoundPublicApiFlightOffer {
  return { authority, connectionId: "connection_exact", offer: offer(), revision: 0 }
}

function offer(): FlightOffer {
  return {
    offerId: "offer_secret",
    source: "provider_secret",
    itineraries: [
      {
        segments: [
          {
            segmentId: "segment_secret",
            carrierCode: "RO",
            flightNumber: "101",
            departure: { iataCode: "OTP", at: "2030-02-01T08:00:00+02:00" },
            arrival: { iataCode: "LHR", at: "2030-02-01T10:00:00+00:00" },
            cabin: "economy",
          },
        ],
      },
    ],
    fareBreakdowns: [],
    totalPrice: { amount: "100.00", currency: "EUR" },
    expiresAt: "2030-01-01T00:20:00.000Z",
    providerData: { secret: true },
  }
}

function passenger() {
  return {
    passengerId: "pax_1",
    type: "adult" as const,
    firstName: "Ana",
    lastName: "Test",
    dateOfBirth: "1990-01-01",
  }
}

function order(overrides: Partial<FlightOrder> = {}): FlightOrder {
  return {
    orderId: "order_1",
    status: "confirmed",
    offer: offer(),
    passengers: [passenger()],
    totalPrice: offer().totalPrice,
    paymentDeadline: "2030-01-01T00:15:00.000Z",
    createdAt: "2030-01-01T00:00:01.000Z",
    ...overrides,
  }
}

function ticketedOrder(): FlightOrder {
  const ticketed = order({ status: "ticketed" })
  delete ticketed.paymentDeadline
  return ticketed
}

function adapterStub(
  options: {
    holds?: boolean
    order?: FlightOrder
    getOrderResult?: FlightOrder
    ticketError?: Error
  } = {},
): FlightConnectorAdapter {
  const current = options.order ?? order()
  return {
    capabilities: {
      provider: "provider_secret",
      declared: options.holds === false ? [] : [FLIGHT_CAPABILITIES.HOLDS],
    },
    searchFlights: vi.fn(async () => ({ offers: [offer()] })),
    priceOffer: vi.fn(async () => ({ offer: offer(), valid: true })),
    bookFlight: vi.fn(async () => ({ order: current })),
    getOrder: vi.fn(async () => ({ order: options.getOrderResult ?? current })),
    cancelOrder: vi.fn(async () => ({ order: order({ status: "cancelled" }) })),
    ticketOrder: vi.fn(async () => {
      if (options.ticketError) throw options.ticketError
      return { order: ticketedOrder() }
    }),
  }
}

function operationStore(): PublicApiFlightOperationStore {
  const rows = new Map<
    string,
    { fingerprint: string; operationId: string; outcome?: PublicApiFlightMutationOutcome }
  >()
  return {
    async claim(input: PublicApiFlightOperationClaimInput) {
      const key = `${input.channelId}:${input.operation}:${input.idempotencyKey}`
      const existing = rows.get(key)
      if (existing) {
        if (existing.fingerprint !== input.requestFingerprint)
          return { status: "conflict" as const }
        if (existing.outcome) return { status: "replay" as const, outcome: existing.outcome }
        return { status: "in_progress" as const, operationId: existing.operationId }
      }
      const operationId = `operation_${rows.size + 1}`
      rows.set(key, { fingerprint: input.requestFingerprint, operationId })
      return { status: "claimed" as const, operationId }
    },
    async complete(operationId, outcome) {
      for (const row of rows.values()) {
        if (row.operationId === operationId) row.outcome = outcome
      }
    },
    async markInDoubt(operationId, outcome) {
      for (const row of rows.values()) {
        if (row.operationId === operationId) row.outcome = outcome
      }
    },
  }
}
