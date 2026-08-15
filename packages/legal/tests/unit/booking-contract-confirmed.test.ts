import { describe, expect, it } from "vitest"
import { bookingContractVariables } from "../../src/booking-contract-confirmed.js"
import {
  type BookingContractSettlement,
  bookingContractPreviewSettlement,
  EMPTY_BOOKING_CONTRACT_SETTLEMENT,
  toBookingContractSettlement,
} from "../../src/booking-contract-settlement.js"
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
      EMPTY_BOOKING_CONTRACT_SETTLEMENT,
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

/**
 * The payment clause every seeded customer agreement carries. It branches on
 * `booking.isPaidInFull` and prints the two settlement amounts, so a bag that
 * omits them takes the `else` branch and renders "you owe -" (voyant#4690).
 */
const PAYMENT_CLAUSE =
  "{% if booking.isPaidInFull %}Paid in full: {{ booking.paidAmountCents | cents: booking.currency }}" +
  "{% else %}Deposit paid: {{ booking.paidAmountCents | cents: booking.currency }}. " +
  "Balance {{ booking.balanceDueCents | cents: booking.currency }} due by {{ booking.balanceDueDate }}." +
  "{% endif %}"

function variablesWithSettlement(settlement: BookingContractSettlement): Record<string, unknown> {
  return bookingContractVariables(
    {
      id: "book_1",
      bookingNumber: "BK-AUTO-1",
      status: "confirmed",
      contactFirstName: "Ana",
      contactLastName: "Pop",
      contactPartyType: "individual",
      sellCurrency: "EUR",
      sellAmountCents: 120_00,
      pax: 1,
      startDate: "2026-09-01",
      endDate: "2026-09-07",
    } as never,
    [] as never,
    [] as never,
    settlement,
    new Date("2026-08-08T06:45:12.000Z"),
  )
}

describe("automatic booking contract settlement variables", () => {
  it("renders the paid branch on a settled booking", () => {
    const variables = variablesWithSettlement({
      ...EMPTY_BOOKING_CONTRACT_SETTLEMENT,
      paidAmountCents: 120_00,
      amountDueCents: 0,
      isPaidInFull: true,
      latestCompleted: {
        method: "bank_transfer",
        methodLabel: "Transfer bancar",
        date: "2026-08-01",
      },
    })

    expect(variables).toMatchObject({
      booking: {
        paidAmountCents: 120_00,
        amountDueCents: 0,
        balanceDueCents: 0,
        isPaidInFull: true,
      },
      payment: { method: "Transfer bancar", capturedAt: "2026-08-01" },
    })
    expect(contractsService.renderPreview({ body: PAYMENT_CLAUSE, variables })).toBe(
      "Paid in full: €120.00",
    )
  })

  it("renders the outstanding branch with real amounts, never the missing-value placeholder", () => {
    const variables = variablesWithSettlement({
      ...EMPTY_BOOKING_CONTRACT_SETTLEMENT,
      paidAmountCents: 30_00,
      amountDueCents: 90_00,
      isPaidInFull: false,
      depositAmountCents: 30_00,
      depositDueDate: "2026-08-01",
      balanceAmountCents: 90_00,
      balanceDueDate: "2026-08-20",
    })

    // Every amount is a value, not the `-` the renderer substitutes for a
    // missing one — which is what the customer saw before voyant#4690.
    expect(contractsService.renderPreview({ body: PAYMENT_CLAUSE, variables })).toBe(
      "Deposit paid: €30.00. Balance €90.00 due by 2026-08-20.",
    )
  })

  it("keeps the gross scheduled balance distinct from the amount still owed", () => {
    const variables = variablesWithSettlement({
      ...EMPTY_BOOKING_CONTRACT_SETTLEMENT,
      paidAmountCents: 120_00,
      amountDueCents: 0,
      isPaidInFull: true,
      balanceAmountCents: 90_00,
      balanceDueDate: "2026-08-20",
    })

    // `balanceAmountCents` is the installment the operator scheduled and does
    // not move when it is paid; `balanceDueCents` is what is still owed.
    expect(variables).toMatchObject({
      booking: { balanceAmountCents: 90_00, balanceDueCents: 0 },
    })
  })

  it("renders zero settlement as amounts rather than blanks when nothing is paid", () => {
    const variables = variablesWithSettlement(EMPTY_BOOKING_CONTRACT_SETTLEMENT)

    expect(
      contractsService.renderPreview({
        body: "{{ booking.paidAmountCents | cents: booking.currency }}",
        variables,
      }),
    ).toBe("€0.00")
  })

  // The acceptance evidence is a digest over the body the shopper reviewed,
  // and the shopper reviewed it before paying. Rendering the settled bag with
  // identity stripped is not that body, so a card booking's acceptance would
  // stop being recoverable the moment a template bound the payment clause.
  it("re-renders the shopper's reading of the payment clause for acceptance matching", () => {
    const settled: BookingContractSettlement = {
      ...EMPTY_BOOKING_CONTRACT_SETTLEMENT,
      paidAmountCents: 120_00,
      amountDueCents: 0,
      isPaidInFull: true,
      latestCompleted: { method: "credit_card", methodLabel: "Credit Card", date: "2026-08-05" },
      schedule: [
        {
          index: 1,
          type: "balance",
          status: "paid",
          amountCents: 120_00,
          currency: "EUR",
          dueDate: "2026-08-20",
        },
      ],
    }

    expect(
      contractsService.renderPreview({
        body: PAYMENT_CLAUSE,
        variables: variablesWithSettlement(settled),
      }),
    ).toBe("Paid in full: €120.00")

    const preview = bookingContractPreviewSettlement(settled, 120_00)
    expect(
      contractsService.renderPreview({
        body: PAYMENT_CLAUSE,
        variables: variablesWithSettlement(preview),
      }),
    ).toBe("Deposit paid: €0.00. Balance €120.00 due by -.")
    // The storefront preview shows every installment as still pending.
    expect(preview.schedule).toEqual([
      {
        index: 1,
        type: "balance",
        status: "pending",
        amountCents: 120_00,
        currency: "EUR",
        dueDate: "2026-08-20",
      },
    ])
    expect(preview.latestCompleted).toBeNull()
  })
})

