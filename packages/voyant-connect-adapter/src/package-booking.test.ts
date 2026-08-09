import type {
  ReserveRequest,
  SourceAdapter,
} from "@voyant-travel/catalog-contracts/adapter/contract"
import { ReservationDispatchError } from "@voyant-travel/catalog-contracts/adapter/contract"
import type { PackageOffer, VoyantConnectClient } from "@voyant-travel/connect-sdk"
import { describe, expect, it, vi } from "vitest"

import { withConnectPackageBookingLifecycle } from "./package-booking.js"

const expectedPrice = { currency: "EUR", totalAmountMinor: 100_000 }

describe("Voyant Connect package booking lifecycle", () => {
  it("revalidates, locks, and confirms through the server-resolved connection", async () => {
    const current = offer()
    const { adapter, client } = fixture(current)

    await expect(
      adapter.reserve?.({ connection_id: "conn_server" }, request()),
    ).resolves.toMatchObject({
      upstream_ref: "package:booking_1",
      status: "confirmed",
    })

    expect(client.packages.lock).toHaveBeenCalledWith("conn_server", current)
    expect(client.packages.search).toHaveBeenCalledWith(
      "conn_server",
      expect.objectContaining({
        departure: { airportCodes: ["OTP"] },
        accommodationIds: ["hotel_1"],
        departureDateFrom: "2026-09-10",
        departureDateTo: "2026-09-10",
        nights: { min: 5, max: 5 },
      }),
    )
    expect(client.packages.confirm).toHaveBeenCalledWith(
      "conn_server",
      expect.objectContaining({ holdId: "hold_1" }),
      { idempotencyKey: "bses_1:commit_1:reserve" },
    )
    expect(client.packages.lock).not.toHaveBeenCalledWith("conn_browser", expect.anything())
  })

  it("revalidates canonical traveler bands without widening children into adults", async () => {
    const { adapter, client } = fixture(offer())
    const mixedParty = request()
    mixedParty.parameters.draft = {
      configure: { pax: { adult: 2, "child:pricing_1": 1, infant: 1 } },
    }

    await adapter.reserve?.({ connection_id: "conn_server" }, mixedParty)

    expect(client.packages.search).toHaveBeenCalledWith(
      "conn_server",
      expect.objectContaining({ occupancy: { adults: 2, children: 1, infants: 1 } }),
    )
  })

  it("fails closed before hold when no offer matches the stable rate pins", async () => {
    const { adapter, client } = fixture(
      offer({ stay: { ...offer().stay, ratePlanId: "rate_changed" } }),
    )

    await expect(adapter.reserve?.({ connection_id: "conn_server" }, request())).resolves.toEqual({
      upstream_ref: "package-offer:product_1",
      status: "failed",
      upstream_payload: { reason: "package_offer_unavailable" },
    })
    expect(client.packages.lock).not.toHaveBeenCalled()
  })

  it("fails before hold when the provider price moved from the immutable Session Quote", async () => {
    const { adapter, client } = fixture(
      offer({ pricing: { ...offer().pricing, total: money(100_001) } }),
    )

    await expect(adapter.reserve?.({ connection_id: "conn_server" }, request())).resolves.toEqual({
      upstream_ref: "package-offer:product_1",
      status: "failed",
      upstream_payload: { reason: "package_price_changed" },
    })
    expect(client.packages.lock).not.toHaveBeenCalled()
    expect(client.packages.confirm).not.toHaveBeenCalled()
  })

  it("releases a hold whose provider snapshot changed before confirmation", async () => {
    const { adapter, client } = fixture(offer(), {
      heldOffer: offer({ stay: { ...offer().stay, board: "HB" } }),
    })

    await expect(adapter.reserve?.({ connection_id: "conn_server" }, request())).resolves.toEqual({
      upstream_ref: "package-offer:product_1",
      status: "failed",
      upstream_payload: { reason: "package_hold_changed" },
    })
    expect(client.packages.releaseLock).toHaveBeenCalledWith("conn_server", "hold_1")
    expect(client.packages.confirm).not.toHaveBeenCalled()
  })

  it("does not release an ambiguous confirmation and reports possibly-sent certainty", async () => {
    const { adapter, client } = fixture(offer(), { confirmError: new Error("timeout") })

    const error = await adapter
      .reserve?.({ connection_id: "conn_server" }, request())
      .catch((value) => value)

    expect(error).toBeInstanceOf(ReservationDispatchError)
    expect(error).toMatchObject({
      certainty: "possibly_sent",
      errorClass: "package_confirmation_in_doubt",
    })
    expect(client.packages.releaseLock).not.toHaveBeenCalled()
  })

  it("fails closed without a server-resolved connection", async () => {
    const { adapter, client } = fixture(offer())

    const error = await adapter.reserve?.({ connection_id: "engine" }, request()).catch((e) => e)

    expect(error).toMatchObject({
      certainty: "not_sent",
      errorClass: "package_connection_unavailable",
    })
    expect(client.packages.lock).not.toHaveBeenCalled()
  })

  it("fails closed when the stable package selection is incomplete", async () => {
    const { adapter, client } = fixture(offer())
    const incomplete = request()
    delete incomplete.parameters.departureAirportCode

    await expect(adapter.reserve?.({ connection_id: "conn_server" }, incomplete)).resolves.toEqual({
      upstream_ref: "package-offer:product_1",
      status: "failed",
      upstream_payload: { reason: "package_offer_unavailable" },
    })
    expect(client.packages.lock).not.toHaveBeenCalled()
  })
})

