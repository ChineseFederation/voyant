// agent-quality: file-size exception -- owner: finance; existing service module stays co-located until a dedicated split preserves behavior and tests.
import {
  type ActionLedgerRequestContextValues,
  type BuildActionLedgerMutationInput,
  buildIdempotencyFingerprint,
} from "@voyant-travel/action-ledger"
import type { z } from "zod"

import type {
  creditNoteLineItems,
  creditNotes,
  invoiceLineItems,
  invoices,
  payments,
} from "./schema.js"
import type {
  updateCreditNoteSchema,
  updateInvoiceLineItemSchema,
  updateInvoiceSchema,
  updatePaymentSchema,
} from "./validation.js"

type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>
type UpdateInvoiceLineItemInput = z.infer<typeof updateInvoiceLineItemSchema>
type UpdateCreditNoteInput = z.infer<typeof updateCreditNoteSchema>
type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>

type InvoiceRecord = typeof invoices.$inferSelect
type PaymentRecord = typeof payments.$inferSelect
type CreditNoteRecord = typeof creditNotes.$inferSelect
type InvoiceLineItemRecord = typeof invoiceLineItems.$inferSelect
type CreditNoteLineItemRecord = typeof creditNoteLineItems.$inferSelect

type RecordPaymentLedgerInput = {
  invoice: InvoiceRecord
  payment: PaymentRecord
}
type RecordPaymentCommandInput = Pick<
  PaymentRecord,
  | "amountCents"
  | "currency"
  | "baseCurrency"
  | "baseAmountCents"
  | "fxRateSetId"
  | "paymentMethod"
  | "paymentInstrumentId"
  | "paymentAuthorizationId"
  | "paymentCaptureId"
  | "status"
  | "referenceNumber"
  | "paymentDate"
>
type PaymentUpdateLedgerInput = {
  invoice: InvoiceRecord
  payment: PaymentRecord
  changes: UpdatePaymentInput
}
type PaymentDeleteLedgerInput = {
  invoice: InvoiceRecord
  payment: PaymentRecord
}
type InvoiceIssuedLedgerInput = {
  invoice: InvoiceRecord
}
type InvoiceUpdateLedgerInput = {
  invoice: InvoiceRecord
  changes: UpdateInvoiceInput
}
type InvoiceDeleteLedgerInput = {
  invoice: InvoiceRecord
}
type InvoiceLineItemMutationLedgerInput = {
  invoice: InvoiceRecord
  lineItem: InvoiceLineItemRecord
  changes?: UpdateInvoiceLineItemInput
}
type CreateCreditNoteLedgerInput = {
  invoice: InvoiceRecord
  creditNote: CreditNoteRecord
}
type CreditNoteUpdateLedgerInput = {
  invoice: InvoiceRecord
  creditNote: CreditNoteRecord
  changes: UpdateCreditNoteInput
}
type CreditNoteLineItemCreateLedgerInput = {
  invoice: InvoiceRecord
  creditNote: CreditNoteRecord
  lineItem: CreditNoteLineItemRecord
}

export async function buildRecordPaymentActionLedgerInput(
  context: ActionLedgerRequestContextValues,
  input: RecordPaymentLedgerInput,
  options: {
    authorizationSource?: string | null
    idempotencyKey?: string | null
  } = {},
): Promise<BuildActionLedgerMutationInput> {
  const target = getInvoiceLedgerTarget(input.invoice)
  const idempotency = await buildRecordPaymentIdempotency(input.invoice, input.payment, {
    requestedKey: options.idempotencyKey,
    targetType: target.type,
    targetId: target.id,
  })

  return {
    context,
    actionName: "finance.payment.record",
    actionVersion: "v1",
    actionKind: "create",
    status: "succeeded",
    evaluatedRisk: "high",
    targetType: target.type,
    targetId: target.id,
    routeOrToolName: "finance.payment.record",
    authorizationSource: options.authorizationSource ?? "finance.payment.route",
    idempotencyScope: idempotency.scope,
    idempotencyKey: idempotency.key,
    idempotencyFingerprint: idempotency.fingerprint,
    mutationDetail: {
      commandInputRef: `invoice:${input.invoice.id}:payment`,
      commandResultRef: `payment:${input.payment.id}`,
      summary: `Payment ${input.payment.id} recorded for invoice ${input.invoice.id}`,
      reversalKind: "none",
    },
  }
}

