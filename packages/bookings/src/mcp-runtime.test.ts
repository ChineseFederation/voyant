import type { ToolContext, ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import { afterEach, describe, expect, it, vi } from "vitest"

const executeAdmittedExistingTargetCommand = vi.hoisted(() => vi.fn())

vi.mock("@voyant-travel/action-ledger", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  executeAdmittedExistingTargetCommand,
}))

import { voyantToolContextContribution } from "./mcp-runtime.js"
import { bookingsService } from "./service.js"

afterEach(() => {
  vi.restoreAllMocks()
  executeAdmittedExistingTargetCommand.mockReset()
})

describe("bookings MCP runtime lifecycle detail", () => {
  it.each([
    "confirmBooking",
    "cancelBooking",
  ] as const)("normalizes Date-shaped %s detail to the booking Tool wire format", async (method) => {
    const detail = bookingDetailWithDates("booking_1")
    vi.spyOn(bookingsService, "getBookingById").mockResolvedValue(detail.booking as never)
    vi.spyOn(bookingsService, "listItems").mockResolvedValue([detail.item] as never)
    vi.spyOn(bookingsService, "listTravelers").mockResolvedValue([detail.traveler] as never)
    vi.spyOn(bookingsService, "listAllocations").mockResolvedValue([] as never)
    executeAdmittedExistingTargetCommand.mockImplementation(async (_input, handlers) => ({
      replayed: false,
      value: await handlers.execute(),
    }))

    const contribution = await voyantToolContextContribution.contribute({
      request: request(),
      context: toolContext({ execute: () => [] }),
      resources: {},
    })
    const runtime = contribution.bookings as {
      confirmBooking: (
        input: { id: string; idempotencyKey: string },
        admitted: ToolHandlerActionPolicyContext,
      ) => Promise<unknown>
      cancelBooking: (
        input: { id: string; idempotencyKey: string },
        admitted: ToolHandlerActionPolicyContext,
      ) => Promise<unknown>
    }

    const result = await runtime[method]({ id: "booking_1", idempotencyKey: `${method}-1` }, {
      invocation: {},
    } as ToolHandlerActionPolicyContext)

    expect(result).toMatchObject({
      status: method === "confirmBooking" ? "confirmed" : "cancelled",
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

  it.each([
    ["confirmBooking", "confirmBooking"],
    ["cancelBooking", "cancelBooking"],
  ] as const)("links an approved %s lifecycle mutation to the claim action", async (method, serviceMethod) => {
    const detail = bookingDetailWithDates("booking_1")
    const db = { execute: vi.fn().mockResolvedValue(financeTablesUnavailable()) }
    vi.spyOn(bookingsService, "getBookingById").mockResolvedValue(detail.booking as never)
    vi.spyOn(bookingsService, "listAllocations").mockResolvedValue([] as never)
    const statusMutation = vi
      .spyOn(bookingsService, serviceMethod)
      .mockResolvedValue({ status: "ok", booking: detail.booking } as never)
    executeAdmittedExistingTargetCommand.mockImplementation(async (input, handlers) => {
      await handlers.prepare(
        input.db,
        { causation: { claimActionId: "action_claim_1" } },
        input.commandInput,
      )
      return { replayed: false, value: detail.booking }
    })

    const contribution = await voyantToolContextContribution.contribute({
      request: request(),
      context: toolContext(db),
      resources: {},
    })
    const runtime = contribution.bookings as Record<
      typeof method,
      (
        input: { id: string; idempotencyKey: string },
        admitted: ToolHandlerActionPolicyContext,
      ) => Promise<unknown>
    >

    await runtime[method]({ id: "booking_1", idempotencyKey: `${method}-claim` }, {
      capabilityId: `booking.status.${method === "confirmBooking" ? "confirm" : "cancel"}`,
      invocation: {},
    } as ToolHandlerActionPolicyContext)

    expect(statusMutation).toHaveBeenCalledOnce()
    expect(statusMutation.mock.calls[0]?.[4]).toMatchObject({
      actionLedgerCausationActionId: "action_claim_1",
      actionLedgerContext: {
        userId: "user_1",
        agentId: "agent_1",
        callerType: "agent",
        actor: "staff",
        organizationId: "organization_1",
        correlationId: "correlation_1",
      },
    })
  })

  it("does not issue a failing Finance query while preparing a bookings-only cancellation", async () => {
    const detail = bookingDetailWithDates("booking_1")
    const execute = vi.fn().mockResolvedValue(financeTablesUnavailable())
    const db = { execute }
    vi.spyOn(bookingsService, "getBookingById").mockResolvedValue(detail.booking as never)
    vi.spyOn(bookingsService, "listAllocations").mockResolvedValue([] as never)
    const cancelBooking = vi
      .spyOn(bookingsService, "cancelBooking")
      .mockResolvedValue({ status: "ok", booking: detail.booking } as never)
    executeAdmittedExistingTargetCommand.mockImplementation(async (input, handlers) => {
      await handlers.prepare(
        input.db,
        { causation: { claimActionId: "action_claim_cancel" } },
        input.commandInput,
      )
      return { replayed: false, value: detail.booking }
    })

    const contribution = await voyantToolContextContribution.contribute({
      request: request(),
      context: toolContext(db),
      resources: {},
    })
    const runtime = contribution.bookings as {
      cancelBooking: (
        input: { id: string; idempotencyKey: string },
        admitted: ToolHandlerActionPolicyContext,
      ) => Promise<unknown>
    }

    await runtime.cancelBooking({ id: "booking_1", idempotencyKey: "cancel-bookings-only" }, {
      capabilityId: "booking.status.cancel",
      invocation: {},
    } as ToolHandlerActionPolicyContext)

    expect(execute).toHaveBeenCalledTimes(5)
    expect(cancelBooking).toHaveBeenCalledOnce()
  })

  it("keeps approval consequences stable when tied allocations arrive in a different order", async () => {
    const detail = bookingDetailWithDates("booking_1")
    const execute = vi.fn().mockResolvedValue(financeTablesUnavailable())
    const db = { execute }
    const createdAt = new Date("2026-07-28T10:03:00.000Z")
    const allocationA = {
      id: "allocation_a",
      bookingId: "booking_1",
      status: "held",
      availabilitySlotId: "slot_1",
      quantity: 1,
      createdAt,
    }
    const allocationB = {
      id: "allocation_b",
      bookingId: "booking_1",
      status: "held",
      availabilitySlotId: "slot_2",
      quantity: 1,
      createdAt,
    }
    vi.spyOn(bookingsService, "getBookingById").mockResolvedValue(detail.booking as never)
    vi.spyOn(bookingsService, "listAllocations")
      .mockImplementationOnce(async () => {
        expect(execute).not.toHaveBeenCalled()
        return [allocationB, allocationA] as never
      })
      .mockImplementationOnce(async () => {
        // Booking and allocation locks are both acquired before the approved
        // preview is reloaded inside the command transaction.
        expect(execute).toHaveBeenCalledTimes(2)
        return [allocationA, allocationB] as never
      })
    vi.spyOn(bookingsService, "confirmBooking").mockResolvedValue({
      status: "ok",
      booking: detail.booking,
    } as never)
    executeAdmittedExistingTargetCommand.mockImplementation(async (input, handlers) => {
      await handlers.prepare(
        input.db,
        { causation: { claimActionId: "action_claim_stable_allocations" } },
        input.commandInput,
      )
      return { replayed: false, value: detail.booking }
    })

    const contribution = await voyantToolContextContribution.contribute({
      request: request(),
      context: toolContext(db),
      resources: {},
    })
    const runtime = contribution.bookings as {
      confirmBooking: (
        input: { id: string; idempotencyKey: string },
        admitted: ToolHandlerActionPolicyContext,
      ) => Promise<unknown>
    }

    await expect(
      runtime.confirmBooking({ id: "booking_1", idempotencyKey: "stable-allocations" }, {
        capabilityId: "booking.status.confirm",
        invocation: {},
      } as ToolHandlerActionPolicyContext),
    ).resolves.toMatchObject({ status: "confirmed", replayed: false })
    expect(bookingsService.confirmBooking).toHaveBeenCalledOnce()
  })
})

function financeTablesUnavailable() {
  return { rows: [{ invoicesTable: null, paymentSchedulesTable: null }] }
}

function bookingDetailWithDates(id: string) {
  const booking = {
    id,
    bookingNumber: "BK-1",
    status: "on_hold",
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
    holdExpiresAt: null,
    confirmedAt: null,
    expiredAt: null,
    cancelledAt: null,
    completedAt: null,
    awaitingPaymentAt: null,
    paidAt: null,
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
    status: "on_hold",
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
    userId: "user_1",
    agentId: "agent_1",
    organizationId: "organization_1",
    scopes: ["bookings:read", "bookings:write"],
    isInternalRequest: false,
  }
  return {
    var: vars,
    env: {},
    get(key: string) {
      return vars[key as keyof typeof vars] ?? null
    },
    req: {
      header(name: string) {
        return name === "x-correlation-id" ? "correlation_1" : null
      },
    },
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
