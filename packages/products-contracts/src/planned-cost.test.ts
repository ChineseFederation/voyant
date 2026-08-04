import { describe, expect, it } from "vitest"
import {
  type CostQuantityDriver,
  costQuantityDriverSchema,
  departureQuantityForDriver,
  parseProductVersionSnapshot,
  plannedCostBasisSchema,
  resolvePlannedCost,
  type SnapshotPlannedCost,
  snapshotPlannedCostSchema,
} from "./product-version-snapshot.js"

function block(overrides: Partial<SnapshotPlannedCost> = {}): SnapshotPlannedCost {
  return snapshotPlannedCostSchema.parse({
    version: 1,
    basis: "per_person",
    driver: "pax",
    quantity: 1,
    rateCents: 5000,
    currency: "EUR",
    ...overrides,
  })
}

describe("planned-cost vocabulary", () => {
  it("reuses the rate_unit literals it maps onto", () => {
    // per_person / per_night / per_vehicle / flat come straight from rate_unit;
    // per_room / per_service_unit are the two day-service additions.
    expect(plannedCostBasisSchema.options).toEqual([
      "flat",
      "per_person",
      "per_room",
      "per_night",
      "per_vehicle",
      "per_service_unit",
    ])
  })

  it("names one driver per departure quantity plus fixed and service_units", () => {
    expect(costQuantityDriverSchema.options).toEqual([
      "fixed",
      "pax",
      "rooms",
      "nights",
      "vehicles",
      "service_units",
    ])
  })

  it("defaults the optional frozen-FX carriers to null", () => {
    const parsed = block()
    expect(parsed.fxRates).toBeNull()
    expect(parsed.resolvedAt).toBeNull()
  })
})

describe("departureQuantityForDriver", () => {
  const quantities = { pax: 4, rooms: 2, vehicles: 1, nights: 3 }

  const cases: Array<[CostQuantityDriver, number]> = [
    ["fixed", 1],
    ["pax", 4],
    ["rooms", 2],
    ["vehicles", 1],
    ["nights", 3],
    ["service_units", 7],
  ]
  it.each(cases)("driver %s selects the right multiplier", (driver, expected) => {
    expect(departureQuantityForDriver(driver, quantities, 7)).toBe(expected)
  })

  it("treats a missing or non-positive departure quantity as zero, never a guess", () => {
    expect(departureQuantityForDriver("nights", { nights: null }, 1)).toBe(0)
    expect(departureQuantityForDriver("pax", {}, 1)).toBe(0)
    expect(departureQuantityForDriver("rooms", { rooms: -2 }, 1)).toBe(0)
  })
})

describe("resolvePlannedCost", () => {
  it("multiplies the rate by the driver-selected departure quantity", () => {
    const resolved = resolvePlannedCost(
      block({ basis: "per_person", driver: "pax", rateCents: 5000 }),
      {
        pax: 4,
      },
    )
    expect(resolved).toEqual({ currency: "EUR", amountCents: 20000, multiplier: 4 })
  })

  it("keeps the day-service cost currency, not a sell currency", () => {
    const resolved = resolvePlannedCost(
      block({ currency: "USD", driver: "fixed", rateCents: 12345 }),
      {},
    )
    expect(resolved.currency).toBe("USD")
    expect(resolved.amountCents).toBe(12345)
  })

  it("reproduces legacy cost × quantity for the default basis/driver pair", () => {
    // per_service_unit + service_units, quantity 3, rate 900 → 2700.
    const resolved = resolvePlannedCost(
      block({ basis: "per_service_unit", driver: "service_units", quantity: 3, rateCents: 900 }),
      {},
    )
    expect(resolved.amountCents).toBe(2700)
  })

  it("resolves to zero — not a stale figure — when the driver's quantity is absent", () => {
    const resolved = resolvePlannedCost(block({ driver: "rooms", rateCents: 8000 }), {
      rooms: null,
    })
    expect(resolved.amountCents).toBe(0)
  })
})

describe("snapshot day-service block round-trip", () => {
  it("parses a snapshot whose day services carry a plannedCost block", () => {
    const snapshot = parseProductVersionSnapshot({
      id: "prod_1",
      itineraries: [
        {
          id: "iti_1",
          productId: "prod_1",
          isDefault: true,
          days: [
            {
              id: "day_1",
              itineraryId: "iti_1",
              dayNumber: 1,
              services: [
                {
                  id: "svc_1",
                  dayId: "day_1",
                  serviceType: "accommodation",
                  name: "Twin room",
                  plannedCost: {
                    version: 1,
                    basis: "per_room",
                    driver: "rooms",
                    quantity: 1,
                    rateCents: 9000,
                    currency: "EUR",
                  },
                },
              ],
            },
          ],
        },
      ],
    })
    const service = snapshot.itineraries[0]?.days[0]?.services[0]
    expect(service?.plannedCost?.basis).toBe("per_room")
    expect(service?.plannedCost?.currency).toBe("EUR")
  })

  it("still parses a legacy snapshot whose day services predate the block", () => {
    const snapshot = parseProductVersionSnapshot({
      id: "prod_1",
      itineraries: [
        {
          id: "iti_1",
          productId: "prod_1",
          isDefault: true,
          days: [
            {
              id: "day_1",
              itineraryId: "iti_1",
              dayNumber: 1,
              services: [{ id: "svc_1", dayId: "day_1", serviceType: "guide", name: "Walk" }],
            },
          ],
        },
      ],
    })
    expect(snapshot.itineraries[0]?.days[0]?.services[0]?.plannedCost).toBeUndefined()
  })
})
