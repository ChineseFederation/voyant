import { describe, expect, it } from "vitest"

import {
  insertBookingItemParticipantSchema,
  insertBookingItemSchema,
  insertBookingItemTravelerSchema,
  insertBookingTravelerDocumentSchema,
  insertTravelerRecordSchema,
  updateBookingItemSchema,
  updateTravelerRecordSchema,
  updateTravelerWithTravelDetailsSchema,
  upsertTravelerTravelDetailsSchema,
} from "../../src/validation.js"

describe("Traveler record schema", () => {
  const valid = { firstName: "John", lastName: "Doe" }

  it("accepts valid input with defaults", () => {
    const result = insertTravelerRecordSchema.parse(valid)
    expect(result.firstName).toBe("John")
    expect(result.lastName).toBe("Doe")
    expect(result.participantType).toBe("traveler")
    expect(result.isPrimary).toBe(false)
  })

  it("rejects empty firstName", () => {
    expect(() => insertTravelerRecordSchema.parse({ ...valid, firstName: "" })).toThrow()
  })

  it("rejects empty lastName", () => {
    expect(() => insertTravelerRecordSchema.parse({ ...valid, lastName: "" })).toThrow()
  })

  it("validates email format", () => {
    expect(() => insertTravelerRecordSchema.parse({ ...valid, email: "not-an-email" })).toThrow()
    expect(insertTravelerRecordSchema.parse({ ...valid, email: "john@example.com" }).email).toBe(
      "john@example.com",
    )
  })

  it("accepts valid participant types", () => {
    for (const participantType of ["traveler", "occupant", "other"]) {
      expect(insertTravelerRecordSchema.parse({ ...valid, participantType }).participantType).toBe(
        participantType,
      )
    }
  })

  it("rejects legacy non-traveler participant types", () => {
    for (const participantType of ["booker", "contact", "staff"]) {
      expect(() => insertTravelerRecordSchema.parse({ ...valid, participantType })).toThrow()
    }
  })

  it("accepts valid traveler categories", () => {
    for (const travelerCategory of ["adult", "child", "infant", "senior", "other"]) {
      expect(
        insertTravelerRecordSchema.parse({ ...valid, travelerCategory }).travelerCategory,
      ).toBe(travelerCategory)
    }
  })

  it("does not inject insert defaults into partial updates", () => {
    expect(updateTravelerRecordSchema.parse({ notes: "Updated" })).toEqual({ notes: "Updated" })
    expect(updateTravelerWithTravelDetailsSchema.parse({ nationality: "RO" })).toEqual({
      nationality: "RO",
    })
  })
})

describe("Booking item schema", () => {
  const valid = { title: "Airport Transfer", sellCurrency: "EUR" }

  it("accepts valid input with defaults", () => {
    const result = insertBookingItemSchema.parse(valid)
    expect(result.title).toBe("Airport Transfer")
    expect(result.itemType).toBe("unit")
    expect(result.quantity).toBe(1)
  })

  it("rejects empty title", () => {
    expect(() => insertBookingItemSchema.parse({ ...valid, title: "" })).toThrow()
  })

  it("rejects title over 255 chars", () => {
    expect(() => insertBookingItemSchema.parse({ ...valid, title: "x".repeat(256) })).toThrow()
  })

  it("accepts valid item types", () => {
    for (const itemType of [
      "unit",
      "extra",
      "service",
      "fee",
      "tax",
      "discount",
      "adjustment",
      "accommodation",
      "transport",
      "other",
    ]) {
      expect(insertBookingItemSchema.parse({ ...valid, itemType }).itemType).toBe(itemType)
    }
  })

  it("rejects caller-owned item status", () => {
    expect(() => insertBookingItemSchema.parse({ ...valid, status: "confirmed" })).toThrow()
    expect(() => updateBookingItemSchema.parse({ status: "cancelled" })).toThrow()
  })

  it("rejects non-positive quantity", () => {
    expect(() => insertBookingItemSchema.parse({ ...valid, quantity: 0 })).toThrow()
    expect(() => insertBookingItemSchema.parse({ ...valid, quantity: -1 })).toThrow()
  })

  it("requires cost currency when cost amounts are provided", () => {
    expect(() => insertBookingItemSchema.parse({ ...valid, totalCostAmountCents: 12000 })).toThrow(
      /Cost currency is required/,
    )
    expect(() => insertBookingItemSchema.parse({ ...valid, unitCostAmountCents: 6000 })).toThrow(
      /Cost currency is required/,
    )
    expect(
      insertBookingItemSchema.parse({
        ...valid,
        costCurrency: "EUR",
        totalCostAmountCents: 12000,
      }).costCurrency,
    ).toBe("EUR")
    expect(() => updateBookingItemSchema.parse({ totalCostAmountCents: 12000 })).toThrow(
      /Cost currency is required/,
    )
    expect(
      updateBookingItemSchema.parse({ costCurrency: "EUR", totalCostAmountCents: 12000 }),
    ).toMatchObject({ costCurrency: "EUR", totalCostAmountCents: 12000 })
  })

  it("accepts metadata", () => {
    const result = insertBookingItemSchema.parse({ ...valid, metadata: { foo: "bar" } })
    expect(result.metadata).toEqual({ foo: "bar" })
  })

  it("does not inject insert defaults into partial updates", () => {
    expect(updateBookingItemSchema.parse({ notes: "Updated" })).toEqual({ notes: "Updated" })
  })
})

