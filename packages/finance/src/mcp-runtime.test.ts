import type { ToolContext, ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import { afterEach, describe, expect, it, vi } from "vitest"

const executeFinanceStaffBookingCreateCommand = vi.hoisted(() => vi.fn())
const authorizeFinanceInvoiceIssue = vi.hoisted(() => vi.fn())
const issueInvoiceFromBookingCommand = vi.hoisted(() => vi.fn())

vi.mock("./service-issue.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  issueInvoiceFromBookingCommand,
}))

vi.mock("./booking-create-command.js", () => ({
  executeFinanceStaffBookingCreateCommand,
}))

vi.mock("./invoice-issue-authorization.js", () => ({
  authorizeFinanceInvoiceIssue,
  FINANCE_INVOICE_ISSUE_ACTION_NAME: "finance.invoice.issue_from_booking",
  FINANCE_INVOICE_ISSUE_TOOL_NAME: "finance.issue_invoice_from_booking",
  FINANCE_INVOICE_ISSUE_CAPABILITY: {
    id: "finance:invoice-issue-from-booking",
    version: "v1",
    risk: "high",
  },
}))

import { bookingsService } from "@voyant-travel/bookings"
import { voyantToolContextContribution } from "./mcp-runtime.js"

afterEach(() => {
  vi.restoreAllMocks()
  executeFinanceStaffBookingCreateCommand.mockReset()
  authorizeFinanceInvoiceIssue.mockReset()
})

/**
 * Issuing an invoice is approval-gated, so it is inherently two calls with a
 * human decision in between. That made it the worst possible place to ask the
 * CALLER to invent an idempotency key and carry it across the gap — and measured
 * against the real surface, invoice issue was the one commercial step that never
 * completed. These cover the two halves of the fix: the key is derived from the
 * command, and the `approval_required` payload says what to do next.
 */
describe("finance issue_invoice_from_booking MCP runtime", () => {
  const command = { bookingId: "booking_1", kind: "proforma" }

  async function issue(input: Record<string, unknown>) {
    const contribution = await voyantToolContextContribution.contribute({
      request: request(),
      context: toolContext({}),
      resources: {},
    })
    const runtime = contribution.finance as {
      issueInvoiceFromBooking: (value: Record<string, unknown>) => Promise<unknown>
    }
    return runtime.issueInvoiceFromBooking(input)
  }

  function approvalRequired() {
    authorizeFinanceInvoiceIssue.mockResolvedValue({
      status: "approval_required",
      access: { authorizationSource: "scope" },
      requestedAction: {
        id: "action_1",
        status: "awaiting_approval",
        actionName: "finance.invoice.issue_from_booking",
        targetType: "booking",
        targetId: "booking_1",
      },
      approval: {
        id: "approval_1",
        status: "pending",
        requestedActionId: "action_1",
        policyName: "finance-invoice-issue-approval-v1",
        policyVersion: "v1",
        riskSnapshot: "high",
        reasonCode: null,
        expiresAt: null,
        createdAt: new Date("2026-08-05T10:00:00.000Z"),
      },
      replayed: false,
    })
  }

  it("derives the idempotency key from the command when the caller omits one", async () => {
    approvalRequired()

    await issue({ command })

    const passed = authorizeFinanceInvoiceIssue.mock.calls[0]?.[0]?.idempotencyKey
    expect(passed).toMatch(/^issue-invoice-from-booking:v1:[0-9a-f]{64}$/)
  })

  it("derives the SAME key for the same command and a different one otherwise", async () => {
    approvalRequired()

    // Stability across calls is the whole point: the call that requests approval
    // and the approved retry must agree, or the retry issues a second invoice.
    await issue({ command })
    await issue({ command: { ...command } })
    await issue({ command: { ...command, bookingId: "booking_2" } })

    const keys = authorizeFinanceInvoiceIssue.mock.calls.map((call) => call[0].idempotencyKey)
    expect(keys[0]).toBe(keys[1])
    expect(keys[2]).not.toBe(keys[0])
  })

  it("still honours an explicitly supplied key", async () => {
    approvalRequired()

    await issue({ command, idempotencyKey: "caller-chosen-key" })

    expect(authorizeFinanceInvoiceIssue.mock.calls[0]?.[0]?.idempotencyKey).toBe(
      "caller-chosen-key",
    )
  })

  /**
   * `InvoiceNumberAllocationError` calls `super(code)`, so an agent that reached
   * invoice issue got `[PROVIDER_ERROR] ... failed: no_active_series_for_scope` —
   * terminal, blameless, unactionable — while the operator UI has shown a full
   * remediation sentence for that same code all along.
   */
  it("turns an opaque numbering refusal into an actionable one", async () => {
    authorizeFinanceInvoiceIssue.mockResolvedValue({
      status: "authorized",
      access: { authorizationSource: "scope" },
      approvedAction: { requestedActionId: "a", approvalId: "b", idempotencyFingerprint: "c" },
    })
    issueInvoiceFromBookingCommand.mockRejectedValue(
      Object.assign(new Error("no_active_series_for_scope"), {
        code: "no_active_series_for_scope",
        scope: "proforma",
      }),
    )

    const error = (await issue({ command }).catch((thrown) => thrown)) as {
      code?: string
      nextSteps?: string[]
      meta?: unknown
    }

    expect(error.code).toBe("INVALID_INPUT")
    expect(error.nextSteps?.[0]).toContain("Finance admin surface")
    expect(error.meta).toMatchObject({ reason: "no_active_series_for_scope", scope: "proforma" })
  })

  it("rethrows a non-numbering failure untouched", async () => {
    authorizeFinanceInvoiceIssue.mockResolvedValue({
      status: "authorized",
      access: { authorizationSource: "scope" },
      approvedAction: { requestedActionId: "a", approvalId: "b", idempotencyFingerprint: "c" },
    })
    const other = new Error("connection reset")
    issueInvoiceFromBookingCommand.mockRejectedValue(other)

    await expect(issue({ command })).rejects.toBe(other)
  })

  it("tells the caller to approve and retry, naming the approval id", async () => {
    approvalRequired()

    const result = (await issue({ command })) as { nextSteps?: string[] }

    // Two steps, not three. The approval has ALREADY been created by this call,
    // so instructing the caller to request one again is what made this loop.
    expect(result.nextSteps).toHaveLength(2)
    expect(result.nextSteps?.[0]).toContain("approve_action_approval")
    expect(result.nextSteps?.[0]).toContain("approval_1")
    expect(result.nextSteps?.[1]).toContain("issue_invoice_from_booking")
    expect(result.nextSteps?.[1]).toContain("approval_1")
    expect(result.nextSteps?.join(" ")).not.toContain("request_action_approval")
  })
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
    documentsSuppressed: false,
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
