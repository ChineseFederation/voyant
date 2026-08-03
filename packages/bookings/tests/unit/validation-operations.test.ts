import { describe, expect, it } from "vitest"

import {
  cancelBookingSchema,
  convertProductSchema,
  insertBookingAllocationSchema,
  insertBookingFulfillmentSchema,
  recordBookingRedemptionSchema,
  updateBookingAllocationSchema,
  updateBookingFulfillmentSchema,
  updateBookingGroupSchema,
  updateSupplierStatusSchema,
} from "../../src/validation.js"

describe("Reservation schemas", () => {
  it("parses explicit pax for product conversion", () => {
    const result = convertProductSchema.parse({
      productId: "prod_123",
      bookingNumber: "BK-CONVERT-001",
      pax: 3,
    })

    expect(result.pax).toBe(3)
  })

  it("accepts cancellation payloads", () => {
    expect(cancelBookingSchema.parse({ note: "cancel" }).note).toBe("cancel")
  })

  it("parses booking allocation input", () => {
    const result = insertBookingAllocationSchema.parse({
      bookingItemId: "bki_123",
      availabilitySlotId: "avs_123",
    })

    expect(result.quantity).toBe(1)
    expect(result.status).toBe("held")
  })

  it("accepts partial booking allocation updates", () => {
    const result = updateBookingAllocationSchema.parse({ status: "confirmed" })
    expect(result.status).toBe("confirmed")
  })

  it("does not inject allocation defaults into partial updates", () => {
    expect(updateBookingAllocationSchema.parse({ metadata: { source: "staff" } })).toEqual({
      metadata: { source: "staff" },
    })
  })
})

describe("Booking fulfillment schema", () => {
  it("accepts valid fulfillment input", () => {
    const result = insertBookingFulfillmentSchema.parse({
      travelerId: "bkpt_123",
      fulfillmentType: "service_voucher",
      deliveryChannel: "download",
      artifactUrl: "https://example.com/service-voucher.pdf",
    })

    expect(result.fulfillmentType).toBe("service_voucher")
    expect(result.deliveryChannel).toBe("download")
    expect(result.status).toBe("issued")
    expect(result.travelerId).toBe("bkpt_123")
  })

  it("rejects the legacy voucher fulfillment value", () => {
    expect(() =>
      insertBookingFulfillmentSchema.parse({
        fulfillmentType: "voucher",
        deliveryChannel: "download",
      }),
    ).toThrow()
  })

  it("rejects invalid artifact url", () => {
    expect(() =>
      insertBookingFulfillmentSchema.parse({
        fulfillmentType: "ticket",
        deliveryChannel: "email",
        artifactUrl: "not-a-url",
      }),
    ).toThrow()
  })

  it("accepts partial fulfillment update", () => {
    const result = updateBookingFulfillmentSchema.parse({ status: "revoked" })
    expect(result.status).toBe("revoked")
  })

  it("does not inject fulfillment defaults into partial updates", () => {
    expect(
      updateBookingFulfillmentSchema.parse({ artifactUrl: "https://example.com/reissued.pdf" }),
    ).toEqual({ artifactUrl: "https://example.com/reissued.pdf" })
  })
})

describe("Supplier status schema", () => {
  it("does not inject supplier defaults into partial updates", () => {
    expect(updateSupplierStatusSchema.parse({ notes: "Supplier called" })).toEqual({
      notes: "Supplier called",
    })
  })
})

describe("Booking group schema", () => {
  it("does not inject group defaults into partial updates", () => {
    expect(updateBookingGroupSchema.parse({ label: "Room pair" })).toEqual({
      label: "Room pair",
    })
  })
})

describe("Booking redemption schema", () => {
  it("accepts valid redemption input", () => {
    const result = recordBookingRedemptionSchema.parse({
      travelerId: "bkpt_123",
      method: "scan",
      redeemedAt: "2026-06-01T10:00:00.000Z",
      metadata: { gate: "north" },
    })

    expect(result.method).toBe("scan")
    expect(result.redeemedAt).toBe("2026-06-01T10:00:00.000Z")
    expect(result.travelerId).toBe("bkpt_123")
  })

  it("defaults redemption method to manual", () => {
    const result = recordBookingRedemptionSchema.parse({})
    expect(result.method).toBe("manual")
  })
})
