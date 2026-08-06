import { buildActionLedgerApprovedExecutionFields } from "@voyant-travel/action-ledger"
import {
  defineToolContextContribution,
  deriveCommandIdempotencyKey,
  ToolError,
} from "@voyant-travel/tools"
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
  authorizeFinanceRefundSettlement,
  FINANCE_REFUND_ACTION_NAME,
  FINANCE_REFUND_CAPABILITY,
  FINANCE_REFUND_ROUTE_OR_TOOL_NAME,
  type FinanceRefundSettlementAuthorizationResult,
} from "./refund-authorization.js"
import { getFinanceRouteRuntime } from "./routes-runtime.js"
import type { Env } from "./routes-shared.js"
import { type CreateInvoiceFromBookingInput, financeService } from "./service.js"
import {
  buildUnsyncedProformaApprovalSnapshot,
  issueInvoiceFromBookingCommand,
} from "./service-issue.js"
import type { InvoiceNumberAllocationErrorCode } from "./service-shared.js"
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
          idempotencyKey?: string
          approvalId?: string
        }) {
          // Derived from the command CONTENT, not invented by the caller, and for
          // the same reason as every other create (voyant#3921 Finding 2): the key
          // has to be identical on the call that REQUESTS approval and the call
          // that executes it, so making the caller carry it across two round trips
          // — through a human approval in the middle — is the least reliable way
          // to satisfy a requirement the server can satisfy itself. A hash of the
          // command gives exactly the property the ledger wants: the retry that
          // follows an approval derives the same key and replays, while a
          // genuinely different invoice derives a different one.
          return executeInvoiceIssueTool({
            db,
            c,
            ...input,
            idempotencyKey:
              input.idempotencyKey ??
              (await deriveCommandIdempotencyKey("issue-invoice-from-booking", input.command)),
          })
        },
        async recordPaymentDispute(
          input: Parameters<typeof financeService.paymentDisputes.recordPaymentDispute>[1],
        ) {
          const dispute = await financeService.paymentDisputes.recordPaymentDispute(
            db as PostgresJsDatabase,
            input,
            {
              ...getFinanceRouteRuntime(c),
              actionLedgerContext: financeToolActionLedgerContext(c),
              actionLedgerAuthorizationSource: "finance.payment_dispute.tool",
            },
          )
          if (!dispute) {
            throw new ToolError("Payment session was not found.", "NOT_FOUND", {
              paymentSessionId: input.paymentSessionId,
            })
          }
          return toJsonValue(dispute)
        },
        /**
         * The money leg (voyant#4303). Same capability as `issueInvoiceRefund`,
         * same approve-then-retry shape, and the method need not be a card.
         */
        async recordRefundSettlement(input: {
          creditNoteId?: string | null
          paymentId?: string | null
          idempotencyKey: string
          approvalId?: string
        }) {
          const { idempotencyKey, approvalId, ...settlement } = input
          const targetId = settlement.creditNoteId ?? settlement.paymentId
          if (!targetId) {
            throw new ToolError(
              "A refund settlement must reverse a credit note, a payment, or both.",
              "INVALID_INPUT",
            )
          }
          const requestContext = financeToolActionLedgerContext(c)
          const authorization = await authorizeFinanceRefundSettlement({
            db: db as PostgresJsDatabase,
            targetType: settlement.creditNoteId ? "credit_note" : "payment",
            targetId,
            commandInput: settlement,
            actor: c.get("actor"),
            callerType: c.get("callerType"),
            scopes: c.get("scopes"),
            isInternalRequest: c.get("isInternalRequest"),
            requestContext,
            approvalId: approvalId ?? null,
            idempotencyKey,
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
              nextSteps: [
                `1. Call approve_action_approval with approvalId "${authorization.approval.id}". The approval exists but is PENDING; re-calling record_refund_settlement before this step returns this same response.`,
                `2. Call record_refund_settlement again with the identical input plus approvalId "${authorization.approval.id}". An altered command no longer matches what was approved.`,
              ],
            }
          }
          if (authorization.status === "already_executed") {
            const existing = await financeService.refundSettlements.getRefundSettlementById(
              db as PostgresJsDatabase,
              authorization.refundSettlementId,
            )
            if (!existing) {
              throw new ToolError(
                "The previously recorded refund settlement was not found.",
                "NOT_FOUND",
                { refundSettlementId: authorization.refundSettlementId },
              )
            }
            return {
              status: "recorded" as const,
              refundSettlement: toJsonValue(existing),
              replayed: true,
            }
          }
          if (authorization.status !== "authorized") {
            throw financeRefundSettlementAuthorizationError(authorization)
          }

          // An agent always carries an approval here — `needsApproval` returns
          // true for `callerType === "agent"` — but the field is optional on
          // the shared result, so read it defensively rather than asserting.
          const approved = authorization.approvedAction
            ? buildActionLedgerApprovedExecutionFields(authorization.approvedAction)
            : null
          const row = await financeService.refundSettlements.recordRefundSettlement(
            db as PostgresJsDatabase,
            {
              ...(settlement as Parameters<
                typeof financeService.refundSettlements.recordRefundSettlement
              >[1]),
              idempotencyKey,
              approvalId: approved?.approvalId ?? null,
              requestedActionId: authorization.approvedAction?.requestedActionId ?? null,
            },
            {
              ...getFinanceRouteRuntime(c),
              actionLedgerContext: requestContext,
              actionLedgerAuthorizationSource: authorization.access.authorizationSource,
              actionLedgerCapabilityId: authorization.access.capabilityId,
              actionLedgerCapabilityVersion: authorization.access.capabilityVersion,
              actionLedgerCausationActionId: approved?.causationActionId ?? null,
              actionLedgerApprovalId: approved?.approvalId ?? null,
              actionLedgerIdempotencyScope: authorization.execution.idempotencyScope,
              actionLedgerIdempotencyKey: authorization.execution.idempotencyKey,
              actionLedgerIdempotencyFingerprint: authorization.execution.idempotencyFingerprint,
            },
          )
          if (!row) {
            throw new ToolError(
              "The credit note, payment or payment session being refunded was not found.",
              "NOT_FOUND",
              { creditNoteId: settlement.creditNoteId, paymentId: settlement.paymentId },
            )
          }
          return {
            status: "recorded" as const,
            refundSettlement: toJsonValue(row),
            replayed: false,
          }
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
              // Same shape and same reason as issue_invoice_from_booking below:
              // the approval is created by THIS call, so the caller needs the
              // approve-then-retry pair, not the generic three steps that begin
              // by requesting another approval.
              nextSteps: [
                `1. Call approve_action_approval with approvalId "${authorization.approval.id}". The approval exists but is PENDING; re-calling issue_invoice_refund before this step returns this same response.`,
                `2. Call issue_invoice_refund again with the identical input plus approvalId "${authorization.approval.id}". An altered command no longer matches what was approved.`,
              ],
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

          // Unreachable: `finance:refund` is `approvalPolicy: "required"`, so
          // the accounting leg never authorizes without an approval. Narrowing
          // it here rather than asserting keeps that fact checked instead of
          // assumed, should the policy ever be relaxed.
          if (!authorization.approvedAction) {
            throw new ToolError(
              "Invoice refund was authorized without an approval.",
              "INVALID_INPUT",
            )
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
  const outcome = await withInvoiceNumberingRemediation(() =>
    issueInvoiceFromBookingCommand(
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
    ),
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

function financeRefundSettlementAuthorizationError(
  result: Exclude<
    FinanceRefundSettlementAuthorizationResult,
    { status: "authorized" | "approval_required" | "already_executed" }
  >,
) {
  switch (result.status) {
    case "denied":
      return new ToolError("Refund settlement is not authorized.", "AUTHORIZATION_DENIED", {
        reason: result.access.reason,
      })
    case "missing_idempotency_key":
      return new ToolError("Refund settlement requires an idempotency key.", "INVALID_INPUT")
    case "idempotency_conflict":
      return new ToolError(result.message, "INVALID_INPUT", {
        existingActionId: result.existingActionId,
      })
    default:
      return new ToolError(
        "The approval does not authorize this exact refund settlement.",
        "INVALID_INPUT",
        { reason: result.validation.reason },
      )
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

/**
 * Remediation for the four ways invoice numbering can refuse.
 *
 * `InvoiceNumberAllocationError` calls `super(code)`, so its message IS the bare
 * enum, and it is not a ToolError — the registry's unknown-throw wrapper turned
 * the whole thing into
 *
 *   [PROVIDER_ERROR] Tool "issue_invoice_from_booking" failed: no_active_series_for_scope
 *
 * Terminal, blameless, and unactionable. Measured: this is what a real agent got
 * on the first run that reached invoice issue at all.
 *
 * The sentences below are not invented here — they are the ones the operator UI
 * already shows for these exact codes (`bookings-react/src/i18n/en-operations.ts`).
 * The product had the remediation the whole time and only the human surface could
 * see it. The paths differ because an agent has tools, not a settings screen.
 */
// Typed on the domain's own union rather than `string`, so a fifth refusal code
// fails the BUILD until someone writes what to do about it. A test could only
// check the codes that exist today.
const INVOICE_NUMBERING_REMEDIATION: Record<InvoiceNumberAllocationErrorCode, string> = {
  no_active_series_for_scope:
    "No active number series exists for this document type. Create one with create_invoice_number_series for this scope, or activate an existing one, then retry.",
  invoice_number_series_not_found:
    "The requested number series id does not exist. List the series and pass a valid id, or omit seriesId to use the default for the scope.",
  invoice_number_series_inactive:
    "The selected number series exists but is inactive. Activate it, or choose an active series, then retry.",
  invoice_number_series_scope_mismatch:
    "The selected number series belongs to a different document type. Choose a series whose scope matches this document, then retry.",
}

function isInvoiceNumberAllocationError(
  error: unknown,
): error is { code: InvoiceNumberAllocationErrorCode; scope?: string; seriesId?: string } {
  // Structural, not `instanceof`: a duplicate install would otherwise silently
  // fall back to the opaque PROVIDER_ERROR this exists to remove.
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    (error as { code: string }).code in INVOICE_NUMBERING_REMEDIATION
  )
}

async function withInvoiceNumberingRemediation<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (!isInvoiceNumberAllocationError(error)) throw error
    const fix = INVOICE_NUMBERING_REMEDIATION[error.code]
    // INVALID_INPUT, not PROVIDER_ERROR: numbering configuration is something the
    // caller can put right, and no invoice was issued.
    throw new ToolError(
      `The invoice number could not be allocated: ${fix}`,
      "INVALID_INPUT",
      { reason: error.code, scope: error.scope, seriesId: error.seriesId },
      { cause: error },
      { nextSteps: [fix] },
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
    // An approval id and a status are DATA; they do not tell a caller what to do
    // with them. Measured against the real surface, this response is where
    // invoice issue stalls: the agent receives `approval_required`, has already
    // had its approval created for it by the call above, and then either calls
    // request_action_approval a second time or re-calls this tool unchanged and
    // gets the identical response forever. Both failures are the response's
    // fault, not the model's.
    //
    // This is the same defect the APPROVAL_REQUIRED error carries next steps for
    // (voyant#3950) — but that treatment only ever reached the ERROR path, and
    // `approval_required` is a success payload, so it was never covered. Note the
    // steps are TWO, not the error's three: the request step has already
    // happened here, and telling the caller to repeat it is what caused the loop.
    nextSteps: [
      `1. Call approve_action_approval with approvalId "${input.approval.id}". The approval exists but is PENDING until it is decided; re-calling issue_invoice_from_booking before this step returns this same response.`,
      `2. Call issue_invoice_from_booking again with the identical command plus approvalId "${input.approval.id}". Do not change the command — an altered command no longer matches what was approved.`,
    ],
    replayed: input.replayed,
  }
}

/**
 * Say WHY an approval does not authorize this command (voyant#3921).
 *
 * Fourteen distinct validation reasons — a stale fingerprint, a mismatched
 * idempotency key, an expired approval, the wrong capability — all returned the
 * same sentence: "The approval does not authorize this exact invoice issue
 * command." The reason travelled in `meta`, where a model does not look, and the
 * message named none of it.
 *
 * NOT a claimed fix for invoice issuing. That journey scores 0/N against the real
 * graph, and across measured runs `invalid_approval` never once fired — its
 * actual blockers are CONFIRMATION_REQUIRED and AUTHORIZATION_DENIED, which are
 * unrelated to this path and still open. This stands on its own smaller merit:
 * an error that names one of fourteen causes is better than an error that names
 * none, whether or not it is today's blocker.
 */
function invalidApprovalMessage(reason: string): string {
  switch (reason) {
    case "fingerprint_mismatch":
      return "The approval was granted against a different version of this invoice. The booking or its amounts changed after the approval was requested. Call preview_unsynced_proforma_from_booking again, request a NEW approval for the fresh snapshot, approve that, then retry."
    case "missing_fingerprint":
      return "This approval carries no command fingerprint, so it cannot authorize a specific invoice. Request approval through request_action_approval for the exact issue command rather than approving a bare action."
    case "idempotency_key_mismatch":
      return "The approval was granted for a command with a different idempotency key. Retry with the SAME idempotencyKey the approval was requested with, or request a new approval for the key you are using now."
    case "capability_mismatch":
    case "mismatched_action":
      return "This approval authorizes a different Tool action. Request approval specifically for issue_unsynced_proforma_from_booking, then retry with that approval id."
    case "expired":
      return "The approval expired before it was used. Request a fresh approval, approve it, and retry promptly."
    case "already_executed":
      return "This approval has already been used to issue an invoice; approvals are single-use. Read the existing invoice rather than issuing a second one."
    case "actor_missing":
    case "actor_not_allowed":
    case "assignee_mismatch":
      return "This approval is not usable by the current actor — it is assigned to someone else, or this actor type may not spend it. Have the assigned staff principal approve, or request one for this actor."
    default:
      return `The approval does not authorize this exact invoice issue command (${reason}). Request a fresh approval for this exact command, approve it, then retry unchanged.`
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
      return new ToolError(invalidApprovalMessage(result.validation.reason), "INVALID_INPUT", {
        reason: result.validation.reason,
        approvalId: result.validation.approval?.id,
      })
  }
}

function toIsoString(value: Date | string | null): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}
