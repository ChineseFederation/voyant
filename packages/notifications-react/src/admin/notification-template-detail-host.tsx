"use client"

import { useAdminHref, useAdminNavigate } from "@voyant-travel/admin"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@voyant-travel/ui/components"
import { ArrowLeft, Loader2, Pencil } from "lucide-react"
import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { useNotificationsUiI18nOrDefault } from "../i18n/index.js"
import {
  useNotificationDeliveries,
  useNotificationTemplate,
  useNotificationTemplateAuthoring,
  useNotificationTemplatePreview,
} from "../index.js"
import { NotificationDeliveryDetailDialog } from "./notification-delivery-detail-dialog.js"
import {
  buildSamplePayload,
  resolvePreviewDataInput,
} from "./notification-template-dialog-utils.js"
import { DestinationLink } from "./notifications-admin-shared.js"

// Lazy-load: the template dialog pulls the rich-text editor (tiptap +
// prosemirror). Keeping it out of the detail-page chunk means those modules
// only download when the user opens the edit dialog.
const NotificationTemplateDialog = lazy(() =>
  import("./notification-template-dialog.js").then((m) => ({
    default: m.NotificationTemplateDialog,
  })),
)

export interface NotificationTemplateDetailHostProps {
  id: string
}

/**
 * Packaged admin host for the notification template detail page
 * (packaged-admin RFC Phase 3). Takes the template id as a prop — the host
 * route file binds `Route.useParams()` onto it. Back links resolve through
 * the `notificationTemplate.list` semantic destination.
 */
