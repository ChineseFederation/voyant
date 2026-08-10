import type { ToolContext } from "@voyant-travel/tools"
import { afterEach, describe, expect, it, vi } from "vitest"

const authorizeBookingCancellationRefund = vi.hoisted(() => vi.fn())
const resolveBookingCancellationRefund = vi.hoisted(() => vi.fn())
const executeBookingCancellationRefund = vi.hoisted(() => vi.fn())

vi.mock("../../src/booking-cancellation-refund-authorization.js", () => ({
  authorizeBookingCancellationRefund,
}))
vi.mock("../../src/service-booking-cancellation-refund.js", () => ({
  resolveBookingCancellationRefund,
  executeBookingCancellationRefund,
}))

import { voyantToolContextContribution } from "../../src/mcp-runtime.js"
import type { FinanceToolServices } from "../../src/tools.js"

const toolContext: ToolContext = {
  db: {},
  actor: "staff",
  audience: "staff",
  tenantId: "operator_1",
  resolverScope: { locale: "en", audience: "staff", market: "default", actor: "staff" },
}
const request = {
  get(key: string) {
    return {
      actor: "staff",
      callerType: "agent",
      scopes: ["finance:refund", "bookings:read"],
      agentId: "agent_1",
      isInternalRequest: false,
    }[key]
  },
  req: { header: () => null },
}
const consequence = {
  bookingId: "booking_1",
  bookingNumber: "BK-1",
  cancellationActivityId: "activity_1",
  cancellationAsOf: "2026-07-15T10:00:00.000Z",
  invoiceId: "invoice_1",
  invoiceNumber: "INV-1",
  paymentId: "payment_1",
  amountCents: 32_500,
  currency: "EUR",
  refundableRemainderCents: 65_000,
  creditNoteNumber: "CN-BK-1-activity_1",
}

afterEach(() => {
  vi.restoreAllMocks()
  authorizeBookingCancellationRefund.mockReset()
  resolveBookingCancellationRefund.mockReset()
  executeBookingCancellationRefund.mockReset()
})

async function financeTools() {
  const contribution = await voyantToolContextContribution.contribute({
    context: toolContext,
    request,
    resources: {},
  })
  return contribution.finance as FinanceToolServices
}

describe("refund_cancelled_booking intent", () => {
  it("returns one approval bound to the server-resolved entitlement, invoice, and payment", async () => {
    resolveBookingCancellationRefund.mockResolvedValue(consequence)
    authorizeBookingCancellationRefund.mockResolvedValue({
      status: "approval_required",
      requestedAction: {
        id: "action_1",
        status: "awaiting_approval",
        actionName: "finance.booking.refund_cancellation",
        targetType: "booking",
        targetId: "booking_1",
      },
      approval: {
        id: "approval_1",
        status: "pending",
        requestedActionId: "action_1",
        policyName: "finance-booking-cancellation-refund-approval-v1",
        policyVersion: "v1",
        riskSnapshot: "critical",
        reasonCode: "booking_cancellation_refund_requested_by_agent",
        expiresAt: null,
        createdAt: new Date("2026-07-15T10:05:00.000Z"),
      },
      replayed: false,
    })

    await expect(
      (await financeTools()).refundCancelledBooking({
        bookingId: "booking_1",
        method: "bank_transfer",
      }),
    ).resolves.toMatchObject({
      status: "approval_required",
      approval: { id: "approval_1" },
      preview: {
        bookingId: "booking_1",
        invoiceId: "invoice_1",
        paymentId: "payment_1",
        amountCents: 32_500,
        currency: "EUR",
      },
      nextSteps: [
        expect.stringContaining("approve_action_approval"),
        expect.stringContaining("refund_cancelled_booking"),
      ],
    })
    expect(authorizeBookingCancellationRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        commandInput: {
          ...consequence,
          method: "bank_transfer",
          reference: null,
        },
      }),
    )
  })

  it("executes both accounting and money legs from the approved resolved consequence", async () => {
    resolveBookingCancellationRefund.mockResolvedValue(consequence)
    authorizeBookingCancellationRefund.mockResolvedValue({
      status: "authorized",
      access: {
        allowed: true,
        authorizationSource: "grant",
        capabilityId: "finance:booking-cancellation-refund",
        capabilityVersion: "v1",
      },
      approvedAction: {
        requestedActionId: "action_1",
        approvalId: "approval_1",
        idempotencyFingerprint: "fingerprint_1",
      },
    })
    executeBookingCancellationRefund.mockResolvedValue({
      creditNote: { id: "credit_note_1" },
      settlement: { id: "settlement_1", status: "settled" },
    })

    await expect(
      (await financeTools()).refundCancelledBooking({
        bookingId: "booking_1",
        method: "bank_transfer",
        reference: "SEPA-771",
        approvalId: "approval_1",
      }),
    ).resolves.toEqual({
      status: "settled",
      bookingId: "booking_1",
      invoiceId: "invoice_1",
      paymentId: "payment_1",
      creditNoteId: "credit_note_1",
      settlementId: "settlement_1",
      amountCents: 32_500,
      currency: "EUR",
      replayed: false,
      committedChanges: ["credit_note_issued", "refund_settlement_recorded"],
      nextActions: [],
    })
    expect(executeBookingCancellationRefund).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ...consequence,
        method: "bank_transfer",
        reference: "SEPA-771",
      }),
      expect.objectContaining({
        approvalId: "approval_1",
        requestedActionId: "action_1",
      }),
    )
  })

  it("refuses an approved retry when the resolved entitlement or payment changed", async () => {
    resolveBookingCancellationRefund
      .mockResolvedValueOnce(consequence)
      .mockResolvedValueOnce({ ...consequence, paymentId: "payment_2" })
    authorizeBookingCancellationRefund
      .mockResolvedValueOnce({
        status: "approval_required",
        requestedAction: {
          id: "action_1",
          status: "awaiting_approval",
          actionName: "finance.booking.refund_cancellation",
          targetType: "booking",
          targetId: "booking_1",
        },
        approval: {
          id: "approval_1",
          status: "pending",
          requestedActionId: "action_1",
          policyName: "finance-booking-cancellation-refund-approval-v1",
          policyVersion: "v1",
          riskSnapshot: "critical",
          reasonCode: "booking_cancellation_refund_requested_by_agent",
          expiresAt: null,
          createdAt: new Date("2026-07-15T10:05:00.000Z"),
        },
        replayed: false,
      })
      .mockResolvedValueOnce({
        status: "invalid_approval",
        validation: { reason: "fingerprint_mismatch" },
      })
    const tools = await financeTools()
    const input = { bookingId: "booking_1", method: "bank_transfer" as const }

    await tools.refundCancelledBooking(input)
    await expect(
      tools.refundCancelledBooking({ ...input, approvalId: "approval_1" }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      meta: { reason: "fingerprint_mismatch" },
    })
    expect(executeBookingCancellationRefund).not.toHaveBeenCalled()
  })
})