export async function buildRecordPaymentIdempotency(
  invoice: InvoiceRecord,
  payment: RecordPaymentCommandInput,
  options: {
    requestedKey?: string | null
    targetType?: string
    targetId?: string
  } = {},
): Promise<{
  scope: string
  key: string
  fingerprint: string
}> {
  const target = getInvoiceLedgerTarget(invoice)
  const targetType = options.targetType ?? target.type
  const targetId = options.targetId ?? target.id
  const naturalCommandInput = {
    invoiceId: invoice.id,
    amountCents: payment.amountCents,
    currency: payment.currency,
    baseCurrency: payment.baseCurrency ?? null,
    baseAmountCents: payment.baseAmountCents ?? null,
    fxRateSetId: payment.fxRateSetId ?? null,
    paymentMethod: payment.paymentMethod,
    paymentInstrumentId: normalizeLedgerIdempotencyString(payment.paymentInstrumentId),
    paymentAuthorizationId: normalizeLedgerIdempotencyString(payment.paymentAuthorizationId),
    paymentCaptureId: normalizeLedgerIdempotencyString(payment.paymentCaptureId),
    status: payment.status,
    referenceNumber: normalizeLedgerIdempotencyString(payment.referenceNumber),
    paymentDate: payment.paymentDate,
  }
  const requestedKey = normalizeLedgerIdempotencyString(options.requestedKey)
  const naturalKey =
    normalizeLedgerIdempotencyString(payment.referenceNumber) ??
    normalizeLedgerIdempotencyString(payment.paymentCaptureId) ??
    normalizeLedgerIdempotencyString(payment.paymentAuthorizationId) ??
    (await buildIdempotencyFingerprint({
      actionName: "finance.payment.record",
      actionVersion: "v1",
      targetType,
      targetId,
      commandInput: naturalCommandInput,
    }))

  return {
    scope: `finance.invoice:${invoice.id}:payment`,
    key: requestedKey ?? naturalKey,
    fingerprint: await buildIdempotencyFingerprint({
      actionName: "finance.payment.record",
      actionVersion: "v1",
      targetType,
      targetId,
      commandInput: naturalCommandInput,
    }),
  }
}

