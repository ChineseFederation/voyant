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
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@voyant-travel/ui/components"
import { RichTextEditor } from "@voyant-travel/ui/components/rich-text-editor"
import { zodResolver } from "@voyant-travel/ui/lib/zod-resolver"
import { Loader2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { useNotificationsUiI18nOrDefault } from "../i18n/index.js"
import {
  type NotificationTemplateRecord,
  useNotificationTemplateAuthoring,
  useNotificationTemplateMutation,
  useNotificationTemplatePreview,
} from "../index.js"
import { NotificationTemplateAttachmentsField } from "./notification-template-attachments-field.js"
import { NotificationTemplateAuthoringHelp } from "./notification-template-authoring-help.js"
import {
  buildSamplePayload,
  buildTemplateMetadata,
  CHANNEL_VALUES,
  channelItemLabel,
  type FormOutput,
  type FormValues,
  nativeSelectClassName,
  readTemplateAttachments,
  resolveTemplateMutationStatus,
  STATUS_VALUES,
  statusItemLabel,
  type TemplateAttachment,
  templateFormSchema,
} from "./notification-template-dialog-utils.js"
import { NotificationTemplateRenderedPreview } from "./notification-template-rendered-preview.js"

type NotificationTemplateDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  template?: NotificationTemplateRecord
  onSuccess: () => void
}

const dirtyFieldOptions = { shouldDirty: true, shouldTouch: true, shouldValidate: true } as const

export function NotificationTemplateDialog(props: NotificationTemplateDialogProps) {
  if (!props.open) {
    return null
  }

  return <NotificationTemplateDialogInner {...props} />
}

