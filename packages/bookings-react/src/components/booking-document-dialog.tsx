"use client"

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
  Textarea,
} from "@voyant-travel/ui/components"
import { DatePicker } from "@voyant-travel/ui/components/date-picker"
import { zodResolver } from "@voyant-travel/ui/lib/zod-resolver"
import { Loader2 } from "lucide-react"
import { useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod/v4"
import { useBookingsUiMessagesOrDefault } from "../i18n/provider.js"
import { useBookingTravelerDocumentMutation, useTravelers } from "../index.js"
import { issuedBookingDocumentTypes } from "../schemas.js"

import { FileDropzone } from "./file-dropzone.js"

const documentTypes = [
  "visa",
  "insurance",
  "health",
  "passport_copy",
  "contract",
  "invoice",
  "proforma",
  "credit_note",
  "other",
] as const

const issuedTypes = new Set<string>(issuedBookingDocumentTypes)

const UNASSIGNED = "__unassigned__"

function createDocumentFormSchema(messages: ReturnType<typeof useBookingsUiMessagesOrDefault>) {
  return (
    z
      .object({
        type: z.enum(documentTypes).default("other"),
        fileName: z
          .string()
          .min(1, messages.bookingDocumentDialog.validation.fileNameRequired)
          .max(500),
        fileUrl: z
          .string()
          .min(1, messages.bookingDocumentDialog.validation.fileRequired)
          .url(messages.bookingDocumentDialog.validation.fileUrlInvalid),
        travelerId: z.string().optional().nullable(),
        issuedBy: z.string().optional().nullable(),
        issuedSeries: z.string().optional().nullable(),
        issuedNumber: z.string().optional().nullable(),
        issuedAt: z.string().optional().nullable(),
        expiresAt: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      })
      // A document issued elsewhere is only auditable if it says which document
      // it is, so the server requires the issuer's number and date. Ask for them
      // here rather than letting the request come back rejected.
      .superRefine((value, ctx) => {
        if (!issuedTypes.has(value.type)) return
        if (!value.issuedNumber?.trim()) {
          ctx.addIssue({
            code: "custom",
            path: ["issuedNumber"],
            message: messages.bookingDocumentDialog.validation.issuedNumberRequired,
          })
        }
        if (!value.issuedAt?.trim()) {
          ctx.addIssue({
            code: "custom",
            path: ["issuedAt"],
            message: messages.bookingDocumentDialog.validation.issuedAtRequired,
          })
        }
      })
  )
}

type DocumentFormValues = z.input<ReturnType<typeof createDocumentFormSchema>>
type DocumentFormOutput = z.output<ReturnType<typeof createDocumentFormSchema>>

export interface BookingDocumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingId: string
  onSuccess?: () => void
}

