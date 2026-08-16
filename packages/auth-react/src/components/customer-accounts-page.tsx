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
import { RefreshCw } from "lucide-react"
import { type FormEvent, useMemo, useState } from "react"

import { useAuthUiI18nOrDefault } from "../i18n/provider.js"
import {
  type CustomerAccountSettings,
  type CustomerAccountsAdminApi,
  type CustomerSocialProvider,
  createCustomerAccountsAdminApi,
  customerAccountCapabilitiesQueryOptions,
  customerAccountCredentialsQueryOptions,
  customerAccountSettingsQueryOptions,
} from "../public-api-admin-api.js"
import { authQueryKeys } from "../query-keys.js"

export interface CustomerAccountsPageProps {
  api?: CustomerAccountsAdminApi
}

export function CustomerAccountsPage({ api: apiProp }: CustomerAccountsPageProps = {}) {
  if (apiProp) return <CustomerAccountsView api={apiProp} />
  return <CustomerAccountsPageWithRuntime />
}

function CustomerAccountsPageWithRuntime() {
  const { baseUrl, fetcher } = useVoyantReactContext()
  const api = useMemo(() => createCustomerAccountsAdminApi(baseUrl, fetcher), [baseUrl, fetcher])
  return <CustomerAccountsView api={api} />
}

type Copy = ReturnType<typeof useAuthUiI18nOrDefault>["messages"]["customerAccountsPage"]
const SOCIAL_PROVIDERS: CustomerSocialProvider[] = ["google", "facebook", "apple"]

function CustomerAccountsView({ api }: { api: CustomerAccountsAdminApi }) {
  const copy = useAuthUiI18nOrDefault().messages.customerAccountsPage
  const queryClient = useQueryClient()
  const [actionError, setActionError] = useState<string | null>(null)

  const capabilitiesQuery = useQuery(customerAccountCapabilitiesQueryOptions(api))
  const settingsQuery = useQuery(customerAccountSettingsQueryOptions(api))
  const credentialsQuery = useQuery(customerAccountCredentialsQueryOptions(api))

  const isLoading = settingsQuery.isPending || capabilitiesQuery.isPending
  const loadFailed = settingsQuery.isError || capabilitiesQuery.isError || credentialsQuery.isError
  // Refresh has to retry everything the banner speaks for; refetching one query
  // leaves a failed sibling reporting an error no click can clear (#4342).
  const refresh = () => {
    void capabilitiesQuery.refetch()
    void settingsQuery.refetch()
    void credentialsQuery.refetch()
  }

  const onError = (error: unknown) =>
    setActionError(error instanceof Error ? error.message : copy.actionFailed)

  const methodsMutation = useMutation({
    mutationFn: (methods: CustomerAccountSettings["methods"]) => api.updateMethods(methods),
    onSuccess: async () => {
      setActionError(null)
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.customerAccountSettings() })
    },
    onError,
  })

  const policyMutation = useMutation({
    mutationFn: (policy: CustomerAccountSettings["accountPolicy"]) =>
      api.updateAccountPolicy(policy),
    onSuccess: async () => {
      setActionError(null)
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.customerAccountSettings() })
    },
    onError,
  })

  const credentialMutation = useMutation({
    mutationFn: (input: {
      provider: CustomerSocialProvider
      credentials: Record<string, unknown>
    }) => api.putProviderCredential(input.provider, input.credentials),
    onSuccess: async () => {
      setActionError(null)
      await queryClient.invalidateQueries({
        queryKey: authQueryKeys.customerAccountCredentials(),
      })
    },
    onError,
  })

  const removeCredentialMutation = useMutation({
    mutationFn: (provider: CustomerSocialProvider) => api.deleteProviderCredential(provider),
    onSuccess: async () => {
      setActionError(null)
      await queryClient.invalidateQueries({
        queryKey: authQueryKeys.customerAccountCredentials(),
      })
    },
    onError,
  })

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
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
      {capabilitiesQuery.data && !capabilitiesQuery.data.businessAccounts ? (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            {copy.businessUnsupported}
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : settingsQuery.data ? (
        <>
          <MethodsCard
            copy={copy}
            settings={settingsQuery.data}
            pending={methodsMutation.isPending}
            onSave={(methods) => methodsMutation.mutate(methods)}
          />
          <PolicyCard
            copy={copy}
            settings={settingsQuery.data}
            businessAccounts={capabilitiesQuery.data?.businessAccounts ?? false}
            pending={policyMutation.isPending}
            onSave={(policy) => policyMutation.mutate(policy)}
          />
          <CredentialsCard
            copy={copy}
            statuses={credentialsQuery.data ?? []}
            pending={credentialMutation.isPending}
            onSave={(provider, credentials) => credentialMutation.mutate({ provider, credentials })}
            onRemove={(provider) => {
              if (globalThis.confirm?.(copy.credentials.removeConfirm) === false) return
              removeCredentialMutation.mutate(provider)
            }}
          />
        </>
      ) : null}
    </div>
  )
}