function fixture(
  currentOffer: PackageOffer,
  options: { heldOffer?: PackageOffer; confirmError?: Error } = {},
) {
  const liveResolve = vi.fn(async () => ({
    values: { product_1: { offer: currentOffer } },
  }))
  const base: SourceAdapter = {
    kind: "voyant-connect",
    capabilities: {
      verticals: ["products"],
      supportsLiveResolution: true,
      supportsDriftDetection: false,
      supportsBookingForwarding: true,
      postBookOperations: ["cancel", "status"],
    },
    liveResolve,
    reserve: vi.fn(),
  }
  const confirm = options.confirmError
    ? vi.fn().mockRejectedValue(options.confirmError)
    : vi.fn().mockResolvedValue({ id: "booking_1", status: "confirmed" })
  const client = {
    packages: {
      search: vi.fn().mockResolvedValue({ offers: [currentOffer] }),
      lock: vi.fn().mockResolvedValue({
        id: "hold_1",
        offerSnapshot: options.heldOffer ?? currentOffer,
        status: "active",
        expiresAt: "2099-01-01T00:00:00.000Z",
      }),
      releaseLock: vi.fn().mockResolvedValue({}),
      confirm,
    },
  } as unknown as VoyantConnectClient
  return { adapter: withConnectPackageBookingLifecycle(base, client), client }
}

function request(): ReserveRequest {
  return {
    entity_module: "products",
    entity_id: "product_1",
    source_ref: "hotel_1",
    scope: { locale: "ro-RO", market: "market_ro", audience: "customer", currency: "EUR" },
    parameters: {
      connectRoute: "packages",
      bookingQuote: expectedPrice,
      // A browser-supplied selector must not override SourceAdapterContext.
      connectionId: "conn_browser",
      departureDate: "2026-09-10",
      departureAirportCode: "OTP",
      nights: 5,
      roomTypeId: "room_1",
      ratePlanId: "rate_1:AI",
      board: "AI",
      travelers: [{ category: "adult", firstName: "Ana", lastName: "Pop", isPrimary: true }],
      leadTraveler: { category: "adult", firstName: "Ana", lastName: "Pop", isPrimary: true },
    },
    party: { contact: { email: "ana@example.test" } },
    idempotency_key: "bses_1:commit_1:reserve",
  }
}

function money(amountMinor: number) {
  return { amountMinor, currency: "EUR", currencyPrecision: 2 }
}

function offer(overrides: Partial<PackageOffer> = {}): PackageOffer {
  return {
    id: "offer_1",
    connectionId: "conn_server",
    supplierId: "supplier_1",
    productRef: { entityModule: "products", entityId: "product_1" },
    stay: {
      ref: { entityModule: "accommodations", entityId: "hotel_1" },
      roomTypeId: "room_1",
      ratePlanId: "rate_1:AI",
      board: "AI",
      checkIn: "2026-09-10",
      checkOut: "2026-09-15",
      nights: 5,
      occupancy: { adults: 2 },
    },
    flights: [{ origin: "OTP", destination: "FCO" }],
    pricing: { perPerson: money(50_000), total: money(100_000) },
    cancellationPolicy: { deadlines: [] },
    expiresAt: "2099-01-01T00:00:00.000Z",
    ...overrides,
  }
}