describe("toBookingContractSettlement", () => {
  it("localizes the payment method label into the contract's language", () => {
    const settlement = {
      currency: "EUR",
      paidAmountCents: 120_00,
      balanceDueCents: 0,
      amountDueCents: 0,
      isPaidInFull: true,
      latestCompletedPayment: {
        method: "bank_transfer" as const,
        date: "2026-08-01",
        amountCents: 120_00,
        currency: "EUR",
      },
      installments: [],
      depositAmountCents: 0,
      depositDueDate: null,
      balanceAmountCents: 0,
      balanceDueDate: null,
    }

    expect(toBookingContractSettlement(settlement, "ro").latestCompleted).toEqual({
      method: "bank_transfer",
      methodLabel: "Transfer bancar",
      date: "2026-08-01",
    })
    expect(toBookingContractSettlement(settlement, "en").latestCompleted?.methodLabel).toBe(
      "Bank Transfer",
    )
    // An unmapped language falls back to a title-cased method, not a blank.
    expect(toBookingContractSettlement(settlement, "de").latestCompleted?.methodLabel).toBe(
      "Bank Transfer",
    )
  })

  it("numbers the installments it was given and flattens absent due dates", () => {
    const mapped = toBookingContractSettlement(
      {
        currency: "EUR",
        paidAmountCents: 0,
        balanceDueCents: null,
        amountDueCents: 120_00,
        isPaidInFull: false,
        latestCompletedPayment: null,
        installments: [
          {
            type: "deposit",
            status: "paid",
            amountCents: 30_00,
            currency: "EUR",
            dueDate: "2026-08-01",
          },
          {
            type: "balance",
            status: "due",
            amountCents: 90_00,
            currency: "EUR",
            dueDate: "2026-08-20",
          },
        ],
        depositAmountCents: 30_00,
        depositDueDate: "2026-08-01",
        balanceAmountCents: 90_00,
        balanceDueDate: null,
      },
      "en",
    )

    expect(mapped.schedule.map((row) => row.index)).toEqual([1, 2])
    expect(mapped.balanceDueDate).toBe("")
  })
})
