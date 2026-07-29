import { newId } from "@voyant-travel/db/lib/typeid"
import { describe, expect, it } from "vitest"

import {
  completeBookingSchema,
  convertProductSchema,
  createBookingSchema,
  insertBookingSchema,
  overrideBookingStatusSchema,
  pricingPreviewSchema,
  startBookingSchema,
  updateBookingSchema,
} from "../../src/validation.js"

describe("Booking schema", () => {
  const valid = { bookingNumber: "BK-000001", sellCurrency: "USD" }
  const validPersonId = newId("people")
  const validOrganizationId = newId("organizations")

  it("accepts valid input with defaults", () => {
    const result = insertBookingSchema.parse(valid)
    expect(result.bookingNumber).toBe("BK-000001")
    expect(result.sellCurrency).toBe("USD")
    expect(result.status).toBe("draft")
    expect(result.sourceType).toBe("manual")
  })

  it("rejects missing bookingNumber", () => {
    expect(() => insertBookingSchema.parse({ sellCurrency: "USD" })).toThrow()
  })

  it("rejects empty bookingNumber", () => {
    expect(() => insertBookingSchema.parse({ ...valid, bookingNumber: "" })).toThrow()
  })

  it("rejects bookingNumber over 50 chars", () => {
    expect(() => insertBookingSchema.parse({ ...valid, bookingNumber: "x".repeat(51) })).toThrow()
  })

  it("rejects missing sellCurrency", () => {
    expect(() => insertBookingSchema.parse({ bookingNumber: "BK-1" })).toThrow()
  })

  it("rejects sellCurrency not 3 chars", () => {
    expect(() => insertBookingSchema.parse({ ...valid, sellCurrency: "US" })).toThrow()
    expect(() => insertBookingSchema.parse({ ...valid, sellCurrency: "USDX" })).toThrow()
  })

  it("accepts valid status overrides", () => {
    for (const status of [
      "draft",
      "on_hold",
      "confirmed",
      "in_progress",
      "completed",
      "expired",
      "cancelled",
    ]) {
      expect(insertBookingSchema.parse({ ...valid, status }).status).toBe(status)
    }
  })

  it("rejects invalid status", () => {
    expect(() => insertBookingSchema.parse({ ...valid, status: "pending" })).toThrow()
  })

  it("accepts valid sourceType overrides", () => {
    for (const sourceType of [
      "direct",
      "manual",
      "affiliate",
      "ota",
      "reseller",
      "api_partner",
      "internal",
    ]) {
      expect(insertBookingSchema.parse({ ...valid, sourceType }).sourceType).toBe(sourceType)
    }
  })

  it("accepts nullable optional FK fields", () => {
    const result = insertBookingSchema.parse({
      ...valid,
      personId: null,
      organizationId: null,
    })
    expect(result.personId).toBeNull()
    expect(result.organizationId).toBeNull()
  })

  it("accepts valid billing-party TypeIDs", () => {
    expect(insertBookingSchema.parse({ ...valid, personId: validPersonId }).personId).toBe(
      validPersonId,
    )
    expect(
      insertBookingSchema.parse({ ...valid, organizationId: validOrganizationId }).organizationId,
    ).toBe(validOrganizationId)
  })

  it("accepts a company billing snapshot with tax id", () => {
    const result = insertBookingSchema.parse({
      ...valid,
      organizationId: validOrganizationId,
      contactPartyType: "company",
      contactFirstName: "Acme Travel SRL",
      contactLastName: null,
      contactTaxId: "RO12345678",
    })
    expect(result.contactPartyType).toBe("company")
    expect(result.contactTaxId).toBe("RO12345678")
  })

  it("rejects unknown billing party snapshot types", () => {
    expect(() => insertBookingSchema.parse({ ...valid, contactPartyType: "agency" })).toThrow()
  })

  it("rejects placeholder billing-party IDs", () => {
    expect(() => insertBookingSchema.parse({ ...valid, organizationId: "org_dummy" })).toThrow()
    expect(() => insertBookingSchema.parse({ ...valid, organizationId: "org_test" })).toThrow()
    expect(() =>
      insertBookingSchema.parse({ ...valid, organizationId: "organizationId" }),
    ).toThrow()
  })

  it("rejects the wrong billing-party TypeID prefix", () => {
    expect(() => insertBookingSchema.parse({ ...valid, organizationId: validPersonId })).toThrow()
    expect(() => insertBookingSchema.parse({ ...valid, personId: validOrganizationId })).toThrow()
  })

  it("rejects person and organization billing parties together", () => {
    expect(() =>
      insertBookingSchema.parse({
        ...valid,
        personId: validPersonId,
        organizationId: validOrganizationId,
      }),
    ).toThrow()
  })

  it("rejects negative sellAmountCents", () => {
    expect(() => insertBookingSchema.parse({ ...valid, sellAmountCents: -1 })).toThrow()
  })

  it("accepts a stamped manual price override payload", () => {
    const result = insertBookingSchema.parse({
      ...valid,
      priceOverride: {
        isManual: true,
        originalAmountCents: 10000,
        overriddenAmountCents: 12000,
        currency: "USD",
        reason: "Approved custom quote",
        overriddenBy: "user_123",
        overriddenAt: "2026-05-12T10:00:00.000Z",
      },
    })
    expect(result.priceOverride?.overriddenAmountCents).toBe(12000)
  })

  it("accepts positive pax", () => {
    expect(insertBookingSchema.parse({ ...valid, pax: 5 }).pax).toBe(5)
  })

  it("rejects zero pax", () => {
    expect(() => insertBookingSchema.parse({ ...valid, pax: 0 })).toThrow()
  })
})

