"use client"

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@voyant-travel/ui/components"
import { zodResolver } from "@voyant-travel/ui/lib/zod-resolver"
import { Loader2 } from "lucide-react"
import { useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod/v4"
import { useBookingsUiMessagesOrDefault } from "../i18n/provider.js"
import {
  type BookingRecord,
  bookingStatusOptions,
  bookingStatusSchema,
  useBookingStatusMutation,
} from "../index.js"

const statusChangeFormSchema = z.object({
  status: bookingStatusSchema,
  note: z.string().optional().nullable(),
  suppressNotifications: z.boolean(),
})

type StatusChangeFormValues = z.input<typeof statusChangeFormSchema>
type StatusChangeFormOutput = z.output<typeof statusChangeFormSchema>

export interface StatusChangeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingId: string
  currentStatus: BookingRecord["status"]
  onSuccess?: () => void
}

export function StatusChangeDialog({
  open,
  onOpenChange,
  bookingId,
  currentStatus,
  onSuccess,
}: StatusChangeDialogProps) {
  const mutation = useBookingStatusMutation(bookingId)
  const messages = useBookingsUiMessagesOrDefault()
  const statusItems = useMemo(
    () =>
      bookingStatusOptions.map((s) => ({
        value: s.value,
        label:
          messages.common.bookingStatusLabels[
            s.value as keyof typeof messages.common.bookingStatusLabels
          ] ?? s.value,
      })),
    [messages.common.bookingStatusLabels],
  )

  const form = useForm<StatusChangeFormValues, unknown, StatusChangeFormOutput>({
    resolver: zodResolver(statusChangeFormSchema),
    defaultValues: {
      status: "confirmed",
      note: "",
      suppressNotifications: false,
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        status: currentStatus,
        note: "",
        suppressNotifications: false,
      })
    }
  }, [currentStatus, form, open])

  // Customer lifecycle messages can be suppressed for cancellation and for
  // an exceptional correction back to confirmed.
  const targetStatus = form.watch("status")
  const suppressNotifications = form.watch("suppressNotifications")
  const showSuppressToggle = targetStatus === "confirmed" || targetStatus === "cancelled"

  const onSubmit = async (values: StatusChangeFormOutput) => {
    await mutation.mutateAsync({
      currentStatus,
      status: values.status,
      note: values.note || null,
      suppressNotifications: values.suppressNotifications || undefined,
    })
    onOpenChange(false)
    onSuccess?.()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{messages.statusChangeDialog.title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <DialogBody className="grid gap-4">
            <div className="flex flex-col gap-2">
              <Label>{messages.statusChangeDialog.fields.status}</Label>
              <Select
                items={statusItems}
                value={form.watch("status")}
                onValueChange={(value) =>
                  form.setValue("status", value as StatusChangeFormValues["status"])
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {bookingStatusOptions.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {
                        messages.common.bookingStatusLabels[
                          status.value as keyof typeof messages.common.bookingStatusLabels
                        ]
                      }
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>{messages.statusChangeDialog.fields.note}</Label>
              <Textarea
                {...form.register("note")}
                placeholder={messages.statusChangeDialog.placeholders.note}
              />
            </div>

            {showSuppressToggle ? (
              <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="suppress-notifications">
                    {messages.statusChangeDialog.fields.suppressNotifications}
                  </Label>
                  <Switch
                    id="suppress-notifications"
                    checked={suppressNotifications}
                    onCheckedChange={(checked) =>
                      form.setValue("suppressNotifications", checked === true)
                    }
                  />
                </div>
                <p className="text-muted-foreground text-xs">
                  {messages.statusChangeDialog.helpers.suppressNotifications}
                </p>
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {messages.common.cancel}
            </Button>
            <Button type="submit" size="sm" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {messages.statusChangeDialog.actions.updateStatus}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