function normalizeLedgerIdempotencyString(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function buildPaymentUpdateActionLedgerInput(
  context: ActionLedgerRequestContextValues,
  input: PaymentUpdateLedgerInput,
  options: {
    authorizationSource?: string | null
  } = {},
): BuildActionLedgerMutationInput {
  const target = getInvoiceLedgerTarget(input.invoice)
  const changedFields = Object.keys(input.changes).sort()
  const changeSummary = changedFields.length > 0 ? changedFields.join(", ") : "no fields"

  return {
    context,
    actionName: "finance.payment.update",
    actionVersion: "v1",
    actionKind: "update",
    status: "succeeded",
    evaluatedRisk: "high",
    targetType: target.type,
    targetId: target.id,
    routeOrToolName: "finance.payment.update",
    authorizationSource: options.authorizationSource ?? "finance.payment.route",
    idempotencyScope: null,
    idempotencyKey: null,
    idempotencyFingerprint: null,
    mutationDetail: {
      commandInputRef: `payment:${input.payment.id}:update`,
      commandResultRef: `payment:${input.payment.id}`,
      summary: `Payment ${input.payment.id} updated (${changeSummary})`,
      reversalKind: "none",
    },
  }
}

export function buildPaymentDeleteActionLedgerInput(
  context: ActionLedgerRequestContextValues,
  input: PaymentDeleteLedgerInput,
  options: {
    authorizationSource?: string | null
  } = {},
): BuildActionLedgerMutationInput {
  const target = getInvoiceLedgerTarget(input.invoice)

  return {
    context,
    actionName: "finance.payment.delete",
    actionVersion: "v1",
    actionKind: "delete",
    status: "succeeded",
    evaluatedRisk: "high",
    targetType: target.type,
    targetId: target.id,
    routeOrToolName: "finance.payment.delete",
    authorizationSource: options.authorizationSource ?? "finance.payment.route",
    idempotencyScope: null,
    idempotencyKey: null,
    idempotencyFingerprint: null,
    mutationDetail: {
      commandInputRef: `payment:${input.payment.id}:delete`,
      commandResultRef: null,
      summary: `Payment ${input.payment.id} deleted from invoice ${input.invoice.invoiceNumber}`,
      reversalKind: "none",
    },
  }
}

function getInvoiceLedgerTarget(invoice: InvoiceRecord) {
  if (invoice.bookingId) return { type: "booking", id: invoice.bookingId }
  return { type: "invoice", id: invoice.id }
}

export async function buildInvoiceIssuedActionLedgerInput(
  context: ActionLedgerRequestContextValues,
  input: InvoiceIssuedLedgerInput,
  options: {
    authorizationSource?: string | null
    actionName?: string | null
    routeOrToolName?: string | null
    capabilityId?: string | null
    capabilityVersion?: string | null
    evaluatedRisk?: "low" | "medium" | "high" | "critical" | null
    causationActionId?: string | null
    approvalId?: string | null
    idempotencyScope?: string | null
    idempotencyKey?: string | null
    idempotencyFingerprint?: string | null
  } = {},
): Promise<BuildActionLedgerMutationInput> {
  const target = getInvoiceLedgerTarget(input.invoice)
  const invoiceTypeLabel = input.invoice.invoiceType === "proforma" ? "Proforma" : "Invoice"
  const actionName = options.actionName ?? "finance.invoice.issue_from_booking"

  return {
    context,
    actionName,
    actionVersion: "v1",
    actionKind: "create",
    status: "succeeded",
    evaluatedRisk: options.evaluatedRisk ?? "high",
    targetType: target.type,
    targetId: target.id,
    routeOrToolName: options.routeOrToolName ?? "finance.invoice.issue_from_booking",
    capabilityId: options.capabilityId,
    capabilityVersion: options.capabilityVersion,
    authorizationSource: options.authorizationSource ?? "finance.invoice.from_booking.route",
    causationActionId: options.causationActionId,
    approvalId: options.approvalId,
    idempotencyScope:
      options.idempotencyScope ?? `finance.booking:${input.invoice.bookingId}:invoice_issue`,
    // Keyed by (type, number), matching `invoices_invoice_number_type_active_idx`
    // — the database deliberately lets a proforma and a fiscal invoice carry
    // the same external number. Keying on the number alone made the second of
    // the pair collide with the first inside one booking's issue scope, and the
    // reused key surfaced as a failed issuance for a document the schema
    // permits.
    idempotencyKey:
      options.idempotencyKey ?? `${input.invoice.invoiceType}:${input.invoice.invoiceNumber}`,
    idempotencyFingerprint:
      options.idempotencyFingerprint ??
      (await buildIdempotencyFingerprint({
        actionName,
        actionVersion: "v1",
        targetType: target.type,
        targetId: target.id,
        commandInput: {
          invoiceId: input.invoice.id,
          invoiceNumber: input.invoice.invoiceNumber,
          invoiceType: input.invoice.invoiceType,
          bookingId: input.invoice.bookingId,
          totalCents: input.invoice.totalCents,
          currency: input.invoice.currency,
          status: input.invoice.status,
          issueDate: input.invoice.issueDate,
          dueDate: input.invoice.dueDate,
        },
      })),
    mutationDetail: {
      commandInputRef: `booking:${input.invoice.bookingId}:invoice_issue`,
      commandResultRef: `invoice:${input.invoice.id}`,
      summary: `${invoiceTypeLabel} ${input.invoice.invoiceNumber} issued for booking ${input.invoice.bookingId}`,
      reversalKind: "none",
    },
  }
}

export function buildInvoiceUpdateActionLedgerInput(
  context: ActionLedgerRequestContextValues,
  input: InvoiceUpdateLedgerInput,
  options: {
    authorizationSource?: string | null
  } = {},
): BuildActionLedgerMutationInput {
  const target = getInvoiceLedgerTarget(input.invoice)
  const changedFields = Object.keys(input.changes).sort()
  const changeSummary = changedFields.length > 0 ? changedFields.join(", ") : "no fields"

  return {
    context,
    actionName: "finance.invoice.update",
    actionVersion: "v1",
    actionKind: "update",
    status: "succeeded",
    evaluatedRisk: "high",
    targetType: target.type,
    targetId: target.id,
    routeOrToolName: "finance.invoice.update",
    authorizationSource: options.authorizationSource ?? "finance.invoice.route",
    idempotencyScope: null,
    idempotencyKey: null,
    idempotencyFingerprint: null,
    mutationDetail: {
      commandInputRef: `invoice:${input.invoice.id}:update`,
      commandResultRef: `invoice:${input.invoice.id}`,
      summary: `Invoice ${input.invoice.invoiceNumber} updated (${changeSummary})`,
      reversalKind: "none",
    },
  }
}

export function buildInvoiceDeleteActionLedgerInput(
  context: ActionLedgerRequestContextValues,
  input: InvoiceDeleteLedgerInput,
  options: {
    authorizationSource?: string | null
  } = {},
): BuildActionLedgerMutationInput {
  const target = getInvoiceLedgerTarget(input.invoice)

  return {
    context,
    actionName: "finance.invoice.delete",
    actionVersion: "v1",
    actionKind: "delete",
    status: "succeeded",
    evaluatedRisk: "high",
    targetType: target.type,
    targetId: target.id,
    routeOrToolName: "finance.invoice.delete",
    authorizationSource: options.authorizationSource ?? "finance.invoice.route",
    idempotencyScope: null,
    idempotencyKey: null,
    idempotencyFingerprint: null,
    mutationDetail: {
      commandInputRef: `invoice:${input.invoice.id}:delete`,
      commandResultRef: null,
      summary: `Draft invoice ${input.invoice.invoiceNumber} deleted`,
      reversalKind: "none",
    },
  }
}

export function buildInvoiceLineItemCreateActionLedgerInput(
  context: ActionLedgerRequestContextValues,
  input: InvoiceLineItemMutationLedgerInput,
  options: {
    authorizationSource?: string | null
  } = {},
): BuildActionLedgerMutationInput {
  const target = getInvoiceLedgerTarget(input.invoice)

  return {
    context,
    actionName: "finance.invoice_line_item.create",
    actionVersion: "v1",
    actionKind: "create",
    status: "succeeded",
    evaluatedRisk: "high",
    targetType: target.type,
    targetId: target.id,
    routeOrToolName: "finance.invoice_line_item.create",
    authorizationSource: options.authorizationSource ?? "finance.invoice_line_item.route",
    idempotencyScope: null,
    idempotencyKey: null,
    idempotencyFingerprint: null,
    mutationDetail: {
      commandInputRef: `invoice:${input.invoice.id}:line_item`,
      commandResultRef: `invoice_line_item:${input.lineItem.id}`,
      summary: `Line item ${input.lineItem.id} added to invoice ${input.invoice.invoiceNumber}`,
      reversalKind: "none",
    },
  }
}

export function buildInvoiceLineItemUpdateActionLedgerInput(
  context: ActionLedgerRequestContextValues,
  input: InvoiceLineItemMutationLedgerInput,
  options: {
    authorizationSource?: string | null
  } = {},
): BuildActionLedgerMutationInput {
  const target = getInvoiceLedgerTarget(input.invoice)
  const changedFields = Object.keys(input.changes ?? {}).sort()
  const changeSummary = changedFields.length > 0 ? changedFields.join(", ") : "no fields"

  return {
    context,
    actionName: "finance.invoice_line_item.update",
    actionVersion: "v1",
    actionKind: "update",
    status: "succeeded",
    evaluatedRisk: "high",
    targetType: target.type,
    targetId: target.id,
    routeOrToolName: "finance.invoice_line_item.update",
    authorizationSource: options.authorizationSource ?? "finance.invoice_line_item.route",
    idempotencyScope: null,
    idempotencyKey: null,
    idempotencyFingerprint: null,
    mutationDetail: {
      commandInputRef: `invoice_line_item:${input.lineItem.id}:update`,
      commandResultRef: `invoice_line_item:${input.lineItem.id}`,
      summary: `Line item ${input.lineItem.id} updated (${changeSummary})`,
      reversalKind: "none",
    },
  }
}

export function buildInvoiceLineItemDeleteActionLedgerInput(
  context: ActionLedgerRequestContextValues,
  input: InvoiceLineItemMutationLedgerInput,
  options: {
    authorizationSource?: string | null
  } = {},
): BuildActionLedgerMutationInput {
  const target = getInvoiceLedgerTarget(input.invoice)

  return {
    context,
    actionName: "finance.invoice_line_item.delete",
    actionVersion: "v1",
    actionKind: "delete",
    status: "succeeded",
    evaluatedRisk: "high",
    targetType: target.type,
    targetId: target.id,
    routeOrToolName: "finance.invoice_line_item.delete",
    authorizationSource: options.authorizationSource ?? "finance.invoice_line_item.route",
    idempotencyScope: null,
    idempotencyKey: null,
    idempotencyFingerprint: null,
    mutationDetail: {
      commandInputRef: `invoice_line_item:${input.lineItem.id}:delete`,
      commandResultRef: null,
      summary: `Line item ${input.lineItem.id} deleted from invoice ${input.invoice.invoiceNumber}`,
      reversalKind: "none",
    },
  }
}

export async function buildCreditNoteCreationActionLedgerInput(
  context: ActionLedgerRequestContextValues,
  input: CreateCreditNoteLedgerInput,
  options: {
    authorizationSource?: string | null
    actionName?: string | null
    routeOrToolName?: string | null
    targetType?: string | null
    targetId?: string | null
    capabilityId?: string | null
    capabilityVersion?: string | null
    evaluatedRisk?: BuildActionLedgerMutationInput["evaluatedRisk"] | null
    causationActionId?: string | null
    approvalId?: string | null
    idempotencyScope?: string | null
    idempotencyKey?: string | null
    idempotencyFingerprint?: string | null
  } = {},
): Promise<BuildActionLedgerMutationInput> {
  const target = getInvoiceLedgerTarget(input.invoice)
  const targetType = options.targetType ?? target.type
  const targetId = options.targetId ?? target.id
  const actionName = options.actionName ?? "finance.credit_note.create"
  const idempotencyKey = options.idempotencyKey ?? input.creditNote.creditNoteNumber

  return {
    context,
    actionName,
    actionVersion: options.capabilityVersion ?? "v1",
    actionKind: "create",
    status: "succeeded",
    evaluatedRisk: options.evaluatedRisk ?? "high",
    targetType,
    targetId,
    routeOrToolName: options.routeOrToolName ?? "finance.credit_note.create",
    capabilityId: options.capabilityId ?? null,
    capabilityVersion: options.capabilityVersion ?? null,
    authorizationSource: options.authorizationSource ?? "finance.credit_note.route",
    causationActionId: options.causationActionId ?? null,
    approvalId: options.approvalId ?? null,
    idempotencyScope: options.idempotencyScope ?? `finance.invoice:${input.invoice.id}:credit_note`,
    idempotencyKey,
    idempotencyFingerprint:
      options.idempotencyFingerprint ??
      (await buildIdempotencyFingerprint({
        actionName,
        actionVersion: options.capabilityVersion ?? "v1",
        targetType,
        targetId,
        commandInput: {
          invoiceId: input.invoice.id,
          creditNoteId: input.creditNote.id,
          creditNoteNumber: input.creditNote.creditNoteNumber,
          amountCents: input.creditNote.amountCents,
          currency: input.creditNote.currency,
          status: input.creditNote.status,
          reason: input.creditNote.reason,
        },
      })),
    mutationDetail: {
      commandInputRef: `invoice:${input.invoice.id}:credit_note`,
      commandResultRef: `credit_note:${input.creditNote.id}`,
      summary: `Credit note ${input.creditNote.creditNoteNumber} created for invoice ${input.invoice.id}`,
      reversalKind: "none",
    },
  }
}

export function buildCreditNoteUpdateActionLedgerInput(
  context: ActionLedgerRequestContextValues,
  input: CreditNoteUpdateLedgerInput,
  options: {
    authorizationSource?: string | null
  } = {},
): BuildActionLedgerMutationInput {
  const target = getInvoiceLedgerTarget(input.invoice)
  const changedFields = Object.keys(input.changes).sort()
  const changeSummary = changedFields.length > 0 ? changedFields.join(", ") : "no fields"

  return {
    context,
    actionName: "finance.credit_note.update",
    actionVersion: "v1",
    actionKind: "update",
    status: "succeeded",
    evaluatedRisk: "high",
    targetType: target.type,
    targetId: target.id,
    routeOrToolName: "finance.credit_note.update",
    authorizationSource: options.authorizationSource ?? "finance.credit_note.route",
    idempotencyScope: null,
    idempotencyKey: null,
    idempotencyFingerprint: null,
    mutationDetail: {
      commandInputRef: `credit_note:${input.creditNote.id}:update`,
      commandResultRef: `credit_note:${input.creditNote.id}`,
      summary: `Credit note ${input.creditNote.creditNoteNumber} updated (${changeSummary})`,
      reversalKind: "none",
    },
  }
}

export function buildCreditNoteLineItemCreateActionLedgerInput(
  context: ActionLedgerRequestContextValues,
  input: CreditNoteLineItemCreateLedgerInput,
  options: {
    authorizationSource?: string | null
  } = {},
): BuildActionLedgerMutationInput {
  const target = getInvoiceLedgerTarget(input.invoice)

  return {
    context,
    actionName: "finance.credit_note_line_item.create",
    actionVersion: "v1",
    actionKind: "create",
    status: "succeeded",
    evaluatedRisk: "high",
    targetType: target.type,
    targetId: target.id,
    routeOrToolName: "finance.credit_note_line_item.create",
    authorizationSource: options.authorizationSource ?? "finance.credit_note_line_item.route",
    idempotencyScope: null,
    idempotencyKey: null,
    idempotencyFingerprint: null,
    mutationDetail: {
      commandInputRef: `credit_note:${input.creditNote.id}:line_item`,
      commandResultRef: `credit_note_line_item:${input.lineItem.id}`,
      summary: `Line item ${input.lineItem.id} added to credit note ${input.creditNote.creditNoteNumber}`,
      reversalKind: "none",
    },
  }
}
