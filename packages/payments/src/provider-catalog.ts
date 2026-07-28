/**
 * Payment provider catalog + connect contract.
 *
 * These types describe the processors an operator can browse and connect from
 * Settings → Payments, and the runtime port that backs that surface. The
 * `PaymentAdapter` in `./index.js` remains the checkout contract; this module
 * adds the *selection + connection* layer on top of it.
 *
 * Kept dependency-free (pure TypeScript, no zod) to preserve this package's
 * minimal footprint — request/response validation lives in the routes layer
 * (`@voyant-travel/operator-settings`), which already depends on zod.
 *
 * See `docs/adr/0015-payment-adapter-transports-and-managed-connect.md`.
 */

import type { PaymentAdapterCapabilities, PaymentAdapterMode } from "./index.js"

/** Kinds of connect-form fields a provider can declare. */
export type PaymentCredentialFieldKind = "text" | "secret" | "boolean" | "select"

/** A selectable option for a `select` credential field. */
export interface PaymentCredentialFieldOption {
  value: string
  /** i18n key or human label; the UI localizes/render decides. */
  label: string
}

/**
 * One declarative field the connect form renders for a provider. Secret fields
 * are masked in the UI and never round-tripped back to the client.
 */
export interface PaymentCredentialField {
  key: string
  label: string
  kind: PaymentCredentialFieldKind
  required: boolean
  placeholder?: string
  helpText?: string
  /** Present for `select` fields. */
  options?: readonly PaymentCredentialFieldOption[]
  /** Simple, declarative validation only. */
  minLength?: number
  maxLength?: number
  /** Serialized RegExp source (no flags); the routes layer compiles it. */
  pattern?: string
}

/** The ordered field list that drives a provider's connect form. */
export type PaymentCredentialFieldSchema = readonly PaymentCredentialField[]

/** Whether a catalog entry can be connected now or is announced but not ready. */
export type PaymentProviderAvailability = "available" | "coming_soon"

/** How Settings establishes or reports a provider connection. */
export type PaymentProviderConnectionMethod = "credentials" | "embedded_onboarding" | "read_only"

/**
 * A catalog entry: everything the admin UI needs to list a processor and render
 * its connection flow. `credentialFieldSchema` is used only by
 * `connectionMethod: "credentials"` and must be empty for hosted onboarding.
 * `capabilities` mirror the `PaymentAdapter` capabilities the connected adapter
 * will declare, so the UI can badge them before connecting.
 */
export interface PaymentProviderDescriptor {
  id: string
  displayName: string
  description: string
  /** Opaque logo reference (asset key / registry id); resolved by the UI. */
  logoRef?: string
  capabilities: PaymentAdapterCapabilities
  connectionMethod: PaymentProviderConnectionMethod
  credentialFieldSchema: PaymentCredentialFieldSchema
  regions?: readonly string[]
  currencies?: readonly string[]
  availability: PaymentProviderAvailability
  modes: readonly PaymentAdapterMode[]
}

/** Connection lifecycle for the single active provider per org. */
export type PaymentConnectionState =
  | "pending_requirements"
  | "pending_verification"
  | "connected"
  | "restricted"
  | "error"
  | "disconnected"

/**
 * A deliberately non-sensitive readiness item. It may describe the class of
 * information or action still needed, but never includes submitted identity
 * values, document contents, processor secrets, or other verification data.
 */
export interface PaymentConnectionRequirement {
  code: string
  message: string
  deadlineAt?: string | null
}

/**
 * Stable identity of one processor connection: the catalog provider plus the
 * opaque, immutable connection reference the managed control plane assigns (or
 * an environment-derived pseudo-reference in self-host). Structurally aligned
 * with `PaymentProcessorIdentity` on the checkout contract (`./index.js`), so a
 * connection selected here can be threaded onto initiation/callback events.
 */
export interface PaymentConnectionIdentity {
  providerId: string
  connectionId: string
}

