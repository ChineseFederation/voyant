import { buildActionLedgerApprovedExecutionFields } from "@voyant-travel/action-ledger"
import { defineToolContextContribution, ToolError } from "@voyant-travel/tools"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"

import {
  authorizeFinanceInvoiceIssue,
  FINANCE_INVOICE_ISSUE_ACTION_NAME,
  FINANCE_INVOICE_ISSUE_CAPABILITY,
  FINANCE_INVOICE_ISSUE_TOOL_NAME,
} from "./invoice-issue-authorization.js"
import { financeBookingToolServices } from "./mcp-booking-runtime.js"
import { financeToolActionLedgerContext } from "./mcp-runtime-shared.js"
import {
  authorizeFinanceRefund,
  FINANCE_REFUND_ACTION_NAME,
  FINANCE_REFUND_CAPABILITY,
  FINANCE_REFUND_ROUTE_OR_TOOL_NAME,
} from "./refund-authorization.js"
import { getFinanceRouteRuntime } from "./routes-runtime.js"
import type { Env } from "./routes-shared.js"
import { type CreateInvoiceFromBookingInput, financeService } from "./service.js"
import {
  buildUnsyncedProformaApprovalSnapshot,
  issueInvoiceFromBookingCommand,
} from "./service-issue.js"
import { toJsonValue } from "./tool-json.js"

export * from "./tools.js"

