"use client"

import { useAdminHref, useAdminNavigate } from "@voyant-travel/admin"
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components"
import { Loader2, Pencil, Plus, Search } from "lucide-react"
import { lazy, Suspense, useState } from "react"
import { useNotificationsUiI18nOrDefault } from "../i18n/index.js"
import {
  type NotificationTemplateRecord,
  type UseNotificationTemplatesOptions,
  useNotificationTemplates,
} from "../index.js"
import { DestinationLink } from "./notifications-admin-shared.js"

// Lazy-load: the template dialog pulls the rich-text editor (tiptap +
// prosemirror). Keeping it out of the list-page chunk means those modules
// only download when the user opens the create/edit dialog.
const NotificationTemplateDialog = lazy(() =>
  import("./notification-template-dialog.js").then((m) => ({
    default: m.NotificationTemplateDialog,
  })),
)

/**
 * Packaged admin host for the notification templates list page
 * (packaged-admin RFC Phase 3). Zero-prop: list/filter state stays
 * component-local, row clicks resolve through the
 * `notificationTemplate.detail` semantic destination, and the create/edit
 * dialog stays lazily loaded inside the package.
 */
export function NotificationTemplatesHost() {
  const { formatDateTime, messages } = useNotificationsUiI18nOrDefault()
  const t = messages.admin.templatesPage
  const common = messages.admin.common
  const table = common.table
  const [search, setSearch] = useState("")
  const [channel, setChannel] = useState<UseNotificationTemplatesOptions["channel"] | "all">("all")
  const [status, setStatus] = useState<UseNotificationTemplatesOptions["status"] | "all">("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<NotificationTemplateRecord | undefined>()
  const resolveHref = useAdminHref()
  const navigateTo = useAdminNavigate()
  const { data, isPending, refetch } = useNotificationTemplates({
    search,
    channel: channel === "all" ? undefined : channel,
    status: status === "all" ? undefined : status,
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
          <p className="text-sm text-muted-foreground">{t.description}</p>
        </div>
        <Button
          onClick={() => {
            setEditing(undefined)
            setDialogOpen(true)
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t.newTemplate}
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={channel} onValueChange={(value) => setChannel(value ?? "all")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={common.channelFilterPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{common.allChannels}</SelectItem>
            <SelectItem value="email">{common.channelEmail}</SelectItem>
            <SelectItem value="sms">{common.channelSms}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(value) => setStatus(value ?? "all")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={common.statusFilterPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{common.allStatuses}</SelectItem>
            <SelectItem value="draft">{common.statusDraft}</SelectItem>
            <SelectItem value="active">{common.statusActive}</SelectItem>
            <SelectItem value="archived">{common.statusArchived}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isPending ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : null}

      {!isPending && (!data?.data || data.data.length === 0) ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">{t.empty}</p>
        </div>
      ) : null}

      {!isPending && data?.data && data.data.length > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{table.template}</th>
                <th className="px-4 py-3">{table.channel}</th>
                <th className="px-4 py-3">{table.status}</th>
                <th className="px-4 py-3">{table.updated}</th>
                <th className="px-4 py-3 text-right">{table.actions}</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((template) => (
                <tr key={template.id} className="border-t">
                  <td className="px-4 py-3">
                    <DestinationLink
                      href={resolveHref("notificationTemplate.detail", {
                        templateId: template.id,
                      })}
                      onNavigate={() =>
                        navigateTo("notificationTemplate.detail", { templateId: template.id })
                      }
                      className="block rounded-sm outline-none transition-colors hover:text-primary focus-visible:text-primary"
                    >
                      <div className="font-medium">{template.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{template.slug}</div>
                    </DestinationLink>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{template.channel}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={template.status === "active" ? "default" : "secondary"}>
                      {template.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{formatDateTime(template.updatedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(template)
                        setDialogOpen(true)
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Suspense fallback={null}>
        <NotificationTemplateDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          template={editing}
          onSuccess={() => {
            setDialogOpen(false)
            setEditing(undefined)
            void refetch()
          }}
        />
      </Suspense>
    </div>
  )
}
