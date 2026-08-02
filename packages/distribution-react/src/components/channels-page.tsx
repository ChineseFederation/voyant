"use client"

import {
  Badge,
  Button,
  confirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
} from "@voyant-travel/ui/components"
import { cn } from "@voyant-travel/ui/lib/utils"
import { Eye, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
import type { FormEvent } from "react"
import { useEffect, useState } from "react"
import { useDistributionUiI18nOrDefault } from "../i18n/index.js"
import type { DistributionUiMessages } from "../i18n/messages.js"
import {
  type ChannelRow,
  type CreateChannelInput,
  useChannelMutation,
  useChannels,
} from "../index.js"
import { PublicationSheet } from "./publication-sheet.js"

const PAGE_SIZE = 25

type ChannelFormValues = {
  name: string
  kind: ChannelRow["kind"]
  status: ChannelRow["status"]
  website: string
  contactName: string
  contactEmail: string
}

export interface ChannelsPageProps {
  className?: string
  pageSize?: number
}

const defaultFormValues: ChannelFormValues = {
  name: "",
  kind: "direct",
  status: "active",
  website: "",
  contactName: "",
  contactEmail: "",
}

export function ChannelsPage({ className, pageSize = PAGE_SIZE }: ChannelsPageProps = {}) {
  const { messages } = useDistributionUiI18nOrDefault()
  const page = messages.settings.channelsPage
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<ChannelRow | undefined>()
  const [publicationChannel, setPublicationChannel] = useState<ChannelRow | undefined>()
  const [pageIndex, setPageIndex] = useState(0)
  const { data, isPending, refetch } = useChannels({
    limit: pageSize,
    offset: pageIndex * pageSize,
  })
  const { remove } = useChannelMutation()

  const channels = data?.data ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div data-slot="channels-page" className={cn("flex flex-col gap-6", className)}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{page.title}</h2>
          <p className="text-sm text-muted-foreground">{page.description}</p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(undefined)
            setSheetOpen(true)
          }}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {page.addChannel}
        </Button>
      </div>

      {isPending ? (
        <ChannelsListSkeleton />
      ) : (
        <div className="rounded-md border bg-card text-card-foreground shadow-sm">
          {channels.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">{page.empty}</p>
          ) : (
            <div className="flex flex-col divide-y">
              {channels.map((channel) => (
                <div key={channel.id} className="flex items-center justify-between px-6 py-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{channel.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {messages.common.channelKindLabels[channel.kind]}
                      </Badge>
                      {channel.status !== "active" ? (
                        <Badge variant="secondary" className="text-xs">
                          {messages.common.channelStatusLabels[channel.status]}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {channel.website ? <span>{channel.website}</span> : null}
                      {channel.contactName ? <span>{channel.contactName}</span> : null}
                      {channel.contactEmail ? <span>{channel.contactEmail}</span> : null}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${page.edit} / ${page.delete}: ${channel.name}`}
                        title={`${page.edit} / ${page.delete}: ${channel.name}`}
                        className="h-8 w-8 text-muted-foreground"
                      >
                        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setEditing(channel)
                          setSheetOpen(true)
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        {page.edit}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          window.setTimeout(() => setPublicationChannel(channel), 0)
                        }}
                      >
                        <Eye className="h-4 w-4" />
                        {page.publication.open}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={remove.isPending}
                        onClick={async () => {
                          if (
                            await confirmDialog({
                              description: page.deleteConfirm,
                              destructive: true,
                            })
                          ) {
                            void remove.mutateAsync(channel.id).then(() => refetch())
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        {page.delete}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
        <span>
          {page.paginationShowing
            .replace("{count}", String(channels.length))
            .replace("{total}", String(total))}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pageIndex === 0}
            onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
          >
            {page.paginationPrevious}
          </Button>
          <span>
            {page.paginationPage
              .replace("{page}", String(pageIndex + 1))
              .replace("{pageCount}", String(pageCount))}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={(pageIndex + 1) * pageSize >= total}
            onClick={() => setPageIndex((current) => current + 1)}
          >
            {page.paginationNext}
          </Button>
        </div>
      </div>

      <ChannelSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        channel={editing}
        onSuccess={() => {
          setSheetOpen(false)
          setEditing(undefined)
          void refetch()
        }}
      />
      <PublicationSheet
        open={!!publicationChannel}
        onOpenChange={(open) => {
          if (!open) setPublicationChannel(undefined)
        }}
        channel={publicationChannel}
      />
    </div>
  )
}

function ChannelSheet({
  open,
  onOpenChange,
  channel,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  channel?: ChannelRow
  onSuccess: () => void
}) {
  const { messages } = useDistributionUiI18nOrDefault()
  const page = messages.settings.channelsPage
  const isEditing = !!channel
  const { create, update } = useChannelMutation()
  const [values, setValues] = useState<ChannelFormValues>(defaultFormValues)
  const [errors, setErrors] = useState<Partial<Record<keyof ChannelFormValues, string>>>({})
  const channelKinds = Object.entries(messages.common.channelKindLabels).map(([value, label]) => ({
    value: value as ChannelRow["kind"],
    label,
  }))

  useEffect(() => {
    if (open && channel) {
      setValues({
        name: channel.name,
        kind: channel.kind,
        status: channel.status,
        website: channel.website ?? "",
        contactName: channel.contactName ?? "",
        contactEmail: channel.contactEmail ?? "",
      })
      setErrors({})
    } else if (open) {
      setValues(defaultFormValues)
      setErrors({})
    }
  }, [open, channel])

  const isSubmitting = create.isPending || update.isPending

  const setValue = <TKey extends keyof ChannelFormValues>(
    key: TKey,
    value: ChannelFormValues[TKey],
  ) => setValues((current) => ({ ...current, [key]: value }))

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors = validateChannelForm(values, page)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const payload: CreateChannelInput = {
      name: values.name.trim(),
      kind: values.kind,
      status: values.status,
      website: normalizeOptional(values.website),
      contactName: normalizeOptional(values.contactName),
      contactEmail: normalizeOptional(values.contactEmail),
    }

    if (isEditing) {
      await update.mutateAsync({ id: channel.id, input: payload })
    } else {
      await create.mutateAsync(payload)
    }
    onSuccess()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? page.editSheetTitle : page.newSheetTitle}</SheetTitle>
        </SheetHeader>
        <form onSubmit={onSubmit} className="flex flex-1 flex-col overflow-hidden">
          <SheetBody className="grid gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="channel-name">{page.nameLabel}</Label>
              <Input
                id="channel-name"
                value={values.name}
                onChange={(event) => setValue("name", event.target.value)}
                placeholder={page.namePlaceholder}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? "channel-name-error" : undefined}
                autoFocus
              />
              {errors.name ? (
                <p id="channel-name-error" className="text-xs text-destructive">
                  {errors.name}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label id="channel-kind-label" htmlFor="channel-kind">
                  {page.kindLabel}
                </Label>
                <Select
                  items={channelKinds}
                  value={values.kind}
                  onValueChange={(value) => setValue("kind", value as ChannelRow["kind"])}
                >
                  <SelectTrigger
                    id="channel-kind"
                    aria-labelledby="channel-kind-label"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {channelKinds.map((kind) => (
                      <SelectItem key={kind.value} value={kind.value}>
                        {kind.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label id="channel-status-label" htmlFor="channel-status">
                  {page.statusLabel}
                </Label>
                <Select
                  value={values.status}
                  onValueChange={(value) => setValue("status", value as ChannelRow["status"])}
                >
                  <SelectTrigger
                    id="channel-status"
                    aria-labelledby="channel-status-label"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(messages.common.channelStatusLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="channel-website">{page.websiteLabel}</Label>
              <Input
                id="channel-website"
                value={values.website}
                onChange={(event) => setValue("website", event.target.value)}
                placeholder={page.websitePlaceholder}
                aria-invalid={errors.website ? true : undefined}
                aria-describedby={errors.website ? "channel-website-error" : undefined}
              />
              {errors.website ? (
                <p id="channel-website-error" className="text-xs text-destructive">
                  {errors.website}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="channel-contact-name">{page.primaryContactLabel}</Label>
                <Input
                  id="channel-contact-name"
                  value={values.contactName}
                  onChange={(event) => setValue("contactName", event.target.value)}
                  placeholder={page.primaryContactPlaceholder}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="channel-contact-email">{page.contactEmailLabel}</Label>
                <Input
                  id="channel-contact-email"
                  value={values.contactEmail}
                  onChange={(event) => setValue("contactEmail", event.target.value)}
                  placeholder={page.contactEmailPlaceholder}
                  aria-invalid={errors.contactEmail ? true : undefined}
                  aria-describedby={errors.contactEmail ? "channel-contact-email-error" : undefined}
                />
                {errors.contactEmail ? (
                  <p id="channel-contact-email-error" className="text-xs text-destructive">
                    {errors.contactEmail}
                  </p>
                ) : null}
              </div>
            </div>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {messages.common.cancel}
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isEditing ? page.saveChanges : page.createChannel}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function ChannelsListSkeleton() {
  const rows = ["first", "second", "third", "fourth", "fifth"]

  return (
    <div className="rounded-md border bg-card text-card-foreground shadow-sm">
      {rows.map((row) => (
        <div
          key={row}
          className="flex items-center justify-between border-b px-6 py-3 last:border-b-0"
        >
          <div className="space-y-2">
            <div className="h-4 w-44 rounded bg-muted" />
            <div className="h-3 w-64 rounded bg-muted" />
          </div>
          <div className="h-8 w-8 rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}

function validateChannelForm(
  values: ChannelFormValues,
  page: DistributionUiMessages["settings"]["channelsPage"],
) {
  const errors: Partial<Record<keyof ChannelFormValues, string>> = {}
  if (!values.name.trim()) errors.name = page.validationNameRequired
  if (values.name.length > 255) errors.name = page.validationNameRequired
  if (values.website.trim()) {
    try {
      new URL(values.website.trim())
    } catch {
      errors.website = page.validationInvalidUrl
    }
  }
  if (values.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contactEmail)) {
    errors.contactEmail = page.validationInvalidEmail
  }
  return errors
}

function normalizeOptional(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
