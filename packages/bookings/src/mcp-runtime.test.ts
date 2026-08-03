import type { ToolContext, ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import { PgDialect } from "drizzle-orm/pg-core"
import { afterEach, describe, expect, it, vi } from "vitest"

const executeAdmittedExistingTargetCommand = vi.hoisted(() => vi.fn())

vi.mock("@voyant-travel/action-ledger", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  executeAdmittedExistingTargetCommand,
}))

import {
  loadBookingStatusConsequencePreview,
  voyantToolContextContribution,
} from "./mcp-runtime.js"
import { bookingsService } from "./service.js"

afterEach(() => {
  vi.restoreAllMocks()
  executeAdmittedExistingTargetCommand.mockReset()
})

describe("bookings MCP runtime lifecycle detail", () => {
  it("normalizes Date-shaped cancellation detail to the booking Tool wire format", async () => {
    const detail = bookingDetailWithDates("booking_1")
    vi.spyOn(bookingsService, "getBookingById").mockResolvedValue(detail.booking as never)
    vi.spyOn(bookingsService, "listItems").mockResolvedValue([detail.item] as never)
    vi.spyOn(bookingsService, "listItemParticipants").mockResolvedValue([] as never)
    vi.spyOn(bookingsService, "listTravelers").mockResolvedValue([detail.traveler] as never)
    vi.spyOn(bookingsService, "listAllocations").mockResolvedValue([] as never)
    vi.spyOn(bookingsService, "listFulfillments").mockResolvedValue([] as never)
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
      cancelBooking: (
        input: { id: string; idempotencyKey: string },
        admitted: ToolHandlerActionPolicyContext,
      ) => Promise<unknown>
    }

    const result = await runtime.cancelBooking({ id: "booking_1", idempotencyKey: "cancel-1" }, {
      invocation: {},
    } as ToolHandlerActionPolicyContext)

    expect(result).toMatchObject({
      status: "cancelled",
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

  it("links an approved cancellation to the claim action", async () => {
    const detail = bookingDetailWithDates("booking_1")
    const db = { execute: vi.fn().mockResolvedValue(financeTablesUnavailable()) }
    vi.spyOn(bookingsService, "getBookingById").mockResolvedValue(detail.booking as never)
    vi.spyOn(bookingsService, "listItems").mockResolvedValue([detail.item] as never)
    vi.spyOn(bookingsService, "listItemParticipants").mockResolvedValue([] as never)
    vi.spyOn(bookingsService, "listAllocations").mockResolvedValue([] as never)
    const statusMutation = vi
      .spyOn(bookingsService, "cancelBooking")
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
    const runtime = contribution.bookings as {
      cancelBooking: (
        input: { id: string; idempotencyKey: string },
        admitted: ToolHandlerActionPolicyContext,
      ) => Promise<unknown>
    }

    await runtime.cancelBooking({ id: "booking_1", idempotencyKey: "cancel-claim" }, {
      capabilityId: "booking.status.cancel",
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
    vi.spyOn(bookingsService, "listItems").mockResolvedValue([detail.item] as never)
    vi.spyOn(bookingsService, "listItemParticipants").mockResolvedValue([] as never)
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

    expect(execute).toHaveBeenCalledTimes(6)
    expect(cancelBooking).toHaveBeenCalledOnce()
  })

  it("preserves fulfilled allocation status in a cancellation consequence preview", async () => {
    const detail = bookingDetailWithDates("booking_1")
    const db = { execute: vi.fn().mockResolvedValue(financeTablesUnavailable()) }
    vi.spyOn(bookingsService, "getBookingById").mockResolvedValue(detail.booking as never)
    vi.spyOn(bookingsService, "listAllocations").mockResolvedValue([
      {
        id: "allocation_fulfilled",
        bookingId: "booking_1",
        status: "fulfilled",
        availabilitySlotId: "slot_1",
        quantity: 1,
        createdAt: new Date("2026-07-28T10:03:00.000Z"),
      },
    ] as never)

    const preview = await loadBookingStatusConsequencePreview(
      db as never,
      "booking_1",
      "cancel",
      false,
      false,
    )

    expect(preview.allocations).toEqual([
      expect.objectContaining({
        id: "allocation_fulfilled",
        status: "fulfilled",
        resultingStatus: "fulfilled",
        restoresCapacity: true,
      }),
    ])
  })

  it("locks an item before the primary-participant mutation in one transaction", async () => {
    const dialect = new PgDialect()
    const events: string[] = []
    const tx = {
      execute: vi.fn(async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const statement = dialect.sqlToQuery(query).sql
        if (statement.includes("FROM booking_items")) {
          events.push("item_lock")
          return [{ id: "item_1", bookingId: "booking_1" }]
        }
        events.push("traveler_lock")
        return [{ id: "traveler_1" }]
      }),
      update: vi.fn(() => ({
        set: () => ({
          where: async () => {
            events.push("participant_update")
          },
        }),
      })),
      insert: vi.fn(() => ({
        values: () => ({
          returning: async () => {
            events.push("participant_insert")
            return [{ id: "link_1" }]
          },
        }),
      })),
    }
    const transaction = vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx),
    )

    await bookingsService.addItemParticipant({ transaction } as never, "item_1", {
      travelerId: "traveler_1",
      role: "traveler",
      isPrimary: true,
    })

    expect(transaction).toHaveBeenCalledOnce()
    expect(events).toEqual([
      "item_lock",
      "traveler_lock",
      "participant_update",
      "participant_insert",
    ])
  })
})

function financeTablesUnavailable() {
  return { rows: [{ invoicesTable: null, paymentSchedulesTable: null }] }
}

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
