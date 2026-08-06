"use client"

import {
  AdminWidgetSlotRenderer,
  type OperatorAdminMessages,
  useAdminBreadcrumbs,
  useAdminHref,
  useAdminNavigate,
  useOperatorAdminMessages,
} from "@voyant-travel/admin"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Badge,
  Button,
  confirmDialog,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@voyant-travel/ui/components"
import { Tooltip, TooltipContent, TooltipTrigger } from "@voyant-travel/ui/components/tooltip"
import { ArrowRightLeft, Ban, Loader2, Pencil, Trash2 } from "lucide-react"
import { useState } from "react"
import { InvoiceActionLedgerCard } from "../components/invoice-action-ledger-card.js"
import { InvoiceDialog } from "../components/invoice-dialog.js"
import {
  useInvoice,
  useInvoiceCreditNotes,
  useInvoiceLineItemMutation,
  useInvoiceLineItems,
  useInvoiceMutation,
  useInvoiceNoteMutation,
  useInvoiceNotes,
  useInvoicePayments,
  useRefundSettlements,
} from "../index.js"
import { CreditNoteDialog } from "./credit-note-dialog.js"
import { invoiceStatusVariant, type LineItem } from "./finance-shared.js"
import {
  InvoiceAttachmentsCard,
  InvoiceCreditNotesCard,
  InvoiceInfoCards,
  InvoiceLineItemsCard,
  InvoiceNotesCard,
  InvoicePaymentsCard,
} from "./invoice-detail-sections.js"
import { InvoiceDetailSkeleton } from "./invoice-detail-skeleton.js"
import { LineItemDialog } from "./line-item-dialog.js"
import { PaymentDialog } from "./payment-dialog.js"
import {
  useInvoiceBookingLabel,
  useInvoiceOrganizationLabel,
  useInvoicePersonLabel,
} from "./use-invoice-links.js"

function getInvoiceStatusLabel(messages: OperatorAdminMessages, status: string): string {
  switch (status) {
    case "draft":
      return messages.finance.invoiceStatusDraft
    case "issued":
      return messages.finance.invoiceStatusIssued
    case "partially_paid":
      return messages.finance.invoiceStatusPartiallyPaid
    case "paid":
      return messages.finance.invoiceStatusPaid
    case "overdue":
      return messages.finance.invoiceStatusOverdue
    case "void":
      return messages.finance.invoiceStatusVoid
    default:
      return status.replace(/_/g, " ")
  }
}

export interface InvoiceDetailHostProps {
  id: string
}

/**
 * Packaged admin host for the operator-grade invoice detail page
 * (packaged-admin RFC Phase 3). Owns everything package-clean:
 *
 *   - Data access through `@voyant-travel/finance-react` hooks (shared finance
 *     provider context — no app RPC client).
 *   - Cross-route links resolve through semantic destinations (RFC §4.7):
 *     `invoice.list` (back/after delete), `invoice.detail` (after a proforma
 *     converts), `booking.detail` — no host route tree import.
 *   - Admin widget extension points: the `invoice.details.header` and
 *     `invoice.details.after-summary` slots render through the shared
 *     `AdminWidgetSlotRenderer`, which reads the workspace shell's
 *     `AdminExtensionsProvider` context.
 */
