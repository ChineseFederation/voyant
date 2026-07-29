import { describe, expect, it, vi } from "vitest"

import {
  buildManualBookingQuoteDraft,
  formatManualBookingAmount,
  manualBookingTravelersToRows,
  normalizeCatalogBookingSlot,
  resolveManualBookingPricing,
  resolveSourcedOptionUnits,
  resolveSourcedProductOptions,
  validateManualBookingDraft,
} from "../../src/components/manual-booking-create-form.js"
import { bookingsUiEn } from "../../src/i18n/en.js"

const valid = {
  productId: "prod_1",
  slotId: "slot_1",
  hasSelectedUnits: true,
  billing: {
    billTo: "person" as const,
    mode: "existing" as const,
    personId: "person_1",
    newPerson: { firstName: "", lastName: "", email: "", phone: "" },
    organizationId: null,
  },
  contactFirstName: "Ana",
  contactLastName: "Pop",
  contactEmail: "ana@example.com",
  contactPhone: "",
  travelers: {
    travelers: [
      {
        clientTravelerKey: "trav:1",
        personId: null,
        firstName: "Ana",
        lastName: "Pop",
        email: "ana@example.com",
        phone: "",
        preferredLanguage: "ro",
        role: "lead" as const,
        dateOfBirth: null,
        pricingUnitId: null,
        pricingCategoryId: null,
        inventoryUnitId: null,
      },
    ],
  },
  pricing: {
    catalogAmountCents: 12_500,
    confirmedAmountCents: 12_500,
    priceOverrideReason: null,
    currency: "EUR",
  },
  paymentRows: [{ dueDate: "2027-01-10", amountCents: 12_500 }],
  messages: bookingsUiEn.manualBookingCreate,
}

