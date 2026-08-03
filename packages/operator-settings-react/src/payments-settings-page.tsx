"use client"

/**
 * Settings → Payments (source-free, package-delivered).
 *
 * Credential providers submit their declared secret fields to the managed
 * registry. Hosted providers instead request a short-lived browser bootstrap
 * and hand it to an injected embedded-onboarding client. The AccountSession
 * secret stays in this component's memory: it is never put in query data,
 * storage, logs, URLs, or rendered markup.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useOperatorAdminMessages } from "@voyant-travel/admin/providers/operator-admin-messages"
import { useVoyantReactContext } from "@voyant-travel/react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  NativeSelect,
  NativeSelectOption,
  Spinner,
  Switch,
} from "@voyant-travel/ui/components"
import { CreditCard, TriangleAlert } from "lucide-react"
import { type ComponentType, useCallback, useRef, useState } from "react"
import { toast } from "sonner"

type ProviderMode = "sandbox" | "test" | "live"
type ConnectionState =
  | "pending_requirements"
  | "pending_verification"
  | "connected"
  | "restricted"
  | "error"
  | "disconnected"

interface CredentialField {
  key: string
  label: string
  kind: "text" | "secret" | "boolean" | "select"
  required: boolean
  placeholder?: string
  helpText?: string
  options?: { value: string; label: string }[]
}

interface ProviderDescriptor {
  id: string
  displayName: string
  description: string
  connectionMethod: "credentials" | "embedded_onboarding" | "read_only"
  credentialFieldSchema: CredentialField[]
  availability: "available" | "coming_soon"
  modes: ProviderMode[]
}

interface ConnectionRequirement {
  code: string
  message: string
  deadlineAt?: string | null
}

type ConnectionReadiness = "ready" | "not_ready" | "unknown"

interface ConnectionSummary {
  providerId: string
  connectionId: string
  displayName?: string
  state: ConnectionState
  readiness: ConnectionReadiness
  mode: ProviderMode | null
  active: boolean
  requirements?: ConnectionRequirement[]
  lastError?: string | null
  readOnly?: boolean
}

interface ConnectionStatus {
  activeProviderId: string | null
  status: ConnectionState
  mode: ProviderMode | null
  activeConnectionId?: string | null
  connections?: ConnectionSummary[]
  requirements?: ConnectionRequirement[]
  lastError?: string | null
  readOnly?: boolean
}

interface ConnectResult {
  ok: boolean
  status: ConnectionStatus
  error?: string
}

interface ActivationResult {
  ok: boolean
  status: ConnectionStatus
  activated?: { providerId: string; connectionId: string }
  error?: string
}

export interface PaymentEmbeddedOnboardingSession {
  type: "embedded_onboarding"
  publishableKey: string
  clientSecret: string
  expiresAt: string
}

interface OnboardingResult {
  ok: boolean
  status: ConnectionStatus
  session?: PaymentEmbeddedOnboardingSession
  error?: string
}

/**
 * Integration seam for Stripe Connect.js (or another approved hosted client).
 * The client asks for an ephemeral secret when it initializes and whenever
 * Connect.js refreshes an expired AccountSession.
 */
export interface PaymentEmbeddedOnboardingClientProps {
  publishableKey: string
  fetchClientSecret: () => Promise<string>
  onExit: () => void
  loadErrorTitle: string
  loadErrorDescription: string
}

export type PaymentEmbeddedOnboardingClient = ComponentType<PaymentEmbeddedOnboardingClientProps>

interface PaymentEmbeddedOnboardingBoundaryProps {
  session: PaymentEmbeddedOnboardingSession
  client?: PaymentEmbeddedOnboardingClient
  refreshClientSecret: () => Promise<string>
  onExit: () => void
  fallbackTitle: string
  fallbackDescription: string
}

/**
 * Keeps session secrets behind a callback and out of the DOM. The initial
 * secret is consumed once; every later call must mint a fresh AccountSession.
 */