describe("Booking item participant schema", () => {
  it("requires travelerId with defaults", () => {
    const result = insertBookingItemParticipantSchema.parse({ travelerId: "bkpt_abc" })
    expect(result.travelerId).toBe("bkpt_abc")
    expect(result.role).toBe("traveler")
    expect(result.isPrimary).toBe(false)
  })

  it("rejects empty travelerId", () => {
    expect(() => insertBookingItemParticipantSchema.parse({ travelerId: "" })).toThrow()
  })

  it("accepts valid roles", () => {
    for (const role of ["traveler", "occupant", "beneficiary", "other"]) {
      expect(insertBookingItemParticipantSchema.parse({ travelerId: "bkpt_abc", role }).role).toBe(
        role,
      )
    }
  })

  it("rejects legacy contact/staff item-link roles", () => {
    for (const role of ["primary_contact", "service_assignee"]) {
      expect(() =>
        insertBookingItemParticipantSchema.parse({ travelerId: "bkpt_abc", role }),
      ).toThrow()
    }
  })

  it("accepts travelerId through the traveler alias schema", () => {
    const result = insertBookingItemTravelerSchema.parse({ travelerId: "bkpt_abc" })
    expect(result.travelerId).toBe("bkpt_abc")
    expect(result.role).toBe("traveler")
    expect(result.isPrimary).toBe(false)
  })
})

describe("Traveler travel detail schema alias", () => {
  it("accepts traveler travel detail input", () => {
    const result = upsertTravelerTravelDetailsSchema.parse({
      nationality: "RO",
      dateOfBirth: "1990-02-03",
      isLeadTraveler: true,
      sharingGroupId: "share_1",
      roomTypeId: "rt_double",
      bedPreference: "twin",
      allocations: { room: "resource_room_102" },
    })

    expect(result).toEqual({
      nationality: "RO",
      documentNumber: undefined,
      documentExpiry: undefined,
      dateOfBirth: "1990-02-03",
      dietaryRequirements: undefined,
      isLeadTraveler: true,
      sharingGroupId: "share_1",
      roomTypeId: "rt_double",
      bedPreference: "twin",
      allocations: { room: "resource_room_102" },
    })
  })
})

describe("Traveler document schema alias", () => {
  it("accepts travelerId", () => {
    const result = insertBookingTravelerDocumentSchema.parse({
      travelerId: "bkpt_abc",
      type: "visa",
      fileName: "visa.pdf",
      fileUrl: "https://example.com/visa.pdf",
    })

    expect(result.travelerId).toBe("bkpt_abc")
    expect(result.type).toBe("visa")
    expect(result.fileName).toBe("visa.pdf")
  })
})
