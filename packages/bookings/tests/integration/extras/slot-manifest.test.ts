import { describe, expect, it } from "vitest"

import { createExtrasTestContext, DB_AVAILABLE, json } from "./test-helpers"

describe.skipIf(!DB_AVAILABLE)("Slot extras manifest routes", () => {
  const ctx = createExtrasTestContext()

  it("returns a traveler-by-extra manifest for a slot", async () => {
    const product = await ctx.seedProduct()
    const slot = await ctx.seedAvailabilitySlot(product.id)
    const { traveler } = await ctx.seedBookingTravelerOnSlot(slot.id)
    const extra = await ctx.seedProductExtra({
      productId: product.id,
      name: "Bosfor cruise",
      collectionMode: "cash_on_trip",
    })

    const res = await ctx.request(`/slot-manifests/${slot.id}`, { method: "GET" })
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.slot.id).toBe(slot.id)
    expect(data.extras).toHaveLength(1)
    expect(data.travelers).toHaveLength(1)
    expect(data.travelers[0].id).toBe(traveler.id)
    expect(data.selections).toHaveLength(1)
    expect(data.selections[0]).toMatchObject({
      travelerId: traveler.id,
      productExtraId: extra.id,
      selected: false,
      collectionMode: "cash_on_trip",
      collectionStatus: "pending",
      source: "empty",
    })
    expect(data.summaries).toHaveLength(1)
    expect(data.summaries[0]).toMatchObject({
      productExtraId: extra.id,
      name: "Bosfor cruise",
      collectionMode: "cash_on_trip",
      selectionType: "optional",
      eligibleTravelerCount: 1,
      selectedTravelerCount: 0,
      totalQuantity: 0,
      fulfilledTravelerCount: 0,
      outstandingCollectionCount: 0,
      fulfillmentComplete: false,
    })
  })

  it("aggregates quantity, collection and fulfillment state once travelers take the extra", async () => {
    const product = await ctx.seedProduct()
    const slot = await ctx.seedAvailabilitySlot(product.id)
    const { booking, traveler } = await ctx.seedBookingTravelerOnSlot(slot.id)
    const extra = await ctx.seedProductExtra({
      productId: product.id,
      name: "Optional lunch",
      collectionMode: "cash_on_trip",
    })

    await ctx.request(`/slot-manifests/${slot.id}/selections`, {
      method: "PATCH",
      ...json({
        bookingId: booking.id,
        travelerId: traveler.id,
        productExtraId: extra.id,
        status: "selected",
        collectionCurrency: "USD",
        collectionAmountCents: 1_500,
      }),
    })

    const selected = await (
      await ctx.request(`/slot-manifests/${slot.id}`, { method: "GET" })
    ).json()
    expect(selected.data.summaries[0]).toMatchObject({
      selectedTravelerCount: 1,
      totalQuantity: 1,
      outstandingCollectionCount: 1,
      collectionCurrency: "USD",
      collectionAmountCents: 1_500,
      fulfillmentComplete: false,
    })

    // Collect the cash and mark the traveler served — the rollup closes out.
    await ctx.request(`/slot-manifests/${slot.id}/selections`, {
      method: "PATCH",
      ...json({
        bookingId: booking.id,
        travelerId: traveler.id,
        productExtraId: extra.id,
        status: "fulfilled",
        collectionStatus: "collected",
        collectionCurrency: "USD",
        collectionAmountCents: 1_500,
      }),
    })

    const fulfilled = await (
      await ctx.request(`/slot-manifests/${slot.id}`, { method: "GET" })
    ).json()
    expect(fulfilled.data.summaries[0]).toMatchObject({
      selectedTravelerCount: 1,
      fulfilledTravelerCount: 1,
      outstandingCollectionCount: 0,
      fulfillmentComplete: true,
    })
    expect(fulfilled.data.summaries[0].collection).toMatchObject({ collected: 1, pending: 0 })
  })

  it("updates a cash-on-trip selection without requiring a booking item", async () => {
    const product = await ctx.seedProduct()
    const slot = await ctx.seedAvailabilitySlot(product.id)
    const { booking, traveler } = await ctx.seedBookingTravelerOnSlot(slot.id)
    const extra = await ctx.seedProductExtra({
      productId: product.id,
      name: "Bosfor cruise",
      collectionMode: "cash_on_trip",
    })

    const update = await ctx.request(`/slot-manifests/${slot.id}/selections`, {
      method: "PATCH",
      ...json({
        bookingId: booking.id,
        travelerId: traveler.id,
        productExtraId: extra.id,
        status: "selected",
      }),
    })
    expect(update.status).toBe(200)

    const res = await ctx.request(`/slot-manifests/${slot.id}`, { method: "GET" })
    const { data } = await res.json()
    expect(data.selections[0]).toMatchObject({
      travelerId: traveler.id,
      productExtraId: extra.id,
      selected: true,
      collectionStatus: "pending",
      source: "selection",
    })
  })

  it("bulk marks selected travelers as collected", async () => {
    const product = await ctx.seedProduct()
    const slot = await ctx.seedAvailabilitySlot(product.id)
    const { booking, traveler } = await ctx.seedBookingTravelerOnSlot(slot.id)
    const extra = await ctx.seedProductExtra({
      productId: product.id,
      name: "Bosfor cruise",
      collectionMode: "cash_on_trip",
    })

    await ctx.request(`/slot-manifests/${slot.id}/selections`, {
      method: "PATCH",
      ...json({
        bookingId: booking.id,
        travelerId: traveler.id,
        productExtraId: extra.id,
        status: "selected",
      }),
    })

    const collected = await ctx.request(`/slot-manifests/${slot.id}/collections/bulk`, {
      method: "POST",
      ...json({
        productExtraId: extra.id,
        travelerIds: [traveler.id],
        collectionStatus: "collected",
      }),
    })
    expect(collected.status).toBe(200)

    const res = await ctx.request(`/slot-manifests/${slot.id}`, { method: "GET" })
    const { data } = await res.json()
    expect(data.selections[0].collectionStatus).toBe("collected")
    expect(data.selections[0].collectedBy).toBe("test-user-id")
    expect(data.selections[0].collectedAt).toEqual(expect.any(String))
  })

  it("creates a booking item link for booking-total selections", async () => {
    const product = await ctx.seedProduct()
    const slot = await ctx.seedAvailabilitySlot(product.id)
    const { booking, traveler } = await ctx.seedBookingTravelerOnSlot(slot.id)
    const extra = await ctx.seedProductExtra({
      productId: product.id,
      name: "Paid dinner",
      collectionMode: "booking_total",
    })

    const update = await ctx.request(`/slot-manifests/${slot.id}/selections`, {
      method: "PATCH",
      ...json({
        bookingId: booking.id,
        travelerId: traveler.id,
        productExtraId: extra.id,
        status: "selected",
        collectionCurrency: "EUR",
        collectionAmountCents: 5000,
      }),
    })
    expect(update.status).toBe(200)

    const res = await ctx.request(`/slot-manifests/${slot.id}`, { method: "GET" })
    const { data } = await res.json()
    expect(data.selections[0]).toMatchObject({
      travelerId: traveler.id,
      productExtraId: extra.id,
      selected: true,
      bookingItemId: expect.stringMatching(/^bkit_/),
      collectionStatus: "not_required",
      collectionAmountCents: 5000,
    })
  })
})