function MethodsCard({
  copy,
  settings,
  pending,
  onSave,
}: {
  copy: Copy
  settings: CustomerAccountSettings
  pending: boolean
  onSave: (methods: CustomerAccountSettings["methods"]) => void
}) {
  const [methods, setMethods] = useState(settings.methods)
  const [error, setError] = useState<string | null>(null)
  const toggle = (key: keyof CustomerAccountSettings["methods"]) =>
    setMethods((current) => ({ ...current, [key]: !current[key] }))

  const labels: [keyof CustomerAccountSettings["methods"], string][] = [
    ["emailCode", copy.methods.emailCode],
    ["emailPassword", copy.methods.emailPassword],
    ["google", copy.methods.google],
    ["facebook", copy.methods.facebook],
    ["apple", copy.methods.apple],
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.methods.title}</CardTitle>
        <CardDescription>{copy.methods.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {labels.map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={methods[key]} onChange={() => toggle(key)} />
            {label}
          </label>
        ))}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div>
          <Button
            size="sm"
            disabled={pending}
            onClick={() => {
              if (!Object.values(methods).some(Boolean)) {
                setError(copy.methods.atLeastOne)
                return
              }
              setError(null)
              onSave(methods)
            }}
          >
            {pending ? copy.methods.saving : copy.methods.save}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function PolicyCard({
  copy,
  settings,
  businessAccounts,
  pending,
  onSave,
}: {
  copy: Copy
  settings: CustomerAccountSettings
  businessAccounts: boolean
  pending: boolean
  onSave: (policy: CustomerAccountSettings["accountPolicy"]) => void
}) {
  const [policy, setPolicy] = useState(settings.accountPolicy)
  const allows = (kind: "personal" | "business") => policy.allowedKinds.includes(kind)

  const toggleKind = (kind: "personal" | "business") =>
    setPolicy((current) => {
      const allowedKinds = allows(kind)
        ? current.allowedKinds.filter((value) => value !== kind)
        : [...current.allowedKinds, kind]
      return {
        ...current,
        allowedKinds,
        // The runtime rejects a policy whose signup settings contradict its
        // allowed kinds, so mirror the rule here rather than letting the
        // operator submit something that can only come back as a 400.
        ...(kind === "personal" && allows(kind) ? { personalSignup: "disabled" as const } : {}),
        ...(kind === "business"
          ? allows(kind)
            ? { businessOnboarding: "disabled" as const }
            : { businessOnboarding: "request" as const }
          : {}),
      }
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.policy.title}</CardTitle>
        <CardDescription>{copy.policy.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>{copy.policy.allowedKinds}</Label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allows("personal")}
              onChange={() => toggleKind("personal")}
            />
            {copy.policy.personal}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allows("business")}
              disabled={!businessAccounts}
              onChange={() => toggleKind("business")}
            />
            {copy.policy.business}
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="personal-signup">{copy.policy.personalSignup}</Label>
          <select
            id="personal-signup"
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
            value={policy.personalSignup}
            disabled={!allows("personal")}
            onChange={(event) =>
              setPolicy((current) => ({
                ...current,
                personalSignup: event.target.value as "open" | "disabled",
              }))
            }
          >
            <option value="open">{copy.policy.personalSignupOpen}</option>
            <option value="disabled">{copy.policy.personalSignupDisabled}</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="business-onboarding">{copy.policy.businessOnboarding}</Label>
          <select
            id="business-onboarding"
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
            value={policy.businessOnboarding}
            disabled={!allows("business")}
            onChange={(event) =>
              setPolicy((current) => ({
                ...current,
                businessOnboarding: event.target.value as
                  | "disabled"
                  | "open"
                  | "request"
                  | "invite-only",
              }))
            }
          >
            <option value="disabled">{copy.policy.onboardingDisabled}</option>
            <option value="open">{copy.policy.onboardingOpen}</option>
            <option value="request">{copy.policy.onboardingRequest}</option>
            <option value="invite-only">{copy.policy.onboardingInvite}</option>
          </select>
        </div>

        <div>
          <Button size="sm" disabled={pending} onClick={() => onSave(policy)}>
            {pending ? copy.policy.saving : copy.policy.save}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function CredentialsCard({
  copy,
  statuses,
  pending,
  onSave,
  onRemove,
}: {
  copy: Copy
  statuses: { provider: string; configured: boolean; updatedAt: string | null }[]
  pending: boolean
  onSave: (provider: CustomerSocialProvider, credentials: Record<string, unknown>) => void
  onRemove: (provider: CustomerSocialProvider) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.credentials.title}</CardTitle>
        <CardDescription>{copy.credentials.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {SOCIAL_PROVIDERS.map((provider) => {
          const status = statuses.find((entry) => entry.provider === provider)
          return (
            <CredentialRow
              key={provider}
              provider={provider}
              configured={status?.configured ?? false}
              updatedAt={status?.updatedAt ?? null}
              copy={copy}
              pending={pending}
              onSave={onSave}
              onRemove={onRemove}
            />
          )
        })}
      </CardContent>
    </Card>
  )
}

function CredentialRow({
  provider,
  configured,
  updatedAt,
  copy,
  pending,
  onSave,
  onRemove,
}: {
  provider: CustomerSocialProvider
  configured: boolean
  updatedAt: string | null
  copy: Copy
  pending: boolean
  onSave: (provider: CustomerSocialProvider, credentials: Record<string, unknown>) => void
  onRemove: (provider: CustomerSocialProvider) => void
}) {
  const [clientId, setClientId] = useState("")
  const [clientSecret, setClientSecret] = useState("")

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSave(provider, { clientId: clientId.trim(), clientSecret: clientSecret.trim() })
    setClientId("")
    setClientSecret("")
  }

  return (
    <form className="flex flex-col gap-2 rounded-lg border p-4" onSubmit={submit}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium capitalize">{provider}</span>
        <Badge variant={configured ? "secondary" : "outline"}>
          {configured ? copy.credentials.configured : copy.credentials.notConfigured}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {copy.credentials.updatedAt}: {updatedAt ?? copy.credentials.never}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${provider}-client-id`}>{copy.credentials.clientIdLabel}</Label>
          <Input
            id={`${provider}-client-id`}
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${provider}-client-secret`}>{copy.credentials.clientSecretLabel}</Label>
          <Input
            id={`${provider}-client-secret`}
            type="password"
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={pending || !clientId || !clientSecret}>
          {pending ? copy.credentials.saving : copy.credentials.save}
        </Button>
        {configured ? (
          <Button size="sm" type="button" variant="ghost" onClick={() => onRemove(provider)}>
            {copy.credentials.remove}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
