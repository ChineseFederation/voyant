"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useVoyantReactContext } from "@voyant-travel/react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@voyant-travel/ui/components"
import { Loader2, Plus, Webhook } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import {
  responseError,
  useWebhookMessages,
  type WebhookEventRecord,
  type WebhookSubscriptionRecord,
} from "./webhook-ui.js"

const subscriptionsKey = ["operator-webhooks", "subscriptions"] as const
const eventsKey = ["operator-webhooks", "events"] as const

export function WebhooksSettingsPage() {
  const { baseUrl, fetcher } = useVoyantReactContext()
  const queryClient = useQueryClient()
  const t = useWebhookMessages()
  const [open, setOpen] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)
  const [url, setUrl] = useState("")
  const [description, setDescription] = useState("")
  const [events, setEvents] = useState<string[]>([])

  const subscriptions = useQuery({
    queryKey: subscriptionsKey,
    queryFn: async () => {
      const response = await fetcher(`${baseUrl}/v1/admin/webhooks/subscriptions`)
      if (!response.ok) throw new Error(t.loadFailed)
      return ((await response.json()) as { data: WebhookSubscriptionRecord[] }).data
    },
  })
  const catalog = useQuery({
    queryKey: eventsKey,
    queryFn: async () => {
      const response = await fetcher(`${baseUrl}/v1/admin/webhooks/events`)
      if (!response.ok) throw new Error(t.loadFailed)
      return ((await response.json()) as { data: WebhookEventRecord[] }).data
    },
  })

  const create = useMutation({
    mutationFn: async () => {
      const response = await fetcher(`${baseUrl}/v1/admin/webhooks/subscriptions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, description: description || null, events }),
      })
      if (!response.ok) throw new Error(await responseError(response, t.saveFailed))
      return (await response.json()) as {
        data: { subscription: WebhookSubscriptionRecord; secret: string }
      }
    },
    onSuccess: (result) => {
      setSecret(result.data.secret)
      setOpen(false)
      setUrl("")
      setDescription("")
      setEvents([])
      void queryClient.invalidateQueries({ queryKey: subscriptionsKey })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t.saveFailed),
  })

  const pending = subscriptions.isPending || catalog.isPending
  const error = subscriptions.error ?? catalog.error

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t.add}
        </Button>
      </header>

      {pending ? (
        <div className="flex justify-center p-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : t.loadFailed}
        </p>
      ) : subscriptions.data?.length ? (
        <div className="grid gap-3">
          {subscriptions.data.map((subscription) => (
            <a
              key={subscription.id}
              href={`/settings/webhooks/${encodeURIComponent(subscription.id)}`}
              className="rounded-lg outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="transition-colors hover:bg-muted/40">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Webhook className="h-4 w-4" />
                      {subscription.description || subscription.url}
                    </CardTitle>
                    <Badge variant={subscription.active ? "default" : "secondary"}>
                      {subscription.active ? t.active : t.inactive}
                    </Badge>
                  </div>
                  <CardDescription className="break-all">{subscription.url}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {subscription.events.map((event) => (
                    <Badge key={event} variant="outline">
                      {event}
                    </Badge>
                  ))}
                </CardContent>
              </Card>
            </a>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {t.empty}
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{t.create}</DialogTitle>
            <DialogDescription>{t.description}</DialogDescription>
          </DialogHeader>
          {/* DialogBody, not a plain div: DialogContent is a flex column with a
              capped height, so the scroll region has to be the shrinkable child
              or the footer's buttons get pushed past the viewport. */}
          <DialogBody className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="webhook-url">{t.endpoint}</Label>
              <Input
                id="webhook-url"
                type="url"
                value={url}
                placeholder="https://example.com/webhooks/voyant"
                onChange={(event) => setUrl(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="webhook-description">{t.descriptionLabel}</Label>
              <Input
                id="webhook-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t.events}</legend>
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                {catalog.data?.map((event) => (
                  <Label
                    key={event.id}
                    htmlFor={`webhook-event-${event.id}`}
                    className="flex items-center gap-2 rounded-md p-1.5 font-normal hover:bg-muted/60"
                  >
                    <Checkbox
                      id={`webhook-event-${event.id}`}
                      checked={events.includes(event.eventType)}
                      onCheckedChange={(checked) =>
                        setEvents((current) =>
                          checked === true
                            ? [...current, event.eventType]
                            : current.filter((value) => value !== event.eventType),
                        )
                      }
                    />
                    <span className="font-mono text-xs">{event.eventType}</span>
                    <span className="text-muted-foreground">v{event.version}</span>
                  </Label>
                ))}
              </div>
            </fieldset>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.cancel}
            </Button>
            <Button
              disabled={!url || events.length === 0 || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t.create}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={secret !== null} onOpenChange={(next) => !next && setSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.secretTitle}</DialogTitle>
            <DialogDescription>{t.secretHint}</DialogDescription>
          </DialogHeader>
          <code className="break-all rounded-md bg-muted p-3 text-sm">{secret}</code>
        </DialogContent>
      </Dialog>
    </div>
  )
}
