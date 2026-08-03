"use client"

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
import { CurrencyInput } from "@voyant-travel/ui/components/currency-input"
import { DatePicker } from "@voyant-travel/ui/components/date-picker"
import { zodResolver } from "@voyant-travel/ui/lib/zod-resolver"
import { Loader2 } from "lucide-react"
import { useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod/v4"
import { useBookingsUiMessagesOrDefault } from "../i18n/provider.js"
import { type BookingItemRecord, useBookingItemMutation } from "../index.js"

const itemTypes = [
  "unit",
  "extra",
  "service",
  "fee",
  "tax",
  "discount",
  "adjustment",
  "accommodation",
  "transport",
  "other",
] as const

const DEFAULT_CURRENCY = "EUR" // i18n-literal-ok ISO default currency

function createBookingItemFormSchema(messages: ReturnType<typeof useBookingsUiMessagesOrDefault>) {
  return z
    .object({
      title: z.string().min(1, messages.bookingItemDialog.validation.titleRequired),
      itemType: z.enum(itemTypes).default("unit"),
      quantity: z.coerce.number().int().positive().default(1),
      sellCurrency: z.string().min(3).max(3).default("EUR"),
      unitSellAmountCents: z.coerce.number().int().optional().nullable(),
      totalSellAmountCents: z.coerce.number().int().optional().nullable(),
      costCurrency: z.string().min(3).max(3).optional().nullable(),
      unitCostAmountCents: z.coerce.number().int().optional().nullable(),
      totalCostAmountCents: z.coerce.number().int().optional().nullable(),
      serviceDate: z.string().optional().nullable(),
      description: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    })
    .superRefine((value, ctx) => {
      const hasCostAmount = value.unitCostAmountCents != null || value.totalCostAmountCents != null
      if (hasCostAmount && !value.costCurrency) {
        ctx.addIssue({
          code: "custom",
          message: messages.bookingItemDialog.validation.costCurrencyRequired,
          path: ["costCurrency"],
        })
      }
    })
}

type BookingItemFormValues = z.input<ReturnType<typeof createBookingItemFormSchema>>
type BookingItemFormOutput = z.output<ReturnType<typeof createBookingItemFormSchema>>

export interface BookingItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingId: string
  item?: BookingItemRecord
  onSuccess?: () => void
}

