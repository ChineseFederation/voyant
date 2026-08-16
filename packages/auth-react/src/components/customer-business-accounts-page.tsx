"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  CustomerBusinessAccountProvisionInput,
  CustomerBusinessAccountRequestDto,
} from "@voyant-travel/auth/customer-business-accounts"
import { useVoyantReactContext } from "@voyant-travel/react"
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
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components"
import { Building2, Check, Loader2, X } from "lucide-react"
import { type FormEvent, useMemo, useState } from "react"

import {
  type CustomerBusinessAccountsAdminApi,
  createCustomerBusinessAccountsAdminApi,
  customerBusinessAccountCapabilitiesQueryOptions,
  customerBusinessAccountRequestsQueryOptions,
} from "../customer-business-accounts-admin-api.js"
import { useAuthUiI18nOrDefault } from "../i18n/provider.js"
import { authQueryKeys } from "../query-keys.js"

export interface CustomerBusinessAccountsPageProps {
  api?: CustomerBusinessAccountsAdminApi
}

export function CustomerBusinessAccountsPage({
  api: apiProp,
}: CustomerBusinessAccountsPageProps = {}) {
  if (apiProp) return <CustomerBusinessAccountsView api={apiProp} />
  return <CustomerBusinessAccountsPageWithRuntime />
}

function CustomerBusinessAccountsPageWithRuntime() {
  const { baseUrl, fetcher } = useVoyantReactContext()
  const api = useMemo(
    () => createCustomerBusinessAccountsAdminApi(baseUrl, fetcher),
    [baseUrl, fetcher],
  )
  return <CustomerBusinessAccountsView api={api} />
}

