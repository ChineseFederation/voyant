import type {
  ReserveRequest,
  SourceAdapter,
} from "@voyant-travel/catalog-contracts/adapter/contract"
import { ReservationDispatchError } from "@voyant-travel/catalog-contracts/adapter/contract"
import type { StayOffer, VoyantConnectClient } from "@voyant-travel/connect-sdk"
import { describe, expect, it, vi } from "vitest"

import { withConnectStayBookingLifecycle } from "./stay-booking.js"

describe("Voyant Connect stay booking lifecycle", () => {
  it("re-searches, locks, and confirms the exact server-owned stay", async () => {
    const { adapter, client, current } = fixture()

    await expect(adapter.reserve?.({ connection_id: "conn_server" }, request())).resolves.toEqual(
      expect.objectContaining({ upstream_ref: "stay:booking_1", status: "confirmed" }),
    )
    expect(client.stays.search).toHaveBeenCalledWith("conn_server", {
      accommodationIds: ["hotel_source"],
      checkIn: "2026-09-10",
      checkOut: "2026-09-15",
      rooms: [{ adults: 2 }],
      locale: "ro-RO",
      limit: 100,
    })
    expect(client.stays.lock).toHaveBeenCalledWith("conn_server", current)
    expect(client.stays.confirm).toHaveBeenCalledWith(
      "conn_server",
      expect.objectContaining({
        holdId: "hold_1",
        guestsByRoom: [[expect.any(Object), expect.any(Object)]],
      }),
      { idempotencyKey: "bses_1:commit_1:reserve" },
    )
  })

  it("fails before hold when the immutable Session quote moved", async () => {
    const { adapter, client } = fixture({ current: offer(100_001) })

    await expect(adapter.reserve?.({ connection_id: "conn_server" }, request())).resolves.toEqual({
      upstream_ref: "stay-offer:acc_canonical",
      status: "failed",
      upstream_payload: { reason: "stay_price_changed" },
    })
    expect(client.stays.lock).not.toHaveBeenCalled()
  })

  it("releases a changed hold and never confirms it", async () => {
    const changed = offer(100_000)
    changed.rooms[0]!.ratePlanId = "rate_changed"
    const { adapter, client } = fixture({ held: changed })

    await expect(adapter.reserve?.({ connection_id: "conn_server" }, request())).resolves.toEqual(
      expect.objectContaining({
        status: "failed",
        upstream_payload: { reason: "stay_hold_changed" },
      }),
    )
    expect(client.stays.releaseLock).toHaveBeenCalledWith("conn_server", "hold_1")
    expect(client.stays.confirm).not.toHaveBeenCalled()
  })

  it("does not release an ambiguous confirmation", async () => {
    const { adapter, client } = fixture({ confirmError: new Error("timeout") })

    const error = await adapter
      .reserve?.({ connection_id: "conn_server" }, request())
      .catch((value) => value)

    expect(error).toBeInstanceOf(ReservationDispatchError)
    expect(error).toMatchObject({
      certainty: "possibly_sent",
      errorClass: "stay_confirmation_in_doubt",
    })
    expect(client.stays.releaseLock).not.toHaveBeenCalled()
  })
})

function fixture(options: { current?: StayOffer; held?: StayOffer; confirmError?: Error } = {}) {
  const current = options.current ?? offer(100_000)
  const confirm = options.confirmError
    ? vi.fn().mockRejectedValue(options.confirmError)
    : vi.fn().mockResolvedValue({ id: "booking_1", status: "confirmed" })
  const client = {
    stays: {
      search: vi.fn().mockResolvedValue({ offers: [current] }),
      lock: vi.fn().mockResolvedValue({
        id: "hold_1",
        offerSnapshot: options.held ?? current,
        status: "active",
        expiresAt: "2099-01-01T00:00:00.000Z",
      }),
      releaseLock: vi.fn().mockResolvedValue({}),
      confirm,
    },
  } as unknown as VoyantConnectClient
  const base: SourceAdapter = {
    kind: "voyant-connect",
    capabilities: {
      verticals: ["accommodations"],
      supportsLiveResolution: true,
      supportsDriftDetection: false,
      supportsBookingForwarding: true,
      postBookOperations: ["cancel", "status"],
    },
    reserve: vi.fn(),
  }
  return { current, client, adapter: withConnectStayBookingLifecycle(base, client) }
}

function request(): ReserveRequest {
  return {
    entity_module: "accommodations",
    entity_id: "acc_canonical",
    source_ref: "hotel_source",
    scope: { locale: "ro-RO", market: "market_ro", audience: "customer", currency: "EUR" },
    parameters: {
      connectRoute: "stays",
      bookingQuote: { currency: "EUR", totalAmountMinor: 100_000 },
      checkIn: "2026-09-10",
      checkOut: "2026-09-15",
      rooms: [{ roomTypeId: "room_1", ratePlanId: "rate_1", occupancy: { adults: 2 } }],
      connectionId: "conn_browser",
    },
    party: {
      contact: { email: "ana@example.test" },
      passengers: [
        { travelerCategory: "adult", firstName: "Ana", lastName: "Pop", email: "ana@example.test" },
        { travelerCategory: "adult", firstName: "Ion", lastName: "Pop" },
      ],
    },
    idempotency_key: "bses_1:commit_1:reserve",
  }
}

function offer(amountMinor: number): StayOffer {
  const money = { amountMinor, currency: "EUR", currencyPrecision: 2 }
  return {
    id: "offer_1",
    connectionId: "conn_server",
    accommodationId: "hotel_source",
    rooms: [
      {
        roomTypeId: "room_1",
        ratePlanId: "rate_1",
        occupancy: { adults: 2 },
        nights: 5,
        nightlyBreakdown: [],
        subtotal: money,
        taxes: { ...money, amountMinor: 0 },
        fees: { ...money, amountMinor: 0 },
        total: money,
        cancellationPolicy: { deadlines: [] },
      },
    ],
    totals: {
      subtotal: money,
      taxes: { ...money, amountMinor: 0 },
      fees: { ...money, amountMinor: 0 },
      total: money,
    },
    expiresAt: "2099-01-01T00:00:00.000Z",
  }
}
