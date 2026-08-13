import { formatMessage } from "@voyant-travel/i18n"
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components"
import { DatePicker } from "@voyant-travel/ui/components/date-picker"
import { useState } from "react"
import { useFinanceUiMessagesOrDefault } from "../../i18n/index.js"
import type {
  ApServiceType,
  SupplierCostAllocationInput,
  SupplierCostAllocationRecord,
  SupplierInvoiceLineInput,
  SupplierInvoiceLineRecord,
} from "../../index.js"
import { useCostCategories } from "../../index.js"
import { AsyncCombobox, type AsyncComboboxOption } from "../async-combobox.js"
import {
  LINE_CATEGORY_NONE,
  PAYMENT_METHODS,
  parseNonNegativeCents,
  parseOptionalNonNegativeCents,
  SEARCHABLE_TARGETS,
  type SupplierInvoiceTargetSearch,
  TARGET_TYPES,
  type TargetType,
  targetIdFor,
} from "./shared.js"

export function LineDialog({
  open,
  line,
  currency,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  line: SupplierInvoiceLineRecord | null
  currency: string
  pending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: SupplierInvoiceLineInput) => void
}) {
  const t = useFinanceUiMessagesOrDefault().supplierInvoiceDetail.lineForm
  const categories = useCostCategories().data?.data ?? []
  const [description, setDescription] = useState("")
  const [serviceType, setServiceType] = useState<ApServiceType>("other")
  const [costCategoryId, setCostCategoryId] = useState<string>("")
  const [quantity, setQuantity] = useState("1")
  const [unit, setUnit] = useState("")
  const [tax, setTax] = useState("")
  const [total, setTotal] = useState("")

  // Seed when (re)opened for a specific line.
  const seedKey = open ? (line?.id ?? "new") : "closed"
  const [seeded, setSeeded] = useState<string>("closed")
  if (seedKey !== seeded) {
    setSeeded(seedKey)
    setDescription(line?.description ?? "")
    setServiceType(line?.serviceType ?? "other")
    setCostCategoryId(line?.costCategoryId ?? "")
    setQuantity(String(line?.quantity ?? 1))
    setUnit(line ? (line.unitAmountCents / 100).toFixed(2) : "")
    setTax(line ? (line.taxAmountCents / 100).toFixed(2) : "")
    setTotal(line ? (line.totalAmountCents / 100).toFixed(2) : "")
  }

  const unitCents = parseOptionalNonNegativeCents(unit)
  const taxCents = parseOptionalNonNegativeCents(tax)
  const quantityInt = Math.max(1, Number.parseInt(quantity, 10) || 1)
  const totalCents =
    unitCents != null && taxCents != null ? quantityInt * unitCents + taxCents : null
  const moneyValid = unitCents != null && taxCents != null && totalCents != null

  const submit = () => {
    if (unitCents == null || taxCents == null || totalCents == null) return
    if (!description.trim()) return
    onSubmit({
      description: description.trim(),
      serviceType,
      costCategoryId: costCategoryId || null,
      quantity: quantityInt,
      unitAmountCents: unitCents,
      taxAmountCents: taxCents,
      totalAmountCents: totalCents,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{line ? t.editTitle : t.addTitle}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-2">
            <Label>{t.description}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t.costCategory}</Label>
            <Select
              value={costCategoryId || LINE_CATEGORY_NONE}
              onValueChange={(v) => setCostCategoryId(v === LINE_CATEGORY_NONE ? "" : (v ?? ""))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={LINE_CATEGORY_NONE}>{t.costCategoryNone}</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t.quantity}</Label>
            <Input
              inputMode="numeric"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{`${t.unitAmount} (${currency})`}</Label>
            <Input
              inputMode="decimal"
              min="0"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{`${t.taxAmount} (${currency})`}</Label>
            <Input
              inputMode="decimal"
              min="0"
              value={tax}
              onChange={(e) => setTax(e.target.value)}
            />
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label>{`${t.total} (${currency})`}</Label>
            <Input
              inputMode="decimal"
              min="0"
              value={totalCents == null ? total : (totalCents / 100).toFixed(2)}
              readOnly
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            disabled={!description.trim() || !moneyValid || pending}
            onClick={submit}
          >
            {t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- allocation dialog ----------

export function AllocationDialog({
  open,
  allocation,
  currency,
  pending,
  searchTargets,
  listDeparturesForProduct,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  allocation: SupplierCostAllocationRecord | null
  currency: string
  pending: boolean
  searchTargets?: SupplierInvoiceTargetSearch
  listDeparturesForProduct?: (productId: string, query: string) => Promise<AsyncComboboxOption[]>
  onOpenChange: (open: boolean) => void
  onSubmit: (input: SupplierCostAllocationInput) => void
}) {
  const t = useFinanceUiMessagesOrDefault().supplierInvoiceDetail.allocation
  const [targetType, setTargetType] = useState<TargetType>("departure")
  const [targetId, setTargetId] = useState("")
  const [productId, setProductId] = useState("")
  const [amount, setAmount] = useState("")

  const seedKey = open ? (allocation?.id ?? "new") : "closed"
  const [seeded, setSeeded] = useState("closed")
  if (seedKey !== seeded) {
    setSeeded(seedKey)
    setTargetType(allocation?.targetType ?? "departure")
    setTargetId(
      allocation
        ? (allocation.departureId ??
            allocation.productId ??
            allocation.bookingId ??
            allocation.travelerId ??
            "")
        : "",
    )
    setProductId(allocation?.productId ?? "")
    setAmount(allocation ? (allocation.amountCents / 100).toFixed(2) : "")
  }

  // Two-step departure picker (pick product → departure) when wired.
  const twoStepDeparture =
    targetType === "departure" && Boolean(searchTargets) && Boolean(listDeparturesForProduct)

  const amountCents = parseNonNegativeCents(amount)

  const submit = () => {
    if (amountCents == null) return
    onSubmit({
      targetType,
      amountCents,
      splitMethod: "manual",
      ...targetIdFor(targetType, targetId.trim()),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.add}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label>{t.target}</Label>
            <Select
              value={targetType}
              onValueChange={(v) => {
                setTargetType((v as TargetType) ?? "departure")
                setTargetId("")
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TARGET_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t.targetTypeLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>{formatMessage(t.amountLabel, { currency })}</Label>
            <Input
              inputMode="decimal"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          {targetType === "unattributed" ? null : twoStepDeparture ? (
            <>
              <div className="col-span-2 flex flex-col gap-2">
                <Label>{t.targetTypeLabels.product}</Label>
                <AsyncCombobox
                  value={productId || null}
                  onChange={(v) => {
                    setProductId(v ?? "")
                    setTargetId("")
                  }}
                  search={(query) => searchTargets?.("product", query) ?? Promise.resolve([])}
                />
              </div>
              <div className="col-span-2 flex flex-col gap-2">
                <Label>{t.targetTypeLabels.departure}</Label>
                <AsyncCombobox
                  value={targetId || null}
                  onChange={(v) => setTargetId(v ?? "")}
                  disabled={!productId}
                  searchKey={productId}
                  search={(query) =>
                    productId
                      ? (listDeparturesForProduct?.(productId, query) ?? Promise.resolve([]))
                      : Promise.resolve([])
                  }
                />
              </div>
            </>
          ) : (
            <div className="col-span-2 flex flex-col gap-2">
              <Label>{t.targetTypeLabels[targetType]}</Label>
              {searchTargets && SEARCHABLE_TARGETS.has(targetType) ? (
                <AsyncCombobox
                  value={targetId || null}
                  onChange={(v) => setTargetId(v ?? "")}
                  search={(query) =>
                    searchTargets(
                      targetType as "departure" | "product" | "booking" | "traveler",
                      query,
                    )
                  }
                />
              ) : (
                <Input value={targetId} onChange={(e) => setTargetId(e.target.value)} />
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            disabled={
              amountCents == null || (targetType !== "unattributed" && !targetId.trim()) || pending
            }
            onClick={submit}
          >
            {pending ? t.saving : t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- payment dialog ----------

export function PaymentDialog({
  open,
  currency,
  maxAmountCents,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  currency: string
  maxAmountCents: number
  pending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: {
    amountCents: number
    paymentMethod: string
    status: "completed"
    paymentDate: string
  }) => void
}) {
  const t = useFinanceUiMessagesOrDefault().supplierInvoiceDetail.payments
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<string>("bank_transfer")
  const [date, setDate] = useState("")

  const seedKey = open ? "open" : "closed"
  const [seeded, setSeeded] = useState("closed")
  if (seedKey !== seeded) {
    setSeeded(seedKey)
    if (open) {
      setAmount("")
      setMethod("bank_transfer")
      setDate("")
    }
  }

  const amountCents = parseNonNegativeCents(amount)
  const amountValid = amountCents != null && amountCents > 0 && amountCents <= maxAmountCents

  const submit = () => {
    if (amountCents == null || amountCents <= 0 || amountCents > maxAmountCents) return
    onSubmit({
      amountCents,
      paymentMethod: method,
      status: "completed",
      paymentDate: date || new Date().toISOString().slice(0, 10),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.recordTitle}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label>{formatMessage(t.amountLabel, { currency })}</Label>
            <Input
              inputMode="decimal"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t.methodLabel}</Label>
            <Select value={method} onValueChange={(v) => setMethod(v ?? "other")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {t.methodLabels[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label>{t.dateLabel}</Label>
            <DatePicker
              value={date || null}
              onChange={(v) => setDate(v ?? "")}
              className="w-full"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" disabled={!amountValid || pending} onClick={submit}>
            {pending ? t.recording : t.record}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