describe("Update booking schema", () => {
  const validPersonId = newId("people")
  const validOrganizationId = newId("organizations")

  it("accepts partial update", () => {
    const result = updateBookingSchema.parse({ status: "confirmed" })
    expect(result.status).toBe("confirmed")
    expect(result.bookingNumber).toBeUndefined()
  })

  it("accepts empty object", () => {
    expect(updateBookingSchema.parse({})).toBeDefined()
  })

  it("allows durable notification suppression to be enabled", () => {
    expect(updateBookingSchema.parse({ notificationsSuppressed: true })).toMatchObject({
      notificationsSuppressed: true,
    })
  })

  it("rejects clearing durable notification suppression", () => {
    expect(() => updateBookingSchema.parse({ notificationsSuppressed: false })).toThrow()
  })

  it("rejects malformed billing-party updates", () => {
    expect(() => updateBookingSchema.parse({ organizationId: "org_dummy" })).toThrow()
  })

  it("rejects person and organization billing-party updates together", () => {
    expect(() =>
      updateBookingSchema.parse({ personId: validPersonId, organizationId: validOrganizationId }),
    ).toThrow()
  })
})

describe("Manual create booking schema", () => {
  const valid = { bookingNumber: "BK-MANUAL-001", sellCurrency: "USD" }

  it("allows manual and internal source types", () => {
    expect(createBookingSchema.parse(valid).sourceType).toBe("manual")
    expect(createBookingSchema.parse({ ...valid, sourceType: "internal" }).sourceType).toBe(
      "internal",
    )
  })

  it("rejects external source types", () => {
    expect(() => createBookingSchema.parse({ ...valid, sourceType: "direct" })).toThrow()
    expect(() => createBookingSchema.parse({ ...valid, sourceType: "ota" })).toThrow()
  })

  it("rejects on-hold state and hold expiry fields", () => {
    expect(() => createBookingSchema.parse({ ...valid, status: "on_hold" })).toThrow()
    expect(() =>
      createBookingSchema.parse({
        ...valid,
        holdExpiresAt: "2026-06-01T10:00:00.000Z",
      }),
    ).toThrow()
  })
})

describe("Start booking schema", () => {
  it("accepts an empty body", () => {
    const result = startBookingSchema.parse({})
    expect(result.note).toBeUndefined()
  })

  it("accepts optional note", () => {
    const result = startBookingSchema.parse({ note: "Departure on time" })
    expect(result.note).toBe("Departure on time")
  })
})

describe("Complete booking schema", () => {
  it("accepts an empty body", () => {
    const result = completeBookingSchema.parse({})
    expect(result.note).toBeUndefined()
  })

  it("accepts optional note", () => {
    const result = completeBookingSchema.parse({ note: "All travelers returned" })
    expect(result.note).toBe("All travelers returned")
  })
})

describe("Override booking status schema", () => {
  it("requires status and reason", () => {
    const result = overrideBookingStatusSchema.parse({
      status: "confirmed",
      reason: "Manual reconciliation against PSP",
    })
    expect(result.status).toBe("confirmed")
    expect(result.reason).toBe("Manual reconciliation against PSP")
  })

  it("rejects missing status", () => {
    expect(() => overrideBookingStatusSchema.parse({ reason: "x" })).toThrow()
  })

  it("rejects missing reason", () => {
    expect(() => overrideBookingStatusSchema.parse({ status: "confirmed" })).toThrow()
  })

  it("rejects empty reason", () => {
    expect(() => overrideBookingStatusSchema.parse({ status: "confirmed", reason: "" })).toThrow()
  })

  it("accepts optional note alongside required reason", () => {
    const result = overrideBookingStatusSchema.parse({
      status: "cancelled",
      reason: "Operator request",
      note: "Customer cancelled by phone",
    })
    expect(result.note).toBe("Customer cancelled by phone")
  })

  it("accepts lifecycle event suppression", () => {
    const result = overrideBookingStatusSchema.parse({
      status: "confirmed",
      reason: "Data correction",
      suppressLifecycleEvents: true,
    })
    expect(result.suppressLifecycleEvents).toBe(true)
  })
})

