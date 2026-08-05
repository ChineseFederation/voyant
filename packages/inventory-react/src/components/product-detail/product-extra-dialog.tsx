import {
  Button,
  Checkbox,
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
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Textarea,
} from "@voyant-travel/ui/components"
import * as React from "react"
import { type ProductExtraRecord, useProductExtraMutation } from "../../extras.js"
import { useProductDetailMessages } from "./host.js"

const selectionTypes = ["optional", "required", "default_selected", "unavailable"] as const
const pricingModes = [
  "included",
  "per_person",
  "per_booking",
  "quantity_based",
  "on_request",
  "free",
] as const

type FormState = {
  name: string
  code: string
  description: string
  selectionType: (typeof selectionTypes)[number]
  pricingMode: (typeof pricingModes)[number]
  pricedPerPerson: boolean
  minQuantity: string
  maxQuantity: string
  defaultQuantity: string
  active: boolean
}

const emptyForm: FormState = {
  name: "",
  code: "",
  description: "",
  selectionType: "optional",
  pricingMode: "per_booking",
  pricedPerPerson: false,
  minQuantity: "",
  maxQuantity: "",
  defaultQuantity: "",
  active: true,
}

function formFromExtra(extra: ProductExtraRecord): FormState {
  return {
    name: extra.name,
    code: extra.code ?? "",
    description: extra.description ?? "",
    selectionType: extra.selectionType,
    pricingMode: extra.pricingMode,
    pricedPerPerson: extra.pricedPerPerson,
    minQuantity: extra.minQuantity == null ? "" : String(extra.minQuantity),
    maxQuantity: extra.maxQuantity == null ? "" : String(extra.maxQuantity),
    defaultQuantity: extra.defaultQuantity == null ? "" : String(extra.defaultQuantity),
    active: extra.active,
  }
}

function parseNullableInt(value: string): number | null {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

type ExtraMessages = ReturnType<typeof useProductDetailMessages>["products"]["operations"]["extras"]

function getSelectionTypeLabel(value: FormState["selectionType"], messages: ExtraMessages) {
  switch (value) {
    case "optional":
      return messages.selectionOptional
    case "required":
      return messages.selectionRequired
    case "default_selected":
      return messages.selectionDefaultSelected
    case "unavailable":
      return messages.selectionUnavailable
    default:
      return value
  }
}

export function getExtraPricingModeLabel(
  value: ProductExtraRecord["pricingMode"],
  messages: ExtraMessages,
) {
  switch (value) {
    case "included":
      return messages.pricingIncluded
    case "per_person":
      return messages.pricingPerPerson
    case "per_booking":
      return messages.pricingPerBooking
    case "quantity_based":
      return messages.pricingQuantityBased
    case "on_request":
      return messages.pricingOnRequest
    case "free":
      return messages.pricingFree
    default:
      return value
  }
}

/**
 * Product Plan / Options is the only authoring entry point for an Extra, so the
 * rule about what may *not* be an Extra belongs here, in front of the operator
 * who is about to create one — not in a doc nobody opens.
 */
export function ProductExtraOwnershipGuidance({ messages }: { messages: ExtraMessages }) {
  return (
    <div className="rounded-md border bg-muted/40 p-3 text-sm">
      <div className="font-medium">{messages.ownershipGuidanceTitle}</div>
      <p className="mt-1 text-muted-foreground text-xs">{messages.ownershipGuidance}</p>
      <p className="mt-2 text-muted-foreground text-xs">{messages.ownershipGuidanceEscalation}</p>
    </div>
  )
}

export interface ProductExtraDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  productId: string
  extra?: ProductExtraRecord
  /** Sort order to use when creating a new extra. */
  nextSortOrder?: number
  onSuccess: () => void
}

/**
 * Create / edit the *definition* of a product extra (name, selection,
 * pricing mode, quantities). The extra's actual price is set separately, per
 * booking option, via the extra-price-rule editor.
 */
