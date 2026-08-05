import { definePort } from "@voyant-travel/graph-contracts"

export const PAYMENT_ADAPTER_CONTRACT_VERSION = "voyant.payment-adapter.v1" as const
export const PAYMENT_ADAPTER_RUNTIME_PORT_ID = "payments.adapter.runtime" as const

export type PaymentAdapterMode = "sandbox" | "test" | "live"
export type PaymentCaptureMode = "automatic" | "manual"
export type PaymentOperationStatus = "accepted" | "declined" | "pending" | "failed"
export const PAYMENT_ADAPTER_ERROR_CODES = [
  "CAPABILITY_NOT_SUPPORTED",
  "IDEMPOTENCY_KEY_REUSED",
  "INVALID_REQUEST",
  "PROVIDER_UNAVAILABLE",
  "ADAPTER_FAILURE",
] as const
export type PaymentAdapterErrorCode = (typeof PAYMENT_ADAPTER_ERROR_CODES)[number]
export type PaymentSessionState =
  | "pending"
  | "requires_redirect"
  | "processing"
  | "authorized"
  | "paid"
  | "failed"
  | "cancelled"
  | "expired"

export interface PaymentMoney {
  amountMinor: number
  currency: string
}

export interface PaymentProcessorIdentity {
  providerId: string
  connectionId: string
}

/**
 * How the shopper is handed to the processor.
 *
 * `redirect` sends them somewhere else — a provider-hosted checkout page or an
 * issuer/3DS redirect. `embedded` keeps them on the storefront and lets the
 * page mount the provider's own payment form.
 */
export const PAYMENT_CHECKOUT_HANDOFFS = ["redirect", "embedded"] as const
export type PaymentCheckoutHandoff = (typeof PAYMENT_CHECKOUT_HANDOFFS)[number]

export interface PaymentAdapterCapabilities {
  hostedCheckout: boolean
  redirectCheckout: boolean
  /**
   * In-page checkout. Optional so an adapter written against an earlier
   * revision of this contract keeps compiling and keeps its meaning: absent is
   * the same fact as `false`.
   */
  embeddedCheckout?: boolean
  authorize: boolean
  capture: boolean
  void: boolean
  refund: boolean
  status: boolean
  callbackSignatureVerification: boolean
  idempotencyKeys: boolean
  retrySafeInitiation: boolean
}

/** The shopper leaves the storefront. `url` is where they go. */
export interface PaymentRedirectCheckout {
  kind: "hosted_checkout" | "redirect"
  url: string
  expiresAt?: string | null
}

/**
 * The shopper stays on the storefront and the page mounts the provider's own
 * payment form (Stripe Elements, Adyen Drop-in, Braintree Hosted Fields, …).
 *
 * The runtime forwards opaque credentials and never learns what the front end
 * does with them: `clientSecret` is whatever per-session token the provider
 * issues, and `publishableKey` is the client-side identifier its SDK is
 * initialized with. Neither is parsed here.
 */
export interface PaymentEmbeddedCheckout {
  kind: "embedded"
  clientSecret: string
  publishableKey: string
  /** Platform-scoped providers act on behalf of a connected account. */
  providerAccountId?: string | null
  expiresAt?: string | null
}

export type PaymentHostedCheckout = PaymentRedirectCheckout | PaymentEmbeddedCheckout

export function isRedirectPaymentCheckout(
  checkout: PaymentHostedCheckout,
): checkout is PaymentRedirectCheckout {
  return checkout.kind === "hosted_checkout" || checkout.kind === "redirect"
}

export function isEmbeddedPaymentCheckout(
  checkout: PaymentHostedCheckout,
): checkout is PaymentEmbeddedCheckout {
  return checkout.kind === "embedded"
}

export function paymentCheckoutHandoff(checkout: PaymentHostedCheckout): PaymentCheckoutHandoff {
  return isEmbeddedPaymentCheckout(checkout) ? "embedded" : "redirect"
}

/**
 * The URL to send the shopper to, or null when the handoff carries no URL.
 *
 * Callers that can only redirect use this instead of reaching for `url`, so an
 * embedded arm degrades to "nowhere to send them" rather than a type error.
 */