function NotificationTemplateDialogInner({
  open,
  onOpenChange,
  template,
  onSuccess,
}: NotificationTemplateDialogProps) {
  const isEditing = Boolean(template)
  const { messages } = useNotificationsUiI18nOrDefault()
  const t = messages.admin.templateDialog
  const common = messages.admin.common
  const { create, update } = useNotificationTemplateMutation()
  const preview = useNotificationTemplatePreview()
  const previewResetRef = useRef(preview.reset)
  const { variableCatalog, liquidSnippets } = useNotificationTemplateAuthoring()
  const [previewDataInput, setPreviewDataInput] = useState("{}")
  const variableGroups = useMemo(
    () =>
      variableCatalog.map((group) => ({
        ...group,
        variables: group.variables.map((variable) => ({
          ...variable,
          example: String(variable.example),
        })),
      })),
    [variableCatalog],
  )
  const defaultPreviewData = useMemo(
    () => JSON.stringify(buildSamplePayload(variableGroups), null, 2),
    [variableGroups],
  )

  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: "",
      slug: "",
      channel: "email",
      status: "active",
      subjectTemplate: "",
      htmlTemplate: "",
      textTemplate: "",
      fromAddress: "",
      attachments: [],
      active: true,
    },
  })

  const channel = form.watch("channel")
  const attachments = form.watch("attachments") ?? []
  previewResetRef.current = preview.reset

  useEffect(() => {
    if (open && template) {
      form.reset({
        name: template.name,
        slug: template.slug,
        channel: template.channel,
        status: template.status,
        subjectTemplate: template.subjectTemplate ?? "",
        htmlTemplate: template.htmlTemplate ?? "",
        textTemplate: template.textTemplate ?? "",
        fromAddress: template.fromAddress ?? "",
        attachments: template.channel === "email" ? readTemplateAttachments(template.metadata) : [],
        active: template.status === "active",
      })
      return
    }

    if (open) {
      form.reset()
    }
  }, [open, template, form])

  useEffect(() => {
    if (!open || channel === "email" || (form.getValues("attachments") ?? []).length === 0) return
    form.setValue("attachments", [], {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    })
  }, [channel, form, open])

  useEffect(() => {
    if (!open) return
    setPreviewDataInput(defaultPreviewData)
    previewResetRef.current()
  }, [defaultPreviewData, open])

  const onSubmit = async (values: FormOutput) => {
    const payload = {
      name: values.name,
      slug: values.slug,
      channel: values.channel,
      provider: null,
      status: resolveTemplateMutationStatus(values),
      subjectTemplate: values.channel === "email" ? values.subjectTemplate || null : null,
      htmlTemplate: values.channel === "email" ? values.htmlTemplate || null : null,
      textTemplate: values.channel === "sms" ? values.textTemplate || null : null,
      fromAddress: values.channel === "email" ? values.fromAddress || null : null,
      isSystem: template?.isSystem ?? false,
      metadata:
        values.channel === "email"
          ? buildTemplateMetadata(template?.metadata, values.attachments)
          : buildTemplateMetadata(template?.metadata, []),
    }

    if (isEditing && template) {
      await update.mutateAsync({ id: template.id, input: payload })
    } else {
      await create.mutateAsync(payload)
    }

    onSuccess()
  }

  const isPending = create.isPending || update.isPending

  const parsePreviewData = () => {
    try {
      const parsed = previewDataInput.trim() ? JSON.parse(previewDataInput) : {}
      if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) {
        throw new Error(common.previewDataNotObject)
      }
      return parsed as Record<string, unknown>
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : common.previewInvalidJson)
    }
  }

  const handlePreview = async () => {
    try {
      const data = parsePreviewData()
      await preview.mutateAsync({
        channel,
        provider: null,
        fromAddress: channel === "email" ? form.getValues("fromAddress") || null : null,
        subjectTemplate: channel === "email" ? form.getValues("subjectTemplate") || null : null,
        htmlTemplate: channel === "email" ? form.getValues("htmlTemplate") || null : null,
        textTemplate: channel === "sms" ? form.getValues("textTemplate") || null : null,
        data,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : common.previewFailed)
    }
  }

  const setAttachmentSelected = (attachment: TemplateAttachment, checked: boolean) => {
    const current = form.getValues("attachments") ?? []
    const next = checked
      ? [...current, attachment].filter((value, index, values) => values.indexOf(value) === index)
      : current.filter((value) => value !== attachment)

    form.setValue("attachments", next, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="xl" className="h-[calc(100vh-2rem)]">
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <SheetHeader>
            <SheetTitle>{isEditing ? t.editTitle : t.createTitle}</SheetTitle>
          </SheetHeader>
          <SheetBody className="p-0">
            <div className="grid gap-4 py-4 pr-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>{t.nameLabel}</Label>
                  <Input {...form.register("name")} placeholder={t.namePlaceholder} />
                  {form.formState.errors.name ? (
                    <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2">
                  <Label>{t.slugLabel}</Label>
                  <Input {...form.register("slug")} placeholder={t.slugPlaceholder} />
                  {form.formState.errors.slug ? (
                    <p className="text-xs text-destructive">{form.formState.errors.slug.message}</p>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>{t.channelLabel}</Label>
                  <select
                    className={nativeSelectClassName}
                    value={form.watch("channel")}
                    onChange={(event) => {
                      const nextChannel = event.target.value as FormValues["channel"]
                      if (form.getValues("channel") === nextChannel) return
                      form.setValue("channel", nextChannel, {
                        shouldDirty: true,
                        shouldTouch: true,
                        shouldValidate: true,
                      })
                    }}
                  >
                    {CHANNEL_VALUES.map((value) => (
                      <option key={value} value={value}>
                        {channelItemLabel(common, value)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>{t.statusLabel}</Label>
                  <select
                    className={nativeSelectClassName}
                    value={form.watch("status")}
                    onChange={(event) => {
                      const nextStatus = event.target.value as FormValues["status"]
                      if (form.getValues("status") === nextStatus) return
                      form.setValue("status", nextStatus, dirtyFieldOptions)
                      form.setValue("active", nextStatus === "active", dirtyFieldOptions)
                    }}
                  >
                    {STATUS_VALUES.map((value) => (
                      <option key={value} value={value}>
                        {statusItemLabel(common, value)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {channel === "email" ? (
                <>
                  <NotificationTemplateAttachmentsField
                    attachments={attachments}
                    onAttachmentChange={setAttachmentSelected}
                    t={t}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <Label>{t.fromAddressLabel}</Label>
                      <Input
                        {...form.register("fromAddress")}
                        placeholder={t.fromAddressPlaceholder}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>{t.subjectLabel}</Label>
                      <Input
                        {...form.register("subjectTemplate")}
                        placeholder={t.subjectPlaceholder}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label>{t.htmlBodyLabel}</Label>
                    <RichTextEditor
                      value={form.watch("htmlTemplate") ?? ""}
                      onChange={(value) =>
                        form.setValue("htmlTemplate", value, {
                          shouldDirty: true,
                          shouldTouch: true,
                          shouldValidate: true,
                        })
                      }
                      placeholder={t.htmlBodyPlaceholder}
                      enableVariables
                    />
                  </div>
                </>
              ) : null}

              {channel === "sms" ? (
                <div className="flex flex-col gap-2">
                  <Label>{t.smsBodyLabel}</Label>
                  <Textarea
                    {...form.register("textTemplate")}
                    placeholder={t.smsBodyPlaceholder}
                    rows={6}
                    className="font-mono text-xs"
                  />
                </div>
              ) : null}

              <Tabs defaultValue="authoring">
                <TabsList className="w-full">
                  <TabsTrigger value="authoring">{t.tabAuthoring}</TabsTrigger>
                  <TabsTrigger value="preview">{t.tabPreview}</TabsTrigger>
                </TabsList>

                <TabsContent value="authoring" className="mt-4 space-y-4">
                  <NotificationTemplateAuthoringHelp
                    variableGroups={variableGroups}
                    snippets={liquidSnippets}
                  />
                </TabsContent>

                <TabsContent value="preview" className="mt-4 space-y-4">
                  <div className="grid gap-4">
                    <div className="space-y-4">
                      <div className="flex flex-col gap-2">
                        <Label>{t.previewDataLabel}</Label>
                        <Textarea
                          value={previewDataInput}
                          onChange={(event) => setPreviewDataInput(event.target.value)}
                          rows={14}
                          className="font-mono text-xs"
                          placeholder={t.previewDataPlaceholder}
                        />
                        <p className="text-xs text-muted-foreground">{t.previewDataHint}</p>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handlePreview}
                          disabled={preview.isPending}
                        >
                          {preview.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          {t.refreshPreview}
                        </Button>
                      </div>

                      <NotificationTemplateRenderedPreview
                        channel={channel}
                        data={preview.data}
                        t={t}
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex items-center gap-3">
                <Switch
                  checked={form.watch("active")}
                  onCheckedChange={(checked) => {
                    form.setValue("active", checked, dirtyFieldOptions)
                    form.setValue("status", checked ? "active" : "draft", dirtyFieldOptions)
                  }}
                />
                <Label className="cursor-pointer">{t.markActiveLabel}</Label>
              </div>
            </div>
          </SheetBody>

          <SheetFooter className="mt-0">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {messages.common.cancel}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isEditing ? common.saveChanges : t.createTemplate}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