export function ProductExtraDialog({
  open,
  onOpenChange,
  productId,
  extra,
  nextSortOrder = 0,
  onSuccess,
}: ProductExtraDialogProps) {
  const messages = useProductDetailMessages()
  const extraMessages = messages.products.operations.extras
  const { create, update } = useProductExtraMutation()
  const [form, setForm] = React.useState<FormState>(emptyForm)
  const isEditing = !!extra

  React.useEffect(() => {
    if (open) setForm(extra ? formFromExtra(extra) : emptyForm)
  }, [open, extra])

  const save = async () => {
    const payload = {
      productId,
      name: form.name.trim(),
      code: form.code.trim() || null,
      description: form.description.trim() || null,
      selectionType: form.selectionType,
      pricingMode: form.pricingMode,
      pricedPerPerson: form.pricedPerPerson,
      minQuantity: parseNullableInt(form.minQuantity),
      maxQuantity: parseNullableInt(form.maxQuantity),
      defaultQuantity: parseNullableInt(form.defaultQuantity),
      active: form.active,
      sortOrder: extra?.sortOrder ?? nextSortOrder,
    }
    if (!payload.name) return
    if (extra) await update.mutateAsync({ id: extra.id, input: payload })
    else await create.mutateAsync(payload)
    onSuccess()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? extraMessages.editTitle : extraMessages.newTitle}</SheetTitle>
          <SheetDescription>{extraMessages.dialogDescription}</SheetDescription>
        </SheetHeader>
        <SheetBody className="grid gap-4">
          <ProductExtraOwnershipGuidance messages={extraMessages} />
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={extraMessages.nameLabel}>
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>
            <Field label={extraMessages.codeLabel}>
              <Input
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value })}
              />
            </Field>
          </div>
          <Field label={extraMessages.descriptionLabel}>
            <Textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label={extraMessages.selectionLabel}>
              <Select
                value={form.selectionType}
                onValueChange={(value) =>
                  setForm({
                    ...form,
                    selectionType: (value ?? "optional") as FormState["selectionType"],
                  })
                }
                items={selectionTypes.map((type) => ({
                  value: type,
                  label: getSelectionTypeLabel(type, extraMessages),
                }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {selectionTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {getSelectionTypeLabel(type, extraMessages)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={extraMessages.pricingLabel}>
              <Select
                value={form.pricingMode}
                onValueChange={(value) =>
                  setForm({
                    ...form,
                    pricingMode: (value ?? "per_booking") as FormState["pricingMode"],
                  })
                }
                items={pricingModes.map((mode) => ({
                  value: mode,
                  label: getExtraPricingModeLabel(mode, extraMessages),
                }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pricingModes.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {getExtraPricingModeLabel(mode, extraMessages)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={extraMessages.defaultQuantityLabel}>
              <Input
                value={form.defaultQuantity}
                type="number"
                min="0"
                onChange={(event) => setForm({ ...form, defaultQuantity: event.target.value })}
              />
            </Field>
            <Field label={extraMessages.minQuantityLabel}>
              <Input
                value={form.minQuantity}
                type="number"
                min="0"
                onChange={(event) => setForm({ ...form, minQuantity: event.target.value })}
              />
            </Field>
            <Field label={extraMessages.maxQuantityLabel}>
              <Input
                value={form.maxQuantity}
                type="number"
                min="0"
                onChange={(event) => setForm({ ...form, maxQuantity: event.target.value })}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2 text-sm">
              <Checkbox
                id="product-extra-priced-per-person"
                checked={form.pricedPerPerson}
                onCheckedChange={(checked) =>
                  setForm({ ...form, pricedPerPerson: checked === true })
                }
              />
              <Label htmlFor="product-extra-priced-per-person">
                {extraMessages.perTravelerLabel}
              </Label>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Checkbox
                id="product-extra-active"
                checked={form.active}
                onCheckedChange={(checked) => setForm({ ...form, active: checked === true })}
              />
              <Label htmlFor="product-extra-active">{extraMessages.activeLabel}</Label>
            </div>
          </div>
        </SheetBody>
        <SheetFooter className="-mx-6 -mb-6">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {extraMessages.cancel}
          </Button>
          <Button onClick={() => void save()} disabled={!form.name.trim()}>
            {isEditing ? extraMessages.saveChanges : extraMessages.create}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
