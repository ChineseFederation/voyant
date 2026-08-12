"use client"

import { useLocale, useOperatorAdminMessages } from "@voyant-travel/admin"
import {
  type InvoiceAttachmentRecord,
  useInvoice,
  useInvoiceAttachments,
  useInvoiceLineItems,
  useInvoiceMutation,
  useInvoicePayments,
  useVoyantFinanceContext,
} from "@voyant-travel/finance-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  SheetHeader,
  SheetTitle,
} from "@voyant-travel/ui/components"
import { ArrowRightLeft, ArrowUpRight, Download, FileText, Loader2 } from "lucide-react"
import { useState } from "react"

import { StatusBadge } from "../components/status-badge.js"

export interface BookingInvoiceSheetProps {
  invoiceId: string
  /** Navigate to the full invoice detail page. */
  onOpenInvoice?: (invoiceId: string) => void
}

/**
 * Compact invoice view designed to live inside a `Sheet` next to the
 * booking detail page. Unlike `InvoiceDetailPage` (a standalone page
 * with breadcrumb + action bar + collapsible cards), this component
 * trims the chrome and focuses on the operator's reconciliation needs:
 * summary numbers, line items, payments. Big actions (edit, void)
 * stay on the dedicated invoice page.
 *
 * Packaged host piece (packaged-admin RFC Phase 3): API base URL comes
 * from the shell's finance provider context — no app env import.
 */
