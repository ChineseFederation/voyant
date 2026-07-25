import type { OwnedHandlerContext } from "@voyant-travel/catalog/booking-engine"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createAccommodationBookingHandler } from "../../src/booking-engine/index.js"
import { quoteOwnedStay, quoteOwnedStaysBatch } from "../../src/service-owned-stays.js"

vi.mock("../../src/service-owned-stays.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/service-owned-stays.js")>()
  return {
    ...actual,
    quoteOwnedStay: vi.fn(),
    quoteOwnedStaysBatch: vi.fn(),
  }
})

const mockQuoteOwnedStay = vi.mocked(quoteOwnedStay)
const mockQuoteOwnedStaysBatch = vi.mocked(quoteOwnedStaysBatch)

describe("createAccommodationBookingHandler", () => {
  beforeEach(() => {
    mockQuoteOwnedStay.mockReset()
    mockQuoteOwnedStaysBatch.mockReset()
  })

  it("batch quotes room/rate selections through the shared stay batch service", async () => {
    mockQuoteOwnedStaysBatch.mockResolvedValue([
      {
        status: "ok",
        available: true,
        propertyId: "prop_1",
        roomTypeId: "room_1",
        ratePlanId: "rate_bar",
        roomCount: 1,
        nights: 2,
        currency: "USD",
        nightlyRates: [],
        totalAmountCents: 20_000,
        availability: { requestedRooms: 1, minimumRemainingRooms: 2, nights: [] },
      },
      {
        status: "rates_missing",
        missingDates: ["2026-09-02"],
      },
    ])
    const handler = createAccommodationBookingHandler({
      loadContent: async () =>
        ({
          room_types: [{ id: "room_1", name: "Standard", max_occupancy: 2 }],
          rate_plans: [
            {
              id: "rate_bar",
              name: "BAR",
              description: null,
              charge_frequency: "per_night",
              cancellation_policy: null,
              inclusions: [],
              applies_to_room_type_ids: [],
            },
          ],
        }) as never,
    })

    const result = await handler.computeQuotes?.({ db: {} } as OwnedHandlerContext, {
      entityModule: "accommodations",
      scope: { locale: "en-GB", audience: "customer", market: "default", currency: "USD" },
      selections: [
        {
          selectionId: "0",
          entityId: "room_1",
          draft: {
            configure: { dateRange: { checkIn: "2026-09-01", checkOut: "2026-09-03" } },
            accommodation: {
              rooms: [
                { optionUnitId: "room_1", quantity: 1, adults: 2, ratePlanId: "rate_bar" },
                { optionUnitId: "room_1", quantity: 1, adults: 2, ratePlanId: "rate_bar" },
              ],
            },
          },
        },
        {
          selectionId: "1",
          entityId: "room_1",
          draft: {
            configure: { dateRange: { checkIn: "2026-09-01", checkOut: "2026-09-03" } },
            accommodation: {
              rooms: [{ optionUnitId: "room_1", quantity: 1, ratePlanId: "rate_nr" }],
            },
          },
        },
      ],
    })

    expect(mockQuoteOwnedStaysBatch).toHaveBeenCalledWith({}, [
      expect.objectContaining({
        roomTypeId: "room_1",
        ratePlanId: "rate_bar",
        roomCount: 2,
        occupancy: { adults: 1, children: 0, infants: 0 },
        occupancies: [{ adults: 2 }, { adults: 2 }],
      }),
      expect.objectContaining({ roomTypeId: "room_1", ratePlanId: "rate_nr" }),
    ])
    expect(result).toMatchObject([
      { selectionId: "0", result: { available: true, pricing: { base_amount: 20_000 } } },
      { selectionId: "1", result: { available: true, invalidReason: "rates_missing" } },
    ])
  })
})
