import {
  buildActionLedgerApprovedExecutionFields,
  decideActionLedgerApproval,
} from "@voyant-travel/action-ledger"
import { bookingItems, bookings } from "@voyant-travel/bookings/schema"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  authorizeFinanceInvoiceIssue,
  FINANCE_INVOICE_ISSUE_ACTION_NAME,
  FINANCE_INVOICE_ISSUE_CAPABILITY,
  FINANCE_INVOICE_ISSUE_TOOL_NAME,
} from "../../src/invoice-issue-authorization.js"
import {
  bookingItemTaxLines,
  bookingPaymentSchedules,
  invoiceLineItems,
  invoiceNumberSeries,
  invoices,
} from "../../src/schema.js"
import { financeBookingItemBillingService } from "../../src/service-booking-item-billing.js"
import {
  buildUnsyncedProformaApprovalSnapshot,
  issueInvoiceFromBookingCommand,
} from "../../src/service-issue.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)

describe.skipIf(!DB_AVAILABLE)("unsynced proforma command", () => {
  let db: ReturnType<typeof import("@voyant-travel/db/test-utils").createTestDb>

  const context = {
    userId: "usr_unsynced_proforma_test",
    organizationId: "org_unsynced_proforma_test",
    callerType: "agent",
    actor: "staff",
  } as const

  beforeAll(async () => {
    const { createTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  async function seedBooking() {
    const [booking] = await db
      .insert(bookings)
      .values({
        bookingNumber: "BK-UNSYNCED-PROFORMA",
        sellCurrency: "EUR",
        sellAmountCents: 80_000,
        costAmountCents: 50_000,
        marginPercent: 37.5,
        startDate: "2026-08-10",
      })
      .returning()
    const [item] = await db
      .insert(bookingItems)
      .values({
        bookingId: booking!.id,
        title: "Coastal day cruise",
        quantity: 2,
        sellCurrency: "EUR",
        unitSellAmountCents: 40_000,
        totalSellAmountCents: 80_000,
      })
      .returning()
    await db.insert(invoiceNumberSeries).values({
      code: "unsynced-proforma",
      name: "Unsynced proforma",
      prefix: "PRO",
      separator: "-",
      padLength: 4,
      currentSequence: 0,
      scope: "proforma",
      isDefault: true,
      active: true,
    })
    return { booking: booking!, item: item! }
  }

  it("writes nothing for a stale review and exactly one issued proforma after exact approval", async () => {
    const { booking } = await seedBooking()
    const reviewedAt = booking.updatedAt.toISOString()
    const command = {
      bookingId: booking.id,
      issueDate: "2026-07-29",
      dueDate: "2026-08-05",
      invoiceType: "proforma" as const,
      skipExternalSync: true,
    }

    await db
      .update(bookings)
      .set({ updatedAt: new Date(booking.updatedAt.getTime() + 1_000) })
      .where(eq(bookings.id, booking.id))
    const stale = await issueInvoiceFromBookingCommand(
      db,
      command,
      {},
      { expectedBookingUpdatedAt: reviewedAt },
    )
    expect(stale).toMatchObject({ status: "booking_changed" })
    expect(await db.select().from(invoices)).toHaveLength(0)

    const [current] = await db.select().from(bookings).where(eq(bookings.id, booking.id))
    const snapshot = await buildUnsyncedProformaApprovalSnapshot(db, booking.id)
    expect(snapshot).not.toBeNull()
    const authorizationCommand = {
      ...command,
      bookingUpdatedAt: current!.updatedAt.toISOString(),
      snapshotFingerprint: snapshot!.snapshotFingerprint,
    }
    const requested = await authorizeFinanceInvoiceIssue({
      db,
      commandInput: authorizationCommand,
      actor: "staff",
      callerType: "agent",
      scopes: ["finance:write", "bookings:read"],
      requestContext: context,
      idempotencyKey: "unsynced-proforma-booking-v1",
    })
    expect(requested.status).toBe("approval_required")
    if (requested.status !== "approval_required") throw new Error("approval not requested")

    await decideActionLedgerApproval(db, {
      context,
      id: requested.approval.id,
      status: "approved",
      actionName: "finance.invoice.approval.decision",
      actionVersion: "v1",
      evaluatedRisk: "high",
      organizationId: context.organizationId,
    })
    const authorization = await authorizeFinanceInvoiceIssue({
      db,
      commandInput: authorizationCommand,
      actor: "staff",
      callerType: "agent",
      scopes: ["finance:write", "bookings:read"],
      requestContext: context,
      approvalId: requested.approval.id,
      idempotencyKey: "unsynced-proforma-booking-v1",
    })
    expect(authorization.status).toBe("authorized")
    if (authorization.status !== "authorized") throw new Error("approval not authorized")

    const approved = buildActionLedgerApprovedExecutionFields(authorization.approvedAction)
    const ledgerRuntime = {
      actionLedgerContext: context,
      actionLedgerAuthorizationSource: authorization.access.authorizationSource,
      actionLedgerActionName: FINANCE_INVOICE_ISSUE_ACTION_NAME,
      actionLedgerRouteOrToolName: FINANCE_INVOICE_ISSUE_TOOL_NAME,
      actionLedgerCapabilityId: FINANCE_INVOICE_ISSUE_CAPABILITY.id,
      actionLedgerCapabilityVersion: FINANCE_INVOICE_ISSUE_CAPABILITY.version,
      actionLedgerEvaluatedRisk: FINANCE_INVOICE_ISSUE_CAPABILITY.risk,
      actionLedgerCausationActionId: approved.causationActionId,
      actionLedgerApprovalId: approved.approvalId,
      actionLedgerIdempotencyScope: approved.idempotencyScope,
      actionLedgerIdempotencyKey: approved.idempotencyKey,
      actionLedgerIdempotencyFingerprint: approved.idempotencyFingerprint,
    }
    await expect(
      issueInvoiceFromBookingCommand(
        db,
        command,
        {
          ...ledgerRuntime,
          eventBus: {
            emit: async () => {
              throw new Error("simulated post-write failure")
            },
          } as never,
        },
        {
          expectedBookingUpdatedAt: authorizationCommand.bookingUpdatedAt,
          expectedSnapshotFingerprint: authorizationCommand.snapshotFingerprint,
        },
      ),
    ).rejects.toThrow("simulated post-write failure")
    expect(await db.select().from(invoices)).toHaveLength(0)

    const retryAuthorization = await authorizeFinanceInvoiceIssue({
      db,
      commandInput: authorizationCommand,
      actor: "staff",
      callerType: "agent",
      scopes: ["finance:write", "bookings:read"],
      requestContext: context,
      approvalId: requested.approval.id,
      idempotencyKey: "unsynced-proforma-booking-v1",
    })
    expect(retryAuthorization.status).toBe("authorized")

    const outcome = await issueInvoiceFromBookingCommand(db, command, ledgerRuntime, {
      expectedBookingUpdatedAt: authorizationCommand.bookingUpdatedAt,
      expectedSnapshotFingerprint: authorizationCommand.snapshotFingerprint,
    })
    expect(outcome).toMatchObject({
      status: "issued",
      invoice: {
        invoiceType: "proforma",
        status: "issued",
        invoiceNumber: "PRO-0001",
        totalCents: 80_000,
        currency: "EUR",
      },
    })

    const persisted = await db.select().from(invoices)
    expect(persisted).toHaveLength(1)
    expect(
      await db
        .select()
        .from(invoiceLineItems)
        .where(eq(invoiceLineItems.invoiceId, persisted[0]!.id)),
    ).toHaveLength(1)

    const replay = await authorizeFinanceInvoiceIssue({
      db,
      commandInput: authorizationCommand,
      actor: "staff",
      callerType: "agent",
      scopes: ["finance:write", "bookings:read"],
      requestContext: context,
      approvalId: requested.approval.id,
      idempotencyKey: "unsynced-proforma-booking-v1",
    })
    expect(replay).toMatchObject({
      status: "already_executed",
      invoiceId: persisted[0]!.id,
    })
    expect(await db.select().from(invoices)).toHaveLength(1)
  })

  it("binds excluded taxes to the preview fingerprint and refuses a changed tax snapshot", async () => {
    const { booking, item } = await seedBooking()
    await db.insert(bookingItemTaxLines).values({
      bookingItemId: item.id,
      name: "VAT",
      scope: "excluded",
      currency: "EUR",
      amountCents: 15_200,
      rateBasisPoints: 1_900,
      includedInPrice: false,
    })
    const approved = await buildUnsyncedProformaApprovalSnapshot(db, booking.id)
    expect(approved).toMatchObject({
      subtotalCents: 80_000,
      taxCents: 15_200,
      totalCents: 95_200,
      payer: { type: "person", id: null },
      lines: [
        {
          taxes: [
            {
              name: "VAT",
              amountCents: 15_200,
              rateBasisPoints: 1_900,
            },
          ],
        },
      ],
    })
    await db
      .update(bookingItemTaxLines)
      .set({ rateBasisPoints: 2_100 })
      .where(eq(bookingItemTaxLines.bookingItemId, item.id))

    const outcome = await issueInvoiceFromBookingCommand(
      db,
      {
        bookingId: booking.id,
        issueDate: "2026-07-29",
        dueDate: "2026-08-05",
        invoiceType: "proforma",
        skipExternalSync: true,
      },
      {},
      {
        expectedBookingUpdatedAt: booking.updatedAt.toISOString(),
        expectedSnapshotFingerprint: approved!.snapshotFingerprint,
      },
    )
    expect(outcome).toMatchObject({ status: "approval_snapshot_changed" })
    expect(await db.select().from(invoices)).toHaveLength(0)
  })

  it("excludes obsolete schedules from tax allocation and refuses selecting one", async () => {
    const { booking, item } = await seedBooking()
    await db.insert(bookingItemTaxLines).values({
      bookingItemId: item.id,
      name: "VAT",
      scope: "included",
      currency: "EUR",
      amountCents: 8_000,
      rateBasisPoints: 1_000,
      includedInPrice: true,
    })
    const [current, obsolete] = await db
      .insert(bookingPaymentSchedules)
      .values([
        {
          bookingId: booking.id,
          bookingItemId: item.id,
          scheduleType: "deposit",
          status: "pending",
          dueDate: "2026-08-01",
          currency: "EUR",
          amountCents: 40_000,
        },
        {
          bookingId: booking.id,
          bookingItemId: item.id,
          scheduleType: "balance",
          status: "cancelled",
          dueDate: "2026-08-05",
          currency: "EUR",
          amountCents: 40_000,
        },
      ])
      .returning()

    await expect(
      issueInvoiceFromBookingCommand(db, {
        bookingId: booking.id,
        bookingPaymentScheduleId: obsolete!.id,
        issueDate: "2026-07-29",
        dueDate: "2026-08-05",
        invoiceType: "proforma",
        skipExternalSync: true,
      }),
    ).resolves.toEqual({ status: "payment_schedule_not_found" })

    const outcome = await issueInvoiceFromBookingCommand(db, {
      bookingId: booking.id,
      bookingPaymentScheduleId: current!.id,
      issueDate: "2026-07-29",
      dueDate: "2026-08-01",
      invoiceType: "proforma",
      skipExternalSync: true,
    })
    expect(outcome).toMatchObject({
      status: "issued",
      invoice: { subtotalCents: 32_000, taxCents: 8_000, totalCents: 40_000 },
    })
  })

  it("serializes tax inserts behind exact snapshot validation and issuance", async () => {
    const { booking, item } = await seedBooking()
    const approved = await buildUnsyncedProformaApprovalSnapshot(db, booking.id)
    expect(approved).not.toBeNull()

    let signalProjectionLocked: (() => void) | undefined
    const projectionLocked = new Promise<void>((resolve) => {
      signalProjectionLocked = resolve
    })
    let releaseProjection: (() => void) | undefined
    const projectionReleased = new Promise<void>((resolve) => {
      releaseProjection = resolve
    })
    let paused = false

    const issuePromise = issueInvoiceFromBookingCommand(
      db,
      {
        bookingId: booking.id,
        issueDate: "2026-07-29",
        dueDate: "2026-08-05",
        invoiceType: "proforma",
        skipExternalSync: true,
      },
      {
        descriptionResolver: async ({ line }) => {
          if (!paused) {
            paused = true
            signalProjectionLocked?.()
            await projectionReleased
          }
          return line.description
        },
      },
      {
        expectedBookingUpdatedAt: booking.updatedAt.toISOString(),
        expectedSnapshotFingerprint: approved!.snapshotFingerprint,
      },
    )

    await projectionLocked
    let taxInsertSettled = false
    const taxInsertPromise = financeBookingItemBillingService
      .createBookingItemTaxLine(db, item.id, {
        name: "Late VAT",
        scope: "excluded",
        currency: "EUR",
        amountCents: 15_200,
        rateBasisPoints: 1_900,
        includedInPrice: false,
      })
      .then((row) => {
        taxInsertSettled = true
        return row
      })

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(taxInsertSettled).toBe(false)

    releaseProjection?.()
    await expect(issuePromise).resolves.toMatchObject({ status: "issued" })
    await expect(taxInsertPromise).resolves.toMatchObject({ name: "Late VAT" })

    const [persistedInvoice] = await db.select().from(invoices)
    expect(persistedInvoice?.totalCents).toBe(80_000)
  })
})
