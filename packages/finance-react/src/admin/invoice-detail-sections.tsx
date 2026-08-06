// agent-quality: file-size exception -- owner: finance-react; existing UI surface stays co-located until a dedicated split preserves behavior and tests.
"use client"

import {
  type OperatorAdminMessages,
  useLocale,
  useOperatorAdminMessages,
} from "@voyant-travel/admin"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@voyant-travel/ui/components"
import { Download, Pencil, Plus, Trash2 } from "lucide-react"
import { CreditNoteRefundStatus } from "../components/refund-settlements/credit-note-refund-status.js"
import { useInvoiceAttachments, useVoyantFinanceContext } from "../index.js"
import type { RefundSettlementRecord } from "../schemas.js"

import {
  type CreditNoteRow,
  creditNoteStatusVariant,
  type FinanceNote,
  formatAmount,
  formatMethod,
  type InvoiceDetail,
  type LineItem,
  type PaymentRow,
  paymentStatusVariant,
} from "./finance-shared.js"

function getPaymentStatusLabel(messages: OperatorAdminMessages, status: string): string {
  switch (status) {
    case "pending":
      return messages.finance.paymentStatusPending
    case "completed":
      return messages.finance.paymentStatusCompleted
    case "failed":
      return messages.finance.paymentStatusFailed
    case "refunded":
      return messages.finance.paymentStatusRefunded
    default:
      return status.replace(/_/g, " ")
  }
}

function getPaymentMethodLabel(messages: OperatorAdminMessages, method: string): string {
  switch (method) {
    case "bank_transfer":
      return messages.finance.paymentMethodBankTransfer
    case "credit_card":
      return messages.finance.paymentMethodCreditCard
    case "cash":
      return messages.finance.paymentMethodCash
    case "cheque":
      return messages.finance.paymentMethodCheque
    case "other":
      return messages.finance.paymentMethodOther
    default:
      return formatMethod(method)
  }
}

/**
 * Locale-aware date label. Date-only values (`YYYY-MM-DD`, e.g. issue/due
 * dates) are parsed as local time so they don't shift a day in negative-offset
 * timezones; full ISO timestamps (created/updated) parse as-is.
 */
function formatDateLabel(value: string | null | undefined, locale: string): string {
  if (!value) return "—"
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(parsed)
}

function getCreditNoteStatusLabel(messages: OperatorAdminMessages, status: string): string {
  switch (status) {
    case "draft":
      return messages.finance.creditNoteStatusDraft
    case "issued":
      return messages.finance.creditNoteStatusIssued
    case "applied":
      return messages.finance.creditNoteStatusApplied
    default:
      return status.replace(/_/g, " ")
  }
}