/**
 * Whether a known connection is complete enough to be made the active default.
 * `ready` maps to the `connected` lifecycle state; every other state (pending,
 * restricted, error, disconnected) is `not_ready`. `unknown` is reserved for
 * connections a registry cannot currently classify.
 */
export type PaymentConnectionReadiness = "ready" | "not_ready" | "unknown"

/**
 * A deliberately non-sensitive summary of one known connection. It carries the
 * connection identity, lifecycle/readiness, and whether it is the active
 * default — never processor secrets, submitted credentials, KMS references, or
 * platform tokens. Managed deployments may list several; self-host lists at
 * most the single environment-pinned connection.
 */
export interface PaymentConnectionSummary {
  providerId: string
  connectionId: string
  /** Human label for the connection (usually the provider display name). */
  displayName?: string
  state: PaymentConnectionState
  readiness: PaymentConnectionReadiness
  mode: PaymentAdapterMode | null
  /** True when this connection is the active default used at checkout. */
  active: boolean
  requirements?: readonly PaymentConnectionRequirement[]
  /** ISO-8601. Last successful `health()` check, if any. */
  lastHealthAt?: string | null
  lastError?: string | null
  /** True when this connection cannot be changed here (env-pinned self-host). */
  readOnly?: boolean
}

/**
 * The current connection, independent of which transport backs it. `mode` is
 * `null` until a provider is connected. In self-host/pinned deployments this is
 * derived read-only from the environment-configured adapter.
 *
 * `activeProviderId`/`status`/`mode` describe the *active default* connection
 * (retained for existing callers). `activeConnectionId` + `connections` model
 * the independent facts — which known connections exist and how ready each is —
 * separately from which one is active. Both new fields are optional so existing
 * producers and consumers keep working unchanged.
 */
export interface PaymentConnectionStatus {
  activeProviderId: string | null
  status: PaymentConnectionState
  mode: PaymentAdapterMode | null
  /** Opaque reference of the active connection, paired with `activeProviderId`. */
  activeConnectionId?: string | null
  /** Non-sensitive summaries of every known connection + its readiness. */
  connections?: readonly PaymentConnectionSummary[]
  /** ISO-8601. Last successful `health()` check, if any. */
  lastHealthAt?: string | null
  lastError?: string | null
  requirements?: readonly PaymentConnectionRequirement[]
  /**
   * True when the deployment pins its processor via environment variables
   * (self-host). The UI then renders read-only "configured via environment"
   * and hides the connect form.
   */
  readOnly?: boolean
}

/** Input to connect (or re-connect) a provider. */
export interface PaymentConnectInput {
  providerId: string
  mode: PaymentAdapterMode
  /** Raw processor credentials; never persisted inside the Operator boundary. */
  credentials: Record<string, unknown>
}

/** Result of a connect attempt. */
export interface PaymentConnectResult {
  ok: boolean
  status: PaymentConnectionStatus
  error?: string
}

/**
 * Input to make an already-known connection the active default. Activation is a
 * distinct step from connecting: a deployment may hold several ready
 * connections and promote one. Both fields are required — activation targets an
 * exact `{ providerId, connectionId }` identity, never "the provider's latest".
 */
export interface PaymentActivationInput {
  providerId: string
  connectionId: string
}

/**
 * Result of an activation attempt. `ok` reports success/failure explicitly;
 * callers must not treat the absence of an error as success. `activated` echoes
 * the identity that became active only when `ok` is true.
 */
export interface PaymentActivationResult {
  ok: boolean
  status: PaymentConnectionStatus
  activated?: PaymentConnectionIdentity
  error?: string
}

/** Map a lifecycle state to activation readiness. Only `connected` is ready. */
export function paymentConnectionReadiness(
  state: PaymentConnectionState,
): PaymentConnectionReadiness {
  return state === "connected" ? "ready" : "not_ready"
}

/** True when a connection in this state may be made the active default. */
export function isPaymentConnectionReady(state: PaymentConnectionState): boolean {
  return paymentConnectionReadiness(state) === "ready"
}

