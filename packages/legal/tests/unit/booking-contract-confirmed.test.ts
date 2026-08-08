import { describe, expect, it } from "vitest"
import { bookingContractVariables } from "../../src/booking-contract-confirmed.js"
import { contractsService } from "../../src/contracts/service.js"

describe("automatic booking contract variables", () => {
  it("renders the documented customer-sales-agreement aliases from persisted booking data", () => {
    const variables = bookingContractVariables(
      {
        id: "book_1",
        bookingNumber: "BK-AUTO-1",
        status: "confirmed",
        contactFirstName: "Ana",
        contactLastName: "Pop",
        contactEmail: "ana@example.test",
        contactPhone: "+40123456789",
        contactPartyType: "individual",
        contactAddressLine1: "1 Main Street",
        contactAddressLine2: null,
        contactCity: "Bucharest",
        contactRegion: "Bucharest",
        contactPostalCode: "010101",
        contactCountry: "RO",
        sellCurrency: "EUR",
        sellAmountCents: 120_00,
        pax: 2,
        startDate: "2026-09-01",
        endDate: "2026-09-07",
      } as never,
      [
        {
          title: "Autumn tour",
          productNameSnapshot: "Autumn tour",
          quantity: 2,
          sellCurrency: "EUR",
          totalSellAmountCents: 120_00,
        },
      ] as never,
      [
        {
          id: "trav_1",
          firstName: "Ana",
          lastName: "Pop",
          email: "ana@example.test",
          phone: null,
          travelerCategory: "adult",
          isPrimary: true,
        },
        {
          id: "trav_2",
          firstName: "Mara",
          lastName: "Pop",
          email: null,
          phone: null,
          travelerCategory: "child",
          isPrimary: false,
        },
      ] as never,
      new Date("2026-08-08T06:45:12.000Z"),
    )

    expect(variables).toMatchObject({
      today: "2026-08-08",
      contract: { date: "2026-08-08" },
      booking: {
        number: "BK-AUTO-1",
        totalAmountCents: 120_00,
        currency: "EUR",
        pax: 2,
      },
      customer: {
        fullName: "Ana Pop",
        email: "ana@example.test",
      },
      leadTraveler: { fullName: "Ana Pop", email: "ana@example.test" },
    })

    expect(
      contractsService.renderPreview({
        body: "Booking {{ booking.number }} for {{ leadTraveler.fullName }} and {{ travelers.size }} travellers: {{ booking.totalAmountCents | cents: booking.currency }} on {{ contract.date }}",
        variables,
      }),
    ).toBe("Booking BK-AUTO-1 for Ana Pop and 2 travellers: €120.00 on 2026-08-08")
  })
})
