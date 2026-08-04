import { describe, expect, it } from "vitest"
import {
  defaultItineraryDaysFromSnapshot,
  ProductVersionSnapshotError,
  parseProductVersionSnapshot,
} from "./product-version-snapshot.js"

function wellFormed() {
  return {
    id: "prod_1",
    name: "Some product",
    // extra product columns are tolerated
    sellCurrency: "EUR",
    itineraries: [
      {
        id: "iti_1",
        productId: "prod_1",
        isDefault: true,
        days: [
          {
            id: "day_2",
            itineraryId: "iti_1",
            dayNumber: 2,
            services: [
              {
                id: "svc_2",
                dayId: "day_2",
                serviceType: "experience",
                name: "Castle tour",
                inclusionRole: "optional",
                travelerScope: "adults",
                startTimeLocal: "14:30",
              },
            ],
          },
          {
            id: "day_1",
            itineraryId: "iti_1",
            dayNumber: 1,
            // a service predating the operational columns — inclusion/traveler absent
            services: [{ id: "svc_1", dayId: "day_1", serviceType: "guide", name: "Welcome walk" }],
          },
        ],
      },
    ],
  }
}

describe("parseProductVersionSnapshot", () => {
  it("parses a well-formed snapshot", () => {
    const snapshot = parseProductVersionSnapshot(wellFormed())
    expect(snapshot.itineraries).toHaveLength(1)
  })

  it("defaults the operational fields a legacy snapshot omits", () => {
    const snapshot = parseProductVersionSnapshot(wellFormed())
    const days = defaultItineraryDaysFromSnapshot(snapshot)
    const legacy = days[0]?.services[0]
    expect(legacy?.inclusionRole).toBe("included")
    expect(legacy?.travelerScope).toBe("all")
  })

  it("orders the default itinerary's days by day number", () => {
    const snapshot = parseProductVersionSnapshot(wellFormed())
    const days = defaultItineraryDaysFromSnapshot(snapshot)
    expect(days.map((day) => day.dayNumber)).toEqual([1, 2])
  })

  it("throws loudly on a shape it does not recognise rather than returning empty", () => {
    // missing `itineraries`
    expect(() => parseProductVersionSnapshot({ id: "prod_1" })).toThrow(ProductVersionSnapshotError)
    // not an object
    expect(() => parseProductVersionSnapshot(null)).toThrow(ProductVersionSnapshotError)
    expect(() => parseProductVersionSnapshot("nope")).toThrow(ProductVersionSnapshotError)
    // itineraries present but malformed
    expect(() =>
      parseProductVersionSnapshot({ id: "prod_1", itineraries: [{ id: "iti_1" }] }),
    ).toThrow(ProductVersionSnapshotError)
  })
})
