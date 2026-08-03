"use client"

import {
  Button,
  Input,
  Label,
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
import { DateRangePicker } from "@voyant-travel/ui/components/date-picker"
import { zodResolver } from "@voyant-travel/ui/lib/zod-resolver"
import { Loader2 } from "lucide-react"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod/v4"
import { useBookingsUiMessagesOrDefault } from "../i18n/provider.js"
import { type BookingRecord, useBookingMutation } from "../index.js"

function createBookingFormSchema(messages: ReturnType<typeof useBookingsUiMessagesOrDefault>) {
  return z.object({
    bookingNumber: z.string().min(1, messages.bookingDialog.validation.bookingNumberRequired),
    sellCurrency: z.string().min(3).max(3, messages.bookingDialog.validation.sellCurrencyInvalid),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    pax: z.coerce.number().int().positive().optional().or(z.literal("")).nullable(),
    internalNotes: z.string().optional().nullable(),
  })
}

type BookingFormValues = z.input<ReturnType<typeof createBookingFormSchema>>
type BookingFormOutput = z.output<ReturnType<typeof createBookingFormSchema>>

export interface BookingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  booking: BookingRecord
  onSuccess?: (booking: BookingRecord) => void
}

const DEFAULT_CURRENCY = "EUR" // i18n-literal-ok ISO default currency
const noopCurrencyChange = (_value: number | null) => {}

/**
 * Existing-booking editor. Booking creation is admitted only through the
 * durable Finance Tool command.
 */
export function BookingDialog({ open, onOpenChange, booking, onSuccess }: BookingDialogProps) {
  return (
    <BookingEditDialog
      open={open}
      onOpenChange={onOpenChange}
      booking={booking}
      onSuccess={onSuccess}
    />
  )
}

interface BookingEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  booking: BookingRecord
  onSuccess?: (booking: BookingRecord) => void
}

function BookingEditDialog({ open, onOpenChange, booking, onSuccess }: BookingEditDialogProps) {
  const { update } = useBookingMutation()
  const messages = useBookingsUiMessagesOrDefault()
  const bookingFormSchema = createBookingFormSchema(messages)

  const form = useForm<BookingFormValues, unknown, BookingFormOutput>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      bookingNumber: "",
      sellCurrency: DEFAULT_CURRENCY,
      startDate: "",
      endDate: "",
      pax: "",
      internalNotes: "",
    },
  })

  useEffect(() => {
    if (!open) return
    form.reset({
      bookingNumber: booking.bookingNumber,
      sellCurrency: booking.sellCurrency,
      startDate: booking.startDate ?? "",
      endDate: booking.endDate ?? "",
      pax: booking.pax ?? "",
      internalNotes: booking.internalNotes ?? "",
    })
  }, [booking, form, open])

  const onSubmit = async (values: BookingFormOutput) => {
    const payload = {
      bookingNumber: values.bookingNumber,
      sellCurrency: values.sellCurrency,
      startDate: values.startDate || null,
      endDate: values.endDate || null,
      pax: values.pax && typeof values.pax === "number" ? values.pax : null,
      internalNotes: values.internalNotes || null,
    }

    const saved = await update.mutateAsync({ id: booking.id, input: payload })

    onOpenChange(false)
    onSuccess?.(saved)
  }

  const isSubmitting = update.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>{messages.bookingDialog.editTitle}</SheetTitle>
        </SheetHeader>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <SheetBody className="grid gap-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="flex flex-col gap-2">
                <Label>{messages.bookingDialog.fields.bookingNumber}</Label>
                <Input
                  {...form.register("bookingNumber")}
                  placeholder={messages.bookingDialog.placeholders.bookingNumber}
                />
                {form.formState.errors.bookingNumber && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.bookingNumber.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>{messages.bookingDialog.fields.sellCurrency}</Label>
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
                <Label>{messages.bookingDialog.fields.travelDates}</Label>
                <DateRangePicker
                  value={{
                    from: form.watch("startDate") || null,
                    to: form.watch("endDate") || null,
                  }}
                  onChange={(nextValue) => {
                    form.setValue("startDate", nextValue?.from ?? "", { shouldDirty: true })
                    form.setValue("endDate", nextValue?.to ?? "", { shouldDirty: true })
                  }}
                  placeholder={messages.bookingDialog.placeholders.travelDates}
                  className="w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="flex flex-col gap-2">
                <Label>{messages.bookingDialog.fields.sellAmountCents}</Label>
                <CurrencyInput
                  value={booking.sellAmountCents}
                  onChange={noopCurrencyChange}
                  currency={form.watch("sellCurrency")}
                  disabled
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>{messages.bookingDialog.fields.costAmountCents}</Label>
                <CurrencyInput
                  value={booking.costAmountCents}
                  onChange={noopCurrencyChange}
                  currency={form.watch("sellCurrency")}
                  disabled
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>{messages.bookingDialog.fields.pax}</Label>
                <Input
                  {...form.register("pax")}
                  type="number"
                  min="1"
                  placeholder={messages.bookingDialog.placeholders.pax}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>{messages.bookingDialog.fields.internalNotes}</Label>
              <Textarea
                {...form.register("internalNotes")}
                placeholder={messages.bookingDialog.placeholders.internalNotes}
              />
            </div>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {messages.common.cancel}
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {messages.common.saveChanges}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