export function paymentCheckoutRedirectUrl(
  checkout: PaymentHostedCheckout | null | undefined,
): string | null {
  if (!checkout || !isRedirectPaymentCheckout(checkout)) return null
  return checkout.url
}

/** The handoffs an adapter's declared capabilities can actually produce. */
export function supportedPaymentCheckoutHandoffs(
  capabilities: PaymentAdapterCapabilities,
): PaymentCheckoutHandoff[] {
  const supported: PaymentCheckoutHandoff[] = []
  if (capabilities.hostedCheckout || capabilities.redirectCheckout) supported.push("redirect")
  if (capabilities.embeddedCheckout) supported.push("embedded")
  return supported
}

/**
 * The handoffs the caller declared it can render, in preference order.
 *
 * Omitting `acceptedCheckoutHandoffs` means `["redirect"]`. A caller that has
 * not opted in must never be handed an arm it cannot mount, so silence is the
 * conservative answer rather than "anything goes".
 */
export function acceptedPaymentCheckoutHandoffs(
  input: Pick<PaymentInitiationInput, "acceptedCheckoutHandoffs">,
): PaymentCheckoutHandoff[] {
  const accepted = input.acceptedCheckoutHandoffs
  if (!accepted || accepted.length === 0) return ["redirect"]
  const seen = new Set<PaymentCheckoutHandoff>()
  for (const handoff of accepted) {
    if (PAYMENT_CHECKOUT_HANDOFFS.includes(handoff)) seen.add(handoff)
  }
  return accepted.filter((handoff) => seen.delete(handoff))
}

/**
 * The handoff an adapter should produce for this caller: the caller's first
 * preference the adapter can serve, or null when the two cannot agree.
 */
export function negotiatePaymentCheckoutHandoff(
  capabilities: PaymentAdapterCapabilities,
  input: Pick<PaymentInitiationInput, "acceptedCheckoutHandoffs">,
): PaymentCheckoutHandoff | null {
  const supported = supportedPaymentCheckoutHandoffs(capabilities)
  return (
    acceptedPaymentCheckoutHandoffs(input).find((handoff) => supported.includes(handoff)) ?? null
  )
}

export interface PaymentAdapterDiagnostics {
  status: "ok" | "degraded" | "down"
  checkedAt: string
  message?: string
  details?: Record<string, unknown>
}

/**
 * The transport-safe error shape rejected by adapter methods.
 *
 * Implementations may use their own Error subclass, but conformance requires
 * these fields so callers can fail closed without parsing provider messages.
 */
export interface PaymentAdapterError {
  code: PaymentAdapterErrorCode
  message: string
  retryable: boolean
  details?: Record<string, unknown>
}

export function isPaymentAdapterError(error: unknown): error is PaymentAdapterError {
  if (!error || typeof error !== "object") return false
  const candidate = error as Partial<PaymentAdapterError>
  return (
    typeof candidate.message === "string" &&
    candidate.message.trim().length > 0 &&
    typeof candidate.retryable === "boolean" &&
    PAYMENT_ADAPTER_ERROR_CODES.includes(candidate.code as PaymentAdapterErrorCode) &&
    (candidate.details === undefined ||
      (Boolean(candidate.details) &&
        typeof candidate.details === "object" &&
        !Array.isArray(candidate.details)))
  )
}

