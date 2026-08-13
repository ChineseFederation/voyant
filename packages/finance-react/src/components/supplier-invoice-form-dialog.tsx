import { formatMessage } from "@voyant-travel/i18n"
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Textarea,
} from "@voyant-travel/ui/components"
import { CurrencyCombobox } from "@voyant-travel/ui/components/currency-combobox"
import { DatePicker } from "@voyant-travel/ui/components/date-picker"
import { cn } from "@voyant-travel/ui/lib/utils"
import { Upload } from "lucide-react"
import { useEffect, useState } from "react"
import { useFinanceUiMessagesOrDefault } from "../i18n/index.js"
import {
  type SupplierInvoiceRecord,
  type SupplierInvoiceStatus,
  useSupplierInvoiceMutation,
} from "../index.js"
import { AsyncCombobox, type AsyncComboboxOption } from "./async-combobox.js"
import { parseNonNegativeCents } from "./supplier-invoice-detail-page/shared.js"

const STATUS_ORDER: SupplierInvoiceStatus[] = [
  "draft",
  "received",
  "approved",
  "partially_paid",
  "paid",
  "disputed",
  "void",
]

/**
 * Header fields an extractor may return to prefill the form. All optional —
 * the operator only overrides the fields it could resolve; the user confirms
 * before saving.
 */
export interface SupplierInvoiceExtraction {
  supplierInvoiceNo?: string | null
  supplierId?: string | null
  status?: SupplierInvoiceStatus | null
  currency?: string | null
  issueDate?: string | null
  dueDate?: string | null
  internalRef?: string | null
  notes?: string | null
}

export interface SupplierInvoiceFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present → edit mode; absent → create mode. */
  invoice?: SupplierInvoiceRecord
  onSaved?: (id: string) => void
  /**
   * Extension point: extract header fields from an uploaded invoice file
   * (AI/OCR/whatever the deployment wires). When provided, an upload control
   * appears that prefills the form for the user to confirm. Omit it (the
   * default) and no extraction UI is shown.
   */
  extractFromFile?: (file: File) => Promise<SupplierInvoiceExtraction>
  /**
   * Search the suppliers module for the supplier picker. The selected option's
   * value is stored as the invoice's `supplierId` (a loose text reference — no
   * cross-module FK). When omitted, a plain text input is shown instead.
   */
  searchSuppliers?: (query: string) => Promise<AsyncComboboxOption[]>
  /**
   * Create a supplier inline from the picker. Receives the typed name, returns
   * the new option (whose value becomes the stored `supplierId`). Only offered
   * when both this and `searchSuppliers` are provided.
   */
  createSupplier?: (name: string) => Promise<AsyncComboboxOption | null>
  /**
   * Search the products module for the create dialog's product picker. When
   * provided (create mode only), the operator can attribute the invoice to a
   * product — and, with `listDeparturesForProduct`, to one of its departures.
   * On save this emits a whole-invoice cost allocation seeded from the total.
   */
  searchProducts?: (query: string) => Promise<AsyncComboboxOption[]>
  /**
   * List a product's departures for the create dialog's two-step picker (pick
   * product, then departure). Only used alongside `searchProducts`.
   */
  listDeparturesForProduct?: (productId: string, query: string) => Promise<AsyncComboboxOption[]>
}

interface FormState {
  supplierInvoiceNo: string
  supplierId: string
  status: SupplierInvoiceStatus
  currency: string
  issueDate: string
  dueDate: string
  internalRef: string
  notes: string
  // Create-mode attribution (whole-invoice cost allocation).
  productId: string
  departureId: string
  total: string
}

function seed(invoice?: SupplierInvoiceRecord): FormState {
  return {
    supplierInvoiceNo: invoice?.supplierInvoiceNo ?? "",
    supplierId: invoice?.supplierId ?? "",
    status: invoice?.status ?? "draft",
    currency: invoice?.currency ?? "EUR",
    issueDate: invoice?.issueDate ?? "",
    dueDate: invoice?.dueDate ?? "",
    internalRef: invoice?.internalRef ?? "",
    notes: invoice?.notes ?? "",
    productId: "",
    departureId: "",
    total: "",
  }
}

