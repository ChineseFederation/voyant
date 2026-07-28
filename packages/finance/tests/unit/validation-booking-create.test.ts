import { describe, expect, it } from "vitest"

import { bookingCreateSchema, deriveBookingCreatePax } from "../../src/service-booking-create.js"

describe("bookingCreateSchema", () => {
  it("preserves billing party metadata for booking contact details", () => {
    const result = bookingCreateSchema.parse({
      bookingNumber: "BK-100",
      productId: "prod_1",
      organizationId: "organization_1",
      contactFirstName: "Analytical Engines SRL",
      contactLastName: null,
      contactPhone: "+40 721 000 000",
      contactPartyType: "company",
      contactTaxId: "RO12345678",
      travelers: [{ firstName: "Ada", lastName: "Lovelace" }],
    })

    expect(result.contactPartyType).toBe("company")
    expect(result.contactTaxId).toBe("RO12345678")
  })

  const valid = {
    productId: "prod_123",
    bookingNumber: "BK-001",
    personId: "pers_123",
    contactFirstName: "Alice",
    contactLastName: "Lead",
    contactEmail: "alice@example.com",
    travelers: [
      {
        firstName: "Alice",
        lastName: "Lead",
        email: "alice@example.com",
      },
    ],
  }

  it("accepts a confirmed catalog total without an override reason", () => {
    const result = bookingCreateSchema.parse({
      ...valid,
      catalogSellAmountCents: 20000,
      confirmedSellAmountCents: 20000,
    })

    expect(result.confirmedSellAmountCents).toBe(20000)
  })

  it("requires a reason when the confirmed total differs from catalog pricing", () => {
    expect(() =>
      bookingCreateSchema.parse({
        ...valid,
        catalogSellAmountCents: 20000,
        confirmedSellAmountCents: 17500,
      }),
    ).toThrow()
  })

  it("accepts item lines and paid schedule rows", () => {
    const result = bookingCreateSchema.parse({
      ...valid,
      documentGeneration: {
        contractDocument: false,
        invoiceDocument: true,
      },
      itemLines: [
        { optionUnitId: "opun_dbl", quantity: 2, title: "Double room" },
        { optionUnitId: "opun_sgl", quantity: 1, title: "Single room" },
      ],
      paymentSchedules: [
        {
          scheduleType: "deposit",
          status: "paid",
          dueDate: "2026-05-16",
          currency: "EUR",
          amountCents: 10000,
          notes: JSON.stringify({
            alreadyPaid: true,
            paymentDate: "2026-05-16",
            paymentMethod: "bank_transfer",
            paymentReference: "BT-123",
          }),
        },
      ],
    })

    expect(result.itemLines).toHaveLength(2)
    expect(result.documentGeneration?.invoiceDocument).toBe(true)
    expect(result.paymentSchedules?.[0]?.status).toBe("paid")
  })

  it("defaults document generation controls to off", () => {
    const result = bookingCreateSchema.parse(valid)

    expect(result.documentGeneration).toEqual({
      contractDocument: false,
      invoiceDocument: false,
      invoiceType: "invoice",
    })
  })

  it("accepts explicit duplicate overrides", () => {
    const result = bookingCreateSchema.parse({
      ...valid,
      allowDuplicate: true,
    })

    expect(result.allowDuplicate).toBe(true)
  })

  it("requires billing and travelers", () => {
    expect(() =>
      bookingCreateSchema.parse({
        productId: "prod_123",
        bookingNumber: "BK-001",
      }),
    ).toThrow()
  })

  it("accepts phone-only billing contact for a person", () => {
    const result = bookingCreateSchema.parse({
      ...valid,
      contactEmail: null,
      contactPhone: "test-phone-number",
    })

    expect(result.contactPhone).toBe("test-phone-number")
    expect(result.contactEmail).toBeNull()
  })

  it("requires billing person email or phone", () => {
    expect(() =>
      bookingCreateSchema.parse({
        ...valid,
        contactEmail: null,
        contactPhone: "   ",
      }),
    ).toThrow("Billing person requires an email or phone number")
  })

  it("rejects placeholder billing emails", () => {
    expect(() =>
      bookingCreateSchema.parse({
        ...valid,
        contactEmail: "noreply@example.com",
      }),
    ).toThrow()
  })

  it("rejects placeholder billing emails even when a phone is supplied", () => {
    expect(() =>
      bookingCreateSchema.parse({
        ...valid,
        contactEmail: "noreply@example.com",
        contactPhone: "test-phone-number",
      }),
    ).toThrow("Billing email cannot be a placeholder address")
  })
})

describe("deriveBookingCreatePax", () => {
  it("keeps explicit pax", () => {
    expect(deriveBookingCreatePax({ pax: 4, travelers: [{}, {}] })).toBe(4)
  })

  it("keeps explicit null pax", () => {
    expect(deriveBookingCreatePax({ pax: null, travelers: [{}, {}] })).toBeNull()
  })

  it("derives pax from supplied travelers when omitted", () => {
    expect(deriveBookingCreatePax({ travelers: [{}, {}] })).toBe(2)
  })

  it("excludes other participants when deriving pax", () => {
    expect(
      deriveBookingCreatePax({
        travelers: [
          { participantType: "traveler" },
          { participantType: "other" },
          { participantType: "occupant" },
        ],
      }),
    ).toBe(2)
  })

  it("preserves null when pax and travelers are absent", () => {
    expect(deriveBookingCreatePax({})).toBeNull()
  })
})