export function BookingInvoiceSheet({ invoiceId, onOpenInvoice }: BookingInvoiceSheetProps) {
  const { resolvedLocale } = useLocale()
  const adminMessages = useOperatorAdminMessages()
  const messages = adminMessages.bookings.detail.invoiceSheet
  const financeMessages = adminMessages.finance
  const { data: invoiceData, isPending: invoicePending } = useInvoice(invoiceId)
  const { data: lineItemsData, isPending: lineItemsPending } = useInvoiceLineItems(invoiceId)
  const { data: paymentsData, isPending: paymentsPending } = useInvoicePayments(invoiceId)
  const { data: attachmentsData, isPending: attachmentsPending } = useInvoiceAttachments(invoiceId)
  const { convertToInvoice } = useInvoiceMutation()
  const [confirmConvert, setConfirmConvert] = useState(false)

  if (invoicePending) {
    return (
      <>
        <SheetHeader>
          <SheetTitle>{messages.invoiceTypes.invoice}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </>
    )
  }

  const invoice = invoiceData?.data
  if (!invoice) {
    return (
      <>
        <SheetHeader>
          <SheetTitle>{messages.invoiceTypes.invoice}</SheetTitle>
        </SheetHeader>
        <div className="p-6 text-sm text-muted-foreground">{messages.notFound}</div>
      </>
    )
  }

  const invoiceType = invoice.invoiceType ?? "invoice"
  const sheetTitle = messages.invoiceTypes[invoiceType] ?? messages.invoiceTypes.invoice
  const canConvert = invoiceType === "proforma" && invoice.status !== "void"
  // A void proforma with a `convertedToInvoiceId` is "Invoiced" in the
  // operator's mental model — the void is purely how our DB models the
  // hand-off. Display the friendlier label and link to the final
  // invoice on the same sheet (no extra navigation).
  const convertedToInvoiceId =
    (invoice as { convertedToInvoiceId?: string | null }).convertedToInvoiceId ?? null
  const convertedToInvoiceNumber =
    (invoice as { convertedToInvoiceNumber?: string | null }).convertedToInvoiceNumber ?? null
  const showAsInvoiced =
    invoiceType === "proforma" && invoice.status === "void" && Boolean(convertedToInvoiceId)
  const displayStatusKey = showAsInvoiced ? "invoiced" : invoice.status
  const displayStatusLabel = showAsInvoiced
    ? ((messages.invoiceStatusLabels as Record<string, string | undefined>).invoiced ??
      financeMessages.invoiceStatusInvoiced ??
      "Invoiced")
    : (messages.invoiceStatusLabels[invoice.status as keyof typeof messages.invoiceStatusLabels] ??
      invoice.status)

  const lineItems = lineItemsData?.data ?? []
  const payments = paymentsData?.data ?? []
  const formatMoney = makeFormatMoney(resolvedLocale, invoice.currency)
  const formatDate = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString(resolvedLocale, { dateStyle: "medium" }) : "—"
  const formatDateTime = (iso: string | null | undefined) =>
    iso
      ? new Date(iso).toLocaleString(resolvedLocale, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "—"

  return (
    <>
      <SheetHeader>
        <SheetTitle>{sheetTitle}</SheetTitle>
      </SheetHeader>
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <header className="mb-6 flex flex-col gap-3 border-b pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-base font-semibold">{invoice.invoiceNumber}</span>
              <StatusBadge status={showAsInvoiced ? "paid" : invoice.status}>
                {displayStatusLabel}
              </StatusBadge>
              {showAsInvoiced && convertedToInvoiceId ? (
                <button
                  type="button"
                  onClick={() => onOpenInvoice?.(convertedToInvoiceId)}
                  className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                  title={messages.convertedToInvoiceTitle}
                >
                  → {convertedToInvoiceNumber ?? displayStatusKey}
                  <ArrowUpRight className="h-3 w-3" />
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {canConvert ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={convertToInvoice.isPending}
                  onClick={() => setConfirmConvert(true)}
                >
                  <ArrowRightLeft className="mr-1 h-3.5 w-3.5" />
                  {financeMessages.convertToInvoice}
                </Button>
              ) : null}
              {onOpenInvoice ? (
                <Button size="sm" onClick={() => onOpenInvoice(invoiceId)}>
                  {messages.openInvoice}
                  <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          </div>
          {invoice.notes ? (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{invoice.notes}</p>
          ) : null}
        </header>

        <section className="mb-6">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {messages.summarySection}
          </h3>
          <dl className="rounded-md border divide-y">
            <SummaryRow label={messages.subtotal} value={formatMoney(invoice.subtotalCents)} />
            <SummaryRow label={messages.tax} value={formatMoney(invoice.taxCents)} />
            <SummaryRow label={messages.total} value={formatMoney(invoice.totalCents)} emphasis />
            <SummaryRow label={messages.paid} value={formatMoney(invoice.paidCents)} />
            <SummaryRow
              label={messages.balanceDue}
              value={formatMoney(invoice.balanceDueCents)}
              emphasis={invoice.balanceDueCents > 0}
            />
          </dl>
        </section>

        <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DatesCard label={messages.issueDate} value={formatDate(invoice.issueDate)} />
          <DatesCard label={messages.dueDate} value={formatDate(invoice.dueDate)} />
          <DatesCard label={messages.createdAt} value={formatDateTime(invoice.createdAt)} />
          <DatesCard label={messages.updatedAt} value={formatDateTime(invoice.updatedAt)} />
        </section>

        <section className="mb-6">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {messages.lineItemsSection}
          </h3>
          {lineItemsPending ? (
            <div className="flex items-center gap-2 rounded-md border p-3 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {messages.loading}
            </div>
          ) : lineItems.length === 0 ? (
            <p className="rounded-md border py-4 text-center text-sm text-muted-foreground">
              {messages.lineItemsEmpty}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="border-b text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">{messages.colDescription}</th>
                    <th className="px-3 py-2 text-right font-medium">{messages.colQty}</th>
                    <th className="px-3 py-2 text-right font-medium">{messages.colUnitPrice}</th>
                    <th className="px-3 py-2 text-right font-medium">{messages.colTax}</th>
                    <th className="px-3 py-2 text-right font-medium">{messages.colLineTotal}</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((line) => {
                    const taxAmountCents =
                      line.taxRate != null
                        ? Math.round((line.totalCents * line.taxRate) / 100)
                        : null
                    return (
                      <tr key={line.id} className="border-b last:border-b-0">
                        <td className="px-3 py-2">{line.description}</td>
                        <td className="px-3 py-2 text-right font-mono">{line.quantity}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {formatMoney(line.unitPriceCents)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {taxAmountCents != null && line.taxRate != null ? (
                            <>
                              {formatMoney(taxAmountCents)}{" "}
                              <span className="text-muted-foreground">({line.taxRate}%)</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {formatMoney(line.totalCents)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {messages.paymentsSection}
          </h3>
          {paymentsPending ? (
            <div className="flex items-center gap-2 rounded-md border p-3 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {messages.loading}
            </div>
          ) : payments.length === 0 ? (
            <p className="rounded-md border py-4 text-center text-sm text-muted-foreground">
              {messages.paymentsEmpty}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="border-b text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">{messages.colDate}</th>
                    <th className="px-3 py-2 text-left font-medium">{messages.colMethod}</th>
                    <th className="px-3 py-2 text-left font-medium">{messages.colStatus}</th>
                    <th className="px-3 py-2 text-left font-medium">{messages.colReference}</th>
                    <th className="px-3 py-2 text-right font-medium">{messages.colAmount}</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-b last:border-b-0">
                      <td className="px-3 py-2">{formatDateTime(payment.paymentDate)}</td>
                      <td className="px-3 py-2 capitalize">
                        {payment.paymentMethod.replaceAll("_", " ")}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={payment.status}>{payment.status}</StatusBadge>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {payment.referenceNumber ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-medium">
                        {formatMoney(payment.amountCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-6">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {messages.attachmentsSection}
          </h3>
          {attachmentsPending ? (
            <div className="flex items-center gap-2 rounded-md border p-3 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {messages.loading}
            </div>
          ) : (attachmentsData?.data ?? []).length === 0 ? (
            <p className="rounded-md border py-4 text-center text-sm text-muted-foreground">
              {messages.attachmentsEmpty}
            </p>
          ) : (
            <ul className="flex flex-col divide-y rounded-md border">
              {(attachmentsData?.data ?? []).map((attachment) => (
                <AttachmentRow
                  key={attachment.id}
                  attachment={attachment}
                  downloadLabel={messages.attachmentDownload}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      <AlertDialog
        open={confirmConvert}
        onOpenChange={(next) => {
          if (!next && !convertToInvoice.isPending) setConfirmConvert(false)
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{financeMessages.convertToInvoice}</AlertDialogTitle>
            <AlertDialogDescription>{financeMessages.convertConfirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={convertToInvoice.isPending}>
              {financeMessages.detailPage.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={convertToInvoice.isPending}
              onClick={() => {
                convertToInvoice.mutate(
                  { id: invoiceId },
                  { onSuccess: () => setConfirmConvert(false) },
                )
              }}
            >
              {financeMessages.convertToInvoice}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function AttachmentRow({
  attachment,
  downloadLabel,
}: {
  attachment: InvoiceAttachmentRecord
  downloadLabel: string
}) {
  // Same admin endpoint the finance invoice page links to; the base URL
  // comes from the finance provider context instead of an app env helper.
  const { baseUrl } = useVoyantFinanceContext()
  const trimmedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
  const href = `${trimmedBase}/v1/admin/finance/invoice-attachments/${attachment.id}/download`
  const sizeKb =
    typeof attachment.fileSize === "number" ? `${Math.round(attachment.fileSize / 1024)} KB` : null
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate">{attachment.name}</span>
          <span className="text-muted-foreground text-xs uppercase">
            {attachment.kind}
            {sizeKb ? ` · ${sizeKb}` : null}
          </span>
        </div>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Download className="h-3.5 w-3.5" />
        {downloadLabel}
      </a>
    </li>
  )
}

function SummaryRow({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-sm">
      <dt className={emphasis ? "font-semibold" : "text-muted-foreground"}>{label}</dt>
      <dd className={emphasis ? "font-mono text-base font-semibold" : "font-mono"}>{value}</dd>
    </div>
  )
}

function DatesCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-0.5 text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  )
}

function makeFormatMoney(locale: string, currency: string) {
  return (cents: number) => {
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100)
    } catch {
      return `${(cents / 100).toFixed(2)} ${currency}`
    }
  }
}
