"use client"

import { cn } from "@voyant-travel/ui/lib/utils"
import { type ReactNode, useState } from "react"
import { useFinanceUiMessagesOrDefault } from "../i18n/index.js"
import type { InvoiceAttachmentRecord, InvoiceRecord, LineItemRecord } from "../index.js"
import {
  useInvoice,
  useInvoiceAttachmentMutation,
  useInvoiceAttachments,
  useInvoiceCreditNotes,
  useInvoiceLineItemMutation,
  useInvoiceLineItems,
  useInvoiceMutation,
  useInvoiceNoteMutation,
  useInvoiceNotes,
  useInvoicePayments,
  useRefundSettlements,
  useVoyantFinanceContext,
} from "../index.js"
import {
  InvoiceAttachmentsCard,
  InvoiceCreditNotesCard,
  InvoiceLineItemsCard,
  InvoiceLinksCard,
  InvoicePaymentsCard,
  InvoiceSummaryCard,
} from "./invoice-detail-page/cards.js"
import { InvoiceDetailHeader } from "./invoice-detail-page/header.js"
import {
  InvoiceAttachmentDialog,
  InvoiceNoteDialog,
  type InvoiceNoteDialogProps,
  InvoiceNotesCard,
} from "./invoice-detail-page/notes-dialogs.js"
import { InvoiceDetailLoading, InvoiceDetailState } from "./invoice-detail-page/primitives.js"
import { InvoiceDialog } from "./invoice-dialog.js"
import { CreditNoteRefundStatus } from "./refund-settlements/credit-note-refund-status.js"

export interface InvoiceDetailPageSlots {
  afterHeader?: ReactNode
  integrationsContent?: InvoiceDetailIntegrationContent
  afterSummary?: ReactNode
  lineItemsContent?: ReactNode
  afterLineItems?: ReactNode
  paymentsContent?: ReactNode
  afterPayments?: ReactNode
  creditNotesContent?: ReactNode
  afterCreditNotes?: ReactNode
  attachmentsContent?: ReactNode
  afterAttachments?: ReactNode
  notesContent?: ReactNode
  afterNotes?: ReactNode
  dialogs?: ReactNode
}

export interface InvoiceDetailIntegrationSlotContext {
  invoice: InvoiceRecord
}

export type InvoiceDetailIntegrationContent =
  | ReactNode
  | ((context: InvoiceDetailIntegrationSlotContext) => ReactNode)

export interface InvoiceDetailPageProps {
  id: string
  className?: string
  onBack?: () => void
  onDeleted?: () => void
  onBookingOpen?: (bookingId: string, invoice: InvoiceRecord) => void
  onPersonOpen?: (personId: string, invoice: InvoiceRecord) => void
  onOrganizationOpen?: (organizationId: string, invoice: InvoiceRecord) => void
  onLineItemCreate?: (invoice: InvoiceRecord) => void
  onLineItemEdit?: (lineItem: LineItemRecord, invoice: InvoiceRecord) => void
  onPaymentCreate?: (invoice: InvoiceRecord) => void
  onConverted?: (invoice: InvoiceRecord, source: InvoiceRecord) => void
  onCreditNoteCreate?: (invoice: InvoiceRecord) => void
  getAttachmentDownloadHref?: (attachment: InvoiceAttachmentRecord) => string | undefined
  renderInvoiceNoteDialog?: (props: InvoiceNoteDialogProps) => ReactNode
  slots?: InvoiceDetailPageSlots
}