describe("manual booking validation", () => {
  it("formats minor-unit amounts as major currency units", () => {
    const formatter = vi.fn((value: number) => String(value))

    expect(formatManualBookingAmount(125_000, "EUR", formatter)).toBe("1250")
    expect(formatter).toHaveBeenCalledWith(1250, "EUR", { currencyDisplay: "code" })
  })

  it("accepts a complete individual booking", () => {
    expect(validateManualBookingDraft(valid)).toBeNull()
  })

  it("requires departure and selected option units", () => {
    expect(validateManualBookingDraft({ ...valid, slotId: null })).toBe(
      bookingsUiEn.manualBookingCreate.validation.departure,
    )
    expect(validateManualBookingDraft({ ...valid, hasSelectedUnits: false })).toBe(
      bookingsUiEn.manualBookingCreate.validation.units,
    )
  })

  it("allows an open-dated sourced product without a departure or owned units", () => {
    expect(
      validateManualBookingDraft({
        ...valid,
        slotId: null,
        requireDeparture: false,
        hasSelectedUnits: true,
      }),
    ).toBeNull()
  })

  it("uses live supplier options and applies unit availability bounds", () => {
    const options = resolveSourcedProductOptions(
      {
        showsConfigure: true,
        showsBilling: true,
        showsTravelers: true,
        showsAccommodation: true,
        showsAddons: false,
        showsPayment: true,
        showsReview: true,
        configureSubSteps: [
          {
            kind: "product-option",
            options: [
              {
                id: "family",
                name: "Family package",
                isDefault: true,
                units: [
                  { id: "double", name: "Double room", unitType: "room", maxQuantity: 3 },
                  { id: "adult", name: "Adult seat", unitType: "person" },
                ],
              },
            ],
          },
        ],
        paxBands: [],
        paxBandsAllowedTotal: { min: 1, max: 7 },
        travelerFields: [],
        bookingFields: [],
        paymentIntents: ["hold"],
      },
      { options: [{ id: "stale", name: "Stale cached option" }] },
    )

    expect(options.map((option) => option.id)).toEqual(["family"])
    expect(resolveSourcedOptionUnits(options, "family", 7)).toMatchObject([
      { optionUnitId: "double", unitType: "room", remaining: 3 },
      { optionUnitId: "adult", unitType: "person", remaining: 7 },
    ])
  })

  it("normalizes supplier departures and ignores open-dated rows without a start", () => {
    expect(normalizeCatalogBookingSlot({ id: "open-date" }, "prod_source")).toBeNull()
    expect(
      normalizeCatalogBookingSlot(
        {
          id: "departure_1",
          startsAt: "2026-09-15T08:00:00.000Z",
          status: "available",
          unlimited: false,
          initialPax: 12,
          remainingPax: 7,
        },
        "prod_source",
      ),
    ).toMatchObject({
      id: "departure_1",
      productId: "prod_source",
      dateLocal: "2026-09-15",
      status: "open",
      unlimited: false,
      remainingPax: 7,
    })
  })

  it("requires the selected organization in organization billing mode", () => {
    expect(
      validateManualBookingDraft({
        ...valid,
        billing: { ...valid.billing, billTo: "organization", personId: "" },
      }),
    ).toBe(bookingsUiEn.manualBookingCreate.validation.organization)
  })

  it("rejects invalid contact, traveler, lead, amount, and payment state", () => {
    expect(validateManualBookingDraft({ ...valid, contactLastName: "" })).toBe(
      bookingsUiEn.manualBookingCreate.validation.contactName,
    )
    expect(validateManualBookingDraft({ ...valid, contactEmail: "", contactPhone: "" })).toBe(
      bookingsUiEn.manualBookingCreate.validation.contactMethod,
    )
    expect(validateManualBookingDraft({ ...valid, contactEmail: "invalid" })).toBe(
      bookingsUiEn.manualBookingCreate.validation.email,
    )
    expect(
      validateManualBookingDraft({
        ...valid,
        travelers: {
          travelers: [{ ...valid.travelers.travelers[0]!, lastName: "" }],
        },
      }),
    ).toBe(bookingsUiEn.manualBookingCreate.validation.travelerNames)
    expect(
      validateManualBookingDraft({
        ...valid,
        travelers: {
          travelers: [{ ...valid.travelers.travelers[0]!, role: "adult" }],
        },
      }),
    ).toBe(bookingsUiEn.manualBookingCreate.validation.leadTraveler)
    expect(validateManualBookingDraft({ ...valid, pricing: null })).toBe(
      bookingsUiEn.manualBookingCreate.validation.amount,
    )
    expect(validateManualBookingDraft({ ...valid, manualOverrideRequiresReason: true })).toBe(
      bookingsUiEn.manualBookingCreate.validation.overrideReason,
    )
    expect(
      validateManualBookingDraft({
        ...valid,
        paymentRows: [{ dueDate: "2027-01-10", amountCents: 100 }],
      }),
    ).toBe(bookingsUiEn.manualBookingCreate.validation.payment)
  })

  it("uses quote totals without forcing a manual override", () => {
    expect(
      resolveManualBookingPricing({
        pricing: {
          catalogAmountCents: 15_000,
          confirmedAmountCents: 15_000,
          priceOverrideReason: "",
          isManualOverride: false,
          requiresReason: false,
          currency: "EUR",
          lines: [],
        },
        quoteTotalAmountCents: 12_500,
        productAmountCents: 15_000,
        currency: "EUR",
      }),
    ).toEqual({
      catalogAmountCents: 12_500,
      confirmedAmountCents: 12_500,
      priceOverrideReason: null,
      currency: "EUR",
    })

    expect(
      resolveManualBookingPricing({
        pricing: {
          catalogAmountCents: 15_000,
          confirmedAmountCents: 11_000,
          priceOverrideReason: "Operator adjustment",
          isManualOverride: true,
          requiresReason: false,
          currency: "EUR",
          lines: [],
        },
        quoteTotalAmountCents: 12_500,
        productAmountCents: 15_000,
        currency: "EUR",
      }),
    ).toMatchObject({
      catalogAmountCents: 12_500,
      confirmedAmountCents: 11_000,
      priceOverrideReason: "Operator adjustment",
    })

    expect(
      resolveManualBookingPricing({
        pricing: {
          catalogAmountCents: 15_000,
          confirmedAmountCents: 12_500,
          priceOverrideReason: "",
          isManualOverride: true,
          requiresReason: true,
          currency: "EUR",
          lines: [],
        },
        quoteTotalAmountCents: 12_500,
        productAmountCents: 15_000,
        currency: "EUR",
      }),
    ).toEqual({
      catalogAmountCents: 12_500,
      confirmedAmountCents: 12_500,
      priceOverrideReason: null,
      currency: "EUR",
    })
  })

  it("includes unit selections, extras, and promotion code in the quote draft", () => {
    const draft = buildManualBookingQuoteDraft({
      productId: "prod_1",
      sourceKind: "voyant-connect",
      sourceConnectionId: "connection_1",
      sourceRef: "supplier-product-42",
      optionId: "opt_1",
      slotId: "slot_1",
      quantities: { unit_1: 2 },
      units: [
        {
          optionId: "opt_1",
          optionUnitId: "unit_1",
          unitName: "Double room",
          unitType: "room",
          occupancyMax: 2,
          initial: 2,
          reserved: 0,
          remaining: 2,
        },
      ],
      travelers: valid.travelers,
      pricingCategories: [
        {
          categoryId: "senior_category",
          name: "Senior 65+",
          code: "SENIOR",
          categoryType: "senior",
          minAge: 65,
          maxAge: null,
          unitIds: ["unit_1"],
        },
      ],
      contact: null,
      extraLines: [
        {
          productExtraId: "extra_1",
          name: "Transfer",
          quantity: 2,
          sellCurrency: "EUR",
        },
      ],
      promotionCode: "SUMMER",
      paymentSchedule: {
        mode: "full",
        installments: [],
      },
    })

    expect(draft?.configure.optionSelections).toEqual([
      {
        optionId: "opt_1",
        optionName: "Double room",
        optionUnitId: "unit_1",
        optionUnitName: "Double room",
        quantity: 2,
      },
    ])
    expect(draft?.addons).toEqual([{ extraId: "extra_1", quantity: 2 }])
    expect(draft?.promotionCode).toBe("SUMMER")
    expect(draft?.entity).toEqual({
      module: "products",
      id: "prod_1",
      sourceKind: "voyant-connect",
      sourceConnectionId: "connection_1",
      sourceRef: "supplier-product-42",
    })
  })

  it("quotes a selected dynamic traveler category using its pricing band", () => {
    const draft = buildManualBookingQuoteDraft({
      productId: "prod_1",
      optionId: "opt_1",
      slotId: "slot_1",
      quantities: { unit_1: 1 },
      units: [
        {
          optionId: "opt_1",
          optionUnitId: "unit_1",
          unitName: "Tour",
          unitType: "service",
          occupancyMax: null,
          initial: 10,
          reserved: 0,
          remaining: 10,
        },
      ],
      travelers: {
        travelers: [
          {
            ...valid.travelers.travelers[0]!,
            pricingCategoryId: "senior_category",
          },
        ],
      },
      pricingCategories: [
        {
          categoryId: "senior_category",
          name: "Senior 65+",
          code: "SENIOR",
          categoryType: "senior",
          minAge: 65,
          maxAge: null,
          unitIds: ["unit_1"],
        },
      ],
      contact: null,
      promotionCode: "",
      paymentSchedule: { mode: "full", installments: [] },
    })

    expect(draft?.configure.pax).toEqual({ senior: 1 })
    expect(draft?.travelers?.[0]?.band).toBe("senior")
  })

  it("preserves a selected senior category in the booking traveler payload", () => {
    const travelers = [
      {
        ...valid.travelers.travelers[0]!,
        pricingUnitId: "unit_adult",
        pricingCategoryId: "senior_category",
        pricingCategorySource: "manual" as const,
      },
    ]
    const rows = manualBookingTravelersToRows(travelers, [
      {
        categoryId: "senior_category",
        name: "Senior 65+",
        code: "SENIOR",
        categoryType: "senior",
        minAge: 65,
        maxAge: null,
        unitIds: ["unit_adult"],
      },
    ])

    expect(rows[0]).toMatchObject({
      travelerCategory: "senior",
      roomUnitId: "unit_adult",
    })
  })
})
