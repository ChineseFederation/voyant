"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { AdminRoutePageProps } from "@voyant-travel/admin/extensions"
import { useVoyantReactContext } from "@voyant-travel/react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Label,
} from "@voyant-travel/ui/components"
import { ArrowLeft, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  responseError,
  useWebhookMessages,
  type WebhookDeliveryRecord,
  type WebhookEventRecord,
  type WebhookSubscriptionRecord,
} from "./webhook-ui.js"

export function WebhookSubscriptionDetailPage({ params }: AdminRoutePageProps) {
  const subscriptionId = params.subscriptionId ?? ""
  const { baseUrl, fetcher } = useVoyantReactContext()
  const queryClient = useQueryClient()
  const t = useWebhookMessages()
  const subscriptionKey = ["operator-webhooks", "subscription", subscriptionId]
  const deliveriesKey = ["operator-webhooks", "deliveries", subscriptionId]
  const [url, setUrl] = useState("")
  const [description, setDescription] = useState("")
  const [selectedEvents, setSelectedEvents] = useState<string[]>([])
  const [secret, setSecret] = useState<string | null>(null)

  const subscription = useQuery({
    queryKey: subscriptionKey,
    queryFn: async () => {
      const response = await fetcher(
        `${baseUrl}/v1/admin/webhooks/subscriptions/${encodeURIComponent(subscriptionId)}`,
      )
      if (!response.ok) throw new Error(t.loadFailed)
      return ((await response.json()) as { data: WebhookSubscriptionRecord }).data
    },
  })
  const catalog = useQuery({
    queryKey: ["operator-webhooks", "events"],
    queryFn: async () => {
      const response = await fetcher(`${baseUrl}/v1/admin/webhooks/events`)
      if (!response.ok) throw new Error(t.loadFailed)
      return ((await response.json()) as { data: WebhookEventRecord[] }).data
    },
  })
  const deliveries = useQuery({
    queryKey: deliveriesKey,
    queryFn: async () => {
      const query = new URLSearchParams({ subscriptionId })
      const response = await fetcher(`${baseUrl}/v1/admin/webhooks/deliveries?${query}`)
      if (!response.ok) throw new Error(t.loadFailed)
      return ((await response.json()) as { data: WebhookDeliveryRecord[] }).data
    },
  })

  useEffect(() => {
    if (!subscription.data) return
    setUrl(subscription.data.url)
    setDescription(subscription.data.description ?? "")
    setSelectedEvents(subscription.data.events)
  }, [subscription.data])

  const mutate = useMutation({
    mutationFn: async (input: { path?: string; method?: string; body?: unknown }) => {
      const response = await fetcher(
        `${baseUrl}/v1/admin/webhooks/subscriptions/${encodeURIComponent(subscriptionId)}${input.path ?? ""}`,
        {
          method: input.method ?? "POST",
          ...(input.body === undefined
            ? {}
            : {
                headers: { "content-type": "application/json" },
                body: JSON.stringify(input.body),
              }),
        },
      )
      if (!response.ok) throw new Error(await responseError(response, t.saveFailed))
      return response.status === 204 ? null : ((await response.json()) as { data: unknown }).data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: subscriptionKey })
      void queryClient.invalidateQueries({ queryKey: deliveriesKey })
      void queryClient.invalidateQueries({ queryKey: ["operator-webhooks", "subscriptions"] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t.saveFailed),
  })

  const save = () =>
    mutate.mutate({
      method: "PATCH",
      body: { url, description: description || null, events: selectedEvents },
    })
  const toggle = () => mutate.mutate({ path: subscription.data?.active ? "/disable" : "/enable" })
  const rotate = async () => {
    if (!window.confirm(t.rotateConfirm)) return
    try {
      const result = (await mutate.mutateAsync({ path: "/rotate-secret" })) as { secret: string }
      setSecret(result.secret)
    } catch {
      // The mutation reports the localized error.
    }
  }
  const remove = async () => {
    if (!window.confirm(t.deleteConfirm)) return
    try {
      await mutate.mutateAsync({ method: "DELETE" })
      window.location.assign("/settings/webhooks")
    } catch {
      // The mutation reports the localized error.
    }
  }
  const replay = async (deliveryId: string) => {
    const response = await fetcher(
      `${baseUrl}/v1/admin/webhooks/deliveries/${encodeURIComponent(deliveryId)}/replay`,
      { method: "POST" },
    )
    if (!response.ok) {
      toast.error(await responseError(response, t.saveFailed))
      return
    }
    void queryClient.invalidateQueries({ queryKey: deliveriesKey })
  }

  if (subscription.isPending || catalog.isPending) {
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!subscription.data) return <p className="p-6 text-sm text-destructive">{t.loadFailed}</p>

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header>
        <Button variant="ghost" className="-ml-3 mb-2" render={<a href="/settings/webhooks" />}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t.back}
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {subscription.data.description || subscription.data.url}
            </h1>
            <p className="mt-1 break-all text-sm text-muted-foreground">{subscription.data.id}</p>
          </div>
          <Badge variant={subscription.data.active ? "default" : "secondary"}>
            {subscription.data.active ? t.active : t.inactive}
          </Badge>
        </div>
      </header>

      {secret ? (
        <Card className="border-amber-500/50">
          <CardHeader>
            <CardTitle className="text-base">{t.secretTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">{t.secretHint}</p>
            <code className="block break-all rounded-md bg-muted p-3 text-sm">{secret}</code>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="detail-webhook-url">{t.endpoint}</Label>
            <Input
              id="detail-webhook-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="detail-webhook-description">{t.descriptionLabel}</Label>
            <Input
              id="detail-webhook-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t.events}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {catalog.data?.map((event) => (
                <Label
                  key={event.id}
                  htmlFor={`detail-webhook-event-${event.id}`}
                  className="flex items-center gap-2 rounded-md border p-2 font-normal"
                >
                  <Checkbox
                    id={`detail-webhook-event-${event.id}`}
                    checked={selectedEvents.includes(event.eventType)}
                    onCheckedChange={(checked) =>
                      setSelectedEvents((current) =>
                        checked === true
                          ? [...current, event.eventType]
                          : current.filter((value) => value !== event.eventType),
                      )
                    }
                  />
                  <span className="font-mono text-xs">{event.eventType}</span>
                </Label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button disabled={selectedEvents.length === 0 || mutate.isPending} onClick={save}>
              {t.save}
            </Button>
            <Button variant="outline" disabled={mutate.isPending} onClick={toggle}>
              {subscription.data.active ? t.disable : t.enable}
            </Button>
            <Button
              variant="outline"
              disabled={mutate.isPending}
              onClick={() => mutate.mutate({ path: "/test", body: {} })}
            >
              {t.test}
            </Button>
            <Button variant="outline" disabled={mutate.isPending} onClick={() => void rotate()}>
              {t.rotate}
            </Button>
            <Button variant="destructive" disabled={mutate.isPending} onClick={() => void remove()}>
              {t.delete}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.deliveries}</CardTitle>
        </CardHeader>
        <CardContent>
          {deliveries.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : deliveries.data?.length ? (
            <div className="divide-y rounded-md border">
              {deliveries.data.map((delivery) => (
                <div key={delivery.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <Badge variant="outline">{delivery.status}</Badge>
                  <span className="font-mono text-xs">{delivery.sourceEvent}</span>
                  <span className="text-muted-foreground">
                    {t.attempt} {delivery.attemptNumber}
                  </span>
                  <span className="text-muted-foreground">
                    {delivery.responseStatus ?? delivery.errorMessage ?? "—"}
                  </span>
                  <Button
                    className="ml-auto"
                    size="sm"
                    variant="ghost"
                    onClick={() => void replay(delivery.id)}
                  >
                    {t.replay}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t.noDeliveries}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