function withApiBaseUrl(baseUrl: string, path: string) {
  const trimmedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${trimmedBase}${normalizedPath}`
}

function getDefaultInvoiceAttachmentDownloadHref(
  baseUrl: string,
  attachment: InvoiceAttachmentRecord,
) {
  return withApiBaseUrl(baseUrl, `/v1/admin/finance/invoice-attachments/${attachment.id}/download`)
}

function renderInvoiceDetailIntegrationContent(
  content: InvoiceDetailIntegrationContent | undefined,
  context: InvoiceDetailIntegrationSlotContext,
) {
  return typeof content === "function" ? content(context) : content
}

export function InvoiceDetailPage({
  id,
  className,
  onBack,
  onDeleted,
  onBookingOpen,
  onPersonOpen,
  onOrganizationOpen,
  onLineItemCreate,
  onLineItemEdit,
  onPaymentCreate,
  onConverted,
  onCreditNoteCreate,
  getAttachmentDownloadHref,
  renderInvoiceNoteDialog,
  slots,
}: InvoiceDetailPageProps) {
  const { baseUrl } = useVoyantFinanceContext()
  const messages = useFinanceUiMessagesOrDefault()
  const [editOpen, setEditOpen] = useState(false)
  const [attachmentOpen, setAttachmentOpen] = useState(false)
  const [editingAttachment, setEditingAttachment] = useState<InvoiceAttachmentRecord | undefined>()
  const [noteOpen, setNoteOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const invoiceQuery = useInvoice(id)
  const invoice = invoiceQuery.data?.data
  const lineItemsQuery = useInvoiceLineItems(id, { enabled: Boolean(invoice) })
  const paymentsQuery = useInvoicePayments(id, { enabled: Boolean(invoice) })
  const creditNotesQuery = useInvoiceCreditNotes(id, { enabled: Boolean(invoice) })
  // One read for every credit note on this invoice, rather than one per row.
  const refundsQuery = useRefundSettlements({
    invoiceId: id,
    limit: 100,
    enabled: Boolean(invoice),
  })
  const attachmentsQuery = useInvoiceAttachments(id, { enabled: Boolean(invoice) })
  const notesQuery = useInvoiceNotes(id, { enabled: Boolean(invoice) })
  const { convertToInvoice, remove: removeInvoice, voidInvoice } = useInvoiceMutation()
  const { remove: removeLineItem } = useInvoiceLineItemMutation(id)
  const { remove: removeAttachment } = useInvoiceAttachmentMutation(id)
  const addNote = useInvoiceNoteMutation(id)

  if (invoiceQuery.isPending) {
    return <InvoiceDetailLoading className={className} />
  }

  if (invoiceQuery.isError || !invoice) {
    return (
      <InvoiceDetailState
        className={className}
        message={
          invoiceQuery.isError
            ? invoiceQuery.error instanceof Error
              ? invoiceQuery.error.message
              : messages.invoiceDetailPage.states.loadFailed
            : messages.invoiceDetailPage.states.notFound
        }
        onBack={onBack}
      />
    )
  }

  const lineItems = lineItemsQuery.data?.data ?? []
  const payments = paymentsQuery.data?.data ?? []
  const creditNotes = creditNotesQuery.data?.data ?? []
  const attachments = attachmentsQuery.data?.data ?? []
  const notes = notesQuery.data?.data ?? []
  const integrationsContent = renderInvoiceDetailIntegrationContent(slots?.integrationsContent, {
    invoice,
  })
  const handleCreateNote = async (nextContent: string) => {
    const content = nextContent.trim()
    if (!content) return
    await addNote.mutateAsync({ content })
    setNoteOpen(false)
    void notesQuery.refetch()
  }

  return (
    <div data-slot="invoice-detail-page" className={cn("flex flex-col gap-6", className)}>
      <InvoiceDetailHeader
        invoice={invoice}
        onBack={onBack}
        onEdit={() => setEditOpen(true)}
        deletePending={removeInvoice.isPending}
        convertPending={convertToInvoice.isPending}
        voidPending={voidInvoice.isPending}
        onConvert={async () => {
          try {
            setActionError(null)
            const converted = await convertToInvoice.mutateAsync({ id })
            onConverted?.(converted, invoice)
          } catch (error) {
            setActionError(
              error instanceof Error
                ? error.message
                : messages.invoiceDetailPage.actions.mutationFailed,
            )
          }
        }}
        onVoid={async (reason) => {
          try {
            setActionError(null)
            await voidInvoice.mutateAsync({ id, input: { reason } })
          } catch (error) {
            setActionError(
              error instanceof Error
                ? error.message
                : messages.invoiceDetailPage.actions.mutationFailed,
            )
          }
        }}
        onDelete={async () => {
          try {
            setActionError(null)
            await removeInvoice.mutateAsync(id)
            onDeleted?.()
            onBack?.()
          } catch (error) {
            setActionError(
              error instanceof Error
                ? error.message
                : messages.invoiceDetailPage.actions.mutationFailed,
            )
          }
        }}
      />
      {actionError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
          {actionError}
        </div>
      ) : null}
      {slots?.afterHeader}

      <div className="grid gap-4 md:grid-cols-2">
        <InvoiceSummaryCard invoice={invoice} />
        <InvoiceLinksCard
          invoice={invoice}
          onBookingOpen={onBookingOpen}
          onPersonOpen={onPersonOpen}
          onOrganizationOpen={onOrganizationOpen}
        />
      </div>
      {integrationsContent ? (
        <div data-slot="invoice-integrations-content" className="grid gap-3">
          {integrationsContent}
        </div>
      ) : null}
      {slots?.afterSummary}

      {slots?.lineItemsContent !== undefined ? (
        slots.lineItemsContent
      ) : (
        <InvoiceLineItemsCard
          invoice={invoice}
          lineItems={lineItems}
          pending={lineItemsQuery.isPending}
          deletePending={removeLineItem.isPending}
          onCreate={onLineItemCreate}
          onEdit={onLineItemEdit}
          onDelete={async (lineItemId) => {
            try {
              setActionError(null)
              await removeLineItem.mutateAsync(lineItemId)
            } catch (error) {
              setActionError(
                error instanceof Error
                  ? error.message
                  : messages.invoiceDetailPage.actions.mutationFailed,
              )
            }
          }}
        />
      )}
      {slots?.afterLineItems}

      {slots?.paymentsContent !== undefined ? (
        slots.paymentsContent
      ) : (
        <InvoicePaymentsCard
          invoice={invoice}
          payments={payments}
          pending={paymentsQuery.isPending}
          onCreate={onPaymentCreate}
        />
      )}
      {slots?.afterPayments}

      {slots?.creditNotesContent !== undefined ? (
        slots.creditNotesContent
      ) : (
        <InvoiceCreditNotesCard
          invoice={invoice}
          creditNotes={creditNotes}
          pending={creditNotesQuery.isPending}
          onCreate={onCreditNoteCreate}
          // One read for the whole invoice, filtered per row — a credit note
          // reads `issued` whether or not anybody paid it, so this is the only
          // thing on the card that closes the loop (voyant#4303).
          refundSlot={(creditNote) => (
            <CreditNoteRefundStatus
              creditNoteId={creditNote.id}
              bookingId={invoice.bookingId}
              amountCents={creditNote.amountCents}
              currency={creditNote.currency}
              settlements={refundsQuery.data?.data ?? []}
              onRecorded={() => void refundsQuery.refetch()}
            />
          )}
        />
      )}
      {slots?.afterCreditNotes}

      {slots?.attachmentsContent !== undefined ? (
        slots.attachmentsContent
      ) : (
        <InvoiceAttachmentsCard
          invoice={invoice}
          attachments={attachments}
          pending={attachmentsQuery.isPending}
          deletePending={removeAttachment.isPending}
          getDownloadHref={
            getAttachmentDownloadHref ??
            ((attachment) => getDefaultInvoiceAttachmentDownloadHref(baseUrl, attachment))
          }
          onCreate={() => {
            setEditingAttachment(undefined)
            setAttachmentOpen(true)
          }}
          onEdit={(attachment) => {
            setEditingAttachment(attachment)
            setAttachmentOpen(true)
          }}
          onDelete={async (attachmentId) => {
            await removeAttachment.mutateAsync(attachmentId)
          }}
        />
      )}
      {slots?.afterAttachments}

      {slots?.notesContent !== undefined ? (
        slots.notesContent
      ) : (
        <InvoiceNotesCard
          notes={notes}
          pending={notesQuery.isPending}
          addPending={addNote.isPending}
          onCreate={() => setNoteOpen(true)}
        />
      )}
      {slots?.afterNotes}

      <InvoiceDialog open={editOpen} onOpenChange={setEditOpen} invoice={invoice} />
      <InvoiceAttachmentDialog
        open={attachmentOpen}
        onOpenChange={setAttachmentOpen}
        invoiceId={id}
        attachment={editingAttachment}
        onSuccess={() => {
          setAttachmentOpen(false)
          setEditingAttachment(undefined)
          void attachmentsQuery.refetch()
        }}
      />
      {renderInvoiceNoteDialog ? (
        renderInvoiceNoteDialog({
          open: noteOpen,
          onOpenChange: setNoteOpen,
          pending: addNote.isPending,
          onSubmit: handleCreateNote,
        })
      ) : (
        <InvoiceNoteDialog
          open={noteOpen}
          onOpenChange={setNoteOpen}
          pending={addNote.isPending}
          onSubmit={handleCreateNote}
        />
      )}
      {slots?.dialogs}
    </div>
  )
}

export {
  InvoiceAttachmentsCard,
  type InvoiceAttachmentsCardProps,
  InvoiceCreditNotesCard,
  type InvoiceCreditNotesCardProps,
  type InvoiceDetailCardProps,
  InvoiceLineItemsCard,
  type InvoiceLineItemsCardProps,
  InvoiceLinksCard,
  type InvoiceLinksCardProps,
  InvoicePaymentsCard,
  type InvoicePaymentsCardProps,
  InvoiceSummaryCard,
} from "./invoice-detail-page/cards.js"
export { InvoiceDetailHeader, type InvoiceDetailHeaderProps } from "./invoice-detail-page/header.js"
export {
  InvoiceNoteDialog,
  type InvoiceNoteDialogProps,
  InvoiceNotesCard,
  type InvoiceNotesCardProps,
} from "./invoice-detail-page/notes-dialogs.js"
export {
  creditNoteStatusVariant,
  DetailLink,
  type DetailLinkProps,
  DetailRow,
  type DetailRowProps,
  EmptyRow,
  type EmptyRowProps,
  formatPaymentMethod,
  InvoiceDetailLoading,
  InvoiceDetailState,
  InvoiceSection,
  type InvoiceSectionProps,
  invoiceStatusVariant,
  invoiceTypeVariant,
  LoadingRow,
  Money,
  type MoneyProps,
  paymentStatusVariant,
} from "./invoice-detail-page/primitives.js"