export function NotificationTemplateDetailHost({ id }: NotificationTemplateDetailHostProps) {
  const { formatDateTime, messages } = useNotificationsUiI18nOrDefault()
  const table = messages.admin.common.table
  const t = messages.admin.templateDetail
  const common = messages.admin.common
  const [editOpen, setEditOpen] = useState(false)
  const [previewDataInput, setPreviewDataInput] = useState("")
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null)
  const resolveHref = useAdminHref()
  const navigateTo = useAdminNavigate()
  const { data: template, isPending, error, refetch } = useNotificationTemplate(id)
  const { variableCatalog } = useNotificationTemplateAuthoring()
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
  const preview = useNotificationTemplatePreview()
  const deliveries = useNotificationDeliveries({
    templateSlug: template?.slug,
    limit: 20,
    offset: 0,
    enabled: Boolean(template?.slug),
  })

  useEffect(() => {
    setPreviewDataInput(defaultPreviewData)
  }, [defaultPreviewData])

  const parsePreviewData = () => {
    try {
      const input = resolvePreviewDataInput(previewDataInput, defaultPreviewData)
      const parsed = input.trim() ? JSON.parse(input) : {}
      if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) {
        throw new Error(common.previewDataNotObject)
      }
      return parsed as Record<string, unknown>
    } catch (previewError) {
      throw new Error(
        previewError instanceof Error ? previewError.message : common.previewInvalidJson,
      )
    }
  }

  const handlePreview = async () => {
    if (!template) return
    try {
      const data = parsePreviewData()
      await preview.mutateAsync({
        channel: template.channel,
        provider: null,
        fromAddress: template.fromAddress,
        subjectTemplate: template.subjectTemplate,
        htmlTemplate: template.htmlTemplate,
        textTemplate: template.textTemplate,
        data,
      })
    } catch (previewError) {
      toast.error(previewError instanceof Error ? previewError.message : common.previewFailed)
    }
  }

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !template) {
    return (
      <div className="flex flex-col gap-4">
        <DestinationLink
          href={resolveHref("notificationTemplate.list", {})}
          onNavigate={() => navigateTo("notificationTemplate.list", {})}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t.backToTemplates}
        </DestinationLink>
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error instanceof Error ? error.message : t.notFound}
        </div>
      </div>
    )
  }

  const renderedPreview = preview.data

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <DestinationLink
            href={resolveHref("notificationTemplate.list", {})}
            onNavigate={() => navigateTo("notificationTemplate.list", {})}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t.backToTemplates}
          </DestinationLink>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{template.name}</h1>
            <p className="font-mono text-xs text-muted-foreground">{template.slug}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{template.channel}</Badge>
            <Badge variant={template.status === "active" ? "default" : "secondary"}>
              {template.status}
            </Badge>
          </div>
        </div>
        <Button onClick={() => setEditOpen(true)}>
          <Pencil className="mr-2 h-4 w-4" />
          {t.editTemplate}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetaCard label={t.metaChannel} value={template.channel} />
        <MetaCard label={t.metaFrom} value={template.fromAddress ?? common.defaultSender} />
        <MetaCard label={t.metaUpdated} value={formatDateTime(template.updatedAt)} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="w-full">
          <TabsTrigger value="overview">{t.tabOverview}</TabsTrigger>
          <TabsTrigger value="preview">{t.tabPreview}</TabsTrigger>
          <TabsTrigger value="deliveries">{t.recentDeliveries}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t.messageStructureTitle}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <KeyValue label={t.subjectLabel} value={template.subjectTemplate ?? "—"} />
                <KeyValue label={t.textFallbackLabel} value={template.textTemplate ?? "—"} />
                <KeyValue
                  label={t.descriptionLabel}
                  value={template.metadata ? JSON.stringify(template.metadata) : "—"}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t.htmlBodyTitle}</CardTitle>
              </CardHeader>
              <CardContent>
                {template.htmlTemplate ? (
                  <div
                    className="prose prose-sm max-w-none rounded-md border bg-background px-4 py-4 dark:prose-invert"
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: Notification template HTML is rendered for preview. -- owner: notifications-react; existing suppression is intentional pending typed cleanup.
                    dangerouslySetInnerHTML={{ __html: template.htmlTemplate }}
                  />
                ) : (
                  <div className="rounded-md border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                    {t.noHtmlConfigured}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="preview" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>{t.sampleDataTitle}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Label>{t.customJsonLabel}</Label>
                <Textarea
                  value={previewDataInput}
                  onChange={(event) => setPreviewDataInput(event.target.value)}
                  rows={16}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePreview}
                  disabled={preview.isPending}
                >
                  {preview.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t.renderPreview}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t.renderedOutputTitle}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <KeyValue
                  label={t.subjectLabel}
                  value={renderedPreview?.subject ?? t.notRenderedYet}
                />
                {template.channel === "email" ? (
                  <>
                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        {t.htmlBodyTitle}
                      </div>
                      {renderedPreview?.html ? (
                        <div
                          className="prose prose-sm max-w-none rounded-md border bg-background px-4 py-4 dark:prose-invert"
                          // biome-ignore lint/security/noDangerouslySetInnerHtml: Rendered preview HTML is generated server-side for preview. -- owner: notifications-react; existing suppression is intentional pending typed cleanup.
                          dangerouslySetInnerHTML={{ __html: renderedPreview.html }}
                        />
                      ) : (
                        <div className="rounded-md border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                          {t.noRenderedHtml}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        {t.textFallbackLabel}
                      </div>
                      <pre className="whitespace-pre-wrap rounded-md border bg-muted/20 px-3 py-3 text-xs">
                        {renderedPreview?.text ?? t.noRenderedText}
                      </pre>
                    </div>
                  </>
                ) : (
                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t.smsBodyLabel}
                    </div>
                    <pre className="whitespace-pre-wrap rounded-md border bg-muted/20 px-3 py-3 text-xs">
                      {renderedPreview?.text ?? t.noRenderedText}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="deliveries" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t.recentDeliveries}</CardTitle>
            </CardHeader>
            <CardContent>
              {deliveries.isPending ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : deliveries.data?.data && deliveries.data.data.length > 0 ? (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">{table.recipient}</th>
                        <th className="px-4 py-3">{table.provider}</th>
                        <th className="px-4 py-3">{table.status}</th>
                        <th className="px-4 py-3">{table.created}</th>
                        <th className="px-4 py-3 text-right">{table.view}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveries.data.data.map((delivery) => (
                        <tr key={delivery.id} className="border-t">
                          <td className="px-4 py-3">
                            <div>{delivery.toAddress}</div>
                            {delivery.subject ? (
                              <div className="text-xs text-muted-foreground">
                                {delivery.subject}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">{delivery.provider}</td>
                          <td className="px-4 py-3">
                            <Badge
                              variant={
                                delivery.status === "sent"
                                  ? "default"
                                  : delivery.status === "failed"
                                    ? "destructive"
                                    : "secondary"
                              }
                            >
                              {delivery.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">{formatDateTime(delivery.createdAt)}</td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedDeliveryId(delivery.id)}
                            >
                              {t.inspect}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  {t.noDeliveriesForTemplate}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Suspense fallback={null}>
        <NotificationTemplateDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          template={template}
          onSuccess={() => {
            setEditOpen(false)
            void refetch()
          }}
        />
      </Suspense>

      <NotificationDeliveryDetailDialog
        deliveryId={selectedDeliveryId}
        open={Boolean(selectedDeliveryId)}
        onOpenChange={(open) => {
          if (!open) setSelectedDeliveryId(null)
        }}
      />
    </div>
  )
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-sm">{value}</div>
    </div>
  )
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="break-words text-sm">{value}</div>
    </div>
  )
}
