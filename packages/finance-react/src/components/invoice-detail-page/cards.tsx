"use client"

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmActionButton,
} from "@voyant-travel/ui/components"
import { ExternalLink, FileText, Pencil, Plus } from "lucide-react"
import type { ReactNode } from "react"
import { useFinanceUiI18nOrDefault, useFinanceUiMessagesOrDefault } from "../../i18n/index.js"
import type {
  CreditNoteRecord,
  InvoiceAttachmentRecord,
  InvoiceRecord,
  LineItemRecord,
  PaymentRecord,
} from "../../index.js"
import {
  creditNoteStatusVariant,
  DetailLink,
  DetailRow,
  EmptyRow,
  formatBytes,
  formatPaymentMethod,
  InvoiceSection,
  invoiceStatusVariant,
  LoadingRow,
  Money,
  paymentStatusVariant,
} from "./primitives.js"

export interface InvoiceDetailCardProps {
  invoice: InvoiceRecord
  className?: string
}

export function InvoiceSummaryCard({ invoice, className }: InvoiceDetailCardProps) {
  const { formatCurrency } = useFinanceUiI18nOrDefault()
  const messages = useFinanceUiMessagesOrDefault()
  const detail = messages.invoiceDetailPage

  return (
    <Card data-slot="invoice-summary-card" className={className}>
      <CardHeader>
        <CardTitle>{detail.titles.summary}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm">
          <DetailRow label={detail.fields.currency}>{invoice.currency}</DetailRow>
          <DetailRow label={detail.fields.subtotal}>
            <Money cents={invoice.subtotalCents} currency={invoice.currency} />
          </DetailRow>
          <DetailRow label={detail.fields.tax}>
            <Money cents={invoice.taxCents} currency={invoice.currency} />
          </DetailRow>
          <DetailRow label={detail.fields.total}>
            <span className="font-semibold">
              {formatCurrency(invoice.totalCents / 100, invoice.currency)}
            </span>
          </DetailRow>
          <DetailRow label={detail.fields.paid}>
            <Money cents={invoice.paidCents} currency={invoice.currency} />
          </DetailRow>
          <DetailRow label={detail.fields.balanceDue}>
            <span className="font-semibold">
              {formatCurrency(invoice.balanceDueCents / 100, invoice.currency)}
            </span>
          </DetailRow>
          <DetailRow label={detail.fields.status}>
            <Badge variant={invoiceStatusVariant[invoice.status] ?? "secondary"}>
              {messages.common.invoiceStatusLabels[invoice.status]}
            </Badge>
          </DetailRow>
        </dl>
      </CardContent>
    </Card>
  )
}

export interface InvoiceLinksCardProps extends InvoiceDetailCardProps {
  onBookingOpen?: (bookingId: string, invoice: InvoiceRecord) => void
  onPersonOpen?: (personId: string, invoice: InvoiceRecord) => void
  onOrganizationOpen?: (organizationId: string, invoice: InvoiceRecord) => void
}

export function InvoiceLinksCard({
  invoice,
  className,
  onBookingOpen,
  onPersonOpen,
  onOrganizationOpen,
}: InvoiceLinksCardProps) {
  const { formatDate, formatDateTime } = useFinanceUiI18nOrDefault()
  const messages = useFinanceUiMessagesOrDefault()
  const detail = messages.invoiceDetailPage

  return (
    <Card data-slot="invoice-links-card" className={className}>
      <CardHeader>
        <CardTitle>{detail.titles.links}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm">
          <DetailRow label={detail.fields.issueDate}>{formatDate(invoice.issueDate)}</DetailRow>
          <DetailRow label={detail.fields.dueDate}>{formatDate(invoice.dueDate)}</DetailRow>
          <DetailRow label={detail.fields.booking}>
            <DetailLink
              label={detail.actions.viewBooking}
              actionLabel={detail.actions.viewBooking}
              onClick={() => onBookingOpen?.(invoice.bookingId, invoice)}
              disabled={!onBookingOpen}
            />
          </DetailRow>
          {invoice.personId ? (
            <DetailRow label={detail.fields.person}>
              <DetailLink
                label={detail.actions.viewPerson}
                actionLabel={detail.actions.viewPerson}
                onClick={() => onPersonOpen?.(invoice.personId as string, invoice)}
                disabled={!onPersonOpen}
              />
            </DetailRow>
          ) : null}
          {invoice.organizationId ? (
            <DetailRow label={detail.fields.organization}>
              <DetailLink
                label={detail.actions.viewOrganization}
                actionLabel={detail.actions.viewOrganization}
                onClick={() => onOrganizationOpen?.(invoice.organizationId as string, invoice)}
                disabled={!onOrganizationOpen}
              />
            </DetailRow>
          ) : null}
          {invoice.notes ? (
            <div className="mt-2 flex flex-col gap-1">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {detail.fields.notes}
              </dt>
              <dd className="whitespace-pre-wrap text-sm">{invoice.notes}</dd>
            </div>
          ) : null}
          <DetailRow label={detail.fields.createdAt}>{formatDateTime(invoice.createdAt)}</DetailRow>
          <DetailRow label={detail.fields.updatedAt}>{formatDateTime(invoice.updatedAt)}</DetailRow>
        </dl>
      </CardContent>
    </Card>
  )
}