export function BookingDocumentDialog({
  open,
  onOpenChange,
  bookingId,
  onSuccess,
}: BookingDocumentDialogProps) {
  const { create } = useBookingTravelerDocumentMutation(bookingId)
  const { data: travelersData } = useTravelers(bookingId)
  const travelers = travelersData?.data ?? []
  const messages = useBookingsUiMessagesOrDefault()
  const documentFormSchema = createDocumentFormSchema(messages)
  const typeItems = useMemo(
    () =>
      documentTypes.map((t) => ({
        value: t,
        label: messages.bookingDocumentDialog.documentTypeLabels[t],
      })),
    [messages.bookingDocumentDialog.documentTypeLabels],
  )
  const travelerItems = useMemo(
    () => [
      {
        value: UNASSIGNED,
        label: messages.bookingDocumentDialog.placeholders.travelerUnassigned,
      },
      ...travelers.map((t) => ({
        value: t.id,
        label: `${t.firstName} ${t.lastName}`,
      })),
    ],
    [travelers, messages.bookingDocumentDialog.placeholders.travelerUnassigned],
  )

  const form = useForm<DocumentFormValues, unknown, DocumentFormOutput>({
    resolver: zodResolver(documentFormSchema),
    defaultValues: {
      type: "other",
      fileName: "",
      fileUrl: "",
      travelerId: UNASSIGNED,
      issuedBy: "",
      issuedSeries: "",
      issuedNumber: "",
      issuedAt: "",
      expiresAt: "",
      notes: "",
    },
  })

  useEffect(() => {
    if (open) {
      form.reset()
    }
  }, [form, open])

  const onSubmit = async (values: DocumentFormOutput) => {
    await create.mutateAsync({
      type: values.type,
      fileName: values.fileName,
      fileUrl: values.fileUrl,
      travelerId: values.travelerId && values.travelerId !== UNASSIGNED ? values.travelerId : null,
      issuedBy: values.issuedBy?.trim() || null,
      issuedSeries: values.issuedSeries?.trim() || null,
      issuedNumber: values.issuedNumber?.trim() || null,
      issuedAt: values.issuedAt || null,
      expiresAt: values.expiresAt || null,
      notes: values.notes || null,
    })

    onOpenChange(false)
    onSuccess?.()
  }
  const uploadedFileUrl = form.watch("fileUrl")
  const selectedType = form.watch("type")
  const recordsIssuedDocument = issuedTypes.has(selectedType ?? "other")
  const canSubmit = Boolean(uploadedFileUrl) && !create.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{messages.bookingDocumentDialog.title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <DialogBody className="grid gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>{messages.bookingDocumentDialog.fields.type}</Label>
                <Select
                  items={typeItems}
                  value={form.watch("type")}
                  onValueChange={(v) =>
                    form.setValue("type", (v ?? "other") as (typeof documentTypes)[number])
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {documentTypes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {messages.bookingDocumentDialog.documentTypeLabels[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>{messages.bookingDocumentDialog.fields.traveler}</Label>
                <Select
                  items={travelerItems}
                  value={form.watch("travelerId") ?? UNASSIGNED}
                  onValueChange={(v) => form.setValue("travelerId", v ?? UNASSIGNED)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>
                      {messages.bookingDocumentDialog.placeholders.travelerUnassigned}
                    </SelectItem>
                    {travelers.map((traveler) => (
                      <SelectItem key={traveler.id} value={traveler.id}>
                        {traveler.firstName} {traveler.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>{messages.bookingDocumentDialog.fields.file}</Label>
              <FileDropzone
                accept="application/pdf,image/*"
                maxSize={10 * 1024 * 1024}
                onUploaded={(upload) => {
                  form.setValue("fileUrl", upload.url, { shouldValidate: true })
                  form.setValue("fileName", upload.name, { shouldValidate: true })
                }}
                onCleared={() => {
                  form.setValue("fileUrl", "", { shouldDirty: true, shouldValidate: true })
                  form.setValue("fileName", "", { shouldDirty: true, shouldValidate: true })
                }}
                helperText={messages.bookingDocumentDialog.placeholders.helperText}
              />
              {form.formState.errors.fileUrl && (
                <p className="text-xs text-destructive">{form.formState.errors.fileUrl.message}</p>
              )}
            </div>

            {recordsIssuedDocument ? (
              <div className="flex flex-col gap-4 rounded-md border border-dashed p-3">
                <p className="text-muted-foreground text-xs">
                  {messages.bookingDocumentDialog.issuedNotice}
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label>{messages.bookingDocumentDialog.fields.issuedSeries}</Label>
                    <Input
                      {...form.register("issuedSeries")}
                      placeholder={messages.bookingDocumentDialog.placeholders.issuedSeries}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>{messages.bookingDocumentDialog.fields.issuedNumber}</Label>
                    <Input
                      {...form.register("issuedNumber")}
                      placeholder={messages.bookingDocumentDialog.placeholders.issuedNumber}
                    />
                    {form.formState.errors.issuedNumber && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.issuedNumber.message}
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label>{messages.bookingDocumentDialog.fields.issuedAt}</Label>
                    <DatePicker
                      value={form.watch("issuedAt") || null}
                      onChange={(next) =>
                        form.setValue("issuedAt", next ?? "", {
                          shouldValidate: true,
                          shouldDirty: true,
                        })
                      }
                      placeholder={messages.bookingDocumentDialog.placeholders.issuedAt}
                      className="w-full"
                    />
                    {form.formState.errors.issuedAt && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.issuedAt.message}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>{messages.bookingDocumentDialog.fields.issuedBy}</Label>
                    <Input
                      {...form.register("issuedBy")}
                      placeholder={messages.bookingDocumentDialog.placeholders.issuedBy}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <Label>{messages.bookingDocumentDialog.fields.expiresAt}</Label>
              <DatePicker
                value={form.watch("expiresAt") || null}
                onChange={(next) =>
                  form.setValue("expiresAt", next ?? "", {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
                placeholder={messages.bookingDocumentDialog.placeholders.expiresAt}
                className="w-full"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>{messages.bookingDocumentDialog.fields.notes}</Label>
              <Textarea
                {...form.register("notes")}
                placeholder={messages.bookingDocumentDialog.placeholders.notes}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {messages.common.cancel}
            </Button>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {messages.bookingDocumentDialog.actions.addDocument}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