export function BookingItemDialog({
  open,
  onOpenChange,
  bookingId,
  item,
  onSuccess,
}: BookingItemDialogProps) {
  const isEditing = Boolean(item)
  const { create, update } = useBookingItemMutation(bookingId)
  const messages = useBookingsUiMessagesOrDefault()
  const bookingItemFormSchema = createBookingItemFormSchema(messages)
  const typeItems = useMemo(
    () =>
      itemTypes.map((t) => ({
        value: t,
        label: messages.bookingItemDialog.itemTypeLabels[t],
      })),
    [messages.bookingItemDialog.itemTypeLabels],
  )

  const form = useForm<BookingItemFormValues, unknown, BookingItemFormOutput>({
    resolver: zodResolver(bookingItemFormSchema),
    defaultValues: {
      title: "",
      itemType: "unit",
      quantity: 1,
      sellCurrency: DEFAULT_CURRENCY,
      unitSellAmountCents: null,
      totalSellAmountCents: null,
      costCurrency: null,
      unitCostAmountCents: null,
      totalCostAmountCents: null,
      serviceDate: "",
      description: "",
      notes: "",
    },
  })

  // `form` is intentionally omitted from deps — react-hook-form returns
  // a fresh wrapper object on every render even though the underlying
  // state lives in a ref. Including `form` here would re-run the effect
  // on every render and re-trigger reset → re-render → loop. The methods
  // we call (`reset`) are safe to call from a stale closure since they
  // dispatch into the form's internal store.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above -- owner: bookings-react; existing suppression is intentional pending typed cleanup.
  useEffect(() => {
    if (open && item) {
      form.reset({
        title: item.title,
        itemType: item.itemType,
        quantity: item.quantity,
        sellCurrency: item.sellCurrency,
        unitSellAmountCents: item.unitSellAmountCents,
        totalSellAmountCents: item.totalSellAmountCents,
        costCurrency: item.costCurrency,
        unitCostAmountCents: item.unitCostAmountCents,
        totalCostAmountCents: item.totalCostAmountCents,
        serviceDate: item.serviceDate ?? "",
        description: item.description ?? "",
        notes: item.notes ?? "",
      })
    } else if (open) {
      form.reset()
    }
  }, [open, item])

  const onSubmit = async (values: BookingItemFormOutput) => {
    const payload = {
      title: values.title,
      itemType: values.itemType,
      quantity: values.quantity,
      sellCurrency: values.sellCurrency,
      unitSellAmountCents: values.unitSellAmountCents ?? null,
      totalSellAmountCents: values.totalSellAmountCents ?? null,
      costCurrency: values.costCurrency || null,
      unitCostAmountCents: values.unitCostAmountCents ?? null,
      totalCostAmountCents: values.totalCostAmountCents ?? null,
      serviceDate: values.serviceDate || null,
      description: values.description || null,
      notes: values.notes || null,
    }

    if (isEditing) {
      await update.mutateAsync({ id: item!.id, input: payload })
    } else {
      await create.mutateAsync(payload)
    }

    onOpenChange(false)
    onSuccess?.()
  }

  const isSubmitting = create.isPending || update.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>
            {isEditing
              ? messages.bookingItemDialog.titles.edit
              : messages.bookingItemDialog.titles.create}
          </SheetTitle>
        </SheetHeader>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <SheetBody className="grid gap-4">
            <div className="flex flex-col gap-2">
              <Label>{messages.bookingItemDialog.fields.title}</Label>
              <Input
                {...form.register("title")}
                placeholder={messages.bookingItemDialog.placeholders.title}
              />
              {form.formState.errors.title && (
                <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="flex flex-col gap-2">
                <Label>{messages.bookingItemDialog.fields.type}</Label>
                <Select
                  items={typeItems}
                  value={form.watch("itemType")}
                  onValueChange={(v) => form.setValue("itemType", v as (typeof itemTypes)[number])}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {itemTypes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {messages.bookingItemDialog.itemTypeLabels[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>{messages.bookingItemDialog.fields.quantity}</Label>
                <Input {...form.register("quantity")} type="number" min={1} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="flex flex-col gap-2">
                <Label>{messages.bookingItemDialog.fields.sellCurrency}</Label>
                <CurrencyCombobox
                  value={form.watch("sellCurrency") || null}
                  onChange={(next) =>
                    form.setValue("sellCurrency", next ?? DEFAULT_CURRENCY, {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>{messages.bookingItemDialog.fields.unitSellAmountCents}</Label>
                <CurrencyInput
                  value={form.watch("unitSellAmountCents") as number | null}
                  onChange={(next) =>
                    form.setValue("unitSellAmountCents", next, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  currency={form.watch("sellCurrency")}
                  placeholder={messages.bookingItemDialog.placeholders.unitSellAmountCents}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>{messages.bookingItemDialog.fields.totalSellAmountCents}</Label>
                <CurrencyInput
                  value={form.watch("totalSellAmountCents") as number | null}
                  onChange={(next) =>
                    form.setValue("totalSellAmountCents", next, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  currency={form.watch("sellCurrency")}
                  placeholder={messages.bookingItemDialog.placeholders.totalSellAmountCents}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="flex flex-col gap-2">
                <Label>{messages.bookingItemDialog.fields.costCurrency}</Label>
                <CurrencyCombobox
                  value={form.watch("costCurrency") || null}
                  onChange={(next) =>
                    form.setValue("costCurrency", next ?? null, {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }
                />
                {form.formState.errors.costCurrency && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.costCurrency.message}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label>{messages.bookingItemDialog.fields.unitCostAmountCents}</Label>
                <CurrencyInput
                  value={form.watch("unitCostAmountCents") as number | null}
                  onChange={(next) =>
                    form.setValue("unitCostAmountCents", next, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  currency={form.watch("costCurrency")}
                  placeholder={messages.bookingItemDialog.placeholders.unitCostAmountCents}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>{messages.bookingItemDialog.fields.totalCostAmountCents}</Label>
                <CurrencyInput
                  value={form.watch("totalCostAmountCents") as number | null}
                  onChange={(next) =>
                    form.setValue("totalCostAmountCents", next, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  currency={form.watch("costCurrency")}
                  placeholder={messages.bookingItemDialog.placeholders.totalCostAmountCents}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>{messages.bookingItemDialog.fields.serviceDate}</Label>
              <DatePicker
                value={form.watch("serviceDate") || null}
                onChange={(next) =>
                  form.setValue("serviceDate", next ?? "", {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
                placeholder={messages.bookingItemDialog.placeholders.serviceDate}
                className="w-full"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>{messages.bookingItemDialog.fields.description}</Label>
              <Textarea
                {...form.register("description")}
                placeholder={messages.bookingItemDialog.placeholders.description}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>{messages.bookingItemDialog.fields.notes}</Label>
              <Textarea
                {...form.register("notes")}
                placeholder={messages.bookingItemDialog.placeholders.notes}
              />
            </div>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {messages.common.cancel}
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? messages.common.saveChanges : messages.bookingItemDialog.actions.addItem}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
