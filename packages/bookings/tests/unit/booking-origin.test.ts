import { describe, expect, it, vi } from "vitest"

import {
  toBookingOriginInsert,
  toCatalogReservationBookingOriginInput,
  toDirectB2CBookingOriginInput,
  upsertBookingOrigin,
} from "../../src/service-origin.js"

describe("booking origins", () => {
  it("normalizes the supported booking provenance targets", () => {
    const now = new Date("2026-06-13T12:00:00.000Z")

    const origin = toBookingOriginInsert(
      {
        bookingId: "book_1797",
        originSource: "accepted_proposal_version",
        proposalVersionId: "prvr_1797",
        tripSnapshotId: "trsn_1797",
        reservationPlanId: "trplan_1797",
        catalogPriceResponseId: "cquo_1797",
        catalogSnapshotId: "bcsn_1797",
        providerSourceKind: "voyant-connect",
        providerSourceProvider: "cruise-provider",
        providerSourceConnectionId: "src_conn_1797",
        providerSourceRef: "sailing_1797",
        providerOrderRef: "provider_order_1797",
        channelId: "chan_1797",
        legacyTransactionOfferId: "off_legacy_1797",
        legacyTransactionOrderId: "ord_legacy_1797",
        metadata: { channel: "proposal" },
      },
      now,
    )

    expect(origin).toEqual({
      bookingId: "book_1797",
      originSource: "accepted_proposal_version",
      proposalVersionId: "prvr_1797",
      tripSnapshotId: "trsn_1797",
      reservationPlanId: "trplan_1797",
      catalogPriceResponseId: "cquo_1797",
      catalogSnapshotId: "bcsn_1797",
      providerSourceKind: "voyant-connect",
      providerSourceProvider: "cruise-provider",
      providerSourceConnectionId: "src_conn_1797",
      providerSourceRef: "sailing_1797",
      providerOrderRef: "provider_order_1797",
      channelId: "chan_1797",
      legacyTransactionOfferId: "off_legacy_1797",
      legacyTransactionOrderId: "ord_legacy_1797",
      legacyTransactionIds: {
        offerId: "off_legacy_1797",
        orderId: "ord_legacy_1797",
      },
      metadata: { channel: "proposal" },
      createdAt: now,
      updatedAt: now,
    })
  })

  it("builds direct public-surface provenance from booking session items", () => {
    const input = toDirectB2CBookingOriginInput({
      bookingId: "book_direct_1797",
      externalBookingRef: "storefront-cart-123",
      channelId: "chan_direct",
      items: [
        { sourceSnapshotId: "bcsn_1" },
        { sourceSnapshotId: "bcsn_1" },
        { sourceSnapshotId: "bcsn_2" },
      ],
    })

    expect(input).toEqual({
      bookingId: "book_direct_1797",
      originSource: "direct_b2c",
      catalogSnapshotId: null,
      channelId: "chan_direct",
      metadata: {
        source: "public_bookings_service.create_session",
        externalBookingRef: "storefront-cart-123",
        catalogSnapshotIds: ["bcsn_1", "bcsn_2"],
        itemCount: 3,
        buyerKind: "guest",
      },
    })
  })

  it("builds catalog trip reservation provenance for composer handoffs", () => {
    const input = toCatalogReservationBookingOriginInput({
      bookingId: "book_trip_1797",
      tripEnvelopeId: "trenv_1797",
      tripComponentId: "trcmp_1797",
      reservationPlanId: "trpl_1797",
      catalogPriceResponseId: "cquo_1797",
      catalogSnapshotId: "bcsn_1797",
      providerSourceKind: "catalog",
      providerSourceConnectionId: "src_conn_1797",
      providerSourceRef: "departure_1797",
      providerOrderRef: "ord_provider_1797",
      channelId: "chan_trip",
      metadata: { entityModule: "products", entityId: "prod_1797" },
    })

    expect(input).toEqual({
      bookingId: "book_trip_1797",
      originSource: "catalog_price_availability",
      reservationPlanId: "trpl_1797",
      catalogPriceResponseId: "cquo_1797",
      catalogSnapshotId: "bcsn_1797",
      providerSourceKind: "catalog",
      providerSourceProvider: null,
      providerSourceConnectionId: "src_conn_1797",
      providerSourceRef: "departure_1797",
      providerOrderRef: "ord_provider_1797",
      channelId: "chan_trip",
      metadata: {
        source: "bookings.submit_reservation_plan",
        tripEnvelopeId: "trenv_1797",
        tripComponentId: "trcmp_1797",
        entityModule: "products",
        entityId: "prod_1797",
      },
    })
  })

  it("keeps the first persisted booking channel origin immutable", async () => {
    const existing = {
      ...toBookingOriginInsert({
        bookingId: "book_direct_1797",
        originSource: "direct_b2c",
        channelId: "chan_first",
      }),
      createdAt: new Date("2026-06-13T12:00:00.000Z"),
      updatedAt: new Date("2026-06-13T12:00:00.000Z"),
    }
    const update = vi.fn()
    const db = {
      update,
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: async () => [],
          }),
        }),
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [existing],
          }),
        }),
      }),
    }

    const result = await upsertBookingOrigin(db as never, {
      bookingId: "book_direct_1797",
      originSource: "direct_b2c",
      channelId: "chan_second",
    })

    expect(result.channelId).toBe("chan_first")
    expect(update).not.toHaveBeenCalled()
  })
})
