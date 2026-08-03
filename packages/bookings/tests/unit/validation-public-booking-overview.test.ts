import { describe, expect, it } from "vitest"

import { publicBookingOverviewSchema } from "../../src/validation-public.js"

describe("public committed booking overview", () => {
  it("rejects internal participant roles", () => {
    expect(() =>
      publicBookingOverviewSchema.parse({
        bookingId: "book_1",
        bookingNumber: "BKG-1",
        revision: 1,
        status: "confirmed",
        sellCurrency: "EUR",
        sellAmountCents: null,
        startDate: null,
        endDate: null,
        pax: null,
        confirmedAt: null,
        cancelledAt: null,
        completedAt: null,
        travelers: [
          {
            id: "bkpt_1",
            participantType: "contact",
            firstName: "Billing",
            lastName: "Contact",
            isPrimary: false,
          },
        ],
        items: [],
        documents: [],
        fulfillments: [],
      }),
    ).toThrow()
  })
})