export function PaymentEmbeddedOnboardingBoundary({
  session,
  client: Client,
  refreshClientSecret,
  onExit,
  fallbackTitle,
  fallbackDescription,
}: PaymentEmbeddedOnboardingBoundaryProps) {
  const initialClientSecret = useRef<string | null>(session.clientSecret)
  const fetchClientSecret = useCallback(async () => {
    const initial = initialClientSecret.current
    if (initial) {
      initialClientSecret.current = null
      return initial
    }
    try {
      return await refreshClientSecret()
    } catch {
      // Never let an upstream error containing session material cross this
      // browser-facing boundary.
      throw new Error(fallbackDescription)
    }
  }, [fallbackDescription, refreshClientSecret])

  if (!Client) {
    return (
      <Alert>
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>{fallbackTitle}</AlertTitle>
        <AlertDescription>{fallbackDescription}</AlertDescription>
      </Alert>
    )
  }

  return (
    <Client
      publishableKey={session.publishableKey}
      fetchClientSecret={fetchClientSecret}
      onExit={onExit}
      loadErrorTitle={fallbackTitle}
      loadErrorDescription={fallbackDescription}
    />
  )
}

const PROVIDERS_KEY = ["payment-providers"]
const CONNECTION_KEY = ["payment-connection"]

async function responseError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown
    message?: unknown
  } | null
  if (typeof body?.error === "string" && body.error.trim()) return body.error
  if (typeof body?.message === "string" && body.message.trim()) return body.message
  return fallback
}

type PaymentSettingsFetcher = (input: string, init?: RequestInit) => Promise<Response>

/** Request the short-lived bootstrap without placing it in a query cache. */
export async function requestPaymentOnboardingSession(
  fetcher: PaymentSettingsFetcher,
  baseUrl: string,
  providerId: string,
  mode: ProviderMode,
  failureMessage: string,
): Promise<OnboardingResult> {
  const response = await fetcher(`${baseUrl}/v1/admin/settings/payments/onboarding`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ providerId, mode }),
  })
  if (!response.ok) throw new Error(failureMessage)
  const result = (
    (await response.json().catch(() => null)) as {
      data?: OnboardingResult
    } | null
  )?.data
  if (!result) throw new Error(failureMessage)
  return result
}

function isPaymentEmbeddedOnboardingSession(
  session: PaymentEmbeddedOnboardingSession | undefined,
): session is PaymentEmbeddedOnboardingSession {
  return Boolean(
    session &&
      session.type === "embedded_onboarding" &&
      session.publishableKey.trim() &&
      session.clientSecret.trim() &&
      session.expiresAt.trim(),
  )
}

export function paymentConnectionStatusLabel(
  state: ConnectionState,
  labels: Record<ConnectionState, string>,
): string {
  return labels[state]
}

export function canConfigurePaymentProvider(
  provider: Pick<ProviderDescriptor, "availability" | "connectionMethod">,
): boolean {
  return provider.availability === "available" && provider.connectionMethod !== "read_only"
}

/**
 * Pick the first advertised mode that does not already have a connection.
 * Hosted providers can keep their setup action available when one mode is the
 * active default but another (for example Sandbox vs Live) still needs setup.
 */
export function firstUnconfiguredPaymentProviderMode(
  provider: { id: ProviderDescriptor["id"]; modes: readonly ProviderMode[] },
  connections: readonly Pick<ConnectionSummary, "providerId" | "mode">[] | undefined,
): ProviderMode | null {
  return (
    provider.modes.find(
      (availableMode) =>
        !connections?.some(
          (connection) =>
            connection.providerId === provider.id && connection.mode === availableMode,
        ),
    ) ?? null
  )
}

/**
 * The connection whose setup this provider's action should resume, if any.
 *
 * A hosted provider mints a real processor account the first time a mode is set
 * up, so an unfinished connection has to be resumed rather than replaced by a
 * second one in whichever mode happens to be free.
 */
export function resumablePaymentProviderConnection(
  provider: { id: ProviderDescriptor["id"] },
  connections: readonly Pick<ConnectionSummary, "providerId" | "mode" | "readiness">[] | undefined,
): Pick<ConnectionSummary, "providerId" | "mode" | "readiness"> | null {
  return (
    connections?.find(
      (connection) =>
        connection.providerId === provider.id &&
        connection.readiness !== "ready" &&
        connection.mode !== null,
    ) ?? null
  )
}

/**
 * The mode the setup action should open in.
 *
 * Resuming an unfinished connection wins, then the provider's real-money mode,
 * and only then whichever mode is still unconfigured. Picking the unconfigured
 * mode first is what let a second click on "Set up" open Sandbox behind a
 * finished Live connection and create a throwaway processor account.
 */
