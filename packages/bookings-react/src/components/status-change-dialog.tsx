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

/**
 * `notifyCustomer` is the positive form of the wire flag: the service takes
 * `suppressNotifications`, so the form default is "on" and only an explicit
 * opt-out sends anything. Sending is the safe default — a forgotten flag
 * produces a redundant email rather than a customer who is never told.
 */
const statusChangeFormSchema = z.object({
  status: bookingStatusSchema,
  note: z.string().optional().nullable(),
  notifyCustomer: z.boolean(),
})

type StatusChangeFormValues = z.input<typeof statusChangeFormSchema>
type StatusChangeFormOutput = z.output<typeof statusChangeFormSchema>

export interface StatusChangeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingId: string
  currentStatus: BookingRecord["status"]
  /**
   * The Booking's persisted suppression latch. Once set, the service ignores
   * anything this dialog sends, so the control is shown off and disabled
   * rather than promising a send that will not happen.
   */
  notificationsSuppressed?: boolean
  onSuccess?: () => void
}

export function StatusChangeDialog({
  open,
  onOpenChange,
  bookingId,
  currentStatus,
  notificationsSuppressed = false,
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
      notifyCustomer: !notificationsSuppressed,
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        status: currentStatus,
        note: "",
        notifyCustomer: !notificationsSuppressed,
      })
    }
  }, [currentStatus, form, notificationsSuppressed, open])

  // Customer lifecycle messages can be silenced for cancellation and for
  // an exceptional correction back to confirmed.
  const targetStatus = form.watch("status")
  const notifyCustomer = form.watch("notifyCustomer")
  const showNotifyToggle = targetStatus === "confirmed" || targetStatus === "cancelled"

  const onSubmit = async (values: StatusChangeFormOutput) => {
    await mutation.mutateAsync({
      currentStatus,
      status: values.status,
      note: values.note || null,
      suppressNotifications: values.notifyCustomer ? undefined : true,
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

            {showNotifyToggle ? (
              <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="notify-customer">
                    {messages.statusChangeDialog.fields.notifyCustomer}
                  </Label>
                  <Switch
                    id="notify-customer"
                    checked={notifyCustomer}
                    disabled={notificationsSuppressed}
                    onCheckedChange={(checked) => form.setValue("notifyCustomer", checked === true)}
                  />
                </div>
                <p className="text-muted-foreground text-xs">
                  {notificationsSuppressed
                    ? messages.statusChangeDialog.helpers.notificationsAlreadySilenced
                    : messages.statusChangeDialog.helpers.notifyCustomer}
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