function CustomerBusinessAccountsView({ api }: { api: CustomerBusinessAccountsAdminApi }) {
  const queryClient = useQueryClient()
  const { messages, formatDateTime } = useAuthUiI18nOrDefault()
  const copy = messages.customerBusinessAccountsPage
  const [actionError, setActionError] = useState<string | null>(null)

  const capabilitiesQuery = useQuery(customerBusinessAccountCapabilitiesQueryOptions(api))
  const capabilities = capabilitiesQuery.data
  const requestsQuery = useQuery({
    ...customerBusinessAccountRequestsQueryOptions(api),
    enabled: capabilities?.viewRequests === true,
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: authQueryKeys.customerBusinessAccounts() })
  const decide = useMutation({
    mutationFn: ({
      request,
      decision,
    }: {
      request: CustomerBusinessAccountRequestDto
      decision: "approve" | "reject"
    }) => (decision === "approve" ? api.approveRequest(request.id) : api.rejectRequest(request.id)),
    onSuccess: () => {
      setActionError(null)
      void invalidate()
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : copy.actionFailed),
  })

  const isLoading =
    capabilitiesQuery.isPending || (capabilities?.viewRequests === true && requestsQuery.isPending)
  const loadFailed = capabilitiesQuery.isError || requestsQuery.isError
  const forbidden =
    capabilities !== undefined && !capabilities.viewRequests && !capabilities.provisionAccounts

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{copy.title}</h1>
        <p className="text-sm text-muted-foreground">{copy.description}</p>
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
      ) : forbidden ? (
        <div className="rounded-md border px-4 py-8 text-center text-sm text-muted-foreground">
          {copy.forbidden}
        </div>
      ) : (
        <>
          {capabilities?.provisionAccounts ? <ProvisionBusinessAccountForm api={api} /> : null}
          {capabilities?.viewRequests ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="h-4 w-4" aria-hidden="true" />
                  {copy.requests.title}
                </CardTitle>
                <CardDescription>{copy.requests.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{copy.requests.requesterColumn}</TableHead>
                      <TableHead>{copy.requests.businessColumn}</TableHead>
                      <TableHead>{copy.requests.statusColumn}</TableHead>
                      <TableHead>{copy.requests.submittedColumn}</TableHead>
                      <TableHead className="text-right">{copy.requests.actionsColumn}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(requestsQuery.data ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                          {copy.requests.empty}
                        </TableCell>
                      </TableRow>
                    ) : (
                      requestsQuery.data?.map((request) => {
                        const requester =
                          request.requesterName ?? request.requesterEmail ?? request.requesterUserId
                        return (
                          <TableRow key={request.id}>
                            <TableCell>
                              <div className="font-medium">{requester}</div>
                              {request.requesterEmail && request.requesterEmail !== requester ? (
                                <div className="text-xs text-muted-foreground">
                                  {request.requesterEmail}
                                </div>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{request.profile.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {request.publicApiOrigin}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={request.status === "pending" ? "secondary" : "outline"}
                              >
                                {copy.statuses[request.status]}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {request.createdAt
                                ? formatDateTime(request.createdAt)
                                : copy.dateUnknown}
                            </TableCell>
                            <TableCell className="space-x-2 text-right">
                              {request.status === "pending" && capabilities.decideRequests ? (
                                <>
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={decide.isPending}
                                    aria-label={copy.requests.approveLabel(request.profile.name)}
                                    onClick={() => {
                                      setActionError(null)
                                      decide.mutate({ request, decision: "approve" })
                                    }}
                                  >
                                    <Check className="h-4 w-4" aria-hidden="true" />
                                    {copy.requests.approve}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={decide.isPending}
                                    aria-label={copy.requests.rejectLabel(request.profile.name)}
                                    onClick={async () => {
                                      if (
                                        !(await confirmDialog(
                                          copy.requests.rejectConfirm(request.profile.name),
                                        ))
                                      )
                                        return
                                      setActionError(null)
                                      decide.mutate({ request, decision: "reject" })
                                    }}
                                  >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                    {copy.requests.reject}
                                  </Button>
                                </>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  )
}

function ProvisionBusinessAccountForm({ api }: { api: CustomerBusinessAccountsAdminApi }) {
  const queryClient = useQueryClient()
  const copy = useAuthUiI18nOrDefault().messages.customerBusinessAccountsPage.provision
  const [publicApiOrigin, setPublicApiOrigin] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [businessName, setBusinessName] = useState("")
  const [relationshipOrganizationId, setRelationshipOrganizationId] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const provision = useMutation({
    mutationFn: (input: CustomerBusinessAccountProvisionInput) => api.provisionAccount(input),
    onSuccess: () => {
      setFormError(null)
      setSuccess(true)
      setCustomerEmail("")
      setBusinessName("")
      setRelationshipOrganizationId("")
      void queryClient.invalidateQueries({ queryKey: authQueryKeys.customerBusinessAccounts() })
    },
    onError: (error) => {
      setSuccess(false)
      setFormError(error instanceof Error ? error.message : null)
    },
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSuccess(false)
    const normalizedEmail = customerEmail.trim().toLowerCase()
    const normalizedOrganizationId = relationshipOrganizationId.trim()
    if (!isExactHttpOrigin(publicApiOrigin)) {
      setFormError(copy.publicApiOriginRequired)
      return
    }
    if (!normalizedEmail.includes("@")) {
      setFormError(copy.emailRequired)
      return
    }
    if (!normalizedOrganizationId && !businessName.trim()) {
      setFormError(copy.nameRequired)
      return
    }
    setFormError(null)
    const common = {
      idempotencyKey: crypto.randomUUID(),
      publicApiOrigin: new URL(publicApiOrigin).origin,
      owner: { email: normalizedEmail },
    }
    provision.mutate(
      normalizedOrganizationId
        ? { ...common, relationshipOrganizationId: normalizedOrganizationId }
        : {
            ...common,
            profile: {
              name: businessName.trim(),
              legalName: null,
              taxId: null,
              website: null,
            },
          },
    )
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
            <Label htmlFor="customer-business-storefront-origin">{copy.publicApiOriginLabel}</Label>
            <Input
              id="customer-business-storefront-origin"
              type="url"
              value={publicApiOrigin}
              placeholder={copy.publicApiOriginPlaceholder}
              onChange={(event) => setPublicApiOrigin(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="customer-business-email">{copy.customerEmailLabel}</Label>
            <Input
              id="customer-business-email"
              type="email"
              value={customerEmail}
              placeholder={copy.customerEmailPlaceholder}
              onChange={(event) => setCustomerEmail(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="customer-business-name">{copy.businessNameLabel}</Label>
            <Input
              id="customer-business-name"
              value={businessName}
              placeholder={copy.businessNamePlaceholder}
              disabled={relationshipOrganizationId.trim().length > 0}
              onChange={(event) => setBusinessName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="customer-business-relationship-organization">
              {copy.existingOrganizationIdLabel}
            </Label>
            <Input
              id="customer-business-relationship-organization"
              value={relationshipOrganizationId}
              placeholder={copy.existingOrganizationIdPlaceholder}
              onChange={(event) => setRelationshipOrganizationId(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {copy.existingOrganizationIdDescription}
            </p>
          </div>
          <div className="md:col-span-2">
            {formError ? <p className="mb-3 text-sm text-destructive">{formError}</p> : null}
            {success ? <p className="mb-3 text-sm text-green-700">{copy.success}</p> : null}
            <Button type="submit" disabled={provision.isPending}>
              {provision.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {provision.isPending ? copy.submitting : copy.submit}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function isExactHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
    )
  } catch {
    return false
  }
}