export function paymentProviderSetupMode(
  provider: { id: ProviderDescriptor["id"]; modes: readonly ProviderMode[] },
  connections: readonly Pick<ConnectionSummary, "providerId" | "mode" | "readiness">[] | undefined,
): ProviderMode {
  const resumable = resumablePaymentProviderConnection(provider, connections)
  if (resumable?.mode && provider.modes.includes(resumable.mode)) return resumable.mode
  const preferred = provider.modes.includes("live") ? "live" : (provider.modes[0] ?? "live")
  const preferredTaken = connections?.some(
    (connection) => connection.providerId === provider.id && connection.mode === preferred,
  )
  if (!preferredTaken) return preferred
  return firstUnconfiguredPaymentProviderMode(provider, connections) ?? preferred
}

/**
 * A connection can be made the active default only when it is ready (its
 * lifecycle reached `connected`) and it is not already the active one. This
 * gates the "Make active" control so a not-ready or already-active connection
 * never offers activation.
 */
export function canActivatePaymentConnection(
  connection: Pick<ConnectionSummary, "readiness" | "active" | "readOnly">,
): boolean {
  return connection.readiness === "ready" && !connection.active && !connection.readOnly
}

/**
 * The four mutually-exclusive states the per-connection activation control can
 * be in. Pure so the pending/duplicate-prevention behavior is testable without
 * a DOM harness and stays in sync with what the component renders:
 * - `active` — this connection is already the default; no action.
 * - `activating` — this connection's activation request is in flight.
 * - `activatable` — ready + inactive; the "Make active" button is offered
 *   (disabled while any activation is pending, preventing duplicate submits).
 * - `gated` — not ready / read-only; a disabled control + reason are shown.
 */
export type PaymentActivationControl = "active" | "activating" | "activatable" | "gated"

export function paymentActivationControlState(input: {
  summary: Pick<ConnectionSummary, "readiness" | "active" | "readOnly" | "connectionId">
  activatingConnectionId?: string | null
}): PaymentActivationControl {
  if (input.summary.active) return "active"
  if (
    input.activatingConnectionId != null &&
    input.activatingConnectionId === input.summary.connectionId
  ) {
    return "activating"
  }
  return canActivatePaymentConnection(input.summary) ? "activatable" : "gated"
}

/** Hosted disconnect is fail-closed until the managed control plane exposes it. */
export function canDisconnectPaymentProvider(
  provider: Pick<ProviderDescriptor, "connectionMethod"> | undefined,
): boolean {
  return provider?.connectionMethod === "credentials"
}

function modeLabel(
  mode: ProviderMode,
  labels: { sandbox: string; test: string; live: string },
): string {
  if (mode === "live") return labels.live
  if (mode === "test") return labels.test
  return labels.sandbox
}

/**
 * What the processor still needs before this connection can go live.
 *
 * Without it a not-ready connection shows a badge and no explanation, which
 * reads as the platform being wrong rather than as work that is outstanding.
 */