export function SupplierInvoiceFormDialog({
  open,
  onOpenChange,
  invoice,
  onSaved,
  extractFromFile,
  searchSuppliers,
  createSupplier,
  searchProducts,
  listDeparturesForProduct,
}: SupplierInvoiceFormDialogProps) {
  const messages = useFinanceUiMessagesOrDefault()
  const t = messages.supplierInvoiceDetail.form
  const statusLabels = messages.supplierInvoicesPage.statusLabels
  const { create, update } = useSupplierInvoiceMutation()
  const isEdit = Boolean(invoice)
  const pending = create.isPending || update.isPending

  const [form, setForm] = useState<FormState>(() => seed(invoice))
  const [extracting, setExtracting] = useState(false)

  const handleExtract = async (file: File | undefined) => {
    if (!file || !extractFromFile) return
    setExtracting(true)
    try {
      const x = await extractFromFile(file)
      setForm((prev) => ({
        ...prev,
        supplierInvoiceNo: x.supplierInvoiceNo ?? prev.supplierInvoiceNo,
        supplierId: x.supplierId ?? prev.supplierId,
        status: x.status ?? prev.status,
        currency: x.currency ?? prev.currency,
        issueDate: x.issueDate ?? prev.issueDate,
        dueDate: x.dueDate ?? prev.dueDate,
        internalRef: x.internalRef ?? prev.internalRef,
        notes: x.notes ?? prev.notes,
      }))
    } finally {
      setExtracting(false)
    }
  }

  // Re-seed when the dialog opens or the target invoice changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-seed on open/target change only -- owner: finance-react; existing suppression is intentional pending typed cleanup.
  useEffect(() => {
    if (open) setForm(seed(invoice))
  }, [open, invoice?.id])

  const set = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }))

  const totalCents = parseNonNegativeCents(form.total)
  const hasTotal = form.total.trim().length > 0
  const totalValid = !hasTotal || totalCents != null
  const allocationNeedsTotal = !isEdit && Boolean(form.productId || form.departureId)
  const canSave =
    form.supplierInvoiceNo.trim() &&
    form.supplierId.trim() &&
    form.issueDate &&
    totalValid &&
    (!allocationNeedsTotal || totalCents != null)

  const submit = () => {
    if (!canSave) return
    const payload = {
      supplierId: form.supplierId.trim(),
      supplierInvoiceNo: form.supplierInvoiceNo.trim(),
      status: form.status,
      currency: form.currency.trim().toUpperCase(),
      issueDate: form.issueDate,
      dueDate: form.dueDate || null,
      internalRef: form.internalRef.trim() || null,
      notes: form.notes.trim() || null,
    }
    const onDone = (id: string) => {
      onOpenChange(false)
      onSaved?.(id)
    }
    if (invoice) {
      update.mutate(
        { id: invoice.id, input: payload },
        { onSuccess: (row) => onDone(row?.id ?? invoice.id) },
      )
    } else {
      // Attribute the whole invoice to the picked departure (or, failing that,
      // product) as a single manual cost allocation, seeded with the total.
      const allocations = form.departureId
        ? [
            {
              targetType: "departure" as const,
              departureId: form.departureId,
              amountCents: totalCents ?? 0,
              splitMethod: "manual" as const,
            },
          ]
        : form.productId
          ? [
              {
                targetType: "product" as const,
                productId: form.productId,
                amountCents: totalCents ?? 0,
                splitMethod: "manual" as const,
              },
            ]
          : undefined
      const lines =
        totalCents != null
          ? [
              {
                description: form.supplierInvoiceNo.trim(),
                serviceType: "other" as const,
                quantity: 1,
                unitAmountCents: totalCents,
                taxAmountCents: 0,
                totalAmountCents: totalCents,
              },
            ]
          : undefined
      create.mutate(
        {
          ...payload,
          ...(totalCents != null ? { totalCents, lines } : {}),
          ...(allocations ? { allocations } : {}),
        },
        { onSuccess: (row) => row && onDone(row.id) },
      )
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="data-[side=right]:w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {isEdit ? t.editTitle : messages.supplierInvoicesPage.recordInvoice}
          </SheetTitle>
        </SheetHeader>
        <SheetBody className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {extractFromFile ? (
            <label className="col-span-2 cursor-pointer">
              <span className="inline-flex h-9 items-center gap-2 rounded-md border border-dashed px-3 text-sm font-medium hover:bg-muted">
                <Upload className="size-4" />
                {extracting ? t.extracting : t.extractUpload}
              </span>
              <input
                type="file"
                className="sr-only"
                disabled={extracting}
                onChange={(e) => {
                  void handleExtract(e.target.files?.[0])
                  e.target.value = ""
                }}
              />
            </label>
          ) : null}
          <Field label={t.supplierInvoiceNo}>
            <Input
              value={form.supplierInvoiceNo}
              onChange={(e) => set({ supplierInvoiceNo: e.target.value })}
            />
          </Field>
          <Field label={t.supplierId}>
            {searchSuppliers ? (
              <AsyncCombobox
                value={form.supplierId || null}
                onChange={(v) => set({ supplierId: v ?? "" })}
                search={searchSuppliers}
                onCreate={createSupplier}
                createLabel={(name) => formatMessage(t.supplierCreate, { name })}
                placeholder={t.supplierSearchPlaceholder}
              />
            ) : (
              <Input
                value={form.supplierId}
                onChange={(e) => set({ supplierId: e.target.value })}
              />
            )}
          </Field>
          <Field label={t.status}>
            <Select
              value={form.status}
              onValueChange={(v) => set({ status: (v as SupplierInvoiceStatus) ?? "received" })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabels[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t.currency}>
            <CurrencyCombobox
              value={form.currency || null}
              onChange={(v) => set({ currency: v ?? "" })}
              className="w-full"
            />
          </Field>
          <Field label={t.issueDate}>
            <DatePicker
              value={form.issueDate || null}
              onChange={(v) => set({ issueDate: v ?? "" })}
              className="w-full"
            />
          </Field>
          <Field label={t.dueDate}>
            <DatePicker
              value={form.dueDate || null}
              onChange={(v) => set({ dueDate: v ?? "" })}
              className="w-full"
            />
          </Field>
          {!isEdit && searchProducts ? (
            <>
              <Field label={t.product} className="col-span-2">
                <AsyncCombobox
                  value={form.productId || null}
                  onChange={(v) => set({ productId: v ?? "", departureId: "" })}
                  search={searchProducts}
                  placeholder={t.productSearchPlaceholder}
                />
              </Field>
              {listDeparturesForProduct ? (
                <Field label={t.departure} className="col-span-2">
                  <AsyncCombobox
                    // Re-resolve when the product changes so stale departures
                    // from the previous product can't be offered/selected.
                    searchKey={form.productId}
                    value={form.departureId || null}
                    onChange={(v) => set({ departureId: v ?? "" })}
                    disabled={!form.productId}
                    search={(query) =>
                      form.productId
                        ? listDeparturesForProduct(form.productId, query)
                        : Promise.resolve([])
                    }
                    placeholder={t.departureSearchPlaceholder}
                  />
                </Field>
              ) : null}
              <Field
                label={formatMessage(t.totalLabel, { currency: form.currency || "" })}
                className="col-span-2"
              >
                <Input
                  inputMode="decimal"
                  min="0"
                  value={form.total}
                  onChange={(e) => set({ total: e.target.value })}
                />
              </Field>
            </>
          ) : null}
          <Field label={t.internalRef} className="col-span-2">
            <Input
              value={form.internalRef}
              onChange={(e) => set({ internalRef: e.target.value })}
            />
          </Field>
          <Field label={t.notes} className="col-span-2">
            <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </SheetBody>
        <SheetFooter>
          <Button type="button" disabled={!canSave || pending} onClick={submit}>
            {pending ? t.saving : t.save}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}
