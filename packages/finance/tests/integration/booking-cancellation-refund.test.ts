import {
  buildActionLedgerApprovedExecutionFields,
  decideActionLedgerApproval,
} from "@voyant-travel/action-ledger"
import { bookingActivityLog, bookings } from "@voyant-travel/bookings/schema"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { authorizeBookingCancellationRefund } from "../../src/booking-cancellation-refund-authorization.js"
import { invoices, payments } from "../../src/schema.js"
import {
  executeBookingCancellationRefund,
  resolveBookingCancellationRefund,
} from "../../src/service-booking-cancellation-refund.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

describe.skipIf(!DB_AVAILABLE)("booking cancellation refund intent", () => {
  let db: ReturnType<typeof import("@voyant-travel/db/test-utils").createTestDb>

  beforeAll(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
    await cleanupTestDb(db)
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
  })

  it("resolves the durable cash entitlement to the paid invoice and original payment", async () => {
    const { booking, activity, invoice, payment } = await seedCancelledPaidBooking(db)

    await expect(resolveBookingCancellationRefund(db, booking.id)).resolves.toEqual({
      bookingId: booking.id,
      bookingNumber: "BK-REFUND-1",
      cancellationActivityId: activity.id,
      cancellationAsOf: "2026-08-10T00:00:00.000Z",
      invoiceId: invoice.id,
      invoiceNumber: "INV-REFUND-1",
      paymentId: payment.id,
      amountCents: 32_500,
      currency: "EUR",
      refundableRemainderCents: 65_000,
      creditNoteNumber: `CN-BK-REFUND-1-${activity.id}`,
    })
  })

  it("issues the approved credit note and settles it against the original payment atomically", async () => {
    const { booking, invoice, payment } = await seedCancelledPaidBooking(db)
    const consequence = await resolveBookingCancellationRefund(db, booking.id)
    const command = { ...consequence, method: "bank_transfer" as const, reference: "SEPA-771" }
    const requestContext = {
      userId: "staff_1",
      callerType: "agent",
      actor: "staff",
      organizationId: "operator_1",
      agentId: "agent_1",
    }
    const pending = await authorizeBookingCancellationRefund({
      db,
      commandInput: command,
      actor: "staff",
      callerType: "agent",
      scopes: ["finance:refund", "bookings:read"],
      isInternalRequest: false,
      requestContext,
      idempotencyKey: "refund-command-1",
    })
    if (pending.status !== "approval_required") throw new Error("Approval seed failed")
    await decideActionLedgerApproval(db, {
      context: requestContext,
      id: pending.approval.id,
      status: "approved",
      actionName: "test.approval.decision",
      actionVersion: "v1",
      evaluatedRisk: "critical",
      organizationId: "operator_1",
    })
    const authorized = await authorizeBookingCancellationRefund({
      db,
      commandInput: command,
      actor: "staff",
      callerType: "agent",
      scopes: ["finance:refund", "bookings:read"],
      isInternalRequest: false,
      requestContext,
      approvalId: pending.approval.id,
      idempotencyKey: "refund-command-1",
    })
    if (authorized.status !== "authorized") throw new Error("Authorization seed failed")
    const approved = buildActionLedgerApprovedExecutionFields(authorized.approvedAction)

    const result = await executeBookingCancellationRefund(db, command, {
      actionLedgerContext: requestContext,
      authorizationSource: authorized.access.authorizationSource,
      causationActionId: approved.causationActionId,
      approvalId: approved.approvalId,
      requestedActionId: authorized.approvedAction.requestedActionId,
      idempotencyScope: approved.idempotencyScope,
      idempotencyKey: approved.idempotencyKey,
      idempotencyFingerprint: approved.idempotencyFingerprint,
    })

    expect(result.creditNote).toMatchObject({
      invoiceId: invoice.id,
      amountCents: 32_500,
      currency: "EUR",
      status: "issued",
    })
    expect(result.settlement).toMatchObject({
      bookingId: booking.id,
      invoiceId: invoice.id,
      paymentId: payment.id,
      creditNoteId: result.creditNote.id,
      amountCents: 32_500,
      currency: "EUR",
      method: "bank_transfer",
      status: "settled",
      externalReference: "SEPA-771",
    })
    await expect(
      authorizeBookingCancellationRefund({
        db,
        commandInput: command,
        actor: "staff",
        callerType: "agent",
        scopes: ["finance:refund", "bookings:read"],
        isInternalRequest: false,
        requestContext,
        approvalId: pending.approval.id,
        idempotencyKey: "refund-command-1",
      }),
    ).resolves.toMatchObject({
      status: "already_executed",
      creditNoteId: result.creditNote.id,
    })
  })

  it("requires manual review instead of inferring legacy cancellation terms", async () => {
    const [booking] = await db
      .insert(bookings)
      .values({
        bookingNumber: "BK-LEGACY-1",
        status: "cancelled",
        sellCurrency: "EUR",
        sellAmountCents: 65_000,
      })
      .returning()
    if (!booking) throw new Error("Legacy booking seed failed")

    await expect(resolveBookingCancellationRefund(db, booking.id)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      meta: {
        reason: "cancellation_entitlement_missing",
        manualReviewRequired: true,
      },
    })
  })
})

async function seedCancelledPaidBooking(
  db: ReturnType<typeof import("@voyant-travel/db/test-utils").createTestDb>,
) {
  const [booking] = await db
    .insert(bookings)
    .values({
      bookingNumber: "BK-REFUND-1",
      status: "cancelled",
      sellCurrency: "EUR",
      sellAmountCents: 65_000,
    })
    .returning()
  if (!booking) throw new Error("Booking seed failed")

  const [activity] = await db
    .insert(bookingActivityLog)
    .values({
      bookingId: booking.id,
      actorId: "staff_1",
      activityType: "status_change",
      description: "Booking cancelled with evaluated entitlement",
      metadata: {
        oldStatus: "confirmed",
        newStatus: "cancelled",
        cancellationPolicyEntitlement: {
          status: "evaluated",
          asOf: "2026-08-10T00:00:00.000Z",
          currency: "EUR",
          totalCents: 65_000,
          refundCents: 32_500,
          knownRefundCents: 32_500,
          refundPercent: 50,
          refundType: "cash_or_credit",
          reasons: [],
          items: [],
        },
      },
    })
    .returning()
  if (!activity) throw new Error("Cancellation activity seed failed")

  const [invoice] = await db
    .insert(invoices)
    .values({
      invoiceNumber: "INV-REFUND-1",
      bookingId: booking.id,
      invoiceType: "invoice",
      status: "paid",
      currency: "EUR",
      issueDate: "2026-08-01",
      dueDate: "2026-08-08",
      subtotalCents: 65_000,
      taxCents: 0,
      totalCents: 65_000,
      paidCents: 65_000,
      balanceDueCents: 0,
    })
    .returning()
  if (!invoice) throw new Error("Invoice seed failed")

  const [payment] = await db
    .insert(payments)
    .values({
      invoiceId: invoice.id,
      amountCents: 65_000,
      currency: "EUR",
      paymentMethod: "bank_transfer",
      status: "completed",
      paymentDate: "2026-08-01",
    })
    .returning()
  if (!payment) throw new Error("Payment seed failed")

  return { booking, activity, invoice, payment }
}
