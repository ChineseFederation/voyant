"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  OperatorStorefrontHostingKind,
  StorefrontDto,
} from "@voyant-travel/auth/storefront-admin-contracts"
import { useVoyantReactContext } from "@voyant-travel/react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Input,
  Label,
  Skeleton,
} from "@voyant-travel/ui/components"
import { Loader2, Plus, RefreshCw } from "lucide-react"
import { type FormEvent, useMemo, useState } from "react"

import { useAuthUiI18nOrDefault } from "../i18n/provider.js"
import { authQueryKeys } from "../query-keys.js"
import {
  createStorefrontsAdminApi,
  type StorefrontsAdminApi,
  storefrontCapabilitiesQueryOptions,
  storefrontListQueryOptions,
} from "../storefronts-admin-api.js"
import { StorefrontDetail } from "./storefront-detail.js"

export interface StorefrontsPageProps {
  api?: StorefrontsAdminApi
}

export function StorefrontsPage({ api: apiProp }: StorefrontsPageProps = {}) {
  if (apiProp) return <StorefrontsView api={apiProp} />
  return <StorefrontsPageWithRuntime />
}

function StorefrontsPageWithRuntime() {
  const { baseUrl, fetcher } = useVoyantReactContext()
  const api = useMemo(() => createStorefrontsAdminApi(baseUrl, fetcher), [baseUrl, fetcher])
  return <StorefrontsView api={api} />
}

function StorefrontsView({ api }: { api: StorefrontsAdminApi }) {
  const copy = useAuthUiI18nOrDefault().messages.storefrontsPage
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const capabilitiesQuery = useQuery(storefrontCapabilitiesQueryOptions(api))
  const listQuery = useQuery(storefrontListQueryOptions(api))
  const capabilities = capabilitiesQuery.data

  const selected = listQuery.data?.find((storefront) => storefront.id === selectedId) ?? null
  const isLoading = capabilitiesQuery.isPending || listQuery.isPending
  const loadFailed = capabilitiesQuery.isError || listQuery.isError
  // Refresh has to retry everything the banner speaks for. Refetching only the
  // list left a failed capabilities query reporting an error no click could
  // clear, which reads as an outage the page can never recover from (#4342).
  const refresh = () => {
    void capabilitiesQuery.refetch()
    void listQuery.refetch()
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{copy.title}</h1>
          <p className="text-sm text-muted-foreground">{copy.description}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {copy.refresh}
        </Button>
      </div>

      {loadFailed || actionError ? (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError ?? copy.loadFailed}
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-3" role="status" aria-label={copy.loading}>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          <CreateStorefrontForm api={api} onError={setActionError} />
          <StorefrontList
            storefronts={listQuery.data ?? []}
            selectedId={selectedId}
            onSelect={(id) => {
              setActionError(null)
              setSelectedId((current) => (current === id ? null : id))
            }}
          />
          {selected ? (
            <StorefrontDetail
              key={selected.id}
              api={api}
              storefront={selected}
              businessAccounts={capabilities?.businessAccounts ?? false}
              manageProviders={capabilities?.manageProviders ?? false}
              channelBinding={capabilities?.channelBinding ?? false}
              onError={setActionError}
              onClose={() => setSelectedId(null)}
            />
          ) : null}
        </>
      )}
    </div>
  )
}

function CreateStorefrontForm({
  api,
  onError,
}: {
  api: StorefrontsAdminApi
  onError: (error: string | null) => void
}) {
  const queryClient = useQueryClient()
  const copy = useAuthUiI18nOrDefault().messages.storefrontsPage.create
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [hostingKind, setHostingKind] = useState<OperatorStorefrontHostingKind>("external")
  const [siteId, setSiteId] = useState("")

  const create = useMutation({
    mutationFn: () =>
      api.createStorefront({
        name: name.trim(),
        slug: slug.trim(),
        hostingKind,
        siteId: hostingKind === "cloud_site" ? siteId.trim() || null : null,
        allowedOrigins: [],
        methods: {
          emailCode: true,
          emailPassword: false,
          google: false,
          facebook: false,
          apple: false,
        },
      }),
    onSuccess: () => {
      onError(null)
      setName("")
      setSlug("")
      setSiteId("")
      setHostingKind("external")
      void queryClient.invalidateQueries({ queryKey: authQueryKeys.storefrontList() })
    },
    onError: (error) => onError(error instanceof Error ? error.message : copy.createFailed),
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim()) {
      onError(copy.nameRequired)
      return
    }
    if (!slug.trim()) {
      onError(copy.slugRequired)
      return
    }
    onError(null)
    create.mutate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="storefront-name">{copy.nameLabel}</Label>
            <Input
              id="storefront-name"
              value={name}
              placeholder={copy.namePlaceholder}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="storefront-slug">{copy.slugLabel}</Label>
            <Input
              id="storefront-slug"
              value={slug}
              placeholder={copy.slugPlaceholder}
              onChange={(event) => setSlug(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="storefront-hosting">{copy.hostingLabel}</Label>
            <select
              id="storefront-hosting"
              value={hostingKind}
              onChange={(event) =>
                setHostingKind(event.target.value as OperatorStorefrontHostingKind)
              }
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="external">{copy.hostingExternal}</option>
              <option value="cloud_site">{copy.hostingCloudSite}</option>
            </select>
          </div>
          {hostingKind === "cloud_site" ? (
            <div className="grid gap-2">
              <Label htmlFor="storefront-site">{copy.siteIdLabel}</Label>
              <Input
                id="storefront-site"
                value={siteId}
                placeholder={copy.siteIdPlaceholder}
                onChange={(event) => setSiteId(event.target.value)}
              />
            </div>
          ) : null}
          <div className="md:col-span-2">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {create.isPending ? copy.submitting : copy.submit}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function StorefrontList({
  storefronts,
  selectedId,
  onSelect,
}: {
  storefronts: readonly StorefrontDto[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const copy = useAuthUiI18nOrDefault().messages.storefrontsPage.list
  if (storefronts.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">{copy.empty}</CardContent>
      </Card>
    )
  }
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{copy.title}</h2>
      {storefronts.map((storefront) => (
        <button
          key={storefront.id}
          type="button"
          onClick={() => onSelect(storefront.id)}
          className={cn(
            "w-full rounded-lg border p-4 text-left transition-colors hover:bg-muted/50",
            selectedId === storefront.id && "border-primary bg-primary/5",
          )}
          aria-pressed={selectedId === storefront.id}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{storefront.name}</span>
            <Badge variant="outline">
              {storefront.hostingKind === "cloud_site" ? copy.cloudSiteBadge : copy.externalBadge}
            </Badge>
            <span className="text-xs text-muted-foreground">{storefront.slug}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {copy.originsSummary(storefront.allowedOrigins.length)}
          </p>
        </button>
      ))}
    </div>
  )
}
