import { beforeEach, describe, expect, it, vi } from "vitest"

import { createPublicApiService } from "../../src/service.js"
import { getPublicApiDeparture } from "../../src/service-departures.js"

vi.mock("../../src/service-departures.js", () => ({
  getPublicApiDeparture: vi.fn(),
  getPublicApiDepartureItinerary: vi.fn(),
  getPublicApiProductAvailabilitySummary: vi.fn(),
  getPublicApiProductExtensions: vi.fn(),
  listPublicApiProductDepartures: vi.fn(),
  previewPublicApiDeparturePrice: vi.fn(),
}))

describe("storefront transport eligibility service", () => {
  beforeEach(() => {
    vi.mocked(getPublicApiDeparture).mockReset()
  })

  it("loads departure dates for product-scoped eligibility checks when dates are omitted", async () => {
    vi.mocked(getPublicApiDeparture).mockResolvedValue({
      id: "dep_456",
      productId: "prod_123",
      dateLocal: "2026-08-01",
      startAt: "2026-08-01T09:00:00.000Z",
      endAt: "2026-08-08T18:00:00.000Z",
    } as Awaited<ReturnType<typeof getPublicApiDeparture>>)

    const requestDb = { tenant: "tenant_123" }
    const service = createPublicApiService({
      resolveTransportEligibilityRules({ departureId, productId, travelStartsOn, travelEndsOn }) {
        expect(departureId).toBe("dep_456")
        expect(productId).toBe("prod_123")
        expect(travelStartsOn).toBe("2026-08-01")
        expect(travelEndsOn).toBe("2026-08-08")

        return [
          {
            id: "rule_passport",
            label: "Passport validity",
            productId: "prod_123",
            destinationCountries: ["EG"],
            minValidityDaysAfterReturn: 180,
          },
        ]
      },
    })

    const result = await service.checkDepartureTransportEligibility({
      departureId: "dep_456",
      productId: "prod_123",
      body: {
        travelers: [
          {
            travelerRef: "traveler_1",
            documents: [{ type: "passport", issuingCountry: "RO", expiresOn: "2027-03-01" }],
            hasVisa: false,
            travelingWithGuardian: false,
            hasMinorConsent: false,
          },
        ],
      },
      context: { db: requestDb as never },
    })

    expect(getPublicApiDeparture).toHaveBeenCalledWith(requestDb, "dep_456")
    expect(result.travelStartsOn).toBe("2026-08-01")
    expect(result.travelEndsOn).toBe("2026-08-08")
    expect(result.eligible).toBe(true)
  })
})
