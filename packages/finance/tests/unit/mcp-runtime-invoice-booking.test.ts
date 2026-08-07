import type { ToolContext } from "@voyant-travel/tools"
import { afterEach, describe, expect, it, vi } from "vitest"

const authorizeFinanceInvoiceIssue = vi.hoisted(() => vi.fn())
const buildUnsyncedProformaApprovalSnapshot = vi.hoisted(() => vi.fn())

vi.mock("../../src/invoice-issue-authorization.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/invoice-issue-authorization.js")>()),
  authorizeFinanceInvoiceIssue,
}))
vi.mock("../../src/service-issue.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/service-issue.js")>()),
  buildUnsyncedProformaApprovalSnapshot,
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
      scopes: ["finance:write", "bookings:read"],
      agentId: "agent_1",
      isInternalRequest: false,
    }[key]
  },
  req: { header: () => null },
}
const preview = {
  id: "booking_1",
  bookingId: "booking_1",
  bookingNumber: "BK-1",
  bookingUpdatedAt: "2026-07-15T09:30:00.000Z",
  snapshotFingerprint: "snapshot_1",
  payer: { type: "organization", id: "org_1" },
  currency: "EUR",
  subtotalCents: 80_000,
  taxCents: 0,
  totalCents: 80_000,
  lines: [],
}

afterEach(() => {
  vi.restoreAllMocks()
  authorizeFinanceInvoiceIssue.mockReset()
  buildUnsyncedProformaApprovalSnapshot.mockReset()
})

async function financeTools() {
  const contribution = await voyantToolContextContribution.contribute({
    context: toolContext,
    request,
    resources: {},
  })
  return contribution.finance as FinanceToolServices
}

describe("invoice_booking intent", () => {
  it("returns the authoritative preview with the approval created for that snapshot", async () => {
    buildUnsyncedProformaApprovalSnapshot.mockResolvedValue(preview)
    authorizeFinanceInvoiceIssue.mockResolvedValue({
      status: "approval_required",
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
        reasonCode: "invoice_issue_from_booking_requested_by_agent",
        expiresAt: null,
        createdAt: new Date("2026-07-15T10:00:00.000Z"),
      },
      replayed: false,
    })

    await expect(
      (await financeTools()).invoiceBooking({
        bookingId: "booking_1",
        issueDate: "2026-07-15",
        dueDate: "2026-08-15",
      }),
    ).resolves.toMatchObject({
      status: "approval_required",
      approval: { id: "approval_1" },
      preview: { bookingId: "booking_1", totalCents: 80_000 },
      nextSteps: [
        expect.stringContaining("approve_action_approval"),
        expect.stringContaining("invoice_booking"),
      ],
    })
    expect(authorizeFinanceInvoiceIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        commandInput: expect.objectContaining({
          bookingId: "booking_1",
          bookingUpdatedAt: preview.bookingUpdatedAt,
          snapshotFingerprint: preview.snapshotFingerprint,
        }),
      }),
    )
  })

  it("recomputes the snapshot on the approved retry and refuses changed money", async () => {
    buildUnsyncedProformaApprovalSnapshot.mockResolvedValueOnce(preview).mockResolvedValueOnce({
      ...preview,
      snapshotFingerprint: "snapshot_changed",
      totalCents: 90_000,
    })
    authorizeFinanceInvoiceIssue
      .mockResolvedValueOnce({
        status: "approval_required",
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
          reasonCode: "invoice_issue_from_booking_requested_by_agent",
          expiresAt: null,
          createdAt: new Date("2026-07-15T10:00:00.000Z"),
        },
        replayed: false,
      })
      .mockResolvedValueOnce({
        status: "invalid_approval",
        validation: { ok: false, reason: "fingerprint_mismatch" },
      })
    const tools = await financeTools()
    const input = {
      bookingId: "booking_1",
      issueDate: "2026-07-15",
      dueDate: "2026-08-15",
    }

    await tools.invoiceBooking(input)
    await expect(
      tools.invoiceBooking({ ...input, approvalId: "approval_1" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" })
    expect(authorizeFinanceInvoiceIssue).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        approvalId: "approval_1",
        commandInput: expect.objectContaining({
          snapshotFingerprint: "snapshot_changed",
        }),
      }),
    )
  })
})
