import { formatMessage } from "@voyant-travel/i18n"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@voyant-travel/ui/components"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@voyant-travel/ui/components/alert-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components/table"
import { cn } from "@voyant-travel/ui/lib/utils"
import { Download, Pencil, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { useFinanceUiMessagesOrDefault } from "../i18n/index.js"
import {
  type SupplierCostAllocationInput,
  type SupplierCostAllocationRecord,
  type SupplierInvoiceLineInput,
  type SupplierInvoiceLineRecord,
  useCostCategories,
  useSupplierInvoice,
  useSupplierInvoiceAttachments,
  useSupplierInvoiceMutation,
  useSupplierInvoicePayments,
} from "../index.js"
import { formatInvoiceAmount } from "./invoice-table-parts.js"
import {
  AllocationDialog,
  LineDialog,
  PaymentDialog,
} from "./supplier-invoice-detail-page/dialogs.js"
import type { SupplierInvoiceDetailPageProps } from "./supplier-invoice-detail-page/shared.js"
import {
  allocationToInput,
  Field,
  formatFileSize,
  lineToInput,
  STATUS_VARIANT,
} from "./supplier-invoice-detail-page/shared.js"
import { SupplierInvoiceFormDialog } from "./supplier-invoice-form-dialog.js"

export function SupplierInvoiceDetailPage({
  id,
  className,
  onBack,
  onDownloadDocument,
  uploadFile,
  onDownloadAttachment,
  searchTargets,
  listDeparturesForProduct,
  extractFromFile,
  searchSuppliers,
  createSupplier,
}: SupplierInvoiceDetailPageProps) {
  const messages = useFinanceUiMessagesOrDefault()
  const t = messages.supplierInvoiceDetail
  const statusLabels = messages.supplierInvoicesPage.statusLabels

  const { data, isPending, isError } = useSupplierInvoice(id)
  const paymentsQuery = useSupplierInvoicePayments(id)
  const attachmentsQuery = useSupplierInvoiceAttachments(id)
  const costCategories = useCostCategories().data?.data ?? []
  const categoryNameById = new Map(costCategories.map((c) => [c.id, c.name]))
  const { setAllocations, setLines, recordPayment, remove, addAttachment, removeAttachment } =
    useSupplierInvoiceMutation()
  const [uploading, setUploading] = useState(false)

  const invoice = data?.data ?? null
  const currency = invoice?.currency ?? ""

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [lineDialog, setLineDialog] = useState<{ line: SupplierInvoiceLineRecord | null } | null>(
    null,
  )
  const [allocationDialog, setAllocationDialog] = useState<{
    allocation: SupplierCostAllocationRecord | null
  } | null>(null)
  const [paymentOpen, setPaymentOpen] = useState(false)

  if (isPending) return <div className="p-6 text-muted-foreground">{t.loading}</div>
  if (isError || !invoice) return <div className="p-6 text-destructive">{t.notFound}</div>

  // Whole-invoice allocations (per-line allocation is a future mode).
  const allocationList = invoice.allocations.filter((a) => a.supplierInvoiceLineId == null)
  const allocatedCents = allocationList.reduce((sum, a) => sum + a.amountCents, 0)
  const remainderCents = invoice.totalCents - allocatedCents
  const overAllocated = invoice.totalCents >= 0 && remainderCents < 0

  // Lines + allocations are edited via the full-replace mutations.
  const persistLines = (lines: SupplierInvoiceLineInput[]) => setLines.mutate({ id, lines })
  const removeLine = (lineId: string) =>
    persistLines(invoice.lines.filter((l) => l.id !== lineId).map(lineToInput))

  const persistAllocations = (allocations: SupplierCostAllocationInput[]) =>
    setAllocations.mutate({ id, allocations })
  const removeAllocation = (allocationId: string) =>
    persistAllocations(allocationList.filter((a) => a.id !== allocationId).map(allocationToInput))

  const allocationTargetId = (a: SupplierCostAllocationRecord) =>
    a.departureId ?? a.productId ?? a.bookingId ?? a.travelerId ?? ""

  const methodLabel = (method: string) =>
    (t.payments.methodLabels as Record<string, string>)[method] ?? method

  const payments = paymentsQuery.data?.data ?? []
  const attachments = attachmentsQuery.data?.data ?? []

  const handleUpload = async (files: FileList | null) => {
    if (!uploadFile || !files || files.length === 0) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const uploaded = await uploadFile(file)
        await addAttachment.mutateAsync({
          id,
          input: {
            name: file.name,
            mimeType: uploaded.mimeType ?? file.type ?? null,
            fileSize: uploaded.fileSize ?? file.size,
            storageKey: uploaded.storageKey,
          },
        })
      }
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {/* Actions (breadcrumb lives in the app shell) */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="size-4" />
          {t.actions.edit}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="size-4" />
          {t.actions.delete}
        </Button>
      </div>

      {/* Header */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">{invoice.supplierInvoiceNo}</CardTitle>
            <p className="text-sm text-muted-foreground" title={invoice.supplierId}>
              {invoice.supplierName ?? invoice.supplierId}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[invoice.status]}>{statusLabels[invoice.status]}</Badge>
            {invoice.storageKey ? (
              <Button variant="outline" size="sm" onClick={onDownloadDocument}>
                <Download className="size-4" />
                {t.document}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Field
            label={t.summary.subtotal}
            value={formatInvoiceAmount(invoice.subtotalCents, currency)}
          />
          <Field label={t.summary.tax} value={formatInvoiceAmount(invoice.taxCents, currency)} />
          <Field
            label={t.summary.total}
            value={formatInvoiceAmount(invoice.totalCents, currency)}
          />
          <Field label={t.summary.paid} value={formatInvoiceAmount(invoice.paidCents, currency)} />
          <Field
            label={t.summary.balanceDue}
            value={formatInvoiceAmount(invoice.balanceDueCents, currency)}
          />
          <Field label={t.summary.issueDate} value={invoice.issueDate} />
          <Field label={t.summary.dueDate} value={invoice.dueDate ?? t.summary.noValue} />
        </CardContent>
      </Card>

      {/* Lines */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t.lines.title}</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setLineDialog({ line: null })}>
            <Plus className="size-4" />
            {t.lines.add}
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.lines.description}</TableHead>
                <TableHead>{t.lines.service}</TableHead>
                <TableHead className="text-right">{t.lines.qty}</TableHead>
                <TableHead className="text-right">{t.lines.unit}</TableHead>
                <TableHead className="text-right">{t.lines.tax}</TableHead>
                <TableHead className="text-right">{t.lines.total}</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    {t.lines.empty}
                  </TableCell>
                </TableRow>
              ) : (
                invoice.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>{line.description}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {(line.costCategoryId && categoryNameById.get(line.costCategoryId)) ??
                        t.lineForm.serviceTypeLabels[line.serviceType]}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatInvoiceAmount(line.unitAmountCents, currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatInvoiceAmount(line.taxAmountCents, currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatInvoiceAmount(line.totalAmountCents, currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setLineDialog({ line })}
                        aria-label={t.lines.edit}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLine(line.id)}
                        aria-label={t.lines.remove}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Cost allocation */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t.allocation.title}</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAllocationDialog({ allocation: null })}
          >
            <Plus className="size-4" />
            {t.allocation.add}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.allocation.target}</TableHead>
                <TableHead>{t.allocation.reference}</TableHead>
                <TableHead className="text-right">{t.payments.amount}</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocationList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {t.allocation.none}
                  </TableCell>
                </TableRow>
              ) : (
                allocationList.map((allocation) => (
                  <TableRow key={allocation.id}>
                    <TableCell>{t.allocation.targetTypeLabels[allocation.targetType]}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {allocation.targetLabel ?? allocationTargetId(allocation) ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatInvoiceAmount(allocation.amountCents, currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setAllocationDialog({ allocation })}
                        aria-label={t.actions.edit}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeAllocation(allocation.id)}
                        aria-label={t.lines.remove}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="border-t pt-3 text-sm">
            <span className={cn("text-muted-foreground", overAllocated && "text-destructive")}>
              {overAllocated
                ? formatMessage(t.allocation.overAllocated, {
                    amount: formatInvoiceAmount(-remainderCents, currency),
                  })
                : formatMessage(t.allocation.remainder, {
                    amount: formatInvoiceAmount(remainderCents, currency),
                  })}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Payments */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t.payments.title}</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setPaymentOpen(true)}>
            <Plus className="size-4" />
            {t.payments.record}
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.payments.date}</TableHead>
                <TableHead>{t.payments.method}</TableHead>
                <TableHead>{t.payments.status}</TableHead>
                <TableHead className="text-right">{t.payments.amount}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {t.payments.empty}
                  </TableCell>
                </TableRow>
              ) : (
                payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{payment.paymentDate}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {methodLabel(payment.paymentMethod)}
                    </TableCell>
                    <TableCell>{payment.status}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatInvoiceAmount(payment.amountCents, payment.currency)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Attachments */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t.attachments.title}</CardTitle>
          {uploadFile ? (
            <label className="cursor-pointer">
              <span className="inline-flex h-8 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-muted">
                <Plus className="size-4" />
                {uploading ? t.attachments.uploading : t.attachments.upload}
              </span>
              <input
                type="file"
                multiple
                className="sr-only"
                disabled={uploading}
                onChange={(e) => {
                  void handleUpload(e.target.files)
                  e.target.value = ""
                }}
              />
            </label>
          ) : null}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.attachments.name}</TableHead>
                <TableHead className="text-right">{t.attachments.size}</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {attachments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    {t.attachments.empty}
                  </TableCell>
                </TableRow>
              ) : (
                attachments.map((attachment) => (
                  <TableRow key={attachment.id}>
                    <TableCell>{attachment.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatFileSize(attachment.fileSize)}
                    </TableCell>
                    <TableCell className="text-right">
                      {onDownloadAttachment && attachment.storageKey ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDownloadAttachment(attachment.id)}
                          aria-label={t.attachments.download}
                        >
                          <Download className="size-4" />
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeAttachment.mutate({ id, attachmentId: attachment.id })}
                        aria-label={t.attachments.remove}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <SupplierInvoiceFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        invoice={invoice}
        extractFromFile={extractFromFile}
        searchSuppliers={searchSuppliers}
        createSupplier={createSupplier}
      />

      <LineDialog
        open={lineDialog != null}
        line={lineDialog?.line ?? null}
        currency={currency}
        pending={setLines.isPending}
        onOpenChange={(open) => setLineDialog(open ? (lineDialog ?? { line: null }) : null)}
        onSubmit={(input) => {
          const existing = invoice.lines.map(lineToInput)
          const editing = lineDialog?.line
          const next = editing
            ? invoice.lines.map((l) => (l.id === editing.id ? input : lineToInput(l)))
            : [...existing, input]
          persistLines(next)
          setLineDialog(null)
        }}
      />

      <AllocationDialog
        open={allocationDialog != null}
        allocation={allocationDialog?.allocation ?? null}
        currency={currency}
        pending={setAllocations.isPending}
        searchTargets={searchTargets}
        listDeparturesForProduct={listDeparturesForProduct}
        onOpenChange={(open) =>
          setAllocationDialog(open ? (allocationDialog ?? { allocation: null }) : null)
        }
        onSubmit={(input) => {
          const editing = allocationDialog?.allocation
          const next = editing
            ? allocationList.map((a) => (a.id === editing.id ? input : allocationToInput(a)))
            : [...allocationList.map(allocationToInput), input]
          persistAllocations(next)
          setAllocationDialog(null)
        }}
      />

      <PaymentDialog
        open={paymentOpen}
        currency={currency}
        maxAmountCents={Math.max(0, invoice.balanceDueCents)}
        pending={recordPayment.isPending}
        onOpenChange={setPaymentOpen}
        onSubmit={(input) => {
          recordPayment.mutate(
            { id, input: { ...input, currency } },
            { onSuccess: () => setPaymentOpen(false) },
          )
        }}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteDialog.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.deleteDialog.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => remove.mutate(id, { onSuccess: () => onBack?.() })}
              disabled={remove.isPending}
            >
              {t.deleteDialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------- line dialog ----------

export type {
  SupplierInvoiceAttachmentUpload,
  SupplierInvoiceDetailPageProps,
  SupplierInvoiceTargetSearch,
} from "./supplier-invoice-detail-page/shared.js"
