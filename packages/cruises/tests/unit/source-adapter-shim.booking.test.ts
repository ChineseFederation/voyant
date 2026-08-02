import { describe, expect, it } from "vitest"
import { MockCruiseAdapter } from "../../src/adapters/mock.js"
import { cruiseAdapterToSourceAdapter } from "../../src/adapters/source-adapter-shim.js"
import { encodeSourceRef } from "../../src/lib/key.js"

describe("cruise SourceAdapter booking tracer", () => {
  it("quotes and reserves a sailing with replay-safe supplier idempotency", async () => {
    const cruiseRef = { externalId: "cruise-1" }
    const shipRef = { externalId: "ship-1" }
    const sailingRef = { externalId: "sailing-1" }
    const cabinCategoryRef = { externalId: "balcony" }
    const cruise = new MockCruiseAdapter({ name: "tracer" })
    cruise.addCruise(
      {
        sourceRef: cruiseRef,
        name: "Northern Lights",
        slug: "northern-lights",
        cruiseType: "ocean",
        lineName: "Example Line",
        defaultShipRef: shipRef,
        nights: 7,
      },
      [
        {
          sourceRef: sailingRef,
          cruiseRef,
          shipRef,
          departureDate: "2027-02-01",
          returnDate: "2027-02-08",
          salesStatus: "open",
        },
      ],
    )
    cruise.setSailingPricing(sailingRef, [
      {
        cabinCategoryRef,
        occupancy: 2,
        fareCode: "FLEX",
        currency: "EUR",
        pricePerPerson: "1250.00",
        secondGuestPricePerPerson: "950.00",
        components: [
          {
            kind: "tax",
            amount: "100.00",
            currency: "EUR",
            direction: "addition",
            perPerson: true,
          },
          {
            kind: "onboard_credit",
            amount: "50.00",
            currency: "EUR",
            direction: "credit",
            perPerson: false,
          },
        ],
        availability: "available",
      },
    ])
    const adapter = cruiseAdapterToSourceAdapter(cruise)
    const entityId = `crus_${encodeSourceRef(cruiseRef)}`
    const parameters = {
      sailingId: encodeSourceRef(sailingRef),
      cabinCategoryId: encodeSourceRef(cabinCategoryRef),
      occupancy: 2,
      fareCode: "FLEX",
    }

    await expect(
      adapter.liveResolve?.(
        { connection_id: "conn_cruise" },
        {
          ids: [entityId],
          source_refs: { [entityId]: encodeSourceRef(cruiseRef) },
          scope: { locale: "en", audience: "customer", market: "default" },
          parameters,
        },
      ),
    ).resolves.toMatchObject({
      values: { [entityId]: { priceCents: 235000, currency: "EUR" } },
    })

    const request = {
      entity_module: "cruises",
      entity_id: entityId,
      source_ref: encodeSourceRef(cruiseRef),
      parameters,
      party: {
        contact: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.test" },
        passengers: [
          { firstName: "Ada", lastName: "Lovelace", travelerCategory: "adult" },
          { firstName: "Charles", lastName: "Babbage", travelerCategory: "adult" },
        ],
      },
      idempotency_key: "bses_1:commit_1:reserve",
    }
    const first = await adapter.reserve?.({ connection_id: "conn_cruise" }, request)
    const replay = await adapter.reserve?.({ connection_id: "conn_cruise" }, request)

    expect(first).toMatchObject({ status: "confirmed" })
    expect(replay?.upstream_ref).toBe(first?.upstream_ref)
    expect(cruise.bookingCount).toBe(1)
    await expect(
      adapter.getReservation?.(
        { connection_id: "conn_cruise" },
        { upstream_ref: first?.upstream_ref ?? "missing" },
      ),
    ).resolves.toMatchObject({ status: "confirmed" })
    await expect(
      adapter.getReservation?.(
        { connection_id: "conn_cruise" },
        { idempotency_key: request.idempotency_key },
      ),
    ).resolves.toMatchObject({ upstream_ref: first?.upstream_ref, status: "confirmed" })
  })

  it("maps only explicit secured connector statuses to a secured reservation", async () => {
    const cruiseRef = { externalId: "cruise-status" }
    const shipRef = { externalId: "ship-status" }
    const sailingRef = { externalId: "sailing-status" }
    const cabinCategoryRef = { externalId: "suite" }
    const cruise = new MockCruiseAdapter({ name: "status-tracer" })
    cruise.addCruise(
      {
        sourceRef: cruiseRef,
        name: "Status Cruise",
        slug: "status-cruise",
        cruiseType: "ocean",
        lineName: "Example Line",
        defaultShipRef: shipRef,
        nights: 3,
      },
      [
        {
          sourceRef: sailingRef,
          cruiseRef,
          shipRef,
          departureDate: "2027-03-01",
          returnDate: "2027-03-04",
          salesStatus: "open",
        },
      ],
    )
    const adapter = cruiseAdapterToSourceAdapter(cruise)
    const request = {
      entity_module: "cruises",
      entity_id: `crus_${encodeSourceRef(cruiseRef)}`,
      parameters: {
        sailingId: encodeSourceRef(sailingRef),
        cabinCategoryId: encodeSourceRef(cabinCategoryRef),
        occupancy: 1,
      },
      party: {
        contact: { firstName: "Ada", lastName: "Lovelace" },
        passengers: [{ firstName: "Ada", lastName: "Lovelace" }],
      },
    }

    cruise.setBookingResult(sailingRef, cabinCategoryRef, {
      connectorBookingRef: "UP-FAILED",
      connectorStatus: "cancelled",
    })
    await expect(
      adapter.reserve?.(
        { connection_id: "conn_cruise" },
        { ...request, idempotency_key: "failed-key" },
      ),
    ).resolves.toMatchObject({ upstream_ref: "UP-FAILED", status: "failed" })

    cruise.setBookingResult(sailingRef, cabinCategoryRef, {
      connectorBookingRef: "UP-UNKNOWN",
      connectorStatus: "deposit_required",
    })
    await expect(
      adapter.reserve?.(
        { connection_id: "conn_cruise" },
        { ...request, idempotency_key: "unknown-key" },
      ),
    ).resolves.toMatchObject({ upstream_ref: "UP-UNKNOWN", status: "pending" })
    await expect(
      adapter.getReservation?.({ connection_id: "conn_cruise" }, { upstream_ref: "UP-UNKNOWN" }),
    ).resolves.toMatchObject({ status: "pending" })
  })
})