export interface InvoiceLineItemsCardProps extends InvoiceDetailCardProps {
  lineItems: LineItemRecord[]
  pending?: boolean
  deletePending?: boolean
  onCreate?: (invoice: InvoiceRecord) => void
  onEdit?: (lineItem: LineItemRecord, invoice: InvoiceRecord) => void
  onDelete?: (lineItemId: string) => Promise<void>
}

export function InvoiceLineItemsCard({
  invoice,
  lineItems,
  pending,
  deletePending,
  onCreate,
  onEdit,
  onDelete,
  className,
}: InvoiceLineItemsCardProps) {
  const messages = useFinanceUiMessagesOrDefault()
  const detail = messages.invoiceDetailPage

  return (
    <InvoiceSection
      dataSlot="invoice-line-items-card"
      title={detail.titles.lineItems}
      className={className}
      action={
        onCreate ? (
          <Button size="sm" onClick={() => onCreate(invoice)}>
            <Plus className="size-4" aria-hidden="true" />
            {detail.actions.addLineItem}
          </Button>
        ) : null
      }
    >
      {pending ? (
        <LoadingRow />
      ) : lineItems.length === 0 ? (
        <EmptyRow>{detail.states.noLineItems}</EmptyRow>
      ) : (
        <div className="overflow-x-auto rounded border bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="p-2 text-left font-medium">{detail.columns.description}</th>
                <th className="p-2 text-right font-medium">{detail.columns.quantity}</th>
                <th className="p-2 text-right font-medium">{detail.columns.unitPrice}</th>
                <th className="p-2 text-right font-medium">{detail.columns.total}</th>
                <th className="p-2 text-right font-medium">{detail.columns.taxRate}</th>
                <th className="w-20 p-2" />
              </tr>
            </thead>
            <tbody>
              {lineItems.map((lineItem) => (
                <tr key={lineItem.id} className="border-b last:border-b-0">
                  <td className="p-2">{lineItem.description}</td>
                  <td className="p-2 text-right">{lineItem.quantity}</td>
                  <td className="p-2 text-right">
                    <Money cents={lineItem.unitPriceCents} currency={invoice.currency} />
                  </td>
                  <td className="p-2 text-right">
                    <Money cents={lineItem.totalCents} currency={invoice.currency} />
                  </td>
                  <td className="p-2 text-right">
                    {lineItem.taxRate === null ? detail.states.noValue : `${lineItem.taxRate}%`}
                  </td>
                  <td className="p-2">
                    <div className="flex justify-end gap-1">
                      {onEdit ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onEdit(lineItem, invoice)}
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                          <span className="sr-only">{detail.actions.editLineItem}</span>
                        </Button>
                      ) : null}
                      {onDelete ? (
                        <ConfirmActionButton
                          buttonLabel={detail.actions.deleteLineItemShort}
                          confirmLabel={detail.actions.delete}
                          cancelLabel={messages.common.cancel}
                          title={detail.actions.deleteLineItemTitle}
                          description={detail.actions.deleteLineItemDescription}
                          disabled={deletePending}
                          variant="ghost"
                          confirmVariant="destructive"
                          onConfirm={() => onDelete(lineItem.id)}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </InvoiceSection>
  )
}

export interface InvoicePaymentsCardProps extends InvoiceDetailCardProps {
  payments: PaymentRecord[]
  pending?: boolean
  onCreate?: (invoice: InvoiceRecord) => void
}

export function InvoicePaymentsCard({
  invoice,
  payments,
  pending,
  onCreate,
  className,
}: InvoicePaymentsCardProps) {
  const messages = useFinanceUiMessagesOrDefault()
  const detail = messages.invoiceDetailPage

  return (
    <InvoiceSection
      dataSlot="invoice-payments-card"
      title={detail.titles.payments}
      className={className}
      action={
        onCreate && invoice.status !== "void" ? (
          <Button size="sm" onClick={() => onCreate(invoice)}>
            <Plus className="size-4" aria-hidden="true" />
            {detail.actions.recordPayment}
          </Button>
        ) : null
      }
    >
      {pending ? (
        <LoadingRow />
      ) : payments.length === 0 ? (
        <EmptyRow>{detail.states.noPayments}</EmptyRow>
      ) : (
        <ul className="divide-y">
          {payments.map((payment) => (
            <li key={payment.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {formatPaymentMethod(payment.paymentMethod, messages)}
                </p>
                <p className="text-xs text-muted-foreground">{payment.paymentDate}</p>
              </div>
              <div className="flex items-center gap-3">
                <Money cents={payment.amountCents} currency={payment.currency} />
                <Badge variant={paymentStatusVariant[payment.status] ?? "secondary"}>
                  {messages.common.supplierPaymentStatusLabels[payment.status]}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </InvoiceSection>
  )
}

export interface InvoiceCreditNotesCardProps extends InvoiceDetailCardProps {
  creditNotes: CreditNoteRecord[]
  pending?: boolean
  onCreate?: (invoice: InvoiceRecord) => void
  /**
   * Whether each credit note has actually been paid (voyant#4303). The card
   * stays presentational — the page owns the read and renders this per row.
   */
  refundSlot?: (creditNote: CreditNoteRecord) => ReactNode
}

export function InvoiceCreditNotesCard({
  invoice,
  creditNotes,
  pending,
  onCreate,
  refundSlot,
  className,
}: InvoiceCreditNotesCardProps) {
  const messages = useFinanceUiMessagesOrDefault()
  const detail = messages.invoiceDetailPage

  return (
    <InvoiceSection
      dataSlot="invoice-credit-notes-card"
      title={detail.titles.creditNotes}
      className={className}
      action={
        onCreate ? (
          <Button size="sm" onClick={() => onCreate(invoice)}>
            <Plus className="size-4" aria-hidden="true" />
            {detail.actions.addCreditNote}
          </Button>
        ) : null
      }
    >
      {pending ? (
        <LoadingRow />
      ) : creditNotes.length === 0 ? (
        <EmptyRow>{detail.states.noCreditNotes}</EmptyRow>
      ) : (
        <ul className="divide-y">
          {creditNotes.map((creditNote) => (
            <li key={creditNote.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{creditNote.creditNoteNumber}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{creditNote.reason}</p>
                {refundSlot?.(creditNote)}
              </div>
              <div className="flex items-center gap-3">
                <Money cents={creditNote.amountCents} currency={creditNote.currency} />
                <Badge variant={creditNoteStatusVariant[creditNote.status] ?? "secondary"}>
                  {detail.creditNoteStatusLabels[creditNote.status]}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </InvoiceSection>
  )
}

export interface InvoiceAttachmentsCardProps extends InvoiceDetailCardProps {
  attachments: InvoiceAttachmentRecord[]
  pending?: boolean
  deletePending?: boolean
  getDownloadHref?: (attachment: InvoiceAttachmentRecord) => string | undefined
  onCreate: () => void
  onEdit: (attachment: InvoiceAttachmentRecord) => void
  onDelete: (attachmentId: string) => Promise<void> // i18n-literal-ok function type
}

export function InvoiceAttachmentsCard({
  attachments,
  pending,
  deletePending,
  getDownloadHref,
  onCreate,
  onEdit,
  onDelete,
  className,
}: InvoiceAttachmentsCardProps) {
  const messages = useFinanceUiMessagesOrDefault()
  const detail = messages.invoiceDetailPage

  return (
    <InvoiceSection
      dataSlot="invoice-attachments-card"
      title={detail.titles.attachments}
      className={className}
      action={
        <Button size="sm" onClick={onCreate}>
          <Plus className="size-4" aria-hidden="true" />
          {detail.actions.addAttachment}
        </Button>
      }
    >
      {pending ? (
        <LoadingRow />
      ) : attachments.length === 0 ? (
        <EmptyRow>{detail.states.noAttachments}</EmptyRow>
      ) : (
        <div className="overflow-x-auto rounded border bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="p-2 text-left font-medium">{detail.columns.name}</th>
                <th className="p-2 text-left font-medium">{detail.columns.kind}</th>
                <th className="p-2 text-left font-medium">{detail.columns.mimeType}</th>
                <th className="p-2 text-right font-medium">{detail.columns.size}</th>
                <th className="w-20 p-2" />
              </tr>
            </thead>
            <tbody>
              {attachments.map((attachment) => {
                const downloadHref = getDownloadHref?.(attachment)
                return (
                  <tr key={attachment.id} className="border-b last:border-b-0">
                    <td className="min-w-0 p-2">
                      {downloadHref ? (
                        <a
                          href={downloadHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex max-w-full items-center gap-1.5 hover:underline"
                        >
                          <FileText className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
                          <span className="truncate">{attachment.name}</span>
                          <ExternalLink className="size-3 shrink-0 opacity-60" aria-hidden="true" />
                        </a>
                      ) : (
                        <span className="truncate">{attachment.name}</span>
                      )}
                    </td>
                    <td className="p-2">{attachment.kind}</td>
                    <td className="p-2">{attachment.mimeType ?? detail.states.noValue}</td>
                    <td className="p-2 text-right">
                      {attachment.fileSize == null
                        ? detail.states.noValue
                        : formatBytes(attachment.fileSize)}
                    </td>
                    <td className="p-2">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onEdit(attachment)}
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                          <span className="sr-only">{detail.actions.editAttachment}</span>
                        </Button>
                        <ConfirmActionButton
                          buttonLabel={detail.actions.deleteAttachmentShort}
                          confirmLabel={detail.actions.delete}
                          cancelLabel={messages.common.cancel}
                          title={detail.actions.deleteAttachmentTitle}
                          description={detail.actions.deleteAttachmentDescription}
                          disabled={deletePending}
                          variant="ghost"
                          confirmVariant="destructive"
                          onConfirm={() => onDelete(attachment.id)}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </InvoiceSection>
  )
}