export interface PaymentInitiationInput {
  paymentSessionId: string
  money: PaymentMoney
  /**
   * What the shopper is being asked to pay for, in `locale`. A hosted-checkout
   * provider renders this as the line item, and it is the only product-shaped
   * field on this contract — a caller that sends an internal identifier here
   * leaves the provider nothing else to show.
   */
  description?: string
  /**
   * BCP 47 tag for the language the shopper has been reading the funnel in.
   * A hosted provider renders its page in this language instead of guessing
   * from the browser. Absent when the caller has no locale to state.
   */
  locale?: string
  returnUrl?: string
  cancelUrl?: string
  captureMode?: PaymentCaptureMode
  /**
   * The checkout handoffs this caller can render, most-preferred first.
   * Omitted means `["redirect"]` — see `acceptedPaymentCheckoutHandoffs`.
   */
  acceptedCheckoutHandoffs?: readonly PaymentCheckoutHandoff[]
  idempotencyKey: string
  customer?: {
    /**
     * Opaque, stable reference to the runtime's own customer record. A
     * provider binds a stored customer — and therefore a stored payment
     * method — to this rather than to `email`, which is neither unique to a
     * person nor stable when it is corrected. Not addressable, not parseable,
     * and carries no personal data, so a provider may retain it without
     * retaining the rest of `customer`.
     *
     * Stable for a given customer across payment sessions. The remaining
     * fields are prefill a provider may forget.
     */
    reference?: string | null
    email?: string | null
    phone?: string | null
    firstName?: string | null
    lastName?: string | null
  }
  shipping?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface PaymentInitiationResult {
  processorSessionId?: string | null
  processorPaymentId?: string | null
  processorIdentity?: PaymentProcessorIdentity
  checkout?: PaymentHostedCheckout | null
  nextState: PaymentSessionState
  idempotencyKey: string
  raw?: unknown
}

export interface PaymentOperationInput {
  paymentSessionId: string
  processorSessionId?: string | null
  processorPaymentId?: string | null
  processorIdentity?: PaymentProcessorIdentity
  money?: PaymentMoney
  reason?: string
  idempotencyKey: string
}

export interface PaymentOperationResult {
  status: PaymentOperationStatus
  nextState?: PaymentSessionState
  processorIdentity?: PaymentProcessorIdentity
  processorReference?: string | null
  retryAfterSeconds?: number
  raw?: unknown
}

export interface PaymentStatusInput {
  paymentSessionId: string
  processorSessionId?: string | null
  processorPaymentId?: string | null
  processorIdentity?: PaymentProcessorIdentity
}

export interface PaymentStatusResult {
  nextState: PaymentSessionState
  processorSessionId?: string | null
  processorPaymentId?: string | null
  processorIdentity?: PaymentProcessorIdentity
  money?: PaymentMoney
  raw?: unknown
}

export interface PaymentCallbackRequest {
  headers: Readonly<Record<string, string | string[] | undefined>>
  rawBody: string | Uint8Array
  parsedBody?: unknown
  receivedAt: string
  connectionId?: string | null
}

export interface PaymentCallbackEvent {
  eventId: string
  paymentSessionId: string
  nextState: PaymentSessionState
  occurredAt: string
  processorSessionId?: string | null
  processorPaymentId?: string | null
  processorIdentity?: PaymentProcessorIdentity
  money?: PaymentMoney
  idempotencyKey: string
  raw?: unknown
}

export type PaymentCallbackVerificationResult =
  | { verified: true; event: PaymentCallbackEvent }
  | { verified: false; reason: "missing_signature" | "invalid_signature" | "malformed" | "replay" }

export interface PaymentAdapterRuntimeContext {
  env: Readonly<Record<string, unknown>>
  now?: () => Date
}

export interface PaymentAdapter {
  readonly id: string
  readonly label: string
  readonly contractVersion: typeof PAYMENT_ADAPTER_CONTRACT_VERSION
  readonly mode: PaymentAdapterMode
  readonly capabilities: PaymentAdapterCapabilities
  initiate(
    context: PaymentAdapterRuntimeContext,
    input: PaymentInitiationInput,
  ): Promise<PaymentInitiationResult>
  verifyCallback(
    context: PaymentAdapterRuntimeContext,
    request: PaymentCallbackRequest,
  ): Promise<PaymentCallbackVerificationResult>
  health(context: PaymentAdapterRuntimeContext): Promise<PaymentAdapterDiagnostics>
  authorize?(
    context: PaymentAdapterRuntimeContext,
    input: PaymentOperationInput,
  ): Promise<PaymentOperationResult>
  capture?(
    context: PaymentAdapterRuntimeContext,
    input: PaymentOperationInput,
  ): Promise<PaymentOperationResult>
  void?(
    context: PaymentAdapterRuntimeContext,
    input: PaymentOperationInput,
  ): Promise<PaymentOperationResult>
  refund?(
    context: PaymentAdapterRuntimeContext,
    input: PaymentOperationInput,
  ): Promise<PaymentOperationResult>
  status?(
    context: PaymentAdapterRuntimeContext,
    input: PaymentStatusInput,
  ): Promise<PaymentStatusResult>
}

function requireCapabilityMethod(
  adapter: PaymentAdapter,
  capability: keyof Pick<
    PaymentAdapterCapabilities,
    "authorize" | "capture" | "void" | "refund" | "status"
  >,
) {
  if (adapter.capabilities[capability] && typeof adapter[capability] !== "function") {
    throw new Error(
      `Payment adapter ${adapter.id} declares ${capability} but does not implement it.`,
    )
  }
}

export const paymentAdapterRuntimePort = definePort<PaymentAdapter>({
  id: PAYMENT_ADAPTER_RUNTIME_PORT_ID,
  test(adapter) {
    if (!adapter || typeof adapter !== "object") {
      throw new Error("Payment adapter provider must be an object.")
    }
    if (adapter.contractVersion !== PAYMENT_ADAPTER_CONTRACT_VERSION) {
      throw new Error(`Payment adapter must implement ${PAYMENT_ADAPTER_CONTRACT_VERSION}.`)
    }
    if (!adapter.id || adapter.id.trim() !== adapter.id) {
      throw new Error("Payment adapter must declare a stable non-empty id.")
    }
    if (typeof adapter.initiate !== "function") {
      throw new Error("Payment adapter must implement initiate().")
    }
    if (typeof adapter.verifyCallback !== "function") {
      throw new Error("Payment adapter must implement verifyCallback().")
    }
    if (typeof adapter.health !== "function") {
      throw new Error("Payment adapter must implement health().")
    }
    for (const capability of ["authorize", "capture", "void", "refund", "status"] as const) {
      requireCapabilityMethod(adapter, capability)
    }
    if (!adapter.capabilities.callbackSignatureVerification) {
      throw new Error("Payment adapter callbacks must be signature-verified.")
    }
    if (
      adapter.capabilities.embeddedCheckout !== undefined &&
      typeof adapter.capabilities.embeddedCheckout !== "boolean"
    ) {
      throw new Error("Payment adapter capability embeddedCheckout must be boolean when declared.")
    }
  },
})

export type {
  PaymentAdapterConformanceHarness,
  PaymentAdapterConformanceResult,
  PaymentOperationConformanceFixture,
  PaymentOperationConformanceInput,
  PaymentStatusConformanceFixture,
  PaymentStatusConformanceInput,
} from "./conformance.js"
export { runPaymentAdapterConformance } from "./conformance.js"
export {
  canonicalPaymentProviderId,
  defaultPaymentProviderCatalog,
  findPaymentProviderDescriptor,
  LEGACY_VOYANT_PAYMENTS_PROVIDER_ID,
  VOYANT_PAY_PROVIDER_ID,
} from "./default-catalog.js"
export type {
  PaymentActivationInput,
  PaymentActivationResult,
  PaymentConnectInput,
  PaymentConnectionIdentity,
  PaymentConnectionReadiness,
  PaymentConnectionRequirement,
  PaymentConnectionState,
  PaymentConnectionStatus,
  PaymentConnectionSummary,
  PaymentConnectResult,
  PaymentCredentialField,
  PaymentCredentialFieldError,
  PaymentCredentialFieldKind,
  PaymentCredentialFieldOption,
  PaymentCredentialFieldSchema,
  PaymentEmbeddedOnboardingSession,
  PaymentOnboardingSetupInput,
  PaymentOnboardingSetupResult,
  PaymentProviderAvailability,
  PaymentProviderConnectionMethod,
  PaymentProviderDescriptor,
  PaymentProviderRegistry,
} from "./provider-catalog.js"
export {
  isPaymentConnectionReady,
  paymentConnectionReadiness,
  validatePaymentCredentials,
} from "./provider-catalog.js"
export type {
  RemotePaymentAdapterOptions,
  RemotePaymentCall,
  RemotePaymentMethod,
  RemotePaymentTransport,
} from "./remote-adapter.js"
export { createRemotePaymentAdapter, PAYMENT_REMOTE_NOT_IMPLEMENTED } from "./remote-adapter.js"
export {
  type ControlPlaneRemotePaymentTransportConfig,
  createControlPlaneRemotePaymentTransport,
} from "./remote-transport.js"

export {
  PAYMENT_PROVIDER_REGISTRY_RUNTIME_PORT_ID,
  type PaymentProviderRegistryContext,
  type PaymentProviderRegistryResolver,
  paymentProviderRegistryRuntimePort,
} from "./runtime-port.js"