describe("Convert product schema", () => {
  const validPersonId = newId("people")
  const validOrganizationId = newId("organizations")

  it("requires productId and bookingNumber", () => {
    const result = convertProductSchema.parse({
      productId: "prod_abc",
      bookingNumber: "BK-001",
    })
    expect(result.productId).toBe("prod_abc")
    expect(result.bookingNumber).toBe("BK-001")
  })

  it("rejects empty productId", () => {
    expect(() => convertProductSchema.parse({ productId: "", bookingNumber: "BK-001" })).toThrow()
  })

  it("rejects missing bookingNumber", () => {
    expect(() => convertProductSchema.parse({ productId: "prod_abc" })).toThrow()
  })

  it("accepts an optional slotId", () => {
    const result = convertProductSchema.parse({
      productId: "prod_abc",
      bookingNumber: "BK-001",
      slotId: "slot_dep_2026_06_01",
    })
    expect(result.slotId).toBe("slot_dep_2026_06_01")
  })

  it("allows omitting slotId (single-date products)", () => {
    const result = convertProductSchema.parse({
      productId: "prod_abc",
      bookingNumber: "BK-001",
    })
    expect(result.slotId).toBeUndefined()
  })

  it("rejects placeholder organization IDs", () => {
    expect(() =>
      convertProductSchema.parse({
        productId: "prod_abc",
        bookingNumber: "BK-001",
        organizationId: "org_dummy",
      }),
    ).toThrow()
  })

  it("rejects person and organization billing parties together", () => {
    expect(() =>
      convertProductSchema.parse({
        productId: "prod_abc",
        bookingNumber: "BK-001",
        personId: validPersonId,
        organizationId: validOrganizationId,
      }),
    ).toThrow()
  })

  it("allows confirmed catalog totals without an override reason", () => {
    const result = convertProductSchema.parse({
      productId: "prod_abc",
      bookingNumber: "BK-001",
      catalogSellAmountCents: 15000,
      confirmedSellAmountCents: 15000,
    })
    expect(result.confirmedSellAmountCents).toBe(15000)
  })

  it("accepts explicit item lines for selected option units", () => {
    const result = convertProductSchema.parse({
      productId: "prod_abc",
      bookingNumber: "BK-001",
      itemLines: [
        {
          optionId: "opto_dbl",
          optionUnitId: "opun_dbl",
          quantity: 2,
          title: "Double room",
          unitSellAmountCents: 10000,
          totalSellAmountCents: 20000,
        },
        {
          optionId: "opto_sgl",
          optionUnitId: "opun_sgl",
          quantity: 1,
          title: "Single room",
        },
      ],
    })

    expect(result.itemLines).toHaveLength(2)
    expect(result.itemLines?.[0]?.optionId).toBe("opto_dbl")
    expect(result.itemLines?.[0]?.quantity).toBe(2)
  })

  it("requires a reason when confirmed total differs from catalog pricing", () => {
    expect(() =>
      convertProductSchema.parse({
        productId: "prod_abc",
        bookingNumber: "BK-001",
        catalogSellAmountCents: 15000,
        confirmedSellAmountCents: 12500,
      }),
    ).toThrow()
  })
})

describe("Pricing preview schema", () => {
  it("requires a productId", () => {
    expect(() => pricingPreviewSchema.parse({})).toThrow()
    expect(() => pricingPreviewSchema.parse({ productId: "" })).toThrow()
  })

  it("accepts optional option + catalog ids", () => {
    const result = pricingPreviewSchema.parse({
      productId: "prod_abc",
      optionId: "opt_def",
      catalogId: "ctlg_ghi",
    })
    expect(result.productId).toBe("prod_abc")
    expect(result.optionId).toBe("opt_def")
    expect(result.catalogId).toBe("ctlg_ghi")
  })

  it("allows option + catalog to be omitted (catalog defaults to public)", () => {
    const result = pricingPreviewSchema.parse({ productId: "prod_abc" })
    expect(result.optionId).toBeUndefined()
    expect(result.catalogId).toBeUndefined()
  })
})
