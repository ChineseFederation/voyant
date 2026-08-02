"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  StorefrontApiKeyKind,
  StorefrontDto,
} from "@voyant-travel/auth/storefront-admin-contracts"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  confirmDialog,
  Input,
  Label,
  Separator,
} from "@voyant-travel/ui/components"
import { AlertTriangle, Check, Copy, KeyRound, Plus, RefreshCw, Trash2, X } from "lucide-react"
import { useState } from "react"

import { useAuthUiI18nOrDefault } from "../i18n/provider.js"
import { authQueryKeys } from "../query-keys.js"
import {
  type StorefrontsAdminApi,
  storefrontApiKeysQueryOptions,
  storefrontChannelBindingQueryOptions,
  storefrontChannelsQueryOptions,
} from "../storefronts-admin-api.js"
import { AccountSection, ProvidersSection } from "./storefront-account-sections.js"

export function StorefrontDetail({
  api,
  storefront,
  businessAccounts,
  manageProviders,
  channelBinding,
  onError,
  onClose,
}: {
  api: StorefrontsAdminApi
  storefront: StorefrontDto
  businessAccounts: boolean
  manageProviders: boolean
  channelBinding: boolean
  onError: (error: string | null) => void
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const copy = useAuthUiI18nOrDefault().messages.storefrontsPage
  const [name, setName] = useState(storefront.name)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: authQueryKeys.storefronts() })

  const rename = useMutation({
    mutationFn: () => api.updateStorefront(storefront.id, { name: name.trim() }),
    onSuccess: () => {
      onError(null)
      void invalidate()
    },
    onError: (error) => onError(error instanceof Error ? error.message : copy.actionFailed),
  })
  const remove = useMutation({
    mutationFn: () => api.deleteStorefront(storefront.id),
    onSuccess: () => {
      onError(null)
      onClose()
      void invalidate()
    },
    onError: (error) => onError(error instanceof Error ? error.message : copy.actionFailed),
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">{storefront.name}</CardTitle>
          <CardDescription>{storefront.slug}</CardDescription>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          <X className="mr-2 h-4 w-4" />
          {copy.detail.close}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <section className="space-y-3">
          <h3 className="text-sm font-medium">{copy.detail.overviewTitle}</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid min-w-[220px] flex-1 gap-2">
              <Label htmlFor={`storefront-name-${storefront.id}`}>{copy.detail.nameLabel}</Label>
              <Input
                id={`storefront-name-${storefront.id}`}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <Button type="button" onClick={() => rename.mutate()} disabled={rename.isPending}>
              {rename.isPending ? copy.detail.saving : copy.detail.save}
            </Button>
          </div>
        </section>

        <Separator />
        <OriginsEditor api={api} storefront={storefront} onError={onError} />

        <Separator />
        <ChannelBindingSection
          api={api}
          storefront={storefront}
          available={channelBinding}
          onError={onError}
        />

        <Separator />
        <KeysSection api={api} storefront={storefront} onError={onError} />

        <Separator />
        <AccountSection
          api={api}
          storefront={storefront}
          businessAccounts={businessAccounts}
          onError={onError}
        />

        <Separator />
        <ProvidersSection
          api={api}
          storefront={storefront}
          manageProviders={manageProviders}
          onError={onError}
        />

        <Separator />
        <div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={remove.isPending}
            onClick={async () => {
              if (
                !(await confirmDialog({
                  description: copy.detail.deleteConfirm,
                  destructive: true,
                }))
              )
                return
              remove.mutate()
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {copy.detail.delete}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ChannelBindingSection({
  api,
  storefront,
  available,
  onError,
}: {
  api: StorefrontsAdminApi
  storefront: StorefrontDto
  available: boolean
  onError: (error: string | null) => void
}) {
  const queryClient = useQueryClient()
  const copy = useAuthUiI18nOrDefault().messages.storefrontsPage
  const [selectedChannelId, setSelectedChannelId] = useState(
    storefront.channelBinding?.channelId ?? "",
  )
  const channelsQuery = useQuery({
    ...storefrontChannelsQueryOptions(api),
    enabled: available,
  })
  const bindingQuery = useQuery({
    ...storefrontChannelBindingQueryOptions(api, storefront.id),
    enabled: available,
  })
  const binding = bindingQuery.data ?? storefront.channelBinding ?? null
  const channels = channelsQuery.data ?? []
  const activeChannels = channels.filter((channel) => channel.status === "active")
  const boundChannel = binding?.channelId
    ? (channels.find((channel) => channel.id === binding.channelId) ?? null)
    : null
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: authQueryKeys.storefrontList() })
    void queryClient.invalidateQueries({
      queryKey: authQueryKeys.storefrontChannelBinding(storefront.id),
    })
  }

  const save = useMutation({
    mutationFn: () => api.setChannelBinding(storefront.id, { channelId: selectedChannelId }),
    onSuccess: (result) => {
      onError(null)
      queryClient.setQueryData(authQueryKeys.storefrontChannelBinding(storefront.id), result)
      void invalidate()
    },
    onError: (error) => onError(error instanceof Error ? error.message : copy.actionFailed),
  })
  const clear = useMutation({
    mutationFn: () => api.clearChannelBinding(storefront.id),
    onSuccess: () => {
      onError(null)
      setSelectedChannelId("")
      queryClient.setQueryData(authQueryKeys.storefrontChannelBinding(storefront.id), null)
      void invalidate()
    },
    onError: (error) => onError(error instanceof Error ? error.message : copy.actionFailed),
  })

  if (!available) {
    return (
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">{copy.channel.title}</h3>
          <p className="text-xs text-muted-foreground">{copy.channel.unavailable}</p>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">{copy.channel.title}</h3>
        <p className="text-xs text-muted-foreground">{copy.channel.description}</p>
      </div>
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{copy.channel.defaultDeny}</span>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`storefront-channel-${storefront.id}`}>{copy.channel.selectLabel}</Label>
        <select
          id={`storefront-channel-${storefront.id}`}
          value={selectedChannelId}
          disabled={channelsQuery.isPending || activeChannels.length === 0}
          onChange={(event) => setSelectedChannelId(event.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">{copy.channel.selectPlaceholder}</option>
          {activeChannels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.name}
            </option>
          ))}
        </select>
      </div>
      {channelsQuery.isPending || bindingQuery.isPending ? (
        <p className="text-xs text-muted-foreground">{copy.channel.loading}</p>
      ) : activeChannels.length === 0 ? (
        <p className="text-xs text-muted-foreground">{copy.channel.noActiveChannels}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={binding?.channelStatus === "active" ? "default" : "secondary"}>
          {binding
            ? copy.channel.boundStatus
                .replace(
                  "{channel}",
                  binding.channelName ?? boundChannel?.name ?? binding.channelId,
                )
                .replace("{status}", binding.channelStatus)
            : copy.channel.unboundStatus}
        </Badge>
        {boundChannel && boundChannel.status !== "active" ? (
          <span className="text-xs text-destructive">{copy.channel.inactiveWarning}</span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={
            !selectedChannelId || save.isPending || selectedChannelId === binding?.channelId
          }
          onClick={() => save.mutate()}
        >
          {save.isPending ? copy.channel.saving : copy.channel.save}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!binding || clear.isPending}
          onClick={async () => {
            if (
              await confirmDialog({
                description: copy.channel.clearConfirm,
                confirmLabel: copy.channel.clear,
                destructive: true,
              })
            ) {
              clear.mutate()
            }
          }}
        >
          {copy.channel.clear}
        </Button>
      </div>
    </section>
  )
}

function OriginsEditor({
  api,
  storefront,
  onError,
}: {
  api: StorefrontsAdminApi
  storefront: StorefrontDto
  onError: (error: string | null) => void
}) {
  const queryClient = useQueryClient()
  const copy = useAuthUiI18nOrDefault().messages.storefrontsPage
  const [draft, setDraft] = useState("")

  const save = useMutation({
    mutationFn: (origins: string[]) => api.setAllowedOrigins(storefront.id, origins),
    onSuccess: () => {
      onError(null)
      void queryClient.invalidateQueries({ queryKey: authQueryKeys.storefrontList() })
    },
    onError: (error) => onError(error instanceof Error ? error.message : copy.actionFailed),
  })

  const addOrigin = () => {
    const value = draft.trim()
    if (!value) return
    setDraft("")
    save.mutate([...storefront.allowedOrigins, value])
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">{copy.origins.title}</h3>
        <p className="text-xs text-muted-foreground">{copy.origins.description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          value={draft}
          placeholder={copy.origins.addPlaceholder}
          className="min-w-[220px] flex-1"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              addOrigin()
            }
          }}
        />
        <Button type="button" variant="outline" onClick={addOrigin} disabled={save.isPending}>
          <Plus className="mr-2 h-4 w-4" />
          {copy.origins.add}
        </Button>
      </div>
      {storefront.allowedOrigins.length === 0 ? (
        <p className="text-xs text-muted-foreground">{copy.origins.empty}</p>
      ) : (
        <ul className="space-y-2">
          {storefront.allowedOrigins.map((origin) => (
            <li
              key={origin}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <span className="font-mono text-xs">{origin}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={save.isPending}
                onClick={() =>
                  save.mutate(storefront.allowedOrigins.filter((entry) => entry !== origin))
                }
              >
                {copy.origins.remove}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{copy.origins.localhostHint}</p>
    </section>
  )
}

function KeysSection({
  api,
  storefront,
  onError,
}: {
  api: StorefrontsAdminApi
  storefront: StorefrontDto
  onError: (error: string | null) => void
}) {
  const queryClient = useQueryClient()
  const { messages, formatDateTime } = useAuthUiI18nOrDefault()
  const copy = messages.storefrontsPage.keys
  const keysQuery = useQuery(storefrontApiKeysQueryOptions(api, storefront.id))
  const [issuedToken, setIssuedToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: authQueryKeys.storefrontApiKeys(storefront.id) })

  const issue = useMutation({
    mutationFn: (kind: StorefrontApiKeyKind) => api.issueApiKey(storefront.id, { kind }),
    onSuccess: (result) => {
      onError(null)
      setCopied(false)
      // Reveal-once: the plaintext token is captured here and never re-fetched;
      // the list query only ever returns the non-secret preview.
      setIssuedToken(result.token)
      void invalidate()
    },
    onError: (error) => onError(error instanceof Error ? error.message : copy.title),
  })
  const rotate = useMutation({
    mutationFn: (keyId: string) => api.rotateApiKey(storefront.id, keyId),
    onSuccess: (result) => {
      onError(null)
      setCopied(false)
      setIssuedToken(result.token)
      void invalidate()
    },
    onError: (error) => onError(error instanceof Error ? error.message : copy.title),
  })
  const revoke = useMutation({
    mutationFn: (keyId: string) => api.revokeApiKey(storefront.id, keyId),
    onSuccess: () => {
      onError(null)
      void invalidate()
    },
    onError: (error) => onError(error instanceof Error ? error.message : copy.title),
  })

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">{copy.title}</h3>
        <p className="text-xs text-muted-foreground">{copy.description}</p>
      </div>

      {issuedToken ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <KeyRound className="h-4 w-4" />
              {copy.revealTitle}
            </CardTitle>
            <CardDescription>{copy.revealDescription}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Input value={issuedToken} readOnly className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(issuedToken)
                setCopied(true)
              }}
            >
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? copy.copied : copy.copy}
            </Button>
            <Button type="button" onClick={() => setIssuedToken(null)}>
              {copy.dismiss}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={issue.isPending}
          onClick={() => issue.mutate("publishable")}
        >
          <Plus className="mr-2 h-4 w-4" />
          {copy.issuePublishable}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={issue.isPending}
          onClick={() => issue.mutate("secret")}
        >
          <Plus className="mr-2 h-4 w-4" />
          {copy.issueSecret}
        </Button>
      </div>

      {keysQuery.data && keysQuery.data.length > 0 ? (
        <ul className="space-y-2">
          {keysQuery.data.map((key) => (
            <li
              key={key.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs">{key.tokenPreview}…</span>
                <Badge variant="outline">
                  {key.kind === "secret" ? copy.kindSecret : copy.kindPublishable}
                </Badge>
                <Badge variant={key.revokedAt ? "secondary" : "default"}>
                  {key.revokedAt ? copy.revoked : copy.active}
                </Badge>
                {key.name ? (
                  <span className="text-xs text-muted-foreground">{key.name}</span>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(key.createdAt)}
                </span>
              </div>
              {key.revokedAt ? null : (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={rotate.isPending}
                    onClick={async () => {
                      if (!(await confirmDialog(copy.rotateConfirm))) return
                      rotate.mutate(key.id)
                    }}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {copy.rotate}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={revoke.isPending}
                    onClick={async () => {
                      if (
                        !(await confirmDialog({
                          description: copy.revokeConfirm,
                          destructive: true,
                        }))
                      )
                        return
                      revoke.mutate(key.id)
                    }}
                  >
                    {copy.revoke}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{copy.empty}</p>
      )}
    </section>
  )
}