export const voyantToolContextContribution = defineToolContextContribution({
  context: ["finance"],
  contribute: ({ context, request }) => {
    const c = request as Context<Env>
    const db = context.db as Parameters<typeof financeService.listInvoices>[0]
    return {
      finance: {
        listInvoices: (query: Parameters<typeof financeService.listInvoices>[1]) =>
          financeService.listInvoices(db, query),
        getInvoiceById: (id: string) => financeService.getInvoiceById(db, id),
        getFinanceAggregates: (query: Parameters<typeof financeService.getFinanceAggregates>[1]) =>
          financeService.getFinanceAggregates(db, query),
        voidInvoice: (id: string, input: { reason?: string }) =>
          financeService.voidInvoice(db, id, input),
        // create_booking + book_product (voyant#3933) — both compose the durable
        // booking-create command; book_product resolves reference and key server-side.
        ...financeBookingToolServices(db as PostgresJsDatabase, c),
        async issueInvoiceFromBooking(input: {
          command: CreateInvoiceFromBookingInput
          idempotencyKey: string
          approvalId?: string
        }) {
          return executeInvoiceIssueTool({ db, c, ...input })
        },
        async previewUnsyncedProformaFromBooking(input: { bookingId: string }) {
          const snapshot = await buildUnsyncedProformaApprovalSnapshot(
            db,
            input.bookingId,
            getFinanceRouteRuntime(c),
          )
          if (!snapshot) {
            throw new ToolError("Booking was not found.", "NOT_FOUND", {
              bookingId: input.bookingId,
            })
          }
          return snapshot
        },
        async issueUnsyncedProformaFromBooking(input: {
          bookingId: string
          bookingUpdatedAt: string
          snapshotFingerprint: string
          issueDate: string
          dueDate: string
          idempotencyKey: string
          approvalId?: string
        }) {
          const command = {
            bookingId: input.bookingId,
            issueDate: input.issueDate,
            dueDate: input.dueDate,
            invoiceType: "proforma" as const,
            skipExternalSync: true,
          }
          return executeInvoiceIssueTool({
            db,
            c,
            command,
            authorizationCommand: {
              ...command,
              bookingUpdatedAt: input.bookingUpdatedAt,
              snapshotFingerprint: input.snapshotFingerprint,
            },
            expectedBookingUpdatedAt: input.bookingUpdatedAt,
            expectedSnapshotFingerprint: input.snapshotFingerprint,
            idempotencyKey: input.idempotencyKey,
            approvalId: input.approvalId,
          })
        },
        async issueInvoiceRefund(input: {
          invoiceId: string
          creditNoteNumber: string
          amountCents: number
          currency: string
          baseCurrency?: string | null
          baseAmountCents?: number | null
          fxRateSetId?: string | null
          reason: string
          notes?: string | null
          idempotencyKey: string
          approvalId?: string
        }) {
          const command = {
            creditNoteNumber: input.creditNoteNumber,
            status: "issued" as const,
            amountCents: input.amountCents,
            currency: input.currency,
            baseCurrency: input.baseCurrency,
            baseAmountCents: input.baseAmountCents,
            fxRateSetId: input.fxRateSetId,
            reason: input.reason,
            notes: input.notes,
          }
          const requestContext = financeToolActionLedgerContext(c)
          const authorization = await authorizeFinanceRefund({
            db,
            invoiceId: input.invoiceId,
            commandInput: command,
            actor: c.get("actor"),
            callerType: c.get("callerType"),
            scopes: c.get("scopes"),
            isInternalRequest: c.get("isInternalRequest"),
            requestContext,
            approvalId: input.approvalId ?? null,
            idempotencyKey: input.idempotencyKey,
          })

          if (authorization.status === "approval_required") {
            return {
              status: "approval_required" as const,
              requestedAction: {
                id: authorization.requestedAction.id,
                status: authorization.requestedAction.status,
                actionName: authorization.requestedAction.actionName,
                targetType: authorization.requestedAction.targetType,
                targetId: authorization.requestedAction.targetId,
              },
              approval: {
                id: authorization.approval.id,
                status: authorization.approval.status,
                requestedActionId: authorization.approval.requestedActionId,
                policyName: authorization.approval.policyName,
                policyVersion: authorization.approval.policyVersion,
                riskSnapshot: authorization.approval.riskSnapshot,
                reasonCode: authorization.approval.reasonCode,
                expiresAt: toIsoString(authorization.approval.expiresAt),
                createdAt: toIsoString(authorization.approval.createdAt),
              },
              replayed: authorization.replayed,
            }
          }
          if (authorization.status === "already_executed") {
            const creditNote = await financeService.getCreditNoteById(
              db,
              authorization.creditNoteId,
            )
            if (!creditNote) {
              throw new ToolError("The previously issued credit note was not found.", "NOT_FOUND", {
                creditNoteId: authorization.creditNoteId,
              })
            }
            if (creditNote.invoiceId !== input.invoiceId || creditNote.status !== "issued") {
              throw new ToolError(
                "The previous refund result does not match this issued invoice credit note.",
                "INVALID_INPUT",
                { creditNoteId: authorization.creditNoteId, invoiceId: input.invoiceId },
              )
            }
            return {
              status: "issued" as const,
              creditNote: toJsonValue(creditNote),
              replayed: true,
            }
          }
          if (authorization.status !== "authorized") {
            throw financeRefundAuthorizationError(authorization)
          }

          const approved = buildActionLedgerApprovedExecutionFields(authorization.approvedAction)
          const creditNote = await financeService.createCreditNote(db, input.invoiceId, command, {
            eventBus: c.get("eventBus"),
            actionLedgerContext: requestContext,
            actionLedgerAuthorizationSource: authorization.access.authorizationSource,
            actionLedgerActionName: FINANCE_REFUND_ACTION_NAME,
            actionLedgerRouteOrToolName: FINANCE_REFUND_ROUTE_OR_TOOL_NAME,
            actionLedgerTargetType: "invoice",
            actionLedgerTargetId: input.invoiceId,
            actionLedgerCapabilityId: FINANCE_REFUND_CAPABILITY.id,
            actionLedgerCapabilityVersion: FINANCE_REFUND_CAPABILITY.version,
            actionLedgerEvaluatedRisk: FINANCE_REFUND_CAPABILITY.risk,
            actionLedgerCausationActionId: approved.causationActionId,
            actionLedgerApprovalId: approved.approvalId,
            actionLedgerIdempotencyScope: approved.idempotencyScope,
            actionLedgerIdempotencyKey: approved.idempotencyKey,
            actionLedgerIdempotencyFingerprint: approved.idempotencyFingerprint,
          })
          if (!creditNote) {
            throw new ToolError(`Invoice "${input.invoiceId}" was not found.`, "NOT_FOUND", {
              invoiceId: input.invoiceId,
            })
          }
          return {
            status: "issued" as const,
            creditNote: toJsonValue(creditNote),
            replayed: false,
          }
        },
      },
    }
  },
})