export function InvoiceInfoCards({
  invoice,
  onOpenBooking,
  onOpenPerson,
  onOpenOrganization,
  bookingLabel,
  personLabel,
  organizationLabel,
}: {
  invoice: InvoiceDetail
  onOpenBooking: () => void
  onOpenPerson?: (personId: string) => void
  onOpenOrganization?: (organizationId: string) => void
  bookingLabel?: string
  personLabel?: string
  organizationLabel?: string
}) {
  const messages = useOperatorAdminMessages()
  const { resolvedLocale } = useLocale()

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{messages.finance.detailSections.invoiceDetailsTitle}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">
              {messages.finance.detailSections.currencyLabel}:
            </span>{" "}
            <span>{invoice.currency}</span>
          </div>
          <div>
            <span className="text-muted-foreground">
              {messages.finance.detailSections.subtotalLabel}:
            </span>{" "}
            <span className="font-mono">
              {formatAmount(invoice.subtotalCents, invoice.currency)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">
              {messages.finance.detailSections.taxLabel}:
            </span>{" "}
            <span className="font-mono">{formatAmount(invoice.taxCents, invoice.currency)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">
              {messages.finance.detailSections.totalLabel}:
            </span>{" "}
            <span className="font-mono font-semibold">
              {formatAmount(invoice.totalCents, invoice.currency)}
            </span>
          </div>
          <div className="mt-2 border-t pt-3">
            <span className="text-muted-foreground">
              {messages.finance.detailSections.paidLabel}:
            </span>{" "}
            <span className="font-mono">{formatAmount(invoice.paidCents, invoice.currency)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">
              {messages.finance.detailSections.balanceDueLabel}:
            </span>{" "}
            <span className="font-mono font-semibold">
              {formatAmount(invoice.balanceDueCents, invoice.currency)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{messages.finance.detailSections.datesLinksTitle}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">
              {messages.finance.detailSections.issueDateLabel}:
            </span>{" "}
            <span>{formatDateLabel(invoice.issueDate, resolvedLocale)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">
              {messages.finance.detailSections.dueDateLabel}:
            </span>{" "}
            <span>{formatDateLabel(invoice.dueDate, resolvedLocale)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">
              {messages.finance.detailSections.bookingLabel}:
            </span>{" "}
            <button type="button" className="text-primary underline" onClick={onOpenBooking}>
              {bookingLabel ?? messages.finance.detailSections.viewBooking}
            </button>
          </div>
          {invoice.personId ? (
            <div>
              <span className="text-muted-foreground">
                {messages.finance.detailSections.personLabel}:
              </span>{" "}
              <button
                type="button"
                className="text-primary underline"
                onClick={() => onOpenPerson?.(invoice.personId as string)}
              >
                {personLabel ?? messages.finance.detailSections.viewPerson}
              </button>
            </div>
          ) : null}
          {invoice.organizationId ? (
            <div>
              <span className="text-muted-foreground">
                {messages.finance.detailSections.organizationLabel}:
              </span>{" "}
              <button
                type="button"
                className="text-primary underline"
                onClick={() => onOpenOrganization?.(invoice.organizationId as string)}
              >
                {organizationLabel ?? messages.finance.detailSections.viewOrganization}
              </button>
            </div>
          ) : null}
          <div className="mt-2 border-t pt-3">
            <div>
              <span className="text-muted-foreground">
                {messages.finance.detailSections.createdLabel}:
              </span>{" "}
              <span>{formatDateLabel(invoice.createdAt, resolvedLocale)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">
                {messages.finance.detailSections.updatedLabel}:
              </span>{" "}
              <span>{formatDateLabel(invoice.updatedAt, resolvedLocale)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function InvoiceLineItemsCard({
  lineItems,
  onCreate,
  onEdit,
  onDelete,
}: {
  lineItems: LineItem[]
  onCreate: () => void
  onEdit: (lineItem: LineItem) => void
  onDelete: (lineId: string) => void
}) {
  const messages = useOperatorAdminMessages()
  const noValue = messages.finance.detailSections.noValue

  return (
    <div className="space-y-4" data-slot="invoice-line-items">
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={onCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {messages.finance.detailSections.addLineItem}
        </Button>
      </div>
      {lineItems.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {messages.finance.detailSections.noLineItems}
        </p>
      ) : (
        <div className="overflow-x-auto rounded border bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="p-2 text-left font-medium">
                  {messages.finance.detailSections.descriptionColumn}
                </th>
                <th className="p-2 text-right font-medium">
                  {messages.finance.detailSections.quantityColumn}
                </th>
                <th className="p-2 text-right font-medium">
                  {messages.finance.detailSections.unitPriceColumn}
                </th>
                <th className="p-2 text-right font-medium">{messages.finance.totalColumn}</th>
                <th className="p-2 text-right font-medium">
                  {messages.finance.detailSections.taxRateColumn}
                </th>
                <th className="w-20 p-2" />
              </tr>
            </thead>
            <tbody>
              {lineItems.map((lineItem) => (
                <tr key={lineItem.id} className="border-b last:border-b-0">
                  <td className="p-2">{lineItem.description}</td>
                  <td className="p-2 text-right">{lineItem.quantity}</td>
                  <td className="p-2 text-right font-mono">
                    {(lineItem.unitPriceCents / 100).toFixed(2)}
                  </td>
                  <td className="p-2 text-right font-mono">
                    {(lineItem.totalCents / 100).toFixed(2)}
                  </td>
                  <td className="p-2 text-right">
                    {lineItem.taxRate != null ? `${(lineItem.taxRate / 100).toFixed(2)}%` : noValue}
                  </td>
                  <td className="p-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(lineItem)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(lineItem.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function InvoicePaymentsCard({
  payments,
  onCreate,
  canCreate = true,
}: {
  payments: PaymentRow[]
  onCreate: () => void
  canCreate?: boolean
}) {
  const messages = useOperatorAdminMessages()
  const noValue = messages.finance.detailSections.noValue

  return (
    <div className="space-y-4" data-slot="invoice-payments">
      {canCreate ? (
        <div className="flex items-center justify-end">
          <Button size="sm" onClick={onCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {messages.finance.detailSections.recordPayment}
          </Button>
        </div>
      ) : null}
      {payments.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {messages.finance.detailSections.noPayments}
        </p>
      ) : (
        <div className="overflow-x-auto rounded border bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="p-2 text-left font-medium">{messages.finance.dateColumn}</th>
                <th className="p-2 text-left font-medium">
                  {messages.finance.detailSections.methodColumn}
                </th>
                <th className="p-2 text-right font-medium">{messages.finance.amountColumn}</th>
                <th className="p-2 text-left font-medium">{messages.finance.statusColumn}</th>
                <th className="p-2 text-left font-medium">{messages.finance.referenceColumn}</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className="border-b last:border-b-0">
                  <td className="p-2">{payment.paymentDate}</td>
                  <td className="p-2 capitalize">
                    {getPaymentMethodLabel(messages, payment.paymentMethod)}
                  </td>
                  <td className="p-2 text-right font-mono">
                    <div>{formatAmount(payment.amountCents, payment.currency)}</div>
                    {payment.baseAmountCents !== null && payment.baseCurrency ? (
                      <div className="text-muted-foreground text-xs">
                        {formatAmount(payment.baseAmountCents, payment.baseCurrency)}
                      </div>
                    ) : null}
                  </td>
                  <td className="p-2">
                    <Badge
                      variant={paymentStatusVariant[payment.status] ?? "secondary"}
                      className="text-xs capitalize"
                    >
                      {getPaymentStatusLabel(messages, payment.status)}
                    </Badge>
                  </td>
                  <td className="p-2">{payment.referenceNumber ?? noValue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function InvoiceCreditNotesCard({
  creditNotes,
  onCreate,
  bookingId,
  refundSettlements = [],
  onRefundRecorded,
}: {
  creditNotes: CreditNoteRow[]
  onCreate: () => void
  /** Needed to record the money leg; absent means the column is read-only. */
  bookingId?: string | null
  /** Fetched once for the invoice; each row filters (voyant#4303). */
  refundSettlements?: readonly RefundSettlementRecord[]
  onRefundRecorded?: () => void
}) {
  const messages = useOperatorAdminMessages()

  return (
    <div className="space-y-4" data-slot="invoice-credit-notes">
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={onCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {messages.finance.detailSections.addCreditNote}
        </Button>
      </div>
      {creditNotes.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {messages.finance.detailSections.noCreditNotes}
        </p>
      ) : (
        <div className="overflow-x-auto rounded border bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="p-2 text-left font-medium">
                  {messages.finance.detailSections.creditNoteNumberColumn}
                </th>
                <th className="p-2 text-right font-medium">{messages.finance.amountColumn}</th>
                <th className="p-2 text-left font-medium">
                  {messages.finance.detailSections.reasonColumn}
                </th>
                <th className="p-2 text-left font-medium">{messages.finance.statusColumn}</th>
                {/*
                  An issued credit note reads identically whether or not the
                  customer got their money, so the document's own status cannot
                  answer "did we pay it?" — this column does (voyant#4303).
                */}
                <th className="p-2 text-left font-medium">
                  {messages.finance.detailSections.refundColumn}
                </th>
              </tr>
            </thead>
            <tbody>
              {creditNotes.map((creditNote) => (
                <tr key={creditNote.id} className="border-b last:border-b-0">
                  <td className="p-2">{creditNote.creditNoteNumber}</td>
                  <td className="p-2 text-right font-mono">
                    {formatAmount(creditNote.amountCents, creditNote.currency)}
                  </td>
                  <td className="p-2">{creditNote.reason}</td>
                  <td className="p-2">
                    <Badge
                      variant={creditNoteStatusVariant[creditNote.status] ?? "secondary"}
                      className="text-xs capitalize"
                    >
                      {getCreditNoteStatusLabel(messages, creditNote.status)}
                    </Badge>
                  </td>
                  <td className="p-2">
                    <CreditNoteRefundStatus
                      creditNoteId={creditNote.id}
                      bookingId={bookingId}
                      amountCents={creditNote.amountCents}
                      currency={creditNote.currency}
                      settlements={refundSettlements}
                      onRecorded={onRefundRecorded}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function InvoiceAttachmentsCard({ invoiceId }: { invoiceId: string }) {
  const messages = useOperatorAdminMessages().finance.detailSections
  const { resolvedLocale } = useLocale()
  const { data } = useInvoiceAttachments(invoiceId)
  const attachments = data?.data ?? []
  // Download links hit the admin API directly — base URL from the shared
  // finance provider context, not a host-app env helper.
  const { baseUrl } = useVoyantFinanceContext()

  return (
    <div className="space-y-4" data-slot="invoice-attachments">
      {attachments.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground text-sm">{messages.noAttachments}</p>
      ) : (
        <ul className="divide-y rounded border bg-background">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{attachment.name}</p>
                <p className="text-muted-foreground text-xs">
                  {formatAttachmentMeta(attachment, resolvedLocale)}
                </p>
              </div>
              <a
                href={`${baseUrl}/v1/admin/finance/invoice-attachments/${attachment.id}/download`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={messages.downloadAttachment}
              >
                <Download className="h-3.5 w-3.5" />
                {messages.downloadAttachment}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function formatAttachmentMeta(
  attachment: { fileSize?: number | null; mimeType?: string | null; createdAt?: string },
  locale: string,
): string {
  const parts: string[] = []
  if (attachment.mimeType) parts.push(attachment.mimeType)
  if (typeof attachment.fileSize === "number") parts.push(formatBytes(attachment.fileSize))
  if (attachment.createdAt) {
    try {
      parts.push(new Date(attachment.createdAt).toLocaleDateString(locale))
    } catch {
      // ignore — locale parse failures fall through silently
    }
  }
  return parts.join(" · ")
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function InvoiceNotesCard({
  notes,
  onAddNote,
}: {
  notes: FinanceNote[]
  onAddNote: () => void
}) {
  const messages = useOperatorAdminMessages()
  const { resolvedLocale } = useLocale()

  return (
    <div className="space-y-4" data-slot="invoice-notes">
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={onAddNote}>
          <Plus className="mr-2 h-4 w-4" />
          {messages.finance.detailSections.addNote}
        </Button>
      </div>
      {notes.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {messages.finance.detailSections.noNotes}
        </p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="rounded border p-3">
              <p className="whitespace-pre-wrap text-sm">{note.content}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {new Date(note.createdAt).toLocaleString(resolvedLocale)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