export function InvoiceDetailHost({ id }: InvoiceDetailHostProps) {
  const messages = useOperatorAdminMessages()
  const navigateTo = useAdminNavigate()
  const resolveHref = useAdminHref()
  const [editOpen, setEditOpen] = useState(false)
  const [lineItemDialogOpen, setLineItemDialogOpen] = useState(false)
  const [editingLineItem, setEditingLineItem] = useState<LineItem | undefined>()
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [creditNoteDialogOpen, setCreditNoteDialogOpen] = useState(false)
  const [noteDialogOpen, setNoteDialogOpen] = useState(false)
  const [noteContent, setNoteContent] = useState("")
  const [actionError, setActionError] = useState<string | null>(null)
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [voidDialogOpen, setVoidDialogOpen] = useState(false)
  const [voidReason, setVoidReason] = useState("")

  const { data: invoiceData, isPending } = useInvoice(id)
  const { data: lineItemsData } = useInvoiceLineItems(id)
  const { data: paymentsData } = useInvoicePayments(id)
  const { data: creditNotesData } = useInvoiceCreditNotes(id)
  // One read for every credit note on this invoice, rather than one per row.
  const refundSettlementsQuery = useRefundSettlements({ invoiceId: id, limit: 100 })
  const { data: notesData } = useInvoiceNotes(id)
  const { convertToInvoice, remove: deleteInvoice, voidInvoice } = useInvoiceMutation()
  const { remove: deleteLineItem } = useInvoiceLineItemMutation(id)
  const addNoteMutation = useInvoiceNoteMutation(id)

  // Contextual labels for the "Dates & Links" card — resolve the linked ids to
  // their display names so operators see what they're clicking into. Called
  // unconditionally (rules-of-hooks); each is enabled only when its id exists.
  const bookingLabel = useInvoiceBookingLabel(invoiceData?.data?.bookingId)
  const personLabel = useInvoicePersonLabel(invoiceData?.data?.personId)
  const organizationLabel = useInvoiceOrganizationLabel(invoiceData?.data?.organizationId)

  const invoicesHref = resolveHref("invoice.list", {})
  const invoiceForBreadcrumb = invoiceData?.data
  useAdminBreadcrumbs(
    invoiceForBreadcrumb
      ? [
          { label: messages.finance.invoicesPageTitle, href: invoicesHref },
          { label: invoiceForBreadcrumb.invoiceNumber },
        ]
      : [{ label: messages.finance.invoicesPageTitle, href: invoicesHref }],
  )

  if (isPending) {
    return <InvoiceDetailSkeleton />
  }

  const invoice = invoiceData?.data
  if (!invoice) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <p className="text-muted-foreground">{messages.finance.detailPage.notFound}</p>
        <Button variant="outline" onClick={() => navigateTo("invoice.list", {})}>
          {messages.finance.detailPage.backToFinance}
        </Button>
      </div>
    )
  }

  const lineItems = lineItemsData?.data ?? []
  const payments = paymentsData?.data ?? []
  const creditNotes = creditNotesData?.data ?? []
  const notes = notesData?.data ?? []
  const canVoidInvoice = ["pending_external_allocation", "issued", "overdue"].includes(
    invoice.status,
  )
  const canConvertProforma = invoice.invoiceType === "proforma" && invoice.status !== "void"
  const canDeleteInvoice = invoice.status === "draft"

  const getMutationErrorMessage = (fallback: string) => (error: unknown) =>
    error instanceof Error ? error.message : fallback

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{invoice.invoiceNumber}</h1>
          <Badge
            variant={invoiceStatusVariant[invoice.status] ?? "secondary"}
            className="capitalize"
          >
            {getInvoiceStatusLabel(messages, invoice.status)}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canConvertProforma ? (
            <AlertDialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
              <AlertDialogTrigger
                disabled={convertToInvoice.isPending}
                render={<Button type="button" variant="outline" />}
              >
                {convertToInvoice.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                )}
                {messages.finance.convertToInvoice}
              </AlertDialogTrigger>
              <AlertDialogContent size="sm">
                <AlertDialogHeader>
                  <AlertDialogTitle>{messages.finance.convertToInvoice}</AlertDialogTitle>
                  <AlertDialogDescription>{messages.finance.convertConfirm}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={convertToInvoice.isPending}>
                    {messages.finance.detailPage.cancel}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    disabled={convertToInvoice.isPending}
                    onClick={() => {
                      setActionError(null)
                      convertToInvoice.mutate(
                        { id },
                        {
                          onSuccess: (converted) => {
                            setConvertDialogOpen(false)
                            navigateTo("invoice.detail", { invoiceId: converted.id })
                          },
                          onError: (error) => {
                            setActionError(
                              getMutationErrorMessage(messages.finance.detailPage.convertFailed)(
                                error,
                              ),
                            )
                          },
                        },
                      )
                    }}
                  >
                    {convertToInvoice.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    {messages.finance.convertToInvoice}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            {messages.finance.detailPage.edit}
          </Button>
          <AlertDialog
            open={voidDialogOpen}
            onOpenChange={(open) => {
              setVoidDialogOpen(open)
              if (!open) setVoidReason("")
            }}
          >
            <AlertDialogTrigger
              disabled={!canVoidInvoice || voidInvoice.isPending}
              render={<Button type="button" variant="outline" />}
            >
              <Ban className="mr-2 h-4 w-4" />
              {messages.finance.detailPage.void}
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>{messages.finance.detailPage.voidConfirm}</AlertDialogTitle>
                <AlertDialogDescription>
                  {messages.finance.detailPage.voidDescription}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Textarea
                value={voidReason}
                onChange={(event) => setVoidReason(event.target.value)}
                placeholder={messages.finance.detailPage.voidReasonPlaceholder}
                className="min-h-24"
              />
              <AlertDialogFooter>
                <AlertDialogCancel disabled={voidInvoice.isPending}>
                  {messages.finance.detailPage.cancel}
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={voidInvoice.isPending}
                  onClick={() => {
                    setActionError(null)
                    voidInvoice.mutate(
                      { id, input: { reason: voidReason.trim() || null } },
                      {
                        onSuccess: () => {
                          setVoidDialogOpen(false)
                          setVoidReason("")
                        },
                        onError: (error) => {
                          setActionError(
                            getMutationErrorMessage(messages.finance.detailPage.voidFailed)(error),
                          )
                        },
                      },
                    )
                  }}
                >
                  {voidInvoice.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  {messages.finance.detailPage.void}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {canDeleteInvoice ? (
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <AlertDialogTrigger
                disabled={deleteInvoice.isPending}
                render={<Button type="button" variant="destructive" />}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {messages.finance.detailPage.delete}
              </AlertDialogTrigger>
              <AlertDialogContent size="sm">
                <AlertDialogHeader>
                  <AlertDialogTitle>{messages.finance.detailPage.delete}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {messages.finance.detailPage.deleteConfirm}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleteInvoice.isPending}>
                    {messages.finance.detailPage.cancel}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={deleteInvoice.isPending}
                    onClick={() => {
                      setActionError(null)
                      deleteInvoice.mutate(id, {
                        onSuccess: () => {
                          setDeleteDialogOpen(false)
                          navigateTo("invoice.list", {})
                        },
                        onError: (error) => {
                          setActionError(
                            getMutationErrorMessage(
                              messages.finance.detailPage.deleteOnlyDraftAlert,
                            )(error),
                          )
                        },
                      })
                    }}
                  >
                    {deleteInvoice.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    {messages.finance.detailPage.delete}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Tooltip>
              {/* biome-ignore lint/a11y/noNoninteractiveTabindex: required so disabled-button tooltips remain keyboard-discoverable -- owner: finance-react; disabled Delete needs a focusable wrapper to surface its reason. */}
              <TooltipTrigger render={<span tabIndex={0} className="inline-block" />}>
                <Button
                  type="button"
                  variant="destructive"
                  disabled
                  className="pointer-events-none"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {messages.finance.detailPage.delete}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{messages.finance.detailPage.deleteOnlyDraftAlert}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      {actionError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
          {actionError}
        </div>
      ) : null}
      <AdminWidgetSlotRenderer slot="invoice.details.header" props={{ invoice }} />

      <InvoiceInfoCards
        invoice={invoice}
        bookingLabel={bookingLabel}
        personLabel={personLabel}
        organizationLabel={organizationLabel}
        onOpenBooking={() => navigateTo("booking.detail", { bookingId: invoice.bookingId })}
        onOpenPerson={(personId) => navigateTo("person.detail", { personId })}
        onOpenOrganization={(organizationId) =>
          navigateTo("organization.detail", { organizationId })
        }
      />
      <AdminWidgetSlotRenderer
        slot="invoice.details.after-summary"
        props={{ invoice, lineItems, payments, creditNotes, notes }}
      />

      <Tabs defaultValue="line-items">
        <TabsList className="max-w-full justify-start overflow-x-auto overflow-y-hidden">
          <TabsTrigger value="line-items">
            {messages.finance.detailSections.lineItemsTitle}
          </TabsTrigger>
          <TabsTrigger value="payments">
            {messages.finance.detailSections.paymentsTitle}
          </TabsTrigger>
          <TabsTrigger value="credit-notes">
            {messages.finance.detailSections.creditNotesTitle}
          </TabsTrigger>
          <TabsTrigger value="attachments">
            {messages.finance.detailSections.attachmentsTitle}
          </TabsTrigger>
          <TabsTrigger value="notes">{messages.finance.detailSections.notesTitle}</TabsTrigger>
          <TabsTrigger value="action-ledger">
            {messages.finance.detailSections.actionLedgerTitle}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="line-items">
          <InvoiceLineItemsCard
            lineItems={lineItems}
            onCreate={() => {
              setEditingLineItem(undefined)
              setLineItemDialogOpen(true)
            }}
            onEdit={(lineItem) => {
              setEditingLineItem(lineItem)
              setLineItemDialogOpen(true)
            }}
            onDelete={async (lineId) => {
              if (
                await confirmDialog({
                  description: messages.finance.detailPage.deleteLineItemConfirm,
                  destructive: true,
                })
              ) {
                setActionError(null)
                deleteLineItem.mutate(lineId, {
                  onError: (error) => {
                    setActionError(
                      getMutationErrorMessage(messages.finance.detailPage.deleteLineItemFailed)(
                        error,
                      ),
                    )
                  },
                })
              }
            }}
          />
        </TabsContent>

        <TabsContent value="payments">
          <InvoicePaymentsCard
            payments={payments}
            onCreate={() => setPaymentDialogOpen(true)}
            canCreate={invoice.status !== "void"}
          />
        </TabsContent>

        <TabsContent value="credit-notes">
          <InvoiceCreditNotesCard
            creditNotes={creditNotes}
            onCreate={() => setCreditNoteDialogOpen(true)}
            bookingId={invoice.bookingId}
            refundSettlements={refundSettlementsQuery.data?.data ?? []}
            onRefundRecorded={() => void refundSettlementsQuery.refetch()}
          />
        </TabsContent>

        <TabsContent value="attachments">
          <InvoiceAttachmentsCard invoiceId={id} />
        </TabsContent>

        <TabsContent value="notes">
          <InvoiceNotesCard notes={notes} onAddNote={() => setNoteDialogOpen(true)} />
        </TabsContent>

        <TabsContent value="action-ledger">
          <InvoiceActionLedgerCard invoiceId={invoice.id} bare />
        </TabsContent>
      </Tabs>

      <Dialog
        open={noteDialogOpen}
        onOpenChange={(open) => {
          setNoteDialogOpen(open)
          if (!open) setNoteContent("")
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{messages.finance.detailSections.addNote}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Textarea
              value={noteContent}
              onChange={(event) => setNoteContent(event.target.value)}
              placeholder={messages.finance.detailSections.addInternalNotePlaceholder}
              className="min-h-24"
            />
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setNoteDialogOpen(false)
                setNoteContent("")
              }}
            >
              {messages.finance.detailPage.cancel}
            </Button>
            <Button
              disabled={addNoteMutation.isPending || !noteContent.trim()}
              onClick={() =>
                addNoteMutation.mutate(
                  { content: noteContent.trim() },
                  {
                    onSuccess: () => {
                      setNoteContent("")
                      setNoteDialogOpen(false)
                    },
                  },
                )
              }
            >
              {addNoteMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {messages.finance.detailSections.addNote}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InvoiceDialog open={editOpen} onOpenChange={setEditOpen} invoice={invoice} />

      <LineItemDialog
        open={lineItemDialogOpen}
        onOpenChange={setLineItemDialogOpen}
        invoiceId={id}
        lineItem={editingLineItem}
        onSuccess={() => {
          setEditingLineItem(undefined)
        }}
      />

      <PaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        invoiceId={id}
        invoiceCurrency={invoice.currency}
      />

      <CreditNoteDialog
        open={creditNoteDialogOpen}
        onOpenChange={setCreditNoteDialogOpen}
        invoiceId={id}
        invoiceCurrency={invoice.currency}
      />
    </div>
  )
}