function RequirementsAlert({
  requirements,
  title,
  deadlineTemplate,
}: {
  requirements: ConnectionRequirement[] | undefined
  title: string
  deadlineTemplate: string
}) {
  if (!requirements?.length) return null
  return (
    <Alert>
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          {requirements.map((requirement) => (
            <li key={`${requirement.code}:${requirement.deadlineAt ?? ""}`}>
              <span>{requirement.message}</span>
              {requirement.deadlineAt ? (
                <span className="text-muted-foreground">
                  {" "}
                  {deadlineTemplate.replace(
                    "{date}",
                    new Date(requirement.deadlineAt).toLocaleDateString(),
                  )}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}

function ModeField({
  modes,
  mode,
  onChange,
  label,
  labels,
}: {
  modes: ProviderMode[]
  mode: ProviderMode
  onChange: (mode: ProviderMode) => void
  label: string
  labels: { sandbox: string; test: string; live: string }
}) {
  if (modes.length < 2) return null

  if (
    modes.length === 2 &&
    modes.includes("live") &&
    (modes.includes("sandbox") || modes.includes("test"))
  ) {
    const nonLiveMode = modes.includes("sandbox") ? "sandbox" : "test"
    return (
      <Field orientation="horizontal">
        <FieldLabel htmlFor="payment-provider-mode">{label}</FieldLabel>
        <div className="flex items-center gap-3">
          <span>{modeLabel(nonLiveMode, labels)}</span>
          <Switch
            id="payment-provider-mode"
            checked={mode === "live"}
            onCheckedChange={(checked) => onChange(checked ? "live" : nonLiveMode)}
          />
          <span>{labels.live}</span>
        </div>
      </Field>
    )
  }

  return (
    <Field>
      <FieldLabel htmlFor="payment-provider-mode">{label}</FieldLabel>
      <NativeSelect
        id="payment-provider-mode"
        value={mode}
        onChange={(event) => onChange(event.target.value as ProviderMode)}
      >
        {modes.map((availableMode) => (
          <NativeSelectOption key={availableMode} value={availableMode}>
            {modeLabel(availableMode, labels)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  )
}

export interface PaymentsSettingsPageProps {
  embeddedOnboardingClient?: PaymentEmbeddedOnboardingClient
}

export function PaymentsSettingsPage({ embeddedOnboardingClient }: PaymentsSettingsPageProps = {}) {
  const queryClient = useQueryClient()
  const { baseUrl, fetcher } = useVoyantReactContext()
  const t = useOperatorAdminMessages().settings.paymentsPage

  const providersQuery = useQuery({
    queryKey: PROVIDERS_KEY,
    queryFn: async (): Promise<ProviderDescriptor[]> => {
      const response = await fetcher(`${baseUrl}/v1/admin/settings/payments/providers`)
      if (!response.ok) throw new Error(t.loadFailed)
      return ((await response.json()) as { data: ProviderDescriptor[] }).data
    },
  })

  const connectionQuery = useQuery({
    queryKey: CONNECTION_KEY,
    queryFn: async (): Promise<ConnectionStatus> => {
      const response = await fetcher(`${baseUrl}/v1/admin/settings/payments`)
      if (!response.ok) throw new Error(t.loadFailed)
      return ((await response.json()) as { data: ConnectionStatus }).data
    },
  })

  const [dialogProvider, setDialogProvider] = useState<ProviderDescriptor | null>(null)
  const [credentials, setCredentials] = useState<Record<string, unknown>>({})
  const [mode, setMode] = useState<ProviderMode>("sandbox")
  const [onboardingPending, setOnboardingPending] = useState(false)
  const [onboardingSession, setOnboardingSession] =
    useState<PaymentEmbeddedOnboardingSession | null>(null)

  const invalidateConnection = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: CONNECTION_KEY })
  }, [queryClient])

  const closeDialog = useCallback(() => {
    setDialogProvider(null)
    setCredentials({})
    setOnboardingSession(null)
    setOnboardingPending(false)
  }, [])

  const connect = useMutation({
    mutationFn: async (provider: ProviderDescriptor): Promise<ConnectResult> => {
      const response = await fetcher(`${baseUrl}/v1/admin/settings/payments/connect`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ providerId: provider.id, mode, credentials }),
      })
      if (!response.ok) throw new Error(await responseError(response, t.connectFailed))
      return ((await response.json()) as { data: ConnectResult }).data
    },
    onSuccess: (result, provider) => {
      if (result.ok) {
        toast.success(t.connectedToast.replace("{provider}", provider.displayName))
        closeDialog()
        invalidateConnection()
      } else {
        toast.error(result.error ?? t.connectFailed)
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t.connectFailed),
  })

  const beginOnboarding = async (provider: ProviderDescriptor) => {
    setOnboardingPending(true)
    setOnboardingSession(null)
    try {
      // Deliberately bypass React Query: its mutation cache would retain the
      // AccountSession secret beyond this dialog's in-memory lifecycle.
      const result = await requestPaymentOnboardingSession(
        fetcher,
        baseUrl,
        provider.id,
        mode,
        t.onboardingFailed,
      )
      if (!result.ok || !isPaymentEmbeddedOnboardingSession(result.session)) {
        toast.error(t.onboardingFailed)
        return
      }
      setOnboardingSession(result.session)
      invalidateConnection()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.onboardingFailed)
    } finally {
      setOnboardingPending(false)
    }
  }

  const refreshOnboardingClientSecret = useCallback(async () => {
    if (!dialogProvider) throw new Error(t.onboardingFailed)
    const result = await requestPaymentOnboardingSession(
      fetcher,
      baseUrl,
      dialogProvider.id,
      mode,
      t.onboardingFailed,
    )
    if (!result.ok || !isPaymentEmbeddedOnboardingSession(result.session)) {
      throw new Error(t.onboardingFailed)
    }
    invalidateConnection()
    return result.session.clientSecret
  }, [baseUrl, dialogProvider, fetcher, invalidateConnection, mode, t.onboardingFailed])

  const disconnect = useMutation({
    mutationFn: async () => {
      const response = await fetcher(`${baseUrl}/v1/admin/settings/payments/disconnect`, {
        method: "POST",
      })
      if (!response.ok) throw new Error(await responseError(response, t.connectFailed))
    },
    onSuccess: () => {
      toast.success(t.disconnectedToast)
      invalidateConnection()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t.connectFailed),
  })

  const activate = useMutation({
    mutationFn: async (summary: ConnectionSummary): Promise<ActivationResult> => {
      const response = await fetcher(`${baseUrl}/v1/admin/settings/payments/activate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerId: summary.providerId,
          connectionId: summary.connectionId,
        }),
      })
      if (!response.ok) throw new Error(await responseError(response, t.activateFailed))
      return ((await response.json()) as { data: ActivationResult }).data
    },
    onSuccess: (result, summary) => {
      if (result.ok) {
        toast.success(
          t.activatedToast.replace("{provider}", summary.displayName ?? summary.providerId),
        )
        invalidateConnection()
      } else {
        toast.error(result.error ?? t.activateFailed)
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t.activateFailed),
  })

  if (providersQuery.isPending || connectionQuery.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" aria-label={t.loading} />
      </div>
    )
  }

  if (providersQuery.isError || connectionQuery.isError) {
    return (
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>{t.loadFailed}</AlertTitle>
        <AlertDescription>{t.tryAgainLater}</AlertDescription>
      </Alert>
    )
  }

  const connection = connectionQuery.data
  const providers = providersQuery.data ?? []
  const activeId = connection?.activeProviderId ?? null
  const activeProvider = providers.find((provider) => provider.id === activeId)
  const statusLabels: Record<ConnectionState, string> = {
    pending_requirements: t.pendingRequirements,
    pending_verification: t.pendingVerification,
    connected: t.connected,
    restricted: t.restricted,
    error: t.connectionError,
    disconnected: t.disconnected,
  }
  const statusLabel = paymentConnectionStatusLabel(
    connection?.status ?? "disconnected",
    statusLabels,
  )

  const openConnect = (provider: ProviderDescriptor) => {
    setDialogProvider(provider)
    setCredentials({})
    setOnboardingSession(null)
    setMode(paymentProviderSetupMode(provider, connection?.connections))
  }

  const modeLabels = {
    sandbox: t.modeSandbox,
    test: t.modeTest,
    live: t.modeLive,
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
      </header>

      {connection?.readOnly ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.activeProvider}</CardTitle>
            <CardDescription>{t.configuredViaEnv}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <CreditCard aria-hidden="true" />
              <span>
                {providers.find((provider) => provider.id === activeId)?.displayName ??
                  activeId ??
                  statusLabel}
              </span>
              {activeId ? <Badge variant="secondary">{statusLabel}</Badge> : null}
            </div>
            <p className="text-muted-foreground">{t.configuredViaEnvHint}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {connection && connection.status !== "disconnected" && activeId ? (
            <Card>
              <CardHeader>
                <CardTitle>{t.activeProvider}</CardTitle>
                <CardDescription>{t.readinessDescription}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <CreditCard aria-hidden="true" />
                  <span>
                    {providers.find((provider) => provider.id === activeId)?.displayName ??
                      activeId}
                  </span>
                  <Badge variant={connection.status === "error" ? "destructive" : "secondary"}>
                    {statusLabel}
                  </Badge>
                  {connection.mode ? (
                    <Badge variant="outline">{modeLabel(connection.mode, modeLabels)}</Badge>
                  ) : null}
                </div>

                <RequirementsAlert
                  requirements={connection.requirements}
                  title={t.requirementsTitle}
                  deadlineTemplate={t.requirementDeadline}
                />
              </CardContent>
              <CardFooter>
                {canDisconnectPaymentProvider(activeProvider) ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={disconnect.isPending}
                    onClick={() => disconnect.mutate()}
                  >
                    {disconnect.isPending ? <Spinner data-icon="inline-start" /> : null}
                    {t.disconnect}
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    {t.disconnectUnavailable}
                  </Button>
                )}
              </CardFooter>
            </Card>
          ) : null}

          {connection?.connections?.length ? (
            <section className="flex flex-col gap-3">
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground">
                  {t.connectionsTitle}
                </h2>
                <p className="text-sm text-muted-foreground">{t.connectionsDescription}</p>
              </div>
              <ul className="flex list-none flex-col gap-3">
                {connection.connections.map((summary) => {
                  const summaryStatusLabel = statusLabels[summary.state]
                  const control = paymentActivationControlState({
                    summary,
                    activatingConnectionId: activate.isPending
                      ? (activate.variables?.connectionId ?? null)
                      : null,
                  })
                  return (
                    <li key={`${summary.providerId}:${summary.connectionId}`}>
                      <Card>
                        <CardHeader>
                          <div className="flex flex-wrap items-center gap-2">
                            <CreditCard aria-hidden="true" />
                            <CardTitle>{summary.displayName ?? summary.providerId}</CardTitle>
                            {summary.active ? <Badge>{t.activeBadge}</Badge> : null}
                            <Badge
                              variant={summary.readiness === "ready" ? "secondary" : "outline"}
                            >
                              {summary.readiness === "ready" ? t.readyBadge : t.notReadyBadge}
                            </Badge>
                            <Badge variant={summary.state === "error" ? "destructive" : "outline"}>
                              {summaryStatusLabel}
                            </Badge>
                            {summary.mode ? (
                              <Badge variant="outline">{modeLabel(summary.mode, modeLabels)}</Badge>
                            ) : null}
                          </div>
                        </CardHeader>
                        {summary.requirements?.length ? (
                          <CardContent>
                            <RequirementsAlert
                              requirements={summary.requirements}
                              title={t.requirementsTitle}
                              deadlineTemplate={t.requirementDeadline}
                            />
                          </CardContent>
                        ) : null}
                        <CardFooter className="flex flex-wrap items-center gap-3">
                          {control === "active" ? (
                            <span className="text-sm font-medium text-muted-foreground">
                              {t.defaultBadge}
                            </span>
                          ) : control === "activating" ? (
                            <Button size="sm" disabled aria-busy="true">
                              <Spinner data-icon="inline-start" />
                              {t.activating}
                            </Button>
                          ) : control === "activatable" ? (
                            <Button
                              size="sm"
                              // Disabling on any in-flight activation prevents
                              // duplicate/concurrent "make active" submissions.
                              disabled={activate.isPending}
                              onClick={() => activate.mutate(summary)}
                            >
                              {t.makeActive}
                            </Button>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled
                                aria-disabled="true"
                                aria-describedby={`activate-hint-${summary.connectionId}`}
                              >
                                {t.makeActive}
                              </Button>
                              <span
                                id={`activate-hint-${summary.connectionId}`}
                                className="text-sm text-muted-foreground"
                              >
                                {t.makeActiveNotReady}
                              </span>
                            </>
                          )}
                        </CardFooter>
                      </Card>
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground">{t.availableProviders}</h2>
            {providers.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CreditCard aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>{t.empty}</EmptyTitle>
                  <EmptyDescription>{t.emptyDescription}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {providers.map((provider) => {
                  const isActive = provider.id === activeId
                  const unavailable = !canConfigurePaymentProvider(provider)
                  const hosted = provider.connectionMethod === "embedded_onboarding"
                  const resumable =
                    hosted &&
                    resumablePaymentProviderConnection(provider, connection?.connections) !== null
                  const hasAdditionalHostedMode =
                    hosted &&
                    firstUnconfiguredPaymentProviderMode(provider, connection?.connections) !== null
                  return (
                    <Card key={provider.id}>
                      <CardHeader>
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle>{provider.displayName}</CardTitle>
                          {provider.availability === "coming_soon" ? (
                            <Badge variant="secondary">{t.comingSoon}</Badge>
                          ) : isActive ? (
                            <Badge>{statusLabel}</Badge>
                          ) : null}
                        </div>
                        <CardDescription>{provider.description}</CardDescription>
                      </CardHeader>
                      <CardFooter>
                        <Button
                          size="sm"
                          variant={isActive ? "outline" : "default"}
                          disabled={
                            unavailable || (isActive && !hasAdditionalHostedMode && !resumable)
                          }
                          onClick={() => openConnect(provider)}
                        >
                          {hosted
                            ? resumable
                              ? t.continueOnboarding
                              : t.startOnboarding
                            : t.connect}
                        </Button>
                      </CardFooter>
                    </Card>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}

      <Dialog
        open={dialogProvider !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog()
        }}
      >
        <DialogContent>
          {dialogProvider ? (
            dialogProvider.connectionMethod === "embedded_onboarding" ? (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {t.onboardingTitle.replace("{provider}", dialogProvider.displayName)}
                  </DialogTitle>
                  <DialogDescription>{t.onboardingDescription}</DialogDescription>
                </DialogHeader>

                {onboardingSession ? (
                  <PaymentEmbeddedOnboardingBoundary
                    key={onboardingSession.expiresAt}
                    session={onboardingSession}
                    client={embeddedOnboardingClient}
                    refreshClientSecret={refreshOnboardingClientSecret}
                    onExit={closeDialog}
                    fallbackTitle={t.onboardingUnavailableTitle}
                    fallbackDescription={t.onboardingUnavailableDescription}
                  />
                ) : (
                  <FieldGroup>
                    <ModeField
                      modes={dialogProvider.modes}
                      mode={mode}
                      onChange={setMode}
                      label={t.modeLabel}
                      labels={modeLabels}
                    />
                  </FieldGroup>
                )}

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={closeDialog}>
                    {t.cancel}
                  </Button>
                  {!onboardingSession ? (
                    <Button
                      type="button"
                      disabled={onboardingPending}
                      onClick={() => void beginOnboarding(dialogProvider)}
                    >
                      {onboardingPending ? <Spinner data-icon="inline-start" /> : null}
                      {t.continueOnboarding}
                    </Button>
                  ) : null}
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {t.credentialsTitle.replace("{provider}", dialogProvider.displayName)}
                  </DialogTitle>
                  <DialogDescription>
                    {t.credentialsDescription.replace("{provider}", dialogProvider.displayName)}
                  </DialogDescription>
                </DialogHeader>

                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    connect.mutate(dialogProvider)
                  }}
                >
                  <FieldGroup>
                    <ModeField
                      modes={dialogProvider.modes}
                      mode={mode}
                      onChange={setMode}
                      label={t.modeLabel}
                      labels={modeLabels}
                    />

                    {dialogProvider.credentialFieldSchema.map((field) => (
                      <Field key={field.key}>
                        <FieldLabel htmlFor={`payment-${field.key}`}>{field.label}</FieldLabel>
                        {field.kind === "boolean" ? (
                          <Switch
                            id={`payment-${field.key}`}
                            checked={Boolean(credentials[field.key])}
                            aria-required={field.required}
                            onCheckedChange={(checked) =>
                              setCredentials((current) => ({
                                ...current,
                                [field.key]: checked,
                              }))
                            }
                          />
                        ) : field.kind === "select" ? (
                          <NativeSelect
                            id={`payment-${field.key}`}
                            required={field.required}
                            value={String(credentials[field.key] ?? "")}
                            onChange={(event) =>
                              setCredentials((current) => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                          >
                            <NativeSelectOption value="" />
                            {(field.options ?? []).map((option) => (
                              <NativeSelectOption key={option.value} value={option.value}>
                                {option.label}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                        ) : (
                          <Input
                            id={`payment-${field.key}`}
                            type={field.kind === "secret" ? "password" : "text"}
                            autoComplete="off"
                            required={field.required}
                            placeholder={field.placeholder}
                            value={String(credentials[field.key] ?? "")}
                            onChange={(event) =>
                              setCredentials((current) => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                          />
                        )}
                        {field.helpText ? (
                          <FieldDescription>{field.helpText}</FieldDescription>
                        ) : null}
                      </Field>
                    ))}

                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={closeDialog}>
                        {t.cancel}
                      </Button>
                      <Button type="submit" disabled={connect.isPending}>
                        {connect.isPending ? <Spinner data-icon="inline-start" /> : null}
                        {t.connect}
                      </Button>
                    </DialogFooter>
                  </FieldGroup>
                </form>
              </>
            )
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