async function executeInvoiceIssueTool(input: {
  db: PostgresJsDatabase
  c: Context<Env>
  command: CreateInvoiceFromBookingInput
  authorizationCommand?: CreateInvoiceFromBookingInput & {
    bookingUpdatedAt?: string
    snapshotFingerprint?: string
  }
  expectedBookingUpdatedAt?: string
  expectedSnapshotFingerprint?: string
  idempotencyKey: string
  approvalId?: string
}) {
  const requestContext = financeToolActionLedgerContext(input.c)
  const authorization = await authorizeFinanceInvoiceIssue({
    db: input.db,
    commandInput: input.authorizationCommand ?? input.command,
    actor: input.c.get("actor"),
    callerType: input.c.get("callerType"),
    scopes: input.c.get("scopes"),
    isInternalRequest: input.c.get("isInternalRequest"),
    requestContext,
    approvalId: input.approvalId ?? null,
    idempotencyKey: input.idempotencyKey,
  })
  if (authorization.status === "approval_required") {
    return pendingApprovalResult(authorization)
  }
  if (authorization.status === "already_executed") {
    const invoice = await financeService.getInvoiceById(input.db, authorization.invoiceId)
    if (!invoice) {
      throw new ToolError("The previously issued invoice was not found.", "NOT_FOUND", {
        invoiceId: authorization.invoiceId,
      })
    }
    return { status: "issued" as const, invoice: toJsonValue(invoice), replayed: true }
  }
  if (authorization.status !== "authorized") {
    throw financeInvoiceIssueAuthorizationError(authorization)
  }

  const approved = buildActionLedgerApprovedExecutionFields(authorization.approvedAction)
  const outcome = await issueInvoiceFromBookingCommand(
    input.db,
    input.command,
    {
      ...getFinanceRouteRuntime(input.c),
      actionLedgerContext: requestContext,
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
    },
    {
      expectedBookingUpdatedAt: input.expectedBookingUpdatedAt,
      expectedSnapshotFingerprint: input.expectedSnapshotFingerprint,
    },
  )
  if (outcome.status === "booking_changed" || outcome.status === "approval_snapshot_changed") {
    throw new ToolError(
      `Booking ${outcome.bookingNumber} changed after it was reviewed. Read it once more and ask for approval again; no proforma was created.`,
      "INVALID_INPUT",
      { reason: "booking_changed", outcome },
    )
  }
  if (outcome.status !== "issued") {
    const subject = outcome.status === "booking_not_found" ? "Booking" : "Booking payment schedule"
    throw new ToolError(`${subject} was not found.`, "NOT_FOUND", { outcome })
  }
  return {
    status: "issued" as const,
    invoice: toJsonValue(outcome.invoice),
    replayed: false,
  }
}

function financeRefundAuthorizationError(
  result: Exclude<
    Awaited<ReturnType<typeof authorizeFinanceRefund>>,
    { status: "authorized" | "approval_required" | "already_executed" }
  >,
) {
  switch (result.status) {
    case "denied":
      return new ToolError("Invoice refund is not authorized.", "AUTHORIZATION_DENIED", {
        reason: result.access.reason,
      })
    case "missing_idempotency_key":
      return new ToolError("Invoice refund requires an idempotency key.", "INVALID_INPUT")
    case "idempotency_conflict":
      return new ToolError(result.message, "INVALID_INPUT", {
        existingActionId: result.existingActionId,
      })
    case "invalid_approval":
      return new ToolError(
        "The approval does not authorize this exact invoice credit-note refund.",
        "INVALID_INPUT",
        {
          reason: result.validation.reason,
          approvalId: result.validation.approval?.id,
        },
      )
  }
}

function pendingApprovalResult(input: {
  requestedAction: {
    id: string
    status: string
    actionName: string
    targetType: string
    targetId: string
  }
  approval: {
    id: string
    status: string
    requestedActionId: string
    policyName: string
    policyVersion: string
    riskSnapshot: string
    reasonCode: string | null
    expiresAt: Date | string | null
    createdAt: Date | string
  }
  replayed: boolean
}) {
  return {
    status: "approval_required" as const,
    requestedAction: {
      id: input.requestedAction.id,
      status: input.requestedAction.status,
      actionName: input.requestedAction.actionName,
      targetType: input.requestedAction.targetType,
      targetId: input.requestedAction.targetId,
    },
    approval: {
      id: input.approval.id,
      status: input.approval.status,
      requestedActionId: input.approval.requestedActionId,
      policyName: input.approval.policyName,
      policyVersion: input.approval.policyVersion,
      riskSnapshot: input.approval.riskSnapshot,
      reasonCode: input.approval.reasonCode ?? "approval_required",
      expiresAt: toIsoString(input.approval.expiresAt),
      createdAt: toIsoString(input.approval.createdAt),
    },
    replayed: input.replayed,
  }
}

function financeInvoiceIssueAuthorizationError(
  result: Exclude<
    Awaited<ReturnType<typeof authorizeFinanceInvoiceIssue>>,
    { status: "authorized" | "approval_required" | "already_executed" }
  >,
) {
  switch (result.status) {
    case "denied":
      return new ToolError("Invoice issue is not authorized.", "AUTHORIZATION_DENIED", {
        reason: result.access.reason,
      })
    case "missing_idempotency_key":
      return new ToolError("Invoice issue requires an idempotency key.", "INVALID_INPUT")
    case "idempotency_conflict":
      return new ToolError(result.message, "INVALID_INPUT", {
        existingActionId: result.existingActionId,
      })
    case "invalid_approval":
      return new ToolError(
        "The approval does not authorize this exact invoice issue command.",
        "INVALID_INPUT",
        { reason: result.validation.reason, approvalId: result.validation.approval?.id },
      )
  }
}

function toIsoString(value: Date | string | null): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}
