import { actionLedgerService, buildIdempotencyFingerprint } from "@voyant-travel/action-ledger"
import { afterEach, describe, expect, it, vi } from "vitest"
import { bookingsService } from "../../src/service.js"
import { authorizeBookingStatusMutation } from "../../src/status-authorization.js"

afterEach(() => vi.restoreAllMocks())

describe("booking status approval organization continuity", () => {
  it("passes the request organization into exact approval validation", async () => {
    vi.spyOn(bookingsService, "getBookingById").mockResolvedValue({
      status: "confirmed",
      sellCurrency: "EUR",
      sellAmountCents: 1000,
      costAmountCents: 500,
      customerPaymentPolicy: null,
      acceptedAt: new Date("2026-07-24T00:00:00.000Z"),
      confirmedAt: new Date("2026-07-24T00:00:00.000Z"),
      cancelledAt: null,
      completedAt: null,
    } as never)
    const validateApprovedAction = vi
      .spyOn(actionLedgerService, "validateApprovedAction")
      .mockResolvedValue({ ok: false, reason: "organization_mismatch" })
    vi.spyOn(actionLedgerService, "getApproval").mockResolvedValue(null)

    await expect(
      authorizeBookingStatusMutation({
        db: {} as never,
        key: "cancel",
        actionName: "booking.status.cancel",
        routeOrToolName: "bookings.cancel",
        bookingId: "booking_1",
        commandInput: { note: "Cancel" },
        actor: "staff",
        callerType: "agent",
        scopes: ["bookings:write"],
        requestContext: {
          agentId: "agent_1",
          organizationId: "org_1",
          callerType: "agent",
          actor: "staff",
        },
        conditionalApprovalRequired: true,
        approvalReasonCode: "agent_cancel",
        approvalId: "approval_1",
      }),
    ).resolves.toMatchObject({
      status: "invalid_approval",
      validation: { reason: "organization_mismatch" },
    })
    expect(validateApprovedAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ organizationId: "org_1" }),
    )
  })

  it("replays an exact succeeded command without fingerprinting mutated booking state", async () => {
    const commandInput = { note: "Cancel", suppressNotifications: true }
    const commandInputRef = await buildIdempotencyFingerprint({
      actionName: "booking.status.cancel",
      actionVersion: "v1",
      targetType: "booking",
      targetId: "booking_1",
      commandInput,
      policyInputs: {
        capabilityId: "bookings:status:cancel",
        capabilityVersion: "v1",
        routeOrToolName: "bookings.cancel_booking",
      },
    })
    vi.spyOn(actionLedgerService, "getApproval").mockResolvedValue({
      approval: { id: "approval_1", status: "approved" },
      requestedAction: {
        entry: {
          id: "requested_1",
          actionName: "booking.status.cancel",
          actionVersion: "v1",
          actionKind: "update",
          targetType: "booking",
          targetId: "booking_1",
          routeOrToolName: "bookings.cancel_booking",
          capabilityId: "bookings:status:cancel",
          capabilityVersion: "v1",
          principalType: "agent",
          principalId: "agent_1",
          organizationId: "org_1",
          idempotencyKey: "cancel-booking-1",
        },
        mutationDetail: { commandInputRef },
      },
    } as never)
    vi.spyOn(actionLedgerService, "listEntries").mockResolvedValue({
      entries: [{ id: "execution_1", status: "succeeded" }],
      total: 1,
    } as never)
    const getBooking = vi.spyOn(bookingsService, "getBookingById")

    await expect(
      authorizeBookingStatusMutation({
        db: {} as never,
        key: "cancel",
        actionName: "booking.status.cancel",
        routeOrToolName: "bookings.cancel_booking",
        bookingId: "booking_1",
        commandInput,
        actor: "staff",
        callerType: "agent",
        scopes: ["bookings:write"],
        requestContext: {
          agentId: "agent_1",
          organizationId: "org_1",
          callerType: "agent",
          actor: "staff",
        },
        conditionalApprovalRequired: true,
        approvalReasonCode: "agent_cancel",
        approvalId: "approval_1",
        idempotencyKey: "cancel-booking-1",
      }),
    ).resolves.toMatchObject({ status: "already_executed", bookingId: "booking_1" })
    expect(getBooking).not.toHaveBeenCalled()
  })
})
