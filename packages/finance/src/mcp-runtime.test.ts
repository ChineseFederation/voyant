import type { ToolContext, ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import { afterEach, describe, expect, it, vi } from "vitest"

const executeFinanceStaffBookingCreateCommand = vi.hoisted(() => vi.fn())

vi.mock("./booking-create-command.js", () => ({
  executeFinanceStaffBookingCreateCommand,
}))

import { bookingsService } from "@voyant-travel/bookings"
import { voyantToolContextContribution } from "./mcp-runtime.js"

afterEach(() => {
  vi.restoreAllMocks()
  executeFinanceStaffBookingCreateCommand.mockReset()
})

describe("finance create_booking MCP runtime", () => {
  it("normalizes Date-shaped created booking detail to the booking Tool wire format", async () => {
    const detail = bookingDetailWithDates("booking_1")
    executeFinanceStaffBookingCreateCommand.mockResolvedValue({
      replayed: false,
      value: { bookingId: "booking_1" },
    })
    vi.spyOn(bookingsService, "getBookingById").mockResolvedValue(detail.booking as never)
    vi.spyOn(bookingsService, "listItems").mockResolvedValue([detail.item] as never)
    vi.spyOn(bookingsService, "listTravelers").mockResolvedValue([detail.traveler] as never)

    const contribution = await voyantToolContextContribution.contribute({
      request: request(),
      context: toolContext({}),
      resources: {},
    })
    const runtime = contribution.finance as {
      createBooking: (
        input: Record<string, unknown>,
        admitted: ToolHandlerActionPolicyContext,
      ) => Promise<unknown>
    }

    const result = await runtime.createBooking(
      {
        bookingNumber: "BK-1",
        productId: "product_1",
        personId: "person_1",
        contactFirstName: "Ada",
        contactLastName: "Lovelace",
        contactEmail: "ada@example.com",
        travelers: [{ firstName: "Ada", lastName: "Lovelace" }],
      },
      {} as ToolHandlerActionPolicyContext,
    )

    expect(result).toMatchObject({
      bookingId: "booking_1",
      replayed: false,
      booking: {
        id: "booking_1",
        createdAt: "2026-07-28T10:00:00.000Z",
        updatedAt: "2026-07-28T10:30:00.000Z",
        items: [
          {
            id: "item_1",
            createdAt: "2026-07-28T10:01:00.000Z",
            updatedAt: "2026-07-28T10:31:00.000Z",
          },
        ],
        travelers: [
          {
            id: "traveler_1",
            createdAt: "2026-07-28T10:02:00.000Z",
            updatedAt: "2026-07-28T10:32:00.000Z",
          },
        ],
      },
    })
  })
})

function bookingDetailWithDates(id: string) {
  const booking = {
    id,
    bookingNumber: "BK-1",
    status: "confirmed",
    personId: "person_1",
    organizationId: null,
    sourceType: "manual",
    externalBookingRef: null,
    communicationLanguage: null,
    contactFirstName: "Ada",
    contactLastName: "Lovelace",
    contactPartyType: null,
    contactTaxId: null,
    contactEmail: "ada@example.com",
    contactPhone: null,
    contactPreferredLanguage: null,
    contactCountry: null,
    contactRegion: null,
    contactCity: null,
    contactAddressLine1: null,
    contactAddressLine2: null,
    contactPostalCode: null,
    sellCurrency: "EUR",
    baseCurrency: null,
    fxRateSetId: null,
    sellAmountCents: 1000,
    baseSellAmountCents: null,
    costAmountCents: null,
    baseCostAmountCents: null,
    marginPercent: null,
    startDate: null,
    endDate: null,
    pax: 1,
    internalNotes: null,
    notificationsSuppressed: false,
    customerPaymentPolicy: null,
    priceOverride: null,
    customFields: {},
    acceptedAt: new Date("2026-07-28T10:00:00.000Z"),
    confirmedAt: null,
    cancelledAt: null,
    completedAt: null,
    redeemedAt: null,
    createdAt: new Date("2026-07-28T10:00:00.000Z"),
    updatedAt: new Date("2026-07-28T10:30:00.000Z"),
  }
  const item = {
    id: "item_1",
    bookingId: id,
    title: "Cabin",
    description: null,
    itemType: "unit",
    status: "confirmed",
    serviceDate: null,
    startsAt: null,
    endsAt: null,
    quantity: 1,
    sellCurrency: "EUR",
    unitSellAmountCents: 1000,
    totalSellAmountCents: 1000,
    productId: "product_1",
    optionId: "option_1",
    optionUnitId: "unit_1",
    availabilitySlotId: null,
    productNameSnapshot: "Cruise",
    optionNameSnapshot: "Suite",
    unitNameSnapshot: "Cabin",
    departureLabelSnapshot: null,
    metadata: null,
    createdAt: new Date("2026-07-28T10:01:00.000Z"),
    updatedAt: new Date("2026-07-28T10:31:00.000Z"),
  }
  const traveler = {
    id: "traveler_1",
    bookingId: id,
    participantType: "traveler",
    travelerCategory: "adult",
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    phone: null,
    isPrimary: true,
    createdAt: new Date("2026-07-28T10:02:00.000Z"),
    updatedAt: new Date("2026-07-28T10:32:00.000Z"),
  }
  return { booking, item, traveler }
}

function request(): never {
  const vars = {
    actor: "staff",
    callerType: "agent",
    scopes: ["bookings:read", "bookings:write", "finance:write"],
    isInternalRequest: false,
  }
  return {
    var: vars,
    env: {},
    get(key: string) {
      return vars[key as keyof typeof vars] ?? null
    },
    req: { header: () => null },
  } as never
}

function toolContext(db: unknown): ToolContext {
  return {
    db,
    actor: "staff",
    audience: "staff",
    tenantId: "tenant_1",
    resolverScope: {
      locale: "en",
      audience: "staff",
      market: "US",
      actor: "staff",
    },
  }
}
