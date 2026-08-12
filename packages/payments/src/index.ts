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

/**
 * The lifecycle of a contested card payment.
 *
 * A chargeback is a generic commerce event: every card processor produces one,
 * a payment is contested, funds are withdrawn or held, there is a window to
 * respond, and it resolves for or against the merchant. The vocabulary here is
 * the framework's, not any processor's — an adapter maps its own stage names
 * onto these five values.
 *
 * `won`, `lost` and `withdrawn` are the resolutions; the other two are open.
 */
export const PAYMENT_DISPUTE_STATUSES = [
  "opened",
  "under_review",
  "won",
  "lost",
  "withdrawn",
] as const
export type PaymentDisputeStatus = (typeof PAYMENT_DISPUTE_STATUSES)[number]

export const PAYMENT_DISPUTE_RESOLUTIONS = ["won", "lost", "withdrawn"] as const
export type PaymentDisputeResolution = (typeof PAYMENT_DISPUTE_RESOLUTIONS)[number]

/** Whether a dispute status is terminal, and which resolution it names. */
export function paymentDisputeResolution(
  status: PaymentDisputeStatus,
): PaymentDisputeResolution | null {
  return (PAYMENT_DISPUTE_RESOLUTIONS as readonly string[]).includes(status)
    ? (status as PaymentDisputeResolution)
    : null
}

export interface PaymentMoney {
  amountMinor: number
  currency: string
}

/**
 * A dispute against a payment, as an adapter observed it.
 *
 * The framework records this; it never assembles or submits evidence, which is
 * processor-specific and stays behind the adapter. `evidenceSubmittedAt` is the
 * whole of what it learns about that — that something was submitted, and when.
 *
 * `processorDisputeId` is opaque and is what makes a repeated callback update
 * the dispute it already recorded instead of opening a second one. A genuinely
 * second dispute against the same payment carries a different id and becomes a
 * second record.
 */
export interface PaymentDisputeSignal {
  processorDisputeId: string
  status: PaymentDisputeStatus
  /** The contested amount, which may be less than the payment. */
  money: PaymentMoney
  openedAt: string
  /** The processor's deadline to respond, where it supplies one. */
  respondBy?: string | null
  /** The processor's own reason label. Recorded verbatim, never parsed. */
  reasonCode?: string | null
  resolvedAt?: string | null
  evidenceSubmittedAt?: string | null
}

/**
 * What a shopper has authorized a stored instrument to be used for.
 *
 * These are two distinct permissions under card network rules, granted in
 * different ways, so an adapter that collapses them into one flag cannot be
 * compliant for either.
 *
 * `merchant_initiated` covers charging the instrument while the shopper is
 * away — a scheduled balance payment, say. It is authorized by the merchant's
 * own terms, which the shopper accepts at checkout, and needs no control beside
 * the payment field.
 *
 * `shopper_reselect` covers showing the instrument back to the shopper so they
 * can choose it on a later checkout. That is a specific purpose and needs
 * explicit consent for it, collected wherever the payment details are entered.
 *
 * Neither implies the other, and an operator viewing their own customer record
 * is neither: that is the merchant reading their own books, not a reuse.
 */
export const PAYMENT_INSTRUMENT_REUSES = ["merchant_initiated", "shopper_reselect"] as const
export type PaymentInstrumentReuse = (typeof PAYMENT_INSTRUMENT_REUSES)[number]

/**
 * Whether a stored instrument can still be used, and if not, why.
 *
 * `requires_new_agreement` is the one that is easy to miss. When a card is
 * reissued its brand can change, and the agreement the shopper gave no longer
 * covers the instrument that replaced it, so merchant-initiated use has to stop
 * until a new agreement exists. It is not expired and not revoked — the
 * instrument works, the permission does not.
 */
export const PAYMENT_INSTRUMENT_STATUSES = [
  "usable",
  "requires_new_agreement",
  "expired",
  "revoked",
] as const
export type PaymentInstrumentStatus = (typeof PAYMENT_INSTRUMENT_STATUSES)[number]

/**
 * An instrument a provider has stored for a customer, as the adapter reports
 * it.
 *
 * `token` is opaque and is the only field that can charge anything. Everything
 * else is display data the framework shows an operator or a shopper, so a
 * provider that cannot supply a field omits it rather than inventing one. No
 * field here ever carries a full instrument number.
 *
 * The same token reported twice is the same instrument: that is what makes a
 * replayed callback update the record it already wrote instead of creating a
 * second one.
 */
export interface PaymentStoredInstrument {
  /** Opaque provider reference. The only field that can initiate a charge. */
  token: string
  /**
   * What the shopper actually authorized, which is not necessarily what the
   * caller asked for. An empty list means the instrument was stored but may not
   * be reused, which is a real outcome rather than a malformed one: the
   * merchant may still show it on their own records.
   */
  authorizedReuses: readonly PaymentInstrumentReuse[]
  status?: PaymentInstrumentStatus
  /**
   * The provider's own customer record this instrument hangs off, where the
   * provider has one. Opaque, and only meaningful to the adapter that issued
   * it.
   */
  customerReference?: string | null
  /**
   * Stable across re-entry of the same underlying instrument, where the
   * provider supplies it. Lets a caller recognize that a shopper has re-added
   * a card it already holds rather than accumulating duplicates.
   */
  fingerprint?: string | null
  /** "visa", "mastercard", "bank_transfer", … Recorded verbatim, never parsed. */
  brand?: string | null
  /** Last four digits, for instruments that have them. */
  last4?: string | null
  holderName?: string | null
  /** 1-12. */
  expMonth?: number | null
  expYear?: number | null
}

