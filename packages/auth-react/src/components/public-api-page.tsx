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
  Input,
  Label,
  Skeleton,
} from "@voyant-travel/ui/components"
import { Loader2, Plus, RefreshCw, X } from "lucide-react"
import { type FormEvent, useMemo, useState } from "react"

import { useAuthUiI18nOrDefault } from "../i18n/provider.js"
import {
  createPublicApiAdminApi,
  type IssuedPublicApiKey,
  type PublicApiAdminApi,
  type PublicApiKey,
  publicApiChannelsQueryOptions,
  publicApiKeysQueryOptions,
} from "../public-api-admin-api.js"
import { authQueryKeys } from "../query-keys.js"

export interface PublicApiPageProps {
  api?: PublicApiAdminApi
}

export function PublicApiPage({ api: apiProp }: PublicApiPageProps = {}) {
  if (apiProp) return <PublicApiView api={apiProp} />
  return <PublicApiPageWithRuntime />
}

function PublicApiPageWithRuntime() {
  const { baseUrl, fetcher } = useVoyantReactContext()
  const api = useMemo(() => createPublicApiAdminApi(baseUrl, fetcher), [baseUrl, fetcher])
  return <PublicApiView api={api} />
}

function PublicApiView({ api }: { api: PublicApiAdminApi }) {
  const copy = useAuthUiI18nOrDefault().messages.publicApiPage
  const queryClient = useQueryClient()
  const [actionError, setActionError] = useState<string | null>(null)
  const [issued, setIssued] = useState<IssuedPublicApiKey | null>(null)

  const keysQuery = useQuery(publicApiKeysQueryOptions(api))
  const channelsQuery = useQuery(publicApiChannelsQueryOptions(api))

  const isLoading = keysQuery.isPending
  const loadFailed = keysQuery.isError
  // Refresh has to retry everything the banner speaks for. Refetching only the
  // list left a failed sibling query reporting an error no click could clear,
  // which reads as an outage the page can never recover from (#4342).
  const refresh = () => {
    void keysQuery.refetch()
    void channelsQuery.refetch()
  }

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: authQueryKeys.publicApiKeys() })

  const issueMutation = useMutation({
    mutationFn: (input: Parameters<PublicApiAdminApi["issueKey"]>[0]) => api.issueKey(input),
    onSuccess: async (key) => {
      setIssued(key)
      setActionError(null)
      await invalidate()
    },
    onError: (error: unknown) =>
      setActionError(error instanceof Error ? error.message : copy.issue.failed),
  })

  const rotateMutation = useMutation({
    mutationFn: (keyId: string) => api.rotateKey(keyId),
    onSuccess: async (key) => {
      setIssued(key)
      setActionError(null)
      await invalidate()
    },
    onError: (error: unknown) =>
      setActionError(error instanceof Error ? error.message : copy.actionFailed),
  })

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => api.revokeKey(keyId),
    onSuccess: async () => {
      setActionError(null)
      await invalidate()
    },
    onError: (error: unknown) =>
      setActionError(error instanceof Error ? error.message : copy.actionFailed),
  })

  const updateMutation = useMutation({
    mutationFn: (input: { keyId: string; allowedOrigins?: string[]; channelId?: string | null }) =>
      api.updateKey(input.keyId, {
        ...(input.allowedOrigins ? { allowedOrigins: input.allowedOrigins } : {}),
        ...(input.channelId !== undefined ? { channelId: input.channelId } : {}),
      }),
    onSuccess: async () => {
      setActionError(null)
      await invalidate()
    },
    onError: (error: unknown) =>
      setActionError(error instanceof Error ? error.message : copy.actionFailed),
  })

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{copy.title}</h1>
          <p className="text-sm text-muted-foreground">{copy.description}</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="mr-2 size-4" />
          {copy.refresh}
        </Button>
      </div>

      {loadFailed ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">{copy.loadFailed}</CardContent>
        </Card>
      ) : null}
      {actionError ? (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">{actionError}</CardContent>
        </Card>
      ) : null}

      {issued ? (
        <IssuedKeyCard token={issued.token} copy={copy} onDismiss={() => setIssued(null)} />
      ) : null}

      <IssueKeyForm
        copy={copy}
        channels={channelsQuery.data ?? []}
        pending={issueMutation.isPending}
        onSubmit={(input) => issueMutation.mutate(input)}
      />

      <Card>
        <CardHeader>
          <CardTitle>{copy.list.title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isLoading ? (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </>
          ) : (keysQuery.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">{copy.list.empty}</p>
          ) : (
            keysQuery.data?.map((key) => (
              <KeyRow
                key={key.id}
                apiKey={key}
                copy={copy}
                channels={channelsQuery.data ?? []}
                rotating={rotateMutation.isPending}
                onRotate={() => rotateMutation.mutate(key.id)}
                onRevoke={() => {
                  if (globalThis.confirm?.(copy.key.revokeConfirm) === false) return
                  revokeMutation.mutate(key.id)
                }}
                onSave={(allowedOrigins, channelId) =>
                  updateMutation.mutate({ keyId: key.id, allowedOrigins, channelId })
                }
                saving={updateMutation.isPending}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

type Copy = ReturnType<typeof useAuthUiI18nOrDefault>["messages"]["publicApiPage"]
type ChannelOption = { id: string; name: string; status: string }

function IssuedKeyCard({
  token,
  copy,
  onDismiss,
}: {
  token: string
  copy: Copy
  onDismiss: () => void
}) {
  const [copied, setCopied] = useState(false)
  return (
    <Card className="border-primary">
      <CardHeader>
        <CardTitle>{copy.token.title}</CardTitle>
        <CardDescription>{copy.token.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <code className="block break-all rounded bg-muted p-3 font-mono text-sm">{token}</code>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              void navigator.clipboard?.writeText(token).then(() => setCopied(true))
            }}
          >
            {copied ? copy.token.copied : copy.token.copy}
          </Button>
          <Button size="sm" variant="outline" onClick={onDismiss}>
            {copy.token.done}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function IssueKeyForm({
  copy,
  channels,
  pending,
  onSubmit,
}: {
  copy: Copy
  channels: ChannelOption[]
  pending: boolean
  onSubmit: (input: {
    kind: "publishable" | "secret"
    name?: string | null
    allowedOrigins?: string[]
    channelId?: string | null
  }) => void
}) {
  const [kind, setKind] = useState<"publishable" | "secret">("publishable")
  const [name, setName] = useState("")
  const [origins, setOrigins] = useState("")
  const [channelId, setChannelId] = useState("")
  const [error, setError] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const allowedOrigins = origins
      .split(/[\s,]+/)
      .map((value) => value.trim())
      .filter(Boolean)
    if (kind === "publishable" && allowedOrigins.length === 0) {
      setError(copy.issue.originsRequired)
      return
    }
    setError(null)
    onSubmit({
      kind,
      name: name.trim() || null,
      allowedOrigins,
      channelId: channelId || null,
    })
    setName("")
    setOrigins("")
    setChannelId("")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.issue.title}</CardTitle>
        <CardDescription>{copy.issue.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="public-api-kind">{copy.issue.kindLabel}</Label>
            <select
              id="public-api-kind"
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
              value={kind}
              onChange={(event) => setKind(event.target.value as "publishable" | "secret")}
            >
              <option value="publishable">{copy.issue.kindPublishable}</option>
              <option value="secret">{copy.issue.kindSecret}</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="public-api-name">{copy.issue.nameLabel}</Label>
            <Input
              id="public-api-name"
              value={name}
              placeholder={copy.issue.namePlaceholder}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="public-api-origins">{copy.issue.originsLabel}</Label>
            <Input
              id="public-api-origins"
              value={origins}
              placeholder={copy.issue.originsPlaceholder}
              onChange={(event) => setOrigins(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="public-api-channel">{copy.issue.channelLabel}</Label>
            <select
              id="public-api-channel"
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
              value={channelId}
              onChange={(event) => setChannelId(event.target.value)}
            >
              <option value="">{copy.issue.channelDirectOption}</option>
              {channels
                .filter((channel) => channel.status === "active")
                .map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
            </select>
          </div>
          {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Plus className="mr-2 size-4" />
              )}
              {pending ? copy.issue.submitting : copy.issue.submit}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function KeyRow({
  apiKey,
  copy,
  channels,
  rotating,
  saving,
  onRotate,
  onRevoke,
  onSave,
}: {
  apiKey: PublicApiKey
  copy: Copy
  channels: ChannelOption[]
  rotating: boolean
  saving: boolean
  onRotate: () => void
  onRevoke: () => void
  onSave: (allowedOrigins: string[], channelId: string | null) => void
}) {
  const [origins, setOrigins] = useState(apiKey.allowedOrigins.join(", "))
  const [channelId, setChannelId] = useState(apiKey.channelId ?? "")
  const revoked = Boolean(apiKey.revokedAt)

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <code className="font-mono text-sm">{apiKey.tokenPreview}…</code>
        <Badge variant={apiKey.kind === "secret" ? "destructive" : "secondary"}>
          {apiKey.kind === "secret" ? copy.list.secretBadge : copy.list.publishableBadge}
        </Badge>
        {revoked ? <Badge variant="outline">{copy.list.revokedBadge}</Badge> : null}
        {apiKey.name ? <span className="text-sm">{apiKey.name}</span> : null}
        <span className="text-xs text-muted-foreground">
          {copy.list.originsSummary(apiKey.allowedOrigins.length)}
        </span>
        <span className="text-xs text-muted-foreground">
          {apiKey.channel?.implicit
            ? copy.list.channelImplicit
            : (apiKey.channel?.channelName ?? copy.list.channelDirect)}
        </span>
        {!apiKey.lastUsedAt ? (
          <span className="text-xs text-muted-foreground">{copy.list.lastUsedNever}</span>
        ) : null}
      </div>

      {revoked ? null : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`origins-${apiKey.id}`}>{copy.key.originsTitle}</Label>
              <Input
                id={`origins-${apiKey.id}`}
                value={origins}
                onChange={(event) => setOrigins(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{copy.key.originsDescription}</p>
              <p className="text-xs text-muted-foreground">{copy.key.localhostHint}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`channel-${apiKey.id}`}>{copy.key.channelTitle}</Label>
              <select
                id={`channel-${apiKey.id}`}
                className="h-9 rounded-md border bg-transparent px-3 text-sm"
                value={channelId}
                onChange={(event) => setChannelId(event.target.value)}
              >
                <option value="">{copy.list.channelImplicit}</option>
                {channels
                  .filter((channel) => channel.status === "active")
                  .map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name}
                    </option>
                  ))}
              </select>
              <p className="text-xs text-muted-foreground">{copy.key.channelDescription}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={saving}
              onClick={() =>
                onSave(
                  origins
                    .split(/[\s,]+/)
                    .map((value) => value.trim())
                    .filter(Boolean),
                  channelId || null,
                )
              }
            >
              {saving ? copy.key.saving : copy.key.save}
            </Button>
            <Button size="sm" variant="outline" disabled={rotating} onClick={onRotate}>
              {rotating ? copy.key.rotating : copy.key.rotate}
            </Button>
            <Button size="sm" variant="ghost" onClick={onRevoke}>
              <X className="mr-1 size-4" />
              {copy.key.revoke}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