/** Input that begins or resumes a hosted provider's embedded onboarding. */
export interface PaymentOnboardingSetupInput {
  providerId: string
  mode: PaymentAdapterMode
}

/**
 * Short-lived browser bootstrap for an approved embedded onboarding component.
 * `clientSecret` is an ephemeral, single-purpose component credential. Callers
 * must never persist or log it. It is not a processor API key or a platform
 * credential.
 */
export interface PaymentEmbeddedOnboardingSession {
  type: "embedded_onboarding"
  publishableKey: string
  clientSecret: string
  expiresAt: string
}

/** Result of beginning or resuming hosted onboarding. */
export type PaymentOnboardingSetupResult =
  | {
      ok: true
      status: PaymentConnectionStatus
      session: PaymentEmbeddedOnboardingSession
      error?: never
    }
  | {
      ok: false
      status: PaymentConnectionStatus
      session?: never
      error: string
    }

/**
 * The runtime port backing Settings → Payments. A managed deployment resolves
 * this against the voyant-cloud control plane + provider registry; a self-host
 * deployment resolves a read-only, environment-derived implementation.
 */
export interface PaymentProviderRegistry {
  listProviders(): Promise<readonly PaymentProviderDescriptor[]>
  getConnection(): Promise<PaymentConnectionStatus>
  connect(input: PaymentConnectInput): Promise<PaymentConnectResult>
  beginOnboarding(input: PaymentOnboardingSetupInput): Promise<PaymentOnboardingSetupResult>
  /**
   * Promote an already-known, ready connection to the active default.
   *
   * Optional so existing registry implementations keep satisfying the contract
   * without change; callers that support activation must treat an absent method
   * as "activation unsupported" and fail closed rather than assume success.
   * Implementations must reject a not-ready connection and never report `ok`
   * for an activation they did not actually perform.
   */
  activate?(input: PaymentActivationInput): Promise<PaymentActivationResult>
  disconnect(): Promise<void>
}

/** A single credential validation problem. */
export interface PaymentCredentialFieldError {
  key: string
  message: string
}

/**
 * Pure, dependency-free validation of submitted credentials against a
 * provider's declared field schema. Returns an empty array when valid. The
 * routes layer can additionally enforce zod-level shape; this keeps the rules
 * co-located with the schema that declares them.
 */
export function validatePaymentCredentials(
  schema: PaymentCredentialFieldSchema,
  values: Record<string, unknown>,
): PaymentCredentialFieldError[] {
  const errors: PaymentCredentialFieldError[] = []
  for (const field of schema) {
    const value = values[field.key]
    const missing =
      value === undefined || value === null || (typeof value === "string" && value.trim() === "")

    if (field.required && missing) {
      errors.push({ key: field.key, message: `${field.label} is required.` })
      continue
    }
    if (missing) continue

    if (field.kind === "boolean") {
      if (typeof value !== "boolean") {
        errors.push({ key: field.key, message: `${field.label} must be a boolean.` })
      }
      continue
    }

    if (field.kind === "select") {
      const allowed = (field.options ?? []).map((option) => option.value)
      if (typeof value !== "string" || !allowed.includes(value)) {
        errors.push({ key: field.key, message: `${field.label} is not a valid option.` })
      }
      continue
    }

    if (typeof value !== "string") {
      errors.push({ key: field.key, message: `${field.label} must be a string.` })
      continue
    }
    if (field.minLength !== undefined && value.length < field.minLength) {
      errors.push({ key: field.key, message: `${field.label} is too short.` })
    }
    if (field.maxLength !== undefined && value.length > field.maxLength) {
      errors.push({ key: field.key, message: `${field.label} is too long.` })
    }
    if (field.pattern !== undefined && !new RegExp(field.pattern).test(value)) {
      errors.push({ key: field.key, message: `${field.label} has an invalid format.` })
    }
  }
  return errors
}
