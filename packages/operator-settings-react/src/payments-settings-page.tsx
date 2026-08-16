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
  DialogBody,
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
import { Check, CreditCard, TriangleAlert } from "lucide-react"
import { type ComponentType, useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import { PaymentProviderLogo } from "./payment-provider-logo.js"

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
  /** Brand reference resolved by `PaymentProviderLogo`, not a URL. */
  logoRef?: string
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

/**
 * The single status a processor row reports.
 *
 * This screen used to show up to four badges against one connection — `Active`,
 * `Ready`, `Connected`, `Sandbox` — of which two were the same fact:
 * `paymentConnectionReadiness` is `state === "connected"`, so `Ready` and
 * `Connected` could never disagree. Collapsing to one status is what makes the
 * list readable; mode is rendered as an attribute of a connection, not as a
 * status, because it answers a different question.
 *
 * `not_connected` deliberately has no badge. A processor nobody has set up is
 * the default state of most rows, and labelling it makes every row shout.
 */
export type PaymentProviderStatusId =
  | "error"
  | "action_required"
  | "disconnected"
  | "active"
  | "verifying"
  | "connected"
  | "coming_soon"
  | "not_connected"

/**
 * The connections to render for a processor.
 *
 * `connections` is optional on both `ConnectionStatus` and the route schema
 * (`payment-provider-routes.ts`), so a registry may answer with only the
 * backward-compatible top-level `activeProviderId`/`status`/`mode`. The old
 * "Active provider" card read those fields directly; this screen reads
 * connections, so without this fallback an active processor sitting in `error`
 * or `restricted` would render no status and no row at all — the failure would
 * be invisible precisely when it matters.
 *
 * The synthesized summary is marked `active` because that is what the
 * top-level fields describe: the active provider's one connection.
 */
export function paymentProviderConnections(
  provider: Pick<ProviderDescriptor, "id">,
  status:
    | Pick<
        ConnectionStatus,
        | "activeProviderId"
        | "status"
        | "mode"
        | "activeConnectionId"
        | "connections"
        | "requirements"
        | "lastError"
        | "readOnly"
      >
    | undefined,
): ConnectionSummary[] {
  const owned = (status?.connections ?? []).filter(
    (connection) => connection.providerId === provider.id,
  )
  if (owned.length > 0) return owned
  if (!status || status.activeProviderId !== provider.id) return []

  return [
    {
      providerId: provider.id,
      connectionId: status.activeConnectionId ?? provider.id,
      state: status.status,
      readiness: status.status === "connected" ? "ready" : "not_ready",
      mode: status.mode,
      active: true,
      requirements: status.requirements,
      lastError: status.lastError,
      readOnly: status.readOnly,
    },
  ]
}

/**
 * Resolve a processor's headline status from its connections.
 *
 * Precedence is deliberate: anything broken or blocked outranks `active`,
 * because an active processor that cannot take money is the one thing an
 * operator must not miss. `active` then outranks the healthy-but-secondary
 * states — a second connection quietly verifying is reported on its own row.
 *
 * `disconnected` is one of those blocking states rather than a synonym for
 * "never set up": `updatePaymentConnectionStatus` patches only the status, so
 * an active provider can sit at `disconnected` with `activeProviderId` still
 * pointing at it. It escalates only when it describes the whole processor —
 * every connection gone, or the active one gone — so a disconnected sandbox
 * sibling does not mislabel a working live connection.
 */
export function paymentProviderStatus(input: {
  provider: Pick<ProviderDescriptor, "id" | "availability">
  connections: readonly Pick<ConnectionSummary, "providerId" | "state" | "active">[] | undefined
  activeProviderId: string | null
}): PaymentProviderStatusId {
  const owned = (input.connections ?? []).filter(
    (connection) => connection.providerId === input.provider.id,
  )
  const anyState = (...states: ConnectionState[]) =>
    owned.some((connection) => states.includes(connection.state))

  if (anyState("error")) return "error"
  if (anyState("pending_requirements", "restricted")) return "action_required"

  const activeConnection = owned.find((connection) => connection.active)
  const allDisconnected =
    owned.length > 0 && owned.every((connection) => connection.state === "disconnected")
  if (allDisconnected || activeConnection?.state === "disconnected") return "disconnected"

  if (input.activeProviderId === input.provider.id) return "active"
  if (anyState("pending_verification")) return "verifying"
  if (anyState("connected")) return "connected"
  if (input.provider.availability === "coming_soon") return "coming_soon"
  return "not_connected"
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

/** Badge treatment per status. `not_connected` renders nothing at all. */
const providerStatusVariant: Record<
  PaymentProviderStatusId,
  "default" | "secondary" | "destructive" | "outline" | null
> = {
  error: "destructive",
  action_required: "destructive",
  // A connection that exists but is disconnected is not the same as a
  // processor nobody set up, so unlike `not_connected` it does get a badge.
  disconnected: "outline",
  active: "default",
  verifying: "secondary",
  connected: "secondary",
  coming_soon: "outline",
  not_connected: null,
}

/** The one badge a processor row is allowed. */
function ProviderStatusBadge({
  status,
  labels,
}: {
  status: PaymentProviderStatusId
  labels: Record<PaymentProviderStatusId, string>
}) {
  const variant = providerStatusVariant[status]
  if (!variant) return null
  return (
    <Badge variant={variant} className="shrink-0">
      {labels[status]}
    </Badge>
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
  const statusLabels: Record<ConnectionState, string> = {
    pending_requirements: t.pendingRequirements,
    pending_verification: t.pendingVerification,
    connected: t.connected,
    restricted: t.restricted,
    error: t.connectionError,
    disconnected: t.disconnected,
  }
  const statusBadgeLabels: Record<PaymentProviderStatusId, string> = {
    error: t.connectionError,
    action_required: t.pendingRequirements,
    disconnected: t.disconnected,
    active: t.activeBadge,
    verifying: t.pendingVerification,
    connected: t.connected,
    coming_soon: t.comingSoon,
    // Never rendered — `providerStatusVariant.not_connected` is null.
    not_connected: t.disconnected,
  }

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
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
      </header>

      {connection?.readOnly ? (
        <Alert>
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>{t.configuredViaEnv}</AlertTitle>
          <AlertDescription>{t.configuredViaEnvHint}</AlertDescription>
        </Alert>
      ) : null}

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
        <ul className="flex list-none flex-col gap-4">
          {providers.map((provider) => {
            const isActive = provider.id === activeId
            // Resolved rather than filtered: a registry that omits the
            // per-connection projection still has to show its active
            // processor's real state.
            const owned = paymentProviderConnections(provider, connection)
            const status = paymentProviderStatus({
              provider,
              connections: owned,
              activeProviderId: activeId,
            })
            const unavailable = !canConfigurePaymentProvider(provider)
            const hosted = provider.connectionMethod === "embedded_onboarding"
            const resumable =
              hosted &&
              resumablePaymentProviderConnection(provider, connection?.connections) !== null
            const hasAdditionalHostedMode =
              hosted &&
              firstUnconfiguredPaymentProviderMode(provider, connection?.connections) !== null
            // Preserved verbatim from the pre-redesign screen: a hosted
            // provider mints a real processor account per mode, so its action
            // stays available only to resume an unfinished setup or to add a
            // mode that has none.
            const setupDisabled =
              unavailable || (isActive && !hasAdditionalHostedMode && !resumable)
            const setupLabel = hosted
              ? resumable
                ? t.continueOnboarding
                : t.startOnboarding
              : owned.length > 0
                ? t.updateCredentials
                : t.connect

            return (
              <li key={provider.id}>
                <Card
                  // The active processor is marked by emphasis on the whole
                  // card, not by another badge in an already crowded row.
                  className={isActive ? "border-primary/40" : undefined}
                >
                  <CardHeader className="flex flex-row items-start gap-4 space-y-0">
                    <PaymentProviderLogo
                      logoRef={provider.logoRef}
                      providerId={provider.id}
                      displayName={provider.displayName}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <CardTitle className="leading-tight">{provider.displayName}</CardTitle>
                      <CardDescription>{provider.description}</CardDescription>
                    </div>
                    <ProviderStatusBadge status={status} labels={statusBadgeLabels} />
                  </CardHeader>

                  {owned.length > 0 || (isActive && connection?.requirements?.length) ? (
                    <CardContent className="flex flex-col gap-4">
                      {owned.length > 0 ? (
                        <ul className="flex list-none flex-col divide-y rounded-md border">
                          {owned.map((summary) => {
                            const control = paymentActivationControlState({
                              summary,
                              activatingConnectionId: activate.isPending
                                ? (activate.variables?.connectionId ?? null)
                                : null,
                            })
                            return (
                              <li
                                key={`${summary.providerId}:${summary.connectionId}`}
                                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5"
                              >
                                <span className="text-sm font-medium">
                                  {summary.mode
                                    ? modeLabel(summary.mode, modeLabels)
                                    : (summary.displayName ?? summary.providerId)}
                                </span>
                                <span
                                  className={
                                    summary.state === "error"
                                      ? "text-sm text-destructive"
                                      : "text-sm text-muted-foreground"
                                  }
                                >
                                  {statusLabels[summary.state]}
                                </span>
                                <div className="ms-auto flex items-center gap-2">
                                  {control === "active" ? (
                                    <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                                      <Check aria-hidden="true" className="size-4" />
                                      {t.defaultBadge}
                                    </span>
                                  ) : control === "activating" ? (
                                    <Button size="sm" variant="outline" disabled aria-busy="true">
                                      <Spinner data-icon="inline-start" />
                                      {t.activating}
                                    </Button>
                                  ) : control === "activatable" ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      // Disabling on any in-flight activation
                                      // prevents duplicate/concurrent submits.
                                      disabled={activate.isPending}
                                      onClick={() => activate.mutate(summary)}
                                    >
                                      {t.makeActive}
                                    </Button>
                                  ) : (
                                    <span
                                      id={`activate-hint-${summary.connectionId}`}
                                      className="text-sm text-muted-foreground"
                                    >
                                      {t.makeActiveNotReady}
                                    </span>
                                  )}
                                </div>

                                {summary.requirements?.length ? (
                                  <div className="w-full">
                                    <RequirementsAlert
                                      requirements={summary.requirements}
                                      title={t.requirementsTitle}
                                      deadlineTemplate={t.requirementDeadline}
                                    />
                                  </div>
                                ) : null}
                              </li>
                            )
                          })}
                        </ul>
                      ) : null}

                      {/* Only when no row carried them: the synthesized
                          fallback connection already reports the top-level
                          requirements, and a registry that populates only the
                          top level has no row to put them on. */}
                      {isActive && !owned.some((summary) => summary.requirements?.length) ? (
                        <RequirementsAlert
                          requirements={connection?.requirements}
                          title={t.requirementsTitle}
                          deadlineTemplate={t.requirementDeadline}
                        />
                      ) : null}
                    </CardContent>
                  ) : null}

                  {connection?.readOnly ? null : (
                    <CardFooter className="flex flex-wrap items-center gap-3">
                      <Button
                        size="sm"
                        variant={owned.length > 0 ? "outline" : "default"}
                        disabled={setupDisabled}
                        onClick={() => openConnect(provider)}
                      >
                        {setupLabel}
                      </Button>

                      {isActive && canDisconnectPaymentProvider(provider) ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={disconnect.isPending}
                          onClick={() => disconnect.mutate()}
                        >
                          {disconnect.isPending ? <Spinner data-icon="inline-start" /> : null}
                          {t.disconnect}
                        </Button>
                      ) : null}

                      {/* Not an action, so not a button: hosted disconnect is
                          fail-closed and the operator has to ask support. */}
                      {isActive && !canDisconnectPaymentProvider(provider) ? (
                        <span className="text-sm text-muted-foreground">
                          {t.disconnectUnavailable}
                        </span>
                      ) : null}
                    </CardFooter>
                  )}
                </Card>
              </li>
            )
          })}
        </ul>
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

                <DialogBody>
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
                </DialogBody>

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
                  className="flex min-h-0 flex-1 flex-col"
                  onSubmit={(event) => {
                    event.preventDefault()
                    connect.mutate(dialogProvider)
                  }}
                >
                  <DialogBody>
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
                    </FieldGroup>
                  </DialogBody>

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={closeDialog}>
                      {t.cancel}
                    </Button>
                    <Button type="submit" disabled={connect.isPending}>
                      {connect.isPending ? <Spinner data-icon="inline-start" /> : null}
                      {t.connect}
                    </Button>
                  </DialogFooter>
                </form>
              </>
            )
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
