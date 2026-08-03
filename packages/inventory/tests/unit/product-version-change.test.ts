import { describe, expect, it } from "vitest"

import { hasOperationalChange } from "../../src/service-readiness.js"

/**
 * A Product Version snapshot as `buildProductVersionSnapshot` produces it:
 * the product row spread, plus the structure a departure materializes from.
 */
function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: "prod_01",
    name: "Bulgaria Day Tour",
    description: "A one-day coach tour.",
    bookingMode: "date",
    capacityMode: "limited",
    durationMinutes: 720,
    timezone: "Europe/Bucharest",
    sellCurrency: "EUR",
    sellAmountCents: 9900,
    costAmountCents: 4200,
    pax: 50,
    startDate: "2026-09-01",
    endDate: "2026-10-31",
    reservationTimeoutMinutes: 30,
    contractTemplateId: "ctpl_01",
    taxClassId: null,
    productTypeId: "ptyp_tour",
    productSubtypeCode: "day-tour",
    supplierId: null,
    facilityId: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    options: [
      {
        id: "popt_01",
        name: "Standard",
        status: "active",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
        units: [{ id: "ounit_01", name: "Adult", unitType: "person" }],
      },
    ],
    itineraries: [
      {
        id: "pitin_01",
        isDefault: true,
        days: [
          {
            id: "pday_01",
            dayNumber: 1,
            services: [{ id: "pds_01", name: "Coach", costAmountCents: 4200, quantity: 1 }],
          },
        ],
      },
    ],
    ...overrides,
  }
}

describe("hasOperationalChange", () => {
  it("treats a first publication as a change", () => {
    expect(hasOperationalChange(null, snapshot())).toBe(true)
  })

  it("reports no change when nothing operational moved", () => {
    expect(hasOperationalChange(snapshot(), snapshot())).toBe(false)
  })

  it("ignores record timestamps", () => {
    const next = snapshot({ updatedAt: "2026-08-03T09:00:00.000Z" })
    expect(hasOperationalChange(snapshot(), next)).toBe(false)
  })

  it("ignores marketing copy", () => {
    const next = snapshot({ description: "Rewritten for the autumn campaign." })
    expect(hasOperationalChange(snapshot(), next)).toBe(false)
  })

  it("does not mistake a Date for a change against its stored ISO string", () => {
    // The candidate snapshot is freshly built (Date); the stored one has
    // round-tripped through JSONB (string). They mean the same thing.
    const stored = snapshot({ startDate: "2026-09-01T00:00:00.000Z" })
    const candidate = snapshot({ startDate: new Date("2026-09-01T00:00:00.000Z") })
    expect(hasOperationalChange(stored, candidate)).toBe(false)
  })

  describe("operational product columns", () => {
    const operationalEdits: Record<string, unknown> = {
      bookingMode: "date_time",
      capacityMode: "unlimited",
      durationMinutes: 480,
      timezone: "Europe/Sofia",
      sellCurrency: "RON",
      sellAmountCents: 12900,
      pax: 45,
      startDate: "2026-09-15",
      contractTemplateId: "ctpl_02",
      productTypeId: "ptyp_activity",
      productSubtypeCode: "boat-tour",
    }

    for (const [field, value] of Object.entries(operationalEdits)) {
      it(`detects a change to ${field}`, () => {
        expect(hasOperationalChange(snapshot(), snapshot({ [field]: value }))).toBe(true)
      })
    }
  })

  describe("structure a departure materializes from", () => {
    it("detects an added option unit", () => {
      const next = snapshot({
        options: [
          {
            ...snapshot().options[0],
            units: [
              { id: "ounit_01", name: "Adult", unitType: "person" },
              { id: "ounit_02", name: "Child", unitType: "person" },
            ],
          },
        ],
      })
      expect(hasOperationalChange(snapshot(), next)).toBe(true)
    })

    it("detects a deactivated option", () => {
      const next = snapshot({
        options: [{ ...snapshot().options[0], status: "archived" }],
      })
      expect(hasOperationalChange(snapshot(), next)).toBe(true)
    })

    it("detects an edited day service cost", () => {
      const next = snapshot({
        itineraries: [
          {
            id: "pitin_01",
            isDefault: true,
            days: [
              {
                id: "pday_01",
                dayNumber: 1,
                services: [{ id: "pds_01", name: "Coach", costAmountCents: 5000, quantity: 1 }],
              },
            ],
          },
        ],
      })
      expect(hasOperationalChange(snapshot(), next)).toBe(true)
    })

    it("detects an added itinerary day", () => {
      const base = snapshot()
      const next = snapshot({
        itineraries: [
          {
            id: "pitin_01",
            isDefault: true,
            days: [...base.itineraries[0].days, { id: "pday_02", dayNumber: 2, services: [] }],
          },
        ],
      })
      expect(hasOperationalChange(base, next)).toBe(true)
    })

    it("ignores option timestamps", () => {
      const next = snapshot({
        options: [{ ...snapshot().options[0], updatedAt: "2026-08-03T09:00:00.000Z" }],
      })
      expect(hasOperationalChange(snapshot(), next)).toBe(false)
    })
  })
})