/** Whether a stored instrument may be put to a given use. */
export function paymentInstrumentAllows(
  instrument: Pick<PaymentStoredInstrument, "authorizedReuses" | "status">,
  reuse: PaymentInstrumentReuse,
): boolean {
  if (instrument.status !== undefined && instrument.status !== "usable") return false
  return instrument.authorizedReuses.includes(reuse)
}

/**
 * What the caller authorizes for the instrument this payment uses.
 *
 * The asymmetry between the two fields is deliberate and reflects who knows
 * what. Whether the shopper accepted terms permitting merchant-initiated
 * payments is a fact the caller already holds, so it states it. Whether the
 * shopper will consent to being shown the instrument again is not knowable
 * until they are asked, and they have to be asked on the surface that takes the
 * payment details — so the caller grants permission to ask, and learns the
 * answer from `PaymentStoredInstrument.authorizedReuses`.
 */
export interface PaymentInstrumentStorageIntent {
  /**
   * Whether the shopper has accepted terms authorizing payments initiated on
   * their behalf while they are away. False means the instrument may still be
   * stored, but only for the merchant's own records.
   */
  merchantInitiated: boolean
  /**
   * Whether the adapter may offer to keep the instrument for the shopper to
   * choose again later. Absent means do not offer, so an instrument is never
   * silently made re-selectable.
   */
  offerShopperReselect?: boolean
  /**
   * The caller's record of the agreement that authorizes `merchantInitiated`,
   * carried so the two can be reconciled later. Keeping a record of that
   * agreement is a requirement in its own right, and this is the handle to it.
   */
  agreementReference?: string | null
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
  /**
   * Storing the shopper's instrument for later reuse. Optional for the same
   * reason as `embeddedCheckout`: absent is the same fact as `false`, so an
   * adapter written against an earlier revision keeps compiling and keeps its
   * meaning.
   */
  storeInstrument?: boolean
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

/**
 * The storage an adapter should actually attempt for this caller, or null when
 * it should attempt none.
 *
 * Null covers three different situations that all mean the same thing to an
 * adapter, which is why they collapse here rather than at each call site: the
 * caller asked for nothing, the adapter cannot store instruments, or the caller
 * asked for something that authorizes no reuse at all and grants no permission
 * to ask for one. That last case is worth storing nothing for — an instrument
 * kept with no authorized use is a liability rather than a feature.
 */
export function negotiatePaymentInstrumentStorage(
  capabilities: PaymentAdapterCapabilities,
  input: Pick<PaymentInitiationInput, "storeInstrument">,
): PaymentInstrumentStorageIntent | null {
  const intent = input.storeInstrument
  if (!intent || !capabilities.storeInstrument) return null
  if (!intent.merchantInitiated && !intent.offerShopperReselect) return null
  return intent
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
  /**
   * Keep the instrument this payment uses, and what it may later be used for.
   *
   * Absent means store nothing, so a caller written against an earlier revision
   * of this contract keeps its behavior exactly. An adapter whose capabilities
   * do not include `storeInstrument` ignores this rather than failing: the
   * payment is the point, and storage is an addition to it.
   */
  storeInstrument?: PaymentInstrumentStorageIntent
  shipping?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface PaymentInitiationResult {
  processorSessionId?: string | null
  processorPaymentId?: string | null
  processorIdentity?: PaymentProcessorIdentity
  checkout?: PaymentHostedCheckout | null
  nextState: PaymentSessionState
  /**
   * Present only when an instrument was genuinely stored. A caller that asked
   * for storage and receives nothing here learns that it did not happen,
   * without having to reconcile a request against an outcome.
   *
   * Rarely present on initiation, because most handoffs store the instrument at
   * confirmation rather than at initiation. It exists here for the providers
   * that can answer immediately.
   */
  storedInstrument?: PaymentStoredInstrument | null
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
  /**
   * The instrument stored for this payment, where one was. Carried here as well
   * as on the callback because status is the backstop for a shopper who closed
   * the tab: a poll has to be able to learn everything the callback would have
   * delivered, or the two paths converge on different records.
   */
  storedInstrument?: PaymentStoredInstrument | null
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
  /**
   * A dispute this event opens or advances.
   *
   * A chargeback does not move the payment's own lifecycle — the money was
   * taken and the session stays `paid` — so a dispute callback reports the
   * session's current state in `nextState` and puts what changed here.
   */
  dispute?: PaymentDisputeSignal
  /**
   * An instrument this event stores, or whose usability it changes.
   *
   * Like a dispute, this does not move the payment's own lifecycle: a card
   * reissued long after the payment settled reports the session's current state
   * in `nextState` and puts what changed here. A caller keys on
   * `PaymentStoredInstrument.token` so the second report about an instrument
   * updates the first rather than duplicating it.
   */
  storedInstrument?: PaymentStoredInstrument
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
    if (
      adapter.capabilities.storeInstrument !== undefined &&
      typeof adapter.capabilities.storeInstrument !== "boolean"
    ) {
      throw new Error("Payment adapter capability storeInstrument must be boolean when declared.")
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
